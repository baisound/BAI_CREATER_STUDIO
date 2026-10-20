// @ts-check
// 画面の結線の登録簿（P2 設計 §1.6）。screens.js の `{t:'feature', key}` は、ここの FEATURES[key] を呼ぶ。
// screens.js は features/*.js を import しない（キーの文字列だけを持つ。§1.13）。各 WP が自分の部品をここへ登録する。

/**
 * @typedef {{screenId: string, params: URLSearchParams, navigate: (id: string, o?: {replace?: boolean, tab?: string|null, query?: Record<string,string>}) => void, onCleanup: (fn: () => void) => void}} FeatureCtx
 * @typedef {(ctx: FeatureCtx, control: {t: string, key: string, [k: string]: any}) => HTMLElement | HTMLElement[] | null} FeatureFn
 */

import { importButton, assetCategories, assetLibrary, assetDetail, recentImports } from './assets-view.js';
import { characterList, characterViewport, characterBones, useModelButton } from './character-view.js';
import { retargetPanel, retargetViewport } from './retarget-view.js';
import { motionCenter, vmdLibrary } from './motion-view.js';
import { sceneViewport, stageLoadButton, stageTransform } from './scene-view.js';
import { projectToolbar, projectStatus, projectSummary, projectHistory, projectList, projectCard } from './project-view.js';

/** @type {Record<string, FeatureFn>} */
export const FEATURES = {
  // WP-01（②）
  projectToolbar, projectStatus, projectSummary, projectHistory, projectList, projectCard,
  // WP-02・WP-03（③）
  importButton, assetCategories, assetLibrary, assetDetail, recentImports,
  // WP-04（④、ステージ配置④-11）
  characterList, characterViewport, characterBones, useModelButton, sceneViewport, stageLoadButton, stageTransform,
  // WP-04b（④-9・④-10 リターゲット検証、SCR-13）
  retargetPanel, retargetViewport,
  // WP-05a（⑤ SCR-13［編集］の1体再生）
  motionCenter, vmdLibrary,
  // WP-05b 以降が追加する。
};
