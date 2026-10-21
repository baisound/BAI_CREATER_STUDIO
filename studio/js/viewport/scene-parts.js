// @ts-check
// SCR-06 のシーンの部品（P2 設計 §2.4(d) ステージ配置、2026-10-20 の上書き）。
// キャラクターもステージも、高さの正規化も中心合わせもせず、素材の単位の換算（stageUnitScale）だけを掛けて置く。
// 換算は表示のときだけ。保存する値（workspace.stage）は利用者の位置・回転・倍率だけ。
import { loadModel } from './model-loader.js';
import { stageUnitScale } from './normalize.fork.js';
import { stageTransform } from './placement.js';

/** @typedef {import('./model-loader.js').Libs} Libs */
/** @typedef {import('./model-loader.js').ModelItem} ModelItem */
/** @typedef {import('./placement.js').Stage} Stage */

/**
 * 素材を読み込み、単位の換算を掛けたグループに入れる（ファイルの原点はそのまま）。
 * @param {ModelItem} item @param {Libs} libs
 * @returns {Promise<{root: any, format: string, unit: number, vertices: number, animations: any[]}>}
 */
export async function buildPlaced(item, libs) {
  const r = await loadModel(item, libs);
  const unit = stageUnitScale(r.object, r.format);
  const root = new libs.THREE.Group();
  root.add(r.object);
  root.scale.setScalar(unit);
  root.userData = { assetId: item.id, format: r.format, unit };
  return { root, format: r.format, unit, vertices: r.vertices, animations: r.animations };
}

/** ステージの保存値を、グループへ当てる（位置[m]・回転[度→ラジアン、XYZ の順]・表示の拡大＝換算×倍率）。 @param {any} root @param {Stage} stage */
export function applyStage(root, stage) {
  const t = stageTransform(stage, root.userData.unit);
  root.position.set(...t.position);
  root.rotation.set(...t.rotation);
  root.scale.setScalar(t.scale);
}

/** 世界座標での高さ[m]（テスト・HUD 用）。 @param {any} THREE @param {any} root */
export function heightOf(THREE, root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((/** @type {any} */ object) => {
    if (!object.isMesh) return;
    for (let p = object; p && p !== root; p = p.parent) {
      if (/sky.?dome/i.test(p.name || '')) return;
    }
    box.expandByObject(object);
  });
  return box.isEmpty() ? 0 : box.max.y - box.min.y;
}
