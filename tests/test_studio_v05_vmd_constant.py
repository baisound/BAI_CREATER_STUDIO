import math
import os
from pathlib import Path

import pytest

from studio_v05_vmd_constant import constant_replacements
from studio_v05_vmd_rewrite import rewrite_bone_section
from vmd_readback import read_vmd_bones
from test_studio_v05_vmd_rewrite import fixture


def layer(keys, **updates):
    value = {'instance_id': 'model-1', 'clip_id': 'clip-1', 'fps': 60,
             'start': 0, 'duration': 10, 'weight': 1, 'muted': False,
             'keys': keys}
    return value | updates


def key(bone='頭', frame=240, position=None, angle=0):
    result = {'bone': bone, 'frame': frame,
              'rotation': [0, math.sin(angle / 2), 0, math.cos(angle / 2)]}
    if position is not None:
        result['position'] = position
    return result


def test_constant_key_rewrites_all_existing_bone_keys_and_adds_missing_target(tmp_path):
    original = fixture()
    layers = [layer([key(position=[0.3, 0, 0.2], angle=0.2),
                     key('左足ＩＫ', position=[0.1, 0, 0])])]
    samples = constant_replacements(original, layers, instance_id='model-1', clip_id='clip-1')
    assert [(row['bone'], row['frame']) for row in samples] == [
        ('頭', 0), ('左足ＩＫ', 0)]
    assert samples[0]['position'] == pytest.approx([0.3, 0, -0.2])
    assert samples[0]['rotation'][1] == pytest.approx(-math.sin(0.1))
    rewritten, report = rewrite_bone_section(original, samples)
    assert report['replaced'] == 1 and report['added'] == 1
    assert rewritten.endswith(original[-report['suffix_bytes']:])
    output = tmp_path / 'candidate.vmd'
    output.write_bytes(rewritten)
    parsed = read_vmd_bones(output)
    assert parsed['records'][1]['bone'] == 'センター'
    assert parsed['records'][1]['position'][0] == 2


def test_composes_multiple_constant_layers_in_saved_order():
    samples = constant_replacements(fixture(), [
        layer([key(position=[1, 0, 0], angle=0.4)], weight=0.5),
        layer([key(position=[0.5, 0, 0], angle=0.2)], weight=1),
    ], instance_id='model-1', clip_id='clip-1')
    assert samples[0]['position'][0] == pytest.approx(1.0)
    assert samples[0]['rotation'][1] == pytest.approx(-math.sin(0.2), abs=1e-7)
    assert samples[0]['rotation'][3] == pytest.approx(math.cos(0.2), abs=1e-7)


@pytest.mark.parametrize('invalid', [
    layer([key(), key(frame=241)]),
    layer([key()], fade_in_frames=10),
    layer([key()], start_frame=1),
    layer([key()], end_frame=599),
    layer([key()], weight=0),
    layer([key()], muted=True),
])
def test_rejects_temporal_or_inactive_layers(invalid):
    with pytest.raises(ValueError):
        constant_replacements(fixture(), [invalid], instance_id='model-1', clip_id='clip-1')


def test_real_head_vmd_all_source_keys_receive_same_delta(tmp_path):
    data_root = Path(os.environ.get('BAI_REAL_MMD_DATA', Path(__file__).resolve().parents[1] / 'data'))
    source = data_root / 'mmd' / 'vmd' / '狐面物理確認用_頭振り_F000-0300.vmd'
    if not source.is_file():
        pytest.skip('registered local VMD is unavailable')
    original = source.read_bytes()
    original_keys = read_vmd_bones(source)['records']
    samples = constant_replacements(original, [layer([key(position=[0.3, 0, 0], angle=0.2)])],
                                    instance_id='model-1', clip_id='clip-1')
    assert len(samples) == len(original_keys)
    output_bytes, report = rewrite_bone_section(original, samples)
    assert report['replaced'] == len(original_keys) and report['added'] == 0
    output = tmp_path / 'real-constant.vmd'
    output.write_bytes(output_bytes)
    result = read_vmd_bones(output)['records']
    for before, after in zip(original_keys, result):
        assert (before['bone'], before['frame']) == (after['bone'], after['frame'])
        assert after['position'][0] - before['position'][0] == pytest.approx(0.3, abs=1e-6)
    assert source.read_bytes() == original
