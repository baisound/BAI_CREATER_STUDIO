const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class E {constructor(type,opt){this.type=type;this.detail=opt?.detail}}
const handlers={};const window={addEventListener:(n,f)=>{(handlers[n]??=[]).push(f)},dispatchEvent(e){(handlers[e.type]||[]).forEach(f=>f(e))}};
vm.runInNewContext(fs.readFileSync('studio/v05/js/timeline-engine-bridge.js','utf8'),{window,CustomEvent:E});
assert.equal(window.BAIStudioEngineBridge.status().connected,false);
assert.throws(()=>window.BAIStudioEngineBridge.register({}),/requires seek/);
let seen=[];const unsubscribe=window.BAIStudioEngineBridge.register({seek:(t,clips)=>{seen.push([t,clips.length])}});
assert.equal(window.BAIStudioEngineBridge.status().connected,true);
window.dispatchEvent(new E('bai:timeline-seek',{detail:{seconds:2.5,tracks:[{id:'1'}]}}));
assert.deepEqual(seen,[[2.5,1]]);
unsubscribe();assert.equal(window.BAIStudioEngineBridge.status().connected,false);
window.dispatchEvent(new E('bai:timeline-seek',{detail:{seconds:9,tracks:[]}}));assert.equal(seen.length,1);
const src=fs.readFileSync('studio/v05/js/timeline-v04.js','utf8');
assert.match(src,/window\.BAIStudioTimeline=/);
assert.match(src,/bai:timeline-seek/);
assert.match(src,/setSeek\(Math\.min\(duration\(\)/);
console.log('Stage14 bridge: 7 assertions PASS');
