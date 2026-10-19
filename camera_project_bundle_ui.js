(()=>{'use strict';
const $=id=>document.getElementById(id);let busy=false;
const report=s=>{$('bundle-status').textContent=s};
async function api(method,body){const r=await fetch('/api/project/bundle',{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||('HTTP '+r.status));return data;}
function currentCamera(){let state;window.dispatchEvent(new CustomEvent('bai-camera-bundle-snapshot',{detail:{resolve:p=>{state=p}}}));if(!state)throw Error('カメラプロジェクトが未準備です');return state;}
async function operation(fn){if(busy)return;busy=true;$('bundle-save').disabled=true;$('bundle-load').disabled=true;try{await fn()}catch(e){report('失敗: '+e.message)}finally{busy=false;$('bundle-save').disabled=false;$('bundle-load').disabled=false}}
$('bundle-save').onclick=()=>operation(async()=>{const existing=await api('GET');if(!existing.combination)throw Error('コンビネーションが未保存です。先にメイン画面で保存してください');const camera=currentCamera();await api('POST',{schema:1,combination:existing.combination,camera});report('統合保存しました（カメラ＋コンビネーションのみ。素材・再生位置は未保存）')});
$('bundle-load').onclick=()=>operation(async()=>{const existing=await api('GET');if(!existing.complete||!existing.combination)throw Error('統合保存データがありません');if(!window.confirm('編集中の未保存変更を破棄し、カメラを保存済み状態に戻しますか？'))return;await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('bai-camera-bundle-restore',{detail:{project:existing.camera,confirmed:true,resolve,reject}})));report('カメラを復元しました。コンビネーションは保存済みデータを使用します（素材・再生位置は対象外）')});
})();
