"""Phase E bone tracking contract; does not claim GPU validation."""
from pathlib import Path
import unittest
R=Path(__file__).parent
class BoneTrackingWiring(unittest.TestCase):
 def test_controls(self):
  html=(R/'camera.html').read_text()
  for element in ('camera-follow-bone','camera-follow-enabled','camera-follow-status'):
   self.assertIn('id="'+element+'"',html)
 def test_animation_sample_precedes_tracking(self):
  js=(R/'camera_3d.js').read_text()
  update=js.split('function updateTime(){',1)[1].split("window.addEventListener('bai-camera-frame'",1)[0]
  self.assertLess(update.index('mixer.setTime('),update.index('trackSubject()'))
 def test_disabled_under_vmd(self):
  js=(R/'camera_3d.js').read_text()
  self.assertIn("if($('vmd-follow-timeline')?.checked)",js)
 def test_tracks_world_position_without_key_write(self):
  js=(R/'camera_3d.js').read_text()
  block=js.split('function trackSubject(){',1)[1].split('boneSelect.onchange=',1)[0]
  self.assertIn('getWorldPosition',block)
  self.assertNotIn('writeKey',block)
if __name__=='__main__':unittest.main()
