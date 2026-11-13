import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildTimelinePhysics} from '../studio/v05/js/timeline-pmx-physics.mjs';

function fixture(){
 const bone=new THREE.Bone(),object=new THREE.Object3D();object.add(bone);object.skeleton={bones:[bone]};object.geometry={userData:{MMD:{rigidBodies:[{boneIndex:0,type:2}]}}};
 const target={format:'PMX',object,libs:{THREE}},instance={id:'model',asset_id:'pmx',transform:{scale:[1,1,1],rotation:[0,0,0]},timeline_windows:[{start:0,duration:1}]};
 const options={scene:{instances:[instance],physics:{model:{enabled:true,asset_id:'pmx',solver:'mmd-fixed60-v1'}}},arrangement:{clips:[]},getLoaded:()=>target,sample:t=>{bone.position.set(t,2+t,0);bone.quaternion.identity();}};
 let disposed=0;
 options.factory=async(pmx,motion)=>({dynamicBones:[{index:0,preservePosition:true}],seek(t){motion.seek(t);bone.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),t);},dispose(){disposed++;}});
 return {bone,options,target,get disposed(){return disposed;}};
}
test('type2 preserves current-time animation position and normalized interpolated rotation',async()=>{
 const f=fixture(),cache=await buildTimelinePhysics(f.options);assert.equal(f.disposed,1);const t=1/120;f.options.sample(t);const original=f.bone.position.toArray();cache.apply(t);assert.deepEqual(f.bone.position.toArray(),original);assert.ok(Math.abs(f.bone.quaternion.length()-1)<1e-7);assert.ok(Math.abs(f.bone.quaternion.angleTo(new THREE.Quaternion())-t)<1e-6);
 cache.dispose();assert.throws(()=>cache.apply(0),/再準備/);
});
test('cancellation never returns a partial cache and releases its owned world',async()=>{
 const f=fixture();let active=true;await assert.rejects(buildTimelinePhysics({...f.options,isCurrent:()=>active,onProgress:()=>{active=false;}}),/中止/);assert.equal(f.disposed,1);
});
test('oversized duration, aggregate budget and nonuniform scale reject before creating worlds',async()=>{
 for(const mode of ['duration','budget','scale']){
  const f=fixture(),instance=f.options.scene.instances[0];if(mode==='duration')instance.timeline_windows[0].duration=601;
  if(mode==='scale')instance.transform.scale=[1,2,1];
  if(mode==='budget'){instance.timeline_windows[0].duration=600;f.target.object.geometry.userData.MMD.rigidBodies=Array.from({length:200},(_,boneIndex)=>({boneIndex,type:2}));}
  await assert.rejects(buildTimelinePhysics(f.options));assert.equal(f.disposed,0);
 }
});
