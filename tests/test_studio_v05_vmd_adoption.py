"""MOTION-010 candidate placement keeps original assets and clip timing reversible."""
import hashlib
import json
import threading
import uuid

import pytest

import studio_v05_vmd_adoption as adoption
import studio_v05_motion_edits as edits
from studio_v05_motion_edits import MotionEditError


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _fixture(tmp_path, monkeypatch):
    project_id, instance_id, clip_id, candidate_id = [str(uuid.uuid4()) for _ in range(4)]
    catalog = tmp_path / 'catalog.json'
    catalog.write_text(json.dumps({'schema': 1, 'projects': [
        {'id': project_id, 'name': 'Adoption test'}]}), encoding='utf-8')
    data_root = tmp_path / 'data'
    mmd_root = data_root / 'mmd'
    (mmd_root / 'vmd').mkdir(parents=True)
    original = mmd_root / 'vmd' / 'original.vmd'
    original.write_bytes(b'original VMD bytes')
    model = mmd_root / 'A' / 'model.pmx'
    model.parent.mkdir()
    model.write_bytes(b'original PMX bytes')
    candidate_root = data_root / 'studio_v05_vmd_candidates'
    candidate_folder = candidate_root / project_id
    candidate_folder.mkdir(parents=True)
    candidate = candidate_folder / (candidate_id + '.vmd')
    candidate.write_bytes(b'generated VMD bytes')
    metadata_path = candidate.with_suffix('.json')
    metadata_path.write_text(json.dumps({
        'schema': 1, 'project_id': project_id, 'candidate_id': candidate_id,
        'revision': 3, 'instance_id': instance_id, 'clip_id': clip_id,
        'model_sha256': _sha(model.read_bytes()),
        'source_motion_sha256': _sha(original.read_bytes()),
        'output_sha256': _sha(candidate.read_bytes()),
        'status': 'candidate_requires_real_pmx_validation',
        'registered_asset': False, 'placed_in_project': False,
    }), encoding='utf-8')
    arrangement_root = data_root / 'studio_v05_arrangements'
    arrangement_root.mkdir()
    arrangement_file = arrangement_root / (project_id + '.json')
    arrangement_file.write_text(json.dumps({
        'schema': 1, 'project_id': project_id, 'revision': 2,
        'clips': [{'id': clip_id, 'asset_id': 'mmd:vmd:original.vmd',
                   'name': 'Original', 'category': 'motion', 'track': 'motion',
                   'lane': 1, 'start': 0, 'duration': 4,
                   'target_scene_instance_id': instance_id}],
    }), encoding='utf-8')
    edit_root = data_root / 'studio_v05_motion_edits'
    edit_root.mkdir()
    context = {'instance_id': instance_id, 'clip_id': clip_id,
               'model_asset_id': 'mmd:A:model.pmx',
               'motion_asset_id': 'mmd:vmd:original.vmd',
               'model_sha256': _sha(model.read_bytes()),
               'motion_sha256': _sha(original.read_bytes()),
               'fps': 60, 'start': 0, 'duration': 4, 'model_path': model}
    layer = {key: context[key] for key in ('instance_id', 'clip_id', 'model_asset_id',
             'motion_asset_id', 'model_sha256', 'motion_sha256', 'fps', 'start', 'duration')}
    layer.update(id=str(uuid.uuid4()), name='Test', weight=1, muted=False,
                 keys=[{'frame': 0, 'bone': '頭', 'rotation': [0, 0, 0, 1]}])
    (edit_root / (project_id + '.json')).write_text(json.dumps({
        'schema': 1, 'project_id': project_id, 'revision': 3,
        'layers': [layer], 'fk_ik_modes': {}, 'history': {'undo': [], 'redo': []},
    }), encoding='utf-8')
    monkeypatch.setattr(adoption, '_context', lambda *args: context)
    monkeypatch.setattr(adoption, 'view_edits', lambda *args: {'issues': []})
    monkeypatch.setattr(adoption, 'motion_plan', lambda *args: {'scene_revision': 5})
    monkeypatch.setattr(adoption, 'get_layout', lambda *args: {'locked': []})
    assets = [{'id': 'mmd:vmd:original.vmd', 'source': 'mmd', 'kind': 'vmd',
               'format': 'VMD', 'name': 'original.vmd', 'available': True}]
    report = {'passed': True, 'checkedFrames': 240, 'checkedVmdFrames': 120,
              'bones': 20, 'maxPosition': 0.0001, 'maxAngle': 0.001,
              'positionClock': '作品', 'positionFrame': 0, 'positionBone': '頭',
              'angleClock': 'VMD', 'angleFrame': 0, 'angleBone': '頭'}
    args = (candidate_root, edit_root, data_root, data_root / 'scene',
            data_root / 'legacy', arrangement_root, catalog, data_root / 'layout',
            mmd_root, data_root / 'mmd_assets.json', threading.RLock())
    return locals()


def test_adopt_then_restore_preserves_originals_and_candidate(tmp_path, monkeypatch):
    f = _fixture(tmp_path, monkeypatch)
    before = [f['original'].read_bytes(), f['model'].read_bytes(),
              f['candidate'].read_bytes()]
    result = adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                            2, 5, f['report'], f['assets'])
    assert result['asset_id'].startswith('mmd:vmd:MOTION010-')
    arrangement = json.loads(f['arrangement_file'].read_text(encoding='utf-8'))
    clip = arrangement['clips'][0]
    assert (clip['id'], clip['start'], clip['duration'], clip['target_scene_instance_id']) == (
        f['clip_id'], 0, 4, f['instance_id'])
    assert clip['asset_id'] == result['asset_id']
    assert clip['motion010_source_asset_id'] == 'mmd:vmd:original.vmd'
    registry = json.loads((f['data_root'] / 'mmd_assets.json').read_text(encoding='utf-8'))
    assert len(registry['vmd']) == 1
    assert (f['mmd_root'] / 'vmd' / result['asset_id'].split(':')[-1]).read_bytes() == before[2]
    assert [f['original'].read_bytes(), f['model'].read_bytes(),
            f['candidate'].read_bytes()] == before
    candidate_context = {**f['context'], 'motion_asset_id': result['asset_id'],
                         'motion_sha256': _sha(f['candidate'].read_bytes())}
    monkeypatch.setattr(edits, '_context', lambda *args: candidate_context)
    baked = edits.view(f['edit_root'], f['data_root'], f['data_root'] / 'scene',
                       f['data_root'] / 'legacy', f['arrangement_root'], f['catalog'],
                       f['project_id'], f['assets'])
    assert baked['issues'][0]['kind'] == 'baked_into_candidate'
    assert baked['layers'][0]['disabled'] is True
    monkeypatch.setattr(edits, '_context', lambda *args: {
        **candidate_context, 'motion_sha256': '0' * 64})
    tampered = edits.view(f['edit_root'], f['data_root'], f['data_root'] / 'scene',
                          f['data_root'] / 'legacy', f['arrangement_root'], f['catalog'],
                          f['project_id'], f['assets'])
    assert tampered['issues'][0].get('kind') != 'baked_into_candidate'
    restored = adoption.restore(f['candidate_root'], f['data_root'],
        f['arrangement_root'], f['catalog'], f['data_root'] / 'layout',
        f['project_id'], f['clip_id'], 3, f['assets'])
    assert restored['asset_id'] == 'mmd:vmd:original.vmd'
    assert json.loads(f['arrangement_file'].read_text(encoding='utf-8'))['clips'][0]['name'] == 'Original'
    assert (f['mmd_root'] / 'vmd' / result['asset_id'].split(':')[-1]).is_file()
    assert json.loads(f['metadata_path'].read_text(encoding='utf-8'))['placed_in_project'] is False


def test_retry_repairs_metadata_after_clip_write(tmp_path, monkeypatch):
    f = _fixture(tmp_path, monkeypatch)
    placed = adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                            2, 5, f['report'], f['assets'])
    metadata = json.loads(f['metadata_path'].read_text(encoding='utf-8'))
    metadata.update(status='candidate_requires_real_pmx_validation',
                    registered_asset=False, placed_in_project=False)
    f['metadata_path'].write_text(json.dumps(metadata), encoding='utf-8')
    repeated = adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                              placed['revision'], 5, f['report'], f['assets'])
    assert repeated['already_placed'] is True
    repaired = json.loads(f['metadata_path'].read_text(encoding='utf-8'))
    assert repaired['registered_asset'] == placed['asset_id']
    assert repaired['placed_in_project'] is True


def test_stale_or_failed_report_writes_nothing(tmp_path, monkeypatch):
    f = _fixture(tmp_path, monkeypatch)
    before = f['arrangement_file'].read_bytes()
    with pytest.raises(adoption.AdoptionError, match='revision conflict'):
        adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                       1, 5, f['report'], f['assets'])
    with pytest.raises(adoption.AdoptionError, match='Passing'):
        adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                       2, 5, {**f['report'], 'passed': False}, f['assets'])
    with pytest.raises(adoption.AdoptionError, match='whole clip'):
        adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                       2, 5, {**f['report'], 'checkedFrames': 239}, f['assets'])
    assert f['arrangement_file'].read_bytes() == before
    assert not (f['data_root'] / 'mmd_assets.json').exists()


@pytest.mark.parametrize('mode', ['whole', 'interval'])
def test_sampled_candidate_adoption_requires_real_pmx_tail_coverage(mode):
    record = {'export_mode': mode, 'sampling_report': {
        'mode': mode, 'vmd_frame_span': 301}}
    report = {'passed': True, 'checkedFrames': 150, 'checkedVmdFrames': 150,
              'bones': 20, 'maxPosition': 0, 'maxAngle': 0,
              'positionClock': '作品', 'positionFrame': 0, 'positionBone': '頭',
              'angleClock': 'VMD', 'angleFrame': 0, 'angleBone': '頭'}
    with pytest.raises(adoption.AdoptionError, match='whole clip'):
        adoption._report(report, 0, 5, 30, record)
    assert adoption._report({**report, 'checkedVmdFrames': 301}, 0, 5, 30,
                            record)['checkedVmdFrames'] == 301


def test_source_change_blocks_adoption_and_restore(tmp_path, monkeypatch):
    f = _fixture(tmp_path, monkeypatch)
    f['candidate'].write_bytes(b'tampered')
    with pytest.raises(adoption.AdoptionError, match='bytes changed'):
        adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                       2, 5, f['report'], f['assets'])
    f['candidate'].write_bytes(b'generated VMD bytes')
    adoption.adopt(*f['args'], f['project_id'], f['candidate_id'], 3,
                   2, 5, f['report'], f['assets'])
    before = f['arrangement_file'].read_bytes()
    f['original'].write_bytes(b'replaced original')
    with pytest.raises(AdoptionErrorOrMotionError):
        adoption.restore(f['candidate_root'], f['data_root'],
            f['arrangement_root'], f['catalog'], f['data_root'] / 'layout',
            f['project_id'], f['clip_id'], 3, f['assets'])
    assert f['arrangement_file'].read_bytes() == before


AdoptionErrorOrMotionError = (adoption.AdoptionError, MotionEditError)
