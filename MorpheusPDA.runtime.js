// Morpheus Bazaar Ledger dynamic runtime, v2.2.0-pda.7
// Served by official bootstrap; do not install separately.
// Never includes API key or relay tokens.
return (async () => {
 'use strict';
 if (window.top !== window.self) return;
 if (typeof PDA_storage === 'undefined' || typeof PDA_httpGet !== 'function' || typeof PDA_httpPost !== 'function') {
   console.error('[Morpheus PDA] This script requires TornPDA userscript APIs (PDA_storage and PDA_httpGet/Post).');
   return;
 }
 if (window.__morpheusPdaLedgerLoaded) return;
 window.__morpheusPdaLedgerLoaded=true;
 const VERSION='2.2.0-pda.7';
 const prefix='mledger_';
 // Prefer the native per-script SQLite-backed PDA storage: it survives WebView cache clearing.
 const keys=['relay','token','torn','partnerId','v2SaleStart','playerId','playerName','buttonX','buttonY','lastPurchaseScanAt'].map(x=>prefix+x);
 const cache=await PDA_storage.getMany(keys);
 const read=k=>String(cache[prefix+k] ?? '');
 const save=async(k,v)=>{const value=String(v??'').trim();await PDA_storage.set(prefix+k,value);cache[prefix+k]=value;};
 // TornPDA replaces this marker with the API key configured in the app. Owner may override it
 // with a separate least-privilege Custom key that includes private Bazaar-sale logs.
 const PDA_API_KEY=PDA_RUNTIME_KEY;
 // A single placeholder occurrence is required: TornPDA substitutes EVERY occurrence.
 const appKey=/^[A-Za-z0-9_-]{12,100}$/.test(PDA_API_KEY)?PDA_API_KEY:'';
 let purchaseKeyInUse='';
  const cfg=()=>({relay:read('relay'),token:read('token'),torn:read('torn')||appKey,partnerId:Number(read('partnerId')||0)});
 const money=n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const numeric=x=>{const n=Number(String(x??'').replace(/[$,\s]/g,''));return Number.isSafeInteger(n)?n:NaN;};
 const uuid=()=>crypto.randomUUID?.()||('mb-'+Date.now()+'-'+Math.random().toString(36).slice(2));
 // New pipeline starts at install time so legacy manually logged sales are not double counted.
 if(!read('v2SaleStart')) await save('v2SaleStart',Date.now()-120000);
 let state=null,working=false,opened=false,status='Not connected',lastTrades=0,lastLogs=0,lastBazaar=0,lastPurchaseScan=Number(read('lastPurchaseScanAt')||0),lastPurchaseResult='Not scanned on this device';
 const scannedTradeIds=new Set();
 const itemNames=new Map();
 const minutes=n=>n*60000;
 async function request(url,payload){
   // Torn API credentials stay local; requests to the relay carry tokens, not API keys.
   let result=payload===undefined
     ? await PDA_httpGet(url,{})
     : await PDA_httpPost(url,{'Content-Type':'text/plain;charset=utf-8'},JSON.stringify(payload));
   // Apps Script ContentService returns a 302/303 to a one-time GET-only URL.
   // On iOS TornPDA follow ONLY the trusted Google URL; never retry the POST.
   const code=Number(result?.status);
   if(payload!==undefined && (code===302||code===303) && new URL(url).hostname==='script.google.com'){
     const h=result.responseHeaders;
     const location=typeof h==='string'
       ? (h.match(/(?:^|\r?\n)location:\s*([^\r\n]+)/i)||[])[1]
       : (h && typeof h==='object' ? (h.location||h.Location||'') : '');
     let redirect=null;
     try{if(location)redirect=new URL(String(location).trim(),url);}catch(_){}
     if(!redirect || redirect.protocol!=='https:' || redirect.hostname!=='script.googleusercontent.com' || redirect.pathname!=='/macros/echo')
       throw Error('HTTP '+code+': Google response redirect missing or unexpected (check web app access)');
     result=await PDA_httpGet(redirect.href,{});
   }
   const status=Number(result && result.status);
   if(!Number.isFinite(status)||status<200||status>=300)throw Error('HTTP '+String(result?.status??'unknown'));
   let data;
   try{data=JSON.parse(result.responseText);}catch(_){throw Error('Invalid JSON from '+new URL(url).hostname);}
   if(data.error)throw Error(typeof data.error==='object'?(data.error.error||JSON.stringify(data.error)):String(data.error));
   return data;
 }
 async function api(path,params={}){
   const key=purchaseKeyInUse||cfg().torn;if(!key)throw Error('TornPDA API key not available');
   const q=new URLSearchParams({...params,key});return request('https://api.torn.com/v2/'+path+'?'+q);
 }
 async function relay(op,data={}){
   const c=cfg();if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.relay))throw Error('Google relay URL must end in /exec');
   if(c.token.length<24)throw Error('Missing relay token');
   const r=await request(c.relay,{token:c.token,op,data,reqId:uuid()});if(!r.ok)throw Error(r.error||'Relay failed');state=r.state;return state;
 }
 async function refresh(silent=false){if(working||!cfg().relay||!cfg().token)return;working=true;try{await relay('state');status='Synchronized';}catch(e){status='Sync failed: '+e.message;if(!silent)alert(status);}finally{working=false;draw();}}
 async function writeOp(op,data,message){if(working)return;working=true;try{await relay(op,data);status=message;draw();}catch(e){status='ERROR: '+e.message;alert(status);}finally{working=false;draw();}}
 async function verifyKey(){const r=await api('user/basic');const p=r.profile;if(!p?.id)throw Error('Expected v2 user/basic profile');await PDA_storage.setMany({[prefix+'playerId']:String(p.id),[prefix+'playerName']:String(p.name)});cache[prefix+'playerId']=String(p.id);cache[prefix+'playerName']=String(p.name);status='Torn API verified: '+p.name+' ['+p.id+']';draw();return p.id;}
 function isPositive(n){return Number.isSafeInteger(n)&&n>0;}
 async function syncTrades(){
   if(state?.role!=='owner')return 0;
   const ownerId=await verifyKey(),supplierId=cfg().partnerId;
   // Import completed trades even if Morpheus never created a proposed lot.
   // Limit the catch-up window to the last 72 hours and preserve known trade IDs.
   const from=Math.floor((Date.now()-72*60*60*1000)/1000);
   const r=await api('user/trades',{cat:'finished',limit:'100',sort:'DESC',from:String(from)});
   if(!Array.isArray(r.trades))throw Error('Torn trades returned unexpected format');
   let count=0,checked=0;
   for(const t of r.trades){
     if(checked>=25)break;
     if(!isPositive(t.id)||!isPositive(t.completed_at)||t.completed_at<from)continue;
     if(scannedTradeIds.has(t.id))continue;
     if(![t.user?.id,t.trader?.id].includes(ownerId))continue;
     const otherId=t.user.id===ownerId?t.trader.id:t.user.id;
     if(!isPositive(otherId)||otherId===ownerId)continue;
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
         await relay('trade_intake',{tradeId:t.id,line,completedAt:detail.completed_at,name:itemNames.get(di.id),itemId:di.id,uid:di.uid??null,qty:di.amount,senderId:otherId,receiverId:ownerId});
       }
       count++;
     }
     scannedTradeIds.add(t.id);
   }
   if(checked>=25)status='Trade scan inspected 25 trades. Run again if older transfers remain.';
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
 function chooseLoggedPurchases(l,allLots,purchases){
   if(l.mode!=='supplier'||l.status!=='awaiting_cost'||!l.tradeRef)return null;
   const recvTime=new Date(l.createdAt).getTime(),allUsed={};
   for(const other of allLots){
     if(other.id===l.id)continue;
     for(const part of other.purchaseParts||[])allUsed[part.logId]=(allUsed[part.logId]||0)+part.qty;
     if(other.purchaseLogId){const proof=purchases.find(p=>p.logId===other.purchaseLogId);
       if(proof)allUsed[proof.logId]=(allUsed[proof.logId]||0)+proof.qty;}
   }
   const available=purchases.filter(p=>p.itemId===l.itemId
      &&(l.uid==null||p.uid==null||p.uid===l.uid)
      &&p.timestamp*1000<=recvTime+300000&&p.timestamp*1000>=recvTime-120*86400000
      &&p.qty-(allUsed[p.logId]||0)>0)
      .sort((a,b)=>b.timestamp-a.timestamp||(a.logId<b.logId?-1:a.logId>b.logId?1:0));
   let remaining=l.qty;const parts=[];
   for(const p of available){
     const take=Math.min(remaining,p.qty-(allUsed[p.logId]||0));
     if(take>0){parts.push({logId:p.logId,qty:take});remaining-=take;}
     if(remaining===0)break;
   }
   return remaining===0&&parts.length<=40?parts:null;
 }
 async function choosePurchaseKey(){
   // Prefer the key TornPDA already supplies. Use a saved override only if it has better coverage.
   const keys=[{source:'TornPDA',key:appKey},{source:'Ledger override',key:read('torn')}]
     .filter(x=>x.key&&/^[A-Za-z0-9_-]{12,100}$/.test(x.key))
     .filter((x,i,a)=>a.findIndex(y=>y.key===x.key)===i);
   if(!keys.length)throw Error('TornPDA has not supplied a usable API key');
   const expected=new Set(state.lots.filter(l=>l.mode==='supplier'&&l.status==='awaiting_cost'&&l.tradeRef).map(l=>l.senderId));
   let best=null;
   for(const candidate of keys){
     try{
       const basic=await request('https://api.torn.com/v2/user/basic?'+new URLSearchParams({key:candidate.key}));
       const id=Number(basic?.profile?.id);
       if(!expected.has(id))continue;
       let access=0;
       for(const logType of [1112,1225,4200,4201]){
         try{
           const check=await request('https://api.torn.com/v2/user/log?'+new URLSearchParams({
             log:String(logType),limit:'1',key:candidate.key
           }));
           if(Array.isArray(check.log))access++;
         }catch(_){}
       }
       if(!best||access>best.access)best={key:candidate.key,source:candidate.source,access,playerId:id};
       if(access===4)break;
     }catch(_){}
   }
   if(!best)throw Error('No installed Torn API key belongs to the Morpheus sender of pending trades');
   if(best.access===0)throw Error('TornPDA API key lacks purchase-log access. The app cannot grant permissions that its key does not have.');
   purchaseKeyInUse=best.key;
   return best;
 }
 async function syncPurchaseLogs(){
   if(state?.role!=='supplier')throw Error('Sign in as Morpheus to scan his purchase logs');
   const awaitingLots=state.lots.filter(l=>l.tradeRef&&l.mode==='supplier'&&l.status==='awaiting_cost');
   if(!awaitingLots.length)return {noPending:true,read:0,relevant:0,imported:0,matched:0,skipped:0,errors:[]};
   const selected=await choosePurchaseKey();
   const supplierId=await verifyKey();
   const lots=awaitingLots.filter(l=>l.senderId===supplierId);
   if(!lots.length)throw Error('TornPDA API account does not match the supplier of pending inventory');
   const wanted=new Set(lots.map(l=>l.itemId)),floor=Math.floor((Math.min(...lots.map(l=>new Date(l.createdAt).getTime()))-120*86400000)/1000);
   const stats={read:0,relevant:0,imported:0,matched:0,skipped:0,pages:0,errors:[],truncated:[],keySource:selected.source,keyPermissions:selected.access};
   for(const type of [1112,1225,4200,4201]){
     let url='https://api.torn.com/v2/user/log?'+new URLSearchParams({log:String(type),limit:'100',from:String(floor),key:purchaseKeyInUse});
     const seen=new Set();
     try{
       for(let page=0;page<8&&url;page++){
         if(seen.has(url))throw Error('Repeated pagination link');seen.add(url);
         const response=await request(url);
         if(!Array.isArray(response.log))throw Error('Invalid log response');
         stats.pages++;
         for(const raw of response.log){
           stats.read++;const p=parsePurchaseLog(raw,type);
           if(!p){stats.skipped++;continue;}
           if(!wanted.has(p.itemId))continue;
           stats.relevant++;
           if(state.purchaseLogs.some(x=>x.logId===p.logId))continue;
           await relay('purchase_log',p);stats.imported++;
         }
         const next=response._metadata?.links?.next;
         if(!next){url=null;break;}
         const nextUrl=new URL(next);
         if(nextUrl.protocol!=='https:'||nextUrl.hostname!=='api.torn.com'||nextUrl.pathname!=='/v2/user/log')
           throw Error('Untrusted pagination address');
         nextUrl.searchParams.set('key',purchaseKeyInUse);url=nextUrl.href;
         if(page===7)stats.truncated.push(type);
       }
     }catch(e){stats.errors.push(String(type)+': '+e.message);}
   }
   // Attribute only quantity supported by real Torn log entries, newest prior purchases first.
   // The server independently validates each log, date, item ID, quantity, and non-reuse.
   const pending=state.lots.filter(l=>l.senderId===supplierId&&l.tradeRef&&l.mode==='supplier'
     &&l.status==='awaiting_cost').sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
   for(const l of pending){
     const parts=chooseLoggedPurchases(l,state.lots,state.purchaseLogs);
     if(!parts)continue;
     try{await relay('purchase_apply_bundle',{lotId:l.id,supplierId,parts});stats.matched++;}
     catch(e){stats.errors.push(l.name+': '+e.message);}
   }
   stats.pending=state.lots.filter(l=>l.senderId===supplierId&&l.tradeRef&&l.mode==='supplier'&&l.status==='awaiting_cost').length;
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
 async function syncSales(){
   if(state?.role!=='owner')return 0;
   const lots=state.lots.filter(l=>l.status==='confirmed'&&isPositive(l.itemId)&&l.qty>l.sold+l.returned);
   if(!lots.length)return 0;
   // Long-running inventory may need extended backfill. Look back at least 30 days; paginate to avoid lost sales.
   const first=Math.min(...lots.map(l=>new Date(l.confirmedAt||l.createdAt).getTime()));
   const from=Math.floor(Math.max(first-minutes(30),Number(read('v2SaleStart')),Date.now()-90*86400000)/1000);
   let url='https://api.torn.com/v2/user/log?'+new URLSearchParams({log:'1226',limit:'100',from:String(from),key:cfg().torn});
   const all=[],seenPages=new Set();
   for(let p=0;p<15&&url;p++){
     if(seenPages.has(url))break;seenPages.add(url);
     const r=await request(url);if(!Array.isArray(r.log))throw Error('Expected Torn v2 user/log array');all.push(...r.log);
     const next=r._metadata?.links?.next||null;
     if(r.log.length>=100&&!next)throw Error('100-log page without continuation; sale history may be incomplete');
     if(next&&/^https:\/\/api\.torn\.com\/v2\/user\/log\?/.test(next)){
       const n=new URL(next);n.searchParams.set('key',cfg().torn);url=n.href;
     }else url=null;
     if(p===14&&next)throw Error('More than 15 pages of sale logs: batch incomplete; retry later');
   }
   all.sort((a,b)=>a.timestamp-b.timestamp||String(a.id).localeCompare(String(b.id)));
   let count=0,exceptions=0,unparsed=0;
   for(const log of all){
     const s=parseBazaarLog(log);if(!s)continue;if(s.skip){unparsed++;continue;}
     if(state.sales.some(x=>x.sourceId===s.sourceId)||state.exceptions.some(x=>x.id===s.sourceId))continue;
     const possible=state.lots.filter(l=>l.status==='confirmed'&&l.itemId===s.itemId&&(l.uid==null||l.uid===s.uid)&&l.qty-l.sold-l.returned>=s.qty&&l.unitCost!==null&&new Date(l.confirmedAt).getTime()<=s.timestamp*1000+300000);
     const viable=possible.filter(l=>l.unitCost<=s.unitPrice);
     if(viable.length===1){await relay('sale_import',{...s,lotId:viable[0].id});count++;}
     else if(possible.length||state.lots.some(l=>l.status==='confirmed'&&l.itemId===s.itemId)){await relay('sale_pending',{...s,reason:viable.length>1?'Multiple eligible inventory lots':'Quantity, price, or inventory-cost conflict'});exceptions++;}
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
      }else if(state.role==='supplier'){
        if(!appKey&&!read('torn')){
          lastPurchaseResult='NOT SCANNED: TornPDA API key not available.';
          warnings.push('Purchase scan skipped: API key unavailable');
        }else if(!silent||Date.now()-lastPurchaseScan>minutes(10)){
          lastPurchaseScan=Date.now();
          try{await save('lastPurchaseScanAt',lastPurchaseScan);}catch(error){console.warn('[Morpheus Ledger] Scan throttle persistence failed',error);}
          try{
            const stats=await syncPurchaseLogs();
            lastPurchaseResult=stats.noPending?'No supplier lots awaiting purchase costs':
              'Purchase evidence ('+stats.keySource+', '+stats.keyPermissions+'/4 log permissions): '+stats.read+' logs read; '+stats.relevant+' relevant; '+stats.imported+' saved; '+
              stats.matched+' lots priced; '+stats.pending+' pending; '+stats.skipped+' log formats skipped.'+
              (stats.truncated.length?' More pages may exist for '+stats.truncated.join(', ')+'.':'')+
              (stats.errors.length?' Errors: '+stats.errors.join(' | '):'');
            if(stats.errors.length)warnings.push('Purchase costs: '+stats.errors.join(' | '));
          }catch(e){lastPurchaseResult='Purchase scan FAILED: '+e.message;warnings.push('Purchase costs: '+e.message);}
        }
      }
      status=warnings.length?'Sync partial — '+warnings.join(' | '):
       state.role==='supplier'?lastPurchaseResult:'Connected: trades/sales checked at '+new Date().toLocaleTimeString();
   }catch(e){status='Sync failed: '+e.message;if(!silent)alert(status);}finally{working=false;draw();}
 }
 const host=document.createElement('div');host.id='morpheus-pda';document.documentElement.appendChild(host);const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=`*,*:before,*:after{box-sizing:border-box}.open{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));right:12px;background:#2854ab;border:0;color:white;padding:13px 17px;min-height:46px;border-radius:30px;font:bold 14px system-ui;z-index:2147483640;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none}.panel{position:fixed;bottom:calc(72px + env(safe-area-inset-bottom));right:8px;width:calc(100vw - 16px);max-height:calc(100dvh - 104px - env(safe-area-inset-bottom));overflow:auto;background:#111d2b;color:#eaf1fb;border:1px solid #405979;border-radius:12px;box-shadow:0 14px 45px #000a;font:14px/1.42 system-ui;z-index:2147483641}header,section{padding:12px 16px;border-bottom:1px solid #32455c}header{display:flex;align-items:center;gap:9px;justify-content:space-between;position:sticky;top:0;background:#1c2e46;z-index:1}header b{font-size:16px}button{font:600 12px system-ui;cursor:pointer;color:#fff;background:#2b55a1;border:1px solid #6984a4;padding:10px 12px;min-height:42px;border-radius:6px}button:disabled{opacity:.55;cursor:default}input,select,textarea{background:#0a1827;border:1px solid #59728f;padding:7px;color:#fff;border-radius:5px;width:100%;min-height:42px;font:16px system-ui}label{display:block;color:#bacce0;margin:8px 0 3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metrics div{background:#20344c;padding:8px;border-radius:6px}.metrics strong{font-size:16px;display:block}.muted{font-size:12px;color:#b2c6db}.row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.line{border-bottom:1px solid #344b62;padding:8px 0}.line:last-child{border:0}details summary{cursor:pointer;font-weight:700;margin-bottom:7px}.hide{display:none!important}.warning{padding:8px;border-radius:5px;background:#433b26;color:#ffe4a3}.critical{color:#ffbbaa}.pill{background:#29435e;padding:2px 7px;border-radius:20px;font-size:11px}.num{font-variant-numeric:tabular-nums}.scroll{max-height:280px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:right;border-bottom:1px solid #344b62;padding:5px}th:first-child,td:first-child{text-align:left}@media(max-width:500px){.metrics,.grid{grid-template-columns:1fr}}`;
 root.appendChild(style);const opener=document.createElement('button');opener.className='open';opener.textContent='Bazaar Ledger';root.appendChild(opener);const panel=document.createElement('div');panel.className='panel hide';root.appendChild(panel);// The floating launcher can be dragged anywhere within the safe viewport.
 // Save relative coordinates so its placement survives reload and screen rotation.
 const BUTTON_MARGIN=10;
 const bound=(v,min,max)=>Math.max(min,Math.min(max,v));
 const buttonLimits=()=>({right:Math.max(BUTTON_MARGIN,window.innerWidth-opener.offsetWidth-BUTTON_MARGIN),bottom:Math.max(BUTTON_MARGIN,window.innerHeight-opener.offsetHeight-60)});
 function positionButton(nx,ny){
   const lim=buttonLimits();
   const x=BUTTON_MARGIN+bound(nx,0,1)*(lim.right-BUTTON_MARGIN);
   const y=BUTTON_MARGIN+bound(ny,0,1)*(lim.bottom-BUTTON_MARGIN);
   opener.style.left=Math.round(x)+'px';opener.style.top=Math.round(y)+'px';
   opener.style.right='auto';opener.style.bottom='auto';
 }
 function restoreButton(){
   if(read('buttonX')===''||read('buttonY')==='')return;
   const x=Number(read('buttonX')),y=Number(read('buttonY'));
   if(Number.isFinite(x)&&Number.isFinite(y))positionButton(x,y);
 }
 restoreButton();
 let drag=null,suppressTap=false;
 opener.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   const rect=opener.getBoundingClientRect();
   drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,left:rect.left,top:rect.top,moved:false};
   if(opener.setPointerCapture)opener.setPointerCapture(e.pointerId);
 });
 opener.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
   if(!drag.moved&&Math.hypot(dx,dy)<8)return;
   drag.moved=true;
   const lim=buttonLimits();
   opener.style.left=Math.round(bound(drag.left+dx,BUTTON_MARGIN,lim.right))+'px';
   opener.style.top=Math.round(bound(drag.top+dy,BUTTON_MARGIN,lim.bottom))+'px';
   opener.style.right='auto';opener.style.bottom='auto';
   e.preventDefault();
 });
 async function finishDrag(e){
   if(!drag||e.pointerId!==drag.id)return;
   const moved=drag.moved;drag=null;
   if(opener.hasPointerCapture?.(e.pointerId))opener.releasePointerCapture(e.pointerId);
   if(!moved)return;
   // Suppress the synthetic click that otherwise opens the dashboard after a drag.
   suppressTap=true;
   setTimeout(()=>{suppressTap=false;},400);
   const lim=buttonLimits(),rect=opener.getBoundingClientRect();
   const nx=(lim.right-BUTTON_MARGIN)>0?(rect.left-BUTTON_MARGIN)/(lim.right-BUTTON_MARGIN):0;
   const ny=(lim.bottom-BUTTON_MARGIN)>0?(rect.top-BUTTON_MARGIN)/(lim.bottom-BUTTON_MARGIN):0;
   const values={[prefix+'buttonX']:String(bound(nx,0,1)),[prefix+'buttonY']:String(bound(ny,0,1))};
   try{await PDA_storage.setMany(values);Object.assign(cache,values);}
   catch(err){console.error('[Morpheus PDA] Failed to save button placement:',err);}
 }
 opener.addEventListener('pointerup',e=>{void finishDrag(e);});
 opener.addEventListener('pointercancel',e=>{void finishDrag(e);});
 opener.addEventListener('click',e=>{
   if(suppressTap){e.preventDefault();e.stopPropagation();suppressTap=false;return;}
   opened=!opened;panel.classList.toggle('hide',!opened);if(opened)draw();
 });
 window.addEventListener('resize',()=>{if(!drag)restoreButton();});
 function rowsReport(obj){return Object.keys(obj||{}).sort().reverse().slice(0,8).map(k=>`<tr><td>${esc(k)}</td><td>${esc(obj[k].sales)}</td><td>${money(obj[k].profit)}</td><td>${money(obj[k].morpheusProfit)}</td><td>${money(obj[k].morpheusDue)}</td><td>${money(obj[k].ownerProfit)}</td></tr>`).join('');}
 function itemRow(l){const rem=l.qty-l.sold-l.returned,buttons=[];
   if(state.role==='owner'&&l.status==='awaiting_cost'&&l.mode==='supplier'&&l.tradeRef&&l.unitCost==null&&l.sold===0&&l.returned===0&&!l.purchaseLogId)buttons.push(`<button data-action="correctSource" data-id="${esc(l.id)}">Correct item source</button>`);
   if(state.role==='owner'&&l.status==='awaiting_split'&&l.senderId!==cfg().partnerId)buttons.push(`<button data-action="crimeSplit" data-id="${esc(l.id)}">Approve crime-drop split</button>`);
   if(state.role==='owner'&&l.status==='received_pending')buttons.push(`<button data-action="classify" data-id="${esc(l.id)}">Classify received item</button>`);
   if(state.role==='owner'&&l.status==='proposed'&&l.mode==='owner')buttons.push(`<button data-action="confirm" data-id="${esc(l.id)}">Confirm my purchase</button>`);
   if(state.role==='owner'&&l.status==='proposed')buttons.push(`<button data-action="reject" data-id="${esc(l.id)}">Reject</button>`);
   if(state.role==='supplier'&&l.unitCost===null&&l.mode==='supplier'&&!l.tradeRef&&l.status!=='rejected')buttons.push(`<button data-action="price" data-id="${esc(l.id)}">Enter buy price</button>`);
   if(state.role==='owner'&&l.status==='confirmed'&&l.mode==='supplier'&&rem>0)buttons.push(`<button data-action="return" data-id="${esc(l.id)}">Log item return</button>`);
   return `<div class="line"><b>${esc(l.name)}</b> <span class="pill">${esc(l.status)}</span><div class="muted">ID ${esc(l.itemId??'missing')} • Lot ${esc(l.id.slice(0,12))}${l.senderId?' • From Torn #'+esc(l.senderId):''} • ${rem}/${l.qty} remaining • ${l.unitCost==null?'cost pending':money(l.unitCost)+' cost each'} • ${l.mode==='supplier'?'Morpheus-funded 50/50':l.mode==='owner'?'Owner-funded '+l.feePct+'% sourcing':l.mode==='return'?'Returned property — no payout':l.mode==='crime'?'Crime reward — $0 acquisition; share pending':'Received — funding unclassified'}${l.tradeId?' • Trade #'+esc(l.tradeId):''}</div><div class="row">${buttons.join('')}</div></div>`;
 }
 function draw(){if(!opened)return;const c=cfg(),s=state?.summary,role=state?.role;
   let html=`<header><b>Morpheus Bazaar Ledger</b><span class="muted">v${VERSION}</span><button data-action="close">Close</button></header><section class="row"><b>${esc(status)}</b><button data-action="refresh" ${working?'disabled':''}>Refresh ledger</button><button data-action="scan" ${working?'disabled':''}>Scan Torn API</button></section>`;
   if(s){html+=`<section><div class="muted">Signed in: <b>${role==='owner'?'Bazaar Owner':'Morpheus'}</b> • Business day ${esc(s.openDay)} (19:00 ET cutoff)</div><div class="metrics"><div><span class="muted">${role==='owner'?'Expected to pay':'Expected pay'} — today</span><strong class="num">${money(s.current.morpheusDue)}</strong></div><div><span class="muted">${role==='owner'?'Daily expected to pay':'Daily expected'} — last close</span><strong class="num">${money(s.lastClosed.morpheusDue)}</strong></div><div><span class="muted">Lifetime unpaid balance</span><strong class="num">${money(s.remaining)}</strong></div></div><div class="metrics" style="margin-top:9px"><div><span class="muted">Today's gross sales</span><strong>${money(s.current.gross)}</strong></div><div><span class="muted">Today's net profit</span><strong>${money(s.current.profit)}</strong></div><div><span class="muted">Your earnings today</span><strong>${money(role==='owner'?s.current.ownerProfit:s.current.morpheusProfit)}</strong></div></div><p class="muted"><b>Today:</b> ${money(s.current.morpheusProfit)} Morpheus profit + ${money(s.current.capitalDue)} capital reimbursement = ${money(s.current.morpheusDue)} total payable. <b>Last close:</b> ${money(s.lastClosed.morpheusProfit)} profit + ${money(s.lastClosed.capitalDue)} capital = ${money(s.lastClosed.morpheusDue)} payable. Lifetime debt survives rollover. Cash transfers remain manual.</p></section>`;
     if(role==='supplier')html+=`<section><b>Purchase cost sync</b><p class="muted">${esc(lastPurchaseResult)}. The script automatically checks TornPDA's API key, scans permitted purchase logs, and selects an existing override only if necessary. No separate key entry is needed when TornPDA's key has sufficient access.</p></section>`;
     if(role==='supplier')html+=`<section><b>Optional: source a purchase lead</b><form id="newlot"><div class="grid"><div><label>Item name</label><input name="name" required></div><div><label>Torn Item ID (required to auto-verify trades)</label><input name="itemId" type="number" min="1" required></div><div><label>Quantity</label><input name="qty" type="number" min="1" required></div><div><label>My buy cost per unit ($)</label><input name="cost" placeholder="Can fill in later"></div><div><label>Funding</label><select name="mode"><option value="supplier">I purchased — 50/50 profit</option><option value="owner">Owner purchases my lead — sourcing fee</option></select></div><div><label>Sourcing fee (%) if owner-funded</label><input name="fee" type="number" value="20" min="0" max="100"></div><div><label>Item UID (optional, for unique equipment)</label><input name="uid" type="number" min="1"></div></div><label>Notes</label><textarea name="note"></textarea><button>Submit to shared ledger</button></form><p class="muted">For an ordinary item transfer, no submission is needed: trade directly and the owner scanner imports it. Only sourcing leads need this form.</p><button data-action="trade">Open partner's Torn profile to trade</button></section>`;
     if(role==='owner')html+=`<section><b>Trade & sale reconciliation</b><p class="muted">Completed incoming item trades from all Torn players are imported automatically with no manual proposal. New receipts are marked pending until funding/cost is classified. Only your Bazaar sale logs are scanned (Torn log 1226). Only unambiguous sales book profit.</p><button data-action="trade">Open Morpheus's profile</button> <button data-action="scan">Check trades & sales now</button> <button data-action="crimeBulk">Classify crime drops in trade</button> <button data-action="approveMorpheus100">Approve all Morpheus crime drops - 100%</button> <p class="muted">Last trade scan: ${lastTrades?new Date(lastTrades).toLocaleString():'not yet'} · Last sale scan: ${lastLogs?new Date(lastLogs).toLocaleString():'not yet'}</p></section>`;
     html+=`<section><details open><summary>Inventory lots (${state.lots.length})</summary><div class="scroll">${state.lots.map(itemRow).join('')||'No inventory yet'}</div></details></section>`;
     if(state.exceptions?.length)html+=`<section><details open><summary>Unmatched Bazaar sales (${state.exceptions.length}) — action required</summary>${state.exceptions.map(x=>`<div class="line"><b>Sale ${esc(x.id)}</b> • Item #${x.itemId} • ${x.qty} × ${money(x.unitPrice)}<div class="critical">${esc(x.reason)}</div>${role==='owner'?`<button data-action="reconcile" data-id="${esc(x.id)}">Assign to inventory lot</button>`:''}</div>`).join('')}</details></section>`;
     if(role==='owner')html+=`<section><b>Payment after sending Torn cash</b><form id="payment"><div class="grid"><div><label>Amount sent</label><input name="amount" type="number" min="1" max="${s.remaining}" required></div><div><label>Torn reference</label><input name="reference"></div></div><button ${s.remaining<=0?'disabled':''}>Record payment sent</button></form></section>`;
     html+=`<section><details><summary>Payments (${state.payments.length})</summary>${state.payments.map(p=>`<div class="line">${money(p.amount)} • ${esc(p.at)} • ${p.acknowledged?'Acknowledged':'Awaiting acknowledgment'} ${role==='supplier'&&!p.acknowledged?`<button data-action="ack" data-id="${esc(p.id)}">Confirm receipt</button>`:''}</div>`).join('')||'No payments'}</details><details><summary>Sales history (${state.sales.length})</summary><div class="scroll">${state.sales.slice(0,100).map(x=>`<div class="line">${esc(x.name)} × ${x.qty} • ${money(x.gross)} revenue • ${money(x.cost)} cost • Morpheus profit ${money(x.morpheusProfit)} + capital ${money(x.capitalDue)} = ${money(x.morpheusDue)} due • Owner ${money(x.ownerProfit)} <span class="muted">${esc(x.at)} / ${esc(x.sourceId||'legacy/manual')}</span></div>`).join('')}</div></details></section>`;
     html+=`<section><details><summary>Daily, weekly & monthly reports</summary>${[['Daily',state.daily],['Weekly',state.weekly],['Monthly',state.monthly]].map(([label,x])=>`<b>${label}</b><table><thead><tr><th>Period</th><th>Sales</th><th>Net profit</th><th>Profit to Morpheus</th><th>Total owed</th><th>Owner</th></tr></thead><tbody>${rowsReport(x)}</tbody></table>`).join('')}<button data-action="export">Export CSV</button></details></section>`;
   }else html+=`<section class="warning">Configure the shared relay and personal token below to connect. Owner auto-sales require a Custom Torn API key with user/log 1226.</section>`;
   html+=`<section><details ${s?'':'open'}><summary>Settings</summary><form id="settings"><label>Same Google Apps Script /exec URL for both users</label><input name="relay" required value="${esc(c.relay)}"><label>Personal relay token (different for each player)</label><input name="token" type="password" required value="${esc(c.token)}"><label>Optional key override (the script automatically selects TornPDA's key first)</label><input name="torn" type="password" value="${esc(c.torn)}"><label>Partner's Torn player ID</label><input name="partnerId" type="number" min="1" value="${c.partnerId||''}"><button>Save & connect</button> <button type="button" data-action="verify">Verify Torn API key</button><p class="muted">Owner: Custom key granting v2 user/log log type 1226, plus user/trades, user/{tradeId}/trade and user/basic; v1 user/bazaar for listing snapshots. Morpheus: Torn key optional for ledger; if using it, Public is enough for user/basic. Data policy: your override key and relay token are stored privately in TornPDA's per-script storage; trade and sale identifiers, quantities, costs, and proceeds stored in your private Google Sheet, visible to both partners.</p></form></details></section>`;
   panel.innerHTML=html;
   panel.querySelectorAll('button[data-action]').forEach(x=>x.addEventListener('click',()=>act(x.dataset.action,x.dataset.id)));
   panel.querySelector('#settings')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const updates={};for(const k of ['relay','token','torn','partnerId'])updates[prefix+k]=String(f.get(k)??'').trim();try{await PDA_storage.setMany(updates);Object.assign(cache,updates);state=null;await refresh();}catch(e){alert('Could not save settings in TornPDA: '+e.message);}});
   panel.querySelector('#newlot')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const cost=String(f.get('cost')||'').trim(),uid=String(f.get('uid')||'').trim();await writeOp('propose',{lotId:uuid(),name:String(f.get('name')),itemId:numeric(f.get('itemId')),uid:uid?numeric(uid):null,qty:numeric(f.get('qty')),unitCost:cost?numeric(cost):null,mode:String(f.get('mode')),feePct:numeric(f.get('fee')),note:String(f.get('note'))},'Inventory proposed; now complete Torn trade');});
   panel.querySelector('#payment')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=numeric(f.get('amount'));if(!isPositive(amount)||amount>state.summary.remaining)return alert('Invalid amount');if(!confirm('Have you actually SENT '+money(amount)+' to Morpheus in Torn?'))return;await writeOp('payment',{amount,reference:String(f.get('reference'))},'Payment recorded');});
 }
 async function act(action,id){if(action==='close'){opened=false;panel.classList.add('hide');return;}if(action==='refresh')return refresh();if(action==='scan')return syncAll();if(action==='verify'){try{await verifyKey();}catch(e){alert(e.message)}return;}if(action==='trade'){
     if(!isPositive(cfg().partnerId))return alert('Set the partner Torn player ID in Settings first');
     window.location.assign('https://www.torn.com/profiles.php?XID='+cfg().partnerId);return;
   }
   if(action==='export'){const rows=[['Type','Timestamp','Item','Quantity','Gross','Cost','Net Profit','Morpheus Due','Owner Profit','Source']];for(const s of state.sales)rows.push(['Sale',s.at,s.name,s.qty,s.gross,s.cost,s.profit,s.morpheusDue,s.ownerProfit,s.sourceId||'manual']);for(const p of state.payments)rows.push(['Payment',p.at,'',0,p.amount,'','','','',''+p.reference]);const csv=rows.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='Morpheus.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);return;}
   if(!state)return;const l=state.lots.find(x=>x.id===id);
   if(action==='classify'&&l&&l.status==='received_pending'){
     const category=prompt('Item #'+l.itemId+' (qty '+l.qty+'). Choose: supplier = Morpheus PURCHASED; crime = crime reward ($0 acquisition); owner = I purchased; return = my property returned.','crime');
     if(!category)return;
     const mode=category.trim().toLowerCase();
     if(!['supplier','owner','return','crime'].includes(mode))return alert('Enter supplier, owner, return, or crime');
     const payload={lotId:l.id,mode,partnerId:cfg().partnerId};
     if(mode==='owner'){
       const cost=prompt('Your actual purchase cost per unit:');
       if(cost===null)return;
       const fee=prompt('Agreed Morpheus sourcing fee percentage (0 if none):','0');
       if(fee===null)return;
       payload.unitCost=numeric(cost);payload.feePct=numeric(fee);
     }
     if(!confirm('Classify item #'+l.itemId+' as '+mode+'? No payout is booked until a verified sale.'))return;
     await writeOp('trade_classify',payload,mode==='supplier'?'Funding assigned; Morpheus can now enter acquisition cost':'Received trade classified');
     return;
   }
   if(action==='correctSource'&&l&&l.mode==='supplier'&&l.status==='awaiting_cost'){
     const chosen=prompt('Correct item source for '+l.name+'. Type crime for a $0 crime drop or return for your property returned. Purchased items must remain supplier.','return');
     if(chosen===null)return;
     const mode=chosen.trim().toLowerCase();
     if(mode!=='crime'&&mode!=='return')return alert('Enter crime or return');
     if(!confirm('Correct '+l.name+' × '+l.qty+' from SUPPLIER to '+mode.toUpperCase()+'? This writes an audited correction; no sale or payment is changed.'))return;
     await writeOp('trade_correct_source',{lotId:l.id,mode},'Trade funding source corrected');
     return;
   }
   if(action==='crimeBulk'){
     const tradeText=prompt('Completed Torn trade ID containing crime drops:');
     if(tradeText===null)return;
     const tradeId=numeric(tradeText);
     const list=state.lots.filter(l=>l.tradeId===tradeId&&(l.status==='received_pending'||(l.status==='awaiting_cost'&&l.mode==='supplier'&&l.unitCost==null&&l.sold===0&&l.returned===0&&!l.purchaseLogId)));
     if(!list.length)return alert('No unpriced, unclassified or incorrectly supplier-classified receipts in that trade');
     const bought=prompt('Enter exact item names PURCHASED with money, separated by commas. These will NOT be classified as crime drops.\n\nTrade items:\n'+list.map(l=>l.name+' × '+l.qty).join('\n')+'\n\nType NONE only if everything was a crime drop.','');
     if(bought===null)return;
     const exclude=new Set(bought.trim().toLowerCase()==='none'?[]:bought.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
     if(!exclude.size&&bought.trim().toLowerCase()!=='none')return alert('Enter purchased item names or NONE');
     if([...exclude].some(name=>!list.some(l=>l.name.toLowerCase()===name)))return alert('A purchased item name did not match exactly. No inventory changed.');
     const targets=list.filter(l=>!exclude.has(l.name.toLowerCase()));
     if(!targets.length)return alert('All items excluded; nothing to classify');
     if(!confirm('Correct '+targets.length+' item types to CRIME DROPS with $0 acquisition cost?\n'+targets.map(l=>l.name+' × '+l.qty).join('\n')+'\n\nProfit shares remain pending approval.'))return;
     await writeOp('trade_bulk_crime',{tradeId,lotIds:targets.map(l=>l.id)},'Crime drop sources recorded; split still requires approval');
     return;
   }
   if(action==='approveMorpheus100'){
       const senderId=cfg().partnerId;
       if(!isPositive(senderId))return alert('Set Morpheus Torn ID in Settings first.');
       const eligible=state.lots.filter(x=>x.tradeRef&&x.senderId===senderId&&x.mode==='crime'&&x.status==='awaiting_split'&&x.unitCost===0&&x.sold===0&&x.returned===0&&!x.purchaseLogId);
       if(!eligible.length)return alert('No pending Morpheus crime drops remain.');
       const units=eligible.reduce((n,x)=>n+x.qty,0);
       if(!confirm('Approve '+eligible.length+' crime-drop lots ('+units+' items) from Morpheus for 100% of actual Bazaar sale proceeds? Purchased stock and previously confirmed items are excluded.'))return;
       await writeOp('crime_share_all',{senderId},'Approved all pending Morpheus crime drops at 100%');
       return;
     }
     if(action==='approveBulk'){
     const tradeText=prompt('Completed Torn trade ID to approve crime-drop shares for:');
     if(tradeText===null)return;
     const tradeId=numeric(tradeText),targets=state.lots.filter(l=>l.tradeId===tradeId&&l.mode==='crime'&&l.status==='awaiting_split');
     if(!targets.length)return alert('No crime drops awaiting a profit split for that trade');
     const entered=prompt('Agreed percentage of crime-drop SALE PROFIT owed to Morpheus (0–100):','50');
     if(entered===null)return;
     const pct=numeric(entered);if(!Number.isSafeInteger(pct)||pct<0||pct>100)return alert('Invalid percentage');
     if(!confirm('Approve '+pct+'% of sale profit for Morpheus on '+targets.length+' crime-drop item types? Acquisition cost is $0.'))return;
     await writeOp('crime_split_bulk',{tradeId,lotIds:targets.map(l=>l.id),feePct:pct},'Crime-drop split approved');
     return;
   }
   if(action==='crimeSplit'&&l&&l.status==='awaiting_split'){
     const value=prompt('Agreed percentage of crime-drop SALE PROFIT owed to Morpheus (0–100):');
     if(value===null)return;
     const pct=numeric(value);
     if(!Number.isSafeInteger(pct)||pct<0||pct>100)return alert('Invalid percentage');
     if(!confirm('Set Morpheus crime-drop share to '+pct+'% for '+l.name+'? Acquisition cost is $0.'))return;
     await writeOp('crime_split',{lotId:l.id,feePct:pct},'Crime-drop proceeds split approved');
     return;
   }
   if(action==='price'&&l){const x=prompt('Morpheus buy price PER UNIT:',l.unitCost||'');if(x!==null)await writeOp('price',{lotId:l.id,unitCost:numeric(x)},'Purchase price recorded');}
   if(action==='confirm'&&l){if(!confirm('Did you purchase this owner-funded sourcing lead with your funds?'))return;const x=prompt('Your ACTUAL purchase cost PER UNIT:');if(x!==null)await writeOp('confirm',{lotId:l.id,unitCost:numeric(x)},'Owner-funded lead confirmed');}
   if(action==='reject'&&l&&confirm('Reject this lot?'))await writeOp('reject',{lotId:l.id},'Rejected');
   if(action==='return'&&l){const q=prompt('How many units were actually returned?');if(q!==null)await writeOp('return',{lotId:l.id,qty:numeric(q)},'Return recorded');}
   if(action==='ack'&&confirm('Have you actually received this payment in Torn?'))await writeOp('ack',{paymentId:id},'Receipt acknowledged');
   if(action==='reconcile'){
     const ex=state.exceptions.find(x=>x.id===id);if(!ex)return;
     const options=state.lots.filter(x=>x.status==='confirmed'&&x.itemId===ex.itemId&&(x.uid==null||x.uid===ex.uid)&&x.qty-x.sold-x.returned>=ex.qty&&x.unitCost!==null&&x.unitCost<=ex.unitPrice);
     if(!options.length)return alert('No valid lot has enough stock. Review inventory and pricing first.');
     const choice=prompt('Choose inventory LOT ID for this sale:\n'+options.map(x=>x.id+' • '+x.name+' • '+(x.qty-x.sold-x.returned)+' remaining • '+money(x.unitCost)+' cost').join('\n'),options[0].id);
     if(!choice||!options.some(x=>x.id===choice))return alert('No valid lot chosen');
     const timestamp=Math.floor(new Date(ex.at).getTime()/1000);if(!confirm(`Assign Torn sale ${ex.id} to lot ${choice}? This books ${money(ex.gross)} revenue.`))return;
     await writeOp('sale_reconcile',{sourceId:ex.id,lotId:choice,itemId:ex.itemId,uid:ex.uid,qty:ex.qty,unitPrice:ex.unitPrice,timestamp},'Sale matched');
   }
 }
 if(cfg().relay&&cfg().token)syncAll(true);
 setInterval(()=>{if(document.visibilityState==='visible'&&cfg().relay&&cfg().token&&!working)syncAll(true);},minutes(3));
})();