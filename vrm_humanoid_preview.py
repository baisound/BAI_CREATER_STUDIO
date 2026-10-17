"""Read-only VRM humanoid role matcher. No inferred rest/twist correction."""
from model_rest_skeleton import parse

REQUIRED = ('hips','spine','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot')

def compare_vrm_humanoid(source_data, target_data):
    src = parse(source_data)
    dst = parse(target_data)
    a = {entry['humanoid_role']: entry for entry in src['bones_detail'] if entry.get('humanoid_role')}
    b = {entry['humanoid_role']: entry for entry in dst['bones_detail'] if entry.get('humanoid_role')}
    if not a or not b:
        raise ValueError('Both inputs need VRM humanoid roles; GLB-only skeletons require manual mapping')
    shared = sorted(set(a)&set(b))
    pairs = [{'role':role,'source_node':a[role]['index'],'target_node':b[role]['index'],
              'source_bone':a[role]['name'],'target_bone':b[role]['name'],
              'source_rest_position':a[role]['position'],'target_rest_position':b[role]['position'],
              'status':'mapped_role_rest_rotation_unverified'} for role in shared]
    return {'schema':1,'mode':'read_only_vrm_humanoid_matching','pairs':pairs,
            'missing_in_source':sorted(set(b)-set(a)), 'missing_in_target':sorted(set(a)-set(b)),
            'missing_required_roles':sorted(set(REQUIRED)-set(shared)),
            'safe_for_animation_transfer':False,'model_modified':False,
            'warnings':['VRM roles are paired, but local rest-bone orientations, axis twists, and inverse bind matrices have not been resolved.',
                        'No bone rotations, mesh skinning, IK, or VMD export are applied.']}
