/* v0.5 In/Out markers for the saved arrangement and bounded MP4 export. */
(function (root) {
  'use strict';
  const project = document.getElementById('v06project');
  const outputPage = document.getElementById('bai-output');
  const output = document.getElementById('v66OutputRange');
  const timeline = document.getElementById('v07timeline');
  if (!project || !outputPage || !output || !timeline) return;

  const controls = document.createElement('div');
  controls.id = 'v66RangeTools';
  controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0';
  controls.innerHTML = '<strong>保存済みタイムラインの出力範囲</strong><button type="button" class="small" id="v66SetIn">I イン点</button><button type="button" class="small" id="v66SetOut">O アウト点</button><button type="button" class="small" id="v66Clear">範囲解除</button><button type="button" class="small" id="v66Reload">再読込</button>';
  const label = document.createElement('span');
  label.id = 'v66RangeStatus';
  label.setAttribute('role', 'status');
  label.textContent = '範囲を読み込み中';
  controls.append(label);
  timeline.before(controls);

  let current = null, serial = 0, busy = false;
  const url = '/api/studio/v05/timeline/range';
  function name() { return project.selectedOptions[0]?.textContent || '作品未選択'; }
  function show(message = '') {
    if (!current) {
      label.textContent = message || '作品の範囲を読み込み中';
      output.textContent = label.textContent;
      return;
    }
    const marker = (value, fallback) => value === null ? `${fallback}（既定）` : String(value);
    label.textContent = message || `I ${marker(current.in_frame, 0)} / O ${marker(current.out_frame, current.final_frame)} F`;
    if (message) {
      output.textContent = message;
      output.dataset.kind = 'notice';
      return;
    }
    if (!current.valid) {
      output.textContent = `${name()}：保存範囲が現在のタイムラインを超えています。イン点・アウト点を修正してください。`;
      output.dataset.kind = 'error';
      return;
    }
    output.dataset.kind = 'info';
    output.textContent = current.has_clips
      ? `${name()} / ${current.fps} fps：F ${current.range_start_frame}〜${current.effective_out_frame}（${current.frame_count}フレーム、終了境界 ${current.range_end_exclusive}）。書き出し条件を下で確認できます。`
      : `${name()}：保存済みクリップがありません。範囲は仮のF 0〜0です。実MP4には保存済みクリップが必要です。`;
  }
  async function refresh() {
    const id = project.value;
    if (!id) { current = null; show('作品を選択してください'); return; }
    const mine = ++serial;
    current = null;
    show('保存済みのイン点・アウト点を読み込み中…');
    try {
      const response = await fetch(`${url}?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`範囲を取得できません（HTTP ${response.status}）`);
      const result = await response.json();
      if (mine !== serial || project.value !== id) return;
      current = result; show();
    } catch (error) {
      if (mine !== serial) return;
      current = null;
      show(error instanceof Error ? error.message : '範囲を取得できません');
    }
  }
  async function save(inFrame, outFrame) {
    if (!current || busy) return;
    const snapshot = current;
    busy = true; show('イン点・アウト点を保存中…');
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: snapshot.project_id, revision: snapshot.revision,
          arrangement_revision: snapshot.arrangement_revision, in_frame: inFrame, out_frame: outFrame }),
      });
      if (!response.ok) {
        const reason = await response.text();
        throw new Error(response.status === 409 ? '他の編集で範囲かクリップが変わりました。再読込してください。'
          : `範囲を保存できません（HTTP ${response.status}）：${reason.slice(0, 120)}`);
      }
      const result = await response.json();
      if (project.value !== snapshot.project_id) { await refresh(); return; }
      current = result; show();
    } catch (error) {
      current = null;
      show(error instanceof Error ? error.message : '範囲を保存できません');
    } finally { busy = false; }
  }
  function playheadFrame() {
    if (!current) return null;
    const persisted = root.BAIStudioPersistedSeek?.status?.();
    if (persisted?.projectId !== current.project_id) {
      show('作品の保存済み再生位置を取得できません'); return null;
    }
    const seconds = persisted.seconds;
    if (!Number.isFinite(seconds) || seconds < 0) { show('再生位置を取得できません'); return null; }
    const frame = Math.round(seconds * current.fps);
    if (frame > current.final_frame) {
      show(`現在位置 F ${frame} は最終 F ${current.final_frame} より後です`);
      return null;
    }
    return frame;
  }
  controls.querySelector('#v66SetIn').addEventListener('click', () => {
    const frame = playheadFrame();
    if (frame !== null) void save(frame, current.out_frame);
  });
  controls.querySelector('#v66SetOut').addEventListener('click', () => {
    const frame = playheadFrame();
    if (frame !== null) void save(current.in_frame, frame);
  });
  controls.querySelector('#v66Clear').addEventListener('click', () => { void save(null, null); });
  controls.querySelector('#v66Reload').addEventListener('click', () => { void refresh(); });
  project.addEventListener('change', () => { void refresh(); });
  root.addEventListener('bai:v05-arrangement-loaded', (event) => {
    if (event.detail?.projectId === project.value) void refresh();
  });
  new MutationObserver(() => {
    if (outputPage.classList.contains('active')) void refresh();
  }).observe(outputPage, { attributes: true, attributeFilter: ['class'] });
  function fraction(fps) {
    const parts = String(fps).split('.');
    if (parts.length === 1) return { fpsNum: Number(parts[0]), fpsDen: 1 };
    const den = 10 ** parts[1].length;
    return { fpsNum: Number(parts[0]) * den + Number(parts[1]), fpsDen: den };
  }
  root.BAIStudioRenderRange = Object.freeze({
    refresh, status: () => current && { ...current },
    jobRange: () => current?.valid && current.has_clips
      ? { projectId: current.project_id, arrangementRevision: current.arrangement_revision,
        rangeStartFrame: current.range_start_frame, rangeEndExclusive: current.range_end_exclusive,
        ...fraction(current.fps) }
      : null,
  });
  if (project.value) void refresh();
})(window);
