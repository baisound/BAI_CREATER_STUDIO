const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('studio/v05/js/remote-playhead-v24.js','utf8'),context);
const create=context.BAIStudioRemotePlayhead.create;
(async()=>{
 const applied=[];let remote={seconds:4,revision:1};
 const sync=create({read:async()=>remote,apply:async(s,r,id)=>applied.push({s,r,id})});
 sync.select('A',0);assert.equal(await sync.poll(),true);assert.equal(applied.length,1);
 assert.equal(await sync.poll(),false);remote={seconds:7,revision:2};assert.equal(await sync.poll(),true);
 sync.suspend(true);remote={seconds:9,revision:3};assert.equal(await sync.poll(),false);sync.suspend(false);
 sync.localWrite(3);assert.equal(await sync.poll(),false);
 let finish;const pending=create({read:()=>new Promise(resolve=>finish=resolve),apply:()=>{throw Error('stale applied')}});
 pending.select('A',0);const run=pending.poll();pending.select('B',0);finish({seconds:55,revision:4});assert.equal(await run,false);
 assert.equal(pending.status().projectId,'B');
 const html=fs.readFileSync('studio/v05/index.html','utf8');assert(html.indexOf('remote-playhead-v24.js')<html.indexOf('asset-workflow-v06.js'));
 const ui=fs.readFileSync('studio/v05/js/asset-workflow-v06.js','utf8');assert.match(ui,/remoteSync\?\.poll\(\)/);assert.match(ui,/remoteSync\?\.suspend\(true\)/);
 console.log('PASS 10 remote playhead assertions');
})().catch(e=>{console.error(e);process.exitCode=1});
