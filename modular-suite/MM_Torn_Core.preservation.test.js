'use strict';
require('./core/MM_Torn_Core.js');
const c = globalThis.MMTornCore;
if (!c) throw new Error('MMTornCore unavailable');


const fs = require('fs');
const coreSource = fs.readFileSync(__dirname + '/core/MM_Torn_Core.js', 'utf8');
if (!coreSource.includes("CORE_VERSION = '8.0.0-alpha.15'")) throw new Error('core ordered-dock version missing');
if (!coreSource.includes('const LAUNCHER_SNAP_GAP=4')) throw new Error('fixed launcher gap missing');
if (!coreSource.includes('const NATIVE_DOCK_CLEARANCE=6')) throw new Error('native Torn clearance floor missing');
if (!coreSource.includes('function launcherTooClose')) throw new Error('launcher overlap guard missing');
if (!coreSource.includes("const PANEL_LAYOUT_EVENT='mm-torn-panel-layout-change'")) throw new Error('panel layout event missing');
if (!coreSource.includes('function resolvePanelPlacement')) throw new Error('panel placement resolver missing');
if (!coreSource.includes('function suppressPanelForCollision')) throw new Error('panel collision suppression missing');
if (!coreSource.includes('function restorePanelsSuppressedBy')) throw new Error('panel collision restoration missing');
if (!coreSource.includes("panel.dataset.mmPanelKey=panelKey")) throw new Error('cross-userscript panel identity missing');
if (!coreSource.includes("visibilityObserver?.observe(panel,{attributes:true,attributeFilter:['style']})")) throw new Error('panel-local visibility observer missing');
if (!coreSource.includes("document.querySelectorAll('[data-mm-panel-key]')")) throw new Error('cross-userscript panel discovery missing');

if (!coreSource.includes('function resolveLauncherPosition')) throw new Error('launcher snap resolver missing');
if (!coreSource.includes('native?.controls')) throw new Error('native Torn icon collision targets missing');
if (!coreSource.includes('obstacles:launcherObstacleRects(button)')) throw new Error('floating drag collision snapshot missing');
if (!coreSource.includes("document.querySelectorAll('a,button,[role=\"button\"]')")) throw new Error('direct Torn footer control detection missing');
if (!coreSource.includes('native.rowBottom??first.bottom')) throw new Error('bottom-edge dock alignment missing');
if (!coreSource.includes('const alignedTop=clamp(o.bottom-height')) throw new Error('neighbor bottom-edge alignment missing');
if (!coreSource.includes("DOCK_DEFAULT_LAYOUT_REV='footer-adjacent-v4-relative-redock'")) throw new Error('ordered dock layout revision missing');
if (!coreSource.includes("'inventory-roi','acquisitions','customers','armory','trade-reminder'")) throw new Error('requested default dock cluster missing');
if (!coreSource.includes('DOCK_ORDER_CUSTOM_KEY')) throw new Error('user-reorder persistence flag missing');
if (!coreSource.includes("dock.dataset.mmAlpha10PersistenceBridge='1'")) throw new Error('mixed-version dock bridge missing');
if (!coreSource.includes('function redockCanonicalLaunchersForMigration(dock)')) throw new Error('canonical redock migration helper missing');
if (!coreSource.includes("dock.dataset.mmDockMode='relative-native-row'")) throw new Error('relative dock diagnostic missing');
if (!coreSource.includes('clamp(desiredTop,4,window.innerHeight-dock.offsetHeight)')) throw new Error('exact Torn bottom-edge alignment missing');
if (!coreSource.includes('rightEdgeDistance:Math.abs(window.innerWidth-last.r.right)')) throw new Error('bottom-right Torn row metric missing');
if (!coreSource.includes('candidate.bottomDistance<=minBottomDistance+8')) throw new Error('bottom-row peer tolerance missing');
if (!coreSource.includes('a.rightEdgeDistance-b.rightEdgeDistance')) throw new Error('right-edge native row priority missing');
if (!coreSource.includes('mmDockLeft')) throw new Error('dock geometry diagnostics missing');
if (!coreSource.includes('async function ensureSharedState()')) throw new Error('fresh-install bootstrap API missing');
if (!coreSource.includes('openLegacyDb({ allowCreate: true })')) throw new Error('fresh-install write/bootstrap path missing');
if (!coreSource.includes("bootstrap: 'fresh-install'")) throw new Error('fresh-install provenance missing');
if (typeof c.createEmptySharedState !== 'function') throw new Error('empty shared-state factory missing');
if (typeof c.ensureSharedState !== 'function') throw new Error('shared-state bootstrap export missing');
if (typeof c.resolvePanelPlacement !== 'function') throw new Error('panel placement export missing');
if (typeof c.panelRectsOverlap !== 'function') throw new Error('panel overlap export missing');

const freePlacement = c.resolvePanelPlacement({
  left:700, top:80, width:300, height:300,
  viewportWidth:1200, viewportHeight:900,
  obstacles:[{left:700,top:80,width:300,height:300}]
});
if (!freePlacement) throw new Error('wide viewport should find a collision-free slot');
if (c.panelRectsOverlap(
  {left:freePlacement.left,top:freePlacement.top,width:300,height:300},
  {left:700,top:80,width:300,height:300}
)) throw new Error('wide viewport placement still overlaps');

const preservedPlacement = c.resolvePanelPlacement({
  left:40, top:80, width:300, height:300,
  viewportWidth:1200, viewportHeight:900,
  obstacles:[{left:700,top:80,width:300,height:300}]
});
if (!preservedPlacement || preservedPlacement.left !== 40 || preservedPlacement.top !== 80) {
  throw new Error('non-overlapping requested panel position should be preserved');
}

const impossiblePlacement = c.resolvePanelPlacement({
  left:40, top:40, width:700, height:700,
  viewportWidth:800, viewportHeight:800,
  obstacles:[{left:40,top:40,width:700,height:700}]
});
if (impossiblePlacement !== null) throw new Error('narrow viewport should report no collision-free slot');


const empty = c.createEmptySharedState('2026-10-06T00:00:00.000Z');
const emptyValidation = c.validateLegacyState(empty);
if (!emptyValidation.ok) throw new Error('fresh-install state invalid: ' + emptyValidation.errors.join('; '));
if (empty.schema !== 11) throw new Error('fresh-install schema mismatch');
if (empty.meta?.bootstrap !== 'fresh-install') throw new Error('fresh-install provenance mismatch');
if (Object.keys(empty.customers).length || Object.keys(empty.procurement).length || Object.keys(empty.marketIntel).length) {
  throw new Error('fresh-install state must start empty');
}


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
