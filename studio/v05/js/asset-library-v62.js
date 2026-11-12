/* v0.5: show the registered inventory in the visible asset library. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const grid = $('baiLibraryGrid');
  const detail = $('baiAssetDetail');
  if (!grid || !detail) return;

  const labels = {
    all: 'すべて', model: '3Dモデル・ステージ', motion: 'ダンス・動き',
    expression: '表情', lip: '口の動き', camera: 'カメラ', light: '照明',
    effect: 'エフェクト', music: '楽曲', audio: '音声', video: '動画',
    image: '画像・材質', other: 'その他',
  };
  const uploadFormats = {
    stage: ['glb'], prop: ['glb'], material: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'],
    fx: ['glb', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'],
    audio: ['wav', 'mp3', 'ogg', 'flac', 'm4a'], video: ['mp4', 'webm', 'ogv'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'],
    // Registered through model-motion-import-v188.js with the same routes as /workspace/08.
    vrm: ['vrm'], fbxModelA: ['fbx'], fbxModelB: ['fbx'], fbxMotion: ['fbx'], glbMotion: ['glb'],
  };
  const directKinds = new Set(['vrm', 'fbxModelA', 'fbxModelB', 'fbxMotion', 'glbMotion']);
  const modelImport = () => window.BAIStudioV05ModelImport || null;
  const supports3d = (item) => Boolean(modelImport()?.isModel(item) || modelImport()?.isMotion(item));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const bytes = (value) => Number.isFinite(value) ? `${(value / 1024 / 1024).toFixed(2)} MiB` : '不明';
  const encoded = (value) => encodeURIComponent(String(value));
  const safeThumbnail = (value) => typeof value === 'string' && /^\/api\/(?:assets|library-assets)\/thumbnail\//.test(value) ? value : null;

  let items = [];
  let category = 'all';
  let selectedId = null;
  let loading = false;
  let queuedRefresh = null;
  let importOpen = false;
  let loadFailed = false;
  let mediaGeneration = 0;
  let imageOutputFormats = null;
  let videoOutputFormats = null;

  function videoOutputNote(item) {
    if (item.category !== 'video') return '';
    if (!videoOutputFormats) return '<p class="baiTiny" data-video-output-status="unknown">MP4の動画対応形式を確認できません。書き出し画面で条件を確認してください。</p>';
    const format = String(item.format || item.filename?.split('.').pop() || '').toLowerCase();
    const supported = videoOutputFormats.includes(format);
    return `<p class="baiTiny" data-video-output-status="${supported ? 'supported' : 'unsupported'}">${supported ? 'MP4の対応動画形式です。映像の有無と実ファイルは配置・書き出し時に検査します。ブラウザーの再生可否はコーデックにより異なります。' : 'この動画形式はMP4書き出しに未対応です。対応形式へ別名で変換して登録してください。'} 対応形式: ${esc(videoOutputFormats.map(ext => ext.toUpperCase()).join(' / '))}</p>`;
  }

  function imageOutputNote(item) {
    if (item.category !== 'image') return '';
    if (!imageOutputFormats) return '<p class="baiTiny" data-image-output-status="unknown">MP4の画像対応形式を確認できません。書き出し画面で条件を確認してください。</p>';
    const format = String(item.format || item.filename?.split('.').pop() || '').toLowerCase();
    const supported = imageOutputFormats.includes(format);
    return `<p class="baiTiny" data-image-output-status="${supported ? 'supported' : 'unsupported'}">${supported ? 'MP4の対応画像形式です。実ファイルは書き出し時にも検査します。' : 'この画像形式はMP4書き出しに未対応です。対応形式へ別名で変換して登録してください。'} 対応形式: ${esc(imageOutputFormats.map(ext => ext.toUpperCase()).join(' / '))}</p>`;
  }

  function pauseDetailMedia(release = false) {
    if (release) mediaGeneration++;
    detail.querySelectorAll('video,audio').forEach((media) => {
      media.pause();
      if (release) {
        media.onerror = null; media.onloadeddata = null;
        media.removeAttribute('src'); media.load();
      }
    });
  }

  function watchDetailMedia() {
    const media = detail.querySelector('video,audio');
    if (!media) return;
    const generation = mediaGeneration;
    const note = document.createElement('p');
    note.className = 'baiTiny'; note.role = 'status'; note.dataset.role = 'asset-media-status';
    note.textContent = media.tagName === 'AUDIO' ? '再生ボタンで音声を確認してください。' : 'このブラウザーでの再生を確認中…';
    media.after(note);
    const fail = () => {
      if (generation !== mediaGeneration || !media.isConnected) return;
      media.pause(); media.controls = false; media.hidden = true;
      note.textContent = '登録済みですが、このブラウザーでは再生できません。対応する形式へ変換してください。';
    };
    const loaded = () => {
      if (generation !== mediaGeneration || !media.isConnected) return;
      if (media.tagName === 'VIDEO' && (!media.videoWidth || !media.videoHeight)) { fail(); return; }
      note.textContent = media.tagName === 'VIDEO' ? '映像を表示できます。再生ボタンで確認してください。' : '音声を読み込みました。';
    };
    media.onerror = fail; media.onloadeddata = loaded;
    if (media.error) fail(); else if (media.readyState >= 2) loaded();
  }

  function fileUrl(item) {
    if (!item.available) return null;
    if (item.source === 'library') return `/api/library-assets/file/${encoded(item.id)}`;
    if (item.source === 'v05source') return `/api/studio/v05/asset-source/file/${encoded(item.id)}`;
    if (item.source === 'integrated' && item.filename) return `/api/integrated-v02/asset/${encoded(item.filename)}`;
    return null;
  }

  function preview(item, compact = false) {
    const url = fileUrl(item);
    const thumb = safeThumbnail(item.thumbnailUrl);
    const format = String(item.format || '').toLowerCase();
    if (item.available && url && /^(png|jpe?g|gif|webp|avif|bmp)$/.test(format)) {
      return `<img loading="lazy" src="${esc(url)}" alt="${esc(item.name)}の画像" style="max-width:100%;max-height:${compact ? 110 : 260}px;object-fit:contain">`;
    }
    if (!compact && item.available && item.category === 'audio' && url) {
      return `<audio controls preload="none" src="${esc(url)}" style="width:100%"></audio>`;
    }
    if (!compact && item.available && item.category === 'video' && url) {
      return `<video controls preload="metadata" src="${esc(url)}" style="max-width:100%;max-height:260px"></video>`;
    }
    if (thumb) return `<img loading="lazy" src="${esc(thumb)}" alt="${esc(item.name)}の保存済み見本" style="max-width:100%;max-height:${compact ? 110 : 260}px;object-fit:contain">`;
    if (supports3d(item)) return `<div class="baiWarning" data-v188-thumb="${esc(item.id)}" data-compact="${compact ? 1 : 0}">${esc(item.format)}：見本を作成中…</div>`;
    return `<div class="baiWarning">${esc(item.format || item.category)}：保存済み見本なし</div>`;
  }

  function shownItems() {
    const query = $('baiAssetSearch').value.trim().toLocaleLowerCase();
    const order = $('baiAssetSort').value;
    return items.filter((item) => (category === 'all' || item.category === category) &&
      (!query || [item.name, item.originalName, item.format, labels[item.category]].some((value) => String(value || '').toLocaleLowerCase().includes(query))))
      .sort((a, b) => order === 'type'
        ? (labels[a.category] || a.category).localeCompare(labels[b.category] || b.category, 'ja') || a.name.localeCompare(b.name, 'ja')
        : a.name.localeCompare(b.name, 'ja'));
  }

  function renderList() {
    const shown = shownItems();
    grid.innerHTML = shown.map((item) => `<button type="button" class="baiCard clickable" data-library-id="${esc(item.id)}" style="display:block;width:100%;text-align:left" aria-pressed="${item.id === selectedId}">
      ${preview(item, true)}<b>${esc(item.name)}</b><p class="baiTiny">${esc(labels[item.category] || item.category)} / ${esc(item.format || '形式不明')}${item.available ? '' : ' / 使用不可'}</p>
    </button>`).join('') || '<p>条件に合う登録素材はありません。</p>';
    $('baiAssetCount').textContent = `${shown.length}件表示 / 登録${items.length}件`;
    $('baiAssetCatSelect').value = category;
    $('baiCats').querySelectorAll('[data-cat]').forEach((button) => button.classList.toggle('on', button.dataset.cat === category));
    watchThumbnails(grid);
  }

  // 3D samples are made one at a time, only for cards that come into view (as on /workspace/08).
  const thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { thumbObserver.unobserve(entry.target); fillThumbnail(entry.target); }
  }) : null;
  function watchThumbnails(root) {
    root.querySelectorAll('[data-v188-thumb]').forEach((node) => (thumbObserver ? thumbObserver.observe(node) : fillThumbnail(node)));
  }
  function fillThumbnail(node) {
    const item = items.find((candidate) => candidate.id === node.dataset.v188Thumb);
    if (!item || !modelImport()) return;
    void modelImport().thumbnailFor(item).then((url) => {
      if (!node.isConnected) return;
      if (!url) { node.textContent = `${item.format}：見本を作れませんでした`; return; }
      if (url.startsWith('/api/')) item.thumbnailUrl = url;
      const img = document.createElement('img');
      img.src = url;
      img.alt = `${item.name}の3D見本`;
      img.dataset.v188Sample = modelImport().isMotion(item) ? 'motion' : 'model';
      img.style.cssText = `max-width:100%;max-height:${node.dataset.compact === '1' ? 110 : 260}px;object-fit:contain`;
      node.replaceWith(img);
    });
  }

  function showDetail(item) {
    pauseDetailMedia(true);
    modelImport()?.disposeDetail();
    importOpen = false;
    selectedId = item.id;
    renderList();
    const titleSource = item.titleSource === 'metadata' ? '埋め込み情報' : item.titleSource === 'filename' ? 'ファイル名' : '登録情報';
    const media = preview(item);
    const is3d = item.category === 'model' || item.category === 'motion';
    detail.innerHTML = `<h2>登録素材の詳細</h2>${media}<h3>${esc(item.name)}</h3>
      <dl><dt>種類</dt><dd>${esc(labels[item.category] || item.category)}${item.kind ? `（${esc(item.kind)}）` : ''}</dd>
      <dt>形式</dt><dd>${esc(item.format || '不明')}</dd>
      <dt>元ファイル</dt><dd>${esc(item.originalName || item.filename || item.name)}</dd>
      <dt>容量</dt><dd>${bytes(item.bytes)}</dd>
      <dt>登録元</dt><dd>${esc(item.source || '不明')}</dd>
      <dt>表示名の出典</dt><dd>${titleSource}</dd>
      <dt>利用状態</dt><dd>${item.available ? '登録済み（元ファイルあり）' : '元ファイルが見つかりません'}</dd></dl>
      ${supports3d(item) ? '<div id="baiDetail3d"></div>' : is3d ? '<p class="baiTiny">3D回転表示と実動作はこの詳細欄へ未接続です。</p>' : ''}
      ${imageOutputNote(item)}
      ${videoOutputNote(item)}
      ${item.available ? '<button type="button" id="baiPlaceSelected">この素材をタイムラインで選ぶ</button>' : ''}
      <p class="baiTiny">原本は変更しません。配置後の実再生は素材形式ごとに確認が必要です。</p>`;
    // Keep the next step before metadata, in the initial detail viewport.
    const place = $('baiPlaceSelected');
    if (place) detail.querySelector('h2').after(place);
    if (supports3d(item)) modelImport().mountDetail($('baiDetail3d'), item, items);
    watchDetailMedia();
    detail.querySelectorAll('[data-v188-thumb]').forEach(fillThumbnail); // the selected item, not only when scrolled into view
    $('baiPlaceSelected')?.addEventListener('click', () => {
      window.baiGo?.('edit');
      window.dispatchEvent(new CustomEvent('bai:v05-asset-selected', { detail: { id: item.id } }));
    });
  }

  // showSelected=false keeps an open import form while the list behind it updates
  // (for example when the legacy screen saves a 3D/video sample in the background).
  async function refresh(preferId = selectedId, showSelected = !importOpen) {
    if (loading) {
      // Keep an explicit request (a new upload's ID) over a later background refresh.
      const waiters = queuedRefresh?.waiters || [];
      if (!queuedRefresh || !queuedRefresh.showSelected || showSelected) queuedRefresh = { preferId, showSelected, waiters };
      return new Promise((resolve) => waiters.push(resolve));
    }
    loading = true;
    grid.innerHTML = '<p>登録素材を読み込んでいます…</p>';
    try {
      const [fullResponse, inventoryResponse] = await Promise.all([
        fetch('/api/assets', { cache: 'no-store' }),
        fetch('/api/studio/v05/assets', { cache: 'no-store' }),
      ]);
      if (!fullResponse.ok || !inventoryResponse.ok) throw new Error(`HTTP ${fullResponse.status}/${inventoryResponse.status}`);
      const [full, inventory] = await Promise.all([fullResponse.json(), inventoryResponse.json()]);
      // Capability lookup must not hide an otherwise readable asset library.
      imageOutputFormats = null;
      videoOutputFormats = null;
      try {
        const response = await fetch('/api/studio/v05/assets/capabilities', { cache: 'no-store' });
        const cap = response.ok ? await response.json() : null;
        if (Array.isArray(cap?.mp4_image_formats) && cap.mp4_image_formats.length && cap.mp4_image_formats.every(ext => typeof ext === 'string' && /^[a-z0-9]+$/.test(ext))) imageOutputFormats = cap.mp4_image_formats;
        if (Array.isArray(cap?.mp4_video_formats) && cap.mp4_video_formats.length && cap.mp4_video_formats.every(ext => typeof ext === 'string' && /^[a-z0-9]+$/.test(ext))) videoOutputFormats = cap.mp4_video_formats;
      } catch (_) { /* Show unknown output support; keep the inventory usable. */ }
      if (!Array.isArray(full.items) || !Array.isArray(inventory.items)) throw new Error('素材索引の形式が不正です');
      const categories = new Map(inventory.items.map((item) => [item.id, item.category]));
      loadFailed = false;
      items = full.items.filter((item) => item && typeof item.id === 'string').map((item) => ({
        ...item, category: categories.get(item.id) || 'other',
      }));
      $('baiAssetCount').textContent = `${items.length}件の登録素材`;
      window.dispatchEvent(new CustomEvent('bai:v05-assets-loaded', { detail: { count: items.length } }));
      renderList();
      const selected = items.find((item) => item.id === preferId);
      if (!showSelected) { /* the import form stays open */ }
      else if (selected) showDetail(selected);
      else if (selectedId) { selectedId = null; pauseDetailMedia(true); detail.innerHTML = '<h2>登録素材の詳細</h2><p>一覧から素材を選んでください。</p>'; }
    } catch (error) {
      items = [];
      loadFailed = true;
      selectedId = null;
      pauseDetailMedia(true);
      grid.innerHTML = `<p role="alert">素材一覧を読み込めません。原本は保持されています。${esc(error.message)}</p>`;
      $('baiAssetCount').textContent = '取得失敗';
      detail.innerHTML = '<h2>登録素材の詳細</h2><p>一覧の取得後に表示します。</p>';
    } finally {
      loading = false;
      if (queuedRefresh) {
        const next = queuedRefresh;
        queuedRefresh = null;
        void refresh(next.preferId, next.showSelected).then(() => next.waiters.forEach((resolve) => resolve()));
      }
    }
  }

  // Overwrites and FBX model replacements are sent only after the same confirmation as /workspace/08.
  function showConfirms(confirms) {
    const box = $('baiUploadConfirm');
    if (!box) return;
    box.innerHTML = confirms.map((row, i) => `<div class="baiWarning" role="alert"><p>${esc(row.message)}</p>
      <button type="button" data-v188-ack="${i}">内容を確認して登録：${esc(row.file.name)}</button></div>`).join('');
    box.querySelectorAll('[data-v188-ack]').forEach((ack) => ack.addEventListener('click', async () => {
      const row = confirms[Number(ack.dataset.v188Ack)];
      ack.disabled = true;
      const result = await modelImport().register(row.file, row.kind, { ack: row.message });
      if (result.ok) { await refresh(result.id, true); return; }
      ack.closest('.baiWarning').querySelector('p').textContent = result.error;
      ack.disabled = false;
    }));
  }

  function showImport() {
    pauseDetailMedia(true);
    modelImport()?.disposeDetail();
    importOpen = true;
    detail.innerHTML = `<h2>素材を追加</h2>
      <label>種類 <select id="baiUploadKind">
        <option value="stage">GLBステージ</option><option value="prop">GLB小物</option>
        <option value="material">材質画像</option><option value="fx">エフェクト素材</option>
        <option value="audio">音声・楽曲</option><option value="video">動画</option><option value="image">画像</option>
        <optgroup label="3Dモデル・動作"><option value="vrm">VRMモデル</option><option value="fbxModelA">FBXモデルA（置き換え）</option>
        <option value="fbxModelB">FBXモデルB（置き換え）</option><option value="fbxMotion">FBX動作</option><option value="glbMotion">GLB動作</option></optgroup>
      </select></label>
      <label>ファイル <input id="baiUploadFiles" type="file" multiple></label>
      <p id="baiUploadAudioFormats" class="baiTiny" hidden>対応する音声形式: WAV / MP3 / OGG（Vorbis・Opus）/ FLAC / M4A（AAC）。コーデックによりブラウザーで再生できない場合があります。</p>
      <button type="button" id="baiUploadSubmit">選んだファイルを登録</button>
      <p id="baiUploadStatus" role="status">種類とファイルを選んでください。GLBステージは最大1 GiB、その他は最大400 MiBです。</p>
      <div id="baiUploadConfirm"></div>
      <p class="baiTiny">PMX ZIP・VMDの新規登録は<a href="/workspace/08" target="_blank" rel="noopener">②の素材管理</a>で行えます。FBXモデルA／Bは、同じ枠の登録済みFBXと置き換わります。</p>`;
    const kind = $('baiUploadKind');
    const files = $('baiUploadFiles');
    const button = $('baiUploadSubmit');
    const status = $('baiUploadStatus');
    kind.addEventListener('change', () => {
      files.accept = uploadFormats[kind.value].map((ext) => `.${ext}`).join(',');
      $('baiUploadAudioFormats').hidden = kind.value !== 'audio';
    });
    kind.dispatchEvent(new Event('change'));
    button.addEventListener('click', async () => {
      const chosen = Array.from(files.files || []);
      if (!chosen.length) { status.textContent = 'ファイルを選んでください。'; return; }
      button.disabled = true;
      let successes = 0;
      let latest = null;
      const errors = [];
      const confirms = [];
      for (let i = 0; i < chosen.length; i++) {
        const file = chosen[i];
        const extension = file.name.split('.').pop()?.toLowerCase();
        const limit = kind.value === 'stage' && extension === 'glb' ? 1024 ** 3 : 400 * 1024 ** 2;
        if (!uploadFormats[kind.value].includes(extension) || file.size < 1 || file.size > limit) {
          errors.push(`${file.name}: 選んだ種類・形式または容量を確認してください`);
          continue;
        }
        status.textContent = `登録中 ${i + 1}/${chosen.length}: ${file.name}`;
        if (directKinds.has(kind.value)) {
          const direct = modelImport();
          const result = direct ? await direct.register(file, kind.value) : { ok: false, error: '3D登録の部品を読み込めません。再読込してください' };
          if (result.ok) { successes++; latest = result.id; }
          else if (result.conflict) confirms.push({ file, kind: kind.value, message: result.conflict });
          else errors.push(`${file.name}: ${result.error}`);
          continue;
        }
        try {
          const url = `/api/library-assets/upload?kind=${encoded(kind.value)}&name=${encoded(file.name)}`;
          const response = await fetch(url, { method: 'POST', body: file });
          const body = await response.json();
          if (!response.ok || !body.item?.id) throw new Error(body.error || `HTTP ${response.status}`);
          successes++;
          latest = body.item.id;
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      const result = `登録 ${successes}/${chosen.length}件。${errors.join(' / ')}${confirms.length ? ` 確認待ち ${confirms.length}件` : ''}`;
      status.textContent = result;
      button.disabled = false;
      showConfirms(confirms);
      if (successes) {
        await refresh(latest, true);
        const feedback = document.createElement('p');
        feedback.setAttribute('role', 'status');
        feedback.textContent = result;
        detail.prepend(feedback);
      }
    });
  }

  $('baiCats').innerHTML = Object.entries(labels).map(([key, label]) => `<button type="button" class="baiCat" data-cat="${key}">${label}</button>`).join('') +
    '<button type="button" class="baiCat" id="baiLibraryRefresh">一覧を更新</button>';
  $('baiAssetCatSelect').innerHTML = Object.entries(labels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  $('baiCats').addEventListener('click', (event) => {
    if (event.target.closest('#baiLibraryRefresh')) { refresh(); return; }
    const button = event.target.closest('[data-cat]');
    if (button) { category = button.dataset.cat; renderList(); }
  });
  $('baiAssetCatSelect').addEventListener('change', (event) => { category = event.target.value; renderList(); });
  $('baiAssetSearch').addEventListener('input', renderList);
  $('baiAssetSort').addEventListener('change', renderList);
  $('baiFavOnly').checked = false;
  $('baiFavOnly').disabled = true;
  $('baiFavOnly').closest('label').append('（未接続）');
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-library-id]');
    const item = button && items.find((candidate) => candidate.id === button.dataset.libraryId);
    if (item) showDetail(item);
  });
  $('baiImport').addEventListener('click', showImport);
  let returningFromImport = false;
  document.addEventListener('click', (event) => {
    if (event.target.closest('a[href="/workspace/08"]')) returningFromImport = true;
  });
  window.addEventListener('focus', () => {
    if (!returningFromImport) return;
    returningFromImport = false;
    void refresh();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== 'bai.studio.assets.changed') return;
    returningFromImport = false;
    void refresh();
  });
  // The 3D import module loads after this classic script; redraw once it is ready.
  window.addEventListener('bai:v05-model-import-ready', () => {
    if (loadFailed) return; // keep the index-failure message visible
    const selected = !importOpen && items.find((item) => item.id === selectedId);
    if (selected) showDetail(selected); else renderList();
  });
  // Release the detail WebGL view when another page or workspace is opened.
  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-go],[data-page],[data-workspace]');
    if (target && !target.closest('#bai-library') && target.dataset.go !== 'library' && target.dataset.page !== 'library') modelImport()?.disposeDetail();
  });
  const libraryPage = detail.closest('.baiPage');
  if (libraryPage) new MutationObserver(() => {
    if (!libraryPage.classList.contains('active')) pauseDetailMedia();
  }).observe(libraryPage, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', () => pauseDetailMedia(true), { once: true });
  window.BAIStudioV05Library = { refresh };
  refresh();
})();
