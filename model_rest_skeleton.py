"""Read-only GLB/VRM joint rest positions; Blender-free and without mesh mutation.

Positions use glTF node TRS hierarchy in meters, not inverse bind matrices or
humanoid retarget correction. Skewed matrix nodes are supported via 4x4 products.
"""
import json, math, struct


def _mul(a,b):
    return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]


def _local(node):
    if 'matrix' in node:
        v=node['matrix']
        if len(v)!=16:return _err('Invalid glTF node matrix')
        return [float(v[c*4+r]) for r in range(4) for c in range(4)]
    t=node.get('translation',[0,0,0]);q=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1])
    if len(t)!=3 or len(q)!=4 or len(s)!=3:return _err('Invalid glTF TRS')
    x,y,z,w=map(float,q); norm=math.sqrt(x*x+y*y+z*z+w*w)
    if norm<1e-10:return _err('Zero glTF rotation quaternion')
    x,y,z,w=(v/norm for v in (x,y,z,w))
    rotation=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),
              2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),
              2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]
    return [rotation[r*3+c]*float(s[c]) if c<3 else float(t[r]) for r in range(3) for c in range(4)]+[0,0,0,1]


def _err(reason):raise ValueError(reason)


def parse(data):
    if len(data)<20 or data[:4]!=b'glTF':return _err('Invalid GLB header')
    magic,version,length=struct.unpack_from('<4sII',data)
    if version!=2 or length!=len(data):return _err('Invalid GLB size/version')
    chunk_len,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a or chunk_len>8_000_000 or 20+chunk_len>length:return _err('Invalid GLB JSON chunk')
    doc=json.loads(data[20:20+chunk_len].decode('utf-8'))
    nodes=doc.get('nodes',[])
    if len(nodes)>50000:return _err('Excessive nodes')
    parent=[-1]*len(nodes)
    for i,node in enumerate(nodes):
        for ch in node.get('children',[]):
            if not isinstance(ch,int) or not 0<=ch<len(nodes):return _err('Invalid glTF child index')
            if parent[ch]!=-1:return _err('Ambiguous glTF parent')
            parent[ch]=i
    rest=[None]*len(nodes);visiting=set()
    def world(i):
        if rest[i] is not None:return rest[i]
        if i in visiting:return _err('Cyclic glTF node hierarchy')
        visiting.add(i);local=_local(nodes[i]);rest[i]=_mul(world(parent[i]),local) if parent[i]>=0 else local
        visiting.remove(i);return rest[i]
    joints=set()
    for skin in doc.get('skins',[]):
        for i in skin.get('joints',[]):
            if not isinstance(i,int) or not 0<=i<len(nodes):return _err('Invalid glTF skin joint')
            joints.add(i)
    human={}
    vrm1=doc.get('extensions',{}).get('VRMC_vrm',{}).get('humanoid',{}).get('humanBones',{})
    for role,entry in vrm1.items():
        if isinstance(entry,dict) and isinstance(entry.get('node'),int):human[entry['node']]=role
    vrm0=doc.get('extensions',{}).get('VRM',{}).get('humanoid',{}).get('humanBones',[])
    for entry in vrm0:
        if isinstance(entry,dict) and isinstance(entry.get('node'),int):human[entry['node']]=entry.get('bone','')
    details=[]
    for i in sorted(joints|set(human)):
        if not 0<=i<len(nodes):return _err('Invalid VRM humanoid node')
        m=world(i)
        if not all(math.isfinite(v) for v in m):return _err('Non-finite glTF transform')
        details.append({'index':i,'name':nodes[i].get('name',f'node_{i}'),
                        'parent_index':parent[i],'position':[m[3],m[7],m[11]],
                        'local_translation':list(nodes[i].get('translation',[0,0,0])),
                        'humanoid_role':human.get(i), 'skin_joint':i in joints})
    return {'bones_detail':details,'humanoid_roles':{v['humanoid_role']:v['index'] for v in details if v['humanoid_role']},
            'joint_count':len(joints),'unit':'meters','coordinate_system':'glTF Y-up',
            'warnings':['World rest positions do not account for inverseBindMatrices, target bone axes or PMX scale.']}
