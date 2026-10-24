import hashlib
import os
import struct
from pathlib import Path

import pytest

from studio_v05_vmd_rewrite import RECORD_SIZE, rewrite_bone_section, write_distinct_vmd
from vmd_readback import read_vmd_bones


def record(name, frame, x):
    return (name.encode('cp932').ljust(15, b'\0') +
            struct.pack('<I3f4f', frame, x, 0, 0, 0, 0, 0, 1) +
            bytes([20, 20, 107, 107]) * 16)


def sample(name, frame, x):
    return {'bone': name, 'frame': frame, 'position': [x, 0, 0],
            'rotation': [0, 0, 0, 1]}


def fixture():
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    suffix = b'\x01\x00\x00\x00opaque-morph-camera-light-shadow-ik'
    return header + struct.pack('<I', 2) + record('頭', 0, 0) + record('センター', 4, 2) + suffix


def test_rewrite_keeps_unedited_bones_and_non_bone_suffix(tmp_path):
    original = fixture()
    rewritten, report = rewrite_bone_section(original,
                                             [sample('頭', 0, 1), sample('左足ＩＫ', 5, 0.3)])
    assert report == {'original_bone_keys': 2, 'output_bone_keys': 3,
                      'replaced': 1, 'added': 1, 'suffix_bytes': len(original) - 54 - 2 * RECORD_SIZE,
                      'validation': 'binary_only_requires_real_pmx_roundtrip'}
    assert rewritten[:50] == original[:50]
    assert rewritten[54 + RECORD_SIZE:54 + 2 * RECORD_SIZE] == original[54 + RECORD_SIZE:54 + 2 * RECORD_SIZE]
    assert rewritten[-report['suffix_bytes']:] == original[-report['suffix_bytes']:]
    output = tmp_path / 'new.vmd'
    output.write_bytes(rewritten)
    parsed = read_vmd_bones(output)
    assert [(row['bone'], row['frame']) for row in parsed['records']] == [
        ('頭', 0), ('センター', 4), ('左足ＩＫ', 5)]
    assert parsed['records'][0]['position'][0] == 1


def test_distinct_exclusive_destination_and_source_hash(tmp_path):
    source, output = tmp_path / 'source.vmd', tmp_path / 'candidate.vmd'
    source.write_bytes(fixture())
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    report = write_distinct_vmd(source, output, [sample('頭', 0, 1)])
    assert report['source_sha256'] == before
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    assert output.exists() and report['output_sha256'] != before
    with pytest.raises(ValueError, match='Separate new'):
        write_distinct_vmd(source, output, [sample('頭', 0, 2)])
    with pytest.raises(ValueError, match='Separate new'):
        write_distinct_vmd(source, source, [sample('頭', 0, 2)])


@pytest.mark.parametrize('change,reason', [
    (lambda raw: raw[:54] + raw[54:54 + RECORD_SIZE] * 2 + raw[54 + 2 * RECORD_SIZE:], 'Duplicate VMD bone/frame'),
    (lambda raw: raw[:54 + RECORD_SIZE + 10], 'Invalid or truncated VMD bone section'),
    (lambda raw: raw[:30] + b'A' * 19 + b'\x94' + raw[50:], 'Invalid model CP932 name'),
])
def test_reject_malformed_source(change, reason):
    with pytest.raises(ValueError, match=reason):
        rewrite_bone_section(change(fixture()), [sample('頭', 0, 1)])


@pytest.mark.parametrize('rows,reason', [
    ([sample('頭', 0, 1)] * 2, 'Duplicate VMD replacement sample'),
    ([sample('頭', 0, float('nan'))], 'Invalid VMD replacement pose'),
    ([sample('頭', 0, 1) | {'rotation': [0, 0, 0, 2]}], 'normalized'),
    ([sample('x' * 16, 0, 1)], '15 bytes'),
    ([sample('頭', 0, 1e300)], 'float32 range'),
])
def test_reject_bad_replacements(rows, reason):
    with pytest.raises(ValueError, match=reason):
        rewrite_bone_section(fixture(), rows)


def test_real_short_vmd_suffix_and_source_are_unchanged(tmp_path):
    data_root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = data_root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not source.is_file():
        pytest.skip('registered local VMD is unavailable')
    raw = source.read_bytes()
    parsed = read_vmd_bones(source)
    first = parsed['records'][0]
    output = tmp_path / 'real-candidate.vmd'
    report = write_distinct_vmd(source, output,
                                [sample(first['bone'], first['frame'], first['position'][0] + 0.1)])
    assert source.read_bytes() == raw
    assert report['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert output.read_bytes()[-parsed['remaining_bytes']:] == raw[-parsed['remaining_bytes']:]
    assert read_vmd_bones(output)['bone_keys'] == parsed['bone_keys']
