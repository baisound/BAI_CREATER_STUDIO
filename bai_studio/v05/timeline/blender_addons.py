"""Static addon registry and isolated CinemaOperator shooting sessions.

Never package addon code with the application; only the locally selected,
inspected release is executed, by an explicit local operation.
"""
from __future__ import annotations
import ast
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import threading
import time
import uuid
import zipfile

from bai_studio.projects.catalog import _atomic
from . import blender_camera as camera

KNOWN='5afbe14534a88e3a47b09f712fa42bd3f24b36862312bc369d84c288d3991cb9'
MAX_ZIP=32*1024*1024
LOCK=threading.RLock()
PROCESSES={}


class AddonError(ValueError):
    def __init__(self,code,message):super().__init__(message);self.code=code


def fail(code,message):raise AddonError(code,message)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def root(data):return Path(data)/'studio_v05_blender_addons'
def session_root(data):return Path(data)/'studio_v05_blender_sessions'
def script(name):return Path(__file__).resolve().parents[3]/'tools'/name


def archive(raw):
    if not isinstance(raw,bytes) or not 0<len(raw)<=MAX_ZIP:fail('archive_invalid','ZIPは32MiB以内にしてください')
    try:
        z=zipfile.ZipFile(io.BytesIO(raw));names=set();total=0
        if not 1<=len(z.infolist())<=1000:fail('archive_invalid','ZIPのファイル数が対応範囲外です')
        for f in z.infolist():
            name=f.orig_filename;p=PurePosixPath(name);key=p.as_posix().rstrip('/').casefold()
            if not name or p.as_posix()!=name.rstrip('/') or '\\' in name or ':' in name or p.is_absolute() or '..' in p.parts or any(part.rstrip(' .')!=part or part.split('.')[0].lower() in ('con','prn','aux','nul',*[f'com{i}' for i in range(1,10)],*[f'lpt{i}' for i in range(1,10)]) for part in p.parts) or any(c in name for c in ('\x00','\r','\n','*','?','<','>','|')) or key in names:
                fail('archive_invalid','ZIPに重複名または安全でない保存先があります')
            names.add(key);total+=f.file_size
            if f.flag_bits&1 or stat.S_ISLNK(f.external_attr>>16) or f.file_size>32*1024*1024 or total>64*1024*1024 or f.file_size>max(1024*1024,100*f.compress_size):
                fail('archive_invalid','暗号化・リンク・過大な展開量のZIPは使用できません')
        return z
    except (zipfile.BadZipFile,RuntimeError,NotImplementedError) as e:raise AddonError('archive_invalid','ZIPを読み込めません') from e


def zip_bytes(z,name):
    try:return z.read(name)
    except (zipfile.BadZipFile,RuntimeError,NotImplementedError,EOFError) as e:raise AddonError('archive_invalid','ZIP内のデータが破損しています') from e


def describe(raw,member='',depth=0):
    if depth>1:fail('archive_invalid','ZIPの入れ子は配布セットの内側1段までです')
    z=archive(raw)
    modules=[n for n in z.namelist() if len(PurePosixPath(n).parts)==2 and PurePosixPath(n).name=='__init__.py' and PurePosixPath(n).parts[0].isidentifier()]
    if len(modules)!=1:
        candidates=[]
        for name in z.namelist():
            if name.lower().endswith('.zip'):
                nested=zip_bytes(z,name)
                try:
                    candidate=describe(nested,name,depth+1)
                    if not candidate['distribution']:candidates.append(candidate)
                except (AddonError,SyntaxError,UnicodeError):continue
        if not candidates:fail('addon_unsupported','インストール用アドオンZIPがありません')
        return {'distribution':True,'choices':candidates,'sha256':digest(raw)}
    try:
        code=zip_bytes(z,modules[0])
        if len(code)>1024*1024:fail('addon_invalid','アドオン入口のソースは1MiB以内にしてください')
        tree=ast.parse(code.decode('utf-8-sig'))
        info=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='bl_info' for t in n.targets))
        version=list(info['version']);minimum=list(info['blender']);name=info['name']
        if not isinstance(name,str) or len(name)>120 or any(type(n) is not int for n in version+minimum) or len(version)!=3 or len(minimum)!=3:raise ValueError()
    except (ValueError,KeyError,StopIteration,SyntaxError,UnicodeError,RecursionError) as e:raise AddonError('addon_invalid','bl_infoの名称・版・対応Blenderを静的に読めません') from e
    sha=digest(raw)
    return {'distribution':False,'member':member,'id':sha,'name':name,'module':PurePosixPath(modules[0]).parts[0],'version':version,'minimum_blender':minimum,
            'supported':sha==KNOWN,'adapter':'cinemaoperator-0.7.183-v1' if sha==KNOWN else None,
            'reason':None if sha==KNOWN else '登録済みでもこの版の実行・結果取込は未対応です',
            'license':'Python: GPL-3.0-or-later / fonts: OFL。別添マニュアル・ブランドは別の権利。再配布しません。' if sha==KNOWN else '権利情報は元ZIPの案内を確認してください。アドオン本体を同梱・再配布しません。'}


def register(data,raw,member):
    info=describe(raw)
    if info['distribution']:
        choice=next((c for c in info['choices'] if c['member']==member),None)
        if not choice:fail('addon_invalid','表示した内側ZIPを選択してください')
        inner=zip_bytes(archive(raw),member)
    else:
        if member:fail('addon_invalid','インストール用ZIPでは内側ZIPを選択しません')
        choice=info;inner=raw
    with LOCK:
        folder=root(data)/choice['id'];folder.mkdir(parents=True,exist_ok=True)
        path=folder/'addon.zip'
        if path.exists() and digest(path.read_bytes())!=choice['id']:fail('addon_changed','登録原本が変更されています。元ZIPを確認してください')
        if not path.exists():path.write_bytes(inner)
        original=folder/('distribution-'+digest(raw)+'.zip')
        if not original.exists():original.write_bytes(raw)
        meta={**choice,'registered_at':time.time(),'enabled':True,'distribution_sha256':digest(raw)}
        _atomic(folder/'meta.json',meta)
        return meta


def addon(data,addon_id):
    if not isinstance(addon_id,str) or len(addon_id)!=64 or any(c not in '0123456789abcdef' for c in addon_id):fail('addon_invalid','登録版を選択してください')
    folder=root(data)/addon_id
    try:
        meta=json.loads((folder/'meta.json').read_text(encoding='utf-8'))
        if not meta['enabled'] or digest((folder/'addon.zip').read_bytes())!=addon_id:fail('addon_changed','登録版が無効または変更されています')
        return meta
    except (OSError,ValueError,KeyError) as e:
        if isinstance(e,AddonError):raise
        raise AddonError('addon_invalid','登録版を読み込めません') from e


def listing(data):
    result=[]
    for path in sorted(root(data).glob('*/meta.json')):
        try:result.append(addon(data,path.parent.name))
        except AddonError:continue
    return result


def session(data,sid):
    if not camera._id(sid):fail('session_invalid','作業コピーを選択してください')
    try:
        meta=json.loads((session_root(data)/sid/'session.json').read_text(encoding='utf-8'))
        if meta['id']!=sid:raise ValueError()
        return meta
    except (OSError,ValueError,KeyError) as e:raise AddonError('session_invalid','作業コピーを読み込めません') from e


def sessions(data,project_id):
    camera._project(data,project_id);result=[]
    for p in sorted(session_root(data).glob('*/session.json')):
        try:
            row=session(data,p.parent.name)
            if row['project_id']==project_id:result.append(row)
        except AddonError:continue
    return sorted(result,key=lambda r:r['created_at'],reverse=True)


def remove(data,addon_id):
    with LOCK:
        meta=addon(data,addon_id)
        for p in session_root(data).glob('*/session.json'):
            try:
                if json.loads(p.read_text(encoding='utf-8'))['addon_id']==addon_id:fail('addon_in_use','この版の作業コピーがあります。登録を保持します')
            except (OSError,KeyError):fail('addon_in_use','参照を確認できない作業コピーがあります。登録を保持します')
        meta['enabled']=False;_atomic(root(data)/addon_id/'meta.json',meta)
        return {'removed':True,'files_retained':True}


def executable(blender):
    path=shutil.which(blender or 'blender')
    if not path:fail('blender_unavailable','Blenderが見つかりません。MIXAMO_BLENDERを設定してください')
    return path


def process_alive(pid):
    if type(pid) is not int or pid<=0:return False
    if os.name=='nt':
        import ctypes
        api=ctypes.WinDLL('kernel32',use_last_error=True)
        api.OpenProcess.restype=ctypes.c_void_p
        handle=api.OpenProcess(0x1000,False,pid)
        if not handle:return ctypes.get_last_error()==5
        code=ctypes.c_ulong()
        try:return bool(api.GetExitCodeProcess(ctypes.c_void_p(handle),ctypes.byref(code))) and code.value==259
        finally:api.CloseHandle(ctypes.c_void_p(handle))
    try:os.kill(pid,0);return True
    except ProcessLookupError:return False
    except PermissionError:return True


def run(exe,args,timeout=90,env=None):
    try:
        r=subprocess.run([exe,*args],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),env=env)
    except (OSError,subprocess.TimeoutExpired) as e:raise AddonError('execution_failed','Blender処理が完了しませんでした。作業コピーを保持して再試行してください') from e
    if r.returncode:fail('execution_failed','Blender処理に失敗しました。対応形式・ファイルと区間を確認してください')
    return r


def profile_env(folder):
    config=folder/'profile/config';scripts=folder/'profile/scripts'
    config.mkdir(parents=True,exist_ok=True);scripts.mkdir(parents=True,exist_ok=True)
    return {**os.environ,'BLENDER_USER_CONFIG':str(config),'BLENDER_USER_SCRIPTS':str(scripts),'BAI_CINEMA_ISOLATED_PROFILE':'1'}


def glb_check(raw):
    import struct
    try:
        if raw[:4]!=b'glTF' or struct.unpack_from('<I',raw,4)[0]!=2:raise ValueError()
        length,kind=struct.unpack_from('<II',raw,12)
        if kind!=0x4e4f534a:raise ValueError()
        g=json.loads(raw[20:20+length])
        if g.get('skins') or g.get('animations') or g.get('extensionsRequired'):fail('scene_asset_unsupported','初期橋渡しはスキン・アニメーション・必須拡張のない静的GLBです')
        for item in g.get('buffers',[])+g.get('images',[]):
            if item.get('uri') and not item['uri'].startswith('data:'):fail('scene_asset_unsupported','GLB外部ファイル参照は未対応です。画像を埋め込んだGLBを使ってください')
    except (ValueError,struct.error,TypeError) as e:
        if isinstance(e,AddonError):raise
        raise AddonError('scene_asset_unavailable','GLBを読み込めません') from e


def context(data,project_id,assets):
    from .scene_instances import read
    scene=read(Path(data)/'studio_v05_scene_instances',Path(data)/'studio_v05_scene_models',Path(data)/'studio_v05_catalog.json',project_id,assets)
    arranged=camera.arrangement.read(Path(data)/'studio_v05_arrangements',Path(data)/'studio_v05_catalog.json',project_id)
    return scene,arranged


def check_origin(data,origin,assets):
    s=session(data,origin['session_id']);folder=session_root(data)/s['id']
    addon(data,s['addon_id'])
    if digest((folder/'manifest.json').read_bytes())!=origin['manifest_sha256']:fail('project_revision_conflict','作業コピーの条件が変更されています。作業コピーを準備し直してください')
    scene,arranged=context(data,s['project_id'],assets)
    if scene['revision']!=s['scene_revision'] or arranged['revision']!=s['arrangement_revision'] or camera._project(data,s['project_id'])!=s['fps']:
        fail('project_revision_conflict','作品の配置・シーン・FPSが変わりました。Blender作業コピーを準備し直してください')
    from ..render.media_render import _source
    lookup={a['id']:a for a in assets}
    for item in s['assets']:
        entry=lookup.get(item['asset_id']);path=_source(entry,Path(data)/'library_assets',Path(data)/'studio_v05_asset_sources',Path(data)/'asset_inbox',Path(data)/'integrated_v02/assets') if entry else None
        if not path or not path.is_file() or digest(path.read_bytes())!=item['sha256']:fail('scene_asset_unavailable','元GLBが変更または不足しています。作業コピーを準備し直してください')
    return s


def prepare(data,project_id,addon_id,start_frame,end_frame,assets,blender):
    meta=addon(data,addon_id)
    if not meta['supported']:fail('addon_unsupported',meta['reason'])
    fps=camera._project(data,project_id)
    if any(type(f) is not int for f in (start_frame,end_frame)) or not 0<=start_frame<=end_frame<86400*fps or not .1<=(end_frame-start_frame+1)/fps<=120:fail('range_invalid','0.1〜120秒の開始F・終了Fを指定してください（終了Fを含む）')
    scene,arranged=context(data,project_id,assets)
    if any(row.get('status')!='ready' for row in scene.get('timeline_models',[])):fail('scene_asset_unavailable','配置したモデルに不足または未対応があります。素材を省略せず、準備を止めました')
    if not scene['instances']:fail('scene_asset_unavailable','撮影する静的GLBを同じ作品へ配置してください')
    if scene.get('face_keys') or any(c['track'] in ('motion','expression','lip') for c in arranged['clips']):fail('scene_asset_unsupported','動き・表情・口の橋渡しは未対応です。素材を省略せず、作業コピーの準備を止めました')
    if len(scene['instances'])>32:fail('scene_asset_unsupported','初期橋渡しは32個以内の静的GLBです')
    from ..render.media_render import _source
    inputs=[];total=0
    for row in scene['instances']:
        entry=row.get('asset')
        if not entry or entry.get('format')!='GLB' or row.get('parent_id') or row.get('motion_asset') or row.get('motion_binding'):
            fail('scene_asset_unsupported',f"{row.get('name') or row['asset_id']}: 初期橋渡しは親子配置・動作のない静的GLBです。PMX/VRM/FBXは未対応です")
        path=_source(entry,Path(data)/'library_assets',Path(data)/'studio_v05_asset_sources',Path(data)/'asset_inbox',Path(data)/'integrated_v02/assets')
        if not path or not path.is_file() or path.stat().st_size>100*1024*1024:fail('scene_asset_unavailable','100MiB以内の元GLBが必要です')
        raw=path.read_bytes();total+=len(raw)
        if total>200*1024*1024:fail('scene_asset_unsupported','GLB合計は200MiB以内にしてください')
        glb_check(raw);inputs.append((row,path,raw))
    exe=executable(blender);sid=str(uuid.uuid4());folder=session_root(data)/sid;folder.mkdir(parents=True)
    manifest={'schema_version':1,'id':sid,'project_id':project_id,'addon_id':addon_id,'scene_revision':scene['revision'],'arrangement_revision':arranged['revision'],'fps':fps,'start_frame':start_frame,'end_frame':end_frame,'resolution':[1280,720],'camera':scene.get('camera'),'assets':[],'normalization':'Studio height2/foot/centerXZ; legacy=1; Blender=Z-up,meters; mapping scale1 offset0'}
    for i,(row,path,raw) in enumerate(inputs):
        filename=f'asset-{i}.glb';(folder/filename).write_bytes(raw)
        manifest['assets'].append({'asset_id':row['asset_id'],'instance_id':row['id'],'file':filename,'sha256':digest(raw),'transform':row['transform'],'visible':row.get('visible',True),'units':row.get('units'),'windows':row.get('timeline_windows',[])})
    _atomic(folder/'manifest.json',manifest)
    run(exe,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',str(script('cinemaoperator_scene.py')),'--','--session',str(folder)],env=profile_env(folder))
    if not (folder/'work.blend').is_file():fail('execution_failed','Blender作業コピーがありません。再準備してください')
    result=json.loads((folder/'scene-result.json').read_text(encoding='utf-8'))
    state={**{k:manifest[k] for k in ('id','project_id','addon_id','scene_revision','arrangement_revision','fps','start_frame','end_frame','assets')},'manifest_sha256':digest((folder/'manifest.json').read_bytes()),'subject_sha256':result['subject_sha256'],'created_at':time.time(),'status':'prepared','candidate_id':None}
    _atomic(folder/'session.json',state)
    return state


def open_session(data,sid,assets,blender,*,local_action=False):
    if not local_action:return {'requires_local_action':True,'message':'Studioの「Blenderで編集」から対象版と作品を確認して起動してください'}
    with LOCK:
        s=session(data,sid);meta=addon(data,s['addon_id'])
        if not meta['supported']:fail('addon_unsupported','この版の実行は未対応です')
        check_origin(data,{'session_id':sid,'manifest_sha256':s['manifest_sha256']},assets)
        process=PROCESSES.get(sid)
        if process and process.poll() is None or process is None and process_alive(s.get('pid')):fail('session_running','この作業コピーのBlenderは起動中です。開いているBlenderを使ってください')
        folder=session_root(data)/sid;install=folder/'addons';install.mkdir(exist_ok=True)
        raw=(root(data)/s['addon_id']/'addon.zip').read_bytes();z=archive(raw)
        for f in z.infolist():
            if f.is_dir():continue
            path=install/f.filename;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(zip_bytes(z,f))
        env={**profile_env(folder),'BAI_CINEMA_SESSION':str(folder),'BAI_CINEMA_EXPORTER':str(script('export_blender_camera.py'))}
        ready=folder/'ready.json'
        if ready.exists():ready.unlink()
        args=[executable(blender),'--factory-startup','--disable-autoexec',str(folder/'work.blend'),'--python',str(script('cinemaoperator_bootstrap.py'))]
        with (folder/'blender.log').open('ab') as log:
            p=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=env,creationflags=getattr(subprocess,'DETACHED_PROCESS',0))
        PROCESSES[sid]=p;s.update(status='starting',opened_at=time.time(),pid=p.pid);_atomic(folder/'session.json',s)
        deadline=time.monotonic()+20
        while not ready.is_file() and p.poll() is None and time.monotonic()<deadline:time.sleep(.1)
        if not ready.is_file():
            s['status']='start_unconfirmed';_atomic(folder/'session.json',s)
            fail('execution_failed','CinemaOperatorの起動を確認できません。Blender画面と作業コピーを確認して再試行してください')
        s['status']='opened';_atomic(folder/'session.json',s)
        return {'opened':True,'session_id':sid}


def import_bake(data,sid,assets):
    with LOCK:
        s=session(data,sid);origin={'session_id':sid,'manifest_sha256':s['manifest_sha256']};check_origin(data,origin,assets)
        folder=session_root(data)/sid
        try:
            receipt=json.loads((folder/'receipt.json').read_text(encoding='utf-8'))
            export_id=receipt['export_id']
            if not camera._id(export_id) or receipt['manifest_sha256']!=s['manifest_sha256']:raise ValueError()
            blend=folder/f'baked-{export_id}.blend';track_path=folder/f'camera-{export_id}.json'
            if blend.stat().st_size>100*1024*1024 or track_path.stat().st_size>camera.MAX_JSON:raise ValueError()
            blend_raw=blend.read_bytes();track_raw=track_path.read_bytes()
            if digest(blend_raw)!=receipt['blend_sha256'] or digest(track_raw)!=receipt['track_sha256'] or receipt['subject_sha256']!=s['subject_sha256']:raise ValueError()
            track=json.loads(track_raw);summary=camera.validate(track)
            if track['source_start_frame']!=s['start_frame']+1 or track['source_end_frame']!=s['end_frame']+1 or abs(summary['source_rate']-s['fps'])>1e-5 or track['sample_fps']!=s['fps']:raise ValueError()
        except (OSError,ValueError,KeyError) as e:raise AddonError('bake_missing','BlenderのStudioタブで「現在のBakeを候補へ送る」を押してください。未Bake・変更された結果は取り込みません') from e
        if s.get('export_id')==export_id and s.get('candidate_id'):return {**camera.get(data,s['candidate_id'],s['project_id']),'start_frame':s['start_frame'],'mapping':{'scale':1,'offset':[0,0,0]}}
        candidate=camera.import_track(data,s['project_id'],'CinemaOperator Bake',track,source_sha256=receipt['blend_sha256'],provenance={**origin,'addon_id':s['addon_id'],'export_id':export_id,'exported_at':receipt['exported_at'],'session_created_at':s['created_at'],'start_frame':s['start_frame'],'end_frame':s['end_frame'],'baked_blend_sha256':receipt['blend_sha256']})
        s.update(candidate_id=candidate['id'],export_id=export_id,status='candidate',exported_at=receipt['exported_at']);_atomic(folder/'session.json',s)
        return {**candidate,'start_frame':s['start_frame'],'mapping':{'scale':1,'offset':[0,0,0]}}
