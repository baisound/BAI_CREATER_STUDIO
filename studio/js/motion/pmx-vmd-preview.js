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
  /** @type {any[]} */ let previewKeys = [];
  function applyCorrections(_mesh, seconds) {
    const solo = layers.find(layer => layer.solo);
    for (const layer of layers) {
      if (solo && layer !== solo) continue;
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
      for (const key of previewKeys) if (key.layer_id === layer.id) names.add(key.bone);
      for (const name of names) {
        const bone = bones.get(name);
        if (!bone) throw Error(`保存済みFK骨がPMXにありません: ${name}`);
        const keys = layer.keys.filter((/** @type {any} */ key) => key.bone === name &&
          !previewKeys.some(preview => preview.layer_id === layer.id &&
            preview.bone === name && key.frame === preview.frame));
        keys.push(...previewKeys.filter(preview => preview.layer_id === layer.id && preview.bone === name));
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
        // Legacy rotation-only keys have an implicit zero translation.
        const a = left.position || [0,0,0], b = right.position || [0,0,0];
        bone.position.x += weight * (a[0] + (b[0]-a[0]) * blend);
        bone.position.y += weight * (a[1] + (b[1]-a[1]) * blend);
        bone.position.z += weight * (a[2] + (b[2]-a[2]) * blend);
      }
    }
  }
  function refreshModifier() {
    const solo = layers.find(layer => layer.solo);
    player.setPmxPoseModifier(layers.some(layer => (!solo || layer === solo) &&
      !layer.disabled && !layer.muted && layer.weight > 0 && layer.keys.length) ||
      previewKeys.some(key => !solo || key.layer_id === solo.id)
      ? applyCorrections : null);
  }
  return {
    duration: Math.max(0, Number(clip.duration) || 0), followBone,
    /** Saved layers belong only to this clip. Preview replaces one or two unsaved keys. */
    setCorrectionLayers(nextLayers, preview = null) {
      if (!Array.isArray(nextLayers)) throw TypeError('FK layers required');
      const keys=preview===null?[]:Array.isArray(preview)?preview:[preview];
      if(keys.length>2||keys.some(key=>!key||typeof key.layer_id!=='string'||
          typeof key.bone!=='string'||!Number.isInteger(key.frame))||
          new Set(keys.map(key=>`${key.layer_id}\u0000${key.bone}\u0000${key.frame}`)).size!==keys.length)
        throw TypeError('Invalid FK preview key pair');
      layers = nextLayers;
      previewKeys = keys;
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
