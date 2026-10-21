import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGenericGlbPreview } from '../studio/js/motion/generic-glb-preview.js';

const SOURCE = ['Hips', 'Spine', 'Spine1', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const TARGET = ['J_Bip_C_Hips', 'J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_Neck', 'J_Bip_C_Head',
  'J_Bip_L_UpperArm', 'J_Bip_L_LowerArm', 'J_Bip_R_UpperArm', 'J_Bip_R_LowerArm',
  'J_Bip_L_UpperLeg', 'J_Bip_L_LowerLeg', 'J_Bip_L_Foot', 'J_Bip_R_UpperLeg', 'J_Bip_R_LowerLeg', 'J_Bip_R_Foot'];

function rig(names) {
  const root = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = names[0]; root.add(hips);
  for (const name of names.slice(1)) { const bone = new THREE.Bone(); bone.name = name; hips.add(bone); }
  root.add(new THREE.Mesh(new THREE.BoxGeometry(.5, 2, .3), new THREE.MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  return root;
}

test('VRM humanoid receives dance rotation and root translation without accumulating edits', () => {
  const source = rig(SOURCE), target = rig(TARGET);
  const arm = source.getObjectByName('LeftArm');
  const initial = new THREE.Quaternion();
  const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 3);
  const clip = new THREE.AnimationClip('dance', 2, [
    new THREE.QuaternionKeyframeTrack(`${arm.name}.quaternion`, [0, 1], [...initial, ...turned]),
    new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, .2, 0, 0]),
  ]);
  const preview = createGenericGlbPreview(THREE, target, source, clip);
  assert.ok(preview.mappedBones >= 15);
  assert.equal(preview.followBone, 'J_Bip_C_Hips');
  preview.seek(1);
  const targetArm = target.getObjectByName('J_Bip_L_UpperArm');
  const first = targetArm.quaternion.clone();
  assert.ok(first.angleTo(initial) > .5, 'arm must turn');
  assert.ok(target.getObjectByName('J_Bip_C_Hips').position.x > 0, 'hips must translate');
  preview.seek(0); preview.seek(1);
  assert.ok(targetArm.quaternion.angleTo(first) < 1e-6, 'repeated seek must not accumulate');
  assert.ok(preview.probe([preview.followBone])[preview.followBone]?.position[0] > 0);
  preview.dispose();
});

test('unknown non-humanoid rig is rejected instead of showing a successful dance', () => {
  const source = rig(SOURCE), target = new THREE.Group();
  const clip = new THREE.AnimationClip('dance', 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 1, 0, 0])]);
  assert.throws(() => createGenericGlbPreview(THREE, target, source, clip), /人体骨対応は不足/);
});
