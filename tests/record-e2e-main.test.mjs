import test from 'node:test';
import assert from 'node:assert/strict';
import { furthestStep, buildRecord } from '../tools/record_e2e_main.mjs';

const s = (id, result, kind = 'pending_wp') => ({ id, result, kind, reason: '' });

test('furthest_step: S1 から切れ目なく pass が続いた最後の手順', () => {
  assert.equal(furthestStep([s('S1', 'pass'), s('S2', 'pass'), s('S3', 'fail'), s('S4', 'skip', 'no_existing')]), 'S2');
});
test('furthest_step: 既存機能なし・後段の skip は飛ばして続ける', () => {
  assert.equal(furthestStep([s('S1', 'pass'), s('S2', 'pass'), s('S3', 'pass'), s('S4', 'skip', 'no_existing'), s('S5', 'pass'), s('S6', 'skip', 'later_phase'), s('S7', 'pass')]), 'S7');
});
test('furthest_step: WP 未着手の skip と fail は切れ目', () => {
  assert.equal(furthestStep([s('S1', 'pass'), s('S2', 'skip', 'pending_wp'), s('S3', 'pass')]), 'S1');
  assert.equal(furthestStep([s('S1', 'skip', 'pending_wp')]), null);
  assert.equal(furthestStep([s('S1', 'pass'), s('S2', 'fail'), s('S3', 'pass')]), 'S1');
});
test('buildRecord: 台帳の形（kind は載せない）', () => {
  const r = buildRecord({ steps: [s('S1', 'skip')], checked_at: 't' }, 'abc1234');
  assert.deepEqual(r, { furthest_step: null, steps: [{ id: 'S1', result: 'skip', reason: '' }], commit: 'abc1234', checked_at: 't' });
});
