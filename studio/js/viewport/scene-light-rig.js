// @ts-check
// SCR-06 light actors: visible fixture frames, live Three lights and a move/rotate gizmo.
import { hexOf, sampleLight } from './scene-lighting.js';
/** @typedef {import('./scene-lighting.js').Lighting} Lighting */
/** @typedef {import('./scene-lighting.js').LightActor} LightActor */
/** @typedef {import('./scene-lighting.js').LightKey} LightKey */

/** @param {any} THREE @param {string} kind */
function fixtureGeometry(THREE, kind) {
  const points = /** @type {number[]} */ ([]);
  const line = (/** @type {number[]} */ a, /** @type {number[]} */ b) => points.push(...a, ...b);
  if (kind === 'point') {
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6, b = ((i + 1) * Math.PI) / 6;
      line([Math.cos(a) * .23, Math.sin(a) * .23, 0], [Math.cos(b) * .23, Math.sin(b) * .23, 0]);
      if (i % 2 === 0) line([Math.cos(a) * .29, Math.sin(a) * .29, 0], [Math.cos(a) * .48, Math.sin(a) * .48, 0]);
    }
  } else {
    const corners = [[-.3, -.2, 0], [.3, -.2, 0], [.3, .2, 0], [-.3, .2, 0]];
    for (let i = 0; i < 4; i++) line(corners[i], corners[(i + 1) % 4]);
    line([-.25, 0, 0], [.25, 0, 0]);
    line([0, -.15, 0], [0, .15, 0]);
    line([0, 0, 0], [0, 0, -.65]);
    line([0, 0, -.65], [-.1, .08, -.5]);
    line([0, 0, -.65], [.1, .08, -.5]);
    if (kind === 'spot') for (const corner of corners) line(corner, [corner[0] * 1.7, corner[1] * 1.7, -.7]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/** @param {any} THREE @param {string} label @param {string} color */
function labelSprite(THREE, label, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#07121f'; g.fillRect(2, 2, 252, 60);
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#ffffff'; g.font = 'bold 28px sans-serif'; g.textBaseline = 'middle';
    g.fillText(`LIGHT  ${label.slice(0, 8)}`, 12, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }));
  sprite.scale.set(1.15, .29, 1); sprite.position.set(0, .43, 0);
  return sprite;
}

/**
 * @param {any} host
 * @param {any} THREE
 * @param {any} TransformControls
 * @param {(id: string, pose: {position: [number,number,number], rotation: [number,number,number]}) => void} onMoveEnd
 * @param {(id: string) => void} onSelect
 */
export function createSceneLightRig(host, THREE, TransformControls, onMoveEnd, onSelect) {
  const entries = /** @type {Map<string, {frame:any, lamp:any, target:any, hit:any, label:any, lines:any, type:string, labelKey:string}>} */ (new Map());
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const forward = new THREE.Vector3();
  const transform = new TransformControls(host.camera, host.renderer.domElement);
  transform.setMode('translate'); transform.setSize(.75);
  host.scene.add(transform);
  let selected = '', moving = false, changed = false, visible = true;

  /** @param {LightActor} actor */
  function add(actor) {
    const color = hexOf(actor.keys[0].rgb);
    const frame = new THREE.Group(); frame.name = `LIGHT ${actor.name}`;
    const lines = new THREE.LineSegments(fixtureGeometry(THREE, actor.type), new THREE.LineBasicMaterial({ color, depthTest: false, toneMapped: false }));
    lines.renderOrder = 1000;
    const label = labelSprite(THREE, actor.name, color); label.renderOrder = 1001;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    frame.add(lines, label, hit);
    host.scene.add(frame);
    const lamp = actor.type === 'point' ? new THREE.PointLight(color, 1) : actor.type === 'spot'
      ? new THREE.SpotLight(color, 1) : new THREE.DirectionalLight(color, 1);
    const target = actor.type === 'point' ? null : new THREE.Object3D();
    host.scene.add(lamp);
    if (target) { host.scene.add(target); lamp.target = target; }
    entries.set(actor.id, { frame, lamp, target, hit, label, lines, type: actor.type, labelKey: `${actor.name}|${color}` });
  }

  /** @param {string} id */
  function drop(id) {
    const e = entries.get(id); if (!e) return;
    if (selected === id) { transform.detach(); selected = ''; }
    host.scene.remove(e.frame, e.lamp);
    if (e.target) host.scene.remove(e.target);
    e.frame.traverse((/** @type {any} */ child) => {
      child.geometry?.dispose?.();
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    });
    entries.delete(id);
  }

  /** @param {string} id */
  function updateLamp(id) {
    const e = entries.get(id); if (!e) return;
    e.lamp.position.copy(e.frame.position);
    if (e.target) {
      forward.set(0, 0, -1).applyEuler(e.frame.rotation).normalize();
      e.target.position.copy(e.frame.position).addScaledVector(forward, 10);
      e.target.updateMatrixWorld();
    }
  }

  /** @param {Lighting} lights @param {number} frame */
  function sync(lights, frame) {
    const ids = new Set(lights.items.map((item) => item.id));
    for (const id of [...entries.keys()]) if (!ids.has(id)) drop(id);
    for (const actor of lights.items) {
      if (entries.get(actor.id)?.type !== actor.type) drop(actor.id);
      if (!entries.has(actor.id)) add(actor);
      const e = /** @type {NonNullable<ReturnType<typeof entries.get>>} */ (entries.get(actor.id));
      const state = sampleLight(actor, frame);
      if (!(moving && actor.id === selected)) {
        e.frame.position.set(...state.position);
        e.frame.rotation.set(...state.rotation.map((d) => d * Math.PI / 180));
      }
      const color = hexOf(state.rgb);
      e.lamp.color.set(color); e.lamp.intensity = state.enabled ? state.intensity : 0;
      if (e.type === 'spot') {
        e.lamp.distance = state.distance;
        e.lamp.angle = state.angle * Math.PI / 180;
        e.lamp.penumbra = state.penumbra;
      } else if (e.type === 'point') e.lamp.distance = state.distance;
      e.frame.visible = visible;
      e.lines.material.color.set(color);
      const labelKey = `${actor.name}|${color}`;
      if (e.labelKey !== labelKey) {
        e.label.material.map?.dispose?.();
        e.frame.remove(e.label);
        e.label.material.dispose();
        e.label = labelSprite(THREE, actor.name, color); e.label.renderOrder = 1001; e.frame.add(e.label);
        e.labelKey = labelKey;
      }
      updateLamp(actor.id);
    }
    if (selected && !entries.has(selected)) selected = '';
    transform.visible = visible && !!selected;
    host.invalidate();
  }

  /** @param {string} id */
  function select(id) {
    selected = entries.has(id) ? id : '';
    transform.detach();
    if (selected && visible) transform.attach(entries.get(selected)?.frame);
    transform.visible = visible && !!selected;
    host.invalidate();
  }
  /** @param {'translate'|'rotate'} mode */
  function setMode(mode) { transform.setMode(mode); host.invalidate(); }
  /** @param {boolean} show */
  function setVisible(show) { visible = show; for (const e of entries.values()) e.frame.visible = show; transform.visible = show && !!selected; host.invalidate(); }

  const onDrag = (/** @type {any} */ event) => { moving = !!event.value; if (!moving && changed && selected) {
    changed = false; const frame = entries.get(selected)?.frame;
    if (frame) onMoveEnd(selected, {
      position: /** @type {[number,number,number]} */ (frame.position.toArray()),
      rotation: /** @type {[number,number,number]} */ ([frame.rotation.x, frame.rotation.y, frame.rotation.z].map((r) => r * 180 / Math.PI)),
    });
  } host.controls.enabled = !moving; host.invalidate(); };
  const onObject = () => { if (selected) { changed = true; updateLamp(selected); host.invalidate(); } };
  const onChange = () => host.invalidate();
  transform.addEventListener('dragging-changed', onDrag);
  transform.addEventListener('objectChange', onObject);
  transform.addEventListener('change', onChange);

  const onPointer = (/** @type {PointerEvent} */ event) => {
    if (event.button !== 0 || transform.dragging || !visible) return;
    const rect = host.renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, host.camera);
    const objects = [...entries.values()].map((e) => e.hit);
    const hit = ray.intersectObjects(objects, false)[0];
    if (!hit) return;
    const id = [...entries].find(([, e]) => e.hit === hit.object)?.[0];
    if (id && id !== selected) onSelect(id);
  };
  host.renderer.domElement.addEventListener('pointerdown', onPointer);

  return {
    sync, select, setMode, setVisible,
    /** @param {any} camera */
    setCamera(camera) { transform.camera = camera; host.invalidate(); },
    getState: () => ({ count: entries.size, selected, visible, moving,
      items: [...entries].map(([id, e]) => ({ id, type: e.type, position: e.frame.position.toArray(), intensity: e.lamp.intensity, rgb: e.lamp.color.getHexString() })) }),
    dispose() {
      host.renderer.domElement.removeEventListener('pointerdown', onPointer);
      transform.removeEventListener('dragging-changed', onDrag);
      transform.removeEventListener('objectChange', onObject);
      transform.removeEventListener('change', onChange);
      transform.detach(); host.scene.remove(transform); transform.dispose();
      for (const id of [...entries.keys()]) drop(id);
    },
  };
}
