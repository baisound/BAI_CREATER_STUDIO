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
    with pytest.raises(MotionEditError, match='Canonical PMX arm'):
        edits.mutate(*args, 4, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='left_arm', mode='IK')
    restored = edits.mutate(*args, 4, 'mode-set', [], instance_id=instance_id,
                            clip_id=clip_id, limb='left_leg', mode='IK')
    assert restored['revision'] == 5
    assert restored['fk_ik_modes'][instance_id]['left_leg'] == 'IK'
    assert not restored['can_undo'] and restored['layers'] == []


def test_arm_edit_mode_requires_real_chain_and_preserves_keys_and_undo(tmp_path, monkeypatch):
    project_id, catalog = project(tmp_path)
    instance_id, clip_id = str(uuid.uuid4()), str(uuid.uuid4())
    root = tmp_path / 'edits'
    model = tmp_path / 'model.pmx'
    model.write_bytes(b'PMX fixture')
    monkeypatch.setattr(edits, '_context', lambda *args: {'model_path': model})
    bones = [
        {'name': '左腕', 'parent_index': -1},
        {'name': '左腕捩', 'parent_index': 0},
        {'name': '左ひじ', 'parent_index': 1},
        {'name': '左手捩', 'parent_index': 2},
        {'name': '左手首', 'parent_index': 3},
        {'name': '右腕', 'parent_index': -1},
        {'name': '右ひじ', 'parent_index': 5},
        {'name': '右手首', 'parent_index': 6},
    ]
    monkeypatch.setattr(edits, 'parse_pmx', lambda raw: {'bones_detail': bones})
    args = (root, tmp_path, tmp_path, tmp_path, tmp_path, catalog, project_id)
    before = read(root, catalog, project_id)
    for limb, mode, revision in [('left_arm', 'IK', 0), ('right_arm', 'IK', 1),
                                  ('left_arm', 'FK', 2)]:
        after = edits.mutate(*args, revision, 'mode-set', [], instance_id=instance_id,
                             clip_id=clip_id, limb=limb, mode=mode)
        assert after['revision'] == revision + 1
        assert after['layers'] == before['layers']
        assert not after['can_undo'] and not after['can_redo']
        assert read(root, catalog, project_id)['history'] == before['history']
    assert after['fk_ik_modes'][instance_id] == {'left_arm': 'FK', 'right_arm': 'IK'}
    unchanged = edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                              clip_id=clip_id, limb='left_arm', mode='FK')
    assert unchanged['revision'] == 3
    saved = (root / (project_id + '.json')).read_bytes()
    bones[7]['parent_index'] = -1
    with pytest.raises(MotionEditError, match='arm IK chain'):
        edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='right_arm', mode='IK')
    assert (root / (project_id + '.json')).read_bytes() == saved
    bones[7]['parent_index'] = 6
    bones.append({'name': '右手IK', 'parent_index': -1,
                  'ik': {'target_index': 7, 'links': [{
                      'bone_index': 6, 'min': [-0.5, 0, 0], 'max': [0.5, 0, 0]}]}})
    with pytest.raises(MotionEditError, match='arm IK definition conflicts'):
        edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='right_arm', mode='IK')
    assert (root / (project_id + '.json')).read_bytes() == saved
    bones[-1]['ik'] = {'target_index': 0, 'links': [{'bone_index': 7}]}
    with pytest.raises(MotionEditError, match='arm IK definition conflicts'):
        edits.mutate(*args, 3, 'mode-set', [], instance_id=instance_id,
                     clip_id=clip_id, limb='right_arm', mode='IK')
    assert (root / (project_id + '.json')).read_bytes() == saved


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


def test_arm_pair_is_atomic_and_preserves_existing_position(tmp_path, monkeypatch):
    project_id, catalog = project(tmp_path)
    instance_id, clip_id = str(uuid.uuid4()), str(uuid.uuid4())
    root = tmp_path / 'edits'
    root.mkdir()
    model = tmp_path / 'model.pmx'
    model.write_bytes(b'PMX fixture')
    context = {'instance_id': instance_id, 'clip_id': clip_id,
               'model_asset_id': 'pmx', 'motion_asset_id': 'vmd',
               'model_sha256': 'a' * 64, 'motion_sha256': 'b' * 64,
               'fps': 60, 'start': 0, 'duration': 10, 'model_path': model}
    monkeypatch.setattr(edits, '_context', lambda *args: context)
    monkeypatch.setattr(edits, 'parse_pmx', lambda raw: {'bones_detail': [
        {'name': '左腕'}, {'name': '左ひじ'}, {'name': '頭'}]})
    args = (root, tmp_path, tmp_path, tmp_path, tmp_path, catalog, project_id)
    arm = {'frame': 240, 'bone': '左腕', 'rotation': [0, 0, 0, 1]}
    elbow = {'frame': 240, 'bone': '左ひじ', 'rotation': [0, 0, 0, 1]}
    original = edits.mutate(*args, 0, 'set', [], instance_id=instance_id,
                            clip_id=clip_id, key={**arm, 'position': [0.2, 0, 0]})
    assert original['revision'] == 1
    paired = edits.mutate(*args, 1, 'arm-set', [], instance_id=instance_id,
                          clip_id=clip_id, keys=[elbow, arm])
    assert paired['revision'] == 2
    assert [key['bone'] for key in paired['layers'][0]['keys']] == ['左ひじ', '左腕']
    assert next(key for key in paired['layers'][0]['keys'] if key['bone'] == '左腕')['position'] == [0.2, 0, 0]
    path = root / (project_id + '.json')
    saved_bytes = path.read_bytes()
    for invalid in ([arm], [{**arm, 'frame': 241}, elbow], [arm, arm],
                    [arm, {**elbow, 'bone': '頭'}], [arm, {**elbow, 'rotation': [0, 0, 0, 2]}]):
        with pytest.raises(MotionEditError):
            edits.mutate(*args, 2, 'arm-set', [], instance_id=instance_id,
                         clip_id=clip_id, keys=invalid)
        assert path.read_bytes() == saved_bytes
    with pytest.raises(MotionEditError, match='Revision conflict'):
        edits.mutate(*args, 1, 'arm-set', [], instance_id=instance_id,
                     clip_id=clip_id, keys=[arm, elbow])
    assert path.read_bytes() == saved_bytes
    same = edits.mutate(*args, 2, 'arm-set', [], instance_id=instance_id,
                        clip_id=clip_id, keys=[arm, elbow])
    assert same['revision'] == 2 and path.read_bytes() == saved_bytes
    undone = edits.mutate(*args, 2, 'undo', [])
    assert undone['revision'] == 3
    assert [key['bone'] for key in undone['layers'][0]['keys']] == ['左腕']
    redone = edits.mutate(*args, 3, 'redo', [])
    assert redone['revision'] == 4
    assert [key['bone'] for key in redone['layers'][0]['keys']] == ['左ひじ', '左腕']


def test_multiple_layers_require_explicit_key_target_and_remain_undoable(tmp_path, monkeypatch):
    project_id, catalog = project(tmp_path)
    instance_id, clip_id = str(uuid.uuid4()), str(uuid.uuid4())
    root = tmp_path / 'edits'
    model = tmp_path / 'model.pmx'
    model.write_bytes(b'PMX fixture')
    context = {'instance_id': instance_id, 'clip_id': clip_id,
               'model_asset_id': 'pmx', 'motion_asset_id': 'vmd',
               'model_sha256': 'a' * 64, 'motion_sha256': 'b' * 64,
               'fps': 60, 'start': 0, 'duration': 10, 'model_path': model}
    monkeypatch.setattr(edits, '_context', lambda *args: context)
    monkeypatch.setattr(edits, 'parse_pmx', lambda raw: {'bones_detail': [{'name': '頭'}]})
    monkeypatch.setattr(edits, 'view', lambda *args: read(root, catalog, project_id))
    args = (root, tmp_path, tmp_path, tmp_path, tmp_path, catalog, project_id)
    key1 = {'frame': 240, 'bone': '頭', 'rotation': [0, 0, 0, 1],
            'position': [0.01, 0, 0]}
    key2 = {**key1, 'frame': 420, 'position': [0.02, 0, 0]}
    one = edits.mutate(*args, 0, 'set', [], instance_id=instance_id,
                       clip_id=clip_id, key=key1)
    first_id = one['layers'][0]['id']
    two = edits.mutate(*args, 1, 'layer-create', [], instance_id=instance_id,
                       clip_id=clip_id, settings={'name': '後半',
                           'start_frame': 360, 'end_frame': 480,
                           'fade_in_frames': 30, 'fade_out_frames': 30})
    assert two['revision'] == 2 and len(two['layers']) == 2
    second_id = two['layers'][1]['id']
    assert two['layers'][1]['name'] == '後半'
    assert two['layers'][0]['keys'] == [key1] and two['layers'][1]['keys'] == []
    conflicting = json.loads(json.dumps(two))
    conflicting['layers'][1]['motion_sha256'] = 'c' * 64
    with pytest.raises(MotionEditError, match='Conflicting'):
        _record(conflicting, project_id)
    path = root / (project_id + '.json')
    before = path.read_bytes()
    with pytest.raises(MotionEditError, match='Layer ID required'):
        edits.mutate(*args, 2, 'set', [], instance_id=instance_id,
                     clip_id=clip_id, key=key2)
    assert path.read_bytes() == before
    with pytest.raises(MotionEditError, match='not found'):
        edits.mutate(*args, 2, 'set', [], instance_id=instance_id,
                     clip_id=clip_id, layer_id=str(uuid.uuid4()), key=key2)
    assert path.read_bytes() == before
    three = edits.mutate(*args, 2, 'set', [], instance_id=instance_id,
                         clip_id=clip_id, layer_id=second_id, key=key2)
    assert [layer['keys'] for layer in three['layers']] == [[key1], [key2]]
    four = edits.mutate(*args, 3, 'layer-update', [], instance_id=instance_id,
                        clip_id=clip_id, layer_id=first_id,
                        settings={'start_frame': 180, 'end_frame': 300,
                                  'fade_in_frames': 30, 'fade_out_frames': 30})
    assert four['layers'][0]['start_frame'] == 180
    assert four['layers'][1]['start_frame'] == 360
    solo = edits.mutate(*args, 4, 'layer-update', [], instance_id=instance_id,
                        clip_id=clip_id, layer_id=first_id, settings={'solo': True})
    assert [layer.get('solo', False) for layer in solo['layers']] == [True, False]
    switched = edits.mutate(*args, 5, 'layer-update', [], instance_id=instance_id,
                            clip_id=clip_id, layer_id=second_id, settings={'solo': True})
    assert [layer.get('solo', False) for layer in switched['layers']] == [False, True]
    assert read(root, catalog, project_id)['layers'][1]['solo'] is True
    rejected = json.loads(json.dumps(switched))
    rejected['layers'][0]['solo'] = True
    with pytest.raises(MotionEditError, match='Several solo'):
        _record(rejected, project_id)
    undone_solo = edits.mutate(*args, 6, 'undo', [])
    assert [layer.get('solo', False) for layer in undone_solo['layers']] == [True, False]
    redone_solo = edits.mutate(*args, 7, 'redo', [])
    assert [layer.get('solo', False) for layer in redone_solo['layers']] == [False, True]
    five = edits.mutate(*args, 8, 'layer-delete', [], instance_id=instance_id,
                        clip_id=clip_id, layer_id=second_id)
    assert len(five['layers']) == 1 and five['layers'][0]['id'] == first_id
    restored = edits.mutate(*args, 9, 'undo', [])
    assert len(restored['layers']) == 2 and restored['layers'][1]['keys'] == [key2]
    assert read(root, catalog, project_id)['history']['redo']
