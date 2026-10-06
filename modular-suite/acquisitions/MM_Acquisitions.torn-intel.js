(() => {
  'use strict';

  const TRAVEL_TABLE_URL='https://torn-intel.com/api/v1/foreign-stock/travel-table';
  const HISTORY_URL='https://torn-intel.com/api/v1/public/foreign-stock/history';
  const KEYED_COOLDOWN_MS=65_000;
  const MAX_TRANSITION_GAP_MS=5*60_000;
  const MIN_ETA_CYCLES=3;
  const MAX_STORED_CYCLES=60;
  const MAX_STORED_KEYS=120;
  const RESTOCK_RETENTION_MS=30*86400000;

  const COUNTRY_NAMES=Object.freeze({
    mex:'Mexico',
    cay:'Cayman Islands',
    can:'Canada',
    haw:'Hawaii',
    uni:'United Kingdom',
    arg:'Argentina',
    swi:'Switzerland',
    jap:'Japan',
    chi:'China',
    uae:'United Arab Emirates',
    sou:'South Africa'
  });

  const COUNTRY_ALIASES=Object.freeze({
    mexico:'mex',
    'cayman islands':'cay',
    cayman:'cay',
    canada:'can',
    hawaii:'haw',
    'united kingdom':'uni',
    uk:'uni',
    england:'uni',
    argentina:'arg',
    switzerland:'swi',
    japan:'jap',
    china:'chi',
    uae:'uae',
    'united arab emirates':'uae',
    'south africa':'sou'
  });

  const num=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:0;
  };
  const text=value=>String(value??'').trim();
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function countryCode(value){
    const raw=text(value).toLowerCase().replaceAll('.','');
    if(COUNTRY_NAMES[raw])return raw;
    return COUNTRY_ALIASES[raw]||'';
  }

  function countryName(value){
    const code=countryCode(value);
    return code?COUNTRY_NAMES[code]:text(value);
  }

  function restockKey(country,itemId){
    const code=countryCode(country);
    const id=text(itemId);
    return code&&/^\d+$/.test(id)?code+'|'+id:'';
  }

  function percentile(values,p){
    const rows=(values||[]).map(num).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    if(rows.length===1)return rows[0];
    const pos=(rows.length-1)*Math.max(0,Math.min(1,num(p)));
    const lo=Math.floor(pos),hi=Math.ceil(pos),frac=pos-lo;
    return rows[lo]+(rows[hi]-rows[lo])*frac;
  }

  function normalizeTravelTable(data,fetchedAt=Date.now()){
    const stocks=data?.stocks&&typeof data.stocks==='object'?data.stocks:{};
    const rows=[];
    for(const [rawCode,pack] of Object.entries(stocks)){
      const code=countryCode(rawCode);
      if(!code)continue;
      const sourceAt=Math.max(0,num(pack?.update))*1000;
      const list=Array.isArray(pack?.stocks)?pack.stocks:[];
      for(const row of list){
        const id=text(row?.id);
        const name=text(row?.name);
        if(!/^\d+$/.test(id)||!name)continue;
        rows.push({
          country:COUNTRY_NAMES[code],
          countryCode:code,
          itemId:id,
          itemName:name,
          stock:Math.max(0,Math.round(num(row?.quantity))),
          shopCost:Math.max(0,num(row?.cost)),
          profit:0,
          sourceProfitPerHour:0,
          homeMarket:0,
          source:'Torn Intel Travel Table',
          sourceUpdatedAt:sourceAt?new Date(sourceAt).toISOString():'',
          observedAt:sourceAt||Number(fetchedAt)||Date.now(),
          fetchedAt:Number(fetchedAt)||Date.now()
        });
      }
    }
    return rows;
  }

  function liveExitEvidence(state,itemId,now=Date.now()){
    const id=text(itemId);
    const rules=state?.businessRules||{};
    const maxAgeMs=Math.max(30,num(rules.maxListingAgeSec)||180)*1000;
    const snap=state?.procurement?.marketSnapshots?.[id]||{};
    const snapAt=Date.parse(String(snap?.fetchedAt||''))||0;
    const snapFresh=Boolean(snapAt&&now-snapAt<=maxAgeMs);
    const itemMarketAsk=snapFresh?Math.max(0,num(snap?.itemMarket?.lowest)):0;
    const itemMarketNet=itemMarketAsk>0?Math.floor(itemMarketAsk*.95):0;

    const intel=state?.marketIntel?.marketplace?.[id]||{};
    const intelAt=Date.parse(String(state?.marketIntel?.marketplaceGeneratedAt||''))||0;
    const intelFresh=Boolean(intelAt&&now-intelAt<=Math.max(maxAgeMs,300_000));
    const hasBazaar=Number(intel?.totalBazaars||0)>0&&Number(intel?.lowestPrice||0)>0;
    const bazaarAverage=intelFresh&&hasBazaar?Math.max(0,num(intel?.bazaarAverage)):0;

    const choices=[
      {route:'Item Market Net',value:itemMarketNet,at:snapAt},
      {route:'Bazaar aggregate',value:bazaarAverage,at:intelAt}
    ].filter(row=>row.value>0).sort((a,b)=>b.value-a.value);
    return choices[0]||{route:'Unknown',value:0,at:0};
  }

  function enrichTravelRows(rows,state,now=Date.now()){
    const previous=Array.isArray(state?.travelIntel?.rows)?state.travelIntel.rows:[];
    const oldByKey=new Map();
    for(const row of previous){
      const key=restockKey(row?.countryCode||row?.country,row?.itemId);
      if(key)oldByKey.set(key,row);
    }

    return (rows||[]).map(row=>{
      const key=restockKey(row?.countryCode||row?.country,row?.itemId);
      const old=oldByKey.get(key)||{};
      const exit=liveExitEvidence(state,row?.itemId,now);
      const liveProfit=Number(exit.value||0)>0&&Number(row?.shopCost||0)>0
        ?Math.max(0,Number(exit.value)-Number(row.shopCost))
        :0;
      const preservedProfit=Math.max(0,num(old?.profit));
      const preservedPerHour=Math.max(0,num(old?.sourceProfitPerHour));
      const profit=liveProfit>0?liveProfit:preservedProfit;
      return {
        ...old,
        ...row,
        profit,
        sourceProfitPerHour:preservedPerHour,
        homeMarket:Math.max(0,Number(exit.value||0)||num(old?.homeMarket)),
        resaleSource:exit.value>0?String(exit.route||''):String(old?.resaleSource||''),
        profitSource:exit.value>0?'MM live market evidence':(preservedProfit>0?'previous travel feed':''),
        source:'Torn Intel Travel Table'
      };
    });
  }

  function normalizeHistory(raw){
    const points=Array.isArray(raw?.points)?raw.points:(Array.isArray(raw)?raw:[]);
    const normalized=points.map(row=>({
      t:Date.parse(String(row?.t??row?.timestamp??'')),
      quantity:Math.max(0,num(row?.quantity)),
      cost:Math.max(0,num(row?.cost)),
      marketValue:Math.max(0,num(row?.marketValue??row?.market_value))
    })).filter(row=>Number.isFinite(row.t)&&row.t>0).sort((a,b)=>a.t-b.t);
    const dedup=[];
    for(const row of normalized){
      if(dedup.length&&dedup[dedup.length-1].t===row.t)dedup[dedup.length-1]=row;
      else dedup.push(row);
    }
    return dedup;
  }

  function deriveRestockModel(rawPoints,now=Date.now(),options={}){
    const maxGap=Math.max(60_000,num(options.maxTransitionGapMs)||MAX_TRANSITION_GAP_MS);
    const minCycles=Math.max(1,Math.round(num(options.minEtaCycles)||MIN_ETA_CYCLES));
    const points=normalizeHistory(Array.isArray(rawPoints)?{points:rawPoints}:rawPoints);
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
          const ambiguous=zeroStartGap>maxGap||restockGap>maxGap;
          if(delay>0)cycles.push({
            emptyObservedAt:zeroStart,
            restockedAt:row.t,
            delayMs:delay,
            ambiguous,
            emptyTransitionGapMs:zeroStartGap,
            restockTransitionGapMs:restockGap
          });
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

    const usableCycles=cycles.filter(c=>!c.ambiguous);
    const delays=usableCycles.map(c=>c.delayMs);
    const medianDelayMs=percentile(delays,.5);
    const p25DelayMs=percentile(delays,.25);
    const p75DelayMs=percentile(delays,.75);
    const iqrMs=p75DelayMs-p25DelayMs;
    let confidence='INSUFFICIENT';
    if(delays.length>=minCycles){
      const ratio=Number.isFinite(medianDelayMs)&&medianDelayMs>0?iqrMs/medianDelayMs:Infinity;
      if(delays.length>=6&&ratio<=.20)confidence='HIGH';
      else if(ratio<=.40)confidence='MEDIUM';
      else confidence='LOW';
    }else if(delays.length>0)confidence='LOW';

    const latest=points.length?points[points.length-1]:null;
    const currentEmpty=Boolean(latest&&latest.quantity===0);
    const currentEmptyObservedAt=currentEmpty?zeroStart:null;
    let eta=null;
    if(currentEmpty&&currentEmptyObservedAt&&delays.length>=minCycles&&Number.isFinite(medianDelayMs)){
      eta={
        centerAt:currentEmptyObservedAt+medianDelayMs,
        earlyAt:currentEmptyObservedAt+p25DelayMs,
        lateAt:currentEmptyObservedAt+p75DelayMs,
        remainingMs:currentEmptyObservedAt+medianDelayMs-now,
        overdueByP75Ms:now-(currentEmptyObservedAt+p75DelayMs)
      };
    }

    return {
      pointCount:points.length,
      cycles,
      usableCycles,
      rejectedCycles:cycles.length-usableCycles.length,
      medianDelayMs,
      p25DelayMs,
      p75DelayMs,
      iqrMs,
      confidence,
      latest,
      currentEmpty,
      currentEmptyObservedAt,
      eta
    };
  }

  function modelRecord({country,itemId,itemName='',model,fetchedAt=Date.now(),source='Torn Intel History'}={}){
    const key=restockKey(country,itemId);
    if(!key||!model)return null;
    const cycles=(model.usableCycles||[]).slice(-MAX_STORED_CYCLES).map(row=>({
      emptyObservedAt:Number(row.emptyObservedAt||0),
      restockedAt:Number(row.restockedAt||0),
      delayMs:Number(row.delayMs||0)
    }));
    return {
      key,
      countryCode:countryCode(country),
      country:countryName(country),
      itemId:text(itemId),
      itemName:text(itemName),
      source,
      fetchedAt:new Date(Number(fetchedAt)||Date.now()).toISOString(),
      sourceNewestAt:model.latest?.t?new Date(Number(model.latest.t)).toISOString():'',
      pointCount:Number(model.pointCount||0),
      usableCycles:Number(model.usableCycles?.length||0),
      rejectedCycles:Number(model.rejectedCycles||0),
      medianDelayMs:Number.isFinite(model.medianDelayMs)?Number(model.medianDelayMs):0,
      p25DelayMs:Number.isFinite(model.p25DelayMs)?Number(model.p25DelayMs):0,
      p75DelayMs:Number.isFinite(model.p75DelayMs)?Number(model.p75DelayMs):0,
      confidence:String(model.confidence||'INSUFFICIENT'),
      currentEmpty:Boolean(model.currentEmpty),
      currentEmptyObservedAt:model.currentEmptyObservedAt?new Date(Number(model.currentEmptyObservedAt)).toISOString():'',
      etaAt:model.eta?.centerAt?new Date(Number(model.eta.centerAt)).toISOString():'',
      etaEarlyAt:model.eta?.earlyAt?new Date(Number(model.eta.earlyAt)).toISOString():'',
      etaLateAt:model.eta?.lateAt?new Date(Number(model.eta.lateAt)).toISOString():'',
      cycles
    };
  }

  function pruneRestockRecords(records,now=Date.now()){
    const source=records&&typeof records==='object'?records:{};
    const cutoff=now-RESTOCK_RETENTION_MS;
    const rows=Object.entries(source)
      .filter(([,row])=>(Date.parse(String(row?.fetchedAt||''))||0)>=cutoff)
      .sort((a,b)=>(Date.parse(String(b[1]?.fetchedAt||''))||0)-(Date.parse(String(a[1]?.fetchedAt||''))||0))
      .slice(0,MAX_STORED_KEYS);
    return Object.fromEntries(rows.map(([key,row])=>[key,clone(row)]));
  }

  const api=Object.freeze({
    TRAVEL_TABLE_URL,HISTORY_URL,KEYED_COOLDOWN_MS,MAX_TRANSITION_GAP_MS,MIN_ETA_CYCLES,
    MAX_STORED_CYCLES,MAX_STORED_KEYS,RESTOCK_RETENTION_MS,COUNTRY_NAMES,
    countryCode,countryName,restockKey,percentile,
    normalizeTravelTable,liveExitEvidence,enrichTravelRows,
    normalizeHistory,deriveRestockModel,modelRecord,pruneRestockRecords
  });

  Object.defineProperty(globalThis,'MMTornRestockIntel',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();
