// @ts-check
// SCR-06 のシーンの配置の計算（純関数。three を使わない。P2 設計 §2.4(d) ステージ配置、2026-10-20 の上書き）。
// 保存する値（workspace.stage）は利用者の位置[m]・回転[度]・倍率だけ。素材の単位の換算は表示のときだけ掛ける。

/** @typedef {{asset: string, position: [number, number, number], rotation: [number, number, number], scale: number}} Stage */

export const DEG = Math.PI / 180;

/** 新しく置くときの値（回転 X/Z も 0。O-④-7）。 @param {string} asset @returns {Stage} */
export function defaultStage(asset) {
  return { asset, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
}

/** 画面のスライダーの範囲（モックの部品そのまま）。サーバーの範囲は B-4（位置 ±1000・回転 ±360・倍率 0.01〜100）でもっと広い。 */
export const RANGE = Object.freeze({ position: [-50, 50], rotationY: [-180, 180], scale: [0.1, 10] });

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 保存値と単位の換算から、three のグループに当てる値を求める。
 * 表示の拡大は「単位の換算 × 保存した scale」、回転は度をラジアンにして three の既定の順（XYZ）で当てる。
 * @param {Stage} stage @param {number} unit
 */
export function stageTransform(stage, unit) {
  return {
    position: /** @type {[number, number, number]} */ ([...stage.position]),
    rotation: /** @type {[number, number, number]} */ (stage.rotation.map((d) => d * DEG)),
    scale: unit * stage.scale,
  };
}

/** @param {any} v @returns {v is Stage} */
export function isStage(v) {
  return !!v && typeof v === 'object' && typeof v.asset === 'string' && Array.isArray(v.position) && v.position.length === 3
    && Array.isArray(v.rotation) && v.rotation.length === 3 && typeof v.scale === 'number';
}
