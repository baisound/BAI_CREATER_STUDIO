/* Phase 16: Bind an ALREADY INSTANTIATED VMD/GLB motion preview to a v0.5 timeline clip.
   Never construct, mutate or dispose the source asset. The owner retains the preview lifecycle. */
(function (root) {
  'use strict';
  const bindings = new Map();
  function attach({ clipId, preview, type = 'motion', invalidate = null }) {
    if (typeof clipId !== 'string' || !clipId.trim()) throw new TypeError('clipId is required');
    if (!preview || typeof preview.seek !== 'function') throw new TypeError('Loaded preview must implement seek(seconds)');
    if (invalidate !== null && typeof invalidate !== 'function') throw new TypeError('invalidate must be a function');
    const bridge = root.BAIStudioEngineBridge;
    if (!bridge || typeof bridge.registerEngine !== 'function') throw new Error('Timeline engine bridge is not available');
    if (bindings.has(clipId)) bindings.get(clipId)();
    let attached = true;
    const runtime = {
      seek(seconds) {
        if (!attached) return;
        if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid motion offset');
        const duration = Number(preview.duration);
        const bounded = Number.isFinite(duration) && duration > 0 ? Math.min(seconds, Math.max(0, duration - 1e-6)) : seconds;
        preview.seek(bounded);
        if (invalidate) invalidate();
      },
    };
    const unregister = bridge.registerEngine(type, clipId, runtime);
    const detach = () => {
      if (!attached) return;
      attached = false;
      unregister();
      if (bindings.get(clipId) === detach) bindings.delete(clipId);
    };
    bindings.set(clipId, detach);
    return detach;
  }
  function detachAll() { for (const dispose of [...bindings.values()]) dispose(); }
  root.BAIStudioLiveMotion = Object.freeze({ attach, detachAll, activeClipIds: () => [...bindings.keys()] });
})(typeof window !== 'undefined' ? window : globalThis);
