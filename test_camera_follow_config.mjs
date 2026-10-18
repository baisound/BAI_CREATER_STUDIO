import test from 'node:test';import assert from 'node:assert/strict';
import {classifyBone,parseOffset,validFollowConfig,pickBone} from './camera_follow_config.js';
test('humanoid names and Japanese aliases',()=>{assert.equal(classifyBone('J_Head'),'head');assert.equal(classifyBone('頭'),'head');assert.equal(classifyBone('UpperChest'),'chest');assert.equal(classifyBone('pelvis'),'hips');assert.equal(classifyBone('unknown'),null)});
test('offset validates finite values and bounds',()=>{assert.deepEqual(parseOffset(['1','-2','0.5']),[1,-2,.5]);for(const v of [['',2,3],[1,'NaN',3],[1,2,Infinity],[10001,0,0]])assert.throws(()=>parseOffset(v))});
test('persisted config is normalized',()=>{assert.deepEqual(validFollowConfig({boneName:'head',role:'head',offset:[0,1,2],enabled:true}),{boneName:'head',role:'head',offset:[0,1,2],enabled:true});assert.equal(validFollowConfig({enabled:'true'}).enabled,false)});
test('exact bone wins then role fallback',()=>{const nodes=[{name:'pelvis'},{name:'head'},{name:'J_Head'}];assert.equal(pickBone(nodes,{boneName:'J_Head',role:'head'}),nodes[2]);assert.equal(pickBone(nodes,{boneName:'missing',role:'head'}),nodes[1])});
