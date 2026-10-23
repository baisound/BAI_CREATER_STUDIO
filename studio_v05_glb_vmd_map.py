"""Named-bone mapping profiles for the bounded v0.5 GLB to PMX converter."""
import hashlib
import json
import os
import struct
import threading
from pathlib import Path

from pmx_bones import parse as parse_pmx


BODY = [
    ('Hips', '腰'), ('Spine', '上半身'), ('Spine1', '上半身2'),
    ('Neck', '首'), ('Head', '頭'),
    ('LeftShoulder', '左肩'), ('LeftArm', '左腕'), ('LeftForeArm', '左ひじ'), ('LeftHand', '左手首'),
    ('RightShoulder', '右肩'), ('RightArm', '右腕'), ('RightForeArm', '右ひじ'), ('RightHand', '右手首'),
    ('LeftUpLeg', '左足'), ('LeftLeg', '左ひざ'), ('LeftFoot', '左足首'), ('LeftToeBase', '左つま先'),
    ('RightUpLeg', '右足'), ('RightLeg', '右ひざ'), ('RightFoot', '右足首'), ('RightToeBase', '右つま先'),
    ('LeftUpLeg', '左足D'), ('LeftLeg', '左ひざD'), ('LeftFoot', '左足首D'), ('LeftToeBase', '左足先EX'),
    ('RightUpLeg', '右足D'), ('RightLeg', '右ひざD'), ('RightFoot', '右足首D'), ('RightToeBase', '右足先EX'),
]
FINGERS = {'Thumb': ('親指', 0), 'Index': ('人指', 1), 'Middle': ('中指', 1),
           'Ring': ('薬指', 1), 'Pinky': ('小指', 1)}
for side, jp in [('Left', '左'), ('Right', '右')]:
    for finger, (name, first) in FINGERS.items():
        for n in range(1, 4):
            BODY.append((f'{side}Hand{finger}{n}', f'{jp}{name}{chr(ord("０") + n + first - 1)}'))

LOCK = threading.RLock()


class MappingError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_skeleton(path):
    """Read the GLB skin/rest hierarchy; Blender evaluates the actual animation."""
    with path.open('rb') as stream:
        header = stream.read(20)
        if len(header) != 20 or header[:4] != b'glTF':
            raise MappingError('GLB header invalid')
        _, version, total, length, kind = struct.unpack('<4sIIII', header)
        if version != 2 or total != path.stat().st_size or kind != 0x4e4f534a or length > 8_000_000:
            raise MappingError('GLB JSON chunk invalid')
        payload = stream.read(length)
    if len(payload) != length:
        raise MappingError('GLB JSON chunk incomplete')
    try:
        doc = json.loads(payload)
        if not isinstance(doc, dict):
            raise MappingError('GLB JSON object required')
        skins = doc.get('skins', [])
        animations = doc.get('animations', [])
        nodes = doc.get('nodes', [])
        if len(skins) != 1 or len(animations) != 1:
            raise MappingError('Single animated GLB skin/action required')
        joints = skins[0]['joints']
        if not isinstance(joints, list) or len(joints) > 512:
            raise MappingError('GLB joint count invalid')
        names = [nodes[index]['name'].removeprefix('mixamorig:') for index in joints]
        if len(names) < 15 or len(names) != len(set(names)) or any(not name or len(name) > 120 for name in names):
            raise MappingError('GLB skeleton names invalid or incomplete')
        if not animations[0].get('channels'):
            raise MappingError('GLB animation has no channels')
        parents = {child: index for index, node in enumerate(nodes)
                   for child in node.get('children', [])}
        rest = []
        for index, name in zip(joints, names):
            node = nodes[index]
            parent = parents.get(index)
            rest.append({'name': name,
                         'parent': nodes[parent].get('name') if parent is not None else None,
                         'matrix': node.get('matrix'),
                         'translation': node.get('translation'),
                         'rotation': node.get('rotation'), 'scale': node.get('scale')})
        signature = hashlib.sha256(json.dumps(sorted(rest, key=lambda x: x['name']),
                                              ensure_ascii=False, sort_keys=True,
                                              separators=(',', ':')).encode('utf-8')).hexdigest()
    except (AttributeError,KeyError,IndexError,TypeError,ValueError) as exc:
        if isinstance(exc, MappingError):
            raise
        raise MappingError('GLB skeleton unavailable') from exc
    return sorted(names), signature


def target_bones(path):
    names = [row['name'] for row in parse_pmx(path.read_bytes())['bones_detail']]
    if len(names) != len(set(names)):
        raise MappingError('PMX has duplicate bone names')
    return names


def identity(source, target):
    source_names, signature = source_skeleton(source)
    target_names = target_bones(target)
    target_sha = _sha(target)
    key = target_sha + ':' + signature
    return source_names, target_names, signature, target_sha, key


def defaults(source_names, target_names):
    sources, targets = set(source_names), set(target_names)
    return {target: source for source, target in BODY if source in sources and target in targets}


def validate(overrides, source_names, target_names):
    if not isinstance(overrides, dict) or len(overrides) > len(BODY):
        raise MappingError('Invalid mapping overrides')
    allowed_targets = {name for _, name in BODY} & set(target_names)
    sources = set(source_names)
    if any(not isinstance(name, str) or name not in allowed_targets or
           (source is not None and (not isinstance(source, str) or source not in sources))
           for name, source in overrides.items()):
        raise MappingError('Mapping contains a nonexistent or unsupported bone')
    effective = defaults(source_names, target_names)
    for name, source in overrides.items():
        if source is None:
            effective.pop(name, None)
        else:
            effective[name] = source
    if len(effective) < 15 or any(name not in effective for name in ('腰', '左足', '右足')):
        raise MappingError('Hips and both legs plus at least 15 mapped bones are required')
    return effective


def _read(root):
    path = Path(root) / 'studio_v05_glb_vmd_profiles.json'
    if not path.exists():
        return {'schema': 1, 'profiles': {}}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if data.get('schema') != 1 or not isinstance(data.get('profiles'), dict) or not all(
                isinstance(key, str) and isinstance(value, dict) for key, value in data['profiles'].items()):
            raise ValueError('schema')
        return data
    except (AttributeError, OSError, ValueError, TypeError) as exc:
        raise MappingError('Mapping profile file unreadable; original retained', 422) from exc


def inspect(root, source, target):
    source_names, target_names, signature, target_sha, key = identity(source, target)
    with LOCK:
        record = _read(root)['profiles'].get(key, {})
    overrides = record.get('overrides', {})
    effective = validate(overrides, source_names, target_names)
    return {'schema': 1, 'source_bones': source_names,
            'target_bones': [name for _, name in BODY if name in target_names],
            'defaults': defaults(source_names, target_names), 'overrides': overrides,
            'effective': effective, 'revision': record.get('revision', 0),
            'source_skeleton_sha256': signature, 'target_sha256': target_sha,
            'profile_key': key, 'status': 'mapping_requires_visual_validation'}


def save(root, source, target, revision, overrides):
    if type(revision) is not int or revision < 0:
        raise MappingError('Mapping revision required')
    source_names, target_names, signature, target_sha, key = identity(source, target)
    effective = validate(overrides, source_names, target_names)
    with LOCK:
        data = _read(root)
        current = data['profiles'].get(key, {})
        if current.get('revision', 0) != revision:
            raise MappingError('Mapping revision conflict', 409)
        updated = {'revision': revision + 1, 'overrides': overrides,
                   'source_skeleton_sha256': signature, 'target_sha256': target_sha}
        data['profiles'][key] = updated
        path = Path(root) / 'studio_v05_glb_vmd_profiles.json'
        temp = path.with_suffix('.json.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temp, path)
    return {'profile_key': key, 'revision': revision + 1, 'effective': effective,
            'status': 'mapping_requires_visual_validation'}
