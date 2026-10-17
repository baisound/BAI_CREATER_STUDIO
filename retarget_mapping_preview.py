"""Strict, read-only application of user-approved bone maps to supplied quaternion samples.
No rest-pose conversion, skinning, actual model mutation, or VMD write happens here.
"""
from retarget_pose import qnorm

def preview(mapping, samples, source_bones, target_bones):
    if not isinstance(mapping,dict) or len(mapping)>200 or not isinstance(samples,list) or len(samples)>20000:
        raise ValueError('invalid mapping or samples')
    s=set(source_bones); t=set(target_bones)
    if not all(isinstance(x,str) and x in s and isinstance(y,str) and y in t for x,y in mapping.items()):
        raise ValueError('mapping contains nonexistent bones')
    if len(set(mapping.values()))!=len(mapping):raise ValueError('duplicate target bone')
    result=[];unmapped=[]
    for sample in samples:
        if not isinstance(sample,dict) or not isinstance(sample.get('bone'),str):raise ValueError('invalid sample')
        bone=sample['bone']
        if bone not in s:raise ValueError('source bone not in skeleton')
        if bone not in mapping:
            unmapped.append(bone);continue
        frame=sample.get('frame')
        if not isinstance(frame,int) or isinstance(frame,bool) or not 0<=frame<=1000000:raise ValueError('invalid frame')
        quat=qnorm(sample.get('rotation_xyzw'))
        result.append({'bone':mapping[bone],'source_bone':bone,'frame':frame,'rotation_xyzw':quat,'status':'provisional_raw_rotation'})
    return {'schema':1,'status':'mapping_preview_only','mapped_samples':result,'unmapped_bones':sorted(set(unmapped)),
            'source_sample_count':len(samples),'mapped_sample_count':len(result),
            'applied_to_model':False,'vmd_exported':False,
            'warnings':['Bone names are mapped, but raw quaternion axes and rest-pose differences are NOT corrected.',
                        'Preview only: manually validate axes, bind pose, scaling and twist before any animation export.']}
