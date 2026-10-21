// @ts-check
// ④-9・④-10 リターゲット検証の移植（P2 設計 §2.4(a)(h) O-④-5、WP-04b）。SCR-13 に置く。
//  - retargetPanel：右の既存タブ「ボーンマップ」。retarget_ui.js が呼んでいた /api/retarget/* を api.js で呼び、
//    応答を表（上位の項目）と JSON で出す。項目は旧と同じで、増やさない。計算はすべて Python 側（R1）。
//  - retargetViewport：中央のビューポート（three-host）。④-10 の比較の間だけ、元の静止姿勢と補正候補の2体を
//    x = −1.15 / +1.15 に並べる（v01629_mesh_compare.js の配置）。モデルは変えない。
import { h, regionTag } from '../ui.js';
import { assets, createStore } from '../store.js';
import { getJson, postJson, getBinary } from '../api.js';
import { ensureAssets, loadAssets, watchAssets } from './assets.js';
import { loadLibs, loadErrorText, MISSING_FILE_TEXT } from '../viewport/model-loader.js';
import { createViewport, WebGLError, WEBGL_ERROR_TEXT } from '../viewport/three-host.js';

/** @typedef {import('./index.js').FeatureCtx} FeatureCtx */

/** 選択中の素材（画面の中だけ。保存しない）。 */
const rt = createStore({ source: '', target: '' });

/** @type {WeakSet<URLSearchParams>} */
const booted = new WeakSet();
/** @param {FeatureCtx} ctx */
function boot(ctx) {
  if (booted.has(ctx.params)) return;
  booted.add(ctx.params);
  ctx.onCleanup(watchAssets());
  ensureAssets();
}

/** 比較に使える素材（読めるもの）。 */
const usable = () => assets.get().items.filter((/** @type {any} */ a) => a.available);
const q = encodeURIComponent;

/* ------------------------------------------------------------------ 結果の表示（表＋JSON） */

/** 上位の項目の表（スカラーはそのまま、配列は件数、オブジェクトは項目数）。 @param {any} obj */
function summaryTable(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const rows = Object.entries(obj).slice(0, 24).map(([k, v]) => {
    const text = Array.isArray(v) ? `${v.length} 件` : v && typeof v === 'object' ? `${Object.keys(v).length} 項目` : String(v);
    return h('tr', null, h('th', { scope: 'row', class: 'mono' }, k), h('td', null, text.length > 120 ? `${text.slice(0, 120)}…` : text));
  });
  return rows.length ? h('table', { class: 'table rt-sum', dataset: { role: 'rt-table' } }, h('tbody', null, rows)) : null;
}

/** 結果の欄。show は文言、showJson は表＋JSON、fail は失敗の文言。 @param {string} role */
function resultBox(role) {
  const table = h('div', { dataset: { role: `${role}-table-box` } });
  const pre = h('pre', { class: 'rt-pre', role: 'status', 'aria-live': 'polite', dataset: { role } }, '実行待ち');
  return {
    el: h('div', { class: 'rt-result' }, table, pre),
    /** @param {string} t */ show(t) { table.replaceChildren(); pre.textContent = t; },
    /** @param {string} t */ fail(t) { table.replaceChildren(); pre.textContent = t; pre.dataset.kind = 'error'; },
    /** @param {any} obj @param {string} [head] */
    showJson(obj, head = '') {
      delete pre.dataset.kind;
      const t = summaryTable(obj);
      table.replaceChildren(...(t ? [t] : []));
      pre.textContent = (head ? `${head}\n` : '') + JSON.stringify(obj, null, 2);
    },
  };
}

/**
 * API を呼んで欄に出す。失敗は「{failLabel}: {message}」。
 * @param {ReturnType<typeof resultBox>} box @param {string} pending @param {string} failLabel
 * @param {() => Promise<import('../api.js').ApiResult>} call @param {(d: any) => any} [pick] @param {string|((d: any) => string)} [head]
 */
async function run(box, pending, failLabel, call, pick, head) {
  box.show(pending);
  const r = await call();
  if (!r.ok) { box.fail(`${failLabel}: ${r.message}`); return null; }
  box.showJson(pick ? pick(r.data) : r.data, typeof head === 'function' ? head(r.data) : head);
  return r.data;
}

/** @param {string} label @param {string} role @param {string|undefined} title @param {() => void} fn */
const actionBtn = (label, role, title, fn) => h('button', { class: 'btn', type: 'button', title: title || null, dataset: { act: 'real', role }, onclick: fn }, label);

/** @param {string} summary @param {boolean} open @param {...any} body */
const group = (summary, open, ...body) => h('details', { class: 'rt-group', open: open || null }, h('summary', null, summary), h('div', { class: 'rt-body' }, ...body));

/** @param {string} role @param {string} value @param {number} rows */
const area = (role, value, rows) => /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input mono rt-area', rows: String(rows), spellcheck: 'false', 'aria-label': role, dataset: { role } }, value));

/** @param {string} text @param {string} role */
function checkbox(text, role) {
  const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', dataset: { role } }));
  return { box, el: h('label', { class: 'rt-check' }, box, ` ${text}`) };
}

/** モデルの組み合わせの鍵（server.py と同じ sha256(source\0target) の先頭24桁）。 @param {string} s @param {string} t */
async function profileKey(s, t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${s}\0${t}`));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/** JSON を読む。配列でなければ旧と同じ文言で失敗。 @param {string} text */
function parseArray(text) {
  const v = JSON.parse(text);
  if (!Array.isArray(v)) throw new Error('サンプルはJSON配列で入力してください');
  return v;
}

/* ------------------------------------------------------------------ 右：ボーンマップ（④-9） */

/** @param {FeatureCtx} ctx */
export const retargetPanel = (ctx) => {
  boot(ctx);
  const sourceSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '元モーション', dataset: { role: 'rt-source' } }));
  const targetSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '対象モデル', dataset: { role: 'rt-target' } }));
  const list = h('p', { class: 'section-note', dataset: { role: 'rt-list-note' }, role: 'status' });
  const main = resultBox('rt-result');
  main.show('素材を選択してください。');
  const pair = () => ({ source: sourceSel.value, target: targetSel.value });

  function fillSelects() {
    const items = usable();
    for (const [sel, key] of /** @type {const} */ ([[sourceSel, 'source'], [targetSel, 'target']])) {
      const keep = sel.value || rt.get()[key];
      sel.replaceChildren(...items.map((/** @type {any} */ a) => h('option', { value: a.id }, `${a.format}｜${a.name}`)));
      if (items.some((/** @type {any} */ a) => a.id === keep)) sel.value = keep;
    }
    rt.set({ source: sourceSel.value, target: targetSel.value }, 'select');
    const st = assets.get();
    list.textContent = st.status === 'ready' ? (items.length ? `${items.length}件の素材を表示しました。` : '比較できる素材がありません。③で素材を取り込んでください。')
      : st.status === 'error' ? '素材の一覧を読み込めません。' : '素材の一覧を読み込んでいます…';
  }
  ctx.onCleanup(assets.subscribe(fillSelects));
  fillSelects();
  const onSelect = () => {
    rt.set({ source: sourceSel.value, target: targetSel.value }, 'select');
    mapSource = null; mapTarget = null; rows.replaceChildren();
    mapStatus.textContent = '素材の選択が変わりました。候補を再読み込みしてください。';
  };
  sourceSel.addEventListener('change', onSelect);
  targetSel.addEventListener('change', onSelect);

  const needPair = () => { const p = pair(); if (!p.source || !p.target) { main.fail('元モーションと対象モデルを選択してください'); return null; } return p; };

  /* ---- 骨格解析 ---- */
  const analysis = group('骨格解析', true,
    h('div', { class: 'btn-row' },
      actionBtn('骨格を比較', 'rt-analyze', '元と対象の骨格情報を比較します', async () => {
        const p = needPair(); if (!p) return;
        await run(main, '骨格を解析中…', '解析できません', () => getJson(`/api/retarget/compare?source=${q(p.source)}&target=${q(p.target)}`), (d) => ({ source: d.source, target: d.target, comparison: d.comparison }));
      }),
      actionBtn('骨の方向差を解析', 'rt-pose', '対象モデルの骨方向との差を推定します。ひねり・座標軸は自動確定せず、元データも変更しません', async () => {
        const p = needPair(); if (!p) return;
        await run(main, '基準方向の差を解析中…', '基準方向の解析失敗', () => getJson(`/api/retarget/pose-proposal?source=${q(p.source)}&target=${q(p.target)}`));
      }),
      actionBtn('補正候補を表示', 'rt-calibrate', 'スケールとボーン対応の候補を生成。実際の姿勢には適用しません', async () => {
        const p = needPair(); if (!p) return;
        await run(main, '補正候補を算出中…', '補正候補の生成失敗', () => getJson(`/api/retarget/calibration?source=${q(p.source)}&target=${q(p.target)}`));
      }),
      actionBtn('アニメーションキーを解析', 'rt-motion', '元素材のアニメーションチャンネルを非破壊で解析します。GLB・BVHのキーを確認できます', async () => {
        if (!sourceSel.value) { main.fail('抽出失敗: 元モーションを選択してください'); return; }
        await run(main, '抽出中…', '抽出失敗', () => getJson(`/api/retarget/motion-channels?id=${q(sourceSel.value)}`),
          (d) => ({ ...d, channels: (d.channels || []).slice(0, 3).map((/** @type {any} */ x) => ({ ...x, keys: (x.keys || []).slice(0, 4) })) }), '共通アニメーションチャンネル（最大3件を表示）');
      })),
    main.el,
    h('p', { class: 'section-note' }, '※対応不足・基準姿勢差・足IKは別途補正が必要です。'));

  /* ---- 補正プロファイル ---- */
  const pName = /** @type {HTMLInputElement} */ (h('input', { class: 'input', placeholder: '例：モデルA用', 'aria-label': '設定名', dataset: { role: 'rt-profile-name' } }));
  const pScale = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', min: '0.001', max: '1000', step: '0.01', value: '1', 'aria-label': '移動倍率', dataset: { role: 'rt-profile-scale' } }));
  const pYaw = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', min: '-360', max: '360', value: '0', 'aria-label': '向き補正（度）', dataset: { role: 'rt-profile-yaw' } }));
  const pairName = (/** @type {string} */ s, /** @type {string} */ t) => `${s} → ${t}`;
  const profile = group('モデル別補正プロファイル', false,
    h('div', { class: 'rt-fields' }, h('label', null, '設定名', pName), h('label', null, '移動倍率', pScale), h('label', null, '向き補正（度）', pYaw)),
    h('div', { class: 'btn-row' },
      actionBtn('設定を読み込む', 'rt-profile-load', '選択中のモデル組み合わせで保存した補正設定を読み込みます', async () => {
        const p = needPair(); if (!p) return;
        const r = await getJson(`/api/retarget/profile-for-pair?source=${q(p.source)}&target=${q(p.target)}`);
        if (!r.ok) { main.fail(r.message); return; }
        const pr = r.data.profile || {};
        pName.value = pr.name || pairName(p.source, p.target); pScale.value = String(pr.root_scale || 1); pYaw.value = String(pr.yaw_offset_deg || 0);
        main.show(r.data.profile ? 'モデル組み合わせの補正設定を読み込みました。' : '保存済み設定がないため初期値です。');
      }),
      actionBtn('設定を保存', 'rt-profile-save', '元モーションを変更せず、モデル別の補正設定だけ保存します', async () => {
        const p = needPair(); if (!p) return;
        const scale = Number(pScale.value), yaw = Number(pYaw.value);
        if (!(scale > 0 && scale <= 1000 && Number.isFinite(yaw))) { main.fail('保存失敗: スケールまたは角度が不正です'); return; }
        const cur = await getJson('/api/retarget/profiles');
        if (!cur.ok) { main.fail(`保存失敗: ${cur.message}`); return; }
        const key = await profileKey(p.source, p.target);
        const profiles = cur.data.profiles || (cur.data.profiles = {});
        profiles[key] = { ...(profiles[key] || {}), name: pName.value || pairName(p.source, p.target), source: p.source, target: p.target, mapping: (profiles[key] || {}).mapping || {}, root_scale: scale, yaw_offset_deg: yaw, calibrated: false };
        const w = await postJson('/api/retarget/profiles', cur.data);
        if (!w.ok) { main.fail(`保存失敗: ${w.message}`); return; }
        main.show('補正プロファイルを保存しました。実モーションにはまだ適用しません。');
      }),
      actionBtn('移動補正を試算', 'rt-root-preview', 'サンプル座標で移動・向き・スケールの計算結果を表示。実アニメーションの補正は実行されません', async () => {
        await run(main, '試算中…', '試算失敗', () => postJson('/api/retarget/root-preview', { scale: Number(pScale.value), yaw_offset_deg: Number(pYaw.value), samples: [{ frame: 0, position: [0, 0, 0] }, { frame: 30, position: [1, 0, 0] }, { frame: 60, position: [1, 0, 2] }] }),
          undefined, '移動座標の計算例（実モーションは未変更）');
      })));

  /* ---- ボーン対応表 ---- */
  /** @type {any} */ let mapSource = null;
  /** @type {any} */ let mapTarget = null;
  const rows = h('div', { class: 'rt-rows', dataset: { role: 'rt-mapping-rows' } });
  const mapStatus = h('p', { class: 'section-note', role: 'status', dataset: { role: 'rt-mapping-status' } }, '読み込み待ち');
  const roleStatus = h('span', { class: 'section-note', role: 'status', dataset: { role: 'rt-vrm-role-status' } });
  /** @param {Record<string, string>} mapping */
  function renderMapping(mapping) {
    rows.replaceChildren();
    if (!mapSource || !mapTarget) return;
    const src = mapSource.bones || [], dst = mapTarget.bones || [];
    for (const name of src) {
      const sel = /** @type {HTMLSelectElement} */ (h('select', { dataset: { sourceBone: name }, 'aria-label': `${name} の転写先` }, ['', ...dst].map((t) => h('option', { value: t }, t || '（割り当てなし）'))));
      sel.value = dst.includes(mapping[name]) ? mapping[name] : '';
      rows.append(h('div', { class: 'rt-row' }, h('label', null, name), sel));
    }
    mapStatus.textContent = `${src.length}件の元ボーン。転写先を確認してください。`;
  }
  async function loadPair() {
    const p = pair();
    if (!p.source || !p.target) throw new Error('元モーションと対象モデルを選択してください');
    const r = await getJson(`/api/retarget/compare?source=${q(p.source)}&target=${q(p.target)}`);
    if (!r.ok) throw new Error(r.message);
    mapSource = r.data.source; mapTarget = r.data.target;
    return { ...p, data: r.data };
  }
  const pvInput = area('rt-mapping-preview-input', '[]', 3);
  pvInput.placeholder = '[{"bone":"LeftArm","frame":0,"rotation_xyzw":[0,0,0,1]}]';
  const pvOut = resultBox('rt-mapping-preview-result');
  const mapping = group('ボーン対応表（手動確認）', false,
    h('p', { class: 'section-note' }, '自動候補を読み込み、各元ボーンの転写先を選びます。保存してもモーションやモデルには適用されません。'),
    h('div', { class: 'btn-row' },
      actionBtn('VRM Humanoidの役割から候補を取得', 'rt-vrm-role-suggest', '元と対象の両方がVRM Humanoid設定を持つ場合に、同じ役割のボーン名を対応候補として表示します。保存・転写は自動実行しません', async () => {
        try {
          roleStatus.textContent = 'VRM Humanoidの役割を解析中…';
          const p = pair();
          if (!p.source || !p.target) throw new Error('モデルを2つ選んでください');
          const r = await postJson('/api/retarget/vrm-humanoid-preview', p);
          if (!r.ok) throw new Error(r.message);
          const report = r.data;
          await loadPair();
          renderMapping(report.mapping_suggestion || {});
          roleStatus.textContent = `${(report.pairs || []).length}件の対応候補を表示しました。ひねりと軸は未校正・未保存です。`;
          mapStatus.textContent = `${roleStatus.textContent} 必要なら転写先を修正し、「対応表を保存」を押してください。`;
          if ((report.missing_required_roles || []).length) mapStatus.textContent += ` 不足ロール: ${report.missing_required_roles.join(', ')}`;
        } catch (e) { roleStatus.textContent = `Humanoid候補の取得失敗: ${e instanceof Error ? e.message : e}`; }
      }),
      actionBtn('自動候補を読み込む', 'rt-mapping-suggest', undefined, async () => {
        try {
          const { data } = await loadPair();
          const a = data.source.suggested_mapping || {}, b = data.target.suggested_mapping || {};
          /** @type {Record<string, string>} */ const m = {};
          for (const role of Object.keys(a)) if (b[role]) m[a[role]] = b[role];
          renderMapping(m);
          mapStatus.textContent += ' 自動候補は未検証です。';
        } catch (e) { mapStatus.textContent = `読み込み失敗: ${e instanceof Error ? e.message : e}`; }
      }),
      actionBtn('保存済み対応表を読み込む', 'rt-mapping-saved', undefined, async () => {
        try {
          const { source, target } = await loadPair();
          const r = await getJson(`/api/retarget/profile-for-pair?source=${q(source)}&target=${q(target)}`);
          if (!r.ok) throw new Error(r.message);
          renderMapping((r.data.profile && r.data.profile.mapping) || {});
          mapStatus.textContent = r.data.profile ? '保存済み対応表を読み込みました。' : '保存済みの対応表がありません。';
        } catch (e) { mapStatus.textContent = `読み込み失敗: ${e instanceof Error ? e.message : e}`; }
      }),
      actionBtn('対応表を保存', 'rt-mapping-save', undefined, async () => {
        try {
          if (!mapSource || !mapTarget) throw new Error('先に対応表を読み込んでください');
          const { source, target } = pair();
          if (!source || !target) throw new Error('素材を選択してください');
          /** @type {Record<string, string>} */ const m = {};
          const used = new Set();
          for (const node of /** @type {NodeListOf<HTMLSelectElement>} */ (rows.querySelectorAll('select[data-source-bone]'))) {
            if (!node.value) continue;
            if (used.has(node.value)) throw new Error(`同じ転写先ボーンの重複割り当て: ${node.value}`);
            used.add(node.value);
            m[/** @type {string} */ (node.dataset.sourceBone)] = node.value;
          }
          const cur = await getJson('/api/retarget/profiles');
          if (!cur.ok) throw new Error(cur.message);
          const key = await profileKey(source, target);
          const profiles = cur.data.profiles || (cur.data.profiles = {});
          profiles[key] = { ...(profiles[key] || {}), source, target, name: pName.value || pairName(source, target), mapping: m, calibrated: false };
          const w = await postJson('/api/retarget/profiles', cur.data);
          if (!w.ok) throw new Error(w.message);
          mapStatus.textContent = `${Object.keys(m).length}組の対応表を保存しました。実アニメーションへの適用はまだ行いません。`;
        } catch (e) { mapStatus.textContent = `保存失敗: ${e instanceof Error ? e.message : e}`; }
      })),
    roleStatus, rows, mapStatus,
    h('p', { class: 'section-note' }, '保存済み対応表の回転プレビュー（試験）：入力した回転キーに転写先名を適用します。基準姿勢・回転軸・ひねりは補正しません。'),
    pvInput,
    actionBtn('保存済み対応表でプレビュー', 'rt-mapping-preview-run', undefined, async () => {
      try {
        const samples = parseArray(pvInput.value);
        const p = pair();
        await run(pvOut, '実行中…', 'プレビュー失敗', () => postJson('/api/retarget/mapping-preview', { source: p.source, target: p.target, samples }));
      } catch (e) { pvOut.fail(`プレビュー失敗: ${e instanceof Error ? e.message : e}`); }
    }),
    pvOut.el);

  /* ---- 基準姿勢（読取のみ・試験） ---- */
  const restInput = area('rt-rest-preview-input', '{"rest_pairs":{"leftUpperArm":{"source_rest_xyzw":[0,0,0,1],"target_rest_xyzw":[0,0,0,1],"target_bone":"LeftArm"}},"samples":[{"role":"leftUpperArm","frame":0,"rotation_xyzw":[0,0,0,1]}]}', 6);
  const restConfirm = checkbox('入力した両基準姿勢が共通座標系であることを確認した', 'rt-rest-confirm');
  const restOut = resultBox('rt-rest-preview-result');
  const inspOut = resultBox('rt-rest-inspect-result');
  const hierOut = resultBox('rt-hierarchy-result');
  const clipName = /** @type {HTMLInputElement} */ (h('input', { class: 'input', placeholder: 'クリップ名（複数ある場合）', 'aria-label': 'クリップ名', dataset: { role: 'rt-clip-name' } }));
  const hierClipOut = resultBox('rt-hier-clip-result');
  const clipAgree = checkbox('glTF座標系を確認（モデル・VMDに適用しない）', 'rt-clip-agree');
  const clipOut = resultBox('rt-clip-result');
  const worldInput = area('rt-world-input', '[{"role":"leftUpperArm","frame":0,"rotation_xyzw":[0,0,0,1]}]', 3);
  const worldAgree = checkbox('元・先のglTF座標系を確認（数値比較のみ／モデルには適用しない）', 'rt-world-agree');
  const worldOut = resultBox('rt-world-result');
  const rest = group('基準姿勢の検査・回転試算（読取のみ・試験）', false,
    h('p', { class: 'section-note' }, '元・先の基準姿勢が同じ座標系に変換済みの場合のみ利用できます。未確認では計算しません。実モデル・VMDは変更しません。'),
    restInput, restConfirm.el,
    actionBtn('回転を試算（保存しない）', 'rt-rest-preview-run', undefined, async () => {
      try {
        const obj = JSON.parse(restInput.value);
        obj.coordinate_convention_confirmed = restConfirm.box.checked;
        await run(restOut, '実行中…', '回転プレビュー失敗', () => postJson('/api/retarget/explicit-rest-preview', obj));
      } catch (e) { restOut.fail(`回転プレビュー失敗: ${e instanceof Error ? e.message : e}`); }
    }), restOut.el,
    h('div', { class: 'btn-row' },
      actionBtn('VRM基準回転を取得・比較（読取のみ）', 'rt-rest-inspect', undefined, async () => {
        await run(inspOut, 'VRM基準姿勢を調査中…', '調査失敗', () => postJson('/api/retarget/rest-pose-inspection', pair()), undefined, '注意：ローカル回転は共通座標系の校正値ではありません。直接転写はしません。');
      })), inspOut.el,
    actionBtn('親階層込みの基準回転を比較（読取のみ）', 'rt-hierarchy', undefined, async () => {
      await run(hierOut, '親階層を解析中…', '解析失敗', () => postJson('/api/retarget/rest-hierarchy-inspection', pair()), undefined, '注意：ワールド基準回転は直接アニメーションへ適用できません。');
    }), hierOut.el,
    clipName,
    actionBtn('GLBの親アニメーション回転を解析（読取のみ）', 'rt-hier-clip', undefined, async () => {
      await run(hierClipOut, '階層回転解析中…', '解析失敗', () => postJson('/api/retarget/glb-clip-hierarchy-inspection', { source: sourceSel.value, clip: clipName.value || null, fps: 30 }), undefined, '親ボーンのキーフレーム時刻が不一致の場合は未評価です。');
    }), hierClipOut.el,
    clipAgree.el,
    actionBtn('GLB実アニメーションから回転デルタを数値プレビュー', 'rt-clip-preview', undefined, async () => {
      await run(clipOut, 'GLB回転キーを解析中…', '解析失敗', () => postJson('/api/retarget/glb-clip-rest-preview', { ...pair(), clip: clipName.value || null, fps: 30, coordinate_convention_confirmed: clipAgree.box.checked }), undefined, '注意：プレビューのみ・モデルは動きません。');
    }), clipOut.el,
    worldAgree.el, worldInput,
    actionBtn('GLB/VRM基準回転×回転デルタの数値プレビュー', 'rt-world-run', undefined, async () => {
      try {
        const samples = JSON.parse(worldInput.value);
        await run(worldOut, '実行中…', '試算失敗', () => postJson('/api/retarget/world-rest-motion-preview', { ...pair(), samples, coordinate_convention_confirmed: worldAgree.box.checked }), undefined, '【注意】数値プレビューのみ。実モデルへの回転適用・VMD出力はできません。');
      } catch (e) { worldOut.fail(`試算失敗: ${e instanceof Error ? e.message : e}`); }
    }), worldOut.el);

  /* ---- VRMローカル回転の仮転写・品質検査 ---- */
  const tClip = /** @type {HTMLInputElement} */ (h('input', { class: 'input', placeholder: 'クリップ名（複数ある場合）', 'aria-label': '仮転写のクリップ名', dataset: { role: 'rt-transfer-clip' } }));
  const tAgree = checkbox('GLB/VRMの共通座標系を確認済み（試験計算）', 'rt-transfer-agree');
  const tOut = resultBox('rt-transfer-result');
  const transfer = group('VRMローカル回転の仮転写・品質検査（読取のみ）', false,
    h('p', { class: 'section-note' }, '未校正の関節軸とスキニングは検証できません。VMD保存・モデル変更は行いません。'),
    tClip, tAgree.el,
    actionBtn('仮転写と品質チェック', 'rt-transfer-run', undefined, async () => {
      if (!tAgree.box.checked) { tOut.fail('確認または解析エラー: 座標系の確認が必要です'); return; }
      const p = pair();
      await run(tOut, '解析中…', '確認または解析エラー', () => postJson('/api/retarget/vrm-local-transfer-preview', { source: p.source, target: p.target, clip: tClip.value || null, fps: 30, coordinate_convention_confirmed: true }),
        undefined, (d) => `品質ゲート: ${d && d.quality ? d.quality.quality_gate : '不明'}（VMD出力不可）`);
    }), tOut.el);

  return h('div', { class: 'rt-panel', dataset: { feature: 'retargetPanel' } },
    h('p', { class: 'section-note' }, '登録済み素材を選択して骨格情報を比較します。自動マッピングは名称ベースの候補で、まだVMDには変換されません。'),
    h('div', { class: 'rt-fields' },
      h('label', null, '元モーション', sourceSel), h('label', null, '対象モデル', targetSel),
      actionBtn('素材一覧を更新', 'rt-refresh', undefined, () => { void loadAssets(); })),
    list, analysis, profile, mapping, rest, transfer);
};

/* ------------------------------------------------------------------ 中央：ポーズ比較（④-10） */

/** 旧と同じ配置（v01629_mesh_compare.js）：高さ 1.85、x = ∓1.15、足を y=0、各自の XZ の中心を合わせる。 */
const COMPARE_HEIGHT = 1.85;
const COMPARE_X = 1.15;
const MAX_COMPARE_BYTES = 150 * 1024 * 1024;

/** @param {FeatureCtx} ctx */
export const retargetViewport = (ctx) => {
  boot(ctx);
  const stageEl = h('div', { class: 'viewport vp3d', role: 'img', 'aria-label': 'ポーズ比較の3Dビュー', dataset: { role: 'viewport' } });
  const hud = h('div', { class: 'vp-hud' }, h('span', null, '左：変更前'), h('span', null, '右：仮補正後'), h('span', { class: 'right' }, '3D比較'));
  const msg = h('div', { class: 'vp3d-msg', dataset: { role: 'vp-message' } });
  msg.hidden = true;
  stageEl.append(hud, msg);

  const modelSel = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': '比較するGLB/VRMモデル', dataset: { role: 'rt-compare-model' } }));
  const report = area('rt-report', '', 3);
  report.placeholder = '仮転写APIのJSON結果（samples配列含む）';
  const agree = checkbox('数値候補が未校正であることを理解し、比較のみ行う', 'rt-compare-agree');
  const frame = /** @type {HTMLInputElement} */ (h('input', { class: 'input num', type: 'number', step: '1', value: '0', 'aria-label': '比較フレーム', dataset: { role: 'rt-frame' } }));
  const status = h('p', { class: 'section-note', role: 'status', dataset: { role: 'rt-compare-status' } }, '元データは変更されません。');
  /** @param {string} t @param {boolean} [bad] */
  const say = (t, bad = false) => { status.textContent = t; if (bad) status.dataset.kind = 'error'; else delete status.dataset.kind; };

  const fillModels = () => {
    const keep = modelSel.value;
    const items = usable().filter((/** @type {any} */ a) => a.source === 'integrated' && (a.format === 'GLB' || a.format === 'VRM'));
    modelSel.replaceChildren(h('option', { value: '' }, '（モデルを選択）'), ...items.map((/** @type {any} */ a) => h('option', { value: a.id }, `${a.format}｜${a.name}`)));
    if (items.some((/** @type {any} */ a) => a.id === keep)) modelSel.value = keep;
  };
  ctx.onCleanup(assets.subscribe(fillModels));
  fillModels();

  /** @type {import('../viewport/three-host.js').Viewport|null} */
  let host = null;
  let alive = true;
  ctx.onCleanup(() => { alive = false; if (host) { host.dispose(); host = null; } });
  /** @param {string} text @param {boolean} [bad] */
  const hostSay = (text, bad = false) => { msg.textContent = text; msg.dataset.kind = bad ? 'error' : 'info'; msg.hidden = !text; };

  (async () => {
    try {
      const libs = await loadLibs();
      if (!alive) return;
      host = createViewport(stageEl, libs);
    } catch (e) {
      if (alive) hostSay(e instanceof WebGLError ? WEBGL_ERROR_TEXT : loadErrorText(e), true);
    }
  })();

  const ready = actionBtn;
  const getReport = ready('現在選択中のモデルで転写候補を取得', 'rt-get-report', '右の「ボーンマップ」で選んだ元・対象で仮転写APIを呼び、JSONを下の欄に入れます', async () => {
    const { source, target } = rt.get();
    if (!source || !target) { say('取得失敗: 元・転写先素材を選択してください', true); return; }
    say('候補取得中…');
    const r = await postJson('/api/retarget/vrm-local-transfer-preview', { source, target, fps: 30, coordinate_convention_confirmed: true });
    if (!r.ok) { say(`取得失敗: ${r.message}`, true); return; }
    report.value = JSON.stringify(r.data, null, 2);
    say('数値候補を取得しました。確認用のモデルを選んでください。');
  });

  /** @param {any} THREE @param {any} root @param {number} i */
  function place(THREE, root, i) {
    const b = new THREE.Box3().setFromObject(root);
    const height = Math.max(0.001, b.getSize(new THREE.Vector3()).y);
    root.scale.multiplyScalar(COMPARE_HEIGHT / height);
    root.updateWorldMatrix(true, true);
    const after = new THREE.Box3().setFromObject(root);
    const c = after.getCenter(new THREE.Vector3());
    root.position.set((i === 0 ? -1 : 1) * COMPARE_X - c.x, -after.min.y, -c.z);
  }

  let busy = false;
  const runBtn = ready('このフレームを左右比較', 'rt-compare-run', undefined, async () => {
    if (busy) return;
    busy = true;
    try {
      if (!agree.box.checked) throw new Error('確認チェックを入れてください');
      const id = modelSel.value;
      if (!id) throw new Error('モデルを選択してください');
      const item = assets.get().items.find((/** @type {any} */ a) => a.id === id);
      if (!item || !item.available || !item.filename) throw new Error(MISSING_FILE_TEXT);
      let json;
      try { json = JSON.parse(report.value); } catch { throw new Error('仮転写APIのJSONを読めません'); }
      const samples = json && (json.samples || (json.report && json.report.samples));
      if (!Array.isArray(samples)) throw new Error('samples配列がありません');
      const selected = Number(frame.value);
      if (!Number.isSafeInteger(selected) || selected < 0) throw new Error('有効なフレームを指定してください');
      const subset = samples.filter((/** @type {any} */ x) => x.frame === selected);
      if (!subset.length) throw new Error('指定フレームに転写候補がありません');
      if (!host) throw new Error(msg.textContent || '3D表示を開始できません');
      say('モデルを読み込み中…');
      const bin = await getBinary(`/api/integrated-v02/asset/${encodeURIComponent(item.filename)}`);
      if (!bin.ok) throw new Error(bin.status === 404 ? MISSING_FILE_TEXT : bin.message);
      if (bin.data.byteLength > MAX_COMPARE_BYTES) throw new Error('比較用モデルは150MB以下にしてください');
      const libs = await loadLibs();
      if (!alive || !host) return;
      const parse = () => new libs.GLTFLoader().parseAsync(bin.data.slice(0), '');
      const [left, right] = await Promise.all([parse(), parse()]);
      if (!alive || !host) return;
      host.clear();
      [left.scene, right.scene].forEach((root, i) => { place(libs.THREE, root, i); host && host.add(root); });
      const nodes = (right.parser.json.nodes) || [];
      let applied = 0, skipped = 0;
      /** @type {Record<string, number[]>} */ const rotated = {};
      for (const s of subset) {
        const index = s.target_node, qv = s.local_rotation_xyzw;
        if (!Number.isInteger(index) || index < 0 || index >= nodes.length || !Array.isArray(qv) || qv.length !== 4 || qv.some((/** @type {any} */ v) => !Number.isFinite(v)) || Math.hypot(...qv) < 1e-8) { skipped++; continue; }
        const object = await right.parser.getDependency('node', index);
        if (!object) { skipped++; continue; }
        object.quaternion.fromArray(qv).normalize();
        rotated[index] = object.quaternion.toArray();
        applied++;
      }
      host.fit();
      const centers = [left.scene, right.scene].map((o) => { const b = new libs.THREE.Box3().setFromObject(o); const c = b.getCenter(new libs.THREE.Vector3()); return { x: c.x, z: c.z, minY: b.min.y, height: b.getSize(new libs.THREE.Vector3()).y }; });
      host.setState({ loaded: true, assetId: id, format: item.format, compare: { frame: selected, applied, skipped, objects: 2, centers, rotated } });
      hostSay('');
      say(`左：変更前 / 右：仮補正後。フレーム ${selected}、適用 ${applied} ボーン、未適用 ${skipped}。未校正・比較専用。`);
    } catch (e) {
      say(`比較失敗: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally { busy = false; }
  });

  const bar = h('div', { class: 'rt-compare', dataset: { role: 'rt-compare' } },
    h('p', { class: 'section-note' }, '左は元の静止姿勢、右は選択フレームの補正候補です。未校正の候補は試験的で、正確なポーズを保証しません。モデルは変更されません。'),
    h('div', { class: 'rt-fields' }, h('label', null, '比較するモデル', modelSel), getReport),
    report,
    h('div', { class: 'rt-fields' }, agree.el, h('label', null, 'フレーム', frame), runBtn),
    status);
  return h('div', { class: 'vp3d-wrap', dataset: { feature: 'retargetViewport' } },
    h('div', { class: 'pane-head' }, h('h2', null, '3D比較'), h('span', { class: 'spacer' }), regionTag('real')), stageEl, bar);
};
