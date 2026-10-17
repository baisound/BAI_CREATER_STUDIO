import sys, unittest, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bvh_skeleton import parse_bvh_skeleton
from retarget_analysis import inspect

SAMPLE=b'''HIERARCHY
ROOT Hips
{
 OFFSET 0 1 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT Spine
 {
  OFFSET 0 2 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site
  {
   OFFSET 0 1 0
  }
 }
}
MOTION
Frames: 1
Frame Time: 0.033333
0 0 0 0 0 0 0 0 0
'''
class TestBvhSkeleton(unittest.TestCase):
 def test_hierarchy(self):
  x=parse_bvh_skeleton(SAMPLE)
  self.assertEqual(x['bones_detail'][1]['parent_index'],0)
  self.assertEqual(x['bones_detail'][1]['position'],[0.,3.,0.])
  self.assertEqual(x['end_sites'],1)
 def test_inspect(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'sample.bvh';p.write_bytes(SAMPLE)
   r=inspect(p)
   self.assertEqual(r['bone_count'],2)
   self.assertEqual(r['metadata']['bones_detail'][1]['position'],[0.,3.,0.])
 def test_missing_offset(self):
  with self.assertRaises(ValueError):parse_bvh_skeleton(SAMPLE.replace(b'OFFSET 0 2 0',b'OFFSET 0 nan 0'))
 def test_no_motion(self):
  with self.assertRaises(ValueError):parse_bvh_skeleton(SAMPLE.split(b'MOTION')[0])
if __name__=='__main__':unittest.main()
