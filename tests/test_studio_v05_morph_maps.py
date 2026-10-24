"""LIP-004: map persistence, source hash invalidation and project isolation."""
import hashlib
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

import server
from studio_project_catalog import create
from studio_v05_morph_maps import read, mutate
from studio_v05_pmx_analysis import inspect
from tools.make_test_pmx import build_pmx


def test_morph_map_http_save_reload_conflict_and_source_change(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    folder = data / 'mmd' / 'A'
    folder.mkdir(parents=True)
    source = folder / 'tiny.pmx'
    original = build_pmx()
    source.write_bytes(original)
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '口形対応A')['id']
    other_id = create(catalog, '口形対応B')['id']
    asset = {'id': 'mmd:A:tiny.pmx', 'source': 'mmd', 'kind': 'A', 'format': 'PMX',
             'name': 'tiny.pmx', 'available': True}
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'MMD_DIR', data / 'mmd')
    monkeypatch.setattr(server, 'unified_assets', lambda: [asset])
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/pmx'

    def request(route, query=None, body=None):
        url = base + route + ('?' + urllib.parse.urlencode(query) if query else '')
        data_bytes = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data_bytes,
            headers={'Content-Type': 'application/json'} if body is not None else {})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode('utf-8')

    try:
        status, analysis = request('/morph-analysis', {'asset_id': asset['id']})
        assert status == 200
        assert analysis['modelHash'] == hashlib.sha256(original).hexdigest()
        assert request('/morph-map', {'project_id': project_id})[1]['revision'] == 0
        entry = {'morph_id': 0, 'morph_name': 'あ', 'weight': 0.8}
        entries = {shape: (entry if shape == 'A' else None)
                   for shape in ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')}
        payload = {'project_id': project_id, 'revision': 0, 'action': 'set',
                   'model_asset_id': asset['id'], 'model_hash': analysis['modelHash'],
                   'analysis_hash': analysis['analysisHash'], 'entries': entries,
                   'confirmed': False}
        status, saved = request('/morph-map', body=payload)
        assert status == 200
        assert saved['revision'] == 1
        assert len(saved['maps']) == 1
        assert saved['maps'][0]['source_status'] == 'valid'
        map_id = saved['maps'][0]['id']
        assert request('/morph-map', {'project_id': other_id})[1]['maps'] == []
        assert read(data / 'studio_v05_morph_maps', catalog, project_id,
                    [asset], server.character_source)['maps'][0]['id'] == map_id
        assert request('/morph-map', body=payload)[0] == 409  # stale revision
        assert request('/morph-map', body={**payload, 'revision': 1,
                                          'model_hash': '0' * 64})[0] == 409
        assert request('/morph-map', body={**payload, 'revision': 1,
                                          'analysis_hash': '0' * 64})[0] == 409
        bad_entries = {**entries, 'A': {**entry, 'morph_id': 99}}
        assert request('/morph-map', body={**payload, 'revision': 1,
                                          'entries': bad_entries})[0] == 422
        assert request('/morph-map', body={**payload, 'revision': 1,
                                          'confirmed': True})[0] == 422
        assert request('/morph-map', {'project_id': project_id})[1]['revision'] == 1
        complete = {shape: entry if shape in ('A', 'I', 'U', 'E', 'O') else None
                    for shape in entries}
        status, confirmed = request('/morph-map', body={**payload, 'revision': 1,
                                                       'entries': complete, 'confirmed': True})
        assert status == 200
        assert confirmed['revision'] == 2
        assert confirmed['maps'][0]['id'] == map_id
        assert confirmed['maps'][0]['confirmed'] is True
        assert source.read_bytes() == original
        source.write_bytes(original + b'changed')
        stale = request('/morph-map', {'project_id': project_id})[1]['maps'][0]
        assert stale['source_status'] == 'changed'
        assert request('/morph-map', body={**payload, 'revision': 2})[0] == 409
        status, removed = request('/morph-map', body={'project_id': project_id,
            'revision': 2, 'action': 'remove', 'map_id': map_id})
        assert status == 200
        assert removed['revision'] == 3 and removed['maps'] == []
        assert request('/morph-map', {'project_id': other_id})[1]['revision'] == 0
        file = data / 'studio_v05_morph_maps' / (project_id + '.json')
        file.write_text('{broken', encoding='utf-8')
        assert request('/morph-map', {'project_id': project_id})[0] == 422
        assert file.read_text(encoding='utf-8') == '{broken'
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=3)


def test_real_group_vowels_are_explicitly_weighted_and_source_retained(tmp_path):
    root = os.environ.get('BAI_REAL_MMD_DATA')
    if not root:
        pytest.skip('BAI_REAL_MMD_DATA is not set')
    source = Path(root) / 'mmd' / 'A' / 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx'
    if not source.is_file():
        pytest.skip('Real PMX A unavailable')
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    catalog = tmp_path / 'catalog.json'
    project_id = create(catalog, '実母音')['id']
    asset = {'id': 'mmd:A:real.pmx', 'format': 'PMX', 'available': True}
    source_for = lambda item: source if item is asset else None
    analysis = inspect(asset['id'], [asset], source_for)
    by_name = {row['name']: row for row in analysis['morphs']}
    entries = {shape: None for shape in ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')}
    for shape, name, weight in [('A', 'あ', 0.8), ('I', 'い', 0.7), ('U', 'う', 0.6),
                                ('E', 'え', 0.7), ('O', 'お', 0.9)]:
        row = by_name[name]
        assert row['type'] == 0 and row['manualRequired']
        entries[shape] = {'morph_id': row['id'], 'morph_name': name, 'weight': weight}
    result = mutate(tmp_path / 'maps', catalog, project_id, 0, 'set', [asset], source_for,
                    model_asset_id=asset['id'], model_hash=before,
                    analysis_hash=analysis['analysisHash'], entries=entries, confirmed=True)
    assert result['maps'][0]['confirmed'] is True
    assert result['maps'][0]['source_status'] == 'valid'
    assert result['maps'][0]['entries']['A']['weight'] == 0.8
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
