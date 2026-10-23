import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installModelBoneFocus} from './studio/v05/js/model-bone-focus-v36.js';
const listeners=new Map(), emitted=[];
const win={addEventListener:(k,f)=>{const list=listeners.get(k)||[];list.push(f);listeners.set(k,list);},removeEventListener:(k,f)=>listeners.set(k,(listeners.get(k)||[]).filter(x=>x!==f)),dispatchEvent:e=>{emitted.push(e);for(const f of listeners.get(e.type)||[])f(e);}};
class CustomEvent {constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
const context={window:win,CustomEvent,console};vm.runInNewContext(fs.readFileSync('studio/v05/js/camera-focus-consistency-v33.js','utf8'),context);
const camera=context.window.BAIStudioCameraFocusV33.create();
const snapshot=camera.accept({projectId:'p1',seconds:1,frame:30,fps:30,pose:{position:[0,0,0]},lens:{focalLengthMm:50,fStop:2.8,focusDistance:3}});
assert.equal(snapshot.projectId,'p1');
const THREE={Vector3:class {constructor(){this.x=0;this.y=0;this.z=0;}}};
const focus=installModelBoneFocus({win,THREE});
const bone={name:'Head',isBone:true,getWorldPosition(v){v.x=0;v.y=0;v.z=3;return v;}};
const model={traverse(f){f(bone);},updateMatrixWorld(){}};
focus.bindModel('model1',model,'p1');focus.setTarget('model1','Head');
win.dispatchEvent(new CustomEvent('bai:camera-focus-snapshot',{detail:snapshot}));
const count=()=>emitted.filter(e=>e.type==='bai:camera-focus-target-position').length;
for(const detail of [{seconds:1,frame:29,projectId:'p1'},{seconds:1,frame:30,projectId:'p2'},{seconds:.9,frame:30,projectId:'p1'}]){win.dispatchEvent(new CustomEvent('bai:model-pose-evaluated',{detail}));assert.equal(count(),0);}
win.dispatchEvent(new CustomEvent('bai:model-pose-evaluated',{detail:{seconds:1,frame:30,projectId:'p1'}}));
assert.equal(count(),1);
assert.equal(emitted.find(e=>e.type==='bai:camera-focus-target-position').detail.frame,30);
focus.dispose();
win.dispatchEvent(new CustomEvent('bai:model-pose-evaluated',{detail:{seconds:1,frame:30,projectId:'p1'}}));assert.equal(count(),1);
assert.match(fs.readFileSync('studio/v05/js/actual-motion-loader-v22.js','utf8'),/snapshot\.seconds===context\.globalSeconds/);
console.log('PASS v51: project identity, frame mismatch rejection, stale pose rejection, detach, notification frame');
