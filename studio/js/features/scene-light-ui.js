// @ts-check
// SCR-06: scene outliner, per-light inspector and lighting timeline.
import { h, section } from '../ui.js';
import { assets, project } from '../store.js';
import { lightFrame, lightsOf, saveLights, sceneUi, stageOf } from './scene-view.js';
import { defaultLighting, hexOf, newLight, putLightKey, removeLight, removeLightKey, sampleLight } from '../viewport/scene-lighting.js';
/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @typedef {import('../viewport/scene-lighting.js').Lighting} Lighting */
/** @typedef {import('../viewport/scene-lighting.js').LightKey} LightKey */

/** @param {number} value @param {number} low @param {number} high */
const clampNumber = (value, low, high) => Math.max(low, Math.min(high, value));
/** @param {string} id */
const chooseLight = (id) => {
  sceneUi.set({ selectedLightId: id }, 'light-select');
  /** @type {HTMLElement|null} */ (document.querySelector('.pane-right [role="tab"][data-tab="light"]'))?.click();
};
const snapshot = () => {
  const lighting = lightsOf(project.get());
  const selected = lighting?.items.find((x) => x.id === sceneUi.get().selectedLightId) || null;
  return { lighting, selected, frame: lightFrame() };
};
/** @param {Partial<LightKey>} patch */
function editKey(patch) {
  const { lighting, selected, frame } = snapshot();
  if (lighting && selected && frame <= lighting.duration) saveLights(putLightKey(lighting, selected.id, frame, patch));
}
/** @param {(value: Lighting, id: string) => void} edit */
function editActor(edit) {
  const { lighting, selected } = snapshot();
  if (!lighting || !selected) return;
  const next = structuredClone(lighting);
  edit(next, selected.id);
  saveLights(next);
}

/** @param {FeatureCtx} ctx */
export function sceneObjects(ctx) {
  const root = h('div', { class: 'scene-objects', dataset: { feature: 'sceneObjects' } });
  const summary = h('p', { class: 'section-note' });
  const list = h('div', { class: 'scene-object-list', role: 'list', tabindex: '0', 'aria-label': 'シーンの物体' });
  const type = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '追加するライトの種類', dataset: { role: 'light-add-type' } },
    h('option', { value: 'directional' }, '方向光'), h('option', { value: 'spot' }, 'スポット光'), h('option', { value: 'point' }, '点光')));
  const add = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'light-add' } }, 'ライトを追加'));
  add.addEventListener('click', () => {
    const { lighting } = snapshot();
    if (!lighting || lighting.items.length >= 128) return;
    const actor = newLight(lighting, /** @type {'directional'|'spot'|'point'} */ (type.value));
    saveLights({ ...lighting, items: [...lighting.items, actor] });
    chooseLight(actor.id);
  });
  root.append(summary, list, h('div', { class: 'light-add-row' }, type, add),
    h('p', { class: 'section-note' }, 'ライトを選ぶと、右側で色・明るさ・位置を編集できます。'));
  const draw = () => {
    const { lighting, selected, frame } = snapshot();
    const ps = project.get(), st = stageOf(ps);
    add.disabled = ps.status !== 'ready' || !lighting || lighting.items.length >= 128;
    type.disabled = add.disabled;
    summary.textContent = lighting ? `ステージ 1・ライト ${lighting.items.length}・F ${frame}` : 'ライト保存データを読めません';
    const stageName = st ? assets.get().items.find((x) => x.id === st.asset)?.name || st.asset : 'なし';
    const charName = ps.bundle?.workspace?.asset || 'なし';
    const rows = [
      h('div', { class: 'scene-object-row static' }, h('span', { class: 'object-symbol' }, '▣'), h('span', null, `ステージ　${stageName}`)),
      h('div', { class: 'scene-object-row static' }, h('span', { class: 'object-symbol' }, '♟'), h('span', null, `キャラクター　${charName}`)),
    ];
    for (const actor of lighting?.items || []) {
      const key = sampleLight(actor, frame);
      const button = h('button', { class: `scene-object-row light-object ${selected?.id === actor.id ? 'selected' : ''}`,
        type: 'button', dataset: { lightId: actor.id }, 'aria-pressed': String(selected?.id === actor.id),
        title: `${actor.name}を選択して位置・回転・RGB・キーを編集`, onclick: () => chooseLight(actor.id) },
      h('span', { class: 'object-symbol light', style: { '--light-color': hexOf(key.rgb) } }, actor.type === 'point' ? '✳' : '▱'),
      h('span', { class: 'object-name' }, actor.name), h('span', { class: 'object-kind' }, actor.type === 'spot' ? 'スポット' : actor.type === 'point' ? '点' : '方向'));
      rows.push(button);
    }
    list.replaceChildren(...rows);
  };
  ctx.onCleanup(project.subscribe(draw)); ctx.onCleanup(sceneUi.subscribe(draw)); ctx.onCleanup(assets.subscribe(draw));
  draw();
  return root;
}

/** @param {FeatureCtx} ctx */
export function sceneLightTools(ctx) {
  const root = h('div', { class: 'light-tools', dataset: { feature: 'sceneLightTools' } });
  const move = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-move' }, title: '選択ライトを3Dビューで移動', onclick: () => sceneUi.set({ lightMode: 'translate' }, 'light-mode') }, '移動');
  const rotate = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-rotate' }, title: '選択ライトを3Dビューで回転', onclick: () => sceneUi.set({ lightMode: 'rotate' }, 'light-mode') }, '回転');
  const frames = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-frames' }, title: 'ライトの枠と移動・回転ギズモを表示/非表示', onclick: () => sceneUi.set({ showLightFrames: !sceneUi.get().showLightFrames }, 'light-frames') }, 'ライト枠');
  root.append(move, rotate, frames);
  const draw = () => {
    move.setAttribute('aria-pressed', String(sceneUi.get().lightMode === 'translate'));
    rotate.setAttribute('aria-pressed', String(sceneUi.get().lightMode === 'rotate'));
    frames.setAttribute('aria-pressed', String(sceneUi.get().showLightFrames));
  };
  ctx.onCleanup(sceneUi.subscribe(draw)); draw();
  return root;
}

/** @param {string} label @param {string} role @param {number} min @param {number} max @param {number} step @param {string} [unit] */
function numberControl(label, role, min, max, step, unit = '') {
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min, max, step, dataset: { lightField: role }, 'aria-label': label }));
  return { input, root: h('label', { class: 'light-number' }, h('span', null, label), input, unit && h('small', null, unit)) };
}
/** @param {HTMLInputElement} input @param {number} value */
const showNumber = (input, value) => { if (document.activeElement !== input) input.value = String(Math.round(value * 1000) / 1000); };

/** @param {FeatureCtx} ctx */
export function lightEditor(ctx) {
  const root = h('div', { class: 'light-editor', dataset: { feature: 'lightEditor' } });
  const title = h('h3', { class: 'light-editor-title' }, 'ライトを選択');
  const status = h('p', { class: 'section-note', dataset: { role: 'light-key-state' }, role: 'status' });
  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', maxlength: 80, 'aria-label': 'ライト名', dataset: { lightField: 'name' } }));
  const kind = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'ライトの種類', dataset: { lightField: 'type' } },
    h('option', { value: 'directional' }, '方向光'), h('option', { value: 'spot' }, 'スポット光'), h('option', { value: 'point' }, '点光')));
  const enabled = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', dataset: { lightField: 'enabled' }, 'aria-label': 'このライトを点灯' }));
  const position = ['X', 'Y', 'Z'].map((axis, i) => numberControl(`位置 ${axis}`, `position-${i}`, -1000, 1000, .1, 'm'));
  const rotation = ['X', 'Y', 'Z'].map((axis, i) => numberControl(`回転 ${axis}`, `rotation-${i}`, -360, 360, 1, '°'));
  const rgb = ['R', 'G', 'B'].map((axis, i) => numberControl(axis, `rgb-${i}`, 0, 255, 1));
  const color = /** @type {HTMLInputElement} */ (h('input', { type: 'color', 'aria-label': 'ライトの色', dataset: { lightField: 'color' } }));
  const intensity = numberControl('明るさ', 'intensity', 0, 2000, .1);
  const distance = numberControl('到達距離', 'distance', 0, 1000, .1, 'm');
  const angle = numberControl('照射角', 'angle', 1, 89, 1, '°');
  const penumbra = numberControl('ぼかし', 'penumbra', 0, 1, .05);
  const addKey = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-key-add' }, onclick: () => editKey({}) }, '現在Fにキーを打つ');
  const removeKey = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-key-remove' }, onclick: () => {
    const { lighting, selected, frame } = snapshot();
    if (lighting && selected && frame > 0) saveLights(removeLightKey(lighting, selected.id, frame));
  } }, 'このFのキーを外す');
  const duplicate = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-duplicate' }, onclick: () => {
    const { lighting, selected } = snapshot(); if (!lighting || !selected || lighting.items.length >= 128) return;
    const actor = { ...newLight(lighting, selected.type), name: `${selected.name} コピー`, keys: structuredClone(selected.keys) };
    saveLights({ ...lighting, items: [...lighting.items, actor] }); chooseLight(actor.id);
  } }, '複製');
  const remove = h('button', { class: 'btn', type: 'button', dataset: { role: 'light-remove' }, onclick: () => {
    const { lighting, selected } = snapshot(); if (!lighting || !selected) return;
    if (!window.confirm(`「${selected.name}」をシーンから外しますか？保存前なら再読込で戻せます。`)) return;
    const next = removeLight(lighting, selected.id);
    saveLights(next); sceneUi.set({ selectedLightId: next.items[0]?.id || '' }, 'light-select');
  } }, 'ライトを外す');

  const general = section('選択したライト', 'real', h('label', { class: 'field stack' }, '名前', name), h('label', { class: 'field stack' }, '種類', kind), h('label', { class: 'light-check' }, enabled, ' 点灯'));
  const transform = section('位置と向き', 'real', h('p', { class: 'section-note' }, '数値を変えると現在フレームにキーを記録します。3Dビューの移動・回転も同じキーを更新します。'),
    h('div', { class: 'light-field-grid' }, ...position.map((x) => x.root)), h('div', { class: 'light-field-grid' }, ...rotation.map((x) => x.root)));
  const lighting = section('色と光量', 'real', h('div', { class: 'light-color-row' }, color, h('div', { class: 'light-field-grid rgb' }, ...rgb.map((x) => x.root))),
    intensity.root, distance.root, angle.root, penumbra.root);
  root.append(title, status, general, transform, lighting, section('キー', 'real', h('div', { class: 'btn-row' }, addKey, removeKey), h('div', { class: 'btn-row' }, duplicate, remove)));

  name.addEventListener('change', () => editActor((value, id) => { const item = value.items.find((x) => x.id === id); if (item && name.value.trim()) item.name = name.value.trim().slice(0, 80); }));
  kind.addEventListener('change', () => editActor((value, id) => { const item = value.items.find((x) => x.id === id); if (item) item.type = /** @type {'directional'|'spot'|'point'} */ (kind.value); }));
  enabled.addEventListener('change', () => editKey({ enabled: enabled.checked }));
  for (const [field, controls, low, high] of /** @type {const} */ ([['position', position, -1000, 1000], ['rotation', rotation, -360, 360], ['rgb', rgb, 0, 255]])) {
    controls.forEach(({ input }, axis) => input.addEventListener('change', () => {
      const { selected, frame } = snapshot(); if (!selected) return;
      const sampled = sampleLight(selected, frame);
      const next = /** @type {[number,number,number]} */ ([...sampled[field]]);
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      next[axis] = field === 'rgb' ? Math.round(clampNumber(v, low, high)) : clampNumber(v, low, high);
      editKey({ [field]: next });
    }));
  }
  color.addEventListener('input', () => {
    const h = color.value;
    editKey({ rgb: /** @type {[number,number,number]} */ ([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))) });
  });
  for (const [field, control, low, high] of /** @type {const} */ ([['intensity', intensity, 0, 2000], ['distance', distance, 0, 1000], ['angle', angle, 1, 89], ['penumbra', penumbra, 0, 1]])) {
    control.input.addEventListener('change', () => {
      const n = Number(control.input.value);
      if (Number.isFinite(n)) editKey({ [field]: clampNumber(n, low, high) });
    });
  }

  const allControls = [name, kind, enabled, color, ...position.map((x) => x.input), ...rotation.map((x) => x.input), ...rgb.map((x) => x.input), intensity.input, distance.input, angle.input, penumbra.input];
  const draw = () => {
    const { lighting: state, selected, frame } = snapshot();
    const can = !!selected && project.get().status === 'ready' && !!state;
    for (const input of allControls) input.disabled = !can;
    for (const button of [duplicate, remove, addKey, removeKey]) /** @type {HTMLButtonElement} */ (button).disabled = !can;
    if (!selected || !state) {
      title.textContent = state ? '左の一覧からライトを選択' : 'ライト保存データを読めません';
      status.textContent = state ? `ライト ${state.items.length}灯。左で追加できます。` : '元のデータを保持します。形式を確認してください。';
      return;
    }
    const key = sampleLight(selected, frame);
    const exact = selected.keys.some((x) => x.frame === frame);
    title.textContent = `${selected.name} · F ${frame}`;
    status.textContent = exact ? '● 現在フレームにキーがあります' : '○ キー間の値を表示中。変更すると現在フレームにキーを打ちます。';
    if (document.activeElement !== name) name.value = selected.name;
    kind.value = selected.type; enabled.checked = key.enabled;
    position.forEach((x, i) => showNumber(x.input, key.position[i]));
    rotation.forEach((x, i) => { showNumber(x.input, key.rotation[i]); x.input.disabled = !can || selected.type === 'point'; });
    rgb.forEach((x, i) => showNumber(x.input, key.rgb[i]));
    if (document.activeElement !== color) color.value = hexOf(key.rgb);
    showNumber(intensity.input, key.intensity); showNumber(distance.input, key.distance);
    showNumber(angle.input, key.angle); showNumber(penumbra.input, key.penumbra);
    distance.root.hidden = selected.type === 'directional';
    angle.root.hidden = penumbra.root.hidden = selected.type !== 'spot';
    /** @type {HTMLButtonElement} */ (removeKey).disabled = !can || frame === 0 || !exact;
    /** @type {HTMLButtonElement} */ (addKey).disabled = !can || exact;
  };
  ctx.onCleanup(project.subscribe(draw)); ctx.onCleanup(sceneUi.subscribe(draw)); draw();
  return root;
}

/** @param {FeatureCtx} ctx */
export function lightTimeline(ctx) {
  const root = h('div', { class: 'light-timeline', dataset: { feature: 'lightTimeline' } });
  const play = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'light-play' }, title: 'ライトのキーを30fpsでプレビュー' }, '▶ 再生'));
  const prev = h('button', { class: 'btn', type: 'button', title: '1フレーム戻す', dataset: { role: 'light-prev' } }, '−1F');
  const next = h('button', { class: 'btn', type: 'button', title: '1フレーム進める', dataset: { role: 'light-next' } }, '+1F');
  const frame = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 0, max: 1000000, step: 1, 'aria-label': 'ライトの現在フレーム', dataset: { role: 'light-frame' } }));
  const duration = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min: 1, max: 1000000, step: 1, 'aria-label': '照明シーンの長さ フレーム', dataset: { role: 'light-duration' } }));
  const time = h('span', { class: 'light-time' });
  const windowLabel = h('span', { class: 'light-time', dataset: { role: 'light-window-label' } });
  const windowSize = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'キー表示範囲', dataset: { role: 'light-window-size' } },
    h('option', { value: '300' }, '10秒'), h('option', { value: '900' }, '30秒'), h('option', { value: '0' }, '全体')));
  const priorWindow = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', 'aria-label': 'キー表示範囲を前へ' }, '◀'));
  const nextWindow = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', 'aria-label': 'キー表示範囲を次へ' }, '▶'));
  const scrub = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 9000, step: 1, value: 0, 'aria-label': '照明の再生位置', dataset: { role: 'light-scrub' } }));
  const rows = h('div', { class: 'light-timeline-rows', role: 'list', tabindex: '0', 'aria-label': 'ライトごとのキー' });
  root.append(h('div', { class: 'light-transport' }, play, prev, next, h('label', null, '現在 F', frame), time, h('span', { class: 'spacer' }), h('label', null, 'シーン長 F', duration)),
    scrub, h('div', { class: 'light-window-bar' }, h('span', null, 'キー表示'), windowSize, priorWindow, nextWindow, windowLabel), rows);
  let raf = 0, started = 0, from = 0, windowStart = 0;
  const spanOf = (/** @type {Lighting} */ state) => Number(windowSize.value) || state.duration;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; play.textContent = '▶ 再生'; play.setAttribute('aria-label', '再生'); };
  const seek = (/** @type {number} */ value) => {
    const state = lightsOf(project.get()); if (!state) return;
    sceneUi.set({ lightFrame: Math.round(clampNumber(value, 0, state.duration)) }, 'light-frame');
  };
  const tick = (/** @type {number} */ now) => {
    const state = lightsOf(project.get()); if (!state) return stop();
    const nextFrame = from + Math.floor((now - started) * 30 / 1000);
    if (nextFrame >= state.duration) { seek(state.duration); stop(); return; }
    if (nextFrame !== lightFrame()) seek(nextFrame);
    raf = requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => {
    if (raf) return stop();
    const state = lightsOf(project.get()); if (!state) return;
    from = lightFrame() >= state.duration ? 0 : lightFrame();
    started = performance.now(); play.textContent = '❚❚ 停止'; play.setAttribute('aria-label', '停止');
    raf = requestAnimationFrame(tick);
  });
  prev.addEventListener('click', () => seek(lightFrame() - 1)); next.addEventListener('click', () => seek(lightFrame() + 1));
  frame.addEventListener('change', () => seek(Number(frame.value)));
  scrub.addEventListener('input', () => seek(Number(scrub.value)));
  duration.addEventListener('change', () => {
    const state = lightsOf(project.get()); if (!state) return;
    const last = Math.max(1, ...state.items.flatMap((actor) => actor.keys.map((key) => key.frame)));
    const value = Math.round(clampNumber(Number(duration.value) || state.duration, last, 1000000));
    saveLights({ ...state, duration: value }); if (lightFrame() > value) seek(value);
  });
  windowSize.addEventListener('change', () => { const state = lightsOf(project.get()); if (state) { const span = spanOf(state); windowStart = Math.floor(lightFrame() / span) * span; draw(); } });
  priorWindow.addEventListener('click', () => { const state = lightsOf(project.get()); if (state) { windowStart = Math.max(0, windowStart - spanOf(state)); draw(); } });
  nextWindow.addEventListener('click', () => { const state = lightsOf(project.get()); if (state) { windowStart = Math.min(Math.max(0, state.duration - spanOf(state)), windowStart + spanOf(state)); draw(); } });
  const draw = () => {
    const state = lightsOf(project.get()), f = lightFrame();
    if (!state) { rows.textContent = 'ライト保存データを読めません'; return; }
    scrub.max = String(state.duration); scrub.value = String(Math.min(f, state.duration));
    if (document.activeElement !== frame) frame.value = String(f);
    if (document.activeElement !== duration) duration.value = String(state.duration);
    time.textContent = `${(f / 30).toFixed(2)} 秒 / ${(state.duration / 30).toFixed(2)} 秒`;
    const span = spanOf(state);
    if (f < windowStart || f > windowStart + span) windowStart = Math.floor(f / span) * span;
    windowStart = Math.min(windowStart, Math.max(0, state.duration - span));
    const windowEnd = Math.min(state.duration, windowStart + span);
    windowLabel.textContent = `F ${windowStart}–${windowEnd}`;
    priorWindow.disabled = windowStart === 0;
    nextWindow.disabled = windowEnd >= state.duration;
    const children = state.items.map((actor) => {
      const track = h('div', { class: 'light-timeline-track' }, h('i', { class: 'light-playhead', style: { left: `${(f - windowStart) / span * 100}%` } }));
      for (const key of actor.keys.filter((key) => key.frame >= windowStart && key.frame <= windowEnd)) track.append(h('button', { type: 'button', class: `light-key-dot ${sceneUi.get().selectedLightId === actor.id ? 'active' : ''}`,
        style: { left: `${(key.frame - windowStart) / span * 100}%` }, title: `${actor.name} · F ${key.frame}`, 'aria-label': `${actor.name} の F ${key.frame} キー`,
        onclick: () => { chooseLight(actor.id); seek(key.frame); } }, '◆'));
      return h('div', { class: 'light-timeline-row', role: 'listitem' },
        h('button', { class: 'light-timeline-name', type: 'button', onclick: () => chooseLight(actor.id) }, actor.name), track);
    });
    rows.replaceChildren(...children);
  };
  ctx.onCleanup(project.subscribe(draw)); ctx.onCleanup(sceneUi.subscribe(draw)); ctx.onCleanup(stop); draw();
  return root;
}
