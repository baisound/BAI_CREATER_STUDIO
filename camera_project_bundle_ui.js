(()=>{'use strict';
const $=id=>document.getElementById(id);let busy=false;
const core=window.BAICameraBundleCore;if(!core)throw Error('カメラ統合保存の共通部品を読み込めません');
const report=s=>{$('bundle-status').textContent=s};
async function api(method,body,revision){const r=await fetch('/api/project/bundle',{method,headers:method==='POST'?{'Content-Type':'application/json','If-Match':revision||''}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||('HTTP '+r.status));return data;}
function currentCamera(){let state;window.dispatchEvent(new CustomEvent('bai-camera-bundle-snapshot',{detail:{resolve:p=>{state=p}}}));if(!state)throw Error('カメラプロジェクトが未準備です');return state;}
function currentWorkspace(){let value;window.dispatchEvent(new CustomEvent('bai-camera-workspace-snapshot',{detail:{resolve:v=>{value=v}}}));if(!value)throw Error('素材選択がまだ準備できていません');return value;}
async function restoreWorkspace(value){await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('bai-camera-workspace-restore',{detail:{workspace:value,resolve,reject}})));}
async function operation(fn){if(busy)return;busy=true;$('bundle-save').disabled=true;$('bundle-load').disabled=true;try{await fn()}catch(e){report('失敗: '+e.message)}finally{busy=false;$('bundle-save').disabled=false;$('bundle-load').disabled=false}}
$('bundle-save').onclick=()=>operation(async()=>{const existing=await api('GET');if(!existing.combination)throw Error('コンビネーションが未保存です。先にメイン画面で保存してください');const camera=currentCamera();await api('POST',core.buildBundleBody({combination:existing.combination,camera,workspace:currentWorkspace()}),existing.revision);report('統合保存しました（カメラ・コンビネーション・4形式のキャラクター参照・フレーム。GLB/VRMのクリップ索引を含み、VMD/FBXモーション本体は含みません）')});
$('bundle-load').onclick=()=>operation(async()=>{const existing=await api('GET');core.validateRestore(existing);if(!window.confirm('編集中の未保存変更を破棄し、カメラを保存済み状態に戻しますか？'))return;if(!existing.workspace)throw Error('旧形式にはモデル・再生位置がありません。完全復元不可');await restoreWorkspace(existing.workspace);await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('bai-camera-bundle-restore',{detail:{project:existing.camera,frame:existing.workspace.frame,confirmed:true,resolve,reject}})));report('カメラ・素材・再生位置を復元しました（外部VMDとメイン編集画面の再適用は対象外）')});
})();
