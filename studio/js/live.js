// @ts-check
// Read-only adapters to the existing Python API. The mock never writes through these.
// Each adapter reports failure honestly; callers show "未接続" instead of sample numbers.
import { getJson } from './api.js';

/** @typedef {{ok: true, data: any} | {ok: false, error: string}} LiveResult */

/**
 * 通信は api.js を通す。戻り値の形 {ok,data}|{ok:false,error} は変えない（画面の表示は同じ）。
 * @param {string} path
 * @returns {Promise<LiveResult>}
 */
async function get(path) {
  const r = await getJson(path);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.message };
}

/** Existing endpoints this shell may read. Keys are referenced from screen definitions. */
export const LIVE = {
  serverVersion: { label: 'サーバー版', path: '/api/server-version', run: () => get('/api/server-version') },
  projectBundle: { label: '制作状態バンドル', path: '/api/project/bundle', run: () => get('/api/project/bundle') },
  cameraProject: { label: 'カメラプロジェクト', path: '/api/camera/project?envelope=1', run: () => get('/api/camera/project?envelope=1') },
  cameraFocus: { label: 'フォーカス診断（0フレーム）', path: '/api/camera/focus?frame=0', run: () => get('/api/camera/focus?frame=0') },
  sequenceEval: { label: 'シーケンス評価（0フレーム）', path: '/api/camera/sequence/evaluate?frame=0', run: () => get('/api/camera/sequence/evaluate?frame=0') },
  aiStatus: { label: 'AI接続状態', path: '/api/ai/status', run: () => get('/api/ai/status') },
  diagnostics: { label: '最近の診断ログ', path: '/api/diagnostics/recent?limit=40', run: () => get('/api/diagnostics/recent?limit=40') },
  qaSettings: { label: '画面テスト記録設定', path: '/api/ui-qa/settings', run: () => get('/api/ui-qa/settings') },
};

/** @typedef {keyof typeof LIVE} LiveKey */

/**
 * Compact one-level summary for display; long arrays are counted, not dumped.
 * @param {any} data
 * @returns {[string, string][]}
 */
export function summarize(data) {
  if (data === null || typeof data !== 'object') return [['値', String(data)]];
  /** @type {[string, string][]} */
  const rows = [];
  for (const [k, v] of Object.entries(data).slice(0, 14)) {
    if (Array.isArray(v)) rows.push([k, `${v.length}件`]);
    else if (v && typeof v === 'object') rows.push([k, `{${Object.keys(v).slice(0, 6).join(', ')}${Object.keys(v).length > 6 ? ', …' : ''}}`]);
    else rows.push([k, String(v)]);
  }
  return rows;
}
