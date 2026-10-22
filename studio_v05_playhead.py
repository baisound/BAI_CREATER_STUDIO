"""Project-scoped persisted edit playhead. Not an audio/animation transport."""
import json, math, os, tempfile, threading
from pathlib import Path
from studio_v05_arrangement import _project
LOCK=threading.RLock()
class PlayheadError(ValueError): pass

def read(root,catalog,project_id):
    _project(catalog,project_id)
    p=Path(root)/(project_id+'.json')
    if not p.exists():return {'schema':1,'project_id':project_id,'seconds':0.0,'revision':0,'engine_connected':False}
    try:
        data=json.loads(p.read_text(encoding='utf-8'))
        if (data.get('schema')!=1 or data.get('project_id')!=project_id or type(data.get('revision')) is not int or data['revision']<0 or type(data.get('seconds')) not in (int,float) or not math.isfinite(data['seconds']) or not 0<=data['seconds']<=86400):raise PlayheadError('Invalid playhead data; original retained')
        return {**data,'engine_connected':False}
    except (json.JSONDecodeError,KeyError,TypeError) as exc:raise PlayheadError('Invalid playhead data; original retained') from exc

def update(root,catalog,project_id,seconds,revision):
    if type(seconds) not in (int,float) or not math.isfinite(seconds) or not 0<=seconds<=86400:raise PlayheadError('Invalid time')
    if type(revision) is not int or revision<0:raise PlayheadError('Invalid revision')
    with LOCK:
        state=read(root,catalog,project_id)
        if state['revision']!=revision:raise PlayheadError('Revision conflict')
        new={'schema':1,'project_id':project_id,'seconds':round(seconds,4),'revision':revision+1}
        root=Path(root);root.mkdir(parents=True,exist_ok=True)
        fd,tmp=tempfile.mkstemp(prefix='.playhead-',suffix='.tmp',dir=root)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as out:
                json.dump(new,out,ensure_ascii=False);out.flush();os.fsync(out.fileno())
            os.replace(tmp,root/(project_id+'.json'))
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
        return {**new,'engine_connected':False}
