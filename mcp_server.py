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
    if name=='bai_studio_project_activation_preview':return api('/api/studio/v05/project/activation-preview?id='+urllib.parse.quote(a['id']))
    if name=='bai_studio_project_activate':return api('/api/studio/v05/project/activate',a)
    if name=='bai_studio_project_snapshot_get':return api('/api/studio/v05/project/snapshot?id='+urllib.parse.quote(a['id']))
    if name=='bai_studio_project_snapshot_save':return api('/api/studio/v05/project/snapshot',{'id':a['id']})
    if name=='bai_studio_asset_capabilities':return api('/api/studio/v05/assets/capabilities')
    if name=='bai_studio_scene_multi_motion_plan':return api('/api/studio/v05/scene/multi-motion-plan?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_scene_motion_target_set':return api('/api/studio/v05/scene/motion-target',a)
    if name=='bai_studio_scene_motion_plan':return api('/api/studio/v05/scene/motion-plan?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_scene_model_candidates':return api('/api/studio/v05/scene/model-candidates')
    if name=='bai_studio_scene_instances_get':return api('/api/studio/v05/scene/instances?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_scene_preview_plan':
        r=api('/api/studio/v05/scene/instances?id='+urllib.parse.quote(a['project_id']))
        return {'project_id':r['project_id'],'revision':r['revision'],'instances':r['instances'],'renderer_verified':False,'note':'Preview rendering is browser-local; this tool reads saved scene placement only.'}
    if name=='bai_studio_scene_instances_mutate':return api('/api/studio/v05/scene/instances',a)
    if name=='bai_studio_scene_model_get':return api('/api/studio/v05/scene/model?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_scene_model_set':return api('/api/studio/v05/scene/model',a)
    if name=='bai_studio_asset_sources_get':return api('/api/studio/v05/asset-sources')
    if name=='bai_studio_asset_source_register':return api('/api/studio/v05/asset-sources/register',a)
    if name=='bai_studio_asset_source_relink':return api('/api/studio/v05/asset-sources/relink',a)
    if name=='bai_studio_assets_search':return api('/api/studio/v05/assets?category='+urllib.parse.quote(a.get('category','all'))+'&query='+urllib.parse.quote(a.get('query','')))
    if name=='bai_studio_track_layout_get':return api('/api/studio/v05/timeline/layout?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_track_layout_set':return api('/api/studio/v05/timeline/layout',a)
    if name=='bai_studio_playhead_get':return api('/api/studio/v05/playhead?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_playhead_set':return api('/api/studio/v05/playhead',a)
    if name=='bai_studio_timeline_view':return api('/api/studio/v05/timeline/view?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_arrangement_get':return api('/api/studio/v05/arrangement?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_batch_move':return api('/api/studio/v05/arrangement/batch-move',a)
    if name=='bai_studio_batch_undo':return api('/api/studio/v05/arrangement/undo',a)
    if name=='bai_studio_track_flags_set':return api('/api/studio/v05/timeline/flags',a)
    if name=='bai_studio_clip_target_set':return api('/api/studio/v05/arrangement/clip/target',a)
    if name=='bai_studio_clip_edit':return api('/api/studio/v05/arrangement/clip/edit',a)
    if name=='bai_studio_clip_place':return api('/api/studio/v05/arrangement/place',a)
    if name=='bai_studio_focus_reports_get':return api('/api/studio/v05/focus-reports?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_focus_reports_save':return api('/api/studio/v05/focus-reports',a)
    if name=='bai_studio_focus_target_get':return api('/api/studio/v05/focus-target?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_focus_target_set':return api('/api/studio/v05/focus-target',a)
    if name=='bai_studio_project_fps_get':return api('/api/studio/v05/project/fps?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_project_fps_set':return api('/api/studio/v05/project/fps',a)
    if name=='bai_studio_projects_list':return api('/api/studio/v05/projects')
    if name=='bai_studio_project_create':return api('/api/studio/v05/projects',a)
    if name=='bai_studio_project_rename':return api('/api/studio/v05/projects/rename',a)
    if name=="bai_camera_get":return api("/api/camera/project")
    if name=="bai_camera_set":return api("/api/camera/project",a)
    if name=="bai_camera_sequence_edit":return api("/api/camera/sequence/edit",a)
    if name=="bai_camera_sequence_evaluate":return api("/api/camera/sequence/evaluate?frame="+str(a["frame"]))
    if name=="bai_camera_sample":return api("/api/camera/sample?frame="+str(a["frame"]))
    if name=='bai_pose_ik_get':return api('/api/pose/last')
    if name=='bai_pose_ik_solve':return api('/api/pose/solve',a)
    if name=='bai_pose_ik_save':return api('/api/pose/save',a)
    if name=='bai_ai_status':return api('/api/ai/status')
    if name=='bai_ai_settings':return api('/api/ai/settings')
    if name=='bai_ai_pose_proposal':return api('/api/ai/pose-proposal',{'text':a['text']})
    if name=='bai_ai_ik_preview':return api('/api/ai/ik-preview',{'text':a['text'],'baseline':a['baseline']})
    if name=='bai_bvh_foot_world_qa':return api('/api/qa/bvh-foot-world',a)
    if name=='bai_dual_foot_preview':return api('/api/qa/dual-foot-preview',a)
    if name=='mixamo_foot_contact_qa':return api('/api/qa/foot-contact',a)
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
    if name=='bai_retarget_explicit_rest_preview':return api('/api/retarget/explicit-rest-preview',a)
    if name=='bai_retarget_rest_pose_inspection':return api('/api/retarget/rest-pose-inspection',a)
    if name=='bai_retarget_glb_clip_hierarchy_inspection':return api('/api/retarget/glb-clip-hierarchy-inspection',a)
    if name=='bai_retarget_keyframe_review':return api('/api/retarget/keyframe-review',a)
    if name=='bai_retarget_review_bundle':return api('/api/retarget/review-bundle',a)
    if name=='bai_retarget_vrm_local_transfer_preview':return api('/api/retarget/vrm-local-transfer-preview',a)
    if name=='bai_retarget_glb_clip_rest_preview':return api('/api/retarget/glb-clip-rest-preview',a)
    if name=='bai_retarget_world_rest_motion_preview':return api('/api/retarget/world-rest-motion-preview',a)
    if name=='bai_retarget_rest_hierarchy_inspection':return api('/api/retarget/rest-hierarchy-inspection',a)
    if name=='bai_vrm_humanoid_mapping_suggest':return api('/api/retarget/vrm-humanoid-preview',a)
    if name=='bai_retarget_mapping_preview':return api('/api/retarget/mapping-preview',a)
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
('bai_studio_project_activation_preview','Preview differences and get current revision before activating stored project.',S({'id':STR},['id'])),
('bai_studio_project_activate','Explicitly activate saved project; requires confirm=true and preview revision; automatically backs up existing state.',S({'id':STR,'expected_revision':STR,'confirm':{'type':'boolean'}},['id','expected_revision','confirm'])),
('bai_studio_project_snapshot_get','Read a per-project saved snapshot without activating it.',S({'id':STR},['id'])),
('bai_studio_project_snapshot_save','Capture legacy active combination/camera bundle into per-project snapshot without switching projects.',S({'id':STR},['id'])),
('bai_studio_asset_capabilities','Read supported v0.5 import types and searchable categories.',S()),
('bai_studio_scene_multi_motion_plan','Read validated scene-instance-specific motion assignments and readiness.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_motion_target_set','Assign one motion clip to an explicit scene instance, with revision check.',S({'project_id':STR,'clip_id':STR,'revision':INT,'instance_id':{'type':['string','null']}},['project_id','clip_id','revision','instance_id'])),
('bai_studio_scene_motion_plan','Read valid motion-to-scene-model pairings, format compatibility, and preview readiness.',S({'project_id':STR},['project_id'])),
 ('bai_studio_scene_model_candidates','List actually previewable model assets.',S()),
('bai_studio_scene_instances_get','Get project scene instances and independent transforms.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_preview_plan','Read model placement plan for shared 3D preview, not live GPU state.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_instances_mutate','Add/update/remove a scene instance, camera, or PMX face key using a revision.',S({'project_id':STR,'action':{'type':'string','enum':['add','update','remove','camera','face-set','face-remove','face-move']},'revision':INT,'instance_id':STR,'asset_id':STR,'transform':{'type':'object'},'visible':{'type':'boolean'},'locked':{'type':'boolean'},'camera':{'type':'object','properties':{'position':{'type':'array','items':{'type':'number'}},'target':{'type':'array','items':{'type':'number'}},'fov':{'type':'number'}},'required':['position','target','fov'],'additionalProperties':False},'face_key':{'type':'object','properties':{'instance_id':STR,'morph_name':STR,'time':{'type':'number'},'value':{'type':'number'},'track':{'type':'string','enum':['expression','lip']},'to_time':{'type':'number'}},'required':['instance_id','morph_name','time'],'additionalProperties':False}},['project_id','action','revision'])),
('bai_studio_scene_model_get','Read a single-model scene placement for a project.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_model_set','Save or remove a project scene model with XYZ transform and revision.',S({'project_id':STR,'asset_id':{'type':['string','null']},'transform':{'type':['object','null']},'revision':INT},['project_id','asset_id','transform','revision'])),
('bai_studio_asset_sources_get','Get registered reference paths (within the approved inbox) and catalog revision.',S()),
('bai_studio_asset_source_register','Register approved inbox file as a read-only reference or managed library copy, with SHA-256 deduplication.',S({'relative_path':STR,'kind':STR,'mode':{'type':'string','enum':['reference','copy']},'revision':INT},['relative_path','kind','mode','revision'])),
('bai_studio_asset_source_relink','Relink an existing reference to identical content in the approved inbox.',S({'asset_id':STR,'relative_path':STR,'revision':INT},['asset_id','relative_path','revision'])),
('bai_studio_assets_search','Search registered local assets by category and text.',S({'category':STR,'query':STR})),
('bai_studio_track_layout_get','Read project track order and heights.',S({'project_id':STR},['project_id'])),
('bai_studio_track_layout_set','Update track order and heights with revision guard.',S({'project_id':STR,'revision':{'type':'integer'},'order':{'type':'array','items':STR},'heights':{'type':'object','additionalProperties':{'type':'integer'}}},['project_id','revision','order','heights'])),
('bai_studio_playhead_get','Read saved edit cursor; not engine playback.',S({'project_id':STR},['project_id'])),
('bai_studio_playhead_set','Set saved edit cursor, revision guarded; no engine seek.',S({'project_id':STR,'seconds':{'type':'number'},'revision':{'type':'integer'}},['project_id','seconds','revision'])),
('bai_studio_timeline_view','Read deterministic track-grouped per-project timeline projection; read-only.',S({'project_id':STR},['project_id'])),
('bai_studio_arrangement_get','Read v0.5 per-project clip arrangement; does not change legacy engine.',S({'project_id':STR},['project_id'])),
('bai_studio_batch_move','Atomically move multiple saved clips.',S({'project_id':STR,'revision':INT,'edits':{'type':'array','items':{'type':'object'}}},['project_id','revision','edits'])),
('bai_studio_batch_undo','Undo previous atomic batch move.',S({'project_id':STR,'revision':INT},['project_id','revision'])),
('bai_studio_track_flags_set','Set track locks and mutes.',S({'project_id':STR,'revision':INT,'locked':{'type':'array','items':STR},'muted':{'type':'array','items':STR}},['project_id','revision','locked','muted'])),
('bai_studio_clip_target_set','Set or clear a motion clip target model with revision check.',S({'project_id':STR,'clip_id':STR,'revision':INT,'target_model_id':{'type':['string','null']}},['project_id','clip_id','revision','target_model_id'])),
('bai_studio_clip_edit','Update or delete saved v0.5 clip metadata by ID with revision check; legacy engine unchanged.',S({'project_id':STR,'clip_id':STR,'revision':INT,'action':{'type':'string','enum':['update','delete']},'start':{'type':'number'},'duration':{'type':'number'},'track':STR},['project_id','clip_id','revision','action'])),
('bai_studio_clip_place','Place registered asset into v0.5 clip arrangement with optimistic revision.',S({'project_id':STR,'asset_id':STR,'track':STR,'start':{'type':'number'},'duration':{'type':'number'},'revision':INT},['project_id','asset_id','track','start','duration','revision'])),
('bai_studio_focus_reports_get','Read saved project focus interval reports.',S({'project_id':STR},['project_id'])),
('bai_studio_focus_reports_save','Save completed focus interval report.',S({'project_id':STR,'revision':INT,'report':{'type':'object'}},['project_id','revision','report'])),
('bai_studio_focus_target_get','Read saved focus target selection.',S({'project_id':STR},['project_id'])),
('bai_studio_focus_target_set','Persist selected focus model and bone.',S({'project_id':STR,'revision':INT,'model_id':{'type':['string','null']},'bone_name':{'type':['string','null']},'enabled':{'type':'boolean'}},['project_id','revision','model_id','bone_name','enabled'])),
('bai_studio_project_fps_get','Read project FPS; nullable when not configured.',S({'project_id':STR},['project_id'])),
('bai_studio_project_fps_set','Persist project FPS without changing legacy engine state.',S({'project_id':STR,'fps':{'type':'number','minimum':1,'maximum':240}},['project_id','fps'])),
('bai_studio_projects_list','List v0.5 project catalog metadata. Does not read engine project payload.',S()),
('bai_studio_project_create','Create v0.5 catalog record only, not a new 3D engine project.',S({'name':STR,'kind':{'type':'string','enum':['empty','dance','mv','video']}},['name'])),
('bai_studio_project_rename','Rename a v0.5 catalog record.',S({'id':STR,'name':STR},['id','name'])),
('bai_camera_get','Read BAI Camera keyframe project.',S()),
('bai_camera_set','Save non-destructive BAI Camera keyframes; original motions unaffected.',S({'schema':INT,'fps':INT,'duration':INT,'keys':{'type':'array','items':{'type':'object'}}},['schema','fps','duration','keys'])),
('bai_camera_sample','Read interpolated camera transform at a specified frame.',S({'frame':INT},['frame'])),
('bai_camera_sequence_evaluate','Read CAM-015 effective cut shot or fallback keys at frame (does not override VMD preview).',S({'frame':INT},['frame'])),
('bai_camera_sequence_edit','Edit existing CAM-015 shot intervals with optimistic concurrency check.',S({'action':{'type':'string','enum':['add','update','remove']},'index':INT,'shot':{'type':'object'},'expected_sequence':{'type':'array','items':{'type':'object'}}},['action','expected_sequence'])),
('bai_ai_status','Check optional local Ollama availability.',S({})),
('bai_ai_settings','Read local Ollama configuration.',S({})),
('bai_ai_pose_proposal','Preview-only Qwen pose interpretation, without editing source files.',S({'text':{'type':'string'}},['text'])),
('bai_ai_ik_preview','Qwen Japanese instruction to non-destructive planar IK preview; no original changes.',S({'text':STR,'baseline':{'type':'object'}},['text','baseline'])),
('mixamo_retarget_analyze','Analyze registered skeleton and clips without altering source.',S({'id':STR},['id'])),
('mixamo_retarget_compare','Compare semantic role mapping of two registered assets.',S({'source':STR,'target':STR},['source','target'])),
('mixamo_retarget_pose_proposal','Estimate rest-direction rotations for matching bones; preview-only, not validated retarget.',S({'source':STR,'target':STR},['source','target'])),
('mixamo_retarget_calibration','Propose read-only scale and mapping from available positions.',S({'source':STR,'target':STR},['source','target'])),
('bai_retarget_explicit_rest_preview','Preview local quaternion deltas with user-confirmed rest frames; no mesh/VMD mutation.',S({'rest_pairs':{'type':'object'},'samples':{'type':'array','items':{'type':'object'}},'coordinate_convention_confirmed':{'type':'boolean'}},['rest_pairs','samples','coordinate_convention_confirmed'])),
('bai_retarget_rest_pose_inspection','Read only VRM local rest rotations by role; NOT a calibrated common coordinate basis.',S({'source':STR,'target':STR},['source','target'])),
('bai_retarget_glb_clip_hierarchy_inspection','Inspect exact GLB rotation keys and parent animation hierarchy, read-only; missing parent keys skipped.',S({'source':STR,'clip':STR,'fps':{'type':'number'}},['source'])),
('bai_retarget_vrm_local_transfer_preview','Preview provisional target VRM local rotations and safety QA; never apply or export VMD.',S({'source':STR,'target':STR,'clip':STR,'fps':{'type':'number'},'coordinate_convention_confirmed':{'type':'boolean'}},['source','target','coordinate_convention_confirmed'])),
('bai_retarget_glb_clip_rest_preview','Read-only real GLB clip rotation keys to rest-delta numeric preview; NO animation applied.',S({'source':STR,'target':STR,'clip':STR,'fps':{'type':'number'},'coordinate_convention_confirmed':{'type':'boolean'}},['source','target','coordinate_convention_confirmed'])),
('bai_retarget_world_rest_motion_preview','Read-only world-rest numeric rotation delta preview; NOT locally applicable animation.',S({'source':STR,'target':STR,'samples':{'type':'array','items':{'type':'object'}},'coordinate_convention_confirmed':{'type':'boolean'}},['source','target','samples','coordinate_convention_confirmed'])),
('bai_retarget_rest_hierarchy_inspection','Inspect glTF ancestor world rest orientations; NOT an auto retarget basis.',S({'source':STR,'target':STR},['source','target'])),
('bai_vrm_humanoid_mapping_suggest','Suggest read-only role-based VRM bone mapping; no rotation calibration or automatic save.',S({'source':STR,'target':STR},['source','target'])),
('bai_retarget_mapping_preview','Apply saved bone names to supplied rotation samples as read-only preview, without axis conversion or VMD output.',S({'source':STR,'target':STR,'samples':{'type':'array','items':{'type':'object'}}},['source','target','samples'])),
('mixamo_retarget_root_preview','Preview root position scaling and yaw without writing animation.',S({'samples':{'type':'array','items':{'type':'object'}},'scale':{'type':'number'},'yaw_offset_deg':{'type':'number'}},['samples','scale'])),
('bai_bvh_foot_world_qa','Sample BVH foot joint world positions and diagnose ground contact; source axes, no IK.',S({'bvh_text':STR,'foot_bone':STR,'stride':INT,'ground_y':{'type':'number'}},['bvh_text','foot_bone'])),
('bai_dual_foot_preview','Preview root XZ adjustments respecting simultaneous planted feet; no IK or model edits.',S({'left_samples':{'type':'array','items':{'type':'object'}},'right_samples':{'type':'array','items':{'type':'object'}},'ground_y':{'type':'number'},'conflict_tolerance':{'type':'number'},'max_offset':{'type':'number'}},['left_samples','right_samples'])),
('mixamo_foot_contact_qa','Analyze foot contact, drift and penetration using world-space samples; no IK application.',S({'samples':{'type':'array','items':{'type':'object'}},'ground_y':{'type':'number'},'propose_root_offsets':{'type':'boolean'}},['samples'])),
('mixamo_motion_channels','Inspect GLB/BVH animation channels without changing files.',S({'id':{'type':'string'}},['id'])),
('mixamo_retarget_profiles_get','Read stored mapping profiles.',S()),
('bai_pose_ik_get','Read saved non-destructive manual IK target positions.',S()),
('bai_pose_ik_solve','Solve 2-segment planar IK for arm/leg targets without AI or PMX changes.',S({'schema':INT,'frame':INT,'limbs':{'type':'object'}},['limbs'])),
('bai_pose_ik_save','Save manual IK target settings; does not alter original motion.',S({'schema':INT,'frame':INT,'limbs':{'type':'object'}},['limbs'])),
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
