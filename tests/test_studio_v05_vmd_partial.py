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
    assert report['outside_original_records'] == 3
    assert report['missing_boundary_keys'] == 0
    assert report['intervals'] == [[90, 240]]
    assert all(90 <= sample['frame'] < 240 for sample in samples)
    rewritten, _ = rewrite_bone_section(source, samples)
    original, suffix = _sections(source)
    output, output_suffix = _sections(rewritten)
    assert suffix == output_suffix
    before = {(name, frame): raw for name, frame, raw in original
              if frame < 90 or frame >= 240}
    after = {(name, frame): raw for name, frame, raw in output
             if frame < 90 or frame >= 240}
    assert before == after
    assert next(raw for name, frame, raw in original if frame == 90) == next(
        raw for name, frame, raw in output if frame == 90)
    assert rewritten != source
    assert report['max_position_error'] < 1e-3


def test_interval_accepts_missing_boundaries_only_when_full_span_pose_survives():
    source = _source((0, 300))
    samples, report = partial_replacements(source, [_layer()],
                                           instance_id='one', clip_id='clip')
    assert report['missing_boundary_keys'] == 2
    assert report['checked_vmd_frames'] == 301
    assert report['outside_span_max_position_error'] < 1e-3
    assert all(90 <= row['frame'] < 240 for row in samples)
    output, _ = rewrite_bone_section(source, samples)
    original = {(name, frame): raw for name, frame, raw in _sections(source)[0]}
    rewritten = {(name, frame): raw for name, frame, raw in _sections(output)[0]}
    assert all(rewritten[identity] == raw for identity, raw in original.items())


def test_interval_refuses_nonzero_original_start_key():
    no_fade = {**_layer(), 'fade_in_frames': 0}
    with pytest.raises(ValueError, match='zero at its original'):
        partial_replacements(_source(), [no_fade], instance_id='one', clip_id='clip')


def test_interval_refuses_non_aligned_boundary():
    off_grid = {**_layer(), 'start_frame': 181}
    with pytest.raises(ValueError, match='align'):
        partial_replacements(_source(), [off_grid], instance_id='one', clip_id='clip')


def test_different_layer_intervals_preserve_the_untouched_gap():
    first = {**_layer(), 'end_frame': 300}
    second = {**_layer(), 'start_frame': 360,
              'keys': [{**_layer()['keys'][0], 'frame': 420}]}
    source = _source((0, 90, 150, 180, 240, 300))
    samples, report = partial_replacements(source, [first, second],
                                           instance_id='one', clip_id='clip')
    assert report['intervals'] == [[90, 150], [180, 240]]
    assert not any(150 <= row['frame'] < 180 for row in samples)
    output, _ = rewrite_bone_section(source, samples)
    original = {(name, frame): raw for name, frame, raw in _sections(source)[0]}
    rewritten = {(name, frame): raw for name, frame, raw in _sections(output)[0]}
    assert all(rewritten[identity] == raw for identity, raw in original.items()
               if frame_outside(report['intervals'], identity[1]))
    solo_samples, solo_report = partial_replacements(source,
        [{**first, 'solo': True}, second], instance_id='one', clip_id='clip')
    assert solo_report['intervals'] == [[90, 150]]
    assert all(not 180 <= row['frame'] < 240 for row in solo_samples)
    with pytest.raises(ValueError, match='Several solo'):
        partial_replacements(source, [{**first, 'solo': True},
                                      {**second, 'solo': True}],
                             instance_id='one', clip_id='clip')


def frame_outside(intervals, frame):
    return all(not start <= frame < end for start, end in intervals)


def test_missing_boundaries_reject_moving_source_when_interpolation_changes():
    source = bytearray(_source((0, 300)))
    # The endpoint is moving, so an added key inside the span changes its
    # incoming curve even where no correction was requested.
    struct.pack_into('<f', source, 54 + 111 + 15 + 4, 1.0)
    with pytest.raises(ValueError, match='pose error exceeds limit'):
        partial_replacements(bytes(source), [_layer()], instance_id='one', clip_id='clip')
