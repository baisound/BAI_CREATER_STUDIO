'use strict';
// Tail completion is a distinct, hash-pinned candidate in an isolated project.
// Optional engineering adoption uses a separate synthetic SRT.
// The owner's 54 real lyric readings remain missing/unconfirmed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const root = process.env.BAI_REAL_MMD_DATA;
const motionPath = process.env.BAI_REAL_LIP_VMD;
const srtPath = process.env.BAI_REAL_LIP_SRT;
const vocalPath = process.env.BAI_REAL_LIP_VOCAL;
const reportPath = process.env.BAI_REAL_LIP_REPORT;
const fps = Number(process.env.BAI_LIP_LONG_FPS || 30);
const candidatePath = process.env.BAI_LIP_TAIL_CANDIDATE;
const sourceMouth = !!candidatePath || process.env.BAI_LIP_LONG_MOUTH === 'source';
const modelName = 'Baisound-New-V5.0.0-B_新狐面差替_紐鈴物理_調整v6.pmx';
const modelPath = root && path.join(root, 'mmd/A', modelName);
const files = [modelPath, motionPath, srtPath, vocalPath, reportPath, ...(candidatePath ? [candidatePath] : [])];
const available = files.every(p => p && fs.existsSync(p));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const digest = p => sha(fs.readFileSync(p));
const post = (server, route, body) => fetch(server.base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function json(response, status = 200) { const text = await response.text(); assert.equal(response.status, status, text); return JSON.parse(text); }
function ff(args, input, maxBuffer = 16 * 1024 * 1024) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
function wavInfo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', file]);
  assert.equal(r.status, 0, r.stderr.toString()); return JSON.parse(r.stdout.toString());
}
function morphRows(raw) {
  const bones = raw.readUInt32LE(50), offset = 54 + bones * 111;
  const count = raw.readUInt32LE(offset), decoder = new TextDecoder('shift_jis');
  const rows = [];
  for (let i = 0; i < count; i++) {
    const o = offset + 4 + i * 23, name = raw.subarray(o, o + 15), end = name.indexOf(0);
    rows.push({ name: decoder.decode(end < 0 ? name : name.subarray(0, end)), frame: raw.readUInt32LE(o + 15), weight: raw.readFloatLE(o + 19) });
  }
  return rows;
}
function sample(rows, name, frame) {
  const keys = rows.filter(row => row.name === name).sort((a, b) => a.frame - b.frame);
  let a = keys[0]; if (!a || frame < a.frame) return a?.weight || 0;
  for (const b of keys.slice(1)) { if (b.frame >= frame) return a.weight + (b.weight - a.weight) * (frame - a.frame) / (b.frame - a.frame); a = b; }
  return a.weight;
}
function lagAt(reference, output, second) {
  const start = Math.round(second * 8000), length = 2400;
  let energy = 0; for (let i = 0; i < length; i++) energy += reference.readInt16LE((start + i) * 2) ** 2;
  const rms = Math.sqrt(energy / length); if (rms < 100) return null;
  let best = { lag: 0, correlation: -Infinity, rms };
  for (let lag = -400; lag <= 400; lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < length; i += 4) {
      const a = reference.readInt16LE((start + i) * 2), b = output.readInt16LE((start + i + lag) * 2);
      dot += a * b; aa += a * a; bb += b * b;
    }
    const correlation = dot / Math.sqrt(aa * bb || 1);
    if (correlation > best.correlation) best = { lag, correlation, rms };
  }
  return { second, ...best };
}
async function waitJob(server, id) {
  let job, phase; const deadline = Date.now() + 1200000;
  do {
    await new Promise(r => setTimeout(r, 1000)); job = await json(await fetch(`${server.base}/api/studio/v05/render/jobs?id=${id}`));
    if (job.phase !== phase) { phase = job.phase; console.log(JSON.stringify({ phase, status: job.status })); }
  } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
  assert.equal(job.status, 'succeeded', job.error); return job;
}
test(`real 229s vocal and 230s body VMD preserve ${candidatePath ? 'four-cue mouth candidate' : sourceMouth ? 'owner-selected existing mouth' : 'engineering lip adoption'} through a full saved MP4`,
  { skip: !available && 'Explicit real PMX/VMD/SRT/vocal/report inputs required', timeout: 1500000 }, async () => {
    assert.ok([30, 29.97, 60].includes(fps));
    const before = files.map(digest), rawMotion = fs.readFileSync(motionPath), rawSrt = fs.readFileSync(srtPath);
    assert.equal(before[0], '542a4daa561f0b0da578fc303af9b8c6dc4acdd8d380771a170e96e95a205488');
    assert.equal(before[1], '61ce920e647c38e30d3f9738259e9d56b3bcf2f165243a4ec08770c35f896939');
    assert.equal(before[2], '6f6015eb7bfaf74f386f2cfea187ce2d2084034bce107195e874e1e76cf46e27');
    assert.equal(before[3], '8a48e67e947dce8c1af4f53260b4cb6a5dcf47867f18e85a26d3ba2e8a034e8e');
    const originalRows = morphRows(rawMotion), vocalInfo = wavInfo(vocalPath), vocalDuration = Number(vocalInfo.format.duration);
    assert.equal(originalRows.length, 4760); assert.equal(Math.max(...originalRows.map(r => r.frame)), 6359);
    assert.equal(vocalDuration, 229.84175);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const excludedCues = report.cue_analysis.filter(row => !row.included).map(row => row.number);
    assert.deepEqual(excludedCues, [51, 52, 53, 54]);
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'mmd_assets.json'), 'utf8'));
    const modelFiles = metadata.A.filter(r => r.name === modelName || r.name.startsWith('tex/'));
    const protectedTextures = modelFiles.map(r => path.join(root, 'mmd/A', ...r.name.split('/')));
    const textureHashes = protectedTextures.map(digest);
    const candidateRaw = candidatePath ? fs.readFileSync(candidatePath) : null;
    const candidateRows = candidateRaw ? morphRows(candidateRaw) : null;
    if (candidateRaw) {
      assert.equal(sha(candidateRaw), 'b1dc33ace3d3802246423da644794c8e726404f3aab3ffa6c4ab1c6accefe0f7');
      assert.equal(candidateRows.length, 7465);
      const offset = 54 + rawMotion.readUInt32LE(50)*111;
      assert.deepEqual(candidateRaw.subarray(0,offset),rawMotion.subarray(0,offset));
      assert.deepEqual(candidateRaw.subarray(offset+4+7465*23),rawMotion.subarray(offset+4+4760*23));
      for (const row of originalRows) assert.deepEqual(candidateRows.find(r => r.name===row.name && r.frame===row.frame),row);
    }
    const playbackRows = candidateRows || originalRows;
    const motionName = path.basename(candidatePath || motionPath);
    const seed = { 'mmd_assets.json': JSON.stringify({ A: modelFiles, B: [], vmd: [{ name: motionName, size: (candidateRaw || rawMotion).length }] }),
      [`mmd/vmd/${motionName}`]: candidateRaw || rawMotion };
    if (candidatePath) { const name = path.basename(motionPath); const meta = JSON.parse(seed['mmd_assets.json']); meta.vmd.push({name,size:rawMotion.length}); seed['mmd_assets.json']=JSON.stringify(meta); seed[`mmd/vmd/${name}`]=rawMotion; }
    for (const row of modelFiles) seed[`mmd/A/${row.name}`] = fs.readFileSync(path.join(root, 'mmd/A', ...row.name.split('/')));
    const server = await harness.startServer({ port: fps === 30 ? 9136 : 9137, seed }); let browser, page;
    try {
      const id = (await json(await post(server, '/api/studio/v05/projects', { name: sourceMouth ? '実歌声長尺・Owner選択の既存VMD口形' : '実歌声長尺・検証母音採用（歌詞未採用）', kind: 'empty' }))).project.id;
      await json(await post(server, '/api/studio/v05/project/fps', { project_id: id, fps }));
      let scene = await json(await post(server, '/api/studio/v05/scene/instances', { project_id: id, action: 'add', revision: 0, asset_id: `mmd:A:${modelName}`,
        transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } }));
      const instance = scene.instances[0].id, asset = scene.instances[0].asset_id;
      const analysis = await json(await fetch(`${server.base}/api/studio/v05/pmx/morph-analysis?asset_id=${encodeURIComponent(asset)}`));
      const entries = { Closed: null, Rest: null };
      for (const [shape, name] of [['A','あ'], ['I','い'], ['U','う'], ['E','え'], ['O','お']]) {
        const morph = analysis.morphs.find(m => m.name === name); assert.ok(morph);
        entries[shape] = { morph_id: morph.id, morph_name: name, weight: 0.8 };
      }
      const map = await json(await post(server, '/api/studio/v05/pmx/morph-map', { project_id: id, revision: 0, action: 'set', model_asset_id: asset,
        model_hash: analysis.modelHash, analysis_hash: analysis.analysisHash, entries, confirmed: true }));
      const imported = await json(await fetch(`${server.base}/api/studio/v05/srt/import?${new URLSearchParams({ project_id: id, revision: '0', name: 'real-vocal-unconfirmed.srt', encoding: 'utf-8-bom' })}`,
        { method: 'POST', body: rawSrt }));
      assert.equal(imported.sources[0].entries.length, 54);
      const realSource = imported.sources[0];
      const windows = [[5,9,'あい'], [56,60,'うえ'], [112,116,'おあ'], [170,174,'いう'], [224,228,'えお']];
      let sources = imported;
      let reading = await json(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${id}`));
      let draft = await json(await fetch(`${server.base}/api/studio/v05/lip/drafts?project_id=${id}`));
      let lip = null, adoptedRows = [];
      if (!sourceMouth) {
        const stamp = seconds => `00:${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')},000`;
        const synthetic = Buffer.from(windows.map(([a,b,kana], n) => `${n+1}\n${stamp(a)} --> ${stamp(b)}\n${kana}\n`).join('\n'));
        sources = await json(await fetch(`${server.base}/api/studio/v05/srt/import?${new URLSearchParams({ project_id: id, revision: String(imported.revision), name: 'ENGINEERING-VOWELS-NOT-REAL-LYRICS.srt', encoding: 'utf-8' })}`,
          { method: 'POST', body: synthetic }));
        const source = sources.sources.find(s => s.sha256 === sha(synthetic)); assert.ok(source);
        for (let i = 0; i < windows.length; i++) {
          reading = await json(await post(server, '/api/studio/v05/lip/readings', { project_id: id, revision: reading.revision, source_id: source.id, source_hash: source.sha256,
            srt_index: i+1, reading_state: 'confirmed', reading_kana: windows[i][2], explicit_silence: false }));
          const candidate = await json(await fetch(`${server.base}/api/studio/v05/lip/candidates?${new URLSearchParams({ project_id: id, source_id: source.id, srt_index: String(i+1) })}`));
          draft = await json(await post(server, '/api/studio/v05/lip/drafts', { project_id: id, revision: draft.revision, source_id: source.id, source_hash: source.sha256,
            srt_index: i+1, pronunciation_version: candidate.pronunciationVersion, project_fps: fps,
            segments: candidate.segments.map(r => ({ startFrame: r.startFrame, endFrame: r.endFrame, mouthShape: r.mouthShape, weight: 1 })) }));
        }
        lip = await json(await post(server, '/api/studio/v05/lip/vmd-candidate', { project_id: id, source_id: source.id, model_asset_id: asset,
          source_revision: sources.revision, reading_revision: reading.revision, draft_revision: draft.revision, map_revision: map.revision, dry_run: false }));
        const lipBytes = Buffer.from(await (await fetch(server.base + lip.downloadUrl)).arrayBuffer());
        assert.equal(sha(lipBytes), lip.sha256); adoptedRows = morphRows(lipBytes);
      }
      assert.equal(reading.utterances.some(r => r.srtSourceId === realSource.id), false);
      if (sourceMouth) { assert.equal(reading.utterances.length, 0); assert.equal(draft.drafts.length, 0); assert.equal(sources.sources.length, 1); }
      const rejected = await json(await post(server, '/api/studio/v05/lip/vmd-candidate', { project_id: id, source_id: realSource.id, model_asset_id: asset,
        source_revision: sources.revision, reading_revision: reading.revision, draft_revision: draft.revision, map_revision: map.revision, dry_run: true }), 422);
      assert.equal(rejected.issues.length, 54); assert.ok(rejected.issues.every(r => r.code === 'reading_missing'));
      const motion = await json(await post(server, '/api/studio/v05/arrangement/place', { project_id: id, revision: 0, asset_id: `mmd:vmd:${motionName}`, track: 'motion', start: 1, duration: 230 }));
      const uploaded = await json(await fetch(`${server.base}/api/library-assets/upload?kind=audio&name=real-separated-vocal.wav`, { method: 'POST', body: fs.readFileSync(vocalPath) }));
      assert.equal(uploaded.item.sha256, before[3]);
      const audio = await json(await post(server, '/api/studio/v05/arrangement/place', { project_id: id, revision: motion.revision, asset_id: uploaded.item.id,
        track: 'audio', start: 1 + 5/30, duration: vocalDuration }));
      const assigned = await json(await post(server, '/api/studio/v05/scene/motion-target', { project_id: id, clip_id: motion.clip.id, revision: audio.revision, instance_id: instance }));
      let adoption;
      if (lip) {
        adoption = await json(await post(server, '/api/studio/v05/lip/adoptions', { project_id: id, revision: 0, action: 'adopt', instance_id: instance, candidate_id: lip.candidateId }));
        assert.equal(adoption.tracks[0].status, 'ready');
      }
      const saved = await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`));
      browser = await require('playwright').chromium.launch({ executablePath: process.env.CHROMIUM_PATH || harness.chromiumPath(), headless: true,
        args: process.env.BAI_REAL_GPU === '1' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
      page = await server.newPage(browser);
      page.on('requestfailed', request => console.log(JSON.stringify({ requestFailed: request.url(), reason: request.failure()?.errorText })));
      const open = async (project = id, media = true) => {
        await page.goto(server.base + '/studio/v05/index.html?scene_capture=1'); await page.locator('#v06project').selectOption(project);
        await page.locator('#nav [data-workspace="edit"]').click(); await page.locator('#v70sceneOpen').click();
        await page.waitForFunction(media => window.BAIStudioMultiScenePreview?.status().ready && window.BAIStudioMultiScenePreview.status().motion?.loadedClips.length === 1 && (!media || window.BAIStudioMediaPreviewV68?.status().mediaCount === 1), media, { timeout: 180000 });
      };
      await open();
      const tailTimes = candidateRows ? [213.8,217.6,222.2,228.1,216.1,220.4,226.7,230.2] : [];
      const sampleTimes = windows.map(([a]) => a + 0.5).concat([1.5, 120.5, 226.5, 229.5], tailTimes);
      let camera, cameraFitSamples;
      if (sourceMouth) {
        const fitTimes = [...new Set(sampleTimes.concat(Array.from({ length: 47 }, (_,i) => i*5)))];
        const bounds = [];
        for (const seconds of fitTimes) {
          const box = await page.evaluate(({ seconds, fps, instance }) => {
            // Capture evaluates the exact pose synchronously. An edit-cursor event
            // can still have an asynchronous preview seek in flight.
            window.BAIStudioMultiScenePreview.captureFrame(Math.round(seconds*fps), fps, 16, 16);
            return window.BAIStudioMultiScenePreview.frameProbe(instance).precise;
          }, { seconds, fps, instance });
          assert.ok(box); bounds.push(box);
        }
        const lo = [0,1,2].map(i => Math.min(...bounds.map(b => b.min[i]))), hi = [0,1,2].map(i => Math.max(...bounds.map(b => b.max[i])));
        const target = lo.map((x,i) => (x+hi[i])/2);
        const distance = Math.max((hi[1]-lo[1])/2, (hi[0]-lo[0])/(2*16/9))/Math.tan(Math.PI/8)*1.25;
        camera = { position: [target[0], target[1], hi[2]+distance], target, fov: 45 };
        cameraFitSamples = fitTimes.length;
      } else {
        // Keep the framing used by the already-recorded engineering baseline.
        const heads = [];
        for (const seconds of sampleTimes) {
          await page.evaluate(t => window.BAIStudioTimeline.seek(t, 'long-lip-head-fit'), seconds);
          const bone = await page.evaluate(id => window.BAIStudioMultiScenePreview.poseProbe(id, ['頭']).bones['頭'], instance);
          heads.push(bone.world.slice(12,15));
        }
        const lo = [0,1,2].map(i => Math.min(...heads.map(p => p[i]))), hi = [0,1,2].map(i => Math.max(...heads.map(p => p[i])));
        const target = lo.map((x,i) => (x+hi[i])/2), distance = Math.max(1.2, ...hi.map((x,i) => (x-lo[i])*1.8));
        camera = { position: [target[0], target[1], hi[2]+distance], target, fov: 45 };
        cameraFitSamples = sampleTimes.length;
      }
      scene = await json(await post(server, '/api/studio/v05/scene/instances', { project_id: id, action: 'camera', revision: scene.revision, camera }));
      await open();
      const sampleFrames = [...new Set(sampleTimes.map(t => Math.round(t*fps)))].sort((a,b) => a-b);
      const capture = async (frame, probeInstance = instance) => {
        const data = await page.evaluate(({ frame, fps }) => window.BAIStudioMultiScenePreview.captureFrame(frame, fps, 1280, 720), { frame, fps });
        const raw = ff(['-i', 'pipe:0', '-vf', 'scale=320:180', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], Buffer.from(data.split(',')[1], 'base64'));
        const morphs = await page.evaluate(id => window.BAIStudioMultiScenePreview.morphProbe(id).morphs, probeInstance);
        const pose = await page.evaluate(id => window.BAIStudioMultiScenePreview.poseProbe(id, ['頭','センター','左腕','右腕','左足','右足','上半身']).bones, probeInstance);
        return { raw, morphs, pose, png: Buffer.from(data.split(',')[1], 'base64') };
      };
      const references = [];
      for (const frame of sampleFrames) references.push({ frame, ...(await capture(frame)) });
      let changed = 0;
      if (lip) {
        for (const [start,,kana] of windows) {
          const ref = references.find(r => r.frame === Math.round((start+0.5)*fps)), name = kana[0];
          const expected = sample(adoptedRows, name, ref.frame/fps*30);
          assert.ok(expected > 0.5);
          assert.ok(Math.abs(ref.morphs[name] - expected) < 1e-5, `adopted ${name} F${ref.frame}=${ref.morphs[name]}, expected ${expected}`);
        }
        adoption = await json(await post(server, '/api/studio/v05/lip/adoptions', { project_id: id, revision: adoption.revision, action: 'undo' }));
        await open();
        for (const [start] of windows) {
          const frame = Math.round((start+0.5)*fps), plain = await capture(frame), adopted = references.find(r => r.frame === frame);
          for (const name of ['あ','い','う','え','お']) assert.ok(Math.abs(plain.morphs[name] - sample(originalRows, name, (frame/fps-1)*30)) < 0.002, `original ${name} F${frame}`);
          changed += plain.raw.reduce((n,x,i) => n+(Math.abs(x-adopted.raw[i])>5),0);
        }
        assert.ok(changed > 30, `adopted morphs not visible: ${changed}`);
        adoption = await json(await post(server, '/api/studio/v05/lip/adoptions', { project_id: id, revision: adoption.revision, action: 'redo' }));
      } else {
        for (const ref of references) for (const name of ['あ','い','う','え','お'])
          assert.ok(Math.abs(ref.morphs[name]-sample(playbackRows,name,(ref.frame/fps-1)*30))<0.002, `existing ${name} F${ref.frame}`);
        if (!candidateRows) assert.ok(references.filter(r => r.frame/fps>213).every(r => ['あ','い','う','え','お'].every(name => r.morphs[name]===0)));
      }
      const tailComparisons = [], earlyPixelErrors = [];
      if (candidateRows) {
        const originalId = (await json(await post(server,'/api/studio/v05/projects',{name:'原本比較専用',kind:'empty'}))).project.id;
        await json(await post(server,'/api/studio/v05/project/fps',{project_id:originalId,fps}));
        let originalScene = await json(await post(server,'/api/studio/v05/scene/instances',{project_id:originalId,action:'add',revision:0,asset_id:asset,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}));
        const originalInstance = originalScene.instances[0].id;
        const placed = await json(await post(server,'/api/studio/v05/arrangement/place',{project_id:originalId,revision:0,asset_id:`mmd:vmd:${path.basename(motionPath)}`,track:'motion',start:1,duration:230}));
        await json(await post(server,'/api/studio/v05/scene/motion-target',{project_id:originalId,revision:placed.revision,clip_id:placed.clip.id,instance_id:originalInstance}));
        originalScene = await json(await post(server,'/api/studio/v05/scene/instances',{project_id:originalId,action:'camera',revision:originalScene.revision,camera}));
        await open(originalId,false);
        for (const ref of references) {
          const plain = await capture(ref.frame,originalInstance);
          assert.deepEqual(plain.pose,ref.pose,'Body pose must remain identical');
          if (ref.frame/fps < 213) { assert.deepEqual(plain.morphs,ref.morphs); const maxPixelDifference = plain.raw.reduce((m,x,i)=>Math.max(m,Math.abs(x-ref.raw[i])),0); const meanPixelDifference = plain.raw.reduce((sum,x,i)=>sum+Math.abs(x-ref.raw[i]),0)/plain.raw.length; earlyPixelErrors.push({frame:ref.frame,max:maxPixelDifference,mean:meanPixelDifference}); assert.ok(meanPixelDifference<.01,`Unchanged early pose mean pixel difference ${meanPixelDifference} max ${maxPixelDifference}`); }
          else for (const name of ['あ','い','う','え','お']) assert.equal(plain.morphs[name],0);
        }
        // Close-up comparisons at each final utterance, with identical saved cameras.
        for (let n=0;n<4;n++) {
          const seconds = tailTimes[n], frame = Math.round(seconds*fps);
          await open(); const current = await capture(frame);
          const head = current.pose['頭'].world.slice(12,15);
          const closeCamera = {position:[head[0],head[1],head[2]+.7],target:head,fov:45};
          scene = await json(await post(server,'/api/studio/v05/scene/instances',{project_id:id,action:'camera',revision:scene.revision,camera:closeCamera}));
          await open(); const completed = await capture(frame);
          originalScene = await json(await post(server,'/api/studio/v05/scene/instances',{project_id:originalId,action:'camera',revision:originalScene.revision,camera:closeCamera}));
          await open(originalId,false); const plain = await capture(frame,originalInstance);
          const pixels = plain.raw.reduce((sum,x,i)=>sum+(Math.abs(x-completed.raw[i])>5),0);
          assert.ok(pixels>10,`Tail cue ${n+51} has no visible articulation: ${pixels}`);
          assert.ok(Math.max(...['あ','い','う','え','お'].map(k=>completed.morphs[k]))>.1);
          tailComparisons.push({cue:n+51,frame,changedChannels:pixels,morphs:completed.morphs,bodyPoseIdentical:true});
          if(process.env.BAI_LIP_LONG_OUT) { fs.mkdirSync(process.env.BAI_LIP_LONG_OUT,{recursive:true}); fs.writeFileSync(path.join(process.env.BAI_LIP_LONG_OUT,`tail-${n+51}-candidate.png`),completed.png); fs.writeFileSync(path.join(process.env.BAI_LIP_LONG_OUT,`tail-${n+51}-original.png`),plain.png); }
        }
        scene = await json(await post(server,'/api/studio/v05/scene/instances',{project_id:id,action:'camera',revision:scene.revision,camera}));
      }
      await open(); assert.deepEqual((await json(await fetch(`${server.base}/api/studio/v05/arrangement?id=${id}`))).clips, saved.clips);
      const reread = await json(await fetch(`${server.base}/api/studio/v05/lip/adoptions?project_id=${id}&instance_id=${instance}`));
      if (lip) { assert.equal(reread.tracks[0].candidateId, lip.candidateId); assert.equal(reread.tracks[0].status, 'ready'); }
      else { assert.deepEqual(reread.tracks, []); assert.equal(reread.revision, 0); }
      for (const ref of references) assert.deepEqual((await capture(ref.frame)).morphs, ref.morphs);
      harness.assertNoErrors(page); await page.close(); await browser.close(); page = browser = null;
      const frames = Math.ceil(Math.max(...saved.clips.map(c => c.start+c.duration))*fps-1e-7);
      const range = await json(await post(server, '/api/studio/v05/timeline/range', { project_id: id, revision: 0, arrangement_revision: assigned.revision, in_frame: 0, out_frame: frames-1 }));
      const started = await json(await post(server, '/api/studio/v05/render/jobs', { project_id: id, arrangement_revision: assigned.revision,
        range_revision: range.revision, scene_revision: scene.revision, resolution: '720p', name: `${sourceMouth?'既存VMD口形':'検証母音'}と実歌声_${fps}fps.mp4` }), 202);
      const job = await waitJob(server, started.id); assert.equal(job.probe.frames, frames); assert.equal(job.scene_capture.frames, frames);
      const movie = Buffer.from(await (await fetch(`${server.base}/api/studio/v05/render/file?id=${job.id}`)).arrayBuffer()); assert.equal(sha(movie), job.sha256);
      const raw = ff(['-i','pipe:0','-vf',`select=${sampleFrames.map(f => `eq(n\\,${f})`).join('+')},scale=320:180`,'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'], movie);
      assert.equal(raw.length, references.length*320*180*3);
      const imageErrors = references.map((ref,n) => ref.raw.reduce((sum,x,i) => sum+Math.abs(x-raw[n*ref.raw.length+i]),0)/ref.raw.length);
      assert.ok(imageErrors.every(e => e < 2), `preview/MP4 MAE ${imageErrors}`);
      const sourcePcm = ff(['-i',vocalPath,'-ac','1','-ar','8000','-f','s16le','pipe:1']);
      const outputPcm = ff(['-i','pipe:0','-ac','1','-ar','8000','-f','s16le','pipe:1'], movie);
      const referencePcm = Buffer.alloc(Math.ceil(frames/fps*8000)*2), audioClip = saved.clips.find(c => c.track === 'audio');
      sourcePcm.copy(referencePcm, Math.round(audioClip.start*8000)*2);
      assert.ok(outputPcm.length >= frames/fps*8000*2-16000/fps);
      const audioLags = Array.from({length:228},(_,i) => lagAt(referencePcm,outputPcm,i+2)).filter(Boolean);
      assert.ok(audioLags.length > 50); assert.ok(audioLags.every(r => Math.abs(r.lag) <= 8000/fps && r.correlation > 0.9), JSON.stringify(audioLags.filter(r => Math.abs(r.lag)>8000/fps||r.correlation<=0.9)));
      const result = { projectId: id, instanceId: instance, renderJobId: job.id, savedClips: saved.clips, renderRange: range, camera, cameraFitSamples, mouthMode: candidateRows ? 'tail_four_candidate' : sourceMouth ? 'existing_vmd' : 'engineering_adoption', fps, frames, bytes: movie.length, outputSha256: job.sha256, renderer: job.scene_capture.renderer,
        originalHashes: Object.fromEntries(['model','motion','realSrt','vocal','report'].map((k,i) => [k,before[i]])),
        inputAudit: { boneKeys: rawMotion.readUInt32LE(50), morphKeys: originalRows.length, morphLastFrame: 6359, excludedCues, vocalDuration },
        tailCandidateSha256: candidateRaw ? sha(candidateRaw) : null, tailComparisons, earlyPixelErrors, syntheticAdoptionOnly: !sourceMouth, realReadingsUnconfirmed: 54, adoptionCandidateId: lip?.candidateId || null, adoptionPixelDelta: changed,
        samples: references.map((r,i) => ({ frame: r.frame, morphs: Object.fromEntries(['あ','い','う','え','お'].map(n => [n,r.morphs[n]])), imageMAE: imageErrors[i] })), audioLags };
      if (process.env.BAI_LIP_LONG_OUT) {
        const out = path.resolve(process.env.BAI_LIP_LONG_OUT); fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, `${candidateRows?'tail-four-candidate':sourceMouth?'existing-vmd-mouth':'engineering-vowels'}-real-vocal-${fps}fps.mp4`), movie);
        fs.writeFileSync(path.join(out, `evidence-${fps}fps.json`), JSON.stringify(result,null,2)+'\n');
      }
      console.log(JSON.stringify({ ...result, samples: result.samples, audioLags: { windows: audioLags.length, maximumLag: Math.max(...audioLags.map(r => Math.abs(r.lag))), minimumCorrelation: Math.min(...audioLags.map(r => r.correlation)) } }));
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
      assert.deepEqual(files.map(digest), before); assert.deepEqual(protectedTextures.map(digest), textureHashes);
    }
  });
