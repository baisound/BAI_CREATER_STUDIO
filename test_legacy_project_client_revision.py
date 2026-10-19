"""Guards for optimistic concurrency in the legacy editing UI."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parent

class LegacyProjectClientRevisionTests(unittest.TestCase):
    def test_both_server_get_routes_offer_backward_compatible_envelope(self):
        source = (ROOT / 'server.py').read_text(encoding='utf-8')
        self.assertEqual(source.count("'envelope=1' in urlsplit(self.path).query else payload"), 2)
        self.assertEqual(source.count('"revision":camera_revision(obj)'), 2)

    def test_ui_sends_revision_and_rejects_conflicts(self):
        source = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn("fetch('/api/project?envelope=1'", source)
        self.assertIn("'If-Match':projectRevision", source)
        self.assertIn('if(r.status===409)', source)
        self.assertIn('projectRevision=saved.revision', source)
        self.assertIn('projectRevision=version.revision', source)

if __name__ == '__main__': unittest.main()
