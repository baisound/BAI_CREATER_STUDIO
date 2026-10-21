"""Issue #37: isolated media library and real HTTP range/upload contract."""
import io
import json
import struct
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import library_assets as lib
import server


def chunk(tag, data):
    return tag + struct.pack('<I', len(data)) + data + (b'\0' if len(data) & 1 else b'')


def wav(title='波の音'):
    info = chunk(b'LIST', b'INFO' + chunk(b'INAM', title.encode() + b'\0'))
    fmt = chunk(b'fmt ', struct.pack('<HHIIHH', 1, 1, 8000, 16000, 2, 16))
    body = fmt + chunk(b'data', b'\0' * 16000) + info
    return b'RIFF' + struct.pack('<I', len(body) + 4) + b'WAVE' + body


def mp3(title='タグの曲名'):
    text = b'\x03' + title.encode()
    frame = b'TIT2' + struct.pack('>I', len(text)) + b'\0\0' + text
    length = len(frame)
    safe = bytes([(length >> 21) & 0x7f, (length >> 14) & 0x7f, (length >> 7) & 0x7f, length & 0x7f])
    return b'ID3\x04\0\0' + safe + frame + b'\xff\xfb\x90\x00'


def atom(kind, data):
    return struct.pack('>I', len(data) + 8) + kind + data


def mp4(title='映像タイトル'):
    tag = atom(b'\xa9nam', atom(b'data', b'\0\0\0\1\0\0\0\0' + title.encode()))
    return atom(b'ftyp', b'isom\0\0\0\0isom') + atom(b'moov', atom(b'udta', atom(b'meta', b'\0\0\0\0' + atom(b'ilst', tag))))


def png(width=64, height=64):
    return b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + b'IHDR' + struct.pack('>II', width, height) + b'\x08\x02\0\0\0' + b'\0\0\0\0' + b'\0' * 12


def test_validation_and_metadata(tmp_path):
    root = tmp_path / 'library'
    assert lib.validate('stage', 'large.glb', 692_894_092) == 'glb'
    with __import__('pytest').raises(ValueError): lib.validate('prop', 'large.glb', 692_894_092)
    with __import__('pytest').raises(ValueError): lib.validate('stage', 'too-large.glb', lib.MAX_STAGE_UPLOAD + 1)
    with __import__('pytest').raises(ValueError): lib.register_stream(root, io.BytesIO(b'x'), 1, 'audio', '../bad.mp3')
    with __import__('pytest').raises(ValueError): lib.register_stream(root, io.BytesIO(b'not mp3'), 7, 'audio', 'bad.mp3')
    assert not lib.read_index(root)
    for name, kind, payload, expected in [
        ('fallback.wav', 'audio', wav(), '波の音'),
        ('fallback.mp3', 'audio', mp3(), 'タグの曲名'),
        ('fallback.mp4', 'video', mp4(), '映像タイトル'),
        ('untagged.mp3', 'audio', b'\xff\xfb\x90\x00more', 'untagged'),
    ]:
        item = lib.register_stream(root, io.BytesIO(payload), len(payload), kind, name)
        assert item['name'] == expected
        assert item['titleSource'] == ('filename' if name == 'untagged.mp3' else 'metadata')
        assert lib.register_stream(root, io.BytesIO(payload), len(payload), kind, name)['id'] == item['id']
    assert len(lib.read_index(root)) == 4
    first = lib.read_index(root)[0]
    assert first['duration'] == 1.0
    assert lib.file_for(root, first['id'])[0].read_bytes() == wav()
    assert lib.file_for(root, 'library:../../etc') is None


def test_thumbnail_and_corrupt_index_keep_originals(tmp_path):
    root = tmp_path / 'library'
    payload = png()
    item = lib.register_stream(root, io.BytesIO(payload), len(payload), 'image', 'test.png')
    saved = lib.save_thumbnail(root, item['id'], payload)
    assert saved.read_bytes() == payload
    assert lib.public_items(root)[0]['thumbnailUrl'].endswith(item['id'])
    assert lib.thumbnail_for(root, item['id']) == saved
    with __import__('pytest').raises(ValueError): lib.save_thumbnail(root, 'library:' + '0' * 24, payload)
    before = lib.file_for(root, item['id'])[0]
    (root / 'index.json').write_text('{broken', encoding='utf8')
    with __import__('pytest').raises(ValueError): lib.register_stream(root, io.BytesIO(payload), len(payload), 'image', 'new.png')
    assert before.exists() and before.read_bytes() == payload


def test_http_upload_catalog_range_and_thumbnail(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'LIBRARY_ROOT', tmp_path / 'library')
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'
    def request(path, data=None, headers=None):
        req = urllib.request.Request(base + path, data=data, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp: return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as err: return err.code, err.read(), dict(err.headers)
    try:
        payload = wav()
        status, body, _ = request('/api/library-assets/upload?kind=audio&name=' + urllib.parse.quote('sample.wav'), payload)
        assert status == 200
        item = json.loads(body)['item']
        assert item['name'] == '波の音'
        status, body, _ = request('/api/assets')
        assert status == 200
        assert any(x['id'] == item['id'] for x in json.loads(body)['items'])
        status, body, headers = request('/api/library-assets/file/' + item['id'], headers={'Range': 'bytes=5-11'})
        assert status == 206 and body == payload[5:12]
        assert headers['Content-Range'] == f'bytes 5-11/{len(payload)}'
        status, _, _ = request('/api/library-assets/file/' + item['id'], headers={'Range': f'bytes={len(payload)}-'})
        assert status == 416
        assert request('/api/library-assets/file/library:../../etc')[0] == 404
        assert request('/api/library-assets/upload?kind=stage&name=bad.glb', b'not glb')[0] == 400
        status, _, _ = request('/api/library-assets/thumbnail?id=' + item['id'], png())
        assert status == 200
        status, body, _ = request('/api/library-assets/thumbnail/' + item['id'])
        assert status == 200 and body == png()
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=3)
