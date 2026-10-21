// @ts-check
// WP-06b: one camera DOM and one mount, shared by SCR-02 and camera.html.
import { h } from '../ui.js';
import { project } from '../store.js';
import { loadLegacyScript, loadLegacyScripts } from '../legacy.js';
import { on as onBus } from '../bus.js';
import { cameraOnlySaved, loadProject, refreshCameraDirty, resetCameraProject, setWorkspaceFields } from '../features/project.js';

const SCRIPTS = [
  '/camera_vmd_local.js', '/camera_rig.js', '/camera_framing.js', '/camera_lens.js',
  '/camera_dof.js', '/camera_focus_tracking.js', '/camera_focus_consistency.js',
  '/camera_sequence_playback.js', '/camera.js',
];
const FOLLOW_IDS = [
  'camera-follow-bone', 'camera-follow-enabled', 'camera-follow-offset',
  'camera-follow-smoothing', 'camera-follow-save', 'camera-follow-bake',
  'camera-follow-bake-status', 'camera-follow-priority', 'camera-follow-status',
];
const TAB_NAMES = [
  ['camera', 'カメラ'], ['focus', 'フォーカス'], ['rail', 'レール'],
  ['easing', '補間'], ['status', '実装状態'],
];

/** @type {HTMLElement|null} */ let cameraRoot = null;
/** @type {Promise<HTMLElement>|null} */ let building = null;
/** @type {Promise<void>|null} */ let mounting = null;
let mounted = false;
let wired = false;
let needsFullRestore = false;
/** @type {Promise<void>} */ let restoring = Promise.resolve();

function visible() { return !!cameraRoot?.isConnected && !cameraRoot.closest('#keepalive'); }

/** @returns {{frame: number, asset: string, clip: number|null}|null} */
function workspaceSnapshot() {
  if (!mounted) return null;
  /** @type {any} */ let value = null;
  window.dispatchEvent(new CustomEvent('bai-camera-workspace-snapshot', { detail: { resolve: (/** @type {any} */ v) => { value = v; } } }));
  return value;
}

function captureWorkspace() {
  if (!visible()) return;
  const value = workspaceSnapshot();
  if (!value) throw Error('カメラの素材状態を取得できません');
  const stored = project.get().bundle?.workspace || { frame: 0, asset: '', clip: null };
  /** @type {Record<string, any>} */ const changed = {};
  for (const field of ['asset', 'clip', 'frame']) if (value[field] !== stored[field]) changed[field] = value[field];
  if (Object.keys(changed).length) setWorkspaceFields(changed, { source: 'host' });
}

/** ストアが変更された場合にだけ、既存カメラのモデル選択を更新する。 */
async function restoreWorkspace() {
  if (!mounted || !visible()) return;
  const stored = project.get().bundle?.workspace;
  if (!stored) return;
  const actual = workspaceSnapshot();
  if (!actual) throw Error('カメラの素材状態を取得できません');
  if (actual.asset !== stored.asset || actual.clip !== stored.clip) {
    await new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent('bai-camera-workspace-restore', {
      detail: { workspace: stored, resolve, reject },
    })));
  }
  if (actual.frame !== stored.frame) {
    const frame = /** @type {HTMLInputElement|null} */ (cameraRoot?.querySelector('#frame-number'));
    if (frame) { frame.value = String(stored.frame); frame.dispatchEvent(new Event('change', { bubbles: true })); }
  }
}

async function restoreBundle() {
  if (!mounted || !visible()) return;
  const data = project.get().bundle;
  if (!data?.complete || !data.workspace) return;
  await loadLegacyScript('/camera_bundle_core.js');
  window.BAICameraBundleCore?.validateRestore(data);
  await restoreWorkspace();
  await new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent('bai-camera-bundle-restore', {
    detail: { project: data.camera, frame: data.workspace.frame, confirmed: true, resolve, reject },
  })));
  refreshCameraDirty();
}

function queueRestore(full = false) {
  restoring = restoring.catch(() => {}).then(() => full ? restoreBundle() : restoreWorkspace()).catch((error) => {
    const status = cameraRoot?.querySelector('#status');
    if (status) status.textContent = `保存されたカメラ・素材を表示できません：${error instanceof Error ? error.message : String(error)}`;
  });
  return restoring;
}

function wireHost() {
  if (wired) return;
  wired = true;
  window.addEventListener('bai-studio-camera-before-save', captureWorkspace);
  window.addEventListener('bai-camera-saved', () => { void cameraOnlySaved(); refreshCameraDirty(); });
  onBus('studio:project-loaded', () => {
    if (!mounted) return;
    if (visible()) void queueRestore(true);
    else needsFullRestore = true;
  });
  project.subscribe((_state, reason) => {
    if (reason === 'workspace' && visible()) void queueRestore(false);
  });
}

/** @param {Document|Element} root @param {string} selector */
function need(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw Error(`カメラの要素が見つかりません: ${selector}`);
  return /** @type {HTMLElement} */ (element);
}

/** @param {HTMLElement} root @param {string} initialTab @param {string} source */
function populate(root, initialTab, source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const header = need(doc, 'body > header');
  const view = need(doc, 'main > .view');
  const oldAside = need(doc, 'main > aside');
  const top = h('div', { class: 'camera-host-toolbar', role: 'toolbar', 'aria-label': 'カメラ操作' });
  for (const id of ['save', 'undo', 'redo']) top.append(need(header, `#${id}`));
  need(top, '#save').textContent = 'カメラだけ保存';

  const shots = h('section', { class: 'camera-host-shots', 'aria-label': 'ショット' }, h('h2', null, 'ショット'));
  for (const id of ['camera-custom-presets', 'camera-sequence-editor']) shots.append(need(oldAside, `#${id}`));

  const tabs = h('div', { class: 'camera-host-tabs', role: 'tablist', 'aria-label': 'カメラ設定' });
  /** @type {Record<string, HTMLElement>} */
  const panels = {};
  for (const [id, label] of TAB_NAMES) panels[id] = h('section', {
    class: 'camera-host-tab-panel', role: 'tabpanel', dataset: { cameraTab: id },
    'aria-label': label, hidden: id !== initialTab,
  });
  const selectTab = (id) => {
    if (!panels[id]) id = 'camera';
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
    for (const button of tabs.querySelectorAll('[role="tab"]')) {
      button.setAttribute('aria-selected', String(/** @type {HTMLElement} */ (button).dataset.cameraTab === id));
    }
    if (location.pathname.endsWith('/02') && new URLSearchParams(location.search).get('tab') !== id) {
      const url = new URL(location.href);
      url.searchParams.set('tab', id);
      history.replaceState(history.state, '', url);
    }
  };
  for (const [id, label] of TAB_NAMES) tabs.append(h('button', {
    type: 'button', role: 'tab', dataset: { cameraTab: id, tab: id },
    'aria-selected': String(id === initialTab), onclick: () => selectTab(id),
    onkeydown: (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const current = TAB_NAMES.findIndex(([key]) => key === id);
      const next = TAB_NAMES[(current + (event.key === 'ArrowRight' ? 1 : -1) + TAB_NAMES.length) % TAB_NAMES.length][0];
      selectTab(next);
      /** @type {HTMLElement|null} */ (tabs.querySelector(`[data-camera-tab="${next}"]`))?.focus();
    },
  }, label));

  const toolbar = need(view, '.asset-toolbar');
  for (const id of FOLLOW_IDS) {
    const element = need(toolbar, `#${id}`);
    panels.focus.append(element.closest('label') || element);
  }
  for (const child of [...oldAside.children]) {
    const element = /** @type {HTMLElement} */ (child);
    if (element.id === 'camera-rig-panel') panels.rail.append(element);
    else if (element.classList.contains('framing-test') || element.classList.contains('focus-test')) panels.focus.append(element);
    else if (element.querySelector('#interpolation')) panels.easing.append(element);
    else panels.camera.append(element);
  }
  const legacyBundle = /** @type {HTMLFieldSetElement} */ (need(panels.camera, '#camera-project-bundle'));
  legacyBundle.disabled = true;
  legacyBundle.append(h('p', { class: 'camera-host-pending' }, '統合保存は制作状態の［保存］を使用します。カメラだけの保存は上部のボタンで行えます。'));
  panels.status.append(h('p', null, '既存のカメラ編集コードを新UIでも共有しています。制作状態の［保存］でコンビネーション・カメラ・素材参照を保存します。実GPU・Linuxでの描画は未検証です。'));

  const center = h('section', { class: 'camera-host-center', 'aria-label': '撮影ビュー' },
    toolbar, need(view, '.dual-views'));
  const right = h('aside', { class: 'camera-host-right pane-right', 'aria-label': 'カメラ設定' },
    tabs, ...TAB_NAMES.map(([id]) => panels[id]));
  const timeline = h('section', { class: 'camera-host-timeline', 'aria-label': 'カメラタイムライン' },
    need(view, '.transport'), need(view, '.timeline'));
  root.replaceChildren(top, h('div', { class: 'camera-host-workspace' }, shots, center, right), timeline);
  selectTab(initialTab);
}

/** @param {string} tab */
async function build(tab) {
  if (cameraRoot) return cameraRoot;
  if (!building) building = (async () => {
    const response = await fetch('/camera.html', { cache: 'no-store' });
    if (!response.ok) throw Error(`カメラ画面の要素を読めません（HTTP ${response.status}）。`);
    const root = h('div', { class: 'camera-host', dataset: { feature: 'cameraHost' } });
    populate(root, tab, await response.text());
    cameraRoot = root;
    return root;
  })().finally(() => { building = null; });
  return building;
}

/** @param {HTMLElement} root */
async function mount(root) {
  if (mounted) { window.dispatchEvent(new Event('resize')); return; }
  if (mounting) { await mounting; if (mounted) return; }
  mounting = (async () => {
    window.BAI_CAMERA_MANUAL_MOUNT = true;
    await loadLegacyScripts(SCRIPTS);
    const page = window.BAICameraPage;
    if (!page?.mount) throw Error('カメラ編集コードを読み込めませんでした。');
    const scene = await import('/camera_3d.js');
    if (!root.isConnected || root.closest('#keepalive')) return;
    const ready = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(Error('カメラ保存データの読み込みが時間内に終わりませんでした')); }, 20000);
      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener('bai-camera-project-loaded', onLoaded);
        window.removeEventListener('bai-camera-project-load-error', onError);
      };
      const onLoaded = () => { cleanup(); const status = root.querySelector('#status'); if (status) status.textContent = '保存された素材と再生位置を反映中…'; resolve(true); };
      const onError = (/** @type {Event} */ event) => { cleanup(); reject(/** @type {CustomEvent} */ (event).detail?.error || Error('カメラ保存データを読めません')); };
      window.addEventListener('bai-camera-project-loaded', onLoaded);
      window.addEventListener('bai-camera-project-load-error', onError);
    });
    page.mount(root, { host: 'studio' });
    scene.mount(root, { host: 'studio' });
    mounted = true;
    wireHost();
    window.dispatchEvent(new Event('resize'));
    await ready;
    restoring = restoring.catch(() => {}).then(restoreWorkspace);
    await restoring;
    const status = root.querySelector('#status');
    if (status) status.textContent = 'カメラ編集を開始できます（保存された素材と再生位置を反映しました）';
  })().finally(() => { mounting = null; });
  return mounting;
}

/** @param {ReturnType<typeof project.get>} state */
function invalidView(state) {
  return h('div', { class: 'camera-host-gate', role: 'alert', dataset: { role: 'camera-invalid' } },
    h('h2', null, 'カメラ保存データを読めません'),
    h('p', null, `カメラ保存データ（camera_project.json）を読めないため、カメラ画面を開けません。元のファイルはそのままです。退避コピー：${state.cameraInvalid?.backup || 'なし'}。`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (await resetCameraProject() && mounted) location.reload();
      } }, '初期状態から始める…'),
      h('button', { class: 'btn', type: 'button', onclick: () => { void loadProject({ discardLocal: true }); } }, '再読込')));
}

/** SCR-02 feature; the camera root stays in #keepalive across SPA routes. @param {import('../features/index.js').FeatureCtx} ctx */
export function cameraHost(ctx) {
  const outlet = h('div', { class: 'camera-host-outlet', dataset: { feature: 'cameraHostOutlet' } });
  let alive = true;
  let generation = 0;
  let gate = '';
  const keep = () => {
    const keepalive = document.querySelector('#keepalive');
    if (cameraRoot?.parentElement === outlet && keepalive) keepalive.append(cameraRoot);
  };
  const refresh = async () => {
    const mine = ++generation;
    const state = project.get();
    if (state.cameraInvalid) { keep(); outlet.replaceChildren(invalidView(state)); return; }
    if (state.status !== 'ready') {
      keep();
      outlet.replaceChildren(h('p', { class: 'section-note', role: 'status' }, state.status === 'error' ? '制作状態を読み込めません。再読込してください。' : '制作状態を読み込み中…'));
      return;
    }
    outlet.replaceChildren(h('p', { class: 'section-note', role: 'status' }, 'カメラ画面を準備中…'));
    try {
      const tab = ctx.params.get('tab') || 'camera';
      const root = await build(tab);
      if (!alive || mine !== generation || project.get().cameraInvalid) return;
      outlet.replaceChildren(root);
      const targetTab = root.querySelector(`[role="tab"][data-camera-tab="${TAB_NAMES.some(([id]) => id === tab) ? tab : 'camera'}"]`);
      if (targetTab && targetTab.getAttribute('aria-selected') !== 'true') /** @type {HTMLElement} */ (targetTab).click();
      await mount(root);
      if (mounted) {
        const full = needsFullRestore;
        needsFullRestore = false;
        void queueRestore(full);
      }
      if (!alive || mine !== generation || project.get().cameraInvalid) keep();
    } catch (error) {
      if (!alive || mine !== generation) return;
      keep();
      outlet.replaceChildren(h('div', { class: 'camera-host-gate', role: 'alert' },
        h('h2', null, 'カメラ画面を開けません'),
        h('p', null, error instanceof Error ? error.message : String(error)),
        h('button', { class: 'btn', type: 'button', onclick: () => { void refresh(); } }, '再試行')));
    }
  };
  const onStore = () => {
    const state = project.get();
    const next = `${state.status}|${state.cameraInvalid?.backup || ''}|${state.cameraInvalid?.message || ''}`;
    if (next === gate) return;
    gate = next;
    void refresh();
  };
  const unsubscribe = project.subscribe(onStore);
  let dirtyPoll = 0;
  dirtyPoll = window.setInterval(() => { if (visible()) refreshCameraDirty(); }, 1000);
  ctx.onCleanup(() => { try { captureWorkspace(); } catch (error) { console.error(error); } refreshCameraDirty(); window.clearInterval(dirtyPoll); alive = false; generation++; unsubscribe(); keep(); });
  onStore();
  return outlet;
}
