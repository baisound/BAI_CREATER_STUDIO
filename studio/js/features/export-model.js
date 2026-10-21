// @ts-check
// 旧 index.html の変換用ボーン対応と、コンビネーション→登録済みFBX名の解決規則。

export const DEFAULT_BONE_MAP = Object.freeze({
  'mixamorig:Hips': 'センター', 'mixamorig:Spine': '上半身', 'mixamorig:Spine1': '上半身2',
  'mixamorig:Neck': '首', 'mixamorig:Head': '頭',
  'mixamorig:LeftArm': '左腕', 'mixamorig:LeftForeArm': '左ひじ', 'mixamorig:LeftHand': '左手首',
  'mixamorig:RightArm': '右腕', 'mixamorig:RightForeArm': '右ひじ', 'mixamorig:RightHand': '右手首',
  'mixamorig:LeftUpLeg': '左足', 'mixamorig:LeftLeg': '左ひざ', 'mixamorig:LeftFoot': '左足首',
  'mixamorig:RightUpLeg': '右足', 'mixamorig:RightLeg': '右ひざ', 'mixamorig:RightFoot': '右足首',
});

/** @param {string} name */
export const normalizeFbxName = (name) => name.toLowerCase().replace(/\.fbx$/, '').replace(/[^a-z0-9]/g, '');

/** @param {string} text @param {boolean} [requireNonempty] */
export function parseBoneMap(text, requireNonempty = false) {
  /** @type {any} */ let map;
  try { map = JSON.parse(text); } catch { throw Error('ボーン対応表のJSONを読み取れません'); }
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw Error('ボーン対応表はJSONオブジェクトにしてください');
  const entries = Object.entries(map);
  if (requireNonempty && !entries.length) throw Error('変換ジョブにはボーン対応が1件以上必要です');
  if (entries.some(([a, b]) => !a || a.length >= 128 || typeof b !== 'string' || !b || b.length >= 128)) {
    throw Error('ボーン名は空欄にせず、それぞれ128文字未満にしてください');
  }
  return /** @type {Record<string,string>} */ (map);
}

/**
 * 旧画面と同じ manifest.mapping → 正規化名の規則。サーバーは名前とFBX実体を再検査する。
 * @param {{name: string}[]} timeline
 * @param {{files: {name: string, kind: string}[], mapping?: Record<string,string>}} manifest
 */
export function resolveMotionNames(timeline, manifest) {
  if (!Array.isArray(timeline) || !timeline.length) throw Error('先にコンビネーションへFBXモーションを追加してください');
  const motions = Array.isArray(manifest.files) ? manifest.files.filter((x) => x.kind === 'motions' && typeof x.name === 'string') : [];
  return timeline.map((step) => {
    if (!step || typeof step.name !== 'string' || !step.name) throw Error('コンビネーションに名前のない手順があります');
    const preferred = manifest.mapping?.[step.name] || normalizeFbxName(step.name);
    const found = motions.find((x) => normalizeFbxName(x.name) === preferred);
    if (!found) throw Error(`登録済みFBXが見つかりません：${step.name}`);
    return found.name;
  });
}
