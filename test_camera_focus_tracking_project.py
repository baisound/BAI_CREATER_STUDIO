import unittest
from bai_camera import validate,DEFAULT
class TestFocusTrackingProject(unittest.TestCase):
 def test_roundtrip(self):
  p=dict(DEFAULT,focus_tracking={'enabled':True});self.assertTrue(validate(p)['focus_tracking']['enabled'])
 def test_legacy(self):
  self.assertNotIn('focus_tracking',validate(DEFAULT))
 def test_invalid(self):
  with self.assertRaises(ValueError):validate(dict(DEFAULT,focus_tracking={'enabled':1}))
if __name__=='__main__':unittest.main()
