import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSegment,removeSegment,createSegmentHistory} from '../studio/v05/js/lip-draft-edit.mjs';
const row=(a='7',b='12')=>({startFrame:a,endFrame:b,mouthShape:'U',weight:'0.37'});
test('integer midpoint preserves interval, shape, weight and originals',()=>{
  const rows=[row(),row('14','16')],before=structuredClone(rows),split=splitSegment(rows,0);
  assert.deepEqual(split,[row('7','9'),row('9','12'),row('14','16')]);assert.deepEqual(rows,before);
  assert.deepEqual(removeSegment(split,1),[row('7','9'),row('14','16')]);assert.equal(split.length,3);
});
test('one-frame/invalid bounds, last row and 1000 row limit refuse mutations',()=>{
  for(const value of [row('7','8'),row('','12'),row('7.2','12'),row('-1','12'),row('7','1000001')])assert.throws(()=>splitSegment([value],0));
  assert.throws(()=>splitSegment(Array.from({length:1000},()=>row()),0));assert.throws(()=>removeSegment([row()],0));
  assert.throws(()=>splitSegment([row()],-1));assert.throws(()=>removeSegment([row(),row()],2));
});
test('local history clones values, caps at32, truncates redo and resets per cue',()=>{
  const h=createSegmentHistory(),a=[row()];h.reset(a);a[0].weight='0.99';assert.equal(h.differs([row()]),false);
  h.commit(splitSegment([row()],0));assert.equal(h.canUndo,true);assert.deepEqual(h.undo(),[row()]);assert.equal(h.canRedo,true);
  const result=h.redo();result[0].weight='0.8';assert.equal(h.differs(splitSegment([row()],0)),false);
  h.undo();h.commit([row('7','11')]);assert.equal(h.canRedo,false);
  h.reset([row()]);for(let i=0;i<40;i++)h.commit([{...row(),weight:String(i)}]);let count=0;while(h.undo())count++;assert.equal(count,32);
  h.reset([row('40','50')]);assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);
});
