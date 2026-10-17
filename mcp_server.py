#!/usr/bin/env python3
"""Dependency-free MCP STDIO bridge to Mixamo local HTTP API (MCP 2024-11-05)."""
import json, sys, os, urllib.request, urllib.error, urllib.parse
from pathlib import Path

BASE=Path(__file__).resolve().parent
HOST=os.environ.get('MIXAMO_VIEWER_URL','http://127.0.0.1:8765').rstrip('/')
if not (HOST.startswith('http://127.0.0.1:') or HOST.startswith('http://localhost:')):
    raise SystemExit('Only loopback endpoints are accepted')

def api(path, payload=None):
    body=None if payload is None else json.dumps(payload,ensure_ascii=False).encode()
    req=urllib.request.Request(HOST+path,data=body,headers={'Content-Type':'application/json'} if body is not None else {},method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(req,timeout=12) as res:return json.loads(res.read())
    except urllib.error.HTTPError as exc:raise ValueError(f'HTTP {exc.code}: {exc.read(600).decode(errors="replace")}')
    except urllib.error.URLError as exc:raise ConnectionError('Mixamo viewer is not running. Start 起動.bat / start.sh first: '+str(exc.reason))

def catalog():
    p=BASE/'MOTION_CATALOG_50.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else []

def norm(s):return ''.join(ch for ch in s.lower().removesuffix('.fbx') if ch in 'abcdefghijklmnopqrstuvwxyz0123456789')

def installed():
    m=api('/api/manifest'); keys={norm(x['name']) for x in m.get('files',[]) if x.get('kind')=='motions'}
    return m,keys

def valid_names(names):
    if not isinstance(names,list) or not names or len(names)>300 or not all(isinstance(n,str) and len(n)<=250 for n in names):raise ValueError('names must contain 1–300 motion names')
    m,keys=installed(); mapped=m.get('mapping',{})
    missing=[n for n in names if norm(mapped.get(n,n)) not in keys]
    if missing:raise ValueError('Unregistered motions: '+', '.join(missing[:15]))
    return True

def project_default():return {'schema':1,'timeline':[],'history':[],'cursor':-1}

def update_chain(action, name=None, from_index=None,to_index=None):
    p=api('/api/project');p=p if p.get('schema')==1 else project_default()
    seq=[dict(s) for s in p.get('timeline',[])]
    if action=='add':valid_names([name]);seq.append({'name':name})
    elif action=='remove':
        if from_index is None or not 0<=from_index<len(seq):raise ValueError('index out of range')
        seq.pop(from_index)
    elif action=='move':
        if not all(isinstance(i,int) and 0<=i<len(seq) for i in (from_index,to_index)):raise ValueError('index out of range')
        step=seq.pop(from_index);seq.insert(to_index,step)
    elif action=='replace':valid_names([name]);seq=[{'name':name}]
    if len(seq)>300:raise ValueError('too many steps')
    history=p.get('history',[])[:p.get('cursor',-1)+1]
    history.append({'timeline':[dict(x) for x in seq],'label':'MCP '+action});history=history[-120:]
    p.update(schema=1,timeline=seq,history=history,cursor=len(history)-1)
    api('/api/project',p)
    return {'timeline':seq,'history_count':len(history)}

def run(name,a):
    if name=='mixamo_motion_channels':return api('/api/retarget/motion-channels?id='+urllib.parse.quote(a['id'],safe=''))
    if name=='mixamo_retarget_analyze':return api('/api/retarget/analyze?id='+__import__('urllib.parse',fromlist=['quote']).quote(a['id'],safe=''))
    if name=='mixamo_retarget_compare':
        from urllib.parse import quote
        return api('/api/retarget/compare?source='+quote(a['source'],safe='')+'&target='+quote(a['target'],safe=''))
    if name=='mixamo_retarget_pose_proposal':
        from urllib.parse import quote
        return api('/api/retarget/pose-proposal?source='+quote(a['source'],safe='')+'&target='+quote(a['target'],safe=''))
    if name=='mixamo_retarget_calibration':
        from urllib.parse import quote
        return api('/api/retarget/calibration?source='+quote(a['source'],safe='')+'&target='+quote(a['target'],safe=''))
    if name=='mixamo_retarget_root_preview':return api('/api/retarget/root-preview',a)
    if name=='mixamo_retarget_profiles_get':return api('/api/retarget/profiles')
    if name=='mixamo_retarget_profiles_set':return api('/api/retarget/profiles',{'schema':1,'profiles':a['profiles']})
    if name=='mixamo_motion_layers_get':return api('/api/motion-layers')
    if name=='mixamo_motion_layers_set':return api('/api/motion-layers',{'schema':1,'layers':a['layers']})
    if name=='mixamo_timeline_get':return api('/api/timeline-editor')
    if name=='mixamo_timeline_set':return api('/api/timeline-editor',{'schema':1,'clips':a['clips']})
    if name=='mixamo_list_all_assets':return api('/api/assets')
    if name=='mixamo_integrated_v02_search':
        c=api('/api/integrated-v02/catalog');q=a.get('query','').lower();return {'matches':[x for x in c['motions'] if q in json.dumps(x,ensure_ascii=False).lower()][:100]}
    if name=='mixamo_integrated_retarget':return api('/api/sync-command',{'action':'integrated_retarget','name':a['asset'],'target':a['target']})
    if name=='mixamo_integrated_preview':return api('/api/sync-command',{'action':'integrated_preview','name':a['asset']})
    if name=='mixamo_integrated_v02_models':return {'models':api('/api/integrated-v02/catalog')['models']}
    if name=='mixamo_health':return {'ok':True,'manifest':len(api('/api/manifest').get('files',[])),'url':HOST}
    if name=='mixamo_list_patterns':
        q=a.get('query','').lower();return [x for x in catalog() if q in json.dumps(x,ensure_ascii=False).lower()][:min(100,max(1,a.get('limit',30)))]
    if name=='mixamo_list_fbx':return api('/api/manifest')
    if name=='mixamo_list_mmd_assets':return api('/api/mmd-assets')
    if name=='mixamo_get_project':return api('/api/project')
    if name=='mixamo_get_favorites':
        q=a.get('query','').lower();return [x for x in api('/api/favorites') if q in (x.get('name','')+' '+' '.join(x.get('tags',[]))).lower()]
    if name=='mixamo_get_conversion_map':return api('/api/conversion-map')
    if name=='mixamo_add_clip':return update_chain('add',name=a['name'])
    if name=='mixamo_remove_clip':return update_chain('remove',from_index=a['index'])
    if name=='mixamo_reorder_clip':return update_chain('move',from_index=a['from_index'],to_index=a['to_index'])
    if name=='mixamo_save_favorite':
        import uuid
        p=api('/api/project');steps=p.get('timeline',[])
        if not steps:raise ValueError('Project has no timeline steps')
        title=a['name'].strip();tags=a.get('tags',[])
        if not title or len(title)>180 or not isinstance(tags,list) or len(tags)>20 or not all(isinstance(t,str) and len(t)<=60 for t in tags):raise ValueError('invalid title/tags')
        favorites=api('/api/favorites');item={'id':uuid.uuid4().hex,'name':title,'tags':tags,'steps':steps}
        favorites.append(item);api('/api/favorites',favorites);return item
    if name=='mixamo_play_chain':return api('/api/sync-command',{'action':'play_chain'})
    if name=='mixamo_stop_chain':return api('/api/sync-command',{'action':'stop_chain'})
    if name=='mixamo_preview_motion':return api('/api/sync-command',{'action':'preview_motion','name':a['name']})
    if name=='mixamo_open_pmx':return api('/api/sync-command',{'action':'open_pmx'})
    if name=='mixamo_sync_status':return api('/api/sync')
    if name=='mixamo_run_vmd_conversion':return api('/api/run-vmd-conversion',{'confirm':a['confirm'],'slot':a.get('slot','A')})
    if name=='mixamo_conversion_status':return api('/api/conversion-status')
    if name=='mixamo_export_vmd_job':
        p=api('/api/project');names=[s['name'] for s in p.get('timeline',[])]
        valid_names(names)
        bm=a.get('bone_map') or api('/api/conversion-map')
        if not bm:raise ValueError('Bone mapping is empty. Provide bone_map or configure it in the viewer.')
        return api('/api/export-vmd-job',{'names':names,'bone_map':bm,'scale':a.get('scale',1.0),'blend_frames':a.get('blend_frames',6),'bone_corrections':a.get('bone_corrections',{})})
    if name=='mixamo_set_conversion_map':
        mapping=a['bone_map']
        if not isinstance(mapping,dict) or not mapping:raise ValueError('nonempty bone_map required')
        return api('/api/conversion-map',mapping)
    raise ValueError('Unknown tool: '+name)

S=lambda props=None,req=None:{'type':'object','properties':props or {},'required':req or [],'additionalProperties':False}
STR={'type':'string'};INT={'type':'integer'}
TOOLS=[
('mixamo_retarget_analyze','Analyze registered skeleton and clips without altering source.',S({'id':STR},['id'])),
('mixamo_retarget_compare','Compare semantic role mapping of two registered assets.',S({'source':STR,'target':STR},['source','target'])),
('mixamo_retarget_pose_proposal','Estimate rest-direction rotations for matching bones; preview-only, not validated retarget.',S({'source':STR,'target':STR},['source','target'])),
('mixamo_retarget_calibration','Propose read-only scale and mapping from available positions.',S({'source':STR,'target':STR},['source','target'])),
('mixamo_retarget_root_preview','Preview root position scaling and yaw without writing animation.',S({'samples':{'type':'array','items':{'type':'object'}},'scale':{'type':'number'},'yaw_offset_deg':{'type':'number'}},['samples','scale'])),
('mixamo_motion_channels','Inspect GLB/BVH animation channels without changing files.',S({'id':{'type':'string'}},['id'])),
('mixamo_retarget_profiles_get','Read stored mapping profiles.',S()),
('mixamo_retarget_profiles_set','Save non-destructive mapping profiles.',S({'profiles':{'type':'object'}},['profiles'])),
('mixamo_motion_layers_get','Read non-destructive rotation correction layers.',S()),
('mixamo_motion_layers_set','Save per-bone correction keys and enable flags.',S({'layers':{'type':'array','items':{'type':'object'}}},['layers'])),
('mixamo_timeline_get','Read saved timeline clip positions, lengths, speeds and blends.',S()),
('mixamo_timeline_set','Save non-destructive timeline edit parameters.',S({'clips':{'type':'array','items':{'type':'object'}}},['clips'])),
('mixamo_health','Check that local viewer HTTP server is running.',S()),
('mixamo_list_all_assets','List registered FBX GLB VRM PMX VMD from a shared inventory.',S()),
('mixamo_integrated_v02_search','Search imported motion definitions; metadata only, no playback.',S({'query':STR})),
('mixamo_integrated_v02_models','List imported source VRM model metadata.',S()),
('mixamo_integrated_preview','Ask connected browser to preview a registered GLB/VRM asset.',S({'asset':STR},['asset'])),
('mixamo_integrated_retarget','Ask browser to approximate humanoid bone rotation transfer GLB to VRM and show 3 synchronized columns; requires connected browser.',S({'asset':STR,'target':STR},['asset','target'])),
('mixamo_list_patterns','Search built-in combination catalog.',S({'query':STR,'limit':INT})),
('mixamo_list_fbx','List imported FBX files and name mapping.',S()),
('mixamo_list_mmd_assets','List imported PMX, VMD and textures.',S()),
('mixamo_get_project','Read saved timeline, history and project.',S()),
('mixamo_get_favorites','Search saved favorite combinations.',S({'query':STR})),
('mixamo_get_conversion_map','Read Mixamo to PMX bone map.',S()),
('mixamo_add_clip','Append imported FBX motion to saved timeline.',S({'name':STR},['name'])),
('mixamo_remove_clip','Delete timeline step at zero-based index.',S({'index':INT},['index'])),
('mixamo_reorder_clip','Move timeline step between zero-based indices.',S({'from_index':INT,'to_index':INT},['from_index','to_index'])),
('mixamo_save_favorite','Save current timeline as tagged favorite.',S({'name':STR,'tags':{'type':'array','items':STR}},['name'])),
('mixamo_set_conversion_map','Replace Mixamo to PMX bone map (explicit write).',S({'bone_map':{'type':'object'}},['bone_map'])),
('mixamo_play_chain','Ask connected browser to play the full chain.',S()),
('mixamo_stop_chain','Stop chain playback in connected browser.',S()),
('mixamo_preview_motion','Ask browser to select a motion.',S({'name':STR},['name'])),
('mixamo_open_pmx','Open PMX tab in connected browser.',S()),
('mixamo_sync_status','Read sync revision and latest browser command.',S()),
('mixamo_conversion_status','Read last Blender conversion status.',S()),
('mixamo_run_vmd_conversion','Execute prepared Blender conversion, register VMD and ask browser to preview; explicit confirmation required.',S({'confirm':{'type':'boolean'},'slot':{'type':'string','enum':['A','B']}},['confirm'])),
('mixamo_export_vmd_job','Generate Blender job JSON for saved timeline; does NOT render VMD.',S({'bone_map':{'type':'object'},'scale':{'type':'number'},'blend_frames':INT,'bone_corrections':{'type':'object'}})),
]
def process(m):
    ident=m.get('id');method=m.get('method');params=m.get('params') or {}
    if method=='notifications/initialized':return None
    if ident is None:return None
    try:
        if method=='initialize':out={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'mixamo-fighting-viewer','version':'1.0.0'}}
        elif method=='ping':out={}
        elif method=='tools/list':out={'tools':[{'name':n,'description':d,'inputSchema':s} for n,d,s in TOOLS]}
        elif method=='tools/call':
            value=run(params['name'],params.get('arguments') or {})
            out={'content':[{'type':'text','text':json.dumps(value,ensure_ascii=False)}]}
        else:return {'jsonrpc':'2.0','id':ident,'error':{'code':-32601,'message':'Method not found'}}
        return {'jsonrpc':'2.0','id':ident,'result':out}
    except Exception as e:
        if method=='tools/call':return {'jsonrpc':'2.0','id':ident,'result':{'content':[{'type':'text','text':str(e)}],'isError':True}}
        return {'jsonrpc':'2.0','id':ident,'error':{'code':-32602,'message':str(e)}}

def main():
    for line in sys.stdin:
        try:
            message=json.loads(line);response=process(message)
            if response is not None:print(json.dumps(response,ensure_ascii=False),flush=True)
        except Exception as e:print('MCP malformed request: '+str(e),file=sys.stderr,flush=True)
if __name__=='__main__':main()
