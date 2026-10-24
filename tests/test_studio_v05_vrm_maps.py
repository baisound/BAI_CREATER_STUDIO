"""LIP-004: manual VRM expression maps require real morph binds to confirm."""
import hashlib
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import server
from studio_project_catalog import create
from studio_v05_vrm_expressions import inspect
from tests.test_studio_v05_vrm_expressions import glb


def test_vrm_map_http_draft_confirm_reload_and_hash(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    folder = data / 'integrated_v02' / 'assets'
    folder.mkdir(parents=True)
    groups = []
    for index, preset in enumerate(('a', 'i', 'u', 'e', 'o')):
        groups.append({'name': preset, 'presetName': preset,
                       'binds': [{'mesh': 0, 'index': index, 'weight': 100}]})
    groups.append({'name': 'invalid', 'presetName': 'unknown',
                   'binds': [{'mesh': 0, 'index': 20, 'weight': 100}]})
    original = glb({'meshes': [{'primitives': [{'targets': [{} for _ in range(5)]}]}],
                    'extensions': {'VRM': {'blendShapeMaster': {'blendShapeGroups': groups}}}})
    source = folder / 'tiny.vrm'
    source.write_bytes(original)
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, 'VRM口形A')['id']
    other_id = create(catalog, 'VRM口形B')['id']
    asset = {'id': 'integrated:tiny.vrm', 'source': 'integrated', 'kind': 'model',
             'format': 'VRM', 'filename': 'tiny.vrm', 'available': True}
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'unified_assets', lambda: [asset])
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    analysis = inspect(asset['id'], [asset], server.character_source)
    assert analysis['modelHash'] == hashlib.sha256(original).hexdigest()
    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/vrm/expression-map'

    def request(query=None, body=None):
        url = base + ('?' + urllib.parse.urlencode(query) if query else '')
        raw = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=raw,
            headers={'Content-Type': 'application/json'} if raw else {})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()

    entries = {shape: ({'expression_index': index, 'expression_name': preset,
                       'kind': 'preset', 'weight': 0.8} if index < 5 else None)
               for index, (shape, preset) in enumerate(zip(
                   ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest'),
                   ('a', 'i', 'u', 'e', 'o', '', '')))}
    payload = {'project_id': project_id, 'revision': 0, 'action': 'set',
               'model_asset_id': asset['id'], 'model_hash': analysis['modelHash'],
               'analysis_hash': analysis['analysisHash'], 'entries': entries,
               'confirmed': False}
    try:
        assert request({'project_id': project_id})[1]['revision'] == 0
        status, draft = request(body=payload)
        assert status == 200 and draft['revision'] == 1
        map_id = draft['maps'][0]['id']
        assert draft['maps'][0]['source_status'] == 'valid'
        assert request({'project_id': other_id})[1]['maps'] == []
        assert request(body=payload)[0] == 409
        invalid = {**entries, 'A': {'expression_index': 5, 'expression_name': 'invalid',
                                    'kind': 'custom', 'weight': 0.8}}
        assert request(body={**payload, 'revision': 1, 'entries': invalid,
                             'confirmed': True})[0] == 422
        assert request(body={**payload, 'revision': 1, 'model_hash': '0' * 64})[0] == 409
        assert request(body={**payload, 'revision': 1, 'analysis_hash': '0' * 64})[0] == 409
        assert request(body={**payload, 'revision': 1, 'entries': {**entries, 'A':
                             {**entries['A'], 'weight': 0}}, 'confirmed': True})[0] == 422
        status, confirmed = request(body={**payload, 'revision': 1, 'confirmed': True})
        assert status == 200 and confirmed['revision'] == 2
        assert confirmed['maps'][0]['id'] == map_id and confirmed['maps'][0]['confirmed']
        assert source.read_bytes() == original
        source.write_bytes(original + b'changed')
        assert request({'project_id': project_id})[1]['maps'][0]['source_status'] == 'changed'
        assert request(body={**payload, 'revision': 2})[0] == 409
        status, removed = request(body={'project_id': project_id, 'revision': 2,
                                        'action': 'remove', 'map_id': map_id})
        assert status == 200 and removed['maps'] == []
        file = data / 'studio_v05_vrm_maps' / (project_id + '.json')
        file.write_text('{broken', encoding='utf-8')
        assert request({'project_id': project_id})[0] == 422
        assert file.read_text(encoding='utf-8') == '{broken'
    finally:
        api.shutdown(); api.server_close(); thread.join(timeout=3)
