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


def _source(keys=((0, .2), (60, .2))):
    header = b'Vocaloid Motion Data 0002'.ljust(30, b'\0') + b'Test'.ljust(20, b'\0')
    bone = b'head'.ljust(15, b'\0') + struct.pack('<I3f4f', 0, 0, 0, 0, 0, 0, 0, 1)
    bone += bytes([20, 20, 107, 107]) * 16
    morph = 'あ'.encode('cp932').ljust(15, b'\0')
    rows = b''.join(morph + struct.pack('<If', frame, weight) for frame, weight in keys)
    return header + struct.pack('<I', 1) + bone + struct.pack('<I', len(keys)) + rows + b'\0' * 16


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


def _abrupt_cue():
    """Cue 1.0-1.5 s that opens at .8 and is cut at .52 while the source is .2."""
    cue = _cue(start_ms=1000, end_ms=1500, first_frame=30, first_weight=.8)
    cue[0]['records'] = cue[0]['records'][1:]
    return cue


@pytest.mark.parametrize('fps', [24, 30, 60])
def test_abrupt_srt_boundary_is_ramped_over_one_vmd_frame_and_passes(fps):
    # LIP-001 owner decision 2026-11-04: start and end ramp linearly over one
    # 30 fps VMD frame (= one project frame at 30 fps), so the composite passes.
    source = _source()
    output, report = compose_morph_vmd(source, _abrupt_cue(), [], 'model-1', fps, fps * 2)
    assert report['worst']['difference'] < 1e-6
    mouth = {row['frame']: row['weight'] for row in inspect_morph_section(output)['rows']
             if row['name'] == 'あ'}
    # Integer VMD frames keep the original SRT rule exactly.
    assert mouth[29] == pytest.approx(.2) and mouth[30] == pytest.approx(.8)
    assert mouth[44] == pytest.approx(.8 - .6 * 14 / 30, abs=1e-6)
    assert mouth[45] == pytest.approx(.2) and mouth[46] == pytest.approx(.2)
    cues, manual, _ = _inputs(_abrupt_cue(), [], 'model-1', fps, fps * 2)
    tracks = {'あ': [(0, .2), (60, .2)]}
    # Between them the start rises 29->30 (fully open at the SRT start) and
    # the end falls 44->45 (fully back to the source at the SRT end).
    assert _desired(tracks, cues, manual, 'あ', 29.5 / 30) == pytest.approx(.5)
    assert _desired(tracks, cues, manual, 'あ', 44.5 / 30) == pytest.approx(
        (.8 - .6 * 14 / 30 + .2) / 2)
    assert _desired(tracks, cues, manual, 'あ', 29 / 30) == pytest.approx(.2)
    assert _desired(tracks, cues, manual, 'あ', 30 / 30) == pytest.approx(.8)
    assert source == _source()


def test_gap_shorter_than_one_vmd_frame_connects_neighbouring_cues():
    # No integer VMD frame lies in the 1010-1020 ms gap, so the mouth goes
    # straight from cue 1 to cue 2 and never drops to the source value.
    cues_in = [{'startMs': 0, 'endMs': 1010, 'records': [
                   {'name': 'あ', 'frame': 0, 'weight': .5}, {'name': 'あ', 'frame': 30, 'weight': .5}]},
               {'startMs': 1020, 'endMs': 2000, 'records': [
                   {'name': 'あ', 'frame': 31, 'weight': .9}, {'name': 'あ', 'frame': 59, 'weight': .9}]}]
    output, report = compose_morph_vmd(_source(), cues_in, [], 'model-1', 60, 120)
    assert report['worst']['difference'] < 1e-6
    cues, manual, _ = _inputs(cues_in, [], 'model-1', 60, 120)
    tracks = {'あ': [(0, .2), (60, .2)]}
    assert _desired(tracks, cues, manual, 'あ', 1.015) == pytest.approx(.5 + .4 * (30.45 - 30))
    mouth = {row['frame']: row['weight'] for row in inspect_morph_section(output)['rows']
             if row['name'] == 'あ'}
    assert mouth[30] == pytest.approx(.5) and mouth[31] == pytest.approx(.9)


def test_abrupt_manual_key_is_still_rejected_without_output():
    # A manual face key is not smoothed: forcing 0 from exactly 1.0 s while the
    # lip ramp is still rising cannot be reproduced by a 30 fps VMD.
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ', 'time': 1.0, 'value': 0.0}]
    with pytest.raises(CompositeVmdError, match='cannot reproduce') as raised:
        compose_morph_vmd(_source(), _abrupt_cue(), manual, 'model-1', 60, 120)
    report = raised.value.report
    assert report['worst']['difference'] > .1
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


BROWSER_SCRIPT = """
import {evaluateLipCueTracks} from './studio/v05/js/pmx-lip-overlay-v199.mjs';
import {evaluateFaceKeys} from './studio/v05/js/pmx-face-keys-v96.js';
let raw=''; for await (const chunk of process.stdin) raw+=chunk;
const input=JSON.parse(raw);
const keys=input.source;
const source=frame=>{
  if(frame<=keys[0][0])return keys[0][1];
  for(let i=0;i<keys.length-1;i++){const [fa,a]=keys[i],[fb,b]=keys[i+1];
    if(frame<=fb)return a+(b-a)*(frame-fa)/(fb-fa);}
  return keys.at(-1)[1];
};
const values=input.seconds.map(seconds=>{
  const lip=evaluateLipCueTracks(input.cues,seconds,(name,frame)=>source(frame)).get('あ');
  const face=evaluateFaceKeys(input.manual,'model-1',seconds).get('あ');
  return face??lip??source(seconds*30);
});
process.stdout.write(JSON.stringify(values));
"""


def _browser_values(seconds, cue_tracks, manual, source_keys):
    result = subprocess.run(['node', '--input-type=module', '-e', BROWSER_SCRIPT],
                            input=json.dumps({'seconds': seconds, 'cues': cue_tracks,
                                              'manual': manual, 'source': source_keys},
                                             ensure_ascii=False),
                            text=True, encoding='utf-8', capture_output=True, check=True,
                            cwd=Path(__file__).resolve().parents[1])
    return json.loads(result.stdout)


def test_composite_priority_matches_the_browser_evaluators():
    manual = [{'instance_id': 'model-1', 'morph_name': 'あ',
               'time': 1.5, 'value': 0.0}]
    cue_tracks = _cue()
    seconds = [0, .5, 1, 1.25, 1.49, 1.5, 1.75, 1.999, 2]
    browser_values = _browser_values(seconds, cue_tracks, manual, [(0, .2), (60, .2)])
    cues, face, _ = _inputs(cue_tracks, manual, 'model-1', 60, 120)
    local_values = [_desired({'あ': [(0, .2), (60, .2)]}, cues, face, 'あ', time)
                    for time in seconds]
    assert local_values == pytest.approx(browser_values, abs=1e-12)


@pytest.mark.parametrize('fps', [24, 30, 60])
def test_ramped_boundary_curve_is_identical_in_python_browser_and_candidate_vmd(fps):
    # One curve for the composite, the 3D view and the preview/MP4 capture
    # (both use evaluateLipCueTracks through applySavedFace). The source mouth
    # moves (.2 -> .6), so a ramp needs the source value at the VMD frames.
    source_keys = [(0, .2), (60, .6)]
    cue_tracks = _abrupt_cue() + [{'startMs': 1510, 'endMs': 1990, 'records': [
        {'name': 'あ', 'frame': 46, 'weight': 1.0}, {'name': 'あ', 'frame': 59, 'weight': .3}]}]
    frames = fps * 2
    output, report = compose_morph_vmd(_source(source_keys), cue_tracks, [], 'model-1', fps, frames)
    assert report['worst']['difference'] < 1e-6
    seconds = sorted({frame / fps for frame in range(frames + 1)}
                     | {(frame + .5) / 30 for frame in range(60)}
                     | {(frame + .25) / 30 for frame in range(25, 62)})
    browser_values = _browser_values(seconds, cue_tracks, [], source_keys)
    cues, face, _ = _inputs(cue_tracks, [], 'model-1', fps, frames)
    local_values = [_desired({'あ': source_keys}, cues, face, 'あ', time) for time in seconds]
    assert local_values == pytest.approx(browser_values, abs=1e-12)
    baked = sorted((row['frame'], row['weight']) for row in inspect_morph_section(output)['rows']
                   if row['name'] == 'あ')
    from studio_v05_lip_vmd_composite import _curve
    vmd_values = [_curve(baked, time * 30) for time in seconds]
    assert vmd_values == pytest.approx(local_values, abs=1e-6)
    # Mid-ramp value: source at VMD frame 29 to the adopted .8 at frame 30.
    assert _desired({'あ': source_keys}, cues, face, 'あ', 29.5 / 30) == pytest.approx(
        ((.2 + .4 * 29 / 60) + .8) / 2)


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
