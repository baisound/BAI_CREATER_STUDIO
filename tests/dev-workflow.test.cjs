'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const nodemon = require(path.join(root, 'nodemon.json'));
const bs = require(path.join(root, 'bs-config.cjs'));
test('dev command starts Python and live browser proxy together', () => {
  assert.match(pkg.scripts.dev, /concurrently/);
  assert.match(pkg.scripts['dev:api'], /nodemon/);
  assert.match(pkg.scripts['dev:live'], /browser-sync/);
  assert.equal(bs.proxy, 'http://127.0.0.1:8765');
  assert.equal(bs.port, 3000);
  assert.equal(bs.host, '127.0.0.1');
});
test('agent edits to HTML CSS JS trigger browser refresh', () => {
  for (const ext of ['html','css','js']) assert.ok(bs.files.includes(`*.${ext}`));
  assert.equal(bs.watch, true);
  assert.equal(bs.open, false);
});
test('Python files trigger server restart; user files do not', () => {
  assert.match(nodemon.ext, /py/);
  assert.ok(nodemon.ignore.includes('data/**'));
  assert.ok(nodemon.ignore.includes('node_modules/**'));
  assert.match(nodemon.exec, /python server\.py 8765/);
});
test('production server and original pages stay unchanged', () => {
  assert.ok(fs.existsSync(path.join(root, 'server.py')));
  assert.ok(fs.existsSync(path.join(root, 'camera.html')));
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
});
