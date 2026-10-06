const fs=require('fs');const assert=require('assert');

const logicSrc=fs.readFileSync(__dirname+'/MM_Acquisitions.logic.js','utf8');
const userSrc=fs.readFileSync(__dirname+'/MM_Acquisitions.user.js','utf8');
const pdaSrc=fs.readFileSync(__dirname+'/MM_Acquisitions.pda.user.js','utf8');
const buildSrc=fs.readFileSync(__dirname+'/build_pda_bundle.py','utf8');

assert.doesNotThrow(()=>new Function(logicSrc));
assert.doesNotThrow(()=>new Function(userSrc));
assert.doesNotThrow(()=>new Function(pdaSrc));

assert(userSrc.includes('@version      8.0.0-alpha.32'));
assert(userSrc.includes('@81072278d4201b7cc54d42144441c1edf459c37b/modular-suite/acquisitions/MM_Acquisitions.logic.js'),'desktop must pin the exact alpha.32 logic commit');

assert(logicSrc.includes("const rawBazaarBuy=Math.max(0,Number(base?.lowestPrice||0));"));
assert(logicSrc.includes("const bazaarBuy=!freshness.stale?rawBazaarBuy:0;"),'stale Bazaar aggregate must be excluded from buy evidence');
assert(logicSrc.includes("const itemMarketAsk=itemMarketFresh?Math.max(0,Number(snap?.itemMarket?.lowest||0)):0;"),'stale Item Market must be excluded from buy evidence');
assert(logicSrc.includes("{source:'Bazaar observed',price:bazaarBuy"));
assert(logicSrc.includes("{source:'Item Market',price:itemMarketAsk"));
assert(logicSrc.includes("rawBazaarPrice:rawBazaarBuy"));
assert(logicSrc.includes("bazaarLivePrice:bazaarBuy"));
assert(logicSrc.includes("buySource:String(buy.source||'Unknown')"));

assert(userSrc.includes("const bazaarPrice=Math.max(0,Number(model?.bazaarLivePrice||0));"),'Pricelist UI must consume freshness-filtered Bazaar evidence');
assert(userSrc.includes("const itemMarketPrice=Math.max(0,Number(model?.itemMarketLivePrice||0));"),'Pricelist UI must consume freshness-filtered Item Market evidence');
assert(userSrc.includes("Date.now()-travelEvidenceMs<=TRAVEL_STALE_MS"),'Pricelist Travel evidence must respect the existing Acquisitions stale cutoff');
assert(userSrc.includes("(stale ignored)"),'rejected cached evidence must remain visible diagnostically');
assert(userSrc.includes("Best fresh cache"),'screening price must be labeled as cached rather than exact-live');
assert(userSrc.includes("Cached prices are screening evidence only. Check Prices re-verifies the source before routing; final purchase remains manual."));
assert(!userSrc.includes("Cheapest now <b>"),'stale/unverified cache must not be represented as cheapest now');
assert(!userSrc.includes(">Lowest current price</option>"),'sort label must not imply unbounded current evidence');

assert(pdaSrc.includes('@version      8.0.0-alpha.32-pda.19'));
assert(!pdaSrc.slice(0,pdaSrc.indexOf('// ==/UserScript==')).includes('@require'),'PDA metadata must remain self-contained');
assert(pdaSrc.includes('const bazaarBuy=!freshness.stale?rawBazaarBuy:0;'),'PDA bundle must embed the freshness-fixed logic');
assert(pdaSrc.includes('Best fresh cache'),'PDA bundle must embed the freshness-aware pricelist UI');
assert(pdaSrc.includes("const __MM_PDA_API_KEY='###PDA-APIKEY###';"),'PDA bundle must preserve lexical key injection token');
assert(!pdaSrc.includes('globalThis.__MM_PDA_API_KEY'),'PDA key must never be exposed on globals');
assert(buildSrc.includes('parser.add_argument("--pda-revision", type=int, default=19)'),'default PDA build must reproduce pda.19');

console.log('MM_Acquisitions alpha.32 pricelist freshness/source regressions: PASS');
