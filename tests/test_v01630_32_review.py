import unittest
from pathlib import Path
from retarget_review_bundle import build
from tests.test_v01626_28_local_transfer import paired_fixture
class ReviewTests(unittest.TestCase):
 def test_no_confirmation(self):
  b=paired_fixture()
  with self.assertRaises(ValueError):build(b,b)
 def test_review_is_not_export(self):
  b=paired_fixture(); r=build(b,b,confirmed=True)
  self.assertTrue(r['timeline']);self.assertTrue(r['samples']);self.assertTrue(r['roles'])
  self.assertFalse(r['suitable_for_vmd_export']);self.assertTrue(r['source_unchanged'])
  self.assertEqual(r['quality']['quality_gate'],'blocked_for_production')
 def test_ui_and_routes(self):
  root=Path(__file__).resolve().parents[1]
  self.assertIn('v01630_32_review.js',(root/'index.html').read_text(encoding='utf-8'))
  self.assertIn('/api/retarget/review-bundle',(root/'server.py').read_text(encoding='utf-8'))
  self.assertIn('bai_retarget_review_bundle',(root/'mcp_server.py').read_text(encoding='utf-8'))
  self.assertIn('bai_retarget_review_bundle',(root/'webmcp.js').read_text(encoding='utf-8'))
if __name__=='__main__':unittest.main()
