// api.js の単体テスト（P2 設計 §1.3、WP-00c）。fetch / XMLHttpRequest を差し替えて、
// 状態コードと error_code の割当、日本語の文言、limitLabel、時間切れ・取消を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson, postJson, getBinary, uploadFile, messageFor, makeError, MAX_UPLOAD_BYTES, LIMITS } from '../studio/js/api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

/** @param {number} status @param {any} body */
const respond = (status, body, raw) => async () => new Response(raw !== undefined ? raw : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('status codes map to error codes', async () => {
  const table = { 409: 'conflict', 428: 'revision_required', 413: 'too_large', 400: 'bad_request', 403: 'forbidden', 404: 'not_found', 422: 'unprocessable', 423: 'locked', 503: 'unavailable', 418: 'client', 401: 'client', 500: 'server', 502: 'server' };
  for (const [status, code] of Object.entries(table)) {
    globalThis.fetch = respond(Number(status), { error: 'x' });
    const r = await getJson('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, code, `HTTP ${status}`);
    assert.equal(r.status, Number(status));
  }
});

test('error body: serverMessage and serverCode are extracted, non-JSON bodies are tolerated', async () => {
  globalThis.fetch = respond(422, { error: 'カメラ保存データを読めません', error_code: 'camera_project_invalid', backup: 'camera_project.bad.json' });
  let r = await getJson('/api/project/bundle');
  assert.equal(r.ok, false);
  assert.equal(r.serverMessage, 'カメラ保存データを読めません');
  assert.equal(r.serverCode, 'camera_project_invalid');
  assert.equal(r.body.backup, 'camera_project.bad.json');
  assert.equal(r.message, 'カメラ保存データを読めません', 'camera_project_invalid uses the server sentence as is');
  globalThis.fetch = respond(500, null, '<html>boom</html>');
  r = await getJson('/api/x');
  assert.equal(r.code, 'server');
  assert.equal(r.serverMessage, null);
  assert.equal(r.body, null);
  assert.match(r.message, /HTTP 500/);
});

test('messages are the fixed Japanese sentences', () => {
  const e = (code, status = 0, body = null, label) => makeError(code, status, body, label).message;
  assert.match(e('offline'), /^未接続：サーバーに接続できません。Python サーバー（npm start）/);
  assert.equal(e('timeout'), '時間切れ：サーバーの応答がありません。もう一度お試しください。');
  assert.equal(e('aborted'), '取り消しました。');
  assert.equal(e('conflict', 409), '他の画面・MCP でサーバー側が更新されています。再読込してから操作してください。');
  assert.equal(e('revision_required', 428), '保存元の版がわかりません。再読込してください。');
  assert.equal(e('too_large', 413, null, '4MB'), 'ファイルまたはデータが大きすぎます（上限 4MB）。');
  assert.equal(e('too_large', 413), `ファイルまたはデータが大きすぎます（上限 ${LIMITS.upload}）。`);
  assert.equal(e('bad_request', 400, { error: 'invalid combination cursor' }), '受け付けられませんでした：invalid combination cursor');
  assert.equal(e('bad_request', 400), '受け付けられませんでした：入力を確認してください');
  assert.equal(e('forbidden', 403, { error: 'no' }), 'この操作は許可されていません：no');
  assert.equal(e('not_found', 404, { error: 'asset' }), '見つかりません：asset');
  assert.equal(e('unprocessable', 422, { error: 'bad', error_code: 'other' }), '保存データを読めません：bad');
  assert.equal(e('locked', 423, { error: 'recovery' }), '復旧待ちのため保存できません：recovery');
  assert.equal(e('client', 418, { error: 'teapot' }), '受け付けられませんでした（HTTP 418）：teapot');
  assert.equal(e('unavailable', 503, { error: 'blender' }), '利用できません：blender');
  assert.equal(e('server', 500), 'サーバーでエラーが起きました（HTTP 500）。診断ZIP（24 診断・品質）で状況を確認できます。');
  assert.equal(e('bad_json', 200), 'サーバーの応答を読めませんでした（HTTP 200）。');
});

test('limitLabel from opts is used in the 413 message', async () => {
  globalThis.fetch = respond(413, { error: 'too big' });
  const r = await postJson('/api/project', {}, { limitLabel: '3MB' });
  assert.equal(r.ok, false);
  assert.match(r.message, /上限 3MB/);
});

test('network failure is offline; unreadable 200 body is bad_json', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  let r = await getJson('/api/x');
  assert.equal(r.ok === false && r.code, 'offline');
  globalThis.fetch = respond(200, null, 'not json');
  r = await getJson('/api/x');
  assert.equal(r.ok === false && r.code, 'bad_json');
  globalThis.fetch = respond(200, { a: 1 });
  r = await getJson('/api/x');
  assert.deepEqual(r, { ok: true, status: 200, data: { a: 1 } });
});

test('timeout and caller abort are told apart', async () => {
  // 応答しない fetch：signal が abort されたら AbortError で終わる
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  let r = await getJson('/api/slow', { timeoutMs: 30 });
  assert.equal(r.ok === false && r.code, 'timeout');
  const ctrl = new AbortController();
  const p = getJson('/api/slow', { signal: ctrl.signal, timeoutMs: 5000 });
  setTimeout(() => ctrl.abort(), 20);
  r = await p;
  assert.equal(r.ok === false && r.code, 'aborted');
  const pre = new AbortController(); pre.abort();
  r = await getJson('/api/slow', { signal: pre.signal, timeoutMs: 5000 });
  assert.equal(r.ok === false && r.code, 'aborted');
});

test('postJson sends JSON and If-Match; getJson never caches', async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return new Response('{"ok":1}', { status: 200 }); };
  await postJson('/api/project', { a: 1 }, { ifMatch: 'rev-1', headers: { 'X-Test': 'y' } });
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['If-Match'], 'rev-1');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.equal(seen.init.headers['X-Test'], 'y');
  assert.equal(seen.init.body, '{"a":1}');
  await postJson('/api/project', {});
  assert.equal(seen.init.headers['If-Match'], undefined);
  await getJson('/api/x');
  assert.equal(seen.init.cache, 'no-store');
  assert.equal(seen.init.headers.Accept, 'application/json');
});

test('getBinary returns an ArrayBuffer', async () => {
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  const r = await getBinary('/files/a.glb');
  assert.equal(r.ok, true);
  assert.deepEqual([...new Uint8Array(r.data)], [1, 2, 3]);
  globalThis.fetch = respond(404, { error: 'gone' });
  const e = await getBinary('/files/a.glb');
  assert.equal(e.ok === false && e.code, 'not_found');
});

test('uploadFile reports real progress and maps results (XMLHttpRequest stub)', async () => {
  class FakeXhr {
    constructor() { FakeXhr.last = this; this.upload = {}; this.headers = {}; }
    open(m, u) { this.method = m; this.url = u; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    send(body) { this.body = body; }
    abort() { this.onabort && this.onabort(); }
  }
  const g = globalThis;
  g.XMLHttpRequest = FakeXhr;
  try {
    const progress = [];
    const up = uploadFile('/api/upload', new Blob(['abc']), { contentType: 'model/gltf-binary', onProgress: (p) => progress.push(p) });
    const x = FakeXhr.last;
    assert.equal(x.method, 'POST');
    assert.equal(x.headers['Content-Type'], 'model/gltf-binary');
    x.upload.onprogress({ lengthComputable: true, loaded: 1, total: 3 });
    x.upload.onprogress({ lengthComputable: false, loaded: 2, total: 0 });
    assert.deepEqual(progress, [{ loaded: 1, total: 3 }]);
    x.status = 200; x.responseText = '{"id":"a1"}'; x.onload();
    assert.deepEqual(await up.promise, { ok: true, status: 200, data: { id: 'a1' } });

    const big = uploadFile('/api/upload', new Blob(['x']));
    FakeXhr.last.status = 413; FakeXhr.last.responseText = '{"error":"too big"}'; FakeXhr.last.onload();
    const r = await big.promise;
    assert.equal(r.ok === false && r.code, 'too_large');
    assert.match(r.ok ? '' : r.message, /上限 400MB/);

    const off = uploadFile('/api/upload', new Blob(['x']));
    FakeXhr.last.onerror();
    assert.equal((await off.promise).ok === false && (await off.promise).code, 'offline');

    const cancel = uploadFile('/api/upload', new Blob(['x']));
    cancel.abort();
    assert.equal((await cancel.promise).ok === false && (await cancel.promise).code, 'aborted');

    const to = uploadFile('/api/upload', new Blob(['x']));
    FakeXhr.last.ontimeout();
    assert.equal((await to.promise).ok === false && (await to.promise).code, 'timeout');
  } finally { delete g.XMLHttpRequest; }
});

test('MAX_UPLOAD_BYTES matches server.py MAX_SIZE; LIMITS are the current server limits', () => {
  const src = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
  const m = src.match(/MAX_SIZE\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(m, 'MAX_SIZE found in server.py');
  assert.equal(MAX_UPLOAD_BYTES, Number(m[1]) * 1024 * 1024);
  assert.equal(LIMITS.upload, '400MB');
  assert.ok(Object.isFrozen(LIMITS));
});

test('messageFor accepts an ApiErr directly', () => {
  const err = makeError('bad_request', 400, { error: 'x' });
  assert.equal(messageFor(err), err.message);
});
