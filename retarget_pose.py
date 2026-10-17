"""Conservative rest-direction quaternion retarget for supplied local animation samples.

Offline mathematical transform only. PMX has no authoritative rest-bone orientation;
this produces *provisional* results, not directly a verified playable PMX/VMD motion.
"""
import math
from retarget_calibration import calibrate

EPS=1e-8

def unit(v):
    a=[float(x) for x in v]
    if len(a)!=3 or not all(math.isfinite(x) for x in a):raise ValueError('invalid 3D vector')
    n=math.sqrt(sum(x*x for x in a))
    if n<EPS:raise ValueError('zero-length 3D vector')
    return [x/n for x in a]

def qnorm(q):
    a=[float(x) for x in q]
    if len(a)!=4 or not all(math.isfinite(x) for x in a):raise ValueError('invalid quaternion')
    n=math.sqrt(sum(x*x for x in a))
    if n<EPS:raise ValueError('zero-length quaternion')
    return [x/n for x in a]

def mul(a,b):
    x,y,z,w=a;X,Y,Z,W=b
    return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]

def conj(a):return [-a[0],-a[1],-a[2],a[3]]

def shortest_arc(a,b):
    a,b=unit(a),unit(b)
    dot=sum(x*y for x,y in zip(a,b))
    if dot>1-1e-9:return [0,0,0,1]
    if dot< -1+1e-9:
        ref=[1,0,0] if abs(a[0])<.85 else [0,1,0]
        v=unit([a[1]*ref[2]-a[2]*ref[1],a[2]*ref[0]-a[0]*ref[2],a[0]*ref[1]-a[1]*ref[0]])
        return v+[0]
    c=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    return qnorm(c+[1+dot])

def _positions(doc):
    fmt=doc.get('format');result={}
    for b in doc.get('metadata',{}).get('bones_detail',[]):
        v=b.get('position') if fmt=='PMX' else b.get('head_local')
        if isinstance(v,list) and len(v)==3:
            try:unit(v) if any(v) else None;result[b['name']]=[float(x) for x in v]
            except (ValueError,TypeError,KeyError):pass
    return result

def propose_pose(source,target):
    proposal=calibrate(source,target)
    pos_a,pos_b=_positions(source),_positions(target)
    sm,tm=source.get('suggested_mapping',{}),target.get('suggested_mapping',{})
    # Parent-to-child direction only. No inferred twist: impossible from endpoints alone.
    direction_pairs={'leftUpperArm':'leftLowerArm','rightUpperArm':'rightLowerArm',
                     'leftLowerArm':'leftHand','rightLowerArm':'rightHand',
                     'leftUpperLeg':'leftLowerLeg','rightUpperLeg':'rightLowerLeg',
                     'leftLowerLeg':'leftFoot','rightLowerLeg':'rightFoot',
                     'spine':'chest','neck':'head'}
    offsets={};skipped=[]
    for parent,child in direction_pairs.items():
        sn=[sm.get(parent),sm.get(child)];tn=[tm.get(parent),tm.get(child)]
        if not all(sn+tn) or any(n not in d for n,d in [(sn[0],pos_a),(sn[1],pos_a),(tn[0],pos_b),(tn[1],pos_b)]):
            skipped.append({'role':parent,'reason':'missing paired bone positions'});continue
        vs=[pos_a[sn[1]][i]-pos_a[sn[0]][i] for i in range(3)]
        vt=[pos_b[tn[1]][i]-pos_b[tn[0]][i] for i in range(3)]
        try:offsets[parent]={'source_bone':sn[0],'target_bone':tn[0],
                              'world_direction_alignment_xyzw':shortest_arc(vs,vt),
                              'confidence':'estimated_direction_only'}
        except ValueError:skipped.append({'role':parent,'reason':'degenerate bone direction'})
    proposal['pose_correction']={'status':'provisional_not_applied','direction_offsets':offsets,
                                 'skipped':skipped,'axis_convention':'coordinates_must_share_an_axis_convention',
                                 'twist':'unresolved','rest_local_rotation':'unresolved'}
    proposal['quality']['direction_pairs_count']=len(offsets)
    proposal['warnings']+=['Direction alignment does not resolve axial twist or PMX rest orientation.',
                            'Raw model coordinates may have differing up-axis/handedness; inspect before using offsets.',
                            'This API does not mutate models, apply animation clips or export VMD.']
    return proposal

def transform_samples(profile, samples):
    """Evaluate supplied delta quaternions using a conjugated frame basis.
    Requires axes already calibrated in same coordinate convention; not a VMD exporter.
    samples: list of {role,rotation_xyzw}; returns new mapped samples.
    """
    offsets=profile.get('pose_correction',{}).get('direction_offsets',{})
    if not isinstance(samples,list) or len(samples)>20000:raise ValueError('invalid sample count')
    out=[]
    for s in samples:
        if not isinstance(s,dict) or not isinstance(s.get('role'),str):raise ValueError('invalid sample')
        role=s['role'];info=offsets.get(role)
        if info is None:
            out.append({'role':role,'status':'unmapped'});continue
        basis=qnorm(info['world_direction_alignment_xyzw']);rotation=qnorm(s['rotation_xyzw'])
        result=qnorm(mul(mul(basis,rotation),conj(basis)))
        out.append({'role':role,'target_bone':info['target_bone'],'rotation_xyzw':result,'status':'provisional'})
    return {'samples':out,'not_for_direct_vmd':True,'warnings':['Rest axes and twist are unresolved; verify in PMX/VRM preview.']}
