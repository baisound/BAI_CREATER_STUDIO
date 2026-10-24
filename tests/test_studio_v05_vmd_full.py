import struct
import hashlib
import math
import os
from pathlib import Path

import pytest

from studio_v05_vmd_full import full_frame_replacements
from studio_v05_vmd_rewrite import _sections, RECORD_SIZE, rewrite_bone_section
from test_studio_v05_vmd_rewrite import record


def source():
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    rows = [record('頭', 0, 0), record('頭', 4, 0.4), record('頭', 10, 1),
            record('センター', 12, 2)]
    suffix = b'opaque-morph-and-ik-section'
    return header + struct.pack('<I', len(rows)) + b''.join(rows) + suffix


def layer(*, fps=30, duration=5 / 30, keys=None):
    return {'instance_id': 'model-1', 'clip_id': 'clip-1', 'fps': fps,
            'start': 0, 'duration': duration, 'weight': 1, 'muted': False,
            'keys': keys or [{'bone': '頭', 'frame': 0, 'position': [0.1, 0, 0],
                              'rotation': [0, 0, 0, 1]}]}


def test_every_source_frame_is_keyed_and_longer_source_tail_is_unchanged():
    raw = source()
    samples, report = full_frame_replacements(raw, [layer()],
                                               instance_id='model-1', clip_id='clip-1')
    output, _ = rewrite_bone_section(raw, samples)
    original, suffix = _sections(raw)
    records, output_suffix = _sections(output)
    assert report['vmd_frame_span'] == 13
    assert report['source_last_bone_frame'] == 12
    assert report['clip_end_vmd_frame'] == 5
    assert report['checked_source_tail_vmd_frames'] == 8
    assert report['checked_project_frames'] == 5
    assert report['max_position_error'] < 1e-3
    assert {(name, frame) for name, frame, _ in records if name == '頭'} == {
        ('頭', frame) for frame in range(13)}
    assert output_suffix == suffix
    assert next(row for name, frame, row in records if name == '頭' and frame == 10) == \
        next(row for name, frame, row in original if name == '頭' and frame == 10)
    assert next(row for name, frame, row in records if name == 'センター' and frame == 12) == \
        next(row for name, frame, row in original if name == 'センター' and frame == 12)


def test_unrepresentable_project_frame_is_rejected():
    keys = [
        {'bone': '頭', 'frame': frame, 'position': [x, 0, 0],
         'rotation': [0, 0, 0, 1]}
        for frame, x in [(0, 0), (1, 1), (2, 0)]
    ]
    with pytest.raises(ValueError, match='全フレーム候補の姿勢差.*worst_position_frame'):
        full_frame_replacements(source(), [layer(fps=60, duration=2, keys=keys)],
                                instance_id='model-1', clip_id='clip-1')


def test_three_boundary_bias_rejects_sparse_moving_curve_without_real_data():
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    rows = []
    interpolation = bytes([20, 20, 0, 0, 20, 20, 20, 20,
                           107, 107, 107, 107, 107, 107, 107, 107]) * 4
    for frame, degrees in [(0, 0), (30, 20), (60, -20)]:
        angle = math.radians(degrees)
        rows.append('頭'.encode('cp932').ljust(15, b'\0') +
                    struct.pack('<I3f4f', frame, 0, 0, 0, 0, math.sin(angle / 2),
                                0, math.cos(angle / 2)) +
                    interpolation)
    raw = header + struct.pack('<I', len(rows)) + b''.join(rows) + b'opaque-suffix'
    with pytest.raises(ValueError, match="three_boundary_max_angle_error_degrees.*three_boundary_worst_angle_vmd_frame': 30"):
        full_frame_replacements(raw, [layer(duration=1)],
                                instance_id='model-1', clip_id='clip-1')


def test_rejects_source_longer_than_bounded_frame_limit():
    raw = source()
    records, suffix = _sections(raw)
    long_record = record('センター', 18001, 0)
    raw = raw[:50] + struct.pack('<I', len(records) + 1) + raw[54:54 + len(records) * RECORD_SIZE] + long_record + suffix
    with pytest.raises(ValueError, match='bounded frame limit'):
        full_frame_replacements(raw, [layer()], instance_id='model-1', clip_id='clip-1')


def test_real_moving_vmd_rejects_three_boundary_error_before_candidate():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    path = root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not path.is_file():
        pytest.skip('Registered real VMD is unavailable')
    raw = path.read_bytes()
    before = hashlib.sha256(raw).hexdigest()
    with pytest.raises(ValueError, match="three_boundary_max_angle_error_degrees.*three_boundary_worst_angle_vmd_frame': 120"):
        full_frame_replacements(raw, [layer(duration=5)],
                                instance_id='model-1', clip_id='clip-1')
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
