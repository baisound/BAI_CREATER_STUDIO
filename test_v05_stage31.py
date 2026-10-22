import tempfile,unittest,json
from pathlib import Path
from studio_project_catalog import create,set_fps,list_projects,CatalogError
class TestFPS(unittest.TestCase):
 def test_roundtrip_and_independence(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'catalog.json';a=create(p,'A');b=create(p,'B')
   set_fps(p,a['id'],29.97)
   items=list_projects(p)['projects'];self.assertEqual(items[0]['fps'],29.97);self.assertNotIn('fps',items[1])
   self.assertEqual(items[1]['id'],b['id'])
 def test_invalid(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'catalog.json';a=create(p,'A');original=p.read_bytes()
   for n in [True,0,-1,241,float('inf'),float('nan'),'60',None]:
    with self.assertRaises(CatalogError):set_fps(p,a['id'],n)
   self.assertEqual(p.read_bytes(),original)
 def test_unknown_model(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'catalog.json';create(p,'A');before=p.read_bytes()
   with self.assertRaises(CatalogError):set_fps(p,'missing',60)
   self.assertEqual(p.read_bytes(),before)
if __name__=='__main__':unittest.main()
