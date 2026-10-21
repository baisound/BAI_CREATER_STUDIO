"""Projection selection regression contract for experimental VMD preview."""
import pathlib
import unittest

SOURCE = pathlib.Path(__file__).with_name('camera_3d.js').read_text(encoding='utf-8')

class ProjectionWiringTest(unittest.TestCase):
    def test_vmd_flag_selects_orthographic(self):
        self.assertIn('p.perspective===1', SOURCE)
        self.assertIn('orthographic?orthographicCam:filmingCam', SOURCE)
    def test_active_camera_used_by_renderer(self):
        self.assertIn('render(world,activeFilmingCamera)', SOURCE)
    def test_resize_handles_both_projection_types(self):
        self.assertIn('camera.isOrthographicCamera', SOURCE)
        self.assertIn('resizeProjection(v.camera,w/h)', SOURCE)
    def test_camera_helper_tracks_switch(self):
        self.assertIn('camHelper=new THREE.CameraHelper(camera)', SOURCE)
    def test_perspective_equivalent_framing(self):
        self.assertIn('distance*Math.tan(', SOURCE)

if __name__ == '__main__': unittest.main()
