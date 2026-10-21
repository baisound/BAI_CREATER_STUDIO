// @ts-check
// AUDIO-001 / Issue #50: runtime-only dance preview for GLB, VRM and FBX humanoids.
// The source clip drives loaded bones in memory; source files, rigs and weights are unchanged.

const BONE_NAMES = [
  ['hips', 'Hips', 'J_Bip_C_Hips', 'pelvis'],
  ['spine', 'Spine', 'J_Bip_C_Spine'],
  ['chest', 'Spine1', 'Spine2', 'Chest', 'J_Bip_C_Chest', 'J_Bip_C_UpperChest'],
  ['neck', 'Neck', 'J_Bip_C_Neck'],
  ['head', 'Head', 'J_Bip_C_Head'],
  ['leftShoulder', 'LeftShoulder', 'J_Bip_L_Shoulder'],
  ['leftUpperArm', 'LeftArm', 'upperarm.l', 'J_Bip_L_UpperArm'],
  ['leftLowerArm', 'LeftForeArm', 'lowerarm.l', 'J_Bip_L_LowerArm'],
  ['leftHand', 'LeftHand', 'hand.l', 'J_Bip_L_Hand'],
  ['rightShoulder', 'RightShoulder', 'J_Bip_R_Shoulder'],
  ['rightUpperArm', 'RightArm', 'upperarm.r', 'J_Bip_R_UpperArm'],
  ['rightLowerArm', 'RightForeArm', 'lowerarm.r', 'J_Bip_R_LowerArm'],
  ['rightHand', 'RightHand', 'hand.r', 'J_Bip_R_Hand'],
  ['leftUpperLeg', 'LeftUpLeg', 'upperleg.l', 'J_Bip_L_UpperLeg'],
  ['leftLowerLeg', 'LeftLeg', 'lowerleg.l', 'J_Bip_L_LowerLeg'],
  ['leftFoot', 'LeftFoot', 'foot.l', 'J_Bip_L_Foot'],
  ['leftToes', 'LeftToeBase', 'toes.l', 'J_Bip_L_ToeBase'],
  ['rightUpperLeg', 'RightUpLeg', 'upperleg.r', 'J_Bip_R_UpperLeg'],
  ['rightLowerLeg', 'RightLeg', 'lowerleg.r', 'J_Bip_R_LowerLeg'],
  ['rightFoot', 'RightFoot', 'foot.r', 'J_Bip_R_Foot'],
  ['rightToes', 'RightToeBase', 'toes.r', 'J_Bip_R_ToeBase'],
];

/** @param {string} name */
const key = (name) => name.replace(/^mixamorig[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
/** @param {any} object */
function bonesOf(object) {
  const found = new Map();
  object.traverse((/** @type {any} */ node) => {
    if (node.isBone && !found.has(key(node.name))) found.set(key(node.name), node);
  });
  return found;
}
/** @param {Map<string, any>} bones @param {string[]} aliases */
const choose = (bones, aliases) => aliases.map((name) => bones.get(key(name))).find(Boolean);
/** @param {any} bone */
function depth(bone) { let result = 0; for (let p = bone.parent; p?.isBone; p = p.parent) result++; return result; }

/**
 * Rest-relative motion preview for a humanoid already loaded through GLTFLoader or FBXLoader.
 * An unknown rig is rejected explicitly instead of showing a motionless model as a successful dance.
 * @param {any} THREE @param {any} target @param {any} source @param {any} clip
 */
export function createGenericGlbPreview(THREE, target, source, clip) {
  if (!clip?.tracks?.length) throw Error('ダンスGLBにアニメーションがありません。');
  const sourceBones = bonesOf(source), targetBones = bonesOf(target);
  const aliases = BONE_NAMES.map(([canonical, ...others]) => [canonical, canonical, ...others]);
  /** @type {{canonical:string,src:any,dst:any,sourceRest?:any,targetRest?:any}[]} */
  const pairs = aliases.map(([canonical, ...names]) => ({
    canonical, src: choose(sourceBones, names), dst: choose(targetBones, names),
  })).filter((pair) => pair.src && pair.dst);
  const hips = pairs.find((pair) => pair.canonical === 'hips');
  const legs = pairs.filter((pair) => /^(left|right)(UpperLeg|LowerLeg|Foot)$/.test(pair.canonical));
  if (!hips || pairs.length < 10 || legs.length < 4) {
    throw Error(`このモデルとダンスの人体骨対応は不足しています（${pairs.length}本）。腰・左右の脚などが必要です。`);
  }
  target.updateMatrixWorld(true); source.updateMatrixWorld(true);
  const vec = () => new THREE.Vector3(), quat = () => new THREE.Quaternion();
  const rest = [...targetBones.values()].map((bone) => ({ bone, position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone() }));
  for (const pair of pairs) {
    pair.sourceRest = pair.src.getWorldQuaternion(quat());
    pair.targetRest = pair.dst.getWorldQuaternion(quat());
  }
  pairs.sort((a, b) => depth(a.dst) - depth(b.dst));
  const sourceHeight = new THREE.Box3().setFromObject(source, true).getSize(vec()).y;
  const targetHeight = new THREE.Box3().setFromObject(target, true).getSize(vec()).y
    / Math.max(1e-8, Math.abs(target.getWorldScale(vec()).y));
  const displacementScale = sourceHeight > 0 && targetHeight > 0 ? targetHeight / sourceHeight : 1;
  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play(); mixer.setTime(0); source.updateMatrixWorld(true);
  const hipsStart = hips.src.getWorldPosition(vec());
  const hipsRest = hips.dst.position.clone();
  const world = quat(), parentWorld = quat(), delta = quat(), displacement = vec();
  const duration = Math.max(0, Number(clip.duration) || 0);
  const api = {
    duration, mappedBones: pairs.length, followBone: hips.dst.name,
    missingBones: aliases.filter(([canonical]) => !pairs.some((pair) => pair.canonical === canonical)).map(([canonical]) => canonical),
    /** @param {number} seconds */
    seek(seconds) {
      const time = Math.max(0, Math.min(duration > 0 ? duration - 1e-6 : 0, Number.isFinite(seconds) ? seconds : 0));
      for (const part of rest) { part.bone.position.copy(part.position); part.bone.quaternion.copy(part.rotation); part.bone.scale.copy(part.scale); }
      mixer.setTime(time); source.updateMatrixWorld(true); target.updateMatrixWorld(true);
      displacement.copy(hips.src.getWorldPosition(vec())).sub(hipsStart).multiplyScalar(displacementScale);
      if (hips.dst.parent) {
        hips.dst.parent.getWorldQuaternion(parentWorld);
        displacement.applyQuaternion(parentWorld.invert());
      }
      hips.dst.position.copy(hipsRest).add(displacement);
      target.updateMatrixWorld(true);
      for (const pair of pairs) {
        pair.src.getWorldQuaternion(world);
        delta.copy(world).multiply(pair.sourceRest.clone().invert());
        world.copy(delta).multiply(pair.targetRest);
        pair.dst.parent.getWorldQuaternion(parentWorld);
        pair.dst.quaternion.copy(parentWorld.invert().multiply(world));
        pair.dst.updateMatrixWorld(true);
      }
      target.updateMatrixWorld(true);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(source); },
    /** @param {string[]} names */
    probe(names) { return Object.fromEntries(names.map((name) => {
      const bone = name === api.followBone ? hips.dst : choose(targetBones, [name]);
      return [name, bone ? { position: bone.getWorldPosition(vec()).toArray(), quaternion: bone.getWorldQuaternion(quat()).toArray() } : null];
    })); },
  };
  api.seek(0);
  return api;
}
