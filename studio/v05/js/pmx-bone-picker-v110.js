/* Real PMX bone hierarchy and screen-space pick markers in the shared 3D editor. */
export function createPmxBonePicker({container,controls,viewport,getModel,getSelected,onSelect}){
  const tree=document.createElement('details');tree.id='v110-bone-tree';
  const summary=document.createElement('summary');summary.textContent='PMX骨の階層から選択';
  const hint=document.createElement('small');
  hint.textContent='名前を絞ると該当骨が3Dに表示されます。骨を選んでも姿勢は変更されません。';
  const search=document.createElement('input');search.id='v110-bone-search';search.type='search';
  search.placeholder='骨の名前で検索';search.setAttribute('aria-label','PMX骨の名前で検索');
  const list=document.createElement('div');list.id='v110-bone-list';list.setAttribute('role','group');
  list.setAttribute('aria-label','実PMXの骨階層');
  const status=document.createElement('small');status.id='v110-bone-status';status.setAttribute('role','status');
  tree.append(summary,hint,search,list,status);controls.append(tree);
  const overlay=document.createElement('div');overlay.id='v110-bone-overlay';overlay.hidden=true;
  container.append(overlay);
  let skeleton=null,entries=[],renderKey='',markers=[],pending=0,disposed=false;
  function inspect(model){
    if(model?.format!=='PMX'||!model.object?.skeleton)return [];
    const bones=model.object.skeleton.bones;
    const counts=new Map();
    for(const bone of bones)counts.set(bone.name,(counts.get(bone.name)||0)+1);
    return bones.map(bone=>{
      let depth=0,parent=bone.parent;
      while(parent?.isBone&&depth<8){depth++;parent=parent.parent;}
      return {bone,name:bone.name,depth,unique:counts.get(bone.name)===1};
    });
  }
  function positionMarkers(){
    if(disposed||overlay.hidden||!markers.length)return;
    const model=getModel();
    if(!model?.object||!viewport?.camera)return;
    const THREE=model.libs.THREE;
    viewport.camera.updateMatrixWorld(true);
    model.object.updateMatrixWorld(true);
    const point=new THREE.Vector3();
    const canvasRect=container.getBoundingClientRect();
    const panel=controls.closest('#v58-multi-preview');
    const floatingPanel=panel&&!panel.contains(container)?panel.getBoundingClientRect():null;
    for(const {entry,button} of markers){
      entry.bone.getWorldPosition(point).project(viewport.camera);
      const visible=Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z)&&
        Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&point.z>=-1&&point.z<=1;
      button.hidden=!visible;
      if(visible){
        const x=(point.x+1)*container.clientWidth/2;
        let y=(1-point.y)*container.clientHeight/2;
        const underPanel=floatingPanel&&
          canvasRect.left+x>=floatingPanel.left-10&&canvasRect.left+x<=floatingPanel.right+10&&
          canvasRect.top+y>=floatingPanel.top-10&&canvasRect.top+y<=floatingPanel.bottom+10;
        if(underPanel)y=Math.min(container.clientHeight-16,floatingPanel.bottom-canvasRect.top+18);
        button.style.left=x+'px';button.style.top=y+'px';
        button.textContent=underPanel?`↘ ${entry.name}`:(entry.name===getSelected()?`● ${entry.name}`:'●');
        button.title=underPanel?`操作欄の下へ移動表示：3D骨 ${entry.name} を選択`:`3D骨 ${entry.name} を選択`;
      }
    }
  }
  function schedulePosition(){
    if(disposed||pending)return;
    pending=requestAnimationFrame(()=>{pending=0;positionMarkers();});
  }
  const offInvalidate=viewport.onInvalidate(schedulePosition);
  function refresh(){
    if(disposed)return;
    const model=getModel();
    const nextSkeleton=model?.format==='PMX'?model.object?.skeleton:null;
    if(nextSkeleton!==skeleton){skeleton=nextSkeleton;entries=inspect(model);renderKey='';}
    const selected=getSelected()||'';
    const query=search.value.trim().toLocaleLowerCase();
    const key=String(model?.object?.uuid||'')+'\u0000'+selected+'\u0000'+query+'\u0000'+tree.open+'\u0000'+controls.open;
    if(key!==renderKey){
      renderKey=key;
      const matches=entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query));
      const fragment=document.createDocumentFragment();
      for(const entry of matches){
        const button=document.createElement('button');button.type='button';button.className='v110-bone-row';
        button.textContent=entry.name;button.dataset.bone=entry.name;
        button.style.paddingLeft=(8+entry.depth*12)+'px';
        button.setAttribute('aria-pressed',String(entry.name===selected));
        button.title=entry.unique?'階層 '+entry.depth+' / '+entry.name:'同名の骨が複数あるため、この名前からは編集できません';
        button.disabled=!entry.unique;
        button.addEventListener('click',()=>onSelect(entry.name));fragment.append(button);
      }
      list.replaceChildren(fragment);
      status.textContent=entries.length?`${matches.length} / ${entries.length} 骨${matches.some(entry=>!entry.unique)?'。同名骨は選択不可':''}`:'実PMXモデルを選択してください';
      overlay.replaceChildren();markers=[];
      if(controls.open&&entries.length){
        const candidates=query&&tree.open?matches.filter(entry=>entry.unique).slice(0,12):
          entries.filter(entry=>entry.name===selected&&entry.unique).slice(0,1);
        for(const entry of candidates){
          const button=document.createElement('button');button.type='button';
          button.className='v110-bone-marker';button.dataset.bone=entry.name;
          button.textContent=entry.name===selected?`● ${entry.name}`:'●';
          button.title=`3D骨 ${entry.name} を選択`;
          button.setAttribute('aria-label',button.title);
          button.addEventListener('click',()=>onSelect(entry.name));
          overlay.append(button);markers.push({entry,button});
        }
      }
    }
    overlay.hidden=!controls.open||!entries.length||!markers.length;
    schedulePosition();
  }
  search.addEventListener('input',refresh);
  tree.addEventListener('toggle',refresh);
  controls.addEventListener('toggle',refresh);
  function dispose(){
    if(disposed)return;disposed=true;
    offInvalidate();if(pending)cancelAnimationFrame(pending);
    tree.remove();overlay.remove();markers=[];entries=[];skeleton=null;
  }
  refresh();
  return {refresh,dispose};
}
