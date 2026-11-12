import copy
import json
import pytest
from bai_studio.projects.catalog import create
from bai_studio.v05.timeline import arrangement as arr,scene_instances as scene
from bai_studio.v05.timeline.timeline_scene import instance_id
from bai_studio.v05.motion import multi_motion


@pytest.fixture
def setup(tmp_path):
    catalog=tmp_path/'studio_v05_catalog.json';pid=create(catalog,'配置3D')['id']
    model={'id':'mmd:test.pmx','source':'mmd','kind':'A','format':'PMX','name':'test.pmx','available':True}
    motion={'id':'mmd:dance.vmd','source':'mmd','kind':'vmd','format':'VMD','name':'dance.vmd','available':True}
    return tmp_path,catalog,pid,[model,motion]


def read(data):
    root,catalog,pid,assets=data
    return scene.read(root/'studio_v05_scene_instances',root/'studio_v05_scene_models',catalog,pid,assets)


def place(data,asset,track,start=0,duration=2):
    root,catalog,pid,assets=data;folder=root/'studio_v05_arrangements'
    return arr.place(folder,catalog,pid,asset,track,start,duration,arr.read(folder,catalog,pid)['revision'],assets)


def test_projection_has_stable_ids_and_does_not_write_on_read(setup):
    root,catalog,pid,assets=setup
    one=place(setup,assets[0]['id'],'model',1,2)['clip']
    two=place(setup,assets[0]['id'],'model',4,2)['clip']
    snapshot=(root/'studio_v05_arrangements'/f'{pid}.json').read_bytes()
    result=read(setup)
    assert [i['id'] for i in result['instances']]==[instance_id(one['id']),instance_id(two['id'])]
    assert result['instances'][0]['timeline_windows']==[{'start':1,'duration':2,'clip_id':one['id']}]
    assert all(i['available'] for i in result['instances'])
    assert not (root/'studio_v05_scene_instances').exists()
    assert (root/'studio_v05_arrangements'/f'{pid}.json').read_bytes()==snapshot


def test_transform_face_keys_delete_undo_never_leave_ghosts(setup):
    root,catalog,pid,assets=setup;folder=root/'studio_v05_arrangements'
    clip=place(setup,assets[0]['id'],'model')['clip'];rid=instance_id(clip['id'])
    def mutate(**kwargs):return scene.mutate(root/'studio_v05_scene_instances',root/'studio_v05_scene_models',catalog,pid,assets=assets,**kwargs)
    transform={'position':[2,0,1],'rotation':[0,45,0],'scale':[1,1,1]}
    saved=mutate(action='update',revision=0,instance_id=rid,transform=transform)
    key={'instance_id':rid,'morph_name':'笑い','time':1.0,'value':.7,'track':'expression'}
    saved=mutate(action='face-set',revision=saved['revision'],face_key=key,morph_lookup=lambda a:['笑い'])
    raw=json.loads((root/'studio_v05_scene_instances'/f'{pid}.json').read_text(encoding='utf-8'))
    assert raw['instances']==[] and raw['timeline_overrides'][rid]['transform']==transform
    assert saved['face_keys']==[key]
    state=arr.read(folder,catalog,pid);arr.edit_clip(folder,catalog,pid,clip['id'],state['revision'],'delete')
    assert read(setup)['instances']==[]
    state=arr.read(folder,catalog,pid);arr.edit_history(folder,catalog,pid,state['revision'],'undo')
    restored=read(setup);assert restored['instances'][0]['transform']==transform and restored['face_keys']==[key]
    with pytest.raises(scene.SceneInstancesError,match='timeline'):
        mutate(action='remove',revision=saved['revision'],instance_id=rid)


def test_existing_motion_assignment_targets_derived_model_and_supports_undo(setup):
    root,catalog,pid,assets=setup;folder=root/'studio_v05_arrangements'
    model=place(setup,assets[0]['id'],'model')['clip'];motion=place(setup,assets[1]['id'],'motion')['clip']
    args=(folder,root/'studio_v05_scene_instances',root/'studio_v05_scene_models',catalog,pid)
    state=arr.read(folder,catalog,pid)
    result=multi_motion.assign(*args,motion['id'],state['revision'],instance_id(model['id']),assets)
    assert multi_motion.plan(*args,assets)['rows'][0]['status']=='ready'
    arr.edit_history(folder,catalog,pid,result['revision'],'undo')
    assert multi_motion.plan(*args,assets)['rows'][0]['status']=='unassigned'
