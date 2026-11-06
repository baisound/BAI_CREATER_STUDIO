"""Owner-authorized, source-pinned mouth-only candidate for KYOKAI cues 51–54.

Local production CLI, not a general lip generator. No source files are written.
The original generator's verified pure functions supply the same articulation.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bai_studio.v05.motion.vmd_morph_rewrite import inspect_morph_section, rewrite_morph_section

HASHES = {
    'motion': '61ce920e647c38e30d3f9738259e9d56b3bcf2f165243a4ec08770c35f896939',
    'srt': '6f6015eb7bfaf74f386f2cfea187ce2d2084034bce107195e874e1e76cf46e27',
    'report': 'c69e39960dcac243e385e52e2226b7671e00d49bed5bf5cf2740e49c57b358b9',
    'kana': 'e78b6d53908803aefa8b55f5e30b84fabc4230617de2cdf2e8e84ccbe55dcb93',
    'waveform': 'acc5d89612365cdccc446f19ac948e42a3028a0c1db308fbbea73c2cec42725e',
    'vocal': '8a48e67e947dce8c1af4f53260b4cb6a5dcf47867f18e85a26d3ba2e8a034e8e',
    'generator': '069977f6b27cbeb74eaf36cb20c2079ad9446a8a4e425c39300bee9b07acd882',
}
VOWELS = ('あ', 'い', 'う', 'え', 'お')
OFFSET = 5 / 30


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def profile(root, vocal=None):
    root = Path(root)
    evidence = root / 'KYOKAI_MVNT_DELIVERY_20261001/motion/evidence'
    handoff = root / 'handoff/kyokai_mvnt_face_20261001'
    waveform = handoff / 'output/KYOKAI_LEAD_VOCALS_WAVEFORM.json'
    return {
        'motion': evidence.parent / 'KYOKAI_DANCE_MASTER_LIPSYNC_BLINK.vmd',
        'srt': evidence / 'KYOKAI_LEAD_VOCALS_FORCED_ALIGNED.srt',
        'report': evidence / 'KYOKAI_DANCE_MASTER_LIPSYNC_BLINK_REPORT.json',
        'kana': handoff / 'source/lyrics-kana.txt', 'waveform': waveform,
        'generator': root / 'scripts/generate_kyokai_lipsync_blink.py',
        'vocal': Path(vocal or json.loads(waveform.read_text(encoding='utf-8'))['source_wav']['path']),
    }


def verify_tail_envelope(vocal, cached):
    """Independently recompute 211–229s of the exact PCM, including smoothing."""
    first, last, radius = 21100, 22900, 2
    values = {}
    with wave.open(str(vocal), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (2, 2, 48000):
            raise ValueError('Unexpected vocal PCM format')
        wav.setpos((first - radius) * 480)
        for index in range(first - radius, last + radius + 1):
            samples = array.array('h', wav.readframes(480))
            if sys.byteorder != 'little':
                samples.byteswap()
            rms = math.sqrt(sum(int(x) ** 2 for x in samples) / len(samples))
            values[index] = 20 * math.log10(max(rms, 1) / 32768)
    error = max(abs(sum(values[i + d] for d in range(-2, 3)) / 5 - cached[i])
                for i in range(first, last + 1))
    if error > .001:
        raise ValueError(f'Vocal envelope differs: {error} dB')
    return {'windows': last - first + 1, 'maximumDbError': error}


def build(paths):
    before = {key: digest(paths[key]) for key in HASHES}
    if before != HASHES:
        raise ValueError('Pinned input hash mismatch: ' + ','.join(k for k in HASHES if before[k] != HASHES[k]))
    spec = importlib.util.spec_from_file_location('kyokai_verified_source', paths['generator'])
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)  # Hash-pinned Owner script; main is not invoked.
    waveform_doc = json.loads(paths['waveform'].read_text(encoding='utf-8'))
    waveform = generator.Waveform(waveform_doc)
    envelope = verify_tail_envelope(paths['vocal'], waveform.values)
    original_report = json.loads(paths['report'].read_text(encoding='utf-8'))
    srt = generator.parse_srt(paths['srt'])
    kana = [s.strip() for s in paths['kana'].read_text(encoding='utf-8-sig').splitlines() if s.strip()]
    if len(srt) != 54 or len(kana) != 54:
        raise ValueError('Expected the exact 54 source cues')
    cues = generator.prepare_cues(srt[-4:], kana[-4:], waveform, OFFSET, 6900, 30)
    raw = paths['motion'].read_bytes()
    original = inspect_morph_section(raw)
    if original['boneKeys'] != 351951 or len(original['rows']) != 4760 or max(r['frame'] for r in original['rows']) != 6359:
        raise ValueError('Unexpected original VMD layout')
    additions, audits = [], []
    for frame in range(6360, 6901):
        seconds = frame / 30 - OFFSET
        cue = next((c for c in cues if c['start'] <= seconds <= c['end']), None)
        weights = generator.mouth_at(seconds, cue, waveform) if cue else dict.fromkeys(VOWELS, 0.)
        additions.extend({'name': name, 'frame': frame, 'weight': weights[name]} for name in VOWELS)
    candidate, binary = rewrite_morph_section(raw, additions)
    reread = inspect_morph_section(candidate)
    by_id = {(r['name'], r['frame']): r for r in reread['rows']}
    if (reread['prefix'] != original['prefix'] or reread['tail'] != original['tail'] or
            any(by_id[(r['name'], r['frame'])]['raw'] != r['raw'] for r in original['rows'])):
        raise ValueError('Original VMD sections/keys changed')
    for cue, old in zip(cues, original_report['cue_analysis'][-4:]):
        if (cue['reading'] != old['reading'] or cue['centres'] != old['mora_centres_audio_seconds']):
            raise ValueError('Source mora placement differs')
        active = [r for r in reread['rows'] if r['name'] in VOWELS and r['weight'] > 0
                  and cue['pv_start'] <= r['frame'] / 30 <= cue['pv_end']]
        first, last = min(r['frame'] for r in active), max(r['frame'] for r in active)
        if max(first / 30 - cue['pv_start'], cue['pv_end'] - last / 30) > 1 / 30 + 1e-8:
            raise ValueError('Cue onset/offset exceeds one frame')
        # Each vowel centre must articulate the intended vowel in the decoded VMD.
        centres = []
        for token, centre in zip(cue['tokens'], cue['centres']):
            frame = round((centre + OFFSET) * 30)
            weights = {name: by_id[(name, frame)]['weight'] for name in VOWELS}
            if token['vowel'] and max(weights, key=weights.get) != token['vowel']:
                raise ValueError('Decoded vowel centre differs')
            centres.append({'frame': frame, 'vowel': token['vowel'], 'weights': weights})
        audits.append({'number': cue['number'], 'reading': cue['reading'], 'audioStart': cue['start'],
                       'audioEnd': cue['end'], 'firstActiveFrame': first, 'lastActiveFrame': last,
                       'moraCentres': centres, 'sourceCentresExact': True})
    if {k: digest(paths[k]) for k in HASHES} != before:
        raise ValueError('Source changed during generation')
    return candidate, {'inputHashes': before, 'outputSha256': hashlib.sha256(candidate).hexdigest(),
                       'binary': binary, 'envelope': envelope, 'cues': audits,
                       'scope': 'candidate_only_cues_51_to_54', 'ownerFinalAdoption': False,
                       'semanticNaturalness': 'requires_audiovisual_review'}


def write_new_or_identical(path, payload):
    path = Path(path)
    try:
        with path.open('xb') as stream:
            stream.write(payload)
    except FileExistsError:
        if path.read_bytes() != payload:
            raise ValueError(f'Refusing to overwrite different output: {path.name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--vocal', type=Path, help='Same hash-pinned WAV at a different OS path')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    paths = profile(args.source_root, args.vocal)
    candidate, report = build(paths)
    args.out.mkdir(parents=True, exist_ok=True)
    name = f'KYOKAI_TAIL51-54_CANDIDATE_{report["outputSha256"][:12]}.vmd'
    output = args.out / name
    if output.resolve() in {p.resolve() for p in paths.values()}:
        raise ValueError('Output must be distinct from sources')
    write_new_or_identical(output, candidate)
    write_new_or_identical(output.with_suffix('.json'), (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    print(json.dumps({'candidate': str(output), 'sha256': report['outputSha256'], 'added': report['binary']['added'],
                      'cues': [c['number'] for c in report['cues']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
