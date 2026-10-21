import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from project_state_bundle import validate_bundle, save_bundle, read_bundle
from bai_camera import DEFAULT


class ProjectStateBundleTest(TestCase):
    def setUp(self):
        self.combination={'schema':1,'timeline':[{'name':'walk'}], 'history':[], 'cursor':-1}
        self.bundle={'schema':1,'combination':self.combination,'camera':DEFAULT}

    def test_roundtrip(self):
        with TemporaryDirectory() as tmp:
            project=Path(tmp)/'comb.json';camera=Path(tmp)/'camera.json'
            save_bundle(project,camera,self.bundle)
            got=read_bundle(project,camera)
            self.assertTrue(got['complete'])
            self.assertEqual(got['combination'],self.combination)
            self.assertEqual(len(got['camera']['keys']),2)

    def test_invalid_camera_does_not_touch_existing_files(self):
        with TemporaryDirectory() as tmp:
            project=Path(tmp)/'comb.json';camera=Path(tmp)/'camera.json'
            save_bundle(project,camera,self.bundle)
            before=(project.read_bytes(),camera.read_bytes())
            bad=json.loads(json.dumps(self.bundle));bad['camera']['fps']=-1
            with self.assertRaises(ValueError):save_bundle(project,camera,bad)
            self.assertEqual(before,(project.read_bytes(),camera.read_bytes()))

    def test_unknown_state_rejected_instead_of_silent_loss(self):
        bad={**self.bundle,'model':'ignored'}
        with self.assertRaisesRegex(ValueError,'unsupported'):validate_bundle(bad)

    def test_missing_combination_not_reported_complete(self):
        with TemporaryDirectory() as tmp:
            data=read_bundle(Path(tmp)/'missing.json',Path(tmp)/'missing_camera.json')
            self.assertFalse(data['complete'])

    def test_workspace_roundtrip(self):
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            bundle={**self.bundle, 'workspace': {'asset':'model.glb','clip':0,'frame':20}}
            save_bundle(cp,cam,bundle)
            self.assertEqual(read_bundle(cp,cam)['workspace'],bundle['workspace'])

    def test_reject_invalid_workspace_without_write(self):
        with TemporaryDirectory() as tmp:
            cp,cam=Path(tmp)/'comb.json',Path(tmp)/'camera.json'
            valid={**self.bundle,'workspace':{'asset':'a.vrm','clip':None,'frame':8}}
            save_bundle(cp,cam,valid)
            before=(cp.read_bytes(),cam.read_bytes(),cp.with_suffix('.workspace.json').read_bytes())
            invalid={**self.bundle,'workspace':{'asset':'../unsafe.glb','clip':0,'frame':10}}
            with self.assertRaises(ValueError):save_bundle(cp,cam,invalid)
            self.assertEqual(before,(cp.read_bytes(),cam.read_bytes(),cp.with_suffix('.workspace.json').read_bytes()))

    def test_old_bundle_still_valid(self):
        self.assertNotIn('workspace',validate_bundle(self.bundle))

    def test_camera_write_failure_preserves_existing_bundle(self):
        from unittest.mock import patch
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            initial={**self.bundle,'workspace':{'asset':'original.glb','clip':0,'frame':4}}
            save_bundle(cp,cam,initial)
            paths=[cp,cam,cp.with_suffix('.workspace.json')]
            original=[p.read_bytes() for p in paths]
            updated={**self.bundle,'workspace':{'asset':'new.glb','clip':0,'frame':9}}
            with patch('bai_camera.save',side_effect=OSError('camera write failed')):
                with self.assertRaisesRegex(OSError,'camera write failed'):
                    save_bundle(cp,cam,updated)
            self.assertEqual(original,[p.read_bytes() for p in paths])
            self.assertFalse(cp.with_suffix('.bundle-tmp').exists())
            self.assertFalse(cp.with_suffix('.workspace-tmp').exists())

    def test_combination_replace_failure_rolls_back_camera_workspace(self):
        from unittest.mock import patch
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            initial={**self.bundle,'workspace':{'asset':'old.glb','clip':0,'frame':4}}
            save_bundle(cp,cam,initial)
            paths=[cp,cam,cp.with_suffix('.workspace.json')]
            original=[p.read_bytes() for p in paths]
            updated={**self.bundle,'workspace':{'asset':'new.glb','clip':0,'frame':9}}
            real_replace=Path.replace
            def fail_bundle_replace(self, dest):
                if self == cp.with_suffix('.bundle-tmp'):
                    raise OSError('combination rename failed')
                return real_replace(self,dest)
            with patch.object(Path,'replace',fail_bundle_replace):
                with self.assertRaisesRegex(OSError,'combination rename failed'):
                    save_bundle(cp,cam,updated)
            self.assertEqual(original,[p.read_bytes() for p in paths])
            self.assertFalse(cp.with_suffix('.bundle-tmp').exists())
            self.assertFalse(cp.with_suffix('.workspace-tmp').exists())


class WorkspaceCharacterTest(TestCase):
    """Issue #50: the old asset filename and new four-format IDs share one workspace field."""

    def setUp(self):
        self.base = {'schema': 1, 'combination': {'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}, 'camera': DEFAULT}
        self.placement = {'position': [1, 2, -3], 'rotation': [10, -20, 30], 'scale': 1.5}

    def bundle(self, asset, clip=None, **extra):
        return {**self.base, 'workspace': {'frame': 0, 'asset': asset, 'clip': clip, **extra}}

    def test_four_formats_and_legacy_filenames_roundtrip(self):
        for asset, clip in [('legacy.glb', 0), ('legacy.vrm', None), ('integrated:x.glb', 2),
                            ('integrated:x.vrm', None), ('integrated:x.fbx', None),
                            ('mmd:A:model/test.pmx', None), ('mmd:B:test.pmx', None), ('fbx:12', None)]:
            with self.subTest(asset=asset), TemporaryDirectory() as tmp:
                cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
                save_bundle(cp, cam, self.bundle(asset, clip, character=self.placement))
                got = read_bundle(cp, cam)['workspace']
                self.assertEqual((got['asset'], got['clip']), (asset, clip))
                self.assertEqual(got['character'], {'position': [1.0, 2.0, -3.0], 'rotation': [10.0, -20.0, 30.0], 'scale': 1.5})

    def test_invalid_id_clip_and_transform_are_rejected(self):
        bad_assets = ('../x.glb', 'integrated:../x.glb', 'mmd:C:x.pmx', 'mmd:A:../x.pmx',
                      'fbx:../x', 'unregistered.obj', 'integrated:x.pmx')
        for asset in bad_assets:
            with self.subTest(asset=asset), self.assertRaises(ValueError):
                validate_bundle(self.bundle(asset))
        with self.assertRaisesRegex(ValueError, 'clip requires a GLB/VRM'):
            validate_bundle(self.bundle('mmd:A:test.pmx', 0))
        for placement in ({**self.placement, 'scale': 0}, {**self.placement, 'position': [float('nan'), 0, 0]},
                          {**self.placement, 'rotation': [0, 361, 0]}, {**self.placement, 'extra': 1}):
            with self.subTest(placement=placement), self.assertRaises(ValueError):
                validate_bundle(self.bundle('fbx:12', character=placement))

    def test_old_camera_save_keeps_character_transform(self):
        with TemporaryDirectory() as tmp:
            cp, cam = Path(tmp)/'comb.json', Path(tmp)/'camera.json'
            save_bundle(cp, cam, self.bundle('legacy.glb', 0, character=self.placement))
            save_bundle(cp, cam, self.bundle('legacy.glb', 0))
            self.assertEqual(read_bundle(cp, cam)['workspace']['character']['position'], [1.0, 2.0, -3.0])
            save_bundle(cp, cam, self.bundle('legacy.glb', 0, character=None))
            self.assertNotIn('character', read_bundle(cp, cam)['workspace'])


class WorkspaceStageTest(TestCase):
    """B-4（P2 設計 §1.15）：workspace.stage の保存先。"""
    STAGE = {'asset': 'integrated:stage.glb', 'position': [3, 0, -1.5], 'rotation': [0, 90, 0], 'scale': 2}

    def setUp(self):
        self.combination = {'schema': 1, 'timeline': [{'name': 'walk'}], 'history': [], 'cursor': -1}
        self.bundle = {'schema': 1, 'combination': self.combination, 'camera': DEFAULT}

    def ws(self, **extra):
        return {**self.bundle, 'workspace': {'asset': 'a.glb', 'clip': None, 'frame': 0, **extra}}

    def files(self, tmp):
        cp, cam = Path(tmp) / 'comb.json', Path(tmp) / 'camera.json'
        return cp, cam, cp.with_suffix('.workspace.json')

    def test_stage_roundtrip(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws(stage=self.STAGE))
            got = read_bundle(cp, cam)['workspace']
            self.assertEqual(got['stage'], {'asset': 'integrated:stage.glb', 'position': [3.0, 0.0, -1.5], 'rotation': [0.0, 90.0, 0.0], 'scale': 2.0})
            self.assertEqual({k: got[k] for k in ('frame', 'asset', 'clip')}, {'frame': 0, 'asset': 'a.glb', 'clip': None})

    def test_stage_accepts_every_asset_prefix_and_keeps_nonzero_x_z_rotation(self):
        for asset in ('integrated:a.glb', 'mmd:A:model/test.pmx', 'mmd:B:x.pmx', 'fbx:12', 'library:' + 'a' * 24):
            stage = {**self.STAGE, 'asset': asset, 'rotation': [10, 20, -30]}
            self.assertEqual(validate_bundle(self.ws(stage=stage))['workspace']['stage']['rotation'], [10.0, 20.0, -30.0])

    def test_stage_without_character_is_valid(self):
        b = {**self.bundle, 'workspace': {'asset': '', 'clip': None, 'frame': 0, 'stage': self.STAGE}}
        self.assertEqual(validate_bundle(b)['workspace']['asset'], '')

    def test_invalid_stage_rejected(self):
        bad = [
            {**self.STAGE, 'extra': 1},
            {k: v for k, v in self.STAGE.items() if k != 'scale'},
            {**self.STAGE, 'asset': ''},
            {**self.STAGE, 'asset': 'other:x'},
            {**self.STAGE, 'asset': 'library:bad'},
            {**self.STAGE, 'asset': 'integrated:' + 'x' * 250},
            {**self.STAGE, 'position': [1001, 0, 0]},
            {**self.STAGE, 'position': [0, 0]},
            {**self.STAGE, 'position': [True, 0, 0]},
            {**self.STAGE, 'position': [float('nan'), 0, 0]},
            {**self.STAGE, 'rotation': [0, 361, 0]},
            {**self.STAGE, 'scale': 0.009},
            {**self.STAGE, 'scale': 100.1},
            {**self.STAGE, 'scale': True},
            {**self.STAGE, 'scale': '2'},
            'text',
        ]
        for stage in bad:
            with self.subTest(stage=stage), self.assertRaises(ValueError):
                validate_bundle(self.ws(stage=stage))

    def test_stage_range_edges_are_accepted(self):
        stage = {**self.STAGE, 'position': [-1000, 1000, 0], 'rotation': [-360, 360, 0], 'scale': 0.01}
        validate_bundle(self.ws(stage=stage))
        validate_bundle(self.ws(stage={**stage, 'scale': 100}))

    def test_unknown_workspace_key_still_rejected(self):
        with self.assertRaises(ValueError):
            validate_bundle(self.ws(model='x'))
        with self.assertRaises(ValueError):
            validate_bundle({**self.bundle, 'workspace': {'asset': '', 'frame': 0}})  # clip が無い

    def test_save_without_stage_key_keeps_existing_stage(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws(stage=self.STAGE))
            kept = read_bundle(cp, cam)['workspace']['stage']
            # 旧 camera.html の形（frame・asset・clip だけ）
            save_bundle(cp, cam, {**self.bundle, 'workspace': {'asset': 'b.vrm', 'clip': None, 'frame': 5}})
            got = read_bundle(cp, cam)['workspace']
            self.assertEqual(got['stage'], kept)
            self.assertEqual((got['asset'], got['frame']), ('b.vrm', 5))

    def test_stage_null_removes_key_from_file(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws(stage=self.STAGE))
            save_bundle(cp, cam, self.ws(stage=None))
            self.assertNotIn('stage', json.loads(wp.read_text(encoding='utf-8')))
            # その後 stage なしで保存しても現れない
            save_bundle(cp, cam, self.ws())
            self.assertNotIn('stage', json.loads(wp.read_text(encoding='utf-8')))

    def test_stage_new_value_replaces_old(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws(stage=self.STAGE))
            save_bundle(cp, cam, self.ws(stage={**self.STAGE, 'scale': 3}))
            self.assertEqual(read_bundle(cp, cam)['workspace']['stage']['scale'], 3.0)

    def test_corrupt_existing_stage_blocks_save_and_writes_nothing(self):
        for broken in ('{"frame":0,"asset":"a.glb","clip":null,"stage":{"asset":"zzz"}}', '{not json', '[]'):
            with self.subTest(broken=broken), TemporaryDirectory() as tmp:
                cp, cam, wp = self.files(tmp)
                save_bundle(cp, cam, self.ws())
                wp.write_text(broken, encoding='utf-8')
                before = (cp.read_bytes(), cam.read_bytes(), wp.read_bytes())
                with self.assertRaises(ValueError):
                    save_bundle(cp, cam, {**self.bundle, 'workspace': {'asset': 'b.vrm', 'clip': None, 'frame': 1}})
                self.assertEqual(before, (cp.read_bytes(), cam.read_bytes(), wp.read_bytes()))

    def test_corrupt_existing_stage_does_not_block_explicit_stage(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws())
            wp.write_text('{not json', encoding='utf-8')
            save_bundle(cp, cam, self.ws(stage=None))  # 利用者が stage を明示したときは既存を見ない
            self.assertEqual(read_bundle(cp, cam)['workspace'], {'frame': 0, 'asset': 'a.glb', 'clip': None})

    def test_bundle_without_workspace_deletes_workspace_file(self):
        with TemporaryDirectory() as tmp:
            cp, cam, wp = self.files(tmp)
            save_bundle(cp, cam, self.ws(stage=self.STAGE))
            save_bundle(cp, cam, self.bundle)
            self.assertFalse(wp.exists())
