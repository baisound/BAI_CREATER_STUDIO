"""Strict VMD 0002 morph-only writer; never alters source VMD or model files."""
from __future__ import annotations

import math
import struct

from vmd_readback import MAX_MORPH_KEYS, compare_vmd_morphs


def _name(value, width):
    if not isinstance(value, str) or not value or any(ord(ch) < 32 for ch in value):
        raise ValueError('VMD name invalid')
    try:
        encoded = value.encode('cp932', errors='strict')
    except UnicodeEncodeError as exc:
        raise ValueError('VMD name is not CP932 encodable') from exc
    if len(encoded) >= width:
        raise ValueError('VMD name exceeds fixed byte field')
    return encoded + b'\0' * (width - len(encoded))


def encode_morph_vmd(model_name, records):
    """Encode (name, frame, weight) records with exact structural readback."""
    if not isinstance(records, list) or not records or len(records) > MAX_MORPH_KEYS:
        raise ValueError('VMD requires 1 to 100000 morph records')
    rows = []
    for row in records:
        if not isinstance(row, dict) or set(row) != {'name', 'frame', 'weight'}:
            raise ValueError('Invalid VMD morph fields')
        name = row['name']
        packed_name = _name(name, 15)
        frame, weight = row['frame'], row['weight']
        if (type(frame) is not int or not 0 <= frame <= 1_000_000
                or type(weight) not in (int, float) or not math.isfinite(weight)
                or not 0 <= weight <= 1):
            raise ValueError('Invalid VMD morph frame or weight')
        rows.append((name, packed_name, frame, float(weight)))
    rows.sort(key=lambda item: (item[2], item[0]))
    if any((a[2], a[0]) == (b[2], b[0]) for a, b in zip(rows, rows[1:])):
        raise ValueError('Morph keys collide on VMD frame')
    header = _name('Vocaloid Motion Data 0002', 30) + _name(model_name, 20)
    payload = bytearray(header)
    payload.extend(struct.pack('<II', 0, len(rows)))
    for _, packed_name, frame, weight in rows:
        payload.extend(packed_name)
        payload.extend(struct.pack('<If', frame, weight))
    payload.extend(b'\0' * 20)
    normalized = [{'name': name, 'frame': frame, 'weight': weight}
                  for name, _, frame, weight in rows]
    compare_vmd_morphs(bytes(payload), normalized)
    return bytes(payload)
