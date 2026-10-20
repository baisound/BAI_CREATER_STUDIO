// @ts-check
// ⑤ VMD の読み込み（P2 設計 §2.5(c)、WP-05a）。three の MMDLoader.loadAnimation が VMD の取得と解析（表情・口パクのモーフを含む）まで行う。
import { NotFoundError, isNotFound } from '../viewport/model-loader.js';

/** 'mmd:vmd:<name>' → 取得先。ファイル名の / は区切りのまま（encodeURIComponent は / も符号化するので全体を符号化する）。 @param {{id: string}} item */
export function vmdUrl(item) {
  if (!item || !String(item.id).startsWith('mmd:vmd:')) throw new Error('VMD ではない素材です');
  return `/api/mmd-file/vmd/${encodeURIComponent(item.id.slice('mmd:vmd:'.length))}`;
}

/** @param {import('../viewport/model-loader.js').Libs} libs @param {string} url @param {any} mesh @returns {Promise<any>} AnimationClip */
export function loadVmdClip(libs, url, mesh) {
  return new Promise((resolve, reject) => {
    new libs.MMDLoader().loadAnimation(url, mesh, resolve, undefined, (/** @type {any} */ e) => reject(isNotFound(e) ? new NotFoundError() : e));
  });
}

/** VMD を当てられるのは PMX だけ（O-⑤-8。旧画面の VMD の再生は PMX だけ：index.html:340〜347）。 @param {string|null|undefined} format */
export function canApplyVmd(format) { return format === 'PMX'; }
