"""CAM-015 validated single-operation edits; caller serializes read/edit/save."""
from bai_camera import validate


def edit(project, request):
    if not isinstance(request, dict) or request.get('action') not in ('add', 'update', 'remove'):
        raise ValueError('action must be add, update or remove')
    current = validate(project)
    expected = request.get('expected_sequence')
    if not isinstance(expected, list) or expected != current.get('sequence', []):
        raise ValueError('sequence conflict: refresh project and retry')
    sequence = [dict(s) for s in current.get('sequence', [])]
    action = request['action']
    if action == 'add':
        shot = request.get('shot')
        if not isinstance(shot, dict): raise ValueError('shot required')
        sequence.append(shot)
        sequence.sort(key=lambda s: s.get('start', -1) if isinstance(s, dict) and isinstance(s.get('start'), (int,float)) else -1)
    else:
        index = request.get('index')
        if type(index) is not int or not 0 <= index < len(sequence):
            raise ValueError('shot index out of range')
        if action == 'remove': sequence.pop(index)
        else:
            shot = request.get('shot')
            if not isinstance(shot, dict): raise ValueError('shot required')
            sequence[index] = shot
            sequence.sort(key=lambda s: s.get('start', -1) if isinstance(s, dict) and isinstance(s.get('start'), (int,float)) else -1)
    amended = dict(current, sequence=sequence)
    return validate(amended)
