// @ts-check
// ③ 取り込み規則（純関数。DOM もネットワークも使わない。P2 設計 §2.3(d)）。
// 拡張子 → 登録先・種類・送信前の名前の検査・既存の素材との衝突。サーバーの規則（server.py）を写したもので、サーバーは変えない（R1）。
import { MAX_UPLOAD_BYTES } from '../api.js';
import { fbxLabel } from './assets-model.js';

/** @typedef {'integrated'|'pmxZip'|'vmd'|'fbx'} Route */
/** @typedef {import('./assets-model.js').AssetItem} AssetItem */
/** @typedef {{ok: true, route: Route, label: string, kinds: {value: string, label: string}[], defaultKind: string, warnings: string[]} | {ok: false, error: string}} Classified */
/** @typedef {{name: string, route: Route, kind: string}} ImportEntry */

export { MAX_UPLOAD_BYTES };
export const IMPORT_ACCEPT = '.glb,.vrm,.zip,.vmd,.fbx';

/** コードポイントの数（サーバーの Python len と同じ。UTF-16 の単位ではない）。 @param {string} s */
const cpLen = (s) => [...s].length;
const NAME_GLB = /^[^/\\\x00]{1,180}\.glb$/iu;
const NAME_VRM = /^[^/\\\x00]{1,180}\.vrm$/iu;
const BAD_UNSUPPORTED = 'この形式には対応していません（GLB・VRM・PMX ZIP・VMD・FBX）。';
const BAD_NAME_INTEGRATED = '名前は180文字以内で、/ と \\ を含められません。';

/**
 * 拡張子で登録先を振り分け、送る前に検査できることを検査する。
 * @param {string} name @param {number} size
 * @returns {Classified}
 */
export function classifyImport(name, size) {
  const m = /\.([^.]*)$/.exec(name);
  const ext = m ? m[1].toLowerCase() : '';
  if (!['glb', 'vrm', 'zip', 'vmd', 'fbx'].includes(ext)) return { ok: false, error: BAD_UNSUPPORTED };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: '400MB を超えるファイルは登録できません。' };
  if (size === 0) return { ok: false, error: '空のファイルです。' };
  /** @type {string[]} */
  const warnings = [];
  if (ext === 'glb' || ext === 'vrm') {
    if (!(ext === 'glb' ? NAME_GLB : NAME_VRM).test(name)) return { ok: false, error: BAD_NAME_INTEGRATED };
    // GLB/VRM はサーバーが名前を二重にデコードする（server.py:764）。% を含むと別の名前で登録されることがある。
    if (name.includes('%')) warnings.push('名前に % が含まれているため、登録される名前が変わることがあります');
    return ext === 'glb'
      ? { ok: true, route: 'integrated', label: 'GLB（モデル／モーション）', kinds: [{ value: 'motion', label: 'モーション' }, { value: 'model', label: 'モデル' }], defaultKind: 'motion', warnings }
      : { ok: true, route: 'integrated', label: 'VRM モデル', kinds: [], defaultKind: 'model', warnings };
  }
  if (ext === 'zip') {
    return { ok: true, route: 'pmxZip', label: 'PMX モデル＋テクスチャ ZIP', kinds: [{ value: 'A', label: 'モデルA' }, { value: 'B', label: 'モデルB' }], defaultKind: 'A', warnings };
  }
  if (ext === 'vmd') {
    if (cpLen(name) > 180 || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
      return { ok: false, error: '名前は180文字以内で、/ と \\ を含められず、. で始められません。' };
    }
    return { ok: true, route: 'vmd', label: 'VMD モーション', kinds: [], defaultKind: '', warnings };
  }
  // fbx
  if (cpLen(name) > 250) return { ok: false, error: '名前は250文字以内にしてください。' };
  return { ok: true, route: 'fbx', label: 'FBX', kinds: [{ value: 'motions', label: 'モーション' }, { value: 'modelA', label: 'モデルA（置き換え）' }, { value: 'modelB', label: 'モデルB（置き換え）' }], defaultKind: 'motions', warnings };
}

/** 本文のハッシュ（SHA-256）を16進で。 @param {ArrayBuffer} buf */
export async function sha256Hex(buf) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('ハッシュを計算できません（http://127.0.0.1 か https で開いてください）');
  const d = new Uint8Array(await subtle.digest('SHA-256', buf));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * FBX の id（server.py:961 と同じ。sha256(kind + '\0' + name) の先頭24桁）。
 * @param {string} kind @param {string} name @returns {Promise<string>}
 */
export async function fbxIdFor(kind, name) {
  const bytes = new TextEncoder().encode(`${kind}\0${name}`);
  return (await sha256Hex(/** @type {ArrayBuffer} */ (bytes.buffer))).slice(0, 24);
}

/** GLB/VRM の保存名（SHA-256 先頭20桁＋拡張子の小文字。server.py:771）。 @param {string} sha256hex @param {string} name */
export function integratedStoredName(sha256hex, name) {
  const m = /\.([^.]*)$/.exec(name);
  return `${sha256hex.slice(0, 20)}.${m ? m[1].toLowerCase() : ''}`;
}

/**
 * 送り先ごとの、既存の素材との衝突（上書き・置き換え・再分類）。純関数（ハッシュは呼び出し側で計算して渡す）。
 * @param {ImportEntry} entry @param {AssetItem[]} items
 * @param {{contentSha20?: string, fbxId?: string}} [hashes]
 * @returns {{kind: 'overwrite'|'reclassify'|'replaceModel'|'slotOverwrite', message: string}|null}
 */
export function conflictOf(entry, items, { contentSha20, fbxId } = {}) {
  const { name } = entry;
  if (entry.route === 'vmd') {
    if (items.some((i) => i.id === `mmd:vmd:${name}`)) {
      return { kind: 'overwrite', message: `同じ名前の VMD『${name}』があります。上書きすると元の内容は戻せません。` };
    }
    return null;
  }
  if (entry.route === 'fbx') {
    if (fbxId && items.some((i) => i.id === `fbx:${fbxId}`)) {
      return { kind: 'overwrite', message: `同じ名前の FBX『${name}』（${fbxLabel(entry.kind)}）があります。上書きすると元の内容は戻せません。` };
    }
    if (entry.kind === 'modelA' || entry.kind === 'modelB') {
      const old = items.find((i) => i.source === 'fbx' && i.kind === entry.kind);
      if (old) return { kind: 'replaceModel', message: `${fbxLabel(entry.kind)}の現在の FBX『${old.name}』は登録が外れ、元のファイルが削除されます。` };
    }
    return null;
  }
  if (entry.route === 'pmxZip') {
    if (items.some((i) => i.id.startsWith(`mmd:${entry.kind}:`) && i.format === 'PMX')) {
      return { kind: 'slotOverwrite', message: `モデル${entry.kind}には既に PMX が登録されています。ZIP の中と同じパスのファイルは上書きされます（他のファイルは残ります）。` };
    }
    return null;
  }
  if (entry.route === 'integrated' && contentSha20) {
    const id = `integrated:${integratedStoredName(contentSha20, name)}`;
    const old = items.find((i) => i.id === id);
    if (old && (old.name !== name || old.kind !== entry.kind)) {
      const oldKind = old.kind === 'model' ? 'モデル' : 'モーション';
      const newKind = entry.kind === 'model' ? 'モデル' : 'モーション';
      return { kind: 'reclassify', message: `同じ内容の素材『${old.name}』（${oldKind}）が登録済みです。続けると、名前と種類が『${name}』（${newKind}）に置き換わります（ファイルは同じものです）。` };
    }
  }
  return null;
}

const SAME_DEST = '1回の取り込みで同じ登録先に置けるのは1つです';

/**
 * 1回の取り込みの中での矛盾を、entries と同じ長さの配列で返す（矛盾の無い行は空文字）。
 * @param {ImportEntry[]} entries @returns {string[]}
 */
export function batchErrorRows(entries) {
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  entries.forEach((e, i) => {
    /** @type {string|null} */
    let key = null;
    if (e.route === 'fbx') key = e.kind === 'motions' ? `fbx-motions:${e.name}` : `fbx-${e.kind}`;
    else if (e.route === 'pmxZip') key = `pmx:${e.kind}`;
    else if (e.route === 'vmd') key = `vmd:${e.name}`;
    if (key) groups.set(key, [...(groups.get(key) || []), i]);
  });
  const out = entries.map(() => '');
  for (const idx of groups.values()) if (idx.length > 1) for (const i of idx) out[i] = SAME_DEST;
  return out;
}

/** 1回の取り込みの中での矛盾（メッセージの一覧）。 @param {ImportEntry[]} entries @returns {string[]} */
export function batchErrors(entries) {
  return batchErrorRows(entries).filter(Boolean);
}
