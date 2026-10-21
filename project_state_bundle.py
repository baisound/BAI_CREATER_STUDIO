"""Phase E: validated joint snapshot for existing combination and camera projects.

The two legacy stores stay authoritative.  This is a staged integration, not a
claim of atomic multi-file durability or full workspace restoration.
"""
import json
from camera_project_revision import revision
from pathlib import Path
from bai_camera import validate as validate_camera
from scene_lighting import validate_lights

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


STAGE_ASSET_PREFIXES = ('integrated:', 'mmd:A:', 'mmd:B:', 'fbx:', 'library:')
STAGE_KEYS = {'asset', 'position', 'rotation', 'scale'}
CHARACTER_KEYS = {'position', 'rotation', 'scale'}


def _stage_numbers(value, limit, label):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError('invalid workspace stage ' + label)
    out = []
    for n in value:
        # bool は int の一種なので数として受け付けない。nan/inf も拒否する。
        if isinstance(n, bool) or not isinstance(n, (int, float)) or n != n or not -limit <= n <= limit:
            raise ValueError('invalid workspace stage ' + label)
        out.append(float(n))
    return out


def validate_stage(value):
    """B-4：ステージ配置。None（ステージなし）か {asset, position[m], rotation[度], scale} だけを受け付ける。"""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != STAGE_KEYS:
        raise ValueError('invalid workspace stage')
    asset = value['asset']
    if not isinstance(asset, str) or not asset or len(asset) > 250 or not asset.startswith(STAGE_ASSET_PREFIXES):
        raise ValueError('invalid workspace stage asset')
    if asset.startswith('library:') and (len(asset) != 32 or any(c not in '0123456789abcdef' for c in asset[8:])):
        raise ValueError('invalid workspace stage asset')
    scale = value['scale']
    if isinstance(scale, bool) or not isinstance(scale, (int, float)) or scale != scale or not 0.01 <= scale <= 100:
        raise ValueError('invalid workspace stage scale')
    return {'asset': asset, 'position': _stage_numbers(value['position'], 1000, 'position'),
            'rotation': _stage_numbers(value['rotation'], 360, 'rotation'), 'scale': float(scale)}


def valid_character_asset(asset):
    """既存のGLB/VRM保存名と、登録済み4形式の素材IDを許す。"""
    if not isinstance(asset, str) or len(asset) > 250 or '\0' in asset or '\\' in asset:
        return False
    if not asset:
        return True
    if asset.startswith('integrated:'):
        name = asset[len('integrated:'):]
        return bool(name) and '/' not in name and name.lower().endswith(('.glb', '.vrm', '.fbx'))
    if asset.startswith(('mmd:A:', 'mmd:B:')):
        name = asset[len('mmd:A:'):]
        return name.lower().endswith('.pmx') and all(part not in ('', '.', '..') for part in name.split('/'))
    if asset.startswith('fbx:'):
        name = asset[len('fbx:'):]
        return bool(name) and '/' not in name and name not in ('.', '..')
    return '/' not in asset and asset.lower().endswith(('.glb', '.vrm'))


def validate_character(value):
    """キャラクターの表示位置。素材IDは既存workspace.assetに保存する。"""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != CHARACTER_KEYS:
        raise ValueError('invalid workspace character')
    scale = value['scale']
    if isinstance(scale, bool) or not isinstance(scale, (int, float)) or scale != scale or not 0.01 <= scale <= 100:
        raise ValueError('invalid workspace character scale')
    try:
        position = _stage_numbers(value['position'], 1000, 'character position')
        rotation = _stage_numbers(value['rotation'], 360, 'character rotation')
    except ValueError as exc:
        raise ValueError('invalid workspace character transform') from exc
    return {'position': position, 'rotation': rotation, 'scale': float(scale)}


def validate_workspace(value):
    """Portable editor references, not a claim to embed external assets.

    キーは frame・asset・clip を全部含み、任意で stage/lights/character を足せる。
    返す dict には、本文に stage のキーがあるときだけ stage を入れる（「無い」と null を区別するため）。
    """
    if not isinstance(value, dict) or not {'frame', 'asset', 'clip'} <= set(value) or set(value) - {'frame', 'asset', 'clip', 'stage', 'lights', 'character'}:
        raise ValueError('invalid workspace fields')
    frame, asset, clip = value['frame'], value['asset'], value['clip']
    if type(frame) is not int or not 0 <= frame <= 1000000:
        raise ValueError('invalid workspace frame')
    if not valid_character_asset(asset):
        raise ValueError('invalid workspace asset')
    if clip is not None and (type(clip) is not int or not 0 <= clip <= 1000):
        raise ValueError('invalid workspace clip')
    if not asset and clip is not None:
        raise ValueError('clip requires a model')
    if clip is not None and (asset.startswith(('mmd:', 'fbx:')) or asset.lower().endswith('.fbx')):
        raise ValueError('clip requires a GLB/VRM model')
    result = {'frame': frame, 'asset': asset, 'clip': clip}
    if 'stage' in value:
        result['stage'] = validate_stage(value['stage'])
    if 'lights' in value:
        result['lights'] = validate_lights(value['lights'])
    if 'character' in value:
        result['character'] = validate_character(value['character'])
    return result


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
    # 旧 camera.html が知らない stage/lights/character を送らなくても残す。
    if 'workspace' in payload and any(k not in payload['workspace'] for k in ('stage', 'lights', 'character')) and before_wp is not None:
        invalid_part = 'workspace'
        try:
            existing = json.loads(before_wp.decode('utf-8'))
            if not isinstance(existing, dict):
                raise ValueError('not an object')
            for key, validate in (('stage', validate_stage), ('lights', validate_lights), ('character', validate_character)):
                if key not in payload['workspace'] and key in existing:
                    invalid_part = key
                    kept = validate(existing[key])
                    if kept is not None:
                        payload['workspace'][key] = kept
        except (ValueError, UnicodeDecodeError, TypeError) as exc:
            # B-4 の既存契約：stage を明示した保存は、壊れた旧 workspace を修復できる。
            # lights を明示しない旧クライアントの通常保存は、読み取れない照明を消さない。
            if invalid_part in ('lights', 'character') or 'stage' not in payload['workspace']:
                raise ValueError(f'existing workspace {invalid_part} is unreadable; nothing was written') from exc
    cp.parent.mkdir(parents=True, exist_ok=True)
    tmp = cp.with_suffix('.bundle-tmp')
    workspace_tmp = wp.with_suffix('.workspace-tmp')
    try:
        tmp.write_text(json.dumps(payload['combination'], ensure_ascii=False, indent=2), encoding='utf-8')
        # Camera validation and serialization happen before combination switch.
        camera_save(cam, payload['camera'])
        if 'workspace' in payload:
            to_write = dict(payload['workspace'])
            if to_write.get('stage', 0) is None:
                del to_write['stage']  # "stage": null をファイルに残さない
            if to_write.get('lights', 0) is None:
                del to_write['lights']
            if to_write.get('character', 0) is None:
                del to_write['character']
            workspace_tmp.write_text(json.dumps(to_write, ensure_ascii=False, indent=2), encoding='utf-8')
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
