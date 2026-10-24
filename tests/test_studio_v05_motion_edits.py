"""MOTION-010 stage A storage safety, separate from the real PMX browser test."""
import json
import uuid
from pathlib import Path

import pytest
import studio_v05_motion_edits as edits

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
                      'layers': [], 'fk_ik_modes': {}, 'history': {'undo': [], 'redo': []}}
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


def test_fk_ik_mode_migrates_legacy_without_keys_or_undo(tmp_path, monkeypatch):
    project_id, catalog = project(tmp_path)
    instance_id, clip_id = str(uuid.uuid4()), str(uuid.uuid4())
    root = tmp_path / 'edits'
    root.mkdir()
    legacy = {'schema': 1, 'project_id': project_id, 'revision': 3,
              'layers': [], 'history': {'undo': [], 'redo': []}}
    path = root / (project_id + '.json')
    path.write_text(json.dumps(legacy), encoding='utf-8')
    original = path.read_bytes()
    model = tmp_path / 'model.pmx'
    model.write_bytes(b'PMX fixture')
    monkeypatch.setattr(edits, '_context', lambda *args: {'model_path': model})
    monkeypatch.setattr(edits, 'parse_pmx', lambda raw: {'bones_detail': [
        {'name': '左足'}, {'name': '左足首'},
        {'name': '左足ＩＫ', 'ik': {'target_index': 1, 'links': [0]}}]})
    args = (root, tmp_path, tmp_path, tmp_path, tmp_path, catalog, project_id)
    assert read(root, catalog, project_id) == legacy
    result = edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                          clip_id=clip_id, limb='left_leg', mode='FK')
    assert result['revision'] == 4
    assert result['fk_ik_modes'] == {instance_id: {'left_leg': 'FK'}}
    assert result['layers'] == [] and not result['can_undo'] and not result['can_redo']
    assert read(root, catalog, project_id)['history'] == legacy['history']
    assert path.read_bytes() != original
    repeated = edits.mutate(*args, 4, 'mode-set', [], instance_id=instance_id,
                            clip_id=clip_id, limb='left_leg', mode='FK')
    assert repeated['revision'] == 4
    with pytest.raises(MotionEditError, match='Revision conflict'):
        edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='left_leg', mode='IK')
    with pytest.raises(MotionEditError, match='Arm IK solver'):
        edits.mutate(*args, 4, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='left_arm', mode='IK')
    restored = edits.mutate(*args, 4, 'mode-set', [], instance_id=instance_id,
                            clip_id=clip_id, limb='left_leg', mode='IK')
    assert restored['revision'] == 5
    assert restored['fk_ik_modes'][instance_id]['left_leg'] == 'IK'
    assert not restored['can_undo'] and restored['layers'] == []


def test_fk_ik_mode_invalid_file_keeps_original(tmp_path):
    project_id, catalog = project(tmp_path)
    root = tmp_path / 'edits'
    root.mkdir()
    record = {'schema': 1, 'project_id': project_id, 'revision': 0, 'layers': [],
              'fk_ik_modes': {str(uuid.uuid4()): {'left_leg': 'invalid'}},
              'history': {'undo': [], 'redo': []}}
    path = root / (project_id + '.json')
    path.write_text(json.dumps(record), encoding='utf-8')
    before = path.read_bytes()
    with pytest.raises(MotionEditError, match='unreadable'):
        read(root, catalog, project_id)
    assert path.read_bytes() == before
