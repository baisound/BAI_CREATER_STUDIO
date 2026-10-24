import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {analyzeMouthMorphs,analyzePmxBytes,strengthCandidates} from '../tools/pmx_morph_analysis.mjs';

const morph=(name,type,elements)=>({name,panel:3,type,elements});
test('PMX mouth offsets, overlap and manual-required rules use moved vertex IDs',()=>{
  const pmx={metadata:{vertexCount:8},morphs:[
    morph('A',1,[{index:0,position:[0.1,0,0]},{index:1,position:[0.3,0,0]}]),
    morph('I',1,[{index:1,position:[0.2,0,0]},{index:2,position:[0.4,0,0]}]),
    morph('Zero',1,[{index:3,position:[0,0,0]}]),
    morph('Group',0,[{index:0,ratio:0.5}]),
    morph('Bone',2,[]),
    {name:'eye',panel:2,type:1,elements:[{index:1,position:[1,0,0]}]},
  ]};
  const result=analyzeMouthMorphs(pmx);
  assert.equal(result.morphs.length,5);
  assert.equal(result.morphs[0].median,0.2);
  assert.equal(result.morphs[0].p95,0.29);
  assert.equal(result.morphs[2].manualRequired,true);
  assert.equal(result.morphs[3].manualRequired,true);
  assert.equal(result.morphs[4].manualRequired,true);
  assert.deepEqual(result.overlaps,[{leftId:0,rightId:1,sharedVertices:1,unionVertices:3,jaccard:1/3}]);
  const candidate=strengthCandidates(result,{A:0,I:1,U:2},0);
  assert.equal(candidate.entries.A.candidate,1);
  assert.ok(Math.abs(candidate.entries.I.candidate-2/3)<1e-12);
  assert.equal(candidate.entries.U.candidate,null);
  const clipped=strengthCandidates(result,{A:0},1);
  assert.equal(clipped.entries.A.candidate,1);
  assert.equal(clipped.entries.A.clipped,true);
  assert.throws(()=>strengthCandidates(result,{A:0},2),/Reference morph/);
  assert.throws(()=>strengthCandidates(result,{A:99},0),/Unknown mouth morph/);
  assert.throws(()=>analyzeMouthMorphs({metadata:{vertexCount:1},morphs:[morph('bad',1,[{index:2,position:[1,0,0]}])]}),/Invalid PMX/);
});

test('real PMX mouth measurements are finite and source remains unchanged',t=>{
  const root=process.env.BAI_REAL_MMD_DATA;
  if(!root){t.skip('BAI_REAL_MMD_DATA is not set');return;}
  for(const relative of ['mmd/A/Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx',
    'mmd/B/avatar-front-garment-v04.pmx']){
    const source=path.join(root,relative),bytes=fs.readFileSync(source);
    const before=crypto.createHash('sha256').update(bytes).digest('hex');
    const analysis=analyzePmxBytes(bytes);
    assert.equal(analysis.modelHash,before);
    assert.match(analysis.analysisHash,/^[0-9a-f]{64}$/);
    if(relative.includes('/A/')){
      assert.equal(analysis.morphs.length,48);
      assert.ok(analysis.morphs.some(row=>row.name==='あ'&&row.type===0&&row.manualRequired));
      assert.ok(analysis.morphs.some(row=>row.type===1&&row.affectedVertices>0));
      const upper=analysis.morphs.find(row=>row.name==='口上');
      const lower=analysis.morphs.find(row=>row.name==='口下');
      const group=analysis.morphs.find(row=>row.name==='あ');
      const strength=strengthCandidates(analysis,{A:upper.id,I:lower.id,U:group.id},upper.id);
      assert.equal(strength.entries.A.candidate,1);
      assert.ok(Math.abs(strength.entries.I.candidate-upper.median/lower.median)<1e-12);
      assert.equal(strength.entries.U.candidate,null);
      assert.equal(strength.entries.U.manualRequired,true);
    }else{
      assert.equal(analysis.morphs.length,0);
      assert.equal(analysis.overlaps.length,0);
    }
    assert.ok(analysis.overlaps.every(row=>row.jaccard>=0&&row.jaccard<=1),relative);
    assert.ok(analysis.morphs.every(row=>Number.isFinite(row.median)&&Number.isFinite(row.p95)),relative);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before);
    t.diagnostic(JSON.stringify({relative,sha256:before,mouthMorphs:analysis.morphs.length,
      overlaps:analysis.overlaps.length,aa:analysis.morphs.find(row=>row.name==='あ')}));
  }
});
