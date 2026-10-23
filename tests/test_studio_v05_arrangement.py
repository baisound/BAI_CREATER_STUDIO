import tempfile,unittest,json
from pathlib import Path
from studio_project_catalog import create
from studio_v05_arrangement import inventory,place,read,ArrangementError
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.cat=self.root/'catalog.json';self.project=create(self.cat,'Demo');self.items=[{'id':'lib:abc','name':'Dance.vmd','kind':'motions','available':True,'source':'library'},{'id':'lib:missing','name':'Camera.vmd','available':False}]
 def tearDown(self):self.tmp.cleanup()
 def test_category_search(self):
  r=inventory(self.items,'motion','DANCE');self.assertEqual(r['count'],1)
 def test_unknown_category(self):
  with self.assertRaises(ArrangementError):inventory(self.items,'invalid')
 def test_initial_is_empty(self):self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['revision'],0)
 def test_place_and_reopen(self):
  result=place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',3.5,6,0,self.items)
  self.assertEqual(result['revision'],1);self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['clips'][0]['start'],3.5)
 def test_revision_conflict(self):
  place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',0,3,0,self.items)
  with self.assertRaisesRegex(ArrangementError,'conflict'):place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',0,3,0,self.items)
 def test_unregistered_no_mutation(self):
  with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'unregistered','motion',0,5,0,self.items)
  self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['clips'],[])
 def test_missing_asset_rejected(self):
  with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'lib:missing','camera',0,5,0,self.items)
 def test_invalid_time(self):
  for bad in [-1,float('nan'),float('inf'),True]:
   with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',bad,5,0,self.items)
 def test_other_project_rejected(self):
  with self.assertRaises(ArrangementError):read(self.root/'arr',self.cat,'other')
 def test_corrupt_preserved(self):
  d=self.root/'arr';d.mkdir();f=d/(self.project['id']+'.json');f.write_text('{oops')
  with self.assertRaises(ValueError):read(d,self.cat,self.project['id'])
  self.assertEqual(f.read_text(),'{oops')
if __name__=='__main__':unittest.main()
