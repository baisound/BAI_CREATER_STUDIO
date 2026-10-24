"""Non-destructive VMD 0002 bone-section rewrite for MOTION-010.

The caller supplies final VMD-space bone samples. This module does not infer
PMX coordinates, interpolate the source motion, or certify visual equivalence.
"""
from __future__ import annotations

import hashlib
import math
import os
import struct
import tempfile
from pathlib import Path

from vmd_readback import MAX_BONE_KEYS, RECORD_SIZE, read_vmd_bones

MAX_SOURCE_BYTES = 256 * 1024 * 1024
LINEAR_INTERPOLATION = bytes([20, 20, 107, 107]) * 16


def _name(raw: bytes, label: str) -> str:
    try:
        name = raw.split(b'\0', 1)[0].decode('cp932', errors='strict')
    except UnicodeDecodeError as exc:
        raise ValueError(f'Invalid {label} CP932 name') from exc
    if not name:
        raise ValueError(f'Empty {label} name')
    return name


def _sections(raw: bytes):
    if len(raw) < 54 or raw[:30].rstrip(b'\0') != b'Vocaloid Motion Data 0002':
        raise ValueError('Not a VMD 0002 file')
    _name(raw[30:50], 'model')
    count = struct.unpack_from('<I', raw, 50)[0]
    if count > MAX_BONE_KEYS or 54 + count * RECORD_SIZE > len(raw):
        raise ValueError('Invalid or truncated VMD bone section')
    records, identities = [], set()
    end = 54 + count * RECORD_SIZE
    for index in range(count):
        row = raw[54 + index * RECORD_SIZE:54 + (index + 1) * RECORD_SIZE]
        name = _name(row[:15], 'bone')
        frame, *values = struct.unpack_from('<I3f4f', row, 15)
        if (name, frame) in identities:
            raise ValueError('Duplicate VMD bone/frame')
        identities.add((name, frame))
        if not all(math.isfinite(v) for v in values):
            raise ValueError('Nonfinite VMD bone value')
        norm = math.sqrt(sum(v * v for v in values[3:]))
        if not 0.98 <= norm <= 1.02:
            raise ValueError('Non-unit VMD quaternion')
        records.append((name, frame, row))
    return records, raw[end:]


def _sample(row: dict):
    if not isinstance(row, dict) or set(row) - {'bone', 'frame', 'position', 'rotation', 'interpolation'} \
            or not {'bone', 'frame', 'position', 'rotation'} <= set(row):
        raise ValueError('Invalid VMD replacement fields')
    bone, frame = row['bone'], row['frame']
    if not isinstance(bone, str) or not bone or type(frame) is not int or not 0 <= frame <= 0xffffffff:
        raise ValueError('Invalid VMD replacement identity')
    try:
        encoded = bone.encode('cp932', errors='strict')
    except UnicodeEncodeError as exc:
        raise ValueError('VMD bone name cannot be encoded') from exc
    if not 1 <= len(encoded) <= 15 or b'\0' in encoded:
        raise ValueError('VMD bone name exceeds 15 bytes or contains NUL')
    position, rotation = row['position'], row['rotation']
    if (not isinstance(position, (list, tuple)) or len(position) != 3 or
            not isinstance(rotation, (list, tuple)) or len(rotation) != 4 or
            any(type(value) not in (int, float) or not math.isfinite(value)
                for value in (*position, *rotation))):
        raise ValueError('Invalid VMD replacement pose')
    norm = math.sqrt(sum(value * value for value in rotation))
    if not 0.999 <= norm <= 1.001:
        raise ValueError('VMD replacement quaternion must be normalized')
    try:
        packed = struct.pack('<I3f4f', frame, *position, *rotation)
    except (OverflowError, struct.error) as exc:
        raise ValueError('VMD replacement exceeds float32 range') from exc
    if not all(math.isfinite(v) for v in struct.unpack('<I3f4f', packed)[1:]):
        raise ValueError('VMD replacement exceeds float32 range')
    interpolation = row.get('interpolation')
    if interpolation is not None and (not isinstance(interpolation, bytes) or len(interpolation) != 64):
        raise ValueError('VMD interpolation must be 64 bytes')
    return (bone, frame), encoded.ljust(15, b'\0'), packed, interpolation


def rewrite_bone_section(raw: bytes, replacements: list[dict]):
    """Return rewritten bytes and a structural report; never changes source bytes."""
    if not isinstance(raw, bytes) or len(raw) > MAX_SOURCE_BYTES:
        raise ValueError('VMD source must be bytes below the size limit')
    if not isinstance(replacements, list) or not replacements:
        raise ValueError('At least one replacement sample is required')
    records, suffix = _sections(raw)
    updates = {}
    for input_row in replacements:
        identity, encoded, packed, interpolation = _sample(input_row)
        if identity in updates:
            raise ValueError('Duplicate VMD replacement sample')
        updates[identity] = (encoded, packed, interpolation)
    if len(records) + len(updates) > MAX_BONE_KEYS:
        raise ValueError('VMD bone key limit exceeded')
    result, replaced = [], set()
    for name, frame, record in records:
        identity = (name, frame)
        if identity in updates:
            _, packed, interpolation = updates[identity]
            record = record[:15] + packed + (interpolation if interpolation is not None else record[47:])
            replaced.add(identity)
        result.append(record)
    added = sorted(set(updates) - replaced, key=lambda identity: (identity[1], identity[0]))
    for identity in added:
        encoded, packed, interpolation = updates[identity]
        result.append(encoded + packed + (interpolation or LINEAR_INTERPOLATION))
    output = raw[:50] + struct.pack('<I', len(result)) + b''.join(result) + suffix
    if len(output) > MAX_SOURCE_BYTES:
        raise ValueError('Rewritten VMD exceeds size limit')
    new_records, new_suffix = _sections(output)
    if len(new_records) != len(result) or new_suffix != suffix:
        raise ValueError('VMD rewrite readback failed')
    return output, {'original_bone_keys': len(records), 'output_bone_keys': len(result),
                    'replaced': len(replaced), 'added': len(added), 'suffix_bytes': len(suffix),
                    'validation': 'binary_only_requires_real_pmx_roundtrip'}


def write_distinct_vmd(source: Path, output: Path, replacements: list[dict]):
    """Create a new VMD path exclusively after complete binary readback."""
    source, output = Path(source).absolute(), Path(output).absolute()
    if os.path.normcase(str(source)) == os.path.normcase(str(output)) \
            or source.suffix.lower() != '.vmd' or output.suffix.lower() != '.vmd' \
            or not output.parent.is_dir() or output.exists():
        raise ValueError('Separate new VMD destination required')
    if source.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError('VMD source exceeds size limit')
    raw = source.read_bytes()
    source_hash = hashlib.sha256(raw).hexdigest()
    rewritten, report = rewrite_bone_section(raw, replacements)
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
        raise ValueError('VMD source changed during rewrite')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.vmd-rewrite-', suffix='.tmp',
                                         dir=output.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(rewritten)
            handle.flush()
            os.fsync(handle.fileno())
        readback = read_vmd_bones(temporary)
        if readback['bone_keys'] != report['output_bone_keys']:
            raise ValueError('VMD output readback count changed')
        created = False
        try:
            # Exclusive creation avoids replacing a concurrent or existing file.
            # An interrupted write is removed on the normal exception path; the
            # caller must only publish the path after this readback succeeds.
            with output.open('xb') as destination, temporary.open('rb') as prepared:
                created = True
                for block in iter(lambda: prepared.read(1024 * 1024), b''):
                    destination.write(block)
                destination.flush()
                os.fsync(destination.fileno())
            if output.read_bytes() != rewritten:
                raise ValueError('VMD output bytes changed during copy')
            if read_vmd_bones(output)['bone_keys'] != report['output_bone_keys']:
                raise ValueError('VMD final output readback failed')
            if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
                raise ValueError('VMD source changed before output completion')
        except BaseException:
            if created:
                output.unlink(missing_ok=True)
            raise
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {**report, 'source_sha256': source_hash,
            'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'output': str(output)}
