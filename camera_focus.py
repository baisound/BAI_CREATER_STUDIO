"""Deterministic Phase E geometric depth-of-field diagnostics.

Only world-space proxy targets are supported until skeleton joint world transforms
are integrated. Results are optical approximations, not image sharpness tests.
"""
import math
from bai_camera import validate, sample, number

TARGETS={'face': (0.,2.4,0.),'chest':(0.,1.5,0.),'hips':(0.,1.,0.)}

def diagnose(project, frame, *, focal_mm=50., aperture=2.8, focus_m=4., target='face', coc_mm=.03):
    focal_mm=number(focal_mm,1,500);aperture=number(aperture,.5,64)
    focus_m=number(focus_m,.01,10000);coc_mm=number(coc_mm,.001,.1)
    if target not in TARGETS:raise ValueError('unknown focus target')
    f=focal_mm/1000; s=focus_m; c=coc_mm/1000
    if s<=f:raise ValueError('focus distance must exceed focal length')
    H=f*f/(aperture*c)+f
    near=H*s/(H+(s-f));far=math.inf if s>=H else H*s/(H-(s-f))
    pose=sample(project,frame)
    point=TARGETS[target]
    actual=math.dist(pose['position'],point)
    # The CoC threshold is a convention, not an absolute optical criterion.
    classification='within' if near<=actual<=far else ('front' if actual<near else 'back')
    return {'frame':frame,'target':target,'classification':classification,
            'inside':classification=='within','subject_distance_m':round(actual,5),
            'focus_distance_m':focus_m,'near_m':round(near,5),
            'far_m':round(far,5) if math.isfinite(far) else None,
            'hyperfocal_m':round(H,5), 'method':'proxy-distance-coc'}

def diagnose_range(project, start, end, *, step=1, **kwargs):
    p=validate(project)
    if any(isinstance(x,bool) or not isinstance(x,int) for x in (start,end,step)):
        raise ValueError('range requires integer frames and step')
    if not (0<=start<=end<=p['duration']) or step<1:raise ValueError('invalid focus frame range')
    count=(end-start)//step+1
    if count>10000:raise ValueError('range exceeds 10000 samples; increase step')
    samples=[diagnose(p,i,**kwargs) for i in range(start,end+1,step)]
    failures=[x['frame'] for x in samples if not x['inside']]
    intervals=[]
    for frame in failures:
        if intervals and frame-intervals[-1][1]==step:intervals[-1][1]=frame
        else:intervals.append([frame,frame])
    return {'sample_count':count,'failed_samples':len(failures),
            'failure_intervals':intervals,'samples':samples,
            'limits':'static proxy target; no bone animation or GPU sharpness analysis'}
