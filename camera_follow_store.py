"""Validated, optional bone-follow configuration for camera project schema 1."""
import math
ROLES = ('head','neck','chest','hips')
def validate_follow(value):
    if not isinstance(value,dict):raise ValueError('bone_follow must be an object')
    name=value.get('boneName','')
    role=value.get('role','')
    offset=value.get('offset',[0,0,0])
    enabled=value.get('enabled',False)
    if not isinstance(name,str) or len(name)>256:raise ValueError('invalid bone name')
    if role not in (*ROLES,''):raise ValueError('invalid bone role')
    if not isinstance(offset,list) or len(offset)!=3 or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>10000 for x in offset):raise ValueError('invalid follow offset')
    if type(enabled) is not bool:raise ValueError('invalid follow enabled')
    return {'boneName':name,'role':role,'offset':[float(x) for x in offset],'enabled':enabled}
