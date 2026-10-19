"""Phase E regression tests for local VMD preview render precedence and playback clock."""
import pathlib, unittest
BASE=pathlib.Path(__file__).parent
class TimelineRenderPriority(unittest.TestCase):
 def test_camera_frame_does_not_override_follow_pose(self):
  js=(BASE/'camera_3d.js').read_text()
  self.assertIn("if(!document.getElementById('vmd-follow-timeline')?.checked){untrackedPose=e.detail.pose;applyPose(e.detail.pose)}",js)
  self.assertIn("window.addEventListener('bai-camera-vmd-preview',e=>{applyPose(e.detail.pose);updateTrackedFocus()})",js)
  self.assertIn('updateTime()',js)
 def test_fractional_playback_clock_accumulates(self):
  js=(BASE/'camera.js').read_text()
  self.assertIn('playhead+=Math.min(250,t-lastTime)*project.fps/1000',js)
  self.assertIn('setFrame(playhead)',js)
 def test_default_follow_is_opt_in(self):
  html=(BASE/'camera.html').read_text()
  self.assertIn('id="vmd-follow-timeline" type="checkbox" disabled',html)
if __name__=='__main__':unittest.main()
