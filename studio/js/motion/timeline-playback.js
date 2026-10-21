// @ts-check
// WP05e: SCR13 の FBX タイムライン再生。読み込み済みモデルへの表示だけを変更する。
import { getJson } from '../api.js';
import { motionFileMap, clipKeyFor, createFbxClipCache } from './fbx-clips.js';
import { timelineAdvance, timelineSelect, timelineLocalTime, timelineShift } from './chain.fork.js';
import { applyLayers } from './layers.fork.js';

/** @param {any} libs @param {any} model @param {any[]} clips @param {any[]} layers @param {{startFrame?:number, onFrame?:(state:any)=>void}} [options] */
export async function createTimelinePlayback(libs, model, clips, layers, options = {}) {
  const manifestResult = await getJson('/api/manifest');
  if (!manifestResult.ok) throw new Error(`FBX一覧を読めません: ${manifestResult.message}`);
  const manifest = /** @type {any} */ (manifestResult.data) || {};
  const files = motionFileMap(manifest), cache = createFbxClipCache(libs);
  const ordered = clips.map((c, originalIndex) => ({ c, originalIndex })).sort((a, b) => a.c.start - b.c.start);
  /** @type {any[]} */ const sources = [];
  for (const { c } of ordered) {
    const key = clipKeyFor(c.name, manifest.mapping || {}, files);
    if (!key) throw new Error(`登録されていないモーション：${c.name}`);
    const clip = await cache.getClip(/** @type {any} */ (files.get(key)));
    if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`再生できないモーション：${c.name}`);
    sources.push(clip);
  }
  const mixer = new libs.THREE.AnimationMixer(model);
  const baseline = model.position.clone();
  let frame = Math.max(0, Number(options.startFrame) || 0), playing = true, active = -1, action = null, message = '';
  /** @type {Map<any, number[]>} */ const applied = new Map();
  function removeLayerRotations() {
    for (const [bone, values] of applied) {
      bone.rotation.x -= values[0]; bone.rotation.y -= values[1]; bone.rotation.z -= values[2];
    }
    applied.clear();
  }
  function applyLayerRotations() {
    for (const layer of layers) {
      if (!layer.enabled || !layer.keys.length) continue;
      let bone = model.getObjectByName(layer.bone);
      if (!bone) model.traverse((/** @type {any} */ o) => { if (!bone && o.name.toLowerCase() === layer.bone.toLowerCase()) bone = o; });
      if (bone && !applied.has(bone)) applied.set(bone, [bone.rotation.x, bone.rotation.y, bone.rotation.z]);
    }
    applyLayers(model, layers, frame);
    for (const [bone, values] of applied) {
      applied.set(bone, [bone.rotation.x - values[0], bone.rotation.y - values[1], bone.rotation.z - values[2]]);
    }
  }
  const state = () => ({ frame, playing, active: active < 0 ? null : { index: ordered[active].originalIndex, name: ordered[active].c.name }, message });
  function emit() { options.onFrame?.(state()); }
  return {
    state,
    /** @param {number} dt */
    update(dt) {
      if (!playing) return;
      const step = Math.min(.08, Math.max(0, dt));
      const advanced = timelineAdvance(frame, step, clips);
      frame = advanced.position;
      removeLayerRotations();
      const selected = timelineSelect(clips, frame);
      if (!selected) {
        mixer.stopAllAction(); active = -1; action = null;
        model.position.x = baseline.x; model.position.z = baseline.z;
        message = advanced.ended ? '終端に到達しました' : `タイムライン：待機 ${Math.floor(frame)}F`;
      } else {
        const i = selected.index, c = selected.clip, source = sources[i];
        if (i !== active) {
          const old = action;
          action = mixer.clipAction(source); action.reset(); action.enabled = true; action.setEffectiveWeight(1); action.play();
          const fade = Math.min(c.blend / 30, source.duration);
          if (old && old !== action && fade > 0) old.crossFadeTo(action, fade, false);
          else if (old && old !== action) old.stop();
          active = i;
        }
        action.time = Math.max(0, timelineLocalTime(source.duration, c, frame) - step);
        mixer.update(step);
        const offset = timelineShift(ordered.slice(0, i).map((entry, j) => ({ c: entry.c, clip: sources[j] })), libs.THREE);
        model.position.x = baseline.x + offset.x * model.scale.x;
        model.position.z = baseline.z + offset.z * model.scale.z;
        applyLayerRotations();
        message = `タイムライン ${Math.floor(frame)}F / ${c.name} / 速度 ${c.speed}x`;
      }
      if (advanced.ended) { playing = false; mixer.stopAllAction(); }
      emit();
    },
    /** 位置の操作だけを行う。姿勢は再生開始後の tick で変わる。 @param {number} value */
    setFrame(value) { frame = Math.min(timelineAdvance(0, 0, clips).end, Math.max(0, Number(value) || 0)); emit(); },
    pause() { playing = false; emit(); },
    dispose() {
      playing = false; removeLayerRotations(); mixer.stopAllAction();
      try { mixer.uncacheRoot(model); } catch { /* 表示解除済み */ }
      model.position.x = baseline.x; model.position.z = baseline.z;
      cache.clear();
    },
  };
}
