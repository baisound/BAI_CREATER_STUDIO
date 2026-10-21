// @ts-check
// SCR-06 light actors and their frame animation. Values are metres, degrees and 8-bit RGB.
/** @typedef {{frame: number, position: [number,number,number], rotation: [number,number,number], rgb: [number,number,number], intensity: number, distance: number, angle: number, penumbra: number, enabled: boolean}} LightKey */
/** @typedef {{id: string, name: string, type: 'directional'|'spot'|'point', keys: LightKey[]}} LightActor */
/** @typedef {{schema: 1, duration: number, items: LightActor[]}} Lighting */

/** @type {Lighting} */
const INITIAL = { schema: 1, duration: 9000, items: [
  { id: 'key', name: '左キーライト', type: 'directional', keys: [{ frame: 0, position: [-1.5, 2.3, 1], rotation: [-26, -55, 0], rgb: [202, 228, 255], intensity: 2.5, distance: 0, angle: 45, penumbra: 0.4, enabled: true }] },
  { id: 'fill', name: '右フィルライト', type: 'directional', keys: [{ frame: 0, position: [1.5, 2.3, 1], rotation: [-26, 55, 0], rgb: [255, 72, 92], intensity: 1.2, distance: 0, angle: 45, penumbra: 0.4, enabled: true }] },
  { id: 'rim', name: '背面ライト', type: 'directional', keys: [{ frame: 0, position: [0, 2.5, -2.5], rotation: [-22, 180, 0], rgb: [255, 244, 225], intensity: 2.2, distance: 0, angle: 45, penumbra: 0.4, enabled: true }] },
] };

/** @returns {Lighting} */
export const defaultLighting = () => structuredClone(INITIAL);

/** @param {any} value @returns {value is Lighting} */
export function isLighting(value) {
  return !!value && value.schema === 1 && Number.isInteger(value.duration) && value.duration >= 1 && value.duration <= 1000000
    && Array.isArray(value.items) && value.items.every((/** @type {any} */ item) =>
    !!item && typeof item.id === 'string' && typeof item.name === 'string' && ['directional', 'spot', 'point'].includes(item.type)
    && Array.isArray(item.keys) && item.keys.length > 0 && item.keys[0].frame === 0 && item.keys.every((/** @type {any} */ key) =>
      Number.isInteger(key.frame) && key.frame <= value.duration && Array.isArray(key.position) && key.position.length === 3
      && Array.isArray(key.rotation) && key.rotation.length === 3 && Array.isArray(key.rgb) && key.rgb.length === 3
      && typeof key.intensity === 'number' && typeof key.enabled === 'boolean'));
}

/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + (b - a) * t;
/** @param {number} a @param {number} b @param {number} t */
const lerpAngle = (a, b, t) => a + (((((b - a) % 360) + 540) % 360 - 180) * t);
/** @param {LightKey} a @param {LightKey} b @param {number} t @param {number} frame @returns {LightKey} */
function interpolate(a, b, t, frame) {
  return {
    frame,
    position: /** @type {[number,number,number]} */ (a.position.map((n, i) => lerp(n, b.position[i], t))),
    rotation: /** @type {[number,number,number]} */ (a.rotation.map((n, i) => lerpAngle(n, b.rotation[i], t))),
    rgb: /** @type {[number,number,number]} */ (a.rgb.map((n, i) => Math.round(lerp(n, b.rgb[i], t)))),
    intensity: lerp(a.intensity, b.intensity, t),
    distance: lerp(a.distance, b.distance, t), angle: lerp(a.angle, b.angle, t), penumbra: lerp(a.penumbra, b.penumbra, t),
    enabled: a.enabled,
  };
}

/** @param {LightActor} light @param {number} frame @returns {LightKey} */
export function sampleLight(light, frame) {
  const keys = light.keys;
  if (frame <= keys[0].frame) return { ...keys[0], frame };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i], a = keys[i - 1];
    if (frame === b.frame) return { ...b };
    if (frame < b.frame) return interpolate(a, b, (frame - a.frame) / (b.frame - a.frame), frame);
  }
  return { ...keys[keys.length - 1], frame };
}

/** @param {Lighting} lighting @param {string} id @param {number} frame @param {Partial<LightKey>} patch @returns {Lighting} */
export function putLightKey(lighting, id, frame, patch = {}) {
  const next = structuredClone(lighting);
  const light = next.items.find((item) => item.id === id);
  if (!light || !Number.isInteger(frame) || frame < 0 || frame > lighting.duration) return next;
  const value = { ...sampleLight(light, frame), ...patch, frame };
  const index = light.keys.findIndex((key) => key.frame === frame);
  if (index >= 0) light.keys[index] = value;
  else { light.keys.push(value); light.keys.sort((a, b) => a.frame - b.frame); }
  return next;
}

/** @param {Lighting} lighting @param {string} id @param {number} frame @returns {Lighting} */
export function removeLightKey(lighting, id, frame) {
  const next = structuredClone(lighting);
  if (frame <= 0) return next;
  const item = next.items.find((x) => x.id === id);
  if (item) item.keys = item.keys.filter((key) => key.frame !== frame);
  return next;
}

/** @param {Lighting} lighting @param {string} id @returns {Lighting} */
export function removeLight(lighting, id) {
  return { schema: 1, duration: lighting.duration, items: lighting.items.filter((item) => item.id !== id) };
}

/** @param {Lighting} lighting @param {'directional'|'spot'|'point'} type @returns {LightActor} */
export function newLight(lighting, type) {
  const id = globalThis.crypto?.randomUUID?.() || `light-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const n = lighting.items.length + 1;
  const key = /** @type {LightKey} */ ({ frame: 0, position: [0, 3, 2], rotation: [-35, 0, 0], rgb: [255, 255, 255],
    intensity: type === 'directional' ? 1.5 : 30, distance: 0, angle: 40, penumbra: 0.35, enabled: true });
  return { id, name: `${type === 'spot' ? 'スポット' : type === 'point' ? '点光' : '方向光'} ${n}`, type, keys: [key] };
}

/** @param {[number,number,number]} rgb */
export const hexOf = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
