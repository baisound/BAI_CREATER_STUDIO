// @ts-check
// WP05e：SCR-13［編集］のタイムラインと非破壊の補正レイヤー。
import { h, nextId, openModal } from '../ui.js';
import { assets, project } from '../store.js';
import { safeTimelineClip, timelineEnd } from '../motion/chain.fork.js';
import { safeLayer } from '../motion/layers.fork.js';
import { createTimelineSync } from '../motion/timeline-sync.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */
/** @type {{getState:()=>any}|null} */ let current = null;
export const currentTimeline = () => current;

/** @param {FeatureCtx} ctx */
export const motionTimeline = (ctx) => {
  const root = h('div', { class: 'motion-timeline', dataset: { feature: 'motionTimeline' } });
  if (ctx.params.get('mode') !== 'edit') {
    root.append(h('p', { class: 'section-note' }, 'タイムラインの編集は［編集］モードで行います。'),
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.navigate('13', { replace: true, tab: ctx.params.get('tab'), query: { ...Object.fromEntries(ctx.params), mode: 'edit' } }) }, '編集モードへ'));
    return root;
  }

  const timeline = createTimelineSync({ path: '/api/timeline-editor', field: 'clips', delayMs: 550, normalize: safeTimelineClip });
  const layers = createTimelineSync({ path: '/api/motion-layers', field: 'layers', delayMs: 500, normalize: safeLayer });
  let frame = 0, selectedLayer = 0, notice = '', layerNotice = '';
  let clipSignature = '', layerSignature = '';

  const fromChain = h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-from-chain' }, title: '編集中のコンビネーションからクリップを読み込みます' }, 'コンビネーションから取り込む');
  const add = h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-add' } }, '＋ クリップ追加');
  const play = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-play' }, disabled: true, title: 'FBX再生の結線後に利用できます' }, '▶ タイムライン再生'));
  const stop = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-stop' }, disabled: true }, '■ 停止'));
  const seek = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '0', max: '1', step: '1', value: '0', 'aria-label': 'タイムラインの再生位置', dataset: { role: 'tls-seek' } }));
  const frameText = h('span', { class: 'mono xs', dataset: { role: 'tls-frame' } }, '0F / 1F');
  const save = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-save' } }, '保存'));
  const reload = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-reload' } }, '復元'));
  const status = h('p', { class: 'section-note', role: 'status', dataset: { role: 'tls-status' } }, '保存データを読み込み中…');
  const conflictActions = h('div', { class: 'btn-row tls-conflict', dataset: { role: 'tls-conflict' } },
    h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-discard' } }, '再読込して変更を破棄'),
    h('button', { class: 'btn', type: 'button', dataset: { role: 'tls-overwrite' } }, 'この画面の内容で上書き保存'));
  conflictActions.hidden = true;
  const ruler = h('div', { class: 'tls-ruler', 'aria-label': 'クリップの配置図', dataset: { role: 'tls-ruler' } });
  const rows = h('div', { class: 'tls-items', dataset: { role: 'tls-items' } });

  const layerAdd = h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-add' } }, '＋ レイヤー');
  const layerKey = h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-key' } }, '◆ キー追加');
  const layerSave = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-save' } }, '保存'));
  const layerReload = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-reload' } }, '復元'));
  const layerStatus = h('p', { class: 'section-note', role: 'status', dataset: { role: 'ml-status' } }, '保存データを読み込み中…');
  const layerConflict = h('div', { class: 'btn-row tls-conflict', dataset: { role: 'ml-conflict' } },
    h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-discard' } }, '再読込して変更を破棄'),
    h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-overwrite' } }, 'この画面の内容で上書き保存'));
  layerConflict.hidden = true;
  const layerRows = h('div', { class: 'ml-rows', dataset: { role: 'ml-rows' } });

  root.append(
    h('div', { class: 'tls-toolbar' }, fromChain, add, play, stop,
      h('label', null, '再生位置 ', seek), frameText, save, reload),
    h('p', { class: 'xs muted' }, '開始フレーム・長さ・速度・補間フレームを編集します。元の FBX/VMD は変更しません。'),
    ruler, rows, status, conflictActions,
    h('details', { class: 'motion-layers' }, h('summary', null, '非破壊モーション補正レイヤー'),
      h('div', { class: 'btn-row' }, layerAdd, layerKey, layerSave, layerReload),
      h('p', { class: 'xs muted' }, 'ボーンの回転補正を別の JSON に保存します。元モデルとモーションは変更しません。'),
      layerRows, layerStatus, layerConflict),
    h('details', { class: 'tls-sample' }, h('summary', null, 'サンプルのトラック表示'),
      h('p', { class: 'xs muted' }, '以下は画面構成の見本です。保存・再生には使いません。'),
      h('div', { class: 'tls-sample-tracks' }, ...['センター', '上半身', '左足IK', '右足IK', '表情・リップ', 'ダンサー別', '接触イベント'].map((label) => h('span', null, label)))));

  /** @param {any[]} values */
  const editClips = (values) => { notice = ''; timeline.edit(values); };
  /** @param {any[]} values */
  const editLayers = (values) => { layerNotice = ''; layers.edit(values); };
  function drawClips() {
    const clips = timeline.state().items;
    const end = Math.max(90, timelineEnd(clips));
    rows.replaceChildren(); ruler.replaceChildren();
    clips.forEach((c, i) => {
      const row = h('div', { class: 'tls-item', dataset: { role: 'tls-item', index: String(i) } }, h('strong', null, `${i + 1}. ${c.name}`));
      for (const [key, label, min, max, step] of /** @type {const} */ ([['start', '開始F', 0, 1000000, 1], ['duration', '長さF', 1, 100000, 1], ['speed', '速度', .1, 4, .1], ['blend', '補間F', 0, 120, 1]])) {
        const input = /** @type {HTMLInputElement} */ (h('input', { type: 'number', min, max, step, value: c[key], title: `${label}を編集`, dataset: { field: key } }));
        input.onchange = () => {
          const n = Number(input.value);
          if (!Number.isFinite(n) || n < min || n > max) { input.value = String(c[key]); return; }
          const next = timeline.state().items;
          next[i][key] = step === 1 ? Math.round(n) : n;
          editClips(next);
        };
        row.append(h('label', null, label, input));
      }
      row.append(h('button', { class: 'btn', type: 'button', title: 'このクリップだけを外します。元素材は削除しません', dataset: { role: 'tls-delete' }, onclick: () => { const next = timeline.state().items; next.splice(i, 1); editClips(next); } }, '削除'));
      rows.append(row);
      const bar = h('button', { class: 'tls-bar', type: 'button', title: `${c.name} / ${c.start}F〜${c.start + c.duration}F`, style: { left: `${c.start / end * 100}%`, width: `${c.duration / end * 100}%` }, onclick: () => row.scrollIntoView({ block: 'nearest' }) }, `${i + 1}. ${c.name}`);
      ruler.append(bar);
    });
    if (!clips.length) rows.append(h('p', { class: 'section-note' }, 'クリップがありません。「コンビネーションから取り込む」または「＋ クリップ追加」を選択してください。'));
  }
  function renderTimeline() {
    const st = timeline.state();
    const sig = JSON.stringify(st.items);
    if (sig !== clipSignature) { clipSignature = sig; drawClips(); }
    const end = timelineEnd(st.items);
    frame = Math.min(frame, end);
    seek.max = String(end); seek.value = String(frame);
    frameText.textContent = `${Math.floor(frame)}F / ${end}F`;
    status.textContent = notice || st.status;
    save.disabled = !st.loaded || !st.dirty || st.saving || st.conflict;
    reload.disabled = !st.loaded || st.saving;
    fromChain.toggleAttribute('disabled', !st.loaded);
    add.toggleAttribute('disabled', !st.loaded);
    conflictActions.hidden = !st.conflict;
  }

  function drawLayers() {
    const values = layers.state().items;
    layerRows.replaceChildren();
    values.forEach((l, i) => {
      const row = h('div', { class: 'ml-row', dataset: { role: 'ml-row', index: String(i) } });
      const select = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: 'motion-layer-selection', checked: i === selectedLayer, 'aria-label': `${i + 1}番目のレイヤーを選択` }));
      select.onchange = () => { selectedLayer = i; drawLayers(); };
      const enabled = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: l.enabled, title: 'このレイヤーの有効・無効' }));
      enabled.onchange = () => { const next = layers.state().items; next[i].enabled = enabled.checked; editLayers(next); };
      row.append(h('div', { class: 'ml-fields' }, select, enabled));
      for (const [key, label] of /** @type {const} */ ([['name', '名前'], ['bone', 'ボーン名']])) {
        const input = /** @type {HTMLInputElement} */ (h('input', { value: l[key], maxLength: key === 'name' ? 100 : 120, title: label }));
        input.onchange = () => { const next = layers.state().items; next[i][key] = input.value; editLayers(next); };
        row.append(h('label', null, label, input));
      }
      row.append(h('button', { class: 'btn', type: 'button', dataset: { role: 'ml-delete' }, onclick: () => { const next = layers.state().items; next.splice(i, 1); selectedLayer = Math.max(0, Math.min(selectedLayer, next.length - 1)); editLayers(next); } }, '削除'));
      l.keys.forEach((/** @type {any} */ keyframe, /** @type {number} */ j) => {
        const keyRow = h('div', { class: 'ml-fields', dataset: { role: 'ml-key', frame: String(keyframe.frame) } });
        for (const [key, label, min, max] of /** @type {const} */ ([['frame', 'フレーム', 0, 1000000], ['x', 'X°', -180, 180], ['y', 'Y°', -180, 180], ['z', 'Z°', -180, 180]])) {
          const input = /** @type {HTMLInputElement} */ (h('input', { type: 'number', step: '1', min, max, value: keyframe[key], title: label, dataset: { field: key } }));
          input.onchange = () => {
            const n = Number(input.value);
            if (!Number.isFinite(n) || n < min || n > max) { input.value = String(keyframe[key]); return; }
            const next = layers.state().items;
            next[i].keys[j][key] = key === 'frame' ? Math.round(n) : n;
            next[i].keys.sort((/** @type {any} */ a, /** @type {any} */ b) => a.frame - b.frame);
            editLayers(next);
          };
          keyRow.append(h('label', null, label, input));
        }
        keyRow.append(h('button', { class: 'btn', type: 'button', title: 'このキーを削除', dataset: { role: 'ml-key-delete' }, onclick: () => { const next = layers.state().items; next[i].keys.splice(j, 1); editLayers(next); } }, '×'));
        row.append(keyRow);
      });
      layerRows.append(row);
    });
    if (!values.length) layerRows.append(h('p', { class: 'section-note' }, '補正レイヤーがありません。「＋ レイヤー」で追加してください。'));
  }
  function renderLayers() {
    const st = layers.state();
    const sig = JSON.stringify(st.items);
    if (sig !== layerSignature) { layerSignature = sig; drawLayers(); }
    layerStatus.textContent = layerNotice || st.status;
    layerSave.disabled = !st.loaded || !st.dirty || st.saving || st.conflict;
    layerReload.disabled = !st.loaded || st.saving;
    layerAdd.toggleAttribute('disabled', !st.loaded);
    layerKey.toggleAttribute('disabled', !st.loaded);
    layerConflict.hidden = !st.conflict;
  }

  fromChain.addEventListener('click', () => {
    const steps = project.get().bundle?.combination?.timeline || [];
    if (!steps.length) { notice = '先にコンビネーションを追加してください'; renderTimeline(); return; }
    editClips(steps.map((/** @type {any} */ x, /** @type {number} */ i) => safeTimelineClip({ name: x.name, start: i * 90, duration: 90, speed: 1, blend: 6 })));
  });
  add.addEventListener('click', () => {
    const names = [...new Set([
      ...(project.get().bundle?.combination?.timeline || []).map((/** @type {any} */ x) => x.name),
      ...assets.get().items.filter((/** @type {any} */ x) => x.source === 'fbx' && x.kind === 'motions').map((/** @type {any} */ x) => x.name.replace(/\.fbx$/i, '')),
    ])].filter(Boolean);
    const id = nextId('tls-names');
    const input = /** @type {HTMLInputElement} */ (h('input', { value: names[0] || '', list: id, maxLength: 250, autofocus: true, 'aria-label': '追加するモーション名' }));
    const choices = h('datalist', { id }, ...names.map((name) => h('option', { value: name })));
    const modal = openModal({ title: 'クリップを追加', body: [h('label', null, '登録済みのモーション名 ', input), choices], footer: [
      h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'キャンセル'),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const name = input.value.trim(); if (!name) { input.focus(); return; }
        const next = timeline.state().items, last = next.at(-1);
        next.push(safeTimelineClip({ name, start: last ? last.start + last.duration : 0, duration: 90, blend: 6, speed: 1 }));
        editClips(next); modal.close();
      } }, '追加'),
    ] });
  });
  seek.addEventListener('input', () => { frame = Number(seek.value) || 0; renderTimeline(); });
  save.addEventListener('click', () => { void timeline.save(); });
  reload.addEventListener('click', () => {
    if (timeline.state().dirty && !confirm('保存済みの編集状態を読み込みますか？')) return;
    void timeline.load({ discard: true });
  });
  conflictActions.querySelector('[data-role="tls-discard"]')?.addEventListener('click', () => { if (confirm('この画面の変更を破棄して再読込しますか？')) void timeline.load({ discard: true }); });
  conflictActions.querySelector('[data-role="tls-overwrite"]')?.addEventListener('click', () => { if (confirm('サーバー側の変更を上書きしますか？')) void timeline.overwrite(); });

  layerAdd.addEventListener('click', () => { const next = layers.state().items; next.push(safeLayer({ name: '新規補正', bone: 'Hips', keys: [] })); selectedLayer = next.length - 1; editLayers(next); });
  layerKey.addEventListener('click', () => {
    const next = layers.state().items, layer = next[selectedLayer];
    if (!layer) { layerNotice = '先にレイヤーを追加してください'; renderLayers(); return; }
    const at = Math.floor(frame);
    if (layer.keys.some((/** @type {any} */ k) => k.frame === at)) { layerNotice = `${at}F にはキーが既にあります`; renderLayers(); return; }
    layer.keys.push({ frame: at, x: 0, y: 0, z: 0 });
    editLayers(next);
  });
  layerSave.addEventListener('click', () => { void layers.save(); });
  layerReload.addEventListener('click', () => { if (layers.state().dirty && !confirm('保存済みの補正レイヤーを読み込みますか？')) return; void layers.load({ discard: true }); });
  layerConflict.querySelector('[data-role="ml-discard"]')?.addEventListener('click', () => { if (confirm('この画面の補正を破棄して再読込しますか？')) void layers.load({ discard: true }); });
  layerConflict.querySelector('[data-role="ml-overwrite"]')?.addEventListener('click', () => { if (confirm('サーバー側の補正を上書きしますか？')) void layers.overwrite(); });

  const beforeUnload = (/** @type {BeforeUnloadEvent} */ event) => {
    if (![timeline.state(), layers.state()].some((st) => st.dirty || st.saving)) return;
    event.preventDefault(); event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  const offTimeline = timeline.subscribe(renderTimeline), offLayers = layers.subscribe(renderLayers);
  const me = { getState: () => ({ clips: timeline.state().items, frame, playing: false, end: timelineEnd(timeline.state().items), dirty: timeline.state().dirty || layers.state().dirty, conflict: timeline.state().conflict || layers.state().conflict, active: null, layers: layers.state().items.length }) };
  current = me;
  ctx.onCleanup(() => {
    offTimeline(); offLayers();
    window.removeEventListener('beforeunload', beforeUnload);
    if (current === me) current = null;
    void timeline.flushOnLeave().finally(() => timeline.dispose());
    void layers.flushOnLeave().finally(() => layers.dispose());
  });
  void timeline.load(); void layers.load();
  return root;
};
