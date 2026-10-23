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
from studio_v05_track_layout import set_flags

class MultiSceneV57(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.data = Path(self.t.name)
        self.catalog = self.data / 'studio_v05_catalog.json'
        self.legacy = self.data / 'studio_v05_scene_models'
        self.store = self.data / 'studio_v05_scene_instances'
        self.layout = self.data / 'studio_v05_track_layouts'
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
    def test_face_keys_are_revisioned_and_do_not_modify_source(self):
        pmx={**self.a,'id':'mmd:A:face.pmx','source':'mmd','kind':'A',
             'format':'PMX','filename':'face.pmx'}
        self.assets.append(pmx)
        added=self.mutate(action='add',revision=0,asset_id=pmx['id'],transform=self.tr)
        instance=added['instances'][0]['id']
        key={'instance_id':instance,'morph_name':'髙・あ','time':1.5,'value':0.75}
        with self.assertRaisesRegex(SceneInstancesError,'not present'):
            self.mutate(action='face-set',revision=1,face_key=key,
                        morph_lookup=lambda source:{'まばたき'})
        saved=self.mutate(action='face-set',revision=1,face_key=key,
                          morph_lookup=lambda source:{'髙・あ'})
        expected=[{**key,'track':'expression'}]
        self.assertEqual(saved['face_keys'],expected)
        self.assertEqual(read(self.store,self.legacy,self.catalog,self.p,self.assets)['face_keys'],expected)
        before=(self.store/(self.p+'.json')).read_bytes()
        for invalid in ({**key,'value':1.1},{**key,'time':float('nan')},
                        {**key,'morph_name':''},{**key,'value':True}):
            with self.assertRaises(SceneInstancesError):
                self.mutate(action='face-set',revision=2,face_key=invalid)
        with self.assertRaisesRegex(SceneInstancesError,'conflict'):
            self.mutate(action='face-set',revision=1,face_key=key)
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
        self.assets.remove(pmx)
        removed=self.mutate(action='face-remove',revision=2,face_key={k:key[k] for k in
            ('instance_id','morph_name','time')},morph_lookup=lambda source: (_ for _ in ()).throw(ValueError('missing')))
        self.assertEqual(removed['face_keys'],[])
        with self.assertRaises(SceneInstancesError):
            self.mutate(action='face-remove',revision=3,face_key={k:key[k] for k in
                ('instance_id','morph_name','time')})
        self.assets.append(pmx)
        saved=self.mutate(action='face-set',revision=3,face_key=key)
        gone=self.mutate(action='remove',revision=saved['revision'],instance_id=instance)
        self.assertEqual(gone['face_keys'],[])
    def test_face_key_move_keeps_track_value_and_rejects_collision(self):
        pmx={**self.a,'id':'mmd:A:face.pmx','source':'mmd','kind':'A',
             'format':'PMX','filename':'face.pmx'}
        self.assets.append(pmx)
        added=self.mutate(action='add',revision=0,asset_id=pmx['id'],transform=self.tr)
        instance=added['instances'][0]['id']
        base={'instance_id':instance,'morph_name':'あ','value':0.8,'track':'lip'}
        first=self.mutate(action='face-set',revision=1,face_key={**base,'time':0})
        second=self.mutate(action='face-set',revision=2,face_key={**base,'time':2,'value':0})
        moved=self.mutate(action='face-move',revision=3,
                          face_key={'instance_id':instance,'morph_name':'あ','time':0,'to_time':1})
        self.assertEqual([(x['time'],x['value'],x['track']) for x in moved['face_keys']],
                         [(1,0.8,'lip'),(2,0.0,'lip')])
        before=(self.store/(self.p+'.json')).read_bytes()
        with self.assertRaisesRegex(SceneInstancesError,'destination'):
            self.mutate(action='face-move',revision=4,
                        face_key={'instance_id':instance,'morph_name':'あ','time':1,'to_time':2})
        with self.assertRaises(SceneInstancesError):
            self.mutate(action='face-move',revision=4,
                        face_key={'instance_id':instance,'morph_name':'あ','time':1,'to_time':float('nan')})
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
    def test_locked_face_track_rejects_edits_and_track_transfer(self):
        pmx={**self.a,'id':'mmd:A:face.pmx','source':'mmd','kind':'A',
             'format':'PMX','filename':'face.pmx'}
        self.assets.append(pmx)
        added=self.mutate(action='add',revision=0,asset_id=pmx['id'],transform=self.tr)
        instance=added['instances'][0]['id']
        key={'instance_id':instance,'morph_name':'あ','time':1,'value':0.8,'track':'lip'}
        saved=self.mutate(action='face-set',revision=1,face_key=key,layout_root=self.layout)
        set_flags(self.layout,self.catalog,self.p,0,['lip'],[])
        before=(self.store/(self.p+'.json')).read_bytes()
        with self.assertRaisesRegex(SceneInstancesError,'locked'):
            self.mutate(action='face-move',revision=2,layout_root=self.layout,
                        face_key={'instance_id':instance,'morph_name':'あ','time':1,'to_time':2})
        with self.assertRaisesRegex(SceneInstancesError,'locked'):
            self.mutate(action='face-remove',revision=2,layout_root=self.layout,
                        face_key={'instance_id':instance,'morph_name':'あ','time':1})
        with self.assertRaisesRegex(SceneInstancesError,'locked'):
            self.mutate(action='face-set',revision=2,layout_root=self.layout,
                        face_key={**key,'track':'expression'})
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
        set_flags(self.layout,self.catalog,self.p,1,[],[])
        moved=self.mutate(action='face-move',revision=2,layout_root=self.layout,
                          face_key={'instance_id':instance,'morph_name':'あ','time':1,'to_time':2})
        self.assertEqual(moved['face_keys'][0]['time'],2)
    def test_face_undo_redo_survive_reload_and_reject_stale_or_locked(self):
        pmx={**self.a,'id':'mmd:A:face.pmx','source':'mmd','kind':'A',
             'format':'PMX','filename':'face.pmx'}
        self.assets.append(pmx)
        added=self.mutate(action='add',revision=0,asset_id=pmx['id'],transform=self.tr)
        instance=added['instances'][0]['id']
        key={'instance_id':instance,'morph_name':'あ','time':1,'value':0.8,'track':'lip'}
        saved=self.mutate(action='face-set',revision=1,face_key=key,layout_root=self.layout)
        moved=self.mutate(action='face-move',revision=2,layout_root=self.layout,
                          face_key={'instance_id':instance,'morph_name':'あ','time':1,'to_time':2})
        self.assertEqual(moved['face_keys'][0]['time'],2)
        self.assertEqual(len(read(self.store,self.legacy,self.catalog,self.p)['face_history']['undo']),2)
        with self.assertRaisesRegex(SceneInstancesError,'conflict'):
            self.mutate(action='face-undo',revision=2,layout_root=self.layout)
        set_flags(self.layout,self.catalog,self.p,0,['lip'],[])
        before=(self.store/(self.p+'.json')).read_bytes()
        with self.assertRaisesRegex(SceneInstancesError,'locked'):
            self.mutate(action='face-undo',revision=3,layout_root=self.layout)
        self.assertEqual((self.store/(self.p+'.json')).read_bytes(),before)
        set_flags(self.layout,self.catalog,self.p,1,[],[])
        undone_move=self.mutate(action='face-undo',revision=3,layout_root=self.layout)
        self.assertEqual(undone_move['face_keys'][0]['time'],1)
        undone_add=self.mutate(action='face-undo',revision=4,layout_root=self.layout)
        self.assertEqual(undone_add['face_keys'],[])
        self.assertEqual(len(undone_add['face_history']['redo']),2)
        redone_add=self.mutate(action='face-redo',revision=5,layout_root=self.layout)
        self.assertEqual(redone_add['face_keys'][0]['value'],0.8)
        redone_move=self.mutate(action='face-redo',revision=6,layout_root=self.layout)
        self.assertEqual(redone_move['face_keys'][0]['time'],2)
        removed=self.mutate(action='face-remove',revision=7,layout_root=self.layout,
                            face_key={'instance_id':instance,'morph_name':'あ','time':2})
        self.assertEqual(removed['face_keys'],[])
        restored=self.mutate(action='face-undo',revision=8,layout_root=self.layout)
        self.assertEqual(restored['face_keys'][0]['time'],2)
        self.mutate(action='face-set',revision=9,layout_root=self.layout,
                    face_key={**key,'time':3})
        with self.assertRaisesRegex(SceneInstancesError,'No face history'):
            self.mutate(action='face-redo',revision=10,layout_root=self.layout)
        changed=self.mutate(action='face-set',revision=10,layout_root=self.layout,
                            face_key={**key,'time':3,'value':0.2,'track':'expression'})
        self.assertEqual([(x['time'],x['value'],x['track']) for x in changed['face_keys'] if x['time']==3],
                         [(3,0.2,'expression')])
        reverted=self.mutate(action='face-undo',revision=11,layout_root=self.layout)
        self.assertEqual([(x['value'],x['track']) for x in reverted['face_keys'] if x['time']==3],
                         [(0.8,'lip')])
        repeated=self.mutate(action='face-redo',revision=12,layout_root=self.layout)
        self.assertEqual([(x['value'],x['track']) for x in repeated['face_keys'] if x['time']==3],
                         [(0.2,'expression')])
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
