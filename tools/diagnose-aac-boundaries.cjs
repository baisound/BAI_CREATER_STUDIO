'use strict';
// Read-only analysis of the retained #81 unity-gain fixture; never render into owner data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const rate = 48000, channels = 2;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ff(args, input) {
  const r = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 200 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr?.toString() || String(r.error)); return r.stdout;
}
function decode(file) {
  const b = ff(['-i', file, '-ac', String(channels), '-ar', String(rate), '-f', 'f32le', 'pipe:1']);
  assert.equal(b.length % 8, 0);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
function mono(stereo) {
  const a = new Float32Array(stereo.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = (stereo[i * 2] + stereo[i * 2 + 1]) / 2;
  return a;
}
function fit(reference, actual, time, seconds) {
  const start = Math.round(time * rate), n = Math.round(seconds * rate); let best;
  assert.ok(start >= 4 && start + n + 4 < actual.length && start + n <= reference.length);
  let xx = 0, peak = 0;
  for (let i = 0; i < n; i++) { const x = reference[start + i]; xx += x * x; peak = Math.max(peak, Math.abs(x)); }
  if (xx < 1e-9) return { time, seconds, silentReference: true };
  for (let lag = -4; lag <= 4; lag++) {
    let xy = 0, yy = 0, error = 0;
    for (let i = 0; i < n; i++) { const x = reference[start + i], y = actual[start + i + lag]; xy += x * y; yy += y * y; error += (x - y) ** 2; }
    const corr = xy / Math.sqrt(xx * yy || 1);
    if (!best || corr > best.corr) best = { lag, corr, gain: xy / xx, rmsRatio: Math.sqrt(yy / xx), normalizedError: Math.sqrt(error / xx), referencePeak: peak };
  }
  return { time, seconds, ...best, windowPcmSha256: sha(Buffer.from(actual.buffer, (start + best.lag) * 4, n * 4)) };
}
function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) { assert.ok(['--data', '--artifacts', '--out'].includes(args[i]) && args[i + 1], 'Use --data DIR --artifacts DIR --out NEW_DIR'); options[args[i].slice(2)] = path.resolve(args[i + 1]); }
  assert.ok(options.data && options.artifacts && options.out);
  assert.equal(os.endianness(), 'LE', 'f32le buffer requires little endian');
  // Exclusive output creation avoids replacing any prior evidence.
  fs.mkdirSync(options.out, { recursive: false });
  const indexFile = path.join(options.data, 'library_assets/index.json'), indexBytes = fs.readFileSync(indexFile), entries = JSON.parse(indexBytes).items;
  const hashes = ['f00671c794ccbfd33da7d03bfabd407c83b2f47c5215007967ce053bfa0a9f0e', 'ddfabb6bbb635f62ee4606d754da12cb49c4f51545cee945f15a5379dd259ac7'];
  const sources = hashes.map(hash => {
    const entry = entries.find(e => e.sha256 === hash); assert.ok(entry);
    const file = path.resolve(options.data, 'library_assets/files', entry.filename);
    assert.ok(file.startsWith(path.resolve(options.data, 'library_assets/files') + path.sep));
    assert.equal(sha(fs.readFileSync(file)), hash); const decoded = decode(file);
    return { file, hash, decoded, pcmHash: sha(Buffer.from(decoded.buffer)) };
  });
  const qa = path.join(__dirname, '..', 'qa');
  const outputs = [['windows', '', 'win'], ['ubuntu', 'linux', 'linux']].map(([label, folder, suffix]) => {
    const record = JSON.parse(fs.readFileSync(path.join(qa, `audio-mix-level-real-${suffix}-20261108.json`)));
    const file = path.join(options.artifacts, folder, 'mix-real-long.mp4'); assert.equal(sha(fs.readFileSync(file)), record.sha256);
    return { label, file, hash: record.sha256, frames: record.frames };
  });
  assert.equal(outputs[0].frames, 6924); assert.equal(outputs[1].frames, 6924);
  const seconds = 6924 / 29.97, reference = new Float32Array(Math.ceil(seconds * rate) * channels);
  const clips = [{ source: 0, start: 1.2, duration: 228.5, sourceStart: 1.1 }, ...[10, 110, 210].map(start => ({ source: 1, start, duration: 2, sourceStart: .5 }))];
  for (const c of clips) {
    const from = Math.round(c.sourceStart * rate) * channels, at = Math.round(c.start * rate) * channels, count = Math.round(c.duration * rate) * channels;
    assert.ok(from + count <= sources[c.source].decoded.length && at + count <= reference.length);
    for (let i = 0; i < count; i++) reference[at + i] += sources[c.source].decoded[from + i];
  }
  let peak = 0, overRange = 0;
  for (const sample of reference) { peak = Math.max(peak, Math.abs(sample)); if (Math.abs(sample) > 1) overRange++; }
  const controlFile = path.join(options.out, 'reference-aac-192k.m4a');
  ff(['-f', 'f32le', '-ar', String(rate), '-ac', String(channels), '-i', 'pipe:0', '-c:a', 'aac', '-b:a', '192k', '-n', controlFile], Buffer.from(reference.buffer));
  outputs.push({ label: 'reference-aac-control', file: controlFile, hash: sha(fs.readFileSync(controlFile)) });
  const referenceMono = mono(reference), boundaries = [10, 12, 110, 112, 210, 212];
  const records = outputs.map(output => {
    const actual = mono(decode(output.file)), windows = [];
    for (const boundary of boundaries) for (const offset of [-.2, -.05, 0, .01, .025, .05, .1, .2, .4]) for (const width of [.02, .05, .2]) windows.push({ boundary, offset, ...fit(referenceMono, actual, boundary + offset, width) });
    assert.equal(sha(fs.readFileSync(output.file)), output.hash);
    return { label: output.label, sha256: output.hash, decodedSamples: actual.length, decodedMonoPcmSha256: sha(Buffer.from(actual.buffer)), target210: windows.find(w => w.boundary === 210 && w.offset === 0 && w.seconds === .2), windows };
  });
  for (const source of sources) assert.equal(sha(fs.readFileSync(source.file)), source.hash);
  assert.deepEqual(fs.readFileSync(indexFile), indexBytes);
  const version = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).stdout.toString().split(/\r?\n/)[0];
  const controlWindows = records[2].windows;
  const controlMatches = records.slice(0, 2).map(r => ({ label: r.label, matchingWindows: r.windows.filter((w, i) => w.windowPcmSha256 && w.windowPcmSha256 === controlWindows[i].windowPcmSha256).length, measuredWindows: r.windows.length }));
  const result = { schema: 1, stage: 'G3-A1 diagnostic; no product or acceptance changes', decoderPlatform: process.platform, ffmpeg: version, rate, channels, reference: { clips, peak, overRangeChannelSamples: overRange, pcmSha256: sha(Buffer.from(reference.buffer)) }, inputs: sources.map(s => ({ sha256: s.hash, decodedPcmSha256: s.pcmHash })), lagSearchSamples: [-4, 4], windowWidths: [.02, .05, .2], records, controlMatches, originalsAndPriorOutputsUnchanged: true, ownerIndexUnchanged: true, listeningNotPerformed: true };
  fs.writeFileSync(path.join(options.out, 'aac-boundary-diagnostic.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ffmpeg: version, referencePeak: peak, overRange, targets: records.map(r => ({ label: r.label, ...r.target210 })) }));
}
if (require.main === module) main();
