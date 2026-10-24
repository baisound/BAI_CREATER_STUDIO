"""Revisioned, source-bound mouth segment drafts. No VMD or source writes."""
from __future__ import annotations

import json
import math
import re
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic, load as load_catalog
from studio_v05_lip_candidates import propose, LipCandidateError, _frame
from studio_v05_lip_readings import read as read_readings, LipReadingError
from studio_v05_srt_sources import read as read_sources, SrtSourceError

LOCK = threading.RLock()
PROJECT_ID = re.compile(r'[A-Za-z0-9_-]{1,100}\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')
SHAPES = frozenset(('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest'))
MAX_SEGMENTS = 1000


class LipDraftError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _path(root, catalog, project_id):
    if (not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id)
            or not any(row.get('id') == project_id for row in load_catalog(catalog)['projects'])):
        raise LipDraftError('Project not found', 404)
    return Path(root) / (project_id + '.json')


def _validate_segments(rows, start, end):
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_SEGMENTS:
        raise LipDraftError('Draft requires 1 to 1000 segments')
    result, previous_end = [], start
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'startFrame', 'endFrame', 'mouthShape', 'weight'}:
            raise LipDraftError('Invalid draft segment fields')
        first, last, shape, weight = (row[key] for key in ('startFrame', 'endFrame', 'mouthShape', 'weight'))
        if (type(first) is not int or type(last) is not int or first < previous_end
                or first < start or last <= first or last > end or last > 1_000_000):
            raise LipDraftError('Draft segment outside SRT cue or overlapping')
        if shape not in SHAPES or type(weight) not in (int, float) or not math.isfinite(weight) or not 0 <= weight <= 1:
            raise LipDraftError('Invalid mouth shape or weight')
        result.append({'startFrame': first, 'endFrame': last, 'mouthShape': shape, 'weight': float(weight)})
        previous_end = last
    return result


def _stored(path, project_id):
    if not path.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0, 'drafts': []}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if (not isinstance(data, dict) or set(data) != {'schema', 'project_id', 'revision', 'drafts'}
                or data['schema'] != 1 or data['project_id'] != project_id
                or type(data['revision']) is not int or data['revision'] < 0
                or not isinstance(data['drafts'], list) or len(data['drafts']) > 10_000):
            raise ValueError('Invalid lip draft store')
        seen = set()
        for row in data['drafts']:
            if (not isinstance(row, dict) or set(row) != {'id', 'srtSourceId', 'srtIndex', 'sourceHash',
                    'sourceStartMs', 'sourceEndMs', 'pronunciationVersion', 'projectFps', 'segments'}):
                raise ValueError('Invalid lip draft record')
            uuid.UUID(row['id'])
            key = (row['srtSourceId'], row['srtIndex'])
            if (key in seen or not isinstance(row['srtSourceId'], str)
                    or type(row['srtIndex']) is not int or row['srtIndex'] < 1
                    or not isinstance(row['sourceHash'], str) or not HASH.fullmatch(row['sourceHash'])
                    or type(row['sourceStartMs']) is not int or type(row['sourceEndMs']) is not int
                    or row['sourceStartMs'] < 0 or row['sourceEndMs'] <= row['sourceStartMs']
                    or type(row['pronunciationVersion']) is not int or row['pronunciationVersion'] < 1
                    or type(row['projectFps']) not in (int, float) or not 1 <= row['projectFps'] <= 240):
                raise ValueError('Invalid lip draft identity')
            _validate_segments(row['segments'], _frame(row['sourceStartMs'], row['projectFps']),
                               _frame(row['sourceEndMs'], row['projectFps']))
            seen.add(key)
        return data
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise LipDraftError('Lip draft store unreadable; originals retained') from exc


def read(root, catalog, source_root, reading_root, project_id):
    with LOCK:
        data = _stored(_path(root, catalog, project_id), project_id)
        try:
            sources = read_sources(source_root, catalog, project_id)['sources']
            readings = read_readings(reading_root, catalog, source_root, project_id)['utterances']
        except (SrtSourceError, LipReadingError) as exc:
            raise LipDraftError(str(exc), exc.status) from exc
        source_by_id = {source['id']: source for source in sources}
        reading_by_key = {(row['srtSourceId'], row['srtIndex']): row for row in readings}
        project = next(row for row in load_catalog(catalog)['projects'] if row.get('id') == project_id)
        fps = project.get('fps', 30)
        result = []
        for row in data['drafts']:
            source = source_by_id.get(row['srtSourceId'])
            cue = next((cue for cue in source['entries'] if cue['index'] == row['srtIndex']), None) if source else None
            reading = reading_by_key.get((row['srtSourceId'], row['srtIndex']))
            valid = (source and cue and source['sourceStatus'] == 'valid'
                     and source['sha256'] == row['sourceHash']
                     and cue['startMs'] == row['sourceStartMs'] and cue['endMs'] == row['sourceEndMs'])
            status = ('source_changed' if not valid else 'fps_changed' if fps != row['projectFps']
                      else 'reading_changed' if not reading or reading['pronunciationVersion'] != row['pronunciationVersion']
                      or reading['readingState'] == 'unresolved' or reading['explicitSilence']
                      else 'draft')
            result.append({**row, 'draftStatus': status, 'exportReady': False})
        return {**data, 'drafts': result}


def save(root, catalog, source_root, reading_root, project_id, revision, source_id, source_hash,
         srt_index, pronunciation_version, project_fps, segments):
    if (type(revision) is not int or revision < 0 or not isinstance(source_hash, str)
            or not HASH.fullmatch(source_hash) or type(pronunciation_version) is not int
            or pronunciation_version < 1 or type(project_fps) not in (int, float)):
        raise LipDraftError('Draft source and revision required', 400)
    with LOCK:
        path = _path(root, catalog, project_id)
        data = _stored(path, project_id)
        if revision != data['revision']:
            raise LipDraftError('Revision conflict', 409)
        try:
            candidate = propose(catalog, source_root, reading_root, project_id, source_id, srt_index)
        except LipCandidateError as exc:
            raise LipDraftError(str(exc), exc.status) from exc
        if (candidate['sourceHash'] != source_hash or candidate['pronunciationVersion'] != pronunciation_version
                or candidate['projectFps'] != project_fps):
            raise LipDraftError('SRT, reading or FPS changed; draft not written', 409)
        if candidate['status'] not in ('ready', 'needs_review', 'proposed'):
            raise LipDraftError('Reading has no mouth candidates', 422)
        normalized = _validate_segments(segments, _frame(candidate['sourceStartMs'], project_fps),
                                        _frame(candidate['sourceEndMs'], project_fps))
        old = next((row for row in data['drafts'] if row['srtSourceId'] == source_id
                    and row['srtIndex'] == srt_index), None)
        if not old and len(data['drafts']) >= 10_000:
            raise LipDraftError('Draft limit is 10000', 413)
        row = {'id': old['id'] if old else str(uuid.uuid4()), 'srtSourceId': source_id,
               'srtIndex': srt_index, 'sourceHash': source_hash,
               'sourceStartMs': candidate['sourceStartMs'], 'sourceEndMs': candidate['sourceEndMs'],
               'pronunciationVersion': pronunciation_version, 'projectFps': project_fps,
               'segments': normalized}
        if old:
            data['drafts'][data['drafts'].index(old)] = row
        else:
            data['drafts'].append(row)
        data['revision'] += 1
        _atomic(path, data)
        return read(root, catalog, source_root, reading_root, project_id)
