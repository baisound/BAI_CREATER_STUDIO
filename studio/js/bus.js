// @ts-check
// 画面間のイベント（P2 設計 §1.5）。名前は設計書の表で固定。増やすときは設計書を更新する。
export const bus = new EventTarget();

/** @param {string} name @param {any} [detail] */
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }

/** @param {string} name @param {(detail: any) => void} fn @returns {() => void} 購読の解除 */
export function on(name, fn) {
  /** @param {Event} e */
  const h = (e) => fn(/** @type {CustomEvent} */ (e).detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
}
