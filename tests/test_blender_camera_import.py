import copy
import hashlib
import json
import uuid
from pathlib import Path

import pytest
from bai_studio.v05.timeline import blender_camera as camera,arrangement
from tests.helpers.blender_camera_data import track


def setup(tmp_path):
    pid=str(uuid.uuid4());catalog=tmp_path/'studio_v05_catalog.json'
    catalog.write_text(json.dumps({'schema':1,'projects':[{'id':pid,'name':'camera test','fps':60}]}))
    return pid,catalog


def test_candidate_compare_does_not_write_project_adoption_is_one_undo_step(tmp_path):
    pid,catalog=setup(tmp_path);source=track();original=copy.deepcopy(source)
    imported=camera.import_track(tmp_path,pid,'../safe.json',source)
    assert source==original and imported['name']=='safe.json'
    root=tmp_path/'studio_v05_arrangements';assert not root.exists()
    p=camera.prepare(tmp_path,pid,imported['id'],60,{'scale':1,'offset':[0,0,0]},[])
    assert not root.exists();assert p['camera_row']['start']==1
    result=camera.adopt(tmp_path,pid,imported['id'],60,p['expected']['mapping'],p['expected'],False,[])
    assert result['revision']==1
    saved=arrangement.read(root,catalog,pid);assert len(saved['clips'])==1
    assert arrangement.history_status(saved)=={'undo_count':1,'redo_count':0}
    arrangement.edit_history(root,catalog,pid,1,'undo');assert not arrangement.read(root,catalog,pid)['clips']
    arrangement.edit_history(root,catalog,pid,2,'redo');assert arrangement.read(root,catalog,pid)['clips']==saved['clips']
    for length in (1.01,2):
        with pytest.raises(arrangement.ArrangementError,match='duration'):
            arrangement.edit_clip(root,catalog,pid,result['clip']['id'],3,'update',start=1,duration=length,track='camera')
    assert arrangement.read(root,catalog,pid)['clips']==saved['clips']


@pytest.mark.parametrize('case',['fps','samples','time','nan','mirror','shear','projection','cut','dof','frame'])
def test_invalid_tracks_never_create_candidates(tmp_path,case):
    pid,_=setup(tmp_path);source=track()
    if case=='fps':source['sample_fps']=30
    elif case=='samples':source['samples']=[]
    elif case=='time':source['samples'][1]['time']=-1
    elif case=='nan':source['samples'][0]['world'][12]=float('nan')
    elif case=='mirror':source['samples'][0]['world'][0]=-1
    elif case=='shear':source['samples'][0]['world'][4]=.2
    elif case=='projection':source['samples'][0]['projection'][14]=0
    elif case=='cut':source['cuts'][1]['time']=.7
    elif case=='dof':source['samples'][0]['lens']['dof']['enabled']='yes'
    elif case=='frame':source['source_end_frame']=False
    with pytest.raises(camera.CameraImportError):camera.import_track(tmp_path,pid,'candidate.json',source)
    assert not (tmp_path/'studio_v05_blender_camera').exists()


def test_conflict_mapping_dof_overlap_and_tampered_source_keep_saved_project(tmp_path):
    pid,catalog=setup(tmp_path);candidate=camera.import_track(tmp_path,pid,'camera.json',track(dof=True))
    transform={'scale':1,'offset':[0,0,0]};p=camera.prepare(tmp_path,pid,candidate['id'],0,transform,[])
    with pytest.raises(camera.CameraImportError,match='未適用'):camera.adopt(tmp_path,pid,candidate['id'],0,transform,p['expected'],False,[])
    assert not (tmp_path/'studio_v05_arrangements').exists()
    with pytest.raises(camera.CameraImportError,match='比較条件'):
        camera.adopt(tmp_path,pid,candidate['id'],0,{'scale':2,'offset':[0,0,0]},p['expected'],True,[])
    result=camera.adopt(tmp_path,pid,candidate['id'],0,transform,p['expected'],True,[])
    root=tmp_path/'studio_v05_arrangements';file=root/(pid+'.json');saved=file.read_bytes()
    with pytest.raises(camera.CameraImportError,match='比較条件'):camera.adopt(tmp_path,pid,candidate['id'],0,transform,p['expected'],True,[])
    current=camera.prepare(tmp_path,pid,candidate['id'],0,transform,[])
    with pytest.raises(camera.CameraImportError,match='重な'):camera.adopt(tmp_path,pid,candidate['id'],0,transform,current['expected'],True,[])
    path=camera.file_for(tmp_path,'blender-camera:'+candidate['id']);path.write_bytes(path.read_bytes()+b' ')
    with pytest.raises(camera.CameraImportError,match='変更'):camera.get(tmp_path,candidate['id'])
    assert file.read_bytes()==saved


def test_atomic_failure_leaves_original_arrangement(tmp_path,monkeypatch):
    pid,catalog=setup(tmp_path);candidate=camera.import_track(tmp_path,pid,'camera.json',track())
    transform={'scale':1,'offset':[0,0,0]};p=camera.prepare(tmp_path,pid,candidate['id'],0,transform,[])
    def fail(*a):raise OSError('disk full')
    monkeypatch.setattr(camera,'_atomic',fail)
    with pytest.raises(OSError):camera.adopt(tmp_path,pid,candidate['id'],0,transform,p['expected'],False,[])
    assert not (tmp_path/'studio_v05_arrangements'/(pid+'.json')).exists()


def test_blend_bad_or_missing_executable_never_changes_project(tmp_path):
    pid,_=setup(tmp_path)
    for name,raw in [('x.json',b'{}'),('x.blend',b'bad'),('x.zip',b'zip')]:
        with pytest.raises(camera.CameraImportError):camera.import_file(tmp_path,pid,name,raw,'missing-blender')
    with pytest.raises(camera.CameraImportError,match='Blenderが見つかりません'):
        camera.import_file(tmp_path,pid,'x.blend',b'BLENDER fixture','missing-blender')
    assert not (tmp_path/'studio_v05_arrangements').exists()
