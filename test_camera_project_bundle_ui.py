from pathlib import Path
from unittest import TestCase

ROOT = Path(__file__).parent
class CameraBundleUiContractTests(TestCase):
    def test_page_wires_bundle_controls(self):
        html=(ROOT/'camera.html').read_text()
        for token in ('id="bundle-save"','id="bundle-load"','camera_project_bundle_ui.js'):
            self.assertIn(token,html)
    def test_server_serves_script(self):
        self.assertIn('"/camera_project_bundle_ui.js"',(ROOT/'server.py').read_text())
    def test_camera_has_non_destructive_snapshot_and_restore(self):
        source=(ROOT/'camera.js').read_text()
        self.assertIn('bai-camera-bundle-snapshot',source)
        self.assertIn('bai-camera-bundle-restore',source)
        self.assertIn('cancelAnimationFrame(raf)',source)
    def test_workspace_and_external_vmd_limit(self):
        source=(ROOT/'camera_project_bundle_ui.js').read_text()
        self.assertIn('外部VMDファイル本体は未保存',source)
        self.assertIn('bai-camera-workspace-restore',source)
        self.assertIn('window.confirm',source)
