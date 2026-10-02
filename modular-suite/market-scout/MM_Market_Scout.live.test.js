'use strict';
require('../core/MM_Torn_Core.js');
require('./MM_Market_Scout.logic.js');
require('./MM_Market_Scout.live.js');

const baseCore=globalThis.MMTornCore;
const logic=globalThis.MMTornMarketLogic;
const live=globalThis.MMTornMarketLive;
if(!baseCore||!logic||!live)throw new Error('Market Scout dependencies missing');

function fixture(){
  return {
    schema:11,
    customers:{},sales:{},coupons:{},refunds:{},subscribers:{},removedCustomers:{},notificationHistory:[],
    businessRules:{minRoiPct:3,minDemandPerDay:0,minPrice:10,maxPrice:1000000,minAbsoluteProfit:5,minSellerCount:1,maxListingAgeSec:180},
    syncState:{},
    procurement:{catalog:{'10':{name:'Thing',type:'Supply'}},bazaar:{},itemMarket:{},inventory:{},marketSnapshots:{},marketHistory:{},acquisitions:[],acquisitionProcessed:{},watchlist:{},travelLedger:[],settings:{},diagnostics:[]},
    operations:{},
    marketIntel:{marketplace:{},details:{},traders:{},dollarItems:[],dollarBazaars:[],ranked:[],auctions:[],suppliers:{},history:{},settings:{bazaarExitHaircutPct:1},diagnostics:[]},
    travelIntel:{rows:[],history:{},forecastLedger:[],settings:{},diagnostics:[]},
    factionInventory:{current:{},snapshots:[],events:[],memberReadiness:{roster:{},profiles:{},diagnostics:[],settings:{}},thresholds:{},diagnostics:[],sourceCategorySummary:{},settings:{}},
    meta:{}
  };
}

function memoryCore(initial){
  let state=baseCore.deepClone(initial);
  return {
    readLegacyState:async()=>baseCore.deepClone(state),
    updateDomainState:async(domain,updater)=>{
      const draft=baseCore.getDomainSlice(state,domain);
      const next=updater(draft)??draft;
      state=baseCore.applyDomainSlice(state,domain,next);
      return baseCore.deepClone(state);
    },
    snapshot:()=>baseCore.deepClone(state)
  };
}

function weavRequest(path){
  const nowSec=Math.floor(Date.now()/1000);
  if(path==='/marketplace')return Promise.resolve({
    generated_at:nowSec,
    items:[{item_id:10,item_name:'Thing',market_price:150,bazaar_average:140,lowest_price:90,total_bazaars:3}]
  });
  if(path==='/marketplace/10')return Promise.resolve({
    generated_at:nowSec,item_name:'Thing',market_price:150,bazaar_average:140,
    listings:[{item_id:10,player_id:99,player_name:'Seller',quantity:2,price:90,last_checked:nowSec,content_updated:nowSec,sponsored:0}]
  });
  if(path==='/marketplace/10/traders')return Promise.resolve({generated_at:nowSec,item_name:'Thing',traders:[]});
  throw new Error('Unexpected Weav path '+path);
}

function tornRequest(path){
  if(!String(path).includes('/market/10/itemmarket'))throw new Error('Unexpected Torn path '+path);
  return Promise.resolve({itemmarket:{listings:[
    {price:105,quantity:2},
    {price:110,quantity:3},
    {price:120,quantity:5}
  ]}});
}

(async()=>{
  const core1=memoryCore(fixture());
  let routed1='';
  const service1=live.createService({
    core:core1,logic,weavRequest,tornRequest,
    bazaarRequest:async()=>({
      bazaar_timestamp:Math.floor(Date.now()/1000),bazaar_is_open:true,
      bazaar:[{ID:10,name:'Thing',price:95,quantity:2}]
    }),
    hasTornKey:()=>true,
    navigate:url=>{routed1=url;}
  });

  await service1.refreshOpportunities({enrichLimit:1,itemMarketLimit:1});
  let rows=logic.rankCachedOpportunities(await core1.readLegacyState());
  const row=rows.find(x=>x.id==='10');
  if(!row?.purchaseReady)throw new Error('refresh did not produce buyable opportunity');
  const result1=await service1.acquire('10');
  if(!result1.routed||result1.source!=='Bazaar'||!routed1.includes('userId=99'))throw new Error('verified Bazaar routing failed');

  const core2=memoryCore(fixture());
  let routed2='';
  const service2=live.createService({
    core:core2,logic,weavRequest,tornRequest,
    bazaarRequest:async()=>({
      bazaar_timestamp:Math.floor(Date.now()/1000),bazaar_is_open:true,
      bazaar:[{ID:10,name:'Thing',price:999,quantity:2}]
    }),
    hasTornKey:()=>true,
    navigate:url=>{routed2=url;}
  });
  await service2.refreshOpportunities({enrichLimit:1,itemMarketLimit:1});
  const result2=await service2.acquire('10');
  if(!result2.routed||result2.source!=='Item Market'||!routed2.includes('itemID=10'))throw new Error('over-ceiling Bazaar did not fall back to Item Market');

  const stale=live.bazaarSnapshotFreshness(Math.floor((Date.now()-181000)/1000));
  if(stale.fresh)throw new Error('stale Bazaar snapshot accepted');

  console.log('MARKET SCOUT LIVE PASS',{
    bazaarRoute:result1.source,
    fallbackRoute:result2.source,
    staleRejected:!stale.fresh
  });
})().catch(error=>{console.error(error);process.exitCode=1;});
