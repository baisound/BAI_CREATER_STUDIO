import tempfile, unittest
from pathlib import Path
from studio_project_catalog import create
from studio_v05_arrangement import place, timeline_view, ArrangementError

class TimelineViewTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.cat=self.root/'catalog.json'
  self.a=create(self.cat,'Project A')['id'];self.b=create(self.cat,'Project B')['id'];self.arr=self.root/'arr'
  self.items=[{'id':'x','name':'Walk.vmd','available':True,'kind':'motion'}]
 def tearDown(self):self.temp.cleanup()
 def test_empty(self):
  r=timeline_view(self.arr,self.cat,self.a)
  self.assertEqual((r['clip_count'],r['duration'],r['revision'],r['tracks']),(0,0,0,[]))
 def test_track_order_and_start_sort(self):
  place(self.arr,self.cat,self.a,'x','motion',10,2,0,self.items)
  place(self.arr,self.cat,self.a,'x','motion',3,4,1,self.items)
  place(self.arr,self.cat,self.a,'x','camera',8,3,2,self.items)
  r=timeline_view(self.arr,self.cat,self.a)
  self.assertEqual([x['track'] for x in r['tracks']],['camera','motion'])
  self.assertEqual([c['start'] for c in r['tracks'][1]['clips']],[3,10])
  self.assertEqual((r['duration'],r['clip_count'],r['revision']),(12,3,3))
 def test_separate_projects(self):
  place(self.arr,self.cat,self.a,'x','motion',0,5,0,self.items)
  self.assertEqual(timeline_view(self.arr,self.cat,self.b)['clip_count'],0)
 def test_invalid_project(self):
  with self.assertRaises(ArrangementError):timeline_view(self.arr,self.cat,'unknown')
if __name__=='__main__': unittest.main()
