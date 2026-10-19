import pathlib
import unittest
ROOT=pathlib.Path(__file__).parent
class ModelBoundsWiringTest(unittest.TestCase):
    def test_emitter_after_animation_update(self):
        src=(ROOT/'camera_3d.js').read_text()
        self.assertIn("'bai-camera-model-bounds'", src)
        self.assertIn('trackSubject();publishModelFraming()',src)
        self.assertIn('node.isSkinnedMesh',src)
    def test_consumer_and_fallback(self):
        src=(ROOT/'camera.js').read_text()
        self.assertIn('modelFramingBounds||{}',src)
        self.assertIn("modelFramingBounds?'実モデルの包囲球':'ガイド人体'",src)
if __name__=='__main__':unittest.main()
