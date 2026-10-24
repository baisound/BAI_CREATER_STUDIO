"""LIP-004: registered PMX analysis endpoint and hash-bound read-only result."""
import hashlib
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import server
from studio_v05_pmx_analysis import inspect, PmxAnalysisError
from tools.make_test_pmx import build_pmx


def test_registered_pmx_analysis_and_http(tmp_path, monkeypatch):
    root = tmp_path / 'mmd'
    folder = root / 'A'
    folder.mkdir(parents=True)
    source = folder / 'tiny.pmx'
    original = build_pmx()
    source.write_bytes(original)
    expected_hash = hashlib.sha256(original).hexdigest()
    asset = {'id': 'mmd:A:tiny.pmx', 'source': 'mmd', 'kind': 'A', 'format': 'PMX',
             'name': 'tiny.pmx', 'available': True}
    bad = {**asset, 'id': 'mmd:A:escape.pmx', 'name': '../tiny.pmx'}
    monkeypatch.setattr(server, 'MMD_DIR', root)
    monkeypatch.setattr(server, 'unified_assets', lambda: [asset, bad])
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    result = inspect(asset['id'], [asset], server.character_source)
    assert result['asset_id'] == asset['id']
    assert result['modelHash'] == expected_hash
    assert result['morphs'][0]['name'] == 'あ'
    assert result['morphs'][0]['affectedVertices'] == 1
    assert result['morphs'][0]['median'] == pytest.approx(0.2)
    assert source.read_bytes() == original
    with pytest.raises(PmxAnalysisError, match='hash changed') as changed:
        inspect(asset['id'], [asset], server.character_source, '0' * 64)
    assert changed.value.status == 409
    with pytest.raises(PmxAnalysisError) as escaped:
        inspect(bad['id'], [bad], server.character_source)
    assert escaped.value.status == 404

    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/pmx/morph-analysis'

    def get(query):
        try:
            with urllib.request.urlopen(base + '?' + urllib.parse.urlencode(query), timeout=20) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode('utf-8')

    try:
        assert get({'asset_id': asset['id']})[1]['modelHash'] == expected_hash
        assert get({'asset_id': asset['id'], 'model_hash': expected_hash})[0] == 200
        assert get({'asset_id': asset['id'], 'model_hash': '0' * 64})[0] == 409
        assert get({'asset_id': 'mmd:A:missing.pmx'})[0] == 404
        assert get({'asset_id': bad['id']})[0] == 404
        assert get({'asset_id': asset['id'], 'unexpected': 'path'})[0] == 400
        assert get({'asset_id': asset['id'], 'model_hash': 'bad'})[0] == 400
        assert source.read_bytes() == original
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=3)
