// ==UserScript==
// @name         Morpheus Bazaar Ledger
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      1.0.1
// @description  Shared Torn Bazaar inventory, 50/50 profits, owner-funded sourcing fees and payment acknowledgements.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/Morpheus.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/Morpheus.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==
(() => {
  'use strict';
  if (window.__morpheusLedgerLoaded) return;
  window.__morpheusLedgerLoaded = true;
  const VERSION='1.0.1';
  const read = (k)=>GM_getValue('mledger_'+k,'');
  const write = (k,v)=>GM_setValue('mledger_'+k,String(v).trim());
  const money = n=>'$'+Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
  const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>crypto.randomUUID ? crypto.randomUUID() : 'ml-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const num = (x)=>{const n=Number(String(x??'').replace(/[$,\s]/g,'')); return Number.isSafeInteger(n) ? n : NaN;};
  const cfg=()=>({relay:read('relay'),token:read('token'),torn:read('torn')});
  let state=null, working=false, status='Not connected', lastBazaar=0, showing=false;

  function request(url,body) {
    return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:body?'POST':'GET',url,
      headers:body?{'Content-Type':'text/plain;charset=utf-8'}:{},data:body?JSON.stringify(body):undefined,
      timeout:25000,
      onload:r=>{
        try {
          if(r.status<200||r.status>=300) throw Error('HTTP '+r.status+' from service');
          const data=JSON.parse(r.responseText);
          if(data.error) throw Error(typeof data.error==='object' ? (data.error.error || JSON.stringify(data.error)) : data.error);
          resolve(data);
        } catch(err){reject(Error(err.message+' (check URL, API access, or deployed relay)'));}
      }, onerror:()=>reject(Error('Network request failed')),ontimeout:()=>reject(Error('Request timed out'))}));
  }
  async function relay(op,data) {
    const {relay:base,token}=cfg();
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base)) throw Error('Save a valid Google Apps Script /exec URL in Settings');
    if(token.length<24) throw Error('Save your personal relay access token in Settings');
    const res=await request(base,{token,op,reqId:uuid(),data:data||{}});
    if(!res.ok) throw Error(res.error||'Relay operation failed');
    state=res.state;
    return state;
  }
  function flash(message){status=message;render();}
  async function operation(op,data,label){
    if(working) return;
    working=true;flash(label+'...');
    try { await relay(op,data);flash(label+' completed'); }
    catch(err) {flash('ERROR: '+err.message);alert('Morpheus Ledger: '+err.message);}
    finally { working=false;render(); }
  }
  async function refresh(quiet=false){
    if(working || !cfg().relay || !cfg().token) return;
    working=true;
    try {await relay('state');status='Connected and synchronized';}
    catch(err){status='Sync error: '+err.message; if(!quiet) alert(status);}
    finally {working=false;render();}
  }
  async function connectTorn(quiet=false){
    const key=cfg().torn;
    if(!key) {if(!quiet) alert('Enter your own Torn API key under Settings.');return;}
    try {
      const r=await request('https://api.torn.com/user/?selections=basic&key='+encodeURIComponent(key));
      const id=r.player_id||r.id;
      if(!id) throw Error('Torn did not return a player ID');
      write('player',String(id));write('playerName',r.name||'Unknown');
      if(!quiet)flash('Torn key verified for '+r.name+' ['+id+']');
      return {id,name:r.name};
    } catch(e){if(!quiet)alert('Torn API error: '+e.message);throw e;}
  }
  async function syncBazaar(quiet=false) {
    if(working || (state && state.role!=='owner')) return;
    if(!cfg().torn || !cfg().relay || !cfg().token) return;
    working=true;
    try {
      // This API is read-only. Bazaar stock changes are NOT booked as sales.
      const r=await request('https://api.torn.com/user/?selections=bazaar&key='+encodeURIComponent(cfg().torn));
      if(!Array.isArray(r.bazaar)) throw Error('Bazaar endpoint did not return listings');
      const listings=r.bazaar.map(x=>({itemId:num(x.ID),name:String(x.name||''),qty:num(x.quantity),price:num(x.price)}));
      if(listings.some(x=>!Number.isSafeInteger(x.itemId)||x.itemId<1||x.qty<0||x.price<0)) throw Error('Unexpected Bazaar data');
      // Relay accepts max 300 listings; do not silently truncate or misstate visibility.
      if(listings.length>300) throw Error('More than 300 listings; sync skipped (no data truncated)');
      await relay('snapshot',{listings});
      lastBazaar=Date.now();status='Bazaar listing snapshot synchronized';
    } catch(err){status='Bazaar sync: '+err.message;if(!quiet)alert(status);}
    finally {working=false;render();}
  }
  const host=document.createElement('div');
  host.id='morpheus-ledger-host';
  document.documentElement.appendChild(host);
  const root=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=`
    *,*:before,*:after{box-sizing:border-box} .open{position:fixed;right:16px;bottom:16px;z-index:2147483640;border:0;background:#204fba;color:white;border-radius:28px;padding:12px 17px;font:700 13px system-ui;box-shadow:0 3px 13px #0007;cursor:pointer}
    .panel{position:fixed;z-index:2147483641;right:14px;bottom:60px;width:min(580px,calc(100vw - 24px));max-height:min(85vh,820px);background:#101b2c;color:#ebf1ff;border:1px solid #385070;border-radius:13px;overflow-y:auto;box-shadow:0 12px 45px #000b;font:13px/1.42 system-ui,Arial}
    header{position:sticky;top:0;background:#182a42;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;z-index:1;border-bottom:1px solid #385070} header strong{font-size:15px}
    section{padding:13px;border-bottom:1px solid #2d405a} .small{color:#a5b6ce;font-size:12px} .error{color:#ffb2ab} .notice{background:#203551;border-radius:7px;padding:8px;font-size:12px;margin:8px 0}
    button{font:600 12px system-ui;cursor:pointer;color:#fff;background:#2854aa;border:1px solid #5574ab;border-radius:6px;padding:7px 10px}button:disabled{opacity:.55;cursor:wait}
    .subtle{background:#24354b;border-color:#435b78}.warn{background:#674632;border-color:#966f4b}.row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.row>*{flex-shrink:0}
    .flex{flex:1!important;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{padding:10px;background:#1c3049;border-radius:6px}.metric strong{font-size:17px;display:block}
    label{display:block;margin:8px 0 3px;color:#ccd9e8}input,select,textarea{width:100%;min-width:0;font:13px system-ui;border:1px solid #51657d;border-radius:5px;background:#0e1b2b;padding:8px;color:#fff}textarea{min-height:46px;resize:vertical}
    .line{padding:10px 0;border-top:1px solid #324760}.line:first-child{border-top:0}.name{font-weight:700;font-size:13px}.tag{font-size:11px;background:#2b4565;border-radius:4px;padding:2px 5px}
    details>summary{cursor:pointer;font-weight:700;margin:7px 0} .actions{margin-top:7px}.right{margin-left:auto}.hide{display:none!important}
    .scroller{max-height:320px;overflow-y:auto}.tip{margin:6px 0;color:#b6cce6} .label{color:#9db8d5;font-weight:600}
  `;
  root.appendChild(style);
  const open=document.createElement('button');open.className='open';open.textContent='Bazaar Ledger';root.appendChild(open);
  const panel=document.createElement('div');panel.className='panel hide';root.appendChild(panel);
  open.addEventListener('click',()=>{showing=!showing;panel.classList.toggle('hide',!showing);if(showing){render();refresh(true);}});

  function listing(l){
    const snap=state?.live?.listings||[];
    const match=snap.filter(x=>l.itemId ? x.itemId===l.itemId : x.name.toLowerCase()===l.name.toLowerCase());
    return match.length?match.reduce((a,x)=>a+x.qty,0)+' currently listed' : 'not in latest Bazaar snapshot';
  }
  function uiLot(l){
    const remaining=l.qty-l.sold-l.returned;
    const mode=l.mode==='supplier'?'Morpheus-funded · 50/50':'Owner-funded · '+l.feePct+'% sourcing fee';
    const buttons=[];
    if(state.role==='owner'&&l.status==='proposed')buttons.push(`<button data-act="confirm" data-id="${esc(l.id)}">Confirm receipt/purchase</button><button class="warn" data-act="reject" data-id="${esc(l.id)}">Reject</button>`);
    if(state.role==='supplier'&&l.unitCost===null&&l.mode==='supplier'&&l.status!=='rejected')buttons.push(`<button data-act="price" data-id="${esc(l.id)}">Enter buy price</button>`);
    if(state.role==='owner'&&l.status==='confirmed'&&l.unitCost!==null&&remaining>0)buttons.push(`<button data-act="sale" data-id="${esc(l.id)}">Record sale</button>`);
    if(state.role==='owner'&&l.status==='confirmed'&&l.mode==='supplier'&&remaining>0)buttons.push(`<button class="subtle" data-act="return" data-id="${esc(l.id)}">Return items</button>`);
    return `<div class="line"><div class="row"><span class="name">${esc(l.name)}</span> <span class="tag">${esc(l.status)}</span> <span class="small">Lot ${esc(l.id.slice(0,8))}</span></div>
      <div class="small">${esc(mode)} · ${l.itemId?'ID '+l.itemId+' · ':''}Cost ${l.unitCost===null?'AWAITING PRICE':money(l.unitCost)+'/unit'}</div>
      <div class="small">${remaining} / ${l.qty} units available · ${l.sold} sold · ${l.returned} returned</div>
      ${l.note?`<div class="small">Note: ${esc(l.note)}</div>`:''}
      ${l.status==='confirmed'?`<div class="small">Bazaar: ${esc(listing(l))} (not proof of a sale)</div>`:''}
      ${buttons.length?`<div class="row actions">${buttons.join('')}</div>`:''}</div>`;
  }
  function paymentUi(p){return `<div class="line"><b>${money(p.amount)}</b> · ${p.acknowledged?'Acknowledged by Morpheus':'Awaiting acknowledgment'}<div class="small">${esc(p.at)} ${esc(p.reference)}</div>
    ${state.role==='supplier'&&!p.acknowledged?`<button data-act="ack" data-id="${esc(p.id)}">Confirm received</button>`:''}</div>`;}
  function render(){
    const c=cfg();
    const connected=!!state;
    const role=state?.role;
    let content=`<header><strong>Morpheus Bazaar Ledger</strong><span class="small">v${VERSION}</span><button data-act="close" class="subtle">Close</button></header>
    <section><div class="row"><span class="small flex ${/^ERROR|^Sync error|^Bazaar sync/.test(status)?'error':''}">${esc(status)}</span><button class="subtle" data-act="refresh">Refresh</button></div></section>`;
    if(connected) {
      const s=state.summary;
      content+=`<section><div class="small">Logged in as <b>${role==='owner'?'Bazaar Owner':'Morpheus'}</b>. Both users see the same ledger.</div>
      <div class="grid" style="margin-top:9px"><div class="metric"><span class="small">Total Bazaar sales</span><strong>${money(s.gross)}</strong></div>
      <div class="metric"><span class="small">Your earnings (${role==='owner'?'profit':'Morpheus share + capital'})</span><strong>${money(role==='owner'?s.ownerProfit:s.morpheusDue)}</strong></div>
      <div class="metric"><span class="small">Owed to Morpheus</span><strong>${money(s.remaining)}</strong></div>
      <div class="metric"><span class="small">Sent, awaiting acknowledgment</span><strong>${money(s.pendingAcknowledgment)}</strong></div></div>
      <div class="notice">50/50 on Morpheus-funded profit after his cost is recovered. Owner-funded leads use the agreed sourcing-fee percentage. No automatic Torn item, cash, or Bazaar transactions.</div></section>`;
      if(role==='supplier') {
        content+=`<section><b>Send inventory / sourcing lead</b><form id="newlot">
          <label>Item name</label><input required name="name" maxlength="100" placeholder="e.g. Xanax">
          <div class="grid"><div><label>Quantity</label><input type="number" required min="1" step="1" name="qty" value="1"></div>
          <div><label>Torn item ID (optional)</label><input type="number" min="1" step="1" name="itemId" placeholder="e.g. 206"></div></div>
          <div class="grid"><div><label>Funding</label><select name="mode"><option value="supplier">I bought it (50/50)</option><option value="owner">Owner buying my lead (sourcing fee)</option></select></div>
          <div><label>Buy cost per unit (blank if unknown)</label><input type="text" name="unitCost" inputmode="numeric" placeholder="e.g. 830000"></div></div>
          <label>Sourcing fee % (for owner-funded leads only; must be agreed)</label><input type="number" min="0" max="100" step="1" name="feePct" value="20">
          <label>Note / trade reference (optional)</label><input maxlength="220" name="note" placeholder="Trade # / item transfer details">
          <p class="tip">Owner must confirm actual receipt/purchase before sales can be booked.</p>
          <button type="submit">Send to shared ledger</button></form></section>`;
      }
      if(role==='owner') {
        const synced=state.live?.observedAt?new Date(state.live.observedAt).toLocaleString():'Never';
        content+=`<section><div class="row"><b class="flex">Torn Bazaar API</b><button data-act="tornsync">Sync listings now</button></div>
          <div class="small">Last live snapshot: ${esc(synced)} · ${state.live?.listings?.length||0} listings. Listing changes are review signals, not confirmed sales.</div></section>`;
      }
      const lots=state.lots.filter(x=>x.status!=='rejected').slice().reverse();
      content+=`<section><b>Inventory lots (${lots.length})</b><div class="scroller">${lots.length?lots.map(uiLot).join(''):'<p class="small">Nothing received yet. Morpheus can add items above.</p>'}</div></section>`;
      if(role==='owner')content+=`<section><b>Record payment sent to Morpheus</b><form id="pay"><div class="grid"><div>
        <label>Amount (maximum ${money(s.remaining)})</label><input required name="amount" placeholder="e.g. 865000" inputmode="numeric"></div>
        <div><label>Reference / note</label><input name="reference" maxlength="200" placeholder="Torn transfer ref"></div></div>
        <p class="tip">Record only after actually sending Torn cash. Morpheus acknowledges receipt separately.</p><button type="submit" ${s.remaining<=0?'disabled':''}>Log payment sent</button></form></section>`;
      content+=`<section><details><summary>Sales history (${state.sales.length})</summary><div class="scroller">${state.sales.slice(0,100).map(x=>`<div class="line"><b>${esc(x.name)}</b> × ${x.qty} · ${money(x.gross)} gross<div class="small">Buy cost ${money(x.cost)} · Net profit ${money(x.profit)} · Morpheus ${money(x.morpheusDue)} · Owner ${money(x.ownerProfit)}</div><span class="small">${esc(x.at)}</span></div>`).join('')||'No sales yet'}</div></details>
      <details><summary>Payments (${state.payments.length})</summary><div class="scroller">${state.payments.map(paymentUi).join('')||'No payments yet'}</div></details>
      <button class="subtle" data-act="export">Export CSV</button></section>`;
    } else content+=`<section class="notice">Enter the relay URL and YOUR token below. Both people must use the same relay URL but different role tokens. Your Torn API key stays only in your browser.</section>`;
    content+=`<section><details ${connected?'':'open'}><summary>Settings</summary><form id="settings">
      <label>Google Apps Script relay /exec URL</label><input required name="relay" value="${esc(c.relay)}" placeholder="https://script.google.com/macros/s/.../exec">
      <label>Your personal relay token</label><input type="password" required name="token" value="${esc(c.token)}" autocomplete="off">
      <label>Your OWN Torn API key (optional for Morpheus)</label><input type="password" name="torn" value="${esc(c.torn)}" autocomplete="off">
      <div class="row actions"><button type="submit">Save & connect</button><button type="button" class="subtle" data-act="verify">Verify Torn key</button></div>
      <p class="small">Torn username: ${esc(read('playerName')||'not verified')} ${esc(read('player')||'')}. Keys are stored locally by Tampermonkey, not transmitted to the ledger relay.</p>
      </form></details></section>`;
    panel.innerHTML=content;
    panel.querySelectorAll('button[data-act]').forEach(btn=>btn.addEventListener('click',()=>handle(btn.dataset.act,btn.dataset.id)));
    panel.querySelector('#settings')?.addEventListener('submit',async e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);write('relay',f.get('relay'));write('token',f.get('token'));write('torn',f.get('torn'));state=null;await refresh(false);
    });
    panel.querySelector('#newlot')?.addEventListener('submit',async e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);
      const q=num(f.get('qty')), cost=String(f.get('unitCost')||'').trim();
      const data={lotId:uuid(),name:String(f.get('name')||'').trim(),itemId:f.get('itemId')?num(f.get('itemId')):null,
        qty:q,mode:f.get('mode'),feePct:num(f.get('feePct')),unitCost:cost?num(cost):null,note:String(f.get('note')||'')};
      if(!Number.isSafeInteger(q)||q<1|| (cost && (!Number.isSafeInteger(data.unitCost)||data.unitCost<1))) return alert('Enter a valid quantity and optional integer buy cost.');
      await operation('propose',data,'Inventory proposal');
    });
    panel.querySelector('#pay')?.addEventListener('submit',async e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);const amount=num(f.get('amount'));
      if(!Number.isSafeInteger(amount)||amount<1) return alert('Enter a positive whole-dollar payment');
      if(!confirm('Have you ALREADY transferred '+money(amount)+' to Morpheus in Torn?'))return;
      await operation('payment',{amount,reference:String(f.get('reference')||'')},'Payment recorded');
    });
  }
  async function handle(action,id){
    if(action==='close'){showing=false;panel.classList.add('hide');return;}
    if(action==='refresh')return refresh(false);
    if(action==='verify')return connectTorn(false).catch(()=>{});
    if(action==='tornsync')return syncBazaar(false);
    if(action==='export')return exportCSV();
    if(!state)return;
    const l=state.lots.find(x=>x.id===id);
    if(action==='price'&&l){
      const raw=prompt('Morpheus purchase price PER UNIT for '+l.name+':');if(raw===null)return;
      return operation('price',{lotId:id,unitCost:num(raw)},'Buy price saved');
    }
    if(action==='confirm'&&l){
      if(l.mode==='supplier'){
        if(!confirm('Have you physically received '+l.qty+' × '+l.name+' from Morpheus?'))return;
        return operation('confirm',{lotId:id},'Receipt confirmed');
      }
      const raw=prompt('Have YOU purchased these goods? Enter YOUR ACTUAL buy price per unit for '+l.name+':',l.unitCost||'');
      if(raw===null)return;
      if(!confirm('Confirm you actually purchased '+l.qty+' × '+l.name+' for '+money(num(raw))+' each, and BOTH agreed to the '+l.feePct+'% sourcing fee?'))return;
      return operation('confirm',{lotId:id,unitCost:num(raw)},'Purchase confirmed');
    }
    if(action==='reject'&&l){if(confirm('Reject this proposed lot?'))return operation('reject',{lotId:id},'Proposal rejected');}
    if(action==='sale'&&l){
      const left=l.qty-l.sold-l.returned;
      const qRaw=prompt('Quantity ACTUALLY SOLD from lot '+l.name+' (max '+left+'):','1');if(qRaw===null)return;
      const pRaw=prompt('ACTUAL Bazaar sale price PER UNIT (cost '+money(l.unitCost)+'):','');if(pRaw===null)return;
      const qty=num(qRaw),unitPrice=num(pRaw);
      if(!Number.isSafeInteger(qty)||qty<1||qty>left||!Number.isSafeInteger(unitPrice)||unitPrice<l.unitCost)return alert('Invalid sale; sale price must be at least cost and quantity must fit this lot.');
      const gross=qty*unitPrice,cost=qty*l.unitCost,profit=gross-cost;
      const cut=Math.floor(profit*l.feePct/100);
      const due=(l.mode==='supplier'?cost:0)+cut;
      if(!confirm(`Record REAL sale: ${qty} × ${l.name}\nGross: ${money(gross)}\nMorpheus owed: ${money(due)}\nYour profit: ${money(profit-cut)}`))return;
      return operation('sale',{lotId:id,qty,unitPrice},'Sale recorded');
    }
    if(action==='return'&&l){
      const raw=prompt('How many units of '+l.name+' did you physically RETURN to Morpheus?');if(raw===null)return;
      if(confirm('Confirm these goods have been physically returned?'))return operation('return',{lotId:id,qty:num(raw)},'Return recorded');
    }
    if(action==='ack'){
      const p=state.payments.find(x=>x.id===id);if(!p)return;
      if(confirm('Have you ACTUALLY received '+money(p.amount)+' in Torn?'))return operation('ack',{paymentId:id},'Receipt acknowledged');
    }
  }
  function exportCSV(){
    if(!state)return;
    const escapeCSV=s=>{const v=String(s??'');return '"'+(/^[=+@\-\t\r]/.test(v)?"'":'')+v.replace(/"/g,'""')+'"';};
    const fields=['Type','Date','Item','Lot ID','Quantity','Unit price','Gross','Cost','Net profit','Morpheus due','Owner profit','Status'];
    const rows=[fields];
    for(const l of state.lots) rows.push(['LOT',l.createdAt,l.name,l.id,l.qty,l.unitCost??'', '', '', '', '', '',l.status]);
    for(const s of state.sales) rows.push(['SALE',s.at,s.name,s.lotId,s.qty,s.unitPrice,s.gross,s.cost,s.profit,s.morpheusDue,s.ownerProfit,'recorded']);
    for(const p of state.payments) rows.push(['PAYMENT',p.at,'','','','','','','',p.amount,'',p.acknowledged?'acknowledged':'pending ack']);
    const csv='\ufeff'+rows.map(row=>row.map(escapeCSV).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='Morpheus.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  render();
  if(cfg().relay&&cfg().token) refresh(true);
  setInterval(()=>{if(cfg().relay&&cfg().token&&!working)refresh(true);},120000);
  setInterval(()=>{if(state?.role==='owner'&&cfg().torn&&Date.now()-lastBazaar>=300000&&!working)syncBazaar(true);},300000);
})();