// @ts-check
// 3D ビューポートの生成と破棄（P2 設計 §1.7）。SCR-12 と SCR-06 が使う。同時に存在するのは1つだけ。
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

/** 状態の初期値。renderer は WEBGL_debug_renderer_info の文字列（取れなければ 'unknown'）。 */
const EMPTY = Object.freeze({ loaded: false, assetId: null, format: null, scale: null, offset: null, stage: null, character: null });

/**
 * @param {HTMLElement} container 大きさを持つ要素（canvas を中に置く）
 * @param {Libs} libs
 * @param {{background?: number}} [o]
 */
export function createViewport(container, libs, o = {}) {
  const { THREE, OrbitControls } = libs;
  /** @type {any} */ let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
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
  scene.background = new THREE.Color(o.background ?? 0x162235);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2.0));
  const lamp = new THREE.DirectionalLight(0xffffff, 2);
  lamp.position.set(2, 6, 4);
  scene.add(lamp);
  const grid = new THREE.GridHelper(8, 16, 0x718098, 0x37465e);
  scene.add(grid);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 500);
  camera.position.set(2, 1.6, 4.5);
  const controls = new OrbitControls(camera, canvas);
  // Three.js 0.160.1 は ROTATE に修飾キーを付けると PAN に切り替わる。
  // Ctrl＋中ドラッグだけは pointerdown の前に DOLLY へ割り当てる。
  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
  const middleDown = (/** @type {PointerEvent} */ e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    controls.mouseButtons.MIDDLE = e.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  };
  const noAuxClick = (/** @type {MouseEvent} */ e) => { if (e.button === 1) e.preventDefault(); };
  canvas.addEventListener('pointerdown', middleDown, true);
  canvas.addEventListener('auxclick', noAuxClick);
  const navHelp = document.createElement('details');
  navHelp.className = 'vp-nav-help';
  navHelp.innerHTML = '<summary>視点操作</summary><span>中ドラッグ：回転<br>Shift＋中ドラッグ：左右・上下<br>Ctrl＋中ドラッグ／ホイール：前後</span>';
  container.append(navHelp);
  controls.target.set(0, 1, 0);
  controls.update();

  /** 利用者のオブジェクトを入れるグループ（clear() はこの中身だけ消す。ライトと床は残す）。 */
  const content = new THREE.Group();
  scene.add(content);

  let disposed = false;
  let raf = 0;
  const draw = () => { raf = 0; if (disposed) return; controls.update(); renderer.render(scene, camera); };
  const invalidate = () => { if (!disposed && !raf) raf = requestAnimationFrame(draw); };
  controls.addEventListener('change', invalidate);

  const resize = () => {
    if (disposed) return;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
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

  const api = {
    scene, camera, renderer, controls, content,
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
    /** 呼び出し側が現在の状態を書き込む（getState に出る）。 @param {Record<string, any>} patch */
    setState(patch) { extra = { ...extra, ...patch }; },
    getState() {
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(content);
      return { ...EMPTY, ...extra, renderer: rendererName, cameraPosition: camera.position.toArray(), cameraTarget: controls.target.toArray(), bounds: box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() } };
    },
    /**
     * モデルの描画を確かめる（テスト用）。床を隠して描き、背景と違う画素の数を返す。
     * 描画の直後に読むので preserveDrawingBuffer は要らない。
     */
    countNonBackground() {
      grid.visible = false;
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      grid.visible = true;
      const [r, g, b] = [px[0], px[1], px[2]];
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) > 12) n++;
      invalidate();
      return n;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('change', invalidate);
      canvas.removeEventListener('pointerdown', middleDown, true);
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
