"""Guards for optimistic concurrency in the legacy editing UI."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parent

class LegacyProjectClientRevisionTests(unittest.TestCase):
    # サーバー側の封筒（GET /api/project?envelope=1）は実際の HTTP 応答を検査する tests/test_project_envelope.py に移した（B-1）。

    def test_ui_sends_revision_and_rejects_conflicts(self):
        source = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn("fetch('/api/project?envelope=1'", source)
        self.assertIn("'If-Match':projectRevision", source)
        self.assertIn('if(r.status===409)', source)
        self.assertIn('projectRevision=saved.revision', source)
        self.assertIn('projectRevision=version.revision', source)
        self.assertIn('if(JSON.stringify(v.project)===JSON.stringify(obj))projectRevision=v.revision', source)  # B-2

if __name__ == '__main__': unittest.main()
