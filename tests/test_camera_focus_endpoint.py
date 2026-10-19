# Regression: GET /api/camera/focus raised UnboundLocalError (local parse_qs import shadowed the module import).
import json, sys, threading, unittest, urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class CameraFocusEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}'

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as r:
            return r.status, json.loads(r.read())

    def test_focus_single_frame_and_range_respond(self):
        status, body = self.get('/api/camera/focus?frame=0')
        self.assertEqual(status, 200)
        self.assertIsInstance(body, dict)
        status, body = self.get('/api/camera/focus?start=0&end=4&step=2')
        self.assertEqual(status, 200)

    def test_other_query_endpoints_still_respond(self):
        self.assertEqual(self.get('/api/camera/sequence/evaluate?frame=0')[0], 200)
        self.assertEqual(self.get('/api/diagnostics/recent?limit=3')[0], 200)


if __name__ == '__main__':
    unittest.main()
