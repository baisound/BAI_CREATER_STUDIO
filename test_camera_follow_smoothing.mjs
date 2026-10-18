import test from 'node:test';import assert from 'node:assert/strict';
import {advanceFollow,validateSmoothing} from './camera_follow_smoothing.js';
test('initial target and zero smoothing snap',()=>{let s=advanceFollow(null,[0,0,0],0,30,.3);assert.deepEqual(s.target,[0,0,0]);assert.deepEqual(advanceFollow(s,[4,0,0],1,30,0).target,[4,0,0])});
test('lag on continuous motion, seek and reverse snap',()=>{let s=advanceFollow(null,[0,0,0],0,30,.5);s=advanceFollow(s,[3,0,0],1,30,.5);assert.ok(s.target[0]>0&&s.target[0]<3);assert.deepEqual(advanceFollow(s,[9,0,0],30,30,.5).target,[9,0,0]);assert.deepEqual(advanceFollow(s,[7,0,0],0,30,.5).target,[7,0,0])});
test('validation rejects nonfinite and out of bounds',()=>{for(const x of ['NaN','',-1,6,Infinity])assert.throws(()=>validateSmoothing(x));assert.equal(validateSmoothing('0.25'),.25)});
