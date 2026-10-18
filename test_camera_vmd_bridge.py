import unittest
from camera_vmd_bridge import preview_pose

class PreviewBridgeTest(unittest.TestCase):
    def setUp(self):
        k=dict(frame=0,target=[2,1,3],rotation=[0,0,0],distance=-5,fov=45,perspective=0,interpolation=[20,20,107,107]*6)
        self.track={'format':'mmd-vmd-camera-native-v1','keys':[k]}
    def test_no_rotation_reflect_z(self):
        p=preview_pose(self.track,0)
        self.assertEqual(p['target'],[2,1,-3])
        self.assertEqual(p['position'],[2,1,2])
        self.assertTrue(p['preview_only'])
    def test_roll_changes_up_not_position(self):
        self.track['keys'][0]['rotation']=[0,0,1.5707963267948966]
        p=preview_pose(self.track,0)
        self.assertAlmostEqual(p['up'][0],-1,places=6)
        self.assertAlmostEqual(p['up'][1],0,places=6)
        self.assertAlmostEqual(p['position'][2],2,places=6)
    def test_default_up(self):
        self.assertEqual(preview_pose(self.track,0)['up'],[0,1,0])
    def test_non_destructive(self):
        before=repr(self.track)
        preview_pose(self.track,0)
        self.assertEqual(repr(self.track),before)
    def test_zero_distance_fails(self):
        self.track['keys'][0]['distance']=0
        with self.assertRaises(ValueError):preview_pose(self.track,0)
    def test_invalid_fov_fails(self):
        self.track['keys'][0]['fov']=170
        with self.assertRaises(ValueError):preview_pose(self.track,0)

if __name__=='__main__':unittest.main()
