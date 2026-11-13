import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {contactRig} from '../studio/v05/js/target-contact-fit.mjs';

function fixture(){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.1,.02,.1,.1,.02,.1,0,.02,-.1],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([3,0,0,0,3,0,0,0,3,0,0,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());
  const bones=['センター','左足','左ひざ','左足首','左足ＩＫ','頭','右足首','左手首','右手首'].map(name=>{const b=new THREE.Bone();b.name=name;return b;});
  mesh.add(bones[0]);bones[0].add(bones[1],...bones.slice(4));bones[1].add(bones[2]);bones[2].add(bones[3]);
  bones[1].position.set(0,1,0);bones[2].position.set(0,-.45,.08);bones[3].position.set(0,-.45,-.08);bones[4].position.set(0,.1,0);
  mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
  geometry.userData.MMD={iks:[{target:4,effector:3,links:[{index:2},{index:1}]}],grants:[{index:5,parentIndex:1}]};
  return {mesh,bones};
}
test('protected head is observed even when a PMX grant makes it an allowed dependent',()=>{
  const {mesh,bones}=fixture(),rig=contactRig(THREE,mesh,'左'),before=rig.sample();
  bones[5].position.x+=.01;
  assert.throws(()=>rig.validate(before,rig.sample()),/反対の足・手・頭/);
});
test('invalid evaluated sole and unavailable IK/weights are rejected before a candidate exists',()=>{
  const {mesh,bones}=fixture(),rig=contactRig(THREE,mesh,'左');bones[3].position.x=NaN;
  assert.throws(()=>rig.sample(),/不正な座標/);
  const missing=fixture().mesh;missing.geometry.userData.MMD.iks=[];
  assert.throws(()=>contactRig(THREE,missing,'左'),/IKチェーン/);
  const unweighted=fixture().mesh;unweighted.geometry.attributes.skinWeight.array.fill(0);
  assert.throws(()=>contactRig(THREE,unweighted,'左'),/頂点が足りません/);
});
