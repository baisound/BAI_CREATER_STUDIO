'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');

const sourceRoot = process.env.BAI_REAL_MMD_DATA;
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath = sourceRoot && path.join(sourceRoot, 'mmd', 'A', modelName);
const motions = [
  {name:'狐面物理確認用_頭振り_F000-0300.vmd',times:[0,4,9,4,0,9],minDuration:9,port:8895},
  {name:'神っぽいな.vmd',times:[0,4,90,180,90,0,180],minDuration:180,port:8910}
];
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

for (const {name:motionName,times,minDuration,port} of motions) {
  const motionPath = sourceRoot && path.join(sourceRoot, 'mmd', 'vmd', motionName);
  const exists = modelPath && motionPath && fs.existsSync(modelPath) && fs.existsSync(motionPath);
test(`PMX no-op pre-IK evaluator matches the existing path: ${motionName}`,
  {skip: !exists && 'BAI_REAL_MMD_DATA に実素材がありません', timeout: 300000}, async () => {
    const before = [digest(modelPath), digest(motionPath)];
    const metadata = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'mmd_assets.json'), 'utf8'));
    const entries = metadata.A.filter(e => e.name === modelName || e.name.startsWith('tex/'));
    const seed = {'mmd_assets.json': JSON.stringify({A: entries, B: [], vmd: [{name: motionName, size: fs.statSync(motionPath).size}]})};
    for (const entry of entries) seed[`mmd/A/${entry.name}`] = fs.readFileSync(path.join(sourceRoot, 'mmd', 'A', ...entry.name.split('/')));
    seed[`mmd/vmd/${motionName}`] = fs.readFileSync(motionPath);
    const server = await harness.startServer({port, seed});
    let browser, page;
    try {
      browser = await server.launchBrowser();
      page = await server.newPage(browser);
      await page.goto(`${server.base}/studio/v05/index.html`);
      const samples = await page.evaluate(async ({modelName, motionName, times}) => {
        const [{loadLibs,loadModel}, {loadVmdClip}, {createPlayer}] = await Promise.all([
          import('/studio/js/viewport/model-loader.js'),
          import('/studio/js/motion/vmd.js'),
          import('/studio/js/motion/player.js'),
        ]);
        const libs = await loadLibs();
        const loaded = await loadModel({id:`mmd:A:${modelName}`,name:modelName,format:'PMX',kind:'A',source:'mmd'}, libs);
        const mesh = loaded.object;
        const clip = await loadVmdClip(libs, `/api/mmd-file/vmd/${encodeURIComponent(motionName)}`, mesh);
        const player = createPlayer(libs.THREE,libs.MMDAnimationHelper);
        player.setModel(mesh,'PMX');
        player.applyVmd(clip,'real-vmd');
        const take = () => {
          mesh.updateMatrixWorld(true);
          return {bones: mesh.skeleton.bones.map(b => ({name:b.name,local:[...b.position.toArray(),...b.quaternion.toArray()],world:[...b.matrixWorld.elements]})),
            morphs: [...(mesh.morphTargetInfluences||[])]};
        };
        const rows=[];
        for (const time of times) {
          player.setPmxPoseModifier(null); player.seek(time); const baseline=take();
          player.setPmxPoseModifier(() => {}); player.seek(time); const alternate=take();
          player.setPmxPoseModifier(null); player.seek(time); const returnToBaseline=take();
          rows.push({time,baseline,alternate,returnToBaseline});
        }
        player.dispose();
        return {duration:clip.duration,rows};
      }, {modelName,motionName,times});
      assert.ok(samples.duration >= minDuration,
        `VMD duration ${samples.duration} is shorter than required ${minDuration}s`);
      const distance = (a,b) => {
        assert.equal(a.bones.length,b.bones.length);
        assert.equal(a.morphs.length,b.morphs.length);
        let max=0,where='';
        for(let i=0;i<a.bones.length;i++){
          assert.equal(a.bones[i].name,b.bones[i].name);
          for(const kind of ['local','world'])for(let j=0;j<a.bones[i][kind].length;j++){
            const d=Math.abs(a.bones[i][kind][j]-b.bones[i][kind][j]);
            if(d>max){max=d;where=`${a.bones[i].name}.${kind}[${j}]`;}
          }
        }
        for(let i=0;i<a.morphs.length;i++){
          const d=Math.abs(a.morphs[i]-b.morphs[i]);if(d>max){max=d;where=`morph[${i}]`;}
        }
        return {max,where};
      };
      const results=samples.rows.map(row => ({time:row.time,
        alternate:distance(row.baseline,row.alternate),
        returnToBaseline:distance(row.baseline,row.returnToBaseline)}));
      console.log(JSON.stringify({model_sha256:before[0],motion_sha256:before[1],duration:samples.duration,
        bones:samples.rows[0].baseline.bones.length,morphs:samples.rows[0].baseline.morphs.length,results}));
      for(const row of results){
        assert.ok(row.alternate.max<1e-5,`no-op alternate differs at ${row.time}: ${JSON.stringify(row.alternate)}`);
        assert.ok(row.returnToBaseline.max<1e-5,`A-B-A differs at ${row.time}: ${JSON.stringify(row.returnToBaseline)}`);
      }
      harness.assertNoErrors(page);
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      assert.deepEqual([digest(modelPath),digest(motionPath)],before,'PMX/VMD originals changed');
    }
  });
}
