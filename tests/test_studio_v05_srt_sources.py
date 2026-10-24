"""SRT import preserves original bytes and independent start/end times."""
import hashlib
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import server
from studio_project_catalog import create
from studio_v05_srt_sources import SrtSourceError, parse, read


def test_srt_parser_encoding_timing_and_invalid_cues():
    text = ('1\r\n00:00:01,250 --> 00:00:02,750\r\nあいう\r\n\r\n'
            '2\r\n00:00:02,500 --> 00:00:03,000\r\n歌詞\r\n')
    original = text.encode('cp932')
    result = parse(original, 'cp932')
    assert result['sha256'] == hashlib.sha256(original).hexdigest()
    assert result['entries'] == [
        {'index': 1, 'startMs': 1250, 'endMs': 2750, 'text': 'あいう'},
        {'index': 2, 'startMs': 2500, 'endMs': 3000, 'text': '歌詞'}]
    assert result['warnings'] == [{'code': 'time_overlap', 'indices': [1, 2]}]
    bom = b'\xef\xbb\xbf' + text.encode('utf-8')
    assert parse(bom, 'utf-8-bom')['entries'] == result['entries']
    for bytes_, encoding in [(bom, 'utf-8'), (original, 'utf-8'), (b'1\n00:00:00,000 --> 00:00:01,000\nx', 'utf-8-bom')]:
        with pytest.raises(SrtSourceError):
            parse(bytes_, encoding)
    for invalid in (
        '1\n00:00:00,000 --> 00:00:01,000\na\n\n1\n00:00:02,000 --> 00:00:03,000\nb',
        '1\n00:00:01,000 --> 00:00:01,000\na',
        '1\n00:00:02,000 --> 00:00:01,000\na',
        '1\n00:00:00,000 --> 00:00:01,000',
        '1\n00:00:70,000 --> 00:00:71,000\na',
    ):
        with pytest.raises(SrtSourceError):
            parse(invalid.encode(), 'utf-8')


def test_srt_http_project_registration_reload_and_hash_guard(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, 'SRT作品')['id']
    other_id = create(catalog, '他作品')['id']
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/srt'

    def request(route, query, payload=None):
        url = base + route + '?' + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, data=payload)
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode('utf-8')

    try:
        original = ('1\r\n00:00:01,001 --> 00:00:02,002\r\n歌詞\r\n').encode('cp932')
        query = {'project_id': project_id, 'revision': 0, 'name': '歌詞.srt', 'encoding': 'cp932'}
        assert request('/sources', {'project_id': project_id})[1]['sources'] == []
        code, saved = request('/import', query, original)
        assert code == 200
        assert saved['revision'] == 1
        row = saved['sources'][0]
        assert row['sourceStatus'] == 'valid'
        assert row['sha256'] == hashlib.sha256(original).hexdigest()
        assert row['entries'] == [{'index': 1, 'startMs': 1001, 'endMs': 2002, 'text': '歌詞'}]
        stored = data / 'studio_v05_srt_sources' / project_id / 'sources' / row['relativePath']
        assert stored.read_bytes() == original
        assert read(data/'studio_v05_srt_sources', catalog, project_id)['sources'][0]['id'] == row['id']
        assert request('/sources', {'project_id': other_id})[1]['sources'] == []
        assert request('/import', query, original)[0] == 409
        assert request('/import', {**query, 'revision': 1, 'encoding': 'utf-8'}, original)[0] == 422
        assert request('/import', {**query, 'revision': 1, 'name': '../escape.srt'}, original)[0] == 400
        assert request('/import', {**query, 'revision': 1, 'project_id': 'missing'}, original)[0] == 404
        assert stored.read_bytes() == original
        assert request('/sources', {'project_id': project_id})[1]['revision'] == 1
        stored.write_bytes(b'changed')
        assert request('/sources', {'project_id': project_id})[1]['sources'][0]['sourceStatus'] == 'changed'
        assert request('/import', {**query, 'revision': 1}, original)[0] == 409
        assert stored.read_bytes() == b'changed'
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)
