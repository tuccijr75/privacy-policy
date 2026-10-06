// ==UserScript==
// @name         MM Torn Intel Restock Probe
// @namespace    manic-mike.torn.qa
// @version      0.1.0-qa.1
// @description  Standalone QA probe for Torn Intel live abroad stock, history authentication, and transparent restock ETA modeling.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      torn-intel.com
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID='mm-ti-restock-probe';
  const BUTTON_ID='mm-ti-restock-probe-button';
  const CLIENT_KEY='mm_ti_client_key_v1';
  const LAST_KEYED_AT='mm_ti_last_keyed_at_v1';
  const TRAVEL_URL='https://torn-intel.com/api/v1/foreign-stock/travel-table';
  const HISTORY_URL='https://torn-intel.com/api/v1/public/foreign-stock/history';
  const KEYED_COOLDOWN_MS=65_000;
  const MAX_TRANSITION_GAP_MS=5*60_000;
  const COUNTRIES={
    mex:'Mexico',cay:'Cayman Islands',can:'Canada',haw:'Hawaii',uni:'United Kingdom',
    arg:'Argentina',swi:'Switzerland',jap:'Japan',chi:'China',uae:'UAE',sou:'South Africa'
  };

  let lastDiagnostic=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const n=value=>Number.isFinite(Number(value))?Number(value):0;
  const iso=value=>{
    const ms=typeof value==='number'?value:Date.parse(String(value||''));
    return Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;
  };
  const duration=ms=>{
    if(!Number.isFinite(ms))return '—';
    const sign=ms<0?'-':'';
    let sec=Math.round(Math.abs(ms)/1000);
    const h=Math.floor(sec/3600);sec-=h*3600;
    const m=Math.floor(sec/60);sec-=m*60;
    return sign+(h?h+'h ':'')+(m||h?m+'m ':'' )+sec+'s';
  };
  const age=ms=>Number.isFinite(ms)&&ms>=0?duration(ms)+' ago':'—';
  const median=values=>percentile(values,0.5);
  function percentile(values,p){
    const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(!a.length)return NaN;
    if(a.length===1)return a[0];
    const pos=(a.length-1)*Math.max(0,Math.min(1,p));
    const lo=Math.floor(pos),hi=Math.ceil(pos),frac=pos-lo;
    return a[lo]+(a[hi]-a[lo])*frac;
  }

  function parseHeaders(raw){
    const out={};
    String(raw||'').split(/\r?\n/).forEach(line=>{
      const i=line.indexOf(':');
      if(i>0)out[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim();
    });
    return out;
  }

  function safeJson(text){
    try{return JSON.parse(String(text||''));}catch{return null;}
  }

  function gmGet(url,{key=''}={}){
    return new Promise(resolve=>{
      const started=Date.now();
      GM_xmlhttpRequest({
        method:'GET',
        url,
        headers:key?{'X-Torn-Intel-Key':key}:{},
        timeout:15_000,
        onload:r=>resolve({
          ok:r.status>=200&&r.status<300,
          status:r.status,
          data:safeJson(r.responseText),
          text:String(r.responseText||''),
          headers:parseHeaders(r.responseHeaders),
          fetchedAt:Date.now(),
          elapsedMs:Date.now()-started,
          transport:'GM_xmlhttpRequest'
        }),
        onerror:e=>resolve({ok:false,status:0,error:'network-error',detail:String(e?.error||e?.message||''),fetchedAt:Date.now(),elapsedMs:Date.now()-started,transport:'GM_xmlhttpRequest'}),
        ontimeout:()=>resolve({ok:false,status:0,error:'timeout',fetchedAt:Date.now(),elapsedMs:Date.now()-started,transport:'GM_xmlhttpRequest'})
      });
    });
  }

  async function nativeTravelProbe(){
    const started=Date.now();
    try{
      const r=await fetch(TRAVEL_URL,{method:'GET',credentials:'omit',cache:'no-store'});
      const text=await r.text();
      return {
        ok:r.ok,status:r.status,data:safeJson(text),text,
        fetchedAt:Date.now(),elapsedMs:Date.now()-started,transport:'native fetch'
      };
    }catch(error){
      return {ok:false,status:0,error:'fetch-blocked',detail:String(error?.message||error),fetchedAt:Date.now(),elapsedMs:Date.now()-started,transport:'native fetch'};
    }
  }

  function normalizeHistory(raw){
    const points=Array.isArray(raw?.points)?raw.points:[];
    const normalized=points.map(row=>({
      t:Date.parse(String(row?.t||'')),
      quantity:Math.max(0,n(row?.quantity)),
      cost:Math.max(0,n(row?.cost)),
      marketValue:Math.max(0,n(row?.marketValue))
    })).filter(row=>Number.isFinite(row.t)&&row.t>0).sort((a,b)=>a.t-b.t);
    const dedup=[];
    for(const row of normalized){
      if(dedup.length&&dedup[dedup.length-1].t===row.t)dedup[dedup.length-1]=row;
      else dedup.push(row);
    }
    return dedup;
  }

  function deriveRestockModel(rawPoints,now=Date.now()){
    const points=normalizeHistory({points:rawPoints});
    const cycles=[];
    let zeroStart=null;
    let zeroStartGap=0;
    let previous=null;
    let hasSeenPositive=false;

    for(const row of points){
      if(row.quantity>0){
        if(zeroStart!==null){
          const restockGap=previous?row.t-previous.t:Infinity;
          const delay=row.t-zeroStart;
          const ambiguous=zeroStartGap>MAX_TRANSITION_GAP_MS||restockGap>MAX_TRANSITION_GAP_MS;
          if(delay>0)cycles.push({emptyObservedAt:zeroStart,restockedAt:row.t,delayMs:delay,ambiguous,emptyTransitionGapMs:zeroStartGap,restockTransitionGapMs:restockGap});
          zeroStart=null;
          zeroStartGap=0;
        }
        hasSeenPositive=true;
      }else if(row.quantity===0&&zeroStart===null&&hasSeenPositive){
        zeroStart=row.t;
        zeroStartGap=previous?row.t-previous.t:Infinity;
      }
      previous=row;
    }

    const complete=cycles.filter(c=>!c.ambiguous);
    const delays=complete.map(c=>c.delayMs);
    const med=median(delays),p25=percentile(delays,0.25),p75=percentile(delays,0.75);
    const iqr=p75-p25;
    let confidence='INSUFFICIENT';
    if(delays.length>=3){
      const ratio=Number.isFinite(med)&&med>0?iqr/med:Infinity;
      if(delays.length>=6&&ratio<=0.20)confidence='HIGH';
      else if(ratio<=0.40)confidence='MEDIUM';
      else confidence='LOW';
    }else if(delays.length>0)confidence='LOW';

    const latest=points.at(-1)||null;
    const currentEmpty=Boolean(latest&&latest.quantity===0);
    const currentEmptyObservedAt=currentEmpty?zeroStart:null;
    let eta=null;
    if(currentEmpty&&currentEmptyObservedAt&&delays.length>=3&&Number.isFinite(med)){
      eta={
        centerAt:currentEmptyObservedAt+med,
        earlyAt:currentEmptyObservedAt+p25,
        lateAt:currentEmptyObservedAt+p75,
        remainingMs:currentEmptyObservedAt+med-now,
        overdueByP75Ms:now-(currentEmptyObservedAt+p75)
      };
    }

    return {
      pointCount:points.length,
      cycles,
      usableCycles:complete,
      rejectedCycles:cycles.length-complete.length,
      medianDelayMs:med,
      p25DelayMs:p25,
      p75DelayMs:p75,
      iqrMs:iqr,
      confidence,
      latest,
      currentEmpty,
      currentEmptyObservedAt,
      eta
    };
  }

  function rateSummary(headers={}){
    const policy=headers['ratelimit-policy']||'';
    const limit=headers['ratelimit-limit']||'';
    const remaining=headers['ratelimit-remaining']||'';
    const reset=headers['ratelimit-reset']||'';
    return [policy&&'policy '+policy,limit&&'limit '+limit,remaining&&'remaining '+remaining,reset&&'reset '+reset].filter(Boolean).join(' · ');
  }

  function responseProblem(result){
    const data=result?.data;
    return String(data?.code||data?.error||result?.error||('HTTP '+String(result?.status||0)));
  }

  function findTravelItem(data,country,itemId){
    const pack=data?.stocks?.[country];
    const rows=Array.isArray(pack?.stocks)?pack.stocks:[];
    const row=rows.find(x=>String(x?.id||'')===String(itemId));
    return {pack,row};
  }

  function diagnosticText(diag){
    if(!diag)return 'No probe has run yet.';
    const lines=[
      'MM Torn Intel Restock Probe '+diag.version,
      'Ran: '+new Date(diag.at).toISOString(),
      'Country/item: '+diag.country+' / '+diag.itemId,
      'Native travel: '+diag.native.status,
      'GM travel: '+diag.gm.status,
      'History: '+diag.history.status
    ];
    if(diag.gm.sourceUpdatedAt)lines.push('Travel source updated: '+diag.gm.sourceUpdatedAt);
    if(diag.history.sourceNewestAt)lines.push('History newest point: '+diag.history.sourceNewestAt);
    if(diag.model){
      lines.push('History points: '+diag.model.pointCount);
      lines.push('Usable cycles: '+diag.model.usableCycles);
      lines.push('Rejected ambiguous cycles: '+diag.model.rejectedCycles);
      lines.push('Median empty→restock: '+diag.model.median);
      lines.push('P25–P75: '+diag.model.window);
      lines.push('Confidence: '+diag.model.confidence);
      lines.push('ETA: '+diag.model.eta);
    }
    lines.push('No Torn API key is used or transmitted by this probe.');
    return lines.join('\n');
  }

  function panel(){
    let root=document.getElementById(ROOT_ID);
    if(root)return root;
    root=document.createElement('div');
    root.id=ROOT_ID;
    root.style.cssText='display:none;position:fixed;left:12px;top:72px;z-index:2147483647;width:min(620px,calc(100vw - 24px));max-height:calc(100vh - 90px);overflow:auto;background:#111;color:#eee;border:1px solid #496d7d;border-radius:8px;box-shadow:0 12px 35px #000b;padding:10px;font:12px/1.35 Arial,sans-serif;';
    document.body.appendChild(root);
    return root;
  }

  function buttonStyle(primary=false){
    return 'border:1px solid '+(primary?'#5c8fa8':'#444')+';background:'+(primary?'#244a5d':'#252525')+';color:#eee;border-radius:4px;padding:6px 9px;cursor:pointer;font:12px Arial,sans-serif;';
  }

  function render(message='Ready.'){
    const root=panel();
    const saved=String(GM_getValue(CLIENT_KEY,'')||'').trim();
    root.innerHTML=
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><div style="flex:1;"><b style="font-size:15px;">Torn Intel Restock Probe</b><div style="color:#999;font-size:10px;">QA only · separate from MM_Acquisitions</div></div><button id="mm-ti-close" style="'+buttonStyle()+'">×</button></div>'+
      '<div style="padding:7px;background:#171717;border:1px solid #333;border-radius:5px;margin-bottom:8px;">'+esc(message)+'</div>'+
      '<div style="padding:8px;border:1px solid #333;border-radius:6px;margin-bottom:8px;"><b>Torn Intel client key</b><div style="color:#aaa;margin:4px 0;">This is the free approved Torn Intel application/client key, not your Torn API key. It stays in this userscript\'s GM storage.</div><div style="display:flex;gap:6px;flex-wrap:wrap;"><input id="mm-ti-key" type="password" autocomplete="off" placeholder="'+(saved?'Client key saved — enter to replace':'Approved Torn Intel client key')+'" style="flex:1 1 300px;min-width:220px;background:#191919;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;"><button id="mm-ti-save-key" style="'+buttonStyle(true)+'">Save</button><button id="mm-ti-clear-key" style="'+buttonStyle()+'">Clear</button></div></div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;"><label>Country<select id="mm-ti-country" style="width:100%;background:#191919;color:#eee;border:1px solid #444;padding:6px;">'+Object.entries(COUNTRIES).map(([code,name])=>'<option value="'+code+'" '+(code==='can'?'selected':'')+'>'+esc(name)+' ('+code+')</option>').join('')+'</select></label><label>Item ID<input id="mm-ti-item" value="206" inputmode="numeric" style="width:100%;background:#191919;color:#eee;border:1px solid #444;padding:6px;"></label><label>History hours<input id="mm-ti-hours" value="48" inputmode="numeric" style="width:100%;background:#191919;color:#eee;border:1px solid #444;padding:6px;"></label></div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><button id="mm-ti-run-live" style="'+buttonStyle(true)+'">Test Live Stock</button><button id="mm-ti-run-history" style="'+buttonStyle(true)+'">Test History + ETA</button><button id="mm-ti-copy" style="'+buttonStyle()+'">Copy Diagnostic</button></div>'+
      '<div id="mm-ti-output" style="white-space:normal;"></div>';
    root.querySelector('#mm-ti-close').onclick=()=>{root.style.display='none';};
    root.querySelector('#mm-ti-save-key').onclick=()=>{
      const value=String(root.querySelector('#mm-ti-key').value||'').trim();
      if(value){GM_setValue(CLIENT_KEY,value);render('Torn Intel client key saved locally.');}
      else render('Enter a client key before saving.');
    };
    root.querySelector('#mm-ti-clear-key').onclick=()=>{GM_deleteValue(CLIENT_KEY);GM_deleteValue(LAST_KEYED_AT);render('Torn Intel client key cleared.');};
    root.querySelector('#mm-ti-run-live').onclick=()=>runLive();
    root.querySelector('#mm-ti-run-history').onclick=()=>runHistory();
    root.querySelector('#mm-ti-copy').onclick=async()=>{
      try{await navigator.clipboard.writeText(diagnosticText(lastDiagnostic));render('Sanitized diagnostic copied.');}
      catch{render('Could not copy diagnostic.');}
    };
  }

  function inputs(){
    const root=panel();
    const country=String(root.querySelector('#mm-ti-country')?.value||'can');
    const itemId=Math.max(1,Math.floor(n(root.querySelector('#mm-ti-item')?.value||206)));
    const hours=Math.max(1,Math.min(48,Math.floor(n(root.querySelector('#mm-ti-hours')?.value||48))));
    return {country,itemId,hours};
  }

  function output(html){
    const box=panel().querySelector('#mm-ti-output');
    if(box)box.innerHTML=html;
  }

  async function runLive(){
    const {country,itemId}=inputs();
    output('<div style="padding:8px;border:1px solid #333;border-radius:6px;">Testing native fetch and GM_xmlhttpRequest browser lanes…</div>');
    const [nativeResult,gmResult]=await Promise.all([nativeTravelProbe(),gmGet(TRAVEL_URL)]);
    const found=findTravelItem(gmResult.data,country,itemId);
    const sourceMs=n(found.pack?.update)*1000;
    const item=found.row;
    const status=gmResult.ok
      ?'PASS: GM_xmlhttpRequest reached the anonymous/browser travel-table lane.'
      :'GM travel-table failed: '+responseProblem(gmResult)+'. A client key may be required for this userscript transport.';
    lastDiagnostic={
      version:'0.1.0-qa.1',at:Date.now(),country,itemId,
      native:{status:(nativeResult.ok?'PASS ':'FAIL ')+nativeResult.status},
      gm:{status:(gmResult.ok?'PASS ':'FAIL ')+gmResult.status,sourceUpdatedAt:iso(sourceMs)},
      history:{status:'not run'}
    };
    output(
      '<div style="padding:8px;border:1px solid #333;border-radius:6px;margin-bottom:6px;"><b>'+esc(status)+'</b><div style="margin-top:4px;color:#aaa;">Native fetch: '+esc(nativeResult.ok?'PASS HTTP '+nativeResult.status:'FAIL '+responseProblem(nativeResult))+' · GM: '+esc(gmResult.ok?'PASS HTTP '+gmResult.status:'FAIL '+responseProblem(gmResult))+'</div>'+
      (gmResult.ok?'<div style="margin-top:4px;">Country source age: '+esc(sourceMs?age(Date.now()-sourceMs):'unknown')+' · item: '+esc(item?.name||itemId)+' · quantity: '+esc(item?item.quantity:'not found')+' · cost: '+esc(item?'$'+n(item.cost).toLocaleString():'—')+'</div>':'')+
      (rateSummary(gmResult.headers)?'<div style="margin-top:4px;color:#888;">'+esc(rateSummary(gmResult.headers))+'</div>':'')+
      '</div>'
    );
  }

  async function runHistory(){
    const {country,itemId,hours}=inputs();
    const key=String(GM_getValue(CLIENT_KEY,'')||'').trim();
    if(!key){
      lastDiagnostic={version:'0.1.0-qa.1',at:Date.now(),country,itemId,native:{status:'not run'},gm:{status:'not run'},history:{status:'BLOCKED: approved client key required'}};
      output('<div style="padding:8px;border:1px solid #704545;border-radius:6px;"><b>History not called.</b><div style="margin-top:4px;">Torn Intel requires an approved client key for /public/foreign-stock/history. Save that client key above; do not enter your Torn API key.</div></div>');
      return;
    }
    const last=n(GM_getValue(LAST_KEYED_AT,0));
    const wait=KEYED_COOLDOWN_MS-(Date.now()-last);
    if(last&&wait>0){
      output('<div style="padding:8px;border:1px solid #705f35;border-radius:6px;"><b>Keyed rate-limit guard.</b> Retry in '+esc(duration(wait))+'. The probe enforces a 65-second minimum between keyed calls.</div>');
      return;
    }
    GM_setValue(LAST_KEYED_AT,Date.now());
    output('<div style="padding:8px;border:1px solid #333;border-radius:6px;">Loading '+hours+'h observed history…</div>');
    const url=HISTORY_URL+'?itemId='+encodeURIComponent(itemId)+'&country='+encodeURIComponent(country)+'&hours='+encodeURIComponent(hours);
    const result=await gmGet(url,{key});
    if(!result.ok){
      lastDiagnostic={version:'0.1.0-qa.1',at:Date.now(),country,itemId,native:{status:'not run'},gm:{status:'not run'},history:{status:'FAIL '+result.status+' '+responseProblem(result)}};
      output('<div style="padding:8px;border:1px solid #704545;border-radius:6px;"><b>History failed: '+esc(responseProblem(result))+'</b><div style="margin-top:4px;">HTTP '+esc(result.status)+' · '+esc(result.data?.resolution||'Check client-key approval and rate limit.')+'</div></div>');
      return;
    }
    const points=normalizeHistory(result.data);
    const model=deriveRestockModel(points,Date.now());
    const newest=model.latest?.t||0;
    let etaText='No active ETA.';
    if(model.currentEmpty){
      if(model.eta){
        etaText=new Date(model.eta.centerAt).toLocaleString()+' · '+(model.eta.remainingMs>=0?'in '+duration(model.eta.remainingMs):duration(-model.eta.remainingMs)+' past median');
      }else if(!model.currentEmptyObservedAt){
        etaText='Item is empty, but the start of this sellout is outside/ambiguous in the history window.';
      }else{
        etaText='Item is empty, but fewer than 3 usable completed cycles exist.';
      }
    }else if(model.latest){
      etaText='Item is currently in stock; no restock countdown is needed.';
    }
    lastDiagnostic={
      version:'0.1.0-qa.1',at:Date.now(),country,itemId,
      native:{status:'not run'},gm:{status:'not run'},
      history:{status:'PASS '+result.status,sourceNewestAt:iso(newest)},
      model:{
        pointCount:model.pointCount,usableCycles:model.usableCycles.length,rejectedCycles:model.rejectedCycles,
        median:Number.isFinite(model.medianDelayMs)?duration(model.medianDelayMs):'—',
        window:Number.isFinite(model.p25DelayMs)?duration(model.p25DelayMs)+' – '+duration(model.p75DelayMs):'—',
        confidence:model.confidence,eta:etaText
      }
    };
    const windowText=Number.isFinite(model.p25DelayMs)?duration(model.p25DelayMs)+' – '+duration(model.p75DelayMs):'—';
    output(
      '<div style="padding:8px;border:1px solid #355e49;border-radius:6px;"><b>History PASS · '+model.pointCount.toLocaleString()+' points</b>'+
      '<div style="margin-top:5px;">Usable complete empty→restock cycles: '+model.usableCycles.length+' · rejected ambiguous cycles: '+model.rejectedCycles+'</div>'+
      '<div style="margin-top:5px;">Median delay: <b>'+esc(Number.isFinite(model.medianDelayMs)?duration(model.medianDelayMs):'insufficient')+'</b> · P25–P75: '+esc(windowText)+' · confidence: <b>'+esc(model.confidence)+'</b></div>'+
      '<div style="margin-top:5px;">Current: '+esc(model.currentEmpty?'OUT OF STOCK':'IN STOCK')+' · newest source point: '+esc(newest?age(Date.now()-newest):'unknown')+'</div>'+
      '<div style="margin-top:5px;"><b>ETA:</b> '+esc(etaText)+'</div>'+
      (model.eta?'<div style="margin-top:4px;color:#aaa;">Observed window: '+esc(new Date(model.eta.earlyAt).toLocaleString())+' → '+esc(new Date(model.eta.lateAt).toLocaleString())+'</div>':'')+
      (rateSummary(result.headers)?'<div style="margin-top:4px;color:#888;">'+esc(rateSummary(result.headers))+'</div>':'')+
      '<div style="margin-top:6px;color:#888;">Model rule: complete cycles only; zero/restock transitions with gaps over 5 minutes are rejected; ETA requires at least 3 usable cycles. This is our estimate, not Torn Intel\'s private prediction.</div>'+
      '</div>'
    );
  }

  function createButton(){
    if(document.getElementById(BUTTON_ID)||!document.body)return;
    const b=document.createElement('button');
    b.id=BUTTON_ID;
    b.textContent='TI ETA';
    b.title='MM Torn Intel Restock Probe';
    b.style.cssText='position:fixed;left:10px;bottom:110px;z-index:2147483647;border:1px solid #496d7d;border-radius:5px;background:#183541;color:#e8f4f7;padding:7px 9px;font:12px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0008;';
    b.onclick=()=>{const root=panel();root.style.display=root.style.display==='none'?'block':'none';if(root.style.display==='block')render();};
    document.body.appendChild(b);
  }

  if(document.body)createButton();
  else window.addEventListener('DOMContentLoaded',createButton,{once:true});
})();
