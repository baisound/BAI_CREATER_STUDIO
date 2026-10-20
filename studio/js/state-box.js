// @ts-check
// 読込中・空・失敗・未接続の共通表示（P2 設計 §1.10）。見た目は既存の .empty（app.css）を流用する。
import { h } from './ui.js';

/** @typedef {'loading'|'empty'|'error'|'offline'} StateKind */

/** 読込中の表示を出すまでの待ち（ちらつき防止）。 */
export const LOADING_DELAY_MS = 300;

/**
 * @param {{kind: StateKind, title?: string, message?: string, retry?: () => void}} o
 * @returns {HTMLElement}
 */
export function stateBox({ kind, title, message, retry }) {
  const el = h('div', { class: 'empty state-box', dataset: { kind }, role: kind === 'error' || kind === 'offline' ? 'alert' : 'status' },
    title ? h('b', null, title) : null,
    message ? h('p', { class: 'small' }, message) : null,
    retry ? h('button', { class: 'btn ghost', type: 'button', dataset: { act: 'real' }, onclick: retry }, '↻ 再読込') : null);
  if (kind === 'loading') {
    // 300ms 以上かかったときだけ見せる。
    el.hidden = true;
    setTimeout(() => { el.hidden = false; }, LOADING_DELAY_MS);
  }
  return el;
}
