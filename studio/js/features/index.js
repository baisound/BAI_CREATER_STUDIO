// @ts-check
// 画面の結線の登録簿（P2 設計 §1.6）。screens.js の `{t:'feature', key}` は、ここの FEATURES[key] を呼ぶ。
// screens.js は features/*.js を import しない（キーの文字列だけを持つ。§1.13）。各 WP が自分の部品をここへ登録する。

/**
 * @typedef {{screenId: string, params: URLSearchParams, navigate: (id: string, o?: {replace?: boolean, tab?: string|null, query?: Record<string,string>}) => void, onCleanup: (fn: () => void) => void}} FeatureCtx
 * @typedef {(ctx: FeatureCtx, control: {t: string, key: string, [k: string]: any}) => HTMLElement | HTMLElement[] | null} FeatureFn
 */

/** @type {Record<string, FeatureFn>} */
export const FEATURES = {
  // WP-01 以降が追加する（projectToolbar・projectStatus・projectSummary・projectHistory・projectList・projectCard、
  // WP-02 の assetCategories・assetLibrary・assetDetail、…）。
};
