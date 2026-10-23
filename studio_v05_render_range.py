"""Revisioned v0.5 In/Out markers, resolved against the saved project timeline."""
from decimal import Decimal, InvalidOperation, ROUND_CEILING
from pathlib import Path
import json
import threading

from studio_project_catalog import load as load_catalog, _atomic
from studio_v05_arrangement import read as read_arrangement

LOCK = threading.RLock()
MAX_FRAME = 20_736_000  # 24 hours at the maximum configured 240 fps.


class RenderRangeError(ValueError):
    pass


def _project(catalog, project_id):
    if not isinstance(project_id, str):
        raise RenderRangeError('Unknown project ID')
    project = next((p for p in load_catalog(catalog)['projects'] if p['id'] == project_id), None)
    if project is None:
        raise RenderRangeError('Unknown project ID')
    fps = project.get('fps', 60)
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or not 1 <= fps <= 240:
        raise RenderRangeError('Invalid project FPS')
    return project, Decimal(str(fps))


def _valid_marker(value):
    return value is None or type(value) is int and 0 <= value <= MAX_FRAME


def _stored(path, project_id):
    if not path.exists():
        return {'schema': 1, 'project_id': project_id, 'revision': 0,
                'in_frame': None, 'out_frame': None}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError, UnicodeError) as exc:
        raise RenderRangeError('Invalid saved range; original retained') from exc
    if (not isinstance(data, dict) or set(data) !=
            {'schema', 'project_id', 'revision', 'in_frame', 'out_frame'} or
            data['schema'] != 1 or data['project_id'] != project_id or
            type(data['revision']) is not int or data['revision'] < 0 or
            not _valid_marker(data['in_frame']) or not _valid_marker(data['out_frame'])):
        raise RenderRangeError('Invalid saved range; original retained')
    return data


def _final_frame(clips, fps):
    if not clips:
        return 0
    try:
        end = max(Decimal(str(c['start'])) + Decimal(str(c['duration'])) for c in clips)
    except (KeyError, ValueError, TypeError, InvalidOperation) as exc:
        raise RenderRangeError('Invalid saved clip time; original retained') from exc
    if not end.is_finite() or end <= 0:
        raise RenderRangeError('Invalid saved clip time; original retained')
    end_exclusive = int((end * fps).to_integral_value(rounding=ROUND_CEILING))
    if not 1 <= end_exclusive <= MAX_FRAME:
        raise RenderRangeError('Project duration is outside render range')
    return end_exclusive - 1


def _resolved(data, arrangement, fps, configured):
    final = _final_frame(arrangement['clips'], fps)
    start = 0 if data['in_frame'] is None else data['in_frame']
    out = final if data['out_frame'] is None else data['out_frame']
    reason = None
    if start > out:
        reason = 'In point is after Out point; adjust the saved range'
    elif out > final:
        reason = 'Out point is after the final timeline frame; adjust the saved range'
    return {**data, 'arrangement_revision': arrangement['revision'],
            'fps': float(fps), 'fps_configured': configured, 'final_frame': final,
            'has_clips': bool(arrangement['clips']), 'effective_in_frame': start,
            'effective_out_frame': out, 'range_start_frame': start,
            'range_end_exclusive': out + 1, 'frame_count': max(0, out + 1 - start),
            'valid': reason is None, 'error': reason}


def read(root, arrangement_root, catalog, project_id):
    project, fps = _project(catalog, project_id)
    with LOCK:
        data = _stored(Path(root) / (project_id + '.json'), project_id)
        arrangement = read_arrangement(arrangement_root, catalog, project_id)
        return _resolved(data, arrangement, fps, 'fps' in project)


def save(root, arrangement_root, catalog, project_id, revision,
         arrangement_revision, in_frame, out_frame):
    if type(revision) is not int or revision < 0 or type(arrangement_revision) is not int or arrangement_revision < 0:
        raise RenderRangeError('Revision required')
    if not _valid_marker(in_frame) or not _valid_marker(out_frame):
        raise RenderRangeError('In/Out must be integer frames or unset')
    project, fps = _project(catalog, project_id)
    with LOCK:
        path = Path(root) / (project_id + '.json')
        current = _stored(path, project_id)
        arrangement = read_arrangement(arrangement_root, catalog, project_id)
        if current['revision'] != revision or arrangement['revision'] != arrangement_revision:
            raise RenderRangeError('Revision conflict; reload before saving')
        updated = {**current, 'revision': revision + 1,
                   'in_frame': in_frame, 'out_frame': out_frame}
        resolved = _resolved(updated, arrangement, fps, 'fps' in project)
        if not resolved['valid']:
            raise RenderRangeError(resolved['error'])
        _atomic(path, updated)
        return resolved
