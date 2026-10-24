"""Morph VMD binary writer/readback and independent Three.js MMDParser check."""
import json
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

from morph_vmd_codec import encode_morph_vmd
from vmd_readback import read_vmd_morphs, compare_vmd_morphs


def test_morph_only_vmd_roundtrip_with_independent_parser(tmp_path):
    expected = [{'name': 'あ', 'frame': 36, 'weight': 0.55},
                {'name': '口下', 'frame': 36, 'weight': 0},
                {'name': 'い', 'frame': 60, 'weight': 1}]
    raw = encode_morph_vmd('口形確認', list(reversed(expected)))
    parsed = read_vmd_morphs(raw)
    assert parsed['model'] == '口形確認'
    assert parsed['bone_keys'] == 0 and parsed['morph_keys'] == 3
    assert parsed['tail_counts'] == [0] * 5
    assert [(r['frame'], r['name']) for r in parsed['records']] == [(36, 'あ'), (36, '口下'), (60, 'い')]
    assert compare_vmd_morphs(raw, parsed['records'])['status'] == 'passed_binary_roundtrip'
    file = tmp_path / 'lip.vmd'
    file.write_bytes(raw)
    assert file.read_bytes() == raw
    node = shutil.which('node')
    if not node:
        pytest.skip('Node unavailable for independent MMDParser readback')
    script = """import fs from 'node:fs';
import {MMDParser} from './node_modules/three/examples/jsm/libs/mmdparser.module.js';
const bytes=fs.readFileSync(process.argv[1]);
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const vmd=new MMDParser.Parser().parseVmd(buffer,false);
console.log(JSON.stringify({model:vmd.metadata.name,bones:vmd.metadata.motionCount,
  morphs:vmd.morphs.map(row=>[row.morphName,row.frameNum,row.weight]),
  cameras:vmd.metadata.cameraCount}));"""
    result = subprocess.run([node, '--input-type=module', '-e', script, str(file)],
                            cwd=Path(__file__).resolve().parents[1], capture_output=True,
                            text=True, encoding='utf-8', timeout=15, check=True)
    external = json.loads(result.stdout)
    assert external['model'] == '口形確認' and external['bones'] == 0
    assert external['cameras'] == 0
    assert [(name, frame) for name, frame, _ in external['morphs']] == [
        ('あ', 36), ('口下', 36), ('い', 60)]
    assert abs(external['morphs'][0][2] - .55) < 1e-6


@pytest.mark.parametrize('records', [
    [{'name': 'あ', 'frame': 1, 'weight': float('nan')}],
    [{'name': 'あ', 'frame': -1, 'weight': .5}],
    [{'name': 'あ', 'frame': 1, 'weight': 1.1}],
    [{'name': '😀', 'frame': 1, 'weight': .5}],
    [{'name': '長い名前で十五バイト超', 'frame': 1, 'weight': .5}],
    [{'name': 'あ', 'frame': 1, 'weight': .2}, {'name': 'あ', 'frame': 1, 'weight': .3}],
])
def test_morph_vmd_rejects_invalid_records(records):
    with pytest.raises(ValueError):
        encode_morph_vmd('確認', records)


def test_readback_rejects_nonempty_tail_and_truncation():
    raw = bytearray(encode_morph_vmd('確認', [{'name': 'あ', 'frame': 0, 'weight': 0}]))
    for altered in (raw[:-1], raw + b'X'):
        with pytest.raises(ValueError):
            read_vmd_morphs(bytes(altered))
    raw[-1] = 1
    with pytest.raises(ValueError):
        read_vmd_morphs(bytes(raw))
    raw = bytearray(encode_morph_vmd('確認', [{'name': 'あ', 'frame': 0, 'weight': 0}]))
    struct.pack_into('<f', raw, 58 + 15 + 4, float('inf'))
    with pytest.raises(ValueError):
        read_vmd_morphs(bytes(raw))
