// @ts-check
// ③ 素材一覧の分類・絞り込み（純関数。DOM なし。Node で単体テストする。P2 設計 §2.3(d)）。

/** @typedef {{id: string, name: string, format: string, kind: string, source: string, available: boolean, previewable?: boolean, filename?: string, originalName?: string, titleSource?: string, bytes?: number, sha256?: string, mime?: string, width?: number, height?: number, duration?: number, thumbnailUrl?: string|null}} AssetItem */

/** 左の分類。順序・ラベル・アイコンは samples.js から移したもの（motion のラベルだけ「モーション」）。 */
export const ASSET_CATS = [
  { id: 'char', label: 'キャラクター', icon: 'user' },
  { id: 'stage', label: 'ステージ', icon: 'stage' },
  { id: 'prop', label: '小物', icon: 'template' },
  { id: 'mat', label: 'マテリアル', icon: 'sphere' },
  { id: 'fx', label: 'エフェクト', icon: 'sparkle' },
  { id: 'audio', label: 'オーディオ', icon: 'music' },
  { id: 'video', label: '動画', icon: 'render' },
  { id: 'image', label: '画像', icon: 'image' },
  { id: 'motion', label: 'モーション', icon: 'motion' },
];

/** 今の API に登録手段が無い分類（常に0件）と、その ◇ の説明に使う機能ID。 */
export const EMPTY_CATS = Object.freeze({});

/**
 * 一覧の item を左の分類へ。
 * @param {Pick<AssetItem, 'source'|'kind'|'format'>} item
 * @returns {'char'|'motion'|'stage'|'prop'|'mat'|'fx'|'audio'|'video'|'image'}
 */
export function categoryOf(item) {
  if (item.source === 'library') return /** @type {any} */ ({ stage: 'stage', prop: 'prop', material: 'mat', fx: 'fx', audio: 'audio', video: 'video', image: 'image' })[item.kind] || 'image';
  if (item.source === 'fbx') return item.kind === 'motions' ? 'motion' : 'char'; // kind: modelA|modelB|motions
  if (item.source === 'integrated') return item.kind === 'model' ? 'char' : 'motion';
  if (item.source === 'mmd') return item.format === 'PMX' ? 'char' : 'motion'; // PMX→char, VMD→motion
  return 'motion';
}

/** @param {string} kind */
const fbxKindLabel = (kind) => (kind === 'modelA' ? 'モデルA' : kind === 'modelB' ? 'モデルB' : 'モーション');

/** 登録元の表示名。 @param {Pick<AssetItem, 'source'|'kind'>} item */
export function sourceLabel(item) {
  if (item.source === 'library') return '素材ライブラリ登録';
  if (item.source === 'fbx') return `FBX登録（${fbxKindLabel(item.kind)}）`;
  if (item.source === 'integrated') return 'GLB / VRM 登録';
  if (item.source === 'mmd') return item.kind === 'A' ? 'MMD スロットA' : item.kind === 'B' ? 'MMD スロットB' : 'MMD VMD';
  return String(item.source || '不明');
}

/** 取り込みで使う種類の表示名。 @param {string} kind */
export const fbxLabel = fbxKindLabel;

/** @param {Pick<AssetItem, 'source'|'kind'|'format'>} item */
export function kindLabel(item) {
  if (item.source === 'library') return ({ stage: 'ステージ', prop: '小物', material: 'マテリアル', fx: 'エフェクト素材', audio: 'オーディオ', video: '動画', image: '画像' })[item.kind] || '素材';
  if (item.source === 'integrated') return item.kind === 'model' ? 'モデル' : 'モーション';
  if (item.source === 'fbx') return fbxKindLabel(item.kind);
  return item.format === 'PMX' ? 'モデル' : 'モーション';
}

/**
 * @param {AssetItem[]} items
 * @param {{cat?: string, q?: string, fmt?: string, sort?: 'api'|'name'|'format'|string}} o
 * @returns {AssetItem[]}
 */
export function filterAssets(items, { cat = 'all', q = '', fmt = 'all', sort = 'api' } = {}) {
  const query = String(q || '').trim().toLowerCase();
  let list = items.filter((it) => {
    if (cat !== 'all' && categoryOf(it) !== cat) return false;
    if (fmt !== 'all' && it.format !== fmt) return false;
    if (query && !String(it.name).toLowerCase().includes(query)) return false;
    return true;
  });
  // 'fav'・'tag:' などの分類は今の API に素材が無い
  if (cat !== 'all' && !ASSET_CATS.some((x) => x.id === cat)) list = [];
  if (sort === 'name') list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
  else if (sort === 'format') list = [...list].sort((a, b) => String(a.format).localeCompare(String(b.format)) || String(a.name).localeCompare(String(b.name), 'ja'));
  return list;
}

/** @param {AssetItem[]} items */
export function countByCategory(items) {
  const n = { all: items.length, char: 0, motion: 0, stage: 0, prop: 0, mat: 0, fx: 0, audio: 0, video: 0, image: 0 };
  for (const it of items) n[categoryOf(it)] += 1;
  return n;
}

/** 実データに現れる形式（決まった順序。未知の形式は後ろへ）。 @param {AssetItem[]} items */
export function formatsOf(items) {
  const order = ['FBX', 'GLB', 'VRM', 'PMX', 'VMD'];
  const present = new Set(items.map((i) => i.format));
  return [...order.filter((f) => present.has(f)), ...[...present].filter((f) => !order.includes(f)).sort()];
}
