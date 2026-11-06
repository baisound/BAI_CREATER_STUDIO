"""Read-only gate for the owner's aligned song SRT and full motion VMD."""
import hashlib
import os
import struct
from pathlib import Path

import pytest

from bai_studio.v05.lip.srt_sources import parse
from bai_studio.v05.motion.vmd_morph_rewrite import inspect_morph_section, rewrite_morph_section


def test_real_vocal_srt_and_motion_share_time_axis_without_changing_originals():
    srt_path = Path(os.environ.get('BAI_REAL_LIP_SRT', ''))
    vmd_path = Path(os.environ.get('BAI_REAL_LIP_VMD', ''))
    if not (srt_path.is_file() and vmd_path.is_file()):
        pytest.skip('BAI_REAL_LIP_SRT and BAI_REAL_LIP_VMD are required')
    srt_raw, vmd_raw = srt_path.read_bytes(), vmd_path.read_bytes()
    srt_hash, vmd_hash = hashlib.sha256(srt_raw).hexdigest(), hashlib.sha256(vmd_raw).hexdigest()
    srt = parse(srt_raw, 'utf-8-bom')
    vmd = inspect_morph_section(vmd_raw)
    bone_count = vmd['boneKeys']
    last_bone_frame = max(struct.unpack_from('<I', vmd_raw, 54 + index * 111 + 15)[0]
                          for index in range(bone_count))
    assert len(srt['entries']) == 54 and not srt['warnings']
    assert last_bone_frame == 6900 and len(vmd['rows']) == 4760
    assert abs(last_bone_frame / 30 - srt['entries'][-1]['endMs'] / 1000) < 2
    assert vmd_raw[30] == 0  # Empty label; later header bytes remain opaque and preserved.
    extra_frame = max(row['frame'] for row in vmd['rows']) + 1
    candidate, report = rewrite_morph_section(vmd_raw,
        [{'name': 'あ', 'frame': extra_frame, 'weight': .4}])
    readback = inspect_morph_section(candidate)
    assert readback['prefix'] == vmd['prefix'] and readback['tail'] == vmd['tail']
    assert report['added'] == 1 and len(readback['rows']) == len(vmd['rows']) + 1
    assert hashlib.sha256(srt_path.read_bytes()).hexdigest() == srt_hash
    assert hashlib.sha256(vmd_path.read_bytes()).hexdigest() == vmd_hash
