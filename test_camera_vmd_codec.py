import unittest,struct
from camera_vmd_codec import decode_camera_track,encode_camera_track

class NativeVMDCodecTest(unittest.TestCase):
    def setUp(self):
        self.track={'format':'mmd-vmd-camera-native-v1','keys':[{'frame':15,'distance':-4.5,'target':[0.2,1.1,3.0],'rotation':[0.1,-0.2,0.3],'interpolation':[20]*24,'fov':35,'perspective':0},{'frame':0,'distance':-8.,'target':[0.,0.,0.],'rotation':[0.,0.,0.],'interpolation':[0]*24,'fov':80,'perspective':1}]}
    def test_roundtrip(self):
        raw=encode_camera_track(self.track);out=decode_camera_track(raw)
        self.assertEqual([k['frame'] for k in out['keys']],[0,15]);self.assertEqual(out['keys'][0]['perspective'],1)
        self.assertEqual(encode_camera_track(out),encode_camera_track(decode_camera_track(raw)))
        self.assertAlmostEqual(out['keys'][1]['rotation'][0],.1,places=6)
    def test_short(self):
        with self.assertRaises(ValueError):decode_camera_track(b'abcd')
    def test_truncated(self):
        with self.assertRaises(ValueError):decode_camera_track(encode_camera_track(self.track)[:-3])
    def test_duplicate(self):
        t=dict(self.track,keys=[self.track['keys'][0]]*2)
        with self.assertRaises(ValueError):encode_camera_track(t)
    def test_bad_nan(self):
        t=dict(self.track,keys=[dict(self.track['keys'][0],distance=float('nan'))])
        with self.assertRaises(ValueError):encode_camera_track(t)
    def test_extra_sections_rejected(self):
        with self.assertRaises(ValueError):decode_camera_track(encode_camera_track(self.track)+b'\0\0\0\0')
if __name__=='__main__':unittest.main()
