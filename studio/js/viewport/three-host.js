// @ts-check
// 3D ビューポートの生成と破棄（P2 設計 §1.7）。主ビューは1つ。SCR-06では同じシーンを別カメラでも描ける。
// OrbitControls で回転・平行移動・前後移動。破棄は画面の後始末（ctx.onCleanup）に必ず登録する。
import { disposeObject } from './model-loader.js';

/** @typedef {import('./model-loader.js').Libs} Libs */
/** createViewport の戻り値（自己参照の型になるため any。メンバーは createViewport の api を見る）。 @typedef {any} Viewport */

export const WEBGL_ERROR_TEXT = '3D 表示を開始できません（WebGL が使えません）。';
export class WebGLError extends Error {
  constructor() { super(WEBGL_ERROR_TEXT); this.name = 'WebGLError'; }
}

/** @type {Viewport|null} */
let current = null;
/** 今ある3Dビューポート（テストの baiStudio.viewport が見る）。 */
export const currentViewport = () => current;
/** @type {any|null} */ let companionCurrent = null;
/** SCR-06 の補助ビュー。シーンの検証にも使う。 */
export const currentCompanionViewport = () => companionCurrent;

/** 状態の初期値。renderer は WEBGL_debug_renderer_info の文字列（取れなければ 'unknown'）。 */
const EMPTY = Object.freeze({ loaded: false, assetId: null, format: null, scale: null, offset: null, stage: null, character: null });
/** @typedef {'perspective'|'front'|'back'|'left'|'right'|'top'|'bottom'} ViewMode */
/** @typedef {Exclude<ViewMode, 'perspective'>} OrthographicMode */

/** @param {any} THREE @param {any} camera @param {OrthographicMode} mode @param {{min:number[],max:number[]}|null} bounds @param {number} aspect */
function placeOrthographic(THREE, camera, mode, bounds, aspect) {
  const min = bounds ? new THREE.Vector3(...bounds.min) : new THREE.Vector3(-2, -1, -2);
  const max = bounds ? new THREE.Vector3(...bounds.max) : new THREE.Vector3(2, 3, 2);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);
  const horizontal = mode === 'front' || mode === 'back' ? size.x : mode === 'left' || mode === 'right' ? size.z : size.x;
  const vertical = mode === 'top' || mode === 'bottom' ? size.z : size.y;
  const height = Math.max(4, vertical * 1.12, horizontal / Math.max(0.1, aspect) * 1.12);
  const distance = Math.max(8, Math.max(size.x, size.y, size.z) * 1.7);
  const direction = {
    front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
  }[mode];
  camera.position.copy(center).add(new THREE.Vector3(...direction).multiplyScalar(distance));
  camera.up.set(0, 1, 0);
  if (mode === 'top') camera.up.set(0, 0, -1);
  if (mode === 'bottom') camera.up.set(0, 0, 1);
  camera.lookAt(center);
  camera.near = 0.03;
  camera.far = Math.max(500, distance * 4);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  return { center, height };
}

/**
 * @param {HTMLElement} container 大きさを持つ要素（canvas を中に置く）
 * @param {Libs} libs
 * @param {{background?: number, freeDolly?: boolean, transparent?: boolean, preserveDrawingBuffer?: boolean}} [o]
 */
export function createViewport(container, libs, o = {}) {
  const { THREE, OrbitControls } = libs;
  /** @type {any} */ let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: Boolean(o.transparent),
      preserveDrawingBuffer: Boolean(o.preserveDrawingBuffer) });
  } catch {
    throw new WebGLError();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3Dビュー。中ドラッグで回転、Shift＋中ドラッグで平行移動、Ctrl＋中ドラッグまたはホイールで前後移動');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = o.transparent ? null : new THREE.Color(o.background ?? 0x162235);
  if (o.transparent) renderer.setClearColor(0x000000, 0);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x556677, 2.0);
  scene.add(ambient);
  const lamp = new THREE.DirectionalLight(0xffffff, 2);
  lamp.position.set(2, 6, 4);
  scene.add(lamp);
  const grid = new THREE.GridHelper(8, 16, 0x718098, 0x37465e);
  grid.visible = !o.transparent;
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 500);
  camera.position.set(2, 1.6, 4.5);
  const orthographic = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.03, 500);
  /** @type {ViewMode} */ let viewMode = 'perspective';
  /** @type {any} */ let activeCamera = camera;
  let orthoHeight = 10;
  const controls = new OrbitControls(camera, canvas);
  // Three.js 0.160.1 は ROTATE に修飾キーを付けると PAN に切り替わる。
  // Ctrl＋中ドラッグは通常ビューでは DOLLY、SCR-06 では注視点を越える前後移動にする。
  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  /** @type {{id:number,y:number}|null} */ let freeDrag = null;
  /** SCR-06 では視点と注視点を一緒に進め、原点・床・現在の注視点を通過できる。 */
  const walk = (/** @type {number} */ metres) => {
    if (!o.freeDolly || viewMode !== 'perspective' || !controls.enabled || !Number.isFinite(metres)) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    camera.position.addScaledVector(forward, metres);
    controls.target.addScaledVector(forward, metres);
    controls.update();
    invalidate();
  };
  const onWheel = (/** @type {WheelEvent} */ e) => {
    if (!o.freeDolly || viewMode !== 'perspective' || !controls.enabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    walk(-Math.max(-200, Math.min(200, pixels)) * 0.012);
  };
  const middleDown = (/** @type {PointerEvent} */ e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (o.freeDolly && e.ctrlKey && viewMode === 'perspective' && controls.enabled) {
      freeDrag = { id: e.pointerId, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
      return;
    }
    controls.mouseButtons.MIDDLE = e.ctrlKey ? THREE.MOUSE.DOLLY : viewMode === 'perspective' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  };
  const middleMove = (/** @type {PointerEvent} */ e) => {
    if (!freeDrag || e.pointerId !== freeDrag.id) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const delta = e.clientY - freeDrag.y;
    freeDrag.y = e.clientY;
    walk(-delta * 0.03);
  };
  const middleUp = (/** @type {PointerEvent} */ e) => {
    if (!freeDrag || e.pointerId !== freeDrag.id) return;
    freeDrag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.preventDefault(); e.stopImmediatePropagation();
  };
  const noAuxClick = (/** @type {MouseEvent} */ e) => { if (e.button === 1) e.preventDefault(); };
  canvas.addEventListener('pointerdown', middleDown, true);
  canvas.addEventListener('pointermove', middleMove, true);
  canvas.addEventListener('pointerup', middleUp, true);
  canvas.addEventListener('pointercancel', middleUp, true);
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  canvas.addEventListener('auxclick', noAuxClick);
  const navHelp = document.createElement('details');
  navHelp.className = 'vp-nav-help';
  navHelp.innerHTML = `<summary>視点操作</summary><span>中ドラッグ：回転<br>Shift＋中ドラッグ：左右・上下<br>Ctrl＋中ドラッグ／ホイール：前後${o.freeDolly ? '（注視点を越えて移動）' : ''}</span>`;
  container.append(navHelp);
  controls.target.set(0, 1, 0);
  controls.update();

  /** 利用者のオブジェクトを入れるグループ（clear() はこの中身だけ消す。ライトと床は残す）。 */
  const content = new THREE.Group();
  scene.add(content);

  let disposed = false;
  let raf = 0;
  /** @type {Set<() => void>} */ const invalidateListeners = new Set();
  const draw = () => { raf = 0; if (disposed) return; controls.update(); renderer.render(scene, activeCamera); };
  const invalidate = () => {
    if (disposed) return;
    if (!raf) raf = requestAnimationFrame(draw);
    for (const listener of invalidateListeners) listener();
  };
  controls.addEventListener('change', invalidate);

  const resize = () => {
    if (disposed) return;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    orthographic.left = -orthoHeight * w / h / 2;
    orthographic.right = orthoHeight * w / h / 2;
    orthographic.top = orthoHeight / 2;
    orthographic.bottom = -orthoHeight / 2;
    orthographic.updateProjectionMatrix();
    invalidate();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /** @type {Record<string, any>} */
  let extra = {};
  let rendererName = 'unknown';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    rendererName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || 'unknown';
  } catch { /* 取れなければ unknown */ }

  const perspectiveTarget = controls.target.clone();
  const api = {
    scene, camera: activeCamera, renderer, rendererName, controls, content,
    /** 平行投影6方向と透視を切り替え、透視へ戻る際には直前の視点を復元する。 @param {ViewMode} mode @param {{min:number[],max:number[]}|null} [bounds] */
    setViewMode(mode, bounds = null) {
      if (mode === 'perspective') {
        activeCamera = camera;
        controls.object = camera;
        controls.target.copy(perspectiveTarget);
        controls.enableRotate = true;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      } else {
        if (viewMode === 'perspective') perspectiveTarget.copy(controls.target);
        const aspect = Math.max(0.1, container.clientWidth / Math.max(1, container.clientHeight));
        const placed = placeOrthographic(THREE, orthographic, /** @type {OrthographicMode} */ (mode), bounds, aspect);
        orthoHeight = placed.height;
        activeCamera = orthographic;
        controls.object = orthographic;
        controls.target.copy(placed.center);
        controls.enableRotate = false;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
      }
      viewMode = mode;
      api.camera = activeCamera;
      resize();
      controls.update();
      const helpText = navHelp.querySelector('span');
      if (helpText) helpText.innerHTML = mode === 'perspective'
        ? `中ドラッグ：回転<br>Shift＋中ドラッグ：左右・上下<br>Ctrl＋中ドラッグ／ホイール：前後${o.freeDolly ? '（注視点を越えて移動）' : ''}`
        : '中ドラッグ：平行移動<br>Ctrl＋中ドラッグ／ホイール：拡大・縮小<br>視点メニューで透視へ戻る';
      invalidate();
    },
    /** 選択物へ視点を寄せる。データの座標は編集しない。 @param {number[]} position */
    focusAt(position) {
      const next = new THREE.Vector3(...position);
      const offset = activeCamera.position.clone().sub(controls.target);
      activeCamera.position.copy(next).add(offset);
      controls.target.copy(next);
      if (viewMode === 'perspective') perspectiveTarget.copy(next);
      else { orthoHeight = 4; resize(); }
      controls.update();
      invalidate();
    },
    /** SCR-06 の編集可能な照明に切り替える。ほかの画面の既定値は保つ。 */
    setBaseLighting(ambientIntensity, directionalIntensity) {
      ambient.intensity = ambientIntensity;
      lamp.intensity = directionalIntensity;
      invalidate();
    },
    /** 1つだけ置く（前のものは破棄）。SCR-12 の単体表示。 @param {any} object */
    setObject(object) {
      api.clear();
      content.add(object);
      invalidate();
    },
    /** 追加で置く（SCR-06 のキャラクターとステージ）。 @param {any} object */
    add(object) { content.add(object); invalidate(); },
    /** 置いたものを取り除いて破棄する。 @param {any} [object] 指定がなければすべて */
    clear(object) {
      const targets = object ? [object] : [...content.children];
      for (const t of targets) { content.remove(t); disposeObject(t); }
      invalidate();
    },
    /** 中身を囲む箱に合わせてカメラを引く（回転の中心を箱の中心に）。 @returns {boolean} 箱が空なら false */
    fit() {
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(content);
      if (box.isEmpty()) return false;
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
      const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
      camera.position.copy(center).add(new THREE.Vector3(0.45, 0.3, 1).normalize().multiplyScalar(dist));
      camera.near = Math.max(0.01, radius / 200);
      camera.far = Math.max(500, radius * 40 + dist * 2);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      invalidate();
      return true;
    },
    resize, invalidate,
    /** シーンが更新されたら補助ビューも再描画する。 @param {() => void} listener */
    onInvalidate(listener) { invalidateListeners.add(listener); return () => invalidateListeners.delete(listener); },
    /** 呼び出し側が現在の状態を書き込む（getState に出る）。 @param {Record<string, any>} patch */
    setState(patch) { extra = { ...extra, ...patch }; },
    getState() {
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(content);
      return { ...EMPTY, ...extra, secondaryView: companionCurrent?.host === api ? companionCurrent.getState() : null,
        renderer: rendererName, viewMode, cameraProjection: activeCamera.isOrthographicCamera ? 'orthographic' : 'perspective',
        cameraPosition: activeCamera.position.toArray(), cameraTarget: controls.target.toArray(), bounds: box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() } };
    },
    /**
     * モデルの描画を確かめる（テスト用）。床を隠して描き、背景と違う画素の数を返す。
     * 描画の直後に読むので preserveDrawingBuffer は要らない。
     */
    countNonBackground() {
      const gridWasVisible = grid.visible;
      grid.visible = false;
      renderer.render(scene, activeCamera);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      grid.visible = gridWasVisible;
      const [r, g, b] = [px[0], px[1], px[2]];
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) > 12) n++;
      invalidate();
      return n;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (companionCurrent?.host === api) companionCurrent.dispose();
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      invalidateListeners.clear();
      controls.removeEventListener('change', invalidate);
      canvas.removeEventListener('pointerdown', middleDown, true);
      canvas.removeEventListener('pointermove', middleMove, true);
      canvas.removeEventListener('pointerup', middleUp, true);
      canvas.removeEventListener('pointercancel', middleUp, true);
      canvas.removeEventListener('wheel', onWheel, true);
      canvas.removeEventListener('auxclick', noAuxClick);
      controls.dispose();
      for (const c of [...content.children]) disposeObject(c);
      content.clear();
      grid.geometry.dispose();
      /** @type {any} */ (grid.material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      navHelp.remove();
      if (current === api) current = null;
    },
  };
  if (current) current.dispose(); // 同時に1つだけ（前の画面の後始末が遅れても重ならない）
  current = api;
  return api;
}

/**
 * SCR-06 の補助ビュー。同じシーンを独立した正投影カメラと Canvas で描く。主ビューの操作・視点は変更しない。
 * @param {HTMLElement} container @param {Viewport} host @param {Libs} libs
 * @param {OrthographicMode} initialMode @param {{min:number[],max:number[]}|null} bounds
 * @param {(mode: OrthographicMode) => (() => void)} [beforeRender]
 */
export function createCompanionViewport(container, host, libs, initialMode, bounds, beforeRender) {
  const { THREE, OrbitControls } = libs;
  /** @type {any} */ let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch { throw new WebGLError(); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '補助ビュー。中ドラッグで平行移動、ホイールで拡大・縮小');
  container.prepend(canvas);
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.03, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  let mode = initialMode;
  let height = 10;
  let disposed = false;
  let raf = 0;
  let drawings = 0;
  const resize = () => {
    if (disposed) return;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.left = -height * w / h / 2;
    camera.right = height * w / h / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const draw = () => {
    raf = 0;
    if (disposed) return;
    controls.update();
    const restore = beforeRender?.(mode);
    try { renderer.render(host.scene, camera); drawings++; }
    finally { restore?.(); }
  };
  const invalidate = () => { if (!disposed && !raf) raf = requestAnimationFrame(draw); };
  controls.addEventListener('change', invalidate);
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const offHost = host.onInvalidate(invalidate);
  const api = {
    host, camera, renderer, controls,
    /** @param {OrthographicMode} next @param {{min:number[],max:number[]}|null} nextBounds */
    setViewMode(next, nextBounds) {
      mode = next;
      const placed = placeOrthographic(THREE, camera, mode, nextBounds, Math.max(0.1, container.clientWidth / Math.max(1, container.clientHeight)));
      height = placed.height;
      controls.target.copy(placed.center);
      controls.update();
      resize();
    },
    focusAt(position) {
      const next = new THREE.Vector3(...position);
      camera.position.add(next.clone().sub(controls.target));
      controls.target.copy(next);
      height = 4;
      controls.update();
      resize();
    },
    invalidate,
    getState() { return { mode, cameraProjection: 'orthographic', cameraPosition: camera.position.toArray(), cameraTarget: controls.target.toArray(), drawings }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      offHost();
      ro.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      if (companionCurrent === api) companionCurrent = null;
    },
  };
  api.setViewMode(initialMode, bounds);
  if (companionCurrent) companionCurrent.dispose();
  companionCurrent = api;
  return api;
}
