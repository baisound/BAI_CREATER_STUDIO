"""Source-bound, review-only morph VMD candidates for registered PMX models."""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from fractions import Fraction
from pathlib import Path

from morph_vmd_codec import encode_morph_vmd
from studio_project_catalog import _atomic
from studio_v05_lip_candidates import propose, LipCandidateError
from studio_v05_lip_drafts import read as read_drafts, LipDraftError
from studio_v05_lip_readings import read as read_readings, LipReadingError
from studio_v05_morph_maps import read as read_maps, MorphMapError
from studio_v05_srt_sources import read as read_sources, SrtSourceError
from vmd_readback import compare_vmd_morphs

LOCK = threading.RLock()
ID = re.compile(r'[A-Za-z0-9_-]{1,100}\Z')
CANDIDATE_ID = re.compile(r'[0-9a-f]{32}\Z')
VOWELS = frozenset(('A', 'I', 'U', 'E', 'O'))


class LipVmdError(ValueError):
    def __init__(self, message, status=422, issues=None):
        super().__init__(message)
        self.status = status
        self.issues = issues or []


def _vmd_frame(project_frame, fps):
    return round(Fraction(project_frame * 30, 1) / Fraction(str(fps)))


def _plan(data_root, assets, source_for, project_id, source_id, model_asset_id,
          source_revision, reading_revision, draft_revision, map_revision):
    if (not isinstance(project_id, str) or not ID.fullmatch(project_id)
            or not isinstance(source_id, str) or not source_id
            or not isinstance(model_asset_id, str) or not model_asset_id
            or any(type(revision) is not int or revision < 0 for revision in
                   (source_revision, reading_revision, draft_revision, map_revision))):
        raise LipVmdError('Project, sources and revisions required', 400)
    catalog = Path(data_root) / 'studio_v05_catalog.json'
    try:
        sources = read_sources(Path(data_root)/'studio_v05_srt_sources', catalog, project_id)
        readings = read_readings(Path(data_root)/'studio_v05_lip_readings', catalog,
                                 Path(data_root)/'studio_v05_srt_sources', project_id)
        drafts = read_drafts(Path(data_root)/'studio_v05_lip_drafts', catalog,
                             Path(data_root)/'studio_v05_srt_sources',
                             Path(data_root)/'studio_v05_lip_readings', project_id)
        maps = read_maps(Path(data_root)/'studio_v05_morph_maps', catalog, project_id,
                         assets, source_for)
    except (SrtSourceError, LipReadingError, LipDraftError, MorphMapError) as exc:
        raise LipVmdError(str(exc), exc.status) from exc
    actual = (sources['revision'], readings['revision'], drafts['revision'], maps['revision'])
    expected = (source_revision, reading_revision, draft_revision, map_revision)
    if actual != expected:
        raise LipVmdError('Source, reading, draft or morph map revision changed', 409)
    source = next((row for row in sources['sources'] if row['id'] == source_id), None)
    if not source:
        raise LipVmdError('SRT source not found', 404)
    if source['sourceStatus'] != 'valid':
        raise LipVmdError('SRT original changed or missing', 409)
    issues = []
    for warning in source['warnings']:
        issues.append({'code': warning['code'], 'srtIndices': warning['indices'],
                       'message': 'SRT発話の時刻が重なっています'})
    mapping = next((row for row in maps['maps'] if row['model_asset_id'] == model_asset_id
                    and row['source_status'] == 'valid' and row['confirmed']), None)
    if not mapping:
        raise LipVmdError('Confirmed PMX morph map for unchanged model required', 422)
    reading_by_cue = {(row['srtSourceId'], row['srtIndex']): row for row in readings['utterances']}
    draft_by_cue = {(row['srtSourceId'], row['srtIndex']): row for row in drafts['drafts']}
    fps = next((row['projectFps'] for row in drafts['drafts']
                if row['srtSourceId'] == source_id and row['draftStatus'] == 'draft'), None)
    records, cue_tracks, cue_count, silence_count = [], [], 0, 0
    for cue in sorted(source['entries'], key=lambda item: (item['startMs'], item['index'])):
        cue_count += 1
        index = cue['index']
        reading = reading_by_cue.get((source_id, cue['index']))
        if not reading or reading['sourceStatus'] != 'valid':
            issues.append({'code': 'reading_missing', 'srtIndex': index,
                           'message': '原本と一致する確定読みがありません'})
            continue
        if reading['explicitSilence']:
            silence_count += 1
            continue
        if reading['readingState'] != 'confirmed':
            issues.append({'code': 'reading_unconfirmed', 'srtIndex': index,
                           'message': 'かなの読みが未確定です'})
            continue
        draft = draft_by_cue.get((source_id, cue['index']))
        if not draft or draft['draftStatus'] != 'draft':
            issues.append({'code': 'draft_missing_or_stale', 'srtIndex': index,
                           'message': '現在の読みと一致する口形下書きがありません'})
            continue
        if (draft['sourceHash'] != source['sha256'] or draft['pronunciationVersion'] != reading['pronunciationVersion']
                or draft['sourceStartMs'] != cue['startMs'] or draft['sourceEndMs'] != cue['endMs']):
            issues.append({'code': 'draft_source_changed', 'srtIndex': index,
                           'message': '口形下書きの元SRTまたは読み版が変わっています'})
            continue
        if fps is None:
            fps = draft['projectFps']
        if fps != draft['projectFps']:
            issues.append({'code': 'draft_fps_changed', 'srtIndex': index,
                           'message': '口形下書きの作品FPSが一致しません'})
            continue
        try:
            proposal = propose(catalog, Path(data_root)/'studio_v05_srt_sources',
                Path(data_root)/'studio_v05_lip_readings', project_id, source_id, cue['index'])
        except LipCandidateError as exc:
            raise LipVmdError(str(exc), exc.status) from exc
        if proposal['warnings']:
            for warning in proposal['warnings']:
                if warning['code'] == 'time_overlap':
                    continue  # source warnings already identify both cue numbers
                issues.append({'code': warning['code'], 'srtIndex': index,
                               'message': '口形候補に未解決の警告があります'})
            continue
        cue_records = []
        for segment in draft['segments']:
            shape = segment['mouthShape']
            entry = mapping['entries'][shape]
            if shape in VOWELS and (not entry or entry['weight'] <= 0):
                issues.append({'code': 'morph_missing_or_zero', 'srtIndex': index,
                               'mouthShape': shape, 'message': f'{shape}に有効なPMX口モーフ対応がありません'})
                continue
            if entry is None:
                continue
            weight = segment['weight'] * entry['weight']
            for frame, value in ((segment['startFrame'], weight), (segment['endFrame'], 0.0)):
                vmd_frame = _vmd_frame(frame, fps)
                if not 0 <= vmd_frame <= 1_000_000:
                    issues.append({'code': 'vmd_frame_out_of_range', 'srtIndex': index,
                                   'projectFrame': frame, 'message': 'VMDフレームが上限を超えます'})
                    continue
                key = {'name': entry['morph_name'], 'frame': vmd_frame,
                       'weight': value, 'srtIndex': index}
                records.append(key)
                cue_records.append(key)
                if len(records) > 100_000:
                    raise LipVmdError('Morph VMD key limit is 100000', 413)
        if cue_records:
            cue_tracks.append({'srtIndex': index, 'startMs': cue['startMs'],
                               'endMs': cue['endMs'], 'records': [
                                   {key: row[key] for key in ('name', 'frame', 'weight')}
                                   for row in sorted(cue_records, key=lambda item: (item['frame'], item['name']))]})
    records.sort(key=lambda row: (row['frame'], row['name']))
    for a, b in zip(records, records[1:]):
        if (a['frame'], a['name']) == (b['frame'], b['name']):
            issues.append({'code': 'vmd_frame_collision', 'vmdFrame': a['frame'],
                           'morphName': a['name'],
                           'srtIndices': sorted({a['srtIndex'], b['srtIndex']}),
                           'message': '同じVMDフレーム・モーフへ複数キーが重なります'})
    if not records and not issues:
        issues.append({'code': 'no_morph_records', 'message': '出力できる口モーフキーがありません'})
    if issues:
        raise LipVmdError(f'出力条件に{len(issues)}件の問題があります', 422, issues)
    records = [{key: row[key] for key in ('name', 'frame', 'weight')} for row in records]
    raw = encode_morph_vmd('BAI Lip', records)
    return {'raw': raw, 'records': records, 'cueTracks': cue_tracks,
            'sourceHash': source['sha256'],
            'modelHash': mapping['model_hash'], 'mapId': mapping['id'],
            'cueCount': cue_count, 'silenceCount': silence_count, 'projectFps': fps,
            'revisions': {'source': source_revision, 'reading': reading_revision,
                          'draft': draft_revision, 'map': map_revision}}


def create(data_root, assets, source_for, project_id, source_id, model_asset_id,
           source_revision, reading_revision, draft_revision, map_revision, dry_run):
    if type(dry_run) is not bool:
        raise LipVmdError('dry_run must be boolean', 400)
    with LOCK:
        plan = _plan(data_root, assets, source_for, project_id, source_id, model_asset_id,
                     source_revision, reading_revision, draft_revision, map_revision)
        report = {'schema': 1, 'projectId': project_id, 'srtSourceId': source_id,
                  'modelAssetId': model_asset_id, 'sourceHash': plan['sourceHash'],
                  'modelHash': plan['modelHash'], 'mapId': plan['mapId'],
                  'cueCount': plan['cueCount'], 'silenceCount': plan['silenceCount'],
                  'morphKeys': len(plan['records']), 'projectFps': plan['projectFps'],
                  'revisions': plan['revisions'], 'sha256': hashlib.sha256(plan['raw']).hexdigest(),
                  'readback': compare_vmd_morphs(plan['raw'], plan['records']),
                  'status': 'binary_checked_requires_pmx_visual_validation',
                  'candidateOnly': True, 'adopted': False}
        if dry_run:
            return {**report, 'dryRun': True, 'candidateId': None}
        candidate_id = uuid.uuid4().hex
        folder = Path(data_root) / 'studio_v05_lip_vmd_candidates' / project_id
        folder.mkdir(parents=True, exist_ok=True)
        file = folder / (candidate_id + '.vmd')
        metadata = folder / (candidate_id + '.json')
        try:
            with file.open('xb') as stream:
                stream.write(plan['raw'])
                stream.flush()
                os.fsync(stream.fileno())
            _atomic(metadata, {**report, 'candidateId': candidate_id})
        except OSError:
            if file.exists() and not metadata.exists():
                file.unlink()
            raise
        return {**report, 'dryRun': False, 'candidateId': candidate_id,
                'fileName': f'LIP001-{candidate_id}.vmd',
                'downloadUrl': f'/api/studio/v05/lip/vmd-candidate/file?project_id={project_id}&candidate_id={candidate_id}'}


def validated_candidate(data_root, assets, source_for, project_id, candidate_id):
    if (not isinstance(project_id, str) or not ID.fullmatch(project_id)
            or not isinstance(candidate_id, str) or not CANDIDATE_ID.fullmatch(candidate_id)):
        raise LipVmdError('Candidate identity invalid', 400)
    folder = Path(data_root) / 'studio_v05_lip_vmd_candidates' / project_id
    try:
        metadata = json.loads((folder / (candidate_id + '.json')).read_text(encoding='utf-8'))
        raw = (folder / (candidate_id + '.vmd')).read_bytes()
    except OSError as exc:
        raise LipVmdError('Morph VMD candidate not found', 404) from exc
    except (ValueError, TypeError) as exc:
        raise LipVmdError('Morph VMD candidate metadata unreadable', 409) from exc
    if (not isinstance(metadata, dict) or metadata.get('candidateId') != candidate_id
            or metadata.get('projectId') != project_id
            or hashlib.sha256(raw).hexdigest() != metadata.get('sha256')):
        raise LipVmdError('Morph VMD candidate bytes changed', 409)
    try:
        from vmd_readback import read_vmd_morphs
        parsed = read_vmd_morphs(raw)
        revisions = metadata['revisions']
        plan = _plan(data_root, assets, source_for, project_id, metadata['srtSourceId'],
                     metadata['modelAssetId'], revisions['source'], revisions['reading'],
                     revisions['draft'], revisions['map'])
    except (ValueError, TypeError, KeyError) as exc:
        raise LipVmdError('Morph VMD candidate unreadable', 409) from exc
    if (parsed['morph_keys'] != metadata.get('morphKeys')
            or hashlib.sha256(plan['raw']).hexdigest() != metadata['sha256']):
        raise LipVmdError('Morph VMD candidate no longer matches project state', 409)
    return metadata, plan, raw


def candidate_file(data_root, assets, source_for, project_id, candidate_id):
    return validated_candidate(data_root, assets, source_for, project_id, candidate_id)[2]
