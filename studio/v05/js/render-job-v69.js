/* Real, bounded MP4 jobs from the saved v0.5 arrangement and In/Out snapshot. */
(() => {
  'use strict';
  const page = document.querySelector('#bai-output');
  const button = document.querySelector('#baiAddRender');
  const queue = document.querySelector('#baiRenderQueue');
  if (!page || !button || !queue) return;
  const settings = page.querySelector('.baiTwo > .baiCard');
  const format = document.querySelector('#baiOutputFormat');
  const selects = settings.querySelectorAll('select');
  const resolution = selects[1];
  const fpsSelect = selects[2];
  format.options[0].value = 'mp4_h264_aac';
  for (let i = 1; i < format.options.length; i++) format.options[i].disabled = true;
  let pngOption=[...format.options].find(o=>/PNG/i.test(o.textContent));
  if(!pngOption){pngOption=new Option('PNG連番＋WAV（ZIP）','png_rgba_zip');format.add(pngOption,1);}
  pngOption.value='png_rgba_zip';pngOption.textContent='PNG連番（ZIP）';pngOption.disabled=false;
  format.disabled = false;
  format.title = 'MP4またはRGBA PNG連番と別WAVを選択';
  resolution.id = 'v69resolution';
  resolution.insertAdjacentHTML('afterbegin', '<option value="720p">1280 × 720</option>');
  resolution.options[1].value = '1080p';
  for (let i = 2; i < resolution.options.length; i++) resolution.options[i].disabled = true;
  resolution.disabled = false;
  resolution.value = '720p';
  fpsSelect.title = '保存済み作品のFPSで書き出します';
  settings.insertAdjacentHTML('beforeend', '<p id="v69status" role="status" class="baiTiny">作品の書き出し条件を確認中…</p><p class="baiTiny">画像・動画（内包音声を含む）・独立音声は10分以内。保存済み3Dシーンと適用済み動作を含む作品は720p・最大36000フレーム・10分以内、可逆動画の作業領域2GiB以内の実描画に対応します。3Dの保存カメラがあれば同じ視点を使い、未保存なら自動配置します。字幕などの未接続内容は出力へ反映されません。保存済みの未対応クリップは欠落を避けるため拒否します。</p>');
  settings.querySelector('#v69status').insertAdjacentHTML('beforebegin', '<label>完成物の名前 <input id="v69name" type="text" maxlength="84" autocomplete="off" aria-describedby="v69nameHint"></label><label>同じ名前があるとき <select id="v69nameMode"><option value="version">新しい版名で保存</option><option value="replace">この名前の完成物を置換（旧版を保存）</option></select></label><p id="v69nameHint" role="status" class="baiTiny">名前を確認中…</p>');
  const result = document.createElement('div');
  result.id = 'v69result';
  result.hidden = true;
  result.innerHTML = '<strong>選択中の完成動画</strong><div class="v69resultActions"><a id="v69download" class="v69download" download>動画をダウンロード</a><span id="v69resultInfo"></span></div>';
  page.querySelector('.baiPreview').after(result);
  const preview = page.querySelector('.baiPreview');
  const sample = preview.querySelector('img');
  const $ = id => document.getElementById(id);
  let context = null, requestSeq = 0, timer = 0, selectedJobId = null, nameProjectId = '';
  let completedOffset = 0, historyProjectId = '', historySeq = 0;
  const historyCard = queue.closest('.baiCard');
  historyCard.id = 'v69historyCard';
  historyCard.querySelector('h2').textContent = '書き出したファイルをダウンロード';
  const historyControls = document.createElement('div');
  historyControls.className = 'v69historyControls';
  historyControls.innerHTML = '<label for="v69historyProject">作品 <select id="v69historyProject"></select></label><button type="button" id="v69refreshHistory">一覧を更新</button><p class="baiTiny">完成したファイルの「ダウンロード」からパソコンへ保存できます。旧版も選べます。</p>';
  queue.before(historyControls);
  const nameInput = $('v69name'), nameMode = $('v69nameMode'), nameHint = $('v69nameHint');
  settings.querySelector('input[type=checkbox][disabled]')?.closest('p')?.remove();
  const exportOptions=document.createElement('div');exportOptions.id='v69exportOptions';
  exportOptions.innerHTML='<label for="v69background">背景</label><select id="v69background"><option value="solid">単色</option><option value="transparent">透過（PNG連番）</option></select><label for="v69backgroundColor">背景色（#RRGGBB）</label><input id="v69backgroundColor" type="text" value="#000000" maxlength="7" autocomplete="off" spellcheck="false" aria-describedby="v69settingsStatus"><div class="baiRow"><button type="button" id="v69saveSettings">形式・背景を保存</button><button type="button" id="v69reloadSettings">保存済みを再読込</button></div><p id="v69settingsStatus" class="baiTiny" role="status"></p><p id="v69sequenceHelp" class="baiTiny" hidden>ZIPにRGBA PNG連番と別ファイルのWAVを保存します。PNGに音声は含みません。音声のない作品は無音WAVです。PNG＋WAV・ZIPは各2GiB以内です。</p>';
  format.parentNode.insertBefore(exportOptions,format.nextSibling);
  let exportSaved=null,exportBusy=false;
  const choice=()=>({preset:format.value,background:{kind:$('v69background').value,color:$('v69backgroundColor').value.toLowerCase()}});
  const dirty=()=>!exportSaved||JSON.stringify(choice())!==JSON.stringify({preset:exportSaved.preset,background:exportSaved.background});
  const invalidChoice=()=>!/^#[0-9a-f]{6}$/i.test($('v69backgroundColor').value)?'背景色を#RRGGBBで入力してください。':format.value==='mp4_h264_aac'&&$('v69background').value==='transparent'?'MP4は透過できません。単色背景を選んで保存するか、PNG連番を選んでください。':null;
  function settingsChanged(){
    const bad=invalidChoice();
    $('v69backgroundColor').disabled=exportBusy;
    format.disabled=exportBusy;$('v69background').disabled=exportBusy;
    $('v69backgroundColor').setAttribute('aria-invalid',String(Boolean(bad&&bad.includes('#RRGGBB'))));
    $('v69sequenceHelp').hidden=format.value!=='png_rgba_zip';
    $('v69settingsStatus').textContent=bad||(dirty()?'変更あり・未保存。形式・背景を保存してから書き出してください。':'形式・背景：保存済み');
    $('v69saveSettings').disabled=exportBusy||!exportSaved||exportSaved.project_id!==activeProject()||!dirty()||Boolean(bad);
    $('v69reloadSettings').disabled=exportBusy;
    button.disabled=exportBusy||dirty()||Boolean(bad)||!context||Boolean(context.reason)||Boolean(context.running);
    button.textContent=format.value==='png_rgba_zip'?'PNG連番＋WAVを書き出す':'実MP4を書き出す';
  }
  function applySettings(d){exportSaved=d;format.value=d.preset;$('v69background').value=d.background.kind;$('v69backgroundColor').value=d.background.color;settingsChanged();}
  function returnSettingsFocus(pid,trigger){if(pid===activeProject()&&(document.activeElement===trigger||document.activeElement===document.body))format.focus();}
  async function reloadSettings(){const pid=activeProject(),trigger=$('v69reloadSettings');exportBusy=true;settingsChanged();let error=null;try{const d=await get('/api/studio/v05/render/settings?project_id='+encodeURIComponent(pid));if(pid===activeProject())applySettings(d);}catch(e){error=e.message;}finally{exportBusy=false;settingsChanged();if(error&&pid===activeProject())$('v69settingsStatus').textContent=error+' 「保存済みを再読込」で再試行してください。';returnSettingsFocus(pid,trigger);}}
  for(const el of [format,$('v69background'),$('v69backgroundColor')])el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{settingsChanged();void previewName();});
  $('v69reloadSettings').addEventListener('click',()=>void reloadSettings());
  $('v69saveSettings').addEventListener('click',async()=>{
    if(!exportSaved||exportSaved.project_id!==activeProject()||invalidChoice()||exportBusy)return;
    const pid=activeProject(),body={project_id:pid,revision:exportSaved.revision,...choice()};
    exportBusy=true;settingsChanged();
    try{const res=await fetch('/api/studio/v05/render/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await res.json();if(!res.ok)throw Error(d.error||'設定を保存できません');if(pid===activeProject()){exportSaved=d;exportBusy=false;await refresh();}}
    catch(e){if(pid===activeProject())$('v69settingsStatus').textContent=e.message+' 「保存済みを再読込」で確認してください。';}
    finally{exportBusy=false;if(pid===activeProject()){const message=$('v69settingsStatus').textContent;settingsChanged();if(message.includes('再読込'))$('v69settingsStatus').textContent=message;returnSettingsFocus(pid,$('v69saveSettings'));}}
  });
  window.addEventListener('beforeunload',event=>{if(exportSaved&&dirty()){event.preventDefault();event.returnValue='';}});

  $('v69status').insertAdjacentHTML('beforebegin', '<p id="v69audioQuality" class="baiTiny"></p>');
  const activeProject = () => $('v06project')?.value || '';
  const downloadName = job => {
    const filename = job.download_name || `BAI-${job.project_id}-${job.id.slice(0, 8)}${job.preset==='png_rgba_zip'?'.zip':'.mp4'}`;
    return job.delivery_state === 'archived' ? filename.replace(/(\.mp4|\.zip)$/i, `-旧版-${job.id.slice(0, 8)}$1`) : filename;
  };
  const sizeLabel = bytes => Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : '容量不明';
  const dateLabel = value => Number.isFinite(value) ? new Date(value * 1000).toLocaleString('ja-JP') : '日時不明';
  function syncHistoryProject() {
    const source = $('v06project');
    $('v69historyProject').replaceChildren(...[...source.options].map(option => option.cloneNode(true)));
    $('v69historyProject').value = source.value;
  }
  $('v69historyProject').addEventListener('change', () => {
    $('v06project').value = $('v69historyProject').value;
    $('v06project').dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('v69refreshHistory').addEventListener('click', () => { void jobs(activeProject()); });
  const status = text => { $('v69status').textContent = text; };
  const hint = value => { button.dataset.i18nOriginalTitle = value; button.title = value; };
  const get = async url => {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  async function previewName() {
    const projectId = activeProject(), name = nameInput.value.trim(), requestedPreset=format.value;
    if (!projectId || !name) { nameHint.textContent = '完成物の名前を入力してください。'; return null; }
    try {
      const info = await get(`/api/studio/v05/render/name?project_id=${encodeURIComponent(projectId)}&name=${encodeURIComponent(name)}&preset=${encodeURIComponent(format.value)}`);
      if (projectId !== activeProject() || name !== nameInput.value.trim() || requestedPreset!==format.value) return null;
      nameMode.options[1].disabled = !info.exists;
      if (!info.exists) nameMode.value = 'version';
      nameHint.textContent = info.exists
        ? `同名の完成物があります。新しい版名の候補: ${info.suggested_name}。置換した場合も旧版を復元できます。`
        : `保存名: ${info.requested_name}`;
      return info;
    } catch (error) { nameHint.textContent = `名前を確認できません: ${error.message}`; return null; }
  }
  nameInput.addEventListener('change', () => { void previewName(); });
  nameMode.addEventListener('change', () => { void previewName(); });
  function showVideo(job, manual = false) {
    if (!job || job.status !== 'succeeded' || job.file_available === false || job.project_id !== activeProject()) return;
    const url = `/api/studio/v05/render/file?id=${encodeURIComponent(job.id)}`;
    sample.hidden = true;
    let video = preview.querySelector('#v69video');
    if (!video) {
      video = document.createElement('video');
      video.id = 'v69video';
      video.controls = true;
      video.preload = 'metadata';
      video.addEventListener('error',()=>status('完成動画を読み込めません。別の完成版を選ぶか、保存先を確認して一覧を更新してください。'));
      preview.prepend(video);
    }
    const isSequence=job.preset==='png_rgba_zip';
    let png=preview.querySelector('#v69pngPreview');
    if(!png){png=document.createElement('img');png.id='v69pngPreview';png.alt='PNG連番の先頭フレーム。透過部分は格子で表示';png.width=1280;png.height=720;preview.prepend(png);}
    png.hidden=!isSequence;preview.classList.toggle('v69alphaPreview',isSequence);
    if(isSequence)png.src=`/api/studio/v05/render/preview?id=${encodeURIComponent(job.id)}`;else png.removeAttribute('src');
    video.pause();
    if(isSequence){video.removeAttribute('src');video.load();}else video.src=url;
    video.dataset.jobId = job.id;
    video.hidden = isSequence;
    if (manual) selectedJobId = job.id;
    $('v69download').href = url;
    $('v69download').download = downloadName(job);
    $('v69download').textContent=isSequence?'PNG連番とWAVのZIPを取得':'動画をダウンロード';
    result.querySelector('strong').textContent = downloadName(job);
    $('v69resultInfo').textContent = `${job.probe?.width || '?'}×${job.probe?.height || '?'} / ${job.probe?.frames || '?'}F / ${job.bytes || 0} bytes${isSequence ? ' / RGBA・straight / 別WAV 48kHz・24bit' : ''}${!isSequence&&Number.isInteger(job.audio_bitrate) && job.audio_bitrate > 0 ? ` / AAC ${job.audio_bitrate / 1000} kb/s` : ''}`;
    result.hidden = false;
  }
  function clearVideo() {
    selectedJobId = null;
    sample.hidden = false;
    const video = preview.querySelector('#v69video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    result.hidden = true;
    const png=preview.querySelector('#v69pngPreview');if(png){png.hidden=true;png.removeAttribute('src');}preview.classList.remove('v69alphaPreview');
  }
  function renderJobs(items, completed) {
    queue.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = `完成したファイル（${completed.total}件）`;
    queue.append(heading);
    if(completed.unreadable_count){
      const warning=document.createElement('p');warning.className='baiTiny';warning.id='v69historyWarning';
      warning.textContent='一部の書き出し履歴を読み込めません。保存先の空き容量や権限を確認して「一覧を更新」してください。読み込めた完成動画は受け取れます。';
      queue.append(warning);
    }
    const finished = document.createElement('div');
    finished.id = 'v69completed';
    queue.append(finished);
    if (!completed.jobs.length) {
      const empty = document.createElement('span');
      empty.className = 'baiTiny';
      empty.textContent = 'この作品には完成したファイルがありません。書き出しが終わるとここに表示されます。';
      finished.append(empty);
    }
    const attempts = document.createElement('details');
    attempts.id = 'v69attempts';
    const attemptHeading = document.createElement('summary');
    attemptHeading.textContent = '処理中・失敗した履歴（最新20件まで）';
    attempts.append(attemptHeading);
    const pending = items.filter(job => job.status !== 'succeeded');
    attempts.open = pending.some(job => ['queued', 'running'].includes(job.status)) || ['failed','interrupted'].includes(pending[0]?.status);
    if (pending.length) queue.append(attempts);
    const states = { succeeded: '完成', queued: '順番待ち', running: '書き出し中', failed: '失敗', interrupted: '中断' };
    for (const job of [...completed.jobs, ...pending]) {
      const row = document.createElement('div');
      row.className = 'v69job';
      row.dataset.jobId = job.id;
      row.dataset.status = job.status;
      const label = document.createElement('span');
      label.className = 'v69filename';
      label.textContent = `${job.preset==='png_rgba_zip'?'[PNG＋WAV] ':''}${job.download_name || job.id.slice(0, 8)}${job.delivery_state === 'archived' ? '（旧版）' : ''}`;
      row.append(label);
      const info = document.createElement('span');
      info.className = 'baiTiny';
      info.textContent = job.status === 'succeeded'
        ? `${dateLabel(job.completed_at || job.created_at)} / ${sizeLabel(job.bytes)} / ${job.probe?.width || '?'}×${job.probe?.height || '?'}`
        : `${states[job.status] || job.status} / ${job.progress_percent || 0}%`;
      row.append(info);
      if (job.audio_settings) {
        const audio = document.createElement('small');
        const names = { audio: '音声', music: '楽曲', video: '動画内音声' };
        audio.textContent = `開始時の音声ミュート: ${job.audio_settings.muted_tracks.map(t => names[t] || t).join('・') || 'なし'}`;
        row.append(audio);
      }
      if (job.status === 'succeeded') {
        if (job.file_available === false) {
          const missing = document.createElement('small');
          missing.textContent = '完成ファイルが見つからないか、容量が変わっています。';
          row.append(missing);
          finished.append(row);
          continue;
        }
        const actions = document.createElement('div');
        actions.className = 'v69rowActions';
        row.append(actions);
        const download = document.createElement('a');
        download.className = 'v69download';
        download.dataset.action = 'download';
        download.href = `/api/studio/v05/render/file?id=${encodeURIComponent(job.id)}`;
        download.download = downloadName(job);
        download.textContent = 'ダウンロード';
        download.setAttribute('aria-label', `${downloadName(job)}をダウンロード`);
        actions.append(download);
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = job.preset==='png_rgba_zip'?'先頭PNGを確認':'完成映像を確認';
        open.addEventListener('click', () => showVideo(job, true));
        actions.append(open);
        if (job.delivery_state === 'archived') {
          const restoreButton = document.createElement('button');
          restoreButton.type = 'button';
          restoreButton.textContent = 'この旧版を復元';
          restoreButton.addEventListener('click', async () => {
            restoreButton.disabled = true;
            try {
              const info = await get(`/api/studio/v05/render/name?project_id=${encodeURIComponent(job.project_id)}&name=${encodeURIComponent(job.download_name)}`);
              if (!window.confirm(`${job.download_name} の旧版 ${job.id.slice(0, 8)} を現行版へ復元しますか？ 現行版も旧版として残ります。`)) return;
              const response = await fetch('/api/studio/v05/render/restore', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: job.project_id, name: job.download_name,
                  job_id: job.id, revision: info.revision, current_job_id: info.current_job_id }),
              });
              const restored = await response.json();
              if (!response.ok) throw Error(restored.error || `HTTP ${response.status}`);
              status(`${restored.name} の旧版を復元しました。`);
              await jobs(job.project_id);
              void previewName();
            } catch (error) { status(`旧版を復元できません: ${error.message}`); }
            finally { restoreButton.disabled = false; }
          });
          actions.append(restoreButton);
        }
      }
      if (job.error) {
        const error = document.createElement('small');
        error.textContent = job.error;
        row.append(error);
      }
      if(job.delivery_error){const warning=document.createElement('small');warning.textContent=job.delivery_error;row.append(warning);}
      (job.status === 'succeeded' ? finished : attempts).append(row);
    }
    const pager = document.createElement('div');
    pager.className = 'v69historyPager';
    for (const [text, offset, disabled] of [
      ['前の20件', Math.max(0, completedOffset - 20), completedOffset === 0],
      ['次の20件', completedOffset + 20, !completed.has_more],
    ]) {
      const pageButton = document.createElement('button');
      pageButton.type = 'button'; pageButton.textContent = text; pageButton.disabled = disabled;
      pageButton.addEventListener('click', () => { completedOffset = offset; void jobs(activeProject()); });
      pager.append(pageButton);
    }
    const count = document.createElement('span');
    count.textContent = completed.total ? `${completedOffset + 1}〜${completedOffset + completed.jobs.length} / ${completed.total}件` : '0件';
    pager.append(count);
    if (completed.total > 20) finished.append(pager);
    const newest = completed.jobs.find(job => job.file_available !== false);
    const selected = selectedJobId && completed.jobs.find(job => job.id === selectedJobId && job.file_available !== false);
    const wanted = selected || newest;
    if (wanted && preview.querySelector('#v69video')?.dataset.jobId !== wanted.id) showVideo(wanted);
  }
  async function jobs(projectId) {
    if (!projectId) return [];
    if (historyProjectId !== projectId) { historyProjectId = projectId; completedOffset = 0; }
    const seq = ++historySeq, offset = completedOffset;
    try {
      const url = `/api/studio/v05/render/jobs?project_id=${encodeURIComponent(projectId)}`;
      const [data, completed] = await Promise.all([get(url), get(`${url}&completed=1&offset=${offset}`)]);
      if (activeProject() === projectId && seq === historySeq) renderJobs(data.jobs, completed);
      return data.jobs;
    } catch (error) {
      if (activeProject() === projectId && seq === historySeq) queue.textContent = `一覧を読み込めません: ${error.message}。「一覧を更新」で再試行してください。`;
      return [];
    }
  }
  function stopPolling() { if (timer) { clearInterval(timer); timer = 0; } }
  function watch(jobId, projectId) {
    stopPolling();
    timer = setInterval(async () => {
      try {
        const job = await get(`/api/studio/v05/render/jobs?id=${encodeURIComponent(jobId)}`);
        if (projectId !== activeProject()) { stopPolling(); return; }
        const message=job.status === 'running' || job.status === 'queued'
          ? `${job.phase === 'capturing_3d' ? '3Dフレームを実描画中' : job.preset==='png_rgba_zip'?'PNG連番とWAVを生成・検品中':'実MP4を生成中'}: ${job.progress_percent || 0}%` :
            job.status === 'succeeded' ? (job.preset==='png_rgba_zip'?'PNG連番とWAVを完成・再読込しました。ZIPを受け取れます。':'実MP4を完成・再読込しました。') : `書き出し失敗: ${job.error || job.status}`;
        await jobs(projectId);
        if(projectId!==activeProject())return;
        status(message);
        if (!['queued', 'running'].includes(job.status)) {
          stopPolling();
          void previewName();
          if (context?.projectId === projectId) {
            context.running=false;settingsChanged();
            hint('保存済み作品の範囲から選択形式の別名ファイルを生成します');
          }
        }
      } catch (error) { status(`書き出し状況を取得できません: ${error.message}`); stopPolling(); }
    }, 1000);
  }
  async function refresh() {
    const seq = ++requestSeq;
    const projectId = activeProject();
    syncHistoryProject();
    context = null;
    if(exportSaved?.project_id!==projectId){exportSaved=null;settingsChanged();}
    button.disabled = true;
    hint('書き出し条件を確認中');
    clearVideo();
    stopPolling();
    if (!projectId) { status('作品を選択してください。'); hint('作品を選択してください'); queue.textContent = '作品を選択してください。'; return; }
    // Existing completed files remain usable even if new render preparation fails.
    const history = jobs(projectId);
    if (nameProjectId !== projectId) {
      nameProjectId = projectId;
      const projectLabel = $('v06project')?.selectedOptions?.[0]?.textContent?.trim() || projectId;
      nameInput.value = `BAI-${projectLabel.replace(/[\\/<>:"|?*]/g, '-')}`.slice(0, 80);
      nameMode.value = 'version';
    }
    void previewName();
    status('保存済み作品とencoderを確認中…');
    try {
      const encoded = encodeURIComponent(projectId);
      const [caps, range, arrangement, scene, motion, exportConfig] = await Promise.all([
        get('/api/studio/v05/render/capabilities'),
        get(`/api/studio/v05/timeline/range?id=${encoded}`),
        get(`/api/studio/v05/arrangement?id=${encoded}`),
        get(`/api/studio/v05/scene/instances?id=${encoded}`),
        get(`/api/studio/v05/scene/multi-motion-plan?id=${encoded}`),
        get(`/api/studio/v05/render/settings?project_id=${encoded}`),
      ]);
      if (seq !== requestSeq || projectId !== activeProject()) return;
      if(exportSaved?.project_id!==projectId||!dirty())applySettings(exportConfig);
      $('v69audioQuality').textContent = Number.isInteger(caps.audio_bitrate) && caps.audio_bitrate > 0
        ? `音声: AAC ${caps.audio_bitrate / 1000} kb/s`
        : '';
      if(exportConfig.preset==='png_rgba_zip')$('v69audioQuality').textContent='別WAV：48kHz・24bit PCM（PNGに音声は含みません）';
      const hasScene = scene.instances.some(instance => instance.visible);
      context = { projectId, range, arrangement, sceneRevision: hasScene ? scene.revision : null };
      const selectedFps = [...fpsSelect.options].find(option => option.textContent.trim().startsWith(String(range.fps)));
      if (selectedFps) fpsSelect.value = selectedFps.value;
      else {
        let custom = fpsSelect.querySelector('[data-project-fps]');
        if (!custom) { custom = document.createElement('option'); custom.dataset.projectFps = 'true'; fpsSelect.prepend(custom); }
        custom.value = String(range.fps); custom.textContent = `${range.fps} fps（作品設定）`; fpsSelect.value = custom.value;
      }
      const allowed = hasScene ? ['image', 'video', 'audio', 'music', 'motion', 'model', 'camera', 'expression', 'lip'] : ['image', 'video', 'audio', 'music'];
      const unsupported = arrangement.clips.find(clip => !allowed.includes(clip.category));
      const unreadyMotion = hasScene && [...motion.rows,...(scene.timeline_effects||[])].find(row => row.status !== 'ready');
      if (hasScene && resolution.value !== '720p') resolution.value = '720p';
      for (const option of resolution.options) if (option.value === '1080p') option.disabled = hasScene;
      const reason = (exportConfig.preset==='png_rgba_zip' ? !caps.png_available : !caps.mp4_available) ? (exportConfig.preset==='png_rgba_zip'?caps.png_reason:caps.reason) : !range.valid ? range.error :
        !range.has_clips ? '保存済みクリップがありません' :
          hasScene && !caps.scene_capture_available ? '3D書き出し用のChrome/Edge・Node.js・Playwright・Three.js・FFV1の環境を確認してください' :
          hasScene && scene.instances.some(instance => !instance.available) ? '登録済み3Dモデルの原本が見つかりません' :
          hasScene && range.frame_count > caps.max_scene_frames ? `3Dを含む限定MP4は${caps.max_scene_frames}フレーム以内です。In/Outを短くしてください` :
          unreadyMotion ? `${unreadyMotion.name} の3D動作は未割当または読込不能です` :
          range.frame_count / range.fps > caps.max_duration_seconds ? 'このプリセットは10分以内の範囲に対応します' :
            unsupported ? `${unsupported.name} は実MP4へ未接続です。欠落を避けるため書き出せません` : null;
      if (reason) status(reason);
      else if(exportConfig.preset==='png_rgba_zip')status(`RGBA PNG連番＋別WAV、${range.fps} fps、F${range.range_start_frame}〜${range.range_end_exclusive-1}をZIPで書き出せます。`);
      else status(`MP4 / H.264 + AAC、${range.fps} fps、F${range.range_start_frame}〜${range.range_end_exclusive - 1}${hasScene ? '、3D実描画720p・'+(scene.camera?'保存済みカメラ':'自動配置カメラ') : ''}を別名で書き出せます。`);
      button.disabled = Boolean(reason);
      context.reason=reason;settingsChanged();
      hint(reason || '保存済み作品の範囲から選択形式の別名ファイルを生成します');
      const recent = await history;
      const active = recent.find(job => ['queued', 'running'].includes(job.status));
      if (active) { context.running=true;button.disabled = true; hint('この作品を書き出し中'); watch(active.id, projectId); }
    } catch (error) {
      if (seq === requestSeq) { status(`書き出し準備に失敗: ${error.message}`); hint('書き出し条件を取得できません'); }
    }
  }
  button.addEventListener('click', async () => {
    if (!context || button.disabled || dirty() || invalidChoice() || context.projectId !== activeProject()) return;
    button.disabled = true;
    hint('書き出しジョブを作成中');
    selectedJobId = null;
    const submitted=structuredClone(context),savedChoice=structuredClone(exportSaved),submittedResolution=resolution.value;
    status('保存済み範囲の書き出しジョブを作成中…');
    let created = false;
    try {
      const nameInfo = await previewName();
      if (!nameInfo) throw Error('完成物の名前を確認してください');
      if(context?.projectId!==submitted.projectId||exportSaved?.revision!==savedChoice.revision||dirty())throw Error('作品または設定が変わりました。確認して書き出し直してください。');
      const replacing = nameMode.value === 'replace' && nameInfo.exists;
      if (replacing && !window.confirm(`${nameInfo.requested_name} を置換しますか？ 現行完成物は旧版として保存し、あとから復元できます。`)) {
        status('置換を取りやめました。');
        return;
      }
      const response = await fetch('/api/studio/v05/render/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: submitted.projectId, range_revision: submitted.range.revision,
          arrangement_revision: submitted.arrangement.revision, resolution: submittedResolution,
          preset:savedChoice.preset,settings_revision:savedChoice.revision,
          name: nameInfo.requested_name, collision_mode: replacing ? 'replace' : 'version',
          ...(replacing ? { replace_job_id: nameInfo.current_job_id } : {}),
          ...(submitted.sceneRevision === null ? {} : { scene_revision: submitted.sceneRevision }) }),
      });
      const job = await response.json();
      if (!response.ok) throw Error(job.error || `HTTP ${response.status}`);
      created = true;
      if(activeProject()!==submitted.projectId)return;
      status(savedChoice.preset==='png_rgba_zip'?'PNG連番とWAVの書き出しを開始しました。':'実MP4の書き出しを開始しました。');
      context.running=true;settingsChanged();
      await jobs(submitted.projectId);
      watch(job.id, submitted.projectId);
    } catch (error) { if(activeProject()===submitted.projectId)status(`ジョブを作成できません: ${error.message}`); }
    finally { if (!created && context?.projectId === activeProject()) {
      settingsChanged();
      hint('保存済み作品の範囲から選択形式の別名ファイルを生成します');
    } }
  });
  const observer = new MutationObserver(() => { if (page.classList.contains('active')) void refresh(); });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('bai:v05-arrangement-loaded', () => { if (page.classList.contains('active')) void refresh(); });
  window.addEventListener('bai:v05-project-changed', () => { if (page.classList.contains('active')) void refresh(); });
  window.addEventListener('bai:v58-camera-saved', () => { if (page.classList.contains('active')) void refresh(); });
  window.addEventListener('pagehide', stopPolling, { once: true });
  if (page.classList.contains('active')) void refresh();
})();
