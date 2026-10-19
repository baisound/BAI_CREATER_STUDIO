"""Phase E CAM-015: validate non-overlapping camera shot/cut edit decision list.

A shot references an existing camera preset. This stores cut decisions only;
it does not pretend to implement the renderer or multi-camera playback.
"""
from bai_camera import number


def validate_sequence(value, duration, preset_names):
    if not isinstance(value, list) or len(value) > 256:
        raise ValueError('sequence must be a list of at most 256 shots')
    names = set(preset_names)
    result = []
    previous_end = -1
    for shot in value:
        if not isinstance(shot, dict):
            raise ValueError('invalid camera shot')
        name = shot.get('preset')
        if not isinstance(name, str) or name not in names:
            raise ValueError('shot references missing camera preset')
        start = number(shot.get('start'), 0, duration)
        end = number(shot.get('end'), 0, duration)
        if int(start) != start or int(end) != end or end <= start:
            raise ValueError('invalid shot time range')
        if start < previous_end:
            raise ValueError('overlapping or unordered camera shots')
        previous_end = end
        result.append({'start': int(start), 'end': int(end), 'preset': name, 'transition': 'cut'})
    return result
