// @ts-check
// 旧 motion_layers.js:15・25〜26 の計算だけを移す。保存とUIは持たない。

/** @param {any} o */
export function safeLayer(o) {
  return {
    name: String(o?.name || '補正').slice(0, 100),
    bone: String(o?.bone || 'Hips').slice(0, 120),
    enabled: o?.enabled !== false,
    keys: Array.isArray(o?.keys) ? o.keys.map((/** @type {any} */ k) => ({
      frame: Math.max(0, Math.round(+k.frame || 0)), x: +k.x || 0, y: +k.y || 0, z: +k.z || 0,
    })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.frame - b.frame) : [],
  };
}

/** 線形補間。最初／最後の外側は端の値を使う。 @param {any[]} keys @param {number} frame */
export function layerValues(keys, frame) {
  if (!keys.length) return null;
  if (frame <= keys[0].frame) return keys[0];
  if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (frame <= b.frame) {
      const t = (frame - a.frame) / (b.frame - a.frame || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return null;
}

/** 現在の姿勢に加算する。元素材には書かない。 @param {any} model @param {any[]} layers @param {number} frame */
export function applyLayers(model, layers, frame) {
  if (!model) return;
  for (const layer of layers) {
    if (!layer.enabled) continue;
    const v = layerValues(layer.keys, frame);
    if (!v) continue;
    let node = model.getObjectByName(layer.bone);
    if (!node) model.traverse((/** @type {any} */ o) => { if (!node && o.name.toLowerCase() === layer.bone.toLowerCase()) node = o; });
    if (!node) continue;
    node.rotation.x += v.x * Math.PI / 180;
    node.rotation.y += v.y * Math.PI / 180;
    node.rotation.z += v.z * Math.PI / 180;
  }
}
