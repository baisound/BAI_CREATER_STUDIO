"""Safe GLB clip rotation keys -> source rest delta -> world-rest numeric preview.
No model mutation, no retargeted local joint animation output.
"""
import json, struct
from motion_interchange import glb_channels
from model_rest_skeleton import parse
from rest_pose_inspection import _read
from rest_hierarchy_inspection import inspect
from retarget_pose import qnorm, mul, conj
from rest_rotation_transfer import preview as numeric_preview


def preview(source_bytes, target_bytes, clip=None, fps=30, confirmed=False, max_samples=2000):
    if confirmed is not True:
        raise ValueError('common glTF coordinate convention confirmation is required')
    if type(fps) not in (int,float) or not 1 <= fps <= 120:
        raise ValueError('fps must be between 1 and 120')
    if type(max_samples) is not int or not 1 <= max_samples <= 2000:
        raise ValueError('max_samples invalid')
    source_roles = parse(source_bytes)['bones_detail']
    role_by_index = {b['index']: b['humanoid_role'] for b in source_roles if b.get('humanoid_role')}
    local_rests = _read(source_bytes)
    report = inspect(source_bytes,target_bytes)
    pairs = {}
    for row in report['roles']:
        if row['status'] != 'review_required':
            continue
        src,dst = row['source'],row['target']
        pairs[row['role']] = {'source_rest_xyzw':src['world_rest_xyzw'], 'target_rest_xyzw':dst['world_rest_xyzw'], 'target_bone':dst['name']}
    channels = glb_channels(source_bytes)['channels']
    clips = sorted({c['clip'] for c in channels})
    if clip is None:
        if len(clips)!=1:raise ValueError('specify clip when source has zero or multiple clips')
        clip=clips[0]
    if clip not in clips:raise ValueError('clip not found')
    samples=[]; warnings=[]; skipped=[]; seen=set()
    for channel in channels:
        if channel['clip']!=clip or channel['path']!='rotation':continue
        role=role_by_index.get(channel['node_index'])
        if not role or role not in pairs or role not in local_rests:
            skipped.append({'node':channel['node'],'reason':'unmapped_or_uncalibrated'});continue
        rest=qnorm(local_rests[role]['local_rest_xyzw'])
        for key in channel['keys']:
            frame=round(key['time']*fps)
            unique=(role,frame)
            if unique in seen:
                raise ValueError('multiple keys collide at output frame; choose higher fps or preprocess clip')
            seen.add(unique)
            # Local animated rotation relative to source local rest: q_anim * q_rest^-1.
            delta=qnorm(mul(qnorm(key['value']),conj(rest)))
            samples.append({'role':role,'frame':frame,'rotation_xyzw':delta})
            if len(samples)>max_samples:raise ValueError('animation exceeds max_samples; select a shorter clip')
    result=numeric_preview({'coordinate_convention_confirmed':True,'rest_pairs':pairs,'samples':samples})
    result.update({'mode':'glb_clip_world_rest_numeric_preview','clip':clip,'fps':fps,
                   'source_rotation_keys':len(samples),'skipped_channels':skipped,
                   'source_animation_applied':False,'target_animation_applied':False,'model_modified':False,'vmd_written':False,
                   'warnings': result['warnings']+report['warnings']+[
                       'Source local animation keys were converted to source local rest-relative deltas; output remains an approximate numeric world-rest comparison only.',
                       'Parent animation transforms, local target joint frames, normalized VRM humanoid, IK and actual mesh animation remain unsolved.',
                       'Sampling converts times to frame indices; this is NOT resampling/interpolation of an animation.']})
    return result
