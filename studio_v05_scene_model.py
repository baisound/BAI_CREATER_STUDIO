"""v0.5 single-model scene slot. Preserve the source registry; no arbitrary URLs."""
from __future__ import annotations
import math
import threading
from pathlib import Path
from studio_project_catalog import load as load_catalog, _atomic

LOCK = threading.RLock()
class SceneModelError(ValueError): pass

def _project(catalog, project_id):
    if not isinstance(project_id,str) or not project_id or not any(
        x.get("id")==project_id for x in load_catalog(catalog)["projects"]
    ):
        raise SceneModelError("Unknown project ID")

def supported_model(item):
    if not isinstance(item,dict) or not item.get("available"): return False
    src,fmt,kind=(item.get(k) for k in ("source","format","kind"))
    return bool(
        (src=="integrated" and kind=="model" and fmt in ("VRM","GLB","FBX") and item.get("filename"))
        or (src=="library" and fmt=="GLB" and kind in ("stage","prop"))
        or (src=="mmd" and kind in ("A","B") and fmt=="PMX")
        or (src=="fbx" and kind in ("modelA","modelB") and fmt=="FBX")
    )

def choices(items):
    return {"items":[{**{k:x.get(k) for k in ("id","format","source","kind","filename","available")},
                      "name":x.get("name") or x.get("originalName") or x.get("filename") or x["id"]}
                     for x in items if supported_model(x)]}

def _default(project_id):
    return {"schema":1,"project_id":project_id,"revision":0,"model":None}

def read(root,catalog,project_id,items=None):
    _project(catalog,project_id)
    file=Path(root)/(project_id+".json")
    if not file.exists():data=_default(project_id)
    else:
        try: data=__import__("json").loads(file.read_text(encoding="utf-8"))
        except (OSError,ValueError) as exc:raise SceneModelError("Scene model file is unreadable; original retained") from exc
        if (not isinstance(data,dict) or data.get("schema")!=1 or data.get("project_id")!=project_id
            or type(data.get("revision")) is not int or data["revision"]<0
            or (data.get("model") is not None and not isinstance(data.get("model"),dict))):
            raise SceneModelError("Scene model data invalid; original retained")
    out=dict(data)
    if out["model"] is not None and items is not None:
        item=next((x for x in items if x.get("id")==out["model"].get("asset_id")),None)
        out["model"]=dict(out["model"])
        out["model"]["available"]=supported_model(item)
        out["model"]["asset"]=dict(item) if supported_model(item) else None
    return out

def _vector(obj,n,minimum=None,maximum=None):
    if not isinstance(obj,list) or len(obj)!=3:raise SceneModelError(n+" must be three numbers")
    for v in obj:
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise SceneModelError("Invalid "+n)
        if minimum is not None and v<minimum or maximum is not None and v>maximum:raise SceneModelError("Out of range "+n)
    return [round(float(v),6) for v in obj]

def set_model(root,catalog,project_id,asset_id,transform,revision,items):
    _project(catalog,project_id)
    if type(revision) is not int or revision<0:raise SceneModelError("Revision required")
    if asset_id is not None:
        if not isinstance(asset_id,str) or len(asset_id)>300 or not asset_id:raise SceneModelError("Invalid model asset")
        item=next((i for i in items if i.get("id")==asset_id),None)
        if not supported_model(item):raise SceneModelError("Model asset unavailable or unsupported by preview")
        if not isinstance(transform,dict) or set(transform)!={"position","rotation","scale"}:
            raise SceneModelError("Position, rotation and scale required")
        tr={"position":_vector(transform["position"],"position",-100000,100000),
            "rotation":_vector(transform["rotation"],"rotation",-360000,360000),
            "scale":_vector(transform["scale"],"scale",0.000001,10000)}
        model={"asset_id":asset_id,"transform":tr}
    else:
        if transform is not None:raise SceneModelError("Removal cannot contain transform")
        model=None
    with LOCK:
        old=read(root,catalog,project_id)
        if old["revision"]!=revision:raise SceneModelError("Revision conflict")
        saved={"schema":1,"project_id":project_id,"revision":revision+1,"model":model}
        _atomic(Path(root)/(project_id+".json"),saved)
        return saved
