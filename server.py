# Python 3.9+ standard library only. Binds to loopback, not LAN.
import hashlib, json, mimetypes, os, re, sys, threading, shutil, subprocess, time, zipfile, io, posixpath
from pathlib import Path
from bai_camera import read as camera_read, save as camera_save, sample as camera_sample, read_project as camera_read_project, reset_project as camera_reset_project, CameraProjectInvalid
from camera_project_revision import revision as camera_revision
from camera_focus import diagnose as focus_diagnose, diagnose_range as focus_diagnose_range
from camera_vmd_inspect import inspect_camera_vmd
from camera_vmd_codec import decode_camera_track, encode_camera_track
from camera_vmd_playback import sample_native_camera
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs, quote, unquote as path_unquote
from bai_paths import data_dir
import library_assets
import asset_thumbnails
import music_dance_project
from diagnostic_logging import event, recent
from qa_capture import settings as qa_settings, update as qa_update, cleanup as qa_cleanup
from operation_diagnostics import record_ui_action, diagnostics_archive
from retarget_analysis import inspect, compare
from retarget_calibration import calibrate
from retarget_pose import propose_pose
from vrm_humanoid_preview import compare_vrm_humanoid, suggest_humanoid_mapping
from rest_rotation_transfer import preview as explicit_rest_preview
from rest_pose_inspection import compare as inspect_rest_pairs
from rest_hierarchy_inspection import inspect as inspect_rest_hierarchy
from world_rest_motion_preview import preview as world_rest_motion_preview
from animated_world_preview import preview as animated_world_preview
from animated_hierarchy_preview import preview as animated_hierarchy_preview
from vrm_local_transfer import transfer as vrm_local_transfer, quality as vrm_transfer_quality
from retarget_review_bundle import build as build_review_bundle
from retarget_keyframe_review import build_keyframe_review
from retarget_mapping_preview import preview as mapping_preview
from pose_ik import validate_pose
from ai_ik_preview import preview as ai_ik_preview
from retarget_root import convert_root_samples
from motion_interchange import analyze_motion
from foot_contact import diagnose, root_offset_proposal
from dual_foot_plan import propose_dual_foot
from bvh_foot_world import sample_bvh_foot_world
from bai_ai_manager import read_config as ai_read_config, save_config as ai_save_config, status as ai_status, interpret_pose as ai_interpret_pose, AIUnavailable
RETARGET_FILE=data_dir()/'retarget_profiles.json'
RETARGET_LOCK=threading.RLock()
def retarget_read():
    try:return json.loads(RETARGET_FILE.read_text(encoding='utf8'))
    except (OSError,ValueError):return {'schema':1,'profiles':{}}

def resolve_asset(identifier):
    entry=next((x for x in unified_assets() if x['id']==identifier and x['available']),None)
    if not entry:raise ValueError('registered asset not found')
    if entry['source']=='fbx':return FILES/(identifier.split(':',1)[1]+'.fbx')
    if entry['source']=='integrated':return DATA/'integrated_v02'/'assets'/entry['filename']
    if entry['source']=='library':return LIBRARY_ROOT/'files'/entry['filename']
    if entry['source']=='mmd':
        _,slot,name=identifier.split(':',2)
        return MMD_DIR/slot/name
    raise ValueError('unsupported asset source')

BASE=Path(__file__).resolve().parent
DATA=data_dir(); AI_CONFIG=DATA/'bai_ai_config.json'
FILES=DATA/'files'; FILES.mkdir(parents=True,exist_ok=True)
MMD_DIR=DATA/'mmd'; MMD_DIR.mkdir(parents=True,exist_ok=True)
MMD_META=DATA/'mmd_assets.json'; MMD_LOCK=threading.RLock()
PMX_ZIP_MAX_FILES=1500; PMX_ZIP_MAX_UNCOMPRESSED=600*1024*1024
META=DATA/'manifest.json'; FAVORITES=DATA/'favorites.json'; PROJECT=DATA/'project_state.json'; PROJECT_LOCK=threading.RLock(); MAX_SIZE=400*1024*1024
CUSTOM_ASSETS=DATA/'integrated_v02'/'assets'; CUSTOM_ASSETS.mkdir(parents=True,exist_ok=True)
CUSTOM_INDEX=DATA/'integrated_v02'/'user_assets.json'
CUSTOM_LOCK=threading.RLock()
LIBRARY_ROOT=DATA/'library_assets'
V05_SOURCE_ROOT=DATA/'studio_v05_asset_sources'
V05_INBOX_ROOT=DATA/'asset_inbox'
LIBRARY_LOCK=threading.RLock()
CHAR_THUMB_ROOT=DATA/'asset_thumbnails'
CHAR_THUMB_LOCK=threading.RLock()
MUSIC_DANCE_FILE=DATA/'music_dance_project.json'; MUSIC_DANCE_LOCK=threading.RLock()
EDITOR_FILE=DATA/'timeline_editor.json'; EDITOR_LOCK=threading.RLock()
LAYER_FILE=DATA/'motion_layers.json'; LAYER_LOCK=threading.RLock()
def layer_read():
    try:return json.loads(LAYER_FILE.read_text(encoding='utf8'))
    except (OSError,ValueError):return {'schema':1,'layers':[]}

def editor_read():
    try: return json.loads(EDITOR_FILE.read_text(encoding='utf8'))
    except (OSError,ValueError): return {'schema':1,'clips':[],'updatedAt':None}

def user_assets():
    try:return json.loads(CUSTOM_INDEX.read_text(encoding='utf8'))
    except (OSError,ValueError):return []
def catalog_combined():
    c=json.loads((DATA/'integrated_v02'/'catalog.json').read_text(encoding='utf8'))
    for x in user_assets():
        if x['kind']=='model':c['models'].append({'name':x['name'],'source_asset':'assets/'+x['filename'],'owner_complete':True})
        else:c['motions'].append({'id':x['id'],'name':x['name'],'category':'ユーザー登録','provider':'ローカル','source_asset':'assets/'+x['filename']})
    c['asset_count']=len({x.get('source_asset') for x in c['motions']+c['models'] if x.get('source_asset')})
    return c


def character_source(entry):
    """Resolve only a registered character's source; reject escaped metadata paths."""
    if not entry.get('available') or entry.get('format') not in ('GLB','VRM','PMX','FBX'):
        return None
    if entry.get('source')=='integrated' and entry.get('kind')=='model':
        root=DATA/'integrated_v02'/'assets'; parts=(entry.get('filename',''),)
    elif entry.get('source')=='mmd' and entry.get('format')=='PMX' and entry.get('kind') in ('A','B'):
        root=MMD_DIR/entry['kind']; parts=(entry.get('name',''),)
    elif entry.get('source')=='fbx' and entry.get('kind') in ('modelA','modelB'):
        root=FILES; parts=(entry.get('id','').removeprefix('fbx:')+'.fbx',)
    else:
        return None
    base=root.resolve(); candidate=root.joinpath(*parts).resolve()
    return candidate if candidate.is_relative_to(base) and candidate.is_file() else None


def character_entry(asset_id):
    return next(((entry, source) for entry in unified_assets() if entry['id']==asset_id
                 if (source:=character_source(entry)) is not None),None)


def unified_assets():
    """Read-only, normalized inventory across the existing storage backends."""
    result=[]
    for e in readmeta().get('files',[]):
        fid=e.get('id','');name=e.get('name','')
        if not fid or not name:continue
        result.append({'id':'fbx:'+fid,'name':name,'format':'FBX','kind':e.get('kind','motions'),'source':'fbx','available':(FILES/(fid+'.fbx')).is_file(),'previewable':True})
    c=catalog_combined()
    used=set()
    for e in c.get('motions',[])+c.get('models',[]):
        source=e.get('source_asset','')
        if not source or source in used:continue
        used.add(source)
        filename=source.split('/')[-1]
        fmt=Path(filename).suffix.lower().lstrip('.').upper()
        source_path=DATA/'integrated_v02'/source
        available=source_path.is_file()
        size=source_path.stat().st_size if available else None
        result.append({'id':'integrated:'+filename,'name':e.get('name',filename),'format':fmt,'kind':'model' if e in c.get('models',[]) else 'motion','source':'integrated','filename':filename,'available':available,'bytes':size,'previewable':fmt in ('GLB','VRM')})
    for slot,entries in read_mmd().items():
        for e in entries:
            name=e.get('name','')
            if not name:continue
            fmt=Path(name).suffix.lower().lstrip('.').upper()
            if fmt not in ('PMX','VMD'):continue
            result.append({'id':'mmd:'+slot+':'+name,'name':name,'format':fmt,'kind':slot,'source':'mmd','available':(MMD_DIR/slot/name).is_file(),'previewable':True})
    with LIBRARY_LOCK:result.extend(library_assets.public_items(LIBRARY_ROOT))
    from studio_v05_asset_sources import listing as v05_sources_listing
    result.extend(v05_sources_listing(V05_SOURCE_ROOT,V05_INBOX_ROOT)['items'])
    for entry in result:
        source=character_source(entry)
        if source is None:continue
        entry['thumbnailKey']=asset_thumbnails.cache_key(entry['id'],source)
        cached=asset_thumbnails.thumbnail_for(CHAR_THUMB_ROOT,entry['id'],source)
        if cached:entry['thumbnailUrl']='/api/assets/thumbnail/'+quote(entry['id'],safe='')+'?v='+cached[1]
    return result

def readmeta():
    try:
        obj=json.loads(META.read_text(encoding='utf-8'))
        return {'files':obj.get('files',[]),'mapping':obj.get('mapping',{})}
    except (FileNotFoundError,ValueError):return {'files':[],'mapping':{}}
def writemeta(meta):
    tmp=META.with_suffix('.tmp');tmp.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,META)
def read_mmd():
    try:
        meta=json.loads(MMD_META.read_text(encoding='utf-8'))
        if isinstance(meta,dict):return meta
    except (ValueError, OSError):pass
    return {'A':[], 'B':[], 'vmd':[]}
def write_mmd(meta):
    tmp=MMD_META.with_suffix('.tmp')
    tmp.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(tmp,MMD_META)
# Cross-process browser ↔ MCP synchronization. One atomic revision file.
CONVERT_LOCK=threading.Lock()
CONVERT_STATUS=DATA/'conversion_status.json'
def conversion_status():
    try:return json.loads(CONVERT_STATUS.read_text(encoding='utf8'))
    except (ValueError,OSError):return {'status':'idle'}
def write_conversion_status(obj):
    tmp=CONVERT_STATUS.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,CONVERT_STATUS)

SYNC_FILE=DATA/'sync_state.json'
SYNC_LOCK=threading.RLock()
def sync_read():
    try:return json.loads(SYNC_FILE.read_text(encoding='utf8'))
    except (FileNotFoundError,ValueError):return {'revision':0,'commandId':0,'command':None}
def sync_bump():
    with SYNC_LOCK:
        state=sync_read();state['revision']+=1
        tmp=SYNC_FILE.with_suffix('.tmp');tmp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf8');os.replace(tmp,SYNC_FILE)
def sync_command(obj):
    with SYNC_LOCK:
        state=sync_read();state['commandId']+=1;state['command']={'id':state['commandId'],**obj}
        tmp=SYNC_FILE.with_suffix('.tmp');tmp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf8');os.replace(tmp,SYNC_FILE)
        return state['command']

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Never log arbitrary URLs, query strings, FBX paths or HTTP headers.
        pass
    def send_response(self, code, message=None):
        route=urlsplit(getattr(self,'path','')).path
        if route!='/api/sync' or code>=400:
            event('http.response',method=getattr(self,'command','?'),route=route[:120],status=code)
        return super().send_response(code,message)

    def send(self,status,data,ctype='application/json'):
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def send_library_file(self,file,ctype):
        size=file.stat().st_size
        start,end=0,size-1
        range_header=self.headers.get('Range','')
        if range_header:
            match=re.fullmatch(r'bytes=(\d+)-(\d*)',range_header.strip())
            if not match:return self.bad(400,'single byte range required')
            start=int(match.group(1));end=min(size-1,int(match.group(2))) if match.group(2) else size-1
            if start>=size or end<start:
                self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(end-start+1))
        self.send_header('Accept-Ranges','bytes')
        if range_header:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
        with file.open('rb') as source:
            source.seek(start);remaining=end-start+1
            while remaining:
                chunk=source.read(min(1024*1024,remaining))
                if not chunk:break
                try:self.wfile.write(chunk)
                except (BrokenPipeError,ConnectionResetError):break
                remaining-=len(chunk)
    def bad(self,status,msg,code=None):
        body={'error':msg}
        if code:body['error_code']=code
        self.send(status,json.dumps(body,ensure_ascii=False).encode())
    def send_camera_invalid(self,exc):
        # 422 は backup を含めるため bad() を使わず本文を直接送る（B-3）。理由は exc.message にあり、ログにだけ出す。
        event('camera.project_invalid',level='error',reason=str(exc.message)[:200],backup=exc.backup_name)
        msg='カメラ保存データ（camera_project.json）を読めません。元のファイルはそのままです。退避コピー：%s。手で直す場合：サーバーを止め、data/camera_project.json を退避コピーと見比べて直すか、別の場所へ移してから、サーバーを起動し直してください。初期状態から始める場合は、新UIの［初期状態から始める…］を使ってください（退避コピーは残ります）。'%(exc.backup_name or 'なし')
        self.send(422,json.dumps({'error':msg,'error_code':'camera_project_invalid','backup':exc.backup_name},ensure_ascii=False).encode())
    def do_GET(self):
        if urlsplit(self.path).path == '/api/studio/v05/scene/instances':
            from studio_v05_scene_instances import read as instance_read, SceneInstancesError
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                result=instance_read(DATA/'studio_v05_scene_instances', DATA/'studio_v05_scene_models',
                                     DATA/'studio_v05_catalog.json',project_id,unified_assets())
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (SceneInstancesError,ValueError,OSError) as exc:
                self.bad(409 if 'reconcile' in str(exc).lower() else 422,str(exc))
            return
        if urlsplit(self.path).path == '/api/studio/v05/scene/motion-plan':
            from studio_v05_motion_plan import plan
            from studio_v05_arrangement import ArrangementError
            from studio_v05_scene_model import SceneModelError
            try:
                project_id = parse_qs(urlsplit(self.path).query).get('id', [''])[0]
                result = plan(DATA/'studio_v05_scene_models', DATA/'studio_v05_arrangements',
                              DATA/'studio_v05_catalog.json', project_id, unified_assets())
                self.send(200, json.dumps(result, ensure_ascii=False).encode())
            except (ArrangementError, SceneModelError, ValueError, OSError) as exc:
                self.bad(422, str(exc))
            return
        if urlsplit(self.path).path in ('/api/studio/v05/scene/model','/api/studio/v05/scene/model-candidates'):
            from studio_v05_scene_model import read as scene_read, choices, SceneModelError
            try:
                inventory=unified_assets()
                if urlsplit(self.path).path.endswith('/model-candidates'):
                    result=choices(inventory)
                else:
                    project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                    result=scene_read(DATA/'studio_v05_scene_models', DATA/'studio_v05_catalog.json', project_id,inventory)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (SceneModelError,ValueError,OSError) as exc:self.bad(422,str(exc))
            return
        if urlsplit(self.path).path=='/api/studio/v05/asset-sources':
            from studio_v05_asset_sources import listing, AssetSourceError
            try:
                result=listing(V05_SOURCE_ROOT,V05_INBOX_ROOT)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (AssetSourceError,ValueError,OSError) as exc:self.bad(422,str(exc))
            return
        if urlsplit(self.path).path.startswith('/api/studio/v05/asset-source/file/'):
            from studio_v05_asset_sources import file_for
            from urllib.parse import unquote
            asset_id=unquote(urlsplit(self.path).path.split('/file/',1)[1])
            found=file_for(V05_SOURCE_ROOT,V05_INBOX_ROOT,asset_id)
            if not found:return self.bad(404,'Reference file unavailable or has changed')
            self.send_library_file(*found)
            return
        if urlsplit(self.path).path=='/api/studio/v05/assets/capabilities':
            from studio_v05_asset_categories import capabilities
            self.send(200,json.dumps(capabilities(),ensure_ascii=False).encode());return
        if urlsplit(self.path).path=='/api/studio/v05/assets':
            from studio_v05_arrangement import inventory, ArrangementError
            q=parse_qs(urlsplit(self.path).query)
            try:self.send(200,json.dumps(inventory(unified_assets(),q.get('category',['all'])[0],q.get('query',[''])[0]),ensure_ascii=False).encode())
            except ArrangementError as exc:self.bad(400,str(exc))
            return
        if urlsplit(self.path).path=='/api/studio/v05/playhead':
            from studio_v05_playhead import read, PlayheadError
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(read(DATA/'studio_v05_playheads',DATA/'studio_v05_catalog.json',project_id),ensure_ascii=False).encode())
            except (PlayheadError,ValueError,KeyError,OSError):self.bad(422,'Cannot read playhead')
            return
        if urlsplit(self.path).path=='/api/studio/v05/timeline/layout':
            from studio_v05_track_layout import get
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(get(DATA/'studio_v05_track_layouts',DATA/'studio_v05_catalog.json',project_id),ensure_ascii=False).encode())
            except (ValueError,KeyError,OSError):self.bad(422,'Cannot read track layout')
            return
        if urlsplit(self.path).path=='/api/studio/v05/timeline/view':
            from studio_v05_arrangement import timeline_view, ArrangementError
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(timeline_view(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',project_id),ensure_ascii=False).encode())
            except (ArrangementError,ValueError,KeyError,OSError):self.bad(422,'Cannot read project timeline')
            return
        if urlsplit(self.path).path=='/api/studio/v05/arrangement':
            from studio_v05_arrangement import read, ArrangementError
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(read(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',project_id),ensure_ascii=False).encode())
            except (ArrangementError,ValueError,KeyError,OSError):self.bad(422,'Cannot read project arrangement')
            return
        if urlsplit(self.path).path=='/api/studio/v05/focus-reports':
            from studio_v05_focus_reports import read, FocusReportError
            try:
                pid=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(read(DATA/'studio_v05_focus_reports',DATA/'studio_v05_catalog.json',pid),ensure_ascii=False).encode())
            except (FocusReportError,ValueError,KeyError,OSError) as exc:self.bad(422,str(exc))
            return
        if urlsplit(self.path).path=='/api/studio/v05/focus-target':
            from studio_v05_focus_target import read, FocusTargetError
            try:
                pid=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                self.send(200,json.dumps(read(DATA/'studio_v05_focus_targets',DATA/'studio_v05_catalog.json',pid),ensure_ascii=False).encode())
            except (FocusTargetError,ValueError,KeyError,OSError) as exc:self.bad(422,str(exc))
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/fps':
            from studio_project_catalog import list_projects, CatalogError
            try:
                pid=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                catalog=list_projects(DATA/'studio_v05_catalog.json')
                item=next((v for v in catalog['projects'] if v['id']==pid),None)
                if item is None:raise CatalogError('Project not found')
                self.send(200,json.dumps({'project_id':pid,'fps':item.get('fps'),'configured':'fps' in item}).encode())
            except (CatalogError,ValueError,OSError) as exc:self.bad(422,str(exc))
            return
        if urlsplit(self.path).path=='/api/studio/v05/projects':
            from studio_project_catalog import list_projects, CatalogError
            try:self.send(200,json.dumps(list_projects(DATA/'studio_v05_catalog.json'),ensure_ascii=False).encode())
            except (ValueError,OSError):self.bad(422,'プロジェクト一覧を読めません。元ファイルは保護されます。')
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/activation-preview':
            from studio_project_activation import preview, ActivationConflict
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                with PROJECT_LOCK: result=preview(DATA/'studio_v05_snapshots',DATA/'studio_v05_catalog.json',project_id,PROJECT,DATA/'camera_project.json')
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except FileNotFoundError:return self.bad(404,'保存済み作品がありません')
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (ValueError,TypeError,KeyError,OSError):return self.bad(422,'復元プレビューを作成できません')
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/snapshot':
            from studio_project_snapshots import read
            from studio_project_catalog import CatalogError
            try:
                project_id=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
                payload=read(DATA/'studio_v05_snapshots',DATA/'studio_v05_catalog.json',project_id)
                self.send(200,json.dumps(payload,ensure_ascii=False).encode())
            except FileNotFoundError:return self.bad(404,'保存済みスナップショットがありません')
            except (CatalogError,ValueError,KeyError,OSError):return self.bad(422,'スナップショットの読み込みに失敗しました')
            return
        path=urlsplit(self.path).path
        if path in ("/camera.html", "/camera.css", "/camera.js", "/camera_3d.js", "/camera_vmd_local.js", "/camera_rig.js", "/camera_follow_config.js", "/camera_follow_smoothing.js", "/camera_framing.js", "/camera_lens.js", "/camera_dof.js", "/camera_focus_tracking.js", "/camera_focus_consistency.js", "/camera_bundle_core.js", "/camera_project_bundle_ui.js", "/camera_sequence_playback.js"):
            file=BASE/path[1:];self.send(200,file.read_bytes(),"text/css" if path.endswith(".css") else "text/javascript" if path.endswith(".js") else "text/html; charset=utf-8");return
        if path=="/api/project/bundle":
            from project_state_bundle import read_bundle, bundle_revision
            try:
                with PROJECT_LOCK:
                    payload=read_bundle(PROJECT, DATA/'camera_project.json', strict=True)
                    payload['revision']=bundle_revision(payload)
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except Exception as exc:return self.bad(500,'統合保存データを読めませんでした: '+type(exc).__name__)
            self.send(200,json.dumps(payload,ensure_ascii=False).encode());return
        if path=="/api/camera/project":
            try:
                with PROJECT_LOCK:
                    camera_project=camera_read_project(DATA/"camera_project.json")[0]
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            self.send(200,json.dumps({'project':camera_project,'revision':camera_revision(camera_project)},ensure_ascii=False).encode() if 'envelope=1' in urlsplit(self.path).query else json.dumps(camera_project,ensure_ascii=False).encode());return
        if path=="/api/camera/focus":
            try:
                args=parse_qs(urlsplit(self.path).query)
                def arg(name, default):return args.get(name,[default])[0]
                opts=dict(focal_mm=float(arg('focal_mm',50)),aperture=float(arg('aperture',2.8)),focus_m=float(arg('focus_m',4)),target=arg('target','face'))
                project=camera_read(DATA/'camera_project.json')
                if 'end' in args:
                    result=focus_diagnose_range(project,int(arg('start',0)),int(arg('end',0)),step=int(arg('step',1)),**opts)
                else:result=focus_diagnose(project,int(arg('frame',0)),**opts)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,OverflowError) as exc:return self.bad(400,str(exc))
        if path=="/api/camera/sequence/evaluate":
            try:
                from camera_sequence_api import evaluate
                f=float(parse_qs(urlsplit(self.path).query).get('frame',['0'])[0])
                result=evaluate(camera_read(DATA/'camera_project.json'),f)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,OverflowError,KeyError) as exc:return self.bad(400,str(exc))
        if path=="/api/camera/sample":
            try:
                f=float(__import__("urllib.parse",fromlist=["parse_qs"]).parse_qs(urlsplit(self.path).query).get("frame",["0"])[0]);result=camera_sample(camera_read(DATA/"camera_project.json"),f)
                self.send(200,json.dumps(result).encode());return
            except (ValueError,TypeError) as exc:return self.bad(400,str(exc))
        if path=='/pose_ik_ui.js':
            self.send(200,(BASE/'pose_ik_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/api/pose/last':
            f=DATA/'pose_ik_last.json'
            try:payload=json.loads(f.read_text(encoding='utf8'))
            except (ValueError,OSError):payload={'schema':1,'frame':0,'limbs':{}}
            self.send(200,json.dumps(payload,ensure_ascii=False).encode());return
        if path=='/bai_ai_ui.js':
            self.send(200,(BASE/'bai_ai_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/api/ai/settings':
            self.send(200,json.dumps(ai_read_config(AI_CONFIG),ensure_ascii=False).encode());return
        if path=='/api/ai/status':
            self.send(200,json.dumps(ai_status(ai_read_config(AI_CONFIG)),ensure_ascii=False).encode());return
        if path=='/webmcp.js':
            self.send(200,(BASE/'webmcp.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/api/diagnostics/export':
            payload=diagnostics_archive()
            self.send(200,payload,'application/zip');return
        if path=='/api/ui-qa/settings':
            self.send(200,json.dumps({'settings':qa_settings(),'storage':qa_cleanup()}).encode());return
        if path=='/api/diagnostics/recent':
            try:limit=int(parse_qs(urlsplit(self.path).query).get('limit',['80'])[0])
            except (ValueError,TypeError):limit=80
            self.send(200,json.dumps({'entries':recent(limit)},ensure_ascii=False).encode());return
        if path=='/foot_qa_ui.js':
            self.send(200,(BASE/'foot_qa_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path in ('/v01629_mesh_compare.js','/v01630_32_review.js','/v01633_35_scrub.js','/v01636_40_playback.js','/v01641_preview_guard.js'):
            filename=path.lstrip('/')
            self.send(200,(BASE/filename).read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/retarget_ui.js':
            self.send(200,(BASE/'retarget_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/motion_layers.js':
            self.send(200,(BASE/'motion_layers.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path in ('/','/index.html'):
            self.send(200,(BASE/'index.html').read_bytes(),'text/html; charset=utf-8');return
        if path.startswith('/workspace') or path.startswith('/studio/'):
            from studio_routes import resolve as studio_resolve
            found=studio_resolve(path)
            if found:
                self.send(200,found[0].read_bytes(),found[1]);return
        if path=='/api/server-version':
            self.send(200,json.dumps({'version':'0.12.9','features':['pmx_zip_upload','mmd_assets','integrated_v02','integrated_upload','library_assets','music_dance']}).encode());return
        if path=='/api/retarget/profile-for-pair':
            params=parse_qs(urlsplit(self.path).query);source=params.get('source',[''])[0];target=params.get('target',[''])[0]
            if not source or not target:return self.bad(400,'source and target required')
            profile=retarget_read().get('profiles',{}).get(hashlib.sha256((source+'\0'+target).encode()).hexdigest()[:24])
            self.send(200,json.dumps({'source':source,'target':target,'profile':profile},ensure_ascii=False).encode());return
        if path=='/api/retarget/profiles':
            self.send(200,json.dumps(retarget_read(),ensure_ascii=False).encode());return
        if path=='/api/retarget/motion-channels':
            identifier=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
            try:
                result=analyze_motion(resolve_asset(identifier))
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (ValueError,IndexError,OSError,KeyError,TypeError) as ex:self.bad(400,str(ex))
            return
        if path=='/api/retarget/analyze':
            identifier=__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlsplit(self.path).query).get('id',[''])[0]
            try:self.send(200,json.dumps(inspect(resolve_asset(identifier)),ensure_ascii=False).encode())
            except (ValueError,OSError,IndexError) as ex:self.bad(400,str(ex))
            return
        if path=='/api/retarget/compare':
            params=__import__('urllib.parse',fromlist=['parse_qs']).parse_qs(urlsplit(self.path).query)
            try:
                a=inspect(resolve_asset(params.get('source',[''])[0]))
                b=inspect(resolve_asset(params.get('target',[''])[0]))
                self.send(200,json.dumps({'source':a,'target':b,'comparison':compare(a,b)},ensure_ascii=False).encode())
            except (ValueError,OSError,IndexError) as ex:self.bad(400,str(ex))
            return
        if path=='/api/retarget/pose-proposal':
            params=parse_qs(urlsplit(self.path).query)
            try:
                source=inspect(resolve_asset(params.get('source',[''])[0]))
                target=inspect(resolve_asset(params.get('target',[''])[0]))
                self.send(200,json.dumps(propose_pose(source,target),ensure_ascii=False).encode())
            except (ValueError,OSError,IndexError,KeyError,TypeError) as ex:self.bad(400,str(ex))
            return
        if path=='/api/retarget/calibration':
            params=parse_qs(urlsplit(self.path).query)
            try:
                a=inspect(resolve_asset(params.get('source',[''])[0]));b=inspect(resolve_asset(params.get('target',[''])[0]))
                self.send(200,json.dumps(calibrate(a,b),ensure_ascii=False).encode())
            except (ValueError,OSError,IndexError,KeyError) as ex:self.bad(400,str(ex))
            return
        if path=='/api/motion-layers':
            with LAYER_LOCK:self.send(200,json.dumps(layer_read(),ensure_ascii=False).encode());return
        if path=='/api/timeline-editor':
            with EDITOR_LOCK: self.send(200,json.dumps(editor_read(),ensure_ascii=False).encode());return
        if path=='/api/assets':
            try:self.send(200,json.dumps({'items':unified_assets()},ensure_ascii=False).encode())
            except (ValueError,OSError):self.bad(500,'素材索引を読めません。原本は保持されています。')
            return
        if path.startswith('/api/assets/thumbnail/'):
            asset_id=path_unquote(path[len('/api/assets/thumbnail/'):])
            try:
                found=character_entry(asset_id)
                if not found:return self.bad(404,'character asset not found')
                with CHAR_THUMB_LOCK:cached=asset_thumbnails.thumbnail_for(CHAR_THUMB_ROOT,asset_id,found[1])
                if not cached:return self.bad(404,'thumbnail not found')
                self.send(200,cached[0].read_bytes(),'image/png')
            except (ValueError,OSError):self.bad(500,'正面画像を読めません。')
            return
        if path=='/api/music-dance/project':
            try:
                with MUSIC_DANCE_LOCK: payload=music_dance_project.read(MUSIC_DANCE_FILE)
                self.send(200,json.dumps(payload,ensure_ascii=False).encode())
            except music_dance_project.InvalidMusicDanceProject:
                event('music_dance.project_invalid',level='error')
                self.bad(422,'音楽・ダンスの保存データを読めません。元ファイルを保持しています。')
            return
        if path.startswith('/api/library-assets/file/'):
            from urllib.parse import unquote
            asset_id=unquote(path[len('/api/library-assets/file/'):])
            try:
                with LIBRARY_LOCK:found=library_assets.file_for(LIBRARY_ROOT,asset_id)
                if not found:return self.bad(404,'registered asset not found')
                self.send_library_file(*found)
            except (ValueError,OSError):self.bad(500,'素材を読めません。原本は保持されています。')
            return
        if path.startswith('/api/library-assets/thumbnail/'):
            from urllib.parse import unquote
            asset_id=unquote(path[len('/api/library-assets/thumbnail/'):])
            try:
                with LIBRARY_LOCK:found=library_assets.thumbnail_for(LIBRARY_ROOT,asset_id)
                if not found:return self.bad(404,'thumbnail not found')
                self.send(200,found.read_bytes(),'image/png')
            except (ValueError,OSError):self.bad(500,'見本画像を読めません。')
            return
        if path=='/api/mmd-assets':
            self.send(200,json.dumps(read_mmd(),ensure_ascii=False).encode());return
        if path.startswith('/api/mmd-file/'):
            parts=path.split('/')
            if len(parts)<5 or parts[3] not in ('A','B','vmd'):
                return self.bad(400,'invalid asset path')
            slot,name=parts[3],'/'.join(parts[4:])
            from urllib.parse import unquote
            name=unquote(name)
            if (not name or name.startswith('/') or any(p in ('','.', '..') for p in name.split('/')) or '\\' in name or not any(e.get('name')==name for e in read_mmd().get(slot,[]))):
                return self.bad(404,'asset not registered')
            f=MMD_DIR/slot/name
            if not f.is_file():return self.bad(404,'asset missing')
            ctype='application/octet-stream'
            if f.suffix.lower() in ('.png',):ctype='image/png'
            if f.suffix.lower() in ('.jpg','.jpeg'):ctype='image/jpeg'
            self.send(200,f.read_bytes(),ctype);return
        if path=='/api/conversion-status':
            self.send(200,json.dumps(conversion_status(),ensure_ascii=False).encode());return
        if path=='/api/sync':
            self.send(200,json.dumps(sync_read(),ensure_ascii=False).encode());return
        if path=='/api/conversion-map':
            try:payload=(DATA/'conversion_map.json').read_bytes()
            except FileNotFoundError:payload=b'{}'
            self.send(200,json.dumps({'project':json.loads(payload),'revision':camera_revision(json.loads(payload))},ensure_ascii=False).encode() if 'envelope=1' in urlsplit(self.path).query else payload);return
        if path=='/api/project':
            try:
                with PROJECT_LOCK:
                    try: payload=PROJECT.read_bytes()
                    except FileNotFoundError:payload=b'{}'
                    if 'envelope=1' in urlsplit(self.path).query:
                        obj=json.loads(payload)
                        payload=json.dumps({'project':obj,'revision':camera_revision(obj)},ensure_ascii=False).encode()
            except Exception:return self.bad(500,'制作状態（project_state.json）を読めませんでした')
            self.send(200,payload);return
        if path=='/api/favorites':
            try: payload=FAVORITES.read_bytes()
            except FileNotFoundError:payload=b'[]'
            self.send(200,payload);return
        if path=='/api/integrated-v02/catalog':
            try:
                payload=json.dumps(catalog_combined(),ensure_ascii=False).encode()
            except OSError:return self.bad(404,'integrated catalog is missing')
            self.send(200,payload);return
        if path.startswith('/api/integrated-v02/asset/'):
            from urllib.parse import unquote
            filename=unquote(path.split('/')[-1])
            if not filename or filename in ('.','..') or '/' in filename or '\\' in filename:
                return self.bad(400,'invalid asset name')
            try:
                c=catalog_combined()
                allowed={x['source_asset'] for x in c.get('motions',[])+c.get('models',[]) if x.get('source_asset')}
            except (OSError,ValueError,KeyError):return self.bad(503,'catalog unavailable')
            asset='assets/'+filename
            if asset not in allowed:return self.bad(404,'asset is not registered')
            p=DATA/'integrated_v02'/asset
            if not p.is_file():return self.bad(404,'asset missing')
            self.send(200,p.read_bytes(),'application/octet-stream');return
        if path=='/api/manifest':self.send(200,json.dumps(readmeta(),ensure_ascii=False).encode());return
        if path.startswith('/api/file/'):
            fid=path.split('/')[-1];entry=next((e for e in readmeta()['files'] if e['id']==fid),None)
            if entry is None:return self.bad(404,'not found')
            f=FILES/(fid+'.fbx')
            if not f.exists():return self.bad(404,'missing file')
            self.send(200,f.read_bytes(),'application/octet-stream');return
        if path=='/favicon.ico':self.send(204,b'');return
        self.bad(404,'not found')
    def do_POST(self):
        if urlsplit(self.path).path == '/api/studio/v05/scene/instances':
            from studio_v05_scene_instances import mutate, SceneInstancesError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                allowed={'project_id','action','revision','instance_id','asset_id',
                         'transform','visible','locked'}
                if not isinstance(body,dict) or not {'project_id','action','revision'} <= set(body) or set(body)-allowed:
                    return self.bad(400,'Invalid scene instances fields')
                result=mutate(DATA/'studio_v05_scene_instances',DATA/'studio_v05_scene_models',
                              DATA/'studio_v05_catalog.json',assets=unified_assets(),**body)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (SceneInstancesError,ValueError,TypeError,KeyError) as exc:
                self.bad(409 if ('conflict' in str(exc).lower() or 'locked' in str(exc).lower()
                                 or 'reconcile' in str(exc).lower()) else 422,str(exc))
            except OSError:self.bad(500,'Scene instances write failed; original retained')
            return
        if urlsplit(self.path).path=='/api/studio/v05/scene/model':
            from studio_v05_scene_model import set_model,SceneModelError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or set(body)!={'project_id','asset_id','transform','revision'}:
                    return self.bad(400,'Invalid scene model fields')
                result=set_model(DATA/'studio_v05_scene_models',DATA/'studio_v05_catalog.json',
                                 items=unified_assets(),**body)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (SceneModelError,TypeError,ValueError,KeyError) as exc:
                self.bad(409 if 'conflict' in str(exc).lower() else 422,str(exc))
            except OSError:self.bad(500,'Scene model write failed; original retained')
            return
        if urlsplit(self.path).path in ('/api/studio/v05/asset-sources/register',
                                       '/api/studio/v05/asset-sources/relink'):
            from studio_v05_asset_sources import register,relink,AssetSourceError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):return self.bad(400,'Invalid payload')
                if urlsplit(self.path).path.endswith('/register'):
                    if set(body)!={'relative_path','kind','mode','revision'}:
                        return self.bad(400,'Invalid source fields')
                    result=register(V05_SOURCE_ROOT,V05_INBOX_ROOT,LIBRARY_ROOT,**body)
                else:
                    if set(body)!={'asset_id','relative_path','revision'}:
                        return self.bad(400,'Invalid relink fields')
                    result=relink(V05_SOURCE_ROOT,V05_INBOX_ROOT,**body)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (AssetSourceError,ValueError,TypeError,KeyError) as exc:
                self.bad(409 if 'conflict' in str(exc).lower() else 422,str(exc))
            except OSError:self.bad(500,'Asset source operation failed; original files preserved')
            return
        if urlsplit(self.path).path=='/api/studio/v05/playhead':
            from studio_v05_playhead import update, PlayheadError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or set(body)!={'project_id','seconds','revision'}:return self.bad(400,'Invalid fields')
                result=update(DATA/'studio_v05_playheads',DATA/'studio_v05_catalog.json',**body)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (PlayheadError,ValueError,TypeError,KeyError) as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except OSError:self.bad(500,'Write failed')
            return
        if urlsplit(self.path).path in ('/api/studio/v05/arrangement/batch-move','/api/studio/v05/arrangement/undo','/api/studio/v05/timeline/flags'):
            path=urlsplit(self.path).path
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=32768:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):return self.bad(400,'Invalid payload')
                if path.endswith('/batch-move'):
                    from studio_v05_arrangement import batch_move
                    if set(body)!={'project_id','revision','edits'}:return self.bad(400,'Invalid fields')
                    result=batch_move(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',layout_root=DATA/'studio_v05_track_layouts',**body)
                elif path.endswith('/undo'):
                    from studio_v05_arrangement import undo_batch
                    if set(body)!={'project_id','revision'}:return self.bad(400,'Invalid fields')
                    result=undo_batch(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',**body)
                else:
                    from studio_v05_track_layout import set_flags
                    if set(body)!={'project_id','revision','locked','muted'}:return self.bad(400,'Invalid fields')
                    result=set_flags(DATA/'studio_v05_track_layouts',DATA/'studio_v05_catalog.json',**body)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (ValueError,KeyError,TypeError) as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except OSError:self.bad(500,'Write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/timeline/layout':
            from studio_v05_track_layout import update, ArrangementError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or set(body)!={'project_id','revision','order','heights'}:return self.bad(400,'Invalid track layout request')
                result=update(DATA/'studio_v05_track_layouts',DATA/'studio_v05_catalog.json',body['project_id'],body['revision'],body['order'],body['heights'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except ArrangementError as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except (ValueError,TypeError,KeyError):self.bad(400,'Invalid track layout')
            except OSError:self.bad(500,'Track layout write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/arrangement/clip/target':
            from studio_v05_arrangement import set_clip_target, ArrangementError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or set(body)!={'project_id','clip_id','revision','target_model_id'}:return self.bad(400,'Invalid target request')
                result=set_clip_target(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',body['project_id'],body['clip_id'],body['revision'],body['target_model_id'],unified_assets(),layout_root=DATA/'studio_v05_track_layouts')
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except ArrangementError as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except (ValueError,TypeError,KeyError):self.bad(400,'Invalid target binding')
            except OSError:self.bad(500,'Target binding write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/arrangement/clip/edit':
            from studio_v05_arrangement import edit_clip, ArrangementError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):return self.bad(400,'Invalid clip edit')
                base={'project_id','clip_id','revision','action'}
                expected=base|({'start','duration','track'} if body.get('action')=='update' else set())
                if set(body)!=expected:return self.bad(400,'Invalid clip edit fields')
                args={k:body[k] for k in ('start','duration','track') if k in body}
                result=edit_clip(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',body['project_id'],body['clip_id'],body['revision'],body['action'],layout_root=DATA/'studio_v05_track_layouts',**args)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except ArrangementError as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except (ValueError,TypeError,KeyError):self.bad(400,'Invalid clip edit')
            except OSError:self.bad(500,'Clip update failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/arrangement/place':
            from studio_v05_arrangement import place, ArrangementError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict) or set(body)!={'project_id','asset_id','track','start','duration','revision'}:return self.bad(400,'Invalid arrangement request')
                result=place(DATA/'studio_v05_arrangements',DATA/'studio_v05_catalog.json',body['project_id'],body['asset_id'],body['track'],body['start'],body['duration'],body['revision'],unified_assets(),layout_root=DATA/'studio_v05_track_layouts')
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except ArrangementError as exc:self.bad(409 if 'conflict' in str(exc).lower() else 400,str(exc))
            except (ValueError,TypeError,KeyError):self.bad(400,'Invalid clip data')
            except OSError:self.bad(500,'Arrangement write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/activate':
            from studio_project_activation import activate, ActivationConflict
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict) or set(request)!={'id','expected_revision','confirm'} or request['confirm'] is not True:
                    return self.bad(400,'Explicit confirmation and revision required')
                with PROJECT_LOCK:
                    result=activate(DATA/'studio_v05_snapshots',DATA/'studio_v05_catalog.json',request['id'],PROJECT,DATA/'camera_project.json',DATA/'studio_v05_activation_backups',request['expected_revision'])
                sync_bump();self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except ActivationConflict:return self.bad(409,'現在の作品が変更されました。再確認してください')
            except FileNotFoundError:return self.bad(404,'保存済み作品がありません')
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (ValueError,TypeError,KeyError):return self.bad(400,'復元要求が不正です')
            except OSError:return self.bad(500,'復元中にファイル操作が失敗しました。バックアップを確認してください')
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/snapshot':
            from studio_project_snapshots import save
            from studio_project_catalog import CatalogError
            from project_state_bundle import read_bundle
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict) or set(request)!={'id'}:return self.bad(400,'Expected project ID')
                with PROJECT_LOCK:
                    bundle=read_bundle(PROJECT,DATA/'camera_project.json',strict=True)
                    bundle={k:v for k,v in bundle.items() if k in ('schema','combination','camera','workspace') and (k!='workspace' or v is not None)}
                    result=save(DATA/'studio_v05_snapshots',DATA/'studio_v05_catalog.json',request['id'],bundle)
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (CatalogError,ValueError,TypeError,KeyError):return self.bad(400,'Invalid project snapshot request')
            except OSError:return self.bad(500,'Snapshot save failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/diagnostic':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:return self.bad(413,'Diagnostic payload too large')
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict) or payload.get('category')!='camera' or not isinstance(payload.get('code'),str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,63}',payload['code']):raise ValueError('Invalid diagnostic')
                event('v05_camera_diagnostic',level=payload.get('level') if payload.get('level') in ('info','warning','error') else 'info',code=payload['code'],project_id=payload.get('projectId'),frame=payload.get('frame'))
                self.send(200,b'{"logged":true}')
            except (ValueError,TypeError):self.bad(400,'Invalid camera diagnostic')
            except OSError:self.bad(500,'Diagnostic log write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/focus-reports':
            from studio_v05_focus_reports import save, FocusReportError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=262144:return self.bad(413,'Request too large')
                data=json.loads(self.rfile.read(length))
                result=save(DATA/'studio_v05_focus_reports',DATA/'studio_v05_catalog.json',data.get('project_id'),data.get('revision'),data.get('report'))
                event('v05_focus_report_saved',project_id=result['project_id'],revision=result['revision'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (FocusReportError,ValueError,TypeError,KeyError) as exc:self.bad(400,str(exc))
            except OSError:self.bad(500,'Focus report write failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/focus-target':
            from studio_v05_focus_target import save, FocusTargetError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise FocusTargetError('Expected object')
                result=save(DATA/'studio_v05_focus_targets',DATA/'studio_v05_catalog.json',data.get('project_id'),data.get('revision'),data.get('model_id'),data.get('bone_name'),data.get('enabled',False))
                event('v05_focus_target_saved',project_id=result['project_id'],enabled=result['enabled'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode())
            except (FocusTargetError,ValueError,TypeError,KeyError) as exc:self.bad(400,str(exc))
            except OSError:self.bad(500,'Focus target save failed')
            return
        if urlsplit(self.path).path=='/api/studio/v05/project/fps':
            from studio_project_catalog import set_fps, CatalogError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict):raise CatalogError('Expected JSON object')
                item=set_fps(DATA/'studio_v05_catalog.json',payload.get('project_id'),payload.get('fps'))
                event('v05_project_fps_set',project_id=item['id'],fps=item['fps'])
                self.send(200,json.dumps({'project':item},ensure_ascii=False).encode())
            except (CatalogError,TypeError,ValueError) as exc:self.bad(400,str(exc))
            except OSError:self.bad(500,'Failed to save project FPS')
            return
        if urlsplit(self.path).path in ('/api/studio/v05/projects','/api/studio/v05/projects/rename'):
            from studio_project_catalog import create, rename, CatalogError
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:return self.bad(413,'Request too large')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise CatalogError('Expected JSON object')
                catalog=DATA/'studio_v05_catalog.json'
                if urlsplit(self.path).path.endswith('/rename'):
                    item=rename(catalog,data.get('id'),data.get('name'))
                else:item=create(catalog,data.get('name'),data.get('kind','empty'))
                self.send(200,json.dumps({'project':item},ensure_ascii=False).encode())
            except (CatalogError,ValueError,TypeError) as exc:self.bad(400,str(exc))
            except OSError:self.bad(500,'Failed to save project catalog')
            return
        if urlsplit(self.path).path=='/api/music-dance/project':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=65536:return self.bad(413,'music/dance project too large')
                expected=self.headers.get('If-Match')
                if not expected:return self.bad(428,'music/dance revision required')
                payload=music_dance_project.validate(json.loads(self.rfile.read(length)))
                with MUSIC_DANCE_LOCK:
                    current=music_dance_project.read(MUSIC_DANCE_FILE)
                    if expected!=current['revision']:
                        return self.bad(409,'music/dance project changed: reload before saving')
                    result=music_dance_project.save(MUSIC_DANCE_FILE,payload)
                event('music_dance.project_saved',model=payload['model_id'],motion=payload['motion_id'],audio=payload['audio_id'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except music_dance_project.InvalidMusicDanceProject:
                event('music_dance.project_invalid',level='error')
                return self.bad(422,'音楽・ダンスの保存データを読めません。元ファイルを保持しています。')
            except (ValueError,TypeError,KeyError,UnicodeError) as exc:
                return self.bad(400,str(exc))
            except OSError:
                return self.bad(500,'音楽・ダンスの保存に失敗しました。元データを確認してください。')
        if urlsplit(self.path).path=='/api/project/bundle':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4*1024*1024:return self.bad(413,'bundle too large')
                from project_state_bundle import save_bundle, read_bundle, bundle_revision
                data=json.loads(self.rfile.read(length))
                with PROJECT_LOCK:
                    expected=self.headers.get('If-Match')
                    if not expected:
                        return self.bad(428,'bundle revision required: reload before saving')
                    current=read_bundle(PROJECT,DATA/'camera_project.json',strict=True)
                    if expected!=bundle_revision(current):
                        return self.bad(409,'bundle changed on server: refresh before saving')
                    result=save_bundle(PROJECT,DATA/'camera_project.json',data)
                    result['revision']=bundle_revision(read_bundle(PROJECT,DATA/'camera_project.json'))
                sync_bump()
                self.send(200,json.dumps(result).encode());return
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (ValueError,TypeError,KeyError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/camera/vmd/preview-pose':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=16*1024*1024:return self.bad(413,'camera track too large')
                request=json.loads(self.rfile.read(n))
                from camera_vmd_bridge import preview_pose
                result=preview_pose(request['track'],request['frame'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/camera/vmd/native/sample':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=16*1024*1024:return self.bad(413,'camera track too large')
                request=json.loads(self.rfile.read(n))
                result=sample_native_camera(request['track'],request['frame'])
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/camera/vmd/native/import':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=32*1024*1024:return self.bad(413,'VMD too large')
                result=decode_camera_track(self.rfile.read(n))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,OverflowError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/camera/vmd/native/export':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=16*1024*1024:return self.bad(413,'camera track too large')
                result=encode_camera_track(json.loads(self.rfile.read(n)))
                self.send(200,result,'application/octet-stream');return
            except (ValueError,TypeError,OverflowError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/camera/vmd/inspect':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=32*1024*1024:return self.bad(413,'VMD too large')
                result=inspect_camera_vmd(self.rfile.read(n))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,OverflowError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=="/api/camera/sequence/edit":
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 65536:return self.bad(413,'sequence edit too large')
                request=json.loads(self.rfile.read(length))
                from camera_sequence_edit import edit
                with PROJECT_LOCK:
                    path=DATA/'camera_project.json'
                    updated=edit(camera_read_project(path)[0],request)
                    camera_save(path,updated)
                self.send(200,json.dumps({'ok':True,'sequence':updated.get('sequence',[])},ensure_ascii=False).encode());return
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (ValueError,TypeError,KeyError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=="/api/camera/project/reset":
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<=length<=4096:raise ValueError('bad length')
                body=json.loads(self.rfile.read(length)) if length else None
                if not isinstance(body,dict) or body.get('confirm')!='reset-camera-project':raise ValueError('no confirm')
            except (ValueError,TypeError):return self.bad(400,'確認の文字列がありません',code='confirmation_required')
            try:
                with PROJECT_LOCK:
                    backup=camera_reset_project(DATA/'camera_project.json')
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            self.send(200,json.dumps({'backup':backup},ensure_ascii=False).encode());return
        if urlsplit(self.path).path=="/api/camera/project":
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1024*1024:return self.bad(413,'camera project too large')
                obj=json.loads(self.rfile.read(length))
                with PROJECT_LOCK:
                    expected=self.headers.get('If-Match')
                    current=camera_read_project(DATA/'camera_project.json')[0]  # If-Match の有無にかかわらず書く前に厳格に読む（B-3）
                    if expected and expected!=camera_revision(current):
                        return self.bad(409,'camera project changed on server: refresh before saving')
                    result=camera_save(DATA/'camera_project.json',obj)
                self.send(200,json.dumps({**result,'_revision':camera_revision(result)}).encode());return
            except CameraProjectInvalid as exc:return self.send_camera_invalid(exc)
            except (ValueError,TypeError,KeyError) as exc:return self.bad(400,str(exc))
        if urlsplit(self.path).path=='/api/pose/solve':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=16384:return self.bad(413,'pose payload too large')
                obj=json.loads(self.rfile.read(n));result=validate_pose(obj)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (TypeError,ValueError,OverflowError,KeyError) as e:return self.bad(400,str(e))
        if urlsplit(self.path).path=='/api/pose/save':
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=16384:return self.bad(413,'pose payload too large')
                obj=json.loads(self.rfile.read(n));result=validate_pose(obj)
                path=DATA/'pose_ik_last.json';temp=path.with_suffix('.tmp')
                temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8');os.replace(temp,path)
                self.send(200,json.dumps({'ok':True,'frame':result['frame'],'limbs':list(result['limbs'])}).encode());return
            except (TypeError,ValueError,OverflowError,KeyError) as e:return self.bad(400,str(e))
        if urlsplit(self.path).path in ('/api/ai/settings','/api/ai/pose-proposal','/api/ai/ik-preview'):
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=8192:return self.bad(413,'request too large')
                obj=json.loads(self.rfile.read(n))
                if urlsplit(self.path).path=='/api/ai/settings':result=ai_save_config(AI_CONFIG,obj)
                elif urlsplit(self.path).path=='/api/ai/pose-proposal':result=ai_interpret_pose(ai_read_config(AI_CONFIG),obj.get('text',''))
                else:
                    proposal=ai_interpret_pose(ai_read_config(AI_CONFIG),obj.get('text',''))['proposal']
                    result=ai_ik_preview(proposal,obj.get('baseline'))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except AIUnavailable as e:
                self.send(503,json.dumps({'ok':False,'state':'offline','manual_available':True,'error':str(e)},ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError) as e:return self.bad(400,str(e))

        if urlsplit(self.path).path=='/api/qa/bvh-foot-world':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=2400000:return self.bad(413,'BVH request too large')
                obj=json.loads(self.rfile.read(size))
                if not isinstance(obj,dict) or not isinstance(obj.get('bvh_text'),str):return self.bad(400,'Missing BVH text')
                raw=obj['bvh_text'].encode('utf8')
                result=sample_bvh_foot_world(raw,obj.get('foot_bone',''),obj.get('stride',1))
                if obj.get('diagnose',True):
                    report=diagnose(result['samples'],ground_y=float(obj.get('ground_y',0)),height_tolerance=float(obj.get('height_tolerance',0.06)),motion_tolerance=float(obj.get('motion_tolerance',0.025)))
                    result['diagnosis']=report
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/qa/dual-foot-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                result=propose_dual_foot(obj['left_samples'],obj['right_samples'],ground_y=obj.get('ground_y',0.0),height_tolerance=obj.get('height_tolerance',0.06),motion_tolerance=obj.get('motion_tolerance',0.025),max_offset=obj.get('max_offset',0.2),conflict_tolerance=obj.get('conflict_tolerance',0.05))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/qa/foot-contact':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                samples=obj['samples']
                result=diagnose(samples,ground_y=float(obj.get('ground_y',0)),height_tolerance=float(obj.get('height_tolerance',0.06)),motion_tolerance=float(obj.get('motion_tolerance',0.025)))
                if obj.get('propose_root_offsets'):
                    result['root_offset_proposal']=root_offset_proposal(result,samples)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/explicit-rest-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                result=explicit_rest_preview(obj)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/glb-clip-hierarchy-inspection':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                src=resolve_asset(obj['source'])
                if src.suffix.lower() not in ('.vrm','.glb'):return self.bad(400,'VRM/GLB files only')
                result=animated_hierarchy_preview(src.read_bytes(),obj.get('clip'),obj.get('fps',30))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/keyframe-review':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                review=build_review_bundle(a.read_bytes(),b.read_bytes(),obj.get('clip'),obj.get('fps',30),obj.get('coordinate_convention_confirmed') is True,obj.get('max_samples',2000))
                self.send(200,json.dumps(build_keyframe_review(review),ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/review-bundle':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=build_review_bundle(a.read_bytes(),b.read_bytes(),obj.get('clip'),obj.get('fps',30),obj.get('coordinate_convention_confirmed') is True,obj.get('max_samples',2000))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/vrm-local-transfer-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=vrm_local_transfer(a.read_bytes(),b.read_bytes(),obj.get('clip'),obj.get('fps',30),obj.get('coordinate_convention_confirmed') is True,obj.get('max_samples',2000))
                result['quality']=vrm_transfer_quality(result)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/glb-clip-rest-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=animated_world_preview(a.read_bytes(),b.read_bytes(),obj.get('clip'),obj.get('fps',30),obj.get('coordinate_convention_confirmed') is True)
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/world-rest-motion-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=524288:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=world_rest_motion_preview(a.read_bytes(),b.read_bytes(),obj['samples'],obj.get('coordinate_convention_confirmed'))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/rest-hierarchy-inspection':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=inspect_rest_hierarchy(a.read_bytes(),b.read_bytes())
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/rest-pose-inspection':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=inspect_rest_pairs(a.read_bytes(),b.read_bytes())
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/vrm-humanoid-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=suggest_humanoid_mapping(a.read_bytes(),b.read_bytes())
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OSError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/mapping-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                source_id=obj['source'];target_id=obj['target']
                source=inspect(resolve_asset(source_id));target=inspect(resolve_asset(target_id))
                key=hashlib.sha256((source_id+'\0'+target_id).encode()).hexdigest()[:24]
                profile=retarget_read().get('profiles',{}).get(key)
                if not profile or not profile.get('mapping'):return self.bad(400,'saved bone mapping required')
                result=mapping_preview(profile['mapping'],obj.get('samples',[]),source.get('bones',[]),target.get('bones',[]))
                self.send(200,json.dumps(result,ensure_ascii=False).encode());return
            except (ValueError,TypeError,KeyError,IndexError,OverflowError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/root-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1048576:return self.bad(413,'too large')
                obj=json.loads(self.rfile.read(size))
                samples=obj.get('samples',[])
                if not isinstance(samples,list):return self.bad(400,'invalid samples')
                converted=convert_root_samples(samples,obj['scale'],obj.get('yaw_offset_deg',0),obj.get('origin',[0,0,0]),obj.get('target_origin',[0,0,0]))
                self.send(200,json.dumps({'ok':True,'samples':converted,'applied_to_model':False,'warning':'Preview only; no animation, IK or VMD is modified.'}).encode());return
            except (ValueError,TypeError,KeyError,IndexError) as ex:return self.bad(400,str(ex))
        if urlsplit(self.path).path=='/api/retarget/profiles':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=262144:return self.bad(413,'profile too large')
                obj=json.loads(self.rfile.read(size))
                if not isinstance(obj,dict) or obj.get('schema')!=1 or not isinstance(obj.get('profiles'),dict) or len(obj['profiles'])>50:return self.bad(400,'invalid profiles')
                for key,p in obj['profiles'].items():
                    if not isinstance(key,str) or len(key)>100 or not isinstance(p,dict) or not isinstance(p.get('mapping'),dict) or len(p['mapping'])>200:return self.bad(400,'invalid mapping')
                    if not all(isinstance(k,str) and isinstance(v,str) and len(k)<100 and len(v)<150 for k,v in p['mapping'].items()):return self.bad(400,'invalid bones')
                with RETARGET_LOCK:
                    tmp=RETARGET_FILE.with_suffix('.tmp')
                    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
                    os.replace(tmp,RETARGET_FILE)
                self.send(200,b'{"ok":true}');return
            except (TypeError,ValueError):return self.bad(400,'invalid profile JSON')
        if urlsplit(self.path).path=='/api/motion-layers':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=262144:return self.bad(413,'layers too large')
                obj=json.loads(self.rfile.read(size))
                if not isinstance(obj,dict) or obj.get('schema')!=1 or not isinstance(obj.get('layers'),list) or len(obj['layers'])>32:return self.bad(400,'invalid layers')
                valid=[]
                for layer in obj['layers']:
                    if not isinstance(layer,dict) or not isinstance(layer.get('name'),str) or not isinstance(layer.get('bone'),str):return self.bad(400,'invalid layer')
                    if len(layer['name'])>100 or len(layer['bone'])>120 or not isinstance(layer.get('keys'),list) or len(layer['keys'])>500:return self.bad(400,'invalid keys')
                    keys=[]
                    for k in layer['keys']:
                        if not isinstance(k,dict):return self.bad(400,'invalid key')
                        frame=int(k['frame']);angles=[float(k[x]) for x in ('x','y','z')]
                        if not 0<=frame<=1000000 or not all(-180<=a<=180 for a in angles):return self.bad(400,'invalid angles')
                        keys.append(dict(frame=frame,x=angles[0],y=angles[1],z=angles[2]))
                    valid.append({'name':layer['name'],'bone':layer['bone'],'enabled':bool(layer.get('enabled',True)),'keys':sorted(keys,key=lambda x:x['frame'])})
                with LAYER_LOCK:
                    tmp=LAYER_FILE.with_suffix('.tmp');tmp.write_text(json.dumps({'schema':1,'layers':valid},ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,LAYER_FILE)
                self.send(200,json.dumps({'ok':True,'count':len(valid)}).encode());return
            except (KeyError,TypeError,ValueError,OverflowError):return self.bad(400,'invalid motion layer values')
        if urlsplit(self.path).path=='/api/timeline-editor':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=262144:return self.bad(413,'timeline too large')
                data=json.loads(self.rfile.read(size))
                if not isinstance(data,dict) or data.get('schema')!=1 or not isinstance(data.get('clips'),list) or len(data['clips'])>200:return self.bad(400,'invalid timeline')
                valid=[]
                for c in data['clips']:
                    if not isinstance(c,dict) or not isinstance(c.get('name'),str) or len(c['name'])>250:return self.bad(400,'invalid clip name')
                    start=int(c.get('start',0));duration=int(c.get('duration',90));speed=float(c.get('speed',1));blend=int(c.get('blend',6))
                    if not(0<=start<=1000000 and 1<=duration<=100000 and .1<=speed<=4 and 0<=blend<=120):return self.bad(400,'invalid clip timing')
                    valid.append({'name':c['name'],'start':start,'duration':duration,'speed':speed,'blend':blend})
                obj={'schema':1,'clips':valid,'updatedAt':time.time()}
                with EDITOR_LOCK:
                    tmp=EDITOR_FILE.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,EDITOR_FILE)
                self.send(200,json.dumps({'ok':True,'count':len(valid)}).encode());return
            except (TypeError,ValueError,OverflowError):return self.bad(400,'invalid timeline values')

        # Browser diagnostics are accepted only from a same-origin localhost page.
        if urlsplit(self.path).path=='/api/diagnostics/action':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1200:return self.bad(413,'invalid action size')
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict):return self.bad(400,'invalid action')
                recorded=record_ui_action(payload)
            except (ValueError,TypeError):return self.bad(400,'invalid action')
            self.send(200,json.dumps({'ok':True,'recorded':recorded}).encode());return
        if urlsplit(self.path).path=='/api/ui-qa/settings':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length>200 or length<=0: return self.bad(400,'invalid size')
                payload=json.loads(self.rfile.read(length))
                if type(payload.get('enabled')) is not bool: return self.bad(400,'enabled must be boolean')
                d=qa_update(payload['enabled'])
                self.send(200,json.dumps({'settings':d,'storage':qa_cleanup()}).encode());return
            except (ValueError,TypeError):return self.bad(400,'invalid settings')
        if urlsplit(self.path).path=='/api/diagnostics/client':
            origin=self.headers.get('Origin','')
            host=self.headers.get('Host','')
            if origin and origin not in ('http://'+host,'https://'+host):return self.bad(403,'same-origin required')
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:return self.bad(413,'invalid diagnostic size')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise ValueError('invalid body')
                name=str(data.get('kind','browser.error'))[:80]
                if name not in ('browser.error','browser.rejection','browser.webgl','browser.info'):return self.bad(400,'invalid kind')
                event(name,level='warning',message=str(data.get('message',''))[:500],source='browser')
            except (ValueError,TypeError):return self.bad(400,'invalid diagnostic')
            self.send(200,b'{"ok":true}');return
        u=urlsplit(self.path);qs=parse_qs(u.query)
        try:n=int(self.headers.get('Content-Length','-1'))
        except ValueError:n=-1
        library_stage = u.path=='/api/library-assets/upload' and qs.get('kind',[''])[0]=='stage'
        limit = library_assets.MAX_STAGE_UPLOAD if library_stage else MAX_SIZE
        if n<0 or n>limit:return self.bad(413,'file too large or missing length')
        if u.path=='/api/library-assets/upload':
            name=qs.get('name',[''])[0];kind=qs.get('kind',[''])[0]
            try:
                with LIBRARY_LOCK:item=library_assets.register_stream(LIBRARY_ROOT,self.rfile,n,kind,name)
                event('library.asset.import',kind=kind,bytes=n)
                self.send(200,json.dumps({'ok':True,'item':item},ensure_ascii=False).encode())
            except ValueError as exc:self.bad(400,str(exc)[:180])
            except (OSError,TypeError):self.bad(500,'素材を保存できませんでした。原本は保持されています。')
            return
        if u.path=='/api/library-assets/thumbnail':
            asset_id=qs.get('id',[''])[0]
            if n>library_assets.MAX_THUMBNAIL:return self.bad(413,'thumbnail too large')
            try:
                payload=self.rfile.read(n)
                if len(payload)!=n:return self.bad(400,'incomplete thumbnail')
                with LIBRARY_LOCK:library_assets.save_thumbnail(LIBRARY_ROOT,asset_id,payload)
                self.send(200,b'{"ok":true}')
            except ValueError as exc:self.bad(400,str(exc)[:180])
            except OSError:self.bad(500,'見本画像を保存できませんでした。')
            return
        if u.path=='/api/assets/thumbnail':
            asset_id=qs.get('id',[''])[0]
            if n>asset_thumbnails.MAX_PNG:return self.bad(413,'thumbnail too large')
            try:
                found=character_entry(asset_id)
                if not found:return self.bad(404,'character asset not found')
                payload=self.rfile.read(n)
                if len(payload)!=n:return self.bad(400,'incomplete thumbnail')
                with CHAR_THUMB_LOCK:cached=asset_thumbnails.save_thumbnail(CHAR_THUMB_ROOT,asset_id,found[1],payload)
                url='/api/assets/thumbnail/'+quote(asset_id,safe='')+'?v='+cached[1]
                self.send(200,json.dumps({'ok':True,'url':url}).encode())
            except ValueError as exc:self.bad(400,str(exc)[:180])
            except OSError:self.bad(500,'正面画像を保存できませんでした。')
            return
        if u.path=='/api/run-vmd-conversion':
            if n>2048:return self.bad(413,'request too large')
            try:
                payload=json.loads(self.rfile.read(n))
                assert isinstance(payload,dict) and payload.get('confirm') is True
                assert payload.get('slot','A') in ('A','B')
            except (ValueError,AssertionError,TypeError):return self.bad(400,'confirm=true and slot A/B required')
            if not CONVERT_LOCK.acquire(blocking=False):return self.bad(409,'conversion already running')
            try:
                jobpath=BASE/'exports'/'vmd_conversion_job.json'
                if not jobpath.is_file():return self.bad(400,'generate a VMD job first')
                job=json.loads(jobpath.read_text(encoding='utf8'))
                # Do not execute arbitrary job paths: enforce saved registered inputs and fixed output.
                sources={str((FILES/(e['id']+'.fbx')).resolve()) for e in readmeta()['files'] if e.get('kind')=='motions'}
                steps=job.get('steps',[])
                target=(BASE/'exports'/'chain_motion.vmd').resolve()
                if not steps or len(steps)>300 or any(st.get('file') not in sources for st in steps) or Path(job.get('output','')).resolve()!=target:
                    return self.bad(400,'conversion job contains unregistered paths')
                blender=os.environ.get('MIXAMO_BLENDER','blender')
                blender_path=shutil.which(blender)
                if not blender_path:return self.bad(503,'Blender executable not found; set MIXAMO_BLENDER')
                before=time.time();write_conversion_status({'status':'running','started':before})
                proc=subprocess.run([blender_path,'-b','-t','2','--python',str(BASE/'tools'/'fbx_chain_to_vmd.py'),'--','--job',str(jobpath)],cwd=str(BASE),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240,text=True,errors='replace')
                if proc.returncode!=0 or not target.is_file() or target.stat().st_size<54 or not target.open('rb').read(30).startswith(b'Vocaloid Motion Data 0002'):
                    outcome={'status':'failed','returncode':proc.returncode,'output_tail':proc.stdout[-3000:]};write_conversion_status(outcome)
                    self.send(422,json.dumps(outcome,ensure_ascii=False).encode());return
                name='chain_motion.vmd'
                with MMD_LOCK:
                    folder=MMD_DIR/'vmd';folder.mkdir(parents=True,exist_ok=True)
                    tmp=folder/(name+'.tmp');shutil.copyfile(target,tmp);os.replace(tmp,folder/name)
                    meta=read_mmd();meta['vmd']=[e for e in meta.get('vmd',[]) if e.get('name')!=name]+[{'name':name,'size':target.stat().st_size}];write_mmd(meta)
                sync_command({'action':'preview_vmd','name':name,'slot':payload['slot']})
                outcome={'status':'succeeded','name':name,'slot':payload['slot'],'bytes':target.stat().st_size,'elapsed_seconds':round(time.time()-before,2),'warning':'Conversion output requires visual validation on the intended PMX.'}
                write_conversion_status(outcome);self.send(200,json.dumps(outcome,ensure_ascii=False).encode());return
            except subprocess.TimeoutExpired:
                write_conversion_status({'status':'failed','error':'Blender exceeded 240 seconds'});return self.bad(504,'Blender timed out')
            except (OSError,ValueError,KeyError) as exc:
                write_conversion_status({'status':'failed','error':str(exc)});return self.bad(500,str(exc))
            finally:CONVERT_LOCK.release()
        if u.path=='/api/integrated-v02/upload':
            from urllib.parse import unquote
            name=unquote(qs.get('name',[''])[0]);kind=qs.get('kind',[''])[0]
            if kind not in ('model','motion') or not re.fullmatch(r'[^/\\\x00]{1,180}\.(glb|vrm)',name,re.I):return self.bad(400,'GLBまたはVRMファイルを選択してください')
            if n<=0 or n>MAX_SIZE:return self.bad(413,'ファイルサイズを確認してください')
            extension=Path(name).suffix.lower()
            if extension=='.vrm' and kind!='model':return self.bad(400,'VRMはモデルとして登録してください')
            payload=self.rfile.read(n)
            if len(payload)!=n or payload[:4]!=b'glTF':return self.bad(400,'GLB/VRM形式として認識できません')
            ident=hashlib.sha256(payload).hexdigest()[:20];stored=ident+extension
            with CUSTOM_LOCK:
                target=CUSTOM_ASSETS/stored;tmp=target.with_suffix('.incoming');tmp.write_bytes(payload);os.replace(tmp,target)
                entries=[x for x in user_assets() if x['filename']!=stored]
                entries.append({'id':'user-'+ident,'name':name,'filename':stored,'kind':kind,'bytes':len(payload)})
                mt=CUSTOM_INDEX.with_suffix('.tmp');mt.write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf8');os.replace(mt,CUSTOM_INDEX)
            event('integrated.asset.import',kind=kind,bytes=len(payload))
            self.send(200,json.dumps({'ok':True,'name':name,'asset':stored,'kind':kind},ensure_ascii=False).encode());return
        if u.path=='/api/pmx-zip-upload':
            slot=qs.get('slot',[''])[0]
            if slot not in ('A','B'):return self.bad(400,'invalid PMX slot')
            if n<1 or n>MAX_SIZE:return self.bad(413,'ZIP exceeds upload limit')
            payload=self.rfile.read(n)
            if len(payload)!=n:return self.bad(400,'incomplete upload')
            try:
                with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                    entries=[x for x in archive.infolist() if not x.is_dir()]
                    if not entries or len(entries)>PMX_ZIP_MAX_FILES:raise ValueError('ZIP file count limit exceeded')
                    total=sum(x.file_size for x in entries)
                    if total>PMX_ZIP_MAX_UNCOMPRESSED:raise ValueError('uncompressed ZIP too large')
                    valid=[]
                    for e in entries:
                        path=e.filename.replace('\\','/')
                        segments=path.split('/')
                        if (not path or path.startswith('/') or any(seg in ('','.', '..') for seg in segments) or
                            ':' in path or '\x00' in path or e.flag_bits & 1 or (e.external_attr>>16)&0o170000 == 0o120000):
                            raise ValueError('unsafe ZIP path or encrypted entry')
                        if not re.search(r'\.(pmx|png|jpg|jpeg|bmp|tga|spa|sph|gif|dds|webp|toon)$',path,re.I):
                            continue
                        valid.append((e,path))
                    models=[path for _,path in valid if path.lower().endswith('.pmx')]
                    if len(models)!=1:raise ValueError('ZIP must contain exactly one PMX model')
                    # Preserve the structure underneath the model directory so relative texture URLs work.
                    model_path=models[0]; parent=posixpath.dirname(model_path)
                    selected=[]
                    for e,path in valid:
                        if parent and not path.startswith(parent+'/'):continue
                        relative=path[len(parent)+1:] if parent else path
                        selected.append((e,relative))
                    if not selected:raise ValueError('no PMX assets')
                    with MMD_LOCK:
                        slotdir=MMD_DIR/slot; slotdir.mkdir(parents=True,exist_ok=True)
                        import tempfile
                        with tempfile.TemporaryDirectory(prefix='pmx-',dir=MMD_DIR) as tmp:
                            staged=Path(tmp)
                            for entry,relative in selected:
                                target=staged.joinpath(*relative.split('/'));target.parent.mkdir(parents=True,exist_ok=True)
                                with archive.open(entry) as inp, target.open('wb') as dst:shutil.copyfileobj(inp,dst,1024*1024)
                            # Copy only after validation and complete extraction; never clear existing unrelated files.
                            for entry,relative in selected:
                                source=staged.joinpath(*relative.split('/'));dest=slotdir.joinpath(*relative.split('/'))
                                dest.parent.mkdir(parents=True,exist_ok=True);os.replace(source,dest)
                        meta=read_mmd();by_name={e['name']:e for e in meta.get(slot,[])}
                        for entry,relative in selected:by_name[relative]={'name':relative,'size':entry.file_size}
                        meta[slot]=list(by_name.values());write_mmd(meta)
                    event('pmx.zip.import',slot=slot,files=len(selected),bytes=total)
                    self.send(200,json.dumps({'ok':True,'slot':slot,'model':posixpath.basename(model_path),'model_path':models[0][len(parent)+1:] if parent else model_path,'files':len(selected)},ensure_ascii=False).encode());return
            except (zipfile.BadZipFile,ValueError,RuntimeError,OSError) as exc:
                return self.bad(400,'PMX ZIP rejected: '+str(exc)[:180])
        if u.path=='/api/mmd-upload':
            slot=qs.get('slot',[''])[0]
            name=qs.get('name',[''])[0]
            if slot not in ('A','B','vmd') or not name or len(name)>180 or '/' in name or '\\' in name or name in ('.','..') or name.startswith('.'):
                return self.bad(400,'invalid asset name')
            if not re.search(r'\.(pmx|vmd|png|jpg|jpeg|bmp|tga|spa|sph|gif|dds|webp)$',name,re.I):
                return self.bad(400,'unsupported asset extension')
            if slot=='vmd' and not name.lower().endswith('.vmd'):return self.bad(400,'expected VMD')
            body=self.rfile.read(n)
            if len(body)!=n:return self.bad(400,'incomplete upload')
            with MMD_LOCK:
                dest=MMD_DIR/slot;dest.mkdir(parents=True,exist_ok=True)
                tmp=dest/(name+'.tmp');tmp.write_bytes(body);os.replace(tmp,dest/name)
                meta=read_mmd(); entries=[e for e in meta.get(slot,[]) if e.get('name')!=name]
                entries.append({'name':name,'size':n});meta[slot]=entries;write_mmd(meta)
            self.send(200,json.dumps({'ok':True,'slot':slot,'name':name}).encode());return
        if u.path=='/api/sync-command':
            if n>8192:return self.bad(413,'command too large')
            try:
                obj=json.loads(self.rfile.read(n))
                assert isinstance(obj,dict) and obj.get('action') in ('play_chain','stop_chain','preview_motion','open_pmx','refresh_assets','preview_vmd','integrated_preview','integrated_retarget')
                if obj['action'] in ('preview_motion','preview_vmd','integrated_preview','integrated_retarget'):assert isinstance(obj.get('name'),str) and len(obj['name'])<=250
            except (AssertionError,TypeError,ValueError):return self.bad(400,'invalid sync command')
            if obj['action'] in ('integrated_preview','integrated_retarget'):
                if not obj['name'].lower().endswith(('.glb','.vrm')):return self.bad(400,'GLB/VRM only')
                catalog=json.loads((DATA/'integrated_v02'/'catalog.json').read_text(encoding='utf8'))
                allowed={x['source_asset'].split('/')[-1] for x in catalog.get('motions',[])+catalog.get('models',[]) if x.get('source_asset')}
                if obj['name'] not in allowed:return self.bad(404,'asset not registered')
                if obj['action']=='integrated_retarget':
                    target=obj.get('target')
                    if not isinstance(target,str) or not target.lower().endswith('.vrm') or target not in {x['source_asset'].split('/')[-1] for x in catalog.get('models',[]) if x.get('source_asset')}:return self.bad(400,'invalid or unregistered VRM target')
            command=sync_command(obj)
            self.send(200,json.dumps({'ok':True,'command':command},ensure_ascii=False).encode());return
        if u.path=='/api/conversion-map':
            if n>65536:return self.bad(413,'map too large')
            try:
                payload=json.loads(self.rfile.read(n))
                assert isinstance(payload,dict)
                assert all(isinstance(a,str) and isinstance(b,str) and len(a)<128 and len(b)<128 for a,b in payload.items())
            except (ValueError,AssertionError):return self.bad(400,'invalid map')
            out=DATA/'conversion_map.json';tmp=out.with_suffix('.tmp')
            tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,out)
            self.send(200,b'{"ok":true}');return
        if u.path=='/api/export-vmd-job':
            if n>65536:return self.bad(413,'job too large')
            try:
                obj=json.loads(self.rfile.read(n));names=obj['names']
                assert isinstance(names,list) and 1<=len(names)<=300
                assert isinstance(obj.get('bone_map'),dict) and obj['bone_map']
                meta=readmeta();sources={e['name']:FILES/(e['id']+'.fbx') for e in meta['files'] if e['kind']=='motions'}
                steps=[]
                for name in names:
                    assert isinstance(name,str) and name in sources and sources[name].is_file()
                    steps.append({'file':str(sources[name].resolve())})
                job={'fps':30,'scale':float(obj.get('scale',1)), 'steps':steps,'bone_map':obj['bone_map'],
                     'output':str((BASE/'exports'/'chain_motion.vmd').resolve()), 'model_name':'MixamoRetarget',
                     'blend_frames':int(obj.get('blend_frames',6)), 'bone_corrections':obj.get('bone_corrections',{})}
                assert 0<job['scale']<100 and 0<=job['blend_frames']<=60
                assert isinstance(job['bone_corrections'],dict) and len(job['bone_corrections'])<=250
                assert all(isinstance(v,list) and len(v)==4 and all(isinstance(x,(int,float)) for x in v) for v in job['bone_corrections'].values())
            except (KeyError,TypeError,ValueError,AssertionError):return self.bad(400,'invalid conversion job or missing FBX')
            (BASE/'exports').mkdir(exist_ok=True)
            path=BASE/'exports'/'vmd_conversion_job.json';tmp=path.with_suffix('.tmp')
            tmp.write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)
            self.send(200,json.dumps({'ok':True,'job':'exports/vmd_conversion_job.json','command':'blender -b --python tools/fbx_chain_to_vmd.py -- --job exports/vmd_conversion_job.json','note':'Run separately in Blender; output is provisional, validate on PMX model.'}).encode());return
        if u.path=='/api/project':
            if n>3*1024*1024:return self.bad(413,'project too large')
            try:
                obj=json.loads(self.rfile.read(n))
                assert isinstance(obj,dict) and obj.get('schema')==1
                assert isinstance(obj.get('timeline'),list) and len(obj['timeline'])<=300
                assert isinstance(obj.get('history'),list) and len(obj['history'])<=120
                assert isinstance(obj.get('cursor'),int) and -1<=obj['cursor']<len(obj['history'])
                for step in obj['timeline']:
                    assert isinstance(step,dict) and isinstance(step.get('name'),str) and len(step['name'])<=250
                for h in obj['history']:
                    assert isinstance(h,dict) and isinstance(h.get('timeline'),list) and len(h['timeline'])<=300
            except (ValueError,AssertionError,TypeError,KeyError):return self.bad(400,'invalid project')
            with PROJECT_LOCK:
                expected=self.headers.get('If-Match')
                if expected:
                    try: current=json.loads(PROJECT.read_text(encoding='utf-8'))
                    except FileNotFoundError: current={}
                    except (ValueError,OSError):return self.bad(500,'制作状態（project_state.json）を読めませんでした')  # P2-WP-01 / DATA-008：壊れたファイルで接続が切れていた不具合の修正
                    if expected!=camera_revision(current):
                        return self.bad(409,'project changed on server: refresh before saving')
                tmp=PROJECT.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,PROJECT)
            sync_bump()
            self.send(200,json.dumps({"ok":True,"revision":camera_revision(obj)}).encode());return
        if u.path=='/api/project':
            if n>3*1024*1024:return self.bad(413,'project too large')
            try:
                obj=json.loads(self.rfile.read(n))
                assert isinstance(obj,dict) and obj.get('schema')==1
                assert isinstance(obj.get('timeline'),list) and len(obj['timeline'])<=300
                assert isinstance(obj.get('history'),list) and len(obj['history'])<=120
                assert isinstance(obj.get('cursor'),int) and -1<=obj['cursor']<len(obj['history'])
                for step in obj['timeline']:
                    assert isinstance(step,dict) and isinstance(step.get('name'),str) and len(step['name'])<=250
                for h in obj['history']:
                    assert isinstance(h,dict) and isinstance(h.get('timeline'),list) and len(h['timeline'])<=300
            except (ValueError,AssertionError,TypeError,KeyError):return self.bad(400,'invalid project')
            with PROJECT_LOCK:
                expected=self.headers.get('If-Match')
                if expected:
                    try: current=json.loads(PROJECT.read_text(encoding='utf-8'))
                    except FileNotFoundError: current={}
                    if expected!=camera_revision(current):
                        return self.bad(409,'project changed on server: refresh before saving')
                tmp=PROJECT.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,PROJECT)
            sync_bump()
            self.send(200,json.dumps({"ok":True,"revision":camera_revision(obj)}).encode());return
        if u.path=='/api/favorites':
            if n>2*1024*1024:return self.bad(413,'favorites too large')
            try:
                obj=json.loads(self.rfile.read(n))
                assert isinstance(obj,list) and len(obj)<=1000
                for item in obj:
                    assert isinstance(item,dict) and isinstance(item.get('name'),str) and isinstance(item.get('tags'),list) and isinstance(item.get('steps'),list)
                    assert len(item['steps'])<=200 and all(isinstance(step,dict) and isinstance(step.get('name'),str) for step in item['steps'])
            except (ValueError,AssertionError,TypeError,KeyError):return self.bad(400,'invalid favorites')
            tmp=FAVORITES.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,FAVORITES);self.send(200,b'{"ok":true}');return
        if u.path=='/api/mapping':
            if n>1024*1024:return self.bad(413,'mapping too large')
            try: obj=json.loads(self.rfile.read(n));assert isinstance(obj,dict)
            except (ValueError,AssertionError):return self.bad(400,'invalid mapping')
            meta=readmeta();meta['mapping']={str(k)[:150]:str(v)[:150] for k,v in obj.items()};writemeta(meta);self.send(200,b'{"ok":true}');return
        if u.path!='/api/upload':return self.bad(404,'not found')
        kind=qs.get('kind',[''])[0];name=qs.get('name',[''])[0]
        if kind not in ('modelA','modelB','motions') or not name.lower().endswith('.fbx') or len(name)>250:return self.bad(400,'expected FBX file')
        raw=self.rfile.read(n)
        if len(raw)!=n:return self.bad(400,'incomplete data')
        fid=hashlib.sha256((kind+'\0'+name).encode('utf8')).hexdigest()[:24]
        tmp=FILES/(fid+'.tmp');tmp.write_bytes(raw);os.replace(tmp,FILES/(fid+'.fbx'))
        meta=readmeta();previous=meta['files'];removed=[]
        if kind!='motions':
            removed=[e for e in previous if e['kind']==kind and e['id']!=fid]
            previous=[e for e in previous if e['kind']!=kind]
        previous=[e for e in previous if e['id']!=fid]
        previous.append({'id':fid,'name':name,'kind':kind,'size':n});meta['files']=previous;writemeta(meta)
        for e in removed:
            try:(FILES/(e['id']+'.fbx')).unlink(missing_ok=True)
            except OSError:pass
        self.send(200,json.dumps({'ok':True,'id':fid}).encode())
if __name__=='__main__':
    port=int(sys.argv[1]) if len(sys.argv)>1 else 8765
    try:
        server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
        event('server.started',port=port)
        print(f'Mixamo Viewer: http://127.0.0.1:{port}/',flush=True)
        server.serve_forever()
    except OSError as e:
        event('server.start_failed',level='error',error_type=type(e).__name__)
        print('ERROR:',e,flush=True);sys.exit(1)
