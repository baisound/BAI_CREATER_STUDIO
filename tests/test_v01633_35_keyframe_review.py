import unittest
from pathlib import Path
from retarget_keyframe_review import build_keyframe_review
ROOT=Path(__file__).resolve().parents[1]
def fixture():
 return {'kind':'unverified_rotation_review_bundle','suitable_for_vmd_export':False,'animation_applied':False,'fps':30,'warnings':[{'issue':'unverified'}], 'samples':[{'frame':0,'role':'leftUpperArm','target_node':3,'local_rotation_xyzw':[0,0,0,2]},{'frame':2,'role':'leftUpperArm','target_node':3,'local_rotation_xyzw':[0,0,0,1]}]}
class KeyframeReviewTests(unittest.TestCase):
 def test_sort_and_normalize(self):
  r=build_keyframe_review(fixture());self.assertEqual(r['keys'][0]['rotation_xyzw'],[0,0,0,1]);self.assertEqual(r['frame_count'],2)
 def test_gate_always_blocks(self):
  r=build_keyframe_review(fixture());self.assertFalse(r['vmd_export_allowed']);self.assertEqual(r['quality_gate'],'blocked_for_production')
 def test_duplicate_rejected(self):
  f=fixture();f['samples'].append(f['samples'][0]);self.assertRaises(ValueError,build_keyframe_review,f)
 def test_nan_rejected(self):
  f=fixture();f['samples'][0]['local_rotation_xyzw']=[float('nan'),0,0,1];self.assertRaises(ValueError,build_keyframe_review,f)
 def test_source_must_be_review(self):
  f=fixture();f['kind']='vmd';self.assertRaises(ValueError,build_keyframe_review,f)
 def test_integration(self):
  self.assertIn('/api/retarget/keyframe-review',(ROOT/'server.py').read_text())
  self.assertIn('bai_retarget_keyframe_review',(ROOT/'mcp_server.py').read_text())
  self.assertIn('bai_retarget_keyframe_review',(ROOT/'webmcp.js').read_text())
  self.assertIn('v01633_35_scrub.js',(ROOT/'index.html').read_text())
