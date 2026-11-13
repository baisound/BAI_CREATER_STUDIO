#!/usr/bin/env python3
"""Dependency-free MCP STDIO bridge to Mixamo local HTTP API (MCP 2024-11-05)."""
import base64, binascii, json, sys, os, urllib.request, urllib.error, urllib.parse
from pathlib import Path

BASE=Path(__file__).resolve().parent
HOST=os.environ.get('MIXAMO_VIEWER_URL','http://127.0.0.1:8765').rstrip('/')
if not (HOST.startswith('http://127.0.0.1:') or HOST.startswith('http://localhost:')):
    raise SystemExit('Only loopback endpoints are accepted')

def api(path, payload=None, raw=None, timeout=None):
    if raw is not None and payload is not None:raise ValueError('Choose JSON or raw body')
    body=(raw if raw is not None else None if payload is None
          else json.dumps(payload,ensure_ascii=False).encode())
    headers=({'Content-Type':'application/octet-stream'} if raw is not None else
             {'Content-Type':'application/json'} if body is not None else {})
    req=urllib.request.Request(HOST+path,data=body,headers=headers,
                               method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(req,timeout=timeout or (30 if raw is not None else 12)) as res:return json.loads(res.read())
    except urllib.error.HTTPError as exc:raise ValueError(f'HTTP {exc.code}: {exc.read(600).decode(errors="replace")}')
    except urllib.error.URLError as exc:raise ConnectionError('Mixamo viewer is not running. Start 起動.bat / start.sh first: '+str(exc.reason))

def upload_srt(a):
    encoded=a['content_base64']
    if not isinstance(encoded,str) or not 4<=len(encoded)<=((8*1024*1024+2)//3)*4:
        raise ValueError('SRT base64 must encode 1 byte to 8 MiB')
    try:data=base64.b64decode(encoded,validate=True)
    except (binascii.Error,ValueError) as exc:raise ValueError('Invalid SRT base64') from exc
    if not 0<len(data)<=8*1024*1024 or base64.b64encode(data).decode('ascii')!=encoded:
        raise ValueError('SRT base64 must be canonical and 1 byte to 8 MiB')
    query=urllib.parse.urlencode({key:a[key] for key in ('project_id','revision','name','encoding')})
    return api('/api/studio/v05/srt/import?'+query,raw=data)

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
    if name=='bai_studio_project_legacy_import_preview':return api('/api/studio/v05/project/legacy-import-preview?id='+urllib.parse.quote(a['id'])+'&include='+urllib.parse.quote(','.join(a.get('include',[])))+'&fps_policy='+urllib.parse.quote(a.get('fps_policy','keep_if_same')))
    if name=='bai_studio_project_legacy_import_get':return api('/api/studio/v05/project/legacy-import?id='+urllib.parse.quote(a['id']))
    if name=='bai_studio_project_legacy_import_apply':return api('/api/studio/v05/project/legacy-import/apply',a)
    if name=='bai_studio_project_legacy_import_revert':return api('/api/studio/v05/project/legacy-import/revert',a)
    if name=='bai_studio_asset_capabilities':return api('/api/studio/v05/assets/capabilities')
    if name=='bai_studio_scene_multi_motion_plan':return api('/api/studio/v05/scene/multi-motion-plan?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_scene_motion_target_set':return api('/api/studio/v05/scene/motion-target',a)
    if name=='bai_studio_blender_addons_list':return api('/api/studio/v05/blender-addons?'+urllib.parse.urlencode(a))
    if name in ('bai_studio_blender_addon_inspect','bai_studio_blender_addon_register'):
        encoded=a.get('archive_base64')
        if not isinstance(encoded,str) or not 0<len(encoded)<=((32*1024*1024+2)//3)*4:raise ValueError('Addon ZIP must be 1 byte to 32 MiB')
        raw=base64.b64decode(encoded,validate=True)
        route='/register?'+urllib.parse.urlencode({'member':a['member']}) if name.endswith('_register') else '/inspect'
        return api('/api/studio/v05/blender-addons'+route,raw=raw)
    if name=='bai_studio_blender_addon_open':return {'requires_local_action':True,'message':'Studioの「Blenderで編集」から対象版と作品を確認して起動してください'}
    if name in ('bai_studio_blender_addon_prepare','bai_studio_blender_addon_import_bake','bai_studio_blender_addon_remove'):
        return api('/api/studio/v05/blender-addons/'+{'bai_studio_blender_addon_prepare':'prepare','bai_studio_blender_addon_import_bake':'import-bake','bai_studio_blender_addon_remove':'remove'}[name],a,timeout=720)
    if name=='bai_studio_blender_camera_candidates':return api('/api/studio/v05/blender-camera?'+urllib.parse.urlencode(a))
    if name in ('bai_studio_blender_camera_import_json','bai_studio_blender_camera_preview','bai_studio_blender_camera_adopt'):
        route={'bai_studio_blender_camera_import_json':'import-json','bai_studio_blender_camera_preview':'preview','bai_studio_blender_camera_adopt':'adopt'}[name]
        return api('/api/studio/v05/blender-camera/'+route,a)
    if name=='bai_studio_pmx_contact_context':return api('/api/studio/v05/motion-edits/context?'+urllib.parse.urlencode({'id':a['project_id'],'instance_id':a['instance_id'],'clip_id':a['clip_id']}))
    if name=='bai_studio_pmx_contact_save':return api('/api/studio/v05/motion-edits',{**a,'action':'contact-set'})
    if name=='bai_studio_pmx_fk_edits_get':return api('/api/studio/v05/motion-edits?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_pmx_fk_edits_mutate':return api('/api/studio/v05/motion-edits',a)
    if name=='bai_studio_pmx_vmd_candidate_create':return api('/api/studio/v05/motion/vmd-candidate',a)
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
    if name=='bai_studio_track_layout_set':
        route={'update':'layout','add_image_lane':'image-lanes','remove_image_lane':'image-lanes/remove','add_video_lane':'video-lanes','remove_video_lane':'video-lanes/remove','add_audio_lane':'audio-lanes','remove_audio_lane':'audio-lanes/remove','add_music_lane':'music-lanes','remove_music_lane':'music-lanes/remove'}.get(a.get('action','update'))
        if route is None:raise ValueError('Invalid track layout action')
        return api('/api/studio/v05/timeline/'+route,{k:v for k,v in a.items() if k!='action'})
    if name=='bai_studio_playhead_get':return api('/api/studio/v05/playhead?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_playhead_set':return api('/api/studio/v05/playhead',a)
    if name=='bai_studio_timeline_view':return api('/api/studio/v05/timeline/view?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_arrangement_get':return api('/api/studio/v05/arrangement?id='+urllib.parse.quote(a['project_id']))
    if name=='bai_studio_srt_sources_get':return api('/api/studio/v05/srt/sources?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_srt_import':return upload_srt(a)
    if name=='bai_studio_lip_readings_get':return api('/api/studio/v05/lip/readings?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_lip_reading_set':return api('/api/studio/v05/lip/readings',a)
    if name=='bai_studio_lip_candidate_propose':return api('/api/studio/v05/lip/candidates?'+urllib.parse.urlencode({key:a[key] for key in ('project_id','source_id','srt_index')}))
    if name=='bai_studio_lip_drafts_get':return api('/api/studio/v05/lip/drafts?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_lip_draft_save':return api('/api/studio/v05/lip/drafts',a)
    if name=='bai_studio_lip_vmd_candidate_create':return api('/api/studio/v05/lip/vmd-candidate',a)
    if name=='bai_studio_lip_adoption_mutate':return api('/api/studio/v05/lip/adoptions',a)
    if name=='bai_studio_lip_adoptions_get':return api('/api/studio/v05/lip/adoptions?project_id='+urllib.parse.quote(a['project_id'],safe='')+'&instance_id='+urllib.parse.quote(a['instance_id'],safe=''))
    if name=='bai_studio_lip_composite_candidate_create':return api('/api/studio/v05/lip/composite-candidate',a)
    if name=='bai_studio_render_capabilities':return api('/api/studio/v05/render/capabilities')
    if name=='bai_studio_render_range_get':return api('/api/studio/v05/timeline/range?id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_render_range_set':return api('/api/studio/v05/timeline/range',a)
    if name=='bai_studio_render_name_preview':return api('/api/studio/v05/render/name?project_id='+urllib.parse.quote(a['project_id'],safe='')+'&name='+urllib.parse.quote(a['name'],safe=''))
    if name=='bai_studio_render_jobs_list':
        query={key:a[key] for key in ('project_id','limit','offset') if key in a}
        if 'completed_only' in a:
            if type(a['completed_only']) is not bool:raise ValueError('completed_only must be boolean')
            query['completed']=int(a['completed_only'])
        return api('/api/studio/v05/render/jobs?'+urllib.parse.urlencode(query))
    if name=='bai_studio_render_job_get':return api('/api/studio/v05/render/jobs?id='+urllib.parse.quote(a['job_id'],safe=''))
    if name=='bai_studio_render_job_start':return api('/api/studio/v05/render/jobs',a)
    if name=='bai_studio_render_restore':return api('/api/studio/v05/render/restore',a)
    if name=='bai_studio_render_file_link':
        job=api('/api/studio/v05/render/jobs?id='+urllib.parse.quote(a['job_id'],safe=''))
        if job.get('status')!='succeeded':raise ValueError('Completed MP4 not available')
        return {'job_id':job['id'],'project_id':job['project_id'],'download_name':job.get('download_name'),
                'url':HOST+'/api/studio/v05/render/file?id='+urllib.parse.quote(job['id'],safe=''),
                'note':'The file endpoint validates the completed MP4 when downloaded.'}
    if name=='bai_studio_batch_move':return api('/api/studio/v05/arrangement/batch-move',a)
    if name=='bai_studio_batch_undo':return api('/api/studio/v05/arrangement/undo',a)
    if name=='bai_studio_clip_undo':return api('/api/studio/v05/arrangement/history/undo',a)
    if name=='bai_studio_clip_redo':return api('/api/studio/v05/arrangement/history/redo',a)
    if name=='bai_studio_track_flags_set':return api('/api/studio/v05/timeline/flags',a)
    if name=='bai_studio_clip_target_set':return api('/api/studio/v05/arrangement/clip/target',a)
    if name=='bai_studio_clip_edit':return api('/api/studio/v05/arrangement/clip/edit',a)
    if name=='bai_studio_audio_capabilities':return api('/api/studio/v05/audio/capabilities')
    if name=='bai_studio_audio_settings_get':return api('/api/studio/v05/audio/settings?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_audio_settings_save':return api('/api/studio/v05/audio/settings',a)
    if name=='bai_studio_audio_plugin_inspect':return api('/api/studio/v05/audio/inspect',a,timeout=40)
    if name=='bai_studio_audio_tracks':return api('/api/studio/v05/audio/tracks?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_audio_lane_mute':return api('/api/studio/v05/audio/lane-mute',a)
    if name=='bai_studio_audio_prepare':return api('/api/studio/v05/audio/prepare',a,timeout=3660)
    if name in ('bai_studio_audio_editor_open','bai_studio_audio_editor_close','bai_studio_audio_editor_recover'):return api('/api/studio/v05/audio/'+name.removeprefix('bai_studio_audio_').replace('_','-'),a)
    if name=='bai_studio_audio_editor_status':return api('/api/studio/v05/audio/editor-status?id='+urllib.parse.quote(a['id'],safe=''))
    if name=='bai_studio_audio_editor_list':return api('/api/studio/v05/audio/editor-list?project_id='+urllib.parse.quote(a['project_id'],safe=''))
    if name=='bai_studio_audio_meter_window':return api('/api/studio/v05/audio/meter-window?'+urllib.parse.urlencode(a))
    if name=='bai_studio_clip_split':return api('/api/studio/v05/arrangement/clip/split',a)
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
('bai_studio_project_legacy_import_preview','Read-only check of what importing the old (legacy) saved state into this v0.5 project would map or keep; returns expected values to pass to apply. Writes nothing.',S({'id':STR,'include':{'type':'array','items':{'type':'string','enum':['music_dance','timeline_editor']}},'fps_policy':{'type':'string','enum':['keep_if_same','use_legacy']}},['id'])),
('bai_studio_project_legacy_import_get','Read-only: the import record of a project (null when never imported).',S({'id':STR},['id'])),
('bai_studio_project_legacy_import_apply','Import the legacy saved snapshot into the v0.5 project (only after a preview; requires confirm=true and the preview expected values). Reversible with the revert tool.',S({'id':STR,'expected':{'type':'object'},'include':{'type':'array','items':{'type':'string','enum':['music_dance','timeline_editor']}},'fps_policy':{'type':'string','enum':['keep_if_same','use_legacy']},'confirm':{'type':'boolean'}},['id','expected','confirm'])),
('bai_studio_project_legacy_import_revert','Undo a legacy import of the project through the public v0.5 edit functions; requires confirm=true.',S({'id':STR,'confirm':{'type':'boolean'}},['id','confirm'])),
('bai_studio_asset_capabilities','Read supported v0.5 import types and searchable categories.',S()),
('bai_studio_scene_multi_motion_plan','Read validated scene-instance-specific motion assignments and readiness.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_motion_target_set','Assign a motion, expression or lip clip to a saved or timeline-derived model instance, with revision check and arrangement undo.',S({'project_id':STR,'clip_id':STR,'revision':INT,'instance_id':{'type':['string','null']}},['project_id','clip_id','revision','instance_id'])),
('bai_studio_blender_addons_list','Read statically registered addons and project shooting sessions.',S({'project_id':STR},['project_id'])),
('bai_studio_blender_addon_inspect','Statically inspect ZIP bytes; never execute addon code.',S({'archive_base64':STR},['archive_base64'])),
('bai_studio_blender_addon_register','Register the selected inner ZIP as an immutable version; does not execute code.',S({'archive_base64':STR,'member':STR},['archive_base64','member'])),
('bai_studio_blender_addon_prepare','Prepare supported PMX/GLB/VRM scene with evaluated motion/face geometry as a separate Blender shooting copy; return cameras only; reject unsupported content.',S({'project_id':STR,'addon_id':STR,'start_frame':INT,'end_frame':INT},['project_id','addon_id','start_frame','end_frame'])),
('bai_studio_blender_addon_open','Requires a manual local action in Studio; MCP never executes addon code.',S({'session_id':STR},['session_id'])),
('bai_studio_blender_addon_import_bake','Read explicitly sent baked snapshot as separate camera candidate; comparison and adoption remain explicit.',S({'session_id':STR},['session_id'])),
('bai_studio_blender_addon_remove','Unregister an unused version, preserving files. Shooting sessions block removal.',S({'addon_id':STR},['addon_id'])),
('bai_studio_blender_camera_candidates','Read project camera candidates and optionally evaluated JSON; no active timeline changes.',S({'project_id':STR,'candidate_id':STR},['project_id'])),
('bai_studio_blender_camera_import_json','Import evaluated Blender camera JSON as a separate candidate; does not open arbitrary local paths or control Blender GUI.',S({'project_id':STR,'name':STR,'track':{'type':'object'}},['project_id','name','track'])),
('bai_studio_blender_camera_preview','Prepare the exact camera comparison context and evaluated track. This standard MCP endpoint does not render the 3D browser.',S({'project_id':STR,'candidate_id':STR,'start_frame':INT,'mapping':S({'scale':{'type':'number'},'offset':{'type':'array','items':{'type':'number'},'minItems':3,'maxItems':3}},['scale','offset'])},['project_id','candidate_id','start_frame','mapping'])),
('bai_studio_blender_camera_adopt','Explicitly adopt a camera candidate with the same conditions returned by preview; atomic timeline placement, existing cameras retained, one undo step.',S({'project_id':STR,'candidate_id':STR,'start_frame':INT,'mapping':S({'scale':{'type':'number'},'offset':{'type':'array','items':{'type':'number'},'minItems':3,'maxItems':3}},['scale','offset']),'expected':{'type':'object'},'allow_unsupported':{'type':'boolean'}},['project_id','candidate_id','start_frame','mapping','expected','allow_unsupported'])),
('bai_studio_pmx_contact_context','Read source SHA256, FPS and placement/edit revisions for a loaded target-PMX contact candidate. Does not calculate foot geometry.',S({'project_id':STR,'instance_id':STR,'clip_id':STR},['project_id','instance_id','clip_id'])),
('bai_studio_pmx_contact_save','Save one bounded foot-IK translation layer with one undo step. Requires keys measured/verified in the local 3D browser; server checks source identity, revisions, canonical leg, bounds and magnitude, not geometric contact.',S({'project_id':STR,'revision':INT,'instance_id':STR,'clip_id':STR,
 'expected':S({**{k:STR for k in ('instance_id','clip_id','model_asset_id','motion_asset_id','model_sha256','motion_sha256')},**{k:{'type':'number'} for k in ('fps','start','duration')},**{k:INT for k in ('revision','scene_revision','arrangement_revision')}},['instance_id','clip_id','model_asset_id','motion_asset_id','model_sha256','motion_sha256','fps','start','duration','revision','scene_revision','arrangement_revision']),
 'contact':S({'side':{'type':'string','enum':['左','右']},'start_frame':INT,'end_frame':INT,'ground_y':{'type':'number'}},['side','start_frame','end_frame','ground_y']),
 'keys':{'type':'array','minItems':2,'maxItems':480,'items':S({'frame':INT,'bone':STR,'rotation':{'type':'array','items':{'type':'number'},'minItems':4,'maxItems':4},'position':{'type':'array','items':{'type':'number'},'minItems':3,'maxItems':3}},['frame','bone','rotation','position'])}},['project_id','revision','instance_id','clip_id','expected','contact','keys'])),
('bai_studio_pmx_fk_edits_get','Read project-scoped PMX FK correction keys, revision, and source match status; no live GPU state.',S({'project_id':STR},['project_id'])),
('bai_studio_pmx_fk_edits_mutate','Set/remove/move a PMX correction key in a selected layer, create/update/delete layers, or undo/redo with revision.',S({'project_id':STR,'revision':INT,'action':{'type':'string','enum':['set','remove','move','layer-create','layer-update','layer-delete','mode-set','undo','redo']},'instance_id':STR,'clip_id':STR,'limb':{'type':'string','enum':['left_arm','right_arm','left_leg','right_leg']},'mode':{'type':'string','enum':['FK','IK']},'layer_id':STR,'to_frame':INT,'settings':S({'name':STR,'weight':{'type':'number'},'muted':{'type':'boolean'},'start_frame':INT,'end_frame':INT,'fade_in_frames':INT,'fade_out_frames':INT},[]),'key':S({'frame':INT,'bone':STR,'rotation':{'type':'array','items':{'type':'number'},'minItems':4,'maxItems':4}},['frame','bone','rotation'])},['project_id','revision','action'])),
('bai_studio_pmx_vmd_candidate_create','Create a distinct review-only VMD from saved whole-clip constant PMX corrections; visual PMX validation and project placement are not performed.',S({'project_id':STR,'revision':INT,'instance_id':STR,'clip_id':STR},['project_id','revision','instance_id','clip_id'])),
('bai_studio_scene_motion_plan','Read valid motion-to-scene-model pairings, format compatibility, and preview readiness.',S({'project_id':STR},['project_id'])),
 ('bai_studio_scene_model_candidates','List actually previewable model assets.',S()),
('bai_studio_scene_instances_get','Get saved and timeline-derived scene models, transforms, camera/face VMD readiness and source keys. Read-only; timeline owns derived model existence.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_preview_plan','Read model placement plan for shared 3D preview, not live GPU state.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_instances_mutate','Add/update/remove a scene instance, camera, or PMX face key using a revision.',S({'project_id':STR,'action':{'type':'string','enum':['add','update','remove','camera','face-set','face-remove','face-move','face-undo','face-redo']},'revision':INT,'instance_id':STR,'asset_id':STR,'transform':{'type':'object'},'visible':{'type':'boolean'},'locked':{'type':'boolean'},'camera':{'type':'object','properties':{'position':{'type':'array','items':{'type':'number'}},'target':{'type':'array','items':{'type':'number'}},'fov':{'type':'number'}},'required':['position','target','fov'],'additionalProperties':False},'face_key':{'type':'object','properties':{'instance_id':STR,'morph_name':STR,'time':{'type':'number'},'value':{'type':'number'},'track':{'type':'string','enum':['expression','lip']},'to_time':{'type':'number'}},'required':['instance_id','morph_name','time'],'additionalProperties':False}},['project_id','action','revision'])),
('bai_studio_scene_model_get','Read a single-model scene placement for a project.',S({'project_id':STR},['project_id'])),
('bai_studio_scene_model_set','Save or remove a project scene model with XYZ transform and revision.',S({'project_id':STR,'asset_id':{'type':['string','null']},'transform':{'type':['object','null']},'revision':INT},['project_id','asset_id','transform','revision'])),
('bai_studio_asset_sources_get','Get registered reference paths (within the approved inbox) and catalog revision.',S()),
('bai_studio_asset_source_register','Register approved inbox file as a read-only reference or managed library copy, with SHA-256 deduplication.',S({'relative_path':STR,'kind':STR,'mode':{'type':'string','enum':['reference','copy']},'revision':INT},['relative_path','kind','mode','revision'])),
('bai_studio_asset_source_relink','Relink an existing reference to identical content in the approved inbox.',S({'asset_id':STR,'relative_path':STR,'revision':INT},['asset_id','relative_path','revision'])),
('bai_studio_assets_search','Search registered local assets by category and text.',S({'category':STR,'query':STR})),
('bai_studio_track_layout_get','Read project track order and heights.',S({'project_id':STR},['project_id'])),
('bai_studio_track_layout_set','Update track order/heights (default action=update; requires order and heights), add an image/video/audio/music lane, or remove an empty lane (requires lane). Uses stable lane IDs and revision guards.',S({'project_id':STR,'revision':{'type':'integer'},'action':{'type':'string','enum':['update','add_image_lane','remove_image_lane','add_video_lane','remove_video_lane','add_audio_lane','remove_audio_lane','add_music_lane','remove_music_lane']},'lane':{'type':'integer','minimum':1},'order':{'type':'array','items':STR},'heights':{'type':'object','additionalProperties':{'type':'integer'}}},['project_id','revision'])),
('bai_studio_playhead_get','Read saved edit cursor; not engine playback.',S({'project_id':STR},['project_id'])),
('bai_studio_playhead_set','Set saved edit cursor, revision guarded; no engine seek.',S({'project_id':STR,'seconds':{'type':'number'},'revision':{'type':'integer'}},['project_id','seconds','revision'])),
('bai_studio_timeline_view','Read deterministic track-grouped per-project timeline projection; read-only.',S({'project_id':STR},['project_id'])),
('bai_studio_arrangement_get','Read v0.5 per-project clip arrangement; does not change legacy engine.',S({'project_id':STR},['project_id'])),
('bai_studio_srt_sources_get','Read saved SRT sources, hashes, cue times, and revision for one project.',S({'project_id':STR},['project_id'])),
('bai_studio_srt_import','Import 1 byte to 8 MiB of SRT bytes encoded as canonical base64. No local path access; uses the same revision-guarded upload as the UI.',S({'project_id':STR,'revision':INT,'name':STR,'encoding':{'type':'string','enum':['utf-8','utf-8-bom','cp932']},'content_base64':STR},['project_id','revision','name','encoding','content_base64'])),
('bai_studio_lip_readings_get','Read saved SRT pronunciation decisions and revision.',S({'project_id':STR},['project_id'])),
('bai_studio_lip_reading_set','Save one reading decision or explicit silence with the current revision and source hash.',S({'project_id':STR,'revision':INT,'source_id':STR,'source_hash':STR,'srt_index':INT,'reading_state':{'type':'string','enum':['unresolved','proposed','confirmed']},'reading_kana':{'type':['string','null']},'explicit_silence':{'type':'boolean'}},['project_id','revision','source_id','source_hash','srt_index','reading_state','reading_kana','explicit_silence'])),
('bai_studio_lip_candidate_propose','Calculate unadopted SRT mouth segments for one saved reading.',S({'project_id':STR,'source_id':STR,'srt_index':INT},['project_id','source_id','srt_index'])),
('bai_studio_lip_drafts_get','Read saved lip segment drafts and revision.',S({'project_id':STR},['project_id'])),
('bai_studio_lip_draft_save','Save explicitly edited mouth segments; source, reading, FPS, and revision must still match.',S({'project_id':STR,'revision':INT,'source_id':STR,'source_hash':STR,'srt_index':INT,'pronunciation_version':INT,'project_fps':{'type':'number'},'segments':{'type':'array','items':S({'startFrame':INT,'endFrame':INT,'mouthShape':{'type':'string','enum':['A','I','U','E','O','Closed','Rest']},'weight':{'type':'number'}},['startFrame','endFrame','mouthShape','weight'])}},['project_id','revision','source_id','source_hash','srt_index','pronunciation_version','project_fps','segments'])),
('bai_studio_lip_vmd_candidate_create','Check (dry_run=true) or create a distinct morph-only VMD from saved SRT, readings, drafts, and PMX map. No automatic adoption.',S({'project_id':STR,'source_id':STR,'model_asset_id':STR,'source_revision':INT,'reading_revision':INT,'draft_revision':INT,'map_revision':INT,'dry_run':{'type':'boolean'}},['project_id','source_id','model_asset_id','source_revision','reading_revision','draft_revision','map_revision','dry_run'])),
('bai_studio_lip_adoption_mutate','Explicitly adopt, remove, undo, or redo a VMD candidate for a scene instance with revision protection.',S({'project_id':STR,'revision':INT,'action':{'type':'string','enum':['adopt','remove','undo','redo']},'instance_id':STR,'candidate_id':STR},['project_id','revision','action'])),
('bai_studio_lip_adoptions_get','Read the adopted lip track and revision for one saved scene instance.',S({'project_id':STR,'instance_id':STR},['project_id','instance_id'])),
('bai_studio_lip_composite_candidate_create','Compare the saved VMD clip, adopted lip and manual face keys; dry_run checks without writing, otherwise creates a distinct review-only VMD. Download revalidates project inputs.',S({'project_id':STR,'instance_id':STR,'clip_id':STR,'adoption_revision':INT,'scene_revision':INT,'arrangement_revision':INT,'dry_run':{'type':'boolean'}},['project_id','instance_id','clip_id','adoption_revision','scene_revision','arrangement_revision','dry_run'])),
('bai_studio_render_capabilities','Read tested local MP4 encoder and 3D capture limits.',S()),
('bai_studio_render_range_get','Read the saved In/Out range, FPS, and revisions.',S({'project_id':STR},['project_id'])),
('bai_studio_render_range_set','Save integer In/Out frames using both range and arrangement revisions.',S({'project_id':STR,'revision':INT,'arrangement_revision':INT,'in_frame':{'type':['integer','null']},'out_frame':{'type':['integer','null']}},['project_id','revision','arrangement_revision','in_frame','out_frame'])),
('bai_studio_render_name_preview','Read current finished-MP4 name and proposed new version before starting or restoring.',S({'project_id':STR,'name':STR},['project_id','name'])),
('bai_studio_render_jobs_list','List saved MP4 jobs for one project; filter completed videos and page older downloads.',S({'project_id':STR,'completed_only':{'type':'boolean'},'limit':{'type':'integer','minimum':1,'maximum':100},'offset':{'type':'integer','minimum':0}},['project_id'])),
('bai_studio_render_job_get','Read one MP4 job status and output metadata.',S({'job_id':STR},['job_id'])),
('bai_studio_render_job_start','Start a bounded MP4 from the saved project, range, arrangement, and optional 3D scene revisions. Use name preview before replacement.',S({'project_id':STR,'range_revision':INT,'arrangement_revision':INT,'resolution':{'type':'string','enum':['720p','1080p']},'scene_revision':{'type':['integer','null']},'name':STR,'collision_mode':{'type':'string','enum':['version','replace']},'replace_job_id':{'type':['string','null']}},['project_id','range_revision','arrangement_revision','resolution'])),
('bai_studio_render_restore','Restore an archived finished MP4 by exact job and name revision; retain the displaced version.',S({'project_id':STR,'name':STR,'job_id':STR,'revision':INT,'current_job_id':STR},['project_id','name','job_id','revision','current_job_id'])),
('bai_studio_render_file_link','Get the loopback download URL for a succeeded MP4; the file endpoint validates its bytes.',S({'job_id':STR},['job_id'])),
('bai_studio_batch_move','Atomically move multiple saved clips.',S({'project_id':STR,'revision':INT,'edits':{'type':'array','items':{'type':'object'}}},['project_id','revision','edits'])),
('bai_studio_batch_undo','Undo previous atomic batch move.',S({'project_id':STR,'revision':INT},['project_id','revision'])),
('bai_studio_clip_undo','Undo the latest saved clip edit. Revision, lock and lane guarded; retains source files.',S({'project_id':STR,'revision':INT},['project_id','revision'])),
('bai_studio_clip_redo','Redo a saved clip edit undone through clip history. New edits clear redo.',S({'project_id':STR,'revision':INT},['project_id','revision'])),
('bai_studio_track_flags_set','Set track locks and saved audio mutes; audio/music/video mutes affect preview and the next MP4.',S({'project_id':STR,'revision':INT,'locked':{'type':'array','items':STR},'muted':{'type':'array','items':STR}},['project_id','revision','locked','muted'])),
('bai_studio_clip_target_set','Set or clear a motion clip target model with revision check.',S({'project_id':STR,'clip_id':STR,'revision':INT,'target_model_id':{'type':['string','null']}},['project_id','clip_id','revision','target_model_id'])),
('bai_studio_clip_edit','Update or delete saved v0.5 clip metadata and original media window by ID with revision check; legacy engine unchanged.',S({'project_id':STR,'clip_id':STR,'revision':INT,'action':{'type':'string','enum':['update','delete']},'start':{'type':'number'},'duration':{'type':'number'},'track':STR,'source_start':{'type':'number','minimum':0,'description':'Start offset in the original video/audio in seconds, independent of timeline start.'},'lane':{'type':'integer','minimum':1,'description':'Existing image/video/audio/music lane ID; use 1 for other tracks.'}},['project_id','clip_id','revision','action'])),
('bai_studio_clip_place','Place registered asset into v0.5 clip arrangement with optimistic revision.',S({'project_id':STR,'asset_id':STR,'track':STR,'start':{'type':'number'},'duration':{'type':'number'},'revision':INT,'lane':{'type':'integer','minimum':1,'description':'Existing image/video/audio/music lane ID; use 1 for other tracks.'}},['project_id','asset_id','track','start','duration','revision'])),
('bai_studio_audio_capabilities','List local offline VST3 host and detected plugins. Detection does not load plugins.',S({},[])),
('bai_studio_audio_settings_get','Read saved project music/audio/video/master mixer settings.',S({'project_id':STR},['project_id'])),
('bai_studio_audio_settings_save','Save project gain dB, mute, solo and ordered VST3 inserts. Read settings first; optimistic revision required.',S({'project_id':STR,'revision':INT,'enabled':{'type':'boolean'},'tracks':{'type':'object','description':'Optional stable audio:N/music:N/video:N keys. Each: gain_db,solo,inserts; lane mute is canonical timeline layout.'},'channels':{'type':'object','description':'Exact music/audio/video/master keys. Each: gain_db (-60..6), mute/solo booleans, inserts array of plugin_id, bypass, parameters (normalized 0..1), optional immutable state_id.'}},['project_id','revision','enabled','channels'])),
('bai_studio_audio_plugin_inspect','Inspect a detected local VST3 effect in an isolated host process.',S({'plugin_id':STR},['plugin_id'])),
('bai_studio_audio_tracks','Read actual timeline rows, labels, source clips and canonical mutes.',S({'project_id':STR},['project_id'])),
('bai_studio_audio_lane_mute','Set one actual timeline audio lane mute with layout revision guard.',S({'project_id':STR,'revision':INT,'key':STR,'muted':{'type':'boolean'}},['project_id','revision','key','muted'])),
('bai_studio_audio_editor_open','Open the native editor for a detected inserted VST3 on Windows. Double click is the manual equivalent.',S({'project_id':STR,'key':STR,'index':INT,'revision':INT,'draft_insert':{'type':'object','description':'Optional unsaved insert; returned changes stay unsaved.'}},['project_id', 'key', 'index', 'revision'])),
('bai_studio_audio_editor_close','Close a native VST editor and apply or discard changes.',S({'id':STR,'mode':{'type':'string','enum':['apply','discard']}},['id', 'mode'])),
('bai_studio_audio_editor_recover','Explicitly recover conflicted native changes into the same plugin and current revision.',S({'id':STR,'key':STR,'index':INT,'revision':INT},['id', 'key', 'index', 'revision'])),
('bai_studio_audio_editor_status','Read native editor state and recovered parameters.',S({'id':STR},['id'])),
('bai_studio_audio_editor_list','Find active or recoverable native editors after browser reload.',S({'project_id':STR},['project_id'])),
('bai_studio_audio_meter_window','Read bounded post-fader stereo peaks, M/S/I LUFS and true peak for a prepared audio ID.',S({'id':STR,'start':{'type':'number','minimum':0},'seconds':{'type':'number','minimum':0.1,'maximum':15}},['id'])),
('bai_studio_audio_prepare','Process saved project or optional single asset through offline VST3 and mixer; returns PCM URL and measured peaks. Does not change original assets.',S({'project_id':STR,'asset_id':STR,'analysis_only':{'type':'boolean'},'lane':{'type':'integer','minimum':1},'channel':{'type':'string','enum':['music','audio','video']}},['project_id'])),
('bai_studio_clip_split','Split a saved video/audio/music clip at a project time in seconds, keeping original source windows. Revision and lock guarded; source file is retained.',S({'project_id':STR,'clip_id':STR,'revision':INT,'split_at':{'type':'number','minimum':0}},['project_id','clip_id','revision','split_at'])),
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
    # The MCP wire is UTF-8, independent of a Windows client's locale or
    # PYTHONIOENCODING. Configure before reading any request containing Japanese.
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8',newline='\n')
    sys.stderr.reconfigure(encoding='utf-8',errors='backslashreplace')
    for line in sys.stdin:
        try:
            message=json.loads(line);response=process(message)
            if response is not None:print(json.dumps(response,ensure_ascii=False),flush=True)
        except Exception as e:print('MCP malformed request: '+str(e),file=sys.stderr,flush=True)
if __name__=='__main__':main()
