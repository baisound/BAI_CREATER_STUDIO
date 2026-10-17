import unittest
from bvh_foot_world import sample_bvh_foot_world
from foot_contact import diagnose

BVH='''HIERARCHY
ROOT Hips
{
 OFFSET 0 0 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT LeftFoot
 {
  OFFSET 0 -1 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site
  {
   OFFSET 0 -0.1 0
  }
 }
}
MOTION
Frames: 3
Frame Time: 0.0333333
0 1 0 0 0 0 0 0 0
1 1 0 0 0 0 0 0 0
2 1 0 0 0 0 0 0 0
'''.encode()

class TestBVHFootWorld(unittest.TestCase):
    def test_root_translation_moves_world_foot(self):
        result=sample_bvh_foot_world(BVH,'LeftFoot')
        self.assertEqual([s['position'] for s in result['samples']],[[0.,0.,0.],[1.,0.,0.],[2.,0.,0.]])
        self.assertTrue(diagnose(result['samples'])['drift_frames'])
    def test_rotation_order_and_parent(self):
        rotated=BVH.replace(b'0 1 0 0 0 0 0 0 0',b'0 1 0 90 0 0 0 0 0',1)
        result=sample_bvh_foot_world(rotated,'LeftFoot')
        self.assertEqual(result['samples'][0]['position'],[1.,1.,0.])
    def test_unknown_bone_rejected(self):
        with self.assertRaises(ValueError):sample_bvh_foot_world(BVH,'Missing')
    def test_invalid_frame_rejected(self):
        with self.assertRaises(ValueError):sample_bvh_foot_world(BVH.replace(b'2 1 0 0 0 0 0 0 0',b'2 1 NaN 0 0 0 0 0 0'),'LeftFoot')
    def test_downsample(self):
        self.assertEqual([x['frame'] for x in sample_bvh_foot_world(BVH,'LeftFoot',2)['samples']],[0,2])
if __name__=='__main__':unittest.main()
