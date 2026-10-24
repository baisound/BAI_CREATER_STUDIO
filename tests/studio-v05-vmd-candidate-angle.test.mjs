import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {comparePmxBones} from '../studio/v05/js/pmx-vmd-candidate-validation-v120.js';

function model(rotation,scale=1){
  const q=new THREE.Quaternion(...rotation.toArray().map(value=>value*scale));
  return {updateMatrixWorld(){},skeleton:{bones:[{
    name:'右腕',getWorldPosition(out){return out.set(0.2,1,0);},
    getWorldQuaternion(out){return out.copy(q);}
  }]}};
}

test('real-PMX VMD angle compares quaternion orientation after matrix decomposition',()=>{
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1.2);
  const same=comparePmxBones(model(q),model(q,0.99999998),THREE);
  assert.ok(same.angle<0.001,`identical orientation reported ${same.angle}°`);
  assert.equal(same.position,0);
  const different=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),
    1.2+0.5*Math.PI/180);
  const result=comparePmxBones(model(q,0.99999998),model(different),THREE);
  assert.ok(Math.abs(result.angle-0.5)<1e-5);
  assert.throws(()=>comparePmxBones(model(q),model(q,0),THREE),/非有限/);
});
