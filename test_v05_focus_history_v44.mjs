import assert from 'node:assert/strict';
import {normalizeFocusHistory,jumpToFocusFrame} from './studio/v05/js/focus-report-history-v44.js';
const records=normalizeFocusHistory({reports:[{id:'focus-1',startFrame:0,endFrame:10,fps:30,maximumError:4,problemFrames:[{frame:5,reason:'blur',error:4}],evaluatedAgainstGPU:false},{id:'focus-2',startFrame:11,endFrame:20,fps:60,maximumError:0,problemFrames:[],evaluatedAgainstGPU:false}]});
assert.equal(records[0].id,'focus-2');assert.equal(records[1].problems[0].frame,5);
assert.equal(records[1].gpuVerified,false);
assert.throws(()=>normalizeFocusHistory({}),TypeError);
let t=null;jumpToFocusFrame({frame:15,fps:30,seek:s=>t=s});assert.equal(t,.5);
assert.throws(()=>jumpToFocusFrame({frame:-1,fps:30,seek:()=>{}}),TypeError);
console.log('v44 focus history tests: 6 assertions PASS');
