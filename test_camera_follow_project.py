import tempfile, pathlib, unittest
from bai_camera import DEFAULT, validate, save, read
class FollowProjectTests(unittest.TestCase):
 def test_legacy_unchanged(self):
  self.assertNotIn('bone_follow',validate(DEFAULT))
 def test_round_trip(self):
  p=dict(DEFAULT,bone_follow={'boneName':'Head','role':'head','offset':[1,2,3],'enabled':True,'smoothingSeconds':0.35})
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'camera.json';save(f,p);self.assertEqual(read(f)['bone_follow']['offset'],[1.,2.,3.]);self.assertAlmostEqual(read(f)['bone_follow']['smoothingSeconds'],.35)
 def test_invalid_config_rejected(self):
  for config in ({'offset':[float('nan'),0,0]},{'enabled':'yes'},{'role':'notreal'},{'smoothingSeconds':-1},{'smoothingSeconds':float('inf')}):
   with self.subTest(config=config),self.assertRaises(ValueError):validate(dict(DEFAULT,bone_follow=config))
if __name__=='__main__':unittest.main()
