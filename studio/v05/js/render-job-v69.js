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
  format.disabled = false;
  format.title = '現在は音声付きMP4 / H.264のみ実書き出しに対応';
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
  historyCard.querySelector('h2').textContent = '書き出した動画をダウンロード';
  const historyControls = document.createElement('div');
  historyControls.className = 'v69historyControls';
  historyControls.innerHTML = '<label for="v69historyProject">作品 <select id="v69historyProject"></select></label><button type="button" id="v69refreshHistory">一覧を更新</button><p class="baiTiny">完成した動画の「ダウンロード」からパソコンへ保存できます。旧版も選べます。</p>';
  queue.before(historyControls);
  const nameInput = $('v69name'), nameMode = $('v69nameMode'), nameHint = $('v69nameHint');
  $('v69status').insertAdjacentHTML('beforebegin', '<p id="v69audioQuality" class="baiTiny"></p>');
  const activeProject = () => $('v06project')?.value || '';
  const downloadName = job => {
    const filename = job.download_name || `BAI-${job.project_id}-${job.id.slice(0, 8)}.mp4`;
    return job.delivery_state === 'archived' ? filename.replace(/\.mp4$/i, `-旧版-${job.id.slice(0, 8)}.mp4`) : filename;
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
    const projectId = activeProject(), name = nameInput.value.trim();
    if (!projectId || !name) { nameHint.textContent = '完成物の名前を入力してください。'; return null; }
    try {
      const info = await get(`/api/studio/v05/render/name?project_id=${encodeURIComponent(projectId)}&name=${encodeURIComponent(name)}`);
      if (projectId !== activeProject() || name !== nameInput.value.trim()) return null;
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
      preview.prepend(video);
    }
    video.src = url;
    video.dataset.jobId = job.id;
    video.hidden = false;
    if (manual) selectedJobId = job.id;
    $('v69download').href = url;
    $('v69download').download = downloadName(job);
    result.querySelector('strong').textContent = downloadName(job);
    $('v69resultInfo').textContent = `${job.probe?.width || '?'}×${job.probe?.height || '?'} / ${job.probe?.frames || '?'}F / ${job.bytes || 0} bytes${Number.isInteger(job.audio_bitrate) && job.audio_bitrate > 0 ? ` / AAC ${job.audio_bitrate / 1000} kb/s` : ''}`;
    result.hidden = false;
  }
  function clearVideo() {
    selectedJobId = null;
    sample.hidden = false;
    const video = preview.querySelector('#v69video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    result.hidden = true;
  }
  function renderJobs(items, completed) {
    queue.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = `完成した動画（${completed.total}件）`;
    queue.append(heading);
    const finished = document.createElement('div');
    finished.id = 'v69completed';
    queue.append(finished);
    if (!completed.jobs.length) {
      const empty = document.createElement('span');
      empty.className = 'baiTiny';
      empty.textContent = 'この作品には完成した動画がありません。書き出しが終わるとここに表示されます。';
      finished.append(empty);
    }
    const attempts = document.createElement('details');
    attempts.id = 'v69attempts';
    const attemptHeading = document.createElement('summary');
    attemptHeading.textContent = '処理中・失敗した履歴（最新20件まで）';
    attempts.append(attemptHeading);
    const pending = items.filter(job => job.status !== 'succeeded');
    attempts.open = pending.some(job => ['queued', 'running'].includes(job.status));
    if (pending.length) queue.append(attempts);
    const states = { succeeded: '完成', queued: '順番待ち', running: '書き出し中', failed: '失敗', interrupted: '中断' };
    for (const job of [...completed.jobs, ...pending]) {
      const row = document.createElement('div');
      row.className = 'v69job';
      row.dataset.jobId = job.id;
      row.dataset.status = job.status;
      const label = document.createElement('span');
      label.className = 'v69filename';
      label.textContent = `${job.download_name || job.id.slice(0, 8)}${job.delivery_state === 'archived' ? '（旧版）' : ''}`;
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
        open.textContent = '完成映像を確認';
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
        status(job.status === 'running' || job.status === 'queued'
          ? `${job.phase === 'capturing_3d' ? '3Dフレームを実描画中' : '実MP4を生成中'}: ${job.progress_percent || 0}%` :
            job.status === 'succeeded' ? '実MP4を完成・再読込しました。' : `書き出し失敗: ${job.error || job.status}`);
        await jobs(projectId);
        if (!['queued', 'running'].includes(job.status)) {
          stopPolling();
          void previewName();
          if (context?.projectId === projectId) {
            button.disabled = false;
            hint('保存済み作品の範囲から別名MP4を生成します');
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
      const [caps, range, arrangement, scene, motion] = await Promise.all([
        get('/api/studio/v05/render/capabilities'),
        get(`/api/studio/v05/timeline/range?id=${encoded}`),
        get(`/api/studio/v05/arrangement?id=${encoded}`),
        get(`/api/studio/v05/scene/instances?id=${encoded}`),
        get(`/api/studio/v05/scene/multi-motion-plan?id=${encoded}`),
      ]);
      if (seq !== requestSeq || projectId !== activeProject()) return;
      $('v69audioQuality').textContent = Number.isInteger(caps.audio_bitrate) && caps.audio_bitrate > 0
        ? `音声: AAC ${caps.audio_bitrate / 1000} kb/s。入力音量を保って圧縮します。320 kb/sの出力は従来の192 kb/sより音声の容量が増えます。以前の完成物は保持します。`
        : '';
      const hasScene = scene.instances.some(instance => instance.visible);
      context = { projectId, range, arrangement, sceneRevision: hasScene ? scene.revision : null };
      const selectedFps = [...fpsSelect.options].find(option => option.textContent.trim().startsWith(String(range.fps)));
      if (selectedFps) fpsSelect.value = selectedFps.value;
      else {
        let custom = fpsSelect.querySelector('[data-project-fps]');
        if (!custom) { custom = document.createElement('option'); custom.dataset.projectFps = 'true'; fpsSelect.prepend(custom); }
        custom.value = String(range.fps); custom.textContent = `${range.fps} fps（作品設定）`; fpsSelect.value = custom.value;
      }
      const allowed = hasScene ? ['image', 'video', 'audio', 'music', 'motion'] : ['image', 'video', 'audio', 'music'];
      const unsupported = arrangement.clips.find(clip => !allowed.includes(clip.category));
      const unreadyMotion = hasScene && motion.rows.find(row => row.status !== 'ready');
      if (hasScene && resolution.value !== '720p') resolution.value = '720p';
      for (const option of resolution.options) if (option.value === '1080p') option.disabled = hasScene;
      const reason = !caps.available ? caps.reason : !range.valid ? range.error :
        !range.has_clips ? '保存済みクリップがありません' :
          hasScene && !caps.scene_capture_available ? '3D書き出し用のChrome/Edge・Node.js・Playwright・Three.js・FFV1の環境を確認してください' :
          hasScene && scene.instances.some(instance => !instance.available) ? '登録済み3Dモデルの原本が見つかりません' :
          hasScene && range.frame_count > caps.max_scene_frames ? `3Dを含む限定MP4は${caps.max_scene_frames}フレーム以内です。In/Outを短くしてください` :
          unreadyMotion ? `${unreadyMotion.name} の3D動作は未割当または読込不能です` :
          range.frame_count / range.fps > caps.max_duration_seconds ? 'このプリセットは10分以内の範囲に対応します' :
            unsupported ? `${unsupported.name} は実MP4へ未接続です。欠落を避けるため書き出せません` : null;
      if (reason) status(reason);
      else status(`MP4 / H.264 + AAC、${range.fps} fps、F${range.range_start_frame}〜${range.range_end_exclusive - 1}${hasScene ? '、3D実描画720p・'+(scene.camera?'保存済みカメラ':'自動配置カメラ') : ''}を別名で書き出せます。`);
      button.disabled = Boolean(reason);
      button.textContent = '実MP4を書き出す';
      hint(reason || '保存済み作品の範囲から別名MP4を生成します');
      const recent = await history;
      const active = recent.find(job => ['queued', 'running'].includes(job.status));
      if (active) { button.disabled = true; hint('この作品のMP4を書き出し中'); watch(active.id, projectId); }
    } catch (error) {
      if (seq === requestSeq) { status(`書き出し準備に失敗: ${error.message}`); hint('書き出し条件を取得できません'); }
    }
  }
  button.addEventListener('click', async () => {
    if (!context || button.disabled || context.projectId !== activeProject()) return;
    button.disabled = true;
    hint('MP4ジョブを作成中');
    selectedJobId = null;
    status('保存済み範囲のMP4ジョブを作成中…');
    let created = false;
    try {
      const nameInfo = await previewName();
      if (!nameInfo) throw Error('完成物の名前を確認してください');
      const replacing = nameMode.value === 'replace' && nameInfo.exists;
      if (replacing && !window.confirm(`${nameInfo.requested_name} を置換しますか？ 現行完成物は旧版として保存し、あとから復元できます。`)) {
        status('置換を取りやめました。');
        return;
      }
      const response = await fetch('/api/studio/v05/render/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: context.projectId, range_revision: context.range.revision,
          arrangement_revision: context.arrangement.revision, resolution: resolution.value,
          name: nameInfo.requested_name, collision_mode: replacing ? 'replace' : 'version',
          ...(replacing ? { replace_job_id: nameInfo.current_job_id } : {}),
          ...(context.sceneRevision === null ? {} : { scene_revision: context.sceneRevision }) }),
      });
      const job = await response.json();
      if (!response.ok) throw Error(job.error || `HTTP ${response.status}`);
      created = true;
      status('実MP4の書き出しを開始しました。');
      await jobs(context.projectId);
      watch(job.id, context.projectId);
    } catch (error) { status(`ジョブを作成できません: ${error.message}`); }
    finally { if (!created && context?.projectId === activeProject()) {
      button.disabled = false;
      hint('保存済み作品の範囲から別名MP4を生成します');
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
