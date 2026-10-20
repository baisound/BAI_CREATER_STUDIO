'use strict';
// Browser acceptance test for the 27-screen UI mock.
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
const TAB_SEL = '.pane-right [role="tab"], .pane-center [role="tab"]';
const pages = [];
const newPage = async (opts = {}) => { const page = await server.newPage(browser, opts); pages.push(page); return page; };

test.before(async () => {
  // 閲覧中のサーバーに接続せず、テスト専用の隔離データで空きポートを探す。
  for (let port = PORT; port < PORT + 20; port++) {
    try { server = await harness.startServer({ port }); break; }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/既に使われています|Address already in use|10048/.test(message)) throw e;
    }
  }
  if (!server) throw new Error(`${PORT}〜${PORT + 19} にテスト用の空きポートがありません`);
  BASE = server.base;
  browser = await server.launchBrowser();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
// ブラウザーを閉じてからサーバーを止める（逆だと閉じる途中の通信がエラーとして残る）
test.after(async () => { await browser?.close(); await server?.stop(); });

test('all 27 screens open from the sidebar with their own route and title', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/01`);
  for (let n = 1; n <= 27; n++) {
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

test('FX and lyrics pages keep their tabs and explain unavailable actions', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/01`);
  await page.click('.topbar-shortcuts a[data-route="26"]');
  await atRoute(page, '26');
  assert.equal(await page.getAttribute('.topbar-shortcuts a[data-route="26"]', 'aria-current'), 'page');
  await page.click('.topbar-shortcuts a[data-route="27"]');
  await atRoute(page, '27');
  assert.equal(await page.getAttribute('.topbar-shortcuts a[data-route="27"]', 'aria-current'), 'page');
  for (const [id, tab, title, feature] of [
    ['26', 'stack', 'MMDエフェクト', 'RENDER-014'],
    ['27', 'cues', '歌詞・MV構成', 'LYRIC-002'],
  ]) {
    await page.goto(`${BASE}/workspace/${id}?tab=${tab}`);
    assert.match(await page.textContent('.screen-head h1'), new RegExp(title));
    assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), tab);
    await page.reload();
    assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), tab);
    await page.locator('.pane-right .btn.is-unimpl').first().click();
    assert.match(await page.textContent('[role="dialog"]'), new RegExp(feature));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.locator('.pane-center .badge-real').count(), 0);
  }
  await page.goto(`${BASE}/workspace/26?tab=params`);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /Bloom 閾値/);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /霧の濃度/);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /影の強さ/);
  assert.doesNotMatch(await page.textContent('.pane-right [role="tabpanel"]'), /DOF ピント距離/);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /DOFの焦点・区間はカメラ画面で設定/);
  assert.equal(await page.locator('.tl-clip:has-text("DOF")').count(), 0);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /保存されません/);
  await page.click('.pane-right button:has-text("現在フレームにキーを追加")');
  assert.match(await page.textContent('[role="dialog"]'), /RENDER-014/);
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/workspace/26?tab=events`);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /舞う桜/);
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /持続区間/);
  await page.click('.screen-head button:has-text("カメラDOF（03）へ")');
  await atRoute(page, '03');
  await page.goto(`${BASE}/workspace/27`);
  assert.equal(await page.getAttribute('.screen-head .mode-switch button:has-text("かんたん")', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'quick');
  assert.equal(await page.locator('.pane-left textarea[disabled]').count(), 1);
  const srtPick = page.locator('.pane-left button:has-text("SRTを読み込む")');
  assert.equal(await srtPick.isVisible(), true);
  await srtPick.click();
  assert.match(await page.textContent('[role="dialog"]'), /LYRIC-002/);
  await page.keyboard.press('Escape');
  await page.click('.screen-head .mode-switch button:has-text("詳細")');
  assert.equal(await page.getAttribute('.screen-head .mode-switch button:has-text("詳細")', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'cues');
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /各発話の［開始, 終了）/);
  await page.click('.pane-right button:has-text("SRT時刻を編集して保存")');
  assert.match(await page.textContent('[role="dialog"]'), /LYRIC-002/);
  await page.keyboard.press('Escape');
  await page.click('.pane-right [role="tab"][data-tab="textMotion"]');
  assert.match(await page.textContent('.pane-right [role="tabpanel"]'), /文字や映像には反映・保存されません/);
  await page.click('.pane-right button:has-text("現在フレームに文字キーを追加")');
  assert.match(await page.textContent('[role="dialog"]'), /LYRIC-002/);
  await page.keyboard.press('Escape');
  await page.click('.pane-right [role="tab"][data-tab="status"]');
  await page.reload();
  assert.equal(await page.getAttribute('.screen-head .mode-switch button:has-text("詳細")', 'aria-pressed'), 'true');
  assert.equal(await page.locator('.pane-right [role="tab"][data-tab="textMotion"]').count(), 1);
  await page.click('.screen-head .tools button:has-text("表示")');
  await page.getByText('実装状態タブを開く').click();
  await page.reload();
  assert.equal(await page.getAttribute('.screen-head .mode-switch button:has-text("詳細")', 'aria-pressed'), 'true');
  await page.click('.screen-head .mode-switch button:has-text("かんたん")');
  assert.equal(await page.getAttribute('.pane-right [role="tab"][aria-selected="true"]', 'data-tab'), 'quick');
  await page.keyboard.press('Control+k');
  await page.fill('.palette input', 'MMDエフェクト');
  await page.keyboard.press('Enter');
  await atRoute(page, '26');
  harness.assertNoErrors(page);
});

test('FX and lyrics concept images and local timeline examples are visible and reset on reload', async () => {
  const page = await newPage();
  for (const id of ['26', '27']) {
    await page.goto(`${BASE}/workspace/${id}`);
    await page.waitForFunction(() => document.querySelector('.concept-preview img')?.naturalWidth > 0);
    assert.match(await page.textContent('.concept-preview figcaption'), /実際の描画は未実装/);
    assert.match(await page.textContent('.timeline-demo-note'), /保存されず/);
    assert.ok(await page.locator('.tl-demo-clip').count() >= 3);
    assert.ok(await page.locator('.tl-key').count() >= 3);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `concept-${id}.png`) });
  }
  const cue = page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first();
  const before = await cue.getAttribute('aria-label');
  await cue.focus();
  await page.keyboard.press('ArrowRight');
  const shifted = await page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first().getAttribute('aria-label');
  assert.notEqual(shifted, before);
  const interval = (label) => label.match(/(\d+)〜(\d+)フレーム/).slice(1).map(Number);
  const [start1, end1] = interval(shifted);
  const movedClip = page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first();
  const box = await movedClip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const [start2, end2] = interval(await page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first().getAttribute('aria-label'));
  assert.ok(start2 > start1);
  assert.equal(end2 - start2, end1 - start1);
  const trimClip = page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first();
  const trimmedBox = await trimClip.boundingBox();
  await page.mouse.move(trimmedBox.x + 3, trimmedBox.y + trimmedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(trimmedBox.x + 18, trimmedBox.y + trimmedBox.height / 2, { steps: 4 });
  await page.mouse.up();
  const [start3, end3] = interval(await page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first().getAttribute('aria-label'));
  assert.ok(start3 > start2);
  assert.equal(end3, end2);
  await page.reload();
  assert.equal(await page.locator('.tl-track').nth(1).locator('.tl-demo-clip').first().getAttribute('aria-label'), before);
  harness.assertNoErrors(page);
});

test('approved feature panes stay reachable at desktop and narrow widths', async () => {
  const targets = [['06', 'dancers'], ['10', 'sync'], ['12', 'morph'], ['13', 'combat'], ['17', 'verify'], ['26', 'params'], ['27', 'cues']];
  for (const width of [1280, 390]) {
    const page = await newPage({ viewport: { width, height: 720 } });
    for (const [id, targetTab] of targets) {
      await page.goto(`${BASE}/workspace/${id}`);
      if (id === '27') await page.click('.screen-head .mode-switch button:has-text("詳細")');
      assert.equal(await page.locator('.screen-head h1').count(), 1, `${id} heading at ${width}`);
      assert.ok(await page.locator('.screen-head .tools button').count() > 0, `${id} main action at ${width}`);
      const tabs = page.locator('.pane-right [role="tab"]');
      await tabs.first().focus();
      const targetIndex = await tabs.evaluateAll((els, tab) => els.findIndex((el) => el.getAttribute('data-tab') === tab), targetTab);
      assert.ok(targetIndex >= 0, `${id} has ${targetTab} tab`);
      for (let n = 0; n < targetIndex; n++) await page.keyboard.press('ArrowRight');
      assert.equal(await tabs.nth(targetIndex).getAttribute('aria-selected'), 'true', `${id} keyboard reaches ${targetTab} at ${width}`);
      assert.equal(await page.locator('.pane-right [role="tabpanel"]').count(), 1, `${id} inspector at ${width}`);
      assert.ok(await page.locator('.pane-right [role="tabpanel"] > *').count() > 0, `${id} inspector content at ${width}`);
      await page.locator('.pane-right [role="tabpanel"] > *').last().scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.pane-right [role="tabpanel"] > *').last().isVisible(), `${id} last inspector section at ${width}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `${id} horizontal overflow ${overflow}px at ${width}`);
      if (['10', '13', '26', '27'].includes(id)) {
        const timeline = page.locator('.pane-bottom');
        assert.equal(await timeline.count(), 1, `${id} timeline at ${width}`);
        await timeline.scrollIntoViewIfNeeded();
        assert.ok(await timeline.isVisible(), `${id} timeline reachable at ${width}`);
      }
    }
    harness.assertNoErrors(page);
  }
});

test('audio import shows its approved independent ID and phase', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/10`);
  await page.click('.screen-head button:has-text("音声を読み込む")');
  const body = await page.textContent('[role="dialog"]');
  assert.match(body, /AUDIO-001/);
  assert.match(body, /リップシンク/);
  assert.doesNotMatch(body, /Phase D/);
  await page.keyboard.press('Escape');
  harness.assertNoErrors(page);
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

  // SCR-01 の［新規プロジェクト］は 5 か所とも ◇ 未実装（P2 v5 C7。Q1 の回答まで）。フォームは開かない。
  await page.goto(`${BASE}/workspace/01`);
  await page.click('.screen-head .btn.primary');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.textContent('[role="dialog"]'), /◇ 未実装/);
  assert.match(await page.textContent('[role="dialog"]'), /DATA-008/);
  assert.equal(await page.locator('#f-newProject-name').count(), 0);
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/workspace/18`);
  await page.click('.screen-head button:has-text("復元…")');
  await page.fill('#f-confirmRestore-confirm', '復元');
  await page.click('[role="dialog"] footer button:has-text("復元を実行")');
  assert.match(await page.textContent('.toast >> nth=-1'), /未接続/);
});

test('SCR-01 has no new-project form: all five buttons are unimplemented', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/01`);
  const labels = ['ヒーロー', 'ツール', 'クイック', 'ダンスMV', 'カメラ試験', '空のプロジェクト'];
  const targets = [
    page.locator('.hero .btn-row .btn.primary'),
    page.locator('.screen-head .btn.primary'),
    page.locator('.qa:has-text("新規プロジェクト")'),
    page.locator('button:has-text("ダンスMV")'),
    page.locator('button:has-text("カメラ試験")').last(),
    page.locator('button:has-text("空のプロジェクト")'),
  ];
  for (let i = 0; i < targets.length; i++) {
    await targets[i].first().click();
    await page.waitForSelector('[role="dialog"]');
    const text = await page.textContent('[role="dialog"]');
    assert.match(text, /◇ 未実装/, labels[i]);
    assert.match(text, /DATA-008/, labels[i]);
    assert.match(text, /NF-019/, labels[i]);
    await page.keyboard.press('Escape');
  }
  harness.assertNoErrors(page);
});

test('every action button on every screen responds', async () => {
  const page = await newPage();
  for (let n = 1; n <= 27; n++) {
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
  // 実データの区画（status: real）はすべて、既存 API の値を表示する。取得できないときは「未接続」と出す（偽の値は出さない）。
  const seen = new Set();
  for (let n = 1; n <= 27; n++) {
    const id = pad(n);
    await page.goto(`${BASE}/workspace/${id}`);
    const tabsCount = await page.locator(TAB_SEL).count();
    for (let t = 0; t < tabsCount; t++) {
      await page.locator(TAB_SEL).nth(t).click();
      const blocks = page.locator('#main [data-live]');
      for (let i = 0; i < await blocks.count(); i++) {
        const key = await blocks.nth(i).getAttribute('data-live');
        await blocks.nth(i).locator('dl, pre.log, .empty').first().waitFor({ timeout: 8000 });
        assert.equal(await blocks.nth(i).locator('p[style]').count(), 0, `${key} on ${id} reported 未接続`);
        seen.add(key);
      }
    }
  }
  for (const key of ['serverVersion', 'projectBundle', 'cameraProject', 'cameraFocus', 'sequenceEval', 'aiStatus', 'diagnostics', 'qaSettings']) assert.ok(seen.has(key), `live key ${key} is shown somewhere`);
  await page.goto(`${BASE}/workspace/20`);
  await page.locator('.pane-center [role="tab"][data-tab="sys"]').click();
  assert.match(await page.textContent('#main'), /UA/);
  assert.equal((await fetch(`${BASE}/api/diagnostics/export`)).status, 200);
  // existing pages are untouched
  assert.equal((await fetch(`${BASE}/`)).status, 200);
  assert.equal((await fetch(`${BASE}/camera.html`)).status, 200);
  assert.equal((await fetch(`${BASE}/studio/../server.py`)).status, 404);
  harness.assertNoErrors(page);
});

test('unconnected sections are dimmed and labelled', async () => {
  const page = await newPage();
  let dimmed = 0, normal = 0;
  for (let n = 1; n <= 27; n++) {
    const id = pad(n);
    await page.goto(`${BASE}/workspace/${id}`);
    const tabsCount = await page.locator(TAB_SEL).count();
    for (let t = 0; t < tabsCount; t++) {
      await page.locator(TAB_SEL).nth(t).click();
      const r = await page.evaluate(() => {
        const bad = [];
        let dim = 0, real = 0;
        const own = (el) => [...el.querySelectorAll('.unconn-label')].filter((l) => l.closest('[data-status]') === el);
        for (const el of document.querySelectorAll('#main [data-status]')) {
          const st = el.dataset.status;
          const isDim = el.dataset.dim === '1';
          const labels = own(el).length;
          if (st === 'real') { real++; if (isDim || labels) bad.push(`real region dimmed/labelled: ${el.className}`); }
          else {
            dim++;
            if (!isDim) bad.push(`${st} region not dimmed: ${el.className}`);
            if (!labels) bad.push(`${st} region without label: ${el.className}`);
            else if (!own(el).some((l) => /未接続（まだ使えません）/.test(l.textContent || ''))) bad.push('label text');
            // 本文は薄く、見出しは薄くしない
            const body = [...el.children].find((c) => !c.matches('.pane-head,.block-head,.section-title,.vp-note,.lib-crumb,h2,.state-box'));
            if (body && el.closest('[data-dim="1"]') === el && Number(getComputedStyle(body).opacity) >= 1) bad.push(`${st} body not dimmed: ${el.className}`);
          }
        }
        // 状態バッジのある区画は、必ず data-status を持つ（凡例・実装状態タブの一覧は除く）
        for (const b of document.querySelectorAll('#main .badge')) {
          if (b.closest('.check-row, [data-legend]')) continue;
          const st = ['real', 'partial', 'mock', 'unimpl'].find((x) => b.classList.contains(`badge-${x}`));
          const reg = b.closest('[data-status]');
          if (!reg || reg.dataset.status !== st) bad.push(`badge ${st} outside its region: ${b.closest('section,div')?.className}`);
        }
        return { bad, dim, real };
      });
      assert.deepEqual(r.bad, [], `screen ${id} tab ${t}`);
      dimmed += r.dim; normal += r.real;
    }
    // 薄い区画の中のボタンは押せる（反応する）
    const btn = page.locator('#main [data-dim="1"] button[data-act]:not([data-act="href"]):not([data-act="nav"]):not([data-act="real"])').first();
    if (await btn.count()) {
      const before = await page.locator('.toast').count();
      await btn.click();
      assert.ok((await page.locator('[role="dialog"]').count()) > 0 || (await page.locator('.toast').count()) > before, `dimmed button responds on ${id}`);
      if (await page.locator('[role="dialog"]').count()) await page.keyboard.press('Escape');
    }
  }
  assert.ok(dimmed > 50 && normal > 5, `regions seen: dim=${dimmed} real=${normal}`);
  harness.assertNoErrors(page);
});

test('unimplemented dialog shows next action', async () => {
  const page = await newPage();
  for (let n = 1; n <= 27; n++) {
    const id = pad(n);
    await page.goto(`${BASE}/workspace/${id}`);
    const tabsCount = await page.locator(TAB_SEL).count();
    for (let t = 0; t < tabsCount; t++) {
      await page.locator(TAB_SEL).nth(t).click();
      const btns = page.locator('#main button[data-act="unimpl"]');
      for (let i = 0; i < await btns.count(); i++) {
        await btns.nth(i).click();
        const text = await page.textContent('[role="dialog"]');
        assert.match(text, /今できること/, `${id} tab ${t} #${i}`);
        assert.equal(await page.locator('[role="dialog"] footer [data-role="next-action"]').count(), 1, `${id} tab ${t} #${i} has a destination button`);
        await page.keyboard.press('Escape');
      }
    }
  }
  // 既定：予定のフェーズと［ホームへ］
  await page.goto(`${BASE}/workspace/17`);
  await page.click('.screen-head .btn.is-unimpl >> nth=0');
  assert.match(await page.textContent('[role="dialog"]'), /で入る予定です。今はこの画面では使えません。/);
  await page.click('[role="dialog"] footer [data-role="next-action"]');
  await atRoute(page, '01');
  // 未承認の候補は「入る予定」と言わず、承認まで実装しないと書く
  await page.goto(`${BASE}/workspace/01`);
  await page.click('.hero button:has-text("紹介ムービーを再生")');
  assert.match(await page.textContent('[role="dialog"] [data-role="next-action"]'), /未承認の候補です。所有者が承認するまで実装しません。/);
  await page.keyboard.press('Escape');
  // 旧画面で実際に行えるものだけ「今は現行画面で行えます。」（移動は確認を通る）
  await page.goto(`${BASE}/workspace/13`);
  await page.click('.screen-head button:has-text("VMDを書き出す")');
  assert.match(await page.textContent('[role="dialog"]'), /今は現行画面で行えます。/);
  await page.click('[role="dialog"] footer [data-role="next-action"]');
  assert.match(await page.textContent('[role="dialog"]'), /新UIから離れます/);
  await page.click('[role="dialog"] [data-role="leave-cancel"]');
  assert.match(page.url(), /\/workspace\/13/);
  harness.assertNoErrors(page);
});

test('leaving to legacy page asks first', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/08`);
  await page.click('.screen-head button:has-text("現行画面で素材を登録")');
  assert.match(await page.textContent('[role="dialog"]'), /新UIから離れます/);
  assert.match(await page.textContent('[role="dialog"]'), /戻る/);
  await page.keyboard.press('Escape');
  assert.match(page.url(), /\/workspace\/08/);
  await page.click('.screen-head button:has-text("現行画面で素材を登録")');
  await page.click('[role="dialog"] [data-role="leave-cancel"]');
  assert.match(page.url(), /\/workspace\/08/);
  // 本文中の <a>（08 のキューの注記、各画面の実装状態タブの「現行画面」）も同じ確認を通る
  const anchor = page.locator('#main .lib-queue a[href="/"]').first();
  await anchor.click();
  assert.match(await page.textContent('[role="dialog"]'), /新UIから離れます/);
  await page.keyboard.press('Escape');
  for (const id of ['06', '12', '23']) {
    await page.goto(`${BASE}/workspace/${id}?tab=status`);
    const a = page.locator('#main a[href="/"], #main a[href="/camera.html"]').first();
    const b = page.locator('#main button[data-act="href"]').first();
    const target = (await a.count()) ? a : b;
    if (!(await target.count())) continue; // その画面に現行画面へのリンクが無ければ対象外
    await target.click();
    assert.match(await page.textContent('[role="dialog"]'), /新UIから離れます/, id);
    await page.keyboard.press('Escape');
    assert.match(page.url(), new RegExp(`/workspace/${id}`));
  }
  // 確認を通ると移動する
  // 旧画面は外部 CDN を読むので、ここでは / を空のページに差し替えて「移動した」ことだけを確かめる
  await page.route(`${BASE}/`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>legacy stub</title>' }));
  await page.goto(`${BASE}/workspace/08`);
  await page.click('.screen-head button:has-text("現行画面で素材を登録")');
  await Promise.all([page.waitForURL(`${BASE}/`), page.click('[role="dialog"] [data-role="leave-go"]')]);
});

test('stage load is scheduled for P2', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/06`);
  await page.click('.screen-head button:has-text("ステージを読み込む")');
  const text = await page.textContent('[role="dialog"]');
  assert.match(text, /WP-04/);
  assert.match(text, /LYRIC-009/);
  assert.match(text, /NF-014/);
  const phase = await page.locator('[role="dialog"] dt:has-text("予定") + dd').textContent();
  assert.match(phase, /P2 既存機能の新UI移植/);
  assert.doesNotMatch(phase, /Phase G/);
  await page.keyboard.press('Escape');
});

test('mock playback is labelled as sample', async () => {
  const page = await newPage();
  for (const id of ['02', '05', '06', '13']) {
    await page.goto(`${BASE}/workspace/${id}`);
    const banner = page.locator('#main .sample-banner');
    assert.equal(await banner.count(), 1, `banner on ${id}`);
    assert.match(await banner.textContent(), /サンプル再生（3D未接続）/);
    assert.equal(await banner.getAttribute('role'), 'status');
  }
  for (const id of ['01', '03', '08', '18', '25']) {
    await page.goto(`${BASE}/workspace/${id}`);
    assert.equal(await page.locator('#main .sample-banner').count(), 0, `no banner on ${id}`);
  }
});

test('sample project cards are marked', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/01`);
  const cards = page.locator('.media-card:has([data-role="sample-ribbon"])');
  assert.equal(await cards.count(), 4);
  assert.match(await page.textContent('[data-role="sample-ribbon"]'), /サンプル/);
  const note = page.locator('[data-role="sample-project-note"]');
  assert.match(await note.textContent(), /今のサーバーの制作状態は1つです/);
  assert.match(await note.textContent(), /プロジェクト保存・復元（18）/);
  await note.locator('button').click();
  await atRoute(page, '18');
  harness.assertNoErrors(page);
});

test('help pages render their content', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/25`);
  const read = async (tab) => { await page.click(`[role="tab"][data-tab="${tab}"]`); return page.textContent('[role="tabpanel"]'); };
  assert.match(await read('welcome'), /新UI/);
  assert.match(await read('setup'), /初回セットアップ/);
  assert.equal(await page.locator('[role="tabpanel"] ol.steps li').count(), 4);
  assert.equal(await (async () => { await page.click('[role="tab"][data-tab="guides"]'); return page.locator('[role="tabpanel"] ul.list li').count(); })(), 6);
  assert.equal(await (async () => { await page.click('[role="tab"][data-tab="faq"]'); return page.locator('[role="tabpanel"] details.faq').count(); })(), 4);
  assert.equal(await (async () => { await page.click('[role="tab"][data-tab="glossary"]'); return page.locator('[role="tabpanel"] dt').count(); })(), 5);
  await page.click('[role="tab"][data-tab="guides"]');
  await page.click('[role="tabpanel"] ul.list li >> nth=0');
  await atRoute(page, '02');
  harness.assertNoErrors(page);
});

test('render cleanups do not accumulate when tabs are switched', async () => {
  const page = await newPage();
  await page.goto(`${BASE}/workspace/20`);
  await page.waitForSelector('[data-live] dl, [data-live] p[style]');
  const counts = [];
  const tabsCount = await page.locator('.pane-center [role="tab"]').count();
  assert.ok(tabsCount >= 4);
  for (let i = 0; i < 10; i++) {
    await page.locator('.pane-center [role="tab"]').nth(i % tabsCount).click();
    counts.push(await page.evaluate(() => window.baiStudio.cleanupCount()));
  }
  // 同じタブに戻れば同じ数に戻る（増え続けない）
  const byTab = new Map();
  counts.forEach((c, i) => { const k = i % tabsCount; if (byTab.has(k)) assert.equal(c, byTab.get(k), `tab ${k} round ${i}`); else byTab.set(k, c); });
  assert.ok(Math.max(...counts) <= 6, `cleanup count stays small: ${counts}`);
  // 別画面へ移ると前の画面の分は実行されて消える
  await page.goto(`${BASE}/workspace/22`);
  assert.equal(await page.evaluate(() => window.baiStudio.cleanupCount()), 0);
  await page.goto(`${BASE}/workspace/20`);
  for (let i = 0; i < 10; i++) {
    await page.click('#nav a[data-route="21"]');
    await page.click('#nav a[data-route="20"]');
  }
  assert.ok(await page.evaluate(() => window.baiStudio.cleanupCount()) <= 6, 'screen changes do not accumulate');
  harness.assertNoErrors(page);
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
