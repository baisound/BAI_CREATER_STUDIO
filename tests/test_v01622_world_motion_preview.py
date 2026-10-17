import unittest, math
from world_rest_motion_preview import preview
from tests.test_v01620_rest_inspection import pack

class WorldMotionPreview(unittest.TestCase):
    def setUp(self):
        self.a=pack([{'name':'arm','rotation':[0,0,0,1]}],{'leftUpperArm':0})
        self.b=pack([{'name':'target_arm','rotation':[0,0,0,1]}],{'leftUpperArm':0})
        self.samples=[{'role':'leftUpperArm','frame':0,'rotation_xyzw':[0,0,0,1]}]
    def test_identity(self):
        r=preview(self.a,self.b,self.samples,True)
        self.assertEqual(r['samples'][0]['target_bone'],'target_arm')
        self.assertEqual(r['samples'][0]['target_rotation_xyzw'],[0,0,0,1])
        self.assertFalse(r['target_animation_applied'])
    def test_requires_confirmation(self):
        with self.assertRaises(ValueError):preview(self.a,self.b,self.samples)
    def test_unmapped(self):
        r=preview(self.a,self.b,[{'role':'hips','frame':1,'rotation_xyzw':[0,0,0,1]}],True)
        self.assertEqual(r['samples'][0]['status'],'unmapped')
    def test_reflection_rejected(self):
        reflected=pack([{'name':'arm','scale':[-1,1,1]}],{'leftUpperArm':0})
        r=preview(reflected,self.b,self.samples,True)
        self.assertEqual(r['samples'][0]['status'],'unmapped')
        self.assertEqual(r['skipped_roles'][0]['reason'],'manual_calibration_required')
    def test_invalid_sample(self):
        with self.assertRaises(ValueError):preview(self.a,self.b,[{'role':'leftUpperArm','frame':-1,'rotation_xyzw':[0,0,0,1]}],True)
if __name__=='__main__':unittest.main()
