// @ts-check
// Issue #39: runtime-only GLB → PMX preview. This changes loaded objects in memory,
// never the PMX/GLB files, rig, vertex groups, or weights.

const BODY = [
  ['Hips', '腰'], ['Spine', '上半身'], ['Spine1', '上半身2'],
  ['Neck', '首'], ['Head', '頭'],
  ['LeftShoulder', '左肩'], ['LeftArm', '左腕'], ['LeftForeArm', '左ひじ'], ['LeftHand', '左手首'],
  ['RightShoulder', '右肩'], ['RightArm', '右腕'], ['RightForeArm', '右ひじ'], ['RightHand', '右手首'],
  ['LeftUpLeg', '左足'], ['LeftLeg', '左ひざ'], ['LeftFoot', '左足首'], ['LeftToeBase', '左つま先'],
  ['RightUpLeg', '右足'], ['RightLeg', '右ひざ'], ['RightFoot', '右足首'], ['RightToeBase', '右つま先'],
  // このPMXの脚の頂点は主に D 系列と足先EXへスキニングされている。
  // MMD の付与計算はこの軽量プレビューでは動かないため、並列の変形骨も直接同期する。
  ['LeftUpLeg', '左足D'], ['LeftLeg', '左ひざD'], ['LeftFoot', '左足首D'], ['LeftToeBase', '左足先EX'],
  ['RightUpLeg', '右足D'], ['RightLeg', '右ひざD'], ['RightFoot', '右足首D'], ['RightToeBase', '右足先EX'],
];
const FINGERS = { Thumb: ['親指', 0], Index: ['人指', 1], Middle: ['中指', 1], Ring: ['薬指', 1], Pinky: ['小指', 1] };
const MAP = [...BODY];
for (const [side, jp] of [['Left', '左'], ['Right', '右']]) {
  for (const [finger, [name, first]] of Object.entries(FINGERS)) {
    for (let i = 1; i <= 3; i++) MAP.push([`${side}Hand${finger}${i}`, `${jp}${name}${String.fromCharCode('０'.charCodeAt(0) + i + Number(first) - 1)}`]);
  }
}

/** @param {any} obj @param {string} name */
function findBone(obj, name) {
  /** @type {any} */ let found = null;
  obj.traverse((/** @type {any} */ x) => { if (!found && x.isBone && x.name === name) found = x; });
  return found;
}
/** @param {any} bone */
function depth(bone) { let n = 0, p = bone.parent; while (p && p.isBone) { n++; p = p.parent; } return n; }

/**
 * Create a deterministic, rest-relative retarget preview for an already loaded PMX and GLB.
 * @param {any} THREE @param {any} pmx SkinnedMesh from MMDLoader
 * @param {any} sourceScene GLTF scene @param {any} clip GLTF AnimationClip
 */
export function createPmxGlbPreview(THREE, pmx, sourceScene, clip) {
  if (!pmx?.isSkinnedMesh || !pmx.skeleton || !clip?.tracks?.length) throw new Error('PMXの骨格またはGLBのアニメーションがありません。');
  const sourceBones = new Map();
  sourceScene.traverse((/** @type {any} */ o) => { if (o.isBone) sourceBones.set(o.name, o); });
  const targetBones = new Map(pmx.skeleton.bones.map((/** @type {any} */ b) => [b.name, b]));
  for (const [src, dst] of [['Hips', '腰'], ['LeftUpLeg', '左足'], ['RightUpLeg', '右足']]) {
    if (!sourceBones.has(src) || !targetBones.has(dst)) throw new Error(`対応に必要な骨がありません：${src} → ${dst}`);
  }
  const center = targetBones.get('センター');
  if (!center) throw new Error('PMXにセンター骨がありません。');
  sourceScene.updateMatrixWorld(true);
  pmx.updateMatrixWorld(true);
  const q = () => new THREE.Quaternion();
  const v = () => new THREE.Vector3();
  const rest = pmx.skeleton.bones.map((/** @type {any} */ bone) => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
  const centerRest = center.position.clone();
  /** @type {{src: any, dst: any, sourceRest: any, targetRest: any}[]} */
  const pairs = [];
  /** @type {string[]} */ const missing = [];
  for (const [sourceName, targetName] of MAP) {
    const src = sourceBones.get(sourceName), dst = targetBones.get(targetName);
    if (!src || !dst) { missing.push(`${sourceName} → ${targetName}`); continue; }
    pairs.push({ src, dst, sourceRest: src.getWorldQuaternion(q()), targetRest: dst.getWorldQuaternion(q()) });
  }
  pairs.sort((a, b) => depth(a.dst) - depth(b.dst));
  const sourceHeight = new THREE.Box3().setFromObject(sourceScene, true).getSize(v()).y;
  const worldScaleY = Math.max(1e-8, Math.abs(pmx.getWorldScale(v()).y));
  const targetHeight = new THREE.Box3().setFromObject(pmx, true).getSize(v()).y / worldScaleY;
  const displacementScale = sourceHeight > 0 && targetHeight > 0 ? targetHeight / sourceHeight : 1;
  const mixer = new THREE.AnimationMixer(sourceScene);
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  sourceScene.updateMatrixWorld(true);
  const hips = sourceBones.get('Hips');
  const hipsStart = hips.getWorldPosition(v());
  const delta = q(), world = q(), parentWorld = q(), position = v();
  const duration = Number(clip.duration) || 0;
  const api = {
    duration,
    mappedBones: pairs.length,
    missingBones: missing,
    /** Apply one source time, without accumulating rotations across seeks. @param {number} seconds */
    seek(seconds) {
      const time = Math.max(0, Math.min(duration > 0 ? duration - 1e-6 : 0, Number.isFinite(seconds) ? seconds : 0));
      for (const r of rest) { r.bone.position.copy(r.position); r.bone.quaternion.copy(r.quaternion); r.bone.scale.copy(r.scale); }
      mixer.setTime(time);
      sourceScene.updateMatrixWorld(true);
      pmx.updateMatrixWorld(true);
      position.copy(hips.getWorldPosition(v())).sub(hipsStart).multiplyScalar(displacementScale);
      center.position.copy(centerRest).add(position);
      pmx.updateMatrixWorld(true);
      for (const pair of pairs) {
        pair.src.getWorldQuaternion(world);
        delta.copy(world).multiply(pair.sourceRest.clone().invert());
        world.copy(delta).multiply(pair.targetRest);
        pair.dst.parent.getWorldQuaternion(parentWorld);
        pair.dst.quaternion.copy(parentWorld.invert().multiply(world));
        pair.dst.updateMatrixWorld(true);
      }
      pmx.updateMatrixWorld(true);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(sourceScene); },
    /** Read-only sample for browser verification. @param {string[]} names */
    probe(names) { return Object.fromEntries(names.map(name => { const b = findBone(pmx, name); return [name, b ? { position: b.getWorldPosition(v()).toArray(), quaternion: b.getWorldQuaternion(q()).toArray() } : null]; })); },
  };
  api.seek(0);
  return api;
}
