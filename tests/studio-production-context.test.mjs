import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeProductionContext } from '../studio/js/features/production-context.js';

const state = {
  status: 'ready', revision: 'bundle-rev', bundle: { workspace: {
    asset: 'scene-model', stage: { asset: 'stage-a' }, frame: 90,
  } },
};
const music = { revision: 'dance-rev', project: {
  fps: 30, model_id: 'dance-model', motion_id: 'motion-a', audio_id: 'audio-a', head_frame: 12,
} };

test('production context keeps both owners and reports mismatched model and frame without changing them', () => {
  const beforeScene = structuredClone(state);
  const beforeMusic = structuredClone(music);
  const context = composeProductionContext(state, music, { status: 'ready', items: [
    ...['scene-model', 'dance-model', 'motion-a', 'audio-a', 'stage-a'].map((id) => ({ id, available: true })),
  ] });
  assert.equal(context.bundleRevision, 'bundle-rev');
  assert.equal(context.musicRevision, 'dance-rev');
  assert.deepEqual(context.issues.map((issue) => issue.code), ['model-mismatch', 'head-frame']);
  assert.deepEqual(state, beforeScene);
  assert.deepEqual(music, beforeMusic);
});

test('production context surfaces missing source and refuses incomplete owner data', () => {
  const context = composeProductionContext(state, music, { status: 'ready', items: [] });
  assert.equal(context.issues.filter((issue) => issue.code === 'missing-asset').length, 5);
  assert.throws(() => composeProductionContext(state, { project: music.project, revision: '' }, { status: 'ready', items: [] }));
});

test('a new project with no saved workspace is shown as unsaved without writing a default file', () => {
  const empty = { status: 'ready', revision: 'bundle-new', bundle: { workspace: null } };
  const before = structuredClone(empty);
  const context = composeProductionContext(empty, music, { status: 'ready', items: [] });
  assert.equal(context.workspace.frame, 0);
  assert.equal(context.issues[0].code, 'workspace-missing');
  assert.deepEqual(empty, before);
});
