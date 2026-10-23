/* Preview-only focus depth classification; never included in exports. */
export function installFocusColorUI(doc=document,win=window){
 const toggle=doc.getElementById('v49-focus-colors'),input=doc.getElementById('v49-focus-tolerance');
 if(!toggle||!input)return {dispose(){}};
 const update=()=>{const value=Number(input.value);const tolerance=Number.isFinite(value)&&value>=0?value:0.1;
  if(!Number.isFinite(value)||value<0)input.value=String(tolerance);
  win.dispatchEvent(new CustomEvent('bai:shooting-focus-color-mode',{detail:{enabled:toggle.checked,tolerance}}));};
 toggle.addEventListener('change',update);input.addEventListener('change',update);
 return {dispose(){toggle.removeEventListener('change',update);input.removeEventListener('change',update);}};
}
if(typeof document!=='undefined')installFocusColorUI();
