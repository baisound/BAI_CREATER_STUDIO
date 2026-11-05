"""Non-destructive, source-versioned PNG cache for registered character assets."""
import hashlib
import os
import struct
import tempfile
from pathlib import Path


MAX_PNG = 2 * 1024 * 1024


def cache_key(asset_id: str, source: Path) -> str:
    stat = source.stat()
    value = f'{asset_id}\0{stat.st_size}\0{stat.st_mtime_ns}'.encode('utf-8')
    return hashlib.sha256(value).hexdigest()[:32]


def thumbnail_for(root: Path, asset_id: str, source: Path) -> tuple[Path, str] | None:
    if not source.is_file():
        return None
    key = cache_key(asset_id, source)
    path = root / (key + '.png')
    return (path, key) if path.is_file() else None


def save_thumbnail(root: Path, asset_id: str, source: Path, payload: bytes) -> tuple[Path, str]:
    if not source.is_file():
        raise ValueError('character source is unavailable')
    if not 33 <= len(payload) <= MAX_PNG or not payload.startswith(b'\x89PNG\r\n\x1a\n') or payload[12:16] != b'IHDR':
        raise ValueError('thumbnail must be a PNG image')
    width, height = struct.unpack('>II', payload[16:24])
    if not (32 <= width <= 2048 and 32 <= height <= 2048):
        raise ValueError('thumbnail dimensions are invalid')
    root.mkdir(parents=True, exist_ok=True)
    key = cache_key(asset_id, source)
    target = root / (key + '.png')
    if target.is_file():
        return target, key
    fd, name = tempfile.mkstemp(prefix='character-thumbnail-', suffix='.tmp', dir=root)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, target)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    return target, key
