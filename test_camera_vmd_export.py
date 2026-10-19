import unittest
from camera_vmd import parse_camera_vmd, export_camera_only_vmd
from test_camera_vmd import build

class ExportTests(unittest.TestCase):
    def test_camera_only_roundtrip(self):
        original = parse_camera_vmd(build((0, 12, 30)))
        output = export_camera_only_vmd(original)
        reread = parse_camera_vmd(output)
        self.assertEqual(reread['keys'], original['keys'])
        self.assertEqual(reread['cameraFrames'], 3)
        self.assertEqual(reread['boneFrames'], 0)
    def test_reject_duplicate(self):
        doc = parse_camera_vmd(build((0,30)))
        doc['keys'][1]['frame']=0
        with self.assertRaises(ValueError):export_camera_only_vmd(doc)
    def test_reject_out_of_range(self):
        doc=parse_camera_vmd(build((0,)))
        doc['keys'][0]['interpolation'][0]=255
        with self.assertRaises(ValueError):export_camera_only_vmd(doc)
    def test_reject_nonfinite(self):
        doc=parse_camera_vmd(build((0,)))
        doc['keys'][0]['distance']=float('nan')
        with self.assertRaises(ValueError):export_camera_only_vmd(doc)
    def test_reject_non_float32(self):
        doc=parse_camera_vmd(build((0,)))
        doc['keys'][0]['distance']=1e100
        with self.assertRaises(ValueError):export_camera_only_vmd(doc)

if __name__ == '__main__':unittest.main()
