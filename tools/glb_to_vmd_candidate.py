#!/usr/bin/env python3
"""Sample one registered GLB action onto a PMX skeleton in Blender; provisional output."""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pmx_bones import parse as parse_pmx
from studio_v05_glb_vmd_map import BODY, validate as validate_mapping


def field(value, length):
    encoded = value.encode('cp932')[:length]
    return encoded + b'\0' * (length - len(encoded))


def write_vmd(path, rows):
    interpolation = bytes([20, 20, 107, 107]) * 16
    with path.open('wb') as handle:
        handle.write(field('Vocaloid Motion Data 0002', 30))
        handle.write(field('BAI GLB PMX Preview', 20))
        handle.write(struct.pack('<I', len(rows)))
        for name, frame, position, rotation in rows:
            handle.write(field(name, 15))
            handle.write(struct.pack('<I3f4f', frame, *position, *rotation))
            handle.write(interpolation)
        handle.write(struct.pack('<IIIII', 0, 0, 0, 0, 0))


def converted_rotation(rotation, axis):
    return (axis @ rotation @ axis.inverted()).normalized()


def sample(job):
    source = Path(job['source']).resolve()
    target = Path(job['target']).resolve()
    output = Path(job['output']).resolve()
    if source.suffix.lower() != '.glb' or target.suffix.lower() != '.pmx' or output.suffix.lower() != '.vmd':
        raise ValueError('GLB source, PMX target and VMD output required')
    fps = int(job.get('fps', 30))
    if not 1 <= fps <= 60:
        raise ValueError('fps must be 1..60')
    pmx = parse_pmx(target.read_bytes())
    targets = pmx['bones_detail']
    target_names = {bone['name']: bone['index'] for bone in targets}
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    arms = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    if len(arms) != 1 or not arms[0].animation_data or not arms[0].animation_data.action:
        raise ValueError('one animated GLB armature is required')
    arm = arms[0]
    action = arm.animation_data.action
    if len(bpy.data.actions) != 1:
        raise ValueError('one GLB animation clip is required')
    sources = {bone.name.removeprefix('mixamorig:'): bone for bone in arm.data.bones}
    effective = validate_mapping(job.get('mapping_overrides', {}), sources, target_names)
    pairs = [(source_name, target_names[target_name]) for target_name, source_name in effective.items()]
    if 'センター' not in target_names or 'Hips' not in sources:
        raise ValueError('source Hips or PMX center bone missing')
    source_fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    start, end = action.frame_range
    duration = (end - start) / source_fps
    frames = int(math.ceil(duration * fps))
    if frames < 2 or frames > 18000:
        raise ValueError('unsupported motion duration')
    if 'limit_frames' in job:
        frames = min(frames, int(job['limit_frames']))
        if frames < 2:
            raise ValueError('limit_frames must be at least 2')
    axis = Quaternion((1, 0, 0), -math.pi / 2)
    arm_world = arm.matrix_world.copy()
    rest = {name: converted_rotation((arm_world @ bone.matrix_local).to_quaternion(), axis)
            for name, bone in sources.items()}
    source_height = max(bone.tail_local.z for bone in sources.values()) - min(
        bone.head_local.z for bone in sources.values())
    target_height = max(bone['position'][1] for bone in targets) - min(
        bone['position'][1] for bone in targets)
    if not 0.5 < source_height < 4 or not 5 < target_height < 50:
        raise ValueError('source or target height is outside expected range')
    scale = target_height / source_height
    by_target = {target_index: source_name for source_name, target_index in pairs}
    depths = {}
    def depth(index):
        if index in depths:
            return depths[index]
        parent = targets[index]['parent_index']
        depths[index] = 0 if parent < 0 or parent >= len(targets) else depth(parent) + 1
        return depths[index]
    order = sorted(range(len(targets)), key=depth)
    rows = []
    initial_hips = None
    previous = {}
    for frame in range(frames + 1):
        source_frame = min(end, start + frame * source_fps / fps)
        whole = math.floor(source_frame)
        bpy.context.scene.frame_set(whole, subframe=source_frame - whole)
        current = {name: converted_rotation((arm_world @ arm.pose.bones[bone.name].matrix).to_quaternion(), axis)
                   for name, bone in sources.items() if name in arm.pose.bones}
        world = [Quaternion((1, 0, 0, 0)) for _ in targets]
        local = {}
        for index in order:
            parent = targets[index]['parent_index']
            parent_rotation = world[parent] if 0 <= parent < len(world) else Quaternion((1, 0, 0, 0))
            source_name = by_target.get(index)
            if source_name:
                desired = (current[source_name] @ rest[source_name].inverted()).normalized()
                q = (parent_rotation.inverted() @ desired).normalized()
                local[index] = q
                world[index] = desired
            else:
                world[index] = parent_rotation.copy()
        hip = arm_world @ arm.pose.bones[sources['Hips'].name].matrix
        hip_position = axis @ hip.to_translation()
        if initial_hips is None:
            initial_hips = hip_position.copy()
        center_position = (hip_position - initial_hips) * scale
        for index, q in local.items():
            name = targets[index]['name']
            prior = previous.get(index)
            if prior is not None and prior.dot(q) < 0:
                q = -q
            previous[index] = q.copy()
            rows.append((name, frame, (0, 0, 0), (-q.x, -q.y, q.z, q.w)))
        rows.append(('センター', frame,
                     (center_position.x, center_position.y, -center_position.z), (0, 0, 0, 1)))
    output.parent.mkdir(parents=True, exist_ok=True)
    write_vmd(output, rows)
    return {'status': 'candidate_needs_visual_validation', 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'target_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'output': str(output),
            'frames': frames + 1, 'duration_seconds': duration, 'bone_keys': len(rows),
            'mapped_bones': len(pairs), 'scale': scale,
            'unmapped': [dst for _, dst in BODY if dst in target_names and dst not in effective],
            'mapping_overrides': job.get('mapping_overrides', {}),
            'warnings': ['PMX IK, grant bones and ground contact require visual validation.']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    job = json.loads(Path(args.job).read_text(encoding='utf-8'))
    print('BAI_GLB_VMD_RESULT ' + json.dumps(sample(job), ensure_ascii=True))


if __name__ == '__main__':
    main()
