"""CAM-015 browser wiring contract; real browser execution remains separate."""
import unittest
from pathlib import Path

class SequenceUIContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=Path('camera.html').read_text(encoding='utf-8')
        cls.js=Path('camera.js').read_text(encoding='utf-8')
    def test_controls_present(self):
        for id in ('sequence-preset','sequence-start','sequence-end','sequence-add','sequence-delete','sequence-list','sequence-jump','sequence-status'):
            self.assertIn(f'id="{id}"',self.html)
    def test_mutations_are_undoable(self):
        self.assertIn('project.sequence=[...(project.sequence||[]),cut]',self.js)
        self.assertIn('project.sequence=project.sequence.filter',self.js)
        self.assertIn('checkpoint();renderSequence()',self.js)
    def test_references_protected(self):
        self.assertIn("(project.sequence||[]).some(c=>c.preset===name)",self.js)
    def test_overlap_rejected(self):
        self.assertIn('start<c.end&&end>c.start',self.js)
    def test_mcp_refresh_is_explicit_and_fail_closed(self):
        self.assertIn('id="sequence-refresh"',self.html)
        self.assertIn("if(dirty){out.textContent=",self.js)
        self.assertIn("fetch('/api/camera/project?envelope=1',{cache:'no-store'})",self.js)
        self.assertIn("取得中に編集されました",self.js)
        self.assertIn("window.addEventListener('bai-camera-sequence-refresh'",self.js)
    def test_restoration_rerenders(self):
        self.assertIn('function renderCustomPresets(){renderSequence()',self.js)
if __name__=='__main__':unittest.main()
