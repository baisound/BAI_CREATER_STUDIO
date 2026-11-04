"""Issue #35: isolated character thumbnail cache and HTTP contract."""
import json
import struct
import threading
import urllib.error
import urllib.parse
import urllib.request
import zlib
from http.server import ThreadingHTTPServer

import asset_thumbnails
import server


def png(width=64, height=64):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    pixels = b''.join(b'\x00' + b'\x80\x80\x80' * width for _ in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def test_character_thumbnail_http_and_source_change(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    (data / 'integrated_v02' / 'assets').mkdir(parents=True)
    (data / 'integrated_v02' / 'catalog.json').write_text(json.dumps({'models': [], 'motions': []}), encoding='utf-8')
    (data / 'integrated_v02' / 'user_assets.json').write_text(json.dumps([
        {'id': 'user-123', 'name': 'front-model.glb', 'filename': '12345678901234567890.glb', 'kind': 'model', 'bytes': 4},
    ]), encoding='utf-8')
    source = data / 'integrated_v02' / 'assets' / '12345678901234567890.glb'
    source.write_bytes(b'glTF')
    (data / 'mmd_assets.json').write_text('{"A":[],"B":[],"vmd":[]}', encoding='utf-8')
    for key, value in {
        'DATA': data, 'CUSTOM_INDEX': data / 'integrated_v02' / 'user_assets.json',
        'MMD_DIR': data / 'mmd', 'MMD_META': data / 'mmd_assets.json',
        'FILES': data / 'files', 'META': data / 'manifest.json',
        'LIBRARY_ROOT': data / 'library_assets', 'CHAR_THUMB_ROOT': data / 'asset_thumbnails',
    }.items():
        monkeypatch.setattr(server, key, value)
    asset_id = 'integrated:12345678901234567890.glb'
    assert server.unified_assets()[0].get('thumbnailUrl') is None
    assert server.unified_assets()[0]['bytes'] == 4
    assert server.character_source(server.unified_assets()[0]) == source.resolve()
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'

    def request(path, body=None):
        req = urllib.request.Request(base + path, data=body)
        try:
            with urllib.request.urlopen(req, timeout=20) as response: return response.status, response.read()
        except urllib.error.HTTPError as error: return error.code, error.read()

    try:
        encoded = urllib.parse.quote(asset_id, safe='')
        assert request('/api/assets/thumbnail/' + encoded)[0] == 404
        assert request('/api/assets/thumbnail?id=integrated%3Aunknown.glb', png())[0] == 404
        assert request('/api/assets/thumbnail?id=' + encoded, b'bad')[0] == 400
        status, body = request('/api/assets/thumbnail?id=' + encoded, png())
        assert status == 200
        url = json.loads(body)['url']
        assert request(url)[1] == png()
        listed = json.loads(request('/api/assets')[1])['items'][0]
        assert listed['thumbnailUrl'] == url
        assert listed['bytes'] == 4
        assert asset_thumbnails.thumbnail_for(data / 'asset_thumbnails', asset_id, source)
        source.write_bytes(b'glTF changed')
        assert request('/api/assets/thumbnail/' + encoded)[0] == 404
        updated = json.loads(request('/api/assets')[1])['items'][0]
        assert updated.get('thumbnailUrl') is None
        assert updated['bytes'] == len(b'glTF changed')
        assert source.read_bytes() == b'glTF changed'
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=3)


def test_fbx_and_mmd_entries_report_source_size(tmp_path, monkeypatch):
    """DATA-016: the detail pane shows each registered file's size, not 不明."""
    data = tmp_path / 'data'
    (data / 'integrated_v02').mkdir(parents=True)
    (data / 'integrated_v02' / 'catalog.json').write_text(json.dumps({'models': [], 'motions': []}), encoding='utf-8')
    (data / 'files').mkdir()
    (data / 'files' / 'aaaaaaaaaaaaaaaaaaaaaaaa.fbx').write_bytes(b'x' * 7)
    (data / 'manifest.json').write_text(json.dumps({'files': [
        {'id': 'aaaaaaaaaaaaaaaaaaaaaaaa', 'name': 'model.fbx', 'kind': 'modelA'},
        {'id': 'bbbbbbbbbbbbbbbbbbbbbbbb', 'name': 'gone.fbx', 'kind': 'motions'},
    ], 'mapping': {}}), encoding='utf-8')
    (data / 'mmd' / 'A').mkdir(parents=True)
    (data / 'mmd' / 'vmd').mkdir()
    (data / 'mmd' / 'A' / 'model.pmx').write_bytes(b'p' * 5)
    (data / 'mmd' / 'vmd' / 'dance.vmd').write_bytes(b'v' * 3)
    (data / 'mmd_assets.json').write_text(json.dumps({'A': [{'name': 'model.pmx'}], 'B': [], 'vmd': [{'name': 'dance.vmd'}]}), encoding='utf-8')
    for key, value in {
        'DATA': data, 'CUSTOM_INDEX': data / 'integrated_v02' / 'user_assets.json',
        'MMD_DIR': data / 'mmd', 'MMD_META': data / 'mmd_assets.json',
        'FILES': data / 'files', 'META': data / 'manifest.json',
        'LIBRARY_ROOT': data / 'library_assets', 'CHAR_THUMB_ROOT': data / 'asset_thumbnails',
    }.items():
        monkeypatch.setattr(server, key, value)
    sizes = {entry['id']: (entry['available'], entry['bytes']) for entry in server.unified_assets()}
    assert sizes['fbx:aaaaaaaaaaaaaaaaaaaaaaaa'] == (True, 7)
    assert sizes['fbx:bbbbbbbbbbbbbbbbbbbbbbbb'] == (False, None)
    assert sizes['mmd:A:model.pmx'] == (True, 5)
    assert sizes['mmd:vmd:dance.vmd'] == (True, 3)
