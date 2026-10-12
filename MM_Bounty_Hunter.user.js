// ==UserScript==
// @name         MM Bounty Hunter — Target Finder
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.1-rc.4
// @description  API-only Torn bounty discovery and cautious rank-trigger target assessment; no attacks or non-API automation.
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Bounty_Hunter.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Bounty_Hunter.user.js
// @author       MM Torn Systems
// @match        https://www.torn.com/bounties.php*
// @match        https://torn.com/bounties.php*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // This file is self-contained and deliberately has no external dependency.
  // Pure functions are exported ONLY in Node's test runtime, never to Torn's page globals.
  const ENGINE = (() => {
    const RANKS = [
      'Absolute beginner', 'Beginner', 'Inexperienced', 'Rookie', 'Novice',
      'Below average', 'Average', 'Reasonable', 'Above average', 'Competent',
      'Highly competent', 'Veteran', 'Distinguished', 'Highly distinguished',
      'Professional', 'Star', 'Master', 'Outstanding', 'Celebrity', 'Supreme',
      'Idolized', 'Champion', 'Heroic', 'Legendary', 'Elite', 'Invincible'
    ];
    const LEVEL_TRIGGERS = [2, 6, 11, 26, 31, 50, 71, 100];
    const CRIME_TRIGGERS = [100, 5_000, 10_000, 20_000, 30_000, 50_000];
    const NETWORTH_TRIGGERS = [5e6, 50e6, 500e6, 5e9, 50e9];
    // Official wiki gives stat *score* threshold ranges, not exact stat-total boundaries.
    // Display conservative descriptive bands using the guide's high-end estimates.
    const STAT_BANDS = [
      '<2,500 (approx.)', '2,500–25,000 (approx.)',
      '25,000–250,000 (approx.)', '250,000–2.5M (approx.)',
      '2.5M–35M (approx.)', '35M–250M (approx.)', '250M+ (open-ended)'
    ];
    const upperBounds = [2500, 25000, 250000, 2500000, 35000000, 250000000, Infinity];
    const lowerBounds = [0, 2000, 20000, 200000, 2000000, 20000000, 200000000];
    const number = v => typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
    const nonnegative = v => { const x = number(v); return x === null || x < 0 ? null : x; };
    const count = (triggers, x) => triggers.filter(n => x >= n).length;
    const rankIndex = rank => {
      if (Number.isInteger(rank) && rank >= 1 && rank <= 26) return rank - 1;
      if (typeof rank !== 'string') return -1;
      const s = rank.normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '');
      return RANKS.findIndex(r => r.toLowerCase().replace(/[^a-z]/g, '') === s ||
        (s === 'idolised' && r === 'Idolized'));
    };
    function estimateRank({ rank, level, crimes, networth }) {
      const ri = rankIndex(rank);
      const lv = nonnegative(level), cr = nonnegative(crimes), nw = number(networth);
      if (ri < 0 || lv === null || cr === null || nw === null)
        return { status: 'missing', label: 'Unknown', note: 'Rank / public crimes / net worth unavailable' };
      const l = count(LEVEL_TRIGGERS, lv), c = count(CRIME_TRIGGERS, cr), n = count(NETWORTH_TRIGGERS, nw);
      const b = ri - l - c - n;
      const breakdown = { total: ri, level: l, crimes: c, networth: n, battle: b };
      if (b < 0 || b > 6)
        return { status: 'inconsistent', label: 'Cannot estimate', breakdown, note: 'Rank-trigger mismatch: possible net-worth ghost trigger / historical evidence or stale fields' };
      if (nw < 0)
        return { status: 'unreliable', label: 'Cannot estimate', breakdown, note: 'Negative net worth makes ghost-trigger inference unreliable; obtain other evidence' };
      const warnings = [];
      if (b >= 6) warnings.push('Above 250M: rank method does not resolve strength');
      if (b < 6) warnings.push('Unbalanced stats and historic net-worth triggers may shift this band');
      return { status: 'estimated', label: STAT_BANDS[b], lower: lowerBounds[b], upper: upperBounds[b], breakdown, note: warnings.join('; ') };
    }
    function normalizeBounties(api, now = Date.now()) {
      if (!api || !Array.isArray(api.bounties)) throw Error('Bounty API response did not contain a bounties array');
      const out = new Map();
      for (const v of api.bounties) {
        if (!v || typeof v !== 'object') continue;
        const id = nonnegative(v.target_id), reward = nonnegative(v.reward),
          qty = nonnegative(v.quantity), level = nonnegative(v.target_level), until = nonnegative(v.valid_until);
        if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(reward) ||
            !Number.isSafeInteger(qty) || qty <= 0 || level === null || !Number.isInteger(level) ||
            until === null || until * 1000 <= now) continue;
        const old = out.get(id) || { id, name: '', level, maxReward: 0, listedQuantity: 0, listedTotal: 0, expiresAt: until, rows: 0 };
        old.name = (typeof v.target_name === 'string' ? v.target_name : '').slice(0, 70) || old.name || `User ${id}`;
        old.level = level;
        old.maxReward = Math.max(old.maxReward, reward);
        old.listedQuantity = Math.min(10000, old.listedQuantity + qty);
        old.listedTotal = Math.min(Number.MAX_SAFE_INTEGER, old.listedTotal + reward * qty);
        old.expiresAt = Math.min(old.expiresAt, until);
        old.rows++;
        out.set(id, old);
      }
      return [...out.values()];
    }
    // Keep live state distinct from an expired `until` timestamp. A clock reaching zero
    // is NOT evidence that Torn has changed the target to Available.
    function statusCategory(state) {
      switch (String(state || '').trim().toLowerCase()) {
        case 'okay': return 'available';
        case 'hospital': return 'hospital';
        case 'traveling': case 'travelling': case 'abroad': return 'travel';
        case 'jail': case 'federal': case 'federal jail': return 'jail';
        case '': case 'unknown': return 'unknown';
        default: return 'other';
      }
    }
    function normalizeStatus(status) {
      if (!status || typeof status !== 'object') return {
        state: 'Unknown', category: 'unknown', until: null, description: '', details: ''
      };
      const state = typeof status.state === 'string' && status.state.trim() ? status.state.slice(0, 40) : 'Unknown';
      const t = nonnegative(status.until);
      return {
        state, category: statusCategory(state),
        until: Number.isSafeInteger(t) && t > 0 ? t : null,
        description: typeof status.description === 'string' ? status.description.slice(0, 160) : '',
        details: typeof status.details === 'string' ? status.details.slice(0, 120) : ''
      };
    }
    function extractSelfId(json) {
      // Torn v2 uses player_id for the authenticated user. Preserve support for
      // explicit nested/legacy ID shapes, but fail closed on missing/invalid IDs.
      const o = json?.profile && typeof json.profile === 'object' ? json.profile : json;
      const id = nonnegative(o?.player_id ?? o?.id);
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
    function extractProfile(json) {
      // Rank is not guaranteed in every v2 profile shape. Valid status/level still matter.
      const o = json?.profile && typeof json.profile === 'object' ? json.profile : json;
      if (!o || typeof o !== 'object' || typeof o.status?.state !== 'string' || nonnegative(o.level) === null) return null;
      const st = normalizeStatus(o.status);
      return {
        rank: typeof o.rank === 'string' ? o.rank : null,
        level: nonnegative(o.level), age: nonnegative(o.age), awards: nonnegative(o.awards),
        life: nonnegative(o.life?.maximum),
        status: st.state, statusCategory: st.category, statusUntil: st.until,
        statusDescription: st.description, statusDetails: st.details,
        faction: typeof o.faction?.name === 'string' ? o.faction.name :
          (typeof o.faction?.faction_name === 'string' ? o.faction.faction_name : ''),
        lastAction: typeof o.last_action?.status === 'string' ? o.last_action.status : 'Unknown'
      };
    }
    // A fetched status becomes unknown when its explicitly recorded local TTL passes.
    // Untimestamped test/input rows are not invented as fresh observations.
    function availability(row, now = Date.now(), ttlMs = 120000) {
      if (!row?.profile) return 'unknown';
      if (Number.isFinite(row.profileFetchedAt) && (row.profileFetchedAt > now || now - row.profileFetchedAt > ttlMs)) return 'unknown';
      return statusCategory(row.profile.status);
    }
    function attackability(row) {
      const cat = availability(row);
      if (cat === 'hospital' || cat === 'jail' || cat === 'travel') return {kind:'blocked',label:'Not currently attackable by status'};
      if (cat === 'available') return {kind:'review',label:'Status okay · country and eligibility unverified'};
      return {kind:'unknown',label:'Attackability unknown; verify on Torn'};
    }
    function filterAvailability(rows, selection = 'all') {
      if (selection === 'all') return [...rows];
      return rows.filter(r => availability(r) === selection);
    }
    function formatDuration(seconds) {
      const sec = Math.max(0, Math.ceil(seconds));
      const days = Math.floor(sec / 86400), hours = Math.floor((sec % 86400) / 3600), mins = Math.floor((sec % 3600) / 60);
      if (days) return `${days}d ${hours}h`;
      if (hours) return `${hours}h ${mins}m`;
      return `${Math.max(1, mins)}m`;
    }
    function statusDisplay(row, now = Date.now()) {
      const category = availability(row), p = row?.profile;
      const label = category === 'unknown' && p ? 'STALE / UNKNOWN' : {available:'AVAILABLE',hospital:'HOSPITAL',travel:'TRAVEL / ABROAD',jail:'JAILED',other:'OTHER STATUS',unknown:'NOT CHECKED'}[category];
      const until = p?.statusUntil;
      const checked = typeof row?.profileFetchedAt === 'number' && Number.isFinite(row.profileFetchedAt) ? row.profileFetchedAt : null;
      let timing = 'Profile not checked';
      if (p) {
        if (category === 'unknown') timing = 'Status freshness expired · scan again';
        else if (category === 'available') timing = 'Available when checked — verify before acting';
        else if (until && until * 1000 > now) timing = `${formatDuration((until * 1000 - now) / 1000)} left · reported until ${new Date(until * 1000).toLocaleString()}`;
        else if (until) timing = `Reported end passed ${new Date(until * 1000).toLocaleString()} · refresh required`;
        else timing = 'No end time supplied by Torn';
      }
      return {category,label,timing,description: p?.statusDescription || '',details: p?.statusDetails || '',
        checked: checked ? `Checked locally ${new Date(checked).toLocaleTimeString()} · ${now - checked < 60_000 ? 'just now' : `${formatDuration((now - checked) / 1000)} ago`}` : 'Not checked'};
    }
    function extractPersonalStats(json) {
      const p = json?.personalstats;
      if (!p || typeof p !== 'object') return null;
      return {
        crimes: nonnegative(p.crimes?.total), networth: number(p.networth?.total),
        xanax: nonnegative(p.drugs?.xanax), ecstasy: nonnegative(p.drugs?.ecstasy),
        lsd: nonnegative(p.drugs?.lsd), attacks: nonnegative(p.attacking?.attacks?.won),
        defendsWon: nonnegative(p.attacking?.defends?.won), defendsLost: nonnegative(p.attacking?.defends?.lost),
        hits: nonnegative(p.attacking?.hits?.success), misses: nonnegative(p.attacking?.hits?.miss),
        damage: nonnegative(p.attacking?.damage?.total), energyRefills: nonnegative(p.other?.refills?.energy)
      };
    }
    // The official battle stats endpoint returns each stat as {value,modifier,modifiers}.
    // Reject lossy/inconsistent numeric data instead of manufacturing a combat advantage.
    function parseOwnBattleStats(json) {
      const b = json?.battlestats;
      if (!b || typeof b !== 'object') return null;
      const stats = {};
      for (const k of ['strength', 'speed', 'defense', 'dexterity']) {
        const raw = b[k]?.value;
        const v = typeof raw === 'number' ? raw : NaN;
        if (!Number.isSafeInteger(v) || v < 0) return null;
        stats[k] = v;
      }
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      if (!Number.isSafeInteger(total)) return null;
      if (b.total != null && (!Number.isSafeInteger(b.total) || b.total !== total)) return null;
      return { ...stats, total };
    }
    function manualBattleStats(inputs) {
      const stats = {};
      for (const k of ['strength', 'speed', 'defense', 'dexterity']) {
        const value = inputs[k];
        if (value === '' || value === null || value === undefined || !/^\d+$/.test(String(value).trim())) return null;
        const n = Number(value);
        if (!Number.isSafeInteger(n)) return null;
        stats[k] = n;
      }
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      return Number.isSafeInteger(total) ? { ...stats, total } : null;
    }
    function combatSignals(stats) {
      if (!stats) return null;
      const won = stats.defendsWon, lost = stats.defendsLost;
      const totalDefends = won != null && lost != null ? won + lost : null;
      const hitTotal = stats.hits != null && stats.misses != null ? stats.hits + stats.misses : null;
      return {
        defendRecord: totalDefends != null ? `${won}W/${lost}L (${totalDefends} observed)` : null,
        hitRate: hitTotal > 0 ? Math.round(100 * stats.hits / hitTotal) : null,
        avgDamage: stats.hits > 0 && stats.damage != null ? Math.round(stats.damage / stats.hits) : null,
        energyRefills: stats.energyRefills,
        // Defensive history is a warning, not a fighter-to-fighter success probability.
        defendWarning: totalDefends >= 20 && won / totalDefends >= 0.6
      };
    }
    function preScreenCandidates(rows, ownLevel, limit) {
      if (!Number.isInteger(limit) || limit <= 0) return [];
      const copy = [...rows].filter(r => Number.isSafeInteger(r.id) && r.id > 0);
      const gap = r => ownLevel == null ? 0 : Math.abs(r.level - ownLevel);
      const byReward = [...copy].sort((a,b) => b.maxReward - a.maxReward || a.id - b.id);
      const byLevel = [...copy].sort((a,b) => gap(a) - gap(b) || b.maxReward - a.maxReward || a.id - b.id);
      const byBalance = [...copy].sort((a,b) => (Math.log10(1 + b.maxReward)*4 - (ownLevel == null ? 0 : Math.max(0,b.level - ownLevel)*2)) - (Math.log10(1 + a.maxReward)*4 - (ownLevel == null ? 0 : Math.max(0,a.level - ownLevel)*2)) || a.id - b.id);
      // Fair discovery coverage: reward, nearby-level, and balanced cohorts;
      // overlapping IDs are counted once and unused slots are backfilled.
      const out=[], ids=new Set(), cohorts=[byReward,byLevel,byBalance];
      let i=0;
      while (out.length < Math.min(limit, copy.length) && i < copy.length) {
        for (const list of cohorts) {
          const r=list[i];
          if (r && !ids.has(r.id)) { ids.add(r.id); out.push(r); if (out.length === limit) break; }
        }
        i++;
      }
      return out;
    }
    function evidence(row, ownBattle = null, ownTotal = null) {
      const e = row.estimate;
      const total = ownBattle?.total ?? ownTotal;
      const signals = combatSignals(row.stats);
      const reasons=[];
      let category='unknown', heading='UNVERIFIED MATCHUP';
      if (total != null && Number.isFinite(total) && total > 0 && e?.status === 'estimated') {
        if (Number.isFinite(e.upper) && total >= e.upper * 4) {
          category='favorable'; heading='FAVORABLE STAT BAND';
          reasons.push('Your total exceeds 4× an inferred upper band; not verified opponent stats');
        } else if (total < e.lower) {
          category='risk'; heading='STAT BAND CAUTION';
          reasons.push('Your total is below their inferred lower band');
        } else reasons.push('Estimated stat bands overlap or are inconclusive');
      } else reasons.push('Missing your total or reliable opponent rank-trigger estimate');
      if (signals?.defendWarning) reasons.push('Many historical defensive wins; opponent selection may skew record');
      if (ownBattle) reasons.push('Your four stats known; opponent four-stat distribution unknown');
      // Never promote a target to "verified winnable" on proxy evidence alone.
      return { category, heading, reasons, signals, ownTotal: total };
    }
    function classify(row, ownLevel = null, ownStats = null) {
      const p = row.profile;
      const e = row.estimate;
      if (!p) return { kind: 'unknown', text: 'Not checked', score: -1, reasons: ['No profile assessment'] };
      const status = availability(row);
      const reasons = [];
      let score = Math.min(45, Math.max(0, Math.floor(Math.log10(Math.max(1, row.maxReward)) * 6)));
      if (status !== 'available') {
        reasons.push(`Status: ${p.status}; verify availability manually`);
        score -= 25;
      }
      if (ownLevel !== null && ownLevel !== undefined) {
        const gap = p.level - ownLevel;
        if (gap > 10) { reasons.push(`+${gap} levels above you`); score -= 20; }
        else if (gap > 0) { reasons.push(`${gap} levels above you`); score -= 8; }
        else { reasons.push(`Level ${p.level} vs yours ${ownLevel}`); score += 8; }
      }
      if (!e || e.status !== 'estimated') {
        reasons.push('Stat range unknown or inconsistent'); score -= 20;
      } else {
        if (e.breakdown.battle >= 6) { score -= 18; reasons.push('250M+ rank-trigger band'); }
        else if (ownStats !== null && ownStats !== undefined && ownStats > 0) {
          if (ownStats < e.lower) { score -= 18; reasons.push('Your total below estimated band'); }
          else if (Number.isFinite(e.upper) && ownStats >= e.upper * 4) {
            score += 15; reasons.push('Your total exceeds estimated upper band (not a win guarantee)');
          } else reasons.push('Battle-stat comparison inconclusive');
        }
      }
      if (p.age !== null && p.age > 1000 && p.level < 30) { score -= 12; reasons.push('Older, low-level: possible holder'); }
      if (p.faction) reasons.push('Faction membership: retaliation risk');
      if (row.stats?.xanax !== null && row.stats?.xanax !== undefined && row.stats.xanax > 1000) {
        score -= 10; reasons.push('High Xanax use');
      }
      const kind = status !== 'available' ? 'unavailable' : (!e || e.status !== 'estimated' || (e.breakdown.battle >= 6)) ? 'caution' : 'review';
      return { kind, score: Math.max(0, Math.round(score)), text: kind === 'review' ? 'Review manually' : (kind === 'unavailable' ? 'Currently unavailable' : 'High uncertainty'), reasons };
    }
    function sortRows(rows, sort) {
      const copy = [...rows];
      copy.sort((a, b) => {
        if (sort === 'availability') {
          const order = { available: 0, hospital: 1, travel: 2, jail: 3, other: 4, unknown: 5 };
          return order[availability(a)] - order[availability(b)] || b.maxReward - a.maxReward || a.id - b.id;
        }
        if (sort === 'statusEnd') {
          const time = r => !['available','unknown'].includes(availability(r)) && r.profile?.statusUntil > Math.floor(Date.now() / 1000) ? r.profile.statusUntil : Infinity;
          return time(a) - time(b) || b.maxReward - a.maxReward || a.id - b.id;
        }
        if (sort === 'priority') return (b.assessment?.score ?? -1) - (a.assessment?.score ?? -1) || b.maxReward - a.maxReward;
        if (sort === 'strength') return (a.estimate?.lower ?? Infinity) - (b.estimate?.lower ?? Infinity) || b.maxReward - a.maxReward;
        return b.maxReward - a.maxReward || a.level - b.level;
      });
      return copy;
    }
    return { RANKS, rankIndex, estimateRank, normalizeBounties, extractProfile, extractSelfId, extractPersonalStats,
      normalizeStatus, statusCategory, availability, attackability, filterAvailability, formatDuration, statusDisplay,
      parseOwnBattleStats, manualBattleStats, combatSignals, preScreenCandidates, evidence, classify, sortRows };
  })();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ENGINE;
    return;
  }
  if (typeof document === 'undefined' || !document.body || document.getElementById('mm-bounty-hunter-v01')) return;
  const SETTINGS = { maxPages: 3, pageSize: 100, enrich: 18, deepStats: 10, requestGapMs: 1000, cacheMs: 2 * 60e3 };
  const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';
  const money = n => `$${fmt(n)}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const state = { running: false, rows: [], nowFetched: 0, sourceTime: 0, delay: 0,
    myLevel: null, myId: null, cache: new Map(), sort: 'priority', availabilityFilter: 'all', key: '', ownBattle: null, ownBattleSource: 'none', ownBattleAt: 0, ownBattleOwnerId: null };
  const css = document.createElement('style');
  css.textContent = `
    #mm-bounty-hunter-v01{color:#e5eaf1;background:#18212d;border:1px solid #506078;border-radius:10px;margin:12px auto 18px;max-width:1050px;padding:14px;font:13px/1.45 Arial,sans-serif;box-shadow:0 7px 25px #0005;box-sizing:border-box}
    #mm-bounty-hunter-v01 *,#mm-bounty-hunter-v01 *:before{box-sizing:border-box}
    #mm-bounty-hunter-v01 h2{color:#f4f7fb;font-size:17px;margin:0}
    #mm-bounty-hunter-v01 small,#mm-bounty-hunter-v01 .sub{color:#bac7d7}
    #mm-bounty-hunter-v01 .head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    #mm-bounty-hunter-v01 .controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:12px 0}
    #mm-bounty-hunter-v01 label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#ccd5e0}
    #mm-bounty-hunter-v01 input,#mm-bounty-hunter-v01 select{min-height:33px;background:#0e1620;color:#eff5fd;border:1px solid #66768a;border-radius:5px;padding:5px 8px;font-size:13px;max-width:170px}
    #mm-bounty-hunter-v01 button{border:1px solid #7095b8;background:#264d69;color:#fff;border-radius:5px;padding:7px 10px;cursor:pointer;font-size:13px}
    #mm-bounty-hunter-v01 button:hover:not(:disabled){background:#34698f}
    #mm-bounty-hunter-v01 button:disabled{opacity:.5;cursor:default}
    #mm-bounty-hunter-v01 a{color:#92cffd;text-decoration:underline}
    #mm-bounty-hunter-v01 .msg{margin:9px 0;min-height:24px;padding:6px 9px;background:#243246;border-radius:4px;color:#e8f1fc}
    #mm-bounty-hunter-v01 .tablewrap{max-height:510px;overflow:auto}
    #mm-bounty-hunter-v01 table{border-collapse:collapse;min-width:780px;width:100%}
    #mm-bounty-hunter-v01 th,#mm-bounty-hunter-v01 td{padding:7px 8px;border-bottom:1px solid #36485c;text-align:left;vertical-align:top}
    #mm-bounty-hunter-v01 th{position:sticky;top:0;background:#26364b;color:#f4f9ff;z-index:1}
    #mm-bounty-hunter-v01 tr:hover{background:#233248}
    #mm-bounty-hunter-v01 .warn{color:#ffc58c}
    #mm-bounty-hunter-v01 .muted{color:#abb7c8}
    #mm-bounty-hunter-v01 .good{color:#b1dfc8}
    #mm-bounty-hunter-v01 .status-cell{min-width:205px}
    #mm-bounty-hunter-v01 .status-pill{display:inline-block;border:1px solid;border-radius:5px;padding:3px 9px;font-size:12px;font-weight:800;letter-spacing:.03em;line-height:1.5;white-space:nowrap}
    #mm-bounty-hunter-v01 .status-pill.available{background:#12372c;color:#c7ffe2;border-color:#4bba8a}
    #mm-bounty-hunter-v01 .status-pill.hospital{background:#47251e;color:#ffe5d5;border-color:#ec926f}
    #mm-bounty-hunter-v01 .status-pill.travel{background:#153b5a;color:#d9f1ff;border-color:#70b3ed}
    #mm-bounty-hunter-v01 .status-pill.jail{background:#49391a;color:#fff0bd;border-color:#d7b258}
    #mm-bounty-hunter-v01 .status-pill.other,#mm-bounty-hunter-v01 .status-pill.unknown{background:#30394a;color:#e5ebf3;border-color:#8996a8}
    #mm-bounty-hunter-v01 .status-time{margin-top:6px;font-weight:700;font-size:12px;line-height:1.45;color:#f3f8ff}
    #mm-bounty-hunter-v01 .status-detail{margin-top:5px;overflow-wrap:anywhere;font-size:11px;color:#bacadd}
    #mm-bounty-hunter-v01 .counts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;font-size:12px;color:#d9e5f2}
    #mm-bounty-hunter-v01 .counts span{border-radius:4px;border:1px solid #506078;padding:3px 7px}
    #mm-bounty-hunter-v01 .notes{font-size:11px;color:#c4cdda;max-width:245px}
    #mm-bounty-hunter-v01 .my-stats{border:1px solid #506078;border-radius:6px;padding:9px;margin:7px 0}
    #mm-bounty-hunter-v01 .my-stats .controls{margin:5px 0}
    #mm-bounty-hunter-v01 .evidence{font-size:12px;font-weight:700}
    #mm-bounty-hunter-v01 .evidence.favorable{color:#b1dfc8}
    #mm-bounty-hunter-v01 .evidence.risk{color:#ffc58c}
    #mm-bounty-hunter-v01 .foot{font-size:12px;color:#bdc9d7;margin-top:10px}
    #mm-bounty-hunter-v01 details{margin-top:7px}
    #mm-bounty-hunter-v01 summary{cursor:pointer}
    @media(max-width:680px){#mm-bounty-hunter-v01{margin:8px 5px;padding:10px}#mm-bounty-hunter-v01 .controls{gap:6px}#mm-bounty-hunter-v01 input{max-width:135px}}
  `;
  document.head.append(css);
  const root = document.createElement('section');
  root.id = 'mm-bounty-hunter-v01';
  root.innerHTML = `
    <div class="head"><div><h2>MM Bounty Hunter · Target Finder <small>v0.1.1-rc.4</small></h2><div class="sub">Official API only · uncertain battle stats stay uncertain · attacks are always manual</div></div>
    <a href="https://wiki.torn.com/wiki/Rank" target="_blank" rel="noopener noreferrer">Rank methodology</a></div>
    <div class="controls">
      <label>Torn API key (public access)<input id="mm-bh-key" type="password" autocomplete="off" spellcheck="false" aria-label="Torn API key"></label>
      <button id="mm-bh-save" type="button">Save key locally</button>
      <button id="mm-bh-forget" type="button">Forget key</button>
      <label>Minimum reward ($)<input id="mm-bh-min" type="number" min="0" step="10000" value="100000"></label>
      <label>Max target level<input id="mm-bh-maxlevel" type="number" min="1" max="100" value="100"></label>
      <label>Your stat total (fallback)<input id="mm-bh-own" type="number" min="0" step="1" placeholder="Optional"></label>
      <label>Availability filter<select id="mm-bh-availability"><option value="all">All targets</option><option value="available">Available (checked)</option><option value="hospital">Hospital</option><option value="travel">Traveling / Abroad</option><option value="jail">Jail / Federal</option><option value="other">Other statuses</option><option value="unknown">Not checked / Unknown</option></select></label>
      <label>Sort by<select id="mm-bh-sort"><option value="availability">Availability (available first)</option><option value="statusEnd">Soonest reported status end</option><option value="priority">Priority heuristic</option><option value="reward">Highest single bounty</option><option value="strength">Lowest estimated stat band</option></select></label>
      <button id="mm-bh-scan" type="button">Scan bounties</button>
    </div>
    <details class="my-stats"><summary>My four combat stats — manual or optional API</summary>
      <div class="controls">
        <label>Strength<input id="mm-bh-str" type="number" min="0" step="1" placeholder="Manual"></label>
        <label>Speed<input id="mm-bh-spd" type="number" min="0" step="1" placeholder="Manual"></label>
        <label>Defense<input id="mm-bh-def" type="number" min="0" step="1" placeholder="Manual"></label>
        <label>Dexterity<input id="mm-bh-dex" type="number" min="0" step="1" placeholder="Manual"></label>
        <button id="mm-bh-manual" type="button">Use manual stats</button>
        <button id="mm-bh-clear-own" type="button">Clear my stats</button>
      </div>
      <div class="controls">
        <label>Optional separate Limited/Custom API key<input id="mm-bh-private" type="password" autocomplete="off" spellcheck="false" placeholder="Session only"></label>
        <button id="mm-bh-load-own" type="button">Load my stats (opt in)</button>
      </div>
      <div class="sub" id="mm-bh-own-status">No private API access used. Your public key remains separate. The optional key is never saved and is only sent to api.torn.com to verify identity and read your own battle stats. A Limited-access or appropriately scoped Custom key is required; no Full key is needed. No key, stats or profile data is shared with third parties.</div>
    </details>
    <div class="msg" id="mm-bh-status" role="status" aria-live="polite">No API requests until you select Scan bounties.</div>
    <div class="counts" id="mm-bh-counts" aria-label="Checked target status totals">Status counts appear after scanning.</div>
    <div class="tablewrap"><table><thead><tr><th>Target</th><th>Largest listed reward</th><th>Rank estimate</th><th>Status</th><th>Combat evidence</th><th>Priority</th><th>Review flags</th></tr></thead><tbody id="mm-bh-list"><tr><td colspan="7" class="muted">Scan to load opportunities.</td></tr></tbody></table></div>
    <div class="foot" id="mm-bh-foot">Screening points are not a fight-win probability; opponent four-stat distributions are unknown. Listed totals are not guaranteed earnings.</div>
    <details><summary>Data, limits and warnings</summary><div class="foot">Fetches up to 300 official bounty listings and checks the status of up to 18 diversified bounty candidates per scan (payout, nearby level and blended). Public combat statistics are requested for up to 10 available profiles; all other rows are marked Not checked. Availability filters operate on checked targets, not all 300 listings. A status timer is only shown when Torn supplies an actual status-until timestamp, and reaching zero never assumes the player became available. Status snapshots can change; always verify on Torn. Requests are spaced; profile results are kept in session memory for at most 2 minutes before refetching. API keys are stored locally only when saved. The rank formula can be misled by ghost net-worth triggers and stat imbalance. No automatic attacks, claims, page scraping, notifications, or offsite tracking.</div></details>
  `;
  const mount = document.querySelector('#mainContainer') || document.querySelector('main') || document.body;
  mount.insertBefore(root, mount.firstChild);
  const el = id => root.querySelector(`#${id}`);
  const status = text => { el('mm-bh-status').textContent = text; };
  const gmv = (k, d) => { try { return GM_getValue(`mm-bh-v1-${k}`, d); } catch { return d; } };
  const sets = (k, v) => { GM_setValue(`mm-bh-v1-${k}`, v); };
  state.key = String(gmv('key', '') || '');
  el('mm-bh-key').value = state.key;
  el('mm-bh-min').value = String(gmv('min', 100000));
  el('mm-bh-maxlevel').value = String(gmv('maxlevel', 100));
  const ownTotalFallback = () => {
    const n = Number(el('mm-bh-own').value);
    return el('mm-bh-own').value.trim() && Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  function recalcAssessments() {
    const total = state.ownBattle?.total ?? ownTotalFallback();
    for (const row of state.rows) if (row.profile) row.assessment = ENGINE.classify(row, state.myLevel, total);
    render();
  }

  let nextRequestAt = 0;
  function api(path, params = {}, requestKey = state.key) {
    return new Promise((resolve, reject) => {
      const query = new URLSearchParams({ ...params, comment: 'MM_Bounty_Hunter' });
      const url = `https://api.torn.com/v2${path}?${query}`;
      const request = () => {
        const now = Date.now();
        const wait = Math.max(0, nextRequestAt - now);
        nextRequestAt = Math.max(nextRequestAt, now) + SETTINGS.requestGapMs;
        setTimeout(() => {
          GM_xmlhttpRequest({ method: 'GET', url, timeout: 12000,
            headers: { Authorization: `ApiKey ${requestKey}`, Accept: 'application/json' },
            onload: r => {
              let data;
              try { data = JSON.parse(r.responseText); } catch { reject(Error('Torn API returned an invalid JSON response')); return; }
              if (data?.error) {
                const code = Number(data.error.code);
                if ([2, 5, 13, 16, 18].includes(code)) reject(Error(`Torn API error ${code}: key, access, pause or rate limit; scan stopped`));
                else reject(Error(`Torn API error ${Number.isFinite(code) ? code : 'unknown'}`));
              } else if (r.status < 200 || r.status >= 300) reject(Error(`Torn API HTTP ${r.status}`));
              else resolve(data);
            },
            ontimeout: () => reject(Error('Torn API timed out')),
            onerror: () => reject(Error('Torn API network request failed'))
          });
        }, wait);
      };
      request();
    });
  }

  function eligibleByBaseFilters() {
    const minReward = Math.max(0, Number(el('mm-bh-min').value) || 0);
    const maxLevel = Math.min(100, Math.max(1, Number(el('mm-bh-maxlevel').value) || 100));
    return state.rows.filter(r => r.maxReward >= minReward && r.level <= maxLevel && r.id !== state.myId);
  }
  function filtered() {
    return ENGINE.filterAvailability(eligibleByBaseFilters(), state.availabilityFilter);
  }
  function render() {
    const counts = { available: 0, hospital: 0, travel: 0, jail: 0, other: 0, unknown: 0 };
    const base = state.rows.filter(r => r.id !== state.myId);
    for (const row of base) counts[ENGINE.availability(row)]++;
    const checked = base.filter(r => Boolean(r.profile)).length;
    el('mm-bh-counts').innerHTML = `<span>Checked ${fmt(checked)} / ${fmt(base.length)}</span><span class="good">Available ${fmt(counts.available)}</span><span class="warn">Hospital ${fmt(counts.hospital)}</span><span>Travel / Abroad ${fmt(counts.travel)}</span><span>Jail ${fmt(counts.jail)}</span><span>Unknown / unchecked ${fmt(counts.unknown)}</span>`;
    const selected = ENGINE.sortRows(filtered(), state.sort).slice(0, 100);
    const tbody = el('mm-bh-list');
    if (!selected.length) {
      tbody.innerHTML = '<tr><td colspan="7">No matching targets among the checked results. Change availability filters or scan again.</td></tr>';
      el('mm-bh-foot').textContent = 'Availability filters include only official profile statuses that were checked; unassessed targets are never treated as Available.';
      return;
    }
    tbody.innerHTML = selected.map(r => {
      const p = r.profile, e = r.estimate, a = r.assessment;
      const ev = ENGINE.evidence(r, state.ownBattle, ownTotalFallback());
      const st = ENGINE.statusDisplay(r);
      const able = ENGINE.attackability(r);
      const flag = a ? a.reasons.join(' · ') : 'Not analyzed; reward-only listing';
      const expires = new Date(r.expiresAt * 1000).toLocaleString();
      return `<tr><td><a href="https://www.torn.com/profiles.php?XID=${r.id}" target="_blank" rel="noopener noreferrer">${esc(r.name)} [${r.id}]</a><div class="muted">Level ${r.level}${p?.age != null ? ` · ${fmt(p.age)} days` : ''}</div></td>
        <td><b>${money(r.maxReward)}</b><div class="muted">${fmt(r.listedQuantity)} listed claim(s) · ${fmt(r.rows)} listing(s)</div><div class="muted">Earliest expiry: ${esc(expires)}</div></td>
        <td>${e?.status === 'estimated' ? esc(e.label) : '<span class="warn">Unknown</span>'}<div class="notes">${e?.breakdown ? `Rank ${e.breakdown.total} − level ${e.breakdown.level} − crime ${e.breakdown.crimes} − net worth ${e.breakdown.networth} = ${e.breakdown.battle} stat triggers` : 'No defensible calculation'}</div></td>
        <td class="status-cell"><span class="status-pill ${st.category}">${st.label}</span><div class="status-time">${esc(st.timing)}</div><div class="status-detail">${esc(able.label)}</div>${st.description ? `<div class="status-detail">${esc(st.description)}</div>` : ''}${st.details ? `<div class="status-detail">${esc(st.details)}</div>` : ''}<div class="status-detail">${esc(st.checked)} · upstream profile timestamp not supplied</div>${p ? `<div class="status-detail">Rank: ${esc(p.rank || 'Not supplied')}</div>` : ''}</td>
        <td><span class="evidence ${ev.category}">${esc(ev.heading)}</span><div class="notes">${esc(ev.reasons.join(' · '))}</div>${ev.signals?.defendRecord ? `<div class="notes">Defends: ${esc(ev.signals.defendRecord)}</div>` : ''}${ev.signals?.energyRefills != null ? `<div class="notes">Energy refills: ${fmt(ev.signals.energyRefills)}</div>` : ''}</td>
        <td>${a?.score >= 0 ? `<b>${fmt(a.score)} screening points</b>` : '—'}<div class="notes">${a ? esc(a.text) : 'Reward only'}</div></td>
        <td class="notes ${a?.kind === 'unavailable' || e?.status === 'inconsistent' ? 'warn' : ''}">${esc(flag)}${r.profileError ? '<div>Profile fetch failed</div>' : ''}${r.statsError ? '<div>Personal-stat evidence unavailable</div>' : ''}${e?.note ? `<div>${esc(e.note)}</div>` : ''}${r.stats?.xanax != null ? `<div>Xanax: ${fmt(r.stats.xanax)} · Ecstasy: ${fmt(r.stats.ecstasy)} · LSD: ${fmt(r.stats.lsd)} · Attacks won: ${fmt(r.stats.attacks)}</div>` : ''}</td></tr>`;
    }).join('');
    const sourceLabel = state.sourceTime ? new Date(state.sourceTime * 1000).toLocaleString() : 'not supplied';
    const fetchedLabel = state.nowFetched ? new Date(state.nowFetched).toLocaleString() : 'not fetched';
    const lag = state.sourceTime ? Math.max(0, Math.round(Date.now() / 1000 - state.sourceTime)) : null;
    const stale = lag !== null && lag > Math.max(300, state.delay * 2);
    el('mm-bh-foot').textContent = `${selected.length} displayed / ${filtered().length} matching / ${state.rows.length} unique in fetched feed. ${fmt(checked)} profile statuses checked and ${fmt(counts.unknown)} unknown or not checked. Upstream bounty snapshot: ${sourceLabel}; minimum upstream cache delay: ${fmt(state.delay)}s; locally fetched: ${fetchedLabel}. ${stale ? 'UPSTREAM DATA MAY BE STALE. ' : ''}Timers count down from reported API until values, not a guaranteed change of status. Verify on Torn before acting.`;
  }

  async function scan() {
    if (state.running) return;
    const entered = el('mm-bh-key').value.trim();
    if (!/^[a-zA-Z0-9]{16,128}$/.test(entered)) { status('Enter a valid Torn API key before scanning (stored only if you select Save key).'); return; }
    state.key = entered;
    state.running = true;
    el('mm-bh-scan').disabled = true;
    const now = Date.now();
    let pagesDone = 0;
    try {
      status('Requesting your level and the official bounty feed…');
      const mine = await api('/user/profile', { striptags: 'true' });
      const own = ENGINE.extractProfile(mine);
      state.myLevel = own?.level ?? null;
      const ownId = ENGINE.extractSelfId(mine);
      state.myId = ownId;
      if (state.ownBattle && state.ownBattleOwnerId && state.myId && state.ownBattleOwnerId !== state.myId) {
        state.ownBattle = null; state.ownBattleSource = 'none'; state.ownBattleAt = 0; state.ownBattleOwnerId = null;
        el('mm-bh-own-status').textContent = 'The public key now identifies a different account. Previous four-stat evidence was cleared.';
      }
      const merged = new Map();
      let sourceTime = null, delay = null;
      for (let i = 0; i < SETTINGS.maxPages; i++) {
        const data = await api('/torn/bounties', { limit: String(SETTINGS.pageSize), offset: String(i * SETTINGS.pageSize) });
        const at = ENGINE.normalizeBounties(data, now);
        for (const r of at) {
          const old = merged.get(r.id);
          if (!old) merged.set(r.id, r);
          else {
            old.maxReward = Math.max(old.maxReward, r.maxReward);
            old.listedQuantity = Math.min(10000, old.listedQuantity + r.listedQuantity);
            old.listedTotal = Math.min(Number.MAX_SAFE_INTEGER, old.listedTotal + r.listedTotal);
            old.rows += r.rows;
            old.expiresAt = Math.min(old.expiresAt, r.expiresAt);
          }
        }
        pagesDone++;
        if (typeof data.bounties_timestamp === 'number' && data.bounties_timestamp > 0)
          sourceTime = sourceTime === null ? data.bounties_timestamp : Math.min(sourceTime, data.bounties_timestamp);
        if (typeof data.bounties_delay === 'number' && data.bounties_delay >= 0)
          delay = delay === null ? data.bounties_delay : Math.max(delay, data.bounties_delay);
        if (data.bounties.length < SETTINGS.pageSize) break;
      }
      state.rows = [...merged.values()]; state.nowFetched = Date.now();
      state.sourceTime = sourceTime || 0; state.delay = delay || 0;
      render();
      const top = ENGINE.preScreenCandidates(eligibleByBaseFilters(), state.myLevel, SETTINGS.enrich);
      let done = 0, failed = 0, deep = 0;
      // Stage one: inexpensive status snapshots for a diversified shortlist.
      for (const row of top) {
        status(`Official profile checks: ${done + 1}/${top.length}. Other bounty listings remain unchecked.`);
        const detail = state.cache.get(row.id) || {};
        if (!detail.profileFetchedAt || Date.now() - detail.profileFetchedAt > SETTINGS.cacheMs) {
          try {
            const raw = await api(`/user/${row.id}/profile`, { striptags: 'true' });
            detail.profile = ENGINE.extractProfile(raw);
            detail.profileFetchedAt = Date.now(); detail.profileError = !detail.profile;
          } catch (err) {
            if (/Torn API error (2|5|13|16|18)/.test(err.message)) throw err;
            detail.profile = null; detail.profileFetchedAt = Date.now(); detail.profileError = true;
          }
        }
        state.cache.set(row.id, detail);
        row.profile = detail.profile || null;
        row.profileFetchedAt = detail.profileFetchedAt;
        row.profileError = Boolean(detail.profileError);
        if (!row.profile) failed++;
        done++;
        if (done % 3 === 0 || done === top.length) render();
      }
      // Stage two: only available candidates, diversified again. Never let failed
      // personalstats replace or invalidate already verified public profile state.
      const targets = ENGINE.preScreenCandidates(top.filter(r => ENGINE.availability(r) === 'available'), state.myLevel, SETTINGS.deepStats);
      for (const row of targets) {
        const detail = state.cache.get(row.id);
        status(`Combat data checks: ${deep + 1}/${targets.length}; preserving checked status when stats are unavailable.`);
        if (!detail.statsFetchedAt || Date.now() - detail.statsFetchedAt > SETTINGS.cacheMs) {
          try {
            const raw = await api(`/user/${row.id}/personalstats`, { cat: 'popular' });
            detail.stats = ENGINE.extractPersonalStats(raw);
            detail.statsError = !detail.stats;
          } catch (err) {
            if (/Torn API error (2|5|13|16|18)/.test(err.message)) throw err;
            detail.stats = null; detail.statsError = true;
          }
          detail.statsFetchedAt = Date.now();
        }
        deep++;
        row.stats = detail.stats || null;
        row.statsError = Boolean(detail.statsError);
        row.estimate = ENGINE.estimateRank({rank: row.profile.rank, level: row.profile.level ?? row.level,
          crimes: row.stats?.crimes, networth: row.stats?.networth });
        row.assessment = ENGINE.classify(row, state.myLevel, state.ownBattle?.total ?? ownTotalFallback());
        if (deep % 3 === 0 || deep === targets.length) render();
      }
      // Cheap classifications for profiled targets whose deeper stats were skipped.
      for (const row of top) {
        if (!row.profile) continue;
        if (!row.estimate) row.estimate = ENGINE.estimateRank({rank: row.profile.rank, level: row.profile.level ?? row.level,
          crimes: row.stats?.crimes, networth: row.stats?.networth });
        if (!row.assessment) row.assessment = ENGINE.classify(row, state.myLevel, state.ownBattle?.total ?? ownTotalFallback());
      }
      while (state.cache.size > 50) state.cache.delete(state.cache.keys().next().value);
      render();
      status(`Scan complete: ${state.rows.length} unique bounty targets across ${pagesDone} page(s); ${done - failed} profiles checked, ${failed} unresolved, ${deep} deep-stat checks. Other listings remain unverified. No live attack or claim executed.`);
    } catch (e) {
      status(`Scan stopped: ${e.message}. ${state.rows.length ? 'Already obtained rows remain on screen, but freshness and completeness may be limited.' : 'No verified target list is available.'}`);
      render();
    } finally { state.running = false; el('mm-bh-scan').disabled = false; }
  }
  el('mm-bh-manual').addEventListener('click', () => {
    const stats = ENGINE.manualBattleStats({ strength: el('mm-bh-str').value, speed: el('mm-bh-spd').value,
      defense: el('mm-bh-def').value, dexterity: el('mm-bh-dex').value });
    if (!stats) { el('mm-bh-own-status').textContent = 'Provide four valid nonnegative integer stats. No changes made.'; return; }
    state.ownBattle = stats; state.ownBattleSource = 'manual'; state.ownBattleAt = Date.now(); state.ownBattleOwnerId = state.myId;
    el('mm-bh-own-status').textContent = `Manual four-stat profile loaded (total ${fmt(stats.total)}). Session only; no key used.`;
    recalcAssessments();
  });
  el('mm-bh-clear-own').addEventListener('click', () => {
    state.ownBattle = null; state.ownBattleSource = 'none'; state.ownBattleAt = 0; state.ownBattleOwnerId = null;
    for (const k of ['mm-bh-str','mm-bh-spd','mm-bh-def','mm-bh-dex','mm-bh-own','mm-bh-private']) el(k).value = '';
    el('mm-bh-own-status').textContent = 'My stats and optional private key cleared from this session.';
    recalcAssessments();
  });
  el('mm-bh-load-own').addEventListener('click', async () => {
    if (state.running) return;
    let privateKey = el('mm-bh-private').value.trim();
    el('mm-bh-private').value = '';
    if (!/^[a-zA-Z0-9]{16,128}$/.test(privateKey)) { el('mm-bh-own-status').textContent = 'Enter a valid separate Limited/Custom API key; nothing was sent.'; return; }
    const publicKey = el('mm-bh-key').value.trim();
    if (!/^[a-zA-Z0-9]{16,128}$/.test(publicKey)) { privateKey = ''; el('mm-bh-own-status').textContent = 'Enter a public API key first so we can verify both keys belong to the same account.'; return; }
    state.running = true;
    el('mm-bh-load-own').disabled = true;
    el('mm-bh-scan').disabled = true;
    try {
      const publicRaw = await api('/user/profile', { striptags: 'true' }, publicKey);
      const scopedRaw = await api('/user/profile', { striptags: 'true' }, privateKey);
      const publicIdentity = ENGINE.extractProfile(publicRaw);
      const scopedIdentity = ENGINE.extractProfile(scopedRaw);
      // Public and limited/custom keys MUST resolve the same player, not merely two plausible profiles.
      const publicId = ENGINE.extractSelfId(publicRaw);
      const scopedId = ENGINE.extractSelfId(scopedRaw);
      if (!publicIdentity || !scopedIdentity || !Number.isSafeInteger(publicId) || publicId <= 0 || publicId !== scopedId) throw Error('Public and optional keys must belong to the same player. No private stats loaded');
      const stats = ENGINE.parseOwnBattleStats(await api('/user/battlestats', {}, privateKey));
      if (!stats) throw Error('Unexpected battlestats response; previous stats preserved');
      state.myId = publicId;
      state.myLevel = publicIdentity.level;
      state.ownBattle = stats; state.ownBattleSource = 'Torn API'; state.ownBattleAt = Date.now(); state.ownBattleOwnerId = publicId;
      el('mm-bh-own-status').textContent = `Your four battle stats loaded (total ${fmt(stats.total)}) and identity verified. Kept in session memory only; optional key not stored.`;
      recalcAssessments();
    } catch (err) {
      el('mm-bh-own-status').textContent = `Private-stat lookup failed: ${err.message}. Manual four-stat entry remains available.`;
    } finally {
      privateKey = '';
      state.running = false;
      el('mm-bh-load-own').disabled = false;
      el('mm-bh-scan').disabled = false;
    }
  });
  el('mm-bh-own').addEventListener('change', recalcAssessments);
  el('mm-bh-save').addEventListener('click', () => {
    const key = el('mm-bh-key').value.trim();
    if (!/^[a-zA-Z0-9]{16,128}$/.test(key)) { status('Key not saved: invalid format.'); return; }
    state.key = key;
    sets('key', key);
    status('Key saved to your userscript manager storage on this device; only used with api.torn.com.');
  });
  el('mm-bh-forget').addEventListener('click', () => {
    try { GM_deleteValue('mm-bh-v1-key'); } catch { GM_setValue('mm-bh-v1-key', ''); }
    el('mm-bh-key').value = ''; state.key = '';
    status('Stored key cleared.');
  });
  for (const [id, store] of [['mm-bh-min', 'min'], ['mm-bh-maxlevel', 'maxlevel']]) {
    el(id).addEventListener('change', () => { sets(store, Number(el(id).value)); render(); });
  }
  state.sort = el('mm-bh-sort').value;
  el('mm-bh-sort').addEventListener('change', () => { state.sort = el('mm-bh-sort').value; render(); });
  el('mm-bh-availability').addEventListener('change', () => {
    state.availabilityFilter = el('mm-bh-availability').value;
    render();
  });
  // Update only displayed countdown text. No background API requests or DOM observers.
  setInterval(() => { if (!document.hidden && state.rows.length) render(); }, 60 * 1000);
  el('mm-bh-scan').addEventListener('click', scan);
})();
