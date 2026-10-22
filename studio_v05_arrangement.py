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

def place(root,catalog,project_id,asset_id,track,start,duration,revision,items):
    if track not in TRACKS:raise ArrangementError('Unsupported track')
    if not isinstance(asset_id,str) or len(asset_id)>300:raise ArrangementError('Invalid asset ID')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (start,duration)) or start<0 or duration<=0 or start+duration>24*60*60:raise ArrangementError('Invalid time range')
    if not isinstance(revision,int) or isinstance(revision,bool):raise ArrangementError('Revision required')
    found=next((a for a in inventory(items)['items'] if a['id']==asset_id and a['available']),None)
    if not found:raise ArrangementError('Asset is not registered or available')
    with LOCK:
        data=read(root,catalog,project_id)
        if data['revision']!=revision:raise ArrangementError('Revision conflict')
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
