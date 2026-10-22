import tempfile, unittest, json
from pathlib import Path
from studio_v05_focus_reports import read,save,FocusReportError
class TestReports(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.catalog=self.root/'catalog.json'
  self.catalog.write_text(json.dumps({'schema':1,'projects':[{'id':'p1'},{'id':'p2'}]}))
  self.report={'startFrame':1,'endFrame':2,'fps':30,'count':2,'maximumError':.2,'problemFrames':[{'frame':2,'reason':'out_of_focus','error':.2}],'evaluatedAgainstGPU':False}
 def tearDown(self):self.tmp.cleanup()
 def test_roundtrip(self):
  self.assertEqual(read(self.root/'reports',self.catalog,'p1')['revision'],0)
  out=save(self.root/'reports',self.catalog,'p1',0,self.report)
  self.assertEqual(out['revision'],1);self.assertEqual(len(read(self.root/'reports',self.catalog,'p1')['reports']),1)
  self.assertEqual(read(self.root/'reports',self.catalog,'p2')['reports'],[])
 def test_conflict(self):
  save(self.root/'reports',self.catalog,'p1',0,self.report)
  with self.assertRaises(FocusReportError):save(self.root/'reports',self.catalog,'p1',0,self.report)
 def test_invalid(self):
  for changes in ({'evaluatedAgainstGPU':True},{'maximumError':float('nan')},{'count':4},{'problemFrames':[{'frame':999,'reason':'fail'}]}):
   with self.subTest(changes=changes),self.assertRaises(FocusReportError):save(self.root/'reports',self.catalog,'p1',0,{**self.report,**changes})
 def test_corrupted_preserved(self):
  folder=self.root/'reports';folder.mkdir();(folder/'p1.json').write_text('bad')
  with self.assertRaises(FocusReportError):save(folder,self.catalog,'p1',0,self.report)
  self.assertEqual((folder/'p1.json').read_text(),'bad')
if __name__=='__main__':unittest.main()
