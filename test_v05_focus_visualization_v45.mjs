import assert from 'node:assert/strict';
import {buildFocusPlot} from './studio/v05/js/focus-visualization-v45.js';
const p=buildFocusPlot({startFrame:10,endFrame:20,problems:[{frame:18,error:2.1,reason:'blur'},{frame:12,error:null,reason:'missing'},{frame:22,error:5}]});
assert.equal(p.observed,2);assert.equal(p.unobserved,9);assert.deepEqual(p.points.map(x=>x.frame),[12,18]);assert.equal(p.max,2.1);
assert.throws(()=>buildFocusPlot({startFrame:9,endFrame:3}),/invalid_focus_range/);
assert.equal(buildFocusPlot({startFrame:5,endFrame:5}).unobserved,1);
console.log('v45 focus plot tests PASS (5 checks)');
