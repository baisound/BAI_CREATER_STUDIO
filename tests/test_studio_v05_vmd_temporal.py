import ast
import math
import os
from pathlib import Path

import pytest

from studio_v05_vmd_temporal import temporal_replacements
from studio_v05_vmd_rewrite import rewrite_bone_section
from test_studio_v05_vmd_rewrite import fixture


def layer(keys, **changes):
    return {'instance_id': 'model-1', 'clip_id': 'clip-1', 'fps': 60,
            'start': 0, 'duration': 2, 'weight': 1, 'muted': False,
            'keys': keys} | changes


def key(frame, x, angle=0):
    return {'bone': '頭', 'frame': frame, 'position': [x, 0, 0],
            'rotation': [0, math.sin(angle / 2), 0, math.cos(angle / 2)]}


def test_linear_temporal_keys_pass_60_to_30_fps_gate_and_preserve_suffix():
    source = fixture()
    samples, report = temporal_replacements(
        source, [layer([key(0, 0), key(60, 0.01), key(118, 0)])],
        instance_id='model-1', clip_id='clip-1')
    assert len(samples) == 4
    assert samples[1]['frame'] == 30
    assert samples[1]['position'][0] == pytest.approx(0.01)
    assert report['checked_project_frames'] == 120
    assert report['sampled_vmd_keys'] == 4
    assert report['vmd_frame_span'] == 61
    assert report['max_position_error'] < 1e-3
    candidate, structure = rewrite_bone_section(source, samples)
    assert candidate.endswith(source[-structure['suffix_bytes']:])
    assert structure['added'] == 3


def test_solo_temporal_ignores_other_layer():
    first = layer([key(0, 0), key(60, 0.01), key(118, 0)], solo=True)
    other = layer([key(0, 0.02), key(118, 0.02)])
    actual, _ = temporal_replacements(fixture(), [first, other],
                                      instance_id='model-1', clip_id='clip-1')
    expected, _ = temporal_replacements(fixture(), [first],
                                        instance_id='model-1', clip_id='clip-1')
    assert actual == expected


def test_one_project_frame_spike_is_rejected_with_position_error():
    with pytest.raises(ValueError, match='30fps sample error exceeds limit.*worst_position_frame.*1'):
        temporal_replacements(fixture(), [layer([key(0, 0), key(1, 1), key(2, 0)])],
                              instance_id='model-1', clip_id='clip-1')


def test_one_project_frame_rotation_spike_is_rejected():
    with pytest.raises(ValueError, match='max_angle_error_degrees'):
        temporal_replacements(fixture(), [layer([key(0, 0), key(1, 0, 0.3), key(2, 0)])],
                              instance_id='model-1', clip_id='clip-1')


def test_constant_ik_target_in_temporal_layer_stays_on_until_clip_end():
    foot = {'bone': '左足ＩＫ', 'frame': 60, 'position': [0.3, 0, 0],
            'rotation': [0, 0, 0, 1]}
    samples, report = temporal_replacements(
        fixture(), [layer([key(0, 0), key(60, 0.01), key(118, 0), foot])],
        instance_id='model-1', clip_id='clip-1')
    target = {row['frame']: row for row in samples if row['bone'] == '左足ＩＫ'}
    assert target[59]['position'][0] == pytest.approx(0.3)
    assert target[60]['position'][0] == pytest.approx(0)
    assert report['max_position_error'] < 1e-3


def test_rejects_inactive_and_oversize_clip():
    with pytest.raises(ValueError, match='Active correction'):
        temporal_replacements(fixture(), [layer([key(0, 0)], muted=True)],
                              instance_id='model-1', clip_id='clip-1')
    with pytest.raises(ValueError, match='bounded frame limit'):
        temporal_replacements(fixture(), [layer([key(0, 0)], duration=1000)],
                              instance_id='model-1', clip_id='clip-1')


def test_real_vmd_keeps_source_curve_and_validates_600_project_frames():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not source.is_file():
        pytest.skip('registered local VMD is unavailable')
    original = source.read_bytes()
    saved = layer([key(0, 0), key(300, 0.01), key(598, 0)], duration=10)
    samples, report = temporal_replacements(original, [saved], instance_id='model-1', clip_id='clip-1')
    output, structure = rewrite_bone_section(original, samples)
    assert report['checked_project_frames'] == 600
    assert report['max_position_error'] < 1e-3
    assert report['max_angle_error_degrees'] < 0.01
    assert structure['replaced'] == 9 and structure['added'] == 1
    assert output.endswith(original[-structure['suffix_bytes']:])
    assert source.read_bytes() == original


def test_real_vmd_24fps_fade_keeps_rotation_curve_and_rejects_early_weight():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not source.is_file():
        pytest.skip('registered local VMD is unavailable')
    original = source.read_bytes()
    saved = layer([key(0, 0), key(120, 0.01), key(238, 0)], fps=24, duration=10,
                  start_frame=48, end_frame=192, fade_in_frames=24, fade_out_frames=24)
    samples, report = temporal_replacements(original, [saved], instance_id='model-1', clip_id='clip-1')
    assert report['checked_project_frames'] == 240
    assert report['max_position_error'] < 1e-3
    assert report['max_angle_error_degrees'] < 0.01
    assert report['sampled_vmd_keys'] == 11
    output, structure = rewrite_bone_section(original, samples)
    assert structure['replaced'] == 9 and structure['added'] == 2
    assert output.endswith(original[-structure['suffix_bytes']:])
    assert source.read_bytes() == original


def test_real_vmd_refuses_fade_boundary_that_splits_moving_source_curve():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not source.is_file():
        pytest.skip('registered local VMD is unavailable')
    original = source.read_bytes()
    saved = layer([key(0, 0), key(120, 0.01), key(238, 0)], fps=24, duration=10,
                  start_frame=80, end_frame=192, fade_in_frames=24, fade_out_frames=24)
    with pytest.raises(ValueError, match='max_angle_error_degrees'):
        temporal_replacements(original, [saved], instance_id='model-1', clip_id='clip-1')
    assert source.read_bytes() == original


def test_real_dense_source_curve_fails_closed_at_fractional_fps():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '神っぽいな.vmd'
    if not source.is_file():
        pytest.skip('registered dense local VMD is unavailable')
    original = source.read_bytes()
    saved = layer([key(0, 0), key(120, 0.01), key(238, 0)], fps=24000 / 1001,
                  duration=10, start_frame=48, end_frame=192,
                  fade_in_frames=24, fade_out_frames=24)
    with pytest.raises(ValueError, match='30fps sample error exceeds limit.*max_angle_error_degrees'):
        temporal_replacements(original, [saved], instance_id='model-1', clip_id='clip-1')
    assert source.read_bytes() == original


def test_long_real_vmd_allows_unkeyed_hair_step_but_refuses_moving_head_step():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '神っぽいな.vmd'
    if not source.is_file():
        pytest.skip('registered dense local VMD is unavailable')
    original = source.read_bytes()
    base = layer([key(5400, 0.15, math.radians(12))], duration=204,
                 start_frame=5338, end_frame=5464)
    with pytest.raises(ValueError, match='30fps sample error exceeds limit') as failure:
        temporal_replacements(original, [base], instance_id='model-1', clip_id='clip-1')
    head_report = ast.literal_eval(str(failure.value).split(': ', 1)[1])
    assert head_report['max_angle_error_degrees'] > 1
    hair = base | {'keys': [base['keys'][0] | {'bone': '髪_16-03'}]}
    samples, hair_report = temporal_replacements(
        original, [hair], instance_id='model-1', clip_id='clip-1')
    assert samples
    assert hair_report['checked_project_frames'] == 12240
    assert hair_report['max_position_error'] < 1e-3
    assert hair_report['max_angle_error_degrees'] < 0.01
    assert source.read_bytes() == original


def test_long_real_moving_head_step_requires_flat_boundaries_and_bounded_angle():
    root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = root / 'mmd' / 'vmd' / '神っぽいな.vmd'
    if not source.is_file():
        pytest.skip('registered dense local VMD is unavailable')
    original = source.read_bytes()
    # Source head keys at 2667/2669 and 2831/2833 share the same poses.
    saved = layer([key(5400, 0.15, math.radians(8))], duration=204,
                  start_frame=5338, end_frame=5666)
    samples, report = temporal_replacements(
        original, [saved], instance_id='model-1', clip_id='clip-1')
    assert samples
    assert report['checked_project_frames'] == 12240
    assert report['max_position_error'] < 1e-3
    assert report['max_angle_error_degrees'] < 0.01
    larger = saved | {'keys': [key(5400, 0.15, math.radians(12))]}
    with pytest.raises(ValueError, match='30fps sample error exceeds limit') as failure:
        temporal_replacements(original, [larger], instance_id='model-1', clip_id='clip-1')
    larger_report = ast.literal_eval(str(failure.value).split(': ', 1)[1])
    assert larger_report['max_angle_error_degrees'] > 0.01
    assert source.read_bytes() == original
