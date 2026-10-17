import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foot_contact import diagnose,root_offset_proposal
class FootTests(unittest.TestCase):
 def test_contact_and_sliding(self):
  a=[{'frame':i,'position':[x,.01,0]} for i,x in enumerate([0,.01,.25,.28])]
  r=diagnose(a)
  self.assertEqual(len(r['contact_intervals']),1);self.assertGreater(len(r['drift_frames']),0)
  self.assertTrue(root_offset_proposal(r,a)['suggestions'])
 def test_no_contact(self):
  r=diagnose([{'frame':0,'position':[0,1,0]},{'frame':1,'position':[1,1,0]}])
  self.assertEqual(r['contact_intervals'],[])
 def test_penetration(self):
  r=diagnose([{'frame':0,'position':[0,-.1,0]},{'frame':1,'position':[0,-.2,0]}])
  self.assertEqual(len(r['penetrations']),2)
 def test_invalid_input(self):
  with self.assertRaises(ValueError):diagnose([{'frame':1,'position':[0,0,0]},{'frame':1,'position':[0,0,0]}])
if __name__=='__main__':unittest.main()
