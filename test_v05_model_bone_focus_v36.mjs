import assert from 'node:assert/strict';
import {createModelBoneFocus,findFocusObject} from './studio/v05/js/model-bone-focus-v36.js';
class Vector3 {constructor(){this.x=0;this.y=0;this.z=0;}}
const bone={name:'Head',isBone:true,updateWorldMatrix(){},getWorldPosition(v){v.x=1;v.y=2;v.z=3;return v;}};
const root={updateMatrixWorld(){},traverse(cb){cb(bone);}};
const details=[],diagnostics=[];
const runtime=createModelBoneFocus({THREE:{Vector3},emit:d=>details.push(d),diagnostic:d=>diagnostics.push(d)});
assert.equal(findFocusObject(root,'Head'),bone);
assert.equal(runtime.update({seconds:1,frame:30}).reason,'target_not_selected');
const detach=runtime.bindModel('m1',root,'p1');runtime.setTarget('m1','Head');
assert.equal(runtime.update({seconds:1,frame:30,projectId:'p2'}).reason,'wrong_project');
assert.deepEqual(runtime.update({seconds:1,frame:30,projectId:'p1'}).detail.worldPosition,[1,2,3]);
assert.equal(details.length,1);
runtime.setTarget('m1','Missing');assert.equal(runtime.update({seconds:1,frame:30,projectId:'p1'}).reason,'bone_not_found');
detach();assert.equal(runtime.update({seconds:1,frame:30,projectId:'p1'}).reason,'model_not_loaded');
runtime.dispose();assert.equal(runtime.update({seconds:1,frame:30,projectId:'p1'}).reason,'disposed');
assert.ok(diagnostics.length>=4);
console.log('v36 model/bone focus: PASS (8 assertions)');
