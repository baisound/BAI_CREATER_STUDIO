// @ts-check
// 既存 HTTP API の呼び出し窓口（P2 設計 §1.3）。新UIの fetch/XHR はすべてここを通す。
// ロジックは Python 側にある。ここは通信の失敗を分類し、日本語の1文にするだけで、送信前の検査はしない。

/** @typedef {'offline'|'timeout'|'aborted'|'conflict'|'revision_required'|'too_large'|'bad_request'|'not_found'|'forbidden'|'locked'|'unprocessable'|'client'|'unavailable'|'server'|'bad_json'} ApiErrorCode */
/** @typedef {{ok: true, status: number, data: any}} ApiOk */
/** @typedef {{ok: false, status: number, code: ApiErrorCode, message: string, serverMessage: string|null, serverCode: string|null, body: any}} ApiErr */
/** @typedef {ApiOk | ApiErr} ApiResult */
/** @typedef {{ifMatch?: string, headers?: Record<string,string>, timeoutMs?: number, signal?: AbortSignal, limitLabel?: string}} ApiOpts */

/** server.py:59 の MAX_SIZE と同じ値（テストで一致を確かめる）。 */
export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024;
/** 現在の上限（server.py:59 / 362 / 896）。Phase E WP-02b で変わったら、ここだけを直す。 */
export const LIMITS = Object.freeze({ upload: '400MB', bundle: '4MB', project: '3MB' });

/** @param {number} status @returns {ApiErrorCode} */
function codeForStatus(status) {
  switch (status) {
    case 409: return 'conflict';
    case 428: return 'revision_required';
    case 413: return 'too_large';
    case 400: return 'bad_request';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 422: return 'unprocessable';
    case 423: return 'locked';
    case 503: return 'unavailable';
    default: return status >= 500 ? 'server' : 'client';
  }
}

/**
 * @param {ApiErrorCode} code @param {number} status @param {any} body @param {string} [limitLabel]
 * @returns {ApiErr}
 */
export function makeError(code, status = 0, body = null, limitLabel) {
  const serverMessage = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : null;
  const serverCode = body && typeof body === 'object' && typeof body.error_code === 'string' ? body.error_code : null;
  /** @type {ApiErr} */
  const err = { ok: false, status, code, message: '', serverMessage, serverCode, body };
  err.message = messageFor(err, limitLabel);
  return err;
}

/**
 * ApiErr → 日本語1文（設計 §1.3 の表。固定）。
 * @param {ApiErr} err @param {string} [limitLabel]
 */
export function messageFor(err, limitLabel) {
  const sm = err.serverMessage;
  switch (err.code) {
    case 'offline': return '未接続：サーバーに接続できません。Python サーバー（npm start）が動いているか確認してください。';
    case 'timeout': return '時間切れ：サーバーの応答がありません。もう一度お試しください。';
    case 'aborted': return '取り消しました。';
    case 'conflict': return '他の画面・MCP でサーバー側が更新されています。再読込してから操作してください。';
    case 'revision_required': return '保存元の版がわかりません。再読込してください。';
    case 'too_large': return `ファイルまたはデータが大きすぎます（上限 ${limitLabel || LIMITS.upload}）。`;
    case 'bad_request': return `受け付けられませんでした：${sm || '入力を確認してください'}`;
    case 'forbidden': return `この操作は許可されていません：${sm || ''}`;
    case 'not_found': return `見つかりません：${sm || ''}`;
    case 'unprocessable': return err.serverCode === 'camera_project_invalid' && sm ? sm : `保存データを読めません：${sm || ''}`;
    case 'locked': return `復旧待ちのため保存できません：${sm || ''}`;
    case 'client': return `受け付けられませんでした（HTTP ${err.status}）：${sm || ''}`;
    case 'unavailable': return `利用できません：${sm || ''}`;
    case 'server': return `サーバーでエラーが起きました（HTTP ${err.status}）。診断ZIP（24 診断・品質）で状況を確認できます。`;
    case 'bad_json': return `サーバーの応答を読めませんでした（HTTP ${err.status}）。`;
    default: return '不明なエラーです。';
  }
}

/**
 * fetch を実行して ApiResult にする。
 * @param {string} path @param {RequestInit} init @param {ApiOpts} opts @param {number} defaultTimeout @param {'json'|'binary'} kind
 * @returns {Promise<ApiResult>}
 */
async function request(path, init, opts, defaultTimeout, kind) {
  if (opts.signal?.aborted) return makeError('aborted');
  const ctrl = new AbortController();
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? defaultTimeout;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(path, { ...init, cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) {
      let body = null;
      try { body = JSON.parse(await res.text()); } catch { /* JSON でない本文 */ }
      return makeError(codeForStatus(res.status), res.status, body, opts.limitLabel);
    }
    if (kind === 'binary') return { ok: true, status: res.status, data: await res.arrayBuffer() };
    const text = await res.text();
    try { return { ok: true, status: res.status, data: text === '' ? null : JSON.parse(text) }; } catch { return makeError('bad_json', res.status, null); }
  } catch (e) {
    const aborted = e && typeof e === 'object' && /** @type {any} */ (e).name === 'AbortError';
    if (aborted) return makeError(timedOut ? 'timeout' : 'aborted');
    return makeError('offline');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** GET（JSON）。timeoutMs 既定 15000。 @param {string} path @param {ApiOpts} [opts] */
export function getJson(path, opts = {}) {
  return request(path, { method: 'GET', headers: { Accept: 'application/json', ...(opts.headers || {}) } }, opts, 15000, 'json');
}

/** POST（JSON）。ifMatch があれば If-Match を付ける。timeoutMs 既定 30000。 @param {string} path @param {any} body @param {ApiOpts} [opts] */
export function postJson(path, body, opts = {}) {
  /** @type {Record<string,string>} */
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
  return request(path, { method: 'POST', headers, body: JSON.stringify(body) }, opts, 30000, 'json');
}

/** GET（ArrayBuffer。3D 素材用）。timeoutMs 既定 120000。 @param {string} path @param {ApiOpts} [opts] */
export function getBinary(path, opts = {}) {
  return request(path, { method: 'GET', headers: opts.headers || {} }, opts, 120000, 'binary');
}

/**
 * ファイルを送る（XMLHttpRequest）。onProgress は送信バイトの実測だけ。
 * @param {string} path @param {Blob} file
 * @param {{contentType?: string, onProgress?: (p: {loaded: number, total: number}) => void, timeoutMs?: number, limitLabel?: string, headers?: Record<string,string>}} [o]
 * @returns {{promise: Promise<ApiResult>, abort: () => void}}
 */
export function uploadFile(path, file, o = {}) {
  const { contentType = 'application/octet-stream', onProgress, timeoutMs = 600000, limitLabel = LIMITS.upload, headers = {} } = o;
  const xhr = new XMLHttpRequest();
  const promise = /** @type {Promise<ApiResult>} */ (new Promise((resolve) => {
    xhr.open('POST', path);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress && xhr.upload) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress({ loaded: e.loaded, total: e.total }); };
    xhr.onload = () => {
      const status = xhr.status;
      let body = null;
      let parsed = true;
      try { body = JSON.parse(xhr.responseText); } catch { parsed = false; }
      if (status >= 200 && status < 300) resolve(parsed ? { ok: true, status, data: body } : makeError('bad_json', status, null));
      else resolve(makeError(codeForStatus(status), status, parsed ? body : null, limitLabel));
    };
    xhr.onerror = () => resolve(makeError('offline'));
    xhr.ontimeout = () => resolve(makeError('timeout'));
    xhr.onabort = () => resolve(makeError('aborted'));
    xhr.send(file);
  }));
  return { promise, abort: () => xhr.abort() };
}
