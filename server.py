# Python 3.9+ standard library only. Binds to loopback, not LAN.
import hashlib, json, mimetypes, os, re, sys, threading, shutil, subprocess, time, zipfile, io, posixpath
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
from diagnostic_logging import event, recent
from qa_capture import settings as qa_settings, update as qa_update, cleanup as qa_cleanup
from operation_diagnostics import record_ui_action, diagnostics_archive
from retarget_analysis import inspect, compare
from retarget_calibration import calibrate
from retarget_pose import propose_pose
from vrm_humanoid_preview import compare_vrm_humanoid
from retarget_mapping_preview import preview as mapping_preview
from pose_ik import validate_pose
from ai_ik_preview import preview as ai_ik_preview
from retarget_root import convert_root_samples
from motion_interchange import analyze_motion
from foot_contact import diagnose, root_offset_proposal
from dual_foot_plan import propose_dual_foot
from bvh_foot_world import sample_bvh_foot_world
from bai_ai_manager import read_config as ai_read_config, save_config as ai_save_config, status as ai_status, interpret_pose as ai_interpret_pose, AIUnavailable
RETARGET_FILE=Path(__file__).resolve().parent/'data'/'retarget_profiles.json'
RETARGET_LOCK=threading.RLock()
def retarget_read():
    try:return json.loads(RETARGET_FILE.read_text(encoding='utf8'))
    except (OSError,ValueError):return {'schema':1,'profiles':{}}

def resolve_asset(identifier):
    entry=next((x for x in unified_assets() if x['id']==identifier and x['available']),None)
    if not entry:raise ValueError('registered asset not found')
    if entry['source']=='fbx':return FILES/(identifier.split(':',1)[1]+'.fbx')
    if entry['source']=='integrated':return DATA/'integrated_v02'/'assets'/entry['filename']
    if entry['source']=='mmd':
        _,slot,name=identifier.split(':',2)
        return MMD_DIR/slot/name
    raise ValueError('unsupported asset source')

BASE=Path(__file__).resolve().parent
AI_CONFIG=BASE/'data'/'bai_ai_config.json'
DATA=BASE/'data'; FILES=DATA/'files'; FILES.mkdir(parents=True,exist_ok=True)
MMD_DIR=DATA/'mmd'; MMD_DIR.mkdir(parents=True,exist_ok=True)
MMD_META=DATA/'mmd_assets.json'; MMD_LOCK=threading.RLock()
PMX_ZIP_MAX_FILES=1500; PMX_ZIP_MAX_UNCOMPRESSED=600*1024*1024
META=DATA/'manifest.json'; FAVORITES=DATA/'favorites.json'; PROJECT=DATA/'project_state.json'; PROJECT_LOCK=threading.RLock(); MAX_SIZE=400*1024*1024
CUSTOM_ASSETS=DATA/'integrated_v02'/'assets'; CUSTOM_ASSETS.mkdir(parents=True,exist_ok=True)
CUSTOM_INDEX=DATA/'integrated_v02'/'user_assets.json'
CUSTOM_LOCK=threading.RLock()
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
        result.append({'id':'integrated:'+filename,'name':e.get('name',filename),'format':fmt,'kind':'model' if e in c.get('models',[]) else 'motion','source':'integrated','filename':filename,'available':(DATA/'integrated_v02'/source).is_file(),'previewable':fmt in ('GLB','VRM')})
    for slot,entries in read_mmd().items():
        for e in entries:
            name=e.get('name','')
            if not name:continue
            fmt=Path(name).suffix.lower().lstrip('.').upper()
            if fmt not in ('PMX','VMD'):continue
            result.append({'id':'mmd:'+slot+':'+name,'name':name,'format':fmt,'kind':slot,'source':'mmd','available':(MMD_DIR/slot/name).is_file(),'previewable':True})
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
    def bad(self,status,msg):self.send(status,json.dumps({'error':msg},ensure_ascii=False).encode())
    def do_GET(self):
        path=urlsplit(self.path).path
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
            from urllib.parse import parse_qs
            try:limit=int(parse_qs(urlsplit(self.path).query).get('limit',['80'])[0])
            except (ValueError,TypeError):limit=80
            self.send(200,json.dumps({'entries':recent(limit)},ensure_ascii=False).encode());return
        if path=='/foot_qa_ui.js':
            self.send(200,(BASE/'foot_qa_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/retarget_ui.js':
            self.send(200,(BASE/'retarget_ui.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path=='/motion_layers.js':
            self.send(200,(BASE/'motion_layers.js').read_bytes(),'text/javascript; charset=utf-8');return
        if path in ('/','/index.html'):
            self.send(200,(BASE/'index.html').read_bytes(),'text/html; charset=utf-8');return
        if path=='/api/server-version':
            self.send(200,json.dumps({'version':'0.12.9','features':['pmx_zip_upload','mmd_assets','integrated_v02','integrated_upload']}).encode());return
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
            self.send(200,json.dumps({'items':unified_assets()},ensure_ascii=False).encode());return
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
            self.send(200,payload);return
        if path=='/api/project':
            with PROJECT_LOCK:
                try: payload=PROJECT.read_bytes()
                except FileNotFoundError:payload=b'{}'
            self.send(200,payload);return
        if path=='/api/project':
            with PROJECT_LOCK:
                try: payload=PROJECT.read_bytes()
                except FileNotFoundError:payload=b'{}'
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
        if urlsplit(self.path).path=='/api/retarget/vrm-humanoid-preview':
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=8192:return self.bad(413,'payload too large')
                obj=json.loads(self.rfile.read(size))
                a=resolve_asset(obj['source']);b=resolve_asset(obj['target'])
                if a.suffix.lower() not in ('.vrm','.glb') or b.suffix.lower() not in ('.vrm','.glb'):
                    return self.bad(400,'VRM/GLB files only')
                result=compare_vrm_humanoid(a.read_bytes(),b.read_bytes())
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
        if n<0 or n>MAX_SIZE:return self.bad(413,'file too large or missing length')
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
                tmp=PROJECT.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,PROJECT)
            sync_bump()
            self.send(200,b'{"ok":true}');return
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
                tmp=PROJECT.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,PROJECT)
            sync_bump()
            self.send(200,b'{"ok":true}');return
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
