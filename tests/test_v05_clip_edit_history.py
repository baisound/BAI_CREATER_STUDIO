import copy
import json
from pathlib import Path

import pytest

from bai_studio.projects.catalog import create, _atomic
from bai_studio.v05.timeline import arrangement as arr, track_layout as layout


@pytest.fixture
def project(tmp_path):
    catalog=tmp_path/'catalog.json';pid=create(catalog,'編集履歴')['id']
    return tmp_path/'clips',catalog,pid,tmp_path/'layout'


def place(p,kind='audio',lane=1):
    root,catalog,pid,lr=p
    return arr.place(root,catalog,pid,'fixture',kind,1,4,arr.read(root,catalog,pid)['revision'],
                     [{'id':'fixture','name':{'audio':'test.wav','video':'test.mp4','image':'test.png'}[kind],'available':True}],
                     layout_root=lr,lane=lane,source_duration=8 if kind!='image' else None)


def undo(p,action='undo'):
    root,catalog,pid,lr=p
    return arr.edit_history(root,catalog,pid,arr.read(root,catalog,pid)['revision'],action,layout_root=lr)


@pytest.mark.parametrize('kind',['audio','video','image'])
def test_place_move_trim_delete_history_survives_reopen_and_redoes_exact_ids(project,kind):
    root,cat,pid,lr=project;c=place(project,kind)['clip'];states=[[],copy.deepcopy(arr.read(root,cat,pid)['clips'])]
    arr.edit_clip(root,cat,pid,c['id'],1,'update',start=3,duration=2,track=kind,source_start=.7 if kind!='image' else 0,layout_root=lr)
    states.append(copy.deepcopy(arr.read(root,cat,pid)['clips']))
    arr.edit_clip(root,cat,pid,c['id'],2,'delete',layout_root=lr);states.append([])
    for expected in reversed(states[:-1]):
        before=arr.read(root,cat,pid)['revision'];undo(project)
        assert arr.read(root,cat,pid)['clips']==expected
        assert arr.read(root,cat,pid)['revision']==before+1
    for expected in states[1:]:
        undo(project,'redo');assert arr.read(root,cat,pid)['clips']==expected
    public=arr.public_read(root,cat,pid)
    assert 'clip_history' not in public and 'undo' not in public
    assert public['edit_history']=={'undo_count':3,'redo_count':0}


def test_split_move_batch_and_legacy_batch_alias(project):
    root,cat,pid,lr=project;c=place(project)['clip']
    split=arr.split_clip(root,cat,pid,c['id'],1,2.5,layout_root=lr)
    pieces=arr.read(root,cat,pid)['clips'];assert pieces[1]['source_start']==1.5
    moved=arr.batch_move(root,cat,pid,2,[{'clip_id':split['right']['id'],'start':6,'duration':2.5,'track':'audio'}],layout_root=lr)
    arr.undo_batch(root,cat,pid,moved['revision'],layout_root=lr)
    assert arr.read(root,cat,pid)['clips']==pieces
    undo(project);assert arr.read(root,cat,pid)['clips']==[c]
    undo(project,'redo');assert arr.read(root,cat,pid)['clips']==pieces
    undo(project,'redo');assert arr.read(root,cat,pid)['clips'][1]['start']==6
    undo(project);undo(project)
    before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='No undo'):arr.undo_batch(root,cat,pid,arr.read(root,cat,pid)['revision'],layout_root=lr)
    assert (root/(pid+'.json')).read_bytes()==before


def test_legacy_snapshot_is_available_after_reopen_and_redo(project):
    root,cat,pid,lr=project;c=place(project)['clip']
    data=arr.read(root,cat,pid);data.pop('clip_history');data['clips'][0]['start']=5
    data['undo']={'from_revision':1,'clips':[c]};_atomic(root/(pid+'.json'),data)
    assert arr.public_read(root,cat,pid)['edit_history']['undo_count']==1
    undo(project);assert arr.read(root,cat,pid)['clips']==[c]
    undo(project,'redo');assert arr.read(root,cat,pid)['clips'][0]['start']==5


def test_new_edit_clears_redo_and_stale_revision_does_not_write(project):
    root,cat,pid,lr=project;c=place(project)['clip'];undo(project)
    place(project,'image');before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='No redo'):undo(project,'redo')
    with pytest.raises(arr.ArrangementError,match='conflict'):arr.edit_history(root,cat,pid,1,'undo',layout_root=lr)
    assert (root/(pid+'.json')).read_bytes()==before


def test_lock_guards_removal_and_restore_of_deleted_clips(project):
    root,cat,pid,lr=project;c=place(project)['clip']
    layout.set_flags(lr,cat,pid,0,['audio'],[]);before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='locked'):undo(project)
    assert (root/(pid+'.json')).read_bytes()==before
    layout.set_flags(lr,cat,pid,1,[],[])
    arr.edit_clip(root,cat,pid,c['id'],1,'delete',layout_root=lr)
    layout.set_flags(lr,cat,pid,2,['audio'],[]);before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='locked'):undo(project)
    assert (root/(pid+'.json')).read_bytes()==before


def test_cannot_restore_deleted_lane(project):
    root,cat,pid,lr=project;layout.add_image_lane(lr,cat,pid,0)
    c=place(project,'image',2)['clip']
    arr.edit_clip(root,cat,pid,c['id'],1,'update',start=1,duration=4,track='image',lane=1,layout_root=lr)
    layout.remove_image_lane(lr,cat,root,pid,1,2);before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='does not exist'):undo(project)
    assert (root/(pid+'.json')).read_bytes()==before


def test_history_is_bounded_and_large_history_never_removes_current_clips(project,monkeypatch):
    root,cat,pid,lr=project
    for _ in range(36):place(project,'image')
    d=arr.read(root,cat,pid);assert len(d['clip_history']['undo'])==32
    for _ in range(32):undo(project)
    assert len(arr.read(root,cat,pid)['clips'])==4
    monkeypatch.setattr(arr,'HISTORY_BYTES',300)
    c=place(project,'image')['clip'];d=arr.read(root,cat,pid)
    assert any(x['id']==c['id'] for x in d['clips'])
    assert len(json.dumps(d['clip_history'],ensure_ascii=False).encode('utf-8'))<=300


@pytest.mark.parametrize('damage',['shape','time','source','duplicate'])
def test_invalid_history_is_rejected_without_writing(project,damage):
    root,cat,pid,lr=project;c=place(project)['clip'];undo(project)
    d=arr.read(root,cat,pid);target=d['clip_history']['redo'][0]['clips']
    if damage=='shape':d['clip_history']['redo'][0]=None
    if damage=='time':target[0]['start']=-1
    if damage=='source':target[0]['source_start']=20
    if damage=='duplicate':target.append(copy.deepcopy(target[0]))
    _atomic(root/(pid+'.json'),d);before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError):undo(project,'redo')
    assert (root/(pid+'.json')).read_bytes()==before


def test_atomic_write_failure_preserves_clips_and_both_history_stacks(project,monkeypatch):
    root,cat,pid,lr=project;place(project);before=(root/(pid+'.json')).read_bytes()
    def fail(*args):raise OSError('disk failure')
    monkeypatch.setattr(arr,'_atomic',fail)
    with pytest.raises(OSError,match='disk failure'):undo(project)
    assert (root/(pid+'.json')).read_bytes()==before


def test_other_writer_revision_invalidates_history_instead_of_reverting_its_changes(project):
    root,cat,pid,lr=project;place(project);d=arr.read(root,cat,pid)
    d['revision']+=1;d['clips'][0]['start']=7;_atomic(root/(pid+'.json'),d)
    assert arr.history_status(d)=={'undo_count':0,'redo_count':0}
    with pytest.raises(arr.ArrangementError,match='conflict'):undo(project)
    place(project,'image');undo(project)
    assert arr.read(root,cat,pid)['clips'][0]['start']==7


def test_batch_edit_cannot_extend_past_timed_source(project):
    root,cat,pid,lr=project;c=place(project)['clip'];before=(root/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='exceeds'):
        arr.batch_move(root,cat,pid,1,[{'clip_id':c['id'],'start':1,'duration':9,'track':'audio'}],layout_root=lr)
    assert (root/(pid+'.json')).read_bytes()==before


def test_legacy_motion_target_metadata_is_reversible_without_touching_other_stores(project):
    root,cat,pid,lr=project
    items=[{'id':'motion','name':'dance.vmd','available':True},{'id':'model','name':'body.glb','available':True}]
    c=arr.place(root,cat,pid,'motion','motion',0,4,0,items,layout_root=lr)['clip']
    arr.set_clip_target(root,cat,pid,c['id'],1,'model',items,layout_root=lr)
    undo(project);assert arr.read(root,cat,pid)['clips']==[c]
    undo(project,'redo');assert arr.read(root,cat,pid)['clips'][0]['target_model_id']=='model'
