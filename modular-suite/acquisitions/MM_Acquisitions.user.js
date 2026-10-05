// ==UserScript==
// @name         MM_Acquisitions
// @namespace    manic-mike.torn.acquisitions
// @version      8.0.0-alpha.22
// @description  Market acquisition with seller-free Market Pulse liquidity, pricelist profit, ranked-weapon valuation, live market/auction scouting and travel procurement with manual final purchase.
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@410dc43062b1f72e85b5ce5b53a2166473c5732a/modular-suite/core/MM_Torn_Core.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6b1cc6bf26ad91823fc555a602377ce612931405/modular-suite/acquisitions/MM_Acquisitions.market-pulse.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6b1cc6bf26ad91823fc555a602377ce612931405/modular-suite/acquisitions/MM_Acquisitions.logic.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6b1cc6bf26ad91823fc555a602377ce612931405/modular-suite/acquisitions/MM_Acquisitions.live.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6b1cc6bf26ad91823fc555a602377ce612931405/modular-suite/acquisitions/MM_Acquisitions.ranked.logic.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@410dc43062b1f72e85b5ce5b53a2166473c5732a/modular-suite/acquisitions/MM_Acquisitions.purchase.logic.js
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
  const PULSE_LEASE_KEY='mm_acquisitions_market_pulse_lease_v1';
  const CHANNEL='mm_bazaar_crm_cross_tab_v1';
  const INSTANCE_ID='acq-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  const AUTO_REFRESH_MS=60_000;
  const PURCHASE_STALE_MS=120_000;
  const OPPORTUNITY_STALE_MS=300_000;
  const TRAVEL_FRESH_MS=300_000;
  const TRAVEL_STALE_MS=900_000;
  const TRAVEL_CONTEXT_REFRESH_MS=60_000;
  const CATALOG_STALE_MS=24*60*60*1000;
  const ITEM_PAGE_SIZE=75;
  const RANKED_PAGE_SIZE=30;
  const RANKED_LIVE_STALE_MS=300_000;
  const PRICELIST_STALE_MS=3600_000;
  const DEFAULT_PRICELIST_USER_ID='4054377';

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
  let itemQuery='';
  let itemCategory='All';
  let itemAvailability='buyable';
  let itemSort='name';
  let itemPage=0;
  let itemSelection=null;
  let itemSources=null;
  let verifiedSalesItemId='';
  let rankedType='all';
  let rankedSource='all';
  let rankedRarity='all';
  let rankedBonus='';
  let rankedWeapon='';
  let rankedMinRoi=0;
  let rankedPage=0;

  const core=globalThis.MMTornCore;
  const pulse=globalThis.MMTornMarketPulse;
  const logic=globalThis.MMTornAcquisitionsLogic;
  const live=globalThis.MMTornAcquisitionsLive;
  const rankedLogic=globalThis.MMTornRankedProfitLogic;
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

  function pulseLine(row={},itemId='',unitProfit=0){
    const p=(row&&row.pulseTier)?row:(logic?.pulseFields?.(state,itemId,unitProfit)||{});
    const tier=String(p?.pulseTier||'unknown');
    if(tier==='unknown')return '<div style="font-size:10px;color:#777;margin-top:4px;"><b>Market activity:</b> collecting seller-independent Torn API snapshots. Movement is not a confirmed sale.</div>';
    const freshness=typeof p?.pulseFreshness==='string'?String(p.pulseFreshness):String(p?.pulseFreshness?.label||'UNKNOWN');
    const sourceAt=Number(p?.pulseSourceTimestamp||0);
    const fetchedAt=Number(p?.pulseFetchedAt||0);
    const cacheDelaySec=Math.round(Math.max(0,Number(p?.pulseUpstreamCacheDelayMs||0))/1000);
    const tierLabel=tier==='proven'?'Strong evidence':tier==='candidate'?'Early signal':'Observed';
    const tierColor=tier==='proven'?'#9fe3a8':tier==='candidate'?'#d8b96a':'#9ab7c9';
    const score=p?.marketPulseScore===null||p?.marketPulseScore===undefined?'':(' · score '+Number(p.marketPulseScore||0).toFixed(0)+'/100');
    const velocity=Number(p?.profitVelocityPerHour||0)>0?' · est. profit velocity '+money(p.profitVelocityPerHour)+'/hr':'';
    return '<div style="margin-top:5px;padding:6px 7px;border:1px solid #2f4638;border-radius:6px;background:#121713;font-size:10px;line-height:1.45;">'+
      '<div style="color:'+tierColor+';"><b>Market activity:</b> '+esc(tierLabel)+
        ' · '+Number(p?.observedEventsPerHour||0).toFixed(2)+' movements/hr'+
        ' · '+Number(p?.observedUnitsPerHour||0).toFixed(2)+' units/hr'+
        ' · '+money(p?.turnoverPerHour||0)+'/hr observed turnover'+
        ' · '+Number(p?.pulseConfidencePct||0).toFixed(0)+'% confidence</div>'+
      '<div style="color:#8b9b91;">Liquidity '+Number(p?.pulseLiquidityScore||0).toFixed(0)+'/100'+
        ' · visible depth '+Number(p?.pulseMarketDepth||0).toLocaleString()+
        ' · trend '+Number(p?.pulseTrendPct||0).toFixed(1)+'%'+score+velocity+
        ' · '+esc(freshness)+
        ' · source '+(sourceAt?esc(age(new Date(sourceAt).toISOString())):'unknown')+
        ' · fetched '+(fetchedAt?esc(age(new Date(fetchedAt).toISOString())):'unknown')+
        (cacheDelaySec?' · upstream cache '+cacheDelaySec+'s':'')+'</div>'+
      '<div style="color:#777;">Movement = quantity disappearing between seller-independent Torn Item Market snapshots; it is <b>not a confirmed player sale</b>.</div>'+
    '</div>';
  }

  function completedSalesForItem(itemId){
    const entry=state?.procurement?.ranked?.history?.[String(itemId||'')]||{};
    const rows=Array.isArray(entry?.rows)?entry.rows:[];
    return rows.slice().sort((a,b)=>Number(b?.timestamp||0)-Number(a?.timestamp||0));
  }

  function verifiedSalesHtml(itemId){
    const id=String(itemId||'');
    const rows=completedSalesForItem(id);
    if(!id||!rows.length)return '';
    const catalog=state?.procurement?.catalog?.[id]||{};
    const name=String(catalog?.name||rows[0]?.itemName||('Item '+id));
    const entry=state?.procurement?.ranked?.history?.[id]||{};
    const visible=rows.slice(0,12);
    return '<div id="mm-acq-verified-sales" style="border:1px solid #35513f;background:#121713;border-radius:8px;padding:9px;margin:7px 0;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Verified Sales · '+esc(name)+'</b>'+
          '<div style="font-size:10px;color:#8b9b91;margin-top:2px;">Official Torn API finished Auction House records · '+rows.length.toLocaleString()+' loaded · updated '+esc(age(entry?.lastSyncAt||''))+'.</div>'+
        '</div>'+
        '<button data-sales-close="1" style="'+button(false)+'padding:5px 7px;">Hide</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#777;margin-top:5px;">These are completed auctions, not current asking prices. They are evidence for realized sale prices and are used only where the ranked valuation model permits.</div>'+
      '<div style="margin-top:6px;">'+visible.map(row=>{
        const ts=Math.max(0,Number(row?.timestamp||0))*1000;
        const when=ts?new Date(ts).toLocaleString():'Time unavailable';
        const rarity=String(row?.rarity||'').trim();
        const bonuses=Array.isArray(row?.bonuses)?row.bonuses:[];
        const bonusText=bonuses.map(b=>String(b?.title||b?.bonus||'')+(Number(b?.value||0)?' '+Number(b.value).toFixed(0)+'%':'')).filter(Boolean).join(' + ');
        return '<div style="display:grid;grid-template-columns:minmax(105px,.8fr) minmax(90px,.7fr) minmax(0,1.7fr);gap:8px;border-top:1px solid #26352b;padding:6px 0;font-size:10px;align-items:center;">'+
          '<span>'+esc(when)+'</span>'+
          '<span><b>'+money(row?.price||0)+'</b>'+(Number(row?.bids||0)>0?' · '+Number(row.bids)+' bids':'')+'</span>'+
          '<span style="color:#888;">'+(rarity?esc(rarity.toUpperCase()):'')+(bonusText?(rarity?' · ':'')+esc(bonusText):'')+(row?.id?' · sale #'+esc(row.id):'')+'</span>'+
        '</div>';
      }).join('')+'</div>'+
      (rows.length>visible.length?'<div style="font-size:10px;color:#777;margin-top:5px;">Showing newest '+visible.length+' of '+rows.length.toLocaleString()+' loaded completed sales.</div>':'')+
    '</div>';
  }

  function futureDuration(unixSeconds){
    const end=Math.max(0,Number(unixSeconds||0))*1000;
    if(!end)return '';
    const sec=Math.floor((end-Date.now())/1000);
    if(sec<=0)return 'ended';
    const d=Math.floor(sec/86400);
    const h=Math.floor((sec%86400)/3600);
    const m=Math.floor((sec%3600)/60);
    if(d>0)return d+'d '+h+'h';
    if(h>0)return h+'h '+m+'m';
    return Math.max(1,m)+'m';
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
        onerror:error=>{
          const detail=String(error?.statusText||error?.message||error?.error||'').trim();
          reject(new Error('Network request failed'+(detail?': '+detail:'')+'.'));
        }
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
        onerror:error=>{
          const detail=String(error?.statusText||error?.message||error?.error||'').trim();
          reject(new Error('Network request failed'+(detail?': '+detail:'')+'.'));
        }
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

  const pulseEngine=core&&pulse&&service?pulse.createEngine({
    core,
    refreshItemMarket:itemId=>service.refreshItemMarket(itemId),
    hasKey:()=>Boolean(apiKey()),
    readLease:()=>GM_getValue(PULSE_LEASE_KEY,null),
    writeLease:value=>GM_setValue(PULSE_LEASE_KEY,value),
    ownerId:INSTANCE_ID,
    onState:next=>{state=next;}
  }):null;

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
    if(!core||!pulse||!logic||!live||!rankedLogic||!ledger||!service||!pulseEngine){
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
        const warningSources=[...new Set((result?.verificationWarnings||[]).map(row=>String(row?.source||'')).filter(Boolean))];
        statusText=reason==='no-qualified-opportunity'
          ? 'Opportunity no longer meets ROI/profit rules.'
          : reason==='no-live-source-inside-ceiling'
            ? 'No current Bazaar seller or Item Market listing remains inside the buy ceiling.'
            : reason==='live-verification-unavailable'
              ? 'Live verification unavailable'+(warningSources.length?' for '+warningSources.join(' / '):'')+'. No purchase route was opened.'
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
    if(autoRefreshRunning||busy||watchRunning||document.visibilityState!=='visible'||!core)return;
    const root=document.getElementById(ROOT_ID);
    const panelOpen=Boolean(root&&root.style.display!=='none');
    autoRefreshRunning=true;
    try{
      state=await core.readLegacyState();
      if(panelOpen){
        try{await importTravelCapture({silent:true});}catch{}
        if(apiKey())try{await refreshTravelContext({force:false,silent:true});}catch{}
        const f=core.freshnessSnapshot(state||{});
        const now=Date.now();
        const purchaseAt=Date.parse(f.acquisitions||state?.procurement?.lastAcquisitionSyncAt||'')||0;
        const itemMarketAt=Date.parse(f.itemMarket||'')||0;
        if(apiKey()&&(force||!purchaseAt||now-purchaseAt>=PURCHASE_STALE_MS))await syncPurchases();
        if(force||!itemMarketAt||now-itemMarketAt>=OPPORTUNITY_STALE_MS)await refreshOpportunities();
        if(activeView==='ranked')await ensureRankedFresh();
      }
      if(apiKey()&&pulseEngine){
        const result=await pulseEngine.tick();
        if(result?.state)state=result.state;
      }
      if(panelOpen)render();
    }catch(error){
      console.warn('[MM_Acquisitions] automatic refresh failed',error);
      if(panelOpen){statusText='Auto-refresh warning: '+(error?.message||String(error));render();}
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

  async function refreshMarketPulse(){
    if(busy||autoRefreshRunning||!pulseEngine)return;
    if(!apiKey()){statusText='Save a Torn API key in Settings before refreshing Market Pulse.';activeView='settings';render();return;}
    busy=true;statusText='Refreshing one Market Pulse item from Torn API…';render();
    try{
      state=await core.readLegacyState();
      const itemId=pulse.trackedItemIds(state,1)[0]||'';
      if(!itemId){statusText='Market Pulse has no tracked acquisition item yet. Refresh Opportunities or Pricelist first.';return;}
      const result=await pulseEngine.tick({itemId});
      if(result?.state)state=result.state;
      statusText=result?.refreshed
        ?('Market Pulse refreshed item '+itemId+(result.reusedRecent?' from the just-verified 2.5s snapshot.':'.'))
        :('Market Pulse did not refresh: '+String(result?.skipped||result?.error||'not due')+'.');
    }catch(error){statusText='Market Pulse refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function exportMarketPulseDiagnostics(){
    if(!pulse||!state)return;
    const diagnostics=pulse.sanitizedDiagnostics(state,GM_getValue(PULSE_LEASE_KEY,null));
    const blob=new Blob([JSON.stringify(diagnostics,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='MM_Acquisitions-Market-Pulse-'+Date.now()+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    statusText='Sanitized Market Pulse diagnostics exported.';render();
  }

  function sourceStrip(){
    if(!state)return '';
    const f=core.freshnessSnapshot(state);
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulseItems=Object.values(pulseState.items||{});
    const proven=pulseItems.filter(row=>String(row?.tier||'')==='proven').length;
    const candidates=pulseItems.filter(row=>String(row?.tier||'')==='candidate').length;
    const budget=pulse?.budgetStatus?.(state)||{used:0,limit:0};
    const pulseAt=Number(pulseState.updatedAt||0);
    return '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-bottom:7px;">'+
      '<span>Bazaar '+esc(age(f.weav3rGeneratedAt))+' <span style="color:#777;">(Weav3r)</span></span>'+
      '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
      '<span>· Market Pulse '+(pulseAt?esc(age(new Date(pulseAt).toISOString())):'not synced')+' <span style="color:#777;">(Torn API · '+proven+' proven / '+candidates+' candidates · budget '+Number(budget.used||0)+'/'+Number(budget.limit||0)+')</span></span>'+
      '<span>· Travel '+esc(age(f.travel))+'</span>'+
      '<span>· Pricelist '+esc(age(state?.procurement?.pricelist?.lastSyncAt))+'</span>'+
      '<span>· Ranked '+esc(age(state?.procurement?.ranked?.lastLiveAt))+'</span>'+
      '<span>· Purchases '+esc(age(state?.procurement?.lastAcquisitionSyncAt))+' ('+Number(state?.procurement?.acquisitions?.length||0)+')</span>'+
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
    busy=true;statusText='Checking travel state and verifying '+preferredSource+' source for '+armoryRequest.itemName+'…';render();
    try{
      await refreshTravelContext({force:true,silent:true});
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
    const pricelistScan=logic.rankPricelistUniverse(state);
    const pricelistDeals=pricelistScan.filter(r=>r.hasMarketEvidence).slice(0,20);
    const pricelistProfitable=pricelistScan.filter(r=>r.profitable).length;
    const pricelistQualified=pricelistScan.filter(r=>r.qualifies).length;
    const research=rows.filter(r=>!r.purchaseReady).slice(0,8);
    const pulseMovers=pulse?.rankPulseItems?.(state)?.slice(0,12)||[];

    return armoryRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Profit Opportunities</b><div style="font-size:10px;color:#888;">ROI + sell-through + profit velocity. Purchase routing always re-verifies first.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-reload" style="'+button()+'">Reload Cache</button><button id="mm-acq-sync-purchases" '+(busy?'disabled':'')+' style="'+button()+'">Sync Purchases</button><button id="mm-acq-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Opportunities</button></div>'+
      '</div>'
    )+
    card('<b>Market Pulse Movers</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">Proven high-money movers are always listed before emerging/large-exposure candidates. Movement means observed seller-independent market outflow, not attributed player sales.</div>'+
      (pulseMovers.length?pulseMovers.map((r,i)=>
        '<div style="border-top:1px solid #303030;padding:7px 0;font-size:10px;">'+
          '<b>#'+(i+1)+' '+esc(r.itemName||('Item '+r.itemId))+'</b> · '+(r.tier==='proven'?'<b style="color:#9fe3a8;">HOT / PROVEN</b>':r.tier==='candidate'?'<b style="color:#ffd18a;">EMERGING CANDIDATE</b>':'OBSERVED')+
          '<div style="color:#888;">Floor '+money(r.floorPrice||0)+' · depth '+Number(r.marketDepth||0).toLocaleString()+' · events/hr '+Number(r.observedEventsPerHour||0).toFixed(2)+' · units/hr '+Number(r.observedUnitsPerHour||0).toFixed(2)+' · turnover/hr '+money(r.turnoverPerHour||0)+' · liquidity '+Number(r.liquidityScore||0).toFixed(0)+'/100 · confidence '+Number(r.confidencePct||0).toFixed(0)+'% · trend '+Number(r.trendPct||0).toFixed(1)+'% · '+esc(r.freshness?.label||'UNKNOWN')+'</div>'+
        '</div>'
      ).join(''):'<div style="font-size:10px;color:#888;">Collecting Market Pulse history. Candidates can appear from current market exposure before enough repeated movement exists for proven status.</div>')
    )+
    card('<b>Pricelist Universe Scan · '+pricelistScan.length.toLocaleString()+' evaluated</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">Every positively priced item on the configured TornW3B pricelist is screened from the global Bazaar observation feed before deeper Bazaar + Item Market verification. '+pricelistProfitable.toLocaleString()+' currently show positive gross spread; '+pricelistQualified.toLocaleString()+' meet active ROI/profit rules. Pricelist buy rate is a benchmark, not a resale exit.</div>'+
      (pricelistDeals.length?pricelistDeals.map((r,i)=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b> · '+esc(r.freshness?.label||'UNKNOWN')+' · <b>'+esc(r.buySource||'Bazaar observed')+'</b>'+
          '<div>Bazaar low <b>'+money(r.buyPrice)+'</b> · Bazaar avg '+money(r.bazaarAverage||0)+' · Your buy rate '+money(r.targetBuy)+' · Best exit '+money(r.bestExit)+' ('+esc(r.bestExitRoute||'')+') · ROI <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="color:#888;">Profit/unit '+(r.profit>=0?'+':'-')+money(Math.abs(r.profit||0))+' · liquidity '+Number(r.liquidity||0)+'/100 · confidence '+Number(r.confidence||0)+'% · bazaars '+Number(r.sellerCount||0)+'</div>'+pulseLine(r,r.id,r.profit)+'</div>'+
          '<button data-pricelist-verify="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button(r.qualifies)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Verify</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">Pricelist rows are loaded, but current market evidence is unavailable. Refresh Opportunities.</div>')
    )+
    card('<b>Rule-Qualified Deals</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">Meets current ROI / profit / listing / confidence rules. Current cash balance is not checked; Verify & Buy re-verifies the source and keeps final purchase manual.</div>'+
      (buyable.length?buyable.map((r,i)=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b> · '+esc(r.purchaseSource)+
          '<div>Buy <b>'+money(r.buyPrice)+'</b> · Max '+money(r.maxBuyPrice)+' · Exit '+money(r.bestExit)+' · ROI <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="color:#888;">3d sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% ('+esc(r.conversionSource)+') · Confidence '+Number(r.confidence||0).toFixed(0)+'% · Live listings '+Number(r.liveListingCount||0)+' · Qty '+Number(r.recommendedQty||1)+' · Est. 3d profit '+money(r.expectedProfit3d||0)+'</div>'+pulseLine(r,r.id,r.profit)+'</div>'+
          '<button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Verify & Buy</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No current cached opportunity meets the active business rules.</div>')
    )+
    card('<details><summary style="cursor:pointer;font-weight:700;">Research leads ('+research.length+')</summary>'+
      '<div style="font-size:10px;color:#888;margin:4px 0;">These require fresher seller or Item Market evidence before routing.</div>'+
      (research.length?research.map(r=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;font-size:10px;">'+
          '<div><b>'+esc(r.name)+'</b> · '+esc(r.discoverySource||'Research')+' · ROI '+Number(r.roiPct||0).toFixed(1)+'% · Sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% · score '+Number(r.score||0).toFixed(0)+pulseLine(r,r.id,r.profit)+'</div>'+
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
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;"><div><b>#'+(i+1)+' '+esc(r.itemName)+'</b> · '+esc(r.country)+
      '<div>Overseas stock '+Number(r.stock||0).toLocaleString()+' · Profit '+money(r.profit||0)+' · Source profit/hr '+money(r.sourceProfitPerHour||0)+' · Liquidity-adjusted '+money(r.liquidityAdjustedProfitPerHour||0)+'/hr</div>'+pulseLine(r,r.itemId,r.profit)+'</div>'+
      '<button data-travel-compare="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'white-space:nowrap;">Compare Bazaar / Market</button></div>'
    ).join(''):(stale
      ?'<div style="font-size:11px;color:#888;">No travel recommendations shown until data is refreshed.</div>'
      :'<div style="font-size:11px;color:#888;">No profitable current travel rows match this trip context.</div>'));
  }

  async function compareTravelItem(itemId,itemName){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    const item=catalogRows().find(row=>row.id===id)||(name?catalogRows().find(row=>row.name.toLowerCase()===name.toLowerCase()):null);
    if(!item){
      statusText='Could not resolve '+(name||('item '+id))+' in the Torn catalog.';
      render();
      return;
    }
    activeView='items';
    itemQuery=item.name;
    await findCatalogPriceByItem(item);
  }

  function rankedSettings(){
    const saved=state?.procurement?.ranked?.settings||{};
    const pricelist=state?.procurement?.pricelist||{};
    return {
      pricelistUserId:String(saved.pricelistUserId||pricelist.userId||DEFAULT_PRICELIST_USER_ID),
      historyDays:Math.max(7,Number(saved.historyDays||90)),
      bonusBand:Math.max(1,Number(saved.bonusBand||5)),
      minComparableSales:Math.max(1,Number(saved.minComparableSales||3)),
      minRoiPct:Math.max(0,Number(saved.minRoiPct||0)),
      minConfidencePct:Math.max(0,Math.min(100,Number(saved.minConfidencePct||0))),
      pagesPerType:Math.max(1,Math.min(5,Number(saved.pagesPerType||2))),
      auctionPages:Math.max(1,Math.min(6,Number(saved.auctionPages||4))),
      maxLiveAgeHours:Math.max(1,Math.min(168,Number(saved.maxLiveAgeHours||24))),
      lowTierBonuses:Array.isArray(saved.lowTierBonuses)?saved.lowTierBonuses:['Achilles','Conserve'],
      bbRate:Math.max(0,Number(pricelist.bunkerBuckRate||saved.bbRate||0))
    };
  }

  async function saveRankedSettings(root){
    const read=(selector,fallback='')=>String(root.querySelector(selector)?.value??fallback).trim();
    const settings={
      pricelistUserId:read('#mm-acq-rw-pricelist',DEFAULT_PRICELIST_USER_ID),
      historyDays:Math.max(7,Number(read('#mm-acq-rw-history','90'))||90),
      bonusBand:Math.max(1,Number(read('#mm-acq-rw-band','5'))||5),
      minComparableSales:Math.max(1,Math.round(Number(read('#mm-acq-rw-min-sales','3'))||3)),
      minRoiPct:Math.max(0,Number(read('#mm-acq-rw-min-roi','0'))||0),
      minConfidencePct:Math.max(0,Math.min(100,Number(read('#mm-acq-rw-min-confidence','0'))||0)),
      pagesPerType:Math.max(1,Math.min(5,Math.round(Number(read('#mm-acq-rw-market-pages','2'))||2))),
      auctionPages:Math.max(1,Math.min(6,Math.round(Number(read('#mm-acq-rw-auction-pages','4'))||4))),
      maxLiveAgeHours:Math.max(1,Math.min(168,Number(read('#mm-acq-rw-max-age','24'))||24)),
      lowTierBonuses:read('#mm-acq-rw-low-bonuses','Achilles,Conserve').split(',').map(x=>x.trim()).filter(Boolean)
    };
    if(!/^\d+$/.test(settings.pricelistUserId))throw new Error('Pricelist ID must be a Torn user ID.');
    await core.updateDomainState('market',draft=>{
      const proc=draft.procurement || (draft.procurement={});
      const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
      ranked.settings=settings;
      return draft;
    });
    state=await core.readLegacyState();
    statusText='Ranked profit settings saved.';
    render();
  }

  async function refreshPricelist(){
    if(busy)return;
    busy=true;
    statusText='Refreshing customer pricelist and Bunker Buck rate from TornW3B…';
    render();
    try{
      const result=await service.refreshPricelist(rankedSettings().pricelistUserId);
      state=result?.state||await core.readLegacyState();
      statusText='Pricelist updated: '+Number(result?.priced||0).toLocaleString()+' priced items · '+money(result?.bbRate||0)+'/BB.';
    }catch(error){statusText='Pricelist refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function refreshRankedLive(){
    if(busy)return;
    busy=true;
    const cfg=rankedSettings();
    statusText='Refreshing live ranked Bazaar / Item Market / Auction opportunities…';
    render();
    try{
      const result=await service.refreshRankedLive({pagesPerType:cfg.pagesPerType,auctionPages:cfg.auctionPages,limit:100});
      state=result?.state||await core.readLegacyState();
      const liveRows=Array.isArray(result?.market)?result.market:[];
      const bazaarCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='bazaar').length;
      const itemMarketCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='item market'||String(row?.source||'').toLowerCase()==='market').length;
      statusText='Ranked live feed updated: '+bazaarCount.toLocaleString()+' Bazaar + '+itemMarketCount.toLocaleString()+' Item Market + '+Number(result?.auction?.length||0).toLocaleString()+' Auction.';
    }catch(error){statusText='Ranked live refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function ensureRankedFresh(){
    if(busy){setTimeout(ensureRankedFresh,1200);return;}
    const now=Date.now();
    const pricelistAt=Date.parse(state?.procurement?.pricelist?.lastSyncAt||'')||0;
    const rankedAt=Date.parse(state?.procurement?.ranked?.lastLiveAt||'')||0;
    if(!pricelistAt||now-pricelistAt>=PRICELIST_STALE_MS)await refreshPricelist();
    if(!rankedAt||Date.now()-rankedAt>=RANKED_LIVE_STALE_MS)await refreshRankedLive();
  }

  async function analyzeRankedHistory(itemId){
    if(busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before loading completed Auction House history.';
      activeView='settings';render();return;
    }
    const id=String(itemId||'');
    const catalog=state?.procurement?.catalog?.[id]||{};
    busy=true;
    statusText='Loading official Torn completed-auction history for '+String(catalog.name||('Item '+id))+'…';
    render();
    try{
      const result=await service.refreshRankedHistory(id,{days:rankedSettings().historyDays,maxPages:8});
      state=result?.state||await core.readLegacyState();
      verifiedSalesItemId=id;
      statusText='Verified sales updated for '+String(catalog.name||('Item '+id))+': '+Number(result?.rows?.length||0).toLocaleString()+' completed Auction House sales.';
    }catch(error){statusText='Auction history failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function rankedEvaluatedRows(){
    const ranked=state?.procurement?.ranked||{};
    const catalog=state?.procurement?.catalog||{};
    const cfg=rankedSettings();
    const history=ranked.history||{};
    const market=Array.isArray(ranked.liveMarket)?ranked.liveMarket:[];
    const auction=Array.isArray(ranked.liveAuction)?ranked.liveAuction:[];
    const rows=[...market,...auction].map(row=>{
      const cat=catalog?.[String(row.itemId)]||{};
      const candidate={
        ...row,
        subType:String(row.subType||cat.subType||''),
        weaponType:String(row.weaponType||cat.weaponCategory||'')
      };
      const hist=Array.isArray(history?.[String(row.itemId)]?.rows)?history[String(row.itemId)].rows:[];
      return rankedLogic.evaluateListing(candidate,hist,{...cfg,bbRate:cfg.bbRate,pulseByItem:state?.marketIntel?.marketPulse?.items||{}});
    });
    const bonusQ=rankedBonus.trim().toLowerCase();
    const weaponQ=rankedWeapon.trim().toLowerCase();
    return rows.filter(row=>{
      const source=String(row.source||'').toLowerCase();
      if(source==='auction'){
        const endsAt=Number(row.endsAt||0);
        if(endsAt>0&&endsAt*1000<=Date.now())return false;
      }else{
        const observed=Date.parse(row.lastUpdated||'')||0;
        if(!observed||Date.now()-observed>cfg.maxLiveAgeHours*3600000)return false;
      }
      if(rankedType!=='all'&&String(row.weaponType||'').toLowerCase()!==rankedType)return false;
      if(rankedSource!=='all'){
        if(rankedSource==='auction'&&source!=='auction')return false;
        if(rankedSource==='bazaar'&&source!=='bazaar')return false;
        if(rankedSource==='item-market'&&source!=='item market'&&source!=='market')return false;
      }
      if(rankedRarity!=='all'&&String(row.rarity||'').toLowerCase()!==rankedRarity)return false;
      if(weaponQ&&!String(row.itemName||'').toLowerCase().includes(weaponQ))return false;
      if(bonusQ&&!row.bonuses.some(b=>String(b.title||'').toLowerCase().includes(bonusQ)))return false;
      if(Number(row.roiPct||0)<Math.max(rankedMinRoi,cfg.minRoiPct))return false;
      return true;
    }).sort((a,b)=>Number(b.sortScore||0)-Number(a.sortScore||0)||Number(b.history?.confidence||0)-Number(a.history?.confidence||0)||Number(b.liquidityScore||0)-Number(a.liquidityScore||0)||b.roiPct-a.roiPct||b.profit-a.profit);
  }

  async function analyzeVisibleRanked(){
    if(busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key before analyzing Auction House history.';
      activeView='settings';render();return;
    }
    const ids=[...new Set(rankedEvaluatedRows().slice(0,30).map(row=>String(row.itemId||'')).filter(Boolean))].slice(0,6);
    if(!ids.length){statusText='No visible ranked weapons to analyze.';render();return;}
    busy=true;
    render();
    try{
      const cfg=rankedSettings();
      for(let i=0;i<ids.length;i++){
        const name=state?.procurement?.catalog?.[ids[i]]?.name||('Item '+ids[i]);
        statusText='Auction history '+(i+1)+'/'+ids.length+': '+name+'…';
        render();
        const result=await service.refreshRankedHistory(ids[i],{days:cfg.historyDays,maxPages:8});
        state=result?.state||await core.readLegacyState();
      }
      statusText='Official Auction House history updated for '+ids.length+' visible weapon types.';
    }catch(error){statusText='Ranked history batch stopped: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function routeRankedListing(index){
    const rows=rankedEvaluatedRows();
    const row=rows[Number(index)];
    if(!row)return;
    const source=String(row.source||'').toLowerCase();
    if(source==='auction'){
      const url=new URL('https://weav3r.dev/ranked-weapons');
      url.searchParams.set('listing','auction');
      if(row.itemName)url.searchParams.set('weaponName',String(row.itemName));
      if(row.rarity)url.searchParams.set('rarity',String(row.rarity).toLowerCase());
      if(row.bonuses?.[0]?.title)url.searchParams.set('bonus1',String(row.bonuses[0].title));
      location.href=url.toString();
      return;
    }
    if(source.includes('bazaar')&&row.sellerId){
      navigate('https://www.torn.com/bazaar.php?userId='+encodeURIComponent(String(row.sellerId)));
      return;
    }
    const cat=state?.procurement?.catalog?.[String(row.itemId)]||{};
    navigate(live.itemMarketPurchaseUrl(row.itemId,row.itemName,cat.type||'Weapon'));
  }

  function rankedHtml(){
    const ranked=state?.procurement?.ranked||{};
    const cfg=rankedSettings();
    const all=rankedEvaluatedRows();
    const pages=Math.max(1,Math.ceil(all.length/RANKED_PAGE_SIZE));
    rankedPage=Math.max(0,Math.min(rankedPage,pages-1));
    const visible=all.slice(rankedPage*RANKED_PAGE_SIZE,(rankedPage+1)*RANKED_PAGE_SIZE);
    const historyCount=Object.keys(ranked.history||{}).length;
    const priceList=state?.procurement?.pricelist||{};
    const liveMarketRows=Array.isArray(ranked.liveMarket)?ranked.liveMarket:[];
    const bazaarCount=liveMarketRows.filter(row=>String(row?.source||'').toLowerCase()==='bazaar').length;
    const itemMarketCount=liveMarketRows.filter(row=>['item market','market'].includes(String(row?.source||'').toLowerCase())).length;
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Ranked Weapon Profit Scout</b><div style="font-size:10px;color:#888;">No bonuses excluded. Fair value combines BB floor and official Torn completed-auction sales. Live Bazaar / Item Market rows use investment score; live auctions use watch score because a current bid is not a completed sale.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-rw-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Update Pricelist</button>'+
          '<button id="mm-acq-rw-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Ranked</button>'+
          '<button id="mm-acq-rw-analyze-visible" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Analyze Visible</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:5px;">BB '+money(cfg.bbRate)+'/buck · Pricelist '+Number(priceList.pricedCount||0).toLocaleString()+' priced · Live <b>'+bazaarCount.toLocaleString()+' Bazaar</b> + <b>'+itemMarketCount.toLocaleString()+' Item Market</b> + <b>'+Number(ranked.liveAuction?.length||0).toLocaleString()+' Auction</b> · AH history '+historyCount+' weapon types · updated '+esc(age(ranked.lastLiveAt))+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:5px;margin-top:8px;">'+
        '<select id="mm-acq-rw-type" style="'+inputCss()+'width:100%;"><option value="all">All types</option><option value="primary"'+(rankedType==='primary'?' selected':'')+'>Primary</option><option value="secondary"'+(rankedType==='secondary'?' selected':'')+'>Secondary</option><option value="melee"'+(rankedType==='melee'?' selected':'')+'>Melee</option></select>'+
        '<select id="mm-acq-rw-source" style="'+inputCss()+'width:100%;"><option value="all">All sources</option><option value="bazaar"'+(rankedSource==='bazaar'?' selected':'')+'>Bazaar</option><option value="item-market"'+(rankedSource==='item-market'?' selected':'')+'>Item Market</option><option value="auction"'+(rankedSource==='auction'?' selected':'')+'>Auction</option></select>'+
        '<select id="mm-acq-rw-rarity" style="'+inputCss()+'width:100%;"><option value="all">All rarity</option><option value="yellow"'+(rankedRarity==='yellow'?' selected':'')+'>Yellow</option><option value="orange"'+(rankedRarity==='orange'?' selected':'')+'>Orange</option><option value="red"'+(rankedRarity==='red'?' selected':'')+'>Red</option></select>'+
        '<input id="mm-acq-rw-weapon" value="'+esc(rankedWeapon)+'" placeholder="Weapon name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-bonus" value="'+esc(rankedBonus)+'" placeholder="Bonus name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-roi" type="number" min="0" step="1" value="'+Number(rankedMinRoi||0)+'" placeholder="Min ROI %" style="'+inputCss()+'width:100%;">'+
      '</div>'+
      '<button id="mm-acq-rw-filter" style="'+button()+'margin-top:6px;">Apply Filters</button>'
    )+
    (verifiedSalesItemId?verifiedSalesHtml(verifiedSalesItemId):'')+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#888;align-items:center;">'+
        '<span>'+all.length.toLocaleString()+' matches · page '+(rankedPage+1)+'/'+pages+'</span>'+
        '<span><button id="mm-acq-rw-prev" '+(rankedPage<=0?'disabled':'')+' style="'+button()+(rankedPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Prev</button> '+
        '<button id="mm-acq-rw-next" '+(rankedPage>=pages-1?'disabled':'')+' style="'+button()+(rankedPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></span>'+
      '</div>'+
      (visible.length?visible.map((row,localIndex)=>{
        const globalIndex=rankedPage*RANKED_PAGE_SIZE+localIndex;
        const bonus=row.bonuses.map(b=>b.title+' '+Number(b.value||0).toFixed(0)+'%').join(' + ')||'No bonus data';
        const historyLoaded=Number(row.history?.samples||0)>0;
        const profitable=row.profit>0;
        const isAuction=String(row.source||'').toLowerCase()==='auction';
        const targetRoi=Math.max(Number(rankedMinRoi||0),Number(cfg.minRoiPct||0));
        const bidCeiling=row.fairValue>0?Math.floor(Number(row.fairValue)/(1+targetRoi/100)):0;
        const bidHeadroom=bidCeiling>0?bidCeiling-Number(row.price||0):0;
        const underBb=Number(row.bbFloor||0)>0&&Number(row.price||0)<Number(row.bbFloor||0);
        const priceLine=isAuction
          ?'<div>Current bid <b>'+money(row.price)+'</b> · Fair <b>'+money(row.fairValue)+'</b> · '+(targetRoi>0?'Max bid @ '+targetRoi.toFixed(1)+'% ROI ':'Break-even ceiling ')+'<b>'+money(bidCeiling)+'</b> · Headroom <b style="color:'+(bidHeadroom>0?'#9fe3a8':'#ffaaaa')+';">'+(bidHeadroom>=0?'+':'-')+money(Math.abs(bidHeadroom))+'</b></div>'
          :'<div>Ask <b>'+money(row.price)+'</b> · Fair <b>'+money(row.fairValue)+'</b> · Profit <b style="color:'+(profitable?'#9fe3a8':'#ffaaaa')+';">'+(row.profit>=0?'+':'-')+money(Math.abs(row.profit))+'</b> · ROI <b>'+Number(row.roiPct||0).toFixed(1)+'%</b></div>';
        const auctionLine=isAuction
          ?'<div style="color:#d8b96a;">Provisional ROI at current bid '+Number(row.roiPct||0).toFixed(1)+'% · '+Number(row.bids||0)+' bids · ends in '+esc(futureDuration(row.endsAt))+(underBb?' · UNDER BB FLOOR':'')+'</div>'
          :'';
        return '<div style="border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'+
            '<div style="min-width:0;"><b>'+esc(row.itemName)+'</b> · '+esc(row.weaponType)+' · '+esc(row.rarity.toUpperCase())+' · '+esc(row.source)+
              '<div>'+esc(bonus)+'</div>'+
              priceLine+auctionLine+
              '<div style="color:#888;">'+esc(row.valuationSource)+' · BB '+Number(row.bbUnits||0)+' ('+money(row.bbFloor)+') · AH median '+money(row.auctionValue)+' · '+esc(row.history?.cohort||'BASE')+' n='+Number(row.history?.samples||0)+' · confidence '+Number(row.history?.confidence||0)+'%</div>'+
              '<div style="color:#888;">Traffic 7/30/90d '+Number(row.volume7||0)+'/'+Number(row.volume30||0)+'/'+Number(row.volume90||0)+' · liquidity '+Number(row.liquidityScore||0)+'/100 (AH '+Number(row.auctionHistoryLiquidityScore||0)+'/100) · '+(isAuction?'watch '+Number(row.auctionWatchScore||0)+'/100 · urgency '+Number(row.auctionUrgencyScore||0)+'/100 · bid discount '+Number(row.auctionDiscountScore||0)+'/100':'investment '+Number(row.investmentScore||0)+'/100')+'</div>'+pulseLine(row,row.itemId,row.profit)+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
              '<button data-rw-history="'+esc(row.itemId)+'" '+(busy?'disabled':'')+' style="'+button(!historyLoaded)+(busy?'opacity:.5;':'')+'padding:5px 7px;">'+(historyLoaded?'Refresh Sales':'Load Sales')+'</button>'+
              (historyLoaded?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(row.itemId)+'" style="'+button(false)+'text-decoration:none;display:inline-block;padding:5px 7px;">Verified Sales ('+Number(row.history?.samples||0)+') ↓</a>':'')+
              '<button data-rw-open="'+globalIndex+'" style="'+button(true)+'padding:5px 7px;">Open</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No ranked listings match these filters. Refresh Ranked or loosen the filters.</div>')
    );
  }

  function catalogRows(){
    const catalog=state?.procurement?.catalog||{};
    const pricelist=state?.procurement?.pricelist?.items||{};
    const marketplace=state?.marketIntel?.marketplace||{};
    const snapshots=state?.procurement?.marketSnapshots||{};
    return Object.entries(catalog).map(([id,row])=>({
      pricelistBuyPrice:Math.max(0,Number(pricelist?.[String(id)]?.buyPrice||0)),
      pricelistBulkBuyPrice:Math.max(0,Number(pricelist?.[String(id)]?.bulkBuyPrice||0)),
      pricelistBulkThreshold:Math.max(0,Number(pricelist?.[String(id)]?.bulkThreshold||0)),
      bazaarPrice:Math.max(0,Number(marketplace?.[String(id)]?.lowestPrice||0)),
      bazaarAverage:Math.max(0,Number(marketplace?.[String(id)]?.bazaarAverage||0)),
      bazaarSellers:Math.max(0,Number(marketplace?.[String(id)]?.totalBazaars||0)),
      itemMarketPrice:Math.max(0,Number(snapshots?.[String(id)]?.itemMarket?.lowest||0)),
      id:String(row?.id||id),
      name:String(row?.name||('Item '+id)),
      type:String(row?.type||'Other')||'Other',
      subType:String(row?.subType||row?.sub_type||''),
      marketPrice:Math.max(0,Number(row?.marketPrice||row?.market_value||0)),
      buyPrice:Math.max(0,Number(row?.buyPrice||row?.buy_price||0)),
      sellPrice:Math.max(0,Number(row?.sellPrice||row?.sell_price||0)),
      circulation:Math.max(0,Number(row?.circulation||0)),
      shops:Array.isArray(row?.shops)?row.shops:[],
      buyable:Boolean(row?.buyable||Number(row?.marketPrice||0)>0||Number(row?.buyPrice||0)>0||(Array.isArray(row?.shops)&&row.shops.some(shop=>Number(shop?.price||0)>0)))
    })).filter(row=>/^\d+$/.test(row.id)&&row.name);
  }

  function filteredCatalogRows(){
    const q=String(itemQuery||'').trim().toLowerCase();
    let rows=catalogRows().filter(row=>{
      if(itemCategory!=='All'&&row.type!==itemCategory)return false;
      if(itemAvailability==='buyable'&&!row.buyable)return false;
      if(itemAvailability==='market'&&!(row.marketPrice>0))return false;
      if(itemAvailability==='shops'&&!row.shops.some(shop=>Number(shop?.price||0)>0))return false;
      if(itemAvailability==='bazaar'&&!(row.bazaarPrice>0||row.bazaarSellers>0))return false;
      if(itemAvailability==='itemmarket'&&!(row.itemMarketPrice>0))return false;
      if(itemAvailability==='pricelist'&&!(row.pricelistBuyPrice>0))return false;
      if(q&&!row.name.toLowerCase().includes(q)&&row.id!==q&&!row.type.toLowerCase().includes(q)&&!row.subType.toLowerCase().includes(q))return false;
      return true;
    });
    rows.sort((a,b)=>{
      if(itemSort==='category')return a.type.localeCompare(b.type)||a.name.localeCompare(b.name);
      if(itemSort==='market-asc')return (a.marketPrice||Number.MAX_SAFE_INTEGER)-(b.marketPrice||Number.MAX_SAFE_INTEGER)||a.name.localeCompare(b.name);
      if(itemSort==='market-desc')return b.marketPrice-a.marketPrice||a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  function resolveCatalogQuery(value){
    const q=String(value||'').trim();
    if(!q)return {item:null,matches:[]};
    const rows=catalogRows();
    if(/^\d+$/.test(q)){
      const exact=rows.find(row=>row.id===q);
      if(exact)return {item:exact,matches:[exact]};
    }
    const lower=q.toLowerCase();
    const exactName=rows.find(row=>row.name.toLowerCase()===lower);
    if(exactName)return {item:exactName,matches:[exactName]};
    const matches=rows.filter(row=>row.name.toLowerCase().includes(lower)||row.id.includes(q));
    return {item:matches.length===1?matches[0]:null,matches};
  }

  async function refreshItemCatalog({silent=false}={}){
    if(busy)return false;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before loading the Torn item catalog.';
      activeView='settings';render();return false;
    }
    busy=true;
    if(!silent)statusText='Loading the complete Torn item catalog…';
    render();
    try{
      const result=await service.refreshItemCatalog();
      state=result?.state||await core.readLegacyState();
      const count=Number(state?.procurement?.catalogItemCount||result?.rows?.length||0);
      const buyable=Number(state?.procurement?.catalogBuyableCount||0);
      statusText='Torn item catalog updated: '+count.toLocaleString()+' items · '+buyable.toLocaleString()+' buyable.';
      return true;
    }catch(error){
      statusText='Item catalog refresh failed: '+(error?.message||String(error));
      return false;
    }finally{busy=false;render();}
  }

  function ensureItemCatalog(){
    const count=Object.keys(state?.procurement?.catalog||{}).length;
    const at=Date.parse(state?.procurement?.catalogLastSyncAt||'')||0;
    if(!apiKey()||(!count&&busy))return;
    if(!count||!at||Date.now()-at>=CATALOG_STALE_MS){
      if(busy){setTimeout(ensureItemCatalog,1200);return;}
      setTimeout(()=>refreshItemCatalog({silent:count>0}),40);
    }
  }

  async function findCatalogPriceByItem(item){
    if(!item||busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before checking live prices.';
      activeView='settings';render();return;
    }
    itemSelection=item;
    itemSources=null;
    busy=true;
    statusText='Finding current Bazaar, Item Market, shop and overseas prices for '+item.name+'…';
    render();
    try{
      itemSources=await service.procurementSourceOptions(item.id,item.name);
      state=itemSources?.state||await core.readLegacyState();
      statusText=itemSources?.sources?.length
        ?'Price comparison ready for '+item.name+'. Lowest available source is listed first.'
        :'No current purchase source was found for '+item.name+'.';
    }catch(error){statusText='Price lookup failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function findCatalogPriceFromInput(root){
    itemQuery=String(root.querySelector('#mm-acq-item-query')?.value||itemQuery).trim();
    const resolved=resolveCatalogQuery(itemQuery);
    if(resolved.item){findCatalogPriceByItem(resolved.item);return;}
    if(resolved.matches.length>1){
      itemPage=0;
      statusText=resolved.matches.length+' catalog matches for “'+itemQuery+'”. Select the exact item below.';
      render();return;
    }
    statusText='No Torn catalog item matches “'+itemQuery+'”.';
    render();
  }

  async function routeCatalogItem(preferredSource='Best'){
    if(!itemSelection||busy)return;
    busy=true;
    statusText='Verifying '+preferredSource+' for '+itemSelection.name+'…';
    render();
    try{
      await refreshTravelContext({force:true,silent:true});
      const result=await service.routeProcurementRequest({itemId:itemSelection.id,itemName:itemSelection.name,preferredSource});
      itemSources=result;
      if(result?.routed){
        statusText='Verified '+result.source+' for '+itemSelection.name+'. Complete the purchase manually on Torn.';
        return;
      }
      if(result?.reason==='overseas-recommended'){
        activeView='travel';
        const priceText=result.priceKnown&&Number(result.price||0)>0?money(result.price)+' each':'shop cost unavailable in current feed';
        const profitText=Number(result.profit||0)?' · projected profit '+money(result.profit):'';
        statusText='Best selected source is overseas: '+String(result.country||'destination')+' · '+priceText+' · stock '+Number(result.stock||0).toLocaleString()+profitText+'. Travel and purchase remain manual.';
      }else if(result?.reason==='shop-recommended'){
        statusText='Best selected source is '+String(result.shopName||'a Torn shop')+' at '+money(result.price||0)+' each'+(result.country?' · '+String(result.country):'')+'. Purchase remains manual.';
      }else if(result?.reason==='preferred-source-unavailable'){
        statusText=preferredSource+' is not currently available for '+itemSelection.name+'.';
      }else{
        statusText='Could not route '+itemSelection.name+': '+String(result?.reason||'no live source')+'.';
      }
    }catch(error){statusText='Price routing failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function itemPriceResultHtml(){
    if(!itemSelection)return '';
    const sources=Array.isArray(itemSources?.sources)?itemSources.sources:[];
    const targetBuy=Math.max(0,Number(itemSelection?.pricelistBuyPrice||0));
    const exit=Math.max(0,Number(itemSources?.exitValue||0));
    const exitRoute=String(itemSources?.exitRoute||'Unknown');
    const priced=sources.filter(source=>source?.priceKnown!==false&&Number(source?.price||0)>0);
    const best=priced[0]||null;
    const bestPrice=Math.max(0,Number(best?.price||0));
    const bestProfit=exit>0&&bestPrice>0?exit-bestPrice:0;
    const bestRoi=bestPrice>0&&exit>0?bestProfit/bestPrice*100:0;
    const historyRows=Array.isArray(state?.procurement?.ranked?.history?.[String(itemSelection.id)]?.rows)
      ?state.procurement.ranked.history[String(itemSelection.id)].rows:[];
    const rankedEligible=/(weapon|armor|armour)/i.test(String(itemSelection.type||'')+' '+String(itemSelection.subType||''));
    const verifiedSalesAction=historyRows.length
      ?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(itemSelection.id)+'" style="'+button(false)+'text-decoration:none;display:inline-block;">Verified Sales ('+historyRows.length+') ↓</a>'
      :rankedEligible
        ?'<button data-rw-history="'+esc(itemSelection.id)+'" '+(busy?'disabled':'')+' style="'+button(false)+(busy?'opacity:.5;':'')+'">Load Verified Sales</button>'
        :'';
    const verifiedNote=historyRows.length
      ?'Completed Auction House records loaded from the official Torn API. Use Verified Sales to inspect the realized sale evidence directly in Acquisitions.'
      :rankedEligible
        ?'Completed Auction House sales can be loaded from the official Torn API for this ranked item.'
        :'No official completed-sale history is available here for this standard item. Market Pulse movement is observational, not a confirmed sale.';

    const rows=sources.length?sources.map((source,index)=>{
      const sourcePrice=Math.max(0,Number(source.price||0));
      const priceKnown=source.priceKnown!==false&&sourcePrice>0;
      const profit=exit>0&&priceKnown?exit-sourcePrice:0;
      const roi=exit>0&&priceKnown?profit/sourcePrice*100:0;
      const bestBadge=index===0&&priceKnown?'<span style="color:#d8b96a;font-size:10px;">BEST AVAILABLE</span>':'';
      const facts=[
        source.shopName?String(source.shopName):'',
        source.country?String(source.country):'',
        source.sellerName?String(source.sellerName):'',
        Number(source.quantity||0)>0?'Available '+Number(source.quantity).toLocaleString():'',
        source.aggregateOnly&&Number(source.bazaarCount||0)>0?Number(source.bazaarCount).toLocaleString()+' bazaars':'',
        source.aggregateOnly&&Number(source.bazaarAverage||0)>0?'Bazaar avg '+money(source.bazaarAverage):'',
        source.travelEvidence?'Travel profit '+(Number(source.profit||0)>=0?'+':'-')+money(Math.abs(Number(source.profit||0))):'',
        source.travelEvidence&&Number(source.sourceProfitPerHour||0)?money(source.sourceProfitPerHour)+'/hr travel profit':''
      ].filter(Boolean);
      const note=source.aggregateOnly
        ?'Aggregate Bazaar evidence; a seller is re-verified before routing.'
        :source.travelEvidence&&!priceKnown
          ?'Travel evidence only; current feed does not expose the shop cost.'
          :'';
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
        '<div style="min-width:0;">'+
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>'+esc(source.source)+'</b>'+bestBadge+'</div>'+
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;">'+
            '<span>Buy <b>'+(priceKnown?money(sourcePrice):'Cost unavailable')+'</b></span>'+
            (exit>0&&priceKnown?'<span>Est. resale <b>'+money(exit)+'</b></span><span>Profit <b style="color:'+(profit>=0?'#9fe3a8':'#ffaaaa')+';">'+(profit>=0?'+':'-')+money(Math.abs(profit))+'</b></span><span>ROI <b>'+roi.toFixed(1)+'%</b></span>':'')+
          '</div>'+
          (facts.length?'<div style="color:#888;margin-top:3px;">'+esc(facts.join(' · '))+'</div>':'')+
          (note?'<div style="color:#777;margin-top:2px;">'+esc(note)+'</div>':'')+
        '</div>'+
        '<button data-item-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">Use</button>'+
      '</div>';
    }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No current source comparison loaded.</div>';

    const decision=sources.length&&best
      ?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px;margin:8px 0;">'+
        '<div style="border:1px solid #3e3520;border-radius:6px;padding:7px;background:#1a1710;"><div style="font-size:9px;color:#9c9275;">BEST BUY</div><b>'+esc(best.source)+' · '+money(bestPrice)+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:7px;background:#141414;"><div style="font-size:9px;color:#888;">EST. RESALE</div><b>'+money(exit)+'</b><div style="font-size:9px;color:#777;">via '+esc(exitRoute)+'</div></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:7px;background:#141414;"><div style="font-size:9px;color:#888;">EST. PROFIT</div><b style="color:'+(bestProfit>=0?'#9fe3a8':'#ffaaaa')+';">'+(bestProfit>=0?'+':'-')+money(Math.abs(bestProfit))+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:7px;background:#141414;"><div style="font-size:9px;color:#888;">ROI</div><b>'+bestRoi.toFixed(1)+'%</b></div>'+
        (targetBuy>0?'<div style="border:1px solid #333;border-radius:6px;padding:7px;background:#141414;"><div style="font-size:9px;color:#888;">PRICELIST BUY RATE</div><b>'+money(targetBuy)+'</b></div>':'')+
      '</div>'
      :'';

    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>'+esc(itemSelection.name)+' ['+esc(itemSelection.id)+']</b>'+
          '<div style="font-size:10px;color:#888;">'+esc(itemSelection.type)+(itemSelection.subType?' · '+esc(itemSelection.subType):'')+' · Torn catalog reference '+money(itemSelection.marketPrice||0)+' <span style="color:#777;">(reference only; not used as live resale value)</span></div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+verifiedSalesAction+
          '<button data-item-route="Best" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Use Best Source</button>'+
        '</div>'+
      '</div>'+
      decision+
      '<div style="font-size:10px;color:#777;margin-bottom:3px;">'+esc(verifiedNote)+'</div>'+
      pulseLine({},itemSelection.id,bestProfit)+
      (verifiedSalesItemId===String(itemSelection.id)?verifiedSalesHtml(itemSelection.id):'')+
      '<div style="margin-top:7px;font-size:10px;color:#aaa;"><b>Available sources</b> · lowest usable source is listed first.</div>'+
      rows
    );
  }

  function itemsHtml(){
    const all=catalogRows();
    const categories=[...new Set(all.map(row=>row.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const rows=filteredCatalogRows();
    const pages=Math.max(1,Math.ceil(rows.length/ITEM_PAGE_SIZE));
    itemPage=Math.max(0,Math.min(itemPage,pages-1));
    const start=itemPage*ITEM_PAGE_SIZE;
    const visible=rows.slice(start,start+ITEM_PAGE_SIZE);
    const lastSync=state?.procurement?.catalogLastSyncAt;
    const options=categories.map(cat=>'<option value="'+esc(cat)+'"'+(itemCategory===cat?' selected':'')+'>'+esc(cat)+'</option>').join('');
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>All Torn Items</b><div style="font-size:10px;color:#888;">Complete Torn catalog, categorized and searchable. Price checks are live/on-demand.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Pricelist</button><button id="mm-acq-catalog-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Catalog</button></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:4px;">Catalog '+all.length.toLocaleString()+' items · updated '+esc(age(lastSync))+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;margin-top:8px;">'+
        '<input id="mm-acq-item-query" type="search" placeholder="Enter item name or ID" value="'+esc(itemQuery)+'" style="'+inputCss()+'width:100%;">'+
        '<select id="mm-acq-item-category" style="'+inputCss()+'width:100%;"><option value="All">All categories</option>'+options+'</select>'+
        '<select id="mm-acq-item-availability" style="'+inputCss()+'width:100%;">'+
          '<option value="buyable"'+(itemAvailability==='buyable'?' selected':'')+'>Buyable</option>'+
          '<option value="market"'+(itemAvailability==='market'?' selected':'')+'>Market-valued</option>'+
          '<option value="shops"'+(itemAvailability==='shops'?' selected':'')+'>Torn shop source</option>'+
          '<option value="bazaar"'+(itemAvailability==='bazaar'?' selected':'')+'>Bazaar observed</option>'+
          '<option value="itemmarket"'+(itemAvailability==='itemmarket'?' selected':'')+'>Item Market checked</option>'+
          '<option value="pricelist"'+(itemAvailability==='pricelist'?' selected':'')+'>Customer pricelist</option>'+
          '<option value="all"'+(itemAvailability==='all'?' selected':'')+'>All catalog</option>'+
        '</select>'+
        '<select id="mm-acq-item-sort" style="'+inputCss()+'width:100%;">'+
          '<option value="name"'+(itemSort==='name'?' selected':'')+'>Name A-Z</option>'+
          '<option value="category"'+(itemSort==='category'?' selected':'')+'>Category</option>'+
          '<option value="market-asc"'+(itemSort==='market-asc'?' selected':'')+'>Market low-high</option>'+
          '<option value="market-desc"'+(itemSort==='market-desc'?' selected':'')+'>Market high-low</option>'+
        '</select>'+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">'+
        '<button id="mm-acq-item-filter" style="'+button()+'">Apply Filters</button>'+
        '<button id="mm-acq-item-find" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Find Best Price</button>'+
      '</div>'
    )+
    itemPriceResultHtml()+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:10px;color:#888;">'+
        '<span>'+rows.length.toLocaleString()+' matches · page '+(itemPage+1)+'/'+pages+'</span>'+
        '<span><button id="mm-acq-item-prev" '+(itemPage<=0?'disabled':'')+' style="'+button()+(itemPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Prev</button> '+
        '<button id="mm-acq-item-next" '+(itemPage>=pages-1?'disabled':'')+' style="'+button()+(itemPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></span>'+
      '</div>'+
      (visible.length?visible.map(row=>
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>'+esc(row.name)+'</b> <span style="color:#777;">['+esc(row.id)+']</span>'+
            '<div style="color:#888;margin-top:2px;">'+esc(row.type)+(row.subType?' · '+esc(row.subType):'')+'</div>'+
            '<div style="display:flex;gap:9px;flex-wrap:wrap;color:#aaa;margin-top:3px;">'+
              '<span>Bazaar low <b>'+money(row.bazaarPrice||0)+'</b></span>'+
              (row.itemMarketPrice>0?'<span>Item Market <b>'+money(row.itemMarketPrice)+'</b></span>':'')+
              (row.pricelistBuyPrice>0?'<span>Pricelist <b>'+money(row.pricelistBuyPrice)+'</b></span>':'')+
              '<span>Bazaars <b>'+Number(row.bazaarSellers||0)+'</b></span>'+
              '<span>Shops <b>'+row.shops.filter(shop=>Number(shop?.price||0)>0).length+'</b></span>'+
            '</div>'+
          '</div>'+
          '<button data-catalog-find="'+esc(row.id)+'" '+(busy?'disabled':'')+' style="'+button(itemSelection?.id===row.id)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Find Price</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No items match the current filters.</div>')
    );
  }

  function settingsHtml(){
    const r=state?.businessRules||{};
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulseRows=Object.values(pulseState.items||{});
    const pulseBudget=pulse?.budgetStatus?.(state)||{used:0,limit:0};
    const pulseProven=pulseRows.filter(row=>String(row?.tier||'')==='proven').length;
    const pulseCandidates=pulseRows.filter(row=>String(row?.tier||'')==='candidate').length;
    return card(
      '<b>MM Acquisitions Connection</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">The API key is stored only in this userscript\'s Tampermonkey GM storage. It is not copied to shared IndexedDB/localStorage. Required scope: Torn Items catalog, User Basic, User Log purchase events used by the ledger, and market data needed for live verification.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto;gap:5px;align-items:center;">'+
        '<input id="mm-acq-api" type="password" autocomplete="off" placeholder="'+(apiKey()?'Torn API key saved — enter to replace':'Torn API key')+'" style="'+inputCss()+'">'+
        '<button id="mm-acq-save-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-acq-clear-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">While Acquisitions is open and visible, stale purchase logs and opportunity data refresh automatically with guarded intervals. Weav3r generation is checked once per minute. Verify & Buy and final purchase remain manual.</div>'
    )+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Market Pulse</b><div style="font-size:10px;color:#888;margin-top:4px;">Seller-free Torn API movement intelligence. One cross-tab engine lease, bounded cache/history, cache-delay-aware cadence and local request-budget governor. No seller-target, mug or attack model is retained.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-pulse-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Pulse</button><button id="mm-acq-pulse-export" style="'+button()+'">Export Diagnostics</button></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">Source: Torn API v2 Item Market · cached items '+pulseRows.length+' · proven '+pulseProven+' · candidates '+pulseCandidates+' · request budget '+Number(pulseBudget.used||0)+'/'+Number(pulseBudget.limit||0)+' in the last minute · updated '+(Number(pulseState.updatedAt||0)?esc(age(new Date(Number(pulseState.updatedAt)).toISOString())):'not synced')+'.</div>'
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
    )+
    card(
      '<b>Ranked Profit Rules</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">BB floor uses Torn exchange values and the Bunker Bucks price from the configured TornW3B pricelist. Completed auction history comes from Torn API. Live ranked market/auction listings use the existing TornW3B dependency.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;">'+
        '<label style="font-size:10px;color:#aaa;">Pricelist Torn ID<input id="mm-acq-rw-pricelist" value="'+esc(rankedSettings().pricelistUserId)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">AH history days<input id="mm-acq-rw-history" type="number" min="7" max="365" value="'+Number(rankedSettings().historyDays)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Bonus roll band %<input id="mm-acq-rw-band" type="number" min="1" max="25" value="'+Number(rankedSettings().bonusBand)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min comparable sales<input id="mm-acq-rw-min-sales" type="number" min="1" max="20" value="'+Number(rankedSettings().minComparableSales)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Ranked min ROI %<input id="mm-acq-rw-min-roi" type="number" min="0" value="'+Number(rankedSettings().minRoiPct)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Ranked min confidence %<input id="mm-acq-rw-min-confidence" type="number" min="0" max="100" value="'+Number(rankedSettings().minConfidencePct)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Market pages/type<input id="mm-acq-rw-market-pages" type="number" min="1" max="5" value="'+Number(rankedSettings().pagesPerType)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Auction pages<input id="mm-acq-rw-auction-pages" type="number" min="1" max="6" value="'+Number(rankedSettings().auctionPages)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max live age hours<input id="mm-acq-rw-max-age" type="number" min="1" max="168" value="'+Number(rankedSettings().maxLiveAgeHours)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;grid-column:1/-1;">Low-tier bonus labels<input id="mm-acq-rw-low-bonuses" value="'+esc(rankedSettings().lowTierBonuses.join(','))+'" style="'+inputCss()+'width:100%;"></label>'+
      '</div>'+
      '<button id="mm-acq-save-ranked" style="'+button(true)+'margin-top:7px;">Save Ranked Rules</button>'
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
        '<div><b style="font-size:15px;">MM_Acquisitions</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.22 · PROFIT / RANKED / TRAVEL / PULSE</div></div>'+
        '<button id="mm-acq-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">'+
          '<button data-acq-view="deals" style="'+button(activeView==='deals')+'">Deals</button>'+
          '<button data-acq-view="items" style="'+button(activeView==='items')+'">Items</button>'+
          '<button data-acq-view="ranked" style="'+button(activeView==='ranked')+'">Ranked</button>'+
          '<button data-acq-view="travel" style="'+button(activeView==='travel')+'">Travel</button>'+
          '<button data-acq-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div style="padding:5px 7px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<b style="color:#ffaaaa;">Cannot read shared CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>'):'')+
        '<div style="max-height:calc(100vh - 240px);overflow:auto;padding-right:2px;">'+
          (activeView==='settings'?settingsHtml():activeView==='travel'?travelHtml():activeView==='ranked'?rankedHtml():activeView==='items'?itemsHtml():dealsHtml())+
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
      if(activeView==='items'||activeView==='ranked')ensureItemCatalog();
      if(activeView==='ranked')setTimeout(ensureRankedFresh,80);
    }));
    root.querySelectorAll('#mm-acq-reload').forEach(b=>b.addEventListener('click',reloadCachedState));
    root.querySelector('#mm-acq-live-refresh')?.addEventListener('click',refreshOpportunities);
    root.querySelector('#mm-acq-sync-purchases')?.addEventListener('click',syncPurchases);
    root.querySelector('#mm-acq-pulse-refresh')?.addEventListener('click',refreshMarketPulse);
    root.querySelector('#mm-acq-pulse-export')?.addEventListener('click',exportMarketPulseDiagnostics);
    root.querySelector('#mm-acq-travel-update')?.addEventListener('click',updateTravelData);
    root.querySelector('#mm-acq-travel-import')?.addEventListener('click',()=>importTravelCapture({silent:false}).catch(error=>{
      statusText='Travel import failed: '+(error?.message||String(error));
      render();
    }));
    root.querySelectorAll('[data-acquire-item]').forEach(b=>b.addEventListener('click',()=>acquire(b.dataset.acquireItem)));
    root.querySelectorAll('[data-pricelist-verify]').forEach(b=>b.addEventListener('click',()=>{
      const item=catalogRows().find(row=>row.id===String(b.dataset.pricelistVerify||''));
      if(!item)return;
      itemQuery=item.name;
      activeView='items';
      findCatalogPriceByItem(item);
    }));
    root.querySelector('#mm-acq-armory-refresh')?.addEventListener('click',refreshArmorySources);
    root.querySelector('#mm-acq-armory-travel-agency')?.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';});
    root.querySelector('#mm-acq-armory-clear')?.addEventListener('click',()=>{armoryRequest=null;armorySources=null;statusText='Faction Armory acquisition request cleared.';render();});
    root.querySelectorAll('[data-armory-route]').forEach(b=>b.addEventListener('click',()=>routeArmoryRequest(b.dataset.armoryRoute||'Best')));
    root.querySelector('#mm-acq-catalog-refresh')?.addEventListener('click',()=>refreshItemCatalog({silent:false}));
    root.querySelector('#mm-acq-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-live-refresh')?.addEventListener('click',refreshRankedLive);
    root.querySelectorAll('[data-travel-compare]').forEach(b=>b.addEventListener('click',()=>compareTravelItem(b.dataset.travelCompare,b.dataset.travelName)));
    root.querySelector('#mm-acq-rw-analyze-visible')?.addEventListener('click',analyzeVisibleRanked);
    root.querySelector('#mm-acq-rw-filter')?.addEventListener('click',()=>{
      rankedType=String(root.querySelector('#mm-acq-rw-type')?.value||'all');
      rankedSource=String(root.querySelector('#mm-acq-rw-source')?.value||'all');
      rankedRarity=String(root.querySelector('#mm-acq-rw-rarity')?.value||'all');
      rankedWeapon=String(root.querySelector('#mm-acq-rw-weapon')?.value||'').trim();
      rankedBonus=String(root.querySelector('#mm-acq-rw-bonus')?.value||'').trim();
      rankedMinRoi=Math.max(0,Number(root.querySelector('#mm-acq-rw-roi')?.value||0));
      rankedPage=0;render();
    });
    root.querySelector('#mm-acq-rw-prev')?.addEventListener('click',()=>{rankedPage=Math.max(0,rankedPage-1);render();});
    root.querySelector('#mm-acq-rw-next')?.addEventListener('click',()=>{rankedPage++;render();});
    root.querySelectorAll('[data-rw-history]').forEach(b=>b.addEventListener('click',()=>analyzeRankedHistory(b.dataset.rwHistory)));
    root.querySelectorAll('[data-sales-view]').forEach(a=>a.addEventListener('click',event=>{
      event.preventDefault();
      verifiedSalesItemId=String(a.dataset.salesView||'');
      render();
      setTimeout(()=>document.getElementById('mm-acq-verified-sales')?.scrollIntoView({block:'nearest',behavior:'smooth'}),0);
    }));
    root.querySelectorAll('[data-sales-close]').forEach(b=>b.addEventListener('click',()=>{
      verifiedSalesItemId='';
      render();
    }));
    root.querySelectorAll('[data-rw-open]').forEach(b=>b.addEventListener('click',()=>routeRankedListing(b.dataset.rwOpen)));
    root.querySelector('#mm-acq-item-filter')?.addEventListener('click',()=>{
      itemQuery=String(root.querySelector('#mm-acq-item-query')?.value||'').trim();
      itemCategory=String(root.querySelector('#mm-acq-item-category')?.value||'All');
      itemAvailability=String(root.querySelector('#mm-acq-item-availability')?.value||'buyable');
      itemSort=String(root.querySelector('#mm-acq-item-sort')?.value||'name');
      itemPage=0;render();
    });
    root.querySelector('#mm-acq-item-find')?.addEventListener('click',()=>findCatalogPriceFromInput(root));
    root.querySelector('#mm-acq-item-query')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();findCatalogPriceFromInput(root);}
    });
    root.querySelector('#mm-acq-item-prev')?.addEventListener('click',()=>{itemPage=Math.max(0,itemPage-1);render();});
    root.querySelector('#mm-acq-item-next')?.addEventListener('click',()=>{itemPage++;render();});
    root.querySelectorAll('[data-catalog-find]').forEach(b=>b.addEventListener('click',()=>{
      const item=catalogRows().find(row=>row.id===String(b.dataset.catalogFind||''));
      if(item){itemQuery=item.name;findCatalogPriceByItem(item);}
    }));
    root.querySelectorAll('[data-item-route]').forEach(b=>b.addEventListener('click',()=>routeCatalogItem(b.dataset.itemRoute||'Best')));
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
    root.querySelector('#mm-acq-save-ranked')?.addEventListener('click',()=>saveRankedSettings(root).catch(error=>{
      statusText='Could not save ranked rules: '+(error?.message||String(error));
      render();
    }));
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
  function initializeAcquisitions(){createLauncher();installChannel();startAutoRefresh();}
  window.addEventListener('pagehide',()=>{stopAutoRefresh();pulseEngine?.release?.();},{once:true});
  if(document.body)initializeAcquisitions();
  else window.addEventListener('DOMContentLoaded',initializeAcquisitions,{once:true});
})();
