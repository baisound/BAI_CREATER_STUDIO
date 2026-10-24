"""Project-scoped, source-preserving SRT import for the v0.5 lip workflow."""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic, load as load_catalog

LOCK = threading.RLock()
MAX_BYTES = 8 * 1024 * 1024
MAX_ENTRIES = 10_000
ENCODINGS = {'utf-8': 'utf-8', 'utf-8-bom': 'utf-8-sig', 'cp932': 'cp932'}
TIME = re.compile(r'(\d{2,6}):([0-5]\d):([0-5]\d),(\d{3})\Z')
ARROW = re.compile(r'([^\n]+?)\s+-->\s+([^\n]+)\Z')
PROJECT_ID = re.compile(r'[A-Za-z0-9_-]{1,100}\Z')


class SrtSourceError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _time(value):
    match = TIME.fullmatch(value.strip())
    if not match:
        raise SrtSourceError('SRT timestamp must be HH:MM:SS,mmm')
    hours, minutes, seconds, millis = map(int, match.groups())
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def parse(payload: bytes, encoding: str):
    if not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_BYTES:
        raise SrtSourceError('SRT must be 1 byte to 8 MiB', 413)
    if encoding not in ENCODINGS:
        raise SrtSourceError('Choose UTF-8, UTF-8 BOM or CP932 explicitly', 400)
    bom = payload.startswith(b'\xef\xbb\xbf')
    if bom != (encoding == 'utf-8-bom'):
        raise SrtSourceError('Selected encoding does not match UTF-8 BOM')
    try:
        content = payload.decode(ENCODINGS[encoding], errors='strict')
    except UnicodeError as exc:
        raise SrtSourceError('SRT cannot be decoded with selected encoding') from exc
    if '\x00' in content:
        raise SrtSourceError('SRT contains a NUL character')
    lines = content.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    blocks, block = [], []
    for line in lines:
        if not line.strip():
            if block:
                blocks.append(block)
                block = []
        else:
            block.append(line)
    if block:
        blocks.append(block)
    if not blocks or len(blocks) > MAX_ENTRIES:
        raise SrtSourceError('SRT must contain 1 to 10000 cues')
    entries, indices = [], set()
    for block in blocks:
        if len(block) < 3 or not re.fullmatch(r'[1-9]\d{0,8}', block[0].strip()):
            raise SrtSourceError('SRT cue requires a positive index, times and text')
        index = int(block[0].strip())
        if index in indices:
            raise SrtSourceError('SRT cue index is duplicated')
        indices.add(index)
        times = ARROW.fullmatch(block[1].strip())
        if not times:
            raise SrtSourceError('SRT cue requires start --> end timestamps')
        start, end = _time(times[1]), _time(times[2])
        if end <= start:
            raise SrtSourceError('SRT cue end must be after start')
        text = '\n'.join(block[2:])
        if not text.strip():
            raise SrtSourceError('SRT cue text is empty')
        entries.append({'index': index, 'startMs': start, 'endMs': end, 'text': text})
    by_time = sorted(entries, key=lambda row: (row['startMs'], row['index']))
    warnings = []
    active = by_time[0]
    for row in by_time[1:]:
        if row['startMs'] < active['endMs']:
            warnings.append({'code': 'time_overlap', 'indices': [active['index'], row['index']]})
        if row['endMs'] > active['endMs']:
            active = row
    return {'sha256': hashlib.sha256(payload).hexdigest(), 'encoding': encoding,
            'entries': entries, 'warnings': warnings}


def _folder(root, catalog, project_id):
    if (not isinstance(project_id, str) or not PROJECT_ID.fullmatch(project_id)
            or not any(p.get('id') == project_id for p in load_catalog(catalog)['projects'])):
        raise SrtSourceError('Project not found', 404)
    return Path(root) / project_id


def _stored(folder, project_id):
    path = folder / 'index.json'
    if not path.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0, 'sources': []}
    try:
        result = json.loads(path.read_text(encoding='utf-8'))
        if (not isinstance(result, dict) or set(result) != {'schema', 'project_id', 'revision', 'sources'}
                or result['schema'] != 1 or result['project_id'] != project_id
                or type(result['revision']) is not int or result['revision'] < 0
                or not isinstance(result['sources'], list) or len(result['sources']) > 128):
            raise ValueError('Invalid source index')
        return result
    except (OSError, ValueError, TypeError) as exc:
        raise SrtSourceError('SRT source index unreadable; originals retained') from exc


def read(root, catalog, project_id):
    with LOCK:
        folder = _folder(root, catalog, project_id)
        data = _stored(folder, project_id)
        sources = []
        for row in data['sources']:
            if not isinstance(row, dict) or not re.fullmatch(r'[0-9a-f]{64}\.srt', row.get('relativePath', '')):
                raise SrtSourceError('SRT source index invalid; originals retained')
            file = folder / 'sources' / row['relativePath']
            try:
                status = 'valid' if hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256'] else 'changed'
            except OSError:
                status = 'missing'
            sources.append({**row, 'sourceStatus': status})
        return {**data, 'sources': sources}


def register(root, catalog, project_id, revision, original_name, encoding, payload):
    if type(revision) is not int or revision < 0:
        raise SrtSourceError('Revision required', 400)
    if (not isinstance(original_name, str) or not 0 < len(original_name) <= 180
            or not original_name.lower().endswith('.srt')
            or any(c in original_name for c in '/\\\r\n\x00')):
        raise SrtSourceError('Choose an SRT file name', 400)
    parsed = parse(payload, encoding)
    with LOCK:
        folder = _folder(root, catalog, project_id)
        data = _stored(folder, project_id)
        if data['revision'] != revision:
            raise SrtSourceError('Revision conflict', 409)
        if len(data['sources']) >= 128:
            raise SrtSourceError('SRT source limit is 128', 413)
        relative = parsed['sha256'] + '.srt'
        source = folder / 'sources' / relative
        source.parent.mkdir(parents=True, exist_ok=True)
        if source.exists():
            if hashlib.sha256(source.read_bytes()).hexdigest() != parsed['sha256']:
                raise SrtSourceError('Stored SRT source changed; original retained', 409)
        else:
            temporary = source.with_name(source.name + '.tmp-' + uuid.uuid4().hex)
            try:
                with temporary.open('xb') as stream:
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, source)
            finally:
                if temporary.exists():
                    temporary.unlink()
        row = {'id': str(uuid.uuid4()), 'sha256': parsed['sha256'],
               'relativePath': relative, 'originalName': original_name,
               'encoding': parsed['encoding'], 'entries': parsed['entries'],
               'warnings': parsed['warnings']}
        data['sources'].append(row)
        data['revision'] += 1
        _atomic(folder / 'index.json', data)
        return read(root, catalog, project_id)
