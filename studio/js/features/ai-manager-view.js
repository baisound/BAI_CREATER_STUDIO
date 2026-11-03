// @ts-check
// ⑧-2 SCR-19 のカード「AI管理（任意・Ollama）」（P2 設計 §2.8(d) WP-08b）。旧 bai_ai_ui.js:2〜5・25 の移植。
//  - 送る設定は旧と同じ enabled・default_llm の2つだけ（O-⑧-7）。Ollama が無くても通常制作は使える。
//  - AI の POST は 90 秒（O-⑧-5。Ollama の 75 秒より長く）。通信中は該当ボタンを無効にする。
//  - aiPosePanel（⑧-3）は WP-08c でこのファイルの末尾に足す。
import { h } from '../ui.js';
import { getJson, postJson } from '../api.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */

/** O-⑧-5：bai_ai_manager.py:64 の Ollama 待ち時間 75 秒より長くする。 */
export const AI_TIMEOUT_MS = 90000;
const role = (/** @type {string} */ name) => ({ role: name });

/** bai_ai_ui.js:3 の文言。 @param {any} status */
export function aiStatusText(status) {
  if (status && status.available) {
    const names = Array.isArray(status.models) ? status.models.map((/** @type {any} */ m) => m && m.name).filter(Boolean) : [];
    return `接続済み — ${names.join(' / ')}`;
  }
  return 'AI未接続：通常制作は使用できます';
}

/** サーバーの error を優先し、無ければ api.js の message。 @param {import('../api.js').ApiErr} r */
export const errText = (r) => r.serverMessage || r.message;

/** @param {FeatureCtx} ctx */
export function aiManager(ctx) {
  let alive = true;
  let busy = false;
  ctx.onCleanup(() => { alive = false; });

  const status = h('p', { class: 'section-note', role: 'status', 'aria-live': 'polite', dataset: role('ai-status') }, '接続確認中…');
  const enabled = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true, dataset: role('ai-enabled') }));
  const model = /** @type {HTMLInputElement} */ (h('input', { class: 'input', value: 'qwen3.5:9b', 'aria-label': 'Ollamaモデル名', dataset: role('ai-model') }));
  const result = h('p', { class: 'section-note', role: 'status', 'aria-live': 'polite', dataset: role('ai-settings-result') }, '');
  const check = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: 'Ollamaへの接続と使えるモデルを確認します', dataset: { act: 'real', role: 'ai-check' }, onclick: () => { void refresh(); } }, '接続を確認'));
  const save = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: 'AIの有効・無効とモデル名を保存します', dataset: { act: 'real', role: 'ai-save' }, onclick: () => { void saveSettings(); } }, '設定を保存'));

  /** @param {boolean} v */
  function setBusy(v) { busy = v; check.disabled = v; save.disabled = v; }

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const [settings, st] = await Promise.all([getJson('/api/ai/settings'), getJson('/api/ai/status')]);
      if (!alive) return;
      if (!settings.ok || !st.ok) { status.textContent = 'AI設定の取得に失敗しました。通常制作には影響しません。'; return; }
      enabled.checked = Boolean(settings.data && settings.data.enabled);
      model.value = String((settings.data && settings.data.default_llm) ?? '');
      status.textContent = aiStatusText(st.data);
    } finally { if (alive) setBusy(false); }
  }

  async function saveSettings() {
    if (busy) return;
    setBusy(true);
    result.textContent = '';
    let saved = false;
    try {
      const res = await postJson('/api/ai/settings', { enabled: enabled.checked, default_llm: model.value.trim() }, { timeoutMs: AI_TIMEOUT_MS });
      if (!alive) return;
      if (!res.ok) { result.textContent = `保存失敗: ${errText(res)}`; return; }
      result.textContent = '設定を保存しました';
      saved = true;
    } finally { if (alive) setBusy(false); }
    if (saved && alive) await refresh();
  }

  void refresh();

  return h('div', { class: 'rt-panel', dataset: { feature: 'aiManager' } },
    h('p', { class: 'section-note' }, 'Ollamaが停止していても、通常の編集・保存・再生には影響しません。'),
    status,
    h('div', { class: 'rt-fields' }, h('label', { class: 'rt-check' }, enabled, ' ローカルAIを有効にする'), h('label', null, 'モデル名', model)),
    h('div', { class: 'rt-fields' }, check, save),
    result);
}
