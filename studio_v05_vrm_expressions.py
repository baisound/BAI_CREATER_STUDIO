"""Read-only VRM 0.x/1.0 expression inventory for registered model sources."""
from __future__ import annotations

import hashlib
import json
import re
import struct
from pathlib import Path


class VrmExpressionError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


VOWELS_0 = {'A': 'a', 'I': 'i', 'U': 'u', 'E': 'e', 'O': 'o'}
VOWELS_1 = {'A': 'aa', 'I': 'ih', 'U': 'ou', 'E': 'ee', 'O': 'oh'}


def _read_glb_json(source: Path):
    size = source.stat().st_size
    if size > 300 * 1024 * 1024:
        raise VrmExpressionError('VRM input too large', 413)
    with source.open('rb') as stream:
        header = stream.read(20)
        if len(header) != 20:
            raise VrmExpressionError('VRM GLB header incomplete')
        magic, version, length, chunk_length, chunk_type = struct.unpack('<4sIIII', header)
        if magic != b'glTF' or version != 2 or length != size or chunk_type != 0x4E4F534A \
                or chunk_length > size - 20 or chunk_length > 32 * 1024 * 1024:
            raise VrmExpressionError('VRM GLB JSON chunk invalid')
        try:
            data = json.loads(stream.read(chunk_length))
        except (ValueError, UnicodeError) as exc:
            raise VrmExpressionError('VRM GLB JSON invalid') from exc
    if not isinstance(data, dict):
        raise VrmExpressionError('VRM GLB JSON invalid')
    return data


def _sha256(source: Path):
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _target_count(meshes, mesh_index):
    if type(mesh_index) is not int or not 0 <= mesh_index < len(meshes):
        return -1
    mesh = meshes[mesh_index]
    if not isinstance(mesh, dict):
        return -1
    primitives = mesh.get('primitives', [])
    if not isinstance(primitives, list):
        return -1
    return max((len(p.get('targets', [])) for p in primitives if isinstance(p, dict)
                and isinstance(p.get('targets', []), list)), default=0)


def _bind_state(document, bind, version):
    if not isinstance(bind, dict):
        return False, False
    meshes = document.get('meshes', [])
    if not isinstance(meshes, list):
        return False, False
    if version == '0':
        count = _target_count(meshes, bind.get('mesh'))
        weight = bind.get('weight')
        valid_weight = type(weight) in (int, float) and 0 <= weight <= 100
    else:
        nodes = document.get('nodes', [])
        index = bind.get('node')
        if not isinstance(nodes, list) or type(index) is not int or not 0 <= index < len(nodes) \
                or not isinstance(nodes[index], dict):
            return False, False
        count = _target_count(meshes, nodes[index].get('mesh'))
        weight = bind.get('weight')
        valid_weight = type(weight) in (int, float) and 0 <= weight <= 1
    morph_index = bind.get('index')
    valid = count > 0 and type(morph_index) is int and 0 <= morph_index < count and valid_weight
    return valid, valid and weight > 0


def analyze(document: dict):
    ext = document.get('extensions', {})
    if not isinstance(ext, dict):
        raise VrmExpressionError('VRM extensions invalid')
    if isinstance(ext.get('VRMC_vrm'), dict):
        version = '1'
        defs = ext['VRMC_vrm'].get('expressions', {})
        if not isinstance(defs, dict):
            raise VrmExpressionError('VRM 1.0 expressions invalid')
        groups = []
        for kind in ('preset', 'custom'):
            section = defs.get(kind, {})
            if not isinstance(section, dict):
                raise VrmExpressionError('VRM 1.0 expressions invalid')
            for name, value in section.items():
                if not isinstance(value, dict) or not isinstance(name, str):
                    raise VrmExpressionError('VRM 1.0 expression invalid')
                groups.append((kind, name, value, value.get('morphTargetBinds', []),
                               'materialColorBinds'))
        vowel_names = VOWELS_1
    elif isinstance(ext.get('VRM'), dict):
        version = '0'
        groups = []
        master = ext['VRM'].get('blendShapeMaster', {})
        if not isinstance(master, dict):
            raise VrmExpressionError('VRM 0.x expressions invalid')
        defs = master.get('blendShapeGroups', [])
        if not isinstance(defs, list):
            raise VrmExpressionError('VRM 0.x expressions invalid')
        for index, value in enumerate(defs):
            if not isinstance(value, dict):
                raise VrmExpressionError('VRM 0.x expression invalid')
            preset = str(value.get('presetName', 'unknown')).lower()
            kind = 'preset' if preset != 'unknown' else 'custom'
            name = preset if kind == 'preset' else str(value.get('name', f'group-{index}'))
            groups.append((kind, name, value, value.get('binds', []), 'materialValues'))
        vowel_names = VOWELS_0
    else:
        raise VrmExpressionError('VRM extension not found')
    if len(groups) > 512:
        raise VrmExpressionError('Too many VRM expressions')
    expressions = []
    for kind, name, value, binds, material_field in groups:
        if not isinstance(binds, list):
            raise VrmExpressionError('VRM morph binds invalid')
        states = [_bind_state(document, bind, version) for bind in binds]
        valid_count = sum(valid for valid, _ in states)
        nonzero_count = sum(nonzero for _, nonzero in states)
        materials = value.get(material_field, [])
        if not isinstance(materials, list):
            raise VrmExpressionError('VRM material binds invalid')
        expressions.append({'kind': kind, 'name': name, 'morphBindCount': len(binds),
                            'validMorphBinds': valid_count, 'nonzeroMorphBinds': nonzero_count,
                            'invalidMorphBinds': len(binds) - valid_count,
                            'materialBindCount': len(materials),
                            'isBinary': value.get('isBinary') is True,
                            'inputRange': [0, 1], 'bindWeightRange': [0, 100 if version == '0' else 1]})
    vowels = {}
    for shape, preset in vowel_names.items():
        rows = [row for row in expressions if row['kind'] == 'preset' and row['name'] == preset]
        if not rows:
            status = 'missing'
        elif any(row['invalidMorphBinds'] for row in rows):
            status = 'invalid_bind'
        elif any(row['nonzeroMorphBinds'] for row in rows):
            status = 'ready'
        else:
            status = 'unbound'
        vowels[shape] = {'preset': preset, 'status': status,
                         'expressionNames': [row['name'] for row in rows]}
    return {'schema': 1, 'version': version, 'expressions': expressions, 'vowels': vowels}


def inspect(asset_id: str, assets: list[dict], source_for, expected_hash: str | None = None):
    if not isinstance(asset_id, str) or not 0 < len(asset_id) <= 300:
        raise VrmExpressionError('Invalid VRM asset ID', 400)
    if expected_hash is not None and not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
        raise VrmExpressionError('Invalid VRM model hash', 400)
    entry = next((item for item in assets if item.get('id') == asset_id), None)
    if not entry or entry.get('format') != 'VRM' or not entry.get('available'):
        raise VrmExpressionError('Registered VRM asset not found', 404)
    source = source_for(entry)
    if source is None or Path(source).suffix.lower() != '.vrm':
        raise VrmExpressionError('Registered VRM source unavailable', 404)
    source = Path(source)
    try:
        before = _sha256(source)
        if expected_hash is not None and expected_hash != before:
            raise VrmExpressionError('VRM model hash changed', 409)
        result = analyze(_read_glb_json(source))
        if _sha256(source) != before:
            raise VrmExpressionError('VRM model hash changed', 409)
    except OSError as exc:
        raise VrmExpressionError('VRM expression read failed') from exc
    body = {'asset_id': asset_id, **result, 'modelHash': before}
    body['analysisHash'] = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False,
                                                      separators=(',', ':')).encode()).hexdigest()
    return body
