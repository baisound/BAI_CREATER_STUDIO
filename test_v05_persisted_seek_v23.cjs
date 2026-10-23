const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const script=fs.readFileSync('studio/v05/js/persisted-seek-v23.js','utf8');
const calls=[];const ctx={BAIStudioEngineBridge:{seek:async d=>calls.push(d)}};vm.createContext(ctx);vm.runInContext(script,ctx);
const s=ctx.BAIStudioPersistedSeek;
(async()=>{
 await s.configure('p1',[{id:'dance1',track:'motion',name:'dance',start:5,duration:10},{id:'audio1',track:'audio',start:0,duration:30}]);
 await s.evaluate(6);assert.equal(calls.at(-1).tracks.length,1);assert.equal(calls.at(-1).tracks[0].offsetSeconds,1);
 await s.evaluate(15);assert.equal(calls.at(-1).tracks.length,0);
 await s.configure('p2',[]);assert.equal(calls.at(-1).tracks.length,0);
 assert.throws(()=>s.activeAt([],NaN));assert.throws(()=>s.configure('',[]));
 const ui=fs.readFileSync('studio/v05/js/asset-workflow-v06.js','utf8');
 assert.match(ui,/PersistedSeek\?\.configure/);assert.match(ui,/PersistedSeek\?\.evaluate/);
 assert.match(fs.readFileSync('studio/v05/index.html','utf8'),/persisted-seek-v23\.js/);
 console.log('PASS 8 persisted timeline assertions');
})().catch(e=>{console.error(e);process.exitCode=1});
