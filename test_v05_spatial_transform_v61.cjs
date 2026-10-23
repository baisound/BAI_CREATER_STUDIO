// v61 shared XYZ transform runtime contract (node:test, no WebGL dependency).
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const spatialModule={exports:{}};
new Function('module','globalThis',fs.readFileSync('./studio/v05/js/spatial-transform-v61.js','utf8'))(spatialModule,globalThis);
const {normalize,createRegistry,TYPES}=spatialModule.exports;
const base=()=>({position:[1,2,3],rotation:[0,0,0],scale:[1,1,1]});
function entry(registry,id,type='model',config={}){
 let value=base(), commits=0, locked=false, failures=false;
 const unregister=registry.register(id,{
  type,read:()=>value,
  apply:next=>value=next,
  locked:()=>locked,
  commit:async()=>{if(failures)throw Error('API rejected');commits++;}
 });
 return {unregister,get:()=>value,commits:()=>commits,lock:()=>locked=true,fail:()=>failures=true};
}
test('all spatial object kinds share a single XYZ schema',()=>{
 assert.deepEqual(TYPES,['model','camera','light','effect','environment']);
 const r=createRegistry();
 for(const type of TYPES)entry(r,type,type);
 assert.equal(r.ids().length,5);
 r.select('camera');assert.equal(r.snapshot().type,'camera');
});
test('numeric XYZ editing commits once and preserves other axes',async()=>{
 const r=createRegistry(),e=entry(r,'model1');r.select('model1');
 r.begin();r.axis('position',2,8);r.axis('rotation',1,45);await r.finish();
 assert.deepEqual(e.get(),{position:[1,2,8],rotation:[0,45,0],scale:[1,1,1]});
 assert.equal(e.commits(),1);
});
test('undoable drag transaction can be canceled without committing',()=>{
 const r=createRegistry(),e=entry(r,'fx','effect');r.select('fx');
 r.begin();r.axis('scale',0,2);r.cancel();
 assert.deepEqual(e.get(),base());assert.equal(e.commits(),0);
});
test('persistence conflicts restore the prior XYZ values',async()=>{
 const r=createRegistry(),e=entry(r,'light','light');r.select('light');
 e.fail();r.begin();r.axis('position',0,10);
 await assert.rejects(r.finish(),/API rejected/);
 assert.deepEqual(e.get(),base());
});
test('locked objects prevent all edits',()=>{
 const r=createRegistry(),e=entry(r,'cam','camera');e.lock();
 assert.throws(()=>r.begin('cam'),/locked/);
 assert.deepEqual(e.get(),base());
});
test('invalid axes, scale and NaN are rejected and can be canceled',()=>{
 const r=createRegistry(),e=entry(r,'model');r.begin('model');
 assert.throws(()=>r.axis('position',3,5,'model'));
 assert.throws(()=>r.axis('scale',0,0,'model'),/Scale/);
 assert.throws(()=>r.axis('position',0,Number.NaN,'model'));
 r.cancel('model');assert.deepEqual(e.get(),base());
});
test('unregister clears selection and stale refs cannot be reused',()=>{
 const r=createRegistry(),e=entry(r,'a');r.select('a');
 e.unregister();assert.equal(r.current(),null);
 assert.throws(()=>r.snapshot('a'),/not registered/);
});
test('normalization does not mutate input and rejects malformed transform',()=>{
 const a=base(),b=normalize(a);b.position[0]=99;
 assert.equal(a.position[0],1);
 assert.throws(()=>normalize({position:[1,2,3],rotation:[0,0,0],scale:[1,-1,1]}));
});

test('a pending API commit blocks overlapping edits until completion', async()=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  let value=base();
  const r=createRegistry();
  r.register('a',{type:'model',read:()=>value,apply:v=>{value=v;},commit:()=>pending});
  r.begin('a');
  r.axis('position',0,50,'a');
  const commit=r.finish('a');
  assert.throws(()=>r.begin('a'),/already active/);
  release();
  await commit;
  r.begin('a');r.cancel('a');
  assert.equal(value.position[0],50);
});
test('locale keys are identical and cover all spatial object kinds',()=>{
  const jp=JSON.parse(fs.readFileSync('./studio/v05/locales/jp.json','utf8')).spatialV61;
  const en=JSON.parse(fs.readFileSync('./studio/v05/locales/en.json','utf8')).spatialV61;
  assert.deepEqual(Object.keys(jp).sort(),Object.keys(en).sort());
  assert.ok(['model','camera','light','effect','environment'].every(type=>jp['type_'+type]&&en['type_'+type]));
  assert.ok(Object.values(jp).every(x=>typeof x==='string'&&x));
});
