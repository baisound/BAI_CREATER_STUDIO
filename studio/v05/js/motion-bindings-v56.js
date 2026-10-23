/* v56: scene model -> validated motion clip -> existing runtime preview. */
(async () => {
  'use strict';
  let parent = document.getElementById('v55-scene-model');
  let project = document.getElementById('v06project');
  for (let retry = 0; retry < 50 && (!parent || !project); retry++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    parent = document.getElementById('v55-scene-model');
    project = document.getElementById('v06project');
  }
  if (!parent || !project) return;
  const lang = localStorage.getItem('bai.ui.lang') === 'en' ? 'en' : 'jp';
  let labels = {};
  try {
    const res = await fetch('./locales/' + lang + '.json');
    labels = (await res.json()).v56 || {};
  } catch (_) { /* fallback below */ }
  const t = (key) => labels[key] || key;
  const box = document.createElement('section');
  box.id = 'v56-motion-bindings';
  box.style.cssText = 'padding:12px;background:#162434;border:1px solid #526477;border-radius:8px;display:grid;gap:8px';
  const heading = document.createElement('h3');heading.textContent = t('title');
  const select = document.createElement('select');select.id = 'v56-motion-clip';select.style.width = '100%';
  const actions = document.createElement('div');actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px';
  const apply = document.createElement('button');apply.textContent = t('apply');
  const refresh = document.createElement('button');refresh.textContent = t('refresh');
  actions.append(apply,refresh);
  const status = document.createElement('p');status.setAttribute('role','status');
  status.style.cssText = 'white-space:pre-wrap;color:#c2d8ea;margin:0';
  box.append(heading,select,actions,status);
  parent.append(box);
  let plan = null, activeProject = '', busy = false;
  const request = async (url, options) => {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status);
    return body;
  };
  const announce = (message) => { status.textContent = message; };
  const setBusy = (value) => {busy = value;apply.disabled = value;refresh.disabled = value;select.disabled = value;};
  async function reload() {
    const id = project.value;activeProject = id;plan = null;
    select.replaceChildren();if (!id) {announce(t('chooseProject'));return;}
    try {
      const next = await request('/api/studio/v05/scene/motion-plan?id=' + encodeURIComponent(id));
      if (activeProject !== id || project.value !== id) return;
      plan = next;
      for (const row of next.rows) {
        select.add(new Option(row.name + ' · ' + t(row.status), row.clip_id));
      }
      announce(next.rows.length ? t('found') + ': ' + next.rows.length + ' / ' + t('readyCount') + ': ' + next.ready_count : t('empty'));
    } catch (error) {
      if(project.value===id)announce(t('error') + ': ' + error.message);
    }
  }
  apply.addEventListener('click',async()=>{
    if (busy || !plan || !project.value || project.value !== activeProject) return;
    const id = activeProject, row = plan.rows.find(x=>x.clip_id===select.value);
    if (!row || !plan.model?.available) {announce(t('noModel'));return;}
    if (!['ready','target_unassigned','target_mismatch'].includes(row.status)) {
      announce(t('unsupported')+': '+t(row.status));return;
    }
    setBusy(true);
    try {
      if (row.status !== 'ready') {
        await request('/api/studio/v05/arrangement/clip/target',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({project_id:id,clip_id:row.clip_id,revision:plan.arrangement_revision,target_model_id:plan.model.asset_id})
        });
      }
      if (project.value !== id) return;
      // Never trust a stale selection: fetch the new authoritative binding.
      const next = await request('/api/studio/v05/scene/motion-plan?id=' + encodeURIComponent(id));
      const current=next.rows.find(x=>x.clip_id===row.clip_id);
      if (!current || current.status!=='ready' || !next.model?.asset) throw Error(t('unsupported'));
      if (project.value !== id) return;
      const viewer=window.BAIStudioScenePreview;
      if (!viewer?.show) throw Error(t('viewerUnavailable'));
      await viewer.show(id,next.model.asset,next.model.transform);
      if (project.value!==id) {viewer.close();return;}
      await reload();
      select.value=row.clip_id;
      announce(t('previewAttempted'));
    } catch (error) {
      if(project.value===id)announce(t('error') + ': ' + error.message);
      await reload();
    } finally {setBusy(false);}
  });
  refresh.addEventListener('click',reload);
  project.addEventListener('change',reload);
  for (let i=0;i<30 && !project.value;i++) await new Promise(resolve=>setTimeout(resolve,100));
  await reload();
})();
