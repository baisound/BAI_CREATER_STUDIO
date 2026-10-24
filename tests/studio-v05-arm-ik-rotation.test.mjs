import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solveArmLocalRotations} from '../studio/v05/js/arm-ik-rotation-v135.mjs';

test('two local rotations reach a 3D wrist target and restore the skeleton',()=>{
  const object=new THREE.Object3D(),arm=new THREE.Bone(),elbow=new THREE.Bone(),wrist=new THREE.Bone();
  object.add(arm);arm.add(elbow);elbow.add(wrist);
  elbow.position.set(1,0,0);wrist.position.set(1,0,0);
  object.updateWorldMatrix(true,true);
  const before=[arm.quaternion.toArray(),elbow.quaternion.toArray(),wrist.getWorldPosition(new THREE.Vector3()).toArray()];
  const result=solveArmLocalRotations({THREE,object,arm,elbow,wrist,
    target:[1.2,0.7,0.2],fallbackPole:[0,0,1]});
  assert.ok(result.residual<1e-10);
  assert.ok(result.elbowResidual<1e-10);
  assert.deepEqual(arm.quaternion.toArray(),before[0]);
  assert.deepEqual(elbow.quaternion.toArray(),before[1]);
  assert.deepEqual(wrist.getWorldPosition(new THREE.Vector3()).toArray(),before[2]);
  assert.throws(()=>solveArmLocalRotations({THREE,object,arm:wrist,elbow, wrist:arm,
    target:[1,1,0],fallbackPole:[0,0,1]}),/親子経路/);
});
