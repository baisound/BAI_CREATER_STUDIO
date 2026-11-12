"""Isolated v0.5 asset-to-timeline arrangement; legacy engine remains untouched."""
import copy, json, math, threading, uuid
from contextlib import nullcontext
from pathlib import Path
from bai_studio.projects.catalog import load as load_catalog, _atomic
LOCK=threading.RLock()
CATEGORIES={'model','motion','expression','lip','camera','light','effect','image','video','music','audio','other'}
TRACKS={'model','motion','expression','lip','camera','light','effect','image','video','music','audio'}
class ArrangementError(ValueError): pass
HISTORY_LIMIT=32
HISTORY_BYTES=8*1024*1024


def _history(data,allow_stale=False):
    history=data.get('clip_history',{'revision':data['revision'],'undo':[],'redo':[]})
    if (not isinstance(history,dict) or set(history)!={'revision','undo','redo'} or
        type(history['revision']) is not int or
        any(not isinstance(history[k],list) or len(history[k])>HISTORY_LIMIT for k in ('undo','redo'))):
        raise ArrangementError('Invalid edit history; original retained')
    if history['revision']!=data['revision']:
        if allow_stale:return {'revision':data['revision'],'undo':[],'redo':[]}
        raise ArrangementError('Edit history revision conflict')
    for entry in history['undo']+history['redo']:
        if not isinstance(entry,dict) or set(entry)!={'clips','operation'} or not isinstance(entry['clips'],list) or not isinstance(entry['operation'],str):
            raise ArrangementError('Invalid edit history; original retained')
    return copy.deepcopy(history)


def _bound_history(history):
    for stack in ('undo','redo'):history[stack]=history[stack][-HISTORY_LIMIT:]
    # Keep the newest available action when large arrangements fill the budget.
    while len(json.dumps(history,ensure_ascii=False).encode('utf-8'))>HISTORY_BYTES:
        stack=max(('undo','redo'),key=lambda k:len(history[k]))
        if not history[stack]:break
        history[stack].pop(0)
    return history


def _record_edit(data,before,operation):
    history=_history(data,allow_stale=True)
    # Migrate an older, still valid one-step batch undo before the next edit.
    old=data.get('undo')
    if 'clip_history' not in data and isinstance(old,dict) and old.get('from_revision')==data['revision'] and isinstance(old.get('clips'),list):
        history['undo'].append({'clips':copy.deepcopy(old['clips']),'operation':'batch'})
    history['undo'].append({'clips':before,'operation':operation});history['redo']=[]
    data['revision']+=1;history['revision']=data['revision']
    data['clip_history']=_bound_history(history);data.pop('undo',None)


def history_status(data):
    history=_history(data,allow_stale=True)
    old=data.get('undo')
    legacy='clip_history' not in data and isinstance(old,dict) and old.get('from_revision')==data['revision'] and isinstance(old.get('clips'),list)
    return {'undo_count':len(history['undo']) or int(legacy),'redo_count':len(history['redo'])}


def public_read(root,catalog,project_id):
    data=read(root,catalog,project_id)
    return {**{k:v for k,v in data.items() if k not in ('clip_history','undo')},'edit_history':history_status(data)}


def _layout_guard(layout_root):
    if layout_root is None:return nullcontext()
    from bai_studio.v05.timeline.track_layout import LOCK as layout_lock
    return layout_lock


def edit_history(root,catalog,project_id,revision,action,*,layout_root=None):
    """Restore clip metadata atomically, keeping monotonic project revisions."""
    if type(revision) is not int or revision<0:raise ArrangementError('Revision required')
    if action not in ('undo','redo'):raise ArrangementError('Invalid history action')
    with LOCK, _layout_guard(layout_root):
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        history=_history(data)
        if action=='undo' and not history['undo'] and 'clip_history' not in data:
            old=data.get('undo')
            if isinstance(old,dict) and old.get('from_revision')==revision and isinstance(old.get('clips'),list):
                history['undo'].append({'clips':copy.deepcopy(old['clips']),'operation':'batch'})
        if not history[action]:raise ArrangementError('No '+action+' available')
        entry=history[action][-1];target=entry['clips']
        if len(target)>2000:raise ArrangementError('Invalid edit history; original retained')
        layout=None
        if layout_root is not None:
            from bai_studio.v05.timeline.track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
        ids=set()
        for clip in target:
            if not isinstance(clip,dict) or not isinstance(clip.get('id'),str) or clip['id'] in ids or clip.get('track') not in TRACKS:
                raise ArrangementError('Invalid edit history; original retained')
            ids.add(clip['id']);start,duration=clip.get('start'),clip.get('duration')
            if any(type(v) not in (int,float) or not math.isfinite(v) for v in (start,duration)) or start<0 or duration<=0 or start+duration>86400:
                raise ArrangementError('Invalid history time range')
            _source_window(clip.get('category'),clip.get('source_start',0),duration,clip.get('source_duration'))
            if layout is not None:_lane(clip.get('lane',1),clip['track'],layout)
        if layout is not None:
            current={c['id']:c for c in data['clips']};restored={c['id']:c for c in target};locked=set(layout.get('locked',[]))
            for cid in current.keys()|restored.keys():
                before,after=current.get(cid),restored.get(cid)
                if before!=after and any(c and c['track'] in locked for c in (before,after)):raise ArrangementError('Track locked')
        reverse='redo' if action=='undo' else 'undo'
        history[action].pop();history[reverse].append({'clips':copy.deepcopy(data['clips']),'operation':entry['operation']})
        data['clips']=target;data['revision']+=1;history['revision']=data['revision']
        data['clip_history']=_bound_history(history);data.pop('undo',None)
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'revision':data['revision'],'action':action,'edit_history':history_status(data),'legacy_engine_unchanged':True}

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
    # On Windows an overlapping read handle can prevent atomic replacement.
    # Use the same reentrant lock as clip writes/Undo while the file is open.
    with LOCK:
        data=json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema')!=1 or data.get('project_id')!=project_id or not isinstance(data.get('clips'),list) or not isinstance(data.get('revision'),int):raise ArrangementError('Invalid arrangement; original retained')
    return data

def _lane(lane,track,layout):
    if type(lane) is not int or lane<1:raise ArrangementError('Invalid lane')
    if track not in {'image','video','audio','music'} and lane!=1:raise ArrangementError('This track does not support multiple lanes')
    if track=='image' and lane not in layout.get('image_lane_ids',range(1,layout.get('image_lanes',1)+1)):raise ArrangementError('Image lane does not exist')
    if track=='video' and lane not in layout.get('video_lane_ids',[1]):raise ArrangementError('Video lane does not exist')
    if track in {'audio','music'} and lane not in layout.get(track+'_lane_ids',[1]):raise ArrangementError('Audio lane does not exist')
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

def place(root,catalog,project_id,asset_id,track,start,duration,revision,items,*,layout_root=None,lane=1,source_duration=None,source_has_audio=None,source_start=0):
    if track not in TRACKS:raise ArrangementError('Unsupported track')
    if not isinstance(asset_id,str) or len(asset_id)>300:raise ArrangementError('Invalid asset ID')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (start,duration)) or start<0 or duration<=0 or start+duration>24*60*60:raise ArrangementError('Invalid time range')
    if not isinstance(revision,int) or isinstance(revision,bool):raise ArrangementError('Revision required')
    found=next((a for a in inventory(items)['items'] if a['id']==asset_id and a['available']),None)
    if not found:raise ArrangementError('Asset is not registered or available')
    _source_window(found['category'],source_start,duration,source_duration)
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        layout={'image_lanes':1}
        if layout_root is not None:
            from bai_studio.v05.timeline.track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            if track in layout.get('locked',[]):raise ArrangementError('Track locked')
        _lane(lane,track,layout)
        if len(data['clips'])>=2000:raise ArrangementError('Clip limit reached')
        clip={'id':str(uuid.uuid4()),'asset_id':asset_id,'name':found['name'],'category':found['category'],'track':track,'lane':lane,'start':round(start,4),'duration':round(duration,4)}
        if found['category'] in {'video','audio','music'}:
            clip['source_start']=round(source_start,4)
            if source_duration is not None:clip['source_duration']=round(source_duration,4)
            if source_has_audio is not None:clip['source_has_audio']=bool(source_has_audio)
        before=copy.deepcopy(data['clips']);data['clips'].append(clip);_record_edit(data,before,'place')
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
    return {'schema':1,'project_id':project_id,'revision':data['revision'],'tracks':rows,'duration':round(end,4),'clip_count':len(data['clips']),'engine_connected':False,'edit_history':history_status(data)}


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
            from bai_studio.v05.timeline.track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            locked=set(layout.get('locked',[]))
            if clip['track'] in locked or (action=='update' and track in locked):raise ArrangementError('Track locked')
        if action=='update':
            _lane(clip.get('lane',1) if lane is None and track in {'image','video','audio','music'} and track==clip['track'] else (1 if lane is None else lane),track,layout)
            effective_source=clip.get('source_start',0) if source_start is None else source_start
            effective_duration=clip.get('source_duration') if source_duration is None else source_duration
            _source_window(clip.get('category'),effective_source,duration,effective_duration)
        before=dict(clip);history_before=copy.deepcopy(data['clips'])
        if action=='delete':data['clips'].remove(clip)
        else:
            clip.update(start=round(start,4),duration=round(duration,4),track=track,lane=clip.get('lane',1) if lane is None and track in {'image','video','audio','music'} and track==clip['track'] else (1 if lane is None else lane))
            if clip.get('category') in {'video','audio','music'}:
                clip['source_start']=round(effective_source,4)
                if effective_duration is not None:clip['source_duration']=round(effective_duration,4)
        _record_edit(data,history_before,action)
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
            from bai_studio.v05.timeline.track_layout import get as get_layout
            if clip.get('track') in get_layout(layout_root,catalog,project_id).get('locked',[]):raise ArrangementError('Track locked')
        if len(data['clips'])>=2000:raise ArrangementError('Clip limit reached')
        left_duration=round(split_at-clip['start'],4)
        right_duration=round(clip['duration']-left_duration,4)
        if left_duration<0.1 or right_duration<0.1:raise ArrangementError('Split must be inside the clip')
        source_start=round(clip.get('source_start',0)+left_duration,4)
        actual_duration=clip.get('source_duration') if source_duration is None else source_duration
        _source_window(clip['category'],source_start,right_duration,actual_duration)
        before=dict(clip);history_before=copy.deepcopy(data['clips'])
        right=dict(clip,id=str(uuid.uuid4()),start=round(clip['start']+left_duration,4),duration=right_duration,source_start=source_start)
        if actual_duration is not None:
            clip['source_duration']=right['source_duration']=round(actual_duration,4)
        clip['duration']=left_duration
        data['clips'].insert(data['clips'].index(clip)+1,right)
        _record_edit(data,history_before,'split')
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
            from bai_studio.v05.timeline.track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            locked=set(layout.get('locked',[]))
            for e in edits:
                previous=mapping[e['clip_id']]
                target_lane=previous.get('lane',1) if e['track']==previous['track'] else 1
                _lane(target_lane,e['track'],layout)
            if any(mapping[e['clip_id']]['track'] in locked or e['track'] in locked for e in edits):raise ArrangementError('Track locked')
        before=copy.deepcopy(data['clips'])
        for e in edits:
            c=mapping[e['clip_id']]
            _source_window(c.get('category'),c.get('source_start',0),e['duration'],c.get('source_duration'))
        for e in edits:
            c=mapping[e['clip_id']]
            c.update(start=round(e['start'],4),duration=round(e['duration'],4),lane=c.get('lane',1) if e['track']==c['track'] else 1,track=e['track'])
        _record_edit(data,before,'batch')
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'revision':data['revision'],'updated':len(edits),'legacy_engine_unchanged':True}

def undo_batch(root,catalog,project_id,revision,*,layout_root=None):
    if type(revision) is not int or revision<0:raise ArrangementError('Invalid revision')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
        if 'clip_history' in data:
            history=_history(data)
            if not history['undo'] or history['undo'][-1]['operation']!='batch':raise ArrangementError('No undo available')
            result=edit_history(root,catalog,project_id,revision,'undo',layout_root=layout_root)
            return {**result,'undone':True}
        undo=data.get('undo')
        if not isinstance(undo,dict) or undo.get('from_revision')!=revision or not isinstance(undo.get('clips'),list):raise ArrangementError('No undo available')
        if layout_root is not None:
            from bai_studio.v05.timeline.track_layout import get as get_layout
            layout=get_layout(layout_root,catalog,project_id)
            current={c['id']:c for c in data['clips']}
            locked=set(layout.get('locked',[]))
            if any(current.get(c['id'])!=c and
                   (c['track'] in locked or current.get(c['id'],{}).get('track') in locked)
                   for c in undo['clips']):raise ArrangementError('Track locked')
            for c in undo['clips']:_lane(c.get('lane',1),c['track'],layout)
        result=edit_history(root,catalog,project_id,revision,'undo',layout_root=layout_root)
        return {**result,'undone':True}


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
            from bai_studio.v05.timeline.track_layout import get as get_layout
            if clip.get('track') in get_layout(layout_root,catalog,project_id).get('locked',[]):raise ArrangementError('Track locked')
        before=copy.deepcopy(data['clips'])
        if target_model_id is not None:
            target=next((a for a in inventory(items)['items'] if a['id']==target_model_id),None)
            if target is None or target['category']!='model' or not target['available']:raise ArrangementError('Target model missing or unavailable')
            clip['target_model_id']=target_model_id
        else:clip.pop('target_model_id',None)
        _record_edit(data,before,'target')
        _atomic(Path(root)/(project_id+'.json'),data)
        return {'clip_id':clip_id,'target_model_id':target_model_id,'revision':data['revision'],'legacy_engine_unchanged':True}
