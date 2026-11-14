/* One saved project clock drives the existing multi-model GPU scene and media preview. */
(() => {
  'use strict';
  let dismissedProject=null;
  let latest=null;window.addEventListener('bai:v05-arrangement-loaded',e=>{latest=e.detail;});
  function connect() {
  const transport = document.querySelector('#v68transport');
  const panel = document.querySelector('#v58-multi-preview');
  const canvas = document.querySelector('#v58-canvas');
  if (!transport || !panel || !canvas || document.getElementById('v70sceneOpen')) return;
  const button = document.createElement('button');
  button.id = 'v70sceneOpen';
  button.type = 'button';
  button.textContent = '3Dの操作・割当を開く';
  transport.prepend(button);
  const controls = document.createElement('div');
  controls.id = 'v70sceneTransport';
  controls.innerHTML = '<strong>作品の共通時刻</strong><button type="button" id="v70back">−1F</button><button type="button" id="v70play">▶ 再生</button><button type="button" id="v70pause">❚❚ 一時停止</button><button type="button" id="v70stop">■ 停止</button><button type="button" id="v70forward">＋1F</button><span id="v70sceneStatus" role="status">作品を選んでください。</span>';
  panel.insertBefore(controls,panel.querySelector('.v58-preview-layout'));
  const seek=panel.querySelector('#v58-motion-seek'),seekButton=seek?.nextElementSibling;
  if(seek&&seekButton){const label=document.createElement('label');label.htmlFor=seek.id;label.textContent='時刻（秒）';controls.append(label,seek,seekButton);}
  const $ = id => document.getElementById(id);
  const media = () => window.BAIStudioMediaPreviewV68;
  const scene = () => window.BAIStudioMultiScenePreview;
  const selectedProject = () => $('v06project')?.value || '';
  function update() {
    const current = media()?.status();
    const active = scene()?.status();
    const needsAttention=(active?.timelineProblems||[]).length;
    button.textContent=(dismissedProject===selectedProject()?'3D編集を再表示':'3Dの操作・割当を開く')+(needsAttention?`（要確認 ${needsAttention}件）`:'');
    const same = Boolean(current?.ready && current.projectId === selectedProject() && active?.opened);
    for (const id of ['v70back', 'v70play', 'v70pause', 'v70stop', 'v70forward']) $(id).disabled = !same;
    if (!active?.opened) return;
    $('v70sceneStatus').textContent = !same ? '同じ作品の保存済み時刻を読み込めません。' :
      `F${current.frame} / ${current.fps} fps / 3D読込 ${active.loaded || 0}件${current.playing ? ' / 再生中' : ''}`;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (!selectedProject()) throw Error('作品を選んでください');
      dismissedProject=null;
      await scene()?.open({ composite: false });
      const active = scene()?.status();
      if (!active?.opened) throw Error('3Dシーンを開けません');
      if (!active.loaded) $('v70sceneStatus').textContent = 'モデルがありません。いったん閉じ、タイムラインへ3Dモデルを配置してください。';
      else update();
      panel.querySelector('select[aria-label="動き・表情・口のクリップ"]')?.focus();
    } catch (error) { $('v68status').textContent = `3Dシーンを開けません: ${error.message}`; }
    finally { button.disabled = false; }
  });
  let autoOpened=false;
  async function syncTimeline(){
    if(!latest||latest.projectId!==selectedProject())return;
    const hasModels=latest.clips?.some(c=>c.track==='model'&&c.category==='model');
    if(!hasModels){if(autoOpened){autoOpened=false;scene()?.close();}return;}
    autoOpened=true;
    if(dismissedProject===selectedProject())return;
    try{if(scene()?.status().opened)await scene()?.refresh();else await scene()?.open({composite:true,compact:true});update();}catch(e){$('v68status').textContent='配置モデルを表示できません: '+e.message;}
  }
  window.addEventListener('bai:v58-user-closed',event=>{dismissedProject=event.detail?.projectId;autoOpened=false;update();});
  window.addEventListener('bai:v58-user-open',()=>{dismissedProject=null;update();});
  document.getElementById('v06project')?.addEventListener('change',()=>{dismissedProject=null;});
  window.addEventListener('bai:v05-arrangement-loaded',()=>void syncTimeline());
  if(latest)void syncTimeline();
  else if(selectedProject())fetch('/api/studio/v05/arrangement?id='+encodeURIComponent(selectedProject()),{cache:'no-store'}).then(r=>r.json()).then(d=>{latest={projectId:d.project_id,clips:d.clips};void syncTimeline();}).catch(()=>{});
  $('v70play').addEventListener('click', () => { media()?.play(); update(); });
  $('v70pause').addEventListener('click', () => { media()?.pause(); update(); });
  $('v70stop').addEventListener('click', () => { void media()?.stop().then(update); });
  $('v70back').addEventListener('click', () => { const state = media()?.status(); if (state) void media().seek(state.frame - 1).then(update); });
  $('v70forward').addEventListener('click', () => { const state = media()?.status(); if (state) void media().seek(state.frame + 1).then(update); });
  window.addEventListener('bai:v05-media-frame', update);
  window.addEventListener('bai:v05-project-changed', update);
  window.addEventListener('bai:v57-scene-changed', update);
  window.addEventListener('bai:v58-scene-reloaded', update);
  }
  connect();
  if(!document.getElementById('v70sceneOpen')){const observer=new MutationObserver(()=>{connect();if(document.getElementById('v70sceneOpen'))observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
  window.addEventListener('bai:v58-ui-ready', connect);
})();
