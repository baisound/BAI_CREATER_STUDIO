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
    audio: ['wav', 'mp3'], video: ['mp4', 'webm', 'ogv'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'],
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const bytes = (value) => Number.isFinite(value) ? `${(value / 1024 / 1024).toFixed(2)} MiB` : '不明';
  const encoded = (value) => encodeURIComponent(String(value));
  const safeThumbnail = (value) => typeof value === 'string' && /^\/api\/(?:assets|library-assets)\/thumbnail\//.test(value) ? value : null;

  let items = [];
  let category = 'all';
  let selectedId = null;
  let loading = false;

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
  }

  function showDetail(item) {
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
      <dt>利用状態</dt><dd>${item.available ? '登録済み・利用可能' : '元ファイルが見つかりません'}</dd></dl>
      ${is3d ? '<p class="baiTiny">3D回転表示と実動作はこの詳細欄へ未接続です。</p>' : ''}
      ${item.available ? '<button type="button" id="baiPlaceSelected">この素材をタイムラインで選ぶ</button>' : ''}
      <p class="baiTiny">原本は変更しません。配置後の実再生は素材形式ごとに確認が必要です。</p>`;
    $('baiPlaceSelected')?.addEventListener('click', () => {
      window.baiGo?.('edit');
      window.dispatchEvent(new CustomEvent('bai:v05-asset-selected', { detail: { id: item.id } }));
    });
  }

  async function refresh(preferId = selectedId) {
    if (loading) return;
    loading = true;
    grid.innerHTML = '<p>登録素材を読み込んでいます…</p>';
    try {
      const [fullResponse, inventoryResponse] = await Promise.all([
        fetch('/api/assets', { cache: 'no-store' }),
        fetch('/api/studio/v05/assets', { cache: 'no-store' }),
      ]);
      if (!fullResponse.ok || !inventoryResponse.ok) throw new Error(`HTTP ${fullResponse.status}/${inventoryResponse.status}`);
      const [full, inventory] = await Promise.all([fullResponse.json(), inventoryResponse.json()]);
      if (!Array.isArray(full.items) || !Array.isArray(inventory.items)) throw new Error('素材索引の形式が不正です');
      const categories = new Map(inventory.items.map((item) => [item.id, item.category]));
      items = full.items.filter((item) => item && typeof item.id === 'string').map((item) => ({
        ...item, category: categories.get(item.id) || 'other',
      }));
      $('baiAssetCount').textContent = `${items.length}件の登録素材`;
      window.dispatchEvent(new CustomEvent('bai:v05-assets-loaded', { detail: { count: items.length } }));
      renderList();
      const selected = items.find((item) => item.id === preferId);
      if (selected) showDetail(selected);
      else if (selectedId) { selectedId = null; detail.innerHTML = '<h2>登録素材の詳細</h2><p>一覧から素材を選んでください。</p>'; }
    } catch (error) {
      items = [];
      selectedId = null;
      grid.innerHTML = `<p role="alert">素材一覧を読み込めません。原本は保持されています。${esc(error.message)}</p>`;
      $('baiAssetCount').textContent = '取得失敗';
      detail.innerHTML = '<h2>登録素材の詳細</h2><p>一覧の取得後に表示します。</p>';
    } finally {
      loading = false;
    }
  }

  function showImport() {
    detail.innerHTML = `<h2>素材を追加</h2>
      <label>種類 <select id="baiUploadKind">
        <option value="stage">GLBステージ</option><option value="prop">GLB小物</option>
        <option value="material">材質画像</option><option value="fx">エフェクト素材</option>
        <option value="audio">音声・楽曲</option><option value="video">動画</option><option value="image">画像</option>
      </select></label>
      <label>ファイル <input id="baiUploadFiles" type="file" multiple></label>
      <button type="button" id="baiUploadSubmit">選んだファイルを登録</button>
      <p id="baiUploadStatus" role="status">種類とファイルを選んでください。GLBステージは最大1 GiB、その他は最大400 MiBです。</p>
      <p class="baiTiny">PMX・VRM・FBX・VMD・GLB動作の新規登録は<a href="/workspace/08" target="_blank" rel="noopener">現行の素材取込画面</a>で行えます。v0.5からの直接登録は未接続です。</p>`;
    const kind = $('baiUploadKind');
    const files = $('baiUploadFiles');
    const button = $('baiUploadSubmit');
    const status = $('baiUploadStatus');
    kind.addEventListener('change', () => { files.accept = uploadFormats[kind.value].map((ext) => `.${ext}`).join(','); });
    kind.dispatchEvent(new Event('change'));
    button.addEventListener('click', async () => {
      const chosen = Array.from(files.files || []);
      if (!chosen.length) { status.textContent = 'ファイルを選んでください。'; return; }
      button.disabled = true;
      let successes = 0;
      let latest = null;
      const errors = [];
      for (let i = 0; i < chosen.length; i++) {
        const file = chosen[i];
        const extension = file.name.split('.').pop()?.toLowerCase();
        const limit = kind.value === 'stage' && extension === 'glb' ? 1024 ** 3 : 400 * 1024 ** 2;
        if (!uploadFormats[kind.value].includes(extension) || file.size < 1 || file.size > limit) {
          errors.push(`${file.name}: 選んだ種類・形式または容量を確認してください`);
          continue;
        }
        status.textContent = `登録中 ${i + 1}/${chosen.length}: ${file.name}`;
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
      const result = `登録 ${successes}/${chosen.length}件。${errors.join(' / ')}`;
      status.textContent = result;
      button.disabled = false;
      if (successes) {
        await refresh(latest);
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
  $('baiImport').textContent = '＋ 素材を追加';
  $('baiImport').addEventListener('click', showImport);
  window.BAIStudioV05Library = { refresh };
  refresh();
})();
