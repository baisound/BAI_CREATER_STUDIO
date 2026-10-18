import unittest
from camera_vmd_playback import bezier_progress, sample_native_camera

class NativeCameraPlaybackTests(unittest.TestCase):
    def setUp(self):
        self.a=dict(frame=0,target=[0,1,2],rotation=[0,0,0],distance=-5,fov=45,perspective=0,interpolation=[20,20,107,107]*6)
        self.b=dict(frame=30,target=[10,3,6],rotation=[1,2,3],distance=-10,fov=60,perspective=1,interpolation=[20,20,107,107]*6)
        self.track=dict(format='mmd-vmd-camera-native-v1',keys=[self.a,self.b])
    def test_bezier_endpoints(self):
        self.assertAlmostEqual(bezier_progress(0,[20,20,107,107]),0)
        self.assertAlmostEqual(bezier_progress(1,[20,20,107,107]),1)
    def test_exact_and_clamp(self):
        self.assertEqual(sample_native_camera(self.track,0)['target'],[0,1,2])
        self.assertEqual(sample_native_camera(self.track,30)['target'],[10,3,6])
        self.assertEqual(sample_native_camera(self.track,900)['distance'],-10)
    def test_midpoint(self):
        p=sample_native_camera(self.track,15)
        self.assertAlmostEqual(p['target'][0],5,places=5)
        self.assertAlmostEqual(p['fov'],52.5,places=5)
        self.assertEqual(p['perspective'],0)
    def test_not_three_space(self):
        self.assertEqual(sample_native_camera(self.track,15)['coordinate_space'],'MMD')
    def test_bad_interpolation(self):
        self.b['interpolation']=[255,0,0,0]*6
        with self.assertRaises(ValueError):sample_native_camera(self.track,15)
    def test_invalid_frames(self):
        with self.assertRaises(ValueError):sample_native_camera(self.track,float('nan'))
        with self.assertRaises(ValueError):sample_native_camera(self.track,-1)
        self.track['keys']=[self.b,self.a]
        with self.assertRaises(ValueError):sample_native_camera(self.track,15)
if __name__=='__main__':unittest.main()
