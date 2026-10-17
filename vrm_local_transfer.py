"""v0.16.26-28 conservative offline humanoid rotation transfer and quality gate.

Preview data only: no skin, VRM normalization, translation or VMD mutation.
"""
import json
import math
from animated_hierarchy_preview import preview as animated_source
from rest_hierarchy_inspection import inspect
from rest_pose_inspection import _read
from model_rest_skeleton import parse
from retarget_pose import qnorm, mul, conj


def _inverse(q):
    return conj(qnorm(q))


def _product(*qs):
    out=[0.,0.,0.,1.]
    for q in qs: out=qnorm(mul(out,qnorm(q)))
    return out


def transfer(source, target, clip=None, fps=30, confirmed=False, max_samples=2000):
    """Construct *provisional* target-local rotation keys from sampled source world rotations.

    Formula: worldTarget = worldTargetRest * (worldSourceRest^-1 * worldSourceAnimated).
    localTarget = worldTargetParentAnimated^-1 * worldTarget.
    All world quaternions must share handedness and basis; caller explicitly confirms.
    """
    if confirmed is not True:
        raise ValueError('explicit common-coordinate confirmation required')
    if source is target: pass
    if not 1 <= fps <= 120 or not isinstance(max_samples,int) or not 1 <= max_samples <= 2000:
        raise ValueError('invalid limits')
    hierarchy=animated_source(source,clip=clip,fps=fps,max_samples=max_samples)
    report=inspect(source,target)
    source_roles={r['role']:r['source'] for r in report['roles'] if r['source']}
    target_roles={r['role']:r['target'] for r in report['roles'] if r['target']}
    target_parents={r['role']:r['target'].get('parent_index',-1) for r in report['roles'] if r['target']}
    target_local=_read(target)
    target_nodes={b['index']:b for b in parse(target)['bones_detail']}
    # A humanoid parent may have intermediary non-humanoid nodes; target parent world rest
    # acts as a safe fallback for these unanimated bridge nodes.
    by_time={}
    for row in hierarchy['samples']:
        by_time.setdefault(row['time'],{})[row['role']]=row
    out=[];skipped=list(hierarchy['skipped']);warnings=list(hierarchy['warnings'])
    for t,rows in sorted(by_time.items()):
        world_target={}
        for role,row in rows.items():
            sr=source_roles.get(role); tr=target_roles.get(role)
            if not sr or not tr or sr.get('world_status')!='inspectable' or tr.get('world_status')!='inspectable':
                skipped.append({'time':t,'role':role,'reason':'missing or uncalibrated rest'});continue
            delta=_product(_inverse(sr['world_rest_xyzw']),row['source_world_rotation_xyzw'])
            world_target[role]=_product(tr['world_rest_xyzw'],delta)
        for role,q in world_target.items():
            item=target_roles[role]
            parent_idx=target_parents[role]
            # Current MVP only permits direct humanoid parent if animated; root parent
            # can use target rest world quaternion. Unknown intervening nodes are skipped.
            parent_role=next((name for name, entry in target_roles.items() if entry.get('node')==parent_idx),None)
            if parent_role in world_target:
                parent_world=world_target[parent_role]
            elif parent_role in target_roles:
                parent_world=target_roles[parent_role].get('world_rest_xyzw')
            elif parent_idx<0:
                parent_world=[0,0,0,1]
            else:
                skipped.append({'time':t,'role':role,'reason':'parent coordinate basis is not calibrated'});continue
            if parent_world is None:
                skipped.append({'time':t,'role':role,'reason':'parent world rest unavailable'});continue
            local=_product(_inverse(parent_world),q)
            if role not in target_local or target_local[role].get('status')!='read_only':
                skipped.append({'time':t,'role':role,'reason':'target local rest unavailable'});continue
            out.append({'time':t,'frame':row_frame(rows,role), 'role':role,
                        'target_node':item['node'], 'local_rotation_xyzw':local,
                        'status':'provisional_not_animated'})
            if len(out)>max_samples:raise ValueError('sample limit exceeded')
    return {'schema':1,'mode':'provisional_target_local_rotation_preview','clip':hierarchy['clip'],
            'samples':out,'skipped':skipped,'model_modified':False,'animation_applied':False,'vmd_written':False,
            'warnings':warnings+['Only source key times were sampled; no dense frame sampling, positions, scale or translation.',
                                'World-rest alignment is a simplifying assumption; skin inverse bind, VRM normalization and joint twist remain uncalibrated.',
                                'Target parent animation is derived only from available matching humanoid roles; other ancestors are rejected.']}


def row_frame(rows, role):return rows[role]['frame']


def quality(report):
    samples=report.get('samples',[]);skipped=report.get('skipped',[])
    if not isinstance(samples,list) or not isinstance(skipped,list):raise ValueError('invalid report')
    for s in samples:
        q=qnorm(s['local_rotation_xyzw'])
        if abs(sum(v*v for v in q)-1)>1e-5:raise ValueError('invalid rotation')
    issues=[]
    if skipped:issues.append('incomplete_bone_coverage')
    if not samples:issues.append('no_transfer_samples')
    issues.append('unverified_vrm_skinning_and_joint_basis')
    return {'schema':1,'quality_gate':'blocked_for_production','sample_count':len(samples),
            'skipped_count':len(skipped),'issues':issues,'suitable_for_vmd_export':False,
            'source_unchanged':report.get('model_modified') is False}
