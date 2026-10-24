"""CAM-015 read-only effective shot evaluation, same half-open cut semantics as UI."""
from bai_camera import validate, sample, number


def evaluate(project, frame, *, hold_end=False):
    project = validate(project)
    requested = number(frame, 0, 1000000000) if hold_end else number(frame, 0, project['duration'])
    f = min(requested, project['duration']) if hold_end else requested
    # A shot ending at duration is half-open. In timeline hold mode, keep its
    # last visible camera frame instead of jumping to the key fallback at duration.
    shots = project.get('sequence', [])
    if hold_end and requested >= project['duration'] and shots and shots[-1]['end'] == project['duration']:
        f = project['duration'] - 1
    tail = {'requested_frame': requested, 'held_at_end': True} if requested > f else {}
    for shot in shots:
        if shot['start'] <= f < shot['end']:
            preset = next(p for p in project.get('custom_presets', []) if p['name'] == shot['preset'])
            return {'frame': f, 'source': 'sequence', 'preset': shot['preset'], **tail,
                    'range': {'start': shot['start'], 'end': shot['end']},
                    'pose': preset['pose']}
    return {'frame': f, 'source': 'keys', 'preset': None, **tail,
            'range': None, 'pose': sample(project, f)}
