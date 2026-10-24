"""Explicit, reversible placement of a browser-checked MOTION-010 VMD candidate.

The browser performs the real PMX all-frame comparison. This module checks the
reported limits, then rechecks the source identities and bytes before changing
the selected clip. The browser report is retained as provenance, not treated as
an independently reproduced server-side physics/GPU certification.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import uuid
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_arrangement import LOCK as ARRANGEMENT_LOCK, read as read_arrangement
from studio_v05_motion_edits import (LOCK as EDIT_LOCK, MotionEditError, _context,
                                     _digest, _identity, _registered_path,
                                     read as read_edits, view as view_edits)
from studio_v05_multi_motion import plan as motion_plan
from studio_v05_track_layout import get as get_layout
from studio_v05_vmd_candidate import _candidate_paths


class AdoptionError(ValueError):
    pass


def _metadata(root, project_id, candidate_id):
    source, path = _candidate_paths(root, project_id, candidate_id)
    try:
        record = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise AdoptionError('VMD candidate metadata cannot be read') from exc
    if (not isinstance(record, dict) or record.get('schema') != 1 or
            record.get('project_id') != project_id or record.get('candidate_id') != candidate_id or
            record.get('status') not in {'candidate_requires_real_pmx_validation',
                                         'browser_validated_adopted', 'browser_validated_unplaced'}):
        raise AdoptionError('VMD candidate identity or state is invalid')
    if not source.is_file() or _digest(source) != record.get('output_sha256'):
        raise AdoptionError('VMD candidate bytes changed')
    return source, path, record


def _report(report, start, duration, fps, record=None):
    if not isinstance(report, dict) or report.get('passed') is not True:
        raise AdoptionError('Passing real-PMX browser report required')
    first = math.ceil(start * fps - 1e-7)
    end = math.ceil((start + duration) * fps - 1e-7)
    vmd_first = math.ceil(start * 30 - 1e-7)
    vmd_end = math.ceil((start + duration) * 30 - 1e-7)
    sampling = (record or {}).get('sampling_report') or {}
    mode = (record or {}).get('export_mode')
    sampled = (mode in ('whole', 'interval') and sampling.get('mode') == mode or
               mode == 'legacy_sparse' and
               sampling.get('gate') == 'local_channels_only_requires_real_pmx_roundtrip')
    if sampled:
        span = sampling.get('vmd_frame_span')
        if type(span) is not int or not 1 <= span <= 18001:
            raise AdoptionError('VMD candidate span is invalid')
        vmd_end = max(vmd_end, vmd_first + span)
    if (type(report.get('checkedFrames')) is not int or report['checkedFrames'] != end - first or
            type(report.get('checkedVmdFrames')) is not int or
            report['checkedVmdFrames'] != vmd_end - vmd_first or
            type(report.get('bones')) is not int or not 1 <= report['bones'] <= 10000):
        raise AdoptionError('Browser report does not cover the whole clip')
    for key, maximum in (('maxPosition', 1e-3), ('maxAngle', 0.01)):
        value = report.get(key)
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
            raise AdoptionError('Browser report exceeds the VMD round-trip limit')
    for metric in ('position', 'angle'):
        clock, frame, bone = (report.get(metric + suffix) for suffix in ('Clock', 'Frame', 'Bone'))
        lower, upper = (first, end) if clock == '作品' else (vmd_first, vmd_end) if clock == 'VMD' else (-1, -1)
        if type(frame) is not int or not lower <= frame < upper or not isinstance(bone, str) or len(bone) > 100:
            raise AdoptionError('Browser report frame or bone is invalid')
    return {key: report[key] for key in ('passed', 'checkedFrames', 'checkedVmdFrames',
            'bones', 'maxPosition', 'maxAngle', 'positionClock', 'positionFrame',
            'positionBone', 'angleClock', 'angleFrame', 'angleBone')}


def _registry(path):
    if not path.exists():
        return {'A': [], 'B': [], 'vmd': []}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise AdoptionError('MMD asset index unreadable; original retained') from exc
    if not isinstance(data, dict) or not isinstance(data.get('vmd'), list):
        raise AdoptionError('MMD asset index invalid; original retained')
    return data


def _ensure_registered(candidate, record, mmd_root, index_path):
    name = 'MOTION010-' + record['candidate_id'] + '.vmd'
    destination = Path(mmd_root) / 'vmd' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if _digest(destination) != record['output_sha256']:
            raise AdoptionError('Generated VMD name already has different bytes')
    else:
        temp = destination.with_name('.MOTION010-' + str(uuid.uuid4()) + '.tmp')
        try:
            with candidate.open('rb') as source, temp.open('xb') as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
                output.flush()
                os.fsync(output.fileno())
            if _digest(temp) != record['output_sha256'] or destination.exists():
                raise AdoptionError('Candidate changed during registration')
            os.replace(temp, destination)
        finally:
            temp.unlink(missing_ok=True)
    index = _registry(Path(index_path))
    entries = [row for row in index['vmd'] if isinstance(row, dict) and row.get('name') == name]
    if entries and (len(entries) != 1 or entries[0].get('size') != destination.stat().st_size):
        raise AdoptionError('Generated VMD registry entry conflicts')
    if not entries:
        index['vmd'].append({'name': name, 'size': destination.stat().st_size,
                             'sha256': record['output_sha256'], 'candidate_id': record['candidate_id']})
        _atomic(Path(index_path), index)
    return 'mmd:vmd:' + name


def adopt(candidate_root, edit_root, data_root, scene_root, legacy_root,
          arrangement_root, catalog, layout_root, mmd_root, mmd_index,
          mmd_lock, project_id, candidate_id, edit_revision,
          arrangement_revision, scene_revision, report, assets):
    if any(type(value) is not int or value < 0 for value in
           (edit_revision, arrangement_revision, scene_revision)):
        raise AdoptionError('Current edit, arrangement and scene revisions required')
    with EDIT_LOCK, ARRANGEMENT_LOCK, mmd_lock:
        candidate, metadata_path, metadata = _metadata(candidate_root, project_id, candidate_id)
        edits = read_edits(edit_root, catalog, project_id)
        if edits['revision'] != edit_revision or metadata['revision'] != edit_revision:
            raise AdoptionError('Motion edit revision conflict')
        arrangement = read_arrangement(arrangement_root, catalog, project_id)
        if arrangement['revision'] != arrangement_revision:
            raise AdoptionError('Arrangement revision conflict')
        plan = motion_plan(arrangement_root, scene_root, legacy_root, catalog, project_id, assets)
        if plan['scene_revision'] != scene_revision:
            raise AdoptionError('Scene revision conflict')
        clip = next((row for row in arrangement['clips'] if row.get('id') == metadata['clip_id']), None)
        if not clip or clip.get('track') != 'motion' or clip.get('category') != 'motion' or \
                clip.get('target_scene_instance_id') != metadata['instance_id']:
            raise AdoptionError('Original motion clip is no longer available')
        if 'motion' in get_layout(layout_root, catalog, project_id).get('locked', []):
            raise AdoptionError('Motion track locked')
        if clip.get('motion010_candidate_id') == candidate_id:
            expected = 'mmd:vmd:MOTION010-' + candidate_id + '.vmd'
            if clip.get('asset_id') != expected or \
                    metadata.get('output_sha256') != clip.get('motion010_output_sha256'):
                raise AdoptionError('Placed candidate identity conflict')
            prior = next((row for row in edits['layers'] if row['instance_id'] == metadata['instance_id']
                          and row['clip_id'] == metadata['clip_id']), None)
            if not prior or prior['model_sha256'] != metadata['model_sha256'] or \
                    prior['motion_sha256'] != metadata['source_motion_sha256']:
                raise AdoptionError('Saved correction no longer matches candidate')
            checked = _report(report, prior['start'], prior['duration'], prior['fps'], metadata)
            asset_id = _ensure_registered(candidate, metadata, mmd_root, mmd_index)
            metadata.update(status='browser_validated_adopted', registered_asset=asset_id,
                            placed_in_project=True,
                            source_motion_asset_id=clip.get('motion010_source_asset_id'),
                            browser_validation=checked)
            _atomic(metadata_path, metadata)
            return {'asset_id': clip['asset_id'], 'clip_id': clip['id'],
                    'revision': arrangement['revision'], 'already_placed': True}
        if clip.get('motion010_candidate_id') or clip.get('asset_id') != metadata.get('source_motion_asset_id', clip.get('asset_id')):
            raise AdoptionError('Motion clip already uses a different candidate')
        inspected = view_edits(edit_root, data_root, scene_root, legacy_root,
                               arrangement_root, catalog, project_id, assets)
        if inspected['issues']:
            raise AdoptionError('Saved correction source or placement changed')
        context = _context(data_root, scene_root, legacy_root, arrangement_root,
                           catalog, project_id, assets, metadata['instance_id'], metadata['clip_id'])
        layers = [row for row in edits['layers'] if row['instance_id'] == metadata['instance_id'] and
                  row['clip_id'] == metadata['clip_id']]
        if not layers or any(_identity(row) != _identity(context) for row in layers):
            raise AdoptionError('Saved correction no longer matches the VMD clip')
        if context['model_sha256'] != metadata['model_sha256'] or \
                context['motion_sha256'] != metadata['source_motion_sha256']:
            raise AdoptionError('PMX or original VMD changed after candidate creation')
        checked = _report(report, context['start'], context['duration'], context['fps'], metadata)
        source_asset_id = clip['asset_id']
        original_name = clip['name']
        asset_id = _ensure_registered(candidate, metadata, mmd_root, mmd_index)
        clip.update(asset_id=asset_id, name='MOTION-010 補正: ' + original_name,
                    motion010_source_asset_id=source_asset_id,
                    motion010_source_name=original_name,
                    motion010_candidate_id=candidate_id,
                    motion010_source_sha256=metadata['source_motion_sha256'],
                    motion010_output_sha256=metadata['output_sha256'])
        arrangement['revision'] += 1
        arrangement.pop('undo', None)
        _atomic(Path(arrangement_root) / (project_id + '.json'), arrangement)
        metadata.update(status='browser_validated_adopted', registered_asset=asset_id,
                        placed_in_project=True, source_motion_asset_id=source_asset_id,
                        browser_validation=checked)
        _atomic(metadata_path, metadata)
        return {'asset_id': asset_id, 'clip_id': clip['id'], 'revision': arrangement['revision'],
                'already_placed': False, 'validation': checked,
                'original_asset_id': source_asset_id}


def restore(candidate_root, data_root, arrangement_root, catalog, layout_root,
            project_id, clip_id, arrangement_revision, assets):
    if type(arrangement_revision) is not int or arrangement_revision < 0:
        raise AdoptionError('Arrangement revision required')
    with ARRANGEMENT_LOCK:
        arrangement = read_arrangement(arrangement_root, catalog, project_id)
        if arrangement['revision'] != arrangement_revision:
            raise AdoptionError('Arrangement revision conflict')
        clip = next((row for row in arrangement['clips'] if row.get('id') == clip_id), None)
        if not clip or not clip.get('motion010_candidate_id') or clip.get('track') != 'motion':
            raise AdoptionError('Placed MOTION-010 candidate required')
        if 'motion' in get_layout(layout_root, catalog, project_id).get('locked', []):
            raise AdoptionError('Motion track locked')
        _, metadata_path, metadata = _metadata(candidate_root, project_id, clip['motion010_candidate_id'])
        expected = 'mmd:vmd:MOTION010-' + clip['motion010_candidate_id'] + '.vmd'
        if clip['asset_id'] != expected or \
                clip.get('motion010_output_sha256') != metadata['output_sha256']:
            raise AdoptionError('Placed candidate identity changed')
        original = next((row for row in assets if row.get('id') == clip.get('motion010_source_asset_id')), None)
        path = _registered_path(data_root, original, 'VMD', ('vmd',))
        if _digest(path) != clip.get('motion010_source_sha256'):
            raise AdoptionError('Original VMD changed; automatic restore stopped')
        clip['asset_id'] = original['id']
        clip['name'] = clip.pop('motion010_source_name')
        for field in ('motion010_source_asset_id', 'motion010_candidate_id',
                      'motion010_source_sha256', 'motion010_output_sha256'):
            clip.pop(field)
        arrangement['revision'] += 1
        arrangement.pop('undo', None)
        _atomic(Path(arrangement_root) / (project_id + '.json'), arrangement)
        metadata.update(status='browser_validated_unplaced', placed_in_project=False)
        _atomic(metadata_path, metadata)
        return {'clip_id': clip_id, 'asset_id': original['id'],
                'revision': arrangement['revision'], 'candidate_retained': True}
