import unittest
from bai_camera import validate,DEFAULT
class CustomPresetTests(unittest.TestCase):
 def test_round_trip(self):
  p=dict(DEFAULT,custom_presets=[{'name':'顔アップ','pose':{'position':[0,2,3],'target':[0,2,0],'fov':35}}]);self.assertEqual(validate(p)['custom_presets'][0]['name'],'顔アップ')
 def test_duplicate_rejected(self):
  p=dict(DEFAULT,custom_presets=[{'name':'a','pose':{'position':[0,2,3],'target':[0,2,0],'fov':35}}]*2)
  with self.assertRaises(ValueError):validate(p)
 def test_invalid_pose_rejected(self):
  p=dict(DEFAULT,custom_presets=[{'name':'a','pose':{'position':[0,0,0],'target':[0,0,0],'fov':35}}])
  with self.assertRaises(ValueError):validate(p)
if __name__=='__main__':unittest.main()
