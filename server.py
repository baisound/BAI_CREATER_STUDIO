# Python 3.9+ standard library only. Binds to loopback, not LAN.
import hashlib, json, mimetypes, os, re, sys, threading, shutil, subprocess, time
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
from diagnostic_logging import event, recent
BASE=Path(__file__).resolve().parent
DATA=BASE/'data'; FILES=DATA/'files'; FILES.mkdir(parents=True,exist_ok=True)
MMD_DIR=DATA/'mmd'; MMD_DIR.mkdir(parents=True,exist_ok=True)
MMD_META=DATA/'mmd_assets.json'; MMD_LOCK=threading.RLock()
META=DATA/'manifest.json'; FAVORITES=DATA/'favorites.json'; PROJECT=DATA/'project_state.json'; PROJECT_LOCK=threading.RLock(); MAX_SIZE=400*1024*1024

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
        event('http.response',method=getattr(self,'command','?'),route=urlsplit(getattr(self,'path','')).path[:120],status=code)
        return super().send_response(code,message)

    def send(self,status,data,ctype='application/json'):
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def bad(self,status,msg):self.send(status,json.dumps({'error':msg},ensure_ascii=False).encode())
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/diagnostics/recent':
            from urllib.parse import parse_qs
            try:limit=int(parse_qs(urlsplit(self.path).query).get('limit',['80'])[0])
            except (ValueError,TypeError):limit=80
            self.send(200,json.dumps({'entries':recent(limit)},ensure_ascii=False).encode());return
        if path in ('/','/index.html'):
            self.send(200,(BASE/'index.html').read_bytes(),'text/html; charset=utf-8');return
        if path=='/api/mmd-assets':
            self.send(200,json.dumps(read_mmd(),ensure_ascii=False).encode());return
        if path.startswith('/api/mmd-file/'):
            parts=path.split('/')
            if len(parts)!=5 or parts[3] not in ('A','B','vmd'):
                return self.bad(400,'invalid asset path')
            slot,name=parts[3],parts[4]
            from urllib.parse import unquote
            name=unquote(name)
            if '/' in name or '\\' in name or name in ('.','..') or not any(e.get('name')==name for e in read_mmd().get(slot,[])):
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
                payload=(DATA/'integrated_v02'/'catalog.json').read_bytes()
            except OSError:return self.bad(404,'integrated catalog is missing')
            self.send(200,payload);return
        if path.startswith('/api/integrated-v02/asset/'):
            from urllib.parse import unquote
            filename=unquote(path.split('/')[-1])
            if not filename or filename in ('.','..') or '/' in filename or '\\' in filename:
                return self.bad(400,'invalid asset name')
            try:
                c=json.loads((DATA/'integrated_v02'/'catalog.json').read_text(encoding='utf8'))
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
        # Browser diagnostics are accepted only from a same-origin localhost page.
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
