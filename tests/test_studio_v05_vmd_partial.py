"""Interval VMD export preserves original keys outside the correction span."""
import struct

import pytest

from studio_v05_vmd_partial import partial_replacements
from studio_v05_vmd_rewrite import LINEAR_INTERPOLATION, _sections, rewrite_bone_section


def _source(frames=(0, 90, 240, 300)):
    name = '頭'.encode('cp932').ljust(15, b'\0')
    raw = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Model'.ljust(20, b'\0')
    raw += struct.pack('<I', len(frames))
    for frame in frames:
        raw += name + struct.pack('<I3f4f', frame, 0, 0, 0, 0, 0, 0, 1) + LINEAR_INTERPOLATION
    return raw + b'opaque-other-VMD-sections'


def _layer(fps=60):
    return {'instance_id': 'one', 'clip_id': 'clip', 'fps': fps, 'start': 0,
            'duration': 10, 'weight': 1, 'muted': False,
            'start_frame': 3 * fps, 'end_frame': 8 * fps,
            'fade_in_frames': fps // 2, 'fade_out_frames': fps // 2,
            'keys': [{'frame': 4 * fps, 'bone': '頭', 'position': [0.01, 0, 0],
                      'rotation': [0, 0, 0, 1]}]}


@pytest.mark.parametrize('fps', [24, 60])
def test_interval_preserves_all_original_outside_records_and_suffix(fps):
    source = _source()
    samples, report = partial_replacements(source, [_layer(fps)],
                                            instance_id='one', clip_id='clip')
    assert report['start_vmd_frame'] == 90 and report['end_vmd_frame'] == 240
    assert report['outside_original_records'] == 4
    assert all(90 < sample['frame'] < 240 for sample in samples)
    rewritten, _ = rewrite_bone_section(source, samples)
    original, suffix = _sections(source)
    output, output_suffix = _sections(rewritten)
    assert suffix == output_suffix
    before = {(name, frame): raw for name, frame, raw in original
              if frame <= 90 or frame >= 240}
    after = {(name, frame): raw for name, frame, raw in output
             if frame <= 90 or frame >= 240}
    assert before == after
    assert rewritten != source
    assert report['max_position_error'] < 1e-3


def test_interval_refuses_missing_boundary_and_nonzero_start():
    with pytest.raises(ValueError, match='both boundaries'):
        partial_replacements(_source((0, 90, 300)), [_layer()],
                             instance_id='one', clip_id='clip')
    no_fade = {**_layer(), 'fade_in_frames': 0}
    with pytest.raises(ValueError, match='zero at its original'):
        partial_replacements(_source(), [no_fade], instance_id='one', clip_id='clip')


def test_interval_refuses_non_aligned_boundary_and_different_layer_intervals():
    off_grid = {**_layer(), 'start_frame': 181}
    with pytest.raises(ValueError, match='align'):
        partial_replacements(_source(), [off_grid], instance_id='one', clip_id='clip')
    second = {**_layer(), 'end_frame': 420}
    with pytest.raises(ValueError, match='one shared interval'):
        partial_replacements(_source(), [_layer(), second], instance_id='one', clip_id='clip')
