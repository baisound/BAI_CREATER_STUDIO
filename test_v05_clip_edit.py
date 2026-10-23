import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import studio_v05_arrangement as a
class ClipEdits(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.catalog=self.root/'catalog.json';self.project='p-1'
  self.catalog.write_text('{"projects":[{"id":"p-1","name":"Demo"}]}')
  self.mock=patch.object(a,'load_catalog',return_value={'projects':[{'id':'p-1'}]});self.mock.start()
  self.assets=[{'id':'a1','name':'dance.vmd','available':True}]
  self.placed=a.place(self.root,self.catalog,self.project,'a1','motion',1,5,0,self.assets)
 def tearDown(self):self.mock.stop();self.temp.cleanup()
 def test_update(self):
  c=self.placed['clip'];out=a.edit_clip(self.root,self.catalog,self.project,c['id'],1,'update',start=2,duration=3,track='camera');self.assertEqual(out['revision'],2);self.assertEqual(a.read(self.root,self.catalog,self.project)['clips'][0]['track'],'camera')
 def test_delete(self):
  c=self.placed['clip'];a.edit_clip(self.root,self.catalog,self.project,c['id'],1,'delete');self.assertEqual(a.read(self.root,self.catalog,self.project)['clips'],[])
 def test_conflict_preserves(self):
  c=self.placed['clip'];self.assertRaisesRegex(a.ArrangementError,'conflict',a.edit_clip,self.root,self.catalog,self.project,c['id'],0,'delete');self.assertEqual(len(a.read(self.root,self.catalog,self.project)['clips']),1)
 def test_invalid_duration(self):
  c=self.placed['clip'];self.assertRaises(a.ArrangementError,a.edit_clip,self.root,self.catalog,self.project,c['id'],1,'update',start=0,duration=0,track='motion')
 def test_invalid_track(self):
  c=self.placed['clip'];self.assertRaises(a.ArrangementError,a.edit_clip,self.root,self.catalog,self.project,c['id'],1,'update',start=0,duration=1,track='bogus')
 def test_missing_clip(self):self.assertRaisesRegex(a.ArrangementError,'not found',a.edit_clip,self.root,self.catalog,self.project,'absent',1,'delete')
if __name__=='__main__':unittest.main()
