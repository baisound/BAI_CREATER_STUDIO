from pathlib import Path
from unittest import TestCase

ROOT = Path(__file__).parent
class CameraBundleUiContractTests(TestCase):
    def test_page_wires_bundle_controls(self):
        html=(ROOT/'camera.html').read_text(encoding='utf-8')
        for token in ('id="bundle-save"','id="bundle-load"','camera_bundle_core.js','camera_project_bundle_ui.js'):
            self.assertIn(token,html)
    def test_server_serves_script(self):
        self.assertIn('"/camera_project_bundle_ui.js"',(ROOT/'server.py').read_text(encoding='utf-8'))
        self.assertIn('"/camera_bundle_core.js"',(ROOT/'server.py').read_text(encoding='utf-8'))
    def test_camera_has_non_destructive_snapshot_and_restore(self):
        source=(ROOT/'camera.js').read_text(encoding='utf-8')
        self.assertIn('bai-camera-bundle-snapshot',source)
        self.assertIn('bai-camera-bundle-restore',source)
        self.assertIn('cancelAnimationFrame(raf)',source)
    def test_workspace_and_external_vmd_limit(self):
        source=(ROOT/'camera_project_bundle_ui.js').read_text(encoding='utf-8')
        self.assertIn('VMD/FBXモーション本体は含みません',source)
        self.assertIn('bai-camera-workspace-restore',source)
        self.assertIn('window.confirm',source)
