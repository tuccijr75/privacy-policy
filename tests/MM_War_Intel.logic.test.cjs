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
  assert.match(source, /result:p\.id===row\.attackerId\?row\.result:'Assist'/);
  assert.doesNotMatch(source, /sync\(true\)|sync\(false\)/);
  assert.doesNotMatch(source, /value=\"'\+esc\(state\.settings\.tornApiKey\)/);
  assert.doesNotMatch(source, /value=\"'\+esc\(state\.settings\.ffscouterKey\)/);
  assert.doesNotMatch(source, /war\?\.id\|\|state\.war\.id/);
});
