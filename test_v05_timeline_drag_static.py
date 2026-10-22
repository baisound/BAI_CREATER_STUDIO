from pathlib import Path
import unittest
SRC = (Path(__file__).parent/'studio/v05/js/asset-workflow-v06.js').read_text()
class TimelineDragContract(unittest.TestCase):
 def test_pointer_actions(self):
  for token in ('pointerdown','pointermove','pointerup','pointercancel','trim-left','trim-right'):
   self.assertIn(token,SRC)
 def test_shared_edit_api(self):
  self.assertIn('/api/studio/v05/arrangement/clip/edit',SRC)
  self.assertIn('revision,action:',SRC)
 def test_snapping_and_track(self):
  self.assertIn('roundSnap(',SRC)
  self.assertIn("'[data-track]'",SRC)
 def test_no_persist_until_release(self):
  self.assertIn('if(v.moved){e.preventDefault();dragCommit(',SRC)
if __name__=='__main__':unittest.main()
