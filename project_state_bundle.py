"""Phase E: validated joint snapshot for existing combination and camera projects.

The two legacy stores stay authoritative.  This is a staged integration, not a
claim of atomic multi-file durability or full workspace restoration.
"""
import json
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


def validate_bundle(obj):
    if not isinstance(obj, dict) or obj.get('schema') != 1:
        raise ValueError('invalid bundle schema')
    if set(obj) != {'schema', 'combination', 'camera'}:
        raise ValueError('unsupported bundle fields')
    return {'schema': 1,
            'combination': validate_combination(obj['combination']),
            'camera': validate_camera(obj['camera'])}


def read_bundle(combination_path, camera_path):
    from bai_camera import read as camera_read
    cp = Path(combination_path)
    combination = json.loads(cp.read_text(encoding='utf-8')) if cp.exists() else None
    return {'schema': 1, 'combination': combination, 'camera': camera_read(camera_path),
            'complete': combination is not None}


def save_bundle(combination_path, camera_path, obj):
    """Prevalidate both stores, then replace with best-effort rollback on error.

    Power-loss atomicity across two files is NOT guaranteed; future transaction
    journal work is required before labeling this production ready.
    """
    from bai_camera import save as camera_save
    payload = validate_bundle(obj)
    cp, cam = Path(combination_path), Path(camera_path)
    before_comb = cp.read_bytes() if cp.exists() else None
    before_cam = cam.read_bytes() if cam.exists() else None
    cp.parent.mkdir(parents=True, exist_ok=True)
    tmp = cp.with_suffix('.bundle-tmp')
    try:
        tmp.write_text(json.dumps(payload['combination'], ensure_ascii=False, indent=2), encoding='utf-8')
        # Camera validation and serialization happen before combination switch.
        camera_save(cam, payload['camera'])
        tmp.replace(cp)
    except Exception:
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
    return {'ok': True, 'schema': 1}
