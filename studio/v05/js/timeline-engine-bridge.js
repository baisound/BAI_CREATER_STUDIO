/* Phase 14: opt-in bridge contract. No simulated engine playback. */
(function () {
  'use strict';
  let adapter = null;
  let last = null;
  function register(candidate) {
    if (!candidate || typeof candidate.seek !== 'function') throw new TypeError('Engine adapter requires seek(seconds, activeClips)');
    adapter = candidate;
    return () => { if (adapter === candidate) adapter = null; };
  }
  window.BAIStudioEngineBridge = Object.freeze({
    register,
    status: () => ({connected: Boolean(adapter), lastSeek: last}),
    disconnect: () => { adapter = null; }
  });
  window.addEventListener('bai:timeline-seek', async event => {
    const detail = event.detail;
    if (!adapter || !detail || !Number.isFinite(detail.seconds)) return;
    const current = adapter;
    try {
      await current.seek(detail.seconds, detail.tracks);
      if (current === adapter) last = detail.seconds;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('bai:engine-seek-error', {detail: {seconds: detail.seconds, message: String(error && error.message || error)}}));
    }
  });
})();
