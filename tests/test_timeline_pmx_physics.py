import copy
import json
import pytest
from bai_studio.projects.catalog import create
from bai_studio.v05.timeline.scene_instances import read,mutate,SceneInstancesError


def test_physics_is_per_instance_opt_in_persisted_and_guarded(tmp_path):
    catalog=tmp_path/'studio_v05_catalog.json';pid=create(catalog,'physics')['id']
    store=tmp_path/'studio_v05_scene_instances';legacy=tmp_path/'studio_v05_scene_models'
    pmx={'id':'generated.pmx','format':'PMX','available':True,'kind':'A','source':'mmd'}
    glb={**pmx,'id':'stage.glb','format':'GLB','source':'library','kind':'stage'};assets=[pmx,glb]
    def change(action,revision,**kw):return mutate(store,legacy,catalog,pid,action,revision,assets,**kw)
    assert read(store,legacy,catalog,pid,assets)['physics']=={}
    first=change('add',0,asset_id=pmx['id'],transform={'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]});rid=first['instances'][0]['id']
    enabled=change('physics',1,instance_id=rid,physics_enabled=True)
    assert enabled['physics'][rid]=={'enabled':True,'asset_id':pmx['id'],'solver':'mmd-fixed60-v1'}
    assert read(store,legacy,catalog,pid,assets)['physics']==enabled['physics']
    before=(store/(pid+'.json')).read_bytes()
    for args in [dict(action='physics',revision=1,instance_id=rid,physics_enabled=False),dict(action='physics',revision=2,instance_id=rid,physics_enabled=1),dict(action='update',revision=2,instance_id=rid,physics_enabled=True,visible=False),dict(action='update',revision=2,instance_id=rid,transform={'position':[0,0,0],'rotation':[0,0,0],'scale':[1,2,1]})]:
        with pytest.raises(SceneInstancesError):change(**args)
        assert (store/(pid+'.json')).read_bytes()==before
    stage=change('add',2,asset_id=glb['id'],transform={'position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1]});gid=stage['instances'][1]['id']
    with pytest.raises(SceneInstancesError):change('physics',3,instance_id=gid,physics_enabled=True)
    locked=change('update',3,instance_id=rid,locked=True)
    with pytest.raises(SceneInstancesError):change('physics',4,instance_id=rid,physics_enabled=False)
    change('update',4,instance_id=rid,locked=False)
    off=change('physics',5,instance_id=rid,physics_enabled=False);assert not off['physics'][rid]['enabled']
    removed=change('remove',6,instance_id=rid);assert rid not in removed['physics']
