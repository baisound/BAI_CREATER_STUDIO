import tempfile, unittest, hashlib
from pathlib import Path
from qa.phase_b_gate import run_gate

BVH='''HIERARCHY
ROOT Hips
{
 OFFSET 0 0 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT LeftFoot
 {
  OFFSET -0.2 -1 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site
  {
   OFFSET 0 -0.1 0
  }
 }
 JOINT RightFoot
 {
  OFFSET 0.2 -1 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site
  {
   OFFSET 0 -0.1 0
  }
 }
}
MOTION
Frames: 3
Frame Time: 0.033333333
0 1 0 0 0 0 0 0 0 0 0 0
0.1 1 0 0 0 0 0 0 0 0 0 0
0.2 1 0 0 0 0 0 0 0 0 0 0
'''

class PhaseBGateTests(unittest.TestCase):
    def test_end_to_end_binary_and_foot_preview(self):
        with tempfile.TemporaryDirectory() as td:
            source=Path(td)/'source.bvh';source.write_text(BVH)
            before=hashlib.sha256(source.read_bytes()).hexdigest()
            r=run_gate(source,'LeftFoot','RightFoot',{'Hips':'センター','Hips/LeftFoot':'左足','Hips/RightFoot':'右足'})
            self.assertEqual(r['gate_status'],'passed_limited_binary_and_diagnostic_checks')
            self.assertEqual(r['phase_b_status'],'NOT_COMPLETE')
            self.assertEqual(r['observed']['frames_sampled'],3)
            self.assertEqual(r['observed']['vmd_bone_keys'],9)
            self.assertTrue(r['source_unchanged'])
            self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertIn('PMX',str(r['blocking_unverified_items']))
    def test_missing_joint_is_failure(self):
        with tempfile.TemporaryDirectory() as td:
            source=Path(td)/'source.bvh';source.write_text(BVH)
            with self.assertRaisesRegex(ValueError,'missing or ambiguous'):
                run_gate(source,'Missing','RightFoot',{'Hips':'センター'})
    def test_reject_unsupported_format(self):
        with tempfile.TemporaryDirectory() as td:
            source=Path(td)/'test.fbx';source.write_text('not fbx')
            with self.assertRaisesRegex(ValueError,'BVH only'):
                run_gate(source,'LeftFoot','RightFoot',{'Hips':'センター'})

if __name__=='__main__': unittest.main()
