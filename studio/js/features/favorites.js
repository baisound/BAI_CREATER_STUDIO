// @ts-check
// ⑤ お気に入り（P2 設計 §2.5 WP-05c の 6）。DOM を使わない。GET/POST /api/favorites（本文は一覧の全体）。
// 保存・削除は必ず「最新の一覧を取ってから」書く（MCP の mixamo_save_favorite などが足したものを消さないため：§5.3）。
// 同じページの中の保存は1つずつ順に行う（取得と書込みの間に自分の別の操作が入らないようにする）。
import { getJson, postJson } from '../api.js';

/** @typedef {{id: string, name: string, tags: string[], steps: {name: string}[]}} Favorite */
/** @typedef {import('../api.js').ApiErr} ApiErr */
/** @typedef {{getJson: typeof getJson, postJson: typeof postJson}} FavApi */

/** お気に入りの形に整える（壊れた項目は捨てる）。 @param {any} v @returns {Favorite[]} */
export function normalizeFavorites(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object' && typeof x.name === 'string')
    .map((x) => ({
      ...x,
      id: typeof x.id === 'string' ? x.id : '',
      name: x.name,
      tags: Array.isArray(x.tags) ? x.tags.filter((/** @type {any} */ t) => typeof t === 'string') : [],
      steps: Array.isArray(x.steps) ? x.steps.filter((/** @type {any} */ s) => s && typeof s.name === 'string').map((/** @type {any} */ s) => ({ ...s })) : [],
    }));
}

/** タグ欄の入力を配列にする（旧 :129：`[,，\n]` で分け、空を除き、重複を除く）。 @param {string} raw */
export function parseTags(raw) {
  return [...new Set(String(raw).split(/[,，\n]/).map((x) => x.trim()).filter(Boolean))];
}

/** 検索（旧 :131：空白で区切った語がすべて name・tags・steps のどれかに含まれる）。 @param {Favorite[]} list @param {string} query */
export function filterFavorites(list, query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return list.filter((fav) => {
    const corpus = `${fav.name} ${fav.tags.join(' ')} ${fav.steps.map((s) => s.name).join(' ')}`.toLowerCase();
    return terms.every((t) => corpus.includes(t));
  });
}

/** @param {FavApi} [api] */
export function createFavoritesClient(api = { getJson, postJson }) {
  /** @type {Promise<any>} */
  let tail = Promise.resolve();
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  const serial = (fn) => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };

  /** @returns {Promise<{ok: true, list: Favorite[]}|ApiErr>} */
  async function load() {
    const r = await api.getJson('/api/favorites');
    return r.ok ? { ok: true, list: normalizeFavorites(r.data) } : r;
  }

  /**
   * 最新の一覧に対して変更を加えて POST する。
   * @param {(list: Favorite[]) => Favorite[]} change
   * @returns {Promise<{ok: true, list: Favorite[]}|ApiErr>}
   */
  function mutate(change) {
    return serial(async () => {
      const cur = await api.getJson('/api/favorites');
      if (!cur.ok) return cur;
      const next = change(Array.isArray(cur.data) ? cur.data : []); // 他が足した項目は手を加えずそのまま書き戻す
      const w = await api.postJson('/api/favorites', next);
      return w.ok ? { ok: true, list: normalizeFavorites(next) } : w;
    });
  }

  /** 同じ id があれば置き換え、無ければ末尾に足す。 @param {Favorite} fav */
  const upsert = (fav) => mutate((list) => {
    const i = list.findIndex((x) => x.id === fav.id);
    if (i >= 0) { const copy = list.slice(); copy[i] = fav; return copy; }
    return [...list, fav];
  });

  /** @param {string} id */
  const remove = (id) => mutate((list) => list.filter((x) => x.id !== id));

  return { load, upsert, remove };
}

export const favoritesClient = createFavoritesClient();
