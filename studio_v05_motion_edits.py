"""Project-scoped, revisioned PMX FK rotation corrections (MOTION-010 stage A).

Only registered MMD PMX/VMD sources are accepted. The original assets are read-only.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import threading
import uuid
from pathlib import Path

from pmx_bones import parse as parse_pmx
from studio_project_catalog import load as load_catalog, _atomic
from studio_v05_multi_motion import plan as motion_plan

LOCK = threading.RLock()
MAX_KEYS = 1024
MAX_LAYERS = 32
MAX_HISTORY = 80


class MotionEditError(ValueError):
    pass


def _project(catalog, project_id):
    if not isinstance(project_id, str) or not project_id or len(project_id) > 100:
        raise MotionEditError('Invalid project ID')
    found = next((p for p in load_catalog(catalog)['projects'] if p['id'] == project_id), None)
    if found is None or not _uuid(project_id):
        raise MotionEditError('Project not found')
    fps = found.get('fps', 60)
    if type(fps) not in (int, float) or not math.isfinite(fps) or not 1 <= fps <= 240:
        raise MotionEditError('Invalid project FPS')
    return float(fps)


def _uuid(value):
    try:
        return str(uuid.UUID(value)) == value
    except (TypeError, ValueError, AttributeError):
        return False


def _path(root, project_id):
    if not _uuid(project_id):
        raise MotionEditError('Invalid project ID')
    return Path(root) / (project_id + '.json')


def _registered_path(data_root, asset, fmt, slot):
    if not isinstance(asset, dict) or not asset.get('available') or asset.get('source') != 'mmd' \
            or asset.get('format') != fmt or asset.get('kind') not in slot:
        raise MotionEditError('Registered PMX/VMD source required')
    root = (Path(data_root) / 'mmd' / asset['kind']).resolve()
    candidate = (root / asset.get('name', '')).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file() or candidate.suffix.lower() != '.' + fmt.lower():
        raise MotionEditError('Registered PMX/VMD source missing')
    return candidate


def _digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def _context(data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets, instance_id, clip_id):
    fps = _project(catalog, project_id)
    plan = motion_plan(arrangement_root, scene_root, legacy_root, catalog, project_id, assets)
    row = next((r for r in plan['rows'] if r['clip_id'] == clip_id), None)
    instance = next((i for i in plan['instances'] if i['id'] == instance_id), None)
    if not row or not instance or row['target_scene_instance_id'] != instance_id or row['status'] != 'ready':
        raise MotionEditError('Ready PMX/VMD clip and scene instance required')
    if instance['locked']:
        raise MotionEditError('Scene instance locked')
    lookup = {a['id']: a for a in assets if isinstance(a, dict) and isinstance(a.get('id'), str)}
    model_id, motion_id = instance['asset_id'], row['asset_id']
    model = _registered_path(data_root, lookup.get(model_id), 'PMX', ('A', 'B'))
    motion = _registered_path(data_root, lookup.get(motion_id), 'VMD', ('vmd',))
    start = row['start']
    duration = row['duration']
    if type(start) not in (int, float) or type(duration) not in (int, float) or \
            not math.isfinite(start) or not math.isfinite(duration) or start < 0 or duration <= 0:
        raise MotionEditError('Invalid motion clip time')
    return {'instance_id': instance_id, 'clip_id': clip_id,
            'model_asset_id': model_id, 'motion_asset_id': motion_id,
            'model_sha256': _digest(model), 'motion_sha256': _digest(motion),
            'fps': fps, 'start': start, 'duration': duration, 'model_path': model}


def _identity(layer):
    return {field: layer[field] for field in ('instance_id', 'clip_id', 'model_asset_id',
            'motion_asset_id', 'model_sha256', 'motion_sha256', 'fps', 'start', 'duration')}


def _key(value):
    if not isinstance(value, dict) or set(value) != {'frame', 'bone', 'rotation'}:
        raise MotionEditError('Invalid FK key fields')
    frame, bone, rotation = value['frame'], value['bone'], value['rotation']
    if type(frame) is not int or not 0 <= frame <= 24 * 60 * 60 * 240:
        raise MotionEditError('Invalid frame')
    if not isinstance(bone, str) or not bone or len(bone) > 100 or any(ord(c) < 32 for c in bone):
        raise MotionEditError('Invalid bone name')
    try:
        if len(bone.encode('shift_jis')) > 15:
            raise MotionEditError('Bone name exceeds VMD limit')
    except UnicodeEncodeError as exc:
        raise MotionEditError('Bone name cannot be encoded for VMD') from exc
    if not isinstance(rotation, list) or len(rotation) != 4 or any(
            type(v) not in (float, int) or not math.isfinite(v) for v in rotation):
        raise MotionEditError('Invalid quaternion')
    norm = math.sqrt(sum(v * v for v in rotation))
    if not 0.999 <= norm <= 1.001:
        raise MotionEditError('Quaternion must be normalized')
    return {'frame': frame, 'bone': bone, 'rotation': [round(float(v / norm), 9) for v in rotation]}


def _record(data, project_id):
    if not isinstance(data, dict) or set(data) != {'schema', 'project_id', 'revision', 'layers', 'history'} \
            or data['schema'] != 1 or data['project_id'] != project_id \
            or type(data['revision']) is not int or data['revision'] < 0:
        raise MotionEditError('Invalid motion edits file; original retained')
    if not isinstance(data['layers'], list) or len(data['layers']) > MAX_LAYERS:
        raise MotionEditError('Invalid motion edit layers; original retained')
    ids = set()
    targets = set()
    for layer in data['layers']:
        if not isinstance(layer, dict) or set(layer) != {'id', 'instance_id', 'clip_id', 'model_asset_id',
                'motion_asset_id', 'model_sha256', 'motion_sha256', 'fps', 'start', 'duration',
                'name', 'weight', 'muted', 'keys'} or not _uuid(layer['id']) or layer['id'] in ids:
            raise MotionEditError('Invalid motion edit layer; original retained')
        ids.add(layer['id'])
        target = (layer['instance_id'], layer['clip_id'])
        if target in targets:
            raise MotionEditError('Duplicate motion edit target; original retained')
        targets.add(target)
        if any(not isinstance(layer[x], str) or not layer[x] for x in
               ('instance_id', 'clip_id', 'model_asset_id', 'motion_asset_id', 'name')) \
                or any(not isinstance(layer[x], str) or len(layer[x]) != 64 or \
                       any(c not in '0123456789abcdef' for c in layer[x]) for x in
                       ('model_sha256', 'motion_sha256')) \
                or type(layer['fps']) not in (float, int) or not math.isfinite(layer['fps']) or not 1 <= layer['fps'] <= 240 \
                or type(layer['start']) not in (float, int) or not math.isfinite(layer['start']) or layer['start'] < 0 \
                or type(layer['duration']) not in (float, int) or not math.isfinite(layer['duration']) or layer['duration'] <= 0 \
                or type(layer['weight']) not in (float, int) or not math.isfinite(layer['weight']) or not 0 <= layer['weight'] <= 1 \
                or type(layer['muted']) is not bool or len(layer['name']) > 80 \
                or any(ord(c) < 32 for c in layer['name']):
            raise MotionEditError('Invalid motion edit layer metadata; original retained')
        keys = layer['keys']
        if not isinstance(keys, list) or len(keys) > MAX_KEYS:
            raise MotionEditError('Invalid FK keys; original retained')
        identities = set()
        for key in keys:
            _key(key)
            first = math.ceil(layer['start'] * layer['fps'] - 1e-7)
            end = math.ceil((layer['start'] + layer['duration']) * layer['fps'] - 1e-7)
            if not first <= key['frame'] < end:
                raise MotionEditError('FK key outside saved clip; original retained')
            identity = (key['frame'], key['bone'])
            if identity in identities:
                raise MotionEditError('Duplicate FK key; original retained')
            identities.add(identity)
    history = data['history']
    if not isinstance(history, dict) or set(history) != {'undo', 'redo'}:
        raise MotionEditError('Invalid motion edit history; original retained')
    for stack in history.values():
        if not isinstance(stack, list) or len(stack) > MAX_HISTORY:
            raise MotionEditError('Invalid motion edit history; original retained')
        for snapshot in stack:
            if not isinstance(snapshot, list) or len(snapshot) > MAX_LAYERS:
                raise MotionEditError('Invalid motion edit history snapshot; original retained')
            _record({'schema': 1, 'project_id': project_id, 'revision': 0,
                     'layers': snapshot, 'history': {'undo': [], 'redo': []}}, project_id)
    return data


def read(root, catalog, project_id):
    _project(catalog, project_id)
    path = _path(root, project_id)
    if not path.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0,
                'layers': [], 'history': {'undo': [], 'redo': []}}
    try:
        if path.stat().st_size > 8 * 1024 * 1024:
            raise MotionEditError('Motion edits file exceeds safe size; original retained')
        return _record(json.loads(path.read_text(encoding='utf-8')), project_id)
    except (ValueError, OSError) as exc:
        raise MotionEditError('Motion edits file unreadable; original retained') from exc


def view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets):
    current = read(root, catalog, project_id)
    layers = copy.deepcopy(current['layers'])
    issues = []
    for layer in layers:
        try:
            context = _context(data_root, scene_root, legacy_root, arrangement_root,
                               catalog, project_id, assets, layer['instance_id'], layer['clip_id'])
            if _identity(layer) != _identity(context):
                raise MotionEditError('Source or clip placement changed')
            if layer['keys']:
                names = {bone['name'] for bone in parse_pmx(context['model_path'].read_bytes())['bones_detail']}
                if any(key['bone'] not in names for key in layer['keys']):
                    raise MotionEditError('Saved FK bone is absent from registered PMX')
        except (MotionEditError, ValueError, OSError) as exc:
            layer['disabled'] = True
            issues.append({'layer_id': layer['id'], 'reason': str(exc)})
    return {'schema': 1, 'project_id': project_id, 'revision': current['revision'],
            'layers': layers, 'issues': issues,
            'can_undo': bool(current['history']['undo']), 'can_redo': bool(current['history']['redo'])}


def mutate(root, data_root, scene_root, legacy_root, arrangement_root, catalog,
           project_id, revision, action, assets, *, instance_id=None, clip_id=None, key=None):
    if type(revision) is not int or revision < 0:
        raise MotionEditError('Revision required')
    if action not in ('set', 'remove', 'undo', 'redo'):
        raise MotionEditError('Unknown motion edit action')
    with LOCK:
        current = read(root, catalog, project_id)
        if current['revision'] != revision:
            raise MotionEditError('Revision conflict')
        if action in ('undo', 'redo'):
            if instance_id is not None or clip_id is not None or key is not None:
                raise MotionEditError('Undo/Redo accepts only project and revision')
            source = current['history'][action]
            target = current['history']['redo' if action == 'undo' else 'undo']
            if not source:
                raise MotionEditError('No motion edit history available')
            target.append(copy.deepcopy(current['layers']))
            del target[:-MAX_HISTORY]
            current['layers'] = source.pop()
        else:
            if not isinstance(instance_id, str) or not isinstance(clip_id, str):
                raise MotionEditError('Select a scene instance and motion clip')
            context = _context(data_root, scene_root, legacy_root, arrangement_root,
                               catalog, project_id, assets, instance_id, clip_id)
            checked = _key(key)
            start = math.ceil(context['start'] * context['fps'] - 1e-7)
            end = math.ceil((context['start'] + context['duration']) * context['fps'] - 1e-7)
            if not start <= checked['frame'] < end:
                raise MotionEditError('Frame is outside the motion clip')
            if action == 'set':
                try:
                    names = {row['name'] for row in parse_pmx(context['model_path'].read_bytes())['bones_detail']}
                except (ValueError, OSError) as exc:
                    raise MotionEditError('PMX bones cannot be inspected') from exc
                if checked['bone'] not in names:
                    raise MotionEditError('Bone is absent from registered PMX')
            before = copy.deepcopy(current['layers'])
            layer = next((l for l in current['layers'] if l['instance_id'] == instance_id and
                          l['clip_id'] == clip_id), None)
            if layer and _identity(layer) != _identity(context):
                raise MotionEditError('Source or clip placement changed')
            if not layer:
                if action == 'remove':
                    raise MotionEditError('FK key not found')
                if len(current['layers']) >= MAX_LAYERS:
                    raise MotionEditError('Motion edit layer limit reached')
                layer = {**_identity(context), 'id': str(uuid.uuid4()), 'name': 'FK補正',
                         'weight': 1.0, 'muted': False, 'keys': []}
                current['layers'].append(layer)
            old = next((k for k in layer['keys'] if k['frame'] == checked['frame'] and
                        k['bone'] == checked['bone']), None)
            if action == 'remove' and old is None:
                raise MotionEditError('FK key not found')
            if action == 'set' and old == checked:
                return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
            if old is not None:
                layer['keys'].remove(old)
            if action == 'set':
                if len(layer['keys']) >= MAX_KEYS:
                    raise MotionEditError('FK key limit reached')
                layer['keys'].append(checked)
                layer['keys'].sort(key=lambda k: (k['frame'], k['bone']))
            if not layer['keys']:
                current['layers'].remove(layer)
            current['history']['undo'].append(before)
            del current['history']['undo'][:-MAX_HISTORY]
            current['history']['redo'] = []
        current['revision'] += 1
        _record(current, project_id)
        _atomic(_path(root, project_id), current)
        return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
