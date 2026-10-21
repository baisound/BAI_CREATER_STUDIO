import pathlib
import unittest
ROOT=pathlib.Path(__file__).parent
class ModelBoundsWiringTest(unittest.TestCase):
    def test_emitter_after_animation_update(self):
        src=(ROOT/'camera_3d.js').read_text()
        self.assertIn("'bai-camera-model-bounds'", src)
        self.assertIn('trackSubject();publishModelFraming()',src)
        # Bounds geometry is exercised with a real rendered model in the browser test.
    def test_consumer_and_fallback(self):
        src=(ROOT/'camera.js').read_text()
        self.assertIn('modelFramingBounds||{}',src)
        self.assertIn("useBox?'実モデルの包囲箱':'実モデルの包囲球'",src)
if __name__=='__main__':unittest.main()
