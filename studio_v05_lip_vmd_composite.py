"""Bounded morph composition with a full-frame equivalence gate.

The caller must supply a single source VMD whose local time begins at project
time zero. This module does not select scene clips, adopt candidates, or write
files. Adopted SRT cue boundaries are ramped over one 30 fps VMD frame (see
_lip_base); any remaining discontinuity (manual face keys, mismatched source)
that a 30 fps VMD cannot reproduce at the project frame rate or at 60 fps VMD
midpoints is rejected.
"""
from __future__ import annotations

import math

from studio_v05_vmd_morph_rewrite import inspect_morph_section, rewrite_morph_section
from vmd_readback import MAX_MORPH_KEYS

MAX_PROJECT_FRAMES = 24000
MAX_VMD_FRAMES = 12000
MAX_MORPH_NAMES = 16
MAX_CUES = 512
WEIGHT_TOLERANCE = 1e-4


class CompositeVmdError(ValueError):
    def __init__(self, message, report=None):
        super().__init__(message)
        self.report = report or {}


def _curve(rows, frame):
    """Three.js NumberKeyframeTrack semantics: linear, endpoint-clamped."""
    if not rows:
        return 0.0
    if frame <= rows[0][0]:
        return rows[0][1]
    left, right = 1, len(rows) - 1
    while left < right:
        middle = (left + right) // 2
        if frame <= rows[middle][0]:
            right = middle
        else:
            left = middle + 1
    if left < len(rows) and frame <= rows[left][0]:
        before, a = rows[left - 1]
        after, b = rows[left]
        return a + (b - a) * (frame - before) / (after - before)
    return rows[-1][1]


def _source_tracks(section):
    tracks = {}
    for row in section['rows']:
        tracks.setdefault(row['name'], []).append((row['frame'], row['weight']))
    for rows in tracks.values():
        rows.sort()
    return tracks


GRID_SNAP = 1e-9


def _adopted_at_frame(cues, frame, name):
    """Hard SRT rule at one integer 30 fps VMD frame, or None (source keeps).

    A cue covers project time [startMs, endMs). Membership is compared in
    integers (frame*1000 against ms*30) so Python and the browser agree.
    """
    for cue in cues:
        if not cue['startMs'] * 30 <= frame * 1000 < cue['endMs'] * 30:
            continue
        rows = cue['_tracks'].get(name)
        if rows and frame >= rows[0][0]:
            return max(0., min(1., _curve(rows, frame)))
        return None
    return None


def _lip_base(source_tracks, cues, name, seconds):
    """Source VMD with adopted lip shapes, linear on the 30 fps VMD grid.

    Each integer VMD frame takes the hard SRT rule (adopted value inside the
    cue, source value outside). Between two integer frames the value is the
    straight line between them, so a cue start/end becomes a one-VMD-frame
    ramp that a 30 fps VMD reproduces exactly. Inside a cue (or outside all
    cues) this equals the original curves because their keys are integer
    frames. LIP-001 owner decision 2026-11-04; design A1 section 4.1.
    """
    source = source_tracks.get(name, [])
    position = seconds * 30
    nearest = round(position)
    if abs(position - nearest) < GRID_SNAP:
        value = _adopted_at_frame(cues, nearest, name)
        return _curve(source, nearest) if value is None else value
    frame = math.floor(position)
    mix = position - frame
    left = _adopted_at_frame(cues, frame, name)
    right = _adopted_at_frame(cues, frame + 1, name)
    if left is None and right is None:
        return _curve(source, position)
    if left is None:
        left = _curve(source, frame)
    if right is None:
        right = _curve(source, frame + 1)
    return max(0., min(1., left + (right - left) * mix))


def _desired(source_tracks, cues, manual_tracks, name, seconds):
    value = _lip_base(source_tracks, cues, name, seconds)
    manual = manual_tracks.get(name)
    if manual and seconds >= manual[0][0]:
        value = _curve(manual, seconds)
    return value


def _inputs(cue_tracks, face_keys, instance_id, project_fps, project_frames):
    if (type(project_fps) is not int or not 1 <= project_fps <= 240
            or type(project_frames) is not int or not 1 <= project_frames <= MAX_PROJECT_FRAMES
            or not isinstance(instance_id, str) or not instance_id
            or not isinstance(cue_tracks, list) or len(cue_tracks) > MAX_CUES
            or not isinstance(face_keys, list)):
        raise CompositeVmdError('Composite inputs invalid or duration exceeds limit')
    cues, names, last_end = [], set(), -1
    for cue in cue_tracks:
        if (not isinstance(cue, dict) or type(cue.get('startMs')) is not int
                or type(cue.get('endMs')) is not int
                or not 0 <= cue['startMs'] < cue['endMs'] <= math.ceil(project_frames * 1000 / project_fps)
                or not isinstance(cue.get('records'), list)):
            raise CompositeVmdError('Adopted cue span invalid')
        if cue['startMs'] < last_end:
            raise CompositeVmdError('Adopted cue spans overlap or are unordered')
        last_end = cue['endMs']
        tracks = {}
        for row in cue['records']:
            if (not isinstance(row, dict) or not isinstance(row.get('name'), str)
                    or not row['name'] or type(row.get('frame')) is not int
                    or not 0 <= row['frame'] <= MAX_VMD_FRAMES
                    or type(row.get('weight')) not in (int, float)
                    or not math.isfinite(row['weight']) or not 0 <= row['weight'] <= 1):
                raise CompositeVmdError('Adopted morph key invalid')
            tracks.setdefault(row['name'], []).append((row['frame'], row['weight']))
            names.add(row['name'])
        for rows in tracks.values():
            rows.sort()
            if any(a[0] == b[0] for a, b in zip(rows, rows[1:])):
                raise CompositeVmdError('Adopted morph frame collision')
        cues.append({**cue, '_tracks': tracks})
    manual = {}
    for row in face_keys:
        if not isinstance(row, dict) or row.get('instance_id') != instance_id:
            continue
        name, seconds, value = row.get('morph_name'), row.get('time'), row.get('value')
        if (not isinstance(name, str) or not name or type(seconds) not in (int, float)
                or not math.isfinite(seconds) or not 0 <= seconds <= project_frames / project_fps
                or type(value) not in (int, float) or not math.isfinite(value)
                or not 0 <= value <= 1):
            raise CompositeVmdError('Manual face key invalid')
        manual.setdefault(name, []).append((seconds, value))
        names.add(name)
    for rows in manual.values():
        rows.sort()
        if any(a[0] == b[0] for a, b in zip(rows, rows[1:])):
            raise CompositeVmdError('Manual face key collision')
    if not names or len(names) > MAX_MORPH_NAMES:
        raise CompositeVmdError('No touched morphs or too many morph names')
    return cues, manual, sorted(names)


def _replacements(source_tracks, cues, manual, names, last):
    return [{'name': name, 'frame': frame,
             'weight': _desired(source_tracks, cues, manual, name, frame / 30)}
            for frame in range(last + 1) for name in names]


def expected_morph_rows(source_raw, cue_tracks, face_keys, instance_id,
                        project_fps, project_frames):
    """Return the touched morph names and every key the candidate must contain.

    Used by the product API to verify a written candidate independently of the
    rewrite readback. Inputs are validated exactly as in compose_morph_vmd.
    """
    section = inspect_morph_section(source_raw)
    cues, manual, names = _inputs(cue_tracks, face_keys, instance_id,
                                  project_fps, project_frames)
    source_tracks = _source_tracks(section)
    last_source_frame = max((row['frame'] for row in section['rows']
                             if row['name'] in names), default=0)
    last = max(math.ceil(project_frames * 30 / project_fps), last_source_frame)
    if last > MAX_VMD_FRAMES:
        raise CompositeVmdError('Composite VMD sampling limit exceeded')
    return names, _replacements(source_tracks, cues, manual, names, last)


def compose_morph_vmd(source_raw, cue_tracks, face_keys, instance_id,
                      project_fps, project_frames, tolerance=WEIGHT_TOLERANCE):
    """Return candidate bytes only if sampled composite equals preview rules.

    The result is a binary candidate for later scene-bound API and real PMX
    validation. No state is modified, including on rejection.
    """
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 < tolerance <= .01:
        raise CompositeVmdError('Composite tolerance invalid')
    section = inspect_morph_section(source_raw)
    cues, manual, names = _inputs(cue_tracks, face_keys, instance_id,
                                  project_fps, project_frames)
    source_tracks = _source_tracks(section)
    last_source_frame = max((row['frame'] for row in section['rows']
                             if row['name'] in names), default=0)
    last = max(math.ceil(project_frames * 30 / project_fps), last_source_frame)
    if last > MAX_VMD_FRAMES or (last + 1) * len(names) + len(section['rows']) > MAX_MORPH_KEYS:
        raise CompositeVmdError('Composite VMD sampling limit exceeded')
    replacements = _replacements(source_tracks, cues, manual, names, last)
    removals = [(row['name'], row['frame']) for row in section['rows']
                if row['name'] in names]
    raw, binary_report = rewrite_morph_section(source_raw, replacements, removals)
    candidate_tracks = _source_tracks(inspect_morph_section(raw))
    worst = {'difference': 0., 'name': '', 'projectFrame': None, 'seconds': 0.}
    checked = 0
    for kind, samples in (
        ('project', ((frame, frame / project_fps) for frame in range(project_frames + 1))),
        ('halfVmd', ((frame, (frame + .5) / 30) for frame in range(last)))):
        for frame, seconds in samples:
            if seconds > project_frames / project_fps:
                continue
            for name in names:
                desired = _desired(source_tracks, cues, manual, name, seconds)
                actual = _curve(candidate_tracks[name], seconds * 30)
                difference = abs(desired - actual)
                checked += 1
                if difference > worst['difference']:
                    worst = {'difference': difference, 'name': name,
                             'sampleKind': kind, 'projectFrame': frame if kind == 'project' else None,
                             'seconds': seconds, 'desired': desired, 'actual': actual}
    report = {'status': 'sampled_binary_candidate_requires_real_pmx_validation',
              'projectFps': project_fps, 'projectFrames': project_frames,
              'vmdFrames': last + 1, 'touchedMorphs': names,
              'checkedValues': checked, 'worst': worst, 'tolerance': tolerance,
              'binary': binary_report}
    if worst['difference'] > tolerance:
        raise CompositeVmdError('30 fps VMD cannot reproduce preview at a sampled boundary', report)
    return raw, report
