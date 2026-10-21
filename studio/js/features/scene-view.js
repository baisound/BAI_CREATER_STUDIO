// @ts-check
// ④ SCR-06 シーン・ステージ・素材配置：3D ビュー・ステージの素材・トランスフォーム（④-11、OWNER-2。P2 設計 §2.4(b)(d)）。
// 保存先は workspace.stage（§1.15 B-4）。書き込みは setWorkspaceFields だけ（dirty になり、保存は［保存］）。
import { h, section, slider, regionTag } from '../ui.js';
import { assets, createStore, project } from '../store.js';
import { categoryOf } from './assets-model.js';
import { ensureAssets, watchAssets } from './assets.js';
import { setWorkspaceFields } from './project.js';
import { loadLibs, loadErrorText, disposeObject, MISSING_FILE_TEXT } from '../viewport/model-loader.js';
import { createViewport, createCompanionViewport, WebGLError, WEBGL_ERROR_TEXT } from '../viewport/three-host.js';
import { buildPlaced, applyStage, heightOf } from '../viewport/scene-parts.js';
import { RANGE, clamp, defaultStage, isStage } from '../viewport/placement.js';
import { defaultLighting, isLighting, putLightKey, sampleLight } from '../viewport/scene-lighting.js';
import { createSceneLightRig } from '../viewport/scene-light-rig.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('../viewport/placement.js').Stage} Stage */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */

/** 画面に出す読込の結果（ステージとキャラクター）。画面の中だけ。 */
// viewMode は補助ビューの方向。perspective はメインのみの単一レイアウト。
export const sceneUi = createStore({ stageMessage: '', charMessage: '', lightMessage: '', selectedLightId: 'key', lightMode: 'translate', showLightFrames: true, lightFrame: 0, viewMode: 'perspective' });

/** @typedef {{tryStage: (item: AssetItem) => Promise<{ok: true}|{ok: false, message: string}>}} SceneCtl */
/** 中央のビューポートが用意できたら入る（右のタブの選択欄が使う）。 @type {SceneCtl|null} */
let ctl = null;

/** 保存済みのステージ（形が正しいものだけ）。 @param {ReturnType<typeof project.get>} s @returns {Stage|null} */
export function stageOf(s) {
  const ws = s.bundle && s.bundle.workspace;
  return ws && isStage(ws.stage) ? ws.stage : null;
}
/** @param {ReturnType<typeof project.get>} s */
export function lightsOf(s) {
  const ws = s.bundle && s.bundle.workspace;
  return ws && 'lights' in ws ? (isLighting(ws.lights) ? ws.lights : null) : defaultLighting();
}
export const lightFrame = () => Math.max(0, Math.round(Number(sceneUi.get().lightFrame || 0)));
/** @param {import('../viewport/scene-lighting.js').Lighting} value */
export const saveLights = (value) => setWorkspaceFields({ lights: value }, { source: 'store' });
/** @param {ReturnType<typeof project.get>} s */
const characterFileOf = (s) => (s.bundle && s.bundle.workspace && s.bundle.workspace.asset) || '';

/** @param {FeatureCtx} ctx @param {() => void} fn @param {...{subscribe: (f: () => void) => () => void}} stores */
function watch(ctx, fn, ...stores) {
  for (const s of stores) ctx.onCleanup(s.subscribe(fn));
  fn();
}

/** @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  ctx.onCleanup(watchAssets());
  ensureAssets();
}

/* ------------------------------------------------------------------ 中央：3D ビュー */

/** @param {FeatureCtx} ctx */
export const sceneViewport = (ctx) => {
  boot(ctx);
  const stageEl = h('div', { class: 'viewport vp3d', role: 'img', 'aria-label': 'シーンの3Dビュー', dataset: { role: 'viewport' } });
  const auxiliary = h('div', { class: 'viewport vp3d scene-aux-viewport', role: 'img', 'aria-label': '選択した方向の補助ビュー', dataset: { role: 'scene-aux-viewport' }, hidden: true },
    h('span', { class: 'scene-view-caption', dataset: { role: 'scene-aux-caption' } }, '上面'));
  const viewports = h('div', { class: 'scene-viewports', dataset: { role: 'scene-viewports' } }, auxiliary, stageEl);
  const hud = h('div', { class: 'vp-hud' });
  const msg = h('div', { class: 'vp3d-msg', dataset: { role: 'vp-message' } });
  const note = h('div', { class: 'vp-note vp3d-note', dataset: { role: 'scene-note' } });
  stageEl.append(hud, msg, note);
  const directions = /** @type {const} */ ([['perspective', '単一表示'], ['top', '上面'], ['bottom', '下面'], ['front', '正面'], ['back', '背面'], ['left', '左面'], ['right', '右面']]);
  const viewMenu = /** @type {HTMLDetailsElement} */ (h('details', { class: 'scene-layout-menu', dataset: { role: 'scene-layout-menu' } },
    h('summary', { class: 'btn', title: '補助ビューの方向を選び、左に補助ビュー・右にメインの透視ビューを表示' }, '分割表示'),
    h('div', { class: 'scene-layout-options' }, ...directions.map(([mode, label]) => h('button', {
      class: 'btn scene-layout-option', type: 'button', dataset: { role: 'scene-layout-option', mode },
      onclick: () => { sceneUi.set({ viewMode: mode }, 'view-mode'); viewMenu.open = false; },
    }, label)))));
  const viewCaption = h('span', { class: 'scene-view-caption scene-main-caption' }, 'メイン・透視');
  stageEl.append(viewCaption);
  const focusButton = h('button', { class: 'btn scene-view-button', type: 'button', title: '選択中のライトへ視点を寄せる', dataset: { role: 'scene-focus-light' },
    onclick: () => {
      const lighting = lightsOf(project.get());
      const selected = lighting?.items.find((item) => item.id === sceneUi.get().selectedLightId);
      if (selected && host) {
        const position = sampleLight(selected, lightFrame()).position;
        if (companion) companion.focusAt(position);
        else host.focusAt(position);
      }
    } }, '選択へ');
  const allButton = h('button', { class: 'btn scene-view-button', type: 'button', title: '室内またはステージ全体を表示', dataset: { role: 'scene-frame-all' }, onclick: () => fitScene() }, '全体');
  const root = h('div', { class: 'vp3d-wrap', dataset: { feature: 'sceneViewport' } },
    h('div', { class: 'pane-head' }, h('h2', null, '3Dビュー'), h('span', { class: 'spacer' }), viewMenu,
      focusButton, allButton, regionTag('real')), viewports);

  /** @type {import('../viewport/three-host.js').Viewport|null} */
  let host = null;
  /** @type {ReturnType<typeof createCompanionViewport>|null} */ let companion = null;
  /** @type {import('../viewport/model-loader.js').Libs|null} */
  let libs = null;
  let alive = true;
  /** @type {any} */ let charRoot = null;
  /** @type {any} */ let stageRoot = null;
  /** @type {ReturnType<typeof createSceneLightRig>|null} */ let lightRig = null;
  /** 今のシーンに載せている素材（失敗したものも覚え、同じ失敗を繰り返さない） */
  const loaded = { char: '', stage: '' };
  let running = false;
  let again = false;
  /** 読込の世代（古い読込の結果を捨てる） */
  const gen = { char: 0, stage: 0 };

  /** @param {string} text @param {'info'|'error'} [kind] */
  const say = (text, kind = 'info') => { msg.textContent = text; msg.dataset.kind = kind; msg.hidden = !text; };

  async function ensureHost() {
    if (host && libs) return host;
    libs = await loadLibs();
    if (!alive) return null;
    host = createViewport(stageEl, libs);
    host.setBaseLighting(1.35, 0);
    try {
      const spec = 'three/addons/controls/TransformControls.js';
      const mod = await import(spec);
      if (!alive || !host) return null;
      lightRig = createSceneLightRig(host, libs.THREE, mod.TransformControls, (id, pose) => {
        const lighting = lightsOf(project.get());
        if (lighting) saveLights(putLightKey(lighting, id, lightFrame(), pose));
      }, (id) => sceneUi.set({ selectedLightId: id }, 'light-select'));
    } catch (e) {
      sceneUi.set({ lightMessage: `ライト操作ギズモを読み込めません：${loadErrorText(e)}` }, 'light-error');
    }
    if (sceneUi.get().viewMode !== 'perspective') switchView();
    return host;
  }

  /** @param {string} id @returns {AssetItem|undefined} */
  const itemOf = (id) => assets.get().items.find((a) => a.id === id);
  /** 載せた素材の識別（id と、ファイルがあるか）。一覧が変わって読めるようになったら読み直す。 @param {string} id */
  const keyOf = (id) => (id ? `${id}|${itemOf(id) ? itemOf(id)?.available : 'x'}` : '');

  /** 正投影ではスカイドームを除いた建築/キャラクターの境界を使う。 */
  function viewBounds() {
    if (!libs) return null;
    const box = new libs.THREE.Box3();
    let found = false;
    for (const root of [stageRoot, charRoot]) {
      root?.updateMatrixWorld(true);
      root?.traverse((/** @type {any} */ object) => {
        if (!object.isMesh) return;
        for (let p = object; p && p !== root.parent; p = p.parent) if (/sky.?dome/i.test(p.name || '')) return;
        box.expandByObject(object); found = true;
      });
    }
    return found ? { min: box.min.toArray(), max: box.max.toArray() } : null;
  }
  /** 補助ビューを描く間だけ室内ステージの手前側を隠し、メインには影響を残さない。 */
  function beforeAuxRender(/** @type {import('../viewport/three-host.js').OrthographicMode} */ mode) {
    /** @type {Map<any, boolean>} */ const previous = new Map();
    if (!stageRoot) return () => {};
    const side = { front: 'S', back: 'N', left: 'W', right: 'E' }[mode];
    const face = side ? new RegExp(`(?:^|_)${side}(?:_|$)`) : null;
    stageRoot.traverse((/** @type {any} */ object) => {
      if (!object.isMesh) return;
      const name = String(object.name || '');
      const hide = /sky.?dome/i.test(name)
        || (mode === 'top' && /ceiling|cove/i.test(name))
        || (mode === 'bottom' && /floor|base/i.test(name))
        || (face?.test(name) && /wall|panel|trim|base|cove|ceilinglight|floorborder/i.test(name));
      if (hide) { previous.set(object, object.visible); object.visible = false; }
    });
    return () => { for (const [object, visible] of previous) object.visible = visible; };
  }
  function switchView() {
    if (!host || !libs) return;
    const mode = sceneUi.get().viewMode;
    const split = mode !== 'perspective';
    viewports.classList.toggle('is-split', split);
    auxiliary.hidden = !split;
    viewCaption.hidden = !split;
    const caption = auxiliary.querySelector('[data-role="scene-aux-caption"]');
    if (caption) caption.textContent = ({ top: '上面', bottom: '下面', front: '正面', back: '背面', left: '左面', right: '右面' })[mode] || '';
    for (const button of viewMenu.querySelectorAll('.scene-layout-option')) button.setAttribute('aria-pressed', String(button.getAttribute('data-mode') === mode));
    if (split) {
      const orthographicMode = /** @type {import('../viewport/three-host.js').OrthographicMode} */ (mode);
      try {
        if (companion) companion.setViewMode(orthographicMode, viewBounds());
        else companion = createCompanionViewport(auxiliary, host, libs, orthographicMode, viewBounds(), beforeAuxRender);
      } catch (e) {
        companion?.dispose(); companion = null;
        sceneUi.set({ viewMode: 'perspective' }, 'view-mode');
        say(e instanceof WebGLError ? '補助ビューを開始できません（WebGL が使えません）。' : loadErrorText(e), 'error');
        return;
      }
    } else if (companion) { companion.dispose(); companion = null; }
    host.resize();
    host.invalidate();
    publish();
  }

  // 全周型スタジオのスカイドームを外から眺めると室内が隠れる。原点のダンス位置から室内を見渡す。
  function fitScene() {
    if (!host || !libs) return;
    let enclosed = false;
    stageRoot?.traverse((/** @type {any} */ object) => {
      if (/sky.?dome/i.test(object.name || '')) enclosed = true;
    });
    if (!enclosed || !stageRoot) { host.fit(); if (companion) switchView(); return; }
    stageRoot.updateMatrixWorld(true);
    const center = stageRoot.localToWorld(new libs.THREE.Vector3(0, 1.5, 0));
    const eye = stageRoot.localToWorld(new libs.THREE.Vector3(0, 2.1, 6));
    host.camera.position.copy(eye);
    host.camera.near = 0.03;
    host.camera.far = 500;
    host.camera.updateProjectionMatrix();
    host.controls.target.copy(center);
    host.controls.update();
    host.invalidate();
    if (companion) switchView();
  }

  function publish() {
    if (!host || !libs) return;
    const THREE = libs.THREE;
    const st = stageOf(project.get());
    const deg = (/** @type {number} */ r) => (r * 180) / Math.PI;
    host.setState({
      loaded: !!(charRoot || stageRoot),
      assetId: stageRoot ? stageRoot.userData.assetId : charRoot ? charRoot.userData.assetId : null,
      format: stageRoot ? stageRoot.userData.format : charRoot ? charRoot.userData.format : null,
      stage: stageRoot ? {
        assetId: stageRoot.userData.assetId, format: stageRoot.userData.format, unit: stageRoot.userData.unit, scale: st ? st.scale : null,
        displayScale: stageRoot.scale.x, position: stageRoot.position.toArray(), rotation: [deg(stageRoot.rotation.x), deg(stageRoot.rotation.y), deg(stageRoot.rotation.z)],
        height: heightOf(THREE, stageRoot),
      } : null,
      character: charRoot ? {
        assetId: charRoot.userData.assetId, format: charRoot.userData.format, unit: charRoot.userData.unit, displayScale: charRoot.scale.x,
        position: charRoot.position.toArray(), height: heightOf(THREE, charRoot),
      } : null,
      lights: lightRig?.getState() || null,
      viewportLayout: companion ? 'split' : 'single',
      secondaryView: companion?.getState() || null,
    });
    const names = [charRoot ? (itemOf(charRoot.userData.assetId)?.name || charRoot.userData.assetId) : 'なし', stageRoot ? (itemOf(stageRoot.userData.assetId)?.name || stageRoot.userData.assetId) : 'なし'];
    hud.replaceChildren(h('span', { dataset: { role: 'hud-char' } }, `キャラクター：${names[0]}`), h('span', { dataset: { role: 'hud-stage' } }, `ステージ：${names[1]}`), h('span', { class: 'right' }, companion ? '' : '3D表示'));
  }

  /** @param {string} file 保存された GLB/VRM の保存名（workspace.asset）。空なら外す。 */
  async function setCharacter(file) {
    const my = ++gen.char;
    if (charRoot) { host?.clear(charRoot); charRoot = null; }
    const id = file ? `integrated:${file}` : '';
    loaded.char = keyOf(id);
    sceneUi.set({ charMessage: '' }, 'char');
    if (!file) return;
    const item = itemOf(id);
    if (!item) { sceneUi.set({ charMessage: `作業中のキャラクターの素材が見つかりません：${file}` }, 'char'); return; }
    if (!item.available) { sceneUi.set({ charMessage: `作業中のキャラクター：${MISSING_FILE_TEXT}` }, 'char'); return; }
    try {
      const built = await buildPlaced(item, /** @type {any} */ (libs));
      if (!alive || my !== gen.char) { disposeObject(built.root); return; }
      charRoot = built.root;
      host?.add(charRoot);
    } catch (e) {
      if (my === gen.char) sceneUi.set({ charMessage: `作業中のキャラクター：${loadErrorText(e)}` }, 'char');
    }
  }

  /** 保存されたステージの素材をシーンへ。失敗しても保存値は変えない。 @param {string} assetId */
  async function setStageObject(assetId) {
    const my = ++gen.stage;
    if (stageRoot) { host?.clear(stageRoot); stageRoot = null; }
    loaded.stage = keyOf(assetId);
    sceneUi.set({ stageMessage: '' }, 'stage');
    if (!assetId) return;
    const item = itemOf(assetId);
    if (!item) { sceneUi.set({ stageMessage: `ステージの素材が見つかりません：${assetId}` }, 'stage'); return; }
    if (!item.available) { sceneUi.set({ stageMessage: MISSING_FILE_TEXT }, 'stage'); return; }
    try {
      const built = await buildPlaced(item, /** @type {any} */ (libs));
      if (!alive || my !== gen.stage) { disposeObject(built.root); return; }
      stageRoot = built.root;
      host?.add(stageRoot);
    } catch (e) {
      if (my === gen.stage) sceneUi.set({ stageMessage: loadErrorText(e) }, 'stage');
    }
  }

  async function syncOnce() {
    const ps = project.get();
    const as = assets.get();
    if (ps.status === 'idle' || ps.status === 'loading' || as.status === 'idle' || as.status === 'loading') { say('読込中…'); return; }
    if (ps.status !== 'ready') { say('制作状態を読み込めません。保存・復元（18）で確認してください。', 'error'); return; }
    if (as.status === 'error') { say('素材の一覧を読み込めません。', 'error'); return; }
    if (!(await ensureHost())) return;
    say('');
    const st = stageOf(ps);
    const charFile = characterFileOf(ps);
    const stageId = st ? st.asset : '';
    let changed = false;
    if (keyOf(charFile ? `integrated:${charFile}` : '') !== loaded.char) { await setCharacter(charFile); changed = true; }
    if (!alive) return;
    if (keyOf(stageId) !== loaded.stage) { await setStageObject(stageId); changed = true; }
    if (!alive) return;
    const cur = stageOf(project.get());
    if (stageRoot && cur && cur.asset === stageRoot.userData.assetId) applyStage(stageRoot, cur);
    const lighting = lightsOf(project.get());
    if (!lighting && sceneUi.get().lightMessage !== '保存済みライトの形式を読めません。編集せず、保存データを確認してください。')
      sceneUi.set({ lightMessage: '保存済みライトの形式を読めません。編集せず、保存データを確認してください。' }, 'light-invalid');
    else if (lighting) {
      if (sceneUi.get().lightMessage) sceneUi.set({ lightMessage: '' }, 'light-ready');
      lightRig?.sync(lighting, lightFrame());
      lightRig?.setMode(/** @type {'translate'|'rotate'} */ (sceneUi.get().lightMode));
      lightRig?.setVisible(sceneUi.get().showLightFrames);
      lightRig?.select(sceneUi.get().selectedLightId);
    }
    if (changed) fitScene();
    publish();
    host?.invalidate();
  }
  async function sync() {
    if (running) { again = true; return; }
    running = true;
    try {
      do { again = false; await syncOnce(); } while (again && alive);
    } catch (e) {
      if (alive) say(e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e), 'error');
    } finally { running = false; }
  }

  // 右のタブの選択欄から「この素材を置けるか」を確かめて置く。成功したときだけ呼び出し側が保存値を書く。
  /** @param {AssetItem} item @returns {Promise<{ok: true}|{ok: false, message: string}>} */
  async function tryStage(item) {
    if (!item.available) return { ok: false, message: MISSING_FILE_TEXT };
    try {
      if (!(await ensureHost()) || !libs) return { ok: false, message: '3D ビューを準備できていません。' };
      const built = await buildPlaced(item, libs);
      if (!alive) { disposeObject(built.root); return { ok: false, message: '画面を離れました。' }; }
      gen.stage++;
      if (stageRoot) host?.clear(stageRoot);
      stageRoot = built.root;
      loaded.stage = keyOf(item.id);
      const cur = stageOf(project.get());
      applyStage(stageRoot, cur ? { ...cur, asset: item.id } : defaultStage(item.id));
      host?.add(stageRoot);
      fitScene();
      sceneUi.set({ stageMessage: '' }, 'stage');
      publish();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e) };
    }
  }

  ctl = { tryStage };
  ctx.onCleanup(() => { alive = false; gen.char++; gen.stage++; if (ctl && ctl.tryStage === tryStage) ctl = null; companion?.dispose(); companion = null; lightRig?.dispose(); lightRig = null; if (host) { host.dispose(); host = null; } });
  ctx.onCleanup(project.subscribe(() => { void sync(); }));
  ctx.onCleanup(assets.subscribe(() => { void sync(); }));
  ctx.onCleanup(sceneUi.subscribe((_state, reason) => {
    const u = sceneUi.get();
    note.textContent = [u.charMessage, u.stageMessage, u.lightMessage].filter(Boolean).join(' ／ ');
    note.dataset.kind = note.textContent ? 'error' : '';
    lightRig?.setMode(/** @type {'translate'|'rotate'} */ (u.lightMode));
    lightRig?.setVisible(u.showLightFrames);
    lightRig?.select(u.selectedLightId);
    if (reason === 'view-mode') switchView();
    else if (reason === 'light-frame') void sync();
    else publish();
  }));
  void sync();
  return root;
};

/* ------------------------------------------------------------------ ツール：ステージを読み込む（選択欄へ） */

/** @param {FeatureCtx} _ctx */
export const stageLoadButton = (_ctx) =>
  h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'stage-load' }, title: '右の「トランスフォーム」タブの「ステージの素材」で選びます',
    onclick: () => {
      /** @type {HTMLElement|null} */ (document.querySelector('.pane-right [role="tab"][data-tab="xf"]'))?.click();
      setTimeout(() => /** @type {HTMLElement|null} */ (document.querySelector('[data-role="stage-asset"]'))?.focus(), 0);
    } }, 'ステージを読み込む');

/* ------------------------------------------------------------------ 右：トランスフォーム */

/** 数値欄の表示を、操作中でないときだけ更新する。 @param {HTMLElement} sliderEl @param {number} v */
function setSliderValue(sliderEl, v) {
  for (const i of /** @type {NodeListOf<HTMLInputElement>} */ (sliderEl.querySelectorAll('input'))) {
    if (document.activeElement !== i && i.value !== String(v)) i.value = String(v);
  }
}
/** @param {HTMLElement} sliderEl @param {boolean} disabled */
function disableSlider(sliderEl, disabled) {
  for (const i of /** @type {NodeListOf<HTMLInputElement>} */ (sliderEl.querySelectorAll('input'))) i.disabled = disabled;
}

/** @param {FeatureCtx} ctx */
export const stageTransform = (ctx) => {
  boot(ctx);
  const select = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'ステージの素材', dataset: { role: 'stage-asset' } }));
  const remove = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { act: 'real', role: 'stage-remove' } }, 'ステージを外す'));
  const message = h('p', { class: 'section-note stage-message', dataset: { role: 'stage-message' }, role: 'status' });
  const hint = h('p', { class: 'section-note' }, '素材ライブラリのステージ GLB、または登録済みモデルを1つ置きます。原点と寸法は素材のまま保持します。位置は m、回転は度で保存します。');

  /** @param {Partial<Stage>} patch */
  function patchStage(patch) {
    const cur = stageOf(project.get());
    if (!cur) return;
    setWorkspaceFields({ stage: { ...cur, ...patch } }, { source: 'store' });
  }
  const pos = [0, 1, 2].map((i) => slider({ label: ['X', 'Y', 'Z'][i], min: RANGE.position[0], max: RANGE.position[1], step: 0.1, value: 0, unit: 'm',
    onInput: (v) => { const cur = stageOf(project.get()); if (cur) patchStage({ position: /** @type {[number, number, number]} */ (cur.position.map((p, k) => (k === i ? clamp(v, RANGE.position[0], RANGE.position[1]) : p))) }); } }));
  const rot = [0, 1, 2].map((i) => slider({ label: `回転 ${['X', 'Y', 'Z'][i]}`, min: RANGE.rotationY[0], max: RANGE.rotationY[1], step: 1, value: 0, unit: '°',
    onInput: (v) => { const cur = stageOf(project.get()); if (cur) patchStage({ rotation: /** @type {[number, number, number]} */ (cur.rotation.map((p, k) => (k === i ? clamp(v, RANGE.rotationY[0], RANGE.rotationY[1]) : p))) }); } }));
  const scale = slider({ label: '拡大', min: RANGE.scale[0], max: RANGE.scale[1], step: 0.1, value: 1, unit: '×',
    onInput: (v) => patchStage({ scale: clamp(v, RANGE.scale[0], RANGE.scale[1]) }) });
  for (const s of [...pos, ...rot, scale]) s.dataset.role = 'stage-slider';

  select.addEventListener('change', async () => {
    const id = select.value;
    const cur = stageOf(project.get());
    const back = () => { select.value = cur ? cur.asset : ''; };
    if (!id) { back(); return; }
    const ps = project.get();
    if (ps.status !== 'ready' || ps.cameraInvalid) { message.textContent = ps.cameraInvalid ? 'カメラ保存データを読めないため、ステージは変えられません。' : '制作状態を読み込み中です。'; back(); return; }
    const item = assets.get().items.find((a) => a.id === id);
    if (!item) { message.textContent = `ステージの素材が見つかりません：${id}`; back(); return; }
    select.disabled = true;
    message.textContent = '読込中…';
    try {
      const r = ctl ? await ctl.tryStage(item) : { ok: false, message: '3D ビューを準備できていません。' };
      if (!r.ok) { message.textContent = /** @type {{message: string}} */ (r).message; back(); return; }
      message.textContent = '';
      setWorkspaceFields({ stage: cur ? { ...cur, asset: id } : defaultStage(id) }, { source: 'store' });
    } finally { select.disabled = false; }
  });
  remove.addEventListener('click', () => { if (stageOf(project.get())) setWorkspaceFields({ stage: null }, { source: 'store' }); });

  const root = h('div', { dataset: { feature: 'stageTransform' } },
    section('ステージの素材', 'real', hint, h('div', { class: 'field stack' }, h('label', null, '素材'), select), h('div', { class: 'btn-row' }, remove), message),
    section('位置', 'real', ...pos),
    section('回転・拡大', 'real', ...rot, scale));

  function draw() {
    const ps = project.get();
    const as = assets.get();
    const st = stageOf(ps);
    const models = as.items.filter((a) => categoryOf(a) === 'stage' || categoryOf(a) === 'char');
    const want = st ? st.asset : '';
    /** @type {any[]} */
    const opts = [h('option', { value: '' }, as.status === 'ready' ? '（ステージなし）' : '読込中…')];
    for (const a of models) opts.push(h('option', { value: a.id }, `${a.name}（${a.format}）${a.available ? '' : ' ・ファイルなし'}`));
    if (want && !models.some((a) => a.id === want)) opts.push(h('option', { value: want }, `（見つかりません）${want}`));
    select.replaceChildren(...opts);
    select.value = want;
    select.disabled = ps.status !== 'ready' || as.status !== 'ready';
    remove.disabled = !st;
    remove.title = st ? 'ステージを外します（［保存］で保存されます）' : 'ステージはありません';
    const sceneMsg = sceneUi.get().stageMessage;
    if (sceneMsg && !message.textContent) message.textContent = sceneMsg;
    for (const s of [...pos, ...rot, scale]) disableSlider(s, !st);
    if (st) {
      pos.forEach((s, i) => setSliderValue(s, st.position[i]));
      rot.forEach((s, i) => setSliderValue(s, st.rotation[i]));
      setSliderValue(scale, st.scale);
    }
  }
  // ステージの素材・数値・一覧が変わったときだけ描き直す（スライダーの操作中の要素を作り直さない）
  let sig = '';
  const run = () => {
    const ps = project.get();
    const st = stageOf(ps);
    const next = JSON.stringify([ps.status, ps.cameraInvalid ? 1 : 0, st, assets.get().status, assets.get().items.map((a) => a.id + a.available), sceneUi.get().stageMessage]);
    if (next === sig) return;
    sig = next;
    draw();
  };
  ctx.onCleanup(project.subscribe(run));
  ctx.onCleanup(assets.subscribe(run));
  ctx.onCleanup(sceneUi.subscribe(() => { message.textContent = sceneUi.get().stageMessage; }));
  run();
  return root;
};
