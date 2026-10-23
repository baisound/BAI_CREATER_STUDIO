const assert=require('node:assert/strict');
require('./studio/v05/js/multi-model-runtime-v58.js');
const {createController,validTransform}=globalThis.BAIStudioMultiModelV58;
function tr(x=0){return {position:[x,0,0],rotation:[0,0,0],scale:[1,1,1]};}
function fakeHost(){
 const entries=new Map();let draws=0, closed=false, freed=[];
 return {
  entries,freed,
  mount(id,root,opt){assert(!entries.has(id));entries.set(id,{root,...opt});return ()=>this.unmount(id);},
  unmount(id){const item=entries.get(id);if(!item)return false;entries.delete(id);item.dispose();freed.push(id);return true;},
  setTransform(id,t){const item=entries.get(id);assert(item);item.root.transform=structuredClone(t);},
  evaluateAt(t){draws++;for(const [id,e] of entries)e.evaluate(t,[]);return {time:t,rendered:true,draws,evaluated:entries.size};},
  close(){closed=true;for(const id of [...entries.keys()])this.unmount(id);},
  get closed(){return closed;}
 };
}
const item=(id,assetId='same')=>({id,asset_id:assetId,asset:{id:assetId,format:'GLB'},available:true,visible:true,transform:tr(1)});
(async()=>{
 const host=fakeHost(),loaded=[],disposed=[],errors=[];
 const c=createController({host,loadInstance:async({instanceId,asset})=>{
  const root={instanceId,visible:true,geometry:{id:instanceId}};
  loaded.push(root);return {root,dispose(){disposed.push(instanceId)}};
 },onError:e=>errors.push(e)});
 const r=await c.reconcile({project_id:'P',revision:1,instances:[item('A'),item('B')]});
 assert.equal(r.loaded,2);assert.notStrictEqual(loaded[0],loaded[1]);
 assert.notStrictEqual(host.entries.get('A').root.geometry,host.entries.get('B').root.geometry);
 assert.deepEqual(host.entries.get('B').root.transform.position,[1,0,0]);
 await c.reconcile({project_id:'P',revision:2,instances:[{...item('A'),transform:tr(5)},item('B')]});
 assert.deepEqual(host.entries.get('A').root.transform.position,[5,0,0]);
 assert.deepEqual(host.entries.get('B').root.transform.position,[1,0,0]);
 assert.equal(loaded.length,2);
 assert.equal(c.seek(2.3).evaluated,2);
 await c.reconcile({project_id:'P',revision:3,instances:[item('B')]});
 assert.equal(c.status().loaded,1);assert.deepEqual(disposed,['A']);
 await c.reconcile({project_id:'Q',revision:0,instances:[item('C')]});
 assert.deepEqual(disposed,['A','B']);assert.equal(c.status().projectId,'Q');
 c.dispose();assert.equal(host.closed,true);assert.deepEqual(disposed,['A','B','C']);
 assert.throws(()=>c.seek(1),/closed/);
 assert.equal(validTransform({position:[1,2,NaN],rotation:[0,0,0],scale:[1,1,1]}),false);
 assert.equal(validTransform(tr()),true);
 console.log('v58 independent, refresh, removal, project switch, render contract PASS');
 const host2=fakeHost();
 let finish;
 const pending=new Promise(resolve=>finish=resolve);
 const stale=[];
 const c2=createController({host:host2,loadInstance:async({instanceId})=>{
  if(instanceId==='late')await pending;
  return {root:{},dispose(){stale.push(instanceId);}};
 }});
 const old=c2.reconcile({project_id:'old',revision:0,instances:[item('late')]});
 await Promise.resolve();await Promise.resolve();
 const newer=c2.reconcile({project_id:'new',revision:0,instances:[]});
 finish();await old;await newer;
 assert.deepEqual(stale,['late']);assert.equal(c2.status().loaded,0);
 c2.dispose();
 console.log('v58 stale asynchronous load cleanup PASS');
 const host3=fakeHost();
 const c3=createController({host:host3,loadInstance:async()=>{throw Error('decode failed')}});
 const report=await c3.reconcile({project_id:'P',revision:0,instances:[item('bad')]});
 assert.equal(report.loaded,0);assert.equal(report.issues[0].reason,'load_failed');c3.dispose();
 console.log('v58 per-model failure isolation PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
