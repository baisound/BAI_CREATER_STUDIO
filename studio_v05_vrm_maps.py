"""Project-scoped manual VRM expression maps bound to registered source hashes.

The v0.5 map is independent of the planned production.lip bundle. It never
changes the VRM source, scene instances, or animation keys.
"""
from __future__ import annotations

import math
import re
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_morph_maps import _project
from studio_v05_vrm_expressions import inspect, VrmExpressionError, _sha256


LOCK = threading.RLock()
SHAPES = ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')
HASH = re.compile(r'[0-9a-f]{64}\Z')


class VrmMapError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _entry(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'expression_index', 'expression_name', 'kind', 'weight'}:
        raise VrmMapError('VRM map entry fields invalid')
    index, name, kind, weight = (value[key] for key in ('expression_index', 'expression_name', 'kind', 'weight'))
    if type(index) is not int or not 0 <= index < 512:
        raise VrmMapError('VRM expression index invalid')
    if not isinstance(name, str) or not 0 < len(name) <= 100 or any(ord(ch) < 32 for ch in name):
        raise VrmMapError('VRM expression name invalid')
    if kind not in ('preset', 'custom'):
        raise VrmMapError('VRM expression kind invalid')
    if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) or not 0 <= weight <= 1:
        raise VrmMapError('VRM expression weight must be 0–1')
    return {'expression_index': index, 'expression_name': name, 'kind': kind,
            'weight': round(float(weight), 6)}


def _map(value):
    fields = {'id', 'model_asset_id', 'model_hash', 'analysis_hash', 'entries', 'confirmed'}
    if not isinstance(value, dict) or set(value) != fields:
        raise VrmMapError('VRM map fields invalid')
    try:
        uuid.UUID(value['id'])
    except (ValueError, TypeError, AttributeError) as exc:
        raise VrmMapError('VRM map ID invalid') from exc
    if not isinstance(value['model_asset_id'], str) or not 0 < len(value['model_asset_id']) <= 300:
        raise VrmMapError('VRM map asset invalid')
    if any(not isinstance(value[field], str) or not HASH.fullmatch(value[field])
           for field in ('model_hash', 'analysis_hash')):
        raise VrmMapError('VRM map hash invalid')
    entries = value['entries']
    if not isinstance(entries, dict) or set(entries) != set(SHAPES):
        raise VrmMapError('All VRM mouth shape fields required')
    checked = {shape: _entry(entries[shape]) for shape in SHAPES}
    if type(value['confirmed']) is not bool or value['confirmed'] and any(checked[s] is None for s in SHAPES[:5]):
        raise VrmMapError('Confirmed VRM map requires five selected vowels')
    return {**value, 'entries': checked}


def _stored(root, catalog, project_id):
    try:
        _project(catalog, project_id)
    except ValueError as exc:
        raise VrmMapError(str(exc), getattr(exc, 'status', 422)) from exc
    file = Path(root) / (project_id + '.json')
    if not file.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0, 'maps': []}
    try:
        import json
        data = json.loads(file.read_text(encoding='utf-8'))
        if (not isinstance(data, dict) or set(data) != {'schema', 'project_id', 'revision', 'maps'}
                or data['schema'] != 1 or data['project_id'] != project_id
                or type(data['revision']) is not int or data['revision'] < 0
                or not isinstance(data['maps'], list) or len(data['maps']) > 32):
            raise VrmMapError('VRM map file invalid; original retained')
        identities, ids = set(), set()
        for raw in data['maps']:
            row = _map(raw)
            identity = (row['model_asset_id'], row['model_hash'])
            if row != raw or identity in identities or row['id'] in ids:
                raise VrmMapError('VRM map record invalid; original retained')
            identities.add(identity); ids.add(row['id'])
        return data
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise VrmMapError('VRM map file unreadable; original retained') from exc


def read(root, catalog, project_id, assets, source_for):
    with LOCK:
        data = _stored(root, catalog, project_id)
        out = {**data, 'maps': []}
        for row in data['maps']:
            asset = next((a for a in assets if a.get('id') == row['model_asset_id']
                          and a.get('format') == 'VRM' and a.get('available')), None)
            source = source_for(asset) if asset else None
            try:
                status = ('valid' if source and _sha256(Path(source)) == row['model_hash']
                          else 'changed' if source else 'missing')
            except OSError:
                status = 'missing'
            out['maps'].append({**row, 'source_status': status})
        return out


def mutate(root, catalog, project_id, revision, action, assets, source_for,
           model_asset_id=None, model_hash=None, analysis_hash=None, entries=None,
           confirmed=None, map_id=None):
    if type(revision) is not int or revision < 0:
        raise VrmMapError('Revision required', 400)
    if action not in ('set', 'remove'):
        raise VrmMapError('Unknown VRM map action', 400)
    with LOCK:
        data = _stored(root, catalog, project_id)
        if data['revision'] != revision:
            raise VrmMapError('Revision conflict', 409)
        if action == 'remove':
            if (not isinstance(map_id, str) or not map_id or
                    any(value is not None for value in (model_asset_id, model_hash, analysis_hash, entries, confirmed))):
                raise VrmMapError('Remove requires only a VRM map ID', 400)
            old = next((row for row in data['maps'] if row['id'] == map_id), None)
            if old is None:
                raise VrmMapError('VRM map not found', 404)
            data['maps'].remove(old)
        else:
            if map_id is not None:
                raise VrmMapError('VRM map ID is assigned by the server', 400)
            if (not isinstance(model_asset_id, str) or not isinstance(model_hash, str)
                    or not isinstance(analysis_hash, str) or type(confirmed) is not bool):
                raise VrmMapError('VRM model, hashes and confirmation required', 400)
            try:
                analysis = inspect(model_asset_id, assets, source_for, model_hash)
            except VrmExpressionError as exc:
                raise VrmMapError(str(exc), exc.status) from exc
            if analysis_hash != analysis['analysisHash']:
                raise VrmMapError('VRM expression analysis changed', 409)
            old = next((row for row in data['maps'] if row['model_asset_id'] == model_asset_id
                        and row['model_hash'] == model_hash), None)
            if old is None and len(data['maps']) >= 32:
                raise VrmMapError('VRM map limit is 32', 413)
            candidate = {'id': old['id'] if old else str(uuid.uuid4()),
                         'model_asset_id': model_asset_id, 'model_hash': model_hash,
                         'analysis_hash': analysis_hash, 'entries': entries,
                         'confirmed': confirmed}
            checked = _map(candidate)
            for shape, entry in checked['entries'].items():
                if entry is None:
                    continue
                index = entry['expression_index']
                row = analysis['expressions'][index] if index < len(analysis['expressions']) else None
                if row is None or row['name'] != entry['expression_name'] or row['kind'] != entry['kind']:
                    raise VrmMapError('Expression absent from registered VRM')
                if confirmed and shape in SHAPES[:5] and (row['invalidMorphBinds']
                        or not row['nonzeroMorphBinds'] or entry['weight'] <= 0):
                    raise VrmMapError('Confirmed vowel needs a valid nonzero morph bind and input weight')
            if old is None:
                data['maps'].append(checked)
            else:
                data['maps'][data['maps'].index(old)] = checked
        data['revision'] += 1
        _atomic(Path(root) / (project_id + '.json'), data)
        return read(root, catalog, project_id, assets, source_for)
