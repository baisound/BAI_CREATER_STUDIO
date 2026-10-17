"""Non-destructive root trajectory normalization; input units must be calibrated."""
import math

def convert_root_samples(samples, scale, yaw_offset_deg=0, origin=(0,0,0), target_origin=(0,0,0)):
    if not isinstance(scale,(int,float)) or not math.isfinite(scale) or scale<=0 or scale>1000: raise ValueError('invalid scale')
    if not isinstance(yaw_offset_deg,(int,float)) or not math.isfinite(yaw_offset_deg):raise ValueError('invalid yaw')
    if len(samples)>100000:raise ValueError('too many samples')
    t=math.radians(yaw_offset_deg);cs,sn=math.cos(t),math.sin(t)
    out=[]
    for s in samples:
        p=s['position']
        if len(p)!=3 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p):raise ValueError('invalid position')
        x,y,z=[(p[i]-origin[i])*scale for i in range(3)]
        out.append({'frame':s['frame'],'position':[target_origin[0]+x*cs-z*sn,target_origin[1]+y,target_origin[2]+x*sn+z*cs]})
    return out
