"""合成テストモデル（tests/fixtures/synthetic_test_model.glb と .expected.json）を生成する。

仕様は docs/roadmap/PHASE_E_DETAILED_DESIGN_20261020_JA.md §2.9「テスト用モデル（2-B1）」。
標準ライブラリだけで動く。使い方: python3 tools/make_test_glb.py [出力ディレクトリ]
"""
import json
import math
import struct
import sys
from pathlib import Path

FPS = 30
FRAMES = 30
BOX_MIN = (-0.25, 0.0, -0.15)
BOX_MAX = (0.25, 2.0, 0.15)

# 名前, 親, ワールド座標（仕様の固定値）
BONES = [
    ('hips', None, (0.0, 1.0, 0.0)),
    ('spine', 'hips', (0.0, 1.2, 0.0)),
    ('chest', 'spine', (0.0, 1.45, 0.0)),
    ('head', 'chest', (0.0, 1.75, 0.0)),
    ('eye_l', 'head', (0.04, 1.85, 0.1)),
    ('eye_r', 'head', (-0.04, 1.85, 0.1)),
    ('hand_l', 'chest', (0.4, 1.0, 0.0)),
    ('hand_r', 'chest', (-0.4, 1.0, 0.0)),
    ('foot_l', 'hips', (0.1, 0.05, 0.0)),
    ('foot_r', 'hips', (-0.1, 0.05, 0.0)),
]
NAMES = [b[0] for b in BONES]
WORLD = {b[0]: b[2] for b in BONES}
PARENT = {b[0]: b[1] for b in BONES}


def local_of(name):
    parent = PARENT[name]
    if parent is None:
        return WORLD[name]
    return tuple(round(WORLD[name][i] - WORLD[parent][i], 9) for i in range(3))


def _vertices():
    (x0, y0, z0), (x1, y1, z1) = BOX_MIN, BOX_MAX
    return [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]


def _indices():
    # 頂点番号 = x(0/1)*4 + y(0/1)*2 + z(0/1)。各面を外向きの三角形2枚にする
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    tris = []
    for a, b, c, d in quads:
        tris += [(a, b, c), (a, c, d)]
    return tris


def _head_rot(frame):
    angle = math.radians(30.0) * frame / FRAMES
    return (0.0, math.sin(angle / 2), 0.0, math.cos(angle / 2))


def _hips_z(frame):
    return 0.5 * (1.0 - abs(frame - 15) / 15.0)


def _rot_y(angle, v):
    c, s = math.cos(angle), math.sin(angle)
    return (c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2])


def expected():
    """各フレームのボーンのワールド座標と包囲箱。"""
    frames = {}
    for f in range(FRAMES + 1):
        dz = _hips_z(f)
        theta = math.radians(30.0) * f / FRAMES
        pos = {}
        for n in NAMES:
            w = WORLD[n]
            if n in ('eye_l', 'eye_r'):
                h = WORLD['head']
                r = _rot_y(theta, tuple(w[i] - h[i] for i in range(3)))
                w = tuple(h[i] + r[i] for i in range(3))
            pos[n] = [round(w[0], 9), round(w[1], 9), round(w[2] + dz, 9)]
        frames[str(f)] = {
            'bones': pos,
            'bbox': {'min': [BOX_MIN[0], BOX_MIN[1], BOX_MIN[2] + dz], 'max': [BOX_MAX[0], BOX_MAX[1], BOX_MAX[2] + dz]},
        }
    return {
        'fps': FPS, 'frames': FRAMES, 'height': 2.0,
        'scale': 1.0, 'offset': [0.0, 0.0, 0.0],
        'catalogName': '合成テストモデル.glb',
        'forward': '+Z', 'left': '+X',
        'rest': {n: list(WORLD[n]) for n in NAMES},
        'perFrame': frames,
    }


def build_glb():
    bin_parts = []
    views = []
    accessors = []

    def add(data, target=None, **acc):
        while len(b''.join(bin_parts)) % 4:
            bin_parts.append(b'\0')
        offset = len(b''.join(bin_parts))
        bin_parts.append(data)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target:
            view['target'] = target
        views.append(view)
        accessors.append(dict(bufferView=len(views) - 1, **acc))
        return len(accessors) - 1

    verts = _vertices()
    pos = add(b''.join(struct.pack('<3f', *v) for v in verts), 34962, componentType=5126, count=8, type='VEC3',
              min=list(BOX_MIN), max=list(BOX_MAX))
    joints = add(b''.join(struct.pack('<4B', 0, 0, 0, 0) for _ in verts), 34962, componentType=5121, count=8, type='VEC4')
    weights = add(b''.join(struct.pack('<4f', 1.0, 0.0, 0.0, 0.0) for _ in verts), 34962, componentType=5126, count=8, type='VEC4')
    idx = add(b''.join(struct.pack('<3H', *t) for t in _indices()), 34963, componentType=5123, count=36, type='SCALAR')
    ibm = b''
    for n in NAMES:
        x, y, z = WORLD[n]
        ibm += struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1)
    ibm_acc = add(ibm, None, componentType=5126, count=len(NAMES), type='MAT4')
    times = [0.0, 0.5, 1.0]
    t_acc = add(struct.pack('<3f', *times), None, componentType=5126, count=3, type='SCALAR', min=[0.0], max=[1.0])
    hx, hy, hz = WORLD['hips']
    hips_t = add(b''.join(struct.pack('<3f', hx, hy, hz + _hips_z(f)) for f in (0, 15, 30)), None,
                 componentType=5126, count=3, type='VEC3')
    t2 = add(struct.pack('<2f', 0.0, 1.0), None, componentType=5126, count=2, type='SCALAR', min=[0.0], max=[1.0])
    head_r = add(b''.join(struct.pack('<4f', *_head_rot(f)) for f in (0, 30)), None, componentType=5126, count=2, type='VEC4')

    nodes = []
    children = {n: [] for n in NAMES}
    for n in NAMES:
        if PARENT[n]:
            children[PARENT[n]].append(NAMES.index(n))
    for n in NAMES:
        node = {'name': n, 'translation': list(local_of(n))}
        if children[n]:
            node['children'] = children[n]
        nodes.append(node)
    nodes.append({'name': 'body', 'mesh': 0, 'skin': 0})
    gltf = {
        'asset': {'version': '2.0', 'generator': 'tools/make_test_glb.py'},
        'scene': 0,
        'scenes': [{'nodes': [0, len(nodes) - 1]}],
        'nodes': nodes,
        'meshes': [{'name': 'body', 'primitives': [{
            'attributes': {'POSITION': pos, 'JOINTS_0': joints, 'WEIGHTS_0': weights}, 'indices': idx, 'material': 0}]}],
        'materials': [{'name': 'white', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0}, 'doubleSided': True}],
        'skins': [{'name': 'armature', 'joints': list(range(len(NAMES))), 'inverseBindMatrices': ibm_acc, 'skeleton': 0}],
        'animations': [{'name': 'test30', 'samplers': [
            {'input': t_acc, 'output': hips_t, 'interpolation': 'LINEAR'},
            {'input': t2, 'output': head_r, 'interpolation': 'LINEAR'}],
            'channels': [
                {'sampler': 0, 'target': {'node': NAMES.index('hips'), 'path': 'translation'}},
                {'sampler': 1, 'target': {'node': NAMES.index('head'), 'path': 'rotation'}}]}],
        'accessors': accessors,
        'bufferViews': views,
    }
    binary = b''.join(bin_parts)
    binary += b'\0' * (-len(binary) % 4)
    gltf['buffers'] = [{'byteLength': len(binary)}]
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'synthetic_test_model.glb').write_bytes(build_glb())
    (out / 'synthetic_test_model.expected.json').write_text(
        json.dumps(expected(), ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf8')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'tests' / 'fixtures')
