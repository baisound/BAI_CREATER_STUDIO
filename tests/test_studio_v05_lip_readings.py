"""LIP-001: readings and explicit silence persist apart from original SRT bytes."""
import hashlib
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import server
from studio_project_catalog import create


def test_reading_http_revision_hash_and_original_separation(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '読み作品')['id']
    other_id = create(catalog, '別作品')['id']
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05'

    def request(route, query=None, payload=None):
        url = base + route + ('?' + urllib.parse.urlencode(query) if query else '')
        body = json.dumps(payload, ensure_ascii=False).encode() if isinstance(payload, dict) else payload
        req = urllib.request.Request(url, data=body,
            headers={'Content-Type': 'application/json'} if isinstance(payload, dict) else {})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode('utf-8')

    try:
        original = ('1\r\n00:00:01,010 --> 00:00:02,020\r\n歌詞\r\n\r\n'
                    '2\r\n00:00:03,030 --> 00:00:04,040\r\n不明な歌\r\n').encode('utf-8')
        code, imported = request('/srt/import',
            {'project_id': project_id, 'revision': 0, 'name': '歌詞.srt', 'encoding': 'utf-8'}, original)
        assert code == 200
        source = imported['sources'][0]
        source_file = data / 'studio_v05_srt_sources' / project_id / 'sources' / source['relativePath']
        assert hashlib.sha256(source_file.read_bytes()).hexdigest() == source['sha256']
        assert request('/lip/readings', {'project_id': project_id})[1]['utterances'] == []
        body = {'project_id': project_id, 'revision': 0, 'source_id': source['id'],
                'source_hash': source['sha256'], 'srt_index': 1,
                'reading_state': 'confirmed', 'reading_kana': 'かし', 'explicit_silence': False}
        code, saved = request('/lip/readings', payload=body)
        assert code == 200
        assert saved['revision'] == 1
        row = saved['utterances'][0]
        assert row['readingKana'] == 'かし'
        assert row['sourceStartMs'] == 1010 and row['sourceEndMs'] == 2020
        assert row['sourceStatus'] == 'valid' and row['pronunciationVersion'] == 1
        assert request('/lip/readings', payload=body)[0] == 409
        assert request('/lip/readings', payload={**body, 'revision': 1,
            'reading_kana': '歌詞'})[0] == 422
        assert request('/lip/readings', payload={**body, 'revision': 1,
            'source_hash': '0' * 64})[0] == 409
        assert request('/lip/readings', payload={**body, 'revision': 1,
            'srt_index': 99})[0] == 404
        assert request('/lip/readings', payload={**body, 'revision': 1,
            'reading_state': 'unresolved'})[0] == 422
        code, silenced = request('/lip/readings', payload={**body, 'revision': 1,
            'srt_index': 2, 'reading_state': 'unresolved', 'reading_kana': None,
            'explicit_silence': True})
        assert code == 200
        assert silenced['revision'] == 2 and silenced['utterances'][1]['explicitSilence'] is True
        code, updated = request('/lip/readings', payload={**body, 'revision': 2,
            'reading_state': 'proposed', 'reading_kana': 'カシ'})
        assert code == 200
        assert updated['utterances'][0]['id'] == row['id']
        assert updated['utterances'][0]['pronunciationVersion'] == 2
        assert updated['utterances'][0]['readingKana'] == 'カシ'
        assert request('/lip/readings', {'project_id': other_id})[1]['utterances'] == []
        assert source_file.read_bytes() == original
        source_file.write_bytes(b'changed')
        assert request('/lip/readings', {'project_id': project_id})[1]['utterances'][0]['sourceStatus'] == 'changed'
        assert request('/lip/readings', payload={**body, 'revision': 3})[0] == 409
        assert (data / 'studio_v05_lip_readings' / (project_id + '.json')).is_file()
        assert source_file.read_bytes() == b'changed'
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)
