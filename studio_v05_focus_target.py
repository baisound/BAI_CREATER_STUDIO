"""Project-scoped focus selection; does not imply an already loaded model."""
import json, re, threading, os, tempfile
from pathlib import Path
from studio_v05_arrangement import _project
LOCK=threading.RLock()
class FocusTargetError(ValueError): pass
ID=re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
def read(root,catalog,project_id):
    _project(catalog,project_id)
    path=Path(root)/(project_id+'.json')
    if not path.exists(): return {'project_id':project_id,'revision':0,'model_id':None,'bone_name':None,'enabled':False}
    try:
        v=json.loads(path.read_text(encoding='utf-8'))
        if v.get('project_id')!=project_id or type(v.get('revision')) is not int or v['revision']<0 or type(v.get('enabled')) is not bool: raise ValueError()
        if v.get('model_id') is not None and (not isinstance(v['model_id'],str) or not ID.fullmatch(v['model_id'])):raise ValueError()
        if v.get('bone_name') is not None and (not isinstance(v['bone_name'],str) or len(v['bone_name'])>128): raise ValueError()
        return v
    except (ValueError,KeyError,TypeError) as e:raise FocusTargetError('Invalid saved focus target; original preserved') from e
def save(root,catalog,project_id,revision,model_id=None,bone_name=None,enabled=False):
    if type(revision) is not int or revision<0: raise FocusTargetError('Invalid revision')
    if type(enabled) is not bool: raise FocusTargetError('Invalid enabled')
    if model_id is not None and (not isinstance(model_id,str) or not ID.fullmatch(model_id)):raise FocusTargetError('Invalid model ID')
    if bone_name is not None and (not isinstance(bone_name,str) or len(bone_name)>128 or any(ord(c)<32 for c in bone_name)):raise FocusTargetError('Invalid bone name')
    if enabled and model_id is None:raise FocusTargetError('Enabled focus requires model ID')
    if model_id is None and bone_name is not None:raise FocusTargetError('Bone requires model')
    with LOCK:
        old=read(root,catalog,project_id)
        if old['revision']!=revision:raise FocusTargetError('Revision conflict')
        new={'project_id':project_id,'revision':revision+1,'model_id':model_id,'bone_name':bone_name,'enabled':enabled}
        root=Path(root);root.mkdir(parents=True,exist_ok=True)
        fd,tmp=tempfile.mkstemp(prefix='.focus-',dir=root,suffix='.tmp')
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                json.dump(new,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
            os.replace(tmp,root/(project_id+'.json'))
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
        return new
