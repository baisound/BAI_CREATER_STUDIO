// @ts-check
// AUDIO-001 / Issue #39: adapt the existing PMX+VMD player to SCR-10's frame clock.
// The loaded mesh is evaluated in memory; no rig, weights, or source file is written.
import { createPlayer } from './player.js';

/** @param {any} THREE @param {any} MMDAnimationHelper @param {any} pmx @param {any} clip @param {string} id */
export function createPmxVmdPreview(THREE, MMDAnimationHelper, pmx, clip, id) {
  if (!pmx?.isSkinnedMesh || !pmx.skeleton || !clip?.tracks?.length) throw Error('PMXの骨格またはVMDのアニメーションがありません。');
  const player = createPlayer(THREE, MMDAnimationHelper);
  try {
    player.setModel(pmx, 'PMX');
    player.applyVmd(clip, id);
  } catch (error) { player.dispose(); throw error; }
  const bones = new Map(pmx.skeleton.bones.map((/** @type {any} */ bone) => [bone.name, bone]));
  const followBone = bones.has('センター') ? 'センター' : '腰';
  const vec = new THREE.Vector3(), quat = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  /** @type {any[]} */ let layers = [];
  /** @type {any|null} */ let previewKey = null;
  function applyCorrections(_mesh, seconds) {
    for (const layer of layers) {
      const frame = (layer.start + seconds) * layer.fps;
      const first = Math.ceil(layer.start * layer.fps - 1e-7);
      const end = Math.ceil((layer.start + layer.duration) * layer.fps - 1e-7);
      const from = layer.start_frame ?? first, until = layer.end_frame ?? end;
      if (layer.disabled || layer.muted || layer.weight <= 0 || frame < from || frame >= until) continue;
      const fadeIn = layer.fade_in_frames ?? 0, fadeOut = layer.fade_out_frames ?? 0;
      const weight = layer.weight * (fadeIn ? Math.min(1,(frame-from)/fadeIn) : 1) *
        (fadeOut ? Math.min(1,(until-frame)/fadeOut) : 1);
      if (weight <= 0) continue;
      const names = new Set(layer.keys.map((/** @type {any} */ key) => key.bone));
      if (previewKey && previewKey.layer_id === layer.id) names.add(previewKey.bone);
      for (const name of names) {
        const bone = bones.get(name);
        if (!bone) throw Error(`保存済みFK骨がPMXにありません: ${name}`);
        const keys = layer.keys.filter((/** @type {any} */ key) => key.bone === name &&
          !(previewKey && previewKey.layer_id === layer.id && previewKey.bone === name && key.frame === previewKey.frame));
        if (previewKey && previewKey.layer_id === layer.id && previewKey.bone === name) keys.push(previewKey);
        keys.sort((a,b) => a.frame - b.frame);
        if (!keys.length) continue;
        let left = keys[0], right = keys[0];
        for (let i = 1; i < keys.length; i++) {
          right = keys[i];
          if (frame <= right.frame) break;
          left = right;
        }
        const blend = right.frame === left.frame ? 0 :
          Math.min(1,Math.max(0,(frame-left.frame)/(right.frame-left.frame)));
        delta.fromArray(left.rotation);
        if (right !== left) {
          quat.fromArray(right.rotation);
          delta.slerp(quat,blend);
        }
        delta.normalize().slerp(identity,1-weight);
        bone.quaternion.multiply(delta);
      }
    }
  }
  function refreshModifier() {
    player.setPmxPoseModifier(layers.some(layer => !layer.disabled && !layer.muted && layer.keys.length) || previewKey
      ? applyCorrections : null);
  }
  return {
    duration: Math.max(0, Number(clip.duration) || 0), followBone,
    /** Saved layers belong only to this clip. preview is an unsaved replacement key. */
    setCorrectionLayers(nextLayers, preview = null) {
      if (!Array.isArray(nextLayers)) throw TypeError('FK layers required');
      layers = nextLayers;
      previewKey = preview;
      refreshModifier();
    },
    /** @param {number} seconds */
    seek(seconds) { player.seek(seconds); pmx.updateMatrixWorld(true); },
    /** @param {string[]} names */
    probe(names) {
      return Object.fromEntries(names.map((name) => {
        const bone = bones.get(name);
        return [name, bone ? { position: bone.getWorldPosition(vec).toArray(), quaternion: bone.getWorldQuaternion(quat).toArray() } : null];
      }));
    },
    dispose() { player.dispose(); },
  };
}
