const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('studio/v05/js/asset-runtime-v18.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function ctx(){const c={Map,Set,console,BAIStudioLiveMotion:{attach:()=>()=>{}}};vm.createContext(c);vm.runInContext(code,c);return c.BAIStudioAssetRuntime;}
const assets=[{id:'model1',category:'model',available:true},{id:'motion1',category:'motion',available:true}];
const clips=[{id:'clip1',asset_id:'motion1',track:'motion',start:0,duration:5,target_model_id:'model1'}];
(async()=>{
let a=ctx(), modelCalls=0, motionCalls=0, disposed=0;
a.setModelLoader(async()=>{modelCalls++;return {seek(){},dispose(){disposed++}}});
a.setLoader(async({targetPreview,targetModelId})=>{assert.equal(targetModelId,'model1');assert.equal(typeof targetPreview.seek,'function');motionCalls++;return {seek(){}}});
let r=await a.reconcile({project_id:'one',clips,assets});assert.equal(r.connected,1);assert.equal(modelCalls,1);assert.equal(motionCalls,1);
r=await a.reconcile({project_id:'one',clips,assets});assert.equal(modelCalls,1);assert.equal(motionCalls,1);
a.detachAll();assert.equal(disposed,1);assert.equal(a.status().targets.length,0);
let b=ctx();b.setLoader(async()=>({seek(){}}));r=await b.reconcile({project_id:'one',clips,assets});assert.equal(r.connected,0);assert.ok(r.issues.some(x=>x.reason==='model_loader_not_registered'));
let c=ctx();let resolve; c.setModelLoader(()=>new Promise(r=>resolve=r));c.setLoader(async()=>({seek(){}}));let pending=c.reconcile({project_id:'one',clips,assets});await tick();c.detachAll();resolve({seek(){},dispose(){disposed++}});r=await pending;assert.equal(r.stale,true);assert.equal(c.status().targets.length,0);
assert.throws(()=>a.setModelLoader(5),/modelLoader must be a function/);
console.log('stage21: 6 checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
