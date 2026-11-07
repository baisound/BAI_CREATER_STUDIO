"""Stable independent audio/music row IDs and non-destructive source windows."""
import json
import pytest
from bai_studio.projects.catalog import create, _atomic
from bai_studio.v05.timeline import track_layout as layout, arrangement as arr


def project(tmp_path):
    catalog=tmp_path/'catalog.json';pid=create(catalog,'Audio music rows')['id']
    return catalog,pid,tmp_path/'layout',tmp_path/'arr'


def test_legacy_layout_and_labels_are_read_without_rewriting(tmp_path):
    catalog,pid,folder,_=project(tmp_path)
    old={'project_id':pid,'revision':7,'order':sorted(arr.TRACKS),'heights':{'audio':60},
         'image_lanes':2,'locked':['music'],'muted':['audio'],
         'labels':{'audio':'旧音声名','music':'旧楽曲名','image:2':'画像名'}}
    _atomic(folder/(pid+'.json'),old);before=(folder/(pid+'.json')).read_bytes()
    read=layout.get(folder,catalog,pid)
    for kind in ['audio','music']:
        assert read[kind+'_lane_ids']==[1] and read['next_'+kind+'_lane_id']==2
    assert read['labels']==old['labels'] and read['muted']==['audio'] and read['locked']==['music']
    assert (folder/(pid+'.json')).read_bytes()==before
    read=layout.add_audio_music_lane(folder,catalog,pid,7,'audio')
    read=layout.update(folder,catalog,pid,8,list(reversed(read['order'])),read['heights'])
    assert read['audio_lane_ids']==[1,2] and read['music_lane_ids']==[1]
    assert read['image_lane_ids']==[1,2] and read['video_lane_ids']==[1]
    read=layout.set_label(folder,catalog,pid,9,'audio:1','新音声名')
    assert read['labels']=={'audio:1':'新音声名','music':'旧楽曲名','image:2':'画像名'}


@pytest.mark.parametrize('kind',['audio','music'])
def test_sparse_ids_source_windows_split_and_other_kind_are_preserved(tmp_path,kind):
    catalog,pid,folder,clips=project(tmp_path)
    layout.add_audio_music_lane(folder,catalog,pid,0,kind)
    layout.add_audio_music_lane(folder,catalog,pid,1,kind)
    items=[{'id':'audio','name':'voice.wav','available':True}]
    p=arr.place(clips,catalog,pid,'audio',kind,1,3,0,items,layout_root=folder,lane=3,source_duration=8)
    e=arr.edit_clip(clips,catalog,pid,p['clip']['id'],1,'update',track=kind,start=1,duration=2,source_start=.5,layout_root=folder)
    assert e['clip']['lane']==3
    split=arr.split_clip(clips,catalog,pid,e['clip']['id'],2,1.75,layout_root=folder)
    assert split['left']['lane']==split['right']['lane']==3 and split['right']['source_start']==1.25
    before=arr.read(clips,catalog,pid)
    with pytest.raises(arr.ArrangementError,match='clips'):layout.remove_audio_music_lane(folder,catalog,clips,pid,2,3,kind)
    removed=layout.remove_audio_music_lane(folder,catalog,clips,pid,2,2,kind)
    assert removed[kind+'_lane_ids']==[1,3] and arr.read(clips,catalog,pid)==before
    added=layout.add_audio_music_lane(folder,catalog,pid,3,kind)
    assert added[kind+'_lane_ids']==[1,3,4] and added['next_'+kind+'_lane_id']==5
    other='music' if kind=='audio' else 'audio'
    assert added[other+'_lane_ids']==[1]
    with pytest.raises(arr.ArrangementError,match='does not exist'):
        arr.place(clips,catalog,pid,'audio',kind,0,1,3,items,layout_root=folder,lane=2)
    assert arr.read(clips,catalog,pid)==before


@pytest.mark.parametrize('kind',['audio','music'])
@pytest.mark.parametrize('patch',[{'lanes':0},{'lanes':2,'lane_ids':[1,1]},
    {'lane_ids':[True]},{'next_lane_id':1},{'lane_ids':[0]},{'lanes':2,'lane_ids':[3,1]}])
def test_corrupt_audio_rows_do_not_get_repaired_or_overwritten(tmp_path,kind,patch):
    catalog,pid,folder,_=project(tmp_path);d=layout.get(folder,catalog,pid)
    for key,value in patch.items():d[('next_'+kind+'_lane_id') if key=='next_lane_id' else kind+'_'+key]=value
    _atomic(folder/(pid+'.json'),d);before=(folder/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError):layout.get(folder,catalog,pid)
    assert (folder/(pid+'.json')).read_bytes()==before


@pytest.mark.parametrize('kind',['audio','music'])
def test_limits_stale_last_row_and_labels_preserve_saved_state(tmp_path,kind):
    catalog,pid,folder,clips=project(tmp_path)
    for revision in range(15):layout.add_audio_music_lane(folder,catalog,pid,revision,kind)
    before=(folder/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='limit'):layout.add_audio_music_lane(folder,catalog,pid,15,kind)
    with pytest.raises(arr.ArrangementError,match='conflict'):layout.remove_audio_music_lane(folder,catalog,clips,pid,14,2,kind)
    assert (folder/(pid+'.json')).read_bytes()==before
    named=layout.set_label(folder,catalog,pid,15,kind+':2','残す名前')
    removed=layout.remove_audio_music_lane(folder,catalog,clips,pid,named['revision'],2,kind)
    assert kind+':2' not in removed['labels']
    with pytest.raises(arr.ArrangementError):layout.set_label(folder,catalog,pid,removed['revision'],kind+':2','消した行')
    for lane in range(1,16):
        if lane!=2:removed=layout.remove_audio_music_lane(folder,catalog,clips,pid,removed['revision'],lane,kind)
    assert removed[kind+'_lane_ids']==[16]
    before=(folder/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='last'):layout.remove_audio_music_lane(folder,catalog,clips,pid,removed['revision'],16,kind)
    assert (folder/(pid+'.json')).read_bytes()==before


@pytest.mark.parametrize('kind',['audio','music'])
def test_batch_undo_cannot_restore_a_deleted_audio_row(tmp_path,kind):
    catalog,pid,folder,clips=project(tmp_path);layout.add_audio_music_lane(folder,catalog,pid,0,kind)
    other='music' if kind=='audio' else 'audio'
    placed=arr.place(clips,catalog,pid,'a',kind,1,2,0,[{'id':'a','name':'a.wav','available':True}],layout_root=folder,lane=2,source_duration=8)
    moved=arr.batch_move(clips,catalog,pid,1,[{'clip_id':placed['clip']['id'],'track':other,'start':1,'duration':2}],layout_root=folder)
    layout.remove_audio_music_lane(folder,catalog,clips,pid,1,2,kind)
    before=(clips/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='does not exist'):arr.undo_batch(clips,catalog,pid,moved['revision'],layout_root=folder)
    assert (clips/(pid+'.json')).read_bytes()==before


@pytest.mark.parametrize('kind',['audio','music'])
def test_locked_batch_and_same_kind_undo_keep_row_and_original_window(tmp_path,kind):
    catalog,pid,folder,clips=project(tmp_path);layout.add_audio_music_lane(folder,catalog,pid,0,kind)
    placed=arr.place(clips,catalog,pid,'a',kind,1,2,0,[{'id':'a','name':'a.wav','available':True}],layout_root=folder,lane=2,source_duration=8)
    moved=arr.batch_move(clips,catalog,pid,1,[{'clip_id':placed['clip']['id'],'track':kind,'start':2,'duration':2}],layout_root=folder)
    current=arr.read(clips,catalog,pid)['clips'][0];assert current['lane']==2 and current['source_start']==0
    layout.set_flags(folder,catalog,pid,1,[kind],[])
    before=(clips/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='locked'):arr.undo_batch(clips,catalog,pid,moved['revision'],layout_root=folder)
    assert (clips/(pid+'.json')).read_bytes()==before
    layout.set_flags(folder,catalog,pid,2,[],[])
    arr.undo_batch(clips,catalog,pid,moved['revision'],layout_root=folder)
    assert arr.read(clips,catalog,pid)['clips']==[placed['clip']]
