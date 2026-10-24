"""Conservative MOTION-010 VMD export limited to a saved correction interval.

Existing source bone records outside the interval, including both boundary
keys, stay byte-identical. If that cannot preserve the sampled pose, refuse the
candidate; the caller can use the existing whole-clip candidate instead.
"""
from __future__ import annotations

import math

from studio_v05_vmd_rewrite import _sections, rewrite_bone_section
from studio_v05_vmd_temporal import (_compose, _correction, _pose, _tracks,
                                     temporal_replacements, POSITION_LIMIT,
                                     ANGLE_LIMIT_DEGREES)


def _frame_at(seconds, label):
    frame = seconds * 30
    rounded = round(frame)
    if not math.isfinite(frame) or abs(frame - rounded) > 1e-7:
        raise ValueError(f'{label} must align with a 30fps VMD frame')
    return rounded


def partial_replacements(raw_vmd, layers, *, instance_id, clip_id):
    """Return interval-only samples and byte/pose report or fail closed."""
    active = [layer for layer in layers if layer.get('instance_id') == instance_id and
              layer.get('clip_id') == clip_id]
    if not active or any(layer.get('disabled') or layer.get('muted') or
                         layer.get('weight', 0) <= 0 for layer in active):
        raise ValueError('Active correction layer required')
    fps, start, duration = (active[0][key] for key in ('fps', 'start', 'duration'))
    first = math.ceil(start * fps - 1e-7)
    end = math.ceil((start + duration) * fps - 1e-7)
    intervals = {(layer.get('start_frame', first), layer.get('end_frame', end))
                 for layer in active}
    if len(intervals) != 1:
        raise ValueError('Interval export requires correction layers with one shared interval')
    from_frame, until_frame = intervals.pop()
    start_vmd = _frame_at(from_frame / fps - start, 'Correction start')
    end_vmd = _frame_at(until_frame / fps - start, 'Correction end')
    if not 0 <= start_vmd < end_vmd - 1 or end_vmd > math.ceil(duration * 30 - 1e-7):
        raise ValueError('Correction interval is outside this VMD clip')
    bones = {key['bone'] for layer in active for key in layer['keys']}
    if not bones:
        raise ValueError('Correction keys required')
    records, source_suffix = _sections(raw_vmd)
    identities = {(name, frame) for name, frame, _ in records}
    for bone in bones:
        if (bone, start_vmd) not in identities or (bone, end_vmd) not in identities:
            raise ValueError('Interval export requires original VMD keys at both boundaries for each corrected bone')
        offset, rotation = _correction(active, bone, from_frame)
        if math.hypot(*offset) > 1e-8 or math.hypot(*rotation[:3]) > 1e-8:
            raise ValueError('Correction must be zero at its original VMD start key')
    generated, _ = temporal_replacements(raw_vmd, active,
                                         instance_id=instance_id, clip_id=clip_id)
    samples = [row for row in generated if start_vmd < row['frame'] < end_vmd]
    if not samples:
        raise ValueError('No corrected VMD samples inside the interval')
    candidate, _ = rewrite_bone_section(raw_vmd, samples)
    output_records, output_suffix = _sections(candidate)
    if output_suffix != source_suffix:
        raise ValueError('Non-bone VMD sections changed')
    original_outside = {(name, frame): raw for name, frame, raw in records
                        if frame <= start_vmd or frame >= end_vmd}
    output_outside = {(name, frame): raw for name, frame, raw in output_records
                      if frame <= start_vmd or frame >= end_vmd}
    if original_outside != output_outside:
        raise ValueError('VMD bone records outside correction interval changed')
    source_tracks, candidate_tracks = _tracks(raw_vmd), _tracks(candidate)
    maximum_position = maximum_angle = 0.0
    worst_position = worst_angle = first
    for project_frame in range(first, end):
        vmd_frame = (project_frame / fps - start) * 30
        for bone in bones:
            position, rotation = _pose(source_tracks.get(bone, []), vmd_frame)
            offset, delta = _correction(active, bone, project_frame)
            expected_position, expected_rotation = _compose(position, rotation, offset, delta)
            actual_position, actual_rotation = _pose(candidate_tracks[bone], vmd_frame)
            position_error = math.dist(expected_position, actual_position)
            dot = abs(sum(a * b for a, b in zip(expected_rotation, actual_rotation)))
            angle_error = math.degrees(2 * math.acos(max(-1, min(1, dot))))
            if position_error > maximum_position:
                maximum_position, worst_position = position_error, project_frame
            if angle_error > maximum_angle:
                maximum_angle, worst_angle = angle_error, project_frame
    report = {'mode': 'interval', 'start_vmd_frame': start_vmd,
              'end_vmd_frame': end_vmd, 'outside_original_records': len(original_outside),
              'checked_project_frames': end - first,
              'sampled_vmd_keys': len(samples),
              'max_position_error': maximum_position,
              'worst_position_frame': worst_position,
              'max_angle_error_degrees': maximum_angle,
              'worst_angle_frame': worst_angle,
              'gate': 'local_channels_and_outside_bytes_requires_real_pmx_roundtrip'}
    if maximum_position > POSITION_LIMIT or maximum_angle > ANGLE_LIMIT_DEGREES:
        raise ValueError('Interval-only VMD pose error exceeds limit: ' + str(report))
    return samples, report
