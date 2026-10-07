// ==UserScript==
// @name         MM_Acquisitions
// @namespace    manic-mike.torn.acquisitions
// @version      8.0.0-alpha.34
// @description  Pricelist procurement and ranked-weapon investment assistant with direct Bazaar, Item Market, auction and travel routing; final actions remain manual.
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@b6d2202ad507c6b138919e2d37e461cfc422b382/modular-suite/core/MM_Torn_Core.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@de425d72834f14f7a59b8bbbbe186a1f933e62a3/modular-suite/acquisitions/MM_Acquisitions.market-pulse.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@81cda9d1dce86eb6244f6fa7d88235b153d4634f/modular-suite/acquisitions/MM_Acquisitions.logic.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@3b033e03b26faf17466fed7122adcb9c34077a0b/modular-suite/acquisitions/MM_Acquisitions.live.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@7439f1289a0ac281515e2954b6c2a349d2aa6815/modular-suite/acquisitions/MM_Acquisitions.ranked.logic.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6c2ababdb06ee105191e74126c457ac3b7fea53f/modular-suite/acquisitions/MM_Acquisitions.torn-intel.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@410dc43062b1f72e85b5ce5b53a2166473c5732a/modular-suite/acquisitions/MM_Acquisitions.purchase.logic.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// @connect      torn-intel.com
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID='mm-acquisitions';
  const LAUNCHER_ID='mm-acquisitions-launcher';
  const API_KEY='mm_acquisitions_api_v1';
  const TORN_INTEL_KEY='mm_acquisitions_torn_intel_client_key_v1';
  const TORN_INTEL_LAST_KEYED_AT='mm_acquisitions_torn_intel_last_keyed_at_v1';
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
  const PRICELIST_PAGE_SIZE=40;
  const RANKED_LIVE_STALE_MS=300_000;
  const PRICELIST_STALE_MS=3600_000;
  const DEFAULT_PRICELIST_USER_ID='4054377';
  const PANEL_OPEN_KEY='mm_acquisitions_panel_open_v1';

  let activeView='pricelist';
  let state=null;
  let loadError='';
  let statusText='Ready.';
  let busy=false;
  let watchRunning=false;
  let watchTimer=null;
  let autoRefreshRunning=false;
  let autoRefreshTimer=null;
  let channel=null;
  let procurementRequest=null;
  let procurementSources=null;
  let travelContext=null;
  let travelContextCheckedAt=0;
  let itemQuery='';
  let itemCategory='All';
  let itemAvailability='buyable';
  let itemSort='name';
  let itemPage=0;
  let itemSelection=null;
  let itemSources=null;
  let pricelistQuery='';
  let pricelistStatus='all';
  let pricelistSort='savings';
  let pricelistPage=0;
  let verifiedSalesItemId='';
  let rankedType='all';
  let rankedSource='all';
  let rankedRarity='all';
  let rankedBonus='';
  let rankedWeapon='';
  let rankedMinRoi=0;
  let rankedPage=0;
  let renderedView='';
  const detailOpenState=new Map();
  const viewScrollTop=new Map();

  const core=globalThis.MMTornCore;
  const pulse=globalThis.MMTornMarketPulse;
  const logic=globalThis.MMTornAcquisitionsLogic;
  const live=globalThis.MMTornAcquisitionsLive;
  const rankedLogic=globalThis.MMTornRankedProfitLogic;
  const ledger=globalThis.MMTornAcquisitionLedger;
  const restockIntel=globalThis.MMTornRestockIntel;

  async function readSharedState(){
    if(core?.ensureSharedState)return core.ensureSharedState();
    return core.readLegacyState();
  }

  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=value=>'$'+Math.max(0,Number(value)||0).toLocaleString('en-US',{maximumFractionDigits:0});
  const apiKey=()=>String(GM_getValue(API_KEY,'')||'').trim();
  const tornIntelKey=()=>String(GM_getValue(TORN_INTEL_KEY,'')||'').trim();

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
    if(tier==='unknown')return '<div style="font-size:10px;color:#777;margin-top:5px;"><b>Market activity:</b> still collecting enough data to judge demand.</div>';
    const freshness=typeof p?.pulseFreshness==='string'?String(p.pulseFreshness):String(p?.pulseFreshness?.label||'UNKNOWN');
    const sourceAt=Number(p?.pulseSourceTimestamp||0);
    const fetchedAt=Number(p?.pulseFetchedAt||0);
    const cacheDelaySec=Math.round(Math.max(0,Number(p?.pulseUpstreamCacheDelayMs||0))/1000);
    const tierLabel=tier==='proven'?'Strong':tier==='candidate'?'Building':'Limited';
    const tierColor=tier==='proven'?'#9fe3a8':tier==='candidate'?'#d8b96a':'#9ab7c9';
    return '<div style="margin-top:6px;padding:7px;border:1px solid #2f4638;border-radius:6px;background:#121713;font-size:10px;line-height:1.45;">'+
      '<div style="color:'+tierColor+';"><b>Market activity: '+esc(tierLabel)+'</b></div>'+
      '<div style="color:#b6c6bb;margin-top:2px;">About '+Number(p?.observedUnitsPerHour||0).toFixed(2)+' units/hour have disappeared from current Item Market listings. This suggests demand, but it is <b>not a confirmed individual sale</b>.</div>'+
      '<details style="margin-top:4px;"><summary style="cursor:pointer;color:#888;">Advanced market details</summary>'+
        '<div style="color:#888;margin-top:4px;">Movement checks '+Number(p?.observedEventsPerHour||0).toFixed(2)+'/hr · observed value '+money(p?.turnoverPerHour||0)+'/hr · resale ease '+Number(p?.pulseLiquidityScore||0).toFixed(0)+'/100 · visible stock '+Number(p?.pulseMarketDepth||0).toLocaleString()+' · confidence '+Number(p?.pulseConfidencePct||0).toFixed(0)+'% · price trend '+Number(p?.pulseTrendPct||0).toFixed(1)+'% · '+esc(freshness)+' · source '+(sourceAt?esc(age(new Date(sourceAt).toISOString())):'unknown')+' · fetched '+(fetchedAt?esc(age(new Date(fetchedAt).toISOString())):'unknown')+(cacheDelaySec?' · source cache '+cacheDelaySec+'s':'')+'</div>'+
      '</details>'+
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

  function responseHeaders(raw){
    const out={};
    String(raw||'').split(/\r?\n/).forEach(line=>{
      const index=line.indexOf(':');
      if(index>0)out[line.slice(0,index).trim().toLowerCase()]=line.slice(index+1).trim();
    });
    return out;
  }

  function gmJsonResponse(url,{headers={}}={}){
    return new Promise((resolve,reject)=>{
      const started=Date.now();
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'application/json',...headers},
        onload:r=>{
          let data;
          try{data=JSON.parse(String(r.responseText||''));}
          catch{return reject(new Error('Invalid JSON response (HTTP '+Number(r.status||0)+').'));}
          if(r.status<200||r.status>=300){
            const msg=data?.resolution||data?.message||data?.error?.message||data?.error||('HTTP '+r.status);
            const error=new Error(String(msg));
            error.status=Number(r.status||0);
            error.code=String(data?.code||'');
            return reject(error);
          }
          if(data?.error){
            const msg=data.error?.error||data.error?.message||data?.message||data.error||'API error';
            return reject(new Error(String(msg)));
          }
          resolve({
            data,
            status:Number(r.status||0),
            headers:responseHeaders(r.responseHeaders),
            fetchedAt:Date.now(),
            elapsedMs:Date.now()-started
          });
        },
        ontimeout:()=>reject(new Error('Request timed out.')),
        onerror:error=>{
          const detail=String(error?.statusText||error?.message||error?.error||'').trim();
          reject(new Error('Network request failed'+(detail?': '+detail:'')+'.'));
        }
      });
    });
  }

  async function gmJson(url,options={}){
    const response=await gmJsonResponse(url,options);
    return response.data;
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
    GM_setValue(PANEL_OPEN_KEY,true);
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

  function durationMs(value){
    const ms=Math.max(0,Number(value)||0);
    const total=Math.round(ms/1000);
    const d=Math.floor(total/86400);
    const h=Math.floor((total%86400)/3600);
    const m=Math.floor((total%3600)/60);
    if(d>0)return d+'d '+h+'h';
    if(h>0)return h+'h '+m+'m';
    return Math.max(1,m)+'m';
  }

  function restockRecord(country,itemId){
    if(!restockIntel)return null;
    const key=restockIntel.restockKey(country,itemId);
    return key?(state?.travelIntel?.restockEta?.[key]||null):null;
  }

  function restockEtaSummary(row){
    if(!restockIntel)return 'Restock model unavailable.';
    const record=restockRecord(row?.countryCode||row?.country,row?.itemId);
    if(!record)return 'No restock history loaded.';
    const stock=Math.max(0,Number(row?.stock||0));
    const confidence=String(record?.confidence||'INSUFFICIENT');
    const cycles=Math.max(0,Number(record?.usableCycles||0));
    if(stock>0)return 'In stock · '+cycles+' usable cycles · '+confidence+' confidence · history '+age(record?.sourceNewestAt||'');
    const etaAt=Date.parse(String(record?.etaAt||''))||0;
    const early=Date.parse(String(record?.etaEarlyAt||''))||0;
    const late=Date.parse(String(record?.etaLateAt||''))||0;
    if(etaAt){
      const remaining=etaAt-Date.now();
      const center=remaining>=0?('about '+durationMs(remaining)):('median passed '+durationMs(-remaining)+' ago');
      const window=early&&late?' · window '+new Date(early).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'–'+new Date(late).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
      return 'Restock '+center+window+' · '+confidence+' · '+cycles+' cycles';
    }
    return cycles<restockIntel.MIN_ETA_CYCLES
      ?'Out of stock · '+cycles+' usable cycles; need '+restockIntel.MIN_ETA_CYCLES+' for ETA.'
      :'Out of stock · sellout start is outside or ambiguous in the 48h history window.';
  }

  async function refreshTornIntelTravel({silent=false}={}){
    if(!restockIntel)throw new Error('Torn Intel module did not load.');
    const before=state||await readSharedState();
    const response=await gmJsonResponse(restockIntel.TRAVEL_TABLE_URL);
    const normalized=restockIntel.normalizeTravelTable(response.data,response.fetchedAt);
    if(!normalized.length)throw new Error('Torn Intel Travel Table returned no readable stock rows.');
    const enriched=restockIntel.enrichTravelRows(normalized,before,Date.now());
    state=await service.importTravelRows(enriched,response.fetchedAt);
    if(!silent)statusText='Torn Intel travel stock updated: '+enriched.length+' item/country rows.';
    return {rows:enriched,response,state};
  }

  async function refreshRestockEta(country,itemId,itemName=''){
    if(!restockIntel)throw new Error('Torn Intel module did not load.');
    const key=tornIntelKey();
    if(!key)throw new Error('Save the free Torn Intel client key in Setup / Advanced before loading restock history.');
    const code=restockIntel.countryCode(country);
    const id=String(itemId||'').trim();
    if(!code||!/^\d+$/.test(id))throw new Error('Restock history needs a supported country and Torn item ID.');

    const previousCall=Math.max(0,Number(GM_getValue(TORN_INTEL_LAST_KEYED_AT,0))||0);
    const wait=restockIntel.KEYED_COOLDOWN_MS-(Date.now()-previousCall);
    if(previousCall&&wait>0)throw new Error('Torn Intel history rate-limit guard: retry in '+durationMs(wait)+'.');

    const url=new URL(restockIntel.HISTORY_URL);
    url.searchParams.set('itemId',id);
    url.searchParams.set('country',code);
    url.searchParams.set('hours','48');
    GM_setValue(TORN_INTEL_LAST_KEYED_AT,Date.now());

    const response=await gmJsonResponse(url.toString(),{headers:{'X-Torn-Intel-Key':key}});
    const model=restockIntel.deriveRestockModel(response.data,Date.now());
    const record=restockIntel.modelRecord({
      country:code,itemId:id,itemName,model,fetchedAt:response.fetchedAt
    });
    if(!record)throw new Error('Torn Intel history could not be converted into a restock model.');

    await core.updateDomainState('market',draft=>{
      const travel=draft.travelIntel || (draft.travelIntel={});
      const records=travel.restockEta&&typeof travel.restockEta==='object'?travel.restockEta:{};
      records[record.key]=record;
      travel.restockEta=restockIntel.pruneRestockRecords(records,Date.now());
      travel.restockEtaUpdatedAt=new Date(response.fetchedAt).toISOString();
      travel.restockEtaSource='Torn Intel observed history';
      travel.diagnostics=Array.isArray(travel.diagnostics)?travel.diagnostics:[];
      travel.diagnostics.unshift({
        at:new Date().toISOString(),
        text:'Restock ETA refreshed for '+record.country+' / '+record.itemName+' using '+record.pointCount+' history points and '+record.usableCycles+' usable cycles.'
      });
      travel.diagnostics=travel.diagnostics.slice(0,30);
      return draft;
    });
    state=await readSharedState();
    return record;
  }

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
    statusText='Refreshing Torn Intel Travel Stock…';
    render();
    try{
      const result=await refreshTornIntelTravel({silent:true});
      statusText='Travel updated from Torn Intel: '+Number(result?.rows?.length||0)+' current item/country rows.';
    }catch(tornIntelError){
      statusText='Torn Intel refresh unavailable; trying TornW3B fallback…';
      render();
      try{
        const html=await gmText('https://weav3r.dev/travel-stock');
        const rows=live.parseTravelStockHtml(html);
        const feed=writeTravelFeed(rows,Date.now());
        state=await service.importTravelRows(feed.rows,feed.capturedAt);
        statusText='Travel updated from TornW3B fallback: '+rows.length+' current routes.';
      }catch(fallbackError){
        busy=false;
        statusText='Direct travel refresh unavailable; opening TornW3B fallback page for capture…';
        render();
        beginTravelCapture();
        return;
      }
    }
    busy=false;
    render();
  }

  async function reloadCachedState(){
    loadError='';
    if(!core||!pulse||!logic||!live||!rankedLogic||!ledger||!restockIntel||!service||!pulseEngine){
      loadError='MM Acquisitions dependencies did not load.';
      state=null;
      render();
      return;
    }
    try{
      const next=await readSharedState();
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
    state=await readSharedState();
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
        state=await readSharedState();
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
      const current=await readSharedState();const proc=ledger.ensureProcurement(current?.procurement||{});
      const fromMs=ledger.syncWindowStart(proc,Date.now(),180,24);const fetched={};
      for(const [logId,source] of Object.entries(ledger.ACQUISITION_LOG_IDS))fetched[logId]={source,rows:await fetchPurchaseLogs(Number(logId),fromMs/1000,50)};
      let added=0;
      await core.updateDomainState('market',draft=>{
        draft.procurement=ledger.ensureProcurement(draft.procurement||{});
        for(const pack of Object.values(fetched))added+=ledger.mergeAcquisitionLogRows(draft.procurement,pack.rows,pack.source);
        draft.procurement.lastAcquisitionSyncAt=new Date().toISOString();return draft;
      });
      state=await readSharedState();statusText='Purchase ledger synced: '+added+' new lot'+(added===1?'':'s')+'.';
    }catch(error){statusText='Purchase sync failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function autoRefreshAcquisitions({force=false}={}){
    if(autoRefreshRunning||busy||watchRunning||document.visibilityState!=='visible'||!core)return;
    const root=document.getElementById(ROOT_ID);
    const panelOpen=Boolean(root&&root.style.display!=='none');
    autoRefreshRunning=true;
    try{
      state=await readSharedState();
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
      state=await readSharedState();
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
    const hasMarket=Boolean(f.weav3rGeneratedAt||f.itemMarket);
    const label=!apiKey()?'SETUP NEEDED':hasMarket?'READY':'LOADING';
    const color=label==='READY'?'#9fe3a8':label==='LOADING'?'#ffd18a':'#ffb3b3';
    return '<details style="margin-bottom:7px;border:1px solid #303030;border-radius:6px;padding:5px 7px;background:#131313;">'+
      '<summary style="cursor:pointer;font-size:10px;color:#aaa;"><b style="color:'+color+';">Data status: '+label+'</b> · click for details</summary>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#888;margin-top:5px;">'+
        '<span>Bazaar '+esc(age(f.weav3rGeneratedAt))+'</span>'+
        '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
        '<span>· Market activity '+(pulseAt?esc(age(new Date(pulseAt).toISOString())):'not synced')+' ('+proven+' strong / '+candidates+' building · API budget '+Number(budget.used||0)+'/'+Number(budget.limit||0)+')</span>'+
        '<span>· Travel '+esc(age(f.travel))+'</span>'+
        '<span>· Pricelist '+esc(age(state?.procurement?.pricelist?.lastSyncAt))+'</span>'+
        '<span>· Ranked weapons '+esc(age(state?.procurement?.ranked?.lastLiveAt))+'</span>'+
        '<span>· Purchases '+esc(age(state?.procurement?.lastAcquisitionSyncAt))+'</span>'+
        '<span>· Torn key '+(apiKey()?'saved':'not saved')+'</span>'+
      '</div>'+
    '</details>';
  }

  function procurementRequestHtml(){
    if(!procurementRequest)return '';
    const inventoryRestock=procurementRequest?.requestKind==='inventory-restock';
    const requestLabel=inventoryRestock?'Inventory restock request':'Procurement request';
    const requestReason=String(procurementRequest.reason||(inventoryRestock?'Inventory replenishment':'Customer procurement request'));
    const sources=Array.isArray(procurementSources?.sources)?procurementSources.sources:[];
    const rows=sources.length?sources.map(source=>
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:6px 0;font-size:11px;">'+
        '<div><b>'+esc(source.source)+'</b> · '+money(source.price)+(source.country?' · '+esc(source.country):'')+
        (source.quantity?' · qty/stock '+Number(source.quantity).toLocaleString():'')+'</div>'+
        '<button data-procurement-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(source.source===procurementRequest.preferredSource)+(busy?'opacity:.5;':'')+'">Use '+esc(source.source)+'</button>'+
      '</div>'
    ).join(''):'<div style="font-size:11px;color:#888;margin-top:5px;">No live source comparison loaded yet.</div>';
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>'+esc(requestLabel)+': '+esc(procurementRequest.itemName)+'</b>'+
          '<div style="font-size:10px;color:#888;">Need '+Number(procurementRequest.qty||1).toLocaleString()+' · '+esc(requestReason)+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-procurement-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Compare Sources</button>'+
          '<button data-procurement-route="Best" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Find Best Source</button>'+
          (procurementSources?.reason==='overseas-recommended'?'<button id="mm-acq-procurement-travel-agency" style="'+button(true)+'">Open Travel Agency</button>':'')+
          '<button id="mm-acq-procurement-clear" style="'+button()+'">Clear</button>'+
        '</div>'+
      '</div>'+rows
    );
  }

  async function refreshProcurementSources(){
    if(!procurementRequest||busy)return;
    busy=true;statusText='Comparing Bazaar, Item Market and overseas sources for '+procurementRequest.itemName+'…';render();
    try{
      procurementSources=await service.procurementSourceOptions(procurementRequest.itemId,procurementRequest.itemName);
      state=procurementSources?.state||await readSharedState();
      statusText=procurementSources?.sources?.length
        ?'Source comparison ready for '+procurementRequest.itemName+'. Final purchase remains manual.'
        :'No live source is currently cached/available for '+procurementRequest.itemName+'.';
    }catch(error){statusText='Source comparison failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function routeProcurementRequest(preferredSource='Best'){
    if(!procurementRequest||busy)return;
    busy=true;statusText='Checking travel state and verifying '+preferredSource+' source for '+procurementRequest.itemName+'…';render();
    try{
      await refreshTravelContext({force:true,silent:true});
      const result=await service.routeProcurementRequest({...procurementRequest,preferredSource});
      procurementSources=result;
      if(result?.routed){
        statusText='Verified '+result.source+' source for '+procurementRequest.itemName+'. Complete the purchase manually on Torn.';
        return;
      }
      if(result?.reason==='overseas-recommended'){
        activeView='travel';
        const qty=Math.max(1,Number(procurementRequest?.qty||1));
        statusText='Overseas is the selected source: '+String(result.country||'destination')+' · '+money(result.price||0)+' each · '+money(Number(result.price||0)*qty)+' for '+qty.toLocaleString()+' · stock '+Number(result.stock||0).toLocaleString()+'. Use Open Travel Agency when ready; travel/purchase remains manual.';
      }else if(result?.reason==='preferred-source-unavailable'){
        statusText=preferredSource+' is not currently available for '+procurementRequest.itemName+'. Compare Sources for alternatives.';
      }else if(result?.reason==='item-id-unresolved'){
        statusText='Could not resolve a Torn item ID for '+procurementRequest.itemName+'.';
      }else{
        statusText='Could not route '+procurementRequest.itemName+': '+String(result?.reason||'no live source')+'.';
      }
    }catch(error){statusText='Procurement routing failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined'||channel)return;
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.addEventListener('message',event=>{
        const type=String(event?.data?.type||'');
        if(type!=='state-updated')return;
        const root=document.getElementById(ROOT_ID);
        if(!root||root.style.display==='none')return;
        readSharedState().then(next=>{state=next;render();}).catch(()=>{});
      });
    }catch(error){console.warn('[MM_Acquisitions] channel unavailable',error);}
  }

  function moreHtml(){
    const keyReady=Boolean(apiKey());
    return procurementRequestHtml()+
      card(
        '<div><b style="font-size:15px;">More tools</b><div style="font-size:11px;color:#aaa;margin-top:3px;">These support the two main workflows. Normal use should start in <b>Pricelist</b> or <b>Ranked Weapons</b>.</div></div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;margin-top:9px;">'+
          '<button data-more-view="items" style="'+button()+'padding:10px;"><b>Find One Item</b><br><span style="font-size:9px;font-weight:400;">Compare one specific item</span></button>'+
          '<button data-more-view="deals" style="'+button()+'padding:10px;"><b>Best Deals</b><br><span style="font-size:9px;font-weight:400;">General market suggestions</span></button>'+
          '<button data-more-view="travel" style="'+button()+'padding:10px;"><b>Travel Deals</b><br><span style="font-size:9px;font-weight:400;">Overseas opportunities</span></button>'+
          '<button data-more-view="settings" style="'+button(!keyReady)+'padding:10px;"><b>Setup / Advanced</b><br><span style="font-size:9px;font-weight:400;">API key and optional rules</span></button>'+
        '</div>'
      )+
      card(
        '<details><summary style="cursor:pointer;"><b>What do the main terms mean?</b></summary>'+
          '<div style="font-size:11px;color:#aaa;margin-top:7px;line-height:1.55;">'+
            '<b>Pricelist buy rate:</b> the most the customer normally wants to pay for that item.<br>'+
            '<b>BB value:</b> the ranked weapon\'s Bunker Buck floor using the configured pricelist BB rate.<br>'+
            '<b>AH value:</b> value estimated from completed Auction House sales.<br>'+
            '<b>ROI:</b> estimated profit as a percent of the purchase price.<br>'+
            '<b>Traffic 7/30/90:</b> how many comparable completed ranked-weapon sales were observed in those periods.<br>'+
            '<b>Market activity:</b> supporting demand evidence from listing movement; it is not a confirmed individual sale.'+
          '</div>'+
        '</details>'
      );
  }

  function dealsHtml(){
    if(!state)return card('<b>No cached market state available.</b>');
    const rows=logic.rankCachedOpportunities(state);
    const buyable=rows.filter(r=>r.purchaseReady).slice(0,12);
    const pricelistScan=logic.rankPricelistUniverse(state);
    const pricelistDeals=pricelistScan.filter(r=>r.hasMarketEvidence).slice(0,20);
    const research=rows.filter(r=>!r.purchaseReady).slice(0,8);
    const pulseMovers=pulse?.rankPulseItems?.(state)?.slice(0,12)||[];

    return procurementRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Best Deals</b><div style="font-size:10px;color:#888;">Start with the first few rows. Click Check & Open to re-check the price and open the best current source.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Deals</button><button id="mm-acq-sync-purchases" '+(busy?'disabled':'')+' style="'+button()+'">Sync Purchases</button></div>'+
      '</div>'
    )+
    card(
      '<b>Recommended Deals</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">These currently meet your deal rules. Acquisitions still re-checks the live source before opening it.</div>'+
      (buyable.length?buyable.map((r,i)=>
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid #303030;padding:9px 0;font-size:11px;align-items:center;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b><div style="color:#aaa;margin-top:3px;">Buy about <b>'+money(r.buyPrice)+'</b> · likely resale <b>'+money(r.bestExit)+'</b> · est. profit <b style="color:'+(Number(r.profit||0)>=0?'#9fe3a8':'#ffaaaa')+';">'+(Number(r.profit||0)>=0?'+':'-')+money(Math.abs(Number(r.profit||0)))+'</b> · return on cost <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="font-size:10px;color:#888;margin-top:2px;">Current source: '+esc(String(r.purchaseSource||'Unknown').replace('Bazaar aggregate','Bazaar'))+'</div>'+
          '<details style="margin-top:4px;"><summary style="cursor:pointer;font-size:10px;color:#777;">Why this deal?</summary><div style="font-size:10px;color:#888;margin-top:4px;">Live listings '+Number(r.liveListingCount||0)+' · suggested qty '+Number(r.recommendedQty||1)+' · confidence '+Number(r.confidence||0).toFixed(0)+'% · estimated 3-day profit '+money(r.expectedProfit3d||0)+'</div>'+pulseLine(r,r.id,r.profit)+'</details></div>'+
          '<button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Check & Open</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No deal currently meets your rules. Click Refresh Deals or use Find Item.</div>')
    )+
    card(
      '<details><summary style="cursor:pointer;font-weight:700;">More deal sources and advanced signals</summary>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Pricelist opportunities</b> · '+pricelistDeals.length+'</summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Items on your configured buy pricelist that also have current market evidence.</div>'+
          (pricelistDeals.length?pricelistDeals.map((r,i)=>
            '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:7px 0;font-size:10px;">'+
              '<div><b>'+esc(r.name)+'</b> · buy '+money(r.buyPrice)+' · likely resale '+money(r.bestExit)+' · est. profit '+(r.profit>=0?'+':'-')+money(Math.abs(r.profit||0))+' · return '+Number(r.roiPct||0).toFixed(1)+'%</div>'+
              '<button data-pricelist-verify="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'padding:5px 7px;">Check Price</button>'+
            '</div>'
          ).join(''):'<div style="font-size:10px;color:#888;">No current pricelist opportunities.</div>')+
        '</details>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Market activity</b></summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Advanced demand evidence. You do not need this section for normal buying.</div>'+
          (pulseMovers.length?pulseMovers.map((r,i)=>
            '<div style="border-top:1px solid #303030;padding:6px 0;font-size:10px;"><b>#'+(i+1)+' '+esc(r.itemName||('Item '+r.itemId))+'</b> · '+(r.tier==='proven'?'strong':r.tier==='candidate'?'building':'limited')+' activity · '+Number(r.observedUnitsPerHour||0).toFixed(2)+' units/hr · '+Number(r.confidencePct||0).toFixed(0)+'% confidence</div>'
          ).join(''):'<div style="font-size:10px;color:#888;">Still collecting market activity history.</div>')+
        '</details>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Research leads</b> · '+research.length+'</summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Possible deals that need stronger live evidence before opening a source.</div>'+
          (research.length?research.map(r=>
            '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;font-size:10px;"><div><b>'+esc(r.name)+'</b> · estimated return '+Number(r.roiPct||0).toFixed(1)+'%</div><button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'padding:4px 7px;">Check</button></div>'
          ).join(''):'<div style="font-size:10px;color:#888;">No additional research leads.</div>')+
        '</details>'+
        '<button id="mm-acq-reload" style="'+button()+'margin-top:8px;">Reload Cached Data</button>'+
      '</details>'
    );
  }

  function travelHtml(){
    if(!state)return card('<b>No cached travel state available.</b>');
    const ranked=logic.rankCachedTravel(state);
    const destinationRanked=logic.rankTravelDestinations?.(state)||[];
    const allTravelRows=Array.isArray(state?.travelIntel?.rows)?state.travelIntel.rows:[];
    const feed=readTravelFeed();
    const captureAge=feed?.capturedAt?age(new Date(Number(feed.capturedAt)).toISOString()):'none';
    const syncedAt=Date.parse(state.travelIntel?.lastSyncAt||'')||0;
    const sourceAt=Date.parse(state.travelIntel?.sourceUpdatedAt||'')||syncedAt;
    const travelAgeMs=sourceAt?Math.max(0,Date.now()-sourceAt):Infinity;
    const freshness=!Number.isFinite(travelAgeMs)?'UNKNOWN':travelAgeMs<=TRAVEL_FRESH_MS?'FRESH':travelAgeMs<=TRAVEL_STALE_MS?'AGING':'STALE';
    const ctx=travelContext;
    const current=normalizeTravelLocation(ctx?.country||'');
    const destination=normalizeTravelLocation(ctx?.destination||'');
    let scope='Next trip from Torn';
    let scopedRows=ranked;
    let scopedDestinations=destinationRanked;
    let scopedRestock=allTravelRows.filter(row=>Number(row?.stock||0)<=0&&Number(row?.shopCost||0)>0);
    if(ctx?.mode==='abroad'&&current){
      scope='Items available where you are now · '+String(ctx.country||'current destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===current);
      scopedDestinations=destinationRanked.filter(r=>normalizeTravelLocation(r.country)===current);
      scopedRestock=scopedRestock.filter(r=>normalizeTravelLocation(r.country)===current);
    }else if(ctx?.mode==='traveling'&&destination&&destination!=='torn'){
      scope='Items to consider when you arrive · '+String(ctx.destination||'destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===destination);
      scopedDestinations=destinationRanked.filter(r=>normalizeTravelLocation(r.country)===destination);
      scopedRestock=scopedRestock.filter(r=>normalizeTravelLocation(r.country)===destination);
    }else if(ctx?.mode==='traveling'){
      scope='You are traveling · showing next-trip ideas';
    }
    const stale=freshness==='STALE'||freshness==='UNKNOWN';
    const destinations=(stale?[]:scopedDestinations).slice(0,10);
    const rows=(stale?[]:scopedRows).slice(0,20);
    const restockRows=(stale?[]:scopedRestock).slice().sort((a,b)=>{
      const ar=restockRecord(a?.countryCode||a?.country,a?.itemId);
      const br=restockRecord(b?.countryCode||b?.country,b?.itemId);
      const ae=Date.parse(String(ar?.etaAt||''))||Number.MAX_SAFE_INTEGER;
      const be=Date.parse(String(br?.etaAt||''))||Number.MAX_SAFE_INTEGER;
      return ae-be||String(a?.country||'').localeCompare(String(b?.country||''))||String(a?.itemName||'').localeCompare(String(b?.itemName||''));
    }).slice(0,20);
    const freshnessColor=freshness==='FRESH'?'#9fe3a8':freshness==='AGING'?'#ffd18a':'#ff9b9b';
    const provider=String(state?.travelIntel?.source||'Travel source');
    const sourceAge=age(state?.travelIntel?.sourceUpdatedAt||'');
    return procurementRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Travel Deals</b><div style="font-size:10px;color:#888;">Current foreign stock uses Torn Intel when available; TornW3B remains the fallback. Travel and purchases remain manual.</div></div>'+
        '<button id="mm-acq-travel-update" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Travel Stock</button>'+
      '</div>'+
      '<div style="font-size:10px;margin-top:5px;"><b style="color:'+freshnessColor+';">'+esc(freshness)+'</b> · '+esc(scope)+' · '+esc(provider)+'</div>'+
      '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:10px;color:#888;">Travel data details</summary><div style="font-size:10px;color:#888;margin-top:4px;">Provider source observed '+esc(sourceAge)+' · local fetch '+esc(age(state.travelIntel?.lastSyncAt))+' · TornW3B browser capture '+esc(captureAge)+' · '+esc(travelContextLabel(ctx))+'</div><button id="mm-acq-travel-import" style="'+button()+'margin-top:5px;">Import TornW3B Fallback Capture</button></details>'+
      (stale?'<div style="margin-top:6px;padding:6px;border:1px solid #7d3b3b;border-radius:5px;color:#ffb3b3;font-size:11px;"><b>Refresh needed.</b> Old travel stock is hidden until it is refreshed.</div>':'')
    )+
    card(
      '<div><b>Destination ranking</b><div style="font-size:10px;color:#888;margin-top:3px;">Countries are ordered by the best liquidity-adjusted profit/hour available there, then total observed profit opportunity. Components stay visible; there is no hidden country score.</div></div>'+
      (destinations.length?destinations.map((d,i)=>{
        const best=d.bestItem||{};
        const bestRoi=Number(best.roiPct||0);
        const restock=Number(d.restockMatchCount||0)>0?' · <b style="color:#ffd18a;">RESTOCK MATCH '+Number(d.restockMatchCount||0)+'</b> ('+Number(d.restockDemandUnits||0).toLocaleString()+' needed)':'';
        return '<div style="border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div><b>#'+(i+1)+' '+esc(d.country)+'</b>'+restock+
          '<div style="color:#aaa;margin-top:2px;">Best item <b>'+esc(best.itemName||'—')+'</b> · adjusted profit velocity <b>'+money(d.bestLiquidityAdjustedProfitPerHour||0)+'/hr</b> · source profit velocity '+money(d.bestSourceProfitPerHour||0)+'/hr</div>'+
          '<div style="color:#888;margin-top:2px;">'+Number(d.itemCount||0)+' profitable item(s) · observed stock '+Number(d.totalObservedStock||0).toLocaleString()+' · available gross opportunity '+money(d.totalAvailableProfit||0)+' · best ROI '+bestRoi.toFixed(1)+'% · fresh Pulse '+Number(d.pulseCoveragePct||0).toFixed(0)+'% · max confidence '+Number(d.pulseConfidenceMax||0).toFixed(0)+'%</div>'+
          '</div></div>';
      }).join(''):(stale?'<div style="font-size:11px;color:#888;margin-top:6px;">Refresh travel stock to rank destinations.</div>':'<div style="font-size:11px;color:#888;margin-top:6px;">No destination currently has a supported profitable in-stock opportunity.</div>'))
    )+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;"><div><b>In-stock travel opportunities</b><div style="font-size:10px;color:#888;">Profit is shown only when Acquisitions has separate resale evidence. A foreign stock row by itself does not fabricate a resale price.</div></div></div>'+
      (rows.length?rows.map((r,i)=>{
        const profitKnown=Number(r?.profit||0)>0;
        const hourlyKnown=Number(r?.sourceProfitPerHour||0)>0;
        return '<div style="border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
            '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.itemName)+'</b><div style="margin-top:2px;">Buy in <b>'+esc(r.country)+'</b> · stock <b>'+Number(r.stock||0).toLocaleString()+'</b> · foreign cost <b>'+money(r.shopCost||0)+'</b></div>'+
              '<div style="color:#aaa;margin-top:2px;">'+(profitKnown?('Estimated profit <b>'+money(r.profit||0)+'</b> each'+(hourlyKnown?' · about <b>'+money(r.sourceProfitPerHour||0)+'/hr</b>':'')):'Resale/profit needs current market verification.')+'</div>'+
              '<div style="font-size:10px;color:#777;margin-top:2px;">'+esc(restockEtaSummary(r))+'</div>'+
              pulseLine(r,r.itemId,r.profit)+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
              '<button data-restock-eta="1" data-restock-country="'+esc(r.countryCode||r.country||'')+'" data-restock-id="'+esc(r.itemId||'')+'" data-restock-name="'+esc(r.itemName||'')+'" style="'+button()+'">RESTOCK HISTORY</button>'+
              '<button data-travel-compare="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">Check All Prices</button>'+
              '<button data-travel-source="Bazaar" data-travel-id="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">GO TO BAZAAR</button>'+
              '<button data-travel-source="Item Market" data-travel-id="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">GO TO ITEM MARKET</button>'+
              '<button data-travel-agency="1" style="'+button(true)+'">GO TO TRAVEL AGENCY</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join(''):(stale
        ?'<div style="font-size:11px;color:#888;margin-top:6px;">Refresh travel stock to see recommendations.</div>'
        :'<div style="font-size:11px;color:#888;margin-top:6px;">No profitable in-stock travel deals match your current trip.</div>'))
    )+
    card(
      '<div><b>Restock Watch</b><div style="font-size:10px;color:#888;margin-top:3px;">Out-of-stock foreign items. Restock estimates are MM calculations from Torn Intel observed history, not Torn Intel\'s private prediction. History calls are on-demand and rate-limited.</div></div>'+
      (!tornIntelKey()?'<div style="font-size:10px;color:#d8b96a;margin-top:5px;">Save the free Torn Intel client key under More → Setup / Advanced to calculate ETAs.</div>':'')+
      (restockRows.length?restockRows.map(r=>
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
          '<div><b>'+esc(r.itemName)+'</b> · '+esc(r.country)+' · <span style="color:#ffb3b3;">OUT OF STOCK</span><div style="font-size:10px;color:#888;margin-top:2px;">Foreign cost '+money(r.shopCost||0)+' · '+esc(restockEtaSummary(r))+'</div></div>'+
          '<button data-restock-eta="1" data-restock-country="'+esc(r.countryCode||r.country||'')+'" data-restock-id="'+esc(r.itemId||'')+'" data-restock-name="'+esc(r.itemName||'')+'" '+(busy?'disabled':'')+' style="'+button(Boolean(restockRecord(r.countryCode||r.country,r.itemId)?.etaAt))+(busy?'opacity:.5;':'')+'white-space:nowrap;">ESTIMATE RESTOCK</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No out-of-stock items in the current travel scope.</div>')
    );
  }

  async function compareTravelItem(itemId,itemName){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    const item=catalogRows().find(row=>row.id===id)||(name?catalogRows().find(row=>row.name.toLowerCase()===name.toLowerCase()):null);
    if(!item){
      statusText='Could not find '+(name||('item '+id))+' in the Torn item list.';
      render();
      return;
    }
    activeView='items';
    itemQuery=item.name;
    await findCatalogPriceByItem(item);
  }

  async function routeTravelAlternative(itemId,itemName,preferredSource){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    busy=true;
    statusText='Checking the current '+preferredSource+' price for '+(name||('item '+id))+'…';
    render();
    try{
      const result=await service.routeProcurementRequest({itemId:id,itemName:name,preferredSource});
      state=result?.state||await readSharedState();
      if(result?.routed){
        statusText='Opened '+result.source+' for '+(name||result.itemName||('item '+id))+'. Final purchase remains manual.';
      }else{
        statusText=preferredSource+' is not available right now for '+(name||result.itemName||('item '+id))+'. Try Check All Prices.';
      }
    }catch(error){
      statusText='Could not open '+preferredSource+': '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  async function runRestockEta(country,itemId,itemName=''){
    if(busy)return;
    if(!tornIntelKey()){
      statusText='Save the free Torn Intel client key in Setup / Advanced before loading restock history.';
      activeView='settings';
      render();
      return;
    }
    busy=true;
    statusText='Loading Torn Intel observed history for '+String(itemName||('item '+itemId))+'…';
    render();
    try{
      const record=await refreshRestockEta(country,itemId,itemName);
      const etaAt=Date.parse(String(record?.etaAt||''))||0;
      statusText=etaAt
        ?('Restock model updated: '+String(record.confidence||'UNKNOWN')+' confidence · '+Number(record.usableCycles||0)+' usable cycles · ETA '+new Date(etaAt).toLocaleString()+'.')
        :('Restock history updated: '+Number(record?.usableCycles||0)+' usable cycles · '+String(record?.confidence||'INSUFFICIENT')+' confidence. No active ETA is currently justified.');
    }catch(error){
      statusText='Restock history failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  function inventoryRestockDemands(){
    const raw=state?.operations?.inventoryRoi?.restockDemand;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
    const priority={URGENT:0,HIGH:1,NORMAL:2};
    return Object.values(raw)
      .filter(row=>/^\d+$/.test(String(row?.itemId||''))&&Number(row?.deficit||0)>0&&String(row?.status||'OPEN')==='OPEN')
      .sort((a,b)=>
        (priority[String(a?.urgency||'NORMAL')]??9)-(priority[String(b?.urgency||'NORMAL')]??9)||
        Number(b?.sellVelocityUnitsPerDay||0)-Number(a?.sellVelocityUnitsPerDay||0)||
        Number(b?.deficit||0)-Number(a?.deficit||0)||
        String(a?.itemName||'').localeCompare(String(b?.itemName||''))
      );
  }

  function inventoryRestockHtml(){
    const rows=inventoryRestockDemands();
    if(!rows.length)return '';
    const urgent=rows.filter(row=>String(row?.urgency||'')==='URGENT').length;
    return card(
      '<details open><summary style="cursor:pointer;"><b>Inventory Restock Demand</b> · '+rows.length.toLocaleString()+' item(s)'+(urgent?' · '+urgent+' urgent':'')+'</summary>'+
      '<div style="font-size:10px;color:#888;margin:5px 0;">Produced by MM_Inventory Manager. Acquisitions only reads this queue and verifies sourcing; final purchase/travel remains manual.</div>'+
      '<div style="max-height:280px;overflow:auto;">'+rows.map(row=>{
        const urgency=String(row?.urgency||'NORMAL');
        const color=urgency==='URGENT'?'#ffaaaa':urgency==='HIGH'?'#ffd18a':'#aaa';
        const freshness=String(row?.marketFreshness||'MISSING');
        return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
          '<div style="min-width:0;flex:1 1 auto;"><b>'+esc(row?.itemName||('Item '+row?.itemId))+'</b> <span style="color:#777;">['+esc(row?.itemId||'')+']</span> <b style="font-size:10px;color:'+color+';">'+esc(urgency)+'</b>'+
          '<div style="font-size:10px;color:#888;margin-top:2px;">Need '+Number(row?.deficit||0).toLocaleString()+' · stock '+Number(row?.currentQuantity||0).toLocaleString()+'/'+Number(row?.desiredQuantity||0).toLocaleString()+
          ' · sell '+Number(row?.sellVelocityUnitsPerDay||0).toFixed(2)+'/day · liquidity '+Number(row?.liquidityScore||0).toFixed(0)+' · market '+esc(freshness)+'</div></div>'+
          '<button data-inventory-restock-id="'+esc(row?.itemId||'')+'" data-inventory-restock-name="'+esc(row?.itemName||'')+'" data-inventory-restock-qty="'+esc(row?.deficit||1)+'" style="'+button(urgency==='URGENT')+'white-space:nowrap;">Compare Sources</button>'+
        '</div>';
      }).join('')+'</div></details>'
    );
  }

  function pricelistRows(){
    const list=state?.procurement?.pricelist?.items||{};
    const catalog=state?.procurement?.catalog||{};
    const marketplace=state?.marketIntel?.marketplace||{};
    const snapshots=state?.procurement?.marketSnapshots||{};
    const travelRows=Array.isArray(state?.travelIntel?.rows)?state.travelIntel.rows:[];
    const rankedById=new Map((logic?.rankPricelistUniverse?.(state)||[]).map(row=>[String(row.id),row]));
    const q=String(pricelistQuery||'').trim().toLowerCase();
    const rows=[];
    for(const [rawId,target] of Object.entries(list)){
      const id=String(rawId);
      if(!/^\d+$/.test(id))continue;
      const cat=catalog[id]||{};
      const market=marketplace[id]||{};
      const snap=snapshots[id]||{};
      const model=rankedById.get(id)||{};
      const name=String(target?.name||market?.itemName||cat?.name||('Item '+id));
      const targetBuy=Math.max(0,Number(target?.buyPrice||0));
      if(!(targetBuy>0))continue;
      const bazaarPrice=Math.max(0,Number(market?.lowestPrice||0));
      const itemMarketPrice=Math.max(0,Number(snap?.itemMarket?.lowest||0));
      const travelMatches=travelRows.filter(row=>Number(row?.stock||0)>0&&(
        String(row?.itemId||'')===id||
        String(row?.itemName||'').trim().toLowerCase()===name.trim().toLowerCase()
      ));
      const travel=travelMatches.slice().sort((a,b)=>(Number(a?.shopCost||0)||Number.MAX_SAFE_INTEGER)-(Number(b?.shopCost||0)||Number.MAX_SAFE_INTEGER))[0]||null;
      const travelPrice=Math.max(0,Number(travel?.shopCost||0));
      const sources=[
        {source:'Bazaar',price:bazaarPrice},
        {source:'Item Market',price:itemMarketPrice},
        {source:'Travel',price:travelPrice,country:String(travel?.country||'')}
      ].filter(row=>row.price>0).sort((a,b)=>a.price-b.price);
      const cheapest=sources[0]||null;
      const currentPrice=Math.max(0,Number(cheapest?.price||0));
      const savings=currentPrice>0?targetBuy-currentPrice:0;
      const underRate=currentPrice>0&&currentPrice<=targetBuy;
      const exit=Math.max(0,Number(model?.bestExit||0));
      const profit=currentPrice>0&&exit>0?exit-currentPrice:0;
      const roiPct=currentPrice>0&&exit>0?profit/currentPrice*100:0;
      const status=currentPrice<=0?'unpriced':underRate?'within':'above';
      if(q&&!name.toLowerCase().includes(q)&&id!==q)continue;
      if(pricelistStatus!=='all'&&status!==pricelistStatus)continue;
      rows.push({
        id,name,type:String(cat?.type||model?.itemType||''),
        targetBuy,bazaarPrice,itemMarketPrice,travelPrice,
        travelCountry:String(travel?.country||''),travelStock:Math.max(0,Number(travel?.stock||0)),
        cheapestSource:String(cheapest?.source||''),currentPrice,savings,underRate,status,
        estimatedResale:exit,estimatedProfit:profit,roiPct,
        bazaarUpdatedAt:String(state?.marketIntel?.marketplaceGeneratedAt||''),
        itemMarketUpdatedAt:String(snap?.fetchedAt||''),
        travelUpdatedAt:String(state?.travelIntel?.lastSyncAt||'')
      });
    }
    rows.sort((a,b)=>{
      if(pricelistSort==='name')return a.name.localeCompare(b.name);
      if(pricelistSort==='buy-rate')return b.targetBuy-a.targetBuy||a.name.localeCompare(b.name);
      if(pricelistSort==='price')return (a.currentPrice||Number.MAX_SAFE_INTEGER)-(b.currentPrice||Number.MAX_SAFE_INTEGER)||a.name.localeCompare(b.name);
      return Number(b.underRate)-Number(a.underRate)||b.savings-a.savings||b.estimatedProfit-a.estimatedProfit||a.name.localeCompare(b.name);
    });
    return rows;
  }

  async function refreshPricelistMarket(){
    if(busy)return;
    busy=true;
    statusText='Refreshing current Bazaar/reference market data for the pricelist…';
    render();
    try{
      const result=await service.refreshGlobal();
      state=result?.state||await readSharedState();
      statusText='Pricelist market data refreshed. Use Check Prices on an item for exact live Bazaar / Item Market verification.';
    }catch(error){
      statusText='Pricelist market refresh failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  async function routePricelistSource(itemId,itemName,source){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    if(source==='Travel'){
      GM_setValue(PANEL_OPEN_KEY,true);
      location.href='https://www.torn.com/travelagency.php';
      return;
    }
    busy=true;
    statusText='Verifying '+source+' for '+name+'…';
    render();
    try{
      await refreshTravelContext({force:true,silent:true});
      const result=await service.routeProcurementRequest({itemId:id,itemName:name,preferredSource:source});
      state=result?.state||await readSharedState();
      statusText=result?.routed
        ?('Opened '+result.source+' for '+name+'. Complete the purchase manually on Torn.')
        :(source+' is not currently available for '+name+'. Use Check Prices for the full comparison.');
    }catch(error){
      statusText='Could not open '+source+' for '+name+': '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  function pricelistHtml(){
    const rows=pricelistRows();
    const allItems=Object.values(state?.procurement?.pricelist?.items||{}).filter(row=>Number(row?.buyPrice||0)>0).length;
    const pages=Math.max(1,Math.ceil(rows.length/PRICELIST_PAGE_SIZE));
    pricelistPage=Math.max(0,Math.min(pricelistPage,pages-1));
    const visible=rows.slice(pricelistPage*PRICELIST_PAGE_SIZE,(pricelistPage+1)*PRICELIST_PAGE_SIZE);
    const withinCount=rows.filter(row=>row.underRate).length;
    const sourceName=String(state?.procurement?.pricelist?.source||'TornW3B Pricelist');
    const restockRequestHtml=procurementRequest?.requestKind==='inventory-restock'?procurementRequestHtml():'';
    return inventoryRestockHtml()+restockRequestHtml+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b style="font-size:15px;">Customer Pricelist</b><div style="font-size:10px;color:#aaa;margin-top:3px;">This is the main non-ranked workflow. Look for <b style="color:#9fe3a8;">AT / UNDER BUY RATE</b>, then choose where to buy.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-pricelist-refresh-main" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Pricelist</button>'+
          '<button id="mm-acq-pricelist-market-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Market Prices</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:5px;">'+allItems.toLocaleString()+' priced items · source '+esc(sourceName)+' · updated '+esc(age(state?.procurement?.pricelist?.lastSyncAt||''))+' · '+withinCount.toLocaleString()+' currently at/under buy rate in this filtered view.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) minmax(130px,.7fr) minmax(130px,.7fr) auto;gap:5px;margin-top:8px;">'+
        '<input id="mm-acq-pl-query" value="'+esc(pricelistQuery)+'" placeholder="Item name or ID" style="'+inputCss()+'width:100%;">'+
        '<select id="mm-acq-pl-status" style="'+inputCss()+'width:100%;">'+
          '<option value="all"'+(pricelistStatus==='all'?' selected':'')+'>All items</option>'+
          '<option value="within"'+(pricelistStatus==='within'?' selected':'')+'>At / under buy rate</option>'+
          '<option value="above"'+(pricelistStatus==='above'?' selected':'')+'>Above buy rate</option>'+
          '<option value="unpriced"'+(pricelistStatus==='unpriced'?' selected':'')+'>Need price check</option>'+
        '</select>'+
        '<select id="mm-acq-pl-sort" style="'+inputCss()+'width:100%;">'+
          '<option value="savings"'+(pricelistSort==='savings'?' selected':'')+'>Best savings first</option>'+
          '<option value="name"'+(pricelistSort==='name'?' selected':'')+'>Name A-Z</option>'+
          '<option value="buy-rate"'+(pricelistSort==='buy-rate'?' selected':'')+'>Highest buy rate</option>'+
          '<option value="price"'+(pricelistSort==='price'?' selected':'')+'>Lowest current price</option>'+
        '</select>'+
        '<button id="mm-acq-pl-filter" style="'+button()+'">Apply</button>'+
      '</div>'
    )+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#888;align-items:center;">'+
        '<span>'+rows.length.toLocaleString()+' matches · page '+(pricelistPage+1)+'/'+pages+'</span>'+
        '<span><button id="mm-acq-pl-prev" '+(pricelistPage<=0?'disabled':'')+' style="'+button()+(pricelistPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Prev</button> '+
        '<button id="mm-acq-pl-next" '+(pricelistPage>=pages-1?'disabled':'')+' style="'+button()+(pricelistPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></span>'+
      '</div>'+
      (visible.length?visible.map(row=>{
        const statusLabel=row.status==='within'?'AT / UNDER BUY RATE':row.status==='above'?'ABOVE BUY RATE':'CHECK PRICE';
        const statusColor=row.status==='within'?'#9fe3a8':row.status==='above'?'#ffb3b3':'#ffd18a';
        const sourceBits=[
          row.bazaarPrice>0?'Bazaar '+money(row.bazaarPrice):'Bazaar —',
          row.itemMarketPrice>0?'Item Market '+money(row.itemMarketPrice):'Item Market —',
          row.travelPrice>0?('Travel '+money(row.travelPrice)+(row.travelCountry?' · '+row.travelCountry:'')):'Travel —'
        ];
        return '<div style="border-top:1px solid #303030;padding:9px 0;font-size:11px;">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
            '<div style="min-width:0;flex:1 1 360px;">'+
              '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;"><b>'+esc(row.name)+'</b> <span style="color:#777;">['+esc(row.id)+']</span><b style="font-size:10px;color:'+statusColor+';">'+statusLabel+'</b></div>'+
              '<div style="margin-top:4px;">Pricelist buy rate <b>'+money(row.targetBuy)+'</b>'+
                (row.currentPrice>0?' · Cheapest now <b>'+esc(row.cheapestSource)+' '+money(row.currentPrice)+'</b>':' · Current price needs a live check')+
                (row.currentPrice>0?' · Difference <b style="color:'+statusColor+';">'+(row.savings>=0?'-':'+')+money(Math.abs(row.savings))+' vs buy rate</b>':'')+
              '</div>'+
              '<div style="color:#aaa;margin-top:3px;">'+esc(sourceBits.join(' · '))+'</div>'+
              (row.estimatedResale>0&&row.currentPrice>0?'<div style="color:#aaa;margin-top:3px;">Estimated resale <b>'+money(row.estimatedResale)+'</b> · estimated profit <b style="color:'+(row.estimatedProfit>=0?'#9fe3a8':'#ffaaaa')+';">'+(row.estimatedProfit>=0?'+':'-')+money(Math.abs(row.estimatedProfit))+'</b> · ROI <b>'+Number(row.roiPct||0).toFixed(1)+'%</b></div>':'')+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
              '<button data-pricelist-check="'+esc(row.id)+'" data-pricelist-name="'+esc(row.name)+'" style="'+button()+'">Check Prices</button>'+
              '<button data-pricelist-source="Bazaar" data-pricelist-id="'+esc(row.id)+'" data-pricelist-name="'+esc(row.name)+'" style="'+button(row.cheapestSource==='Bazaar')+'">GO TO BAZAAR</button>'+
              '<button data-pricelist-source="Item Market" data-pricelist-id="'+esc(row.id)+'" data-pricelist-name="'+esc(row.name)+'" style="'+button(row.cheapestSource==='Item Market')+'">GO TO ITEM MARKET</button>'+
              (row.travelPrice>0?'<button data-pricelist-source="Travel" data-pricelist-id="'+esc(row.id)+'" data-pricelist-name="'+esc(row.name)+'" style="'+button(row.cheapestSource==='Travel')+'">GO TO TRAVEL AGENCY</button>':'')+
            '</div>'+
          '</div>'+
        '</div>';
      }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No pricelist items match this filter.</div>')
    );
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
    state=await readSharedState();
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
      state=result?.state||await readSharedState();
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
      state=result?.state||await readSharedState();
      const liveRows=Array.isArray(result?.market)?result.market:[];
      const bazaarCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='bazaar').length;
      const itemMarketCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='item market'||String(row?.source||'').toLowerCase()==='market').length;
      statusText='Ranked live feed updated: '+bazaarCount.toLocaleString()+' Bazaar + '+itemMarketCount.toLocaleString()+' Item Market + '+Number(result?.auction?.length||0).toLocaleString()+' Auction.';
    }catch(error){statusText='Ranked live refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function ensurePricelistFresh(){
    if(busy)return;
    const at=Date.parse(state?.procurement?.pricelist?.lastSyncAt||'')||0;
    if(!at||Date.now()-at>=PRICELIST_STALE_MS)await refreshPricelist();
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
      state=result?.state||await readSharedState();
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
        if(row.auctionBidProvisional&&rankedSource!=='auction')return false;
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
        state=result?.state||await readSharedState();
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
      const direct=String(row.url||'');
      if(/^https:\/\/www\.torn\.com\//i.test(direct)){
        GM_setValue(PANEL_OPEN_KEY,true);
        location.href=direct;
        return;
      }
      const url=new URL('https://weav3r.dev/ranked-weapons');
      url.searchParams.set('listing','auction');
      if(row.itemName)url.searchParams.set('weaponName',String(row.itemName));
      if(row.rarity)url.searchParams.set('rarity',String(row.rarity).toLowerCase());
      if(row.bonuses?.[0]?.title)url.searchParams.set('bonus1',String(row.bonuses[0].title));
      GM_setValue(PANEL_OPEN_KEY,true);
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
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b style="font-size:15px;">Ranked Weapons</b><div style="font-size:10px;color:#aaa;margin-top:3px;">Look for weapons below BB/AH value with positive ROI and useful sales traffic. No bonus is excluded. Very early low auction bids are hidden from All Sources so a $1/$119 opening bid is not presented as a buy-price profit opportunity; choose Auction to inspect them.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-rw-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Update BB Rate</button>'+
          '<button id="mm-acq-rw-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Weapons</button>'+
          '<button id="mm-acq-rw-analyze-visible" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Load Completed Sales</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:5px;">BB rate '+money(cfg.bbRate)+'/buck · '+bazaarCount.toLocaleString()+' Bazaar · '+itemMarketCount.toLocaleString()+' Item Market · '+Number(ranked.liveAuction?.length||0).toLocaleString()+' Auction · completed-sale history '+historyCount+' weapon types · updated '+esc(age(ranked.lastLiveAt))+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:5px;margin-top:8px;">'+
        '<select id="mm-acq-rw-type" style="'+inputCss()+'width:100%;"><option value="all">All weapon types</option><option value="primary"'+(rankedType==='primary'?' selected':'')+'>Primary</option><option value="secondary"'+(rankedType==='secondary'?' selected':'')+'>Secondary</option><option value="melee"'+(rankedType==='melee'?' selected':'')+'>Melee</option></select>'+
        '<select id="mm-acq-rw-source" style="'+inputCss()+'width:100%;"><option value="all">All sources</option><option value="bazaar"'+(rankedSource==='bazaar'?' selected':'')+'>Bazaar</option><option value="item-market"'+(rankedSource==='item-market'?' selected':'')+'>Item Market</option><option value="auction"'+(rankedSource==='auction'?' selected':'')+'>Auction</option></select>'+
        '<select id="mm-acq-rw-rarity" style="'+inputCss()+'width:100%;"><option value="all">All rarity</option><option value="yellow"'+(rankedRarity==='yellow'?' selected':'')+'>Yellow</option><option value="orange"'+(rankedRarity==='orange'?' selected':'')+'>Orange</option><option value="red"'+(rankedRarity==='red'?' selected':'')+'>Red</option></select>'+
        '<input id="mm-acq-rw-weapon" value="'+esc(rankedWeapon)+'" placeholder="Weapon name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-bonus" value="'+esc(rankedBonus)+'" placeholder="Bonus name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-roi" type="number" min="0" step="1" value="'+Number(rankedMinRoi||0)+'" placeholder="Minimum ROI %" style="'+inputCss()+'width:100%;">'+
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
        const isAuction=String(row.source||'').toLowerCase()==='auction';
        const sourceLower=String(row.source||'').toLowerCase();
        const targetRoi=Math.max(Number(rankedMinRoi||0),Number(cfg.minRoiPct||0));
        const bidCeiling=row.fairValue>0?Math.floor(Number(row.fairValue)/(1+targetRoi/100)):0;
        const bidHeadroom=bidCeiling>0?bidCeiling-Number(row.price||0):0;
        const underBb=Number(row.bbFloor||0)>0&&Number(row.price||0)<Number(row.bbFloor||0);
        const belowFair=Number(row.fairValue||0)>0&&Number(row.price||0)<Number(row.fairValue||0);
        const provisional=Boolean(isAuction&&row.auctionBidProvisional);
        const good=!provisional&&belowFair&&Number(row.roiPct||0)>0;
        const decision=provisional?'EARLY BID · WATCH ONLY':underBb?'UNDER BB VALUE':good?(isAuction?'WATCH / BID CANDIDATE':'INVESTMENT CANDIDATE'):'REVIEW';
        const decisionColor=provisional?'#ffcf7a':underBb?'#9fe3a8':good?'#d8d48a':'#aaa';
        const actionLabel=isAuction
          ?(String(row.url||'').startsWith('https://www.torn.com/')?'GO TO AUCTION':'OPEN AUCTION FINDER')
          :sourceLower.includes('bazaar')?'GO TO BAZAAR':'GO TO ITEM MARKET';
        return '<div style="border-top:1px solid #303030;padding:9px 0;font-size:11px;">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
            '<div style="min-width:0;flex:1 1 410px;">'+
              '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;"><b>'+esc(row.itemName)+'</b> · '+esc(row.weaponType)+' · '+esc(row.rarity.toUpperCase())+' · '+esc(row.source)+' <b style="font-size:10px;color:'+decisionColor+';">'+decision+'</b></div>'+
              '<div style="color:#aaa;margin-top:2px;">'+esc(bonus)+'</div>'+
              '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:5px;margin-top:6px;">'+
                '<div style="background:#131313;border:1px solid #333;border-radius:5px;padding:6px;"><div style="font-size:9px;color:#777;">'+(isAuction?'CURRENT BID':'CURRENT PRICE')+'</div><b>'+money(row.price)+'</b></div>'+
                '<div style="background:#131313;border:1px solid #333;border-radius:5px;padding:6px;"><div style="font-size:9px;color:#777;">ESTIMATED VALUE</div><b>'+money(row.fairValue)+'</b></div>'+
                '<div style="background:#131313;border:1px solid #333;border-radius:5px;padding:6px;"><div style="font-size:9px;color:#777;">'+(provisional?'BID STATUS':'EST. PROFIT / ROI')+'</div>'+(provisional?'<b style="color:#ffcf7a;">PROVISIONAL</b><div style="font-size:9px;color:#777;">early bid is not a purchase price</div>':'<b style="color:'+(Number(row.profit||0)>0?'#9fe3a8':'#ffaaaa')+';">'+(Number(row.profit||0)>=0?'+':'-')+money(Math.abs(Number(row.profit||0)))+' / '+Number(row.roiPct||0).toFixed(1)+'%</b>')+'</div>'+
                '<div style="background:#131313;border:1px solid #333;border-radius:5px;padding:6px;"><div style="font-size:9px;color:#777;">SALES 7 / 30 / 90 DAYS</div><b>'+Number(row.volume7||0)+' / '+Number(row.volume30||0)+' / '+Number(row.volume90||0)+'</b></div>'+
              '</div>'+
              (isAuction?'<div style="color:#d8b96a;margin-top:5px;">'+(targetRoi>0?'Max bid for '+targetRoi.toFixed(1)+'% ROI':'Break-even bid ceiling')+' <b>'+money(bidCeiling)+'</b> · headroom <b>'+(bidHeadroom>=0?'+':'-')+money(Math.abs(bidHeadroom))+'</b> · '+Number(row.bids||0)+' bids · ends in '+esc(futureDuration(row.endsAt))+'</div>':'')+
              '<details style="margin-top:5px;"><summary style="cursor:pointer;font-size:10px;color:#888;">Valuation details</summary>'+
                '<div style="color:#888;margin-top:4px;">'+esc(row.valuationSource)+' · BB value '+Number(row.bbUnits||0)+' bucks = '+money(row.bbFloor)+' · AH median '+money(row.auctionValue)+' · completed-sale sample '+Number(row.history?.samples||0)+' · confidence '+Number(row.history?.confidence||0)+'% · liquidity '+Number(row.liquidityScore||0)+'/100 · '+(isAuction?'watch score '+Number(row.auctionWatchScore||0)+'/100':'investment score '+Number(row.investmentScore||0)+'/100')+'</div>'+
                pulseLine(row,row.itemId,row.profit)+
              '</details>'+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
              '<button data-rw-history="'+esc(row.itemId)+'" '+(busy?'disabled':'')+' style="'+button(!historyLoaded)+(busy?'opacity:.5;':'')+'padding:6px 8px;">'+(historyLoaded?'Refresh Sales':'Load Completed Sales')+'</button>'+
              (historyLoaded?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(row.itemId)+'" style="'+button(false)+'text-decoration:none;display:inline-block;padding:6px 8px;">Completed Sales ('+Number(row.history?.samples||0)+')</a>':'')+
              '<button data-rw-open="'+globalIndex+'" style="'+button(true)+'padding:7px 9px;">'+actionLabel+'</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No ranked listings match these filters. Refresh Weapons or loosen the filters.</div>')
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
      state=result?.state||await readSharedState();
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
      state=itemSources?.state||await readSharedState();
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
        const priceText=result.priceKnown&&Number(result.price||0)>0?money(result.price)+' each':'price unavailable in current travel feed';
        const profitText=Number(result.profit||0)?' · estimated profit '+money(result.profit):'';
        statusText='Travel is currently cheapest: '+String(result.country||'destination')+' · '+priceText+profitText+'. You can still open Bazaar or Item Market below without leaving this comparison.';
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
    const hasTravel=sources.some(source=>String(source?.source||'').toLowerCase()==='overseas');
    const bestIsTravel=String(best?.source||'').toLowerCase()==='overseas';
    const historyRows=Array.isArray(state?.procurement?.ranked?.history?.[String(itemSelection.id)]?.rows)
      ?state.procurement.ranked.history[String(itemSelection.id)].rows:[];
    const rankedEligible=/(weapon|armor|armour)/i.test(String(itemSelection.type||'')+' '+String(itemSelection.subType||''));
    const verifiedSalesAction=historyRows.length
      ?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(itemSelection.id)+'" style="'+button(false)+'text-decoration:none;display:inline-block;">Completed Sales ('+historyRows.length+') ↓</a>'
      :rankedEligible
        ?'<button data-rw-history="'+esc(itemSelection.id)+'" '+(busy?'disabled':'')+' style="'+button(false)+(busy?'opacity:.5;':'')+'">Load Completed Sales</button>'
        :'';

    const rows=sources.length?sources.map((source,index)=>{
      const sourcePrice=Math.max(0,Number(source.price||0));
      const priceKnown=source.priceKnown!==false&&sourcePrice>0;
      const profit=exit>0&&priceKnown?exit-sourcePrice:0;
      const roi=exit>0&&priceKnown?profit/sourcePrice*100:0;
      const sourceName=String(source.source||'Unknown').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel');
      const bestBadge=index===0&&priceKnown?'<span style="color:#d8b96a;font-size:10px;">CHEAPEST</span>':'';
      const facts=[
        source.shopName?String(source.shopName):'',
        source.country?String(source.country):'',
        Number(source.quantity||0)>0?'Available '+Number(source.quantity).toLocaleString():'',
        source.aggregateOnly&&Number(source.bazaarCount||0)>0?Number(source.bazaarCount).toLocaleString()+' bazaars':'',
        source.travelEvidence?'Estimated travel profit '+money(source.profit||0):''
      ].filter(Boolean);
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
        '<div style="min-width:0;">'+
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>'+esc(sourceName)+'</b>'+bestBadge+'</div>'+
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;">'+
            '<span>Price <b>'+(priceKnown?money(sourcePrice):'not shown')+'</b></span>'+
            (exit>0&&priceKnown?'<span>Likely resale <b>'+money(exit)+'</b></span><span>Est. profit <b style="color:'+(profit>=0?'#9fe3a8':'#ffaaaa')+';">'+(profit>=0?'+':'-')+money(Math.abs(profit))+'</b></span>':'')+
          '</div>'+
          (facts.length?'<div style="color:#888;margin-top:3px;">'+esc(facts.join(' · '))+'</div>':'')+
        '</div>'+
        (String(source.source||'').toLowerCase().startsWith('bazaar')
          ?'<button data-item-alt-source="Bazaar" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">GO TO BAZAAR</button>'
          :String(source.source||'').toLowerCase()==='item market'
            ?'<button data-item-alt-source="Item Market" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">GO TO ITEM MARKET</button>'
            :String(source.source||'').toLowerCase()==='overseas'
              ?'<button data-item-travel="1" style="'+button(index===0&&priceKnown)+'">GO TO TRAVEL AGENCY</button>'
              :'<button data-item-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">USE '+esc(sourceName.toUpperCase())+'</button>')+
      '</div>';
    }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No current price sources were found.</div>';

    const decision=sources.length&&best
      ?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:6px;margin:8px 0;">'+
        '<div style="border:1px solid #3e3520;border-radius:6px;padding:8px;background:#1a1710;"><div style="font-size:9px;color:#9c9275;">CHEAPEST PRICE</div><b>'+esc(String(best.source||'').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel'))+' · '+money(bestPrice)+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">LIKELY RESALE</div><b>'+money(exit)+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">ESTIMATED PROFIT</div><b style="color:'+(bestProfit>=0?'#9fe3a8':'#ffaaaa')+';">'+(bestProfit>=0?'+':'-')+money(Math.abs(bestProfit))+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">RETURN ON COST</div><b>'+bestRoi.toFixed(1)+'%</b><div style="font-size:9px;color:#777;">also called ROI</div></div>'+
      '</div>'
      :'';

    return card(
      '<div><b style="font-size:14px;">'+esc(itemSelection.name)+'</b> <span style="color:#777;">['+esc(itemSelection.id)+']</span><div style="font-size:10px;color:#888;">Check prices, then click GO TO BAZAAR or GO TO ITEM MARKET. Buying remains manual.</div></div>'+
      decision+
      '<div style="border:1px solid #6b5a2e;background:#19170f;border-radius:8px;padding:9px;margin:8px 0;">'+
        '<div style="font-size:12px;font-weight:700;color:#f0d27a;">WHERE DO YOU WANT TO BUY?</div>'+
        '<div style="font-size:10px;color:#aaa;margin:2px 0 7px;">Choose one. Acquisitions opens the page; you make the purchase manually.</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:6px;">'+
          '<button data-item-alt-source="Bazaar" '+(busy?'disabled':'')+' style="'+button(String(best?.source||'').toLowerCase().startsWith('bazaar'))+(busy?'opacity:.5;':'')+'padding:10px;"><b>GO TO BAZAAR</b><br><span style="font-size:9px;font-weight:400;">Player-owned bazaars</span></button>'+
          '<button data-item-alt-source="Item Market" '+(busy?'disabled':'')+' style="'+button(String(best?.source||'').toLowerCase()==='item market')+(busy?'opacity:.5;':'')+'padding:10px;"><b>GO TO ITEM MARKET</b><br><span style="font-size:9px;font-weight:400;">Torn Item Market for this item</span></button>'+
          (hasTravel?'<button data-item-travel="1" style="'+button(bestIsTravel)+'padding:10px;"><b>GO TO TRAVEL AGENCY</b><br><span style="font-size:9px;font-weight:400;">Overseas buying</span></button>':'')+
        '</div>'+
        (best?'<div style="font-size:10px;color:#d8b96a;margin-top:6px;">Cheapest currently shown: <b>'+esc(String(best.source||'').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel'))+'</b> at '+money(bestPrice)+'.</div>':'')+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">'+verifiedSalesAction+'</div>'+
      (best&&String(best.source||'')==='Overseas'?'<div style="padding:6px;border:1px solid #6d5928;border-radius:5px;color:#e3ca82;font-size:10px;margin-bottom:6px;"><b>Travel is cheapest.</b> You can still open Bazaar or Item Market above if you do not want to travel.</div>':'')+
      pulseLine({},itemSelection.id,bestProfit)+
      (verifiedSalesItemId===String(itemSelection.id)?verifiedSalesHtml(itemSelection.id):'')+
      '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:10px;color:#aaa;"><b>All price sources and extra details</b></summary>'+
        (targetBuy>0?'<div style="font-size:10px;color:#888;margin:5px 0;">Your pricelist buy target: <b>'+money(targetBuy)+'</b> · resale estimate source: '+esc(exitRoute)+'</div>':'')+
        rows+
      '</details>'
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
    const options=categories.map(cat=>'<option value="'+esc(cat)+'"'+(itemCategory===cat?' selected':'')+'>'+esc(cat)+'</option>').join('');
    return card(
      '<b>Find One Item</b>'+
      '<div style="font-size:11px;color:#aaa;margin:3px 0 7px;">Type an item name or Torn item ID, then click <b>Check Prices</b>.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:5px;">'+
        '<input id="mm-acq-item-query" type="search" placeholder="Example: Can of Crocozade" value="'+esc(itemQuery)+'" style="'+inputCss()+'width:100%;">'+
        '<button id="mm-acq-item-find" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Check Prices</button>'+
      '</div>'+
      '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:10px;color:#888;">More search filters</summary>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;margin-top:6px;">'+
          '<select id="mm-acq-item-category" style="'+inputCss()+'width:100%;"><option value="All">All categories</option>'+options+'</select>'+
          '<select id="mm-acq-item-availability" style="'+inputCss()+'width:100%;">'+
            '<option value="buyable"'+(itemAvailability==='buyable'?' selected':'')+'>Buyable items</option>'+
            '<option value="bazaar"'+(itemAvailability==='bazaar'?' selected':'')+'>Has Bazaar price</option>'+
            '<option value="itemmarket"'+(itemAvailability==='itemmarket'?' selected':'')+'>Has Item Market price</option>'+
            '<option value="shops"'+(itemAvailability==='shops'?' selected':'')+'>Torn shop item</option>'+
            '<option value="pricelist"'+(itemAvailability==='pricelist'?' selected':'')+'>On your pricelist</option>'+
            '<option value="all"'+(itemAvailability==='all'?' selected':'')+'>All items</option>'+
          '</select>'+
          '<select id="mm-acq-item-sort" style="'+inputCss()+'width:100%;">'+
            '<option value="name"'+(itemSort==='name'?' selected':'')+'>Name A-Z</option>'+
            '<option value="category"'+(itemSort==='category'?' selected':'')+'>Category</option>'+
            '<option value="market-asc"'+(itemSort==='market-asc'?' selected':'')+'>Price low-high</option>'+
            '<option value="market-desc"'+(itemSort==='market-desc'?' selected':'')+'>Price high-low</option>'+
          '</select>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;"><button id="mm-acq-item-filter" style="'+button()+'">Apply Filters</button><button id="mm-acq-catalog-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Item List</button><button id="mm-acq-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Pricelist</button></div>'+
      '</details>'
    )+
    itemPriceResultHtml()+
    card(
      '<details'+(itemQuery&&!itemSelection?' open':'')+'><summary style="cursor:pointer;"><b>Browse item list</b> · '+rows.length.toLocaleString()+' matches</summary>'+
        '<div style="display:flex;justify-content:flex-end;gap:4px;margin:7px 0;font-size:10px;"><button id="mm-acq-item-prev" '+(itemPage<=0?'disabled':'')+' style="'+button()+(itemPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Previous</button><button id="mm-acq-item-next" '+(itemPage>=pages-1?'disabled':'')+' style="'+button()+(itemPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></div>'+
        (visible.length?visible.map(row=>
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
            '<div style="min-width:0;"><b>'+esc(row.name)+'</b> <span style="color:#777;">['+esc(row.id)+']</span><div style="color:#888;">'+esc(row.type)+(row.bazaarPrice>0?' · Bazaar '+money(row.bazaarPrice):'')+(row.itemMarketPrice>0?' · Item Market '+money(row.itemMarketPrice):'')+'</div></div>'+
            '<button data-catalog-find="'+esc(row.id)+'" '+(busy?'disabled':'')+' style="'+button(itemSelection?.id===row.id)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Check Price</button>'+
          '</div>'
        ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No items match these filters.</div>')+
      '</details>'
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
      '<b>Setup · Torn API key</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">The API key is stored only in this userscript\'s Tampermonkey GM storage. It is not copied to shared IndexedDB/localStorage. Required scope: Torn Items catalog, User Basic, User Log purchase events used by the ledger, and market data needed for live verification.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto;gap:5px;align-items:center;">'+
        '<input id="mm-acq-api" type="password" autocomplete="off" placeholder="'+(apiKey()?'Torn API key saved — enter to replace':'Torn API key')+'" style="'+inputCss()+'">'+
        '<button id="mm-acq-save-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-acq-clear-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">While Acquisitions is open and visible, stale purchase logs and opportunity data refresh automatically with guarded intervals. Weav3r generation is checked once per minute. Verify & Buy and final purchase remain manual.</div>'
    )+
    card(
      '<b>Setup · Torn Intel travel/restock</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">Current foreign stock can use Torn Intel without this key. The free approved Torn Intel client key is used only for on-demand 48-hour history / Restock ETA calls. It is stored only in this userscript\'s Tampermonkey GM storage and is never copied into shared state or diagnostics.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto auto;gap:5px;align-items:center;">'+
        '<input id="mm-acq-ti-key" type="password" autocomplete="off" placeholder="'+(tornIntelKey()?'Torn Intel client key saved — enter to replace':'Torn Intel client key')+'" style="'+inputCss()+'">'+
        '<button id="mm-acq-ti-save" style="'+button(true)+'">Save</button>'+
        '<button id="mm-acq-ti-clear" style="'+button()+'">Clear</button>'+
        '<button id="mm-acq-ti-test-live" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Test Live Stock</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:6px;">Travel provider: '+esc(String(state?.travelIntel?.source||'not synced'))+' · source observed '+esc(age(state?.travelIntel?.sourceUpdatedAt||''))+' · cached restock models '+Object.keys(state?.travelIntel?.restockEta||{}).length+'. Request/approve a client key at torn-intel.com/developers if Restock ETA is needed.</div>'
    )+
    '<details style="margin-bottom:7px;"><summary style="cursor:pointer;border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;"><b>Advanced settings</b> · optional</summary><div style="margin-top:7px;">'+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Market Activity</b><div style="font-size:10px;color:#888;margin-top:4px;">Seller-free Torn API movement intelligence. One cross-tab engine lease, bounded cache/history, cache-delay-aware cadence and local request-budget governor. No seller-target, mug or attack model is retained.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-pulse-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Pulse</button><button id="mm-acq-pulse-export" style="'+button()+'">Export Diagnostics</button></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">Source: Torn API v2 Item Market · cached items '+pulseRows.length+' · proven '+pulseProven+' · candidates '+pulseCandidates+' · request budget '+Number(pulseBudget.used||0)+'/'+Number(pulseBudget.limit||0)+' in the last minute · updated '+(Number(pulseState.updatedAt||0)?esc(age(new Date(Number(pulseState.updatedAt)).toISOString())):'not synced')+'.</div>'
    )+
    card(
      '<b>Deal Rules</b>'+
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
      '<b>Ranked Weapon Rules</b>'+
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
    )+
    '</div></details>';
  }

  function detailStateKey(view,details){
    const label=String(details?.querySelector?.('summary')?.textContent||'').trim().replace(/\s+/g,' ');
    return label?String(view||'home')+'|'+label:'';
  }

  function capturePanelUiState(root){
    if(!root||!renderedView)return;
    const scroller=root.querySelector('#mm-acq-content');
    if(scroller)viewScrollTop.set(renderedView,Number(scroller.scrollTop||0));
    root.querySelectorAll('details').forEach(details=>{
      const key=detailStateKey(renderedView,details);
      if(key)detailOpenState.set(key,Boolean(details.open));
    });
  }

  function restorePanelUiState(root){
    if(!root)return;
    root.querySelectorAll('details').forEach(details=>{
      const key=detailStateKey(activeView,details);
      if(key&&detailOpenState.has(key))details.open=Boolean(detailOpenState.get(key));
    });
    const scroller=root.querySelector('#mm-acq-content');
    if(scroller)scroller.scrollTop=Number(viewScrollTop.get(activeView)||0);
    renderedView=activeView;
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
    capturePanelUiState(root);

    root.innerHTML=
      '<div style="height:48px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 9px;">'+
        '<div><b style="font-size:15px;">MM_Acquisitions</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.34 · PRICELIST + RANKED</div></div>'+
        '<button id="mm-acq-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">'+
          '<button data-acq-view="pricelist" style="'+button(activeView==='pricelist')+'">Pricelist</button>'+
          '<button data-acq-view="ranked" style="'+button(activeView==='ranked')+'">Ranked Weapons</button>'+
          '<button data-acq-view="more" style="'+button(['more','items','deals','travel','settings'].includes(activeView))+'">More</button>'+
        '</div>'+
        (['items','deals','travel','settings'].includes(activeView)
          ?'<div style="margin-bottom:6px;"><button data-more-back="1" style="'+button()+'padding:5px 8px;">← More tools</button></div>'
          :'')+
        '<div style="padding:5px 7px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<b style="color:#ffaaaa;">Cannot read shared CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>'):'')+
        '<div id="mm-acq-content" style="max-height:calc(100vh - 240px);overflow:auto;padding-right:2px;">'+
          (activeView==='pricelist'?pricelistHtml():activeView==='ranked'?rankedHtml():activeView==='more'?moreHtml():activeView==='settings'?settingsHtml():activeView==='travel'?travelHtml():activeView==='items'?itemsHtml():dealsHtml())+
        '</div>'+
      '</div>';

    core?.makePanelDraggable?.(
      root,
      root.firstElementChild,
      'acquisitions',
      window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'90px'}
    );
    restorePanelUiState(root);
    root.querySelector('#mm-acq-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-acq-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView=b.dataset.acqView||'pricelist';
      render();
      if(activeView==='pricelist')setTimeout(ensurePricelistFresh,80);
      if(activeView==='ranked'){ensureItemCatalog();setTimeout(ensureRankedFresh,80);}
    }));
    root.querySelectorAll('[data-more-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView=String(b.dataset.moreView||'items');
      render();
      if(activeView==='items')ensureItemCatalog();
      if(activeView==='travel'&&apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    }));
    root.querySelectorAll('[data-more-back]').forEach(b=>b.addEventListener('click',()=>{activeView='more';render();}));
    root.querySelector('#mm-acq-pricelist-refresh-main')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-pricelist-market-refresh')?.addEventListener('click',refreshPricelistMarket);
    root.querySelector('#mm-acq-pl-filter')?.addEventListener('click',()=>{
      pricelistQuery=String(root.querySelector('#mm-acq-pl-query')?.value||'').trim();
      pricelistStatus=String(root.querySelector('#mm-acq-pl-status')?.value||'all');
      pricelistSort=String(root.querySelector('#mm-acq-pl-sort')?.value||'savings');
      pricelistPage=0;
      render();
    });
    root.querySelector('#mm-acq-pl-query')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        pricelistQuery=String(root.querySelector('#mm-acq-pl-query')?.value||'').trim();
        pricelistPage=0;
        render();
      }
    });
    root.querySelector('#mm-acq-pl-prev')?.addEventListener('click',()=>{pricelistPage=Math.max(0,pricelistPage-1);render();});
    root.querySelector('#mm-acq-pl-next')?.addEventListener('click',()=>{pricelistPage++;render();});
    root.querySelectorAll('[data-pricelist-source]').forEach(b=>b.addEventListener('click',()=>routePricelistSource(b.dataset.pricelistId,b.dataset.pricelistName,b.dataset.pricelistSource)));
    root.querySelectorAll('[data-inventory-restock-id]').forEach(b=>b.addEventListener('click',()=>{
      const id=String(b.dataset.inventoryRestockId||'');
      const itemName=String(b.dataset.inventoryRestockName||('Item '+id));
      const qty=Math.max(1,Number(b.dataset.inventoryRestockQty||1));
      procurementRequest={itemId:id,itemName,qty,preferredSource:'Best',requestKind:'inventory-restock',reason:'Inventory deficit · source replacement stock'};
      procurementSources=null;
      statusText='Inventory restock requested '+itemName+' x'+qty.toLocaleString()+'. Comparing Bazaar, Item Market and travel sources…';
      render();
      setTimeout(refreshProcurementSources,80);
    }));
    root.querySelectorAll('[data-pricelist-check]').forEach(b=>b.addEventListener('click',()=>{
      const id=String(b.dataset.pricelistCheck||'');
      const name=String(b.dataset.pricelistName||'');
      const item=catalogRows().find(row=>row.id===id)||{id,name,type:'',subType:'',pricelistBuyPrice:Number(state?.procurement?.pricelist?.items?.[id]?.buyPrice||0)};
      itemQuery=name;
      itemSelection=item;
      activeView='items';
      findCatalogPriceByItem(item);
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
    root.querySelectorAll('[data-restock-eta]').forEach(b=>b.addEventListener('click',()=>runRestockEta(
      b.dataset.restockCountry||'',b.dataset.restockId||'',b.dataset.restockName||''
    )));
    root.querySelectorAll('[data-acquire-item]').forEach(b=>b.addEventListener('click',()=>acquire(b.dataset.acquireItem)));
    root.querySelectorAll('[data-pricelist-verify]').forEach(b=>b.addEventListener('click',()=>{
      const item=catalogRows().find(row=>row.id===String(b.dataset.pricelistVerify||''));
      if(!item)return;
      itemQuery=item.name;
      activeView='items';
      findCatalogPriceByItem(item);
    }));
    root.querySelector('#mm-acq-procurement-refresh')?.addEventListener('click',refreshProcurementSources);
    root.querySelector('#mm-acq-procurement-travel-agency')?.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';});
    root.querySelector('#mm-acq-procurement-clear')?.addEventListener('click',()=>{const kind=procurementRequest?.requestKind;procurementRequest=null;procurementSources=null;statusText=kind==='inventory-restock'?'Inventory restock source comparison cleared.':'Procurement source comparison cleared.';render();});
    root.querySelectorAll('[data-procurement-route]').forEach(b=>b.addEventListener('click',()=>routeProcurementRequest(b.dataset.procurementRoute||'Best')));
    root.querySelector('#mm-acq-catalog-refresh')?.addEventListener('click',()=>refreshItemCatalog({silent:false}));
    root.querySelector('#mm-acq-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-live-refresh')?.addEventListener('click',refreshRankedLive);
    root.querySelectorAll('[data-travel-compare]').forEach(b=>b.addEventListener('click',()=>compareTravelItem(b.dataset.travelCompare,b.dataset.travelName)));
    root.querySelectorAll('[data-travel-source]').forEach(b=>b.addEventListener('click',()=>routeTravelAlternative(b.dataset.travelId,b.dataset.travelName,b.dataset.travelSource)));
    root.querySelectorAll('[data-travel-agency]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';}));
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
    root.querySelectorAll('[data-item-alt-source]').forEach(b=>b.addEventListener('click',()=>routeCatalogItem(b.dataset.itemAltSource||'Best')));
    root.querySelectorAll('[data-item-travel]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';}));
    root.querySelector('#mm-acq-ti-save')?.addEventListener('click',()=>{
      const value=String(root.querySelector('#mm-acq-ti-key')?.value||'').trim();
      if(value)GM_setValue(TORN_INTEL_KEY,value);
      statusText=value?'Torn Intel client key saved for on-demand Restock ETA history.':'Enter a Torn Intel client key to save.';
      render();
    });
    root.querySelector('#mm-acq-ti-clear')?.addEventListener('click',()=>{
      GM_deleteValue(TORN_INTEL_KEY);
      GM_deleteValue(TORN_INTEL_LAST_KEYED_AT);
      statusText='Torn Intel client key cleared. Live stock refresh can still use the anonymous browser lane.';
      render();
    });
    root.querySelector('#mm-acq-ti-test-live')?.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;statusText='Testing Torn Intel live foreign stock…';render();
      try{
        const result=await refreshTornIntelTravel({silent:true});
        statusText='Torn Intel live stock PASS: '+Number(result?.rows?.length||0)+' item/country rows imported.';
      }catch(error){
        statusText='Torn Intel live stock failed: '+(error?.message||String(error));
      }finally{busy=false;render();}
    });
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
    GM_setValue(PANEL_OPEN_KEY,true);
    core?.setDockLauncherActive?.('acquisitions',true);
    render();
    reloadCachedState().then(()=>{
      if(activeView==='pricelist')setTimeout(ensurePricelistFresh,40);
      return autoRefreshAcquisitions({force:false});
    });
    if(apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    startWatcher();
    startAutoRefresh();
  }

  function close(){
    const root=document.getElementById(ROOT_ID);
    if(root)root.style.display='none';
    GM_setValue(PANEL_OPEN_KEY,false);
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
          if(!root||root.style.display==='none')open();
          else core?.setDockLauncherActive?.('acquisitions',true);
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
  function initializeAcquisitions(){
    createLauncher();
    installChannel();
    startAutoRefresh();
    if(Boolean(GM_getValue(PANEL_OPEN_KEY,false)))setTimeout(open,0);
  }
  window.addEventListener('pagehide',()=>{stopAutoRefresh();pulseEngine?.release?.();},{once:true});
  if(document.body)initializeAcquisitions();
  else window.addEventListener('DOMContentLoaded',initializeAcquisitions,{once:true});
})();
