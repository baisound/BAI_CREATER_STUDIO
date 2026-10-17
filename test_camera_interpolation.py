import unittest
from copy import deepcopy
from bai_camera import DEFAULT,validate,sample
class CameraInterpolationTests(unittest.TestCase):
 def test_smooth_non_midpoint(self):
  p=deepcopy(DEFAULT);p['keys'][0]['interpolation']='smooth'
  self.assertAlmostEqual(sample(p,22.5)['position'][0],.625)
 def test_hold(self):
  p=deepcopy(DEFAULT);p['keys'][0]['interpolation']='hold'
  self.assertEqual(sample(p,45)['position'],[0.,1.6,5.])
 def test_invalid_rejected(self):
  p=deepcopy(DEFAULT);p['keys'][0]['interpolation']='banana'
  with self.assertRaises(ValueError):validate(p)
 def test_old_projects_backward_compatible(self):
  self.assertAlmostEqual(sample(DEFAULT,45)['position'][0],2.)
 def test_mixed_mode(self):
  p=deepcopy(DEFAULT);p['keys'][0]['interpolation']='hold';p['keys'][1]['interpolation']='smooth'
  self.assertEqual(sample(p,45)['position'][0],0.)
if __name__=='__main__':unittest.main()
