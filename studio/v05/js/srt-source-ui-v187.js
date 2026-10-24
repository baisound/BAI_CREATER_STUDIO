// LIP-001: source-only SRT import. Reading and lip/VMD generation follow later.
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
      <p>読み・口形候補とリップVMDの生成は未接続です。ここでは原本の確認だけを行います。</p>
    </div>`;
  project.closest('label')?.after(panel);
  const $ = id => document.getElementById(id);
  const fileInput = $('v187-file');
  const encodingInput = $('v187-encoding');
  const sourceSelect = $('v187-source');
  const status = $('v187-status');
  const sourceInfo = $('v187-source-info');
  const cueHost = $('v187-cues');
  let data = null, loadedProject = '', selectedId = '', page = 0, sequence = 0, busy = false;
  const currentSource = () => data?.sources?.find(row => row.id === selectedId);
  const say = message => { status.textContent = message; };
  const time = milliseconds => {
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor(milliseconds / 60000) % 60;
    const seconds = Math.floor(milliseconds / 1000) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
  };
  function redraw() {
    const row = currentSource();
    cueHost.replaceChildren();
    if (!row) {
      sourceInfo.textContent = data?.sources?.length ? '登録済みSRTを選んでください。' : 'この作品に登録済みのSRTはありません。';
      $('v187-page').textContent = '';
      $('v187-prev').disabled = $('v187-next').disabled = true;
      return;
    }
    const state = row.sourceStatus === 'valid' ? '原本照合済み' : row.sourceStatus === 'changed' ? '原本の内容が変わりました' : '原本が見つかりません';
    const warning = row.warnings?.length ? `／時間重なり ${row.warnings.length}件` : '';
    sourceInfo.textContent = `${state}／${row.entries.length}発話${warning}／${row.encoding}／SHA-256 ${row.sha256.slice(0, 16)}…`;
    const start = page * 100;
    for (const cue of row.entries.slice(start, start + 100)) {
      const item = document.createElement('p');
      item.className = 'v187-cue';
      const label = document.createElement('strong');
      label.textContent = `#${cue.index} ${time(cue.startMs)} → ${time(cue.endMs)}`;
      const body = document.createElement('span');
      body.textContent = cue.text;
      item.append(label, body);
      cueHost.append(item);
    }
    $('v187-page').textContent = `${start + 1}〜${Math.min(start + 100, row.entries.length)} / ${row.entries.length}件`;
    $('v187-prev').disabled = page === 0;
    $('v187-next').disabled = start + 100 >= row.entries.length;
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  async function refresh(preferredId = '') {
    const id = project.value;
    const mine = ++sequence;
    loadedProject = id;
    data = null; selectedId = ''; page = 0;
    sourceSelect.replaceChildren();
    redraw();
    if (!id) { say('作品を選んでください。'); return; }
    say('登録済みSRTを読み込んでいます…');
    try {
      const loaded = await request('/api/studio/v05/srt/sources?project_id=' + encodeURIComponent(id));
      if (mine !== sequence || project.value !== id) return;
      data = loaded;
      for (const row of loaded.sources) sourceSelect.add(new Option(row.originalName, row.id));
      selectedId = loaded.sources.some(row => row.id === preferredId) ? preferredId : loaded.sources.at(-1)?.id || '';
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
  sourceSelect.addEventListener('change', () => { selectedId = sourceSelect.value; page = 0; redraw(); });
  $('v187-prev').addEventListener('click', () => { page--; redraw(); });
  $('v187-next').addEventListener('click', () => { page++; redraw(); });
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
      sourceSelect.replaceChildren(...saved.sources.map(source => new Option(source.originalName, source.id)));
      sourceSelect.value = selectedId;
      page = 0; redraw();
      say(`SRT原本を登録しました。${row?.entries.length || 0}発話、時間重なり ${row?.warnings.length || 0}件。`);
    } catch (error) {
      if (project.value === id) { say(`登録に失敗: ${error.message}`); await refresh(selectedId); }
    } finally { busy = false; $('v187-import').disabled = false; }
  });
}
