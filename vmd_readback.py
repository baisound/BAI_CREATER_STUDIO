"""Strict read-only validation of bone-key VMD outputs (0002).

This is a binary structural round-trip, not a PMX visual or retarget test.
"""
import math
import struct
from pathlib import Path

RECORD_SIZE = 15 + 4 + 12 + 16 + 64
MAX_BONE_KEYS = 2_000_000
MORPH_RECORD_SIZE = 15 + 4 + 4
MAX_MORPH_KEYS = 100_000


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


def read_vmd_morphs(raw, max_morph_keys=MAX_MORPH_KEYS):
    """Read a morph-only VMD 0002 byte string and require five empty tail sections."""
    if (not isinstance(raw, bytes) or len(raw) < 82
            or raw[:30].split(b'\0', 1)[0] != b'Vocaloid Motion Data 0002'):
        raise ValueError('Not a morph-only VMD 0002 file')
    try:
        model = raw[30:50].split(b'\0', 1)[0].decode('cp932', errors='strict')
    except UnicodeDecodeError as exc:
        raise ValueError('Invalid VMD model name') from exc
    if not model or struct.unpack_from('<I', raw, 50)[0] != 0:
        raise ValueError('Morph-only VMD requires model name and zero bone records')
    count = struct.unpack_from('<I', raw, 54)[0]
    if count > max_morph_keys:
        raise ValueError('Too many VMD morph records')
    end = 58 + count * MORPH_RECORD_SIZE
    if len(raw) != end + 20 or raw[end:] != b'\0' * 20:
        raise ValueError('Truncated or nonempty VMD tail sections')
    rows = []
    previous = (-1, '')
    for index in range(count):
        offset = 58 + index * MORPH_RECORD_SIZE
        try:
            name = raw[offset:offset + 15].split(b'\0', 1)[0].decode('cp932', errors='strict')
        except UnicodeDecodeError as exc:
            raise ValueError('Invalid VMD morph name') from exc
        frame, weight = struct.unpack_from('<If', raw, offset + 15)
        if (not name or frame > 1_000_000 or not math.isfinite(weight) or not 0 <= weight <= 1
                or (frame, name) <= previous):
            raise ValueError('Invalid or unsorted VMD morph record')
        rows.append({'name': name, 'frame': frame, 'weight': weight})
        previous = (frame, name)
    return {'model': model, 'bone_keys': 0, 'morph_keys': count, 'records': rows,
            'tail_counts': [0, 0, 0, 0, 0], 'status': 'binary_readback_only_not_pmx_validated'}


def compare_vmd_morphs(raw, expected, tolerance=1e-6):
    parsed = read_vmd_morphs(raw)
    if len(parsed['records']) != len(expected):
        raise ValueError('VMD morph record count mismatch')
    for got, wanted in zip(parsed['records'], expected):
        if (got['name'] != wanted['name'] or got['frame'] != wanted['frame']
                or abs(got['weight'] - wanted['weight']) > tolerance):
            raise ValueError('VMD morph record readback mismatch')
    return {'status': 'passed_binary_roundtrip', 'morph_keys': len(expected),
            'bone_keys': 0, 'pmx_visual_validation': 'not_performed'}
