import unittest,tempfile
from pathlib import Path
from studio_project_catalog import _atomic
from studio_v05_arrangement import batch_move,undo_batch,read,ArrangementError
from studio_v05_track_layout import get,set_flags
class Stage11(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.catalog=self.root/'catalog.json';_atomic(self.catalog,{'schema':1,'revision':0,'projects':[{'id':'a','name':'Test'}]});self.arr=self.root/'arr';self.arr.mkdir();self.layout=self.root/'layout';_atomic(self.arr/'a.json',{'schema':1,'project_id':'a','revision':0,'clips':[{'id':'c1','track':'motion','start':0,'duration':10},{'id':'c2','track':'camera','start':3,'duration':5}]})
 def tearDown(self):self.temp.cleanup()
 def test_batch_undo(self):
  result=batch_move(self.arr,self.catalog,'a',0,[{'clip_id':'c1','start':8,'duration':10,'track':'motion'},{'clip_id':'c2','start':11,'duration':4,'track':'camera'}]);self.assertEqual(result['updated'],2);self.assertEqual(read(self.arr,self.catalog,'a')['clips'][0]['start'],8);undo_batch(self.arr,self.catalog,'a',1);self.assertEqual(read(self.arr,self.catalog,'a')['clips'][0]['start'],0)
 def test_conflict(self):
  with self.assertRaisesRegex(ArrangementError,'conflict'):batch_move(self.arr,self.catalog,'a',7,[{'clip_id':'c1','start':1,'duration':10,'track':'motion'}])
 def test_atomic_reject_missing(self):
  with self.assertRaisesRegex(ArrangementError,'not found'):batch_move(self.arr,self.catalog,'a',0,[{'clip_id':'c1','start':8,'duration':10,'track':'motion'},{'clip_id':'absent','start':1,'duration':1,'track':'camera'}]);self.assertEqual(read(self.arr,self.catalog,'a')['revision'],0)
 def test_duplicate(self):
  e={'clip_id':'c1','start':2,'duration':1,'track':'motion'}
  with self.assertRaisesRegex(ArrangementError,'Duplicate'):batch_move(self.arr,self.catalog,'a',0,[e,e])
 def test_lock_flags(self):
  d=set_flags(self.layout,self.catalog,'a',0,['motion'],['audio']);self.assertEqual(d['revision'],1);self.assertEqual(get(self.layout,self.catalog,'a')['locked'],['motion'])
 def test_flag_conflict(self):
  set_flags(self.layout,self.catalog,'a',0,[],[])
  with self.assertRaisesRegex(ArrangementError,'conflict'):set_flags(self.layout,self.catalog,'a',0,[],[])
if __name__=='__main__':unittest.main()
