"""Strict read-only validation of bone-key VMD outputs (0002).

This is a binary structural round-trip, not a PMX visual or retarget test.
"""
import math
import struct
from pathlib import Path

RECORD_SIZE = 15 + 4 + 12 + 16 + 64
MAX_BONE_KEYS = 2_000_000


def read_vmd_bones(path, max_bone_keys=MAX_BONE_KEYS):
    raw = Path(path).read_bytes()
    if len(raw) < 54 or not raw[:30].rstrip(b'\0').startswith(b'Vocaloid Motion Data 0002'):
        raise ValueError('Not a VMD 0002 file')
    try:
        model = raw[30:50].split(b'\0', 1)[0].decode('cp932', errors='strict')
    except UnicodeDecodeError as exc:
        raise ValueError('Invalid VMD model name') from exc
    count = struct.unpack_from('<I', raw, 50)[0]
    if count > max_bone_keys:
        raise ValueError('Too many bone keyframes')
    end = 54 + count * RECORD_SIZE
    if end > len(raw):
        raise ValueError('Truncated VMD bone records')
    records = []
    for i in range(count):
        offset = 54 + i * RECORD_SIZE
        try:
            name = raw[offset:offset + 15].split(b'\0', 1)[0].decode('cp932', errors='strict')
        except UnicodeDecodeError as exc:
            raise ValueError('Invalid VMD bone name') from exc
        if not name:
            raise ValueError('Empty VMD bone name')
        frame, *values = struct.unpack_from('<I3f4f', raw, offset + 15)
        if not all(math.isfinite(v) for v in values):
            raise ValueError('Nonfinite VMD keyframe')
        rot = values[3:]
        magnitude = math.sqrt(sum(v * v for v in rot))
        if not 0.98 <= magnitude <= 1.02:
            raise ValueError('Non-unit VMD quaternion')
        records.append({'bone': name, 'frame': frame, 'position': values[:3], 'rotation': rot})
    return {'model': model, 'bone_keys': count, 'records': records,
            'remaining_bytes': len(raw) - end,
            'status': 'binary_readback_only_not_pmx_validated'}


def compare_vmd_bones(path, expected, tolerance=1e-5):
    parsed = read_vmd_bones(path)
    actual = parsed['records']
    if len(actual) != len(expected):
        raise ValueError(f'VMD key count mismatch {len(actual)} != {len(expected)}')
    for i, (got, wanted) in enumerate(zip(actual, expected)):
        bone, frame, pos, rot = wanted
        if got['bone'] != bone or got['frame'] != frame:
            raise ValueError(f'VMD bone/frame mismatch at key {i}')
        for a, b in zip(got['position'] + got['rotation'], list(pos) + list(rot)):
            if abs(a - b) > tolerance * max(1., abs(b)):
                raise ValueError(f'VMD numeric readback mismatch at key {i}')
    return {'status': 'passed_binary_roundtrip', 'bone_keys': len(actual),
            'pmx_motion_validation': 'not_performed'}
