"""Read-only glTF exact-keyframe hierarchical quaternion inspection.
No interpolation, retargeting, model modification or VMD emission.
"""
import json, struct, math, bisect
from motion_interchange import glb_channels
from model_rest_skeleton import parse
from rest_pose_inspection import _read
from retarget_pose import qnorm, mul


def preview(data, clip=None, fps=30, max_samples=2000):
    if type(fps) not in (int,float) or not 1 <= fps <= 120: raise ValueError('fps out of range')
    if type(max_samples) is not int or not 1 <= max_samples <= 2000: raise ValueError('max_samples out of range')
    parsed=parse(data)
    length,=struct.unpack_from('<I',data,12)
    doc=json.loads(data[20:20+length]);nodes=doc.get('nodes',[])
    parents=[-1]*len(nodes)
    for i,node in enumerate(nodes):
        for child in node.get('children',[]):parents[child]=i
    rests=_read(data)
    rest_by_index={v['node']:v['local_rest_xyzw'] for v in rests.values() if v.get('status')=='read_only'}
    channels=glb_channels(data)['channels'];clips=sorted({c['clip'] for c in channels})
    if clip is None:
        if len(clips)!=1:raise ValueError('specify clip when zero or multiple animations')
        clip=clips[0]
    if clip not in clips:raise ValueError('clip not found')
    tracks={}; times=set(); modes={}
    def interpolate(keys, mode, t):
        ts=[k[0] for k in keys]
        pos=bisect.bisect_left(ts,t)
        if pos<len(keys) and abs(ts[pos]-t)<1e-6:return keys[pos][1]
        if pos==0 or pos==len(keys):raise LookupError('time outside animated track range; no extrapolation')
        a, qa=keys[pos-1]; b, qb=keys[pos]
        if mode=='STEP':return qa
        if mode!='LINEAR':raise LookupError('unsupported interpolation mode')
        alpha=(t-a)/(b-a)
        dot=sum(x*y for x,y in zip(qa,qb))
        if dot<0:qb=tuple(-x for x in qb);dot=-dot
        dot=min(1.,max(-1.,dot))
        if dot>0.9995:return qnorm([x+alpha*(y-x) for x,y in zip(qa,qb)])
        angle=math.acos(dot);sin_angle=math.sin(angle)
        w0=math.sin((1-alpha)*angle)/sin_angle;w1=math.sin(alpha*angle)/sin_angle
        return qnorm([w0*x+w1*y for x,y in zip(qa,qb)])
    for c in channels:
        if c['clip']!=clip or c['path']!='rotation':continue
        node=c['node_index']
        if node in tracks:raise ValueError('duplicate rotation channels for node')
        keys=[]
        for k in c['keys']:
            t=k['time']
            if not math.isfinite(t) or (keys and t<=keys[-1][0]):raise ValueError('key times must be finite and strictly increasing')
            keys.append((t,qnorm(k['value'])));times.add(t)
        if not keys:continue
        tracks[node]=keys;modes[node]=c['interpolation']
    roles={b['index']:b['humanoid_role'] for b in parsed['bones_detail'] if b.get('humanoid_role')}
    result=[];skipped=[]
    for t in sorted(times):
        frame=round(t*fps)
        if len(result)>=max_samples:raise ValueError('sample limit exceeded')
        cache={};active=set()
        def world(node):
            if node in cache:return cache[node]
            if node in active:raise ValueError('cyclic hierarchy')
            active.add(node)
            if node in tracks:
                local=interpolate(tracks[node],modes[node],t)
            elif node in rest_by_index:
                local=rest_by_index[node]
            else:
                item=nodes[node]
                if 'matrix' in item:raise LookupError('matrix transform ancestor requires calibration')
                local=qnorm(item.get('rotation',[0,0,0,1]))
            parent=parents[node]
            q=qnorm(mul(world(parent),local)) if parent>=0 else local
            cache[node]=q;active.remove(node);return q
        for node,role in roles.items():
            if node not in tracks:continue
            try:q=world(node)
            except LookupError as e:
                skipped.append({'role':role,'time':t,'reason':str(e)});continue
            result.append({'role':role,'node':node,'time':t,'frame':frame,'source_world_rotation_xyzw':q})
            if len(result)>max_samples:raise ValueError('sample limit exceeded')
    return {'schema':1,'mode':'read_only_interpolated_hierarchical_rotation','clip':clip,'samples':result,'skipped':skipped,
            'target_animation_applied':False,'model_modified':False,'vmd_written':False,
            'warnings':['This is source world orientation inspection, NOT retargeting or VRM local animation.',
                        'LINEAR rotation tracks use shortest-path SLERP; STEP uses previous key. Out-of-range times are skipped.',
                        'Transform matrix nodes require calibration before reliable rotation decomposition.']}
