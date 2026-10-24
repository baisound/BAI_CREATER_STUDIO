"""LIP-001 candidate VMD needs confirmed readings, current drafts and PMX map."""
import hashlib
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

import server
from studio_project_catalog import create, set_fps
from studio_v05_lip_readings import set_reading
from studio_v05_lip_drafts import save as save_draft
from studio_v05_morph_maps import mutate
from studio_v05_pmx_analysis import inspect
from studio_v05_scene_model import set_model
from studio_v05_scene_instances import mutate as mutate_scene
from studio_v05_srt_sources import register
from tools.make_test_pmx import build_pmx
from vmd_readback import read_vmd_morphs
from studio_v05_lip_vmd_candidate import create as create_candidate, candidate_file, LipVmdError


def test_candidate_http_roundtrip_and_all_failure_gates(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    model = data / 'mmd' / 'A' / 'tiny.pmx'
    model.parent.mkdir(parents=True)
    original_pmx = build_pmx()
    model.write_bytes(original_pmx)
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '口形VMD候補')['id']
    set_fps(catalog, project_id, 24)
    asset = {'id': 'mmd:A:tiny.pmx', 'source': 'mmd', 'kind': 'A', 'format': 'PMX',
             'name': 'tiny.pmx', 'available': True}
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'MMD_DIR', data / 'mmd')
    monkeypatch.setattr(server, 'unified_assets', lambda: [asset])
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)
    source_for = lambda item: model if item is asset else None
    original_srt = b'1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nquiet\r\n'
    sources = register(data/'studio_v05_srt_sources', catalog, project_id, 0,
                       'original.srt', 'utf-8', original_srt)
    source = sources['sources'][0]
    set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                project_id, 0, source['id'], source['sha256'], 1, 'confirmed', 'あ', False)
    set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                project_id, 1, source['id'], source['sha256'], 2, 'unresolved', None, True)
    first = {'startFrame': 24, 'endFrame': 48, 'mouthShape': 'A', 'weight': .7}
    save_draft(data/'studio_v05_lip_drafts', catalog, data/'studio_v05_srt_sources',
               data/'studio_v05_lip_readings', project_id, 0, source['id'], source['sha256'],
               1, 1, 24, [first])
    analysis = inspect(asset['id'], [asset], source_for)
    entry = {'morph_id': 0, 'morph_name': 'あ', 'weight': .8}
    entries = {shape: entry if shape in ('A', 'I', 'U', 'E', 'O') else None
               for shape in ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')}
    mutate(data/'studio_v05_morph_maps', catalog, project_id, 0, 'set', [asset], source_for,
           model_asset_id=asset['id'], model_hash=analysis['modelHash'],
           analysis_hash=analysis['analysisHash'], entries=entries, confirmed=True)
    transform = {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]}
    set_model(data/'studio_v05_scene_models', catalog, project_id,
              asset['id'], transform, 0, [asset])
    scene_file = data/'studio_v05_scene_models'/(project_id+'.json')
    original_scene = scene_file.read_bytes()
    mutate_scene(data/'studio_v05_scene_instances', data/'studio_v05_scene_models',
        catalog, project_id, 'face-set', 0, [asset],
        face_key={'instance_id': 'legacy-primary', 'morph_name': 'あ',
                  'time': 1.0, 'value': 0.0, 'track': 'lip'},
        morph_lookup=lambda _source: {'あ'})
    face_file = data/'studio_v05_scene_instances'/(project_id+'.json')
    original_face = face_file.read_bytes()
    api = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=api.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{api.server_address[1]}/api/studio/v05/lip'

    def request(route, query=None, body=None, binary=False):
        url = base + route + ('?' + urllib.parse.urlencode(query) if query else '')
        payload = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=payload,
            headers={'Content-Type': 'application/json'} if body is not None else {})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read()
                return response.status, raw if binary else json.loads(raw)
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    body = {'project_id': project_id, 'source_id': source['id'], 'model_asset_id': asset['id'],
            'source_revision': 1, 'reading_revision': 2, 'draft_revision': 1,
            'map_revision': 1, 'dry_run': True}
    folder = data/'studio_v05_lip_vmd_candidates'/project_id
    source_file = data/'studio_v05_srt_sources'/project_id/'sources'/source['relativePath']
    try:
        assert request('/vmd-candidate', body={**body, 'reading_revision': 1})[0] == 409
        code, dry = request('/vmd-candidate', body=body)
        assert code == 200 and dry['morphKeys'] == 2 and dry['candidateId'] is None
        assert dry['cueCount'] == 2 and dry['silenceCount'] == 1
        assert not folder.exists()
        code, made = request('/vmd-candidate', body={**body, 'dry_run': False})
        assert code == 200 and made['candidateOnly'] and made['adopted'] is False
        assert made['status'] == 'binary_checked_requires_pmx_visual_validation'
        assert made['fileName'].startswith('LIP001-')
        code, raw = request('/vmd-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']}, binary=True)
        assert code == 200 and hashlib.sha256(raw).hexdigest() == made['sha256']
        parsed = read_vmd_morphs(raw)
        assert parsed['bone_keys'] == 0 and parsed['morph_keys'] == 2
        assert [(row['name'], row['frame']) for row in parsed['records']] == [('あ', 30), ('あ', 60)]
        assert abs(parsed['records'][0]['weight'] - .56) < 1e-6
        assert parsed['records'][1]['weight'] == 0
        assert source_file.read_bytes() == original_srt and model.read_bytes() == original_pmx
        assert request('/adoptions', {'project_id': project_id})[1]['tracks'] == []
        adopt = {'project_id': project_id, 'revision': 0, 'action': 'adopt',
                 'instance_id': 'legacy-primary', 'candidate_id': made['candidateId']}
        code, adopted = request('/adoptions', body=adopt)
        assert code == 200 and adopted['revision'] == 1
        assert adopted['tracks'][0]['status'] == 'ready' and adopted['tracks'][0]['cueTracks'] == []
        code, for_playback = request('/adoptions', {'project_id': project_id,
                                                    'instance_id': 'legacy-primary'})
        assert code == 200 and len(for_playback['tracks'][0]['cueTracks']) == 1
        assert [(row['name'], row['frame']) for row in for_playback['tracks'][0]['cueTracks'][0]['records']] == [
            ('あ', 30), ('あ', 60)]
        assert request('/adoptions', body={**adopt, 'revision': 0})[0] == 409
        code, undone = request('/adoptions', body={'project_id': project_id,
            'revision': 1, 'action': 'undo'})
        assert code == 200 and undone['tracks'] == []
        code, redone = request('/adoptions', body={'project_id': project_id,
            'revision': 2, 'action': 'redo'})
        assert code == 200 and redone['tracks'][0]['candidateId'] == made['candidateId']
        assert scene_file.read_bytes() == original_scene
        assert face_file.read_bytes() == original_face
        assert request('/vmd-candidate/file', {'project_id': project_id,
            'candidate_id': '0'*32})[0] == 404
        save_draft(data/'studio_v05_lip_drafts', catalog, data/'studio_v05_srt_sources',
                   data/'studio_v05_lip_readings', project_id, 1, source['id'], source['sha256'],
                   1, 1, 24, [
                       {'startFrame': 24, 'endFrame': 25, 'mouthShape': 'A', 'weight': .7},
                       {'startFrame': 25, 'endFrame': 48, 'mouthShape': 'A', 'weight': .8}])
        code, collision = request('/vmd-candidate', body={**body, 'draft_revision': 2})
        assert code == 422
        assert collision['issues'][0]['code'] == 'vmd_frame_collision'
        assert collision['issues'][0]['vmdFrame'] == 31
        assert collision['issues'][0]['srtIndices'] == [1]
        assert len(list(folder.glob('*.vmd'))) == 1
        assert request('/vmd-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']})[0] == 409
        code, stale = request('/adoptions', {'project_id': project_id,
                                             'instance_id': 'legacy-primary'})
        assert code == 200 and stale['tracks'][0]['status'] == 'stale'
        assert stale['tracks'][0]['cueTracks'] == []
        code, removed = request('/adoptions', body={'project_id': project_id,
            'revision': 3, 'action': 'remove', 'instance_id': 'legacy-primary'})
        assert code == 200 and removed['tracks'] == []
        assert request('/adoptions', body={'project_id': project_id,
            'revision': 4, 'action': 'undo'})[0] == 409
        set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                    project_id, 2, source['id'], source['sha256'], 2, 'unresolved', None, False)
        code, diagnosed = request('/vmd-candidate', body={**body, 'reading_revision': 3,
            'draft_revision': 2})
        assert code == 422
        assert {(issue.get('srtIndex'), issue['code']) for issue in diagnosed['issues']} == {
            (2, 'reading_unconfirmed'), (None, 'vmd_frame_collision')}
        set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                    project_id, 3, source['id'], source['sha256'], 1, 'unresolved', None, False)
        code, diagnosed = request('/vmd-candidate', body={**body, 'reading_revision': 4,
            'draft_revision': 2})
        assert code == 422
        assert [(issue['srtIndex'], issue['code']) for issue in diagnosed['issues']] == [
            (1, 'reading_unconfirmed'), (2, 'reading_unconfirmed')]
        source_file.write_bytes(b'changed')
        assert request('/vmd-candidate', body={**body, 'reading_revision': 4,
            'draft_revision': 2})[0] == 409
        assert model.read_bytes() == original_pmx
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)


def test_real_registered_pmx_morph_names_roundtrip(tmp_path):
    root = os.environ.get('BAI_REAL_MMD_DATA')
    if not root:
        pytest.skip('BAI_REAL_MMD_DATA is not set')
    model = Path(root)/'mmd'/'A'/'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx'
    if not model.is_file():
        pytest.skip('Real PMX A unavailable')
    original_hash = hashlib.sha256(model.read_bytes()).hexdigest()
    data = tmp_path/'data'
    catalog = data/'studio_v05_catalog.json'
    project_id = create(catalog, '実PMX口形VMD')['id']
    asset = {'id': 'mmd:A:real.pmx', 'format': 'PMX', 'available': True}
    assets = [asset]
    source_for = lambda row: model if row is asset else None
    original_srt = '1\n00:00:01,000 --> 00:00:03,000\nあい\n'.encode('utf-8')
    registered = register(data/'studio_v05_srt_sources', catalog, project_id, 0,
                          'real-mouth.srt', 'utf-8', original_srt)
    srt = registered['sources'][0]
    set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                project_id, 0, srt['id'], srt['sha256'], 1, 'confirmed', 'あい', False)
    save_draft(data/'studio_v05_lip_drafts', catalog, data/'studio_v05_srt_sources',
               data/'studio_v05_lip_readings', project_id, 0, srt['id'], srt['sha256'], 1, 1, 30,
               [{'startFrame': 30, 'endFrame': 60, 'mouthShape': 'A', 'weight': 1},
                {'startFrame': 60, 'endFrame': 90, 'mouthShape': 'I', 'weight': .5}])
    analysis = inspect(asset['id'], assets, source_for)
    by_name = {row['name']: row for row in analysis['morphs']}
    entries = {shape: ({'morph_id': by_name[name]['id'], 'morph_name': name, 'weight': weight}
                       if shape in ('A', 'I', 'U', 'E', 'O') else None)
               for shape, name, weight in [('A', 'あ', .8), ('I', 'い', .7), ('U', 'う', .6),
                                           ('E', 'え', .7), ('O', 'お', .9),
                                           ('Closed', '', 0), ('Rest', '', 0)]}
    mutate(data/'studio_v05_morph_maps', catalog, project_id, 0, 'set', assets, source_for,
           model_asset_id=asset['id'], model_hash=analysis['modelHash'],
           analysis_hash=analysis['analysisHash'], entries=entries, confirmed=True)
    arguments = (data, assets, source_for, project_id, srt['id'], asset['id'], 1, 1, 1, 1)
    report = create_candidate(*arguments, False)
    assert report['morphKeys'] == 4 and report['modelHash'] == original_hash
    raw = candidate_file(data, assets, source_for, project_id, report['candidateId'])
    parsed = read_vmd_morphs(raw)
    assert [(row['name'], row['frame']) for row in parsed['records']] == [
        ('あ', 30), ('あ', 60), ('い', 60), ('い', 90)]
    assert [round(row['weight'], 5) for row in parsed['records']] == [.8, 0, .35, 0]
    zero_a = {**entries, 'A': {**entries['A'], 'weight': 0}}
    mutate(data/'studio_v05_morph_maps', catalog, project_id, 1, 'set', assets, source_for,
           model_asset_id=asset['id'], model_hash=analysis['modelHash'],
           analysis_hash=analysis['analysisHash'], entries=zero_a, confirmed=True)
    with pytest.raises(LipVmdError) as rejected:
        create_candidate(*arguments[:-1], 2, True)
    assert rejected.value.issues[0]['code'] == 'morph_missing_or_zero'
    assert rejected.value.issues[0]['srtIndex'] == 1
    assert rejected.value.issues[0]['mouthShape'] == 'A'
    assert hashlib.sha256(model.read_bytes()).hexdigest() == original_hash
    original_file = data/'studio_v05_srt_sources'/project_id/'sources'/srt['relativePath']
    assert original_file.read_bytes() == original_srt
