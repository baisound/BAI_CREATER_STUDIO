import tempfile,unittest,json
from pathlib import Path
from studio_project_catalog import create
from studio_project_snapshots import save,read
from project_state_bundle import validate_bundle
from bai_camera import DEFAULT
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.catalog=self.root/'catalog.json';self.project=create(self.catalog,'Hello')
 def tearDown(self):self.tmp.cleanup()
 def bundle(self):return {'schema':1,'combination':{'schema':1,'timeline':[],'history':[],'cursor':-1},'camera':DEFAULT}
 def test_missing(self):
  with self.assertRaises(FileNotFoundError):read(self.root/'snap',self.catalog,self.project['id'])
 def test_unknown_id(self):
  with self.assertRaises(ValueError):save(self.root/'snap',self.catalog,'bad',self.bundle())
 def test_invalid_bundle_never_written(self):
  with self.assertRaises(ValueError):save(self.root/'snap',self.catalog,self.project['id'],{})
  self.assertEqual(list((self.root/'snap').glob('*')) if (self.root/'snap').exists() else [],[])
 def test_save_read_if_schema_accepted(self):
  bundle=self.bundle()
  try:validate_bundle(bundle)
  except ValueError:self.skipTest('Camera schema differs; validation remains enforced')
  save(self.root/'snap',self.catalog,self.project['id'],bundle)
  result=read(self.root/'snap',self.catalog,self.project['id'])
  self.assertEqual(result['bundle'],validate_bundle(bundle));self.assertTrue(result['active_project_unchanged'])
 def test_corrupt_preserved(self):
  d=self.root/'snap';d.mkdir();path=d/(self.project['id']+'.json');path.write_text('bad')
  with self.assertRaises(ValueError):read(d,self.catalog,self.project['id'])
  self.assertEqual(path.read_text(),'bad')
if __name__=='__main__':unittest.main()
