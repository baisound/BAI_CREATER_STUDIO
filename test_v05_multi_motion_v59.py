"""Stage 59 regression and API contract checks."""
import json
import tempfile
import unittest
from pathlib import Path
from studio_project_catalog import create
from studio_v05_arrangement import place, read as read_arrangement
from studio_v05_scene_instances import mutate
from studio_v05_multi_motion import plan, assign, MultiMotionError

class MultiMotionV59Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        d=Path(self.tmp.name)
        self.catalog=d/'catalog.json';self.arr=d/'arr';self.scene=d/'scene';self.legacy=d/'legacy'
        self.p=create(self.catalog,"Scene A")['id']
        self.model={'id':'integrated:model.glb','source':'integrated','kind':'model','format':'GLB','filename':'model.glb','name':'Character','available':True}
        self.motion={'id':'integrated:dance.glb','source':'integrated','kind':'motion','format':'GLB','filename':'dance.glb','name':'dance.glb','available':True}
        self.assets=[self.model,self.motion]
        self.transform={'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]}
        self.one=mutate(self.scene,self.legacy,self.catalog,self.p,'add',0,self.assets,asset_id=self.model['id'],transform=self.transform)
        self.two=mutate(self.scene,self.legacy,self.catalog,self.p,'add',1,self.assets,asset_id=self.model['id'],transform=self.transform)
        self.ids=[row['id'] for row in self.two['instances']]
        self.a=place(self.arr,self.catalog,self.p,self.motion['id'],'motion',0,5,0,self.assets)
        self.b=place(self.arr,self.catalog,self.p,self.motion['id'],'motion',5,5,1,self.assets)
    def tearDown(self):self.tmp.cleanup()
    def assign(self,clip,revision,instance):
        return assign(self.arr,self.scene,self.legacy,self.catalog,self.p,clip,revision,instance,self.assets)
    def test_independent_assignment_save_and_read(self):
        c1=self.a['clip']['id'];c2=self.b['clip']['id']
        self.assign(c1,2,self.ids[0]);self.assign(c2,3,self.ids[1])
        data=read_arrangement(self.arr,self.catalog,self.p)
        self.assertEqual([x['target_scene_instance_id'] for x in data['clips']],self.ids)
        view=plan(self.arr,self.scene,self.legacy,self.catalog,self.p,self.assets)
        self.assertEqual(view['ready_count'],2)
        self.assertFalse(view['gpu_verified'])
        self.assertNotEqual(view['rows'][0]['target_scene_instance_id'],view['rows'][1]['target_scene_instance_id'])
    def test_revision_and_invalid_target_refused_without_write(self):
        path=self.arr/(self.p+'.json');before=path.read_bytes()
        with self.assertRaisesRegex(MultiMotionError,'conflict'):
            self.assign(self.a['clip']['id'],0,self.ids[0])
        with self.assertRaisesRegex(MultiMotionError,'not found'):
            self.assign(self.a['clip']['id'],2,'missing')
        self.assertEqual(path.read_bytes(),before)
    def test_unassigned_and_overlap_fail_closed(self):
        self.assign(self.a['clip']['id'],2,self.ids[0])
        self.assign(self.b['clip']['id'],3,self.ids[0])
        view=plan(self.arr,self.scene,self.legacy,self.catalog,self.p,self.assets)
        self.assertEqual(view['ready_count'],2)
        # Start of second clip is exactly the end of first -- no overlap
        self.assertTrue(all(row['status']=='ready' for row in view['rows']))
    def test_cross_project_target_refused(self):
        other=create(self.catalog,'Other')['id']
        otherclip=place(self.arr,self.catalog,other,self.motion['id'],'motion',0,5,0,self.assets)['clip']['id']
        with self.assertRaisesRegex(MultiMotionError,'not found'):
            assign(self.arr,self.scene,self.legacy,self.catalog,other,otherclip,1,self.ids[0],self.assets)
    def test_http_plan_and_assignment(self):
        import threading
        import urllib.request
        from http.server import ThreadingHTTPServer
        from unittest.mock import patch
        import server
        class Quiet(server.Handler):
            def log_message(self,*args): pass
        d=Path(self.tmp.name)
        data=d/'service'
        data.mkdir(exist_ok=True)
        self.catalog.replace(data/'studio_v05_catalog.json')
        # Move the project catalog into the server's layout only for this test.
        self.catalog=data/'studio_v05_catalog.json'
        import shutil
        shutil.copytree(self.arr,data/'studio_v05_arrangements')
        shutil.copytree(self.scene,data/'studio_v05_scene_instances')
        self.arr=data/'studio_v05_arrangements'
        self.scene=data/'studio_v05_scene_instances'
        with patch.object(server,'DATA',data),patch.object(server,'unified_assets',return_value=self.assets):
            api=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
            task=threading.Thread(target=api.serve_forever,daemon=True);task.start()
            try:
                base=f'http://127.0.0.1:{api.server_port}/api/studio/v05/scene'
                with urllib.request.urlopen(base+'/multi-motion-plan?id='+self.p,timeout=3) as res:
                    self.assertEqual(json.load(res)['ready_count'],0)
                body={'project_id':self.p,'clip_id':self.a['clip']['id'],'revision':2,'instance_id':self.ids[0]}
                request=urllib.request.Request(base+'/motion-target',data=json.dumps(body).encode(),method='POST',headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(request,timeout=3) as res:
                    self.assertEqual(json.load(res)['revision'],3)
                with urllib.request.urlopen(base+'/multi-motion-plan?id='+self.p,timeout=3) as res:
                    self.assertEqual(json.load(res)['ready_count'],1)
            finally:
                api.shutdown();task.join(timeout=4);api.server_close()
    def test_source_contract(self):
        base=Path(__file__).parent
        for name in ['server.py','mcp_server.py','webmcp.js']:
            content=(base/name).read_text()
            self.assertIn('bai_studio_scene_motion_target_set' if name!='server.py' else '/api/studio/v05/scene/motion-target',content)
        for lang in ('jp','en'):
            self.assertIn('assignMotion',json.loads((base/f'studio/v05/locales/{lang}.json').read_text())['v58'])
if __name__=='__main__': unittest.main()
