import json, tempfile, unittest
from pathlib import Path
from studio_project_catalog import create,rename,list_projects,CatalogError
class TestCatalog(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'catalog.json'
 def tearDown(self):self.tmp.cleanup()
 def test_create_rename_read(self):
  a=create(self.path,'Dance','dance');self.assertEqual(list_projects(self.path)['projects'][0]['id'],a['id']);rename(self.path,a['id'],'Dance 2');self.assertEqual(list_projects(self.path)['projects'][0]['name'],'Dance 2')
 def test_duplicate_names(self):
  create(self.path,'Dance');self.assertRaises(CatalogError,create,self.path,'dance')
 def test_invalid_and_traversal(self):
  self.assertRaises(CatalogError,create,self.path,'../other')
 def test_invalid_file_untouched(self):
  self.path.write_text('not json');self.assertRaises(ValueError,create,self.path,'test');self.assertEqual(self.path.read_text(),'not json')
 def test_atomic_path(self):
  create(self.path,'test');self.assertFalse(list(self.path.parent.glob('*.tmp-*')))
if __name__=='__main__':unittest.main()
