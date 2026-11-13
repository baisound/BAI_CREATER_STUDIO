import hashlib
import struct
from pathlib import Path

import pytest
from bai_studio.projects.catalog import create
from bai_studio.v05.timeline import arrangement as arr, scene_instances as scene
from bai_studio.v05.timeline.timeline_scene import instance_id
from bai_studio.v05.motion import multi_motion
from bai_studio.camera.vmd_codec import encode_camera_track
from tools.make_test_pmx import build_pmx


def face_vmd(name='あ'):
    header=b'Vocaloid Motion Data 0002'.ljust(30,b'\0')+b'test'.ljust(20,b'\0')
    keys=b''.join(name.encode('cp932').ljust(15,b'\0')+struct.pack('<If',f,w) for f,w in [(0,0),(15,1),(30,0)])
    return header+struct.pack('<II',0,3)+keys+struct.pack('<IIII',0,0,0,0)


@pytest.fixture
def staged(tmp_path):
    catalog=tmp_path/'studio_v05_catalog.json';pid=create(catalog,'3D連動')['id']
    model={'id':'mmd:A:test.pmx','source':'mmd','kind':'A','format':'PMX','name':'test.pmx','available':True}
    camera={'id':'mmd:vmd:camera.vmd','source':'mmd','kind':'vmd','format':'VMD','name':'camera.vmd','available':True}
    face={'id':'mmd:vmd:face.vmd','source':'mmd','kind':'vmd','format':'VMD','name':'face.vmd','available':True}
    track={'format':'mmd-vmd-camera-native-v1','keys':[{'frame':f,'distance':-3.,'target':[x,.5,0],'rotation':[0,0,0],'interpolation':[20,20,107,107]*6,'fov':45,'perspective':0} for f,x in [(0,0),(30,1)]]}
    for path,raw in [('mmd/A/test.pmx',build_pmx()),('mmd/vmd/camera.vmd',encode_camera_track(track)),('mmd/vmd/face.vmd',face_vmd())]:
        dest=tmp_path/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
    return tmp_path,catalog,pid,[model,camera,face]


def place(data,index,track,start=0,duration=2):
    root,catalog,pid,assets=data;folder=root/'studio_v05_arrangements'
    return arr.place(folder,catalog,pid,assets[index]['id'],track,start,duration,arr.read(folder,catalog,pid)['revision'],assets)


def read(data):
    root,catalog,pid,assets=data
    return scene.read(root/'studio_v05_scene_instances',root/'studio_v05_scene_models',catalog,pid,assets)


def assign(data,clip,rid):
    root,catalog,pid,assets=data
    return multi_motion.assign(root/'studio_v05_arrangements',root/'studio_v05_scene_instances',root/'studio_v05_scene_models',catalog,pid,clip['id'],arr.read(root/'studio_v05_arrangements',catalog,pid)['revision'],rid,assets)


def test_native_camera_and_face_keep_source_times_and_do_not_write_on_read(staged):
    root,catalog,pid,assets=staged
    clip=place(staged,0,'model')['clip'];rid=instance_id(clip['id'])
    place(staged,1,'camera',.25,.5);face=place(staged,2,'expression',.5,1)['clip'];assign(staged,face,rid)
    before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
    out=read(staged);cam,morph=out['timeline_effects']
    assert cam['status']==morph['status']=='ready'
    assert [k['frame'] for k in cam['camera_track']['keys']]==[0,30]
    assert cam['world_scale']==.08 and cam['start']==.25
    assert morph['morph_keys']==[{'name':'あ','frame':f,'weight':w} for f,w in [(0,0),(15,1),(30,0)]]
    assert morph['target_scene_instance_id']==rid
    assert cam['source_sha256']==hashlib.sha256((root/'mmd/vmd/camera.vmd').read_bytes()).hexdigest()
    assert all(p.read_bytes()==raw for p,raw in before.items())
    assert not (root/'studio_v05_scene_instances').exists()


def test_missing_target_and_unknown_morph_are_explicit(staged):
    place(staged,0,'model');face=place(staged,2,'lip')['clip']
    assert read(staged)['timeline_effects'][0]['status']=='unready'
    rid=read(staged)['instances'][0]['id'];assign(staged,face,rid)
    root=staged[0];(root/'mmd/vmd/face.vmd').write_bytes(face_vmd('unknown'))
    row=read(staged)['timeline_effects'][0]
    assert row['status']=='unready' and 'unknown' in row['reason']


def test_all_three_overlapping_cameras_are_reported(staged):
    place(staged,0,'model')
    for start in [0,.2,.4]:place(staged,1,'camera',start,1)
    assert [r['status'] for r in read(staged)['timeline_effects']]==['overlap']*3


def test_vmd_camera_units_do_not_depend_on_unrelated_model_formats(staged):
    root,catalog,pid,assets=staged
    assets[0]={**assets[0],'id':'mmd:A:test.glb','format':'GLB','name':'test.glb'}
    place(staged,0,'model');place(staged,1,'camera')
    assert read(staged)['timeline_effects'][0]['world_scale']==.08


def test_japanese_camera_filename_gets_camera_destination():
    assert arr.classify({'source':'mmd','kind':'vmd','name':'キラメキのシンフォニー-カメラ.vmd'})=='camera'
