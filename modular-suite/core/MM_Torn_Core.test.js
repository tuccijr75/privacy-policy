'use strict';
require('./MM_Torn_Core.js');
const c = globalThis.MMTornCore;
if (!c) throw new Error('MMTornCore not exposed');
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
