"""v0.16.30-32 read-only retarget timeline / QA / portable review bundle.
Not an animation, VMD, or validated retarget export.
"""
import math
from vrm_local_transfer import quality, transfer

def build(source, target, clip=None, fps=30, confirmed=False, max_samples=2000):
    if confirmed is not True:
        raise ValueError('coordinate convention confirmation required')
    data=transfer(source,target,clip,fps,confirmed,max_samples)
    grouped={}
    for item in data['samples']:
        frame=item['frame']; role=item['role']; q=item['local_rotation_xyzw']
        if not isinstance(frame,int) or frame<0 or not all(math.isfinite(x) for x in q):
            raise ValueError('invalid frame or quaternion')
        if (frame,role) in grouped:raise ValueError('duplicate frame and role')
        grouped[(frame,role)]=item
    frames=sorted({frame for frame,_ in grouped})
    roles=sorted({role for _,role in grouped})
    timeline=[{'frame':f,'roles':[r for r in roles if (f,r) in grouped]} for f in frames]
    warnings=[]; changes=[]
    for role in roles:
        samples=sorted((f,grouped[(f,role)]) for f in frames if (f,role) in grouped)
        for (af,a),(bf,b) in zip(samples,samples[1:]):
            qa=a['local_rotation_xyzw'];qb=b['local_rotation_xyzw']
            dot=min(1.,max(-1.,abs(sum(x*y for x,y in zip(qa,qb)))))
            angle=math.degrees(2*math.acos(dot))
            gap=bf-af
            if gap<=0:raise ValueError('non-monotonic frames')
            velocity=angle*fps/gap
            changes.append({'role':role,'from_frame':af,'to_frame':bf,'angle_deg':round(angle,4),'deg_per_sec':round(velocity,4)})
            if velocity>720:warnings.append({'role':role,'frame':bf,'issue':'high_angular_velocity','deg_per_sec':round(velocity,2)})
            if gap>1:warnings.append({'role':role,'from_frame':af,'to_frame':bf,'issue':'unsampled_frame_gap'})
    gate=quality(data)
    return {'schema':1,'kind':'unverified_rotation_review_bundle','version':'0.16.32',
            'fps':fps,'clip':data['clip'],'timeline':timeline,'roles':roles,
            'samples':data['samples'],'changes':changes,'quality':gate,
            'warnings':warnings+data['warnings'],'skipped':data['skipped'],
            'suitable_for_vmd_export':False,'animation_applied':False,
            'source_unchanged':True,'target_unchanged':True,
            'limitations':['No target mesh playback verification','No VRM normalized pose / twist calibration',
                           'Only sampled rotation keys, no translation or foot IK','JSON is a QA interchange report, not executable animation']}
