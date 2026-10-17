/* WebMCP imperative integration. Supports browsers exposing document.modelContext. */
(()=>{
 'use strict';
 const byId=id=>document.getElementById(id);
 const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
 const str={type:'string'}, integer={type:'integer'};
 const validIndex=n=>Number.isInteger(n)&&n>=1&&n<=rows.length;
 const toolSpecs=[];
 function def(name,description,inputSchema,handler,readOnly=false){toolSpecs.push({name,description,inputSchema,handler,readOnly});}
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function request(path,options){const r=await fetch(path,options);if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
 const currentRow=()=>rows[current];
 def('mixamo_list_patterns','Search the preinstalled Japanese/English motion combinations by name or category.',schema({query:str,limit:{type:'integer',minimum:1,maximum:100}}),({query='',limit=30})=>({total:rows.length,patterns:rows.filter(r=>(r.title+' '+r.mixamo+' '+r.category+' '+r.steps.join(' ')).toLowerCase().includes(query.toLowerCase())).slice(0,limit).map(r=>({id:r.id,title:r.title,category:r.category,steps:r.steps,registered:!!window.motionAvailability?.(r)}))}),true);
 def('mixamo_list_imported_fbx','List locally stored FBX files and Mixamo motion mapping. No file bytes are sent externally.',schema(),async()=>await request('/api/manifest'),true);
 def('mixamo_select_pattern','Select a built-in pattern in the visible UI by 1-based pattern ID.',schema({id:integer},['id']),({id})=>{if(!validIndex(id))throw Error('Pattern ID out of range');select(id-1);return {ok:true,id,title:currentRow().title};});
 def('mixamo_search_favorites','Find saved favorite combinations by name or tags.',schema({query:str}),({query=''})=>({favorites:favorites.filter(f=>(f.name+' '+(f.tags||[]).join(' ')).toLowerCase().includes(query.toLowerCase())).map(f=>({id:f.id,name:f.name,tags:f.tags,steps:f.steps}))}),true);
 def('mixamo_get_chain','Get current editable combo steps and playback state.',schema(),()=>({steps:chain.map(x=>({...x})),playing:comboPlaying,clock:window.comboClock}),true);
 def('mixamo_add_selected_to_chain','Add the selected pattern to the combo only if all required FBX clips are registered.',schema(),()=>{const r=currentRow();if(!window.motionAvailability?.(r))throw Error('Selected pattern has missing FBX clips');const button=byId('chain-add');button.click();return {ok:true,steps:chain.map(s=>s.name)};});
 def('mixamo_add_clip_to_chain','Append a registered motion clip by exact Mixamo name (not a path).',schema({name:str},['name']),({name})=>{if(!window.isClipRegistered?.(name))throw Error('Motion is not registered: '+name);if(chain.length>=100)throw Error('Maximum 100 steps');chain.push({name});renderChain();return {ok:true,steps:chain.map(s=>s.name)};});
 def('mixamo_reorder_chain','Move a combo step using zero-based indices.',schema({from:integer,to:integer},['from','to']),({from,to})=>{if(from<0||from>=chain.length||to<0||to>=chain.length)throw Error('Index out of range');const [step]=chain.splice(from,1);chain.splice(to,0,step);renderChain();return {ok:true,steps:chain.map(s=>s.name)};});
 def('mixamo_play_chain','Play the active combination in the viewport.',schema(),()=>{if(!chain.length)throw Error('Chain is empty');byId('chain-play').click();return {ok:true,steps:chain.length};});
 def('mixamo_save_project','Persist current project via the existing Save button and local project API.',schema(),async()=>{byId('project-save').click();await wait(600);const state=await request('/api/project');return {ok:true,steps:state.timeline?.length||0,updatedAt:state.updatedAt||null};});
 def('mixamo_get_project','Read saved project state and history metadata.',schema(),async()=>await request('/api/project'),true);
 def('mixamo_undo','Undo the last combo edit using the existing history mechanism.',schema(),()=>{byId('project-undo').click();return {ok:true,steps:chain.map(s=>s.name)};});
 def('mixamo_redo','Redo a combo edit using the existing history mechanism.',schema(),()=>{byId('project-redo').click();return {ok:true,steps:chain.map(s=>s.name)};});
 def('mixamo_export_vmd_job','Create the existing VMD conversion job JSON (Blender execution is a separate step).',schema(),async()=>{if(!chain.length)throw Error('Chain is empty');byId('vmd-job').click();await wait(800);return {ok:true,message:byId('vmd-job-status').textContent,warning:'Job preparation does not generate a validated VMD. Run Blender conversion separately.'};});
 def('mixamo_set_search','Set the motion-catalog search field in the visible UI.',schema({query:str},['query']),({query})=>{byId('filter').value=query;byId('filter').dispatchEvent(new Event('input',{bubbles:true}));return {ok:true,query};});
 def('mixamo_integrated_v02_search','Search merged v02 VRM/GLB motion catalog (metadata only, not playback).',schema({query:str,category:str}),async({query='',category=''})=>({matches:await window.integratedV02.search(query,category)}),true);
 def('mixamo_list_all_assets','List all registered FBX, GLB, VRM, PMX and VMD metadata from one inventory.',schema(),async()=>await request('/api/assets'),true);
 def('mixamo_integrated_v02_models','List the integrated source VRM models and review status.',schema(),async()=>({models:await window.integratedV02.models()}),true);
 def('mixamo_integrated_preview','Preview a registered GLB animation or a VRM static model and return clip information.',schema({asset:str},['asset']),async({asset})=>await window.integratedPreviewV02.load(asset));
 def('mixamo_integrated_retarget','Experimentally retarget current animated GLB rotations to selected registered VRM. Does not change source files.',schema({asset:str,target:str},['asset','target']),async({asset,target})=>{await window.integratedPreviewV02.load(asset);byId('iv-target').value=target;if(byId('iv-target').value!==target)throw Error('VRM target not registered');return await window.integratedPreviewV02.transfer()});
 def('mixamo_integrated_preview_qa','Read coarse floor penetration AABB QA for current preview.',schema(),()=>window.integratedPreviewV02.check(),true);
 window.mixamoWebMcpDiagnostics={supported:!!document.modelContext?.registerTool,tools:toolSpecs.map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema})),registered:[],errors:[]};
 async function register(){if(!document.modelContext?.registerTool){console.info('[Mixamo WebMCP] Browser does not expose document.modelContext. Standard UI remains usable.');return;}
  for(const t of toolSpecs){try{await document.modelContext.registerTool({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:{readOnlyHint:t.readOnly},execute:async input=>{try{return {content:[{type:'text',text:JSON.stringify(await t.handler(input||{}))}]};}catch(e){return {content:[{type:'text',text:JSON.stringify({ok:false,error:String(e.message||e)})}],isError:true};}}});window.mixamoWebMcpDiagnostics.registered.push(t.name);}catch(e){window.mixamoWebMcpDiagnostics.errors.push({tool:t.name,error:String(e)});}}
 }
 register();
})();
