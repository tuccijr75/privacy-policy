(() => {
  'use strict';

  const ITEM_MARKET_FEE_RATE = 0.05;
  const marketPulse = globalThis.MMTornMarketPulse;

  const asId = value => String(value ?? '').trim();
  const TRAVEL_DURATION_RETENTION_MS = 45 * 86400000;
  const TRAVEL_DURATION_SAMPLES_MAX = 5;
  const TRAVEL_DURATION_KEYS_MAX = 36;

  function travelDurationKey(destination,method='Unknown'){
    return String(destination||'').trim().toLowerCase()+'|'+String(method||'Unknown').trim().toLowerCase();
  }

  function medianNumber(values=[]){
    const rows=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return 0;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }

  function travelDurationObservation(payload,observedAt=Date.now()){
    const travel=payload?.travel??payload?.data?.travel??null;
    if(!travel||typeof travel!=='object')return null;
    const destination=String(travel.destination||'').trim();
    const method=String(travel.method||'').trim()||'Unknown';
    const departedAt=Math.max(0,Math.round(Number(travel.departed_at||0)));
    const arrivalAt=Math.max(0,Math.round(Number(travel.arrival_at||0)));
    const durationSec=arrivalAt-departedAt;
    if(!destination||destination.toLowerCase()==='torn'||!(departedAt>0)||!(arrivalAt>departedAt)||durationSec<60||durationSec>24*3600)return null;
    return {
      schema:1,key:travelDurationKey(destination,method),destination,method,
      departedAt,arrivalAt,durationSec,observedAt:Math.max(0,Number(observedAt)||Date.now()),
      source:'Torn API v2 /user/travel'
    };
  }

  function recordTravelDuration(travelIntel,observation,nowMs=Date.now()){
    const travel=travelIntel&&typeof travelIntel==='object'?travelIntel:{};
    const before=JSON.stringify(travel.travelDurations||{});
    const obs=observation&&typeof observation==='object'?observation:null;
    if(!obs?.key||!(Number(obs.durationSec)>0))return {changed:false,key:'',record:null};
    const records=travel.travelDurations&&typeof travel.travelDurations==='object'&&!Array.isArray(travel.travelDurations)?travel.travelDurations:{};
    const cutoff=Number(nowMs)-TRAVEL_DURATION_RETENTION_MS;
    const current=records[obs.key]&&typeof records[obs.key]==='object'?records[obs.key]:{
      schema:1,key:obs.key,destination:String(obs.destination||''),method:String(obs.method||'Unknown'),
      source:'Torn API v2 /user/travel',samples:[]
    };
    current.samples=(Array.isArray(current.samples)?current.samples:[])
      .filter(row=>Number(row?.observedAt||0)>=cutoff);
    const duplicate=current.samples.some(row=>Number(row?.departedAt||0)===Number(obs.departedAt)&&Number(row?.arrivalAt||0)===Number(obs.arrivalAt));
    if(!duplicate){
      current.samples.push({
        departedAt:Number(obs.departedAt),arrivalAt:Number(obs.arrivalAt),
        durationSec:Number(obs.durationSec),observedAt:Number(obs.observedAt)
      });
    }
    current.samples=current.samples.sort((a,b)=>Number(a.observedAt||0)-Number(b.observedAt||0)).slice(-TRAVEL_DURATION_SAMPLES_MAX);
    current.updatedAt=current.samples.reduce((max,row)=>Math.max(max,Number(row.observedAt||0)),0);
    current.medianDurationSec=medianNumber(current.samples.map(row=>row.durationSec));
    current.sampleCount=current.samples.length;
    records[obs.key]=current;

    for(const [key,row] of Object.entries(records)){
      const samples=(Array.isArray(row?.samples)?row.samples:[]).filter(sample=>Number(sample?.observedAt||0)>=cutoff);
      if(!samples.length){delete records[key];continue;}
      row.samples=samples.slice(-TRAVEL_DURATION_SAMPLES_MAX);
      row.updatedAt=row.samples.reduce((max,sample)=>Math.max(max,Number(sample.observedAt||0)),0);
      row.medianDurationSec=medianNumber(row.samples.map(sample=>sample.durationSec));
      row.sampleCount=row.samples.length;
    }
    const keys=Object.keys(records).sort((a,b)=>Number(records[b]?.updatedAt||0)-Number(records[a]?.updatedAt||0));
    for(const key of keys.slice(TRAVEL_DURATION_KEYS_MAX))delete records[key];
    travel.travelDurations=records;
    const after=JSON.stringify(records);
    return {changed:before!==after,key:obs.key,record:records[obs.key]||null};
  }

  function travelDurationEstimate(travelIntel,destination,nowMs=Date.now()){
    const target=String(destination||'').trim().toLowerCase();
    if(!target)return {available:false,usable:false,reason:'destination_unknown'};
    const records=Object.values(travelIntel?.travelDurations||{})
      .filter(row=>String(row?.destination||'').trim().toLowerCase()===target&&Number(row?.medianDurationSec||0)>0)
      .sort((a,b)=>Number(b?.updatedAt||0)-Number(a?.updatedAt||0));
    const record=records[0];
    if(!record)return {available:false,usable:false,reason:'no_observed_duration'};
    const ageMs=Math.max(0,Number(nowMs)-Number(record.updatedAt||0));
    const stale=ageMs>TRAVEL_DURATION_RETENTION_MS;
    const sampleCount=Math.max(0,Number(record.sampleCount||record.samples?.length||0));
    return {
      available:true,usable:!stale,stale,reason:stale?'duration_stale':'ok',
      destination:String(record.destination||destination),method:String(record.method||'Unknown'),
      durationSec:Number(record.medianDurationSec||0),sampleCount,updatedAt:Number(record.updatedAt||0),ageMs,
      confidence:sampleCount>=3?'HIGH':sampleCount>=2?'MEDIUM':'OBSERVED',
      source:String(record.source||'Torn API v2 /user/travel')
    };
  }

  function departureTiming(restockRecord,durationEstimate,nowMs=Date.now()){
    const confidence=String(restockRecord?.confidence||'INSUFFICIENT').toUpperCase();
    const centerAt=Date.parse(String(restockRecord?.etaAt||''))||0;
    const earlyAt=Date.parse(String(restockRecord?.etaEarlyAt||''))||0;
    const lateAt=Date.parse(String(restockRecord?.etaLateAt||''))||0;
    const durationSec=Math.max(0,Number(durationEstimate?.durationSec||0));
    const base={
      status:'ETA UNRELIABLE',usable:false,departureAt:0,departureEarlyAt:0,departureLateAt:0,
      durationSec,durationMethod:String(durationEstimate?.method||''),durationSamples:Number(durationEstimate?.sampleCount||0),
      restockConfidence:confidence,reason:''
    };
    if(!centerAt||!earlyAt||!lateAt||confidence==='INSUFFICIENT'){
      return {...base,reason:'Restock ETA does not have a usable observed window.'};
    }
    if(!durationEstimate?.usable||!(durationSec>0)){
      return {...base,reason:'No recent observed travel duration is available for this destination.'};
    }
    const durationMs=durationSec*1000;
    const departureAt=centerAt-durationMs;
    const departureEarlyAt=earlyAt-durationMs;
    const departureLateAt=lateAt-durationMs;
    const weak=confidence==='LOW'||String(durationEstimate?.confidence||'OBSERVED')==='OBSERVED';
    let status='POSSIBLE DEPARTURE WINDOW';
    if(Number(nowMs)>departureLateAt)status='LIKELY TOO LATE';
    else if(weak)status='WATCH';
    else if(Number(nowMs)<departureEarlyAt)status='TOO EARLY';
    return {
      ...base,status,usable:true,departureAt,departureEarlyAt,departureLateAt,
      restockEarlyAt:earlyAt,restockCenterAt:centerAt,restockLateAt:lateAt,
      reason:weak?'Timing exists but evidence is still low-confidence.':'Timing is derived from the observed restock window minus your observed travel duration.'
    };
  }

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
      const marketReference = Number(base.marketPrice || 0);

      if (!(discoveryBuy > 1) || discoveryBuy < rules.minPrice || discoveryBuy > rules.maxPrice) continue;
      const sellerCount = Number(base.totalBazaars || 0);
      const liveListingCount = itemMarketFresh ? Number(snap?.itemMarket?.listings || 0) : sellerCount;
      if (liveListingCount < rules.minSellerCount) continue;

      const detail = intel?.details?.[id];
      const trader = intel?.traders?.[id];
      const organicTrader = trader?.organicTraders?.[0];
      const freshListings = freshOrganicListings(db, detail?.organicListings || [], nowMs);
      const bazaarListing = freshListings[0] || null;

      const bazaarExit = !globalFresh.stale&&sellerCount>0&&aggregateBuy>0&&bazaarAverage
        ?Math.floor(bazaarAverage * (1 - Number(settings.bazaarExitHaircutPct || 0) / 100))
        :0;
      const itemMarketNet = itemMarketFresh&&itemMarketBuy>0
        ?Math.floor(itemMarketBuy * (1 - ITEM_MARKET_FEE_RATE))
        :0;
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
        buyPrice,maxBuyPrice,bazaarAverage,marketPrice:marketReference,marketReference,sellerCount,liveListingCount,traderExit,
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
      const marketReference=Math.max(0,Number(base?.marketPrice||catalog?.marketPrice||0));
      const sellerCount=Math.max(0,Number(base?.totalBazaars||0));
      const snap=db?.procurement?.marketSnapshots?.[id]||{};
      const snapAge=ageSeconds(snap?.fetchedAt,nowMs);
      const itemMarketFresh=Boolean(snap?.fetchedAt)&&snapAge<=rules.maxListingAgeSec;
      const itemMarketAsk=itemMarketFresh?Math.max(0,Number(snap?.itemMarket?.lowest||0)):0;
      const bazaarExit=!freshness.stale&&sellerCount>0&&Number(base?.lowestPrice||0)>0&&bazaarAverage>0
        ?Math.floor(bazaarAverage*(1-Number(settings.bazaarExitHaircutPct||0)/100))
        :0;
      const itemMarketNet=itemMarketAsk>0?Math.floor(itemMarketAsk*(1-ITEM_MARKET_FEE_RATE)):0;
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
        targetBuy,buyPrice,bazaarAverage,marketPrice:marketReference,sellerCount,
        marketReference,
        itemMarketLivePrice:itemMarketAsk,
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

  function rankTravelDestinations(db,nowMs=Date.now()) {
    const demand=db?.operations?.inventoryRoi?.restockDemand||{};
    const byCountry=new Map();
    for(const row of rankCachedTravel(db,nowMs)){
      const country=String(row?.country||row?.countryCode||'Unknown').trim()||'Unknown';
      let group=byCountry.get(country);
      if(!group){
        group={
          country,itemCount:0,profitableItemCount:0,totalObservedStock:0,
          totalAvailableProfit:0,totalAcquisitionCost:0,
          bestLiquidityAdjustedProfitPerHour:0,bestSourceProfitPerHour:0,
          bestRoiPct:0,bestItem:null,pulseFreshItems:0,pulseConfidenceMax:0,
          restockMatchCount:0,restockDemandUnits:0,items:[]
        };
        byCountry.set(country,group);
      }
      const stock=Math.max(0,Number(row?.stock||0));
      const profit=Math.max(0,Number(row?.profit||0));
      const shopCost=Math.max(0,Number(row?.shopCost||0));
      const roiPct=shopCost>0&&profit>0?profit/shopCost*100:0;
      const adjustedPerHour=Math.max(0,Number(row?.liquidityAdjustedProfitPerHour||0));
      const sourcePerHour=Math.max(0,Number(row?.sourceProfitPerHour||0));
      const itemId=asId(row?.itemId);
      const restock=demand?.[itemId];
      const restockUnits=restock&&String(restock?.status||'OPEN')==='OPEN'?Math.max(0,Number(restock?.deficit||0)):0;
      group.itemCount++;
      if(profit>0)group.profitableItemCount++;
      group.totalObservedStock+=stock;
      group.totalAvailableProfit+=profit*stock;
      group.totalAcquisitionCost+=shopCost*stock;
      group.bestLiquidityAdjustedProfitPerHour=Math.max(group.bestLiquidityAdjustedProfitPerHour,adjustedPerHour);
      group.bestSourceProfitPerHour=Math.max(group.bestSourceProfitPerHour,sourcePerHour);
      group.bestRoiPct=Math.max(group.bestRoiPct,roiPct);
      if(row?.pulseFreshness&&!row.pulseFreshness.stale)group.pulseFreshItems++;
      group.pulseConfidenceMax=Math.max(group.pulseConfidenceMax,Math.max(0,Number(row?.pulseConfidencePct||0)));
      if(restockUnits>0){group.restockMatchCount++;group.restockDemandUnits+=restockUnits;}
      group.items.push({...row,roiPct,restockDemandUnits:restockUnits});
      if(!group.bestItem||
        adjustedPerHour>Number(group.bestItem?.liquidityAdjustedProfitPerHour||0)||
        (adjustedPerHour===Number(group.bestItem?.liquidityAdjustedProfitPerHour||0)&&profit>Number(group.bestItem?.profit||0))){
        group.bestItem={...row,roiPct,restockDemandUnits:restockUnits};
      }
    }
    return [...byCountry.values()]
      .map(group=>({
        ...group,
        pulseCoveragePct:group.itemCount?group.pulseFreshItems/group.itemCount*100:0
      }))
      .sort((a,b)=>
        Number(b.bestLiquidityAdjustedProfitPerHour||0)-Number(a.bestLiquidityAdjustedProfitPerHour||0)||
        Number(b.totalAvailableProfit||0)-Number(a.totalAvailableProfit||0)||
        Number(b.profitableItemCount||0)-Number(a.profitableItemCount||0)||
        String(a.country).localeCompare(String(b.country))
      );
  }

  const api = Object.freeze({
    businessRules,
    freshnessInfo,
    salesItemMetrics,
    pulseSignals,pulseFields,
    rankCachedOpportunities,
    rankPricelistUniverse,
    rankCachedTravel,
    rankTravelDestinations,
    travelDurationObservation,recordTravelDuration,travelDurationEstimate,departureTiming
  });

  Object.defineProperty(globalThis,'MMTornAcquisitionsLogic',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();
