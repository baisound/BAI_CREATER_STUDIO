"""Isolated v0.5 asset-to-timeline arrangement; legacy engine remains untouched."""
import json, math, threading, uuid
from pathlib import Path
from studio_project_catalog import load as load_catalog, _atomic
LOCK=threading.RLock()
CATEGORIES={'model','motion','expression','lip','camera','light','effect','image','video','music','audio','other'}
TRACKS={'model','motion','expression','lip','camera','light','effect','image','video','music','audio'}
class ArrangementError(ValueError): pass

def _project(catalog,project_id):
    if not isinstance(project_id,str) or not any(p['id']==project_id for p in load_catalog(catalog)['projects']):
        raise ArrangementError('Unknown project ID')

def inventory(items,category='all',query=''):
    if category!='all' and category not in CATEGORIES: raise ArrangementError('Unknown category')
    if not isinstance(query,str) or len(query)>160:raise ArrangementError('Invalid search')
    q=query.casefold().strip()
    result=[]
    for item in items:
        if not isinstance(item,dict):continue
        label=str(item.get('name') or item.get('filename') or item.get('id') or '')
        kind=classify(item)
        if (category=='all' or category==kind) and (not q or q in label.casefold()):
            result.append({'id':item.get('id'),'name':label,'category':kind,'available':bool(item.get('available',False)),'source':item.get('source','')})
    return {'items':result,'count':len(result),'category':category,'query':query}

def classify(item):
    name=str(item.get('filename') or item.get('name') or '').lower()
    kind=str(item.get('kind') or '').lower()
    if 'camera' in kind or name.endswith('.vmd') and 'camera' in name:return 'camera'
    if 'motion' in kind or name.endswith(('.vmd','.bvh')):return 'motion'
    if name.endswith(('.vrm','.glb','.gltf','.fbx','.pmx','.pmd')):return 'model'
    if name.endswith(('.mp3','.wav','.ogg','.flac','.m4a')):return 'audio'
    if name.endswith(('.mp4','.webm','.mov')):return 'video'
    if name.endswith(('.png','.jpg','.jpeg','.webp','.exr')):return 'image'
    return 'other'

def read(root,catalog,project_id):
    _project(catalog,project_id)
    path=Path(root)/(project_id+'.json')
    if not path.exists():return {'schema':1,'project_id':project_id,'clips':[],'revision':0}
    data=json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema')!=1 or data.get('project_id')!=project_id or not isinstance(data.get('clips'),list) or not isinstance(data.get('revision'),int):raise ArrangementError('Invalid arrangement; original retained')
    return data

def place(root,catalog,project_id,asset_id,track,start,duration,revision,items,*,layout_root=None):
    if track not in TRACKS:raise ArrangementError('Unsupported track')
    if not isinstance(asset_id,str) or len(asset_id)>300:raise ArrangementError('Invalid asset ID')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (start,duration)) or start<0 or duration<=0 or start+duration>24*60*60:raise ArrangementError('Invalid time range')
    if not isinstance(revision,int) or isinstance(revision,bool):raise ArrangementError('Revision required')
    found=next((a for a in inventory(items)['items'] if a['id']==asset_id and a['available']),None)
    if not found:raise ArrangementError('Asset is not registered or available')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            if track in get_layout(layout_root,catalog,project_id).get('locked',[]):raise ArrangementError('Track locked')
        if len(data['clips'])>=2000:raise ArrangementError('Clip limit reached')
        clip={'id':str(uuid.uuid4()),'asset_id':asset_id,'name':found['name'],'category':found['category'],'track':track,'start':round(start,4),'duration':round(duration,4)}
        data['clips'].append(clip);data['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'clip':clip,'revision':data['revision'],'legacy_engine_unchanged':True}


def timeline_view(root,catalog,project_id):
    """Read-only deterministic projection for the v0.5 timeline and both MCP surfaces."""
    data=read(root,catalog,project_id)
    rows=[]
    for track in sorted(TRACKS):
        clips=sorted((c for c in data['clips'] if c.get('track')==track), key=lambda c:(c['start'],c['id']))
        if clips:rows.append({'track':track,'clips':clips})
    end=max((c['start']+c['duration'] for c in data['clips']),default=0)
    return {'schema':1,'project_id':project_id,'revision':data['revision'],'tracks':rows,'duration':round(end,4),'clip_count':len(data['clips']),'engine_connected':False}


def edit_clip(root,catalog,project_id,clip_id,revision,action,*,start=None,duration=None,track=None,layout_root=None):
    """Atomic revision-guarded metadata edit, isolated from legacy playback."""
    if not isinstance(clip_id,str) or not clip_id or len(clip_id)>100:raise ArrangementError('Invalid clip ID')
    if type(revision) is not int or revision<0:raise ArrangementError('Revision required')
    if action not in ('update','delete'):raise ArrangementError('Invalid action')
    if action=='update':
        if track not in TRACKS:raise ArrangementError('Unsupported track')
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in (start,duration)) or start<0 or duration<=0 or start+duration>86400:raise ArrangementError('Invalid time range')
    with LOCK:
        data=read(root,catalog,project_id)
        if revision!=data['revision']:raise ArrangementError('Revision conflict')
        clip=next((x for x in data['clips'] if x.get('id')==clip_id),None)
        if clip is None:raise ArrangementError('Clip not found')
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            locked=set(get_layout(layout_root,catalog,project_id).get('locked',[]))
            if clip['track'] in locked or (action=='update' and track in locked):raise ArrangementError('Track locked')
        before=dict(clip)
        if action=='delete':data['clips'].remove(clip)
        else:clip.update(start=round(start,4),duration=round(duration,4),track=track)
        data['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'action':action,'clip_id':clip_id,'before':before,'clip':None if action=='delete' else dict(clip),'revision':data['revision'],'legacy_engine_unchanged':True}


def batch_move(root,catalog,project_id,revision,edits,*,layout_root=None):
    """Atomically move multiple clips with a single revision and one-step undo snapshot."""
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    if not isinstance(edits,list) or not 1<=len(edits)<=100:raise ArrangementError('Invalid edit batch')
    ids=[]
    for e in edits:
        if not isinstance(e,dict) or set(e)!={'clip_id','start','duration','track'}:raise ArrangementError('Invalid edit fields')
        if not isinstance(e['clip_id'],str) or not e['clip_id'] or len(e['clip_id'])>100:raise ArrangementError('Invalid clip ID')
        if e['track'] not in TRACKS:raise ArrangementError('Unsupported track')
        start,duration=e['start'],e['duration']
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in (start,duration)) or start<0 or duration<=0 or start+duration>86400:raise ArrangementError('Invalid time range')
        ids.append(e['clip_id'])
    if len(ids)!=len(set(ids)):raise ArrangementError('Duplicate clip IDs')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        mapping={c['id']:c for c in data['clips']}
        if any(i not in mapping for i in ids):raise ArrangementError('Clip not found')
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            locked=set(get_layout(layout_root,catalog,project_id).get('locked',[]))
            if any(mapping[e['clip_id']]['track'] in locked or e['track'] in locked for e in edits):raise ArrangementError('Track locked')
        before=[dict(c) for c in data['clips']]
        for e in edits:mapping[e['clip_id']].update(start=round(e['start'],4),duration=round(e['duration'],4),track=e['track'])
        data['revision']+=1
        data['undo']={'from_revision':data['revision'],'clips':before}
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'revision':data['revision'],'updated':len(edits),'legacy_engine_unchanged':True}

def undo_batch(root,catalog,project_id,revision):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        undo=data.get('undo')
        if not isinstance(undo,dict) or undo.get('from_revision')!=revision or not isinstance(undo.get('clips'),list):raise ArrangementError('No undo available')
        data['clips']=undo['clips'];data['revision']+=1;data.pop('undo',None)
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'revision':data['revision'],'undone':True,'legacy_engine_unchanged':True}
