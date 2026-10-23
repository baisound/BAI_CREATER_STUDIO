// @ts-check
// AUDIO-001: a real single-track audition for the existing music/dance placement.
import { FPS, MAX_FRAME, clampFrame, audioSchedule, waveformPeaks } from '../../js/motion/music-dance-clock.js';

const byId = (id) => document.getElementById(id);
const page = byId('bai-audio');
const select = /** @type {HTMLSelectElement} */ (byId('baiAudioSelect'));
const startInput = /** @type {HTMLInputElement} */ (byId('baiAudioStart'));
const sourceInput = /** @type {HTMLInputElement} */ (byId('baiAudioSource'));
const frameInput = /** @type {HTMLInputElement} */ (byId('baiAudioFrame'));
const headInput = /** @type {HTMLInputElement} */ (byId('baiAudioHead'));
const waveHost = byId('baiAudioWaves');
const status = byId('baiAudioStatus');
const timeLabel = byId('baiAudioTime');
const playButton = /** @type {HTMLButtonElement} */ (byId('baiAudioPlay'));
const pauseButton = /** @type {HTMLButtonElement} */ (byId('baiAudioPause'));
const saveButton = /** @type {HTMLButtonElement} */ (byId('baiAudioSave'));

/** @type {Record<string, any>|null} */ let placement = null;
let revision = '', dirty = false, loaded = false, active = false, loadSeq = 0, projectSeq = 0;
let frame = 0, playing = false, anchorFrame = 0, anchorTime = 0, raf = 0;
/** @type {AudioContext|null} */ let context = null;
/** @type {AudioBuffer|null} */ let decoded = null;
/** @type {AudioBufferSourceNode|null} */ let sound = null;
/** @type {number[]} */ let peaks = [];
/** @type {HTMLCanvasElement|null} */ let canvas = null;

function say(message, error = false) {
  status.textContent = message;
  status.dataset.kind = error ? 'error' : 'info';
}
function markDirty() { dirty = true; say('未保存の配置があります。［配置を保存］で確定します。'); }
function endFrame() {
  if (!placement || !decoded) return 0;
  return clampFrame(placement.audio_start_frame +
    Math.max(0, Math.ceil(decoded.duration * FPS) - placement.audio_source_frame));
}
function currentFrame() {
  return playing && context
    ? Math.min(endFrame(), anchorFrame + Math.max(0, context.currentTime - anchorTime) * FPS)
    : frame;
}
function stopSound() {
  if (!sound) return;
  try { sound.stop(); } catch { /* sound already ended */ }
  sound.disconnect(); sound = null;
}
function pause() {
  if (playing) frame = clampFrame(currentFrame());
  playing = false;
  stopSound();
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  draw();
}
function drawWave() {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = '#101b2a'; ctx.fillRect(0, 0, width, height);
  if (!peaks.length) return;
  ctx.fillStyle = '#5aa8df';
  const bar = width / peaks.length;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(2, peaks[i] * (height - 12));
    ctx.fillRect(i * bar, (height - h) / 2, Math.max(1, bar - 1), h);
  }
  const length = Math.max(1, endFrame() - placement.audio_start_frame);
  const ratio = Math.max(0, Math.min(1, (currentFrame() - placement.audio_start_frame) / length));
  ctx.fillStyle = '#ffcb6a'; ctx.fillRect(ratio * width - 1, 0, 2, height);
}
function rebuildPeaks() {
  if (!decoded || !placement) { peaks = []; return; }
  const firstSample = Math.min(decoded.length, Math.floor(placement.audio_source_frame / FPS * decoded.sampleRate));
  peaks = waveformPeaks(decoded.getChannelData(0).subarray(firstSample), 160);
}
function draw() {
  const shown = Math.round(currentFrame());
  frameInput.value = String(shown);
  headInput.max = String(endFrame());
  headInput.value = String(shown);
  headInput.disabled = !decoded;
  timeLabel.textContent = `F ${shown} / ${(shown / FPS).toFixed(2)} 秒`;
  playButton.disabled = playing || !decoded;
  pauseButton.disabled = !playing;
  drawWave();
}
function tick() {
  raf = 0;
  if (!active || !playing) return;
  draw();
  if (currentFrame() >= endFrame()) { pause(); return; }
  raf = requestAnimationFrame(tick);
}
async function play() {
  if (playing) return;
  if (!decoded || !placement) { say('登録したWAV/MP3を選択してください。', true); return; }
  if (!context) context = new AudioContext();
  try { await context.resume(); }
  catch { say('音声を開始できません。ブラウザの音声設定を確認してください。', true); return; }
  if (frame >= endFrame()) frame = 0;
  anchorFrame = frame; anchorTime = context.currentTime + .03;
  const plan = audioSchedule(frame, placement.audio_start_frame,
    placement.audio_source_frame, decoded.duration, anchorTime);
  if (!plan) { say('この位置から再生できる音声がありません。', true); return; }
  const node = context.createBufferSource();
  node.buffer = decoded; node.connect(context.destination);
  node.start(plan.when, plan.offset, plan.duration);
  sound = node; playing = true;
  raf = requestAnimationFrame(tick); draw();
  say('登録音声を実際に再生しています。');
}
function seek(toFrame) {
  const n = Number(toFrame);
  if (!Number.isInteger(n) || n < 0 || n > MAX_FRAME) {
    say('フレームは0〜216000の整数で指定してください。', true); return false;
  }
  const resume = playing;
  if (resume) pause();
  frame = Math.min(n, endFrame());
  if (placement) { placement.head_frame = frame; markDirty(); }
  draw();
  if (resume) void play();
  return true;
}
async function loadAudio() {
  const mine = ++loadSeq;
  pause(); decoded = null; peaks = []; waveHost.innerHTML = '';
  canvas = null; draw();
  const id = placement?.audio_id;
  if (!id) { waveHost.textContent = '登録した音声を選択してください。'; return; }
  say('音声を読み込み、波形を計算しています…');
  try {
    const response = await fetch(`/api/library-assets/file/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`音声の取得に失敗しました（HTTP ${response.status}）`);
    const bytes = await response.arrayBuffer();
    if (!context) context = new AudioContext();
    let buffer;
    try { buffer = await context.decodeAudioData(bytes); }
    catch { throw new Error('このWAV/MP3をデコードできません。ファイルと形式を確認してください。'); }
    if (mine !== loadSeq) return;
    decoded = buffer; rebuildPeaks();
    canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 140;
    canvas.setAttribute('aria-label', '選択した登録音声の実波形');
    canvas.title = 'クリックした位置へ移動';
    waveHost.appendChild(canvas);
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      seek(placement.audio_start_frame + Math.round(ratio * (endFrame() - placement.audio_start_frame)));
    });
    frame = Math.min(frame, endFrame()); draw();
    say('実音声と波形を読み込みました。配置の変更は保存してください。');
  } catch (error) {
    if (mine !== loadSeq) return;
    waveHost.textContent = '音声を表示できません。原本は変更していません。';
    say(error instanceof Error ? error.message : '音声を読み込めません。', true);
  }
}
async function load() {
  const mine = ++projectSeq;
  ++loadSeq; pause(); loaded = true; dirty = false; saveButton.disabled = true;
  say('保存済みの音声配置を読み込み中…');
  try {
    const [projectResponse, assetsResponse] = await Promise.all([
      fetch('/api/music-dance/project', { cache: 'no-store' }),
      fetch('/api/assets', { cache: 'no-store' }),
    ]);
    if (!projectResponse.ok || !assetsResponse.ok) throw new Error('音声配置または素材一覧を取得できません。');
    const projectData = await projectResponse.json();
    const assetsData = await assetsResponse.json();
    if (mine !== projectSeq) return;
    if (!projectData.project || !projectData.revision || !Array.isArray(assetsData.items)) {
      throw new Error('音声配置または素材一覧の形式が正しくありません。');
    }
    placement = projectData.project; revision = projectData.revision;
    const audio = assetsData.items.filter((item) => item.source === 'library' &&
      item.kind === 'audio' && item.available && ['WAV', 'MP3'].includes(item.format));
    select.replaceChildren(new Option('音声を選択', ''),
      ...audio.map((item) => new Option(item.name, item.id)));
    if (placement.audio_id && !audio.some((item) => item.id === placement.audio_id)) {
      select.add(new Option('保存済み音声が見つかりません', placement.audio_id));
      say('保存済み音声が見つかりません。原本と参照を確認してください。', true);
    }
    select.value = placement.audio_id || '';
    startInput.value = String(placement.audio_start_frame);
    sourceInput.value = String(placement.audio_source_frame);
    frame = placement.head_frame;
    saveButton.disabled = false;
    await loadAudio();
  } catch (error) {
    if (mine !== projectSeq) return;
    placement = null; revision = ''; decoded = null; peaks = []; canvas = null;
    waveHost.textContent = '音声配置を読み込めません。既存データは保持しています。';
    say(error instanceof Error ? error.message : '読み込みに失敗しました。', true);
  }
}
async function save() {
  if (!placement || !revision) return;
  pause(); placement.head_frame = frame;
  saveButton.disabled = true; say('配置を保存中…');
  try {
    const payload = JSON.stringify(placement);
    const response = await fetch('/api/music-dance/project', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': revision },
      body: payload,
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error('別画面で配置が変更されました。保存済みを再読込してから編集してください。');
      throw new Error(`配置を保存できません（HTTP ${response.status}）`);
    }
    const data = await response.json();
    revision = data.revision; dirty = JSON.stringify(placement) !== payload;
    say(dirty ? '保存中に追加の変更がありました。もう一度保存してください。'
      : '音声の配置を保存しました。再読込後も復元します。');
  } catch (error) {
    say(error instanceof Error ? error.message : '保存に失敗しました。', true);
  } finally { saveButton.disabled = false; }
}
function updateFrameField(input, field) {
  if (!placement) return;
  const n = Number(input.value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_FRAME) {
    input.value = String(placement[field]);
    say('フレームは0〜216000の整数で指定してください。', true);
    return;
  }
  pause(); placement[field] = n; markDirty(); rebuildPeaks();
  frame = Math.min(frame, endFrame()); draw();
}
select.addEventListener('change', () => {
  if (!placement) return;
  placement.audio_id = select.value || null; markDirty(); void loadAudio();
});
startInput.addEventListener('change', () => updateFrameField(startInput, 'audio_start_frame'));
sourceInput.addEventListener('change', () => updateFrameField(sourceInput, 'audio_source_frame'));
playButton.addEventListener('click', () => { void play(); });
pauseButton.addEventListener('click', pause);
byId('baiAudioStop').addEventListener('click', () => { pause(); seek(0); });
byId('baiAudioBack').addEventListener('click', () => seek(Math.max(0, Math.round(currentFrame()) - 1)));
byId('baiAudioForward').addEventListener('click', () => seek(Math.round(currentFrame()) + 1));
byId('baiAudioRewind').addEventListener('click', () => seek(Math.max(0, Math.round(currentFrame()) - FPS)));
byId('baiAudioFastForward').addEventListener('click', () => seek(Math.round(currentFrame()) + FPS));
byId('baiAudioSeek').addEventListener('click', () => { seek(frameInput.value); });
headInput.addEventListener('input', () => { seek(Number(headInput.value)); });
byId('baiAudioSave').addEventListener('click', () => { void save(); });
byId('baiAudioReload').addEventListener('click', () => { void load(); });
byId('baiAudioToDance').addEventListener('click', () => {
  if (dirty) { say('配置を保存してから実動作プレビューを開いてください。', true); return; }
  window.baiGo?.('live-motion');
  say('音楽・ダンス画面で保存済み配置を再読込すると、この変更を反映できます。');
});
const observer = new MutationObserver(() => {
  const isActive = page.classList.contains('active');
  if (isActive && !active) {
    active = true;
    if (!loaded || !dirty) void load();
  } else if (!isActive && active) {
    active = false;
    pause();
  }
});
observer.observe(page, { attributes: true, attributeFilter: ['class'] });
