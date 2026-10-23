const assert=require('node:assert/strict');

function vec(){return {values:null,set(...v){this.values=v;}};}
const scene={objects:new Set(),add(x){this.objects.add(x);},remove(x){this.objects.delete(x);}};
const renderer={n:0,render(){this.n++;}};
const nav={};
let errors=[];
(async () => {
await import('./studio/v05/js/shared-scene-v57.js');
const {createHost}=globalThis.BAIStudioSharedSceneV57;
const host=createHost({scene,renderer,camera:nav,onError:x=>errors.push(x)});
const root=()=>({position:vec(),rotation:vec(),scale:vec()});
let a=root(),b=root(),calls=[];
const ua=host.mount('A',a,{evaluate:(t,clips)=>calls.push(['A',t,clips.length])});
host.mount('B',b,{evaluate:(t,clips)=>{calls.push(['B',t,clips.length]);throw Error('failure B')}});
assert.equal(scene.objects.size,2);
host.setTransform('A',{position:[1,2,3],rotation:[0,90,0],scale:[1,1,1]});
assert.deepEqual(a.position.values,[1,2,3]);
assert.equal(a.rotation.values[1],Math.PI/2);
assert.equal(b.position.values,null);
assert.throws(()=>host.mount('C',a),/Duplicate/);
const result=host.evaluateAt(2,{'A':[{},{}],'B':[{}]});
assert.equal(result.evaluated,2);assert.equal(result.errors.length,1);
assert.equal(renderer.n,1);assert.equal(calls.length,2);
const token=host.nextGeneration();assert(host.acceptsGeneration(token));
assert.equal(host.acceptsGeneration(token-1),false);
ua();assert.equal(host.size(),1);assert.equal(scene.objects.size,1);
host.close();assert.equal(host.size(),0);assert.throws(()=>host.evaluateAt(2),/closed/);
console.log('v57 shared scene host tests PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
