'use strict';
// WP-L6 の試験用：隔離サーバーへ素材を登録し、旧の保存3ファイルと曲とダンスの保存を書く。
// 呼び方は tests/studio-music-dance.test.cjs と tests/studio-v05-actual-preview.test.cjs を写している。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixtures = path.join(__dirname, '..', 'fixtures');

function silentWav(seconds = 1) {
  const samples = 8000 * seconds, data = Buffer.alloc(samples * 2), head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24); head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

async function ok(response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return JSON.parse(text);
}

const post = (base, route, body) => fetch(base + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** 素材（PMX・VMD・ステージGLB・無音WAV）を登録し、そのIDを返す。 */
async function registerAssets(base) {
  await ok(await fetch(`${base}/api/pmx-zip-upload?slot=A&name=minimal_pmx.zip`,
    { method: 'POST', body: fs.readFileSync(path.join(fixtures, 'minimal_pmx.zip')) }));
  await ok(await fetch(`${base}/api/mmd-upload?slot=vmd&name=dance.vmd`,
    { method: 'POST', body: fs.readFileSync(path.join(fixtures, 'minimal.vmd')) }));
  const stage = await ok(await fetch(`${base}/api/library-assets/upload?kind=stage&name=stage.glb`,
    { method: 'POST', body: fs.readFileSync(path.join(fixtures, 'synthetic_test_model.glb')) }));
  const audio = await ok(await fetch(`${base}/api/library-assets/upload?kind=audio&name=song.wav`,
    { method: 'POST', body: silentWav(1) }));
  const inventory = await ok(await fetch(`${base}/api/assets`));
  const pmx = inventory.items.find(item => item.format === 'PMX');
  const vmd = inventory.items.find(item => item.id.startsWith('mmd:vmd:'));
  assert.ok(pmx && vmd && stage.item.id && audio.item.id, '素材の登録に失敗');
  return { model: pmx.id, motion: vmd.id, stage: stage.item.id, audio: audio.item.id };
}

/** 旧の3ファイル（コンビネーション、作業状態、カメラ）と曲とダンスの保存を data に書く。 */
function writeLegacyFiles(dataDir, ids, { title = '歌ってみた試験作品' } = {}) {
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
  write('project_state.json', { schema: 1, timeline: [], history: [], cursor: -1, title });
  write('project_state.workspace.json', {
    frame: 120, asset: ids.model, clip: null,
    character: { position: [1.5, 0, -2], rotation: [0, 90, 0], scale: 1.2 },
    stage: { asset: ids.stage, position: [0, 0, 0], rotation: [0, 0, 0], scale: 2 },
  });
  write('camera_project.json', {
    schema: 1, fps: 30, duration: 300,
    keys: [
      { frame: 0, position: [0, 1.6, 5], target: [0, 1, 0], fov: 40 },
      { frame: 100, position: [4, 2, 3], target: [0, 1, 0], fov: 35 },
      { frame: 200, position: [-3, 2, 4], target: [0, 1, 0], fov: 30 },
    ],
  });
  write('music_dance_project.json', {
    schema: 1, fps: 30, model_id: ids.model, motion_id: ids.motion, audio_id: ids.audio,
    motion_start_frame: 60, motion_source_frame: 0, audio_start_frame: 30, audio_source_frame: 0, head_frame: 45,
  });
}

/** 作品を作り、スナップショットを保存して、作品IDを返す。 */
async function createProjectWithSnapshot(base, name) {
  const created = await ok(await post(base, '/api/studio/v05/projects', { name, kind: 'empty' }));
  const id = created.project.id;
  await ok(await post(base, '/api/studio/v05/project/snapshot', { id }));
  return id;
}

module.exports = { silentWav, ok, post, registerAssets, writeLegacyFiles, createProjectWithSnapshot };
