import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ai_ik_preview import preview
from bai_ai_manager import status

BASE={'frame':42,'limbs':{'rightArm':{'base':[0,0],'target':[0.5,0.3],'upper':0.4,'lower':0.4,'bend':1},'leftLeg':{'base':[0,0],'target':[0.25,0.65],'upper':0.5,'lower':0.5,'bend':-1}}}
class PreviewTests(unittest.TestCase):
 def test_conversion(self):
  p={'constraints':[{'bone':'右腕','action':'up','description':'右腕上げる'},{'bone':'左脚','action':'hold','description':'固定'}]}
  out=preview(p,BASE)
  self.assertEqual(out['pose_input']['limbs']['rightArm']['target'],[0.5,0.45])
  self.assertEqual(len(out['accepted']),2)
  self.assertEqual(BASE['limbs']['rightArm']['target'],[0.5,0.3])
  self.assertFalse(out['applied'])
 def test_unknown_ignored(self):
  out=preview({'constraints':[{'bone':'頭','action':'spin'},{'bone':'右腕','action':'arbitrary'}]},BASE)
  self.assertEqual(len(out['accepted']),0)
  self.assertEqual(len(out['ignored']),2)
 def test_no_ollama_needed_for_manual_preview(self):
  self.assertFalse(status({'enabled':False})['available'])
  self.assertEqual(preview({'constraints':[]},BASE)['solved']['frame'],42)
 def test_bad_baseline(self):
  with self.assertRaises(ValueError):preview({'constraints':[]},{'limbs':{'rightArm':{'base':[1]}}})
if __name__=='__main__':unittest.main()
