// @ts-check
// ⑤ SCR-13［編集］モード：1体の再生（P2 設計 §2.5(d) WP-05a）。
//  - motionCenter：中央。?mode=edit なら motionViewport、それ以外は retargetViewport（WP-04b のまま）。
//  - motionViewport：three-host に1体を置き、PMX＋VMD（表情モーフを含む）または GLB/VRM のクリップを再生する。
//  - vmdLibrary：左「VMDライブラリ」。/api/assets の VMD の一覧。行を押すと対象モデルに当てて再生する。
// 制作状態（workspace）へ書くのは［この再生位置を制作に記録］のときだけ（05b。O-⑤-7。書く経路は setWorkspaceFields だけ）。
// 外部コマンド preview_vmd・integrated_preview（05b。O-⑤-5）は SCR-13 が表示されているときだけ反応する。
import { h, regionTag, showUnimplemented, toast as uiToast } from '../ui.js';
import { assets, createStore, project } from '../store.js';
import { on } from '../bus.js';
import { setWorkspaceFields } from './project.js';
import { stateBox } from '../state-box.js';
import { PH } from '../screens.js';
import { ensureAssets, loadAssets, watchAssets } from './assets.js';
import { retargetViewport } from './retarget-view.js';
import { loadLibs, loadModel, loadErrorText, disposeObject, MISSING_FILE_TEXT, NotFoundError } from '../viewport/model-loader.js';
import { createViewport, WebGLError, WEBGL_ERROR_TEXT } from '../viewport/three-host.js';
import { normalizeModel } from '../viewport/normalize.fork.js';
import { createPlayer } from '../motion/player.js';
import { vmdUrl, loadVmdClip, canApplyVmd } from '../motion/vmd.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */

/** 左のライブラリと中央の再生ビューの受け渡し（画面の中だけ。保存しない）。 */
const motionUi = createStore({
  /** ライブラリで押された VMD（seq が増えたときだけ処理する） */ vmdReq: { id: '', seq: 0 },
  /** 今当たっている VMD の id */ active: '',
});

/** 今ある再生ビューの読み取り口（baiStudio.motion）。画面を離れると null。 @type {{getState: () => any, probe: (q: any) => any}|null} */
let current = null;
export const currentMotion = () => current;

/** 編集モードの再生ビューが開いているときの操作口（外部コマンド用）。無ければ null。 @type {{open: (id: string, o: {vmd?: string|null, clip?: number|null}) => void, say: (t: string, bad?: boolean) => void}|null} */
let editor = null;
/** SCR-13 が表示されている間だけある、外部コマンドの受け口。 @type {{ctx: FeatureCtx, run: (cmd: any) => void}|null} */
let cmdTarget = null;
/** 処理済みのコマンド id（同じ id は1回だけ。トーストも1回） @type {Set<string>} */
const seenCommands = new Set();
/** SCR-13 が受ける外部コマンド（O-⑤-5）。play_chain・stop_chain・preview_motion は SCR-05 側（05c・05d）。 */
const SCREEN13_ACTIONS = ['preview_vmd', 'integrated_preview'];
on('studio:sync-command', (/** @type {any} */ cmd) => {
  if (!cmd || !SCREEN13_ACTIONS.includes(cmd.action)) return;
  const key = String(cmd.id);
  if (seenCommands.has(key)) return;
  seenCommands.add(key);
  if (seenCommands.size > 200) seenCommands.delete(/** @type {string} */ (seenCommands.values().next().value));
  if (cmdTarget && isScreen13()) { cmdTarget.run(cmd); return; }
  uiToast(`外部から再生の指示（${cmd.action}）がありました。モーション画面（05・13）を開いているときだけ反応します。`, 'real');
});

/** @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  ctx.onCleanup(watchAssets());
  ensureAssets();
  const me = { ctx, run: (/** @type {any} */ cmd) => { void runCommand(ctx, cmd); } };
  cmdTarget = me;
  ctx.onCleanup(() => { if (cmdTarget === me) cmdTarget = null; });
}

/** 素材の一覧が読み込み済みになるのを待つ（失敗でも返る）。 */
function whenAssets() {
  return new Promise((resolve) => {
    const done = () => { const st = assets.get().status; return st === 'ready' || st === 'error'; };
    if (done()) { resolve(undefined); return; }
    const off = assets.subscribe(() => { if (done()) { off(); resolve(undefined); } });
    ensureAssets();
  });
}
/** 制作状態の読込が終わる（成功・失敗）のを待つ。進まなければ 8 秒で諦める。 */
function whenProject() {
  return new Promise((resolve) => {
    const done = () => { const st = project.get().status; return st !== 'idle' && st !== 'loading'; };
    if (done()) { resolve(undefined); return; }
    const timer = setTimeout(() => { off(); resolve(undefined); }, 8000);
    const off = project.subscribe(() => { if (done()) { clearTimeout(timer); off(); resolve(undefined); } });
  });
}

/** 外部コマンドを処理する（SCR-13 が表示されているときだけ呼ばれる。O-⑤-5）。 @param {FeatureCtx} ctx @param {any} cmd */
async function runCommand(ctx, cmd) {
  await whenAssets();
  if (cmdTarget?.ctx !== ctx || !isScreen13()) return; // 待っている間に画面を離れた
  const items = assets.get().items;
  /** @param {string} text */
  const fail = (text) => { editor?.say(text, true); uiToast(text, 'err'); };
  /** @type {{asset: string, vmd: string|null, clip: number|null}} */
  let target;
  if (cmd.action === 'preview_vmd') {
    const name = String(cmd.name || '');
    const slot = cmd.slot === 'B' ? 'B' : 'A';
    const vmd = items.find((/** @type {any} */ a) => a.id === `mmd:vmd:${name}` && a.available);
    if (!vmd) { fail(`外部からの指示：${name} が見つかりません`); return; }
    const pmx = items.find((/** @type {any} */ a) => isPlayable(a) && a.source === 'mmd' && a.kind === slot);
    if (!pmx) { fail(`外部からの指示：スロット ${slot} に再生できる PMX がありません`); return; }
    target = { asset: pmx.id, vmd: vmd.id, clip: null };
  } else {
    const name = String(cmd.name || '');
    const it = items.find((/** @type {any} */ a) => a.id === `integrated:${name}` && isPlayable(a));
    if (!it) { fail(`外部からの指示：${name} が見つかりません`); return; }
    target = { asset: it.id, vmd: null, clip: 0 };
  }
  if (editor) { editor.open(target.asset, { vmd: target.vmd, clip: target.clip }); return; }
  // ［比較］のときは［編集］へ移る（?asset=・?vmd=・?clip= を持って再描画）
  const query = Object.fromEntries(new URLSearchParams(location.search));
  delete query.tab; delete query.vmd; delete query.clip;
  const next = { ...query, mode: 'edit', asset: target.asset };
  if (target.vmd) /** @type {Record<string,string>} */ (next).vmd = target.vmd;
  if (target.clip !== null) /** @type {Record<string,string>} */ (next).clip = String(target.clip);
  ctx.navigate('13', { replace: true, tab: ctx.params.get('tab'), query: next });
}

const isScreen13 = () => /^\/workspace\/13\/?$/.test(location.pathname);
/** URL の問い合わせを更新する（replaceState。再描画はしない）。null で削除。 @param {Record<string, string|null>} changes */
function replaceQuery(changes) {
  if (!isScreen13()) return;
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(changes)) { if (v === null || v === '') url.searchParams.delete(k); else url.searchParams.set(k, v); }
  history.replaceState(history.state, '', url);
}

/** 再生ビューに出せるモデル：PMX（mmd:A/B）と GLB/VRM（integrated）。読めるものだけ。 @param {any} a */
const isPlayable = (a) => a.available && ((a.source === 'mmd' && a.format === 'PMX') || (a.source === 'integrated' && (a.format === 'GLB' || a.format === 'VRM')));
/** @param {any} a */
const isVmd = (a) => a.available && String(a.id).startsWith('mmd:vmd:');
/** @param {any} a */
const modelLabel = (a) => `${a.format}｜${a.name}${a.source === 'mmd' ? `（${a.kind}）` : ''}`;

/* ------------------------------------------------------------------ 中央 */

/** @param {FeatureCtx} ctx */
export const motionCenter = (ctx) => (ctx.params.get('mode') === 'edit' ? motionViewport(ctx) : retargetViewport(ctx));

/** @param {FeatureCtx} ctx */
export const motionViewport = (ctx) => {
  boot(ctx);
  const stageEl = h('div', { class: 'viewport vp3d', role: 'img', 'aria-label': 'モーション再生の3Dビュー', dataset: { role: 'viewport' } });
  const hud = h('div', { class: 'vp-hud' });
  const msg = h('div', { class: 'vp3d-msg', dataset: { role: 'vp-message' } });
  msg.hidden = true;
  stageEl.append(hud, msg);

  const modelSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '再生する対象モデル', dataset: { role: 'motion-model' } }));
  const clipSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'GLB/VRM のクリップ', dataset: { role: 'motion-clip' } }));
  const playBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'motion-play' } }, '▶ 再生'));
  const stopBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: '一時停止して、現在位置を保ちます', dataset: { role: 'motion-stop' } }, '■ 停止'));
  const recordBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'motion-record', act: 'real' } }, 'この再生位置を制作に記録'));
  const clearBtn = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', title: 'モデルとモーションを外します', dataset: { role: 'motion-clear' } }, '表示解除'));
  const seek = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', 'aria-label': '再生位置（秒）', dataset: { role: 'motion-seek' } }));
  const timeLabel = h('span', { class: 'mono xs', dataset: { role: 'motion-time' } }, '0.00 / 0.00 秒');
  const status = h('p', { class: 'section-note', role: 'status', dataset: { role: 'motion-status' } }, 'モデルを選ぶと表示します。');
  /** @param {string} t @param {boolean} [bad] */
  const say = (t, bad = false) => { status.textContent = t; if (bad) status.dataset.kind = 'error'; else delete status.dataset.kind; };
  /** @param {string} text @param {boolean} [bad] */
  const hostSay = (text, bad = false) => { msg.textContent = text; msg.dataset.kind = bad ? 'error' : 'info'; msg.hidden = !text; };

  /** @type {import('../viewport/model-loader.js').Libs|null} */ let libs = null;
  /** @type {import('../viewport/three-host.js').Viewport|null} */ let host = null;
  /** @type {ReturnType<typeof createPlayer>|null} */ let player = null;
  let alive = true;
  /** モデル読込の世代（古い読込の結果は捨てる） */ let seq = 0;
  let loading = false;
  /** @type {string|null} */ let pendingVmd = null;
  /** @type {{id: string|null, name: string, format: string|null, object: any}} */
  let loaded = { id: null, name: '', format: null, object: null };
  let raf = 0, last = 0;
  let initialized = false;

  const motionNow = () => (player ? player.state().motion : null);
  function refreshUi() {
    const st = player ? player.state() : { motion: null, playing: false, time: 0 };
    const has = !!st.motion;
    const dur = st.motion ? st.motion.duration : 0;
    playBtn.disabled = !has;
    stopBtn.disabled = !has;
    seek.disabled = !has;
    clearBtn.disabled = !loaded.object;
    playBtn.textContent = st.playing ? '❚❚ 一時停止' : '▶ 再生';
    seek.max = String(dur || 1);
    if (document.activeElement !== seek) seek.value = String(Math.min(st.time, dur));
    timeLabel.textContent = `${st.time.toFixed(2)} / ${dur.toFixed(2)} 秒`;
    const clips = loaded.format !== 'PMX' && clipSel.options.length > 0 && !clipSel.dataset.empty;
    clipSel.disabled = !clips;
    refreshRecord();
  }
  /** ［この再生位置を制作に記録］の有効・無効と理由（O-⑤-7）。 */
  function refreshRecord() {
    const ps = project.get();
    const ws = ps.bundle && ps.bundle.workspace;
    const item = loaded.id ? assets.get().items.find((/** @type {any} */ a) => a.id === loaded.id) : null;
    /** @type {string|null} */ let why = null;
    if (!loaded.object || !item) why = '先にモデルを選んでください。';
    else if (!(item.source === 'integrated' && (loaded.format === 'GLB' || loaded.format === 'VRM'))) why = '制作状態に記録できるのは GLB/VRM のクリップだけです（project_state_bundle.py の制限）';
    else if (ps.cameraInvalid) why = 'カメラ保存データを読めないため、記録できません。プロジェクト（18）で状況を確認してください。';
    else if (!item.filename || item.filename !== (ws && ws.asset)) why = `作業中の素材（${(ws && ws.asset) || 'なし'}）と違うモデルです。キャラクター管理（12）の［このモデルを制作に使う］で選んでから記録してください。`;
    else if (ps.status !== 'ready') why = '制作状態を読み込み中です。';
    recordBtn.disabled = why !== null;
    recordBtn.title = why || '作業中のクリップ・再生位置を制作状態に書きます。［保存］で保存されます';
  }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  /** @param {number} now */
  function tick(now) {
    raf = 0;
    if (!alive || !player) return;
    if (!player.state().playing) { refreshUi(); return; }
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1); // index.html:203
    last = now;
    player.update(dt);
    host?.invalidate();
    refreshUi();
    raf = requestAnimationFrame(tick);
  }
  function startLoop() { if (raf || !alive) return; last = performance.now(); raf = requestAnimationFrame(tick); }

  ctx.onCleanup(() => {
    alive = false; seq++;
    stopLoop();
    current = null;
    editor = null;
    player?.dispose(); player = null;
    if (host) { host.dispose(); host = null; }
  });

  async function ensureHost() {
    if (host && player) return host;
    libs = await loadLibs();
    if (!alive) return null;
    host = createViewport(stageEl, libs);
    player = createPlayer(libs.THREE);
    return host;
  }

  const hudOf = () => hud.replaceChildren(
    ...(loaded.object ? [h('span', { dataset: { role: 'hud-name' } }, loaded.name), h('span', null, String(loaded.format))] : []),
    h('span', { class: 'right' }, '編集モード'));
  hudOf();

  function resetLoaded() {
    loaded = { id: null, name: '', format: null, object: null };
    clipSel.replaceChildren(h('option', { value: '' }, '（クリップなし）'));
    clipSel.dataset.empty = '1';
    motionUi.set({ active: '' });
    hudOf();
  }
  resetLoaded();

  /** 対象モデルを読み込む。 @param {string} id @param {{vmd?: string|null, clip?: number|null}} [o] */
  async function loadSelected(id, o = {}) {
    const my = ++seq;
    stopLoop();
    pendingVmd = o.vmd || null;
    player?.clearModel();
    host?.clear();
    host?.setState({ loaded: false, assetId: null, format: null, scale: null, offset: null });
    resetLoaded();
    refreshUi();
    if (!id) { say('モデルを選んでください。'); return; }
    const item = assets.get().items.find((/** @type {any} */ a) => a.id === id);
    if (!item) { say(`選択した素材（${id}）は一覧に見つかりません。`, true); return; }
    if (!item.available) { say(MISSING_FILE_TEXT, true); return; }
    loading = true;
    say('読込中…');
    try {
      const lb = await loadLibs();
      if (!alive || my !== seq) return;
      const r = await loadModel(item, lb);
      if (!alive || my !== seq) { disposeObject(r.object); return; }
      const hostNow = await ensureHost();
      if (!hostNow || !player || !alive || my !== seq) { disposeObject(r.object); return; }
      const norm = normalizeModel(r.object, r.format, lb.THREE);
      hostNow.setObject(r.object);
      hostNow.fit();
      hostNow.setState({ loaded: true, assetId: id, format: r.format, scale: norm.scale, offset: norm.offset });
      player.setModel(r.object, r.format, r.animations);
      loaded = { id, name: item.name, format: r.format, object: r.object };
      hudOf();
      hostSay('');
      if (r.format === 'PMX') {
        clipSel.replaceChildren(h('option', { value: '' }, '（PMX にクリップはありません。VMD を選んでください）'));
        clipSel.dataset.empty = '1';
        say('VMDライブラリから VMD を選ぶと再生します。');
      } else if (r.animations.length) {
        delete clipSel.dataset.empty;
        clipSel.replaceChildren(...r.animations.map((/** @type {any} */ c, /** @type {number} */ i) => h('option', { value: String(i) }, `${c.name || `Animation ${i}`} (${c.duration.toFixed(2)}s)`)));
        const okClip = (/** @type {any} */ n) => Number.isInteger(n) && n >= 0 && n < r.animations.length;
        // 作業中の素材と同じモデルなら、記録した clip・frame から一時停止で始める（O-⑤-7、③。明示の ?clip= があれば従来どおり再生）
        /** @type {any} */ let resume = null;
        if (o.clip === null || o.clip === undefined) {
          if (item.source === 'integrated' && item.filename) {
            await whenProject();
            if (!alive || my !== seq || !player) { return; }
            const ws = project.get().bundle && project.get().bundle.workspace;
            if (ws && ws.asset && ws.asset === item.filename) resume = ws;
          }
        }
        const want = resume ? (okClip(resume.clip) ? resume.clip : 0) : (okClip(o.clip) ? /** @type {number} */ (o.clip) : 0);
        clipSel.value = String(want);
        player.applyClip(want);
        if (resume) {
          const fps = Number(project.get().bundle?.camera?.fps) > 0 ? Number(project.get().bundle.camera.fps) : 30;
          player.seek(Math.max(0, Number(resume.frame) || 0) / fps);
          say(`${item.name} : 制作状態に記録した クリップ ${want}・F ${Math.max(0, Number(resume.frame) || 0)} から（一時停止）`);
        } else {
          player.play();
          startLoop();
          say(`${item.name} : クリップ ${want} を再生中`);
        }
      } else {
        clipSel.replaceChildren(h('option', { value: '' }, '（クリップなし）'));
        clipSel.dataset.empty = '1';
        say('このモデルにはアニメーションがありません。');
      }
      hostNow.invalidate();
      loading = false;
      refreshUi();
      if (pendingVmd) { const v = pendingVmd; pendingVmd = null; await applyVmd(v); }
    } catch (e) {
      if (!alive || my !== seq) return;
      say(e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e), true);
      if (e instanceof WebGLError || (e instanceof Error && e.name === 'LibsError')) hostSay(e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e), true);
    } finally { if (my === seq) loading = false; }
  }

  /** VMD を対象モデルに当てて再生する。 @param {string} vmdId */
  async function applyVmd(vmdId) {
    if (loading) { pendingVmd = vmdId; say('モデルの読み込み後に VMD を当てます…'); return; }
    if (!loaded.object || !player || !libs) { say('まずモデルを選んでください', true); return; }
    if (!canApplyVmd(loaded.format)) {
      showUnimplemented({
        name: 'VRM・GLB への VMD の適用',
        why: '旧画面の VMD の再生は PMX だけです（index.html:340〜347）。VRM へ VMD のボーンを当てる対応表は承認済みの計画にありません（表情・口形のモーフの対応はリップシンク・表情フェーズ LIP-004 の範囲）。PMX のモデルを選んでください。',
        ids: ['MOTION-006', 'LIP-004'], phase: PH.P4,
      });
      return;
    }
    const item = assets.get().items.find((/** @type {any} */ a) => a.id === vmdId);
    if (!item || !item.available) { say(MISSING_FILE_TEXT, true); return; }
    const my = seq;
    say('VMDを読み込み中…');
    try {
      const clip = await loadVmdClip(libs, vmdUrl(item), loaded.object);
      if (!alive || my !== seq || !player) return;
      player.applyVmd(clip, vmdId);
      player.play();
      startLoop();
      host?.invalidate();
      motionUi.set({ active: vmdId });
      replaceQuery({ vmd: vmdId });
      say(`${loaded.name} : ${item.name} を再生中`);
      refreshUi();
    } catch (e) {
      if (!alive || my !== seq) return;
      say(e instanceof NotFoundError ? MISSING_FILE_TEXT : `VMD読み込み失敗: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  }

  /** 対象モデルを選ぶ（URL も更新）。 @param {string} id */
  function chooseModel(id) {
    modelSel.value = id;
    replaceQuery({ asset: id || null, vmd: null, clip: null });
    void loadSelected(id);
  }

  modelSel.addEventListener('change', () => chooseModel(modelSel.value));
  clipSel.addEventListener('change', () => {
    if (!player || clipSel.value === '') return;
    try {
      player.applyClip(Number(clipSel.value));
      player.play(); startLoop();
      replaceQuery({ clip: clipSel.value });
      say(`${loaded.name} : クリップ ${clipSel.value} を再生中`);
    } catch (e) { say(e instanceof Error ? e.message : String(e), true); }
    host?.invalidate(); refreshUi();
  });
  playBtn.addEventListener('click', () => {
    if (!player || !motionNow()) return;
    if (player.state().playing) { player.pause(); stopLoop(); } else { player.play(); startLoop(); }
    refreshUi();
  });
  stopBtn.addEventListener('click', () => {
    if (!player) return;
    player.pause(); stopLoop();
    say('停止しました（現在位置を保持）');
    refreshUi();
  });
  seek.addEventListener('input', () => {
    if (!player) return;
    player.seek(Number(seek.value));
    host?.invalidate();
    refreshUi();
  });
  recordBtn.addEventListener('click', () => {
    if (!player || recordBtn.disabled) return;
    const b = project.get().bundle;
    const cam = b && b.camera;
    const fps = cam && Number(cam.fps) > 0 ? Number(cam.fps) : 30;
    const st = player.state();
    let frame = Math.max(0, Math.round(st.time * fps));
    let capped = false;
    if (cam && Number.isFinite(Number(cam.duration)) && frame > Number(cam.duration)) { frame = Number(cam.duration); capped = true; }
    const clip = st.motion && st.motion.kind === 'clip' ? st.motion.clipIndex : null;
    setWorkspaceFields({ clip, frame }, { source: 'store' });
    const ws = project.get().bundle && project.get().bundle.workspace;
    if (!ws || ws.frame !== frame || ws.clip !== clip) return; // 書けなかった（setWorkspaceFields が理由を知らせた）
    say(capped ? `再生位置をカメラの長さ（${cam.duration} フレーム）までに丸めて記録しました` : `クリップ ${clip === null ? 'なし' : clip}・F ${frame} を記録しました`);
    uiToast(`作業中のクリップ ${clip === null ? 'なし' : clip}・再生位置 F ${frame} を記録しました。［保存］で保存されます。`, 'real');
  });
  clearBtn.addEventListener('click', () => {
    seq++; loading = false; pendingVmd = null;
    stopLoop();
    player?.clearModel();
    host?.clear();
    host?.setState({ loaded: false, assetId: null, format: null, scale: null, offset: null });
    resetLoaded();
    modelSel.value = '';
    replaceQuery({ asset: null, vmd: null, clip: null });
    say('表示を解除しました。モデルを選んでください。');
    refreshUi();
  });

  /** 対象モデルの選択肢（読めるものだけ）。 */
  const fillModels = () => {
    const keep = modelSel.value;
    const items = assets.get().items.filter(isPlayable);
    modelSel.replaceChildren(h('option', { value: '' }, '（モデルを選択）'), ...items.map((/** @type {any} */ a) => h('option', { value: a.id }, modelLabel(a))));
    if (items.some((/** @type {any} */ a) => a.id === keep)) modelSel.value = keep;
  };
  // 最初の1回だけ：?asset= → A の最初の PMX → B の最初の PMX（index.html:353〜355）→ 未選択
  const init = () => {
    const st = assets.get();
    fillModels();
    if (initialized || st.status !== 'ready') return;
    initialized = true;
    const items = st.items.filter(isPlayable);
    const wanted = ctx.params.get('asset');
    const pick = wanted || (items.find((/** @type {any} */ a) => a.source === 'mmd' && a.kind === 'A') || items.find((/** @type {any} */ a) => a.source === 'mmd' && a.kind === 'B') || { id: '' }).id;
    if (!pick) { say('モデルを選ぶと表示します。'); return; }
    if (wanted && !st.items.some((/** @type {any} */ a) => a.id === wanted)) { say(`選択した素材（${wanted}）は一覧に見つかりません。`, true); return; }
    modelSel.value = pick;
    if (wanted && modelSel.value !== pick) { // 一覧にはあるが再生できない（ファイルなし・対象外の形式）
      const it = st.items.find((/** @type {any} */ a) => a.id === wanted);
      say(it && !it.available ? MISSING_FILE_TEXT : `この素材は再生できません（形式: ${it ? it.format : '不明'}）。`, true);
      return;
    }
    const clipParam = ctx.params.get('clip');
    void loadSelected(pick, { vmd: ctx.params.get('vmd'), clip: clipParam === null || clipParam === '' ? null : Number(clipParam) });
  };
  ctx.onCleanup(assets.subscribe(init));
  ctx.onCleanup(project.subscribe(refreshRecord));
  init();
  editor = {
    say,
    open(id, o) { // 外部コマンド（O-⑤-5）：対象モデルを選んで読み込む
      initialized = true;
      fillModels();
      modelSel.value = id;
      replaceQuery({ asset: id, vmd: null, clip: o.clip === null || o.clip === undefined ? null : String(o.clip) });
      void loadSelected(id, o);
    },
  };

  // ライブラリで押された VMD
  let handled = motionUi.get().vmdReq.seq;
  ctx.onCleanup(motionUi.subscribe((s) => {
    if (s.vmdReq.seq === handled) return;
    handled = s.vmdReq.seq;
    void applyVmd(s.vmdReq.id);
  }));

  current = {
    getState: () => {
      const st = player ? player.state() : { format: null, motion: null, playing: false, time: 0 };
      return { mode: 'edit', modelId: loaded.id, format: loaded.format, motion: st.motion, playing: st.playing, time: st.time, duration: st.motion ? st.motion.duration : 0 };
    },
    probe: (/** @type {any} */ q) => (player ? player.probe(q || {}) : null),
  };

  const bar = h('div', { class: 'rt-compare motion-bar', dataset: { role: 'motion-bar' } },
    h('div', { class: 'rt-fields' },
      h('label', null, '対象モデル', modelSel), h('label', null, 'クリップ（GLB/VRM）', clipSel), clearBtn),
    h('div', { class: 'rt-fields' }, playBtn, stopBtn, h('label', null, '位置', seek), timeLabel, recordBtn),
    status);
  refreshUi();
  return h('div', { class: 'vp3d-wrap', dataset: { feature: 'motionViewport' } },
    h('div', { class: 'pane-head' }, h('h2', null, 'モーション再生'), h('span', { class: 'spacer' }), regionTag('real')), stageEl, bar);
};

/* ------------------------------------------------------------------ 左：VMDライブラリ */

/** @param {FeatureCtx} ctx */
export const vmdLibrary = (ctx) => {
  boot(ctx);
  let q = '';
  const search = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'search', placeholder: '名前で絞り込み', 'aria-label': 'VMD を絞り込み', dataset: { role: 'search' } }));
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  const body = h('div');
  const root = h('div', { dataset: { feature: 'vmdLibrary' } }, h('div', { class: 'searchbar' }, search), body);

  /** @param {string} id */
  function pressed(id) {
    if (new URLSearchParams(location.search).get('mode') === 'edit') {
      motionUi.set({ vmdReq: { id, seq: motionUi.get().vmdReq.seq + 1 } });
      return;
    }
    // ［比較］のときは［編集］へ移ってから当てる（?vmd= を持って再描画。モデルは ?asset= のまま）
    const query = Object.fromEntries(new URLSearchParams(location.search));
    delete query.tab;
    ctx.navigate('13', { replace: true, tab: ctx.params.get('tab'), query: { ...query, mode: 'edit', vmd: id } });
  }

  function draw() {
    const st = assets.get();
    if (st.status === 'idle' || st.status === 'loading') { body.replaceChildren(stateBox({ kind: 'loading', title: '読込中…', message: '素材の一覧を読み込んでいます。' })); return; }
    if (st.status === 'error') {
      const off = !!st.error && (st.error.code === 'offline' || st.error.code === 'timeout');
      body.replaceChildren(stateBox({ kind: off ? 'offline' : 'error', title: off ? '未接続' : '読み込めません', message: st.error ? st.error.message : '', retry: () => { void loadAssets(); } }));
      return;
    }
    const all = st.items.filter(isVmd).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.name).localeCompare(String(b.name), 'ja'));
    if (!all.length) {
      body.replaceChildren(h('div', { class: 'empty', dataset: { role: 'vmd-empty' } }, '登録された VMD はまだありません。',
        h('div', null, h('button', { class: 'btn', type: 'button', dataset: { act: 'nav' }, onclick: () => ctx.navigate('08', { query: { import: '1', cat: 'motion' } }) }, '素材を取り込む…'))));
      return;
    }
    const rows = all.filter((/** @type {any} */ a) => !q || String(a.name).toLowerCase().includes(q));
    const active = motionUi.get().active;
    body.replaceChildren(h('ul', { class: 'list char-list', role: 'listbox', 'aria-label': 'VMD', dataset: { role: 'vmd-list' } },
      ...(rows.length ? rows.map((/** @type {any} */ a) => h('li', { role: 'option', tabindex: '0', 'aria-selected': String(a.id === active), title: 'このモデルに当てて再生します', dataset: { assetId: a.id },
        onclick: () => pressed(a.id), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressed(a.id); } } },
      h('span', { class: 'char-name' }, a.name), h('span', { class: 'meta' }, 'VMD')))
        : [h('li', { class: 'empty', 'aria-disabled': 'true' }, '一致する VMD はありません')])));
  }
  ctx.onCleanup(assets.subscribe(draw));
  ctx.onCleanup(motionUi.subscribe(draw));
  draw();
  return root;
};
