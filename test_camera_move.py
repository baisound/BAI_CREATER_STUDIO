import unittest,math
from bai_camera import camera_move
P={'position':[0,1,5],'target':[0,1,0],'fov':40}
class CameraMoveTests(unittest.TestCase):
 def test_orbit_distance(self):
  p=camera_move(P,'orbit',90)
  self.assertAlmostEqual(math.dist(p['position'],p['target']),5)
  self.assertAlmostEqual(abs(p['position'][0]),5)
 def test_dolly(self):self.assertAlmostEqual(camera_move(P,'dolly',2)['position'][2],3)
 def test_pan(self):
  p=camera_move(P,'pan',2)
  self.assertEqual([a-b for a,b in zip(p['position'],p['target'])],[0,0,5])
 def test_tilt(self):self.assertAlmostEqual(math.dist(camera_move(P,'tilt',20)['position'],camera_move(P,'tilt',20)['target']),5)
 def test_dolly_guard(self):
  with self.assertRaises(ValueError):camera_move(P,'dolly',6)
 def test_unknown(self):
  with self.assertRaises(ValueError):camera_move(P,'unknown',1)
if __name__=='__main__':unittest.main()
