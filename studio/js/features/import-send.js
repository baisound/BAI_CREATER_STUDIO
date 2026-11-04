// @ts-check
// 登録の送信に使う共通部品（②の SCR-08 と ③の素材管理で共用）。DOM は使わない。
// 送り先・登録後の id・FBX の送信前検査。server.py の各アップロード API と一致させる。

/** @typedef {import('./import-rules.js').Route} Route */

/** 送り先の URL。 @param {Route} route @param {string} kind @param {string} name */
export function uploadUrlFor(route, kind, name) {
  const n = encodeURIComponent(name);
  switch (route) {
    case 'integrated': return `/api/integrated-v02/upload?kind=${encodeURIComponent(kind)}&name=${n}`;
    case 'library': return `/api/library-assets/upload?kind=${encodeURIComponent(kind)}&name=${n}`;
    case 'pmxZip': return `/api/pmx-zip-upload?slot=${encodeURIComponent(kind)}`;
    case 'vmd': return `/api/mmd-upload?slot=vmd&name=${n}`;
    default: return `/api/upload?kind=${encodeURIComponent(kind)}&name=${n}`;
  }
}

/** 登録した素材の /api/assets の id（設計 §2.3(d)-6）。 @param {Route} route @param {string} name @param {any} data */
export function importedAssetId(route, name, data) {
  if (route === 'library') return String(data.item.id);
  if (route === 'integrated') return `integrated:${data.asset}`;
  if (route === 'pmxZip') return `mmd:${data.slot}:${data.model_path}`;
  if (route === 'vmd') return `mmd:vmd:${name}`;
  return `fbx:${data.id}`;
}

/**
 * FBX を送る前に読めるか確かめる。動作として送る FBX はアニメーションを持つこと。
 * @param {Blob} file @param {string} name @param {string} kind @returns {Promise<string|null>} 送らない理由
 */
export async function fbxPrecheck(file, name, kind) {
  /** @type {any} */
  let mod;
  try {
    const spec = 'three/addons/loaders/FBXLoader.js';
    mod = await import(/* @vite-ignore */ spec);
  } catch { return 'FBX の確認に必要な 3D ライブラリを読み込めません。'; }
  try {
    const buf = await file.arrayBuffer();
    const obj = new mod.FBXLoader().parse(buf, '');
    if (kind === 'motions' && !(obj && obj.animations && obj.animations.length)) return `${name} にアニメーションがありません`;
  } catch (e) { return `FBX として読み込めません：${e instanceof Error ? e.message : String(e)}`; }
  return null;
}
