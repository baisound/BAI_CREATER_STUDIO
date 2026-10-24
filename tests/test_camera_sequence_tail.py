"""Timeline-only end hold keeps the strict camera endpoint contract intact."""

import copy

import pytest

from bai_camera import DEFAULT
from camera_sequence_api import evaluate


def test_camera_end_hold_reuses_final_pose_without_modifying_project():
    project = copy.deepcopy(DEFAULT)
    before = copy.deepcopy(project)
    last = evaluate(project, 300)
    held = evaluate(project, 5400, hold_end=True)
    assert held['frame'] == 300
    assert held['requested_frame'] == 5400
    assert held['held_at_end'] is True
    assert held['pose'] == last['pose']
    assert project == before


def test_camera_end_hold_preserves_out_of_range_errors_by_default():
    with pytest.raises(ValueError, match='camera number out of range'):
        evaluate(DEFAULT, 5400)
    with pytest.raises(ValueError, match='camera number out of range'):
        evaluate(DEFAULT, -1, hold_end=True)


def test_camera_end_hold_keeps_last_half_open_shot():
    project = copy.deepcopy(DEFAULT)
    project['custom_presets'] = [{
        'name': 'last',
        'pose': {'position': [20, 2, 5], 'target': [0, 1, 0], 'fov': 40},
    }]
    project['sequence'] = [{'start': 240, 'end': 300,
                            'preset': 'last', 'transition': 'cut'}]
    before = copy.deepcopy(project)
    assert evaluate(project, 299)['preset'] == 'last'
    assert evaluate(project, 300)['source'] == 'keys'
    for requested in (300, 600):
        held = evaluate(project, requested, hold_end=True)
        assert held['frame'] == 299
        assert held['requested_frame'] == requested
        assert held['held_at_end'] is True
        assert held['preset'] == 'last'
        assert held['pose']['position'] == [20, 2, 5]
    assert project == before
