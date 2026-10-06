// ==UserScript==
// @name         MM Trade Manager PDA
// @namespace    manic-mike.torn.trade-manager.pda
// @version      0.1.0-alpha.1-pda.1
// @description  TornPDA API-confirmed trade valuation, completed-trade history and Inventory reconciliation; final trade actions remain manual.
// @match        https://www.torn.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==


const __MM_TRADE_PDA_API_KEY='###PDA-APIKEY###';


/* ===== MM Torn Core (bundled) ===== */

(() => {
  'use strict';

  const CORE_VERSION = '8.0.0-alpha.13';
  const LEGACY_CHANNEL = 'mm_bazaar_crm_cross_tab_v1';
  const CORE_INSTANCE_ID = 'v8-core-' + Date.now() + '-' + Math.random().toString(36).slice(2,10);
  const LEGACY = Object.freeze({
    dbName: 'mm_bazaar_crm_idb',
    store: 'state',
    key: 'main',
    schema: 11
  });

  const DOMAIN_PATHS = Object.freeze({
    core: Object.freeze(['businessRules', 'syncState', 'meta']),
    bazaar: Object.freeze([
      'customers', 'sales', 'coupons', 'refunds', 'subscribers',
      'removedCustomers', 'notificationHistory', 'operations'
    ]),
    market: Object.freeze(['procurement', 'marketIntel', 'travelIntel']),
    faction: Object.freeze(['factionInventory']),
    intelligence: Object.freeze([
      'businessRules', 'customers', 'sales', 'coupons', 'refunds',
      'procurement', 'operations', 'marketIntel', 'travelIntel',
      'factionInventory', 'meta'
    ])
  });

  const WRITABLE_DOMAIN_PATHS = Object.freeze({
    core: DOMAIN_PATHS.core,
    bazaar: DOMAIN_PATHS.bazaar,
    market: DOMAIN_PATHS.market,
    faction: DOMAIN_PATHS.faction
  });

  const TOP_LEVEL_TYPES = Object.freeze({
    customers: 'object',
    sales: 'object',
    coupons: 'object',
    refunds: 'object',
    subscribers: 'object',
    removedCustomers: 'object',
    notificationHistory: 'array',
    businessRules: 'object',
    syncState: 'object',
    procurement: 'object',
    operations: 'object',
    marketIntel: 'object',
    travelIntel: 'object',
    factionInventory: 'object',
    meta: 'object'
  });

  function deepClone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function valueType(value) {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }

  function validateLegacyState(state) {
    const errors = [];
    const warnings = [];
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return { ok: false, errors: ['Legacy state is not an object.'], warnings, schema: null };
    }

    const schema = Number(state.schema || 0) || null;
    if (schema !== LEGACY.schema) {
      warnings.push(`Expected legacy schema ${LEGACY.schema}; found ${schema ?? 'unknown'}.`);
    }

    for (const [path, expected] of Object.entries(TOP_LEVEL_TYPES)) {
      if (!(path in state)) {
        errors.push(`Missing top-level path: ${path}`);
        continue;
      }
      const actual = valueType(state[path]);
      if (actual !== expected) errors.push(`Invalid type at ${path}: expected ${expected}, found ${actual}.`);
    }

    return { ok: errors.length === 0, errors, warnings, schema };
  }

  function countObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).length
      : 0;
  }

  function summarizeState(state) {
    const safe = state && typeof state === 'object' ? state : {};
    const faction = safe.factionInventory && typeof safe.factionInventory === 'object'
      ? safe.factionInventory
      : {};
    const readiness = faction.memberReadiness && typeof faction.memberReadiness === 'object'
      ? faction.memberReadiness
      : {};
    const procurement = safe.procurement && typeof safe.procurement === 'object'
      ? safe.procurement
      : {};
    const travel = safe.travelIntel && typeof safe.travelIntel === 'object'
      ? safe.travelIntel
      : {};

    return Object.freeze({
      schema: Number(safe.schema || 0) || null,
      customers: countObject(safe.customers),
      sales: countObject(safe.sales),
      coupons: countObject(safe.coupons),
      refunds: countObject(safe.refunds),
      acquisitions: Array.isArray(procurement.acquisitions) ? procurement.acquisitions.length : 0,
      watchlistItems: countObject(procurement.watchlist),
      marketItems: countObject(safe.marketIntel?.marketplace),
      travelRows: Array.isArray(travel.rows) ? travel.rows.length : 0,
      travelHistorySeries: countObject(travel.history),
      factionItems: countObject(faction.current),
      factionSnapshots: Array.isArray(faction.snapshots) ? faction.snapshots.length : 0,
      factionMembers: countObject(readiness.roster),
      readinessProfiles: countObject(readiness.profiles)
    });
  }

  function getDomainSlice(state, domain) {
    const paths = DOMAIN_PATHS[String(domain || '').toLowerCase()];
    if (!paths) throw new Error(`Unknown MM Torn domain: ${domain}`);
    const out = { schema: Number(state?.schema || 0) || null };
    for (const path of paths) out[path] = deepClone(state?.[path]);
    return out;
  }

  function freshnessSnapshot(state) {
    const safe = state && typeof state === 'object' ? state : {};
    return Object.freeze({
      unified: safe.syncState?.lastUnifiedSyncAt || null,
      acquisitions: safe.procurement?.lastAcquisitionSyncAt || null,
      itemMarket: safe.procurement?.lastItemMarketAt || null,
      marketGlobal: safe.marketIntel?.lastGlobalSyncAt || null,
      weav3rGeneratedAt: safe.marketIntel?.marketplaceGeneratedAt || null,
      travel: safe.travelIntel?.lastSyncAt || null,
      faction: safe.factionInventory?.lastSyncAt || null,
      roster: safe.factionInventory?.memberReadiness?.lastRosterSyncAt || null
    });
  }

  function applyDomainSlice(latestState, domain, nextSlice) {
    const key = String(domain || '').toLowerCase();
    const paths = WRITABLE_DOMAIN_PATHS[key];
    if (!paths) throw new Error(`Domain is not writable through Core: ${domain}`);
    if (!latestState || typeof latestState !== 'object' || Array.isArray(latestState)) {
      throw new Error('Latest shared state is invalid.');
    }
    if (!nextSlice || typeof nextSlice !== 'object' || Array.isArray(nextSlice)) {
      throw new Error('Domain update must be an object slice.');
    }

    const merged = deepClone(latestState);
    for (const path of paths) {
      if (Object.prototype.hasOwnProperty.call(nextSlice, path)) {
        merged[path] = deepClone(nextSlice[path]);
      }
    }
    merged.schema = Number(latestState.schema || LEGACY.schema) || LEGACY.schema;
    return merged;
  }

  function openLegacyDb() {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable in this runtime.'));
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(LEGACY.dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Legacy IndexedDB open failed.'));
      request.onupgradeneeded = () => {
        try { request.transaction?.abort(); } catch {}
        reject(new Error('Legacy IndexedDB does not exist; read-only Core will not create it.'));
      };
    });
  }

  async function readLegacyState() {
    const db = await openLegacyDb();
    try {
      if (!db.objectStoreNames.contains(LEGACY.store)) {
        throw new Error(`Legacy IndexedDB store '${LEGACY.store}' is missing.`);
      }
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(LEGACY.store, 'readonly');
        const req = tx.objectStore(LEGACY.store).get(LEGACY.key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error || new Error('Legacy IndexedDB read failed.'));
      });
      return deepClone(value);
    } finally {
      try { db.close(); } catch {}
    }
  }

  function notifyStateChanged(domain) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(LEGACY_CHANNEL);
      channel.postMessage({ source: CORE_INSTANCE_ID, type: 'state-updated', domain:String(domain||''), at:Date.now() });
      channel.close();
    } catch {}
  }

  async function updateDomainState(domain, updater) {
    if (typeof updater !== 'function') throw new Error('updateDomainState requires a synchronous updater function.');
    const key = String(domain || '').toLowerCase();
    if (!WRITABLE_DOMAIN_PATHS[key]) throw new Error(`Domain is not writable through Core: ${domain}`);

    const db = await openLegacyDb();
    try {
      if (!db.objectStoreNames.contains(LEGACY.store)) {
        throw new Error(`Legacy IndexedDB store '${LEGACY.store}' is missing.`);
      }
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(LEGACY.store, 'readwrite');
        const store = tx.objectStore(LEGACY.store);
        const getReq = store.get(LEGACY.key);
        let output = null;

        getReq.onerror = () => {
          try { tx.abort(); } catch {}
          reject(getReq.error || new Error('Shared state read failed.'));
        };
        getReq.onsuccess = () => {
          try {
            const latest = getReq.result;
            const validation = validateLegacyState(latest);
            if (!validation.ok) throw new Error('Shared state failed validation: ' + validation.errors.join('; '));
            const draft = getDomainSlice(latest, key);
            const maybeNext = updater(draft);
            if (maybeNext && typeof maybeNext.then === 'function') {
              throw new Error('Domain updater must be synchronous to preserve IndexedDB transaction atomicity.');
            }
            const nextSlice = maybeNext === undefined ? draft : maybeNext;
            output = applyDomainSlice(latest, key, nextSlice);
            store.put(output, LEGACY.key);
          } catch (error) {
            try { tx.abort(); } catch {}
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(deepClone(output));
        tx.onerror = () => reject(tx.error || new Error('Shared state update failed.'));
        tx.onabort = () => reject(tx.error || new Error('Shared state update aborted.'));
      });
      notifyStateChanged(key);
      return result;
    } finally {
      try { db.close(); } catch {}
    }
  }

  const DOCK_ID='mm-torn-module-dock';
  const DOCK_STYLE_ID='mm-torn-module-dock-style';
  const DOCK_ORDER_KEY='mm_torn_module_dock_order_v1';
  const DOCK_ORDER_CUSTOM_KEY='mm_torn_module_dock_order_custom_v1';
  const DOCK_FLOAT_KEY='mm_torn_module_float_positions_v1';
  // v3 key prevents older cached core copies from undoing the alpha.10 migration.
  const DOCK_DEFAULT_LAYOUT_KEY='mm_torn_module_default_layout_rev_v3';
  const DOCK_DEFAULT_LAYOUT_REV='footer-adjacent-v4-relative-redock';
  // Flex order is left -> right. The requested operational order is therefore
  // Trade, Armory, Customers, Acquisitions, Inventory when read right -> left.
  // Other MM launchers remain to the left and never displace that five-icon cluster.
  const DOCK_DEFAULT_ORDER=Object.freeze([
    'crm','scout','bazaar','intelligence',
    'inventory-roi','acquisitions','customers','armory','trade-reminder'
  ]);
  const DOCK_CANONICAL_VISIBLE=Object.freeze([
    'inventory-roi','acquisitions','customers','armory','trade-reminder'
  ]);
  const PANEL_POSITION_PREFIX='mm_torn_panel_position_v1:';
  const LAUNCHER_EDGE_MARGIN=4;
  const LAUNCHER_SNAP_GAP=4;
  const NATIVE_DOCK_CLEARANCE=6;
  const LAUNCHER_SNAP_DISTANCE=18;
  const DOCK_META=Object.freeze({
    crm:{label:'CRM',accent:'#59636d',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 5v14M4 10h16M12 10v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'},
    scout:{label:'Market Scout',accent:'#287f85',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4M8 13l2-3 2 2 3-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'},
    armory:{label:'Faction Armory',accent:'#8b6a2f',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.4-2.5 7.7-7 10-4.5-2.3-7-5.6-7-10V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6M12 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'},
    bazaar:{label:'Bazaar Manager',accent:'#2c718e',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14l-1 11H6zM7 9l1-5h8l1 5M9 13h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'},
    intelligence:{label:'Business Intelligence',accent:'#53677d',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M10 19V6M15 19v-9M20 19V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}
  });

  function clamp(value,min,max){
    return Math.min(Math.max(Number(value)||0,min),Math.max(min,max));
  }

  function dockHasCustomOrder(){
    try{return localStorage.getItem(DOCK_ORDER_CUSTOM_KEY)==='1';}
    catch{return false;}
  }

  function dockReadOrder(){
    if(!dockHasCustomOrder())return DOCK_DEFAULT_ORDER.slice();
    try{
      const raw=JSON.parse(localStorage.getItem(DOCK_ORDER_KEY)||'[]');
      return Array.isArray(raw)&&raw.length?raw.map(String):DOCK_DEFAULT_ORDER.slice();
    }catch{return DOCK_DEFAULT_ORDER.slice();}
  }

  function dockWriteOrder(dock,{custom=true}={}){
    if(!custom)return;
    try{
      const ids=[...dock.querySelectorAll('[data-mm-dock-id]')].map(el=>String(el.dataset.mmDockId||'')).filter(Boolean);
      localStorage.setItem(DOCK_ORDER_KEY,JSON.stringify(ids));
      localStorage.setItem(DOCK_ORDER_CUSTOM_KEY,'1');
    }catch{}
  }

  function dockReadFloatState(){
    try{
      const raw=JSON.parse(localStorage.getItem(DOCK_FLOAT_KEY)||'{}');
      return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    }catch{return {};}
  }

  function dockWriteFloatState(state){
    try{localStorage.setItem(DOCK_FLOAT_KEY,JSON.stringify(state||{}));}catch{}
  }

  function saveLauncherFloat(key,value){
    const state=dockReadFloatState();
    if(value&&value.floating){
      state[key]={
        floating:true,
        left:Math.round(Number(value.left)||0),
        top:Math.round(Number(value.top)||0)
      };
    }else{
      delete state[key];
    }
    dockWriteFloatState(state);
  }

  function applyDefaultDockLayoutOnce(){
    try{
      if(localStorage.getItem(DOCK_DEFAULT_LAYOUT_KEY)===DOCK_DEFAULT_LAYOUT_REV)return false;
      // One-time migration for this layout revision: clear stale absolute
      // coordinates so docked launchers can follow Torn's live footer geometry.
      // After migration, deliberate user undock/reorder/move remains persistent.
      localStorage.removeItem(DOCK_FLOAT_KEY);
      localStorage.removeItem(DOCK_ORDER_KEY);
      localStorage.removeItem(DOCK_ORDER_CUSTOM_KEY);
      localStorage.setItem(DOCK_DEFAULT_LAYOUT_KEY,DOCK_DEFAULT_LAYOUT_REV);
      return true;
    }catch{return false;}
  }

  function injectDockStyle(){
    if(document.getElementById(DOCK_STYLE_ID))return;
    const style=document.createElement('style');
    style.id=DOCK_STYLE_ID;
    style.textContent=`
      #${DOCK_ID}{position:fixed;z-index:2147483645;display:flex;gap:${LAUNCHER_SNAP_GAP}px;align-items:flex-end;padding:0;pointer-events:auto;user-select:none}
      #${DOCK_ID}:empty{display:none}
      #${DOCK_ID} .mm-torn-dock-btn,.mm-torn-floating-btn{width:42px;height:42px;min-width:42px;min-height:42px;padding:0;margin:0;border:1px solid #25282b;border-bottom-color:#111;border-radius:3px;background:linear-gradient(180deg,color-mix(in srgb,var(--mm-accent) 72%,#555) 0%,color-mix(in srgb,var(--mm-accent) 54%,#252525) 58%,#242424 100%);box-shadow:inset 0 1px 0 #ffffff24,inset 0 -1px 0 #0009,0 1px 3px #0009;color:#d7e2e7;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:filter .12s ease,transform .12s ease,border-color .12s ease;user-select:none}
      #${DOCK_ID} .mm-torn-dock-btn:hover,.mm-torn-floating-btn:hover{filter:brightness(1.14);border-color:#666}
      #${DOCK_ID} .mm-torn-dock-btn:active,.mm-torn-floating-btn:active{transform:translateY(1px);filter:brightness(.92)}
      #${DOCK_ID} .mm-torn-dock-btn[data-mm-active="1"],.mm-torn-floating-btn[data-mm-active="1"]{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--mm-accent) 70%,#ddd),inset 0 -8px 18px #0005,0 1px 3px #0009}
      #${DOCK_ID} .mm-torn-dock-btn svg,.mm-torn-floating-btn svg{width:23px;height:23px;display:block;filter:drop-shadow(0 1px 1px #000);pointer-events:none}
      #${DOCK_ID} .mm-torn-dock-btn[draggable="true"]{touch-action:none}
      .mm-torn-floating-btn{position:fixed;z-index:2147483647;touch-action:none;cursor:grab}
      .mm-torn-floating-btn.mm-torn-moving{cursor:grabbing;filter:brightness(1.12)}
      @media(max-width:620px){
        #${DOCK_ID} .mm-torn-dock-btn,.mm-torn-floating-btn{width:38px;height:38px;min-width:38px;min-height:38px}
        #${DOCK_ID} .mm-torn-dock-btn svg,.mm-torn-floating-btn svg{width:21px;height:21px}
      }
    `;
    document.head.appendChild(style);
  }

  function visibleBottomToolbarCandidate(){
    const rawEntries=[...document.querySelectorAll('a,button,[role="button"]')]
      .filter(node=>node instanceof HTMLElement)
      .filter(node=>!node.closest('#'+DOCK_ID)&&!node.matches('[data-mm-dock-id]')&&!node.classList.contains('mm-torn-floating-btn'))
      .map(node=>({node,r:node.getBoundingClientRect()}))
      .filter(entry=>{
        const rr=entry.r;
        if(rr.width<28||rr.width>64||rr.height<28||rr.height>64)return false;
        if(rr.right<0||rr.left>window.innerWidth)return false;
        if(rr.bottom>window.innerHeight+3)return false;
        if(rr.bottom<window.innerHeight-72)return false;
        if(rr.top<window.innerHeight-120)return false;
        const cs=getComputedStyle(entry.node);
        return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0;
      });

    // Torn can expose both a visual control and a nested/overlaid button-like
    // element for the same footer icon. Collapse nearly identical geometry so
    // duplicate accessibility wrappers cannot split or outweigh the real row.
    const entries=[];
    for(const entry of rawEntries){
      const duplicate=entries.some(existing=>
        Math.abs(existing.r.left-entry.r.left)<=2&&
        Math.abs(existing.r.top-entry.r.top)<=2&&
        Math.abs(existing.r.width-entry.r.width)<=3&&
        Math.abs(existing.r.height-entry.r.height)<=3
      );
      if(!duplicate)entries.push(entry);
    }

    if(entries.length<4)return null;

    // Torn's footer icons are not consistently inside a fixed/sticky parent.
    // Cluster the actual visible controls by their bottom edge, then choose
    // the horizontally contiguous row nearest the viewport bottom. Bottom
    // proximity outranks row length so an upper action strip cannot steal the
    // dock merely because it exposes more nested controls.
    const byBottom=entries.slice().sort((a,b)=>a.r.bottom-b.r.bottom);
    const bands=[];
    for(const entry of byBottom){
      let band=bands.find(group=>Math.abs(group.bottom-entry.r.bottom)<=7);
      if(!band){
        band={bottom:entry.r.bottom,items:[]};
        bands.push(band);
      }
      band.items.push(entry);
      band.bottom=band.items.reduce((sum,item)=>sum+item.r.bottom,0)/band.items.length;
    }

    const candidates=[];
    for(const band of bands){
      const sorted=band.items.slice().sort((a,b)=>a.r.left-b.r.left);
      let run=[];
      const flush=()=>{
        if(run.length<4){run=[];return;}
        const controls=run.slice();
        const first=controls[0];
        const last=controls[controls.length-1];
        const bottoms=controls.map(entry=>entry.r.bottom).sort((a,b)=>a-b);
        const tops=controls.map(entry=>entry.r.top).sort((a,b)=>a-b);
        const heights=controls.map(entry=>entry.r.height).sort((a,b)=>a-b);
        const rowBottom=bottoms[Math.floor(bottoms.length/2)];
        const rowTop=tops[Math.floor(tops.length/2)];
        const widths=controls.map(entry=>entry.r.width).sort((a,b)=>a-b);
        const nativeHeight=heights[Math.floor(heights.length/2)]||first.r.height;
        const nativeWidth=widths[Math.floor(widths.length/2)]||first.r.width;
        const squareError=Math.abs(nativeWidth-nativeHeight);
        const gaps=[];
        for(let i=1;i<controls.length;i++){
          const gap=controls[i].r.left-controls[i-1].r.right;
          if(gap>=-2&&gap<=16)gaps.push(Math.max(0,gap));
        }
        const nativeGap=gaps.length?gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:LAUNCHER_SNAP_GAP;
        candidates.push({
          el:first.node.parentElement||first.node,
          r:{left:first.r.left,top:Math.min(...controls.map(e=>e.r.top)),right:last.r.right,bottom:Math.max(...controls.map(e=>e.r.bottom)),width:last.r.right-first.r.left,height:Math.max(...controls.map(e=>e.r.bottom))-Math.min(...controls.map(e=>e.r.top))},
          controls,
          firstRect:first.r,
          rowTop,
          rowBottom,
          bottomDistance:Math.abs(window.innerHeight-rowBottom),
          rightEdgeDistance:Math.abs(window.innerWidth-last.r.right),
          squareError,
          nativeGap:clamp(nativeGap,2,8),
          nativeHeight
        });
        run=[];
      };
      for(const entry of sorted){
        if(!run.length){run=[entry];continue;}
        const prev=run[run.length-1];
        const gap=entry.r.left-prev.r.right;
        if(gap>=-2&&gap<=18)run.push(entry);
        else{flush();run=[entry];}
      }
      flush();
    }

    if(!candidates.length)return null;

    // Torn's native footer is the bottom-right icon row. On Factions/Forums,
    // page-level action controls can occupy the same bottom band, so treating
    // "most controls" as the next tie-breaker can anchor the MM dock to page
    // content and overlap Torn chat. Consider rows within 8px of the lowest
    // candidate equivalent, then prefer the row nearest the viewport's right
    // edge and with square, Torn-sized controls.
    const minBottomDistance=Math.min(...candidates.map(candidate=>candidate.bottomDistance));
    const bottomPeers=candidates.filter(candidate=>candidate.bottomDistance<=minBottomDistance+8);
    bottomPeers.sort((a,b)=>
      a.rightEdgeDistance-b.rightEdgeDistance||
      a.squareError-b.squareError||
      Math.abs(a.nativeHeight-42)-Math.abs(b.nativeHeight-42)||
      a.bottomDistance-b.bottomDistance||
      b.controls.length-a.controls.length
    );
    const selected=bottomPeers[0]||null;
    if(selected)selected.candidateCount=candidates.length;
    return selected;
  }

  function launcherRect(node,rect=null){
    const r=rect||node?.getBoundingClientRect?.();
    if(!r||r.width<=0||r.height<=0)return null;
    return {node,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
  }

  function launcherObstacleRects(button){
    const out=[];const seen=new Set();
    const push=(node,rect=null)=>{
      if(!node||node===button||seen.has(node))return;
      const r=launcherRect(node,rect);if(!r)return;
      seen.add(node);out.push(r);
    };

    document.querySelectorAll('[data-mm-dock-id]').forEach(node=>push(node));
    const native=visibleBottomToolbarCandidate();
    for(const entry of native?.controls||[])push(entry.node,entry.r);
    return out;
  }

  function launcherTooClose(left,top,width,height,obstacle,gap=LAUNCHER_SNAP_GAP){
    return left<obstacle.right+gap&&left+width+gap>obstacle.left
      &&top<obstacle.bottom+gap&&top+height+gap>obstacle.top;
  }

  function resolveLauncherPosition(button,left,top,{obstacles=null,snap=true}={}){
    const width=button?.offsetWidth||42;
    const height=button?.offsetHeight||42;
    const maxLeft=Math.max(LAUNCHER_EDGE_MARGIN,window.innerWidth-width-LAUNCHER_EDGE_MARGIN);
    const maxTop=Math.max(LAUNCHER_EDGE_MARGIN,window.innerHeight-height-LAUNCHER_EDGE_MARGIN);
    const raw={
      left:clamp(left,LAUNCHER_EDGE_MARGIN,maxLeft),
      top:clamp(top,LAUNCHER_EDGE_MARGIN,maxTop)
    };
    const obs=Array.isArray(obstacles)?obstacles:launcherObstacleRects(button);
    const free=point=>!obs.some(o=>launcherTooClose(point.left,point.top,width,height,o));
    const colliding=obs.filter(o=>launcherTooClose(raw.left,raw.top,width,height,o));
    const candidates=[];

    const add=(leftValue,topValue,kind='icon')=>{
      const point={
        left:clamp(leftValue,LAUNCHER_EDGE_MARGIN,maxLeft),
        top:clamp(topValue,LAUNCHER_EDGE_MARGIN,maxTop),
        kind
      };
      point.distance=Math.hypot(point.left-raw.left,point.top-raw.top);
      if(free(point))candidates.push(point);
    };

    const native=visibleBottomToolbarCandidate();
    const nativeRowTop=native
      ? clamp((native.rowBottom??native.firstRect.bottom)-height,LAUNCHER_EDGE_MARGIN,maxTop)
      : maxTop;
    if(snap&&Math.abs(raw.top-nativeRowTop)<=LAUNCHER_SNAP_DISTANCE)add(raw.left,nativeRowTop,'bottom');

    for(const o of obs){
      const alignedTop=clamp(o.bottom-height,LAUNCHER_EDGE_MARGIN,maxTop);
      const centerLeft=o.left+(o.width-width)/2;
      const nearHorizontal=raw.top<o.bottom+LAUNCHER_SNAP_DISTANCE&&raw.top+height>o.top-LAUNCHER_SNAP_DISTANCE;
      const nearVertical=raw.left<o.right+LAUNCHER_SNAP_DISTANCE&&raw.left+width>o.left-LAUNCHER_SNAP_DISTANCE;
      const force=colliding.includes(o);

      if(force||(snap&&nearHorizontal&&Math.abs((raw.left+width)-o.left)<=LAUNCHER_SNAP_DISTANCE))
        add(o.left-width-LAUNCHER_SNAP_GAP,alignedTop);
      if(force||(snap&&nearHorizontal&&Math.abs(raw.left-o.right)<=LAUNCHER_SNAP_DISTANCE))
        add(o.right+LAUNCHER_SNAP_GAP,alignedTop);
      if(force||(snap&&nearVertical&&Math.abs((raw.top+height)-o.top)<=LAUNCHER_SNAP_DISTANCE))
        add(centerLeft,o.top-height-LAUNCHER_SNAP_GAP);
      if(force||(snap&&nearVertical&&Math.abs(raw.top-o.bottom)<=LAUNCHER_SNAP_DISTANCE))
        add(centerLeft,o.bottom+LAUNCHER_SNAP_GAP);
    }

    if(!colliding.length&&free(raw)){
      const nearby=candidates.filter(point=>point.distance<=LAUNCHER_SNAP_DISTANCE);
      if(!nearby.length)return raw;
      nearby.sort((a,b)=>a.distance-b.distance||(a.kind==='bottom'?-1:1));
      return {left:nearby[0].left,top:nearby[0].top};
    }

    if(candidates.length){
      candidates.sort((a,b)=>a.distance-b.distance);
      return {left:candidates[0].left,top:candidates[0].top};
    }

    const step=Math.max(width,height)+LAUNCHER_SNAP_GAP;
    for(let ring=1;ring<=8;ring++){
      for(const [dx,dy] of [[-ring*step,0],[ring*step,0],[0,-ring*step],[0,ring*step]]){
        const point={
          left:clamp(raw.left+dx,LAUNCHER_EDGE_MARGIN,maxLeft),
          top:clamp(raw.top+dy,LAUNCHER_EDGE_MARGIN,maxTop)
        };
        if(free(point))return point;
      }
    }
    return raw;
  }

  function positionDock(){
    const dock=document.getElementById(DOCK_ID);
    if(!dock||!dock.children.length)return;
    const native=visibleBottomToolbarCandidate();

    if(native){
      const first=native.firstRect;
      const nativeGap=clamp(Number(native.nativeGap)||LAUNCHER_SNAP_GAP,2,8);
      const gap=Math.max(NATIVE_DOCK_CLEARANCE,nativeGap);
      const desiredLeft=first.left-dock.offsetWidth-gap;
      const desiredTop=(native.rowBottom??first.bottom)-dock.offsetHeight;

      dock.style.right='auto';
      dock.style.bottom='auto';

      if(desiredLeft>=4){
        // Exact target: immediately left of Torn's first native button, same bottom edge.
        dock.style.left=Math.round(desiredLeft)+'px';
        dock.style.top=Math.round(clamp(desiredTop,4,window.innerHeight-dock.offsetHeight))+'px';
      }else{
        // Narrow-screen fallback: same left edge as Torn, one native-button row above.
        dock.style.left=Math.max(4,Math.round(first.left))+'px';
        const aboveTop=first.top-dock.offsetHeight-gap;
        dock.style.top=Math.round(clamp(aboveTop,4,window.innerHeight-dock.offsetHeight))+'px';
      }
    }else{
      dock.style.right='6px';
      dock.style.left='auto';
      dock.style.top='auto';
      dock.style.bottom='6px';
    }

    // Keep exact live geometry inspectable from the normal browser console.
    requestAnimationFrame(()=>{
      const r=dock.getBoundingClientRect();
      dock.dataset.mmDockLeft=String(Math.round(r.left));
      dock.dataset.mmDockNativeClearance=String(native?Math.max(NATIVE_DOCK_CLEARANCE,clamp(Number(native.nativeGap)||LAUNCHER_SNAP_GAP,2,8)):0);
      dock.dataset.mmDockTop=String(Math.round(r.top));
      dock.dataset.mmDockRight=String(Math.round(r.right));
      dock.dataset.mmDockBottom=String(Math.round(r.bottom));
      if(native?.firstRect){
        dock.dataset.mmNativeFirstLeft=String(Math.round(native.firstRect.left));
        dock.dataset.mmNativeRowBottom=String(Math.round(native.rowBottom??native.firstRect.bottom));
        dock.dataset.mmNativeRightEdgeDistance=String(Math.round(native.rightEdgeDistance??0));
        dock.dataset.mmNativeCandidateCount=String(Number(native.candidateCount||1));
        dock.dataset.mmNativeControlCount=String(native.controls?.length||0);
      }else{
        delete dock.dataset.mmNativeFirstLeft;
        delete dock.dataset.mmNativeRowBottom;
        delete dock.dataset.mmNativeRightEdgeDistance;
        delete dock.dataset.mmNativeCandidateCount;
        delete dock.dataset.mmNativeControlCount;
      }
    });
  }

  function applyDockOrder(dock){
    const order=dockReadOrder();
    const rank=new Map(order.map((id,index)=>[id,index]));
    const buttons=[...dock.querySelectorAll('[data-mm-dock-id]')];
    const fallback=dockHasCustomOrder()?999:-1;
    buttons.sort((a,b)=>(rank.get(a.dataset.mmDockId)??fallback)-(rank.get(b.dataset.mmDockId)??fallback));
    for(const b of buttons)dock.appendChild(b);
  }

  function pointNearDock(x,y,padding=18){
    const dock=document.getElementById(DOCK_ID);
    if(!dock)return false;
    const r=dock.getBoundingClientRect();
    return x>=r.left-padding&&x<=r.right+padding&&y>=r.top-padding&&y<=r.bottom+padding;
  }

  function setLauncherTitle(button,label,floating){
    const base=String(label||button.dataset.mmDockId||'MM Torn module');
    button.title=floating
      ? base+' · drag to move · drag onto dock or right-click to redock'
      : base+' · drag to reorder · pull away to undock · right-click to undock';
    button.setAttribute('aria-label',base);
  }

  function dockLauncher(button,key,{persist=true}={}){
    const dock=ensureDock();
    if(!dock||!button)return;
    button.classList.remove('mm-torn-floating-btn','mm-torn-moving');
    button.classList.add('mm-torn-dock-btn');
    button.dataset.mmFloating='0';
    button.draggable=true;
    button.style.position='';
    button.style.left='';
    button.style.top='';
    button.style.right='';
    button.style.bottom='';
    button.style.zIndex='';
    dock.appendChild(button);
    setLauncherTitle(button,button.__mmLabel||key,false);
    if(persist)saveLauncherFloat(key,null);
    applyDockOrder(dock);
    if(persist)dockWriteOrder(dock,{custom:true});
    requestAnimationFrame(positionDock);
  }

  function undockLauncher(button,key,{left,top,persist=true}={}){
    if(!button||typeof document==='undefined'||!document.body)return;
    const dock=document.getElementById(DOCK_ID);
    const rect=button.getBoundingClientRect();
    if(dock&&button.parentElement===dock)dockWriteOrder(dock,{custom:true});
    document.body.appendChild(button);
    button.classList.remove('mm-torn-dock-btn');
    button.classList.add('mm-torn-floating-btn');
    button.dataset.mmFloating='1';
    button.draggable=false;
    const resolved=resolveLauncherPosition(button,left??rect.left,top??rect.top,{snap:true});
    const nextLeft=resolved.left;
    const nextTop=resolved.top;
    button.style.position='fixed';
    button.style.left=Math.round(nextLeft)+'px';
    button.style.top=Math.round(nextTop)+'px';
    button.style.right='auto';
    button.style.bottom='auto';
    button.style.zIndex='2147483647';
    setLauncherTitle(button,button.__mmLabel||key,true);
    if(persist)saveLauncherFloat(key,{floating:true,left:nextLeft,top:nextTop});
    requestAnimationFrame(positionDock);
  }

  function installFloatingLauncherDrag(button,key){
    if(button.__mmFloatDragInstalled)return;
    button.__mmFloatDragInstalled=true;
    button.addEventListener('pointerdown',event=>{
      if(button.dataset.mmFloating!=='1'||event.button!==0)return;
      const rect=button.getBoundingClientRect();
      const state={
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        left:rect.left,
        top:rect.top,
        moved:false,
        obstacles:launcherObstacleRects(button)
      };
      button.__mmFloatPointer=state;
      try{button.setPointerCapture(event.pointerId);}catch{}
    });
    button.addEventListener('pointermove',event=>{
      const state=button.__mmFloatPointer;
      if(!state||state.pointerId!==event.pointerId||button.dataset.mmFloating!=='1')return;
      const dx=event.clientX-state.startX;
      const dy=event.clientY-state.startY;
      if(!state.moved&&Math.hypot(dx,dy)<4)return;
      state.moved=true;
      button.classList.add('mm-torn-moving');
      const resolved=resolveLauncherPosition(button,state.left+dx,state.top+dy,{obstacles:state.obstacles,snap:true});
      button.style.left=Math.round(resolved.left)+'px';
      button.style.top=Math.round(resolved.top)+'px';
      event.preventDefault();
    });
    const finish=event=>{
      const state=button.__mmFloatPointer;
      if(!state||state.pointerId!==event.pointerId)return;
      button.__mmFloatPointer=null;
      button.classList.remove('mm-torn-moving');
      try{button.releasePointerCapture(event.pointerId);}catch{}
      if(!state.moved)return;
      button.__mmSuppressClick=true;
      const rect=button.getBoundingClientRect();
      const resolved=resolveLauncherPosition(button,rect.left,rect.top,{snap:true});
      button.style.left=Math.round(resolved.left)+'px';
      button.style.top=Math.round(resolved.top)+'px';
      const cx=resolved.left+rect.width/2;
      const cy=resolved.top+rect.height/2;
      if(pointNearDock(cx,cy,26)){
        dockLauncher(button,key);
      }else{
        saveLauncherFloat(key,{floating:true,left:resolved.left,top:resolved.top});
      }
    };
    button.addEventListener('pointerup',finish);
    button.addEventListener('pointercancel',finish);
    button.addEventListener('click',event=>{
      if(!button.__mmSuppressClick)return;
      button.__mmSuppressClick=false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
  }

  function redockCanonicalLaunchersForMigration(dock){
    if(!dock)return;
    const canonical=new Set(DOCK_CANONICAL_VISIBLE);
    document.querySelectorAll('[data-mm-dock-id]').forEach(button=>{
      const key=String(button.dataset.mmDockId||'');
      if(!canonical.has(key))return;
      button.classList.remove('mm-torn-floating-btn','mm-torn-moving');
      button.classList.add('mm-torn-dock-btn');
      button.dataset.mmFloating='0';
      button.draggable=true;
      button.style.position='';
      button.style.left='';
      button.style.top='';
      button.style.right='';
      button.style.bottom='';
      button.style.zIndex='';
      dock.appendChild(button);
      setLauncherTitle(button,button.__mmLabel||key,false);
    });
    applyDockOrder(dock);
  }

  function ensureDock(){
    if(typeof document==='undefined'||!document.body)return null;
    const migrated=applyDefaultDockLayoutOnce();
    injectDockStyle();
    let dock=document.getElementById(DOCK_ID);
    if(!dock){
      dock=document.createElement('div');
      dock.id=DOCK_ID;
      dock.setAttribute('aria-label','MM Torn module dock');
      document.body.appendChild(dock);
      dock.addEventListener('dragover',event=>event.preventDefault());
      dock.addEventListener('drop',event=>{
        event.preventDefault();
        const sourceId=String(event.dataTransfer?.getData('text/mm-dock-id')||'');
        const source=document.querySelector('[data-mm-dock-id="'+CSS.escape(sourceId)+'"]');
        const target=event.target?.closest?.('[data-mm-dock-id]');
        if(!source)return;
        if(source.dataset.mmFloating==='1')dockLauncher(source,sourceId);
        if(target&&target!==source&&target.parentElement===dock)dock.insertBefore(source,target);
        else if(source.parentElement===dock)dock.appendChild(source);
        dockWriteOrder(dock,{custom:true});
        positionDock();
      });
      window.addEventListener('resize',()=>{
        positionDock();
        document.querySelectorAll('.mm-torn-floating-btn[data-mm-dock-id]').forEach(button=>{
          const rect=button.getBoundingClientRect();
          const resolved=resolveLauncherPosition(button,rect.left,rect.top,{snap:true});
          button.style.left=Math.round(resolved.left)+'px';
          button.style.top=Math.round(resolved.top)+'px';
          saveLauncherFloat(String(button.dataset.mmDockId||''),{floating:true,left:resolved.left,top:resolved.top});
        });
      },{passive:true});
    }

    if(migrated)redockCanonicalLaunchersForMigration(dock);

    // This bridge is installed even when an older cached core created the shared
    // dock first. That keeps Trade Rotation reorder/drag actions persistent too.
    delete dock.dataset.mmAlpha9PersistenceBridge;
    dock.dataset.mmCoreVersion=CORE_VERSION;
    dock.dataset.mmDockMode='relative-native-row';
    dock.dataset.mmLayoutRevision=DOCK_DEFAULT_LAYOUT_REV;
    dock.dataset.mmDockAnchor='left-of-torn-native-bottom-toolbar';
    dock.dataset.mmDefaultRightToLeft='trade-reminder,armory,customers,acquisitions,inventory-roi';
    if(dock.dataset.mmAlpha10PersistenceBridge!=='1'){
      dock.dataset.mmAlpha10PersistenceBridge='1';
      const persistUserOrder=()=>setTimeout(()=>{
        if(document.body.contains(dock))dockWriteOrder(dock,{custom:true});
      },0);
      dock.addEventListener('drop',persistUserOrder);
      dock.addEventListener('dragend',persistUserOrder,true);
    }

    requestAnimationFrame(positionDock);
    return dock;
  }

  function registerDockLauncher({id,label,accent,icon,onClick,element}={}){
    const dock=ensureDock();
    if(!dock)return null;
    const key=String(id||'').trim();
    if(!key)throw new Error('Dock launcher id is required.');
    let button=element instanceof HTMLElement?element:document.querySelector('[data-mm-dock-id="'+CSS.escape(key)+'"]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      dock.appendChild(button);
    }
    const meta=DOCK_META[key]||{};
    const displayLabel=String(label||meta.label||key);
    button.className='mm-torn-dock-btn';
    button.dataset.mmDockId=key;
    button.__mmLabel=displayLabel;
    button.style.setProperty('--mm-accent',accent||meta.accent||'#59636d');
    button.innerHTML=String(icon||meta.icon||'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>');
    setLauncherTitle(button,displayLabel,false);

    if(typeof onClick==='function'){
      if(button.__mmDockClick)button.removeEventListener('click',button.__mmDockClick);
      button.__mmDockClick=onClick;
      button.addEventListener('click',onClick);
    }

    if(!button.__mmDockDrag){
      button.__mmDockDrag=true;
      button.addEventListener('dragstart',event=>{
        if(button.dataset.mmFloating==='1'){event.preventDefault();return;}
        try{
          event.dataTransfer.setData('text/mm-dock-id',key);
          event.dataTransfer.effectAllowed='move';
        }catch{}
      });
      button.addEventListener('dragend',event=>{
        const dockNow=document.getElementById(DOCK_ID);
        if(button.dataset.mmFloating==='1')return;
        const x=Number(event.clientX)||0;
        const y=Number(event.clientY)||0;
        if(x>0&&y>0&&dockNow){
          const r=dockNow.getBoundingClientRect();
          const inside=x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8;
          if(!inside){
            undockLauncher(button,key,{left:x-(button.offsetWidth||42)/2,top:y-(button.offsetHeight||42)/2});
            return;
          }
        }
        dockWriteOrder(dockNow||dock,{custom:true});
        positionDock();
      });
      button.addEventListener('contextmenu',event=>{
        event.preventDefault();
        if(button.dataset.mmFloating==='1')dockLauncher(button,key);
        else{
          const r=button.getBoundingClientRect();
          undockLauncher(button,key,{left:r.left,top:r.top});
        }
      });
      installFloatingLauncherDrag(button,key);
    }

    const floatState=dockReadFloatState()[key];
    if(floatState?.floating){
      undockLauncher(button,key,{left:floatState.left,top:floatState.top,persist:false});
    }else{
      if(button.parentElement!==dock)dock.appendChild(button);
      dockLauncher(button,key,{persist:false});
    }
    applyDockOrder(dock);
    requestAnimationFrame(positionDock);
    return button;
  }

  function setDockLauncherActive(id,active){
    const button=document.querySelector('[data-mm-dock-id="'+CSS.escape(String(id||''))+'"]');
    if(button)button.dataset.mmActive=active?'1':'0';
  }

  function panelPositionKey(key){
    return PANEL_POSITION_PREFIX+String(key||'panel');
  }

  function readPanelPosition(key){
    try{
      const raw=JSON.parse(localStorage.getItem(panelPositionKey(key))||'null');
      return raw&&Number.isFinite(Number(raw.left))&&Number.isFinite(Number(raw.top))
        ?{left:Number(raw.left),top:Number(raw.top)}:null;
    }catch{return null;}
  }

  function writePanelPosition(key,value){
    try{
      if(value)localStorage.setItem(panelPositionKey(key),JSON.stringify({left:Math.round(value.left),top:Math.round(value.top)}));
      else localStorage.removeItem(panelPositionKey(key));
    }catch{}
  }

  function applyPanelPosition(panel,key,defaults={}){
    const saved=readPanelPosition(key);
    if(saved){
      const maxLeft=Math.max(4,window.innerWidth-panel.offsetWidth-4);
      const maxTop=Math.max(4,window.innerHeight-42);
      panel.style.left=Math.round(clamp(saved.left,4,maxLeft))+'px';
      panel.style.top=Math.round(clamp(saved.top,4,maxTop))+'px';
      panel.style.right='auto';
      panel.style.bottom='auto';
      return;
    }
    panel.style.left='';
    panel.style.bottom='';
    panel.style.right=defaults.right??'';
    panel.style.top=defaults.top??'';
  }

  function makePanelDraggable(panel,handle,key,defaults={}){
    if(!(panel instanceof HTMLElement))return false;
    const grip=typeof handle==='string'?panel.querySelector(handle):handle;
    if(!(grip instanceof HTMLElement))return false;
    if(typeof panel.__mmPanelDragCleanup==='function')panel.__mmPanelDragCleanup();

    applyPanelPosition(panel,key,defaults);
    grip.style.cursor='move';
    grip.title='Drag to move · double-click header to reset position';

    const interactive=target=>Boolean(target?.closest?.('button,input,select,textarea,a,label,summary,[contenteditable="true"]'));
    let drag=null;

    const down=event=>{
      if(event.button!==0||interactive(event.target))return;
      const rect=panel.getBoundingClientRect();
      drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top,moved:false};
      try{grip.setPointerCapture(event.pointerId);}catch{}
    };
    const move=event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const dx=event.clientX-drag.startX;
      const dy=event.clientY-drag.startY;
      if(!drag.moved&&Math.hypot(dx,dy)<4)return;
      drag.moved=true;
      const maxLeft=Math.max(4,window.innerWidth-panel.offsetWidth-4);
      const maxTop=Math.max(4,window.innerHeight-42);
      panel.style.left=Math.round(clamp(drag.left+dx,4,maxLeft))+'px';
      panel.style.top=Math.round(clamp(drag.top+dy,4,maxTop))+'px';
      panel.style.right='auto';
      panel.style.bottom='auto';
      event.preventDefault();
    };
    const up=event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const moved=drag.moved;
      drag=null;
      try{grip.releasePointerCapture(event.pointerId);}catch{}
      if(moved){
        const rect=panel.getBoundingClientRect();
        writePanelPosition(key,{left:rect.left,top:rect.top});
      }
    };
    const reset=event=>{
      if(interactive(event.target))return;
      writePanelPosition(key,null);
      applyPanelPosition(panel,key,defaults);
    };
    const resize=()=>{
      const saved=readPanelPosition(key);
      if(!saved)return;
      const maxLeft=Math.max(4,window.innerWidth-panel.offsetWidth-4);
      const maxTop=Math.max(4,window.innerHeight-42);
      const left=clamp(parseFloat(panel.style.left)||saved.left,4,maxLeft);
      const top=clamp(parseFloat(panel.style.top)||saved.top,4,maxTop);
      panel.style.left=Math.round(left)+'px';
      panel.style.top=Math.round(top)+'px';
      writePanelPosition(key,{left,top});
    };

    grip.addEventListener('pointerdown',down);
    grip.addEventListener('pointermove',move);
    grip.addEventListener('pointerup',up);
    grip.addEventListener('pointercancel',up);
    grip.addEventListener('dblclick',reset);
    window.addEventListener('resize',resize,{passive:true});

    panel.__mmPanelDragCleanup=()=>{
      grip.removeEventListener('pointerdown',down);
      grip.removeEventListener('pointermove',move);
      grip.removeEventListener('pointerup',up);
      grip.removeEventListener('pointercancel',up);
      grip.removeEventListener('dblclick',reset);
      window.removeEventListener('resize',resize);
    };
    return true;
  }

  function adoptLegacyCrmLauncher(){
    const legacy=document.getElementById('mm-bazaar-crm-launcher');
    if(!legacy||legacy.dataset.mmDockId)return false;
    const existingClick=legacy.onclick;
    registerDockLauncher({
      id:'crm',
      element:legacy,
      label:'Legacy CRM',
      onClick:event=>{if(typeof existingClick==='function')existingClick.call(legacy,event);}
    });
    legacy.onclick=null;
    return true;
  }

  async function inspectLegacyState() {
    const state = await readLegacyState();
    const validation = validateLegacyState(state);
    return Object.freeze({
      coreVersion: CORE_VERSION,
      legacy: LEGACY,
      validation,
      summary: summarizeState(state),
      freshness: freshnessSnapshot(state)
    });
  }

  const api = Object.freeze({
    version: CORE_VERSION,
    legacy: LEGACY,
    domainPaths: DOMAIN_PATHS,
    writableDomainPaths: WRITABLE_DOMAIN_PATHS,
    validateLegacyState,
    summarizeState,
    freshnessSnapshot,
    getDomainSlice,
    applyDomainSlice,
    readLegacyState,
    inspectLegacyState,
    updateDomainState,
    notifyStateChanged,
    registerDockLauncher,
    setDockLauncherActive,
    positionDock,
    makePanelDraggable,
    adoptLegacyCrmLauncher,
    deepClone
  });

  if(typeof document!=='undefined'){
    const tryAdopt=()=>{try{adoptLegacyCrmLauncher();}catch{}};
    if(document.body){requestAnimationFrame(tryAdopt);setTimeout(tryAdopt,1200);}
    else window.addEventListener('DOMContentLoaded',()=>{requestAnimationFrame(tryAdopt);setTimeout(tryAdopt,1200);},{once:true});
  }

  Object.defineProperty(globalThis, 'MMTornCore', {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false
  });
})();


/* ===== TornPDA platform/state adapter ===== */

(() => {
  'use strict';

  const PDA_GM_PREFIX='mm_trade_manager_pda_gm_v1:';
  globalThis.__MM_TORN_PDA__=true;

  if(typeof globalThis.GM_getValue!=='function'){
    globalThis.GM_getValue=(key,def)=>{
      try{const raw=localStorage.getItem(PDA_GM_PREFIX+String(key));return raw==null?def:JSON.parse(raw);}catch{return def;}
    };
  }
  if(typeof globalThis.GM_setValue!=='function'){
    globalThis.GM_setValue=(key,value)=>{try{localStorage.setItem(PDA_GM_PREFIX+String(key),JSON.stringify(value));}catch{}};
  }
  if(typeof globalThis.GM_deleteValue!=='function'){
    globalThis.GM_deleteValue=key=>{try{localStorage.removeItem(PDA_GM_PREFIX+String(key));}catch{}};
  }

  if(typeof globalThis.GM_xmlhttpRequest!=='function'&&typeof PDA_httpGet!=='undefined'&&typeof PDA_httpGet==='function'){
    globalThis.GM_xmlhttpRequest=options=>{
      const opts=options&&typeof options==='object'?options:{};
      let aborted=false,settled=false,timer=null;
      const finish=(fn,arg)=>{if(settled||aborted)return;settled=true;if(timer)clearTimeout(timer);try{fn?.(arg);}catch{}};
      if(Number(opts.timeout||0)>0)timer=setTimeout(()=>finish(opts.ontimeout,{status:0,statusText:'timeout',responseText:''}),Number(opts.timeout));
      Promise.resolve().then(()=>PDA_httpGet(String(opts.url||''),opts.headers||{}))
        .then(response=>finish(opts.onload,response))
        .catch(error=>finish(opts.onerror,{status:0,statusText:String(error?.message||error||'request failed'),responseText:'',error}));
      return {abort(){aborted=true;if(timer)clearTimeout(timer);}};
    };
  }
})();

(() => {
  'use strict';
  const original=globalThis.MMTornCore;
  if(!original)return;

  const STORAGE_KEY='mm_trade_manager_pda_state_v1';
  const LOCAL_FALLBACK_KEY='mm_trade_manager_pda_state_local_v1';
  let cache=null,loadPromise=null,queue=Promise.resolve();
  const clone=value=>original.deepClone?original.deepClone(value):JSON.parse(JSON.stringify(value));

  function defaultState(){
    return {
      schema:11,
      customers:{},sales:{},coupons:{},refunds:{},subscribers:{},removedCustomers:{},notificationHistory:[],
      businessRules:{minRoiPct:0,minDemandPerDay:0,minPrice:0,maxPrice:100000000000,minAbsoluteProfit:0,minSellerCount:0,minConfidencePct:0,maxListingAgeSec:180,updatedAt:new Date().toISOString()},
      syncState:{},
      procurement:{acquisitions:[],watchlist:{},catalog:{},marketSnapshots:{},marketHistory:{},ranked:{settings:{}},pricelist:{items:{}}},
      operations:{},
      marketIntel:{settings:{bazaarExitHaircutPct:0},marketplace:{},details:{},traders:{},history:{},marketPulse:{settings:{},items:{}}},
      travelIntel:{rows:[],history:{},settings:{}},
      factionInventory:{current:{},snapshots:[],memberReadiness:{roster:{},profiles:{}}},
      meta:{platform:'tornpda',createdAt:new Date().toISOString()}
    };
  }

  async function nativeGet(){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.get==='function')return await PDA_storage.get(STORAGE_KEY,null);
    try{const raw=localStorage.getItem(LOCAL_FALLBACK_KEY);return raw?JSON.parse(raw):null;}catch{return null;}
  }
  async function nativeSet(value){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.set==='function'){await PDA_storage.set(STORAGE_KEY,value);return;}
    localStorage.setItem(LOCAL_FALLBACK_KEY,JSON.stringify(value));
  }
  async function ensureState(){
    if(cache)return cache;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      let loaded=null;try{loaded=await nativeGet();}catch{}
      const validation=loaded?original.validateLegacyState(loaded):{ok:false};
      cache=validation.ok?loaded:defaultState();
      if(!validation.ok){try{await nativeSet(cache);}catch(error){console.warn('[MM Trade Manager PDA] initial state persistence failed',error);}}
      return cache;
    })();
    try{return await loadPromise;}finally{loadPromise=null;}
  }
  async function readLegacyState(){return clone(await ensureState());}
  async function ensureSharedState(){return readLegacyState();}
  async function updateDomainState(domain,updater){
    const run=async()=>{
      const latest=clone(await ensureState());
      const validation=original.validateLegacyState(latest);
      if(!validation.ok)throw new Error('PDA state failed validation: '+validation.errors.join('; '));
      const key=String(domain||'').toLowerCase();
      const draft=original.getDomainSlice(latest,key);
      const maybeNext=updater(draft);
      if(maybeNext&&typeof maybeNext.then==='function')throw new Error('Domain updater must be synchronous.');
      const nextSlice=maybeNext===undefined?draft:maybeNext;
      const merged=original.applyDomainSlice(latest,key,nextSlice);
      cache=merged;await nativeSet(merged);
      try{original.notifyStateChanged?.(key);}catch{}
      return clone(merged);
    };
    const current=queue.then(run,run);queue=current.catch(()=>{});return current;
  }
  async function inspectLegacyState(){
    const state=await readLegacyState();
    return Object.freeze({coreVersion:String(original.version||'')+'-pda',platform:'tornpda',storage:typeof PDA_storage!=='undefined'&&PDA_storage?'PDA_storage':'localStorage-fallback',validation:original.validateLegacyState(state),summary:original.summarizeState(state),freshness:original.freshnessSnapshot(state)});
  }

  const api=Object.freeze({...original,version:String(original.version||'')+'-pda',readLegacyState,ensureSharedState,updateDomainState,inspectLegacyState});
  Object.defineProperty(globalThis,'MMTornCore',{value:api,configurable:true,enumerable:false,writable:false});
})();

/* ===== Inventory FIFO logic (bundled) ===== */

(() => {
  'use strict';

  const BAZAAR_SELL_LOG_ID=1226;
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const asId=v=>String(v??'').trim();
  const nowIso=()=>new Date().toISOString();
  function ensureInventorySlice(slice={}){
    const out=slice&&typeof slice==='object'?slice:{};
    out.sales=out.sales&&typeof out.sales==='object'&&!Array.isArray(out.sales)?out.sales:{};
    out.operations=out.operations&&typeof out.operations==='object'&&!Array.isArray(out.operations)?out.operations:{};
    out.operations.inventoryRoi=out.operations.inventoryRoi&&typeof out.operations.inventoryRoi==='object'&&!Array.isArray(out.operations.inventoryRoi)?out.operations.inventoryRoi:{};
    const inv=out.operations.inventoryRoi;
    inv.listings=inv.listings&&typeof inv.listings==='object'&&!Array.isArray(inv.listings)?inv.listings:{};
    inv.inventory=inv.inventory&&typeof inv.inventory==='object'&&!Array.isArray(inv.inventory)?inv.inventory:{};
    inv.listingPlans=inv.listingPlans&&typeof inv.listingPlans==='object'&&!Array.isArray(inv.listingPlans)?inv.listingPlans:{};
    return out;
  }

  function normalizeItems(rawItems,saleData={}){
    if(!rawItems)return [];
    let list=[];
    if(Array.isArray(rawItems))list=rawItems;
    else if(typeof rawItems==='object'){
      const single=['id','item_id','item','name','quantity','qty','price','cost','total'].some(k=>k in rawItems);
      list=single?[rawItems]:Object.entries(rawItems).map(([id,value])=>value&&typeof value==='object'?{id,...value}:{id,qty:value});
    }else list=[{id:rawItems}];

    const saleEach=Math.max(0,n(saleData.cost_each??saleData.price_each??saleData.unit_price));
    const saleTotal=Math.max(0,n(saleData.cost_total??saleData.total??saleData.price_total));

    const normalized=list.map(item=>{
      const id=asId(item?.id??item?.item_id??item?.item??'');
      const quantity=Math.max(1,n(item?.quantity??item?.qty)||1);
      const explicitPrice=Math.max(0,n(item?.price??item?.cost_each??item?.cost??item?.unit_price));
      const explicitTotal=Math.max(0,n(item?.total??item?.cost_total??item?.price_total));
      const price=explicitPrice||saleEach||(explicitTotal&&quantity?explicitTotal/quantity:0);
      return {
        id,uid:item?.uid??item?.UID??null,
        name:String(item?.name??item?.item_name??(id?'Item '+id:'Item')),
        quantity,price:Math.round(price),total:Math.round(explicitTotal||(price*quantity))
      };
    });
    if(normalized.length===1&&saleTotal>0){
      normalized[0].total=Math.round(saleTotal);
      normalized[0].price=normalized[0].quantity?Math.round(saleTotal/normalized[0].quantity):normalized[0].price;
    }
    return normalized;
  }

  function extractLogTypeId(entry){
    return n(entry?.details?.id??entry?.details?.log_id??entry?.log_id??entry?.type_id??entry?.type);
  }

  function actorIdentity(value,fallbackName=''){
    if(value&&typeof value==='object'){
      const id=asId(value.id??value.user_id??value.player_id??value.torn_id??value.ID??'');
      const name=String(value.name??value.username??value.player_name??value.user_name??fallbackName??id).trim();
      return {id,name};
    }
    const id=asId(value);
    return {id,name:String(fallbackName||id).trim()};
  }

  function extractBazaarSale(entry){
    if(!entry)return null;
    const typeId=extractLogTypeId(entry);
    if(typeId&&typeId!==BAZAAR_SELL_LOG_ID)return null;
    const data=entry.data&&typeof entry.data==='object'?entry.data:{};
    const buyer=actorIdentity(
      data.buyer??data.buyer_id??data.user??data.user_id??data.player??data.player_id??data.customer??null,
      data.buyer_name??data.user_name??data.player_name??data.customer_name??''
    );
    const saleId=String(entry.id??entry.log_id??entry.uuid??'').trim();
    if(!saleId||!buyer.id||buyer.id==='[object Object]')return null;

    let rawItems=data.items??null;
    if(!rawItems&&data.item&&typeof data.item==='object')rawItems=data.item;
    if(!rawItems&&(data.item_id!=null||(data.item!=null&&typeof data.item!=='object'))){
      rawItems=[{
        id:data.item_id??data.item,name:data.item_name,
        quantity:data.quantity??data.qty??1,price:data.price??data.cost_each??data.unit_price??0,
        total:data.cost_total??data.total??data.cost??0
      }];
    }
    const items=normalizeItems(rawItems,data);
    const unitsFromItems=items.reduce((sum,item)=>sum+Math.max(0,n(item.quantity)),0);
    const units=unitsFromItems||Math.max(1,n(data.quantity??data.qty)||1);
    const costTotal=Math.max(0,n(data.cost_total??data.total??data.price_total));
    const costEach=Math.max(0,n(data.cost_each??data.price_each??data.unit_price??data.price));
    const itemTotal=items.reduce((sum,item)=>sum+Math.max(0,n(item.total)),0);
    const total=Math.round(costTotal||(costEach*units)||itemTotal);
    let timestamp=n(entry.timestamp??entry.time??entry.created_at);
    if(timestamp>0&&timestamp<100_000_000_000)timestamp*=1000;
    if(!timestamp)return null;
    return {id:saleId,playerId:buyer.id,playerName:buyer.name||buyer.id,timestamp,total,units,items,sourceLogType:BAZAAR_SELL_LOG_ID};
  }

  function importSalesEntries(slice,entries=[]){
    ensureInventorySlice(slice);
    let imported=0,rejected=0,checked=0;
    const sorted=[...(entries||[])].sort((a,b)=>n(a?.timestamp)-n(b?.timestamp));
    for(const entry of sorted){
      checked++;
      const sale=extractBazaarSale(entry);
      if(!sale){rejected++;continue;}
      if(slice.sales[sale.id])continue;
      slice.sales[sale.id]=sale;
      imported++;
    }
    slice.operations.inventoryRoi.lastSalesAt=nowIso();
    slice.operations.inventoryRoi.lastSalesResult={imported,rejected,checked};
    return {slice,imported,rejected,checked};
  }

  function parseStackableRows(raw){
    if(!raw)return {};
    let rows=raw;
    if(!Array.isArray(rows)&&typeof rows==='object'){
      rows=Object.entries(rows).map(([id,row])=>row&&typeof row==='object'?{id,...row}:{id,quantity:row});
    }
    if(!Array.isArray(rows))return {};
    const out={};
    for(const row of rows){
      const item=row?.item&&typeof row.item==='object'?row.item:{};
      const id=asId(row?.id??row?.ID??row?.item_id??item?.id??item?.ID);
      if(!id)continue;
      const quantity=Math.max(0,n(row?.quantity??row?.qty??row?.amount??row?.available??row?.count));
      const price=Math.max(0,n(row?.price??row?.cost??row?.listing_price));
      const name=String(row?.name??row?.item_name??item?.name??('Item '+id));
      if(!out[id])out[id]={id,name,quantity:0,price:0,listings:0};
      out[id].quantity+=quantity;
      if(price&&(!out[id].price||price<out[id].price))out[id].price=price;
      out[id].listings++;
    }
    return out;
  }

  function salesItemMetrics(slice,at=Date.now()){
    const cutoff30=Number(at)-30*86400000;
    const cutoff7=Number(at)-7*86400000;
    const metrics={};
    for(const sale of Object.values(slice?.sales||{})){
      const ts=n(sale.timestamp);
      for(const item of sale?.items||[]){
        const id=asId(item.id)||String(item.name||'').toLowerCase();
        if(!id)continue;
        const row=metrics[id]||(metrics[id]={
          id:item.id||'',name:String(item.name||'Item'),units7d:0,units30d:0,revenue30d:0,
          lastSaleAt:0,allUnits:0,allRevenue:0
        });
        const qty=Math.max(0,n(item.quantity));
        const total=Math.max(0,n(item.total)||n(item.price)*qty);
        row.allUnits+=qty;row.allRevenue+=total;row.lastSaleAt=Math.max(row.lastSaleAt,ts);
        if(ts>=cutoff30){row.units30d+=qty;row.revenue30d+=total;}
        if(ts>=cutoff7)row.units7d+=qty;
      }
    }
    for(const row of Object.values(metrics)){
      row.daily30=row.units30d/30;
      row.avgSoldPrice30=row.units30d?row.revenue30d/row.units30d:0;
      row.avgSoldPriceAll=row.allUnits?row.allRevenue/row.allUnits:0;
    }
    return metrics;
  }

  function listingRows(slice){
    ensureInventorySlice(slice);
    const bm=slice.operations.inventoryRoi;
    const metrics=salesItemMetrics(slice);
    const ids=new Set([...Object.keys(bm.listings||{}),...Object.keys(bm.inventory||{})]);
    const rows=[];
    for(const id of ids){
      const listing=bm.listings[id]||{};
      const inventory=bm.inventory[id]||{};
      const metric=metrics[id]||metrics[String(listing.name||inventory.name||'').toLowerCase()]||{};
      const bazaarQty=n(listing.quantity);
      const personalQty=n(inventory.quantity);
      const daily=n(metric.daily30);
      const targetListed=daily>0?Math.max(1,Math.ceil(daily*3)):0;
      const addToBazaar=Math.max(0,Math.min(personalQty,Math.max(0,targetListed-bazaarQty)));
      let action='HOLD';
      if(bazaarQty<=0&&personalQty>0&&daily>0)action='LIST';
      else if(addToBazaar>0)action='TOP UP';
      else if(bazaarQty>0&&daily<=0)action='REVIEW SLOW';
      else if(bazaarQty>0)action='HEALTHY';
      const price=n(listing.price)||Math.round(n(metric.avgSoldPrice30)||n(metric.avgSoldPriceAll));
      rows.push({
        id,name:String(listing.name||inventory.name||metric.name||('Item '+id)),
        bazaarQty,bazaarPrice:n(listing.price),personalQty,
        units7d:n(metric.units7d),units30d:n(metric.units30d),daily30:daily,
        avgSoldPrice30:n(metric.avgSoldPrice30),targetListed,addToBazaar,
        plannedPrice:price,action
      });
    }
    return rows.sort((a,b)=>{
      const pr={LIST:0,'TOP UP':1,HEALTHY:2,'REVIEW SLOW':3,HOLD:4};
      return (pr[a.action]??9)-(pr[b.action]??9)||b.daily30-a.daily30||a.name.localeCompare(b.name);
    });
  }

  function updateShopSnapshot(slice,{bazaar,inventory,at=nowIso()}={}){
    ensureInventorySlice(slice);
    const bm=slice.operations.inventoryRoi;
    if(bazaar!==undefined){bm.listings=parseStackableRows(bazaar);bm.lastBazaarAt=at;}
    if(inventory!==undefined){bm.inventory=parseStackableRows(inventory);bm.lastInventoryAt=at;}
    const plans={};
    for(const row of listingRows(slice)){
      plans[row.id]={...row,createdAt:at};
    }
    bm.listingPlans=plans;
    return slice;
  }

  function salesByItemDetailed(db,itemId){
    const id=asId(itemId);const out=[];
    for(const sale of Object.values(db?.sales||{})){
      for(const item of sale?.items||[]){
        if(asId(item.id)!==id)continue;
        out.push({saleId:String(sale.id||''),timestamp:n(sale.timestamp),quantity:n(item.quantity),unitPrice:n(item.price),total:n(item.total),customerId:asId(sale.playerId),customerName:String(sale.playerName||sale.playerId||'')});
      }
    }
    return out.sort((a,b)=>a.timestamp-b.timestamp);
  }

  function fifoLedger(db,itemId){
    const id=asId(itemId);
    const lots=(db?.procurement?.acquisitions||[])
      .filter(a=>asId(a.itemId)===id)
      .map(a=>({id:a.id,acquiredAt:Date.parse(a.acquiredAt||'')||0,quantity:n(a.quantity),remaining:n(a.quantity),unitCost:n(a.unitCost),source:String(a.source||''),sellerId:asId(a.sellerId||''),sellerName:String(a.sellerName||'')}))
      .filter(l=>l.quantity>0&&l.unitCost>=0).sort((a,b)=>a.acquiredAt-b.acquiredAt);
    let cursor=0;const saleRows=[];
    for(const sale of salesByItemDetailed(db,id)){
      let need=sale.quantity,cogs=0,matched=0;
      while(need>0&&cursor<lots.length){
        const lot=lots[cursor];if(lot.acquiredAt>sale.timestamp)break;
        const take=Math.min(need,lot.remaining);cogs+=take*lot.unitCost;matched+=take;lot.remaining-=take;need-=take;if(lot.remaining<=0)cursor++;
      }
      const matchedRevenue=sale.quantity>0?sale.total*matched/sale.quantity:0;
      saleRows.push({...sale,cogs,matchedUnits:matched,unmatchedUnits:Math.max(0,sale.quantity-matched),matchedRevenue,grossProfit:matchedRevenue-cogs});
    }
    const remainingLots=lots.filter(l=>l.remaining>0);
    const remainingCost=remainingLots.reduce((s,l)=>s+l.remaining*l.unitCost,0);
    const remainingQty=remainingLots.reduce((s,l)=>s+l.remaining,0);
    const now=Date.now();
    return {lots,remainingLots:remainingLots.map(l=>({...l,ageDays:l.acquiredAt?(now-l.acquiredAt)/86400000:0,value:l.remaining*l.unitCost})),remainingCost,remainingQty,saleRows};
  }

  function realizedProfitMetrics(db,itemId,days=30,at=Date.now()){
    const ledger=fifoLedger(db,itemId);const cutoff=Number(at)-Math.max(1,n(days))*86400000;
    const rows=ledger.saleRows.filter(s=>s.timestamp>=cutoff);
    const revenue=rows.reduce((s,r)=>s+n(r.total),0),matchedRevenue=rows.reduce((s,r)=>s+n(r.matchedRevenue),0),cogs=rows.reduce((s,r)=>s+n(r.cogs),0);
    const grossProfit=matchedRevenue-cogs,units=rows.reduce((s,r)=>s+n(r.quantity),0),matchedUnits=rows.reduce((s,r)=>s+n(r.matchedUnits),0);
    return {revenue,matchedRevenue,cogs,grossProfit,units,matchedUnits,unmatchedUnits:Math.max(0,units-matchedUnits),costCoveragePct:units>0?matchedUnits/units*100:100,realizedRoiPct:cogs>0?grossProfit/cogs*100:0,ledger};
  }

  function inventoryRoiRows(db,at=Date.now()){
    return listingRows(db).map(row=>{
      const realized=realizedProfitMetrics(db,row.id,30,at),basis=realized.ledger;
      const avgCost=basis.remainingQty>0?basis.remainingCost/basis.remainingQty:0;
      const exit=n(row.plannedPrice)||n(row.bazaarPrice)||n(row.avgSoldPrice30);
      const currentProfitPerUnit=avgCost>0&&exit>0?exit-avgCost:0;
      return {...row,avgCost,trackedRemainingQty:basis.remainingQty,trackedRemainingCost:basis.remainingCost,currentProfitPerUnit,currentRoiPct:avgCost>0?currentProfitPerUnit/avgCost*100:0,
        realizedRevenue30:realized.revenue,realizedCogs30:realized.cogs,realizedGrossProfit30:realized.grossProfit,realizedRoiPct30:realized.realizedRoiPct,costCoveragePct30:realized.costCoveragePct,matchedUnits30:realized.matchedUnits};
    });
  }

  const api=Object.freeze({
    BAZAAR_SELL_LOG_ID,
    ensureInventorySlice,normalizeItems,extractBazaarSale,importSalesEntries,
    parseStackableRows,salesItemMetrics,listingRows,updateShopSnapshot,
    salesByItemDetailed,fifoLedger,realizedProfitMetrics,inventoryRoiRows
  });

  Object.defineProperty(globalThis,'MMTornInventoryRoiLogic',{value:api,configurable:true,enumerable:false,writable:false});
})();

/* ===== Trade Manager logic (bundled) ===== */

(() => {
  'use strict';

  const MAX_TRADE_HISTORY=250;
  const MAX_RECONCILIATIONS=250;
  const DEFAULT_MARKET_MAX_AGE_MS=15*60*1000;
  const inventoryLogic=globalThis.MMTornInventoryRoiLogic||null;

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const asId=v=>String(v??'').trim();
  const epochMs=value=>{
    if(typeof value==='string'){
      const parsed=Date.parse(value);
      if(Number.isFinite(parsed)&&parsed>0)return parsed;
    }
    const raw=n(value);
    if(!(raw>0))return 0;
    return raw<100_000_000_000?raw*1000:raw;
  };
  const iso=value=>{
    const ms=epochMs(value);
    return ms?new Date(ms).toISOString():null;
  };
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function ensureTradeSlice(slice={}){
    const out=slice&&typeof slice==='object'?slice:{};
    out.operations=out.operations&&typeof out.operations==='object'&&!Array.isArray(out.operations)?out.operations:{};
    out.operations.tradeManager=out.operations.tradeManager&&typeof out.operations.tradeManager==='object'&&!Array.isArray(out.operations.tradeManager)?out.operations.tradeManager:{};
    const tm=out.operations.tradeManager;
    tm.trades=tm.trades&&typeof tm.trades==='object'&&!Array.isArray(tm.trades)?tm.trades:{};
    tm.conflicts=Array.isArray(tm.conflicts)?tm.conflicts:[];
    out.operations.inventoryRoi=out.operations.inventoryRoi&&typeof out.operations.inventoryRoi==='object'&&!Array.isArray(out.operations.inventoryRoi)?out.operations.inventoryRoi:{};
    out.operations.inventoryRoi.tradeReconciliation=out.operations.inventoryRoi.tradeReconciliation&&typeof out.operations.inventoryRoi.tradeReconciliation==='object'&&!Array.isArray(out.operations.inventoryRoi.tradeReconciliation)?out.operations.inventoryRoi.tradeReconciliation:{};
    return out;
  }

  function itemName(state,itemId){
    const id=asId(itemId);
    return String(
      state?.procurement?.catalog?.[id]?.name||
      state?.marketIntel?.marketPulse?.items?.[id]?.itemName||
      state?.marketIntel?.marketplace?.[id]?.itemName||
      ('Item '+id)
    );
  }

  function marketEvidence(state,itemId,at=Date.now()){
    const id=asId(itemId);
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulse=pulseState?.items?.[id];
    const pulseTtl=Math.max(0,n(pulseState?.settings?.ttlMs));
    if(pulse&&typeof pulse==='object'){
      const fetchedAt=epochMs(pulse.fetchedAt??pulse.lastSnapshot?.fetchedAt);
      const sourceTimestamp=epochMs(pulse.sourceTimestamp??pulse.lastSnapshot?.sourceTimestamp);
      const price=Math.max(0,n(pulse.floorPrice??pulse.lastSnapshot?.floorPrice));
      const stale=!(fetchedAt>0&&pulseTtl>0)||Number(at)-fetchedAt>pulseTtl;
      if(price>0){
        return {
          itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,
          source:'Market Pulse',provider:String(pulse.lastSnapshot?.source||pulse.sources?.itemMarket||'Torn API v2 Item Market'),
          sourceTimestamp,fetchedAt,maxAgeMs:pulseTtl,
          confidencePct:Math.max(0,n(pulse.confidencePct)),liquidityScore:Math.max(0,n(pulse.liquidityScore))
        };
      }
    }

    const rulesMs=Math.max(30_000,n(state?.businessRules?.maxListingAgeSec)*1000||0);
    const snap=state?.procurement?.marketSnapshots?.[id];
    if(snap&&typeof snap==='object'){
      const fetchedAt=epochMs(snap.fetchedAt);
      const price=Math.max(0,n(snap?.itemMarket?.lowest));
      const stale=!(fetchedAt>0)||Number(at)-fetchedAt>rulesMs;
      if(price>0){
        return {itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,source:'Item Market snapshot',provider:'Torn API v2 Item Market',sourceTimestamp:fetchedAt,fetchedAt,maxAgeMs:rulesMs,confidencePct:0,liquidityScore:0};
      }
    }

    const market=state?.marketIntel?.marketplace?.[id];
    const generatedAt=epochMs(state?.marketIntel?.marketplaceGeneratedAt);
    const marketplaceMaxAge=Math.max(DEFAULT_MARKET_MAX_AGE_MS,rulesMs);
    if(market&&typeof market==='object'){
      const price=Math.max(0,n(market.lowestPrice)||n(market.bazaarAverage));
      const stale=!(generatedAt>0)||Number(at)-generatedAt>marketplaceMaxAge;
      if(price>0){
        return {itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,source:'Bazaar aggregate',provider:'Shared market cache',sourceTimestamp:generatedAt,fetchedAt:generatedAt,maxAgeMs:marketplaceMaxAge,confidencePct:0,liquidityScore:0};
      }
    }

    return {itemId:id,price:0,status:'MISSING',usable:false,source:'Shared market state',provider:'none',sourceTimestamp:0,fetchedAt:0,maxAgeMs:0,confidencePct:0,liquidityScore:0};
  }

  function participant(value){
    return {id:asId(value?.id),name:String(value?.name||'').trim()};
  }

  function tradeStatus(trade){
    if(epochMs(trade?.completed_at||trade?.completedAt)>0)return 'COMPLETED';
    if(epochMs(trade?.expires_at||trade?.expiresAt)>0)return 'ONGOING';
    return 'UNKNOWN';
  }

  function normalizeTrade(trade,selfId,state={},at=Date.now()){
    const raw=trade?.trade&&typeof trade.trade==='object'?trade.trade:trade;
    if(!raw||typeof raw!=='object')throw new Error('Trade payload is missing.');
    const id=asId(raw.id);
    if(!/^\d+$/.test(id))throw new Error('Trade payload is missing a valid API trade ID.');
    const me=asId(selfId);
    if(!/^\d+$/.test(me))throw new Error('Authenticated Torn user ID is required to classify trade sides.');
    const user=participant(raw.user),trader=participant(raw.trader);
    if(user.id!==me&&trader.id!==me)throw new Error('Authenticated user is not a participant in this trade.');
    const counterparty=user.id===me?trader:user;
    const supplied={items:[],money:0,other:[]};
    const received={items:[],money:0,other:[]};
    for(const entry of Array.isArray(raw.items)?raw.items:[]){
      const owner=asId(entry?.user_id);
      const side=owner===me?supplied:received;
      const type=String(entry?.type||'Unknown');
      const details=entry?.details&&typeof entry.details==='object'?entry.details:{};
      if(type==='Money'){
        side.money+=Math.max(0,n(details.amount));
      }else if(type==='Item'){
        const itemId=asId(details.id);
        const quantity=Math.max(0,n(details.amount));
        if(!/^\d+$/.test(itemId)||!(quantity>0))continue;
        const evidence=marketEvidence(state,itemId,at);
        side.items.push({itemId,uid:details.uid??null,itemName:itemName(state,itemId),quantity,evidence,referenceValue:evidence.usable?evidence.price*quantity:0});
      }else{
        side.other.push({type,userId:owner,details:clone(details)});
      }
    }
    return {
      id,description:String(raw.description||''),status:tradeStatus(raw),
      completedAt:epochMs(raw.completed_at||raw.completedAt),expiresAt:epochMs(raw.expires_at||raw.expiresAt),modifiedAt:epochMs(raw.modified_at||raw.modifiedAt),
      user,trader,counterparty,supplied,received,observedAt:Number(at)
    };
  }

  function currentFifoCost(state,itemId,quantity){
    const qty=Math.max(0,n(quantity));
    if(!(qty>0))return {requestedUnits:0,matchedUnits:0,unmatchedUnits:0,cost:0,coveragePct:100,source:'Inventory Manager FIFO'};
    if(!inventoryLogic||typeof inventoryLogic.fifoLedger!=='function')return {requestedUnits:qty,matchedUnits:0,unmatchedUnits:qty,cost:0,coveragePct:0,source:'Inventory Manager FIFO unavailable'};
    let ledger;
    try{ledger=inventoryLogic.fifoLedger(state,asId(itemId));}catch{return {requestedUnits:qty,matchedUnits:0,unmatchedUnits:qty,cost:0,coveragePct:0,source:'Inventory Manager FIFO error'};}
    const lots=(Array.isArray(ledger?.remainingLots)?ledger.remainingLots:[])
      .map(lot=>({remaining:Math.max(0,n(lot.remaining)),unitCost:Math.max(0,n(lot.unitCost))}))
      .filter(lot=>lot.remaining>0);
    let need=qty,cost=0,matched=0;
    for(const lot of lots){
      if(!(need>0))break;
      const take=Math.min(need,lot.remaining);
      cost+=take*lot.unitCost;matched+=take;need-=take;
    }
    return {requestedUnits:qty,matchedUnits:matched,unmatchedUnits:Math.max(0,qty-matched),cost,coveragePct:qty>0?matched/qty*100:100,source:'Inventory Manager current FIFO remaining lots'};
  }

  function evaluateTrade(state,trade,selfId,at=Date.now()){
    const normalized=normalizeTrade(trade,selfId,state,at);
    const suppliedMarketValue=normalized.supplied.items.reduce((sum,row)=>sum+(row.evidence.usable?row.referenceValue:0),0);
    const receivedMarketValue=normalized.received.items.reduce((sum,row)=>sum+(row.evidence.usable?row.referenceValue:0),0);
    const suppliedFresh=normalized.supplied.items.every(row=>row.evidence.usable);
    const receivedFresh=normalized.received.items.every(row=>row.evidence.usable);
    const costRows=normalized.supplied.items.map(row=>({itemId:row.itemId,itemName:row.itemName,quantity:row.quantity,...currentFifoCost(state,row.itemId,row.quantity)}));
    const costBasis=costRows.reduce((sum,row)=>sum+n(row.cost),0);
    const requestedUnits=costRows.reduce((sum,row)=>sum+n(row.requestedUnits),0);
    const matchedUnits=costRows.reduce((sum,row)=>sum+n(row.matchedUnits),0);
    const costCoveragePct=requestedUnits>0?matchedUnits/requestedUnits*100:100;
    const netCash=normalized.received.money-normalized.supplied.money;
    const unsupportedAssets=normalized.supplied.other.length+normalized.received.other.length;
    const referenceBalance=suppliedFresh&&receivedFresh&&unsupportedAssets===0
      ?(normalized.received.money+receivedMarketValue)-(normalized.supplied.money+suppliedMarketValue)
      :null;
    const marginReady=receivedFresh&&costCoveragePct>=99.999&&unsupportedAssets===0;
    const margin=marginReady?(normalized.received.money+receivedMarketValue)-(normalized.supplied.money+costBasis):null;
    const marginKind=margin==null?'UNAVAILABLE':normalized.received.items.length===0?'REALIZED_CASH_VS_CURRENT_FIFO':'ESTIMATED_MIXED_REFERENCE';
    const valuationStatus=unsupportedAssets>0?'UNSUPPORTED_ASSET_PRESENT':!suppliedFresh||!receivedFresh?'STALE_OR_MISSING_MARKET_EVIDENCE':costCoveragePct<99.999?'INCOMPLETE_COST_BASIS':'READY';
    return {
      ...normalized,
      valuation:{
        status:valuationStatus,suppliedMarketValue,receivedMarketValue,netCash,referenceBalance,
        costBasis,costCoveragePct,margin,marginKind,costRows,
        marketEvidenceFresh:Boolean(suppliedFresh&&receivedFresh),valuedAt:Number(at)
      },
      recordable:normalized.status==='COMPLETED'&&normalized.completedAt>0
    };
  }

  function tradeFingerprint(evaluation){
    const simple={
      id:evaluation.id,completedAt:evaluation.completedAt,counterparty:evaluation.counterparty,
      supplied:{money:evaluation.supplied.money,items:evaluation.supplied.items.map(x=>({itemId:x.itemId,uid:x.uid,quantity:x.quantity})),other:evaluation.supplied.other},
      received:{money:evaluation.received.money,items:evaluation.received.items.map(x=>({itemId:x.itemId,uid:x.uid,quantity:x.quantity})),other:evaluation.received.other}
    };
    return JSON.stringify(simple);
  }

  function buildCompletedRecord(evaluation,at=Date.now()){
    if(!evaluation?.recordable)throw new Error('Only an API-confirmed completed trade can be recorded.');
    const effects=[];
    for(const row of evaluation.supplied.items)effects.push({direction:'OUT',itemId:row.itemId,itemName:row.itemName,uid:row.uid,quantity:row.quantity});
    for(const row of evaluation.received.items)effects.push({direction:'IN',itemId:row.itemId,itemName:row.itemName,uid:row.uid,quantity:row.quantity});
    return {
      schema:1,id:String(evaluation.id),status:'COMPLETED',completedAt:evaluation.completedAt,completedAtIso:iso(evaluation.completedAt),
      description:evaluation.description,counterparty:clone(evaluation.counterparty),
      supplied:{money:evaluation.supplied.money,items:clone(evaluation.supplied.items),other:clone(evaluation.supplied.other)},
      received:{money:evaluation.received.money,items:clone(evaluation.received.items),other:clone(evaluation.received.other)},
      valuation:clone(evaluation.valuation),inventoryEffects:effects,
      evidence:{source:'Torn API v2 detailed trade',apiTradeId:String(evaluation.id),completedAt:evaluation.completedAt,fetchedAt:Number(at),confidence:'TRUSTED_COMPLETION'},
      fingerprint:tradeFingerprint(evaluation),recordedAt:Number(at)
    };
  }

  function pruneObjectByTimestamp(obj,limit,timestampField){
    const entries=Object.entries(obj||{}).sort((a,b)=>n(b[1]?.[timestampField])-n(a[1]?.[timestampField]));
    return Object.fromEntries(entries.slice(0,Math.max(1,Math.round(n(limit)||1))));
  }

  function recordCompletedTrades(slice,records=[],at=Date.now()){
    ensureTradeSlice(slice);
    const tm=slice.operations.tradeManager;
    const recon=slice.operations.inventoryRoi.tradeReconciliation;
    let inserted=0,duplicates=0,conflicts=0,reconciliations=0;
    for(const record of Array.isArray(records)?records:[]){
      if(!record||record.status!=='COMPLETED'||!(n(record.completedAt)>0))continue;
      const id=asId(record.id);
      if(!/^\d+$/.test(id))continue;
      const existing=tm.trades[id];
      if(existing){
        if(String(existing.fingerprint||'')===String(record.fingerprint||'')){duplicates++;continue;}
        conflicts++;
        tm.conflicts.unshift({tradeId:id,existingFingerprint:String(existing.fingerprint||''),incomingFingerprint:String(record.fingerprint||''),detectedAt:Number(at)});
        tm.conflicts=tm.conflicts.slice(0,50);
        continue;
      }
      tm.trades[id]=clone(record);inserted++;
      const effects=Array.isArray(record.inventoryEffects)?record.inventoryEffects:[];
      recon[id]={schema:1,tradeId:id,completedAt:n(record.completedAt),status:'PENDING',effects:clone(effects),source:'MM Trade Manager',evidence:clone(record.evidence),publishedAt:Number(at)};
      reconciliations++;
    }
    tm.trades=pruneObjectByTimestamp(tm.trades,MAX_TRADE_HISTORY,'completedAt');
    slice.operations.inventoryRoi.tradeReconciliation=pruneObjectByTimestamp(recon,MAX_RECONCILIATIONS,'completedAt');
    tm.lastSyncAt=new Date(Number(at)).toISOString();
    tm.lastSyncResult={inserted,duplicates,conflicts,reconciliations,checked:Array.isArray(records)?records.length:0};
    return {slice,inserted,duplicates,conflicts,reconciliations,checked:Array.isArray(records)?records.length:0};
  }

  function historyRows(state){
    const trades=state?.operations?.tradeManager?.trades||{};
    return Object.values(trades).sort((a,b)=>n(b?.completedAt)-n(a?.completedAt));
  }

  const api=Object.freeze({
    MAX_TRADE_HISTORY,MAX_RECONCILIATIONS,
    ensureTradeSlice,itemName,marketEvidence,tradeStatus,normalizeTrade,currentFifoCost,evaluateTrade,
    tradeFingerprint,buildCompletedRecord,recordCompletedTrades,historyRows
  });

  Object.defineProperty(globalThis,'MMTornTradeManagerLogic',{value:api,configurable:true,enumerable:false,writable:false});
})();

/* ===== Trade Manager UI ===== */

(() => {
  'use strict';

  const VERSION='0.1.0-alpha.1-pda.1';
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

  function apiKey(){const saved=String(GM_getValue(API_KEY,'')||'').trim();if(saved)return saved;const pda=String(__MM_TRADE_PDA_API_KEY||'').trim();const unresolved='###PDA-'+'APIKEY###';return pda&&pda!==unresolved?pda:'';}
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