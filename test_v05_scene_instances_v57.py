"""v57 shared scene instance persistence, legacy seed and API/agent contract."""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from studio_project_catalog import create
from studio_v05_scene_model import set_model, read as legacy_read
from studio_v05_scene_instances import read, mutate, SceneInstancesError, LEGACY_ID

class MultiSceneV57(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.data = Path(self.t.name)
        self.catalog = self.data / 'studio_v05_catalog.json'
        self.legacy = self.data / 'studio_v05_scene_models'
        self.store = self.data / 'studio_v05_scene_instances'
        self.p = create(self.catalog,'Scene A')['id']
        self.other = create(self.catalog,'Scene B')['id']
        self.a = {'id':'integrated:model.glb','source':'integrated','kind':'model','format':'GLB',
                  'filename':'model.glb','available':True,'name':'Character'}
        self.assets=[self.a]
        self.tr={'position':[3,2,1],'rotation':[0,90,0],'scale':[1,1,1]}
    def tearDown(self):self.t.cleanup()
    def mutate(self,pid=None,**kwargs):
        return mutate(self.store,self.legacy,self.catalog,pid or self.p,assets=self.assets,**kwargs)
    def test_multiple_instances_from_same_asset_are_independent(self):
        one=self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        two=self.mutate(action='add',revision=1,asset_id=self.a['id'],transform=self.tr)
        ids=[x['id'] for x in two['instances']]
        self.assertNotEqual(*ids)
        self.assertEqual(two['revision'],2)
        new=dict(self.tr,position=[13,2,1])
        updated=self.mutate(action='update',revision=2,instance_id=ids[0],transform=new)
        self.assertEqual(updated['instances'][0]['transform']['position'],[13,2,1])
        self.assertEqual(updated['instances'][1]['transform']['position'],[3,2,1])
        self.assertEqual(read(self.store,self.legacy,self.catalog,self.other,self.assets)['instances'],[])
        self.assertFalse(updated['renderer_ready'])
    def test_legacy_data_is_seeded_not_destroyed(self):
        set_model(self.legacy,self.catalog,self.p,self.a['id'],self.tr,0,self.assets)
        before=(self.legacy/(self.p+'.json')).read_bytes()
        first=read(self.store,self.legacy,self.catalog,self.p,self.assets)
        self.assertEqual(first['instances'][0]['id'],LEGACY_ID)
        self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        self.assertEqual((self.legacy/(self.p+'.json')).read_bytes(),before)
        set_model(self.legacy,self.catalog,self.p,None,None,1,self.assets)
        with self.assertRaisesRegex(SceneInstancesError,"reconcile"):
            read(self.store,self.legacy,self.catalog,self.p,self.assets)
    def test_lock_conflict_and_remove(self):
        r=self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        id=r['instances'][0]['id']
        self.mutate(action='update',revision=1,instance_id=id,locked=True)
        with self.assertRaisesRegex(SceneInstancesError,'locked'):
            self.mutate(action='remove',revision=2,instance_id=id)
        self.mutate(action='update',revision=2,instance_id=id,locked=False)
        out=self.mutate(action='remove',revision=3,instance_id=id)
        self.assertEqual(out['instances'],[])
    def test_saved_camera_is_revisioned_and_legacy_scene_is_compatible(self):
        self.assertIsNone(read(self.store,self.legacy,self.catalog,self.p,self.assets)['camera'])
        old={'schema':1,'project_id':self.p,'revision':0,'legacy_revision':0,'instances':[]}
        self.store.mkdir()
        (self.store/(self.p+'.json')).write_text(json.dumps(old),encoding='utf-8')
        self.assertIsNone(read(self.store,self.legacy,self.catalog,self.p,self.assets)['camera'])
        pose={'position':[3,2,5],'target':[0,1,0],'fov':42}
        saved=self.mutate(action='camera',revision=0,camera=pose)
        self.assertEqual(saved['camera'],pose)
        self.assertEqual(saved['revision'],1)
        before=(self.store/(self.p+'.json')).read_bytes()
        with self.assertRaisesRegex(SceneInstancesError,'conflict'):
            self.mutate(action='camera',revision=0,camera=pose)
        for invalid in ({**pose,'position':[0,1,0]}, {**pose,'fov':float('nan')},
                        {**pose,'target':[0,1,0],'position':[0,1,0]},
                        {**pose,'fov':130}):
            with self.assertRaises(SceneInstancesError):
                self.mutate(action='camera',revision=1,camera=invalid)
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
        another=self.mutate(action='add',revision=1,asset_id=self.a['id'],transform=self.tr)
        self.assertEqual(another['camera'],pose)
        self.assertIsNone(read(self.store,self.legacy,self.catalog,self.other,self.assets)['camera'])
    def test_reject_invalid_and_preserve(self):
        r=self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        before=(self.store/(self.p+'.json')).read_bytes()
        with self.assertRaisesRegex(SceneInstancesError,'conflict'):
            self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        with self.assertRaises(SceneInstancesError):
            self.mutate(action='add',revision=1,asset_id='../missing',transform=self.tr)
        with self.assertRaises(SceneInstancesError):
            self.mutate(action='update',revision=1,instance_id=r['instances'][0]['id'],
                        transform={**self.tr,'position':[float('nan'),0,0]})
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
        with self.assertRaises(SceneInstancesError):
            self.mutate(self.other,action='remove',revision=0,instance_id=r['instances'][0]['id'])
    def test_corrupt_file_never_overwritten(self):
        self.store.mkdir()
        file=self.store/(self.p+'.json')
        file.write_text('{"schema":10}',encoding='utf-8')
        with self.assertRaises(SceneInstancesError):
            self.mutate(action='add',revision=0,asset_id=self.a['id'],transform=self.tr)
        self.assertEqual(file.read_text(), '{"schema":10}')
    def test_http_and_agent_routes(self):
        import server
        class Quiet(server.Handler):
            def log_message(self,*args):pass
        api=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
        with patch.object(server,'DATA',self.data),patch.object(server,'unified_assets',return_value=self.assets):
            thr=threading.Thread(target=api.serve_forever,daemon=True);thr.start()
            u=f'http://127.0.0.1:{api.server_port}/api/studio/v05/scene/instances'
            try:
                with urllib.request.urlopen(u+'?id='+self.p,timeout=3) as res: self.assertEqual(json.load(res)['revision'],0)
                payload={'project_id':self.p,'action':'add','revision':0,'asset_id':self.a['id'],'transform':self.tr}
                req=urllib.request.Request(u,data=json.dumps(payload).encode(),method='POST',headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=3) as res: self.assertEqual(len(json.load(res)['instances']),1)
                with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(req,timeout=3)
                self.assertEqual(ctx.exception.code,409)
                pose={'position':[4,3,6],'target':[0,1,0],'fov':38}
                camera={'project_id':self.p,'action':'camera','revision':1,'camera':pose}
                req=urllib.request.Request(u,data=json.dumps(camera).encode(),method='POST',headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=3) as res: self.assertEqual(json.load(res)['camera'],pose)
            finally:
                api.shutdown();thr.join(timeout=4);api.server_close()
        for p in ['mcp_server.py','webmcp.js']:
            content=(Path(__file__).parent/p).read_text(encoding='utf-8')
            self.assertIn('bai_studio_scene_instances_get',content)
            self.assertIn('bai_studio_scene_instances_mutate',content)
        self.assertIn('scene-instances-v57.js',(Path(__file__).parent/'studio/v05/index.html').read_text(encoding='utf-8'))
        for language in ['jp','en']:
            self.assertIn('v57',json.loads((Path(__file__).parent/'studio/v05/locales'/f'{language}.json').read_text(encoding='utf-8')))

if __name__=='__main__':unittest.main()
