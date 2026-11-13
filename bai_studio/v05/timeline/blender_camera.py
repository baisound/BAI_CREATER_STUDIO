"""Immutable Blender camera candidates and atomic, revisioned timeline adoption."""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from bai_studio.projects.catalog import _atomic, load as load_catalog
from bai_studio.v05.timeline import arrangement

FORMAT='bai-blender-camera-v1'
MAX_JSON=32*1024*1024
MAX_BLEND=100*1024*1024


class CameraImportError(ValueError):
    pass


def _id(value):
    try:return str(uuid.UUID(value))==value
    except (ValueError,TypeError,AttributeError):return False


def _number(value,low=-1000000,high=1000000):
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:
        raise CameraImportError('有限の数値と対応範囲を確認してください')
    return value


def _project(data,project_id):
    if not _id(project_id):raise CameraImportError('作品を選択してください')
    p=next((p for p in load_catalog(Path(data)/'studio_v05_catalog.json')['projects'] if p['id']==project_id),None)
    if not p:raise CameraImportError('作品がありません')
    return _number(p.get('fps',60),1,240)


def validate(track):
    if not isinstance(track,dict) or track.get('format')!=FORMAT:
        raise CameraImportError('Blenderカメラ用の評価済みJSONを選択してください')
    fps=_number(track.get('source_fps'),1,240);base=_number(track.get('source_fps_base'),.01,100)
    rate=fps/base;sample=_number(track.get('sample_fps'),1,240)
    first,last=track.get('source_start_frame'),track.get('source_end_frame')
    if type(first) is not int or type(last) is not int or not -1000000<=first<=last<=1000000:
        raise CameraImportError('元フレーム範囲が不正です')
    duration=(last+1-first)/rate
    if not 1<=rate<=240 or not 0<duration<=120:raise CameraImportError('120秒以内の元区間が必要です')
    for field,low,high in [('resolution',16,16384),('pixel_aspect',.01,100)]:
        if not isinstance(track.get(field),list) or len(track[field])!=2:raise CameraImportError('撮影比率がありません')
        for n in track[field]:_number(n,low,high)
    _number(track.get('unit_scale'),.000001,10000)
    rows=track.get('samples')
    if not isinstance(rows,list) or not 2<=len(rows)<=30000:raise CameraImportError('カメラ標本数が対応範囲外です')
    prior=-1;warnings=set()
    for row in rows:
        if not isinstance(row,dict):raise CameraImportError('カメラ標本が不正です')
        t=_number(row.get('time'),0,duration+1e-6)
        if t<=prior or prior>=0 and t-prior>1/sample+1e-6:raise CameraImportError('カメラ標本の時刻または間隔が不正です')
        prior=t
        if not isinstance(row.get('camera'),str) or not 1<=len(row['camera'])<=200 or row.get('type') not in ('PERSP','ORTHO'):
            raise CameraImportError('透視または平行投影のカメラが必要です')
        for field in ('world','projection'):
            a=row.get(field)
            if not isinstance(a,list) or len(a)!=16:raise CameraImportError('4×4カメラ行列が必要です')
            for n in a:_number(n)
        m=row['world'];p=row['projection']
        if any(abs(m[i])>1e-5 for i in (3,7,11)) or abs(m[15]-1)>1e-5:raise CameraImportError('カメラのワールド行列が不正です')
        cols=[m[i:i+3] for i in (0,4,8)]
        dot=lambda a,b:sum(x*y for x,y in zip(a,b))
        cross=[cols[0][1]*cols[1][2]-cols[0][2]*cols[1][1],cols[0][2]*cols[1][0]-cols[0][0]*cols[1][2],cols[0][0]*cols[1][1]-cols[0][1]*cols[1][0]]
        if any(abs(dot(c,c)-1)>.001 for c in cols) or any(abs(dot(cols[i],cols[j]))>.001 for i,j in ((0,1),(0,2),(1,2))) or dot(cross,cols[2])<.999:
            raise CameraImportError('反転またはせん断のあるカメラは未対応です。Blenderで剛体カメラへBakeしてください')
        if p[0]<=0 or p[5]<=0 or (row['type']=='PERSP' and (abs(p[11]+1)>1e-5 or abs(p[15])>1e-5)) or (row['type']=='ORTHO' and (abs(p[11])>1e-5 or abs(p[15]-1)>1e-5)):
            raise CameraImportError('カメラの投影行列が不正です')
        allowed={0,5,8,9,10,11,14} if row['type']=='PERSP' else {0,5,10,12,13,14,15}
        if any(abs(p[i])>1e-6 for i in range(16) if i not in allowed) or p[10]>=0 or p[14]>=0:
            raise CameraImportError('対応するカメラ投影ではありません')
        lens=row.get('lens')
        if not isinstance(lens,dict) or lens.get('sensor_fit') not in ('AUTO','HORIZONTAL','VERTICAL'):
            raise CameraImportError('レンズ/センサー情報がありません')
        for field in ('lens_mm','sensor_width','sensor_height','ortho_scale','clip_start','clip_end'):_number(lens.get(field),.000001,1000000)
        if lens['clip_start']>=lens['clip_end']:raise CameraImportError('クリップ面が不正です')
        for field in ('shift_x','shift_y'):_number(lens.get(field),-10,10)
        dof=lens.get('dof')
        if not isinstance(dof,dict) or type(dof.get('enabled')) is not bool:raise CameraImportError('DOF情報が不正です')
        _number(dof.get('focus_distance'),0,1000000);_number(dof.get('fstop'),.01,10000)
        if dof['enabled']:warnings.add('被写界深度（DOF）は未適用')
    if abs(rows[0]['time'])>1e-8 or abs(rows[-1]['time']-duration)>1e-6:
        raise CameraImportError('元区間の先頭/終端標本がありません')
    cuts=track.get('cuts')
    if not isinstance(cuts,list) or len(cuts)>1000:raise CameraImportError('カット情報が不正です')
    for cut in cuts:
        if not isinstance(cut,dict) or type(cut.get('source_frame')) is not int or not first<=cut['source_frame']<=last:
            raise CameraImportError('元カットFが不正です')
        t=(cut['source_frame']-first)/rate
        if abs(_number(cut.get('time'),0,duration)-t)>1e-6 or not any(abs(r['time']-t)<1e-8 and r['camera']==cut.get('camera') for r in rows):
            raise CameraImportError('カット境界の評価済み標本がありません')
    return {'duration':duration,'warnings':sorted(warnings),'source_rate':rate,'sample_fps':sample,
        'camera_count':len({r['camera'] for r in rows}),'sample_count':len(rows),
        'aspect':track['resolution'][0]*track['pixel_aspect'][0]/(track['resolution'][1]*track['pixel_aspect'][1])}


def _root(data):return Path(data)/'studio_v05_blender_camera'


def get(data,candidate_id,project_id=None):
    if not _id(candidate_id):raise CameraImportError('候補IDが不正です')
    root=_root(data)
    try:
        meta=json.loads((root/(candidate_id+'.meta.json')).read_text(encoding='utf-8'))
        path=root/(candidate_id+'.camera.json')
        if path.stat().st_size>MAX_JSON:raise CameraImportError('候補が大きすぎます')
        raw=path.read_bytes()
        if meta['id']!=candidate_id or (project_id is not None and meta['project_id']!=project_id) or hashlib.sha256(raw).hexdigest()!=meta['sha256']:
            raise CameraImportError('候補が変更されています。取込み直してください')
        track=json.loads(raw);summary=validate(track)
        return {**meta,**summary,'track':track}
    except (OSError,ValueError,KeyError) as exc:
        if isinstance(exc,CameraImportError):raise
        raise CameraImportError('候補を読めません。元ファイルを取込み直してください') from exc


def listing(data,project_id=None):
    rows=[]
    for path in sorted(_root(data).glob('*.meta.json')):
        if len(rows)>=1000:break
        try:
            row=json.loads(path.read_text(encoding='utf-8'))
            if _id(row.get('id')) and (project_id is None or row.get('project_id')==project_id):
                rows.append({k:v for k,v in row.items() if k!='track'})
        except (OSError,ValueError):continue
    return sorted(rows,key=lambda r:r.get('created_at',0),reverse=True)


def inventory(data):
    return [{'id':'blender-camera:'+row['id'],'name':row['name'],'source':'blender_camera','format':'BAICAMERA',
        'kind':'camera','available':(_root(data)/(row['id']+'.camera.json')).is_file(),'sha256':row['sha256']}
        for row in listing(data)]


def file_for(data,asset_id):
    if not isinstance(asset_id,str) or not asset_id.startswith('blender-camera:'):return None
    suffix=asset_id[len('blender-camera:'):]
    return _root(data)/(suffix+'.camera.json') if _id(suffix) else None


def import_track(data,project_id,name,track,*,source_sha256=None,provenance=None):
    fps=_project(data,project_id);summary=validate(track)
    if abs(summary['sample_fps']-fps)>1e-8:raise CameraImportError('作品FPSで書き出したJSONが必要です。再取込みしてください')
    if not isinstance(name,str) or not name.strip() or len(name)>240:raise CameraImportError('ファイル名が不正です')
    safe=name.replace('\\','/').split('/')[-1]
    raw=json.dumps(track,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
    if len(raw)>MAX_JSON:raise CameraImportError('カメラJSONは32MiB以内にしてください')
    cid=str(uuid.uuid4());root=_root(data);root.mkdir(parents=True,exist_ok=True)
    meta={'id':cid,'project_id':project_id,'name':safe,'sha256':hashlib.sha256(raw).hexdigest(),
        'source_sha256':source_sha256 or hashlib.sha256(raw).hexdigest(),'created_at':time.time(),**summary,
        'source_start_frame':track['source_start_frame'],'source_end_frame':track['source_end_frame'],
        'source_fps':track['source_fps'],'source_fps_base':track['source_fps_base'],'unit_scale':track['unit_scale']}
    if provenance is not None:meta['provenance']=provenance
    path=root/(cid+'.camera.json')
    with path.open('xb') as f:f.write(raw)
    _atomic(root/(cid+'.meta.json'),meta)
    return meta


def import_file(data,project_id,name,raw,blender):
    fps=_project(data,project_id)
    if not isinstance(name,str) or len(name)>240:raise CameraImportError('ファイル名が不正です')
    suffix=Path(name).suffix.lower()
    if suffix=='.json':
        if not 0<len(raw)<=MAX_JSON:raise CameraImportError('JSONは32MiB以内にしてください')
        try:track=json.loads(raw)
        except ValueError as exc:raise CameraImportError('JSONを読めません') from exc
    elif suffix=='.blend':
        # Blender 5.x normally saves Zstandard-compressed .blend; older files
        # can be plain or gzip. Delegate parsing to Blender with autoexec off.
        if not 0<len(raw)<=MAX_BLEND or not raw.startswith((b'BLENDER',b'\x28\xb5\x2f\xfd',b'\x1f\x8b')):
            raise CameraImportError('100MiB以内のBlenderファイルを選択してください')
        executable=shutil.which(blender or 'blender')
        if not executable:raise CameraImportError('Blenderが見つかりません。MIXAMO_BLENDERを設定するか評価済みJSONを選択してください')
        root=_root(data);root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='extract-',dir=root) as folder:
            source=Path(folder)/'source.blend';output=Path(folder)/'camera.json';source.write_bytes(raw)
            script=Path(__file__).resolve().parents[3]/'tools'/'export_blender_camera.py'
            try:
                run=subprocess.run([executable,'--background','--factory-startup','--disable-autoexec',str(source),
                    '--python-exit-code','1','--python',str(script),'--','--output',str(output),'--sample-fps',str(fps)],
                    stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90,
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),check=False)
            except (OSError,subprocess.TimeoutExpired) as exc:raise CameraImportError('Blender評価が完了しませんでした。区間を短くして再取込みしてください') from exc
            if run.returncode or not output.is_file():
                raise CameraImportError('Blenderでカメラを評価できません。透視/平行カメラ・120秒以内の範囲・ドライバーを確認してください')
            if output.stat().st_size>MAX_JSON:raise CameraImportError('評価結果が大きすぎます。区間を短くしてください')
            track=json.loads(output.read_text(encoding='utf-8'))
    else:raise CameraImportError('.blendまたは評価済みカメラJSONを選択してください')
    return import_track(data,project_id,name,track,source_sha256=hashlib.sha256(raw).hexdigest())


def mapping(value):
    if not isinstance(value,dict) or set(value)!={'scale','offset'} or not isinstance(value['offset'],list) or len(value['offset'])!=3:
        raise CameraImportError('単位倍率とXYZオフセットが必要です')
    return {'scale':_number(value['scale'],.000001,10000),'offset':[_number(v) for v in value['offset']]}


def prepare(data,project_id,candidate_id,start_frame,transform,assets):
    fps=_project(data,project_id);candidate=get(data,candidate_id,project_id);transform=mapping(transform)
    if candidate.get('provenance'):
        from .blender_addons import check_origin,AddonError
        try:check_origin(data,candidate['provenance'],assets)
        except AddonError as error:raise CameraImportError('制作条件が変更されています。'+str(error)) from error
    if candidate['sample_fps']!=fps:raise CameraImportError('作品FPSが変わりました。カメラを再取込みしてください')
    if type(start_frame) is not int or not 0<=start_frame<=86400*fps:raise CameraImportError('配置開始Fを0以上の整数で指定してください')
    if start_frame/fps+candidate['duration']>86400:raise CameraImportError('作品の時間上限を超えます')
    from bai_studio.v05.timeline.scene_instances import read as read_scene
    scene=read_scene(Path(data)/'studio_v05_scene_instances',Path(data)/'studio_v05_scene_models',Path(data)/'studio_v05_catalog.json',project_id,assets)
    clips=arrangement.read(Path(data)/'studio_v05_arrangements',Path(data)/'studio_v05_catalog.json',project_id)
    expected={'candidate_id':candidate_id,'candidate_sha256':candidate['sha256'],'start_frame':start_frame,
        'mapping':transform,'fps':fps,'scene_revision':scene['revision'],'arrangement_revision':clips['revision']}
    return {'candidate':candidate,'expected':expected,'camera_row':{'format':FORMAT,'camera_track':candidate['track'],
        'mapping':transform,'start':start_frame/fps,'duration':candidate['duration'],'source_start':0}}


def adopt(data,project_id,candidate_id,start_frame,transform,expected,allow_unsupported,assets):
    from bai_studio.v05.timeline.scene_instances import _LOCK as scene_lock
    from bai_studio.v05.timeline.track_layout import LOCK as layout_lock,get as get_layout
    # scene writes already use scene -> arrangement; never acquire scene after arrangement.
    with scene_lock,arrangement.LOCK,layout_lock:
        prepared=prepare(data,project_id,candidate_id,start_frame,transform,assets)
        if not isinstance(expected,dict) or expected!=prepared['expected'] or any(
                isinstance(expected.get(k),bool) for k in ('start_frame','fps','scene_revision','arrangement_revision')):
            raise CameraImportError('比較条件が変更されています。新しい条件で比較してください')
        candidate=prepared['candidate'];fps=expected['fps'];root=Path(data)/'studio_v05_arrangements';catalog=Path(data)/'studio_v05_catalog.json'
        if type(allow_unsupported) is not bool or candidate['warnings'] and not allow_unsupported:
            raise CameraImportError('未適用項目を確認して了承してください')
        layout=get_layout(Path(data)/'studio_v05_track_layouts',catalog,project_id)
        if 'camera' in layout.get('locked',[]):raise CameraImportError('カメラ行はロックされています')
        current=arrangement.read(root,catalog,project_id);start=start_frame/fps;end=start+candidate['duration']
        if any(c.get('track')=='camera' and max(start,c['start'])<min(end,c['start']+c['duration'])-1e-7 for c in current['clips']):
            raise CameraImportError('カメラの配置が重なります。開始Fを変更するか既存クリップを移動してください')
        if len(current['clips'])>=2000:raise CameraImportError('配置数の上限です')
        before=json.loads(json.dumps(current['clips']))
        clip={'id':str(uuid.uuid4()),'asset_id':'blender-camera:'+candidate_id,'name':candidate['name'],
            'category':'camera','track':'camera','lane':1,'start':round(start,4),'duration':round(candidate['duration'],4),
            'blender_mapping':prepared['expected']['mapping'],'source_start':0,'source_duration':candidate['duration']}
        current['clips'].append(clip);arrangement._record_edit(current,before,'place')
        _atomic(root/(project_id+'.json'),current)
        return {'clip':clip,'revision':current['revision'],'candidate_id':candidate_id}
