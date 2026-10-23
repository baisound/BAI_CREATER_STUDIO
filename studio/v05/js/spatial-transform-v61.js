/* v61 Shared XYZ Transform core; all spatial object kinds share the same validation and transaction contract.
 * The registry is renderer-neutral. Adapters for actual Three.js roots live in spatial-ui-v61.js.
 * Stage 62 will cover world/local axes and snapping. */
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BAIStudioSpatialTransformV61 = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TYPES = Object.freeze(['model','camera','light','effect','environment']);
  const FIELDS = Object.freeze(['position','rotation','scale']);
  function normalize(value) {
    if (!value || typeof value !== 'object') throw new TypeError('Transform is required');
    const result = {};
    for (const field of FIELDS) {
      const v = value[field];
      if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== 'number' || !Number.isFinite(n)))
        throw new TypeError('Invalid '+field);
      if (field === 'scale' && v.some(n => n <= 0 || n > 10000)) throw new RangeError('Scale out of bounds');
      if (field === 'position' && v.some(n => Math.abs(n) > 100000)) throw new RangeError('Position out of bounds');
      if (field === 'rotation' && v.some(n => Math.abs(n) > 360000)) throw new RangeError('Rotation out of bounds');
      result[field] = [...v];
    }
    return result;
  }
  function equals(a,b) { return FIELDS.every(k=>a[k].every((v,i)=>v===b[k][i])); }
  function createRegistry({onChange=()=>{},onError=()=>{}}={}) {
    const entries = new Map();
    let selected = null;
    function requireEntry(id = selected) {
      const e = entries.get(id);
      if (!e) throw new Error('Spatial object not registered');
      return e;
    }
    function register(id, {type,read,apply,commit=async()=>{},locked=()=>false}={}) {
      if (typeof id!=='string'||!id||entries.has(id)||!TYPES.includes(type) ||
        typeof read!=='function'||typeof apply!=='function'||
        typeof commit!=='function'||typeof locked!=='function')
        throw new TypeError('Invalid spatial adapter');
      normalize(read());
      entries.set(id,{type,read,apply,commit,locked,begin:null,inFlight:false});
      onChange({type:'register',id});
      return ()=>unregister(id);
    }
    function unregister(id) {
      if (!entries.has(id)) return false;
      entries.delete(id);
      if (selected===id) selected=null;
      onChange({type:'unregister',id});
      return true;
    }
    function select(id) {
      if (id !== null) requireEntry(id);
      selected=id;onChange({type:'selection',id});
    }
    function snapshot(id=selected) {
      const e=requireEntry(id);
      return {id,type:e.type,locked:Boolean(e.locked()),transform:normalize(e.read())};
    }
    function begin(id=selected) {
      const e=requireEntry(id);
      if(e.locked()) throw new Error('Spatial object is locked');
      if(e.begin||e.inFlight)throw new Error('Transform transaction already active');
      e.begin=normalize(e.read());
      return snapshot(id);
    }
    function preview(next,id=selected) {
      const e=requireEntry(id);
      if(e.locked())throw new Error('Spatial object is locked');
      if(!e.begin||e.inFlight)throw new Error('Begin transform first');
      const normalized=normalize(next);
      e.apply(normalized);
      onChange({type:'preview',id,transform:normalized});
      return normalized;
    }
    function axis(field,index,value,id=selected) {
      if(!FIELDS.includes(field)||!Number.isInteger(index)||index<0||index>2 ||
        typeof value!=='number'||!Number.isFinite(value))throw TypeError('Invalid axis value');
      const snap=snapshot(id).transform;
      snap[field][index]=value;
      return preview(snap,id);
    }
    async function finish(id=selected) {
      const e=requireEntry(id);
      if(!e.begin||e.inFlight)throw Error('No transform transaction');
      const original=e.begin, next=normalize(e.read());
      e.begin=null;e.inFlight=true;
      if(e.locked()){e.apply(original);e.inFlight=false;throw Error('Spatial object is locked');}
      if(equals(original,next)){e.inFlight=false;return {changed:false,transform:next};}
      try{
        await e.commit(next,original);
      }catch(error){
        e.apply(original);
        onChange({type:'rollback',id,transform:original});
        onError({id,error});
        throw error;
      }finally{e.inFlight=false;}
      onChange({type:'commit',id,transform:next});
      return {changed:true,transform:next};
    }
    function cancel(id=selected) {
      const e=requireEntry(id);
      if(!e.begin||e.inFlight)return false;
      const original=e.begin;e.begin=null;e.apply(original);
      onChange({type:'rollback',id,transform:original});
      return true;
    }
    function clear(){for(const id of [...entries.keys()])unregister(id);}
    return {register,unregister,select,snapshot,begin,preview,axis,finish,cancel,clear,
      current:()=>selected,ids:()=>[...entries.keys()]};
  }
  return Object.freeze({TYPES,FIELDS,normalize,createRegistry});
});
