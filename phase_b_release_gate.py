"""Phase B strict release gate; evidence is not the same as feature implementation.

Do not infer production readiness from unit tests or existence of preview UI.
"""
from __future__ import annotations
import json
import math
from pathlib import Path

REQUIRED = (
    'vrm_browser_skinning_e2e',
    'source_target_frame_sync_e2e',
    'rest_axes_and_twist_calibrated',
    'pmx_target_retarget_e2e',
    'vmd_export_reimport_in_mmd_e2e',
    'foot_ik_contact_e2e',
    'manual_ui_e2e',
    'webmcp_e2e',
    'stdio_mcp_e2e',
)


def evaluate(evidence: dict) -> dict:
    if not isinstance(evidence, dict):
        raise ValueError('evidence must be an object')
    unknown=set(evidence)-set(REQUIRED)
    if unknown:
        raise ValueError('unknown evidence keys: ' + ','.join(sorted(unknown)))
    for key,value in evidence.items():
        if type(value) is not bool:
            raise ValueError(f'{key} must be a boolean backed by a test report')
    blocked=[k for k in REQUIRED if evidence.get(k) is not True]
    return {
        'schema': 1, 'phase': 'B', 'version': '0.16.40',
        'gate': 'pass' if not blocked else 'blocked',
        'production_ready': not blocked,
        'missing_evidence': blocked,
        'verified_items': [k for k in REQUIRED if evidence.get(k) is True],
        'notes': 'Positive evidence must be backed by a reproducible test on actual assets. No implicit success.',
    }


def assess_review(review: dict) -> dict:
    """Conservative safety review for candidate JSON (NEVER enable VMD on this basis)."""
    if not isinstance(review,dict) or review.get('kind')!='BAI_UNVERIFIED_KEYFRAME_REVIEW':
        raise ValueError('only unverified keyframe review JSON is accepted')
    if review.get('animation_applied') is not False or review.get('vmd_export_allowed') is not False:
        raise ValueError('unverified review must not claim application or export')
    keys=review.get('keys')
    if not isinstance(keys,list) or len(keys)>2000:raise ValueError('invalid key array')
    issues=[];unique=set();prev={}
    for k in keys:
        if not isinstance(k,dict):raise ValueError('invalid key item')
        f=k.get('frame'); role=k.get('role'); q=k.get('rotation_xyzw')
        if type(f) is not int or f<0 or not isinstance(role,str) or not role:
            raise ValueError('invalid key metadata')
        if not isinstance(q,list) or len(q)!=4 or any(type(x) not in (int,float) or not math.isfinite(x) for x in q):
            raise ValueError('invalid rotation')
        mag=math.sqrt(sum(x*x for x in q))
        if abs(mag-1)>0.001: issues.append({'frame':f,'role':role,'code':'rotation_not_normalized'})
        if (f,role) in unique:issues.append({'frame':f,'role':role,'code':'duplicate_frame_role'})
        unique.add((f,role))
        if role in prev:
            pf,pq=prev[role]
            if f>pf:
                dot=min(1.,abs(sum(a*b for a,b in zip(q,pq))))
                degrees=math.degrees(2*math.acos(dot))
                if degrees/(f-pf)>70:
                    issues.append({'frame':f,'role':role,'code':'extreme_rotation_per_frame','degrees_per_frame':round(degrees/(f-pf),2)})
        prev[role]=(f,q)
    return {'schema':1,'version':'0.16.40','key_count':len(keys),'candidate_issues':issues,
            'production_ready':False,'vmd_export_allowed':False,
            'reason':'Unverified animation preview: real-model and foot-IK evidence required.'}


def write_report(path, gate, review=None):
    destination=Path(path)
    if destination.exists():raise FileExistsError('refusing to overwrite a report')
    if destination.suffix.lower()!='.json':raise ValueError('report must have .json extension')
    destination.parent.mkdir(parents=True,exist_ok=True)
    payload={'gate':gate,'keyframe_review':review}
    with destination.open('x',encoding='utf-8') as f: json.dump(payload,f,ensure_ascii=False,indent=2)
    return str(destination)
