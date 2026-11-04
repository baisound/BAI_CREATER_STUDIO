'use strict';
// LIP-001 owner decision 2026-11-04: the 3D view (seekScene) and the preview/MP4
// capture (captureFrame) both apply the adopted lip curve through applySavedFace,
// which ramps an SRT boundary over one 30 fps VMD frame using the source morph
// value sampled at the neighbouring VMD frames, then seeks back to the shown time.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const uiFile=path.join(__dirname,'..','studio','v05','js','multi-model-ui-v58.js');
const ui=fs.readFileSync(uiFile,'utf8');
const moduleUrl=name=>pathToFileURL(path.join(__dirname,'..','studio','v05','js',name)).href;

function extractFaceApplier(){
  const start=ui.indexOf('function seekSourceMorphs(');
  const end=ui.indexOf('async function loadLipAdoptions(');
  assert.ok(start>0&&end>start,'applySavedFace block not found');
  return ui.slice(start,end);
}

function sourceAt(frame){return frame<=60?.2+.4*frame/60:.6;}

async function harness(){
  const face=await import(moduleUrl('pmx-face-keys-v96.js'));
  const overlay=await import(moduleUrl('pmx-lip-overlay-v199.mjs'));
  const mesh={morphTargetDictionary:{'あ':0,'まばたき':1},morphTargetInfluences:[0,0]};
  const object={traverse(fn){fn(mesh);}};
  const seeks=[];
  const motionCoordinator={seek(seconds){
    seeks.push(seconds);
    mesh.morphTargetInfluences[0]+=sourceAt(seconds*30);
    mesh.morphTargetInfluences[1]+=.25;
    return {errors:[]};
  }};
  const cueTracks=[{startMs:1000,endMs:1500,records:[
    {name:'あ',frame:30,weight:.8},{name:'あ',frame:60,weight:.2}]}];
  const env={
    sceneSnapshot:{instances:[{id:'m1'}],face_keys:[]},
    controller:{getLoaded:id=>id==='m1'?{format:'PMX',object}:null},
    motionCoordinator,
    lipAdoptions:{tracks:[{instanceId:'m1',status:'ready',cueTracks}]},
    viewport:{invalidate(){}},
  };
  const factory=new Function('env','resetMorphs','morphValues','setMorphValue','applyFaceKeys',
    'evaluateLipCueTracks',
    'const {sceneSnapshot,controller,motionCoordinator,lipAdoptions,viewport}=env;\n'+
    extractFaceApplier()+'\nreturn applySavedFace;');
  const applySavedFace=factory(env,face.resetMorphs,face.morphValues,face.setMorphValue,
    face.applyFaceKeys,overlay.evaluateLipCueTracks);
  function show(seconds){
    // What seekScene and captureFrame do before applySavedFace.
    face.resetMorphs(object);seeks.length=0;
    motionCoordinator.seek(seconds);
    const missing=applySavedFace(seconds);
    return {missing,mouth:mesh.morphTargetInfluences[0],blink:mesh.morphTargetInfluences[1],
      seeks:[...seeks]};
  }
  return {show,overlay,cueTracks};
}

test('3D view and capture share applySavedFace',()=>{
  const seek=ui.slice(ui.indexOf('function seekScene('),ui.indexOf('async function sampleFootContact('));
  assert.match(seek,/applySavedFace\(seconds\)/);
  const capture=ui.slice(ui.indexOf('captureFrame(frame,fps,width,height){'));
  assert.match(capture.slice(0,1500),/applySavedFace\(frame\/fps\)/);
  assert.match(extractFaceApplier(),/evaluateLipCueTracks\(adopted\?\.cueTracks,seconds,\s*\(name,frame\)=>sourceAt\(instance\.id,name,frame\)\)/);
});

test('boundary ramp samples the source at both VMD frames and seeks back',async()=>{
  const {show,overlay,cueTracks}=await harness();
  // On the VMD grid: the hard SRT rule, no extra seeks.
  let shown=show(29/30);
  assert.ok(Math.abs(shown.mouth-sourceAt(29))<1e-12);
  assert.deepEqual(shown.seeks,[29/30]);
  shown=show(1);
  assert.ok(Math.abs(shown.mouth-.8)<1e-12);
  // Mid-ramp at 60 fps: straight line from source(F29) to .8 at F30.
  shown=show(59/60);
  assert.ok(Math.abs(shown.mouth-(sourceAt(29)+.8)/2)<1e-12,String(shown.mouth));
  assert.deepEqual(shown.seeks,[59/60,29/30,59/60]);
  assert.ok(Math.abs(shown.blink-.25)<1e-12,'other morphs come from the final seek only');
  // End ramp: adopted value at F44 to the source at F45.
  shown=show(44.5/30);
  const lip44=.8-.6*14/30;
  assert.ok(Math.abs(shown.mouth-(lip44+sourceAt(45))/2)<1e-12);
  assert.deepEqual(shown.seeks,[44.5/30,45/30,44.5/30]);
  // Outside the cue the source stays untouched.
  shown=show(.5);
  assert.ok(Math.abs(shown.mouth-sourceAt(15))<1e-12);
  assert.deepEqual(shown.seeks,[.5]);
  assert.deepEqual(shown.missing,[]);
  // Same values as the pure evaluator used by the Python equality test.
  for(const seconds of [59/60,1,1.25,44.5/30,1.5]){
    const pure=overlay.evaluateLipCueTracks(cueTracks,seconds,(_name,frame)=>sourceAt(frame)).get('あ')
      ??sourceAt(seconds*30);
    assert.ok(Math.abs(show(seconds).mouth-pure)<1e-12,String(seconds));
  }
});

test('a ramp without a source sampler is refused instead of guessing',async()=>{
  const {evaluateLipCueTracks}=await import(moduleUrl('pmx-lip-overlay-v199.mjs'));
  const cues=[{startMs:1000,endMs:1500,records:[{name:'あ',frame:30,weight:.8}]}];
  assert.throws(()=>evaluateLipCueTracks(cues,59/60),/元動作のモーフ値/);
  assert.equal(evaluateLipCueTracks(cues,1.2).get('あ'),.8);
  assert.equal(evaluateLipCueTracks(cues,.5).size,0);
});
