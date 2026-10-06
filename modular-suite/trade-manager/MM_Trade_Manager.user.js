// ==UserScript==
// @name         MM Trade Manager
// @namespace    manic-mike.torn.trade-manager
// @version      0.1.0-alpha.1
// @description  API-confirmed Torn trade valuation, margin history and Inventory reconciliation; final trade actions remain manual.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@b6d2202ad507c6b138919e2d37e461cfc422b382/modular-suite/core/MM_Torn_Core.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@4ef4197cb0fc19e4c29b5864dd4d003732d58deb/modular-suite/inventory-roi/MM_Inventory_ROI.logic.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@e8a1ef84cb5ed0a255fd035351d3a27f08ebb992/modular-suite/trade-manager/MM_Trade_Manager.logic.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='0.1.0-alpha.1';
  const ROOT_ID='mm-trade-manager';
  const LAUNCHER_ID='mm-trade-manager-launcher';
  const STYLE_ID='mm-trade-manager-style';
  const API_KEY='mm_trade_manager_api_v1';
  const API_BASE='https://api.torn.com/v2';
  const MAX_DETAILS_PER_SYNC=12;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornTradeManagerLogic;
  const inventoryLogic=globalThis.MMTornInventoryRoiLogic;
  if(!core||!logic||!inventoryLogic){
    console.error('[MM Trade Manager] Core/Inventory/Trade logic dependency missing.');
    return;
  }

  let state=null;
  let selfProfile=null;
  let ongoingTrades=[];
  let selectedTrade=null;
  let activeView='live';
  let statusText='Ready. Trade reads and completion sync run only when requested.';
  let busy=false;

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=value=>'$'+Math.round(n(value)).toLocaleString();
  const fmt=value=>Math.round(n(value)).toLocaleString();
  const when=value=>{
    const raw=typeof value==='number'?value:Date.parse(value||'');
    const ms=raw>0&&raw<100_000_000_000?raw*1000:raw;
    if(!ms)return 'never';
    const delta=Math.max(0,Date.now()-ms);
    if(delta<60_000)return Math.floor(delta/1000)+'s ago';
    if(delta<3_600_000)return Math.floor(delta/60_000)+'m ago';
    if(delta<86_400_000)return Math.floor(delta/3_600_000)+'h ago';
    return Math.floor(delta/86_400_000)+'d ago';
  };

  async function readSharedState(){
    if(core?.ensureSharedState)return core.ensureSharedState();
    return core.readLegacyState();
  }

  function apiKey(){return String(GM_getValue(API_KEY,'')||'').trim();}
  function saveApiKey(value){
    const key=String(value||'').trim();
    if(key)GM_setValue(API_KEY,key);else GM_deleteValue(API_KEY);
  }

  function requestJson(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20_000,headers:{Accept:'application/json'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status+' from Torn API.'));
          let data;
          try{data=JSON.parse(r.responseText);}catch{return reject(new Error('Torn API returned invalid JSON.'));}
          if(data?.error)return reject(new Error('Torn API '+n(data.error.code)+': '+String(data.error.error||data.error.message||'Unknown error')));
          resolve(data);
        },
        ontimeout:()=>reject(new Error('Torn API request timed out.')),
        onerror:()=>reject(new Error('Torn API network request failed.'))
      });
    });
  }

  function apiV2(path){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Trade Manager API key is not saved.'));
    const url=new URL(API_BASE+String(path||''));
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM Trade Manager');
    return requestJson(url.toString());
  }

  async function ensureProfile(){
    if(selfProfile?.id)return selfProfile;
    const data=await apiV2('/user/basic');
    const p=data?.profile||{};
    const id=String(p?.id||'').trim();
    if(!/^\d+$/.test(id))throw new Error('Torn API did not return the authenticated user ID.');
    selfProfile={id,name:String(p?.name||id)};
    return selfProfile;
  }

  async function listTrades(category){
    const url=new URL(API_BASE+'/user/trades');
    url.searchParams.set('cat',String(category||'ongoing'));
    if(category==='finished'){
      url.searchParams.set('limit','100');
      url.searchParams.set('sort','DESC');
    }
    const key=apiKey();if(!key)throw new Error('Trade Manager API key is not saved.');
    url.searchParams.set('key',key);url.searchParams.set('comment','MM Trade Manager');
    const data=await requestJson(url.toString());
    return Array.isArray(data?.trades)?data.trades:[];
  }

  async function loadTradeDetail(id){
    const tradeId=String(id||'').trim();
    if(!/^\d+$/.test(tradeId))throw new Error('Trade ID is invalid.');
    const data=await apiV2('/user/'+encodeURIComponent(tradeId)+'/trade');
    if(!data?.trade)throw new Error('Torn API returned no detailed trade record.');
    return data.trade;
  }

  function counterpartyFromSummary(row){
    const me=String(selfProfile?.id||'');
    const user=row?.user||{},trader=row?.trader||{};
    const other=String(user?.id||'')===me?trader:user;
    return {id:String(other?.id||''),name:String(other?.name||other?.id||'Unknown')};
  }

  async function refreshLiveTrades(){
    state=await readSharedState();logic.ensureTradeSlice(state);
    await ensureProfile();
    ongoingTrades=await listTrades('ongoing');
    selectedTrade=null;
    return 'Live trades refreshed: '+ongoingTrades.length+' ongoing trade(s). No trade action was taken.';
  }

  async function inspectTrade(id){
    state=await readSharedState();logic.ensureTradeSlice(state);
    const profile=await ensureProfile();
    const detail=await loadTradeDetail(id);
    selectedTrade=logic.evaluateTrade(state,detail,profile.id,Date.now());
    return 'Trade '+selectedTrade.id+' refreshed from Torn API. Review only; final trade actions remain manual.';
  }

  async function syncCompletedTrades(){
    state=await readSharedState();logic.ensureTradeSlice(state);
    const profile=await ensureProfile();
    const summaries=await listTrades('finished');
    const existing=state?.operations?.tradeManager?.trades||{};
    const candidates=summaries.filter(row=>/^\d+$/.test(String(row?.id||''))&&!existing[String(row.id)]).slice(0,MAX_DETAILS_PER_SYNC);
    const records=[];const errors=[];
    for(const summary of candidates){
      try{
        const detail=await loadTradeDetail(summary.id);
        const evaluation=logic.evaluateTrade(state,detail,profile.id,Date.now());
        if(!evaluation.recordable){errors.push('trade '+summary.id+' not API-confirmed completed');continue;}
        records.push(logic.buildCompletedRecord(evaluation,Date.now()));
      }catch(error){errors.push('trade '+String(summary?.id||'?')+': '+String(error?.message||error));}
    }
    let outcome={inserted:0,duplicates:0,conflicts:0,reconciliations:0,checked:records.length};
    if(records.length){
      state=await core.updateDomainState('bazaar',draft=>{
        outcome=logic.recordCompletedTrades(draft,records,Date.now());
        return draft;
      });
    }
    const deferred=Math.max(0,summaries.filter(row=>!existing[String(row?.id||'')]).length-candidates.length);
    return 'Completed sync: '+outcome.inserted+' recorded · '+outcome.reconciliations+' Inventory handoff(s) · '+outcome.conflicts+' conflict(s)'+(errors.length?' · '+errors.length+' rejected/error':'')+(deferred?' · '+deferred+' deferred to next manual sync':'')+'.';
  }

  function button(primary=false){
    return 'border:1px solid '+(primary?'#8769b0':'#555')+';background:'+(primary?'#684b91':'#252525')+';color:#eee;border-radius:5px;padding:5px 8px;cursor:pointer;font:11px Arial,sans-serif;font-weight:'+(primary?'700':'500')+';';
  }
  function card(html){return '<div class="mm-tm-card">'+html+'</div>';}
  function tile(label,value,cls=''){
    return '<span class="mm-tm-tile '+cls+'"><span class="mm-tm-label">'+esc(label)+'</span><span class="mm-tm-value">'+esc(value==null||value===''?'—':value)+'</span></span>';
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=`
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:82px;z-index:2147483646;width:min(880px,calc(100vw - 24px));max-height:calc(100vh - 98px);overflow:hidden;background:#101010;color:#eee;border:1px solid #59466f;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.3 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}.mm-tm-head{height:40px;background:#151515;border-bottom:1px solid #59466f;display:flex;align-items:center;justify-content:space-between;padding:0 7px;gap:6px}
      .mm-tm-body{padding:5px}.mm-tm-tabs,.mm-tm-actions,.mm-tm-tiles{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.mm-tm-scroll{max-height:calc(100vh - 190px);overflow:auto;padding-right:2px}
      .mm-tm-card{border:1px solid #353535;background:#171717;border-radius:6px;padding:7px;margin-bottom:4px}.mm-tm-status{padding:4px 6px;background:#151515;border:1px solid #333;border-radius:4px;color:#b69bd9;margin:4px 0;font-size:10px}
      .mm-tm-muted{font-size:9px;color:#888}.mm-tm-mini{font-size:10px;color:#aaa}.mm-tm-row{display:flex;justify-content:space-between;gap:7px;align-items:flex-start;border-top:1px solid #303030;padding:7px 0}.mm-tm-row:first-child{border-top:0}
      .mm-tm-tile{display:inline-flex;flex-direction:column;gap:1px;min-width:75px;max-width:245px;padding:4px 6px;border:1px solid #353535;background:#121212;border-radius:5px}.mm-tm-label{font-size:8px;color:#777;text-transform:uppercase}.mm-tm-value{font-size:10px;color:#ddd;font-weight:600}
      .mm-tm-good{color:#a7d7ad}.mm-tm-warn{color:#e5c879}.mm-tm-bad{color:#efaaa3}.mm-tm-input{background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:5px 6px;font:11px Arial,sans-serif;min-height:27px}
      @media(max-width:620px){#${ROOT_ID}{right:4px;top:54px;width:calc(100vw - 8px);max-height:calc(100vh - 60px)}.mm-tm-scroll{max-height:calc(100vh - 178px)}}`;
    document.head.appendChild(style);
  }

  function sideHtml(label,side){
    const items=side?.items||[];
    const other=side?.other||[];
    return '<div style="flex:1 1 320px;"><b>'+esc(label)+'</b>'+
      '<div class="mm-tm-mini" style="margin-top:4px;">Cash: <b>'+money(side?.money||0)+'</b></div>'+
      (items.length?items.map(row=>'<div class="mm-tm-mini" style="margin-top:3px;">'+esc(row.itemName)+' ×'+fmt(row.quantity)+' · '+(row.evidence?.usable?money(row.evidence.price)+'/unit':'value unavailable')+' · '+esc(row.evidence?.status||'MISSING')+' / '+esc(row.evidence?.source||'shared market')+'</div>').join(''):'<div class="mm-tm-muted" style="margin-top:3px;">No item entries.</div>')+
      (other.length?'<div class="mm-tm-warn" style="font-size:10px;margin-top:4px;">Unsupported non-item assets: '+esc(other.map(x=>x.type).join(', '))+'. Margin is withheld.</div>':'')+
      '</div>';
  }

  function evaluationHtml(e){
    if(!e)return '';
    const v=e.valuation||{};
    const marginText=v.margin==null?'—':(v.margin>=0?'+':'-')+money(Math.abs(v.margin));
    const balanceText=v.referenceBalance==null?'—':(v.referenceBalance>=0?'+':'-')+money(Math.abs(v.referenceBalance));
    const marginCls=v.margin==null?'mm-tm-warn':v.margin>=0?'mm-tm-good':'mm-tm-bad';
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;"><div><b>Trade '+esc(e.id)+' · '+esc(e.counterparty?.name||e.counterparty?.id||'Unknown')+'</b><div class="mm-tm-muted">'+esc(e.status)+' · '+(e.completedAt?'completed '+esc(when(e.completedAt)):e.expiresAt?'expires '+new Date(e.expiresAt).toLocaleString():'completion not established')+'</div></div><div class="mm-tm-mini">'+esc(e.description||'')+'</div></div>'+
      '<div class="mm-tm-tiles" style="margin-top:6px;">'+
        tile('VALUATION',v.status||'UNKNOWN',v.status==='READY'?'mm-tm-good':'mm-tm-warn')+
        tile('FIFO COST',money(v.costBasis||0))+
        tile('COST COVERAGE',Number(v.costCoveragePct||0).toFixed(0)+'%')+
        tile('NET CASH',(v.netCash>=0?'+':'-')+money(Math.abs(v.netCash||0)))+
        tile('REF BALANCE',balanceText,v.referenceBalance==null?'mm-tm-warn':v.referenceBalance>=0?'mm-tm-good':'mm-tm-bad')+
        tile('MARGIN',marginText,marginCls)+
        tile('MARGIN TYPE',v.marginKind||'UNAVAILABLE')+
      '</div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:7px;">'+sideHtml('You supply',e.supplied)+sideHtml('You receive',e.received)+'</div>'+
      '<div class="mm-tm-mini" style="margin-top:7px;">Market values are shared cached evidence only; stale/missing evidence blocks affected valuation. FIFO cost is the current Inventory Manager remaining-lot basis, not a fabricated historical cost snapshot.</div>'+
      (e.recordable?'<div class="mm-tm-good" style="font-size:10px;margin-top:4px;">Official API completion evidence is present. This trade is eligible for completed-history sync.</div>':'<div class="mm-tm-warn" style="font-size:10px;margin-top:4px;">Not recordable as completed. No completion will be inferred from navigation, UI state, or item movement.</div>')
    );
  }

  function liveHtml(){
    const profile=selfProfile?selfProfile.name+' ['+selfProfile.id+']':'API identity not loaded';
    return card('<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;"><div><b>Live trades</b><div class="mm-tm-muted">'+esc(profile)+' · Torn API v2 ongoing trades. Read/valuation only.</div></div><button id="mm-tm-refresh-live" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Live Trades</button></div>')+
      (ongoingTrades.length?card(ongoingTrades.map(row=>{const other=counterpartyFromSummary(row);return '<div class="mm-tm-row"><div><b>'+esc(row.description||('Trade '+row.id))+'</b><div class="mm-tm-mini">API trade '+esc(row.id)+' · '+esc(other.name)+' · modified '+esc(when(row.modified_at||0))+(row.expires_at?' · expires '+new Date(Number(row.expires_at)*1000).toLocaleString():'')+'</div></div><button data-trade-inspect="'+esc(row.id)+'" style="'+button()+'">Inspect</button></div>';}).join('')):card('<div class="mm-tm-muted">No live trade list loaded. Press Refresh Live Trades.</div>'))+
      evaluationHtml(selectedTrade);
  }

  function historyHtml(){
    logic.ensureTradeSlice(state||{});
    const rows=logic.historyRows(state||{});
    const tm=state?.operations?.tradeManager||{};
    return card('<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;"><div><b>Confirmed trade history</b><div class="mm-tm-muted">Only official Torn API finished trades with completed_at are stored. History is bounded to '+logic.MAX_TRADE_HISTORY+'.</div></div><button id="mm-tm-sync-completed" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Sync Completed</button></div><div class="mm-tm-mini" style="margin-top:5px;">Last sync '+esc(when(tm.lastSyncAt||''))+' · '+rows.length+' stored · '+Number(tm.conflicts?.length||0)+' conflict(s).</div>')+
      (rows.length?rows.slice(0,60).map(row=>{
        const v=row.valuation||{};const margin=v.margin;
        return card('<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;"><div><b>'+esc(row.counterparty?.name||row.counterparty?.id||'Unknown')+'</b> · trade '+esc(row.id)+'<div class="mm-tm-mini">'+new Date(Number(row.completedAt)).toLocaleString()+' · '+esc(row.description||'')+'</div></div><div style="text-align:right;"><b class="'+(margin==null?'mm-tm-warn':margin>=0?'mm-tm-good':'mm-tm-bad')+'">'+(margin==null?'margin unavailable':(margin>=0?'+':'-')+money(Math.abs(margin)))+'</b><div class="mm-tm-muted">'+esc(v.marginKind||'UNAVAILABLE')+' · Inventory handoff pending/recorded separately</div></div></div>');
      }).join(''):card('<div class="mm-tm-muted">No confirmed trade history stored yet.</div>'));
  }

  function settingsHtml(){
    const saved=Boolean(apiKey());
    return card('<b>Torn API</b><div class="mm-tm-muted">Requires a limited-access key for official user trade endpoints. The key stays in this userscript\'s Tampermonkey storage.</div><div class="mm-tm-actions" style="margin-top:7px;"><input id="mm-tm-api" class="mm-tm-input" type="password" autocomplete="off" placeholder="'+(saved?'API key saved — enter to replace':'Torn limited-access API key')+'" style="flex:1 1 260px;min-width:180px;"><button id="mm-tm-save-api" style="'+button(true)+'">Save</button><button id="mm-tm-clear-api" style="'+button()+'">Clear</button></div><div class="mm-tm-mini" style="margin-top:6px;">Trade Manager does not accept trades, finalize trades, transfer assets, collect market data, or maintain a second inventory database. The active Trade Chat Assistant remains a separate chat/forum workflow.</div>');
  }

  function render(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    const view=activeView==='history'?historyHtml():activeView==='settings'?settingsHtml():liveHtml();
    root.innerHTML='<div class="mm-tm-head"><div><b style="font-size:14px;">MM Trade Manager</b><div class="mm-tm-muted">v'+VERSION+' · TRADE / VALUE / RECORD</div></div><button id="mm-tm-close" style="'+button()+'">×</button></div><div class="mm-tm-body"><div class="mm-tm-tabs"><button data-view="live" style="'+button(activeView==='live')+'">Live Trades</button><button data-view="history" style="'+button(activeView==='history')+'">History</button><button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button></div><div class="mm-tm-status">'+esc(busy?'Working…':statusText)+'</div><div class="mm-tm-scroll">'+view+'</div></div>';
    core.makePanelDraggable?.(root,root.querySelector('.mm-tm-head'),'trade-manager',window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'82px'});bind();
  }

  function bind(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    root.querySelector('#mm-tm-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'live';selectedTrade=null;render();}));
    const run=async(label,fn)=>{if(busy)return;busy=true;statusText=label;render();try{statusText=await fn();}catch(error){statusText=error?.message||String(error);}finally{busy=false;render();}};
    root.querySelector('#mm-tm-refresh-live')?.addEventListener('click',()=>run('Refreshing official ongoing trades…',refreshLiveTrades));
    root.querySelectorAll('[data-trade-inspect]').forEach(b=>b.addEventListener('click',()=>run('Loading detailed trade…',()=>inspectTrade(b.dataset.tradeInspect))));
    root.querySelector('#mm-tm-sync-completed')?.addEventListener('click',()=>run('Syncing API-confirmed completed trades…',syncCompletedTrades));
    root.querySelector('#mm-tm-save-api')?.addEventListener('click',()=>{const value=root.querySelector('#mm-tm-api')?.value||'';saveApiKey(value);selfProfile=null;statusText=value.trim()?'Trade Manager API key saved locally.':'Enter an API key first.';render();});
    root.querySelector('#mm-tm-clear-api')?.addEventListener('click',()=>{saveApiKey('');selfProfile=null;ongoingTrades=[];selectedTrade=null;statusText='Trade Manager API key cleared.';render();});
  }

  function createPanel(){
    injectStyle();let root=document.getElementById(ROOT_ID);if(root)return root;
    root=document.createElement('section');root.id=ROOT_ID;document.body.appendChild(root);return root;
  }

  async function open(){
    createPanel();const root=document.getElementById(ROOT_ID);root.style.display='block';core.setDockLauncherActive?.('trade-manager',true);
    try{state=await readSharedState();logic.ensureTradeSlice(state);statusText='Ready. Refresh Live Trades or Sync Completed when needed.';}catch(error){statusText=error?.message||String(error);}render();
  }
  function close(){const root=document.getElementById(ROOT_ID);if(root)root.style.display='none';core.setDockLauncherActive?.('trade-manager',false);}

  function createLauncher(){
    if(!document.body)return;injectStyle();
    if(core.registerDockLauncher&&!globalThis.__MM_TORN_PDA__){
      const b=core.registerDockLauncher({id:'trade-manager',label:'MM Trade Manager',accent:'#76559b',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4zM8 7V5h8v2M8 12h8M12 9v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',onClick:()=>{const root=document.getElementById(ROOT_ID);if(root&&root.style.display!=='none')close();else open();}});
      if(b)b.id=LAUNCHER_ID;core.adoptLegacyCrmLauncher?.();return;
    }
    if(document.getElementById(LAUNCHER_ID))return;
    const b=document.createElement('button');b.id=LAUNCHER_ID;b.type='button';b.title='MM Trade Manager';b.setAttribute('aria-label','MM Trade Manager');
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px;display:block;"><path d="M4 7h16v10H4zM8 7V5h8v2M8 12h8M12 9v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    b.style.cssText='position:fixed;right:10px;bottom:86px;z-index:2147483647;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;border:1px solid #59466f;border-radius:5px;background:#684b91;color:#eee;box-shadow:0 2px 8px #000a;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    b.addEventListener('click',()=>{const root=document.getElementById(ROOT_ID);if(root&&root.style.display!=='none')close();else open();});document.body.appendChild(b);
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined')return;
    try{const channel=new BroadcastChannel('mm_bazaar_crm_cross_tab_v1');channel.addEventListener('message',event=>{if(event?.data?.type!=='state-updated')return;if(document.getElementById(ROOT_ID)?.style.display==='none')return;readSharedState().then(next=>{state=next;render();}).catch(()=>{});});}catch{}
  }

  globalThis.__MM_TRADE_MANAGER_OPEN__=open;
  function initialize(){createLauncher();installChannel();}
  if(document.body)initialize();else window.addEventListener('DOMContentLoaded',initialize,{once:true});
})();