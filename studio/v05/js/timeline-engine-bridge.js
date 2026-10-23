/* Phase 15: bridge timeline seeks to registered live media engines.
   This does not instantiate models, cameras, audio devices or playback engines. */
(function () {
  'use strict';
  const engines = new Map();
  let legacy = null;
  let last = null;
  let version = 0;
  const VALID_TYPES = new Set(['motion', 'camera', 'face', 'lip', 'audio', 'effect', 'light', 'video', 'scene']);
  function requireSeekable(value) {
    if (!value || typeof value.seek !== 'function') throw new TypeError('A live engine must implement seek(seconds, clip, context)');
  }
  function register(candidate) {
    requireSeekable(candidate);
    legacy = candidate;
    return () => { if (legacy === candidate) legacy = null; };
  }
  /** Register an existing live preview/runtime. Use matching clip ID to avoid targeting another model. */
  function registerEngine(type, clipId, runtime) {
    if (!VALID_TYPES.has(type)) throw new RangeError('Unsupported timeline track type: ' + type);
    if (typeof clipId !== 'string' || !clipId.trim()) throw new TypeError('clipId is required');
    requireSeekable(runtime);
    const key = type + ':' + clipId;
    engines.set(key, runtime);
    return () => { if (engines.get(key) === runtime) engines.delete(key); };
  }
  function status() {
    return {connected: Boolean(legacy) || engines.size > 0, registeredEngines: [...engines.keys()], lastSeek: last};
  }
  function disconnect() { legacy = null; engines.clear(); version++; }
  function relevantClips(detail) {
    return Array.isArray(detail.tracks) ? detail.tracks.filter(c => c && typeof c.id === 'string' && VALID_TYPES.has(c.type) && Number.isFinite(c.offsetSeconds) && c.offsetSeconds >= 0) : [];
  }
  async function seek(detail) {
    if (!detail || !Number.isFinite(detail.seconds) || detail.seconds < 0) return;
    const operation = ++version;
    const clips = relevantClips(detail);
    const operations = [];
    if (legacy) operations.push(Promise.resolve().then(() => legacy.seek(detail.seconds, clips)));
    for (const clip of clips) {
      const engine = engines.get(clip.type + ':' + clip.id);
      if (!engine) continue;
      operations.push(Promise.resolve().then(() => engine.seek(clip.offsetSeconds, clip, {globalSeconds: detail.seconds, source: detail.source})));
    }
    const results = await Promise.allSettled(operations);
    if (operation !== version) return;
    last = detail.seconds;
    const errors = results.filter(r => r.status === 'rejected').map(r => String(r.reason && r.reason.message || r.reason));
    if (errors.length) window.dispatchEvent(new CustomEvent('bai:engine-seek-error', {detail: {seconds: detail.seconds, message: errors.join('; ')}}));
  }
  window.BAIStudioEngineBridge = Object.freeze({register, registerEngine, status, disconnect, seek});
  window.addEventListener('bai:timeline-seek', event => { void seek(event.detail); });
})();
