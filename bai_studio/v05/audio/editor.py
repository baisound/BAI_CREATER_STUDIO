"""Owned native editor sessions. Immutable states and optimistic slot recovery."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid

from bai_studio.projects.catalog import _atomic
from bai_studio.v05.audio import mixer

LOCK=threading.RLock()
CHILDREN={}


def fingerprint(insert):
    return hashlib.sha256(json.dumps(insert,sort_keys=True).encode()).hexdigest()


def state_file(root,state_id):
    if not isinstance(state_id,str) or not mixer.HEX.fullmatch(state_id):raise mixer.MixerError('VST状態IDが不正です',400)
    path=Path(root)/'studio_v05_audio/states'/(state_id+'.bin')
    if not path.is_file() or path.stat().st_size>32*1024*1024 or mixer.sha(path)!=state_id:
        raise mixer.MixerError('保存したVST状態を読み込めません。元の設定は保持しています',422)
    return path


def slot(settings,key,index):
    if not isinstance(key,str) or key not in {*mixer.BUSES,*settings.get('tracks',{})} or type(index) is not int or index<0:
        raise mixer.MixerError('VSTのインサート位置が不正です',400)
    channel=settings['tracks'][key] if key in settings.get('tracks',{}) else settings['channels'][key]
    if index>=len(channel['inserts']):raise mixer.MixerError('VSTが取り外されています',409)
    return channel['inserts'][index]


def folder(root,sid):
    if not isinstance(sid,str) or len(sid)!=32 or any(c not in '0123456789abcdef' for c in sid):raise mixer.MixerError('VST画面IDが不正です',400)
    return Path(root)/'studio_v05_audio/editors'/sid


def load(root,sid):
    try:return json.loads((folder(root,sid)/'session.json').read_text(encoding='utf-8'))
    except (OSError,ValueError) as exc:raise mixer.MixerError('VST画面の記録が見つかりません',404) from exc


def public(record):
    return {k:record[k] for k in ('id','project_id','key','index','plugin_id','name','status','error','saved_revision','draft','initial_insert','parameters','state_id') if k in record}


def open_editor(root,pid,key,index,revision,draft_insert=None):
    if sys.platform!='win32':raise mixer.MixerError('固有VST画面は現在Windowsで利用できます',503)
    with LOCK,mixer.LOCK:
        settings=mixer.read(root,pid)
        if type(revision) is not int or settings['revision']!=revision:raise mixer.MixerError('作品設定が変わりました。読み直してください',409)
        if draft_insert is None:insert=copy.deepcopy(slot(settings,key,index))
        else:
            valid_keys={*mixer.BUSES,*[row['key'] for row in mixer.timeline_tracks(root,pid)['rows']]}
            if key not in valid_keys or type(index) is not int or not 0<=index<8:raise mixer.MixerError('VSTのインサート位置が不正です',400)
            check=mixer.defaults(pid)['channels'];check['music']['inserts']=[draft_insert]
            insert=mixer.validate(check)['music']['inserts'][0]
        for sid,(process,previous) in list(CHILDREN.items()):
            if process.poll() is None and (previous['project_id'],previous['key'],previous['index'])==(pid,key,index):return public(previous)
        if sum(process.poll() is None for process,_ in CHILDREN.values())>=4:raise mixer.MixerError('開いているVST画面を閉じてから追加してください',409)
        plugin=next((p for p in mixer.plugins() if p['id']==insert['plugin_id']),None)
        if not plugin:raise mixer.MixerError('検出済みVST3が見つかりません',404)
        sid=uuid.uuid4().hex;path=folder(root,sid);path.mkdir(parents=True)
        record={'id':sid,'project_id':pid,'key':key,'index':index,'revision':revision,'plugin_id':plugin['id'],'name':plugin['name'],'fingerprint':fingerprint(insert),'initial_insert':insert,'draft':draft_insert is not None,'status':'opening','created':time.time()}
        body={'action':'editor','plugin':plugin,'insert':insert,'control':str(path/'close.json'),'ready':str(path/'ready.json'),'state_output':str(path/'state.bin'),'parent_pid':os.getpid()}
        if insert.get('state_id'):body['state_file']=str(state_file(root,insert['state_id']))
        _atomic(path/'session.json',record);_atomic(path/'request.json',body)
        command=[sys.executable,'-X','utf8','-m','bai_studio.v05.audio.worker',str(path/'request.json'),str(path/'response.json')]
        process=subprocess.Popen(command,cwd=str(Path(__file__).resolve().parents[3]),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        CHILDREN[sid]=(process,record)
        def finish():
            process.wait()
            try:status(root,sid)
            except (ValueError,OSError,mixer.MixerError):pass
        threading.Thread(target=finish,daemon=True).start()
        return public(record)


def capture_result(root,sid,record):
    path=folder(root,sid);response=json.loads((path/'response.json').read_text(encoding='utf-8'))
    raw=path/'state.bin'
    if not raw.is_file() or raw.stat().st_size>32*1024*1024:raise mixer.MixerError('VSTの状態を回収できません',422)
    state_id=mixer.sha(raw);destination=Path(root)/'studio_v05_audio/states'/(state_id+'.bin');destination.parent.mkdir(parents=True,exist_ok=True)
    if not destination.exists() or mixer.sha(destination)!=state_id:
        temporary=destination.with_suffix('.'+uuid.uuid4().hex+'.tmp');temporary.write_bytes(raw.read_bytes());os.replace(temporary,destination)
    check=mixer.defaults(record['project_id'])['channels']
    check['music']['inserts']=[{'plugin_id':record['plugin_id'],'parameters':response['parameters'],'bypass':False,'state_id':state_id}]
    mixer.validate(check)
    record.update(parameters=response['parameters'],state_id=state_id)
    return response['parameters'],state_id


def apply_result(root,sid,record,key,index,revision):
    path=folder(root,sid)
    parameters,state_id=capture_result(root,sid,record)
    with mixer.LOCK:
        settings=mixer.read(root,record['project_id']);target=slot(settings,key,index)
        if target['plugin_id']!=record['plugin_id']:raise mixer.MixerError('別のVSTへは反映できません',409)
        if settings['revision']!=revision:raise mixer.MixerError('作品設定が変わったためVSTの変更を回収して保持しています',409)
        target.update(parameters=parameters,state_id=state_id)
        saved=mixer.save(root,record['project_id'],revision,settings['channels'],True,settings.get('tracks',{}))
    record.update(status='applied',key=key,index=index,saved_revision=saved['revision']);record.pop('error',None)
    _atomic(path/'session.json',record)
    return public(record)


def status(root,sid):
    with LOCK:
        record=load(root,sid);path=folder(root,sid)
        if record['status'] in ('applied','discarded','error','conflict','draft_ready'):return public(record)
        response=path/'response.json'
        if response.exists():
            result=json.loads(response.read_text(encoding='utf-8'))
            control=json.loads((path/'close.json').read_text(encoding='utf-8')) if (path/'close.json').exists() else {}
            if result.get('error'):record.update(status='error',error=result['error'])
            elif control.get('mode')=='discard':record.update(status='discarded')
            else:
                try:
                    capture_result(root,sid,record)
                    if record.get('draft'):
                        record['status']='draft_ready';_atomic(path/'session.json',record);return public(record)
                    settings=mixer.read(root,record['project_id']);target=slot(settings,record['key'],record['index'])
                    if fingerprint(target)!=record['fingerprint']:raise mixer.MixerError('インサートが変更されたため回収した設定を保持しています',409)
                    return apply_result(root,sid,record,record['key'],record['index'],record['revision'])
                except mixer.MixerError as exc:record.update(status='conflict',error=str(exc))
        elif sid in CHILDREN and CHILDREN[sid][0].poll() is not None:record.update(status='error',error='VST画面が異常終了しました。保存済み設定は保持しています')
        elif (path/'ready.json').exists():record['status']='editing'
        _atomic(path/'session.json',record)
        return public(record)


def close_editor(root,sid,mode):
    if mode not in ('apply','discard'):raise mixer.MixerError('閉じ方が不正です',400)
    with LOCK:
        record=load(root,sid)
        if mode=='discard' and record['status'] in ('conflict','draft_ready'):
            record['status']='discarded';_atomic(folder(root,sid)/'session.json',record);return public(record)
        if record['status'] not in ('applied','discarded','error','conflict'):_atomic(folder(root,sid)/'close.json',{'mode':mode})
        return status(root,sid)


def recover(root,sid,key,index,revision):
    with LOCK:
        record=load(root,sid)
        if record['status']!='conflict':raise mixer.MixerError('回収待ちのVST設定がありません',409)
        return apply_result(root,sid,record,key,index,revision)


def list_editors(root,pid):
    mixer.project(root,pid)
    records=[]
    with LOCK:
        base=Path(root)/'studio_v05_audio/editors'
        for path in base.glob('*/session.json'):
            try:
                record=load(root,path.parent.name)
                if record['project_id']!=pid:continue
                current=status(root,record['id'])
                if current['status']=='draft_ready':
                    settings=mixer.read(root,pid)
                    try:target=slot(settings,current['key'],current['index'])
                    except mixer.MixerError:target=None
                    if target and target.get('state_id')==current.get('state_id') and target['parameters']==current.get('parameters'):
                        record.update(status='applied',saved_revision=settings['revision']);_atomic(path,record);continue
                if current['status'] not in ('applied','discarded'):records.append(current)
            except (OSError,ValueError,KeyError):continue
    return {'project_id':pid,'settings_revision':mixer.read(root,pid)['revision'],'sessions':records[-32:]}
