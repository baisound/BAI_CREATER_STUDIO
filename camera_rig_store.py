"""Validate persisted Phase E rig editor configuration (schema 1 extension)."""
import math

VECTORS = ('start', 'control', 'end')

def validate_rig(data):
    if not isinstance(data, dict):
        raise ValueError('rig config must be an object')
    result = {}
    if data.get('type') not in ('orbit', 'crane', 'rail', 'curve', 'follow', 'parent'):
        raise ValueError('invalid rig type')
    result['type'] = data['type']
    for name in VECTORS:
        value = data.get(name)
        if not isinstance(value, list) or len(value) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) or abs(v)>10000 for v in value):
            raise ValueError('invalid rig ' + name)
        result[name] = [float(v) for v in value]
    value = data.get('amount', 0)
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 360:
        raise ValueError('invalid rig amount')
    result['amount'] = float(value)
    for name in ('constant_speed', 'show_path'):
        if type(data.get(name)) is not bool:
            raise ValueError('invalid rig ' + name)
        result[name] = data[name]
    for name in ('bake_from', 'bake_to', 'bake_step'):
        value=data.get(name)
        if type(value) is not int or value < (1 if name=='bake_step' else 0) or value > 1000000:
            raise ValueError('invalid rig ' + name)
        result[name] = value
    if data.get('bake_ease') not in ('linear','smooth'):
        raise ValueError('invalid rig easing')
    result['bake_ease'] = data['bake_ease']
    return result
