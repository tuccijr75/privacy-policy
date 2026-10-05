// ==UserScript==
// @name         MM_Dollar_Broker
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-rc.11
// @description  Finds $1 market leads via Torn's official API, verifies visible Buy state, and never purchases automatically.
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @sandbox      JavaScript
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@5cf7e5c114b8e1a2c4d60d70456c2f0c3f5bdbf9/modular-suite/core/MM_Torn_Core.js
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.user.js
// @connect      api.torn.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @grant        GM.getTab
// @grant        GM.saveTab
// @grant        GM.registerMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(() => {
'use strict';
// ---- core ----
const VERSION = '0.1.0-rc.11';
const SCHEMA = 1;
const KEY = 'mm-dollar-broker:state';
const LOCK = 'mm-dollar-broker:transaction:v1';
const LIMIT = Object.freeze({targets:100, events:50, seen:2000, leads:50, fresh:120000, marketFresh:30000, heartbeat:15000, stale:60000, navigation:30000});
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
function emptyState() { return {schema:SCHEMA, version:VERSION, revision:0, targets:[], worker:null, events:[], seen:[], marketLeads:[], discoveryCursor:0, lastDiscovery:0, lastDetection:0}; }
const validItemId = value => Number.isSafeInteger(value) && value > 0 && value <= 999999999;
function itemMarketUrl(itemId,name='') {
  if(!validItemId(itemId)) throw new Error('Invalid item ID.');
  return `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${itemId}&itemName=${encodeURIComponent(String(name).slice(0,120))}`;
}
function itemMarketItemId(url) {
  try {
    const u=new URL(url);
    if(u.origin!=='https://www.torn.com' || u.pathname!=='/page.php' || u.searchParams.get('sid')!=='ItemMarket') return null;
    const m=String(u.hash).match(/(?:^|[&#])itemID=(\d{1,9})(?:&|$)/);
    const id=m?Number(m[1]):null;
    return validItemId(id)?id:null;
  } catch { return null; }
}
const marketStatus=new Set(['lead','buyable','gone']);
function validMarketLead(lead) {
  return !!lead && textField(lead.id,80) && lead.id===`market:${lead.itemId}` && validItemId(lead.itemId) &&
    textField(lead.name) && lead.name.length>0 && Number.isSafeInteger(lead.marketValue) && lead.marketValue>=0 &&
    Number.isSafeInteger(lead.quantity) && lead.quantity>0 && finite(lead.apiObservedAt) && finite(lead.cacheTimestamp) &&
    marketStatus.has(lead.status) && finite(lead.verifiedAt) &&
    (lead.lowestVisiblePrice===null || (Number.isSafeInteger(lead.lowestVisiblePrice) && lead.lowestVisiblePrice>=1)) &&
    typeof lead.acknowledged==='boolean' && lead.url===itemMarketUrl(lead.itemId,lead.name);
}
function upsertMarketLead(state,lead,now) {
  if(!validItemId(lead?.itemId) || typeof lead?.name!=='string' || !lead.name.trim()) throw new Error('Market lead is invalid.');
  const quantity=Number(lead.quantity);
  const marketValue=Number(lead.marketValue)||0;
  const cacheTimestamp=Number(lead.cacheTimestamp)||0;
  if(!Number.isSafeInteger(quantity) || quantity<1 || !Number.isSafeInteger(marketValue) || marketValue<0 || !finite(cacheTimestamp)) throw new Error('Market lead fields are invalid.');
  const id=`market:${lead.itemId}`;
  const index=state.marketLeads.findIndex(x=>x.id===id);
  const previous=index>=0?state.marketLeads[index]:null;
  const sameCache=!!previous&&previous.cacheTimestamp===cacheTimestamp;
  const next={id,itemId:lead.itemId,name:lead.name.trim().slice(0,180),marketValue,quantity,apiObservedAt:now,cacheTimestamp,
    status:sameCache?previous.status:'lead',verifiedAt:sameCache?previous.verifiedAt:0,
    lowestVisiblePrice:sameCache?previous.lowestVisiblePrice:null,acknowledged:sameCache?previous.acknowledged:false,
    url:itemMarketUrl(lead.itemId,lead.name)};
  if(index>=0) state.marketLeads.splice(index,1);
  state.marketLeads.unshift(next);
  state.marketLeads=state.marketLeads.slice(0,LIMIT.leads);
  state.lastDiscovery=now;
  return next;
}
function verifyMarketLead(state,verification,now) {
  const itemId=Number(verification?.itemId);
  const lead=state.marketLeads.find(x=>x.itemId===itemId);
  if(!lead) throw new Error('This item is not in the current discovery list.');
  if(!verification.ok) throw new Error(verification.error||'Visible Item Market verification failed.');
  lead.verifiedAt=now;
  lead.lowestVisiblePrice=verification.lowestPrice;
  lead.status=verification.buyable?'buyable':'gone';
  lead.quantity=verification.buyable?Math.max(1,verification.quantity||1):lead.quantity;
  lead.acknowledged=false;
  if(lead.status==='buyable') state.lastDetection=now;
  return lead;
}
function actionableMarketLeads(state,now) {
  return state.marketLeads.filter(x=>x.status==='buyable' && !x.acknowledged && x.verifiedAt<=now && now-x.verifiedAt<LIMIT.marketFresh);
}
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
  const copy=structuredClone(raw);
  if(copy.marketLeads===undefined) copy.marketLeads=[];
  if(copy.discoveryCursor===undefined) copy.discoveryCursor=0;
  if(copy.lastDiscovery===undefined) copy.lastDiscovery=0;
  const w = copy.worker;
  if (!Number.isSafeInteger(copy.revision) || copy.revision < 0 || !Array.isArray(copy.targets) || copy.targets.length > LIMIT.targets || copy.targets.some(x=>!validId(x)) ||
      !Array.isArray(copy.events) || copy.events.length > LIMIT.events || copy.events.some(e=>!validEvent(e)) ||
      !Array.isArray(copy.seen) || copy.seen.length > LIMIT.seen || copy.seen.some(x=>!textField(x,400)) ||
      !Array.isArray(copy.marketLeads) || copy.marketLeads.length>LIMIT.leads || copy.marketLeads.some(x=>!validMarketLead(x)) ||
      !Number.isSafeInteger(copy.discoveryCursor) || copy.discoveryCursor<0 || !finite(copy.lastDiscovery) || !finite(copy.lastDetection) ||
      (w && (!textField(w.id,80) || !textField(w.tabId,80) || !textField(w.documentId,80) || !phases.has(w.phase) || !finite(w.heartbeat) ||
       !Number.isInteger(w.index) || w.index < -1 || w.index >= copy.targets.length || (w.targetId !== null && !validId(w.targetId)) ||
       !finite(w.lastScan) || !textField(w.error,240) || (w.navigation && (!validId(w.navigation.targetId) || !finite(w.navigation.at) || !textField(w.navigation.from,80)))))) {
    throw new Error('Broker state failed validation. Existing data was preserved.');
  }
  return copy;
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

// Live-first adapter. The semantic path mirrors Torn's current Bazaar cards:
// item image/name + exact price + "(N in stock)" text. Legacy data-testid support
// remains only as a compatibility path for older fixtures/Torn markup.
const SELECTOR = Object.freeze({
  root:'#bazaarRoot',
  legacyCard:'[data-testid="item"]',
  legacyName:'[data-testid="name"]',
  legacyPrice:'[data-testid="price"]',
  legacyQuantity:'[data-testid="amount"], [data-testid="buy-item-amount"]',
  owner:'[data-testid="bazaar-header"] a[href*="profiles.php"], h4 a[href*="profiles.php"], h3 a[href*="profiles.php"], [class*="title"] a[href*="profiles.php"]',
  loading:'[aria-busy="true"], [data-testid="loader"], [data-testid="loading"]'
});

const cleanText=value=>String(value??'').replace(/\s+/g,' ').trim();

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

function textNodes(scope, win, predicate) {
  const out=[];
  const walker=scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    const value=cleanText(node.textContent);
    const parent=node.parentElement;
    if(!value || !parent || !visible(parent,win,true)) continue;
    if(predicate(value,node,parent)) out.push({value,node,parent});
  }
  return out;
}

function currencyNodes(scope, win) {
  return textNodes(scope,win,value=>exactPrice(value)!==null);
}

function visibleText(scope, win) {
  const parts=[];
  const walker=scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    const parent=node.parentElement;
    const value=cleanText(node.textContent);
    if(value && parent && visible(parent,win,false)) parts.push(value);
  }
  return cleanText(parts.join(' '));
}

function stockQuantity(scope, win) {
  const text=visibleText(scope,win);
  const patterns=[
    /(?:^|\s|\()([1-9]\d{0,8}(?:,\d{3})*)\s+in stock(?:\)|\s|$)/i,
    /(?:^|\s|\()in stock\)?\s*([1-9]\d{0,8}(?:,\d{3})*)(?:\s|$)/i,
  ];
  for(const pattern of patterns) {
    const match=pattern.exec(text);
    if(match) return Number(match[1].replaceAll(',',''));
  }
  return null;
}

function itemIdentity(scope, win) {
  // The listing's price/stock/card must be foreground-visible. Item artwork itself may
  // be partially covered by Torn's own lock/stat overlays, so do not reject a card
  // merely because an overlay wins an elementFromPoint corner check.
  const images=[...scope.querySelectorAll('img[src*="/images/items/"]')].filter(img=>visible(img,win,false));
  const byId=new Map();
  for(const img of images) {
    const match=String(img.currentSrc||img.src||'').match(/\/images\/items\/(\d+)\//);
    if(!match) continue;
    const name=cleanText(img.getAttribute('alt'));
    const old=byId.get(match[1]);
    if(!old || (!old.name && name)) byId.set(match[1],{itemId:match[1],name,img});
  }
  if(byId.size!==1) return null;
  const one=[...byId.values()][0];
  if(!one.name) {
    const button=one.img.closest('button,[role="button"]');
    one.name=cleanText(button?.getAttribute('aria-label')||button?.getAttribute('title')||button?.textContent);
  }
  if(!one.name || one.name.length>180) return null;
  return one;
}

function semanticCards(root, win) {
  const found=[];
  const used=new Set();
  const images=[...root.querySelectorAll('img[src*="/images/items/"]')].filter(img=>visible(img,win,false));
  for(const img of images) {
    let node=img.parentElement;
    for(let depth=0;node && node!==root && depth<10;depth++,node=node.parentElement) {
      if(!(node instanceof HTMLElement) || !visible(node,win,true)) continue;
      const identity=itemIdentity(node,win);
      if(!identity) continue;
      const prices=currencyNodes(node,win);
      const quantity=stockQuantity(node,win);
      // Once an item card exposes either a price or stock signal, treat it as a
      // candidate and let parseSemanticCard validate the complete contract.
      // This prevents malformed visible cards from being silently skipped while
      // other cards on the same Bazaar still produce alerts.
      if(prices.length===0 && quantity===null) continue;
      if(!used.has(node)) {used.add(node);found.push(node);}
      break;
    }
  }
  return found;
}

function parseLegacyCard(card, win) {
  const names=card.querySelectorAll(SELECTOR.legacyName), prices=card.querySelectorAll(SELECTOR.legacyPrice);
  if(names.length!==1 || prices.length!==1 || !visible(names[0],win,true) || !visible(prices[0],win,true)) return null;
  const name=cleanText(names[0].textContent);
  const priceText=[...prices[0].childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const price=exactPrice(priceText);
  const amountNode=card.querySelector(SELECTOR.legacyQuantity);
  if(!name || name.length>180 || price===null || !visible(amountNode,win,true)) return null;
  const amount=cleanText(amountNode.textContent);
  const match=/^(?:x\s*)?([1-9]\d{0,8})(?:\s*(?:available|in stock|in total))?$/i.exec(amount);
  if(!match) return null;
  return {
    name,itemId:card.getAttribute('data-item-id')||'',listingId:card.getAttribute('data-listing-id')||'',
    price,quantity:Number(match[1]),available:true
  };
}

function parseSemanticCard(card, win) {
  const identity=itemIdentity(card,win);
  const prices=currencyNodes(card,win);
  const quantity=stockQuantity(card,win);
  if(!identity || prices.length!==1 || quantity===null) return null;
  const price=exactPrice(prices[0].value);
  if(price===null || !Number.isSafeInteger(quantity) || quantity<1) return null;
  const listingId=card.getAttribute('data-listing-id')||'';
  if(listingId.length>80) return null;
  return {name:identity.name,itemId:identity.itemId,listingId,price,quantity,available:true};
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

  const parseOwner=e=>{try{return {id:new URL(e.href,win.location.href).searchParams.get('XID'),name:cleanText(e.textContent)};}catch{return null;}};
  let owners=[...root.querySelectorAll('a[href*="profiles.php?XID="]')]
    .filter(e=>!e.closest('[data-testid="item"], [class*="description"], [data-testid="description"]') && visible(e,win))
    .map(parseOwner).filter(Boolean);

  if(owners.length) {
    if(owners.some(o=>o.id!==context.targetId)) return fail('Bazaar owner proof is ambiguous. No alert issued.');
  } else {
    // Current Torn can render the seller heading just outside #bazaarRoot. In that case
    // accept only a visible profile link for the exact URL target whose label has the
    // possessive Bazaar-owner form ("Name's"). This excludes the viewer's sidebar link.
    owners=[...doc.querySelectorAll('a[href*="profiles.php?XID="]')]
      .filter(e=>visible(e,win))
      .map(parseOwner)
      .filter(o=>o && o.id===context.targetId && /['’]s$/i.test(o.name));
  }

  if (!owners.length || owners.some(o=>o.id!==context.targetId)) return fail('Cannot prove the displayed Bazaar owner. No alert issued.');
  result.seller=(owners[0].name || context.targetId).replace(/['’]s$/,'').slice(0,180);

  const semantic=semanticCards(root,win);
  const legacy=semantic.length
    ? []
    : [...root.querySelectorAll(SELECTOR.legacyCard)].filter(card=>visible(card,win,true));
  const cards=semantic.length?semantic:legacy;
  if(!cards.length) {
    const body=cleanText(root.textContent);
    if(/does not have a bazaar|no items/i.test(body)) return {...result,ok:true,inspected:0};
    return fail('No complete visible Bazaar listing cards were recognized. Torn markup may have changed.');
  }

  let inspected=0,unsupported=0;
  for(const card of cards) {
    if(!visible(card,win,true)) continue;
    const item=semantic.length?parseSemanticCard(card,win):parseLegacyCard(card,win);
    if(!item) {unsupported++;continue;}
    inspected++;
    if(item.price===1 && item.available===true) result.items.push(item);
  }

  if(unsupported) return fail('A visible Bazaar listing has unsupported markup. Inspection discarded; no partial alerts were issued.');
  if(!inspected) return fail('No complete listing cards are visible. Scroll to a listing and inspect again.');
  return {...result,ok:true,inspected};
}

// ---- market ----
const API_KEY_KEY='mm-dollar-broker:api-key:v1';
const PREF_KEY='mm-dollar-broker:discovery-prefs:v1';
const DISCOVERY=Object.freeze({batch:50,gap:1250,minValue:1,maxBatch:50});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const integer=(value,min=0)=>Number.isSafeInteger(Number(value))&&Number(value)>=min?Number(value):null;

function apiRequest(gm,path,key) {
  if(!/^(?:torn\/items|market\/[1-9]\d{0,8}\/itemmarket)(?:\?.*)?$/.test(path)) throw new Error('Blocked non-market API route.');
  const request=gm?.xmlHttpRequest;
  if(typeof request!=='function') throw new Error('Tampermonkey API transport is unavailable.');
  const cleanKey=String(key||'').trim();
  if(!cleanKey || /\s/.test(cleanKey) || cleanKey.length<8 || cleanKey.length>128) throw new Error('Enter a valid Torn API key.');
  return new Promise((resolve,reject)=>{
    request({
      method:'GET',
      url:'https://api.torn.com/v2/'+path,
      headers:{Accept:'application/json',Authorization:'ApiKey '+cleanKey},
      timeout:15000,
      onload:response=>{
        if(response.status<200||response.status>=300) return reject(new Error('Torn API returned HTTP '+response.status+'.'));
        let data;
        try {data=JSON.parse(response.responseText);} catch {return reject(new Error('Torn API returned invalid JSON.'));}
        if(data?.error) return reject(new Error(data.error.error||data.error.message||'Torn API returned an error.'));
        resolve(data);
      },
      ontimeout:()=>reject(new Error('Torn API request timed out.')),
      onerror:()=>reject(new Error('Torn API request failed.'))
    });
  });
}

function normalizeCatalog(data) {
  if(!Array.isArray(data?.items)) throw new Error('Torn item catalog response is unsupported.');
  return data.items.map(item=>{
    const id=integer(item?.id,1);
    const marketValue=integer(item?.value?.market_price,0);
    const name=typeof item?.name==='string'?item.name.trim():'';
    if(!id||marketValue===null||!name||item?.is_tradable!==true) return null;
    return {id,name:name.slice(0,180),marketValue};
  }).filter(Boolean);
}

function selectDiscoveryBatch(items,minValue,cursor,count=DISCOVERY.batch) {
  const floor=Math.max(1,integer(minValue,1)??DISCOVERY.minValue);
  const eligible=items.filter(item=>item.marketValue>=floor)
    .sort((a,b)=>b.marketValue-a.marketValue||a.id-b.id);
  if(!eligible.length) return {items:[],nextCursor:0,total:0};
  const size=Math.min(Math.max(1,integer(count,1)??DISCOVERY.batch),DISCOVERY.maxBatch,eligible.length);
  const start=(integer(cursor,0)??0)%eligible.length;
  const selected=[];
  for(let i=0;i<size;i++)selected.push(eligible[(start+i)%eligible.length]);
  return {items:selected,nextCursor:(start+size)%eligible.length,total:eligible.length};
}

function dollarLeadFromResponse(data,item,now) {
  const market=data?.itemmarket;
  if(!market || !Array.isArray(market.listings)) throw new Error('Torn Item Market response is unsupported.');
  const cacheTimestamp=integer(market.cache_timestamp,0)??0;
  let quantity=0;
  for(const listing of market.listings) {
    const price=integer(listing?.price,1);
    const amount=integer(listing?.amount,1);
    if(price===1 && amount) quantity+=amount;
  }
  if(!quantity) return null;
  const apiItem=market.item;
  const name=(typeof apiItem?.name==='string'&&apiItem.name.trim())?apiItem.name.trim():item.name;
  return {itemId:item.id,name:name.slice(0,180),marketValue:item.marketValue,quantity,cacheTimestamp,apiObservedAt:now};
}

async function discoverDollarLeads({gm,key,minValue,cursor=0,count=DISCOVERY.batch,onProgress=()=>{},shouldStop=()=>false}) {
  const catalog=normalizeCatalog(await apiRequest(gm,'torn/items',key));
  const batch=selectDiscoveryBatch(catalog,minValue,cursor,count);
  const leads=[];
  for(let i=0;i<batch.items.length;i++) {
    if(shouldStop()) throw new Error('Discovery stopped.');
    const item=batch.items[i];
    onProgress({phase:'scan',current:i+1,total:batch.items.length,item,totalEligible:batch.total});
    const data=await apiRequest(gm,`market/${item.id}/itemmarket?limit=20&offset=0`,key);
    const lead=dollarLeadFromResponse(data,item,Date.now());
    if(lead) leads.push(lead);
    if(i<batch.items.length-1) await sleep(DISCOVERY.gap);
  }
  onProgress({phase:'done',current:batch.items.length,total:batch.items.length,found:leads.length,totalEligible:batch.total});
  return {leads,nextCursor:batch.nextCursor,totalEligible:batch.total,scanned:batch.items.length};
}

// ---- market_adapter ----

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

function visible(element,win) {
  if(!element?.isConnected) return false;
  for(let e=element;e&&e.nodeType===1;e=e.parentElement) {
    const style=win.getComputedStyle(e);
    if(e.hidden||e.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0) return false;
  }
  const r=element.getBoundingClientRect();
  return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<win.innerHeight&&r.left<win.innerWidth;
}

function parseBuyLabel(label) {
  const match=/^Buy item (.+), \$([0-9][0-9,]*), ([1-9][0-9,]*) in total\.$/i.exec(clean(label));
  if(!match) return null;
  const price=Number(match[2].replaceAll(',',''));
  const amount=Number(match[3].replaceAll(',',''));
  if(!Number.isSafeInteger(price)||price<1||!Number.isSafeInteger(amount)||amount<1) return null;
  return {name:match[1].trim().slice(0,180),price,amount};
}

function inspectItemMarket(doc,win,{trusted,itemId,at}) {
  const result={ok:false,itemId:Number(itemId)||0,buyable:false,quantity:0,lowestPrice:null,name:'',at,error:''};
  const fail=error=>({...result,error});
  if(!trusted||doc.visibilityState!=='visible'||!doc.hasFocus()) return fail('Verify from a deliberate click in the focused Item Market tab.');
  if(doc.readyState!=='complete') return fail('Item Market is still loading.');
  const current=itemMarketItemId(win.location.href);
  if(!current||current!==Number(itemId)) return fail('Open the matching Item Market page before verification.');

  const buttons=[...doc.querySelectorAll('button[aria-label^="Buy item "]')].filter(button=>visible(button,win));
  if(!buttons.length) return fail('No visible Torn Buy controls were found. The market may still be rendering.');

  const parsed=[];
  for(const button of buttons) {
    const details=parseBuyLabel(button.getAttribute('aria-label'));
    if(!details) continue;
    parsed.push({...details,enabled:!button.disabled&&button.getAttribute('aria-disabled')!=='true'});
  }
  if(!parsed.length) return fail('Visible Torn Buy controls use unsupported markup.');

  result.lowestPrice=Math.min(...parsed.map(x=>x.price));
  const dollar=parsed.filter(x=>x.price===1&&x.enabled);
  result.buyable=dollar.length>0;
  result.quantity=dollar.reduce((sum,x)=>sum+x.amount,0);
  result.name=(dollar[0]||parsed[0]).name;
  return {...result,ok:true};
}

// ---- ui ----

const money=value=>'$'+Number(value||0).toLocaleString();
const age=(then,now)=>then?Math.max(0,Math.floor((now-then)/1000)):null;

function makeUI(doc) {
  const host=doc.createElement('div');
  host.id='mm-dollar-broker';
  host.style.cssText='position:fixed;inset:0;z-index:2147483644;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});
  const style=doc.createElement('style');
  style.textContent=`
    :host{all:initial;color-scheme:dark;font:13px/1.45 system-ui,sans-serif;color:#edf2ed}
    *{box-sizing:border-box}button,input,textarea{font:inherit}button,a,summary{touch-action:manipulation}
    button,a.action{border:1px solid #535e59;background:#303a35;color:#eff6f0;border-radius:5px;padding:7px 10px;cursor:pointer;text-decoration:none}
    button:hover,a.action:hover{background:#415147}button:disabled{opacity:.4;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid #c8ec81;outline-offset:2px}
    #panel{position:fixed;right:12px;top:82px;pointer-events:auto;width:min(390px,calc(100vw - 12px));max-height:calc(100vh - 64px);overflow:auto;background:#1b211e;border:1px solid #53634f;border-radius:8px;box-shadow:0 12px 35px #0009}
    [hidden]{display:none!important}header{position:sticky;top:0;z-index:1;background:#272f29;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #414c42;cursor:grab;touch-action:none}
    header strong{letter-spacing:.08em;font-size:12px}header small{display:block;color:#a5b69d;font-size:10px;letter-spacing:.16em}header button{padding:0 8px;font-size:20px}
    .body{padding:12px}.status{display:flex;gap:8px;align-items:center;font-weight:650}.dot{width:7px;height:7px;border-radius:50%;background:#a1c875}.muted{color:#adb9af;font-size:11px}
    #notice{color:#f1cc83;font-size:12px;white-space:pre-wrap}#notice:empty{display:none}.row{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.primary{background:#445936;border-color:#7c965d}
    h2{font-size:11px;letter-spacing:.1em;color:#b1bdab;margin:15px 0 8px}.count{font-size:11px;color:#c4d2bb}
    article{background:#252d27;border:1px solid #43523b;border-left:3px solid #a6ca70;padding:9px;margin-bottom:8px;border-radius:4px}article b{display:block;color:#d9f2b3}article .row{margin-bottom:0}
    article[data-status="lead"]{border-left-color:#d8b56a}article[data-status="gone"]{opacity:.58;border-left-color:#77817a}article[data-status="stale"]{opacity:.72;border-left-color:#90a193}
    .tag{display:inline-block;font:bold 10px/1.4 system-ui;letter-spacing:.06em;padding:2px 5px;border-radius:3px;background:#3c4f32;color:#dff7bc;margin:4px 0}.tag.lead{background:#554727;color:#ffe0a0}.tag.gone{background:#3e4440;color:#c0c7c2}
    #market-leads,#events{max-height:260px;overflow:auto}details{border-top:1px solid #3b443c;padding-top:8px;margin-top:10px}summary{cursor:pointer;color:#c6d0c2;font-size:12px}
    textarea{display:block;width:100%;min-height:65px;max-height:140px;background:#111713;border:1px solid #4d5b49;color:#e0e9df;padding:6px;margin:6px 0;resize:vertical}
    input[type="password"],input[type="number"]{width:100%;background:#111713;border:1px solid #4d5b49;color:#e0e9df;padding:7px;margin:5px 0;border-radius:4px}
    label{display:block;margin-top:7px;font-size:12px}pre{font:10px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#b1bfae}footer{color:#94a18f;font-size:10px;padding-top:10px}#mode{margin-top:5px}
  `;
  const panel=doc.createElement('section');
  panel.id='panel';panel.hidden=true;panel.setAttribute('aria-label','Dollar Broker');
  panel.innerHTML=`<header id="header"><div><small>MM TORN SYSTEMS</small><strong>DOLLAR BROKER</strong></div><button type="button" id="minimize" aria-label="Minimize Broker">−</button></header>
    <div class="body">
      <div class="status"><span class="dot"></span><span id="status" role="status">Ready</span></div>
      <div id="mode" class="muted">Official market discovery · visible Torn verification · manual purchase</div>
      <p id="notice" role="status"></p>
      <div class="row"><button id="find-deals" class="primary" type="button">Find $1 Deals</button><button id="verify-market" type="button">Verify visible market</button></div>
      <div id="discovery-progress" class="muted"></div>
      <h2>MARKET DEALS <span class="count" id="market-count"></span></h2><div id="market-leads" aria-live="polite"></div>

      <details><summary>Discovery settings</summary>
        <label for="api-key">Torn public API key</label><input id="api-key" type="password" autocomplete="off" placeholder="Stored only in Tampermonkey">
        <div id="api-status" class="muted"></div>
        <label for="min-value">Minimum normal market value</label><input id="min-value" type="number" min="1" step="1000">
        <div class="row"><button id="save-api-key" type="button">Save key locally</button><button id="clear-api-key" type="button">Clear key</button></div>
        <div class="muted">Each Find run checks 50 tradable items, highest-value first, then continues from the saved cursor. Torn's official market API is globally cached; leads must be verified on the visible Item Market page before they are labeled buyable.</div>
      </details>

      <details><summary>Known Bazaar scanner (secondary)</summary>
        <div id="progress" class="muted"></div>
        <div class="row"><button id="start" type="button">Start in this tab</button><button id="pause" type="button">Pause</button><button id="stop" type="button">Stop</button></div>
        <div class="row"><button id="next" type="button">Open next Bazaar</button><button id="inspect" type="button">Inspect visible listings</button></div>
        <label for="targets">Known seller IDs</label><textarea id="targets" placeholder="One ID per line, or comma-separated" maxlength="1400"></textarea>
        <div class="row"><button type="button" id="save-targets">Save sellers</button></div>
        <h2>BAZAAR LEADS <span class="count" id="count"></span></h2><div id="events" aria-live="polite"></div>
      </details>

      <details><summary>Preferences</summary><label><input id="sound" type="checkbox"> Sound in this tab</label><span class="muted">Sound is only used for fresh verified/actionable observations after a user action.</span></details>
      <details><summary>Local diagnostics</summary><pre id="diagnostics"></pre></details>
      <footer>Independent MM tool · ${VERSION} · never presses Torn Buy controls</footer>
    </div>`;
  shadow.append(style,panel);doc.body.append(host);
  const ui={host,shadow,panel,launcher:null,setLauncherActive:null,eventKey:'',marketKey:'',el:id=>shadow.getElementById(id)};
  ui.setLauncher=(launcher,setActive)=>{ui.launcher=launcher;ui.setLauncherActive=setActive||null;if(ui.launcher)ui.launcher.setAttribute('aria-expanded',String(!panel.hidden));};
  ui.setOpen=open=>{panel.hidden=!open;if(ui.launcher)ui.launcher.setAttribute('aria-expanded',String(open));};
  return ui;
}

function renderUI(ui,state,identity,now,localError='',session={}) {
  const h=health(state,now), fresh=unread(state,now), actionable=actionableMarketLeads(state,now), w=state.worker;
  const mine=w?.tabId===identity.tabId&&w?.documentId===identity.documentId;
  const totalBadge=actionable.length+fresh.length;
  const status=session.discoveryBusy?'Scanning official market':actionable.length?`${actionable.length} buyable now`:h.label;
  if(ui.launcher){
    const mode=h.kind==='warning'?'warning':totalBadge?'deal':session.discoveryBusy?'active':h.kind;
    ui.launcher.dataset.mmDollarState=mode;
    ui.launcher.title=`Dollar Broker · ${status} · ${actionable.length} verified market · ${fresh.length} Bazaar`;
    ui.launcher.setAttribute('aria-label',ui.launcher.title);
    const badge=ui.launcher.querySelector('[data-mm-dollar-badge]');
    if(badge){badge.hidden=!totalBadge;badge.textContent=String(totalBadge);}
    ui.launcher.style.boxShadow=totalBadge?'0 0 0 2px #738f45,0 0 10px #c7ee86':h.kind==='warning'?'0 0 0 1px #ffb855':'';
    ui.setLauncherActive?.(h.kind==='active'||session.discoveryBusy||totalBadge>0);
  }
  ui.el('status').textContent=status;
  ui.el('notice').textContent=localError||w?.error||'';
  ui.el('discovery-progress').textContent=session.discoveryProgress||`${state.marketLeads.length} market lead${state.marketLeads.length===1?'':'s'} saved · scan cursor ${state.discoveryCursor}`;
  ui.el('find-deals').disabled=!!localError||session.discoveryBusy||!session.apiConfigured;
  ui.el('verify-market').disabled=!!localError||session.discoveryBusy||!session.currentMarketLead;
  ui.el('api-status').textContent=session.apiConfigured?'API key saved locally in Tampermonkey.':'No API key saved.';
  if(ui.shadow.activeElement!==ui.el('min-value'))ui.el('min-value').value=String(session.minValue||1);

  ui.el('progress').textContent=w?`${mine?'This tab is the Bazaar worker':'Bazaar worker is in another tab/document'} · ${w.index<0?'No seller opened':`${w.index+1}/${state.targets.length} · Player ${w.targetId||'—'}`}`:`${state.targets.length} known seller${state.targets.length===1?'':'s'} configured`;
  ui.el('start').textContent=w?.tabId===identity.tabId?'Resume here':'Start in this tab';
  ui.el('start').disabled=!!localError||!state.targets.length||!!(w&&w.tabId!==identity.tabId);
  ui.el('pause').disabled=!w||w.phase==='paused';ui.el('stop').disabled=!w;
  ui.el('next').disabled=!mine||w.phase==='paused'||w.phase==='navigating';
  ui.el('inspect').disabled=!mine||!w.targetId||['paused','navigating'].includes(w.phase);
  ui.el('save-targets').disabled=!!w;
  if(ui.shadow.activeElement!==ui.el('targets'))ui.el('targets').value=state.targets.join('\n');

  const marketKey=state.marketLeads.map(x=>`${x.id}:${x.status}:${x.verifiedAt}:${x.apiObservedAt}:${x.acknowledged}`).join('|')+`:${Math.floor(now/5000)}`;
  if(ui.marketKey!==marketKey){
    ui.marketKey=marketKey;ui.el('market-leads').replaceChildren();
    for(const lead of state.marketLeads){
      const isActionable=lead.status==='buyable'&&!lead.acknowledged&&now-lead.verifiedAt<LIMIT.marketFresh;
      const visualStatus=isActionable?'buyable':lead.status==='lead'?'lead':lead.status==='gone'?'gone':'stale';
      const card=document.createElement('article');card.dataset.status=visualStatus;
      const name=document.createElement('b');name.textContent=`$1 · ${lead.name}`;
      const tag=document.createElement('span');tag.className='tag '+(visualStatus==='lead'?'lead':visualStatus==='gone'?'gone':'');
      tag.textContent=isActionable?'BUYABLE NOW':lead.status==='lead'?'API LEAD — VERIFY':lead.status==='gone'?'GONE / NOT $1':'REVERIFY';
      const info=document.createElement('div');info.textContent=`Normal value ~${money(lead.marketValue)} · API qty ${lead.quantity}`;
      const timing=document.createElement('div');timing.className='muted';
      timing.textContent=lead.verifiedAt?`Verified ${age(lead.verifiedAt,now)}s ago`:`API observed ${age(lead.apiObservedAt,now)}s ago`;
      if(lead.lowestVisiblePrice)timing.textContent+=` · visible low ${money(lead.lowestVisiblePrice)}`;
      const actions=document.createElement('div');actions.className='row';
      const link=document.createElement('a');link.className='action';link.textContent='Open Item Market';link.href=lead.url;link.dataset.marketRoute=String(lead.itemId);
      actions.append(link);
      if(isActionable){const ack=document.createElement('button');ack.type='button';ack.textContent='Dismiss';ack.dataset.ackMarket=lead.id;actions.append(ack);}
      card.append(name,tag,info,timing,actions);ui.el('market-leads').append(card);
    }
    if(!state.marketLeads.length){const p=document.createElement('div');p.className='muted';p.textContent='No market leads yet. Save a public Torn API key, then run Find $1 Deals.';ui.el('market-leads').append(p);}
  }
  ui.el('market-count').textContent=`${actionable.length} buyable · ${state.marketLeads.filter(x=>x.status==='lead').length} verify`;

  ui.el('count').textContent=`${fresh.length} new`;
  const eventKey=state.events.map(e=>`${e.id}:${e.acknowledged}:${e.expiresAt>now}`).join('|');
  if(ui.eventKey!==eventKey){
    ui.eventKey=eventKey;ui.el('events').replaceChildren();
    for(const e of state.events){
      const card=document.createElement('article');card.dataset.status=e.expiresAt<=now?'stale':'lead';
      const name=document.createElement('b');name.textContent=`$1 · ${e.item.name}`;
      const seller=document.createElement('div');seller.textContent=`${e.seller} [${e.targetId}]`;
      const timing=document.createElement('div');timing.className='muted';timing.textContent=`Observed ${new Date(e.detectedAt).toLocaleTimeString()}${e.expiresAt<=now?' · stale':''}`;
      const actions=document.createElement('div');actions.className='row';
      const link=document.createElement('a');link.className='action';link.textContent='Open Bazaar';link.href=e.url;link.dataset.route=e.id;
      const ack=document.createElement('button');ack.type='button';ack.textContent=e.acknowledged?'Acknowledged':'Acknowledge';ack.disabled=e.acknowledged;ack.dataset.ack=e.id;
      actions.append(link,ack);card.append(name,seller,timing,actions);ui.el('events').append(card);
    }
    if(!state.events.length){const p=document.createElement('div');p.className='muted';p.textContent='No known-Bazaar observations.';ui.el('events').append(p);}
  }
  ui.el('diagnostics').textContent=JSON.stringify({script:VERSION,schema:state.schema,revision:state.revision,marketLeads:state.marketLeads.length,actionableMarket:actionable.length,discoveryCursor:state.discoveryCursor,lastDiscovery:state.lastDiscovery||null,workerId:w?.id||null,phase:w?.phase||'stopped',target:w?.targetId||null,targetCount:state.targets.length,lastDetection:state.lastDetection||null,events:state.events.length,duplicateLedger:`${state.seen.length}/${LIMIT.seen}`,apiConfigured:!!session.apiConfigured,discoveryBusy:!!session.discoveryBusy,window:ui.panel.hidden?'minimized':'open',error:localError||w?.error||null},null,2);
}

// ---- runtime ----

const MODULE_ID='dollar-broker';
const DOCK_ICON='<span style="position:relative;width:100%;height:100%;display:grid;place-items:center"><svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="width:25px;height:25px"><path d="M4 4h11l7 7-11 11-7-7Z"/><circle cx="8" cy="8" r="1"/><path d="M16 9c-4-3-8 2-4 4s0 6-4 3m8-8-8 10"/></svg><span data-mm-dollar-badge hidden style="position:absolute;right:-7px;top:-7px;background:#d4f59e;border:1px solid #28341c;color:#172312;border-radius:9px;min-width:17px;padding:0 4px;font:bold 11px/16px system-ui;pointer-events:none">0</span></span>';

async function boot(gm, win, doc) {
  const sharedCore=globalThis.MMTornCore;
  if(!sharedCore?.registerDockLauncher || !sharedCore?.makePanelDraggable) throw new Error('MM Torn Core dependency is unavailable.');

  const identity={tabId:'',documentId:win.crypto.randomUUID(),workerId:''};
  const store=new Store(gm,win.navigator.locks);
  let state=emptyState(), error='', closed=false, busy=false, baseline=false, ticker=null, listener=null, sound=null;
  let apiKey='', discoveryBusy=false, discoveryProgress='';
  let preferences={sound:false,minValue:DISCOVERY.minValue};
  let tabData;
  try {
    tabData=await gm.getTab();
    if (!tabData.mmDollarBrokerTab) {tabData.mmDollarBrokerTab=win.crypto.randomUUID();await gm.saveTab(tabData);}
    identity.tabId=tabData.mmDollarBrokerTab;
    state=await store.read();
    apiKey=String(await gm.getValue(API_KEY_KEY,'')||'').trim();
    const savedPrefs=await gm.getValue(PREF_KEY,null);
    if(savedPrefs && Number.isSafeInteger(Number(savedPrefs.minValue)) && Number(savedPrefs.minValue)>0) preferences.minValue=Number(savedPrefs.minValue);
  } catch {error='Storage initialization failed or has an unsupported schema. Existing data was preserved.';}

  const initialUrl=win.location.href;
  const ui=makeUI(doc);

  const launcher=sharedCore.registerDockLauncher({
    id:MODULE_ID,
    label:'MM Dollar Broker',
    accent:'#9bbf70',
    icon:DOCK_ICON,
    onClick:event=>{
      if(!event?.isTrusted || closed)return;
      ui.setOpen(ui.panel.hidden);
      render();
    }
  });
  if(!(launcher instanceof HTMLElement)) throw new Error('Shared MM dock launcher could not be registered.');
  ui.setLauncher(launcher,active=>sharedCore.setDockLauncherActive?.(MODULE_ID,active));
  sharedCore.makePanelDraggable(ui.panel,ui.el('header'),MODULE_ID,{right:'12px',top:'82px'});

  const played=new Set(),playedMarket=new Set();
  function active() {return !closed && doc.visibilityState==='visible' && doc.hasFocus();}
  function session() {
    const currentId=itemMarketItemId(win.location.href);
    return {
      apiConfigured:!!apiKey,
      discoveryBusy,
      discoveryProgress,
      minValue:preferences.minValue,
      currentMarketLead:!!(currentId&&state.marketLeads.some(x=>x.itemId===currentId))
    };
  }
  function render() {if(!closed)renderUI(ui,state,identity,Date.now(),error,session());}
  function update(next, audible=false) {
    if(closed) return;
    let validated;
    try {validated=readState(next);} catch(e) {error=e.message;render();return;}
    if(validated.revision<state.revision) return;
    state=validated;
    let chime=false;
    for(const e of unread(state,Date.now())) {
      if(!played.has(e.id) && baseline && audible && preferences.sound && active() && sound) chime=true;
      played.add(e.id);
    }
    for(const lead of actionableMarketLeads(state,Date.now())) {
      if(!playedMarket.has(lead.id) && baseline && audible && preferences.sound && active() && sound) chime=true;
      playedMarket.add(lead.id);
    }
    if(chime) {
      sound.currentTime=0;
      void sound.play().catch(()=>{preferences.sound=false;ui.el('sound').checked=false;ui.el('notice').textContent='Sound permission was blocked. Enable sound again with a click.';});
    }
    const currentEvents=new Set(state.events.map(e=>e.id));for(const id of played) if(!currentEvents.has(id)) played.delete(id);
    const currentMarket=new Set(state.marketLeads.map(e=>e.id));for(const id of playedMarket) if(!currentMarket.has(id)) playedMarket.delete(id);
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
  on(ui.el('minimize'),'click',e=>{if(e.isTrusted){ui.setOpen(false);render();ui.launcher.focus();}});
  on(ui.panel,'keydown',e=>{if(e.key==='Escape'){ui.setOpen(false);render();ui.launcher.focus();}});

  on(ui.el('save-api-key'),'click',e=>act(e,async()=>{
    const value=ui.el('api-key').value.trim();
    if(!value || /\s/.test(value) || value.length<8 || value.length>128) throw new Error('Enter a valid Torn public API key.');
    await gm.setValue(API_KEY_KEY,value);
    apiKey=value;ui.el('api-key').value='';render();
  }));
  on(ui.el('clear-api-key'),'click',e=>act(e,async()=>{
    await gm.setValue(API_KEY_KEY,'');
    apiKey='';ui.el('api-key').value='';render();
  }));
  on(ui.el('min-value'),'change',e=>act(e,async()=>{
    const value=Number(ui.el('min-value').value);
    if(!Number.isSafeInteger(value)||value<1) throw new Error('Minimum value must be a positive whole dollar amount.');
    preferences.minValue=value;
    await gm.setValue(PREF_KEY,{minValue:value});
    render();
  }));

  on(ui.el('find-deals'),'click',e=>act(e,async()=>{
    if(!apiKey) throw new Error('Save a Torn public API key first.');
    const value=Number(ui.el('min-value').value);
    if(Number.isSafeInteger(value)&&value>0&&value!==preferences.minValue){
      preferences.minValue=value;await gm.setValue(PREF_KEY,{minValue:value});
    }
    discoveryBusy=true;discoveryProgress='Loading Torn item catalog…';render();
    try {
      const result=await discoverDollarLeads({
        gm,key:apiKey,minValue:preferences.minValue,cursor:state.discoveryCursor,count:DISCOVERY.batch,
        shouldStop:()=>closed,
        onProgress:progress=>{
          if(progress.phase==='scan') discoveryProgress=`Scanning ${progress.current}/${progress.total}: ${progress.item.name} · normal value ~${progress.item.marketValue.toLocaleString()}`;
          else if(progress.phase==='done') discoveryProgress=`Scanned ${progress.total} items · found ${progress.found} $1 lead${progress.found===1?'':'s'}`;
          render();
        }
      });
      await change(s=>{
        for(const lead of result.leads) upsertMarketLead(s,lead,lead.apiObservedAt);
        s.discoveryCursor=result.nextCursor;
        s.lastDiscovery=Date.now();
      });
      discoveryProgress=`Scanned ${result.scanned}/${result.totalEligible} eligible items · found ${result.leads.length} $1 lead${result.leads.length===1?'':'s'} · next batch continues automatically`;
    } finally {
      discoveryBusy=false;render();
    }
  }));

  on(ui.el('verify-market'),'click',e=>{
    if(!trusted(e)||busy)return;
    const itemId=itemMarketItemId(win.location.href);
    const wasOpen=!ui.panel.hidden;
    if(wasOpen)ui.panel.hidden=true;
    let verification;
    try {verification=inspectItemMarket(doc,win,{trusted:e.isTrusted,itemId,at:Date.now()});}
    finally {if(wasOpen)ui.panel.hidden=false;}
    void act(e,()=>change(s=>verifyMarketLead(s,verification,Date.now())));
  });

  on(ui.el('market-leads'),'click',e=>{
    const ack=e.target.closest('[data-ack-market]');
    if(ack) void act(e,()=>change(s=>{const lead=s.marketLeads.find(x=>x.id===ack.dataset.ackMarket);if(lead)lead.acknowledged=true;}));
    const link=e.target.closest('[data-market-route]');
    if(link&&(!e.isTrusted||!active()))e.preventDefault();
  });

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
    win.location.assign(result.result);
  }));
  on(ui.el('inspect'),'click',e=>{
    if(!trusted(e) || busy) return;
    const wasOpen=!ui.panel.hidden;
    if(wasOpen) ui.panel.hidden=true;
    let snapshot;
    try {
      snapshot=inspectBazaar(doc,win,{trusted:e.isTrusted,targetId:state.worker?.targetId,documentId:identity.documentId,at:Date.now(),initialUrl});
    } finally {
      if(wasOpen) ui.panel.hidden=false;
    }
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
  });
  on(ui.el('sound'),'change',e=>{
    if(!e.isTrusted||!active()){ui.el('sound').checked=false;return;}
    preferences.sound=ui.el('sound').checked;
    if(!preferences.sound){sound?.pause();return;}
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
  if(!win.navigator.locks?.request) error='Web Locks unavailable. Bazaar worker controls are disabled.';

  ticker=win.setInterval(async()=>{
    if(closed || busy || error) return;
    try {
      const current=await store.read();
      if(owns(current,identity) && current.worker.phase!=='navigating') await change(s=>{if(owns(s,identity))s.worker.heartbeat=Date.now();});
      else update(current,false);
    } catch(e) {error=e.message;render();}
  },LIMIT.heartbeat);

  let menu;
  if(gm.registerMenuCommand) menu=await gm.registerMenuCommand('Dollar Broker: recover window',()=>{ui.setOpen(true);render();});

  function destroy() {
    if(closed) return;closed=true;
    win.clearInterval(ticker);sound?.pause();cleanups.forEach(fn=>fn());
    if(typeof ui.panel.__mmPanelDragCleanup==='function')ui.panel.__mmPanelDragCleanup();
    if(ui.launcher?.isConnected)ui.launcher.remove();
    if(listener!==null)void gm.removeValueChangeListener(listener);
    if(menu!==undefined && gm.unregisterMenuCommand)void gm.unregisterMenuCommand(menu);
    ui.host.remove();
  }
  on(win,'pagehide',e=>{
    destroy();
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
  const note=document.createElement('div');note.textContent='MM Dollar Broker could not start. Check Tampermonkey grants and shared MM Torn Core, then reload.';
  note.style.cssText='position:fixed;top:4px;left:4px;z-index:2147483647;background:#302b22;color:#ffd68b;padding:8px;font:12px sans-serif';document.body.append(note);
});
})();
