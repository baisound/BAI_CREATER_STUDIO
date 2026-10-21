// @ts-check
// P2 §2.5 WP-05d: SCR-05 の A/B 3D、登録FBXの連結再生、スロット別PMX＋VMD。
import { h, regionTag, toast as uiToast } from '../ui.js';
import { assets, project } from '../store.js';
import { ensureAssets, watchAssets } from './assets.js';
import { chainUi, loadManifest } from './chain-view.js';
import { loadLibs, loadModel, loadErrorText, disposeObject } from '../viewport/model-loader.js';
import { createViewport } from '../viewport/three-host.js';
import { fitActorFbx, placeActorPmx } from '../viewport/normalize.fork.js';
import { createPlayer } from '../motion/player.js';
import { loadVmdClip, vmdUrl } from '../motion/vmd.js';
import { chainLocate, chainShift } from '../motion/chain.fork.js';
import { motionFileMap, clipKeyFor, createFbxClipCache, saveMappingEntry } from '../motion/fbx-clips.js';
import { currentChainControl, setChainControl } from '../motion/chain-runtime.js';
import { ROWS } from '../motion/patterns.fork.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
/** @typedef {{id:string, object:any, mixer:any}} FbxActor */
/** @typedef {{id:string, object:any}} PmxActor */
/** @typedef {{fbx:FbxActor|null, pmx:PmxActor|null, mode:'fbx'|'pmx'|null, pmxChoice:string, player:ReturnType<typeof createPlayer>|null, baseline:{x:number,y:number,z:number}|null}} Slot */

/** @param {FeatureCtx} ctx */
export const chainViewport = (ctx) => {
  const stage = h('div', { class: 'viewport vp3d', role: 'img', 'aria-label': 'モーションのA/B 3Dビュー', dataset: { role: 'chain-viewport' } });
  const hud = h('div', { class: 'vp-hud' });
  stage.append(hud);
  const actorSelects = [0, 1].map((i) => /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': `スロット${i ? 'B' : 'A'}の表示`, dataset: { role: i ? 'actor-b' : 'actor-a' } })));
  const targetSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'VMDの対象', dataset: { role: 'vmd-target' } }, h('option', { value: 'A' }, 'A'), h('option', { value: 'B' }, 'B')));
  const vmdSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '再生するVMD', dataset: { role: 'vmd-select' } }));
  const vmdPlay = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'vmd-play' } }, '▶ PMXでVMDを再生'));
  const status = h('p', { class: 'section-note', role: 'status', 'aria-live': 'polite', dataset: { role: 'chain-status' } }, 'A/B の素材を読み込んでいます…');
  const mappingRows = h('div', { class: 'stack', dataset: { role: 'chain-mapping-rows' } });
  const root = h('div', { class: 'vp3d-wrap', dataset: { feature: 'chainViewport' } },
    h('div', { class: 'pane-head' }, h('h2', null, 'Motion Preview — A/B'), h('span', { class: 'spacer' }), regionTag('real')),
    stage,
    h('div', { class: 'btn-row chain-actor-bar' }, h('label', null, 'A 表示 ', actorSelects[0]), h('label', null, 'B 表示 ', actorSelects[1])),
    h('div', { class: 'btn-row chain-vmd-bar' }, h('label', null, '対象 ', targetSel), h('label', null, 'VMD ', vmdSel), vmdPlay),
    h('details', { class: 'chain-mapping' }, h('summary', null, 'このパターンの実FBX対応表'), mappingRows), status);

  /** @type {import('../viewport/model-loader.js').Libs|null} */ let libs = null;
  /** @type {import('../viewport/three-host.js').Viewport|null} */ let host = null;
  /** @type {ReturnType<typeof createFbxClipCache>|null} */ let clipCache = null;
  let alive = true, raf = 0, lastFrame = 0, busy = false, pending = false, playGeneration = 0;
  const pmxRequests = [0, 0];
  /** @type {Slot[]} */
  const slots = [0, 1].map(() => ({
    /** @type {FbxActor|null} */ fbx: null,
    /** @type {PmxActor|null} */ pmx: null,
    /** @type {'fbx'|'pmx'|null} */ mode: null,
    /** @type {string} */ pmxChoice: '',
    /** @type {ReturnType<typeof createPlayer>|null} */ player: null,
    /** @type {{x:number,y:number,z:number}|null} */ baseline: null,
  }));
  /** @type {{playing:boolean, clock:number, index:number, remain:number, steps:{name:string}[], clips:any[], lengths:number[], action:any, actionIndex:number}} */
  const chain = { playing: false, clock: 0, index: 0, remain: 0, steps: [], clips: [], lengths: [], action: null, actionIndex: -1 };

  /** @param {string} text @param {boolean} [bad] */
  function say(text, bad = false) { status.textContent = text; if (bad) status.dataset.kind = 'error'; else delete status.dataset.kind; }
  function selectedRoot(i) { const s = slots[i]; return s.mode === 'pmx' ? s.pmx?.object : s.mode === 'fbx' ? s.fbx?.object : null; }
  function showSlot(i) {
    const s = slots[i];
    if (s.fbx) s.fbx.object.visible = s.mode === 'fbx';
    if (s.pmx) s.pmx.object.visible = s.mode === 'pmx';
    actorSelects[i].value = s.mode === 'pmx' ? s.pmxChoice : 'fbx';
    hud.textContent = `A: ${slots[0].mode === 'pmx' ? 'PMX' : slots[0].fbx ? 'FBX' : '未割当'} / B: ${slots[1].mode === 'pmx' ? 'PMX' : slots[1].fbx ? 'FBX' : '未割当'}`;
    host?.invalidate();
  }
  /** @param {number} i @param {any} file */
  async function loadFbx(i, file) {
    const s = slots[i];
    if (s.fbx?.id === file?.id) return;
    if (s.fbx) { host?.clear(s.fbx.object); s.fbx = null; s.baseline = null; }
    if (!file || !libs || !host) return;
    try {
      const parsed = await loadModel({ id: `fbx:${file.id}`, name: file.name, kind: file.kind, format: 'FBX', source: 'fbx', available: true }, libs);
      if (!alive) { disposeObject(parsed.object); return; }
      const object = fitActorFbx(parsed.object, /** @type {0|1} */ (i), libs.THREE);
      s.fbx = { id: file.id, object, mixer: new libs.THREE.AnimationMixer(object) };
      s.baseline = { x: object.position.x, y: object.position.y, z: object.position.z };
      host.add(object);
    } catch (e) { say(`スロット${i ? 'B' : 'A'}のFBX: ${loadErrorText(e)}`, true); }
  }
  /** @param {number} i @param {AssetItem|undefined} item */
  async function loadPmx(i, item) {
    const s = slots[i];
    const request = ++pmxRequests[i];
    if (s.pmx?.id === item?.id) return;
    s.player?.clearModel();
    if (s.pmx) { host?.clear(s.pmx.object); s.pmx = null; }
    if (!item || !libs || !host) return;
    try {
      const parsed = await loadModel(item, libs);
      // 遅い読み込みが後から到着しても、より新しい選択を上書きしない。
      if (!alive || request !== pmxRequests[i]) { disposeObject(parsed.object); return; }
      const object = placeActorPmx(parsed.object, /** @type {0|1} */ (i), libs.THREE);
      object.visible = s.mode === 'pmx';
      s.pmx = { id: item.id, object };
      s.player?.setModel(object, 'PMX');
      host.add(object);
    } catch (e) { if (alive && request === pmxRequests[i]) say(`スロット${i ? 'B' : 'A'}のPMX: ${loadErrorText(e)}`, true); }
  }
  /** @returns {AssetItem[]} */
  const pmxItems = () => assets.get().items.filter((a) => a.available && a.source === 'mmd' && a.format === 'PMX');
  function refreshSelectors() {
    for (const i of [0, 1]) {
      const s = slots[i], slot = i ? 'B' : 'A';
      const pmx = pmxItems().filter((a) => a.kind === slot);
      const selected = actorSelects[i].value;
      actorSelects[i].replaceChildren(
        h('option', { value: 'fbx' }, s.fbx ? 'FBX モデル' : 'FBX モデル（未登録）'),
        ...pmx.map((a) => h('option', { value: a.id }, `PMX：${a.name}`)));
      actorSelects[i].value = selected === 'fbx' || pmx.some((a) => a.id === selected) ? selected : s.mode === 'pmx' ? s.pmxChoice : 'fbx';
      actorSelects[i].disabled = !s.fbx && !pmx.length;
    }
    const vmd = assets.get().items.filter((a) => a.available && String(a.id).startsWith('mmd:vmd:'));
    const keep = vmdSel.value;
    vmdSel.replaceChildren(h('option', { value: '' }, '（VMD を選択）'), ...vmd.map((a) => h('option', { value: a.id }, a.name)));
    if (vmd.some((a) => a.id === keep)) vmdSel.value = keep;
    vmdPlay.disabled = !vmd.length;
  }
  function drawMapping() {
    const c = project.get().bundle?.combination;
    const row = ROWS.find((r) => r.id === c?.selected);
    if (!row) { mappingRows.replaceChildren(h('p', { class: 'xs muted' }, 'パターンを選ぶと手順の対応を設定できます。')); return; }
    const m = chainUi.get().manifest, files = motionFileMap(m);
    mappingRows.replaceChildren(...[...new Set(row.steps)].map((step) => {
      const sel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': `${step}のFBX対応`, dataset: { role: 'mapping-step', step } },
        h('option', { value: '' }, '自動一致 / 未割当'),
        ...[...files].map(([key, file]) => h('option', { value: key }, file.name))));
      sel.value = m.mapping[step] || '';
      sel.onchange = async () => {
        sel.disabled = true;
        const saved = await saveMappingEntry(step, sel.value);
        if (!alive) return;
        if (!saved.ok) { say(`対応表を保存できませんでした：${saved.message}`, true); sel.value = m.mapping[step] || ''; }
        else { say(`${step} の対応を保存しました。`); await loadManifest(); }
        sel.disabled = false;
      };
      return h('label', { class: 'field' }, `${step} → `, sel);
    }));
  }

  /** @param {boolean} [clearFavorite] */
  function stop(clearFavorite = true) {
    playGeneration++;
    chain.playing = false; chain.clock = 0; chain.index = 0; chain.remain = 0; chain.actionIndex = -1; chain.action = null;
    slots[0].fbx?.mixer.stopAllAction();
    const s = slots[0];
    if (s.fbx && s.baseline) { s.fbx.object.position.set(s.baseline.x, s.baseline.y, s.baseline.z); host?.invalidate(); }
    if (clearFavorite) chainUi.set({ active: null }, 'stop');
    say('再生を停止しました。');
  }
  async function play() {
    if (!libs || !host) { say('3D表示の読み込みが完了していません。', true); return; }
    const c = project.get().bundle?.combination;
    const steps = Array.isArray(c?.timeline) ? c.timeline.map((x) => ({ name: x.name })) : [];
    if (!steps.length) { uiToast('チェインにモーションを追加してください', 'err'); return; }
    const a = slots[0];
    if (!a.fbx) { say('チェイン再生には実FBXモデルAと登録済みモーションが必要です', true); return; }
    if (a.mode === 'pmx') { a.mode = 'fbx'; showSlot(0); uiToast('連結再生のため、A を FBX モデルの表示に戻しました', 'real'); }
    stop(false);
    const generation = playGeneration;
    const m = chainUi.get().manifest, files = motionFileMap(m);
    /** @type {any[]} */ const clips = [];
    for (const step of steps) {
      const key = clipKeyFor(step.name, m.mapping, files);
      if (!key) { say(`登録されていないモーション：${step.name}`, true); return; }
      try { clips.push(await clipCache?.getClip(/** @type {any} */ (files.get(key)))); }
      catch (e) { say(`${step.name}: ${e instanceof Error ? e.message : String(e)}`, true); return; }
      if (!alive || generation !== playGeneration) return;
    }
    if (clips.some((clip) => !clip || !Number.isFinite(clip.duration) || clip.duration <= 0)) { say('再生できないモーションがあります。', true); return; }
    chain.steps = steps; chain.clips = clips; chain.lengths = clips.map((clip) => clip.duration); chain.playing = true;
    say(`チェイン 1/${steps.length} — ${steps[0].name} / 0.00s`);
    startLoop();
  }
  /** @param {number} dt */
  function advanceChain(dt) {
    if (!chain.playing || !libs) return;
    const a = slots[0];
    if (!a.fbx || !a.baseline) { stop(); return; }
    const speed = Number(project.get().bundle?.combination?.playbackSpeed) || 1;
    const loc = chainLocate(chain.lengths, chain.clock + dt * speed);
    chain.clock = loc.clock; chain.index = loc.index; chain.remain = loc.remain;
    const clip = chain.clips[loc.index];
    if (chain.actionIndex !== loc.index) {
      a.fbx.mixer.stopAllAction();
      chain.action = a.fbx.mixer.clipAction(clip);
      chain.action.reset().play();
      chain.actionIndex = loc.index;
    }
    chain.action.time = loc.remain;
    a.fbx.mixer.update(0);
    const shift = chainShift(chain.clips.slice(0, loc.index), libs.THREE);
    a.fbx.object.position.x = a.baseline.x + shift.x * a.fbx.object.scale.x;
    a.fbx.object.position.z = a.baseline.z + shift.z * a.fbx.object.scale.z;
    say(`チェイン ${loc.index + 1}/${chain.steps.length} — ${chain.steps[loc.index].name} / ${chain.clock.toFixed(2)}s`);
  }
  /** @param {number} now */
  function tick(now) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(.08, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    advanceChain(dt);
    for (const s of slots) s.player?.update(dt);
    host?.invalidate();
    if (chain.playing || slots.some((s) => s.player?.state().playing)) raf = requestAnimationFrame(tick);
  }
  function startLoop() { if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(tick); } }
  async function playVmd() {
    const i = targetSel.value === 'B' ? 1 : 0, s = slots[i];
    const item = assets.get().items.find((a) => a.id === vmdSel.value);
    if (s.mode !== 'pmx' || !s.pmx || !item || !libs || !s.player) { say('まずPMXモデルとVMDを選択してください', true); return; }
    say('VMDを読み込み中…');
    try {
      const clip = await loadVmdClip(libs, vmdUrl(item), s.pmx.object);
      if (!alive || s.mode !== 'pmx') return;
      s.player.applyVmd(clip, item.id);
      s.player.play();
      say(`${i ? 'B' : 'A'} : ${item.name} を再生中`);
      startLoop();
    } catch (e) { say(`VMD読み込み失敗: ${e instanceof Error ? e.message : String(e)}`, true); }
  }
  vmdPlay.addEventListener('click', () => { void playVmd(); });
  actorSelects.forEach((select, i) => { select.onchange = async () => {
    if (i === 0 && chain.playing) stop();
    const s = slots[i], id = select.value;
    if (id === 'fbx') { pmxRequests[i]++; s.mode = s.fbx ? 'fbx' : null; showSlot(i); return; }
    s.pmxChoice = id;
    await loadPmx(i, pmxItems().find((a) => a.id === id));
    if (!alive) return;
    s.mode = s.pmx ? 'pmx' : s.fbx ? 'fbx' : null;
    showSlot(i);
  }; });

  /** @param {number} i */
  const slotState = (i) => { const s = slots[i]; return { kind: s.mode, id: s.mode === 'pmx' ? s.pmx?.id || null : s.mode === 'fbx' ? s.fbx?.id || null : null }; };
  const ctl = {
    play, stop,
    getState: () => ({ actors: [slotState(0), slotState(1)], playing: chain.playing, clock: chain.clock, index: chain.index, remain: chain.remain, steps: chain.steps.map((x) => ({ ...x })) }),
    /** @param {{slot?: 'A'|'B', bones?: string[], morphs?: string[]}} q */
    probe(q) {
      const i = q?.slot === 'B' ? 1 : 0;
      if (slots[i].mode === 'pmx' && slots[i].player) return slots[i].player.probe(q);
      const object = selectedRoot(i);
      /** @type {{bones: Record<string, number[]|null>, morphs: Record<string, number|null>}} */ const out = { bones: {}, morphs: {} };
      for (const name of q?.bones || []) { const node = object?.getObjectByName(name); out.bones[name] = node ? node.position.toArray() : null; }
      for (const name of q?.morphs || []) out.morphs[name] = null;
      return out;
    },
  };
  setChainControl(ctl);
  ctx.onCleanup(() => {
    alive = false;
    if (currentChainControl() === ctl) setChainControl(null);
    if (raf) cancelAnimationFrame(raf);
    for (const s of slots) s.player?.dispose();
    host?.dispose();
  });
  ctx.onCleanup(watchAssets());
  ensureAssets();

  /** 読込通知からモデルの差分だけを反映する（対応表や検索の変更では再解析しない）。 */
  async function syncModels() {
    if (chainUi.get().manifest.status !== 'ready' || assets.get().status !== 'ready') return;
    if (!libs || !host) {
      try { libs = await loadLibs(); if (!alive) return; host = createViewport(stage, libs); clipCache = createFbxClipCache(libs); }
      catch (e) { say(loadErrorText(e), true); return; }
    }
    const m = chainUi.get().manifest;
    for (const i of [0, 1]) {
      const s = slots[i], kind = i ? 'modelB' : 'modelA';
      const file = m.files.find((/** @type {any} */ f) => f.kind === kind);
      if (i === 0 && chain.playing && s.fbx?.id !== file?.id) stop();
      await loadFbx(i, file);
      if (!alive) return;
      const choices = pmxItems().filter((a) => a.kind === (i ? 'B' : 'A'));
      if (!choices.some((a) => a.id === s.pmxChoice)) s.pmxChoice = choices[0]?.id || '';
      await loadPmx(i, choices.find((a) => a.id === s.pmxChoice));
      if (!alive) return;
      if (!s.mode || (s.mode === 'pmx' && !s.pmx) || (s.mode === 'fbx' && !s.fbx)) s.mode = s.pmx ? 'pmx' : s.fbx ? 'fbx' : null;
      if (!s.player) { s.player = createPlayer(libs.THREE, libs.MMDAnimationHelper); if (s.pmx) s.player.setModel(s.pmx.object, 'PMX'); }
      showSlot(i);
    }
    host.fit();
    refreshSelectors();
    if (!slots[0].fbx && !slots[1].fbx && !slots[0].pmx && !slots[1].pmx) say('A/B のモデルがありません。素材管理（08）で登録してください。');
    else if (status.textContent?.includes('読み込んでいます')) say('A/B のモデルを表示しました。');
  }
  function schedule() {
    pending = true;
    if (busy) return;
    busy = true;
    void (async () => { do { pending = false; await syncModels(); } while (pending && alive); busy = false; })();
  }
  let modelSig = '', mapSig = '', selected = -1;
  function update() {
    const m = chainUi.get().manifest, a = assets.get();
    const sig = JSON.stringify([m.status, m.files, a.status, a.items.filter((/** @type {any} */ x) => x.source === 'mmd')]);
    if (sig !== modelSig) { modelSig = sig; clipCache?.clear(); schedule(); }
    const sel = project.get().bundle?.combination?.selected ?? -1;
    const mapping = JSON.stringify(m.mapping);
    if (sel !== selected || mapping !== mapSig) { selected = sel; mapSig = mapping; drawMapping(); }
  }
  ctx.onCleanup(chainUi.subscribe(update));
  ctx.onCleanup(assets.subscribe(update));
  ctx.onCleanup(project.subscribe(update));
  update();
  void loadManifest();
  return root;
};
