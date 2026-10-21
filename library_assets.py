"""Non-destructive local library for stage, prop, texture, effect and media files.

The server controls the root directory. User supplied names never become paths.
Only standard-library parsers are used; unknown tags fall back to the file name.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import tempfile
from pathlib import Path


MAX_UPLOAD = 400 * 1024 * 1024
MAX_THUMBNAIL = 2 * 1024 * 1024
FORMATS = {
    'glb': {'stage', 'prop', 'fx'},
    'png': {'material', 'fx', 'image'},
    'jpg': {'material', 'fx', 'image'},
    'jpeg': {'material', 'fx', 'image'},
    'gif': {'fx', 'image'},
    'webp': {'material', 'fx', 'image'},
    'avif': {'material', 'fx', 'image'},
    'bmp': {'material', 'image'},
    'wav': {'audio'}, 'mp3': {'audio'},
    'mp4': {'video'}, 'webm': {'video'}, 'ogv': {'video'},
}
MIME = {
    'glb': 'model/gltf-binary', 'png': 'image/png', 'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp',
    'avif': 'image/avif', 'bmp': 'image/bmp', 'wav': 'audio/wav',
    'mp3': 'audio/mpeg', 'mp4': 'video/mp4', 'webm': 'video/webm',
    'ogv': 'video/ogg',
}


def validate(kind: str, name: str, size: int) -> str:
    if not isinstance(kind, str) or not isinstance(name, str) or not isinstance(size, int):
        raise ValueError('invalid asset parameters')
    if not 1 <= len(name) <= 180 or name.startswith('.') or any(c in name for c in '/\\\x00') or any(ord(c) < 32 for c in name):
        raise ValueError('invalid asset name')
    ext = Path(name).suffix.lower().lstrip('.')
    if kind not in FORMATS.get(ext, set()):
        raise ValueError('this file format cannot be registered for the selected category')
    if not 0 < size <= MAX_UPLOAD:
        raise ValueError('asset size is outside the allowed range')
    return ext


def valid_signature(ext: str, head: bytes) -> bool:
    if ext == 'glb': return len(head) >= 12 and head[:4] == b'glTF' and int.from_bytes(head[4:8], 'little') == 2
    if ext == 'png': return head.startswith(b'\x89PNG\r\n\x1a\n')
    if ext in ('jpg', 'jpeg'): return head.startswith(b'\xff\xd8\xff')
    if ext == 'gif': return head.startswith((b'GIF87a', b'GIF89a'))
    if ext == 'webp': return head[:4] == b'RIFF' and head[8:12] == b'WEBP'
    if ext == 'avif': return head[4:8] == b'ftyp' and any(b in head[8:32] for b in (b'avif', b'avis'))
    if ext == 'bmp': return head.startswith(b'BM')
    if ext == 'wav': return head[:4] == b'RIFF' and head[8:12] == b'WAVE'
    if ext == 'mp3': return head.startswith(b'ID3') or (len(head) >= 2 and head[0] == 0xff and head[1] & 0xe0 == 0xe0)
    if ext == 'mp4': return head[4:8] == b'ftyp'
    if ext == 'webm': return head.startswith(b'\x1a\x45\xdf\xa3')
    if ext == 'ogv': return head.startswith(b'OggS')
    return False


def _clean_title(value: str | None) -> str | None:
    if not value: return None
    title = ''.join(c for c in value if c.isprintable()).strip().strip('\x00').strip()
    return title[:180] or None


def _text(raw: bytes, encoding: str = 'utf-8') -> str | None:
    try: return _clean_title(raw.decode(encoding, errors='replace').split('\x00', 1)[0])
    except (UnicodeError, LookupError): return None


def _id3_title(path: Path) -> str | None:
    with path.open('rb') as f:
        head = f.read(10)
        if head[:3] == b'ID3' and head[3] in (2, 3, 4):
            version = head[3]
            tag_size = sum((head[6 + i] & 0x7f) << (21 - 7 * i) for i in range(4))
            data = f.read(min(tag_size, 1024 * 1024))
            pos = 0
            while pos + (6 if version == 2 else 10) <= len(data):
                ident = data[pos:pos + (3 if version == 2 else 4)]
                if not ident.strip(b'\x00'): break
                if version == 2:
                    length = int.from_bytes(data[pos + 3:pos + 6], 'big'); header = 6
                else:
                    length_raw = data[pos + 4:pos + 8]
                    length = sum((length_raw[i] & 0x7f) << (21 - 7 * i) for i in range(4)) if version == 4 else int.from_bytes(length_raw, 'big')
                    header = 10
                if length <= 0 or pos + header + length > len(data): break
                if ident in (b'TIT2', b'TT2'):
                    value = data[pos + header:pos + header + length]
                    if value:
                        enc = {0: 'latin-1', 1: 'utf-16', 2: 'utf-16-be', 3: 'utf-8'}.get(value[0], 'utf-8')
                        title = _text(value[1:], enc)
                        if title: return title
                pos += header + length
        if path.stat().st_size >= 128:
            f.seek(-128, os.SEEK_END)
            tail = f.read(128)
            if tail[:3] == b'TAG': return _text(tail[3:33].rstrip(b'\x00 '), 'latin-1')
    return None


def _wav_meta(path: Path) -> dict:
    title = None; byte_rate = 0; data_size = 0
    with path.open('rb') as f:
        f.seek(12)
        end = path.stat().st_size
        while f.tell() + 8 <= end:
            head = f.read(8)
            chunk, size = head[:4], int.from_bytes(head[4:], 'little')
            start = f.tell()
            if chunk == b'fmt ' and size >= 12:
                fmt = f.read(min(size, 32))
                byte_rate = int.from_bytes(fmt[8:12], 'little')
            elif chunk == b'data': data_size = size
            elif chunk == b'LIST' and size >= 4:
                if f.read(4) == b'INFO':
                    limit = min(start + size, end)
                    while f.tell() + 8 <= limit:
                        item = f.read(8)
                        item_size = int.from_bytes(item[4:], 'little')
                        if item_size > limit - f.tell(): break
                        item_start = f.tell()
                        if item[:4] == b'INAM': title = _text(f.read(min(item_size, 4096)).rstrip(b'\x00'), 'utf-8') or title
                        f.seek(item_start + item_size + (item_size & 1))
            f.seek(start + size + (size & 1))
    return {'tagTitle': title, 'duration': round(data_size / byte_rate, 3) if byte_rate else None}


def _png_meta(path: Path) -> dict:
    title = None; width = height = None
    with path.open('rb') as f:
        f.seek(8)
        scanned = 0
        while scanned < 1024 * 1024:
            header = f.read(8)
            if len(header) < 8: break
            length = int.from_bytes(header[:4], 'big'); kind = header[4:]
            if length > 1024 * 1024: break
            chunk = f.read(length); f.read(4); scanned += length + 12
            if kind == b'IHDR' and len(chunk) >= 8:
                width, height = struct.unpack('>II', chunk[:8])
            elif kind == b'tEXt' and b'\x00' in chunk:
                key, value = chunk.split(b'\x00', 1)
                if key.lower() == b'title': title = _text(value, 'latin-1') or title
            elif kind == b'iTXt' and b'\x00' in chunk:
                key, rest = chunk.split(b'\x00', 1)
                if key.lower() == b'title' and len(rest) > 3 and rest[0] == 0:
                    title = _text(rest[3:].split(b'\x00', 2)[-1]) or title
            if kind == b'IEND': break
    return {'tagTitle': title, 'width': width, 'height': height}


def _jpeg_meta(path: Path) -> dict:
    title = None; width = height = None
    with path.open('rb') as f:
        f.read(2)
        for _ in range(512):
            marker = f.read(2)
            if len(marker) < 2 or marker[0] != 0xff or marker[1] in (0xd9, 0xda): break
            length_raw = f.read(2)
            if len(length_raw) < 2: break
            length = int.from_bytes(length_raw, 'big') - 2
            if length < 0: break
            data = f.read(min(length, 1024 * 1024)); f.seek(max(0, length - len(data)), os.SEEK_CUR)
            if marker[1] in (0xc0, 0xc1, 0xc2, 0xc3) and len(data) >= 5:
                height, width = int.from_bytes(data[1:3], 'big'), int.from_bytes(data[3:5], 'big')
            if marker[1] == 0xe1 and data.startswith(b'Exif\x00\x00'):
                tiff = data[6:]
                if len(tiff) < 8: continue
                order = 'little' if tiff[:2] == b'II' else 'big' if tiff[:2] == b'MM' else None
                if not order: continue
                off = int.from_bytes(tiff[4:8], order)
                if off + 2 > len(tiff): continue
                count = min(int.from_bytes(tiff[off:off + 2], order), 256)
                for i in range(count):
                    e = tiff[off + 2 + i * 12:off + 14 + i * 12]
                    if len(e) < 12: break
                    if int.from_bytes(e[:2], order) != 0x010e or int.from_bytes(e[2:4], order) != 2: continue
                    size = int.from_bytes(e[4:8], order)
                    if size > 4096: continue
                    pos = int.from_bytes(e[8:12], order)
                    raw = e[8:8 + size] if size <= 4 else tiff[pos:pos + size]
                    title = _text(raw.rstrip(b'\x00'), 'utf-8') or _text(raw.rstrip(b'\x00'), 'latin-1') or title
    return {'tagTitle': title, 'width': width, 'height': height}


def _mp4_title(path: Path) -> str | None:
    with path.open('rb') as f:
        size = path.stat().st_size; pos = 0
        while pos + 8 <= size:
            f.seek(pos); head = f.read(16)
            atom_size = int.from_bytes(head[:4], 'big')
            if atom_size == 1: atom_size = int.from_bytes(head[8:16], 'big')
            if atom_size < 8 or pos + atom_size > size: break
            if head[4:8] == b'moov':
                f.seek(pos + (16 if head[:4] == b'\x00\x00\x00\x01' else 8))
                moov = f.read(min(atom_size, 16 * 1024 * 1024))
                return _mp4_name_in(moov, 0)
            pos += atom_size
    return None


def _mp4_name_in(data: bytes, depth: int) -> str | None:
    if depth > 8: return None
    pos = 0
    while pos + 8 <= len(data):
        size = int.from_bytes(data[pos:pos + 4], 'big'); kind = data[pos + 4:pos + 8]
        if size < 8 or pos + size > len(data): break
        body = data[pos + 8:pos + size]
        if kind == b'\xa9nam':
            i = body.find(b'data')
            if i >= 4 and i + 12 <= len(body): return _text(body[i + 12:])
        if kind in (b'udta', b'ilst', b'meta', b'moov'):
            result = _mp4_name_in(body[4:] if kind == b'meta' else body, depth + 1)
            if result: return result
        pos += size
    return None


def _webm_title(path: Path) -> str | None:
    with path.open('rb') as f: data = f.read(4 * 1024 * 1024)
    pos = data.find(b'\x7b\xa9')
    if pos < 0 or pos + 3 >= len(data): return None
    first = data[pos + 2]
    mask = 0x80; width = 1
    while width <= 8 and not first & mask: mask >>= 1; width += 1
    if width > 8 or pos + 2 + width > len(data): return None
    length = first & (mask - 1)
    for b in data[pos + 3:pos + 2 + width]: length = (length << 8) | b
    if not 0 < length <= 4096: return None
    start = pos + 2 + width
    return _text(data[start:start + length])


def inspect_file(path: Path, ext: str, original_name: str) -> dict:
    info = {}
    try:
        if ext == 'mp3': info['tagTitle'] = _id3_title(path)
        elif ext == 'wav': info.update(_wav_meta(path))
        elif ext == 'png': info.update(_png_meta(path))
        elif ext in ('jpg', 'jpeg'): info.update(_jpeg_meta(path))
        elif ext == 'mp4': info['tagTitle'] = _mp4_title(path)
        elif ext == 'webm': info['tagTitle'] = _webm_title(path)
        elif ext == 'gif':
            with path.open('rb') as f:
                head = f.read(10); info.update(width=int.from_bytes(head[6:8], 'little'), height=int.from_bytes(head[8:10], 'little'))
        elif ext == 'bmp':
            with path.open('rb') as f:
                head = f.read(26); info.update(width=int.from_bytes(head[18:22], 'little'), height=abs(int.from_bytes(head[22:26], 'little', signed=True)))
    except (OSError, ValueError, UnicodeError, OverflowError, struct.error):
        pass  # A malformed optional tag never prevents a valid file from being registered.
    tag = _clean_title(info.pop('tagTitle', None))
    return {'name': tag or Path(original_name).stem, 'titleSource': 'metadata' if tag else 'filename', **{k: v for k, v in info.items() if v is not None}}


def read_index(root: Path) -> list[dict]:
    path = root / 'index.json'
    if not path.exists(): return []
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('schema') != 1 or not isinstance(data.get('items'), list):
        raise ValueError('library asset index is invalid; original data was not changed')
    return data['items']


def _write_index(root: Path, items: list[dict]) -> None:
    root.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='index-', suffix='.tmp', dir=root)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump({'schema': 1, 'items': items}, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(name, root / 'index.json')
    finally:
        if os.path.exists(name): os.unlink(name)


def register_stream(root: Path, stream, length: int, kind: str, name: str) -> dict:
    ext = validate(kind, name, length)
    files = root / 'files'; files.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='incoming-', suffix='.tmp', dir=files)
    digest = hashlib.sha256(); head = b''
    try:
        with os.fdopen(fd, 'wb') as out:
            remaining = length
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk: raise ValueError('incomplete asset upload')
                if len(head) < 64: head = (head + chunk)[:64]
                digest.update(chunk); out.write(chunk); remaining -= len(chunk)
            out.flush(); os.fsync(out.fileno())
        if not valid_signature(ext, head): raise ValueError('file contents do not match its extension')
        if ext == 'glb' and int.from_bytes(head[8:12], 'little') != length:
            raise ValueError('GLB length does not match the uploaded file')
        sha = digest.hexdigest()
        ident = hashlib.sha256((sha + '\x00' + kind + '\x00' + name).encode('utf-8')).hexdigest()[:24]
        asset_id = 'library:' + ident
        items = read_index(root)  # Fail before touching any registered entry if the index is corrupt.
        old = next((item for item in items if item.get('id') == asset_id), None)
        if old: return old
        stored = sha + '.' + ext
        target = files / stored
        if not target.exists(): os.replace(temp, target)
        metadata = inspect_file(target, ext, name)
        item = {'id': asset_id, 'kind': kind, 'format': ext.upper(), 'source': 'library',
                'filename': stored, 'originalName': name, 'bytes': length, 'sha256': sha,
                'mime': MIME[ext], **metadata}
        _write_index(root, items + [item])
        return item
    finally:
        if os.path.exists(temp): os.unlink(temp)


def public_items(root: Path) -> list[dict]:
    out = []
    for item in read_index(root):
        asset_id = item.get('id', '')
        if not isinstance(asset_id, str) or not re.fullmatch(r'library:[0-9a-f]{24}', asset_id): continue
        filename = item.get('filename', '')
        if not isinstance(filename, str) or not re.fullmatch(r'[0-9a-f]{64}\.[a-z0-9]{3,5}', filename): continue
        thumb = root / 'thumbnails' / _thumbnail_name(item)
        out.append({**item, 'available': (root / 'files' / filename).is_file(),
                    'previewable': item.get('kind') in ('stage', 'prop', 'fx', 'audio', 'video', 'image', 'material'),
                    'thumbnailUrl': f'/api/library-assets/thumbnail/{asset_id}' + ('?v=2' if item.get('kind') == 'stage' else '') if thumb.is_file() else None})
    return out


def _thumbnail_name(item: dict) -> str:
    """Stage v2 stores the interior view separately from the old sphere framing."""
    suffix = '-stage-v2' if item.get('kind') == 'stage' else ''
    return item['id'][8:] + suffix + '.png'


def entry_for(root: Path, asset_id: str) -> dict | None:
    if not re.fullmatch(r'library:[0-9a-f]{24}', asset_id): return None
    return next((e for e in public_items(root) if e['id'] == asset_id and e['available']), None)


def file_for(root: Path, asset_id: str) -> tuple[Path, str] | None:
    entry = entry_for(root, asset_id)
    if not entry: return None
    return root / 'files' / entry['filename'], entry['mime']


def save_thumbnail(root: Path, asset_id: str, payload: bytes) -> Path:
    entry = entry_for(root, asset_id)
    if not entry: raise ValueError('asset is not registered')
    if not 33 <= len(payload) <= MAX_THUMBNAIL or not payload.startswith(b'\x89PNG\r\n\x1a\n') or payload[12:16] != b'IHDR':
        raise ValueError('thumbnail must be a PNG image')
    width, height = struct.unpack('>II', payload[16:24])
    if not (32 <= width <= 2048 and 32 <= height <= 2048): raise ValueError('thumbnail dimensions are invalid')
    folder = root / 'thumbnails'; folder.mkdir(parents=True, exist_ok=True)
    target = folder / _thumbnail_name(entry)
    if target.is_file(): return target
    fd, name = tempfile.mkstemp(prefix='thumbnail-', suffix='.tmp', dir=folder)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(payload); f.flush(); os.fsync(f.fileno())
        os.replace(name, target)
    finally:
        if os.path.exists(name): os.unlink(name)
    return target


def thumbnail_for(root: Path, asset_id: str) -> Path | None:
    entry = entry_for(root, asset_id)
    if not entry: return None
    path = root / 'thumbnails' / _thumbnail_name(entry)
    return path if path.is_file() else None
