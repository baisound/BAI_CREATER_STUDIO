import tempfile,unittest,json
from pathlib import Path
from studio_project_catalog import create
from studio_v05_arrangement import inventory,place,read,edit_clip,timeline_view,ArrangementError,TRACKS
from studio_v05_track_layout import add_image_lane,remove_image_lane,update as update_layout,get as get_layout
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.cat=self.root/'catalog.json';self.project=create(self.cat,'Demo');self.items=[{'id':'lib:abc','name':'Dance.vmd','kind':'motions','available':True,'source':'library'},{'id':'lib:missing','name':'Camera.vmd','available':False}]
 def tearDown(self):self.tmp.cleanup()
 def test_category_search(self):
  r=inventory(self.items,'motion','DANCE');self.assertEqual(r['count'],1)
 def test_unknown_category(self):
  with self.assertRaises(ArrangementError):inventory(self.items,'invalid')
 def test_initial_is_empty(self):self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['revision'],0)
 def test_place_and_reopen(self):
  result=place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',3.5,6,0,self.items)
  self.assertEqual(result['revision'],1);self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['clips'][0]['start'],3.5)
 def test_revision_conflict(self):
  place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',0,3,0,self.items)
  with self.assertRaisesRegex(ArrangementError,'conflict'):place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',0,3,0,self.items)
 def test_unregistered_no_mutation(self):
  with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'unregistered','motion',0,5,0,self.items)
  self.assertEqual(read(self.root/'arr',self.cat,self.project['id'])['clips'],[])
 def test_missing_asset_rejected(self):
  with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'lib:missing','camera',0,5,0,self.items)
 def test_invalid_time(self):
  for bad in [-1,float('nan'),float('inf'),True]:
   with self.assertRaises(ArrangementError):place(self.root/'arr',self.cat,self.project['id'],'lib:abc','motion',bad,5,0,self.items)
 def test_other_project_rejected(self):
  with self.assertRaises(ArrangementError):read(self.root/'arr',self.cat,'other')
 def test_corrupt_preserved(self):
  d=self.root/'arr';d.mkdir();f=d/(self.project['id']+'.json');f.write_text('{oops')
  with self.assertRaises(ValueError):read(d,self.cat,self.project['id'])
  self.assertEqual(f.read_text(),'{oops')
 def test_image_lanes_validate_and_old_clip_defaults_to_one(self):
  pid=self.project['id'];layout=self.root/'layout';items=[{'id':'lib:image','name':'frame.webp','available':True}]
  first=place(self.root/'arr',self.cat,pid,'lib:image','image',1,3,0,items,layout_root=layout)
  self.assertEqual(first['clip']['lane'],1)
  with self.assertRaisesRegex(ArrangementError,'does not exist'):
   place(self.root/'arr',self.cat,pid,'lib:image','image',4,3,1,items,layout_root=layout,lane=2)
  add_image_lane(layout,self.cat,pid,0)
  second=place(self.root/'arr',self.cat,pid,'lib:image','image',4,3,1,items,layout_root=layout,lane=2)
  self.assertEqual(second['clip']['lane'],2)
  with self.assertRaisesRegex(ArrangementError,'Invalid lane'):
   edit_clip(self.root/'arr',self.cat,pid,second['clip']['id'],2,'update',start=4,duration=3,track='image',lane=0,layout_root=layout)
  self.assertEqual(get_layout(layout,self.cat,pid)['image_lanes'],2)
  data=read(self.root/'arr',self.cat,pid);data['clips'][0].pop('lane');(self.root/'arr'/(pid+'.json')).write_text(json.dumps(data))
  self.assertEqual([c.get('lane',1) for c in timeline_view(self.root/'arr',self.cat,pid)['tracks'][0]['clips']],[1,2])
 def test_image_lane_ids_survive_deletion_and_are_never_reused(self):
  pid=self.project['id'];layout=self.root/'layout';arr=self.root/'arr';items=[{'id':'lib:image','name':'frame.webp','available':True}]
  old={'project_id':pid,'revision':0,'order':sorted(TRACKS),'heights':{},'locked':[],'muted':[],'image_lanes':2}
  layout.mkdir();(layout/(pid+'.json')).write_text(json.dumps(old))
  self.assertEqual(get_layout(layout,self.cat,pid)['image_lane_ids'],[1,2])
  third=add_image_lane(layout,self.cat,pid,0)
  self.assertEqual(third['image_lane_ids'],[1,2,3])
  clip=place(arr,self.cat,pid,'lib:image','image',2,4,0,items,layout_root=layout,lane=3)['clip']
  with self.assertRaisesRegex(ArrangementError,'clips'):
   remove_image_lane(layout,self.cat,arr,pid,1,3)
  with self.assertRaisesRegex(ArrangementError,'conflict'):
   remove_image_lane(layout,self.cat,arr,pid,0,2)
  removed=remove_image_lane(layout,self.cat,arr,pid,1,2)
  self.assertEqual(removed['image_lane_ids'],[1,3]);self.assertEqual(removed['image_lanes'],2)
  self.assertEqual(removed['next_image_lane_id'],4)
  self.assertEqual(read(arr,self.cat,pid)['clips'][0],clip)
  self.assertEqual(get_layout(layout,self.cat,pid)['image_lane_ids'],[1,3])
  with self.assertRaisesRegex(ArrangementError,'does not exist'):
   place(arr,self.cat,pid,'lib:image','image',0,1,1,items,layout_root=layout,lane=2)
  self.assertEqual(add_image_lane(layout,self.cat,pid,2)['image_lane_ids'],[1,3,4])
  updated=update_layout(layout,self.cat,pid,3,list(reversed(third['order'])),{})
  self.assertEqual(updated['image_lane_ids'],[1,3,4]);self.assertEqual(updated['next_image_lane_id'],5)
  single=self.root/'single'
  with self.assertRaisesRegex(ArrangementError,'last image lane'):
   remove_image_lane(single,self.cat,arr,pid,0,1)
if __name__=='__main__':unittest.main()
