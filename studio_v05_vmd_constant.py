"""Bake only whole-clip constant MOTION-010 corrections into VMD bone keys.

This conservative subset preserves each original bone key's interpolation and
the entire non-bone suffix. It is not the general time-varying layer exporter.
"""
from __future__ import annotations

import math
import struct

from studio_v05_vmd_rewrite import _sections


def _normalize(q):
    norm = math.sqrt(sum(x * x for x in q))
    if not math.isfinite(norm) or norm < 1e-12:
        raise ValueError('Invalid correction quaternion')
    return tuple(x / norm for x in q)


def _multiply(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return _normalize((aw * bx + ax * bw + ay * bz - az * by,
                       aw * by - ax * bz + ay * bw + az * bx,
                       aw * bz + ax * by - ay * bx + az * bw,
                       aw * bw - ax * bx - ay * by - az * bz))


def _weighted(q, weight):
    q = _normalize(q)
    if q[3] < 0:
        q = tuple(-x for x in q)
    dot = max(-1.0, min(1.0, q[3]))
    if dot > 0.9995:
        return _normalize((q[0] * weight, q[1] * weight, q[2] * weight,
                           1 + (q[3] - 1) * weight))
    theta = math.acos(dot)
    left = math.sin((1 - weight) * theta) / math.sin(theta)
    right = math.sin(weight * theta) / math.sin(theta)
    return _normalize((q[0] * right, q[1] * right, q[2] * right,
                       left + q[3] * right))


def active_correction_layers(layers, instance_id, clip_id):
    """Use the same mute/solo selection for every VMD export mode."""
    if not isinstance(layers, list):
        raise ValueError('Correction layers required')
    active = [layer for layer in layers if layer.get('instance_id') == instance_id and
              layer.get('clip_id') == clip_id]
    if any(layer.get('disabled') for layer in active):
        raise ValueError('Correction layer is disabled')
    solo = [layer for layer in active if layer.get('solo')]
    if len(solo) > 1:
        raise ValueError('Several solo layers for one clip')
    if solo:
        active = solo
    active = [layer for layer in active if not layer.get('muted') and layer.get('weight', 0) > 0]
    if not active:
        raise ValueError('Active correction layer required')
    return active


def constant_replacements(raw_vmd: bytes, layers: list[dict], *, instance_id: str, clip_id: str):
    """Return complete VMD-space samples for whole-clip constant layer keys.

    Caller must validate the project, source hashes, PMX bone names and clip
    context with studio_v05_motion_edits.view before invoking this function.
    """
    if not isinstance(layers, list) or not isinstance(instance_id, str) or not isinstance(clip_id, str):
        raise ValueError('Motion edit context required')
    original, _ = _sections(raw_vmd)
    active = active_correction_layers(layers, instance_id, clip_id)
    by_bone = {}
    clip_identity = None
    for layer in active:
        fps, start, duration = layer.get('fps'), layer.get('start'), layer.get('duration')
        weight = layer.get('weight')
        if (type(fps) not in (int, float) or not math.isfinite(fps) or fps <= 0 or
                type(start) not in (int, float) or not math.isfinite(start) or start < 0 or
                type(duration) not in (int, float) or not math.isfinite(duration) or duration <= 0 or
                type(weight) not in (int, float) or not math.isfinite(weight) or not 0 < weight <= 1):
            raise ValueError('Invalid constant correction layer')
        first = math.ceil(start * fps - 1e-7)
        end = math.ceil((start + duration) * fps - 1e-7)
        if clip_identity is None:
            clip_identity = (fps, start, duration)
        elif clip_identity != (fps, start, duration):
            raise ValueError('Correction layers must share the same clip')
        if (layer.get('start_frame', first) != first or layer.get('end_frame', end) != end or
                layer.get('fade_in_frames', 0) != 0 or layer.get('fade_out_frames', 0) != 0):
            raise ValueError('Time-limited or faded correction cannot use constant export')
        names = set()
        for key in layer.get('keys', []):
            if not isinstance(key, dict) or not isinstance(key.get('bone'), str) or not key['bone']:
                raise ValueError('Invalid constant correction key')
            if key['bone'] in names:
                raise ValueError('Time-varying correction cannot use constant export')
            if type(key.get('frame')) is not int or not first <= key['frame'] < end:
                raise ValueError('Constant correction key outside saved clip')
            names.add(key['bone'])
            position = key.get('position', [0, 0, 0])
            rotation = key.get('rotation')
            if (not isinstance(position, list) or len(position) != 3 or
                    not isinstance(rotation, list) or len(rotation) != 4 or
                    any(type(x) not in (int, float) or not math.isfinite(x)
                        for x in (*position, *rotation))):
                raise ValueError('Invalid constant correction pose')
            norm = math.sqrt(sum(x * x for x in rotation))
            if not 0.999 <= norm <= 1.001 or any(abs(x) > 100000 for x in position):
                raise ValueError('Invalid constant correction pose')
            # Three.js MMDParser converts LH VMD to RH preview by flipping Z
            # position and X/Y quaternion signs. Invert that mapping here.
            offset = (weight * position[0], weight * position[1], -weight * position[2])
            weighted = _weighted((-rotation[0], -rotation[1], rotation[2], rotation[3]), weight)
            by_bone.setdefault(key['bone'], []).append((offset, weighted))
    if not by_bone:
        raise ValueError('No constant correction keys')
    samples = []
    present = set()
    for name, frame, record in original:
        if name not in by_bone:
            continue
        present.add(name)
        _, *values = struct.unpack_from('<I3f4f', record, 15)
        position = list(values[:3])
        rotation = _normalize(values[3:])
        for offset, delta in by_bone[name]:
            position = [position[index] + offset[index] for index in range(3)]
            rotation = _multiply(rotation, delta)
        samples.append({'bone': name, 'frame': frame, 'position': position,
                        'rotation': list(rotation)})
    for name in sorted(by_bone.keys() - present):
        position, rotation = [0.0, 0.0, 0.0], (0.0, 0.0, 0.0, 1.0)
        for offset, delta in by_bone[name]:
            position = [position[index] + offset[index] for index in range(3)]
            rotation = _multiply(rotation, delta)
        samples.append({'bone': name, 'frame': 0, 'position': position,
                        'rotation': list(rotation)})
    return samples
