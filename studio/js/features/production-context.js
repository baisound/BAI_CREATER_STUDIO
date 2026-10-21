// @ts-check
// Issue #63-B: read-only composition of the existing project and music/dance owners.
import { getJson } from '../api.js';
import { assets, createStore, project } from '../store.js';

/** @typedef {{code: string, text: string}} ContextIssue */

/**
 * The source objects stay with their owning stores/files; this is a display snapshot only.
 * @param {any} projectState
 * @param {{project: any, revision: string}} musicEnvelope
 * @param {{status: string, items: any[]}} assetState
 */
export function composeProductionContext(projectState, musicEnvelope, assetState) {
  const savedWorkspace = projectState?.bundle?.workspace;
  const workspace = savedWorkspace || { asset: '', clip: null, frame: 0 };
  const music = musicEnvelope?.project;
  if (!music || !musicEnvelope.revision) throw Error('音楽・ダンスの保存データがありません');
  /** @type {ContextIssue[]} */ const issues = [];
  if (!savedWorkspace) issues.push({ code: 'workspace-missing', text: '保存済みのシーンはまだありません。表示中の配置は初期値で、保存データを変更していません。' });
  const sceneModelId = workspace.asset || null;
  const danceModelId = music.model_id || null;
  if (sceneModelId && danceModelId && sceneModelId !== danceModelId) issues.push({
    code: 'model-mismatch', text: 'シーンのキャラクターとダンスのモデルが異なります。撮影対象を確認してください。',
  });
  if (music.fps !== 30) issues.push({ code: 'fps', text: `音楽・ダンスの保存fpsが30ではありません（${music.fps}）。` });
  if (workspace.frame !== music.head_frame) issues.push({
    code: 'head-frame', text: `撮影位置 F${workspace.frame} と曲・ダンスの頭出し F${music.head_frame} が異なります。自動では変更しません。`,
  });
  if (assetState.status === 'error') issues.push({ code: 'assets-error', text: '素材一覧を読めないため、参照先を確認できません。' });
  else if (assetState.status === 'ready') {
    for (const [label, id] of [['シーンのキャラクター', sceneModelId], ['ダンスのモデル', danceModelId], ['ダンス', music.motion_id], ['曲', music.audio_id], ['ステージ', workspace.stage?.asset]]) {
      if (!id) continue;
      const found = assetState.items.find((item) => item.id === id);
      if (!found || !found.available) issues.push({ code: 'missing-asset', text: `${label}の元ファイルが見つかりません（${id}）。` });
    }
  }
  return {
    workspace,
    music,
    bundleRevision: projectState.revision || null,
    musicRevision: musicEnvelope.revision,
    sceneModelId,
    danceModelId,
    issues,
  };
}

export const productionContext = createStore({
  /** @type {'idle'|'loading'|'ready'|'error'} */ status: 'idle',
  /** @type {ReturnType<typeof composeProductionContext>|null} */ value: null,
  error: '',
});

/** @type {{project: any, revision: string}|null} */ let musicEnvelope = null;
let requestSeq = 0;

export function recomputeProductionContext() {
  if (!musicEnvelope) return;
  const state = project.get();
  if (state.status !== 'ready') {
    productionContext.set({ status: 'loading', value: null, error: '' }, 'project-loading');
    return;
  }
  try {
    productionContext.set({ status: 'ready', value: composeProductionContext(state, musicEnvelope, assets.get()), error: '' }, 'recomputed');
  } catch (error) {
    productionContext.set({ status: 'error', value: null, error: error instanceof Error ? error.message : String(error) }, 'composition-error');
  }
}

/** Read the independent music owner afresh. A failure never replaces either saved source. */
export async function refreshProductionContext() {
  const mine = ++requestSeq;
  productionContext.set({ status: 'loading', value: null, error: '' }, 'loading');
  const result = await getJson('/api/music-dance/project');
  if (mine !== requestSeq) return;
  if (!result.ok) {
    musicEnvelope = null;
    productionContext.set({ status: 'error', value: null, error: result.message }, 'music-load-error');
    return;
  }
  musicEnvelope = result.data;
  recomputeProductionContext();
}

project.subscribe(recomputeProductionContext);
assets.subscribe(recomputeProductionContext);
