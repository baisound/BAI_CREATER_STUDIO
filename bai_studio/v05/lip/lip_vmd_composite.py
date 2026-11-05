"""Bounded morph composition with a full-frame equivalence gate.

The caller supplies one source VMD whose local time begins at the selected
clip start. This module does not select scene clips, adopt candidates, or write
files. Adopted SRT cue boundaries are ramped over one 30 fps VMD frame (see
_lip_base); any remaining discontinuity (manual face keys, mismatched source)
that a 30 fps VMD cannot reproduce at the project frame rate or at 60 fps VMD
midpoints is rejected.
"""
from __future__ import annotations

import math

from bai_studio.v05.motion.vmd_morph_rewrite import inspect_morph_section, rewrite_morph_section
from bai_studio.motion.vmd_readback import MAX_MORPH_KEYS

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


def _lip_base(source_tracks, cues, name, local_seconds, clip_start=0., clip_duration=None):
    """Match the browser's project-time SRT rule over a clip-local source VMD.

    The source VMD runs from clip-local zero. Adopted cues and their one-VMD-
    frame boundary ramps use the project's 30 fps grid. The browser samples
    source morphs at those neighbouring project frames, after seeking the
    selected motion clip. A project frame before the clip has no source motion.
    """
    source = source_tracks.get(name, [])
    position = (clip_start + local_seconds) * 30
    source_position = local_seconds * 30
    def source_at_project_frame(frame):
        local_position = frame - clip_start * 30
        outside = (local_position < -GRID_SNAP or
                   (clip_duration is not None and local_position >= clip_duration * 30 - GRID_SNAP))
        return 0. if outside else _curve(source, local_position)
    nearest = round(position)
    if abs(position - nearest) < GRID_SNAP:
        value = _adopted_at_frame(cues, nearest, name)
        if (value is None and clip_duration is not None
                and local_seconds >= clip_duration - GRID_SNAP
                and _adopted_at_frame(cues, nearest - 1, name) is not None):
            return 0.
        return _curve(source, source_position) if value is None else value
    frame = math.floor(position)
    mix = position - frame
    left = _adopted_at_frame(cues, frame, name)
    right = _adopted_at_frame(cues, frame + 1, name)
    if left is None and right is None:
        return _curve(source, source_position)
    if left is None:
        left = source_at_project_frame(frame)
    if right is None:
        right = source_at_project_frame(frame + 1)
    return max(0., min(1., left + (right - left) * mix))


def _desired(source_tracks, cues, manual_tracks, name, local_seconds,
             clip_start=0., clip_duration=None):
    project_seconds = clip_start + local_seconds
    value = _lip_base(source_tracks, cues, name, local_seconds, clip_start, clip_duration)
    manual = manual_tracks.get(name)
    if manual and project_seconds >= manual[0][0]:
        value = _curve(manual, project_seconds)
    return value


def _inputs(cue_tracks, face_keys, instance_id, project_fps, project_frames,
            clip_start=0., clip_duration=None):
    if (type(project_fps) not in (int, float) or not math.isfinite(project_fps)
            or not 1 <= project_fps <= 240
            or type(project_frames) is not int or not 1 <= project_frames <= MAX_PROJECT_FRAMES):
        raise CompositeVmdError('Composite inputs invalid or duration exceeds limit')
    if clip_duration is None:
        clip_duration = project_frames / project_fps
    if (type(clip_duration) not in (int, float)
            or type(clip_start) not in (int, float) or not math.isfinite(clip_start)
            or clip_start < 0
            or not math.isfinite(clip_duration) or clip_duration <= 0
            or not isinstance(instance_id, str) or not instance_id
            or not isinstance(cue_tracks, list) or len(cue_tracks) > MAX_CUES
            or not isinstance(face_keys, list)):
        raise CompositeVmdError('Composite inputs invalid or duration exceeds limit')
    cues, names, last_end = [], set(), -1
    for cue in cue_tracks:
        if (not isinstance(cue, dict) or type(cue.get('startMs')) is not int
                or type(cue.get('endMs')) is not int
                or not clip_start - 1e-9 <= cue['startMs'] / 1000
                or not cue['startMs'] < cue['endMs']
                or cue['endMs'] / 1000 > clip_start + clip_duration + 1e-9
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
                or not math.isfinite(seconds)
                or not clip_start - 1e-9 <= seconds <= clip_start + clip_duration + 1e-9
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


def _replacements(source_tracks, cues, manual, names, last, clip_start, clip_duration):
    return [{'name': name, 'frame': frame,
             'weight': _desired(source_tracks, cues, manual, name, frame / 30,
                                clip_start, clip_duration)}
            for frame in range(last + 1) for name in names]


def expected_morph_rows(source_raw, cue_tracks, face_keys, instance_id,
                        project_fps, project_frames, *, clip_start=0., clip_duration=None):
    """Return the touched morph names and every key the candidate must contain.

    Used by the product API to verify a written candidate independently of the
    rewrite readback. Inputs are validated exactly as in compose_morph_vmd.
    """
    section = inspect_morph_section(source_raw)
    cues, manual, names = _inputs(cue_tracks, face_keys, instance_id,
                                  project_fps, project_frames, clip_start, clip_duration)
    if clip_duration is None:
        clip_duration = project_frames / project_fps
    source_tracks = _source_tracks(section)
    last_source_frame = max((row['frame'] for row in section['rows']
                             if row['name'] in names), default=0)
    last = max(math.ceil(clip_duration * 30 - 1e-9), last_source_frame)
    if last > MAX_VMD_FRAMES:
        raise CompositeVmdError('Composite VMD sampling limit exceeded')
    return names, _replacements(source_tracks, cues, manual, names, last,
                                clip_start, clip_duration)


def compose_morph_vmd(source_raw, cue_tracks, face_keys, instance_id,
                      project_fps, project_frames, tolerance=WEIGHT_TOLERANCE,
                      *, clip_start=0., clip_duration=None):
    """Return candidate bytes only if sampled composite equals preview rules.

    The result is a binary candidate for later scene-bound API and real PMX
    validation. No state is modified, including on rejection.
    """
    if type(tolerance) not in (int, float) or not math.isfinite(tolerance) or not 0 < tolerance <= .01:
        raise CompositeVmdError('Composite tolerance invalid')
    section = inspect_morph_section(source_raw)
    cues, manual, names = _inputs(cue_tracks, face_keys, instance_id,
                                  project_fps, project_frames, clip_start, clip_duration)
    if clip_duration is None:
        clip_duration = project_frames / project_fps
    source_tracks = _source_tracks(section)
    last_source_frame = max((row['frame'] for row in section['rows']
                             if row['name'] in names), default=0)
    last = max(math.ceil(clip_duration * 30 - 1e-9), last_source_frame)
    if last > MAX_VMD_FRAMES or (last + 1) * len(names) + len(section['rows']) > MAX_MORPH_KEYS:
        raise CompositeVmdError('Composite VMD sampling limit exceeded')
    replacements = _replacements(source_tracks, cues, manual, names, last,
                                 clip_start, clip_duration)
    removals = [(row['name'], row['frame']) for row in section['rows']
                if row['name'] in names]
    raw, binary_report = rewrite_morph_section(source_raw, replacements, removals)
    candidate_tracks = _source_tracks(inspect_morph_section(raw))
    worst = {'difference': 0., 'name': '', 'projectFrame': None, 'seconds': 0.}
    checked = 0
    project_first = math.ceil(clip_start * project_fps - 1e-8)
    project_last = math.floor((clip_start + clip_duration) * project_fps + 1e-8)
    global_vmd_first = math.ceil(clip_start * 30 - 1e-8)
    global_vmd_last = math.floor((clip_start + clip_duration) * 30 + 1e-8)
    samples_to_check = [
        ('clipEdge', ((None, seconds) for seconds in (0., max(0., clip_duration - 1e-6)))),
        ('project', ((frame, frame / project_fps - clip_start)
                     for frame in range(project_first, project_last + 1))),
        ('halfVmd', ((frame, (frame + .5) / 30) for frame in range(last)))]
    # When the clip start is between VMD frames, the project cue grid and
    # clip-local VMD grid have different breakpoints. Test their union.
    if abs(clip_start * 30 - round(clip_start * 30)) > GRID_SNAP:
        samples_to_check.append(('projectVmd', ((frame, frame / 30 - clip_start)
                                 for frame in range(global_vmd_first, global_vmd_last + 1))))
    if clip_start != 0 or not float(project_fps).is_integer():
        samples_to_check.append(('manualEdge', ((None, moment - clip_start - 1e-6)
                                 for rows in manual.values() for moment, _ in rows)))
    for kind, samples in samples_to_check:
        for frame, seconds in samples:
            if seconds < -1e-8 or seconds >= clip_duration - 1e-8:
                continue
            for name in names:
                desired = _desired(source_tracks, cues, manual, name, seconds,
                                   clip_start, clip_duration)
                actual = _curve(candidate_tracks[name], seconds * 30)
                difference = abs(desired - actual)
                checked += 1
                if difference > worst['difference']:
                    worst = {'difference': difference, 'name': name,
                             'sampleKind': kind, 'projectFrame': frame if kind == 'project' else None,
                             'seconds': clip_start + seconds, 'desired': desired, 'actual': actual}
    report = {'status': 'sampled_binary_candidate_requires_real_pmx_validation',
              'projectFps': project_fps, 'projectFrames': project_frames,
              'clipStart': clip_start, 'clipDuration': clip_duration,
              'vmdFrames': last + 1, 'touchedMorphs': names,
              'checkedValues': checked, 'worst': worst, 'tolerance': tolerance,
              'binary': binary_report}
    if worst['difference'] > tolerance:
        raise CompositeVmdError('30 fps VMD cannot reproduce preview at a sampled boundary', report)
    return raw, report
