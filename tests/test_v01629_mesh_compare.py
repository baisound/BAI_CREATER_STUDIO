from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class TestV01629MeshCompare(unittest.TestCase):
    def test_view_is_opt_in(self):
        js=(ROOT/'v01629_mesh_compare.js').read_text()
        self.assertIn('check.checked',js)
        self.assertIn('getDependency(\'node\',index)',js)
        self.assertIn('fromArray(q).normalize()',js)
        self.assertIn('未校正',js)
    def test_module_is_loaded(self):
        self.assertIn('src="/v01629_mesh_compare.js"',(ROOT/'index.html').read_text())
if __name__=='__main__':unittest.main()
