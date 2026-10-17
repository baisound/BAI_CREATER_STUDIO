"""Read-only VRM humanoid local rest rotation comparison.

This exposes metadata for review, NOT a verified retarget coordinate basis.
"""
import math
from model_rest_skeleton import parse, _local
from retarget_pose import qnorm


def _rotation_from_matrix(m):
    # Recover orientation only if the transform is approximately a proper
    # orthogonal rotation times uniform positive scale; reject shear/reflection.
    c=[[m[r*4+i] for r in range(3)] for i in range(3)]
    lengths=[math.sqrt(sum(v*v for v in col)) for col in c]
    if min(lengths)<1e-9 or max(lengths)/min(lengths)>1.0001:
        raise ValueError('non-uniform/zero matrix scale requires manual calibration')
    u=[[v/lengths[i] for v in c[i]] for i in range(3)]
    if max(abs(sum(u[i][r]*u[j][r] for r in range(3))) for i in range(3) for j in range(i+1,3))>1e-4:
        raise ValueError('sheared matrix requires manual calibration')
    det=(u[0][0]*(u[1][1]*u[2][2]-u[1][2]*u[2][1]) -u[1][0]*(u[0][1]*u[2][2]-u[0][2]*u[2][1])+u[2][0]*(u[0][1]*u[1][2]-u[0][2]*u[1][1]))
    if det<0.999:raise ValueError('reflected matrix requires manual calibration')
    a,b,c0=u
    R=[[a[0],b[0],c0[0]],[a[1],b[1],c0[1]],[a[2],b[2],c0[2]]]
    tr=sum(R[i][i] for i in range(3))
    if tr>0:
        s=math.sqrt(tr+1)*2; q=[(R[2][1]-R[1][2])/s,(R[0][2]-R[2][0])/s,(R[1][0]-R[0][1])/s,s/4]
    else:
        i=max(range(3),key=lambda k:R[k][k]);j=(i+1)%3;k=(i+2)%3
        s=math.sqrt(max(0,1+R[i][i]-R[j][j]-R[k][k]))*2
        q=[0.,0.,0.,(R[k][j]-R[j][k])/s];q[i]=s/4;q[j]=(R[j][i]+R[i][j])/s;q[k]=(R[k][i]+R[i][k])/s
    return qnorm(q)


def _read(data):
    result=parse(data)
    # Parser validates GLB and node tree. Separate local transform inspection,
    # avoiding world matrices that can contain ancestor scale/shear.
    import json,struct
    count,=struct.unpack_from('<I',data,12)
    doc=json.loads(data[20:20+count])
    out={}
    for b in result['bones_detail']:
        role=b['humanoid_role']
        if not role:continue
        node=doc['nodes'][b['index']]
        try:
            q=_rotation_from_matrix(_local(node)) if 'matrix' in node else qnorm(node.get('rotation',[0,0,0,1]))
            info={'role':role,'name':b['name'],'node':b['index'],'parent_index':b['parent_index'],'local_rest_xyzw':q,'status':'read_only'}
        except (ValueError,TypeError,OverflowError) as e:
            info={'role':role,'name':b['name'],'node':b['index'],'status':'manual_calibration_required','reason':str(e)}
        if role in out: raise ValueError('duplicate humanoid role: '+role)
        out[role]=info
    return out


def compare(source_data,target_data):
    src=_read(source_data);dst=_read(target_data)
    roles=[]
    for role in sorted(set(src)|set(dst)):
        a=src.get(role);b=dst.get(role)
        status=('missing_source' if not a else 'missing_target' if not b else
                'manual_calibration_required' if a['status']!='read_only' or b['status']!='read_only' else 'review_required')
        roles.append({'role':role,'source':a,'target':b,'status':status})
    return {'schema':1,'mode':'read_only_local_rest_inspection','roles':roles,
      'common_coordinate_convention_confirmed':False,'model_modified':False,'animation_applied':False,
      'warnings':['Local glTF node quaternions are not a common-world orientation and MUST NOT be fed directly into explicit-rest rotation transfer.',
                  'Parent rest transforms, skin inverse-bind matrices, humanoid normalization, twist and coordinate frame remain uncalibrated.']}
