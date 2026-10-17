import sys,unittest,tempfile,struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from motion_vmd_bridge import euler_channels_to_quat,convert

class TestBridge(unittest.TestCase):
 def test_identity(self):self.assertEqual(euler_channels_to_quat([('Xrotation',0),('Yrotation',0)]),(1.,0.,0.,0.))
 def test_axis(self):self.assertAlmostEqual(euler_channels_to_quat([('Zrotation',90)])[0],2**-.5)
 def test_bvh_vmd(self):
  text='''HIERARCHY\nROOT Hips\n{\n OFFSET 0 0 0\n CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n End Site\n {\n OFFSET 0 1 0\n }\n}\nMOTION\nFrames: 2\nFrame Time: 0.033333333\n0 0 0 0 0 0\n1 2 3 90 0 0\n'''
  with tempfile.TemporaryDirectory() as tmp:
   src=Path(tmp)/'a.bvh';out=Path(tmp)/'a.vmd';src.write_text(text)
   report=convert(src,{'Hips':'センター'},out)
   self.assertEqual(report['bone_keys'],2)
   blob=out.read_bytes();self.assertEqual(struct.unpack_from('<I',blob,50)[0],2)
 def test_unmapped(self):
  with tempfile.TemporaryDirectory() as tmp:
   src=Path(tmp)/'a.bvh';src.write_text('bad')
   with self.assertRaises(Exception):convert(src,{'none':'センター'},Path(tmp)/'a.vmd')
if __name__=='__main__':unittest.main()
