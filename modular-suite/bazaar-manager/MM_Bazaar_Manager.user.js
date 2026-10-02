// ==UserScript==
// @name         MM Torn Bazaar Manager
// @namespace    manic-mike.torn.bazaar-manager
// @version      8.0.0-alpha.1
// @description  Focused Bazaar selling, listings, customers, coupons, refunds and restock alerts.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.4
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/bazaar-manager/MM_Bazaar_Manager.logic.js?v=8.0.0-alpha.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='8.0.0-alpha.1';
  const ROOT_ID='mm-bazaar-manager';
  const LAUNCHER_ID='mm-bazaar-manager-launcher';
  const STYLE_ID='mm-bazaar-manager-style';
  const API_KEY='mm_bazaar_manager_api_v1';
  const SHOP_NAME="MANIC'S MAD HOUSE";
  const OWNER_NAME='Manic-Mike';
  const OWNER_ID='4325346';
  const API_BASE='https://api.torn.com/v2';
  const SALES_LOOKBACK_MS=72*60*60*1000;
  const MAX_LOG_PAGES=25;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornBazaarLogic;
  if(!core||!logic){
    console.error('[MM Bazaar Manager] Core/logic dependency missing.');
    return;
  }

  let state=null;
  let activeView='sell';
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
  function card(html){return '<div class="mm-bm-card">'+html+'</div>';}
  function tile(label,value,cls=''){
    return '<span class="mm-bm-tile '+cls+'"><span class="mm-bm-label">'+esc(label)+'</span><span class="mm-bm-value">'+esc(value==null||value===''?'—':value)+'</span></span>';
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:82px;z-index:2147483646;width:min(900px,calc(100vw - 24px));max-height:calc(100vh - 98px);overflow:hidden;background:#101010;color:#eee;border:1px solid #315e69;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.25 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button{min-height:26px;height:auto;line-height:1.05;padding:5px 8px;font-size:11px}
      .mm-bm-head{height:40px;background:#151515;border-bottom:1px solid #315e69;display:flex;align-items:center;justify-content:space-between;padding:0 7px;gap:6px}
      .mm-bm-body{padding:5px}
      .mm-bm-tabs,.mm-bm-actions,.mm-bm-tiles{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
      .mm-bm-scroll{max-height:calc(100vh - 190px);overflow:auto;padding-right:2px}
      .mm-bm-card{border:1px solid #353535;background:#171717;border-radius:6px;padding:6px;margin-bottom:4px}
      .mm-bm-row{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;border-top:1px solid #303030;padding:5px 0}
      .mm-bm-row:first-child{border-top:0}
      .mm-bm-main{min-width:0;flex:1 1 auto}
      .mm-bm-muted{font-size:9px;color:#888}
      .mm-bm-mini{font-size:10px;color:#aaa}
      .mm-bm-status{padding:4px 6px;background:#151515;border:1px solid #333;border-radius:4px;color:#67c9d9;margin:4px 0;font-size:10px}
      .mm-bm-input{background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:5px 6px;font:11px Arial,sans-serif;min-height:27px}
      .mm-bm-tile{display:inline-flex;flex-direction:column;gap:1px;min-width:58px;max-width:240px;padding:4px 6px;border:1px solid #353535;background:#121212;border-radius:5px}
      .mm-bm-label{font-size:8px;line-height:1;color:#777;text-transform:uppercase;letter-spacing:.25px}
      .mm-bm-value{font-size:10px;line-height:1.15;color:#ddd;font-weight:600}
      .mm-bm-good{color:#a7d7ad}.mm-bm-warn{color:#e5c879}.mm-bm-bad{color:#efaaa3}
      .mm-bm-member{border:1px solid #353535;background:#171717;border-radius:6px;margin-bottom:3px}
      .mm-bm-member>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;min-height:27px}
      .mm-bm-member>summary::-webkit-details-marker{display:none}
      .mm-bm-member>summary:before{content:'▸';color:#777;font-size:10px}.mm-bm-member[open]>summary:before{content:'▾'}
      .mm-bm-detail{border-top:1px solid #303030;padding:5px 7px}
      @media(max-width:620px){#${ROOT_ID}{right:4px;top:54px;width:calc(100vw - 8px);max-height:calc(100vh - 60px)}.mm-bm-scroll{max-height:calc(100vh - 178px)}}
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
    const key=apiKey();if(!key)return Promise.reject(new Error('Bazaar Manager API key is not saved.'));
    const url=new URL(String(pathOrUrl).startsWith('http')?pathOrUrl:API_BASE+pathOrUrl);
    url.searchParams.set('key',key);url.searchParams.set('comment','MM Bazaar Manager');
    return requestJson(url.toString());
  }

  function apiV1(selection){
    const key=apiKey();if(!key)return Promise.reject(new Error('Bazaar Manager API key is not saved.'));
    const url=new URL('https://api.torn.com/user/');
    url.searchParams.set('selections',String(selection||''));url.searchParams.set('key',key);url.searchParams.set('comment','MM Bazaar Manager');
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
    url.searchParams.set('comment','MM Bazaar Manager');
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

  async function updateBazaar(mutator){
    await core.updateDomainState('bazaar',draft=>{
      logic.ensureBazaarSlice(draft);
      const out=mutator(draft);
      return out===undefined?draft:out;
    });
    state=await core.readLegacyState();
  }

  async function refreshSales(){
    if(!apiKey())throw new Error('Save a Torn API key in Settings first.');
    const rows=await fetchSalesLogs((Date.now()-SALES_LOOKBACK_MS)/1000);
    let result=null;
    await updateBazaar(draft=>{result=logic.importSalesEntries(draft,rows);return draft;});
    return result;
  }

  async function refreshShop(){
    if(!apiKey())throw new Error('Save a Torn API key in Settings first.');
    const [bazaarResult,inventoryResult]=await Promise.allSettled([apiV1('bazaar'),apiV1('inventory')]);
    if(bazaarResult.status!=='fulfilled'&&inventoryResult.status!=='fulfilled'){
      throw new Error('Bazaar and inventory refresh both failed: '+String(bazaarResult.reason?.message||'Bazaar error')+'; '+String(inventoryResult.reason?.message||'Inventory error'));
    }
    await updateBazaar(draft=>{
      const payload={at:new Date().toISOString()};
      if(bazaarResult.status==='fulfilled')payload.bazaar=bazaarResult.value?.bazaar??[];
      if(inventoryResult.status==='fulfilled')payload.inventory=inventoryResult.value?.inventory??inventoryResult.value?.items??[];
      logic.updateShopSnapshot(draft,payload);
      draft.operations.bazaarManager.lastShopRefresh={
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

  async function copyAndOpenMessage(playerId,subject,body){
    await copyText('Subject: '+subject+'\n\n'+body);
    statusText='Message copied. Torn composer is opening; sending remains manual.';
    render();
    setTimeout(()=>{location.href='https://www.torn.com/messages.php#/p=compose&XID='+encodeURIComponent(String(playerId));},80);
  }

  function customerMessage(customer,coupon,reminder=false){
    const name=String(customer?.name||'there');
    const remaining=logic.couponRemaining(coupon);
    if(reminder){
      return {
        subject:SHOP_NAME+' — cashback coupon reminder',
        body:'Hi '+name+',\n\nYour '+SHOP_NAME+' coupon is '+coupon.code+'. You have '+remaining+' use'+(remaining===1?'':'s')+' remaining.\n\nCashback tiers: $50,000+ = $5,000; $250,000+ = $10,000; $1,000,000+ = $20,000. Qualifying purchases must be made after the coupon was issued and remain eligible for 24 hours. Message me the coupon code after your qualifying Bazaar purchase.\n\n— '+OWNER_NAME
      };
    }
    return {
      subject:SHOP_NAME+' — thanks for your purchase',
      body:'Hi '+name+',\n\nThanks for buying from '+SHOP_NAME+'. Your cashback coupon is '+coupon.code+'.\n\nCashback tiers: $50,000+ = $5,000; $250,000+ = $10,000; $1,000,000+ = $20,000. Purchases count only after the coupon is issued and remain eligible for 24 hours. Send me the coupon code after a qualifying purchase.\n\nIf you want restock alerts, reply RESTOCK. Reply STOP any time to stop alerts.\n\n— '+OWNER_NAME
    };
  }

  function restockMessage(sub,rows){
    const limited=rows.slice(0,12);
    const lines=limited.map(row=>'- '+String(row.name||'Item')+' — '+fmt(row.quantity)+' available'+(n(row.price)?' @ '+money(row.price):''));
    return {
      subject:SHOP_NAME+' — Bazaar restock alert',
      body:'Hi '+String(sub?.name||'there')+',\n\nCurrent Bazaar stock matching your alerts:\n'+lines.join('\n')+
        (rows.length>limited.length?'\n- plus '+(rows.length-limited.length)+' more item(s)':'')+
        '\n\nStock and prices can change quickly and nothing is reserved.\n\n— '+OWNER_NAME
    };
  }

  function refundProfileUrl(refund){
    const url=new URL('https://www.torn.com/profiles.php');
    url.searchParams.set('XID',String(refund.playerId||''));
    return url.toString();
  }

  function sellHtml(){
    const slice=state||{};
    logic.ensureBazaarSlice(slice);
    const bm=slice.operations?.bazaarManager||{};
    const rows=logic.listingRows(slice);
    const sales=Object.values(slice.sales||{});
    const revenue72=sales.filter(s=>n(s.timestamp)>=Date.now()-SALES_LOOKBACK_MS).reduce((sum,s)=>sum+n(s.total),0);
    const units72=sales.filter(s=>n(s.timestamp)>=Date.now()-SALES_LOOKBACK_MS).reduce((sum,s)=>sum+n(s.units),0);
    const shop=bm.lastShopRefresh||{};
    return card(
      '<div class="mm-bm-actions" style="justify-content:space-between;">'+
        '<div><b>Sell / Listings</b><div class="mm-bm-muted">Bazaar '+Object.keys(bm.listings||{}).length+' SKU(s) · inventory '+Object.keys(bm.inventory||{}).length+' SKU(s) · shop '+when(bm.lastBazaarAt)+' · sales '+when(bm.lastSalesAt)+'</div></div>'+
        '<div class="mm-bm-actions"><button id="mm-bm-refresh-shop" style="'+button(true)+'">Refresh Shop</button><button id="mm-bm-refresh-sales" style="'+button()+'">Refresh Sales</button><button id="mm-bm-open-bazaar" style="'+button()+'">Open Bazaar</button></div>'+
      '</div>'+
      '<div class="mm-bm-tiles" style="margin-top:5px;">'+tile('72H SALES',money(revenue72))+tile('72H UNITS',fmt(units72))+tile('CUSTOMERS',fmt(Object.keys(slice.customers||{}).length))+
      (shop.inventoryError?tile('INVENTORY','API unavailable','mm-bm-warn'):'')+
      '</div>'
    )+
    (rows.length?rows.map(row=>'<details class="mm-bm-member">'+
      '<summary><span><b>'+esc(row.name)+'</b> <span class="'+(row.action==='LIST'||row.action==='TOP UP'?'mm-bm-warn':'mm-bm-muted')+'">'+esc(row.action)+'</span></span><span class="mm-bm-muted">'+fmt(row.bazaarQty)+' listed · '+row.daily30.toFixed(2)+'/day</span></summary>'+
      '<div class="mm-bm-detail"><div class="mm-bm-tiles">'+
        tile('BAZAAR QTY',fmt(row.bazaarQty))+tile('BAZAAR PRICE',row.bazaarPrice?money(row.bazaarPrice):'—')+
        tile('PERSONAL QTY',fmt(row.personalQty))+tile('SOLD 7D',fmt(row.units7d))+tile('SOLD 30D',fmt(row.units30d))+
        tile('3D TARGET',fmt(row.targetListed))+tile('ADD',fmt(row.addToBazaar),row.addToBazaar?'mm-bm-warn':'')+
        tile('RECENT AVG',row.avgSoldPrice30?money(row.avgSoldPrice30):'—')+tile('PLAN PRICE',row.plannedPrice?money(row.plannedPrice):'—')+
      '</div></div></details>').join(''):card('No Bazaar/inventory rows are cached. Use Refresh Shop.'));
  }

  function customersHtml(){
    const rows=logic.customerRfmRows(state||{}).filter(row=>!state?.removedCustomers?.[row.id]).slice(0,100);
    if(!rows.length)return card('<b>Customers</b><div class="mm-bm-muted">No customer history yet. Refresh Sales after saving the API key.</div>');
    return rows.map(row=>{
      const coupon=state?.coupons?.[row.id]||logic.ensureCoupon(state,row);
      const q=logic.couponQualification(state,coupon);
      const sub=state?.subscribers?.[row.id];
      return '<details class="mm-bm-member"><summary><span><b>'+esc(row.name)+'</b> <span class="mm-bm-muted">['+esc(row.id)+'] · '+esc(row.segment)+'</span></span><span class="mm-bm-muted">'+money(row.monetary)+' · '+fmt(row.frequency)+' purchase(s)</span></summary>'+
        '<div class="mm-bm-detail"><div class="mm-bm-tiles">'+tile('SPENT',money(row.monetary))+tile('UNITS',fmt(row.units))+tile('LAST',when(row.lastPurchase))+tile('COUPON',coupon?.code||'—')+tile('USES LEFT',fmt(logic.couponRemaining(coupon)))+tile('CASHBACK',q.qualified?money(q.cashback):q.reason)+'</div>'+
        '<div class="mm-bm-actions" style="margin-top:5px;">'+
          '<button data-welcome="'+esc(row.id)+'" style="'+button(true)+'">Prepare Welcome</button>'+
          '<button data-mark-welcome="'+esc(row.id)+'" style="'+button()+'">Mark Sent + Issue</button>'+
          (coupon?.issuedAt?'<button data-reminder="'+esc(row.id)+'" style="'+button(q.qualified)+'">Coupon Reminder</button>':'')+
          '<button data-subscribe="'+esc(row.id)+'" style="'+button()+'">'+(sub?'Restock−':'Restock+')+'</button>'+
          (q.qualified?'<button data-refund-start="'+esc(row.id)+'" style="'+button(true)+'">Create Cashback</button>':'')+
          '<button data-profile="'+esc(row.id)+'" style="'+button()+'">Profile</button>'+
        '</div></div></details>';
    }).join('');
  }

  function couponsHtml(){
    const rows=Object.values(state?.coupons||{}).sort((a,b)=>String(a.playerName||'').localeCompare(String(b.playerName||'')));
    if(!rows.length)return card('No coupons yet.');
    return rows.map(c=>{
      const q=logic.couponQualification(state,c);
      return card('<div class="mm-bm-row"><div class="mm-bm-main"><b>'+esc(c.playerName)+' ['+esc(c.playerId)+']</b><div class="mm-bm-muted">'+esc(c.code)+' · issued '+when(c.issuedAt)+' · '+logic.couponRemaining(c)+' use(s) left</div></div><div class="'+(q.qualified?'mm-bm-good':'mm-bm-muted')+'">'+esc(q.qualified?money(q.cashback)+' eligible':q.reason)+'</div></div>');
    }).join('');
  }

  function restockHtml(){
    const rows=Object.values(state?.subscribers||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    if(!rows.length)return card('No restock subscribers. Add them from Customers when they request RESTOCK.');
    return rows.map(sub=>{
      const matching=logic.currentBazaarRows(state,sub);
      return '<details class="mm-bm-member"><summary><span><b>'+esc(sub.name||sub.id)+'</b> <span class="mm-bm-muted">['+esc(sub.id)+']</span></span><span class="mm-bm-muted">'+matching.length+' matching SKU(s)</span></summary>'+
        '<div class="mm-bm-detail"><div class="mm-bm-muted">Interests: '+esc(sub.interests?.length?sub.interests.join(', '):'All items')+' · last notified '+when(sub.lastNotified)+'</div>'+
        '<div class="mm-bm-actions" style="margin-top:5px;"><button data-restock-alert="'+esc(sub.id)+'" style="'+button(true)+'">Prepare Alert</button><button data-restock-interests="'+esc(sub.id)+'" style="'+button()+'">Interests</button><button data-restock-remove="'+esc(sub.id)+'" style="'+button()+'">Remove</button></div></div></details>';
    }).join('');
  }

  function refundsHtml(){
    const rows=Object.values(state?.refunds||{}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    if(!rows.length)return card('No cashback refunds yet.');
    return rows.map(r=>card('<div class="mm-bm-row"><div class="mm-bm-main"><b>'+esc(r.playerName)+' · '+money(r.amount)+'</b><div class="mm-bm-muted">'+esc(r.status)+' · purchases '+money(r.purchaseTotal)+' · '+when(r.createdAt)+'</div></div>'+
      (r.status==='pending'?'<div class="mm-bm-actions"><button data-refund-open="'+esc(r.id)+'" style="'+button(true)+'">Open Profile</button><button data-refund-paid="'+esc(r.id)+'" style="'+button()+'">Mark Paid</button><button data-refund-cancel="'+esc(r.id)+'" style="'+button()+'">Cancel</button></div>':'')+'</div>')).join('');
  }

  function settingsHtml(){
    const saved=Boolean(apiKey());
    return card(
      '<b>Torn API</b><div class="mm-bm-muted">Bazaar Manager keeps its key in this userscript\'s Tampermonkey storage only.</div>'+
      '<div class="mm-bm-actions" style="margin-top:6px;"><input id="mm-bm-api" class="mm-bm-input" type="password" autocomplete="off" placeholder="'+(saved?'API key saved — enter to replace':'Torn API key')+'" style="flex:1 1 260px;min-width:180px;"><button id="mm-bm-save-api" style="'+button(true)+'">Save</button><button id="mm-bm-clear-api" style="'+button()+'">Clear</button></div>'+
      '<div class="mm-bm-mini" style="margin-top:5px;">Purpose: User Log for Bazaar sales plus your own Bazaar/Inventory selections for listing workflow. Key is not copied into IndexedDB/localStorage, is not shared with other users, and is never sent to another service.</div>'
    );
  }

  function render(){
    const root=document.getElementById(ROOT_ID);
    if(!root)return;
    const view=activeView==='sell'?sellHtml():activeView==='customers'?customersHtml():activeView==='coupons'?couponsHtml():activeView==='restock'?restockHtml():activeView==='refunds'?refundsHtml():settingsHtml();
    root.innerHTML=
      '<div class="mm-bm-head"><div><b style="font-size:14px;">MM Bazaar Manager</b><div class="mm-bm-muted">v'+VERSION+' · SELL / LIST / CUSTOMER</div></div><button id="mm-bm-close" style="'+button()+'">×</button></div>'+
      '<div class="mm-bm-body">'+
        '<div class="mm-bm-tabs">'+
          '<button data-view="sell" style="'+button(activeView==='sell')+'">Sell</button>'+
          '<button data-view="customers" style="'+button(activeView==='customers')+'">Customers</button>'+
          '<button data-view="coupons" style="'+button(activeView==='coupons')+'">Coupons</button>'+
          '<button data-view="restock" style="'+button(activeView==='restock')+'">Restock</button>'+
          '<button data-view="refunds" style="'+button(activeView==='refunds')+'">Refunds</button>'+
          '<button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div class="mm-bm-status">'+esc(busy?'Working…':statusText)+'</div>'+
        '<div class="mm-bm-scroll">'+view+'</div>'+
      '</div>';

    core.makePanelDraggable?.(root,root.querySelector('.mm-bm-head'),'bazaar-manager',window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'82px'});
    bind();
  }

  function bind(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    root.querySelector('#mm-bm-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'sell';render();}));

    const run=async(label,fn)=>{
      if(busy)return;
      busy=true;statusText=label;render();
      try{const result=await fn();statusText=typeof result==='string'?result:'Done.';}
      catch(error){statusText=error?.message||String(error);}
      finally{busy=false;render();}
    };

    root.querySelector('#mm-bm-refresh-sales')?.addEventListener('click',()=>run('Refreshing Bazaar sales…',async()=>{
      const r=await refreshSales();
      return 'Sales refreshed: '+r.imported+' new · '+r.checked+' checked'+(r.rejected?' · '+r.rejected+' rejected':'')+'.';
    }));
    root.querySelector('#mm-bm-refresh-shop')?.addEventListener('click',()=>run('Refreshing Bazaar and inventory…',async()=>{
      const r=await refreshShop();
      return 'Shop refreshed: Bazaar '+(r.bazaarOk?'OK':'failed')+' · Inventory '+(r.inventoryOk?'OK':'failed')+'.';
    }));
    root.querySelector('#mm-bm-open-bazaar')?.addEventListener('click',()=>{location.href='https://www.torn.com/bazaar.php';});

    root.querySelector('#mm-bm-save-api')?.addEventListener('click',()=>{
      const value=root.querySelector('#mm-bm-api')?.value||'';saveApiKey(value);
      statusText=value.trim()?'Bazaar Manager API key saved locally.':'Enter an API key first.';render();
    });
    root.querySelector('#mm-bm-clear-api')?.addEventListener('click',()=>{saveApiKey('');statusText='Bazaar Manager API key cleared.';render();});

    root.querySelectorAll('[data-welcome]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.welcome;const customer=state?.customers?.[id];const coupon=state?.coupons?.[id]||logic.ensureCoupon(state,customer);
      if(!customer||!coupon)return;const msg=customerMessage(customer,coupon,false);await copyAndOpenMessage(id,msg.subject,msg.body);
    }));
    root.querySelectorAll('[data-mark-welcome]').forEach(b=>b.addEventListener('click',()=>run('Saving sent welcome…',async()=>{
      const id=b.dataset.markWelcome;
      await updateBazaar(draft=>{
        const customer=draft.customers[id];if(!customer)throw new Error('Customer not found.');
        const coupon=logic.issueCoupon(draft,id);
        customer.contacted=true;customer.firstMessageSent=true;customer.messageCount=n(customer.messageCount)+1;customer.lastContacted=new Date().toISOString();
        coupon.issuedAt=coupon.issuedAt||customer.lastContacted;
      });
      return 'Welcome marked sent and coupon issued.';
    })));
    root.querySelectorAll('[data-reminder]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.reminder;const customer=state?.customers?.[id];const coupon=state?.coupons?.[id];if(!customer||!coupon)return;
      const msg=customerMessage(customer,coupon,true);await copyAndOpenMessage(id,msg.subject,msg.body);
    }));
    root.querySelectorAll('[data-subscribe]').forEach(b=>b.addEventListener('click',()=>run('Updating restock subscription…',async()=>{
      const id=b.dataset.subscribe;
      await updateBazaar(draft=>{if(draft.subscribers[id])logic.unsubscribeCustomer(draft,id);else logic.subscribeCustomer(draft,id);});
      return state?.subscribers?.[id]?'Restock alerts enabled.':'Restock alerts updated.';
    })));
    root.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/profiles.php?XID='+encodeURIComponent(b.dataset.profile);}));
    root.querySelectorAll('[data-refund-start]').forEach(b=>b.addEventListener('click',()=>run('Creating cashback record…',async()=>{
      let refund;await updateBazaar(draft=>{refund=logic.createRefund(draft,b.dataset.refundStart);});
      return 'Pending cashback created: '+money(refund.amount)+'. Send money manually, then Mark Paid.';
    })));

    root.querySelectorAll('[data-restock-alert]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.restockAlert;const sub=state?.subscribers?.[id];if(!sub)return;
      const rows=logic.currentBazaarRows(state,sub);if(!rows.length){statusText='No matching current Bazaar inventory for this subscriber.';render();return;}
      const msg=restockMessage(sub,rows);
      await updateBazaar(draft=>{const s=draft.subscribers[id];if(s){s.lastPrepared=new Date().toISOString();s.pendingNotification={id:'notice-'+Date.now(),type:'bazaar-inventory',preparedAt:s.lastPrepared,itemCount:rows.length};}});
      await copyAndOpenMessage(id,msg.subject,msg.body);
    }));
    root.querySelectorAll('[data-restock-interests]').forEach(b=>b.addEventListener('click',()=>run('Updating interests…',async()=>{
      const id=b.dataset.restockInterests;const sub=state?.subscribers?.[id];if(!sub)throw new Error('Subscriber not found.');
      const value=prompt('Comma-separated item names or item IDs. Blank = all items.',(sub.interests||[]).join(', '));if(value==null)return 'No change.';
      await updateBazaar(draft=>{draft.subscribers[id].interests=[...new Set(value.split(',').map(x=>x.trim()).filter(Boolean))];});
      return 'Restock interests updated.';
    })));
    root.querySelectorAll('[data-restock-remove]').forEach(b=>b.addEventListener('click',()=>run('Removing subscriber…',async()=>{await updateBazaar(draft=>logic.unsubscribeCustomer(draft,b.dataset.restockRemove));return 'Restock subscriber removed.';})));

    root.querySelectorAll('[data-refund-open]').forEach(b=>b.addEventListener('click',()=>{const r=state?.refunds?.[b.dataset.refundOpen];if(r)location.href=refundProfileUrl(r);}));
    root.querySelectorAll('[data-refund-paid]').forEach(b=>b.addEventListener('click',()=>run('Saving cashback completion…',async()=>{let r;await updateBazaar(draft=>{r=logic.completeRefund(draft,b.dataset.refundPaid);});return 'Cashback '+money(r.amount)+' marked paid.';})));
    root.querySelectorAll('[data-refund-cancel]').forEach(b=>b.addEventListener('click',()=>run('Cancelling cashback…',async()=>{await updateBazaar(draft=>logic.cancelRefund(draft,b.dataset.refundCancel));return 'Pending cashback cancelled.';})));
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
    core.setDockLauncherActive?.('bazaar',true);
    reloadState().catch(error=>{statusText=error?.message||String(error);render();});
  }
  function close(){
    const root=document.getElementById(ROOT_ID);if(root)root.style.display='none';
    core.setDockLauncherActive?.('bazaar',false);
  }

  function createLauncher(){
    if(!document.body)return;
    injectStyle();
    if(core.registerDockLauncher){
      const b=core.registerDockLauncher({
        id:'bazaar',label:'MM Bazaar Manager',accent:'#2c718e',
        onClick:()=>{const root=document.getElementById(ROOT_ID);if(root&&root.style.display!=='none')close();else open();}
      });
      if(b)b.id=LAUNCHER_ID;
      core.adoptLegacyCrmLauncher?.();
      return;
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