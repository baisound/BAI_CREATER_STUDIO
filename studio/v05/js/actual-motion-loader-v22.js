/* v0.5 Phase 22: actual Three.js model / motion loading, intentionally separate
 * from the legacy page's global viewport. Reuses the shipped loaders and players.
 * Unsupported combinations throw; no simulated successful animations. */
import { loadLibs, loadModel, disposeObject } from '../../js/viewport/model-loader.js';
import { normalizeModel } from '../../js/viewport/normalize.fork.js';
import { createViewport } from '../../js/viewport/three-host.js';
import { createGenericGlbPreview } from '../../js/motion/generic-glb-preview.js';
import { createPmxGlbPreview } from '../../js/motion/pmx-glb-preview.js';
import { createPmxVmdPreview } from '../../js/motion/pmx-vmd-preview.js';
import { loadVmdClip, vmdUrl } from '../../js/motion/vmd.js';
import { createShootingPreview } from './shooting-preview-v27.js';

export function compatibleMotion(modelFormat, motionFormat) {
  const model = String(modelFormat || '').toUpperCase();
  const motion = String(motionFormat || '').toUpperCase();
  return ['PMX','GLB','VRM','FBX'].includes(model) &&
    (motion === 'VMD' ? model === 'PMX' : ['GLB','FBX'].includes(motion));
}

export function createActualMotionLoaders(container, report = () => {}) {
  if (!container || typeof container.appendChild !== 'function') throw new TypeError('Preview container required');
  let libsPromise = null;
  const models = new Map();
  let disposed = false;
  function getLibs() { return libsPromise ||= loadLibs(); }
  function ensureActive() { if (disposed) throw new Error('Preview was closed'); }
  async function loadTarget({modelId, asset}) {
    ensureActive();
    if (models.size && !models.has(modelId)) throw new Error('このプレビューは単一モデル表示です。別モデルを表示するにはプレビューを閉じてください。');
    const libs = await getLibs(); ensureActive();
    const loaded = await loadModel(asset, libs);
    if (disposed) { disposeObject(loaded.object); throw new Error('Preview was closed'); }
    const object = loaded.object;
    let host, shootingPreview;
    try {
      if (loaded.format === 'PMX') {
        object.scale.setScalar(.08);object.updateMatrixWorld(true);
        const box = new libs.THREE.Box3().setFromObject(object,true);
        object.position.y -= box.min.y;
      } else normalizeModel(object, loaded.format, libs.THREE);
      host = createViewport(container, libs);
      host.setObject(object);host.fit();
      const shootingParent = container.querySelector('[data-shooting-preview]');
      if (shootingParent && window.BAIStudioShootingCamera) {
        try {
          shootingPreview=createShootingPreview({THREE:libs.THREE,host,parent:shootingParent,cameraRuntime:window.BAIStudioShootingCamera});
        } catch (err) { report('撮影カメラを接続できません：'+String(err.message||err)); }
      }
      const target = {
        format:loaded.format, object, libs, host,
        seek(seconds) { if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid time'); host.invalidate?.(); },
        invalidate() {host.invalidate?.();shootingPreview?.invalidate();},
        dispose() {if(models.get(modelId)===target) models.delete(modelId);shootingPreview?.dispose();host.dispose();disposeObject(object);}
      };
      models.set(modelId,target);report(`モデル読込完了：${asset.name || modelId}`);
      return target;
    } catch (error) {shootingPreview?.dispose();host?.dispose();disposeObject(object);throw error;}
  }
  async function loadMotion({asset,clip,targetModelId,targetPreview}) {
    ensureActive();
    if(!targetModelId || !targetPreview) throw new Error('対象モデルが必要です。先にモデルを指定してください。');
    const {format,object,libs,host} = targetPreview;
    if(!compatibleMotion(format,asset.format)) throw new Error(`この組み合わせは未対応です：${format} + ${asset.format}`);
    let preview, sourceObject;
    try {
      if(String(asset.format).toUpperCase()==='VMD') {
        const vmd = await loadVmdClip(libs,vmdUrl(asset),object);
        ensureActive();
        preview=createPmxVmdPreview(libs.THREE,libs.MMDAnimationHelper,object,vmd,asset.id);
      } else {
        const motion=await loadModel(asset,libs);sourceObject=motion.object;
        ensureActive();
        if(!motion.animations.length) throw new Error('モーション素材にアニメーションがありません');
        preview=format==='PMX' ? createPmxGlbPreview(libs.THREE,object,sourceObject,motion.animations[0]) : createGenericGlbPreview(libs.THREE,object,sourceObject,motion.animations[0]);
      }
      report(`モーション読込完了：${asset.name || clip.id}`);
      let closed=false;
      return {
        duration:preview.duration,
        seek(seconds) {if(closed)return;preview.seek(seconds);host.invalidate?.();},
        invalidate(){host.invalidate?.();shootingPreview?.invalidate();},
        dispose(){if(closed)return;closed=true;preview.dispose();if(sourceObject)disposeObject(sourceObject);}
      };
    } catch(error){preview?.dispose();if(sourceObject)disposeObject(sourceObject);throw error;}
  }
  return {
    loadTarget, loadMotion,
    dispose() {disposed=true;for(const target of [...models.values()]) target.dispose();models.clear();},
  };
}
