"""Morph-section rewrite must preserve body motion and every later VMD section."""
import hashlib
import os
import struct
from pathlib import Path

import pytest

from studio_v05_vmd_morph_rewrite import inspect_morph_section, rewrite_morph_section


def _source():
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    bone = b'head'.ljust(15, b'\0') + struct.pack('<I3f4f', 0, 0, 0, 0, 0, 0, 0, 1)
    bone += bytes([20, 20, 107, 107]) * 16
    name = 'あ'.encode('cp932').ljust(15, b'\0')
    morphs = b''.join(name + struct.pack('<If', frame, .2) for frame in (0, 120))
    camera = bytes(range(61))
    light = bytes(range(28))
    shadow = bytes(range(9))
    ik = struct.pack('<IBI', 15, 1, 1) + '足ＩＫ'.encode('cp932').ljust(20, b'\0') + b'\x01'
    tail = (struct.pack('<I', 1) + camera + struct.pack('<I', 1) + light
            + struct.pack('<I', 1) + shadow + struct.pack('<I', 1) + ik)
    return header + struct.pack('<I', 1) + bone + struct.pack('<I', 2) + morphs + tail


def test_preserves_bones_and_all_later_sections_while_rewriting_morphs():
    source = _source()
    before = inspect_morph_section(source)
    result, report = rewrite_morph_section(source,
        [{'name': 'あ', 'frame': 30, 'weight': .8},
         {'name': 'あ', 'frame': 120, 'weight': 0}], [('あ', 0)])
    after = inspect_morph_section(result)
    assert source == _source() and result != source
    assert before['prefix'] == after['prefix'] and before['tail'] == after['tail']
    assert report['sourceBoneKeys'] == 1
    assert report['tailCounts'] == {'camera': 1, 'light': 1, 'self_shadow': 1, 'ik_display': 1}
    assert (report['removed'], report['replaced'], report['added']) == (1, 1, 1)
    assert [(row['name'], row['frame'], round(row['weight'], 3)) for row in after['rows']] == [
        ('あ', 30, .8), ('あ', 120, 0)]
    assert report['prefixSha256'] == hashlib.sha256(before['prefix']).hexdigest()
    assert report['tailSha256'] == hashlib.sha256(before['tail']).hexdigest()
    with pytest.raises(ValueError, match='trailing'):
        inspect_morph_section(source + b'garbage')
    with pytest.raises(ValueError, match='removal'):
        rewrite_morph_section(source, [], [('い', 1)])


def test_existing_morph_only_candidate_extra_zero_is_preserved():
    source = _source()
    before = inspect_morph_section(source)
    candidate = before['prefix'] + struct.pack('<I', 0) + b'\0' * 20
    result, report = rewrite_morph_section(candidate, [{'name': 'い', 'frame': 30, 'weight': .5}])
    assert inspect_morph_section(result)['tailCounts']['legacy_extra_zero'] == 0
    assert report['added'] == 1


def test_real_long_vmd_preserves_non_morph_bytes():
    root = os.environ.get('BAI_REAL_MMD_DATA')
    if not root:
        pytest.skip('BAI_REAL_MMD_DATA is not set')
    path = Path(root)/'mmd'/'vmd'/'神っぽいな.vmd'
    if not path.is_file():
        pytest.skip('Real long VMD unavailable')
    source = path.read_bytes()
    original_hash = hashlib.sha256(source).hexdigest()
    before = inspect_morph_section(source)
    frame = max((row['frame'] for row in before['rows']), default=0) + 1
    output, report = rewrite_morph_section(source,
        [{'name': 'あ', 'frame': frame, 'weight': .1}])
    after = inspect_morph_section(output)
    assert before['prefix'] == after['prefix'] and before['tail'] == after['tail']
    assert report['sourceBoneKeys'] == 26859 and report['tailCounts']['ik_display'] == 1
    assert any(row['name'] == 'あ' and row['frame'] == frame for row in after['rows'])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == original_hash
