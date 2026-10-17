import unittest, tempfile, pathlib
from bai_camera import DEFAULT,validate,sample,save,read
class CameraTests(unittest.TestCase):
 def test_default(self):self.assertEqual(validate(DEFAULT)['fps'],30)
 def test_interpolation(self):
  p=sample(DEFAULT,45);self.assertAlmostEqual(p['position'][0],2);self.assertAlmostEqual(p['fov'],37.5)
 def test_end_clamp(self):self.assertEqual(sample(DEFAULT,300)['position'],[4.,2.,3.])
 def test_duplicate_rejected(self):
  p=dict(DEFAULT,keys=DEFAULT['keys']*2)
  with self.assertRaises(ValueError):validate(p)
 def test_bad_vector(self):
  p=dict(DEFAULT,keys=[dict(DEFAULT['keys'][0],target=[0,0])])
  with self.assertRaises(ValueError):validate(p)
 def test_same_eye_target(self):
  p=dict(DEFAULT,keys=[dict(DEFAULT['keys'][0],target=[0,1.6,5])])
  with self.assertRaises(ValueError):validate(p)
 def test_atomic_roundtrip(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'camera.json';save(path,DEFAULT);self.assertEqual(read(path),validate(DEFAULT))
if __name__=='__main__':unittest.main()
