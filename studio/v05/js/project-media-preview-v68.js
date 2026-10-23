/* Saved v0.5 arrangement preview for browser-native image, video and audio files. */
(() => {
  'use strict';
  const viewport = document.querySelector('#viewport');
  const editor = document.querySelector('.center');
  if (!viewport || !editor) return;

  const stage = document.createElement('div');
  stage.id = 'v68stage';
  stage.hidden = true;
  stage.innerHTML = '<div id="v68layers"></div><div id="v68stageNote">保存済み作品のメディアを読み込み中…</div>';
  viewport.append(stage);
  const transport = document.createElement('div');
  transport.id = 'v68transport';
  transport.innerHTML = '<strong>保存済み作品の実メディア</strong><button id="v68back" type="button">−1F</button><button id="v68play" type="button">▶ 再生</button><button id="v68pause" type="button" disabled>❚❚ 一時停止</button><button id="v68stop" type="button">■ 停止</button><button id="v68forward" type="button">＋1F</button><label for="v68frame">フレーム</label><input id="v68frame" type="number" min="0" step="1" value="0"><button id="v68seek" type="button">移動</button><span id="v68time">F 0</span><span id="v68status" role="status">作品を読み込み中…</span>';
  viewport.after(transport);
  const $ = id => document.getElementById(id);
  const layers = $('v68layers');
  const supported = new Set(['image', 'video', 'audio', 'music']);
  const state = { projectId: '', clips: [], entries: [], fps: 60, inFrame: 0,
    outFrame: 0, frame: 0, ready: false, playing: false, generation: 0,
    startFrame: 0, startTime: 0, raf: 0, issues: [], sceneOverlay: false };
  const message = text => { $('v68status').textContent = text; };
  const sourceUrl = asset => {
    if (!asset?.available || typeof asset.id !== 'string') return null;
    const id = encodeURIComponent(asset.id);
    if (asset.source === 'library') return `/api/library-assets/file/${id}`;
    if (asset.source === 'v05source') return `/api/studio/v05/asset-source/file/${id}`;
    if (asset.source === 'integrated' && asset.filename) return `/api/integrated-v02/asset/${encodeURIComponent(asset.filename)}`;
    return null;
  };
  const clamp = frame => Math.max(0, Math.min(state.outFrame, Math.round(Number(frame) || 0)));
  const activeAt = (clip, seconds) => seconds >= clip.start && seconds < clip.start + clip.duration;
  const pauseElement = element => { try { element.pause(); } catch (_) { /* detached */ } };
  function refreshStage() {
    stage.hidden = !state.clips.length && !state.sceneOverlay;
    if (state.sceneOverlay) $('v68stageNote').hidden = true;
    const sceneLoaded = state.sceneOverlay && window.BAIStudioMultiScenePreview?.status?.().loaded > 0;
    $('v68play').disabled = !state.ready || (!state.entries.length && !sceneLoaded);
    if (state.ready) message(`${state.entries.length}件の画像・動画・音声を同じ作品でプレビュー。${state.issues.length ? `未接続 ${state.issues.length}件: ${state.issues.slice(0, 2).join(' / ')}` : state.sceneOverlay ? '3Dを同じ画面に重ねて表示。3D入りMP4は未接続。' : '3Dは別画面、動画内音声は未接続。限定MP4は出力画面に接続。'}`);
  }
  function release() {
    cancelAnimationFrame(state.raf);
    state.playing = false;
    for (const entry of state.entries) if (entry.kind !== 'image') {
      pauseElement(entry.element);
      entry.element.removeAttribute('src');
      entry.element.load();
    }
    state.entries = [];
    layers.replaceChildren();
    $('v68play').disabled = true;
    $('v68pause').disabled = true;
  }
  function setFrame(frame, playback = false) {
    state.frame = clamp(frame);
    const seconds = state.frame / state.fps;
    const frameInput = $('v68frame');
    if (document.activeElement !== frameInput && frameInput.dataset.dirty !== 'true') frameInput.value = String(state.frame);
    $('v68time').textContent = `F ${state.frame} / ${seconds.toFixed(2)} 秒 (${state.fps} fps)`;
    let visible = 0, sounding = 0, sourceEnded = 0;
    for (const entry of state.entries) {
      const { clip, element, kind } = entry;
      const active = activeAt(clip, seconds);
      if (kind === 'image') { element.hidden = !active; if (active && element.complete && element.naturalWidth > 0) visible++; continue; }
      if (!active) { if (kind === 'video') element.hidden = true; pauseElement(element); continue; }
      const target = Math.max(0, (clip.source_start || 0) + seconds - clip.start);
      if (Number.isFinite(element.duration) && target >= element.duration) {
        sourceEnded++;
        if (kind === 'video') element.hidden = true;
        pauseElement(element);
        continue;
      }
      if (kind === 'video') { element.hidden = false; if (element.readyState >= 2) visible++; }
      if (kind === 'audio') sounding++;
      if (element.readyState >= 1 && Math.abs(element.currentTime - target) > (playback ? 0.1 : 1 / state.fps)) {
        try { element.currentTime = target; } catch (_) { /* metadata pending */ }
      }
      if (playback && element.paused) {
        element.play().catch(error => { if (state.projectId) message(`再生できません: ${error.message}`); });
      } else if (!playback) pauseElement(element);
    }
    $('v68stageNote').hidden = Boolean(visible) || state.sceneOverlay;
    if (!visible) $('v68stageNote').textContent = sourceEnded ? '元メディアの終端を超えています。クリップの長さを確認してください。' : sounding ? 'この位置は音声のみです。' : 'この位置に対応する画像・動画はありません。';
    if (state.ready) window.dispatchEvent(new CustomEvent('bai:v05-media-frame', {
      detail: { projectId: state.projectId, frame: state.frame, seconds, fps: state.fps, playing: state.playing },
    }));
  }
  function pause(commit = false) {
    if (!state.playing) return;
    const elapsed = (performance.now() - state.startTime) / 1000;
    const current = Math.min(state.outFrame, state.startFrame + Math.floor(elapsed * state.fps));
    cancelAnimationFrame(state.raf);
    state.playing = false;
    $('v68play').disabled = !state.ready;
    $('v68pause').disabled = true;
    setFrame(current);
    if (commit) void saveHead();
  }
  async function saveHead() {
    const id = state.projectId;
    if (!id || !state.ready) return;
    const saved = await window.BAIStudioV05Arrangement?.commitPreviewPlayhead(id, state.frame / state.fps);
    if (saved === false && id === state.projectId) message('再生位置を保存できません。タイムラインを再読込してください。');
  }
  function tick() {
    if (!state.playing) return;
    const frame = state.startFrame + Math.floor((performance.now() - state.startTime) * state.fps / 1000);
    if (frame >= state.outFrame) {
      state.playing = false;
      $('v68play').disabled = !state.ready;
      $('v68pause').disabled = true;
      setFrame(state.outFrame);
      void saveHead();
      return;
    }
    setFrame(frame, true);
    state.raf = requestAnimationFrame(tick);
  }
  async function seek(frame) {
    pause();
    delete $('v68frame').dataset.dirty;
    setFrame(frame);
    $('v68frame').value = String(state.frame);
    await saveHead();
  }
  function play() {
    const scene = window.BAIStudioMultiScenePreview?.status?.();
    if (!state.ready || (!state.entries.length && !(scene?.opened && scene.loaded > 0))) return;
    delete $('v68frame').dataset.dirty;
    if (state.frame >= state.outFrame) setFrame(state.inFrame);
    state.startFrame = state.frame;
    state.startTime = performance.now();
    state.playing = true;
    $('v68play').disabled = true;
    $('v68pause').disabled = false;
    setFrame(state.frame, true);
    state.raf = requestAnimationFrame(tick);
  }
  async function stop() { pause(); await seek(state.inFrame); }
  async function configure(detail) {
    const projectId = detail?.projectId;
    if (typeof projectId !== 'string' || !projectId) return;
    const generation = ++state.generation;
    pause();
    release();
    delete $('v68frame').dataset.dirty;
    state.projectId = projectId;
    state.ready = false;
    state.clips = Array.isArray(detail.clips) ? detail.clips : [];
    state.issues = [];
    stage.hidden = false;
    message('作品の登録素材と保存済み時刻を読み込み中…');
    try {
      const encoded = encodeURIComponent(projectId);
      const [assetsResponse, rangeResponse, headResponse] = await Promise.all([
        fetch('/api/assets', { cache: 'no-store' }),
        fetch(`/api/studio/v05/timeline/range?id=${encoded}`, { cache: 'no-store' }),
        fetch(`/api/studio/v05/playhead?id=${encoded}`, { cache: 'no-store' }),
      ]);
      if (![assetsResponse, rangeResponse, headResponse].every(response => response.ok)) throw Error('素材・範囲・再生位置を取得できません');
      const [inventory, range, head] = await Promise.all([assetsResponse.json(), rangeResponse.json(), headResponse.json()]);
      if (generation !== state.generation) return;
      if (!Array.isArray(inventory.items) || !range.valid || !Number.isFinite(range.fps) || range.fps <= 0) throw Error(range.error || '保存済み作品の情報が不正です');
      state.fps = range.fps;
      state.inFrame = range.effective_in_frame;
      state.outFrame = range.effective_out_frame;
      $('v68frame').max = String(state.outFrame);
      const byId = new Map(inventory.items.map(item => [item.id, item]));
      for (const clip of state.clips) {
        if (!supported.has(clip.category)) { state.issues.push(`${clip.name}: ${clip.category}はこのプレビューに未接続`); continue; }
        const asset = byId.get(clip.asset_id);
        const url = sourceUrl(asset);
        if (!url) { state.issues.push(`${clip.name}: 元メディアを読み込めません`); continue; }
        const kind = clip.category === 'music' ? 'audio' : clip.category;
        const element = document.createElement(kind === 'image' ? 'img' : kind === 'video' ? 'video' : 'audio');
        element.src = url;
        element.preload = kind === 'image' ? 'auto' : 'metadata';
        if (kind === 'video') { element.muted = true; element.playsInline = true; }
        if (kind !== 'audio') { element.hidden = true; element.className = 'v68visual'; layers.append(element); }
        else { element.hidden = true; layers.append(element); }
        if (kind === 'image') element.addEventListener('load', () => { if (generation === state.generation) setFrame(state.frame, state.playing); });
        if (kind === 'video') element.addEventListener('loadeddata', () => { if (generation === state.generation) setFrame(state.frame, state.playing); });
        if (kind === 'image') element.onerror = () => message(`${clip.name}の画像を表示できません`);
        else element.onerror = () => message(`${clip.name}のメディアを再生できません`);
        state.entries.push({ clip, kind, element });
      }
      state.entries.sort((a, b) => (a.clip.lane || 1) - (b.clip.lane || 1) || a.clip.start - b.clip.start || a.clip.id.localeCompare(b.clip.id));
      for (const entry of state.entries) if (entry.kind !== 'audio') layers.append(entry.element);
      state.ready = true;
      refreshStage();
      state.frame = clamp(Math.round(Number(head.seconds || 0) * state.fps));
      setFrame(state.frame);
      refreshStage();
    } catch (error) {
      if (generation !== state.generation) return;
      stage.hidden = false;
      state.ready = false;
      message(`プレビューを読み込めません: ${error.message}`);
    }
  }

  $('v68play').addEventListener('click', play);
  $('v68pause').addEventListener('click', () => pause(true));
  $('v68stop').addEventListener('click', () => { void stop(); });
  $('v68back').addEventListener('click', () => { void seek(state.frame - 1); });
  $('v68forward').addEventListener('click', () => { void seek(state.frame + 1); });
  $('v68seek').addEventListener('click', () => { void seek($('v68frame').value); });
  $('v68frame').addEventListener('keydown', event => { if (event.key === 'Enter') void seek($('v68frame').value); });
  $('v68frame').addEventListener('input', () => { $('v68frame').dataset.dirty = 'true'; });
  window.addEventListener('bai:v05-arrangement-loaded', event => { void configure(event.detail); });
  window.addEventListener('load', async () => {
    if (state.projectId) return;
    const id = document.querySelector('#v06project')?.value;
    if (!id) return;
    try {
      const response = await fetch(`/api/studio/v05/arrangement?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (response.ok && !state.projectId) void configure(await response.json().then(data => ({ projectId: id, clips: data.clips })));
    } catch (_) { /* the regular arrangement event reports read errors */ }
  }, { once: true });
  window.addEventListener('bai:v05-playhead-changed', event => {
    if (event.detail?.projectId === state.projectId && state.ready && !state.playing) setFrame(Math.round(event.detail.seconds * state.fps));
  });
  window.addEventListener('pagehide', () => { ++state.generation; pause(); release(); }, { once: true });
  window.BAIStudioMediaPreviewV68 = Object.freeze({
    play, pause: () => pause(true), stop, seek,
    sceneOverlay(active) { state.sceneOverlay = Boolean(active); refreshStage(); setFrame(state.frame); },
    status: () => ({ projectId: state.projectId, frame: state.frame, fps: state.fps,
      ready: state.ready, playing: state.playing, mediaCount: state.entries.length,
      sceneOverlay: state.sceneOverlay, issues: [...state.issues] }),
  });
})();
