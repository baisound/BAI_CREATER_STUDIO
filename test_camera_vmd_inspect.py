import struct, unittest
from camera_vmd_inspect import inspect_camera_vmd

class VMDInspectionTests(unittest.TestCase):
    def make(self, frame=24, fov=45):
        header=b'Vocaloid Motion Data 0002'.ljust(30,b'\0')+b'Camera'.ljust(20,b'\0')
        return header+struct.pack('<III',0,0,1)+struct.pack('<I7f',frame,-4,0,1,0,0,0,0)+bytes(24)+struct.pack('<IB',fov,0)
    def test_camera(self):
        out=inspect_camera_vmd(self.make())
        self.assertEqual(out['camera_count'],1)
        self.assertEqual(out['first_camera_frame'],24)
        self.assertEqual(out['fov_range'],[45,45])
    def test_truncated(self):
        with self.assertRaises(ValueError):inspect_camera_vmd(self.make()[:-2])
    def test_invalid_fov(self):
        with self.assertRaises(ValueError):inspect_camera_vmd(self.make(fov=400))
    def test_invalid_header(self):
        with self.assertRaises(ValueError):inspect_camera_vmd(b'not a VMD')
if __name__=='__main__':unittest.main()
