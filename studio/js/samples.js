// @ts-check
// Placeholder imagery and sample catalog for the UI mock.
// Images in /studio/assets/samples/ are small crops of the owner's 25-screen design references
// (purple tones reduced). They only show how the finished product will look; nothing here is real data.

/** @param {string} name */
export const img = (name) => `/studio/assets/samples/${name}.webp`;

/**
 * @typedef {{id: string, name: string, file: string, type: string, cat: string, img: string, fav?: boolean,
 *   meta?: [string, string][], tags?: string[], desc?: string, deps?: string[]}} SampleAsset
 */

/** @type {{id: string, label: string, icon: string}[]} */
export const ASSET_CATS = [
  { id: 'char', label: 'キャラクター', icon: 'user' },
  { id: 'stage', label: 'ステージ', icon: 'stage' },
  { id: 'prop', label: '小物', icon: 'template' },
  { id: 'mat', label: 'マテリアル', icon: 'sphere' },
  { id: 'fx', label: 'エフェクト', icon: 'sparkle' },
  { id: 'audio', label: 'オーディオ', icon: 'music' },
  { id: 'video', label: '動画', icon: 'render' },
  { id: 'image', label: '画像', icon: 'image' },
  { id: 'motion', label: 'モーション（VMD）', icon: 'motion' },
];

/** @type {SampleAsset[]} */
export const ASSETS = [
  { id: 'a01', name: '朱華（しゅか）', file: '.vrm', type: 'キャラクター', cat: 'char', img: 'char-shuka', tags: ['和風', 'オリジナル'] },
  { id: 'a02', name: '雪乃（ゆきの）', file: '.vrm', type: 'キャラクター', cat: 'char', img: 'char-yukino', tags: ['ファンタジー'] },
  { id: 'a03', name: '桜奈（さくらな）', file: '.pmx', type: 'キャラクター', cat: 'char', img: 'char-sakuna', fav: true, tags: ['桜', 'オリジナル'] },
  { id: 'a04', name: '夜の神社', file: '.glb', type: 'ステージ', cat: 'stage', img: 'stage-shrine', fav: true, tags: ['和風', '神社', '夜景', '桜'],
    desc: '桜と灯籠の光で夜の神社を表現したステージ（サンプル）。配信・MV・ゲーム制作向けの想定。',
    deps: ['prop-lantern', 'prop-stone-lantern', 'fx-petals', 'fx-sakura-storm', 'hdr-moon'] },
  { id: 'a05', name: '桜の参道', file: '.glb', type: 'ステージ', cat: 'stage', img: 'stage-sakura-path', tags: ['和風', '桜'] },
  { id: 'a06', name: '近未来シティ（夜）', file: '.glb', type: 'ステージ', cat: 'stage', img: 'stage-city-night', tags: ['都市', '夜景'] },
  { id: 'a07', name: '提灯（赤）', file: '.glb', type: '小物', cat: 'prop', img: 'prop-lantern', tags: ['和風'] },
  { id: 'a08', name: '和扇子', file: '.glb', type: '小物', cat: 'prop', img: 'prop-fan', tags: ['和風'] },
  { id: 'a09', name: '狐面', file: '.glb', type: '小物', cat: 'prop', img: 'prop-mask', tags: ['和風'] },
  { id: 'a10', name: '石灯籠', file: '.glb', type: '小物', cat: 'prop', img: 'prop-stone-lantern', tags: ['和風'] },
  { id: 'a11', name: '和紙テクスチャ', file: '.png', type: '画像', cat: 'mat', img: 'tex-washi', tags: ['テクスチャ'] },
  { id: 'a12', name: '金属（和風・金）', file: '.mat', type: 'マテリアル', cat: 'mat', img: 'mat-gold', tags: ['金属'] },
  { id: 'a13', name: '布（着物・赤）', file: '.mat', type: 'マテリアル', cat: 'mat', img: 'mat-cloth', fav: true, tags: ['布'] },
  { id: 'a14', name: '桜の花びら', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-petals', fav: true, tags: ['桜'] },
  { id: 'a15', name: '花火エフェクト', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-fireworks', tags: ['夏'] },
  { id: 'a16', name: '桜吹雪', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-sakura-storm', tags: ['桜'] },
  { id: 'a17', name: 'オーラ（赤）', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-aura', tags: [] },
  { id: 'a18', name: '流れる光', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-light-stream', tags: [] },
  { id: 'a19', name: '和風BGM_夜桜', file: '.wav', type: 'オーディオ', cat: 'audio', img: 'audio-bgm', fav: true, tags: ['BGM', '和風'] },
  { id: 'a20', name: '鈴の音', file: '.wav', type: 'オーディオ', cat: 'audio', img: 'audio-bell', tags: ['効果音'] },
  { id: 'a21', name: '舞い（女性）', file: '.vmd', type: 'モーション', cat: 'motion', img: 'motion-dance', tags: ['ダンス'] },
  { id: 'a22', name: '歩き_和装', file: '.vmd', type: 'モーション', cat: 'motion', img: 'motion-walk', fav: true, tags: ['歩行'] },
  { id: 'a23', name: 'ティザー映像', file: '.mp4', type: '動画', cat: 'video', img: 'video-teaser', tags: ['告知'] },
  { id: 'a24', name: '背景イラスト_夜桜', file: '.png', type: '画像', cat: 'image', img: 'img-bg-night', tags: ['背景'] },
  { id: 'a25', name: 'ロゴ_和風', file: '.png', type: '画像', cat: 'image', img: 'img-logo', tags: ['ロゴ'] },
  { id: 'a26', name: 'シルエット素材', file: '.png', type: '画像', cat: 'image', img: 'img-silhouette', tags: [] },
  { id: 'a27', name: '桜パーティクル', file: '.fx', type: 'エフェクト', cat: 'fx', img: 'fx-particles', fav: true, tags: ['桜'] },
  { id: 'a28', name: '空_夜（月）', file: '.hdr', type: '画像', cat: 'image', img: 'hdr-moon', tags: ['HDRI'] },
];

/** @type {{name: string, img: string, state: string, desc: string, updated: string}[]} */
export const PROJECTS = [
  { name: 'City_Night_MV', img: 'proj-city-night', state: '進行中', desc: '夜の街を舞台にしたミュージックビデオ', updated: '10/19 14:28' },
  { name: 'Blue_Resonance', img: 'proj-blue-resonance', state: '書き出し待ち', desc: '水と光の世界の短編アニメーション', updated: '10/18 22:41' },
  { name: 'Sakura_Dance', img: 'proj-sakura-dance', state: '編集中', desc: '和風ステージでのダンスアニメーション', updated: '10/17 19:03' },
  { name: 'Virtual_Stage_Live', img: 'proj-virtual-stage', state: '企画', desc: 'バーチャルライブ向けステージ制作', updated: '10/15 11:20' },
];

/** @type {{name: string, img: string, spec: string, dur: string}[]} */
export const RENDERS = [
  { name: 'City_Night_MV_final.mp4', img: 'render-city', spec: '4K / 60fps', dur: '00:04:32' },
  { name: 'Sakura_Dance_test.mp4', img: 'render-sakura', spec: '4K / 30fps', dur: '00:01:28' },
  { name: 'Blue_Resonance_v02.mp4', img: 'render-blue', spec: '4K / 60fps', dur: '00:03:16' },
  { name: 'Stage_Lighting_test.mp4', img: 'render-stage', spec: '4K / 30fps', dur: '00:00:45' },
];

/** Camera presets shown as picture tiles. */
export const CAM_PRESETS = [
  ['preset-default', 'デフォルト'], ['preset-cinematic', 'シネマティック'], ['preset-portrait', 'ポートレート'], ['preset-dynamic', 'ダイナミック'], ['preset-drone', 'ドローン風'],
];
export const LENS_PRESETS = [['lens-24', '広角 24mm'], ['lens-35', '標準 35mm'], ['lens-85', 'ポートレート 85mm'], ['lens-135', '望遠 135mm']];
export const SHOT_TEMPLATES = [
  ['tpl-cinematic', 'シネマティック'], ['tpl-closeup', 'クローズアップ'], ['tpl-dynamic', 'ダイナミック'], ['tpl-lowangle', 'ローアングル'],
  ['tpl-highangle', 'ハイアングル'], ['tpl-dollyin', 'ドリーイン'], ['tpl-orbit', '周回ショット'], ['tpl-handheld', '手持ち風'],
];
