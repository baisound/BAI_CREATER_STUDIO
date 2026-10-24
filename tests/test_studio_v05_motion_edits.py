"""MOTION-010 stage A storage safety, separate from the real PMX browser test."""
import json
import uuid
from pathlib import Path

import pytest

from studio_v05_motion_edits import MotionEditError, read, _record, _settings, _key


def project(tmp_path):
    project_id = str(uuid.uuid4())
    catalog = tmp_path / 'catalog.json'
    catalog.write_text(json.dumps({'schema': 1, 'projects': [{'id': project_id, 'name': 'FK test'}]}),
                       encoding='utf-8')
    return project_id, catalog


def test_missing_store_is_project_scoped_and_not_written(tmp_path):
    project_id, catalog = project(tmp_path)
    root = tmp_path / 'edits'
    result = read(root, catalog, project_id)
    assert result == {'schema': 1, 'project_id': project_id, 'revision': 0,
                      'layers': [], 'history': {'undo': [], 'redo': []}}
    assert not root.exists()
    with pytest.raises(MotionEditError, match='Project not found'):
        read(root, catalog, str(uuid.uuid4()))


@pytest.mark.parametrize('contents', ['{broken',
    json.dumps({'schema': 1, 'project_id': 'wrong', 'revision': 0,
                'layers': [], 'history': {'undo': [], 'redo': []}}),
    json.dumps({'schema': 1, 'project_id': 'REPLACE', 'revision': 0,
                'layers': [], 'history': {'undo': [], 'redo': []}})])
def test_corrupt_store_preserves_original_bytes(tmp_path, contents):
    project_id, catalog = project(tmp_path)
    root = tmp_path / 'edits'
    root.mkdir()
    file = root / (project_id + '.json')
    file.write_text(contents.replace('REPLACE', project_id), encoding='utf-8')
    before = file.read_bytes()
    if 'REPLACE' in contents:
        # Unknown fields cannot be silently discarded on read.
        payload = json.loads(file.read_text(encoding='utf-8'))
        payload['unexpected'] = 1
        file.write_text(json.dumps(payload), encoding='utf-8')
        before = file.read_bytes()
    with pytest.raises(MotionEditError):
        read(root, catalog, project_id)
    assert file.read_bytes() == before


def test_layer_interval_defaults_preserve_old_schema_and_reject_invalid_values():
    project_id = str(uuid.uuid4())
    layer = {'id': str(uuid.uuid4()), 'instance_id': str(uuid.uuid4()),
             'clip_id': str(uuid.uuid4()), 'model_asset_id': 'pmx', 'motion_asset_id': 'vmd',
             'model_sha256': 'a' * 64, 'motion_sha256': 'b' * 64,
             'fps': 60, 'start': 2, 'duration': 4,
             'name': 'FK補正', 'weight': 1.0, 'muted': False,
             'keys': [{'frame': 180, 'bone': '頭', 'rotation': [0, 0, 0, 1]}]}
    record = {'schema': 1, 'project_id': project_id, 'revision': 0,
              'layers': [layer], 'history': {'undo': [], 'redo': []}}
    _record(record, project_id)
    assert _settings(layer)['start_frame'] == 120
    assert _settings(layer)['end_frame'] == 360
    layer.update(start_frame=150, end_frame=200, fade_in_frames=10, fade_out_frames=10)
    _record(record, project_id)
    layer['fade_out_frames'] = 41
    with pytest.raises(MotionEditError, match='settings'):
        _record(record, project_id)
    layer['fade_out_frames'] = 10
    layer['weight'] = True
    with pytest.raises(MotionEditError, match='settings'):
        _record(record, project_id)


def test_fk_position_delta_preserves_rotation_only_keys_and_rejects_invalid_values():
    legacy = {'frame': 240, 'bone': '頭', 'rotation': [0, 0, 0, 1]}
    assert _key(legacy) == legacy
    assert _key({**legacy, 'position': [0.5, -1, 0]})['position'] == [0.5, -1.0, 0.0]
    for position in ([float('nan'), 0, 0], [100001, 0, 0], [True, 0, 0], [0, 0]):
        with pytest.raises(MotionEditError, match='position'):
            _key({**legacy, 'position': position})
