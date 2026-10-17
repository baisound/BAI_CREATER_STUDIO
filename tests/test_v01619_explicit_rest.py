import math, unittest
from rest_rotation_transfer import preview

class TestExplicitRest(unittest.TestCase):
    def sample(self,source=[0,0,0,1],target=[0,0,0,1],delta=[0,0,0,1]):
        return {'coordinate_convention_confirmed':True,'rest_pairs':{'leftUpperArm':{'source_rest_xyzw':source,'target_rest_xyzw':target,'target_bone':'LArm'}},'samples':[{'role':'leftUpperArm','frame':30,'rotation_xyzw':delta}]}
    def test_identity(self):
        self.assertEqual(preview(self.sample())['samples'][0]['target_rotation_xyzw'],[0,0,0,1])
    def test_frame_conversion(self):
        src=[0,0,math.sin(math.pi/4),math.cos(math.pi/4)]
        x=[math.sin(math.pi/6),0,0,math.cos(math.pi/6)]
        v=preview(self.sample(source=src,delta=x))['samples'][0]['target_rotation_xyzw']
        self.assertAlmostEqual(abs(v[1]),.5,places=6)
        self.assertAlmostEqual(v[0],0,places=6)
    def test_missing_confirmation(self):
        o=self.sample();o['coordinate_convention_confirmed']=False
        with self.assertRaises(ValueError):preview(o)
    def test_unmapped(self):
        o=self.sample();o['samples'][0]['role']='other'
        self.assertEqual(preview(o)['samples'][0]['status'],'unmapped')
    def test_invalid_quat(self):
        o=self.sample();o['samples'][0]['rotation_xyzw']=[0,0,0,0]
        with self.assertRaises(ValueError):preview(o)
    def test_nondestructive(self):
        o=self.sample();before=str(o);r=preview(o)
        self.assertEqual(before,str(o));self.assertFalse(r['model_modified'])
if __name__=='__main__':unittest.main()
