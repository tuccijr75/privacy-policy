(() => {
  'use strict';

  globalThis.__MM_TORN_PDA__=true;

  // TornPDA/GMforPDA may expose GM_* helpers as non-writable,
  // non-configurable properties. Never assign or replace them here.
  // Acquisitions owns its request fallback locally in the UI/runtime source;
  // durable cross-origin handoff state uses lexical PDA_storage below.
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
    if(typeof original.createEmptySharedState!=='function'){
      throw new Error('MM Torn Core empty-state factory is unavailable.');
    }
    const createdAt=new Date().toISOString();
    const base=original.createEmptySharedState(createdAt);
    base.businessRules={
      minRoiPct:0,
      minDemandPerDay:0,
      minPrice:0,
      maxPrice:100000000000,
      minAbsoluteProfit:0,
      minSellerCount:0,
      minConfidencePct:0,
      maxListingAgeSec:180,
      updatedAt:createdAt
    };
    base.procurement={
      acquisitions:[],
      watchlist:{},
      catalog:{},
      marketSnapshots:{},
      marketHistory:{},
      ranked:{settings:{}},
      pricelist:{items:{}}
    };
    base.operations={};
    base.marketIntel={
      settings:{bazaarExitHaircutPct:0},
      marketplace:{},
      details:{},
      traders:{},
      history:{}
    };
    base.travelIntel={rows:[],history:{},settings:{}};
    base.meta={...(base.meta||{}),platform:'tornpda',createdAt};
    return base;
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
