import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retarget_root import convert_root_samples
class TestRoot(unittest.TestCase):
 def test_scale(self):self.assertEqual(convert_root_samples([{'frame':1,'position':[1,2,3]}],2)[0]['position'],[2.0,4.0,6.0])
 def test_yaw(self):
  r=convert_root_samples([{'frame':1,'position':[1,0,0]}],1,90)[0]['position'];self.assertAlmostEqual(r[0],0,places=6);self.assertAlmostEqual(r[2],1)
 def test_origin(self):self.assertEqual(convert_root_samples([{'frame':0,'position':[2,0,0]}],2,origin=[1,0,0],target_origin=[10,0,0])[0]['position'],[12.0,0.0,0.0])
 def test_invalid(self):
  with self.assertRaises(ValueError):convert_root_samples([],0)
if __name__=='__main__':unittest.main()
