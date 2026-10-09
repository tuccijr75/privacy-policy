// ==UserScript==
// @name         MM_Dollar_Broker PDA
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-rc.20-pda.1
// @description  TornPDA build of MM Dollar Broker. API-prefilters $1 listings, passively rejects locked cards, and leaves every purchase manual.
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.pda.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Dollar_Broker.pda.user.js
// @connect      api.torn.com
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(() => {
'use strict';

const __MM_PDA_API_KEY='###PDA-APIKEY###';
// ---- core ----
const VERSION = '0.1.0-rc.20-pda.1';
const SCHEMA = 1;
const KEY = 'mm-dollar-broker:state';
const LOCK = 'mm-dollar-broker:transaction:v1';
const LIMIT = Object.freeze({targets:250, events:5000, seen:20000, leads:50, sellers:1000, apiCandidateItems:5000, fresh:300000, marketFresh:30000, heartbeat:15000, stale:60000, navigation:30000, scanStale:120000});
const phases = new Set(['ready','awaiting-inspection','inspecting','paused','navigating','error']);
const validId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value);
const bazaarUrl = id => {
  if (!validId(id)) throw new Error('Invalid public player ID.');
  return `https://www.torn.com/bazaar.php?userId=${id}`;
};
const SCAN_PARAM='mmDollarScan';
const validScanId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{8,80}$/.test(value);
function bazaarScanUrl(id,scanId) {
  if(!validScanId(scanId)) throw new Error('Invalid seller scan ID.');
  return bazaarUrl(id)+'&'+SCAN_PARAM+'='+encodeURIComponent(scanId);
}
function scanTokenAt(url) {
  try {
    const u=new URL(url);
    if(u.origin!=='https://www.torn.com' || u.pathname!=='/bazaar.php') return null;
    const token=u.searchParams.get(SCAN_PARAM);
    return validScanId(token)?token:null;
  } catch { return null; }
}
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
function emptyState() { return {schema:SCHEMA, version:VERSION, bazaarVerification:3, revision:0, targets:[], worker:null, sellerScan:null, events:[], seen:[], sellerLeads:[], marketLeads:[], discoveryCursor:0, lastSellerDiscovery:0, lastDiscovery:0, lastDetection:0}; }
function clearDiscoveryResults(state) {
  state.worker=null;
  state.sellerScan=null;
  state.events=[];
  state.seen=[];
  state.sellerLeads=[];
  state.marketLeads=[];
  state.discoveryCursor=0;
  state.lastSellerDiscovery=0;
  state.lastDiscovery=0;
  state.lastDetection=0;
  return state;
}
function validSellerLead(lead) {
  return !!lead && textField(lead.id,80) && lead.id===`seller:${lead.sellerId}` && validId(lead.sellerId) &&
    textField(lead.name) && lead.name.length>0 && typeof lead.isOpen==='boolean' &&
    (lead.dollarSales===null || (Number.isSafeInteger(lead.dollarSales) && lead.dollarSales>=0)) && finite(lead.observedAt) &&
    lead.url===bazaarUrl(lead.sellerId);
}
function replaceSellerLeads(state,leads,now) {
  if(!Array.isArray(leads)) throw new Error('Dollar seller leads are invalid.');
  const next=[];
  for(const lead of leads) {
    const sellerId=String(lead?.sellerId??'');
    const name=typeof lead?.name==='string'?lead.name.trim().slice(0,180):'';
    const dollarSales=lead?.dollarSales===null||lead?.dollarSales===undefined?null:Number(lead.dollarSales);
    const isOpen=lead?.isOpen===true;
    const candidate={id:`seller:${sellerId}`,sellerId,name,isOpen,dollarSales,observedAt:now,url:bazaarUrl(sellerId)};
    if(!validSellerLead(candidate)) throw new Error('Dollar seller lead failed validation.');
    next.push(candidate);
  }
  if(next.length>LIMIT.sellers) throw new Error(`Torn returned more than ${LIMIT.sellers} directory sellers. Scan aborted instead of truncating results.`);
  state.sellerLeads=next;
  state.lastSellerDiscovery=now;
  return state.sellerLeads;
}
function workerIsStale(worker,now) {
  if(!worker) return false;
  if(!finite(now) || now<worker.heartbeat) return true;
  if(now-worker.heartbeat>LIMIT.stale) return true;
  return !!worker.navigation && (now<worker.navigation.at || now-worker.navigation.at>LIMIT.navigation);
}
function loadOpenSellerTargets(state,now) {
  if(state.worker) {
    if(workerIsStale(state.worker,now)) state.worker=null;
    else throw new Error('Stop the active Bazaar worker before loading discovered sellers.');
  }
  const before=new Set(state.targets);
  const discovered=state.sellerLeads.filter(x=>x.isOpen).map(x=>x.sellerId);
  state.targets=[...new Set([...discovered,...state.targets])].slice(0,LIMIT.targets);
  return discovered.filter(id=>!before.has(id)).length;
}

const sellerScanPhases=new Set(['launching','scanning','complete','error']);
function sellerScanIsActive(scan) { return !!scan && (scan.phase==='launching'||scan.phase==='scanning'); }
function sellerScanIsStale(scan,now) {
  if(!sellerScanIsActive(scan)) return false;
  return !finite(now) || now<scan.heartbeat || now-scan.heartbeat>LIMIT.scanStale;
}
function validSellerScan(scan) {
  if(scan===null) return true;
  if(!scan || !validScanId(scan.id) || !textField(scan.ownerTabId,80) || !textField(scan.scannerTabId,80) ||
     !sellerScanPhases.has(scan.phase) || !Array.isArray(scan.sellerIds) || !scan.sellerIds.length ||
     scan.sellerIds.length>LIMIT.sellers || scan.sellerIds.some(id=>!validId(id)) ||
     !Number.isInteger(scan.index) || scan.index<0 || scan.index>=scan.sellerIds.length ||
     !Number.isInteger(scan.scanned) || scan.scanned<0 || scan.scanned>scan.sellerIds.length ||
     !Number.isInteger(scan.found) || scan.found<0 || !Number.isInteger(scan.observed) || scan.observed<0 || !Number.isInteger(scan.unverified) || scan.unverified<0 || !Number.isInteger(scan.unavailable) || scan.unavailable<0 || scan.found+scan.unverified+scan.unavailable>scan.observed || !finite(scan.startedAt) || !finite(scan.heartbeat) ||
     !finite(scan.completedAt) || !textField(scan.error,240) || !Array.isArray(scan.errors) ||
     scan.errors.length>scan.sellerIds.length || scan.errors.some(e=>!e || !validId(e.sellerId) || !textField(e.error,240) || !finite(e.at)) ||
     !Array.isArray(scan.apiCandidates) || scan.apiCandidates.length!==scan.sellerIds.length || scan.apiCandidates.some(c=>!validApiCandidate(c)) || apiCandidateItemCount(scan.apiCandidates)>LIMIT.apiCandidateItems) return false;
  if(scan.phase==='complete') return scan.targetId===null && scan.scanned===scan.sellerIds.length;
  if(scan.phase==='error') return scan.targetId===null;
  return validId(scan.targetId) && scan.targetId===scan.sellerIds[scan.index];
}
function validApiCandidateItem(item) {
  return !!item && validId(String(item.itemId)) && textField(item.listingId||'',80) && textField(item.name) && item.name.length>0 &&
    Number.isSafeInteger(item.quantity) && item.quantity>0 && item.price===1 && Number.isSafeInteger(item.marketPrice) && item.marketPrice>=0;
}
function validApiCandidate(candidate) {
  return !!candidate && validId(candidate.sellerId) && textField(candidate.sellerName) && candidate.sellerName.length>0 &&
    candidate.isOpen===true && finite(candidate.sourceTimestamp) && finite(candidate.fetchedAt) &&
    Array.isArray(candidate.items) && candidate.items.length>0 && candidate.items.length<=LIMIT.apiCandidateItems && candidate.items.every(validApiCandidateItem);
}
function apiCandidateItemCount(candidates) {
  return Array.isArray(candidates)?candidates.reduce((sum,candidate)=>sum+(Array.isArray(candidate?.items)?candidate.items.length:0),0):Infinity;
}
function beginSellerScan(state,ownerTabId,scanId,now,apiCandidates) {
  if(!textField(ownerTabId,80) || !validScanId(scanId) || !finite(now)) throw new Error('Seller scan identity is invalid.');
  if(sellerScanIsActive(state.sellerScan) && !sellerScanIsStale(state.sellerScan,now)) throw new Error('A dollar Bazaar scan is already running.');
  if(!Array.isArray(apiCandidates)||!apiCandidates.length||apiCandidates.some(c=>!validApiCandidate(c))||apiCandidateItemCount(apiCandidates)>LIMIT.apiCandidateItems) throw new Error('API-confirmed dollar Bazaar candidates are invalid or exceed the bounded verification queue.');
  const normalized=structuredClone(apiCandidates);
  const sellerIds=normalized.map(x=>x.sellerId);
  if(new Set(sellerIds).size!==sellerIds.length) throw new Error('Duplicate API Bazaar candidates are invalid.');
  state.events=[];state.seen=[];state.lastDetection=0;
  state.sellerScan={id:scanId,ownerTabId,scannerTabId:'',phase:'launching',sellerIds,index:0,targetId:sellerIds[0],apiCandidates:normalized,
    scanned:0,found:0,observed:0,unverified:0,unavailable:0,startedAt:now,heartbeat:now,completedAt:0,error:'',errors:[]};
  return bazaarScanUrl(sellerIds[0],scanId);
}
function claimSellerScan(state,tabId,scanId,url,now) {
  const scan=state.sellerScan;
  if(!scan || scan.id!==scanId || !sellerScanIsActive(scan)) return false;
  if(scanTokenAt(url)!==scanId || targetAt(url)!==scan.targetId) return false;
  if(scan.scannerTabId && scan.scannerTabId!==tabId && !sellerScanIsStale(scan,now)) throw new Error('Another live scanner tab owns this dollar scan.');
  scan.scannerTabId=tabId;scan.phase='scanning';scan.heartbeat=now;scan.error='';
  return true;
}
function matchApiItem(candidate,item) {
  if(!candidate) return null;
  return candidate.items.find(api=>String(api.itemId)===String(item.itemId))||null;
}
function appendObservedEvents(state,snapshot,workerId,documentId,now,apiCandidate=null) {
  const newEvents=[];
  for(const item of snapshot.items) {
    if(item.price!==1 || item.liveState!=='available' || item.available!==true || !Number.isSafeInteger(item.quantity) || item.quantity<1) continue;
    const apiItem=apiCandidate?matchApiItem(apiCandidate,item):null;
    if(apiCandidate&&!apiItem) continue;
    const fp=fingerprint(snapshot.targetId,item);
    if(state.seen.includes(fp)) continue;
    if(state.seen.length>=LIMIT.seen || state.events.length>=LIMIT.events) throw new Error('Dollar-sale result ledger reached its safety bound. This Bazaar was skipped instead of truncating results.');
    const event={schema:SCHEMA,id:workerId+':'+now+':'+state.seen.length,fingerprint:fp,targetId:snapshot.targetId,
      seller:snapshot.seller,item:{name:item.name,itemId:item.itemId||'',listingId:item.listingId||apiItem?.listingId||'',quantity:item.quantity},price:1,
      url:bazaarUrl(snapshot.targetId),detectedAt:snapshot.at,expiresAt:snapshot.at+LIMIT.fresh,workerId,documentId,
      sourceTimestamp:apiCandidate?.sourceTimestamp||0,fetchedAt:apiCandidate?.fetchedAt||snapshot.at,
      validity:'live-verified',verification:apiCandidate?'official-user-bazaar+unlocked-card':'unlocked-card',acknowledged:false};
    if(!validEvent(event)) throw new Error('Listing contract failed validation.');
    state.seen.push(fp);state.events.unshift(event);newEvents.push(event);state.lastDetection=snapshot.at;
  }
  return newEvents;
}
function advanceSellerScan(scan,now) {
  scan.scanned++;scan.heartbeat=now;
  if(scan.scanned>=scan.sellerIds.length) {
    scan.phase='complete';scan.targetId=null;scan.completedAt=now;scan.error='';
    return {done:true,url:null};
  }
  scan.index++;scan.targetId=scan.sellerIds[scan.index];scan.phase='scanning';scan.error='';
  return {done:false,url:bazaarScanUrl(scan.targetId,scan.id)};
}
function recordSellerScanSnapshot(state,tabId,scanId,snapshot,now) {
  const scan=state.sellerScan;
  if(!scan || scan.id!==scanId || scan.phase!=='scanning' || scan.scannerTabId!==tabId) throw new Error('Seller scan ownership changed.');
  if(snapshot.targetId!==scan.targetId || now<snapshot.at || now-snapshot.at>15000) throw new Error('Seller scan snapshot is stale or for the wrong Bazaar.');
  if(!snapshot.ok) throw new Error(snapshot.error||'Bazaar inspection failed.');
  const dollarItems=snapshot.items.filter(item=>item.price===1&&Number.isSafeInteger(item.quantity)&&item.quantity>0);
  scan.observed+=dollarItems.length;
  scan.unverified+=dollarItems.filter(item=>item.liveState==='unverified').length;
  scan.unavailable+=dollarItems.filter(item=>item.liveState==='unavailable').length;
  const apiCandidate=scan.apiCandidates.find(candidate=>candidate.sellerId===scan.targetId);
  const added=appendObservedEvents(state,snapshot,'scan:'+scan.id,snapshot.documentId,now,apiCandidate);
  scan.found+=added.length;
  return {...advanceSellerScan(scan,now),added:added.length};
}
function skipSellerScanTarget(state,tabId,scanId,error,now) {
  const scan=state.sellerScan;
  if(!scan || scan.id!==scanId || scan.phase!=='scanning' || scan.scannerTabId!==tabId) throw new Error('Seller scan ownership changed.');
  scan.errors.push({sellerId:scan.targetId,error:String(error||'Bazaar inspection failed.').slice(0,240),at:now});
  scan.error=scan.errors.at(-1).error;
  return advanceSellerScan(scan,now);
}
function failSellerScan(state,scanId,error,now) {
  const scan=state.sellerScan;
  if(!scan || scan.id!==scanId) return false;
  scan.phase='error';scan.targetId=null;scan.heartbeat=now;scan.completedAt=now;
  scan.error=String(error||'Dollar Bazaar scan failed.').slice(0,240);
  return true;
}
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
const EVENT_TTLS=new Set([120000,LIMIT.fresh]);
const validEventTtl=e=>finite(e?.detectedAt)&&finite(e?.expiresAt)&&EVENT_TTLS.has(e.expiresAt-e.detectedAt);
function validEvent(e) {
  return !!e && e.schema === SCHEMA && validId(e.targetId) && textField(e.id,400) && textField(e.fingerprint,400) &&
    textField(e.seller) && textField(e.item?.name) && e.item.name.length > 0 && textField(e.item.itemId,80) && textField(e.item.listingId,80) && Number.isSafeInteger(e.item.quantity) && e.item.quantity>0 &&
    e.price === 1 && e.url === bazaarUrl(e.targetId) && validEventTtl(e) && finite(e.sourceTimestamp) && finite(e.fetchedAt) &&
    textField(e.workerId,80) && textField(e.documentId,80) && e.validity === 'live-verified' &&
    (e.verification === 'official-user-bazaar+unlocked-card' || e.verification === 'unlocked-card') && typeof e.acknowledged === 'boolean';
}
function readState(raw) {
  if (raw == null) return emptyState();
  if (raw.schema !== SCHEMA) throw new Error('Storage schema is unsupported. Update all Broker tabs; existing data was preserved.');
  const copy=structuredClone(raw);
  if(copy.bazaarVerification!==3) {
    copy.bazaarVerification=3;
    copy.events=[];
    copy.seen=[];
    copy.sellerScan=null;
    copy.lastDetection=0;
  }
  if(copy.sellerScan===undefined) copy.sellerScan=null;
  if(Array.isArray(copy.events)) for(const event of copy.events) if(event?.item && event.item.quantity===undefined) event.item.quantity=1;
  if(copy.sellerLeads===undefined) copy.sellerLeads=[];
  if(copy.marketLeads===undefined) copy.marketLeads=[];
  if(copy.discoveryCursor===undefined) copy.discoveryCursor=0;
  if(copy.lastSellerDiscovery===undefined) copy.lastSellerDiscovery=0;
  if(copy.lastDiscovery===undefined) copy.lastDiscovery=0;
  const w = copy.worker;
  if (copy.bazaarVerification!==3 || !Number.isSafeInteger(copy.revision) || copy.revision < 0 || !Array.isArray(copy.targets) || copy.targets.length > LIMIT.targets || copy.targets.some(x=>!validId(x)) ||
      !Array.isArray(copy.events) || copy.events.length > LIMIT.events || copy.events.some(e=>!validEvent(e)) ||
      !Array.isArray(copy.seen) || copy.seen.length > LIMIT.seen || copy.seen.some(x=>!textField(x,400)) ||
      !Array.isArray(copy.sellerLeads) || copy.sellerLeads.length>LIMIT.sellers || copy.sellerLeads.some(x=>!validSellerLead(x)) ||
      !Array.isArray(copy.marketLeads) || copy.marketLeads.length>LIMIT.leads || copy.marketLeads.some(x=>!validMarketLead(x)) ||
      !Number.isSafeInteger(copy.discoveryCursor) || copy.discoveryCursor<0 || !finite(copy.lastSellerDiscovery) || !finite(copy.lastDiscovery) || !finite(copy.lastDetection) ||
      !validSellerScan(copy.sellerScan) ||
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
  if (s.worker && s.worker.tabId !== identity.tabId) {
    if(workerIsStale(s.worker,now)) s.worker=null;
    else throw new Error('Another live tab owns the worker. Use that tab, or Stop before starting here.');
  }
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
    if (item.price !== 1 || item.liveState!=='available' || item.available !== true) continue;
    const fp=fingerprint(snapshot.targetId,item);
    if (s.seen.includes(fp)) continue;
    if (s.seen.length >= LIMIT.seen) { w.phase='error'; w.error='Duplicate ledger is full. No new alerts will be recorded; see diagnostics.'; break; }
    const event={schema:SCHEMA, id:`${identity.workerId}:${now}:${s.seen.length}`, fingerprint:fp, targetId:snapshot.targetId,
      seller:snapshot.seller, item:{name:item.name,itemId:item.itemId||'',listingId:item.listingId||'',quantity:item.quantity||1}, price:1,
      url:bazaarUrl(snapshot.targetId), detectedAt:snapshot.at, expiresAt:snapshot.at+LIMIT.fresh, workerId:identity.workerId,
      documentId:identity.documentId, sourceTimestamp:0, fetchedAt:snapshot.at, validity:'live-verified', verification:'unlocked-card', acknowledged:false};
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
  if (workerIsStale(w,now)) return {kind:'warning',label:'Stale worker — reclaim available'};
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

function parseNativeBuyLabel(label) {
  const text=cleanText(label);
  let match=/^Buy item (.+), \$([0-9][0-9,]*), ([1-9][0-9,]*) in total\.?$/i.exec(text);
  if(match) {
    const price=Number(match[2].replaceAll(',',''));
    const amount=Number(match[3].replaceAll(',',''));
    if(Number.isSafeInteger(price)&&price>=1&&Number.isSafeInteger(amount)&&amount>=1) {
      return {kind:'detailed',name:match[1].trim().slice(0,180),price,amount};
    }
  }
  match=/^Buy(?: item)?\s*[:\-]?\s*(.+)$/i.exec(text);
  if(match && match[1].trim()) return {kind:'named',name:match[1].trim().slice(0,180),price:null,amount:null};
  if(/^Buy$/i.test(text)) return {kind:'generic',name:'',price:null,amount:null};
  return null;
}

function enabledControl(control) {
  if(!control) return false;
  if(control.disabled===true || control.hasAttribute?.('disabled') || control.getAttribute?.('aria-disabled')==='true') return false;
  try { if(control.matches?.(':disabled')) return false; } catch {}
  return true;
}

function sameItemName(a,b) {
  const normalize=v=>cleanText(v).toLocaleLowerCase();
  return !!normalize(a) && normalize(a)===normalize(b);
}

function controlItemId(control) {
  const value=cleanText(control?.getAttribute?.('aria-controls'));
  if(!value) return '';
  const match=value.match(/(?:^|-)wai-itemInfo-(?:[^-]+-)?(\d+)(?:-|$)/i) || value.match(/(\d+)(?!.*\d)/);
  return match?match[1]:'';
}
function anonymousGraphic(graphic) {
  const name=cleanText(
    graphic?.getAttribute?.('aria-label') ||
    graphic?.getAttribute?.('alt') ||
    graphic?.getAttribute?.('title') ||
    graphic?.querySelector?.('title')?.textContent
  );
  return !name;
}

function hasDollarLockOverlay(control,win,itemImage) {
  if(!control) return false;
  const graphics=[...control.querySelectorAll('img,svg,[role="img"]')];
  return graphics.some(graphic=>{
    if(graphic===itemImage || !displayed(graphic,win)) return false;
    if(graphic.matches?.('img[src*="/images/items/"]')) return false;
    return anonymousGraphic(graphic);
  });
}

function scanListingState(card,win,item) {
  const image=[...card.querySelectorAll('img[src*="/images/items/"]')].find(img=>{
    const match=String(img.currentSrc||img.src||'').match(/\/images\/items\/(\d+)\//);
    return match&&match[1]===String(item.itemId);
  });
  const controls=[];
  const imageControl=image?.closest('button,[role="button"]');
  if(imageControl) controls.push(imageControl);
  for(const control of card.querySelectorAll('button[aria-controls^="wai-itemInfo-"],[role="button"][aria-controls^="wai-itemInfo-"]')) {
    if(!controls.includes(control)) controls.push(control);
  }
  const visibleControls=controls.filter(control=>displayed(control,win));
  if(!visibleControls.length) return {liveState:'unverified',liveReason:'No native Torn item control was recognized.'};
  const matches=visibleControls.filter(control=>{
    const label=cleanText(control.getAttribute('aria-label')||control.getAttribute('title')||control.textContent);
    const controlledId=controlItemId(control);
    return (controlledId&&controlledId===String(item.itemId)) || sameItemName(label,item.name) || (!!image&&control.contains(image));
  });
  if(!matches.length) return {liveState:'unverified',liveReason:'Native item control did not match this listing.'};
  const enabled=matches.filter(control=>enabledControl(control));
  if(!enabled.length) return {liveState:'unavailable',liveReason:'Matching native Torn item control is disabled.'};
  const unlocked=enabled.find(control=>!hasDollarLockOverlay(control,win,image&&control.contains(image)?image:null));
  if(unlocked) return {liveState:'available',liveReason:'Native Torn dollar-sale card is unlocked for this player.'};
  return {liveState:'unavailable',liveReason:'Native Torn dollar-sale lock overlay is present for this player.'};
}

function displayed(element, win) {
  if (!element?.isConnected) return false;
  for (let e=element;e && e.nodeType===1;e=e.parentElement) {
    const style=win.getComputedStyle(e);
    if (e.hidden || e.getAttribute('aria-hidden')==='true' || style.display==='none' || style.visibility==='hidden' || Number(style.opacity)===0) return false;
  }
  return true;
}

function visible(element, win, viewportOnly=false) {
  if (!displayed(element,win)) return false;
  const r=element.getBoundingClientRect();
  if(!(r.width>0 && r.height>0)) return false;
  if(!viewportOnly) return true;
  if(r.top<0 || r.left<0 || r.bottom>win.innerHeight || r.right>win.innerWidth) return false;
  const points=[[r.left+r.width/2,r.top+r.height/2],[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]];
  return points.every(([x,y])=>{const top=element.ownerDocument.elementFromPoint(x,y);return top && (top===element || element.contains(top) || top.contains(element));});
}

function textNodes(scope, win, predicate, viewportOnly=true) {
  const out=[];
  const walker=scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    const value=cleanText(node.textContent);
    const parent=node.parentElement;
    if(!value || !parent || !visible(parent,win,viewportOnly)) continue;
    if(predicate(value,node,parent)) out.push({value,node,parent});
  }
  return out;
}

function currencyNodes(scope, win, viewportOnly=true) {
  return textNodes(scope,win,value=>exactPrice(value)!==null,viewportOnly);
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

function semanticCards(root, win, viewportOnly=true) {
  const found=[];
  const used=new Set();
  const images=[...root.querySelectorAll('img[src*="/images/items/"]')].filter(img=>visible(img,win,false));
  for(const img of images) {
    let node=img.parentElement;
    for(let depth=0;node && node!==root && depth<10;depth++,node=node.parentElement) {
      if(!(node instanceof HTMLElement) || !visible(node,win,viewportOnly)) continue;
      const identity=itemIdentity(node,win);
      if(!identity) continue;
      const prices=currencyNodes(node,win,viewportOnly);
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

function parseLegacyCard(card, win, viewportOnly=true) {
  const names=card.querySelectorAll(SELECTOR.legacyName), prices=card.querySelectorAll(SELECTOR.legacyPrice);
  if(names.length!==1 || prices.length!==1 || !visible(names[0],win,viewportOnly) || !visible(prices[0],win,viewportOnly)) return null;
  const name=cleanText(names[0].textContent);
  const priceText=[...prices[0].childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const price=exactPrice(priceText);
  const amountNode=card.querySelector(SELECTOR.legacyQuantity);
  if(!name || name.length>180 || price===null || !visible(amountNode,win,viewportOnly)) return null;
  const amount=cleanText(amountNode.textContent);
  const match=/^(?:x\s*)?([1-9]\d{0,8})(?:\s*(?:available|in stock|in total))?$/i.exec(amount);
  if(!match) return null;
  const item={
    name,itemId:card.getAttribute('data-item-id')||'',listingId:card.getAttribute('data-listing-id')||'',
    price,quantity:Number(match[1])
  };
  const live=scanListingState(card,win,item);
  return {...item,...live,available:live.liveState==='available'};
}

function parseSemanticCard(card, win, viewportOnly=true) {
  const identity=itemIdentity(card,win);
  const prices=currencyNodes(card,win,viewportOnly);
  const quantity=stockQuantity(card,win);
  if(!identity || prices.length!==1 || quantity===null) return null;
  const price=exactPrice(prices[0].value);
  if(price===null || !Number.isSafeInteger(quantity) || quantity<1) return null;
  const listingId=card.getAttribute('data-listing-id')||'';
  if(listingId.length>80) return null;
  const item={name:identity.name,itemId:identity.itemId,listingId,price,quantity};
  const live=scanListingState(card,win,item);
  return {...item,...live,available:live.liveState==='available'};
}


function scanTextNodes(scope, win, predicate) {
  const out=[];
  const walker=scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    const value=cleanText(node.textContent);
    const parent=node.parentElement;
    if(!value || !parent || !displayed(parent,win)) continue;
    if(predicate(value,node,parent)) out.push({value,node,parent});
  }
  return out;
}

const scanCurrencyNodes=(scope,win)=>scanTextNodes(scope,win,value=>exactPrice(value)!==null);

function scanDocumentText(scope, win) {
  const parts=[];
  const walker=scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())) {
    const parent=node.parentElement;
    const value=cleanText(node.textContent);
    if(value && parent && displayed(parent,win)) parts.push(value);
  }
  return cleanText(parts.join(' '));
}

function scanStockQuantity(scope, win) {
  const text=scanDocumentText(scope,win);
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

function scanItemIdentity(scope, win) {
  const images=[...scope.querySelectorAll('img[src*="/images/items/"]')].filter(img=>displayed(img,win));
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

function scanSemanticCards(root, win) {
  const found=[],used=new Set();
  const images=[...root.querySelectorAll('img[src*="/images/items/"]')].filter(img=>displayed(img,win));
  for(const img of images) {
    let node=img.parentElement;
    for(let depth=0;node && node!==root && depth<10;depth++,node=node.parentElement) {
      if(!(node instanceof HTMLElement) || !displayed(node,win)) continue;
      const identity=scanItemIdentity(node,win);
      if(!identity) continue;
      const prices=scanCurrencyNodes(node,win);
      const quantity=scanStockQuantity(node,win);
      if(prices.length===0 && quantity===null) continue;
      if(!used.has(node)){used.add(node);found.push(node);}
      break;
    }
  }
  return found;
}

function parseScanLegacyCard(card, win) {
  const names=card.querySelectorAll(SELECTOR.legacyName),prices=card.querySelectorAll(SELECTOR.legacyPrice);
  if(names.length!==1 || prices.length!==1 || !displayed(names[0],win) || !displayed(prices[0],win)) return null;
  const name=cleanText(names[0].textContent);
  const priceText=[...prices[0].childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const price=exactPrice(priceText);
  const amountNode=card.querySelector(SELECTOR.legacyQuantity);
  if(!name || name.length>180 || price===null || !displayed(amountNode,win)) return null;
  const amount=cleanText(amountNode.textContent);
  const match=/^(?:x\s*)?([1-9]\d{0,8})(?:\s*(?:available|in stock|in total))?$/i.exec(amount);
  if(!match) return null;
  const item={name,itemId:card.getAttribute('data-item-id')||'',listingId:card.getAttribute('data-listing-id')||'',price,quantity:Number(match[1])};
  const live=scanListingState(card,win,item);
  return {...item,...live,available:live.liveState==='available'};
}

function explicitBazaarClosed(doc,win) {
  return [...doc.querySelectorAll('[role="alert"]')]
    .filter(notice=>displayed(notice,win))
    .some(notice=>/\bbazaar\b.{0,240}\bis currently closed\b/i.test(cleanText(notice.textContent)));
}

function parseScanSemanticCard(card, win) {
  const identity=scanItemIdentity(card,win);
  const prices=scanCurrencyNodes(card,win);
  const quantity=scanStockQuantity(card,win);
  if(!identity || prices.length!==1 || quantity===null) return null;
  const price=exactPrice(prices[0].value);
  if(price===null || !Number.isSafeInteger(quantity) || quantity<1) return null;
  const listingId=card.getAttribute('data-listing-id')||'';
  if(listingId.length>80) return null;
  const item={name:identity.name,itemId:identity.itemId,listingId,price,quantity};
  const live=scanListingState(card,win,item);
  return {...item,...live,available:live.liveState==='available'};
}

function inspectBazaarForScan(doc, win, context) {
  const result={ok:false,items:[],seller:'',targetId:context.targetId,documentId:context.documentId,at:context.at,error:''};
  const fail=error=>({...result,error});
  if(doc.readyState==='loading') return fail('Bazaar document is still loading.');
  if(!context.targetId || targetAt(win.location.href)!==context.targetId) return fail('Scanner target does not match the loaded Bazaar.');

  const roots=doc.querySelectorAll(SELECTOR.root);
  if(roots.length!==1 || !displayed(roots[0],win)) return fail('Bazaar is unavailable, loading, or its markup is unsupported.');
  const root=roots[0];
  if(root.matches(SELECTOR.loading) || [...root.querySelectorAll(SELECTOR.loading)].some(e=>displayed(e,win))) return fail('Bazaar is still rendering.');

  const parseOwner=e=>{try{return {id:new URL(e.href,win.location.href).searchParams.get('XID'),name:cleanText(e.textContent)};}catch{return null;}};
  let owners=[...root.querySelectorAll('a[href*="profiles.php?XID="]')]
    .filter(e=>!e.closest('[data-testid="item"], [class*="description"], [data-testid="description"]') && displayed(e,win))
    .map(parseOwner).filter(Boolean);
  if(owners.length) {
    if(owners.some(o=>o.id!==context.targetId)) return fail('Bazaar owner proof is ambiguous.');
  } else {
    owners=[...doc.querySelectorAll('a[href*="profiles.php?XID="]')]
      .filter(e=>displayed(e,win)).map(parseOwner)
      .filter(o=>o && o.id===context.targetId && /['’]s$/i.test(o.name));
  }
  if(!owners.length || owners.some(o=>o.id!==context.targetId)) return fail('Cannot prove the displayed Bazaar owner.');
  result.seller=(owners[0].name||context.targetId).replace(/['’]s$/,'').slice(0,180);
  if(explicitBazaarClosed(doc,win)) return {...result,ok:true,inspected:0,closed:true};

  const semantic=scanSemanticCards(root,win);
  const legacy=semantic.length?[]:[...root.querySelectorAll(SELECTOR.legacyCard)].filter(card=>displayed(card,win));
  const cards=semantic.length?semantic:legacy;
  if(!cards.length) {
    const body=cleanText(root.textContent);
    if(/does not have a bazaar|no items/i.test(body)) return {...result,ok:true,inspected:0};
    return fail('No complete Bazaar listing cards were recognized.');
  }

  let inspected=0,unsupported=0;
  for(const card of cards) {
    const item=semantic.length?parseScanSemanticCard(card,win):parseScanLegacyCard(card,win);
    if(!item){unsupported++;continue;}
    inspected++;
    if(item.price===1 && item.quantity>0) result.items.push(item);
  }
  if(unsupported) return fail('A Bazaar listing has unsupported markup; this seller was skipped rather than partially recorded.');
  if(!inspected) return fail('No complete Bazaar listing cards were recognized.');
  return {...result,ok:true,inspected};
}

function inspectBazaar(doc, win, context) {
  const result={ok:false,items:[],seller:'',targetId:context.targetId,documentId:context.documentId,at:context.at,error:''};
  const fail=error=>({...result,error});
  const background=context.background===true;
  const viewportOnly=!background;
  if (!background && (!context.trusted || doc.visibilityState!=='visible' || !doc.hasFocus())) return fail('Inspect from a deliberate click in the focused Bazaar tab.');
  if (doc.readyState!=='complete') return fail('Page is still loading. Inspect again after it finishes.');
  if (!context.targetId || targetAt(win.location.href)!==context.targetId || win.location.href!==context.initialUrl || targetAt(context.initialUrl)!==context.targetId) return fail('Target or document changed. Open the next target in this worker.');

  const roots=doc.querySelectorAll(SELECTOR.root);
  if (roots.length!==1 || !visible(roots[0],win,false)) return fail('Bazaar is unavailable, loading, or its markup is unsupported.');
  const root=roots[0];
  if (root.matches(SELECTOR.loading) || [...root.querySelectorAll(SELECTOR.loading)].some(e=>visible(e,win))) return fail('Bazaar is still rendering. Inspect again when ready.');

  const parseOwner=e=>{try{return {id:new URL(e.href,win.location.href).searchParams.get('XID'),name:cleanText(e.textContent)};}catch{return null;}};
  let owners=[...root.querySelectorAll('a[href*="profiles.php?XID="]')]
    .filter(e=>!e.closest('[data-testid="item"], [class*="description"], [data-testid="description"]') && visible(e,win,viewportOnly))
    .map(parseOwner).filter(Boolean);

  if(owners.length) {
    if(owners.some(o=>o.id!==context.targetId)) return fail('Bazaar owner proof is ambiguous. No alert issued.');
  } else {
    // Current Torn can render the seller heading just outside #bazaarRoot. In that case
    // accept only a visible profile link for the exact URL target whose label has the
    // possessive Bazaar-owner form ("Name's"). This excludes the viewer's sidebar link.
    owners=[...doc.querySelectorAll('a[href*="profiles.php?XID="]')]
      .filter(e=>visible(e,win,viewportOnly))
      .map(parseOwner)
      .filter(o=>o && o.id===context.targetId && /['’]s$/i.test(o.name));
  }

  if (!owners.length || owners.some(o=>o.id!==context.targetId)) return fail('Cannot prove the displayed Bazaar owner. No alert issued.');
  result.seller=(owners[0].name || context.targetId).replace(/['’]s$/,'').slice(0,180);
  if(explicitBazaarClosed(doc,win)) return {...result,ok:true,inspected:0,closed:true};

  const semantic=semanticCards(root,win,viewportOnly);
  const legacy=semantic.length
    ? []
    : [...root.querySelectorAll(SELECTOR.legacyCard)].filter(card=>visible(card,win,viewportOnly));
  const cards=semantic.length?semantic:legacy;
  if(!cards.length) {
    const body=cleanText(root.textContent);
    if(/does not have a bazaar|no items/i.test(body)) return {...result,ok:true,inspected:0};
    return fail('No complete Bazaar listing cards were recognized. Torn markup may have changed.');
  }

  let inspected=0,unsupported=0;
  for(const card of cards) {
    if(!visible(card,win,viewportOnly)) continue;
    const item=semantic.length?parseSemanticCard(card,win,viewportOnly):parseLegacyCard(card,win,viewportOnly);
    if(!item) {unsupported++;continue;}
    inspected++;
    if(item.price===1 && item.liveState==='available' && item.available===true) result.items.push(item);
  }

  if(unsupported) return fail('A Bazaar listing has unsupported markup. Inspection discarded; no partial alerts were issued.');
  if(!inspected) return fail('No complete Bazaar listing cards are available to inspect.');
  return {...result,ok:true,inspected};
}


// ---- market ----

const API_KEY_KEY='mm-dollar-broker:api-key:v1';
const PREF_KEY='mm-dollar-broker:discovery-prefs:v1';
const DISCOVERY=Object.freeze({batch:50,gap:1250,minValue:1,maxBatch:50,directoryGap:0,sellerGap:1250});
const BAZAAR_CATEGORIES=Object.freeze([
  'Alcohol','Artifact','Booster','Candy','Car','Clothing','Collectible','Defensive','Drug','Energy Drink','Enhancer','Flower',
  'Jewelry','Material','Medical','Melee','Other','Plushie','Primary','Secondary','Special','Supply Pack','Temporary','Tool'
]);
const WEEKLY_BAZAAR_FIELDS=Object.freeze(['busiest','most_popular','trending','top_grossing','bulk','advanced_item','bargain','dollar_sale']);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const integer=(value,min=0)=>Number.isSafeInteger(Number(value))&&Number(value)>=min?Number(value):null;

function requestJson(gm,url,key) {
  const request=gm?.xmlHttpRequest;
  if(typeof request!=='function') throw new Error('Tampermonkey API transport is unavailable.');
  const cleanKey=String(key||'').trim();
  if(!cleanKey || /\s/.test(cleanKey) || cleanKey.length<8 || cleanKey.length>128) throw new Error('Enter a valid Torn API key.');
  return new Promise((resolve,reject)=>{
    request({
      method:'GET',
      url,
      headers:{Accept:'application/json',Authorization:'ApiKey '+cleanKey},
      timeout:15000,
      onload:response=>{
        if(response.status<200||response.status>=300) return reject(new Error('Torn API returned HTTP '+response.status+'.'));
        let data;
        try {data=JSON.parse(response.responseText);} catch {return reject(new Error('Torn API returned invalid JSON.'));}
        if(data?.error) {
          const apiError=new Error(data.error.error||data.error.message||'Torn API returned an error.');
          apiError.name='TornApiError';
          apiError.tornCode=integer(data.error.code,0);
          return reject(apiError);
        }
        resolve(data);
      },
      ontimeout:()=>reject(new Error('Torn API request timed out.')),
      onerror:()=>reject(new Error('Torn API request failed.'))
    });
  });
}
function apiRequest(gm,path,key) {
  if(!/^(?:torn\/items|market\/bazaar|market\/[1-9]\d{0,8}\/itemmarket)(?:\?.*)?$/.test(path)) throw new Error('Blocked non-market API route.');
  return requestJson(gm,'https://api.torn.com/v2/'+path,key);
}
function userBazaarRequest(gm,sellerId,key) {
  const id=String(sellerId||'');
  if(!/^[1-9]\d{0,9}$/.test(id)) throw new Error('Invalid Bazaar seller ID.');
  return requestJson(gm,'https://api.torn.com/user/'+id+'?selections=bazaar',key);
}

function normalizeBazaarRows(rows,{dollar=false}={}) {
  if(!Array.isArray(rows)) return [];
  return rows.map(row=>{
    const sellerId=integer(row?.id,1);
    const name=typeof row?.name==='string'?row.name.trim():'';
    const dollarSales=dollar?integer(row?.dollar_sales,0):null;
    if(!sellerId||!name||typeof row?.is_open!=='boolean'||(dollar&&dollarSales===null)) return null;
    return {sellerId:String(sellerId),name:name.slice(0,180),isOpen:row.is_open,dollarSales};
  }).filter(Boolean);
}

function mergeSellers(target,rows) {
  for(const seller of rows) {
    const old=target.get(seller.sellerId);
    if(!old) { target.set(seller.sellerId,{...seller}); continue; }
    old.isOpen=old.isOpen||seller.isOpen;
    if(old.dollarSales===null && seller.dollarSales!==null) old.dollarSales=seller.dollarSales;
    else if(old.dollarSales!==null && seller.dollarSales!==null) old.dollarSales=Math.max(old.dollarSales,seller.dollarSales);
  }
  return target;
}

function sortDirectorySellers(rows) {
  return rows.sort((a,b)=>Number(b.isOpen)-Number(a.isOpen)||
    Number(b.dollarSales!==null)-Number(a.dollarSales!==null)||
    (b.dollarSales??-1)-(a.dollarSales??-1)||
    Number(a.sellerId)-Number(b.sellerId));
}

function normalizeDollarSellers(data) {
  const rows=data?.bazaar?.dollar_sale;
  if(!Array.isArray(rows)) throw new Error('Torn Bazaar dollar-sale directory response is unsupported.');
  return sortDirectorySellers(normalizeBazaarRows(rows,{dollar:true}));
}

function normalizeWeeklyDirectorySellers(data) {
  const bazaar=data?.bazaar;
  if(!bazaar || typeof bazaar!=='object') throw new Error('Torn Bazaar directory response is unsupported.');
  const merged=new Map();
  let recognized=0;
  for(const field of WEEKLY_BAZAAR_FIELDS) {
    if(!Array.isArray(bazaar[field])) continue;
    recognized++;
    mergeSellers(merged,normalizeBazaarRows(bazaar[field],{dollar:field==='dollar_sale'}));
  }
  if(!recognized) throw new Error('Torn Bazaar weekly directory response is unsupported.');
  return sortDirectorySellers([...merged.values()]);
}

function normalizeSpecializedDirectorySellers(data) {
  const rows=data?.bazaar?.specialized;
  if(!Array.isArray(rows)) throw new Error('Torn specialized Bazaar directory response is unsupported.');
  return sortDirectorySellers(normalizeBazaarRows(rows));
}

async function discoverDollarSellers({gm,key,onProgress=()=>{}}) {
  const merged=new Map();
  const weekly=normalizeWeeklyDirectorySellers(await apiRequest(gm,'market/bazaar',key));
  mergeSellers(merged,weekly);
  onProgress({phase:'directory',current:0,total:BAZAAR_CATEGORIES.length,sellers:merged.size,category:'Weekly'});
  for(let i=0;i<BAZAAR_CATEGORIES.length;i++) {
    const category=BAZAAR_CATEGORIES[i];
    if(DISCOVERY.directoryGap>0 && (i||weekly.length)) await sleep(DISCOVERY.directoryGap);
    const data=await apiRequest(gm,`market/bazaar?cat=${encodeURIComponent(category)}`,key);
    mergeSellers(merged,normalizeSpecializedDirectorySellers(data));
    onProgress({phase:'directory',current:i+1,total:BAZAAR_CATEGORIES.length,sellers:merged.size,category});
  }
  const sellers=sortDirectorySellers([...merged.values()]);
  return {sellers,open:sellers.filter(x=>x.isOpen).length,total:sellers.length,requests:1+BAZAAR_CATEGORIES.length};
}

function normalizeUserBazaar(data,seller,now=Date.now()) {
  const sellerId=String(seller?.sellerId||'');
  const sellerName=typeof seller?.name==='string'?seller.name.trim().slice(0,180):'';
  if(!/^[1-9]\d{0,9}$/.test(sellerId)||!sellerName) throw new Error('Bazaar seller identity is invalid.');
  const timestamp=integer(data?.bazaar_timestamp,0);
  if(timestamp===null||typeof data?.bazaar_is_open!=='boolean'||!Array.isArray(data?.bazaar)) throw new Error('Torn user Bazaar response is unsupported.');
  const items=[];
  for(const row of data.bazaar) {
    const itemId=integer(row?.ID,1),quantity=integer(row?.quantity,1),price=integer(row?.price,1);
    const name=typeof row?.name==='string'?row.name.trim().slice(0,180):'';
    const marketPrice=integer(row?.market_price,0);
    const uid=row?.UID===undefined||row?.UID===null?'':String(row.UID).slice(0,80);
    if(!itemId||!quantity||!price||!name) continue;
    if(price===1) {
      if(items.length>=LIMIT.apiCandidateItems) throw new Error('Torn user Bazaar returned more exact-$1 rows than the bounded verification queue allows.');
      items.push({itemId:String(itemId),listingId:uid,name,quantity,price,marketPrice:marketPrice??0});
    }
  }
  return {sellerId,sellerName,isOpen:data.bazaar_is_open,sourceTimestamp:timestamp*1000,fetchedAt:now,items};
}

async function scanDollarSellerBazaars({gm,key,sellers,onProgress=()=>{},shouldStop=()=>false}) {
  if(!Array.isArray(sellers)) throw new Error('Dollar seller list is invalid.');
  const open=sellers.filter(x=>x?.isOpen===true);
  const candidates=[],errors=[];
  let observed=0;
  for(let i=0;i<open.length;i++) {
    if(shouldStop()) throw new Error('Seller scan stopped.');
    const seller=open[i];
    onProgress({phase:'seller-api',current:i+1,total:open.length,seller,observed,candidates:candidates.length,errors:errors.length});
    try {
      const snapshot=normalizeUserBazaar(await userBazaarRequest(gm,seller.sellerId,key),seller,Date.now());
      observed+=snapshot.items.length;
      if(snapshot.isOpen&&snapshot.items.length)candidates.push(snapshot);
    } catch(error) {
      const message=String(error?.message||error).slice(0,240);
      if(error?.name!=='TornApiError' || ![6,7].includes(error.tornCode)) throw error;
      errors.push({sellerId:String(seller.sellerId),error:message,at:Date.now()});
    }
    if(i<open.length-1) await sleep(DISCOVERY.sellerGap);
  }
  onProgress({phase:'seller-api-done',current:open.length,total:open.length,observed,candidates:candidates.length,errors:errors.length});
  return {candidates,errors,scanned:open.length,observed};
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
    const details=parseNativeBuyLabel(button.getAttribute('aria-label'));
    if(!details || details.kind!=='detailed') continue;
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
    #seller-leads,#market-leads,#events{max-height:260px;overflow:auto}details{border-top:1px solid #3b443c;padding-top:8px;margin-top:10px}summary{cursor:pointer;color:#c6d0c2;font-size:12px}
    textarea{display:block;width:100%;min-height:65px;max-height:140px;background:#111713;border:1px solid #4d5b49;color:#e0e9df;padding:6px;margin:6px 0;resize:vertical}
    input[type="password"],input[type="number"]{width:100%;background:#111713;border:1px solid #4d5b49;color:#e0e9df;padding:7px;margin:5px 0;border-radius:4px}
    label{display:block;margin-top:7px;font-size:12px}pre{font:10px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#b1bfae}footer{color:#94a18f;font-size:10px;padding-top:10px}#mode{margin-top:5px}
  `;
  const panel=doc.createElement('section');
  panel.id='panel';panel.hidden=true;panel.setAttribute('aria-label','Dollar Broker');
  panel.innerHTML=`<header id="header"><div><small>MM TORN SYSTEMS</small><strong>DOLLAR BROKER</strong></div><button type="button" id="minimize" aria-label="Minimize Broker">−</button></header>
    <div class="body">
      <div class="status"><span class="dot"></span><span id="status" role="status">Ready</span></div>
      <div id="mode" class="muted">Official directory + cached user-Bazaar API prefilter · live item-control verification · manual purchase only</div>
      <p id="notice" role="status"></p>
      <div class="row"><button id="find-deals" class="primary" type="button">Find & Scan Dollar Sellers</button><button id="refresh-scan" type="button">Refresh / Start Over</button><button id="clear-results" type="button">Clear Results</button><button id="reset-scan" type="button">Reset after closing tab</button></div>
      <div id="discovery-progress" class="muted"></div>
      <h2>DISCOVERED BAZAARS <span class="count" id="seller-count"></span></h2><div id="seller-leads" aria-live="polite"></div>
      <h2>LIVE-VERIFIED $1 SALES <span class="count" id="count"></span></h2><div id="events" aria-live="polite"></div>
      <div class="row"><button id="verify-market" type="button">Verify visible Item Market</button></div>
      <h2>ITEM MARKET DEALS <span class="count" id="market-count"></span></h2><div id="market-leads" aria-live="polite"></div>

      <details><summary>Discovery settings</summary>
        <label for="api-key">Torn public API key</label><input id="api-key" type="password" autocomplete="off" placeholder="Stored only in Tampermonkey">
        <div id="api-status" class="muted"></div>
        <label for="min-value">Minimum normal market value</label><input id="min-value" type="number" min="1" step="1000">
        <div class="row"><button id="save-api-key" type="button">Save key locally</button><button id="clear-api-key" type="button">Clear key</button></div>
        <div class="row"><button id="deep-scan" type="button">Deep Item Market scan</button></div>
        <div class="muted">Find & Scan sweeps Torn's Bazaar directory, checks open sellers through Torn's cached user-Bazaar API, then reuses the current TornPDA tab across exact-$1 candidate Bazaars for live verification and returns here when finished. API timestamps and local fetch time stay distinct. Torn's Directory is a showcase, not a complete registry of every Bazaar in the game. Deep Item Market scan remains a slower secondary check.</div>
      </details>

      <details><summary>Known Bazaar scanner (secondary)</summary>
        <div id="progress" class="muted"></div>
        <div class="row"><button id="start" type="button">Start in this tab</button><button id="pause" type="button">Pause</button><button id="stop" type="button">Stop</button></div>
        <div class="row"><button id="next" type="button">Open next Bazaar</button><button id="inspect" type="button">Inspect visible listings</button></div>
        <label for="targets">Known seller IDs</label><textarea id="targets" placeholder="One ID per line, or comma-separated" maxlength="1400"></textarea>
        <div class="row"><button type="button" id="save-targets">Save sellers</button></div>
      </details>

      <details><summary>Preferences</summary><label><input id="sound" type="checkbox"> Sound in this tab</label><span class="muted">Sound is only used for fresh verified/actionable observations after a user action.</span></details>
      <details><summary>Local diagnostics</summary><pre id="diagnostics"></pre></details>
      <footer>Independent MM tool · ${VERSION} · never presses Torn Buy controls</footer>
    </div>`;
  shadow.append(style,panel);doc.body.append(host);
  const ui={host,shadow,panel,launcher:null,setLauncherActive:null,eventKey:'',sellerKey:'',marketKey:'',el:id=>shadow.getElementById(id)};
  ui.setLauncher=(launcher,setActive)=>{ui.launcher=launcher;ui.setLauncherActive=setActive||null;if(ui.launcher)ui.launcher.setAttribute('aria-expanded',String(!panel.hidden));};
  ui.setOpen=open=>{panel.hidden=!open;if(ui.launcher)ui.launcher.setAttribute('aria-expanded',String(open));};
  return ui;
}

function renderUI(ui,state,identity,now,localError='',session={}) {
  const h=health(state,now), fresh=unread(state,now), actionable=actionableMarketLeads(state,now), w=state.worker, scan=state.sellerScan;
  const staleWorker=workerIsStale(w,now);
  const scanActive=scan && (scan.phase==='launching'||scan.phase==='scanning');
  const scanStale=sellerScanIsStale(scan,now);
  const mine=w?.tabId===identity.tabId&&w?.documentId===identity.documentId;
  const totalBadge=actionable.length+fresh.length;
  const status=session.discoveryBusy?'Loading dollar-sale directory':scanStale?'Stale scanner — reset required':scanActive?`Scanning Bazaars ${scan.scanned}/${scan.sellerIds.length}`:scan?.phase==='complete'?`${scan.found} live-verified $1 listing${scan.found===1?'':'s'}`:actionable.length?`${actionable.length} buyable now`:h.label;
  if(ui.launcher){
    const mode=h.kind==='warning'?'warning':totalBadge?'deal':session.discoveryBusy?'active':h.kind;
    ui.launcher.dataset.mmDollarState=mode;
    ui.launcher.title=`Dollar Broker · ${status} · ${actionable.length} verified market · ${fresh.length} Bazaar`;
    ui.launcher.setAttribute('aria-label',ui.launcher.title);
    const badge=ui.launcher.querySelector('[data-mm-dollar-badge]');
    if(badge){badge.hidden=!totalBadge;badge.textContent=String(totalBadge);}
    ui.launcher.style.boxShadow=totalBadge?'0 0 0 2px #738f45,0 0 10px #c7ee86':h.kind==='warning'?'0 0 0 1px #ffb855':'';
    ui.setLauncherActive?.(h.kind==='active'||session.discoveryBusy||scanActive||totalBadge>0);
  }
  ui.el('status').textContent=status;
  ui.el('notice').textContent=localError||scan?.error||w?.error||'';
  ui.el('discovery-progress').textContent=session.discoveryProgress||(scanActive?`Background verification ${scan.scanned}/${scan.sellerIds.length} · ${scan.observed} exact-$1 visible · ${scan.found} LIVE VERIFIED · ${scan.unverified} unverified · ${scan.unavailable} unavailable${scan.errors.length?` · ${scan.errors.length} store error${scan.errors.length===1?'':'s'}`:''}`:scan?`Last Bazaar verification: ${scan.observed} exact-$1 visible · ${scan.found} LIVE VERIFIED · ${scan.unverified} unverified · ${scan.unavailable} unavailable${scan.errors.length?` · ${scan.errors.length} store error${scan.errors.length===1?'':'s'}`:''}`:`${state.sellerLeads.length} directory seller${state.sellerLeads.length===1?'':'s'} · ${state.marketLeads.length} item lead${state.marketLeads.length===1?'':'s'} · deep-scan cursor ${state.discoveryCursor}`);
  const hasResettableResults=!!scan||!!w||state.sellerLeads.length>0||state.events.length>0||state.marketLeads.length>0||state.discoveryCursor>0||state.lastSellerDiscovery>0||state.lastDiscovery>0||state.lastDetection>0;
  ui.el('find-deals').disabled=!!localError||session.discoveryBusy||scanActive||!session.apiConfigured;
  ui.el('refresh-scan').disabled=!!localError||session.discoveryBusy||scanActive||!session.apiConfigured;
  ui.el('clear-results').disabled=!!localError||session.discoveryBusy||scanActive||!hasResettableResults;
  ui.el('reset-scan').disabled=!scanStale;
  ui.el('deep-scan').disabled=!!localError||session.discoveryBusy||scanActive||!session.apiConfigured;
  ui.el('verify-market').disabled=!!localError||session.discoveryBusy||!session.currentMarketLead;
  ui.el('api-status').textContent=session.apiConfigured?'TornPDA API key available.':'TornPDA API key unavailable.';
  if(ui.shadow.activeElement!==ui.el('min-value'))ui.el('min-value').value=String(session.minValue||1);

  ui.el('progress').textContent=w?`${mine?'This tab is the Bazaar worker':'Bazaar worker is in another tab/document'} · ${w.index<0?'No seller opened':`${w.index+1}/${state.targets.length} · Player ${w.targetId||'—'}`}`:`${state.targets.length} known seller${state.targets.length===1?'':'s'} configured`;
  ui.el('start').textContent=w?.tabId===identity.tabId?'Resume here':'Start in this tab';
  ui.el('start').disabled=!!localError||!state.targets.length||!!(w&&w.tabId!==identity.tabId&&!staleWorker);
  ui.el('pause').disabled=!w||w.phase==='paused';ui.el('stop').disabled=!w;
  ui.el('next').disabled=!mine||w.phase==='paused'||w.phase==='navigating';
  ui.el('inspect').disabled=!mine||!w.targetId||['paused','navigating'].includes(w.phase);
  ui.el('save-targets').disabled=!!w;
  if(ui.shadow.activeElement!==ui.el('targets'))ui.el('targets').value=state.targets.join('\n');

  const sellerKey=state.sellerLeads.map(x=>`${x.id}:${x.isOpen}:${x.dollarSales}:${x.observedAt}`).join('|');
  if(ui.sellerKey!==sellerKey){
    ui.sellerKey=sellerKey;ui.el('seller-leads').replaceChildren();
    for(const lead of state.sellerLeads){
      const card=document.createElement('article');card.dataset.status=lead.isOpen?'buyable':'gone';
      const name=document.createElement('b');name.textContent=`${lead.name} [${lead.sellerId}]`;
      const tag=document.createElement('span');tag.className='tag '+(lead.isOpen?'':'gone');tag.textContent=lead.isOpen?'BAZAAR OPEN':'CLOSED';
      const info=document.createElement('div');info.textContent=lead.dollarSales===null?'Dollar-sale rank: not listed in weekly $1 panel':`Weekly $1 sales: ${lead.dollarSales.toLocaleString()}`;
      const timing=document.createElement('div');timing.className='muted';timing.textContent=`Directory checked ${age(lead.observedAt,now)}s ago`;
      const actions=document.createElement('div');actions.className='row';
      const link=document.createElement('a');link.className='action';link.textContent='Open Bazaar';link.href=lead.url;link.dataset.sellerRoute=lead.sellerId;
      actions.append(link);card.append(name,tag,info,timing,actions);ui.el('seller-leads').append(card);
    }
    if(!state.sellerLeads.length){const p=document.createElement('div');p.className='muted';p.textContent='No dollar-seller directory results yet. Click Find Dollar Sellers.';ui.el('seller-leads').append(p);}
  }
  ui.el('seller-count').textContent=`${state.sellerLeads.filter(x=>x.isOpen).length} open · ${state.sellerLeads.length} unique directory sellers`;

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

  ui.el('count').textContent=`${state.events.length} live verified · ${fresh.length} fresh`;
  const eventKey=state.events.map(e=>`${e.id}:${e.item.quantity}:${e.acknowledged}:${e.expiresAt>now}`).join('|');
  if(ui.eventKey!==eventKey){
    ui.eventKey=eventKey;ui.el('events').replaceChildren();
    for(const e of state.events){
      const card=document.createElement('article');card.dataset.status=e.expiresAt<=now?'stale':'lead';
      const name=document.createElement('b');name.textContent=`$1 · ${e.item.name} · qty ${e.item.quantity}`;
      const tag=document.createElement('span');tag.className='tag '+(e.expiresAt<=now?'gone':'');tag.textContent=e.expiresAt<=now?'RECHECK':'LIVE VERIFIED';
      const seller=document.createElement('div');seller.textContent=`${e.seller} [${e.targetId}]`;
      const timing=document.createElement('div');timing.className='muted';timing.textContent=`Observed ${new Date(e.detectedAt).toLocaleTimeString()}${e.sourceTimestamp?` · API source ${age(e.sourceTimestamp,now)}s old · fetched ${age(e.fetchedAt,now)}s ago`:' · live DOM only'}${e.expiresAt<=now?' · recheck before purchase':''}`;
      const actions=document.createElement('div');actions.className='row';
      const link=document.createElement('a');link.className='action';link.textContent='Open Bazaar';link.href=e.url;link.dataset.route=e.id;
      const ack=document.createElement('button');ack.type='button';ack.textContent=e.acknowledged?'Acknowledged':'Acknowledge';ack.disabled=e.acknowledged;ack.dataset.ack=e.id;
      actions.append(link,ack);card.append(name,tag,seller,timing,actions);ui.el('events').append(card);
    }
    if(!state.events.length){const p=document.createElement('div');p.className='muted';p.textContent=scanActive?'Verifying API-confirmed $1 candidates against current Torn listing controls…':'No live-verified $1 Bazaar listings found in the latest candidate verification.';ui.el('events').append(p);}
  }
  ui.el('diagnostics').textContent=JSON.stringify({script:VERSION,schema:state.schema,revision:state.revision,sellerLeads:state.sellerLeads.length,openDollarSellers:state.sellerLeads.filter(x=>x.isOpen).length,lastSellerDiscovery:state.lastSellerDiscovery||null,sellerScan:scan?{phase:scan.phase,scanned:scan.scanned,total:scan.sellerIds.length,observedDollar:scan.observed,liveVerified:scan.found,unverified:scan.unverified,unavailable:scan.unavailable,errors:scan.errors.length,target:scan.targetId}:null,marketLeads:state.marketLeads.length,actionableMarket:actionable.length,discoveryCursor:state.discoveryCursor,lastDiscovery:state.lastDiscovery||null,workerId:w?.id||null,phase:w?.phase||'stopped',target:w?.targetId||null,targetCount:state.targets.length,lastDetection:state.lastDetection||null,events:state.events.length,duplicateLedger:`${state.seen.length}/${LIMIT.seen}`,apiConfigured:!!session.apiConfigured,discoveryBusy:!!session.discoveryBusy,window:ui.panel.hidden?'minimized':'open',error:localError||scan?.error||w?.error||null},null,2);
}


// ---- runtime ----

const MODULE_ID='dollar-broker';
const DOCK_ICON='<span style="position:relative;width:100%;height:100%;display:grid;place-items:center"><svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="width:25px;height:25px"><path d="M4 4h11l7 7-11 11-7-7Z"/><circle cx="8" cy="8" r="1"/><path d="M16 9c-4-3-8 2-4 4s0 6-4 3m8-8-8 10"/></svg><span data-mm-dollar-badge hidden style="position:absolute;right:-7px;top:-7px;background:#d4f59e;border:1px solid #28341c;color:#172312;border-radius:9px;min-width:17px;padding:0 4px;font:bold 11px/16px system-ui;pointer-events:none">0</span></span>';

const scanSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function collectBazaarSnapshot(doc,win,targetId,documentId,initialUrl) {
  const collected=new Map();
  let seller='',lastError='',successful=false,lastHeight=-1,stableBottom=0;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
    const at=Date.now();
    const snapshot=inspectBazaarForScan(doc,win,{targetId,documentId,at});
    if(snapshot.ok) {
      successful=true;seller=snapshot.seller||seller;lastError='';
      for(const item of snapshot.items) {
        const key=item.listingId||item.itemId||item.name;
        const previous=collected.get(key);
        const rank={unverified:0,unavailable:1,available:2};
        if(!previous || (rank[item.liveState]??-1)>(rank[previous.liveState]??-1) || ((rank[item.liveState]??-1)===(rank[previous.liveState]??-1) && item.quantity>previous.quantity)) collected.set(key,item);
      }
    } else lastError=snapshot.error||lastError;

    const root=doc.querySelector('#bazaarRoot');
    if(!root || doc.readyState!=='complete') {await scanSleep(350);continue;}
    const de=doc.documentElement;
    const height=Math.max(de.scrollHeight,doc.body?.scrollHeight||0);
    const bottom=Math.max(0,height-win.innerHeight);
    const y=Math.min(Math.max(0,win.scrollY||de.scrollTop||0),bottom);
    if(bottom<=0 || y>=bottom-4) {
      stableBottom=height===lastHeight?stableBottom+1:0;
      if(successful && stableBottom>=2) break;
    } else {
      const step=Math.max(420,Math.floor(win.innerHeight*0.8));
      win.scrollTo(0,Math.min(bottom,y+step));
      stableBottom=0;
    }
    lastHeight=height;
    await scanSleep(350);
  }
  if(!successful) throw new Error(lastError||'Bazaar did not become inspectable before the scan timeout.');
  return {ok:true,items:[...collected.values()],seller,targetId,documentId,at:Date.now(),error:'',inspected:collected.size};
}

async function runSellerScannerTab(gm,win,doc,store,identity,scanId,initialUrl) {
  try {
    const claimed=await store.change(state=>claimSellerScan(state,identity.tabId,scanId,initialUrl,Date.now()));
    if(!claimed.result) {await __MM_PDA_ENV__.finishScanner(); return {destroy(){}};}
    const targetId=claimed.state.sellerScan.targetId;
    let transition;
    try {
      const snapshot=await collectBazaarSnapshot(doc,win,targetId,identity.documentId,initialUrl);
      transition=await store.change(state=>recordSellerScanSnapshot(state,identity.tabId,scanId,snapshot,Date.now()));
    } catch(error) {
      transition=await store.change(state=>skipSellerScanTarget(state,identity.tabId,scanId,error?.message||error,Date.now()));
    }
    if(transition.result.url) {
      win.location.replace(transition.result.url);
      return {destroy(){}};
    }
    await scanSleep(150);
    await __MM_PDA_ENV__.finishScanner();
    return {destroy(){}};
  } catch(error) {
    try {await store.change(state=>failSellerScan(state,scanId,error?.message||error,Date.now()));} catch {}
    try { await __MM_PDA_ENV__.finishScanner(); } catch {}
    return {destroy(){}};
  }
}

async function boot(gm, win, doc) {
  const sharedCore=__MM_PDA_ENV__.uiCore;
  if(!sharedCore?.registerDockLauncher || !sharedCore?.makePanelDraggable) throw new Error('MM Torn Core dependency is unavailable.');

  const identity={tabId:'',documentId:win.crypto.randomUUID(),workerId:''};
  const store=new Store(gm,__MM_PDA_ENV__.locks);
  let state=emptyState(), error='', closed=false, busy=false, baseline=false, ticker=null, listener=null, sound=null, scannerTab=null;
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
  } catch(e) {error=e?.message||'Storage initialization failed or has an unsupported schema. Existing data was preserved.';}

  const initialUrl=win.location.href;
  const scanId=scanTokenAt(initialUrl);
  if(scanId) return runSellerScannerTab(gm,win,doc,store,identity,scanId,initialUrl);
  const ui=makeUI(doc);
  __MM_PDA_ENV__.configureUI(ui);

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
  if(await __MM_PDA_ENV__.consumeScannerReturn()){ui.setOpen(true);}

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
    if(scannerTab && state.sellerScan?.ownerTabId===identity.tabId && ['complete','error'].includes(state.sellerScan.phase)) {
      try {scannerTab.close?.();} catch {}
      scannerTab=null;
    }
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

  async function runSellerDiscovery(resetFirst=false) {
    if(!apiKey) throw new Error('Save a Torn public API key first.');
    // TornPDA uses same-tab verification; no background-tab API is required.
    if(sellerScanIsActive(state.sellerScan)) {
      if(!sellerScanIsStale(state.sellerScan,Date.now())) throw new Error('A dollar Bazaar scan is already running.');
      const staleId=state.sellerScan.id;
      await change(s=>failSellerScan(s,staleId,'Stale TornPDA same-tab scanner was reset before restart.',Date.now()));
    }
    if(resetFirst) {
      if(scannerTab){try{scannerTab.close?.();}catch{} scannerTab=null;}
      await change(s=>clearDiscoveryResults(s));
      played.clear();playedMarket.clear();
      discoveryProgress='Previous listings cleared · starting a fresh directory scan.';
      render();
    }
    discoveryBusy=true;discoveryProgress='Loading Torn dollar-sale Bazaar directory…';render();
    try {
      const result=await discoverDollarSellers({gm,key:apiKey,onProgress:progress=>{
        discoveryProgress=`Directory sweep ${progress.current}/${progress.total} categories · ${progress.sellers} unique seller${progress.sellers===1?'':'s'} found`;
        render();
      }});
      const at=Date.now();
      await change(s=>{
        replaceSellerLeads(s,result.sellers,at);
        s.events=[];s.seen=[];s.sellerScan=null;s.lastDetection=0;
      });
      discoveryProgress=`Directory returned ${result.open} open Bazaar${result.open===1?'':'s'} · checking official user-Bazaar API for exact-$1 stock…`;render();
      const apiScan=await scanDollarSellerBazaars({
        gm,key:apiKey,sellers:result.sellers,shouldStop:()=>closed,
        onProgress:progress=>{
          if(progress.phase==='seller-api') discoveryProgress=`Seller API ${progress.current}/${progress.total} · ${progress.observed} exact-$1 item${progress.observed===1?'':'s'} · ${progress.candidates} candidate Bazaar${progress.candidates===1?'':'s'} · ${progress.errors} error${progress.errors===1?'':'s'}`;
          else discoveryProgress=`Seller API checked ${progress.total} open Bazaar${progress.total===1?'':'s'} · ${progress.observed} exact-$1 item${progress.observed===1?'':'s'} · ${progress.candidates} candidate Bazaar${progress.candidates===1?'':'s'}`;
          render();
        }
      });
      if(!apiScan.candidates.length) {
        discoveryProgress=`Seller API checked ${apiScan.scanned} open Bazaar${apiScan.scanned===1?'':'s'} · no exact-$1 candidate Bazaars need live verification${apiScan.errors.length?` · ${apiScan.errors.length} seller API error${apiScan.errors.length===1?'':'s'}`:''}.`;
        return;
      }
      const newScanId=win.crypto.randomUUID(),prepared=await change(s=>beginSellerScan(s,identity.tabId,newScanId,Date.now(),apiScan.candidates));
      discoveryProgress=`API found ${apiScan.observed} exact-$1 item${apiScan.observed===1?'':'s'} across ${apiScan.candidates.length} candidate Bazaar${apiScan.candidates.length===1?'':'s'} · live-verifying only those candidates in one temporary tab.`;
      try {
        await __MM_PDA_ENV__.startScanner(prepared.result,initialUrl);
        return;
      } catch(openError) {
        await change(s=>failSellerScan(s,newScanId,'Could not start the TornPDA same-tab scanner.',Date.now()));
        throw openError;
      }
    } finally {
      discoveryBusy=false;render();
    }
  }

  on(ui.el('find-deals'),'click',e=>act(e,()=>runSellerDiscovery(false)));

  on(ui.el('refresh-scan'),'click',e=>act(e,()=>runSellerDiscovery(true)));

  on(ui.el('clear-results'),'click',e=>act(e,async()=>{
    if(sellerScanIsActive(state.sellerScan)) throw new Error('Wait for the active Bazaar scan to finish, or close/reset the scanner before clearing results.');
    if(scannerTab){try{scannerTab.close?.();}catch{} scannerTab=null;}
    await change(s=>clearDiscoveryResults(s));
    played.clear();playedMarket.clear();
    discoveryProgress='Listings and scan progress cleared. API key, preferences, and known seller IDs were kept.';
    render();
  }));

  on(ui.el('reset-scan'),'click',e=>act(e,async()=>{
    const scan=state.sellerScan;
    if(!sellerScanIsStale(scan,Date.now())) throw new Error('Only a stale background scan can be reset.');
    if(scannerTab){try{scannerTab.close?.();}catch{} scannerTab=null;}
    await change(s=>failSellerScan(s,scan.id,'Stale background scan reset. Start a new scan when the old extra tab is closed.',Date.now()));
    discoveryProgress='Stale scan reset. Start Find & Scan again after confirming no old scanner tab remains.';
    render();
  }));

  on(ui.el('deep-scan'),'click',e=>act(e,async()=>{
    if(!apiKey) throw new Error('Save a Torn public API key first.');
    const value=Number(ui.el('min-value').value);
    if(Number.isSafeInteger(value)&&value>0&&value!==preferences.minValue){
      preferences.minValue=value;await gm.setValue(PREF_KEY,{minValue:value});
    }
    discoveryBusy=true;discoveryProgress='Loading Torn item catalog for deep scan…';render();
    try {
      const result=await discoverDollarLeads({
        gm,key:apiKey,minValue:preferences.minValue,cursor:state.discoveryCursor,count:DISCOVERY.batch,
        shouldStop:()=>closed,
        onProgress:progress=>{
          if(progress.phase==='scan') discoveryProgress=`Deep scan ${progress.current}/${progress.total}: ${progress.item.name} · normal value ~${progress.item.marketValue.toLocaleString()}`;
          else if(progress.phase==='done') discoveryProgress=`Deep scan checked ${progress.total} items · found ${progress.found} $1 lead${progress.found===1?'':'s'}`;
          render();
        }
      });
      await change(s=>{
        for(const lead of result.leads) upsertMarketLead(s,lead,lead.apiObservedAt);
        s.discoveryCursor=result.nextCursor;
        s.lastDiscovery=Date.now();
      });
      discoveryProgress=`Deep scan checked ${result.scanned}/${result.totalEligible} eligible items · found ${result.leads.length} $1 lead${result.leads.length===1?'':'s'}.`;
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

  on(ui.el('seller-leads'),'click',e=>{
    const link=e.target.closest('[data-seller-route]');
    if(link&&(!e.isTrusted||!active()))e.preventDefault();
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
  if(!__MM_PDA_ENV__.locks?.request) error='TornPDA state lock is unavailable. Bazaar worker controls are disabled.';

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


// ---- pda ----
function createPdaEnvironment(injectedApiKey,win,doc) {
  const PREFIX='mm-dollar-broker:pda:';
  const RETURN_KEY=PREFIX+'scanner-return:v1';
  const LAUNCHER_POS_KEY=PREFIX+'launcher-pos:v1';
  const PANEL_POS_KEY=PREFIX+'panel-pos:v1';
  const TAB_KEY=PREFIX+'tab:v1';
  const SAFE_BOTTOM=92;
  const SAFE_EDGE=8;
  const unresolved='###PDA-'+'APIKEY###';
  const injected=String(injectedApiKey||'').trim();
  const appKey=injected && injected!==unresolved ? injected : '';
  let memoryTab={};
  let storageQueue=Promise.resolve();

  const clone=value=>{
    if(value===undefined)return undefined;
    try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}
  };

  async function storageGet(key,def=null) {
    const k=String(key);
    if(typeof PDA_storage!=='undefined' && PDA_storage && typeof PDA_storage.get==='function') {
      try {
        const value=await PDA_storage.get(k,def);
        return value===undefined?def:clone(value);
      } catch {}
    }
    try {
      const raw=win.localStorage.getItem(PREFIX+'fallback:'+k);
      return raw===null?def:JSON.parse(raw);
    } catch { return def; }
  }

  async function storageSet(key,value) {
    const k=String(key);
    const run=async()=>{
      if(typeof PDA_storage!=='undefined' && PDA_storage && typeof PDA_storage.set==='function') {
        await PDA_storage.set(k,clone(value));
        return;
      }
      win.localStorage.setItem(PREFIX+'fallback:'+k,JSON.stringify(value));
    };
    const current=storageQueue.then(run,run);
    storageQueue=current.catch(()=>{});
    return current;
  }

  async function storageDelete(key) {
    const k=String(key);
    const run=async()=>{
      if(typeof PDA_storage!=='undefined' && PDA_storage) {
        if(typeof PDA_storage.delete==='function') {await PDA_storage.delete(k);return;}
        if(typeof PDA_storage.remove==='function') {await PDA_storage.remove(k);return;}
        if(typeof PDA_storage.set==='function') {await PDA_storage.set(k,null);return;}
      }
      try{win.localStorage.removeItem(PREFIX+'fallback:'+k);}catch{}
    };
    const current=storageQueue.then(run,run);
    storageQueue=current.catch(()=>{});
    return current;
  }

  function sessionRead() {
    try {
      const raw=win.sessionStorage.getItem(TAB_KEY);
      return raw?JSON.parse(raw):memoryTab;
    } catch { return memoryTab; }
  }
  function sessionWrite(value) {
    memoryTab=clone(value)||{};
    try{win.sessionStorage.setItem(TAB_KEY,JSON.stringify(memoryTab));}catch{}
  }

  function nativeRequest(details) {
    const native=globalThis.GM;
    if(native && typeof native.xmlHttpRequest==='function') return native.xmlHttpRequest(details);
    if(typeof PDA_httpGet!=='function') throw new Error('TornPDA HTTP bridge is unavailable.');
    const opts=details&&typeof details==='object'?details:{};
    const method=String(opts.method||'GET').toUpperCase();
    if(method!=='GET') throw new Error('Dollar Broker PDA HTTP fallback supports GET only.');
    let aborted=false,settled=false,timer=null;
    const finish=(fn,arg)=>{
      if(aborted||settled)return;
      settled=true;
      if(timer)win.clearTimeout(timer);
      try{fn?.(arg);}catch{}
    };
    if(Number(opts.timeout||0)>0) timer=win.setTimeout(()=>finish(opts.ontimeout,{status:0,statusText:'timeout',responseText:''}),Number(opts.timeout));
    Promise.resolve(PDA_httpGet(String(opts.url||''),opts.headers||{}))
      .then(response=>finish(opts.onload,response))
      .catch(error=>finish(opts.onerror,{status:0,statusText:String(error?.message||error||'request failed'),responseText:'',error}));
    return {abort(){aborted=true;if(timer)win.clearTimeout(timer);}};
  }

  const gm=Object.freeze({
    async getValue(key,def=null) {
      const value=await storageGet(key,undefined);
      if(value!==undefined && value!==null && value!=='') return value;
      if(String(key)===String(API_KEY_KEY) && appKey) return appKey;
      return def;
    },
    async setValue(key,value) {await storageSet(key,value);},
    async getTab() {return clone(sessionRead())||{};},
    async saveTab(value) {sessionWrite(value||{});},
    async addValueChangeListener(){return null;},
    async removeValueChangeListener(){},
    xmlHttpRequest(details){return nativeRequest(details);}
  });

  function viewport() {
    const vv=win.visualViewport;
    return {
      width:Math.max(240,Math.floor(vv?.width||win.innerWidth||doc.documentElement.clientWidth||390)),
      height:Math.max(320,Math.floor(vv?.height||win.innerHeight||doc.documentElement.clientHeight||700))
    };
  }

  function clampElement(element,{reserveBottom=SAFE_BOTTOM,minTop=SAFE_EDGE}={}) {
    const v=viewport(),rect=element.getBoundingClientRect();
    const width=Math.min(rect.width||44,v.width-SAFE_EDGE*2);
    const height=Math.min(rect.height||44,v.height-minTop-reserveBottom);
    const left=Math.min(Math.max(SAFE_EDGE,rect.left),Math.max(SAFE_EDGE,v.width-width-SAFE_EDGE));
    const top=Math.min(Math.max(minTop,rect.top),Math.max(minTop,v.height-height-reserveBottom));
    element.style.left=Math.round(left)+'px';
    element.style.top=Math.round(top)+'px';
    element.style.right='auto';
    element.style.bottom='auto';
    return {left:Math.round(left),top:Math.round(top)};
  }

  function bindMovable(element,handle,key,{reserveBottom=SAFE_BOTTOM,minTop=SAFE_EDGE}={}) {
    let pointer=null,startX=0,startY=0,startLeft=0,startTop=0,moved=false;
    const onDown=e=>{
      if(e.button!==undefined && e.button!==0)return;
      const rect=element.getBoundingClientRect();
      pointer=e.pointerId;startX=e.clientX;startY=e.clientY;startLeft=rect.left;startTop=rect.top;moved=false;
      try{handle.setPointerCapture?.(pointer);}catch{}
      e.preventDefault();
    };
    const onMove=e=>{
      if(pointer===null||e.pointerId!==pointer)return;
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(Math.abs(dx)+Math.abs(dy)>6)moved=true;
      const v=viewport(),rect=element.getBoundingClientRect();
      const maxLeft=Math.max(SAFE_EDGE,v.width-rect.width-SAFE_EDGE);
      const maxTop=Math.max(minTop,v.height-rect.height-reserveBottom);
      element.style.left=Math.round(Math.min(Math.max(SAFE_EDGE,startLeft+dx),maxLeft))+'px';
      element.style.top=Math.round(Math.min(Math.max(minTop,startTop+dy),maxTop))+'px';
      element.style.right='auto';element.style.bottom='auto';
      e.preventDefault();
    };
    const onUp=e=>{
      if(pointer===null||e.pointerId!==pointer)return;
      try{handle.releasePointerCapture?.(pointer);}catch{}
      pointer=null;
      const pos=clampElement(element,{reserveBottom,minTop});
      if(moved){
        element.dataset.mmPdaDraggedAt=String(Date.now());
        void storageSet(key,pos);
      }
      e.preventDefault();
    };
    handle.style.touchAction='none';
    handle.addEventListener('pointerdown',onDown);
    handle.addEventListener('pointermove',onMove);
    handle.addEventListener('pointerup',onUp);
    handle.addEventListener('pointercancel',onUp);
    const onResize=()=>clampElement(element,{reserveBottom,minTop});
    win.addEventListener('resize',onResize,{passive:true});
    win.visualViewport?.addEventListener?.('resize',onResize,{passive:true});
    void storageGet(key,null).then(pos=>{
      if(pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)){
        element.style.left=Math.round(pos.left)+'px';
        element.style.top=Math.round(pos.top)+'px';
        element.style.right='auto';element.style.bottom='auto';
        clampElement(element,{reserveBottom,minTop});
      }
    });
    return ()=>{
      handle.removeEventListener('pointerdown',onDown);
      handle.removeEventListener('pointermove',onMove);
      handle.removeEventListener('pointerup',onUp);
      handle.removeEventListener('pointercancel',onUp);
      win.removeEventListener('resize',onResize);
      win.visualViewport?.removeEventListener?.('resize',onResize);
    };
  }

  const uiCore=Object.freeze({
    registerDockLauncher({id,label,accent,icon,onClick}) {
      let button=doc.getElementById('mm-dollar-broker-pda-launcher');
      if(button)return button;
      button=doc.createElement('button');
      button.id='mm-dollar-broker-pda-launcher';
      button.type='button';
      button.dataset.mmDockId=String(id||'dollar-broker');
      button.title=String(label||'MM Dollar Broker');
      button.setAttribute('aria-label',button.title);
      button.innerHTML=String(icon||'');
      button.style.cssText=`position:fixed;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 104px);z-index:2147483646;width:44px;height:44px;min-width:44px;min-height:44px;padding:8px;margin:0;border:1px solid #53634f;border-radius:9px;background:#253129;color:${String(accent||'#9bbf70')};box-shadow:0 4px 14px #000a;display:grid;place-items:center;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;`;
      const cleanup=bindMovable(button,button,LAUNCHER_POS_KEY,{reserveBottom:SAFE_BOTTOM,minTop:SAFE_EDGE});
      button.__mmPdaMoveCleanup=cleanup;
      button.addEventListener('click',event=>{
        const draggedAt=Number(button.dataset.mmPdaDraggedAt||0);
        if(Date.now()-draggedAt<350)return;
        onClick?.(event);
      });
      doc.body.appendChild(button);
      return button;
    },
    setDockLauncherActive(_id,active) {
      const button=doc.getElementById('mm-dollar-broker-pda-launcher');
      if(button)button.dataset.mmPdaActive=active?'1':'0';
    },
    makePanelDraggable(panel,handle) {
      const applyBounds=()=>{
        const v=viewport();
        panel.style.width=Math.min(390,Math.max(280,v.width-SAFE_EDGE*2))+'px';
        panel.style.maxHeight=Math.max(260,Math.floor(v.height*0.70))+'px';
        panel.style.overflow='auto';
        clampElement(panel,{reserveBottom:SAFE_BOTTOM,minTop:52});
      };
      panel.style.right='8px';
      panel.style.top='64px';
      const savedPosition=storageGet(PANEL_POS_KEY,null);
      const restoreVisiblePosition=async()=>{
        const pos=await savedPosition;
        if(pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)){
          panel.style.left=Math.round(pos.left)+'px';
          panel.style.top=Math.round(pos.top)+'px';
          panel.style.right='auto';
          panel.style.bottom='auto';
        }
        applyBounds();
      };
      const cleanupMove=bindMovable(panel,handle,PANEL_POS_KEY,{reserveBottom:SAFE_BOTTOM,minTop:52});
      const onResize=()=>{if(!panel.hidden)applyBounds();};
      const visibilityObserver=new MutationObserver(()=>{
        if(!panel.hidden)win.requestAnimationFrame(()=>{void restoreVisiblePosition();});
      });
      visibilityObserver.observe(panel,{attributes:true,attributeFilter:['hidden']});
      win.addEventListener('resize',onResize,{passive:true});
      win.visualViewport?.addEventListener?.('resize',onResize,{passive:true});
      panel.__mmPanelDragCleanup=()=>{
        cleanupMove();
        visibilityObserver.disconnect();
        win.removeEventListener('resize',onResize);
        win.visualViewport?.removeEventListener?.('resize',onResize);
      };
      return true;
    }
  });

  function configureUI(ui) {
    const label=ui.shadow.querySelector('label[for="api-key"]');
    if(label)label.hidden=true;
    ui.el('api-key').hidden=true;
    ui.el('save-api-key').hidden=true;
    ui.el('clear-api-key').hidden=true;
    ui.el('reset-scan').textContent='Reset stale scan';
    ui.el('mode').textContent='TornPDA · API prefilter · passive unlocked-card verification · manual purchase only';
    const settings=ui.shadow.querySelector('details summary');
    if(settings)settings.textContent='Discovery settings · TornPDA key supplied automatically';
  }

  async function startScanner(url,returnUrl) {
    const target=new URL(String(url),win.location.href);
    const back=new URL(String(returnUrl||win.location.href),win.location.href);
    if(target.origin!=='https://www.torn.com' || target.pathname!=='/bazaar.php') throw new Error('PDA scanner target is invalid.');
    if(back.origin!=='https://www.torn.com') throw new Error('PDA scanner return URL is invalid.');
    await storageSet(RETURN_KEY,{returnUrl:back.href,phase:'scanning',startedAt:Date.now()});
    win.location.assign(target.href);
  }

  async function finishScanner() {
    const state=await storageGet(RETURN_KEY,null);
    const returnUrl=String(state?.returnUrl||'https://www.torn.com/');
    let target;
    try{target=new URL(returnUrl);}catch{target=new URL('https://www.torn.com/');}
    if(target.origin!=='https://www.torn.com')target=new URL('https://www.torn.com/');
    await storageSet(RETURN_KEY,{returnUrl:target.href,phase:'returning',startedAt:Number(state?.startedAt||Date.now()),finishedAt:Date.now()});
    win.location.replace(target.href);
  }

  async function consumeScannerReturn() {
    const state=await storageGet(RETURN_KEY,null);
    if(!state || state.phase!=='returning')return false;
    await storageDelete(RETURN_KEY);
    return Date.now()-Number(state.finishedAt||0)<10*60*1000;
  }

  const serialLocks=(()=>{
    let queue=Promise.resolve();
    return Object.freeze({
      request(_name,_options,fn){
        const run=()=>Promise.resolve().then(fn);
        const current=queue.then(run,run);
        queue=current.catch(()=>{});
        return current;
      }
    });
  })();

  return Object.freeze({
    gm,
    uiCore,
    configureUI,
    startScanner,
    finishScanner,
    consumeScannerReturn,
    locks:win.navigator?.locks?.request?win.navigator.locks:serialLocks,
    platform:'tornpda'
  });
}

const __MM_PDA_ENV__=createPdaEnvironment(__MM_PDA_API_KEY,window,document);
if(window.top===window.self) void boot(__MM_PDA_ENV__.gm,window,document).catch(error=>{
  const note=document.createElement('div');
  note.textContent='MM Dollar Broker PDA could not start: '+String(error?.message||error||'unknown error');
  note.style.cssText='position:fixed;left:8px;right:8px;top:64px;z-index:2147483647;background:#302b22;color:#ffd68b;padding:10px;border:1px solid #8f7440;border-radius:7px;font:12px/1.4 system-ui,sans-serif';
  document.body?.append(note);
});

})();
