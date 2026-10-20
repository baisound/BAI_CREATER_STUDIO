'use strict';
// Browser regression: legacy index.html <main> keeps a usable height and camera.html frame input is not stretched.
// Skipped when Chromium is unavailable.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.LEGACY_UI_TEST_PORT || 8798);
const exe = harness.chromiumPath();

test('legacy UI layout', { skip: exe && !fs.existsSync(exe) && 'chromium not available' }, async () => {
  const server = await harness.startServer({ port: PORT });
  const BASE = server.base;
  let browser;
  try {
    browser = await server.launchBrowser();
    const haveThree = harness.haveThree();
    const SECTIONS = ['timeline-studio', 'skeleton-lab', 'foot-qa', 'bai-ai-manager', 'bai-pose-editor'];
    const shotDir = process.env.LAYOUT_SHOT_DIR;
    for (const [w, hgt] of [[1280, 720], [1600, 900], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width: w, height: hgt } });
      await harness.routeThree(page);
      const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${BASE}/index.html`); await page.waitForTimeout(2000);
      const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
      const tag = `${w}x${hgt}`;
      for (const sel of ['main>section.panel:nth-of-type(1)', '#chain-side', '#studio-center-top', '#studio-center-scroll', '#threecanvas']) {
        const r = await box(sel); assert.ok(r && r.w > 50 && r.h > 50, `${tag} ${sel} ${JSON.stringify(r)}`);
      }
      const noPageScroll = await page.evaluate(() => ({ v: document.documentElement.scrollHeight - innerHeight, h: document.documentElement.scrollWidth - innerWidth }));
      assert.ok(noPageScroll.v <= 1 && noPageScroll.h <= 1, `${tag} page scroll ${JSON.stringify(noPageScroll)}`);
      const sc = await page.evaluate(() => { const e = document.getElementById('studio-center-scroll'); return e.scrollHeight - e.clientHeight; });
      assert.ok(sc > 100, `${tag} center-bottom not scrollable (${sc})`);
      const before = await box('#threecanvas');
      for (const id of SECTIONS) {
        const ok = await page.evaluate((i) => { const s = document.getElementById(i), c = document.getElementById('studio-center-scroll'); if (!s || !c.contains(s)) return false; s.scrollIntoView({ block: 'start' }); const r = s.getBoundingClientRect(), cr = c.getBoundingClientRect(); return r.height > 0 && r.top < cr.bottom && r.bottom > cr.top; }, id);
        assert.ok(ok, `${tag} #${id} not reachable in center-bottom`);
      }
      const after = await box('#threecanvas');
      assert.ok(Math.abs(after.y - before.y) < 1 && Math.abs(after.h - before.h) < 1, `${tag} 3D canvas moved while scrolling`);
      assert.equal((await page.evaluate(() => document.documentElement.scrollTop + document.body.scrollTop)), 0, `${tag} page scrolled`);
      if (shotDir && (w === 1280 || w === 1600)) { await page.evaluate(() => { document.getElementById('studio-center-scroll').scrollTop = 0; }); await page.screenshot({ path: path.join(shotDir, `index_layout_${w}.jpg`), type: 'jpeg', quality: 70 }); }
      if (haveThree) assert.equal(errs.length, 0, errs.join('\n'));
      else assert.equal(errs.filter((m) => /insertBefore/.test(m)).length, 0, errs.join('\n'));
      await page.close();
    }
    // 狭い幅は縦積み（ページ全体スクロール）で全セクションに到達できる
    const narrow = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await narrow.goto(`${BASE}/index.html`); await narrow.waitForTimeout(1200);
    const nr = await narrow.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, v: !!document.getElementById('foot-qa')?.getBoundingClientRect().height }));
    assert.ok(nr.sh > nr.ih && nr.v, `narrow stacked ${JSON.stringify(nr)}`);
    await narrow.close();
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`${BASE}/camera.html`); await page.waitForTimeout(1000);
    const fh = await page.evaluate(() => document.getElementById('frame-number').getBoundingClientRect().height);
    assert.ok(fh < 60, `frame-number height ${fh}`);
    await page.click('#next', { timeout: 3000 });
  } finally { if (browser) await browser.close(); await server.stop(); }
});
