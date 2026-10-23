/* v57 shared-scene foundation: one externally owned scene/renderer/camera, distinct roots per instance.
   This is not a replacement for the legacy single-model preview until verified with real GPU assets. */
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BAIStudioSharedSceneV57 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function createHost({ scene, renderer, camera, onError = () => {} }) {
    if (!scene?.add || !scene?.remove || !renderer?.render || !camera)
      throw Error('Shared scene requires scene, renderer and camera');
    const entries = new Map();
    const owners = new WeakMap();
    let generation = 0, destroyed = false;
    function check() { if (destroyed) throw Error('Scene host closed'); }
    function mount(id, root, { evaluate = () => {}, dispose = () => {} } = {}) {
      check();
      if (typeof id !== 'string' || !id || !root?.position?.set ||
          !root?.rotation?.set || !root?.scale?.set || typeof evaluate !== 'function')
        throw Error('Invalid instance or root');
      if (entries.has(id) || owners.has(root)) throw Error('Duplicate scene instance/root');
      owners.set(root, id);
      scene.add(root);
      entries.set(id, { root, evaluate, dispose, generation });
      return () => unmount(id);
    }
    function setTransform(id, value) {
      check();
      const entry = entries.get(id);
      if (!entry) throw Error('Scene instance not loaded');
      for (const key of ['position', 'rotation', 'scale']) {
        const vector = value?.[key];
        if (!Array.isArray(vector) || vector.length !== 3 ||
            vector.some(x => typeof x !== 'number' || !Number.isFinite(x)))
          throw Error('Invalid '+key);
        if (key === 'scale' && vector.some(x => x <= 0)) throw Error('Invalid scale');
      }
      entry.root.position.set(...value.position);
      entry.root.rotation.set(...value.rotation.map(x => x * Math.PI / 180));
      entry.root.scale.set(...value.scale);
    }
    function unmount(id) {
      const entry = entries.get(id);
      if (!entry) return false;
      entries.delete(id);
      owners.delete(entry.root);
      scene.remove(entry.root);
      try { entry.dispose(); } catch (e) { onError({ id, error: e }); }
      return true;
    }
    function evaluateAt(time, clipsByInstance = {}) {
      check();
      if (!Number.isFinite(time) || time < 0) throw Error('Invalid timeline time');
      const errors = [];
      for (const [id, entry] of entries) {
        try {
          const clips = Array.isArray(clipsByInstance[id]) ? clipsByInstance[id] : [];
          entry.evaluate(time, clips);
        } catch (error) {
          errors.push({ id, error });
          onError({ id, error });
        }
      }
      renderer.render(scene, camera); // exactly once per global time evaluation
      return { time, rendered: true, evaluated: entries.size, errors };
    }
    function nextGeneration() {
      check(); generation += 1; return generation;
    }
    function acceptsGeneration(token) { return !destroyed && token === generation; }
    function clear() { for (const id of Array.from(entries.keys())) unmount(id); generation++; }
    function close() { if (!destroyed) {clear(); destroyed = true;} }
    return { mount, unmount, setTransform, evaluateAt, nextGeneration,
             acceptsGeneration, clear, close, size: () => entries.size };
  }
  return { createHost };
});
