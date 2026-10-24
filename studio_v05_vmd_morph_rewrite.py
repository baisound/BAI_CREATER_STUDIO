"""Lossless non-morph-section preservation for distinct VMD 0002 candidates.

Only the morph records and their count may change. The model header, bone
records (including interpolation), and camera/light/shadow/IK tail are copied
byte-for-byte. This is a binary gate, not a PMX visual-equivalence claim.
"""
from __future__ import annotations

import hashlib
import math
import struct

from studio_v05_vmd_rewrite import MAX_SOURCE_BYTES, _sections
from vmd_readback import MAX_MORPH_KEYS, MORPH_RECORD_SIZE, RECORD_SIZE

HEADER = b'Vocaloid Motion Data 0002'.ljust(30, b'\0')
TAIL_SIZES = (('camera', 61), ('light', 28), ('self_shadow', 9))


def _count(raw, offset, size, label, limit=100_000):
    if offset + 4 > len(raw):
        raise ValueError(f'Truncated VMD {label} count')
    count = struct.unpack_from('<I', raw, offset)[0]
    offset += 4
    if count > limit or count > (len(raw) - offset) // size:
        raise ValueError(f'Invalid VMD {label} records')
    return count, offset, offset + count * size


def _tail(raw):
    offset, counts = 0, {}
    for label, size in TAIL_SIZES:
        if offset == len(raw):
            return counts
        count, _, offset = _count(raw, offset, size, label)
        counts[label] = count
    if offset == len(raw):
        return counts
    count, offset, _ = _count(raw, offset, 9, 'IK display')
    counts['ik_display'] = count
    for _ in range(count):
        if offset + 9 > len(raw):
            raise ValueError('Truncated VMD IK display record')
        ik_count = struct.unpack_from('<I', raw, offset + 5)[0]
        offset += 9
        if ik_count > 1000 or ik_count > (len(raw) - offset) // 21:
            raise ValueError('Invalid VMD IK switch records')
        offset += ik_count * 21
    # Earlier in-project morph-only candidates wrote one extra empty tail count.
    # Preserve that known zero extension without accepting arbitrary trailing data.
    if offset + 4 == len(raw) and struct.unpack_from('<I', raw, offset)[0] == 0:
        counts['legacy_extra_zero'] = 0
        offset += 4
    if offset != len(raw):
        raise ValueError('Unknown VMD trailing bytes')
    return counts


def _name(raw):
    try:
        name = raw.split(b'\0', 1)[0].decode('cp932', errors='strict')
    except UnicodeDecodeError as exc:
        raise ValueError('VMD morph name is not CP932') from exc
    if not name or any(ord(char) < 32 for char in name):
        raise ValueError('VMD morph name invalid')
    return name


def inspect_morph_section(raw):
    """Return validated source sections and decoded morph identities/values."""
    if not isinstance(raw, bytes) or len(raw) > MAX_SOURCE_BYTES or raw[:30] != HEADER:
        raise ValueError('VMD 0002 source invalid or too large')
    bones, _ = _sections(raw)
    morph_count_offset = 54 + len(bones) * RECORD_SIZE
    count, start, end = _count(raw, morph_count_offset, MORPH_RECORD_SIZE,
                              'morph', MAX_MORPH_KEYS)
    rows, identities = [], set()
    for index in range(count):
        record = raw[start + index * MORPH_RECORD_SIZE:start + (index + 1) * MORPH_RECORD_SIZE]
        name = _name(record[:15])
        frame, weight = struct.unpack_from('<If', record, 15)
        if not math.isfinite(weight) or not 0 <= weight <= 1 or (name, frame) in identities:
            raise ValueError('Invalid or duplicate VMD morph record')
        identities.add((name, frame))
        rows.append({'name': name, 'frame': frame, 'weight': weight, 'raw': record})
    tail = raw[end:]
    counts = _tail(tail)
    return {'prefix': raw[:morph_count_offset], 'rows': rows, 'tail': tail,
            'boneKeys': len(bones), 'tailCounts': counts}


def _replacement(row):
    if not isinstance(row, dict) or set(row) != {'name', 'frame', 'weight'}:
        raise ValueError('VMD morph replacement fields invalid')
    name, frame, weight = row['name'], row['frame'], row['weight']
    if (not isinstance(name, str) or not name or any(ord(char) < 32 for char in name)
            or type(frame) is not int or not 0 <= frame <= 1_000_000
            or type(weight) not in (int, float) or not math.isfinite(weight)
            or not 0 <= weight <= 1):
        raise ValueError('VMD morph replacement invalid')
    try:
        encoded = name.encode('cp932', errors='strict')
    except UnicodeEncodeError as exc:
        raise ValueError('VMD morph name cannot be encoded') from exc
    if not 1 <= len(encoded) <= 15 or b'\0' in encoded:
        raise ValueError('VMD morph name exceeds 15 bytes')
    packed = encoded.ljust(15, b'\0') + struct.pack('<If', frame, weight)
    if not math.isfinite(struct.unpack_from('<f', packed, 19)[0]):
        raise ValueError('VMD morph weight exceeds float32')
    return (name, frame), packed


def rewrite_morph_section(raw, replacements, removals=()):
    """Rewrite only selected morph identities; preserve all other sections."""
    source = inspect_morph_section(raw)
    if not isinstance(replacements, list) or not isinstance(removals, (list, tuple, set)):
        raise ValueError('Morph replacements/removals invalid')
    updates = {}
    for row in replacements:
        identity, packed = _replacement(row)
        if identity in updates:
            raise ValueError('Duplicate VMD morph replacement')
        updates[identity] = packed
    drops = set()
    for identity in removals:
        if (not isinstance(identity, tuple) or len(identity) != 2
                or not isinstance(identity[0], str) or type(identity[1]) is not int):
            raise ValueError('VMD morph removal identity invalid')
        drops.add(identity)
    source_identities = {(row['name'], row['frame']) for row in source['rows']}
    if not drops <= source_identities:
        raise ValueError('VMD morph removal does not exist in source')
    result = {}
    replaced = removed = 0
    for row in source['rows']:
        identity = row['name'], row['frame']
        if identity in drops:
            removed += 1
            continue
        if identity in updates:
            result[identity] = updates[identity]
            replaced += 1
        else:
            result[identity] = row['raw']
    added = 0
    for identity, packed in updates.items():
        if identity not in result:
            result[identity] = packed
            added += 1
    if len(result) > MAX_MORPH_KEYS:
        raise ValueError('VMD morph key limit exceeded')
    ordered = [result[identity] for identity in sorted(result, key=lambda item: (item[1], item[0]))]
    output = source['prefix'] + struct.pack('<I', len(ordered)) + b''.join(ordered) + source['tail']
    if len(output) > MAX_SOURCE_BYTES:
        raise ValueError('Output VMD exceeds size limit')
    checked = inspect_morph_section(output)
    if (checked['prefix'] != source['prefix'] or checked['tail'] != source['tail']
            or [(row['name'], row['frame'], row['raw']) for row in checked['rows']] !=
               [(name, frame, result[(name, frame)]) for name, frame in
                sorted(result, key=lambda item: (item[1], item[0]))]):
        raise ValueError('VMD morph rewrite readback failed')
    report = {'sourceBoneKeys': source['boneKeys'], 'sourceMorphKeys': len(source['rows']),
              'outputMorphKeys': len(ordered), 'replaced': replaced, 'removed': removed,
              'added': added, 'tailCounts': source['tailCounts'],
              'prefixSha256': hashlib.sha256(source['prefix']).hexdigest(),
              'tailSha256': hashlib.sha256(source['tail']).hexdigest(),
              'validation': 'binary_only_requires_real_pmx_roundtrip'}
    return output, report
