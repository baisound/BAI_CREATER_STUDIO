"""Read-only rest rotation inspection with ancestor transforms included.

World rest quaternions are inspectable orientation metadata, NOT a solved
humanoid retarget basis, VMD rotation, or direct skin animation.
"""
from model_rest_skeleton import parse, _local, _mul
from rest_pose_inspection import _rotation_from_matrix, _read
import json, struct


def inspect(source_data, target_data):
    def examine(data):
        baseline = _read(data)
        parsed = parse(data)
        chunk_len, = struct.unpack_from('<I', data, 12)
        doc = json.loads(data[20:20 + chunk_len])
        nodes = doc.get('nodes', [])
        parent = [-1] * len(nodes)
        for i, node in enumerate(nodes):
            for j in node.get('children', []):
                parent[j] = i
        cache = {}
        def world(i):
            if i not in cache:
                mat = _local(nodes[i])
                cache[i] = _mul(world(parent[i]), mat) if parent[i] >= 0 else mat
            return cache[i]
        result = {}
        for bone in parsed['bones_detail']:
            role = bone['humanoid_role']
            if not role:
                continue
            entry = dict(baseline[role])
            try:
                entry['world_rest_xyzw'] = _rotation_from_matrix(world(bone['index']))
                entry['world_status'] = 'inspectable'
            except (ValueError, TypeError, OverflowError) as e:
                entry['world_rest_xyzw'] = None
                entry['world_status'] = 'manual_calibration_required'
                entry['world_reason'] = str(e)
            result[role] = entry
        return result
    src, dst = examine(source_data), examine(target_data)
    pairs = []
    for role in sorted(set(src) | set(dst)):
        a,b=src.get(role),dst.get(role)
        status='missing_source' if a is None else 'missing_target' if b is None else ('review_required' if a.get('world_status') == 'inspectable' and b.get('world_status') == 'inspectable' else 'manual_calibration_required')
        pairs.append({'role':role,'source':a,'target':b,'status':status})
    return {'schema':1,'mode':'read_only_parent_hierarchy_rest_inspection','roles':pairs,
            'animation_applied':False,'model_modified':False,'vmd_written':False,
            'warnings':['World rest quaternion includes glTF ancestor transforms, but does not solve target local animation frame, humanoid normalization, inverseBindMatrices, PMX axes or twist.',
                        'Mirrored, sheared or non-uniformly scaled hierarchy is marked for manual calibration; no automatic animation application.']}
