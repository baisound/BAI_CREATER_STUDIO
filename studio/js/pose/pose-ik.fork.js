// @ts-check
// 旧 pose_ik_ui.js:4・7〜11・16 のフォーク（P2 §2.8 WP-08a、⑧-1）。DOM を使わない。
// 2D 平面（XY）の模式図の座標変換と、SVG 部品の組み立てだけを持つ。計算（IK）はサーバー（/api/pose/solve）。

/** @param {any} o @returns {any} */
function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

/** pose_ik_ui.js:4 の template と同じ値。使うときは structuredClone する。 */
export const TEMPLATE = deepFreeze({
  schema: 1,
  frame: 0,
  limbs: {
    leftArm: { base: [-0.2, 1.5], target: [-0.8, 1.14], upper: 0.42, lower: 0.4, bend: 1 },
    rightArm: { base: [0.2, 1.5], target: [0.8, 1.14], upper: 0.42, lower: 0.4, bend: -1 },
    leftLeg: { base: [-0.14, 1.0], target: [-0.2, 0.13], upper: 0.5, lower: 0.48, bend: 1 },
    rightLeg: { base: [0.14, 1.0], target: [0.25, 0.13], upper: 0.5, lower: 0.48, bend: -1 },
  },
});

/** index.html:822 の選択肢の順。 @type {ReadonlyArray<readonly [string, string]>} */
export const LIMBS = Object.freeze([['leftArm', '左腕'], ['rightArm', '右腕'], ['leftLeg', '左脚'], ['rightLeg', '右脚']]);
export const VIEW = Object.freeze({ width: 300, height: 260 });
export const MAX_FRAME = 1000000;

/** @param {number} x */ export const sx = (x) => 150 + x * 110;
/** @param {number} y */ export const sy = (y) => 230 - y * 105;

/**
 * pose_ik_ui.js:16 と同じ式。viewBox の座標へ直し、目標（小数 2 桁）にする。
 * @param {number} clientX @param {number} clientY @param {{left: number, top: number, width: number, height: number}} rect
 * @returns {[number, number]}
 */
export function pointerToTarget(clientX, clientY, rect) {
  const x = (clientX - rect.left) / rect.width * 300;
  const y = (clientY - rect.top) / rect.height * 260;
  return [Math.round((x - 150) / 110 * 100) / 100, Math.round((230 - y) / 105 * 100) / 100];
}

/** フレーム番号を 0〜1000000 の整数にする（pose_ik_ui.js:15 は下限だけ。O-⑧-9）。 @param {any} value */
export function clampFrame(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(MAX_FRAME, n));
}

/** @typedef {{tag: 'rect'|'path'|'line'|'circle', cls: string, attrs: Record<string, string|number>, limb?: string}} SvgPart */

/** pose_ik_ui.js:8 の line。 @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {string} cls @param {number} [width] @returns {SvgPart} */
function line(x1, y1, x2, y2, cls, width = 5) {
  return { tag: 'line', cls, attrs: { x1: sx(x1), y1: sy(y1), x2: sx(x2), y2: sy(y2), 'stroke-width': width, 'stroke-linecap': 'round' } };
}

/**
 * pose_ik_ui.js:10〜11 の描画を部品の配列にする。色は持たない（cls で区別し、features.css のトークンで塗る）。
 * @param {any} data 画面上の入力（limbs.<名前>.target）
 * @param {any} result /api/pose/solve の応答
 * @param {string} active 選択中の部位
 * @returns {SvgPart[]}
 */
export function svgParts(data, result, active) {
  /** @type {SvgPart[]} */
  const parts = [
    { tag: 'rect', cls: 'pose-bg', attrs: { x: 0, y: 0, width: 300, height: 260 } },
    { tag: 'path', cls: 'pose-ground', attrs: { d: 'M0 220 H300', 'stroke-width': 2 } },
    line(0, 1.72, 0, 1.53, 'pose-body', 7),
    line(0, 1.5, 0, 1, 'pose-body', 11),
    { tag: 'circle', cls: 'pose-head', attrs: { cx: 150, cy: 35, r: 17 } },
  ];
  for (const [name, p] of Object.entries(result?.limbs || {})) {
    const q = /** @type {any} */ (p);
    const on = name === active;
    const limb = on ? 'pose-limb is-active' : 'pose-limb';
    const target = data?.limbs?.[name]?.target;
    parts.push(line(q.base[0], q.base[1], q.joint[0], q.joint[1], limb, 7), line(q.joint[0], q.joint[1], q.end[0], q.end[1], limb, 7));
    if (target) parts.push({ tag: 'circle', cls: on ? 'pose-handle is-active' : 'pose-handle', limb: name, attrs: { cx: sx(target[0]), cy: sy(target[1]), r: 11, 'stroke-width': 2 } });
    if (!q.reachable) parts.push({ tag: 'circle', cls: 'pose-unreachable', attrs: { cx: sx(q.requested[0]), cy: sy(q.requested[1]), r: 15, 'stroke-dasharray': '4 3' } });
  }
  return parts;
}
