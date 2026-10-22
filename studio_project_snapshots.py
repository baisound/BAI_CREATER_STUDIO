"""Per-project non-destructive snapshots; never activates or overwrites legacy live project."""
import json, os, uuid, threading
from pathlib import Path
from datetime import datetime, timezone
from studio_project_catalog import load as load_catalog, CatalogError
from project_state_bundle import validate_bundle
LOCK=threading.RLock()
MAX_BYTES=4*1024*1024

def _project(catalog,id):
    if not isinstance(id,str) or len(id)!=36:return None
    return next((p for p in load_catalog(catalog)['projects'] if p['id']==id),None)

def save(directory,catalog,id,bundle):
    with LOCK:
        if not _project(catalog,id):raise CatalogError('Project not found')
        clean=validate_bundle(bundle)
        output=json.dumps({'schema':1,'project_id':id,'saved_at':datetime.now(timezone.utc).isoformat(),'bundle':clean},ensure_ascii=False,indent=2)
        if len(output.encode('utf8'))>MAX_BYTES:raise CatalogError('Snapshot too large')
        directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
        path=directory/(id+'.json');tmp=directory/(id+'.tmp-'+uuid.uuid4().hex)
        try:
            with tmp.open('w',encoding='utf8') as f:f.write(output);f.flush();os.fsync(f.fileno())
            os.replace(tmp,path)
        finally:
            if tmp.exists():tmp.unlink()
        return {'project_id':id,'saved_at':json.loads(output)['saved_at'],'saved':True}

def read(directory,catalog,id):
    with LOCK:
        if not _project(catalog,id):raise CatalogError('Project not found')
        path=Path(directory)/(id+'.json')
        if not path.exists():raise FileNotFoundError('No saved snapshot for this project')
        if path.stat().st_size>MAX_BYTES:raise CatalogError('Snapshot too large')
        obj=json.loads(path.read_text(encoding='utf8'))
        if obj.get('schema')!=1 or obj.get('project_id')!=id:raise CatalogError('Invalid project snapshot')
        return {'project_id':id,'saved_at':obj['saved_at'],'bundle':validate_bundle(obj['bundle']),'active_project_unchanged':True}
