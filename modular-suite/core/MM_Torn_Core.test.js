'use strict';
require('./MM_Torn_Core.js');
const c = globalThis.MMTornCore;
if (!c) throw new Error('MMTornCore not exposed');
if (typeof c.registerDockLauncher !== 'function' || typeof c.setDockLauncherActive !== 'function' || typeof c.makePanelDraggable !== 'function') throw new Error('dock/panel API missing');
const fixture = {
  schema: 11,
  customers: {1:{}}, sales: {a:{},b:{}}, coupons:{1:{}}, refunds:{}, subscribers:{}, removedCustomers:{}, notificationHistory:[],
  businessRules:{}, syncState:{},
  procurement:{ acquisitions:[{},{}], watchlist:{5:{}}, catalog:{}, bazaar:{}, itemMarket:{}, inventory:{}, marketSnapshots:{}, marketHistory:{}, acquisitionProcessed:{}, travelLedger:[], settings:{}, diagnostics:[] },
  operations:{},
  marketIntel:{ marketplace:{10:{},11:{}}, details:{}, traders:{}, dollarItems:[], dollarBazaars:[], ranked:[], auctions:[], suppliers:{}, history:{}, settings:{}, diagnostics:[] },
  travelIntel:{ rows:[{}], history:{x:[]}, forecastLedger:[], settings:{}, diagnostics:[] },
  factionInventory:{ current:{w:{}}, snapshots:[{}], memberReadiness:{roster:{7:{}},profiles:{7:{}}}, thresholds:{}, events:[], settings:{}, diagnostics:[] },
  meta:{}
};
const v = c.validateLegacyState(fixture);
if (!v.ok) throw new Error(v.errors.join('; '));
const s = c.summarizeState(fixture);
if (s.customers !== 1 || s.sales !== 2 || s.acquisitions !== 2 || s.factionMembers !== 1) throw new Error('summary mismatch');
const market = c.getDomainSlice(fixture,'market');
if (!market.procurement || !market.marketIntel || !market.travelIntel || market.customers) throw new Error('domain slice mismatch');
market.procurement.acquisitions.push({});
if (fixture.procurement.acquisitions.length !== 2) throw new Error('domain slice is not cloned');
console.log('PASS', c.version, s);

const updatedMarket = c.applyDomainSlice(fixture, 'market', {
  ...c.getDomainSlice(fixture, 'market'),
  procurement: {
    ...c.getDomainSlice(fixture, 'market').procurement,
    acquisitions: [...fixture.procurement.acquisitions, {id:'new'}]
  }
});
if (updatedMarket.procurement.acquisitions.length !== 3) throw new Error('market write not applied');
if (JSON.stringify(updatedMarket.sales) !== JSON.stringify(fixture.sales)) throw new Error('unrelated sales changed');
if (JSON.stringify(updatedMarket.factionInventory) !== JSON.stringify(fixture.factionInventory)) throw new Error('unrelated faction changed');
let blocked = false;
try { c.applyDomainSlice(fixture, 'intelligence', {}); } catch { blocked = true; }
if (!blocked) throw new Error('read-only intelligence domain was writable');
const fresh = c.freshnessSnapshot({
  ...fixture,
  syncState:{lastUnifiedSyncAt:'u'},
  procurement:{...fixture.procurement,lastItemMarketAt:'m'},
  factionInventory:{...fixture.factionInventory,lastSyncAt:'f'}
});
if (fresh.unified !== 'u' || fresh.itemMarket !== 'm' || fresh.faction !== 'f') throw new Error('freshness snapshot mismatch');
console.log('MERGE PASS');

const coreSource = require('fs').readFileSync(__dirname+'/MM_Torn_Core.js','utf8');
if (!coreSource.includes("const CORE_VERSION = '8.0.0-alpha.13';")) throw new Error('core alpha.13 version missing');
if (!coreSource.includes('const rawEntries=')) throw new Error('native footer geometry de-duplication missing');
if (!coreSource.includes('bottomDistance:Math.abs(window.innerHeight-rowBottom)')) throw new Error('bottom-distance footer priority missing');
if (!coreSource.includes('a.bottomDistance-b.bottomDistance')) throw new Error('lowest footer row comparator missing');
if (!coreSource.includes('const NATIVE_DOCK_CLEARANCE=6;')) throw new Error('native dock clearance constant missing');
if (!coreSource.includes('const nativeGap=clamp(Number(native.nativeGap)||LAUNCHER_SNAP_GAP,2,8);')) throw new Error('native footer gap calculation missing');
if (!coreSource.includes('const gap=Math.max(NATIVE_DOCK_CLEARANCE,nativeGap);')) throw new Error('native dock clearance floor missing');
if (!coreSource.includes('rightEdgeDistance:Math.abs(window.innerWidth-last.r.right)')) throw new Error('native footer right-edge metric missing');
if (!coreSource.includes('candidate.bottomDistance<=minBottomDistance+8')) throw new Error('bottom peer tolerance missing');
if (!coreSource.includes('a.rightEdgeDistance-b.rightEdgeDistance')) throw new Error('bottom-right native row priority missing');
if (!coreSource.includes('a.squareError-b.squareError')) throw new Error('square native-control tie-breaker missing');
if (!coreSource2.includes('mmNativeCandidateCount')) throw new Error('native candidate diagnostics missing');
console.log('alpha.7 footer-row regression PASS');

const coreSource2 = require('fs').readFileSync(__dirname+'/MM_Torn_Core.js','utf8');
if (!coreSource2.includes("const CORE_VERSION = '8.0.0-alpha.13';")) throw new Error('core alpha.13 version missing');
if (!coreSource2.includes("DOCK_DEFAULT_LAYOUT_REV='footer-adjacent-v4-relative-redock'")) throw new Error('default dock layout revision missing');
if (!coreSource2.includes('function applyDefaultDockLayoutOnce()')) throw new Error('default dock migration missing');
if (!coreSource2.includes('localStorage.removeItem(DOCK_FLOAT_KEY)')) throw new Error('legacy floating layout reset missing');
if (!coreSource2.includes('const migrated=applyDefaultDockLayoutOnce();')) throw new Error('default dock migration result not captured');
if (!coreSource2.includes("DOCK_DEFAULT_LAYOUT_KEY='mm_torn_module_default_layout_rev_v3'")) throw new Error('ordered dock migration key missing');
if (!coreSource2.includes("'inventory-roi','acquisitions','customers','armory','trade-reminder'")) throw new Error('requested right-to-left dock cluster missing');
if (!coreSource2.includes("dock.dataset.mmDockAnchor='left-of-torn-native-bottom-toolbar'")) throw new Error('Torn toolbar anchor diagnostic missing');
if (!coreSource2.includes("dock.dataset.mmDefaultRightToLeft='trade-reminder,armory,customers,acquisitions,inventory-roi'")) throw new Error('requested right-to-left diagnostic missing');
if (!coreSource2.includes('DOCK_ORDER_CUSTOM_KEY')) throw new Error('custom dock-order persistence guard missing');
if (!coreSource2.includes("dock.dataset.mmAlpha10PersistenceBridge='1'")) throw new Error('mixed-version dock persistence bridge missing');
if (!coreSource2.includes("dock.dataset.mmDockLeft=String(Math.round(r.left))")) throw new Error('live dock geometry diagnostics missing');
if (!coreSource2.includes("dock.dataset.mmNativeFirstLeft=String(Math.round(native.firstRect.left))")) throw new Error('native toolbar geometry diagnostics missing');
if (!coreSource2.includes("if(!dockHasCustomOrder())return DOCK_DEFAULT_ORDER.slice();")) throw new Error('default order must remain load-order independent');

if (!coreSource2.includes('function redockCanonicalLaunchersForMigration(dock)')) throw new Error('canonical redock migration helper missing');
if (!coreSource2.includes('if(migrated)redockCanonicalLaunchersForMigration(dock);')) throw new Error('canonical redock migration not invoked');
if (!coreSource2.includes("dock.dataset.mmCoreVersion=CORE_VERSION")) throw new Error('DOM-visible core version diagnostic missing');
if (!coreSource2.includes("dock.dataset.mmDockMode='relative-native-row'")) throw new Error('relative dock mode diagnostic missing');
if (!coreSource2.includes("clamp(desiredTop,4,window.innerHeight-dock.offsetHeight)")) throw new Error('native-row bottom-edge alignment clamp missing');
if (coreSource2.includes("clamp(desiredTop,4,window.innerHeight-dock.offsetHeight-4)")) throw new Error('legacy 4px dock lift must be removed');
if (!coreSource2.includes("delete dock.dataset.mmAlpha9PersistenceBridge")) throw new Error('stale alpha9 diagnostic cleanup missing');
console.log('default footer docking migration PASS');
