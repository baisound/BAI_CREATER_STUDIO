"""Static regression checks for opt-in experimental timeline preview wiring."""
import unittest
from pathlib import Path

BASE=Path(__file__).parent
class TimelineWiringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(BASE/'camera.html').read_text()
        cls.js=(BASE/'camera.js').read_text()
        cls.render=(BASE/'camera_3d.js').read_text()
    def test_opt_in_disabled_until_track_import(self):
        self.assertIn('id="vmd-follow-timeline" type="checkbox" disabled',self.html)
        self.assertIn('nativeFollow.disabled=false',self.js)
    def test_drops_stale_frames(self):
        self.assertIn('wanted!==frame',self.js)
        self.assertIn('generation!==nativePreviewGeneration',self.js)
        self.assertIn('nativePreviewPending=frame',self.js)
    def test_separate_non_destructive_event(self):
        self.assertIn('bai-camera-vmd-preview',self.js)
        self.assertIn('bai-camera-vmd-preview',self.render)
        self.assertNotIn('writeKey(result)',self.js)
    def test_reset_on_reimport(self):
        self.assertIn('cancelNativeFollow();nativeFollow.checked=false',self.js)
if __name__=='__main__': unittest.main()
