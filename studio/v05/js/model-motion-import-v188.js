// @ts-check
// v0.5（③）の素材管理から VRM・FBX（モデル／動作）・GLB動作を直接登録し、見本と詳細の3D表示を出す。
// 送信・衝突判定・見本・動作再生は②（/workspace/08）と同じ部品を使う。原本と既存の登録は変更しない。
import { classifyImport, conflictOf, fbxIdFor, sha256Hex } from '/studio/js/features/import-rules.js';
import { uploadUrlFor, importedAssetId, fbxPrecheck } from '/studio/js/features/import-send.js';
import { uploadFile } from '/studio/js/api.js';
import { characterThumbnail, texturesReady } from '/studio/js/features/asset-character-thumbnail.js';
import { motionThumbnail, mountMotionPreview } from '/studio/js/features/asset-motion-preview.js';
import { loadLibs, loadModel, loadErrorText } from '/studio/js/viewport/model-loader.js';
import { createViewport } from '/studio/js/viewport/three-host.js';

/** ③の種類 → 送り先（②と同じ route/kind）と拡張子。 */
const KINDS = {
  vrm: { label: 'VRMモデル', route: 'integrated', kind: 'model', ext: 'vrm' },
  fbxModelA: { label: 'FBXモデルA（置き換え）', route: 'fbx', kind: 'modelA', ext: 'fbx' },
  fbxModelB: { label: 'FBXモデルB（置き換え）', route: 'fbx', kind: 'modelB', ext: 'fbx' },
  fbxMotion: { label: 'FBX動作', route: 'fbx', kind: 'motions', ext: 'fbx' },
  glbMotion: { label: 'GLB動作', route: 'integrated', kind: 'motion', ext: 'glb' },
};

/** 詳細で回転表示できるモデル（VRM・FBXモデル）。 @param {any} item */
const isModel = (item) => item.available && ((item.source === 'integrated' && item.kind === 'model' && item.format === 'VRM') ||
  (item.source === 'fbx' && (item.kind === 'modelA' || item.kind === 'modelB')));
/** 詳細で再生できる動作（FBX動作・GLB動作）。 @param {any} item */
const isMotion = (item) => item.available && ((item.source === 'fbx' && item.kind === 'motions') ||
  (item.source === 'integrated' && item.kind === 'motion' && item.format === 'GLB'));

/**
 * 1件を登録する。上書き・置き換えになる場合は ack に同じ文言を渡したときだけ送る。
 * @param {File} file @param {keyof typeof KINDS} key @param {{ack?: string|null, onProgress?: (p: {loaded: number, total: number}) => void}} [o]
 * @returns {Promise<{ok: true, id: string} | {ok: false, conflict?: string, error: string}>}
 */
async function register(file, key, o = {}) {
  const spec = KINDS[key];
  if (!spec) return { ok: false, error: 'この種類は登録できません' };
  const classified = classifyImport(file.name, file.size);
  if (!classified.ok) return { ok: false, error: classified.error };
  if (classified.route !== spec.route || !file.name.toLowerCase().endsWith(`.${spec.ext}`)) {
    return { ok: false, error: `${spec.label}には .${spec.ext} を選んでください` };
  }
  const inventory = await fetch('/api/assets', { cache: 'no-store' });
  if (!inventory.ok) return { ok: false, error: `素材一覧を取得できないため、上書きの確認ができません（HTTP ${inventory.status}）` };
  const items = (await inventory.json()).items || [];
  const hashes = spec.route === 'fbx' ? { fbxId: await fbxIdFor(spec.kind, file.name) }
    : { contentSha20: (await sha256Hex(await file.arrayBuffer())).slice(0, 20) };
  const conflict = conflictOf({ name: file.name, route: /** @type {any} */ (spec.route), kind: spec.kind }, items, hashes);
  if (conflict && conflict.message !== o.ack) return { ok: false, conflict: conflict.message, error: conflict.message };
  if (spec.route === 'fbx') {
    const bad = await fbxPrecheck(file, file.name, spec.kind);
    if (bad) return { ok: false, error: bad };
  }
  const res = await uploadFile(uploadUrlFor(/** @type {any} */ (spec.route), spec.kind, file.name), file,
    { contentType: 'application/octet-stream', onProgress: o.onProgress }).promise;
  if (!res.ok) return { ok: false, error: res.message };
  const id = importedAssetId(/** @type {any} */ (spec.route), file.name, res.data);
  try { localStorage.setItem('bai.studio.assets.changed', `${Date.now()}:${id}`); } catch (_) { /* storage may be disabled */ }
  return { ok: true, id };
}

/** 動作の3姿勢見本はページ内だけに持つ（②と同じ）。 @type {Map<string, Promise<string|null>>} */
const motionImages = new Map();
let motionQueue = Promise.resolve();

/**
 * 見本の URL。モデルは保存済みの正面画像（無ければ作って保存）、動作は3姿勢の画像（ページ内）。
 * @param {any} item @returns {Promise<string|null>}
 */
function thumbnailFor(item) {
  if (isModel(item)) return characterThumbnail(item);
  if (!isMotion(item)) return Promise.resolve(null);
  let pending = motionImages.get(item.id);
  if (!pending) {
    pending = motionQueue.then(() => motionThumbnail(item)).catch(() => null);
    motionQueue = pending.then(() => undefined);
    motionImages.set(item.id, pending);
  }
  return pending;
}

/** @param {string} tag @param {Record<string, string>} [attrs] @param {string} [text] */
function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/** @type {{kind: 'model'|'motion', host?: any, stage: HTMLElement, preview?: {dispose(): void}, status?: () => any}|null} */
let active = null;

/** 詳細欄の3D表示を外して WebGL を解放する。 */
function disposeDetail() {
  if (!active) return;
  active.preview?.dispose();
  active.host?.dispose();
  active = null;
}

/**
 * 詳細欄へ3D表示を置く。対象外なら null。
 * @param {HTMLElement} container @param {any} item @param {any[]} items
 */
function mountDetail(container, item, items) {
  disposeDetail();
  if (!isModel(item) && !isMotion(item)) return null;
  const stage = el('div', { 'data-role': 'v188-stage', style: 'position:relative;height:260px;background:#162235;border-radius:8px;overflow:hidden' });
  const status = el('p', { 'data-role': 'v188-status', role: 'status', class: 'baiTiny' }, '3Dを読み込み中…');
  const bar = el('div', { class: 'baiRow', style: 'gap:6px;margin-top:6px' });
  const fit = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', 'data-role': 'v188-fit' }, '全体を表示'));
  container.append(stage, bar, status);
  if (isModel(item)) {
    bar.append(fit);
    /** @type {{kind: 'model', stage: HTMLElement, host: any, status: () => any}} */
    const mine = { kind: 'model', stage, host: null,
      status: () => ({ kind: 'model', ready: stage.dataset.ready === '1', camera: mine.host?.getCameraPose() || null }) };
    active = mine;
    void (async () => {
      try {
        const libs = await loadLibs();
        const loaded = await loadModel(item, libs);
        if (active !== mine) return;
        const host = createViewport(stage, libs);
        mine.host = host;
        host.setObject(loaded.object);
        host.fit();
        fit.onclick = () => host.fit();
        status.textContent = '中ドラッグで回転、Shift＋中ドラッグで平行移動、ホイールで前後に動きます。';
        stage.dataset.ready = '1';
        if (loaded.format === 'FBX') { await texturesReady(loaded.object, 10000); if (active === mine) host.invalidate(); }
      } catch (error) {
        if (active === mine) status.textContent = loadErrorText(error);
      }
    })();
    return mine;
  }
  const play = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', 'data-role': 'v188-play' }, '▶ 再生'));
  const pause = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', 'data-role': 'v188-pause' }, '❚❚ 一時停止'));
  const seek = /** @type {HTMLInputElement} */ (el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', 'data-role': 'v188-seek', 'aria-label': '再生位置（秒）' }));
  const time = el('span', { 'data-role': 'v188-time', class: 'baiTiny' }, '0.0 / 0.0 秒');
  const clip = /** @type {HTMLSelectElement} */ (el('select', { 'data-role': 'v188-clip', 'aria-label': '動き' }));
  const model = /** @type {HTMLSelectElement} */ (el('select', { hidden: '' }));
  bar.append(play, pause, fit, clip, seek, time);
  const preview = mountMotionPreview(stage, item, items, { play, pause, fit, seek, time, status, clip, model });
  active = { kind: 'motion', stage, preview,
    status: () => ({ kind: 'motion', grayman: stage.dataset.grayman || null, time: time.textContent, seek: Number(seek.value) }) };
  return active;
}

/** 詳細欄の3D表示の状態（試験・診断用）。 */
const detailStatus = () => active?.status?.() || null;

/** @type {any} */ (window).BAIStudioV05ModelImport = { kinds: KINDS, register, thumbnailFor, mountDetail, disposeDetail, detailStatus, isModel, isMotion };
window.dispatchEvent(new Event('bai:v05-model-import-ready'));
