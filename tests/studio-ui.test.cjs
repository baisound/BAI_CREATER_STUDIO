'use strict';
// Browser acceptance test for the 25-screen UI mock (P1-B).
// Starts the real Python server and drives Chromium with Playwright.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const harness = require('./helpers/studio-harness.cjs');

const PORT = Number(process.env.STUDIO_TEST_PORT || 8799);
const SHOTS = process.env.STUDIO_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');

let server, browser, BASE;

// History API navigation never fires "load", so poll the pathname instead of waitForURL.
async function atRoute(page, pattern) {
  const src = pattern instanceof RegExp ? pattern.source : `/workspace/${pattern}$`;
  await page.waitForFunction((re) => new RegExp(re).test(location.pathname), src, { timeout: 5000 });
}
const pages = [];
const newPage = async (opts = {}) => { const page = await server.newPage(browser, opts); pages.push(page); return page; };

test.before(async () => {
  server = await harness.startServer({ port: PORT });
  BASE = server.base;
  browser = await server.launchBrowser();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
// ブラウザーを閉じてからサーバーを止める（逆だと閉じる途中の通信がエラーとして残る）
test.after(async () => { await browser?.close(); await server?.stop(); });

test('all 25 screens open from the sidebar with their own route and title', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/01`);
  for (let n = 1; n <= 25; n++) {
    const id = pad(n);
    await page.click(`#nav a[data-route="${id}"]`);
    await page.waitForFunction((x) => location.pathname === `/workspace/${x}`, id);
    assert.equal(await page.getAttribute(`#nav a[data-route="${id}"]`, 'aria-current'), 'page');
    assert.equal(await page.textContent('.screen-head .screen-id'), `SCR-${id}`);
    assert.ok((await page.textContent('.screen-head h1')).length > 2);
    assert.ok(await page.locator('.pane-right [role="tab"]').count() >= 1, `inspector tabs on ${id}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `scr-${id}.png`) });
  }
  harness.assertNoErrors(page);
});

test('direct URL, reload, back and forward keep the right screen', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/13?tab=ik`);
  assert.equal(await page.textContent('.screen-head .screen-id'), 'SCR-13');
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'ik');
  await page.reload();
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'ik');
  await page.click('#nav a[data-route="02"]');
  await page.click('#nav a[data-route="15"]');
  await page.click('#nav-back');
  await atRoute(page, '02');
  await page.click('#nav-forward');
  await atRoute(page, '15');
  await page.goto(`${BASE}/workspace/99`);
  assert.match(await page.textContent('#main'), /画面 99 はありません/);
  await page.goto(`${BASE}/workspace`);
  await atRoute(page, '01');
});

test('tabs, dropdown, palette and keyboard work', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/02`);
  await page.click('.pane-right [role="tab"][data-tab="focus"]');
  assert.match(page.url(), /tab=focus/);
  await page.click('.pane-right [role="tab"][data-tab="status"]');
  assert.ok(await page.locator('.pane-right .badge-partial').count() > 0);
  await page.locator('.pane-right [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'camera');
  await page.click('.screen-head .dropdown > button');
  assert.equal(await page.locator('.menu [role="menuitem"]').count(), 3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.fill('.palette input', 'CAM-016');
  await page.keyboard.press('Enter');
  await atRoute(page, /workspace\/(07|15|23)$/);
  // timeline: play then scrub
  await page.goto(`${BASE}/workspace/02`);
  await page.locator('.pane-bottom input.scrub').fill('300');
  assert.equal(await page.textContent('.pane-bottom .timecode'), '00:10:00');
});

test('unimplemented actions explain themselves; forms validate; nothing claims success', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/17`);
  await page.click('.screen-head .btn.is-unimpl >> nth=0');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.textContent('[role="dialog"]'), /◇ 未実装/);
  assert.match(await page.textContent('[role="dialog"]'), /Phase F/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role="dialog"]').count(), 0);

  await page.goto(`${BASE}/workspace/01`);
  await page.click('.screen-head .btn.primary');
  await page.click('[role="dialog"] footer .btn.primary');
  assert.equal(await page.getAttribute('#f-newProject-name', 'aria-invalid'), 'true');
  await page.fill('#f-newProject-name', 'bad/name');
  await page.click('[role="dialog"] footer .btn.primary');
  assert.equal(await page.getAttribute('#f-newProject-name', 'aria-invalid'), 'true');
  await page.fill('#f-newProject-name', 'Demo MV');
  await page.click('[role="dialog"] footer .btn.primary');
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toast'), /サンプル表示.*保存されていません/);

  await page.goto(`${BASE}/workspace/18`);
  await page.click('.screen-head button:has-text("復元…")');
  await page.fill('#f-confirmRestore-confirm', '復元');
  await page.click('[role="dialog"] footer button:has-text("復元を実行")');
  assert.match(await page.textContent('.toast >> nth=-1'), /未接続/);
});

test('every action button on every screen responds', async () => {
  const page = await newPage();
  for (let n = 1; n <= 25; n++) {
    const id = pad(n);
    await page.goto(`${BASE}/workspace/${id}`);
    const tabsCount = await page.locator('.pane-right [role="tab"]').count();
    for (let t = 0; t < tabsCount; t++) {
      await page.locator('.pane-right [role="tab"]').nth(t).click();
      const btns = page.locator('#main button[data-act]:not([data-act="href"]):not([data-act="nav"])');
      const count = await btns.count();
      for (let i = 0; i < count; i++) {
        const before = await page.locator('.toast').count();
        await btns.nth(i).click();
        const dialog = await page.locator('[role="dialog"]').count();
        const after = await page.locator('.toast').count();
        assert.ok(dialog > 0 || after > before, `button ${i} on ${id} tab ${t} had no visible response`);
        if (dialog) await page.keyboard.press('Escape');
      }
    }
  }
  harness.assertNoErrors(page);
});

test('read-only live data comes from the existing API', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/20`);
  await page.waitForSelector('[data-live="serverVersion"] dl');
  assert.match(await page.textContent('[data-live="serverVersion"]'), /version/);
  await page.goto(`${BASE}/workspace/18`);
  await page.waitForSelector('[data-live="projectBundle"] dl, [data-live="projectBundle"] p[style]');
  // existing pages are untouched
  assert.equal((await fetch(`${BASE}/`)).status, 200);
  assert.equal((await fetch(`${BASE}/camera.html`)).status, 200);
  assert.equal((await fetch(`${BASE}/studio/../server.py`)).status, 404);
});

test('theme preference persists and narrow screens do not scroll sideways', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/21`);
  await page.click('.swatch-card:has-text("B: ペーパー")');
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'paper');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'scr-21-paper.png') });

  const mobile = await newPage({ viewport: { width: 390, height: 844 } });
  for (const id of ['01', '02', '13', '17', '25']) {
    await mobile.goto(`${BASE}/workspace/${id}`);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px on ${id}`);
  }
  await mobile.click('#nav-toggle');
  await mobile.click('#nav a[data-route="14"]');
  await atRoute(mobile, '14');
  if (SHOTS) await mobile.screenshot({ path: path.join(SHOTS, 'mobile-14.png') });
});

test('no unexpected browser errors on any page of this run', () => {
  for (const page of pages) harness.assertNoErrors(page);
});
