const fs=require('fs');const vm=require('vm');const assert=require('assert');
const sandbox={globalThis:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.logic.js'});
const logic=sandbox.globalThis.MMTornAcquisitionsLogic;assert(logic);

const now=Date.now();
const iso=new Date(now).toISOString();
const item=(id,buy,exit,listings=3)=>({
  itemId:String(id),itemName:'Item '+id,marketPrice:exit,bazaarAverage:exit,
  lowestPrice:buy,totalBazaars:listings
});
const snap=(buy,exit,listings=3)=>({
  fetchedAt:iso,
  itemMarket:{lowest:buy,third:exit,median:exit,totalQty:20,listings,depth1Pct:3,depth3Pct:8,depth5Pct:12},
  bazaar:{lowest:0,third:0,median:0,totalQty:0,listings:0,depth1Pct:0,depth3Pct:0,depth5Pct:0},
  realisticExit:exit,totalDepth3Pct:8
});
function baseDb(){
  return {
    businessRules:{
      minRoiPct:5,minDemandPerDay:0,minPrice:1,maxPrice:5000,
      minAbsoluteProfit:10,minSellerCount:2,minConfidencePct:0,maxListingAgeSec:180
    },
    marketIntel:{
      marketplaceGeneratedAt:iso,settings:{bazaarExitHaircutPct:0},
      marketplace:{'1':item(1,1000,2000,3)},details:{},traders:{},history:{}
    },
    procurement:{catalog:{'1':{name:'Item 1'}},marketSnapshots:{'1':snap(1000,2000,3)}},
    sales:{},travelIntel:{rows:[]}
  };
}

{
  const db=baseDb();
  const rows=logic.rankCachedOpportunities(db,now);
  assert.strictEqual(rows.length,1,'valid rule-qualified deal should rank');
  assert.strictEqual(rows[0].purchaseReady,true);
  assert.strictEqual(rows[0].liveListingCount,3);
  assert.strictEqual(rows[0].purchaseSource,'Item Market');
  assert(rows[0].confidence>0);
}

{
  const db=baseDb();
  db.businessRules.maxPrice=900;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'maxPrice must exclude over-ceiling candidates');
}

{
  const db=baseDb();
  db.businessRules.minSellerCount=4;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'min live listings must apply to fresh Item Market evidence');
}

{
  const db=baseDb();
  db.businessRules.minRoiPct=120;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'minimum ROI must exclude weak deals');
}

{
  const db=baseDb();
  db.businessRules.minConfidencePct=99;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'minimum confidence must be enforced');
}

{
  const db=baseDb();
  db.businessRules.minDemandPerDay=0.5;
  const saleAt=now-15*86400000;
  db.sales={
    a:{timestamp:saleAt,items:[{id:'1',quantity:5,total:10000}]}
  };
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'personal demand floor must apply once personal history is qualified');
}

{
  const db=baseDb();
  db.businessRules.minDemandPerDay=99;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,1,'market-proxy candidates remain eligible when personal history is insufficient');
  assert.strictEqual(logic.rankCachedOpportunities(db,now)[0].conversionSource,'MARKET PROXY');
}

{
  const db=baseDb();
  db.procurement.marketSnapshots['1'].fetchedAt=new Date(now-181000).toISOString();
  db.marketIntel.marketplace['1'].totalBazaars=1;
  assert.strictEqual(logic.rankCachedOpportunities(db,now).length,0,'stale market evidence must not bypass the live-listing floor');
}

{
  const db=baseDb();
  db.marketIntel.marketplace={};
  db.procurement.catalog={};
  db.procurement.pricelist={items:{}};
  for(let i=1;i<=125;i++){
    const id=String(i);
    db.marketIntel.marketplace[id]=item(id,1000+i,2000+i,3+(i%5));
    db.procurement.catalog[id]={name:'Item '+id,type:'Supply'};
    db.procurement.pricelist.items[id]={itemId:id,name:'Item '+id,buyPrice:900+i};
  }
  const rows=logic.rankPricelistUniverse(db,now);
  assert.strictEqual(rows.length,125,'every positively priced customer item must be evaluated');
  assert(rows.every(row=>row.hasMarketEvidence),'fixture should have market evidence for all customer items');
  assert(rows.filter(row=>row.profitable).length===125,'all fixture rows should show positive spread');
  assert(rows[0].targetBuy>0,'customer buy-rate benchmark must be preserved');
  assert.strictEqual(rows[0].buySource,'Bazaar observed','global customer-universe discovery must be labeled Bazaar');
  assert(rows[0].bestExit>rows[0].buyPrice,'market exit must be distinct from customer buy rate');
}

{
  const db=baseDb();
  delete db.procurement.marketSnapshots['1'];
  const rows=logic.rankCachedOpportunities(db,now);
  assert.strictEqual(rows.length,1);
  assert.strictEqual(rows[0].discoverySource,'Bazaar aggregate','fallback discovery source must expose Bazaar rather than generic Market');
}

{
  const db=baseDb();
  db.travelIntel.rows=[
    {itemName:'A',country:'Japan',stock:10,profit:1000,sourceProfitPerHour:100},
    {itemName:'B',country:'Mexico',stock:10,profit:500,sourceProfitPerHour:200},
    {itemName:'C',country:'Canada',stock:0,profit:9000,sourceProfitPerHour:9000}
  ];
  const rows=logic.rankCachedTravel(db);
  assert.strictEqual(rows.length,2);
  assert.strictEqual(rows[0].itemName,'B','travel ranking should prioritize source profit/hour');
}

console.log('MM_Acquisitions ranking + travel regression tests: PASS');
