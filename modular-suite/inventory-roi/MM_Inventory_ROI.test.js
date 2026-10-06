const fs=require('fs');const vm=require('vm');const assert=require('assert');
const sandbox={globalThis:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Inventory_ROI.logic.js','utf8'),sandbox,{filename:'MM_Inventory_ROI.logic.js'});
const logic=sandbox.globalThis.MMTornInventoryRoiLogic;assert(logic);
const now=Date.now();
const db=logic.ensureInventorySlice({marketIntel:{marketPulse:{settings:{ttlMs:45*60*1000},items:{'26':{itemId:'26',floorPrice:170,marketDepth:12,observedUnitsPerHour:4.5,turnoverPerHour:765,liquidityScore:72,confidencePct:81,trendPct:3,sourceTimestamp:now-120000,fetchedAt:now-60000,lastSnapshot:{source:'Torn API v2 Item Market',floorPrice:170,marketDepth:12,sourceTimestamp:now-120000,fetchedAt:now-60000}}}}},procurement:{acquisitions:[{id:'a1',itemId:'26',itemName:'AK-47',quantity:10,unitCost:100,acquiredAt:new Date(now-5*86400000).toISOString(),source:'Bazaar'}]},operations:{inventoryRoi:{}}});
logic.importSalesEntries(db,[{id:'s1',timestamp:Math.floor((now-2*86400000)/1000),details:{id:1226},data:{buyer:{id:123,name:'Buyer'},item_id:26,item_name:'AK-47',quantity:2,cost_each:150,cost_total:300}}]);
logic.updateShopSnapshot(db,{bazaar:[{id:26,name:'AK-47',quantity:1,price:160}],inventory:[{id:26,name:'AK-47',quantity:5}]});
const row=logic.inventoryRoiRows(db,now).find(r=>r.id==='26');assert(row);
assert.strictEqual(row.ownedQty,6);assert.strictEqual(row.restockStatus,'ON TARGET');assert.strictEqual(row.pricingStatus,'PRICE TOO LOW');assert.strictEqual(row.pricing.recommendedPrice,170);assert.strictEqual(row.pulse.floorPrice,170);assert.strictEqual(row.pulse.sourceTimestamp,now-120000);assert.strictEqual(row.pulse.fetchedAt,now-60000);
const low=logic.pricingRecommendation({bazaarPrice:90,bazaarQty:1,avgCost:50,pulse:logic.marketPulseEvidence(db,'26',now)});assert.strictEqual(low.state,'PRICE TOO LOW');
const high=logic.pricingRecommendation({bazaarPrice:190,bazaarQty:1,avgCost:50,pulse:logic.marketPulseEvidence(db,'26',now)});assert.strictEqual(high.state,'PRICE TOO HIGH');
const undercut=logic.pricingRecommendation({personalQty:5,avgCost:100,pulse:logic.marketPulseEvidence(db,'26',now)});assert.strictEqual(undercut.state,'UNDERCUT OPPORTUNITY');assert.strictEqual(undercut.recommendedPrice,169);
const hold=logic.pricingRecommendation({personalQty:5,avgCost:175,pulse:logic.marketPulseEvidence(db,'26',now)});assert.strictEqual(hold.state,'HOLD');assert.strictEqual(hold.recommendedPrice,0);
const weak=logic.pricingRecommendation({personalQty:5,avgCost:100,pulse:{...logic.marketPulseEvidence(db,'26',now),confidencePct:20}});assert.strictEqual(weak.state,'INSUFFICIENT EVIDENCE');
const stale=logic.marketPulseEvidence(db,'26',now+60*60*1000);assert.strictEqual(stale.stale,true);assert.strictEqual(stale.status,'STALE');
const missing=logic.marketPulseEvidence(db,'999',now);assert.strictEqual(missing.status,'MISSING');
const summary=logic.dashboardSummary(db,now);assert.strictEqual(summary.ownedUnits,6);assert.strictEqual(summary.listedUnits,1);assert.strictEqual(summary.pulseFreshCount,1);
const soldOut=logic.ensureInventorySlice({marketIntel:{marketPulse:{settings:{ttlMs:45*60*1000},items:{'99':{itemId:'99',floorPrice:300,marketDepth:8,observedUnitsPerHour:2,turnoverPerHour:600,liquidityScore:70,confidencePct:75,sourceTimestamp:now-60000,fetchedAt:now-30000,lastSnapshot:{source:'Torn API v2 Item Market',floorPrice:300,marketDepth:8,sourceTimestamp:now-60000,fetchedAt:now-30000}}}}},procurement:{acquisitions:[{id:'a99',itemId:'99',itemName:'Sold Out Item',quantity:5,unitCost:100,acquiredAt:new Date(now-10*86400000).toISOString(),source:'Travel'}]},operations:{inventoryRoi:{}}});
logic.importSalesEntries(soldOut,[{id:'s99',timestamp:Math.floor((now-86400000)/1000),details:{id:1226},data:{buyer:{id:999,name:'Buyer'},item_id:99,item_name:'Sold Out Item',quantity:5,cost_each:250,cost_total:1250}}]);
logic.updateShopSnapshot(soldOut,{bazaar:[],inventory:[],at:new Date(now).toISOString()});
const soldOutRow=logic.inventoryRoiRows(soldOut,now).find(r=>r.id==='99');assert(soldOutRow);assert.strictEqual(soldOutRow.ownedQty,0);assert.strictEqual(soldOutRow.restockStatus,'OUT OF STOCK');
const demands=logic.restockDemandRows(soldOut,now);assert.strictEqual(demands.length,1);assert.strictEqual(demands[0].itemId,'99');assert.strictEqual(demands[0].urgency,'URGENT');assert(demands[0].deficit>0);
const persisted=logic.replaceRestockDemand(soldOut,demands,now);assert.strictEqual(persisted.changed,true);assert.strictEqual(soldOut.operations.inventoryRoi.restockDemand['99'].status,'OPEN');
const persistedAgain=logic.replaceRestockDemand(soldOut,demands,now+1000);assert.strictEqual(persistedAgain.changed,false);
assert.strictEqual(Math.round(row.avgCost),100);assert.strictEqual(Math.round(row.currentRoiPct),60);
assert.strictEqual(Math.round(row.realizedGrossProfit30),100);assert.strictEqual(Math.round(row.realizedRoiPct30),50);assert.strictEqual(Math.round(row.costCoveragePct30),100);

const tradeDb=logic.ensureInventorySlice({
  procurement:{acquisitions:[{id:'ta1',itemId:'26',itemName:'AK-47',quantity:5,unitCost:100,acquiredAt:new Date(now-10*86400000).toISOString(),source:'Bazaar'}]},
  sales:{},
  operations:{tradeManager:{},inventoryRoi:{tradeReconciliation:{
    't1':{tradeId:'t1',completedAt:now-5*86400000,status:'PENDING',evidence:{confidence:'TRUSTED_COMPLETION'},effects:[{direction:'OUT',itemId:'26',quantity:2,basisKnown:true,basisTotal:200,unitCost:100,basisMethod:'FIFO_AT_TRADE_SYNC'}]},
    't2':{tradeId:'t2',completedAt:now-4*86400000,status:'PENDING',evidence:{confidence:'TRUSTED_COMPLETION'},effects:[{direction:'IN',itemId:'26',quantity:3,basisKnown:true,basisTotal:450,unitCost:150,basisMethod:'RESIDUAL_CONSIDERATION_PRO_RATA_REFERENCE'}]}
  },listings:{'26':{id:'26',name:'AK-47',quantity:0,price:200}},inventory:{'26':{id:'26',name:'AK-47',quantity:6}},listingPlans:{}}}
});
let tradeLedger=logic.fifoLedger(tradeDb,'26');
assert.strictEqual(tradeLedger.tradeRows.length,1);
assert.strictEqual(tradeLedger.tradeRows[0].consumedUnits,2);
assert.strictEqual(tradeLedger.remainingQty,6);
assert.strictEqual(tradeLedger.remainingKnownQty,6);
assert.strictEqual(tradeLedger.remainingUnknownQty,0);
assert.strictEqual(tradeLedger.remainingCost,750);
let ack=logic.acknowledgeTradeReconciliations(tradeDb,now);
assert.strictEqual(ack.changed,2);assert.strictEqual(ack.invalid,0);assert.strictEqual(ack.summary.accounted,2);
ack=logic.acknowledgeTradeReconciliations(tradeDb,now+1000);assert.strictEqual(ack.changed,0);

const unknownTradeDb=logic.ensureInventorySlice({
  procurement:{acquisitions:[]},sales:{},
  operations:{inventoryRoi:{tradeReconciliation:{
    'u1':{tradeId:'1001',completedAt:now-1000,status:'PENDING',evidence:{confidence:'TRUSTED_COMPLETION'},effects:[{direction:'IN',itemId:'77',quantity:2,basisKnown:false,basisMethod:'UNKNOWN_INBOUND_COST'}]}
  },listings:{},inventory:{'77':{id:'77',name:'Unknown Basis Item',quantity:2}},listingPlans:{}}}
});
const unknownRows=logic.inventoryRoiRows(unknownTradeDb,now);
const unknownRow=unknownRows.find(r=>r.id==='77');assert(unknownRow);
assert.strictEqual(unknownRow.trackedUnknownCostQty,2);
assert.strictEqual(unknownRow.currentCostCoveragePct,0);
assert.strictEqual(unknownRow.pricingStatus,'COST BASIS INCOMPLETE');
assert.strictEqual(unknownRow.pricing.recommendedPrice,0);

const invalidRecon=logic.ensureInventorySlice({operations:{inventoryRoi:{tradeReconciliation:{bad:{tradeId:'bad',completedAt:now,status:'PENDING',effects:[],evidence:{confidence:'NOPE'}}}}}});
const invalidAck=logic.acknowledgeTradeReconciliations(invalidRecon,now);assert.strictEqual(invalidAck.changed,0);assert.strictEqual(invalidAck.invalid,1);

console.log('MM Inventory ROI logic tests: PASS');
const userSource=fs.readFileSync(__dirname+'/MM_Inventory_Manager_ROI_Tracker.user.js','utf8');
assert(!/async\s+function\s+inventoryHtml\s*\(/.test(userSource),'inventoryHtml must remain synchronous because render concatenates its return value directly into HTML');
assert(/function\s+inventoryHtml\s*\(/.test(userSource),'inventoryHtml declaration missing');
new Function(userSource);
assert(userSource.includes("const VERSION='8.0.0-alpha.12';"));
assert(userSource.includes('Bazaar / Inventory Dashboard'));
assert(userSource.includes('Market Pulse is read-only context from MM_Acquisitions.'));
assert(userSource.includes('Pricing recommendations are explainable decision support only'));
assert(userSource.includes('async function syncRestockDemand'));
assert(userSource.includes('logic.acknowledgeTradeReconciliations'));
assert(userSource.includes('TRADE HANDOFF'));
assert(userSource.includes('CURRENT COST COVERAGE'));
assert(userSource.includes("logic.replaceRestockDemand(draft,rows,Date.now())"));
assert(userSource.includes("tile('RECOMMENDED'"));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@b6d2202ad507c6b138919e2d37e461cfc422b382/modular-suite/core/MM_Torn_Core.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@4ef4197cb0fc19e4c29b5864dd4d003732d58deb/modular-suite/inventory-roi/MM_Inventory_ROI.logic.js'));
assert(!userSource.includes('// @updateURL'));
assert(!userSource.includes('// @downloadURL'));
assert(userSource.includes('core?.ensureSharedState'),'fresh-install Core bootstrap missing');
assert(userSource.includes('async function autoRefreshInventory'));
assert(userSource.includes('SALES_BACKFILL_MS=31*24*60*60*1000'));
assert(userSource.includes('Torn Inventory payload was unavailable or malformed.'));
assert(!userSource.includes('payload.inventory=inventoryResult.value?.inventory??inventoryResult.value?.items??[]'));
console.log('MM Inventory ROI userscript automation/render regression: PASS');
