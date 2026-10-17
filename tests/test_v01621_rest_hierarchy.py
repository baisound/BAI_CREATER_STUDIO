import math, unittest
from rest_hierarchy_inspection import inspect
from tests.test_v01620_rest_inspection import pack

class HierarchyInspection(unittest.TestCase):
    def test_parent_rotation_accumulates(self):
        q=[0,0,math.sin(math.pi/4),math.cos(math.pi/4)]
        data=pack([{'name':'root','rotation':q,'children':[1]},{'name':'arm','rotation':[0,0,0,1]}],{'leftUpperArm':1})
        r=inspect(data,data)['roles'][0]['source']
        self.assertAlmostEqual(r['local_rest_xyzw'][2],0)
        self.assertAlmostEqual(abs(r['world_rest_xyzw'][2]),math.sqrt(0.5),places=6)
    def test_reflected_parent_rejected(self):
        bad=pack([{'name':'root','scale':[-1,1,1],'children':[1]},{'name':'arm'}],{'leftUpperArm':1})
        ok=pack([{'name':'root','children':[1]},{'name':'arm'}],{'leftUpperArm':1})
        r=inspect(bad,ok)['roles'][0]
        self.assertEqual(r['status'],'manual_calibration_required')
        self.assertIsNone(r['source']['world_rest_xyzw'])
    def test_read_only_and_missing(self):
        a=pack([{'name':'arm'}],{'leftUpperArm':0}); b=pack([{'name':'hips'}],{'hips':0})
        r=inspect(a,b)
        self.assertFalse(r['animation_applied'])
        self.assertFalse(r['model_modified'])
        self.assertEqual(len(r['roles']),2)
    def test_invalid_input_rejected(self):
        with self.assertRaises(ValueError): inspect(b'bad',b'bad')

if __name__=='__main__': unittest.main()
