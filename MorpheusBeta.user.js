// ==UserScript==
// @name         Morpheus Bazaar Ledger 2 Candidate
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      2.2.0-beta.11
// @description  Shared Torn trade verification, Bazaar sale-log ingestion, 7 PM ET closeout and reports. No automated Torn trades.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/MorpheusBeta.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/MorpheusBeta.user.js
// @noframes
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@5f2bb2030758a73e9bd567a7a1361eab41d510aa/modular-suite/core/MM_Torn_Core.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==
(() => {
 'use strict';
 const dollarScanParams=new URL(location.href).searchParams;
 if(dollarScanParams.has('mmDollarScannerReserve')||dollarScanParams.has('mmDollarScan')||dollarScanParams.has('mmDollarScannerComplete')) return;
 if (window.__morpheusLedgerLoaded) return;
 window.__morpheusLedgerLoaded=true;
 const VERSION='2.2.0-beta.11';
 const prefix='mledger_';
 const read=k=>GM_getValue(prefix+k,'');
 const save=(k,v)=>GM_setValue(prefix+k,String(v??'').trim());
 const cfg=()=>({relay:read('relay'),token:read('token'),torn:read('torn'),partnerId:Number(read('partnerId')||0)});
 const money=n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const numeric=x=>{const n=Number(String(x??'').replace(/[$,\s]/g,''));return Number.isSafeInteger(n)?n:NaN;};
 const uuid=()=>crypto.randomUUID?.()||('mb-'+Date.now()+'-'+Math.random().toString(36).slice(2));
 // New pipeline starts at install time so legacy manually logged sales are not double counted.
 if(!GM_getValue(prefix+'v2SaleStart',''))GM_setValue(prefix+'v2SaleStart',String(Date.now()-120000));
 let state=null,working=false,opened=false,status='Not connected',lastTrades=0,lastLogs=0,lastBazaar=0,lastPurchaseScan=0;
 const scannedTradeIds=new Set();
 const itemNames=new Map();
 const minutes=n=>n*60000;
 function request(url,payload){return new Promise((resolve,reject)=>{
   const finish=r=>{try{if(r.status<200||r.status>=300)throw Error('HTTP '+r.status);const v=JSON.parse(r.responseText);if(v.error)throw Error(typeof v.error==='object'?v.error.error||JSON.stringify(v.error):v.error);resolve(v);}catch(e){reject(e)}};
   GM_xmlhttpRequest({method:payload?'POST':'GET',url,
     headers:payload?{'Content-Type':'text/plain;charset=utf-8'}:{},data:payload?JSON.stringify(payload):undefined,timeout:25000,
     onload:r=>{
       // Apps Script ContentService redirects POST responses to a GET-only googleusercontent URL.
       // If the browser repeats POST and gets 405, fetch that one-time response via GET.
       // Never repeat the original POST, which could duplicate ledger operations.
       if(payload&&r.status===405&&/^https:\/\/script\.googleusercontent\.com\/macros\/echo\?/.test(r.finalUrl||'')){
         GM_xmlhttpRequest({method:'GET',url:r.finalUrl,timeout:25000,onload:finish,
           onerror:()=>reject(Error('Google response redirect failed')),ontimeout:()=>reject(Error('Google response redirect timed out'))});
         return;
       }
       finish(r);
     },
     onerror:()=>reject(Error('Network error')),ontimeout:()=>reject(Error('Request timed out'))});
 });}
 async function api(path,params={}){
   const key=cfg().torn;if(!key)throw Error('Add your own Torn Custom API key to Settings');
   const q=new URLSearchParams({...params,key});return request('https://api.torn.com/v2/'+path+'?'+q);
 }
 function evidenceRequestId(data){
   // Stable across interrupted scans so an accepted-but-unacknowledged batch is not appended twice.
   const raw=JSON.stringify(data);let a=2166136261,b=2246822519;
   for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b^raw.charCodeAt(i),2246822519);}
   return 'evidence-'+(a>>>0).toString(36)+'-'+(b>>>0).toString(36)+'-'+raw.length;
 }
 async function relay(op,data={},reqId=uuid()){
   const c=cfg();if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.relay))throw Error('Google relay URL must end in /exec');
   if(c.token.length<24)throw Error('Missing relay token');
   const r=await request(c.relay,{token:c.token,op,data,reqId});if(!r.ok)throw Error(r.error||'Relay failed');if(r.state)state=r.state;return (op==='evidence_batch'||op==='acquisition_apply_batch')?r:state;
 }
 async function refresh(silent=false){if(working||!cfg().relay||!cfg().token)return;working=true;try{await relay('state');status='Synchronized';}catch(e){status='Sync failed: '+e.message;if(!silent)alert(status);}finally{working=false;draw();}}
 async function writeOp(op,data,message){if(working)return;working=true;try{await relay(op,data);status=message;draw();}catch(e){status='ERROR: '+e.message;alert(status);}finally{working=false;draw();}}
 async function verifyKey(){const r=await api('user/basic');const p=r.profile;if(!p?.id)throw Error('Expected v2 user/basic profile');save('playerId',p.id);save('playerName',p.name);status='Torn API verified: '+p.name+' ['+p.id+']';draw();return p.id;}
 function isPositive(n){return Number.isSafeInteger(n)&&n>0;}
 async function ensurePartnership(ownerId,supplierId){
   if(!isPositive(supplierId))throw Error('Set Morpheus Torn ID in Partner ID before scanning');
   if(state.partnership){
     if(state.partnership.ownerId!==ownerId||state.partnership.morpheusId!==supplierId)
       throw Error('Ledger partnership identity differs from local settings; stop and reconcile before importing');
   }else await relay('partnership_config',{ownerId,morpheusId:supplierId});
   let excluded=0;
   const foreign=state.lots.filter(l=>l.tradeRef&&l.senderId!==supplierId&&['received_pending','awaiting_cost'].includes(l.status)
     &&l.sold===0&&l.returned===0&&l.unitCost==null&&!l.purchaseLogId&&!l.purchaseParts&&!l.originParts);
   for(const l of foreign){await relay('trade_exclude',{lotId:l.id});excluded++;}
   return excluded;
 }
 async function syncTrades(){
   if(state?.role!=='owner')return 0;
   const ownerId=await verifyKey(),supplierId=cfg().partnerId;
   await ensurePartnership(ownerId,supplierId);
   // Import completed trades even if Morpheus never created a proposed lot.
   // Reconcile partnership receipts across the bounded acquisition-history window, not only the last 72 hours.
   // Already-recorded references are idempotent; older receipts must remain discoverable after a device was offline.
   const from=Math.floor((Date.now()-120*86400000)/1000);
   const r=await api('user/trades',{cat:'finished',limit:'100',sort:'DESC',from:String(from)});
   if(!Array.isArray(r.trades))throw Error('Torn trades returned unexpected format');
   let count=0,checked=0;
   for(const t of r.trades){
     if(checked>=25)break;
     if(!isPositive(t.id)||!isPositive(t.completed_at)||t.completed_at<from)continue;
     if(scannedTradeIds.has(t.id))continue;
     if(![t.user?.id,t.trader?.id].includes(ownerId))continue;
     const otherId=t.user.id===ownerId?t.trader.id:t.user.id;
     if(!isPositive(supplierId)||!isPositive(otherId)||otherId!==supplierId)continue;
     // Legacy lots already matched to this trade must not be imported again.
     if(state.lots.some(x=>x.tradeId===t.id&&!x.tradeRef))continue;
     checked++;
     const detail=(await api('user/'+t.id+'/trade')).trade;
     if(!detail||!Array.isArray(detail.items)||!isPositive(detail.completed_at))continue;
     for(let line=0;line<detail.items.length;line++){
       const it=detail.items[line],di=it.details||{},ref=String(t.id)+':'+line;
       if(it.type!=='Item'||it.user_id!==otherId||!isPositive(di.id)||!isPositive(di.amount))continue;
       if(state.lots.some(x=>x.tradeRef===ref))continue;
       const candidates=state.lots.filter(l=>otherId===supplierId&&l.status==='proposed'&&l.mode==='supplier'&&l.itemId===di.id&&l.qty===di.amount&&(l.uid==null||l.uid===di.uid)&&new Date(l.createdAt).getTime()<=detail.completed_at*1000+86400000);
       if(candidates.length===1){
         await relay('trade_verified',{lotId:candidates[0].id,tradeId:t.id,completedAt:detail.completed_at,qty:di.amount,itemId:di.id,uid:di.uid??null,senderId:otherId,receiverId:ownerId});
       }else{
         if(!itemNames.has(di.id)){
           let displayName='Item #'+di.id;
           try{const catalog=await api('torn/'+di.id+'/items');const entry=Array.isArray(catalog.items)?catalog.items.find(x=>x.id===di.id):null;
             if(entry&&typeof entry.name==='string'&&entry.name.length<=100)displayName=entry.name;
           }catch(_){/* A Custom user-only key may omit torn/items; item ID stays valid. */}
           itemNames.set(di.id,displayName);
         }
         await relay('trade_intake',{tradeId:t.id,line,completedAt:detail.completed_at,name:itemNames.get(di.id),itemId:di.id,uid:di.uid??null,qty:di.amount,senderId:otherId,receiverId:ownerId,partnerId:supplierId,ownerId});
       }
       count++;
     }
     scannedTradeIds.add(t.id);
   }
   if(checked>=25)status='Trade import capacity reached (25); older Morpheus trades may remain. Reopen/sync again before treating receipts as complete.';
   lastTrades=Date.now();return count;
 }


 function parsePurchaseLog(log,requestedType){
   const id=Number(log?.details?.id ?? log?.log ?? requestedType),d=log?.data||{};
   if(![1112,1225,4200,4201].includes(id)||id!==requestedType)return null;
   let item=null;
   if(Array.isArray(d.items)&&d.items.length===1)item=d.items[0];
   else if((id===4200||id===4201)&&d.item!=null)
     item=typeof d.item==='object'?{id:d.item.id,qty:d.item.qty??d.quantity,uid:d.item.uid}:{id:d.item,qty:d.quantity,uid:null};
   if(!item||typeof log.id!=='string'||!log.id.trim())return null;
   const itemId=numeric(item.id),qty=numeric(item.qty??item.quantity),timestamp=numeric(log.timestamp),
     totalCost=numeric(d.cost_total??d.total),listedPrice=d.cost_each==null?null:numeric(d.cost_each);
   const unitCost=listedPrice==null&&isPositive(qty)&&Number.isSafeInteger(totalCost/qty)?totalCost/qty:listedPrice;
   if(!isPositive(itemId)||!isPositive(qty)||!isPositive(unitCost)||!isPositive(totalCost)||
     !isPositive(timestamp)||!Number.isSafeInteger(qty*unitCost)||qty*unitCost!==totalCost)return null;
   return {logId:log.id,logType:id,timestamp,itemId,uid:isPositive(numeric(item.uid))?numeric(item.uid):null,
     qty,unitCost,totalCost};
 }
 function sameUid(l,e){return l.uid==null?e.uid==null:e.uid===l.uid;}
 function eligibleEvidence(l){
   return !!l.tradeRef&&((l.mode==='supplier'&&l.status==='awaiting_cost')||
     (l.mode==='unclassified'&&l.status==='received_pending'));
 }
 function unallocatedEvidenceParts(l,allLots,records,kind){
   if(!eligibleEvidence(l))return [];
   const purchase=kind==='purchase',idKey=purchase?'logId':'evidenceId',used={};
   for(const other of allLots){
     if(other.id===l.id)continue;
     const parts=purchase?other.purchaseParts:other.originParts;
     for(const part of parts||[])used[part[idKey]]=(used[part[idKey]]||0)+part.qty;
     if(purchase&&other.purchaseLogId){
       const proof=records.find(p=>p.logId===other.purchaseLogId);
       if(proof)used[proof.logId]=(used[proof.logId]||0)+proof.qty;
     }
   }
   const recvTime=new Date(l.createdAt).getTime();
   const available=records.filter(p=>p.itemId===l.itemId&&sameUid(l,p)
     &&p.timestamp*1000<=recvTime+300000&&p.timestamp*1000>=recvTime-120*86400000
     &&p.qty-(used[p[idKey]]||0)>0)
     .map(p=>({[idKey]:p[idKey],qty:p.qty-(used[p[idKey]]||0)}));
   return available;
 }
 function exactUnallocatedEvidence(l,allLots,records,kind){
   const available=unallocatedEvidenceParts(l,allLots,records,kind);
   const total=available.reduce((n,p)=>n+p.qty,0);
   return total===l.qty&&available.length&&available.length<=40?available:null;
 }
 function chooseExactPurchaseEvidence(l,allLots,purchases){
   return exactUnallocatedEvidence(l,allLots,purchases,'purchase');
 }
 function chooseExactOriginEvidence(l,allLots,origins){
   return exactUnallocatedEvidence(l,allLots,origins,'origin');
 }
 function originKindForTitle(title){
   const t=String(title||'').toLowerCase().replace(/\s+/g,' ').trim();
   if(/^crime success item gain(?: \(new\))?$/.test(t))return 'crime_reward';
   if(t.includes('city')&&/(find|found)/.test(t))return 'city_find';
   return null;
 }
 function parseOriginLog(log,typeInfo){
   if(!log||typeof log.id!=='string'||!log.id.trim())return [];
   const timestamp=numeric(log.timestamp);if(!isPositive(timestamp))return [];
   const d=log.data||{},items=[];
   if(d.items_gained&&typeof d.items_gained==='object'&&!Array.isArray(d.items_gained)){
     for(const [id,qty] of Object.entries(d.items_gained))items.push({id,qty,uid:null});
   }else if(Array.isArray(d.items)){
     for(const x of d.items)items.push({id:x?.id,qty:x?.qty??x?.quantity,uid:x?.uid??null});
   }else if(d.item!=null){
     const x=typeof d.item==='object'?d.item:{id:d.item,qty:d.quantity??d.qty,uid:null};
     items.push({id:x.id,qty:x.qty??x.quantity,uid:x.uid??null});
   }
   const merged=new Map();
   for(const x of items){
     const itemId=numeric(x.id),qty=numeric(x.qty),uid=isPositive(numeric(x.uid))?numeric(x.uid):null;
     if(!isPositive(itemId)||!isPositive(qty))continue;
     const k=itemId+':'+(uid==null?'n':uid),prev=merged.get(k);
     merged.set(k,{itemId,uid,qty:(prev?.qty||0)+qty});
   }
   return [...merged.values()].map(x=>({evidenceId:String(log.id)+':'+x.itemId+':'+(x.uid==null?'n':x.uid),
     sourceLogId:String(log.id),logType:typeInfo.id,title:typeInfo.title,originKind:typeInfo.kind,timestamp,itemId:x.itemId,uid:x.uid,qty:x.qty}));
 }
 async function discoverOriginLogTypes(){
   const r=await api('torn/logtypes');
   if(!Array.isArray(r.logtypes))throw Error('Torn log-type discovery returned unexpected format');
   return r.logtypes.map(x=>({id:numeric(x.id),title:String(x.title||''),kind:originKindForTitle(x.title)}))
     .filter(x=>isPositive(x.id)&&x.kind);
 }
 async function readPagedLogs(type,floor,onLog,stats,resumeQuery='',maxPages=4){
   const base='https://api.torn.com/v2/user/log';
   const url=new URL(base);
   if(resumeQuery){
     const next=new URL(resumeQuery,base);
     if(next.origin!==url.origin||next.pathname!==url.pathname||next.searchParams.get('log')!==String(type))throw Error('Invalid saved log pagination checkpoint');
     url.search=next.search;
   }else url.search=new URLSearchParams({log:String(type),limit:'100',from:String(floor)}).toString();
   url.searchParams.set('key',cfg().torn);
   const seen=new Set();
   let current=url.href;
   for(let page=0;page<maxPages&&current;page++){
     if(seen.has(current))throw Error('Repeated pagination address');seen.add(current);
     const response=await request(current);
     if(!Array.isArray(response.log))throw Error('Invalid log response');
     stats.pages++;
     for(const raw of response.log)await onLog(raw);
     const next=response._metadata?.links?.next;
     if(!next)return '';
     const nextUrl=trustedLogContinuation(next,cfg().torn,type);
     if(page===maxPages-1){
       stats.truncated.push(type);
       nextUrl.searchParams.delete('key');
       return nextUrl.pathname+nextUrl.search;
     }
     current=nextUrl.href;
   }
   return '';
 }

 async function syncPurchaseLogs(){
   if(state?.role!=='supplier')throw Error('Sign in as Morpheus to scan acquisition logs');
   if(!cfg().torn)throw Error('Morpheus Torn API key is required');
   const pending=state.lots.filter(l=>l.tradeRef&&((l.mode==='supplier'&&l.status==='awaiting_cost')||(l.mode==='unclassified'&&l.status==='received_pending')));
   if(!pending.length)return {noPending:true,read:0,imported:0,originImported:0,matched:0,earned:0,errors:[]};
   // Key selection and its permission probes happen once per scan. The key is lexical and never cached.
   const supplierId=await verifyKey();
   if(state.partnership&&state.partnership.morpheusId!==supplierId)throw Error('Morpheus account does not match partnership');
   const lots=pending.filter(l=>l.senderId===supplierId);
   if(!lots.length)throw Error('Morpheus is not the sender of the pending receipts');
   const wanted=new Set(lots.map(l=>l.itemId)),floor=Math.floor((Math.min(...lots.map(l=>Date.parse(l.createdAt)))-120*86400000)/1000);
   let cursor={};try{const stored=JSON.parse(read('acquisitionCursor')||'{}');if(stored.supplierId===supplierId&&stored.progress&&typeof stored.progress==='object')cursor=stored.progress;}catch(_){}
   // Parsed evidence is retained locally for late-arriving receipts; never store raw Torn
   // responses or duplicate the API key. 120-day retention and 5,000-record hard bound.
   const EVIDENCE_LIMIT=5000,cacheCutoff=Math.floor(Date.now()/1000)-120*86400;
   let savedEvidence={};try{const stored=JSON.parse(read('acquisitionEvidence')||'{}');if(stored.supplierId===supplierId)savedEvidence=stored;}catch(_){}
   const cacheP=new Map(),cacheO=new Map();
   for(const p of Array.isArray(savedEvidence.purchases)?savedEvidence.purchases:[])
     if(p&&typeof p.logId==='string'&&p.timestamp>=cacheCutoff)cacheP.set(p.logId,p);
   for(const o of Array.isArray(savedEvidence.origins)?savedEvidence.origins:[])
     if(o&&typeof o.evidenceId==='string'&&o.timestamp>=cacheCutoff)cacheO.set(o.evidenceId,o);
   const stagedP=[],stagedO=[],seenP=new Set(state.purchaseLogs.map(x=>x.logId)),
     seenO=new Set(state.originLogs.map(x=>x.evidenceId));
   for(const p of cacheP.values())if(wanted.has(p.itemId)&&!seenP.has(p.logId)){seenP.add(p.logId);stagedP.push(p);}
   for(const o of cacheO.values())if(wanted.has(o.itemId)&&!seenO.has(o.evidenceId)){seenO.add(o.evidenceId);stagedO.push(o);}
   const stats={read:0,relevant:0,imported:0,originImported:0,matched:0,earned:0,ambiguous:0,skipped:0,pages:0,errors:[],truncated:[],keySource:'Desktop',keyPermissions:0,originTypes:[],cityFindType:false};
   let types=[{id:1112},{id:1225},{id:4200},{id:4201}],originTypes=[];
   try{
     originTypes=await discoverOriginLogTypes();
     stats.originTypes=originTypes.map(x=>x.id+': '+x.title);
     stats.cityFindType=originTypes.some(x=>x.kind==='city_find');
     types=types.concat(originTypes);
   }catch(e){stats.errors.push('Log-type discovery: '+String(e.message||e));}
   const progress={...cursor},scanStartedAt=Math.floor(Date.now()/1000);
   // Retrieve evidence into session memory before sending any writes or attempting attribution.
   const MAX_LOG_PAGES=12;
   for(const type of types){
     if(stats.pages>=MAX_LOG_PAGES){stats.truncated.push(type.id);continue;}
     try{
       const checkpoint=cursor[type.id]&&typeof cursor[type.id]==='object'?cursor[type.id]:{highWater:Number(cursor[type.id]||0)};
       const after=Math.max(floor,Number(checkpoint.highWater||0)-600);
       const windowStart=checkpoint.next?Number(checkpoint.scanStartedAt||scanStartedAt):scanStartedAt;
       let newest=Number(checkpoint.highWater||0);
       const resume=await readPagedLogs(type.id,after,async raw=>{
         stats.read++;
         const ts=numeric(raw.timestamp);
         if(isPositive(ts))newest=Math.max(newest,ts);
         if(type.kind){
           const entries=parseOriginLog(raw,type);
           if(!entries.length){stats.skipped++;return;}
           for(const entry of entries){
             cacheO.set(entry.evidenceId,entry);
             if(wanted.has(entry.itemId)&&!seenO.has(entry.evidenceId)){
               seenO.add(entry.evidenceId);stagedO.push(entry);stats.relevant++;
             }
           }
         }else{
           const entry=parsePurchaseLog(raw,type.id);
           if(!entry){stats.skipped++;return;}
           cacheP.set(entry.logId,entry);
           if(wanted.has(entry.itemId)&&!seenP.has(entry.logId)){
             seenP.add(entry.logId);stagedP.push(entry);stats.relevant++;
           }
         }
       },stats,String(checkpoint.next||''),Math.min(4,MAX_LOG_PAGES-stats.pages));
       if(!type.kind)stats.keyPermissions++;
       progress[type.id]={highWater:resume?newest:Math.max(newest,windowStart),next:resume,scanStartedAt:windowStart};
     }catch(e){stats.errors.push(String(type.id)+': '+String(e.message||e));}
   }
   // Batch is validated atomically by the relay. At most 35 entries per append-only event.
   const staged=stagedP.map(x=>({purchase:x})).concat(stagedO.map(x=>({origin:x})));
   for(let i=0;i<staged.length;i+=35){
     const batch=staged.slice(i,i+35);
     try{
       const payload={purchases:batch.filter(x=>x.purchase).map(x=>x.purchase),origins:batch.filter(x=>x.origin).map(x=>x.origin)};
       const ack=await relay('evidence_batch',payload,evidenceRequestId(payload));
       if(ack.accepted?.purchases!==payload.purchases.length||ack.accepted?.origins!==payload.origins.length)throw Error('Invalid evidence batch acknowledgment');
       stats.imported+=batch.filter(x=>x.purchase).length;
       stats.originImported+=batch.filter(x=>x.origin).length;
     }catch(e){stats.errors.push('Evidence batch: '+String(e.message||e));break;}
   }
   if(stats.imported===stagedP.length&&stats.originImported===stagedO.length){
     // A cursor must never outlive the evidence it skips. Persist parsed records first.
     if(cacheP.size+cacheO.size>EVIDENCE_LIMIT)stats.errors.push('Parsed evidence cache capacity reached; checkpoint held');
     else{
       save('acquisitionEvidence',JSON.stringify({supplierId,purchases:[...cacheP.values()],origins:[...cacheO.values()]}));
       save('acquisitionCursor',JSON.stringify({supplierId,progress}));
     }
   }
   if(stats.errors.length||stats.truncated.length||!originTypes.length||stats.imported!==stagedP.length||stats.originImported!==stagedO.length){
     stats.attributionHeld=true;
     
     stats.pending=state.lots.filter(l=>l.senderId===supplierId&&l.tradeRef&&['awaiting_cost','received_pending'].includes(l.status)).length;
     return stats;
   }
   // A compact batch ack carries no Ledger state. Refresh once after ALL ingestion.
   await relay('state');
   // Scan first, ingest second, and only then reconcile against the authoritative returned ledger.
   const remaining=state.lots.filter(l=>l.senderId===supplierId&&l.tradeRef&&((l.mode==='supplier'&&l.status==='awaiting_cost')||(l.mode==='unclassified'&&l.status==='received_pending'))).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
   const actions=[],reservedP=new Set(),reservedO=new Set();
   // A partial matching proof is still conflicting evidence. Mirror the relay's
   // purchaseAvailable_/originAvailable_ gates before submitting attribution.
   const unallocatedEvidence=(lot,records,kind)=>
     unallocatedEvidenceParts(lot,state.lots,records,kind).length>0;
   for(const l of remaining){
     const purchase=chooseExactPurchaseEvidence(l,state.lots,state.purchaseLogs),origin=chooseExactOriginEvidence(l,state.lots,state.originLogs);
     if(purchase&&origin){stats.ambiguous++;continue;}
     if((origin&&unallocatedEvidence(l,state.purchaseLogs,'purchase'))||
        (purchase&&unallocatedEvidence(l,state.originLogs,'origin'))){stats.ambiguous++;continue;}
     const parts=purchase||origin;
     if(!parts)continue;
     const claimed=origin?reservedO:reservedP,key=origin?'evidenceId':'logId';
     if(parts.some(x=>claimed.has(x[key]))){stats.ambiguous++;continue;}
     for(const x of parts)claimed.add(x[key]);
     actions.push({op:origin?'origin_apply_bundle':'purchase_apply_bundle',data:{lotId:l.id,supplierId,parts}});
   }
   // Attribution is also committed as validated batches, with proof reservation checked
   // against earlier actions in the same batch. No per-lot Apps Script round trips.
   for(let i=0;i<actions.length;i+=12){
     const payload={actions:actions.slice(i,i+12)};
     try{
       const ack=await relay('acquisition_apply_batch',payload,evidenceRequestId(payload));
       if(ack.accepted?.actions!==payload.actions.length)throw Error('Invalid attribution acknowledgment');
       stats.matched+=payload.actions.filter(x=>x.op==='purchase_apply_bundle').length;
       stats.earned+=payload.actions.filter(x=>x.op==='origin_apply_bundle').length;
     }catch(e){stats.errors.push('Attribution batch: '+String(e.message||e));break;}
   }
   if(actions.length)await relay('state');
   stats.pending=state.lots.filter(l=>l.senderId===supplierId&&l.tradeRef&&['awaiting_cost','received_pending'].includes(l.status)).length;
   return stats;
 }

 function parseBazaarLog(log){
   if(Number(log?.details?.id)!==1226)return null;
   const data=log.data||{},items=data.items;
   if(!Array.isArray(items)||items.length!==1)return {skip:'Bazaar sale contains multiple items; manual review required'};
   const item=items[0],id=numeric(item.id),qty=numeric(item.qty),gross=numeric(data.cost_total),each=numeric(data.cost_each),timestamp=numeric(log.timestamp);
   if(!isPositive(id)||!isPositive(qty)||!isPositive(timestamp)||!isPositive(gross))return {skip:'Incomplete Bazaar sale fields'};
   if(!isPositive(each)||each*qty!==gross)return {skip:'Sale total does not equal quantity × unit price'};
   return {sourceId:String(log.id),itemId:id,uid:isPositive(numeric(item.uid))?numeric(item.uid):null,qty,unitPrice:each,gross,timestamp};
 }
 function saleDecision(s,lots){
   const sameItem=lots.filter(l=>l.status==='confirmed'&&l.itemId===s.itemId);
   const possible=sameItem.filter(l=>(l.uid==null||l.uid===s.uid)
     &&l.qty-l.sold-l.returned>=s.qty&&l.unitCost!==null
     &&new Date(l.confirmedAt).getTime()<=s.timestamp*1000+300000);
   const viable=possible.filter(l=>l.unitCost<=s.unitPrice);
   if(viable.length===1)return {op:'sale_import',lotId:viable[0].id};
   if(sameItem.length)return {op:'sale_pending',reason:viable.length>1?
     'Multiple eligible inventory lots':'Quantity, price, or inventory-cost conflict'};
   return null;
 }
 function trustedLogContinuation(next,key,expectedType){
   const url=new URL(next,'https://api.torn.com');
   if(url.protocol!=='https:'||url.hostname!=='api.torn.com'||url.pathname!=='/v2/user/log'||
      (expectedType!=null&&url.searchParams.get('log')!==String(expectedType)))
     throw Error('Untrusted Torn log continuation');
   url.searchParams.set('key',key);
   return url;
 }
 async function readSaleLogPages(firstUrl,fetchPage,key){
   // Torn may omit a continuation link on a full 100-row page. Split bounded
   // time windows rather than treating a truncated response as complete.
   const parsed=new URL(firstUrl),floor=Number(parsed.searchParams.get('from'));
   if(!Number.isSafeInteger(floor)||floor<1)throw Error('Invalid sale scan start');
   const ceiling=Math.floor(Date.now()/1000)+300,queue=[{from:floor,to:ceiling,url:firstUrl}];
   const all=[],seenIds=new Set(),seenUrls=new Set();let requests=0;
   while(queue.length){
     const window=queue.shift();
     if(window.from>window.to)continue;
     if(++requests>60)throw Error('Sale history exceeds 60-page safety budget; narrow the scan window');
     const current=window.url||'https://api.torn.com/v2/user/log?'+
       new URLSearchParams({log:'1226',limit:'100',from:String(window.from),
         to:String(window.to),key});
     if(seenUrls.has(current))throw Error('Repeated Torn sale page cursor');
     seenUrls.add(current);
     const response=await fetchPage(current);
     if(!Array.isArray(response.log))throw Error('Expected Torn v2 user/log array');
     for(const raw of response.log){
       if(!Number.isSafeInteger(Number(raw.timestamp))||
          Number(raw.timestamp)<window.from||Number(raw.timestamp)>window.to)
         throw Error('Torn sale log outside requested scan window');
       if(!seenIds.has(String(raw.id))){seenIds.add(String(raw.id));all.push(raw);}
     }
     const next=response._metadata?.links?.next||null;
     if(next){
       const cursor=trustedLogContinuation(next,key,'1226');
       queue.unshift({...window,url:cursor.href});
     }else if(response.log.length>=100){
       const mid=Math.floor((window.from+window.to)/2);
       if(mid>=window.to||mid<window.from)
         throw Error('At least 100 sales share one timestamp; manual backfill required');
       queue.unshift({from:mid+1,to:window.to,url:null});
       queue.unshift({from:window.from,to:mid,url:null});
     }
   }
   return all;
 }
 async function syncSales(){
   if(state?.role!=='owner')return 0;
   const lots=state.lots.filter(l=>l.status==='confirmed'&&isPositive(l.itemId)&&l.qty>l.sold+l.returned);
   if(!lots.length)return 0;
   // Long-running inventory may need extended backfill. Look back at least 30 days; paginate to avoid lost sales.
   const first=Math.min(...lots.map(l=>new Date(l.confirmedAt||l.createdAt).getTime()));
   const from=Math.floor(Math.max(first-minutes(30),Number(read('v2SaleStart')),Date.now()-90*86400000)/1000);
   let url='https://api.torn.com/v2/user/log?'+new URLSearchParams({log:'1226',limit:'100',from:String(from),key:cfg().torn});
   const all=await readSaleLogPages(url,request,cfg().torn);
   all.sort((a,b)=>a.timestamp-b.timestamp||String(a.id).localeCompare(String(b.id)));
   let count=0,exceptions=0,unparsed=0;
   const recorded=new Set([...state.sales.map(x=>x.sourceId),...state.exceptions.map(x=>x.id)]);
   for(const log of all){
     const s=parseBazaarLog(log);if(!s)continue;if(s.skip){unparsed++;continue;}
     if(recorded.has(s.sourceId))continue;
     const decision=saleDecision(s,state.lots);
     if(decision){
       const {op,...details}=decision;
       await relay(op,{...s,...details});
       recorded.add(s.sourceId);
       if(op==='sale_import')count++;else exceptions++;
     }
   }
   lastLogs=Date.now();status=`Sale scan: ${count} imported, ${exceptions} need matching, ${unparsed} unsupported layouts`;if(unparsed)throw Error(unparsed+' unsupported sale-log layouts require manual review');return count;
 }
 async function snapshot(){if(state?.role!=='owner')return;const key=cfg().torn;if(!key)return;
   const r=await request('https://api.torn.com/user/?selections=bazaar&key='+encodeURIComponent(key));
   if(!Array.isArray(r.bazaar))throw Error('Bazaar did not return an item list');
   const list=r.bazaar.map(x=>({itemId:numeric(x.ID),name:String(x.name||''),qty:numeric(x.quantity),price:numeric(x.price)}));
   if(list.length>300||list.some(x=>!isPositive(x.itemId)||!Number.isSafeInteger(x.qty)||!Number.isSafeInteger(x.price)))throw Error('Invalid Bazaar snapshot');
   await relay('snapshot',{listings:list});lastBazaar=Date.now();
 }
 async function syncAll(silent=false){
   if(working||!cfg().relay||!cfg().token)return;
   working=true;const warnings=[];
   try{
     await relay('state');
     if(state.role==='owner'&&cfg().torn){
       try{await syncTrades();}catch(e){warnings.push('Trades: '+e.message);}
       try{await syncSales();}catch(e){warnings.push('Sales: '+e.message);}
       if(Date.now()-lastBazaar>minutes(5))try{await snapshot();}catch(e){warnings.push('Listings: '+e.message);}
     }else if(state.role==='supplier'&&cfg().torn){
       lastPurchaseScan=Date.now();
       try{const a=await syncPurchaseLogs();if(a&&!a.noPending){if(a.attributionHeld)warnings.push('Acquisition evidence incomplete — no lots attributed');if(!a.cityFindType)warnings.push('City-find log type unavailable; city finds remain inactive');}}catch(e){warnings.push('Acquisition evidence: '+e.message);}
     }
     status=warnings.length?'Sync partial — '+warnings.join(' | '):'Connected: trades/sales checked at '+new Date().toLocaleTimeString();
   }catch(e){status='Sync failed: '+e.message;if(!silent)alert(status);}finally{working=false;draw();}
 }
 const host=document.createElement('div');host.id='morpheus-v2';document.documentElement.appendChild(host);const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=`*,*:before,*:after{box-sizing:border-box}.panel{position:fixed;bottom:63px;right:12px;width:min(650px,calc(100vw - 24px));max-height:84vh;overflow:auto;background:#111d2b;color:#eaf1fb;border:1px solid #405979;border-radius:12px;box-shadow:0 14px 45px #000a;font:13px/1.4 system-ui;z-index:2147483641}header,section{padding:12px 16px;border-bottom:1px solid #32455c}header{display:flex;align-items:center;gap:9px;justify-content:space-between;position:sticky;top:0;background:#1c2e46;z-index:1}header b{font-size:16px}button{font:600 12px system-ui;cursor:pointer;color:#fff;background:#2b55a1;border:1px solid #6984a4;padding:7px 10px;border-radius:6px}button:disabled{opacity:.55;cursor:default}input,select,textarea{background:#0a1827;border:1px solid #59728f;padding:7px;color:#fff;border-radius:5px;width:100%;font:13px system-ui}label{display:block;color:#bacce0;margin:8px 0 3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metrics div{background:#20344c;padding:8px;border-radius:6px}.metrics strong{font-size:16px;display:block}.muted{font-size:12px;color:#b2c6db}.row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.line{border-bottom:1px solid #344b62;padding:8px 0}.line:last-child{border:0}details summary{cursor:pointer;font-weight:700;margin-bottom:7px}.hide{display:none!important}.warning{padding:8px;border-radius:5px;background:#433b26;color:#ffe4a3}.critical{color:#ffbbaa}.pill{background:#29435e;padding:2px 7px;border-radius:20px;font-size:11px}.num{font-variant-numeric:tabular-nums}.scroll{max-height:280px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:right;border-bottom:1px solid #344b62;padding:5px}th:first-child,td:first-child{text-align:left}@media(max-width:500px){.metrics,.grid{grid-template-columns:1fr}}`;
 root.appendChild(style);
 const panel=document.createElement('div');panel.className='panel hide';root.appendChild(panel);
 const core=globalThis.MMTornCore;
 const DOCK_ID='morpheus-bazaar';
 if(!core?.registerDockLauncher||!core?.setDockLauncherActive)
   throw Error('Morpheus desktop requires the shared MM Torn Core dock');
 const setPanelOpen=next=>{
   opened=Boolean(next);panel.classList.toggle('hide',!opened);
   core.setDockLauncherActive(DOCK_ID,opened);
   if(opened)draw();
 };
 // The dock owns dimensions, anchor, order, floating positions and dragging.
 // A ledger-register motif is unique to this script; the panel remains product-owned.
 const opener=core.registerDockLauncher({
   id:DOCK_ID,
   label:'Morpheus Bazaar Ledger',
   accent:'#367783',
   icon:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5v17M12.5 9h3.5M12.5 13h3.5M12.5 17h2"/></svg>',
   onClick:()=>setPanelOpen(!opened)
 });
 if(!opener)throw Error('Shared MM dock launcher registration failed');
 function rowsReport(obj){return Object.keys(obj||{}).sort().reverse().slice(0,8).map(k=>`<tr><td>${esc(k)}</td><td>${esc(obj[k].sales)}</td><td>${money(obj[k].profit)}</td><td>${money(obj[k].morpheusProfit)}</td><td>${money(obj[k].morpheusDue)}</td><td>${money(obj[k].ownerProfit)}</td></tr>`).join('');}
 function itemRow(l){const rem=l.qty-l.sold-l.returned,buttons=[];
   if(state.role==='owner'&&l.status==='proposed'&&l.mode==='owner')buttons.push(`<button data-action="confirm" data-id="${esc(l.id)}">Confirm my purchase</button>`);
   if(state.role==='owner'&&l.status==='proposed')buttons.push(`<button data-action="reject" data-id="${esc(l.id)}">Reject</button>`);
   if(state.role==='supplier'&&l.unitCost===null&&l.mode==='supplier'&&!l.tradeRef&&l.status!=='rejected')buttons.push(`<button data-action="price" data-id="${esc(l.id)}">Enter buy price</button>`);
   if(state.role==='owner'&&l.status==='confirmed'&&l.mode==='supplier'&&rem>0)buttons.push(`<button data-action="return" data-id="${esc(l.id)}">Log item return</button>`);
   return `<div class="line"><b>${esc(l.name)}</b> <span class="pill">${esc(l.status)}</span><div class="muted">ID ${esc(l.itemId??'missing')} • Lot ${esc(l.id.slice(0,12))}${l.senderId?' • From Torn #'+esc(l.senderId):''} • ${rem}/${l.qty} remaining • ${l.unitCost==null?'cost pending':money(l.unitCost)+' cost each'} • ${l.mode==='supplier'?'Morpheus-funded 50/50':l.mode==='earned'?'Verified Morpheus find/reward — $0 acquisition; 100% proceeds':l.mode==='excluded'?'Outside partnership — financially inactive':l.mode==='owner'?'Owner-funded '+l.feePct+'% sourcing':l.mode==='return'?'Returned property — no payout':l.mode==='crime'?'Historical manual crime classification — preserved':'Received — waiting for Morpheus acquisition evidence'}${l.tradeId?' • Trade #'+esc(l.tradeId):''}</div><div class="row">${buttons.join('')}</div></div>`;
 }
 function draw(){if(!opened)return;const c=cfg(),s=state?.summary,role=state?.role;
   let html=`<header><b>Morpheus Bazaar Ledger</b><span class="muted">v${VERSION}</span><button data-action="close">Close</button></header><section class="row"><b>${esc(status)}</b><button data-action="refresh" ${working?'disabled':''}>Refresh ledger</button><button data-action="scan" ${working?'disabled':''}>Scan Torn API</button></section>`;
   if(s){html+=`<section><div class="muted">Signed in: <b>${role==='owner'?'Bazaar Owner':'Morpheus'}</b> • Business day ${esc(s.openDay)} (19:00 ET cutoff)</div><div class="metrics"><div><span class="muted">${role==='owner'?'Expected to pay':'Expected pay'} — today</span><strong class="num">${money(s.current.morpheusDue)}</strong></div><div><span class="muted">${role==='owner'?'Daily expected to pay':'Daily expected'} — last close</span><strong class="num">${money(s.lastClosed.morpheusDue)}</strong></div><div><span class="muted">Lifetime unpaid balance</span><strong class="num">${money(s.remaining)}</strong></div></div><div class="metrics" style="margin-top:9px"><div><span class="muted">Today's gross sales</span><strong>${money(s.current.gross)}</strong></div><div><span class="muted">Today's net profit</span><strong>${money(s.current.profit)}</strong></div><div><span class="muted">Your earnings today</span><strong>${money(role==='owner'?s.current.ownerProfit:s.current.morpheusProfit)}</strong></div></div><p class="muted"><b>Today:</b> ${money(s.current.morpheusProfit)} Morpheus profit + ${money(s.current.capitalDue)} capital reimbursement = ${money(s.current.morpheusDue)} total payable. <b>Last close:</b> ${money(s.lastClosed.morpheusProfit)} profit + ${money(s.lastClosed.capitalDue)} capital = ${money(s.lastClosed.morpheusDue)} payable. Lifetime debt survives rollover. Cash transfers remain manual.</p></section>`;
     if(role==='supplier')html+=`<section><b>Optional: source a purchase lead</b><form id="newlot"><div class="grid"><div><label>Item name</label><input name="name" required></div><div><label>Torn Item ID (required to auto-verify trades)</label><input name="itemId" type="number" min="1" required></div><div><label>Quantity</label><input name="qty" type="number" min="1" required></div><div><label>My buy cost per unit ($)</label><input name="cost" placeholder="Can fill in later"></div><div><label>Funding</label><select name="mode"><option value="supplier">I purchased — 50/50 profit</option><option value="owner">Owner purchases my lead — sourcing fee</option></select></div><div><label>Sourcing fee (%) if owner-funded</label><input name="fee" type="number" value="20" min="0" max="100"></div><div><label>Item UID (optional, for unique equipment)</label><input name="uid" type="number" min="1"></div></div><label>Notes</label><textarea name="note"></textarea><button>Submit to shared ledger</button></form><p class="muted">For an ordinary item transfer, no submission is needed: trade directly and the owner scanner imports it. Only sourcing leads need this form.</p><button data-action="trade">Open partner's Torn profile to trade</button></section>`;
     if(role==='owner')html+=`<section><b>Trade & sale reconciliation</b><p class="muted">Only completed item transfers from the configured Morpheus account are eligible for partnership inventory. Morpheus acquisition logs automatically classify verified purchases at actual cost or verified finds/rewards at $0. Ambiguous evidence remains financially inactive. Only your Bazaar sale logs are scanned (Torn log 1226).</p><button data-action="trade">Open Morpheus's profile</button> <button data-action="scan">Check trades & sales now</button> <p class="muted">Last trade scan: ${lastTrades?new Date(lastTrades).toLocaleString():'not yet'} · Last sale scan: ${lastLogs?new Date(lastLogs).toLocaleString():'not yet'}</p></section>`;
     html+=`<section><details open><summary>Inventory lots (${state.lots.length})</summary><div class="scroll">${state.lots.map(itemRow).join('')||'No inventory yet'}</div></details></section>`;
     if(state.exceptions?.length)html+=`<section><details open><summary>Unmatched Bazaar sale quantities (${state.exceptions.length}) — action required</summary>${state.exceptions.map(x=>{
       const remaining=x.remainingQty??x.qty,matched=state.lots.filter(l=>l.status==='confirmed'&&l.itemId===x.itemId&&
         (l.uid==null||l.uid===x.uid)&&l.unitCost!==null&&l.unitCost<=x.unitPrice&&
         l.qty-l.sold-l.returned>0&&new Date(l.confirmedAt).getTime()<=new Date(x.at).getTime()+300000);
       const eligible=matched.reduce((n,l)=>n+Math.min(remaining,l.qty-l.sold-l.returned),0);
       const evidencePending=state.lots.filter(l=>l.itemId===x.itemId&&
         (l.uid==null||l.uid===x.uid)&&['received_pending','awaiting_cost'].includes(l.status)&&
         l.qty-l.sold-l.returned>0&&new Date(l.createdAt).getTime()<=new Date(x.at).getTime()+300000)
         .reduce((n,l)=>n+(l.qty-l.sold-l.returned),0);
       return `<div class="line"><b>Sale ${esc(x.id)}</b> • Item #${x.itemId} • originally ${x.qty} × ${money(x.unitPrice)}
         <div class="muted">${x.allocatedQty||0} partnership units assigned · ${x.excludedQty||0} marked outside partnership · <b>${remaining} remain unresolved</b></div>
         <div class="critical">${esc(x.reason)}</div>
         ${role==='owner'&&eligible?`<button data-action="allocate" data-id="${esc(x.id)}">Assign up to ${Math.min(eligible,remaining)} documented unit(s)</button>`:''}
         ${role==='owner'&&!evidencePending?`<button data-action="exclude" data-id="${esc(x.id)}">Review ${remaining} unit(s) for documented outside-partnership exclusion</button>`:''}
         ${evidencePending?`<span class="critical">Morpheus inventory exists but acquisition evidence is unresolved (${evidencePending} pending same-item unit(s)). Do not exclude this sale on the basis of missing prices. Resolve provenance first.</span>`:(!eligible?'<span class="muted">No eligible priced partner inventory is currently available; inspect historical receipts before any exclusion.</span>':'')}</div>`;
     }).join('')}</details></section>`;
     if(role==='owner')html+=`<section><b>Payment after sending Torn cash</b><form id="payment"><div class="grid"><div><label>Amount sent</label><input name="amount" type="number" min="1" max="${s.remaining}" required></div><div><label>Torn reference</label><input name="reference"></div></div><button ${s.remaining<=0?'disabled':''}>Record payment sent</button></form></section>`;
     html+=`<section><details><summary>Payments (${state.payments.length})</summary>${state.payments.map(p=>`<div class="line">${money(p.amount)} • ${esc(p.at)} • ${p.acknowledged?'Acknowledged':'Awaiting acknowledgment'} ${role==='supplier'&&!p.acknowledged?`<button data-action="ack" data-id="${esc(p.id)}">Confirm receipt</button>`:''}</div>`).join('')||'No payments'}</details><details><summary>Sales history (${state.sales.length})</summary><div class="scroll">${state.sales.slice(0,100).map(x=>`<div class="line">${esc(x.name)} × ${x.qty} • ${money(x.gross)} revenue • ${money(x.cost)} cost • Morpheus profit ${money(x.morpheusProfit)} + capital ${money(x.capitalDue)} = ${money(x.morpheusDue)} due • Owner ${money(x.ownerProfit)} <span class="muted">${esc(x.at)} / ${esc(x.sourceId||'legacy/manual')}</span></div>`).join('')}</div></details></section>`;
     html+=`<section><details><summary>Daily, weekly & monthly reports</summary>${[['Daily',state.daily],['Weekly',state.weekly],['Monthly',state.monthly]].map(([label,x])=>`<b>${label}</b><table><thead><tr><th>Period</th><th>Sales</th><th>Net profit</th><th>Profit to Morpheus</th><th>Total owed</th><th>Owner</th></tr></thead><tbody>${rowsReport(x)}</tbody></table>`).join('')}<button data-action="export">Export CSV</button></details></section>`;
   }else html+=`<section class="warning">Configure the shared relay and personal token below to connect. Owner auto-sales require a Custom Torn API key with user/log 1226.</section>`;
   html+=`<section><details ${s?'':'open'}><summary>Settings</summary><form id="settings"><label>Same Google Apps Script /exec URL for both users</label><input name="relay" required value="${esc(c.relay)}"><label>Personal relay token (different for each player)</label><input name="token" type="password" required value="${esc(c.token)}"><label>YOUR Torn API key — never shared with relay</label><input name="torn" type="password" value="${esc(c.torn)}"><label>Partner's Torn player ID</label><input name="partnerId" type="number" min="1" value="${c.partnerId||''}"><button>Save & connect</button> <button type="button" data-action="verify">Verify Torn API key</button><p class="muted">Owner: Custom key granting v2 user/log log type 1226, plus user/trades, user/{tradeId}/trade and user/basic; v1 user/bazaar for listing snapshots. Morpheus: Torn key optional for ledger; if using it, Public is enough for user/basic. Data policy: keys stored in Tampermonkey; trade and sale identifiers, quantities, costs, and proceeds stored in your private Google Sheet, visible to both partners.</p></form></details></section>`;
   panel.innerHTML=html;
   panel.querySelectorAll('button[data-action]').forEach(x=>x.addEventListener('click',()=>act(x.dataset.action,x.dataset.id)));
   panel.querySelector('#settings')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);for(const k of ['relay','token','torn','partnerId'])save(k,f.get(k));state=null;await refresh();});
   panel.querySelector('#newlot')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const cost=String(f.get('cost')||'').trim(),uid=String(f.get('uid')||'').trim();await writeOp('propose',{lotId:uuid(),name:String(f.get('name')),itemId:numeric(f.get('itemId')),uid:uid?numeric(uid):null,qty:numeric(f.get('qty')),unitCost:cost?numeric(cost):null,mode:String(f.get('mode')),feePct:numeric(f.get('fee')),note:String(f.get('note'))},'Inventory proposed; now complete Torn trade');});
   panel.querySelector('#payment')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=numeric(f.get('amount'));if(!isPositive(amount)||amount>state.summary.remaining)return alert('Invalid amount');if(!confirm('Have you actually SENT '+money(amount)+' to Morpheus in Torn?'))return;await writeOp('payment',{amount,reference:String(f.get('reference'))},'Payment recorded');});
 }
 async function act(action,id){if(action==='close'){setPanelOpen(false);return;}if(action==='refresh')return refresh();if(action==='scan')return syncAll();if(action==='verify'){try{await verifyKey();}catch(e){alert(e.message)}return;}if(action==='trade'){
     if(!isPositive(cfg().partnerId))return alert('Set the partner Torn player ID in Settings first');
     window.open('https://www.torn.com/profiles.php?XID='+cfg().partnerId,'_blank','noopener');return;
   }
   if(action==='export'){const rows=[['Type','Timestamp','Item','Quantity','Gross','Cost','Net Profit','Morpheus Due','Owner Profit','Source']];for(const s of state.sales)rows.push(['Sale',s.at,s.name,s.qty,s.gross,s.cost,s.profit,s.morpheusDue,s.ownerProfit,s.sourceId||'manual']);for(const p of state.payments)rows.push(['Payment',p.at,'',0,p.amount,'','','','',''+p.reference]);const csv=rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='Morpheus.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);return;}
   if(!state)return;const l=state.lots.find(x=>x.id===id);
   if(action==='price'&&l){const x=prompt('Morpheus buy price PER UNIT:',l.unitCost||'');if(x!==null)await writeOp('price',{lotId:l.id,unitCost:numeric(x)},'Purchase price recorded');}
   if(action==='confirm'&&l){if(!confirm('Did you purchase this owner-funded sourcing lead with your funds?'))return;const x=prompt('Your ACTUAL purchase cost PER UNIT:');if(x!==null)await writeOp('confirm',{lotId:l.id,unitCost:numeric(x)},'Owner-funded lead confirmed');}
   if(action==='reject'&&l&&confirm('Reject this lot?'))await writeOp('reject',{lotId:l.id},'Rejected');
   if(action==='return'&&l){const q=prompt('How many units were actually returned?');if(q!==null)await writeOp('return',{lotId:l.id,qty:numeric(q)},'Return recorded');}
   if(action==='ack'&&confirm('Have you actually received this payment in Torn?'))await writeOp('ack',{paymentId:id},'Receipt acknowledged');
   if(action==='allocate'){
     const ex=state.exceptions.find(x=>x.id===id);if(!ex)return;
     const remaining=ex.remainingQty??ex.qty;
     const available=state.lots.filter(l=>l.status==='confirmed'&&l.itemId===ex.itemId&&
       (l.uid==null||l.uid===ex.uid)&&l.unitCost!==null&&l.unitCost<=ex.unitPrice&&
       l.qty-l.sold-l.returned>0&&new Date(l.confirmedAt).getTime()<=new Date(ex.at).getTime()+300000);
     if(!available.length)return alert('No priced inventory remains for this sale; do not assign the full Torn quantity.');
     let lot=available[0];
     if(available.length>1){
       const text=prompt('Select the documented lot ID for this partial sale:\n'+
         available.map(x=>x.id+' — '+x.name+' — '+(x.qty-x.sold-x.returned)+' units available').join('\n'),lot.id);
       if(text===null)return;
       lot=available.find(x=>x.id===text);
       if(!lot)return alert('No matching lot selected. No change recorded.');
     }
     const qty=Math.min(remaining,lot.qty-lot.sold-lot.returned);
     if(!confirm('Attribute '+qty+' of '+ex.qty+' Torn-sold units of item #'+ex.itemId+
       ' to documented '+lot.name+' lot '+lot.id+' at '+money(ex.unitPrice)+' each?\n'+
       'Only this attributed quantity will enter the Morpheus payout. '+(remaining-qty)+' units will still need classification.'))return;
     await writeOp('sale_allocate',{sourceId:ex.id,lotId:lot.id,qty},'Documented units assigned; remaining quantity stays pending');
     return;
   }
   if(action==='exclude'){
     const ex=state.exceptions.find(x=>x.id===id);if(!ex)return;
     const remaining=ex.remainingQty??ex.qty;
     if(!confirm('Confirm that '+remaining+' unsplit units from Torn sale '+ex.id+
       ' are NOT part of the Morpheus partnership?\n\nThis creates an audited exclusion: no Morpheus reimbursement or profit will be generated for these units. Do not confirm if their ownership is unknown.'))return;
     await writeOp('sale_exclude',{sourceId:ex.id,qty:remaining,reason:'outside_partnership'},'Non-partnership portion recorded; no Morpheus payout');
     return;
   }
 }
 let rescanAfterHide=false;
 if(cfg().relay&&cfg().token)syncAll(true);
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState!=='visible')rescanAfterHide=true;
   else if(rescanAfterHide){rescanAfterHide=false;if(cfg().relay&&cfg().token)syncAll(true);}
 });
 // One automatic scan per userscript lifecycle; subsequent acquisition scans are manual.
})();