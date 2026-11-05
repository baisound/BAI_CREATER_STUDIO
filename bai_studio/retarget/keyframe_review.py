"""Read-only review of unverified rotation keys; intentionally not VMD export."""
import math

MAX_KEYS = 2000

def build_keyframe_review(bundle):
    if not isinstance(bundle,dict) or bundle.get('kind') != 'unverified_rotation_review_bundle':
        raise ValueError('expected an unverified review bundle')
    if bundle.get('suitable_for_vmd_export') is not False or bundle.get('animation_applied') is not False:
        raise ValueError('review input must prohibit production export')
    samples=bundle.get('samples')
    if not isinstance(samples,list) or len(samples)>MAX_KEYS:
        raise ValueError('invalid sample count')
    keys=[]; seen=set()
    for row in samples:
        if not isinstance(row,dict):raise ValueError('invalid key')
        f=row.get('frame'); role=row.get('role'); node=row.get('target_node'); q=row.get('local_rotation_xyzw')
        if type(f) is not int or f<0 or not isinstance(role,str) or not role or len(role)>100 or type(node) is not int or node<0:
            raise ValueError('invalid key metadata')
        if not isinstance(q,list) or len(q)!=4 or any(type(v) not in (float,int) or not math.isfinite(v) for v in q):
            raise ValueError('invalid quaternion')
        norm=math.sqrt(sum(v*v for v in q))
        if norm<1e-8:raise ValueError('zero quaternion')
        ident=(f,role)
        if ident in seen:raise ValueError('duplicate bone/frame')
        seen.add(ident)
        keys.append({'frame':f,'role':role,'target_node':node,'rotation_xyzw':[round(v/norm,9) for v in q], 'status':'unverified_candidate'})
    keys.sort(key=lambda k:(k['frame'],k['role']))
    warnings=bundle.get('warnings',[])
    if not isinstance(warnings,list):raise ValueError('invalid warning list')
    return {'schema':1,'kind':'BAI_UNVERIFIED_KEYFRAME_REVIEW','version':'0.16.35','fps':bundle.get('fps'),
            'keys':keys,'key_count':len(keys),'frame_count':len({k['frame'] for k in keys}),
            'calibration':{'rest_pose':'unverified','joint_twist':'unverified','vrm_normalization':'unverified', 'foot_ik':'not_applied'},
            'quality_gate':'blocked_for_production','warnings_count':len(warnings),
            'animation_applied':False,'vmd_export_allowed':False,
            'limitations':['Not VMD or a playable animation','No validated VRM retarget or joint twist correction',
                           'No root translation, foot IK or verified continuous playback']}
