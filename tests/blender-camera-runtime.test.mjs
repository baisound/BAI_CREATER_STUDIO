import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import h from './helpers/studio-harness.cjs';
import {createBlenderCameraSampler} from '../studio/v05/js/blender-camera-runtime.mjs';

test('camera cuts are half-open, units change depth/orthographic span, invalid time refuses',()=>{
  const generated=spawnSync(h.python,['-X','utf8','-c','import json;from tests.helpers.blender_camera_data import track;print(json.dumps(track()))'],{encoding:'utf8',cwd:h.root});
  assert.equal(generated.status,0,generated.stderr);const track=JSON.parse(generated.stdout);
  const a=createBlenderCameraSampler(THREE,track,{scale:1,offset:[0,0,0]});
  const b=createBlenderCameraSampler(THREE,track,{scale:2,offset:[3,4,5]});
  assert.equal(a(.5-1e-6).type,'PERSP');assert.equal(a(.5).type,'ORTHO');
  const original=a(.25),scaled=b(.25);
  assert.equal(scaled.world[12],original.world[12]*2+3);assert.equal(scaled.world[13],original.world[13]*2+4);
  assert.equal(scaled.world[14],original.world[14]*2+5);assert.equal(scaled.projection[14],original.projection[14]*2);
  assert.equal(b(.75).projection[0],a(.75).projection[0]/2);
  assert.throws(()=>a(-1),/元区間外/);assert.throws(()=>a(2),/元区間外/);
});

for(const name of ['blender-camera-fixture','blender-camera-linux']){
  const root=path.resolve(h.root,'../test-temp',name),file=path.join(root,'camera.json');
  test(`actual Blender reference matrices preserve source time, sensor fit, shift, parent/constraint: ${name}`,
    {skip:!fs.existsSync(file)&&'生成した実Blender fixtureがありません'},()=>{
      const data=JSON.parse(fs.readFileSync(file,'utf8')),reference=JSON.parse(fs.readFileSync(path.join(root,'reference.json'),'utf8'));
      const mapping={scale:1,offset:[0,0,0]},sampler=createBlenderCameraSampler(THREE,data,mapping);
      for(const row of reference.references){
        const pose=sampler(row.frame/data.sample_fps),world=new THREE.Matrix4().fromArray(pose.world);
        const projection=new THREE.Matrix4().fromArray(pose.projection).multiply(world.clone().invert());
        for(const [i,p] of reference.points.entries()){
          const actual=new THREE.Vector3(p[0],p[2],-p[1]).applyMatrix4(projection).toArray();
          assert.ok(Math.max(...actual.map((n,k)=>Math.abs(n-row.ndc[i][k])))<.00002,`${name} frame ${row.frame}`);
        }
        assert.equal(pose.camera,row.camera);
      }
    });
}
