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
  settings.insertAdjacentHTML('beforeend', '<p id="v69status" role="status" class="baiTiny">作品の書き出し条件を確認中…</p><p class="baiTiny">画像・動画・独立音声は10分以内。保存済み3Dシーンと適用済み動作を含む作品は720p・300フレーム以内の実描画に対応し、3Dカメラは自動配置です。編集画面の手動カメラ操作・字幕・動画内音声などの未接続内容は出力へ反映されません。保存済みの未対応クリップは欠落を避けるため拒否します。</p>');
  const result = document.createElement('div');
  result.id = 'v69result';
  result.hidden = true;
  result.innerHTML = '<strong>完成MP4</strong><div class="v69resultActions"><a id="v69download" download>MP4を保存</a><span id="v69resultInfo"></span></div>';
  page.querySelector('.baiPreview').after(result);
  const preview = page.querySelector('.baiPreview');
  const sample = preview.querySelector('img');
  const $ = id => document.getElementById(id);
  let context = null, requestSeq = 0, timer = 0, selectedJobId = null;
  const activeProject = () => $('v06project')?.value || '';
  const status = text => { $('v69status').textContent = text; };
  const get = async url => {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  function showVideo(job, manual = false) {
    if (!job || job.status !== 'succeeded' || job.project_id !== activeProject()) return;
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
    $('v69download').download = `BAI-${job.project_id}-${job.id.slice(0, 8)}.mp4`;
    $('v69resultInfo').textContent = `${job.probe?.width || '?'}×${job.probe?.height || '?'} / ${job.probe?.frames || '?'}F / ${job.bytes || 0} bytes`;
    result.hidden = false;
  }
  function clearVideo() {
    selectedJobId = null;
    sample.hidden = false;
    const video = preview.querySelector('#v69video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    result.hidden = true;
  }
  function renderJobs(items) {
    queue.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'baiTiny';
      empty.textContent = 'この作品のMP4書き出し履歴はありません。';
      queue.append(empty);
      return;
    }
    for (const job of items) {
      const row = document.createElement('div');
      row.className = 'v69job';
      const label = document.createElement('span');
      label.textContent = `${job.id.slice(0, 8)} / ${job.status} / ${job.progress_percent || 0}% / F${job.range_start_frame}〜${job.range_end_exclusive - 1}`;
      row.append(label);
      if (job.status === 'succeeded') {
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = '完成映像を確認';
        open.addEventListener('click', () => showVideo(job, true));
        row.append(open);
      }
      if (job.error) {
        const error = document.createElement('small');
        error.textContent = job.error;
        row.append(error);
      }
      queue.append(row);
    }
    const newest = items.find(job => job.status === 'succeeded');
    const selected = selectedJobId && items.find(job => job.id === selectedJobId && job.status === 'succeeded');
    const wanted = selected || newest;
    if (wanted && preview.querySelector('#v69video')?.dataset.jobId !== wanted.id) showVideo(wanted);
  }
  async function jobs(projectId) {
    const data = await get(`/api/studio/v05/render/jobs?project_id=${encodeURIComponent(projectId)}`);
    if (activeProject() === projectId) renderJobs(data.jobs);
    return data.jobs;
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
          if (context?.projectId === projectId) button.disabled = false;
        }
      } catch (error) { status(`書き出し状況を取得できません: ${error.message}`); stopPolling(); }
    }, 1000);
  }
  async function refresh() {
    const seq = ++requestSeq;
    const projectId = activeProject();
    context = null;
    button.disabled = true;
    clearVideo();
    stopPolling();
    if (!projectId) { status('作品を選択してください。'); queue.textContent = '作品を選択してください。'; return; }
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
          hasScene && !caps.scene_capture_available ? '3D書き出し用のChrome/Edge・Node.js・Playwright・Three.jsがありません' :
          hasScene && scene.instances.some(instance => !instance.available) ? '登録済み3Dモデルの原本が見つかりません' :
          hasScene && range.frame_count > 300 ? '3Dを含む限定MP4は300フレーム以内です。In/Outを短くしてください' :
          unreadyMotion ? `${unreadyMotion.name} の3D動作は未割当または読込不能です` :
          range.frame_count / range.fps > caps.max_duration_seconds ? 'このプリセットは10分以内の範囲に対応します' :
            unsupported ? `${unsupported.name} は実MP4へ未接続です。欠落を避けるため書き出せません` : null;
      if (reason) status(reason);
      else status(`MP4 / H.264 + AAC、${range.fps} fps、F${range.range_start_frame}〜${range.range_end_exclusive - 1}${hasScene ? '、3D実描画720p・自動配置カメラ' : ''}を別名で書き出せます。`);
      button.disabled = Boolean(reason);
      button.textContent = '実MP4を書き出す';
      const recent = await jobs(projectId);
      const active = recent.find(job => ['queued', 'running'].includes(job.status));
      if (active) { button.disabled = true; watch(active.id, projectId); }
    } catch (error) {
      if (seq === requestSeq) { status(`書き出し準備に失敗: ${error.message}`); queue.textContent = '書き出し履歴を読み込めません。'; }
    }
  }
  button.addEventListener('click', async () => {
    if (!context || button.disabled || context.projectId !== activeProject()) return;
    button.disabled = true;
    selectedJobId = null;
    status('保存済み範囲のMP4ジョブを作成中…');
    let created = false;
    try {
      const response = await fetch('/api/studio/v05/render/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: context.projectId, range_revision: context.range.revision,
          arrangement_revision: context.arrangement.revision, resolution: resolution.value,
          ...(context.sceneRevision === null ? {} : { scene_revision: context.sceneRevision }) }),
      });
      const job = await response.json();
      if (!response.ok) throw Error(job.error || `HTTP ${response.status}`);
      created = true;
      status('実MP4の書き出しを開始しました。');
      await jobs(context.projectId);
      watch(job.id, context.projectId);
    } catch (error) { status(`ジョブを作成できません: ${error.message}`); }
    finally { if (!created && context?.projectId === activeProject()) button.disabled = false; }
  });
  const observer = new MutationObserver(() => { if (page.classList.contains('active')) void refresh(); });
  observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('bai:v05-arrangement-loaded', () => { if (page.classList.contains('active')) void refresh(); });
  window.addEventListener('bai:v05-project-changed', () => { if (page.classList.contains('active')) void refresh(); });
  window.addEventListener('pagehide', stopPolling, { once: true });
  if (page.classList.contains('active')) void refresh();
})();
