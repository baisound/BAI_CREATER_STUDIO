"""Phase E: validated joint snapshot for existing combination and camera projects.

The two legacy stores stay authoritative.  This is a staged integration, not a
claim of atomic multi-file durability or full workspace restoration.
"""
import json
from camera_project_revision import revision
from pathlib import Path
from bai_camera import validate as validate_camera

MAX_TIMELINE = 300
MAX_HISTORY = 120


def validate_combination(obj):
    if not isinstance(obj, dict) or obj.get('schema') != 1:
        raise ValueError('invalid combination schema')
    steps = obj.get('timeline')
    history = obj.get('history')
    cursor = obj.get('cursor')
    if not isinstance(steps, list) or len(steps) > MAX_TIMELINE:
        raise ValueError('invalid combination timeline')
    if not isinstance(history, list) or len(history) > MAX_HISTORY:
        raise ValueError('invalid combination history')
    if type(cursor) is not int or not -1 <= cursor < len(history):
        raise ValueError('invalid combination cursor')
    for step in steps:
        if not isinstance(step, dict) or not isinstance(step.get('name'), str) or len(step['name']) > 250:
            raise ValueError('invalid combination step')
    for h in history:
        if not isinstance(h, dict) or not isinstance(h.get('timeline'), list) or len(h['timeline']) > MAX_TIMELINE:
            raise ValueError('invalid combination history step')
    return obj


def validate_workspace(value):
    """Portable editor references, not a claim to embed external assets."""
    if not isinstance(value, dict) or set(value) != {'frame', 'asset', 'clip'}:
        raise ValueError('invalid workspace fields')
    frame, asset, clip = value['frame'], value['asset'], value['clip']
    if type(frame) is not int or not 0 <= frame <= 1000000:
        raise ValueError('invalid workspace frame')
    if not isinstance(asset, str) or len(asset) > 250 or (asset and (not asset.lower().endswith(('.glb','.vrm')) or '/' in asset or chr(92) in asset)):
        raise ValueError('invalid workspace asset')
    if clip is not None and (type(clip) is not int or not 0 <= clip <= 1000):
        raise ValueError('invalid workspace clip')
    if not asset and clip is not None:
        raise ValueError('clip requires a model')
    return {'frame': frame, 'asset': asset, 'clip': clip}


def validate_bundle(obj):
    if not isinstance(obj, dict) or obj.get('schema') != 1:
        raise ValueError('invalid bundle schema')
    if set(obj) not in ({'schema', 'combination', 'camera'}, {'schema', 'combination', 'camera', 'workspace'}):
        raise ValueError('unsupported bundle fields')
    result = {'schema': 1, 'combination': validate_combination(obj['combination']), 'camera': validate_camera(obj['camera'])}
    if 'workspace' in obj:
        result['workspace'] = validate_workspace(obj['workspace'])
        if result['workspace']['frame'] > result['camera']['duration']:
            raise ValueError('workspace frame exceeds camera duration')
    return result


def read_bundle(combination_path, camera_path, strict=False):
    """strict=True のときだけカメラを read_project で読み、壊れていれば CameraProjectInvalid を投げる（B-3）。"""
    from bai_camera import read as camera_read, read_project
    cp = Path(combination_path)
    combination = json.loads(cp.read_text(encoding='utf-8')) if cp.exists() else None
    workspace_path = cp.with_suffix('.workspace.json')
    workspace = json.loads(workspace_path.read_text(encoding='utf-8')) if workspace_path.exists() else None
    return {'schema': 1, 'combination': combination, 'camera': read_project(camera_path)[0] if strict else camera_read(camera_path),
            'workspace': workspace, 'complete': combination is not None}


def save_bundle(combination_path, camera_path, obj):
    """Prevalidate both stores, then replace with best-effort rollback on error.

    Power-loss atomicity across two files is NOT guaranteed; future transaction
    journal work is required before labeling this production ready.
    """
    from bai_camera import save as camera_save
    payload = validate_bundle(obj)
    cp, cam = Path(combination_path), Path(camera_path)
    wp = cp.with_suffix('.workspace.json')
    before_comb = cp.read_bytes() if cp.exists() else None
    before_cam = cam.read_bytes() if cam.exists() else None
    before_wp = wp.read_bytes() if wp.exists() else None
    cp.parent.mkdir(parents=True, exist_ok=True)
    tmp = cp.with_suffix('.bundle-tmp')
    workspace_tmp = wp.with_suffix('.workspace-tmp')
    try:
        tmp.write_text(json.dumps(payload['combination'], ensure_ascii=False, indent=2), encoding='utf-8')
        # Camera validation and serialization happen before combination switch.
        camera_save(cam, payload['camera'])
        if 'workspace' in payload:
            workspace_tmp.write_text(json.dumps(payload['workspace'], ensure_ascii=False, indent=2), encoding='utf-8')
            workspace_tmp.replace(wp)
        else:
            wp.unlink(missing_ok=True)
        tmp.replace(cp)
    except Exception:
        if before_wp is None:
            wp.unlink(missing_ok=True)
        else:
            restore_workspace = wp.with_suffix('.workspace-restore')
            restore_workspace.write_bytes(before_wp)
            restore_workspace.replace(wp)
        if before_cam is None:
            cam.unlink(missing_ok=True)
        else:
            restore = cam.with_suffix('.restore-tmp')
            restore.write_bytes(before_cam)
            restore.replace(cam)
        if before_comb is None:
            cp.unlink(missing_ok=True)
        else:
            restore = cp.with_suffix('.restore-tmp')
            restore.write_bytes(before_comb)
            restore.replace(cp)
        raise
    finally:
        tmp.unlink(missing_ok=True)
        workspace_tmp.unlink(missing_ok=True)
    return {'ok': True, 'schema': 1}


def bundle_revision(snapshot):
    """Revision of persisted bundle components, excluding response-only flags."""
    return revision({key: snapshot.get(key) for key in ('combination', 'camera', 'workspace')})
