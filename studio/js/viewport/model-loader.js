// @ts-check
// ④ GLB/VRM/PMX/FBX の取得と解析（P2 設計 §2.4(c)）。three と各ローダーは 3D 画面を開いたときだけ読み込む。
// 取得は api.js の getBinary（GLB/VRM/FBX）。PMX は MMDLoader が自分で取得する（テクスチャを相対パスで読むため）。
import { getBinary } from '../api.js';

/** @typedef {{THREE: any, OrbitControls: any, GLTFLoader: any, FBXLoader: any, MMDLoader: any}} Libs */
/** @typedef {{id: string, name: string, format: string, kind: string, source: string, available: boolean, filename?: string}} ModelItem */

/** 元ファイルが無い（HTTP 404）。画面は「元ファイルが見つかりません。素材を再登録してください。」を出す。 */
export class NotFoundError extends Error {
  /** @param {string} [message] */
  constructor(message) { super(message || 'not found'); this.name = 'NotFoundError'; }
}
/** three.js を読み込めない（オフライン・CDN）。 */
export class LibsError extends Error {
  constructor() { super('3D ライブラリ（three.js）を読み込めません。インターネット接続を確認してください。'); this.name = 'LibsError'; }
}

export const MISSING_FILE_TEXT = '元ファイルが見つかりません。素材を再登録してください。';

/** @type {Promise<Libs>|null} */
let libsPromise = null;
/** three と必要なローダーを1回だけ読み込む。失敗したら次回やり直せるように覚えない。 @returns {Promise<Libs>} */
export function loadLibs() {
  if (!libsPromise) {
    // 変数経由にして tsc に解決させない（three の型は入れない。旧画面と同じ importmap の three@0.160.1 を使う）
    const spec = { three: 'three', orbit: 'three/addons/controls/OrbitControls.js', gltf: 'three/addons/loaders/GLTFLoader.js', fbx: 'three/addons/loaders/FBXLoader.js', mmd: 'three/addons/loaders/MMDLoader.js' };
    libsPromise = (async () => {
      try {
        const [THREE, orbit, gltf, fbx, mmd] = await Promise.all([import(spec.three), import(spec.orbit), import(spec.gltf), import(spec.fbx), import(spec.mmd)]);
        return { THREE, OrbitControls: orbit.OrbitControls, GLTFLoader: gltf.GLTFLoader, FBXLoader: fbx.FBXLoader, MMDLoader: mmd.MMDLoader };
      } catch {
        libsPromise = null;
        throw new LibsError();
      }
    })();
  }
  return libsPromise;
}

/** 素材の id から読み込み先を決める。 @param {ModelItem} item @returns {{url: string, format: 'GLB'|'VRM'|'PMX'|'FBX'}} */
export function modelSource(item) {
  const format = /** @type {'GLB'|'VRM'|'PMX'|'FBX'} */ (String(item.format || '').toUpperCase());
  if (item.source === 'integrated' && (format === 'GLB' || format === 'VRM') && item.filename) {
    return { url: `/api/integrated-v02/asset/${encodeURIComponent(item.filename)}`, format };
  }
  if (item.source === 'fbx' && format === 'FBX') return { url: `/api/file/${encodeURIComponent(item.id.slice('fbx:'.length))}`, format };
  if (item.source === 'mmd' && format === 'PMX') {
    // ファイル名の / は区切りのまま残す（テクスチャの相対パスが /api/mmd-file/<slot>/ からの位置で解決されるように）
    return { url: `/api/mmd-file/${encodeURIComponent(item.kind)}/${item.name.split('/').map(encodeURIComponent).join('/')}`, format: 'PMX' };
  }
  throw new Error(`この素材は 3D 表示できません（形式: ${item.format || '不明'}）`);
}

/** 頂点数（メッシュの position 属性の合計）。 @param {any} object */
export function countVertices(object) {
  let n = 0;
  object.traverse((/** @type {any} */ o) => { if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) n += o.geometry.attributes.position.count; });
  return n;
}

/** ボーン（Bone と SkinnedMesh の skeleton の両方から、重複なしで）。 @param {any} object @returns {any[]} */
export function collectBones(object) {
  /** @type {Set<any>} */
  const set = new Set();
  object.traverse((/** @type {any} */ o) => {
    if (o.isBone) set.add(o);
    if (o.isSkinnedMesh && o.skeleton) for (const b of o.skeleton.bones) set.add(b);
  });
  return [...set];
}

/** @param {any} e */
const isNotFound = (e) => !!e && ((e.response && e.response.status === 404) || /responded with 404/.test(String(e.message || '')));

/**
 * 素材を読み込んで three のオブジェクトにする。
 * @param {ModelItem} item @param {Libs} libs
 * @returns {Promise<{object: any, animations: any[], format: 'GLB'|'VRM'|'PMX'|'FBX', vertices: number}>}
 */
export async function loadModel(item, libs) {
  const { url, format } = modelSource(item);
  /** @type {any} */ let object;
  /** @type {any[]} */ let animations = [];
  if (format === 'PMX') {
    object = await new Promise((resolve, reject) => {
      new libs.MMDLoader().load(url, resolve, undefined, (/** @type {any} */ e) => reject(isNotFound(e) ? new NotFoundError() : e));
    });
  } else {
    const r = await getBinary(url);
    if (!r.ok) throw r.status === 404 ? new NotFoundError() : new Error(r.message);
    if (format === 'FBX') {
      object = new libs.FBXLoader().parse(r.data, '');
      animations = object.animations || [];
    } else {
      const parsed = await new libs.GLTFLoader().parseAsync(r.data, '');
      object = parsed.scene;
      animations = parsed.animations || [];
    }
  }
  return { object, animations, format, vertices: countVertices(object) };
}

/** 画面に出す失敗の文言（設計 §2.4(d)）。 @param {unknown} e */
export function loadErrorText(e) {
  if (e instanceof NotFoundError) return MISSING_FILE_TEXT;
  if (e instanceof LibsError) return e.message;
  return `3D 表示できませんでした：${e instanceof Error ? e.message : String(e)}`;
}

/** three のオブジェクトを破棄する（ジオメトリ・マテリアル・テクスチャ）。 @param {any} object */
export function disposeObject(object) {
  object.traverse((/** @type {any} */ o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && /** @type {any} */ (v).isTexture) /** @type {any} */ (v).dispose();
      m.dispose();
    }
  });
}
