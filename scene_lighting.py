"""Validated, portable multi-light timeline for the SCR-06 workspace.

Values are editor units (metres, degrees, RGB 0..255), independent of Three.js
and of the source GLB. A VMD light track cannot preserve this collection.
"""
import math
import re

MAX_LIGHTS = 128
MAX_KEYS = 5000
LIGHT_TYPES = {'directional', 'spot', 'point'}
LIGHT_KEYS = {'id', 'name', 'type', 'keys'}
FRAME_KEYS = {'frame', 'position', 'rotation', 'rgb', 'intensity', 'distance', 'angle', 'penumbra', 'enabled'}


def _number(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('invalid workspace lights ' + label)
    return float(value)


def _triple(value, low, high, label, integers=False):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError('invalid workspace lights ' + label)
    if integers:
        if any(type(v) is not int or not low <= v <= high for v in value):
            raise ValueError('invalid workspace lights ' + label)
        return list(value)
    return [_number(v, low, high, label) for v in value]


def validate_lights(value):
    """Return a new canonical value, or None to remove the optional field."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'schema', 'items'} or type(value['schema']) is not int or value['schema'] != 1:
        raise ValueError('invalid workspace lights schema')
    items = value['items']
    if not isinstance(items, list) or len(items) > MAX_LIGHTS:
        raise ValueError('invalid workspace lights count')
    out, ids, total_keys = [], set(), 0
    for item in items:
        if not isinstance(item, dict) or set(item) != LIGHT_KEYS:
            raise ValueError('invalid workspace lights item')
        ident, name, kind, keys = item['id'], item['name'], item['type'], item['keys']
        if not isinstance(ident, str) or not re.fullmatch(r'[a-z0-9-]{1,40}', ident) or ident in ids:
            raise ValueError('invalid workspace lights id')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or any(ord(c) < 32 for c in name):
            raise ValueError('invalid workspace lights name')
        if not isinstance(kind, str) or kind not in LIGHT_TYPES or not isinstance(keys, list) or not keys:
            raise ValueError('invalid workspace lights type or keys')
        ids.add(ident)
        total_keys += len(keys)
        if total_keys > MAX_KEYS:
            raise ValueError('invalid workspace lights key count')
        clean_keys, last_frame = [], -1
        for key in keys:
            if not isinstance(key, dict) or set(key) != FRAME_KEYS:
                raise ValueError('invalid workspace lights key')
            frame = key['frame']
            if type(frame) is not int or not last_frame < frame <= 1000000:
                raise ValueError('invalid workspace lights frame')
            if last_frame == -1 and frame != 0:
                raise ValueError('workspace lights require frame 0')
            if type(key['enabled']) is not bool:
                raise ValueError('invalid workspace lights enabled')
            clean_keys.append({
                'frame': frame,
                'position': _triple(key['position'], -1000, 1000, 'position'),
                'rotation': _triple(key['rotation'], -360, 360, 'rotation'),
                'rgb': _triple(key['rgb'], 0, 255, 'rgb', integers=True),
                'intensity': _number(key['intensity'], 0, 2000, 'intensity'),
                'distance': _number(key['distance'], 0, 1000, 'distance'),
                'angle': _number(key['angle'], 1, 89, 'angle'),
                'penumbra': _number(key['penumbra'], 0, 1, 'penumbra'),
                'enabled': key['enabled'],
            })
            last_frame = frame
        out.append({'id': ident, 'name': name.strip(), 'type': kind, 'keys': clean_keys})
    return {'schema': 1, 'items': out}
