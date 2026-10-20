'use strict';
// Browser regression: legacy index.html <main> keeps a usable height and camera.html frame input is not stretched.
// Skipped when Chromium is unavailable.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.LEGACY_UI_TEST_PORT || 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

test('legacy UI layout', { skip: !fs.existsSync(exe) && 'chromium not available' }, async () => {
  const server = spawn(python, ['server.py', String(PORT)], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/server-version`)).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 200)); }
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1500);
    const h = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().height);
    assert.ok(h > 300, `main height ${h}`);
    assert.equal(errs.filter((m) => /insertBefore/.test(m)).length, 0, errs.join('\n'));
    await page.goto(`${BASE}/camera.html`); await page.waitForTimeout(1000);
    const fh = await page.evaluate(() => document.getElementById('frame-number').getBoundingClientRect().height);
    assert.ok(fh < 60, `frame-number height ${fh}`);
    await page.click('#next', { timeout: 3000 });
  } finally { if (browser) await browser.close(); server.kill(); }
});
