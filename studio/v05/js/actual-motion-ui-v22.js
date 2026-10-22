/* v0.5 actual WebGL viewer: explicitly opt in. The existing reconciliation loop
 * will call the same model/motion loaders after they have been registered. */
import {createActualMotionLoaders} from './actual-motion-loader-v22.js';
const open=document.getElementById('v22-open');
const close=document.getElementById('v22-close');
const panel=document.getElementById('v22-panel');
const status=document.getElementById('v22-status');
let instance=null;
function announce(message) {status.textContent=message;}
function stop(){
  window.BAIStudioAssetRuntime?.setLoader(null);
  window.BAIStudioAssetRuntime?.setModelLoader(null);
  window.BAIStudioAssetRuntime?.detachAll();
  instance?.dispose();instance=null;panel.classList.remove('open');
  announce('3Dプレビューを終了しました。');
}
open?.addEventListener('click',()=>{
  if(instance){stop();return;}
  panel.classList.add('open');
  instance=createActualMotionLoaders(document.getElementById('v22-preview'),announce);
  const runtime=window.BAIStudioAssetRuntime;
  if(!runtime){announce('素材の管理機構が利用できません。');stop();return;}
  runtime.setModelLoader(instance.loadTarget);
  runtime.setLoader(instance.loadMotion);
  announce('実3Dローダーを接続しました。素材の更新または再読み込み時に描画します。');
  document.dispatchEvent(new CustomEvent('bai:v22-loader-ready'));
  document.getElementById('v18linkCheck')?.click();
});
close?.addEventListener('click',stop);
window.addEventListener('pagehide',stop,{once:true});
