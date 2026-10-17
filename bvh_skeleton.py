"""Bounded, read-only BVH rest skeleton parser; no implicit axis conversion."""
import math
import re

_NAME = re.compile(r'^(ROOT|JOINT)\s+(.+)$')
_OFFSET = re.compile(r'^OFFSET\s+(.+)$')

def parse_bvh_skeleton(data, max_bones=5000):
    lines = data.decode('utf-8-sig', errors='replace').splitlines()
    stack = []
    pending = None
    bones = []
    end_sites = 0
    motion_found = False
    for raw in lines:
        line = raw.strip()
        if line == 'MOTION':
            motion_found = True
            break
        if not line:
            continue
        m = _NAME.match(line)
        if m:
            if pending is not None:
                raise ValueError('BVH nested declaration without opening brace')
            pending = ('bone', m.group(2).strip())
            continue
        if line == 'End Site':
            pending = ('end', '')
            continue
        if line == '{':
            if pending is None:
                raise ValueError('Unexpected BVH open brace')
            kind, name = pending
            pending = None
            parent = next((v for v in reversed(stack) if v is not None), None)
            if kind == 'bone':
                if len(bones) >= max_bones:
                    raise ValueError('Too many BVH bones')
                idx = len(bones)
                bones.append({'name': name, 'parent_index': parent, 'offset': None, 'position': None})
                stack.append(idx)
            else:
                end_sites += 1
                stack.append(None)
            continue
        if line == '}':
            if not stack:
                raise ValueError('Unbalanced BVH hierarchy')
            stack.pop()
            continue
        m = _OFFSET.match(line)
        if m and stack:
            vals = [float(v) for v in m.group(1).split()]
            if len(vals) != 3 or not all(math.isfinite(v) for v in vals):
                raise ValueError('Invalid BVH OFFSET')
            idx = stack[-1]
            if idx is not None:
                parent = bones[idx]['parent_index']
                origin = bones[parent]['position'] if parent is not None else [0., 0., 0.]
                if origin is None:
                    raise ValueError('Parent BVH OFFSET missing')
                bones[idx]['offset'] = vals
                bones[idx]['position'] = [origin[k] + vals[k] for k in range(3)]
    if not motion_found or stack or pending:
        raise ValueError('Incomplete BVH hierarchy')
    if any(b['position'] is None for b in bones):
        raise ValueError('BVH bone OFFSET missing')
    return {'bones_detail': bones, 'end_sites': end_sites, 'axis_convention': 'BVH source local axes, no conversion', 'rest_pose_status': 'offset_derived_unverified'}
