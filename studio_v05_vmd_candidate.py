"""Review-only VMD candidate from whole-clip constant MOTION-010 layers."""
from __future__ import annotations

import hashlib
import json
import math
import os
import uuid
from pathlib import Path

from studio_v05_motion_edits import (LOCK, MotionEditError, _context, _identity,
                                     _registered_path, read, view)
from studio_v05_vmd_constant import constant_replacements
from studio_v05_vmd_rewrite import MAX_SOURCE_BYTES, write_distinct_vmd
from studio_v05_vmd_temporal import temporal_replacements


def _uuid(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except ValueError:
        return False


def _candidate_paths(root, project_id, candidate_id):
    if not _uuid(project_id) or not _uuid(candidate_id):
        raise MotionEditError('Invalid VMD candidate identity')
    folder = Path(root) / project_id
    return folder / (candidate_id + '.vmd'), folder / (candidate_id + '.json')


def _is_temporal(layer):
    first = math.ceil(layer['start'] * layer['fps'] - 1e-7)
    end = math.ceil((layer['start'] + layer['duration']) * layer['fps'] - 1e-7)
    return (bool(layer.get('fade_in_frames', 0) or layer.get('fade_out_frames', 0)) or
            layer.get('start_frame', first) != first or layer.get('end_frame', end) != end or
            len({key['bone'] for key in layer['keys']}) != len(layer['keys']))


def create_candidate(output_root, edit_root, data_root, scene_root, legacy_root,
                     arrangement_root, catalog, project_id, revision, instance_id,
                     clip_id, assets):
    if type(revision) is not int or revision < 0:
        raise MotionEditError('Motion edit revision required')
    if not isinstance(instance_id, str) or not isinstance(clip_id, str):
        raise MotionEditError('Scene instance and VMD clip required')
    with LOCK:
        edits = read(edit_root, catalog, project_id)
        if edits['revision'] != revision:
            raise MotionEditError('Revision conflict')
        inspected = view(edit_root, data_root, scene_root, legacy_root,
                         arrangement_root, catalog, project_id, assets)
        if inspected['issues']:
            raise MotionEditError('Saved correction source or placement changed')
        context = _context(data_root, scene_root, legacy_root, arrangement_root,
                           catalog, project_id, assets, instance_id, clip_id)
        layers = [row for row in edits['layers'] if row['instance_id'] == instance_id and
                  row['clip_id'] == clip_id]
        if not layers or any(_identity(row) != _identity(context) for row in layers):
            raise MotionEditError('Saved correction does not match current PMX/VMD clip')
        asset = next((row for row in assets if row.get('id') == context['motion_asset_id']), None)
        source = _registered_path(data_root, asset, 'VMD', ('vmd',))
        if source.stat().st_size > MAX_SOURCE_BYTES:
            raise MotionEditError('VMD source exceeds candidate size limit')
        raw = source.read_bytes()
        if hashlib.sha256(raw).hexdigest() != context['motion_sha256']:
            raise MotionEditError('VMD source changed during candidate creation')
        temporal = any(_is_temporal(layer) for layer in layers)
        if temporal:
            samples, sampling_report = temporal_replacements(
                raw, layers, instance_id=instance_id, clip_id=clip_id)
        else:
            samples = constant_replacements(raw, layers, instance_id=instance_id, clip_id=clip_id)
            sampling_report = None
        candidate_id = str(uuid.uuid4())
        output, metadata_path = _candidate_paths(output_root, project_id, candidate_id)
        output.parent.mkdir(parents=True, exist_ok=True)
        report = write_distinct_vmd(source, output, samples)
        metadata = {'schema': 1, 'candidate_id': candidate_id, 'project_id': project_id,
                    'revision': revision, 'instance_id': instance_id, 'clip_id': clip_id,
                    'model_sha256': context['model_sha256'],
                    'source_motion_sha256': context['motion_sha256'],
                    'output_sha256': report['output_sha256'], 'source_name': source.name,
                    'replaced_bone_keys': report['replaced'], 'added_bone_keys': report['added'],
                    'suffix_bytes': report['suffix_bytes'],
                    'sampling_report': sampling_report,
                    'status': 'candidate_requires_real_pmx_validation',
                    'registered_asset': False, 'placed_in_project': False}
        try:
            with metadata_path.open('x', encoding='utf-8') as handle:
                json.dump(metadata, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
        except BaseException:
            # Both paths were generated for this request, never pre-existing user files.
            metadata_path.unlink(missing_ok=True)
            output.unlink(missing_ok=True)
            raise
        return {**metadata, 'download_url':
                f'/api/studio/v05/motion/vmd-candidate/file?project_id={project_id}&candidate_id={candidate_id}'}


def candidate_file(output_root, project_id, candidate_id):
    output, metadata_path = _candidate_paths(output_root, project_id, candidate_id)
    try:
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        if (metadata.get('project_id') != project_id or
                metadata.get('candidate_id') != candidate_id or
                metadata.get('status') not in {'candidate_requires_real_pmx_validation',
                                                'browser_validated_adopted',
                                                'browser_validated_unplaced'} or
                hashlib.sha256(output.read_bytes()).hexdigest() != metadata.get('output_sha256')):
            raise MotionEditError('VMD candidate metadata or hash mismatch')
    except (OSError, ValueError, TypeError) as exc:
        raise MotionEditError('VMD candidate cannot be read') from exc
    return output
