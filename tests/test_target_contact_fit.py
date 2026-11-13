import copy
import hashlib
import json
import runpy
import subprocess
import sys
import uuid

import pytest
import bai_studio.v05.motion.motion_edits as edits


def setup(tmp_path, monkeypatch):
    project=str(uuid.uuid4());instance=str(uuid.uuid4());clip=str(uuid.uuid4())
    catalog=tmp_path/'catalog.json'
    catalog.write_text(json.dumps({'schema':1,'projects':[{'id':project,'name':'接地試験'}]}))
    model=tmp_path/'generated.pmx'
    model.write_bytes(runpy.run_module('tests.helpers.contact-fit-fixture')['pmx']())
    context={'instance_id':instance,'clip_id':clip,'model_asset_id':'mmd:A:test.pmx',
        'motion_asset_id':'mmd:vmd:test.vmd','model_sha256':hashlib.sha256(model.read_bytes()).hexdigest(),
        'motion_sha256':'b'*64,'fps':60.,'start':0.,'duration':3.,'model_path':model,
        'scene_revision':1,'arrangement_revision':2}
    monkeypatch.setattr(edits,'_context',lambda *a:context)
    args=(tmp_path/'edits',tmp_path,tmp_path,tmp_path,tmp_path,catalog,project)
    expected={k:v for k,v in context.items() if k!='model_path'};expected['revision']=0
    payload={'instance_id':instance,'clip_id':clip,'expected':expected,
        'contact':{'side':'左','start_frame':6,'end_frame':66,'ground_y':0},
        'keys':[{'frame':f,'bone':'左足ＩＫ','rotation':[0,0,0,1],'position':[.01,0,0]} for f in range(6,66)]}
    return args,payload,context


def test_contact_atomic_save_undo_redo_and_source_preservation(tmp_path,monkeypatch):
    args,payload,context=setup(tmp_path,monkeypatch)
    original=context['model_path'].read_bytes()
    result=edits.mutate(*args,0,'contact-set',[],**payload)
    assert result['revision']==1 and len(result['layers'])==1
    layer=result['layers'][0]
    assert layer['start_frame']==6 and layer['end_frame']==66
    assert layer['fade_in_frames']==layer['fade_out_frames']==6
    assert len(layer['keys'])==60 and result['can_undo']
    undone=edits.mutate(*args,1,'undo',[])
    assert not undone['layers']
    assert edits.mutate(*args,2,'redo',[])['layers']==result['layers']
    assert context['model_path'].read_bytes()==original


@pytest.mark.parametrize('case',['revision','scene','arrangement','model','motion','bool','keys','bone','magnitude','rotation','interval','missing_ik'])
def test_contact_invalid_candidates_never_create_store(tmp_path,monkeypatch,case):
    args,payload,context=setup(tmp_path,monkeypatch)
    if case=='revision':payload['expected']['revision']=1
    elif case in ('scene','arrangement'):payload['expected'][case+'_revision']+=1
    elif case in ('model','motion'):payload['expected'][case+'_sha256']='c'*64
    elif case=='bool':payload['expected']['scene_revision']=True
    elif case=='keys':payload['keys'].pop()
    elif case=='bone':payload['keys'][0]['bone']='頭'
    elif case=='magnitude':payload['keys'][0]['position']=[100,0,0]
    elif case=='rotation':payload['keys'][0]['rotation']=[0,0,.1,.994987437]
    elif case=='interval':payload['contact']['end_frame']=300
    elif case=='missing_ik':
        raw=edits.parse_pmx(context['model_path'].read_bytes())
        for b in raw['bones_detail']:b.pop('ik',None)
        monkeypatch.setattr(edits,'parse_pmx',lambda *a:raw)
    with pytest.raises(edits.MotionEditError):edits.mutate(*args,0,'contact-set',[],**payload)
    assert not args[0].exists()


def test_contact_fk_leg_and_stale_existing_layer_preserve_bytes(tmp_path,monkeypatch):
    args,payload,context=setup(tmp_path,monkeypatch)
    edits.mutate(*args,0,'mode-set',[],instance_id=payload['instance_id'],clip_id=payload['clip_id'],limb='left_leg',mode='FK')
    path=args[0]/(args[-1]+'.json');original=path.read_bytes()
    payload['expected']['revision']=1
    with pytest.raises(edits.MotionEditError,match='IK leg'):
        edits.mutate(*args,1,'contact-set',[],**payload)
    assert path.read_bytes()==original


def test_parallel_contact_fk_and_scene_saves_finish_without_lock_inversion(tmp_path):
    # Child timeout bounds this test even if a future change deadlocks all threads.
    code=r'''
import sys,threading,time,runpy,faulthandler
faulthandler.dump_traceback_later(8)
from pathlib import Path
from _pytest.monkeypatch import MonkeyPatch
from tests.test_target_contact_fit import setup
import bai_studio.v05.motion.motion_edits as e
from bai_studio.v05.timeline.arrangement import LOCK as a
from bai_studio.v05.timeline.scene_instances import _LOCK as s
m=MonkeyPatch();args,p,ctx=setup(Path(sys.argv[1]),m)
base=e._context
def context(*v):
    with a:time.sleep(.0005);return base(*v)
e._context=context
barrier=threading.Barrier(3);errors=[]
def worker(kind):
    barrier.wait()
    try:
        for i in range(6):
            if kind=='scene':
                with s:
                    with a:time.sleep(.001)
            elif kind=='fk':
                revision=e.read(args[0],args[5],args[6])['revision']
                try:e.mutate(*args,revision,'set',[],instance_id=p['instance_id'],clip_id=p['clip_id'],key={'frame':0,'bone':'頭','rotation':[0,0,0,1]})
                except e.MotionEditError:pass
            else:
                expected=e.contact_context(*args,[],p['instance_id'],p['clip_id'])
                try:e.mutate(*args,expected['revision'],'contact-set',[],**{**p,'expected':expected})
                except e.MotionEditError:pass
    except BaseException as ex:errors.append(ex)
threads=[threading.Thread(target=worker,args=(k,)) for k in ('scene','fk','contact')]
for t in threads:t.start()
for t in threads:t.join()
assert not errors,errors
'''
    result=subprocess.run([sys.executable,'-X','utf8','-c',code,str(tmp_path)],capture_output=True,text=True,timeout=15)
    assert result.returncode==0,result.stderr
