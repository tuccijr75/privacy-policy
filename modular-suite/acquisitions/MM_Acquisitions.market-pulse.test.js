const fs=require('fs');const vm=require('vm');const assert=require('assert');

const sandbox={globalThis:{},Date,Math,Map,Set,JSON,Object,Array,String,Number,Boolean,RegExp};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.market-pulse.js','utf8'),sandbox,{filename:'MM_Acquisitions.market-pulse.js'});
const pulse=sandbox.globalThis.MMTornMarketPulse;
assert(pulse,'Market Pulse module must export');

const now=Date.now();
const api=(timestamp,quantity,price=1_000_000,cacheDelay=60)=>({
  itemmarket:{cache_timestamp:timestamp,cache_delay:cacheDelay,listings:[{price,amount:quantity}]}
});
const snapshot=(id,timestamp,quantity,price=1_000_000,fetchedAt=now)=>pulse.normalizeTornItemMarket(
  String(id),'Item '+id,api(timestamp,quantity,price),{fetchedAt}
);

{
  const a=snapshot(1,Math.floor((now-60_000)/1000),20);
  const b=snapshot(1,Math.floor(now/1000),15);
  const result=pulse.diffSnapshots(a,b);
  assert.strictEqual(result.rejected,false);
  assert.strictEqual(result.event.units,5);
  assert.strictEqual(result.event.turnover,5_000_000);
  assert.strictEqual(result.event.kind,'observed_outflow');
}

{
  const a=snapshot(1,Math.floor(now/1000),20);
  const b=snapshot(1,Math.floor((now-60_000)/1000),15);
  const result=pulse.diffSnapshots(a,b);
  assert.strictEqual(result.rejected,true,'source time regression must fail closed');
  assert.strictEqual(result.reason,'source_time_regression');
}

{
  const a=snapshot(1,Math.floor((now-60_000)/1000),20,1_000_000);
  const b=snapshot(1,Math.floor(now/1000),15,2_000_000);
  const result=pulse.diffSnapshots(a,b);
  assert.strictEqual(result.rejected,true,'large price-regime shift must fail closed');
  assert.strictEqual(result.reason,'price_regime_shift');
}

{
  const a=snapshot(1,Math.floor((now-60_000)/1000),20);
  const b=snapshot(1,Math.floor(now/1000),25);
  const result=pulse.diffSnapshots(a,b);
  assert.strictEqual(result.event,null,'quantity growth is not a movement event');
  assert.strictEqual(result.rejected,false);
  assert.strictEqual(result.reason,'inventory_increase_not_movement');
}

{
  const proven={
    itemId:'1',itemName:'Proven',
    lastSnapshot:{fetchedAt:now,sourceTimestamp:now,floorPrice:1_000_000,marketDepth:4,totalQty:20,marketExposure:8_000_000},
    snapshotHistory:[{fetchedAt:now-120_000,floorPrice:1_000_000}],
    movementHistory:[
      {at:now-120_000,units:6,turnover:6_000_000,confidencePct:82},
      {at:now-90_000,units:6,turnover:6_000_000,confidencePct:82},
      {at:now-60_000,units:6,turnover:6_000_000,confidencePct:82}
    ]
  };
  const candidate={
    itemId:'2',itemName:'Candidate',
    lastSnapshot:{fetchedAt:now,sourceTimestamp:now,floorPrice:1_000_000,marketDepth:4,totalQty:20,marketExposure:30_000_000},
    snapshotHistory:[{fetchedAt:now-120_000,floorPrice:1_000_000}],
    movementHistory:[]
  };
  const rows=pulse.rankPulseItems({marketIntel:{marketPulse:{items:{'1':proven,'2':candidate}}}},now);
  assert.strictEqual(rows[0].itemId,'1','proven movers must remain above candidates');
  assert.strictEqual(rows[0].tier,'proven');
  assert.strictEqual(rows[1].tier,'candidate');
}

{
  const draft={marketIntel:{marketPulse:{settings:{historyMax:12,cacheMax:12,ttlMs:45*60_000}}}};
  for(let i=0;i<30;i++){
    pulse.applySnapshotToDraft(draft,snapshot(3,Math.floor((now-30*60_000+i*60_000)/1000),100,1_000_000,now-30*60_000+i*60_000));
  }
  assert(draft.marketIntel.marketPulse.items['3'].snapshotHistory.length<=12,'snapshot history must be bounded');
  for(let i=0;i<20;i++){
    const id=String(100+i);
    pulse.applySnapshotToDraft(draft,snapshot(id,Math.floor((now+i*1000)/1000),10,1_000_000,now+i*1000));
  }
  assert(Object.keys(draft.marketIntel.marketPulse.items).length<=12,'rolling item cache must be bounded');
  assert(draft.marketIntel.marketPulse.rejections.length<=pulse.REJECTION_MAX,'rejections must be bounded');
}

{
  const cadence=pulse.effectiveRefreshMs({settings:{requestBudgetPerMinute:10,baseRefreshMs:45_000}},72,0);
  assert(cadence>45_000,'API budget must stretch refresh cadence');
  assert(pulse.effectiveRefreshMs({settings:{requestBudgetPerMinute:90,baseRefreshMs:45_000}},1,120_000)>=120_000,'upstream cache delay must stretch cadence');
}

{
  assert.strictEqual(pulse.canAcquireLease({owner:'other',expiresAt:now+60_000},'me',now),false,'active foreign lease must prevent duplicate tab polling');
  assert.strictEqual(pulse.canAcquireLease({owner:'other',expiresAt:now-1},'me',now),true,'expired lease may be acquired');
  assert.strictEqual(pulse.canAcquireLease({owner:'me',expiresAt:now+60_000},'me',now),true,'current owner may renew');
}

{
  const recent=snapshot(7,Math.floor(now/1000),10,1_000_000,now-1000);
  const state={procurement:{marketSnapshots:{'7':{fetchedAt:new Date(now-1000).toISOString(),pulseSnapshot:recent}}}};
  assert(pulse.recentReusableSnapshot(state,'7',now,2500),'just-verified snapshot must be reused within 2.5s');
  assert.strictEqual(pulse.recentReusableSnapshot(state,'7',now+3000,2500),null,'reuse must expire outside 2.5s');
}

{
  const source=fs.readFileSync(__dirname+'/MM_Acquisitions.market-pulse.js','utf8');
  const forbidden=[
    /\bsellerId\b/i,/\bsellerName\b/i,/\blast_action\b/i,/\battackability\b/i,
    /\bmugReturn\b/i,/\bwinProbability\b/i,/\bverifiedTargets\b/i,/\battackUrl\b/i
  ];
  for(const token of forbidden)assert(!token.test(source),'Market Pulse must remain seller/attack-target free: '+token);
}

{
  const state={marketIntel:{marketPulse:{items:{},scheduler:{requestLog:[]},rejections:[]}}};
  const diagnostics=pulse.sanitizedDiagnostics(state,{owner:'tab-a',expiresAt:now+10_000},now);
  const json=JSON.stringify(diagnostics);
  assert(!/api.?key/i.test(json),'diagnostics must not expose API keys');
  assert(!/seller|attack|mug/i.test(json),'diagnostics must remain seller/attack-target free');
}


vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.logic.js'});
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.ranked.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.ranked.logic.js'});
const logic=sandbox.globalThis.MMTornAcquisitionsLogic;
const rankedLogic=sandbox.globalThis.MMTornRankedProfitLogic;
assert(logic&&rankedLogic,'Acquisitions logic modules must load after Market Pulse');

{
  const nowIso=new Date(now).toISOString();
  const db={
    businessRules:{minRoiPct:0,minDemandPerDay:0,minPrice:1,maxPrice:10000,minAbsoluteProfit:1,minSellerCount:1,minConfidencePct:0,maxListingAgeSec:300},
    marketIntel:{marketplaceGeneratedAt:nowIso,settings:{bazaarExitHaircutPct:0},marketplace:{
      '1':{itemId:'1',itemName:'High Margin Slow',marketPrice:1264,bazaarAverage:0,lowestPrice:1000,totalBazaars:3},
      '2':{itemId:'2',itemName:'Lower Margin Fast',marketPrice:1179,bazaarAverage:0,lowestPrice:1000,totalBazaars:3}
    },details:{},traders:{},history:{},marketPulse:{items:{}}},
    procurement:{catalog:{'1':{name:'High Margin Slow'},'2':{name:'Lower Margin Fast'}},marketSnapshots:{
      '1':{fetchedAt:nowIso,itemMarket:{lowest:1000,median:1264,third:1264,listings:3,totalQty:3,depth1Pct:1},bazaar:{}},
      '2':{fetchedAt:nowIso,itemMarket:{lowest:1000,median:1179,third:1179,listings:40,totalQty:100000,depth1Pct:5000},bazaar:{}}
    }},
    sales:{}
  };
  db.marketIntel.marketPulse.items['2']={
    itemId:'2',itemName:'Lower Margin Fast',fetchedAt:now,sourceTimestamp:now,upstreamCacheDelayMs:60000,
    lastSnapshot:{fetchedAt:now,sourceTimestamp:now,floorPrice:1000,marketDepth:100,totalQty:100000,marketExposure:100000000,upstreamCacheDelayMs:60000},
    snapshotHistory:[{fetchedAt:now-180000,floorPrice:1000}],
    movementHistory:Array.from({length:10},(_,i)=>({at:now-(10-i)*15000,units:5000,turnover:5_000_000,confidencePct:82}))
  };
  const rows=logic.rankCachedOpportunities(db,now);
  const slow=rows.find(row=>row.id==='1');
  const fast=rows.find(row=>row.id==='2');
  assert(slow&&fast);
  assert(slow.roiPct>fast.roiPct,'fixture must keep the slow item theoretical ROI higher');
  assert.strictEqual(rows[0].id,'2','fresh proven liquidity/profit velocity must be able to outrank a somewhat higher theoretical ROI');
  assert(fast.marketPulseScore>0&&fast.profitVelocityPerHour>0,'ranking must expose Market Pulse score components');
  assert.strictEqual(fast.pulseTier,'proven');
}

{
  const listing={itemId:'2',itemName:'Lower Margin Fast',price:1000,source:'Item Market',rarity:'yellow',bonuses:[]};
  const history=[
    {itemId:'2',price:1500,timestamp:Math.floor((now-86400000)/1000),rarity:'yellow',bonuses:[]},
    {itemId:'2',price:1550,timestamp:Math.floor((now-2*86400000)/1000),rarity:'yellow',bonuses:[]},
    {itemId:'2',price:1525,timestamp:Math.floor((now-3*86400000)/1000),rarity:'yellow',bonuses:[]}
  ];
  const noPulse=rankedLogic.evaluateListing(listing,history,{now,minComparableSales:3});
  assert.strictEqual(noPulse.liquidityScore,noPulse.auctionHistoryLiquidityScore,'ranked no-Pulse behavior must preserve AH liquidity');
  const p={
    itemId:'2',tier:'proven',fetchedAt:now,sourceTimestamp:now,upstreamCacheDelayMs:60000,
    liquidityScore:91,confidencePct:88,observedEventsPerHour:3,observedUnitsPerHour:100,
    turnoverPerHour:10000000,marketDepth:100,trendPct:2
  };
  const withPulse=rankedLogic.evaluateListing(listing,history,{now,minComparableSales:3,pulseByItem:{'2':p}});
  assert.strictEqual(withPulse.pulseTier,'proven');
  assert(withPulse.pulseLiquidityScore>0&&withPulse.profitVelocityPerHour>0);
  assert.strictEqual(withPulse.pulseSourceTimestamp,now);
}

console.log('MM_Acquisitions Market Pulse regression tests: PASS');
