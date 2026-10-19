import copy
import unittest
from bai_camera import DEFAULT
from camera_sequence_api import evaluate

class CameraSequenceApiTest(unittest.TestCase):
    def setUp(self):
        self.p=copy.deepcopy(DEFAULT)
        self.p['custom_presets']=[{'name':'A','pose':{'position':[1,2,3],'target':[0,0,0],'fov':50}}]
        self.p['sequence']=[{'start':10,'end':20,'preset':'A'}]
    def test_before_and_after_use_keys(self):
        self.assertEqual(evaluate(self.p,9)['source'],'keys')
        self.assertEqual(evaluate(self.p,20)['source'],'keys')
    def test_cut_half_open(self):
        self.assertEqual(evaluate(self.p,10)['preset'],'A')
        self.assertEqual(evaluate(self.p,19)['pose']['fov'],50)
    def test_no_source_mutation(self):
        old=copy.deepcopy(self.p);evaluate(self.p,15);self.assertEqual(self.p,old)
    def test_missing_preset_rejected(self):
        self.p['sequence'][0]['preset']='bad'
        with self.assertRaises(ValueError):evaluate(self.p,10)
    def test_out_of_range_rejected(self):
        with self.assertRaises(ValueError):evaluate(self.p,301)

if __name__=='__main__': unittest.main()
