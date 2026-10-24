"""Revisioned v0.5 PMX mouth mappings, scoped to a project and exact source hash.

This is a narrow v0.5 store until the planned production.lip bundle exists.
It does not change scene instances, face keys or the source PMX.
"""
from __future__ import annotations

import math
import re
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic, load as load_catalog
from studio_v05_pmx_analysis import inspect, PmxAnalysisError, _sha256

LOCK = threading.RLock()
SHAPES = ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')
VOWELS = SHAPES[:5]
HASH = re.compile(r'[0-9a-f]{64}\Z')


class MorphMapError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def _project(catalog, project_id):
    if (not isinstance(project_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', project_id)
            or not any(item.get('id') == project_id for item in load_catalog(catalog)['projects'])):
        raise MorphMapError('Project not found', 404)


def _entry(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'morph_id', 'morph_name', 'weight'}:
        raise MorphMapError('Morph map entry fields invalid')
    index, name, weight = value['morph_id'], value['morph_name'], value['weight']
    if type(index) is not int or index < 0 or index > 100000:
        raise MorphMapError('Morph ID invalid')
    if not isinstance(name, str) or not 0 < len(name) <= 100 or any(ord(ch) < 32 for ch in name):
        raise MorphMapError('Morph name invalid')
    if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) \
            or not 0 <= weight <= 1:
        raise MorphMapError('Morph weight must be 0–1')
    return {'morph_id': index, 'morph_name': name, 'weight': round(float(weight), 6)}


def _map(value):
    fields = {'id', 'model_asset_id', 'model_hash', 'analysis_hash', 'entries', 'confirmed'}
    if not isinstance(value, dict) or set(value) != fields:
        raise MorphMapError('Morph map fields invalid')
    try:
        uuid.UUID(value['id'])
    except (ValueError, TypeError, AttributeError) as exc:
        raise MorphMapError('Morph map ID invalid') from exc
    if not isinstance(value['model_asset_id'], str) or not 0 < len(value['model_asset_id']) <= 300:
        raise MorphMapError('Morph map asset invalid')
    if any(not isinstance(value[field], str) or not HASH.fullmatch(value[field])
           for field in ('model_hash', 'analysis_hash')):
        raise MorphMapError('Morph map hash invalid')
    entries = value['entries']
    if not isinstance(entries, dict) or set(entries) != set(SHAPES):
        raise MorphMapError('All mouth shape fields required')
    checked = {shape: _entry(entries[shape]) for shape in SHAPES}
    if type(value['confirmed']) is not bool or value['confirmed'] and any(checked[s] is None for s in VOWELS):
        raise MorphMapError('Confirmed map requires five selected vowels')
    return {**value, 'entries': checked}


def _stored(root, catalog, project_id):
    _project(catalog, project_id)
    file = Path(root) / (project_id + '.json')
    if not file.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0, 'maps': []}
    try:
        import json
        data = json.loads(file.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or set(data) != {'schema', 'project_id', 'revision', 'maps'} \
                or data['schema'] != 1 or data['project_id'] != project_id \
                or type(data['revision']) is not int or data['revision'] < 0 \
                or not isinstance(data['maps'], list) or len(data['maps']) > 32:
            raise MorphMapError('Morph map file invalid; original retained')
        ids, identities = set(), set()
        for raw in data['maps']:
            row = _map(raw)
            identity = (row['model_asset_id'], row['model_hash'])
            if row != raw or row['id'] in ids or identity in identities:
                raise MorphMapError('Morph map record invalid; original retained')
            ids.add(row['id']); identities.add(identity)
        return data
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise MorphMapError('Morph map file unreadable; original retained') from exc


def read(root, catalog, project_id, assets, source_for):
    with LOCK:
        data = _stored(root, catalog, project_id)
        out = {**data, 'maps': []}
        for row in data['maps']:
            asset = next((a for a in assets if a.get('id') == row['model_asset_id']
                          and a.get('format') == 'PMX' and a.get('available')), None)
            source = source_for(asset) if asset else None
            try:
                status = 'valid' if source and _sha256(Path(source)) == row['model_hash'] else 'changed' if source else 'missing'
            except OSError:
                status = 'missing'
            out['maps'].append({**row, 'source_status': status})
        return out


def mutate(root, catalog, project_id, revision, action, assets, source_for,
           model_asset_id=None, model_hash=None, analysis_hash=None, entries=None,
           confirmed=None, map_id=None):
    if type(revision) is not int or revision < 0:
        raise MorphMapError('Revision required', 400)
    if action not in ('set', 'remove'):
        raise MorphMapError('Unknown morph map action', 400)
    with LOCK:
        data = _stored(root, catalog, project_id)
        if data['revision'] != revision:
            raise MorphMapError('Revision conflict', 409)
        if action == 'remove':
            if (not isinstance(map_id, str) or not map_id or
                    any(x is not None for x in (model_asset_id, model_hash, analysis_hash, entries, confirmed))):
                raise MorphMapError('Remove requires only a map ID', 400)
            found = next((row for row in data['maps'] if row['id'] == map_id), None)
            if found is None:
                raise MorphMapError('Morph map not found', 404)
            data['maps'].remove(found)
        else:
            if map_id is not None:
                raise MorphMapError('Map ID is assigned by the server', 400)
            if (not isinstance(model_asset_id, str) or not isinstance(model_hash, str)
                    or not isinstance(analysis_hash, str) or type(confirmed) is not bool):
                raise MorphMapError('Model, hashes and confirmation required', 400)
            try:
                analysis = inspect(model_asset_id, assets, source_for, model_hash)
            except PmxAnalysisError as exc:
                raise MorphMapError(str(exc), exc.status) from exc
            if analysis_hash != analysis['analysisHash']:
                raise MorphMapError('PMX analysis hash changed', 409)
            existing = next((row for row in data['maps'] if row['model_asset_id'] == model_asset_id
                             and row['model_hash'] == model_hash), None)
            if not existing and len(data['maps']) >= 32:
                raise MorphMapError('Morph map limit is 32', 413)
            candidate = {'id': existing['id'] if existing else str(uuid.uuid4()),
                         'model_asset_id': model_asset_id, 'model_hash': model_hash,
                         'analysis_hash': analysis_hash, 'entries': entries,
                         'confirmed': confirmed}
            checked = _map(candidate)
            known = {row['id']: row for row in analysis['morphs']}
            for entry in checked['entries'].values():
                if entry and (entry['morph_id'] not in known or
                              entry['morph_name'] != known[entry['morph_id']]['name']):
                    raise MorphMapError('Mouth morph absent from registered PMX', 422)
            if existing:
                data['maps'][data['maps'].index(existing)] = checked
            else:
                data['maps'].append(checked)
        data['revision'] += 1
        _atomic(Path(root) / (project_id + '.json'), data)
        return read(root, catalog, project_id, assets, source_for)
