"""Dense 30 fps MOTION-010 candidate, including source motion past the placed clip."""
from __future__ import annotations

import math
from bisect import bisect_right

from studio_v05_vmd_rewrite import _sections, LINEAR_INTERPOLATION, rewrite_bone_section
from studio_v05_vmd_temporal import (
    ANGLE_LIMIT_DEGREES, MAX_VMD_FRAMES, POSITION_LIMIT,
    _bezier, _compose, _correction, _pose, _slerp, _tracks,
)


def _error(expected, actual):
    position = math.dist(expected[0], actual[0])
    dot = abs(sum(a * b for a, b in zip(expected[1], actual[1])))
    angle = math.degrees(2 * math.acos(max(-1, min(1, dot))))
    return position, angle


def _snap_frame(frame):
    nearest = round(frame)
    return nearest if abs(frame - nearest) < 1e-7 else frame


def _three_boundary_pose(rows, frame):
    """MMDLoader's 15-step Bezier solver does not return exactly 0 at x=0.

    At an original VMD key, the next key's curve changes that key's observed
    pose. Dense insertion changes its next key. Model that boundary effect for
    a conservative local preflight; the independent PMX browser gate remains.
    """
    if not rows:
        return _pose(rows, frame)
    index = bisect_right(rows, frame, key=lambda row: row[0])
    if index == 0 or index == len(rows) or rows[index - 1][0] != frame:
        return _pose(rows, frame)
    left, right = rows[index - 1:index + 1]
    curves = right[3]
    position = tuple(left[1][axis] + (right[1][axis] - left[1][axis]) *
                     _bezier(curves, axis, 0) for axis in range(3))
    rotation = _slerp(left[2], right[2], _bezier(curves, 3, 0))
    return position, rotation


def full_frame_replacements(raw_vmd, layers, *, instance_id, clip_id):
    """Sample every VMD frame and reject loss at any placed project frame."""
    if not isinstance(layers, list):
        raise ValueError('Correction layers required')
    active = [row for row in layers if row.get('instance_id') == instance_id and
              row.get('clip_id') == clip_id]
    if not active or any(row.get('disabled') or row.get('muted') or
                         row.get('weight', 0) <= 0 for row in active):
        raise ValueError('Active correction layer required')
    identity = tuple(active[0][field] for field in ('fps', 'start', 'duration'))
    if any(tuple(row[field] for field in ('fps', 'start', 'duration')) != identity
           for row in active):
        raise ValueError('Correction layers must share the same clip')
    fps, start, duration = identity
    if (not math.isfinite(fps) or not 1 <= fps <= 240 or
            not math.isfinite(start) or start < 0 or
            not math.isfinite(duration) or duration <= 0):
        raise ValueError('Invalid correction clip time')
    bones = {key['bone'] for row in active for key in row['keys']}
    if not bones:
        raise ValueError('No correction keys')
    records, source_suffix = _sections(raw_vmd)
    source_last = max((frame for _, frame, _ in records), default=0)
    clip_end = math.ceil(duration * 30 - 1e-7)
    last = max(source_last, clip_end)
    if last > MAX_VMD_FRAMES:
        raise ValueError('VMD candidate exceeds bounded frame limit')
    if (last + 1) * len(bones) > 250000:
        raise ValueError('VMD candidate exceeds bounded sample limit')
    first_project = math.ceil(start * fps - 1e-7)
    end_project = math.ceil((start + duration) * fps - 1e-7)
    if (end_project - first_project) * len(bones) > 120000:
        raise ValueError('VMD candidate exceeds bounded comparison limit')

    original_keys = {(name, frame) for name, frame, _ in records}
    source_tracks = _tracks(raw_vmd)
    samples = []
    for bone in sorted(bones):
        rows = source_tracks.get(bone, [])
        interpolation = {row[0]: row[3] for row in rows}
        for frame in range(last + 1):
            offset, delta = _correction(active, bone, (start + frame / 30) * fps)
            # A source key with no correction is already a key for this frame.
            # Keep its entire original record, including opaque interpolation.
            if ((bone, frame) in original_keys and math.dist(offset, (0, 0, 0)) < 1e-12 and
                    math.dist(delta, (0, 0, 0, 1)) < 1e-12):
                continue
            position, rotation = _pose(rows, frame)
            position, rotation = _compose(position, rotation, offset, delta)
            samples.append({'bone': bone, 'frame': frame, 'position': position,
                            'rotation': rotation,
                            'interpolation': interpolation.get(frame, LINEAR_INTERPOLATION)})
    candidate, _ = rewrite_bone_section(raw_vmd, samples)
    output_records, output_suffix = _sections(candidate)
    if output_suffix != source_suffix:
        raise ValueError('Non-bone VMD sections changed')
    actual_keys = {(name, frame) for name, frame, _ in output_records}
    if any((bone, frame) not in actual_keys for bone in bones for frame in range(last + 1)):
        raise ValueError('Full-frame VMD key coverage failed')
    candidate_tracks = _tracks(candidate)
    max_position = max_angle = 0.0
    worst_position = worst_angle = first_project
    for project_frame in range(first_project, end_project):
        vmd_frame = _snap_frame((project_frame / fps - start) * 30)
        for bone in bones:
            base = (_three_boundary_pose(source_tracks.get(bone, []), vmd_frame)
                    if type(vmd_frame) is int else _pose(source_tracks.get(bone, []), vmd_frame))
            corrected = _compose(*base, *_correction(active, bone, project_frame))
            actual = (_three_boundary_pose(candidate_tracks[bone], vmd_frame)
                      if type(vmd_frame) is int else _pose(candidate_tracks[bone], vmd_frame))
            position_error, angle_error = _error(corrected, actual)
            if position_error > max_position:
                max_position, worst_position = position_error, project_frame
            if angle_error > max_angle:
                max_angle, worst_angle = angle_error, project_frame
    # The source may continue after this clip. It must retain its uncorrected
    # value at every VMD frame, including dense frames newly added above.
    boundary_max_position = boundary_max_angle = 0.0
    boundary_position_frame = boundary_angle_frame = 0
    for frame in range(last + 1):
        for bone in bones:
            source_pose = _three_boundary_pose(source_tracks.get(bone, []), frame)
            correction = _correction(active, bone, (start + frame / 30) * fps)
            expected = _compose(*source_pose, *correction)
            errors = _error(expected, _three_boundary_pose(candidate_tracks[bone], frame))
            if errors[0] > boundary_max_position:
                boundary_max_position, boundary_position_frame = errors[0], frame
            if errors[1] > boundary_max_angle:
                boundary_max_angle, boundary_angle_frame = errors[1], frame
    report = {'mode': 'whole', 'sampled_vmd_keys': len(samples),
              'vmd_frame_span': last + 1, 'source_last_bone_frame': source_last,
              'clip_end_vmd_frame': clip_end,
              'checked_project_frames': end_project - first_project,
              'checked_source_tail_vmd_frames': max(0, last - clip_end + 1),
              'max_position_error': max_position, 'worst_position_frame': worst_position,
              'max_angle_error_degrees': max_angle, 'worst_angle_frame': worst_angle,
              'three_boundary_max_position_error': boundary_max_position,
              'three_boundary_worst_position_vmd_frame': boundary_position_frame,
              'three_boundary_max_angle_error_degrees': boundary_max_angle,
              'three_boundary_worst_angle_vmd_frame': boundary_angle_frame,
              'gate': 'local_channels_and_dense_keys_requires_real_pmx_roundtrip'}
    if (max_position > POSITION_LIMIT or max_angle > ANGLE_LIMIT_DEGREES or
            boundary_max_position > POSITION_LIMIT or boundary_max_angle > ANGLE_LIMIT_DEGREES):
        raise ValueError('全フレーム候補の姿勢差が許容値を超えました。旧方式も選択できます: ' + str(report))
    return samples, report
