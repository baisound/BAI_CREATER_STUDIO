// @ts-nocheck 旧コード camera_3d.js:278 / index.html:206,231,310 @5865209 のフォーク。照合テスト tests/studio-p2-normalize-parity.test.cjs で一致を保証
// 3D モデルの大きさ・位置の式。THREE は呼び出し側が渡す（three は 3D 画面を開いたときだけ読み込むため）。

/** 単体表示の目標の高さ（O-④-1：旧画面の値を保つ）。index.html:206 / 310 / 231, camera_3d.js:278 */
export const TARGET_HEIGHT = { GLB: 2.0, VRM: 2.0, PMX: 1.8, FBX: 1.95 };

/**
 * 単体表示の正規化（SCR-12 だけ。保存しない）。高さを TARGET_HEIGHT に、足を y=0 に、XZ の中心を原点に置く。
 * camera_3d.js:278 の式と同じ（旧画面の PMX/FBX の ±1.4 の配置と向きの回転は、2体を並べるためのものなので行わない：O-④-3）。
 * 呼び出し前の object は位置 0・回転 0・拡大 1（読み込み直後）であること。
 * @returns {{scale: number, offset: [number, number, number]}}
 */
export function normalizeModel(object, format, THREE) {
  const target = TARGET_HEIGHT[format] || 2.0;
  let bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = target / Math.max(0.001, size.y);
  object.scale.multiplyScalar(scale);
  bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= bounds.min.y;
  return { scale, offset: [object.position.x, object.position.y, object.position.z] };
}

/**
 * 旧 index.html:231 の2体表示。単体表示の normalizeModel と違い XZ の中心は動かさない。
 * @param {any} object @param {0|1} idx @param {any} THREE
 */
export function fitActorFbx(object, idx, THREE) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const height = Math.max(size.y, .01);
  object.scale.multiplyScalar(1.95 / height);
  const fitted = new THREE.Box3().setFromObject(object);
  object.position.y -= fitted.min.y;
  object.position.x = idx === 0 ? -1.4 : 1.4;
  object.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
  return object;
}

/** 旧 index.html:310〜312 の PMX 2体表示。@param {any} mesh @param {0|1} idx @param {any} THREE */
export function placeActorPmx(mesh, idx, THREE) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  mesh.scale.setScalar(1.8 / Math.max(.001, size.y));
  mesh.position.x = idx === 0 ? -1.4 : 1.4;
  mesh.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
  return mesh;
}

/**
 * ステージ・SCR-06 のキャラクターの 1 単位あたりのメートル（O-④-6 決定、2026-10-20 の上書きでキャラクターにも使う）。
 * PMX 0.08、GLB/VRM 1、FBX は UnitScaleFactor（1 単位あたりの cm）÷ 100（無ければ 0.01）。
 * three@0.160.1 の FBXLoader は UnitScaleFactor を userData.unitScaleFactor に入れるだけで大きさには掛けない。
 */
export function stageUnitScale(object, format) {
  if (format === 'PMX') return 0.08;
  if (format === 'FBX') {
    const f = object && object.userData && object.userData.unitScaleFactor;
    return Number.isFinite(f) && f > 0 ? f / 100 : 0.01;
  }
  return 1;
}
