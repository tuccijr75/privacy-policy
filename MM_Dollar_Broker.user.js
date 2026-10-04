// ==UserScript==
// @name         MM_Dollar_Broker
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-rc.1
// @description  Manual foreground Bazaar inspection and cross-tab $1 observations. Never buys or scans unattended.
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @sandbox      JavaScript
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.user.js
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @grant        GM.getTab
// @grant        GM.saveTab
// @grant        GM.registerMenuCommand
// @grant        GM.unregisterMenuCommand
// ==/UserScript==

(() => {
'use strict';
// ---- core ----
const VERSION = '0.1.0-rc.1';
const SCHEMA = 1;
const KEY = 'mm-dollar-broker:state';
const LOCK = 'mm-dollar-broker:transaction:v1';
const LIMIT = Object.freeze({targets:100, events:50, seen:2000, fresh:120000, heartbeat:15000, stale:60000, navigation:30000});
const phases = new Set(['ready','awaiting-inspection','inspecting','paused','navigating','error']);
const validId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value);
const bazaarUrl = id => {
  if (!validId(id)) throw new Error('Invalid public player ID.');
  return `https://www.torn.com/bazaar.php?userId=${id}`;
};
function targetAt(url) {
  try { const u = new URL(url); return u.origin === 'https://www.torn.com' && u.pathname === '/bazaar.php' && validId(u.searchParams.get('userId')) ? u.searchParams.get('userId') : null; } catch { return null; }
}
function parseTargets(text) {
  const ids = [...new Set(String(text).trim().split(/[\s,;]+/).filter(Boolean))];
  if (ids.length > LIMIT.targets || ids.some(id => !validId(id))) throw new Error(`Use up to ${LIMIT.targets} public numeric player IDs, separated by spaces or commas.`);
  return ids;
}
function exactPrice(text) {
  const s = String(text).trim();
  if (!/^\$(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.00)?$/.test(s)) return null;
  const n = Number(s.slice(1).replaceAll(',', ''));
  return Number.isSafeInteger(n) ? n : null;
}
const fingerprint = (target, item) => JSON.stringify([target, item.listingId || item.itemId || item.name, 1]);
function emptyState() { return {schema:SCHEMA, version:VERSION, revision:0, targets:[], worker:null, events:[], seen:[], lastDetection:0}; }
const finite = n => Number.isFinite(n) && n >= 0;
const textField = (v, max = 180) => typeof v === 'string' && v.length <= max;
function validEvent(e) {
  return !!e && e.schema === SCHEMA && validId(e.targetId) && textField(e.id,400) && textField(e.fingerprint,400) &&
    textField(e.seller) && textField(e.item?.name) && e.item.name.length > 0 && textField(e.item.itemId,80) && textField(e.item.listingId,80) &&
    e.price === 1 && e.url === bazaarUrl(e.targetId) && finite(e.detectedAt) && e.expiresAt === e.detectedAt + LIMIT.fresh &&
    textField(e.workerId,80) && textField(e.documentId,80) && e.validity === 'observed-available' && typeof e.acknowledged === 'boolean';
}
function readState(raw) {
  if (raw == null) return emptyState();
  if (raw.schema !== SCHEMA) throw new Error('Storage schema is unsupported. Update all Broker tabs; existing data was preserved.');
  const w = raw.worker;
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw.targets) || raw.targets.length > LIMIT.targets || raw.targets.some(x=>!validId(x)) ||
      !Array.isArray(raw.events) || raw.events.length > LIMIT.events || raw.events.some(e=>!validEvent(e)) ||
      !Array.isArray(raw.seen) || raw.seen.length > LIMIT.seen || raw.seen.some(x=>!textField(x,400)) || !finite(raw.lastDetection) ||
      (w && (!textField(w.id,80) || !textField(w.tabId,80) || !textField(w.documentId,80) || !phases.has(w.phase) || !finite(w.heartbeat) ||
       !Number.isInteger(w.index) || w.index < -1 || w.index >= raw.targets.length || (w.targetId !== null && !validId(w.targetId)) ||
       !finite(w.lastScan) || !textField(w.error,240) || (w.navigation && (!validId(w.navigation.targetId) || !finite(w.navigation.at) || !textField(w.navigation.from,80)))))) {
    throw new Error('Broker state failed validation. Existing data was preserved.');
  }
  return structuredClone(raw);
}
const owns = (s, identity) => !!s.worker && s.worker.tabId === identity.tabId && s.worker.documentId === identity.documentId && s.worker.id === identity.workerId;
function claimWorker(s, identity, now) {
  if (!s.targets.length) throw new Error('Add target player IDs first.');
  if (s.worker && s.worker.tabId !== identity.tabId) throw new Error('Another tab owns the worker. Use that tab, or Stop before starting here.');
  const old = s.worker;
  s.worker = {id:identity.workerId, tabId:identity.tabId, documentId:identity.documentId, phase:'ready', index:old?.index ?? -1,
    targetId:old?.targetId ?? null, heartbeat:now, lastScan:old?.lastScan || 0, error:'', navigation:null};
}
function prepareNavigation(s, identity, now) {
  if (!owns(s,identity) || s.worker.phase === 'paused' || s.worker.phase === 'navigating') throw new Error('Start or resume this worker first.');
  const w = s.worker;
  w.index = (w.index + 1) % s.targets.length;
  w.targetId = s.targets[w.index]; w.phase = 'navigating'; w.heartbeat = now; w.error = '';
  w.navigation = {from:identity.documentId, targetId:w.targetId, at:now};
  return bazaarUrl(w.targetId);
}
function attachNavigation(s, identity, url, now) {
  const w = s.worker, n = w?.navigation;
  if (!w || w.tabId !== identity.tabId || w.phase !== 'navigating' || !n || n.from !== w.documentId ||
      n.targetId !== targetAt(url) || now < n.at || now - n.at > LIMIT.navigation) return false;
  w.documentId = identity.documentId; w.navigation = null; w.heartbeat = now; w.phase = 'awaiting-inspection';
  return true;
}
function recordSnapshot(s, identity, snapshot, now) {
  if (!owns(s,identity) || ['paused','navigating'].includes(s.worker.phase)) throw new Error('Worker ownership or state changed; inspection discarded.');
  if (snapshot.targetId !== s.worker.targetId || snapshot.documentId !== identity.documentId || now - snapshot.at > 2000 || now < snapshot.at) throw new Error('Inspection is stale. Inspect the visible page again.');
  const w=s.worker;
  w.heartbeat=now; w.error=snapshot.error || ''; w.phase=snapshot.ok?'awaiting-inspection':'error';
  if (!snapshot.ok) return [];
  w.lastScan=now;
  const newEvents=[];
  for (const item of snapshot.items) {
    if (item.price !== 1 || item.available !== true) continue;
    const fp=fingerprint(snapshot.targetId,item);
    if (s.seen.includes(fp)) continue;
    if (s.seen.length >= LIMIT.seen) { w.phase='error'; w.error='Duplicate ledger is full. No new alerts will be recorded; see diagnostics.'; break; }
    const event={schema:SCHEMA, id:`${identity.workerId}:${now}:${s.seen.length}`, fingerprint:fp, targetId:snapshot.targetId,
      seller:snapshot.seller, item:{name:item.name,itemId:item.itemId||'',listingId:item.listingId||''}, price:1,
      url:bazaarUrl(snapshot.targetId), detectedAt:snapshot.at, expiresAt:snapshot.at+LIMIT.fresh, workerId:identity.workerId,
      documentId:identity.documentId, validity:'observed-available', acknowledged:false};
    if (!validEvent(event)) { w.phase='error'; w.error='Listing contract failed validation.'; continue; }
    s.seen.push(fp); s.events.unshift(event); newEvents.push(event); s.lastDetection=snapshot.at;
  }
  s.events=s.events.slice(0,LIMIT.events);
  return newEvents;
}
function health(s, now) {
  const w=s.worker;
  if (!w) return {kind:'idle',label:'Stopped'};
  if (w.phase==='paused') return {kind:'idle',label:'Paused'};
  if (w.navigation && now-w.navigation.at>LIMIT.navigation) return {kind:'warning',label:'Navigation timed out'};
  if (now-w.heartbeat>LIMIT.stale || now<w.heartbeat) return {kind:'warning',label:'Worker unavailable — focus its tab'};
  if (w.phase==='error') return {kind:'warning',label:'Inspection needs attention'};
  return {kind:'active',label:w.phase==='navigating'?'Opening target':w.phase==='inspecting'?'Inspecting':'Ready — manual inspection'};
}
function unread(s, now) { return s.events.filter(e=>!e.acknowledged && e.detectedAt<=now && e.expiresAt>now); }
class Store {
  constructor(gm, locks) { this.gm=gm; this.locks=locks; }
  async read() { return readState(await this.gm.getValue(KEY,null)); }
  async change(mutator) {
    if (!this.locks?.request) throw new Error('Web Locks unavailable; worker disabled to prevent competing tabs.');
    return this.locks.request(LOCK,{mode:'exclusive',signal:AbortSignal.timeout(3000)},async()=>{
      const state=await this.read(); const result=mutator(state);
      state.revision++; state.version=VERSION; readState(state);
      await this.gm.setValue(KEY,state); return {state,result};
    });
  }
}

// ---- adapter ----
// Candidate React adapter; selector provenance and live-verification gate: docs/DOM_ADAPTER.md.
const SELECTOR = Object.freeze({root:'#bazaarRoot', card:'[data-testid="item"]', name:'[data-testid="name"]', price:'[data-testid="price"]',
  owner:'[data-testid="bazaar-header"] a[href*="profiles.php"], h4 a[href*="profiles.php"], h3 a[href*="profiles.php"], [class*="title"] a[href*="profiles.php"]',
  quantity:'[data-testid="amount"], [data-testid="buy-item-amount"]', buy:'button[aria-label^="Buy:"]',
  blocked:'[aria-disabled="true"], [data-testid="locked"], [data-testid="sold-out"], [aria-label*="Locked"], [aria-label*="locked"]',
  loading:'[aria-busy="true"], [data-testid="loader"], [data-testid="loading"]'});
function visible(element, win, viewportOnly=false) {
  if (!element?.isConnected) return false;
  for (let e=element;e && e.nodeType===1;e=e.parentElement) {
    const style=win.getComputedStyle(e);
    if (e.hidden || e.getAttribute('aria-hidden')==='true' || style.display==='none' || style.visibility==='hidden' || Number(style.opacity)===0) return false;
  }
  const r=element.getBoundingClientRect();
  if(!(r.width>0 && r.height>0)) return false;
  if(!viewportOnly) return true;
  if(r.top<0 || r.left<0 || r.bottom>win.innerHeight || r.right>win.innerWidth) return false;
  const points=[[r.left+r.width/2,r.top+r.height/2],[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]];
  return points.every(([x,y])=>{const top=element.ownerDocument.elementFromPoint(x,y);return top && (top===element || element.contains(top) || top.contains(element));});
}
function inspectBazaar(doc, win, context) {
  const result={ok:false,items:[],seller:'',targetId:context.targetId,documentId:context.documentId,at:context.at,error:''};
  const fail=error=>({...result,error});
  if (!context.trusted || doc.visibilityState!=='visible' || !doc.hasFocus()) return fail('Inspect from a deliberate click in the focused Bazaar tab.');
  if (doc.readyState!=='complete') return fail('Page is still loading. Inspect again after it finishes.');
  if (!context.targetId || targetAt(win.location.href)!==context.targetId || win.location.href!==context.initialUrl || targetAt(context.initialUrl)!==context.targetId) return fail('Target or document changed. Open the next target in this worker.');
  const roots=doc.querySelectorAll(SELECTOR.root);
  if (roots.length!==1 || !visible(roots[0],win)) return fail('Bazaar is unavailable, loading, or its markup is unsupported.');
  const root=roots[0];
  if (root.matches(SELECTOR.loading) || [...root.querySelectorAll(SELECTOR.loading)].some(e=>visible(e,win))) return fail('Bazaar is still rendering. Inspect again when ready.');
  const ownerLinks=[...root.querySelectorAll(SELECTOR.owner)].filter(e=>!e.closest('[data-testid="item"], [class*="description"], [data-testid="description"]') && visible(e,win));
  const owners=ownerLinks.map(e=>{try{return {id:new URL(e.href,win.location.href).searchParams.get('XID'),name:e.textContent.trim()};}catch{return null;}}).filter(Boolean);
  if (!owners.length || owners.some(o=>o.id!==context.targetId)) return fail('Cannot prove the displayed Bazaar owner. No alert issued.');
  result.seller=(owners[0].name || context.targetId).slice(0,180);
  const cards=[...root.querySelectorAll(SELECTOR.card)];
  if (cards.some(card=>card.parentElement.closest(SELECTOR.card))) return fail('Nested listing structure is ambiguous. No alert issued.');
  if (!cards.length) return fail('No recognizable listings. Empty, unavailable, and changed markup require live verification.');
  let inspected=0, unsupported=0;
  for (const card of cards) {
    if (!visible(card,win,true)) continue;
    if (card.querySelector(SELECTOR.card)) { unsupported++; continue; }
    const names=card.querySelectorAll(SELECTOR.name), prices=card.querySelectorAll(SELECTOR.price);
    if (names.length!==1 || prices.length!==1 || !visible(names[0],win,true) || !visible(prices[0],win,true)) { unsupported++; continue; }
    const name=names[0].textContent.trim();
    // Only direct price text: percentage/valuation children are not a listing price.
    const priceText=[...prices[0].childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
    const price=exactPrice(priceText);
    if (!name || name.length>180 || price===null) { unsupported++; continue; }
    inspected++;
    if (price!==1) continue;
    const buys=[...card.querySelectorAll(SELECTOR.buy)].filter(e=>visible(e,win,true));
    const blocked=card.matches(SELECTOR.blocked) || [...card.querySelectorAll(SELECTOR.blocked)].some(e=>visible(e,win));
    if (blocked || buys.length!==1 || buys[0].disabled || buys[0].matches(':disabled') || buys[0].getAttribute('aria-disabled')==='true' || win.getComputedStyle(buys[0]).pointerEvents==='none' || buys[0].getAttribute('aria-label')!==`Buy: ${name}`) continue;
    const amountNode=card.querySelector(SELECTOR.quantity);
    if(!visible(amountNode,win,true)) {unsupported++;continue;}
    const amount=amountNode.textContent.trim();
    const match=/^(?:x\s*)?([1-9]\d{0,8})(?:\s*(?:available|in stock|in total))?$/i.exec(amount);
    if (!match) { unsupported++; continue; }
    const itemId=card.getAttribute('data-item-id')||'';
    const listingId=card.getAttribute('data-listing-id')||'';
    if (itemId.length>80 || listingId.length>80) { unsupported++; continue; }
    result.items.push({name,itemId,listingId,price,quantity:Number(match[1]),available:true});
  }
  if (unsupported) return fail('A visible listing has unsupported markup. Inspection discarded.');
  if (!inspected) return fail('No complete listing cards are visible. Scroll to a listing and inspect again.');
  return {...result,ok:true,inspected};
}

// ---- docking ----
const GAP=5;
const overlaps=(a,b,gap=GAP)=>a.x<b.x+b.w+gap && a.x+a.w+gap>b.x && a.y<b.y+b.h+gap && a.y+a.h+gap>b.y;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function place(size, viewport, obstacles, preferred, current=null, bottomFirst=false) {
  const maxX=viewport.w-size.w-4, maxY=viewport.h-size.h-4;
  if (maxX<4 || maxY<4) return null;
  const clean=obstacles.filter(r=>[r.x,r.y,r.w,r.h].every(Number.isFinite) && r.w>0 && r.h>0);
  const fits=p=>p && p.x>=4 && p.y>=4 && p.x<=maxX && p.y<=maxY && !clean.some(o=>overlaps({...p,...size},o));
  if (fits(current)) return current; // Avoid jumping back when a chat closes.
  const desired={x:clamp(preferred.x,4,maxX),y:clamp(preferred.y,4,maxY)};
  const ys=[...new Set([desired.y,maxY,4,...clean.flatMap(o=>[o.y-size.h-GAP,o.y+o.h+GAP])].map(y=>clamp(y,4,maxY)))];
  const choices=[];
  for (const y of ys) {
    const blocked=clean.filter(o=>y<o.y+o.h+GAP && y+size.h+GAP>o.y).map(o=>[o.x-size.w-GAP,o.x+o.w+GAP]).sort((a,b)=>a[0]-b[0]);
    let cursor=4;
    for (const [lo,hi] of [...blocked,[maxX+1,maxX+1]]) {
      if (lo>=cursor) {
        const x=clamp(desired.x,cursor,Math.min(lo,maxX));
        const p={x,y}; if(fits(p)) choices.push(p);
      }
      cursor=Math.max(cursor,hi); if(cursor>maxX) break;
    }
  }
  choices.sort((a,b)=>(bottomFirst?Math.abs(a.y-maxY)-Math.abs(b.y-maxY):0) || Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
  return choices[0] || null;
}
const KNOWN='#chat-box,[id^="chat-box"],[id^="chatBox"],#mm-torn-module-dock,[data-mm-dock-id],.mm-torn-floating-btn,[class*="chat-box"],[class*="chatBox"],[class*="chat-boxes"],[class*="chatRoot"],#chatRoot,#chatWrapper,[id^="mm-"]';
const CANDIDATES=`${KNOWN},[role="dialog"],[aria-modal="true"],button,a,[role="button"],[style*="position: fixed"],[style*="position:fixed"]`;
const rect=e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};};
class Docking {
  constructor(win, doc, host, launcher, panel, preferences, save) {
    Object.assign(this,{win,doc,host,launcher,panel,preferences,save});
    this.nodes=new Set(); this.current={}; this.cleanups=[]; this.frame=0; this.dragging=false;
    this.resize=new win.ResizeObserver(()=>this.schedule());
    this.mutation=new win.MutationObserver(records=>{
      let changed=false;
      for(const r of records) {
        if(r.target===host || host.contains(r.target)) continue;
        if(r.type==='childList') {
          const added=[...r.addedNodes].filter(n=>n instanceof win.Element);
          const removed=[...r.removedNodes].filter(n=>n instanceof win.Element);
          for(const node of added) this.discover(node);
          if(added.length || removed.length) changed=true;
        }
        else if(r.target instanceof win.Element) { this.discover(r.target,false); changed=true; }
      }
      if(changed) this.schedule();
    });
    this.discover(doc.body);
    this.mutation.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-expanded']});
    this.listen(win,'resize',()=>this.schedule());
    this.listen(win,'scroll',()=>this.schedule(),{passive:true});
    this.listen(doc,'visibilitychange',()=>this.schedule());
    this.listen(doc,'transitionend',()=>this.schedule(),{capture:true});
    if(win.visualViewport) {this.listen(win.visualViewport,'resize',()=>this.schedule());this.listen(win.visualViewport,'scroll',()=>this.schedule());}
    this.resize.observe(launcher); this.resize.observe(panel);
    this.drag(launcher,launcher,'launcher'); this.drag(panel,panel.querySelector('header'),'panel');
    this.schedule();
  }
  listen(target,type,handler,opts) {target.addEventListener(type,handler,opts);this.cleanups.push(()=>target.removeEventListener(type,handler,opts));}
  discover(node,deep=true) {
    if(!(node instanceof this.win.Element) || node===this.host || this.host.contains(node)) return;
    const fixed=['fixed','sticky'].includes(this.win.getComputedStyle(node).position);
    const list=[...(node.matches(CANDIDATES)||fixed?[node]:[]),...(deep?node.querySelectorAll(CANDIDATES):[])];
    for(const e of list) {
      if(this.nodes.has(e) || this.nodes.size>=3000 || e===this.host || this.host.contains(e)) continue;
      this.nodes.add(e); this.resize.observe(e);
    }
  }
  obstacles() {
    const out=[];
    for(const e of this.nodes) {
      if(!e.isConnected) {this.nodes.delete(e);this.resize.unobserve(e);continue;}
      const r=rect(e);
      if(r.w<=0 || r.h<=0 || r.x>=this.win.innerWidth || r.y>=this.win.innerHeight || r.x+r.w<=0 || r.y+r.h<=0) continue;
      const known=e.matches(KNOWN), footer=r.y+r.h>=this.win.innerHeight-80 && r.w<=350 && r.h<=120;
      if(!known && !footer && !['fixed','sticky'].includes(this.win.getComputedStyle(e).position)) continue;
      // Transparent full-screen chat roots contain smaller occupied children.
      const background=this.win.getComputedStyle(e).backgroundColor;
      if(r.w>this.win.innerWidth*.95 && r.h>this.win.innerHeight*.8 && (background==='transparent'||background==='rgba(0, 0, 0, 0)')) continue;
      if(visible(e,this.win) && !out.some(o=>Math.abs(o.x-r.x)<1 && Math.abs(o.y-r.y)<1 && Math.abs(o.w-r.w)<1 && Math.abs(o.h-r.h)<1)) out.push(r);
    }
    return out;
  }
  schedule() {
    if(this.frame || this.dragging || this.doc.visibilityState!=='visible') return;
    this.frame=this.win.requestAnimationFrame(()=>{this.frame=0;this.layout();});
  }
  position(element,kind,obs) {
    if(element.hidden) return null;
    const size={w:element.offsetWidth,h:element.offsetHeight};
    const vp={w:this.win.innerWidth,h:this.win.innerHeight};
    const bottom=obs.filter(r=>r.y+r.h>=vp.h-75 && r.w>=20 && r.h>=24);
    const anchor=bottom.length?Math.min(...bottom.map(r=>r.x)):vp.w-4;
    const preferred=this.preferences[kind] || (kind==='launcher'?{x:anchor-size.w-GAP,y:vp.h-size.h-4}:{x:vp.w-size.w-12,y:Math.max(12,vp.h-size.h-62)});
    let p=place(size,vp,obs,preferred,this.current[kind],kind==='launcher'&&!this.preferences[kind]);
    if(!p) { element.style.visibility='hidden';this.current[kind]=null;return null; }
    element.style.visibility='visible'; element.style.left=`${Math.round(p.x)}px`;element.style.top=`${Math.round(p.y)}px`;
    this.current[kind]=p;return {...p,...size};
  }
  layout() {
    const obs=this.obstacles();
    const launch=this.position(this.launcher,'launcher',obs);
    this.position(this.panel,'panel',launch?[...obs,launch]:obs);
  }
  reset() {this.preferences={};this.current={};this.save(this.preferences);this.schedule();}
  drag(element,handle,kind) {
    let drag=null, suppress=false;
    this.listen(handle,'pointerdown',e=>{
      if(!e.isTrusted || e.button!==0 || (e.target!==handle && e.target.closest('button,a,input,summary'))) return;
      drag={x:e.clientX,y:e.clientY,initial:rect(element)};
      handle.setPointerCapture(e.pointerId);
    });
    this.listen(handle,'pointermove',e=>{
      if(!drag) return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.hypot(dx,dy)<5 && !this.dragging) return;
      this.dragging=true; suppress=true;
      // Resolve during dragging too, so the control does not cover a chat.
      const p=place({w:element.offsetWidth,h:element.offsetHeight},{w:this.win.innerWidth,h:this.win.innerHeight},this.obstacles(),{x:drag.initial.x+dx,y:drag.initial.y+dy});
      if(p) {element.style.left=`${p.x}px`;element.style.top=`${p.y}px`;this.current[kind]=p;}
    });
    const finish=()=>{
      if(!drag) return;
      if(this.dragging && this.current[kind]) {this.preferences[kind]=this.current[kind];this.save(this.preferences);}
      drag=null;this.dragging=false;this.schedule();
    };
    this.listen(handle,'pointerup',finish);this.listen(handle,'pointercancel',finish);this.listen(handle,'lostpointercapture',finish);
    this.listen(handle,'click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();suppress=false;}},true);
  }
  destroy() {this.mutation.disconnect();this.resize.disconnect();this.cleanups.forEach(f=>f());if(this.frame)this.win.cancelAnimationFrame(this.frame);}
}

// ---- ui ----
function makeUI(doc) {
  const host=doc.createElement('div');host.id='mm-dollar-broker';host.style.cssText='position:fixed;inset:0;z-index:2147483644;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});
  const style=doc.createElement('style');
  style.textContent=`
    :host{all:initial;color-scheme:dark;font:13px/1.45 system-ui,sans-serif;color:#edf2ed}
    *{box-sizing:border-box}button,input,textarea{font:inherit}button,a,summary{touch-action:manipulation}
    button,a.action{border:1px solid #535e59;background:#303a35;color:#eff6f0;border-radius:5px;padding:7px 10px;cursor:pointer;text-decoration:none}
    button:hover,a.action:hover{background:#415147}button:disabled{opacity:.4;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #c8ec81;outline-offset:2px}
    #launcher{position:fixed;pointer-events:auto;width:42px;height:42px;padding:7px;border-radius:4px;background:linear-gradient(#404940,#202522);box-shadow:inset 0 1px #ffffff24,0 2px 5px #0008;touch-action:none;color:#b8c4b8}
    #launcher svg{width:25px;height:25px;pointer-events:none}#launcher[data-state=active]{color:#b3dc7f;border-bottom:3px solid #9bbf70}
    #launcher[data-state=deal]{color:#192416;background:#c7ee86;border-color:#dfffaa;box-shadow:0 0 0 2px #738f45}
    #launcher[data-state=warning]{color:#ffcd7e;border-color:#ffb855}
    #badge{position:absolute;right:-4px;top:-6px;background:#d4f59e;border:1px solid #28341c;color:#172312;border-radius:9px;min-width:17px;padding:0 4px;font:bold 11px/16px system-ui;pointer-events:none}
    #panel{position:fixed;pointer-events:auto;width:min(356px,calc(100vw - 12px));max-height:calc(100vh - 64px);overflow:auto;background:#1b211e;border:1px solid #53634f;border-radius:8px;box-shadow:0 12px 35px #0009}
    [hidden]{display:none!important}header{position:sticky;top:0;z-index:1;background:#272f29;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #414c42;cursor:grab;touch-action:none}
    header strong{letter-spacing:.08em;font-size:12px}header small{display:block;color:#a5b69d;font-size:10px;letter-spacing:.16em}header button{padding:0 8px;font-size:20px}
    .body{padding:12px}.status{display:flex;gap:8px;align-items:center;font-weight:650}.dot{width:7px;height:7px;border-radius:50%;background:#a1c875}.muted{color:#adb9af;font-size:11px}
    #notice{color:#f1cc83;font-size:12px;white-space:pre-wrap}#notice:empty{display:none}.row{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.primary{background:#445936;border-color:#7c965d}h2{font-size:11px;letter-spacing:.1em;color:#b1bdab;margin:15px 0 8px}
    article{background:#252d27;border:1px solid #43523b;border-left:3px solid #a6ca70;padding:9px;margin-bottom:8px;border-radius:4px}article b{display:block;color:#d9f2b3}article .row{margin-bottom:0}article[data-stale=true]{opacity:.65;border-left-color:#839080}
    #events{max-height:240px;overflow:auto}details{border-top:1px solid #3b443c;padding-top:8px;margin-top:10px}summary{cursor:pointer;color:#c6d0c2;font-size:12px}textarea{display:block;width:100%;min-height:65px;max-height:140px;background:#111713;border:1px solid #4d5b49;color:#e0e9df;padding:6px;margin:6px 0;resize:vertical}
    label{display:block;margin-top:7px;font-size:12px}pre{font:10px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#b1bfae}footer{color:#94a18f;font-size:10px;padding-top:10px}.count{font-size:11px;color:#c4d2bb}#mode{margin-top:5px}
  `;
  const launcher=doc.createElement('button');launcher.id='launcher';launcher.type='button';launcher.setAttribute('aria-label','Open Dollar Broker');launcher.setAttribute('aria-expanded','false');
  // Original price-tag glyph; no remote/proprietary assets.
  launcher.innerHTML='<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4h11l7 7-11 11-7-7Z"/><circle cx="8" cy="8" r="1"/><path d="M16 9c-4-3-8 2-4 4s0 6-4 3m8-8-8 10"/></svg><span id="badge" hidden></span>';
  const panel=doc.createElement('section');panel.id='panel';panel.hidden=true;panel.setAttribute('aria-label','Dollar Broker');
  panel.innerHTML=`<header><div><small>MM TORN SYSTEMS</small><strong>DOLLAR BROKER</strong></div><button type="button" id="minimize" aria-label="Minimize Broker">−</button></header>
    <div class="body"><div class="status"><span class="dot"></span><span id="status" role="status">Stopped</span></div><div id="mode" class="muted">Manual foreground inspection</div><div id="progress" class="muted"></div><p id="notice" role="status"></p>
    <div class="row"><button id="start" class="primary" type="button">Start in this tab</button><button id="pause" type="button">Pause</button><button id="stop" type="button">Stop</button></div>
    <div class="row"><button id="next" type="button">Open next Bazaar</button><button id="inspect" class="primary" type="button">Inspect visible listings</button></div>
    <div class="muted">Keep this worker tab in view. Each Bazaar opens only when you click. Purchases stay manual.</div>
    <h2>OBSERVED $1 LISTINGS <span class="count" id="count"></span></h2><div id="events" aria-live="polite"></div>
    <details><summary>Targets & preferences</summary><label for="targets">Public player IDs</label><textarea id="targets" placeholder="One ID per line, or comma-separated" maxlength="1400"></textarea><div class="row"><button type="button" id="save-targets">Save targets</button><button type="button" id="reset-layout">Reset positions</button></div><label><input id="sound" type="checkbox"> Sound in this tab</label><span class="muted">Enable with a click to test browser audio permission.</span></details>
    <details><summary>Local diagnostics</summary><pre id="diagnostics"></pre></details><footer>Independent MM tool · ${VERSION} · availability can change after observation</footer></div>`;
  shadow.append(style,launcher,panel);doc.body.append(host);
  const el=id=>shadow.getElementById(id);
  const setOpen=open=>{panel.hidden=!open;launcher.setAttribute('aria-expanded',String(open));};
  return {host,shadow,launcher,panel,el,setOpen};
}
function renderUI(ui,state,identity,now,localError='') {
  const h=health(state,now), fresh=unread(state,now), w=state.worker;
  const mine=w?.tabId===identity.tabId && w?.documentId===identity.documentId;
  ui.launcher.dataset.state=h.kind==='warning'?'warning':fresh.length?'deal':h.kind;
  ui.launcher.title=`Dollar Broker · ${h.label} · ${fresh.length} new $1 observation${fresh.length===1?'':'s'} · drag to move`;
  ui.launcher.setAttribute('aria-label',ui.launcher.title);
  ui.el('badge').hidden=!fresh.length;ui.el('badge').textContent=String(fresh.length);
  ui.el('status').textContent=h.label;
  ui.el('progress').textContent=w?`${mine?'This tab is the worker':'Worker is in another tab/document'} · ${w.index<0?'No target opened':`${w.index+1}/${state.targets.length} · Player ${w.targetId||'—'}`} · heartbeat ${Math.max(0,Math.floor((now-w.heartbeat)/1000))}s ago`:`${state.targets.length} target${state.targets.length===1?'':'s'} configured`;
  ui.el('notice').textContent=localError||w?.error||'';
  ui.el('start').textContent=w?.tabId===identity.tabId?'Resume here':'Start in this tab';
  ui.el('start').disabled=!!localError || !state.targets.length || !!(w && w.tabId!==identity.tabId);
  ui.el('pause').disabled=!w || w.phase==='paused'; ui.el('stop').disabled=!w;
  ui.el('next').disabled=!mine || w.phase==='paused' || w.phase==='navigating';
  ui.el('inspect').disabled=!mine || !w.targetId || ['paused','navigating'].includes(w.phase);
  ui.el('save-targets').disabled=!!w;
  if(ui.shadow.activeElement!==ui.el('targets')) ui.el('targets').value=state.targets.join('\n');
  ui.el('count').textContent=`${fresh.length} new`;
  const eventKey=state.events.map(e=>`${e.id}:${e.acknowledged}:${e.expiresAt>now}`).join('|');
  if(ui.eventKey!==eventKey) {
    ui.eventKey=eventKey;ui.el('events').replaceChildren();
    for(const e of state.events) {
      const card=document.createElement('article');card.dataset.stale=String(e.expiresAt<=now);
      const name=document.createElement('b');name.textContent=`$1 · ${e.item.name}`;
      const seller=document.createElement('div');seller.textContent=`${e.seller} [${e.targetId}]`;
      const age=document.createElement('div');age.className='muted';age.textContent=`Observed ${new Date(e.detectedAt).toLocaleTimeString()}${e.expiresAt<=now?' · stale — recheck manually':''}`;
      const actions=document.createElement('div');actions.className='row';
      const link=document.createElement('a');link.className='action';link.textContent='Open Bazaar';link.href=e.url;link.dataset.route=e.id;
      const ack=document.createElement('button');ack.type='button';ack.textContent=e.acknowledged?'Acknowledged':'Acknowledge';ack.disabled=e.acknowledged;ack.dataset.ack=e.id;
      actions.append(link,ack);card.append(name,seller,age,actions);ui.el('events').append(card);
    }
    if(!state.events.length) {const p=document.createElement('div');p.className='muted';p.textContent='No observations yet. Open a target, then inspect its visible listings.';ui.el('events').append(p);}
  }
  ui.el('diagnostics').textContent=JSON.stringify({script:VERSION,schema:state.schema,revision:state.revision,workerVersion:state.version,workerId:w?.id||null,phase:w?.phase||'stopped',
    target:w?.targetId||null,targetCount:state.targets.length,index:w?.index??-1,lastScan:w?.lastScan||null,lastDetection:state.lastDetection||null,
    heartbeatAge:w?now-w.heartbeat:null,events:state.events.length,duplicateLedger:`${state.seen.length}/${LIMIT.seen}`,window:ui.panel.hidden?'minimized':'open',error:localError||w?.error||null},null,2);
}

// ---- runtime ----
async function boot(gm, win, doc) {
  const identity={tabId:'',documentId:win.crypto.randomUUID(),workerId:''};
  const store=new Store(gm,win.navigator.locks);
  let state=emptyState(), error='', closed=false, busy=false, baseline=false, ticker=null, listener=null, sound=null;
  let tabData;
  try {
    tabData=await gm.getTab();
    if (!tabData.mmDollarBrokerTab) {tabData.mmDollarBrokerTab=win.crypto.randomUUID();await gm.saveTab(tabData);}
    identity.tabId=tabData.mmDollarBrokerTab;state=await store.read();
  } catch {error='Storage initialization failed or has an unsupported schema. Existing data was preserved.';}
  const initialUrl=win.location.href;
  const ui=makeUI(doc);
  let preferences={schema:1,positions:{},sound:false}, uiWritable=true;
  try {
    const saved=await gm.getValue('mm-dollar-broker:ui',null);
    if(saved) {
      if(saved.schema!==1) throw new Error('UI schema');
      const positions={};
      for(const key of ['launcher','panel']) {const p=saved.positions?.[key];if(p && Number.isFinite(p.x)&&Number.isFinite(p.y)) positions[key]={x:p.x,y:p.y};}
      preferences={schema:1,positions,sound:false}; // Audio consent is per-document, never silently resumed.
    }
  } catch {uiWritable=false;error='UI storage is unsupported. Existing data was preserved.';}
  const savePositions=positions=>{
    preferences.positions=positions;
    if(!uiWritable) return;
    gm.setValue('mm-dollar-broker:ui',{schema:1,positions}).catch(()=>{error='Could not save UI positions.';render();});
  };
  const dock=new Docking(win,doc,ui.host,ui.launcher,ui.panel,preferences.positions,savePositions);
  const played=new Set();
  function active() {return !closed && doc.visibilityState==='visible' && doc.hasFocus();}
  function render() {if(!closed){renderUI(ui,state,identity,Date.now(),error);dock.schedule();}}
  function update(next, audible=false) {
    if(closed) return;
    let validated;
    try {validated=readState(next);} catch(e) {error=e.message;render();return;}
    if(validated.revision<state.revision) return;
    state=validated;
    let chime=false;
    for(const e of unread(state,Date.now())) {
      if(!played.has(e.id) && baseline && audible && preferences.sound && active() && sound) {
        chime=true;
      }
      played.add(e.id);
    }
    if(chime) {sound.currentTime=0;void sound.play().catch(()=>{preferences.sound=false;ui.el('sound').checked=false;ui.el('notice').textContent='Sound permission was blocked. Enable sound again with a click.';});}
    // Bound audio bookkeeping to the bounded event inbox.
    const current=new Set(state.events.map(e=>e.id));for(const id of played) if(!current.has(id)) played.delete(id);
    baseline=true;render();
  }
  async function change(fn) {const result=await store.change(fn);update(result.state,true);return result;}
  function trusted(e) {return e?.isTrusted && active() && !error;}
  async function act(e,fn) {
    if(!trusted(e)||busy) return;
    busy=true;
    try {await fn();} catch(ex) {ui.el('notice').textContent=ex.message || 'Operation failed safely.';}
    finally {busy=false;}
  }
  const cleanups=[];
  function on(element,event,fn,opts) {element.addEventListener(event,fn,opts);cleanups.push(()=>element.removeEventListener(event,fn,opts));}
  on(ui.launcher,'click',e=>{if(!e.isTrusted)return;ui.setOpen(ui.panel.hidden);render();dock.schedule();});
  on(ui.el('minimize'),'click',e=>{if(e.isTrusted){ui.setOpen(false);render();ui.launcher.focus();}});
  on(ui.panel,'keydown',e=>{if(e.key==='Escape'){ui.setOpen(false);render();ui.launcher.focus();}});
  on(ui.el('start'),'click',e=>act(e,async()=>{
    const workerId=win.crypto.randomUUID();
    await change(s=>{if(!active())throw new Error('Focus this tab to start.');claimWorker(s,{...identity,workerId},Date.now());});
    identity.workerId=workerId;render();
  }));
  on(ui.el('pause'),'click',e=>act(e,()=>change(s=>{if(s.worker){s.worker.phase='paused';s.worker.navigation=null;}})));
  on(ui.el('stop'),'click',e=>act(e,()=>change(s=>{s.worker=null;})));
  on(ui.el('save-targets'),'click',e=>act(e,()=>{
    const targets=parseTargets(ui.el('targets').value);
    return change(s=>{if(s.worker)throw new Error('Stop the worker before changing targets.');s.targets=targets;});
  }));
  on(ui.el('next'),'click',e=>act(e,async()=>{
    const clickedAt=Date.now();
    const result=await change(s=>{
      if(!active()||Date.now()-clickedAt>1500) throw new Error('Navigation request expired. Click again in the active tab.');
      return prepareNavigation(s,identity,Date.now());
    });
    if(!active()||Date.now()-clickedAt>2000) {await change(s=>{if(owns(s,identity)){s.worker.phase='error';s.worker.navigation=null;s.worker.error='Navigation cancelled after focus changed.';}});return;}
    const current=await store.read();
    if(!active()||Date.now()-clickedAt>2000) {await change(s=>{if(owns(s,identity)){s.worker.phase='error';s.worker.navigation=null;s.worker.error='Navigation request expired or focus changed. Click again.';}});return;}
    if(!active() || !owns(current,identity) || current.worker.phase!=='navigating' || current.worker.navigation?.from!==identity.documentId) return;
    win.location.assign(result.result); // Sole programmatic navigation; reachable only from this trusted click.
  }));
  on(ui.el('inspect'),'click',e=>{
    if(!trusted(e) || busy) return;
    const snapshot=inspectBazaar(doc,win,{trusted:e.isTrusted,targetId:state.worker?.targetId,documentId:identity.documentId,at:Date.now(),initialUrl});
    void act(e,()=>change(s=>{
      if(!active()||win.location.href!==initialUrl)throw new Error('Focus or navigation changed. Inspection discarded.');
      return recordSnapshot(s,identity,snapshot,Date.now());
    }));
  });
  on(ui.el('events'),'click',e=>{
    const ack=e.target.closest('[data-ack]');
    if(ack) void act(e,()=>change(s=>{const event=s.events.find(x=>x.id===ack.dataset.ack);if(event)event.acknowledged=true;}));
    const link=e.target.closest('[data-route]');
    if(link && (!e.isTrusted || !active())) e.preventDefault();
    // A normal, deliberate hyperlink navigation. No input, purchase, or confirmation controls are touched.
  });
  on(ui.el('reset-layout'),'click',e=>{if(e.isTrusted)dock.reset();});
  on(ui.el('sound'),'change',e=>{
    if(!e.isTrusted||!active()){ui.el('sound').checked=false;return;}
    preferences.sound=ui.el('sound').checked;
    if(!preferences.sound){sound?.pause();return;}
    // A short audible WAV, created only after opt-in. No AudioContext, loop, or anti-throttling audio.
    if(!sound) sound=new win.Audio(makeChime());
    sound.volume=.35;sound.currentTime=0;
    void sound.play().catch(()=>{preferences.sound=false;ui.el('sound').checked=false;ui.el('notice').textContent='Browser blocked sound. Click Sound again to retry.';});
  });
  on(doc,'visibilitychange',()=>{if(active())void store.read().then(s=>update(s,false)).catch(()=>{});});
  on(win,'focus',()=>{void store.read().then(s=>update(s,false)).catch(()=>{});});
  try {
    listener=await gm.addValueChangeListener(KEY,(_key,_old,next,remote)=>{if(remote)update(next,true);});
    if(!error) {
      const current=await store.read();identity.workerId=current.worker?.tabId===identity.tabId?current.worker.id:'';
      if(current.worker?.tabId===identity.tabId && current.worker.navigation) {
        const attached=await change(s=>attachNavigation(s,identity,initialUrl,Date.now()));
        if(attached.result) identity.workerId=attached.state.worker.id;
      } else update(current,false);
    }
  } catch(e) {error=e.message||'Cross-tab connection failed.';}
  if(!win.navigator.locks?.request) error='Web Locks unavailable. Worker controls are disabled.';
  // This timer handles GM state/health only. It never inspects Torn listing content or navigates.
  ticker=win.setInterval(async()=>{
    if(closed || busy || error) return;
    try {
      const current=await store.read();
      if(owns(current,identity) && current.worker.phase!=='navigating') await change(s=>{if(owns(s,identity))s.worker.heartbeat=Date.now();});
      else update(current,false);
    } catch(e) {error=e.message;render();}
  },LIMIT.heartbeat);
  let menu;
  if(gm.registerMenuCommand) menu=await gm.registerMenuCommand('Dollar Broker: recover window',()=>{
    dock.reset();ui.setOpen(true);render();
  });
  function destroy() {
    if(closed) return;closed=true;
    win.clearInterval(ticker);dock.destroy();sound?.pause();cleanups.forEach(fn=>fn());
    if(listener!==null)void gm.removeValueChangeListener(listener);
    if(menu!==undefined && gm.unregisterMenuCommand)void gm.unregisterMenuCommand(menu);
    ui.host.remove();
  }
  on(win,'pagehide',e=>{
    destroy();
    // Register only when entering BFCache so initial pageshow cannot consume restoration.
    // Restore with a fresh document fence; the operator must resume explicitly.
    if(e.persisted) win.addEventListener('pageshow',()=>{void boot(gm,win,doc);},{once:true});
  },{once:true});
  update(state,false);
  return {destroy};
}
function makeChime() {
  const rate=8000,n=1200,buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
  const write=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
  write(0,'RIFF');v.setUint32(4,36+n*2,true);write(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*880*i/rate)*7000*Math.sin(Math.PI*i/n)**2),true);
  let bytes='';for(const b of new Uint8Array(buffer))bytes+=String.fromCharCode(b);
  return 'data:audio/wav;base64,'+btoa(bytes);
}

if(window.top===window.self) void boot(GM,window,document).catch(()=>{
  const note=document.createElement('div');note.textContent='MM Dollar Broker could not start. Check Tampermonkey grants and reload.';
  note.style.cssText='position:fixed;top:4px;left:4px;z-index:2147483647;background:#302b22;color:#ffd68b;padding:8px;font:12px sans-serif';document.body.append(note);
});
})();
