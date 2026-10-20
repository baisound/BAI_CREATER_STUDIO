"""BAI Camera: standalone, offline camera keyframe store and deterministic interpolation."""
import copy, hashlib, json, math, os, threading
from datetime import datetime, timezone
from pathlib import Path
from camera_easing import MODES as EASING_MODES, handles as easing_handles, ease
LOCK=threading.RLock()
FSTOP_MIN,FSTOP_MAX,FSTOP_DEFAULT=0.7,64.0,4.0
DEFAULT={'schema':1,'fps':30,'duration':300,'keys':[{'frame':0,'position':[0,1.6,5],'target':[0,1,0],'fov':40},{'frame':90,'position':[4,2,3],'target':[0,1,0],'fov':35}]}
def number(value,lo,hi):
    if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError('camera number out of range')
    return float(value)
def validate(payload):
    if not isinstance(payload,dict) or payload.get('schema')!=1:raise ValueError('camera schema must be 1')
    fps=number(payload.get('fps'),1,120); duration=number(payload.get('duration'),1,1000000)
    if int(fps)!=fps or int(duration)!=duration:raise ValueError('fps/duration must be integers')
    keys=payload.get('keys')
    if not isinstance(keys,list) or len(keys)>5000:raise ValueError('invalid camera keyframes')
    out=[]; seen=set()
    for key in keys:
        if not isinstance(key,dict):raise ValueError('invalid camera key')
        frame=number(key.get('frame'),0,duration)
        if int(frame)!=frame or frame in seen:raise ValueError('duplicate or invalid frame')
        seen.add(frame)
        mode=key.get('interpolation','linear')
        if mode not in EASING_MODES:raise ValueError('invalid camera interpolation')
        record={'frame':int(frame),'fov':number(key.get('fov'),5,150),'interpolation':mode}
        if mode=='custom':record['customCurve']=easing_handles(key.get('customCurve'))
        # F-number is optional: legacy projects without it stay unchanged (CAM-005).
        if 'fStop' in key:record['fStop']=number(key.get('fStop'),FSTOP_MIN,FSTOP_MAX)
        for attr in ('position','target'):
            arr=key.get(attr)
            if not isinstance(arr,list) or len(arr)!=3:raise ValueError('invalid camera vector')
            record[attr]=[number(v,-10000,10000) for v in arr]
        if sum((a-b)**2 for a,b in zip(record['position'],record['target']))<1e-8:raise ValueError('camera position and target must differ')
        out.append(record)
    result={'schema':1,'fps':int(fps),'duration':int(duration),'keys':sorted(out,key=lambda k:k['frame'])}
    if 'easingPresets' in payload:
        presets=payload['easingPresets']
        if not isinstance(presets,dict) or len(presets)>64:raise ValueError('invalid easing presets')
        for name in presets:
            if not isinstance(name,str) or not 1<=len(name.strip())<=48:raise ValueError('invalid easing preset name')
        result['easingPresets']={name:easing_handles(curve) for name,curve in presets.items()}
    if 'custom_presets' in payload:
        from camera_custom_presets import validate_presets
        result['custom_presets']=validate_presets(payload['custom_presets'])
    if 'sequence' in payload:
        from camera_sequence import validate_sequence
        result['sequence']=validate_sequence(payload['sequence'], int(duration), [p['name'] for p in result.get('custom_presets', [])])
    if 'rig' in payload:
        from camera_rig_store import validate_rig
        result['rig']=validate_rig(payload['rig'])
    if 'focus_tracking' in payload:
        focus=payload['focus_tracking']
        if not isinstance(focus,dict) or type(focus.get('enabled')) is not bool:raise ValueError('invalid focus tracking')
        result['focus_tracking']={'enabled':focus['enabled']}
    if 'bone_follow' in payload:
        from camera_follow_store import validate_follow
        result['bone_follow']=validate_follow(payload['bone_follow'])
    return result
def sample(project,frame):
    p=validate(project); f=number(frame,0,p['duration']); keys=p['keys']
    if not keys:raise ValueError('no camera keyframes')
    if f<=keys[0]['frame']:return dict(keys[0],frame=f)
    if f>=keys[-1]['frame']:return dict(keys[-1],frame=f)
    for left,right in zip(keys,keys[1:]):
        if left['frame']<=f<=right['frame']:
            t=(f-left['frame'])/(right['frame']-left['frame'])
            mode=left.get('interpolation','linear')
            # hold keeps the left key even at the right key's frame, matching camera.js sample().
            t=0.0 if mode=='hold' else ease(mode,t,left.get('customCurve'))
            pose={'frame':f,'position':[a+(b-a)*t for a,b in zip(left['position'],right['position'])],'target':[a+(b-a)*t for a,b in zip(left['target'],right['target'])],'fov':left['fov']+(right['fov']-left['fov'])*t}
            if 'fStop' in left or 'fStop' in right:
                a,b=left.get('fStop',FSTOP_DEFAULT),right.get('fStop',FSTOP_DEFAULT)
                pose['fStop']=a+(b-a)*t
            return pose
    raise ValueError('frame not found')
def read(path):
    try:return validate(json.loads(Path(path).read_text(encoding='utf8')))
    except (OSError,ValueError,TypeError):return validate(DEFAULT)
class CameraProjectInvalid(Exception):
    """camera_project.json を読めない（P2-WP-00b B-3）。ValueError を継承しない：既存の except (ValueError,...) に捕まって 400 になるのを避ける。"""
    def __init__(self,message,backup_name=None):
        super().__init__(message);self.message=message;self.backup_name=backup_name
BACKUP_PREFIX='camera_project.invalid-'
def _ensure_backup(path,raw):
    """読んだファイルと同じフォルダに退避コピーを確かめる（同じ内容なら1回だけ）。退避名を返す。書けなければ OSError。"""
    folder=Path(path).parent;sha8=hashlib.sha256(raw).hexdigest()[:8]
    existing=sorted(folder.glob(f'{BACKUP_PREFIX}{sha8}-*.json'))
    if existing:return existing[0].name
    name=f"{BACKUP_PREFIX}{sha8}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    temp=folder/(name+'.tmp')
    try:
        temp.write_bytes(raw);os.replace(temp,folder/name)
    finally:
        if temp.exists():temp.unlink()
    return name
def read_project(path):
    """厳格な読込。(project, dropped_fields) を返す。ファイルが無ければ DEFAULT の複製（書かない）。読めなければ CameraProjectInvalid。"""
    try:raw=Path(path).read_bytes()
    except FileNotFoundError:return validate(copy.deepcopy(DEFAULT)),[]
    except OSError as exc:raise CameraProjectInvalid('camera project is unreadable: '+type(exc).__name__,None)
    try:return validate(json.loads(raw.decode('utf-8'))),[]
    except (ValueError,TypeError,KeyError,AttributeError,UnicodeDecodeError) as exc:
        reason='camera project is invalid: '+type(exc).__name__+': '+str(exc)
    try:backup=_ensure_backup(path,raw)
    except OSError:raise CameraProjectInvalid(reason,None)
    raise CameraProjectInvalid(reason,backup)
def reset_project(path):
    """カメラ保存データを DEFAULT に戻す。先に退避を確かめ、退避できなければ何も書かない。退避名（無ければ None）を返す。"""
    with LOCK:
        try:raw=Path(path).read_bytes()
        except FileNotFoundError:
            save(path,copy.deepcopy(DEFAULT));return None
        except OSError as exc:raise CameraProjectInvalid('camera project is unreadable: '+type(exc).__name__,None)
        try:backup=_ensure_backup(path,raw)
        except OSError as exc:raise CameraProjectInvalid('camera project backup failed: '+type(exc).__name__,None)
        save(path,copy.deepcopy(DEFAULT));return backup
def save(path,payload):
    value=validate(payload);p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    with LOCK:
        temp=p.with_suffix('.tmp')
        try:
            temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8');os.replace(temp,p)
        finally:
            if temp.exists():temp.unlink()
    return value

def camera_move(pose, operation, amount):
    """Return a non-destructive camera pose; angles in degrees, translations in scene units."""
    if not isinstance(pose,dict):raise ValueError('pose must be a dict')
    amount=number(amount,-360,360)
    eye=[number(v,-10000,10000) for v in pose['position']]
    tar=[number(v,-10000,10000) for v in pose['target']]
    fov=number(pose['fov'],5,150)
    d=[eye[i]-tar[i] for i in range(3)]; radius=math.hypot(*d)
    if radius<1e-4:raise ValueError('camera position and target must differ')
    def rotate(v,axis,angle):
        c,s=math.cos(angle),math.sin(angle)
        dot=sum(a*b for a,b in zip(axis,v))
        cross=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]]
        return [c*v[i]+s*cross[i]+(1-c)*dot*axis[i] for i in range(3)]
    forward=[-v/radius for v in d]
    right=[forward[2],0,-forward[0]];rn=math.hypot(*right)
    if rn<1e-8:right=[1.,0.,0.]
    else:right=[x/rn for x in right]
    up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]]
    a=math.radians(amount)
    if operation=='orbit':eye=[tar[i]+v for i,v in enumerate(rotate(d,[0,1,0],a))]
    elif operation=='dolly':
        if radius-amount<=.05:raise ValueError('dolly would cross target')
        eye=[eye[i]+forward[i]*amount for i in range(3)]
    elif operation=='pan':
        shift=[x*amount for x in right];eye=[eye[i]+shift[i] for i in range(3)];tar=[tar[i]+shift[i] for i in range(3)]
    elif operation=='tilt':
        v=rotate([-x for x in d],right,a);tar=[eye[i]+v[i] for i in range(3)]
    else:raise ValueError('unsupported operation')
    return {'position':eye,'target':tar,'fov':fov}
