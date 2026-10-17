"""Phase B read-only end-to-end smoke gate, intentionally NOT a PMX/VRM approval.

Processes actual BVH bytes through FK foot sampling, contact/dual-foot preview,
BVH->VMD export, and binary readback. Does not modify original inputs.
"""
import hashlib
import json
import tempfile
from pathlib import Path

from bvh_foot_world import sample_bvh_foot_world
from dual_foot_plan import propose_dual_foot
from motion_vmd_bridge import convert
from vmd_readback import read_vmd_bones

REMAINING = [
    'FBX/GLB/VRM/PMX joint transforms and bind-pose correction not exercised by this BVH gate',
    'MMD/PMX real-model visual playback and orientation not validated',
    'No actual leg IK correction, planted foot constraints or correction writeback',
    'No retargeted VMD validated against target PMX bone definitions',
    'Browser UI, WebMCP and stdio MCP real-client invocation not exercised here',
]


def run_gate(source, left_joint, right_joint, bone_map, *, ground_y=0.0):
    source=Path(source)
    if source.suffix.lower()!='.bvh':
        raise ValueError('Phase B gate currently supports BVH only')
    raw=source.read_bytes()
    before=hashlib.sha256(raw).hexdigest()
    left=sample_bvh_foot_world(raw,left_joint)
    right=sample_bvh_foot_world(raw,right_joint)
    if [x['frame'] for x in left['samples']] != [x['frame'] for x in right['samples']]:
        raise ValueError('Foot samples do not share a frame timeline')
    dual=propose_dual_foot(left['samples'],right['samples'],ground_y=ground_y)
    with tempfile.TemporaryDirectory(prefix='bai-phase-b-qa-') as tmp:
        out=Path(tmp)/'smoke.vmd'
        exported=convert(source,bone_map,out)
        readback=read_vmd_bones(out)
        vmd_bytes=out.read_bytes()
    unchanged=hashlib.sha256(source.read_bytes()).hexdigest()==before
    if not unchanged:raise RuntimeError('Source BVH changed during read-only QA')
    passed = (exported['binary_readback']['status']=='passed_binary_roundtrip'
              and readback['bone_keys'] == exported['bone_keys']
              and bool(dual['frames']) and bool(vmd_bytes))
    return {
        'schema':1, 'phase':'B', 'gate':'BVH_TO_VMD_AND_FOOT_PREVIEW',
        'gate_status':'passed_limited_binary_and_diagnostic_checks' if passed else 'failed',
        'phase_b_status':'NOT_COMPLETE',
        'source':str(source),'source_sha256':before,'source_unchanged':unchanged,
        'source_units':'unverified','axis_orientation':'unverified',
        'observed':{'frames_sampled':left['sample_count'],
                    'left_contacts':len(dual['left']['contact_intervals']),
                    'right_contacts':len(dual['right']['contact_intervals']),
                    'left_sliding_frames':len(dual['left']['drift_frames']),
                    'right_sliding_frames':len(dual['right']['drift_frames']),
                    'conflict_frames':dual['conflict_frames'],
                    'vmd_bone_keys':readback['bone_keys'],
                    'vmd_sha256':hashlib.sha256(vmd_bytes).hexdigest(),
                    'vmd_binary_readback':exported['binary_readback']['status']},
        'blocking_unverified_items':REMAINING,
        'note':'Passing this smoke gate is NOT proof of PMX/VRM retargeting quality.'
    }


def main():
    import argparse
    p=argparse.ArgumentParser(description='Read-only Phase B smoke check')
    p.add_argument('--source',required=True);p.add_argument('--left',required=True);p.add_argument('--right',required=True)
    p.add_argument('--bone-map',required=True);p.add_argument('--report',required=True)
    p.add_argument('--ground-y',type=float,default=0)
    a=p.parse_args()
    report=run_gate(a.source,a.left,a.right,json.loads(Path(a.bone_map).read_text(encoding='utf-8')),ground_y=a.ground_y)
    dest=Path(a.report);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report['gate_status'].startswith('passed') else 1

if __name__=='__main__':
    raise SystemExit(main())
