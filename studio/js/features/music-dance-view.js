// @ts-check
// AUDIO-001 / Issues #39, #50: one frame clock for decoded audio and a runtime-only humanoid dance preview.
import { h } from '../ui.js';
import { getJson, postJson, getBinary } from '../api.js';
import { assets } from '../store.js';
import { loadAssets } from './assets.js';
import { loadLibs, loadModel, disposeObject, loadErrorText } from '../viewport/model-loader.js';
import { createViewport, WebGLError, WEBGL_ERROR_TEXT } from '../viewport/three-host.js';
import { createPmxGlbPreview } from '../motion/pmx-glb-preview.js';
import { createGenericGlbPreview } from '../motion/generic-glb-preview.js';
import { createPmxVmdPreview } from '../motion/pmx-vmd-preview.js';
import { createPmxPhysicsPreview } from '../motion/pmx-physics-preview.js';
import { loadVmdClip, vmdUrl } from '../motion/vmd.js';
import { normalizeModel } from '../viewport/normalize.fork.js';
import { categoryOf } from './assets-model.js';
import { FPS, clampFrame, mediaAt, audioSchedule, timelineLength, waveformPeaks } from '../motion/music-dance-clock.js';
import { productionContext, refreshProductionContext } from './production-context.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
const ENDPOINT = '/api/music-dance/project';
const MODEL_HINT = '踊るモデルを選択';
const MOTION_HINT = 'ダンスモーションを選択';
const AUDIO_HINT = 'WAV/MP3を選択';

/** @param {number} n */
function frameText(n) { return `F ${Math.round(n)} / ${(n / FPS).toFixed(2)} 秒`; }
/** @param {AssetItem} a */
function usable(a) { return a && a.available; }
/** @param {AssetItem} a */
function audioItem(a) { return a.source === 'library' && a.kind === 'audio' && ['WAV', 'MP3'].includes(a.format); }
/** @param {AssetItem} a */
function motionItem(a) { return categoryOf(a) === 'motion' && ['GLB', 'FBX', 'VMD'].includes(a.format); }
/** @param {AssetItem} a */
function modelItem(a) { return categoryOf(a) === 'char' && ['GLB', 'VRM', 'PMX', 'FBX'].includes(a.format); }

/** @param {FeatureCtx} ctx */
export const musicDanceStudio = (ctx) => {
  void loadAssets();
  const modelSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '踊るモデル', dataset: { role: 'dance-model' } }));
  const motionSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'ダンスモーション GLB・VMD・FBX', dataset: { role: 'dance-motion' } }));
  const audioSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '音楽WAVまたはMP3', dataset: { role: 'dance-audio' } }));
  const status = h('p', { class: 'section-note music-dance-status', role: 'status', dataset: { role: 'dance-status' } }, '保存済みの配置を読み込み中…');
  const viewport = h('div', { class: 'viewport vp3d music-dance-viewport', role: 'img', 'aria-label': '選択したモデルのダンスプレビュー', dataset: { role: 'dance-viewport' } });
  const threeStatus = h('p', { class: 'section-note', role: 'status', dataset: { role: 'dance-pose-status' } }, 'モデルとダンスモーションを選んでください。');
  const follow = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true, dataset: { role: 'dance-follow' } }));
  const physicsOn = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true, dataset: { role: 'dance-physics' } }));
  const physicsStatus = h('p', { class: 'section-note', role: 'status', dataset: { role: 'dance-physics-status' } }, 'PMXを選ぶとMMD物理を確認できます。');
  const play = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn primary', dataset: { role: 'dance-play' } }, '▶ 再生'));
  const pause = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-pause' } }, '❚❚ 一時停止'));
  const headBack = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-head-back' } }, '再生位置 −1F'));
  const headNext = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-head-next' } }, '再生位置 +1F'));
  const head = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 300, step: 1, value: 0, 'aria-label': '音楽とダンスの再生位置（フレーム）', dataset: { role: 'dance-head' } }));
  const headLabel = h('span', { class: 'mono', dataset: { role: 'dance-head-label' } }, frameText(0));
  const sourceLabel = h('span', { class: 'mono xs', dataset: { role: 'dance-source-times' } }, '音楽 — / ダンス —');
  const audioLane = h('div', { class: 'music-dance-lane', dataset: { role: 'dance-audio-lane' } });
  const motionLane = h('div', { class: 'music-dance-lane', dataset: { role: 'dance-motion-lane' } });
  const blockBack = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-block-back' } }, '選択ブロック −1F'));
  const blockNext = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-block-next' } }, '選択ブロック +1F'));
  const sourceBack = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-source-back' } }, '素材の頭出し −1F'));
  const sourceNext = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-source-next' } }, '素材の頭出し +1F'));
  const startFrame = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 0, max: 216000, step: 1, value: 0, 'aria-label': '選択ブロックの開始フレーム', dataset: { role: 'dance-start-frame' } }));
  const sourceFrame = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 0, max: 216000, step: 1, value: 0, 'aria-label': '選択素材の頭出しフレーム', dataset: { role: 'dance-source-frame' } }));
  const selectedLabel = h('strong', { dataset: { role: 'dance-selected' } }, '音楽トラックを選択中');
  const save = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn primary', dataset: { role: 'dance-save' } }, 'この配置を保存'));
  const reload = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn', dataset: { role: 'dance-reload' } }, '保存済みを再読込'));
  const saveStatus = h('span', { class: 'xs muted', role: 'status', dataset: { role: 'dance-save-status' } }, '');
  const sceneNote = h('p', { class: 'section-note', role: 'status', dataset: { role: 'dance-scene-context' } }, 'シーンの配置を確認中…');

  /** @type {any} */ let placement = null;
  let revision = '', dirty = false, alive = true, selected = 'audio';
  let totalFrames = 330, frame = 0, playing = false, playAnchorFrame = 0, playAnchorTime = 0, raf = 0;
  let loadGeneration = 0, audioGeneration = 0;
  /** @type {import('../viewport/model-loader.js').Libs|null} */ let libs = null;
  /** @type {import('../viewport/three-host.js').Viewport|null} */ let host = null;
  /** @type {any} */ let actor = null, motionObject = null, preview = null, physics = null;
  /** @type {AudioContext|null} */ let audioContext = null;
  /** @type {AudioBuffer|null} */ let decoded = null;
  /** @type {AudioBufferSourceNode|null} */ let sound = null;
  let audioAbort = /** @type {AbortController|null} */ (null);
  /** @type {number[]} */ let peaks = [];
  /** @type {any} */ let followed = null;

  function say(text, error = false) { status.textContent = text; status.dataset.kind = error ? 'error' : 'info'; }
  function drawSceneNote() {
    const context = productionContext.get();
    if (context.status === 'error') { sceneNote.textContent = `シーンとの参照確認ができません：${context.error}`; return; }
    if (!context.value) { sceneNote.textContent = 'シーンの配置を確認中…'; return; }
    const sceneId = context.value.sceneModelId;
    const chosen = placement?.model_id || null;
    sceneNote.textContent = `保存済みシーンのキャラクター：${sceneId || '未選択'}。${chosen && sceneId && chosen !== sceneId ? '現在選択中のダンスモデルと異なります。撮影対象を確認してください。' : '撮影ビューでは現時点で曲・ダンスを描画しません。'}`;
  }
  function saveNote(text, error = false) { saveStatus.textContent = text; saveStatus.dataset.kind = error ? 'error' : 'info'; }
  function asset(id) { return assets.get().items.find((/** @type {AssetItem} */ x) => x.id === id); }
  function hasAudio() { return !!placement?.audio_id && !!decoded; }
  function hasDance() { return !!placement?.motion_id && !!preview; }
  function currentFrame() {
    return playing && audioContext ? Math.min(totalFrames, playAnchorFrame + Math.max(0, audioContext.currentTime - playAnchorTime) * FPS) : frame;
  }
  function stopSound() { if (sound) { try { sound.stop(); } catch { /* already ended */ } sound.disconnect(); sound = null; } }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function pausePlayback() {
    if (playing) frame = clampFrame(currentFrame());
    playing = false; stopSound(); stopLoop(); drawHead(); play.disabled = !hasAudio() && !hasDance();
  }
  function setDirty() { dirty = true; saveNote('未保存の配置があります。'); }
  function rebuildLength() {
    if (!placement) return;
    totalFrames = timelineLength(decoded?.duration || 0, preview?.duration || 0, placement);
    head.max = String(totalFrames);
    if (frame > totalFrames) frame = totalFrames;
  }
  function drawHead() {
    const shown = Math.min(totalFrames, Math.max(0, currentFrame()));
    head.value = String(Math.round(shown)); headLabel.textContent = frameText(shown);
    const a = decoded && placement ? mediaAt(shown, placement.audio_start_frame, placement.audio_source_frame, decoded.duration) : null;
    const m = preview && placement ? mediaAt(shown, placement.motion_start_frame, placement.motion_source_frame, preview.duration) : null;
    sourceLabel.textContent = `音楽 ${a?.active ? a.seconds.toFixed(2) + ' 秒' : '—'} / ダンス ${m?.active ? m.seconds.toFixed(2) + ' 秒' : '—'}`;
    play.textContent = playing ? '▶ 再生中' : '▶ 再生';
    play.disabled = playing || (!hasAudio() && !hasDance()); pause.disabled = !playing;
  }
  function followActor() {
    if (!follow.checked || !preview || !host || !libs) { followed = null; return; }
    const followBone = preview.followBone || 'センター';
    const center = preview.probe([followBone])[followBone];
    if (!center) return;
    const desired = new libs.THREE.Vector3(...center.position).add(new libs.THREE.Vector3(0, .35, 0));
    if (followed) {
      const shift = desired.clone().sub(followed);
      host.camera.position.add(shift); host.controls.target.add(shift); host.controls.update();
    }
    followed = desired;
  }
  function poseAt(atFrame, continuous = false) {
    if (!preview || !placement) return;
    const p = mediaAt(atFrame, placement.motion_start_frame, placement.motion_source_frame, preview.duration);
    const time = p.active ? p.seconds : atFrame < placement.motion_start_frame ? 0 : preview.duration;
    if (physics && physicsOn.checked) physics.seek(time, continuous);
    else { physics?.resetTime(); preview.seek(time); }
    followActor(); host?.invalidate();
  }
  function scheduleSound(atFrame) {
    stopSound();
    if (!decoded || !audioContext || !placement) return;
    const plan = audioSchedule(atFrame, placement.audio_start_frame, placement.audio_source_frame, decoded.duration, playAnchorTime);
    if (!plan) return;
    const node = audioContext.createBufferSource();
    node.buffer = decoded; node.connect(audioContext.destination);
    node.start(plan.when, plan.offset, plan.duration);
    sound = node;
  }
  function tick() {
    raf = 0;
    if (!alive || !playing) return;
    const now = currentFrame();
    poseAt(now, true); drawHead();
    if (now >= totalFrames) { pausePlayback(); return; }
    raf = requestAnimationFrame(tick);
  }
  async function startPlayback() {
    if (playing || (!hasAudio() && !hasDance())) return;
    if (!audioContext) audioContext = new AudioContext();
    try { await audioContext.resume(); }
    catch { say('音声を開始できません。ブラウザの音声設定を確認してください。', true); return; }
    if (!alive) return;
    if (frame >= totalFrames) frame = 0;
    playAnchorFrame = frame; playAnchorTime = audioContext.currentTime + .03;
    playing = true; scheduleSound(frame); raf = requestAnimationFrame(tick); drawHead();
    say('同じ音声クロックで曲と3D姿勢を再生しています。');
  }
  function seek(to) {
    const wasPlaying = playing;
    if (wasPlaying) pausePlayback();
    frame = Math.max(0, Math.min(totalFrames, clampFrame(to)));
    poseAt(frame); drawHead();
    if (wasPlaying) void startPlayback();
    if (placement) { placement.head_frame = frame; setDirty(); }
  }
  function trackFields() { return selected === 'audio' ? ['audio_start_frame', 'audio_source_frame'] : ['motion_start_frame', 'motion_source_frame']; }
  function changeTrack(field, value) {
    if (!placement) return;
    const wasPlaying = playing;
    if (wasPlaying) pausePlayback();
    placement[field] = clampFrame(value);
    setDirty(); rebuildLength(); drawTimeline(); poseAt(frame); drawHead();
    if (wasPlaying) void startPlayback();
  }
  function drawWave(canvas) {
    const c = /** @type {HTMLCanvasElement} */ (canvas), context = c.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, c.width, c.height);
    context.fillStyle = '#77d6e8';
    for (let i = 0; i < peaks.length; i++) {
      const height = Math.max(1, peaks[i] * (c.height - 6));
      context.fillRect(i * c.width / peaks.length, (c.height - height) / 2, Math.max(1, c.width / peaks.length - 1), height);
    }
  }
  function drawTimeline() {
    if (!placement) return;
    const lanes = [
      { key: 'audio', el: audioLane, id: placement.audio_id, start: placement.audio_start_frame, source: placement.audio_source_frame, seconds: decoded?.duration || 0, label: '音楽' },
      { key: 'motion', el: motionLane, id: placement.motion_id, start: placement.motion_start_frame, source: placement.motion_source_frame, seconds: preview?.duration || 0, label: 'ダンス' },
    ];
    for (const lane of lanes) {
      lane.el.replaceChildren();
      const item = lane.id ? asset(lane.id) : null;
      const widthFrames = Math.max(1, lane.seconds * FPS - lane.source);
      const pct = (n) => `${Math.max(0, Math.min(100, n / totalFrames * 100))}%`;
      const block = h('button', { type: 'button', class: `music-dance-block ${selected === lane.key ? 'selected' : ''}`,
        style: { left: pct(lane.start), width: pct(widthFrames) },
        'aria-label': `${lane.label}ブロック 開始フレーム ${lane.start}。選択して1フレームずつ調整`,
        dataset: { role: `dance-${lane.key}-block` },
        onclick: () => { selected = lane.key; drawTimeline(); drawSelected(); } },
      lane.key === 'audio' && peaks.length ? h('canvas', { width: 640, height: 44, 'aria-hidden': 'true' }) : null,
      h('span', null, item ? item.name : lane.label + '未配置'));
      lane.el.append(block);
      if (lane.key === 'audio' && peaks.length) drawWave(block.querySelector('canvas'));
      lane.el.append(h('i', { class: 'music-dance-headline', style: { left: pct(currentFrame()) } }));
    }
    drawSelected();
  }
  function drawSelected() {
    if (!placement) return;
    const [start, source] = trackFields();
    selectedLabel.textContent = selected === 'audio' ? '音楽ブロックを選択中' : 'ダンスブロックを選択中';
    startFrame.value = String(placement[start]); sourceFrame.value = String(placement[source]);
    const enabled = selected === 'audio' ? !!placement.audio_id : !!placement.motion_id;
    for (const b of [blockBack, blockNext, sourceBack, sourceNext, startFrame, sourceFrame]) b.disabled = !enabled;
  }
  function refreshOptions() {
    if (!placement) return;
    const list = assets.get().items;
    /** @type {[HTMLSelectElement, string, string, (a: AssetItem) => boolean][]} */
    const groups = [
      [modelSel, 'model_id', MODEL_HINT, modelItem],
      [motionSel, 'motion_id', MOTION_HINT, motionItem],
      [audioSel, 'audio_id', AUDIO_HINT, audioItem],
    ];
    for (const [select, field, hint, pred] of groups) {
      const chosen = placement[field];
      const options = list.filter((/** @type {AssetItem} */ a) => pred(a));
      select.replaceChildren(h('option', { value: '' }, hint), ...options.map((/** @type {AssetItem} */ a) => h('option', { value: a.id }, `${a.name}${a.available ? '' : '（ファイルなし）'}`)));
      if (chosen && !options.some((/** @type {AssetItem} */ a) => a.id === chosen)) select.append(h('option', { value: chosen }, `見つかりません：${chosen}`));
      select.value = chosen || '';
    }
  }
  async function loadDance() {
    const my = ++loadGeneration;
    pausePlayback();
    physics?.dispose(); physics = null;
    preview?.dispose(); preview = null;
    if (motionObject) { disposeObject(motionObject); motionObject = null; }
    if (host) { host.clear(); host.dispose(); host = null; }
    actor = null; followed = null; physicsOn.disabled = true;
    physicsStatus.textContent = 'PMXを選ぶとMMD物理を確認できます。';
    physicsStatus.dataset.kind = 'info';
    rebuildLength(); drawTimeline(); drawHead();
    if (!placement?.model_id) { threeStatus.textContent = '踊るモデルを選んでください。'; return; }
    const model = asset(placement.model_id), motion = placement.motion_id ? asset(placement.motion_id) : null;
    if (!model || !usable(model) || !modelItem(model)) { threeStatus.textContent = '選択したモデルの元ファイルがありません。登録を確認してください。'; return; }
    threeStatus.textContent = `${model.format}モデルを読み込み中…`;
    try {
      const lb = await loadLibs();
      if (!alive || my !== loadGeneration) return;
      libs = lb;
      const target = await loadModel(model, lb);
      if (!alive || my !== loadGeneration) { disposeObject(target.object); return; }
      actor = target.object;
      if (target.format === 'PMX') {
        actor.scale.setScalar(.08);
        actor.updateMatrixWorld(true);
        const box = new lb.THREE.Box3().setFromObject(actor, true);
        actor.position.y -= box.min.y;
      } else normalizeModel(actor, target.format, lb.THREE);
      host = createViewport(viewport, lb);
      host.setObject(actor); host.fit();
      if (!motion) { threeStatus.textContent = `${model.format}モデルを表示中。ダンスモーションを選ぶと動作を確認できます。`; return; }
      if (!usable(motion) || !motionItem(motion)) throw Error('選択したダンスモーションの元ファイルがありません。登録を確認してください。');
      let motionLabel = motion.name;
      if (motion.format === 'VMD') {
        if (target.format !== 'PMX') throw Error('VMDはPMXモデルで再生できます。GLB・VRM・FBXモデルへのVMD骨対応はこの画面では未対応です。');
        const clip = await loadVmdClip(lb, vmdUrl(motion), actor);
        if (!alive || my !== loadGeneration) return;
        preview = createPmxVmdPreview(lb.THREE, lb.MMDAnimationHelper, actor, clip, motion.id);
      } else {
        const source = await loadModel(motion, lb);
        if (!alive || my !== loadGeneration) { disposeObject(source.object); return; }
        motionObject = source.object;
        if (!source.animations.length) throw new Error(`${motion.format}にアニメーションがありません。`);
        preview = target.format === 'PMX'
          ? createPmxGlbPreview(lb.THREE, actor, motionObject, source.animations[0])
          : createGenericGlbPreview(lb.THREE, actor, motionObject, source.animations[0]);
        motionLabel = source.animations[0].name || motion.name;
      }
      preview.seek(0);
      if (target.format === 'PMX') {
        physicsStatus.textContent = 'PMXの剛体とジョイントを初期化中…';
        try {
          const prepared = await createPmxPhysicsPreview(actor, preview);
          if (!alive || my !== loadGeneration) { prepared.dispose(); return; }
          physics = prepared;
          physicsStatus.textContent = `MMD物理を適用中：動的剛体 ${physics.dynamicBodies}、ジョイント ${physics.constraints}。`;
          physicsStatus.dataset.kind = 'info'; physicsOn.disabled = false;
        } catch (e) {
          if (!alive || my !== loadGeneration) return;
          physicsStatus.textContent = `物理演算を開始できません：${e instanceof Error ? e.message : String(e)}`;
          physicsStatus.dataset.kind = 'error'; physicsOn.disabled = true;
        }
      } else {
        physicsStatus.textContent = `${target.format}の物理演算はこの画面では未対応です。骨の動作のみ確認できます。`;
      }
      followed = null; followActor();
      threeStatus.textContent = motion.format === 'VMD'
        ? `PMXで ${motionLabel} をVMDプレビュー中。IK・付与骨を評価します。元データは変更しません。`
        : `${target.format}の${preview.mappedBones}本の骨で ${motionLabel} をプレビュー中。未対応 ${preview.missingBones.length}本。元データは変更しません。`;
      threeStatus.dataset.kind = 'info';
      rebuildLength(); poseAt(frame); drawTimeline(); drawHead();
    } catch (e) {
      if (!alive || my !== loadGeneration) return;
      threeStatus.textContent = e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e);
      threeStatus.dataset.kind = 'error';
    }
  }
  async function loadAudio() {
    const my = ++audioGeneration;
    pausePlayback(); audioAbort?.abort(); audioAbort = new AbortController();
    decoded = null; peaks = []; rebuildLength(); drawTimeline(); drawHead();
    if (!placement?.audio_id) return;
    const item = asset(placement.audio_id);
    if (!item || !usable(item) || !audioItem(item)) { say('選択した音声の元ファイルがありません。配置は保持します。', true); return; }
    say('音声をデコードして波形を準備中…');
    try {
      const result = await getBinary(`/api/library-assets/file/${encodeURIComponent(item.id)}`, { signal: audioAbort.signal });
      if (!alive || my !== audioGeneration) return;
      if (!result.ok) throw new Error(result.message);
      if (!audioContext) audioContext = new AudioContext();
      const buffer = await audioContext.decodeAudioData(result.data.slice(0));
      if (!alive || my !== audioGeneration) return;
      decoded = buffer; peaks = waveformPeaks(buffer.getChannelData(0), 160);
      rebuildLength(); drawTimeline(); drawHead();
      say(`${item.name} を配置しました。実波形とダンスを同じ時刻で再生できます。`);
    } catch (e) {
      if (!alive || my !== audioGeneration) return;
      say(`音声を読めません：${e instanceof Error ? e.message : String(e)}`, true);
    }
  }
  async function loadPlacement() {
    pausePlayback();
    const result = await getJson(ENDPOINT);
    if (!alive) return;
    if (!result.ok) { say(result.message, true); return; }
    if (assets.get().status !== 'ready') await loadAssets();
    if (!alive) return;
    placement = result.data.project; revision = result.data.revision; dirty = false;
    for (const [param, field] of [['model', 'model_id'], ['motion', 'motion_id'], ['audio', 'audio_id']]) {
      const id = ctx.params.get(param);
      if (id && id !== placement[field]) { placement[field] = id; dirty = true; }
    }
    frame = clampFrame(placement.head_frame);
    drawSceneNote();
    refreshOptions(); drawTimeline(); drawHead();
    saveNote(dirty ? '選択素材を配置しました。［この配置を保存］で確定します。' : '保存済みの配置を読み込みました。');
    say('モデル・ダンスモーション・曲を選び、ブロックを選択して1フレームずつ調整できます。');
    void loadDance(); void loadAudio();
  }
  async function savePlacement() {
    if (!placement || !revision) return;
    pausePlayback(); placement.head_frame = frame;
    save.disabled = true; saveNote('保存中…');
    const result = await postJson(ENDPOINT, placement, { ifMatch: revision });
    if (!alive) return;
    save.disabled = false;
    if (!result.ok) { saveNote(result.message, true); return; }
    revision = result.data.revision; dirty = false; saveNote('配置を保存しました。再読込後も復元します。');
    void refreshProductionContext();
  }

  modelSel.addEventListener('change', () => { if (!placement) return; placement.model_id = modelSel.value || null; setDirty(); drawSceneNote(); void loadDance(); });
  motionSel.addEventListener('change', () => { if (!placement) return; placement.motion_id = motionSel.value || null; setDirty(); void loadDance(); });
  audioSel.addEventListener('change', () => { if (!placement) return; placement.audio_id = audioSel.value || null; setDirty(); void loadAudio(); });
  play.addEventListener('click', () => { void startPlayback(); });
  pause.addEventListener('click', pausePlayback);
  physicsOn.addEventListener('change', () => poseAt(frame));
  head.addEventListener('input', () => seek(Number(head.value)));
  headBack.addEventListener('click', () => seek(currentFrame() - 1));
  headNext.addEventListener('click', () => seek(currentFrame() + 1));
  blockBack.addEventListener('click', () => { const [field] = trackFields(); changeTrack(field, placement[field] - 1); });
  blockNext.addEventListener('click', () => { const [field] = trackFields(); changeTrack(field, placement[field] + 1); });
  sourceBack.addEventListener('click', () => { const [, field] = trackFields(); changeTrack(field, placement[field] - 1); });
  sourceNext.addEventListener('click', () => { const [, field] = trackFields(); changeTrack(field, placement[field] + 1); });
  startFrame.addEventListener('change', () => { const [field] = trackFields(); changeTrack(field, Number(startFrame.value)); });
  sourceFrame.addEventListener('change', () => { const [, field] = trackFields(); changeTrack(field, Number(sourceFrame.value)); });
  save.addEventListener('click', () => { void savePlacement(); });
  reload.addEventListener('click', () => { void loadPlacement(); });
  ctx.onCleanup(assets.subscribe(() => refreshOptions()));
  ctx.onCleanup(productionContext.subscribe(drawSceneNote));
  ctx.onCleanup(() => {
    alive = false; loadGeneration++; audioGeneration++; audioAbort?.abort(); pausePlayback();
    physics?.dispose(); preview?.dispose(); if (motionObject) disposeObject(motionObject); host?.dispose();
    if (audioContext) void audioContext.close();
  });
  void loadPlacement();
  void refreshProductionContext();

  return h('div', { class: 'music-dance-studio', dataset: { feature: 'musicDanceStudio' } },
    h('div', { class: 'music-dance-intro' }, h('h2', null, '音楽とダンスを合わせる'), h('p', null, '登録した曲とGLB/VMD/FBXダンスを、選んだモデルで同じ30fpsのタイムラインに配置します。VMDはPMXで再生できます。人体骨の対応が不足する組み合わせは理由を表示します。元ファイルやウェイトは変更しません。')),
    h('div', { class: 'music-dance-source-row' },
      h('label', null, '踊るモデル（GLB/VRM/PMX/FBX）', modelSel), h('label', null, 'ダンス（GLB/VMD/FBX）', motionSel), h('label', null, '曲（WAV/MP3）', audioSel),
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.navigate('08', { query: { import: '1', cat: 'audio' } }) }, '曲を取り込む…')),
    status, sceneNote,
    h('div', { class: 'music-dance-main' }, viewport,
      h('div', { class: 'music-dance-side' },
        h('h3', null, '3Dプレビュー'), threeStatus,
        h('label', { class: 'music-dance-follow' }, follow, '踊るモデルを画面中央で追う'),
        h('label', { class: 'music-dance-follow' }, physicsOn, '衣装・耳・アクセサリーのMMD物理を再生'), physicsStatus,
        h('p', { class: 'section-note' }, 'マウスで回転・ズームできます。GLB/FBXダンスの主要骨を選択モデルへプレビュー中だけ対応付けます。VMDはPMXに適用します。MMD物理はPMXのみです。'))),
    h('section', { class: 'music-dance-editor', 'aria-label': '音楽とダンスのタイムライン' },
      h('div', { class: 'music-dance-transport' }, play, pause, headBack, headNext, headLabel, sourceLabel),
      head,
      h('div', { class: 'music-dance-tracks' },
        h('div', { class: 'music-dance-track' }, h('span', null, '音楽'), audioLane),
        h('div', { class: 'music-dance-track' }, h('span', null, 'ダンス'), motionLane)),
      h('div', { class: 'music-dance-edit-controls' }, selectedLabel,
        h('label', null, '配置開始F', startFrame), blockBack, blockNext,
        h('label', null, '素材の頭出しF', sourceFrame), sourceBack, sourceNext),
      h('div', { class: 'music-dance-save-row' }, save, reload, saveStatus)));
};
