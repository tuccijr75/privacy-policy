'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../MM_Bounty_Hunter.user.js');
let passed = 0;
const test = (name, callback) => { callback(); ++passed; console.log('PASS', name); };
const epoch = Math.floor(Date.now() / 1000) + 3600;
const bounty = (target_id, reward, extra = {}) => ({ target_id, target_name: `User ${target_id}`, target_level: 25, reward, quantity: 1, valid_until: epoch, ...extra });

test('26 rank names including both Idolized/Idolised', () => {
  assert.equal(E.RANKS.length, 26);
  assert.equal(E.rankIndex('Idolized'), 20);
  assert.equal(E.rankIndex('Idolised'), 20);
  assert.equal(E.rankIndex('INvincible'), 25);
});
test('workbook sample Professional 31/6555/0 yields unknown? 6 triggers', () => {
  const r = E.estimateRank({ rank: 'Professional', level: 31, crimes: 6555, networth: 0 });
  assert.equal(r.breakdown.level, 5);
  assert.equal(r.breakdown.crimes, 2);
  assert.equal(r.breakdown.networth, 0);
  assert.equal(r.breakdown.battle, 7);
  assert.equal(r.status, 'inconsistent');
});
test('original guide 69/21k/5.9b Idolised => 6 triggers 250M+', () => {
  const r = E.estimateRank({ rank: 'Idolised', level: 69, crimes: 21000, networth: 5900000000 });
  assert.equal(r.breakdown.battle, 6); assert.match(r.label, /250M\+/);
});
test('example 16 triggers, level 5, crimes 2, NW 4 => 5', () => {
  const r = E.estimateRank({ rank: 'Master', level: 45, crimes: 7000, networth: 6e9 });
  assert.equal(r.breakdown.battle, 5);
});
test('input 13/5/3/2 gives 3 battle triggers', () => {
  const r = E.estimateRank({ rank: 'Highly distinguished', level: 40, crimes: 10000, networth: 250e6 });
  assert.equal(r.breakdown.battle, 3);
});
test('workbook sample Average 14/3227/7264572 => 1', () => {
  const r = E.estimateRank({ rank: 'Average', level: 14, crimes: 3227, networth: 7264572 });
  assert.equal(r.breakdown.battle, 1);
});
test('zero trigger baseline', () => {
  const r = E.estimateRank({ rank: 'Absolute beginner', level: 1, crimes: 0, networth: 0 });
  assert.equal(r.breakdown.battle, 0);
});
test('negative networth blocks confident estimate', () => {
  const r = E.estimateRank({ rank: 'Reasonable', level: 40, crimes: 100, networth: -1000 });
  assert.equal(r.status, 'unreliable'); assert.match(r.note, /Negative net worth/);
});
test('missing personal stats fail closed', () => {
  const r = E.estimateRank({ rank: 'Elite', level: 50, crimes: null, networth: 0 });
  assert.equal(r.status, 'missing');
});
test('invalid/stale reward or expiry dropped', () => {
  const rows = E.normalizeBounties({bounties:[bounty(1, 100000), bounty(2, -1), bounty(3, 33, { valid_until: 1 }), bounty(4, 100, { quantity: 0 })]});
  assert.equal(rows.length, 1); assert.equal(rows[0].id, 1);
});
test('duplicate target consolidates and max single reward does not sum', () => {
  const rows = E.normalizeBounties({bounties:[bounty(1, 100000, {quantity:2}), bounty(1, 500000, {quantity:1})]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].maxReward, 500000);
  assert.equal(rows[0].listedTotal, 700000);
  assert.equal(rows[0].listedQuantity, 3);
});
test('wrong bounty schema raises instead of silent zero', () => {
  assert.throws(() => E.normalizeBounties({unexpected:[]}), /bounties array/);
});
test('profile and popular stats parsing', () => {
  const profile = E.extractProfile({rank:'Outstanding',level:40,age:300,awards:45,status:{state:'Okay'},life:{maximum:3000}});
  assert.equal(profile.level, 40); assert.equal(profile.status, 'Okay');
  const stats = E.extractPersonalStats({personalstats:{crimes:{total:15000},networth:{total:5e8},drugs:{xanax:200,ecstasy:20,lsd:1}}});
  assert.equal(stats.crimes, 15000); assert.equal(stats.networth, 5e8); assert.equal(stats.xanax, 200);
});
test('missing API profile cannot invent rank', () => assert.equal(E.extractProfile({user:'x'}), null));
test('unknown personalstats preserved unknown', () => assert.equal(E.extractPersonalStats({personalstats:{crimes:{}}}).crimes, null));
test('classification does not invent win odds and flags hospital', () => {
  const row={maxReward:1e6,profile:{status:'Hospital',level:20,age:30},estimate:E.estimateRank({rank:'Average',level:20,crimes:100,networth:0})};
  const c=E.classify(row,30,500000);
  assert.equal(c.kind, 'unavailable'); assert.ok(c.reasons.some(s=>s.includes('Hospital')));
});
test('older low-level holder caution', () => {
  const row={maxReward:1e6,profile:{status:'Okay',level:10,age:1800},estimate:E.estimateRank({rank:'Competent',level:10,crimes:100,networth:5e7})};
  const c=E.classify(row,30,null); assert.ok(c.reasons.some(s=>s.includes('possible holder')));
});
test('sorting is immutable', () => {
  const rows=[{maxReward:100,level:5},{maxReward:200,level:10}];
  const sorted=E.sortRows(rows,'reward'); assert.equal(sorted[0].maxReward,200); assert.equal(rows[0].maxReward,100);
});
test('script metadata and prohibited background transport paths', () => {
  const src=fs.readFileSync(require.resolve('../MM_Bounty_Hunter.user.js'),'utf8');
  assert.match(src, /@match\s+https:\/\/www\.torn\.com\/bounties\.php\*/);
  assert.match(src, /@connect\s+api\.torn\.com/);
  assert.match(src, /@grant\s+GM_xmlhttpRequest/);
  assert.match(src, /@version\s+0\.1\.1-rc\.1/);
  const meta = src.split('// ==/UserScript==')[0];
  const u = meta.match(/^\/\/ @updateURL\s+(\S+)$/m)?.[1];
  const d = meta.match(/^\/\/ @downloadURL\s+(\S+)$/m)?.[1];
  assert.equal(u, 'https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Bounty_Hunter.user.js');
  assert.equal(d, u);
  assert.doesNotMatch(src, /raw\.githubusercontent\.com|@require|window\.open\(|attack\.php|\bfetch\s*\(/);
  assert.match(src, /Authorization: `ApiKey \$\{state\.key\}`/);
});
console.log(`\n${passed}/${passed} assertions suites PASS`);
