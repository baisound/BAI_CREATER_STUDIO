"""Review-only mora proposals preserve SRT [start,end) and block unresolved cues."""
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import server
from studio_project_catalog import create, set_fps
from studio_v05_lip_candidates import segments, _frame


def test_mora_splits_long_sokuon_nasal_and_project_frame_rounding():
    assert [_frame(ms, 10) for ms in (50, 150, 250, 350)] == [0, 2, 2, 4]
    rows, warnings = segments('まっすぐー', 1000, 6000, 30)
    assert warnings == []
    assert [row['mouthShape'] for row in rows] == ['Closed', 'A', 'Closed', 'U', 'U', 'U']
    assert rows[0]['startMs'] == 1000 and rows[-1]['endMs'] == 6000
    assert all(a['endMs'] == b['startMs'] for a, b in zip(rows, rows[1:]))
    assert all(row['startFrame'] < row['endFrame'] for row in rows)
    assert segments('きゃく', 1000, 2000, 24)[0] == [
        {'mora': 'きゃ', 'mouthShape': 'A', 'startMs': 1000, 'endMs': 1500,
         'startFrame': 24, 'endFrame': 36},
        {'mora': 'く', 'mouthShape': 'U', 'startMs': 1500, 'endMs': 2000,
         'startFrame': 36, 'endFrame': 48}]
    assert segments('んー', 0, 1000, 30)[1][0]['code'] == 'unknown_mora'
    assert any(warning['code'] == 'frame_collision' for warning in segments('あいう', 0, 3, 30)[1])


def test_candidate_http_unresolved_confirmed_silence_and_source_hash(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '候補作品')['id']
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
            return error.code, error.read().decode('utf-8')

    try:
        original = ('1\r\n00:00:01,000 --> 00:00:06,000\r\nまっすぐ\r\n\r\n'
                    '2\r\n00:00:07,000 --> 00:00:08,000\r\n歌詞\r\n').encode('utf-8')
        assert request('/srt/import', {'project_id': project_id, 'revision': 0,
            'name': '歌詞.srt', 'encoding': 'utf-8'}, original)[0] == 200
        source = request('/srt/sources', {'project_id': project_id})[1]['sources'][0]
        query = {'project_id': project_id, 'source_id': source['id'], 'srt_index': 1}
        code, unresolved = request('/lip/candidates', query)
        assert code == 200 and unresolved['status'] == 'unresolved'
        assert unresolved['segments'] == [] and unresolved['candidateOnly'] is True
        body = {'project_id': project_id, 'revision': 0, 'source_id': source['id'],
                'source_hash': source['sha256'], 'srt_index': 1, 'reading_state': 'proposed',
                'reading_kana': 'まっすぐー', 'explicit_silence': False}
        assert request('/lip/readings', payload=body)[0] == 200
        code, proposed = request('/lip/candidates', query)
        assert code == 200 and proposed['status'] == 'proposed'
        assert proposed['sourceStartMs'] == 1000 and proposed['sourceEndMs'] == 6000
        assert proposed['projectFps'] == 24
        assert proposed['segments'][0]['startFrame'] == 24
        assert proposed['segments'][-1]['endFrame'] == 144
        assert [part['mouthShape'] for part in proposed['segments']] == ['Closed', 'A', 'Closed', 'U', 'U', 'U']
        assert request('/lip/readings', payload={**body, 'revision': 1,
            'reading_state': 'confirmed'})[0] == 200
        assert request('/lip/candidates', query)[1]['status'] == 'ready'
        assert request('/lip/readings', payload={**body, 'revision': 2, 'srt_index': 2,
            'reading_state': 'unresolved', 'reading_kana': None,
            'explicit_silence': True})[0] == 200
        silence = request('/lip/candidates', {**query, 'srt_index': 2})[1]
        assert silence['status'] == 'explicit_silence' and silence['segments'] == []
        file = data/'studio_v05_srt_sources'/project_id/'sources'/source['relativePath']
        assert file.read_bytes() == original
        file.write_bytes(b'changed')
        assert request('/lip/candidates', query)[0] == 409
        assert file.read_bytes() == b'changed'
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)
