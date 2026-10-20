# Regression: legacy UI minimal fix (2026-10-20): preview guard module must be served as JS.
import sys, threading, unittest, urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class LegacyUiMinimalFixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}'

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_preview_guard_served_as_javascript(self):
        with urllib.request.urlopen(self.base + '/v01641_preview_guard.js', timeout=5) as r:
            self.assertEqual(r.status, 200)
            self.assertTrue(r.headers['Content-Type'].startswith('text/javascript'))
            self.assertGreater(len(r.read()), 0)

    def test_body_level_sections_no_longer_squash_main(self):
        html = (Path(server.BASE) / 'index.html').read_text(encoding='utf8')
        self.assertNotIn('html,body{height:100%;margin:0;overflow:hidden}', html)
        self.assertNotIn('flex:1 1 0;min-height:0;height:auto!important', html)
