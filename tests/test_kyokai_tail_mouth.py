"""Preservation and negative gates for the bounded Owner candidate."""
import hashlib
import os
from pathlib import Path

import pytest

from tools.complete_kyokai_tail_mouth import build, profile, write_new_or_identical, VOWELS
from bai_studio.v05.motion.vmd_morph_rewrite import inspect_morph_section


def test_existing_different_output_is_never_overwritten(tmp_path):
    output = tmp_path / 'candidate.vmd'
    write_new_or_identical(output, b'first')
    write_new_or_identical(output, b'first')
    with pytest.raises(ValueError, match='overwrite'):
        write_new_or_identical(output, b'different')
    assert output.read_bytes() == b'first'


def test_modified_source_is_rejected_before_generator_import(tmp_path):
    paths = {k: tmp_path / k for k in ('motion', 'srt', 'report', 'kana', 'waveform', 'vocal', 'generator')}
    for p in paths.values():
        p.write_bytes(b'changed')
    with pytest.raises(ValueError, match='hash mismatch'):
        build(paths)


def test_real_candidate_only_appends_tail_vowels_and_preserves_all_other_bytes():
    root = os.environ.get('BAI_KYOKAI_SOURCE_ROOT')
    if not root:
        pytest.skip('Explicit Owner source root required')
    paths = profile(root, os.environ.get('BAI_KYOKAI_VOCAL'))
    raw = paths['motion'].read_bytes()
    candidate, report = build(paths)
    old, new = inspect_morph_section(raw), inspect_morph_section(candidate)
    old_ids = {(r['name'], r['frame']): r['raw'] for r in old['rows']}
    assert new['prefix'] == old['prefix'] and new['tail'] == old['tail']
    assert all(r['raw'] == old_ids[(r['name'], r['frame'])] for r in new['rows']
               if (r['name'], r['frame']) in old_ids)
    extra = [r for r in new['rows'] if (r['name'], r['frame']) not in old_ids]
    assert len(extra) == 2705 and len(new['rows']) == 7465
    assert all(r['name'] in VOWELS and 6360 <= r['frame'] <= 6900 for r in extra)
    for r in extra:
        audio_time = (r['frame'] - 5) / 30
        if not any(c['audioStart'] <= audio_time <= c['audioEnd'] for c in report['cues']):
            assert r['weight'] == 0
    assert all(r['weight'] == 0 for r in extra if r['frame'] in (6360, 6900))
    assert sum(len(c['moraCentres']) for c in report['cues']) == 32
    assert all(c['sourceCentresExact'] for c in report['cues'])
    assert report['binary']['replaced'] == report['binary']['removed'] == 0
    assert report['envelope']['maximumDbError'] <= .001
    assert hashlib.sha256(paths['motion'].read_bytes()).digest() == hashlib.sha256(raw).digest()
    assert candidate != raw
