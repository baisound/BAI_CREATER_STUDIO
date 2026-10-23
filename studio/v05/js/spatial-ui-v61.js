/* v61 - shared XYZ inspector + real-model TransformControls.
 * Renderer-neutral registry supports model/camera/light/effect/environment.
 * Only scene model instances have a persistent v57 API contract at this stage.
 * Other registered spatial objects remain local unless the owner supplies commit().
 */
const core=window.BAIStudioSpatialTransformV61;
if(!core)throw Error('Spatial transform core must load before editor');

// User-visible labels are defined exclusively in locales/jp.json and locales/en.json.
const translationKeys=['title','select','position','rotation','scale','move','rotate','size',
  'save','locked','readOnly','saved','failed','render','loading','preview','cancel',
  'unavailable','busy','notSaved',
  'type_model','type_camera','type_light','type_effect','type_environment'];
const degrees=x=>x*180/Math.PI;
const radians=x=>x*Math.PI/180;
const arr=obj=>[obj.x,obj.y,obj.z];
function readThree(root){
  return core.normalize({position:arr(root.position),rotation:arr(root.rotation).map(degrees),scale:arr(root.scale)});
}
function writeThree(root,t){
  root.position.set(...t.position);
  root.rotation.set(...t.rotation.map(radians));
  root.scale.set(...t.scale);
  root.updateMatrixWorld?.(true);
}
function createSpatialEditor({panel,viewport,controller,project,getSceneData,saveTransform}){
  let t={};
  const tr=key=>t[key]||key;
  const inspector=document.createElement('section');
  inspector.id='v61-transform-editor';
  inspector.setAttribute('aria-label',tr('title'));
  inspector.style.cssText='background:#213248;border:1px solid #58718b;border-radius:7px;padding:8px;display:grid;gap:7px;color:#e7effa';
  const title=document.createElement('strong');title.textContent=tr('title');
  const sub=document.createElement('small');sub.textContent=tr('render');
  const tool=document.createElement('div');tool.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  const modes={};
  for(const [mode,text] of [['translate',tr('move')],['rotate',tr('rotate')],['scale',tr('size')]]){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-pressed',mode==='translate'?'true':'false');tool.append(b);modes[mode]=b;
  }
  const table=document.createElement('div');table.style.cssText='display:grid;gap:5px';
  const fields={};
  const axisNames=['X','Y','Z'];
  for(const field of core.FIELDS){
    const line=document.createElement('div');line.style.cssText='display:flex;gap:4px;align-items:center';
    const label=document.createElement('span');label.textContent=tr(field);label.style.cssText='font-size:12px;width:85px;flex-shrink:0';
    line.append(label);
    fields[field]=axisNames.map((axis,i)=>{
      const input=document.createElement('input');input.type='number';input.step=field==='scale'?'0.01':'0.1';
      input.setAttribute('aria-label',tr(field)+' '+axis);input.style.cssText='min-width:0;width:33%;background:#131e2b;color:white;border:1px solid #64788c;border-radius:4px;padding:5px';
      input.dataset.axis=axis;line.append(input);return input;
    });
    table.append(line);
  }
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:6px';
  const apply=document.createElement('button');apply.type='button';apply.textContent=tr('save');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=tr('cancel');
  controls.append(apply,cancel);
  const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='font-size:12px;color:#cee0f1';
  inspector.append(title,sub,tool,table,controls,status);
  panel.insertBefore(inspector,panel.querySelector('#v58-canvas'));
  let gizmo=null,disposed=false,selected='',isDragging=false,busy=false,selectionEpoch=0,dragStarted=false;
  const registeredRoots=new Map();
  let gizmoHelper=null;
  const registry=core.createRegistry({
    onChange:(e)=>{if(e.type==='selection'||e.type==='preview'||e.type==='rollback'||e.type==='commit')syncInputs();},
    onError:({error})=>{status.textContent=tr('failed')+': '+error.message;}
  });
  async function createGizmo(){
    try{
      const {TransformControls}=await import('three/addons/controls/TransformControls.js');
      if(disposed)return;
      gizmo=new TransformControls(viewport.camera,viewport.renderer.domElement);
      gizmoHelper=typeof gizmo.getHelper==='function'?gizmo.getHelper():gizmo;
      viewport.content.add(gizmoHelper);
      gizmo.addEventListener('dragging-changed',e=>{
        isDragging=!!e.value;
        if(viewport.controls)viewport.controls.enabled=!isDragging;
      });
      gizmo.addEventListener('mouseDown',()=>{
        if(!selected||busy)return;
        try{registry.begin(selected);dragStarted=true;status.textContent=tr('preview');}
        catch(error){status.textContent=error.message;gizmo.detach();}
      });
      gizmo.addEventListener('objectChange',()=>{
        if(!selected||!isDragging)return;
        try{registry.preview(readThree(gizmo.object),selected);syncInputs();viewport.invalidate();}
        catch(error){status.textContent=error.message;}
      });
      gizmo.addEventListener('mouseUp',async()=>{
        if(!selected||!dragStarted)return;
        dragStarted=false;isDragging=false;
        if(viewport.controls)viewport.controls.enabled=true;
        await commitSelection(selected);
      });
      bindGizmo();
      viewport.invalidate();
    }catch(error){status.textContent='XYZ handles unavailable; numeric controls remain available: '+error.message;}
  }
  function bindGizmo(){
    if(!gizmo)return;
    const obj=selected?controller.getLoaded(selected)?.root:null;
    if(obj&&registry.ids().includes(selected)&&!(registry.snapshot(selected).locked))gizmo.attach(obj);
    else gizmo.detach();
    viewport.invalidate();
  }
  function syncInputs(){
    let snap=null;
    try{if(selected)snap=registry.snapshot(selected);}catch(_){}
    for(const f of core.FIELDS){
      for(let i=0;i<3;i++){
        const input=fields[f][i];
        input.disabled=!snap||snap.locked||busy;
        if(snap&&!document.activeElement?.isSameNode(input))input.value=String(+snap.transform[f][i].toFixed(4));
      }
    }
    apply.disabled=cancel.disabled=!snap||snap.locked||busy;
    sub.textContent=snap?(tr('type_'+snap.type)+' · '+snap.id)+(snap.locked?' · '+tr('locked'):''):tr('render');
  }
  async function commitSelection(id){
    if(busy)return;
    busy=true;syncInputs();
    try{
      await registry.finish(id);
      status.textContent=tr('saved');
    }catch(error){status.textContent=tr('failed')+': '+String(error.message||error);}
    finally{busy=false;syncInputs();viewport.invalidate();}
  }
  async function applyFields(){
    if(!selected||busy)return;
    try{
      const next={};
      for(const f of core.FIELDS)next[f]=fields[f].map(x=>x.value.trim()===''?NaN:Number(x.value));
      core.normalize(next);
      registry.begin(selected);
      registry.preview(next,selected);
      viewport.invalidate();
      await commitSelection(selected);
    }catch(error){status.textContent=error.message;registry.cancel(selected);syncInputs();}
  }
  apply.addEventListener('click',applyFields);
  for(const f of core.FIELDS)for(const input of fields[f])input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();applyFields();}
  });
  cancel.addEventListener('click',()=>{
    if(selected)registry.cancel(selected);
    syncInputs();viewport.invalidate();
  });
  let mode='translate';
  for(const [m,b] of Object.entries(modes))b.addEventListener('click',()=>{
    mode=m;gizmo?.setMode(m);for(const [k,btn] of Object.entries(modes))btn.setAttribute('aria-pressed',k===m?'true':'false');
  });
  const onKey=e=>{
    const active=document.activeElement;
    if(!panel.contains(active)||['INPUT','SELECT','TEXTAREA'].includes(active?.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;
    const m={w:'translate',e:'rotate',r:'scale'}[e.key.toLowerCase()];
    if(m){e.preventDefault();e.stopPropagation();modes[m].click();}
  };
  document.addEventListener('keydown',onKey);
  async function update(instances){
    const epoch=++selectionEpoch;
    const wanted=new Set();
    for(const row of instances||[]){
      const model=controller.getLoaded(row.id);
      if(!model?.root)continue;
      wanted.add(row.id);
      if(registeredRoots.get(row.id)!==model.root){
        if(registry.ids().includes(row.id))registry.unregister(row.id);
        registeredRoots.set(row.id);
        registry.register(row.id,{
          type:'model',read:()=>readThree(model.root),
          apply:v=>{writeThree(model.root,v);viewport.invalidate();},
          locked:()=>Boolean(getSceneData()?.instances?.find(x=>x.id===row.id)?.locked),
          commit:async(v,before)=>{
            const result=await saveTransform(row.id,v,before,epoch);
            if(!result)throw Error('Project changed during save');
          }
        });
      }
    }
    for(const id of registry.ids())if(!wanted.has(id)){registry.unregister(id);registeredRoots.delete(id);}
    if(selected&&!wanted.has(selected))selected='';
    if(!selected&&wanted.size)selected=[...wanted][0];
    if(selected)registry.select(selected);
    bindGizmo();syncInputs();
  }
  function select(id){
    if(selected&&selected!==id)registry.cancel(selected);
    if(!id||!registry.ids().includes(id)){selected='';gizmo?.detach();syncInputs();return;}
    selected=id;registry.select(id);bindGizmo();syncInputs();
  }
  function dispose(){
    disposed=true;
    document.removeEventListener('keydown',onKey);
    languageControl?.removeEventListener('change',applyLanguage);
    if(selected)registry.cancel(selected);
    gizmo?.detach();gizmo?.dispose?.();
    if(gizmoHelper?.parent)gizmoHelper.parent.remove(gizmoHelper);
    gizmoHelper=null;
    gizmo=null;registry.clear();registeredRoots.clear();inspector.remove();
  }
  async function applyLanguage(){
    const selectedLanguage=localStorage.getItem('bai.ui.lang')==='en'?'en':'jp';
    try{
      const response=await fetch('./locales/'+selectedLanguage+'.json',{cache:'no-store'});
      if(!response.ok)throw Error('Locale HTTP '+response.status);
      const dictionary=(await response.json()).spatialV61;
      if(!dictionary||translationKeys.some(k=>typeof dictionary[k]!=='string'||!dictionary[k]))
        throw Error('Missing spatialV61 labels');
      if(disposed)return;
      t=dictionary;
      inspector.setAttribute('aria-label',tr('title'));
      title.textContent=tr('title');
      for(const [mode,key] of [['translate','move'],['rotate','rotate'],['scale','size']])modes[mode].textContent=tr(key);
      for(const field of core.FIELDS){
        const inputs=fields[field];
        const label=inputs[0].parentElement.querySelector('span');
        if(label)label.textContent=tr(field);
        inputs.forEach((input,i)=>input.setAttribute('aria-label',tr(field)+' '+axisNames[i]));
      }
      apply.textContent=tr('save');cancel.textContent=tr('cancel');
      syncInputs();
    }catch(error){status.textContent=String(error.message||error);}
  }
  const languageControl=document.getElementById('langChoice');
  languageControl?.addEventListener('change',applyLanguage);
  syncInputs();applyLanguage();createGizmo();
  return {update,select,dispose,registry};
}
export {createSpatialEditor,readThree,writeThree};
