import assert from 'node:assert/strict';
import {analyzeFocusFrame,installFocusVisualAudit} from './studio/v05/js/focus-visual-audit-v40.js';
import {createFocusDiagnostic} from './studio/v05/js/focus-diagnostic-v39.js';
class FakeWindow {
  listeners=new Map();events=[];
  addEventListener(name,cb){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(cb)}
  removeEventListener(name,cb){this.listeners.get(name)?.delete(cb)}
  dispatchEvent(e){this.events.push(e);for(const f of this.listeners.get(e.type)||[])f(e)}
  fire(type,detail){this.dispatchEvent({type,detail})}
}
globalThis.CustomEvent=class {constructor(type,{detail}){this.type=type;this.detail=detail}};
const win=new FakeWindow(),installed=installFocusVisualAudit(win);
const snap=(projectId)=>({projectId,frame:10,seconds:1,fps:10,pose:{position:[0,0,0]},lens:{focalLengthMm:50,fStop:2.8,focusDistance:5}});
const target=projectId=>({projectId,frame:10,seconds:1,worldPosition:[0,0,5]});
win.fire('bai:camera-focus-snapshot',snap('A'));
win.fire('bai:camera-focus-target-position',target('B'));
assert.equal(installed.current().ok,false,'same frame from different project must not match');
win.fire('bai:camera-focus-snapshot',snap('B'));
win.fire('bai:camera-focus-target-position',target('B'));
assert.equal(installed.current().ok,true);
win.fire('bai:camera-focus-target-position',{frame:10,seconds:1,worldPosition:[0,0,5]});
assert.equal(installed.current().ok,false,'missing project cannot reuse cache');
const diagnostic=createFocusDiagnostic();
diagnostic.setSnapshot(snap('A'));
diagnostic.setTarget(target('A'));
assert.equal(diagnostic.current()?.ok,true);
diagnostic.setTarget(target('B'));
assert.equal(diagnostic.current(),null,'failed re-evaluation clears prior good result');
installed.dispose();
assert.equal(win.listeners.get('bai:camera-focus-snapshot').size,0);
console.log('v52 focus lifecycle/project isolation: 5 checks passed');
