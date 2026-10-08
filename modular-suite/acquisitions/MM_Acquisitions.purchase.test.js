const fs=require('fs');const vm=require('vm');const assert=require('assert');
const sandbox={globalThis:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.purchase.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.purchase.logic.js'});
const logic=sandbox.globalThis.MMTornAcquisitionLedger;assert(logic);
const ts=Math.floor(Date.now()/1000)-60;
const rows=logic.parseAcquisitionLog({id:'log1',timestamp:ts,data:{items:[{id:26,qty:2}],cost_total:2000,seller_id:7}},'Bazaar',{'26':{name:'AK-47'}});
assert.strictEqual(rows.length,1);assert.strictEqual(rows[0].unitCost,1000);assert.strictEqual(rows[0].quantity,2);
const proc=logic.ensureProcurement({catalog:{'26':{name:'AK-47'}}});
assert.strictEqual(logic.mergeAcquisitionLogRows(proc,[{id:'log1',timestamp:ts,data:{items:[{id:26,qty:2}],cost_total:2000}}],'Bazaar'),1);
assert.strictEqual(logic.mergeAcquisitionLogRows(proc,[{id:'log1',timestamp:ts,data:{items:[{id:26,qty:2}],cost_total:2000}}],'Bazaar'),0);
assert.strictEqual(proc.acquisitions.length,1);

const userSource=fs.readFileSync(__dirname+'/MM_Acquisitions.user.js','utf8');
new Function(userSource);
assert(userSource.includes('// @version      8.0.0-alpha.36'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@b6d2202ad507c6b138919e2d37e461cfc422b382/modular-suite/core/MM_Torn_Core.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@e7dc3ee67948a527a83cda9c52c69c863680b264/modular-suite/acquisitions/MM_Acquisitions.market-pulse.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@e7dc3ee67948a527a83cda9c52c69c863680b264/modular-suite/acquisitions/MM_Acquisitions.logic.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@e7dc3ee67948a527a83cda9c52c69c863680b264/modular-suite/acquisitions/MM_Acquisitions.live.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@7439f1289a0ac281515e2954b6c2a349d2aa6815/modular-suite/acquisitions/MM_Acquisitions.ranked.logic.js'));
assert(userSource.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@6c2ababdb06ee105191e74126c457ac3b7fea53f/modular-suite/acquisitions/MM_Acquisitions.torn-intel.js'));
assert(!userSource.includes('// @updateURL'));
assert(!userSource.includes('// @downloadURL'));
assert(userSource.includes('async function autoRefreshAcquisitions'));
assert(userSource.includes('AUTO_REFRESH_MS=60_000'));
assert(userSource.includes('PURCHASE_STALE_MS=120_000'));
assert(userSource.includes('core?.ensureSharedState'),'fresh-install Core bootstrap missing');
assert(userSource.includes('OPPORTUNITY_STALE_MS=300_000'));
assert(userSource.includes('TRAVEL_FRESH_MS=300_000'));
assert(userSource.includes('TRAVEL_STALE_MS=900_000'));
assert(userSource.includes('Market purchase deferred: '));
assert(userSource.includes('Old travel stock is hidden until it is refreshed.'));
assert(userSource.includes('grid-template-columns:repeat(auto-fit,minmax(135px,1fr))'));
assert(userSource.includes('Min confidence %'));
assert(userSource.includes('Recommended Deals'));
assert(userSource.includes('Find One Item'));
assert(userSource.includes('Example: Can of Crocozade'));
assert(userSource.includes('Check Prices'));
assert(userSource.includes('data-catalog-find'));
assert(userSource.includes('ITEM_PAGE_SIZE=75'));
assert(userSource.includes('CATALOG_STALE_MS=24*60*60*1000'));
assert(userSource.includes('MM_Acquisitions.ranked.logic.js'));
assert(userSource.includes('Ranked Weapons'));
assert(userSource.includes("let activeView='pricelist'"));
assert(userSource.includes('Customer Pricelist'));
assert(userSource.includes('id="mm-acq-pricelist-profile-url"'));
assert(userSource.includes('optional / shared across MM suite'));
assert(!userSource.includes('DEFAULT_PRICELIST_USER_ID'));
assert(!userSource.includes('4054377'));
assert(!userSource.includes('Pricelist Torn ID'));
assert(userSource.includes('This is the main non-ranked workflow when a customer profile is configured.'));
assert(userSource.includes('AT / UNDER BUY RATE'));
assert(userSource.includes('Pricelist buy rate'));
assert(userSource.includes('Refresh Market Prices'));
assert(userSource.includes('data-acq-view="pricelist"'));
assert(userSource.includes('data-acq-view="ranked"'));
assert(userSource.includes('data-acq-view="more"'));
assert(!userSource.includes('data-acq-view="home"'));
assert(!userSource.includes('data-acq-view="items"'));
assert(!userSource.includes('data-acq-view="deals"'));
assert(!userSource.includes('data-acq-view="travel"'));
assert(!userSource.includes('data-acq-view="settings"'));
assert(userSource.includes('More tools'));
assert(userSource.includes('Normal use should start in <b>Pricelist</b> or <b>Ranked Weapons</b>.'));
assert(userSource.includes('data-more-view="items"'));
assert(userSource.includes('data-more-view="deals"'));
assert(userSource.includes('data-more-view="travel"'));
assert(userSource.includes('data-more-view="settings"'));
assert(userSource.includes('data-pricelist-source="Bazaar"'));
assert(userSource.includes('data-pricelist-source="Item Market"'));
assert(userSource.includes('data-pricelist-check'));
assert(userSource.includes('function pricelistRows(){'));
assert(userSource.includes('function pricelistHtml(){'));
assert(userSource.includes("const restockRequestHtml=procurementRequest?.requestKind==='inventory-restock'?procurementRequestHtml():'';"),'Pricelist must render an active Inventory restock comparison card');
assert(userSource.includes('return inventoryRestockHtml()+restockRequestHtml+'),'Pricelist must surface Inventory restock queue plus request result before the optional profile card');
assert(!userSource.includes("return (procurementRequest?.requestKind==='inventory-restock'?procurementRequestHtml():'')+"),'Inventory restock renderer must not recurse');
assert(userSource.includes('function routePricelistSource('));
assert(userSource.includes('UNDER BB VALUE'));
assert(userSource.includes('INVESTMENT CANDIDATE'));
assert(userSource.includes('SALES 7 / 30 / 90 DAYS'));
assert(userSource.includes('Valuation details'));
assert(userSource.includes('No bonus is excluded.'));
assert(userSource.includes("(isAuction?'CURRENT BID':'CURRENT PRICE')"));
assert(userSource.includes("'Break-even bid ceiling'"));
assert(userSource.includes("'Max bid for '"));
assert(userSource.includes("Number(b.sortScore||0)-Number(a.sortScore||0)"));
assert(userSource.includes('futureDuration(row.endsAt)'));
assert(userSource.includes('Pricelist opportunities'));
assert(userSource.includes('More deal sources and advanced signals'));
assert(userSource.includes('data-pricelist-verify'));
assert(userSource.includes('RANKED_LIVE_STALE_MS=300_000'));
assert(userSource.includes('PRICELIST_STALE_MS=3600_000'));
assert(userSource.includes("url.searchParams.set('listing','auction')"));
assert(!userSource.includes('sid=ItemMarket#/market/view=auctionHouse'));
assert(userSource.includes('Primary'));
assert(userSource.includes('Secondary'));
assert(userSource.includes('Melee'));
assert(userSource.includes('Current source:'));
assert(userSource.includes('Has Bazaar price'));
assert(userSource.includes('option value="bazaar"'));
assert(userSource.includes('option value="item-market"'));
assert(userSource.includes('Check All Prices'));
assert(userSource.includes('Price <b>'));
assert(userSource.includes('Travel is currently cheapest'));
assert(userSource.includes('Destination ranking'));
assert(userSource.includes('rankTravelDestinations'));
assert(userSource.includes('there is no hidden country score'));
assert(userSource.includes('Torn Intel Travel Stock'));
assert(userSource.includes('Restock Watch'));
assert(userSource.includes('ESTIMATE RESTOCK'));
assert(userSource.includes('Torn Intel client key'));
assert(userSource.includes('EARLY BID · WATCH ONLY'));
assert(userSource.includes('early bid is not a purchase price'));
assert(userSource.includes("if(row.auctionBidProvisional&&rankedSource!=='auction')return false;"));
assert(userSource.includes('Estimated profit '));
assert(userSource.includes('data-travel-compare'));
assert(userSource.includes('LIKELY RESALE'));
assert(userSource.includes('resale estimate source:'));
assert(userSource.includes('GO TO BAZAAR'));
assert(userSource.includes("Bazaar '+esc(age(f.weav3rGeneratedAt))"));
assert(userSource.includes("id:'acquisitions'"));
assert(!userSource.includes("id:'ranked-acquisitions'"));
assert(userSource.includes('Verify & Buy and final purchase remain manual'));
assert(userSource.includes('Find One Item'));
assert(userSource.includes('GO TO BAZAAR'));
assert(userSource.includes('GO TO ITEM MARKET'));
assert(userSource.includes('Travel is currently cheapest'));
assert(userSource.includes('Data status: '));
assert(userSource.includes('What do the main terms mean?'));
assert(userSource.includes('WHERE DO YOU WANT TO BUY?'));
assert(userSource.includes("const PANEL_OPEN_KEY='mm_acquisitions_panel_open_v1';"));
assert(userSource.includes('capturePanelUiState(root);'));
assert(userSource.includes('restorePanelUiState(root);'));
assert(userSource.includes("id=\"mm-acq-content\""));
assert(userSource.includes("if(!root||root.style.display==='none')open();"));
assert(!userSource.includes("if(root&&root.style.display!=='none')close(); else open();"));
assert(userSource.includes('if(Boolean(GM_getValue(PANEL_OPEN_KEY,false)))setTimeout(open,0);'));
assert(userSource.includes('Player-owned bazaars'));
assert(userSource.includes('Torn Item Market for this item'));
assert(userSource.includes("String(source.source||'').toLowerCase().startsWith('bazaar')"));
assert(userSource.includes("String(source.source||'').toLowerCase()==='item market'"));
assert(userSource.includes('data-travel-source="Bazaar"'));
assert(userSource.includes('data-travel-source="Item Market"'));
assert(userSource.includes('data-item-alt-source="Bazaar"'));
assert(userSource.includes('data-item-alt-source="Item Market"'));
assert(userSource.includes('Official Torn API finished Auction House records'));
assert(userSource.includes('href="#mm-acq-verified-sales"'));
assert(userSource.includes('data-sales-view'));
assert(userSource.includes('data-sales-close'));
assert(userSource.includes("verifiedSalesItemId===String(itemSelection.id)?verifiedSalesHtml(itemSelection.id):''"));
assert(userSource.includes('sale #'));
assert(userSource.includes('Market activity:'));
assert(userSource.includes('not a confirmed individual sale'));
assert(userSource.includes('ESTIMATED PROFIT'));
assert(userSource.includes('Your pricelist buy target:'));
assert(!userSource.includes('torn.marches.cafe'));
console.log('MM_Acquisitions purchase-ledger + automation regression tests: PASS');

const pdaSource=fs.readFileSync(__dirname+'/MM_Acquisitions.pda.user.js','utf8');
new Function(pdaSource);
const pdaHeader=pdaSource.slice(0,pdaSource.indexOf('// ==/UserScript=='));
assert(pdaSource.includes('// @version      8.0.0-alpha.36-pda.23'));
assert(!/globalThis\.GM_(?:getValue|setValue|deleteValue|xmlhttpRequest)\s*=/.test(pdaSource),'generated PDA must not monkey-patch GM helpers');
assert(pdaSource.includes('function platformGetRequest(options)'),'generated PDA must contain the source-owned GET bridge');
assert(pdaSource.includes("ctx?.mode==='traveling'||ctx?.mode==='abroad'"),'generated PDA must preserve the travel route guard');
const pdaUiSource=pdaSource.slice(pdaSource.indexOf('===== Acquisitions UI ====='));
const pdaPulseSource=pdaSource.slice(pdaSource.indexOf('===== Market Pulse engine (bundled) ====='),pdaSource.indexOf('===== Acquisitions logic (bundled) ====='));
assert(!/armory|factionInventory|marketPulseDemand|MM_Faction_Armory/i.test(pdaUiSource),'PDA Acquisitions UI must be standalone');
assert(!/armory|factionInventory|marketPulseDemand|MM_Faction_Armory/i.test(pdaPulseSource),'PDA Market Pulse producer must be standalone');
assert(!pdaHeader.includes('@require'));
assert(!pdaSource.includes('globalThis.GM_getValue=function'));
assert(pdaSource.includes("const __MM_PDA_API_KEY='###PDA-APIKEY###';"));
assert(!pdaSource.includes('__MM_PDA_API_KEY__'));
assert(pdaSource.includes("const apiKey=()=>{const saved=String(GM_getValue(API_KEY,'')||'').trim();if(saved)return saved;const pda=String(__MM_PDA_API_KEY||'').trim();"));
assert(pdaSource.includes("globalThis.__MM_ACQ_PDA_STAGE='boot'"));
assert(pdaSource.includes("globalThis.__MM_ACQ_PDA_STAGE='adapter'"));
assert(pdaSource.includes("globalThis.__MM_ACQ_PDA_STAGE='pulse'"));
assert(pdaSource.includes("globalThis.__MM_ACQ_PDA_STAGE='torn-intel'"));
assert(pdaSource.includes('MMTornRestockIntel'));
assert(pdaHeader.includes('// @connect      torn-intel.com'));
assert(pdaSource.includes("globalThis.__MM_ACQ_PDA_STAGE='ui-ready'"));
assert(pdaSource.includes("if(core?.registerDockLauncher&&!globalThis.__MM_TORN_PDA__)"));
assert(pdaSource.includes('position:fixed;right:10px;bottom:86px;'));
assert(pdaSource.includes('async function pdaSharedGet'));
assert(pdaSource.includes("typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.get==='function'"));
assert(pdaSource.includes('await PDA_storage.set(String(key),value)'));
assert(pdaSource.includes('const maybeReturn=async count=>'));
assert(pdaSource.includes('const feed=await loadTravelFeed();'));
assert(pdaSource.includes('const feed=await writeTravelFeed(rows,Date.now());'));
assert(pdaSource.includes('await beginTravelCapture();'));

const pdaAdapterSource=fs.readFileSync(__dirname+'/MM_Acquisitions.pda.adapter.js','utf8');
assert(!pdaAdapterSource.includes('globalThis.GM_getValue=function'));
assert(!pdaAdapterSource.includes('__MM_PDA_API_KEY__'));
assert(!/globalThis\.GM_(?:getValue|setValue|deleteValue|xmlhttpRequest)\s*=/.test(pdaAdapterSource),'PDA adapter must never monkey-patch GM helpers');
assert(userSource.includes('function platformGetRequest(options)'),'desktop source must own the GET bridge locally');
assert(userSource.includes("typeof PDA_httpGet==='function'"),'local GET bridge must support lexical PDA_httpGet fallback');
assert(userSource.includes("ctx?.mode==='traveling'||ctx?.mode==='abroad'"),'travel route guard must block both traveling and abroad states');
assert(userSource.includes('Torn market purchase pages are unavailable while traveling or abroad.'),'direct Torn market navigation must fail closed while away');
assert(userSource.includes('Market purchase deferred: '),'procurement routing must defer while away');
assert(pdaAdapterSource.includes("typeof PDA_storage!=='undefined'&&PDA_storage&&typeof PDA_storage.get==='function'"));
assert(!/factionInventory|marketPulseDemand|MM_Faction_Armory|armory-acquisition-request/i.test(pdaAdapterSource),'PDA adapter must not define private-product state or protocols');

const pdaBuilder=fs.readFileSync(__dirname+'/build_pda_bundle.py','utf8');
assert(pdaBuilder.includes('def replace_once('));
assert(pdaBuilder.includes('("Market Pulse engine (bundled)", PULSE)'));
assert(pdaBuilder.includes('"MMTornMarketPulse"'));
assert(pdaBuilder.includes('default=23'));
assert(pdaBuilder.includes('f"v{base_version}"'));
assert(pdaBuilder.includes('f"v{pda_version}"'));
assert(!pdaBuilder.includes('PROFIT / RANKED / TRAVEL'));
assert(pdaBuilder.includes('PDA cross-origin Travel storage'));
assert(pdaBuilder.includes("const __MM_PDA_API_KEY='###PDA-APIKEY###';"));


const liveSource=fs.readFileSync(__dirname+'/MM_Acquisitions.live.js','utf8');
new Function(liveSource);
assert(liveSource.includes('function resolveProcurementItemId'));
assert(liveSource.includes('async function procurementSourceOptions'));
assert(liveSource.includes('async function routeProcurementRequest'));
assert(liveSource.includes("source:'Bazaar'"));
assert(liveSource.includes('function canonicalRankedSource'));
assert(liveSource.includes("lowestSource:Number(row?.lowest_price || 0)>0?'Bazaar':'Unknown'"));
assert(liveSource.includes('TornW3B Bazaar + Item Market + Auction APIs'));
assert(liveSource.includes('function selectedItemExitEvidence'));
assert(liveSource.includes("source:'Bazaar aggregate'"));
assert(liveSource.includes("source:'Overseas'"));
assert(liveSource.includes('priceKnown:Number(bestTravel.shopCost||0)>0'));
assert(liveSource.includes('travelEvidence:true'));
assert(liveSource.includes('aggregateBazaarLow*1.35'));
assert(!liveSource.includes("route:'Live snapshot'"));
assert(liveSource.includes("const itemMarketAsk=Math.max(0,Number(snap?.itemMarket?.lowest||0));"));
assert(liveSource.includes("const itemMarketNet=Math.floor(itemMarketAsk*(1-ITEM_MARKET_FEE_RATE));"));
assert(liveSource.includes("source:'Item Market'"));
assert(liveSource.includes("source:'Overseas'"));
assert(liveSource.includes("reason:'overseas-recommended'"));
assert(liveSource.includes("reason:verificationWarnings.length?'live-verification-unavailable'"));
assert(liveSource.includes('ITEM_MARKET_RECENT_REUSE_MS = 2500'));
assert(liveSource.includes('function recentItemMarketSnapshot'));
assert(liveSource.includes('async function verifyItemMarket'));
assert(liveSource.includes('let verifiedItemMarketSnapshot=null;'));
assert(liveSource.includes("verificationWarnings.push({source:'Item Market'"));
assert(liveSource.includes("message:String(error?.message||error||'verification failed')"));
assert(liveSource.includes('function normalizeTornCatalog'));
assert(liveSource.includes('async function refreshItemCatalog'));
assert(liveSource.includes("source:'Torn Shop'"));
assert(liveSource.includes("reason:'shop-recommended'"));
assert(liveSource.includes('async function refreshPricelist'));
assert(liveSource.includes('async function refreshRankedLive'));
assert(liveSource.includes('async function refreshRankedHistory'));
assert(liveSource.includes("'/ranked-weapons'"));
assert(liveSource.includes("'/auction/listings'"));
assert(liveSource.includes("'/auctionhouse?limit=100"));
assert(liveSource.includes('TornW3B Pricelist API'));
assert(liveSource.includes('Torn API finished Auction House'));

const userSourceStandalone=fs.readFileSync(__dirname+'/MM_Acquisitions.user.js','utf8');
new Function(userSourceStandalone);
assert(userSourceStandalone.includes('// @version      8.0.0-alpha.36'));
assert(!/armory/i.test(userSourceStandalone),'desktop Acquisitions must contain no Armory-specific UI/protocol plumbing');
assert(!userSourceStandalone.includes('factionInventory'));
assert(!userSourceStandalone.includes('marketPulseDemand'));
assert(!userSourceStandalone.includes('MM_Faction_Armory'));
assert(userSourceStandalone.includes('MM_Acquisitions.live.js'));
assert(userSourceStandalone.includes("if(type!=='state-updated')return;"));
assert(userSourceStandalone.includes("requestKind:'inventory-restock'"));
assert(userSourceStandalone.includes('Inventory Restock Demand'));
assert(userSourceStandalone.includes('data-inventory-restock-id'));
assert(userSourceStandalone.includes("requestLabel=inventoryRestock?'Inventory restock request':'Procurement request'"));
assert(userSourceStandalone.includes('Compare Sources'));
assert(userSourceStandalone.includes('Find Best Source'));
assert(userSourceStandalone.includes('Final purchase remains manual.'));
assert(userSourceStandalone.includes('GO TO TRAVEL AGENCY'));
assert(userSourceStandalone.includes('https://www.torn.com/travelagency.php'));
console.log('MM_Acquisitions standalone procurement routing regression: PASS');

const normalizedUserSource=userSource.replace(/\r\n/g,'\n');
const bridgeStart=normalizedUserSource.indexOf('  function platformGetRequest(options){');
const bridgeEnd=normalizedUserSource.indexOf('\n\n  function gmText(url){',bridgeStart);
assert(bridgeStart>=0&&bridgeEnd>bridgeStart,'platformGetRequest source block must be extractable');
const bridgeSource=normalizedUserSource.slice(bridgeStart,bridgeEnd);
const bridgeContext=extra=>{
  const ctx={setTimeout,clearTimeout,queueMicrotask,Promise,String,Number,...extra};
  vm.createContext(ctx);
  vm.runInContext(bridgeSource+'\nthis.platformGetRequest=platformGetRequest;',ctx);
  return ctx;
};

(async()=>{
  let nativeCalls=0,pdaCalls=0;
  const native=bridgeContext({
    GM_xmlhttpRequest:opts=>{nativeCalls++;return {kind:'native',opts};},
    PDA_httpGet:async()=>{pdaCalls++;return {status:200,responseText:'wrong'};}
  });
  const handle=native.platformGetRequest({method:'GET',url:'https://example.invalid/native'});
  assert.strictEqual(nativeCalls,1,'native GM_xmlhttpRequest must be preferred');
  assert.strictEqual(pdaCalls,0,'PDA fallback must not run when native GM exists');
  assert.strictEqual(handle.kind,'native');

  let fallbackCalls=0;
  const fallback=bridgeContext({
    PDA_httpGet:async(url,headers)=>{
      fallbackCalls++;
      assert.strictEqual(url,'https://example.invalid/pda');
      assert.strictEqual(headers.Accept,'application/json');
      return {status:200,responseText:'{"ok":true}',responseHeaders:'content-type: application/json'};
    }
  });
  await new Promise((resolve,reject)=>{
    fallback.platformGetRequest({
      method:'GET',
      url:'https://example.invalid/pda',
      headers:{Accept:'application/json'},
      timeout:1000,
      onload:r=>{try{assert.strictEqual(r.status,200);resolve();}catch(error){reject(error);}},
      onerror:reject,
      ontimeout:()=>reject(new Error('unexpected PDA fallback timeout'))
    });
  });
  assert.strictEqual(fallbackCalls,1,'PDA_httpGet fallback must fire exactly once');

  let postCalls=0;
  const getOnly=bridgeContext({PDA_httpGet:async()=>{postCalls++;return {status:200};}});
  await new Promise((resolve,reject)=>{
    getOnly.platformGetRequest({
      method:'POST',
      url:'https://example.invalid/post',
      onload:()=>reject(new Error('PDA_httpGet must not service POST')),
      onerror:r=>{try{assert.match(String(r.statusText),/GET requests only/);resolve();}catch(error){reject(error);}}
    });
  });
  assert.strictEqual(postCalls,0,'PDA_httpGet must remain GET-only');
  console.log('MM_Acquisitions PDA GET bridge behavior: PASS');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});


{
  const normalized=userSource.replace(/\r\n/g,'\n');
  const travelStart=normalized.indexOf('  function parseTravelContext(data){');
  const travelEnd=normalized.indexOf('\n\n  async function refreshTravelContext',travelStart);
  assert(travelStart>=0&&travelEnd>travelStart,'travel context functions must be extractable');
  const travelSource=normalized.slice(travelStart,travelEnd);
  const ctx={Date,String};
  vm.createContext(ctx);
  vm.runInContext('let travelContext=null;\n'+travelSource+'\nthis.parseTravelContext=parseTravelContext;this.marketNavigationBlocked=marketNavigationBlocked;this.travelContextLabel=travelContextLabel;',ctx);

  const home=ctx.parseTravelContext({profile:{status:{state:'Okay',description:'In Torn'}}});
  assert.strictEqual(home.mode,'torn');
  assert.strictEqual(ctx.marketNavigationBlocked(home),false);
  assert.strictEqual(ctx.travelContextLabel(home),'Okay');

  const traveling=ctx.parseTravelContext({profile:{status:{state:'Traveling',description:'Traveling from Torn to Mexico'}}});
  assert.strictEqual(traveling.mode,'traveling');
  assert.strictEqual(traveling.origin,'Torn');
  assert.strictEqual(traveling.destination,'Mexico');
  assert.strictEqual(ctx.marketNavigationBlocked(traveling),true);
  assert.strictEqual(ctx.travelContextLabel(traveling),'Traveling from Torn to Mexico');

  const abroad=ctx.parseTravelContext({profile:{status:{state:'Abroad',description:'In Mexico'}}});
  assert.strictEqual(abroad.mode,'abroad');
  assert.strictEqual(abroad.country,'Mexico');
  assert.strictEqual(ctx.marketNavigationBlocked(abroad),true);
  assert.match(ctx.travelContextLabel(abroad),/Mexico/);

  const unknown=ctx.parseTravelContext({});
  assert.strictEqual(unknown.mode,'unknown');
  assert.strictEqual(ctx.marketNavigationBlocked(unknown),false);
  console.log('MM_Acquisitions travel-state guard behavior: PASS');
}
