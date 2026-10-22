import tempfile, unittest, json
from pathlib import Path
from studio_project_catalog import create
from studio_project_snapshots import save
from studio_project_activation import preview,activate,ActivationConflict
from project_state_bundle import save_bundle,read_bundle,bundle_revision
from bai_camera import DEFAULT
class ActivationTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.r=Path(self.t.name);self.c=self.r/'catalog.json';self.id=create(self.c,'Test')['id'];self.live=self.r/'live.json';self.cam=self.r/'camera.json';self.snap=self.r/'snap';self.back=self.r/'backup'
  self.bundle={'schema':1,'combination':{'schema':1,'timeline':[],'history':[],'cursor':-1},'camera':DEFAULT}
  save_bundle(self.live,self.cam,self.bundle)
  other=json.loads(json.dumps(self.bundle));other['combination']['timeline']=[{'name':'dance'}]
  save(self.snap,self.c,self.id,other)
 def tearDown(self):self.t.cleanup()
 def test_preview_no_mutation(self):
  before=self.live.read_bytes();p=preview(self.snap,self.c,self.id,self.live,self.cam)
  self.assertTrue(p['changes']['combination']);self.assertEqual(self.live.read_bytes(),before)
 def test_requires_revision(self):
  with self.assertRaises(ActivationConflict):activate(self.snap,self.c,self.id,self.live,self.cam,self.back,'')
 def test_conflict_no_backup(self):
  with self.assertRaises(ActivationConflict):activate(self.snap,self.c,self.id,self.live,self.cam,self.back,'stale')
  self.assertFalse(self.back.exists())
 def test_activation_backup(self):
  p=preview(self.snap,self.c,self.id,self.live,self.cam)
  res=activate(self.snap,self.c,self.id,self.live,self.cam,self.back,p['expected_revision'])
  self.assertTrue(res['ok']);self.assertEqual(read_bundle(self.live,self.cam)['combination']['timeline'],[{'name':'dance'}])
  backups=list(self.back.glob('*.json'));self.assertEqual(len(backups),1)
  self.assertEqual(json.loads(backups[0].read_text())['bundle']['combination']['timeline'],[])
if __name__=='__main__':unittest.main()
