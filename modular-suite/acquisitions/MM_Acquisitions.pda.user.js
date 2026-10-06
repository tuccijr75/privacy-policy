// ==UserScript==
// @name         MM_Acquisitions PDA
// @namespace    manic-mike.torn.acquisitions.pda
// @version      8.0.0-alpha.25-pda.12
// @description  Easy TornPDA buying workflow: find items, compare Bazaar, Item Market and travel prices, then open a source and buy manually.
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// ==/UserScript==


const __MM_PDA_API_KEY='###PDA-APIKEY###';


(() => {
  'use strict';
  globalThis.__MM_ACQ_PDA_STAGE='boot';
  function ensureBootLauncher(){
    if(!document.body)return;
    let b=document.getElementById('mm-acquisitions-launcher');
    if(!b){
      b=document.createElement('button');
      b.id='mm-acquisitions-launcher';
      b.type='button';
      b.setAttribute('aria-label','MM_Acquisitions');
      b.title='MM_Acquisitions';
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px;display:block;"><circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 4 4M9 7.5v6M6.8 9.2h4.4M6.8 11.8h4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      b.style.cssText='position:fixed;right:10px;bottom:86px;z-index:2147483647;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;margin:0;border:1px solid #25282b;border-bottom-color:#111;border-radius:3px;background:linear-gradient(180deg,#5e8d72 0%,#3f6551 58%,#242424 100%);box-shadow:inset 0 1px 0 #ffffff24,inset 0 -1px 0 #0009,0 1px 3px #0009;color:#d7e2e7;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      b.addEventListener('click',()=>{
        if(typeof globalThis.__MM_ACQ_OPEN__==='function'){
          globalThis.__MM_ACQ_OPEN__();
          return;
        }
        const stage=String(globalThis.__MM_ACQ_PDA_STAGE||'unknown');
        let d=document.getElementById('mm-acq-pda-boot-diagnostic');
        if(!d){
          d=document.createElement('div');
          d.id='mm-acq-pda-boot-diagnostic';
          d.style.cssText='position:fixed;left:12px;right:12px;top:80px;z-index:2147483647;padding:12px;border:1px solid #9a7b35;border-radius:8px;background:#111;color:#eee;font:13px/1.4 Arial,sans-serif;box-shadow:0 10px 30px #000b;';
          document.body.appendChild(d);
        }
        d.innerHTML='<b>MM_Acquisitions PDA boot diagnostic</b><div style="margin-top:6px;">Stopped at: <code>'+stage.replace(/[<>&]/g,'')+'</code></div><div style="margin-top:4px;color:#bbb;">Send a screenshot of this message.</div>';
      });
      document.body.appendChild(b);
    }
  }
  if(document.body)ensureBootLauncher();
  else window.addEventListener('DOMContentLoaded',ensureBootLauncher,{once:true});
})();


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


;globalThis.__MM_ACQ_PDA_STAGE='core';


/* ===== TornPDA platform/state adapter ===== */

(() => {
  'use strict';

  const PDA_GM_PREFIX='mm_acquisitions_pda_gm_v1:';
  globalThis.__MM_TORN_PDA__=true;

  if(typeof globalThis.GM_getValue!=='function'){
    globalThis.GM_getValue=(key,def)=>{
      try{
        const raw=localStorage.getItem(PDA_GM_PREFIX+String(key));
        return raw==null?def:JSON.parse(raw);
      }catch{return def;}
    };
  }
  if(typeof globalThis.GM_setValue!=='function'){
    globalThis.GM_setValue=(key,value)=>{
      try{localStorage.setItem(PDA_GM_PREFIX+String(key),JSON.stringify(value));}catch{}
    };
  }
  if(typeof globalThis.GM_deleteValue!=='function'){
    globalThis.GM_deleteValue=key=>{
      try{localStorage.removeItem(PDA_GM_PREFIX+String(key));}catch{}
    };
  }

  // TornPDA/GMforPDA exposes GM_* helpers as non-writable, non-configurable
  // window properties. Never monkey-patch them. The PDA bundle keeps its
  // injected API key in the outer TornPDA userscript closure instead of window.

  if(typeof globalThis.GM_xmlhttpRequest!=='function'&&typeof globalThis.PDA_httpGet==='function'){
    globalThis.GM_xmlhttpRequest=options=>{
      const opts=options&&typeof options==='object'?options:{};
      let aborted=false;
      let settled=false;
      let timer=null;
      const finish=(fn,arg)=>{
        if(settled||aborted)return;
        settled=true;
        if(timer)clearTimeout(timer);
        try{fn?.(arg);}catch{}
      };
      if(Number(opts.timeout||0)>0){
        timer=setTimeout(()=>finish(opts.ontimeout,{status:0,statusText:'timeout',responseText:''}),Number(opts.timeout));
      }
      Promise.resolve()
        .then(()=>globalThis.PDA_httpGet(String(opts.url||''),opts.headers||{}))
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

  const STORAGE_KEY='mm_acquisitions_pda_state_v1';
  const LOCAL_FALLBACK_KEY='mm_acquisitions_pda_state_local_v1';
  let cache=null;
  let loadPromise=null;
  let queue=Promise.resolve();

  const clone=value=>original.deepClone?original.deepClone(value):JSON.parse(JSON.stringify(value));

  function defaultState(){
    return {
      schema:11,
      customers:{},
      sales:{},
      coupons:{},
      refunds:{},
      subscribers:{},
      removedCustomers:{},
      notificationHistory:[],
      businessRules:{
        minRoiPct:0,
        minDemandPerDay:0,
        minPrice:0,
        maxPrice:100000000000,
        minAbsoluteProfit:0,
        minSellerCount:0,
        minConfidencePct:0,
        maxListingAgeSec:180,
        updatedAt:new Date().toISOString()
      },
      syncState:{},
      procurement:{
        acquisitions:[],
        watchlist:{},
        catalog:{},
        marketSnapshots:{},
        marketHistory:{},
        ranked:{settings:{}},
        pricelist:{items:{}}
      },
      operations:{},
      marketIntel:{
        settings:{bazaarExitHaircutPct:0},
        marketplace:{},
        details:{},
        traders:{},
        history:{}
      },
      travelIntel:{rows:[],history:{},settings:{}},
      factionInventory:{
        current:{},
        snapshots:[],
        memberReadiness:{roster:{},profiles:{}}
      },
      meta:{platform:'tornpda',createdAt:new Date().toISOString()}
    };
  }

  async function nativeGet(){
    // TornPDA binds PDA_storage as a lexical const around each userscript,
    // not as window.PDA_storage. Refer to that injected binding directly.
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.get==='function'){
      return await PDA_storage.get(STORAGE_KEY,null);
    }
    try{
      const raw=localStorage.getItem(LOCAL_FALLBACK_KEY);
      return raw?JSON.parse(raw):null;
    }catch{return null;}
  }

  async function nativeSet(value){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.set==='function'){
      await PDA_storage.set(STORAGE_KEY,value);
      return;
    }
    localStorage.setItem(LOCAL_FALLBACK_KEY,JSON.stringify(value));
  }

  async function ensureState(){
    if(cache)return cache;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      let loaded=null;
      try{loaded=await nativeGet();}catch{}
      const validation=loaded?original.validateLegacyState(loaded):{ok:false};
      cache=validation.ok?loaded:defaultState();
      if(!validation.ok){
        try{await nativeSet(cache);}catch(error){console.warn('[MM_Acquisitions PDA] initial state persistence failed',error);}
      }
      return cache;
    })();
    try{return await loadPromise;}finally{loadPromise=null;}
  }

  async function readLegacyState(){
    return clone(await ensureState());
  }

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
      cache=merged;
      await nativeSet(merged);
      try{original.notifyStateChanged?.(key);}catch{}
      return clone(merged);
    };
    const current=queue.then(run,run);
    queue=current.catch(()=>{});
    return current;
  }

  async function inspectLegacyState(){
    const state=await readLegacyState();
    return Object.freeze({
      coreVersion:String(original.version||'')+'-pda',
      platform:'tornpda',
      storage:typeof PDA_storage!=='undefined'&&PDA_storage?'PDA_storage':'localStorage-fallback',
      validation:original.validateLegacyState(state),
      summary:original.summarizeState(state),
      freshness:original.freshnessSnapshot(state)
    });
  }

  const api=Object.freeze({
    ...original,
    version:String(original.version||'')+'-pda',
    readLegacyState,
    updateDomainState,
    inspectLegacyState
  });

  Object.defineProperty(globalThis,'MMTornCore',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();


;globalThis.__MM_ACQ_PDA_STAGE='adapter';


/* ===== Market Pulse engine (bundled) ===== */

(() => {
  'use strict';

  const SCHEMA = 1;
  const HISTORY_MAX = 96;
  const REJECTION_MAX = 80;
  const CACHE_MAX = 72;
  const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000;
  const DEFAULT_TTL_MS = 45 * 60 * 1000;
  const DEFAULT_REFRESH_MS = 90 * 1000;
  const MIN_REFRESH_MS = 45 * 1000;
  const MAX_REFRESH_MS = 15 * 60 * 1000;
  const DEFAULT_BUDGET_PER_MINUTE = 45;
  const DEFAULT_CANDIDATE_GROSS = 10_000_000;
  const DEFAULT_PROVEN_TURNOVER = 5_000_000;
  const RECENT_REUSE_MS = 2500;

  const asId = value => String(value ?? '').trim();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, num(value)));
  const iso = ms => new Date(Math.max(0, num(ms)) || Date.now()).toISOString();

  function toEpochMs(value) {
    const n = num(value);
    if (!(n > 0)) return 0;
    return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
  }

  function durationMs(value) {
    const n = Math.max(0, num(value));
    if (!n) return 0;
    return n > 100000 ? Math.round(n) : Math.round(n * 1000);
  }

  function marketRoot(payload) {
    if (payload?.itemmarket && !Array.isArray(payload.itemmarket)) return payload.itemmarket;
    if (payload?.item_market && !Array.isArray(payload.item_market)) return payload.item_market;
    return payload || {};
  }

  function marketRows(payload) {
    if (Array.isArray(payload)) return payload;
    const root = marketRoot(payload);
    if (Array.isArray(root)) return root;
    for (const key of ['listings', 'itemmarket', 'item_market']) {
      if (Array.isArray(root?.[key])) return root[key];
    }
    return [];
  }

  function compactBands(rows, limit = 12) {
    const bands = new Map();
    for (const row of rows) {
      const price = Math.max(0, num(row?.price ?? row?.cost));
      const quantity = Math.max(0, Math.round(num(row?.amount ?? row?.quantity ?? row?.qty)));
      if (!(price > 0) || !(quantity > 0)) continue;
      bands.set(price, (bands.get(price) || 0) + quantity);
    }
    return [...bands.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, Math.max(1, Math.min(24, Math.round(num(limit) || 12))))
      .map(([price, quantity]) => ({price, quantity}));
  }

  function normalizeTornItemMarket(itemId, itemName, payload, options = {}) {
    const id = asId(itemId);
    const fetchedAt = Math.max(0, num(options.fetchedAt) || Date.now());
    const root = marketRoot(payload);
    const rows = marketRows(payload).map(row => ({
      price: Math.max(0, num(row?.price ?? row?.cost)),
      quantity: Math.max(0, Math.round(num(row?.amount ?? row?.quantity ?? row?.qty)))
    })).filter(row => row.price > 0 && row.quantity > 0).sort((a, b) => a.price - b.price);
    const floorPrice = rows[0]?.price || 0;
    const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
    const marketExposure = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const peakListingExposure = rows.reduce((max, row) => Math.max(max, row.price * row.quantity), 0);
    const sourceTimestamp = toEpochMs(root?.cache_timestamp ?? root?.timestamp ?? payload?.cache_timestamp ?? payload?.timestamp);
    const upstreamCacheDelayMs = durationMs(root?.cache_delay ?? payload?.cache_delay);
    return {
      itemId: id,
      itemName: String(itemName || ('Item ' + id)),
      source: 'Torn API v2 Item Market',
      sourceTimestamp,
      fetchedAt,
      upstreamCacheDelayMs,
      floorPrice,
      marketDepth: rows.length,
      totalQty,
      marketExposure,
      peakListingExposure,
      priceBands: compactBands(rows),
      sampleLimit: rows.length
    };
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || !/^\d+$/.test(asId(snapshot.itemId))) return {ok:false, reason:'invalid_item'};
    const numeric = ['sourceTimestamp','fetchedAt','upstreamCacheDelayMs','floorPrice','marketDepth','totalQty','marketExposure','peakListingExposure'];
    for (const key of numeric) {
      const value = Number(snapshot[key] ?? 0);
      if (!Number.isFinite(value) || value < 0) return {ok:false, reason:'invalid_' + key};
    }
    if (!(num(snapshot.floorPrice) > 0) || !(num(snapshot.marketDepth) > 0) || !(num(snapshot.totalQty) > 0)) {
      return {ok:false, reason:'empty_market_snapshot'};
    }
    return {ok:true, reason:'ok'};
  }

  function diffSnapshots(previous, current, options = {}) {
    const currentCheck = validateSnapshot(current);
    if (!currentCheck.ok) return {event:null, rejected:true, reason:currentCheck.reason};
    if (!previous) return {event:null, rejected:false, reason:'baseline'};
    const previousCheck = validateSnapshot(previous);
    if (!previousCheck.ok) return {event:null, rejected:true, reason:'previous_' + previousCheck.reason};

    const prevSource = num(previous.sourceTimestamp);
    const currSource = num(current.sourceTimestamp);
    if (!prevSource || !currSource) return {event:null, rejected:false, reason:'source_timestamp_unavailable'};
    if (currSource < prevSource) return {event:null, rejected:true, reason:'source_time_regression'};
    if (currSource === prevSource) return {event:null, rejected:false, reason:'upstream_not_advanced'};

    const maxGapMs = Math.max(5 * 60 * 1000, num(options.maxGapMs) || 30 * 60 * 1000);
    const gapMs = currSource - prevSource;
    if (gapMs > maxGapMs) return {event:null, rejected:true, reason:'observation_gap_too_large'};

    const previousQty = Math.round(num(previous.totalQty));
    const currentQty = Math.round(num(current.totalQty));
    if (currentQty > previousQty) return {event:null, rejected:false, reason:'inventory_increase_not_movement'};
    if (currentQty === previousQty) return {event:null, rejected:false, reason:'unchanged'};
    const units = previousQty - currentQty;
    if (!(units > 0) || units > previousQty) return {event:null, rejected:true, reason:'impossible_quantity_delta'};

    const previousFloor = num(previous.floorPrice);
    const currentFloor = num(current.floorPrice);
    const referenceFloor = Math.max(1, Math.min(previousFloor || currentFloor, currentFloor || previousFloor));
    const floorShift = previousFloor > 0 && currentFloor > 0 ? Math.abs(currentFloor - previousFloor) / previousFloor : 0;
    if (floorShift > clamp(options.maxFloorShiftRatio ?? 0.65, 0.10, 2.0)) {
      return {event:null, rejected:true, reason:'price_regime_shift'};
    }

    const hours = Math.max(1 / 60, gapMs / 3600000);
    const turnover = Math.round(units * referenceFloor);
    const depthChange = Math.abs(num(current.marketDepth) - num(previous.marketDepth));
    const depthBase = Math.max(1, num(previous.marketDepth));
    const depthConsistency = Math.max(0, 1 - Math.min(1, depthChange / depthBase));
    const confidencePct = Math.round(clamp(52 + depthConsistency * 18 + (floorShift <= 0.10 ? 12 : 4), 0, 82));
    return {
      event: {
        kind:'observed_outflow',
        at:currSource,
        previousAt:prevSource,
        durationHours:hours,
        units,
        unitValue:referenceFloor,
        turnover,
        confidencePct
      },
      rejected:false,
      reason:'observed_outflow'
    };
  }

  function settingsOf(pulse) {
    const raw = pulse?.settings || {};
    return {
      windowMs: clamp(raw.windowMs || DEFAULT_WINDOW_MS, 15 * 60 * 1000, 24 * 60 * 60 * 1000),
      ttlMs: clamp(raw.ttlMs || DEFAULT_TTL_MS, 10 * 60 * 1000, 6 * 60 * 60 * 1000),
      baseRefreshMs: clamp(raw.baseRefreshMs || DEFAULT_REFRESH_MS, MIN_REFRESH_MS, MAX_REFRESH_MS),
      requestBudgetPerMinute: Math.round(clamp(raw.requestBudgetPerMinute || DEFAULT_BUDGET_PER_MINUTE, 10, 90)),
      candidateMinGross: Math.max(1_000_000, num(raw.candidateMinGross) || DEFAULT_CANDIDATE_GROSS),
      provenMinTurnover: Math.max(1_000_000, num(raw.provenMinTurnover) || DEFAULT_PROVEN_TURNOVER),
      historyMax: Math.round(clamp(raw.historyMax || HISTORY_MAX, 12, HISTORY_MAX)),
      cacheMax: Math.round(clamp(raw.cacheMax || CACHE_MAX, 12, CACHE_MAX))
    };
  }

  function ensurePulse(draft) {
    const marketIntel = draft.marketIntel || (draft.marketIntel = {});
    const pulse = marketIntel.marketPulse && typeof marketIntel.marketPulse === 'object' ? marketIntel.marketPulse : {};
    pulse.schema = SCHEMA;
    pulse.updatedAt = Math.max(0, num(pulse.updatedAt));
    pulse.items = pulse.items && typeof pulse.items === 'object' && !Array.isArray(pulse.items) ? pulse.items : {};
    pulse.settings = {...settingsOf(pulse)};
    pulse.scheduler = pulse.scheduler && typeof pulse.scheduler === 'object' ? pulse.scheduler : {};
    pulse.scheduler.requestLog = Array.isArray(pulse.scheduler.requestLog) ? pulse.scheduler.requestLog.map(num).filter(v => v > 0).slice(-90) : [];
    pulse.scheduler.lastRefreshAt = Math.max(0, num(pulse.scheduler.lastRefreshAt));
    pulse.scheduler.lastErrorAt = Math.max(0, num(pulse.scheduler.lastErrorAt));
    pulse.scheduler.lastError = String(pulse.scheduler.lastError || '').slice(0, 240);
    pulse.rejections = Array.isArray(pulse.rejections) ? pulse.rejections.slice(-REJECTION_MAX) : [];
    marketIntel.marketPulse = pulse;
    return pulse;
  }

  function snapshotPoint(snapshot) {
    return {
      sourceTimestamp:num(snapshot.sourceTimestamp),
      fetchedAt:num(snapshot.fetchedAt),
      floorPrice:num(snapshot.floorPrice),
      marketDepth:Math.round(num(snapshot.marketDepth)),
      totalQty:Math.round(num(snapshot.totalQty)),
      marketExposure:num(snapshot.marketExposure)
    };
  }

  function freshness(snapshot, nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS) {
    const sourceAt = num(snapshot?.sourceTimestamp);
    const fetchedAt = num(snapshot?.fetchedAt);
    const sourceAgeMs = sourceAt ? Math.max(0, nowMs - sourceAt) : Infinity;
    const fetchAgeMs = fetchedAt ? Math.max(0, nowMs - fetchedAt) : Infinity;
    const stale = !fetchedAt || fetchAgeMs > ttlMs;
    const label = stale ? 'STALE' : fetchAgeMs <= 60_000 ? 'FRESH' : fetchAgeMs <= 5 * 60_000 ? 'GOOD' : 'AGING';
    return {sourceAgeMs, fetchAgeMs, stale, label};
  }

  function deriveItemMetrics(item, nowMs = Date.now(), settings = {}) {
    const cfg = {...settingsOf({settings}), ...settings};
    const events = (Array.isArray(item?.movementHistory) ? item.movementHistory : [])
      .filter(row => num(row?.at) > 0 && nowMs - num(row.at) <= cfg.windowMs);
    const snapshots = (Array.isArray(item?.snapshotHistory) ? item.snapshotHistory : [])
      .filter(row => num(row?.fetchedAt) > 0 && nowMs - num(row.fetchedAt) <= cfg.windowMs);
    const windowHours = Math.max(0.25, cfg.windowMs / 3600000);
    const units = events.reduce((sum, row) => sum + Math.max(0, num(row.units)), 0);
    const turnover = events.reduce((sum, row) => sum + Math.max(0, num(row.turnover)), 0);
    const observedEventsPerHour = events.length / windowHours;
    const observedUnitsPerHour = units / windowHours;
    const turnoverPerHour = turnover / windowHours;
    const latest = item?.lastSnapshot || snapshots[snapshots.length - 1] || {};
    const first = snapshots[0] || {};
    const trendPct = num(first.floorPrice) > 0 && num(latest.floorPrice) > 0
      ? (num(latest.floorPrice) - num(first.floorPrice)) / num(first.floorPrice) * 100
      : 0;
    const depthScore = clamp(Math.log10(1 + Math.max(0, num(latest.totalQty))) * 25 + Math.log10(1 + Math.max(0, num(latest.marketDepth))) * 18, 0, 100);
    const eventScore = clamp(observedEventsPerHour * 28, 0, 100);
    const unitScore = clamp(Math.log10(1 + observedUnitsPerHour) * 32, 0, 100);
    const turnoverScore = clamp((Math.log10(1 + turnoverPerHour) - 5) * 24, 0, 100);
    const repeatConfidence = events.length === 0 ? 30 : events.length === 1 ? 52 : events.length === 2 ? 68 : Math.min(94, 72 + events.length * 4);
    const eventConfidence = events.length ? events.reduce((sum, row) => sum + clamp(row.confidencePct, 0, 100), 0) / events.length : 30;
    const fresh = freshness(latest, nowMs, cfg.ttlMs);
    const freshnessScore = fresh.stale ? 0 : fresh.fetchAgeMs <= 60_000 ? 100 : clamp(100 - fresh.fetchAgeMs / cfg.ttlMs * 70, 20, 100);
    const confidencePct = Math.round(clamp(repeatConfidence * .45 + eventConfidence * .35 + freshnessScore * .20, 0, 96));
    const liquidityScore = Math.round(clamp(depthScore * .38 + eventScore * .22 + unitScore * .18 + turnoverScore * .14 + confidencePct * .08, 0, 100));
    const marketExposure = Math.max(0, num(latest.marketExposure));
    const largeSaleActivity = marketExposure >= cfg.candidateMinGross || events.some(row => num(row.turnover) >= cfg.candidateMinGross);
    const proven = events.length >= 3 && turnoverPerHour >= cfg.provenMinTurnover && confidencePct >= 60;
    const tier = proven ? 'proven' : (largeSaleActivity ? 'candidate' : 'observed');
    return {
      observedEventsPerHour,
      observedUnitsPerHour,
      turnoverPerHour,
      liquidityScore,
      confidencePct,
      trendPct,
      largeSaleActivity,
      tier,
      marketDepth:Math.round(num(latest.marketDepth)),
      totalQty:Math.round(num(latest.totalQty)),
      floorPrice:num(latest.floorPrice),
      marketExposure,
      freshness:fresh
    };
  }

  function pruneCache(pulse, nowMs = Date.now()) {
    const cfg = settingsOf(pulse);
    const entries = Object.entries(pulse.items || {}).sort((a, b) => {
      const aAt = Math.max(num(a[1]?.lastSnapshot?.fetchedAt), num(a[1]?.updatedAt));
      const bAt = Math.max(num(b[1]?.lastSnapshot?.fetchedAt), num(b[1]?.updatedAt));
      return bAt - aAt;
    });
    for (const [id] of entries.slice(cfg.cacheMax)) delete pulse.items[id];
    for (const [id, item] of Object.entries(pulse.items)) {
      const at = Math.max(num(item?.lastSnapshot?.fetchedAt), num(item?.updatedAt));
      if (at && nowMs - at > cfg.ttlMs * 4 && item?.tier !== 'proven') delete pulse.items[id];
    }
  }

  function effectiveRefreshMs(pulse, itemCount = 1, cacheDelayMs = 0) {
    const cfg = settingsOf(pulse);
    const budgetForPulse = Math.max(4, Math.floor(cfg.requestBudgetPerMinute * .55));
    const budgetCycleMs = Math.ceil(Math.max(1, itemCount) / budgetForPulse * 60_000);
    return clamp(Math.max(cfg.baseRefreshMs, budgetCycleMs, Math.max(0, num(cacheDelayMs))), MIN_REFRESH_MS, MAX_REFRESH_MS);
  }

  function applySnapshotToDraft(draft, snapshot, options = {}) {
    const pulse = ensurePulse(draft);
    const checked = validateSnapshot(snapshot);
    const nowMs = Math.max(0, num(snapshot?.fetchedAt) || Date.now());
    if (!checked.ok) {
      pulse.rejections.push({at:nowMs, itemId:asId(snapshot?.itemId), reason:checked.reason});
      pulse.rejections = pulse.rejections.slice(-REJECTION_MAX);
      pulse.updatedAt = nowMs;
      return {pulse, item:null, accepted:false, reason:checked.reason};
    }

    const id = asId(snapshot.itemId);
    const existing = pulse.items[id] && typeof pulse.items[id] === 'object' ? pulse.items[id] : {};
    const item = {
      ...existing,
      itemId:id,
      itemName:String(snapshot.itemName || existing.itemName || ('Item ' + id)),
      sources:{itemMarket:'Torn API v2 Item Market'},
      snapshotHistory:Array.isArray(existing.snapshotHistory) ? existing.snapshotHistory : [],
      movementHistory:Array.isArray(existing.movementHistory) ? existing.movementHistory : [],
      rejections:Array.isArray(existing.rejections) ? existing.rejections : []
    };

    const diff = diffSnapshots(existing.lastSnapshot || null, snapshot, options);
    if (diff.rejected) {
      const rejection = {at:nowMs, itemId:id, reason:diff.reason};
      item.rejections.push(rejection);
      pulse.rejections.push(rejection);
    } else if (diff.event) {
      item.movementHistory.push(diff.event);
    }

    item.snapshotHistory.push(snapshotPoint(snapshot));
    const cfg = settingsOf(pulse);
    item.snapshotHistory = item.snapshotHistory.slice(-cfg.historyMax);
    item.movementHistory = item.movementHistory.slice(-cfg.historyMax);
    item.rejections = item.rejections.slice(-Math.min(REJECTION_MAX, cfg.historyMax));
    item.lastSnapshot = {
      ...snapshotPoint(snapshot),
      upstreamCacheDelayMs:num(snapshot.upstreamCacheDelayMs),
      marketExposure:num(snapshot.marketExposure),
      peakListingExposure:num(snapshot.peakListingExposure),
      priceBands:Array.isArray(snapshot.priceBands) ? snapshot.priceBands.slice(0, 12) : [],
      source:String(snapshot.source || 'Torn API v2 Item Market')
    };
    const metrics = deriveItemMetrics(item, nowMs, cfg);
    Object.assign(item, metrics, {
      sourceTimestamp:num(snapshot.sourceTimestamp),
      fetchedAt:nowMs,
      upstreamCacheDelayMs:num(snapshot.upstreamCacheDelayMs),
      updatedAt:nowMs,
      nextRefreshAt:nowMs + effectiveRefreshMs(pulse, Math.max(1, Object.keys(pulse.items).length || 1), snapshot.upstreamCacheDelayMs)
    });
    pulse.items[id] = item;
    if (options.recordRequest !== false) {
      pulse.scheduler.requestLog.push(nowMs);
      pulse.scheduler.requestLog = pulse.scheduler.requestLog.filter(at => nowMs - at <= 60_000).slice(-90);
    }
    pulse.scheduler.lastRefreshAt = nowMs;
    pulse.scheduler.lastError = '';
    pulse.scheduler.lastErrorAt = 0;
    pulse.updatedAt = nowMs;
    pulse.rejections = pulse.rejections.slice(-REJECTION_MAX);
    pruneCache(pulse, nowMs);
    return {pulse, item, accepted:true, reason:diff.reason};
  }

  function pulseFor(state, itemId, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse;
    const item = pulse?.items?.[asId(itemId)];
    if (!item) return null;
    const metrics = deriveItemMetrics(item, nowMs, settingsOf(pulse));
    return {...item, ...metrics};
  }

  function rankPulseItems(state, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse;
    if (!pulse?.items) return [];
    const weight = {proven:3, candidate:2, observed:1};
    return Object.values(pulse.items).map(item => ({...item, ...deriveItemMetrics(item, nowMs, settingsOf(pulse))}))
      .sort((a, b) =>
        (weight[b.tier] || 0) - (weight[a.tier] || 0) ||
        num(b.turnoverPerHour) - num(a.turnoverPerHour) ||
        num(b.liquidityScore) - num(a.liquidityScore) ||
        num(b.confidencePct) - num(a.confidencePct)
      );
  }

  function contribution(metrics, unitProfit = 0) {
    if (!metrics || metrics.freshness?.stale || num(metrics.confidencePct) < 30) return null;
    const velocityProfit = Math.max(0, num(unitProfit)) * Math.max(0, num(metrics.observedUnitsPerHour));
    const velocityScore = clamp((Math.log10(1 + velocityProfit) - 4) * 22, 0, 100);
    const score = clamp(num(metrics.liquidityScore) * .45 + num(metrics.confidencePct) * .25 + velocityScore * .30, 0, 100);
    return {score, velocityProfitPerHour:velocityProfit, velocityScore};
  }

  function trackedItemIds(state, limit = 36) {
    const cap = Math.max(1, Math.min(CACHE_MAX, Math.round(num(limit) || 36)));
    const ids = [];
    const add = value => {
      const id = asId(value);
      if (/^\d+$/.test(id) && !ids.includes(id) && ids.length < cap) ids.push(id);
    };
    for (const row of rankPulseItems(state)) add(row.itemId);
    const pricelist = Object.values(state?.procurement?.pricelist?.items || {}).sort((a,b) => num(b?.buyPrice) - num(a?.buyPrice));
    for (const row of pricelist) add(row?.itemId ?? row?.id);
    const market = Object.values(state?.marketIntel?.marketplace || {}).sort((a,b) => {
      const ap = Math.max(num(a?.bazaarAverage), num(a?.marketPrice)) - num(a?.lowestPrice);
      const bp = Math.max(num(b?.bazaarAverage), num(b?.marketPrice)) - num(b?.lowestPrice);
      return bp - ap;
    });
    for (const row of market) add(row?.itemId);
    for (const row of state?.procurement?.ranked?.liveMarket || []) add(row?.itemId);
    for (const row of state?.travelIntel?.rows || []) add(row?.itemId);
    return ids;
  }

  function budgetStatus(stateOrPulse, nowMs = Date.now()) {
    const pulse = stateOrPulse?.marketIntel?.marketPulse || stateOrPulse || {};
    const cfg = settingsOf(pulse);
    const recent = (Array.isArray(pulse?.scheduler?.requestLog) ? pulse.scheduler.requestLog : []).map(num).filter(at => at > 0 && nowMs - at <= 60_000);
    return {used:recent.length, limit:cfg.requestBudgetPerMinute, available:recent.length < cfg.requestBudgetPerMinute, recent};
  }

  function canAcquireLease(lease, ownerId, nowMs = Date.now()) {
    const owner = String(ownerId || '');
    if (!owner) return false;
    if (!lease || !lease.owner) return true;
    if (String(lease.owner) === owner) return true;
    return num(lease.expiresAt) <= nowMs;
  }

  function nextDueItem(state, nowMs = Date.now()) {
    const ids = trackedItemIds(state);
    const pulse = state?.marketIntel?.marketPulse || {};
    const rows = ids.map((id, index) => ({
      id,
      order:index,
      dueAt:num(pulse?.items?.[id]?.nextRefreshAt)
    })).filter(row => !row.dueAt || row.dueAt <= nowMs);
    rows.sort((a,b) => a.dueAt - b.dueAt || a.order - b.order);
    return rows[0]?.id || '';
  }

  function recentReusableSnapshot(state, itemId, nowMs = Date.now(), reuseMs = RECENT_REUSE_MS) {
    const snap = state?.procurement?.marketSnapshots?.[asId(itemId)];
    const fetchedAt = snap?.fetchedAt ? Date.parse(snap.fetchedAt) : 0;
    if (!fetchedAt || nowMs - fetchedAt > Math.max(0, num(reuseMs))) return null;
    const pulseSnapshot = snap?.pulseSnapshot;
    return validateSnapshot(pulseSnapshot).ok ? pulseSnapshot : null;
  }

  function scheduleFailureToDraft(draft, itemId, error, nowMs = Date.now()) {
    const pulse = ensurePulse(draft);
    const id = asId(itemId);
    const item = pulse.items[id] || (pulse.items[id] = {itemId:id,itemName:'Item ' + id,snapshotHistory:[],movementHistory:[],rejections:[]});
    const prior = Math.max(MIN_REFRESH_MS, num(item.retryDelayMs) || MIN_REFRESH_MS);
    item.retryDelayMs = Math.min(MAX_REFRESH_MS, prior * 2);
    item.nextRefreshAt = nowMs + item.retryDelayMs;
    pulse.scheduler.lastErrorAt = nowMs;
    pulse.scheduler.lastError = String(error?.message || error || 'refresh_failed').slice(0, 240);
    pulse.updatedAt = nowMs;
    return pulse;
  }

  function sanitizedDiagnostics(state, lease = null, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse || {};
    const budget = budgetStatus(pulse, nowMs);
    const ranked = rankPulseItems(state, nowMs);
    return {
      product:'MM_Acquisitions',
      component:'Market Pulse',
      schema:SCHEMA,
      exportedAt:iso(nowMs),
      source:'Torn API v2 Item Market',
      updatedAt:num(pulse.updatedAt),
      scheduler:{
        owner:String(lease?.owner || ''),
        leaseExpiresAt:num(lease?.expiresAt),
        budgetUsed:budget.used,
        budgetLimit:budget.limit,
        lastRefreshAt:num(pulse?.scheduler?.lastRefreshAt),
        lastErrorAt:num(pulse?.scheduler?.lastErrorAt),
        lastError:String(pulse?.scheduler?.lastError || '')
      },
      cache:{itemCount:ranked.length, proven:ranked.filter(x=>x.tier==='proven').length, candidates:ranked.filter(x=>x.tier==='candidate').length},
      rejectionCount:Array.isArray(pulse.rejections) ? pulse.rejections.length : 0,
      rejectionReasons:(Array.isArray(pulse.rejections) ? pulse.rejections : []).reduce((out,row)=>{const key=String(row?.reason||'unknown');out[key]=(out[key]||0)+1;return out;},{}),
      items:ranked.map(item=>({
        itemId:item.itemId,itemName:item.itemName,tier:item.tier,
        floorPrice:item.floorPrice,marketDepth:item.marketDepth,totalQty:item.totalQty,
        observedEventsPerHour:item.observedEventsPerHour,observedUnitsPerHour:item.observedUnitsPerHour,
        turnoverPerHour:item.turnoverPerHour,liquidityScore:item.liquidityScore,
        confidencePct:item.confidencePct,trendPct:item.trendPct,
        sourceTimestamp:item.sourceTimestamp,fetchedAt:item.fetchedAt,
        upstreamCacheDelayMs:item.upstreamCacheDelayMs,
        freshness:item.freshness
      }))
    };
  }

  function createEngine(deps = {}) {
    const core = deps.core;
    const refreshItemMarket = deps.refreshItemMarket;
    const hasKey = typeof deps.hasKey === 'function' ? deps.hasKey : () => true;
    const readLease = typeof deps.readLease === 'function' ? deps.readLease : () => null;
    const writeLease = typeof deps.writeLease === 'function' ? deps.writeLease : () => {};
    const ownerId = String(deps.ownerId || '');
    const onState = typeof deps.onState === 'function' ? deps.onState : () => {};
    const leaseMs = clamp(deps.leaseMs || 75_000, 30_000, 180_000);
    if (!core || typeof core.readLegacyState !== 'function' || typeof core.updateDomainState !== 'function') throw new Error('Market Pulse core dependency is required.');
    if (typeof refreshItemMarket !== 'function') throw new Error('Market Pulse refresh dependency is required.');

    async function tick(options = {}) {
      const nowMs = Date.now();
      if (!hasKey()) return {skipped:'no-key'};
      const currentLease = readLease();
      if (!canAcquireLease(currentLease, ownerId, nowMs)) return {skipped:'lease-held', owner:currentLease?.owner || ''};
      writeLease({owner:ownerId,updatedAt:nowMs,expiresAt:nowMs+leaseMs});

      let state = await core.readLegacyState();
      const budget = budgetStatus(state, nowMs);
      if (!budget.available) return {skipped:'budget', budget};
      const itemId = options.itemId ? asId(options.itemId) : nextDueItem(state, nowMs);
      if (!/^\d+$/.test(itemId)) return {skipped:'nothing-due'};

      const reused = recentReusableSnapshot(state, itemId, nowMs);
      if (reused) {
        await core.updateDomainState('market', draft => {
          applySnapshotToDraft(draft, {...reused, fetchedAt:nowMs}, {recordRequest:false});
          return draft;
        });
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:true,itemId,reusedRecent:true,state};
      }

      try {
        await refreshItemMarket(itemId);
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:true,itemId,reusedRecent:false,state};
      } catch (error) {
        await core.updateDomainState('market', draft => {
          scheduleFailureToDraft(draft,itemId,error,nowMs);
          return draft;
        });
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:false,itemId,error:String(error?.message || error),state};
      }
    }

    function release() {
      const lease = readLease();
      if (lease?.owner === ownerId) writeLease({...lease,expiresAt:0,releasedAt:Date.now()});
    }

    return Object.freeze({tick,release});
  }

  Object.defineProperty(globalThis,'MMTornMarketPulse',{
    value:Object.freeze({
      SCHEMA,HISTORY_MAX,REJECTION_MAX,CACHE_MAX,RECENT_REUSE_MS,
      normalizeTornItemMarket,validateSnapshot,diffSnapshots,ensurePulse,applySnapshotToDraft,
      deriveItemMetrics,pulseFor,rankPulseItems,contribution,trackedItemIds,
      effectiveRefreshMs,budgetStatus,canAcquireLease,nextDueItem,recentReusableSnapshot,
      scheduleFailureToDraft,sanitizedDiagnostics,createEngine
    }),
    configurable:true,enumerable:false,writable:false
  });
})();


;globalThis.__MM_ACQ_PDA_STAGE='pulse';


/* ===== Acquisitions logic (bundled) ===== */

(() => {
  'use strict';

  const ITEM_MARKET_FEE_RATE = 0.05;
  const marketPulse = globalThis.MMTornMarketPulse;

  const asId = value => String(value ?? '').trim();

  function businessRules(db) {
    const r = db?.businessRules || {};
    const minPrice = Math.max(0, Number(r.minPrice || 0));
    return {
      minRoiPct: Math.max(0, Number(r.minRoiPct || 0)),
      minDemandPerDay: Math.max(0, Number(r.minDemandPerDay || 0)),
      minPrice,
      maxPrice: Math.max(minPrice, Number(r.maxPrice || Number.MAX_SAFE_INTEGER)),
      minAbsoluteProfit: Math.max(0, Number(r.minAbsoluteProfit || 0)),
      minSellerCount: Math.max(0, Math.round(Number(r.minSellerCount || 0))),
      minConfidencePct: Math.max(0, Math.min(100, Number(r.minConfidencePct || 0))),
      maxListingAgeSec: Math.max(30, Math.round(Number(r.maxListingAgeSec || 180)))
    };
  }

  function ageSeconds(value, nowMs = Date.now()) {
    const ms = typeof value === 'number' ? Number(value) : Date.parse(value || '');
    return ms > 0 ? Math.max(0, (nowMs - ms) / 1000) : Infinity;
  }

  function listingAgeSeconds(listing, nowMs = Date.now()) {
    const checked = Number(listing?.lastChecked || 0);
    const updated = Number(listing?.contentUpdated || 0);
    const best = checked > 0 ? checked : updated;
    return best > 0 ? Math.max(0, (nowMs - best) / 1000) : Infinity;
  }

  function freshnessInfo(timestamp, warnSeconds = 180, nowMs = Date.now()) {
    const ms = typeof timestamp === 'number' ? Number(timestamp) : Date.parse(timestamp || '');
    if (!ms || !Number.isFinite(ms)) return { ageSeconds: Infinity, score: 0, label: 'UNKNOWN', stale: true };
    const age = Math.max(0, (nowMs - ms) / 1000);
    const score = Math.max(0, Math.min(100, 100 - Math.max(0, age - 30) * (100 / Math.max(30, warnSeconds * 2))));
    const label = age <= 30 ? 'FRESH' : age <= 120 ? 'GOOD' : age <= warnSeconds ? 'AGING' : 'STALE';
    return { ageSeconds: age, score, label, stale: age > warnSeconds };
  }

  function salesItemMetrics(db, nowMs = Date.now()) {
    const out = {};
    for (const sale of Object.values(db?.sales || {})) {
      const ts = Number(sale?.timestamp || 0);
      if (!ts) continue;
      const dayKey = new Date(ts).toISOString().slice(0, 10);
      for (const item of sale?.items || []) {
        const id = asId(item?.id);
        if (!id) continue;
        if (!out[id]) {
          out[id] = { sold7d:0, sold30d:0, revenue30d:0, saleDays30d:new Set(), lastSaleAt:0 };
        }
        const qty = Number(item?.quantity || 0) || 0;
        const total = Number(item?.total || 0) || 0;
        if (nowMs - ts <= 7 * 86400000) out[id].sold7d += qty;
        if (nowMs - ts <= 30 * 86400000) {
          out[id].sold30d += qty;
          out[id].revenue30d += total;
          out[id].saleDays30d.add(dayKey);
        }
        out[id].lastSaleAt = Math.max(out[id].lastSaleAt, ts);
      }
    }
    for (const row of Object.values(out)) row.saleDays30d = row.saleDays30d.size;
    return out;
  }

  function intelHistoryStats(intel, itemId) {
    const rows = Array.isArray(intel?.history?.[itemId]) ? intel.history[itemId] : [];
    const prices = rows.map(r => Number(r?.bazaarAverage || 0)).filter(v => v > 0);
    if (!prices.length) return { samples:0, median:0, volatilityPct:0 };
    const sorted = prices.slice().sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = prices.reduce((s,v)=>s+v,0) / prices.length;
    const variance = prices.reduce((s,v)=>s+(v-mean)**2,0) / prices.length;
    return { samples:prices.length, median, volatilityPct:mean ? Math.sqrt(variance)/mean*100 : 0 };
  }

  function freshOrganicListings(db, listings, nowMs = Date.now()) {
    const maxAge = businessRules(db).maxListingAgeSec;
    return (Array.isArray(listings) ? listings : [])
      .filter(x => !x?.sponsored && Number(x?.price||0) > 0 && Number(x?.quantity||0) > 0 && listingAgeSeconds(x, nowMs) <= maxAge)
      .sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  }

  function pulseSignals(db,itemId,unitProfit=0,nowMs=Date.now()) {
    const metrics=marketPulse?.pulseFor?.(db,asId(itemId),nowMs)||null;
    const contribution=metrics?marketPulse?.contribution?.(metrics,unitProfit)||null:null;
    return {metrics,contribution};
  }

  function pulseFields(db,itemId,unitProfit=0,nowMs=Date.now()) {
    const {metrics,contribution}=pulseSignals(db,itemId,unitProfit,nowMs);
    return {
      pulseTier:String(metrics?.tier||'unknown'),
      observedEventsPerHour:Number(metrics?.observedEventsPerHour||0),
      observedUnitsPerHour:Number(metrics?.observedUnitsPerHour||0),
      turnoverPerHour:Number(metrics?.turnoverPerHour||0),
      pulseLiquidityScore:Number(metrics?.liquidityScore||0),
      pulseConfidencePct:Number(metrics?.confidencePct||0),
      pulseMarketDepth:Number(metrics?.marketDepth||0),
      pulseTrendPct:Number(metrics?.trendPct||0),
      pulseFreshness:metrics?.freshness||null,
      pulseSourceTimestamp:Number(metrics?.sourceTimestamp||0),
      pulseFetchedAt:Number(metrics?.fetchedAt||0),
      pulseUpstreamCacheDelayMs:Number(metrics?.upstreamCacheDelayMs||0),
      marketPulseScore:contribution?Number(contribution.score||0):null,
      profitVelocityPerHour:contribution?Number(contribution.velocityProfitPerHour||0):0
    };
  }

  function rankCachedOpportunities(db, nowMs = Date.now()) {
    const intel = db?.marketIntel || {};
    const settings = intel.settings || {};
    const rules = businessRules(db);
    const globalFresh = freshnessInfo(intel.marketplaceGeneratedAt, rules.maxListingAgeSec, nowMs);
    const localMetrics = salesItemMetrics(db, nowMs);
    const rows = [];
    const baseMap = new Map();

    for (const base of Object.values(intel.marketplace || {})) {
      if (base?.itemId) baseMap.set(asId(base.itemId), base);
    }

    for (const [id, snap] of Object.entries(db?.procurement?.marketSnapshots || {})) {
      if (baseMap.has(asId(id))) continue;
      const lowest = Number(snap?.itemMarket?.lowest || 0);
      if (!(lowest > 0)) continue;
      const catalog = db?.procurement?.catalog?.[id] || {};
      baseMap.set(asId(id), {
        itemId: asId(id),
        itemName: String(catalog.name || ('Item ' + id)),
        marketPrice: Number(snap?.itemMarket?.median || snap?.itemMarket?.third || lowest),
        bazaarAverage: Number(snap?.bazaar?.median || snap?.bazaar?.third || 0),
        lowestPrice: lowest,
        totalBazaars: Number(snap?.bazaar?.listings || 0),
        itemMarketOnly: true
      });
    }

    for (const base of baseMap.values()) {
      const id = asId(base.itemId);
      const snap = db?.procurement?.marketSnapshots?.[id] || {};
      const snapAge = ageSeconds(snap.fetchedAt, nowMs);
      const itemMarketFresh = Boolean(snap.fetchedAt) && snapAge <= rules.maxListingAgeSec;
      const itemMarketBuy = itemMarketFresh ? Number(snap?.itemMarket?.lowest || 0) : 0;
      const aggregateBuy = Number(base.lowestPrice || 0);
      const discoveryBuy = itemMarketBuy || aggregateBuy;
      const discoverySource = itemMarketBuy > 0 ? 'Item Market' : (aggregateBuy > 0 ? 'Bazaar aggregate' : 'Unknown');
      const bazaarAverage = Number(base.bazaarAverage || 0);
      const marketPrice = Number(base.marketPrice || snap?.itemMarket?.median || snap?.itemMarket?.third || 0);

      if (!(discoveryBuy > 1) || discoveryBuy < rules.minPrice || discoveryBuy > rules.maxPrice) continue;
      const sellerCount = Number(base.totalBazaars || 0);
      const liveListingCount = itemMarketFresh ? Number(snap?.itemMarket?.listings || 0) : sellerCount;
      if (liveListingCount < rules.minSellerCount) continue;

      const detail = intel?.details?.[id];
      const trader = intel?.traders?.[id];
      const organicTrader = trader?.organicTraders?.[0];
      const freshListings = freshOrganicListings(db, detail?.organicListings || [], nowMs);
      const bazaarListing = freshListings[0] || null;

      const bazaarExit = bazaarAverage ? Math.floor(bazaarAverage * (1 - Number(settings.bazaarExitHaircutPct || 0) / 100)) : 0;
      const itemMarketNet = marketPrice ? Math.floor(marketPrice * (1 - ITEM_MARKET_FEE_RATE)) : 0;
      const traderExit = Number(organicTrader?.price || 0);
      const exits = [
        { route:'Bazaar', value:bazaarExit },
        { route:'Trader', value:traderExit },
        { route:'Item Market Net', value:itemMarketNet }
      ].filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
      const exit = exits[0] || { route:'Unknown', value:0 };
      if (!(exit.value > 0)) continue;

      const buySources = [];
      if (bazaarListing) {
        buySources.push({
          source:'Bazaar',
          price:Number(bazaarListing.price||0),
          quantity:Math.max(1,Number(bazaarListing.quantity||1)),
          sellerId:asId(bazaarListing.sellerId),
          sellerName:String(bazaarListing.sellerName||''),
          ageSeconds:listingAgeSeconds(bazaarListing, nowMs)
        });
      }
      if (itemMarketBuy > 0) {
        buySources.push({
          source:'Item Market',
          price:itemMarketBuy,
          quantity:Math.max(1,Number(snap?.itemMarket?.depth1Pct||1)),
          sellerId:'',
          sellerName:'',
          ageSeconds:snapAge
        });
      }
      buySources.sort((a,b)=>a.price-b.price);
      const live = buySources[0] || null;
      const buyPrice = Number(live?.price || discoveryBuy);
      const profit = exit.value - buyPrice;
      const roiPct = profit > 0 ? profit / buyPrice * 100 : 0;
      const roiCeiling = Math.floor(exit.value / (1 + rules.minRoiPct / 100));
      const profitCeiling = Math.floor(exit.value - rules.minAbsoluteProfit);
      const maxBuyPrice = Math.max(0, Math.min(roiCeiling, profitCeiling));
      const priceQualified = buyPrice >= rules.minPrice && buyPrice <= rules.maxPrice && buyPrice <= maxBuyPrice;
      if (roiPct < rules.minRoiPct || profit < rules.minAbsoluteProfit) continue;

      const personal = localMetrics[id] || {};
      const personalDaily = Number(personal.sold7d||0) > 0 ? Number(personal.sold7d||0)/7 : Number(personal.sold30d||0)/30;
      const personalDemandQualified = Number(personal.sold30d||0) >= 5 || Number(personal.saleDays30d||0) >= 3;
      if (personalDemandQualified && personalDaily < rules.minDemandPerDay) continue;

      const history = intelHistoryStats(intel,id);
      const priceStability = Math.max(0,1-Math.min(1,Number(history.volatilityPct||0)/30));
      const marketDepthSignal = itemMarketFresh
        ? Math.min(1,Math.log10(1+Number(snap?.itemMarket?.totalQty||0))/2)
        : Math.min(1,Math.log10(1+sellerCount)/2);
      const historySignal = Math.min(1,Number(history.samples||0)/12);
      const personalSellThrough = 1-Math.exp(-Math.max(0,personalDaily)*3);
      const marketSellThrough = Math.max(0.10,Math.min(0.80,0.15+marketDepthSignal*0.25+historySignal*0.20+priceStability*0.20));
      const sellThrough3d = personalDemandQualified ? personalSellThrough : marketSellThrough;
      const sellThrough3dPct = sellThrough3d*100;

      const qtyCap = personalDemandQualified
        ? Math.max(1,Math.min(10,Math.ceil(Math.max(personalDaily,0.25)*3)))
        : (sellThrough3d>=0.60 ? 2 : 1);
      const recommendedQty = Math.max(1,Math.min(Number(live?.quantity||1),qtyCap));
      const expectedProfit3d = Math.max(0,profit*recommendedQty*sellThrough3d);
      const expectedProfitPerDay = expectedProfit3d/3;

      const sellerConfidence = itemMarketFresh
        ? Math.min(100,35+Math.log10(1+Number(snap?.itemMarket?.listings||0))*35)
        : Math.min(100,25+Math.log10(sellerCount+1)*35);
      const sourceFreshness = live
        ? Math.max(0,100-Math.max(0,Number(live.ageSeconds||0)-15)*(100/Math.max(30,rules.maxListingAgeSec)))
        : globalFresh.score;
      const confidence = Math.max(0,Math.min(100,
        sourceFreshness*0.40+sellerConfidence*0.25+Math.min(100,Number(history.samples||0)*6)*0.20+sellThrough3dPct*0.15
      ));
      if (confidence < rules.minConfidencePct) continue;
      const roiScore = Math.min(100,Math.max(0,roiPct)*4);
      const conversionScore = Math.min(100,sellThrough3dPct);
      const profitVelocityScore = Math.min(100,Math.log10(1+expectedProfitPerDay)*18);
      const absoluteProfitScore = Math.min(100,Math.log10(1+Math.max(0,profit))*14);
      const volatilityPenalty = Math.min(25,Number(history.volatilityPct||0)*0.75);
      const economicScore = Math.max(0,Math.min(100,
        roiScore*0.32+conversionScore*0.32+profitVelocityScore*0.18+absoluteProfitScore*0.10+sourceFreshness*0.08-volatilityPenalty
      ));
      const pulse=pulseFields(db,id,profit,nowMs);
      const score=pulse.marketPulseScore===null
        ?economicScore
        :Math.max(0,Math.min(100,economicScore*0.65+pulse.marketPulseScore*0.35));

      rows.push({
        id,
        name:String(base.itemName || db?.procurement?.catalog?.[id]?.name || ('Item '+id)),
        itemType:String(db?.procurement?.catalog?.[id]?.type || ''),
        buyPrice,maxBuyPrice,bazaarAverage,marketPrice,sellerCount,liveListingCount,traderExit,
        bestExit:exit.value,bestExitRoute:exit.route,profit,roiPct,score,economicScore,confidence,
        ...pulse,
        freshness:globalFresh,history,enriched:Boolean(detail),
        listingQty:Number(live?.quantity||0),sellerId:String(live?.sellerId||''),
        sellerName:String(live?.sellerName||''),listingVerified:Boolean(live?.source==='Bazaar'&&live?.sellerId),
        purchaseReady:Boolean(live&&priceQualified),purchaseSource:String(live?.source||'Research'),
        discoverySource,
        purchaseAgeSeconds:Number(live?.ageSeconds??Infinity),recommendedQty,sellThrough3dPct,
        conversionSource:personalDemandQualified?'PERSONAL SALES':'MARKET PROXY',
        expectedProfit3d,expectedProfitPerDay,personalDemandDaily:personalDaily,personalDemandQualified
      });
    }

    return rows.sort((a,b)=>
      Number(b.purchaseReady)-Number(a.purchaseReady) ||
      b.score-a.score ||
      b.expectedProfit3d-a.expectedProfit3d ||
      b.roiPct-a.roiPct ||
      b.confidence-a.confidence
    );
  }

  function rankPricelistUniverse(db, nowMs = Date.now()) {
    const intel=db?.marketIntel||{};
    const settings=intel.settings||{};
    const rules=businessRules(db);
    const freshness=freshnessInfo(intel.marketplaceGeneratedAt,Math.max(300,rules.maxListingAgeSec),nowMs);
    const pricelist=db?.procurement?.pricelist?.items||{};
    const personal=salesItemMetrics(db,nowMs);
    const market=new Map();
    for(const row of Object.values(intel.marketplace||{})){
      const id=asId(row?.itemId);
      if(id)market.set(id,row);
    }
    const rows=[];
    for(const [rawId,targetRow] of Object.entries(pricelist)){
      const id=asId(rawId);
      const targetBuy=Math.max(0,Number(targetRow?.buyPrice||0));
      if(!/^\d+$/.test(id)||!(targetBuy>0))continue;
      const base=market.get(id)||{};
      const catalog=db?.procurement?.catalog?.[id]||{};
      const buyPrice=Math.max(0,Number(base?.lowestPrice||0));
      const bazaarAverage=Math.max(0,Number(base?.bazaarAverage||0));
      const marketPrice=Math.max(0,Number(base?.marketPrice||catalog?.marketPrice||0));
      const sellerCount=Math.max(0,Number(base?.totalBazaars||0));
      const bazaarExit=bazaarAverage>0?Math.floor(bazaarAverage*(1-Number(settings.bazaarExitHaircutPct||0)/100)):0;
      const itemMarketNet=marketPrice>0?Math.floor(marketPrice*(1-ITEM_MARKET_FEE_RATE)):0;
      const exitOptions=[
        {route:'Bazaar',value:bazaarExit},
        {route:'Item Market Net',value:itemMarketNet}
      ].filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
      const exit=exitOptions[0]||{route:'Unknown',value:0};
      const profit=buyPrice>0&&exit.value>0?exit.value-buyPrice:0;
      const roiPct=buyPrice>0?profit/buyPrice*100:0;
      const targetDiscountPct=targetBuy>0&&buyPrice>0?(targetBuy-buyPrice)/targetBuy*100:0;
      const history=intelHistoryStats(intel,id);
      const p=personal[id]||{};
      const sales30=Math.max(0,Number(p.sold30d||0));
      const sales7=Math.max(0,Number(p.sold7d||0));
      const personalVelocity=sales30>0?Math.min(100,(sales7/7)*35+(sales30/30)*25):0;
      const marketDepth=Math.min(100,Math.log10(1+sellerCount)*45);
      const stability=Math.max(0,100-Math.min(100,Number(history.volatilityPct||0)*3));
      const confidence=Math.round(Math.max(0,Math.min(100,
        freshness.score*.45+marketDepth*.25+Math.min(100,Number(history.samples||0)*8)*.15+stability*.15
      )));
      const liquidity=Math.round(Math.max(0,Math.min(100,
        marketDepth*.55+personalVelocity*.30+Math.min(100,Number(history.samples||0)*7)*.15
      )));
      const profitScore=profit>0?Math.min(100,Math.log10(1+profit)*13):0;
      const roiScore=roiPct>0?Math.min(100,roiPct*2.5):0;
      const economicScore=Math.round(Math.max(0,Math.min(100,
        roiScore*.35+profitScore*.25+liquidity*.25+confidence*.15
      )));
      const pulse=pulseFields(db,id,profit,nowMs);
      const score=pulse.marketPulseScore===null
        ?economicScore
        :Math.round(Math.max(0,Math.min(100,economicScore*.70+pulse.marketPulseScore*.30)));
      rows.push({
        id,
        name:String(targetRow?.name||base?.itemName||catalog?.name||('Item '+id)),
        itemType:String(catalog?.type||''),
        targetBuy,buyPrice,bazaarAverage,marketPrice,sellerCount,
        buySource:buyPrice>0?'Bazaar observed':'Unknown',
        bestExit:exit.value,bestExitRoute:exit.route,profit,roiPct,targetDiscountPct,
        confidence,liquidity,score,economicScore,history,
        ...pulse,
        personalSold7d:sales7,personalSold30d:sales30,
        freshness,
        hasMarketEvidence:Boolean(buyPrice>0&&exit.value>0),
        profitable:Boolean(profit>0),
        qualifies:Boolean(
          buyPrice>0&&exit.value>0&&profit>=rules.minAbsoluteProfit&&roiPct>=rules.minRoiPct&&
          buyPrice>=rules.minPrice&&buyPrice<=rules.maxPrice
        )
      });
    }
    return rows.sort((a,b)=>
      Number(b.qualifies)-Number(a.qualifies)||
      Number(b.profitable)-Number(a.profitable)||
      b.score-a.score||
      b.profit-a.profit||
      b.roiPct-a.roiPct
    );
  }

  function rankCachedTravel(db,nowMs=Date.now()) {
    return (Array.isArray(db?.travelIntel?.rows) ? db.travelIntel.rows : [])
      .filter(r => Number(r?.stock||0) > 0 && (Number(r?.sourceProfitPerHour||0) > 0 || Number(r?.profit||0) > 0))
      .map(r => {
        const pulse=pulseFields(db,r?.itemId,Math.max(0,Number(r?.profit||0)),nowMs);
        const basePerHour=Math.max(0,Number(r?.sourceProfitPerHour||0));
        const pulseUsable=pulse.marketPulseScore!==null&&pulse.pulseFreshness&&!pulse.pulseFreshness.stale;
        const liquidityFactor=pulseUsable?0.50+Math.max(0,Math.min(100,pulse.pulseLiquidityScore))/200:1;
        return {...r,...pulse,liquidityAdjustedProfitPerHour:basePerHour*liquidityFactor};
      })
      .sort((a,b)=>
        Number(b.liquidityAdjustedProfitPerHour||0)-Number(a.liquidityAdjustedProfitPerHour||0) ||
        Number(b.sourceProfitPerHour||0)-Number(a.sourceProfitPerHour||0) ||
        Number(b.profit||0)-Number(a.profit||0) ||
        Number(b.stock||0)-Number(a.stock||0)
      );
  }

  const api = Object.freeze({
    businessRules,
    freshnessInfo,
    salesItemMetrics,
    pulseSignals,pulseFields,
    rankCachedOpportunities,
    rankPricelistUniverse,
    rankCachedTravel
  });

  Object.defineProperty(globalThis,'MMTornAcquisitionsLogic',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();


;globalThis.__MM_ACQ_PDA_STAGE='logic';


/* ===== Acquisitions live service (bundled) ===== */

(() => {
  'use strict';

  const API_BASE = 'https://api.torn.com/v2';
  const WEAV_BASE = 'https://weav3r.dev/api';
  const ITEM_MARKET_FEE_RATE = 0.05;
  const ITEM_MARKET_RECENT_REUSE_MS = 2500;
  const MARKET_HISTORY_MAX = 240;
  const INTEL_HISTORY_MAX = 120;
  const VERIFY_MAX_AGE_SEC = 120;
  const VERIFY_SELLERS = 4;
  const marketPulse = globalThis.MMTornMarketPulse;

  const asId = value => String(value ?? '').trim();
  const nowIso = () => new Date().toISOString();

  function unixToMs(value) {
    const n = Number(value || 0);
    if (!(n > 0)) return 0;
    return n > 1e12 ? n : n * 1000;
  }

  function normalizeMarketplaceItem(row) {
    return {
      itemId:asId(row?.item_id),
      itemName:String(row?.item_name || ('Item ' + (row?.item_id || ''))),
      marketPrice:Number(row?.market_price || 0),
      bazaarAverage:Number(row?.bazaar_average || 0),
      lowestPrice:Number(row?.lowest_price || 0),
      totalBazaars:Number(row?.total_bazaars || 0),
      lowestSource:Number(row?.lowest_price || 0)>0?'Bazaar':'Unknown',
      bazaarSource:'TornW3B Bazaar observations'
    };
  }

  function normalizeListing(row) {
    return {
      itemId:asId(row?.item_id),
      uid:row?.uid == null ? null : String(row.uid),
      sellerId:asId(row?.player_id),
      sellerName:String(row?.player_name || ''),
      quantity:Math.max(0,Number(row?.quantity || 0)),
      price:Math.max(0,Number(row?.price || 0)),
      contentUpdated:unixToMs(row?.content_updated),
      lastChecked:unixToMs(row?.last_checked),
      sponsored:Number(row?.sponsored || 0) === 1
    };
  }

  function normalizeTrader(row) {
    const rating = row?.rating || {};
    return {
      traderId:asId(row?.player_id),
      traderName:String(row?.player_name || ''),
      price:Math.max(0,Number(row?.price || 0)),
      upvotes:Number(rating.upvotes || 0),
      downvotes:Number(rating.downvotes || 0),
      ratingTotal:Number(rating.total || 0),
      pricelistId:Number(row?.pricelist_id || 0),
      lastTrade:unixToMs(row?.last_trade),
      lastAction:unixToMs(row?.last_action),
      pricelistUpdated:unixToMs(row?.pricelist_updated),
      sponsored:Number(row?.sponsored || 0) === 1
    };
  }

  function genericMarketListings(data) {
    let rows = data?.itemmarket?.listings ?? data?.itemmarket ?? data?.listings ?? [];
    if (!Array.isArray(rows) && rows && typeof rows === 'object') rows = Object.values(rows);
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const item = row?.item && typeof row.item === 'object' ? row.item : {};
      const price = Number(row?.price ?? row?.cost ?? row?.listing_price ?? item.price ?? 0) || 0;
      const quantity = Number(row?.quantity ?? row?.amount ?? row?.qty ?? item.quantity ?? 1) || 1;
      return {price,quantity:Math.max(1,quantity)};
    }).filter(row=>row.price>0).sort((a,b)=>a.price-b.price);
  }

  function normalizeCatalogShop(row) {
    if (typeof row === 'string') return {name:row,price:0,country:'',quantity:0};
    const r=row&&typeof row==='object'?row:{};
    return {
      name:String(r.name ?? r.shop_name ?? r.shop ?? r.location ?? r.city ?? r.country ?? 'Shop'),
      price:Math.max(0,Number(r.price ?? r.cost ?? r.buy_price ?? r.unit_price ?? 0)||0),
      country:String(r.country ?? r.location_country ?? ''),
      quantity:Math.max(0,Number(r.quantity ?? r.stock ?? r.in_stock ?? 0)||0)
    };
  }

  function normalizeTornCatalog(data) {
    let rows=data?.items ?? data?.torn?.items ?? [];
    if(!Array.isArray(rows)&&rows&&typeof rows==='object'){
      rows=Object.entries(rows).map(([id,row])=>({id:row?.id??id,...(row&&typeof row==='object'?row:{})}));
    }
    if(!Array.isArray(rows))return [];
    return rows.map(row=>{
      const value=row?.value&&typeof row.value==='object'?row.value:{};
      const details=row?.details&&typeof row.details==='object'?row.details:{};
      const baseStats=details?.stats&&typeof details.stats==='object'?details.stats:{};
      let shopRows=value.shops ?? row?.shops ?? [];
      if(!Array.isArray(shopRows)&&shopRows&&typeof shopRows==='object')shopRows=Object.values(shopRows);
      const shops=(Array.isArray(shopRows)?shopRows:[]).map(normalizeCatalogShop);
      const marketPrice=Math.max(0,Number(value.market_price ?? row?.market_price ?? 0)||0);
      const buyPrice=Math.max(0,Number(value.buy_price ?? row?.buy_price ?? 0)||0);
      const sellPrice=Math.max(0,Number(value.sell_price ?? row?.sell_price ?? 0)||0);
      const id=asId(row?.id ?? row?.item_id);
      const name=String(row?.name ?? row?.item_name ?? '').trim();
      return {
        id,name,
        type:String(row?.type ?? row?.category ?? 'Other').trim()||'Other',
        subType:String(row?.sub_type ?? row?.subtype ?? '').trim(),
        weaponCategory:String(details?.category ?? row?.weapon_category ?? '').trim(),
        baseStats:{
          damage:Math.max(0,Number(baseStats?.damage||0)||0),
          accuracy:Math.max(0,Number(baseStats?.accuracy||0)||0),
          armor:Math.max(0,Number(baseStats?.armor||0)||0)
        },
        image:String(row?.image ?? ''),
        marketPrice,buyPrice,sellPrice,
        circulation:Math.max(0,Number(row?.circulation ?? 0)||0),
        isTradable:row?.is_tradable!==false&&row?.tradable!==false,
        shops,
        buyable:Boolean(marketPrice>0||buyPrice>0||shops.some(shop=>Number(shop.price||0)>0))
      };
    }).filter(row=>/^\d+$/.test(row.id)&&row.name);
  }

  function normalizePricelistRows(data) {
    const rows=Array.isArray(data)?data:(Array.isArray(data?.items)?data.items:[]);
    return rows.map(row=>({
      itemId:asId(row?.itemId??row?.itemID??row?.item_id),
      name:String(row?.name??row?.itemName??'').trim(),
      buyPrice:Math.max(0,Number(row?.buyPrice??row?.price??0)||0),
      bulkThreshold:Math.max(0,Number(row?.bulkThreshold??0)||0),
      bulkBuyPrice:Math.max(0,Number(row?.bulkBuyPrice??0)||0)
    })).filter(row=>row.itemId&&row.name);
  }

  function normalizeRankedBonuses(value) {
    let rows=value;
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>({
      title:String(row?.title??row?.bonus??row?.name??'').trim(),
      value:Number(row?.value??row?.percentage??row?.percent??0)||0,
      description:String(row?.description??'')
    })).filter(row=>row.title);
  }

  function canonicalRankedSource(value) {
    const raw=String(value||'').trim().toLowerCase();
    if(raw==='bazaar')return 'Bazaar';
    if(raw==='market'||raw==='item market'||raw==='item-market'||raw==='item_market')return 'Item Market';
    if(raw==='auction'||raw==='auction house'||raw==='auction-house')return 'Auction';
    return String(value||'Market').trim()||'Market';
  }

  function normalizeRankedListing(row,{source='',itemId='',itemName='',subType='',weaponCategory=''}={}) {
    const item=row?.item&&typeof row.item==='object'?row.item:{};
    const details=row?.item_details&&typeof row.item_details==='object'?row.item_details:
      (item?.details&&typeof item.details==='object'?item.details:{});
    const stats=details?.stats&&typeof details.stats==='object'?details.stats:
      (row?.stats&&typeof row.stats==='object'?row.stats:{});
    const seller=row?.seller&&typeof row.seller==='object'?row.seller:{};
    return {
      uid:asId(row?.uid??details?.uid),
      itemId:asId(row?.itemId??row?.item_id??item?.id??itemId),
      itemName:String(row?.itemName??row?.item_name??item?.name??itemName??'').trim(),
      weaponType:String(row?.weaponType??row?.weapon_type??details?.category??weaponCategory??'').trim(),
      subType:String(row?.subType??row?.sub_type??item?.sub_type??subType??'').trim(),
      rarity:String(row?.rarity??details?.rarity??'').trim().toLowerCase(),
      damage:Number(row?.damage??stats?.damage??0)||0,
      accuracy:Number(row?.accuracy??stats?.accuracy??0)||0,
      quality:Number(row?.quality??stats?.quality??0)||0,
      bonuses:normalizeRankedBonuses(row?.bonuses??details?.bonuses),
      price:Math.max(0,Number(row?.price??row?.cost??row?.listing_price??0)||0),
      quantity:Math.max(1,Number(row?.quantity??row?.amount??1)||1),
      sellerId:asId(row?.playerId??row?.player_id??seller?.id??seller?.user_id),
      sellerName:String(row?.playerName??row?.player_name??seller?.name??''),
      source:canonicalRankedSource(row?.source??source??''),
      lastUpdated:String(row?.lastUpdated??row?.lastUpdatedUnix??row?.last_updated??''),
      endsAt:Number(row?.endsAtUnix??row?.ends_at??0)||0,
      bids:Math.max(0,Number(row?.bids??0)||0),
      url:String(row?.url??row?.listingUrl??'')
    };
  }

  function normalizeAuctionHistoryRows(data,{itemId='',itemName='',subType='',weaponCategory=''}={}) {
    let rows=data?.auctionhouse??data?.auction_house??data?.listings??data?.auctions??[];
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>{
      const item=row?.item&&typeof row.item==='object'?row.item:{};
      const details=item?.details&&typeof item.details==='object'?item.details:{};
      const stats=details?.stats&&typeof details.stats==='object'?details.stats:{};
      return {
        id:asId(row?.id??row?.auction_id),
        timestamp:Number(row?.timestamp??row?.ended_at??0)||0,
        price:Math.max(0,Number(row?.price??row?.final_price??0)||0),
        bids:Math.max(0,Number(row?.bids??0)||0),
        itemId:asId(item?.id??row?.item_id??itemId),
        itemName:String(item?.name??row?.item_name??itemName??'').trim(),
        weaponType:String(details?.category??row?.weapon_type??weaponCategory??'').trim(),
        subType:String(item?.sub_type??row?.sub_type??subType??'').trim(),
        rarity:String(details?.rarity??row?.rarity??'').trim().toLowerCase(),
        uid:asId(details?.uid??row?.uid),
        damage:Number(stats?.damage??row?.damage??0)||0,
        accuracy:Number(stats?.accuracy??row?.accuracy??0)||0,
        quality:Number(stats?.quality??row?.quality??0)||0,
        bonuses:normalizeRankedBonuses(details?.bonuses??row?.bonuses)
      };
    }).filter(row=>row.price>0&&row.itemId);
  }

  function apiNextUrl(data) {
    const next=data?._metadata?.links?.next??data?.metadata?.links?.next??data?._metadata?.next??data?.pagination?.next??null;
    if(typeof next!=='string'||!next.trim())return '';
    try{return new URL(next,API_BASE+'/').toString();}catch{return '';}
  }

  function marketMetrics(rows) {
    if (!rows.length) return {lowest:0,third:0,median:0,totalQty:0,listings:0,depth1Pct:0,depth3Pct:0,depth5Pct:0};
    const prices = rows.map(r=>r.price);
    const lowest = prices[0];
    const quantityWithin = pct => rows.filter(r=>r.price<=lowest*(1+pct/100)).reduce((sum,r)=>sum+r.quantity,0);
    return {
      lowest,
      third:prices[Math.min(2,prices.length-1)],
      median:prices[Math.floor(prices.length/2)] || lowest,
      totalQty:rows.reduce((sum,r)=>sum+r.quantity,0),
      listings:rows.length,
      depth1Pct:quantityWithin(1),
      depth3Pct:quantityWithin(3),
      depth5Pct:quantityWithin(5)
    };
  }

  function listingAgeSeconds(listing, nowMs=Date.now()) {
    const best = Number(listing?.lastChecked || 0) || Number(listing?.contentUpdated || 0);
    return best > 0 ? Math.max(0,(nowMs-best)/1000) : Infinity;
  }

  function freshOrganicListings(state,itemId,nowMs=Date.now()) {
    const maxAge = Math.max(30,Number(state?.businessRules?.maxListingAgeSec || 180));
    return (state?.marketIntel?.details?.[asId(itemId)]?.organicListings || [])
      .filter(x=>!x?.sponsored && Number(x?.price||0)>0 && Number(x?.quantity||0)>0 && listingAgeSeconds(x,nowMs)<=maxAge)
      .slice().sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  }

  function bazaarSnapshotFreshness(timestamp,nowMs=Date.now()) {
    const raw=Number(timestamp||0);
    if (!(raw>0)) return {fresh:false,ageSeconds:Infinity,timestamp:0};
    const atMs=raw>1e12?raw:raw*1000;
    const ageSeconds=Math.max(0,(nowMs-atMs)/1000);
    return {fresh:ageSeconds<=VERIFY_MAX_AGE_SEC,ageSeconds,timestamp:raw};
  }

  function itemMarketPurchaseUrl(itemId,itemName='',itemType='') {
    const id=encodeURIComponent(asId(itemId));
    let url='https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID='+id+'&sortField=price&sortOrder=ASC';
    if (itemName) url+='&itemName='+encodeURIComponent(String(itemName));
    if (itemType) url+='&itemType='+encodeURIComponent(String(itemType));
    return url;
  }

  function parseTravelNumber(value) {
    const raw=String(value??'').trim().replaceAll(',','').replaceAll('$','').replaceAll('+','');
    if(!raw||raw==='—'||raw==='-')return 0;
    const m=raw.match(/(-?\d+(?:\.\d+)?)\s*([kmb])?/i);
    if(!m)return 0;
    const n=Number(m[1]);
    const mult=!m[2]?1:m[2].toLowerCase()==='k'?1e3:m[2].toLowerCase()==='m'?1e6:1e9;
    return Number.isFinite(n)?n*mult:0;
  }

  function parseTravelStockHtml(html) {
    if(typeof DOMParser==='undefined') throw new Error('DOMParser is unavailable.');
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    const table=[...doc.querySelectorAll('table')].find(t=>{
      const x=String(t.textContent||'').toLowerCase();
      return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');
    });
    if(!table)throw new Error('TornW3B Travel Stock table was not found.');
    let headers=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());
    if(!headers.length)headers=[...table.querySelectorAll('tr:first-child th')].map(x=>String(x.textContent||'').trim().toLowerCase());
    const find=tests=>headers.findIndex(h=>tests.some(re=>re.test(h)));
    const ci=find([/country/]),ii=find([/^item/,/item/]),si=find([/stock/]),hi=find([/profit.*hr/,/\$\/hr/,/per hour/]);
    const pi=headers.findIndex((h,i)=>/profit/.test(h)&&i!==hi);
    const co=find([/shop.*cost/,/^cost$/,/buy.*price/]),mi=find([/home.*market/,/market.*price/,/^market$/]);
    const out=[];
    for(const tr of [...table.querySelectorAll('tbody tr')]){
      const cells=[...tr.querySelectorAll('td')];
      if(cells.length<4)continue;
      const txt=i=>String(cells[i]?.textContent||'').replace(/\s+/g,' ').trim();
      const country=txt(ci>=0?ci:0),itemName=txt(ii>=0?ii:1);
      if(!country||!itemName)continue;
      const href=cells[ii>=0?ii:1]?.querySelector('a[href]')?.getAttribute('href')||'';
      const idm=href.match(/(?:item(?:s)?[\/=]|item_id=)(\d+)/i);
      out.push({
        country,itemId:idm?idm[1]:'',itemName,
        stock:Math.max(0,Math.round(parseTravelNumber(txt(si>=0?si:2)))),
        profit:parseTravelNumber(txt(pi>=0?pi:3)),
        sourceProfitPerHour:parseTravelNumber(txt(hi>=0?hi:4)),
        shopCost:co>=0?Math.max(0,parseTravelNumber(txt(co))):0,
        homeMarket:mi>=0?Math.max(0,parseTravelNumber(txt(mi))):0
      });
    }
    if(!out.length)throw new Error('TornW3B Travel Stock returned no readable item rows.');
    return out;
  }

  function travelHistoryKey(row) {
    return String(row?.country||'')+'|'+(asId(row?.itemId)||String(row?.itemName||'').trim().toLowerCase());
  }

  function recordTravelSnapshots(travel,rows,observedAt=Date.now()) {
    travel.history=travel.history&&typeof travel.history==='object'?travel.history:{};
    travel.settings=travel.settings&&typeof travel.settings==='object'?travel.settings:{};
    const retentionMs=Math.max(1,Number(travel.settings.historyDays||7))*86400000;
    const cutoff=Date.now()-retentionMs;
    for(const row of rows||[]){
      const key=travelHistoryKey(row);
      if(!key)continue;
      const list=Array.isArray(travel.history[key])?travel.history[key].slice():[];
      const at=Number(row?.observedAt||observedAt)||Date.now();
      const point={
        at,stock:Number(row?.stock||0),profit:Number(row?.profit||0),
        sourceProfitPerHour:Number(row?.sourceProfitPerHour||0),
        shopCost:Number(row?.shopCost||0),homeMarket:Number(row?.homeMarket||0),
        source:String(row?.source||'TornW3B Travel Stock')
      };
      const sorted=list.slice().sort((a,b)=>Number(a.at||0)-Number(b.at||0));
      const last=sorted.length?sorted[sorted.length-1]:null;
      if(!last||Number(last.stock)!==point.stock||at-Number(last.at||0)>=300000) list.push(point);
      travel.history[key]=list
        .filter(x=>Number(x?.at||0)>=cutoff)
        .sort((a,b)=>Number(a.at||0)-Number(b.at||0))
        .slice(-800);
    }
  }

  function pushIntelHistory(intel,row) {
    const id=asId(row?.itemId);
    if (!id) return;
    if (!Array.isArray(intel.history?.[id])) {
      intel.history = intel.history && typeof intel.history === 'object' ? intel.history : {};
      intel.history[id]=[];
    }
    intel.history[id].push({
      at:nowIso(),
      lowestPrice:Number(row.lowestPrice||0),
      bazaarAverage:Number(row.bazaarAverage||0),
      marketPrice:Number(row.marketPrice||0),
      totalBazaars:Number(row.totalBazaars||0)
    });
    intel.history[id]=intel.history[id].slice(-INTEL_HISTORY_MAX);
  }

  function pushMarketHistory(proc,itemId,snapshot) {
    const id=asId(itemId);
    proc.marketHistory = proc.marketHistory && typeof proc.marketHistory === 'object' ? proc.marketHistory : {};
    if (!Array.isArray(proc.marketHistory[id])) proc.marketHistory[id]=[];
    proc.marketHistory[id].push({
      at:snapshot.fetchedAt,
      itemMarketLowest:snapshot.itemMarket.lowest,
      itemMarketThird:snapshot.itemMarket.third,
      bazaarLowest:snapshot.bazaar.lowest,
      bazaarThird:snapshot.bazaar.third,
      realisticExit:snapshot.realisticExit,
      depth3Pct:snapshot.totalDepth3Pct,
      itemMarketTotalQty:Number(snapshot.itemMarket?.totalQty||0),
      bazaarTotalQty:Number(snapshot.bazaar?.totalQty||0),
      itemMarketListings:Number(snapshot.itemMarket?.listings||0),
      bazaarListings:Number(snapshot.bazaar?.listings||0)
    });
    proc.marketHistory[id]=proc.marketHistory[id].slice(-MARKET_HISTORY_MAX);
  }

  async function mapLimit(items,limit,fn) {
    const queue=items.slice();
    const out=[];
    const workers=Array.from({length:Math.max(1,Math.min(limit,queue.length||1))},async()=>{
      while(queue.length){
        const item=queue.shift();
        try { out.push({item,status:'fulfilled',value:await fn(item)}); }
        catch(error){ out.push({item,status:'rejected',reason:error}); }
      }
    });
    await Promise.all(workers);
    return out;
  }

  function createService(deps={}) {
    const core=deps.core || globalThis.MMTornCore;
    const logic=deps.logic || globalThis.MMTornAcquisitionsLogic;
    if (!core || !logic) throw new Error('MM Torn Core and Market logic are required.');
    if (typeof deps.weavRequest !== 'function') throw new Error('weavRequest dependency is required.');
    if (typeof deps.tornRequest !== 'function') throw new Error('tornRequest dependency is required.');
    if (typeof deps.bazaarRequest !== 'function') throw new Error('bazaarRequest dependency is required.');
    const hasTornKey=typeof deps.hasTornKey === 'function' ? deps.hasTornKey : ()=>true;
    const navigate=typeof deps.navigate === 'function' ? deps.navigate : url=>{ location.href=url; };

    async function refreshPricelist(userId='4054377') {
      const id=asId(userId);
      if(!/^\d+$/.test(id))throw new Error('Invalid TornW3B pricelist user ID.');
      const data=await deps.weavRequest('/pricelist/'+encodeURIComponent(id));
      const rows=normalizePricelistRows(data);
      if(!rows.length)throw new Error('TornW3B pricelist returned no readable rows.');
      const at=nowIso();
      const items={};
      let bbRate=0,priced=0;
      for(const row of rows){
        if(row.itemId==='-3'){bbRate=row.buyPrice;continue;}
        if(!/^\d+$/.test(row.itemId)||!(row.buyPrice>0))continue;
        items[row.itemId]=row;
        priced++;
      }
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        proc.pricelist={userId:id,items,bunkerBuckRate:bbRate,pricedCount:priced,lastSyncAt:at,source:'TornW3B Pricelist API'};
        return draft;
      });
      return {state:await core.readLegacyState(),rows,priced,bbRate};
    }

    async function refreshRankedLive({pagesPerType=2,auctionPages=4,limit=100}={}) {
      const types=['primary','secondary','melee'];
      const market=[];
      for(const weaponType of types){
        for(let page=1;page<=Math.max(1,Number(pagesPerType)||1);page++){
          const data=await deps.weavRequest('/ranked-weapons',{
            tab:'weapons',weaponType,sortField:'price',sortOrder:'asc',page,limit:Math.min(100,Math.max(1,Number(limit)||100))
          });
          const rows=Array.isArray(data?.weapons)?data.weapons:[];
          market.push(...rows.map(row=>normalizeRankedListing(row,{source:row?.source||'market'})));
          if(rows.length<limit)break;
        }
      }
      const auction=[];
      for(let page=1;page<=Math.max(1,Number(auctionPages)||1);page++){
        const data=await deps.weavRequest('/auction/listings',{
          tab:'weapons',source:'auction',sortField:'endsAt',sortOrder:'asc',page,limit:Math.min(100,Math.max(1,Number(limit)||100))
        });
        const rows=Array.isArray(data?.items)?data.items:[];
        auction.push(...rows.map(row=>normalizeRankedListing(row,{source:'Auction'})));
        if(!data?.hasMore||rows.length<limit)break;
      }
      const dedupe=rows=>[...new Map(rows.filter(row=>row.uid&&row.price>0).map(row=>[row.source+'|'+row.uid,row])).values()];
      const liveMarket=dedupe(market),liveAuction=dedupe(auction),at=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
        ranked.liveMarket=liveMarket;
        ranked.liveAuction=liveAuction;
        ranked.lastLiveAt=at;
        ranked.liveSource='TornW3B Bazaar + Item Market + Auction APIs';
        return draft;
      });
      return {state:await core.readLegacyState(),market:liveMarket,auction:liveAuction,at};
    }

    async function refreshRankedHistory(itemId,{days=90,maxPages=8}={}) {
      if(!hasTornKey())throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId);
      if(!/^\d+$/.test(id))throw new Error('Invalid ranked weapon item ID.');
      const before=await core.readLegacyState();
      const catalog=before?.procurement?.catalog?.[id]||{};
      const from=Math.floor((Date.now()-Math.max(7,Number(days)||90)*86400000)/1000);
      let url='/market/'+encodeURIComponent(id)+'/auctionhouse?limit=100&sort=DESC&from='+from;
      const history=[];
      const seen=new Set();
      for(let page=0;page<Math.max(1,Number(maxPages)||1)&&url;page++){
        const data=await deps.tornRequest(url);
        for(const row of normalizeAuctionHistoryRows(data,{
          itemId:id,itemName:catalog.name||'',subType:catalog.subType||'',weaponCategory:catalog.weaponCategory||''
        })){
          const key=row.id||[row.timestamp,row.uid,row.price].join('|');
          if(seen.has(key))continue;
          seen.add(key);history.push(row);
        }
        url=apiNextUrl(data);
      }
      history.sort((a,b)=>Number(b.timestamp||0)-Number(a.timestamp||0));
      const at=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
        ranked.history=ranked.history&&typeof ranked.history==='object'?ranked.history:{};
        ranked.history[id]={itemId:id,itemName:String(catalog.name||('Item '+id)),rows:history.slice(0,800),lastSyncAt:at,days:Math.max(7,Number(days)||90),source:'Torn API finished Auction House'};
        ranked.lastHistoryAt=at;
        return draft;
      });
      return {state:await core.readLegacyState(),rows:history,at};
    }

    async function refreshItemCatalog() {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const data=await deps.tornRequest('/torn/items?cat=All&sort=ASC');
      const rows=normalizeTornCatalog(data);
      if(!rows.length)throw new Error('Torn item catalog returned no readable items.');
      const syncedAt=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const previous=proc.catalog&&typeof proc.catalog==='object'?proc.catalog:{};
        const next={};
        for(const row of rows){
          next[row.id]={...(previous[row.id]||{}),...row,catalogUpdatedAt:syncedAt,catalogSource:'Torn API v2'};
        }
        proc.catalog=next;
        proc.catalogLastSyncAt=syncedAt;
        proc.catalogItemCount=rows.length;
        proc.catalogBuyableCount=rows.filter(row=>row.buyable).length;
        return draft;
      });
      return {state:await core.readLegacyState(),rows,syncedAt};
    }

    async function refreshGlobal() {
      const data=await deps.weavRequest('/marketplace');
      const generatedMs=unixToMs(data?.generated_at)||Date.now();
      const generatedIso=new Date(generatedMs).toISOString();
      let changed=false;
      await core.updateDomainState('market',draft=>{
        const intel=draft.marketIntel || (draft.marketIntel={});
        intel.marketplace = intel.marketplace && typeof intel.marketplace==='object' ? intel.marketplace : {};
        intel.history = intel.history && typeof intel.history==='object' ? intel.history : {};
        changed=String(intel.marketplaceGeneratedAt||'')!==generatedIso || !Object.keys(intel.marketplace).length;
        intel.lastWeavPollAt=nowIso();
        if (!changed) {
          intel.lastGlobalSyncAt=nowIso();
          return draft;
        }
        const next={};
        for (const raw of Array.isArray(data?.items)?data.items:[]) {
          const row=normalizeMarketplaceItem(raw);
          if (!row.itemId) continue;
          next[row.itemId]=row;
          pushIntelHistory(intel,row);
        }
        intel.marketplace=next;
        intel.marketplaceGeneratedAt=generatedIso;
        intel.lastGlobalSyncAt=nowIso();
        intel.lastWeavChangeAt=nowIso();
        return draft;
      });
      return {state:await core.readLegacyState(),changed,generatedAt:generatedIso};
    }

    async function enrichItem(itemId) {
      const id=asId(itemId);
      if (!/^\d+$/.test(id)) throw new Error('Invalid item ID.');
      const [detailResult,traderResult]=await Promise.allSettled([
        deps.weavRequest('/marketplace/'+encodeURIComponent(id),{limit:100}),
        deps.weavRequest('/marketplace/'+encodeURIComponent(id)+'/traders',{limit:100,sort:'price'})
      ]);

      await core.updateDomainState('market',draft=>{
        const intel=draft.marketIntel || (draft.marketIntel={});
        intel.details=intel.details&&typeof intel.details==='object'?intel.details:{};
        intel.traders=intel.traders&&typeof intel.traders==='object'?intel.traders:{};
        const base=intel.marketplace?.[id]||{};

        if (detailResult.status==='fulfilled') {
          const data=detailResult.value;
          const listings=(Array.isArray(data?.listings)?data.listings:[])
            .map(normalizeListing).filter(x=>x.price>0&&x.quantity>0).sort((a,b)=>a.price-b.price);
          intel.details[id]={
            itemId:id,
            itemName:String(data?.item_name||base.itemName||('Item '+id)),
            marketPrice:Number(data?.market_price||base.marketPrice||0),
            bazaarAverage:Number(data?.bazaar_average||base.bazaarAverage||0),
            generatedAt:new Date(unixToMs(data?.generated_at)||Date.now()).toISOString(),
            fetchedAt:nowIso(),
            listings,
            organicListings:listings.filter(x=>!x.sponsored)
          };
        }

        if (traderResult.status==='fulfilled') {
          const data=traderResult.value;
          const traders=(Array.isArray(data?.traders)?data.traders:[])
            .map(normalizeTrader).filter(x=>x.price>0).sort((a,b)=>b.price-a.price);
          intel.traders[id]={
            itemId:id,
            itemName:String(data?.item_name||base.itemName||('Item '+id)),
            totalCount:Number(data?.total_count||traders.length),
            generatedAt:new Date(unixToMs(data?.generated_at)||Date.now()).toISOString(),
            fetchedAt:nowIso(),
            traders,
            organicTraders:traders.filter(x=>!x.sponsored)
          };
        }
        return draft;
      });

      if (detailResult.status==='rejected' && traderResult.status==='rejected') {
        throw new Error('TornW3B detail and trader refresh both failed.');
      }
      return core.readLegacyState();
    }

    async function refreshItemMarket(itemId) {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId);
      if (!/^\d+$/.test(id)) throw new Error('Invalid item ID.');
      const data=await deps.tornRequest('/market/'+encodeURIComponent(id)+'/itemmarket?limit=25');
      const itemRows=genericMarketListings(data);
      const before=await core.readLegacyState();
      const pulseSnapshot=marketPulse?.normalizeTornItemMarket?.(
        id,
        String(before?.procurement?.catalog?.[id]?.name||before?.marketIntel?.marketplace?.[id]?.itemName||('Item '+id)),
        data,
        {fetchedAt:Date.now()}
      )||null;
      const aggregateBazaarLow=Math.max(0,Number(before?.marketIntel?.marketplace?.[id]?.lowestPrice||0));
      const bazaarRows=freshOrganicListings(before,id)
        .filter(row=>!(aggregateBazaarLow>0)||Number(row.price||0)<=aggregateBazaarLow*1.35)
        .slice(0,25).map(row=>({
          price:Number(row.price||0),quantity:Math.max(1,Number(row.quantity||1))
        }));
      if (!itemRows.length && !bazaarRows.length) throw new Error('No trusted live market listings returned.');
      const itemMarket=marketMetrics(itemRows);
      const bazaar=marketMetrics(bazaarRows);
      const realisticExit=bazaar.third||bazaar.lowest||Math.floor((itemMarket.third||itemMarket.lowest||0)*(1-ITEM_MARKET_FEE_RATE));
      const snapshot={
        itemId:id,itemMarket,bazaar,realisticExit,
        sources:{itemMarket:itemRows.length?'Torn API Item Market':null,bazaar:bazaarRows.length?'TornW3B fresh seller observations':null},
        totalDepth3Pct:Number(itemMarket.depth3Pct||0)+Number(bazaar.depth3Pct||0),
        pulseSnapshot,
        fetchedAt:nowIso()
      };
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        proc.marketSnapshots=proc.marketSnapshots&&typeof proc.marketSnapshots==='object'?proc.marketSnapshots:{};
        proc.marketSnapshots[id]=snapshot;
        pushMarketHistory(proc,id,snapshot);
        proc.lastItemMarketAt=snapshot.fetchedAt;
        if(pulseSnapshot&&marketPulse?.applySnapshotToDraft){
          marketPulse.applySnapshotToDraft(draft,pulseSnapshot,{recordRequest:true});
        }
        return draft;
      });
      return snapshot;
    }

    function recentItemMarketSnapshot(state,itemId,maxAgeMs=ITEM_MARKET_RECENT_REUSE_MS) {
      const id=asId(itemId);
      const snap=state?.procurement?.marketSnapshots?.[id]||null;
      const fetchedAt=snap?.fetchedAt?Date.parse(snap.fetchedAt):0;
      const ageMs=fetchedAt?Math.max(0,Date.now()-fetchedAt):Infinity;
      const price=Math.max(0,Number(snap?.itemMarket?.lowest||0));
      return price>0&&ageMs<=Math.max(0,Number(maxAgeMs||0))?snap:null;
    }

    async function verifyItemMarket(itemId,{allowRecentMs=ITEM_MARKET_RECENT_REUSE_MS}={}) {
      const id=asId(itemId);
      const before=await core.readLegacyState();
      const recent=recentItemMarketSnapshot(before,id,allowRecentMs);
      if(recent) return {snapshot:recent,reusedRecent:true};
      const snapshot=await refreshItemMarket(id);
      return {snapshot,reusedRecent:false};
    }

    async function verifyBazaar(itemId,sellerId,expectedPrice=0) {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId),seller=asId(sellerId);
      if (!/^\d+$/.test(id)||!/^\d+$/.test(seller)) return {verified:false,reason:'invalid-id'};
      const data=await deps.bazaarRequest(seller);
      const snapshot=bazaarSnapshotFreshness(data?.bazaar_timestamp);
      if (!snapshot.fresh) return {verified:false,reason:'snapshot-stale',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      const rows=Array.isArray(data?.bazaar)?data.bazaar:[];
      const item=rows.find(row=>asId(row?.ID??row?.id??row?.item_id)===id);
      if (!data?.bazaar_is_open) return {verified:false,reason:'bazaar-closed',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      if (!item) return {verified:false,reason:'item-gone',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      const actualPrice=Math.max(0,Number(item.price||0));
      const quantity=Math.max(0,Number(item.quantity||item.qty||0));
      const expected=Math.max(0,Number(expectedPrice||0));
      return {
        verified:true,reason:expected&&actualPrice!==expected?'price-changed':'present',
        sellerId:seller,itemId:id,itemName:String(item.name||''),actualPrice,expectedPrice:expected,
        quantity,priceChanged:Boolean(expected&&actualPrice!==expected),
        bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds
      };
    }

    async function persistBazaarResult(itemId,sellerId,result) {
      const id=asId(itemId),seller=asId(sellerId);
      await core.updateDomainState('market',draft=>{
        const detail=draft.marketIntel?.details?.[id];
        if (!detail) return draft;
        const keep=row=>asId(row?.sellerId)!==seller;
        if (!result.verified && (result.reason==='bazaar-closed'||result.reason==='item-gone')) {
          detail.organicListings=(detail.organicListings||[]).filter(keep);
          detail.listings=(detail.listings||[]).filter(keep);
          detail.fetchedAt=nowIso();
          return draft;
        }
        if (result.verified) {
          const previous=(detail.organicListings||[]).find(row=>asId(row?.sellerId)===seller)||{};
          const row={
            ...previous,itemId:id,sellerId:seller,sellerName:String(previous.sellerName||seller),
            price:Number(result.actualPrice||0),quantity:Number(result.quantity||0),
            sponsored:false,lastChecked:Date.now(),contentUpdated:Number(previous.contentUpdated||Date.now())
          };
          detail.organicListings=[row,...(detail.organicListings||[]).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
          detail.listings=[row,...(detail.listings||[]).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
          detail.fetchedAt=nowIso();
        }
        return draft;
      });
    }

    async function importTravelRows(rows,capturedAt=Date.now()) {
      const safeRows=(Array.isArray(rows)?rows:[]).map(row=>({...row,source:String(row?.source||'TornW3B Travel Stock')}));
      if(!safeRows.length)throw new Error('No travel rows to import.');
      const at=Number(capturedAt||Date.now());
      await core.updateDomainState('market',draft=>{
        const travel=draft.travelIntel || (draft.travelIntel={});
        travel.rows=safeRows;
        travel.lastSyncAt=new Date(at).toISOString();
        travel.source='TornW3B Travel Stock';
        travel.diagnostics=Array.isArray(travel.diagnostics)?travel.diagnostics:[];
        travel.diagnostics.unshift({at:nowIso(),text:'MM Acquisitions Travel import: '+safeRows.length+' rows.'});
        travel.diagnostics=travel.diagnostics.slice(0,30);
        recordTravelSnapshots(travel,safeRows,at);
        return draft;
      });
      return core.readLegacyState();
    }

    async function refreshOpportunities({enrichLimit=8,itemMarketLimit=6,refreshGlobalFirst=true}={}) {
      if(refreshGlobalFirst) await refreshGlobal();
      let state=await core.readLegacyState();
      let ranked=logic.rankCachedOpportunities(state);
      let ids=ranked.map(r=>r.id);
      if (ids.length<enrichLimit) {
        const supplements=Object.values(state?.marketIntel?.marketplace||{})
          .filter(x=>x?.itemId)
          .sort((a,b)=>{
            const pa=Math.max(Number(a.bazaarAverage||0),Number(a.marketPrice||0))-Number(a.lowestPrice||0);
            const pb=Math.max(Number(b.bazaarAverage||0),Number(b.marketPrice||0))-Number(b.lowestPrice||0);
            return pb-pa;
          }).map(x=>asId(x.itemId));
        ids=[...new Set([...ids,...supplements])];
      }
      ids=ids.slice(0,Math.max(1,enrichLimit));
      await mapLimit(ids,2,id=>enrichItem(id));
      if (hasTornKey()) await mapLimit(ids.slice(0,Math.max(1,itemMarketLimit)),2,id=>refreshItemMarket(id));
      return core.readLegacyState();
    }

    function resolveProcurementItemId(state,itemId,itemName='') {
      const explicit=asId(itemId);
      if(/^\d+$/.test(explicit)) return explicit;
      const wanted=String(itemName||'').trim().toLowerCase();
      if(!wanted) return '';
      for(const [id,row] of Object.entries(state?.procurement?.catalog||{})) {
        if(String(row?.name||'').trim().toLowerCase()===wanted) return asId(id);
      }
      for(const row of Object.values(state?.marketIntel?.marketplace||{})) {
        if(String(row?.itemName||'').trim().toLowerCase()===wanted) return asId(row?.itemId);
      }
      for(const row of state?.travelIntel?.rows||[]) {
        if(String(row?.itemName||'').trim().toLowerCase()===wanted&&asId(row?.itemId)) return asId(row.itemId);
      }
      return '';
    }

    function selectedItemExitEvidence(state,id) {
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const intel=state?.marketIntel?.marketplace?.[id]||{};
      const settings=state?.marketIntel?.settings||{};
      const bazaarHaircut=Math.max(0,Math.min(25,Number(settings?.bazaarExitHaircutPct||0)))/100;
      const bazaarExit=Math.floor(Number(intel?.bazaarAverage||0)*(1-bazaarHaircut));
      const itemMarketAsk=Math.max(0,Number(snap?.itemMarket?.lowest||0));
      const itemMarketNet=Math.floor(itemMarketAsk*(1-ITEM_MARKET_FEE_RATE));
      const candidates=[
        {route:'Bazaar',value:bazaarExit},
        {route:'Item Market Net',value:itemMarketNet}
      ].filter(row=>Number(row.value||0)>0).sort((a,b)=>b.value-a.value);
      const best=candidates[0]||{route:'Unknown',value:0};
      return {best,candidates};
    }

    async function procurementSourceOptions(itemId,itemName='') {
      let state=await core.readLegacyState();
      const id=resolveProcurementItemId(state,itemId,itemName);
      if(!id) return {itemId:'',itemName:String(itemName||''),sources:[],state};
      let itemMarketVerified=false;
      try { await enrichItem(id); } catch {}
      try {
        const verification=await verifyItemMarket(id);
        itemMarketVerified=Boolean(verification?.snapshot);
      } catch {}
      state=await core.readLegacyState();

      const catalog=state?.procurement?.catalog?.[id]||{};
      const marketplace=state?.marketIntel?.marketplace?.[id]||{};
      const resolvedName=String(itemName||catalog.name||marketplace?.itemName||('Item '+id));
      const maxAge=Math.max(30,Number(state?.businessRules?.maxListingAgeSec||180));
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const snapAge=snap.fetchedAt?Math.max(0,(Date.now()-Date.parse(snap.fetchedAt))/1000):Infinity;
      const itemMarketPrice=snapAge<=maxAge?Number(snap?.itemMarket?.lowest||0):0;
      const aggregateBazaarLow=Math.max(0,Number(marketplace?.lowestPrice||0));
      const bazaarRows=freshOrganicListings(state,id).slice(0,VERIFY_SELLERS);
      const namedBest=bazaarRows[0]||null;
      const namedPrice=Math.max(0,Number(namedBest?.price||0));
      const namedConsistent=Boolean(namedBest&&(
        !(aggregateBazaarLow>0) ||
        namedPrice<=aggregateBazaarLow*1.35
      ));
      const bestBazaar=namedConsistent?namedBest:null;
      const travelRows=(state?.travelIntel?.rows||[])
        .filter(row=>Number(row?.stock||0)>0&&(
          asId(row?.itemId)===id||
          String(row?.itemName||'').trim().toLowerCase()===resolvedName.trim().toLowerCase()
        ))
        .slice().sort((a,b)=>(Number(a.shopCost||0)||Number.MAX_SAFE_INTEGER)-(Number(b.shopCost||0)||Number.MAX_SAFE_INTEGER));
      const bestTravel=travelRows[0]||null;

      const sources=[];
      for(const shop of Array.isArray(catalog?.shops)?catalog.shops:[]){
        if(Number(shop?.price||0)>0) sources.push({
          source:'Torn Shop',price:Number(shop.price||0),quantity:Number(shop.quantity||0),
          shopName:String(shop.name||'Shop'),country:String(shop.country||''),catalogSource:true
        });
      }
      if(bestBazaar) sources.push({
        source:'Bazaar',price:Number(bestBazaar.price||0),quantity:Number(bestBazaar.quantity||0),
        sellerId:asId(bestBazaar.sellerId),sellerName:String(bestBazaar.sellerName||''),
        verifiedCandidate:true
      });
      if(aggregateBazaarLow>0&&(!bestBazaar||Number(bestBazaar.price||0)>aggregateBazaarLow*1.05)) sources.push({
        source:'Bazaar aggregate',price:aggregateBazaarLow,quantity:0,
        sellerId:'',sellerName:'',aggregateOnly:true,
        bazaarAverage:Number(marketplace?.bazaarAverage||0),bazaarCount:Number(marketplace?.totalBazaars||0)
      });
      if(itemMarketPrice>0) sources.push({
        source:'Item Market',price:itemMarketPrice,quantity:Number(snap?.itemMarket?.depth1Pct||1),
        liveVerified:itemMarketVerified,verifiedAt:String(snap?.fetchedAt||'')
      });
      if(bestTravel) sources.push({
        source:'Overseas',
        price:Math.max(0,Number(bestTravel.shopCost||0)),
        quantity:Number(bestTravel.stock||0),
        country:String(bestTravel.country||''),
        profit:Number(bestTravel.profit||0),
        sourceProfitPerHour:Number(bestTravel.sourceProfitPerHour||0),
        priceKnown:Number(bestTravel.shopCost||0)>0,
        travelEvidence:true
      });
      sources.sort((a,b)=>{
        const ap=Number(a.price||0),bp=Number(b.price||0);
        const ak=ap>0,bk=bp>0;
        if(ak!==bk)return ak?-1:1;
        return ap-bp;
      });
      const exitEvidence=selectedItemExitEvidence(state,id);
      return {
        itemId:id,itemName:resolvedName,sources,state,
        exitValue:Number(exitEvidence.best.value||0),
        exitRoute:String(exitEvidence.best.route||'Unknown'),
        exitCandidates:exitEvidence.candidates,
        catalogReference:Number(catalog?.marketPrice||0)
      };
    }

    async function routeProcurementRequest({itemId='',itemName='',preferredSource='Best'}={}) {
      const result=await procurementSourceOptions(itemId,itemName);
      const id=result.itemId;
      if(!id) return {routed:false,reason:'item-id-unresolved',...result};
      const preferred=String(preferredSource||'Best').trim().toLowerCase();
      const sourceMatchesPreferred=source=>{
        const name=String(source?.source||'').trim().toLowerCase();
        if(preferred==='best')return true;
        if(preferred==='bazaar')return name==='bazaar'||name==='bazaar aggregate';
        if(preferred==='market'||preferred==='item market'||preferred==='item-market')return name==='item market';
        if(preferred==='travel'||preferred==='overseas')return name==='overseas';
        return name===preferred;
      };
      const ordered=result.sources.filter(sourceMatchesPreferred);
      if(!ordered.length) return {routed:false,reason:'preferred-source-unavailable',...result};
      const verificationWarnings=[];

      for(const candidate of ordered) {
        if(candidate.source==='Bazaar aggregate') {
          try { await enrichItem(id); } catch(error) {
            verificationWarnings.push({source:'Bazaar discovery',message:String(error?.message||error||'refresh failed')});
          }
          const refreshed=await core.readLegacyState();
          const aggregate=Math.max(0,Number(refreshed?.marketIntel?.marketplace?.[id]?.lowestPrice||candidate.price||0));
          const liveRows=freshOrganicListings(refreshed,id)
            .filter(row=>Number(row?.price||0)>0&&(!(aggregate>0)||Number(row.price)<=aggregate*1.35))
            .slice(0,VERIFY_SELLERS);
          for(const row of liveRows){
            let verify;
            try{
              verify=await verifyBazaar(id,row.sellerId,row.price);
            }catch(error){
              verificationWarnings.push({
                source:'Bazaar',sellerId:asId(row.sellerId),
                message:String(error?.message||error||'verification failed')
              });
              continue;
            }
            await persistBazaarResult(id,row.sellerId,verify);
            if(!verify.verified)continue;
            const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(row.sellerId));
            navigate(url);
            return {routed:true,source:'Bazaar',url,verified:verify,verificationWarnings,...result};
          }
          continue;
        }
        if(candidate.source==='Bazaar') {
          let verify;
          try{
            verify=await verifyBazaar(id,candidate.sellerId,candidate.price);
          }catch(error){
            verificationWarnings.push({
              source:'Bazaar',sellerId:asId(candidate.sellerId),
              message:String(error?.message||error||'verification failed')
            });
            continue;
          }
          await persistBazaarResult(id,candidate.sellerId,verify);
          if(!verify.verified) continue;
          const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(candidate.sellerId));
          navigate(url);
          return {routed:true,source:'Bazaar',url,verified:verify,verificationWarnings,...result};
        }
        if(candidate.source==='Item Market') {
          let fresh=null;
          try{
            const verifiedAt=candidate?.verifiedAt?Date.parse(candidate.verifiedAt):0;
            const verifiedAgeMs=verifiedAt?Math.max(0,Date.now()-verifiedAt):Infinity;
            if(candidate.liveVerified&&verifiedAgeMs<=ITEM_MARKET_RECENT_REUSE_MS){
              fresh=(await core.readLegacyState())?.procurement?.marketSnapshots?.[id]||null;
            }
            if(!fresh){
              const verification=await verifyItemMarket(id);
              fresh=verification?.snapshot||null;
            }
          }catch(error){
            verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'verification failed')});
            continue;
          }
          const livePrice=Number(fresh?.itemMarket?.lowest||0);
          if(!(livePrice>0)) continue;
          const catalog=(await core.readLegacyState())?.procurement?.catalog?.[id]||{};
          const url=itemMarketPurchaseUrl(id,result.itemName,catalog.type||'');
          navigate(url);
          return {routed:true,source:'Item Market',url,price:livePrice,verificationWarnings,...result};
        }
        if(candidate.source==='Overseas') {
          return {
            routed:false,reason:'overseas-recommended',recommendedSource:'Overseas',
            country:String(candidate.country||''),price:Number(candidate.price||0),stock:Number(candidate.quantity||0),
            profit:Number(candidate.profit||0),sourceProfitPerHour:Number(candidate.sourceProfitPerHour||0),
            priceKnown:Boolean(candidate.priceKnown),verificationWarnings,
            ...result
          };
        }
        if(candidate.source==='Torn Shop') {
          return {
            routed:false,reason:'shop-recommended',recommendedSource:'Torn Shop',
            shopName:String(candidate.shopName||'Torn shop'),country:String(candidate.country||''),
            price:Number(candidate.price||0),stock:Number(candidate.quantity||0),verificationWarnings,
            ...result
          };
        }
      }
      return {
        routed:false,
        reason:verificationWarnings.length?'live-verification-unavailable':'source-verification-failed',
        verificationWarnings,
        ...result
      };
    }

    async function acquire(itemId) {
      if (!hasTornKey()) return {routed:false,reason:'api-key-required'};
      const id=asId(itemId);
      const verificationWarnings=[];
      let verifiedItemMarketSnapshot=null;
      try {
        await enrichItem(id);
      } catch(error) {
        verificationWarnings.push({source:'Bazaar discovery',message:String(error?.message||error||'refresh failed')});
      }
      try {
        const verification=await verifyItemMarket(id);
        verifiedItemMarketSnapshot=verification?.snapshot||null;
      } catch(error) {
        verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'refresh failed')});
      }
      let state=await core.readLegacyState();
      let opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id);
      if (!opportunity) return {routed:false,reason:'no-qualified-opportunity',verificationWarnings};

      const maxBuy=Math.max(0,Number(opportunity.maxBuyPrice||0));
      const bazaarCandidates=freshOrganicListings(state,id)
        .filter(row=>Number(row.price||0)>0&&(!maxBuy||Number(row.price||0)<=maxBuy))
        .slice(0,VERIFY_SELLERS);
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const maxAge=Math.max(30,Number(state?.businessRules?.maxListingAgeSec||180));
      const snapAge=snap.fetchedAt?Math.max(0,(Date.now()-Date.parse(snap.fetchedAt))/1000):Infinity;
      const itemPrice=snapAge<=maxAge?Number(snap?.itemMarket?.lowest||0):0;
      const candidates=[
        ...bazaarCandidates.map(row=>({source:'Bazaar',price:Number(row.price||0),row})),
        ...(itemPrice>0&&(!maxBuy||itemPrice<=maxBuy)?[{source:'Item Market',price:itemPrice}]:[])
      ].sort((a,b)=>a.price-b.price);

      for (const candidate of candidates) {
        if (candidate.source==='Bazaar') {
          let result;
          try{
            result=await verifyBazaar(id,candidate.row.sellerId,candidate.row.price);
          }catch(error){
            verificationWarnings.push({
              source:'Bazaar',sellerId:asId(candidate.row.sellerId),
              message:String(error?.message||error||'verification failed')
            });
            continue;
          }
          await persistBazaarResult(id,candidate.row.sellerId,result);
          if (!result.verified) continue;
          if (maxBuy>0&&Number(result.actualPrice||0)>maxBuy) continue;
          const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(candidate.row.sellerId));
          navigate(url);
          return {routed:true,source:'Bazaar',url,verified:result,verificationWarnings};
        }

        let fresh=verifiedItemMarketSnapshot;
        if(!fresh){
          try{
            const verification=await verifyItemMarket(id);
            fresh=verification?.snapshot||null;
          }catch(error){
            verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'verification failed')});
            continue;
          }
        }
        const livePrice=Number(fresh?.itemMarket?.lowest||0);
        if (!(livePrice>0)||(maxBuy>0&&livePrice>maxBuy)) continue;
        state=await core.readLegacyState();
        opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id) || opportunity;
        const catalog=state?.procurement?.catalog?.[id]||{};
        const url=itemMarketPurchaseUrl(id,opportunity.name,catalog.type||opportunity.itemType);
        navigate(url);
        return {routed:true,source:'Item Market',url,price:livePrice,verificationWarnings};
      }
      return {
        routed:false,
        reason:verificationWarnings.length?'live-verification-unavailable':'no-live-source-inside-ceiling',
        maxBuyPrice:maxBuy,
        verificationWarnings
      };
    }

    return Object.freeze({
      refreshPricelist,refreshRankedLive,refreshRankedHistory,
      refreshItemCatalog,refreshGlobal,enrichItem,refreshItemMarket,refreshOpportunities,
      verifyBazaar,acquire,procurementSourceOptions,routeProcurementRequest,itemMarketPurchaseUrl,importTravelRows
    });
  }

  Object.defineProperty(globalThis,'MMTornAcquisitionsLive',{
    value:Object.freeze({
      createService,normalizeMarketplaceItem,normalizeListing,normalizeTrader,
      genericMarketListings,normalizeCatalogShop,normalizeTornCatalog,normalizePricelistRows,
      normalizeRankedBonuses,canonicalRankedSource,normalizeRankedListing,normalizeAuctionHistoryRows,apiNextUrl,
      marketMetrics,bazaarSnapshotFreshness,itemMarketPurchaseUrl,
      parseTravelNumber,parseTravelStockHtml,recordTravelSnapshots
    }),
    configurable:true,enumerable:false,writable:false
  });
})();


;globalThis.__MM_ACQ_PDA_STAGE='live';


/* ===== Ranked profit logic (bundled) ===== */

(() => {
  'use strict';

  const DAY=86400000;
  const BB_BASE=Object.freeze({
    'pistol':4,
    'smg':4,
    'clubbing':6,
    'club':6,
    'piercing':6,
    'slashing':6,
    'shotgun':10,
    'rifle':10,
    'machine gun':14,
    'machinegun':14,
    'heavy artillery':14,
    'heavyartillery':14
  });

  const num=value=>{
    const n=Number(value||0);
    return Number.isFinite(n)?n:0;
  };
  const text=value=>String(value??'').trim();
  const lower=value=>text(value).toLowerCase();

  function normalizeBonuses(value){
    let rows=value;
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>({
      title:text(row?.title??row?.bonus??row?.name),
      value:num(row?.value??row?.percentage??row?.percent),
      description:text(row?.description)
    })).filter(row=>row.title);
  }

  function bonusSignature(value,{band=5,includeValues=true}={}){
    const size=Math.max(1,num(band)||5);
    return normalizeBonuses(value)
      .map(row=>{
        const title=lower(row.title);
        const bucket=Math.floor(Math.max(0,row.value)/size)*size;
        return includeValues?title+'@'+bucket:title;
      })
      .sort()
      .join('|');
  }

  function normalizeRarity(value){
    const r=lower(value);
    return r==='yellow'||r==='orange'||r==='red'?r:'';
  }

  function bunkerBuckUnits({subType='',rarity='',bonuses=[]}={}){
    const key=lower(subType).replace(/\s+/g,' ');
    const compact=key.replace(/\s+/g,'');
    const base=BB_BASE[key]||BB_BASE[compact]||0;
    const r=normalizeRarity(rarity);
    if(!(base>0)||!r)return 0;
    const rarityFactor=r==='yellow'?1:r==='orange'?3:9;
    const effectFactor=normalizeBonuses(bonuses).length>=2?1.5:1;
    return Math.round(base*rarityFactor*effectFactor);
  }

  function quantile(values,q){
    const rows=(values||[]).map(num).filter(x=>x>0).sort((a,b)=>a-b);
    if(!rows.length)return 0;
    if(rows.length===1)return rows[0];
    const p=Math.max(0,Math.min(1,num(q)));
    const idx=(rows.length-1)*p;
    const lo=Math.floor(idx),hi=Math.ceil(idx);
    if(lo===hi)return rows[lo];
    return rows[lo]+(rows[hi]-rows[lo])*(idx-lo);
  }

  function robustPrices(values){
    const rows=(values||[]).map(num).filter(x=>x>0).sort((a,b)=>a-b);
    if(rows.length<4)return rows;
    const q1=quantile(rows,.25),q3=quantile(rows,.75),iqr=Math.max(0,q3-q1);
    if(!(iqr>0))return rows;
    const lo=Math.max(0,q1-1.5*iqr),hi=q3+1.5*iqr;
    const filtered=rows.filter(x=>x>=lo&&x<=hi);
    return filtered.length>=Math.max(3,Math.floor(rows.length*.5))?filtered:rows;
  }

  function normalizedHistoryRow(row){
    const item=row?.item&&typeof row.item==='object'?row.item:{};
    const details=item?.details&&typeof item.details==='object'?item.details:
      (row?.itemDetails&&typeof row.itemDetails==='object'?row.itemDetails:{});
    const stats=details?.stats&&typeof details.stats==='object'?details.stats:
      (row?.stats&&typeof row.stats==='object'?row.stats:{});
    return {
      id:text(row?.id??row?.auctionId??row?.auction_id),
      timestamp:num(row?.timestamp??row?.endedAt??row?.ended_at),
      price:num(row?.price??row?.finalPrice??row?.final_price),
      bids:num(row?.bids),
      itemId:text(item?.id??row?.itemId??row?.item_id),
      itemName:text(item?.name??row?.itemName??row?.item_name),
      weaponType:text(row?.weaponType??row?.weapon_type??item?.details?.category??item?.category),
      subType:text(item?.sub_type??item?.subType??row?.subType??row?.sub_type),
      rarity:normalizeRarity(details?.rarity??row?.rarity),
      uid:text(details?.uid??row?.uid),
      damage:num(stats?.damage??row?.damage),
      accuracy:num(stats?.accuracy??row?.accuracy),
      quality:num(stats?.quality??row?.quality),
      bonuses:normalizeBonuses(details?.bonuses??row?.bonuses),
      source:text(row?.source),
      lastUpdated:text(row?.lastUpdated??row?.last_updated??row?.lastUpdatedUnix),
      endsAt:num(row?.endsAt??row?.endsAtUnix??row?.ends_at),
      sellerId:text(row?.sellerId??row?.playerId??row?.player_id),
      sellerName:text(row?.sellerName??row?.playerName??row?.player_name),
      quantity:Math.max(1,num(row?.quantity)||1),
      url:text(row?.url??row?.listingUrl)
    };
  }

  function comparableHistory(history,candidate,settings={}){
    const c=normalizedHistoryRow(candidate);
    const days=Math.max(7,num(settings.historyDays)||90);
    const now=num(settings.now)||Date.now();
    const cutoff=now-days*DAY;
    const base=(history||[]).map(normalizedHistoryRow)
      .filter(row=>row.price>0&&row.itemId===c.itemId&&(!row.timestamp||row.timestamp*1000>=cutoff));
    const rarity=base.filter(row=>!c.rarity||row.rarity===c.rarity);
    const exactTitle=bonusSignature(c.bonuses,{includeValues:false});
    const exactBand=bonusSignature(c.bonuses,{band:settings.bonusBand||5,includeValues:true});
    const sameTitles=rarity.filter(row=>bonusSignature(row.bonuses,{includeValues:false})===exactTitle);
    const sameBands=sameTitles.filter(row=>bonusSignature(row.bonuses,{band:settings.bonusBand||5,includeValues:true})===exactBand);
    const min=Math.max(1,Math.round(num(settings.minComparableSales)||3));
    if(sameBands.length>=min)return {tier:'BONUS ROLL',specificity:1,rows:sameBands};
    if(sameTitles.length>=min)return {tier:'BONUS',specificity:.82,rows:sameTitles};
    if(rarity.length>=min)return {tier:'RARITY',specificity:.62,rows:rarity};
    return {tier:'BASE',specificity:.42,rows:base};
  }

  function salesVolume(history,candidate,now=Date.now()){
    const c=normalizedHistoryRow(candidate);
    const rows=(history||[]).map(normalizedHistoryRow).filter(row=>row.itemId===c.itemId&&row.timestamp>0);
    const count=days=>rows.filter(row=>now-row.timestamp*1000<=days*DAY).length;
    return {d7:count(7),d30:count(30),d90:count(90),total:rows.length};
  }

  function historyValuation(history,candidate,settings={}){
    const now=num(settings.now)||Date.now();
    const cohort=comparableHistory(history,candidate,{...settings,now});
    const filtered=robustPrices(cohort.rows.map(row=>row.price));
    const median=quantile(filtered,.5),p25=quantile(filtered,.25),p75=quantile(filtered,.75);
    const times=cohort.rows.map(row=>row.timestamp).filter(x=>x>0).sort((a,b)=>b-a);
    const newest=times[0]?times[0]*1000:0;
    const recency=newest?Math.max(0,Math.min(1,1-(now-newest)/(90*DAY))):0;
    const sample=Math.min(1,filtered.length/12);
    const confidence=filtered.length
      ?Math.round(100*Math.max(0,Math.min(1,cohort.specificity*.55+sample*.30+recency*.15)))
      :0;
    const recent=cohort.rows.filter(row=>row.timestamp>0&&now-row.timestamp*1000<=30*DAY).map(row=>row.price);
    const older=cohort.rows.filter(row=>row.timestamp>0&&now-row.timestamp*1000>30*DAY&&now-row.timestamp*1000<=90*DAY).map(row=>row.price);
    const recentMedian=quantile(robustPrices(recent),.5);
    const olderMedian=quantile(robustPrices(older),.5);
    const trendPct=olderMedian>0&&recentMedian>0?(recentMedian-olderMedian)/olderMedian*100:0;
    return {
      cohort:cohort.tier,samples:filtered.length,median,p25,p75,confidence,trendPct,
      newestAt:newest?new Date(newest).toISOString():''
    };
  }

  function evaluateListing(listing,history,settings={}){
    const row=normalizedHistoryRow(listing);
    const ask=num(listing?.price??row.price);
    const bbRate=Math.max(0,num(settings.bbRate));
    const units=bunkerBuckUnits(row);
    const bbFloor=units*bbRate;
    const historyValue=historyValuation(history,row,settings);
    const auctionValue=historyValue.median;
    const fairValue=Math.max(bbFloor,auctionValue);
    const profit=fairValue>0&&ask>0?fairValue-ask:0;
    const roiPct=ask>0?profit/ask*100:0;
    const volume=salesVolume(history,row,num(settings.now)||Date.now());
    const auctionHistoryLiquidityScore=Math.round(Math.max(0,Math.min(100,
      Math.log1p(volume.d30)*24+Math.log1p(volume.d90)*12
    )));
    const marginScore=fairValue>0?Math.max(0,Math.min(100,profit/fairValue*100)):0;
    const roiScore=Math.max(0,Math.min(100,roiPct));
    const confidence=historyValue.confidence;
    const now=num(settings.now)||Date.now();
    const pulse=settings?.pulseByItem?.[String(row.itemId)]||null;
    const pulseFetchedAt=Math.max(0,num(pulse?.fetchedAt));
    const pulseAgeMs=pulseFetchedAt?Math.max(0,now-pulseFetchedAt):Infinity;
    const pulseTtlMs=Math.max(10*60*1000,num(settings.pulseTtlMs)||45*60*1000);
    const pulseConfidencePct=Math.max(0,Math.min(100,num(pulse?.confidencePct)));
    const pulseUsable=Boolean(pulse&&pulseAgeMs<=pulseTtlMs&&pulseConfidencePct>=30);
    const pulseLiquidityScore=pulseUsable?Math.max(0,Math.min(100,num(pulse?.liquidityScore))):0;
    const observedEventsPerHour=pulseUsable?Math.max(0,num(pulse?.observedEventsPerHour)):0;
    const observedUnitsPerHour=pulseUsable?Math.max(0,num(pulse?.observedUnitsPerHour)):0;
    const turnoverPerHour=pulseUsable?Math.max(0,num(pulse?.turnoverPerHour)):0;
    const profitVelocityPerHour=pulseUsable?Math.max(0,profit)*observedUnitsPerHour:0;
    const pulseVelocityScore=pulseUsable?Math.max(0,Math.min(100,(Math.log10(1+profitVelocityPerHour)-4)*22)):0;
    const liquidity=Math.round(pulseUsable
      ?Math.max(0,Math.min(100,auctionHistoryLiquidityScore*.58+pulseLiquidityScore*.42))
      :auctionHistoryLiquidityScore);
    const isAuction=lower(row.source)==='auction';
    const investmentScore=Math.round(Math.max(0,Math.min(100,
      pulseUsable
        ?roiScore*.34+liquidity*.27+confidence*.17+marginScore*.08+pulseVelocityScore*.14
        :roiScore*.40+liquidity*.30+confidence*.20+marginScore*.10
    )));
    const endMs=Math.max(0,num(row.endsAt))*1000;
    const hoursRemaining=endMs>now?(endMs-now)/3600000:0;
    const auctionUrgencyScore=isAuction&&endMs>now
      ?Math.round(Math.max(0,Math.min(100,(1-Math.min(1,hoursRemaining/24))*100)))
      :0;
    const auctionDiscountScore=isAuction&&fairValue>0&&ask>0
      ?Math.round(Math.max(0,Math.min(100,(1-ask/fairValue)*100)))
      :0;
    const auctionWatchScore=isAuction
      ?Math.round(Math.max(0,Math.min(100,
        confidence*.35+liquidity*.25+auctionUrgencyScore*.25+auctionDiscountScore*.15
      )))
      :0;
    const sortScore=isAuction?auctionWatchScore:investmentScore;
    const bonuses=normalizeBonuses(row.bonuses);
    const lowTier=(settings.lowTierBonuses||['Achilles','Conserve'])
      .map(lower).some(title=>bonuses.some(b=>lower(b.title)===title));
    const valuationSource=bbFloor>0&&auctionValue>0
      ?(bbFloor>=auctionValue?'BB FLOOR + AH':'AH + BB FLOOR')
      :bbFloor>0?'BB FLOOR':auctionValue>0?'AH HISTORY':'NO VALUE';
    return {
      ...row,price:ask,bbUnits:units,bbRate,bbFloor,auctionValue,fairValue,profit,roiPct,
      volume7:volume.d7,volume30:volume.d30,volume90:volume.d90,
      liquidityScore:liquidity,auctionHistoryLiquidityScore,investmentScore,auctionWatchScore,auctionUrgencyScore,auctionDiscountScore,
      pulseTier:pulseUsable?String(pulse?.tier||'observed'):'unknown',
      pulseLiquidityScore,pulseConfidencePct:pulseUsable?pulseConfidencePct:0,
      observedEventsPerHour,observedUnitsPerHour,turnoverPerHour,profitVelocityPerHour,
      pulseMarketDepth:pulseUsable?Math.max(0,num(pulse?.marketDepth)):0,
      pulseTrendPct:pulseUsable?num(pulse?.trendPct):0,
      pulseFreshness:pulseUsable?(pulseAgeMs<=60_000?'FRESH':pulseAgeMs<=5*60_000?'GOOD':'AGING'):'UNKNOWN',
      pulseSourceTimestamp:pulseUsable?Math.max(0,num(pulse?.sourceTimestamp)):0,
      pulseFetchedAt:pulseUsable?pulseFetchedAt:0,
      pulseUpstreamCacheDelayMs:pulseUsable?Math.max(0,num(pulse?.upstreamCacheDelayMs)):0,
      hoursRemaining,sortScore,isAuction,lowTier,valuationSource,
      history:historyValue
    };
  }

  function rankListings(listings,history,settings={}){
    const minRoi=num(settings.minRoiPct);
    const minConfidence=Math.max(0,num(settings.minConfidencePct));
    return (listings||[])
      .map(row=>evaluateListing(row,history,settings))
      .filter(row=>row.price>0&&row.fairValue>0&&row.roiPct>=minRoi&&row.history.confidence>=minConfidence)
      .sort((a,b)=>b.sortScore-a.sortScore||b.history.confidence-a.history.confidence||b.liquidityScore-a.liquidityScore||b.roiPct-a.roiPct||b.profit-a.profit);
  }

  Object.defineProperty(globalThis,'MMTornRankedProfitLogic',{
    value:Object.freeze({
      normalizeBonuses,bonusSignature,normalizeRarity,bunkerBuckUnits,quantile,robustPrices,
      normalizedHistoryRow,comparableHistory,salesVolume,historyValuation,evaluateListing,rankListings
    }),
    configurable:true,enumerable:false,writable:false
  });
})();

;globalThis.__MM_ACQ_PDA_STAGE='ranked';


/* ===== Purchase ledger logic (bundled) ===== */

(() => {
  'use strict';
  const ACQUISITION_LOG_IDS=Object.freeze({1112:'Item Market',1225:'Bazaar'});
  const asId=v=>String(v??'').trim();
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  function ensureProcurement(proc={}){
    const out=proc&&typeof proc==='object'?proc:{};
    out.catalog=out.catalog&&typeof out.catalog==='object'&&!Array.isArray(out.catalog)?out.catalog:{};
    out.acquisitions=Array.isArray(out.acquisitions)?out.acquisitions:[];
    out.acquisitionProcessed=out.acquisitionProcessed&&typeof out.acquisitionProcessed==='object'&&!Array.isArray(out.acquisitionProcessed)?out.acquisitionProcessed:{};
    return out;
  }
  function normalizeItems(raw){
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,row])=>row&&typeof row==='object'?{id,...row}:{id,quantity:row});
    return [];
  }
  function parseAcquisitionLog(entry,source,catalog={}){
    const data=entry?.data&&typeof entry.data==='object'?entry.data:{};
    const rawItems=normalizeItems(data.items??(data.item?[data.item]:[]));if(!rawItems.length)return [];
    const costEach=n(data.cost_each??data.price_each??data.unit_price),costTotal=n(data.cost_total??data.total??data.price_total);
    const totalQty=rawItems.reduce((sum,item)=>sum+Math.max(1,n(item?.qty??item?.quantity)||1),0);
    let timestamp=n(entry?.timestamp??entry?.time);if(timestamp>0&&timestamp<100_000_000_000)timestamp*=1000;if(!timestamp)return [];
    return rawItems.map((item,index)=>{
      const id=asId(item?.id??item?.item_id??item?.item?.id),quantity=Math.max(1,n(item?.qty??item?.quantity)||1);
      const explicit=n(item?.price??item?.cost_each??item?.unit_price),allocatedUnitCost=explicit||costEach||(costTotal&&totalQty?costTotal/totalQty:0);
      const externalId='logbuy:'+String(entry?.id??entry?.log_id??timestamp)+':'+id+':'+index;
      return {id:externalId,externalId,itemId:id,itemName:String(catalog?.[id]?.name||item?.name||item?.item_name||('Item '+id)),source:String(source||'Unknown'),quantity,unitCost:allocatedUnitCost,
        notes:'Auto-imported from Torn purchase log',sellerId:asId(data.seller??data.seller_id??data.user??data.user_id??data.player??data.player_id??''),sellerName:String(data.seller_name??data.user_name??data.player_name??''),acquiredAt:new Date(timestamp).toISOString(),logId:String(entry?.id??entry?.log_id??'')};
    }).filter(row=>row.itemId&&row.quantity>0&&row.unitCost>=0);
  }
  function mergeAcquisitionLogRows(proc,rows,source){
    proc=ensureProcurement(proc);let added=0;
    for(const entry of rows||[])for(const lot of parseAcquisitionLog(entry,source,proc.catalog)){if(proc.acquisitionProcessed[lot.externalId])continue;proc.acquisitions.push(lot);proc.acquisitionProcessed[lot.externalId]=true;added++;}
    proc.acquisitions.sort((a,b)=>(Date.parse(a.acquiredAt||'')||0)-(Date.parse(b.acquiredAt||'')||0));return added;
  }
  function syncWindowStart(proc,at=Date.now(),maxLookbackDays=180,overlapHours=24){
    ensureProcurement(proc);const floor=Number(at)-Math.max(1,n(maxLookbackDays))*86400000;const last=Date.parse(proc.lastAcquisitionSyncAt||'')||0;
    return last?Math.max(floor,last-Math.max(1,n(overlapHours))*3600000):floor;
  }
  const api=Object.freeze({ACQUISITION_LOG_IDS,ensureProcurement,parseAcquisitionLog,mergeAcquisitionLogRows,syncWindowStart});
  Object.defineProperty(globalThis,'MMTornAcquisitionLedger',{value:api,configurable:true,enumerable:false,writable:false});
})();

;globalThis.__MM_ACQ_PDA_STAGE='ledger';


/* ===== Acquisitions UI ===== */

(() => {
  'use strict';

  const ROOT_ID='mm-acquisitions';
  const LAUNCHER_ID='mm-acquisitions-launcher';
  const API_KEY='mm_acquisitions_api_v1';
  const TRAVEL_FEED_KEY='mm_acquisitions_travel_feed_v1';
  const TRAVEL_RETURN_KEY='mm_acquisitions_travel_return_v1';
  const WEAV_WATCH_LEASE_KEY='mm_acquisitions_weav_watch_lease_v1';
  const PULSE_LEASE_KEY='mm_acquisitions_market_pulse_lease_v1';
  const CHANNEL='mm_bazaar_crm_cross_tab_v1';
  const INSTANCE_ID='acq-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
  const AUTO_REFRESH_MS=60_000;
  const PURCHASE_STALE_MS=120_000;
  const OPPORTUNITY_STALE_MS=300_000;
  const TRAVEL_FRESH_MS=300_000;
  const TRAVEL_STALE_MS=900_000;
  const TRAVEL_CONTEXT_REFRESH_MS=60_000;
  const CATALOG_STALE_MS=24*60*60*1000;
  const ITEM_PAGE_SIZE=75;
  const RANKED_PAGE_SIZE=30;
  const RANKED_LIVE_STALE_MS=300_000;
  const PRICELIST_STALE_MS=3600_000;
  const DEFAULT_PRICELIST_USER_ID='4054377';
  const PANEL_OPEN_KEY='mm_acquisitions_panel_open_v1';

  let activeView='home';
  let state=null;
  let loadError='';
  let statusText='Ready.';
  let busy=false;
  let watchRunning=false;
  let watchTimer=null;
  let autoRefreshRunning=false;
  let autoRefreshTimer=null;
  let channel=null;
  let armoryRequest=null;
  let armorySources=null;
  let travelContext=null;
  let travelContextCheckedAt=0;
  let itemQuery='';
  let itemCategory='All';
  let itemAvailability='buyable';
  let itemSort='name';
  let itemPage=0;
  let itemSelection=null;
  let itemSources=null;
  let verifiedSalesItemId='';
  let rankedType='all';
  let rankedSource='all';
  let rankedRarity='all';
  let rankedBonus='';
  let rankedWeapon='';
  let rankedMinRoi=0;
  let rankedPage=0;
  let renderedView='';
  const detailOpenState=new Map();
  const viewScrollTop=new Map();

  const core=globalThis.MMTornCore;
  const pulse=globalThis.MMTornMarketPulse;
  const logic=globalThis.MMTornAcquisitionsLogic;
  const live=globalThis.MMTornAcquisitionsLive;
  const rankedLogic=globalThis.MMTornRankedProfitLogic;
  const ledger=globalThis.MMTornAcquisitionLedger;

  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money=value=>'$'+Math.max(0,Number(value)||0).toLocaleString('en-US',{maximumFractionDigits:0});
  const apiKey=()=>{const saved=String(GM_getValue(API_KEY,'')||'').trim();if(saved)return saved;const pda=String(__MM_PDA_API_KEY||'').trim();const unresolved='###PDA-'+'APIKEY###';return pda&&pda!==unresolved?pda:'';};

  function button(primary=false){
    return 'border:1px solid '+(primary?'#9a7b35':'#555')+';background:'+(primary?'#4b3b18':'#232323')+';color:#eee;border-radius:6px;padding:7px 10px;cursor:pointer;font:12px Arial,sans-serif;';
  }

  function inputCss(){
    return 'box-sizing:border-box;background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:7px;font:12px Arial,sans-serif;';
  }

  function card(html){
    return '<div style="border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;margin-bottom:7px;">'+html+'</div>';
  }

  function age(value){
    const ms=Date.parse(value||'');
    if(!ms)return 'not synced';
    const sec=Math.max(0,Math.floor((Date.now()-ms)/1000));
    if(sec<60)return sec+'s ago';
    if(sec<3600)return Math.floor(sec/60)+'m ago';
    if(sec<86400)return Math.floor(sec/3600)+'h ago';
    return Math.floor(sec/86400)+'d ago';
  }

  function pulseLine(row={},itemId='',unitProfit=0){
    const p=(row&&row.pulseTier)?row:(logic?.pulseFields?.(state,itemId,unitProfit)||{});
    const tier=String(p?.pulseTier||'unknown');
    if(tier==='unknown')return '<div style="font-size:10px;color:#777;margin-top:5px;"><b>Market activity:</b> still collecting enough data to judge demand.</div>';
    const freshness=typeof p?.pulseFreshness==='string'?String(p.pulseFreshness):String(p?.pulseFreshness?.label||'UNKNOWN');
    const sourceAt=Number(p?.pulseSourceTimestamp||0);
    const fetchedAt=Number(p?.pulseFetchedAt||0);
    const cacheDelaySec=Math.round(Math.max(0,Number(p?.pulseUpstreamCacheDelayMs||0))/1000);
    const tierLabel=tier==='proven'?'Strong':tier==='candidate'?'Building':'Limited';
    const tierColor=tier==='proven'?'#9fe3a8':tier==='candidate'?'#d8b96a':'#9ab7c9';
    return '<div style="margin-top:6px;padding:7px;border:1px solid #2f4638;border-radius:6px;background:#121713;font-size:10px;line-height:1.45;">'+
      '<div style="color:'+tierColor+';"><b>Market activity: '+esc(tierLabel)+'</b></div>'+
      '<div style="color:#b6c6bb;margin-top:2px;">About '+Number(p?.observedUnitsPerHour||0).toFixed(2)+' units/hour have disappeared from current Item Market listings. This suggests demand, but it is <b>not a confirmed individual sale</b>.</div>'+
      '<details style="margin-top:4px;"><summary style="cursor:pointer;color:#888;">Advanced market details</summary>'+
        '<div style="color:#888;margin-top:4px;">Movement checks '+Number(p?.observedEventsPerHour||0).toFixed(2)+'/hr · observed value '+money(p?.turnoverPerHour||0)+'/hr · resale ease '+Number(p?.pulseLiquidityScore||0).toFixed(0)+'/100 · visible stock '+Number(p?.pulseMarketDepth||0).toLocaleString()+' · confidence '+Number(p?.pulseConfidencePct||0).toFixed(0)+'% · price trend '+Number(p?.pulseTrendPct||0).toFixed(1)+'% · '+esc(freshness)+' · source '+(sourceAt?esc(age(new Date(sourceAt).toISOString())):'unknown')+' · fetched '+(fetchedAt?esc(age(new Date(fetchedAt).toISOString())):'unknown')+(cacheDelaySec?' · source cache '+cacheDelaySec+'s':'')+'</div>'+
      '</details>'+
    '</div>';
  }

  function completedSalesForItem(itemId){
    const entry=state?.procurement?.ranked?.history?.[String(itemId||'')]||{};
    const rows=Array.isArray(entry?.rows)?entry.rows:[];
    return rows.slice().sort((a,b)=>Number(b?.timestamp||0)-Number(a?.timestamp||0));
  }

  function verifiedSalesHtml(itemId){
    const id=String(itemId||'');
    const rows=completedSalesForItem(id);
    if(!id||!rows.length)return '';
    const catalog=state?.procurement?.catalog?.[id]||{};
    const name=String(catalog?.name||rows[0]?.itemName||('Item '+id));
    const entry=state?.procurement?.ranked?.history?.[id]||{};
    const visible=rows.slice(0,12);
    return '<div id="mm-acq-verified-sales" style="border:1px solid #35513f;background:#121713;border-radius:8px;padding:9px;margin:7px 0;">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Verified Sales · '+esc(name)+'</b>'+
          '<div style="font-size:10px;color:#8b9b91;margin-top:2px;">Official Torn API finished Auction House records · '+rows.length.toLocaleString()+' loaded · updated '+esc(age(entry?.lastSyncAt||''))+'.</div>'+
        '</div>'+
        '<button data-sales-close="1" style="'+button(false)+'padding:5px 7px;">Hide</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#777;margin-top:5px;">These are completed auctions, not current asking prices. They are evidence for realized sale prices and are used only where the ranked valuation model permits.</div>'+
      '<div style="margin-top:6px;">'+visible.map(row=>{
        const ts=Math.max(0,Number(row?.timestamp||0))*1000;
        const when=ts?new Date(ts).toLocaleString():'Time unavailable';
        const rarity=String(row?.rarity||'').trim();
        const bonuses=Array.isArray(row?.bonuses)?row.bonuses:[];
        const bonusText=bonuses.map(b=>String(b?.title||b?.bonus||'')+(Number(b?.value||0)?' '+Number(b.value).toFixed(0)+'%':'')).filter(Boolean).join(' + ');
        return '<div style="display:grid;grid-template-columns:minmax(105px,.8fr) minmax(90px,.7fr) minmax(0,1.7fr);gap:8px;border-top:1px solid #26352b;padding:6px 0;font-size:10px;align-items:center;">'+
          '<span>'+esc(when)+'</span>'+
          '<span><b>'+money(row?.price||0)+'</b>'+(Number(row?.bids||0)>0?' · '+Number(row.bids)+' bids':'')+'</span>'+
          '<span style="color:#888;">'+(rarity?esc(rarity.toUpperCase()):'')+(bonusText?(rarity?' · ':'')+esc(bonusText):'')+(row?.id?' · sale #'+esc(row.id):'')+'</span>'+
        '</div>';
      }).join('')+'</div>'+
      (rows.length>visible.length?'<div style="font-size:10px;color:#777;margin-top:5px;">Showing newest '+visible.length+' of '+rows.length.toLocaleString()+' loaded completed sales.</div>':'')+
    '</div>';
  }

  function futureDuration(unixSeconds){
    const end=Math.max(0,Number(unixSeconds||0))*1000;
    if(!end)return '';
    const sec=Math.floor((end-Date.now())/1000);
    if(sec<=0)return 'ended';
    const d=Math.floor(sec/86400);
    const h=Math.floor((sec%86400)/3600);
    const m=Math.floor((sec%3600)/60);
    if(d>0)return d+'d '+h+'h';
    if(h>0)return h+'h '+m+'m';
    return Math.max(1,m)+'m';
  }

  function normalizeTravelLocation(value){
    const raw=String(value||'').trim().toLowerCase().replaceAll('.','');
    const aliases={
      'torn':'torn',
      'uk':'united kingdom',
      'united kingdom':'united kingdom',
      'uae':'united arab emirates',
      'united arab emirates':'united arab emirates',
      'south africa':'south africa',
      'cayman islands':'cayman islands',
      'switzerland':'switzerland',
      'japan':'japan',
      'china':'china',
      'mexico':'mexico',
      'canada':'canada',
      'argentina':'argentina',
      'hawaii':'hawaii'
    };
    return aliases[raw]||raw;
  }

  function parseTravelContext(data){
    const profile=(data?.profile&&typeof data.profile==='object')?data.profile:
      ((data?.user&&typeof data.user==='object')?data.user:(data||{}));
    const status=(profile?.status&&typeof profile.status==='object')?profile.status:{};
    const stateName=String(status.state||profile.state||'').trim();
    const description=String(status.description||profile.status_description||'').trim();
    const lower=stateName.toLowerCase();
    let mode='torn',origin='',destination='',country='';
    if(lower==='traveling'){
      mode='traveling';
      const m=description.match(/travel(?:ing)?\s+from\s+(.+?)\s+to\s+(.+)$/i);
      if(m){origin=String(m[1]||'').trim();destination=String(m[2]||'').trim();}
    }else if(lower==='abroad'){
      mode='abroad';
      const m=description.match(/(?:in|at)\s+(.+)$/i);
      country=String(m?.[1]||'').trim();
    }else if(!stateName){
      mode='unknown';
    }
    return {
      mode,state:stateName,description,origin,destination,country,
      checkedAt:Date.now()
    };
  }

  function marketNavigationBlocked(ctx=travelContext){
    return ctx?.mode==='traveling'||ctx?.mode==='abroad';
  }

  function travelContextLabel(ctx=travelContext){
    if(!ctx||ctx.mode==='unknown')return 'Travel context unavailable';
    if(ctx.mode==='traveling')return ctx.description||'Traveling';
    if(ctx.mode==='abroad')return ctx.country?('Abroad · '+ctx.country):(ctx.description||'Abroad');
    return ctx.state||'In Torn';
  }

  async function refreshTravelContext({force=false,silent=true}={}){
    if(!apiKey())return travelContext;
    if(!force&&travelContext&&Date.now()-travelContextCheckedAt<TRAVEL_CONTEXT_REFRESH_MS)return travelContext;
    try{
      const data=await tornRequest('/user/basic');
      travelContext=parseTravelContext(data);
      travelContextCheckedAt=Date.now();
      if(!silent)statusText='Travel context updated: '+travelContextLabel(travelContext)+'.';
      return travelContext;
    }catch(error){
      travelContextCheckedAt=Date.now();
      if(!silent)statusText='Travel context unavailable: '+(error?.message||String(error));
      return travelContext;
    }
  }

  function gmText(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'text/html,application/xhtml+xml'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status));
          const body=String(r.responseText||'');
          if(/just a moment|challenge-platform|cf-chl/i.test(body))return reject(new Error('Cloudflare challenge blocked direct refresh.'));
          resolve(body);
        },
        ontimeout:()=>reject(new Error('Request timed out.')),
        onerror:error=>{
          const detail=String(error?.statusText||error?.message||error?.error||'').trim();
          reject(new Error('Network request failed'+(detail?': '+detail:'')+'.'));
        }
      });
    });
  }

  let pdaTravelFeedCache=null;

  async function pdaSharedGet(key,def=null){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.get==='function'){
      return await PDA_storage.get(String(key),def);
    }
    return GM_getValue(key,def);
  }

  async function pdaSharedSet(key,value){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.set==='function'){
      await PDA_storage.set(String(key),value);
      return;
    }
    GM_setValue(key,value);
  }

  async function pdaSharedDelete(key){
    if(typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.delete==='function'){
      await PDA_storage.delete(String(key));
      return;
    }
    GM_deleteValue(key);
  }

  function normalizeTravelFeed(raw){
    if(!raw)return null;
    if(typeof raw==='string'){try{return JSON.parse(raw);}catch{return null;}}
    return raw&&typeof raw==='object'?raw:null;
  }

  function readTravelFeed(){
    return pdaTravelFeedCache;
  }

  async function loadTravelFeed(){
    pdaTravelFeedCache=normalizeTravelFeed(await pdaSharedGet(TRAVEL_FEED_KEY,null));
    return pdaTravelFeedCache;
  }

  async function writeTravelFeed(rows,capturedAt=Date.now()){
    const payload={capturedAt:Number(capturedAt||Date.now()),rows:Array.isArray(rows)?rows:[]};
    pdaTravelFeedCache=payload;
    await pdaSharedSet(TRAVEL_FEED_KEY,payload);
    return payload;
  }

  async function beginTravelCapture(){
    await pdaSharedSet(TRAVEL_RETURN_KEY,{url:location.href,at:Date.now()});
    statusText='Opening TornW3B Travel Stock for live capture…';
    render();
    setTimeout(()=>{location.href='https://weav3r.dev/travel-stock';},120);
  }

  async function captureTravelPage(){
    try{
      const rows=live.parseTravelStockHtml(document.documentElement.outerHTML);
      await writeTravelFeed(rows,Date.now());
      return rows.length;
    }catch{return 0;}
  }

  function installTravelCollector(){
    if(!/^(www\.)?weav3r\.dev$/.test(location.hostname)||!location.pathname.startsWith('/travel-stock'))return;
    let attempts=0,stable=0,lastCount=0,returned=false;
    let observer=null;
    const maybeReturn=async count=>{
      if(!count||returned)return;
      stable=count===lastCount?stable+1:1;
      lastCount=count;
      if(stable<2)return;
      const ret=await pdaSharedGet(TRAVEL_RETURN_KEY,null);
      const requestedAt=Number(ret?.at||0);
      const returnUrl=String(ret?.url||'');
      if(returnUrl.startsWith('https://www.torn.com/')&&Date.now()-requestedAt<5*60*1000){
        returned=true;
        await pdaSharedDelete(TRAVEL_RETURN_KEY);
        try{observer?.disconnect();}catch{}
        setTimeout(()=>{location.href=returnUrl;},650);
      }
    };
    const capture=async()=>{
      if(returned)return;
      attempts++;
      const count=await captureTravelPage();
      if(count>0)await maybeReturn(count);
      if(!returned&&attempts<90)setTimeout(capture,1000);
    };
    observer=new MutationObserver(async()=>{
      if(returned)return;
      const table=[...document.querySelectorAll('table')].find(t=>{
        const x=String(t.textContent||'').toLowerCase();
        return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');
      });
      if(table){
        const count=await captureTravelPage();
        if(count>0)await maybeReturn(count);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(capture,700);
  }

  function gmJson(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'application/json'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status));
          let data;
          try{data=JSON.parse(r.responseText);}catch{return reject(new Error('Invalid JSON response.'));}
          if(data?.error){
            const msg=data.error?.error||data.error?.message||data.error||'API error';
            return reject(new Error(String(msg)));
          }
          resolve(data);
        },
        ontimeout:()=>reject(new Error('Request timed out.')),
        onerror:error=>{
          const detail=String(error?.statusText||error?.message||error?.error||'').trim();
          reject(new Error('Network request failed'+(detail?': '+detail:'')+'.'));
        }
      });
    });
  }

  function weavRequest(path,params={}){
    const url=new URL('https://weav3r.dev/api'+path);
    for(const [k,v] of Object.entries(params||{})) if(v!==undefined&&v!==null&&v!=='') url.searchParams.set(k,String(v));
    return gmJson(url.toString());
  }

  function tornRequest(path){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Save a Torn API key in MM Acquisitions Settings first.'));
    const url=new URL(path.startsWith('http')?path:'https://api.torn.com/v2'+path);
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM_Acquisitions');
    return gmJson(url.toString());
  }

  function bazaarRequest(sellerId){
    const key=apiKey();
    if(!key)return Promise.reject(new Error('Save a Torn API key in MM Acquisitions Settings first.'));
    const url=new URL('https://api.torn.com/user/'+encodeURIComponent(String(sellerId||'')));
    url.searchParams.set('selections','bazaar');
    url.searchParams.set('key',key);
    url.searchParams.set('comment','MM_Acquisitions');
    return gmJson(url.toString());
  }

  function navigate(url){
    const target=String(url||'');
    const isTornMarket=/^https:\/\/www\.torn\.com\/(?:bazaar\.php|page\.php\?sid=ItemMarket)/i.test(target);
    if(isTornMarket&&marketNavigationBlocked()){
      throw new Error('Torn market purchase pages are unavailable while traveling or abroad. Return to Torn before routing this market purchase.');
    }
    GM_setValue(PANEL_OPEN_KEY,true);
    setTimeout(()=>{location.href=target;},20);
  }

  const service=live?.createService({
    core,logic,weavRequest,tornRequest,bazaarRequest,
    hasTornKey:()=>Boolean(apiKey()),
    navigate
  });

  const pulseEngine=core&&pulse&&service?pulse.createEngine({
    core,
    refreshItemMarket:itemId=>service.refreshItemMarket(itemId),
    hasKey:()=>Boolean(apiKey()),
    readLease:()=>GM_getValue(PULSE_LEASE_KEY,null),
    writeLease:value=>GM_setValue(PULSE_LEASE_KEY,value),
    ownerId:INSTANCE_ID,
    onState:next=>{state=next;}
  }):null;

  async function importTravelCapture({silent=false}={}){
    const feed=await loadTravelFeed();
    if(!feed?.rows?.length) {
      if(!silent){statusText='No MM Acquisitions travel capture is available yet.';render();}
      return false;
    }
    const currentAt=Date.parse(state?.travelIntel?.lastSyncAt||'')||0;
    const capturedAt=Number(feed.capturedAt||0);
    if(capturedAt<=currentAt)return false;
    state=await service.importTravelRows(feed.rows,capturedAt);
    if(!silent)statusText='Imported '+feed.rows.length+' live TornW3B travel routes.';
    return true;
  }

  async function updateTravelData(){
    if(busy||watchRunning)return;
    busy=true;
    statusText='Refreshing TornW3B Travel Stock…';
    render();
    try{
      const html=await gmText('https://weav3r.dev/travel-stock');
      const rows=live.parseTravelStockHtml(html);
      const feed=await writeTravelFeed(rows,Date.now());
      state=await service.importTravelRows(feed.rows,feed.capturedAt);
      statusText='Travel updated: '+rows.length+' current routes.';
    }catch(error){
      busy=false;
      statusText='Direct refresh blocked; opening live TornW3B page for capture…';
      render();
      await beginTravelCapture();
      return;
    }
    busy=false;
    render();
  }

  async function reloadCachedState(){
    loadError='';
    if(!core||!pulse||!logic||!live||!rankedLogic||!ledger||!service||!pulseEngine){
      loadError='MM Acquisitions dependencies did not load.';
      state=null;
      render();
      return;
    }
    try{
      const next=await core.readLegacyState();
      const validation=core.validateLegacyState(next);
      if(!validation.ok)throw new Error(validation.errors.join('; '));
      state=next;
      try{await importTravelCapture({silent:true});}catch{}
    }catch(error){
      state=null;
      loadError=error?.message||String(error);
    }
    render();
  }

  async function refreshOpportunities(){
    if(busy||watchRunning)return;
    busy=true;
    statusText='Refreshing Weav3r opportunities'+(apiKey()?' + Torn Item Market…':'…');
    render();
    try{
      state=await service.refreshOpportunities({enrichLimit:8,itemMarketLimit:6});
      statusText='Opportunity refresh complete.';
    }catch(error){
      statusText='Refresh failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  async function saveBusinessRules(root){
    if(!state)return;
    const read=id=>Number(root.querySelector(id)?.value||0);
    const minPrice=Math.max(0,read('#mm-acq-rule-min-price'));
    const values={
      minRoiPct:Math.max(0,read('#mm-acq-rule-min-roi')),
      minDemandPerDay:Math.max(0,read('#mm-acq-rule-min-demand')),
      minPrice,
      maxPrice:Math.max(minPrice,read('#mm-acq-rule-max-price')),
      minAbsoluteProfit:Math.max(0,read('#mm-acq-rule-min-profit')),
      minSellerCount:Math.max(0,Math.round(read('#mm-acq-rule-min-sellers'))),
      minConfidencePct:Math.max(0,Math.min(100,read('#mm-acq-rule-min-confidence'))),
      maxListingAgeSec:Math.max(30,Math.round(read('#mm-acq-rule-max-age')))
    };
    await core.updateDomainState('core',draft=>{
      draft.businessRules={...(draft.businessRules||{}),...values,updatedAt:new Date().toISOString()};
      return draft;
    });
    state=await core.readLegacyState();
    statusText='Shared business rules saved.';
    render();
  }

  async function acquire(itemId){
    if(busy||watchRunning)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before live verification.';
      activeView='settings';
      render();
      return;
    }
    busy=true;
    statusText='Checking travel state, live price and seller availability…';
    render();
    try{
      const ctx=await refreshTravelContext({force:true,silent:true});
      if(marketNavigationBlocked(ctx)){
        statusText='Market purchase deferred: '+travelContextLabel(ctx)+'. Torn Bazaar / Item Market routing resumes when you are back in Torn.';
        return;
      }
      const result=await service.acquire(itemId);
      if(!result?.routed){
        const reason=String(result?.reason||'no-live-source');
        const warningSources=[...new Set((result?.verificationWarnings||[]).map(row=>String(row?.source||'')).filter(Boolean))];
        statusText=reason==='no-qualified-opportunity'
          ? 'Opportunity no longer meets ROI/profit rules.'
          : reason==='no-live-source-inside-ceiling'
            ? 'No current Bazaar seller or Item Market listing remains inside the buy ceiling.'
            : reason==='live-verification-unavailable'
              ? 'Live verification unavailable'+(warningSources.length?' for '+warningSources.join(' / '):'')+'. No purchase route was opened.'
              : 'Could not route purchase: '+reason;
        state=await core.readLegacyState();
      }
    }catch(error){
      statusText='Live verification failed: '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  function claimWatchLease(){
    const now=Date.now();
    const current=GM_getValue(WEAV_WATCH_LEASE_KEY,null);
    if(current?.owner&&current.owner!==INSTANCE_ID&&Number(current.expiresAt||0)>now)return false;
    GM_setValue(WEAV_WATCH_LEASE_KEY,{owner:INSTANCE_ID,expiresAt:now+75000});
    return true;
  }

  async function pollWeav3rWhileOpen(){
    const root=document.getElementById(ROOT_ID);
    if(watchRunning||busy||document.visibilityState!=='visible'||!root||root.style.display==='none')return;
    if(!claimWatchLease())return;
    watchRunning=true;
    try{
      const result=await service.refreshGlobal();
      if(result?.changed){
        state=await service.refreshOpportunities({enrichLimit:8,itemMarketLimit:apiKey()?6:0,refreshGlobalFirst:false});
        statusText='Weav3r published a new market generation; Acquisitions updated automatically.';
        render();
      }else if(result?.state){
        state=result.state;
      }
    }catch(error){
      console.warn('[MM_Acquisitions] Weav3r watch failed',error);
    }finally{
      watchRunning=false;
    }
  }

  function startWatcher(){
    if(watchTimer)return;
    setTimeout(pollWeav3rWhileOpen,1500);
    watchTimer=setInterval(pollWeav3rWhileOpen,60000);
  }

  function stopWatcher(){
    if(watchTimer){clearInterval(watchTimer);watchTimer=null;}
    const current=GM_getValue(WEAV_WATCH_LEASE_KEY,null);
    if(current?.owner===INSTANCE_ID)GM_setValue(WEAV_WATCH_LEASE_KEY,{owner:INSTANCE_ID,expiresAt:0});
  }

  function nextUrlFromMetadata(data){
    const next=data?._metadata?.links?.next??data?.metadata?.links?.next??data?._metadata?.next??data?.pagination?.next??null;
    if(typeof next!=='string'||!next.trim())return '';
    try{return new URL(next,'https://api.torn.com/v2/').toString();}catch{return '';}
  }
  function logRows(data){
    const raw=data?.log??data?.logs??data?.data?.log??data?.data?.logs??null;
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,row])=>({id:row?.id??row?.log_id??id,...(row&&typeof row==='object'?row:{})}));
    return [];
  }
  async function fetchPurchaseLogs(logId,fromSeconds,maxPages=50){
    const rows=[];const seen=new Set();let url=new URL('https://api.torn.com/v2/user/log');
    url.searchParams.set('log',String(logId));url.searchParams.set('from',String(Math.floor(fromSeconds)));url.searchParams.set('limit','100');
    let pages=0;
    while(url&&pages<maxPages){
      const clean=url.toString();if(seen.has(clean))throw new Error('Purchase log pagination loop detected.');
      seen.add(clean);const data=await tornRequest(clean);rows.push(...logRows(data));pages++;
      const next=nextUrlFromMetadata(data);url=next?new URL(next):null;
    }
    if(url)throw new Error('Purchase history exceeded '+maxPages+' page safety limit for log '+logId+'.');
    return rows;
  }
  async function syncPurchases(){
    if(busy||watchRunning)return;
    if(!apiKey()){statusText='Save a Torn API key in Settings before syncing purchases.';activeView='settings';render();return;}
    if(!ledger)throw new Error('Acquisition ledger dependency missing.');
    busy=true;statusText='Syncing Bazaar + Item Market purchase logs…';render();
    try{
      const current=await core.readLegacyState();const proc=ledger.ensureProcurement(current?.procurement||{});
      const fromMs=ledger.syncWindowStart(proc,Date.now(),180,24);const fetched={};
      for(const [logId,source] of Object.entries(ledger.ACQUISITION_LOG_IDS))fetched[logId]={source,rows:await fetchPurchaseLogs(Number(logId),fromMs/1000,50)};
      let added=0;
      await core.updateDomainState('market',draft=>{
        draft.procurement=ledger.ensureProcurement(draft.procurement||{});
        for(const pack of Object.values(fetched))added+=ledger.mergeAcquisitionLogRows(draft.procurement,pack.rows,pack.source);
        draft.procurement.lastAcquisitionSyncAt=new Date().toISOString();return draft;
      });
      state=await core.readLegacyState();statusText='Purchase ledger synced: '+added+' new lot'+(added===1?'':'s')+'.';
    }catch(error){statusText='Purchase sync failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function autoRefreshAcquisitions({force=false}={}){
    if(autoRefreshRunning||busy||watchRunning||document.visibilityState!=='visible'||!core)return;
    const root=document.getElementById(ROOT_ID);
    const panelOpen=Boolean(root&&root.style.display!=='none');
    autoRefreshRunning=true;
    try{
      state=await core.readLegacyState();
      if(panelOpen){
        try{await importTravelCapture({silent:true});}catch{}
        if(apiKey())try{await refreshTravelContext({force:false,silent:true});}catch{}
        const f=core.freshnessSnapshot(state||{});
        const now=Date.now();
        const purchaseAt=Date.parse(f.acquisitions||state?.procurement?.lastAcquisitionSyncAt||'')||0;
        const itemMarketAt=Date.parse(f.itemMarket||'')||0;
        if(apiKey()&&(force||!purchaseAt||now-purchaseAt>=PURCHASE_STALE_MS))await syncPurchases();
        if(force||!itemMarketAt||now-itemMarketAt>=OPPORTUNITY_STALE_MS)await refreshOpportunities();
        if(activeView==='ranked')await ensureRankedFresh();
      }
      if(apiKey()&&pulseEngine){
        const result=await pulseEngine.tick();
        if(result?.state)state=result.state;
      }
      if(panelOpen)render();
    }catch(error){
      console.warn('[MM_Acquisitions] automatic refresh failed',error);
      if(panelOpen){statusText='Auto-refresh warning: '+(error?.message||String(error));render();}
    }finally{autoRefreshRunning=false;}
  }

  function startAutoRefresh(){
    if(autoRefreshTimer)return;
    setTimeout(()=>autoRefreshAcquisitions({force:false}),900);
    autoRefreshTimer=setInterval(()=>autoRefreshAcquisitions({force:false}),AUTO_REFRESH_MS);
  }

  function stopAutoRefresh(){
    if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
  }

  async function refreshMarketPulse(){
    if(busy||autoRefreshRunning||!pulseEngine)return;
    if(!apiKey()){statusText='Save a Torn API key in Settings before refreshing Market Pulse.';activeView='settings';render();return;}
    busy=true;statusText='Refreshing one Market Pulse item from Torn API…';render();
    try{
      state=await core.readLegacyState();
      const itemId=pulse.trackedItemIds(state,1)[0]||'';
      if(!itemId){statusText='Market Pulse has no tracked acquisition item yet. Refresh Opportunities or Pricelist first.';return;}
      const result=await pulseEngine.tick({itemId});
      if(result?.state)state=result.state;
      statusText=result?.refreshed
        ?('Market Pulse refreshed item '+itemId+(result.reusedRecent?' from the just-verified 2.5s snapshot.':'.'))
        :('Market Pulse did not refresh: '+String(result?.skipped||result?.error||'not due')+'.');
    }catch(error){statusText='Market Pulse refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function exportMarketPulseDiagnostics(){
    if(!pulse||!state)return;
    const diagnostics=pulse.sanitizedDiagnostics(state,GM_getValue(PULSE_LEASE_KEY,null));
    const blob=new Blob([JSON.stringify(diagnostics,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='MM_Acquisitions-Market-Pulse-'+Date.now()+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    statusText='Sanitized Market Pulse diagnostics exported.';render();
  }

  function sourceStrip(){
    if(!state)return '';
    const f=core.freshnessSnapshot(state);
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulseItems=Object.values(pulseState.items||{});
    const proven=pulseItems.filter(row=>String(row?.tier||'')==='proven').length;
    const candidates=pulseItems.filter(row=>String(row?.tier||'')==='candidate').length;
    const budget=pulse?.budgetStatus?.(state)||{used:0,limit:0};
    const pulseAt=Number(pulseState.updatedAt||0);
    const hasMarket=Boolean(f.weav3rGeneratedAt||f.itemMarket);
    const label=!apiKey()?'SETUP NEEDED':hasMarket?'READY':'LOADING';
    const color=label==='READY'?'#9fe3a8':label==='LOADING'?'#ffd18a':'#ffb3b3';
    return '<details style="margin-bottom:7px;border:1px solid #303030;border-radius:6px;padding:5px 7px;background:#131313;">'+
      '<summary style="cursor:pointer;font-size:10px;color:#aaa;"><b style="color:'+color+';">Data status: '+label+'</b> · click for details</summary>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#888;margin-top:5px;">'+
        '<span>Bazaar '+esc(age(f.weav3rGeneratedAt))+'</span>'+
        '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
        '<span>· Market activity '+(pulseAt?esc(age(new Date(pulseAt).toISOString())):'not synced')+' ('+proven+' strong / '+candidates+' building · API budget '+Number(budget.used||0)+'/'+Number(budget.limit||0)+')</span>'+
        '<span>· Travel '+esc(age(f.travel))+'</span>'+
        '<span>· Pricelist '+esc(age(state?.procurement?.pricelist?.lastSyncAt))+'</span>'+
        '<span>· Ranked weapons '+esc(age(state?.procurement?.ranked?.lastLiveAt))+'</span>'+
        '<span>· Purchases '+esc(age(state?.procurement?.lastAcquisitionSyncAt))+'</span>'+
        '<span>· Torn key '+(apiKey()?'saved':'not saved')+'</span>'+
      '</div>'+
    '</details>';
  }

  function armoryRequestHtml(){
    if(!armoryRequest)return '';
    const sources=Array.isArray(armorySources?.sources)?armorySources.sources:[];
    const rows=sources.length?sources.map(source=>
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:6px 0;font-size:11px;">'+
        '<div><b>'+esc(source.source)+'</b> · '+money(source.price)+(source.country?' · '+esc(source.country):'')+
        (source.quantity?' · qty/stock '+Number(source.quantity).toLocaleString():'')+'</div>'+
        '<button data-armory-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(source.source===armoryRequest.preferredSource)+(busy?'opacity:.5;':'')+'">Use '+esc(source.source)+'</button>'+
      '</div>'
    ).join(''):'<div style="font-size:11px;color:#888;margin-top:5px;">No live source comparison loaded yet.</div>';
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Faction Armory request: '+esc(armoryRequest.itemName)+'</b>'+
          '<div style="font-size:10px;color:#888;">Need '+Number(armoryRequest.qty||1).toLocaleString()+' · '+esc(armoryRequest.armoryReason||'Faction requirement')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-armory-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Compare Sources</button>'+
          '<button data-armory-route="Best" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Find Best Source</button>'+
          (armorySources?.reason==='overseas-recommended'?'<button id="mm-acq-armory-travel-agency" style="'+button(true)+'">Open Travel Agency</button>':'')+
          '<button id="mm-acq-armory-clear" style="'+button()+'">Clear</button>'+
        '</div>'+
      '</div>'+rows
    );
  }

  async function refreshArmorySources(){
    if(!armoryRequest||busy)return;
    busy=true;statusText='Comparing Bazaar, Item Market and overseas sources for '+armoryRequest.itemName+'…';render();
    try{
      armorySources=await service.procurementSourceOptions(armoryRequest.itemId,armoryRequest.itemName);
      state=armorySources?.state||await core.readLegacyState();
      statusText=armorySources?.sources?.length
        ?'Source comparison ready for '+armoryRequest.itemName+'. Final purchase remains manual.'
        :'No live source is currently cached/available for '+armoryRequest.itemName+'.';
    }catch(error){statusText='Source comparison failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function routeArmoryRequest(preferredSource='Best'){
    if(!armoryRequest||busy)return;
    busy=true;statusText='Checking travel state and verifying '+preferredSource+' source for '+armoryRequest.itemName+'…';render();
    try{
      await refreshTravelContext({force:true,silent:true});
      const result=await service.routeProcurementRequest({...armoryRequest,preferredSource});
      armorySources=result;
      if(result?.routed){
        statusText='Verified '+result.source+' source for '+armoryRequest.itemName+'. Complete the purchase manually on Torn.';
        return;
      }
      if(result?.reason==='overseas-recommended'){
        activeView='travel';
        const qty=Math.max(1,Number(armoryRequest?.qty||1));
        statusText='Overseas is the selected source: '+String(result.country||'destination')+' · '+money(result.price||0)+' each · '+money(Number(result.price||0)*qty)+' for '+qty.toLocaleString()+' · stock '+Number(result.stock||0).toLocaleString()+'. Use Open Travel Agency when ready; travel/purchase remains manual.';
      }else if(result?.reason==='preferred-source-unavailable'){
        statusText=preferredSource+' is not currently available for '+armoryRequest.itemName+'. Compare Sources for alternatives.';
      }else if(result?.reason==='item-id-unresolved'){
        statusText='Could not resolve a Torn item ID for '+armoryRequest.itemName+'.';
      }else{
        statusText='Could not route '+armoryRequest.itemName+': '+String(result?.reason||'no live source')+'.';
      }
    }catch(error){statusText='Armory procurement routing failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined'||channel)return;
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.addEventListener('message',event=>{
        if(event?.data?.type!=='armory-acquisition-request')return;
        armoryRequest={...(event.data.payload||{})};
        armorySources=null;
        activeView=String(armoryRequest.preferredSource||'').toLowerCase()==='overseas'?'travel':'deals';
        open();
        statusText='Faction Armory requested '+String(armoryRequest.itemName||'item')+' x'+Number(armoryRequest.qty||1).toLocaleString()+'. Comparing sources…';
        render();
        setTimeout(refreshArmorySources,80);
      });
    }catch(error){console.warn('[MM_Acquisitions] channel unavailable',error);}
  }

  function homeHtml(){
    const keyReady=Boolean(apiKey());
    const catalogCount=Object.keys(state?.procurement?.catalog||{}).length;
    return armoryRequestHtml()+
      card(
        '<div><b style="font-size:15px;">Start here</b><div style="font-size:11px;color:#aaa;margin-top:3px;">You do not need to understand the advanced market terms to use Acquisitions.</div></div>'+
        '<div style="margin-top:9px;display:grid;gap:7px;">'+
          '<div style="border:1px solid #333;border-radius:7px;padding:8px;"><b>1. Choose what you want to buy.</b><div style="font-size:10px;color:#888;margin-top:2px;">Search for one item, browse suggested deals, look at ranked weapons, or check travel deals.</div></div>'+
          '<div style="border:1px solid #333;border-radius:7px;padding:8px;"><b>2. Let Acquisitions compare prices.</b><div style="font-size:10px;color:#888;margin-top:2px;">It compares Bazaar, Item Market, Torn shops, and overseas travel when data is available.</div></div>'+
          '<div style="border:1px solid #333;border-radius:7px;padding:8px;"><b>3. Open the source you want.</b><div style="font-size:10px;color:#888;margin-top:2px;">After Check Prices, use GO TO BAZAAR for player bazaars or GO TO ITEM MARKET for Torn\'s Item Market. You still make the final purchase yourself.</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;">'+
          '<button data-home-view="items" style="'+button(true)+'">Find One Item</button>'+
          '<button data-home-view="deals" style="'+button()+'">Show Best Deals</button>'+
          '<button data-home-view="ranked" style="'+button()+'">Ranked Weapons</button>'+
          '<button data-home-view="travel" style="'+button()+'">Travel Deals</button>'+
          (!keyReady?'<button data-home-view="settings" style="'+button()+'">Setup API Key</button>':'')+
        '</div>'
      )+
      card(
        '<b>Ready check</b>'+
        '<div style="font-size:11px;margin-top:5px;">Torn API key: <b style="color:'+(keyReady?'#9fe3a8':'#ffb3b3')+';">'+(keyReady?'Ready':'Needs setup')+'</b> · Item catalog: <b>'+(catalogCount?catalogCount.toLocaleString()+' items':'not loaded yet')+'</b></div>'+
        (!keyReady?'<div style="font-size:10px;color:#ffd18a;margin-top:5px;">Go to Setup once, save your Torn API key, then return here.</div>':'<div style="font-size:10px;color:#888;margin-top:5px;">For normal use, start with <b>Find One Item</b>. Use Best Deals when you want the app to suggest what to check.</div>')
      )+
      card(
        '<details><summary style="cursor:pointer;"><b>What do these words mean?</b></summary>'+
          '<div style="font-size:11px;color:#aaa;margin-top:7px;line-height:1.55;">'+
            '<b>Bazaar:</b> items sold by another Torn player.<br>'+
            '<b>Item Market:</b> Torn\'s normal item market listings.<br>'+
            '<b>Travel:</b> buy the item overseas, then bring it back to Torn.<br>'+
            '<b>Profit:</b> estimated resale money minus your buy price.<br>'+
            '<b>ROI / return on cost:</b> estimated profit as a percent of what you paid.<br>'+
            '<b>Market activity:</b> evidence that listing quantities are moving. It suggests demand; it does not prove a specific sale.<br>'+
            '<b>Completed Sales:</b> finished Auction House sales from the official Torn API, used mainly for ranked weapons.'+
          '</div>'+
        '</details>'
      );
  }

  function dealsHtml(){
    if(!state)return card('<b>No cached market state available.</b>');
    const rows=logic.rankCachedOpportunities(state);
    const buyable=rows.filter(r=>r.purchaseReady).slice(0,12);
    const pricelistScan=logic.rankPricelistUniverse(state);
    const pricelistDeals=pricelistScan.filter(r=>r.hasMarketEvidence).slice(0,20);
    const research=rows.filter(r=>!r.purchaseReady).slice(0,8);
    const pulseMovers=pulse?.rankPulseItems?.(state)?.slice(0,12)||[];

    return armoryRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Best Deals</b><div style="font-size:10px;color:#888;">Start with the first few rows. Click Check & Open to re-check the price and open the best current source.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Deals</button><button id="mm-acq-sync-purchases" '+(busy?'disabled':'')+' style="'+button()+'">Sync Purchases</button></div>'+
      '</div>'
    )+
    card(
      '<b>Recommended Deals</b>'+
      '<div style="font-size:10px;color:#888;margin:3px 0 6px;">These currently meet your deal rules. Acquisitions still re-checks the live source before opening it.</div>'+
      (buyable.length?buyable.map((r,i)=>
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;border-top:1px solid #303030;padding:9px 0;font-size:11px;align-items:center;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b><div style="color:#aaa;margin-top:3px;">Buy about <b>'+money(r.buyPrice)+'</b> · likely resale <b>'+money(r.bestExit)+'</b> · est. profit <b style="color:'+(Number(r.profit||0)>=0?'#9fe3a8':'#ffaaaa')+';">'+(Number(r.profit||0)>=0?'+':'-')+money(Math.abs(Number(r.profit||0)))+'</b> · return on cost <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="font-size:10px;color:#888;margin-top:2px;">Current source: '+esc(String(r.purchaseSource||'Unknown').replace('Bazaar aggregate','Bazaar'))+'</div>'+
          '<details style="margin-top:4px;"><summary style="cursor:pointer;font-size:10px;color:#777;">Why this deal?</summary><div style="font-size:10px;color:#888;margin-top:4px;">Live listings '+Number(r.liveListingCount||0)+' · suggested qty '+Number(r.recommendedQty||1)+' · confidence '+Number(r.confidence||0).toFixed(0)+'% · estimated 3-day profit '+money(r.expectedProfit3d||0)+'</div>'+pulseLine(r,r.id,r.profit)+'</details></div>'+
          '<button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Check & Open</button>'+
        '</div>'
      ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No deal currently meets your rules. Click Refresh Deals or use Find Item.</div>')
    )+
    card(
      '<details><summary style="cursor:pointer;font-weight:700;">More deal sources and advanced signals</summary>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Pricelist opportunities</b> · '+pricelistDeals.length+'</summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Items on your configured buy pricelist that also have current market evidence.</div>'+
          (pricelistDeals.length?pricelistDeals.map((r,i)=>
            '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:7px 0;font-size:10px;">'+
              '<div><b>'+esc(r.name)+'</b> · buy '+money(r.buyPrice)+' · likely resale '+money(r.bestExit)+' · est. profit '+(r.profit>=0?'+':'-')+money(Math.abs(r.profit||0))+' · return '+Number(r.roiPct||0).toFixed(1)+'%</div>'+
              '<button data-pricelist-verify="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'padding:5px 7px;">Check Price</button>'+
            '</div>'
          ).join(''):'<div style="font-size:10px;color:#888;">No current pricelist opportunities.</div>')+
        '</details>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Market activity</b></summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Advanced demand evidence. You do not need this section for normal buying.</div>'+
          (pulseMovers.length?pulseMovers.map((r,i)=>
            '<div style="border-top:1px solid #303030;padding:6px 0;font-size:10px;"><b>#'+(i+1)+' '+esc(r.itemName||('Item '+r.itemId))+'</b> · '+(r.tier==='proven'?'strong':r.tier==='candidate'?'building':'limited')+' activity · '+Number(r.observedUnitsPerHour||0).toFixed(2)+' units/hr · '+Number(r.confidencePct||0).toFixed(0)+'% confidence</div>'
          ).join(''):'<div style="font-size:10px;color:#888;">Still collecting market activity history.</div>')+
        '</details>'+
        '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:11px;"><b>Research leads</b> · '+research.length+'</summary>'+
          '<div style="font-size:10px;color:#888;margin:4px 0;">Possible deals that need stronger live evidence before opening a source.</div>'+
          (research.length?research.map(r=>
            '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;font-size:10px;"><div><b>'+esc(r.name)+'</b> · estimated return '+Number(r.roiPct||0).toFixed(1)+'%</div><button data-acquire-item="'+esc(r.id)+'" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'padding:4px 7px;">Check</button></div>'
          ).join(''):'<div style="font-size:10px;color:#888;">No additional research leads.</div>')+
        '</details>'+
        '<button id="mm-acq-reload" style="'+button()+'margin-top:8px;">Reload Cached Data</button>'+
      '</details>'
    );
  }

  function travelHtml(){
    if(!state)return card('<b>No cached travel state available.</b>');
    const ranked=logic.rankCachedTravel(state);
    const feed=readTravelFeed();
    const captureAge=feed?.capturedAt?age(new Date(Number(feed.capturedAt)).toISOString()):'none';
    const syncedAt=Date.parse(state.travelIntel?.lastSyncAt||'')||0;
    const travelAgeMs=syncedAt?Math.max(0,Date.now()-syncedAt):Infinity;
    const freshness=!Number.isFinite(travelAgeMs)?'UNKNOWN':travelAgeMs<=TRAVEL_FRESH_MS?'FRESH':travelAgeMs<=TRAVEL_STALE_MS?'AGING':'STALE';
    const ctx=travelContext;
    const current=normalizeTravelLocation(ctx?.country||'');
    const destination=normalizeTravelLocation(ctx?.destination||'');
    let scope='Next trip from Torn';
    let scopedRows=ranked;
    if(ctx?.mode==='abroad'&&current){
      scope='Items available where you are now · '+String(ctx.country||'current destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===current);
    }else if(ctx?.mode==='traveling'&&destination&&destination!=='torn'){
      scope='Items to consider when you arrive · '+String(ctx.destination||'destination');
      scopedRows=ranked.filter(r=>normalizeTravelLocation(r.country)===destination);
    }else if(ctx?.mode==='traveling'){
      scope='You are traveling · showing next-trip ideas';
    }
    const stale=freshness==='STALE'||freshness==='UNKNOWN';
    const rows=(stale?[]:scopedRows).slice(0,20);
    const freshnessColor=freshness==='FRESH'?'#9fe3a8':freshness==='AGING'?'#ffd18a':'#ff9b9b';
    return armoryRequestHtml()+card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Travel Deals</b><div style="font-size:10px;color:#888;">Buy overseas and resell in Torn. Start near the top of the list. Travel and purchases remain manual.</div></div>'+
        '<button id="mm-acq-travel-update" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Travel Prices</button>'+
      '</div>'+
      '<div style="font-size:10px;margin-top:5px;"><b style="color:'+freshnessColor+';">'+esc(freshness)+'</b> · '+esc(scope)+'</div>'+
      '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:10px;color:#888;">Travel data details</summary><div style="font-size:10px;color:#888;margin-top:4px;">Last browser capture: '+esc(captureAge)+' · saved travel data: '+esc(age(state.travelIntel?.lastSyncAt))+' · '+esc(travelContextLabel(ctx))+'</div><button id="mm-acq-travel-import" style="'+button()+'margin-top:5px;">Import Browser Capture</button></details>'+
      (stale?'<div style="margin-top:6px;padding:6px;border:1px solid #7d3b3b;border-radius:5px;color:#ffb3b3;font-size:11px;"><b>Refresh needed.</b> Old travel prices are hidden until they are refreshed.</div>':'')
    )+
    card(rows.length?rows.map((r,i)=>
      '<div style="border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.itemName)+'</b><div style="margin-top:2px;">Buy in <b>'+esc(r.country)+'</b> · stock <b>'+Number(r.stock||0).toLocaleString()+'</b></div>'+
            '<div style="color:#aaa;margin-top:2px;">Estimated profit <b>'+money(r.profit||0)+'</b> each · about <b>'+money(r.sourceProfitPerHour||0)+'/hr</b></div>'+
            pulseLine(r,r.itemId,r.profit)+
          '</div>'+
          '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
            '<button data-travel-compare="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">Check All Prices</button>'+
            '<button data-travel-source="Bazaar" data-travel-id="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">GO TO BAZAAR</button>'+
            '<button data-travel-source="Item Market" data-travel-id="'+esc(r.itemId||'')+'" data-travel-name="'+esc(r.itemName||'')+'" style="'+button()+'">GO TO ITEM MARKET</button>'+
            '<button data-travel-agency="1" style="'+button(true)+'">GO TO TRAVEL AGENCY</button>'+
          '</div>'+
        '</div>'+
      '</div>'
    ).join(''):(stale
      ?'<div style="font-size:11px;color:#888;">Refresh travel prices to see recommendations.</div>'
      :'<div style="font-size:11px;color:#888;">No profitable travel deals match your current trip.</div>'));
  }

  async function compareTravelItem(itemId,itemName){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    const item=catalogRows().find(row=>row.id===id)||(name?catalogRows().find(row=>row.name.toLowerCase()===name.toLowerCase()):null);
    if(!item){
      statusText='Could not find '+(name||('item '+id))+' in the Torn item list.';
      render();
      return;
    }
    activeView='items';
    itemQuery=item.name;
    await findCatalogPriceByItem(item);
  }

  async function routeTravelAlternative(itemId,itemName,preferredSource){
    if(busy)return;
    const id=String(itemId||'');
    const name=String(itemName||'').trim();
    busy=true;
    statusText='Checking the current '+preferredSource+' price for '+(name||('item '+id))+'…';
    render();
    try{
      const result=await service.routeProcurementRequest({itemId:id,itemName:name,preferredSource});
      state=result?.state||await core.readLegacyState();
      if(result?.routed){
        statusText='Opened '+result.source+' for '+(name||result.itemName||('item '+id))+'. Final purchase remains manual.';
      }else{
        statusText=preferredSource+' is not available right now for '+(name||result.itemName||('item '+id))+'. Try Check All Prices.';
      }
    }catch(error){
      statusText='Could not open '+preferredSource+': '+(error?.message||String(error));
    }finally{
      busy=false;
      render();
    }
  }

  function rankedSettings(){
    const saved=state?.procurement?.ranked?.settings||{};
    const pricelist=state?.procurement?.pricelist||{};
    return {
      pricelistUserId:String(saved.pricelistUserId||pricelist.userId||DEFAULT_PRICELIST_USER_ID),
      historyDays:Math.max(7,Number(saved.historyDays||90)),
      bonusBand:Math.max(1,Number(saved.bonusBand||5)),
      minComparableSales:Math.max(1,Number(saved.minComparableSales||3)),
      minRoiPct:Math.max(0,Number(saved.minRoiPct||0)),
      minConfidencePct:Math.max(0,Math.min(100,Number(saved.minConfidencePct||0))),
      pagesPerType:Math.max(1,Math.min(5,Number(saved.pagesPerType||2))),
      auctionPages:Math.max(1,Math.min(6,Number(saved.auctionPages||4))),
      maxLiveAgeHours:Math.max(1,Math.min(168,Number(saved.maxLiveAgeHours||24))),
      lowTierBonuses:Array.isArray(saved.lowTierBonuses)?saved.lowTierBonuses:['Achilles','Conserve'],
      bbRate:Math.max(0,Number(pricelist.bunkerBuckRate||saved.bbRate||0))
    };
  }

  async function saveRankedSettings(root){
    const read=(selector,fallback='')=>String(root.querySelector(selector)?.value??fallback).trim();
    const settings={
      pricelistUserId:read('#mm-acq-rw-pricelist',DEFAULT_PRICELIST_USER_ID),
      historyDays:Math.max(7,Number(read('#mm-acq-rw-history','90'))||90),
      bonusBand:Math.max(1,Number(read('#mm-acq-rw-band','5'))||5),
      minComparableSales:Math.max(1,Math.round(Number(read('#mm-acq-rw-min-sales','3'))||3)),
      minRoiPct:Math.max(0,Number(read('#mm-acq-rw-min-roi','0'))||0),
      minConfidencePct:Math.max(0,Math.min(100,Number(read('#mm-acq-rw-min-confidence','0'))||0)),
      pagesPerType:Math.max(1,Math.min(5,Math.round(Number(read('#mm-acq-rw-market-pages','2'))||2))),
      auctionPages:Math.max(1,Math.min(6,Math.round(Number(read('#mm-acq-rw-auction-pages','4'))||4))),
      maxLiveAgeHours:Math.max(1,Math.min(168,Number(read('#mm-acq-rw-max-age','24'))||24)),
      lowTierBonuses:read('#mm-acq-rw-low-bonuses','Achilles,Conserve').split(',').map(x=>x.trim()).filter(Boolean)
    };
    if(!/^\d+$/.test(settings.pricelistUserId))throw new Error('Pricelist ID must be a Torn user ID.');
    await core.updateDomainState('market',draft=>{
      const proc=draft.procurement || (draft.procurement={});
      const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
      ranked.settings=settings;
      return draft;
    });
    state=await core.readLegacyState();
    statusText='Ranked profit settings saved.';
    render();
  }

  async function refreshPricelist(){
    if(busy)return;
    busy=true;
    statusText='Refreshing customer pricelist and Bunker Buck rate from TornW3B…';
    render();
    try{
      const result=await service.refreshPricelist(rankedSettings().pricelistUserId);
      state=result?.state||await core.readLegacyState();
      statusText='Pricelist updated: '+Number(result?.priced||0).toLocaleString()+' priced items · '+money(result?.bbRate||0)+'/BB.';
    }catch(error){statusText='Pricelist refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function refreshRankedLive(){
    if(busy)return;
    busy=true;
    const cfg=rankedSettings();
    statusText='Refreshing live ranked Bazaar / Item Market / Auction opportunities…';
    render();
    try{
      const result=await service.refreshRankedLive({pagesPerType:cfg.pagesPerType,auctionPages:cfg.auctionPages,limit:100});
      state=result?.state||await core.readLegacyState();
      const liveRows=Array.isArray(result?.market)?result.market:[];
      const bazaarCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='bazaar').length;
      const itemMarketCount=liveRows.filter(row=>String(row?.source||'').toLowerCase()==='item market'||String(row?.source||'').toLowerCase()==='market').length;
      statusText='Ranked live feed updated: '+bazaarCount.toLocaleString()+' Bazaar + '+itemMarketCount.toLocaleString()+' Item Market + '+Number(result?.auction?.length||0).toLocaleString()+' Auction.';
    }catch(error){statusText='Ranked live refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  async function ensureRankedFresh(){
    if(busy){setTimeout(ensureRankedFresh,1200);return;}
    const now=Date.now();
    const pricelistAt=Date.parse(state?.procurement?.pricelist?.lastSyncAt||'')||0;
    const rankedAt=Date.parse(state?.procurement?.ranked?.lastLiveAt||'')||0;
    if(!pricelistAt||now-pricelistAt>=PRICELIST_STALE_MS)await refreshPricelist();
    if(!rankedAt||Date.now()-rankedAt>=RANKED_LIVE_STALE_MS)await refreshRankedLive();
  }

  async function analyzeRankedHistory(itemId){
    if(busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before loading completed Auction House history.';
      activeView='settings';render();return;
    }
    const id=String(itemId||'');
    const catalog=state?.procurement?.catalog?.[id]||{};
    busy=true;
    statusText='Loading official Torn completed-auction history for '+String(catalog.name||('Item '+id))+'…';
    render();
    try{
      const result=await service.refreshRankedHistory(id,{days:rankedSettings().historyDays,maxPages:8});
      state=result?.state||await core.readLegacyState();
      verifiedSalesItemId=id;
      statusText='Verified sales updated for '+String(catalog.name||('Item '+id))+': '+Number(result?.rows?.length||0).toLocaleString()+' completed Auction House sales.';
    }catch(error){statusText='Auction history failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function rankedEvaluatedRows(){
    const ranked=state?.procurement?.ranked||{};
    const catalog=state?.procurement?.catalog||{};
    const cfg=rankedSettings();
    const history=ranked.history||{};
    const market=Array.isArray(ranked.liveMarket)?ranked.liveMarket:[];
    const auction=Array.isArray(ranked.liveAuction)?ranked.liveAuction:[];
    const rows=[...market,...auction].map(row=>{
      const cat=catalog?.[String(row.itemId)]||{};
      const candidate={
        ...row,
        subType:String(row.subType||cat.subType||''),
        weaponType:String(row.weaponType||cat.weaponCategory||'')
      };
      const hist=Array.isArray(history?.[String(row.itemId)]?.rows)?history[String(row.itemId)].rows:[];
      return rankedLogic.evaluateListing(candidate,hist,{...cfg,bbRate:cfg.bbRate,pulseByItem:state?.marketIntel?.marketPulse?.items||{}});
    });
    const bonusQ=rankedBonus.trim().toLowerCase();
    const weaponQ=rankedWeapon.trim().toLowerCase();
    return rows.filter(row=>{
      const source=String(row.source||'').toLowerCase();
      if(source==='auction'){
        const endsAt=Number(row.endsAt||0);
        if(endsAt>0&&endsAt*1000<=Date.now())return false;
      }else{
        const observed=Date.parse(row.lastUpdated||'')||0;
        if(!observed||Date.now()-observed>cfg.maxLiveAgeHours*3600000)return false;
      }
      if(rankedType!=='all'&&String(row.weaponType||'').toLowerCase()!==rankedType)return false;
      if(rankedSource!=='all'){
        if(rankedSource==='auction'&&source!=='auction')return false;
        if(rankedSource==='bazaar'&&source!=='bazaar')return false;
        if(rankedSource==='item-market'&&source!=='item market'&&source!=='market')return false;
      }
      if(rankedRarity!=='all'&&String(row.rarity||'').toLowerCase()!==rankedRarity)return false;
      if(weaponQ&&!String(row.itemName||'').toLowerCase().includes(weaponQ))return false;
      if(bonusQ&&!row.bonuses.some(b=>String(b.title||'').toLowerCase().includes(bonusQ)))return false;
      if(Number(row.roiPct||0)<Math.max(rankedMinRoi,cfg.minRoiPct))return false;
      return true;
    }).sort((a,b)=>Number(b.sortScore||0)-Number(a.sortScore||0)||Number(b.history?.confidence||0)-Number(a.history?.confidence||0)||Number(b.liquidityScore||0)-Number(a.liquidityScore||0)||b.roiPct-a.roiPct||b.profit-a.profit);
  }

  async function analyzeVisibleRanked(){
    if(busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key before analyzing Auction House history.';
      activeView='settings';render();return;
    }
    const ids=[...new Set(rankedEvaluatedRows().slice(0,30).map(row=>String(row.itemId||'')).filter(Boolean))].slice(0,6);
    if(!ids.length){statusText='No visible ranked weapons to analyze.';render();return;}
    busy=true;
    render();
    try{
      const cfg=rankedSettings();
      for(let i=0;i<ids.length;i++){
        const name=state?.procurement?.catalog?.[ids[i]]?.name||('Item '+ids[i]);
        statusText='Auction history '+(i+1)+'/'+ids.length+': '+name+'…';
        render();
        const result=await service.refreshRankedHistory(ids[i],{days:cfg.historyDays,maxPages:8});
        state=result?.state||await core.readLegacyState();
      }
      statusText='Official Auction House history updated for '+ids.length+' visible weapon types.';
    }catch(error){statusText='Ranked history batch stopped: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function routeRankedListing(index){
    const rows=rankedEvaluatedRows();
    const row=rows[Number(index)];
    if(!row)return;
    const source=String(row.source||'').toLowerCase();
    if(source==='auction'){
      const url=new URL('https://weav3r.dev/ranked-weapons');
      url.searchParams.set('listing','auction');
      if(row.itemName)url.searchParams.set('weaponName',String(row.itemName));
      if(row.rarity)url.searchParams.set('rarity',String(row.rarity).toLowerCase());
      if(row.bonuses?.[0]?.title)url.searchParams.set('bonus1',String(row.bonuses[0].title));
      location.href=url.toString();
      return;
    }
    if(source.includes('bazaar')&&row.sellerId){
      navigate('https://www.torn.com/bazaar.php?userId='+encodeURIComponent(String(row.sellerId)));
      return;
    }
    const cat=state?.procurement?.catalog?.[String(row.itemId)]||{};
    navigate(live.itemMarketPurchaseUrl(row.itemId,row.itemName,cat.type||'Weapon'));
  }

  function rankedHtml(){
    const ranked=state?.procurement?.ranked||{};
    const cfg=rankedSettings();
    const all=rankedEvaluatedRows();
    const pages=Math.max(1,Math.ceil(all.length/RANKED_PAGE_SIZE));
    rankedPage=Math.max(0,Math.min(rankedPage,pages-1));
    const visible=all.slice(rankedPage*RANKED_PAGE_SIZE,(rankedPage+1)*RANKED_PAGE_SIZE);
    const historyCount=Object.keys(ranked.history||{}).length;
    const priceList=state?.procurement?.pricelist||{};
    const liveMarketRows=Array.isArray(ranked.liveMarket)?ranked.liveMarket:[];
    const bazaarCount=liveMarketRows.filter(row=>String(row?.source||'').toLowerCase()==='bazaar').length;
    const itemMarketCount=liveMarketRows.filter(row=>['item market','market'].includes(String(row?.source||'').toLowerCase())).length;
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
        '<div><b>Ranked Weapons</b><div style="font-size:10px;color:#888;">Use this page only for ranked weapons. Refresh the list, then open a listing or load completed sales when you want more evidence.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;">'+
          '<button id="mm-acq-rw-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Update Pricelist</button>'+
          '<button id="mm-acq-rw-live-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Weapons</button>'+
          '<button id="mm-acq-rw-analyze-visible" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Load Sales for Visible</button>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:5px;">BB '+money(cfg.bbRate)+'/buck · Pricelist '+Number(priceList.pricedCount||0).toLocaleString()+' priced · Live <b>'+bazaarCount.toLocaleString()+' Bazaar</b> + <b>'+itemMarketCount.toLocaleString()+' Item Market</b> + <b>'+Number(ranked.liveAuction?.length||0).toLocaleString()+' Auction</b> · AH history '+historyCount+' weapon types · updated '+esc(age(ranked.lastLiveAt))+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:5px;margin-top:8px;">'+
        '<select id="mm-acq-rw-type" style="'+inputCss()+'width:100%;"><option value="all">All types</option><option value="primary"'+(rankedType==='primary'?' selected':'')+'>Primary</option><option value="secondary"'+(rankedType==='secondary'?' selected':'')+'>Secondary</option><option value="melee"'+(rankedType==='melee'?' selected':'')+'>Melee</option></select>'+
        '<select id="mm-acq-rw-source" style="'+inputCss()+'width:100%;"><option value="all">All sources</option><option value="bazaar"'+(rankedSource==='bazaar'?' selected':'')+'>Bazaar</option><option value="item-market"'+(rankedSource==='item-market'?' selected':'')+'>Item Market</option><option value="auction"'+(rankedSource==='auction'?' selected':'')+'>Auction</option></select>'+
        '<select id="mm-acq-rw-rarity" style="'+inputCss()+'width:100%;"><option value="all">All rarity</option><option value="yellow"'+(rankedRarity==='yellow'?' selected':'')+'>Yellow</option><option value="orange"'+(rankedRarity==='orange'?' selected':'')+'>Orange</option><option value="red"'+(rankedRarity==='red'?' selected':'')+'>Red</option></select>'+
        '<input id="mm-acq-rw-weapon" value="'+esc(rankedWeapon)+'" placeholder="Weapon name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-bonus" value="'+esc(rankedBonus)+'" placeholder="Bonus name" style="'+inputCss()+'width:100%;">'+
        '<input id="mm-acq-rw-roi" type="number" min="0" step="1" value="'+Number(rankedMinRoi||0)+'" placeholder="Min ROI %" style="'+inputCss()+'width:100%;">'+
      '</div>'+
      '<button id="mm-acq-rw-filter" style="'+button()+'margin-top:6px;">Apply Filters</button>'
    )+
    (verifiedSalesItemId?verifiedSalesHtml(verifiedSalesItemId):'')+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#888;align-items:center;">'+
        '<span>'+all.length.toLocaleString()+' matches · page '+(rankedPage+1)+'/'+pages+'</span>'+
        '<span><button id="mm-acq-rw-prev" '+(rankedPage<=0?'disabled':'')+' style="'+button()+(rankedPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Prev</button> '+
        '<button id="mm-acq-rw-next" '+(rankedPage>=pages-1?'disabled':'')+' style="'+button()+(rankedPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></span>'+
      '</div>'+
      (visible.length?visible.map((row,localIndex)=>{
        const globalIndex=rankedPage*RANKED_PAGE_SIZE+localIndex;
        const bonus=row.bonuses.map(b=>b.title+' '+Number(b.value||0).toFixed(0)+'%').join(' + ')||'No bonus data';
        const historyLoaded=Number(row.history?.samples||0)>0;
        const profitable=row.profit>0;
        const isAuction=String(row.source||'').toLowerCase()==='auction';
        const targetRoi=Math.max(Number(rankedMinRoi||0),Number(cfg.minRoiPct||0));
        const bidCeiling=row.fairValue>0?Math.floor(Number(row.fairValue)/(1+targetRoi/100)):0;
        const bidHeadroom=bidCeiling>0?bidCeiling-Number(row.price||0):0;
        const underBb=Number(row.bbFloor||0)>0&&Number(row.price||0)<Number(row.bbFloor||0);
        const priceLine=isAuction
          ?'<div>Current bid <b>'+money(row.price)+'</b> · Fair <b>'+money(row.fairValue)+'</b> · '+(targetRoi>0?'Max bid @ '+targetRoi.toFixed(1)+'% ROI ':'Break-even ceiling ')+'<b>'+money(bidCeiling)+'</b> · Headroom <b style="color:'+(bidHeadroom>0?'#9fe3a8':'#ffaaaa')+';">'+(bidHeadroom>=0?'+':'-')+money(Math.abs(bidHeadroom))+'</b></div>'
          :'<div>Ask <b>'+money(row.price)+'</b> · Fair <b>'+money(row.fairValue)+'</b> · Profit <b style="color:'+(profitable?'#9fe3a8':'#ffaaaa')+';">'+(row.profit>=0?'+':'-')+money(Math.abs(row.profit))+'</b> · ROI <b>'+Number(row.roiPct||0).toFixed(1)+'%</b></div>';
        const auctionLine=isAuction
          ?'<div style="color:#d8b96a;">Provisional ROI at current bid '+Number(row.roiPct||0).toFixed(1)+'% · '+Number(row.bids||0)+' bids · ends in '+esc(futureDuration(row.endsAt))+(underBb?' · UNDER BB FLOOR':'')+'</div>'
          :'';
        return '<div style="border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'+
            '<div style="min-width:0;"><b>'+esc(row.itemName)+'</b> · '+esc(row.weaponType)+' · '+esc(row.rarity.toUpperCase())+' · '+esc(row.source)+
              '<div>'+esc(bonus)+'</div>'+
              priceLine+auctionLine+
              '<div style="color:#888;">'+esc(row.valuationSource)+' · BB '+Number(row.bbUnits||0)+' ('+money(row.bbFloor)+') · AH median '+money(row.auctionValue)+' · '+esc(row.history?.cohort||'BASE')+' n='+Number(row.history?.samples||0)+' · confidence '+Number(row.history?.confidence||0)+'%</div>'+
              '<div style="color:#888;">Traffic 7/30/90d '+Number(row.volume7||0)+'/'+Number(row.volume30||0)+'/'+Number(row.volume90||0)+' · liquidity '+Number(row.liquidityScore||0)+'/100 (AH '+Number(row.auctionHistoryLiquidityScore||0)+'/100) · '+(isAuction?'watch '+Number(row.auctionWatchScore||0)+'/100 · urgency '+Number(row.auctionUrgencyScore||0)+'/100 · bid discount '+Number(row.auctionDiscountScore||0)+'/100':'investment '+Number(row.investmentScore||0)+'/100')+'</div>'+pulseLine(row,row.itemId,row.profit)+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">'+
              '<button data-rw-history="'+esc(row.itemId)+'" '+(busy?'disabled':'')+' style="'+button(!historyLoaded)+(busy?'opacity:.5;':'')+'padding:5px 7px;">'+(historyLoaded?'Refresh Sales':'Load Sales')+'</button>'+
              (historyLoaded?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(row.itemId)+'" style="'+button(false)+'text-decoration:none;display:inline-block;padding:5px 7px;">Verified Sales ('+Number(row.history?.samples||0)+') ↓</a>':'')+
              '<button data-rw-open="'+globalIndex+'" style="'+button(true)+'padding:5px 7px;">Open</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No ranked listings match these filters. Refresh Ranked or loosen the filters.</div>')
    );
  }

  function catalogRows(){
    const catalog=state?.procurement?.catalog||{};
    const pricelist=state?.procurement?.pricelist?.items||{};
    const marketplace=state?.marketIntel?.marketplace||{};
    const snapshots=state?.procurement?.marketSnapshots||{};
    return Object.entries(catalog).map(([id,row])=>({
      pricelistBuyPrice:Math.max(0,Number(pricelist?.[String(id)]?.buyPrice||0)),
      pricelistBulkBuyPrice:Math.max(0,Number(pricelist?.[String(id)]?.bulkBuyPrice||0)),
      pricelistBulkThreshold:Math.max(0,Number(pricelist?.[String(id)]?.bulkThreshold||0)),
      bazaarPrice:Math.max(0,Number(marketplace?.[String(id)]?.lowestPrice||0)),
      bazaarAverage:Math.max(0,Number(marketplace?.[String(id)]?.bazaarAverage||0)),
      bazaarSellers:Math.max(0,Number(marketplace?.[String(id)]?.totalBazaars||0)),
      itemMarketPrice:Math.max(0,Number(snapshots?.[String(id)]?.itemMarket?.lowest||0)),
      id:String(row?.id||id),
      name:String(row?.name||('Item '+id)),
      type:String(row?.type||'Other')||'Other',
      subType:String(row?.subType||row?.sub_type||''),
      marketPrice:Math.max(0,Number(row?.marketPrice||row?.market_value||0)),
      buyPrice:Math.max(0,Number(row?.buyPrice||row?.buy_price||0)),
      sellPrice:Math.max(0,Number(row?.sellPrice||row?.sell_price||0)),
      circulation:Math.max(0,Number(row?.circulation||0)),
      shops:Array.isArray(row?.shops)?row.shops:[],
      buyable:Boolean(row?.buyable||Number(row?.marketPrice||0)>0||Number(row?.buyPrice||0)>0||(Array.isArray(row?.shops)&&row.shops.some(shop=>Number(shop?.price||0)>0)))
    })).filter(row=>/^\d+$/.test(row.id)&&row.name);
  }

  function filteredCatalogRows(){
    const q=String(itemQuery||'').trim().toLowerCase();
    let rows=catalogRows().filter(row=>{
      if(itemCategory!=='All'&&row.type!==itemCategory)return false;
      if(itemAvailability==='buyable'&&!row.buyable)return false;
      if(itemAvailability==='market'&&!(row.marketPrice>0))return false;
      if(itemAvailability==='shops'&&!row.shops.some(shop=>Number(shop?.price||0)>0))return false;
      if(itemAvailability==='bazaar'&&!(row.bazaarPrice>0||row.bazaarSellers>0))return false;
      if(itemAvailability==='itemmarket'&&!(row.itemMarketPrice>0))return false;
      if(itemAvailability==='pricelist'&&!(row.pricelistBuyPrice>0))return false;
      if(q&&!row.name.toLowerCase().includes(q)&&row.id!==q&&!row.type.toLowerCase().includes(q)&&!row.subType.toLowerCase().includes(q))return false;
      return true;
    });
    rows.sort((a,b)=>{
      if(itemSort==='category')return a.type.localeCompare(b.type)||a.name.localeCompare(b.name);
      if(itemSort==='market-asc')return (a.marketPrice||Number.MAX_SAFE_INTEGER)-(b.marketPrice||Number.MAX_SAFE_INTEGER)||a.name.localeCompare(b.name);
      if(itemSort==='market-desc')return b.marketPrice-a.marketPrice||a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  function resolveCatalogQuery(value){
    const q=String(value||'').trim();
    if(!q)return {item:null,matches:[]};
    const rows=catalogRows();
    if(/^\d+$/.test(q)){
      const exact=rows.find(row=>row.id===q);
      if(exact)return {item:exact,matches:[exact]};
    }
    const lower=q.toLowerCase();
    const exactName=rows.find(row=>row.name.toLowerCase()===lower);
    if(exactName)return {item:exactName,matches:[exactName]};
    const matches=rows.filter(row=>row.name.toLowerCase().includes(lower)||row.id.includes(q));
    return {item:matches.length===1?matches[0]:null,matches};
  }

  async function refreshItemCatalog({silent=false}={}){
    if(busy)return false;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before loading the Torn item catalog.';
      activeView='settings';render();return false;
    }
    busy=true;
    if(!silent)statusText='Loading the complete Torn item catalog…';
    render();
    try{
      const result=await service.refreshItemCatalog();
      state=result?.state||await core.readLegacyState();
      const count=Number(state?.procurement?.catalogItemCount||result?.rows?.length||0);
      const buyable=Number(state?.procurement?.catalogBuyableCount||0);
      statusText='Torn item catalog updated: '+count.toLocaleString()+' items · '+buyable.toLocaleString()+' buyable.';
      return true;
    }catch(error){
      statusText='Item catalog refresh failed: '+(error?.message||String(error));
      return false;
    }finally{busy=false;render();}
  }

  function ensureItemCatalog(){
    const count=Object.keys(state?.procurement?.catalog||{}).length;
    const at=Date.parse(state?.procurement?.catalogLastSyncAt||'')||0;
    if(!apiKey()||(!count&&busy))return;
    if(!count||!at||Date.now()-at>=CATALOG_STALE_MS){
      if(busy){setTimeout(ensureItemCatalog,1200);return;}
      setTimeout(()=>refreshItemCatalog({silent:count>0}),40);
    }
  }

  async function findCatalogPriceByItem(item){
    if(!item||busy)return;
    if(!apiKey()){
      statusText='Save a Torn API key in Settings before checking live prices.';
      activeView='settings';render();return;
    }
    itemSelection=item;
    itemSources=null;
    busy=true;
    statusText='Finding current Bazaar, Item Market, shop and overseas prices for '+item.name+'…';
    render();
    try{
      itemSources=await service.procurementSourceOptions(item.id,item.name);
      state=itemSources?.state||await core.readLegacyState();
      statusText=itemSources?.sources?.length
        ?'Price comparison ready for '+item.name+'. Lowest available source is listed first.'
        :'No current purchase source was found for '+item.name+'.';
    }catch(error){statusText='Price lookup failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function findCatalogPriceFromInput(root){
    itemQuery=String(root.querySelector('#mm-acq-item-query')?.value||itemQuery).trim();
    const resolved=resolveCatalogQuery(itemQuery);
    if(resolved.item){findCatalogPriceByItem(resolved.item);return;}
    if(resolved.matches.length>1){
      itemPage=0;
      statusText=resolved.matches.length+' catalog matches for “'+itemQuery+'”. Select the exact item below.';
      render();return;
    }
    statusText='No Torn catalog item matches “'+itemQuery+'”.';
    render();
  }

  async function routeCatalogItem(preferredSource='Best'){
    if(!itemSelection||busy)return;
    busy=true;
    statusText='Verifying '+preferredSource+' for '+itemSelection.name+'…';
    render();
    try{
      await refreshTravelContext({force:true,silent:true});
      const result=await service.routeProcurementRequest({itemId:itemSelection.id,itemName:itemSelection.name,preferredSource});
      itemSources=result;
      if(result?.routed){
        statusText='Verified '+result.source+' for '+itemSelection.name+'. Complete the purchase manually on Torn.';
        return;
      }
      if(result?.reason==='overseas-recommended'){
        const priceText=result.priceKnown&&Number(result.price||0)>0?money(result.price)+' each':'price unavailable in current travel feed';
        const profitText=Number(result.profit||0)?' · estimated profit '+money(result.profit):'';
        statusText='Travel is currently cheapest: '+String(result.country||'destination')+' · '+priceText+profitText+'. You can still open Bazaar or Item Market below without leaving this comparison.';
      }else if(result?.reason==='shop-recommended'){
        statusText='Best selected source is '+String(result.shopName||'a Torn shop')+' at '+money(result.price||0)+' each'+(result.country?' · '+String(result.country):'')+'. Purchase remains manual.';
      }else if(result?.reason==='preferred-source-unavailable'){
        statusText=preferredSource+' is not currently available for '+itemSelection.name+'.';
      }else{
        statusText='Could not route '+itemSelection.name+': '+String(result?.reason||'no live source')+'.';
      }
    }catch(error){statusText='Price routing failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function itemPriceResultHtml(){
    if(!itemSelection)return '';
    const sources=Array.isArray(itemSources?.sources)?itemSources.sources:[];
    const targetBuy=Math.max(0,Number(itemSelection?.pricelistBuyPrice||0));
    const exit=Math.max(0,Number(itemSources?.exitValue||0));
    const exitRoute=String(itemSources?.exitRoute||'Unknown');
    const priced=sources.filter(source=>source?.priceKnown!==false&&Number(source?.price||0)>0);
    const best=priced[0]||null;
    const bestPrice=Math.max(0,Number(best?.price||0));
    const bestProfit=exit>0&&bestPrice>0?exit-bestPrice:0;
    const bestRoi=bestPrice>0&&exit>0?bestProfit/bestPrice*100:0;
    const hasTravel=sources.some(source=>String(source?.source||'').toLowerCase()==='overseas');
    const bestIsTravel=String(best?.source||'').toLowerCase()==='overseas';
    const historyRows=Array.isArray(state?.procurement?.ranked?.history?.[String(itemSelection.id)]?.rows)
      ?state.procurement.ranked.history[String(itemSelection.id)].rows:[];
    const rankedEligible=/(weapon|armor|armour)/i.test(String(itemSelection.type||'')+' '+String(itemSelection.subType||''));
    const verifiedSalesAction=historyRows.length
      ?'<a href="#mm-acq-verified-sales" data-sales-view="'+esc(itemSelection.id)+'" style="'+button(false)+'text-decoration:none;display:inline-block;">Completed Sales ('+historyRows.length+') ↓</a>'
      :rankedEligible
        ?'<button data-rw-history="'+esc(itemSelection.id)+'" '+(busy?'disabled':'')+' style="'+button(false)+(busy?'opacity:.5;':'')+'">Load Completed Sales</button>'
        :'';

    const rows=sources.length?sources.map((source,index)=>{
      const sourcePrice=Math.max(0,Number(source.price||0));
      const priceKnown=source.priceKnown!==false&&sourcePrice>0;
      const profit=exit>0&&priceKnown?exit-sourcePrice:0;
      const roi=exit>0&&priceKnown?profit/sourcePrice*100:0;
      const sourceName=String(source.source||'Unknown').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel');
      const bestBadge=index===0&&priceKnown?'<span style="color:#d8b96a;font-size:10px;">CHEAPEST</span>':'';
      const facts=[
        source.shopName?String(source.shopName):'',
        source.country?String(source.country):'',
        Number(source.quantity||0)>0?'Available '+Number(source.quantity).toLocaleString():'',
        source.aggregateOnly&&Number(source.bazaarCount||0)>0?Number(source.bazaarCount).toLocaleString()+' bazaars':'',
        source.travelEvidence?'Estimated travel profit '+money(source.profit||0):''
      ].filter(Boolean);
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
        '<div style="min-width:0;">'+
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>'+esc(sourceName)+'</b>'+bestBadge+'</div>'+
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;">'+
            '<span>Price <b>'+(priceKnown?money(sourcePrice):'not shown')+'</b></span>'+
            (exit>0&&priceKnown?'<span>Likely resale <b>'+money(exit)+'</b></span><span>Est. profit <b style="color:'+(profit>=0?'#9fe3a8':'#ffaaaa')+';">'+(profit>=0?'+':'-')+money(Math.abs(profit))+'</b></span>':'')+
          '</div>'+
          (facts.length?'<div style="color:#888;margin-top:3px;">'+esc(facts.join(' · '))+'</div>':'')+
        '</div>'+
        (String(source.source||'').toLowerCase().startsWith('bazaar')
          ?'<button data-item-alt-source="Bazaar" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">GO TO BAZAAR</button>'
          :String(source.source||'').toLowerCase()==='item market'
            ?'<button data-item-alt-source="Item Market" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">GO TO ITEM MARKET</button>'
            :String(source.source||'').toLowerCase()==='overseas'
              ?'<button data-item-travel="1" style="'+button(index===0&&priceKnown)+'">GO TO TRAVEL AGENCY</button>'
              :'<button data-item-route="'+esc(source.source)+'" '+(busy?'disabled':'')+' style="'+button(index===0&&priceKnown)+(busy?'opacity:.5;':'')+'">USE '+esc(sourceName.toUpperCase())+'</button>')+
      '</div>';
    }).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No current price sources were found.</div>';

    const decision=sources.length&&best
      ?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:6px;margin:8px 0;">'+
        '<div style="border:1px solid #3e3520;border-radius:6px;padding:8px;background:#1a1710;"><div style="font-size:9px;color:#9c9275;">CHEAPEST PRICE</div><b>'+esc(String(best.source||'').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel'))+' · '+money(bestPrice)+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">LIKELY RESALE</div><b>'+money(exit)+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">ESTIMATED PROFIT</div><b style="color:'+(bestProfit>=0?'#9fe3a8':'#ffaaaa')+';">'+(bestProfit>=0?'+':'-')+money(Math.abs(bestProfit))+'</b></div>'+
        '<div style="border:1px solid #333;border-radius:6px;padding:8px;background:#141414;"><div style="font-size:9px;color:#888;">RETURN ON COST</div><b>'+bestRoi.toFixed(1)+'%</b><div style="font-size:9px;color:#777;">also called ROI</div></div>'+
      '</div>'
      :'';

    return card(
      '<div><b style="font-size:14px;">'+esc(itemSelection.name)+'</b> <span style="color:#777;">['+esc(itemSelection.id)+']</span><div style="font-size:10px;color:#888;">Check prices, then click GO TO BAZAAR or GO TO ITEM MARKET. Buying remains manual.</div></div>'+
      decision+
      '<div style="border:1px solid #6b5a2e;background:#19170f;border-radius:8px;padding:9px;margin:8px 0;">'+
        '<div style="font-size:12px;font-weight:700;color:#f0d27a;">WHERE DO YOU WANT TO BUY?</div>'+
        '<div style="font-size:10px;color:#aaa;margin:2px 0 7px;">Choose one. Acquisitions opens the page; you make the purchase manually.</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:6px;">'+
          '<button data-item-alt-source="Bazaar" '+(busy?'disabled':'')+' style="'+button(String(best?.source||'').toLowerCase().startsWith('bazaar'))+(busy?'opacity:.5;':'')+'padding:10px;"><b>GO TO BAZAAR</b><br><span style="font-size:9px;font-weight:400;">Player-owned bazaars</span></button>'+
          '<button data-item-alt-source="Item Market" '+(busy?'disabled':'')+' style="'+button(String(best?.source||'').toLowerCase()==='item market')+(busy?'opacity:.5;':'')+'padding:10px;"><b>GO TO ITEM MARKET</b><br><span style="font-size:9px;font-weight:400;">Torn Item Market for this item</span></button>'+
          (hasTravel?'<button data-item-travel="1" style="'+button(bestIsTravel)+'padding:10px;"><b>GO TO TRAVEL AGENCY</b><br><span style="font-size:9px;font-weight:400;">Overseas buying</span></button>':'')+
        '</div>'+
        (best?'<div style="font-size:10px;color:#d8b96a;margin-top:6px;">Cheapest currently shown: <b>'+esc(String(best.source||'').replace('Bazaar aggregate','Bazaar').replace('Overseas','Travel'))+'</b> at '+money(bestPrice)+'.</div>':'')+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">'+verifiedSalesAction+'</div>'+
      (best&&String(best.source||'')==='Overseas'?'<div style="padding:6px;border:1px solid #6d5928;border-radius:5px;color:#e3ca82;font-size:10px;margin-bottom:6px;"><b>Travel is cheapest.</b> You can still open Bazaar or Item Market above if you do not want to travel.</div>':'')+
      pulseLine({},itemSelection.id,bestProfit)+
      (verifiedSalesItemId===String(itemSelection.id)?verifiedSalesHtml(itemSelection.id):'')+
      '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:10px;color:#aaa;"><b>All price sources and extra details</b></summary>'+
        (targetBuy>0?'<div style="font-size:10px;color:#888;margin:5px 0;">Your pricelist buy target: <b>'+money(targetBuy)+'</b> · resale estimate source: '+esc(exitRoute)+'</div>':'')+
        rows+
      '</details>'
    );
  }

  function itemsHtml(){
    const all=catalogRows();
    const categories=[...new Set(all.map(row=>row.type).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const rows=filteredCatalogRows();
    const pages=Math.max(1,Math.ceil(rows.length/ITEM_PAGE_SIZE));
    itemPage=Math.max(0,Math.min(itemPage,pages-1));
    const start=itemPage*ITEM_PAGE_SIZE;
    const visible=rows.slice(start,start+ITEM_PAGE_SIZE);
    const options=categories.map(cat=>'<option value="'+esc(cat)+'"'+(itemCategory===cat?' selected':'')+'>'+esc(cat)+'</option>').join('');
    return card(
      '<b>Find One Item</b>'+
      '<div style="font-size:11px;color:#aaa;margin:3px 0 7px;">Type an item name or Torn item ID, then click <b>Check Prices</b>.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:5px;">'+
        '<input id="mm-acq-item-query" type="search" placeholder="Example: Can of Crocozade" value="'+esc(itemQuery)+'" style="'+inputCss()+'width:100%;">'+
        '<button id="mm-acq-item-find" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Check Prices</button>'+
      '</div>'+
      '<details style="margin-top:7px;"><summary style="cursor:pointer;font-size:10px;color:#888;">More search filters</summary>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;margin-top:6px;">'+
          '<select id="mm-acq-item-category" style="'+inputCss()+'width:100%;"><option value="All">All categories</option>'+options+'</select>'+
          '<select id="mm-acq-item-availability" style="'+inputCss()+'width:100%;">'+
            '<option value="buyable"'+(itemAvailability==='buyable'?' selected':'')+'>Buyable items</option>'+
            '<option value="bazaar"'+(itemAvailability==='bazaar'?' selected':'')+'>Has Bazaar price</option>'+
            '<option value="itemmarket"'+(itemAvailability==='itemmarket'?' selected':'')+'>Has Item Market price</option>'+
            '<option value="shops"'+(itemAvailability==='shops'?' selected':'')+'>Torn shop item</option>'+
            '<option value="pricelist"'+(itemAvailability==='pricelist'?' selected':'')+'>On your pricelist</option>'+
            '<option value="all"'+(itemAvailability==='all'?' selected':'')+'>All items</option>'+
          '</select>'+
          '<select id="mm-acq-item-sort" style="'+inputCss()+'width:100%;">'+
            '<option value="name"'+(itemSort==='name'?' selected':'')+'>Name A-Z</option>'+
            '<option value="category"'+(itemSort==='category'?' selected':'')+'>Category</option>'+
            '<option value="market-asc"'+(itemSort==='market-asc'?' selected':'')+'>Price low-high</option>'+
            '<option value="market-desc"'+(itemSort==='market-desc'?' selected':'')+'>Price high-low</option>'+
          '</select>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;"><button id="mm-acq-item-filter" style="'+button()+'">Apply Filters</button><button id="mm-acq-catalog-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Item List</button><button id="mm-acq-pricelist-refresh" '+(busy?'disabled':'')+' style="'+button()+(busy?'opacity:.5;':'')+'">Refresh Pricelist</button></div>'+
      '</details>'
    )+
    itemPriceResultHtml()+
    card(
      '<details'+(itemQuery&&!itemSelection?' open':'')+'><summary style="cursor:pointer;"><b>Browse item list</b> · '+rows.length.toLocaleString()+' matches</summary>'+
        '<div style="display:flex;justify-content:flex-end;gap:4px;margin:7px 0;font-size:10px;"><button id="mm-acq-item-prev" '+(itemPage<=0?'disabled':'')+' style="'+button()+(itemPage<=0?'opacity:.4;':'')+'padding:4px 7px;">Previous</button><button id="mm-acq-item-next" '+(itemPage>=pages-1?'disabled':'')+' style="'+button()+(itemPage>=pages-1?'opacity:.4;':'')+'padding:4px 7px;">Next</button></div>'+
        (visible.length?visible.map(row=>
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
            '<div style="min-width:0;"><b>'+esc(row.name)+'</b> <span style="color:#777;">['+esc(row.id)+']</span><div style="color:#888;">'+esc(row.type)+(row.bazaarPrice>0?' · Bazaar '+money(row.bazaarPrice):'')+(row.itemMarketPrice>0?' · Item Market '+money(row.itemMarketPrice):'')+'</div></div>'+
            '<button data-catalog-find="'+esc(row.id)+'" '+(busy?'disabled':'')+' style="'+button(itemSelection?.id===row.id)+(busy?'opacity:.5;':'')+'white-space:nowrap;">Check Price</button>'+
          '</div>'
        ).join(''):'<div style="font-size:11px;color:#888;margin-top:6px;">No items match these filters.</div>')+
      '</details>'
    );
  }

  function settingsHtml(){
    const r=state?.businessRules||{};
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulseRows=Object.values(pulseState.items||{});
    const pulseBudget=pulse?.budgetStatus?.(state)||{used:0,limit:0};
    const pulseProven=pulseRows.filter(row=>String(row?.tier||'')==='proven').length;
    const pulseCandidates=pulseRows.filter(row=>String(row?.tier||'')==='candidate').length;
    return card(
      '<b>Setup · Torn API key</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">The API key is stored only in this userscript\'s Tampermonkey GM storage. It is not copied to shared IndexedDB/localStorage. Required scope: Torn Items catalog, User Basic, User Log purchase events used by the ledger, and market data needed for live verification.</div>'+
      '<div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto;gap:5px;align-items:center;">'+
        '<input id="mm-acq-api" type="password" autocomplete="off" placeholder="'+(apiKey()?'Torn API key saved — enter to replace':'Torn API key')+'" style="'+inputCss()+'">'+
        '<button id="mm-acq-save-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-acq-clear-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">While Acquisitions is open and visible, stale purchase logs and opportunity data refresh automatically with guarded intervals. Weav3r generation is checked once per minute. Verify & Buy and final purchase remain manual.</div>'
    )+
    '<details style="margin-bottom:7px;"><summary style="cursor:pointer;border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;"><b>Advanced settings</b> · optional</summary><div style="margin-top:7px;">'+
    card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
        '<div><b>Market Activity</b><div style="font-size:10px;color:#888;margin-top:4px;">Seller-free Torn API movement intelligence. One cross-tab engine lease, bounded cache/history, cache-delay-aware cadence and local request-budget governor. No seller-target, mug or attack model is retained.</div></div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-acq-pulse-refresh" '+(busy?'disabled':'')+' style="'+button(true)+(busy?'opacity:.5;':'')+'">Refresh Pulse</button><button id="mm-acq-pulse-export" style="'+button()+'">Export Diagnostics</button></div>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;margin-top:7px;">Source: Torn API v2 Item Market · cached items '+pulseRows.length+' · proven '+pulseProven+' · candidates '+pulseCandidates+' · request budget '+Number(pulseBudget.used||0)+'/'+Number(pulseBudget.limit||0)+' in the last minute · updated '+(Number(pulseState.updatedAt||0)?esc(age(new Date(Number(pulseState.updatedAt)).toISOString())):'not synced')+'.</div>'
    )+
    card(
      '<b>Deal Rules</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">These are the same shared rules used by the legacy CRM. MM Acquisitions writes only the Core configuration domain.</div>'+
      '<div style="font-size:10px;color:#777;margin:0 0 6px;">Personal-demand minimum applies only when enough personal sales history exists; otherwise the deal is labeled MARKET PROXY and ranked by market sell-through evidence.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;">'+
        '<label style="font-size:10px;color:#aaa;">Min ROI %<input id="mm-acq-rule-min-roi" type="number" min="0" step="0.1" value="'+Number(r.minRoiPct||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min personal demand/day<input id="mm-acq-rule-min-demand" type="number" min="0" step="0.01" value="'+Number(r.minDemandPerDay||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min buy<input id="mm-acq-rule-min-price" type="number" min="0" value="'+Number(r.minPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max buy<input id="mm-acq-rule-max-price" type="number" min="0" value="'+Number(r.maxPrice||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min profit/unit<input id="mm-acq-rule-min-profit" type="number" min="0" value="'+Number(r.minAbsoluteProfit||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min live listings<input id="mm-acq-rule-min-sellers" type="number" min="0" value="'+Number(r.minSellerCount||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min confidence %<input id="mm-acq-rule-min-confidence" type="number" min="0" max="100" step="1" value="'+Number(r.minConfidencePct||0)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Listing freshness sec<input id="mm-acq-rule-max-age" type="number" min="30" value="'+Number(r.maxListingAgeSec||180)+'" style="'+inputCss()+'width:100%;"></label>'+
      '</div>'+
      '<button id="mm-acq-save-rules" style="'+button(true)+'margin-top:7px;">Save Shared Rules</button>'
    )+
    card(
      '<b>Ranked Weapon Rules</b>'+
      '<div style="font-size:10px;color:#888;margin:4px 0 7px;">BB floor uses Torn exchange values and the Bunker Bucks price from the configured TornW3B pricelist. Completed auction history comes from Torn API. Live ranked market/auction listings use the existing TornW3B dependency.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:5px;">'+
        '<label style="font-size:10px;color:#aaa;">Pricelist Torn ID<input id="mm-acq-rw-pricelist" value="'+esc(rankedSettings().pricelistUserId)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">AH history days<input id="mm-acq-rw-history" type="number" min="7" max="365" value="'+Number(rankedSettings().historyDays)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Bonus roll band %<input id="mm-acq-rw-band" type="number" min="1" max="25" value="'+Number(rankedSettings().bonusBand)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Min comparable sales<input id="mm-acq-rw-min-sales" type="number" min="1" max="20" value="'+Number(rankedSettings().minComparableSales)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Ranked min ROI %<input id="mm-acq-rw-min-roi" type="number" min="0" value="'+Number(rankedSettings().minRoiPct)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Ranked min confidence %<input id="mm-acq-rw-min-confidence" type="number" min="0" max="100" value="'+Number(rankedSettings().minConfidencePct)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Market pages/type<input id="mm-acq-rw-market-pages" type="number" min="1" max="5" value="'+Number(rankedSettings().pagesPerType)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Auction pages<input id="mm-acq-rw-auction-pages" type="number" min="1" max="6" value="'+Number(rankedSettings().auctionPages)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;">Max live age hours<input id="mm-acq-rw-max-age" type="number" min="1" max="168" value="'+Number(rankedSettings().maxLiveAgeHours)+'" style="'+inputCss()+'width:100%;"></label>'+
        '<label style="font-size:10px;color:#aaa;grid-column:1/-1;">Low-tier bonus labels<input id="mm-acq-rw-low-bonuses" value="'+esc(rankedSettings().lowTierBonuses.join(','))+'" style="'+inputCss()+'width:100%;"></label>'+
      '</div>'+
      '<button id="mm-acq-save-ranked" style="'+button(true)+'margin-top:7px;">Save Ranked Rules</button>'
    )+
    '</div></details>';
  }

  function detailStateKey(view,details){
    const label=String(details?.querySelector?.('summary')?.textContent||'').trim().replace(/\s+/g,' ');
    return label?String(view||'home')+'|'+label:'';
  }

  function capturePanelUiState(root){
    if(!root||!renderedView)return;
    const scroller=root.querySelector('#mm-acq-content');
    if(scroller)viewScrollTop.set(renderedView,Number(scroller.scrollTop||0));
    root.querySelectorAll('details').forEach(details=>{
      const key=detailStateKey(renderedView,details);
      if(key)detailOpenState.set(key,Boolean(details.open));
    });
  }

  function restorePanelUiState(root){
    if(!root)return;
    root.querySelectorAll('details').forEach(details=>{
      const key=detailStateKey(activeView,details);
      if(key&&detailOpenState.has(key))details.open=Boolean(detailOpenState.get(key));
    });
    const scroller=root.querySelector('#mm-acq-content');
    if(scroller)scroller.scrollTop=Number(viewScrollTop.get(activeView)||0);
    renderedView=activeView;
  }

  function createPanel(){
    if(document.getElementById(ROOT_ID))return;
    const root=document.createElement('div');
    root.id=ROOT_ID;
    root.style.cssText='display:none;position:fixed;right:12px;top:90px;z-index:2147483646;width:min(700px,calc(100vw - 24px));max-height:calc(100vh - 110px);overflow:hidden;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:9px;box-shadow:0 12px 35px #000b;font:13px/1.35 Arial,sans-serif;';
    document.body.appendChild(root);
  }

  function render(){
    const root=document.getElementById(ROOT_ID);
    if(!root||root.style.display==='none')return;
    capturePanelUiState(root);

    root.innerHTML=
      '<div style="height:48px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 9px;">'+
        '<div><b style="font-size:15px;">MM_Acquisitions</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.25-pda.12 · SIMPLE BUYING WORKFLOW</div></div>'+
        '<button id="mm-acq-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;">'+
          '<button data-acq-view="home" style="'+button(activeView==='home')+'">Home</button>'+
          '<button data-acq-view="items" style="'+button(activeView==='items')+'">Find Item</button>'+
          '<button data-acq-view="deals" style="'+button(activeView==='deals')+'">Best Deals</button>'+
          '<button data-acq-view="ranked" style="'+button(activeView==='ranked')+'">Ranked Weapons</button>'+
          '<button data-acq-view="travel" style="'+button(activeView==='travel')+'">Travel Deals</button>'+
          '<button data-acq-view="settings" style="'+button(activeView==='settings')+'">Setup</button>'+
        '</div>'+
        '<div style="padding:7px 8px;background:#17140c;border:1px solid #5b4a22;border-radius:6px;color:#e0c56b;margin-bottom:6px;font-size:10px;line-height:1.4;"><b>To open Bazaar or Item Market:</b> Find Item → Check Prices → click <b>GO TO BAZAAR</b> or <b>GO TO ITEM MARKET</b>.</div>'+
        '<div style="padding:5px 7px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<b style="color:#ffaaaa;">Cannot read shared CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>'):'')+
        '<div id="mm-acq-content" style="max-height:calc(100vh - 240px);overflow:auto;padding-right:2px;">'+
          (activeView==='home'?homeHtml():activeView==='settings'?settingsHtml():activeView==='travel'?travelHtml():activeView==='ranked'?rankedHtml():activeView==='items'?itemsHtml():dealsHtml())+
        '</div>'+
      '</div>';

    core?.makePanelDraggable?.(
      root,
      root.firstElementChild,
      'acquisitions',
      window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'90px'}
    );
    restorePanelUiState(root);
    root.querySelector('#mm-acq-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-acq-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView=b.dataset.acqView||'home';
      render();
      if(activeView==='travel'&&apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
      if(activeView==='items'||activeView==='ranked')ensureItemCatalog();
      if(activeView==='ranked')setTimeout(ensureRankedFresh,80);
    }));
    root.querySelectorAll('[data-home-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView=String(b.dataset.homeView||'items');
      render();
      if(activeView==='items'||activeView==='ranked')ensureItemCatalog();
      if(activeView==='ranked')setTimeout(ensureRankedFresh,80);
      if(activeView==='travel'&&apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    }));
    root.querySelectorAll('#mm-acq-reload').forEach(b=>b.addEventListener('click',reloadCachedState));
    root.querySelector('#mm-acq-live-refresh')?.addEventListener('click',refreshOpportunities);
    root.querySelector('#mm-acq-sync-purchases')?.addEventListener('click',syncPurchases);
    root.querySelector('#mm-acq-pulse-refresh')?.addEventListener('click',refreshMarketPulse);
    root.querySelector('#mm-acq-pulse-export')?.addEventListener('click',exportMarketPulseDiagnostics);
    root.querySelector('#mm-acq-travel-update')?.addEventListener('click',updateTravelData);
    root.querySelector('#mm-acq-travel-import')?.addEventListener('click',()=>importTravelCapture({silent:false}).catch(error=>{
      statusText='Travel import failed: '+(error?.message||String(error));
      render();
    }));
    root.querySelectorAll('[data-acquire-item]').forEach(b=>b.addEventListener('click',()=>acquire(b.dataset.acquireItem)));
    root.querySelectorAll('[data-pricelist-verify]').forEach(b=>b.addEventListener('click',()=>{
      const item=catalogRows().find(row=>row.id===String(b.dataset.pricelistVerify||''));
      if(!item)return;
      itemQuery=item.name;
      activeView='items';
      findCatalogPriceByItem(item);
    }));
    root.querySelector('#mm-acq-armory-refresh')?.addEventListener('click',refreshArmorySources);
    root.querySelector('#mm-acq-armory-travel-agency')?.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';});
    root.querySelector('#mm-acq-armory-clear')?.addEventListener('click',()=>{armoryRequest=null;armorySources=null;statusText='Faction Armory acquisition request cleared.';render();});
    root.querySelectorAll('[data-armory-route]').forEach(b=>b.addEventListener('click',()=>routeArmoryRequest(b.dataset.armoryRoute||'Best')));
    root.querySelector('#mm-acq-catalog-refresh')?.addEventListener('click',()=>refreshItemCatalog({silent:false}));
    root.querySelector('#mm-acq-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-pricelist-refresh')?.addEventListener('click',refreshPricelist);
    root.querySelector('#mm-acq-rw-live-refresh')?.addEventListener('click',refreshRankedLive);
    root.querySelectorAll('[data-travel-compare]').forEach(b=>b.addEventListener('click',()=>compareTravelItem(b.dataset.travelCompare,b.dataset.travelName)));
    root.querySelectorAll('[data-travel-source]').forEach(b=>b.addEventListener('click',()=>routeTravelAlternative(b.dataset.travelId,b.dataset.travelName,b.dataset.travelSource)));
    root.querySelectorAll('[data-travel-agency]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';}));
    root.querySelector('#mm-acq-rw-analyze-visible')?.addEventListener('click',analyzeVisibleRanked);
    root.querySelector('#mm-acq-rw-filter')?.addEventListener('click',()=>{
      rankedType=String(root.querySelector('#mm-acq-rw-type')?.value||'all');
      rankedSource=String(root.querySelector('#mm-acq-rw-source')?.value||'all');
      rankedRarity=String(root.querySelector('#mm-acq-rw-rarity')?.value||'all');
      rankedWeapon=String(root.querySelector('#mm-acq-rw-weapon')?.value||'').trim();
      rankedBonus=String(root.querySelector('#mm-acq-rw-bonus')?.value||'').trim();
      rankedMinRoi=Math.max(0,Number(root.querySelector('#mm-acq-rw-roi')?.value||0));
      rankedPage=0;render();
    });
    root.querySelector('#mm-acq-rw-prev')?.addEventListener('click',()=>{rankedPage=Math.max(0,rankedPage-1);render();});
    root.querySelector('#mm-acq-rw-next')?.addEventListener('click',()=>{rankedPage++;render();});
    root.querySelectorAll('[data-rw-history]').forEach(b=>b.addEventListener('click',()=>analyzeRankedHistory(b.dataset.rwHistory)));
    root.querySelectorAll('[data-sales-view]').forEach(a=>a.addEventListener('click',event=>{
      event.preventDefault();
      verifiedSalesItemId=String(a.dataset.salesView||'');
      render();
      setTimeout(()=>document.getElementById('mm-acq-verified-sales')?.scrollIntoView({block:'nearest',behavior:'smooth'}),0);
    }));
    root.querySelectorAll('[data-sales-close]').forEach(b=>b.addEventListener('click',()=>{
      verifiedSalesItemId='';
      render();
    }));
    root.querySelectorAll('[data-rw-open]').forEach(b=>b.addEventListener('click',()=>routeRankedListing(b.dataset.rwOpen)));
    root.querySelector('#mm-acq-item-filter')?.addEventListener('click',()=>{
      itemQuery=String(root.querySelector('#mm-acq-item-query')?.value||'').trim();
      itemCategory=String(root.querySelector('#mm-acq-item-category')?.value||'All');
      itemAvailability=String(root.querySelector('#mm-acq-item-availability')?.value||'buyable');
      itemSort=String(root.querySelector('#mm-acq-item-sort')?.value||'name');
      itemPage=0;render();
    });
    root.querySelector('#mm-acq-item-find')?.addEventListener('click',()=>findCatalogPriceFromInput(root));
    root.querySelector('#mm-acq-item-query')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();findCatalogPriceFromInput(root);}
    });
    root.querySelector('#mm-acq-item-prev')?.addEventListener('click',()=>{itemPage=Math.max(0,itemPage-1);render();});
    root.querySelector('#mm-acq-item-next')?.addEventListener('click',()=>{itemPage++;render();});
    root.querySelectorAll('[data-catalog-find]').forEach(b=>b.addEventListener('click',()=>{
      const item=catalogRows().find(row=>row.id===String(b.dataset.catalogFind||''));
      if(item){itemQuery=item.name;findCatalogPriceByItem(item);}
    }));
    root.querySelectorAll('[data-item-route]').forEach(b=>b.addEventListener('click',()=>routeCatalogItem(b.dataset.itemRoute||'Best')));
    root.querySelectorAll('[data-item-alt-source]').forEach(b=>b.addEventListener('click',()=>routeCatalogItem(b.dataset.itemAltSource||'Best')));
    root.querySelectorAll('[data-item-travel]').forEach(b=>b.addEventListener('click',()=>{location.href='https://www.torn.com/travelagency.php';}));
    root.querySelector('#mm-acq-save-key')?.addEventListener('click',()=>{
      const value=String(root.querySelector('#mm-acq-api')?.value||'').trim();
      if(value)GM_setValue(API_KEY,value);
      statusText=value?'MM Acquisitions API key saved. Refreshing automatically…':'Enter a key to save.';
      render();
      if(value)setTimeout(()=>autoRefreshAcquisitions({force:true}),50);
    });
    root.querySelector('#mm-acq-clear-key')?.addEventListener('click',()=>{
      GM_deleteValue(API_KEY);
      statusText='MM Acquisitions API key cleared.';
      render();
    });
    root.querySelector('#mm-acq-save-ranked')?.addEventListener('click',()=>saveRankedSettings(root).catch(error=>{
      statusText='Could not save ranked rules: '+(error?.message||String(error));
      render();
    }));
    root.querySelector('#mm-acq-save-rules')?.addEventListener('click',()=>saveBusinessRules(root).catch(error=>{
      statusText='Could not save rules: '+(error?.message||String(error));
      render();
    }));
  }

  function open(){
    createPanel();
    const root=document.getElementById(ROOT_ID);
    root.style.display='block';
    GM_setValue(PANEL_OPEN_KEY,true);
    core?.setDockLauncherActive?.('acquisitions',true);
    render();
    reloadCachedState().then(()=>autoRefreshAcquisitions({force:false}));
    if(apiKey())refreshTravelContext({force:false,silent:true}).then(()=>render());
    startWatcher();
    startAutoRefresh();
  }

  function close(){
    const root=document.getElementById(ROOT_ID);
    if(root)root.style.display='none';
    GM_setValue(PANEL_OPEN_KEY,false);
    core?.setDockLauncherActive?.('acquisitions',false);
    stopWatcher();
  }

  function createLauncher(){
    if(!document.body)return;
    if(core?.registerDockLauncher&&!globalThis.__MM_TORN_PDA__){
      const b=core.registerDockLauncher({
        id:'acquisitions',
        label:'MM_Acquisitions',
        accent:'#4d7f65',
         icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M4 12h8M4 17h5M16 5l4 4-7 7-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        onClick:()=>{
          const root=document.getElementById(ROOT_ID);
          if(!root||root.style.display==='none')open();
          else core?.setDockLauncherActive?.('acquisitions',true);
        }
      });
      if(b)b.id=LAUNCHER_ID;
      core.adoptLegacyCrmLauncher?.();
      return;
    }
    if(document.getElementById(LAUNCHER_ID))return;
    const b=document.createElement('button');
    b.id=LAUNCHER_ID;
    b.textContent='Acquisitions';
    b.style.cssText='position:fixed;right:10px;bottom:86px;z-index:2147483647;'+button(true);
    b.addEventListener('click',open);
    document.body.appendChild(b);
  }

  if(/^(www\.)?weav3r\.dev$/.test(location.hostname)){
    installTravelCollector();
    return;
  }
  globalThis.__MM_ACQ_OPEN__=open;globalThis.__MM_ACQ_PDA_STAGE='ui-ready';
  function initializeAcquisitions(){
    createLauncher();
    installChannel();
    startAutoRefresh();
    if(Boolean(GM_getValue(PANEL_OPEN_KEY,false)))setTimeout(open,0);
  }
  window.addEventListener('pagehide',()=>{stopAutoRefresh();pulseEngine?.release?.();},{once:true});
  if(document.body)initializeAcquisitions();
  else window.addEventListener('DOMContentLoaded',initializeAcquisitions,{once:true});
})();
