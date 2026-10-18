import unittest
from bai_camera import DEFAULT
from camera_focus import diagnose, diagnose_range

class FocusTests(unittest.TestCase):
    def test_ideal_focus(self):
        actual=diagnose(DEFAULT,0)['subject_distance_m']
        result=diagnose(DEFAULT,0,focus_m=actual)
        self.assertTrue(result['inside'])
    def test_out_of_focus(self):
        self.assertEqual(diagnose(DEFAULT,0,focus_m=.3)['classification'],'back')
    def test_range(self):
        result=diagnose_range(DEFAULT,0,90,step=10,focus_m=.3)
        self.assertEqual(result['sample_count'],10)
        self.assertEqual(result['failed_samples'],10)
        self.assertEqual(result['failure_intervals'],[[0,90]])
    def test_cap(self):
        with self.assertRaisesRegex(ValueError,'10000'):diagnose_range(dict(DEFAULT,duration=30000),0,30000)
    def test_invalid(self):
        with self.assertRaises(ValueError):diagnose(DEFAULT,0,focus_m=0)
        with self.assertRaises(ValueError):diagnose(DEFAULT,0,target='../other')
if __name__=='__main__':unittest.main()
