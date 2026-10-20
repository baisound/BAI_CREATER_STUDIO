// @ts-check
// 共有する旧 JS（UMD）を1回だけ <script> で読み込む（P2 設計 §1.8）。

/** @type {Map<string, Promise<void>>} */
const loaded = new Map();

/**
 * 読み込みに失敗したら reject する（呼び出し側が状態を表示する）。
 * @param {string} src
 * @returns {Promise<void>}
 */
export function loadLegacyScript(src) {
  const cached = loaded.get(src);
  if (cached) return cached;
  const p = /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve(undefined);
    s.onerror = () => { loaded.delete(src); reject(new Error(`旧スクリプトを読み込めません: ${src}`)); };
    document.head.append(s);
  }));
  loaded.set(src, p);
  return p;
}

/** 書いた順番どおりに読む。 @param {string[]} list */
export async function loadLegacyScripts(list) {
  for (const src of list) await loadLegacyScript(src);
}
