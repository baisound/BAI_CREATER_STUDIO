// @ts-check
// Rigid neutral figure driven by an already animated source skeleton. No skinning or weights are created.
import { collectBones } from '../viewport/model-loader.js';

/** @param {string} raw */
const clean = (raw) => raw.normalize('NFKC').toLowerCase().replace(/^.*[:|]/, '').replace(/mixamorig\d*/g, '').replace(/[\s_.-]/g, '');
/** @param {string} name @param {'left'|'right'} side */
const onSide = (name, side) => side === 'left'
  ? /左|left|^l(?:arm|leg|hand|shoulder|forearm|foot|thigh|calf|wrist|elbow|knee|toe)|(?:arm|leg|hand|shoulder|forearm|foot|thigh|calf|wrist|elbow|knee|toe)l$/.test(name)
  : /右|right|^r(?:arm|leg|hand|shoulder|forearm|foot|thigh|calf|wrist|elbow|knee|toe)|(?:arm|leg|hand|shoulder|forearm|foot|thigh|calf|wrist|elbow|knee|toe)r$/.test(name);

/** @param {any[]} bones @param {RegExp} pattern @param {'left'|'right'|null} [side] @param {RegExp|null} [exclude] */
function find(bones, pattern, side = null, exclude = null) {
  return bones.find((bone) => {
    const name = clean(bone.name);
    return pattern.test(name) && (!side || onSide(name, side))
      && !/(?:ik|キャンセル|補助|dummy|twist|ねじ|捩|(?:足|ひざ|膝|foot|leg|knee)d$|ex$)/.test(name)
      && (!exclude || !exclude.test(name));
  }) || null;
}

/** @param {any} source @param {any} THREE @returns {{object:any, update:()=>void, bones:string[]}|null} */
export function createGrayman(source, THREE) {
  const bones = collectBones(source);
  const hips = find(bones, /^(?:hips?|pelvis|腰|下半身|センター)$/) || find(bones, /hips|pelvis|下半身|腰/);
  const head = find(bones, /^(?:head|頭)$/) || find(bones, /head|頭/, null, /end|先|eye|目/);
  const chest = find(bones, /chest|spine2|spine1|上半身2|上半身/) || find(bones, /spine/);
  const neck = find(bones, /neck|首/);
  /** @param {'left'|'right'} side */
  const limb = (side) => ({
    shoulder: find(bones, /shoulder|肩/, side),
    upperArm: find(bones, /upperarm|arm|腕/, side, /forearm|lowerarm|hand|wrist|ひじ|肘/),
    elbow: find(bones, /forearm|lowerarm|elbow|ひじ|肘/, side),
    hand: find(bones, /hand|wrist|手首/, side, /finger|thumb|親指|人指|中指|薬指|小指/),
    thigh: find(bones, /upleg|upperleg|thigh|足/, side, /foot|ankle|calf|shin|knee|ひざ|膝|足首|つま先/),
    knee: find(bones, /calf|shin|knee|ひざ|膝|leg/, side, /upleg|upperleg|thigh|foot|ankle|足首|つま先/),
    foot: find(bones, /foot|ankle|足首/, side, /toe|つま先/),
    toe: find(bones, /toe|つま先/, side),
  });
  const left = limb('left'), right = limb('right');
  if (!hips || !head || !left.hand || !right.hand || !left.foot || !right.foot) return null;

  source.updateMatrixWorld(true);
  const initialFeet = left.foot.getWorldPosition(new THREE.Vector3()).add(right.foot.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const stature = Math.max(0.65, Math.min(3, head.getWorldPosition(new THREE.Vector3()).distanceTo(initialFeet)));
  const unitY = new THREE.Vector3(0, 1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xb9c3cd, roughness: 0.82, metalness: 0 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x8998a8, roughness: 0.86, metalness: 0 });
  const object = new THREE.Group(); object.name = 'Neutral Grayman'; object.userData.grayman = true;
  /** @param {string} name @param {number} radius @param {any} [mat] */
  const ball = (name, radius, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), mat);
    mesh.name = name; object.add(mesh); return mesh;
  };
  /** @param {string} name @param {number} radius */
  const bar = (name, radius) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 12), material);
    mesh.name = name; object.add(mesh); return mesh;
  };
  const headMesh = ball('grayman-head', stature * 0.085);
  const pelvisMesh = ball('grayman-pelvis', stature * 0.12);
  pelvisMesh.scale.set(1.25, 0.6, 0.72);
  const torso = bar('grayman-torso', stature * 0.115);
  const neckBar = bar('grayman-neck', stature * 0.035);
  const arms = [bar('grayman-left-upper-arm', stature * 0.043), bar('grayman-left-forearm', stature * 0.034),
    bar('grayman-right-upper-arm', stature * 0.043), bar('grayman-right-forearm', stature * 0.034)];
  const legs = [bar('grayman-left-thigh', stature * 0.065), bar('grayman-left-shin', stature * 0.048),
    bar('grayman-right-thigh', stature * 0.065), bar('grayman-right-shin', stature * 0.048)];
  const hands = [ball('grayman-left-hand', stature * 0.042, jointMaterial), ball('grayman-right-hand', stature * 0.042, jointMaterial)];
  const feet = [ball('grayman-left-foot', stature * 0.065), ball('grayman-right-foot', stature * 0.065)];
  feet.forEach((mesh) => mesh.scale.set(0.7, 0.45, 1.35));
  /** @param {any} bone */
  const world = (bone) => bone?.getWorldPosition(new THREE.Vector3()) || null;
  /** @param {any} mesh @param {any} a @param {any} b */
  const segment = (mesh, a, b) => {
    const delta = b.clone().sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(unitY, delta.clone().normalize());
    mesh.scale.y = Math.max(0.01, delta.length());
  };
  /** @param {any} origin @param {number} x @param {number} y */
  const offset = (origin, x, y) => {
    const quaternion = hips.getWorldQuaternion(new THREE.Quaternion());
    return origin.clone().add(new THREE.Vector3(x, y, 0).applyQuaternion(quaternion));
  };
  const update = () => {
    source.updateMatrixWorld(true);
    const hip = world(hips), skull = world(head), rib = world(chest) || hip.clone().lerp(skull, 0.67);
    const throat = world(neck) || hip.clone().lerp(skull, 0.83);
    pelvisMesh.position.copy(hip); headMesh.position.copy(skull);
    segment(torso, hip, throat); segment(neckBar, throat, skull);
    [left, right].forEach((part, index) => {
      const sign = index === 0 ? -1 : 1;
      const shoulder = world(part.upperArm) || world(part.shoulder) || offset(rib, sign * stature * 0.16, 0);
      const hand = world(part.hand);
      const elbow = world(part.elbow) || shoulder.clone().lerp(hand, 0.53);
      segment(arms[index * 2], shoulder, elbow); segment(arms[index * 2 + 1], elbow, hand);
      hands[index].position.copy(hand);
      const top = world(part.thigh) || offset(hip, sign * stature * 0.07, -stature * 0.05);
      const ankle = world(part.foot);
      const knee = world(part.knee) || top.clone().lerp(ankle, 0.5);
      segment(legs[index * 2], top, knee); segment(legs[index * 2 + 1], knee, ankle);
      feet[index].position.copy(world(part.toe) || ankle);
    });
    object.updateMatrixWorld(true);
  };
  update();
  return { object, update, bones: [hips, head, left.hand, right.hand, left.foot, right.foot].map((bone) => bone.name) };
}
