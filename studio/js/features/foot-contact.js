// @ts-check
// WP-05f ⑤-14: SCR-13 の既存「足IK」タブで診断APIだけを使う。モデル・VMDには適用しない。
import { h } from '../ui.js';
import { postJson } from '../api.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
const LEFT = '[{"frame":0,"position":[0,0.01,0]},{"frame":1,"position":[0.01,0.01,0]},{"frame":2,"position":[0.2,0.01,0]},{"frame":3,"position":[0.23,0.01,0]}]';
const RIGHT = '[{"frame":0,"position":[1,0.01,0]},{"frame":1,"position":[1.01,0.01,0]},{"frame":2,"position":[1.2,0.01,0]},{"frame":3,"position":[1.23,0.01,0]}]';
const role = (name) => ({ role: name });

/** @param {FeatureCtx} ctx */
export const footContactPanel = (ctx) => {
  let alive = true;
  ctx.onCleanup(() => { alive = false; });
  const ground = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', step: '0.01', value: '0', 'aria-label': '床の高さ Y', dataset: role('foot-ground') }));
  const groundSlider = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '-0.5', max: '0.5', step: '0.01', value: '0', 'aria-label': '床の高さ', dataset: role('foot-ground-slider') }));
  groundSlider.addEventListener('input', () => { ground.value = groundSlider.value; });
  ground.addEventListener('input', () => { const n = Number(ground.value); if (Number.isFinite(n)) groundSlider.value = String(Math.max(-0.5, Math.min(0.5, n))); });
  const left = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input mono rt-area', rows: '5', 'aria-label': '左足サンプル JSON', dataset: role('foot-samples') }, LEFT));
  const right = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input mono rt-area', rows: '5', 'aria-label': '右足サンプル JSON', dataset: role('foot-right-samples') }, RIGHT));
  const bvh = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.bvh', 'aria-label': 'BVHファイル', dataset: role('foot-bvh-file') }));
  const bone = /** @type {HTMLInputElement} */ (h('input', { class: 'input', value: 'LeftFoot', 'aria-label': '足ボーン名', dataset: role('foot-bvh-bone') }));
  const stride = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', min: '1', max: '1000', step: '1', value: '1', 'aria-label': 'サンプル間隔', dataset: role('foot-bvh-stride') }));
  const footOut = h('pre', { class: 'rt-pre', role: 'status', 'aria-live': 'polite', dataset: role('foot-result') }, '実行待ち');
  const bvhOut = h('pre', { class: 'rt-pre', role: 'status', 'aria-live': 'polite', dataset: role('foot-bvh-result') }, '実行待ち');
  const dualOut = h('pre', { class: 'rt-pre', role: 'status', 'aria-live': 'polite', dataset: role('foot-dual-result') }, '実行待ち');
  const say = (out, text, bad = false) => { if (!alive) return; out.textContent = text; if (bad) out.dataset.kind = 'error'; else delete out.dataset.kind; };
  const groundY = () => { const n = Number(ground.value); if (!ground.value.trim() || !Number.isFinite(n)) throw new Error('床の高さを数値で入力してください'); return n; };
  const samples = (field) => { const value = JSON.parse(field.value); if (!Array.isArray(value)) throw new Error('サンプルはJSON配列で入力してください'); return value; };
  /** @param {HTMLElement} out @param {string} pending @param {string} prefix @param {() => Promise<import('../api.js').ApiResult>} fn */
  async function run(out, pending, prefix, fn) {
    say(out, pending);
    try {
      const response = await fn();
      if (!alive) return;
      if (!response.ok) throw new Error(response.message);
      say(out, JSON.stringify(response.data, null, 2));
    } catch (e) { say(out, `${prefix}: ${e instanceof Error ? e.message : String(e)}`, true); }
  }
  const button = (label, name, title, fn) => h('button', { class: 'btn', type: 'button', title, dataset: { act: 'real', role: name }, onclick: fn }, label);
  const footRun = button('接地を再計算', 'foot-run', '接地候補・足滑り・床下侵入を検査します。IKはモデルに適用しません', () => {
    void run(footOut, '診断しています…', '診断失敗', () => postJson('/api/qa/foot-contact', { samples: samples(left), ground_y: groundY(), propose_root_offsets: true }));
  });
  const bvhRun = button('BVHから足位置を解析', 'foot-bvh-run', '選んだBVHの本文を診断APIへ送ります。登録や保存は行いません', () => {
    const file = bvh.files?.[0];
    if (!file) { say(bvhOut, 'BVHファイルを選択してください', true); return; }
    if (file.size > 2000000) { say(bvhOut, '2MB以内のBVHを選択してください', true); return; }
    const step = Number(stride.value);
    if (!Number.isSafeInteger(step) || step < 1 || step > 1000) { say(bvhOut, '解析失敗: サンプル間隔は1〜1000の整数を入力してください', true); return; }
    void run(bvhOut, 'BVHの足位置を計算中…', 'BVH解析失敗', async () => postJson('/api/qa/bvh-foot-world', { bvh_text: await file.text(), foot_bone: bone.value, stride: step, ground_y: groundY(), diagnose: true }));
  });
  const dualRun = button('両足の補正候補を確認', 'foot-dual-run', '衝突する補正候補ではルートを移動しません。IKやVMDは変更しません', () => {
    void run(dualOut, '両足を解析しています…', '解析失敗', () => postJson('/api/qa/dual-foot-preview', { left_samples: samples(left), right_samples: samples(right), ground_y: groundY() }));
  });
  return h('div', { class: 'rt-panel', dataset: { feature: 'footContactPanel' } },
    h('h3', null, '足IK・接地'),
    h('p', { class: 'section-note' }, 'ワールド座標の足先サンプルを診断します。結果は表示のみで、モーションやモデルは変更しません。'),
    h('label', { class: 'rt-check', title: '旧画面には無い設定です（診断は常に補正候補を出します）' }, h('input', { type: 'checkbox', disabled: true, dataset: role('foot-apply') }), ' 接地補正'),
    h('div', { class: 'rt-fields' }, h('label', null, '床の高さ', groundSlider), h('label', null, '床の高さ Y（m）', ground)),
    h('details', { class: 'rt-group' }, h('summary', null, 'サンプルの編集（上級者向け）'), h('label', null, '左足サンプル JSON', left)),
    footRun, footOut,
    h('div', { class: 'rt-fields' }, h('label', null, 'BVHファイル（ローカルで選択）', bvh), h('label', null, '足ボーン名', bone), h('label', null, 'サンプル間隔', stride)),
    h('p', { class: 'section-note' }, 'BVHの座標軸・長さ単位は変換しません。床Y座標を合わせてください。'), bvhRun, bvhOut,
    h('details', { class: 'rt-group' }, h('summary', null, '両足の接地を同時に診断（補正プレビューのみ）'),
      h('p', { class: 'section-note' }, '左足には上のサンプルを使用します。右足の座標も同じ単位・Y軸・フレーム番号で入力してください。'),
      h('label', null, '右足サンプル JSON', right), dualRun, dualOut));
};
