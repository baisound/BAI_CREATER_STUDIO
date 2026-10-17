import json,struct,unittest
from rest_pose_inspection import compare

def pack(nodes,human):
    doc={'asset':{'version':'2.0'},'nodes':nodes,'skins':[{'joints':list(range(len(nodes)))}],'extensions':{'VRMC_vrm':{'humanoid':{'humanBones':{k:{'node':v} for k,v in human.items()}}}}}
    js=json.dumps(doc).encode();js+=b' '*((-len(js))%4)
    return struct.pack('<4sII',b'glTF',2,20+len(js))+struct.pack('<II',len(js),0x4e4f534a)+js

class RestInspection(unittest.TestCase):
    def test_matching_roles(self):
        a=pack([{'name':'LeftArm','rotation':[0,0,0,1]}],{'leftUpperArm':0})
        b=pack([{'name':'LArm','rotation':[0,0,0,1]}],{'leftUpperArm':0})
        r=compare(a,b);self.assertEqual(r['roles'][0]['status'],'review_required');self.assertFalse(r['common_coordinate_convention_confirmed']);self.assertFalse(r['animation_applied'])
    def test_missing_role(self):
        a=pack([{'name':'A'}],{'hips':0});b=pack([{'name':'B'}],{'head':0})
        self.assertEqual({x['status'] for x in compare(a,b)['roles']},{'missing_source','missing_target'})
    def test_reflection_rejected(self):
        a=pack([{'name':'A','matrix':[-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}],{'hips':0});b=pack([{'name':'B'}],{'hips':0})
        self.assertEqual(compare(a,b)['roles'][0]['status'],'manual_calibration_required')
    def test_invalid_glb(self):
        with self.assertRaises(ValueError):compare(b'bad',b'bad')
    def test_unity_orientation(self):
        a=pack([{'name':'A','matrix':[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}],{'hips':0})
        self.assertEqual(compare(a,a)['roles'][0]['source']['local_rest_xyzw'],[0,0,0,1])

if __name__=='__main__':unittest.main()
