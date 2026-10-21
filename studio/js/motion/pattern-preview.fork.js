// @ts-check
// P2 §2.5 WP-05g: index.html の模式時計・2Dポーズ・3Dの手順選択を純粋関数で保持する。
import { NAMES, patternDuration } from './patterns.fork.js';

/** @param {any} row */
export function patternDescription(row) {
  return row.source === 'registered_fbx' ? '取得済みFBXを元の尺で再生します。Aが選択モーション、Bが待機姿勢です。2Dは模式表現です。'
    : row.category === '起き上がり' ? '起き上がり4段階の簡易演出：最初の攻撃はA、倒れてキップアップするのはB、最後の反撃はBを想定。図は動きの順序・リズムを示す模式図です。'
      : row.seq.includes('|') ? '2人構成。左側が技を出し、右側が防御・被弾・転倒で応答します。'
        : '連続動作を確認します。2人目は構えを維持します。';
}

/** 旧 `tick` と同じく、尺を越えた場合だけ剰余にする。 @param {number} now @param {number} dt @param {number} speed @param {number} duration */
export function advancePattern(now, dt, speed, duration) {
  const next = now + dt * speed;
  return next > duration ? next % duration : next;
}

/** 旧 `pose`。座標は2D SVG のローカル座標。 @param {string} act @param {number} p @param {boolean} isOpponent */
export function pose(act, p, isOpponent) {
  const a = { x: 0, y: 0, lean: 0, larm: -.65, rarm: .65, lleg: -.17, rleg: .17, elbowL: -.5, elbowR: .5 };
  const pulse = Math.max(0, Math.sin(p * Math.PI));
  if (act === 'jab' || act === 'cross' || act === 'body') { a.rarm = act === 'jab' ? -1.35 : 1.35; a.elbowR = act === 'jab' ? -1.3 : 1.3; a.lean = pulse * .18; if (act === 'body') a.y = 12 * pulse; }
  if (act === 'hook') { a.rarm = 1.55; a.elbowR = -1.1; a.lean = .22 * pulse; }
  if (act === 'upper') { a.rarm = .15; a.elbowR = -2.1; a.lean = -.14 * pulse; }
  if (act === 'knee') { a.rleg = -1.9 * pulse; a.larm = -.35; }
  if (act === 'frontkick') { a.rleg = -1.65 * pulse; a.lean = -.14 * pulse; }
  if (act === 'roundkick') { a.rleg = -2 * pulse; a.lean = -.22 * pulse; a.x = 16 * pulse; }
  if (act === 'sweep') { a.rleg = -1.9 * pulse; a.y = 25 * pulse; a.lean = .28 * pulse; }
  if (act === 'head') { a.lean = .6 * pulse; a.x = 35 * pulse; }
  if (act === 'tackle') { a.lean = .7 * pulse; a.x = 60 * pulse; a.y = 18 * pulse; }
  if (act === 'dodge') { a.lean = -.5 * pulse; a.x = -32 * pulse; }
  if (act === 'block') { a.rarm = -.7; a.larm = .7; a.elbowR = -1.4; a.elbowL = 1.4; }
  if (act === 'hit') { a.lean = -.45 * pulse; a.x = -25 * pulse; }
  if (act === 'fall') { a.lean = -1.55 * pulse; a.y = 70 * pulse; a.x = -45 * pulse; }
  if (act === 'kip' || act === 'corkscrew') { a.lean = p < .45 ? -1.5 * (1 - p) : .15; a.y = p < .45 ? 72 * (1 - p / .45) : 0; a.lleg = p < .55 ? -1.6 : 0; a.rleg = p < .55 ? 1.5 : 0; a.rarm = -1.1; a.larm = 1.1; a.x = act === 'corkscrew' ? 18 * Math.sin(p * Math.PI) : 0; }
  return a;
}

/** 旧 `draw` の手順。 @param {any} row @param {number} now @param {number} [duration] */
export function pattern2dState(row, now, duration = patternDuration(row)) {
  const [left, right] = row.seq.split('|');
  const actions = left.split(',');
  const index = Math.min(actions.length - 1, Math.floor(now / duration * actions.length));
  const part = (now / duration * actions.length) % 1;
  let action = actions[index];
  const impact = part > .46 && part < .68;
  let bAction = right ? (impact ? right : 'idle') : 'idle';
  if (['fall', 'kip', 'corkscrew'].includes(action)) { bAction = action; action = 'idle'; }
  return { action, bAction, part, phase: NAMES[action] || action, hit: impact && right && ['hit', 'fall'].includes(right) ? 'HIT!' : '' };
}

/** 旧 `motionState` と `frame` の起き上がり補正。 @param {any} row @param {number} now @param {number} [duration] */
export function pattern3dState(row, now, duration = patternDuration(row)) {
  const seq = row.seq.split('|'), actions = seq[0].split(',');
  const pos = (now / duration) * actions.length;
  const index = Math.min(actions.length - 1, Math.floor(pos));
  const action = actions[index], fraction = pos - index;
  const bAction = seq[1] || (['fall', 'kip', 'corkscrew'].includes(action) ? action : 'idle');
  const recovery = row.category === '起き上がり';
  return { index, action: recovery && index > 0 ? 'idle' : action, bAction: recovery ? index === 0 ? 'hit' : action : bAction, fraction };
}

/** 旧 `animateActor` の実FBX手順解決。 @param {any} row @param {number} actor @param {number} index @param {string} action @param {Record<string,string>} keywords */
export function patternStep(row, actor, index, action, keywords) {
  let step = row.steps[index] || keywords[action] || action;
  if (actor === 1 && row.category === '起き上がり') step = keywords[action] || step;
  if (actor === 1 && row.seq.includes('|')) step = row.steps[1] || step;
  if (actor === 1 && !row.seq.includes('|') && row.category !== '起き上がり') step = 'Ready Idle';
  return step;
}

/** 旧 `animateActor` のダミー回転を、モデルに依存しない値として返す。 @param {string} action @param {number} fraction */
export function dummyPose(action, fraction) {
  const amp = Math.sin(Math.PI * fraction);
  const joints = { body: [0, 0, 0], leftarm: [0, 0, 0], rightarm: [0, 0, 0], leftleg: [0, 0, 0], rightleg: [0, 0, 0] };
  let y = 0, z = 0, rootZ = 0;
  if (['jab', 'cross', 'hook', 'upper', 'body'].includes(action)) { joints.rightarm[0] = -2 * amp; joints.leftarm[0] = -.4 * amp; joints.body[2] = .13 * amp; }
  if (['knee', 'frontkick', 'roundkick', 'sweep'].includes(action)) { joints.rightleg[0] = -1.6 * amp; joints.leftarm[0] = -.4 * amp; joints.body[0] = -.2 * amp; }
  if (action === 'block') { joints.rightarm[0] = -1.8; joints.leftarm[0] = -1.8; }
  if (action === 'dodge') { joints.body[2] = -.6 * amp; z = -.25 * amp; }
  if (action === 'hit') joints.body[2] = -.35 * amp;
  if (action === 'fall') { rootZ = -1.3 * amp; y = -.7 * amp; }
  if (action === 'kip' || action === 'corkscrew') { y = .45 * Math.sin(Math.PI * fraction); rootZ = -1.3 * (1 - fraction); joints.rightleg[0] = -1.6 * (1 - fraction); joints.leftleg[0] = -1.2 * (1 - fraction); }
  return { joints, y, z, rootZ };
}
