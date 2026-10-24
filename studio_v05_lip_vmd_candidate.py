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
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


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
    if source['warnings']:
        raise LipVmdError('SRT cue overlap must be resolved before VMD candidate', 422)
    mapping = next((row for row in maps['maps'] if row['model_asset_id'] == model_asset_id
                    and row['source_status'] == 'valid' and row['confirmed']), None)
    if not mapping:
        raise LipVmdError('Confirmed PMX morph map for unchanged model required', 422)
    reading_by_cue = {(row['srtSourceId'], row['srtIndex']): row for row in readings['utterances']}
    draft_by_cue = {(row['srtSourceId'], row['srtIndex']): row for row in drafts['drafts']}
    fps = next((row['projectFps'] for row in drafts['drafts']
                if row['srtSourceId'] == source_id and row['draftStatus'] == 'draft'), None)
    records, cue_count, silence_count = [], 0, 0
    for cue in sorted(source['entries'], key=lambda item: (item['startMs'], item['index'])):
        cue_count += 1
        reading = reading_by_cue.get((source_id, cue['index']))
        if not reading or reading['sourceStatus'] != 'valid':
            raise LipVmdError(f'Cue {cue["index"]} needs an unchanged confirmed reading')
        if reading['explicitSilence']:
            silence_count += 1
            continue
        if reading['readingState'] != 'confirmed':
            raise LipVmdError(f'Cue {cue["index"]} reading is not confirmed')
        draft = draft_by_cue.get((source_id, cue['index']))
        if not draft or draft['draftStatus'] != 'draft':
            raise LipVmdError(f'Cue {cue["index"]} needs a current mouth draft')
        if (draft['sourceHash'] != source['sha256'] or draft['pronunciationVersion'] != reading['pronunciationVersion']
                or draft['sourceStartMs'] != cue['startMs'] or draft['sourceEndMs'] != cue['endMs']):
            raise LipVmdError(f'Cue {cue["index"]} draft no longer matches SRT or reading', 409)
        if fps is None:
            fps = draft['projectFps']
        if fps != draft['projectFps']:
            raise LipVmdError('Draft FPS differs across cues', 409)
        try:
            proposal = propose(catalog, Path(data_root)/'studio_v05_srt_sources',
                Path(data_root)/'studio_v05_lip_readings', project_id, source_id, cue['index'])
        except LipCandidateError as exc:
            raise LipVmdError(str(exc), exc.status) from exc
        if proposal['warnings']:
            raise LipVmdError(f'Cue {cue["index"]} has unresolved mouth candidate warnings')
        for segment in draft['segments']:
            shape = segment['mouthShape']
            entry = mapping['entries'][shape]
            if shape in VOWELS and (not entry or entry['weight'] <= 0):
                raise LipVmdError(f'PMX morph map for {shape} is missing or zero')
            if entry is None:
                continue
            weight = segment['weight'] * entry['weight']
            for frame, value in ((segment['startFrame'], weight), (segment['endFrame'], 0.0)):
                vmd_frame = _vmd_frame(frame, fps)
                if not 0 <= vmd_frame <= 1_000_000:
                    raise LipVmdError('VMD frame exceeds allowed range')
                records.append({'name': entry['morph_name'], 'frame': vmd_frame, 'weight': value})
                if len(records) > 100_000:
                    raise LipVmdError('Morph VMD key limit is 100000', 413)
    if not records:
        raise LipVmdError('No mapped mouth morph records to export')
    records.sort(key=lambda row: (row['frame'], row['name']))
    if any((a['frame'], a['name']) == (b['frame'], b['name']) for a, b in zip(records, records[1:])):
        raise LipVmdError('Multiple mouth keys collide on the same VMD frame; adjust draft boundaries')
    raw = encode_morph_vmd('BAI Lip', records)
    return {'raw': raw, 'records': records, 'sourceHash': source['sha256'],
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


def candidate_file(data_root, assets, source_for, project_id, candidate_id):
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
    return raw
