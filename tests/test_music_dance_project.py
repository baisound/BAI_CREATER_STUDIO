"""Issue #39: placement persistence, revision conflicts, and corrupt-state safety."""
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import music_dance_project as dance
import server


def test_validation_revision_and_preserved_previous(tmp_path):
    path = tmp_path / 'music_dance_project.json'
    original = dance.read(path)
    assert original['project']['fps'] == 30
    changed = dict(original['project'], model_id='mmd:A:model.pmx',
                   motion_id='integrated:dance.glb', audio_id='library:' + 'a' * 24,
                   audio_start_frame=41, motion_start_frame=42)
    first = dance.save(path, changed)
    assert first['revision'] == dance.read(path)['revision'] != original['revision']
    dance.save(path, dict(changed, audio_start_frame=43))
    assert json.loads(path.with_name('music_dance_project.previous.json').read_text(encoding='utf8')) == changed
    invalid = dict(changed, audio_start_frame=True)
    with pytest.raises(ValueError): dance.save(path, invalid)
    assert dance.read(path)['project']['audio_start_frame'] == 43
    path.write_text('{broken', encoding='utf8')
    with pytest.raises(dance.InvalidMusicDanceProject): dance.read(path)
    with pytest.raises(ValueError): dance.save(path, changed)
    assert path.read_text(encoding='utf8') == '{broken'


def test_http_revision_conflict_and_corrupt_state(tmp_path, monkeypatch):
    path = tmp_path / 'music_dance_project.json'
    monkeypatch.setattr(server, 'MUSIC_DANCE_FILE', path)
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'

    def request(method, data=None, revision=None):
        headers = {'Content-Type': 'application/json'}
        if revision: headers['If-Match'] = revision
        req = urllib.request.Request(base + '/api/music-dance/project', data=data,
                                     headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    try:
        status, initial = request('GET')
        assert status == 200
        value = dict(initial['project'], model_id='mmd:A:model.pmx', motion_start_frame=10)
        payload = json.dumps(value).encode()
        assert request('POST', payload)[0] == 428
        assert request('POST', payload, initial['revision'])[0] == 200
        assert request('POST', payload, initial['revision'])[0] == 409
        assert request('GET')[1]['project'] == value
        bad = dict(value, motion_start_frame=-1)
        assert request('POST', json.dumps(bad).encode(), dance.read(path)['revision'])[0] == 400
        path.write_text('{broken', encoding='utf8')
        assert request('GET')[0] == 422
        assert request('POST', payload, dance.revision(value))[0] == 422
        assert path.read_text(encoding='utf8') == '{broken'
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=3)
