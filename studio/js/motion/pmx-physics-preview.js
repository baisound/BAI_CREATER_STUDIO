// @ts-check
// AUDIO-001 / Issue #39: PMX rigid-body preview using the same three.js r160 Ammo
// runtime as the official MMD example. The source PMX and its weights stay untouched.
const AMMO_DIR = 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/';
/** @type {Promise<any>|null} */ let ammoPromise = null;

async function ensureAmmo() {
  if (ammoPromise) return ammoPromise;
  ammoPromise = (async () => {
    const win = /** @type {any} */ (window);
    if (!win.Ammo) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AMMO_DIR + 'ammo.wasm.js'; script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Ammo物理エンジンを読み込めません。'));
      document.head.append(script);
    });
    if (typeof win.Ammo === 'function') win.Ammo = await win.Ammo({ locateFile: (/** @type {string} */ file) => AMMO_DIR + file });
    if (!win.Ammo?.btDiscreteDynamicsWorld) throw new Error('Ammo物理エンジンの初期化に失敗しました。');
    return win.Ammo;
  })().catch(e => { ammoPromise = null; throw e; });
  return ammoPromise;
}

/** @param {any} pmx @param {any} motionPreview */
export async function createPmxPhysicsPreview(pmx, motionPreview) {
  const mmd = pmx?.geometry?.userData?.MMD;
  if (!Array.isArray(mmd?.rigidBodies) || !Array.isArray(mmd?.constraints)) throw new Error('PMXに物理情報がありません。');
  const dynamicBodies = mmd.rigidBodies.filter((/** @type {any} */ body) => body.type !== 0).length;
  if (!dynamicBodies) throw new Error('PMXに揺れを計算する剛体がありません。');
  const Ammo = await ensureAmmo();
  const spec = 'three/addons/animation/MMDPhysics.js';
  const { MMDPhysics } = await import(spec);
  // Own the Bullet components so viewport replacement can release them.
  // MMDPhysics r160 creates these as locals and does not expose disposal.
  const config = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(config);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
  const gravity = new Ammo.btVector3(0, -98, 0);
  world.setGravity(gravity); Ammo.destroy(gravity);
  const physics = new MMDPhysics(pmx, mmd.rigidBodies, mmd.constraints, { world });
  const zero = new Ammo.btVector3(0, 0, 0);
  let lastTime = NaN;
  // MMDPhysics.update() temporarily removes the mesh scale because PMX rigid
  // bodies are authored in the unscaled model coordinate system. Its reset()
  // does not do that conversion, so apply the same transform here before a
  // discontinuous seek. Otherwise a scaled viewport (.08 here) launches the
  // cloth rigid bodies far away from their bones.
  function resetAtUnitScale() {
    const parent = pmx.parent;
    const scale = pmx.scale.clone();
    if (parent) pmx.parent = null;
    try {
      pmx.scale.set(1, 1, 1);
      pmx.updateMatrixWorld(true);
      physics.reset();
    } finally {
      pmx.scale.copy(scale);
      if (parent) pmx.parent = parent;
      pmx.updateMatrixWorld(true);
    }
  }
  function reset(seconds) {
    motionPreview.seek(seconds);
    resetAtUnitScale();
    for (const item of physics.bodies) {
      if (item.params.type === 0) continue;
      item.body.setLinearVelocity(zero); item.body.setAngularVelocity(zero);
      item.body.clearForces(); item.body.activate();
    }
    for (let i = 0; i < 8; i++) {
      physics.update(1 / 60);
      // r160 restores mesh.scale but leaves matrixWorld at unit scale. The
      // next update would skip its scale conversion and move dynamic bones by
      // the inverse viewport scale. Rebuild the matrix after every step.
      pmx.updateMatrixWorld(true);
    }
    lastTime = seconds;
  }
  return {
    dynamicBodies,
    constraints: mmd.constraints.length,
    /** @param {number} seconds @param {boolean} continuous */
    seek(seconds, continuous) {
      const time = Math.max(0, Math.min(motionPreview.duration, Number.isFinite(seconds) ? seconds : 0));
      if (!continuous || !Number.isFinite(lastTime) || time < lastTime || time - lastTime > .15) { reset(time); return; }
      while (time - lastTime > 1e-4) {
        const dt = Math.min(1 / 60, time - lastTime);
        lastTime += dt;
        motionPreview.seek(lastTime);
        physics.update(dt);
        pmx.updateMatrixWorld(true);
      }
    },
    resetTime() { lastTime = NaN; },
    dispose() {
      Ammo.destroy(zero);
      // MMDPhysics r160 has no public dispose API. Release its Bullet world and
      // registered constraints/bodies when this viewport is replaced.
      for (const item of physics.constraints) { physics.world.removeConstraint(item.constraint); Ammo.destroy(item.constraint); }
      for (const item of physics.bodies) {
        physics.world.removeRigidBody(item.body);
        const shape = item.body.getCollisionShape(), motion = item.body.getMotionState();
        Ammo.destroy(item.body); if (motion) Ammo.destroy(motion); if (shape) Ammo.destroy(shape);
      }
      Ammo.destroy(world); Ammo.destroy(solver); Ammo.destroy(broadphase); Ammo.destroy(dispatcher); Ammo.destroy(config);
    },
  };
}
