import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class MappingUI(unittest.TestCase):
    def test_mapping_controls_are_present(self):
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        for name in ('sk-mapping-panel','sk-mapping-suggest','sk-mapping-saved','sk-mapping-save','sk-mapping-rows','sk-mapping-status'):
            self.assertIn('id="'+name+'"',html)
    def test_mapping_uses_existing_profile_api_and_duplicate_guard(self):
        js=(ROOT/'retarget_ui.js').read_text(encoding='utf-8')
        self.assertIn('/api/retarget/profiles',js)
        self.assertIn("used.has(node.value)",js)
        self.assertIn("calibrated:false",js)
