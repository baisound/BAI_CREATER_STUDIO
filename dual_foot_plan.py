"""Read-only coordinated two-foot root-XZ previews. No actual IK, bone, or VMD editing."""
import math
from foot_contact import diagnose

def propose_dual_foot(left_samples,right_samples,ground_y=0.0,height_tolerance=0.06,motion_tolerance=0.025,max_offset=0.2,conflict_tolerance=0.05):
    for name,value in [('max_offset',max_offset),('conflict_tolerance',conflict_tolerance)]:
        if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value) or value<0:raise ValueError('Invalid '+name)
    reports={side:diagnose(samples,ground_y,height_tolerance,motion_tolerance) for side,samples in [('left',left_samples),('right',right_samples)]}
    lookups={side:{s['frame']:s['position'] for s in samples} for side,samples in [('left',left_samples),('right',right_samples)]}
    frames=sorted(set(lookups['left'])|set(lookups['right']))
    results=[]; conflict_frames=[]
    for frame in frames:
        corrections={}
        for side in ('left','right'):
            for span in reports[side]['contact_intervals']:
                if span['start_frame']<=frame<=span['end_frame'] and frame in lookups[side]:
                    x,_,z=lookups[side][frame]; ax,_,az=span['anchor_world']
                    corrections[side]=[ax-x,az-z]
                    break
        if not corrections:continue
        conflict=False; separation=0.0
        if len(corrections)==2:
            separation=math.dist(corrections['left'],corrections['right'])
            conflict=separation>conflict_tolerance
        if conflict:
            conflict_frames.append(frame)
            delta=[0.0,0.0]  # never choose one foot over the other on a conflict
        else:
            delta=[sum(d[axis] for d in corrections.values())/len(corrections) for axis in range(2)]
            mag=math.hypot(*delta)
            if mag>max_offset and mag:delta=[d*max_offset/mag for d in delta]
        results.append({'frame':frame,'active_feet':list(corrections),'suggested_root_translation_delta_xz':[round(x,6) for x in delta], 'conflict':conflict,'required_delta_separation':round(separation,6),'residual_per_foot':{side:round(math.dist(delta,correction),6) for side,correction in corrections.items()}})
    return {'schema':1,'space':'world','kind':'root_xz_preview','applied':False,'modified_source':False,'left':reports['left'],'right':reports['right'],'frames':results,'conflict_frames':conflict_frames,'status':'review_needed' if conflict_frames or reports['left']['status']=='review_needed' or reports['right']['status']=='review_needed' else 'no_flagged_issue','limitations':['Zero root movement on conflicting planted-foot targets; actual leg IK required to resolve.','No bone transforms, physics, or VMD writing.','Both foot sample streams must use the same axis, frame numbering, units and origin.','Source joint locations may not correspond to the soles.']}
