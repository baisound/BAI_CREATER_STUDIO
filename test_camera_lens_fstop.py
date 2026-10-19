import unittest
from bai_camera import DEFAULT,validate,sample
class LensFStopTest(unittest.TestCase):
 def test_legacy(self):
  self.assertNotIn('fStop',validate(DEFAULT)['keys'][0])
 def test_persist(self):
  p={**DEFAULT,'keys':[dict(DEFAULT['keys'][0],fStop=1.8),dict(DEFAULT['keys'][1],fStop=8)]}
  v=validate(p);self.assertEqual(v['keys'][0]['fStop'],1.8);self.assertAlmostEqual(sample(v,45)['fStop'],4.9)
 def test_invalid(self):
  p={**DEFAULT,'keys':[dict(DEFAULT['keys'][0],fStop=0)]}
  with self.assertRaises(ValueError):validate(p)
if __name__=='__main__':unittest.main()
