import unittest
from pathlib import Path
from project_state_bundle import bundle_revision

class BundleRevisionTest(unittest.TestCase):
    def test_revision_changes_if_any_component_changes(self):
        base={'combination': {'timeline': []}, 'camera': {'keys': []}, 'workspace': {'frame': 4}}
        first=bundle_revision(base)
        for field, content in [('combination', {'timeline': [1]}), ('camera', {'keys': [1]}), ('workspace', {'frame': 5})]:
            changed={**base, field: content}
            self.assertNotEqual(first, bundle_revision(changed))
    def test_non_persistent_fields_do_not_change_revision(self):
        base={'combination': None,'camera': {},'workspace': None}
        self.assertEqual(bundle_revision(base),bundle_revision({**base,'complete': True,'revision':'old'}))
    def test_api_requires_revision_and_detects_stale_save(self):
        text=Path('server.py').read_text()
        self.assertIn("return self.bad(428,'bundle revision required",text)
        self.assertIn("expected!=bundle_revision(current)",text)
        self.assertIn("return self.bad(409,'bundle changed",text)
    def test_ui_sends_revision(self):
        text=Path('camera_project_bundle_ui.js').read_text()
        self.assertIn("'If-Match':revision||''",text)
        self.assertIn('existing.revision)',text)
