// @ts-check
// ⑧-2 SCR-19 のカード「AI管理（任意・Ollama）」（P2 設計 §2.8(d) WP-08b）。旧 bai_ai_ui.js:2〜5・25 の移植。
//  - 送る設定は旧と同じ enabled・default_llm の2つだけ（O-⑧-7）。Ollama が無くても通常制作は使える。
//  - AI の POST は 90 秒（O-⑧-5。Ollama の 75 秒より長く）。通信中は該当ボタンを無効にする。
//  - aiPosePanel（⑧-3、WP-08c）：SCR-13「足IK」の折りたたみ。基準は2D補助の画面上の値で、結果は保存せず読み込むだけ。
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

/**
 * ⑧-3 SCR-13「足IK」の折りたたみ「AIでポーズ案を作る（任意・Ollama）」（旧 bai_ai_ui.js:6〜23 の移植）。
 * 基準は model.getState().data（画面上の今の値。未保存を含む）。［IK画面で確認］は model.setData で読み込むだけで保存しない。
 * 戻り値の sync(state) を、呼び出し側が model の状態が変わるたびに呼ぶ（loaded が false の間はボタンを無効にするため）。
 * @param {FeatureCtx} ctx
 * @param {{getState: () => {loaded: boolean, data: any}, setData: (pose: any, message?: string) => Promise<void>}} model
 * @returns {HTMLElement & {sync: (s: {loaded: boolean}) => void}}
 */
export function aiPosePanel(ctx, model) {
  let alive = true;
  let busy = false;
  /** @type {any} */
  let lastPreview = null;
  const ctrl = new AbortController();
  ctx.onCleanup(() => { alive = false; ctrl.abort(); });

  const instruction = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input rt-area', rows: '3', placeholder: '例：右手を顔の横に上げて、左足は床に固定', 'aria-label': 'ポーズの指示', dataset: role('ai-instruction') }));
  const out = h('pre', { class: 'rt-pre', role: 'status', 'aria-live': 'polite', dataset: role('ai-result') }, '実行待ち');
  const run = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: '日本語の指示をAIに解析させ、制約案をJSONで表示します', dataset: { act: 'real', role: 'ai-run' }, onclick: () => { void analyse(); } }, '指示を解析'));
  const preview = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: 'この画面の今の手動IK設定を基準に、AI案を当てた2Dの計算結果を表示します。保存しません', dataset: { act: 'real', role: 'ai-preview' }, onclick: () => { void makePreview(); } }, 'IKプレビュー生成'));
  const apply = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: 'AI計算結果をこの2D補助へ読み込みます。保存はしません', dataset: { act: 'real', role: 'ai-preview-apply' }, onclick: () => { void applyPreview(); } }, 'IK画面で確認'));
  const openSettings = h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'ai-open-settings' }, onclick: () => ctx.navigate('19') }, 'AI設定（19）を開く');

  function refreshButtons() {
    const loaded = model.getState().loaded;
    run.disabled = busy || !loaded;
    preview.disabled = busy || !loaded;
    apply.disabled = busy || !loaded || !(lastPreview && Array.isArray(lastPreview.accepted) && lastPreview.accepted.length > 0);
  }
  /** @param {string} text @param {boolean} [bad] */
  function say(text, bad = false) { if (!alive) return; out.textContent = text; if (bad) out.dataset.kind = 'error'; else delete out.dataset.kind; }

  /** 通信中だけボタンを無効にして1回送る。 @param {string} pending @param {string} path @param {any} body */
  async function post(pending, path, body) {
    busy = true; refreshButtons(); say(pending);
    try { return await postJson(path, body, { timeoutMs: AI_TIMEOUT_MS, signal: ctrl.signal }); }
    finally { busy = false; if (alive) refreshButtons(); }
  }

  async function analyse() {
    if (busy) return;
    const res = await post('Qwenで指示を解析しています…', '/api/ai/pose-proposal', { text: instruction.value });
    if (!alive) return;
    if (!res.ok) say(`推論できませんでした: ${errText(res)} — 通常制作は継続できます`, true);
    else say(JSON.stringify(res.data, null, 2));
  }

  async function makePreview() {
    if (busy) return;
    const baseline = structuredClone(model.getState().data);
    const res = await post('AIからIKプレビューを生成しています…', '/api/ai/ik-preview', { text: instruction.value, baseline });
    if (!alive) return;
    if (!res.ok) {
      lastPreview = null; refreshButtons();
      say(`プレビュー失敗: ${errText(res)} — 手動編集は継続できます`, true);
      return;
    }
    lastPreview = res.data;
    refreshButtons();
    say(JSON.stringify(res.data, null, 2));
  }

  async function applyPreview() {
    if (busy || !lastPreview || !lastPreview.pose_input) return;
    const message = 'IK補助画面へ未保存の提案を表示しました。保存する場合は手動IK側で「設定を保存」を押してください。';
    await model.setData(lastPreview.pose_input, message);
    say(message);
  }

  refreshButtons();
  const el = /** @type {HTMLElement & {sync: (s: {loaded: boolean}) => void}} */ (h('details', { class: 'rt-group', dataset: { feature: 'aiPosePanel' } },
    h('summary', null, 'AIでポーズ案を作る（任意・Ollama）'),
    h('p', { class: 'section-note' }, '「IKプレビュー」は2D補助上の提案のみ。実モデル・VMDは変更しません。Ollamaが無くても手動編集は使えます。'),
    h('label', null, '日本語の指示', instruction),
    h('div', { class: 'rt-fields' }, run, preview, apply, openSettings),
    out));
  el.sync = () => refreshButtons();
  return el;
}
