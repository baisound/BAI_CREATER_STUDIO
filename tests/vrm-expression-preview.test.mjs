import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVrmExpressionPreview} from '../studio/v05/js/vrm-expression-preview.mjs';

test('VRM morph binds use source mesh/node indexes and restore exact previous values',()=>{
  const face={isMesh:true,morphTargetInfluences:[0.2,0]};
  const node={traverse(callback){callback(face);}};
  const model={format:'VRM',vrmTargets:{meshes:new Map([[3,[face]]]),nodes:new Map([[8,node]])}};
  const result=applyVrmExpressionPreview(model,[
    {mesh:3,index:0,weight:0.5},{node:8,index:0,weight:0.4}],0.5);
  assert.equal(face.morphTargetInfluences[0],0.65);
  assert.equal(result.targets.length,1);
  result.restore();assert.equal(face.morphTargetInfluences[0],0.2);
  assert.throws(()=>applyVrmExpressionPreview(model,[
    {mesh:3,index:0,weight:1},{mesh:3,index:99,weight:1}],0.8),/対象モーフ/);
  assert.equal(face.morphTargetInfluences[0],0.2,'failure does not leave partial preview');
  assert.throws(()=>applyVrmExpressionPreview(model,[],0.8),/実バインド/);
});
