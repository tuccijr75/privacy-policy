const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const userscriptPath = path.resolve(__dirname, '..', 'MM_War_Intel.user.js');
const source = fs.readFileSync(userscriptPath, 'utf8');
const markerIndex = source.indexOf('(() => {');
assert.ok(markerIndex > 0, 'userscript runtime marker must exist');

const logicSource = source.slice(0, markerIndex);
const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
};
vm.createContext(sandbox);
vm.runInContext(logicSource, sandbox, { filename: 'MM_War_Intel.user.js' });
const logic = sandbox.module.exports;

function member(id, options = {}) {
  return {
    id: String(id),
    name: options.name || 'P' + id,
    level: options.level || 50,
    status: {
      state: options.state || 'Okay',
      until: null,
    },
    last_action: {
      status: options.lastActionStatus || '',
      timestamp: options.lastActionAt ?? 1000,
      relative: '',
    },
    lifeCurrent: options.lifeCurrent ?? null,
    lifeMaximum: options.lifeMaximum ?? null,
    lifeFetchedAt: options.lifeFetchedAt ?? null,
  };
}

function intel(bsEstimate, source = 'premium', lastUpdated = 990) {
  return {
    bs_estimate: bsEstimate,
    source,
    last_updated: lastUpdated,
    premium_insights_available: source === 'premium',
    distribution: null,
  };
}

function attack(input) {
  return {
    attackId: input.attackId,
    code: input.code || '',
    attackerId: String(input.attackerId),
    defenderId: String(input.defenderId),
    attackerName: '',
    defenderName: '',
    result: input.result || '',
    damage: input.damage || 0,
    hits: input.hits || 0,
    misses: input.misses || 0,
    groupModifier: input.groupModifier || 1,
    group: input.group === true,
    rankedWar: true,
    started: input.started || 0,
    ended: input.ended || 0,
  };
}

test('explicit Torn activity state overrides timestamp inference', () => {
  assert.equal(logic.activityBand(member(1, { lastActionStatus: 'Offline', lastActionAt: 999 }), 1000), 'cold');
  assert.equal(logic.activityBand(member(1, { lastActionStatus: 'Online', lastActionAt: 1 }), 1000), 'active');
  assert.equal(logic.activityBand(member(1, { lastActionStatus: 'Idle', lastActionAt: 999 }), 1000), 'warm');
});

test('attack history deduplicates participant evidence and stays bounded', () => {
  const rows = logic.mergeAttackHistory([], [
    attack({ attackId: '10', attackerId: 1, defenderId: 2, damage: 100, ended: 10 }),
    attack({ attackId: '10', attackerId: 1, defenderId: 2, damage: 125, ended: 10 }),
    attack({ attackId: '11', attackerId: 3, defenderId: 2, damage: 200, ended: 11, group: true, groupModifier: 1.5 }),
  ], 10);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].attackId, '11');
  assert.equal(rows[1].damage, 125);
});

test('group assists do not become solo proof or losses', () => {
  const summary = logic.matchupSummary([
    attack({ attackId: 'g1', attackerId: 1, defenderId: 9, result: 'Assist', damage: 500, group: true, groupModifier: 1.5, ended: 999 }),
    attack({ attackId: 'g2', attackerId: 1, defenderId: 9, result: 'Assist', damage: 550, group: true, groupModifier: 1.5, ended: 1000 }),
  ], '1', '9');
  assert.equal(summary.groupAttacks, 2);
  assert.equal(summary.soloAttempts, 0);
  assert.equal(summary.soloWins, 0);
  assert.equal(summary.losses, 0);
});

test('group-assisted enemy win remains distinct from solo threat', () => {
  const assessment = logic.threatAgainstMember({
    ownMember: member(10),
    enemyMember: member(20, { lastActionStatus: 'Online', lastActionAt: 999 }),
    ownIntel: intel(1000000),
    enemyIntel: intel(1000000),
    attacks: [
      attack({ attackId: 'risk', attackerId: 20, defenderId: 10, result: 'Hospitalized', group: true, groupModifier: 1.5, ended: 999 }),
    ],
    nowSeconds: 1000,
  });
  assert.ok(assessment.reasons.includes('recent-observed-enemy-group-win'));
  assert.equal(assessment.reasons.includes('recent-observed-enemy-solo-win'), false);
  assert.equal(assessment.recommendHospitalization, false);
});

test('proven solo history can recommend solo', () => {
  const rec = logic.targetRecommendation({
    target: member(9, { lastActionStatus: 'Online' }),
    attackers: [member(1, { lastActionStatus: 'Online' })],
    intelById: { '1': intel(2000000), '9': intel(1000000) },
    attacks: [
      attack({ attackId: 's1', attackerId: 1, defenderId: 9, result: 'Hospitalized', ended: 998 }),
      attack({ attackId: 's2', attackerId: 1, defenderId: 9, result: 'Hospitalized', ended: 999 }),
    ],
    nowSeconds: 1000,
  });
  assert.equal(rec.mode, 'solo');
  assert.equal(rec.suggestedCount, 1);
});

test('offline own members are excluded from group recommendations', () => {
  const rec = logic.targetRecommendation({
    target: member(9, { lastActionStatus: 'Online' }),
    attackers: [
      member(1, { lastActionStatus: 'Online' }),
      member(2, { lastActionStatus: 'Offline' }),
    ],
    intelById: {},
    attacks: [],
    nowSeconds: 1000,
  });
  assert.equal(rec.mode, 'hold');
  assert.deepEqual(Array.from(rec.candidates, x => x.member.id), ['1']);
});

test('fresh life plus participant damage can size a group', () => {
  const rec = logic.targetRecommendation({
    target: member(9, { lastActionStatus: 'Online', lifeCurrent: 900, lifeMaximum: 1000, lifeFetchedAt: 995 }),
    attackers: [
      member(1, { lastActionStatus: 'Online' }),
      member(2, { lastActionStatus: 'Idle' }),
      member(3, { lastActionStatus: 'Online' }),
    ],
    intelById: {},
    attacks: [
      attack({ attackId: 'a1', attackerId: 1, defenderId: 9, result: 'Assist', damage: 600, group: true, groupModifier: 1.5, ended: 990 }),
      attack({ attackId: 'a2', attackerId: 2, defenderId: 9, result: 'Assist', damage: 500, group: true, groupModifier: 1.5, ended: 990 }),
      attack({ attackId: 'a3', attackerId: 3, defenderId: 9, result: 'Assist', damage: 100, group: true, groupModifier: 1.5, ended: 990 }),
    ],
    nowSeconds: 1000,
  });
  assert.equal(rec.mode, 'group');
  assert.equal(rec.suggestedCount, 2);
  assert.equal(rec.projectedDamage, 1100);
  assert.equal(rec.targetLife, 900);
});

test('stale life is not used for precise group sizing', () => {
  const rec = logic.targetRecommendation({
    target: member(9, { lastActionStatus: 'Online', lifeCurrent: 900, lifeMaximum: 1000, lifeFetchedAt: 800 }),
    attackers: [
      member(1, { lastActionStatus: 'Online' }),
      member(2, { lastActionStatus: 'Idle' }),
    ],
    intelById: {},
    attacks: [
      attack({ attackId: 'a1', attackerId: 1, defenderId: 9, result: 'Assist', damage: 600, group: true, groupModifier: 1.5, ended: 990 }),
      attack({ attackId: 'a2', attackerId: 2, defenderId: 9, result: 'Assist', damage: 500, group: true, groupModifier: 1.5, ended: 990 }),
    ],
    nowSeconds: 1000,
  });
  assert.equal(rec.targetLife, null);
  assert.equal(rec.reason, 'no-proven-safe-solo-matchup');
});

test('energy regeneration model distinguishes subscriber/donator from standard', () => {
  const subscriber = logic.recentAttackLoad([
    attack({ attackId: 'e1', attackerId: 9, defenderId: 1, ended: 1000 }),
    attack({ attackId: 'e2', attackerId: 9, defenderId: 2, ended: 1600 }),
  ], '9', 2200, 3600, { donatorStatusKnown: true, donatorStatus: 'Subscriber' });
  const standard = logic.recentAttackLoad([
    attack({ attackId: 'e1', attackerId: 9, defenderId: 1, ended: 1000 }),
    attack({ attackId: 'e2', attackerId: 9, defenderId: 2, ended: 1600 }),
  ], '9', 2200, 3600, { donatorStatusKnown: true, donatorStatus: null });
  assert.equal(subscriber.regen.tickSeconds, 600);
  assert.equal(subscriber.regen.naturalCap, 150);
  assert.equal(subscriber.potentialNaturalRegen, 10);
  assert.equal(subscriber.netObservedPressure, 40);
  assert.equal(subscriber.assumedNaturalEnergy, 110);
  assert.equal(standard.regen.tickSeconds, 900);
  assert.equal(standard.regen.naturalCap, 100);
  assert.equal(standard.potentialNaturalRegen, 5);
  assert.equal(standard.netObservedPressure, 45);
  assert.equal(standard.assumedNaturalEnergy, 55);
});

test('unknown donator status never fabricates enemy regeneration', () => {
  const load = logic.recentAttackLoad([
    attack({ attackId: 'e1', attackerId: 9, defenderId: 1, ended: 1000 }),
  ], '9', 1500, 3600, null);
  assert.equal(load.regen.known, false);
  assert.equal(load.potentialNaturalRegen, null);
  assert.equal(load.netObservedPressure, null);
});

test('solo recommendation conserves stronger attackers when a weaker safe fit exists', () => {
  const rec = logic.targetRecommendation({
    target: member(9, { lastActionStatus: 'Online' }),
    attackers: [
      member(1, { name: 'Very Strong', lastActionStatus: 'Online' }),
      member(2, { name: 'Safe Fit', lastActionStatus: 'Online' }),
    ],
    intelById: {
      '1': intel(5000000),
      '2': intel(1500000),
      '9': intel(1000000),
    },
    attacks: [],
    nowSeconds: 1000,
  });
  assert.equal(rec.mode, 'solo');
  assert.equal(rec.candidates[0].member.id, '2');
});

test('assignment plan never assigns one faction member to multiple targets', () => {
  const plan = logic.assignmentPlan({
    targets: [
      member(9, { name: 'Target A', lastActionStatus: 'Online' }),
      member(10, { name: 'Target B', lastActionStatus: 'Online' }),
    ],
    attackers: [
      member(1, { name: 'Attacker A', lastActionStatus: 'Online' }),
      member(2, { name: 'Attacker B', lastActionStatus: 'Online' }),
    ],
    intelById: {
      '1': intel(3000000),
      '2': intel(2500000),
      '9': intel(1000000),
      '10': intel(1000000),
    },
    lifeById: {},
    attacks: [],
    claimsByTarget: {},
    completedTargets: {},
    nowSeconds: 1000,
  });
  const assigned = Array.from(plan.rows.flatMap(row => row.assigned.map(x => String(x.member.id))));
  assert.equal(new Set(assigned).size, assigned.length);
});

test('locked assignments reserve members before automatic matching', () => {
  const plan = logic.assignmentPlan({
    targets: [
      member(9, { name: 'Target A', lastActionStatus: 'Online' }),
      member(10, { name: 'Target B', lastActionStatus: 'Online' }),
    ],
    attackers: [
      member(1, { name: 'Locked Member', lastActionStatus: 'Online' }),
      member(2, { name: 'Free Member', lastActionStatus: 'Online' }),
    ],
    intelById: {
      '1': intel(4000000),
      '2': intel(3000000),
      '9': intel(1000000),
      '10': intel(1000000),
    },
    lifeById: {},
    attacks: [],
    claimsByTarget: {},
    completedTargets: {},
    lockedAssignments: { '10': ['1'] },
    nowSeconds: 1000,
  });
  const locked = plan.rows.find(row => row.target.id === '10');
  assert.equal(locked.source, 'locked');
  assert.deepEqual(Array.from(locked.assigned, x => x.member.id), ['1']);
  const otherIds = plan.rows
    .filter(row => row.target.id !== '10')
    .flatMap(row => row.assigned.map(x => x.member.id));
  assert.equal(otherIds.includes('1'), false);
});

test('lock on unavailable target does not strand its attacker', () => {
  const plan = logic.assignmentPlan({
    targets: [
      member(9, { name: 'Hospitalized', state: 'Hospital', lastActionStatus: 'Online' }),
      member(10, { name: 'Live Target', lastActionStatus: 'Online' }),
    ],
    attackers: [
      member(1, { name: 'Reusable', lastActionStatus: 'Online' }),
    ],
    intelById: {
      '1': intel(3000000),
      '9': intel(1000000),
      '10': intel(1000000),
    },
    lifeById: {},
    attacks: [],
    claimsByTarget: {},
    completedTargets: {},
    lockedAssignments: { '9': ['1'] },
    nowSeconds: 1000,
  });
  const live = plan.rows.find(row => row.target.id === '10');
  assert.ok(live);
  assert.deepEqual(Array.from(live.assigned, x => x.member.id), ['1']);
});

test('blocked attackers are excluded from assignment plan', () => {
  const plan = logic.assignmentPlan({
    targets: [member(9, { lastActionStatus: 'Online' })],
    attackers: [
      member(1, { lastActionStatus: 'Online' }),
      member(2, { lastActionStatus: 'Online' }),
    ],
    blockedAttackerIds: ['1'],
    intelById: {
      '1': intel(5000000),
      '2': intel(3000000),
      '9': intel(1000000),
    },
    lifeById: {},
    attacks: [],
    claimsByTarget: {},
    completedTargets: {},
    nowSeconds: 1000,
  });
  const assigned = plan.rows.flatMap(row => row.assigned.map(x => String(x.member.id)));
  assert.equal(assigned.includes('1'), false);
});

test('loss recovery advice uses matchup evidence for medkit versus ipecac guidance', () => {
  const close = logic.lossRecoveryAdvice({
    attack: attack({ attackId: 'l1', attackerId: 1, defenderId: 9, result: 'Lost', hits: 6, misses: 4 }),
    intelById: { '1': intel(900000), '9': intel(1000000) },
  });
  const bad = logic.lossRecoveryAdvice({
    attack: attack({ attackId: 'l2', attackerId: 1, defenderId: 9, result: 'Lost', hits: 1, misses: 9 }),
    intelById: { '1': intel(300000), '9': intel(1000000) },
  });
  assert.equal(close.action, 'medkit');
  assert.equal(bad.action, 'ipecac');
});

test('sanitized export removes both stored API keys', () => {
  const clean = logic.sanitizeState({
    settings: { tornApiKey: 'ABCDEFGHIJKLMNOP', ffscouterKey: '1234567890ABCDEF', enemyFactionId: '5' },
  });
  assert.equal('tornApiKey' in clean.settings, false);
  assert.equal('ffscouterKey' in clean.settings, false);
  assert.equal(clean.settings.enemyFactionId, '5');
});

test('runtime source enforces bounded collectors and does not echo keys into DOM', () => {
  assert.match(source, /MAX_ATTACK_PAGES=3/);
  assert.match(source, /LEASE_MS=45000/);
  assert.match(source, /REQUEST_TIMEOUT_MS=10000/);
  assert.match(source, /OUTCOME_POLL_MS=12000/);
  assert.match(source, /ATTACK_ENERGY_COST=25/);
  assert.match(source, /donator_status/);
  assert.match(source, /user\/bars/);
  assert.match(source, /watchOutcomes\(\)/);
  assert.match(source, /assignmentPlan/);
  assert.match(source, /mmi-copy-plan/);
  assert.match(source, /data-ready/);
  assert.match(source, /data-lock/);
  assert.match(source, /lockedAssignments/);
  assert.match(source, /assumedNaturalEnergy/);
  assert.match(source, /profileFetchedAt/);
  assert.match(source, /attackLogCodes/);
  assert.match(source, /state\.fetch\.attackLogCodes=\[\.\.\.seenCodes\]\.slice\(-1000\)/);
  assert.doesNotMatch(source, /new Set\(state\.attacks\.map\(x=>x\.code\)/);
  assert.match(source, /clearInterval\(outcomeTicker\)/);
  assert.match(source, /Promise\.allSettled\(toRead\.map/);
  assert.match(source, /Promise\.allSettled\(due\.map/);
  assert.match(source, /renewLease\(\)/);
  assert.match(source, /Roster loaded · enriching…/);
  assert.match(source, /RUNTIME_KEY='__MMWarIntelRuntimeV1'/);
  assert.match(source, /purgeStaleUi\(\)/);
  assert.match(source, /hidden style="display:none"/);
  assert.match(source, /mmi-minimize/);
  assert.match(source, /setPanelOpen\(false\);render\(\);/);
  assert.match(source, /if\(!ui\)return;renderStatus/);
  assert.match(source, /result:p\.id===row\.attackerId\?row\.result:'Assist'/);
  assert.doesNotMatch(source, /ui\.panel\.hidden=!ui\.panel\.hidden/);
  assert.doesNotMatch(source, /if\(!ui\|\|ui\.panel\.hidden\)return/);
  assert.doesNotMatch(source, /sync\(true\)|sync\(false\)/);
  assert.doesNotMatch(source, /value=\"'\+esc\(state\.settings\.tornApiKey\)/);
  assert.doesNotMatch(source, /value=\"'\+esc\(state\.settings\.ffscouterKey\)/);
  assert.doesNotMatch(source, /war\?\.id\|\|state\.war\.id/);
});
