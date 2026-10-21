// @ts-check
// P2 §2.5 WP-05d: 登録済みFBXの手順名対応と、再生時だけ行うクリップ解析。
import { getBinary, getJson, postJson } from '../api.js';
import { norm } from './patterns.fork.js';
import { disposeObject } from '../viewport/model-loader.js';

/** @typedef {{id: string, name: string, kind: string}} MotionFile */
/** @typedef {{files?: MotionFile[], mapping?: Record<string,string>}} MotionManifest */

/** 旧画面の Map#set と同じく、正規化キーが重複したら末尾の登録を採用する。 @param {MotionManifest} manifest */
export function motionFileMap(manifest) {
  /** @type {Map<string, MotionFile>} */
  const files = new Map();
  for (const file of manifest.files || []) {
    if (file?.kind === 'motions' && typeof file.id === 'string' && typeof file.name === 'string') files.set(norm(file.name), file);
  }
  return files;
}

/** 手動の対応が有効なら優先し、無ければ名前の自動一致を使う。 @param {string} step @param {Record<string,string>} mapping @param {Map<string,MotionFile>} files */
export function clipKeyFor(step, mapping, files) {
  const manual = mapping[step];
  if (manual && files.has(manual)) return manual;
  const automatic = norm(step);
  return files.has(automatic) ? automatic : null;
}

/** 解析済みクリップは登録IDで覚える。manifestの再読込時は clear() する。 @param {{FBXLoader: any}} libs @param {{get?: typeof getBinary}} [api] */
export function createFbxClipCache(libs, api = {}) {
  /** @type {Map<string, any>} */ const cache = new Map();
  return {
    clear() { cache.clear(); },
    /** @param {MotionFile} file */
    async getClip(file) {
      if (cache.has(file.id)) return cache.get(file.id);
      const r = await (api.get || getBinary)(`/api/file/${encodeURIComponent(file.id)}`);
      if (!r.ok) throw new Error(`${file.name}: ${r.message}`);
      const object = new libs.FBXLoader().parse(r.data, '');
      const clip = object.animations?.[0];
      disposeObject(object);
      if (!clip) throw new Error(`${file.name} にアニメーションがありません`);
      cache.set(file.id, clip);
      return clip;
    },
  };
}

/** 最新の対応表に1件だけ反映する。他画面が足したキーを保持する。 @param {string} step @param {string} key @param {{get?: typeof getJson, post?: typeof postJson}} [api] */
export async function saveMappingEntry(step, key, api = {}) {
  const get = api.get || getJson, post = api.post || postJson;
  const latest = await get('/api/manifest');
  if (!latest.ok) return latest;
  const raw = latest.data?.mapping;
  const mapping = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  mapping[step] = key;
  const saved = await post('/api/mapping', mapping);
  return saved.ok ? { ...saved, mapping } : saved;
}
