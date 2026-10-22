const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');
const ctx={globalThis:null};ctx.globalThis=ctx;vm.runInNewContext(fs.readFileSync('studio/v05/js/camera-sync-v25.js','utf8'),ctx);
const factory=ctx.BAIStudioCameraSync.create;
(async()=>{
 let frames=[],poses=[];
 const runtime=factory({frameRate:30,fetchEvaluation:async f=>{frames.push(f);return {pose:{x:f}}},onPose:p=>poses.push(p.x)});
 await runtime.seek(2);assert.equal(frames[0],60);assert.equal(poses[0],60);
 await assert.rejects(runtime.seek(-1),/Invalid/);
 runtime.stop();assert.equal(await runtime.seek(3),null);runtime.start();await runtime.seek(1);assert.equal(poses.at(-1),30);
 let release;const stale=factory({fetchEvaluation:()=>new Promise(r=>release=r),onPose:()=>{throw Error('stale applied')}});
 const pending=stale.seek(2);stale.stop();release({pose:{x:0}});assert.equal(await pending,null);
 const html=fs.readFileSync('studio/v05/index.html','utf8');assert(html.includes('camera-sync-v25.js'));
 const persisted=fs.readFileSync('studio/v05/js/persisted-seek-v23.js','utf8');assert(persisted.includes('BAIStudioCameraRuntime?.seek'));
 console.log('PASS camera v25: frame mapping, invalid time, stop/start, stale response, integration references');
})().catch(e=>{console.error(e);process.exitCode=1});
