"""Reversible selection of source-bound lip VMD candidates for scene instances.

The store references candidates. It never changes a motion clip, source VMD,
manual face key, or model asset. A stale candidate remains visible but supplies
no playback keys until its sources are restored or a new candidate is adopted.
"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_lip_vmd_candidate import ID, CANDIDATE_ID, LipVmdError, validated_candidate
from studio_v05_scene_instances import read as read_scene, SceneInstancesError
from studio_v05_track_layout import get as get_layout

LOCK = threading.RLock()
MAX_TRACKS = 32
MAX_HISTORY = 32


class LipAdoptionError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _path(data_root, project_id):
    if not isinstance(project_id, str) or not ID.fullmatch(project_id):
        raise LipAdoptionError('Project ID invalid', 400)
    return Path(data_root) / 'studio_v05_lip_adoptions' / (project_id + '.json')


def _track(value):
    if (not isinstance(value, dict) or set(value) != {
            'instanceId', 'candidateId', 'sourceHash', 'modelHash', 'sha256'}
            or not isinstance(value['instanceId'], str) or not 0 < len(value['instanceId']) <= 100
            or not isinstance(value['candidateId'], str)
            or not CANDIDATE_ID.fullmatch(value['candidateId'])
            or any(not isinstance(value[key], str) or not re.fullmatch(r'[0-9a-f]{64}', value[key])
                   for key in ('sourceHash', 'modelHash', 'sha256'))):
        raise LipAdoptionError('Lip adoption record invalid; original retained', 409)
    return value


def _record(data, project_id):
    if (not isinstance(data, dict) or set(data) != {
            'schema', 'projectId', 'revision', 'tracks', 'undo', 'redo'}
            or data['schema'] != 1 or data['projectId'] != project_id
            or type(data['revision']) is not int or data['revision'] < 0
            or not isinstance(data['tracks'], list) or len(data['tracks']) > MAX_TRACKS
            or not isinstance(data['undo'], list) or len(data['undo']) > MAX_HISTORY
            or not isinstance(data['redo'], list) or len(data['redo']) > MAX_HISTORY):
        raise LipAdoptionError('Lip adoption file invalid; original retained', 409)
    ids = set()
    for row in data['tracks']:
        _track(row)
        if row['instanceId'] in ids:
            raise LipAdoptionError('Duplicate lip adoption instance; original retained', 409)
        ids.add(row['instanceId'])
    for history in (data['undo'], data['redo']):
        for entry in history:
            if (not isinstance(entry, dict) or set(entry) != {'instanceId', 'before', 'after'}
                    or not isinstance(entry['instanceId'], str) or not entry['instanceId']
                    or entry['before'] is None and entry['after'] is None):
                raise LipAdoptionError('Lip adoption history invalid; original retained', 409)
            for side in ('before', 'after'):
                if entry[side] is not None:
                    _track(entry[side])
                    if entry[side]['instanceId'] != entry['instanceId']:
                        raise LipAdoptionError('Lip adoption history identity invalid', 409)
    return data


def _load(data_root, project_id):
    path = _path(data_root, project_id)
    if not path.exists():
        return {'schema': 1, 'projectId': project_id, 'revision': 0,
                'tracks': [], 'undo': [], 'redo': []}
    try:
        return _record(json.loads(path.read_text(encoding='utf-8')), project_id)
    except (OSError, ValueError) as exc:
        raise LipAdoptionError('Lip adoption file unreadable; original retained', 409) from exc


def _candidate(data_root, assets, source_for, project_id, candidate_id):
    try:
        return validated_candidate(data_root, assets, source_for, project_id, candidate_id)
    except LipVmdError as exc:
        raise LipAdoptionError(str(exc), exc.status) from exc


def _scene(data_root, project_id, assets):
    try:
        return read_scene(Path(data_root)/'studio_v05_scene_instances',
                          Path(data_root)/'studio_v05_scene_models',
                          Path(data_root)/'studio_v05_catalog.json', project_id, assets)
    except SceneInstancesError as exc:
        raise LipAdoptionError(str(exc), 409) from exc


def _check_target(scene, metadata, instance_id):
    instance = next((row for row in scene['instances'] if row['id'] == instance_id), None)
    if (not instance or instance['locked'] or not instance.get('available')
            or instance['asset_id'] != metadata['modelAssetId']
            or instance['asset'].get('format', '').upper() != 'PMX'):
        raise LipAdoptionError('Scene instance is missing, locked, or uses a different PMX', 409)


def _check_unlocked(scene, instance_id):
    instance = next((row for row in scene['instances'] if row['id'] == instance_id), None)
    if instance and instance['locked']:
        raise LipAdoptionError('Scene instance is locked', 409)


def _checked(data_root, assets, source_for, project_id, row, scene):
    metadata, plan, _ = _candidate(data_root, assets, source_for,
                                   project_id, row['candidateId'])
    _check_target(scene, metadata, row['instanceId'])
    if (metadata['sourceHash'] != row['sourceHash']
            or metadata['modelHash'] != row['modelHash']
            or metadata['sha256'] != row['sha256']):
        raise LipAdoptionError('Adopted candidate identity changed', 409)
    return metadata, plan


def read(data_root, assets, source_for, project_id, instance_id=None):
    if instance_id is not None and (not isinstance(instance_id, str)
                                    or not 0 < len(instance_id) <= 100):
        raise LipAdoptionError('Instance ID invalid', 400)
    with LOCK:
        current = _load(data_root, project_id)
        scene = _scene(data_root, project_id, assets)
        tracks = []
        for row in current['tracks']:
            try:
                metadata, plan = _checked(data_root, assets, source_for,
                                           project_id, row, scene)
                tracks.append({**row, 'status': 'ready', 'issue': None,
                               'srtSourceId': metadata['srtSourceId'],
                               'cueCount': len(plan['cueTracks']),
                               'morphKeys': len(plan['records']),
                               'cueTracks': plan['cueTracks'] if instance_id == row['instanceId'] else []})
            except LipAdoptionError as exc:
                tracks.append({**row, 'status': 'stale', 'issue': str(exc), 'cueTracks': []})
        return {**current, 'tracks': tracks,
                'undoCount': len(current['undo']), 'redoCount': len(current['redo'])}


def mutate(data_root, assets, source_for, project_id, revision, action,
           instance_id=None, candidate_id=None):
    if type(revision) is not int or revision < 0 or action not in ('adopt', 'remove', 'undo', 'redo'):
        raise LipAdoptionError('Action and current revision required', 400)
    with LOCK:
        current = _load(data_root, project_id)
        if current['revision'] != revision:
            raise LipAdoptionError('Lip adoption revision conflict', 409)
        scene = _scene(data_root, project_id, assets)
        if 'lip' in get_layout(Path(data_root)/'studio_v05_track_layouts',
                               Path(data_root)/'studio_v05_catalog.json', project_id).get('locked', []):
            raise LipAdoptionError('Lip track is locked', 409)
        if action in ('undo', 'redo'):
            if instance_id is not None or candidate_id is not None:
                raise LipAdoptionError('History action requires only revision', 400)
            source = current['undo' if action == 'undo' else 'redo']
            target = current['redo' if action == 'undo' else 'undo']
            if not source:
                raise LipAdoptionError('No lip adoption history available', 409)
            entry = source[-1]
            expected = entry['after' if action == 'undo' else 'before']
            replacement = entry['before' if action == 'undo' else 'after']
            found = next((row for row in current['tracks']
                          if row['instanceId'] == entry['instanceId']), None)
            if found != expected:
                raise LipAdoptionError('Lip adoption history no longer matches', 409)
            _check_unlocked(scene, entry['instanceId'])
            if replacement is not None:
                _checked(data_root, assets, source_for, project_id, replacement, scene)
            current['tracks'] = [row for row in current['tracks']
                                 if row['instanceId'] != entry['instanceId']]
            if replacement is not None:
                current['tracks'].append(replacement)
            source.pop()
            target.append(entry)
        else:
            if (not isinstance(instance_id, str) or not 0 < len(instance_id) <= 100
                    or action == 'adopt' and (not isinstance(candidate_id, str)
                                              or not CANDIDATE_ID.fullmatch(candidate_id))
                    or action == 'remove' and candidate_id is not None):
                raise LipAdoptionError('Instance and candidate selection invalid', 400)
            before = next((row for row in current['tracks']
                           if row['instanceId'] == instance_id), None)
            if action == 'adopt':
                metadata, _, _ = _candidate(data_root, assets, source_for,
                                            project_id, candidate_id)
                _check_target(scene, metadata, instance_id)
                after = {'instanceId': instance_id, 'candidateId': candidate_id,
                         'sourceHash': metadata['sourceHash'],
                         'modelHash': metadata['modelHash'], 'sha256': metadata['sha256']}
                if before == after:
                    return read(data_root, assets, source_for, project_id)
                if before is None and len(current['tracks']) >= MAX_TRACKS:
                    raise LipAdoptionError('Scene lip track limit reached', 413)
            else:
                if before is None:
                    raise LipAdoptionError('No adopted lip candidate for instance', 404)
                _check_unlocked(scene, instance_id)
                after = None
            current['tracks'] = [row for row in current['tracks']
                                 if row['instanceId'] != instance_id]
            if after is not None:
                current['tracks'].append(after)
            current['undo'].append({'instanceId': instance_id, 'before': before, 'after': after})
            current['undo'] = current['undo'][-MAX_HISTORY:]
            current['redo'] = []
        current['tracks'].sort(key=lambda row: row['instanceId'])
        current['revision'] += 1
        _atomic(_path(data_root, project_id), current)
        return read(data_root, assets, source_for, project_id)
