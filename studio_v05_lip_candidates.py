"""Review-only SRT mora timing and mouth-shape proposals; no VMD writes."""
from __future__ import annotations

import re
import unicodedata
from fractions import Fraction

from studio_project_catalog import load as load_catalog
from studio_v05_lip_readings import read as read_readings, LipReadingError
from studio_v05_srt_sources import read as read_sources, SrtSourceError

SMALL = set('ぁぃぅぇぉゃゅょゎ')
VOWELS = {
    'A': set('あかさたなはまやらわがざだばぱぁゃゎゕ'),
    'I': set('いきしちにひみりぎじぢびぴぃ'),
    'U': set('うくすつぬふむゆるぐずづぶぷぅゅゔ'),
    'E': set('えけせてねへめれげぜでべぺぇゖ'),
    'O': set('おこそとのほもよろをごぞどぼぽぉょ'),
}
LABIAL = set('まみむめもばびぶべぼぱぴぷぺぽ')
QUERY_ID = re.compile(r'[A-Za-z0-9_-]{1,100}\Z')


class LipCandidateError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def _hiragana(value):
    normalized = unicodedata.normalize('NFKC', value)
    return ''.join(chr(ord(ch) - 0x60) if 'ァ' <= ch <= 'ヶ' else ch
                   for ch in normalized if not ch.isspace())


def _moras(reading):
    text = _hiragana(reading)
    result = []
    for char in text:
        if char in SMALL and result and result[-1] not in ('っ', 'ん', 'ー'):
            result[-1] += char
        else:
            result.append(char)
    return result


def _shape(mora, previous_vowel):
    if mora in ('っ', 'ん'):
        return 'Closed', previous_vowel
    if mora == 'ー':
        return previous_vowel, previous_vowel
    for shape, letters in VOWELS.items():
        if mora[-1] in letters:
            return shape, shape
    return None, previous_vowel


def _frame(milliseconds, fps):
    value = Fraction(milliseconds) * Fraction(str(fps)) / 1000
    whole, remainder = divmod(value.numerator, value.denominator)
    doubled = remainder * 2
    return whole + (1 if doubled > value.denominator or
                    (doubled == value.denominator and whole % 2) else 0)


def segments(reading, start_ms, end_ms, fps):
    if (not isinstance(reading, str) or not isinstance(start_ms, int) or not isinstance(end_ms, int)
            or end_ms <= start_ms or isinstance(fps, bool) or not isinstance(fps, (int, float))
            or not 1 <= fps <= 240):
        raise LipCandidateError('Reading, original timing or project FPS invalid')
    moras = _moras(reading)
    if not moras or len(moras) > 300:
        raise LipCandidateError('Reading has no supported mora')
    duration = end_ms - start_ms
    result, warnings, previous_vowel = [], [], None
    for index, mora in enumerate(moras):
        begin = start_ms + duration * index // len(moras)
        finish = start_ms + duration * (index + 1) // len(moras)
        shape, previous_vowel = _shape(mora, previous_vowel)
        if shape is None:
            warnings.append({'code': 'unknown_mora', 'mora': mora, 'index': index})
            continue
        if begin >= finish:
            warnings.append({'code': 'millisecond_collision', 'mora': mora, 'index': index})
            continue
        parts = []
        if mora[0] in LABIAL and finish - begin >= 2:
            closed_end = begin + max(1, (finish - begin) // 4)
            parts.append(('Closed', begin, closed_end))
            begin = closed_end
        elif mora[0] in LABIAL:
            warnings.append({'code': 'labial_closure_omitted', 'mora': mora, 'index': index})
        parts.append((shape, begin, finish))
        for part_shape, part_start, part_end in parts:
            first, last = _frame(part_start, fps), _frame(part_end, fps)
            if first >= last:
                warnings.append({'code': 'frame_collision', 'mora': mora, 'index': index,
                                 'startMs': part_start, 'endMs': part_end})
            result.append({'mora': mora, 'mouthShape': part_shape,
                           'startMs': part_start, 'endMs': part_end,
                           'startFrame': first, 'endFrame': last})
    return result, warnings


def propose(catalog, source_root, reading_root, project_id, source_id, srt_index):
    if (not isinstance(project_id, str) or not QUERY_ID.fullmatch(project_id)
            or not isinstance(source_id, str) or not 0 < len(source_id) <= 100
            or type(srt_index) is not int or srt_index < 1):
        raise LipCandidateError('Project, SRT source and cue index required', 400)
    project = next((row for row in load_catalog(catalog)['projects'] if row.get('id') == project_id), None)
    if not project:
        raise LipCandidateError('Project not found', 404)
    fps = project.get('fps', 30)
    try:
        sources = read_sources(source_root, catalog, project_id)['sources']
        readings = read_readings(reading_root, catalog, source_root, project_id)['utterances']
    except (SrtSourceError, LipReadingError) as exc:
        raise LipCandidateError(str(exc), exc.status) from exc
    source = next((row for row in sources if row['id'] == source_id), None)
    if not source:
        raise LipCandidateError('SRT source not found', 404)
    if source['sourceStatus'] != 'valid':
        raise LipCandidateError('SRT original changed or missing', 409)
    cue = next((row for row in source['entries'] if row['index'] == srt_index), None)
    if not cue:
        raise LipCandidateError('SRT cue not found', 404)
    reading = next((row for row in readings if row['srtSourceId'] == source_id
                    and row['srtIndex'] == srt_index), None)
    if reading and (reading['sourceStatus'] != 'valid' or reading['sourceHash'] != source['sha256']
                    or reading['sourceStartMs'] != cue['startMs']
                    or reading['sourceEndMs'] != cue['endMs']):
        raise LipCandidateError('Saved reading no longer matches SRT original', 409)
    base = {'schema': 1, 'projectId': project_id, 'projectFps': fps,
            'srtSourceId': source_id, 'sourceHash': source['sha256'], 'srtIndex': srt_index,
            'sourceStartMs': cue['startMs'], 'sourceEndMs': cue['endMs'],
            'readingState': reading['readingState'] if reading else 'unresolved',
            'explicitSilence': reading['explicitSilence'] if reading else False,
            'pronunciationVersion': reading['pronunciationVersion'] if reading else 0,
            'candidateOnly': True, 'segments': [], 'warnings': []}
    if not reading or reading['readingState'] == 'unresolved' and not reading['explicitSilence']:
        return {**base, 'status': 'unresolved'}
    if reading['explicitSilence']:
        return {**base, 'status': 'explicit_silence'}
    candidates, warnings = segments(reading['readingKana'], cue['startMs'], cue['endMs'], fps)
    source_warnings = [row for row in source['warnings'] if srt_index in row['indices']]
    warnings += source_warnings
    status = ('needs_review' if warnings else 'ready') if reading['readingState'] == 'confirmed' else 'proposed'
    return {**base, 'status': status, 'segments': candidates, 'warnings': warnings}
