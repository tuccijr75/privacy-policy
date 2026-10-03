(() => {
  'use strict';

  const ITEM_MARKET_FEE_RATE = 0.05;

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
      const bazaarAverage = Number(base.bazaarAverage || 0);
      const marketPrice = Number(base.marketPrice || snap?.itemMarket?.median || snap?.itemMarket?.third || 0);

      if (!(discoveryBuy > 1) || discoveryBuy < rules.minPrice || discoveryBuy > rules.maxPrice) continue;
      const sellerCount = Number(base.totalBazaars || 0);
      if (!itemMarketFresh && sellerCount < rules.minSellerCount) continue;

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
      const roiScore = Math.min(100,Math.max(0,roiPct)*4);
      const conversionScore = Math.min(100,sellThrough3dPct);
      const profitVelocityScore = Math.min(100,Math.log10(1+expectedProfitPerDay)*18);
      const absoluteProfitScore = Math.min(100,Math.log10(1+Math.max(0,profit))*14);
      const volatilityPenalty = Math.min(25,Number(history.volatilityPct||0)*0.75);
      const score = Math.max(0,Math.min(100,
        roiScore*0.32+conversionScore*0.32+profitVelocityScore*0.18+absoluteProfitScore*0.10+sourceFreshness*0.08-volatilityPenalty
      ));

      rows.push({
        id,
        name:String(base.itemName || db?.procurement?.catalog?.[id]?.name || ('Item '+id)),
        itemType:String(db?.procurement?.catalog?.[id]?.type || ''),
        buyPrice,maxBuyPrice,bazaarAverage,marketPrice,sellerCount,traderExit,
        bestExit:exit.value,bestExitRoute:exit.route,profit,roiPct,score,confidence,
        freshness:globalFresh,history,enriched:Boolean(detail),
        listingQty:Number(live?.quantity||0),sellerId:String(live?.sellerId||''),
        sellerName:String(live?.sellerName||''),listingVerified:Boolean(live?.source==='Bazaar'&&live?.sellerId),
        purchaseReady:Boolean(live&&priceQualified),purchaseSource:String(live?.source||'Research'),
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

  function rankCachedTravel(db) {
    return (Array.isArray(db?.travelIntel?.rows) ? db.travelIntel.rows : [])
      .filter(r => Number(r?.stock||0) > 0 && (Number(r?.sourceProfitPerHour||0) > 0 || Number(r?.profit||0) > 0))
      .map(r => ({...r}))
      .sort((a,b)=>
        Number(b.sourceProfitPerHour||0)-Number(a.sourceProfitPerHour||0) ||
        Number(b.profit||0)-Number(a.profit||0) ||
        Number(b.stock||0)-Number(a.stock||0)
      );
  }

  const api = Object.freeze({
    businessRules,
    freshnessInfo,
    salesItemMetrics,
    rankCachedOpportunities,
    rankCachedTravel
  });

  Object.defineProperty(globalThis,'MMTornAcquisitionsLogic',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();
