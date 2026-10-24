"""Project-scoped, revisioned PMX FK pose corrections (MOTION-010).

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
LIMBS = ('left_arm', 'right_arm', 'left_leg', 'right_leg')


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
    if not isinstance(value, dict) or not {'frame', 'bone', 'rotation'} <= set(value) \
            or set(value) - {'frame', 'bone', 'rotation', 'position'}:
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
    checked = {'frame': frame, 'bone': bone,
               'rotation': [round(float(v / norm), 9) for v in rotation]}
    if 'position' in value:
        position = value['position']
        if not isinstance(position, list) or len(position) != 3 or any(
                type(v) not in (float, int) or not math.isfinite(v) or abs(v) > 100000
                for v in position):
            raise MotionEditError('Invalid FK position delta')
        checked['position'] = [round(float(v), 9) for v in position]
    return checked


def _bounds(layer):
    first = math.ceil(layer['start'] * layer['fps'] - 1e-7)
    end = math.ceil((layer['start'] + layer['duration']) * layer['fps'] - 1e-7)
    return first, end


def _settings(layer):
    first, end = _bounds(layer)
    return {**{field: layer[field] for field in ('name', 'weight', 'muted')},
            'start_frame': layer.get('start_frame', first),
            'end_frame': layer.get('end_frame', end),
            'fade_in_frames': layer.get('fade_in_frames', 0),
            'fade_out_frames': layer.get('fade_out_frames', 0)}


def _check_settings(layer):
    settings = _settings(layer)
    first, end = _bounds(layer)
    if not isinstance(settings['name'], str) or not settings['name'] or len(settings['name']) > 80 \
            or any(ord(c) < 32 for c in settings['name']) \
            or type(settings['weight']) not in (float, int) or not math.isfinite(settings['weight']) \
            or not 0 <= settings['weight'] <= 1 or type(settings['muted']) is not bool \
            or any(type(settings[field]) is not int for field in
                   ('start_frame', 'end_frame', 'fade_in_frames', 'fade_out_frames')) \
            or not first <= settings['start_frame'] < settings['end_frame'] <= end \
            or min(settings['fade_in_frames'], settings['fade_out_frames']) < 0 \
            or settings['fade_in_frames'] + settings['fade_out_frames'] > settings['end_frame'] - settings['start_frame']:
        raise MotionEditError('Invalid motion edit layer settings; original retained')
    return settings


def _record(data, project_id):
    if not isinstance(data, dict) or not {'schema', 'project_id', 'revision', 'layers', 'history'} <= set(data) \
            or set(data) - {'schema', 'project_id', 'revision', 'layers', 'history', 'fk_ik_modes'} \
            or data['schema'] != 1 or data['project_id'] != project_id \
            or type(data['revision']) is not int or data['revision'] < 0:
        raise MotionEditError('Invalid motion edits file; original retained')
    modes = data.get('fk_ik_modes', {})
    if not isinstance(modes, dict) or len(modes) > 64:
        raise MotionEditError('Invalid FK/IK modes; original retained')
    for instance_id, limbs in modes.items():
        if not isinstance(instance_id, str) or not 0 < len(instance_id) <= 100 \
                or any(ord(char) < 32 for char in instance_id) \
                or not isinstance(limbs, dict) or not limbs \
                or set(limbs) - set(LIMBS) or any(mode not in ('FK', 'IK') for mode in limbs.values()):
            raise MotionEditError('Invalid FK/IK mode; original retained')
    if not isinstance(data['layers'], list) or len(data['layers']) > MAX_LAYERS:
        raise MotionEditError('Invalid motion edit layers; original retained')
    ids = set()
    targets = set()
    for layer in data['layers']:
        required = {'id', 'instance_id', 'clip_id', 'model_asset_id',
                'motion_asset_id', 'model_sha256', 'motion_sha256', 'fps', 'start', 'duration',
                'name', 'weight', 'muted', 'keys'}
        optional = {'start_frame', 'end_frame', 'fade_in_frames', 'fade_out_frames'}
        if not isinstance(layer, dict) or not required <= set(layer) or set(layer) - required - optional \
                or not _uuid(layer['id']) or layer['id'] in ids:
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
                or type(layer['duration']) not in (float, int) or not math.isfinite(layer['duration']) or layer['duration'] <= 0:
            raise MotionEditError('Invalid motion edit layer metadata; original retained')
        _check_settings(layer)
        keys = layer['keys']
        if not isinstance(keys, list) or len(keys) > MAX_KEYS:
            raise MotionEditError('Invalid FK keys; original retained')
        identities = set()
        for key in keys:
            _key(key)
            first, end = _bounds(layer)
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
                'layers': [], 'fk_ik_modes': {}, 'history': {'undo': [], 'redo': []}}
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
            'layers': layers, 'fk_ik_modes': copy.deepcopy(current.get('fk_ik_modes', {})), 'issues': issues,
            'can_undo': bool(current['history']['undo']), 'can_redo': bool(current['history']['redo'])}


def mutate(root, data_root, scene_root, legacy_root, arrangement_root, catalog,
           project_id, revision, action, assets, *, instance_id=None, clip_id=None,
           key=None, keys=None, layer_id=None, settings=None, to_frame=None, limb=None, mode=None):
    if type(revision) is not int or revision < 0:
        raise MotionEditError('Revision required')
    if action not in ('set', 'arm-set', 'remove', 'move', 'layer-update', 'mode-set', 'undo', 'redo'):
        raise MotionEditError('Unknown motion edit action')
    with LOCK:
        current = read(root, catalog, project_id)
        if current['revision'] != revision:
            raise MotionEditError('Revision conflict')
        if action == 'mode-set':
            if any(value is not None for value in (key, keys, layer_id, settings, to_frame)) \
                    or limb not in LIMBS or mode not in ('FK', 'IK'):
                raise MotionEditError('Invalid FK/IK mode fields')
            context = _context(data_root, scene_root, legacy_root, arrangement_root,
                               catalog, project_id, assets, instance_id, clip_id)
            if limb in ('left_arm', 'right_arm'):
                prefix = '左' if limb == 'left_arm' else '右'
                try:
                    bones = parse_pmx(context['model_path'].read_bytes())['bones_detail']
                except (ValueError, OSError) as exc:
                    raise MotionEditError('PMX bones cannot be inspected') from exc
                arm = [index for index, bone in enumerate(bones) if bone['name'] == prefix + '腕']
                if len(arm) != 1:
                    raise MotionEditError('Canonical PMX arm is unavailable')
                if mode == 'IK':
                    elbow = [index for index, bone in enumerate(bones) if bone['name'] == prefix + 'ひじ']
                    wrist = [index for index, bone in enumerate(bones) if bone['name'] == prefix + '手首']
                    def ancestor(child, parent):
                        seen = set()
                        while isinstance(child, int) and 0 <= child < len(bones) and child not in seen:
                            seen.add(child)
                            child = bones[child].get('parent_index')
                            if child == parent:
                                return True
                        return False
                    if len(elbow) != 1 or len(wrist) != 1 \
                            or not ancestor(elbow[0], arm[0]) or not ancestor(wrist[0], elbow[0]) \
                            or any(ik.get('target_index') == wrist[0] or any(
                                link.get('bone_index') in (arm[0], elbow[0]) for link in ik.get('links', []))
                                for bone in bones if isinstance(ik := bone.get('ik'), dict)):
                        raise MotionEditError('Canonical PMX arm IK chain is unavailable')
            if limb in ('left_leg', 'right_leg'):
                prefix = '左' if limb == 'left_leg' else '右'
                try:
                    bones = parse_pmx(context['model_path'].read_bytes())['bones_detail']
                except (ValueError, OSError) as exc:
                    raise MotionEditError('PMX bones cannot be inspected') from exc
                leg = [b for b in bones if b['name'] == prefix + '足']
                targets = [b for b in bones if b['name'] in (prefix + '足ＩＫ', prefix + '足IK')
                           and 'ik' in b and b['ik']['links']
                           and 0 <= b['ik']['target_index'] < len(bones)
                           and bones[b['ik']['target_index']]['name'] == prefix + '足首']
                if len(leg) != 1 or (mode == 'IK' and len(targets) != 1):
                    raise MotionEditError('Canonical PMX leg/IK target is unavailable')
            modes = current.setdefault('fk_ik_modes', {})
            prior = modes.get(instance_id, {}).get(limb, 'IK' if limb.endswith('leg') else 'FK')
            if prior == mode:
                return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
            modes.setdefault(instance_id, {})[limb] = mode
            current['revision'] += 1
            _record(current, project_id)
            _atomic(_path(root, project_id), current)
            return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
        if limb is not None or mode is not None:
            raise MotionEditError('FK/IK mode fields belong to mode-set only')
        if action in ('undo', 'redo'):
            if any(value is not None for value in (instance_id, clip_id, key, keys, layer_id, settings, to_frame)):
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
            if action in ('set', 'remove', 'move'):
                checked = _key(key)
            elif key is not None:
                raise MotionEditError('Layer update accepts settings only')
            else:
                checked = None
            checked_pair = None
            if action == 'arm-set':
                if key is not None or not isinstance(keys, list) or len(keys) != 2:
                    raise MotionEditError('Arm correction requires two keys')
                checked_pair = [_key(item) for item in keys]
                names = {item['bone'] for item in checked_pair}
                if checked_pair[0]['frame'] != checked_pair[1]['frame'] or names not in (
                        {'左腕', '左ひじ'}, {'右腕', '右ひじ'}):
                    raise MotionEditError('Arm correction requires same-frame arm and elbow keys')
            elif keys is not None:
                raise MotionEditError('Multiple keys belong to arm-set only')
            start = math.ceil(context['start'] * context['fps'] - 1e-7)
            end = math.ceil((context['start'] + context['duration']) * context['fps'] - 1e-7)
            if checked and not start <= checked['frame'] < end:
                raise MotionEditError('Frame is outside the motion clip')
            if checked_pair and not start <= checked_pair[0]['frame'] < end:
                raise MotionEditError('Frame is outside the motion clip')
            if action == 'move' and (type(to_frame) is not int or not start <= to_frame < end):
                raise MotionEditError('Destination frame is outside the motion clip')
            if action != 'move' and to_frame is not None:
                raise MotionEditError('Destination frame belongs to move only')
            if action != 'layer-update' and (layer_id is not None or settings is not None):
                raise MotionEditError('Layer settings belong to layer-update only')
            if action in ('set', 'arm-set'):
                try:
                    names = {row['name'] for row in parse_pmx(context['model_path'].read_bytes())['bones_detail']}
                except (ValueError, OSError) as exc:
                    raise MotionEditError('PMX bones cannot be inspected') from exc
                if any(item['bone'] not in names for item in (checked_pair or [checked])):
                    raise MotionEditError('Bone is absent from registered PMX')
            before = copy.deepcopy(current['layers'])
            layer = next((l for l in current['layers'] if l['instance_id'] == instance_id and
                          l['clip_id'] == clip_id), None)
            if layer and _identity(layer) != _identity(context):
                raise MotionEditError('Source or clip placement changed')
            if not layer:
                if action not in ('set', 'arm-set'):
                    raise MotionEditError('FK key not found')
                if len(current['layers']) >= MAX_LAYERS:
                    raise MotionEditError('Motion edit layer limit reached')
                layer = {**_identity(context), 'id': str(uuid.uuid4()), 'name': 'FK補正',
                         'weight': 1.0, 'muted': False, 'keys': []}
                current['layers'].append(layer)
            if action == 'layer-update':
                if layer_id != layer['id'] or not isinstance(settings, dict) or not settings \
                        or set(settings) - set(_settings(layer)):
                    raise MotionEditError('Invalid layer update target or fields')
                updated = {**layer, **settings}
                _check_settings(updated)
                if updated == layer:
                    return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
                layer.update(settings)
                current['history']['undo'].append(before)
                del current['history']['undo'][:-MAX_HISTORY]
                current['history']['redo'] = []
                current['revision'] += 1
                _record(current, project_id)
                _atomic(_path(root, project_id), current)
                return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
            if action == 'arm-set':
                identities = {(item['frame'], item['bone']) for item in checked_pair}
                old_pair = [item for item in layer['keys'] if (item['frame'], item['bone']) in identities]
                old_by_identity = {(item['frame'], item['bone']): item for item in old_pair}
                merged_pair = []
                for item in checked_pair:
                    prior = old_by_identity.get((item['frame'], item['bone']), {})
                    merged_pair.append({**({'position': prior['position']} if 'position' in prior and
                        'position' not in item else {}), **item})
                if len(old_pair) == 2 and all(item in old_pair for item in merged_pair):
                    return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
                remaining = [item for item in layer['keys'] if (item['frame'], item['bone']) not in identities]
                if len(remaining) + 2 > MAX_KEYS:
                    raise MotionEditError('FK key limit reached')
                layer['keys'] = sorted([*remaining, *merged_pair], key=lambda item: (item['frame'], item['bone']))
                current['history']['undo'].append(before)
                del current['history']['undo'][:-MAX_HISTORY]
                current['history']['redo'] = []
                current['revision'] += 1
                _record(current, project_id)
                _atomic(_path(root, project_id), current)
                return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
            old = next((k for k in layer['keys'] if k['frame'] == checked['frame'] and
                        k['bone'] == checked['bone']), None)
            if action == 'remove' and old is None:
                raise MotionEditError('FK key not found')
            if action == 'move':
                if old is None:
                    raise MotionEditError('FK key not found')
                if to_frame == checked['frame']:
                    return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
                if any(k['frame'] == to_frame and k['bone'] == checked['bone'] for k in layer['keys']):
                    raise MotionEditError('FK destination key already exists')
            if action == 'set' and old == checked:
                return view(root, data_root, scene_root, legacy_root, arrangement_root, catalog, project_id, assets)
            if old is not None:
                layer['keys'].remove(old)
            if action == 'set':
                if len(layer['keys']) >= MAX_KEYS:
                    raise MotionEditError('FK key limit reached')
                layer['keys'].append(checked)
                layer['keys'].sort(key=lambda k: (k['frame'], k['bone']))
            elif action == 'move':
                layer['keys'].append({**old, 'frame': to_frame})
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
