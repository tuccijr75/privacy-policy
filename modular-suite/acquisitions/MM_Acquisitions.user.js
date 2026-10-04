// ==UserScript==
// @name         MM_Acquisitions
// @namespace    manic-mike.torn.acquisitions
// @version      8.0.0-alpha.9
// @description  Dedicated acquisition workflow for Bazaar, Item Market and Travel with live verification, ROI filters and purchase-ledger sync.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/acquisitions/MM_Acquisitions.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/acquisitions/MM_Acquisitions.user.js
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.13
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/acquisitions/MM_Acquisitions.logic.js?v=8.0.0-alpha.2
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/acquisitions/MM_Acquisitions.live.js?v=8.0.0-alpha.2
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/acquisitions/MM_Acquisitions.purchase.logic.js?v=8.0.0-alpha.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID='mm-acquisitions';
  const LAUNCHER_ID='mm-acquisitions-launcher';
  const API_KEY='mm_acquisitions_api_v1';
  const TRAVEL_FEED_KEY='mm_acquisitions_travel_feed_v1';
  const TRAVEL_RETURN_KEY='mm_acquisitions_travel_return_v1';
  const WEAV_WATCH_LEASE_KEY='mm_acquisitions_weav_watch_lease_v1';
  const CHANNEL='mm_bazaar_crm_cross_tab_v1';
  const INSTANCE_ID='acq-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  const AUTO_REFRESH_MS=60_000;
  const PURCHASE_STALE_MS=120_000;
  const OPPORTUNITY_STALE_MS=300_000;
  const TRAVEL_FRESH_MS=300_000;
  const TRAVEL_STALE_MS=900_000;
  const TRAVEL_CONTEXT_REFRESH_MS=60_000;

  let activeView='deals';
  let state=null;
  let loadError='';
  let statusText='Ready.';
  let busy=false;
  let watchRunning=false;
  let watchTimer=null;
  let autoRefreshRunning=false;
  let autoRefreshTimer=null;
  let channel=null;
  let armoryRequest=null;
  let armorySources=null;
  let travelContext=null;
  let travelContextCheckedAt=0;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornAcquisitionsLogic;
  const live=globalThis.MMTornAcquisitionsLive;
  const ledger=globalThis.MMTornAcquisitionLedger;

  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=value=>'$'+Math.max(0,Number(value)||0).toLocaleString('en-US',{maximumFractionDigits:0});
  const apiKey=()=>String(GM_getValue(API_KEY,'')||'').trim();

  function button(primary=false){
    return 'border:1px solid '+(primary?'#9a7b35':'#555')+';background:'+(primary?'#4b3b18':'#232323')+';color:#eee;border-radius:6px;padding:7px 10px;cursor:pointer;font:12px Arial,sans-serif;';
  }

  function inputCss(){
    return 'box-sizing:border-box;background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:7px;font:12px Arial,sans-serif;';
  }

  function card(html){
    return '<div style="border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;margin-bottom:7px;">'+html+'</div>';
  }

  function age(value){
    const ms=Date.parse(value||'');
    if(!ms)return 'not synced';
    const sec=Math.max(0,Math.floor((Date.now()-ms)/1000));
    if(sec<60)return sec+'s ago';
    if(sec<3600)return Math.floor(sec/60)+'m ago';
    if(sec<86400)return Math.floor(sec/3600)+'h ago';
    return Math.floor(sec/86400)+'d ago';
  }

  function normalizeTravelLocation(value){
    const raw=String(value||'').trim().toLowerCase().replaceAll('.','');
    const aliases={
      'torn':'torn',
      'uk':'united kingdom',
      'united kingdom':'united kingdom',
      'uae':'united arab emirates',
      'united arab emirates':'united arab emirates',
      'south africa':'south africa',
      'cayman islands':'cayman islands',
      'switzerland':'switzerland',
      'japan':'japan',
      'china':'china',
      'mexico':'mexico',
      'canada':'canada',
      'argentina':'argentina',
      'hawaii':'hawaii'
    };
    return aliases[raw]||raw;
  }

  function parseTravelContext(data){
    const profile=(data?.profile&&typeof data.profile==='object')?data.profile:
      ((data?.user&&typeof data.user==='object')?data.user:(data||{}));
    const status=(profile?.status&&typeof profile.status==='object')?profile.status:{};
    const stateName=String(status.state||profile.state||'').trim();
    const description=String(status.description||profile.status_description||'').trim();
    const lower=stateName.toLowerCase();
    let mode='torn',origin='',destination='',country='';
    if(lower==='traveling'){
      mode='traveling';
      const m=description.match(/travel(?:ing)?\s+from\s+(.+?)\s+to\s+(.+)$/i);
      if(m){origin=String(m[1]||'').trim();destination=String(m[2]||'').trim();}
    }else if(lower==='abroad'){
      mode='abroad';
      const m=description.match(/(?:in|at)\s+(.+)$/i);
      country=String(m?.[1]||'').trim();
    }else if(!stateName){
      mode='unknown';
    }
    return {
      mode,state:stateName,description,origin,destination,country,
      checkedAt:Date.now()
    };
  }

  function marketNavigationBlocked(ctx=travelContext){
    return ctx?.mode==='traveling'||ctx?.mode==='abroad';
  }

  function travelContextLabel(ctx=travelContext){
    if(!ctx||ctx.mode==='unknown')return 'Travel context unavailable';
    if(ctx.mode==='traveling')return ctx.description||'Traveling';
    if(ctx.mode==='abroad')return ctx.country?('Abroad · '+ctx.country):(ctx.description||'Abroad');
    return ctx.state||'In Torn';
  }

  async function refreshTravelContext({force=false,silent=true}={}){
    if(!apiKey())return travelContext;
    if(!force&&travelContext&&Date.now()-travelContextCheckedAt<TRAVEL_CONTEXT_REFRESH_MS)return travelContext;
    try{
      const data=await tornRequest('/user/basic');
      travelContext=parseTravelContext(data);
      travelContextCheckedAt=Date.now();
      if(!silent)statusText='Travel context updated: '+travelContextLabel(travelContext)+'.';
      return travelContext;
    }catch(error){
      travelContextCheckedAt=Date.now();
      if(!silent)statusText='Travel context unavailable: '+(error?.message||String(error));
      return travelContext;
    }
  }

  function gmText(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'text/html,application/xhtml+xml'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status));
          const body=String(r.responseText||'');
          if(/just a moment|challenge-platform|cf-chl/i.test(body))return reject(new Error('Cloudflare challenge blocked direct refresh.'));
          resolve(body);
        },
        ontimeout:()=>reject(new Error('Request timed out.')),
        onerror:()=>reject(new Error('Network request failed.'))
      });
    });
  }

  function readTravelFeed(){
    const raw=GM_getValue(TRAVEL_FEED_KEY,null);
    if(!raw)return null;
    if(typeof raw==='string'){try{return JSON.parse(raw);}catch{return null;}}
    return raw&&typeof raw==='object'?raw:null;
  }

  function writeTravelFeed(rows,capturedAt=Date.now()){
    const payload={capturedAt:Number(capturedAt||Date.now()),rows:Array.isArray(rows)?rows:[]};
    GM_setValue(TRAVEL_FEED_KEY,JSON.stringify(payload));
    return payload;
  }

  function beginTravelCapture(){
    GM_setValue(TRAVEL_RETURN_KEY,{url:location.href,at:Date.now()});
    statusText='Opening TornW3B Travel Stock for live capture…';
    render();
    setTimeout(()=>{location.href='https://weav3r.dev/travel-stock';},120);
  }

  function captureTravelPage(){
    try{
      const rows=live.parseTravelStockHtml(document.documentElement.outerHTML);
      return writeTravelFeed(rows,Date.now()).rows.length;
    }catch{return 0;}
  }

  function installTravelCollector(){
    if(!/^(www\.)?weav3r\.dev$/.test(location.hostname)||!location.pathname.startsWith('/travel-stock'))return;
    let attempts=0,stable=0,lastCount=0,returned=false;
    let observer=null;
    const maybeReturn=count=>{
      if(!count||returned)return;
      stable=count===lastCount?stable+1:1;
      lastCount=count;
      if(stable<2)return;
      const ret=GM_getValue(TRAVEL_RETURN_KEY,null);
      const requestedAt=Number(ret?.at||0);
      const returnUrl=String(ret?.url||'');
      if(returnUrl.startsWith('https://www.torn.com/')&&Date.now()-requestedAt<5*60*1000){
        returned=true;
        GM_deleteValue(TRAVEL_RETURN_KEY);
        try{observer?.disconnect();}catch{}
        setTimeout(()=>{location.href=returnUrl;},650);
      }
    };
    const capture=()=>{
      if(returned)return;
      attempts++;
      const count=captureTravelPage();
      if(count>0)maybeReturn(count);
      if(!returned&&attempts<90)setTimeout(capture,1000);
    };
    observer=new MutationObserver(()=>{
      if(returned)return;
      const table=[...document.querySelectorAll('table')].find(t=>{
        const x=String(t.textContent||'').toLowerCase();
        return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');
      });
      if(table){
        const count=captureTravelPage();
        if(count>0)maybeReturn(count);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(capture,700);
  }

  function gmJson(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'application/json'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status));
          let data;
          try{data=JSON.parse(r.responseText);}catch{return reject(new Error('Invalid JSON response.'));}
          if(data?.error){
            const msg=data.error?.error||data.error?.message||data.error||'API error';
            return reject(new Error(String(msg)));
          }
          resolve(data);
        },
        ontimeout:()=>reject(new Error('Request timed out.')),
        onerror:()=>reject(new Error('Network request failed.'))
      });
    });
  }

  function weavRequest(path,params={}){
    const url=new URL('https://weav3r.dev/api'+path);
    for(const [k,v] of Object.entries(params||{})) if(v!==undefined&&v!==null&&v!=='') url.searchParams.set(k,String(v));
    return gmJson(url.toString());
  }

  function tornRequest(path){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Save a Torn API key in MM Acquisitions Settings first.'));
    const url=new URL(path.startsWith('http')?path:'https://api.torn.com/v2'+path);
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM_Acquisitions');
    return gmJson(url.toString());
  }

  function bazaarRequest(sellerId){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Save a Torn API key in MM Acquisitions Settings first.'));
    const url=new URL('https://api.torn.com/user/'+encodeURIComponent(String(sellerId||'')));
    url.searchParams.set('selections','bazaar');
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM_Acquisitions');
    return gmJson(url.toString());
  }

  function navigate(url){
    const target=String(url||'');
    const isTornMarket=/^https:\/\/www\.torn\.com\/(?:bazaar\.php|page\.php\?sid=ItemMarket)/i.test(target);
    if(isTornMarket&&marketNavigationBlocked()){
      throw new Error('Torn market purchase pages are unavailable while traveling or abroad. Return to Torn before routing this market purchase.');
    }
    close();
    setTimeout(()=>{location.href=target;},20);
  }

  const service=live?.createService({
    core,logic,weavRequest,tornRequest,bazaarRequest,
    hasTornKey:()=>Boolean(apiKey()),
    navigate
  });

  async function importTravelCapture({silent=false}={}){
    const feed=readTravelFeed();
    if(!feed?.rows?.length) {
      if(!silent){statusText='No MM Acquisitions travel capture is available yet.';render();}
      return false;
    }
    const currentAt=Date.parse(state?.travelIntel?.lastSyncAt||'')||0;
    const capturedAt=Number(feed.capturedAt||0);
    if(capturedAt<=currentAt)return false;
    state=await service.importTravelRows(feed.rows,capturedAt);
    if(!silent)statusText='Imported '+feed.rows.length+' live TornW3B travel routes.';
    return true;
  }

  async function updateTravelData(){
    if(busy||watchRunning)return;
    busy=true;
    statusText='Refreshing TornW3B Travel Stock…';
    render();
    try{
      const html=await gmText('https://weav3r.dev/travel-stock');
      const rows=live.parseTravelStockHtml(html);
      const feed=writeTravelFeed(rows,Date.now());
      state=await service.importTravelRows(feed.rows,feed.capturedAt);
      statusText='Travel updated: '+rows.length+' current routes.';
    }catch(error){
      busy=false;
      statusText='Direct refresh blocked; opening live TornW3B page for capture…';
      render();
      beginTravelCapture();
      return;
    }
    busy=false;
    render();
  }

  async function reloadCachedState(){
    loadError='';
    if(!core||!logic||!live||!ledger||!service){
      loadError='MM Acquisitions dependencies did not load.';
      state=null;
      render();
      return;
    }
    try{
      const next=await core.readLegacyState();
      const validation=core.validateLegacyState(next);
      if(!validation.ok)throw new Error(validation.errors.join('; '));
      state=next;
      try{await importTravelCapture({silent:true});}catch{}
    }catch(error){
      state=null;
      loadError=error?.message||String(error);
    }
    render();
  }

  async function refreshOpportunities(){
    if(busy||watchRunning)return;
    busy=true;
    statusText='Refreshing Weav3r opportunities'+(apiKey()?' + Torn Item Market…':'…');
    render();
    try{
      state=await service.refreshOpportunities({enrichLimit:8,itemMarketLimit:6});
      statusText='Opportunity refresh complete.';
    }catch(error){
      statusText='Refresh failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  async function saveBusinessRules(root){
    if(!state)return;
    const read=id=>Number(root.querySelector(id)?.value||0);
    const minPrice=Math.max(0,read('#mm-acq-rule-min-price'));
    const values={
      minRoiPct:Math.max(0,read('#mm-acq-rule-min-roi')),
      minDemandPerDay:Math.max(0,read('#mm-acq-rule-min-demand')),
      minPrice,
      maxPrice:Math.max(minPrice,read('#mm-acq-rule-max-price')),
      minAbsoluteProfit:Math.max(0,read('#mm-acq-rule-min-profit')),
      minSellerCount:Math.max(0,Math.round(read('#mm-acq-rule-min-sellers'))),
      minConfidencePct:Math.max(0,Math.min(100,read('#mm-acq-rule-min-confidence'))),
      maxListingAgeSec:Math.max(30,Math.round(read('#mm-acq-rule-max-age')))
    };
    await core.updateDomainState('core',draft=>{
      draft.businessRules={...(draft.businessRules||{}),...values,updatedAt:new Date().toISOString()};
      return draft;
    });
    state=await core.readLegacyState();
    statusText='Shared business rules saved.';
    render();
  }

  async function acquire(itemId){
    if(busy||watchRunning)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before live verification.';
      activeView='settings';
      render();
      return;
    }
    busy=true;
    statusText='Checking travel state, live price and seller availability…';
    render();
    try{
      const ctx=await refreshTravelContext({force:true,silent:true});
      if(marketNavigationBlocked(ctx)){
        statusText='Market purchase deferred: '+travelContextLabel(ctx)+'. Torn Bazaar / Item Market routing resumes when you are back in Torn.';
        return;
      }
      const result=await service.acquire(itemId);
      if(!result?.routed){
        const reason=String(result?.reason||'no-live-source');
        statusText=reason==='no-qualified-opportunity'
          ? 'Opportunity no longer meets ROI/profit rules.'
          : reason==='no-live-source-inside-ceiling'
            ? 'No current Bazaar seller or Item Market listing remains inside the buy ceiling.'
            : 'Could not route purchase: '+reason;
        state=await core.readLegacyState();
      }
    }catch(error){
      statusText='Live verification failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  function claimWatchLease(){
    const now=Date.now();
    const current=GM_getValue(WEAV_WATCH_LEASE_KEY,null);
    if(current?.owner&&current.owner!==INSTANCE_ID&&Number(current.expiresAt||0)>now)return false;
    GM_setValue(WEAV_WATCH_LEASE_KEY,{owner:INSTANCE_ID,expiresAt:now+75000});
    return true;
  }

  async function pollWeav3rWhileOpen(){
    const root=document.getElementById(ROOT_ID);
    if(watchRunning||busy||document.visibilityState!=='visible'||!root||root.style.display==='none')return;
    if(!claimWatchLease())return;
    watchRunning=true;
    try{
      const result=await service.refreshGlobal();
      if(result?.changed){
        state=await service.refreshOpportunities({enrichLimit:8,itemMarketLimit:apiKey()?6:0,refreshGlobalFirst:false});
        statusText='Weav3r published a new market generation; Acquisitions updated automatically.';
        render();
      }else if(result?.state){
        state=result.state;
      }
    }catch(error){
      console.warn('[MM_Acquisitions] Weav3r watch failed',error);
    }finally{
      watchRunning=false;
    }
  }

  function startWatcher(){
    if(watchTimer)return;
    setTimeout(pollWeav3rWhileOpen,1500);
    watchTimer=setInterval(pollWeav3rWhileOpen,60000);
  }

  function stopWatcher(){
    if(watchTimer){clearInterval(watchTimer);watchTimer=null;}
    const current=GM_getValue(WEAV_WATCH_LEASE_KEY,null);
    if(current?.owner===INSTANCE_ID)GM_setValue(WEAV_WATCH_LEASE_KEY,{owner:INSTANCE_ID,expiresAt:0});
  }

  function nextUrlFromMetadata(data){
    const next=data?._metadata?.links?.next??data?.metadata?.links?.next??data?._metadata?.next??data?.pagination?.next??null;
    if(typeof next!=='string'||!next.trim())return '';
    try{return new URL(next,'https://api.torn.com/v2/').toString();}catch{return '';}
  }
  function logRows(data){
    const raw=data?.log??data?.logs??data?.data?.log??data?.data?.logs??null;
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,row])=>({id:row?.id??row?.log_id??id,...(row&&typeof row==='object'?row:{})}));
    return [];
  }
  async function fetchPurchaseLogs(logId,fromSeconds,maxPages=50){
    const rows=[];const seen=new Set();let url=new URL('https://api.torn.com/v2/user/log');
    url.searchParams.set('log',String(logId));url.searchParams.set('from',String(Math.floor(fromSeconds)));url.searchParams.set('limit','100');
    let pages=0;
    while(url&&pages<maxPages){
      const clean=url.toString();if(seen.has(clean))throw new Error('Purchase log pagination loop detected.');
      seen.add(clean);const data=await tornRequest(clean);rows.push(...logRows(data));pages++;
      const next=nextUrlFromMetadata(data);url=next?new URL(next):null;
    }
    if(url)throw new Error('Purchase history exceeded '+maxPages+' page safety limit for log '+logId+'.');
    return rows;
  }
  async function syncPurchases(){
    if(busy||watchRunning)return;
    if(!apiKey()){statusText='Save a Torn API key in Settings before syncing purchases.';activeView='settings';render();return;}
    if(!ledger)throw new Error('Acquisition ledger dependency missing.');
    busy=true;statusText='Syncing Bazaar + Item Market purchase logs…';render();
    try{
      const current=await core.readLegacyState();const proc=ledger.ensureProcurement(current?.procurement||{});
      const fromMs=ledger.syncWindowStart(proc,Date.now(),180,24);const fetched={};
      for(const [logId,source] of Object.entries(ledger.ACQUISITION_LOG_IDS))fetched[logId]={source,rows:await fetchPurchaseLogs(Number(logId),fromMs/1000,50)};
      let added=0;
      await core.updateDomainState('market',draft=>{
        draft.procurement=ledger.ensureProcurement(draft.procurement||{});
        for(const pack of Object.values(fetched))added+=ledger.mergeAcquisitionLogRows(draft.procurement,pack.rows,pack.source);
        draft.procurement.lastAcquisitionSyncAt=new Date().toISOString();return draft;
      });
      state=await core.readLegacyState();statusText='Purchase ledger synced: '+added+' new lot'+(added===1?'':'s')+'.';
    }catch(error){statusText='Purchase sync failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function autoRefreshAcquisitions({force=false}={}){
    if(autoRefreshRunning||busy||watchRunning||document.visibilityState!=='visible')return;
    const root=document.getElementById(ROOT_ID);
    if(!root||root.style.display==='none')return;
    autoRefreshRunning=true;
    try{
      state=await core.readLegacyState();
      try{await importTravelCapture({silent:true});}catch{}
      if(apiKey())try{await refreshTravelContext({force:false,silent:true});}catch{}
      const f=core.freshnessSnapshot(state||{});
      const now=Date.now();
      const purchaseAt=Date.parse(f.acquisitions||state?.procurement?.lastAcquisitionSyncAt||'')||0;
      const itemMarketAt=Date.parse(f.itemMarket||'')||0;
      if(apiKey()&&(force||!purchaseAt||now-purchaseAt>=PURCHASE_STALE_MS))await syncPurchases();
      if(force||!itemMarketAt||now-itemMarketAt>=OPPORTUNITY_STALE_MS)await refreshOpportunities();
      else render();
    }catch(error){
      console.warn('[MM_Acquisitions] automatic refresh failed',error);
      statusText='Auto-refresh warning: '+(error?.message||String(error));
      render();
    }finally{autoRefreshRunning=false;}
  }

  function startAutoRefresh(){
    if(autoRefreshTimer)return;
    setTimeout(()=>autoRefreshAcquisitions({force:false}),900);
    autoRefreshTimer=setInterval(()=>autoRefreshAcquisitions({force:false}),AUTO_REFRESH_MS);
  }

  function stopAutoRefresh(){
    if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
  }

  function sourceStrip(){
    if(!state)return '';
    const f=core.freshnessSnapshot(state);
    return '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-bottom:7px;">'+
      '<span>Weav3r '+esc(age(f.weav3rGeneratedAt))+'</span>'+
      '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
      '<span>· Travel '+esc(age(f.travel))+'</span>'+      '<span>· Purchases '+esc(age(state?.procurement?.lastAcquisitionSyncAt))+' ('+Number(state?.procurement?.acquisitions?.length||0)+')</span>'+
      '<span>· Torn key '+(apiKey()?'<b style="color:#9fe3a8;">SAVED</b>':'<b style="color:#ffd18a;">NOT SAVED</b>')+'</span>'+
      '<span>· Weav auto-check <b style="color:#9fe3a8;">WHILE OPEN</b></span>'+
    '</div>';
  }

  function armoryRequestHtml(){
    if(!armoryRequest)return '';
    const sources=Array.isArray(armorySources?.sources)?armorySources.sources:[];
    const rows=sources.length?sources.map(source=>
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:6px 0;font-size:11px;">'+
        '<div><b>'+esc(source.source)+'</b> · '+money(source.price)+(source.country?' · '+esc(source.country):'')+
        (source.quantity?' · qty/stock '+Number(source.quantity).toLocaleString():'')+'</div>'+
        '<button data-armory-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(source.source===armoryRequest.preferredSource)+(busy?'opacity:.5;':'')+'">Use '+esc(source.source)+'</button>'+
      '</div>'
    ).join(''):'<div style="font-size:11px;color:#888;margin-top:5px;">No live source comparison loaded yet.</div>';
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Faction Armory request: '+esc(armoryRequest.itemName)+'</b>'+
          '<div style="font-size:10px;color:#888;">Need '+Number(armoryRequest.qty||1).toLocaleString()+' · '+esc(armoryRequest.armoryReason||'Faction requirement')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-armory-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Compare Sources</button>'+
          '<button data-armory-route="Best" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Find Best Source</button>'+
          (armorySources?.reason==='overseas-recommended'?'<button id="mm-acq-armory-travel-agency" style="'+button(true)+'">Open Travel Agency</button>':'')+
          '<button id="mm-acq-armory-clear" style="'+button()+'">Clear</button>'+
        '</div>'+
      '</div>'+rows
    );
  }

  async function refreshArmorySources(){
    if(!armoryRequest||busy)return;
    busy=true;statusText='Comparing Bazaar, Item Market and overseas sources for '+armoryRequest.itemName+'…';render();
    try{
      armorySources=await service.procurementSourceOptions(armoryRequest.itemId,armoryRequest.itemName);
      state=armorySources?.state||await core.readLegacyState();
      statusText=armorySources?.sources?.length
        ?'Source comparison ready for '+armoryRequest.itemName+'. Final purchase remains manual.'
        :'No live source is currently cached/available for '+armoryRequest.itemName+'.';
    }catch(error){statusText='Source comparison failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function routeArmoryRequest(preferredSource='Best'){
    if(!armoryRequest||busy)return;
    busy=true;statusText='Verifying '+preferredSource+' source for '+armoryRequest.itemName+'…';render();
    try{
      const result=await service.routeProcurementRequest({...armoryRequest,preferredSource});
      armorySources=result;
      if(result?.routed){
        statusText='Verified '+result.source+' source for '+armoryRequest.itemName+'. Complete the purchase manually on Torn.';
        return;
      }
      if(result?.reason==='overseas-recommended'){
        activeView='travel';
        const qty=Math.max(1,Number(armoryRequest?.qty||1));
        statusText='Overseas is the selected source: '+String(result.country||'destination')+' · '+money(result.price||0)+' each · '+money(Number(result.price||0)*qty)+' for '+qty.toLocaleString()+' · stock '+Number(result.stock||0).toLocaleString()+'. Use Open Travel Agency when ready; travel/purchase remains manual.';
      }else if(result?.reason==='preferred-source-unavailable'){
        statusText=preferredSource+' is not currently available for '+armoryRequest.itemName+'. Compare Sources for alternatives.';
      }else if(result?.reason==='item-id-unresolved'){
        statusText='Could not resolve a Torn item ID for '+armoryRequest.itemName+'.';
      }else{
        statusText='Could not route '+armoryRequest.itemName+': '+String(result?.reason||'no live source')+'.';
      }
    }catch(error){statusText='Armory procurement routing failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined'||channel)return;
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.addEventListener('message',event=>{
        if(event?.data?.type!=='armory-acquisition-request')return;
        armoryRequest={...(event.data.payload||{})};
        armorySources=null;
        activeView=String(armoryRequest.preferredSource||'').toLowerCase()==='overseas'?'travel':'deals';
        open();
        statusText='Faction Armory requested '+String(armoryRequest.itemName||'item')+' x'+Number(armoryRequest.qty||1).toLocaleString()+'. Comparing sources…';
        render();
        setTimeout(refreshArmorySources,80);
      });
    }catch(error){console.warn('[MM_Acquisitions] channel unavailable',error);}
  }

  function dealsHtml(){
    if(!state)return card('<b>No cached market state available.</b>');
    const rows=logic.rankCachedOpportunities(state);
    const buyable=rows.filter(r=>r.purchaseReady).slice(0,12);
    const research=rows.filter(r=>!r.purchaseReady).slice(0,8);

    return armoryRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Profit Opportunities</b><div style="font-size:10px;color:#888;">ROI + sell-through + profit velocity. Purchase routing always re-verifies first.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-reload" style="'+button()+'">Reload Cache</button><button id="mm-acq-sync-purchases" '+(busy?'disabled':'')+' style="'+button()+'">Sync Purchases</button><button id="mm-acq-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Opportunities</button></div>'+
      '</div>'
    )+
    card('<b>Rule-Qualified Deals</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">Meets current ROI / profit / listing / confidence rules. Current cash balance is not checked; Verify & Buy re-verifies the source and keeps final purchase manual.</div>'+
      (buyable.length?buyable.map((r,i)=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b> · '+esc(r.purchaseSource)+
          '<div>Buy <b>'+money(r.buyPrice)+'</b> · Max '+money(r.maxBuyPrice)+' · Exit '+money(r.bestExit)+' · ROI <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="color:#888;">3d sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% ('+esc(r.conversionSource)+') · Confidence '+Number(r.confidence||0).toFixed(0)+'% · Live listings '+Number(r.liveListingCount||0)+' · Qty '+Number(r.recommendedQty||1)+' · Est. 3d profit '+money(r.expectedProfit3d||0)+'</div></div>'+
          '<button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Verify & Buy</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No current cached opportunity meets the active business rules.</div>')
    )+
    card('<details><summary style="cursor:pointer;font-weight:700;">Research leads ('+research.length+')</summary>'+
      '<div style="font-size:10px;color:#888;margin:4px 0;">These require fresher seller or Item Market evidence before routing.</div>'+
      (research.length?research.map(r=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;font-size:10px;">'+
          '<div><b>'+esc(r.name)+'</b> · ROI '+Number(r.roiPct||0).toFixed(1)+'% · Sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% · score '+Number(r.score||0).toFixed(0)+'</div>'+
          '<button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'padding:4px 7px;">Find & Buy</button>'+
        '</div>'
      ).join(''):'<div style="font-size:10px;color:#888;margin-top:6px;">No additional leads.</div>')+
    '</details>');
  }

  function travelHtml(){
    if(!state)return card('<b>No cached travel state available.</b>');
    const ranked=logic.rankCachedTravel(state);
    const feed=readTravelFeed();
    const captureAge=feed?.capturedAt?age(new Date(Number(feed.capturedAt)).toISOString()):'none';
    const syncedAt=Date.parse(state.travelIntel?.lastSyncAt||'')||0;
    const travelAgeMs=syncedAt?Math.max(0,Date.now()-syncedAt):Infinity;
    const freshness=!Number.isFinite(travelAgeMs)?'UNKNOWN':travelAgeMs<=TRAVEL_FRESH_MS?'FRESH':travelAgeMs<=TRAVEL_STALE_MS?'AGING':'STALE';
    const ctx=travelContext;
    const current=normalizeTravelLocation(ctx?.country||'');
    const destination=normalizeTravelLocation(ctx?.destination||'');
    let scope='Next-trip planning from Torn';
    let scopedRows=ranked;
    if(ctx?.mode==='abroad'&&current){
      scope='Buy here now · '+String(ctx.country||'current destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===current);
    }else if(ctx?.mode==='traveling'&&destination&&destination!=='torn'){
      scope='Arrival planning · '+String(ctx.destination||'destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===destination);
    }else if(ctx?.mode==='traveling'){
      scope='In transit · next-trip planning only';
    }
    const stale=freshness==='STALE'||freshness==='UNKNOWN';
    const rows=(stale?[]:scopedRows).slice(0,20);
    const freshnessColor=freshness==='FRESH'?'#9fe3a8':freshness==='AGING'?'#ffd18a':'#ff9b9b';
    return armoryRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Travel Acquisition</b><div style="font-size:10px;color:#888;">Live overseas stock / profit with trip-aware filtering. Purchases and travel remain manual.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-travel-update" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Update Travel</button></div>'+
      '</div>'+
      '<div style="font-size:10px;margin-top:5px;"><b style="color:'+freshnessColor+';">'+esc(freshness)+'</b> · '+esc(scope)+' · '+esc(travelContextLabel(ctx))+'</div>'+
      '<div style="font-size:10px;color:#888;margin-top:3px;">Last browser capture: '+esc(captureAge)+' · Shared travel state: '+esc(age(state.travelIntel?.lastSyncAt))+'</div>'+
      (stale?'<div style="margin-top:6px;padding:6px;border:1px solid #7d3b3b;border-radius:5px;color:#ffb3b3;font-size:11px;"><b>Refresh required.</b> Stale/unknown travel data is not used for recommendations.</div>':'')+
      '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:10px;color:#888;">Recovery tools</summary><button id="mm-acq-travel-import" style="'+button()+'margin-top:5px;">Import Browser Capture</button></details>'
    )+
    card(rows.length?rows.map((r,i)=>
      '<div style="border-top:1px solid #303030;padding:7px 0;font-size:11px;"><b>#'+(i+1)+' '+esc(r.itemName)+'</b> · '+esc(r.country)+
      '<div>Stock '+Number(r.stock||0).toLocaleString()+' · Profit '+money(r.profit||0)+' · Source profit/hr '+money(r.sourceProfitPerHour||0)+'</div></div>'
    ).join(''):(stale
      ?'<div style="font-size:11px;color:#888;">No travel recommendations shown until data is refreshed.</div>'
      :'<div style="font-size:11px;color:#888;">No profitable current travel rows match this trip context.</div>'));
  }

  function settingsHtml(){
    const r=state?.businessRules||{};
    return card(
      '<b>MM Acquisitions Connection</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">The API key is stored only in this userscript\'s Tampermonkey GM storage. It is not copied to shared IndexedDB/localStorage. Required scope: User Basic, User Log purchase events used by the ledger, and market data needed for live verification.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto;gap:5px;align-items:center;">'+
        '<input id="mm-acq-api" type="password" autocomplete="off" placeholder="'+(apiKey()?'Torn API key saved — enter to replace':'Torn API key')+'" style="'+inputCss()+'">'+
        '<button id="mm-acq-save-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-acq-clear-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">While Acquisitions is open and visible, stale purchase logs and opportunity data refresh automatically with guarded intervals. Weav3r generation is checked once per minute. Verify & Buy and final purchase remain manual.</div>'
    )+
    card(
      '<b>Shared Acquisition Rules</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">These are the same shared rules used by the legacy CRM. MM Acquisitions writes only the Core configuration domain.</div>'+
      '<div style="font-size:10px;color:#777;margin:0 0 6px;">Personal-demand minimum applies only when enough personal sales history exists; otherwise the deal is labeled MARKET PROXY and ranked by market sell-through evidence.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;">'+
        '<label style="font-size:10px;color:#aaa;">Min ROI %<input id="mm-acq-rule-min-roi" type="number" min="0" step="0.1" value="'+Number(r.minRoiPct||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min personal demand/day<input id="mm-acq-rule-min-demand" type="number" min="0" step="0.01" value="'+Number(r.minDemandPerDay||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min buy<input id="mm-acq-rule-min-price" type="number" min="0" value="'+Number(r.minPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max buy<input id="mm-acq-rule-max-price" type="number" min="0" value="'+Number(r.maxPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min profit/unit<input id="mm-acq-rule-min-profit" type="number" min="0" value="'+Number(r.minAbsoluteProfit||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min live listings<input id="mm-acq-rule-min-sellers" type="number" min="0" value="'+Number(r.minSellerCount||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min confidence %<input id="mm-acq-rule-min-confidence" type="number" min="0" max="100" step="1" value="'+Number(r.minConfidencePct||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Listing freshness sec<input id="mm-acq-rule-max-age" type="number" min="30" value="'+Number(r.maxListingAgeSec||180)+'" style="'+inputCss()+'width:100%;"></label>'+
      '</div>'+
      '<button id="mm-acq-save-rules" style="'+button(true)+'margin-top:7px;">Save Shared Rules</button>'
    );
  }

  function createPanel(){
    if(document.getElementById(ROOT_ID))return;
    const root=document.createElement('div');
    root.id=ROOT_ID;
    root.style.cssText='display:none;position:fixed;right:12px;top:90px;z-index:2147483646;width:min(700px,calc(100vw - 24px));max-height:calc(100vh - 110px);overflow:hidden;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:9px;box-shadow:0 12px 35px #000b;font:13px/1.35 Arial,sans-serif;';
    document.body.appendChild(root);
  }

  function render(){
    const root=document.getElementById(ROOT_ID);
    if(!root||root.style.display==='none')return;

    root.innerHTML=
      '<div style="height:48px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 9px;">'+
        '<div><b style="font-size:15px;">MM_Acquisitions</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.9 · MARKET SCOUT / TRAVEL / VERIFY</div></div>'+
        '<button id="mm-acq-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;margin-bottom:7px;">'+
          '<button data-acq-view="deals" style="'+button(activeView==='deals')+'">Deals</button>'+
          '<button data-acq-view="travel" style="'+button(activeView==='travel')+'">Travel</button>'+
          '<button data-acq-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div style="padding:5px 7px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<b style="color:#ffaaaa;">Cannot read shared CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>'):'')+
        '<div style="max-height:calc(100vh - 240px);overflow:auto;padding-right:2px;">'+
          (activeView==='settings'?settingsHtml():activeView==='travel'?travelHtml():dealsHtml())+
        '</div>'+
      '</div>';

    core?.makePanelDraggable?.(
      root,
      root.firstElementChild,
      'acquisitions',
      window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'90px'}
    );
    root.querySelector('#mm-acq-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-acq-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView=b.dataset.acqView||'deals';
      render();
      if(activeView==='travel'&&apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    }));
    root.querySelectorAll('#mm-acq-reload').forEach(b=>b.addEventListener('click',reloadCachedState));
    root.querySelector('#mm-acq-live-refresh')?.addEventListener('click',refreshOpportunities);
    root.querySelector('#mm-acq-sync-purchases')?.addEventListener('click',syncPurchases);
    root.querySelector('#mm-acq-travel-update')?.addEventListener('click',updateTravelData);
    root.querySelector('#mm-acq-travel-import')?.addEventListener('click',()=>importTravelCapture({silent:false}).catch(error=>{
      statusText='Travel import failed: '+(error?.message||String(error));
      render();
    }));
    root.querySelectorAll('[data-acquire-item]').forEach(b=>b.addEventListener('click',()=>acquire(b.dataset.acquireItem)));
    root.querySelector('#mm-acq-armory-refresh')?.addEventListener('click',refreshArmorySources);
    root.querySelector('#mm-acq-armory-travel-agency')?.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';});
    root.querySelector('#mm-acq-armory-clear')?.addEventListener('click',()=>{armoryRequest=null;armorySources=null;statusText='Faction Armory acquisition request cleared.';render();});
    root.querySelectorAll('[data-armory-route]').forEach(b=>b.addEventListener('click',()=>routeArmoryRequest(b.dataset.armoryRoute||'Best')));
    root.querySelector('#mm-acq-save-key')?.addEventListener('click',()=>{
      const value=String(root.querySelector('#mm-acq-api')?.value||'').trim();
      if(value)GM_setValue(API_KEY,value);
      statusText=value?'MM Acquisitions API key saved. Refreshing automatically…':'Enter a key to save.';
      render();
      if(value)setTimeout(()=>autoRefreshAcquisitions({force:true}),50);
    });
    root.querySelector('#mm-acq-clear-key')?.addEventListener('click',()=>{
      GM_deleteValue(API_KEY);
      statusText='MM Acquisitions API key cleared.';
      render();
    });
    root.querySelector('#mm-acq-save-rules')?.addEventListener('click',()=>saveBusinessRules(root).catch(error=>{
      statusText='Could not save rules: '+(error?.message||String(error));
      render();
    }));
  }

  function open(){
    createPanel();
    const root=document.getElementById(ROOT_ID);
    root.style.display='block';
    core?.setDockLauncherActive?.('acquisitions',true);
    render();
    reloadCachedState().then(()=>autoRefreshAcquisitions({force:false}));
    if(apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    startWatcher();
    startAutoRefresh();
  }

  function close(){
    const root=document.getElementById(ROOT_ID);
    if(root)root.style.display='none';
    core?.setDockLauncherActive?.('acquisitions',false);
    stopWatcher();
    stopAutoRefresh();
  }

  function createLauncher(){
    if(!document.body)return;
    if(core?.registerDockLauncher){
      const b=core.registerDockLauncher({
        id:'acquisitions',
        label:'MM_Acquisitions',
        accent:'#4d7f65',
         icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M4 12h8M4 17h5M16 5l4 4-7 7-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        onClick:()=>{
          const root=document.getElementById(ROOT_ID);
          if(root&&root.style.display!=='none')close(); else open();
        }
      });
      if(b)b.id=LAUNCHER_ID;
      core.adoptLegacyCrmLauncher?.();
      return;
    }
    if(document.getElementById(LAUNCHER_ID))return;
    const b=document.createElement('button');
    b.id=LAUNCHER_ID;
    b.textContent='Acquisitions';
    b.style.cssText='position:fixed;right:52px;bottom:6px;z-index:2147483647;'+button(true);
    b.addEventListener('click',open);
    document.body.appendChild(b);
  }

  if(/^(www\.)?weav3r\.dev$/.test(location.hostname)){
    installTravelCollector();
    return;
  }
  function initializeAcquisitions(){createLauncher();installChannel();}
  if(document.body)initializeAcquisitions();
  else window.addEventListener('DOMContentLoaded',initializeAcquisitions,{once:true});
})();
