import unittest
from copy import deepcopy
from bai_camera import DEFAULT,validate,sample
from camera_easing import MODES,ease
class EasingTests(unittest.TestCase):
 def test_all_modes(self):
  for mode in MODES:
   for t in [0,.15,.5,.85,1]:self.assertTrue(abs(ease(mode,t,[.2,.1,.8,.9]))<10)
 def test_linear_default(self):
  self.assertEqual(sample(DEFAULT,45)['position'][0],2.)
 def test_custom_round_trip(self):
  p=deepcopy(DEFAULT);p['keys'][0].update(interpolation='custom',customCurve=[.1,.2,.8,.9]);p['easingPresets']={'slow':[.1,.2,.8,.9]};self.assertEqual(validate(p)['easingPresets']['slow'],[.1,.2,.8,.9])
 def test_bad_curve_rejected(self):
  p=deepcopy(DEFAULT);p['keys'][0].update(interpolation='custom',customCurve=[.8,0,.2,1]);
  with self.assertRaises(ValueError):validate(p)
if __name__=='__main__':unittest.main()
