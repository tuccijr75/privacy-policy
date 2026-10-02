// ==UserScript==
// @name         MM Torn Market Scout
// @namespace    manic-mike.torn.market-scout
// @version      8.0.0-alpha.4
// @description  Modular acquisition tool for verified Bazaar, Item Market and cached Travel opportunities.
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/market-scout/MM_Market_Scout.logic.js
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/market-scout/MM_Market_Scout.live.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID='mm-market-scout';
  const LAUNCHER_ID='mm-market-scout-launcher';
  const API_KEY='mm_market_scout_api_v1';
  const TRAVEL_FEED_KEY='mm_market_scout_travel_feed_v1';
  const TRAVEL_RETURN_KEY='mm_market_scout_travel_return_v1';

  let activeView='deals';
  let state=null;
  let loadError='';
  let statusText='Ready.';
  let busy=false;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornMarketLogic;
  const live=globalThis.MMTornMarketLive;

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
    if(!key)return Promise.reject(new Error('Save a Torn API key in Market Scout Settings first.'));
    const url=new URL(path.startsWith('http')?path:'https://api.torn.com/v2'+path);
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM Market Scout');
    return gmJson(url.toString());
  }

  function bazaarRequest(sellerId){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Save a Torn API key in Market Scout Settings first.'));
    const url=new URL('https://api.torn.com/user/'+encodeURIComponent(String(sellerId||'')));
    url.searchParams.set('selections','bazaar');
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM Market Scout');
    return gmJson(url.toString());
  }

  function navigate(url){
    close();
    setTimeout(()=>{location.href=String(url||'');},20);
  }

  const service=live?.createService({
    core,logic,weavRequest,tornRequest,bazaarRequest,
    hasTornKey:()=>Boolean(apiKey()),
    navigate
  });

  async function importTravelCapture({silent=false}={}){
    const feed=readTravelFeed();
    if(!feed?.rows?.length) {
      if(!silent){statusText='No Market Scout travel capture is available yet.';render();}
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
    if(busy)return;
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
    if(!core||!logic||!live||!service){
      loadError='Market Scout dependencies did not load.';
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
    if(busy)return;
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
    const minPrice=Math.max(0,read('#mm-scout-rule-min-price'));
    const values={
      minRoiPct:Math.max(0,read('#mm-scout-rule-min-roi')),
      minDemandPerDay:Math.max(0,read('#mm-scout-rule-min-demand')),
      minPrice,
      maxPrice:Math.max(minPrice,read('#mm-scout-rule-max-price')),
      minAbsoluteProfit:Math.max(0,read('#mm-scout-rule-min-profit')),
      minSellerCount:Math.max(0,Math.round(read('#mm-scout-rule-min-sellers'))),
      maxListingAgeSec:Math.max(30,Math.round(read('#mm-scout-rule-max-age')))
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
    if(busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before live verification.';
      activeView='settings';
      render();
      return;
    }
    busy=true;
    statusText='Re-checking live price and seller availability…';
    render();
    try{
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

  function sourceStrip(){
    if(!state)return '';
    const f=core.freshnessSnapshot(state);
    return '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-bottom:7px;">'+
      '<span>Weav3r '+esc(age(f.weav3rGeneratedAt))+'</span>'+
      '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
      '<span>· Travel '+esc(age(f.travel))+'</span>'+
      '<span>· Torn key '+(apiKey()?'<b style="color:#9fe3a8;">SAVED</b>':'<b style="color:#ffd18a;">NOT SAVED</b>')+'</span>'+
    '</div>';
  }

  function dealsHtml(){
    if(!state)return card('<b>No cached market state available.</b>');
    const rows=logic.rankCachedOpportunities(state);
    const buyable=rows.filter(r=>r.purchaseReady).slice(0,12);
    const research=rows.filter(r=>!r.purchaseReady).slice(0,8);

    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Profit Opportunities</b><div style="font-size:10px;color:#888;">ROI + sell-through + profit velocity. Purchase routing always re-verifies first.</div></div>'+
        '<div style="display:flex;gap:5px;"><button id="mm-scout-reload" style="'+button()+'">Reload Cache</button><button id="mm-scout-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Opportunities</button></div>'+
      '</div>'
    )+
    card('<b>Best Buyable Deals</b>'+
      (buyable.length?buyable.map((r,i)=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b> · '+esc(r.purchaseSource)+
          '<div>Buy <b>'+money(r.buyPrice)+'</b> · Max '+money(r.maxBuyPrice)+' · Exit '+money(r.bestExit)+' · ROI <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="color:#888;">3d sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% ('+esc(r.conversionSource)+') · Qty '+Number(r.recommendedQty||1)+' · Est. 3d profit '+money(r.expectedProfit3d||0)+'</div></div>'+
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
    const rows=logic.rankCachedTravel(state).slice(0,20);
    const feed=readTravelFeed();
    const captureAge=feed?.capturedAt?age(new Date(Number(feed.capturedAt)).toISOString()):'none';
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Travel Acquisition</b><div style="font-size:10px;color:#888;">TornW3B live stock/profit stays in Scout; deeper forecast analytics move to BI.</div></div>'+
        '<div style="display:flex;gap:5px;"><button id="mm-scout-travel-import" style="'+button()+'">Import Capture</button><button id="mm-scout-travel-update" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Update Travel</button></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:5px;">Last browser capture: '+esc(captureAge)+' · Shared travel state: '+esc(age(state.travelIntel?.lastSyncAt))+'</div>'
    )+
    card(rows.length?rows.map((r,i)=>
      '<div style="border-top:1px solid #303030;padding:7px 0;font-size:11px;"><b>#'+(i+1)+' '+esc(r.itemName)+'</b> · '+esc(r.country)+
      '<div>Stock '+Number(r.stock||0).toLocaleString()+' · Profit '+money(r.profit||0)+' · Source profit/hr '+money(r.sourceProfitPerHour||0)+'</div></div>'
    ).join(''):'<div style="font-size:11px;color:#888;">No profitable current travel rows.</div>');
  }

  function settingsHtml(){
    const r=state?.businessRules||{};
    return card(
      '<b>Market Scout Connection</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">The API key is stored only in this userscript\'s Tampermonkey GM storage. It is not copied to shared IndexedDB/localStorage.</div>'+
      '<div style="display:grid;grid-template-columns:1fr auto auto;gap:5px;">'+
        '<input id="mm-scout-api" type="password" autocomplete="off" placeholder="'+(apiKey()?'Torn API key saved — enter to replace':'Torn API key')+'" style="'+inputCss()+'">'+
        '<button id="mm-scout-save-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-scout-clear-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">No background polling is enabled. Network calls occur only after <b>Refresh Opportunities</b> or <b>Verify & Buy</b>.</div>'
    )+
    card(
      '<b>Shared Acquisition Rules</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">These are the same shared rules used by the legacy CRM. Market Scout writes only the Core configuration domain.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;">'+
        '<label style="font-size:10px;color:#aaa;">Min ROI %<input id="mm-scout-rule-min-roi" type="number" min="0" step="0.1" value="'+Number(r.minRoiPct||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min demand/day<input id="mm-scout-rule-min-demand" type="number" min="0" step="0.01" value="'+Number(r.minDemandPerDay||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min buy<input id="mm-scout-rule-min-price" type="number" min="0" value="'+Number(r.minPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max buy<input id="mm-scout-rule-max-price" type="number" min="0" value="'+Number(r.maxPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min profit/unit<input id="mm-scout-rule-min-profit" type="number" min="0" value="'+Number(r.minAbsoluteProfit||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min sellers<input id="mm-scout-rule-min-sellers" type="number" min="0" value="'+Number(r.minSellerCount||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max listing age sec<input id="mm-scout-rule-max-age" type="number" min="30" value="'+Number(r.maxListingAgeSec||180)+'" style="'+inputCss()+'width:100%;"></label>'+
      '</div>'+
      '<button id="mm-scout-save-rules" style="'+button(true)+'margin-top:7px;">Save Shared Rules</button>'
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
        '<div><b style="font-size:15px;">MM Market Scout</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.4 · explicit live actions only</div></div>'+
        '<button id="mm-scout-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;margin-bottom:7px;">'+
          '<button data-scout-view="deals" style="'+button(activeView==='deals')+'">Deals</button>'+
          '<button data-scout-view="travel" style="'+button(activeView==='travel')+'">Travel</button>'+
          '<button data-scout-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div style="padding:5px 7px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<b style="color:#ffaaaa;">Cannot read shared CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>'):'')+
        '<div style="max-height:calc(100vh - 240px);overflow:auto;padding-right:2px;">'+
          (activeView==='settings'?settingsHtml():activeView==='travel'?travelHtml():dealsHtml())+
        '</div>'+
      '</div>';

    root.querySelector('#mm-scout-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-scout-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.scoutView||'deals';render();}));
    root.querySelectorAll('#mm-scout-reload').forEach(b=>b.addEventListener('click',reloadCachedState));
    root.querySelector('#mm-scout-live-refresh')?.addEventListener('click',refreshOpportunities);
    root.querySelector('#mm-scout-travel-update')?.addEventListener('click',updateTravelData);
    root.querySelector('#mm-scout-travel-import')?.addEventListener('click',()=>importTravelCapture({silent:false}).catch(error=>{
      statusText='Travel import failed: '+(error?.message||String(error));
      render();
    }));
    root.querySelectorAll('[data-acquire-item]').forEach(b=>b.addEventListener('click',()=>acquire(b.dataset.acquireItem)));
    root.querySelector('#mm-scout-save-key')?.addEventListener('click',()=>{
      const value=String(root.querySelector('#mm-scout-api')?.value||'').trim();
      if(value)GM_setValue(API_KEY,value);
      statusText=value?'Market Scout API key saved.':'Enter a key to save.';
      render();
    });
    root.querySelector('#mm-scout-clear-key')?.addEventListener('click',()=>{
      GM_deleteValue(API_KEY);
      statusText='Market Scout API key cleared.';
      render();
    });
    root.querySelector('#mm-scout-save-rules')?.addEventListener('click',()=>saveBusinessRules(root).catch(error=>{
      statusText='Could not save rules: '+(error?.message||String(error));
      render();
    }));
  }

  function open(){
    createPanel();
    const root=document.getElementById(ROOT_ID),launcher=document.getElementById(LAUNCHER_ID);
    root.style.display='block';
    if(launcher)launcher.style.display='none';
    render();
    reloadCachedState();
  }

  function close(){
    const root=document.getElementById(ROOT_ID),launcher=document.getElementById(LAUNCHER_ID);
    if(root)root.style.display='none';
    if(launcher)launcher.style.display='block';
  }

  function createLauncher(){
    if(!document.body||document.getElementById(LAUNCHER_ID))return;
    const b=document.createElement('button');
    b.id=LAUNCHER_ID;
    b.textContent='Scout';
    b.style.cssText='position:fixed;right:0;top:205px;z-index:2147483647;'+button(true)+'border-radius:6px 0 0 6px;';
    b.addEventListener('click',open);
    document.body.appendChild(b);
  }

  if(/^(www\.)?weav3r\.dev$/.test(location.hostname)){
    installTravelCollector();
    return;
  }
  if(document.body)createLauncher();
  else window.addEventListener('DOMContentLoaded',createLauncher,{once:true});
})();
