"""Read-only BVH world-space joint sampler. BVH axis/unit conventions remain untouched.

This is forward kinematics on BVH channels, NOT PMX/VRM foot IK.
"""
import math
import re
from bvh_skeleton import parse_bvh_skeleton


def _mul(a, b):
    return [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _rotate(a, v):
    return [sum(a[i][k]*v[k] for k in range(3)) for i in range(3)]


def _rotation(axis, deg):
    angle=math.radians(deg); c=math.cos(angle);s=math.sin(angle)
    if axis=='X':return [[1,0,0],[0,c,-s],[0,s,c]]
    if axis=='Y':return [[c,0,s],[0,1,0],[-s,0,c]]
    return [[c,-s,0],[s,c,0],[0,0,1]]


def sample_bvh_foot_world(data, bone, stride=1, max_frames=10000):
    if not isinstance(data,bytes) or len(data)>2_000_000:raise ValueError('BVH must be bytes under 2 MB')
    if not isinstance(bone,str) or not bone or len(bone)>160:raise ValueError('Select a foot joint name')
    if not isinstance(stride,int) or isinstance(stride,bool) or not 1<=stride<=1000:raise ValueError('Invalid stride')
    skeleton=parse_bvh_skeleton(data,max_bones=512)
    bones=skeleton['bones_detail']; names=[b['name'] for b in bones]
    matches=[i for i,name in enumerate(names) if name==bone]
    if len(matches)!=1:raise ValueError('Foot bone missing or ambiguous: '+bone)
    lines=data.decode('utf-8-sig',errors='replace').splitlines()
    channels=[]; stack=[]; pending=None; idx=0; motion_idx=None
    for li,raw in enumerate(lines):
        s=raw.strip()
        if s=='MOTION':motion_idx=li;break
        m=re.match(r'^(ROOT|JOINT)\s+(.+)$',s)
        if m: pending=('joint',m.group(2).strip());continue
        if s=='End Site':pending=('end',None);continue
        if s=='{':
            if pending is None:raise ValueError('Unexpected brace')
            if pending[0]=='joint':
                if idx>=len(bones) or bones[idx]['name']!=pending[1]:raise ValueError('BVH joint mismatch')
                stack.append(idx);idx+=1
            else:stack.append(None)
            pending=None
        elif s=='}':
            if not stack:raise ValueError('Unbalanced BVH')
            stack.pop()
        elif s.startswith('CHANNELS '):
            parts=s.split();count=int(parts[1]);decl=parts[2:]
            if count!=len(decl) or count>6 or not stack or stack[-1] is None:raise ValueError('Invalid BVH CHANNELS')
            if any(x not in ('Xposition','Yposition','Zposition','Xrotation','Yrotation','Zrotation') for x in decl):raise ValueError('Unsupported BVH channel')
            channels.extend((stack[-1],x) for x in decl)
    if motion_idx is None or len(channels)>3072:raise ValueError('Incomplete BVH motion')
    tail=lines[motion_idx+1:]; pos=0
    while pos<len(tail) and not tail[pos].strip():pos+=1
    if pos>=len(tail):raise ValueError('BVH frame count missing')
    fm=re.fullmatch(r'Frames:\s*(\d+)',tail[pos].strip());pos+=1
    if not fm:raise ValueError('Invalid Frames header')
    count=int(fm.group(1))
    if not 2<=count<=max_frames:raise ValueError('BVH requires 2-10000 frames')
    while pos<len(tail) and not tail[pos].strip():pos+=1
    tm=re.fullmatch(r'Frame Time:\s*([0-9.eE+-]+)',tail[pos].strip()) if pos<len(tail) else None
    if not tm or not 0<float(tm.group(1))<10:raise ValueError('Invalid frame time')
    pos+=1; frames=[]
    for raw in tail[pos:]:
        if not raw.strip():continue
        if len(frames)>=count:break
        vals=list(map(float,raw.split()))
        if len(vals)!=len(channels) or not all(math.isfinite(v) for v in vals):raise ValueError('Malformed BVH frame')
        frames.append(vals)
    if len(frames)!=count:raise ValueError('Incomplete BVH motion frames')
    identity=[[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]]
    samples=[]
    for fi in range(0,count,stride):
        assigned=[[] for _ in bones]
        for (bi,ch),v in zip(channels,frames[fi]):assigned[bi].append((ch,v))
        transforms=[]
        for bi,b in enumerate(bones):
            local_pos=list(b['offset']);local_rot=identity
            for ch,v in assigned[bi]:
                if ch.endswith('position'):local_pos['XYZ'.index(ch[0])]+=v
                else:local_rot=_mul(local_rot,_rotation(ch[0],v))
            parent=b['parent_index']
            if parent is None:world_pos=local_pos;world_rot=local_rot
            else:
                pp,pr=transforms[parent];translation=_rotate(pr,local_pos)
                world_pos=[pp[j]+translation[j] for j in range(3)]
                world_rot=_mul(pr,local_rot)
            transforms.append((world_pos,world_rot))
        samples.append({'frame':fi,'position':[round(v,8) for v in transforms[matches[0]][0]]})
    return {'schema':1,'format':'BVH','joint':bone,'space':'world_in_source_bvh_axes','source_units':'unverified','sample_count':len(samples),'stride':stride,'samples':samples,'applied_to_model':False,'limitations':['Requires explicit ground height in BVH source units and Y-up convention for foot-contact diagnostics.','Joint origins are not necessarily soles; offsets may require calibration.','No PMX/VRM IK or VMD modifications performed.']}
