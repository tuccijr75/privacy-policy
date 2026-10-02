'use strict';
require('../core/MM_Torn_Core.js');
require('./MM_Market_Scout.logic.js');
const logic = globalThis.MMTornMarketLogic;
if (!logic) throw new Error('Market logic unavailable');

const now = Date.UTC(2026,9,2,12,0,0);
const freshIso = new Date(now-30000).toISOString();
const fixture = {
  schema:11,
  businessRules:{minRoiPct:3,minDemandPerDay:0.15,minPrice:10,maxPrice:1000000,minAbsoluteProfit:5,minSellerCount:1,maxListingAgeSec:180},
  sales:{},
  procurement:{
    catalog:{'10':{name:'Bazaar Thing',type:'Supply'},'20':{name:'Market Thing',type:'Supply'}},
    marketSnapshots:{
      '10':{fetchedAt:freshIso,itemMarket:{lowest:115,median:140,totalQty:50,listings:5,depth1Pct:2},bazaar:{median:135,listings:3}},
      '20':{fetchedAt:freshIso,itemMarket:{lowest:200,median:260,totalQty:100,listings:8,depth1Pct:3},bazaar:{median:0,listings:0}}
    }
  },
  marketIntel:{
    marketplace:{
      '10':{itemId:'10',itemName:'Bazaar Thing',lowestPrice:100,bazaarAverage:140,marketPrice:145,totalBazaars:3}
    },
    marketplaceGeneratedAt:freshIso,
    details:{
      '10':{organicListings:[{price:100,quantity:4,sellerId:'99',sellerName:'Seller',lastChecked:now-20000,contentUpdated:now-20000,sponsored:false}]}
    },
    traders:{},
    history:{
      '10':[{bazaarAverage:138},{bazaarAverage:140},{bazaarAverage:142}],
      '20':[{bazaarAverage:260},{bazaarAverage:260}]
    },
    settings:{bazaarExitHaircutPct:1}
  },
  travelIntel:{
    rows:[
      {country:'Mexico',itemId:'1',itemName:'A',stock:10,profit:1000,sourceProfitPerHour:5000},
      {country:'Canada',itemId:'2',itemName:'B',stock:5,profit:2000,sourceProfitPerHour:7000}
    ]
  }
};

const rows = logic.rankCachedOpportunities(fixture,now);
if (rows.length < 2) throw new Error('expected Bazaar and Item Market-only opportunities');
const bazaar = rows.find(r=>r.id==='10');
const market = rows.find(r=>r.id==='20');
if (!bazaar?.purchaseReady || bazaar.purchaseSource !== 'Bazaar') throw new Error('Bazaar opportunity not buyable');
if (!market?.purchaseReady || market.purchaseSource !== 'Item Market') throw new Error('Item Market-only opportunity not buyable');
if (!(bazaar.maxBuyPrice >= bazaar.buyPrice)) throw new Error('buy ceiling invalid');
if (!(rows[0].score >= rows[1].score || rows[0].purchaseReady)) throw new Error('ranking invalid');

const travel = logic.rankCachedTravel(fixture);
if (travel[0]?.country !== 'Canada') throw new Error('travel profit/hour ranking invalid');

console.log('MARKET SCOUT LOGIC PASS', rows.map(r=>({id:r.id,source:r.purchaseSource,roi:r.roiPct,score:r.score})));
