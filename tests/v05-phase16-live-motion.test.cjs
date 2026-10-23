const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const handlers=new Map();
  const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:()=>{},CustomEvent:class{constructor(name,props){this.type=name;this.detail=props.detail}}};
  const context=vm.createContext({window,Map,Set,Promise,Number,TypeError,RangeError,Error});
  for(const f of ['timeline-engine-bridge.js','live-motion-adapter.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../studio/v05/js',f),'utf8'),context);
  return {window,handlers};
}
test('loaded GLB/VMD preview receives clip-local seek and invalidates viewport',async()=>{
 const {window}=setup(), got=[];let renders=0;
 const detach=window.BAIStudioLiveMotion.attach({clipId:'dance-1',preview:{duration:3,seek:x=>got.push(x)},invalidate:()=>renders++});
 await window.BAIStudioEngineBridge.seek({seconds:12,tracks:[{id:'dance-1',type:'motion',offsetSeconds:2.25}]});
 assert.deepEqual(got,[2.25]);assert.equal(renders,1);detach();
 await window.BAIStudioEngineBridge.seek({seconds:14,tracks:[{id:'dance-1',type:'motion',offsetSeconds:2.5}]});assert.equal(got.length,1);
});
test('clip offsets are bounded to preview duration',async()=>{const {window}=setup();let time;
 window.BAIStudioLiveMotion.attach({clipId:'vmd',preview:{duration:2,seek:x=>time=x}});
 await window.BAIStudioEngineBridge.seek({seconds:20,tracks:[{id:'vmd',type:'motion',offsetSeconds:5}]});assert.ok(time<2&&time>1.99);
});
test('replacement unregisters stale runtime and detachment is idempotent',async()=>{const {window}=setup();let a=0,b=0;
 const first=window.BAIStudioLiveMotion.attach({clipId:'x',preview:{seek:()=>a++}});
 const second=window.BAIStudioLiveMotion.attach({clipId:'x',preview:{seek:()=>b++}});
 first();await window.BAIStudioEngineBridge.seek({seconds:1,tracks:[{id:'x',type:'motion',offsetSeconds:1}]});assert.equal(a,0);assert.equal(b,1);
 second();second();assert.equal(window.BAIStudioLiveMotion.activeClipIds().length,0);
});
test('invalid runtime and bridge unavailable fail explicitly',()=>{const {window}=setup();assert.throws(()=>window.BAIStudioLiveMotion.attach({clipId:'x',preview:{}}),/seek/);assert.throws(()=>window.BAIStudioLiveMotion.attach({clipId:'',preview:{seek(){}}}),/clipId/)});
test('detachAll unregisters every clip',async()=>{const {window}=setup();let calls=0;for(const id of ['a','b'])window.BAIStudioLiveMotion.attach({clipId:id,preview:{seek(){calls++}}});window.BAIStudioLiveMotion.detachAll();await window.BAIStudioEngineBridge.seek({seconds:1,tracks:['a','b'].map(id=>({id,type:'motion',offsetSeconds:1}))});assert.equal(calls,0)});
