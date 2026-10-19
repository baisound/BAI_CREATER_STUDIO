import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_routes import resolve, STUDIO_DIR


class StudioRoutesTest(unittest.TestCase):
    def test_workspace_routes_serve_shell(self):
        for n in range(1, 26):
            found = resolve(f'/workspace/{n:02d}')
            self.assertIsNotNone(found, n)
            self.assertEqual(found[0].name, 'index.html')
        for p in ('/workspace', '/workspace/', '/workspace/99'):
            self.assertIsNotNone(resolve(p), p)

    def test_non_routes_and_traversal_rejected(self):
        for p in ('/workspace/01/x', '/workspace/abc', '/studio/../server.py', '/studio/js/../../server.py',
                  '/studio/.git/config', '/studio/js\\app.js', '/studio/missing.js', '/studio/js/', '/camera.html'):
            self.assertIsNone(resolve(p), p)

    def test_assets_have_types(self):
        self.assertEqual(resolve('/studio/js/app.js')[1], 'text/javascript; charset=utf-8')
        self.assertEqual(resolve('/studio/styles/app.css')[1], 'text/css; charset=utf-8')

    def test_all_25_screens_defined(self):
        src = (STUDIO_DIR / 'js' / 'screens.js').read_text(encoding='utf8')
        for n in range(1, 26):
            self.assertIn(f"id: '{n:02d}'", src)


if __name__ == '__main__':
    unittest.main()
