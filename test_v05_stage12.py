import tempfile,unittest
from pathlib import Path
from studio_project_catalog import _atomic
from studio_v05_arrangement import batch_move,edit_clip,read,ArrangementError
from studio_v05_track_layout import set_flags
class Stage12(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.cat=self.root/'catalog.json';_atomic(self.cat,{'schema':1,'revision':0,'projects':[{'id':'one','name':'One'}]})
  self.arr=self.root/'arr';self.arr.mkdir();self.layout=self.root/'layout';_atomic(self.arr/'one.json',{'schema':1,'project_id':'one','revision':0,'clips':[{'id':'a','track':'motion','start':0,'duration':3},{'id':'b','track':'camera','start':2,'duration':3}]})
 def test_locked_source_rejects_batch(self):
  set_flags(self.layout,self.cat,'one',0,['motion'],[])
  with self.assertRaisesRegex(ArrangementError,'locked'):batch_move(self.arr,self.cat,'one',0,[{'clip_id':'a','track':'motion','start':1,'duration':3}],layout_root=self.layout)
  self.assertEqual(read(self.arr,self.cat,'one')['revision'],0)
 def test_locked_destination_rejects_batch(self):
  set_flags(self.layout,self.cat,'one',0,['motion'],[])
  with self.assertRaisesRegex(ArrangementError,'locked'):batch_move(self.arr,self.cat,'one',0,[{'clip_id':'b','track':'motion','start':1,'duration':3}],layout_root=self.layout)
 def test_locked_delete_rejected(self):
  set_flags(self.layout,self.cat,'one',0,['camera'],[])
  with self.assertRaisesRegex(ArrangementError,'locked'):edit_clip(self.arr,self.cat,'one','b',0,'delete',layout_root=self.layout)
 def test_unlocked_move_works(self):
  set_flags(self.layout,self.cat,'one',0,['camera'],[])
  result=batch_move(self.arr,self.cat,'one',0,[{'clip_id':'a','track':'motion','start':2,'duration':3}],layout_root=self.layout)
  self.assertEqual(result['updated'],1)
 def test_mute_does_not_lock(self):
  set_flags(self.layout,self.cat,'one',0,[],['motion'])
  result=edit_clip(self.arr,self.cat,'one','a',0,'update',start=4,duration=3,track='motion',layout_root=self.layout)
  self.assertEqual(result['revision'],1)
if __name__=='__main__':unittest.main()
