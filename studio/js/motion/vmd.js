// @ts-check
// ⑤ VMD の読み込み（P2 設計 §2.5(c)、WP-05a）。three の MMDLoader.loadAnimation が VMD の取得と解析（表情・口パクのモーフを含む）まで行う。
import { NotFoundError, sourceDigest } from '../viewport/model-loader.js';
import { getBinary } from '../api.js';

/** 'mmd:vmd:<name>' → 取得先。ファイル名の / は区切りのまま（encodeURIComponent は / も符号化するので全体を符号化する）。 @param {{id: string}} item */
export function vmdUrl(item) {
  if (!item || !String(item.id).startsWith('mmd:vmd:')) throw new Error('VMD ではない素材です');
  return `/api/mmd-file/vmd/${encodeURIComponent(item.id.slice('mmd:vmd:'.length))}`;
}

/** @param {import('../viewport/model-loader.js').Libs} libs @param {string} url @param {any} mesh @returns {Promise<any>} AnimationClip */
export async function loadVmdClip(libs, url, mesh) {
  const result = await getBinary(url);
  if (!result.ok) throw result.status === 404 ? new NotFoundError() : new Error(result.message);
  const hash = await sourceDigest(result.data);
  const loader = new libs.MMDLoader();
  const parsed = loader._getParser().parseVmd(result.data, true);
  const clip = mesh.isCamera ? loader.animationBuilder.buildCameraAnimation(parsed) : loader.animationBuilder.build(parsed, mesh);
  clip.sourceHash = hash;
  return clip;
}

/** VMD を当てられるのは PMX だけ（O-⑤-8。旧画面の VMD の再生は PMX だけ：index.html:340〜347）。 @param {string|null|undefined} format */
export function canApplyVmd(format) { return format === 'PMX'; }
