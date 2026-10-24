"""LIP-004: VRM 0.x/1.0 expressions need actual binds, not just preset names."""
import hashlib
import json
import os
import struct
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

import server
from studio_v05_vrm_expressions import analyze, inspect, VrmExpressionError


def glb(document):
    chunk = json.dumps(document, separators=(',', ':')).encode()
    chunk += b' ' * (-len(chunk) % 4)
    return struct.pack('<4sIIII', b'glTF', 2, 20 + len(chunk), len(chunk), 0x4E4F534A) + chunk


def test_vrm_vowels_require_valid_nonzero_morph_binds():
    geometry = {'meshes': [{'primitives': [{'targets': [{}, {}]}]}], 'nodes': [{'mesh': 0}]}
    vrm0 = analyze({**geometry, 'extensions': {'VRM': {'blendShapeMaster': {'blendShapeGroups': [
        {'name': 'A', 'presetName': 'a', 'binds': [{'mesh': 0, 'index': 0, 'weight': 100}]},
        {'name': 'U', 'presetName': 'u', 'binds': [{'mesh': 0, 'index': 1, 'weight': 0}]},
        {'name': 'E', 'presetName': 'e', 'binds': [{'mesh': 0, 'index': 99, 'weight': 100}]},
    ]}}}})
    assert [vrm0['vowels'][s]['status'] for s in 'AIUEO'] == [
        'ready', 'missing', 'unbound', 'invalid_bind', 'missing']
    assert vrm0['expressions'][0]['bindWeightRange'] == [0, 100]
    vrm1 = analyze({**geometry, 'extensions': {'VRMC_vrm': {'expressions': {'preset': {
        'aa': {'morphTargetBinds': [{'node': 0, 'index': 1, 'weight': 0.5}]},
        'ih': {},
        'ee': {'morphTargetBinds': [{'node': 0, 'index': 0, 'weight': 2}]},
    }}}}})
    assert [vrm1['vowels'][s]['status'] for s in 'AIUEO'] == [
        'ready', 'unbound', 'missing', 'invalid_bind', 'missing']
    assert vrm1['expressions'][0]['bindWeightRange'] == [0, 1]
    with pytest.raises(VrmExpressionError, match='expressions invalid'):
        analyze({'extensions': {'VRM': {'blendShapeMaster': None}}})


def test_registered_vrm_api_hash_and_source_isolation(tmp_path, monkeypatch):
    folder = tmp_path / 'integrated_v02' / 'assets'
    folder.mkdir(parents=True)
    document = {'meshes': [{'primitives': [{'targets': [{}]}]}], 'nodes': [{'mesh': 0}],
                'extensions': {'VRMC_vrm': {'expressions': {'preset': {
                    'aa': {'morphTargetBinds': [{'node': 0, 'index': 0, 'weight': 1}]},
                    'ih': {},
                }}}}}
    source = folder / 'tiny.vrm'
    original = glb(document)
    source.write_bytes(original)
    expected = hashlib.sha256(original).hexdigest()
    asset = {'id': 'integrated:tiny.vrm', 'source': 'integrated', 'kind': 'model',
             'format': 'VRM', 'filename': 'tiny.vrm', 'available': True}
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setattr(server, 'unified_assets', lambda: [asset])
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    result = inspect(asset['id'], [asset], server.character_source)
    assert result['modelHash'] == expected
    assert result['vowels']['A']['status'] == 'ready'
    assert result['expressionBinds'][0] == [{'node': 0, 'index': 0, 'weight': 1}]
    assert result['vowels']['I']['status'] == 'unbound'
    assert result['vowels']['U']['status'] == 'missing'
    with pytest.raises(VrmExpressionError) as changed:
        inspect(asset['id'], [asset], server.character_source, '0' * 64)
    assert changed.value.status == 409
    assert source.read_bytes() == original

    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/vrm/expressions'

    def get(query):
        try:
            with urllib.request.urlopen(base + '?' + urllib.parse.urlencode(query), timeout=20) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()

    try:
        assert get({'asset_id': asset['id']})[1]['modelHash'] == expected
        assert get({'asset_id': asset['id'], 'model_hash': expected})[0] == 200
        assert get({'asset_id': asset['id'], 'model_hash': '0' * 64})[0] == 409
        assert get({'asset_id': 'integrated:missing.vrm'})[0] == 404
        assert get({'asset_id': asset['id'], 'extra': 'path'})[0] == 400
        assert get({'asset_id': asset['id'], 'model_hash': 'bad'})[0] == 400
        assert source.read_bytes() == original
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=3)


def test_real_registered_vrm0_and_vrm1_are_read_only():
    root = os.environ.get('BAI_REAL_MMD_DATA')
    if not root:
        pytest.skip('BAI_REAL_MMD_DATA is not set')
    folder = Path(root) / 'integrated_v02' / 'assets'
    cases = [('21130746078bfaf0ce15.vrm', '0', 'ready'),
             ('W02_白峰ユキナ.vrm', '1', 'unbound')]
    for filename, version, status in cases:
        source = folder / filename
        if not source.is_file():
            pytest.skip(f'{filename} is unavailable')
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        asset = {'id': f'integrated:{filename}', 'format': 'VRM', 'available': True}
        result = inspect(asset['id'], [asset], lambda _: source)
        assert result['version'] == version
        assert result['modelHash'] == before
        assert {item['status'] for item in result['vowels'].values()} == {status}
        if version == '0':
            index = next(i for i, row in enumerate(result['expressions']) if row['name'] == 'a')
            assert result['expressionBinds'][index] == [{'mesh': 0, 'index': 39, 'weight': 1}]
        else:
            assert all(not row for row in result['expressionBinds'])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == before
