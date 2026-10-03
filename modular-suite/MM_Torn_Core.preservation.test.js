'use strict';
require('./core/MM_Torn_Core.js');
const c = globalThis.MMTornCore;
if (!c) throw new Error('MMTornCore unavailable');


const fs = require('fs');
const coreSource = fs.readFileSync(__dirname + '/core/MM_Torn_Core.js', 'utf8');
if (!coreSource.includes("CORE_VERSION = '8.0.0-alpha.5'")) throw new Error('core launcher fix version missing');
if (!coreSource.includes('const LAUNCHER_SNAP_GAP=4')) throw new Error('fixed launcher gap missing');
if (!coreSource.includes('function launcherTooClose')) throw new Error('launcher overlap guard missing');
if (!coreSource.includes('function resolveLauncherPosition')) throw new Error('launcher snap resolver missing');
if (!coreSource.includes('native?.controls')) throw new Error('native Torn icon collision targets missing');
if (!coreSource.includes('obstacles:launcherObstacleRects(button)')) throw new Error('floating drag collision snapshot missing');


const fixture = {
  schema: 11,
  customers: { '1': { id:'1', name:'Buyer', spent:123 } },
  sales: { 'sale-1': { id:'sale-1', timestamp:1, items:[{id:'10',quantity:2,total:200}] } },
  coupons: { '1': { playerId:'1', code:'SAVE-1' } },
  refunds: { 'r1': { id:'r1', status:'completed', amount:5 } },
  subscribers: { '1': { id:'1', interests:['Thing'] } },
  removedCustomers: {},
  notificationHistory: [{id:'n1'}],
  businessRules: { minRoiPct:3, updatedAt:'2026-01-01T00:00:00Z' },
  syncState: { lastUnifiedSyncAt:'2026-01-01T00:00:00Z' },
  procurement: {
    catalog:{'10':{name:'Thing'}}, bazaar:{}, itemMarket:{}, inventory:{},
    marketSnapshots:{'10':{fetchedAt:'2026-01-01T00:00:00Z'}}, marketHistory:{},
    acquisitions:[{id:'a1',itemId:'10',quantity:2,unitCost:50}],
    acquisitionProcessed:{}, watchlist:{'10':{itemId:'10'}}, travelLedger:[],
    settings:{}, diagnostics:[]
  },
  operations: { inventorySnapshots:[{at:1}], listingPlans:{'10':{quantity:1}}, settings:{} },
  marketIntel: {
    marketplace:{'10':{itemId:'10',itemName:'Thing',lowestPrice:50}},
    marketplaceGeneratedAt:'2026-01-01T00:00:00Z',
    details:{},traders:{},dollarItems:[],dollarBazaars:[],ranked:[],auctions:[],suppliers:{},
    history:{'10':[{bazaarAverage:100}]},settings:{},diagnostics:[]
  },
  travelIntel: {
    rows:[{country:'Mexico',itemId:'10',itemName:'Thing',stock:4,profit:25}],
    history:{'Mexico|10':[{at:1,stock:4}]},forecastLedger:[{id:'f1'}],
    lastSyncAt:'2026-01-01T00:00:00Z',settings:{},diagnostics:[]
  },
  factionInventory: {
    current:{'500':{itemId:'500',name:'Weapon'}},snapshots:[{id:'s1'}],events:[],
    logisticsLedger:[{id:'l1'}],
    memberReadiness:{
      roster:{'7':{id:'7',name:'Member'}},
      profiles:{'7':{battleStats:{strength:1},equipment:{primary:{itemId:'500'}},savedBuild:{primary:{targetId:'501'}}}},
      diagnostics:[],settings:{}
    },
    thresholds:{'500':{target:2}},diagnostics:[],sourceCategorySummary:{},settings:{}
  },
  meta: { createdAt:'2026-01-01T00:00:00Z' }
};

const original = c.deepClone(fixture);
let state = c.deepClone(fixture);

state = c.applyDomainSlice(state, 'market', {
  ...c.getDomainSlice(state,'market'),
  procurement:{...state.procurement, acquisitions:[...state.procurement.acquisitions,{id:'a2',itemId:'10',quantity:1,unitCost:45}]},
  marketIntel:{...state.marketIntel, marketplaceGeneratedAt:'2026-01-02T00:00:00Z'},
  travelIntel:{...state.travelIntel, rows:[...state.travelIntel.rows,{country:'Canada',itemId:'10',itemName:'Thing',stock:2,profit:20}]}
});

if (JSON.stringify(state.customers) !== JSON.stringify(original.customers)) throw new Error('market write changed customers');
if (JSON.stringify(state.sales) !== JSON.stringify(original.sales)) throw new Error('market write changed sales');
if (JSON.stringify(state.factionInventory) !== JSON.stringify(original.factionInventory)) throw new Error('market write changed faction');
if (state.procurement.acquisitions.length !== 2) throw new Error('market acquisition not preserved');

state = c.applyDomainSlice(state, 'faction', {
  ...c.getDomainSlice(state,'faction'),
  factionInventory:{
    ...state.factionInventory,
    thresholds:{...state.factionInventory.thresholds,'500':{target:3}}
  }
});

if (state.procurement.acquisitions.length !== 2) throw new Error('faction write lost market changes');
if (JSON.stringify(state.sales) !== JSON.stringify(original.sales)) throw new Error('faction write changed sales');
if (state.factionInventory.thresholds['500'].target !== 3) throw new Error('faction threshold update failed');

state = c.applyDomainSlice(state, 'bazaar', {
  ...c.getDomainSlice(state,'bazaar'),
  customers:{...state.customers,'2':{id:'2',name:'Buyer 2',spent:456}},
  sales:{...state.sales,'sale-2':{id:'sale-2',timestamp:2,items:[]}}
});

if (state.procurement.acquisitions.length !== 2) throw new Error('bazaar write lost market state');
if (state.factionInventory.thresholds['500'].target !== 3) throw new Error('bazaar write lost faction state');
if (!state.customers['1'] || !state.customers['2']) throw new Error('bazaar customer preservation failed');
if (!state.sales['sale-1'] || !state.sales['sale-2']) throw new Error('bazaar sales preservation failed');
if (!state.coupons['1'] || !state.refunds.r1) throw new Error('bazaar durable state lost');

state = c.applyDomainSlice(state, 'core', {
  ...c.getDomainSlice(state,'core'),
  businessRules:{...state.businessRules,minRoiPct:5,updatedAt:'2026-01-03T00:00:00Z'}
});

if (state.businessRules.minRoiPct !== 5) throw new Error('core rules update failed');
if (state.procurement.acquisitions.length !== 2) throw new Error('core write lost market state');
if (state.factionInventory.thresholds['500'].target !== 3) throw new Error('core write lost faction state');
if (!state.customers['2']) throw new Error('core write lost bazaar state');

const validation = c.validateLegacyState(state);
if (!validation.ok) throw new Error(validation.errors.join('; '));

console.log('PRESERVATION PASS', c.summarizeState(state));
