const fs=require('fs');const vm=require('vm');const assert=require('assert');
const path=require('path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');

const desktop=read('MM_Acquisitions.user.js');
const pda=read('MM_Acquisitions.pda.user.js');
const pulse=read('MM_Acquisitions.market-pulse.js');
const logic=read('MM_Acquisitions.logic.js');
const live=read('MM_Acquisitions.live.js');
const ranked=read('MM_Acquisitions.ranked.logic.js');
const builder=read('build_pda_bundle.py');
const acceptance=read('ACCEPTANCE.md');

for(const [name,source] of [
  ['desktop',desktop],['pda',pda],['pulse',pulse],['logic',logic],['live',live],['ranked',ranked]
])assert.doesNotThrow(()=>new vm.Script(source,{filename:name+'.js'}),name+' must parse');

assert(desktop.includes('// @version      8.0.0-alpha.26'));
const requireLines=desktop.split(/\r?\n/).filter(line=>line.startsWith('// @require'));
assert.strictEqual(requireLines.length,6,'desktop dependency count');
assert(requireLines.some(line=>line.includes('/MM_Acquisitions.market-pulse.js')),'desktop must require Market Pulse');
for(const line of requireLines){
  assert(!line.includes('raw.githubusercontent.com'),'production-style dependency metadata must not use raw.githubusercontent.com');
  const match=line.match(/cdn\.jsdelivr\.net\/gh\/tuccijr75\/privacy-policy@([0-9a-f]{40})\//i);
  assert(match,'MM-owned desktop dependencies must use immutable full-SHA jsDelivr URLs');
}

assert(pda.includes('// @version      8.0.0-alpha.26-pda.13'));
const pdaHeader=pda.slice(0,pda.indexOf('// ==/UserScript=='));
assert(!pdaHeader.includes('@require'),'PDA metadata must contain no @require');
for(const token of [
  '/* ===== Market Pulse engine (bundled) ===== */','MMTornMarketPulse','MMTornAcquisitionsLogic',
  'MMTornAcquisitionsLive','MMTornRankedProfitLogic','MMTornAcquisitionLedger','PDA_storage','PDA_httpGet'
])assert(pda.includes(token),'PDA bundle missing '+token);
const sectionOrder=[
  'MM Torn Core (bundled)','TornPDA platform/state adapter','Market Pulse engine (bundled)',
  'Acquisitions logic (bundled)','Acquisitions live service (bundled)','Ranked profit logic (bundled)','Purchase ledger logic (bundled)','Acquisitions UI'
].map(token=>pda.indexOf('===== '+token+' ====='));
for(let i=0;i<sectionOrder.length;i++)assert(sectionOrder[i]>=0,'PDA section missing at index '+i);
for(let i=1;i<sectionOrder.length;i++)assert(sectionOrder[i]>sectionOrder[i-1],'PDA dependency order must be preserved');

assert(builder.includes('("Market Pulse engine (bundled)", PULSE)'));
assert(builder.includes('"MMTornMarketPulse"'));
assert(builder.includes('default=13'));
assert(builder.includes('MM_Acquisitions.market-pulse.js'));

for(const re of [
  /\bsellerId\b/i,/\bsellerName\b/i,/\blast_action\b/i,/\battackability\b/i,
  /\bmugReturn\b/i,/\bwinProbability\b/i,/\bverifiedTargets\b/i,/\battackUrl\b/i
])assert(!re.test(pulse),'Market Pulse source must not contain forbidden seller/attack-target logic: '+re);

assert(!/globalThis\.__MM_PDA_API_KEY|window\.__MM_PDA_API_KEY/.test(pda),'PDA injected API key must remain lexical');
assert(pda.includes("const __MM_PDA_API_KEY='###PDA-APIKEY###';"),'PDA lexical key placeholder must remain present');
assert(desktop.includes('Market activity:'),'desktop must explain market activity in plain language');
assert(desktop.includes('not a confirmed individual sale'),'desktop must not present market activity as confirmed sales');
assert(desktop.includes('Official Torn API finished Auction House records'),'desktop must expose official verified-sales evidence');
assert(desktop.includes('href="#mm-acq-verified-sales"'),'verified-sales evidence must be directly reachable in-panel');
assert(desktop.includes("let activeView='pricelist'"),'desktop must start on the customer Pricelist workflow');
assert(desktop.includes('What do the main terms mean?'),'desktop must include plain-language help');
assert(desktop.includes('WHERE DO YOU WANT TO BUY?'),'item results must make destination choice explicit');
assert(desktop.includes('Customer Pricelist'),'desktop must expose the pricelist as a primary workflow');
assert(desktop.includes('data-acq-view="pricelist"')&&desktop.includes('data-acq-view="ranked"')&&desktop.includes('data-acq-view="more"'),'top-level navigation must stay focused on Pricelist / Ranked / More');
assert(!desktop.includes('data-acq-view="home"'),'Home must not return as a competing primary workflow');
assert(desktop.includes('capturePanelUiState(root);')&&desktop.includes('restorePanelUiState(root);'),'desktop must preserve expanded/collapsed section state across rerenders');
assert(desktop.includes("PANEL_OPEN_KEY='mm_acquisitions_panel_open_v1'"),'desktop must persist panel-open state across Torn navigation');
assert(desktop.includes('GO TO BAZAAR')&&desktop.includes('GO TO ITEM MARKET'),'desktop must use explicit destination labels');
assert(desktop.includes('GO TO BAZAAR')&&desktop.includes('GO TO ITEM MARKET'),'desktop must expose direct market alternatives for travel items');
assert(!desktop.includes('torn.marches.cafe'),'verified-sales evidence must not add a third-party market trust surface');
assert(desktop.includes('Complete the purchase manually on Torn.')||desktop.includes('final purchase manual'),'desktop manual purchase boundary must remain explicit');
assert(pda.includes('Complete the purchase manually on Torn.')||pda.includes('final purchase manual'),'PDA manual purchase boundary must remain explicit');
assert(acceptance.includes('8.0.0-alpha.26'),'acceptance sheet must match desktop candidate');
assert(acceptance.includes('8.0.0-alpha.26-pda.13'),'acceptance sheet must match PDA candidate');
assert(acceptance.includes('Verified Sales'),'acceptance sheet must cover official completed-sale evidence');
assert(acceptance.includes('Cross-tab ownership'),'acceptance sheet must cover one-engine lease behavior');
assert(acceptance.includes('manual-action boundary'),'acceptance sheet must preserve manual final actions');
assert(acceptance.includes('After Acquisitions Market Pulse is proven'),'downstream consumers must remain gated on proof');

console.log('MM_Acquisitions Market Pulse source/PDA contract tests: PASS');
