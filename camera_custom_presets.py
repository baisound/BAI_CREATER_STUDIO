"""Validated project-local custom camera shot presets (Phase E CAM-006)."""
from bai_camera import number

def validate_presets(value):
    if not isinstance(value, list) or len(value)>64:
        raise ValueError('custom camera presets must be a list of at most 64')
    out=[]; seen=set()
    for item in value:
        if not isinstance(item,dict): raise ValueError('invalid custom camera preset')
        name=item.get('name')
        if not isinstance(name,str) or not 1<=len(name.strip())<=48 or name.strip() in seen:
            raise ValueError('invalid or duplicate preset name')
        name=name.strip();seen.add(name)
        pose=item.get('pose')
        if not isinstance(pose,dict):raise ValueError('invalid preset camera pose')
        parsed={'fov':number(pose.get('fov'),5,150)}
        for field in ('position','target'):
            xyz=pose.get(field)
            if not isinstance(xyz,list) or len(xyz)!=3:raise ValueError('invalid preset vector')
            parsed[field]=[number(x,-10000,10000) for x in xyz]
        if sum((a-b)**2 for a,b in zip(parsed['position'],parsed['target']))<1e-8:
            raise ValueError('preset camera and target coincide')
        out.append({'name':name,'pose':parsed})
    return out
