import tempfile, unittest
from pathlib import Path
from studio_project_catalog import _atomic
from studio_v05_track_layout import get,update
from studio_v05_arrangement import TRACKS,ArrangementError
class TrackLayoutTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.catalog=self.root/'catalog.json';_atomic(self.catalog,{'schema':1,'revision':0,'projects':[{'id':'a','name':'a'}]});self.folder=self.root/'layouts'
 def tearDown(self):self.tmp.cleanup()
 def test_initial(self):
  d=get(self.folder,self.catalog,'a');self.assertEqual(set(d['order']),TRACKS)
 def test_save_roundtrip(self):
  order=list(reversed(sorted(TRACKS)));d=update(self.folder,self.catalog,'a',0,order,{'camera':72});self.assertEqual(d['revision'],1);self.assertEqual(get(self.folder,self.catalog,'a')['heights']['camera'],72)
 def test_conflict(self):
  order=sorted(TRACKS);update(self.folder,self.catalog,'a',0,order,{})
  with self.assertRaisesRegex(ArrangementError,'conflict'):update(self.folder,self.catalog,'a',0,order,{})
 def test_duplicates(self):
  order=sorted(TRACKS);order[0]=order[1]
  with self.assertRaises(ArrangementError):update(self.folder,self.catalog,'a',0,order,{})
 def test_invalid_height(self):
  with self.assertRaises(ArrangementError):update(self.folder,self.catalog,'a',0,sorted(TRACKS),{'camera':999})
 def test_unknown_project(self):
  with self.assertRaises(ArrangementError):get(self.folder,self.catalog,'bad')
if __name__=='__main__':unittest.main()
