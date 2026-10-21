// @ts-check
// Choose a stage camera from its architecture and rendered content. Source geometry is read only.

/** @param {any} object */
function isSky(object) {
  for (let node = object; node; node = node.parent) {
    if (/sky|dome|skydome|背景球|天空球|環境球/i.test(String(node.name || ''))) return true;
  }
  return false;
}

/** @param {any} object @param {any} THREE */
export function planStageViews(object, THREE) {
  object.updateMatrixWorld(true);
  const core = new THREE.Box3();
  const all = new THREE.Box3();
  let hasSky = false, hasWall = false, count = 0;
  object.traverse((/** @type {any} */ node) => {
    if (!node.isMesh) return;
    const bounds = new THREE.Box3().setFromObject(node, true);
    if (bounds.isEmpty()) return;
    all.union(bounds);
    if (isSky(node)) { hasSky = true; return; }
    core.union(bounds); count++;
    if (/wall|ceiling|room|壁|天井|室内/i.test(String(node.name || ''))) hasWall = true;
  });
  if (!count) core.copy(all);
  if (core.isEmpty()) return null;
  const size = core.getSize(new THREE.Vector3());
  const center = core.getCenter(new THREE.Vector3());
  const enclosed = hasSky || hasWall;
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  const height = Math.max(0.5, size.y);
  const views = directions.map(([x, z]) => {
    if (enclosed) {
      const radius = Math.max(0.4, Math.min(size.x, size.z) * 0.31);
      return {
        eye: new THREE.Vector3(center.x + x * radius, core.min.y + Math.min(2.1, height * 0.42), center.z + z * radius),
        target: new THREE.Vector3(center.x, core.min.y + Math.min(1.5, height * 0.30), center.z),
        fov: 58,
      };
    }
    const radius = Math.max(1.5, size.length() * 1.25);
    return {
      eye: new THREE.Vector3(center.x + x * radius, center.y + Math.max(0.25, height * 0.35), center.z + z * radius),
      target: center.clone(),
      fov: 42,
    };
  });
  return { enclosed, bounds: core, views };
}

/** Prefer visible architecture, color and edge detail to a flat shell or empty background. @param {ImageData} frame */
function frameScore(frame) {
  const { data, width, height } = frame;
  let edges = 0, chroma = 0, covered = 0, sum = 0, squared = 0, n = 0;
  const luminance = (/** @type {number} */ x, /** @type {number} */ y) => {
    const i = (y * width + x) * 4;
    return data[i] * 0.21 + data[i + 1] * 0.72 + data[i + 2] * 0.07;
  };
  for (let y = 4; y < height - 4; y += 4) {
    for (let x = 4; x < width - 4; x += 4) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const light = luminance(x, y);
      edges += Math.abs(light - luminance(x - 4, y)) + Math.abs(light - luminance(x, y - 4));
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      if (Math.abs(r - 22) + Math.abs(g - 34) + Math.abs(b - 53) > 35) covered++;
      sum += light; squared += light * light; n++;
    }
  }
  if (!n) return -Infinity;
  const variance = Math.max(0, squared / n - (sum / n) ** 2);
  return edges / n + chroma / n * 0.18 + covered / n * 18 + Math.sqrt(variance) * 0.23;
}

/** Analyze candidate viewpoints at low resolution, then capture the best one. @param {any} object @param {any} THREE @param {any} renderer @param {any} scene */
export function captureStageView(object, THREE, renderer, scene) {
  const plan = planStageViews(object, THREE);
  if (!plan) return null;
  const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.02, 2000);
  const probe = document.createElement('canvas');
  probe.width = 320; probe.height = 240;
  const probeContext = probe.getContext('2d', { willReadFrequently: true });
  if (!probeContext) return null;
  let best = -Infinity, chosen = plan.views[0];
  renderer.setSize(320, 240);
  for (const view of plan.views) {
    camera.fov = view.fov; camera.position.copy(view.eye); camera.lookAt(view.target); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    probeContext.drawImage(renderer.domElement, 0, 0, 320, 240);
    const score = frameScore(probeContext.getImageData(0, 0, 320, 240));
    if (score > best) { best = score; chosen = view; }
  }
  camera.fov = chosen.fov; camera.position.copy(chosen.eye); camera.lookAt(chosen.target); camera.updateProjectionMatrix();
  renderer.setSize(640, 480);
  renderer.render(scene, camera);
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  canvas.getContext('2d')?.drawImage(renderer.domElement, 0, 0);
  return { canvas, enclosed: plan.enclosed, score: best, camera: chosen };
}
