import tempfile
import unittest
from pathlib import Path
from phase_b_release_gate import REQUIRED, evaluate, assess_review, write_report

class GateTests(unittest.TestCase):
    def test_zero_evidence_is_blocked(self):
        result=evaluate({})
        self.assertFalse(result['production_ready'])
        self.assertEqual(set(REQUIRED),set(result['missing_evidence']))
    def test_partial_evidence_is_blocked(self):
        result=evaluate({'manual_ui_e2e':True})
        self.assertEqual(result['gate'],'blocked')
        self.assertIn('foot_ik_contact_e2e',result['missing_evidence'])
    def test_strict_types(self):
        with self.assertRaises(ValueError):evaluate({'manual_ui_e2e':'true'})
    def test_unknown_rejected(self):
        with self.assertRaises(ValueError):evaluate({'fake':True})
    def test_all_verified_only_when_explicit(self):
        result=evaluate({x:True for x in REQUIRED})
        self.assertTrue(result['production_ready'])
    def test_keyframe_review_never_approves_export(self):
        result=assess_review({'kind':'BAI_UNVERIFIED_KEYFRAME_REVIEW','animation_applied':False,'vmd_export_allowed':False,'keys':[{'frame':0,'role':'hips','rotation_xyzw':[0,0,0,1]}]})
        self.assertFalse(result['vmd_export_allowed'])
    def test_invalid_review_rejected(self):
        with self.assertRaises(ValueError):assess_review({'kind':'BAI_UNVERIFIED_KEYFRAME_REVIEW','animation_applied':True,'vmd_export_allowed':False,'keys':[]})
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'report.json'
            write_report(p,evaluate({}))
            with self.assertRaises(FileExistsError):write_report(p,evaluate({}))
