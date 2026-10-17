import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retarget_mapping_preview import preview
class MappingPreviewTests(unittest.TestCase):
 def test_transfer_names_only(self):
  r=preview({'LeftArm':'左腕'},[{'bone':'LeftArm','frame':2,'rotation_xyzw':[0,0,0,2]}],['LeftArm'],['左腕'])
  self.assertEqual(r['mapped_samples'][0]['rotation_xyzw'],[0,0,0,1]);self.assertFalse(r['applied_to_model'])
 def test_unmapped(self):
  r=preview({},[{'bone':'Hips'}],['Hips'],['下半身']);self.assertEqual(r['unmapped_bones'],['Hips'])
 def test_missing_bone(self):
  with self.assertRaises(ValueError):preview({'fake':'左腕'},[],['LeftArm'],['左腕'])
 def test_duplicate_target(self):
  with self.assertRaises(ValueError):preview({'A':'B','C':'B'},[],['A','C'],['B'])
 def test_invalid_quat(self):
  with self.assertRaises(ValueError):preview({'A':'B'},[{'bone':'A','frame':0,'rotation_xyzw':[0,0,0,0]}],['A'],['B'])
if __name__=='__main__':unittest.main()
