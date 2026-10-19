const assert=require('node:assert/strict');const {modes,ease}=require('./camera_easing');
for(const mode of modes){for(const t of [0,.1,.25,.5,.75,.9,1]){const v=ease(mode,t,[.2,.1,.8,.9]);assert(Number.isFinite(v),mode);}}
assert.equal(ease('linear',.25),.25);assert.equal(ease('hold',.75),0);assert(Math.abs(ease('custom',.5,[0,0,1,1])-.5)<.0001);
console.log('camera easing tests OK');
