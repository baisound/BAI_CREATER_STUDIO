'use strict';
// G3-A2: isolated AAC controls. This tool does not change studio audio policy.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const { ff, decode, mono, fit, sha, rate, channels } = require('./diagnose-aac-boundaries.cjs');

function main() {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--data', '--artifacts', '--out', '--mode'].includes(args[i]) && args[i + 1], 'Use --data DIR --artifacts DIR --out NEW_DIR [--mode levels|bitrate|bitrate-320]');
    assert.ok(!opts[args[i].slice(2)], 'Duplicate option'); opts[args[i].slice(2)] = args[i] === '--mode' ? args[i + 1] : path.resolve(args[i + 1]);
  }
  assert.ok(opts.data && opts.artifacts && opts.out); assert.equal(os.endianness(), 'LE');
  assert.ok(!opts.mode || ['levels', 'bitrate', 'bitrate-320'].includes(opts.mode));
  fs.mkdirSync(opts.out, { recursive: false });
  const qa = path.join(__dirname, '..', 'qa'), platform = process.platform === 'win32' ? 'win' : 'linux';
  const prior = JSON.parse(fs.readFileSync(path.join(qa, `aac-boundary-diagnostic-${platform}-20261108.json`)));
  const indexFile = path.join(opts.data, 'library_assets/index.json'), indexBytes = fs.readFileSync(indexFile);
  const items = JSON.parse(indexBytes).items, fileRoot = path.resolve(opts.data, 'library_assets/files');
  const sources = prior.inputs.map(input => {
    const entry = items.find(e => e.sha256 === input.sha256); assert.ok(entry);
    const file = path.resolve(fileRoot, entry.filename); assert.ok(file.startsWith(fileRoot + path.sep));
    assert.equal(sha(fs.readFileSync(file)), input.sha256); return { file, hash: input.sha256, samples: decode(file) };
  });
  const oldMovies = [['', 'win'], ['linux', 'linux']].map(([folder, suffix]) => {
    const record = JSON.parse(fs.readFileSync(path.join(qa, `audio-mix-level-real-${suffix}-20261108.json`)));
    const file = path.join(opts.artifacts, folder, 'mix-real-long.mp4'); assert.equal(sha(fs.readFileSync(file)), record.sha256);
    return { file, hash: record.sha256 };
  });
  const reference = new Float32Array(Math.ceil(6924 / 29.97 * rate) * channels);
  for (const c of prior.reference.clips) {
    const from = Math.round(c.sourceStart * rate) * channels, at = Math.round(c.start * rate) * channels, n = Math.round(c.duration * rate) * channels;
    assert.ok(from + n <= sources[c.source].samples.length && at + n <= reference.length);
    for (let i = 0; i < n; i++) reference[at + i] += sources[c.source].samples[from + i];
  }
  const referenceHash = sha(Buffer.from(reference.buffer)); assert.equal(referenceHash, prior.reference.pcmSha256);
  const bitrates = opts.mode === 'bitrate-320' ? ['192k', '256k', '320k'] : ['192k', '256k', '320k', '384k'];
  const originalMono = mono(reference), records = [], definitions = opts.mode?.startsWith('bitrate') ? bitrates.map(bitrate => ({ id: 'unity-' + bitrate, scale: 1, bitrate })) : [
    { id: 'unity', scale: 1 }, { id: 'three-quarter', scale: .75 }, { id: 'half', scale: .5 }, { id: 'hard-clip', scale: 1, clip: true },
  ];
  for (const control of definitions) {
    const bitrate = control.bitrate || '192k';
    const input = new Float32Array(reference.length); let peak = 0, overRange = 0, changedByClip = 0;
    for (let i = 0; i < input.length; i++) {
      const value = reference[i] * control.scale, next = control.clip ? Math.max(-1, Math.min(1, value)) : value;
      input[i] = next; peak = Math.max(peak, Math.abs(next)); if (Math.abs(next) > 1) overRange++; if (next !== value) changedByClip++;
    }
    if (control.scale < 1 || control.clip) assert.equal(overRange, 0);
    if (control.clip) assert.equal(changedByClip, prior.reference.overRangeChannelSamples);
    const file = path.join(opts.out, control.id + '-' + bitrate + '.m4a');
    ff(['-f', 'f32le', '-ar', String(rate), '-ac', String(channels), '-i', 'pipe:0', '-c:a', 'aac', '-b:a', bitrate, '-n', file], Buffer.from(input.buffer));
    const decoded = mono(decode(file)), actual = new Float32Array(decoded.length);
    for (let i = 0; i < actual.length; i++) actual[i] = decoded[i] / control.scale;
    const windows = prior.records[2].windows.map(w => ({ boundary: w.boundary, offset: w.offset, ...fit(originalMono, actual, w.time, w.seconds) }));
    const matchesA1 = windows.filter((w, i) => w.windowPcmSha256 === prior.records[2].windows[i].windowPcmSha256).length;
    if (control.scale === 1 && !control.clip && bitrate === '192k') assert.equal(matchesA1, 162, 'Unity 192k control must reproduce A1 before attributing a change');
    const target = windows.find(w => w.boundary === 210 && w.offset === 0 && w.seconds === .2);
    const stable = windows.find(w => w.boundary === 210 && w.offset === .4 && w.seconds === .2);
    records.push({ ...control, bitrate, fileBytes: fs.statSync(file).size, inputPeak: peak, overRangeChannelSamples: overRange, changedByClipChannelSamples: changedByClip, inputPcmSha256: sha(Buffer.from(input.buffer)), sha256: sha(fs.readFileSync(file)), matchesA1Windows: matchesA1, target210: target, stable210: stable, targetVersusClippedInput: control.clip ? fit(mono(input), decoded, 210, .2) : null, windows });
    fs.writeFileSync(path.join(opts.out, 'aac-input-level-progress.json'), JSON.stringify({ incomplete: true, completedControls: records.map(r => ({ id: r.id, bitrate: r.bitrate, sha256: r.sha256, target210: r.target210 })) }, null, 2));
  }
  for (const source of sources) assert.equal(sha(fs.readFileSync(source.file)), source.hash);
  for (const file of oldMovies) assert.equal(sha(fs.readFileSync(file.file)), file.hash);
  assert.deepEqual(fs.readFileSync(indexFile), indexBytes);
  const version = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).stdout.toString().split(/\r?\n/)[0];
  const result = { schema: 1, stage: 'G3-A2 diagnostic; existing quality finding remains open', mode: opts.mode || 'levels', platform: process.platform, ffmpeg: version, rate, channels, referencePcmSha256: referenceHash, lagSearchSamples: [-4, 4], normalization: 'Decode the AAC, divide by the diagnostic input scale, then compare to the original reference', sourceHashes: sources.map(s => s.hash), records, originalsIndexAndOldMoviesUnchanged: true, productSettingsUnchanged: true, listeningNotPerformed: true };
  fs.writeFileSync(path.join(opts.out, 'aac-input-level-diagnostic.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(opts.out, 'aac-input-level-progress.json'), JSON.stringify({ incomplete: false, completedControls: records.map(r => ({ id: r.id, bitrate: r.bitrate, sha256: r.sha256, target210: r.target210 })) }, null, 2));
  console.log(JSON.stringify({ ffmpeg: version, referenceHash, controls: records.map(r => ({ id: r.id, peak: r.inputPeak, overRange: r.overRangeChannelSamples, changedByClip: r.changedByClipChannelSamples, matchesA1: r.matchesA1Windows, gain210: r.target210.gain, lag210: r.target210.lag, gain210stable: r.stable210.gain })) }));
}
if (require.main === module) main();
