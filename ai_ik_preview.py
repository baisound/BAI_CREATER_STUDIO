"""Validate Qwen constraints and create a non-destructive 2D IK preview.
This is NOT PMX/VRM retargeting or an automatic animation keyframe generator.
"""
from pose_ik import validate_pose

BONES = {'右腕':'rightArm','右手':'rightArm','rightArm':'rightArm',
         '左腕':'leftArm','左手':'leftArm','leftArm':'leftArm',
         '右脚':'rightLeg','右足':'rightLeg','rightLeg':'rightLeg',
         '左脚':'leftLeg','左足':'leftLeg','leftLeg':'leftLeg'}
DIRECTIONS = {'up':(0,0.15),'raise':(0,0.15),'上げる':(0,0.15),'持ち上げる':(0,0.15),
              'down':(0,-0.15),'lower':(0,-0.15),'下げる':(0,-0.15),
              'forward':(0.15,0),'前':(0.15,0),'前に出す':(0.15,0),
              'back':(-0.15,0),'後ろ':(-0.15,0),'後ろに引く':(-0.15,0),
              'hold':(0,0),'fix':(0,0),'固定':(0,0),'keep':(0,0)}

def preview(proposal, baseline):
    if not isinstance(proposal,dict) or not isinstance(proposal.get('constraints'),list):
        raise ValueError('invalid proposal')
    if not isinstance(baseline,dict): raise ValueError('baseline must be object')
    validated=validate_pose(baseline)
    result={'schema':1,'frame':validated['frame'],'limbs':{n:dict(c) for n,c in baseline.get('limbs',{}).items()}}
    accepted=[];ignored=[];seen=set()
    for c in proposal['constraints'][:30]:
        if not isinstance(c,dict):ignored.append('invalid constraint');continue
        bone=BONES.get(c.get('bone')) if isinstance(c.get('bone'),str) else None
        action=c.get('action')
        action=action.strip().lower() if isinstance(action,str) else None
        step=DIRECTIONS.get(action)
        if bone is None or bone not in result['limbs'] or step is None or bone in seen:
            ignored.append({'bone':str(c.get('bone',''))[:64],'action':str(action)[:64],'reason':'unsupported, absent or duplicate'});continue
        seen.add(bone)
        target=result['limbs'][bone]['target']
        result['limbs'][bone]['target']=[round(float(target[0])+step[0],6),round(float(target[1])+step[1],6)]
        accepted.append({'limb':bone,'action':action,'delta':list(step)})
    solved=validate_pose(result)
    return {'preview_only':True,'saved':False,'applied':False,'proposal':proposal,
            'accepted':accepted,'ignored':ignored,'pose_input':result,'solved':solved,
            'limitations':'2D proxy only. No real PMX/VRM joints, VMD keys or original files are modified.'}
