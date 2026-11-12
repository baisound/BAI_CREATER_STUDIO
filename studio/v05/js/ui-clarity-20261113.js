/* Clarify existing operations without replacing their save/history/render APIs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = (tag, value) => { const e = document.createElement(tag); e.textContent = value; return e; };
  const button = (label, run) => { const e = text('button', label); e.type = 'button'; e.addEventListener('click', run); return e; };
  const disclosure = (id, title) => { const e = document.createElement('details'); e.id = id; e.append(text('summary', title)); return e; };
  let showEmpty = false;
  let settingsOpen = false;
  const visibleEmptyTracks = new Set();
  let latestClip = null;

  function organizeTimeline(parts) {
    const {el, header, toolbar, help, actions, transport, clipHistoryBar, videoTools, audioTools, snapLabel, undo, addImage, removeLabel, removeImage, hasFaceKeys} = parts;
    toolbar.className = 'uiTimelineTools';
    clipHistoryBar.className = 'uiClipHistory';
    const advanced = disclosure('uiTimelineSettings', 'トラック設定・表示');
    advanced.open = settingsOpen;
    advanced.addEventListener('toggle', () => { if (advanced.isConnected) settingsOpen = advanced.open; });
    const body = document.createElement('div'); body.className = 'uiTimelineSettingsBody';
    body.append(button('パネル配置を戻す', () => $('baiPaneReset')?.click()));
    const emptyLabel = text('label', '空のトラックも表示（全種類） ');
    const empty = document.createElement('input'); empty.type = 'checkbox'; empty.checked = showEmpty;
    empty.id = 'uiShowEmptyTracks'; emptyLabel.prepend(empty);
    const updateRows = () => {
      el.querySelectorAll('[data-track]').forEach(lane => {
        const isKeyTrack = hasFaceKeys && ['expression', 'lip', 'model'].includes(lane.dataset.track);
        lane.parentElement.hidden = !showEmpty && !isKeyTrack && !visibleEmptyTracks.has(lane.dataset.track) && !lane.querySelector('[data-clip-id]');
      });
    };
    empty.addEventListener('change', () => { showEmpty = empty.checked; updateRows(); });
    const timeLabel = $('v89PlayheadLabel');
    if (timeLabel) { timeLabel.classList.add('uiPlayhead'); toolbar.append(timeLabel); }
    body.append(emptyLabel, snapLabel, undo, addImage, removeLabel, removeImage, actions, videoTools, audioTools, transport, help, header);
    advanced.append(body); toolbar.append(advanced);
    advanced.addEventListener('click', event => {
      const clicked=event.target.closest('button');if(!clicked)return;
      const kind=clicked===addImage?'image':clicked.id==='vVideoLaneAdd'?'video':clicked.id==='vAudioLaneAdd'?'audio':clicked.id==='vMusicLaneAdd'?'music':null;
      if(kind)visibleEmptyTracks.add(kind);
    });
    toolbar.append(...clipHistoryBar.childNodes); clipHistoryBar.remove();
    toolbar.prepend(...['v84SelectMode', 'v84CutMode', 'v84SnapToggle'].map($).filter(Boolean));
    header.classList.add('uiTimelineMeta');
    const title = $('v77TimelineShell')?.querySelector('h3');
    if (title) title.textContent = 'タイムライン';
    el.prepend(toolbar);
    updateRows();
    el.dataset.uiOrganized = 'true';
    if (!el.querySelector('[data-clip-id]') && !hasFaceKeys) {
      const emptyState = text('p', '素材を選び「選択素材を配置・保存」で追加するか、トラック設定から空の行を表示できます。');
      emptyState.className = 'uiEmptyTimeline'; toolbar.after(emptyState);
    }
  }
  function emptyTimeline(el){el.replaceChildren(text('p','作品を選ぶと保存済みのタイムラインを表示します。'),button('作品を作成・選択',()=>window.baiGo('projects')));const settings=disclosure('uiTimelineSettings','表示設定');settings.append(button('パネル配置を戻す',()=>$('baiPaneReset')?.click()));el.append(settings);}
  window.BAIStudioUI20261113 = Object.freeze({organizeTimeline,emptyTimeline});

  function setup() {
    const nav = $('nav'), top = document.querySelector('.top');
    if (!nav || !top) return;
    const mainNav = document.createElement('div'); mainNav.id = 'uiMainNav';
    const subNav = document.createElement('div'); subNav.id = 'uiSubNav'; subNav.setAttribute('aria-label', '用途別の画面');
    const groups = {};
    for (const group of ['projects', 'create', 'library', 'output']) {
      const e = document.createElement('div'); e.dataset.uiGroup = group; groups[group] = e; subNav.append(e);
    }
    const primary = [nav.querySelector('[data-page="home"]'), nav.querySelector('[data-page="library"]'), nav.querySelector('[data-workspace="edit"]'), nav.querySelector('[data-workspace="export"]')];
    const labels = ['作品', '素材', '制作', '書き出し'];
    primary.forEach((e, i) => { e.textContent = labels[i]; e.classList.add('uiPrimaryTab'); mainNav.append(e); });
    for (const e of [...nav.querySelectorAll('.tab')]) {
      if (primary.includes(e)) continue;
      const group = ['dashboard', 'projects'].includes(e.dataset.page) ? 'projects' : 'create';
      groups[group].append(e);
    }
    const home = button('ホーム', () => window.baiGo('home')); home.className = 'tab'; groups.projects.prepend(home);
    const timeline = button('タイムライン', () => primary[2].click()); timeline.className = 'tab'; timeline.dataset.uiRoute = 'edit'; groups.create.prepend(timeline);
    groups.library.append(text('span', '素材管理'));
    groups.output.append(text('span', '保存した作品から動画を作成'));
    nav.append(mainNav, subNav);
    const brand = top.querySelector('.brand');
    brand.querySelector('.pill')?.remove();
    const currentProject = text('span', '作品を読み込み中'); currentProject.id = 'uiCurrentProject';
    top.insertBefore(currentProject, nav);
    const saveState = text('span', '素材配置：確認中'); saveState.id = 'uiSaveState'; saveState.role = 'status';
    top.insertBefore(saveState, $('baiFileMenu'));
    const dropdown = $('baiFileDropdown');
    dropdown.querySelector('b').textContent = '保存状態・ファイル';
    dropdown.prepend(text('p', '素材配置は操作ごとに保存されます。以下は別の保存です。'));
    const snapshot = button('素材配置の保存状態を確認', async () => {
      const id = $('v06project')?.value; if (!id) return;
      snapshot.disabled = true;
      try {
        const response = await fetch('/api/studio/v05/arrangement?id='+encodeURIComponent(id), {cache:'no-store'});
        const result = await response.json(); if (!response.ok) throw Error(result.error || '保存できません');
        if(id===$('v06project').value)note.textContent = `素材配置 ${result.clips.length}件の保存を確認しました（版 ${result.revision}）。モデル・カメラ等は各画面の保存を使います。`;
      } catch (e) { note.textContent = '保存状態を確認できません：' + e.message; }
      finally { snapshot.disabled = false; }
    });
    const note = text('p', 'v0.5素材配置は操作ごとに自動保存されます。旧編集状態のスナップショットは作品カードから保存できます。'); note.role = 'status';
    dropdown.querySelector('b').after(snapshot, note);
    const prototype = disclosure('uiPrototypeFiles', '旧試作JSON・共通Undo（未接続）');
    for (const e of [...dropdown.querySelectorAll('[data-action]')]) {
      if (e.dataset.action.startsWith('save') || e.dataset.action.startsWith('load')) {
        if (e.dataset.action.includes('Project')) e.textContent = e.dataset.action.startsWith('save') ? '作品リストのUI試作JSONを保存' : '作品リストのUI試作JSONを読み込む';
        else e.textContent += '（試作）';
        prototype.append(e);
      }
    }
    $('save').textContent = '試作シーンJSONを保存'; $('save').title = 'objects/tracksの試作データ。実作品の全体保存ではありません';
    $('undo').textContent = '共通Undo（未接続）'; $('undo').disabled = true;
    const oldActions = $('save').parentElement;
    prototype.append($('undo'), $('save')); oldActions.remove(); dropdown.append(prototype);
    const legacyLink = document.querySelector('a[href="/studio/index.html"]');
    if (legacyLink) { legacyLink.removeAttribute('style'); legacyLink.id = 'uiLegacyAppLink'; legacyLink.textContent = '既存の制作画面を開く ↗'; dropdown.append(legacyLink); }
    $('baiFileMenu').textContent = '保存メニュー'; $('baiFileMenu').setAttribute('aria-expanded', 'false');
    $('baiFileMenu').addEventListener('click', () => $('baiFileMenu').setAttribute('aria-expanded', String(!dropdown.hidden)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dropdown.hidden) { dropdown.hidden = true; $('baiFileMenu').setAttribute('aria-expanded','false'); $('baiFileMenu').focus(); } });
    document.addEventListener('click', e => { if (!dropdown.contains(e.target) && !$('baiFileMenu').contains(e.target)) { dropdown.hidden = true; $('baiFileMenu').setAttribute('aria-expanded','false'); } });
    const setProjectName = () => { const option = $('v06project')?.selectedOptions[0]; currentProject.textContent = option?.textContent || '作品を選択'; };
    let saveError = false;
    window.addEventListener('bai:v05-project-changed', () => { saveError = false; saveState.textContent = '素材配置：確認中'; });
    window.addEventListener('bai:v05-save-state', e => {
      if (e.detail.projectId !== $('v06project')?.value) return;
      saveError = e.detail.state === 'error';
      saveState.textContent = e.detail.state === 'saving' ? '素材配置：保存中' : saveError ? '素材配置：保存を確認' : '素材配置：保存済み';
    });
    window.addEventListener('bai:v05-arrangement-loaded', e => {
      if (e.detail.projectId !== $('v06project')?.value) return;
      if (!saveError) saveState.textContent = '素材配置：保存済み'; setProjectName();
    });
    // A real request failure must not leave a false "saved" indicator.
    const statusSource = $('v06status');
    if (statusSource) new MutationObserver(() => {
      if (/失敗|保存できません|取得不可|読み込み失敗/.test(statusSource.textContent)) saveState.textContent = '素材配置：状態を確認';
    }).observe(statusSource,{childList:true,subtree:true,characterData:true});

    function workspace(which) {
      const group = ['home','projects','dashboard'].includes(which) ? 'projects' : which === 'library' ? 'library' : which === 'output' ? 'output' : 'create';
      Object.entries(groups).forEach(([key,e]) => { e.hidden = key !== group; });
      const active = primary[['projects','library','create','output'].indexOf(group)];
      primary.forEach(e => { e.classList.toggle('on', e === active); e.setAttribute('aria-current', e === active ? 'page' : 'false'); });
      timeline.classList.toggle('on', which === 'edit'); home.classList.toggle('on', which === 'home');
      const main = document.querySelector('.main');
      if (main?.contains(document.activeElement) && main.inert) active.focus();
      if (!['edit','motion','camera'].includes(which)) latestClip = null;
      updateInspector();
      document.querySelector('.status').firstElementChild.textContent = group === 'create' ? '保存済み作品の素材を編集中' : '作品・素材・完成動画';
    }
    window.addEventListener('bai:v05-workspace-changed', e => workspace(e.detail.workspace));
    setupInspector(); setupLibrary(); setupExport();
    window.BAIStudioAudioClarity?.setup();
    workspace(document.body.dataset.workspace || 'home'); setProjectName();
    if($('v06project')?.value)void window.BAIStudioV05Arrangement?.refreshArrangement();else void window.BAIStudioV05Arrangement?.refreshTimeline();
  }

  function setupInspector() {
    const right = document.querySelector('.right');
    const legacy = disclosure('uiLegacyInspector', '旧カメラ・試作設定（未接続）');
    legacy.append(...right.childNodes);
    const inspector = document.createElement('section'); inspector.id = 'uiSelectedInspector'; inspector.setAttribute('aria-label','選択したクリップ');
    right.append(inspector, legacy);
    window.addEventListener('bai:v05-clip-selected', e => { if (e.detail.projectId === $('v06project')?.value) { latestClip = e.detail.clip; updateInspector(); } });
    window.addEventListener('bai:v05-project-changed', () => { latestClip = null; updateInspector(); });
  }
  function updateInspector() {
    const inspector = $('uiSelectedInspector'); if (!inspector) return;
    inspector.replaceChildren();
    const which = document.body.dataset.workspace;
    if (which === 'camera') {
      inspector.append(text('h2','カメラ・演出'), text('p','旧カメラの設定は下の詳細から開けます。実撮影の設定と未接続の試作設定を区別して表示します。'));
    } else if (!latestClip) {
      inspector.append(text('h2','選択したクリップ'), text('p','タイムラインでクリップを選ぶと、保存された配置を確認できます。'));
    } else {
      const c = latestClip, types = {image:'画像',video:'動画',audio:'音声',music:'楽曲',model:'3Dモデル',motion:'動き',camera:'カメラ'};
      inspector.append(text('h2',(types[c.category] || types[c.track] || '素材') + 'クリップ'), text('h3',c.name));
      const dl = document.createElement('dl');
      for (const [name,value] of [['開始',c.start+' 秒'],['長さ',c.duration+' 秒'],['配置先',c.track+(c.lane ? ' '+c.lane : '')], ...(['video','audio','music'].includes(c.category) ? [['元素材の開始',(c.source_start || 0)+' 秒']] : [])]) dl.append(text('dt',name),text('dd',value));
      inspector.append(dl, button('配置・長さを編集', () => window.BAIStudioV05Arrangement.editClipById(c.id)));
      inspector.append(text('p','変更はこの作品へ保存されます。元の素材は保持します。'));
    }
  }

  function setupLibrary() {
    for (const [id,label] of [['baiAssetSearch','素材を検索'],['baiAssetSort','並び順'],['baiAssetCatSelect','カテゴリ'],['v06query','配置する素材を検索']]) {
      const input = $(id); if (!input) continue;
      const caption = text('label', label); caption.htmlFor = id; caption.className = 'uiFieldLabel'; input.before(caption);
    }
    // The same control is shown in the sidebar. Category buttons are an existing
    // duplicate of this control; retain it as the narrow-screen equivalent only.
    const select = $('baiAssetCatSelect'), categoryLabel = document.querySelector('label[for="baiAssetCatSelect"]');
    const cats = $('baiCats'); cats.before(categoryLabel, select);
    cats.classList.add('uiCategoryButtons');
    const advanced = $('bai-library').querySelector('details');
    const sidebar = cats.closest('.baiCard');
    if (advanced && !advanced.contains(sidebar)) sidebar.append(advanced);
    // Details stay reachable; retain the uploader, PMX/VMD link and favourites.
    const picker = $('v06AssetPicker'), panel = $('assetPanel');
    const revealPlacementTrack=()=>{visibleEmptyTracks.add($('v06track').value);void window.BAIStudioV05Arrangement?.refreshTimeline();};
    $('v06track').addEventListener('change',revealPlacementTrack);$('v06results').addEventListener('click',revealPlacementTrack);
    if (picker && panel) panel.prepend(picker);
    const advanced3d = disclosure('uiAdvanced3D', '3D・動作の設定');
    panel.append(advanced3d);
    const organizeLate3d = () => {
      for (const id of ['v55-scene-model','v57-scene-instances']) { const node = $(id); if (node && node.parentElement !== advanced3d) advanced3d.append(node); }
      if (picker.parentElement === panel && panel.firstElementChild !== picker) panel.prepend(picker);
    };
    organizeLate3d();
    // These two existing modules load locale data before appending their panels.
    new MutationObserver(organizeLate3d).observe(panel,{childList:true});
    const movePreviewEntry = () => { const entry = $('v22-open'); if (!entry) return false; entry.removeAttribute('style'); entry.textContent = '3D実描画を開く'; advanced3d.append(entry); return true; };
    if (!movePreviewEntry()) { const observer = new MutationObserver(() => { if (movePreviewEntry()) observer.disconnect(); }); observer.observe(document.body,{childList:true,subtree:true}); }
    const oldSamples = $('v77LegacyAssets'); if (oldSamples) advanced3d.append(oldSamples);
    const placements = $('v06clips'); if (placements) { const history = disclosure('uiPlacementHistory','保存した配置の一覧'); placements.before(history); history.append(placements); }
  }

  function setupExport() {
    const output = $('bai-output'), grid = output.querySelector('.baiTwo');
    const settings = grid.firstElementChild, preview = output.querySelector('.baiPreview').closest('.baiCard'), history = $('v69historyCard');
    grid.classList.add('uiExportGrid'); settings.id = 'uiExportSettings'; preview.id = 'uiExportPreview';
    grid.append(history);
    const advanced = disclosure('uiExportDetails', '対応条件・未接続の設定');
    const execute = $('baiAddRender'), status = $('v69status');
    const nameLabel = $('v69name').closest('label'), modeLabel = $('v69nameMode').closest('label');
    settings.querySelector('h2').after(nameLabel);
    // Only known legacy/unsupported fields go in details. Disabled real fields
    // still convey current values and can be enabled by the async render context.
    const legacyRange = $('baiLegacyOutputRange');
    for (const e of [...settings.children]) {
      if (e === legacyRange || e.htmlFor === 'baiLegacyOutputRange' || e.matches('input[type=checkbox],input[type=checkbox]+label') || e.querySelector?.('input[type=checkbox]') || (e.tagName === 'P' && !e.id)) advanced.append(e);
    }
    const realFormat = $('baiOutputFormat'), resolution = $('v69resolution');
    const realFields = document.createElement('div'); realFields.className = 'uiOutputFields';
    nameLabel.after(realFields);
    for (const [input,name] of [[realFormat,'形式'],[resolution,'解像度']]) {
      let label = input.previousElementSibling;
      if (label?.tagName === 'LABEL') { label.htmlFor = input.id; label.textContent = name; }
      const field = document.createElement('div'); field.append(label,input); realFields.append(field);
    }
    const fps = [...settings.querySelectorAll('select')].find(e => !e.id && e.disabled);
    if (fps) { const field = document.createElement('div'); fps.id = 'uiOutputFPS'; const label = fps.previousElementSibling; if (label?.tagName === 'LABEL') label.htmlFor = fps.id; field.append(label,fps); realFields.append(field); }
    settings.append(modeLabel, $('v69nameHint'), $('v69audioQuality'), execute, status, advanced);
    execute.classList.add('uiExportExecute');
    // The old grid-span belongs to the former two-column, second-row history.
    history.style.gridColumn = '';
    const guides = disclosure('uiPreviewGuides','プレビューの構図補助線');
    const safe = $('baiSafeToggle');
    const guideRow = safe?.closest('.baiRow'); if (guideRow) { guideRow.before(guides); guides.append(guideRow); }
    const note = [...preview.querySelectorAll('p')].find(e => e.textContent.includes('構図補助線')); if (note) guides.append(note);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true}); else setup();
})();
