// @ts-check
// SCR-08 の登録済み素材見本。元ファイル・制作状態は変更しない。
import { h } from '../ui.js';
import { loadLibs, loadModel, loadErrorText, disposeObject } from '../viewport/model-loader.js';
import { createViewport } from '../viewport/three-host.js';

/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
const MAX_WAVEFORM_BYTES = 32 * 1024 * 1024;
// 巨大GLBを一覧や詳細表示だけで自動解析すると、複数のWebGL読み込みが重なる。
const MAX_AUTO_GLB_BYTES = 128 * 1024 * 1024;
/** @type {Map<string, Promise<string|null>>} */
const pending = new Map();
let renderQueue = Promise.resolve();

/** @param {AssetItem} item */
export const libraryFileUrl = (item) => `/api/library-assets/file/${encodeURIComponent(item.id)}`;

/** @param {AssetItem} item @param {HTMLCanvasElement} canvas */
async function saveThumbnail(item, canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob || blob.size > 2 * 1024 * 1024) return null;
  const response = await fetch(`/api/library-assets/thumbnail?id=${encodeURIComponent(item.id)}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  if (!response.ok) return null;
  return `/api/library-assets/thumbnail/${encodeURIComponent(item.id)}`;
}

/** @param {AssetItem} item */
async function waveform(item) {
  if (Number(item.bytes || 0) > MAX_WAVEFORM_BYTES) return null;
  const response = await fetch(libraryFileUrl(item));
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_WAVEFORM_BYTES) return null;
  const AudioContextClass = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    const audio = await context.decodeAudioData(bytes);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 240;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#172638'; g.fillRect(0, 0, 640, 240);
    g.strokeStyle = '#9ad9ed'; g.lineWidth = 2;
    const channel = audio.getChannelData(0);
    for (let x = 0; x < 640; x++) {
      const lo = Math.floor(x * channel.length / 640);
      const hi = Math.max(lo + 1, Math.floor((x + 1) * channel.length / 640));
      let min = 0, max = 0;
      for (let i = lo; i < hi; i++) { min = Math.min(min, channel[i]); max = Math.max(max, channel[i]); }
      g.beginPath(); g.moveTo(x, 120 - max * 104); g.lineTo(x, 120 - min * 104); g.stroke();
    }
    return await saveThumbnail(item, canvas);
  } finally { await context.close(); }
}

/** @param {AssetItem} item */
async function videoFrame(item) {
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.src = libraryFileUrl(item);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('動画の読込がタイムアウトしました')), 15000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(undefined); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('動画を再生できません')); };
    });
    if (Number.isFinite(video.duration) && video.duration > 1) {
      video.currentTime = Math.min(1, video.duration * 0.1);
      await new Promise((resolve) => { video.onseeked = () => resolve(undefined); setTimeout(resolve, 3000); });
    }
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = Math.max(32, Math.min(640, Math.round(640 * video.videoHeight / Math.max(1, video.videoWidth))));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await saveThumbnail(item, canvas);
  } finally { video.removeAttribute('src'); video.load(); }
}

/** @param {AssetItem} item */
async function glbFrame(item) {
  /** @type {any} */ let renderer = null;
  /** @type {any} */ let object = null;
  try {
    const libs = await loadLibs();
    const loaded = await loadModel(item, libs);
    object = loaded.object;
    const { THREE } = libs;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(640, 480);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x162235);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 6, 4); scene.add(light);
    scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
    const camera = new THREE.PerspectiveCamera(40, 640 / 480, 0.01, Math.max(500, radius * 40));
    camera.position.copy(center).add(new THREE.Vector3(0.45, 0.3, 1).normalize().multiplyScalar(radius / Math.sin(Math.PI / 9) * 1.1));
    camera.lookAt(center);
    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    canvas.getContext('2d')?.drawImage(renderer.domElement, 0, 0);
    return await saveThumbnail(item, canvas);
  } finally { if (object) disposeObject(object); renderer?.dispose(); renderer?.forceContextLoss(); }
}

/** 一覧から見える素材だけを処理し、生成したPNGを保存する。 @param {AssetItem} item */
export function libraryThumbnail(item) {
  if (item.thumbnailUrl) return Promise.resolve(item.thumbnailUrl);
  if (!item.available) return Promise.resolve(null);
  if (item.format === 'GLB' && Number(item.bytes || 0) > MAX_AUTO_GLB_BYTES) return Promise.resolve(null);
  if (['image', 'material'].includes(item.kind) || (item.kind === 'fx' && item.format !== 'GLB')) return Promise.resolve(libraryFileUrl(item));
  let promise = pending.get(item.id);
  if (!promise) {
    promise = renderQueue.then(() => item.format === 'GLB' ? glbFrame(item) : item.kind === 'audio' ? waveform(item) : item.kind === 'video' ? videoFrame(item) : null).catch(() => null);
    renderQueue = promise.then(() => undefined);
    pending.set(item.id, promise);
  }
  return promise;
}

/** @param {HTMLMediaElement} media @param {HTMLElement} root */
function mediaControls(media, root) {
  const play = h('button', { type: 'button', class: 'btn', dataset: { role: 'media-play' }, onclick: () => { void media.play().catch(() => {}); } }, '▶ 再生');
  const pause = h('button', { type: 'button', class: 'btn', dataset: { role: 'media-pause' }, onclick: () => media.pause() }, '❚❚ 一時停止');
  const stop = h('button', { type: 'button', class: 'btn', dataset: { role: 'media-stop' }, onclick: () => { media.pause(); media.currentTime = 0; } }, '■ 停止');
  const back = h('button', { type: 'button', class: 'btn', dataset: { role: 'media-back' }, onclick: () => { media.currentTime = Math.max(0, media.currentTime - 5); } }, '−5秒');
  const forward = h('button', { type: 'button', class: 'btn', dataset: { role: 'media-forward' }, onclick: () => { media.currentTime = Math.min(Number.isFinite(media.duration) ? media.duration : Infinity, media.currentTime + 5); } }, '+5秒');
  const seek = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', 'aria-label': '再生位置', dataset: { role: 'media-seek' } }));
  const time = h('span', { class: 'mono xs', dataset: { role: 'media-time' } }, '0.0 / 0.0 秒');
  const update = () => {
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    seek.max = String(duration || 1); seek.value = String(Math.min(media.currentTime || 0, duration || 1));
    time.textContent = `${(media.currentTime || 0).toFixed(1)} / ${duration.toFixed(1)} 秒`;
  };
  seek.oninput = () => { media.currentTime = Number(seek.value); };
  media.addEventListener('loadedmetadata', update); media.addEventListener('timeupdate', update); media.addEventListener('durationchange', update);
  root.append(h('div', { class: 'asset-media-controls' }, play, pause, stop, back, forward, seek, time));
  return () => { media.pause(); media.removeAttribute('src'); media.load(); };
}

/** 詳細欄に実ファイルの見本を置く。 @param {HTMLElement} root @param {AssetItem} item */
export function mountLibraryPreview(root, item) {
  const url = libraryFileUrl(item);
  let alive = true;
  /** @type {(() => void)|null} */ let cleanup = null;
  const status = h('p', { class: 'section-note', role: 'status', dataset: { role: 'library-preview-status' } }, '見本を読み込み中…');
  const showError = (error) => { if (alive) status.textContent = `見本を表示できません：${loadErrorText(error)}`; };
  if (item.format === 'GLB') {
    const stage = h('div', { class: 'asset-motion-stage viewport vp3d', dataset: { role: 'library-3d' } });
    root.append(stage, status);
    const heavy = Number(item.bytes || 0) > MAX_AUTO_GLB_BYTES;
    const open = async () => {
      stage.hidden = false;
      status.textContent = '3Dを読み込み中…';
      const libs = await loadLibs();
      const loaded = await loadModel(item, libs);
      if (!alive) { disposeObject(loaded.object); return; }
      const host = createViewport(stage, libs);
      host.setObject(loaded.object); host.fit();
      cleanup = () => host.dispose();
      status.textContent = 'ドラッグで回転、ホイールで拡大できます。';
      if (!heavy) void libraryThumbnail(item);
    };
    if (heavy) {
      stage.hidden = true;
      status.textContent = '大型GLBです。3D表示には多くのメモリを使います。';
      root.append(h('button', { class: 'btn', type: 'button', dataset: { role: 'large-glb-open' },
        onclick: (/** @type {MouseEvent} */ event) => {
          const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
          button.disabled = true;
          void open().catch((error) => { showError(error); button.disabled = false; });
        } }, '3D見本を開く'));
    } else void open().catch(showError);
  } else if (item.kind === 'audio') {
    const img = /** @type {HTMLImageElement} */ (h('img', { alt: `${item.name}の波形`, dataset: { role: 'audio-waveform' } }));
    const media = /** @type {HTMLAudioElement} */ (h('audio', { preload: 'metadata', src: url, dataset: { role: 'audio-media' } }));
    root.append(img, media, status);
    cleanup = mediaControls(media, root);
    void libraryThumbnail(item).then((thumb) => { if (!alive) return; if (thumb) { img.src = thumb; status.textContent = '波形を表示しています。'; } else status.textContent = '音声を再生できます。大きいファイルや非対応の形式では波形を作れません。'; });
  } else if (item.kind === 'video') {
    const media = /** @type {HTMLVideoElement} */ (h('video', { preload: 'metadata', playsinline: true, src: url, poster: item.thumbnailUrl || '', dataset: { role: 'video-media' } }));
    root.append(media, status);
    cleanup = mediaControls(media, root);
    void libraryThumbnail(item).then((thumb) => { if (!alive) return; if (thumb) { media.poster = thumb; status.textContent = '動画の見本を表示しています。'; } else status.textContent = 'このブラウザーで再生できるコーデックなら再生できます。'; });
  } else {
    const img = h('img', { src: url, alt: `${item.name}の画像`, dataset: { role: 'image-media' }, onload: () => { status.textContent = '登録した画像を表示しています。'; }, onerror: () => { status.textContent = '画像を表示できません。'; } });
    root.append(img, status);
  }
  return { dispose() { alive = false; cleanup?.(); } };
}
