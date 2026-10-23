import tempfile,unittest,json
from pathlib import Path
from studio_project_catalog import _atomic
from studio_v05_playhead import read,update,PlayheadError
class PlayheadStage13(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.root=Path(self.t.name)
  self.cat=self.root/'catalog.json';_atomic(self.cat,{'schema':1,'revision':0,'projects':[{'id':'one','name':'One'},{'id':'two','name':'Two'}]})
 def test_initial(self):self.assertEqual(read(self.root,self.cat,'one')['seconds'],0)
 def test_roundtrip(self):
  p=update(self.root,self.cat,'one',7.25,0);self.assertEqual(p['revision'],1);self.assertEqual(read(self.root,self.cat,'one')['seconds'],7.25)
 def test_isolation(self):
  update(self.root,self.cat,'one',3,0);self.assertEqual(read(self.root,self.cat,'two')['seconds'],0)
 def test_conflict(self):
  update(self.root,self.cat,'one',3,0)
  with self.assertRaisesRegex(PlayheadError,'conflict'):update(self.root,self.cat,'one',5,0)
 def test_bad_time(self):
  for x in [-1,86401,float('nan'),True,'4']:
   with self.subTest(x=x),self.assertRaises(PlayheadError):update(self.root,self.cat,'one',x,0)
 def test_bad_revision(self):
  with self.assertRaises(PlayheadError):update(self.root,self.cat,'one',2,True)
 def test_corrupt_unchanged(self):
  self.root.joinpath('one.json').write_text('{bad')
  with self.assertRaises(PlayheadError):read(self.root,self.cat,'one')
  self.assertEqual(self.root.joinpath('one.json').read_text(),'{bad')
 def test_tool_registration(self):
  base=Path(__file__).resolve().parent
  for f in ('mcp_server.py','webmcp.js'):
   text=(base/f).read_text();self.assertIn('bai_studio_playhead_get',text);self.assertIn('bai_studio_playhead_set',text)
 def test_ui_contract(self):
  text=(Path(__file__).parent/'studio/v05/js/asset-workflow-v06.js').read_text();self.assertIn('setPlayhead',text);self.assertIn('loadPlayhead',text)
if __name__=='__main__':unittest.main()
