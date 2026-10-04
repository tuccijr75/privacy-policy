const fs=require('fs');const vm=require('vm');const assert=require('assert');
const sandbox={globalThis:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.ranked.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.ranked.logic.js'});
const logic=sandbox.globalThis.MMTornRankedProfitLogic;assert(logic);

assert.strictEqual(logic.bunkerBuckUnits({subType:'Pistol',rarity:'yellow',bonuses:[{title:'Conserve',value:20}]}),4);
assert.strictEqual(logic.bunkerBuckUnits({subType:'Rifle',rarity:'orange',bonuses:[{title:'Conserve',value:20}]}),30);
assert.strictEqual(logic.bunkerBuckUnits({subType:'Rifle',rarity:'orange',bonuses:[{title:'Conserve',value:20},{title:'Achilles',value:30}]}),45);
assert.strictEqual(logic.bunkerBuckUnits({subType:'Machine Gun',rarity:'red',bonuses:[{title:'Conserve',value:20},{title:'Achilles',value:30}]}),189);
assert.strictEqual(logic.bunkerBuckUnits({subType:'Heavy Artillery',rarity:'yellow',bonuses:[{title:'Conserve',value:20}]}),14);

const now=Date.UTC(2026,9,4,20,0,0);
const sale=(days,price,bonus=25)=>({
 id:'a'+days,timestamp:Math.floor((now-days*86400000)/1000),price,bids:4,
 item:{id:26,name:'AK-47',sub_type:'Rifle',details:{rarity:'yellow',uid:String(1000+days),stats:{damage:50,accuracy:50,quality:100},bonuses:[{title:'Conserve',value:bonus}]}}
});
const history=[sale(2,65000000,24),sale(8,62000000,26),sale(20,64000000,25),sale(40,60000000,24),sale(70,58000000,27),sale(5,900000000,25)];
const candidate={itemId:26,itemName:'AK-47',subType:'Rifle',rarity:'yellow',price:45000000,bonuses:{0:{bonus:'Conserve',value:25}}};

const value=logic.evaluateListing(candidate,history,{now,bbRate:6000000,bonusBand:5,minComparableSales:3});
assert.strictEqual(value.bbUnits,10);
assert.strictEqual(value.bbFloor,60000000);
assert(value.auctionValue>=58000000&&value.auctionValue<100000000,'outlier should not dominate auction median');
assert(value.fairValue>=60000000);
assert(value.profit>0);
assert(value.roiPct>0);
assert(value.volume30>=4);
assert(value.volume90===history.length);
assert(value.history.confidence>0);
assert(value.lowTier===true);

const high={...candidate,bonuses:{0:{bonus:'Deadeye',value:55}},price:50000000};
const highHistory=[
 {...sale(2,100000000,55),item:{...sale(2,100000000,55).item,details:{...sale(2,100000000,55).item.details,bonuses:[{title:'Deadeye',value:55}]}}},
 {...sale(8,110000000,56),item:{...sale(8,110000000,56).item,details:{...sale(8,110000000,56).item.details,bonuses:[{title:'Deadeye',value:56}]}}},
 {...sale(14,105000000,54),item:{...sale(14,105000000,54).item,details:{...sale(14,105000000,54).item.details,bonuses:[{title:'Deadeye',value:54}]}}}
];
const hv=logic.evaluateListing(high,highHistory,{now,bbRate:6000000,bonusBand:5,minComparableSales:3});
assert(hv.auctionValue>hv.bbFloor,'premium auction history should exceed scrap floor');
assert(hv.valuationSource.includes('AH'));
assert(hv.lowTier===false);

const ranked=logic.rankListings([
 candidate,
 {...candidate,uid:'2',price:59000000}
],history,{now,bbRate:6000000,minRoiPct:0,minConfidencePct:0});
assert.strictEqual(ranked.length,2);
assert(ranked[0].roiPct>=ranked[1].roiPct);
console.log('MM_Acquisitions ranked valuation regression: PASS');