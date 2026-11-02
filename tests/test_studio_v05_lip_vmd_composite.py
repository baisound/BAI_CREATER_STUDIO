"""Compare a 30 fps VMD against the v0.5 lip and manual-face preview order."""
import hashlib
import json
import os
import struct
import subprocess
from pathlib import Path

import pytest

from studio_v05_lip_vmd_composite import CompositeVmdError, _desired, _inputs, compose_morph_vmd
from studio_v05_vmd_morph_rewrite import inspect_morph_section


def _source():
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    bone = b'head'.ljust(15, b'\0') + struct.pack('<I3f4f', 0, 0, 0, 0, 0, 0, 0, 1)
    bone += bytes([20, 20, 107, 107]) * 16
    morph = 'あ'.encode('cp932').ljust(15, b'\0')
    rows = b''.join(morph + struct.pack('<If', frame, .2) for frame in (0, 60))
    return header + struct.pack('<I', 1) + bone + struct.pack('<I', 2) + rows + b'\0' * 16


def _cue(start_ms=0, end_ms=2000, first_frame=0, first_weight=.2):
    return [{'startMs': start_ms, 'endMs': end_ms, 'records': [
        {'name': 'あ', 'frame': first_frame, 'weight': first_weight},
        {'name': 'あ', 'frame': 30, 'weight': .8},
        {'name': 'あ', 'frame': 60, 'weight': .2}]}]


def test_smooth_adoption_preserves_body_and_passes_all_project_and_mid_frames():
    source = _source()
    output, report = compose_morph_vmd(source, _cue(), [], 'model-1', 60, 120)
    before, after = inspect_morph_section(source), inspect_morph_section(output)
    assert before['prefix'] == after['prefix'] and before['tail'] == after['tail']
    assert report['status'] == 'sampled_binary_candidate_requires_real_pmx_validation'
    assert report['checkedValues'] == 181 and report['worst']['difference'] < 1e-6
    assert report['binary']['sourceBoneKeys'] == 1
    assert [(row['frame'], round(row['weight'], 3)) for row in after['rows'] if row['name'] == 'あ'][30:32] == [
        (30, .8), (31, .78)]
    assert source == _source()


def test_manual_zero_has_precedence_even_when_adopted_lip_is_nonzero():
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ', 'time': 0, 'value': 0.0,
               'track': 'expression'}]
    output, report = compose_morph_vmd(_source(), _cue(), manual, 'model-1', 60, 120)
    assert all(row['weight'] == 0 for row in inspect_morph_section(output)['rows']
               if row['name'] == 'あ')
    assert report['worst']['difference'] == 0


def test_abrupt_srt_boundary_is_rejected_without_output():
    cue = _cue(start_ms=1000, first_frame=30, first_weight=.8)
    cue[0]['records'] = cue[0]['records'][1:]
    with pytest.raises(CompositeVmdError, match='cannot reproduce') as raised:
        compose_morph_vmd(_source(), cue, [], 'model-1', 60, 120)
    report = raised.value.report
    assert report['worst']['difference'] > .2
    assert report['worst']['sampleKind'] in ('project', 'halfVmd')
    assert report['touchedMorphs'] == ['あ']


def test_manual_key_between_vmd_frames_is_rejected_and_cues_cannot_overlap():
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ',
               'time': 1 / 24, 'value': 0.0}]
    with pytest.raises(CompositeVmdError, match='cannot reproduce') as raised:
        compose_morph_vmd(_source(), [], manual, 'model-1', 24, 48)
    assert raised.value.report['worst']['difference'] > .01
    with pytest.raises(CompositeVmdError, match='overlap'):
        compose_morph_vmd(_source(), [_cue()[0], _cue(1000, 2000)[0]],
                          [], 'model-1', 60, 120)


def test_composite_priority_matches_the_browser_evaluators():
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ',
               'time': 1.5, 'value': 0.0}]
    cue_tracks = _cue()
    seconds = [0, .5, 1, 1.25, 1.49, 1.5, 1.75, 1.999, 2]
    script = """
import {evaluateLipCueTracks} from './studio/v05/js/pmx-lip-overlay-v199.mjs';
import {evaluateFaceKeys} from './studio/v05/js/pmx-face-keys-v96.js';
let raw=''; for await (const chunk of process.stdin) raw+=chunk;
const input=JSON.parse(raw);
const values=input.seconds.map(seconds=>{
  const source=.2;
  const lip=evaluateLipCueTracks(input.cues,seconds).get('あ');
  const face=evaluateFaceKeys(input.manual,'model-1',seconds).get('あ');
  return face??lip??source;
});
process.stdout.write(JSON.stringify(values));
"""
    result = subprocess.run(['node', '--input-type=module', '-e', script],
                            input=json.dumps({'seconds': seconds, 'cues': cue_tracks,
                                              'manual': manual}, ensure_ascii=False),
                            text=True, encoding='utf-8', capture_output=True, check=True,
                            cwd=Path(__file__).resolve().parents[1])
    browser_values = json.loads(result.stdout)
    cues, face, _ = _inputs(cue_tracks, manual, 'model-1', 60, 120)
    local_values = [_desired({'あ': [(0, .2), (60, .2)]}, cues, face, 'あ', time)
                    for time in seconds]
    assert local_values == pytest.approx(browser_values, abs=1e-12)


def test_real_long_vmd_binary_preservation_with_safe_constant_manual_key():
    root = os.environ.get('BAI_REAL_MMD_DATA')
    if not root:
        pytest.skip('BAI_REAL_MMD_DATA is not set')
    path = Path(root)/'mmd'/'vmd'/'神っぽいな.vmd'
    if not path.is_file():
        pytest.skip('Real long VMD unavailable')
    source = path.read_bytes()
    source_hash = hashlib.sha256(source).hexdigest()
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ', 'time': 0, 'value': .25}]
    output, report = compose_morph_vmd(source, [], manual, 'model-1', 60, 12000)
    before, after = inspect_morph_section(source), inspect_morph_section(output)
    assert before['prefix'] == after['prefix'] and before['tail'] == after['tail']
    assert all(abs(row['weight'] - .25) < 1e-7 for row in after['rows'] if row['name'] == 'あ')
    assert report['checkedValues'] == 18001 and report['worst']['difference'] < 1e-7
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source_hash
