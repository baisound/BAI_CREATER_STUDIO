const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const coreScript=fs.readFileSync(__dirname+'/camera_bundle_core.js','utf8');
const script=fs.readFileSync(__dirname+'/camera_project_bundle_ui.js','utf8');
const buttons={};const messages=[];let mutations=0;
for(const id of ['bundle-save','bundle-load','bundle-status'])buttons[id]={disabled:false,textContent:''};
const ctx={document:{getElementById:id=>buttons[id]},window:{confirm:()=>true,dispatchEvent:()=>{mutations++;return true}},CustomEvent:class{},fetch:async()=>({ok:true,json:async()=>ctx.payload}),console};
vm.runInNewContext(coreScript,ctx);
vm.runInNewContext(script,ctx);
async function checkInvalid(payload){ctx.payload=payload;mutations=0;await buttons['bundle-load'].onclick();assert.equal(mutations,0);assert.match(buttons['bundle-status'].textContent,/失敗/);}
(async()=>{
 const base={complete:true,combination:{},camera:{duration:20,keys:[]},workspace:{frame:10,asset:null,clip:null}};
 await checkInvalid({...base,camera:{duration:0,keys:[]}});
 await checkInvalid({...base,workspace:{frame:21,asset:null,clip:null}});
 await checkInvalid({...base,workspace:{frame:1,asset:null,clip:1}});
 await checkInvalid({...base,workspace:null});
 console.log('PASS: malformed restore is rejected before any workspace/camera mutation');
})().catch(e=>{console.error(e);process.exitCode=1});
