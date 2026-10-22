/* Stage 18: resolve persisted clip/asset IDs to loaded motion previews.
 * This module does not guess filesystem URLs or silently instantiate a player.
 * The host must explicitly register an asset loader compatible with its renderer.
 */
(function (root) {
  'use strict';
  const active = new Map();
  let generation = 0;
  let loader = null;
  let projectId = null;
  function setLoader(fn) {
    if (fn !== null && typeof fn !== 'function') throw new TypeError('loader must be a function or null');
    loader = fn;
  }
  function validate(clips, assets) {
    if (!Array.isArray(clips) || !Array.isArray(assets)) throw new TypeError('clips and assets must be arrays');
    const assetMap = new Map(assets.filter(a => a && typeof a.id === 'string').map(a => [a.id,a]));
    const playable = [], issues = [];
    for (const clip of clips) {
      if (!clip || typeof clip.id !== 'string' || !clip.id || typeof clip.asset_id !== 'string') {
        issues.push({clipId:clip?.id ?? null, reason:'invalid_clip'});continue;
      }
      if (clip.track !== 'motion') continue;
      const asset = assetMap.get(clip.asset_id);
      if (!asset) {issues.push({clipId:clip.id, reason:'missing_asset'});continue;}
      if (!asset.available) {issues.push({clipId:clip.id, reason:'unavailable_asset'});continue;}
      if (asset.category !== 'motion') {issues.push({clipId:clip.id, reason:'incompatible_category'});continue;}
      if (!Number.isFinite(clip.start) || !Number.isFinite(clip.duration) || clip.start<0 || clip.duration<=0) {
        issues.push({clipId:clip.id, reason:'invalid_time'});continue;
      }
      playable.push({clip, asset});
    }
    return {playable,issues};
  }
  function detachAll() {
    generation++;
    for (const entry of active.values()) {
      try {entry.detach();} catch (_) {}
      try {entry.dispose?.();} catch (_) {}
    }
    active.clear();
  }
  async function reconcile({project_id,clips,assets}) {
    if (typeof project_id !== 'string' || !project_id) throw new TypeError('project_id is required');
    if (projectId !== project_id) {detachAll();projectId=project_id;}
    const token=++generation;
    const {playable,issues}=validate(clips,assets);
    const desired=new Map(playable.map(x=>[x.clip.id,x]));
    for (const [id,entry] of active) {
      const next=desired.get(id);
      if (!next || next.asset.id!==entry.assetId) {
        entry.detach(); entry.dispose?.();active.delete(id);
      }
    }
    if (!loader) return {connected:active.size, pending:playable.length-active.size, issues:[...issues,{reason:'loader_not_registered'}]};
    for (const {clip,asset} of playable) {
      if (active.has(clip.id)) continue;
      let loaded;
      try {
        loaded=await loader({asset,clip,projectId:project_id});
        if (token!==generation) {loaded?.dispose?.();return {stale:true,connected:active.size,issues};}
        if (!loaded || typeof loaded.seek!=='function') throw new TypeError('Asset loader did not return a seekable preview');
        if (!root.BAIStudioLiveMotion?.attach) throw new Error('Motion bridge unavailable');
        const detach=root.BAIStudioLiveMotion.attach({clipId:clip.id,preview:loaded,type:'motion',invalidate:loaded.invalidate});
        active.set(clip.id,{assetId:asset.id,detach,dispose:loaded.dispose});
      } catch (err) {
        try {loaded?.dispose?.();} catch (_) {}
        issues.push({clipId:clip.id,reason:'load_failed',message:String(err?.message||err)});
      }
    }
    return {connected:active.size,pending:playable.length-active.size,issues};
  }
  root.BAIStudioAssetRuntime=Object.freeze({setLoader,reconcile,validate,detachAll,status:()=>({projectId,connected:[...active.keys()],loaderReady:Boolean(loader)})});
})(typeof window !== 'undefined' ? window : globalThis);
