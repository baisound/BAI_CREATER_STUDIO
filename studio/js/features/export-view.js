// @ts-check
// P2-WP-07: 既存のFBX→VMD変換をSCR-23から操作する。動画レンダリングはPhase F。
import { getJson, postJson } from '../api.js';
import { createStore, project } from '../store.js';
import { h, openModal, closeModal } from '../ui.js';
import { DEFAULT_BONE_MAP, parseBoneMap, resolveMotionNames } from './export-model.js';

const view = createStore({
  mapText: JSON.stringify(DEFAULT_BONE_MAP, null, 2), mapLoaded: false, mapLoading: false,
  mapDirty: false, mapSaving: false, mapMessage: 'ボーン対応表を読み込み中…',
  jobReady: false, jobCreating: false, jobSignature: '', jobMessage: '先にコンビネーションとボーン対応を確認してください。',
  runMessage: '', running: false, elapsed: 0,
  /** @type {any} */ serverStatus: null,
  statusMessage: '変換状況を確認中…',
});

let mapLoading = false;
let statusLoading = false;
/** @type {ReturnType<typeof setInterval>|null} */ let pollTimer = null;
let runInFlight = false;

function timeline() { return project.get().bundle?.combination?.timeline || []; }
function signature() { return JSON.stringify({ timeline: timeline().map((x) => x.name), map: view.get().mapText }); }

async function loadMap() {
  if (mapLoading || view.get().mapLoaded) return;
  mapLoading = true;
  view.set({ mapLoading: true }, 'map-load');
  try {
    const r = await getJson('/api/conversion-map');
    if (!r.ok) throw Error(r.message);
    const map = r.data;
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw Error('保存済みのボーン対応表が不正です');
    const text = Object.keys(map).length ? JSON.stringify(map, null, 2) : JSON.stringify(DEFAULT_BONE_MAP, null, 2);
    view.set({ mapText: view.get().mapDirty ? view.get().mapText : text, mapLoaded: true,
      mapMessage: Object.keys(map).length ? '保存済みのボーン対応表を読み込みました。' : '既定のボーン対応表を表示中です。必要に応じて保存してください。' }, 'map-loaded');
  } catch (error) {
    view.set({ mapMessage: `ボーン対応表を読み込めません：${error instanceof Error ? error.message : String(error)}` }, 'map-error');
  } finally { mapLoading = false; view.set({ mapLoading: false }, 'map-load-end'); }
}

async function refreshStatus() {
  if (statusLoading) return;
  statusLoading = true;
  try {
    const r = await getJson('/api/conversion-status');
    if (!r.ok) throw Error(r.message);
    const data = r.data || { status: 'idle' };
    view.set({ serverStatus: data, statusMessage: '' }, 'status');
    if (data.status === 'running') startPolling();
    else if (!runInFlight) stopPolling();
  } catch (error) {
    view.set({ statusMessage: `変換状況を取得できません：${error instanceof Error ? error.message : String(error)}` }, 'status-error');
  } finally { statusLoading = false; }
}

function stopPolling() { if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; } }
function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    const s = view.get();
    const start = typeof s.serverStatus?.started === 'number' ? s.serverStatus.started * 1000 : localStart;
    view.set({ elapsed: Math.max(0, Math.floor((Date.now() - start) / 1000)) }, 'elapsed');
    void refreshStatus();
  }, 1000);
}
let localStart = 0;

/** @returns {Promise<boolean>} */
function confirmRun() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (/** @type {boolean} */ ok) => { if (done) return; done = true; closeModal(); resolve(ok); };
    openModal({
      title: 'BlenderでVMDを変換',
      body: [h('p', null, 'この画面で作成したVMDジョブをローカルBlenderで実行します。出力後は対象PMXで動きを確認してください。')],
      footer: [
        h('button', { class: 'btn', type: 'button', dataset: { role: 'confirm-cancel' }, onclick: () => finish(false) }, 'キャンセル'),
        h('button', { class: 'btn primary', type: 'button', dataset: { role: 'confirm-ok' }, onclick: () => finish(true) }, '変換を実行'),
      ],
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

/** @param {string} text */
async function saveMap(text) {
  if (view.get().mapSaving || !view.get().mapLoaded) return;
  view.set({ mapSaving: true }, 'map-save-start');
  try {
    const map = parseBoneMap(text);
    view.set({ mapMessage: 'ボーン対応表を保存中…' }, 'map-save-start');
    const r = await postJson('/api/conversion-map', map);
    if (!r.ok) throw Error(r.message);
    view.set({ mapDirty: view.get().mapText !== text, mapMessage: view.get().mapText === text ? 'ボーン対応表を保存しました。' : '保存中に編集がありました。新しい内容はまだ保存されていません。' }, 'map-saved');
  } catch (error) { view.set({ mapMessage: `ボーン対応を保存できません：${error instanceof Error ? error.message : String(error)}` }, 'map-save-error'); }
  finally { view.set({ mapSaving: false }, 'map-save-end'); }
}

/** @param {string} text */
async function createJob(text) {
  if (view.get().jobCreating || !view.get().mapLoaded) return;
  const inputSignature = signature();
  view.set({ jobReady: false, jobCreating: true, jobMessage: '登録済みFBXを確認中…' }, 'job-start');
  try {
    const map = parseBoneMap(text, true);
    const steps = timeline();
    if (!steps.length) throw Error('先にコンビネーションへFBXモーションを追加してください');
    const m = await getJson('/api/manifest');
    if (!m.ok) throw Error(m.message);
    const names = resolveMotionNames(steps, m.data || {});
    const r = await postJson('/api/export-vmd-job', { names, bone_map: map, scale: 1 });
    if (!r.ok) throw Error(r.message);
    if (signature() !== inputSignature) {
      view.set({ jobReady: false, jobMessage: 'ジョブ作成中にコンビネーションまたはボーン対応が変わりました。もう一度作成してください。' }, 'job-stale');
    } else {
      view.set({ jobReady: true, jobSignature: inputSignature, jobMessage: `VMDジョブ作成済み：${names.length}手順。${r.data?.job || 'exports/vmd_conversion_job.json'}。変換結果はPMXで確認してください。` }, 'job-created');
    }
  } catch (error) { view.set({ jobMessage: `ジョブを作成できません：${error instanceof Error ? error.message : String(error)}` }, 'job-error'); }
  finally { view.set({ jobCreating: false }, 'job-end'); }
}

/** @param {'A'|'B'} slot */
async function runConversion(slot) {
  if (runInFlight || !view.get().jobReady || signature() !== view.get().jobSignature) return;
  if (!(await confirmRun())) return;
  if (runInFlight || !view.get().jobReady || signature() !== view.get().jobSignature) return;
  runInFlight = true;
  localStart = Date.now();
  view.set({ running: true, elapsed: 0, runMessage: 'Blenderで変換中…（実測の経過時間を表示）' }, 'run-start');
  startPolling();
  try {
    const r = await postJson('/api/run-vmd-conversion', { confirm: true, slot }, { timeoutMs: 260000 });
    if (!r.ok) throw Error(r.message);
    view.set({ runMessage: `VMD変換完了：${r.data?.name || 'chain_motion.vmd'}（${r.data?.bytes ?? 'サイズ不明'} bytes）。対象PMXで動きを確認してください。` }, 'run-success');
  } catch (error) { view.set({ runMessage: `VMD変換できませんでした：${error instanceof Error ? error.message : String(error)}` }, 'run-error'); }
  finally {
    runInFlight = false;
    view.set({ running: false }, 'run-end');
    await refreshStatus();
    if (view.get().serverStatus?.status !== 'running') stopPolling();
  }
}

/** @param {any} status @param {number} elapsed */
function statusText(status, elapsed) {
  if (!status || status.status === 'idle') return 'サーバー上に変換結果はありません。';
  if (status.status === 'running') return `Blenderで実行中（経過 ${elapsed} 秒）。進捗率は取得できません。`;
  if (status.status === 'succeeded') return `サーバー上の変換結果：成功 ${status.name || 'chain_motion.vmd'}。対象PMXで動きを確認してください。`;
  if (status.status === 'failed') return `サーバー上の変換結果：失敗 ${status.error || status.output_tail || ''}`;
  return `サーバー上の変換状況：${status.status}`;
}

/** SCR-23「エクスポート」カード。 @param {import('./index.js').FeatureCtx} ctx */
export function exportPanel(ctx) {
  const mapInput = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'input', rows: '12', spellcheck: 'false', 'aria-label': 'VMD変換用ボーン対応JSON',
    dataset: { role: 'vmd-bone-map' },
  }));
  mapInput.value = view.get().mapText;
  mapInput.addEventListener('input', () => view.set({ mapText: mapInput.value, mapDirty: true, jobReady: false }, 'map-edit'));
  const mapSave = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'vmd-map-save' }, onclick: () => { void saveMap(mapInput.value); } }, 'ボーン対応を保存'));
  const job = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', type: 'button', dataset: { role: 'vmd-job' }, onclick: () => { void createJob(mapInput.value); } }, 'VMD変換ジョブを作成'));
  const slot = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '変換結果を確認するPMXスロット', dataset: { role: 'vmd-slot' } },
    h('option', { value: 'A' }, 'PMX A'), h('option', { value: 'B' }, 'PMX B')));
  const run = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'vmd-run' }, onclick: () => { void runConversion(/** @type {'A'|'B'} */ (slot.value)); } }, 'BlenderでVMD変換'));
  const check = h('button', { class: 'btn', type: 'button', dataset: { role: 'vmd-check' }, onclick: () => { void refreshStatus(); } }, '変換結果を確認');
  const summary = h('p', { class: 'section-note', dataset: { role: 'vmd-combination' } });
  const mapStatus = h('p', { class: 'small', role: 'status', dataset: { role: 'vmd-map-status' } });
  const jobStatus = h('p', { class: 'small', role: 'status', dataset: { role: 'vmd-job-status' } });
  const runStatus = h('p', { class: 'small', role: 'status', dataset: { role: 'vmd-run-status' } });
  const serverStatus = h('p', { class: 'small', role: 'status', dataset: { role: 'vmd-server-status' } });
  const root = h('div', { class: 'stack', dataset: { feature: 'exportPanel' } },
    h('p', { class: 'section-note' }, '登録済みFBXのコンビネーションをVMDへ変換します。動画の書き出しはPhase Fの範囲です。'),
    summary,
    h('label', { class: 'field stack' }, h('span', null, '変換用ボーン対応（JSON）'), mapInput),
    h('div', { class: 'btn-row' }, mapSave), mapStatus,
    h('div', { class: 'btn-row' }, job, slot, run, check), jobStatus, runStatus, serverStatus,
    h('p', { class: 'small' }, h('button', { class: 'btn', type: 'button', onclick: () => ctx.navigate('02', { tab: 'camera' }) }, 'カメラVMDの書き出しは撮影画面へ'), ' ／ ',
      h('a', { href: '/api/diagnostics/export' }, '診断ZIPを保存')));
  const render = () => {
    const s = view.get(), steps = timeline();
    summary.textContent = steps.length ? `現在のコンビネーション：${steps.length}手順。登録済みFBXに対応付けてジョブを作ります。` : 'コンビネーションは空です。先にモーション画面でFBX手順を追加してください。';
    if (!s.mapDirty && mapInput.value !== s.mapText) mapInput.value = s.mapText;
    mapSave.disabled = s.mapLoading || s.mapSaving || !s.mapLoaded || s.running;
    job.disabled = !steps.length || !s.mapLoaded || s.jobCreating || s.running;
    run.disabled = !s.jobReady || signature() !== s.jobSignature || s.running;
    mapStatus.textContent = s.mapMessage;
    jobStatus.textContent = s.jobMessage;
    runStatus.textContent = s.runMessage;
    serverStatus.textContent = s.statusMessage || statusText(s.serverStatus, s.elapsed);
  };
  render();
  ctx.onCleanup(view.subscribe(render));
  ctx.onCleanup(project.subscribe(render));
  void loadMap();
  void refreshStatus();
  return root;
}
