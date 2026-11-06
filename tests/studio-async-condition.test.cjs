'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {waitForAsync}=require('./helpers/studio-harness.cjs');
const page={evaluate:fn=>fn()};
test('async false is never accepted as a successful browser condition',async()=>{
 await assert.rejects(waitForAsync(page,async()=>false,null,{timeout:10,interval:1}),/did not become true/);
 await assert.rejects(waitForAsync({evaluate:()=>new Promise(()=>{})},async()=>false,null,{timeout:10}),/did not become true/);
});
test('async condition is awaited on every retry and its errors are not hidden',async()=>{
 let calls=0;
 assert.equal(await waitForAsync(page,async()=>++calls>=3,null,{timeout:100,interval:1}),true);
 assert.equal(calls,3);
 await assert.rejects(waitForAsync(page,async()=>{throw Error('saved data is invalid');}),/saved data is invalid/);
});
