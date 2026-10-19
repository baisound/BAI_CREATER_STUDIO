import unittest
from copy import deepcopy
from tempfile import TemporaryDirectory
from pathlib import Path
from bai_camera import save,read
from bai_camera import validate, DEFAULT

class RigStoreTests(unittest.TestCase):
    def setUp(self):
        self.rig=dict(type='curve',amount=0,start=[0,1,0],control=[1,2,3],end=[4,2,0],constant_speed=True,show_path=True,bake_from=0,bake_to=120,bake_step=5,bake_ease='smooth')
    def test_round_trip(self):
        p=deepcopy(DEFAULT);p['rig']=self.rig
        self.assertEqual(validate(p)['rig']['control'],[1.,2.,3.])
    def test_file_round_trip(self):
        p=deepcopy(DEFAULT);p['rig']=self.rig
        with TemporaryDirectory() as d:
            path=Path(d)/'camera.json'
            save(path,p)
            self.assertEqual(read(path)['rig']['bake_ease'],'smooth')
    def test_legacy_project(self):
        self.assertNotIn('rig',validate(DEFAULT))
    def test_reject_nan(self):
        p=deepcopy(DEFAULT);p['rig']=dict(self.rig,amount=float('nan'))
        with self.assertRaises(ValueError):validate(p)
    def test_reject_bad_vector(self):
        p=deepcopy(DEFAULT);p['rig']=dict(self.rig,start=[0,1])
        with self.assertRaises(ValueError):validate(p)
if __name__=='__main__':unittest.main()

class TestCraneStartAngle(unittest.TestCase):
    def test_legacy_defaults_to_zero(self):
        from camera_rig_store import validate_rig
        sample=dict(type='crane', amount=90, start=[0,1,0],control=[0,0,0],end=[0,0,1],constant_speed=False,show_path=False,bake_from=0,bake_to=120,bake_step=5,bake_ease='linear')
        self.assertEqual(validate_rig(sample)['crane_from_angle'],0)
        sample['crane_from_angle']=30
        self.assertEqual(validate_rig(sample)['crane_from_angle'],30)
        sample['crane_from_angle']=float('nan')
        with self.assertRaises(ValueError): validate_rig(sample)
