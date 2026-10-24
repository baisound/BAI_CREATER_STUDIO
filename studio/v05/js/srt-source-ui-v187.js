// LIP-001: source-preserving SRT import and separate utterance reading edits.
const picker = document.getElementById('v06AssetPicker');
const project = document.getElementById('v06project');

if (picker && project) {
  const panel = document.createElement('details');
  panel.id = 'v187-srt-panel';
  panel.innerHTML = `<summary>字幕SRTの原本を作品に登録</summary>
    <div class="v187-body">
      <p>文字コードを選び、SRTの原本を登録します。開始と終了の時刻をそのまま保持します。</p>
      <label>日本語SRT <input id="v187-file" type="file" accept=".srt,text/plain"></label>
      <label>文字コード <select id="v187-encoding">
        <option value="">選択してください</option><option value="utf-8">UTF-8</option>
        <option value="utf-8-bom">UTF-8 BOM</option><option value="cp932">CP932</option>
      </select></label>
      <div class="v187-actions"><button id="v187-import" type="button">SRT原本を登録</button>
      <button id="v187-refresh" type="button">登録を再読み込み</button></div>
      <p id="v187-status" role="status">作品を選ぶと登録済みSRTを確認できます。</p>
      <label>登録済みSRT <select id="v187-source"></select></label>
      <p id="v187-source-info"></p><div id="v187-cues" aria-label="SRT発話一覧"></div>
      <div class="v187-actions"><button id="v187-prev" type="button">前の100件</button>
      <span id="v187-page"></span><button id="v187-next" type="button">次の100件</button></div>
      <div id="v190-reading-editor" class="v190-editor" hidden>
        <strong id="v190-cue-label"></strong>
        <label>読みの状態 <select id="v190-reading-state">
          <option value="unresolved">未確定</option><option value="proposed">提案</option>
          <option value="confirmed">確定</option></select></label>
        <label>かなの読み <input id="v190-reading-kana" type="text" maxlength="300" placeholder="例：かし"></label>
        <label><input id="v190-explicit-silence" type="checkbox"> この発話は口形なし（明示無音）</label>
        <button id="v190-reading-save" type="button">この発話の読みを保存</button>
        <p id="v190-reading-status" role="status"></p>
      </div>
      <div id="v192-candidate-panel" class="v190-editor" hidden>
        <strong>口形候補（未採用）</strong>
        <button id="v192-candidate-run" type="button">選択した発話の候補を確認</button>
        <p id="v192-candidate-status" role="status">かなの読みを保存すると候補を確認できます。</p>
        <div id="v192-candidate-list" aria-label="発話の口形候補"></div>
        <div id="v194-draft-panel" hidden>
          <strong>口形の下書き（未採用）</strong>
          <p id="v194-draft-status" role="status"></p>
          <div id="v194-draft-list" aria-label="口形の下書き編集"></div>
          <button id="v194-draft-save" type="button">下書きを保存</button>
        </div>
      </div>
      <details id="v197-export-panel"><summary>別名モーフVMD候補を作成</summary>
        <p>全発話の確定読み・有効な下書きとPMX口形対応を検査します。生成物は未採用で、実PMXの外観確認が必要です。</p>
        <label>確定済みPMX口形対応 <select id="v197-export-map"></select></label>
        <div class="v187-actions"><button id="v197-export-check" type="button">出力条件を検査</button>
          <button id="v197-export-create" type="button" disabled>別名VMD候補を生成</button></div>
        <p id="v197-export-status" role="status">作品・SRT・PMX対応を選んでください。</p>
        <div id="v197-export-issues" aria-label="出力できない箇所"></div>
        <div id="v197-issue-pages" class="v187-actions" hidden>
          <button id="v197-issues-prev" type="button">前の100件</button>
          <span id="v197-issues-page"></span>
          <button id="v197-issues-next" type="button">次の100件</button>
        </div>
        <a id="v197-export-download" hidden>生成したVMD候補を取得</a>
      </details>
      <p>候補は音声に合わせた境界ではありません。SRT本文と原時刻は変更しません。</p>
    </div>`;
  project.closest('label')?.after(panel);
  const $ = id => document.getElementById(id);
  const fileInput = $('v187-file');
  const encodingInput = $('v187-encoding');
  const sourceSelect = $('v187-source');
  const status = $('v187-status');
  const sourceInfo = $('v187-source-info');
  const cueHost = $('v187-cues');
  let data = null, readings = null, drafts = null, morphMaps = null;
  let loadedProject = '', selectedId = '', selectedCueIndex = null;
  let page = 0, sequence = 0, candidateSequence = 0, busy = false;
  let draftBase = null;
  let exportSequence = 0, exportBusy = false, checkedExport = null;
  let exportIssues = [], exportIssuePage = 0;
  const currentSource = () => data?.sources?.find(row => row.id === selectedId);
  const currentReading = () => readings?.utterances?.find(row => row.srtSourceId === selectedId && row.srtIndex === selectedCueIndex);
  const currentDraft = () => drafts?.drafts?.find(row => row.srtSourceId === selectedId && row.srtIndex === selectedCueIndex);
  const say = message => { status.textContent = message; };
  function renderExportIssues() {
    const host = $('v197-export-issues');
    host.replaceChildren();
    const start = exportIssuePage * 100;
    for (const issue of exportIssues.slice(start, start + 100)) {
      const row = document.createElement('p');
      row.className = 'v192-warning';
      const cue = issue.srtIndex ? `発話 #${issue.srtIndex}: `
        : issue.srtIndices?.length ? `発話 #${issue.srtIndices.join(' / #')}: ` : '';
      const frame = Number.isInteger(issue.vmdFrame) ? `（VMD F${issue.vmdFrame} ${issue.morphName || ''}）` : '';
      row.textContent = `${cue}${issue.message || issue.code}${frame}`;
      host.append(row);
    }
    $('v197-issue-pages').hidden = exportIssues.length <= 100;
    $('v197-issues-page').textContent = exportIssues.length
      ? `${start + 1}〜${Math.min(start + 100, exportIssues.length)} / ${exportIssues.length}件` : '';
    $('v197-issues-prev').disabled = exportIssuePage === 0;
    $('v197-issues-next').disabled = start + 100 >= exportIssues.length;
  }
  function clearExport() {
    ++exportSequence;
    checkedExport = null;
    $('v197-export-create').disabled = true;
    $('v197-export-download').hidden = true;
    $('v197-export-download').removeAttribute('href');
    $('v197-export-status').textContent = '出力条件を検査してください。';
    exportIssues = []; exportIssuePage = 0; renderExportIssues();
  }
  function redrawExportMaps() {
    const select = $('v197-export-map');
    const prior = select.value;
    select.replaceChildren();
    const maps = morphMaps?.maps?.filter(row => row.confirmed && row.source_status === 'valid') || [];
    for (const row of maps) select.add(new Option(row.model_asset_id, row.model_asset_id));
    if (maps.some(row => row.model_asset_id === prior)) select.value = prior;
    const usable = Boolean(currentSource()?.sourceStatus === 'valid' && maps.length && data && readings && drafts);
    $('v197-export-check').disabled = !usable || exportBusy;
    if (!usable) $('v197-export-status').textContent = maps.length
      ? '原本を照合できるSRTを選んでください。' : 'この作品に確定済みの登録PMX口形対応がありません。対応表を確定後、登録を再読み込みしてください。';
  }
  const time = milliseconds => {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor(milliseconds / 60000) % 60;
    const seconds = Math.floor(milliseconds / 1000) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
  };
  function updateReadingFields() {
    const silent = $('v190-explicit-silence').checked;
    if (silent) $('v190-reading-state').value = 'unresolved';
    $('v190-reading-state').disabled = silent;
    $('v190-reading-kana').disabled = silent || $('v190-reading-state').value === 'unresolved';
  }
  function clearCandidate() {
    ++candidateSequence;
    $('v192-candidate-list').replaceChildren();
    $('v192-candidate-status').textContent = '保存済みの読みから、未採用の候補を計算できます。';
    draftBase = null;
    $('v194-draft-panel').hidden = true;
    $('v194-draft-list').replaceChildren();
  }
  function drawDraft(base, segments, message) {
    draftBase = base;
    $('v194-draft-panel').hidden = false;
    $('v194-draft-status').textContent = message;
    const list = $('v194-draft-list');
    list.replaceChildren();
    for (const [index, segment] of segments.entries()) {
      const row = document.createElement('div');
      row.className = 'v194-draft-row';
      row.dataset.index = String(index);
      for (const [key, label, value, step] of [
        ['startFrame', '開始F', segment.startFrame, '1'],
        ['endFrame', '終了F', segment.endFrame, '1'],
        ['weight', '強さ', segment.weight, '0.01']]) {
        const field = document.createElement('label');
        field.textContent = label;
        const input = document.createElement('input');
        input.type = 'number'; input.dataset.field = key; input.value = String(value); input.step = step;
        if (key === 'weight') { input.min = '0'; input.max = '1'; }
        else { input.min = '0'; input.max = '1000000'; }
        field.append(input); row.append(field);
      }
      const field = document.createElement('label');
      field.textContent = '口形';
      const select = document.createElement('select'); select.dataset.field = 'mouthShape';
      for (const shape of ['A', 'I', 'U', 'E', 'O', 'Closed', 'Rest']) select.add(new Option(shape, shape));
      select.value = segment.mouthShape;
      field.append(select); row.append(field); list.append(row);
    }
    $('v194-draft-save').disabled = !base || currentSource()?.sourceStatus !== 'valid';
  }
  function markReadingDirty() {
    clearCandidate();
    clearExport();
    $('v192-candidate-run').disabled = true;
    $('v192-candidate-status').textContent = '読みの変更を保存してから候補を確認してください。';
    $('v190-reading-status').textContent = '未保存の変更があります。';
  }
  function redrawEditor() {
    const source = currentSource();
    const cue = source?.entries.find(row => row.index === selectedCueIndex);
    const editor = $('v190-reading-editor');
    editor.hidden = !cue;
    $('v192-candidate-panel').hidden = !cue;
    clearCandidate();
    if (!cue) return;
    const saved = currentReading();
    const draft = currentDraft();
    if (draft) {
      const valid = draft.draftStatus === 'draft';
      drawDraft(valid ? {sourceHash: draft.sourceHash,
        pronunciationVersion: draft.pronunciationVersion, projectFps: draft.projectFps} : null,
        draft.segments, valid ? '保存済みの下書きです。VMDには採用されていません。'
          : `旧下書きは${draft.draftStatus}です。候補を再計算してから保存してください。`);
    }
    $('v190-cue-label').textContent = `#${cue.index} ${time(cue.startMs)} → ${time(cue.endMs)} の読み`;
    $('v190-reading-state').value = saved?.readingState || 'unresolved';
    $('v190-reading-kana').value = saved?.readingKana || '';
    $('v190-explicit-silence').checked = saved?.explicitSilence || false;
    updateReadingFields();
    $('v190-reading-save').disabled = source.sourceStatus !== 'valid' || !readings;
    $('v192-candidate-run').disabled = source.sourceStatus !== 'valid' || !readings;
    $('v190-reading-status').textContent = source.sourceStatus !== 'valid'
      ? '原本の照合に失敗しました。読みは更新できません。'
      : saved ? `${saved.explicitSilence ? '明示無音' : saved.readingState === 'confirmed' ? '確定済み' : saved.readingState === 'proposed' ? '提案保存済み' : '未確定'}／版${saved.pronunciationVersion}`
      : '未確定です。保存するまで原SRTには影響しません。';
  }
  function redraw() {
    clearExport();
    const row = currentSource();
    cueHost.replaceChildren();
    if (!row) {
      sourceInfo.textContent = data?.sources?.length ? '登録済みSRTを選んでください。' : 'この作品に登録済みのSRTはありません。';
      $('v187-page').textContent = '';
      $('v187-prev').disabled = $('v187-next').disabled = true;
      redrawEditor();
      redrawExportMaps();
      return;
    }
    const state = row.sourceStatus === 'valid' ? '原本照合済み' : row.sourceStatus === 'changed' ? '原本の内容が変わりました' : '原本が見つかりません';
    const warning = row.warnings?.length ? `／時間重なり ${row.warnings.length}件` : '';
    sourceInfo.textContent = `${state}／${row.entries.length}発話${warning}／${row.encoding}／SHA-256 ${row.sha256.slice(0, 16)}…`;
    const start = page * 100;
    for (const cue of row.entries.slice(start, start + 100)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'v187-cue';
      item.dataset.index = String(cue.index);
      item.setAttribute('aria-pressed', String(cue.index === selectedCueIndex));
      const label = document.createElement('strong');
      const saved = readings?.utterances?.find(reading => reading.srtSourceId === selectedId && reading.srtIndex === cue.index);
      const state = saved?.explicitSilence ? '明示無音' : saved?.readingState === 'confirmed' ? '確定' : saved?.readingState === 'proposed' ? '提案' : '未確定';
      label.textContent = `#${cue.index} ${time(cue.startMs)} → ${time(cue.endMs)} ／ ${state}`;
      const body = document.createElement('span');
      body.textContent = cue.text;
      item.append(label, body);
      cueHost.append(item);
    }
    $('v187-page').textContent = `${start + 1}〜${Math.min(start + 100, row.entries.length)} / ${row.entries.length}件`;
    $('v187-prev').disabled = page === 0;
    $('v187-next').disabled = start + 100 >= row.entries.length;
    redrawEditor();
    redrawExportMaps();
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) {
      const error = Error(body.error || `HTTP ${response.status}`);
      error.issues = Array.isArray(body.issues) ? body.issues : [];
      throw error;
    }
    return body;
  }
  async function refresh(preferredId = '', preferredCueIndex = selectedCueIndex) {
    const id = project.value;
    const mine = ++sequence;
    loadedProject = id;
    data = null; readings = null; drafts = null; morphMaps = null;
    selectedId = ''; selectedCueIndex = null; page = 0;
    sourceSelect.replaceChildren();
    redraw();
    if (!id) { say('作品を選んでください。'); return; }
    say('登録済みSRTを読み込んでいます…');
    try {
      const [loaded, loadedReadings, loadedDrafts, loadedMaps] = await Promise.all([
        request('/api/studio/v05/srt/sources?project_id=' + encodeURIComponent(id)),
        request('/api/studio/v05/lip/readings?project_id=' + encodeURIComponent(id)),
        request('/api/studio/v05/lip/drafts?project_id=' + encodeURIComponent(id)),
        request('/api/studio/v05/pmx/morph-map?project_id=' + encodeURIComponent(id))]);
      if (mine !== sequence || project.value !== id) return;
      data = loaded;
      readings = loadedReadings;
      drafts = loadedDrafts;
      morphMaps = loadedMaps;
      for (const row of loaded.sources) sourceSelect.add(new Option(row.originalName, row.id));
      selectedId = loaded.sources.some(row => row.id === preferredId) ? preferredId : loaded.sources.at(-1)?.id || '';
      selectedCueIndex = currentSource()?.entries.some(row => row.index === preferredCueIndex)
        ? preferredCueIndex : currentSource()?.entries[0]?.index ?? null;
      sourceSelect.value = selectedId;
      redraw();
      say(`${loaded.sources.length}件のSRT原本をこの作品で確認できます。`);
    } catch (error) {
      if (mine === sequence) say(`SRTの読込に失敗: ${error.message}`);
    }
  }
  panel.addEventListener('toggle', () => { if (panel.open) void refresh(); });
  project.addEventListener('change', () => { ++sequence; if (panel.open) void refresh(); });
  $('v187-refresh').addEventListener('click', () => void refresh(selectedId));
  sourceSelect.addEventListener('change', () => { selectedId = sourceSelect.value; selectedCueIndex = currentSource()?.entries[0]?.index ?? null; page = 0; redraw(); });
  cueHost.addEventListener('click', event => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    selectedCueIndex = Number(button.dataset.index);
    redraw();
  });
  $('v187-prev').addEventListener('click', () => { page--; redraw(); });
  $('v187-next').addEventListener('click', () => { page++; redraw(); });
  $('v197-export-map').addEventListener('change', clearExport);
  $('v197-issues-prev').addEventListener('click', () => { exportIssuePage--; renderExportIssues(); });
  $('v197-issues-next').addEventListener('click', () => { exportIssuePage++; renderExportIssues(); });
  async function exportRequest(dryRun) {
    const source = currentSource(), id = project.value, modelId = $('v197-export-map').value;
    if (!source || !id || !modelId || !data || !readings || !drafts || !morphMaps || exportBusy) return;
    const snapshot = {project_id: id, source_id: source.id, model_asset_id: modelId,
      source_revision: data.revision, reading_revision: readings.revision,
      draft_revision: drafts.revision, map_revision: morphMaps.revision};
    if (!dryRun && (!checkedExport || JSON.stringify(snapshot) !== JSON.stringify(checkedExport))) return;
    const mine = ++exportSequence;
    exportBusy = true;
    $('v197-export-check').disabled = true;
    $('v197-export-create').disabled = true;
    $('v197-export-download').hidden = true;
    exportIssues = []; exportIssuePage = 0; renderExportIssues();
    $('v197-export-status').textContent = dryRun ? '全発話を検査しています…' : '別名VMD候補を生成しています…';
    try {
      const result = await request('/api/studio/v05/lip/vmd-candidate', {method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...snapshot, dry_run: dryRun})});
      if (mine !== exportSequence || project.value !== id || selectedId !== source.id
        || $('v197-export-map').value !== modelId) return;
      if (dryRun) {
        checkedExport = snapshot;
        $('v197-export-create').disabled = false;
        $('v197-export-status').textContent = `検査通過: ${result.cueCount}発話（明示無音${result.silenceCount}件）、モーフ${result.morphKeys}キー。バイナリ再読込済み。未採用です。`;
      } else {
        checkedExport = null;
        const link = $('v197-export-download');
        link.href = result.downloadUrl; link.download = result.fileName; link.hidden = false;
        $('v197-export-status').textContent = `${result.fileName} を別名候補として生成しました。実PMXの外観確認と採用は未完了です。`;
      }
    } catch (error) {
      if (mine === exportSequence) {
        checkedExport = null;
        $('v197-export-status').textContent = `出力できません: ${error.message}`;
        exportIssues = error.issues || []; exportIssuePage = 0; renderExportIssues();
      }
    } finally {
      exportBusy = false;
      redrawExportMaps();
    }
  }
  $('v197-export-check').addEventListener('click', () => void exportRequest(true));
  $('v197-export-create').addEventListener('click', () => void exportRequest(false));
  $('v190-reading-state').addEventListener('change', () => { updateReadingFields(); markReadingDirty(); });
  $('v190-reading-kana').addEventListener('input', markReadingDirty);
  $('v190-explicit-silence').addEventListener('change', () => { updateReadingFields(); markReadingDirty(); });
  $('v192-candidate-run').addEventListener('click', async () => {
    const source = currentSource(), id = project.value, cueIndex = selectedCueIndex;
    if (!source || source.sourceStatus !== 'valid' || cueIndex === null) return;
    const mine = ++candidateSequence;
    const list = $('v192-candidate-list');
    list.replaceChildren();
    $('v192-candidate-status').textContent = '原時刻から口形候補を計算しています…';
    try {
      const query = new URLSearchParams({project_id: id, source_id: source.id, srt_index: String(cueIndex)});
      const result = await request('/api/studio/v05/lip/candidates?' + query);
      if (mine !== candidateSequence || project.value !== id || selectedId !== source.id || selectedCueIndex !== cueIndex) return;
      const states = {ready: '確定読みから計算', needs_review: '警告あり・確認が必要',
        proposed: '提案読み・未確定', unresolved: '読み未確定・候補なし',
        explicit_silence: '明示無音・候補なし'};
      const statusText = states[result.status] || result.status;
      $('v192-candidate-status').textContent = `${statusText}／元SRT ${time(result.sourceStartMs)} → ${time(result.sourceEndMs)}／作品${result.projectFps}fps／未採用`;
      for (const warning of result.warnings || []) {
        const message = document.createElement('p');
        message.className = 'v192-warning';
        const labels = {time_overlap: 'SRT発話の時間が重なります', frame_collision: '同じ作品フレームに圧縮されます',
          millisecond_collision: '元区間が短すぎます', unknown_mora: '読みから母音を決められません',
          labial_closure_omitted: '短区間のため唇閉鎖を省きました'};
        message.textContent = `要確認: ${labels[warning.code] || warning.code}`;
        list.append(message);
      }
      for (const segment of result.segments || []) {
        const item = document.createElement('p');
        item.className = 'v192-segment';
        item.textContent = `${segment.mora} → ${segment.mouthShape} ／ ${time(segment.startMs)}〜${time(segment.endMs)} ／ 作品F${segment.startFrame}〜${segment.endFrame}`;
        list.append(item);
      }
      if (result.segments?.length && result.status !== 'unresolved' && result.status !== 'explicit_silence') {
        const saved = currentDraft();
        if (!saved || saved.draftStatus !== 'draft') {
          drawDraft({sourceHash: result.sourceHash,
            pronunciationVersion: result.pronunciationVersion, projectFps: result.projectFps},
            result.segments.map(row => ({startFrame: row.startFrame, endFrame: row.endFrame,
              mouthShape: row.mouthShape, weight: 1})),
            '候補から作成した未保存の下書きです。区間の重複・ゼロ長は保存時に拒否します。');
        }
      }
    } catch (error) {
      if (mine === candidateSequence) $('v192-candidate-status').textContent = `候補を計算できません: ${error.message}`;
    }
  });
  $('v194-draft-list').addEventListener('input', () => {
    clearExport();
    if (draftBase) $('v194-draft-status').textContent = '未保存の変更があります。';
  });
  $('v194-draft-save').addEventListener('click', async () => {
    const source = currentSource(), id = project.value, cueIndex = selectedCueIndex;
    if (!source || !draftBase || !drafts || cueIndex === null || busy) return;
    const segments = [...$('v194-draft-list').querySelectorAll('.v194-draft-row')].map(row => {
      const input = key => row.querySelector(`[data-field="${key}"]`).value;
      return {startFrame: input('startFrame') === '' ? NaN : Number(input('startFrame')),
        endFrame: input('endFrame') === '' ? NaN : Number(input('endFrame')),
        mouthShape: input('mouthShape'), weight: input('weight') === '' ? NaN : Number(input('weight'))};
    });
    if (segments.some(row => !Number.isInteger(row.startFrame) || !Number.isInteger(row.endFrame)
      || !Number.isFinite(row.weight))) {
      $('v194-draft-status').textContent = '整数フレームと有限な強さを入力してください。'; return;
    }
    busy = true; $('v194-draft-save').disabled = true;
    $('v194-draft-status').textContent = '下書きを保存しています…';
    try {
      const saved = await request('/api/studio/v05/lip/drafts', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
          project_id: id, revision: drafts.revision, source_id: source.id,
          source_hash: draftBase.sourceHash, srt_index: cueIndex,
          pronunciation_version: draftBase.pronunciationVersion,
          project_fps: draftBase.projectFps, segments})});
      if (project.value !== id || selectedId !== source.id || selectedCueIndex !== cueIndex) return;
      drafts = saved;
      clearExport();
      $('v194-draft-status').textContent = `下書き版${saved.revision}を保存しました。VMDには未採用です。`;
      say(`発話 #${cueIndex} の口形下書きを保存しました。`);
    } catch (error) {
      if (project.value === id) $('v194-draft-status').textContent = `下書きの保存に失敗: ${error.message}`;
    } finally { busy = false; $('v194-draft-save').disabled = !draftBase || currentSource()?.sourceStatus !== 'valid'; }
  });
  $('v190-reading-save').addEventListener('click', async () => {
    const source = currentSource(), id = project.value, cueIndex = selectedCueIndex;
    if (!source || source.sourceStatus !== 'valid' || !readings || cueIndex === null || busy) return;
    const silent = $('v190-explicit-silence').checked;
    const state = silent ? 'unresolved' : $('v190-reading-state').value;
    const kana = silent || state === 'unresolved' ? null : $('v190-reading-kana').value;
    busy = true; $('v190-reading-save').disabled = true;
    $('v190-reading-status').textContent = '読みを保存しています…';
    try {
      const saved = await request('/api/studio/v05/lip/readings', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
          project_id: id, revision: readings.revision, source_id: source.id,
          source_hash: source.sha256, srt_index: cueIndex, reading_state: state,
          reading_kana: kana, explicit_silence: silent})});
      if (project.value !== id || selectedId !== source.id) return;
      readings = saved;
      drafts = await request('/api/studio/v05/lip/drafts?project_id=' + encodeURIComponent(id));
      redraw();
      say(`発話 #${cueIndex} の読みを原本と別に保存しました。`);
    } catch (error) {
      if (project.value === id) {
        const beforeId = selectedId;
        await refresh(beforeId, cueIndex);
        const message = `読みの保存に失敗: ${error.message}`;
        $('v190-reading-status').textContent = message;
        say(message);
      }
    } finally { busy = false; $('v190-reading-save').disabled = currentSource()?.sourceStatus !== 'valid' || !readings; }
  });
  $('v187-import').addEventListener('click', async () => {
    if (busy) return;
    const id = project.value;
    const file = fileInput.files?.[0];
    if (!id || !data || loadedProject !== id) { say('作品のSRT一覧を読み込んでください。'); return; }
    if (!file || !file.name.toLowerCase().endsWith('.srt')) { say('SRTファイルを選んでください。'); return; }
    if (!encodingInput.value) { say('文字コードを明示して選んでください。'); return; }
    if (!file.size || file.size > 8 * 1024 * 1024) { say('SRTは1バイト〜8 MiBで選んでください。'); return; }
    busy = true; $('v187-import').disabled = true;
    say('SRT原本を登録しています…');
    try {
      const query = new URLSearchParams({project_id: id, revision: String(data.revision),
        name: file.name, encoding: encodingInput.value});
      const saved = await request('/api/studio/v05/srt/import?' + query, {
        method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: await file.arrayBuffer()});
      if (project.value !== id) return;
      fileInput.value = '';
      data = saved; loadedProject = id;
      const row = saved.sources.at(-1);
      selectedId = row?.id || '';
      selectedCueIndex = row?.entries[0]?.index ?? null;
      sourceSelect.replaceChildren(...saved.sources.map(source => new Option(source.originalName, source.id)));
      sourceSelect.value = selectedId;
      page = 0; redraw();
      say(`SRT原本を登録しました。${row?.entries.length || 0}発話、時間重なり ${row?.warnings.length || 0}件。`);
    } catch (error) {
      if (project.value === id) { say(`登録に失敗: ${error.message}`); await refresh(selectedId); }
    } finally { busy = false; $('v187-import').disabled = false; }
  });
}
