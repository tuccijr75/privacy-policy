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

assert(desktop.includes('// @version      8.0.0-alpha.22'));
const requireLines=desktop.split(/\r?\n/).filter(line=>line.startsWith('// @require'));
assert.strictEqual(requireLines.length,6,'desktop dependency count');
assert(requireLines.some(line=>line.includes('/MM_Acquisitions.market-pulse.js')),'desktop must require Market Pulse');
for(const line of requireLines){
  assert(!line.includes('raw.githubusercontent.com'),'production-style dependency metadata must not use raw.githubusercontent.com');
  const match=line.match(/cdn\.jsdelivr\.net\/gh\/tuccijr75\/privacy-policy@([0-9a-f]{40})\//i);
  assert(match,'MM-owned desktop dependencies must use immutable full-SHA jsDelivr URLs');
}

assert(pda.includes('// @version      8.0.0-alpha.22-pda.9'));
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
assert(builder.includes('default=9'));
assert(builder.includes('MM_Acquisitions.market-pulse.js'));

for(const re of [
  /\bsellerId\b/i,/\bsellerName\b/i,/\blast_action\b/i,/\battackability\b/i,
  /\bmugReturn\b/i,/\bwinProbability\b/i,/\bverifiedTargets\b/i,/\battackUrl\b/i
])assert(!re.test(pulse),'Market Pulse source must not contain forbidden seller/attack-target logic: '+re);

assert(!/globalThis\.__MM_PDA_API_KEY|window\.__MM_PDA_API_KEY/.test(pda),'PDA injected API key must remain lexical');
assert(pda.includes("const __MM_PDA_API_KEY='###PDA-APIKEY###';"),'PDA lexical key placeholder must remain present');
assert(desktop.includes('Movement = quantity disappearing'),'desktop must explain Pulse movement semantics');
assert(desktop.includes('not a confirmed player sale'),'desktop must not present Pulse as confirmed sales');
assert(desktop.includes('Official Torn API finished Auction House records'),'desktop must expose official verified-sales evidence');
assert(desktop.includes('href="#mm-acq-verified-sales"'),'verified-sales evidence must be directly reachable in-panel');
assert(!desktop.includes('torn.marches.cafe'),'verified-sales evidence must not add a third-party market trust surface');
assert(desktop.includes('Complete the purchase manually on Torn.')||desktop.includes('final purchase manual'),'desktop manual purchase boundary must remain explicit');
assert(pda.includes('Complete the purchase manually on Torn.')||pda.includes('final purchase manual'),'PDA manual purchase boundary must remain explicit');
assert(acceptance.includes('8.0.0-alpha.22'),'acceptance sheet must match desktop candidate');
assert(acceptance.includes('8.0.0-alpha.22-pda.9'),'acceptance sheet must match PDA candidate');
assert(acceptance.includes('Verified Sales'),'acceptance sheet must cover official completed-sale evidence');
assert(acceptance.includes('Cross-tab ownership'),'acceptance sheet must cover one-engine lease behavior');
assert(acceptance.includes('manual-action boundary'),'acceptance sheet must preserve manual final actions');
assert(acceptance.includes('After Acquisitions Market Pulse is proven'),'downstream consumers must remain gated on proof');

console.log('MM_Acquisitions Market Pulse source/PDA contract tests: PASS');
