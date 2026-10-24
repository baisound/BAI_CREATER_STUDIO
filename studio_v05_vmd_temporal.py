"""Bounded 30 fps VMD candidates for time-varying MOTION-010 FK layers.

The gate compares local bone channels at every project frame. PMX IK/grant
and actual rendering still require the separate browser roundtrip gate.
"""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
import math
import struct

from studio_v05_vmd_constant import _multiply, _normalize, _weighted
from studio_v05_vmd_rewrite import _sections, LINEAR_INTERPOLATION, rewrite_bone_section

MAX_VMD_FRAMES = 18000
POSITION_LIMIT = 1e-3
ANGLE_LIMIT_DEGREES = 0.01


def _slerp(a, b, ratio):
    a, b = _normalize(a), _normalize(b)
    dot = sum(x * y for x, y in zip(a, b))
    if dot < 0:
        b, dot = tuple(-x for x in b), -dot
    if dot > 0.9995:
        return _normalize(tuple(x + ratio * (y - x) for x, y in zip(a, b)))
    theta = math.acos(max(-1, min(1, dot)))
    left = math.sin((1 - ratio) * theta) / math.sin(theta)
    right = math.sin(ratio * theta) / math.sin(theta)
    return _normalize(tuple(left * x + right * y for x, y in zip(a, b)))


def _bezier(raw, channel, ratio):
    # MMDLoader's CubicBezierInterpolation reads the destination key.
    x1, x2 = raw[channel] / 127, raw[channel + 8] / 127
    y1, y2 = raw[channel + 4] / 127, raw[channel + 12] / 127
    if not all(0 <= v <= 1 for v in (x1, x2, y1, y2)):
        raise ValueError('Invalid VMD interpolation control point')
    step, t = 0.5, 0.5
    for _ in range(15):
        s = 1 - t
        a, b, c = 3 * s * s * t, 3 * s * t * t, t * t * t
        difference = a * x1 + b * x2 + c - ratio
        if abs(difference) < 1e-5:
            break
        step /= 2
        t += step if difference < 0 else -step
    return a * y1 + b * y2 + c


def _tracks(raw):
    records, _ = _sections(raw)
    tracks = defaultdict(list)
    for name, frame, record in records:
        _, *values = struct.unpack_from('<I3f4f', record, 15)
        tracks[name].append((frame, tuple(values[:3]), _normalize(values[3:]), record[47:]))
    for rows in tracks.values():
        rows.sort(key=lambda row: row[0])
    return tracks


def _pose(rows, frame):
    if not rows:
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)
    index = bisect_right(rows, frame, key=lambda row: row[0])
    if index == 0:
        return rows[0][1:3]
    if index == len(rows) or frame == rows[index - 1][0]:
        return rows[index - 1][1:3]
    left, right = rows[index - 1], rows[index]
    # Three.js MMDLoader holds the earlier value for adjacent VMD frames.
    ratio = 0.0 if right[0] - left[0] == 1 else (frame - left[0]) / (right[0] - left[0])
    curves = right[3]
    position = tuple(left[1][axis] + (right[1][axis] - left[1][axis]) *
                     _bezier(curves, axis, ratio) for axis in range(3))
    rotation = _slerp(left[2], right[2], _bezier(curves, 3, ratio))
    return position, rotation


def _correction(layers, bone, project_frame):
    offset = [0.0, 0.0, 0.0]
    rotation = (0.0, 0.0, 0.0, 1.0)
    for layer in layers:
        first = math.ceil(layer['start'] * layer['fps'] - 1e-7)
        end = math.ceil((layer['start'] + layer['duration']) * layer['fps'] - 1e-7)
        start = layer.get('start_frame', first)
        stop = layer.get('end_frame', end)
        if layer.get('muted') or project_frame < start or project_frame >= stop:
            continue
        fade_in = layer.get('fade_in_frames', 0)
        fade_out = layer.get('fade_out_frames', 0)
        weight = layer['weight'] * (min(1, (project_frame - start) / fade_in) if fade_in else 1) * \
                 (min(1, (stop - project_frame) / fade_out) if fade_out else 1)
        keys = sorted((key for key in layer['keys'] if key['bone'] == bone), key=lambda key: key['frame'])
        if not keys or weight <= 0:
            continue
        frames = [key['frame'] for key in keys]
        index = bisect_right(frames, project_frame)
        left = keys[max(0, index - 1)]
        right = keys[min(index, len(keys) - 1)]
        blend = 0 if right['frame'] == left['frame'] else max(0, min(1,
                (project_frame - left['frame']) / (right['frame'] - left['frame'])))
        a = left.get('position', [0, 0, 0])
        b = right.get('position', [0, 0, 0])
        for axis in range(3):
            offset[axis] += weight * (a[axis] + (b[axis] - a[axis]) * blend) * (-1 if axis == 2 else 1)
        delta = _slerp(left['rotation'], right['rotation'], blend)
        delta = _weighted((-delta[0], -delta[1], delta[2], delta[3]), weight)
        rotation = _multiply(rotation, delta)
    return tuple(offset), rotation


def _compose(position, rotation, offset, delta):
    return tuple(a + b for a, b in zip(position, offset)), _multiply(rotation, delta)


def temporal_replacements(raw_vmd, layers, *, instance_id, clip_id):
    """Return samples and a local-channel error report, or refuse lossy output."""
    if not isinstance(layers, list):
        raise ValueError('Correction layers required')
    active = [layer for layer in layers if layer.get('instance_id') == instance_id and
              layer.get('clip_id') == clip_id]
    if not active or any(layer.get('disabled') or layer.get('muted') or layer.get('weight', 0) <= 0
                         for layer in active):
        raise ValueError('Active correction layer required')
    identity = (active[0]['fps'], active[0]['start'], active[0]['duration'])
    if any((row['fps'], row['start'], row['duration']) != identity for row in active):
        raise ValueError('Correction layers must share the same clip')
    fps, start, duration = identity
    if not math.isfinite(fps) or not 1 <= fps <= 240 or not math.isfinite(start) or start < 0 \
            or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid correction clip time')
    end_vmd = math.ceil(duration * 30 - 1e-7)
    if end_vmd > MAX_VMD_FRAMES:
        raise ValueError('VMD candidate exceeds bounded frame limit')
    bones = {key['bone'] for layer in active for key in layer['keys']}
    if not bones:
        raise ValueError('No correction keys')
    source_tracks = _tracks(raw_vmd)
    samples = []
    for bone in sorted(bones):
        rows = source_tracks.get(bone, [])
        source_interpolation = {row[0]: row[3] for row in rows}
        # Preserve source key spacing and curves. Dense adjacent VMD keys make
        # MMDLoader hold their left pose at intermediate project frames.
        # Add the correction's 30 fps sample points, then gate every project
        # frame against the actual rewritten VMD evaluation below.
        frames = {0, end_vmd}
        frames.update(row[0] for row in rows if 0 <= row[0] <= end_vmd)
        for layer in active:
            first = math.ceil(layer['start'] * fps - 1e-7)
            end = math.ceil((layer['start'] + layer['duration']) * fps - 1e-7)
            points = [key['frame'] for key in layer['keys'] if key['bone'] == bone]
            if not points:
                continue
            from_frame = layer.get('start_frame', first)
            until_frame = layer.get('end_frame', end)
            points += [from_frame, until_frame,
                       from_frame + layer.get('fade_in_frames', 0),
                       until_frame - layer.get('fade_out_frames', 0)]
            frames.update(max(0, min(end_vmd, round((point / fps - start) * 30)))
                          for point in points)
            # A constant target remains active through the last project frame.
            # Preserve that value on the final 30 fps key before the interval
            # ends; otherwise interpolation would taper it toward the first
            # inactive key across a long span.
            first_vmd = math.ceil((from_frame / fps - start) * 30 - 1e-7)
            stop_vmd = math.ceil((until_frame / fps - start) * 30 - 1e-7)
            frames.update(max(0, min(end_vmd, point)) for point in
                          (first_vmd - 1, first_vmd, stop_vmd - 1, stop_vmd))
        if len(frames) * len(bones) > 250000:
            raise ValueError('VMD candidate exceeds bounded sample limit')
        for frame in sorted(frames):
            base_position, base_rotation = _pose(rows, frame)
            offset, delta = _correction(active, bone, (start + frame / 30) * fps)
            position, rotation = _compose(base_position, base_rotation, offset, delta)
            samples.append({'bone': bone, 'frame': frame, 'position': position,
                            'rotation': rotation,
                            'interpolation': source_interpolation.get(frame, LINEAR_INTERPOLATION)})
    candidate, _ = rewrite_bone_section(raw_vmd, samples)
    candidate_tracks = _tracks(candidate)
    first_project = math.ceil(start * fps - 1e-7)
    end_project = math.ceil((start + duration) * fps - 1e-7)
    if (end_project - first_project) * len(bones) > 120000:
        raise ValueError('VMD candidate exceeds bounded comparison limit')
    maximum_position = maximum_angle = 0.0
    worst_position = worst_angle = first_project
    for project_frame in range(first_project, end_project):
        vmd_frame = (project_frame / fps - start) * 30
        for bone in bones:
            position, rotation = _pose(source_tracks.get(bone, []), vmd_frame)
            offset, delta = _correction(active, bone, project_frame)
            expected_position, expected_rotation = _compose(position, rotation, offset, delta)
            actual_position, actual_rotation = _pose(candidate_tracks[bone], vmd_frame)
            position_error = math.sqrt(sum((a - b) ** 2 for a, b in zip(expected_position, actual_position)))
            dot = abs(sum(a * b for a, b in zip(expected_rotation, actual_rotation)))
            angle_error = math.degrees(2 * math.acos(max(-1, min(1, dot))))
            if position_error > maximum_position:
                maximum_position, worst_position = position_error, project_frame
            if angle_error > maximum_angle:
                maximum_angle, worst_angle = angle_error, project_frame
    report = {'sampled_vmd_keys': len(samples), 'vmd_frame_span': end_vmd + 1,
              'checked_project_frames': end_project - first_project,
              'max_position_error': maximum_position, 'worst_position_frame': worst_position,
              'max_angle_error_degrees': maximum_angle, 'worst_angle_frame': worst_angle,
              'gate': 'local_channels_only_requires_real_pmx_roundtrip'}
    if maximum_position > POSITION_LIMIT or maximum_angle > ANGLE_LIMIT_DEGREES:
        raise ValueError('30fps sample error exceeds limit: ' + str(report))
    return samples, report
