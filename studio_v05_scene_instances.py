"""v57: non-destructive, revisioned scene-instance foundation (independent from legacy slot).

A new scene store is seeded from v55 on first write. A changing legacy revision after
initialization is reported as a conflict rather than silently overwriting either model.
GPU scene graph loading is deliberately handled by the browser shared-scene host.
"""
from __future__ import annotations
import json
import math
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_scene_model import read as read_legacy, supported_model, _vector

_LOCK = threading.RLock()
LEGACY_ID = "legacy-primary"
MAX_INSTANCES = 32
_UNSET = object()

class SceneInstancesError(ValueError):
    pass

def _legacy(legacy_root, catalog, project_id):
    try:
        return read_legacy(legacy_root, catalog, project_id)
    except ValueError as exc:
        raise SceneInstancesError(str(exc)) from exc

def _seed(project_id, legacy):
    items = []
    if legacy["model"]:
        items.append({
            "id": LEGACY_ID,
            "asset_id": legacy["model"]["asset_id"],
            "transform": legacy["model"]["transform"],
            "visible": True,
            "locked": False,
            "parent_id": None,
        })
    return {"schema": 1, "project_id": project_id, "revision": 0,
            "legacy_revision": legacy["revision"], "instances": items, "camera": None,
            "face_keys": []}

def _check_record(data, project_id):
    required = {"schema", "project_id", "revision", "legacy_revision", "instances"}
    if not isinstance(data, dict) or not required <= set(data) or set(data) - required - {"camera", "face_keys"} \
            or data["schema"] != 1 or data["project_id"] != project_id:
        raise SceneInstancesError("Invalid scene-instances file; original retained")
    if any(type(data[k]) is not int or data[k] < 0 for k in ("revision", "legacy_revision")):
        raise SceneInstancesError("Invalid scene revision; original retained")
    items = data["instances"]
    if not isinstance(items, list) or len(items) > MAX_INSTANCES:
        raise SceneInstancesError("Invalid scene instances; original retained")
    ids = set()
    for row in items:
        if not isinstance(row, dict) or set(row) != {
            "id", "asset_id", "transform", "visible", "locked", "parent_id"
        }: raise SceneInstancesError("Invalid scene instance fields; original retained")
        rid, aid = row["id"], row["asset_id"]
        if (not isinstance(rid, str) or not rid or len(rid) > 100 or rid in ids
                or not isinstance(aid, str) or not aid or len(aid) > 300):
            raise SceneInstancesError("Invalid or duplicate scene ID; original retained")
        ids.add(rid)
        if type(row["visible"]) is not bool or type(row["locked"]) is not bool:
            raise SceneInstancesError("Invalid scene flags; original retained")
        if row["parent_id"] is not None:
            raise SceneInstancesError("Parent hierarchies are not supported by v57")
        _transform(row["transform"])
    if "camera" in data and data["camera"] is not None:
        _camera(data["camera"])
    keys = data.get("face_keys", [])
    if not isinstance(keys, list) or len(keys) > 1024:
        raise SceneInstancesError("Invalid face keys; original retained")
    identities = set()
    for key in keys:
        checked = _face_key(key, require_value=True)
        identity = (checked["instance_id"], checked["morph_name"], checked["time"])
        if checked != key or checked["instance_id"] not in ids or identity in identities:
            raise SceneInstancesError("Invalid or duplicate face key; original retained")
        identities.add(identity)
    return data

def _transform(value):
    if not isinstance(value, dict) or set(value) != {"position", "rotation", "scale"}:
        raise SceneInstancesError("XYZ position, rotation and scale required")
    try:
        return {
            "position": _vector(value["position"], "position", -100000, 100000),
            "rotation": _vector(value["rotation"], "rotation", -360000, 360000),
            "scale": _vector(value["scale"], "scale", 0.000001, 10000),
        }
    except (ValueError, TypeError) as exc:
        raise SceneInstancesError(str(exc)) from exc


def _camera(value):
    if not isinstance(value, dict) or set(value) != {"position", "target", "fov"}:
        raise SceneInstancesError("Camera position, target and fov required")
    try:
        position = _vector(value["position"], "camera position", -100000, 100000)
        target = _vector(value["target"], "camera target", -100000, 100000)
    except (ValueError, TypeError) as exc:
        raise SceneInstancesError(str(exc)) from exc
    fov = value["fov"]
    if isinstance(fov, bool) or not isinstance(fov, (int, float)) or not math.isfinite(fov) or not 10 <= fov <= 120:
        raise SceneInstancesError("Camera fov must be 10–120 degrees")
    if math.dist(position, target) < 0.01:
        raise SceneInstancesError("Camera position and target must differ")
    return {"position": position, "target": target, "fov": round(float(fov), 6)}


def _face_key(value, require_value):
    required = {"instance_id", "morph_name", "time"}
    if not isinstance(value, dict) or set(value) != (required | ({"value"} if require_value else set())):
        raise SceneInstancesError("Face key fields are invalid")
    instance_id, name, seconds = value["instance_id"], value["morph_name"], value["time"]
    if not isinstance(instance_id, str) or not 0 < len(instance_id) <= 100:
        raise SceneInstancesError("Face key instance is invalid")
    if not isinstance(name, str) or not 0 < len(name) <= 100 or any(ord(ch) < 32 for ch in name):
        raise SceneInstancesError("Face morph name is invalid")
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) \
            or not 0 <= seconds <= 86400 or round(seconds, 3) != seconds:
        raise SceneInstancesError("Face key time must be 0–86400 seconds at millisecond precision")
    result = {"instance_id": instance_id, "morph_name": name, "time": float(seconds)}
    if require_value:
        weight = value["value"]
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) \
                or not 0 <= weight <= 1:
            raise SceneInstancesError("Face morph value must be 0–1")
        result["value"] = float(weight)
    return result

def read(root, legacy_root, catalog, project_id, assets=None):
    legacy = _legacy(legacy_root, catalog, project_id)
    path = Path(root) / (project_id + ".json")
    if not path.exists():
        data = _seed(project_id, legacy)
    else:
        try:
            data = _check_record(json.loads(path.read_text(encoding="utf-8")), project_id)
        except (ValueError, OSError) as exc:
            raise SceneInstancesError("Scene-instances file unreadable; original retained") from exc
        if data["legacy_revision"] != legacy["revision"]:
            raise SceneInstancesError("Legacy scene changed since multi-instance seed; reconcile before editing")
    result = {**data, "camera": data.get("camera"),
              "face_keys": [dict(row) for row in data.get("face_keys", [])],
              "instances": [dict(row) for row in data["instances"]]}
    if assets is not None:
        lookup = {row.get("id"): row for row in assets if isinstance(row, dict)}
        for row in result["instances"]:
            source = lookup.get(row["asset_id"])
            row["available"] = supported_model(source)
            row["asset"] = dict(source) if row["available"] else None
    result["renderer_ready"] = False  # persisted state is not proof of actual GPU rendering
    return result

def mutate(root, legacy_root, catalog, project_id, action, revision, assets,
           instance_id=None, asset_id=None, transform=None, visible=None, locked=None,
           camera=_UNSET, face_key=_UNSET, morph_lookup=None):
    if type(revision) is not int or revision < 0:
        raise SceneInstancesError("Revision required")
    if action not in ("add", "update", "remove", "camera", "face-set", "face-remove"):
        raise SceneInstancesError("Unknown scene instance action")
    with _LOCK:
        current = read(root, legacy_root, catalog, project_id)
        if current["revision"] != revision:
            raise SceneInstancesError("Revision conflict")
        rows = current["instances"]
        if action in ("face-set", "face-remove"):
            if face_key is _UNSET or camera is not _UNSET or any(x is not None for x in
                (instance_id, asset_id, transform, visible, locked)):
                raise SceneInstancesError("Face action requires only face_key")
            key = _face_key(face_key, require_value=action == "face-set")
            target = next((row for row in rows if row["id"] == key["instance_id"]), None)
            if not target:
                raise SceneInstancesError("Face key scene instance not found")
            if target["locked"]:
                raise SceneInstancesError("Scene instance is locked")
            if action == "face-set":
                source = next((x for x in assets if x.get("id") == target["asset_id"]), None)
                if not isinstance(source, dict) or str(source.get("format", "")).upper() != "PMX":
                    raise SceneInstancesError("Face keys require a registered PMX")
                if morph_lookup is not None:
                    try:
                        valid_names = morph_lookup(source)
                    except (OSError, ValueError) as exc:
                        raise SceneInstancesError("Registered PMX morph inspection failed") from exc
                    if key["morph_name"] not in valid_names:
                        raise SceneInstancesError("Face morph is not present in the registered PMX")
            identity = (key["instance_id"], key["morph_name"], key["time"])
            had_key = any((x["instance_id"], x["morph_name"], x["time"]) == identity
                          for x in current["face_keys"])
            if action == "face-remove" and not had_key:
                raise SceneInstancesError("Face key not found")
            current["face_keys"] = [x for x in current["face_keys"] if
                (x["instance_id"], x["morph_name"], x["time"]) != identity]
            if action == "face-set":
                if len(current["face_keys"]) >= 1024:
                    raise SceneInstancesError("Face key limit is 1024")
                current["face_keys"].append(key)
                current["face_keys"].sort(key=lambda x: (x["instance_id"], x["morph_name"], x["time"]))
        elif action == "camera":
            if face_key is not _UNSET:
                raise SceneInstancesError("Face key is a separate scene action")
            if camera is _UNSET or any(x is not None for x in
                (instance_id, asset_id, transform, visible, locked)):
                raise SceneInstancesError("Camera action requires only camera fields")
            current["camera"] = None if camera is None else _camera(camera)
        elif action == "add":
            if camera is not _UNSET or face_key is not _UNSET:
                raise SceneInstancesError("Camera is a separate scene action")
            if instance_id is not None or len(rows) >= MAX_INSTANCES:
                raise SceneInstancesError("New IDs are generated by the server; scene limit 32")
            source = next((x for x in assets if x.get("id") == asset_id), None)
            if not supported_model(source):
                raise SceneInstancesError("Model asset unavailable or unsupported")
            if visible is not None or locked is not None:
                raise SceneInstancesError("New scene flags are assigned by the server")
            new_id = uuid.uuid4().hex
            rows.append({"id": new_id, "asset_id": asset_id,
                         "transform": _transform(transform), "visible": True,
                         "locked": False, "parent_id": None})
        else:
            if camera is not _UNSET or face_key is not _UNSET:
                raise SceneInstancesError("Camera is a separate scene action")
            row = next((x for x in rows if x["id"] == instance_id), None)
            if not row:
                raise SceneInstancesError("Scene instance not found")
            if row["locked"] and not (action == "update" and locked is False
                                      and transform is None and visible is None):
                raise SceneInstancesError("Scene instance is locked")
            if action == "remove":
                if any(x is not None for x in (asset_id, transform, visible, locked)):
                    raise SceneInstancesError("Removal does not accept additional fields")
                rows.remove(row)
                current["face_keys"] = [key for key in current["face_keys"]
                                        if key["instance_id"] != instance_id]
            else:
                if asset_id is not None:
                    raise SceneInstancesError("Asset changes require creating a new instance")
                if transform is None and visible is None and locked is None:
                    raise SceneInstancesError("No scene instance changes provided")
                if transform is not None:
                    row["transform"] = _transform(transform)
                if visible is not None:
                    if type(visible) is not bool: raise SceneInstancesError("Invalid visible flag")
                    row["visible"] = visible
                if locked is not None:
                    if type(locked) is not bool: raise SceneInstancesError("Invalid locked flag")
                    row["locked"] = locked
        saved = {k: current[k] for k in ("schema", "project_id", "legacy_revision")}
        saved.update({"revision": revision + 1, "instances": rows,
                      "camera": current["camera"], "face_keys": current["face_keys"]})
        _atomic(Path(root) / (project_id + ".json"), saved)
        return read(root, legacy_root, catalog, project_id, assets)
