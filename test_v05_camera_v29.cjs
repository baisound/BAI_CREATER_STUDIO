const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={globalThis:null};context.globalThis=context;
vm.runInNewContext(fs.readFileSync('studio/v05/js/camera-sync-v29.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('studio/v05/js/camera-lens-apply-v29.js','utf8'),context);
(async()=>{
let frames=[],states=[];
const rt=context.BAIStudioCameraV29.create({fps:30,evaluate:async frame=>{frames.push(frame);return {pose:{focalLength:50,fStop:2.8,focusDistance:3}}},onState:s=>states.push(s)});
await rt.seek(1.5);assert.equal(frames[0],45);assert.equal(states[0].lens.fStop,2.8);
rt.setFrameRate(24);await rt.seek(1.5);assert.equal(frames[1],36);
assert.throws(()=>rt.setFrameRate(0),/FPS/);await assert.rejects(rt.seek(-1),/time/);
const lens=context.BAIStudioCameraLensV29.create();let focal=0;const cam={userData:{},setFocalLength:v=>focal=v};const nav={};const off=lens.register(cam,{navigationCamera:nav});assert.equal(lens.apply(states[0]),true);assert.equal(focal,50);assert.equal(cam.userData.baiFStop,2.8);assert.equal(cam.userData.baiFocusDistance,3);off();assert.equal(lens.apply(states[0]),false);
let release;const stale=context.BAIStudioCameraV29.create({evaluate:()=>new Promise(r=>release=r),onState:()=>{throw Error('stale')}});let pending=stale.seek(2);stale.setFrameRate(30);release({pose:{}});assert.equal(await pending,null);
console.log('PASS v29: fps, frame mapping, lens metadata, isolation, invalid inputs, stale response');
})().catch(e=>{console.error(e);process.exitCode=1});
