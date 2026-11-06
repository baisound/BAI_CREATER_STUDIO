import json

import pytest

from bai_studio.projects.catalog import create, _atomic
from bai_studio.v05.timeline import track_layout as layout
from bai_studio.v05.timeline import arrangement as arr


def project(tmp_path):
    catalog=tmp_path/'catalog.json';pid=create(catalog,'Video lanes')['id']
    return catalog,pid,tmp_path/'layout',tmp_path/'arr'


def test_legacy_video_row_is_materialized_without_writing_and_survives_other_settings(tmp_path):
    catalog,pid,folder,_=project(tmp_path)
    old={'project_id':pid,'revision':4,'order':sorted(arr.TRACKS),'heights':{},'image_lanes':2,
         'locked':['audio'],'muted':['video'],'labels':{'video':'旧動画名','image:2':'背景'}}
    _atomic(folder/(pid+'.json'),old);before=(folder/(pid+'.json')).read_bytes()
    read=layout.get(folder,catalog,pid)
    assert read['video_lane_ids']==[1] and read['next_video_lane_id']==2
    assert (folder/(pid+'.json')).read_bytes()==before
    added=layout.add_video_lane(folder,catalog,pid,4)
    saved=layout.update(folder,catalog,pid,5,list(reversed(added['order'])),{'video':80})
    assert saved['video_lane_ids']==[1,2] and saved['image_lane_ids']==[1,2]
    assert saved['labels']==old['labels'] and saved['muted']==['video'] and saved['locked']==['audio']
    renamed=layout.set_label(folder,catalog,pid,6,'video:1','新動画名')
    assert renamed['labels']['video:1']=='新動画名' and 'video' not in renamed['labels']


def test_deletion_keeps_sparse_ids_and_all_clip_source_fields(tmp_path):
    catalog,pid,folder,clips=project(tmp_path)
    layout.add_video_lane(folder,catalog,pid,0);layout.add_video_lane(folder,catalog,pid,1)
    items=[{'id':'video','name':'sample.mp4','available':True}]
    placed=arr.place(clips,catalog,pid,'video','video',1,3,0,items,layout_root=folder,lane=3,source_duration=8)
    changed=arr.edit_clip(clips,catalog,pid,placed['clip']['id'],1,'update',start=2,duration=2,track='video',source_start=.5,layout_root=folder)
    assert changed['clip']['lane']==3
    split=arr.split_clip(clips,catalog,pid,changed['clip']['id'],2,3,layout_root=folder)
    assert split['left']['lane']==split['right']['lane']==3 and split['right']['source_start']==1.5
    before=arr.read(clips,catalog,pid)
    with pytest.raises(arr.ArrangementError,match='clips'):layout.remove_video_lane(folder,catalog,clips,pid,2,3)
    removed=layout.remove_video_lane(folder,catalog,clips,pid,2,2)
    assert removed['video_lane_ids']==[1,3] and arr.read(clips,catalog,pid)==before
    added=layout.add_video_lane(folder,catalog,pid,3)
    assert added['video_lane_ids']==[1,3,4] and added['next_video_lane_id']==5
    with pytest.raises(arr.ArrangementError,match='does not exist'):
        arr.place(clips,catalog,pid,'video','video',0,1,3,items,layout_root=folder,lane=2)
    assert arr.read(clips,catalog,pid)==before


@pytest.mark.parametrize('ids,count,next_id', [([1,1],2,2),([1,3],2,3),([True],1,2),([],0,1),([1],17,2),([2,1],2,3)])
def test_corrupt_lane_state_is_retained_and_rejected(tmp_path,ids,count,next_id):
    catalog,pid,folder,_=project(tmp_path)
    data=layout.get(folder,catalog,pid);data.update(video_lane_ids=ids,video_lanes=count,next_video_lane_id=next_id)
    _atomic(folder/(pid+'.json'),data);before=(folder/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError):layout.get(folder,catalog,pid)
    assert (folder/(pid+'.json')).read_bytes()==before


def test_limits_revisions_and_last_row_are_enforced(tmp_path):
    catalog,pid,folder,clips=project(tmp_path)
    with pytest.raises(arr.ArrangementError,match='last video'):layout.remove_video_lane(folder,catalog,clips,pid,0,1)
    for revision in range(15):layout.add_video_lane(folder,catalog,pid,revision)
    before=(folder/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='limit'):layout.add_video_lane(folder,catalog,pid,15)
    with pytest.raises(arr.ArrangementError,match='conflict'):layout.remove_video_lane(folder,catalog,clips,pid,14,2)
    assert (folder/(pid+'.json')).read_bytes()==before


def test_batch_move_and_undo_never_restore_a_removed_video_lane(tmp_path):
    catalog,pid,folder,clips=project(tmp_path)
    layout.add_video_lane(folder,catalog,pid,0)
    items=[{'id':'video','name':'video.mp4','available':True}]
    clip=arr.place(clips,catalog,pid,'video','video',0,2,0,items,layout_root=folder,lane=2,source_duration=5)['clip']
    change=[{'clip_id':clip['id'],'start':3,'duration':2,'track':'video'}]
    arr.batch_move(clips,catalog,pid,1,change,layout_root=folder)
    assert arr.read(clips,catalog,pid)['clips'][0]['lane']==2
    layout.set_flags(folder,catalog,pid,1,['video'],[])
    with pytest.raises(arr.ArrangementError,match='locked'):arr.undo_batch(clips,catalog,pid,2,layout_root=folder)
    layout.set_flags(folder,catalog,pid,2,[],[])
    arr.undo_batch(clips,catalog,pid,2,layout_root=folder)
    arr.batch_move(clips,catalog,pid,3,[{**change[0],'track':'audio'}],layout_root=folder)
    assert arr.read(clips,catalog,pid)['clips'][0]['lane']==1
    layout.remove_video_lane(folder,catalog,clips,pid,3,2)
    before=(clips/(pid+'.json')).read_bytes()
    with pytest.raises(arr.ArrangementError,match='does not exist'):arr.undo_batch(clips,catalog,pid,4,layout_root=folder)
    assert (clips/(pid+'.json')).read_bytes()==before
