// @ts-check
// SCR-08 character front views. Rendering and PNG cache never modify source models or weights.
import { assets } from '../store.js';
import { loadLibs, loadModel, disposeObject, collectBones } from '../viewport/model-loader.js';
import { normalizeModel } from '../viewport/normalize.fork.js';
import { categoryOf } from './assets-model.js';

/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
/** @type {Map<string, Promise<string|null>>} */
const pending = new Map();
let queue = Promise.resolve();
/** @type {Set<string>} */
const backfillQueued = new Set();

/** Use the named left/right shoulder and body axis to determine anatomical front. @param {any} object @param {any} THREE @param {string} format */
export function characterFront(object, THREE, format) {
  // The local VRM loader exposes the displayed front toward +Z in this preview.
  if (format === 'VRM') return new THREE.Vector3(0, 0, 1);
  object.updateMatrixWorld(true);
  const bones = collectBones(object);
  const name = (/** @type {any} */ bone) => String(bone.name || '').normalize('NFKC').toLowerCase().replace(/mixamorig\d*/g, '').replace(/[\s_.:|\-]/g, '');
  const find = (/** @type {RegExp} */ pattern) => bones.find((bone) => pattern.test(name(bone)));
  const pairs = [
    [find(/leftshoulder|左肩|^lshoulder/), find(/rightshoulder|右肩|^rshoulder/)],
    [find(/left(?:upper)?arm|左腕|^l(?:upper)?arm/), find(/right(?:upper)?arm|右腕|^r(?:upper)?arm/)],
    [find(/lefthand|左手首|^lhand/), find(/righthand|右手首|^rhand/)],
  ];
  const pair = pairs.find(([left, right]) => left && right);
  const fallback = () => new THREE.Vector3(0, 0, 1);
  if (!pair) return fallback();
  const left = pair[0].getWorldPosition(new THREE.Vector3());
  const right = pair[1].getWorldPosition(new THREE.Vector3());
  const hips = find(/^hips?$|^pelvis$|下半身|センター|^腰$/);
  const head = find(/^head$|^頭$/);
  const up = hips && head ? head.getWorldPosition(new THREE.Vector3()).sub(hips.getWorldPosition(new THREE.Vector3())).normalize() : new THREE.Vector3(0, 1, 0);
  const front = up.cross(right.sub(left));
  front.y = 0;
  return front.lengthSq() > 0.01 ? front.normalize() : fallback();
}

/** @param {AssetItem} item */
async function renderAndSave(item) {
  const libs = await loadLibs();
  /** @type {any} */ let object = null;
  /** @type {any} */ let renderer = null;
  /** @type {any[]} */ const sourceMaterials = [];
  try {
    const loaded = await loadModel(item, libs);
    object = loaded.object;
    const { THREE } = libs;
    if (loaded.format === 'PMX') {
      /** @type {Promise<void>[]} */ const pendingTextures = [];
      const seen = new Set();
      object.traverse((/** @type {any} */ node) => {
        if (!node.isMesh) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          const map = material.map;
          if (!map || seen.has(map) || !Array.isArray(map.readyCallbacks)) continue;
          seen.add(map);
          pendingTextures.push(new Promise((resolve) => map.readyCallbacks.push(() => resolve())));
        }
      });
      if (pendingTextures.length) await Promise.race([
        Promise.all(pendingTextures),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
    }
    if (loaded.format === 'PMX') object.traverse((/** @type {any} */ node) => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      sourceMaterials.push(...materials);
      // The MMD toon shader can disappear in a one-frame offscreen renderer;
      // use the same diffuse textures in a stable preview material.
      const preview = materials.map((/** @type {any} */ material) => new THREE.MeshBasicMaterial({
        color: material.color || 0xffffff, map: material.map || null,
        transparent: material.transparent, opacity: material.opacity,
        alphaTest: material.alphaTest, side: THREE.DoubleSide,
      }));
      node.material = Array.isArray(node.material) ? preview : preview[0];
    });
    const width = 360, imageHeight = 480;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, imageHeight);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x172638);
    scene.add(object);
    if (loaded.format === 'PMX') normalizeModel(object, loaded.format, THREE);
    scene.updateMatrixWorld(true);
    const front = characterFront(object, THREE, loaded.format);
    // Precise bounds apply the PMX skeleton twice after the preview-only scale;
    // its reported height becomes ~0.14 m while the rendered mesh is 1.8 m.
    const box = new THREE.Box3().setFromObject(object, loaded.format !== 'PMX');
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(0.5, size.y);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x536880, 2.2));
    const lamp = new THREE.DirectionalLight(0xffffff, 2.3);
    lamp.position.copy(center).addScaledVector(front, 4).add(new THREE.Vector3(-2, 3, 0));
    scene.add(lamp);
    const fov = 35;
    const camera = new THREE.PerspectiveCamera(fov, width / imageHeight, 0.02, 1000);
    const vertical = Math.max(height * 1.22, size.x * imageHeight / width * 1.18, size.z * 1.3);
    const distance = vertical / (2 * Math.tan(fov * Math.PI / 360));
    camera.far = Math.max(1000, distance * 4);
    camera.updateProjectionMatrix();
    camera.position.copy(center).addScaledVector(front, distance);
    camera.lookAt(center);
    renderer.render(scene, camera);
    if (loaded.format === 'PMX') {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      renderer.render(scene, camera);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = imageHeight;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(renderer.domElement, 0, 0);
    const pixels = g.getImageData(0, 0, width, imageHeight).data;
    let figureSamples = 0;
    for (let y = 0; y < imageHeight; y += 4) for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      if (Math.abs(pixels[i] - 0x17) + Math.abs(pixels[i + 1] - 0x26) + Math.abs(pixels[i + 2] - 0x38) > 24) figureSamples++;
    }
    // A successful WebGL call may still produce a blank background (notably
    // with some skinned PMX bounds). Never cache that as a portrait.
    if (figureSamples < 70) return null;
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
    for (const material of sourceMaterials) material.dispose();
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
