const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const editor=fs.readFileSync('camera.js','utf8');
test('every VMD diagnostic sample uses frame-specific local pose, not cached current frame',()=>{
 assert.match(editor,/function diagnosticCameraPose\(f\)/);
 assert.match(editor,/return nativeLocalSampler\.preview\(f\)/);
 assert.match(editor,/function focusDiagnosticAt\(f,point,focusOverride=null\)\{const pose=diagnosticCameraPose\(f\)/);
 assert.match(editor,/const override=point&&\$\('focus-follow-bone'\)\.checked\?window\.BAICameraFocusConsistency\.diagnose\(\{frame:f,pose:diagnosticCameraPose\(f\)/);
});
test('missing local VMD track is not silently substituted with project camera',()=>{
 assert.match(editor,/if\(!nativeLocalSampler\)throw Error\(/);
 assert.match(editor,/診断エラー: /);
});
test('frame-specific bone target is evaluated and failure is explicit',()=>{
 assert.match(editor,/bai-camera-query-focus-target/);
 assert.match(editor,/固定ガイドへ置換せず診断を中止/);
});
