"""Lip drafts are editable and revisioned without changing SRT or readings."""
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import server
from studio_project_catalog import create, set_fps


def test_lip_draft_http_edit_reload_and_stale_guards(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '口形下書き')['id']
    set_fps(catalog, project_id, 24)
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
            return error.code, json.loads(error.read())

    try:
        original = b'1\r\n00:00:01,000 --> 00:00:03,000\r\nHello\r\n'
        assert request('/srt/import', {'project_id': project_id, 'revision': 0,
            'name': 'test.srt', 'encoding': 'utf-8'}, original)[0] == 200
        source = request('/srt/sources', {'project_id': project_id})[1]['sources'][0]
        source_file = data/'studio_v05_srt_sources'/project_id/'sources'/source['relativePath']
        reading_body = {'project_id': project_id, 'revision': 0, 'source_id': source['id'],
            'source_hash': source['sha256'], 'srt_index': 1, 'reading_state': 'confirmed',
            'reading_kana': 'あい', 'explicit_silence': False}
        assert request('/lip/readings', payload=reading_body)[0] == 200
        reading_file = data/'studio_v05_lip_readings'/(project_id + '.json')
        reading_bytes = reading_file.read_bytes()
        query = {'project_id': project_id, 'source_id': source['id'], 'srt_index': 1}
        candidate = request('/lip/candidates', query)[1]
        assert candidate['status'] == 'ready'
        assert request('/lip/drafts', {'project_id': project_id})[1]['drafts'] == []
        body = {'project_id': project_id, 'revision': 0, 'source_id': source['id'],
                'source_hash': source['sha256'], 'srt_index': 1,
                'pronunciation_version': candidate['pronunciationVersion'],
                'project_fps': candidate['projectFps'],
                'segments': [{'startFrame': 24, 'endFrame': 45, 'mouthShape': 'A', 'weight': 0.7},
                             {'startFrame': 45, 'endFrame': 72, 'mouthShape': 'I', 'weight': 0}]}
        code, saved = request('/lip/drafts', payload=body)
        assert code == 200 and saved['revision'] == 1
        assert saved['drafts'][0]['draftStatus'] == 'draft'
        assert saved['drafts'][0]['exportReady'] is False
        assert saved['drafts'][0]['segments'][1]['weight'] == 0
        assert request('/lip/drafts', {'project_id': project_id})[1] == saved
        assert request('/lip/drafts', payload=body)[0] == 409
        assert request('/lip/drafts', payload={**body, 'revision': 1,
            'segments': [body['segments'][1], body['segments'][0]]})[0] == 422
        assert request('/lip/drafts', payload={**body, 'revision': 1,
            'segments': [{**body['segments'][0], 'endFrame': 73}]})[0] == 422
        assert request('/lip/drafts', payload={**body, 'revision': 1,
            'segments': [{**body['segments'][0], 'weight': 1.2}]})[0] == 422
        assert request('/lip/drafts', payload={**body, 'revision': 1,
            'segments': [{**body['segments'][0], 'mouthShape': 'bad'}]})[0] == 422
        assert request('/lip/drafts', {'project_id': project_id})[1] == saved
        assert source_file.read_bytes() == original and reading_file.read_bytes() == reading_bytes
        assert request('/lip/readings', payload={**reading_body, 'revision': 1,
            'reading_kana': 'あう'})[0] == 200
        assert request('/lip/drafts', {'project_id': project_id})[1]['drafts'][0]['draftStatus'] == 'reading_changed'
        assert request('/lip/drafts', payload={**body, 'revision': 1})[0] == 409
        set_fps(catalog, project_id, 30)
        assert request('/lip/drafts', {'project_id': project_id})[1]['drafts'][0]['draftStatus'] == 'fps_changed'
        assert request('/lip/drafts', payload={**body, 'revision': 1})[0] == 409
        source_file.write_bytes(b'changed')
        assert request('/lip/drafts', {'project_id': project_id})[1]['drafts'][0]['draftStatus'] == 'source_changed'
        assert request('/lip/drafts', payload={**body, 'revision': 1})[0] == 409
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)
