"""Deterministic two-segment IK, 2D world-plane (XY), no AI dependency."""
import math

def solve(base, target, upper, lower, bend=1):
    if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (*base,*target,upper,lower,bend)):
        raise ValueError('finite numeric values required')
    if upper<=0 or lower<=0 or upper>100 or lower>100 or bend not in (-1,1):
        raise ValueError('invalid lengths or bend')
    dx=target[0]-base[0];dy=target[1]-base[1]
    dist=math.hypot(dx,dy)
    near=abs(upper-lower)+1e-5;far=upper+lower-1e-5
    clamped=max(near,min(far,dist))
    theta=math.atan2(dy,dx) if dist>1e-10 else 0.0
    c=(upper*upper+clamped*clamped-lower*lower)/(2*upper*clamped)
    delta=math.acos(max(-1,min(1,c)))*bend
    joint=[base[0]+upper*math.cos(theta+delta),base[1]+upper*math.sin(theta+delta)]
    endpoint=[base[0]+dx/dist*clamped,base[1]+dy/dist*clamped] if dist>1e-10 else [base[0]+clamped,base[1]]
    return {'base':list(base),'joint':joint,'end':endpoint,'requested':list(target),'reachable':abs(clamped-dist)<1e-4,'distance_error':abs(clamped-dist), 'upper':upper,'lower':lower,'bend':bend}

def validate_pose(p):
    if not isinstance(p,dict):raise ValueError('pose must be object')
    result={'schema':1,'frame':int(p.get('frame',0)),'limbs':{}}
    if not 0<=result['frame']<=1000000:raise ValueError('frame out of bounds')
    limbs=p.get('limbs',{})
    if not isinstance(limbs,dict) or len(limbs)>4:raise ValueError('invalid limbs')
    for name,config in limbs.items():
        if name not in ('leftArm','rightArm','leftLeg','rightLeg') or not isinstance(config,dict):raise ValueError('invalid limb')
        base=config.get('base');target=config.get('target')
        if not isinstance(base,list) or not isinstance(target,list) or len(base)!=2 or len(target)!=2:raise ValueError('invalid coordinates')
        result['limbs'][name]=solve(base,target,float(config.get('upper',0.5)),float(config.get('lower',0.5)),int(config.get('bend',1)))
    return result
