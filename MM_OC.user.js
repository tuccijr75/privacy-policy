// ==UserScript==
// @name         MM Organized Crime Tracker [QA]
// @namespace    mm-torn.oc
// @version      0.1.0-alpha.4
// @description  QA-only: faction OC history, per-role evidence, and manual team planning.
// @match        https://www.torn.com/*
// @noframes
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/mm-oc-tracker-qa/MM_OC.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/mm-oc-tracker-qa/MM_OC.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==
(() => {
'use strict';
const VERSION='0.1.0-alpha.4', PREFIX='mm.oc.v1.', MAX_CRIMES=3000, PAGE_LIMIT=100, PAGE_CAP=35, MIN_SYNC_MS=120000;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeInt=v=>Number.isSafeInteger(v)&&v>=0;
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeCrime=c=>{
 if(!isObject(c)||!safeInt(c.id)||typeof c.name!=='string'||!Array.isArray(c.slots)||!['Recruiting','Planning','Successful','Failure','Expired'].includes(c.status))return null;
 const slots=[];
 for(const s of c.slots){if(!isObject(s)||!isObject(s.position_info)||typeof s.position_info.id!=='string'||typeof s.position!=='string')return null;
 const uid=s.user?.id; if(s.user!==null && (!isObject(s.user)||!safeInt(uid)))return null;
 slots.push({role:s.position,slotId:s.position_info.id,label:String(s.position_info.label||s.position),memberId:s.user?uid:null,cpr:s.user&&Number.isFinite(s.checkpoint_pass_rate)&&s.checkpoint_pass_rate>=0&&s.checkpoint_pass_rate<=100?s.checkpoint_pass_rate:null,progress:s.user&&Number.isFinite(s.user.progress)?s.user.progress:null,itemMissing:!!(s.item_requirement&&!s.item_requirement.is_available)});
 }
 return {id:c.id,name:c.name,difficulty:safeInt(c.difficulty)?c.difficulty:0,status:c.status,executedAt:safeInt(c.executed_at)?c.executed_at:null,createdAt:safeInt(c.created_at)?c.created_at:null,slots};
};
const normalizeCrimes=p=>{if(!isObject(p)||!Array.isArray(p.crimes))throw Error('Invalid crimes response');const valid=p.crimes.map(normalizeCrime);if(valid.includes(null))throw Error('Unrecognized Torn crime schema; data not stored');return valid;};
const outcome=c=>c.status==='Successful'?1:c.status==='Failure'?0:null;
const evidence=(crimes,memberId,crimeName,role)=>{let attempts=0,wins=0,cprSum=0,cprN=0,last=0;for(const c of crimes){if(c.name!==crimeName)continue;for(const s of c.slots){if(s.memberId!==memberId||s.role!==role)continue; if(s.cpr!==null){cprSum+=s.cpr;cprN++;} const result=outcome(c);if(result!==null){attempts++;wins+=result;last=Math.max(last,c.executedAt||0);}}}return {attempts,wins,cprN,avgCpr:cprN?cprSum/cprN:null,last};};
// Whole-crime success is associative evidence, NOT an individual checkpoint pass result.
const score=e=>{const prior=0.5,history=(e.wins+4*prior)/(e.attempts+4);const rate=e.avgCpr===null?null:e.avgCpr/100;const blended=rate===null?history:(0.75*rate+0.25*history);return {value:blended,confidence:e.cprN?Math.min(0.95,0.3+0.08*e.cprN+0.018*e.attempts):Math.min(0.65,0.12+0.025*e.attempts),source:rate===null?'History proxy':'Observed CPR + history'};};
// Exact maximum-weight distinct-member assignment (rectangular Hungarian algorithm).
// Includes dummy candidates for open roles that cannot be filled.
const optimizeAssignment=(options)=>{
 const slots=options.length;if(!slots)return [];
 const byId=new Map();
 for(const o of options)for(const c of o.candidates)byId.set(c.id,c.id);
 const ids=[...byId.keys()].sort((a,b)=>a-b);
 const columns=ids.length+slots;
 const weights=options.map(o=>ids.map(id=>{const c=o.candidates.find(x=>x.id===id);return c?c.s.value*c.s.confidence:-1e5;}).concat(Array(slots).fill(0)));
 const u=Array(slots+1).fill(0),v=Array(columns+1).fill(0),p=Array(columns+1).fill(0),way=Array(columns+1).fill(0);
 for(let i=1;i<=slots;i++){
  p[0]=i;let j0=0;const minv=Array(columns+1).fill(Infinity),used=Array(columns+1).fill(false);
  do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=columns;j++)if(!used[j]){const cur=-weights[i0-1][j-1]-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<delta){delta=minv[j];j1=j;}}
   for(let j=0;j<=columns;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
   j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0!==0);
 }
 const selected=[];for(let j=1;j<=columns;j++){const row=p[j]-1;if(row<0||j>ids.length)continue;const member=options[row].candidates.find(c=>c.id===ids[j-1]);if(member)selected.push({slot:options[row].slot,member,rank:member.s.value*member.s.confidence});}
 return selected.sort((a,b)=>options.findIndex(o=>o.slot===a.slot)-options.findIndex(o=>o.slot===b.slot));
};
const recommendations=(crime,members,history)=>{
 const used=new Set(crime.slots.filter(s=>s.memberId!==null).map(s=>s.memberId));
 const open=crime.slots.filter(s=>s.memberId===null);
 const eligible=members.filter(m=>!used.has(m.id)&&!m.isInOc);
 const options=open.map(slot=>({slot,candidates:eligible.map(m=>{const e=evidence(history,m.id,crime.name,slot.role);return {...m,e,s:score(e)};}).filter(m=>m.e.cprN>0||m.e.attempts>0).sort((a,b)=>(b.s.value*b.s.confidence-a.s.value*a.s.confidence)||a.id-b.id)}));
 return {options,selected:optimizeAssignment(options)};
};
const nextCrimeOffset=(page,current)=>{
 const metadata=page?._metadata;
 if(!isObject(metadata))throw Error('Missing Torn crime pagination metadata');
 const next=isObject(metadata.links)?metadata.links.next:metadata.next;
 if(next===null)return null;
 if(typeof next!=='string')throw Error('Missing or invalid Torn pagination next link');
 let url;try{url=new URL(next);}catch{throw Error('Malformed Torn pagination link');}
 if(url.origin!=='https://api.torn.com'||url.pathname!=='/v2/faction/crimes')throw Error('Unexpected Torn pagination destination');
 const raw=url.searchParams.get('offset');
 if(raw===null||!/^(0|[1-9][0-9]*)$/.test(raw))throw Error('Missing pagination offset');
 const offset=Number(raw);
 if(!safeInt(offset)||offset<=current)throw Error('Non-advancing pagination offset');
 return offset;
};
const exportModel=(crimes,members)=>JSON.stringify({schema:1,version:VERSION,exportedAt:new Date().toISOString(),members,crimes},null,2);
if(typeof module!=='undefined'&&module.exports){module.exports={normalizeCrime,normalizeCrimes,evidence,score,recommendations,optimizeAssignment,nextCrimeOffset,exportModel};return;}
const store={get:(key,def)=>{try{if(typeof GM_getValue!=='function')return def;const raw=GM_getValue(PREFIX+key);return raw==null?def:JSON.parse(raw);}catch{return def;}},set:(key,val)=>{const str=JSON.stringify(val);if(typeof GM_setValue!=='function')throw Error('Secure userscript storage unavailable');GM_setValue(PREFIX+key,str);}};
let state={crimes:store.get('crimes',[]),members:store.get('members',[]),updated:store.get('updated',{}),key:store.get('key',''),selected:0,busy:false,tab:'planner',error:'',status:''};
const changeKey=(next)=>{
 if(next===state.key)return false;
 if(state.busy){state.status='Synchronization in progress. Change the key after it finishes.';return false;}
 if((state.crimes.length||state.members.length)&&!confirm('Changing the key clears existing local OC history and roster. Export first if needed. Continue?'))return false;
 state.key=next;state.crimes=[];state.members=[];state.updated={};state.selected=0;
 store.set('key',next);store.set('crimes',[]);store.set('members',[]);store.set('updated',{});
 state.status='API key changed: prior faction history cleared to prevent cross-faction mixing.';
 return true;
};
const request=(path,params={},apiKey=state.key)=>new Promise((resolve,reject)=>{const url=new URL('https://api.torn.com/v2/'+path);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));});const finish=(status,text)=>{try{const data=JSON.parse(text);if(isObject(data.error))return reject(Error(`Torn API error ${data.error.code}: ${data.error.error}`));if(status<200||status>=300)return reject(Error('Torn API HTTP '+status));resolve(data);}catch(e){reject(e);}};if(typeof GM_xmlhttpRequest!=='function')return reject(Error('GM_xmlhttpRequest unavailable'));GM_xmlhttpRequest({method:'GET',url:url.toString(),headers:{Authorization:'ApiKey '+apiKey},timeout:15000,onload:r=>finish(r.status,r.responseText),onerror:()=>reject(Error('Network error')),ontimeout:()=>reject(Error('Request timed out'))});});
const validateMember=p=>{if(!isObject(p)||!Array.isArray(p.members))throw Error('Invalid faction members response');return p.members.filter(m=>isObject(m)&&safeInt(m.id)&&typeof m.name==='string').map(m=>({id:m.id,name:m.name,isInOc:!!m.is_in_oc}));};
async function sync(){if(state.busy)return;if(!/^[A-Za-z0-9]{12,32}$/.test(state.key)){state.error='Enter a valid Torn API key locally.';render();return;}if(Date.now()-(state.updated.sync||0)<MIN_SYNC_MS){state.status='Recently synchronized; API budget protected.';render();return;}
state.busy=true;state.error='';state.status='Reading faction members and crimes…';const apiKey=state.key;render();try{
const members=validateMember(await request('faction/members',{},apiKey));const accum=new Map(state.crimes.map(c=>[c.id,c]));let offset=0,complete=false,pages=0;
for(let i=0;i<PAGE_CAP;i++){const p=await request('faction/crimes',{cat:'all',limit:PAGE_LIMIT,offset,sort:'DESC'},apiKey);const crimes=normalizeCrimes(p);crimes.forEach(c=>accum.set(c.id,c));pages++;const next=nextCrimeOffset(p,offset);if(next===null){complete=true;break;}offset=next;}
// Preserve the existing ledger if any page fails; commit only after successful page parsing.
if(state.key!==apiKey)throw Error('API key changed during sync; refusing to mix faction records');
state.members=members;state.crimes=[...accum.values()].sort((a,b)=>(b.executedAt||b.createdAt||0)-(a.executedAt||a.createdAt||0)).slice(0,MAX_CRIMES);
state.updated={...state.updated,sync:Date.now(),source:null,pages,complete};store.set('members',state.members);store.set('crimes',state.crimes);store.set('updated',state.updated);state.status=`Loaded ${state.crimes.length} unique crimes, ${members.length} members. ${complete?'Pagination complete.':'History truncated at safety cap.'} Torn upstream source timestamp unavailable.`;
}catch(e){state.error=e.message||String(e);}finally{state.busy=false;render();}}
let root;
function download(){const blob=new Blob([exportModel(state.crimes,state.members)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='MM_OC.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function render(){if(!root)return;const sel=state.crimes.find(c=>c.id===state.selected)||state.crimes.find(c=>['Recruiting','Planning'].includes(c.status))||state.crimes[0];if(sel)state.selected=sel.id;
const plan=sel?recommendations(sel,state.members,state.crimes):null;const freshness=state.updated.sync?new Date(state.updated.sync).toLocaleString():'Never';const stale=!state.updated.sync||Date.now()-state.updated.sync>10*60*1000;
root.innerHTML=`<div class="mmoc-head"><strong>MM Organized Crime Tracker</strong> <small>${VERSION}</small><button data-action="close" aria-label="Close">×</button></div><div class="mmoc-body"><div class="mmoc-row"><label>Faction API key <input data-field="key" type="password" value="${escapeHtml(state.key)}" placeholder="Local key" autocomplete="off"></label><button data-action="savekey" ${state.busy?'disabled':''}>Save key</button><button data-action="sync" ${state.busy?'disabled':''}>${state.busy?'Syncing…':'Sync'}</button></div><p class="mmoc-muted">${escapeHtml(state.status)} | Last fetched: ${escapeHtml(freshness)} ${stale?'(stale)':''}</p>${state.error?`<p class="mmoc-error" role="alert">${escapeHtml(state.error)}</p>`:''}<div class="mmoc-tabs"><button data-tab="planner">Team planner</button><button data-tab="rankings">Role rankings</button><button data-tab="history">History</button><button data-tab="settings">Data / privacy</button></div>
${state.tab==='planner'?`<label>Crime <select data-field="crime">${state.crimes.filter(c=>['Recruiting','Planning'].includes(c.status)).concat(sel&&!['Recruiting','Planning'].includes(sel.status)?[sel]:[]).map(c=>`<option value="${c.id}" ${c.id===state.selected?'selected':''}>${escapeHtml(c.name)} #${c.id} (${escapeHtml(c.status)})</option>`).join('')}</select></label>${sel?`<p>${escapeHtml(sel.name)} · difficulty ${sel.difficulty} · ${escapeHtml(sel.status)}</p><table><tr><th>Slot</th><th>Recommended member</th><th>Evidence</th><th>Confidence</th></tr>${sel.slots.map(s=>{const pick=plan.selected.find(p=>p.slot.slotId===s.slotId);const filled=state.members.find(m=>m.id===s.memberId);return `<tr><td>${escapeHtml(s.label)}</td><td>${filled?escapeHtml(filled.name)+' (assigned)':pick?escapeHtml(pick.member.name):'Insufficient evidence'}</td><td>${filled?s.cpr===null?'CPR unavailable':`API CPR ${s.cpr}%`:pick?`${pick.member.e.attempts} team outcomes; ${pick.member.e.cprN} CPR observations`:'—'}</td><td>${pick?Math.round(pick.member.s.confidence*100)+'% evidence confidence':'Unknown'}</td></tr>`}).join('')}</table><p class="mmoc-muted">Only members with role-specific evidence are suggested; others remain unranked. Recommendations are read-only. Whole-crime outcomes are not individual role successes. Suggestions have no guaranteed success probability.</p>`:'No crime data. Sync to begin.'}`:''}
${state.tab==='rankings'?`<table><tr><th>Member</th><th>Crime</th><th>Role</th><th>History</th><th>Observed CPR</th></tr>${(()=>{const rows=[];const names=new Set(state.crimes.map(c=>c.name));for(const c of names){const roles=new Set(state.crimes.filter(x=>x.name===c).flatMap(x=>x.slots.map(s=>s.role)));for(const role of roles)for(const m of state.members){const e=evidence(state.crimes,m.id,c,role);if(e.attempts||e.cprN)rows.push({m,c,role,e});}}return rows.sort((a,b)=>score(b.e).confidence*score(b.e).value-score(a.e).confidence*score(a.e).value).slice(0,100).map(r=>`<tr><td>${escapeHtml(r.m.name)}</td><td>${escapeHtml(r.c)}</td><td>${escapeHtml(r.role)}</td><td>${r.e.wins}/${r.e.attempts} crime outcomes</td><td>${r.e.avgCpr===null?'Unknown':r.e.avgCpr.toFixed(1)+'%'}</td></tr>`).join('')})()}</table>`:''}
${state.tab==='history'?`<table><tr><th>Crime</th><th>Result</th><th>Participants</th><th>Executed</th></tr>${state.crimes.slice(0,100).map(c=>`<tr><td>${escapeHtml(c.name)} #${c.id}</td><td>${escapeHtml(c.status)}</td><td>${c.slots.filter(s=>s.memberId!==null).length}/${c.slots.length}</td><td>${c.executedAt?new Date(c.executedAt*1000).toLocaleString():'—'}</td></tr>`).join('')}</table>`:''}
${state.tab==='settings'?`<p>Stored locally: faction roster, OC history, and API key. No third-party requests; only api.torn.com.</p><p>Source: faction/members and faction/crimes. Community algorithms are not imported. The crimeexp endpoint requires schema validation before integration.</p><p>History: ${state.crimes.length}/${MAX_CRIMES} bounded entries; ${state.updated.complete?'full pagination reached':'partial or not synced'}.</p><button data-action="export">Export JSON</button><button data-action="clear">Clear local data</button>`:''}</div>`;
}
function mount(){if(document.getElementById('mmoc-launcher'))return;const btn=document.createElement('button');btn.id='mmoc-launcher';btn.title='MM Organized Crime Tracker';btn.textContent='OC';btn.style.cssText='position:fixed;bottom:90px;left:12px;z-index:2147483645;background:#173d48;color:white;border:1px solid #7192a0;border-radius:10px;padding:10px;cursor:pointer';document.body.appendChild(btn);root=document.createElement('section');root.id='mmoc-panel';root.setAttribute('aria-label','MM Organized Crime Tracker');root.style.display='none';document.body.appendChild(root);const style=document.createElement('style');style.textContent=`#mmoc-panel{position:fixed;z-index:2147483646;bottom:140px;left:12px;width:min(800px,calc(100vw - 24px));max-height:min(75vh,720px);overflow:auto;background:#16202a;color:#eee;border:1px solid #52677a;border-radius:12px;box-shadow:0 5px 25px #0008;font:13px Arial,sans-serif}#mmoc-panel *{box-sizing:border-box}#mmoc-panel button,#mmoc-panel select,#mmoc-panel input{background:#243747;color:#fff;border:1px solid #63798c;border-radius:5px;padding:7px}#mmoc-panel button{cursor:pointer}#mmoc-panel button:focus-visible,#mmoc-launcher:focus-visible{outline:2px solid #79d9e8}#mmoc-panel label{display:inline-flex;align-items:center;gap:6px}#mmoc-panel .mmoc-head{position:sticky;top:0;background:#1e3442;padding:12px;display:flex;align-items:center;gap:12px;justify-content:space-between}#mmoc-panel .mmoc-body{padding:12px}#mmoc-panel .mmoc-row,#mmoc-panel .mmoc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}#mmoc-panel table{border-collapse:collapse;width:100%;font-size:12px}#mmoc-panel td,#mmoc-panel th{text-align:left;border-bottom:1px solid #425464;padding:8px 5px}#mmoc-panel .mmoc-muted{color:#a9bdca}#mmoc-panel .mmoc-error{color:#ff9b9b}`;document.head.appendChild(style);btn.onclick=()=>{root.style.display=root.style.display==='none'?'block':'none';render()};root.addEventListener('click',e=>{const a=e.target.closest('[data-action]');const t=e.target.closest('[data-tab]');if(t){state.tab=t.dataset.tab;render();return;}if(!a)return;switch(a.dataset.action){case'close':root.style.display='none';break;case'savekey':{const v=root.querySelector('[data-field="key"]').value.trim();const changed=changeKey(v);if(!changed){state.status=v===state.key?'Existing API key retained.':'Key change canceled; previous data retained.';}render();break;}case'sync':{const requested=root.querySelector('[data-field="key"]').value.trim();if(requested!==state.key&&!changeKey(requested)){state.status='Key change canceled; synchronization not started.';render();break;}sync();}break;case'export':download();break;case'clear':if(state.busy){state.status='Wait for sync to finish before clearing local data.';render();break;}if(confirm('Permanently clear this script’s locally stored key, members and crime history?')){state.key='';state.crimes=[];state.members=[];state.updated={};for(const k of ['key','crimes','members','updated'])store.set(k,k==='key'?'':k==='updated'?{}:[]);state.status='Local data cleared.';render();}break;}});root.addEventListener('change',e=>{if(e.target.dataset.field==='crime'){state.selected=Number(e.target.value);render();}});render();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();