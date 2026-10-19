import copy, unittest
from bai_camera import DEFAULT
from camera_sequence_edit import edit

class TestSequenceEdit(unittest.TestCase):
    def setUp(self):
        self.p=copy.deepcopy(DEFAULT)
        self.p['custom_presets']=[{'name':'A','pose':{'position':[1,2,3],'target':[0,0,0],'fov':50}}]
    def test_roundtrip(self):
        p=edit(self.p,{'action':'add','expected_sequence':[],'shot':{'start':10,'end':20,'preset':'A'}})
        self.assertEqual(p['sequence'][0]['start'],10)
        q=edit(p,{'action':'update','index':0,'expected_sequence':p['sequence'],'shot':{'start':30,'end':40,'preset':'A'}})
        self.assertEqual(q['sequence'][0]['start'],30)
        r=edit(q,{'action':'remove','index':0,'expected_sequence':q['sequence']})
        self.assertEqual(r['sequence'],[])
        self.assertNotIn('sequence',self.p)
    def test_conflict(self):
        with self.assertRaisesRegex(ValueError,'conflict'):edit(self.p,{'action':'add','expected_sequence':[{}],'shot':{'start':1,'end':5,'preset':'A'}})
    def test_invalid_overlap(self):
        p=edit(self.p,{'action':'add','expected_sequence':[],'shot':{'start':10,'end':20,'preset':'A'}})
        with self.assertRaises(ValueError):edit(p,{'action':'add','expected_sequence':p['sequence'],'shot':{'start':15,'end':22,'preset':'A'}})
    def test_unknown_preset(self):
        with self.assertRaises(ValueError):edit(self.p,{'action':'add','expected_sequence':[],'shot':{'start':10,'end':20,'preset':'bad'}})
    def test_invalid_index(self):
        with self.assertRaises(ValueError):edit(self.p,{'action':'remove','index':0,'expected_sequence':[]})
if __name__=='__main__':unittest.main()
