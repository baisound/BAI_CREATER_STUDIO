import struct
import unittest
from camera_vmd import parse_camera_vmd

def build(frames=(0, 30)):
    b = bytearray(b'Vocaloid Motion Data 0002'.ljust(30,b'\0'))
    b.extend(b'camera'.ljust(20,b'\0'))
    b.extend(struct.pack('<II',0,0))
    b.extend(struct.pack('<I',len(frames)))
    for frame in frames:
        b.extend(struct.pack('<I7f',frame,-8,0,1,0,0,0,0))
        b.extend(bytes(range(24)))
        b.extend(struct.pack('<IB',45,0))
    return bytes(b)

class CameraVmdTests(unittest.TestCase):
    def test_parse(self):
        r=parse_camera_vmd(build())
        self.assertEqual(r['cameraFrames'],2)
        self.assertEqual(r['keys'][1]['frame'],30)
        self.assertEqual(len(r['keys'][0]['interpolation']),24)
    def test_truncated(self):
        with self.assertRaises(ValueError):parse_camera_vmd(build()[:-2])
    def test_bad_header(self):
        with self.assertRaises(ValueError):parse_camera_vmd(b'X'*100)
    def test_duplicate_frame(self):
        with self.assertRaises(ValueError):parse_camera_vmd(build((1,1)))
    def test_empty_camera_section(self):
        self.assertEqual(parse_camera_vmd(build(()))['cameraFrames'],0)
    def test_invalid_nan(self):
        b=bytearray(build((0,)))
        struct.pack_into('<f',b,66,float('nan'))
        with self.assertRaises(ValueError):parse_camera_vmd(bytes(b))
if __name__=='__main__':unittest.main()

class VmdSamplingTests(unittest.TestCase):
    def test_bezier_linear(self):
        from camera_vmd import _vmd_bezier
        for p in (.1,.25,.5,.75,.9):
            self.assertAlmostEqual(_vmd_bezier(p,[0,0,127,127]),p,places=7)
    def test_sample_keys_and_midpoint(self):
        from camera_vmd import sample_camera_vmd
        parsed=parse_camera_vmd(build((0,30)))
        for key in parsed['keys']:
            key['interpolation']=[0,0,127,127]*6
        parsed['keys'][1]['center']=[10,20,30]
        self.assertEqual(sample_camera_vmd(parsed,0)['center'],[0,1,0])
        for got,expected in zip(sample_camera_vmd(parsed,15)['center'],[5,10.5,15]):
            self.assertAlmostEqual(got,expected,places=8)
        self.assertEqual(sample_camera_vmd(parsed,30)['center'],[10,20,30])
    def test_destination_bezier(self):
        from camera_vmd import sample_camera_vmd
        parsed=parse_camera_vmd(build((0,20)))
        parsed['keys'][1]['center']=[10,0,0]
        parsed['keys'][1]['interpolation']=[20,0,110,20]+[0,0,127,127]*5
        self.assertLess(sample_camera_vmd(parsed,10)['center'][0],5)
    def test_bad_frame(self):
        from camera_vmd import sample_camera_vmd
        with self.assertRaises(ValueError):sample_camera_vmd(parse_camera_vmd(build()),float('nan'))
    def test_no_camera(self):
        from camera_vmd import sample_camera_vmd
        with self.assertRaises(ValueError):sample_camera_vmd(parse_camera_vmd(build(())),1)
