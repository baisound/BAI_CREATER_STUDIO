"""Non-destructive foot-ground contact diagnostics using WORLD-space foot samples.
No IK bone solver here. All distances must use a caller-defined consistent unit.
"""
import math

def diagnose(samples, ground_y=0.0, height_tolerance=0.06, motion_tolerance=0.025, min_contact_frames=2):
    if not isinstance(samples,list) or not 2<=len(samples)<=10000: raise ValueError('Need 2-10000 world-space samples')
    if not all(math.isfinite(float(x)) for x in (ground_y,height_tolerance,motion_tolerance)): raise ValueError('Nonfinite settings')
    if not (height_tolerance>=0 and motion_tolerance>=0 and isinstance(min_contact_frames,int) and min_contact_frames>=2):raise ValueError('Invalid thresholds')
    samples=sorted(samples,key=lambda x:x['frame']); prev=-1;clean=[]
    for sample in samples:
        f=sample['frame'];p=sample['position']
        if not isinstance(f,int) or f<=prev or not isinstance(p,list) or len(p)!=3 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p):raise ValueError('Invalid sample order or world-space position')
        clean.append({'frame':f,'position':p});prev=f
    candidates=[abs(s['position'][1]-ground_y)<=height_tolerance for s in clean]
    contacts=[]; start=None
    for i in range(len(clean)+1):
        active=i<len(clean) and candidates[i]
        if active and start is None:start=i
        if not active and start is not None:
            if i-start>=min_contact_frames:contacts.append((start,i))
            start=None
    intervals=[];drifts=[]
    for a,b in contacts:
        anchor=clean[a]['position']; max_d=0.0
        for s in clean[a:b]:
            p=s['position'];d=math.hypot(p[0]-anchor[0],p[2]-anchor[2]);max_d=max(max_d,d)
            if d>motion_tolerance:drifts.append({'frame':s['frame'],'horizontal_drift':round(d,6)})
        intervals.append({'start_frame':clean[a]['frame'],'end_frame':clean[b-1]['frame'],'anchor_world':list(anchor),'max_horizontal_drift':round(max_d,6)})
    penetrations=[{'frame':s['frame'],'depth':round(ground_y-s['position'][1],6)} for s in clean if s['position'][1]<ground_y-height_tolerance]
    return {'schema':1,'space':'world','ground_y':ground_y,'contact_intervals':intervals,'drift_frames':drifts,'penetrations':penetrations,'status':'review_needed' if drifts or penetrations else 'no_flagged_issue','modified_source':False,'limitations':['Contact based on height proximity, not force or velocity.','Root offset cannot correct left/right feet independently.','No IK is applied. Require real PMX/VRM visual validation.']}

def root_offset_proposal(report,samples,max_offset=0.2):
    """Suggested root XZ correction for one planted foot; never applies values."""
    if not math.isfinite(max_offset) or max_offset<0:raise ValueError('Invalid max_offset')
    lookup={x['frame']:x['position'] for x in samples}; suggestions=[]
    for span in report.get('contact_intervals',[]):
        ax,_,az=span['anchor_world']
        for frame,pos in lookup.items():
            if span['start_frame']<=frame<=span['end_frame']:
                dx,dz=ax-pos[0],az-pos[2]; magnitude=math.hypot(dx,dz)
                if magnitude>max_offset and magnitude>0:dx*=max_offset/magnitude;dz*=max_offset/magnitude
                suggestions.append({'frame':frame,'root_translation_delta_xz':[round(dx,6),round(dz,6)]})
    return {'schema':1,'suggestions':sorted(suggestions,key=lambda x:x['frame']),'applied':False,'warning':'Root-only proposal; may break the other foot. Manual review required.'}
