"""Revisioned per-utterance readings, kept separate from immutable SRT sources."""
from __future__ import annotations

import json
import re
import threading
import unicodedata
import uuid
from pathlib import Path

from studio_project_catalog import _atomic, load as load_catalog
from studio_v05_srt_sources import read as read_srt_sources, SrtSourceError

LOCK = threading.RLock()
PROJECT_ID = re.compile(r'[A-Za-z0-9_-]{1,100}\Z')
KANA = re.compile(r'[ぁ-ゖァ-ヺー 　]+\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')
STATES = ('unresolved', 'proposed', 'confirmed')


class LipReadingError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _path(root, catalog, project_id):
    if (not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id)
            or not any(p.get('id') == project_id for p in load_catalog(catalog)['projects'])):
        raise LipReadingError('Project not found', 404)
    return Path(root) / (project_id + '.json')


def _stored(path, project_id):
    if not path.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0, 'utterances': []}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if (not isinstance(data, dict) or set(data) != {'schema', 'project_id', 'revision', 'utterances'}
                or data['schema'] != 1 or data['project_id'] != project_id
                or type(data['revision']) is not int or data['revision'] < 0
                or not isinstance(data['utterances'], list) or len(data['utterances']) > 10_000):
            raise ValueError('Invalid lip reading store')
        seen = set()
        for row in data['utterances']:
            if (not isinstance(row, dict) or set(row) != {'id', 'srtSourceId', 'srtIndex', 'sourceHash',
                    'sourceStartMs', 'sourceEndMs', 'readingKana', 'readingState', 'explicitSilence',
                    'pronunciationVersion'}):
                raise ValueError('Invalid utterance fields')
            uuid.UUID(row['id'])
            key = (row['srtSourceId'], row['srtIndex'])
            if (key in seen or not isinstance(row['srtSourceId'], str)
                    or type(row['srtIndex']) is not int or row['srtIndex'] < 1
                    or not isinstance(row['sourceHash'], str) or not HASH.fullmatch(row['sourceHash'])
                    or type(row['sourceStartMs']) is not int or type(row['sourceEndMs']) is not int
                    or row['sourceStartMs'] < 0 or row['sourceEndMs'] <= row['sourceStartMs']
                    or type(row['explicitSilence']) is not bool
                    or type(row['pronunciationVersion']) is not int or row['pronunciationVersion'] < 1):
                raise ValueError('Invalid utterance record')
            _reading(row['readingState'], row['readingKana'], row['explicitSilence'])
            seen.add(key)
        return data
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise LipReadingError('Lip reading store unreadable; original retained') from exc


def _reading(state, kana, silence):
    if state not in STATES or type(silence) is not bool:
        raise LipReadingError('Reading state or silence flag invalid')
    if silence:
        if state != 'unresolved' or kana is not None:
            raise LipReadingError('Explicit silence must have no reading')
        return None
    if state == 'unresolved':
        if kana is not None:
            raise LipReadingError('Unresolved reading must be empty')
        return None
    if not isinstance(kana, str) or len(kana) > 300:
        raise LipReadingError('Kana reading required')
    normalized = unicodedata.normalize('NFKC', kana).strip()
    if not normalized or len(normalized) > 300 or not KANA.fullmatch(normalized):
        raise LipReadingError('Reading must contain only Japanese kana and spaces')
    return normalized


def read(root, catalog, source_root, project_id):
    with LOCK:
        data = _stored(_path(root, catalog, project_id), project_id)
        try:
            sources = read_srt_sources(source_root, catalog, project_id)['sources']
        except SrtSourceError as exc:
            raise LipReadingError(str(exc), exc.status) from exc
        known = {source['id']: source for source in sources}
        rows = []
        for row in data['utterances']:
            source = known.get(row['srtSourceId'])
            status = ('valid' if source and source['sha256'] == row['sourceHash']
                      and source['sourceStatus'] == 'valid' else 'changed' if source else 'missing')
            rows.append({**row, 'sourceStatus': status})
        return {**data, 'utterances': rows}


def set_reading(root, catalog, source_root, project_id, revision, source_id, source_hash,
                srt_index, reading_state, reading_kana, explicit_silence):
    if type(revision) is not int or revision < 0:
        raise LipReadingError('Revision required', 400)
    if not isinstance(source_id, str) or not isinstance(source_hash, str) or not HASH.fullmatch(source_hash):
        raise LipReadingError('SRT source identity invalid', 400)
    if type(srt_index) is not int or srt_index < 1:
        raise LipReadingError('SRT cue index invalid', 400)
    normalized = _reading(reading_state, reading_kana, explicit_silence)
    with LOCK:
        path = _path(root, catalog, project_id)
        data = _stored(path, project_id)
        if data['revision'] != revision:
            raise LipReadingError('Revision conflict', 409)
        try:
            sources = read_srt_sources(source_root, catalog, project_id)['sources']
        except SrtSourceError as exc:
            raise LipReadingError(str(exc), exc.status) from exc
        source = next((row for row in sources if row['id'] == source_id), None)
        if not source:
            raise LipReadingError('SRT source not found', 404)
        if source['sha256'] != source_hash or source['sourceStatus'] != 'valid':
            raise LipReadingError('SRT original hash changed or missing', 409)
        cue = next((row for row in source['entries'] if row['index'] == srt_index), None)
        if not cue:
            raise LipReadingError('SRT cue not found', 404)
        old = next((row for row in data['utterances'] if row['srtSourceId'] == source_id
                    and row['srtIndex'] == srt_index), None)
        if old and (old['sourceHash'] != source_hash or old['sourceStartMs'] != cue['startMs']
                    or old['sourceEndMs'] != cue['endMs']):
            raise LipReadingError('SRT cue source changed; saved reading retained', 409)
        if not old and len(data['utterances']) >= 10_000:
            raise LipReadingError('Utterance limit is 10000', 413)
        row = {'id': old['id'] if old else str(uuid.uuid4()), 'srtSourceId': source_id,
               'srtIndex': srt_index, 'sourceHash': source_hash,
               'sourceStartMs': cue['startMs'], 'sourceEndMs': cue['endMs'],
               'readingKana': normalized, 'readingState': reading_state,
               'explicitSilence': explicit_silence,
               'pronunciationVersion': old['pronunciationVersion'] + 1 if old else 1}
        if old:
            data['utterances'][data['utterances'].index(old)] = row
        else:
            data['utterances'].append(row)
        data['revision'] += 1
        _atomic(path, data)
        return read(root, catalog, source_root, project_id)
