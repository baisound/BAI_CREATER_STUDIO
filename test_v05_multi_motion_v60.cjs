// Stage 60: on-disk GLB skeletal animation fixture + controller lifecycle regressions.
// Does NOT replace browser/WebGL/Windows validation.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./studio/v05/js/shared-scene-v57.js');
require('./studio/v05/js/multi-model-runtime-v58.js');
require('./studio/v05/js/multi-model-motion-v59.js');
const {createHost} = globalThis.BAIStudioSharedSceneV57;
const {createController} = globalThis.BAIStudioMultiModelV58;
const {createCoordinator} = globalThis.BAIStudioMultiMotionV59;

function loadGltfFixture(){
  const data=fs.readFileSync(path.join(__dirname,'tests/fixtures/synthetic_test_model.glb'));
  assert.equal(data.readUInt32LE(0),0x46546c67);
  assert.equal(data.readUInt32LE(4),2);
  let cursor=12, json,buffer;
  while(cursor<data.length){
    const len=data.readUInt32LE(cursor),type=data.toString('ascii',cursor+4,cursor+8);
    cursor+=8;
    if(type==='JSON')json=JSON.parse(data.toString('utf8',cursor,cursor+len).trim());
    if(type==='BIN\0')buffer=data.subarray(cursor,cursor+len);
    cursor+=len;
  }
  assert(json&&buffer,'real GLB must contain a JSON and BIN chunk');
  assert(json.skins?.length&&json.animations?.length,'real fixture needs skin and motion');
  const animation=json.animations[0], translation=animation.channels.find(ch=>ch.target.path==='translation');
  assert(translation,'fixture must animate bone position');
  function accessor(index){
    const def=json.accessors[index],view=json.bufferViews[def.bufferView];
    assert.equal(def.componentType,5126);
    const n=def.type==='SCALAR'?1:def.type==='VEC3'?3:0;
    assert(n>0);
    const off=(view.byteOffset||0)+(def.byteOffset||0);
    return Array.from({length:def.count},(_,i)=>
      Array.from({length:n},(_,j)=>buffer.readFloatLE(off+(i*n+j)*4)));
  }
  const sampler=animation.samplers[translation.sampler];
  const times=accessor(sampler.input).map(x=>x[0]),positions=accessor(sampler.output);
  assert(times.length>=2&&times.length===positions.length);
  return {boneName:json.nodes[translation.target.node].name,
    duration:times.at(-1),sample(sec){
      const clamped=Math.max(times[0],Math.min(times.at(-1),sec));
      for(let i=0;i<times.length-1;i++){
        if(clamped<=times[i+1]){
          const f=(clamped-times[i])/(times[i+1]-times[i]);
          return positions[i].map((x,k)=>x+(positions[i+1][k]-x)*f);
        }
      }
      return positions.at(-1).slice();
    }};
}
function v3(){return {set(x,y,z){this.xyz=[x,y,z];}};}
function t(x=0){return {position:[x,0,0],rotation:[0,0,0],scale:[1,1,1]};}
function item(id,asset){return {id,asset_id:asset,asset:{id:asset,format:'GLB'},available:true,
  visible:true,transform:t(id==='A'?1:2)};}
function row(id,target,start=0,duration=5){
  return {clip_id:id,asset_id:id,target_scene_instance_id:target,status:'ready',
    motion_format:'GLB',motion_asset:{id,format:'GLB'},start,duration};
}
async function run(){
  const fixture=loadGltfFixture();
  const models=new Map(),playerInstances=new Map(),draws=[];
  const onError=[];
  const host=createHost({
    scene:{add(){},remove(){}},camera:{},
    renderer:{render(){draws.push('render');}},
    onError:e=>onError.push(e)
  });
  const controller=createController({
    host,async loadInstance({instanceId,asset}){
      const target={root:{position:v3(),rotation:v3(),scale:v3(),visible:true},
        bone:{name:fixture.boneName,xyz:fixture.sample(0).slice()},
        assetId:asset.id,disposed:false,resetCount:0,
        resetPose(){this.resetCount++;this.bone.xyz=fixture.sample(0).slice();},
        dispose(){this.disposed=true;}};
      models.set(instanceId,target);
      return target;
    }
  });
  const coordinator=createCoordinator({
    controller,onError:e=>onError.push(e),
    async loadMotion({row:motionRow,target}){
      const instance={disposed:false,seekCalls:[],
        seek(seconds){
          this.seekCalls.push(seconds);
          target.bone.xyz=fixture.sample(seconds);
        },dispose(){this.disposed=true;}
      };
      playerInstances.set(motionRow.clip_id,instance);return instance;
    }
  });
  await controller.reconcile({project_id:'P',revision:1,
    instances:[item('A','same'),item('B','same')]});
  let plan={project_id:'P',arrangement_revision:1,rows:[row('d1','A'),row('d2','B',1,4)]};
  await coordinator.reconcile(plan);
  const modelA=controller.getLoaded('A'),modelB=controller.getLoaded('B');
  assert.notStrictEqual(modelA,modelB,'two models must never share a skeletal state');
  assert.notStrictEqual(modelA.bone,modelB.bone);
  coordinator.seek(2);
  assert.equal(draws.length,1,'evaluate two models, then draw exactly once');
  assert.deepEqual(modelA.bone.xyz,fixture.sample(2));
  assert.deepEqual(modelB.bone.xyz,fixture.sample(1));
  const moved=[...modelA.bone.xyz];coordinator.seek(0.25);
  assert.notDeepEqual(modelA.bone.xyz,moved,'seeking backwards must re-evaluate the pose');
  coordinator.seek(5);
  assert.equal(modelA.resetCount>0,true,'ended clip resets pose');
  assert.deepEqual(modelA.bone.xyz,fixture.sample(0));

  // Replace same instance ID with a different 3D source: old player MUST die.
  const oldPlayer=playerInstances.get('d1');
  await controller.reconcile({project_id:'P',revision:2,
    instances:[item('A','replacement'),item('B','same')]});
  assert(modelA.disposed,'former skeleton must be disposed');
  await coordinator.reconcile(plan);
  assert.equal(oldPlayer.disposed,true,'motion still bound to old skeleton must be disposed');
  const newPlayer=playerInstances.get('d1');
  assert.notStrictEqual(newPlayer,oldPlayer,'fresh model must get a fresh player');
  coordinator.seek(3);
  assert.deepEqual(controller.getLoaded('A').bone.xyz,fixture.sample(3));

  // Adjacent clips on the same skeleton must explicitly transfer pose ownership.
  const transition={...plan,arrangement_revision:3,
    rows:[row('d1','A',0,5),row('d3','A',5,3),row('d2','B',1,4)]};
  await coordinator.reconcile(transition);
  coordinator.seek(4.75);
  const switchResetCount=controller.getLoaded('A').resetCount;
  coordinator.seek(5.25);
  assert(controller.getLoaded('A').resetCount>switchResetCount,
    'switching motion clips on the same skeleton restores rest pose first');
  assert.deepEqual(playerInstances.get('d3').seekCalls,[0.25]);

  // Remove a track without removing its model. Rest pose must be restored.
  const newA=controller.getLoaded('A');
  const beforeRest=newA.resetCount;
  await coordinator.reconcile({...plan,arrangement_revision:2,rows:[row('d2','B',1,4)]});
  assert(newA.resetCount>beforeRest,'track removal must clear its previous pose');
  coordinator.seek(2);
  assert.deepEqual(newA.bone.xyz,fixture.sample(0));

  // Seek failure is isolated; model restores, B still updates.
  const failing=playerInstances.get('d2');
  failing.seek=()=>{modelB.bone.xyz=[999,999,999];throw Error('animation decode error');};
  const resets=modelB.resetCount;
  const bad=coordinator.seek(2.5);
  assert.equal(bad.errors.length,1,'per-model failure must be reported');
  assert(modelB.resetCount>resets,'failed model reset to rest');
  assert.deepEqual(modelB.bone.xyz,fixture.sample(0));

  // Project switch clears all players and model instance resources.
  await coordinator.reconcile({project_id:'Q',arrangement_revision:0,rows:[]});
  await controller.reconcile({project_id:'Q',revision:0,instances:[]});
  assert.equal(failing.disposed,true);
  assert.equal(models.get('A').disposed,true);
  assert.equal(models.get('B').disposed,true);
  coordinator.dispose();controller.dispose();

  // Asynchronous loading race: skeleton replacement while loading a player.
  let completeLoad, disposedOrphan=false;
  const deferred=new Promise(resolve=>{completeLoad=resolve;});
  const host2=createHost({scene:{add(){},remove(){}},camera:{},
    renderer:{render(){}}});
  const controller2=createController({host:host2,
    async loadInstance({instanceId,asset}){
      return {root:{position:v3(),rotation:v3(),scale:v3()},assetId:asset.id,
        dispose(){},resetPose(){}};
    }});
  await controller2.reconcile({project_id:'P',revision:1,instances:[item('A','source1')]});
  const c2=createCoordinator({controller:controller2,loadMotion:()=>deferred});
  const waiting=c2.reconcile({project_id:'P',arrangement_revision:1,rows:[row('late','A')]});
  await Promise.resolve();
  await controller2.reconcile({project_id:'P',revision:2,instances:[item('A','source2')]});
  completeLoad({seek(){throw Error('orphan seek must not run');},
    dispose(){disposedOrphan=true;}});
  const race=await waiting;
  assert.equal(disposedOrphan,true,'late loading result must be destroyed');
  assert.equal(c2.status().loadedClips.length,0,'orphan must not be attached');
  assert(race.issues.some(x=>x.reason==='model_changed_during_load'));
  c2.dispose();controller2.dispose();
  console.log('Stage 60 PASS: actual GLB fixture, independent models, backward seek, clip switches, swaps, stale loader isolation and cleanup');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
