"""Per-project timeline presentation settings; isolated from animation data."""
import math, threading
from pathlib import Path
from studio_v05_arrangement import TRACKS, _project, ArrangementError
from studio_project_catalog import _atomic
import json
LOCK=threading.RLock()
def get(root,catalog,project_id):
    _project(catalog,project_id)
    p=Path(root)/(project_id+'.json')
    if not p.exists():return {'project_id':project_id,'revision':0,'order':sorted(TRACKS),'heights':{},'locked':[],'muted':[],'image_lanes':1,'image_lane_ids':[1],'next_image_lane_id':2}
    d=json.loads(p.read_text(encoding='utf-8'))
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
    return d
def update(root,catalog,project_id,revision,order,heights):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if not isinstance(order,list) or len(order)!=len(TRACKS) or set(order)!=TRACKS or any(type(x) is not str for x in order):raise ArrangementError('Invalid track order')
    if not isinstance(heights,dict) or any(type(k) is not str or k not in TRACKS or type(v) is not int or not 28<=v<=160 for k,v in heights.items()):raise ArrangementError('Invalid track heights')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        result={'project_id':project_id,'revision':revision+1,'order':order,'heights':heights,'locked':d.get('locked',[]),'muted':d.get('muted',[]),'image_lanes':d['image_lanes'],'image_lane_ids':d['image_lane_ids'],'next_image_lane_id':d['next_image_lane_id']}
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
    from studio_v05_arrangement import LOCK as ARRANGEMENT_LOCK, read as read_arrangement
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
