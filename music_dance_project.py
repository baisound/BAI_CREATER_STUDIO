"""Validated, revisioned placement for the local music/dance preview.

Only references and integer frame offsets are saved; source assets are never edited.
"""

import hashlib
import json
import os
from pathlib import Path

FIELDS = ('schema', 'fps', 'model_id', 'motion_id', 'audio_id',
          'motion_start_frame', 'motion_source_frame',
          'audio_start_frame', 'audio_source_frame', 'head_frame')
FRAME_FIELDS = FIELDS[5:]
DEFAULT = {
    'schema': 1, 'fps': 30, 'model_id': None, 'motion_id': None,
    'audio_id': None, 'motion_start_frame': 0, 'motion_source_frame': 0,
    'audio_start_frame': 0, 'audio_source_frame': 0, 'head_frame': 0,
}


class InvalidMusicDanceProject(ValueError):
    """Existing state is invalid and must not be silently overwritten."""


def validate(value):
    if not isinstance(value, dict) or set(value) != set(FIELDS):
        raise ValueError('invalid music/dance project fields')
    if type(value['schema']) is not int or value['schema'] != 1:
        raise ValueError('invalid music/dance schema')
    if type(value['fps']) is not int or value['fps'] != 30:
        raise ValueError('music/dance fps must be 30')
    for field in ('model_id', 'motion_id', 'audio_id'):
        asset_id = value[field]
        if asset_id is not None and (not isinstance(asset_id, str) or
                                     not 0 < len(asset_id) <= 500 or
                                     any(ord(c) < 32 for c in asset_id)):
            raise ValueError('invalid ' + field)
    for field in FRAME_FIELDS:
        frame = value[field]
        if type(frame) is not int or not 0 <= frame <= 216000:
            raise ValueError('invalid ' + field)
    return {field: value[field] for field in FIELDS}


def revision(value):
    payload = json.dumps(validate(value), ensure_ascii=False,
                         sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def read(path):
    path = Path(path)
    if not path.exists():
        value = dict(DEFAULT)
    else:
        try:
            value = validate(json.loads(path.read_text(encoding='utf-8')))
        except (OSError, ValueError, UnicodeError) as exc:
            raise InvalidMusicDanceProject('music/dance project is unreadable') from exc
    return {'project': value, 'revision': revision(value)}


def _atomic_bytes(path, data):
    temp = path.with_name(path.name + '.tmp')
    try:
        temp.write_bytes(data)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def save(path, value):
    path = Path(path)
    value = validate(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        # Preserve the last valid revision before replacement.
        previous = path.read_bytes()
        validate(json.loads(previous.decode('utf-8')))
        _atomic_bytes(path.with_name(path.stem + '.previous.json'), previous)
    _atomic_bytes(path, json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8'))
    return {'ok': True, 'revision': revision(value)}
