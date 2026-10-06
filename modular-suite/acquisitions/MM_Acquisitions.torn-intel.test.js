'use strict';
require('./MM_Acquisitions.torn-intel.js');
const ti=globalThis.MMTornRestockIntel;
if(!ti)throw new Error('MMTornRestockIntel unavailable.');

const table={
  stocks:{
    can:{update:1791254571,stocks:[
      {id:206,name:'Xanax',quantity:0,cost:867280},
      {id:263,name:'Crocus',quantity:9660,cost:600}
    ]},
    mex:{update:1791254570,stocks:[{id:260,name:'Dahlia',quantity:100,cost:300}]}
  }
};
const rows=ti.normalizeTravelTable(table,1791254600000);
if(rows.length!==3)throw new Error('travel-table normalization count mismatch');
const xan=rows.find(row=>row.itemId==='206'&&row.countryCode==='can');
if(!xan||xan.country!=='Canada'||xan.stock!==0||xan.shopCost!==867280)throw new Error('Canada Xanax normalization failed');
if(xan.source!=='Torn Intel Travel Table'||!xan.sourceUpdatedAt)throw new Error('travel source provenance missing');

const state={
  businessRules:{maxListingAgeSec:180},
  procurement:{
    marketSnapshots:{
      '206':{fetchedAt:'2026-10-06T10:00:00.000Z',itemMarket:{lowest:1000000}}
    }
  },
  marketIntel:{
    marketplaceGeneratedAt:'2026-10-06T10:00:00.000Z',
    marketplace:{
      '206':{lowestPrice:990000,bazaarAverage:1010000,totalBazaars:5}
    }
  },
  travelIntel:{rows:[]}
};
const enriched=ti.enrichTravelRows([xan],state,Date.parse('2026-10-06T10:01:00.000Z'))[0];
if(enriched.profit<=0||enriched.homeMarket<=0)throw new Error('live resale enrichment missing');
if(!/live market evidence/i.test(enriched.profitSource))throw new Error('travel profit provenance missing');

const mvOnlyState={
  businessRules:{maxListingAgeSec:180},
  procurement:{catalog:{'206':{marketPrice:5000000}},marketSnapshots:{}},
  marketIntel:{marketplace:{},marketplaceGeneratedAt:''},
  travelIntel:{rows:[]}
};
const mvOnly=ti.enrichTravelRows([xan],mvOnlyState,Date.now())[0];
if(mvOnly.profit!==0||mvOnly.homeMarket!==0)throw new Error('catalog MV must not fabricate live travel resale evidence');

const base=Date.parse('2026-10-06T00:00:00.000Z');
const points=[];
function p(minutes,quantity){points.push({t:new Date(base+minutes*60000).toISOString(),quantity,cost:867280,marketValue:1000000});}
// three clean 60-minute zero->restock cycles with <=5m observation gaps at both transitions.
p(0,10);p(5,0);p(60,0);p(65,20);
p(120,10);p(125,0);p(180,0);p(185,20);
p(240,10);p(245,0);p(300,0);p(305,20);
// active sellout.
p(360,10);p(365,0);p(400,0);
const model=ti.deriveRestockModel({points},base+400*60000);
if(model.usableCycles.length!==3)throw new Error('usable restock cycle count mismatch');
if(Math.round(model.medianDelayMs/60000)!==60)throw new Error('restock median mismatch');
if(!model.currentEmpty||!model.eta)throw new Error('active restock ETA missing');
if(model.confidence==='INSUFFICIENT')throw new Error('confidence should be available after three cycles');

const ambiguous=[
 {t:new Date(base).toISOString(),quantity:10},
 {t:new Date(base+20*60000).toISOString(),quantity:0},
 {t:new Date(base+80*60000).toISOString(),quantity:0},
 {t:new Date(base+100*60000).toISOString(),quantity:10}
];
const bad=ti.deriveRestockModel({points:ambiguous},base+100*60000);
if(bad.usableCycles.length!==0||bad.rejectedCycles!==1)throw new Error('ambiguous transition gap must be rejected');

const rec=ti.modelRecord({country:'can',itemId:'206',itemName:'Xanax',model,fetchedAt:base+400*60000});
if(!rec||rec.key!=='can|206'||rec.cycles.length!==3||!rec.sourceNewestAt)throw new Error('restock record serialization failed');
const pruned=ti.pruneRestockRecords({'can|206':rec},base+400*60000);
if(!pruned['can|206'])throw new Error('fresh restock record pruned unexpectedly');

console.log('MM_Acquisitions Torn Intel restock regression: PASS');
