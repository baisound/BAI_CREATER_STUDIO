"""BAI Camera: standalone, offline camera keyframe store and deterministic interpolation."""
import json, math, os, threading
from pathlib import Path
LOCK=threading.RLock()
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
        record={'frame':int(frame),'fov':number(key.get('fov'),5,150)}
        for attr in ('position','target'):
            arr=key.get(attr)
            if not isinstance(arr,list) or len(arr)!=3:raise ValueError('invalid camera vector')
            record[attr]=[number(v,-10000,10000) for v in arr]
        if sum((a-b)**2 for a,b in zip(record['position'],record['target']))<1e-8:raise ValueError('camera position and target must differ')
        out.append(record)
    return {'schema':1,'fps':int(fps),'duration':int(duration),'keys':sorted(out,key=lambda k:k['frame'])}
def sample(project,frame):
    p=validate(project); f=number(frame,0,p['duration']); keys=p['keys']
    if not keys:raise ValueError('no camera keyframes')
    if f<=keys[0]['frame']:return dict(keys[0],frame=f)
    if f>=keys[-1]['frame']:return dict(keys[-1],frame=f)
    for left,right in zip(keys,keys[1:]):
        if left['frame']<=f<=right['frame']:
            t=(f-left['frame'])/(right['frame']-left['frame'])
            return {'frame':f,'position':[a+(b-a)*t for a,b in zip(left['position'],right['position'])],'target':[a+(b-a)*t for a,b in zip(left['target'],right['target'])],'fov':left['fov']+(right['fov']-left['fov'])*t}
    raise ValueError('frame not found')
def read(path):
    try:return validate(json.loads(Path(path).read_text(encoding='utf8')))
    except (OSError,ValueError,TypeError):return validate(DEFAULT)
def save(path,payload):
    value=validate(payload);p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    with LOCK:
        temp=p.with_suffix('.tmp')
        try:
            temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8');os.replace(temp,p)
        finally:
            if temp.exists():temp.unlink()
    return value
