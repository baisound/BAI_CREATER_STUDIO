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
    startFrame: 0, startTime: 0, raf: 0, issues: [], sceneOverlay: false,
    audioMuted: [], mutedLanes: [], layoutRevision: -1, audioSettingsReady: false, mixerRevision: -1, mixed: false };
  const audioTracks = new Set(['audio', 'music', 'video']);
  const savedTracks = new Set(['audio','camera','effect','expression','image','light','lip','model','motion','music','video']);
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
  const activeAt = (clip, seconds) => seconds >= clip.start && seconds < Math.round((clip.start + clip.duration)*10000)/10000;
  const pauseElement = element => { try { element.pause(); } catch (_) { /* detached */ } };
  function visibleIssues(){
    const handled=new Set((window.BAIStudioMultiScenePreview?.status?.().timelineModels||[]).filter(row=>row.status==='ready'&&row.loaded).map(row=>row.clip_id));
    return state.issues.filter(issue=>!state.clips.some(c=>handled.has(c.id)&&issue===`${c.name}: ${c.category}はこのプレビューに未接続`));
  }
  function refreshStage() {
    stage.hidden = !state.clips.length && !state.sceneOverlay;
    if (state.sceneOverlay) $('v68stageNote').hidden = true;
    const sceneLoaded = state.sceneOverlay && window.BAIStudioMultiScenePreview?.status?.().loaded > 0;
    const playable = state.entries.filter(entry => !entry.failed).length;
    $('v68play').disabled = state.playing || !state.ready || !state.audioSettingsReady || (!playable && !sceneLoaded);
    const issues=visibleIssues();
    if (state.ready) message(`${playable}件の画像・動画・音声を同じ作品でプレビュー。${issues.length ? `未接続 ${issues.length}件: ${issues.slice(0, 2).join(' / ')}` : state.sceneOverlay ? '3Dを同じ画面に重ねて表示。限定MP4は出力画面で条件を確認。' : '動画内音声も動画とともに再生。限定MP4は出力画面に接続。'}`);
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
      if (kind !== 'image') element.muted = entry.mixed ? false : state.mixed || state.audioMuted.includes(clip.track)||state.mutedLanes.includes(clip.track+':'+(clip.lane||1));
      if (entry.failed) { element.hidden = true; pauseElement(element); continue; }
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
    refreshStage();
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
      refreshStage();
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
    if (!state.ready || !state.audioSettingsReady || (!state.entries.some(entry => !entry.failed) && !(scene?.opened && scene.loaded > 0))) return;
    window.dispatchEvent(new CustomEvent('bai:v05-audio-focus',{detail:{owner:'timeline'}}));
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
    const keepSeconds=detail.keepHead&&state.projectId===projectId?state.frame/state.fps:null;
    release();
    delete $('v68frame').dataset.dirty;
    state.projectId = projectId;
    state.ready = false;
    state.layoutRevision = -1;
    state.audioMuted = [];
    state.audioSettingsReady = false;
    state.clips = Array.isArray(detail.clips) ? detail.clips : [];
    state.issues = [];
    stage.hidden = false;
    message('作品の登録素材と保存済み時刻を読み込み中…');
    try {
      const encoded = encodeURIComponent(projectId);
      const [assetsResponse, rangeResponse, headResponse, layoutResponse] = await Promise.all([
        fetch('/api/assets', { cache: 'no-store' }),
        fetch(`/api/studio/v05/timeline/range?id=${encoded}`, { cache: 'no-store' }),
        fetch(`/api/studio/v05/playhead?id=${encoded}`, { cache: 'no-store' }),
        fetch(`/api/studio/v05/timeline/layout?id=${encoded}`, { cache: 'no-store' }),
      ]);
      if (![assetsResponse, rangeResponse, headResponse, layoutResponse].every(response => response.ok)) throw Error('素材・範囲・再生位置・音声ミュート設定を取得できません');
      const [inventory, range, head, layout] = await Promise.all([assetsResponse.json(), rangeResponse.json(), headResponse.json(), layoutResponse.json()]);
      if (generation !== state.generation) return;
      const mixResponse = await fetch('/api/studio/v05/audio/prepare', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId})});
      const mix = await mixResponse.json();
      if (!mixResponse.ok) throw Error(mix.error || 'ミキサーの音声処理を完了できません');
      if (generation !== state.generation) return;
      state.mixed = mix.enabled;
      state.mixerRevision = mix.revision;
      applyAudioLayout(layout);
      if (!Array.isArray(inventory.items) || !Number.isFinite(range.fps) || range.fps <= 0 ||
          !Number.isInteger(range.final_frame) || range.final_frame < 0) throw Error(range.error || '保存済み作品の情報が不正です');
      state.fps = range.fps;
      // Render In/Out markers belong to export. Preview traverses the full saved arrangement.
      state.inFrame = 0;
      state.outFrame = range.final_frame;
      $('v68frame').max = String(state.outFrame);
      const byId = new Map(inventory.items.map(item => [item.id, item]));
      for (const clip of state.clips) {
        if (!supported.has(clip.category)) { state.issues.push(`${clip.name}: ${clip.category}はこのプレビューに未接続`); continue; }
        const asset = byId.get(clip.asset_id);
        const url = sourceUrl(asset);
        if (!url) { state.issues.push(`${clip.name}: 元メディアを読み込めません`); continue; }
        const kind = clip.category === 'music' ? 'audio' : clip.category;
        const element = document.createElement(kind === 'image' ? 'img' : kind === 'video' ? 'video' : 'audio');
        const entry = { clip, kind, element, failed: false };
        const fail = reason => {
          if (generation !== state.generation || entry.failed) return;
          entry.failed = true;
          state.issues.push(`${clip.name}: ${reason}`);
          if (kind !== 'image') pauseElement(element);
          setFrame(state.frame, state.playing);
          refreshStage();
        };
        element.src = url;
        element.preload = kind === 'image' ? 'auto' : 'metadata';
        if (kind === 'video') { element.playsInline = true; }
        if (kind !== 'audio') { element.hidden = true; element.className = 'v68visual'; layers.append(element); }
        else { element.hidden = true; layers.append(element); }
        if (kind === 'image') element.addEventListener('load', () => { if (generation === state.generation) setFrame(state.frame, state.playing); });
        if (kind === 'video') element.addEventListener('loadeddata', () => {
          if (generation !== state.generation) return;
          // A browser can decode only the audio stream of an OGV and still
          // report HAVE_CURRENT_DATA. Do not claim an empty video is playable.
          if (!element.videoWidth || !element.videoHeight) fail('動画の映像を再生できません。このブラウザーが対応する形式へ変換してください');
          else setFrame(state.frame, state.playing);
        });
        if (kind === 'video') for (const event of ['seeked', 'canplay']) element.addEventListener(event, () => {
          // A saved playhead event can run while a seek temporarily lowers
          // readyState. Recompute the overlay once the sought frame is ready.
          if (generation === state.generation) setFrame(state.frame, state.playing);
        });
        element.onerror = () => fail(kind === 'image' ? '画像を表示できません' : 'メディアを再生できません。このブラウザーが対応する形式へ変換してください');
        state.entries.push(entry);
      }
      state.entries.sort((a, b) => (a.clip.lane || 1) - (b.clip.lane || 1) || a.clip.start - b.clip.start || a.clip.id.localeCompare(b.clip.id));
      if (mix.enabled) {
        const element=document.createElement('audio');element.src=mix.url;element.preload='auto';element.hidden=true;element.dataset.mixerAudio=mix.id;layers.append(element);
        const clip={id:'processed-mix',start:0,duration:mix.duration,source_start:0,track:'master'};
        const entry={clip,kind:'audio',element,failed:false,mixed:true};
        element.onerror=()=>{entry.failed=true;state.audioSettingsReady=false;pause();refreshStage();message('処理済み音声を再生できません。保存済み作品を再読込してください');};
        state.entries.push(entry);
      }
      for (const entry of state.entries) if (entry.kind !== 'audio') layers.append(entry.element);
      state.ready = true;
      refreshStage();
      state.frame = clamp(Math.round(Number(keepSeconds??head.seconds??0) * state.fps));
      setFrame(state.frame);
      refreshStage();
    } catch (error) {
      if (generation !== state.generation) return;
      stage.hidden = false;
      state.ready = false;
      message(`プレビューを読み込めません: ${error.message}`);
    }
  }

  function applyAudioLayout(layout) {
    if (layout?.project_id !== state.projectId) return false;
    if (!Number.isInteger(layout.revision) || layout.revision < 0 ||
        (layout.muted !== undefined && (!Array.isArray(layout.muted) || layout.muted.some(t => typeof t !== 'string' || !savedTracks.has(t)) || new Set(layout.muted).size !== layout.muted.length))) {
      throw Error('保存済みの音声ミュート設定が不正です');
    }
    if (layout.revision < state.layoutRevision) return false;
    const changed = layout.revision > state.layoutRevision || !state.audioSettingsReady;
    state.layoutRevision = layout.revision;
    state.audioMuted = (layout.muted || []).filter(t => audioTracks.has(t));
    if(layout.muted_lanes!==undefined&&(!Array.isArray(layout.muted_lanes)||layout.muted_lanes.some(key=>typeof key!=='string'||!/^(audio|music|video):[1-9][0-9]*$/.test(key))))throw Error('行ミュート設定が不正です');
    state.mutedLanes=layout.muted_lanes||[];
    state.audioSettingsReady = true;
    for (const entry of state.entries) if (entry.kind !== 'image') entry.element.muted = entry.mixed ? false : state.mixed || state.audioMuted.includes(entry.clip.track)||state.mutedLanes.includes(entry.clip.track+':'+(entry.clip.lane||1));
    refreshStage();
    return changed;
  }
  window.addEventListener('bai:v05-track-layout-changed', event => {
    try { if(applyAudioLayout(event.detail)&&state.mixed&&state.ready)void configure({projectId:state.projectId,clips:state.clips,keepHead:true}); } catch (error) { state.audioSettingsReady = false; pause(); refreshStage(); message(error.message); }
  });
  window.addEventListener('bai:v05-mixer-saved',event=>{if(event.detail.project_id===state.projectId)void configure({projectId:state.projectId,clips:state.clips,keepHead:true});});
  let layoutPolling = false;
  async function pollAudioLayout() {
    if (layoutPolling || document.hidden || !state.ready || !state.projectId) return;
    const projectId = state.projectId, generation = state.generation;
    layoutPolling = true;
    try {
      const [response,mixerResponse] = await Promise.all([fetch(`/api/studio/v05/timeline/layout?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),fetch('/api/studio/v05/audio/settings?project_id='+encodeURIComponent(projectId),{cache:'no-store'})]);
      if (!response.ok) throw Error('音声ミュート設定を再確認できません');
      const layout = await response.json();
      if(!mixerResponse.ok)throw Error('保存済みミキサーを再確認できません');
      const mixer=await mixerResponse.json();
      if(generation===state.generation&&mixer.revision!==state.mixerRevision){void configure({projectId:state.projectId,clips:state.clips,keepHead:true});return;}
      if (generation === state.generation && projectId === state.projectId && applyAudioLayout(layout)) {
        if(state.mixed){void configure({projectId:state.projectId,clips:state.clips,keepHead:true});return;}
        window.dispatchEvent(new CustomEvent('bai:v05-track-layout-changed', { detail: layout }));
      }
    } catch (error) {
      if (generation === state.generation) { state.audioSettingsReady = false; pause(); refreshStage(); message(error.message); }
    } finally { layoutPolling = false; }
  }
  const layoutTimer = setInterval(() => { void pollAudioLayout(); }, 2000);

  $('v68play').addEventListener('click', play);
  window.addEventListener('bai:v05-audio-focus',e=>{if(e.detail.owner!=='timeline')pause();});
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
  window.addEventListener('pagehide', () => { clearInterval(layoutTimer); ++state.generation; pause(); release(); }, { once: true });
  window.BAIStudioMediaPreviewV68 = Object.freeze({
    play, pause: () => pause(true), stop, seek,
    refresh:()=>configure({projectId:state.projectId,clips:state.clips,keepHead:true}),
    sceneOverlay(active) { state.sceneOverlay = Boolean(active); refreshStage(); setFrame(state.frame); },
    status: () => ({ projectId: state.projectId, frame: state.frame, fps: state.fps,
      ready: state.ready, playing: state.playing, mediaCount: state.entries.length,
      sceneOverlay: state.sceneOverlay, issues: visibleIssues(),
      mutedAudioTracks: [...state.audioMuted], audioLayoutRevision: state.layoutRevision,
      audioSettingsReady: state.audioSettingsReady }),
  });
})();
