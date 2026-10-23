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
    if not p.exists():return {'project_id':project_id,'revision':0,'order':sorted(TRACKS),'heights':{},'locked':[],'muted':[],'image_lanes':1}
    d=json.loads(p.read_text(encoding='utf-8'))
    if d.get('project_id')!=project_id or type(d.get('revision')) is not int or not isinstance(d.get('order'),list) or set(d['order'])!=TRACKS or len(d['order'])!=len(TRACKS) or not isinstance(d.get('heights'),dict):raise ArrangementError('Invalid track layout')
    if any(k not in TRACKS or type(v) is not int or not 28<=v<=160 for k,v in d['heights'].items()):raise ArrangementError('Invalid track heights')
    if type(d.get('image_lanes',1)) is not int or not 1<=d.get('image_lanes',1)<=16:raise ArrangementError('Invalid image lane count')
    d.setdefault('image_lanes',1)
    return d
def update(root,catalog,project_id,revision,order,heights):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if not isinstance(order,list) or len(order)!=len(TRACKS) or set(order)!=TRACKS or any(type(x) is not str for x in order):raise ArrangementError('Invalid track order')
    if not isinstance(heights,dict) or any(type(k) is not str or k not in TRACKS or type(v) is not int or not 28<=v<=160 for k,v in heights.items()):raise ArrangementError('Invalid track heights')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        result={'project_id':project_id,'revision':revision+1,'order':order,'heights':heights,'locked':d.get('locked',[]),'muted':d.get('muted',[]),'image_lanes':d['image_lanes']}
        _atomic(Path(root)/(project_id+'.json'),result)
        return result

def add_image_lane(root,catalog,project_id,revision):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        d=get(root,catalog,project_id)
        if d['revision']!=revision:raise ArrangementError('Revision conflict')
        if d['image_lanes']>=16:raise ArrangementError('Image lane limit reached')
        d['image_lanes']+=1;d['revision']+=1
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
