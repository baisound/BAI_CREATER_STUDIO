import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from bai_camera import DEFAULT
from project_state_bundle import read_bundle, save_bundle, validate_bundle
from scene_lighting import validate_lights


KEY = {'frame': 0, 'position': [-3, 4, 2], 'rotation': [-40, -45, 0],
       'rgb': [200, 230, 255], 'intensity': 2.5, 'distance': 0, 'angle': 45,
       'penumbra': 0.4, 'enabled': True}
LIGHTS = {'schema': 1, 'items': [{'id': 'key', 'name': '左キー', 'type': 'directional',
                                 'keys': [KEY, {**KEY, 'frame': 30, 'rgb': [255, 80, 80], 'position': [1, 3, 2]}]}]}


class SceneLightingTest(TestCase):
    def setUp(self):
        self.bundle = {'schema': 1,
                       'combination': {'schema': 1, 'timeline': [], 'history': [], 'cursor': -1},
                       'camera': DEFAULT}

    def ws(self, **extra):
        return {**self.bundle, 'workspace': {'frame': 0, 'asset': '', 'clip': None, **extra}}

    def test_lights_roundtrip_and_old_writer_preserves_them(self):
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp) / 'project.json', Path(tmp) / 'camera.json'
            save_bundle(cp, cam, self.ws(lights=LIGHTS))
            assert read_bundle(cp, cam)['workspace']['lights']['items'][0]['keys'][1]['rgb'] == [255, 80, 80]
            save_bundle(cp, cam, self.ws())
            assert read_bundle(cp, cam)['workspace']['lights']['items'][0]['name'] == '左キー'
            save_bundle(cp, cam, self.ws(lights={'schema': 1, 'items': []}))
            assert read_bundle(cp, cam)['workspace']['lights']['items'] == []
            save_bundle(cp, cam, self.ws(lights=None))
            assert 'lights' not in read_bundle(cp, cam)['workspace']

    def test_corrupt_existing_lights_prevents_legacy_save(self):
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp) / 'project.json', Path(tmp) / 'camera.json'
            save_bundle(cp, cam, self.ws(lights=LIGHTS))
            wp = cp.with_suffix('.workspace.json')
            broken = json.loads(wp.read_text(encoding='utf8'))
            broken['lights']['items'][0]['keys'][0]['rgb'] = [-1, 2, 3]
            wp.write_text(json.dumps(broken), encoding='utf8')
            before = [x.read_bytes() for x in (cp, cam, wp)]
            with self.assertRaisesRegex(ValueError, 'lights'):
                save_bundle(cp, cam, self.ws())
            self.assertEqual(before, [x.read_bytes() for x in (cp, cam, wp)])

    def test_validation_rejects_unsafe_values_and_overlong_timeline(self):
        invalid = [
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'id': '../x'}]},
            {'schema': 1, 'items': LIGHTS['items'] * 129},
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'keys': [{**KEY, 'frame': 1}]}]},
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'keys': [KEY, KEY]}]},
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'keys': [{**KEY, 'rgb': [256, 0, 0]}]}]},
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'keys': [{**KEY, 'intensity': float('nan')}]}]},
            {'schema': 1, 'items': [{**LIGHTS['items'][0], 'type': []}]},
        ]
        for value in invalid:
            with self.subTest(value=str(value)[:50]), self.assertRaises(ValueError):
                validate_lights(value)
        good = copy.deepcopy(LIGHTS)
        good['items'][0]['keys'][-1]['frame'] = self.bundle['camera']['duration'] + 1
        with self.assertRaisesRegex(ValueError, 'duration'):
            validate_bundle(self.ws(lights=good))
