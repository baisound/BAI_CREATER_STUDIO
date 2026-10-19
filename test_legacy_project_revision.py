"""Regression guard for legacy project optimistic concurrency support."""
import unittest
from pathlib import Path
from camera_project_revision import revision


class LegacyProjectRevisionTest(unittest.TestCase):
    def test_revision_canonical_and_changes(self):
        value={'schema': 1, 'timeline': [], 'cursor': -1, 'history': []}
        self.assertEqual(revision(value), revision(dict(reversed(list(value.items())))))
        self.assertNotEqual(revision(value), revision({**value, 'timeline': [{'name': 'shot'}]}))

    def test_legacy_write_paths_guard_if_match(self):
        source=Path(__file__).with_name('server.py').read_text(encoding='utf-8')
        self.assertEqual(source.count("if expected!=camera_revision(current):"), 2)
        self.assertEqual(source.count("'project changed on server: refresh before saving'"), 2)


if __name__=='__main__':
    unittest.main()
