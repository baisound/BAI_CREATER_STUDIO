"""B-3（CAM-G06 の一部）：壊れたカメラ保存データの上書き防止と reset（P2-WP-00b）。

サーバーは同じプロセスで起動し、ルートの conftest.py の一時データ（BAI_DATA_DIR）を使う。実 data/ には触れない。
"""
import copy
import json
import pathlib
import re
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import bai_camera
import project_state_bundle
import server
from camera_project_revision import revision as camera_revision

BROKEN = b'{"broken":'
BACKUP_RE = re.compile(r'^camera_project\.invalid-[0-9a-f]{8}-\d{8}T\d{6}Z\.json$')


@pytest.fixture(scope='module')
def base():
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{httpd.server_address[1]}'
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture
def cam(base):
    path = server.DATA / 'camera_project.json'

    def clean():
        for f in server.DATA.glob('camera_project*'):
            f.unlink()
        server.PROJECT.unlink(missing_ok=True)
        server.PROJECT.with_suffix('.workspace.json').unlink(missing_ok=True)
    clean()
    yield path
    clean()


def call(base, method, path, body=None, headers=None):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def backups(path):
    return sorted(f for f in path.parent.glob('camera_project.invalid-*'))


def assert_invalid(status, body, path, original, backup=True):
    assert status == 422, body
    assert body['error_code'] == 'camera_project_invalid'
    assert 'カメラ保存データ（camera_project.json）を読めません' in body['error']
    if backup:
        assert BACKUP_RE.match(body['backup'])
        assert body['backup'] in body['error']
    else:
        assert body['backup'] is None
    assert path.read_bytes() == original


def valid_bundle():
    return {'schema': 1, 'combination': {'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}, 'camera': copy.deepcopy(bai_camera.DEFAULT)}


def legacy_bundle_revision():
    return project_state_bundle.bundle_revision(project_state_bundle.read_bundle(server.PROJECT, server.DATA / 'camera_project.json'))


# ---- 統合バンドル ----
def test_bundle_get_broken_returns_422_with_single_backup(base, cam):
    cam.write_bytes(BROKEN)
    status, body = call(base, 'GET', '/api/project/bundle')
    assert_invalid(status, body, cam, BROKEN)
    assert len(backups(cam)) == 1 and backups(cam)[0].name == body['backup']
    assert backups(cam)[0].parent == cam.parent
    assert backups(cam)[0].read_bytes() == BROKEN
    status, body2 = call(base, 'GET', '/api/project/bundle')
    assert_invalid(status, body2, cam, BROKEN)
    assert len(backups(cam)) == 1 and body2['backup'] == body['backup']


def test_bundle_post_broken_returns_422_even_with_matching_if_match(base, cam):
    cam.write_bytes(BROKEN)
    rev = legacy_bundle_revision()  # 旧 read() が返す既定値から計算した「正しい」版
    status, body = call(base, 'POST', '/api/project/bundle', valid_bundle(), {'If-Match': rev})
    assert_invalid(status, body, cam, BROKEN)
    assert len(backups(cam)) == 1


def test_bundle_missing_camera_is_200_default_and_not_created(base, cam):
    status, body = call(base, 'GET', '/api/project/bundle')
    assert status == 200
    assert body['camera'] == bai_camera.validate(bai_camera.DEFAULT)
    assert not cam.exists() and backups(cam) == []


def test_bundle_unreadable_gives_backup_null(base, cam, monkeypatch):
    cam.write_bytes(b'{"schema":1}')
    real = pathlib.Path.read_bytes

    def fake(self):
        if self == cam:
            raise PermissionError('denied')
        return real(self)
    monkeypatch.setattr(pathlib.Path, 'read_bytes', fake)
    status, body = call(base, 'GET', '/api/project/bundle')
    assert status == 422 and body['error_code'] == 'camera_project_invalid' and body['backup'] is None
    assert 'なし' in body['error']
    monkeypatch.undo()
    assert cam.read_bytes() == b'{"schema":1}' and backups(cam) == []


def test_camera_project_invalid_is_not_a_value_error():
    assert not issubclass(bai_camera.CameraProjectInvalid, ValueError)
    assert issubclass(bai_camera.CameraProjectInvalid, Exception)


def test_bundle_post_save_reread_stays_non_strict(base, cam, monkeypatch):
    status, current = call(base, 'GET', '/api/project/bundle')
    assert status == 200
    calls = []
    real = bai_camera.read_project
    monkeypatch.setattr(bai_camera, 'read_project', lambda p: calls.append(p) or real(p))
    status, body = call(base, 'POST', '/api/project/bundle', valid_bundle(), {'If-Match': current['revision']})
    assert status == 200, body
    assert body['revision']
    assert len(calls) == 1  # 書く前の読込だけが厳格。保存後の読み直し（373行相当）は read() のまま


# ---- カメラの経路 ----
def test_camera_routes_all_422_on_broken_file(base, cam):
    cam.write_bytes(BROKEN)
    cases = [
        ('GET', '/api/camera/project', None, {}),
        ('GET', '/api/camera/project?envelope=1', None, {}),
        ('POST', '/api/camera/project', bai_camera.DEFAULT, {}),
        ('POST', '/api/camera/project', bai_camera.DEFAULT, {'If-Match': 'x'}),
        ('POST', '/api/camera/sequence/edit', {'action': 'noop'}, {}),
    ]
    names = set()
    for method, path, payload, headers in cases:
        status, body = call(base, method, path, payload, headers)
        assert_invalid(status, body, cam, BROKEN)
        names.add(body['backup'])
    assert len(names) == 1 and len(backups(cam)) == 1


def test_camera_post_works_when_file_missing(base, cam):
    status, body = call(base, 'POST', '/api/camera/project', bai_camera.DEFAULT)
    assert status == 200 and body['_revision']
    assert cam.exists() and backups(cam) == []


def test_legacy_read_still_returns_default(cam):
    cam.write_bytes(BROKEN)
    assert bai_camera.read(cam) == bai_camera.validate(bai_camera.DEFAULT)
    assert cam.read_bytes() == BROKEN and backups(cam) == []


# ---- read_project の細部 ----
@pytest.mark.parametrize('raw', [
    b'\xff\xfe',
    b'[]',
    b'{"schema":1,"fps":"x","duration":10,"keys":[]}',
    b'{"schema":2,"fps":30,"duration":10,"keys":[]}',
])
def test_read_project_invalid_variants(base, cam, raw):
    cam.write_bytes(raw)
    status, body = call(base, 'GET', '/api/camera/project')
    assert_invalid(status, body, cam, raw)
    assert len(backups(cam)) == 1
    assert backups(cam)[0].read_bytes() == raw


def test_read_project_missing_returns_independent_copy(cam):
    first, dropped = bai_camera.read_project(cam)
    assert dropped == [] and not cam.exists()
    first['keys'].clear()
    first['fps'] = 99
    second, _ = bai_camera.read_project(cam)
    assert second == bai_camera.validate(bai_camera.DEFAULT) and second['keys']


def test_different_broken_content_makes_second_backup(base, cam):
    cam.write_bytes(BROKEN)
    call(base, 'GET', '/api/camera/project')
    cam.write_bytes(b'{"broken2":')
    call(base, 'GET', '/api/camera/project')
    assert len(backups(cam)) == 2


def fail_backup(monkeypatch, stage):
    """退避の書き込みを stage（open／fsync／replace）で OSError にする。元のファイルの書き込み（save）は通す。"""
    import builtins
    real_open, real_fsync, real_replace = builtins.open, bai_camera.os.fsync, bai_camera.os.replace

    def is_backup(p):
        return pathlib.Path(p).name.startswith(bai_camera.BACKUP_PREFIX)
    if stage == 'open':
        monkeypatch.setattr(bai_camera, 'open', lambda p, *a, **k: (_ for _ in ()).throw(OSError('disk full')) if is_backup(p) else real_open(p, *a, **k), raising=False)
    elif stage == 'fsync':
        monkeypatch.setattr(bai_camera.os, 'fsync', lambda fd: (_ for _ in ()).throw(OSError('io error')))
    else:
        monkeypatch.setattr(bai_camera.os, 'replace', lambda a, b: (_ for _ in ()).throw(PermissionError('locked')) if is_backup(b) else real_replace(a, b))


FAIL_STAGES = ['open', 'fsync', 'replace']


@pytest.mark.parametrize('stage', FAIL_STAGES)
def test_backup_write_failure_gives_backup_null(base, cam, monkeypatch, stage):
    cam.write_bytes(BROKEN)
    fail_backup(monkeypatch, stage)
    status, body = call(base, 'GET', '/api/camera/project')
    monkeypatch.undo()
    assert status == 422 and body['backup'] is None
    assert cam.read_bytes() == BROKEN and backups(cam) == [] and not list(cam.parent.glob('camera_project*.tmp'))


def test_existing_backup_with_other_content_is_not_trusted_or_overwritten(base, cam):
    # 同じ sha8 の名前でも中身が違う退避（途中で切れた・手で直された）は使わず、上書きもしない
    import hashlib
    sha8 = hashlib.sha256(BROKEN).hexdigest()[:8]
    stale = cam.parent / f'camera_project.invalid-{sha8}-20000101T000000Z.json'
    stale.write_bytes(b'')
    cam.write_bytes(BROKEN)
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    assert status == 200 and res['backup'] != stale.name
    assert (cam.parent / res['backup']).read_bytes() == BROKEN and stale.read_bytes() == b''


def test_deeply_nested_json_is_invalid_not_a_crash(base, cam):
    raw = b'[' * 200000
    cam.write_bytes(raw)
    status, body = call(base, 'GET', '/api/camera/project')
    assert_invalid(status, body, cam, raw)


# ---- POST /api/camera/project/reset ----
def test_reset_requires_confirmation(base, cam):
    cam.write_bytes(BROKEN)
    for body in (None, b'not json', {}, {'confirm': 'yes'}, {'confirm': 'reset-camera-project '}, [1]):
        status, res = call(base, 'POST', '/api/camera/project/reset', body)
        assert status == 400 and res['error_code'] == 'confirmation_required', body
    assert cam.read_bytes() == BROKEN and backups(cam) == []


def test_reset_broken_file_backs_up_then_writes_default(base, cam):
    cam.write_bytes(BROKEN)
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    assert status == 200 and BACKUP_RE.match(res['backup'])
    assert (cam.parent / res['backup']).read_bytes() == BROKEN
    assert json.loads(cam.read_bytes()) == bai_camera.validate(bai_camera.DEFAULT)
    # 同じ壊れたファイルでもう一度 reset しても退避は増えない
    cam.write_bytes(BROKEN)
    status, res2 = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    assert status == 200 and res2['backup'] == res['backup'] and len(backups(cam)) == 1
    assert json.loads(cam.read_bytes()) == bai_camera.validate(bai_camera.DEFAULT)
    # reset の後は正常に読める
    assert call(base, 'GET', '/api/camera/project')[0] == 200


def test_reset_missing_file_writes_default_without_backup(base, cam):
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    assert status == 200 and res == {'backup': None}
    assert json.loads(cam.read_bytes()) == bai_camera.validate(bai_camera.DEFAULT) and backups(cam) == []


def test_reset_valid_file_is_backed_up_too(base, cam):
    custom = copy.deepcopy(bai_camera.DEFAULT)
    custom['keys'][0]['fov'] = 55
    bai_camera.save(cam, custom)
    original = cam.read_bytes()
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    assert status == 200 and len(backups(cam)) == 1
    assert (cam.parent / res['backup']).read_bytes() == original
    assert json.loads(cam.read_bytes()) == bai_camera.validate(bai_camera.DEFAULT)


def test_reset_unreadable_writes_nothing(base, cam, monkeypatch):
    cam.write_bytes(BROKEN)
    real = pathlib.Path.read_bytes
    monkeypatch.setattr(pathlib.Path, 'read_bytes', lambda self: (_ for _ in ()).throw(PermissionError('denied')) if self == cam else real(self))
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    monkeypatch.undo()
    assert status == 422 and res['backup'] is None
    assert cam.read_bytes() == BROKEN and backups(cam) == []


@pytest.mark.parametrize('stage', FAIL_STAGES)
def test_reset_backup_failure_writes_nothing(base, cam, monkeypatch, stage):
    cam.write_bytes(BROKEN)
    fail_backup(monkeypatch, stage)
    status, res = call(base, 'POST', '/api/camera/project/reset', {'confirm': 'reset-camera-project'})
    monkeypatch.undo()
    assert status == 422 and res['backup'] is None
    assert cam.read_bytes() == BROKEN and backups(cam) == [] and not list(cam.parent.glob('camera_project*.tmp'))
