"""CAM-015 read-only effective shot evaluation, same half-open cut semantics as UI."""
from bai_camera import validate, sample, number


def evaluate(project, frame):
    project = validate(project)
    f = number(frame, 0, project['duration'])
    for shot in project.get('sequence', []):
        if shot['start'] <= f < shot['end']:
            preset = next(p for p in project.get('custom_presets', []) if p['name'] == shot['preset'])
            return {'frame': f, 'source': 'sequence', 'preset': shot['preset'],
                    'range': {'start': shot['start'], 'end': shot['end']},
                    'pose': preset['pose']}
    return {'frame': f, 'source': 'keys', 'preset': None,
            'range': None, 'pose': sample(project, f)}
