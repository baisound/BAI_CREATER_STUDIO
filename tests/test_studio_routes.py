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
        self.assertEqual(resolve('/studio/assets/samples/hero.webp')[1], 'image/webp')

    def test_camera_bundle_core_has_an_explicit_static_route(self):
        source = (STUDIO_DIR.parent / 'server.py').read_text(encoding='utf8')
        self.assertIn('"/camera_bundle_core.js"', source)
        self.assertTrue((STUDIO_DIR.parent / 'camera_bundle_core.js').is_file())

    def test_sample_images_referenced_exist(self):
        import re
        samples = STUDIO_DIR / 'assets' / 'samples'
        src = ''.join((STUDIO_DIR / 'js' / f).read_text(encoding='utf8') for f in ('screens.js', 'samples.js', 'app.js'))
        names = set(re.findall(r"'((?:char|stage|prop|tex|mat|fx|audio|motion|video|img|hdr|preview|hero|proj|render|asset|viewport|shot|preset|lens|tpl|camshot)(?:-[a-z0-9]+)+)'", src))
        css = (STUDIO_DIR / 'styles' / 'app.css').read_text(encoding='utf8')
        names = {n for n in names if f'.{n}' not in css and f"class: '{n}" not in src}  # skip CSS class names
        self.assertGreater(len(names), 40)
        for n in names:
            self.assertTrue((samples / f'{n}.webp').is_file(), n)
        total = sum(f.stat().st_size for f in samples.glob('*.webp'))
        self.assertLess(total, 1_500_000, 'sample images must stay small')

    def test_all_25_screens_defined(self):
        src = (STUDIO_DIR / 'js' / 'screens.js').read_text(encoding='utf8')
        for n in range(1, 26):
            self.assertIn(f"id: '{n:02d}'", src)


if __name__ == '__main__':
    unittest.main()
