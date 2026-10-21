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
  return {
    duration: Math.max(0, Number(clip.duration) || 0), followBone,
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
