"""Conservative MOTION-010 VMD export limited to saved correction intervals.

Existing source bone records outside each corrected bone's intervals stay
byte-identical. The full source time span is checked for interpolation changes.
"""
from __future__ import annotations

import math

from studio_v05_vmd_full import _error, _snap_frame, _three_boundary_pose
from studio_v05_vmd_rewrite import _sections, LINEAR_INTERPOLATION, rewrite_bone_section
from studio_v05_vmd_temporal import (_compose, _correction, _pose, _tracks,
                                     POSITION_LIMIT, ANGLE_LIMIT_DEGREES,
                                     MAX_VMD_FRAMES)


def _frame_at(seconds, label):
    frame = seconds * 30
    rounded = round(frame)
    if not math.isfinite(frame) or abs(frame - rounded) > 1e-7:
        raise ValueError(f'{label} must align with a 30fps VMD frame')
    return rounded


def _contains(intervals, frame):
    return any(start <= frame < end for start, end in intervals)


def _merged(intervals):
    result = []
    for start, end in sorted(intervals):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def _runtime_pose(rows, frame):
    frame = _snap_frame(frame)
    return _three_boundary_pose(rows, frame) if type(frame) is int else _pose(rows, frame)


def partial_replacements(raw_vmd, layers, *, instance_id, clip_id):
    """Return interval samples after byte and full-time pose checks, or fail."""
    if not isinstance(layers, list):
        raise ValueError('Correction layers required')
    active = [layer for layer in layers if layer.get('instance_id') == instance_id and
              layer.get('clip_id') == clip_id]
    if not active or any(layer.get('disabled') or layer.get('muted') or
                         layer.get('weight', 0) <= 0 for layer in active):
        raise ValueError('Active correction layer required')
    identity = tuple(active[0][key] for key in ('fps', 'start', 'duration'))
    if any(tuple(layer[key] for key in ('fps', 'start', 'duration')) != identity
           for layer in active):
        raise ValueError('Correction layers must share the same clip')
    fps, start, duration = identity
    if (not math.isfinite(fps) or not 1 <= fps <= 240 or
            not math.isfinite(start) or start < 0 or
            not math.isfinite(duration) or duration <= 0):
        raise ValueError('Invalid correction clip time')
    first = math.ceil(start * fps - 1e-7)
    end = math.ceil((start + duration) * fps - 1e-7)
    clip_end = math.ceil(duration * 30 - 1e-7)
    records, source_suffix = _sections(raw_vmd)
    source_last = max((frame for _, frame, _ in records), default=0)
    last = max(source_last, clip_end)
    if last > MAX_VMD_FRAMES:
        raise ValueError('VMD candidate exceeds bounded frame limit')
    bone_intervals = {}
    for layer in active:
        from_project = layer.get('start_frame', first)
        until_project = layer.get('end_frame', end)
        if (type(from_project) is not int or type(until_project) is not int or
                not first <= from_project < until_project <= end):
            raise ValueError('Correction interval is outside this VMD clip')
        from_vmd = _frame_at(from_project / fps - start, 'Correction start')
        until_vmd = _frame_at(until_project / fps - start, 'Correction end')
        if not 0 <= from_vmd < until_vmd - 1 or until_vmd > clip_end:
            raise ValueError('Correction interval is outside this VMD clip')
        for bone in {key['bone'] for key in layer['keys']}:
            bone_intervals.setdefault(bone, []).append((from_vmd, until_vmd))
    if not bone_intervals:
        raise ValueError('Correction keys required')
    bone_intervals = {bone: _merged(intervals) for bone, intervals in bone_intervals.items()}
    sample_count = sum(stop - begin for intervals in bone_intervals.values()
                       for begin, stop in intervals)
    if sample_count > 250000 or (end - first) * len(bone_intervals) > 120000 or (
            last + 1) * len(bone_intervals) > 250000:
        raise ValueError('VMD candidate exceeds bounded comparison limit')
    source_tracks = _tracks(raw_vmd)
    original = {(name, frame): raw for name, frame, raw in records}
    missing_boundaries = 0
    for bone, intervals in bone_intervals.items():
        for begin, stop in intervals:
            missing_boundaries += ((bone, begin) not in original) + (
                (bone, stop) not in original)
            if (bone, begin) in original:
                offset, rotation = _correction(active, bone, (start + begin / 30) * fps)
                if math.dist(offset, (0, 0, 0)) > 1e-8 or (
                        math.dist(rotation, (0, 0, 0, 1)) > 1e-8):
                    raise ValueError('Correction must be zero at its original VMD start key')
    samples = []
    for bone, intervals in sorted(bone_intervals.items()):
        rows = source_tracks.get(bone, [])
        interpolation = {row[0]: row[3] for row in rows}
        for begin, stop in intervals:
            for frame in range(begin, stop):
                offset, rotation = _correction(active, bone, (start + frame / 30) * fps)
                if ((bone, frame) in original and math.dist(offset, (0, 0, 0)) < 1e-12
                        and math.dist(rotation, (0, 0, 0, 1)) < 1e-12):
                    continue
                position, base_rotation = _pose(rows, frame)
                position, result_rotation = _compose(position, base_rotation, offset, rotation)
                samples.append({'bone': bone, 'frame': frame, 'position': position,
                                'rotation': result_rotation,
                                'interpolation': interpolation.get(frame, LINEAR_INTERPOLATION)})
    if not samples:
        raise ValueError('No corrected VMD samples inside the intervals')
    candidate, _ = rewrite_bone_section(raw_vmd, samples)
    output_records, output_suffix = _sections(candidate)
    if output_suffix != source_suffix:
        raise ValueError('Non-bone VMD sections changed')
    output = {(name, frame): raw for name, frame, raw in output_records}
    outside = {identity: raw for identity, raw in original.items()
               if not _contains(bone_intervals.get(identity[0], []), identity[1])}
    output_outside = {identity: raw for identity, raw in output.items()
                      if not _contains(bone_intervals.get(identity[0], []), identity[1])}
    if outside != output_outside:
        raise ValueError('VMD bone records outside correction intervals changed')
    candidate_tracks = _tracks(candidate)
    maximum_position = maximum_angle = 0.0
    worst_position = worst_angle = first
    for project_frame in range(first, end):
        vmd_frame = (project_frame / fps - start) * 30
        for bone in bone_intervals:
            expected = _compose(*_runtime_pose(source_tracks.get(bone, []), vmd_frame),
                                *_correction(active, bone, project_frame))
            actual = _runtime_pose(candidate_tracks[bone], vmd_frame)
            position_error, angle_error = _error(expected, actual)
            if position_error > maximum_position:
                maximum_position, worst_position = position_error, project_frame
            if angle_error > maximum_angle:
                maximum_angle, worst_angle = angle_error, project_frame
    tail_position = tail_angle = 0.0
    tail_worst_position = tail_worst_angle = 0
    for frame in range(last + 1):
        for bone in bone_intervals:
            expected = _compose(*_three_boundary_pose(source_tracks.get(bone, []), frame),
                                *_correction(active, bone, (start + frame / 30) * fps))
            actual = _three_boundary_pose(candidate_tracks[bone], frame)
            position_error, angle_error = _error(expected, actual)
            if position_error > tail_position:
                tail_position, tail_worst_position = position_error, frame
            if angle_error > tail_angle:
                tail_angle, tail_worst_angle = angle_error, frame
    ranges = sorted({interval for intervals in bone_intervals.values() for interval in intervals})
    report = {'mode': 'interval', 'intervals': [list(row) for row in ranges],
              'start_vmd_frame': min(row[0] for row in ranges),
              'end_vmd_frame': max(row[1] for row in ranges),
              'missing_boundary_keys': missing_boundaries,
              'outside_original_records': len(outside),
              'checked_project_frames': end - first,
              'checked_vmd_frames': last + 1, 'vmd_frame_span': last + 1,
              'source_last_bone_frame': source_last,
              'sampled_vmd_keys': len(samples),
              'max_position_error': maximum_position,
              'worst_position_frame': worst_position,
              'max_angle_error_degrees': maximum_angle,
              'worst_angle_frame': worst_angle,
              'outside_span_max_position_error': tail_position,
              'outside_span_worst_position_vmd_frame': tail_worst_position,
              'outside_span_max_angle_error_degrees': tail_angle,
              'outside_span_worst_angle_vmd_frame': tail_worst_angle,
              'gate': 'local_channels_and_outside_bytes_requires_real_pmx_roundtrip'}
    if (maximum_position > POSITION_LIMIT or maximum_angle > ANGLE_LIMIT_DEGREES or
            tail_position > POSITION_LIMIT or tail_angle > ANGLE_LIMIT_DEGREES):
        raise ValueError('Interval-only VMD pose error exceeds limit: ' + str(report))
    return samples, report
