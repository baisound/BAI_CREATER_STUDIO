// @ts-check
import { img, CAM_PRESETS, LENS_PRESETS, SHOT_TEMPLATES, ASSETS } from './samples.js';
// 27 screen definitions. SCR-01..25: handoff inventory; SCR-26/27: owner-approved FX/lyrics placement.
// Status of every panel is from the repository audit in docs/ui/STUDIO_UI_AUDIT_JA.md:
//   real    = reads an existing Python API (read-only from this shell)
//   partial = code exists in the current UI (/, /camera.html) but is not ported here yet
//   mock    = local sample state only ("サンプル表示"), nothing is saved
//   unimpl  = no implementation; clicking explains where it sits on the roadmap
// `real` の区画は `evidence`（'<テストファイル>::<テスト名>'）が必須。シェル自体が機能を果たす区画（テーマ・ヘルプ）は
// `shell: true` を付け、evidence は tests/studio-ui.test.cjs を指す（P2 設計 §1.13、tests/test_screen_status_honesty.mjs が検査）。
// `real` 以外の区画は新UIで薄く表示され「未接続（まだ使えません）」と出る（OWNER-3）。

/** @typedef {import('./ui.js').Status} Status */
/**
 * @typedef {{t: string, [k: string]: any}} Control
 * @typedef {{title: string, status?: Status, note?: string, evidence?: string, shell?: boolean, controls: Control[]}} Section
 * @typedef {{id: string, label: string, sections: Section[], custom?: string}} Tab
 * @typedef {{name: string, status: Status, note?: string, ids?: string[], evidence?: string, shell?: boolean}} Panel
 * @typedef {{
 *   id: string, title: string, nav: string, group: string, summary: string,
 *   classification: string, ids: string[], panels: Panel[],
 *   existing?: {label: string, href: string}[], live?: string[],
 *   modes?: string[], tools?: Control[],
 *   left?: {title: string, status: Status, list?: any[], tree?: boolean, search?: boolean, controls?: Control[], custom?: string},
 *   center: {type: string, [k: string]: any},
 *   right?: {tabs: Tab[]},
 *   bottom?: {type: 'timeline', status: Status, fps: number, frames: number, tracks: any[], demoEditable?: boolean} | null,
 * }} Screen
 */

export const PH = {
  E: 'Phase E カメラ（承認済み・進行中）',
  F: 'Phase F レンダリング（承認済み・Phase E の後）',
  LIP: 'リップシンク・表情モーフ（承認済み・Phase E の後、F の前。所有者決定 2026-10-20）。MMDエフェクトは F の後',
  FX: 'MMDエフェクト（承認済み・Phase F とリップシンク／表情の後、Phase C の前）',
  C: 'Phase C マルチダンサー（承認済み）',
  D: 'Phase D 音楽同期・表情（承認済み）',
  G: 'Phase G リリック・ステージ（承認済み）',
  H: 'Phase H 格闘・演出・ステージ（承認済み）',
  P2: 'P2 既存機能の新UI移植（Phase E より前・作業の流れ順。所有者決定 2026-10-20）',
  P4: 'P4 新規機能候補（未承認・承認まで実装しない）',
  B: 'Phase B 残課題（保持・E/F のブロッカーにしない）',
  OBS: 'Phase 00 ログ基盤（OBS、仕様決定済み）',
};

/* ---- control shorthands ---- */
/** @param {string} label @param {string} act @param {Record<string, any>} [x] */
const btn = (label, act, x = {}) => ({ t: 'btn', label, act, ...x });
/**
 * 未実装ボタン。`next` は「今できること」の案内（同じ画面の tools に旧画面へのリンクがあり、
 * 旧画面で実際に行えるものだけに書く。P2 設計 §3 WP-00c / v5 C8）。書かなければ既定の案内と［ホームへ］が出る。
 * @param {string} label @param {string} why @param {string[]} ids @param {string} phase
 * @param {{text: string, label: string, act: string}} [next] */
const un = (label, why, ids, phase, next) => btn(label, 'unimpl', { why, ids, phase, next });
/** @param {string} label @param {number} min @param {number} max @param {number} value @param {string} [unit] @param {number} [step] */
const sl = (label, min, max, value, unit = '', step = 1) => ({ t: 'slider', label, min, max, value, unit, step });
/** @param {string} label @param {string[]} options @param {string} [value] */
const sel = (label, options, value) => ({ t: 'select', label, options, value: value || options[0] });
/** @param {string} label @param {boolean} [checked] */
const tg = (label, checked = false) => ({ t: 'toggle', label, checked });
/** @param {string} label @param {string[]} options @param {string} [value] */
const ch = (label, options, value) => ({ t: 'chips', label, options, value: value || options[0] });
/** @param {string} text */
const note = (text) => ({ t: 'note', text });
/** @param {string} key */
const live = (key) => ({ t: 'live', key });
/** @param {string} label @param {string} href */
const link = (label, href) => ({ t: 'link', label, href });
/** @param {string} prefix @param {number} n @param {(i: number) => string} [meta] */
const items = (prefix, n, meta) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, label: `${prefix} ${String(i + 1).padStart(2, '0')}`, meta: meta ? meta(i) : undefined }));

/** SCR-01 の［新規プロジェクト］5か所はすべてこれ（P2 設計 §2.2(b) / v5 C7）。作成は取り消しのできない上書きになるため、Q1 の回答まで ◇ 未実装。
 * @param {string} label @param {Record<string, any>} [x] */
export const newProjectUnimpl = (label, x = {}) => ({ ...un(label, '現在のサーバーは制作状態を1つだけ保持します。新しい制作状態を作る機能は未実装です（DATA-008 の範囲外、テンプレートからの作成は NF-019）。', ['DATA-008', 'NF-019'], PH.P2), ...x });

const CAMERA = { label: 'カメラ画面（現行）', href: '/camera.html' };
const MAIN = { label: '制作画面（現行）', href: '/' };

/** @type {NonNullable<Screen['bottom']>} */
const camTimeline = ({
  type: 'timeline', status: 'mock', fps: 30, frames: 1350,
  tracks: [
    { label: 'ショット', thumbs: ['shot-01', 'shot-02', 'shot-03', 'shot-04', 'shot-05'], clips: [[0, 150, 'Shot 01'], [150, 360, 'Shot 02'], [360, 600, 'Shot 03'], [600, 840, 'Shot 04'], [840, 1080, 'Shot 05']] },
    { label: 'カメラ', keys: [0, 90, 150, 270, 360, 480, 600, 780, 840, 1080] },
    { label: 'フォーカス', keys: [0, 150, 300, 360, 600, 900] },
    { label: 'F値 / DOF', keys: [0, 360, 840] },
    { label: '位置 X/Y/Z', keys: [0, 200, 420, 640, 900, 1200] },
  ],
});

/** @type {Screen[]} */
export const SCREENS = [
  {
    id: '01', title: 'ホーム・ダッシュボード', nav: 'ホーム', group: 'ホーム',
    summary: '制作プロジェクトの入口と全体進捗をひと目で把握する。',
    classification: 'existing_or_partial_to_audit', ids: ['DATA-008', 'CORE-013', 'NF-015', 'NF-019'],
    existing: [MAIN, CAMERA], live: ['serverVersion', 'diagnostics'],
    panels: [
      { name: '最近のプロジェクト', status: 'mock', note: '現行サーバーは単一の制作状態のみを保持。複数プロジェクト一覧は未実装。', ids: ['DATA-008'] },
      { name: 'クイックアクション', status: 'partial', note: '現行画面へのリンクのみ実在。' },
      { name: '制作ステータス', status: 'partial', note: 'Phase E 台帳（docs/roadmap/PHASE_E_IMPLEMENTATION_STATUS.json）の要約。' },
      { name: '新規作成', status: 'unimpl', note: '現在のサーバーは制作状態を1つだけ保持。新規作成は未実装（Q1 回答待ち）。テンプレート（ダンスMV等）からの作成は NF-019（未承認）。', ids: ['DATA-008', 'NF-019'] },
      { name: '通知・進捗', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', note: '/api/diagnostics/recent を読み取り表示。' },
    ],
    tools: [newProjectUnimpl('新規プロジェクト', { primary: true }), un('プロジェクトを開く', '複数プロジェクトのファイル選択・切替は未実装。現行は単一の制作状態を自動で読み込みます。', ['DATA-008'], PH.P2)],
    center: {
      type: 'home', cards: [
        { title: '最近のプロジェクト', span: 8, status: 'mock', controls: [
          { t: 'table', cols: ['名前', '種別', '最終更新', '状態'], rows: [['Sample_Project', 'ダンスMV', '—', 'サンプル'], ['Camera_Test', 'カメラ試験', '—', 'サンプル'], ['Motion_Library', 'モーション整理', '—', 'サンプル']] },
          note('一覧は仮データです。実在するのは現行サーバーの単一制作状態のみ（「プロジェクト保存・復元」画面で読み取り可能）。'),
        ] },
        { title: 'クイックアクション', span: 4, status: 'partial', controls: [
          { t: 'btns', items: [btn('カメラワーク', 'nav:02'), btn('モーション編集', 'nav:13'), btn('保存・復元', 'nav:18'), btn('診断', 'nav:24')] },
          link('現行の制作画面を開く', '/'), link('現行のカメラ画面を開く', '/camera.html'),
        ] },
        { title: '制作ステータス（Phase E 台帳）', span: 6, status: 'partial', controls: [
          { t: 'progress', rows: [['CAM-001〜018 リリース完了', 0, '0 / 18'], ['コード根拠あり（部分実装）', 100, '台帳参照'], ['UI/API/両MCP 実ブラウザー検証', 0, '0 / 18']] },
          note('2026-10-19 時点の台帳。完了判定は実モデル・実ブラウザー検証後に更新されます。'),
        ] },
        { title: '通知・進捗', span: 6, status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('diagnostics')] },
        { title: 'サーバー', span: 6, status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('serverVersion')] },
        { title: '新規作成', span: 6, status: 'unimpl', controls: [
          note('新しい制作状態を作る機能は未実装です。押すと理由と予定が表示されます。'),
          { t: 'btns', items: [newProjectUnimpl('ダンスMV'), newProjectUnimpl('カメラ試験'), newProjectUnimpl('空のプロジェクト')] },
        ] },
      ],
    },
  },
  {
    id: '02', title: 'カメラワーク・撮影設定', nav: 'カメラワーク', group: 'カメラ',
    summary: '撮影ビュー、レンズ・F値、キーフレーム、カット編集をまとめた撮影ワークスペース。',
    classification: 'existing_or_partial_to_audit', ids: ['CAM-003', 'CAM-005', 'CAM-006', 'CAM-007', 'CAM-013', 'CAM-014'],
    existing: [CAMERA], live: ['cameraProject'],
    modes: ['撮影', '編集', 'プレビュー'],
    panels: [
      { name: '3D撮影ビュー', status: 'partial', note: '現行カメラ画面に Three.js 撮影ビューあり。新UIへ未移植。', ids: ['CAM-004'] },
      { name: 'カメラプリセット', status: 'partial', note: '現行画面にカスタム構図の登録・適用あり。', ids: ['CAM-013', 'CAM-014'] },
      { name: 'レンズ・F値', status: 'partial', note: '35/50/80/135mm＋F値プリセットとFOV反映を実装済み。実DOF描画は未。', ids: ['CAM-005'] },
      { name: 'キーフレーム', status: 'partial', note: '現行画面にキー追加・Undo/Redo・補間あり。', ids: ['CAM-003'] },
      { name: 'カット編集', status: 'partial', note: 'シーケンス評価APIあり。編集UIは部分。', ids: ['CAM-015'] },
    ],
    tools: [ch('縦横比', ['16:9', '9:16', '2.39:1', '1:1']), btn('現行カメラ画面で開く', 'href:/camera.html'), un('レンダリング', '動画書き出しは Phase F の範囲です。', ['RENDER-001'], PH.F)],
    left: { title: 'カメラ・ショット', status: 'mock', search: true, list: items('Shot', 6, (i) => `${i * 8}s`).map((x, i) => ({ ...x, thumb: img(`camshot-0${(i % 5) + 1}`) })) },
    center: { type: 'viewport', img: 'viewport-shrine', pip: 'camshot-03', hud: ['Camera View', 'Shot 03', '1920×1080', '30fps'], tools: ['選択', '移動', '回転', 'ドリー', 'オービット'], foot: 'Focal 50mm · F2.8 · Focus 3.2m（サンプル値）' },
    right: { tabs: [
      { id: 'camera', label: 'カメラ', sections: [
        { title: 'カメラプリセット', status: 'mock', controls: [{ t: 'tiles', label: 'カメラプリセット', items: CAM_PRESETS }, btn('現在の設定をプリセットに保存', 'form:savePreset')] },
        { title: 'レンズ', status: 'mock', note: '現行カメラ画面では実装済み。ここでは表示のみ。', controls: [{ t: 'tiles', label: 'レンズプリセット', items: LENS_PRESETS, cols: 2 }, sl('焦点距離', 14, 200, 50, 'mm'), ch('レンズ', ['24mm', '35mm', '50mm', '85mm', '135mm'], '50mm'), sl('絞り', 1.4, 16, 2.8, 'F', 0.1), sl('ピント距離', 0.3, 30, 3.2, 'm', 0.1)] },
        { title: '姿勢', status: 'mock', controls: [sl('高さ Y', -2, 10, 1.5, 'm', 0.05), sl('チルト', -90, 90, -5, '°'), sl('パン', -180, 180, 12, '°'), sl('ロール', -45, 45, 0, '°')] },
      ] },
      { id: 'focus', label: 'フォーカス', sections: [
        { title: 'フォーカス対象', status: 'partial', note: '現行画面でボーン追従・合焦計算あり。', controls: [sel('対象部位', ['顔', '胸', '腰', '手（右）', '手（左）']), btn('フォーカス・DOF診断を開く', 'nav:03')] },
      ] },
      { id: 'rail', label: 'レール', sections: [
        { title: 'レール・パス', status: 'partial', controls: [btn('カメラレール画面を開く', 'nav:14')] },
      ] },
      { id: 'easing', label: '補間', sections: [
        { title: '補間・イージング', status: 'mock', controls: [sel('補間', ['スムーズイン・アウト', 'リニア', 'イーズイン', 'イーズアウト', 'ステップ']), { t: 'curve' }] },
      ] },
    ] },
    bottom: camTimeline,
  },
  {
    id: '03', title: 'フォーカス・DOF診断', nav: 'フォーカス・DOF', group: 'カメラ',
    summary: '被写体部位と焦点面の距離差、推定DOFの近点・遠点、失敗区間を確認する。',
    classification: 'candidate_late', ids: ['CAM-005', 'E-FOCUS-01', 'E-FOCUS-02', 'F-DOF-01'],
    existing: [CAMERA], live: ['cameraFocus'],
    panels: [
      { name: 'ボーン追従', status: 'partial', note: 'camera_focus_tracking.js にボーン追従計算あり。', ids: ['CAM-011', 'E-FOCUS-01'] },
      { name: 'フォーカスヒートマップ', status: 'unimpl', ids: ['E-FOCUS-02'] },
      { name: '実DOFプレビュー', status: 'unimpl', note: '実描画DOFは Phase F（F-DOF-01）。計算上のDOFと区別する。', ids: ['F-DOF-01'] },
      { name: '失敗区間', status: 'partial', note: '/api/camera/focus の区間診断（start/end）あり。タイムライン警告UIは未。', ids: ['E-FOCUS-02'] },
      { name: '距離グラフ', status: 'unimpl', ids: ['E-FOCUS-02'] },
    ],
    tools: [btn('現行カメラ画面で開く', 'href:/camera.html'), un('CSV/JSON出力', 'フォーカス逸脱診断の書き出しUIは未実装（E-FOCUS-02）。', ['E-FOCUS-02'], PH.E)],
    left: { title: '診断区間', status: 'mock', list: [{ id: 'a', label: '全フレーム', meta: '0–1350' }, { id: 'b', label: 'Shot 02', meta: '150–360' }, { id: 'c', label: 'Shot 03', meta: '360–600' }] },
    center: { type: 'viewport', img: 'viewport-camera', hud: ['Scene View', '焦点面ガイド'], focusPlane: true, tools: ['選択', '焦点面'], foot: '焦点面の位置はサンプル表示です。' },
    right: { tabs: [
      { id: 'diag', label: '診断', sections: [
        { title: '既存APIの診断結果（0フレーム）', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', note: '保存済みカメラ設定とガイド人体から計算。実モデル・全区間ではありません。', controls: [live('cameraFocus')] },
        { title: '判定区分', status: 'mock', controls: [{ t: 'checks', rows: [['ok', '許容範囲内', '—'], ['warn', '手前ボケ / 奥ボケ', '—'], ['', '判定不能（モデル未同期）', '—']] }] },
      ] },
      { id: 'lens', label: 'レンズ', sections: [
        { title: '診断パラメータ', status: 'mock', controls: [sl('焦点距離', 14, 200, 50, 'mm'), sl('絞り', 1.4, 16, 2.8, 'F', 0.1), sl('ピント距離', 0.3, 30, 4, 'm', 0.1), sel('対象', ['顔', '胸', '腰'])] },
        { title: '実行', status: 'unimpl', controls: [un('区間を再診断', 'パラメータ指定の再診断ボタンは新UIへ未接続（API自体は存在）。', ['E-FOCUS-02'], PH.E), un('実DOFプレビュー', '実描画の被写界深度は Phase F。', ['F-DOF-01'], PH.F)] },
      ] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 1350, tracks: [
      { label: '合焦判定', clips: [[0, 300, '許容'], [300, 420, '奥ボケ'], [420, 1350, '許容']] },
      { label: 'フォーカスキー', keys: [0, 150, 360, 600, 900] },
    ] },
  },
  {
    id: '04', title: 'シーケンス・ショット編集（初期構想）', nav: 'シーケンス（初期）', group: 'カメラ',
    summary: '初期構想のシーケンス画面。詳細は 16「シーケンス・ショット・マルチカメラ」に統合予定。',
    classification: 'existing_or_partial_to_audit', ids: ['CAM-015'],
    existing: [CAMERA], live: ['sequenceEval'],
    panels: [
      { name: 'シーケンス一覧', status: 'mock' },
      { name: 'ショット一覧', status: 'partial', note: 'camera_sequence.py にショット連結データあり。', ids: ['CAM-015'] },
      { name: 'タイムライン', status: 'mock' },
      { name: 'プレビュー', status: 'partial', note: 'camera_sequence_playback.js（現行画面）。', ids: ['CAM-015'] },
      { name: 'トランジション', status: 'unimpl', ids: ['CAM-015'] },
    ],
    tools: [btn('マルチカメラ画面（16）へ', 'nav:16')],
    left: { title: 'シーケンス', status: 'mock', list: [{ id: 's1', label: 'Main Sequence', meta: '5 shots' }, { id: 's2', label: 'Alt Sequence', meta: '3 shots' }] },
    center: { type: 'viewport', img: 'hero', hud: ['Sequence Preview'], foot: 'プレビュー描画は現行カメラ画面で利用できます。' },
    right: { tabs: [
      { id: 'shot', label: 'ショット', sections: [
        { title: '既存APIのシーケンス評価（0フレーム）', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('sequenceEval')] },
        { title: 'トランジション', status: 'unimpl', controls: [sel('種類', ['カット', 'クロスフェード', 'ワイプ']), un('トランジションを適用', 'ショット間トランジションは未実装。', ['CAM-015'], PH.E)] },
      ] },
    ] },
    bottom: camTimeline,
  },
  {
    id: '05', title: 'モーション・VMD制作（初期構想）', nav: 'モーション（初期）', group: 'モーション',
    summary: '初期構想のモーション画面。詳細は 13「モーションVMD編集・リターゲティング」に統合予定。',
    classification: 'existing_or_partial_to_audit', ids: ['MOTION-006', 'LIP-009'],
    existing: [MAIN],
    panels: [
      { name: 'モーション検索', status: 'partial', note: '現行画面に82パターンの検索・分類・お気に入りあり。', ids: ['MOTION-001', 'MOTION-017'] },
      { name: 'VMD再生', status: 'partial', note: '現行画面の PMX・VMD タブ。', ids: ['MOTION-006', 'MOTION-009'] },
      { name: 'ボーン設定', status: 'partial', note: 'retarget_ui.js のボーンマッピング。', ids: ['MOTION-005'] },
      { name: '表情レイヤー', status: 'unimpl', ids: ['LIP-009'] },
      { name: 'タイムライン', status: 'mock', ids: ['DATA-001'] },
    ],
    tools: [btn('VMD編集画面（13）へ', 'nav:13'), btn('現行の制作画面で開く', 'href:/')],
    left: { title: 'モーション検索', status: 'mock', search: true, list: items('Motion', 8, (i) => ['ダンス', '格闘', '歩行', '待機'][i % 4]) },
    center: { type: 'viewport', img: 'viewport-character', hud: ['Motion Preview'], foot: '3D再生は現行の制作画面で利用できます。' },
    right: { tabs: [
      { id: 'layer', label: 'レイヤー', sections: [
        { title: '表情レイヤー', status: 'unimpl', controls: [note('表情キーの編集と版比較は 13「VMD編集」に統合します。'), btn('表情・リップ編集（13）へ', 'nav:13')] },
        { title: '再生', status: 'mock', controls: [sel('速度', ['0.5×', '1×', '1.5×', '2×'], '1×'), tg('ループ再生', true)] },
      ] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 900, tracks: [{ label: '体', keys: [0, 120, 300, 450, 600, 840] }, { label: '表情', keys: [] }] },
  },
  {
    id: '06', title: 'シーン・ステージ・素材配置', nav: 'シーン・ステージ', group: '制作',
    summary: 'ステージ・小道具・ライトを配置し、表示と依存関係を管理する。',
    classification: 'candidate_late', ids: ['LYRIC-009', 'LYRIC-010', 'DANCE-001', 'DANCE-002', 'DANCE-003', 'DANCE-006', 'DANCE-012', 'NF-014'],
    panels: [
      { name: 'シーンツリー', status: 'mock' },
      { name: '3Dビュー', status: 'unimpl', note: 'ステージ配置ビューは未実装（モデル表示は現行画面にあり）。' },
      { name: 'トランスフォーム', status: 'mock' },
      { name: 'アセットブラウザー', status: 'mock', note: '素材管理（08）と同一索引にする方針。' },
      { name: '表示・依存関係', status: 'unimpl' },
    ],
    tools: [ch('座標系', ['ワールド', 'ローカル']), un('ステージを読み込む', 'ステージの配置は P2 ④（WP-04）で使えるようになります。大型ステージの分割読込は Phase G（LYRIC-009）です。', ['NF-014', 'LYRIC-009'], PH.P2)],
    left: { title: 'シーンツリー', status: 'mock', tree: true, list: [{ id: 'r', label: 'Scene', depth: 0 }, { id: 'st', label: 'Stage', depth: 1 }, { id: 'fl', label: 'Floor', depth: 2 }, { id: 'ch', label: 'Characters', depth: 1 }, { id: 'a', label: 'Model A', depth: 2 }, { id: 'b', label: 'Model B', depth: 2 }, { id: 'li', label: 'Lights', depth: 1 }, { id: 'k', label: 'Key Light', depth: 2 }, { id: 'cam', label: 'Camera', depth: 1 }] },
    center: { type: 'viewport', img: 'preview-shrine', hud: ['Scene View', 'Perspective'], tools: ['選択', '移動', '回転', '拡大縮小'], foot: 'ステージ配置ビューは ◇ 未実装。' },
    right: { tabs: [
      { id: 'xf', label: 'トランスフォーム', sections: [
        { title: '位置', status: 'mock', controls: [sl('X', -50, 50, 0, 'm', 0.1), sl('Y', -50, 50, 0, 'm', 0.1), sl('Z', -50, 50, 0, 'm', 0.1)] },
        { title: '回転・拡大', status: 'mock', controls: [sl('回転 Y', -180, 180, 0, '°'), sl('拡大', 0.1, 10, 1, '×', 0.1)] },
      ] },
      { id: 'vis', label: '表示', sections: [
        { title: '表示', status: 'mock', controls: [tg('表示', true), tg('影を落とす', true), tg('ロック')] },
        { title: '依存関係', status: 'unimpl', controls: [un('依存素材を表示', '素材の依存参照グラフは未実装。', [], PH.P4)] },
      ] },
      { id: 'dancers', label: 'ダンサー配置', sections: [
        { title: '複数個体と隊形', status: 'unimpl', controls: [note('登録モデルとシーン内の個体を区別します。位置交換・V字／円／列／千鳥の隊形をここで設定します。'), un('交換・隊形を編集', '複数ダンサーの配置は Phase C の承認済み要件です。', ['DANCE-001', 'DANCE-002', 'DANCE-003'], PH.C)] },
        { title: '接近と回避', status: 'unimpl', controls: [note('接近候補から回避経路を提案し、手で修正して適用後に再評価します。警告のみでは完了としません。'), un('回避経路を確認', '経路の提案・修正・再評価は未実装です。', ['DANCE-006'], PH.C)] },
      ] },
      { id: 'stage', label: '小道具・ステージ', sections: [
        { title: '小道具の接続', status: 'unimpl', controls: [un('接続骨と持ち替えを設定', '小道具の骨接続と持ち替えは未実装です。', ['DANCE-012'], PH.C)] },
        { title: '大型ステージと可動物', status: 'unimpl', controls: [note('床、チャンク／LOD、可動ピボット、依存素材の状態を確認します。'), un('ステージ詳細を編集', '大型ステージと可動物の設定は未実装です。', ['LYRIC-009', 'LYRIC-010'], PH.G)] },
      ] },
    ] },
  },
  {
    id: '07', title: 'レンダリング・出力（初期構想）', nav: 'レンダリング（初期）', group: '出力',
    summary: '初期構想の出力画面。詳細は 17「レンダリング・バッチ処理／書き出し」に統合予定。',
    classification: 'existing_or_partial_to_audit', ids: ['RENDER-001', 'RENDER-003', 'RENDER-004'],
    panels: [
      { name: 'レンダープレビュー', status: 'unimpl', ids: ['RENDER-001'] },
      { name: '動画形式', status: 'unimpl', ids: ['RENDER-004'] },
      { name: '出力プリセット', status: 'unimpl', ids: ['RENDER-006'] },
      { name: 'ジョブ進捗', status: 'unimpl', ids: ['RENDER-010'] },
      { name: '素材書き出し', status: 'partial', note: 'カメラVMD書き出し（CAM-016）は部分実装。', ids: ['CAM-016'] },
    ],
    tools: [btn('レンダリング詳細（17）へ', 'nav:17'), un('レンダリング開始', '動画レンダリングは Phase F の範囲です。偽の進捗は表示しません。', ['RENDER-001'], PH.F)],
    center: { type: 'viewport', img: 'viewport-camera', hud: ['Render Preview'], foot: 'レンダラー未接続（◇ 未実装）。' },
    right: { tabs: [
      { id: 'fmt', label: '形式', sections: [
        { title: '動画形式', status: 'unimpl', controls: [sel('形式', ['MP4 (H.264)', 'MOV (ProRes)', 'PNG連番', 'WebM']), sel('解像度', ['1920×1080', '3840×2160', '1080×1920']), sel('FPS', ['30', '60', '24'])] },
        { title: '書き出し', status: 'partial', controls: [btn('カメラVMD入出力（15）へ', 'nav:15')] },
      ] },
    ] },
  },
  {
    id: '08', title: '素材管理・アセットライブラリ', nav: '素材管理', group: '素材',
    summary: 'モデル・モーション・ステージ・音声などの素材をカテゴリ・タグで管理する。',
    classification: 'candidate_late', ids: ['MOTION-002', 'DATA-013', 'REVIEW-010', 'NF-004', 'NF-013'],
    existing: [MAIN],
    panels: [
      { name: '素材カテゴリ', status: 'mock' },
      { name: '検索・タグ', status: 'partial', note: '現行画面の統合素材ライブラリに検索・カテゴリあり。', ids: ['MOTION-002'] },
      { name: 'サムネイル', status: 'unimpl', ids: ['MOTION-016'] },
      { name: 'メタデータ', status: 'mock' },
      { name: '依存参照', status: 'unimpl', ids: ['REVIEW-010'] },
      { name: 'インポートキュー', status: 'partial', note: '現行画面の素材登録（FBX/GLB/VRM/PMX ZIP/VMD）。', ids: ['MOTION-003'] },
    ],
    tools: [btn('現行画面で素材を登録', 'href:/'), un('一括インポート', 'インポートキューの一括処理は未実装。', ['NF-004'], PH.P4), sel('並び替え', ['名前', '種別', '追加日'])],
    left: { title: '素材管理', status: 'mock', custom: 'assetCats' },
    center: { type: 'library', status: 'mock' },
    right: { tabs: [
      { id: 'meta', label: '素材の詳細', custom: 'assetDetail', sections: [
        { title: '選択中の素材', status: 'mock', controls: [{ t: 'kv', rows: [['名前', '選択してください'], ['形式', '—'], ['ライセンス', '—'], ['ハッシュ', '—']] }] },
        { title: 'タグ', status: 'mock', controls: [{ t: 'text', label: 'タグを追加', placeholder: '例: ダンス', required: false }] },
      ] },
      { id: 'deps', label: '依存参照', sections: [
        { title: '依存参照', status: 'unimpl', controls: [un('参照元を表示', '素材の参照追跡（ライセンス・生成元）は移植候補（REVIEW-010）。', ['REVIEW-010'], PH.P2)] },
      ] },
    ] },
  },
  {
    id: '09', title: 'マテリアル・シェーダー編集', nav: 'マテリアル', group: '制作',
    summary: 'PBR/MToon パラメータ・テクスチャ・ノードグラフを編集する。',
    classification: 'candidate_late', ids: ['NF-001'],
    panels: [
      { name: 'マテリアル一覧', status: 'mock' }, { name: 'PBRパラメータ', status: 'mock' }, { name: 'テクスチャ', status: 'unimpl', ids: ['NF-001'] },
      { name: 'UV', status: 'unimpl', ids: ['NF-001'] }, { name: 'ノードグラフ', status: 'mock', note: '表示のみ。シェーダー生成は NF-001（未承認）。', ids: ['NF-001'] }, { name: 'ベイク', status: 'unimpl', ids: ['NF-001'] },
    ],
    tools: [un('ベイク', 'ノード式マテリアルのベイクは未承認の新規候補（NF-001）です。', ['NF-001'], PH.P4)],
    left: { title: 'マテリアル', status: 'mock', search: true, list: ['Skin', 'Hair', 'Eye', 'Cloth_Top', 'Cloth_Skirt', 'Metal'].map((n) => ({ id: n, label: n, meta: 'MToon' })) },
    center: { type: 'graph', status: 'mock', nodes: [
      { id: 'tex', x: 30, y: 40, title: 'Texture', lines: ['BaseColor.png', 'UV0'] },
      { id: 'ramp', x: 230, y: 30, title: 'Shade Ramp', lines: ['影の色', 'しきい値'] },
      { id: 'mix', x: 230, y: 150, title: 'Rim Light', lines: ['強さ', '幅'] },
      { id: 'out', x: 440, y: 90, title: 'Material Output', lines: ['Surface'] },
    ], edges: [['tex', 'ramp'], ['tex', 'mix'], ['ramp', 'out'], ['mix', 'out']] },
    right: { tabs: [
      { id: 'pbr', label: 'パラメータ', sections: [
        { title: 'PBR / MToon', status: 'mock', controls: [sl('メタリック', 0, 1, 0, '', 0.01), sl('ラフネス', 0, 1, 0.5, '', 0.01), sl('影のしきい値', 0, 1, 0.5, '', 0.01), sl('リム強さ', 0, 2, 0.3, '', 0.05)] },
      ] },
      { id: 'tex', label: 'テクスチャ', sections: [{ title: 'テクスチャ・UV', status: 'unimpl', controls: [un('テクスチャを差し替え', 'テクスチャ・UV編集は未承認の新規候補です。', ['NF-001'], PH.P4)] }] },
    ] },
  },
  {
    id: '10', title: '音声・BGM・効果音編集', nav: '音声・BGM', group: '制作',
    summary: '楽曲・効果音・歌声のトラックを並べ、リップ同期と書き出しを行う。',
    classification: 'candidate_late', ids: ['AUDIO-001', 'LIP-001', 'LIP-002', 'LIP-003', 'LYRIC-006', 'RENDER-006', 'NF-002'],
    panels: [
      { name: '音声ライブラリ', status: 'mock' }, { name: 'マルチトラック', status: 'mock' }, { name: '波形', status: 'mock', note: '波形は装飾表示。音声デコードは未実装。' },
      { name: '歌音声の取込・配置', status: 'unimpl', ids: ['AUDIO-001'] }, { name: 'EQ・ミキサー', status: 'unimpl', ids: ['NF-002'] }, { name: 'リップ同期', status: 'unimpl', ids: ['LIP-001', 'LIP-002'] }, { name: '音声書き出し', status: 'unimpl', ids: ['RENDER-006'] },
    ],
    tools: [un('音声を読み込む', '歌音声の読込・配置・再生は AUDIO-001 としてリップシンク段階の承認済み範囲です。実音声の処理は未実装です。LYRIC-006 は拍解析を扱います。', ['AUDIO-001'], PH.LIP), un('リップVMDを生成', 'SRT/音素同期によるリップVMDはリップシンクフェーズの範囲です。', ['LIP-001', 'LIP-002'], PH.LIP)],
    left: { title: '音声ライブラリ', status: 'mock', search: true, list: [{ id: 'bgm', label: 'BGM Demo', meta: '3:12' }, { id: 'vo', label: 'Vocal Stem', meta: '3:12' }, { id: 'se1', label: 'SE Kick', meta: '0:01' }, { id: 'se2', label: 'SE Whoosh', meta: '0:02' }] },
    center: { type: 'viewport', hud: ['Mixer'], foot: 'ミキサー・EQ は ◇ 未実装（NF-002・未承認）。', plain: true },
    right: { tabs: [
      { id: 'mix', label: 'ミキサー', sections: [{ title: 'トラック', status: 'mock', controls: [sl('BGM 音量', -60, 6, 0, 'dB'), sl('Vocal 音量', -60, 6, -3, 'dB'), sl('SE 音量', -60, 6, -6, 'dB')] }, { title: 'EQ', status: 'unimpl', controls: [un('EQを開く', 'DAW型の音声編集は未承認の新規候補（NF-002）です。', ['NF-002'], PH.P4)] }] },
      { id: 'lip', label: 'リップ同期', sections: [{ title: 'リップ同期', status: 'unimpl', controls: [sel('入力', ['SRT字幕', '歌声ステム']), un('解析を開始', 'リップ同期は承認済みのリップシンクフェーズで実装予定です。', ['LIP-001', 'LIP-002'], PH.LIP)] }] },
      { id: 'sync', label: '配置・同期', sections: [{ title: '歌音声と映像', status: 'unimpl', controls: [note('AUDIO-001：実波形、開始フレーム、サンプル頭出し、映像との同期をここで確認する予定です。'), un('歌音声を配置', 'AUDIO-001 の実読込・配置・同期は未実装です。', ['AUDIO-001'], PH.LIP)] }] },
      { id: 'phoneme', label: '口形補正', sections: [{ title: '歌声と口形キー', status: 'unimpl', controls: [note('SRTの読み修正、歌声境界の手修正、子音先行・長音・促音・閉口のキーを扱います。歌詞画面と同じ確定SRT素材IDを参照しても口形キーは別トラックに保存します。'), un('口形キーを編集', '口形の解析と補正は未実装です。', ['LIP-001', 'LIP-002', 'LIP-003'], PH.LIP)] }] },
      { id: 'beat', label: '拍・イベント', sections: [{ title: '拍の解析と手動修正', status: 'unimpl', controls: [un('拍を設定', '音声からの拍解析と時刻付きマーカーは未実装です。', ['LYRIC-006'], PH.D)] }] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 5760, tracks: [{ label: 'BGM', wave: true }, { label: 'Vocal', wave: true }, { label: 'SE', clips: [[300, 330, 'Kick'], [1800, 1860, 'Whoosh']] }, { label: '口形', keys: [] }, { label: 'ビート', keys: [0, 480, 960, 1440, 1920, 2400, 2880, 3360, 3840, 4320, 4800, 5280] }] },
  },
  {
    id: '11', title: '画像管理・参照画像編集', nav: '画像管理', group: '素材',
    summary: '参照画像・テクスチャ画像をフォルダーで管理し、トリミングと版を扱う。',
    classification: 'candidate_late', ids: ['NF-003'],
    panels: [
      { name: 'フォルダー', status: 'mock' }, { name: '画像グリッド', status: 'mock' }, { name: 'プレビュー', status: 'mock' },
      { name: 'メタデータ', status: 'mock' }, { name: 'トリミング', status: 'unimpl', ids: ['NF-003'] }, { name: 'バージョン', status: 'unimpl', ids: ['NF-003'] },
    ],
    tools: [btn('素材管理（08）へ', 'nav:08'), un('トリミング', '画像編集は未承認の新規候補（NF-003）。素材管理と同一索引に統合する方針。', ['NF-003'], PH.P4)],
    left: { title: 'フォルダー', status: 'mock', tree: true, list: [{ id: 'ref', label: '参照画像', depth: 0 }, { id: 'pose', label: 'ポーズ', depth: 1 }, { id: 'stage', label: 'ステージ', depth: 1 }, { id: 'tex', label: 'テクスチャ', depth: 0 }] },
    center: { type: 'thumbs', status: 'mock', items: ASSETS.filter((a) => ['image', 'mat', 'stage', 'fx'].includes(a.cat)).map((a) => ({ id: a.id, label: a.name, meta: a.file.slice(1).toUpperCase(), img: a.img })) },
    right: { tabs: [{ id: 'meta', label: 'メタデータ', sections: [{ title: '画像情報', status: 'mock', controls: [{ t: 'kv', rows: [['名前', '—'], ['サイズ', '—'], ['タグ', '—']] }] }, { title: 'バージョン', status: 'unimpl', controls: [un('版を比較', '画像のバージョン管理は未実装。', ['NF-003'], PH.P4)] }] }] },
  },
  {
    id: '12', title: 'キャラクター管理・3Dモデル編集', nav: 'キャラクター', group: 'モーション',
    summary: 'キャラクターモデルの一覧・プレビュー・ボーン・モーフ・リターゲット・物理を扱う。',
    classification: 'existing_or_partial_to_audit', ids: ['MOTION-003', 'MOTION-004', 'MOTION-005', 'MOTION-019', 'MOTION-021', 'LIP-004', 'LIP-011', 'NF-023'],
    existing: [MAIN],
    panels: [
      { name: 'キャラクター一覧', status: 'partial', note: '現行画面の登録済みVRMモデル・PMXスロット。', ids: ['MOTION-002'] },
      { name: '3Dプレビュー', status: 'partial', note: '現行画面の3Dプレビュー（GLB/VRM）。', ids: ['MOTION-009'] },
      { name: 'ボーン・ウェイト', status: 'partial', note: 'pmx_bones.py・骨格解析あり。ウェイト編集は NF-023（未承認）。', ids: ['MOTION-005', 'NF-023'] },
      { name: '衣装', status: 'unimpl', ids: ['NF-005'] },
      { name: 'モーフ', status: 'unimpl', ids: ['LIP-004', 'LIP-011'] },
      { name: 'リターゲット', status: 'partial', note: 'retarget_*.py とマッピングUI。', ids: ['MOTION-004'] },
      { name: '物理', status: 'unimpl', ids: ['MOTION-021', 'REVIEW-009'] },
    ],
    tools: [btn('現行画面でモデルを表示', 'href:/'), un('物理ベイク', 'MMD物理ベイクは未実装（MOTION-021）。', ['MOTION-021'], PH.B)],
    left: { title: 'キャラクター', status: 'mock', search: true, list: [['baisound', 'バイサウンド', 'VRM'], ['s01', 'サンプル 01', 'VRM'], ['s02', 'サンプル 02', 'PMX'], ['s03', 'サンプル 03', 'PMX'], ['s04', 'サンプル 04', 'VRM'], ['s05', 'サンプル 05', 'GLB']].map(([id, label, meta]) => ({ id, label, meta, thumb: img(id === 'baisound' ? 'char-baisound' : `char-${id}`) })) },
    center: { type: 'viewport', img: 'viewport-character', hud: ['Model Preview', 'A-Pose'], tools: ['選択', '回転'], foot: '3D表示は現行の制作画面で利用できます。' },
    right: { tabs: [
      { id: 'bone', label: 'ボーン', sections: [{ title: 'ボーン', status: 'partial', controls: [{ t: 'list', items: ['センター', '上半身', '首', '頭', '左腕', '右腕', '左足', '右足'].map((n) => ({ id: n, label: n })) }] }] },
      { id: 'morph', label: 'モーフ', sections: [{ title: '口・目モーフ', status: 'unimpl', controls: [note('モデル別の口モーフ対応、PMX頂点変位・複合モーフ・強度、VRM expression の欠落を検査します。'), un('モーフを解析', 'モデル別口モーフ解析は未実装です。', ['LIP-004'], PH.LIP), un('顔動画から候補を取得', '顔動画／カメラの明示許可と候補の手動確定は未実装です。', ['LIP-011'], PH.D)] }] },
      { id: 'retarget', label: 'リターゲット', sections: [{ title: 'リターゲット', status: 'partial', controls: [btn('VMD編集・リターゲット（13）へ', 'nav:13')] }] },
      { id: 'physics', label: '物理', sections: [{ title: '物理', status: 'unimpl', controls: [tg('SpringBone 物理'), un('物理を比較', 'SpringBone ON/OFF 比較は移植候補（REVIEW-009）。', ['REVIEW-009'], PH.P2), note('ベイク対象、seed、時間刻み、入力hashと新規レイヤーを指定します。'), un('物理をベイク', 'MMD物理ベイクと貫通検品は未実装です。', ['MOTION-021'], PH.B)] }] },
    ] },
  },
  {
    id: '13', title: 'モーションVMD編集・リターゲティング', nav: 'VMD編集・リターゲット', group: 'モーション',
    summary: 'VMDライブラリ、3D比較、ボーンマップ、曲線、足IK、入出力をまとめたモーション編集。',
    classification: 'existing_or_partial_to_audit', ids: ['MOTION-004', 'MOTION-005', 'MOTION-006', 'MOTION-008', 'MOTION-011', 'DATA-003', 'REVIEW-001', 'LIP-005', 'LIP-006', 'LIP-007', 'LIP-008', 'LIP-009', 'LIP-010', 'DANCE-004', 'DANCE-005', 'DANCE-007', 'DANCE-008', 'DANCE-009', 'DANCE-010', 'DANCE-011', 'LYRIC-011'],
    existing: [MAIN],
    modes: ['比較', '編集'],
    panels: [
      { name: 'VMDライブラリ', status: 'partial', note: '現行画面の PMX・VMD タブ。', ids: ['MOTION-006', 'DATA-014'] },
      { name: '3D比較', status: 'partial', note: '現行画面の3視点比較・同期比較。', ids: ['REVIEW-001'] },
      { name: 'ボーンマップ', status: 'partial', note: 'retarget_ui.js / retarget_mapping_preview.py。', ids: ['MOTION-005'] },
      { name: '編集タイムライン', status: 'mock', ids: ['DATA-001'] },
      { name: '曲線', status: 'mock', ids: ['DATA-003'] },
      { name: '足IK', status: 'partial', note: 'foot_contact.py・dual_foot_plan.py（Phase B 残課題を含む）。', ids: ['MOTION-011'] },
      { name: '入出力', status: 'partial', note: 'motion_vmd_bridge.py・vmd_readback.py。', ids: ['MOTION-006'] },
    ],
    tools: [btn('現行画面で開く', 'href:/'), un('VMDを書き出す', 'この新UIからの書き出しは未接続。現行画面の変換機能を利用してください。', ['MOTION-006'], PH.P2, { text: '今は現行画面で行えます。', label: '現行画面で開く', act: 'href:/' })],
    left: { title: 'VMDライブラリ', status: 'mock', search: true, list: items('Dance', 6, (i) => `${(i + 2) * 120}f`) },
    center: { type: 'quad', labels: ['元モーション', '対象モデル', '重ね合わせ', '側面'], imgs: ['motion-dance', 'viewport-character', 'motion-walk', 'char-baisound'] },
    right: { tabs: [
      { id: 'map', label: 'ボーンマップ', sections: [{ title: 'ボーン対応', status: 'mock', controls: [{ t: 'table', cols: ['元', '対象', '状態'], rows: [['Hips', 'センター', '対応'], ['Spine', '上半身', '対応'], ['LeftUpLeg', '左足', '対応'], ['LeftFoot', '左足ＩＫ', '要確認']] }] }] },
      { id: 'ik', label: '足IK', sections: [{ title: '足IK・接地', status: 'partial', note: '接地計算は既存。新UIからは未接続。', controls: [tg('接地補正'), sl('床の高さ', -0.5, 0.5, 0, 'm', 0.01), un('接地を再計算', '新UIからの再計算は未接続（既存API移植は P2）。', ['MOTION-011'], PH.P2)] }] },
      { id: 'curve', label: '曲線', sections: [{ title: '補間曲線', status: 'mock', controls: [{ t: 'curve' }, sel('チャンネル', ['回転 X', '回転 Y', '回転 Z', '位置'])] }] },
      { id: 'expression', label: '表情・リップ', sections: [
        { title: '表情キー', status: 'unimpl', controls: [note('眉・目・瞬き・視線・感情・口形と身体キーの競合を同じ時刻で確認します。'), un('表情キーを編集', '表情・リップの重ね合わせは未実装です。', ['LIP-009'], PH.LIP)] },
        { title: '身体との連動', status: 'unimpl', controls: [un('連動候補を比較', '身体区間との表情連動は未実装です。', ['LIP-010'], PH.D)] },
      ] },
      { id: 'versions', label: '比較・版', sections: [
        { title: '許諾済みVMDの比較', status: 'unimpl', controls: [note('元・提案・適用後を同一フレームで比較し、理由と3段階評価から部分採用します。'), un('修正案を比較', 'VMD比較・提案・部分採用は未実装です。', ['LIP-005', 'LIP-006', 'LIP-007'], PH.D)] },
        { title: 'モデル別の親版と出力版', status: 'unimpl', controls: [un('版を管理', '原本を残すモデル別版管理は未実装です。', ['LIP-008'], PH.D)] },
      ] },
      { id: 'dancers', label: '複数ダンサー', sections: [
        { title: '人物別トラック', status: 'unimpl', controls: [note('カノン開始差、ミラー、主役交代、身体部位マスクを人物別に扱います。'), un('振付を編集', '複数ダンサーの編集は未実装です。', ['DANCE-004', 'DANCE-005'], PH.C)] },
        { title: '人物別VMD', status: 'unimpl', controls: [un('別名で一括出力', '人物別VMD一括出力と失敗一覧は未実装です。', ['DANCE-007'], PH.C)] },
      ] },
      { id: 'combat', label: '格闘', sections: [
        { title: '接触イベント', status: 'unimpl', controls: [note('攻撃／反応、掴み骨、接触誤差と開始／解除時刻をここで編集します。'), un('接触を編集', '格闘接触と掴みは未実装です。', ['DANCE-008', 'DANCE-009'], PH.H)] },
        { title: '連続技と起き上がり', status: 'unimpl', controls: [un('連続技を編集', 'ノックダウン、Kip Up、回避／カウンター分岐は未実装です。', ['DANCE-010', 'DANCE-011'], PH.H)] },
      ] },
      { id: 'motionExtra', label: '追加動作', sections: [{ title: '歩行・待機・呼吸', status: 'unimpl', controls: [un('動作を補完', '元VMDを保持した追加動作は未実装です。', ['LYRIC-011'], PH.G)] }] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 900, tracks: [{ label: 'センター', keys: [0, 60, 180, 300, 420, 600] }, { label: '上半身', keys: [0, 90, 240, 480, 720] }, { label: '左足IK', keys: [0, 30, 120, 210, 330] }, { label: '右足IK', keys: [15, 105, 195, 315] }, { label: '表情・リップ', keys: [] }, { label: 'ダンサー別', keys: [] }, { label: '接触イベント', keys: [] }] },
  },
  {
    id: '14', title: 'カメラレール・パスアニメーション', nav: 'カメラレール', group: 'カメラ',
    summary: 'レール・曲線パス、クレーン・ドローン等の移動プリセットとカーブを編集する。',
    classification: 'existing_or_partial_to_audit', ids: ['CAM-006', 'CAM-007', 'CAM-008', 'CAM-009', 'CAM-010'],
    existing: [CAMERA],
    panels: [
      { name: '移動プリセット', status: 'partial', note: 'ドリー・クレーン・オービット等のベイク処理あり。', ids: ['CAM-007', 'CAM-009', 'CAM-010'] },
      { name: 'レール編集', status: 'partial', note: '現行画面にレールのギズモ表示あり。', ids: ['CAM-008'] },
      { name: 'カメラ姿勢', status: 'partial', ids: ['CAM-006'] },
      { name: 'キーフレーム', status: 'partial', ids: ['CAM-003'] },
      { name: 'カーブ', status: 'mock', ids: ['CAM-003'] },
      { name: 'マルチビュー', status: 'mock' },
    ],
    tools: [btn('現行カメラ画面で開く', 'href:/camera.html'), ch('ビュー', ['上面', '側面', 'カメラ'], 'カメラ')],
    left: { title: '移動プリセット', status: 'partial', list: ['ドリーイン', 'トラック', 'クレーンアップ', 'ジブ', 'オービット', 'スパイラル', 'ドローン'].map((n) => ({ id: n, label: n })) },
    center: { type: 'quad', labels: ['上面', '側面', '正面', 'カメラ'], imgs: ['stage-sakura-path', 'stage-shrine', 'viewport-shrine', 'viewport-camera'] },
    right: { tabs: [
      { id: 'rail', label: 'レール', sections: [{ title: 'レール', status: 'mock', controls: [sel('形状', ['直線', 'ベジェ曲線', '円弧']), sl('長さ', 0.5, 30, 6, 'm', 0.1), sl('速度', 0.1, 5, 1, '×', 0.1), tg('注視点を被写体に固定', true)] }] },
      { id: 'pose', label: '姿勢', sections: [{ title: 'カメラ姿勢', status: 'mock', controls: [sl('パン', -180, 180, 0, '°'), sl('チルト', -90, 90, 0, '°'), sl('ロール', -45, 45, 0, '°')] }] },
    ] },
    bottom: camTimeline,
  },
  {
    id: '15', title: 'カメラVMD入出力・変換統合', nav: 'カメラVMD入出力', group: 'カメラ',
    summary: 'カメラVMDの読込・座標変換・比較・優先順位診断・書き出しを1画面で扱う。',
    classification: 'existing_or_partial_to_audit', ids: ['CAM-001', 'CAM-002', 'CAM-016'],
    existing: [CAMERA], live: ['cameraProject'],
    panels: [
      { name: 'カメラVMDライブラリ', status: 'partial', note: 'camera_vmd_local.js・camera_vmd_inspect.py。', ids: ['CAM-001'] },
      { name: '座標変換', status: 'partial', note: 'camera_vmd_codec.py（MMD↔内部座標）。', ids: ['CAM-001'] },
      { name: '3D比較', status: 'mock' },
      { name: 'タイムライン', status: 'partial', note: '現行画面にVMDタイムライン表示あり。', ids: ['CAM-001'] },
      { name: '優先順位診断', status: 'partial', note: 'VMD優先度の描画監査あり（test_camera_vmd_render_priority.py）。', ids: ['CAM-016'] },
      { name: '書き出し', status: 'partial', note: 'encode_camera_track（F値・焦点距離は拡張JSONが必要）。', ids: ['CAM-016'] },
    ],
    tools: [btn('現行カメラ画面で開く', 'href:/camera.html'), un('VMDを書き出す', '新UIからの書き出しは未接続。現行カメラ画面を利用してください。', ['CAM-016'], PH.P2, { text: '今は現行画面で行えます。', label: '現行カメラ画面で開く', act: 'href:/camera.html' })],
    left: { title: 'カメラVMD', status: 'mock', search: true, list: [{ id: 'c1', label: 'camera_intro.vmd', meta: '450f' }, { id: 'c2', label: 'camera_chorus.vmd', meta: '900f' }] },
    center: { type: 'quad', labels: ['MMD座標', '内部座標', '重ね合わせ', 'カメラ'], imgs: ['viewport-character', 'viewport-character', 'viewport-shrine', 'viewport-camera'] },
    right: { tabs: [
      { id: 'proj', label: '現在の状態', sections: [{ title: '保存済みカメラプロジェクト', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('cameraProject')] }] },
      { id: 'conv', label: '変換', sections: [{ title: '座標変換', status: 'mock', controls: [sel('入力座標', ['MMD (左手系)', '内部 (右手系)']), sl('スケール', 0.01, 1, 0.08, '', 0.01), tg('F値・焦点距離を拡張JSONに保存', true), note('標準VMDはF値・焦点距離を保持できないため拡張JSONが必須です。')] }] },
      { id: 'prio', label: '優先順位', sections: [{ title: '優先順位診断', status: 'mock', controls: [{ t: 'checks', rows: [['', 'VMDカメラ', '最優先'], ['', 'シーケンス', '次点'], ['', '手動カメラ', '既定']] }] }] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 900, tracks: [{ label: 'VMDカメラ', keys: [0, 60, 150, 300, 450, 600, 810] }, { label: '手動カメラ', keys: [0, 450] }] },
  },
  {
    id: '16', title: 'シーケンス・ショット・マルチカメラ', nav: 'マルチカメラ', group: 'カメラ',
    summary: 'ショット一覧・4分割プレビュー・カメラ割当・マルチトラックで編集する。',
    classification: 'existing_or_partial_to_audit', ids: ['CAM-015', 'CAM-018'],
    existing: [CAMERA], live: ['sequenceEval'],
    panels: [
      { name: 'ショット一覧', status: 'partial', ids: ['CAM-015'] },
      { name: '4分割プレビュー', status: 'mock' },
      { name: 'カメラ割当', status: 'mock', ids: ['CAM-015'] },
      { name: 'マルチトラック', status: 'mock', ids: ['DATA-001'] },
      { name: 'トランジション', status: 'unimpl', ids: ['CAM-015'] },
      { name: '曲線', status: 'mock' },
    ],
    tools: [un('自動ディレクター', '自動ショット選択は CAM-018（Phase E 後半）。', ['CAM-018'], PH.E), btn('カット（ショット分割）', 'mock:ショット分割（サンプル表示：画面内のみ）')],
    left: { title: 'ショット', status: 'mock', list: items('Shot', 6, (i) => `Cam ${'ABCD'[i % 4]}`) },
    center: { type: 'quad', labels: ['Cam A', 'Cam B', 'Cam C', 'Cam D'], imgs: ['viewport-shrine', 'viewport-camera', 'hero', 'viewport-character'] },
    right: { tabs: [
      { id: 'assign', label: '割当', sections: [{ title: 'カメラ割当', status: 'mock', controls: [sel('ショットのカメラ', ['Cam A', 'Cam B', 'Cam C', 'Cam D']), sl('開始', 0, 1350, 360, 'f'), sl('終了', 0, 1350, 600, 'f')] }] },
      { id: 'eval', label: '評価', sections: [{ title: '既存APIのシーケンス評価', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('sequenceEval')] }] },
    ] },
    bottom: { type: 'timeline', status: 'mock', fps: 30, frames: 1350, tracks: [
      { label: 'Cam A', clips: [[0, 150, 'Shot 01'], [600, 840, 'Shot 04']] },
      { label: 'Cam B', clips: [[150, 360, 'Shot 02'], [840, 1080, 'Shot 05']] },
      { label: 'Cam C', clips: [[360, 600, 'Shot 03']] },
      { label: 'Cam D', clips: [[1080, 1350, 'Shot 06']] },
    ] },
  },
  {
    id: '17', title: 'レンダリング・バッチ処理／書き出し', nav: 'レンダリング・バッチ', group: '出力',
    summary: '出力プリセット・品質設定・キュー・AOV・統計・履歴を管理する。',
    classification: 'existing_or_partial_to_audit', ids: ['RENDER-001', 'RENDER-002', 'RENDER-003', 'RENDER-004', 'RENDER-005', 'RENDER-006', 'RENDER-007', 'RENDER-008', 'RENDER-009', 'RENDER-010', 'NF-016', 'NF-017', 'NF-018'],
    panels: [
      { name: '出力プリセット', status: 'unimpl', ids: ['RENDER-006'] }, { name: 'レンダープレビュー', status: 'unimpl', ids: ['RENDER-001'] },
      { name: '品質設定', status: 'unimpl', ids: ['RENDER-003'] }, { name: 'キュー', status: 'unimpl', ids: ['RENDER-007'] },
      { name: 'AOV', status: 'unimpl', note: 'ブラウザ描画エンジンの対応状況を先に確認する。深度・法線・オブジェクトIDは NF-018（未承認）。', ids: ['RENDER-005', 'NF-018'] }, { name: '統計', status: 'unimpl', ids: ['RENDER-010', 'NF-016', 'NF-017'] }, { name: '履歴', status: 'unimpl', ids: ['RENDER-010', 'NF-017'] },
    ],
    tools: [un('キューに追加', 'レンダーキューは Phase F（RENDER-007）。偽の進捗は表示しません。', ['RENDER-007'], PH.F), un('すべて開始', 'レンダリングは Phase F の範囲です。', ['RENDER-001'], PH.F)],
    center: { type: 'cards', cards: [
      { title: 'レンダーキュー', span: 8, status: 'unimpl', controls: [{ t: 'empty', text: 'キューは空です。レンダラーが未接続のためジョブは作成できません。' }] },
      { title: '統計', span: 4, status: 'unimpl', controls: [{ t: 'kv', rows: [['完了ジョブ', '未計測'], ['平均時間', '未計測'], ['GPU', '未計測']] }] },
      { title: '履歴', span: 12, status: 'unimpl', controls: [{ t: 'empty', text: '書き出し履歴はありません。' }] },
    ] },
    right: { tabs: [
      { id: 'preset', label: 'プリセット', sections: [{ title: '出力プリセット', status: 'unimpl', controls: [ch('プリセット', ['YouTube 1080p', 'ショート縦型', 'MMD用連番', 'アルファ付き']), sel('コーデック', ['H.264', 'H.265', 'ProRes 422', 'PNG']), sel('背景', ['透過（アルファ）', '単色', 'クロマキー'])] }] },
      { id: 'quality', label: '品質', sections: [{ title: '品質設定', status: 'unimpl', controls: [sl('サンプル数', 1, 64, 8), sl('解像度倍率', 0.25, 2, 1, '×', 0.25), tg('モーションブラー')] }] },
      { id: 'aov', label: 'AOV', sections: [{ title: 'AOV', status: 'unimpl', controls: [tg('深度'), tg('法線'), tg('オブジェクトID'), note('EXR/AOV はブラウザ描画では制限があります。対応可否を Phase F で確認します。')] }] },
      { id: 'audio', label: '音声・同期', sections: [{ title: '歌音声付き書き出し', status: 'unimpl', controls: [note('10「音声」の素材とオフセットを参照し、出力ファイルの同期を検品します。'), un('音声設定を開く', '音声多重化は未実装です。', ['RENDER-006'], PH.F)] }] },
      { id: 'verify', label: '検品', sections: [
        { title: '実ファイルの検品', status: 'unimpl', controls: [note('寸法・FPS・フレーム数・音声・黒画面を出力ファイルの再読込で検査します。'), un('出力を検品', '出力ファイルの検品は未実装です。', ['RENDER-009'], PH.F)] },
        { title: '差分と再開', status: 'unimpl', controls: [un('再利用可否を確認', '入力差分による再描画判定、取消・再試行・再開は未実装です。', ['RENDER-008', 'RENDER-010'], PH.F)] },
      ] },
    ] },
  },
  {
    id: '18', title: 'プロジェクト保存・復元・バージョン管理', nav: '保存・復元', group: 'プロジェクト',
    summary: '制作状態の保存・復元、版の比較、素材参照、アーカイブを扱う。',
    classification: 'existing_or_partial_to_audit', ids: ['DATA-008', 'DATA-009', 'DATA-010', 'DATA-012', 'CORE-012'],
    existing: [CAMERA], live: ['projectBundle'],
    panels: [
      { name: 'プロジェクト一覧', status: 'mock', note: '現行は単一制作状態。', ids: ['DATA-008'] },
      { name: '保存・復元', status: 'partial', note: 'project_state_bundle.py（リビジョン検査・事前検証付き復元）。現行カメラ画面の保存/復元UI。', ids: ['DATA-008', 'CORE-012'] },
      { name: 'バージョン', status: 'partial', note: 'camera_project_revision.py（楽観的同時実行リビジョン）。履歴一覧は未。', ids: ['DATA-009'] },
      { name: '差分比較', status: 'unimpl', ids: ['DATA-009'] },
      { name: '素材参照', status: 'unimpl', ids: ['DATA-015'] },
      { name: 'アーカイブ', status: 'unimpl', ids: ['DATA-012'] },
    ],
    tools: [btn('現行カメラ画面で保存・復元', 'href:/camera.html'), btn('復元…', 'form:confirmRestore'), un('ポータブルZIP', '制作データのポータブルZIPは未実装（DATA-012）。', ['DATA-012'], PH.P2)],
    left: { title: 'プロジェクト', status: 'mock', list: [{ id: 'cur', label: '現在の制作状態', meta: 'サーバー' }] },
    center: { type: 'cards', cards: [
      { title: '現在の制作状態（読み取り）', span: 8, status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('projectBundle'), note('この画面は読み取りのみです。保存・復元は現行カメラ画面で行えます（リビジョン不一致時は拒否されます）。')] },
      { title: 'バージョン', span: 4, status: 'partial', controls: [note('リビジョン値で同時編集を検知します。版の一覧・任意版への復元は未実装です。'), un('版を比較', '差分比較は未実装（DATA-009）。', ['DATA-009'], PH.P2)] },
      { title: 'アーカイブ', span: 12, status: 'unimpl', controls: [{ t: 'empty', text: 'アーカイブはありません。' }] },
    ] },
  },
  {
    id: '19', title: 'WebMCP・標準MCP・AIエージェント統合', nav: 'MCP・AI', group: '連携',
    summary: 'エージェント・MCP接続・権限・実行ログ・タスクキューを確認する。',
    classification: 'candidate_late', ids: ['CORE-002', 'CORE-003', 'CORE-004', 'CORE-011', 'OBS-004', 'NF-007', 'NF-016'],
    live: ['aiStatus'],
    panels: [
      { name: 'エージェント', status: 'unimpl', ids: ['NF-007'] },
      { name: 'MCP接続', status: 'partial', note: 'webmcp.js と mcp_server.py（stdio）が存在。接続状態の一覧UIは未。', ids: ['CORE-002', 'CORE-003'] },
      { name: '権限', status: 'unimpl', ids: ['CORE-011'] },
      { name: '実行ログ', status: 'unimpl', ids: ['OBS-004'] },
      { name: 'タスクキュー', status: 'unimpl', ids: ['NF-007'] },
      { name: 'リソース', status: 'unimpl', note: '稼働率・GPU負荷の実測は NF-016（未承認）。', ids: ['NF-016'] },
      { name: 'チャット', status: 'unimpl', ids: ['NF-007'] },
    ],
    tools: [un('エージェントを追加', 'AIエージェント統合GUIは未承認の新規候補（NF-007）。', ['NF-007'], PH.P4)],
    left: { title: '接続', status: 'partial', list: [{ id: 'web', label: 'WebMCP（ブラウザ）', meta: 'webmcp.js' }, { id: 'std', label: '標準MCP（stdio）', meta: 'mcp_server.py' }, { id: 'ollama', label: 'Ollama（任意）', meta: '設定依存' }] },
    center: { type: 'cards', cards: [
      { title: 'AI接続状態（既存API）', span: 6, status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('aiStatus'), note('未接続なら未接続と表示します。サンプルの稼働率やGPU負荷は表示しません。')] },
      { title: '標準MCPの起動', span: 6, status: 'partial', controls: [{ t: 'code', text: 'python mcp_server.py' }, note('設定手順は MCP_SETUP_JA.md を参照。')] },
      { title: '実行ログ', span: 12, status: 'unimpl', controls: [{ t: 'empty', text: 'MCP呼び出し診断（OBS-004）は未実装です。' }] },
    ] },
    right: { tabs: [{ id: 'perm', label: '権限', sections: [{ title: '権限', status: 'unimpl', controls: [tg('読み取りを許可', true), tg('保存を許可'), tg('削除を許可'), un('権限を適用', '権限・危険操作確認は CORE-011（要検証）。', ['CORE-011'], PH.P2)] }] }] },
  },
  {
    id: '20', title: 'システム設定・環境構築・プラグイン', nav: 'システム設定', group: 'システム',
    summary: 'システム情報・保存パス・プラグイン・外部アプリ・ショートカット・ログ設定。',
    classification: 'candidate_late', ids: ['CORE-006', 'CORE-013', 'OBS-002', 'OBS-007', 'NF-008', 'NF-021'],
    live: ['serverVersion', 'qaSettings'],
    panels: [
      { name: 'システム情報', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', note: '/api/server-version。' },
      { name: '保存パス', status: 'unimpl', note: '現行は data/ 固定。保存先の変更は NF-021（未承認）。', ids: ['CORE-006', 'NF-021'] },
      { name: 'プラグイン', status: 'unimpl', ids: ['NF-008'] },
      { name: '外部アプリ', status: 'unimpl', ids: ['MOTION-007'] },
      { name: 'MCP', status: 'partial', ids: ['CORE-003'] },
      { name: 'ショートカット', status: 'mock', note: 'この新UIのショートカットのみ実在。' },
      { name: 'ログ', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', note: '/api/ui-qa/settings（画面テスト記録の設定）を表示。', ids: ['OBS-002'] },
    ],
    center: { type: 'tabsCenter', tabs: [
      { id: 'sys', label: 'システム情報', sections: [{ title: 'サーバー', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('serverVersion')] }, { title: 'ブラウザ', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [{ t: 'browserInfo' }] }] },
      { id: 'paths', label: '保存パス', sections: [{ title: '保存パス', status: 'unimpl', controls: [{ t: 'kv', rows: [['制作データ', 'data/（固定）'], ['書き出し', 'exports/（固定）']] }, un('保存先を変更', '保存パスの変更は未実装。', ['CORE-006'], PH.P2)] }] },
      { id: 'plugins', label: 'プラグイン', sections: [{ title: 'プラグイン', status: 'unimpl', controls: [{ t: 'empty', text: 'プラグイン機構はありません（NF-008・未承認）。' }] }] },
      { id: 'apps', label: '外部アプリ', sections: [{ title: '外部アプリ', status: 'unimpl', controls: [{ t: 'kv', rows: [['Blender', '未検出（検出機能なし）'], ['FFmpeg', '未検出（検出機能なし）']] }, un('検出する', '外部アプリの自動検出は未実装。', ['MOTION-007', 'RENDER-006'], PH.F)] }] },
      { id: 'keys', label: 'ショートカット', sections: [{ title: 'この画面で使えるショートカット', status: 'real', evidence: 'tests/studio-ui.test.cjs::tabs, dropdown, palette and keyboard work', shell: true, controls: [{ t: 'kv', rows: [['Ctrl+K', '画面を検索して移動'], ['Alt+← / Alt+→', '戻る / 進む'], ['Alt+1〜9', 'ナビの1〜9番目へ'], ['Esc', 'ダイアログを閉じる']] }] }] },
      { id: 'log', label: 'ログ', sections: [{ title: '画面テスト記録・容量', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('qaSettings')] }, { title: '診断ZIP', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [link('診断ZIPを保存（既存API）', '/api/diagnostics/export')] }] },
    ] },
  },
  {
    id: '21', title: 'UIテーマ・レイアウト・ワークスペース', nav: 'テーマ・レイアウト', group: 'システム',
    summary: 'テーマ・文字・レイアウトテンプレート・パネル表示を切り替える。',
    classification: 'candidate_late', ids: ['UX-001', 'UX-002', 'UX-006', 'NF-009', 'NF-022'],
    panels: [
      { name: 'テーマ', status: 'real', evidence: 'tests/studio-ui.test.cjs::theme preference persists and narrow screens do not scroll sideways', shell: true, note: 'この新UIのテーマ切替（ブラウザに保存）。製品機能としては NF-022（未承認）。', ids: ['NF-022'] },
      { name: '色・文字', status: 'real', evidence: 'tests/studio-ui.test.cjs::theme preference persists and narrow screens do not scroll sideways', shell: true, note: '表示密度の切替。製品機能としては NF-022（未承認）。', ids: ['NF-022'] },
      { name: 'テンプレート', status: 'mock' },
      { name: 'ドラッグ配置', status: 'unimpl', ids: ['NF-009'] },
      { name: 'パネル表示', status: 'real', evidence: 'tests/studio-ui.test.cjs::theme preference persists and narrow screens do not scroll sideways', shell: true, note: '左パネル・下部タイムラインの表示切替。' },
      { name: '複数画面', status: 'unimpl', ids: ['NF-009'] },
      { name: '出力', status: 'unimpl' },
    ],
    center: { type: 'themeStudy' },
    right: { tabs: [{ id: 'layout', label: 'レイアウト', sections: [
      { title: 'パネル表示', status: 'real', evidence: 'tests/studio-ui.test.cjs::theme preference persists and narrow screens do not scroll sideways', shell: true, controls: [{ t: 'prefToggle', key: 'bottomCollapsed', label: '下部タイムラインを折りたたむ' }, { t: 'prefDensity' }] },
      { title: 'テンプレート', status: 'mock', controls: [ch('レイアウト', ['撮影', '編集', 'レビュー'])] },
      { title: 'ドラッグ配置・複数画面', status: 'unimpl', controls: [un('パネルを切り離す', '完全ドッキングUI・複数モニター配置は未承認の新規候補（NF-009）。', ['NF-009'], PH.P4)] },
    ] }] },
  },
  {
    id: '22', title: 'テンプレート・プリセット・制作ワークフロー', nav: 'テンプレート', group: 'プロジェクト',
    summary: 'テンプレートの一覧・プレビュー・適用前比較・ワークフロー・共有。',
    classification: 'candidate_late', ids: ['CAM-013', 'CAM-014', 'DATA-011', 'NF-006', 'NF-019', 'NF-020'],
    existing: [CAMERA, MAIN],
    panels: [
      { name: 'テンプレート一覧', status: 'mock' },
      { name: 'プレビュー', status: 'mock' },
      { name: '適用前比較', status: 'unimpl', ids: ['NF-006'] },
      { name: 'ワークフロー', status: 'unimpl', note: '自動操作フローは承認済みロードマップに混入させない。', ids: ['NF-006'] },
      { name: 'プリセット', status: 'partial', note: 'カメラのカスタム構図・モーションのお気に入りが現行画面にあり。', ids: ['CAM-014', 'DATA-011'] },
      { name: '共有', status: 'unimpl', note: 'テンプレートの書き出し・取り込みによる共有は NF-020（未承認）。', ids: ['NF-020'] },
    ],
    tools: [un('テンプレートを適用', 'テンプレート一括適用は未承認の新規候補（NF-006）。', ['NF-006'], PH.P4)],
    left: { title: '種類', status: 'mock', list: [{ id: 'cam', label: 'カメラ構図' }, { id: 'mot', label: 'モーション組合せ' }, { id: 'proj', label: 'プロジェクト' }, { id: 'out', label: '出力設定' }] },
    center: { type: 'thumbs', status: 'mock', items: SHOT_TEMPLATES.map(([im, n], i) => ({ id: `tp${i}`, label: n, meta: 'カメラ構図', img: im })) },
    right: { tabs: [{ id: 'detail', label: '詳細', sections: [{ title: 'プリセット（既存）', status: 'partial', controls: [link('カメラのカスタム構図（現行）', '/camera.html'), link('モーションのお気に入り（現行）', '/')] }, { title: '適用前比較', status: 'unimpl', controls: [un('比較する', '適用前比較は未実装。', ['NF-006'], PH.P4)] }] }] },
  },
  {
    id: '23', title: '外部アプリ連携・インポート／エクスポート', nav: '外部連携・入出力', group: '連携',
    summary: 'Blender・MMD・FFmpeg との接続設定、インポート・エクスポート・変換・互換性。',
    classification: 'candidate_late', ids: ['MOTION-003', 'MOTION-006', 'MOTION-007', 'LYRIC-008', 'NF-010'],
    existing: [MAIN],
    panels: [
      { name: '外部アプリ', status: 'unimpl', ids: ['MOTION-007'] },
      { name: '接続設定', status: 'unimpl' },
      { name: 'インポート', status: 'partial', note: '現行画面の素材登録（FBX/GLB/VRM/PMX ZIP/VMD）。', ids: ['MOTION-003'] },
      { name: 'エクスポート', status: 'partial', note: 'VMD書き出し・カメラVMD書き出しは部分実装。', ids: ['MOTION-006', 'CAM-016'] },
      { name: '変換', status: 'partial', note: 'tools/extract_fbx_motion_blender.py（Blender必須）。', ids: ['MOTION-007'] },
      { name: 'バッチ', status: 'unimpl', ids: ['NF-010'] },
      { name: '互換性', status: 'partial', note: 'モデル互換性診断の一部。', ids: ['MOTION-019'] },
    ],
    center: { type: 'cards', cards: [
      { title: '対応形式（現行コード）', span: 12, status: 'partial', controls: [{ t: 'table', cols: ['形式', '読込', '書出', '備考'], rows: [['FBX', '可（Blender経由の抽出あり）', '—', 'MOTION-003/007'], ['GLB / VRM', '可（プレビュー）', '—', 'VRMは静的形状確認'], ['PMX ZIP', '可', '—', 'テクスチャ同梱ZIP'], ['VMD（モーション）', '可', '部分', 'MOTION-006'], ['VMD（カメラ）', '可', '部分', 'F値等は拡張JSON'], ['BVH', '部分', '—', 'bvh_skeleton.py']] }] },
      { title: 'バッチ変換', span: 6, status: 'unimpl', controls: [un('バッチを作成', '外部アプリ自動連携・バッチ変換は未承認の新規候補（NF-010）。', ['NF-010'], PH.P4)] },
      { title: 'インポート', span: 6, status: 'partial', controls: [link('現行画面で素材を登録', '/')] },
    ] },
  },
  {
    id: '24', title: '診断・品質保証・パフォーマンス管理', nav: '診断・品質', group: 'システム',
    summary: '診断ログ・品質検査・検証項目・性能を確認し、診断ZIPを保存する。',
    classification: 'candidate_late', ids: ['CORE-013', 'OBS-001', 'OBS-006', 'REVIEW-003', 'NF-011', 'NF-016'],
    existing: [MAIN], live: ['diagnostics'],
    panels: [
      { name: '総合評価', status: 'unimpl', ids: ['NF-011'] },
      { name: 'リソース', status: 'unimpl', note: '実測していない値は表示しない。CPU/メモリ/GPU/FPSの実測は NF-016（未承認）。', ids: ['NF-016'] },
      { name: '品質検査', status: 'partial', note: 'phase_b_release_gate.py・qa/phase_b_gate.py（Phase B ゲート）。', ids: ['REVIEW-003'] },
      { name: '検証項目', status: 'partial', note: 'Phase E 台帳。', ids: ['CAM-001'] },
      { name: '詳細レポート', status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', note: '/api/diagnostics/recent・診断ZIP。', ids: ['OBS-006'] },
      { name: '性能', status: 'unimpl', ids: ['NF-016'] },
      { name: '再診断', status: 'unimpl', ids: ['NF-011'] },
    ],
    tools: [btn('診断ZIPを保存', 'href:/api/diagnostics/export'), un('再診断', '自動品質採点・再診断は未承認の新規候補（NF-011）。', ['NF-011'], PH.P4)],
    center: { type: 'cards', cards: [
      { title: '最近の診断ログ（既存API）', span: 8, status: 'real', evidence: 'tests/studio-ui.test.cjs::read-only live data comes from the existing API', controls: [live('diagnostics')] },
      { title: 'リソース', span: 4, status: 'unimpl', controls: [{ t: 'kv', rows: [['CPU', '未計測'], ['メモリ', '未計測'], ['GPU', '未計測'], ['FPS', '未計測']] }] },
      { title: '検証項目（Phase E）', span: 12, status: 'partial', controls: [{ t: 'checks', rows: [['', 'CAM-001〜018 リリース完了', '0 / 18'], ['', '実モデル2画面ブラウザー検証', '未実施'], ['', 'UI/API/WebMCP/標準MCP 整合', '未実施'], ['', 'MMD互換性・統合試験', '未実施']] }] },
    ] },
  },
  {
    id: '25', title: 'ヘルプ・チュートリアル・初回セットアップ', nav: 'ヘルプ', group: 'システム',
    summary: '初回セットアップ、目的別ガイド、マニュアル、FAQ、用語集。',
    classification: 'candidate_late', ids: ['CORE-009', 'UX-004', 'NF-012', 'NF-015'],
    panels: [
      { name: 'ウェルカム', status: 'real', evidence: 'tests/studio-ui.test.cjs::help pages render their content', shell: true, note: 'この新UIの案内。' },
      { name: '初回セットアップ', status: 'mock', note: '手順チェックは画面内のみ。' },
      { name: '目的別ガイド', status: 'real', evidence: 'tests/studio-ui.test.cjs::help pages render their content', shell: true, note: '各画面へのリンク。' },
      { name: '動画', status: 'unimpl', note: '紹介ムービー・動画チュートリアルは NF-015（未承認）。', ids: ['NF-015'] },
      { name: 'マニュアル', status: 'partial', note: 'リポジトリ内の日本語文書（AI不要_通常利用ガイド.md 等）。', ids: ['CORE-009'] },
      { name: 'FAQ', status: 'real', evidence: 'tests/studio-ui.test.cjs::help pages render their content', shell: true },
      { name: '用語集', status: 'real', evidence: 'tests/studio-ui.test.cjs::help pages render their content', shell: true },
    ],
    center: { type: 'help' },
  },
  {
    id: '26', title: 'MMDエフェクト', nav: 'MMDエフェクト', group: '制作',
    summary: '登録済み効果の互換性、対象割当、順序、時刻付きパラメータと出力差分を確認する。',
    classification: 'existing_or_partial_to_audit', ids: ['RENDER-011', 'RENDER-012', 'RENDER-013', 'RENDER-014', 'RENDER-015'],
    panels: [
      { name: '効果素材', status: 'unimpl', ids: ['RENDER-011'] },
      { name: 'プレビュー差分', status: 'unimpl', ids: ['RENDER-012'] },
      { name: 'イベント', status: 'unimpl', ids: ['RENDER-013'] },
      { name: '効果スタック', status: 'unimpl', ids: ['RENDER-014'] },
      { name: 'MMD設定書', status: 'unimpl', ids: ['RENDER-015'] },
    ],
    tools: [btn('素材管理（08）へ', 'nav:08'), btn('カメラDOF（03）へ', 'nav:03'), un('MMD設定書を出す', '互換レベルと未対応項目を記した設定書の出力は未実装です。', ['RENDER-015'], PH.FX)],
    left: { title: '登録済み効果', status: 'unimpl', list: [], controls: [note('FX素材の出典・許諾・依存は素材管理で登録します。')] },
    center: { type: 'cards', cards: [
      { title: 'プレビューと出力の差分', span: 8, status: 'unimpl', controls: [{ t: 'conceptPreview', kind: 'fx', src: '/studio/assets/mock-previews/mmd-fx-concept.png', alt: '仮想ダンサーの発光とステージ照明を描いたMMD効果の構想図' }, note('画像は効果の構想例です。タイムラインは仮データで、ブラウザー描画・動画出力には反映されません。')] },
      { title: '互換レベル', span: 4, status: 'unimpl', controls: [note('原 .fx の実行、ブラウザー近似、MMD向け設定出力を区別します。')] },
    ] },
    right: { tabs: [
      { id: 'stack', label: '効果スタック', sections: [{ title: '適用先と順序', status: 'unimpl', controls: [note('左の登録済み効果を選び、シーン／モデル／材質／ショットへ割り当てます。ここに見える設定例は保存されません。'), sel('適用先の種類', ['シーン', 'モデル', '材質', 'ショット']), sel('描画順', ['発光', 'ポスト処理', 'オーバーレイ']), un('効果を追加', '効果スタックの編集は未実装です。', ['RENDER-014'], PH.FX)] }] },
      { id: 'params', label: 'パラメータ', sections: [
        { title: '共通設定', status: 'unimpl', controls: [note('選択中の効果と対象を確認してから、ON/OFF・強度を調整します。下のキー操作は現在フレームに記録する予定です。表示値は操作例で、描画・保存されません。'), tg('効果を有効にする'), sl('強度', 0, 2, 1, '×', 0.05), un('現在フレームにキーを追加', 'パラメータキーの記録は未実装です。', ['RENDER-014'], PH.FX)] },
        { title: '内蔵効果ごとの項目例', status: 'unimpl', controls: [note('効果選択に応じて該当項目だけを表示する設計です。原 .fx のパラメータとは別管理します。DOFの焦点・区間はカメラ画面で設定し、FXでは参照のみです。値は描画・保存されません。'), sl('Bloom 閾値', 0, 2, 1, '', 0.05), sl('MotionBlur シャッター角', 0, 360, 180, '°', 1), sl('発光 強度', 0, 5, 1, '×', 0.1), sl('影の強さ', 0, 2, 1, '×', 0.05)] },
        { title: '空間演出の項目例', status: 'unimpl', controls: [note('霧はまず奥行き霧として扱い、局所的な体積霧とは区別します。粒子と花びらは同一フレームの再評価・透過・動画出力を検証します。'), sl('霧の濃度', 0, 0.1, 0.02, '', 0.005), sl('塵・花びらの量', 0, 100, 30, '%', 1), sl('きらめき強度', 0, 5, 1, '×', 0.1)] },
      ] },
      { id: 'builtin', label: '内蔵効果', sections: [{ title: '描画効果と互換性', status: 'unimpl', controls: [note('発光・Bloom・MotionBlur・影の強調をFX効果別に扱います。カメラDOFは同じ撮影設定を参照し、ここでは独立した効果として追加しません。ブラウザーと動画の対応を分けて表示します。'), un('効果を設定', '内蔵描画効果は未実装です。', ['RENDER-012'], PH.FX)] }] },
      { id: 'events', label: '対象・時刻', sections: [{ title: '演出イベントと区間', status: 'unimpl', controls: [note('発光・火花・煙・衝撃波はヒットフレーム、霧・細かな塵・舞う桜・きらめきは持続区間にも結びます。'), un('イベントを追加', '時刻付き演出は未実装です。', ['RENDER-013'], PH.FX)] }] },
    ] },
    bottom: { type: 'timeline', status: 'unimpl', demoEditable: true, fps: 30, frames: 900, tracks: [
      { label: '効果区間', clips: [[80, 300, '霧'], [330, 580, '桜・塵'], [600, 820, '影']] },
      { label: '強度キー', keys: [80, 150, 240, 330, 430, 600, 750] },
      { label: 'FXイベント', keys: [365, 420, 510] },
    ] },
  },
  {
    id: '27', title: '歌詞・MV構成', nav: '歌詞・MV構成', group: '制作',
    summary: '歌詞の行入力と同期、文字PVの案と行ごとの補正、2D/3D配置、ショット参照を同じ時間軸に置く。',
    modes: ['かんたん', '詳細'],
    classification: 'existing_or_partial_to_audit', ids: ['LYRIC-001', 'LYRIC-002', 'LYRIC-003', 'LYRIC-004', 'LYRIC-005', 'LYRIC-007'],
    panels: [
      { name: '歌詞素材', status: 'unimpl', ids: ['LYRIC-001'] },
      { name: '歌詞キュー', status: 'unimpl', ids: ['LYRIC-002'] },
      { name: '演出パック', status: 'unimpl', ids: ['LYRIC-003', 'LYRIC-005'] },
      { name: '文字配置', status: 'unimpl', ids: ['LYRIC-004'] },
      { name: 'MV構成', status: 'unimpl', ids: ['LYRIC-007'] },
    ],
    tools: [btn('音声・BGM（10）へ', 'nav:10'), btn('ショット（16）へ', 'nav:16'), btn('動画出力（17）へ', 'nav:17')],
    left: { title: '歌詞とタイミング', status: 'unimpl', controls: [
      { t: 'textarea', label: '歌詞（1行＝1フレーズ）', rows: 7, placeholder: '歌詞を1行ずつ入力。/ はカット、[mm:ss] はLRC時刻' },
      note('入力した歌詞は現在のモックでは保存されません。JIZURA由来の記法は、取り込み範囲とライセンスを確認してから対応します。'),
      un('LRCを読み込む', 'LRCの選択と時刻の検証は未実装です。', ['LYRIC-002'], PH.G),
      un('SRTを読み込む', 'BAI独自の互換入力です。解析プレビューを経て共通の歌詞キューに変換する処理は未実装です。', ['LYRIC-002'], PH.G),
      un('曲を選ぶ（10）', '歌音声との連携は未実装です。音声の正本は10「音声・BGM」に置きます。', ['LYRIC-002'], PH.G),
      un('タップで同期', '再生中にSpaceで行、Tabでカットの頭を刻む同期は未実装です。', ['LYRIC-002'], PH.G),
      note('行とカット：未作成。各行の開始時刻、カット数、固定、再抽選をここで編集します。'),
    ] },
    center: { type: 'cards', cards: [
      { title: '文字PV・ステージプレビュー', span: 12, status: 'unimpl', controls: [{ t: 'conceptPreview', kind: 'lyrics', src: '/studio/assets/mock-previews/lyrics-mv-concept.png', alt: '歌い手と夜のステージを描いた歌詞MVの構想図', lyric: '光の向こうへ' }, note('画像と歌詞は構想例です。タイムライン操作はこの画面だけのサンプルで、映像には反映されません。')] },
      { title: '再生と行／カット', span: 8, status: 'unimpl', controls: [note('再生位置、行・カット、音声、文字モーションを下の時間軸に重ねます。SRTの発話ブロックは各キューの［開始, 終了）を示し、間の無音や重なりも残します。')] },
      { title: '連携先', span: 4, status: 'unimpl', controls: [note('音声の編集は10、ショット本体は16、動画出力は17です。ここでは共通時刻の参照と文字PVの構成を扱います。')] },
    ] },
    right: { tabs: [
      { id: 'quick', label: 'おまかせ', sections: [
        { title: '文字PVの案', status: 'unimpl', controls: [note('歌詞・音声・許諾済み演出パックから文字PVの案を作ります。歌詞・音声・手動時刻と固定した行は変えず、構成だけを再提案します。'), un('おまかせで作る', '文字PVの自動構成は未実装です。', ['LYRIC-002', 'LYRIC-003'], PH.G), un('前の案', '案の履歴は未実装です。', ['LYRIC-002'], PH.G), un('次の案', '案の履歴は未実装です。', ['LYRIC-002'], PH.G)] },
        { title: '気になるところを直す', status: 'unimpl', controls: [note('左の行を選択し、その行だけ再抽選・固定できます。位置や動きの詳細は「詳細」に切り替えます。'), un('選択行だけ再抽選', '行ごとの文字演出の再抽選は未実装です。', ['LYRIC-002', 'LYRIC-003'], PH.G), un('選択行を固定', '行の構成を固定する処理は未実装です。', ['LYRIC-002'], PH.G)] },
      ] },
      { id: 'cues', label: '行・カット', sections: [{ title: '入力と時刻の確認', status: 'unimpl', controls: [note('1行1フレーズ、/でカットを分け、LRC時刻を読みます。SRTはBAI互換入力として共通LyricCueへ変換します。原時刻と編集時刻を分けて保持します。'), un('入力を確認', '歌詞の解析とキューの配置は未実装です。', ['LYRIC-002'], PH.G)] }, { title: 'SRT発話ブロック', status: 'unimpl', controls: [note('下の歌詞トラックは各発話の［開始, 終了）を表示します。サンプルではブロック本体を動かすと両時刻が同量ずれ、端を動かすと片方の時刻をトリムできます。原SRTを残す保存処理は未実装です。'), un('SRT時刻を編集して保存', 'SRTブロックの非破壊な時刻補正と保存は未実装です。', ['LYRIC-002'], PH.G)] }, { title: '音声との同期', status: 'unimpl', controls: [note('行頭Space／カット頭Tab、時刻の直接修正、拍への吸着を使います。口形キーへ渡す場合は確定素材IDを明示し、自動上書きしません。'), un('行の時刻を編集', '音声と同じ時刻軸の歌詞編集は未実装です。', ['LYRIC-002'], PH.G)] }] },
      { id: 'placement', label: '文字配置', sections: [{ title: '2D／3D配置', status: 'unimpl', controls: [note('画面固定と空間固定を区別し、遮蔽・見切れ・カメラ切替を検査します。'), un('文字位置を編集', '2D／3D文字配置は未実装です。', ['LYRIC-004'], PH.G)] }] },
      { id: 'textMotion', label: '文字モーション', sections: [
        { title: '選択キューの動き', status: 'unimpl', controls: [note('歌詞キューを選び、現在フレームで位置・大きさ・透明度を設定します。ここに見える値は説明用で、文字や映像には反映・保存されません。'), sl('位置 X', -100, 100, 0, '%', 1), sl('位置 Y', -100, 100, 0, '%', 1), sl('大きさ', 0, 300, 100, '%', 1), sl('不透明度', 0, 100, 100, '%', 1), un('現在フレームに文字キーを追加', '歌詞文字のキーフレーム編集は未実装です。', ['LYRIC-002', 'LYRIC-004'], PH.G)] },
        { title: '時間と補間', status: 'unimpl', controls: [note('歌詞キューの開始・終了を基準にキーを置き、下部の文字モーショントラックで前後を確認します。許諾済み演出パックは別タブから選びます。')] },
      ] },
      { id: 'structure', label: 'MV構成', sections: [{ title: '絵コンテとショット参照', status: 'unimpl', controls: [note('ショットID・順序・範囲・カメラ割当は 16「ショット」で編集します。ここでは絵コンテと歌詞イベントを既存ショットへ結びます。'), btn('ショット編集（16）へ', 'nav:16'), un('絵コンテ参照を編集', '既存ショットへの絵コンテ・歌詞イベント参照は未実装です。', ['LYRIC-007'], PH.G)] }] },
      { id: 'packs', label: '演出パック', sections: [{ title: '許諾済みスタイル', status: 'unimpl', controls: [un('パックを選ぶ', '許諾と依存を確認した演出パック・スタイルの適用は未実装です。', ['LYRIC-003', 'LYRIC-005'], PH.G)] }] },
    ] },
    bottom: { type: 'timeline', status: 'unimpl', demoEditable: true, fps: 30, frames: 900, tracks: [
      { label: '音声参照', wave: true, clips: [[0, 900, '楽曲サンプル']] },
      { label: '歌詞・SRTブロック', clips: [[60, 150, '発話 1'], [210, 340, '発話 2'], [330, 480, '発話 3']] },
      { label: '文字モーション', keys: [60, 90, 150, 210, 270, 340, 390, 480] },
      { label: 'ショット参照', clips: [[0, 300, 'Shot 01'], [300, 600, 'Shot 02'], [600, 900, 'Shot 03']] },
    ] },
  },
];

/** Sidebar order (groups). */
export const GROUPS = ['ホーム', 'カメラ', 'モーション', '制作', '素材', '出力', 'プロジェクト', '連携', 'システム'];

/** Forms opened by `form:<id>` buttons. Submitting never persists; it says so. */
export const FORMS = {
  newProject: {
    title: '新規プロジェクト', submit: '作成（サンプル）',
    fields: [
      { id: 'name', label: 'プロジェクト名', required: true, pattern: '^[^\\\\/:*?"<>|]{1,48}$', error: '1〜48文字。\\ / : * ? " < > | は使えません。' },
      { id: 'kind', label: '種類', type: 'select', options: ['ダンスMV', 'カメラ試験', 'モーション整理', '空のプロジェクト'] },
      { id: 'fps', label: 'FPS', type: 'select', options: ['30', '60', '24'] },
      { id: 'res', label: '解像度', type: 'select', options: ['1920×1080', '3840×2160', '1080×1920'] },
    ],
    done: 'サンプル表示：画面内の一覧に追加しました。サーバーには保存されていません（複数プロジェクト管理は未実装）。',
  },
  savePreset: {
    title: 'カメラプリセットとして保存', submit: '保存（サンプル）',
    fields: [{ id: 'name', label: 'プリセット名', required: true, pattern: '^.{1,48}$', error: '1〜48文字で入力してください。' }, { id: 'tags', label: 'タグ（空白区切り）' }],
    done: 'サンプル表示：保存はされていません。実際の登録は現行カメラ画面の「カスタム撮影構図」で行えます。',
  },
  confirmRestore: {
    title: '制作状態を復元', submit: '復元を実行', danger: true,
    fields: [{ id: 'confirm', label: '確認のため「復元」と入力', required: true, pattern: '^復元$', error: '「復元」と入力してください。' }],
    intro: '復元すると現在の制作状態が置き換わります。この新UIからは実行しません（誤操作防止のため未接続）。',
    done: '◇ 未接続：この新UIからは復元を実行していません。現行カメラ画面の復元はリビジョン検査付きで利用できます。',
  },
};
