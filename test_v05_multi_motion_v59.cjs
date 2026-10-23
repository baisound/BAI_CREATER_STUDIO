const assert=require('node:assert/strict');
require('./studio/v05/js/multi-model-motion-v59.js');
const {createCoordinator,activeAt}=global.BAIStudioMultiMotionV59;
require('./studio/v05/js/shared-scene-v57.js');
const {createHost}=global.BAIStudioSharedSceneV57;
require('./studio/v05/js/multi-model-runtime-v58.js');
const {createController}=global.BAIStudioMultiModelV58;
function root(){
  const v=()=>({set(){}});return {position:v(),rotation:v(),scale:v(),visible:true};
}
(async()=>{
  let renders=0;const tracked=[];
  const scene={add(){},remove(){}};
  const host=createHost({scene,camera:{},renderer:{render(){renders++;}}});
  const modelInstances=new Map();
  const controller=createController({
    host,
    async loadInstance({instanceId}){
      const rec={root:root(),poses:[],disposed:false,resetPose(){this.poses.push('rest')},dispose(){this.disposed=true;}};
      modelInstances.set(instanceId,rec);return rec;
    }
  });
  const xyz={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
  const inst=['A','B'].map(id=>({id,asset_id:'same',asset:{id:'same'},available:true,transform:xyz,visible:true}));
  await controller.reconcile({project_id:'P',revision:1,instances:inst});
  const players=new Map();
  const runtime=createCoordinator({controller,async loadMotion({row,target}){
    const p={time:[],seek(t){this.time.push(t);target.poses.push(t)},dispose(){this.disposed=true}};
    players.set(row.clip_id,p);return p;
  }});
  const rows=[{clip_id:'c1',asset_id:'m1',target_scene_instance_id:'A',motion_asset:{id:'m1'},status:'ready',motion_format:'GLB',start:0,duration:5},
              {clip_id:'c2',asset_id:'m2',target_scene_instance_id:'B',motion_asset:{id:'m2'},status:'ready',motion_format:'GLB',start:2,duration:7}];
  await runtime.reconcile({project_id:'P',arrangement_revision:1,rows});
  let x=runtime.seek(3.5);
  assert.equal(x.errors.length,0);
  assert.equal(renders,1,'one shared render');
  assert.deepEqual(players.get('c1').time,[3.5]);
  assert.deepEqual(players.get('c2').time,[1.5]);
  assert.notEqual(controller.getLoaded('A'),controller.getLoaded('B'));
  runtime.seek(7);
  assert.equal(players.get('c1').time.length,1,'ended clip must not be updated');
  assert.equal(players.get('c2').time.at(-1),5);
  assert.equal(modelInstances.get('A').poses.at(-1),'rest');
  assert.throws(()=>activeAt([...rows,{...rows[0],clip_id:'x'}],1),/Overlapping/);
  runtime.dispose();controller.dispose();
  assert.equal(players.get('c1').disposed,true);
  assert.equal(modelInstances.get('A').disposed,true);
  console.log('v59 coordinated evaluation tests PASS (independent time, one render, rest, disposal)');
})().catch(e=>{console.error(e);process.exitCode=1});
