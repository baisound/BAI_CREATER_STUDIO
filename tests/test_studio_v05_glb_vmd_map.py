"""Focused validation of editable GLB-to-PMX mapping profiles."""
import hashlib
import os
import shutil
import threading
from pathlib import Path
import pytest

from studio_v05_glb_vmd_map import BODY, MappingError, _read, validate
from studio_v05_glb_vmd import ConversionError, convert


def names():
    return sorted({source for source, _ in BODY}), sorted({target for _, target in BODY})


def test_mapping_override_and_required_bones():
    source, target = names()
    effective = validate({'左人指１': 'LeftHandIndex2'}, source, target)
    assert effective['左人指１'] == 'LeftHandIndex2'
    assert effective['腰'] == 'Hips'
    with pytest.raises(MappingError, match='nonexistent'):
        validate({'左人指１': 'NoSuchBone'}, source, target)
    with pytest.raises(MappingError, match='Hips'):
        validate({'腰': None}, source, target)


def test_corrupt_profile_is_not_reset(tmp_path):
    path = tmp_path / 'studio_v05_glb_vmd_profiles.json'
    original = '{invalid profile file'
    path.write_text(original, encoding='utf-8')
    with pytest.raises(MappingError, match='original retained'):
        _read(tmp_path)
    assert path.read_text(encoding='utf-8') == original


def test_missing_blender_keeps_real_inputs(tmp_path):
    original = os.environ.get('BAI_REAL_MMD_DATA')
    if not original:
        pytest.skip('BAI_REAL_MMD_DATA が必要')
    root = Path(original)
    glb = root / 'integrated_v02/assets/cef762b38713abf09354.glb'
    pmx = next((root / 'mmd/A').glob('*.pmx'), None)
    if not glb.is_file() or pmx is None:
        pytest.skip('実GLB/PMXがありません')
    source = tmp_path / 'integrated_v02/assets' / glb.name
    target = tmp_path / 'mmd/A' / pmx.name
    source.parent.mkdir(parents=True)
    target.parent.mkdir(parents=True)
    shutil.copyfile(glb, source)
    shutil.copyfile(pmx, target)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    before = digest(source), digest(target)
    items = [
        {'id': 'integrated:' + source.name, 'filename': source.name, 'kind': 'motion',
         'source': 'integrated', 'format': 'GLB', 'name': source.name, 'available': True},
        {'id': 'mmd:A:' + target.name, 'name': target.name, 'kind': 'A',
         'source': 'mmd', 'format': 'PMX', 'available': True}]
    with pytest.raises(ConversionError) as error:
        convert(tmp_path, tmp_path, items[0]['id'], items[1]['id'], items,
                '__missing_blender_for_test__', threading.RLock(), lambda: {}, lambda _: None)
    assert error.value.status == 503
    assert (digest(source), digest(target)) == before
    assert not (tmp_path / 'mmd/vmd').exists()
