// 旧UI（index.html / camera.html）の動作インベントリ採取スクリプト。
// 使い方: python server.py 8799 &  →  node tools/legacy_ui_inventory.mjs [baseUrl]
// three.js は cdn.jsdelivr.net(403)の代わりに THREE_DIR（既定 node_modules/three）へルーティングする。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8799';
const THREE_DIR = process.env.THREE_DIR || path.resolve('node_modules/three');
const OUT_DIR = path.resolve('docs/ui/legacy_inventory');
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/legacy_ui_shots';
const PAGES = [['index', '/index.html'], ['camera', '/camera.html']];
const DANGER = /delete|削除|reset|リセット|初期化|上書き|clear|消去|remove|破棄|wipe/i;
fs.mkdirSync(OUT_DIR, { recursive: true }); fs.mkdirSync(SHOT_DIR, { recursive: true });

const MIME = { '.js': 'text/javascript', '.json': 'application/json' };
async function routeThree(page) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)/, (route) => {
    const rel = route.request().url().match(/three@[^/]+\/([^?#]*)/)[1];
    const f = path.join(THREE_DIR, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
  });
}

// ページ内で実行: 可視の操作要素を列挙し data-inv 属性で印を付ける
const ENUM = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const sel = 'button,input,select,textarea,a[href],[role=button],[role=tab],summary,[onclick]';
  const list = []; let n = 0;
  document.querySelectorAll(sel).forEach((e) => {
    e.removeAttribute('data-inv');
    const r = e.getBoundingClientRect();
    const label = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || e.placeholder || (e.labels && e.labels[0] && e.labels[0].innerText) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const fieldset = e.closest('fieldset,section,details,aside,nav,header,main,.panel,.card');
    const grp = fieldset ? ((fieldset.querySelector('legend,summary,h1,h2,h3,h4') || {}).innerText || fieldset.id || fieldset.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    const visible = vis(e);
    const id = n++; e.setAttribute('data-inv', id);
    list.push({ idx: id, tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '', label, group: grp, visible, disabled: !!e.disabled,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], href: e.getAttribute('href') || '' });
  });
  return list;
};

// レイアウト崩れ検出
const LAYOUT = () => {
  const W = innerWidth, H = innerHeight, de = document.documentElement;
  const issues = [];
  const hscroll = de.scrollWidth - W;
  if (hscroll > 2) issues.push({ kind: 'horizontal-scroll', detail: `scrollWidth ${de.scrollWidth} > viewport ${W}` });
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && (r.width > 0 || r.height > 0) ? r : null; };
  const ctl = [...document.querySelectorAll('button,input,select,textarea,a[href]')];
  let zero = 0, off = 0, over = 0; const ex = { zero: [], off: [], over: [] };
  for (const e of ctl) {
    const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || e.type === 'hidden') continue;
    if (e.closest('details:not([open])') && !e.matches('summary')) continue;
    const r = e.getBoundingClientRect(); const nm = e.id || e.innerText?.trim().slice(0, 20) || e.tagName;
    if (r.width < 2 || r.height < 2) { zero++; if (ex.zero.length < 8) ex.zero.push(nm); continue; }
    if (r.right < 0 || r.left > W) { off++; if (ex.off.length < 8) ex.off.push(nm); }
    else if (r.right > W + 2) { over++; if (ex.over.length < 8) ex.over.push(nm); }
  }
  if (zero) issues.push({ kind: 'zero-size-controls', count: zero, examples: ex.zero });
  if (off) issues.push({ kind: 'offscreen-controls(x)', count: off, examples: ex.off });
  if (over) issues.push({ kind: 'overflow-right-controls', count: over, examples: ex.over });
  // 主要パネル同士の重なり（position:fixed/absolute または大きな直下ブロック）
  const panels = [...document.body.querySelectorAll('body > *, body > * > *, aside, section, fieldset, canvas, header, nav')].filter((e) => { const r = vis(e); return r && r.width > 80 && r.height > 40 && !['SCRIPT', 'STYLE'].includes(e.tagName); });
  const pr = panels.map((e) => ({ e, r: e.getBoundingClientRect() }));
  const pairs = [];
  for (let i = 0; i < pr.length && pairs.length < 12; i++) for (let j = i + 1; j < pr.length; j++) {
    const a = pr[i], b = pr[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 20 && h > 20) { const nm = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
      pairs.push({ a: nm(a.e), b: nm(b.e), overlap: [Math.round(w), Math.round(h)] }); if (pairs.length >= 12) break; }
  }
  if (pairs.length) issues.push({ kind: 'overlapping-panels', count: pairs.length, examples: pairs });
  const bodyH = de.scrollHeight;
  return { viewport: [W, H], docSize: [de.scrollWidth, bodyH], issues, stylesheets: [...document.styleSheets].map((s) => { try { return s.href || 'inline(' + s.cssRules.length + ')'; } catch { return s.href; } }) };
};

const report = { generatedAt: new Date().toISOString(), base: BASE, viewport: '1600x900', threeDir: THREE_DIR, pages: {} };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });

for (const [name, url] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: false });
  const page = await ctx.newPage();
  await routeThree(page);
  const rec = { url, consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [] };
  let cur = null; // 現在操作中の要素に紐づけるためのバッファ
  const sink = { c: [], p: [], n: [] };
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text().slice(0, 300); rec.consoleErrors.push(t); sink.c.push(t); } });
  page.on('pageerror', (e) => { const t = String(e.message).slice(0, 300); rec.pageErrors.push(t); sink.p.push(t); });
  page.on('requestfailed', (r) => { const t = `${r.method()} ${r.url().slice(0, 150)} ${r.failure()?.errorText}`; rec.failedRequests.push(t); sink.n.push(t); });
  page.on('response', (r) => { if (r.status() >= 400) { const t = `${r.status()} ${r.request().method()} ${r.url().slice(0, 150)}`; rec.badResponses.push(t); sink.n.push(t); } });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('download', (d) => d.cancel().catch(() => {}));
  page.on('popup', (p) => p.close().catch(() => {}));
  await page.goto(BASE + url, { waitUntil: 'load', timeout: 30000 }).catch((e) => rec.pageErrors.push('goto: ' + e.message));
  await page.waitForTimeout(3000);
  rec.title = await page.title();
  rec.layout = await page.evaluate(LAYOUT);
  rec.bodyTextSample = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300);
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}_full.png`), fullPage: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}_viewport.png`) });
  // 解像度別レイアウト判定（1280x720 / 1600x900 / 1920x1080）
  rec.layoutByViewport = {};
  for (const [w, h] of [[1280, 720], [1600, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500);
    const L = await page.evaluate(LAYOUT);
    rec.layoutByViewport[`${w}x${h}`] = { docSize: L.docSize, issues: L.issues };
    if (w !== 1600) await page.screenshot({ path: path.join(SHOT_DIR, `${name}_${w}x${h}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1600, height: 900 }); await page.waitForTimeout(300);
  const controls = await page.evaluate(ENUM);
  rec.controlCount = controls.length; rec.visibleControlCount = controls.filter((c) => c.visible).length;
  rec.controls = [];
  const startUrl = page.url();
  for (const c of controls) {
    const row = { ...c, result: '', detail: '' };
    const text = `${c.label} ${c.id}`;
    if (!c.visible) { row.result = '非表示(未操作)'; rec.controls.push(row); continue; }
    if (c.disabled) { row.result = '無効(disabled)'; rec.controls.push(row); continue; }
    if (c.type === 'file') { row.result = 'スキップ(ファイル選択)'; rec.controls.push(row); continue; }
    if (DANGER.test(text)) { row.result = 'スキップ(破壊的操作)'; rec.controls.push(row); continue; }
    if (/download|ダウンロード|書き出|export|エクスポート/i.test(text) && c.tag !== 'input') { row.result = 'スキップ(ダウンロード/書き出し)'; rec.controls.push(row); continue; }
    if (c.tag === 'a' && /^https?:\/\//.test(c.href) && !c.href.startsWith(BASE)) { row.result = 'スキップ(外部リンク)'; rec.controls.push(row); continue; }
    sink.c.length = sink.p.length = sink.n.length = 0;
    const before = await page.evaluate(() => document.body.innerText.length + '|' + document.querySelectorAll('*').length + '|' + document.body.innerHTML.length);
    const loc = page.locator(`[data-inv="${c.idx}"]`);
    try {
      if (c.tag === 'select') {
        const opts = await loc.evaluate((s) => [...s.options].map((o) => o.value));
        if (opts.length > 1) await loc.selectOption(opts[opts.length > 2 ? 1 : opts.length - 1], { timeout: 2500 }); else { row.result = '変化なし(選択肢1件以下)'; rec.controls.push(row); continue; }
      } else if (c.tag === 'textarea' || (c.tag === 'input' && ['text', 'search', 'number', 'url', 'email', ''].includes(c.type))) {
        await loc.fill(c.type === 'number' ? '1' : 'test', { timeout: 2500 });
      } else if (c.tag === 'input' && c.type === 'range') {
        await loc.evaluate((e) => { e.value = e.min || 0; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      } else if (c.tag === 'input' && c.type === 'color') {
        await loc.evaluate((e) => { e.value = '#336699'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      } else {
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        await loc.click({ timeout: 2500 });
      }
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => document.body.innerText.length + '|' + document.querySelectorAll('*').length + '|' + document.body.innerHTML.length).catch(() => before);
      const nav = page.url() !== startUrl;
      if (sink.p.length) { row.result = 'JSエラー'; row.detail = sink.p[0]; }
      else if (sink.n.length) { row.result = 'ネットワークエラー'; row.detail = sink.n[0]; }
      else if (sink.c.length) { row.result = 'JSエラー(console)'; row.detail = sink.c[0]; }
      else if (nav) { row.result = '画面遷移'; row.detail = page.url(); }
      else if (before !== after) row.result = '変化あり';
      else row.result = 'エラーなし(目に見える変化なし)';
    } catch (e) {
      const m = String(e.message).split('\n')[0].slice(0, 200);
      row.result = /intercepts pointer|outside of the viewport|not visible|Timeout/.test(m) ? '操作不能' : 'エラー(操作失敗)'; row.detail = m;
    }
    rec.controls.push(row);
    if (page.url() !== startUrl) { await page.goto(startUrl, { waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(800); await page.evaluate(ENUM); }
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}_after.png`), fullPage: true }).catch(() => {});
  const tally = {}; for (const c of rec.controls) tally[c.result] = (tally[c.result] || 0) + 1;
  rec.tally = tally;
  report.pages[name] = rec;
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT_DIR, 'inventory.json'), JSON.stringify(report, null, 1));
for (const [n, r] of Object.entries(report.pages)) console.log(n, 'controls', r.controlCount, 'visible', r.visibleControlCount, 'pageErrors', r.pageErrors.length, 'console', r.consoleErrors.length, 'net', r.failedRequests.length + r.badResponses.length, JSON.stringify(r.tally), 'layout', r.layout.issues.map((i) => i.kind).join(','));
