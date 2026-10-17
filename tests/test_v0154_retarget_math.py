import sys,unittest,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retarget_pose import qnorm,mul,conj,shortest_arc,transform_samples
class TestPose(unittest.TestCase):
 def test_identity(self):
  self.assertEqual(shortest_arc([1,0,0],[1,0,0]),[0,0,0,1])
 def test_axis_rotation(self):
  q=shortest_arc([1,0,0],[0,1,0]);self.assertAlmostEqual(sum(a*a for a in q),1,places=6)
 def test_conjugation(self):
  q=shortest_arc([1,0,0],[0,1,0]);v=[0,0,math.sin(.2),math.cos(.2)];r=mul(mul(q,v),conj(q));self.assertAlmostEqual(sum(a*a for a in r),1,places=6)
 def test_missing(self):
  r=transform_samples({'pose_correction':{'direction_offsets':{}}},[{'role':'head','rotation_xyzw':[0,0,0,1]}]);self.assertEqual(r['samples'][0]['status'],'unmapped')
if __name__=='__main__': unittest.main()
