// ==UserScript==
// @name         MM_Customers
// @namespace    manic-mike.torn.customers
// @version      8.0.0-alpha.10
// @description  Dedicated customer CRM: Bazaar sales history, coupons, cashback, restock subscribers and manual customer messaging.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.8
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/customers/MM_Customers.logic.js?v=8.0.0-alpha.1
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='8.0.0-alpha.10';
  const ROOT_ID='mm-customers';
  const LAUNCHER_ID='mm-customers-launcher';
  const STYLE_ID='mm-customers-style';
  const API_KEY='mm_customers_api_v1';
  const SHOP_NAME="MANIC'S MAD HOUSE";
  const OWNER_NAME='Manic-Mike';
  const OWNER_ID='4325346';
  const PENDING_COMPOSE_KEY='mm_customers_pending_compose_v1';
  const PENDING_SEND_KEY='mm_customers_pending_send_v1';
  const SHOP_BANNER_URL='https://i.postimg.cc/qvV31ggb/Chat-GPT-Image-Sep-20-2026-09-46-21-PM.png';
  const FAVORITE_CTA='★ ADD '+OWNER_NAME+' TO YOUR FAVORITES ★  Keep '+SHOP_NAME+' easy to find for future purchases and restocks.';
  const API_BASE='https://api.torn.com/v2';
  const SALES_LOOKBACK_MS=72*60*60*1000;
  const MAX_LOG_PAGES=25;
  const AUTO_SYNC_MS=60_000;
  const AUTO_SYNC_STALE_MS=45_000;
  const NAME_REPAIR_BATCH=12;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornCustomersLogic;
  if(!core||!logic){
    console.error('[MM Customers] Core/logic dependency missing.');
    return;
  }

  let state=null;
  let activeView='customers';
  let statusText='Ready.';
  let busy=false;
  let autoSyncRunning=false;
  let routeTimer=null;
  let lastHref=location.href;

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
  function card(html){return '<div class="mm-cu-card">'+html+'</div>';}
  function tile(label,value,cls=''){
    return '<span class="mm-cu-tile '+cls+'"><span class="mm-cu-label">'+esc(label)+'</span><span class="mm-cu-value">'+esc(value==null||value===''?'—':value)+'</span></span>';
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:82px;z-index:2147483646;width:min(900px,calc(100vw - 24px));max-height:calc(100vh - 98px);overflow:hidden;background:#101010;color:#eee;border:1px solid #315e69;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.25 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button{min-height:26px;height:auto;line-height:1.05;padding:5px 8px;font-size:11px}
      .mm-cu-head{height:40px;background:#151515;border-bottom:1px solid #315e69;display:flex;align-items:center;justify-content:space-between;padding:0 7px;gap:6px}
      .mm-cu-body{padding:5px}
      .mm-cu-tabs,.mm-cu-actions,.mm-cu-tiles{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
      .mm-cu-scroll{max-height:calc(100vh - 190px);overflow:auto;padding-right:2px}
      .mm-cu-card{border:1px solid #353535;background:#171717;border-radius:6px;padding:6px;margin-bottom:4px}
      .mm-cu-row{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;border-top:1px solid #303030;padding:5px 0}
      .mm-cu-row:first-child{border-top:0}
      .mm-cu-main{min-width:0;flex:1 1 auto}
      .mm-cu-muted{font-size:9px;color:#888}
      .mm-cu-mini{font-size:10px;color:#aaa}
      .mm-cu-status{padding:4px 6px;background:#151515;border:1px solid #333;border-radius:4px;color:#67c9d9;margin:4px 0;font-size:10px}
      .mm-cu-input{background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:5px 6px;font:11px Arial,sans-serif;min-height:27px}
      .mm-cu-tile{display:inline-flex;flex-direction:column;gap:1px;min-width:58px;max-width:240px;padding:4px 6px;border:1px solid #353535;background:#121212;border-radius:5px}
      .mm-cu-label{font-size:8px;line-height:1;color:#777;text-transform:uppercase;letter-spacing:.25px}
      .mm-cu-value{font-size:10px;line-height:1.15;color:#ddd;font-weight:600}
      .mm-cu-good{color:#a7d7ad}.mm-cu-warn{color:#e5c879}.mm-cu-bad{color:#efaaa3}
      .mm-cu-member{border:1px solid #353535;background:#171717;border-radius:6px;margin-bottom:3px}
      .mm-cu-member>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;min-height:27px}
      .mm-cu-member>summary::-webkit-details-marker{display:none}
      .mm-cu-member>summary:before{content:'▸';color:#777;font-size:10px}.mm-cu-member[open]>summary:before{content:'▾'}
      .mm-cu-detail{border-top:1px solid #303030;padding:5px 7px}
      @media(max-width:620px){#${ROOT_ID}{right:4px;top:54px;width:calc(100vw - 8px);max-height:calc(100vh - 60px)}.mm-cu-scroll{max-height:calc(100vh - 178px)}}
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
    const key=apiKey();if(!key)return Promise.reject(new Error('Customers API key is not saved.'));
    const url=new URL(String(pathOrUrl).startsWith('http')?pathOrUrl:API_BASE+pathOrUrl);
    url.searchParams.set('key',key);url.searchParams.set('comment','MM Customers');
    return requestJson(url.toString());
  }

  function extractUsernameFromApiPayload(data,playerId){
    const id=String(playerId||'').trim();
    for(const candidate of [data?.profile?.name,data?.user?.name,data?.name,data?.player_name,data?.username]){
      const name=String(candidate||'').trim();
      if(name&&name!==id&&!/^\d+$/.test(name))return name;
    }
    return '';
  }

  function publicApiRequestV1(playerId){
    const key=apiKey(),id=String(playerId||'').trim();
    if(!key)return Promise.reject(new Error('Customers API key is not saved.'));
    const url=new URL('https://api.torn.com/user/'+encodeURIComponent(id));
    url.searchParams.set('selections','basic');url.searchParams.set('key',key);url.searchParams.set('comment','MM Customers');
    return requestJson(url.toString());
  }

  async function fetchTornUsername(playerId){
    const id=String(playerId||'').trim();
    if(!/^\d+$/.test(id))throw new Error('Invalid Torn player ID: '+id);
    let v2Error=null;
    try{
      const data=await apiV2('/user/'+encodeURIComponent(id)+'/basic');
      const name=extractUsernameFromApiPayload(data,id);if(name)return name;
    }catch(error){v2Error=error;}
    try{
      const data=await publicApiRequestV1(id);
      const name=extractUsernameFromApiPayload(data,id);if(name)return name;
    }catch(v1Error){
      throw new Error('Username lookup failed for ['+id+']. '+(v2Error?.message||'v2 returned no usable username')+'; v1 fallback: '+(v1Error?.message||String(v1Error)));
    }
    throw new Error('Torn returned no usable username for ['+id+'].');
  }

  function hasRealUsername(record){
    if(!record)return false;
    const id=String(record.id??record.playerId??'').trim();
    const name=String(record.name??record.playerName??'').trim();
    return Boolean(name&&name!==id&&!/^\d+$/.test(name));
  }

  function applyUsername(draft,playerId,name){
    const id=String(playerId||'').trim(),safe=String(name||'').trim();
    if(!id||!safe)return;
    if(draft.customers?.[id])draft.customers[id].name=safe;
    if(draft.coupons?.[id])draft.coupons[id].playerName=safe;
    if(draft.subscribers?.[id])draft.subscribers[id].name=safe;
    for(const sale of Object.values(draft.sales||{}))if(String(sale.playerId||'')===id)sale.playerName=safe;
    for(const refund of Object.values(draft.refunds||{}))if(String(refund.playerId||'')===id)refund.playerName=safe;
  }

  async function repairUsernames(limit=NAME_REPAIR_BATCH){
    if(!apiKey())return 0;
    if(!state)state=await core.readLegacyState();
    const ids=Object.values(state?.customers||{}).filter(customer=>!hasRealUsername(customer)).map(customer=>String(customer.id||'')).filter(Boolean).slice(0,limit);
    if(!ids.length)return 0;
    const resolved={};
    for(const id of ids){
      try{resolved[id]=await fetchTornUsername(id);}catch(error){console.warn('[MM Customers] Username lookup failed',id,error);}
      await new Promise(resolve=>setTimeout(resolve,120));
    }
    const entries=Object.entries(resolved);if(!entries.length)return 0;
    await updateCustomerState(draft=>{for(const [id,name] of entries)applyUsername(draft,id,name);});
    return entries.length;
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
    url.searchParams.set('comment','MM Customers');
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

  async function updateCustomerState(mutator){
    await core.updateDomainState('bazaar',draft=>{
      logic.ensureCustomerSlice(draft);
      const out=mutator(draft);
      return out===undefined?draft:out;
    });
    state=await core.readLegacyState();
  }

  async function refreshSales(){
    if(!apiKey())throw new Error('Save a Torn API key in Settings first.');
    if(!state)state=await core.readLegacyState();
    const beforeIds=new Set(Object.keys(state?.customers||{}));
    const rows=await fetchSalesLogs((Date.now()-SALES_LOOKBACK_MS)/1000);
    let result=null;
    await updateCustomerState(draft=>{result=logic.importSalesEntries(draft,rows);return draft;});
    const newCustomerIds=Object.keys(state?.customers||{}).filter(id=>!beforeIds.has(id));
    const repaired=await repairUsernames(NAME_REPAIR_BATCH);
    return {...result,newCustomers:newCustomerIds.length,repairedNames:repaired};
  }

  function newCustomerRows(){
    return logic.customerRfmRows(state||{})
      .filter(row=>!state?.removedCustomers?.[row.id])
      .filter(row=>!row.contacted&&!row.firstMessageSent&&!n(row.messageCount))
      .sort((a,b)=>(Date.parse(b.firstPurchase||b.createdAt||0)||0)-(Date.parse(a.firstPurchase||a.createdAt||0)||0));
  }

  async function autoRefreshCustomers({force=false,switchToNew=false}={}){
    if(autoSyncRunning||!apiKey())return null;
    if(!state)state=await core.readLegacyState();
    const last=Date.parse(state?.operations?.customers?.lastSalesAt||'')||0;
    if(!force&&last&&Date.now()-last<AUTO_SYNC_STALE_MS){
      if(await repairUsernames(NAME_REPAIR_BATCH)){if(document.getElementById(ROOT_ID))render();}
      return null;
    }
    autoSyncRunning=true;
    try{
      const result=await refreshSales();
      const newRows=newCustomerRows();
      if(switchToNew&&newRows.length)activeView='new';
      statusText='Auto-synced sales: '+result.imported+' new sale'+(result.imported===1?'':'s')+
        (result.newCustomers?' · '+result.newCustomers+' new customer'+(result.newCustomers===1?'':'s'):'')+
        (result.repairedNames?' · '+result.repairedNames+' name'+(result.repairedNames===1?'':'s')+' resolved':'')+'.';
      if(document.getElementById(ROOT_ID))render();
      return result;
    }catch(error){
      console.warn('[MM Customers] Automatic customer sync failed',error);
      if(document.getElementById(ROOT_ID)?.style.display!=='none'){
        statusText='Auto-sync warning: '+(error?.message||String(error));render();
      }
      return null;
    }finally{autoSyncRunning=false;}
  }

  function escapeMessageHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function brandedMessageHtml({customerName,greeting='',centerText='',rightText='',columns=[],footerTitle='',footerLines=[],couponCode=''}){
    const safeName=escapeMessageHtml(customerName||'Customer');
    const headerColors=['#f2c94c','#53c7ff','#ff9f43'];
    const cells=columns.slice(0,3).map((col,index)=>{
      const lines=(col.lines||[]).map(item=>'<span style="color:#f3f3f3;">&#8226;&nbsp;'+escapeMessageHtml(item)+'</span><br>').join('');
      return '<td width="33%" valign="top" bgcolor="'+(index%2?'#171717':'#111111')+'" style="width:33.333%;vertical-align:top;padding:12px 14px;'+(index<2?'border-right:1px solid #333333;':'')+'">'+
        '<strong style="color:'+headerColors[index]+';font-size:15px;">'+escapeMessageHtml(col.title||'')+'</strong><br><br>'+lines+'</td>';
    }).join('');
    const footer=(footerLines||[]).map(line=>'<span style="color:#f3f3f3;">'+escapeMessageHtml(line)+'</span><br>').join('');
    const safeCoupon=String(couponCode||'').trim();
    const couponHref=safeCoupon?'https://www.torn.com/messages.php#/p=compose&XID='+encodeURIComponent(OWNER_ID)+'&subject='+encodeURIComponent('Coupon Code '+safeCoupon):'';
    const couponActionRow=safeCoupon
      ? '<tr><td colspan="3" bgcolor="#102614" align="center" style="padding:14px;text-align:center;border-top:2px solid #53d769;border-bottom:1px solid #2f6d39;">'+
        '<a href="'+couponHref+'" style="display:inline-block;background:#53d769;color:#071b0b;font-weight:bold;font-size:16px;text-decoration:none;padding:11px 18px;border:1px solid #8bf09a;border-radius:4px;">SEND MY COUPON CODE — '+escapeMessageHtml(safeCoupon)+'</a><br>'+
        '<span style="display:inline-block;margin-top:7px;color:#d7f7dc;font-size:12px;">Opens a message to '+escapeMessageHtml(OWNER_NAME)+' with your coupon code in the subject. Review it, then press Send.</span></td></tr>'
      : '';
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:900px;border-collapse:collapse;background-color:#0d0d0d;color:#f2f2f2;font-family:Arial,Helvetica,sans-serif;">'+
      '<tr><td colspan="3" bgcolor="#000000" align="center" style="padding:0;text-align:center;"><img src="'+SHOP_BANNER_URL+'" alt="'+escapeMessageHtml(SHOP_NAME)+'" width="900" style="display:block;width:100%;max-width:900px;height:auto;border:0;"></td></tr>'+
      (greeting?'<tr><td colspan="3" bgcolor="#121212" align="center" style="padding:12px 14px;text-align:center;border-top:1px solid #333333;border-bottom:1px solid #333333;"><strong style="color:#f2c94c;font-size:18px;">'+escapeMessageHtml(greeting)+'</strong></td></tr>':'')+
      '<tr bgcolor="#1a1a1a"><td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#ffffff;">'+safeName+'</strong></td>'+
      '<td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#53c7ff;">'+escapeMessageHtml(centerText)+'</strong></td>'+
      '<td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#f2c94c;">'+escapeMessageHtml(rightText)+'</strong></td></tr>'+
      couponActionRow+'<tr>'+cells+'</tr>'+
      '<tr><td colspan="3" bgcolor="#3a2a00" align="center" style="padding:12px 14px;text-align:center;border-top:2px solid #f2c94c;border-bottom:1px solid #6b5315;"><strong style="color:#ffd95a;font-size:16px;">'+escapeMessageHtml(FAVORITE_CTA)+'</strong></td></tr>'+
      '<tr><td colspan="3" bgcolor="#181818" style="padding:11px 14px;border-top:1px solid #333333;">'+(footerTitle?'<strong style="color:#9be564;font-size:14px;">'+escapeMessageHtml(footerTitle)+'</strong><br><br>':'')+footer+'</td></tr></table>';
  }

  function plainThreeColumnFallback({customerName,greeting='',centerText='',rightText='',columns=[],footerTitle='',footerLines=[],couponCode=''}){
    const top=(greeting?greeting+'\n\n':'')+customerName+' | '+centerText+' | '+rightText;
    const colText=columns.map(col=>col.title+'\n'+(col.lines||[]).map(line=>'• '+line).join('\n')).join('\n\n');
    const footer=footerTitle?'\n\n'+footerTitle+'\n'+(footerLines||[]).map(line=>'• '+line).join('\n'):'';
    const couponLine=couponCode?'\n\nSEND MY COUPON CODE — '+couponCode+'\nhttps://www.torn.com/messages.php#/p=compose&XID='+OWNER_ID+'&subject='+encodeURIComponent('Coupon Code '+couponCode):'';
    return top+'\n\n'+colText+couponLine+'\n\n★ ★ ★ ADD ME TO FAVORITES ★ ★ ★\n'+FAVORITE_CTA+footer;
  }

  function composeMessage(playerId,subject,body,bodyHtml='',options={}){
    const id=String(playerId||'').trim(),createdAt=Date.now();
    const payload={playerId:id,subject:String(subject||''),body:String(body||''),bodyHtml:String(bodyHtml||''),createdAt};
    GM_setValue(PENDING_COMPOSE_KEY,payload);
    if(options?.kind){
      GM_setValue(PENDING_SEND_KEY,{playerId:id,subject:payload.subject,kind:String(options.kind),createdAt,noticeId:options.noticeId||null,state:'awaiting-send'});
    }else GM_deleteValue(PENDING_SEND_KEY);
    statusText='Opening Torn composer with the prepared message. Sending remains manual.';
    render();
    const url='https://www.torn.com/messages.php#/p=compose&XID='+encodeURIComponent(id)+'&subject='+encodeURIComponent(payload.subject);
    try{window.location.assign(url);}catch{location.href=url;}
  }

  function customerMessage(customer,coupon,reminder=false){
    const name=String(customer?.name||'there');
    const remaining=logic.couponRemaining(coupon);
    if(reminder){
      const q=logic.couponQualification(state||{},coupon);
      const columns=[
        {title:'YOUR COUPON',lines:['Code: '+coupon.code,remaining+' redemption'+(remaining===1?'':'s')+' remaining',q.qualified?'Recent purchases currently qualify for '+money(q.cashback)+' cashback.':'Use it on your next qualifying purchase.']},
        {title:'HOW TO USE IT',lines:['Buy normally from my Bazaar','Message me your coupon code after the purchase','I verify the purchase and send cashback manually']},
        {title:'CASHBACK TIERS',lines:['$50,000+ → $5,000 cashback','$250,000+ → $10,000 cashback','$1,000,000+ → $20,000 cashback']}
      ];
      const greeting='WELCOME BACK, '+name+' — DON\'T FORGET YOUR COUPON!';
      const footer=['Purchases must be made after the coupon is issued.','Eligible purchases remain available for 24 hours.','Each sale can only be used once.'];
      return {
        subject:SHOP_NAME+' — Cashback coupon reminder',
        body:plainThreeColumnFallback({customerName:name,greeting,centerText:'Coupon: '+coupon.code,rightText:remaining+' use'+(remaining===1?'':'s')+' left',columns,footerTitle:'IMPORTANT',footerLines:footer,couponCode:coupon.code}),
        bodyHtml:brandedMessageHtml({customerName:name,greeting,centerText:'Coupon: '+coupon.code,rightText:remaining+' use'+(remaining===1?'':'s')+' left',columns,footerTitle:'IMPORTANT',footerLines:footer,couponCode:coupon.code})
      };
    }
    const first=!customer?.contacted&&!customer?.firstMessageSent&&!n(customer?.messageCount);
    const greeting=(first?'WELCOME TO ':'WELCOME BACK TO ')+SHOP_NAME+', '+name+'!';
    const columns=[
      {title:'HOW IT WORKS',lines:['1. Buy normally from my Bazaar','2. Message me your coupon code','3. I verify the purchase','4. Cashback is sent']},
      {title:'CASHBACK TIERS',lines:['$50,000+ → $5,000 cashback','$250,000+ → $10,000 cashback','$1,000,000+ → $20,000 cashback']},
      {title:'IMPORTANT',lines:['Purchases must be made after the coupon is issued','Qualifying purchases remain eligible for 24 hours','Each sale can only be used once']}
    ];
    const footer=['Reply RESTOCK to receive restock notifications.','Reply STOP at any time to leave the notification list.'];
    const subject=first?'Welcome to '+SHOP_NAME+'!':'Welcome Back to '+SHOP_NAME+'!';
    return {
      subject,
      body:plainThreeColumnFallback({customerName:name,greeting,centerText:'Coupon: '+coupon.code,rightText:remaining+' redemption'+(remaining===1?'':'s')+' remaining',columns,footerTitle:'RESTOCK ALERTS',footerLines:footer,couponCode:coupon.code}),
      bodyHtml:brandedMessageHtml({customerName:name,greeting,centerText:'Coupon: '+coupon.code,rightText:remaining+' redemption'+(remaining===1?'':'s')+' remaining',columns,footerTitle:'RESTOCK ALERTS',footerLines:footer,couponCode:coupon.code})
    };
  }

  function salePurchaseLine(sale){
    const stamp=n(sale?.timestamp)?new Date(n(sale.timestamp)).toLocaleString():'time unavailable';
    const items=(sale?.items||[]).map(item=>{
      const name=String(item?.name||'Item').trim()||'Item';
      const qty=Math.max(1,n(item?.quantity)||1);
      return name+' × '+fmt(qty);
    }).filter(Boolean);
    return stamp+' — '+(items.length?items.join(', '):'Bazaar purchase')+' — '+money(sale?.total);
  }

  function cashbackEligibilityReminderMessage(customer,coupon,qualification){
    const name=String(customer?.name||coupon?.playerName||customer?.id||coupon?.playerId||'there');
    const q=qualification||logic.couponQualification(state||{},coupon);
    if(!q?.qualified)throw new Error(q?.reason||'Customer is not currently eligible for cashback.');
    const purchases=q.sales||[];
    const purchaseLines=purchases.map(sale=>salePurchaseLine(sale));
    const purchaseCount=purchases.length;
    const greeting='CASHBACK REMINDER — '+name+', YOU ARE ELIGIBLE!';
    const columns=[
      {
        title:'QUALIFYING PURCHASE'+(purchaseCount===1?'':'S'),
        lines:purchaseLines.length?purchaseLines:['Qualifying Bazaar purchase total: '+money(q.total)]
      },
      {
        title:'YOUR CASHBACK',
        lines:[
          'Refund amount: '+money(q.cashback),
          'Qualifying purchase total: '+money(q.total),
          'Coupon code: '+coupon.code
        ]
      },
      {
        title:'SEND YOUR COUPON',
        lines:[
          'This is a reminder to send me your coupon code now.',
          'Your recent purchase'+(purchaseCount===1?'':'s')+' already '+(purchaseCount===1?'qualifies':'qualify')+' for cashback.',
          'I will verify the qualifying sale'+(purchaseCount===1?'':'s')+' and send your cashback manually.'
        ]
      }
    ];
    const footer=[
      'This reminder is based on '+purchaseCount+' qualifying post-coupon purchase'+(purchaseCount===1?'':'s')+' currently recorded in the CRM.',
      'Eligible purchases remain available for 24 hours and each sale can only be used once.'
    ];
    return {
      subject:SHOP_NAME+' — Cashback ready: send coupon '+coupon.code,
      body:plainThreeColumnFallback({
        customerName:name,greeting,
        centerText:'Cashback: '+money(q.cashback),
        rightText:purchaseCount+' qualifying purchase'+(purchaseCount===1?'':'s')+' · '+money(q.total),
        columns,footerTitle:'CASHBACK REMINDER',footerLines:footer,couponCode:coupon.code
      }),
      bodyHtml:brandedMessageHtml({
        customerName:name,greeting,
        centerText:'Cashback: '+money(q.cashback),
        rightText:purchaseCount+' qualifying purchase'+(purchaseCount===1?'':'s')+' · '+money(q.total),
        columns,footerTitle:'CASHBACK REMINDER',footerLines:footer,couponCode:coupon.code
      })
    };
  }

  function cashbackEligibleRows(){
    return Object.values(state?.coupons||{}).map(coupon=>{
      const q=logic.couponQualification(state||{},coupon);
      if(!q.qualified)return null;
      const id=String(coupon.playerId||'').trim();
      const customer=state?.customers?.[id]||{id,name:coupon.playerName||id};
      return {id,customer,coupon,qualification:q};
    }).filter(Boolean).sort((a,b)=>
      n(b.qualification.cashback)-n(a.qualification.cashback)||
      n(b.qualification.total)-n(a.qualification.total)||
      String(a.customer?.name||a.id).localeCompare(String(b.customer?.name||b.id))
    );
  }

  function restockMessage(sub,rows){
    const name=String(sub?.name||'there');
    const limited=rows.slice(0,30),omitted=Math.max(0,rows.length-limited.length),chunks=[[],[],[]];
    limited.forEach((row,index)=>chunks[index%3].push(String(row.name||'Item')+' — Qty '+fmt(row.quantity)+' — '+(n(row.price)?money(row.price)+' each':'price unavailable')));
    const columns=chunks.map((lines,index)=>({title:index===0?'CURRENT STOCK':'MORE STOCK',lines:lines.length?lines:['No additional items']}));
    const totalUnits=rows.reduce((sum,row)=>sum+n(row.quantity),0);
    const footer=['Stock and prices can change quickly and are first come, first served.'].concat(omitted?[fmt(omitted)+' additional item'+(omitted===1?'':'s')+' omitted to keep this message compact.']:[]).concat(['Reply STOP if you no longer want restock alerts.']);
    const greeting='Here’s what’s currently available at '+SHOP_NAME+', '+name+'.';
    return {
      subject:SHOP_NAME+' — Bazaar restock alert',
      body:plainThreeColumnFallback({customerName:name,greeting,centerText:fmt(rows.length)+' SKU'+(rows.length===1?'':'s'),rightText:fmt(totalUnits)+' total units',columns,footerTitle:'RESTOCK ALERTS',footerLines:footer}),
      bodyHtml:brandedMessageHtml({customerName:name,greeting,centerText:fmt(rows.length)+' SKU'+(rows.length===1?'':'s'),rightText:fmt(totalUnits)+' total units',columns,footerTitle:'RESTOCK ALERTS',footerLines:footer})
    };
  }

  function visible(el){
    if(!el||!el.isConnected)return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }

  function setNativeValue(element,value){
    if(!element)return;
    const win=element.ownerDocument?.defaultView||window,tag=String(element.tagName||'').toLowerCase();
    const proto=tag==='textarea'?win.HTMLTextAreaElement?.prototype:win.HTMLInputElement?.prototype;
    const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;
    if(setter)setter.call(element,String(value));else element.value=String(value);
    try{if(element._valueTracker)element._valueTracker.setValue('');}catch{}
    try{element.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));}
    catch{element.dispatchEvent(new win.Event('input',{bubbles:true}));}
    element.dispatchEvent(new win.Event('change',{bubbles:true}));element.dispatchEvent(new win.Event('blur',{bubbles:true}));
  }

  function getComposeParams(){const hash=location.hash||'',amp=hash.indexOf('&');return amp>=0?new URLSearchParams(hash.slice(amp+1)):new URLSearchParams();}

  function composePayloadForCurrentPage(){
    const params=getComposeParams(),xid=String(params.get('XID')||params.get('xid')||'').trim(),pending=GM_getValue(PENDING_COMPOSE_KEY,null);
    if(pending&&typeof pending==='object'){
      if(Date.now()-Number(pending.createdAt||0)>5*60*1000)GM_deleteValue(PENDING_COMPOSE_KEY);
      else{const pendingId=String(pending.playerId||'').trim();if(!xid||!pendingId||xid===pendingId)return {playerId:pendingId||xid,subject:String(pending.subject||''),body:String(pending.body||''),bodyHtml:String(pending.bodyHtml||'')};}
    }
    const urlSubject=params.get('subject'),urlBody=params.get('body');
    return urlSubject!==null||urlBody!==null?{playerId:xid,subject:urlSubject||'',body:urlBody||'',bodyHtml:''}:null;
  }

  function elementMeta(element){
    if(!element)return '';
    const labels=element.labels?[...element.labels].map(label=>label.textContent||'').join(' '):'';
    return [element.name,element.id,element.placeholder,element.getAttribute?.('aria-label'),element.getAttribute?.('data-placeholder'),element.getAttribute?.('title'),labels].filter(Boolean).join(' ').toLowerCase();
  }

  function findComposeSubjectInput(){
    const selectors=['input[placeholder="Subject"]','input[placeholder*="subject" i]','input[name*="subject" i]','input[id*="subject" i]','input[aria-label*="subject" i]','textarea[placeholder="Subject"]','textarea[placeholder*="subject" i]'];
    for(const selector of selectors){const el=[...document.querySelectorAll(selector)].find(visible);if(el)return el;}
    return [...document.querySelectorAll('input:not([type="hidden"]),textarea')].filter(visible).find(el=>/subject|title/.test(elementMeta(el)))||null;
  }

  function findComposeBodyInput(subjectInput){
    const textareas=[...document.querySelectorAll('textarea')].filter(visible),labelled=textareas.find(el=>el!==subjectInput&&/message|body|mail|content/.test(elementMeta(el)));if(labelled)return labelled;
    const editables=[...document.querySelectorAll('[contenteditable="true"],[role="textbox"][contenteditable],[role="textbox"]')].filter(visible);
    return editables.find(el=>el!==subjectInput&&/message|body|mail|content|write|compose/.test(elementMeta(el)))||editables.find(el=>el!==subjectInput)||textareas.find(el=>el!==subjectInput)||null;
  }

  function findComposeRichEditorBody(){
    for(const frame of [...document.querySelectorAll('iframe')].filter(visible)){
      try{
        const doc=frame.contentDocument||frame.contentWindow?.document,body=doc?.body;if(!body)continue;
        const meta=[frame.id,frame.name,frame.className,frame.title,frame.getAttribute('aria-label'),body.className,body.getAttribute('contenteditable'),body.getAttribute('role')].filter(Boolean).join(' ').toLowerCase();
        if(body.isContentEditable||body.getAttribute('contenteditable')==='true'||/editor|wysiwyg|message|compose|sceditor|mail/.test(meta))return body;
      }catch{}
    }
    return null;
  }

  function findTornCodeEditorToggle(){
    const selectors=['[aria-label="Toggle Code Editor"]','[title="Toggle Code Editor"]','button[aria-label*="Code Editor" i]','button[title*="Code Editor" i]','[role="button"][aria-label*="Code Editor" i]','[role="button"][title*="Code Editor" i]'];
    for(const selector of selectors){const el=[...document.querySelectorAll(selector)].find(visible);if(el)return el;}
    return [...document.querySelectorAll('button,a,[role="button"]')].filter(visible).find(el=>{const meta=[el.title,el.getAttribute('aria-label'),el.getAttribute('data-tooltip'),el.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().toLowerCase();return meta==='{}'||meta==='{ }'||/toggle code editor|code editor|source code|source editor|html source/.test(meta);})||null;
  }

  function sourceEditorCandidates(){
    const set=new Set();
    for(const selector of ['.sceditor-source','textarea[class*="source" i]','textarea[class*="code" i]','.cm-content[contenteditable="true"]','.CodeMirror textarea','.monaco-editor textarea','.monaco-editor [contenteditable="true"]','[data-language="html"][contenteditable="true"]','[data-mode="html"][contenteditable="true"]','[role="textbox"][contenteditable="true"]'])for(const el of document.querySelectorAll(selector))if(visible(el))set.add(el);
    return [...set];
  }

  function likelyTornSourceEditor(before=new Set()){
    const score=el=>{
      const meta=elementMeta(el)+' '+String(el.className||'').toLowerCase();
      if(/sceditor-source/.test(meta))return 5;
      if(/code|source|html|cm-|codemirror|monaco/.test(meta))return 4;
      if(el.matches?.('[data-language="html"],[data-mode="html"]'))return 3;
      return 0;
    };
    const eligible=sourceEditorCandidates().filter(el=>{const r=el.getBoundingClientRect?.();return score(el)>0&&(!r||r.height>=70||r.width>=280);});
    const fresh=eligible.filter(el=>!before.has(el)).sort((a,b)=>score(b)-score(a));
    return fresh[0]||eligible.sort((a,b)=>score(b)-score(a))[0]||null;
  }

  function editorText(element){if(!element)return '';const tag=String(element.tagName||'').toLowerCase();return tag==='textarea'||tag==='input'?String(element.value||''):String(element.innerText||element.textContent||'');}
  function dispatchEditorEvents(element){const win=element?.ownerDocument?.defaultView||window;for(const type of ['input','change','keyup','blur'])try{element.dispatchEvent(new win.Event(type,{bubbles:true}));}catch{}}

  function setEditorContent(element,text,html=''){
    if(!element)return false;const tag=String(element.tagName||'').toLowerCase();
    if(tag==='textarea'||tag==='input'){setNativeValue(element,html||text);return Boolean(editorText(element));}
    try{element.focus();if(html)element.innerHTML=html;else element.textContent=text;}catch{return false;}
    dispatchEditorEvents(element);
    return html?Boolean(element.querySelector?.('table')):Boolean(String(element.innerText||element.textContent||'').trim());
  }

  const sleepMs=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function richComposerHasBranding(){
    const rich=findComposeRichEditorBody();
    const docs=[document];
    if(rich?.ownerDocument&&rich.ownerDocument!==document)docs.push(rich.ownerDocument);
    const hasBanner=docs.some(doc=>[...doc.querySelectorAll('img')].some(img=>String(img.getAttribute('src')||img.src||'').includes(SHOP_BANNER_URL)));
    const hasTable=Boolean(rich?.querySelector?.('table'))||docs.some(doc=>[...doc.querySelectorAll('table')].some(table=>visible(table)||table.ownerDocument!==document));
    const text=String(rich?.innerText||rich?.textContent||'');
    const hasBrandedText=/MANIC'S MAD HOUSE|CASHBACK REMINDER|QUALIFYING PURCHASE|YOUR CASHBACK|SEND YOUR COUPON|RESTOCK ALERTS|CASHBACK TIERS/.test(text);
    // Verification must be template-agnostic. Cashback reminders intentionally
    // do not contain the Welcome/Restock headings used by earlier templates.
    return Boolean((hasBanner&&hasTable)||(hasTable&&hasBrandedText));
  }

  async function waitForSourceEditor(before=new Set(),timeoutMs=4000){
    let source=null;const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline&&!source){source=likelyTornSourceEditor(before);if(!source)await sleepMs(60);}
    return source;
  }

  async function waitForRichBranding(timeoutMs=1800){
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){if(richComposerHasBranding())return true;await sleepMs(60);}
    return richComposerHasBranding();
  }

  async function injectHtmlThroughTornCodeEditor(htmlValue){
    const html=String(htmlValue||'').replace(/>\s+</g,'><').trim();if(!html)return false;
    const toggle=findTornCodeEditorToggle();if(!toggle)return false;

    // Torn's message composer is SPA-backed and can occasionally carry source
    // mode across rapid consecutive messages. If source mode is already open,
    // use it directly rather than toggling it off and misclassifying the editor.
    let source=likelyTornSourceEditor(new Set());
    if(!source){
      const before=new Set(sourceEditorCandidates());
      try{toggle.click();}catch{return false;}
      source=await waitForSourceEditor(before,4000);

      // If the first click revealed the rich editor instead, we began in
      // source mode. Toggle once more and wait for the actual HTML source box.
      if(!source&&findComposeRichEditorBody()){
        const toggleAgain=findTornCodeEditorToggle()||toggle;
        try{toggleAgain.click();}catch{return false;}
        source=await waitForSourceEditor(new Set(),3000);
      }
    }
    if(!source)return false;
    if(!setEditorContent(source,html,''))return false;

    await sleepMs(120);
    const toggleBack=findTornCodeEditorToggle()||toggle;
    try{toggleBack.click();}catch{return false;}
    return waitForRichBranding(2200);
  }

  function composeFormattingNotice(text,kind='waiting'){
    let box=document.getElementById('mm-cu-compose-format-status');
    if(!box){
      box=document.createElement('div');box.id='mm-cu-compose-format-status';
      box.style.cssText='position:fixed;right:12px;bottom:68px;z-index:2147483647;max-width:420px;padding:8px 10px;border-radius:6px;font:12px Arial,sans-serif;box-shadow:0 5px 18px #0009;';
      document.body.appendChild(box);
    }
    box.style.background=kind==='error'?'#4a1717':'#17313a';
    box.style.border='1px solid '+(kind==='error'?'#a34a4a':'#397d8d');
    box.style.color='#f3f3f3';
    box.textContent=String(text||'');
  }

  function clearComposeFormattingNotice(){document.getElementById('mm-cu-compose-format-status')?.remove();}

  async function fillMessageComposer(){
    if(!location.pathname.includes('messages.php'))return;
    const payload=composePayloadForCurrentPage();if(!payload||(!payload.subject&&!payload.body&&!payload.bodyHtml))return;
    let attempts=0,richFailures=0,observer=null,timer=null,inFlight=false,finished=false;
    const requiresBranding=Boolean(payload.bodyHtml);
    const stop=(success,rich=true)=>{
      finished=true;if(timer)clearInterval(timer);if(observer)observer.disconnect();
      if(success){
        GM_deleteValue(PENDING_COMPOSE_KEY);clearComposeFormattingNotice();
        statusText=rich?'Message prepared in Torn composer with branded formatting. Send remains manual.':'Message prepared in Torn composer. Send remains manual.';
      }else if(requiresBranding){
        statusText='Branded formatting is not ready. Draft was NOT downgraded to plain text.';
        composeFormattingNotice('Formatting is not ready yet. Do not send this draft. Reopen it from MM_Customers to retry branded formatting.','error');
      }
    };
    const tryFill=async()=>{
      if(finished||inFlight)return false;inFlight=true;attempts++;
      try{
        const subject=findComposeSubjectInput();let subjectOK=false;
        if(subject){setNativeValue(subject,payload.subject);await sleepMs(25);subjectOK=String(subject.value||'').trim()===String(payload.subject||'').trim();}
        let bodyOK=false,rich=requiresBranding;

        if(requiresBranding){
          bodyOK=await injectHtmlThroughTornCodeEditor(payload.bodyHtml);
          if(!bodyOK){
            richFailures++;
            const body=findComposeRichEditorBody();
            if(body)bodyOK=setEditorContent(body,payload.body,payload.bodyHtml)&&await waitForRichBranding(1200);
          }
          if(!bodyOK){
            statusText='Waiting for Torn rich editor… branded message will retry automatically.';
            composeFormattingNotice('Preparing branded message… do not send until this notice disappears.');
            if(attempts>=40){stop(false,true);return false;}
            return false;
          }
        }else{
          const body=findComposeBodyInput(subject)||findComposeRichEditorBody();
          if(body)bodyOK=setEditorContent(body,payload.body,'');
        }

        if(subjectOK&&bodyOK){stop(true,rich);return true;}
        if(attempts>=40)stop(false,rich);
        return false;
      }finally{inFlight=false;}
    };
    tryFill();timer=setInterval(()=>{if(!finished)tryFill();},900);observer=new MutationObserver(()=>{if(!finished&&attempts<40)tryFill();});observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function visibleSendButton(){
    return [...document.querySelectorAll('button,input[type="submit"],[role="button"]')].filter(visible).find(el=>{
      const text=String(el.innerText||el.value||el.getAttribute?.('aria-label')||el.getAttribute?.('title')||'').trim().toLowerCase();
      if(!/(^|\s)send(\s|$)|send message/.test(text))return false;
      return !/search|friend|money|cash|trade|gift/.test(elementMeta(el));
    })||null;
  }

  function composeStillVisible(expectedSubject=''){
    const subject=findComposeSubjectInput();
    if(!subject||!visible(subject))return false;
    if(!expectedSubject)return true;
    const value=String(subject.value||'').trim();
    return !value||value===String(expectedSubject||'').trim();
  }

  function messageSentConfirmationVisible(){
    return [...document.querySelectorAll('[role="alert"],[class*="success" i],[class*="message" i],[class*="notification" i],[class*="toast" i]')]
      .filter(visible).slice(-80).some(el=>/message\s+(has\s+been\s+)?sent|sent\s+successfully|successfully\s+sent/.test(String(el.innerText||el.textContent||'').trim().toLowerCase()));
  }

  async function completeTrackedSend(pending){
    const id=String(pending?.playerId||'').trim(),kind=String(pending?.kind||'');
    if(!id||!kind)return false;
    await updateCustomerState(draft=>{
      const customer=draft.customers?.[id];
      const at=new Date().toISOString();
      if(kind==='welcome'&&customer){
        customer.contacted=true;customer.firstMessageSent=true;customer.messageCount=n(customer.messageCount)+1;customer.lastContacted=at;
        const coupon=logic.issueCoupon(draft,id,at);if(hasRealUsername(customer))coupon.playerName=customer.name;
      }else if(kind==='reminder'&&customer){
        customer.contacted=true;customer.messageCount=n(customer.messageCount)+1;customer.lastContacted=at;
      }else if(kind==='restock'){
        const sub=draft.subscribers?.[id];
        if(sub?.pendingNotification){
          const notice={...sub.pendingNotification,playerId:id,playerName:sub.name,sentAt:at};
          sub.lastNotified=at;sub.pendingNotification=null;
          draft.notificationHistory=Array.isArray(draft.notificationHistory)?draft.notificationHistory:[];
          draft.notificationHistory.unshift(notice);draft.notificationHistory=draft.notificationHistory.slice(0,500);
        }
      }
    });
    GM_deleteValue(PENDING_SEND_KEY);
    statusText=kind==='welcome'?'Welcome send detected; customer updated and coupon issued.':kind==='restock'?'Restock send detected; notification state updated.':'Message send detected; customer contact history updated.';
    return true;
  }

  function installMessageSendDetector(){
    if(!location.pathname.includes('messages.php'))return;
    const pending=GM_getValue(PENDING_SEND_KEY,null),id=String(pending?.playerId||'').trim(),createdAt=Number(pending?.createdAt||0);
    if(!id||!createdAt||Date.now()-createdAt>30*60*1000){if(pending)GM_deleteValue(PENDING_SEND_KEY);return;}
    let armed=true,clickedAt=0,verifyTimer=null,scanTimer=null,observer=null;
    const cleanup=()=>{armed=false;if(verifyTimer)clearInterval(verifyTimer);if(scanTimer)clearInterval(scanTimer);if(observer)observer.disconnect();document.removeEventListener('click',clickHandler,true);document.removeEventListener('submit',submitHandler,true);};
    const verifyAfterSend=()=>{
      if(!armed||!clickedAt)return;
      const confirmed=messageSentConfirmationVisible()||!location.hash.includes('compose')||!composeStillVisible(pending.subject);
      if(confirmed){
        cleanup();completeTrackedSend(pending).catch(error=>console.warn('[MM Customers] Sent-message state update failed',error));return;
      }
      if(Date.now()-clickedAt>=6000){
        clickedAt=0;if(verifyTimer){clearInterval(verifyTimer);verifyTimer=null;}
        GM_setValue(PENDING_SEND_KEY,{...pending,state:'awaiting-send',lastFailedVerifyAt:Date.now()});
      }
    };
    const arm=()=>{
      if(!armed||clickedAt)return;
      clickedAt=Date.now();GM_setValue(PENDING_SEND_KEY,{...pending,state:'send-clicked',sendClickedAt:clickedAt});
      verifyTimer=setInterval(verifyAfterSend,250);
      for(const delay of [350,1200,3000,5200])setTimeout(verifyAfterSend,delay);
    };
    const clickHandler=event=>{
      const el=event.target?.closest?.('button,input[type="submit"],[role="button"]');
      if(!el||!visible(el))return;
      const text=String(el.innerText||el.value||el.getAttribute?.('aria-label')||el.getAttribute?.('title')||'').trim().toLowerCase();
      if(/(^|\s)send(\s|$)|send message/.test(text)&&!/search|friend|money|cash|trade|gift/.test(elementMeta(el)))arm();
    };
    const submitHandler=event=>{const form=event.target;if(form instanceof HTMLFormElement){const send=visibleSendButton();if(send&&(form.contains(send)||composeStillVisible(pending.subject)))arm();}};
    document.addEventListener('click',clickHandler,true);document.addEventListener('submit',submitHandler,true);
    scanTimer=setInterval(()=>{if(!armed)return;if(Date.now()-createdAt>30*60*1000){cleanup();return;}if(clickedAt)verifyAfterSend();},500);
    observer=new MutationObserver(()=>{if(armed&&clickedAt)verifyAfterSend();});
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','disabled']});
  }

  function runPageHelpers(){fillMessageComposer();installMessageSendDetector();}

  function onRouteChanged(){
    if(routeTimer)clearTimeout(routeTimer);
    routeTimer=setTimeout(()=>{if(location.href===lastHref)return;lastHref=location.href;runPageHelpers();},120);
  }

  function installRouteHooks(){
    window.addEventListener('hashchange',onRouteChanged);window.addEventListener('popstate',onRouteChanged);
    for(const method of ['pushState','replaceState']){
      const original=history[method];if(original?.__mmCustomersWrapped)continue;
      const wrapped=function(...args){const result=original.apply(this,args);onRouteChanged();return result;};
      wrapped.__mmCustomersWrapped=true;history[method]=wrapped;
    }
  }

  function refundProfileUrl(refund){
    const url=new URL('https://www.torn.com/profiles.php');
    url.searchParams.set('XID',String(refund.playerId||''));
    return url.toString();
  }

  function customerRowsHtml(rows,emptyText='No customer history yet.'){
    if(!rows.length)return card('<b>Customers</b><div class="mm-cu-muted">'+esc(emptyText)+'</div>');
    return rows.map(row=>{
      const coupon=state?.coupons?.[row.id]||logic.ensureCoupon(state,row);
      const q=logic.couponQualification(state,coupon);
      const sub=state?.subscribers?.[row.id];
      const realName=hasRealUsername(row),displayName=realName?row.name:'Resolving name…';
      const firstContact=!row.contacted&&!row.firstMessageSent&&!n(row.messageCount);
      return '<details class="mm-cu-member"><summary><span><b>'+esc(displayName)+'</b> <span class="mm-cu-muted">['+esc(row.id)+'] · '+esc(row.segment)+'</span></span><span class="mm-cu-muted">'+money(row.monetary)+' · '+fmt(row.frequency)+' purchase(s)</span></summary>'+
        '<div class="mm-cu-detail"><div class="mm-cu-tiles">'+tile('SPENT',money(row.monetary))+tile('UNITS',fmt(row.units))+tile('LAST',when(row.lastPurchase))+tile('COUPON',coupon?.code||'—')+tile('USES LEFT',fmt(logic.couponRemaining(coupon)))+tile('CASHBACK',q.qualified?money(q.cashback):q.reason)+'</div>'+
        '<div class="mm-cu-actions" style="margin-top:5px;">'+
          '<button data-welcome="'+esc(row.id)+'" style="'+button(true)+'">'+(firstContact?'Prepare Welcome':'Prepare Message')+'</button>'+
          (coupon?.issuedAt?'<button data-reminder="'+esc(row.id)+'" style="'+button(q.qualified)+'">Coupon Reminder</button>':'')+
          '<button data-subscribe="'+esc(row.id)+'" style="'+button()+'">'+(sub?'Restock−':'Restock+')+'</button>'+
          (q.qualified?'<button data-refund-start="'+esc(row.id)+'" style="'+button(true)+'">Create Cashback</button>':'')+
          '<button data-profile="'+esc(row.id)+'" style="'+button()+'">Profile</button>'+
        '</div></div></details>';
    }).join('');
  }

  function customersHtml(){
    const rows=logic.customerRfmRows(state||{}).filter(row=>!state?.removedCustomers?.[row.id]).slice(0,100);
    return customerRowsHtml(rows,'No customer history yet. Sales sync runs automatically after the API key is saved.');
  }

  function newCustomersHtml(){
    return customerRowsHtml(newCustomerRows(),'No new customers require first-contact follow-up.');
  }

  function couponsHtml(){
    const rows=Object.values(state?.coupons||{}).sort((a,b)=>String(a.playerName||'').localeCompare(String(b.playerName||'')));
    if(!rows.length)return card('No coupons yet.');
    return rows.map(c=>{
      const q=logic.couponQualification(state,c);
      return card('<div class="mm-cu-row"><div class="mm-cu-main"><b>'+esc(c.playerName)+' ['+esc(c.playerId)+']</b><div class="mm-cu-muted">'+esc(c.code)+' · issued '+when(c.issuedAt)+' · '+logic.couponRemaining(c)+' use(s) left</div></div><div class="'+(q.qualified?'mm-cu-good':'mm-cu-muted')+'">'+esc(q.qualified?money(q.cashback)+' eligible':q.reason)+'</div></div>');
    }).join('');
  }

  function restockHtml(){
    const rows=Object.values(state?.subscribers||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    if(!rows.length)return card('No restock subscribers. Add them from Customers when they request RESTOCK.');
    return rows.map(sub=>{
      const matching=logic.currentBazaarRows(state,sub);
      return '<details class="mm-cu-member"><summary><span><b>'+esc(sub.name||sub.id)+'</b> <span class="mm-cu-muted">['+esc(sub.id)+']</span></span><span class="mm-cu-muted">'+matching.length+' matching SKU(s)</span></summary>'+
        '<div class="mm-cu-detail"><div class="mm-cu-muted">Interests: '+esc(sub.interests?.length?sub.interests.join(', '):'All items')+' · last notified '+when(sub.lastNotified)+'</div>'+
        '<div class="mm-cu-actions" style="margin-top:5px;"><button data-restock-alert="'+esc(sub.id)+'" style="'+button(true)+'">Prepare Alert</button>'+(sub.pendingNotification?'<button data-restock-sent="'+esc(sub.id)+'" style="'+button(true)+'">Mark Sent</button><button data-restock-dismiss="'+esc(sub.id)+'" style="'+button()+'">Dismiss Pending</button>':'')+'<button data-restock-interests="'+esc(sub.id)+'" style="'+button()+'">Interests</button><button data-restock-remove="'+esc(sub.id)+'" style="'+button()+'">Remove</button></div></div></details>';
    }).join('');
  }

  function refundsHtml(){
    const eligible=cashbackEligibleRows();
    const refunds=Object.values(state?.refunds||{}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));

    const eligibleHtml=card(
      '<div class="mm-cu-row"><div class="mm-cu-main"><b>Cashback eligible now</b><div class="mm-cu-muted">'+fmt(eligible.length)+' customer'+(eligible.length===1?'':'s')+' currently qualify from post-coupon sales in the active 24-hour window.</div></div></div>'+
      (eligible.length?eligible.map(row=>{
        const q=row.qualification,coupon=row.coupon,customer=row.customer;
        const displayName=hasRealUsername(customer)?customer.name:(coupon.playerName&&!/^\d+$/.test(String(coupon.playerName))?coupon.playerName:'Resolving name…');
        const purchaseLines=(q.sales||[]).map(sale=>'<div class="mm-cu-mini" style="margin-top:2px;">• '+esc(salePurchaseLine(sale))+'</div>').join('');
        return '<div class="mm-cu-row"><div class="mm-cu-main">'+
          '<b>'+esc(displayName)+' ['+esc(row.id)+'] · '+money(q.cashback)+' cashback</b>'+
          '<div class="mm-cu-muted">Coupon '+esc(coupon.code)+' · '+fmt(q.sales?.length||0)+' qualifying purchase'+((q.sales?.length||0)===1?'':'s')+' · '+money(q.total)+' qualifying total</div>'+
          '<div style="margin-top:4px;">'+purchaseLines+'</div>'+
          '</div><div class="mm-cu-actions"><button data-cashback-reminder="'+esc(row.id)+'" style="'+button(true)+'">Send Cashback Reminder</button></div></div>';
      }).join(''):'<div class="mm-cu-muted" style="margin-top:5px;">No customers are currently eligible for cashback.</div>')
    );

    const historyHtml=refunds.length
      ? card('<b>Refund history</b>')+refunds.map(r=>card('<div class="mm-cu-row"><div class="mm-cu-main"><b>'+esc(r.playerName)+' · '+money(r.amount)+'</b><div class="mm-cu-muted">'+esc(r.status)+' · purchases '+money(r.purchaseTotal)+' · '+when(r.createdAt)+'</div></div>'+
          (r.status==='pending'?'<div class="mm-cu-actions"><button data-refund-open="'+esc(r.id)+'" style="'+button(true)+'">Open Profile</button><button data-refund-paid="'+esc(r.id)+'" style="'+button()+'">Mark Paid</button><button data-refund-cancel="'+esc(r.id)+'" style="'+button()+'">Cancel</button></div>':'')+'</div>')).join('')
      : card('<b>Refund history</b><div class="mm-cu-muted">No cashback refunds recorded yet.</div>');

    return eligibleHtml+historyHtml;
  }

  function settingsHtml(){
    const saved=Boolean(apiKey());
    return card(
      '<b>Torn API</b><div class="mm-cu-muted">MM Customers keeps its key in this userscript\'s Tampermonkey storage only.</div>'+
      '<div class="mm-cu-actions" style="margin-top:6px;"><input id="mm-cu-api" class="mm-cu-input" type="password" autocomplete="off" placeholder="'+(saved?'API key saved — enter to replace':'Torn API key')+'" style="flex:1 1 260px;min-width:180px;"><button id="mm-cu-save-api" style="'+button(true)+'">Save</button><button id="mm-cu-clear-api" style="'+button()+'">Clear</button></div>'+
      '<div class="mm-cu-mini" style="margin-top:5px;">Purpose: User Log 1226 for Bazaar customer/sales history. Restock alerts read the current Bazaar snapshot owned by MM Inventory Manager/ROI Tracker. The key is not copied into IndexedDB/localStorage and is not shared with other scripts.</div>'
    );
  }

  function render(){
    const root=document.getElementById(ROOT_ID);
    if(!root)return;
    const newCount=newCustomerRows().length;
    if(activeView==='new'&&!newCount)activeView='customers';
    const view=activeView==='customers'?customersHtml():activeView==='new'?newCustomersHtml():activeView==='coupons'?couponsHtml():activeView==='restock'?restockHtml():activeView==='refunds'?refundsHtml():settingsHtml();
    root.innerHTML=
      '<div class="mm-cu-head"><div><b style="font-size:14px;">MM_Customers</b><div class="mm-cu-muted">v'+VERSION+' · CUSTOMER / COUPON / CASHBACK / RESTOCK</div></div><button id="mm-cu-close" style="'+button()+'">×</button></div>'+
      '<div class="mm-cu-body">'+
        '<div class="mm-cu-tabs">'+
          '<button data-view="customers" style="'+button(activeView==='customers')+'">Customers</button>'+
          (newCount?'<button data-view="new" style="'+button(activeView==='new')+'">New Customers ('+fmt(newCount)+')</button>':'')+
          '<button data-view="coupons" style="'+button(activeView==='coupons')+'">Coupons</button>'+
          '<button data-view="restock" style="'+button(activeView==='restock')+'">Restock</button>'+
          '<button data-view="refunds" style="'+button(activeView==='refunds')+'">Refunds</button>'+
          '<button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div class="mm-cu-actions" style="margin-top:4px;"><button id="mm-cu-refresh-sales" style="'+button(true)+'">Refresh Sales</button></div>'+
        '<div class="mm-cu-status">'+esc(busy?'Working…':statusText)+'</div>'+
        '<div class="mm-cu-scroll">'+view+'</div>'+
      '</div>';
    core.makePanelDraggable?.(root,root.querySelector('.mm-cu-head'),'customers',window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'82px'});
    bind();
  }

  function bind(){
    const root=document.getElementById(ROOT_ID);if(!root)return;
    root.querySelector('#mm-cu-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'customers';render();}));
    const run=async(label,fn)=>{
      if(busy)return;
      busy=true;statusText=label;render();
      try{const result=await fn();statusText=typeof result==='string'?result:'Done.';}
      catch(error){statusText=error?.message||String(error);}
      finally{busy=false;render();}
    };
    root.querySelector('#mm-cu-refresh-sales')?.addEventListener('click',()=>run('Refreshing Bazaar customer sales…',async()=>{
      const r=await refreshSales();
      if(newCustomerRows().length)activeView='new';
      return 'Sales refreshed: '+r.imported+' new · '+r.checked+' checked'+(r.newCustomers?' · '+r.newCustomers+' new customer'+(r.newCustomers===1?'':'s'):'')+(r.repairedNames?' · '+r.repairedNames+' name'+(r.repairedNames===1?'':'s')+' resolved':'')+(r.rejected?' · '+r.rejected+' rejected':'')+'.';
    }));
    root.querySelector('#mm-cu-save-api')?.addEventListener('click',()=>{
      const value=root.querySelector('#mm-cu-api')?.value||'';saveApiKey(value);
      statusText=value.trim()?'Customers API key saved locally. Syncing automatically…':'Enter an API key first.';render();
      if(value.trim())setTimeout(()=>autoRefreshCustomers({force:true,switchToNew:true}),50);
    });
    root.querySelector('#mm-cu-clear-api')?.addEventListener('click',()=>{saveApiKey('');statusText='Customers API key cleared.';render();});

    root.querySelectorAll('[data-welcome]').forEach(b=>b.addEventListener('click',()=>run('Preparing customer message…',async()=>{
      const id=b.dataset.welcome;
      let customer=state?.customers?.[id];if(!customer)throw new Error('Customer not found.');
      if(!hasRealUsername(customer)){
        const name=await fetchTornUsername(id);
        await updateCustomerState(draft=>applyUsername(draft,id,name));
        customer=state?.customers?.[id];
      }
      const coupon=state?.coupons?.[id]||logic.ensureCoupon(state,customer);
      const first=!customer.contacted&&!customer.firstMessageSent&&!n(customer.messageCount);
      const msg=customerMessage(customer,coupon,false);
      composeMessage(id,msg.subject,msg.body,msg.bodyHtml,{kind:first?'welcome':'reminder'});
      return 'Opening Torn composer for '+customer.name+'. Send remains manual; CRM will update after Torn confirms Send.';
    })));
    root.querySelectorAll('[data-reminder]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.reminder;const customer=state?.customers?.[id];const coupon=state?.coupons?.[id];if(!customer||!coupon)return;
      const msg=customerMessage(customer,coupon,true);composeMessage(id,msg.subject,msg.body,msg.bodyHtml,{kind:'reminder'});
    }));
    root.querySelectorAll('[data-subscribe]').forEach(b=>b.addEventListener('click',()=>run('Updating restock subscription…',async()=>{
      const id=b.dataset.subscribe;
      await updateCustomerState(draft=>{if(draft.subscribers[id])logic.unsubscribeCustomer(draft,id);else logic.subscribeCustomer(draft,id);});
      return state?.subscribers?.[id]?'Restock alerts enabled.':'Restock alerts updated.';
    })));
    root.querySelectorAll('[data-profile]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/profiles.php?XID='+encodeURIComponent(b.dataset.profile);}));

    root.querySelectorAll('[data-cashback-reminder]').forEach(b=>b.addEventListener('click',()=>run('Preparing cashback eligibility reminder…',async()=>{
      const id=String(b.dataset.cashbackReminder||'').trim();
      let customer=state?.customers?.[id];const coupon=state?.coupons?.[id];
      if(!customer||!coupon)throw new Error('Customer/coupon not found.');
      const q=logic.couponQualification(state,coupon);
      if(!q.qualified)throw new Error(q.reason||'Customer is no longer eligible for cashback.');
      if(!hasRealUsername(customer)){
        const name=await fetchTornUsername(id);
        await updateCustomerState(draft=>applyUsername(draft,id,name));
        customer=state?.customers?.[id]||customer;
      }
      const freshCoupon=state?.coupons?.[id]||coupon;
      const freshQ=logic.couponQualification(state,freshCoupon);
      if(!freshQ.qualified)throw new Error(freshQ.reason||'Customer is no longer eligible for cashback.');
      const msg=cashbackEligibilityReminderMessage(customer,freshCoupon,freshQ);
      composeMessage(id,msg.subject,msg.body,msg.bodyHtml,{kind:'reminder'});
      return 'Opening cashback reminder for '+customer.name+' · '+money(freshQ.cashback)+' refund on '+money(freshQ.total)+' qualifying purchases. Send remains manual.';
    })));

    root.querySelectorAll('[data-refund-start]').forEach(b=>b.addEventListener('click',()=>run('Creating cashback record…',async()=>{
      let refund;await updateCustomerState(draft=>{refund=logic.createRefund(draft,b.dataset.refundStart);});
      return 'Pending cashback created: '+money(refund.amount)+'. Send money manually, then Mark Paid.';
    })));

    root.querySelectorAll('[data-restock-alert]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.restockAlert;const sub=state?.subscribers?.[id];if(!sub)return;
      const rows=logic.currentBazaarRows(state,sub);if(!rows.length){statusText='No matching current Bazaar inventory. Refresh MM Inventory Manager/ROI Tracker first.';render();return;}
      const msg=restockMessage(sub,rows);
      await updateCustomerState(draft=>{const s=draft.subscribers[id];if(s){s.lastPrepared=new Date().toISOString();s.pendingNotification={id:'notice-'+Date.now(),type:'bazaar-inventory',preparedAt:s.lastPrepared,itemCount:rows.length};}});
      composeMessage(id,msg.subject,msg.body,msg.bodyHtml,{kind:'restock',noticeId:state?.subscribers?.[id]?.pendingNotification?.id||null});
    }));
    root.querySelectorAll('[data-restock-sent]').forEach(b=>b.addEventListener('click',()=>run('Marking restock alert sent…',async()=>{
      const id=b.dataset.restockSent;
      await updateCustomerState(draft=>{
        const sub=draft.subscribers[id];if(!sub?.pendingNotification)throw new Error('No pending restock alert.');
        const sentAt=new Date().toISOString(),notice={...sub.pendingNotification,playerId:id,playerName:sub.name,sentAt};
        sub.lastNotified=sentAt;sub.pendingNotification=null;
        draft.notificationHistory=Array.isArray(draft.notificationHistory)?draft.notificationHistory:[];
        draft.notificationHistory.unshift(notice);draft.notificationHistory=draft.notificationHistory.slice(0,500);
      });
      return 'Restock alert marked sent.';
    })));
    root.querySelectorAll('[data-restock-dismiss]').forEach(b=>b.addEventListener('click',()=>run('Dismissing pending restock alert…',async()=>{
      const id=b.dataset.restockDismiss;await updateCustomerState(draft=>{if(draft.subscribers[id])draft.subscribers[id].pendingNotification=null;});
      return 'Pending restock alert dismissed.';
    })));
    root.querySelectorAll('[data-restock-interests]').forEach(b=>b.addEventListener('click',()=>run('Updating interests…',async()=>{
      const id=b.dataset.restockInterests;const sub=state?.subscribers?.[id];if(!sub)throw new Error('Subscriber not found.');
      const value=prompt('Comma-separated item names or item IDs. Blank = all items.',(sub.interests||[]).join(', '));if(value==null)return 'No change.';
      await updateCustomerState(draft=>{draft.subscribers[id].interests=[...new Set(value.split(',').map(x=>x.trim()).filter(Boolean))];});
      return 'Restock interests updated.';
    })));
    root.querySelectorAll('[data-restock-remove]').forEach(b=>b.addEventListener('click',()=>run('Removing subscriber…',async()=>{await updateCustomerState(draft=>logic.unsubscribeCustomer(draft,b.dataset.restockRemove));return 'Restock subscriber removed.';})));

    root.querySelectorAll('[data-refund-open]').forEach(b=>b.addEventListener('click',()=>{const r=state?.refunds?.[b.dataset.refundOpen];if(r)location.href=refundProfileUrl(r);}));
    root.querySelectorAll('[data-refund-paid]').forEach(b=>b.addEventListener('click',()=>run('Saving cashback completion…',async()=>{let r;await updateCustomerState(draft=>{r=logic.completeRefund(draft,b.dataset.refundPaid);});return 'Cashback '+money(r.amount)+' marked paid.';})));
    root.querySelectorAll('[data-refund-cancel]').forEach(b=>b.addEventListener('click',()=>run('Cancelling cashback…',async()=>{await updateCustomerState(draft=>logic.cancelRefund(draft,b.dataset.refundCancel));return 'Pending cashback cancelled.';})));
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
    core.setDockLauncherActive?.('customers',true);
    reloadState()
      .then(()=>{render();return autoRefreshCustomers({force:false,switchToNew:true});})
      .catch(error=>{statusText=error?.message||String(error);render();});
  }
  function close(){
    const root=document.getElementById(ROOT_ID);if(root)root.style.display='none';
    core.setDockLauncherActive?.('customers',false);
  }

  function createLauncher(){
    if(!document.body)return;
    injectStyle();
    if(core.registerDockLauncher){
      const b=core.registerDockLauncher({
        id:'customers',label:'MM_Customers',accent:'#376f93',
        icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.4-4 2.2-6 4.5-6s4.1 2 4.5 6M13 19c.2-3 1.4-4.8 3.2-4.8 1.9 0 3.1 1.8 3.3 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
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

  function initializeCustomers(){
    createLauncher();installChannel();installRouteHooks();runPageHelpers();
    if(apiKey())setTimeout(()=>autoRefreshCustomers({force:false,switchToNew:false}),1200);
    setInterval(()=>{if(apiKey()&&document.visibilityState==='visible')autoRefreshCustomers({force:false,switchToNew:false});},AUTO_SYNC_MS);
  }

  if(document.body)initializeCustomers();
  else window.addEventListener('DOMContentLoaded',initializeCustomers,{once:true});
})();