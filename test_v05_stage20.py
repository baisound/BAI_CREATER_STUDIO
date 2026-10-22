import tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import studio_v05_arrangement as a
class TargetTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name);self.catalog=self.root/'c.json';self.pid='project-1'
  self.mock=patch.object(a,'load_catalog',return_value={'projects':[{'id':self.pid}]});self.mock.start();self.addCleanup(self.mock.stop)
  self.assets=[{'id':'motion1','filename':'dance.vmd','available':True},{'id':'model1','filename':'hero.vrm','available':True},{'id':'model2','filename':'lost.vrm','available':False}]
  self.clip=a.place(self.root,self.catalog,self.pid,'motion1','motion',0,5,0,self.assets)['clip']['id']
 def bind(self,revision,target):return a.set_clip_target(self.root,self.catalog,self.pid,self.clip,revision,target,self.assets)
 def test_set_and_clear(self):
  self.assertEqual(self.bind(1,'model1')['revision'],2)
  self.assertEqual(a.read(self.root,self.catalog,self.pid)['clips'][0]['target_model_id'],'model1')
  self.bind(2,None);self.assertNotIn('target_model_id',a.read(self.root,self.catalog,self.pid)['clips'][0])
 def test_conflict_no_change(self):
  self.bind(1,'model1')
  with self.assertRaisesRegex(a.ArrangementError,'conflict'):self.bind(1,None)
  self.assertEqual(a.read(self.root,self.catalog,self.pid)['revision'],2)
 def test_bad_model(self):
  for target in ['model2','motion1','unknown']:
   with self.assertRaises(a.ArrangementError):self.bind(1,target)
  self.assertEqual(a.read(self.root,self.catalog,self.pid)['revision'],1)
 def test_nonmotion_rejected(self):
  other=a.place(self.root,self.catalog,self.pid,'model1','model',0,1,1,self.assets)['clip']['id']
  with self.assertRaisesRegex(a.ArrangementError,'Only motion'):a.set_clip_target(self.root,self.catalog,self.pid,other,2,'model1',self.assets)
 def test_invalid_identifier(self):
  for value in ['',42]:
   with self.assertRaises(a.ArrangementError):self.bind(1,value)
 def test_mcp_registration(self):
  from pathlib import Path
  self.assertIn('bai_studio_clip_target_set',Path('mcp_server.py').read_text())
  self.assertIn('bai_studio_clip_target_set',Path('webmcp.js').read_text())
  self.assertIn('/api/studio/v05/arrangement/clip/target',Path('server.py').read_text())
if __name__=='__main__': unittest.main()
