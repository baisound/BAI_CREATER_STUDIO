import unittest
from retarget_calibration import calibrate
class CalibrationTests(unittest.TestCase):
    def test_scale_and_mapping(self):
        s={'filename':'s','format':'FBX','suggested_mapping':{'hips':'Hips','head':'Head'},'metadata':{'bones_detail':[{'name':'Hips','head_local':[0,0,0]},{'name':'Head','head_local':[0,2,0]}]}}
        t={'filename':'t','format':'PMX','suggested_mapping':{'hips':'センター','head':'頭'},'metadata':{'bones_detail':[{'name':'センター','position':[0,0,0]},{'name':'頭','position':[0,4,0]}]}}
        result=calibrate(s,t)
        self.assertEqual(result['scale_proposal'],2)
        self.assertEqual(result['mapping']['Hips'],'センター')
        self.assertFalse(result['quality']['verified'])
    def test_missing_positions_are_not_invented(self):
        s={'suggested_mapping':{'hips':'Hips'},'metadata':{},'format':'GLB'}
        t={'suggested_mapping':{'hips':'センター'},'metadata':{},'format':'PMX'}
        result=calibrate(s,t)
        self.assertIsNone(result['scale_proposal'])
        self.assertEqual(result['scale_segments'],[])
if __name__=='__main__':unittest.main()
