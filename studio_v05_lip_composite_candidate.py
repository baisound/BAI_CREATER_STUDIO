"""LIP-001 (#187): scene-bound composite of a source VMD, adopted lip and manual face keys.

The caller names one scene instance and its ready registered VMD clip. The
adopted lip candidate (if any) and the instance's manual face keys are read
from the project. compose_morph_vmd rejects sampled discontinuities. A distinct
candidate file is written, then re-read and compared key by key. Nothing in the
project, the source VMD, the adopted candidate or the model is modified.
Design: docs/specs/A1_LIP_IMPLEMENTATION_DESIGN_JA.md section 4.1.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import threading
import uuid
from pathlib import Path

from studio_project_catalog import _atomic
from studio_v05_lip_adoptions import LipAdoptionError, read as read_adoptions
from studio_v05_lip_vmd_composite import (CompositeVmdError, compose_morph_vmd,
                                          expected_morph_rows)
from studio_v05_motion_edits import MotionEditError, _context, _registered_path
from studio_v05_multi_motion import plan as motion_plan
from studio_v05_scene_instances import SceneInstancesError, read as read_scene
from studio_v05_vmd_morph_rewrite import inspect_morph_section
from studio_v05_vmd_rewrite import MAX_SOURCE_BYTES

LOCK = threading.RLock()
CANDIDATE_ID = re.compile(r'[0-9a-f]{32}\Z')
FOLDER = 'studio_v05_lip_composite_candidates'
STATUS = 'composite_binary_checked_requires_real_pmx_validation'


class LipCompositeError(ValueError):
    def __init__(self, message, status=422, issues=None, report=None):
        super().__init__(message)
        self.status = status
        self.issues = issues or []
        self.report = report or {}


def _roots(data_root):
    data_root = Path(data_root)
    return {'scene': data_root / 'studio_v05_scene_instances',
            'legacy': data_root / 'studio_v05_scene_models',
            'arrangement': data_root / 'studio_v05_arrangements',
            'catalog': data_root / 'studio_v05_catalog.json'}


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _face_hash(keys):
    rows = sorted(({'morph_name': row['morph_name'], 'time': row['time'],
                    'value': row['value'], 'track': row.get('track', 'expression')}
                   for row in keys), key=lambda row: (row['morph_name'], row['time']))
    return _sha(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode('utf-8'))


def _inputs(data_root, assets, source_for, project_id, instance_id, clip_id, revisions=None):
    """Collect the selected source VMD, adopted lip and manual keys.

    revisions=None skips the revision check (download revalidation compares the
    resulting identity and bytes instead).
    """
    if (not isinstance(project_id, str) or not 0 < len(project_id) <= 100
            or not isinstance(instance_id, str) or not 0 < len(instance_id) <= 100
            or not isinstance(clip_id, str) or not 0 < len(clip_id) <= 100):
        raise LipCompositeError('Project, scene instance and VMD clip required', 400)
    roots = _roots(data_root)
    try:
        plan = motion_plan(roots['arrangement'], roots['scene'], roots['legacy'],
                           roots['catalog'], project_id, assets)
        context = _context(data_root, roots['scene'], roots['legacy'], roots['arrangement'],
                           roots['catalog'], project_id, assets, instance_id, clip_id)
        scene = read_scene(roots['scene'], roots['legacy'], roots['catalog'], project_id, assets)
        adoptions = read_adoptions(data_root, assets, source_for, project_id, instance_id)
    except (MotionEditError, SceneInstancesError) as exc:
        raise LipCompositeError(str(exc), 409) from exc
    except LipAdoptionError as exc:
        raise LipCompositeError(str(exc), exc.status) from exc
    except (ValueError, OSError) as exc:
        raise LipCompositeError('Project state unreadable; originals retained', 409) from exc
    current = {'adoption': adoptions['revision'], 'scene': scene['revision'],
               'arrangement': plan['arrangement_revision']}
    if revisions is not None and revisions != current:
        raise LipCompositeError('Adoption, scene or arrangement revision changed', 409)
    issues = []
    fps, start, duration = context['fps'], context['start'], context['duration']
    if not float(fps).is_integer():
        issues.append({'code': 'fps_not_integer', 'projectFps': fps,
                       'message': '作品FPSが整数ではないため、元VMDとの合成比較に未対応です'})
    if abs(start) > 1e-9:
        issues.append({'code': 'clip_start_not_zero', 'clipStart': start,
                       'message': '元VMDクリップの開始が0秒ではありません（開始0のクリップだけ合成できます）'})
    fps = int(fps)
    frames = math.floor(duration * fps + 1e-7)
    if frames < 1:
        issues.append({'code': 'clip_too_short', 'message': '元VMDクリップが1フレームより短いです'})
    track = next((row for row in adoptions['tracks'] if row['instanceId'] == instance_id), None)
    if track is not None and track['status'] != 'ready':
        raise LipCompositeError('Adopted lip candidate is stale', 409, [
            {'code': 'adoption_stale', 'candidateId': track['candidateId'],
             'reason': track.get('issue'),
             'message': '採用した口形候補が失効しています。読み・下書き・口形対応を確認して作り直してください'}])
    cue_tracks = track['cueTracks'] if track else []
    limit_ms = math.ceil(frames * 1000 / fps) if frames >= 1 else 0
    for cue in cue_tracks:
        if cue['endMs'] > limit_ms:
            issues.append({'code': 'cue_outside_clip', 'srtIndex': cue.get('srtIndex'),
                           'startMs': cue['startMs'], 'endMs': cue['endMs'],
                           'message': '採用口形の発話区間が元VMDクリップの範囲を超えています'})
    face_keys = [row for row in scene['face_keys'] if row.get('instance_id') == instance_id]
    for row in face_keys:
        if row['time'] > frames / fps + 1e-9:
            issues.append({'code': 'manual_key_outside_clip', 'morphName': row['morph_name'],
                           'time': row['time'],
                           'message': '手動表情キーが元VMDクリップの範囲より後にあります'})
    if not cue_tracks and not face_keys:
        issues.append({'code': 'nothing_to_compose',
                       'message': '採用口形も手動表情キーもないため、合成するキーがありません'})
    if issues:
        raise LipCompositeError(f'合成条件に{len(issues)}件の問題があります', 422, issues)
    asset = next((row for row in assets if row.get('id') == context['motion_asset_id']), None)
    try:
        source = _registered_path(data_root, asset, 'VMD', ('vmd',))
        if source.stat().st_size > MAX_SOURCE_BYTES:
            raise LipCompositeError('Source VMD exceeds composite size limit', 413)
        raw = source.read_bytes()
    except MotionEditError as exc:
        raise LipCompositeError(str(exc), 409) from exc
    if _sha(raw) != context['motion_sha256']:
        raise LipCompositeError('Source VMD changed during composition', 409)
    return {'raw': raw, 'sourceName': source.name, 'context': context, 'fps': fps,
            'frames': frames, 'cueTracks': cue_tracks, 'faceKeys': face_keys,
            'adoption': ({'candidateId': track['candidateId'], 'sha256': track['sha256']}
                         if track else None),
            'revisions': current}


def _compose(found, instance_id):
    try:
        return compose_morph_vmd(found['raw'], found['cueTracks'], found['faceKeys'],
                                 instance_id, found['fps'], found['frames'])
    except CompositeVmdError as exc:
        report = exc.report
        issues = []
        if report.get('worst'):
            worst = report['worst']
            issues.append({'code': 'discontinuity', 'morphName': worst.get('name'),
                           'seconds': worst.get('seconds'), 'projectFrame': worst.get('projectFrame'),
                           'sampleKind': worst.get('sampleKind'), 'desired': worst.get('desired'),
                           'actual': worst.get('actual'),
                           'message': '30fpsのVMDではプレビューと同じ値を再現できない時刻があります'})
        raise LipCompositeError(str(exc), 422, issues, report) from exc
    except ValueError as exc:  # binary rewrite limits, CP932 names
        raise LipCompositeError(str(exc), 422) from exc


def verify_candidate(source_raw, output_raw, names, expected):
    """Re-read every morph key of a written candidate against the composite.

    Touched morphs must equal the expected float32 keys; untouched morph keys and
    all non-morph sections must equal the source bytes.
    """
    source = inspect_morph_section(source_raw)
    output = inspect_morph_section(output_raw)
    if output['prefix'] != source['prefix'] or output['tail'] != source['tail']:
        raise ValueError('Non-morph VMD sections changed')
    touched = set(names)
    wanted = {}
    for row in expected:
        wanted[(row['name'], row['frame'])] = struct.pack('<If', row['frame'], row['weight'])
    kept = {(row['name'], row['frame']): row['raw'] for row in source['rows']
            if row['name'] not in touched}
    seen = set()
    for row in output['rows']:
        identity = row['name'], row['frame']
        if identity in seen:
            raise ValueError('Duplicate morph key in candidate')
        seen.add(identity)
        if row['name'] in touched:
            if wanted.get(identity) != row['raw'][15:]:
                raise ValueError(f'Composite morph key mismatch: {row["name"]} F{row["frame"]}')
        elif kept.get(identity) != row['raw']:
            raise ValueError(f'Untouched morph key changed: {row["name"]} F{row["frame"]}')
    if seen != set(wanted) | set(kept):
        raise ValueError('Candidate morph key set differs from composite')
    return {'status': 'passed_full_key_readback', 'checkedMorphKeys': len(output['rows']),
            'touchedKeys': len(wanted), 'untouchedKeys': len(kept),
            'boneKeys': output['boneKeys'], 'tailCounts': output['tailCounts'],
            'pmx_visual_validation': 'not_performed'}


def create(data_root, assets, source_for, project_id, instance_id, clip_id,
           adoption_revision, scene_revision, arrangement_revision, dry_run):
    if type(dry_run) is not bool or any(type(value) is not int or value < 0 for value in
                                        (adoption_revision, scene_revision, arrangement_revision)):
        raise LipCompositeError('Revisions and dry_run required', 400)
    with LOCK:
        found = _inputs(data_root, assets, source_for, project_id, instance_id, clip_id,
                        {'adoption': adoption_revision, 'scene': scene_revision,
                         'arrangement': arrangement_revision})
        raw, report = _compose(found, instance_id)
        names, expected = expected_morph_rows(found['raw'], found['cueTracks'], found['faceKeys'],
                                              instance_id, found['fps'], found['frames'])
        try:
            readback = verify_candidate(found['raw'], raw, names, expected)
        except ValueError as exc:
            raise LipCompositeError('Composite readback failed: ' + str(exc), 500) from exc
        context = found['context']
        metadata = {'schema': 1, 'projectId': project_id, 'instanceId': instance_id,
                    'clipId': clip_id, 'motionAssetId': context['motion_asset_id'],
                    'sourceName': found['sourceName'],
                    'sourceMotionSha256': context['motion_sha256'],
                    'modelAssetId': context['model_asset_id'],
                    'modelSha256': context['model_sha256'], 'adoption': found['adoption'],
                    'faceKeyCount': len(found['faceKeys']),
                    'faceKeysSha256': _face_hash(found['faceKeys']),
                    'revisions': found['revisions'], 'projectFps': found['fps'],
                    'projectFrames': found['frames'], 'sha256': _sha(raw),
                    'comparison': report, 'readback': readback, 'status': STATUS,
                    'candidateOnly': True, 'placedInProject': False}
        if dry_run:
            return {**metadata, 'dryRun': True, 'candidateId': None}
        candidate_id = uuid.uuid4().hex
        folder = Path(data_root) / FOLDER / project_id
        folder.mkdir(parents=True, exist_ok=True)
        file, meta_file = folder / (candidate_id + '.vmd'), folder / (candidate_id + '.json')
        stem = Path(found['sourceName']).stem
        metadata.update(candidateId=candidate_id,
                        fileName=f'LIP001-COMPOSITE-{stem}-{candidate_id[:8]}.vmd')
        try:
            with file.open('xb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            written = file.read_bytes()
            try:
                if _sha(written) != metadata['sha256']:
                    raise ValueError('Written candidate hash mismatch')
                checked = verify_candidate(found['raw'], written, names, expected)
            except ValueError as exc:
                raise LipCompositeError('Composite readback failed: ' + str(exc), 500) from exc
            metadata['readback'] = {**checked, 'source': 'written_file'}
            _atomic(meta_file, metadata)
        except BaseException:
            # Both paths were created by this request; never pre-existing user files.
            meta_file.unlink(missing_ok=True)
            file.unlink(missing_ok=True)
            raise
        return {**metadata, 'dryRun': False,
                'downloadUrl': f'/api/studio/v05/lip/composite-candidate/file?project_id={project_id}&candidate_id={candidate_id}'}


def candidate_file(data_root, assets, source_for, project_id, candidate_id):
    """Return candidate bytes only while the project still produces the same composite."""
    if (not isinstance(project_id, str) or not 0 < len(project_id) <= 100
            or '/' in project_id or '\\' in project_id or project_id in ('.', '..')
            or not isinstance(candidate_id, str) or not CANDIDATE_ID.fullmatch(candidate_id)):
        raise LipCompositeError('Candidate identity invalid', 400)
    folder = Path(data_root) / FOLDER / project_id
    try:
        metadata = json.loads((folder / (candidate_id + '.json')).read_text(encoding='utf-8'))
        raw = (folder / (candidate_id + '.vmd')).read_bytes()
    except OSError as exc:
        raise LipCompositeError('Composite VMD candidate not found', 404) from exc
    except ValueError as exc:
        raise LipCompositeError('Composite VMD candidate metadata unreadable', 409) from exc
    if (not isinstance(metadata, dict) or metadata.get('candidateId') != candidate_id
            or metadata.get('projectId') != project_id or _sha(raw) != metadata.get('sha256')):
        raise LipCompositeError('Composite VMD candidate bytes changed', 409)
    with LOCK:
        try:
            found = _inputs(data_root, assets, source_for, project_id,
                            metadata['instanceId'], metadata['clipId'])
            current, _ = _compose(found, metadata['instanceId'])
        except LipCompositeError as exc:
            raise LipCompositeError('Composite candidate is stale: ' + str(exc), 409,
                                    exc.issues, exc.report) from exc
    context = found['context']
    if (context['motion_sha256'] != metadata['sourceMotionSha256']
            or context['model_sha256'] != metadata['modelSha256']
            or found['adoption'] != metadata['adoption']
            or _face_hash(found['faceKeys']) != metadata['faceKeysSha256']
            or _sha(current) != metadata['sha256']):
        raise LipCompositeError('Composite candidate is stale: project inputs changed', 409)
    return raw, metadata
