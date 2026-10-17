"""Explicit-rest quaternion delta conversion; no implicit orientation inference.

The supplied source and target rest orientations MUST be expressed in a common
reference frame. Mapping from each rig's actual local parent frame to that common
frame remains the caller's responsibility. This is a non-destructive preview.
"""
import math
from retarget_pose import qnorm, mul, conj


def preview(payload):
    if not isinstance(payload, dict):
        raise ValueError('payload must be an object')
    profiles = payload.get('rest_pairs')
    samples = payload.get('samples')
    if not isinstance(profiles, dict) or len(profiles) > 512:
        raise ValueError('rest_pairs must be an object of at most 512 roles')
    if not isinstance(samples, list) or len(samples) > 20000:
        raise ValueError('samples must be an array of at most 20000 entries')
    if payload.get('coordinate_convention_confirmed') is not True:
        raise ValueError('explicit common-coordinate-convention confirmation required')
    pairs = {}
    for role, entry in profiles.items():
        if not isinstance(role,str) or not role or len(role)>100 or not isinstance(entry,dict):
            raise ValueError('invalid bone role/rest pair')
        src = qnorm(entry['source_rest_xyzw'])
        dst = qnorm(entry['target_rest_xyzw'])
        name = entry.get('target_bone',role)
        if not isinstance(name,str) or not name or len(name)>128:
            raise ValueError('invalid target bone')
        # Maps source local delta into target local frame when rest quaternions
        # are both expressed relative to the same coordinate system.
        basis = qnorm(mul(conj(dst),src))
        pairs[role] = (name,basis)
    out=[]
    for sample in samples:
        if not isinstance(sample,dict) or not isinstance(sample.get('role'),str):
            raise ValueError('invalid sample role')
        role=sample['role']
        frame=sample.get('frame')
        if type(frame) is not int or not 0<=frame<=1_000_000:
            raise ValueError('invalid frame')
        rotation=qnorm(sample['rotation_xyzw'])
        if role not in pairs:
            out.append({'role':role,'frame':frame,'status':'unmapped'})
            continue
        name,basis=pairs[role]
        converted=qnorm(mul(mul(basis,rotation),conj(basis)))
        out.append({'role':role,'target_bone':name,'frame':frame,
                    'source_rotation_xyzw':rotation,'target_rotation_xyzw':converted,
                    'status':'explicit_rest_preview'})
    return {'schema':1,'mode':'preview_only_explicit_rest_quaternion',
            'samples':out,'model_modified':False,'vmd_written':False,
            'warnings':['Rest quaternions must be provided in one common reference frame; no parent-hierarchy conversion is inferred.',
                        'Inverse bind matrices, skeletal twist, PMX bone orientations and animation interpolation are not validated.',
                        'This endpoint does not write or apply an animation.']}
