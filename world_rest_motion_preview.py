"""Strict non-destructive numeric motion preview from explicit GLB world rest orientations."""
from rest_hierarchy_inspection import inspect
from rest_rotation_transfer import preview as explicit_preview


def preview(source_data, target_data, samples, confirmed=False):
    if confirmed is not True:
        raise ValueError('common glTF coordinate convention confirmation is required')
    if not isinstance(samples, list) or len(samples)>2000:
        raise ValueError('samples must be an array of at most 2000 entries')
    report = inspect(source_data, target_data)
    pairs={}
    skipped=[]
    for row in report['roles']:
        if row['status']!='review_required':
            skipped.append({'role':row['role'],'reason':row['status']})
            continue
        a,b=row['source'],row['target']
        pairs[row['role']]={'source_rest_xyzw':a['world_rest_xyzw'],
                             'target_rest_xyzw':b['world_rest_xyzw'],
                             'target_bone':b['name']}
    result=explicit_preview({'coordinate_convention_confirmed':True,'rest_pairs':pairs,'samples':samples})
    result.update({'schema':1,'mode':'world_rest_numeric_motion_preview',
        'eligible_roles':len(pairs),'skipped_roles':skipped,
        'source_animation_applied':False,'target_animation_applied':False,
        'warnings': report['warnings']+[
        'This is a world-rest basis numeric approximation, NOT target local joint rotation, IK, or runnable retarget animation.',
        'Source samples must be rotation DELTAS in glTF-compatible coordinates (xyzw), NOT absolute keyframe rotations.',
        'Do not apply the output quaternions directly to VRM nodes: parent local frames, inverse bind and humanoid normalization are unresolved.']})
    return result
