// @ts-check
// SCR-08 character front views. Rendering and PNG cache never modify source models or weights.
import { assets } from '../store.js';
import { loadLibs, loadModel, disposeObject } from '../viewport/model-loader.js';
import { normalizeModel } from '../viewport/normalize.fork.js';
import { categoryOf } from './assets-model.js';

/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
/** @type {Map<string, Promise<string|null>>} */
const pending = new Map();
let queue = Promise.resolve();
/** @type {Set<string>} */
const backfillQueued = new Set();

/** @param {AssetItem} item */
async function renderAndSave(item) {
  const libs = await loadLibs();
  /** @type {any} */ let object = null;
  /** @type {any} */ let renderer = null;
  try {
    const loaded = await loadModel(item, libs);
    object = loaded.object;
    const { THREE } = libs;
    normalizeModel(object, loaded.format, THREE);
    if (loaded.format === 'VRM') object.rotation.y += Math.PI;
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(0.5, size.y);
    const width = 360, imageHeight = 480;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, imageHeight);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x172638);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x536880, 2.2));
    const lamp = new THREE.DirectionalLight(0xffffff, 2.3);
    lamp.position.set(-2, 4, 5);
    scene.add(lamp, object);
    const fov = 35;
    const camera = new THREE.PerspectiveCamera(fov, width / imageHeight, 0.02, 1000);
    const vertical = Math.max(height * 1.22, size.x * imageHeight / width * 1.18, size.z * 1.3);
    const distance = vertical / (2 * Math.tan(fov * Math.PI / 360));
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    camera.lookAt(center);
    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = imageHeight;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(renderer.domElement, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 2 * 1024 * 1024) return null;
    const response = await fetch(`/api/assets/thumbnail?id=${encodeURIComponent(item.id)}`, {
      method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.url === 'string' ? body.url : null;
  } finally {
    if (object) disposeObject(object);
    renderer?.dispose(); renderer?.forceContextLoss();
  }
}

/** Generate a missing front view once per session. @param {AssetItem} item @returns {Promise<string|null>} */
export function characterThumbnail(item) {
  if (item.thumbnailUrl) return Promise.resolve(item.thumbnailUrl);
  if (!item.available || categoryOf(item) !== 'char') return Promise.resolve(null);
  const key = `${item.id}|${item.thumbnailKey || ''}`;
  let work = pending.get(key);
  if (!work) {
    work = queue.then(() => renderAndSave(item)).then((url) => {
      if (url) {
        const state = assets.get();
        if (state.items.some((a) => a.id === item.id && a.thumbnailKey === item.thumbnailKey && !a.thumbnailUrl)) {
          assets.set({ items: state.items.map((a) => a.id === item.id && a.thumbnailKey === item.thumbnailKey ? { ...a, thumbnailUrl: url } : a) }, 'thumbnail');
        }
      }
      return url;
    }).catch(() => null);
    queue = work.then(() => undefined);
    pending.set(key, work);
  }
  return work;
}

/** Backfill existing characters in the background; visible cards also call characterThumbnail directly. @param {AssetItem[]} items */
export function backfillCharacterThumbs(items) {
  for (const item of items) {
    const key = `${item.id}|${item.thumbnailKey || ''}`;
    if (!item.available || item.thumbnailUrl || categoryOf(item) !== 'char' || backfillQueued.has(key)) continue;
    backfillQueued.add(key);
    void characterThumbnail(item);
  }
}
