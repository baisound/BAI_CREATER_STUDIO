"""LIP-001 #187: scene-bound composite of source VMD, adopted lip and manual face keys.

Synthetic PMX (tools/make_test_pmx.py) and a synthetic VMD 0002 with bone, other
morph and camera records. Runs against an isolated data root through HTTP.
"""
import hashlib
import json
import types
import struct
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

import server
from studio_project_catalog import create, set_fps
from studio_v05_arrangement import place, edit_clip
from studio_v05_lip_drafts import save as save_draft
from studio_v05_lip_readings import set_reading
from studio_v05_lip_vmd_candidate import create as create_lip_candidate
from studio_v05_lip_adoptions import mutate as mutate_adoption
from studio_v05_morph_maps import mutate as mutate_map
from studio_v05_multi_motion import assign
from studio_v05_pmx_analysis import inspect
from studio_v05_scene_instances import mutate as mutate_scene, read as read_scene
from studio_v05_scene_model import set_model
from studio_v05_srt_sources import register
from studio_v05_vmd_morph_rewrite import inspect_morph_section
from tools.make_test_pmx import build_pmx

INSTANCE = 'legacy-primary'


def _vmd(morphs=None):
    def name(text):
        return text.encode('cp932').ljust(15, b'\0')
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + 'テスト'.encode('cp932').ljust(20, b'\0')
    bones = b''.join(name('センター') + struct.pack('<I3f4f', frame, 0, y, 0, 0, 0, 0, 1)
                     + bytes([20, 20, 107, 107]) * 16 for frame, y in ((0, 0), (45, 1)))
    if morphs is None:
        morphs = [('あ', 0, .8), ('あ', 30, .8), ('あ', 60, 0.), ('あ', 90, 0.),
                  ('まばたき', 10, 1.), ('まばたき', 20, 0.)]
    morph_raw = b''.join(name(n) + struct.pack('<If', f, w) for n, f, w in morphs)
    camera = struct.pack('<If3f3f', 0, 30, 0, 10, 0, 0, 0, 0) + bytes(24) + struct.pack('<I', 30) + b'\0'
    assert len(camera) == 61
    return (header + struct.pack('<I', 2) + bones + struct.pack('<I', len(morphs)) + morph_raw
            + struct.pack('<I', 1) + camera + struct.pack('<I', 0) * 3)


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _setup(tmp_path, monkeypatch, original_vmd):
    """Project with a 1.0-2.0 s SRT cue adopted as A, a 0-3 s source VMD clip and HTTP API."""
    data = tmp_path / 'data'
    model = data / 'mmd' / 'A' / 'tiny.pmx'
    motion = data / 'mmd' / 'vmd' / 'source dance.vmd'
    model.parent.mkdir(parents=True)
    motion.parent.mkdir(parents=True)
    original_pmx = build_pmx()
    model.write_bytes(original_pmx)
    motion.write_bytes(original_vmd)
    catalog = data / 'studio_v05_catalog.json'
    project_id = create(catalog, '口形合成VMD')['id']
    set_fps(catalog, project_id, 30)
    pmx = {'id': 'mmd:A:tiny.pmx', 'source': 'mmd', 'kind': 'A', 'format': 'PMX',
           'name': 'tiny.pmx', 'available': True}
    vmd = {'id': 'mmd:vmd:source dance.vmd', 'source': 'mmd', 'kind': 'vmd', 'format': 'VMD',
           'name': 'source dance.vmd', 'available': True}
    assets = [pmx, vmd]
    source_for = lambda item: model if item is pmx else None
    monkeypatch.setattr(server, 'DATA', data)
    monkeypatch.setattr(server, 'MMD_DIR', data / 'mmd')
    monkeypatch.setattr(server, 'unified_assets', lambda: assets)
    monkeypatch.setattr(server, 'event', lambda *args, **kwargs: None)

    # SRT cue 1.0–2.0 s, confirmed reading, one A segment, confirmed PMX morph map.
    original_srt = b'1\r\n00:00:01,000 --> 00:00:02,000\r\nhello\r\n'
    source = register(data/'studio_v05_srt_sources', catalog, project_id, 0,
                      'song.srt', 'utf-8', original_srt)['sources'][0]
    set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                project_id, 0, source['id'], source['sha256'], 1, 'confirmed', 'あ', False)
    save_draft(data/'studio_v05_lip_drafts', catalog, data/'studio_v05_srt_sources',
               data/'studio_v05_lip_readings', project_id, 0, source['id'], source['sha256'],
               1, 1, 30, [{'startFrame': 30, 'endFrame': 60, 'mouthShape': 'A', 'weight': 1}])
    analysis = inspect(pmx['id'], assets, source_for)
    entry = {'morph_id': 0, 'morph_name': 'あ', 'weight': .8}
    mutate_map(data/'studio_v05_morph_maps', catalog, project_id, 0, 'set', assets, source_for,
               model_asset_id=pmx['id'], model_hash=analysis['modelHash'],
               analysis_hash=analysis['analysisHash'],
               entries={shape: entry if shape in 'AIUEO' else None
                        for shape in ('A', 'I', 'U', 'E', 'O', 'Closed', 'Rest')}, confirmed=True)
    set_model(data/'studio_v05_scene_models', catalog, project_id, pmx['id'],
              {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]}, 0, assets)
    lip = create_lip_candidate(data, assets, source_for, project_id, source['id'], pmx['id'],
                               1, 1, 1, 1, False)
    mutate_adoption(data, assets, source_for, project_id, 0, 'adopt', INSTANCE, lip['candidateId'])

    # Source VMD clip 0–3 s assigned to the PMX scene instance.
    arrangement_root = data / 'studio_v05_arrangements'
    clip = place(arrangement_root, catalog, project_id, vmd['id'], 'motion', 0, 3, 0, assets)['clip']
    assign(arrangement_root, data/'studio_v05_scene_instances', data/'studio_v05_scene_models',
           catalog, project_id, clip['id'], 1, INSTANCE, assets)
    scene_root, legacy_root = data/'studio_v05_scene_instances', data/'studio_v05_scene_models'

    def scene_revision():
        return read_scene(scene_root, legacy_root, catalog, project_id, assets)['revision']

    def face(action, key):
        mutate_scene(scene_root, legacy_root, catalog, project_id, action, scene_revision(), assets,
                     face_key=key, morph_lookup=lambda _source: {'あ'})

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

    def body(**overrides):
        return {'project_id': project_id, 'instance_id': INSTANCE, 'clip_id': clip['id'],
                'adoption_revision': 1, 'scene_revision': scene_revision(),
                'arrangement_revision': 2, 'dry_run': True, **overrides}

    return types.SimpleNamespace(**{key: value for key, value in locals().items()
                                    if key not in ('tmp_path', 'monkeypatch')})


def test_composite_candidate_http_full_key_readback_and_rejections(tmp_path, monkeypatch):
    original_vmd = _vmd()
    ctx = _setup(tmp_path, monkeypatch, original_vmd)
    (data, model, motion, original_pmx, catalog, project_id, source, lip, clip, arrangement_root,
     scene_root, scene_revision, face, api, thread, request, body) = (
        ctx.data, ctx.model, ctx.motion, ctx.original_pmx, ctx.catalog, ctx.project_id,
        ctx.source, ctx.lip, ctx.clip, ctx.arrangement_root, ctx.scene_root,
        ctx.scene_revision, ctx.face, ctx.api, ctx.thread, ctx.request, ctx.body)
    # Manual keys after the cue: continuous with the source (0) then ramp to 0.5.
    face('face-set', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': 2.5, 'value': 0.0,
                      'track': 'expression'})
    face('face-set', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': 3.0, 'value': .5,
                      'track': 'expression'})

    folder = data / 'studio_v05_lip_composite_candidates' / project_id
    watched = [model, motion, data/'studio_v05_arrangements'/(project_id+'.json'),
               scene_root/(project_id+'.json'), data/'studio_v05_lip_adoptions'/(project_id+'.json'),
               data/'studio_v05_srt_sources'/project_id/'sources'/source['relativePath']]
    before = [_sha(path.read_bytes()) for path in watched]
    try:
        assert request('/composite-candidate', body={**body(), 'extra': 1})[0] == 400
        assert request('/composite-candidate', body=body(adoption_revision=0))[0] == 409
        assert request('/composite-candidate', body=body(arrangement_revision=1))[0] == 409

        code, dry = request('/composite-candidate', body=body())
        assert code == 200, dry
        assert dry['candidateId'] is None and not folder.exists()
        assert dry['status'] == 'composite_binary_checked_requires_real_pmx_validation'
        assert dry['comparison']['touchedMorphs'] == ['あ']
        assert dry['comparison']['worst']['difference'] < 1e-6
        assert dry['adoption'] == {'candidateId': lip['candidateId'], 'sha256': lip['sha256']}
        assert dry['faceKeyCount'] == 2 and dry['projectFrames'] == 90

        code, made = request('/composite-candidate', body=body(dry_run=False))
        assert code == 200, made
        assert made['fileName'].startswith('LIP001-COMPOSITE-source dance-')
        assert made['readback']['status'] == 'passed_full_key_readback'
        assert made['readback']['source'] == 'written_file'
        assert made['readback']['untouchedKeys'] == 2 and made['readback']['touchedKeys'] == 91
        assert made['placedInProject'] is False
        code, raw = request('/composite-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']}, binary=True)
        assert code == 200 and _sha(raw) == made['sha256']
        source_section, out = inspect_morph_section(original_vmd), inspect_morph_section(raw)
        assert out['prefix'] == source_section['prefix'] and out['tail'] == source_section['tail']
        assert out['boneKeys'] == 2 and out['tailCounts']['camera'] == 1
        blink = [(row['frame'], row['weight']) for row in out['rows'] if row['name'] == 'まばたき']
        assert blink == [(10, 1.0), (20, 0.0)]
        mouth = {row['frame']: row['weight'] for row in out['rows'] if row['name'] == 'あ'}
        assert sorted(mouth) == list(range(91))
        assert abs(mouth[30] - .8) < 1e-6 and abs(mouth[45] - .4) < 1e-6
        assert mouth[60] == 0 and mouth[75] == 0 and abs(mouth[90] - .5) < 1e-6
        assert abs(mouth[84] - .3) < 1e-6
        assert [_sha(path.read_bytes()) for path in watched] == before

        # A manual key that jumps between VMD frames is a discontinuity: no file.
        face('face-set', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': .5, 'value': 0.0,
                          'track': 'expression'})
        code, rejected = request('/composite-candidate', body=body(dry_run=False))
        assert code == 422 and rejected['issues'][0]['code'] == 'discontinuity'
        assert rejected['issues'][0]['morphName'] == 'あ'
        assert rejected['report']['worst']['difference'] > .01
        assert len(list(folder.glob('*.vmd'))) == 1
        # The earlier candidate no longer matches the project and is not served.
        assert request('/composite-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']})[0] == 409
        face('face-remove', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': .5})
        assert request('/composite-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']}, binary=True)[0] == 200

        # Manual key after the clip end is listed, not silently dropped.
        face('face-set', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': 3.5, 'value': .1,
                          'track': 'expression'})
        code, outside = request('/composite-candidate', body=body())
        assert code == 422 and [i['code'] for i in outside['issues']] == ['manual_key_outside_clip']
        face('face-remove', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': 3.5})

        # Clip not starting at 0 is unsupported in this stage.
        edit_clip(arrangement_root, catalog, project_id, clip['id'], 2, 'update',
                  start=1, duration=3, track='motion', lane=1, source_start=0)
        code, moved = request('/composite-candidate', body=body(arrangement_revision=3))
        assert code == 422 and moved['issues'][0]['code'] == 'clip_start_not_zero'
        edit_clip(arrangement_root, catalog, project_id, clip['id'], 3, 'update',
                  start=0, duration=3, track='motion', lane=1, source_start=0)

        # Stale adoption (reading changed) is rejected and the old candidate expires.
        set_reading(data/'studio_v05_lip_readings', catalog, data/'studio_v05_srt_sources',
                    project_id, 1, source['id'], source['sha256'], 1, 'confirmed', 'い', False)
        code, stale = request('/composite-candidate', body=body(arrangement_revision=4))
        assert code == 409 and stale['issues'][0]['code'] == 'adoption_stale'
        assert request('/composite-candidate/file', {'project_id': project_id,
            'candidate_id': made['candidateId']})[0] == 409
        assert request('/composite-candidate/file', {'project_id': project_id,
            'candidate_id': '0' * 32})[0] == 404
        assert model.read_bytes() == original_pmx and motion.read_bytes() == original_vmd
        assert len(list(folder.glob('*.vmd'))) == 1
    finally:
        api.shutdown()
        api.server_close()
        thread.join(timeout=5)


def test_composite_candidate_succeeds_when_srt_start_opens_a_closed_source_mouth(tmp_path, monkeypatch):
    # LIP-001 owner decision 2026-11-04: a dance VMD keeps the mouth closed (0)
    # and the SRT cue opens it to .8 at 1.0 s. The adopted curve now ramps over
    # one VMD frame (F29 -> F30), so the candidate is written instead of a 422.
    original_vmd = _vmd([('あ', 0, 0.), ('あ', 90, 0.), ('まばたき', 10, 1.), ('まばたき', 20, 0.)])
    ctx = _setup(tmp_path, monkeypatch, original_vmd)
    try:
        code, made = ctx.request('/composite-candidate', body=ctx.body(dry_run=False))
        assert code == 200, made
        assert made['comparison']['worst']['difference'] < 1e-6
        assert made['readback']['status'] == 'passed_full_key_readback'
        code, raw = ctx.request('/composite-candidate/file', {'project_id': ctx.project_id,
            'candidate_id': made['candidateId']}, binary=True)
        assert code == 200 and _sha(raw) == made['sha256']
        mouth = {row['frame']: row['weight'] for row in inspect_morph_section(raw)['rows']
                 if row['name'] == 'あ'}
        assert mouth[29] == 0 and abs(mouth[30] - .8) < 1e-6
        assert abs(mouth[45] - .4) < 1e-6 and mouth[60] == 0 and mouth[90] == 0
        assert ctx.motion.read_bytes() == original_vmd

        # A manual key that forces 0 inside the ramp is still a real discontinuity.
        ctx.face('face-set', {'instance_id': INSTANCE, 'morph_name': 'あ', 'time': 1.0,
                              'value': 0.0, 'track': 'expression'})
        code, rejected = ctx.request('/composite-candidate', body=ctx.body(dry_run=False))
        assert code == 422 and rejected['issues'][0]['code'] == 'discontinuity'
        folder = ctx.data / 'studio_v05_lip_composite_candidates' / ctx.project_id
        assert len(list(folder.glob('*.vmd'))) == 1
    finally:
        ctx.api.shutdown()
        ctx.api.server_close()
        ctx.thread.join(timeout=5)
