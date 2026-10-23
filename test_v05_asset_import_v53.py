import unittest
from studio_v05_asset_categories import capabilities
from studio_v05_arrangement import inventory, classify
from library_assets import validate

class TestCapabilities(unittest.TestCase):
    def test_formats_consistent(self):
        c=capabilities()
        self.assertIn('wav',c['upload_formats'])
        self.assertIn('audio',c['upload_formats']['wav'])
        self.assertNotIn('vrm',c['upload_formats'])
    def test_existing_validator(self):
        self.assertEqual(validate('audio','test.wav',100),'wav')
        with self.assertRaises(ValueError):validate('audio','test.vmd',100)
    def test_existing_search(self):
        items=[{'id':'one','name':'舞台曲.wav','kind':'audio','available':True},{'id':'two','name':'sample.glb','kind':'model','available':True}]
        self.assertEqual(inventory(items,'audio','舞台')['count'],1)
    def test_library_fx_classification(self):
        self.assertEqual(classify({'source':'library','kind':'fx','name':'spark.png'}),'effect')
        self.assertEqual(classify({'source':'library','kind':'stage','name':'arena.glb'}),'model')
    def test_category_not_translated_in_api(self):
        self.assertIn('motion',capabilities()['search_categories'])

if __name__=='__main__':unittest.main()
