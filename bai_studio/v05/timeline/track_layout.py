"""Per-project timeline presentation settings; isolated from animation data."""
import math, threading, unicodedata
from pathlib import Path
from bai_studio.v05.timeline.arrangement import TRACKS, _project, ArrangementError
from bai_studio.projects.catalog import _atomic
import json
import re
LOCK=threading.RLock()
def _label_text(label):
    if not isinstance(label,str) or not 1<=len(label.strip())<=40 or label!=label.strip():raise ArrangementError('Invalid track label')
    if any(unicodedata.category(ch).startswith('C') or 0x1F000<=ord(ch)<=0x1FAFF or 0x2600<=ord(ch)<=0x27BF or ord(ch) in (0x20E3,0xFE0E,0xFE0F) for ch in label):
        raise ArrangementError('Emoji or control characters are not allowed in track labels')
    return label

def _label_key(key,ids,video_ids=(),audio_ids=(),music_ids=()):
    lane_keys={track+':'+str(i) for track,lanes in [('image',ids),('video',video_ids),('audio',audio_ids),('music',music_ids)] for i in lanes}
    if type(key) is not str or key not in (TRACKS-{'image'})|lane_keys:
        raise ArrangementError('Invalid track label key')
    return key

def _media_lanes(d):
    for track in ('video','audio','music'):
        count=d.get(track+'_lanes',1)
        ids=d.get(track+'_lane_ids',list(range(1,count+1)) if type(count) is int and 1<=count<=16 else [])
        if (type(count) is not int or not 1<=count<=16 or not isinstance(ids,list) or len(ids)!=count or
            any(type(i) is not int or not 1<=i<=2147483646 for i in ids) or ids!=sorted(set(ids))):
            raise ArrangementError('Invalid '+track+' lane IDs')
        next_id=d.get('next_'+track+'_lane_id',max(ids)+1)
        if type(next_id) is not int or not max(ids)<next_id<=2147483647:raise ArrangementError('Invalid next '+track+' lane ID')
        d.update({track+'_lanes':count,track+'_lane_ids':ids,'next_'+track+'_lane_id':next_id})
    return d

def get(root,catalog,project_id):
    _project(catalog,project_id)
    p=Path(root)/(project_id+'.json')
    if not p.exists():return _media_lanes({'project_id':project_id,'revision':0,'order':sorted(TRACKS),'heights':{},'locked':[],'muted':[],'image_lanes':1,'image_lane_ids':[1],'next_image_lane_id':2,'labels':{}})
    with LOCK:d=json.loads(p.read_text(encoding='utf-8'))
    if d.get('project_id')!=project_id or type(d.get('revision')) is not int or not isinstance(d.get('order'),list) or set(d['order'])!=TRACKS or len(d['order'])!=len(TRACKS) or not isinstance(d.get('heights'),dict):raise ArrangementError('Invalid track layout')
    if any(k not in TRACKS or type(v) is not int or not 28<=v<=160 for k,v in d['heights'].items()):raise ArrangementError('Invalid track heights')
    if type(d.get('image_lanes',1)) is not int or not 1<=d.get('image_lanes',1)<=16:raise ArrangementError('Invalid image lane count')
    d.setdefault('image_lanes',1)
    # Old projects stored only a count. Materialize stable IDs in memory without rewriting them.
    ids=d.get('image_lane_ids',list(range(1,d.get('image_lanes',1)+1)))
    if (not isinstance(ids,list) or len(ids)!=d.get('image_lanes',1) or
        any(type(lane) is not int or lane<1 or lane>2147483646 for lane in ids) or
        ids!=sorted(set(ids))):raise ArrangementError('Invalid image lane IDs')
    next_id=d.get('next_image_lane_id',max(ids)+1)
    if type(next_id) is not int or not max(ids)<next_id<=2147483647:raise ArrangementError('Invalid next image lane ID')
    d['image_lane_ids']=ids;d['next_image_lane_id']=next_id
    labels=d.get('labels',{})
    if not isinstance(labels,dict):raise ArrangementError('Invalid track labels')
    _media_lanes(d)
    for key,label in labels.items():_label_key(key,ids,d['video_lane_ids'],d['audio_lane_ids'],d['music_lane_ids']);_label_text(label)
    d['labels']=labels
    lane_mutes=d.get('muted_lanes',[])
    if (not isinstance(lane_mutes,list) or len(lane_mutes)>128 or any(type(key) is not str or (not re.fullmatch(r'(audio|music|video):[1-9][0-9]{0,9}',key) or int(key.split(':')[1])>2147483646) for key in lane_mutes) or len(set(lane_mutes))!=len(lane_mutes)):
        raise ArrangementError('Invalid lane mutes')
    return d

def set_lane_mute(root,catalog,project_id,revision,key,muted):
    if type(revision) is not int or revision<0 or type(muted) is not bool or type(key) is not str:
        raise ArrangementError('Invalid lane mute request')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        keys={track+':'+str(lane) for track in ('audio','music','video') for lane in d[track+'_lane_ids']}
        if key not in keys:raise ArrangementError('Audio lane does not exist')
        values=set(d.get('muted_lanes',[]))
        if muted:values.add(key)
        else:values.discard(key)
        result={**d,'revision':revision+1,'muted_lanes':sorted(values)}
        _atomic(Path(root)/(project_id+'.json'),result)
        return result
def update(root,catalog,project_id,revision,order,heights):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if not isinstance(order,list) or len(order)!=len(TRACKS) or set(order)!=TRACKS or any(type(x) is not str for x in order):raise ArrangementError('Invalid track order')
    if not isinstance(heights,dict) or any(type(k) is not str or k not in TRACKS or type(v) is not int or not 28<=v<=160 for k,v in heights.items()):raise ArrangementError('Invalid track heights')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        result={**d,'revision':revision+1,'order':order,'heights':heights}
        _atomic(Path(root)/(project_id+'.json'),result)
        return result

def add_image_lane(root,catalog,project_id,revision):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if d['image_lanes']>=16:raise ArrangementError('Image lane limit reached')
        if d['next_image_lane_id']>2147483646:raise ArrangementError('Image lane ID limit reached')
        d['image_lane_ids'].append(d['next_image_lane_id'])
        d['next_image_lane_id']+=1;d['image_lanes']+=1;d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def remove_image_lane(root,catalog,arrangement_root,project_id,revision,lane):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if type(lane) is not int or lane<1:raise ArrangementError('Invalid lane')
    from bai_studio.v05.timeline.arrangement import LOCK as ARRANGEMENT_LOCK, read as read_arrangement
    # Placement takes ARRANGEMENT_LOCK before reading the layout. Keep the same order
    # so a clip cannot be added between the empty check and the layout write.
    with ARRANGEMENT_LOCK, LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if lane not in d['image_lane_ids']:raise ArrangementError('Image lane does not exist')
        if len(d['image_lane_ids'])==1:raise ArrangementError('Cannot remove the last image lane')
        arrangement=read_arrangement(arrangement_root,catalog,project_id)
        if any(c.get('track')=='image' and c.get('lane',1)==lane for c in arrangement['clips']):
            raise ArrangementError('Move or remove clips before removing this image lane')
        d['image_lane_ids'].remove(lane)
        d['image_lanes']=len(d['image_lane_ids'])
        d['labels'].pop('image:'+str(lane),None)
        d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def set_label(root,catalog,project_id,revision,key,label):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        _label_key(key,d['image_lane_ids'],d['video_lane_ids'],d['audio_lane_ids'],d['music_lane_ids'])
        if key in {'video:1','audio:1','music:1'}:d['labels'].pop(key.split(':')[0],None)  # explicit edit consumes the legacy row-1 alias
        if label is None:d['labels'].pop(key,None)
        else:d['labels'][key]=_label_text(label)
        d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def set_flags(root,catalog,project_id,revision,locked,muted):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if any(not isinstance(v,list) or len(set(v))!=len(v) or any(type(k) is not str or k not in TRACKS for k in v) for v in (locked,muted)):raise ArrangementError('Invalid track flags')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        result={**d,'revision':revision+1,'locked':locked,'muted':muted}
        _atomic(Path(root)/(project_id+'.json'),result)
        return result


def add_video_lane(root,catalog,project_id,revision):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if d['video_lanes']>=16:raise ArrangementError('Video lane limit reached')
        if d['next_video_lane_id']>2147483646:raise ArrangementError('Video lane ID limit reached')
        d['video_lane_ids'].append(d['next_video_lane_id'])
        d['next_video_lane_id']+=1;d['video_lanes']+=1;d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def remove_video_lane(root,catalog,arrangement_root,project_id,revision,lane):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if type(lane) is not int or lane<1:raise ArrangementError('Invalid lane')
    from bai_studio.v05.timeline.arrangement import LOCK as ARRANGEMENT_LOCK, read as read_arrangement
    with ARRANGEMENT_LOCK, LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if lane not in d['video_lane_ids']:raise ArrangementError('Video lane does not exist')
        if d['video_lanes']==1:raise ArrangementError('Cannot remove the last video lane')
        arrangement=read_arrangement(arrangement_root,catalog,project_id)
        if any(c.get('track')=='video' and c.get('lane',1)==lane for c in arrangement['clips']):
            raise ArrangementError('Move or remove clips before removing this video lane')
        d['video_lane_ids'].remove(lane);d['video_lanes']=len(d['video_lane_ids'])
        d['labels'].pop('video:'+str(lane),None);d['muted_lanes']=[k for k in d.get('muted_lanes',[]) if k!='video:'+str(lane)];d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def add_audio_music_lane(root,catalog,project_id,revision,track):
    if track not in {'audio','music'}:raise ArrangementError('Invalid audio lane track')
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if d[track+'_lanes']>=16:raise ArrangementError('Audio lane limit reached')
        if d['next_'+track+'_lane_id']>2147483646:raise ArrangementError('Audio lane ID limit reached')
        d[track+'_lane_ids'].append(d['next_'+track+'_lane_id'])
        d['next_'+track+'_lane_id']+=1;d[track+'_lanes']+=1;d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d


def remove_audio_music_lane(root,catalog,arrangement_root,project_id,revision,lane,track):
    if track not in {'audio','music'}:raise ArrangementError('Invalid audio lane track')
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if type(lane) is not int or lane<1:raise ArrangementError('Invalid lane')
    from bai_studio.v05.timeline.arrangement import LOCK as ARRANGEMENT_LOCK, read as read_arrangement
    with ARRANGEMENT_LOCK, LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if lane not in d[track+'_lane_ids']:raise ArrangementError('Audio lane does not exist')
        if d[track+'_lanes']==1:raise ArrangementError('Cannot remove the last audio lane')
        arrangement=read_arrangement(arrangement_root,catalog,project_id)
        if any(c.get('track')==track and c.get('lane',1)==lane for c in arrangement['clips']):
            raise ArrangementError('Move or remove clips before removing this audio lane')
        d[track+'_lane_ids'].remove(lane);d[track+'_lanes']=len(d[track+'_lane_ids'])
        d['labels'].pop(track+':'+str(lane),None);d['muted_lanes']=[k for k in d.get('muted_lanes',[]) if k!=track+':'+str(lane)];d['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),d)
        return d
