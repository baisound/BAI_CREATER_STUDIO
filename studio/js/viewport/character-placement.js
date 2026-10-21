// @ts-check
// Issue #50: one saved character reference across the existing four-format loaders.
import { stageTransform } from './placement.js';

/** @typedef {{position:[number,number,number], rotation:[number,number,number], scale:number}} CharacterPlacement */

/** @returns {CharacterPlacement} */
export const defaultCharacterPlacement = () => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });

/** Legacy GLB/VRM filenames remain valid workspace.asset values. @param {string} ref */
export const assetIdFromWorkspace = (ref) => !ref ? '' : /^(integrated:|mmd:[AB]:|fbx:)/.test(ref) ? ref : `integrated:${ref}`;

/** @param {{source:string,format:string,filename?:string,id:string}} item */
export const workspaceRefFor = (item) => item.source === 'integrated' && ['GLB', 'VRM'].includes(item.format) && item.filename ? item.filename : item.id;

/** @param {any} value @returns {value is CharacterPlacement} */
export const isCharacterPlacement = (value) => !!value && typeof value === 'object'
  && Array.isArray(value.position) && value.position.length === 3 && value.position.every((/** @type {any} */ n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000)
  && Array.isArray(value.rotation) && value.rotation.length === 3 && value.rotation.every((/** @type {any} */ n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 360)
  && typeof value.scale === 'number' && Number.isFinite(value.scale) && value.scale >= .01 && value.scale <= 100;

/** @param {any} root @param {CharacterPlacement} placement */
export function applyCharacterPlacement(root, placement) {
  const t = stageTransform(/** @type {any} */ (placement), root.userData.unit);
  root.position.set(...t.position);
  root.rotation.set(...t.rotation);
  root.scale.setScalar(t.scale);
}
