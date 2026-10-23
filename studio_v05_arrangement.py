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
    # Existing library records use category metadata separate from file extension.
    if item.get('source') in ('library','v05source') or str(item.get('id','')).startswith(('library:','v05source:')):
        if kind in ('fx',):return 'effect'
        if kind in ('stage','prop'):return 'model'
        if kind in ('material','image'):return 'image'
        if kind in ('audio','video'):return kind
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

def _lane(lane,track,layout):
    if type(lane) is not int or lane<1:raise ArrangementError('Invalid lane')
    if track!='image' and lane!=1:raise ArrangementError('Only image tracks support multiple lanes')
    if track=='image' and lane not in layout.get('image_lane_ids',range(1,layout.get('image_lanes',1)+1)):raise ArrangementError('Image lane does not exist')
    return lane

def _source_window(category, source_start, duration, source_duration):
    if type(source_start) not in (int,float) or not math.isfinite(source_start) or source_start<0:
        raise ArrangementError('Invalid source start')
    if category not in {'video','audio','music'}:
        if source_start!=0:raise ArrangementError('Only timed media supports a source start')
        return
    if source_duration is not None:
        if type(source_duration) not in (int,float) or not math.isfinite(source_duration) or source_duration<=0:
            raise ArrangementError('Invalid source duration')
        if source_start+duration>source_duration+0.02:raise ArrangementError('Clip exceeds source media duration')

def place(root,catalog,project_id,asset_id,track,start,duration,revision,items,*,layout_root=None,lane=1,source_duration=None,source_has_audio=None):
    if track not in TRACKS:raise ArrangementError('Unsupported track')
    if not isinstance(asset_id,str) or len(asset_id)>300:raise ArrangementError('Invalid asset ID')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (start,duration)) or start<0 or duration<=0 or start+duration>24*60*60:raise ArrangementError('Invalid time range')
    if not isinstance(revision,int) or isinstance(revision,bool):raise ArrangementError('Revision required')
    found=next((a for a in inventory(items)['items'] if a['id']==asset_id and a['available']),None)
    if not found:raise ArrangementError('Asset is not registered or available')
    _source_window(found['category'],0,duration,source_duration)
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        layout={'image_lanes':1}
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            if track in layout.get('locked',[]):raise ArrangementError('Track locked')
        _lane(lane,track,layout)
        if len(data['clips'])>=2000:raise ArrangementError('Clip limit reached')
        clip={'id':str(uuid.uuid4()),'asset_id':asset_id,'name':found['name'],'category':found['category'],'track':track,'lane':lane,'start':round(start,4),'duration':round(duration,4)}
        if found['category'] in {'video','audio','music'}:
            clip['source_start']=0
            if source_duration is not None:clip['source_duration']=round(source_duration,4)
            if source_has_audio is not None:clip['source_has_audio']=bool(source_has_audio)
        data['clips'].append(clip);data['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'clip':clip,'revision':data['revision'],'legacy_engine_unchanged':True}


def timeline_view(root,catalog,project_id):
    """Read-only deterministic projection for the v0.5 timeline and both MCP surfaces."""
    data=read(root,catalog,project_id)
    rows=[]
    for track in sorted(TRACKS):
        clips=sorted((c for c in data['clips'] if c.get('track')==track), key=lambda c:(c.get('lane',1),c['start'],c['id']))
        if clips:rows.append({'track':track,'clips':clips})
    end=max((c['start']+c['duration'] for c in data['clips']),default=0)
    return {'schema':1,'project_id':project_id,'revision':data['revision'],'tracks':rows,'duration':round(end,4),'clip_count':len(data['clips']),'engine_connected':False}


def edit_clip(root,catalog,project_id,clip_id,revision,action,*,start=None,duration=None,track=None,lane=None,source_start=None,source_duration=None,layout_root=None):
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
        layout={'image_lanes':1}
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            locked=set(layout.get('locked',[]))
            if clip['track'] in locked or (action=='update' and track in locked):raise ArrangementError('Track locked')
        if action=='update':
            _lane(clip.get('lane',1) if lane is None and track=='image' else (1 if lane is None else lane),track,layout)
            effective_source=clip.get('source_start',0) if source_start is None else source_start
            effective_duration=clip.get('source_duration') if source_duration is None else source_duration
            _source_window(clip.get('category'),effective_source,duration,effective_duration)
        before=dict(clip)
        if action=='delete':data['clips'].remove(clip)
        else:
            clip.update(start=round(start,4),duration=round(duration,4),track=track,lane=clip.get('lane',1) if lane is None and track=='image' else (1 if lane is None else lane))
            if clip.get('category') in {'video','audio','music'}:
                clip['source_start']=round(effective_source,4)
                if effective_duration is not None:clip['source_duration']=round(effective_duration,4)
        data['revision']+=1
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'action':action,'clip_id':clip_id,'before':before,'clip':None if action=='delete' else dict(clip),'revision':data['revision'],'legacy_engine_unchanged':True}


def split_clip(root,catalog,project_id,clip_id,revision,split_at,*,layout_root=None,source_duration=None):
    """Split timed media without changing its source file or playback window."""
    if not isinstance(clip_id,str) or not clip_id or len(clip_id)>100:raise ArrangementError('Invalid clip ID')
    if type(revision) is not int or revision<0:raise ArrangementError('Revision required')
    if type(split_at) not in (int,float) or not math.isfinite(split_at):raise ArrangementError('Invalid split time')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        clip=next((c for c in data['clips'] if c.get('id')==clip_id),None)
        if clip is None:raise ArrangementError('Clip not found')
        if clip.get('category') not in {'video','audio','music'}:raise ArrangementError('Only video and audio clips can be split')
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            if clip.get('track') in get_layout(layout_root,catalog,project_id).get('locked',[]):raise ArrangementError('Track locked')
        if len(data['clips'])>=2000:raise ArrangementError('Clip limit reached')
        left_duration=round(split_at-clip['start'],4)
        right_duration=round(clip['duration']-left_duration,4)
        if left_duration<0.1 or right_duration<0.1:raise ArrangementError('Split must be inside the clip')
        source_start=round(clip.get('source_start',0)+left_duration,4)
        actual_duration=clip.get('source_duration') if source_duration is None else source_duration
        _source_window(clip['category'],source_start,right_duration,actual_duration)
        before=dict(clip)
        right=dict(clip,id=str(uuid.uuid4()),start=round(clip['start']+left_duration,4),duration=right_duration,source_start=source_start)
        if actual_duration is not None:
            clip['source_duration']=right['source_duration']=round(actual_duration,4)
        clip['duration']=left_duration
        data['clips'].insert(data['clips'].index(clip)+1,right)
        data['revision']+=1;data.pop('undo',None)
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'left':dict(clip),'right':right,'before':before,'revision':data['revision'],'legacy_engine_unchanged':True}


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


def set_clip_target(root,catalog,project_id,clip_id,revision,target_model_id,items,*,layout_root=None):
    """Revision-guarded target binding. Never silently assign an unrelated model."""
    if type(revision) is not int or revision<0: raise ArrangementError('Revision required')
    if not isinstance(clip_id,str) or not clip_id or len(clip_id)>100: raise ArrangementError('Invalid clip ID')
    if target_model_id is not None and (not isinstance(target_model_id,str) or not target_model_id or len(target_model_id)>300):raise ArrangementError('Invalid target model ID')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision: raise ArrangementError('Revision conflict')
        clip=next((c for c in data['clips'] if c.get('id')==clip_id),None)
        if clip is None:raise ArrangementError('Clip not found')
        if clip.get('category')!='motion':raise ArrangementError('Only motion clips support a target model')
        if layout_root is not None:
            from studio_v05_track_layout import get as get_layout
            if clip.get('track') in get_layout(layout_root,catalog,project_id).get('locked',[]):raise ArrangementError('Track locked')
        if target_model_id is not None:
            target=next((a for a in inventory(items)['items'] if a['id']==target_model_id),None)
            if target is None or target['category']!='model' or not target['available']:raise ArrangementError('Target model missing or unavailable')
            clip['target_model_id']=target_model_id
        else:clip.pop('target_model_id',None)
        data['revision']+=1
        data.pop('undo',None)
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'clip_id':clip_id,'target_model_id':target_model_id,'revision':data['revision'],'legacy_engine_unchanged':True}
