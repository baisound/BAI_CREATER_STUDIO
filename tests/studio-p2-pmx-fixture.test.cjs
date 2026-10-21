'use strict';
// O-④-2（P2 設計 §2.4、決定 2026-10-20）：tools/make_test_pmx.py の最小 PMX 2.0 が本物の PMX として読めることを確かめる。
// 1. Node：three@0.160.1 同梱の MMDParser で解析し、頂点3・面1・材質1・ボーン1・モーフ「あ」を確かめる。
// 2. Chromium（SwiftShader）：旧画面と同じ MMDLoader で読み、SkinnedMesh・モーフ・相対パスのテクスチャ・描画を確かめる。
// 読むのは tests/fixtures/minimal_pmx.zip（tools/make_test_pmx_zip.py の生成物）。サーバーは使わない（ポート不要）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { launchBrowser, routeThree, threeDir, skip3d, webglRenderer } = require('./helpers/studio-harness.cjs');

const ZIP = fs.readFileSync(path.join(__dirname, 'fixtures', 'minimal_pmx.zip'));

/** 標準ライブラリだけの ZIP 読み（中央ディレクトリから。格納と deflate のみ）。 */
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'ZIP の終端が見つかりません');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nlen + elen + clen;
  }
  return files;
}
const FILES = readZip(ZIP);
const PMX = FILES['model/test.pmx'];
const PNG = FILES['model/tex/a.png'];

test('fixture zip holds a PMX 2.0 and its texture', () => {
  assert.ok(PMX && PNG, 'model/test.pmx と model/tex/a.png が必要です');
  assert.equal(PMX.toString('latin1', 0, 4), 'PMX ');
  assert.equal(PMX.readFloatLE(4), 2.0);
});

test('MMDParser parses the minimal PMX', skip3d(), async () => {
  const { MMDParser } = await import(pathToFileURL(path.join(threeDir(), 'examples', 'jsm', 'libs', 'mmdparser.module.js')).href);
  const ab = PMX.buffer.slice(PMX.byteOffset, PMX.byteOffset + PMX.length);
  const pmx = new MMDParser.Parser().parsePmx(ab, true);
  assert.equal(pmx.metadata.format, 'pmx');
  assert.equal(pmx.metadata.version, 2.0);
  assert.equal(pmx.metadata.vertexCount, 3);
  assert.equal(pmx.metadata.faceCount, 1);
  assert.equal(pmx.metadata.materialCount, 1);
  assert.equal(pmx.metadata.boneCount, 1);
  assert.equal(pmx.metadata.morphCount, 1);
  assert.equal(pmx.metadata.rigidBodyCount, 0);
  assert.equal(pmx.metadata.constraintCount, 0);
  assert.deepEqual(pmx.textures, ['tex/a.png']);
  assert.equal(pmx.bones[0].name, 'センター');
  assert.equal(pmx.morphs[0].name, 'あ');
  assert.equal(pmx.morphs[0].type, 1);
  assert.equal(pmx.materials[0].faceCount, 1); // MMDParser は面の数（頂点インデックス 3 ÷ 3）にする
});

test('MMDLoader loads, textures and renders the minimal PMX', skip3d(), async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
    await routeThree(context);
    const errors = [];
    const html = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/"}}</script><body></body>`;
    await context.route('http://pmx.test/**', (route) => {
      const u = new URL(route.request().url()).pathname;
      if (u === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      if (u === '/model/test.pmx') return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: PMX });
      if (u === '/model/tex/a.png') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      errors.push(`unexpected request ${u}`);
      return route.fulfill({ status: 404, body: 'not found' });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://pmx.test/');
    const info = await page.evaluate(async () => {
      const THREE = await import('three');
      const { MMDLoader } = await import('three/addons/loaders/MMDLoader.js');
      const mesh = await new Promise((resolve, reject) => new MMDLoader().load('/model/test.pmx', resolve, undefined, reject));
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const map = mats[0].map;
      // 相対パスのテクスチャの読込を待つ
      for (let i = 0; i < 100 && !(map && map.image && map.image.width); i++) await new Promise((r) => setTimeout(r, 20));
      const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
      renderer.setSize(64, 64);
      document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.add(new THREE.AmbientLight(0xffffff, 3));
      scene.add(mesh);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 0.5, -3); // 法線は -Z 向き（両面描画）
      camera.lookAt(0, 0.5, 0);
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const px = new Uint8Array(64 * 64 * 4);
      gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 0) lit++;
      const box = new THREE.Box3().setFromObject(mesh);
      return {
        isSkinnedMesh: !!mesh.isSkinnedMesh,
        vertices: mesh.geometry.attributes.position.count,
        indices: mesh.geometry.index ? mesh.geometry.index.count : null,
        bones: mesh.skeleton.bones.map((b) => b.name),
        morphs: Object.keys(mesh.morphTargetDictionary || {}),
        materials: mats.length,
        textureLoaded: !!(map && map.image && map.image.width === 1),
        height: box.max.y - box.min.y,
        lit,
      };
    });
    assert.deepEqual(errors, []);
    assert.equal(info.isSkinnedMesh, true);
    assert.equal(info.vertices, 3);
    assert.equal(info.indices, 3);
    assert.deepEqual(info.bones, ['センター']);
    assert.deepEqual(info.morphs, ['あ']);
    assert.equal(info.materials, 1);
    assert.equal(info.textureLoaded, true, 'tex/a.png（PMX からの相対パス）が読めていません');
    assert.ok(Math.abs(info.height - 1.0) < 1e-6, `高さ ${info.height}（PMX の単位で 1.0 のはず）`);
    assert.ok(info.lit > 0, '描画されたピクセルがありません');
    const r = await webglRenderer(page);
    if (!r.gpuVerified) console.log(`# GPU 未検証（${r.renderer}）`);
    await context.close();
  } finally {
    await browser.close();
  }
});
