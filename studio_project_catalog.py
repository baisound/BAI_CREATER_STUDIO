"""v0.5 project catalog metadata. Does not mutate the legacy active project state."""
import json, os, re, threading, uuid
from pathlib import Path
from datetime import datetime, timezone
LOCK=threading.RLock()
class CatalogError(ValueError):pass
def _valid_name(name):
    if not isinstance(name,str) or not (1<=len(name.strip())<=80) or any(x in name for x in "\\/\r\n\0"):
        raise CatalogError('Project name must be 1–80 characters without path separators')
    return name.strip()
def load(path):
    path=Path(path)
    if not path.exists():return {'schema':1,'projects':[]}
    raw=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(raw,dict) or raw.get('schema')!=1 or not isinstance(raw.get('projects'),list):raise CatalogError('Invalid catalog: original file preserved')
    return raw
def list_projects(path):
    with LOCK:return load(path)
def create(path,name,kind='empty'):
    name=_valid_name(name)
    if kind not in ('empty','dance','mv','video'):raise CatalogError('Unsupported project kind')
    with LOCK:
        data=load(path)
        if any(x['name'].casefold()==name.casefold() for x in data['projects']):raise CatalogError('Project name already exists')
        item={'id':str(uuid.uuid4()),'name':name,'kind':kind,'status':'draft','modified':datetime.now(timezone.utc).isoformat()}
        data['projects'].append(item)
        _atomic(path,data)
        return item
def rename(path,project_id,name):
    name=_valid_name(name)
    with LOCK:
        data=load(path)
        item=next((x for x in data['projects'] if x['id']==project_id),None)
        if item is None:raise CatalogError('Project not found')
        if any(x['id']!=project_id and x['name'].casefold()==name.casefold() for x in data['projects']):raise CatalogError('Project name already exists')
        item['name']=name;item['modified']=datetime.now(timezone.utc).isoformat();_atomic(path,data)
        return item
def _atomic(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp-'+uuid.uuid4().hex)
    try:
        with temp.open('w',encoding='utf-8') as out:
            json.dump(data,out,ensure_ascii=False,indent=2);out.flush();os.fsync(out.fileno())
        os.replace(temp,path)
    finally:
        if temp.exists():temp.unlink()
