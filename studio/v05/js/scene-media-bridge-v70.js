/* One saved project clock drives the existing multi-model GPU scene and media preview. */
(() => {
  'use strict';
  const transport = document.querySelector('#v68transport');
  const panel = document.querySelector('#v58-multi-preview');
  const canvas = document.querySelector('#v58-canvas');
  if (!transport || !panel || !canvas) return;
  const button = document.createElement('button');
  button.id = 'v70sceneOpen';
  button.type = 'button';
  button.textContent = '同じ作品の3Dシーンを開く';
  transport.append(button);
  const controls = document.createElement('div');
  controls.id = 'v70sceneTransport';
  controls.innerHTML = '<strong>作品の共通時刻</strong><button type="button" id="v70back">−1F</button><button type="button" id="v70play">▶ 再生</button><button type="button" id="v70pause">❚❚ 一時停止</button><button type="button" id="v70stop">■ 停止</button><button type="button" id="v70forward">＋1F</button><span id="v70sceneStatus" role="status">作品を選んでください。</span>';
  panel.insertBefore(controls, canvas);
  const $ = id => document.getElementById(id);
  const media = () => window.BAIStudioMediaPreviewV68;
  const scene = () => window.BAIStudioMultiScenePreview;
  const selectedProject = () => $('v06project')?.value || '';
  function update() {
    const current = media()?.status();
    const active = scene()?.status();
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
      await scene()?.open();
      const active = scene()?.status();
      if (!active?.opened) throw Error('3Dシーンを開けません');
      if (!active.loaded) $('v70sceneStatus').textContent = '保存済み3Dモデルがありません。左の「複数モデル」で追加してください。';
      else update();
    } catch (error) { $('v68status').textContent = `3Dシーンを開けません: ${error.message}`; }
    finally { button.disabled = false; }
  });
  $('v70play').addEventListener('click', () => { media()?.play(); update(); });
  $('v70pause').addEventListener('click', () => { media()?.pause(); update(); });
  $('v70stop').addEventListener('click', () => { void media()?.stop().then(update); });
  $('v70back').addEventListener('click', () => { const state = media()?.status(); if (state) void media().seek(state.frame - 1).then(update); });
  $('v70forward').addEventListener('click', () => { const state = media()?.status(); if (state) void media().seek(state.frame + 1).then(update); });
  window.addEventListener('bai:v05-media-frame', update);
  window.addEventListener('bai:v05-project-changed', update);
  window.addEventListener('bai:v57-scene-changed', update);
  window.addEventListener('bai:v58-scene-reloaded', update);
})();
