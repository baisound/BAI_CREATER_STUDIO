import sys, tempfile, unittest, struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from motion_vmd_bridge import convert
from vmd_readback import read_vmd_bones, compare_vmd_bones

BVH = '''HIERARCHY
ROOT Hips
{
 OFFSET 0 0 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT Arm
 {
 OFFSET 0 1 0
 CHANNELS 3 Zrotation Xrotation Yrotation
 End Site
 {
 OFFSET 0 1 0
 }
 }
}
MOTION
Frames: 2
Frame Time: 0.033333333
0 0 0 0 0 0 0 0 0
1 2 3 90 0 0 10 20 30
'''

class ReadbackTest(unittest.TestCase):
    def test_convert_reimport(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t); (path/'source.bvh').write_text(BVH)
            output=path/'out.vmd'
            report=convert(path/'source.bvh', {'Hips':'センター','Hips/Arm':'右腕'},output)
            parsed=read_vmd_bones(output)
            self.assertEqual(report['binary_readback']['status'],'passed_binary_roundtrip')
            self.assertEqual(parsed['bone_keys'],4)
            self.assertEqual({r['bone'] for r in parsed['records']},{'センター','右腕'})
            self.assertAlmostEqual(parsed['records'][2]['position'][0],1.)
            self.assertEqual(parsed['status'],'binary_readback_only_not_pmx_validated')
    def test_truncated(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t);(path/'bad.vmd').write_bytes(b'Vocaloid Motion Data 0002'.ljust(30,b'\x00')+bytes(20)+struct.pack('<I',1))
            with self.assertRaisesRegex(ValueError,'Truncated'):read_vmd_bones(path/'bad.vmd')
    def test_bad_quat(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t);(path/'s.bvh').write_text(BVH);out=path/'s.vmd';convert(path/'s.bvh',{'Hips':'センター'},out)
            raw=bytearray(out.read_bytes());struct.pack_into('<4f',raw,54+15+4+12,0.,0.,0.,0.);out.write_bytes(raw)
            with self.assertRaisesRegex(ValueError,'Non-unit'):read_vmd_bones(out)
    def test_mismatch(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t);(path/'s.bvh').write_text(BVH);out=path/'s.vmd';convert(path/'s.bvh',{'Hips':'センター'},out)
            with self.assertRaisesRegex(ValueError,'count mismatch'):compare_vmd_bones(out,[])

if __name__=='__main__':unittest.main()
