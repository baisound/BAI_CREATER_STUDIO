/* Bridge camera diagnostic events to existing privacy-scrubbed rotating JSONL log. */
(function(root){'use strict';
  function install({post=(body)=>fetch('/api/studio/v05/diagnostic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}={}){
    const handler=(e)=>{const d=e.detail||{};if(d.category!=='camera'||!/^([a-z][a-z0-9_]{0,63})$/.test(d.code||''))return;
      const payload={category:'camera',code:d.code,level:d.level,projectId:d.projectId??null,frame:Number.isFinite(d.frame)?d.frame:null};
      Promise.resolve().then(()=>post(payload)).catch(()=>{});
    };
    root.addEventListener('bai:diagnostic',handler);
    return ()=>root.removeEventListener('bai:diagnostic',handler);
  }
  root.BAIStudioCameraDiagnosticsV31={install};
})(typeof window!=='undefined'?window:globalThis);
