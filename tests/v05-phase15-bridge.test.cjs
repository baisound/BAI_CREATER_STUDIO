const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('studio/v05/js/timeline-engine-bridge.js', 'utf8');
function setup() {
  const listeners = new Map();
  class CustomEvent { constructor(type, opts) {this.type=type; this.detail=opts.detail;} }
  const window = {addEventListener(type,cb){const xs=listeners.get(type)||[];xs.push(cb);listeners.set(type,xs);}, dispatchEvent(evt){for(const cb of listeners.get(evt.type)||[])cb(evt);}};
  vm.runInNewContext(source,{window,CustomEvent,Map,Set,Promise,Number,RangeError,TypeError,String});
  return {window, bridge:window.BAIStudioEngineBridge};
}
test('validates clip type and seekable runtime',()=>{const {bridge}=setup();assert.throws(()=>bridge.registerEngine('invalid','a',{seek(){}}));assert.throws(()=>bridge.registerEngine('motion','a',{}));});
test('routes timeline-local seconds to the correct live motion and camera runtimes',async()=>{
  const {bridge}=setup(), calls=[];
  bridge.registerEngine('motion','m1',{seek(t){calls.push(['motion',t]);}});
  bridge.registerEngine('camera','c1',{seek(t){calls.push(['camera',t]);}});
  await bridge.seek({seconds:12,tracks:[{id:'m1',type:'motion',offsetSeconds:4},{id:'c1',type:'camera',offsetSeconds:1},{id:'other',type:'motion',offsetSeconds:2}]});
  assert.deepEqual(calls,[['motion',4],['camera',1]]);assert.equal(bridge.status().lastSeek,12);
});
test('dispose registration does not remove replacement instance',()=>{const {bridge}=setup();const off=bridge.registerEngine('motion','a',{seek(){}});bridge.registerEngine('motion','a',{seek(){}});off();assert.equal(bridge.status().registeredEngines.length,1);});
test('disconnect clears registered runtimes',()=>{const {bridge}=setup();bridge.registerEngine('audio','s1',{seek(){}});bridge.disconnect();assert.equal(bridge.status().connected,false);});
test('reports runtime failures',async()=>{const {window,bridge}=setup();let message='';window.addEventListener('bai:engine-seek-error',e=>message=e.detail.message);bridge.registerEngine('motion','a',{seek(){throw new Error('runtime failed');}});await bridge.seek({seconds:1,tracks:[{id:'a',type:'motion',offsetSeconds:1}]});assert.match(message,/runtime failed/);});
