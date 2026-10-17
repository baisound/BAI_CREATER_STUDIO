import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dual_foot_plan import propose_dual_foot

def samples(xs):return [{'frame':i,'position':[float(x),0.0,0.0]} for i,x in enumerate(xs)]
class DualFootTests(unittest.TestCase):
 def test_agreement(self):
  r=propose_dual_foot(samples([0,.01,.02]),samples([2,2.01,2.02]))
  self.assertEqual(r['conflict_frames'],[])
  self.assertAlmostEqual(r['frames'][-1]['suggested_root_translation_delta_xz'][0],-.02)
 def test_conflict_prevents_root_move(self):
  r=propose_dual_foot(samples([0,.1,.2]),samples([2,1.9,1.8]))
  self.assertIn(1,r['conflict_frames'])
  self.assertEqual(r['frames'][1]['suggested_root_translation_delta_xz'],[0,0])
 def test_single_foot(self):
  right=[{'frame':i,'position':[0,1,0]} for i in range(3)]
  r=propose_dual_foot(samples([0,.02,.04]),right)
  self.assertEqual(r['frames'][-1]['active_feet'],['left'])
 def test_bounds(self):
  r=propose_dual_foot(samples([0,1,2]),samples([0,1,2]),max_offset=.1)
  self.assertAlmostEqual(r['frames'][-1]['suggested_root_translation_delta_xz'][0],-.1)
 def test_bad_values(self):
  with self.assertRaises(ValueError):propose_dual_foot(samples([0,0]),samples([0,0]),conflict_tolerance=float('nan'))
 def test_source_not_changed(self):
  a=samples([0,.1,.2]);before=str(a);propose_dual_foot(a,samples([1,1,1]));self.assertEqual(before,str(a))
if __name__=='__main__':unittest.main()
