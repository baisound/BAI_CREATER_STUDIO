// WP-L8a：場面インスタンスを読み込んだ直後の大きさと位置の置き方（設計 docs/roadmap/WP_L8A_VISUAL_SCALE_DETAILED_DESIGN_20261104_JA.md §3.3）。
// 印 units が 'legacy' のときだけ、旧画面（①camera_3d.js・②scene-parts.js）と同じく素材の単位の換算だけを掛け、位置は動かさない。
// 印が無いときは、v58 からの③の正規化（PMX は0.08倍と足合わせ、ほかは normalizeModel）をそのまま行う。
import { normalizeModel, stageUnitScale } from '../../js/viewport/normalize.fork.js';

export const LEGACY_UNITS = 'legacy';

/**
 * @param {any} object loadModel の object（読込直後。位置0・回転0・拡大1）
 * @param {'GLB'|'VRM'|'PMX'|'FBX'} format
 * @param {string|null|undefined} units 場面インスタンスの units（無ければ null か undefined）
 * @param {any} THREE
 * @returns {{mode: 'v05'|'legacy', unit: number|null}}
 */
export function placeInstanceObject(object, format, units, THREE) {
  if (units === LEGACY_UNITS) {
    const unit = stageUnitScale(object, format);
    object.scale.setScalar(unit);
    return { mode: 'legacy', unit };
  }
  if (units !== null && units !== undefined) throw new Error(`場面インスタンスの units が不正です: ${units}`);
  if (format === 'PMX') {
    object.scale.setScalar(.08);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object, true);
    object.position.y -= box.min.y;
  } else normalizeModel(object, format, THREE);
  return { mode: 'v05', unit: null };
}
