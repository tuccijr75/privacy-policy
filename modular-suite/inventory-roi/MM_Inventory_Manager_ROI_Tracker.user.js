// ==UserScript==
// @name         MM_Inventory Manager/ROI Tracker
// @namespace    manic-mike.torn.inventory-roi
// @version      8.0.0-alpha.2
// @description  Dedicated personal inventory, Bazaar listing guidance, sales velocity and FIFO ROI tracking.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.4
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/inventory-roi/MM_Inventory_ROI.logic.js?v=8.0.0-alpha.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='8.0.0-alpha.2';
  const ROOT_ID='mm-inventory-roi';
  const LAUNCHER_ID='mm-inventory-roi-launcher';
  const STYLE_ID='mm-inventory-roi-style';
  const API_KEY='mm_inventory_roi_api_v1';
  const SHOP_NAME="MANIC'S MAD HOUSE";
  const OWNER_NAME='Manic-Mike';
  const OWNER_ID='4325346';
  const API_BASE='https://api.torn.com/v2';
  const SALES_LOOKBACK_MS=72*60*60*1000;
  const MAX_LOG_PAGES=25;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornInventoryRoiLogic;
  if(!core||!logic){
    console.error('[MM Inventory Manager/ROI Tracker] Core/logic dependency missing.');
    return;
  }

  let state=null;
  let activeView='inventory';
  let statusText='Ready.';
  let busy=false;

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=value=>'$'+Math.round(n(value)).toLocaleString();
  const fmt=value=>Math.round(n(value)).toLocaleString();
  const when=value=>{
    const ms=typeof value==='number'?value:Date.parse(value||'');
    if(!ms)return 'never';
    const delta=Math.max(0,Date.now()-ms);
    if(delta<60_000)return Math.floor(delta/1000)+'s ago';
    if(delta<3_600_000)return Math.floor(delta/60_000)+'m ago';
    if(delta<86_400_000)return Math.floor(delta/3_600_000)+'h ago';
    return Math.floor(delta/86_400_000)+'d ago';
  };

  function button(primary=false){
    return 'border:1px solid '+(primary?'#237c91':'#555')+';background:'+(primary?'#2f879a':'#252525')+
      ';color:#eee;border-radius:5px;padding:5px 8px;cursor:pointer;font:11px Arial,sans-serif;font-weight:'+(primary?'700':'500')+';';
  }
  function card(html){return '<div class="mm-ir-card">'+html+'</div>';}
  function tile(label,value,cls=''){
    return '<span class="mm-ir-tile '+cls+'"><span class="mm-ir-label">'+esc(label)+'</span><span class="mm-ir-value">'+esc(value==null||value===''?'—':value)+'</span></span>';
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:82px;z-index:2147483646;width:min(900px,calc(100vw - 24px));max-height:calc(100vh - 98px);overflow:hidden;background:#101010;color:#eee;border:1px solid #315e69;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.25 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button{min-height:26px;height:auto;line-height:1.05;padding:5px 8px;font-size:11px}
      .mm-ir-head{height:40px;background:#151515;border-bottom:1px solid #315e69;display:flex;align-items:center;justify-content:space-between;padding:0 7px;gap:6px}
      .mm-ir-body{padding:5px}
      .mm-ir-tabs,.mm-ir-actions,.mm-ir-tiles{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
      .mm-ir-scroll{max-height:calc(100vh - 190px);overflow:auto;padding-right:2px}
      .mm-ir-card{border:1px solid #353535;background:#171717;border-radius:6px;padding:6px;margin-bottom:4px}
      .mm-ir-row{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;border-top:1px solid #303030;padding:5px 0}
      .mm-ir-row:first-child{border-top:0}
      .mm-ir-main{min-width:0;flex:1 1 auto}
      .mm-ir-muted{font-size:9px;color:#888}
      .mm-ir-mini{font-size:10px;color:#aaa}
      .mm-ir-status{padding:4px 6px;background:#151515;border:1px solid #333;border-radius:4px;color:#67c9d9;margin:4px 0;font-size:10px}
      .mm-ir-input{background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:5px 6px;font:11px Arial,sans-serif;min-height:27px}
      .mm-ir-tile{display:inline-flex;flex-direction:column;gap:1px;min-width:58px;max-width:240px;padding:4px 6px;border:1px solid #353535;background:#121212;border-radius:5px}
      .mm-ir-label{font-size:8px;line-height:1;color:#777;text-transform:uppercase;letter-spacing:.25px}
      .mm-ir-value{font-size:10px;line-height:1.15;color:#ddd;font-weight:600}
      .mm-ir-good{color:#a7d7ad}.mm-ir-warn{color:#e5c879}.mm-ir-bad{color:#efaaa3}
      .mm-ir-member{border:1px solid #353535;background:#171717;border-radius:6px;margin-bottom:3px}
      .mm-ir-member>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;min-height:27px}
      .mm-ir-member>summary::-webkit-details-marker{display:none}
      .mm-ir-member>summary:before{content:'▸';color:#777;font-size:10px}.mm-ir-member[open]>summary:before{content:'▾'}
      .mm-ir-detail{border-top:1px solid #303030;padding:5px 7px}
      @media(max-width:620px){#${ROOT_ID}{right:4px;top:54px;width:calc(100vw - 8px);max-height:calc(100vh - 60px)}.mm-ir-scroll{max-height:calc(100vh - 178px)}}
    `;
    document.head.appendChild(style);
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

  function apiV2(pathOrUrl){
    const key=apiKey();if(!key)return Promise.reject(new Error('Inventory/ROI API key is not saved.'));
    const url=new URL(String(pathOrUrl).startsWith('http')?pathOrUrl:API_BASE+pathOrUrl);
    url.searchParams.set('key',key);url.searchParams.set('comment','MM Inventory Manager/ROI Tracker');
    return requestJson(url.toString());
  }

  function apiV1(selection){
    const key=apiKey();if(!key)return Promise.reject(new Error('Inventory/ROI API key is not saved.'));
    const url=new URL('https://api.torn.com/user/');
    url.searchParams.set('selections',String(selection||''));url.searchParams.set('key',key);url.searchParams.set('comment','MM Inventory Manager/ROI Tracker');
    return requestJson(url.toString());
  }

  function nextUrlFromMetadata(data){
    const next=data?._metadata?.links?.next??data?.metadata?.links?.next??data?._metadata?.next??data?.pagination?.next??null;
    if(typeof next!=='string'||!next.trim())return '';
    try{return new URL(next,API_BASE+'/').toString();}catch{return '';}
  }

  function logRows(data){
    const raw=data?.log??data?.logs??data?.data?.log??data?.data?.logs??null;
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,row])=>({id:row?.id??row?.log_id??id,...(row&&typeof row==='object'?row:{})}));
    return [];
  }

  async function fetchSalesLogs(fromSeconds,maxPages=MAX_LOG_PAGES){
    const all=[];const seen=new Set();
    let url=new URL(API_BASE+'/user/log');
    url.searchParams.set('log',String(logic.BAZAAR_SELL_LOG_ID));
    url.searchParams.set('from',String(Math.floor(fromSeconds)));
    url.searchParams.set('limit','100');
    url.searchParams.set('key',apiKey());
    url.searchParams.set('comment','MM Inventory Manager/ROI Tracker');
    let pages=0;
    while(url&&pages<maxPages){
      const clean=url.toString();
      if(seen.has(clean))throw new Error('Torn log pagination loop detected.');
      seen.add(clean);
      const data=await requestJson(clean);
      all.push(...logRows(data));
      pages++;
      const next=nextUrlFromMetadata(data);
      url=next?new URL(next):null;
    }
    if(url)throw new Error('Sales history exceeded '+maxPages+' page safety limit.');
    return all;
  }

  async function reloadState(){
    state=await core.readLegacyState();
    render();
  }

  async function updateInventoryState(mutator){
    await core.updateDomainState('bazaar',draft=>{
      logic.ensureInventorySlice(draft);
      const out=mutator(draft);
      return out===undefined?draft:out;
    });
    state=await core.readLegacyState();
  }

  async function refreshSales(){
    if(!apiKey())throw new Error('Save a Torn API key in Settings first.');
    const rows=await fetchSalesLogs((Date.now()-SALES_LOOKBACK_MS)/1000);
    let result=null;
    await updateInventoryState(draft=>{result=logic.importSalesEntries(draft,rows);return draft;});
    return result;
  }

  async function refreshShop(){
    if(!apiKey())throw new Error('Save a Torn API key in Settings first.');
    const [bazaarResult,inventoryResult]=await Promise.allSettled([apiV1('bazaar'),apiV1('inventory')]);
    if(bazaarResult.status!=='fulfilled'&&inventoryResult.status!=='fulfilled'){
      throw new Error('Bazaar and inventory refresh both failed: '+String(bazaarResult.reason?.message||'Bazaar error')+'; '+String(inventoryResult.reason?.message||'Inventory error'));
    }
    await updateInventoryState(draft=>{
      const payload={at:new Date().toISOString()};
      if(bazaarResult.status==='fulfilled')payload.bazaar=bazaarResult.value?.bazaar??[];
      if(inventoryResult.status==='fulfilled')payload.inventory=inventoryResult.value?.inventory??inventoryResult.value?.items??[];
      logic.updateShopSnapshot(draft,payload);
      draft.operations.inventoryRoi.lastShopRefresh={
        at:payload.at,
        bazaarOk:bazaarResult.status==='fulfilled',
        inventoryOk:inventoryResult.status==='fulfilled',
        bazaarError:bazaarResult.status==='rejected'?String(bazaarResult.reason?.message||bazaarResult.reason):'',
        inventoryError:inventoryResult.status==='rejected'?String(inventoryResult.reason?.message||inventoryResult.reason):''
      };
      return draft;
    });
    return {bazaarOk:bazaarResult.status==='fulfilled',inventoryOk:inventoryResult.status==='fulfilled'};
  }

  async function copyText(value){
    const text=String(value||'');
    try{await navigator.clipboard.writeText(text);return true;}catch{}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);
    area.select();let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();return ok;
  }

  function inventoryHtml(){
    const slice=state||{};logic.ensureInventorySlice(slice);
    const bm=slice.operations?.inventoryRoi||{};const rows=logic.inventoryRoiRows(slice);const sales=Object.values(slice.sales||{});
    const revenue30=sales.filter(s=>n(s.timestamp)>=Date.now()-30*86400000).reduce((sum,s)=>sum+n(s.total),0);
    const gross30=rows.reduce((sum,row)=>sum+n(row.realizedGrossProfit30),0),cogs30=rows.reduce((sum,row)=>sum+n(row.realizedCogs30),0),roi30=cogs30>0?gross30/cogs30*100:0;
    const shop=bm.lastShopRefresh||{};
    return card(
      '<div class="mm-ir-actions" style="justify-content:space-between;">'+
        '<div><b>Inventory / ROI</b><div class="mm-ir-muted">Bazaar '+Object.keys(bm.listings||{}).length+' SKU(s) · personal '+Object.keys(bm.inventory||{}).length+' SKU(s) · shop '+when(bm.lastBazaarAt)+' · sales '+when(bm.lastSalesAt)+' · purchases '+when(slice.procurement?.lastAcquisitionSyncAt)+'</div></div>'+
        '<div class="mm-ir-actions"><button id="mm-ir-refresh-shop" style="'+button(true)+'">Refresh Shop</button><button id="mm-ir-refresh-sales" style="'+button()+'">Refresh Sales</button><button id="mm-ir-open-bazaar" style="'+button()+'">Open Bazaar</button></div>'+
      '</div>'+
      '<div class="mm-ir-tiles" style="margin-top:5px;">'+tile('30D REVENUE',money(revenue30))+tile('30D GROSS',money(gross30),gross30>=0?'mm-ir-good':'mm-ir-bad')+tile('REALIZED ROI',cogs30?roi30.toFixed(1)+'%':'—')+tile('ACQ LOTS',fmt(slice.procurement?.acquisitions?.length||0))+(shop.inventoryError?tile('INVENTORY','API unavailable','mm-ir-warn'):'')+'</div>'
    )+
    (rows.length?rows.map(row=>'<details class="mm-ir-member"><summary><span><b>'+esc(row.name)+'</b> <span class="'+(row.action==='LIST'||row.action==='TOP UP'?'mm-ir-warn':'mm-ir-muted')+'">'+esc(row.action)+'</span></span><span class="mm-ir-muted">'+fmt(row.bazaarQty)+' listed · '+row.daily30.toFixed(2)+'/day · '+(row.avgCost?row.currentRoiPct.toFixed(1)+'% current ROI':'no cost basis')+'</span></summary>'+
      '<div class="mm-ir-detail"><div class="mm-ir-tiles">'+tile('BAZAAR QTY',fmt(row.bazaarQty))+tile('BAZAAR PRICE',row.bazaarPrice?money(row.bazaarPrice):'—')+tile('PERSONAL QTY',fmt(row.personalQty))+tile('SOLD 7D',fmt(row.units7d))+tile('SOLD 30D',fmt(row.units30d))+tile('3D TARGET',fmt(row.targetListed))+tile('ADD',fmt(row.addToBazaar),row.addToBazaar?'mm-ir-warn':'')+tile('RECENT AVG',row.avgSoldPrice30?money(row.avgSoldPrice30):'—')+tile('PLAN PRICE',row.plannedPrice?money(row.plannedPrice):'—')+tile('FIFO AVG COST',row.avgCost?money(row.avgCost):'—')+tile('CURRENT ROI',row.avgCost?row.currentRoiPct.toFixed(1)+'%':'—',row.currentRoiPct>=0?'mm-ir-good':'mm-ir-bad')+tile('30D GROSS',row.realizedCogs30?money(row.realizedGrossProfit30):'—',row.realizedGrossProfit30>=0?'mm-ir-good':'mm-ir-bad')+tile('30D ROI',row.realizedCogs30?row.realizedRoiPct30.toFixed(1)+'%':'—')+tile('COST COVERAGE',row.costCoveragePct30.toFixed(0)+'%')+'</div></div></details>').join(''):card('No Bazaar/inventory rows are cached. Use Refresh Shop.'));
  }

          function settingsHtml(){
    const saved=Boolean(apiKey());
    return card('<b>Torn API</b><div class="mm-ir-muted">MM Inventory Manager/ROI Tracker keeps its key in this userscript\'s Tampermonkey storage only.</div>'+
      '<div class="mm-ir-actions" style="margin-top:6px;"><input id="mm-ir-api" class="mm-ir-input" type="password" autocomplete="off" placeholder="'+(saved?'API key saved — enter to replace':'Torn API key')+'" style="flex:1 1 260px;min-width:180px;"><button id="mm-ir-save-api" style="'+button(true)+'">Save</button><button id="mm-ir-clear-api" style="'+button()+'">Clear</button></div>'+
      '<div class="mm-ir-mini" style="margin-top:5px;">Purpose: User Log 1226 plus your own Bazaar/Inventory selections. ROI reads the shared acquisition ledger maintained by MM_Acquisitions and uses FIFO matching against item-level sales. No acquisition purchasing occurs in this script.</div>');
  }

  function render(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    const view=activeView==='inventory'?inventoryHtml():settingsHtml();
    root.innerHTML='<div class="mm-ir-head"><div><b style="font-size:14px;">MM_Inventory Manager/ROI Tracker</b><div class="mm-ir-muted">v'+VERSION+' · INVENTORY / LISTING / ROI</div></div><button id="mm-ir-close" style="'+button()+'">×</button></div>'+
      '<div class="mm-ir-body"><div class="mm-ir-tabs"><button data-view="inventory" style="'+button(activeView==='inventory')+'">Inventory / ROI</button><button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button></div><div class="mm-ir-status">'+esc(busy?'Working…':statusText)+'</div><div class="mm-ir-scroll">'+view+'</div></div>';
    core.makePanelDraggable?.(root,root.querySelector('.mm-ir-head'),'inventory-roi',window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'82px'});bind();
  }

  function bind(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    root.querySelector('#mm-ir-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'inventory';render();}));
    const run=async(label,fn)=>{if(busy)return;busy=true;statusText=label;render();try{const result=await fn();statusText=typeof result==='string'?result:'Done.';}catch(error){statusText=error?.message||String(error);}finally{busy=false;render();}};
    root.querySelector('#mm-ir-refresh-sales')?.addEventListener('click',()=>run('Refreshing sales history…',async()=>{const r=await refreshSales();return 'Sales refreshed: '+r.imported+' new · '+r.checked+' checked'+(r.rejected?' · '+r.rejected+' rejected':'')+'.';}));
    root.querySelector('#mm-ir-refresh-shop')?.addEventListener('click',()=>run('Refreshing Bazaar and inventory…',async()=>{const r=await refreshShop();return 'Shop refreshed: Bazaar '+(r.bazaarOk?'OK':'failed')+' · Inventory '+(r.inventoryOk?'OK':'failed')+'.';}));
    root.querySelector('#mm-ir-open-bazaar')?.addEventListener('click',()=>{location.href='https://www.torn.com/bazaar.php';});
    root.querySelector('#mm-ir-save-api')?.addEventListener('click',()=>{const value=root.querySelector('#mm-ir-api')?.value||'';saveApiKey(value);statusText=value.trim()?'Inventory/ROI API key saved locally.':'Enter an API key first.';render();});
    root.querySelector('#mm-ir-clear-api')?.addEventListener('click',()=>{saveApiKey('');statusText='Inventory/ROI API key cleared.';render();});
  }

  function createPanel(){
    injectStyle();
    let root=document.getElementById(ROOT_ID);
    if(root)return root;
    root=document.createElement('section');root.id=ROOT_ID;document.body.appendChild(root);
    return root;
  }

  function open(){
    createPanel();
    const root=document.getElementById(ROOT_ID);root.style.display='block';
    core.setDockLauncherActive?.('inventory-roi',true);
    reloadState().catch(error=>{statusText=error?.message||String(error);render();});
  }
  function close(){
    const root=document.getElementById(ROOT_ID);if(root)root.style.display='none';
    core.setDockLauncherActive?.('inventory-roi',false);
  }

  function createLauncher(){
    if(!document.body)return;injectStyle();
    if(core.registerDockLauncher){
      const b=core.registerDockLauncher({id:'inventory-roi',label:'MM_Inventory Manager/ROI Tracker',accent:'#6b6f86',
        icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v4H4zM5 10h14v9H5zM8 14h3M14 15l2-2 2 1.5 2-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        onClick:()=>{const root=document.getElementById(ROOT_ID);if(root&&root.style.display!=='none')close();else open();}});
      if(b)b.id=LAUNCHER_ID;core.adoptLegacyCrmLauncher?.();return;
    }
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined')return;
    try{
      const channel=new BroadcastChannel('mm_bazaar_crm_cross_tab_v1');
      channel.addEventListener('message',event=>{
        if(event?.data?.type!=='state-updated')return;
        if(document.getElementById(ROOT_ID)?.style.display==='none')return;
        reloadState().catch(()=>{});
      });
    }catch{}
  }

  if(document.body){
    createLauncher();installChannel();
  }else{
    window.addEventListener('DOMContentLoaded',()=>{createLauncher();installChannel();},{once:true});
  }
})();