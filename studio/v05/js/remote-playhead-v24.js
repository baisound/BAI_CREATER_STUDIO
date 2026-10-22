/* Sync playhead changes made through HTTP / MCP / WebMCP to an open browser.
 * Read-only polling: never writes to the server; generation guards project switching.
 */
(function(root){'use strict';
 function create({read,apply,onError=()=>{}}){
   if(typeof read!=='function'||typeof apply!=='function')throw new TypeError('read/apply functions required');
   let projectId=null, revision=null, generation=0, busy=false, suspended=false;
   function select(id,knownRevision=null){generation++;projectId=id||null;revision=knownRevision;busy=false;}
   function localWrite(rev){revision=rev;suspended=false;}
   function suspend(value){suspended=Boolean(value);}
   async function poll(){
     if(!projectId||busy||suspended)return false;
     const g=generation,id=projectId;busy=true;
     try {
       const state=await read(id);
       if(g!==generation||id!==projectId||suspended)return false;
       if(!state||!Number.isFinite(state.seconds)||state.seconds<0||!Number.isInteger(state.revision))throw new TypeError('Invalid playhead payload');
       if(revision!==null&&state.revision===revision)return false;
       revision=state.revision;
       await apply(state.seconds,state.revision,id);
       return true;
     }catch(error){if(g===generation)onError(error);return false;}
     finally{if(g===generation)busy=false;}
   }
   function status(){return {projectId,revision,busy,suspended};}
   return Object.freeze({select,localWrite,suspend,poll,status});
 }
 root.BAIStudioRemotePlayhead=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
