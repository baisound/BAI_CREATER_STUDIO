"""B-1（DATA-008）：GET /api/project?envelope=1 の実際の HTTP 応答を検査する（P2-WP-00b）。

旧 test_legacy_project_client_revision.py の「文字列が2回出る」検査の置き換え。
サーバーは同じプロセスで起動し、ルートの conftest.py の一時データ（BAI_DATA_DIR）を使う。
"""
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from camera_project_revision import revision as camera_revision


class ProjectEnvelopeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}'

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        server.PROJECT.unlink(missing_ok=True)
        self.addCleanup(lambda: server.PROJECT.unlink(missing_ok=True))

    def get(self, path):
        try:
            with urllib.request.urlopen(self.base + path, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_envelope_returns_project_and_revision(self):
        project = {'schema': 1, 'timeline': [{'name': 'a'}], 'history': [], 'cursor': -1}
        server.PROJECT.write_text(json.dumps(project), encoding='utf8')
        status, body = self.get('/api/project?envelope=1')
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(set(data), {'project', 'revision'})
        self.assertEqual(data['project'], project)
        self.assertEqual(data['revision'], camera_revision(project))

    def test_plain_get_returns_raw_project(self):
        project = {'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}
        raw = json.dumps(project).encode()
        server.PROJECT.write_bytes(raw)
        status, body = self.get('/api/project')
        self.assertEqual(status, 200)
        self.assertEqual(body, raw)

    def test_missing_file(self):
        status, body = self.get('/api/project?envelope=1')
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data['project'], {})
        self.assertEqual(data['revision'], camera_revision({}))
        status, body = self.get('/api/project')
        self.assertEqual((status, body), (200, b'{}'))

    def test_broken_json_envelope_is_500_not_an_unhandled_exception(self):
        server.PROJECT.write_bytes(b'{"broken":')
        status, body = self.get('/api/project?envelope=1')
        self.assertEqual(status, 500)
        self.assertIn('project_state.json', json.loads(body)['error'])

    def test_post_revision_matches_envelope(self):
        project = {'schema': 1, 'timeline': [], 'history': [{'timeline': []}], 'cursor': 0}
        req = urllib.request.Request(self.base + '/api/project', data=json.dumps(project).encode(), method='POST')
        with urllib.request.urlopen(req, timeout=5) as r:
            saved = json.loads(r.read())
        _, body = self.get('/api/project?envelope=1')
        self.assertEqual(json.loads(body)['revision'], saved['revision'])

    def post(self, project, if_match=None):
        headers = {'Content-Type': 'application/json'}
        if if_match:
            headers['If-Match'] = if_match
        req = urllib.request.Request(self.base + '/api/project', data=json.dumps(project).encode(), method='POST', headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_post_with_if_match_on_broken_file_is_500_and_keeps_the_file(self):
        # P2-WP-01 / DATA-008：壊れた project_state.json に If-Match 付きで保存すると、500 を返さずに接続が切れていた。
        raw = b'{"broken":'
        server.PROJECT.write_bytes(raw)
        project = {'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}
        status, body = self.post(project, if_match='x')
        self.assertEqual(status, 500)
        self.assertIn('project_state.json', json.loads(body)['error'])
        self.assertEqual(server.PROJECT.read_bytes(), raw, 'ファイルは上書きしない')

    def test_post_with_if_match_on_undecodable_file_is_500(self):
        raw = b'\xff\xfe'
        server.PROJECT.write_bytes(raw)
        status, _ = self.post({'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}, if_match='x')
        self.assertEqual(status, 500)
        self.assertEqual(server.PROJECT.read_bytes(), raw)

    def test_post_with_stale_if_match_is_still_409(self):
        server.PROJECT.write_text(json.dumps({'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}), encoding='utf8')
        status, _ = self.post({'schema': 1, 'timeline': [], 'history': [], 'cursor': -1}, if_match='stale')
        self.assertEqual(status, 409)


if __name__ == '__main__':
    unittest.main()
