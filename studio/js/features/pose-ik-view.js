// @ts-check
// ⑧-1 SCR-13「足IK」タブの手動IKポーズ補助（P2 設計 §2.8(d) WP-08a）。
//  - ikTab：先頭に今の「足IK・接地」（footContactPanel。変えない）、その下に節「手動IKポーズ補助（2D・基礎版）」。
//  - 2D 平面（XY）の模式図で 2 関節 IK を補助するだけ。PMX・VRM・VMD・制作状態には適用しない（3D の IK は v0.5 の MOTION-010）。
//  - 保存先は旧と同じ pose_ik_last.json だけ（/api/pose/save）。未保存の編集は同じページの読み込みの中だけ kept に持つ（O-⑧-2）。
import { h } from '../ui.js';
import { getJson, postJson } from '../api.js';
import { footContactPanel } from './foot-contact.js';
import { LIMBS, VIEW, svgParts, pointerToTarget } from '../pose/pose-ik.fork.js';
import { createPoseIkModel } from '../pose/pose-ik-model.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('../pose/pose-ik-model.js').PoseIkState} PoseIkState */

const SVG_NS = 'http://www.w3.org/2000/svg';
const role = (/** @type {string} */ name) => ({ role: name });

/** 画面に節があるときだけ { getState }。離れると null（baiStudio.poseIk が読む）。 @type {{getState: () => PoseIkState}|null} */
let current = null;
export const currentPoseIk = () => current;

/** 画面を移っても未保存の編集が消えないように持つ（ページを再読込すると消える。②のストア・dirty には入れない）。 @type {{data: any, synced: string|null, active: string}|null} */
let kept = null;

/** @param {FeatureCtx} ctx */
export function ikTab(ctx) {
  return h('div', { class: 'rt-stack', dataset: { feature: 'ikTab' } }, footContactPanel(ctx), poseIkPanel(ctx));
}

/** @param {FeatureCtx} ctx */
export function poseIkPanel(ctx) {
  const model = createPoseIkModel({
    solve: (d) => postJson('/api/pose/solve', d),
    save: (d) => postJson('/api/pose/save', d),
    load: () => getJson('/api/pose/last'),
    kept,
    onChange: (s) => { kept = { data: structuredClone(s.data), synced: s.synced, active: s.active }; render(s); },
  });
  let disposed = false;
  let dragging = false;
  /** @type {number|null} */
  let pointerId = null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEW.width} ${VIEW.height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '腕と脚のIK目標位置をドラッグするポーズ補助');
  svg.setAttribute('class', 'pose-svg');
  svg.dataset.role = 'pose-ik-svg';

  const bone = /** @type {HTMLSelectElement} */ (h('select', { class: 'input', 'aria-label': '編集する部位', dataset: role('pose-ik-bone') },
    LIMBS.map(([v, label]) => h('option', { value: v }, label))));
  bone.value = 'rightArm';
  const frame = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', min: '0', max: '1000000', step: '1', value: '0', 'aria-label': 'フレーム番号', dataset: role('pose-ik-frame') }));
  const status = h('p', { class: 'section-note pose-status', role: 'status', 'aria-live': 'polite', dataset: role('pose-ik-status') }, 'IK準備中…');
  const reset = h('button', { class: 'btn', type: 'button', title: '元のサンプル姿勢に戻します', dataset: { act: 'real', role: 'pose-ik-reset' }, onclick: () => { void model.reset(); } }, '初期姿勢');
  const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: '元のFBX・PMX・VMDを変更せず補正設定だけ保存します', dataset: { act: 'real', role: 'pose-ik-save' }, onclick: () => { void model.save(); } }, '設定を保存'));
  const reload = h('button', { class: 'btn', type: 'button', title: '保存されている内容を読み直し、この画面の変更を捨てます', dataset: { act: 'real', role: 'pose-ik-reload' }, onclick: () => { void model.reloadDiscard(); } }, '再読込して変更を破棄');
  const overwrite = h('button', { class: 'btn', type: 'button', title: '外部の変更を捨てて、この画面の内容で保存し直します', dataset: { act: 'real', role: 'pose-ik-overwrite' }, onclick: () => { void model.overwrite(); } }, 'この画面の内容で上書き保存');
  const conflict = h('div', { class: 'pose-conflict', hidden: true, role: 'alert', dataset: role('pose-ik-conflict') },
    h('span', null, '旧画面・MCPなどが保存した内容と食い違っています。'), reload, overwrite);

  bone.addEventListener('change', () => model.setActive(bone.value));
  frame.addEventListener('change', () => model.setFrame(frame.value));

  /** @param {PointerEvent} e */
  const move = (e) => {
    const s = model.getState();
    void model.setTarget(s.active, pointerToTarget(e.clientX, e.clientY, svg.getBoundingClientRect()));
  };
  svg.addEventListener('pointerdown', (e) => {
    const name = /** @type {Element} */ (e.target).getAttribute?.('data-limb');
    if (!name) return;
    model.setActive(name);
    dragging = true;
    pointerId = e.pointerId;
    try { svg.setPointerCapture(e.pointerId); } catch { /* 合成イベントなどでは取れない */ }
    move(e);
  });
  svg.addEventListener('pointermove', (e) => { if (dragging) move(e); });
  const endDrag = () => { dragging = false; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  /** @param {PoseIkState} s */
  function render(s) {
    if (disposed) return;
    const parts = svgParts(s.data, s.result, s.active);
    const nodes = parts.map((p) => {
      const el = document.createElementNS(SVG_NS, p.tag);
      el.setAttribute('class', p.cls);
      for (const [k, v] of Object.entries(p.attrs)) el.setAttribute(k, String(v));
      if (p.limb) el.setAttribute('data-limb', p.limb);
      return el;
    });
    svg.replaceChildren(...nodes);
    bone.value = s.active;
    frame.value = String(s.data.frame);
    status.textContent = s.status;
    status.dataset.kind = s.statusKind;
    saveBtn.disabled = !s.loaded || s.saving;
    conflict.hidden = !s.conflict;
    for (const b of conflict.querySelectorAll('button')) b.disabled = s.saving;
  }

  current = { getState: () => structuredClone(model.getState()) };
  const me = current;
  ctx.onCleanup(() => {
    disposed = true;
    dragging = false;
    if (pointerId !== null) { try { svg.releasePointerCapture(pointerId); } catch { /* 既に外れている */ } }
    model.dispose();
    if (current === me) current = null;
  });
  render(model.getState());
  saveBtn.disabled = true;
  void model.init();

  return h('div', { class: 'rt-panel pose-ik', dataset: { feature: 'poseIkPanel' } },
    h('h3', null, '手動IKポーズ補助（2D・基礎版）腕・脚'),
    h('p', { class: 'section-note' }, '黄色い関節ハンドルをドラッグすると、肘・膝が連動します。AIは不要です。2D平面の補助で、PMX/VRM・VMDには適用しません。'),
    h('div', { class: 'rt-fields' }, h('label', null, '部位', bone), h('label', null, 'フレーム', frame), reset, saveBtn),
    svg, status, conflict);
}
