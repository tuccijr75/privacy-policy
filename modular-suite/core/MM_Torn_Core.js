(() => {
  'use strict';

  const CORE_VERSION = '8.0.0-alpha.9';
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
  const DOCK_DEFAULT_LAYOUT_KEY='mm_torn_module_default_layout_rev_v1';
  const DOCK_DEFAULT_LAYOUT_REV='footer-adjacent-v3-ordered';
  // Flex order is left -> right. The requested operational order is therefore
  // Trade, Armory, Customers, Acquisitions, Inventory when read right -> left.
  // Other MM launchers remain to the left and never displace that five-icon cluster.
  const DOCK_DEFAULT_ORDER=Object.freeze([
    'crm','scout','bazaar','intelligence',
    'inventory-roi','acquisitions','customers','armory','trade-reminder'
  ]);
  const PANEL_POSITION_PREFIX='mm_torn_panel_position_v1:';
  const LAUNCHER_EDGE_MARGIN=4;
  const LAUNCHER_SNAP_GAP=4;
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
      if(localStorage.getItem(DOCK_DEFAULT_LAYOUT_KEY)===DOCK_DEFAULT_LAYOUT_REV)return;
      // One-time migration for this layout revision: put every MM launcher back
      // in the shared Torn-adjacent dock and apply the requested default order.
      // After this migration, any user undock/reorder/move is persisted.
      localStorage.removeItem(DOCK_FLOAT_KEY);
      localStorage.removeItem(DOCK_ORDER_KEY);
      localStorage.removeItem(DOCK_ORDER_CUSTOM_KEY);
      localStorage.setItem(DOCK_DEFAULT_LAYOUT_KEY,DOCK_DEFAULT_LAYOUT_REV);
    }catch{}
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
        const nativeHeight=heights[Math.floor(heights.length/2)]||first.r.height;
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

    return candidates.sort((a,b)=>
      a.bottomDistance-b.bottomDistance||
      b.controls.length-a.controls.length||
      Math.abs(a.nativeHeight-42)-Math.abs(b.nativeHeight-42)||
      b.r.right-a.r.right
    )[0]||null;
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
      const gap=clamp(Number(native.nativeGap)||LAUNCHER_SNAP_GAP,2,8);
      const desiredLeft=first.left-dock.offsetWidth-gap;
      const desiredTop=(native.rowBottom??first.bottom)-dock.offsetHeight;

      dock.style.right='auto';
      dock.style.bottom='auto';

      if(desiredLeft>=4){
        // Exact target: immediately left of Torn's first native button, same bottom edge.
        dock.style.left=Math.round(desiredLeft)+'px';
        dock.style.top=Math.round(clamp(desiredTop,4,window.innerHeight-dock.offsetHeight-4))+'px';
      }else{
        // Narrow-screen fallback: same left edge as Torn, one native-button row above.
        dock.style.left=Math.max(4,Math.round(first.left))+'px';
        const aboveTop=first.top-dock.offsetHeight-gap;
        dock.style.top=Math.round(clamp(aboveTop,4,window.innerHeight-dock.offsetHeight-4))+'px';
      }
    }else{
      dock.style.right='6px';
      dock.style.left='auto';
      dock.style.top='auto';
      dock.style.bottom='6px';
    }
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

  function ensureDock(){
    if(typeof document==='undefined'||!document.body)return null;
    applyDefaultDockLayoutOnce();
    injectDockStyle();
    let dock=document.getElementById(DOCK_ID);
    if(!dock){
      dock=document.createElement('div');
      dock.id=DOCK_ID;
      dock.setAttribute('aria-label','MM Torn module dock');
      dock.dataset.mmDockAnchor='left-of-torn-native-bottom-toolbar';
      dock.dataset.mmDefaultRightToLeft='trade-reminder,armory,customers,acquisitions,inventory-roi';
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
        dockWriteOrder(dock);
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
