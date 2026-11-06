'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const harness = require('./helpers/studio-harness.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ff(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
}
async function json(r) { const text = await r.text(); assert.equal(r.status, 200, text); return JSON.parse(text); }
async function start() {
  for (let port = 9112; port < 9122; port++) {
    try { return await harness.startServer({ port }); }
    catch (error) { if (!String(error).includes('既に使われています')) throw error; }
  }
  throw Error('No unused isolated port');
}

test('video/audio details explain unsupported OGV, preserve inputs and stop previous media in both asset screens',
  { timeout: 180000 }, async () => {
    const server = await start(); let browser, page;
    try {
      const assets = [];
      for (const [ext, videoCodec, audioCodec] of [
        ['mp4', 'libx264', 'aac'], ['webm', 'libvpx-vp9', 'libopus'],
        ['ogv', 'libtheora', 'libvorbis'], ['mp3', null, 'libmp3lame'], ['wav', null, 'pcm_s16le'],
      ]) {
        const file = path.join(server.dataDir, `sample.${ext}`);
        ff([...(videoCodec ? ['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=20:d=3'] : []),
          '-f', 'lavfi', '-i', 'sine=frequency=433:sample_rate=44100:duration=3',
          ...(videoCodec ? ['-c:v', videoCodec] : []), '-c:a', audioCodec, '-y', file]);
        const bytes = fs.readFileSync(file), kind = videoCodec ? 'video' : 'audio';
        const uploaded = await json(await fetch(`${server.base}/api/library-assets/upload?kind=${kind}&name=sample.${ext}`, {
          method: 'POST', body: bytes }));
        assets.push({ ext, kind, file, bytes, hash: sha(bytes), item: uploaded.item });
      }
      browser = await server.launchBrowser(); page = await server.newPage(browser);
      const posterWrites = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/api/library-assets/thumbnail?')) posterWrites.push(new URL(request.url()).searchParams.get('id'));
      });
      const ogv = assets.find(a => a.ext === 'ogv');
      const mp4 = assets.find(a => a.ext === 'mp4');
      const selectV05 = async asset => {
        await page.locator(`#baiLibraryGrid [data-library-id="${asset.item.id}"]`).click();
        await page.waitForFunction(name => document.querySelector('#baiAssetDetail h3')?.textContent === name, asset.item.name);
      };
      const playDetail = async selector => {
        await page.locator(selector).evaluate(async media => { window.__previousDetailMedia = media; media.muted = true; await media.play(); });
        await page.waitForFunction(() => window.__previousDetailMedia.currentTime > 0.1 && !window.__previousDetailMedia.paused);
      };
      await page.goto(server.base + '/studio/v05/index.html');
      await page.locator('#nav [data-page="library"]').click();
      await page.waitForSelector('#baiLibraryGrid [data-library-id]');
      for (const asset of assets) {
        await selectV05(asset);
        if (asset.ext === 'ogv') {
          await page.waitForFunction(() => document.querySelector('#baiAssetDetail [data-role="asset-media-status"]')?.textContent.includes('再生できません'));
          assert.equal(await page.locator('#baiAssetDetail video').evaluate(v => v.videoWidth), 0);
          assert.equal(await page.locator('#baiAssetDetail video').isVisible(), false);
          assert.match(await page.locator('#baiAssetDetail').textContent(), /登録済み（元ファイルあり）/);
        } else {
          await playDetail(`#baiAssetDetail ${asset.kind === 'audio' ? 'audio' : 'video'}`);
        }
        await selectV05(assets.find(a => a.item.id !== asset.item.id && a.ext !== 'ogv'));
        if (asset.ext !== 'ogv') {
          await page.waitForFunction(() => window.__previousDetailMedia.paused && !window.__previousDetailMedia.hasAttribute('src'));
        }
      }
      await selectV05(mp4); await playDetail('#baiAssetDetail video');
      await page.locator('#nav [data-workspace="edit"]').click();
      await page.waitForFunction(() => window.__previousDetailMedia.paused);
      await page.locator('#nav [data-page="library"]').click();
      await playDetail('#baiAssetDetail video');
      await page.locator('#baiImport').click();
      await page.waitForFunction(() => window.__previousDetailMedia.paused && !window.__previousDetailMedia.hasAttribute('src'));
      await page.reload(); await page.locator('#nav [data-page="library"]').click();
      await page.waitForSelector('#baiLibraryGrid [data-library-id]'); await selectV05(ogv);
      await page.waitForFunction(() => document.querySelector('#baiAssetDetail [data-role="asset-media-status"]')?.textContent.includes('再生できません'));

      await page.goto(server.base + '/workspace/08?cat=video');
      const selectP2 = async asset => {
        await page.locator(`[data-feature="assetLibrary"] [data-asset-id="${asset.item.id}"]`).click();
        await page.waitForSelector(`[data-role="${asset.kind === 'video' ? 'video' : 'audio'}-media"]`, { state: 'attached' });
      };
      for (const asset of assets.filter(a => a.kind === 'video')) {
        await selectP2(asset);
        if (asset.ext === 'ogv') {
          await page.waitForFunction(() => document.querySelector('[data-role="library-preview-status"]')?.textContent.includes('再生できません'));
          assert.equal(await page.locator('[data-role="video-media"]').isVisible(), false);
          assert.equal(await page.locator('[data-role="media-play"]').isDisabled(), true);
          const thumbnail = await page.evaluate(async id => {
            const module = await import('/studio/js/features/asset-library-preview.js');
            const asset = (await (await fetch('/api/assets')).json()).items.find(a => a.id === id);
            return module.libraryThumbnail(asset);
          }, asset.item.id);
          assert.equal(thumbnail, null);
          assert.equal(posterWrites.filter(id => id === asset.item.id).length, 0);
          assert.equal(fs.existsSync(path.join(server.dataDir, 'library_assets/thumbnails', asset.item.id.slice(8) + '.png')), false);
        } else {
          await page.waitForFunction(() => document.querySelector('[data-role="video-media"]')?.poster.includes('/api/library-assets/thumbnail/'));
          await page.locator('[data-role="media-play"]').click();
          await page.waitForFunction(() => document.querySelector('[data-role="video-media"]').currentTime > 0.1);
          await page.evaluate(async () => {
            const { assets } = await import('/studio/js/store.js');
            window.__playingPreview = document.querySelector('[data-role="video-media"]');
            assets.set({ items: assets.get().items.map(item => ({ ...item })) }, 'thumbnail');
          });
          assert.equal(await page.evaluate(() => document.querySelector('[data-role="video-media"]') === window.__playingPreview && !window.__playingPreview.paused), true);
          await page.locator('[data-role="media-stop"]').click();
          assert.equal(await page.locator('[data-role="video-media"]').evaluate(v => v.currentTime), 0);
        }
      }
      await page.goto(server.base + '/workspace/08?cat=audio');
      for (const asset of assets.filter(a => a.kind === 'audio')) {
        await selectP2(asset);
        await page.waitForFunction(() => document.querySelector('[data-role="audio-waveform"]')?.src.includes('/api/library-assets/thumbnail/'));
        await page.locator('[data-role="media-play"]').click();
        await page.waitForFunction(() => document.querySelector('[data-role="audio-media"]').currentTime > 0.1);
        await page.locator('[data-role="media-stop"]').click();
      }
      await page.reload();
      await page.goto(server.base + '/workspace/08?cat=video'); await selectP2(ogv);
      await page.waitForFunction(() => document.querySelector('[data-role="library-preview-status"]')?.textContent.includes('再生できません'));
      for (const asset of assets) {
        assert.equal(sha(fs.readFileSync(asset.file)), asset.hash);
        const saved = Buffer.from(await (await fetch(`${server.base}/api/library-assets/file/${encodeURIComponent(asset.item.id)}`)).arrayBuffer());
        assert.equal(sha(saved), asset.hash);
      }
      harness.assertNoErrors(page);
      console.log(JSON.stringify({ formats: assets.map(a => a.ext), detailScreens: 2,
        unsupportedVideoExplained: true, noBlankOgvPoster: true, previousMediaStopped: true, inputHashesUnchanged: true }));
    } finally { await page?.close(); await browser?.close(); await server.stop(); }
  });
