// ==UserScript==
// @name         MM War Intel
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-alpha.2
// @description  Ranked-war rival intelligence, group coordination, attack evidence, and defensive risk recommendations.
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @sandbox      JavaScript
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@5cf7e5c114b8e1a2c4d60d70456c2f0c3f5bdbf9/modular-suite/core/MM_Torn_Core.js
// @connect      api.torn.com
// @connect      ffscouter.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.addValueChangeListener
// @grant        GM.removeValueChangeListener
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MMWarIntelLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITS = Object.freeze({
    historyAttacks: 2500,
    activityActiveSeconds: 300,
    activityWarmSeconds: 900,
    intelFreshSeconds: 86400,
    intelUsableSeconds: 604800,
    lifeFreshSeconds: 120,
    highRisk: 70,
    watchRisk: 45,
    maxSuggestedGroup: 6
  });

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function positive(value) {
    return finite(value) && value > 0 ? value : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function statusState(member) {
    return String(member && member.status && member.status.state || '').trim();
  }

  function isOkay(member) {
    return statusState(member).toLowerCase() === 'okay';
  }

  function secondsSinceLastAction(member, nowSeconds) {
    const stamp = Number(member && member.last_action && member.last_action.timestamp);
    if (!Number.isSafeInteger(stamp) || stamp <= 0 || !Number.isSafeInteger(nowSeconds)) return null;
    return Math.max(0, nowSeconds - stamp);
  }

  function activityBand(member, nowSeconds) {
    const explicit = String(member && member.last_action && member.last_action.status || '').trim().toLowerCase();
    if (explicit === 'online') return 'active';
    if (explicit === 'idle') return 'warm';
    if (explicit === 'offline') return 'cold';
    const age = secondsSinceLastAction(member, nowSeconds);
    if (age === null) return 'unknown';
    if (age <= LIMITS.activityActiveSeconds) return 'active';
    if (age <= LIMITS.activityWarmSeconds) return 'warm';
    return 'cold';
  }

  function estimateOf(intel) {
    const value = Number(intel && (intel.bs_estimate ?? intel.bsEstimate));
    return positive(value);
  }

  function latestObservationAgeSeconds(intel, nowSeconds) {
    const stamp = Number(intel && (intel.last_updated ?? intel.lastUpdated));
    if (!Number.isSafeInteger(stamp) || stamp <= 0) return null;
    return Math.max(0, nowSeconds - stamp);
  }

  function estimateConfidence(intel, nowSeconds) {
    if (!intel) return 0;
    let score = estimateOf(intel) ? 45 : 0;
    const source = String(intel.source || '').toLowerCase();
    if (source === 'spies' || source === 'premium') score += 25;
    else if (source) score += 10;
    if (intel.distribution) score += 10;
    const age = latestObservationAgeSeconds(intel, nowSeconds);
    if (age !== null && age <= LIMITS.intelFreshSeconds) score += 15;
    else if (age !== null && age <= LIMITS.intelUsableSeconds) score += 8;
    if (intel.premium_insights_available === true || intel.premiumInsightsAvailable === true) score += 5;
    return clamp(score, 0, 100);
  }

  function normalizeAttackEvidence(input) {
    if (!input || typeof input !== 'object') return null;
    const attackId = String(input.attackId || input.id || '').trim();
    const attackerId = String(input.attackerId || '').trim();
    const defenderId = String(input.defenderId || '').trim();
    if (!attackId || !attackerId || !defenderId) return null;
    const damage = Math.max(0, Number(input.damage) || 0);
    const hits = Math.max(0, Number(input.hits) || 0);
    const misses = Math.max(0, Number(input.misses) || 0);
    const groupModifier = Math.max(1, Number(input.groupModifier) || 1);
    const started = Math.max(0, Number(input.started) || 0);
    const ended = Math.max(0, Number(input.ended) || 0);
    return {
      attackId,
      code: String(input.code || ''),
      attackerId,
      defenderId,
      attackerName: String(input.attackerName || ''),
      defenderName: String(input.defenderName || ''),
      result: String(input.result || ''),
      damage,
      hits,
      misses,
      groupModifier,
      group: input.group === true || groupModifier > 1,
      rankedWar: input.rankedWar === true,
      started,
      ended
    };
  }

  function mergeAttackHistory(existing, incoming, limit) {
    const cap = Number.isSafeInteger(limit) && limit > 0 ? limit : LIMITS.historyAttacks;
    const map = new Map();
    for (const row of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const normalized = normalizeAttackEvidence(row);
      if (!normalized) continue;
      const key = normalized.attackId + ':' + normalized.attackerId + ':' + normalized.defenderId;
      map.set(key, normalized);
    }
    return [...map.values()]
      .sort((a, b) => (b.ended - a.ended) || b.attackId.localeCompare(a.attackId))
      .slice(0, cap);
  }

  function resultIsWin(result) {
    const value = String(result || '').toLowerCase();
    return ['hospitalized', 'mugged', 'attacked', 'leave', 'left'].some(x => value.includes(x));
  }

  function resultIsLoss(result) {
    const value = String(result || '').toLowerCase();
    return ['lost', 'stalemate', 'escape'].some(x => value.includes(x));
  }

  function matchupSummary(attacks, attackerId, defenderId) {
    const rows = (Array.isArray(attacks) ? attacks : []).filter(row =>
      String(row.attackerId) === String(attackerId) &&
      String(row.defenderId) === String(defenderId)
    );
    let wins = 0;
    let losses = 0;
    let damage = 0;
    let hits = 0;
    let misses = 0;
    let groupAttacks = 0;
    let groupDamage = 0;
    let soloAttempts = 0;
    let soloWins = 0;
    let soloDamage = 0;

    for (const row of rows) {
      const win = resultIsWin(row.result);
      if (win) wins += 1;
      if (resultIsLoss(row.result)) losses += 1;
      const rowDamage = Math.max(0, Number(row.damage) || 0);
      damage += rowDamage;
      hits += Math.max(0, Number(row.hits) || 0);
      misses += Math.max(0, Number(row.misses) || 0);
      if (row.group) {
        groupAttacks += 1;
        groupDamage += rowDamage;
      } else {
        soloAttempts += 1;
        soloDamage += rowDamage;
        if (win) soloWins += 1;
      }
    }

    const attempts = rows.length;
    return {
      attempts,
      wins,
      losses,
      winRate: attempts ? wins / attempts : null,
      damage,
      averageDamage: attempts ? damage / attempts : null,
      hitRate: hits + misses ? hits / (hits + misses) : null,
      groupAttacks,
      groupDamage,
      averageGroupDamage: groupAttacks ? groupDamage / groupAttacks : null,
      soloAttempts,
      soloWins,
      soloDamage,
      soloWinRate: soloAttempts ? soloWins / soloAttempts : null,
      averageSoloDamage: soloAttempts ? soloDamage / soloAttempts : null
    };
  }

  function recentEnemySuccessMode(attacks, enemyId, ownId, sinceSeconds) {
    let sawGroup = false;
    for (const row of (Array.isArray(attacks) ? attacks : [])) {
      if (String(row.attackerId) !== String(enemyId) ||
          String(row.defenderId) !== String(ownId) ||
          Number(row.ended) < sinceSeconds ||
          !resultIsWin(row.result)) continue;
      if (!row.group) return 'solo';
      sawGroup = true;
    }
    return sawGroup ? 'group' : null;
  }

  function freshObservedLife(member, nowSeconds) {
    const life = positive(Number(member && member.lifeCurrent));
    const observedAt = Number(member && member.lifeFetchedAt);
    if (life === null || !Number.isSafeInteger(observedAt) || observedAt <= 0) return null;
    return Math.max(0, nowSeconds - observedAt) <= LIMITS.lifeFreshSeconds ? life : null;
  }

  function threatAgainstMember(input) {
    const own = input && input.ownMember;
    const enemy = input && input.enemyMember;
    const nowSeconds = Number(input && input.nowSeconds);
    if (!own || !enemy || !Number.isSafeInteger(nowSeconds)) {
      return { score: 0, band: 'unknown', reasons: ['insufficient-data'], recommendHospitalization: false };
    }
    if (!isOkay(own) || !isOkay(enemy)) {
      return { score: 0, band: 'low', reasons: ['one-side-not-okay'], recommendHospitalization: false };
    }

    let score = 20;
    const reasons = ['both-attack-capable'];
    const activity = activityBand(enemy, nowSeconds);
    if (activity === 'active') {
      score += 25;
      reasons.push('enemy-active');
    } else if (activity === 'warm') {
      score += 12;
      reasons.push('enemy-recently-active');
    }

    const enemyBs = estimateOf(input.enemyIntel);
    const ownBs = estimateOf(input.ownIntel);
    const enemyConfidence = estimateConfidence(input.enemyIntel, nowSeconds);
    const ownConfidence = estimateConfidence(input.ownIntel, nowSeconds);
    if (enemyBs && ownBs && enemyConfidence >= 45 && ownConfidence >= 45) {
      const ratio = enemyBs / ownBs;
      if (ratio >= 2) {
        score += 35;
        reasons.push('enemy-estimate-much-stronger');
      } else if (ratio >= 1.2) {
        score += 25;
        reasons.push('enemy-estimate-stronger');
      } else if (ratio >= 0.85) {
        score += 10;
        reasons.push('similar-estimated-strength');
      } else {
        score -= 15;
        reasons.push('own-estimate-stronger');
      }
    }

    const recentSuccess = recentEnemySuccessMode(input.attacks, enemy.id, own.id, nowSeconds - 6 * 3600);
    if (recentSuccess === 'solo') {
      score += 30;
      reasons.push('recent-observed-enemy-solo-win');
    } else if (recentSuccess === 'group') {
      score += 12;
      reasons.push('recent-observed-enemy-group-win');
    }

    score = clamp(score, 0, 100);
    const band = score >= LIMITS.highRisk ? 'high' : score >= LIMITS.watchRisk ? 'watch' : 'low';
    return {
      score,
      band,
      reasons,
      recommendHospitalization: band === 'high' && activity === 'active'
    };
  }

  function defensiveBoard(input) {
    const ownMembers = Array.isArray(input && input.ownMembers) ? input.ownMembers : [];
    const enemyMembers = Array.isArray(input && input.enemyMembers) ? input.enemyMembers : [];
    const ownIntel = input && input.ownIntel || {};
    const enemyIntel = input && input.enemyIntel || {};
    const attacks = input && input.attacks || [];
    const nowSeconds = Number(input && input.nowSeconds);
    return ownMembers.map(member => {
      const threats = enemyMembers
        .map(enemy => ({
          enemy,
          assessment: threatAgainstMember({
            ownMember: member,
            enemyMember: enemy,
            ownIntel: ownIntel[String(member.id)],
            enemyIntel: enemyIntel[String(enemy.id)],
            attacks,
            nowSeconds
          })
        }))
        .filter(row => row.assessment.score > 0)
        .sort((a, b) => b.assessment.score - a.assessment.score);
      const top = threats[0] || null;
      return {
        member,
        riskScore: top ? top.assessment.score : 0,
        riskBand: top ? top.assessment.band : 'low',
        recommendHospitalization: Boolean(top && top.assessment.recommendHospitalization),
        topThreat: top ? top.enemy : null,
        reasons: top ? top.assessment.reasons : [],
        threats: threats.slice(0, 5)
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }

  function attackAvailability(member, nowSeconds) {
    if (!member) return { state: 'unknown', reason: 'missing-member' };
    const state = statusState(member);
    if (state.toLowerCase() !== 'okay') return { state: 'unavailable', reason: state || 'unknown-status' };
    const activity = activityBand(member, nowSeconds);
    return {
      state: 'candidate',
      reason: activity === 'active' ? 'okay-active' : 'okay',
      activity
    };
  }

  function targetRecommendation(input) {
    const target = input && input.target;
    const attackers = Array.isArray(input && input.attackers) ? input.attackers : [];
    const intelById = input && input.intelById || {};
    const attacks = input && input.attacks || [];
    const nowSeconds = Number(input && input.nowSeconds);
    if (!target) {
      return { mode: 'hold', confidence: 0, reason: 'missing-target', candidates: [], suggestedCount: 0, projectedDamage: null, targetLife: null };
    }

    const targetIntel = intelById[String(target.id)];
    const targetBs = estimateOf(targetIntel);
    const targetConfidence = estimateConfidence(targetIntel, nowSeconds);
    const targetLife = freshObservedLife(target, nowSeconds);
    const candidates = attackers
      .filter(member => isOkay(member) && activityBand(member, nowSeconds) !== 'cold')
      .map(member => {
        const intel = intelById[String(member.id)];
        const bs = estimateOf(intel);
        const confidence = estimateConfidence(intel, nowSeconds);
        const history = matchupSummary(attacks, member.id, target.id);
        const expectedDamage = history.averageGroupDamage ?? history.averageSoloDamage ?? history.averageDamage;
        let score = 0;
        if (history.soloAttempts >= 2 && history.soloWinRate !== null) {
          score += history.soloWinRate * 55;
        } else if (history.groupAttacks > 0) {
          score += Math.min(20, history.groupAttacks * 5);
        }
        if (bs !== null && targetBs !== null) score += clamp((bs / targetBs) * 35, 0, 45);
        if (expectedDamage !== null && targetLife !== null) score += clamp((expectedDamage / targetLife) * 20, 0, 20);
        score += confidence * 0.1;
        return { member, bs, confidence, history, expectedDamage, score };
      })
      .sort((a, b) => b.score - a.score);

    const solo = candidates.find(row =>
      (row.history.soloAttempts >= 2 && row.history.soloWinRate !== null && row.history.soloWinRate >= 0.75) ||
      (row.bs !== null && targetBs !== null && row.confidence >= 45 && targetConfidence >= 45 && row.bs >= targetBs * 1.35)
    );

    if (solo) {
      return {
        mode: 'solo',
        confidence: clamp(Math.round(Math.max(solo.confidence, solo.history.soloAttempts * 20)), 0, 100),
        reason: solo.history.soloAttempts >= 2 ? 'observed-solo-matchup-advantage' : 'estimated-strength-advantage',
        candidates: [solo],
        suggestedCount: 1,
        projectedDamage: solo.expectedDamage,
        targetLife
      };
    }

    if (candidates.length < 2) {
      return {
        mode: 'hold',
        confidence: targetConfidence,
        reason: 'insufficient-available-attackers',
        candidates,
        suggestedCount: candidates.length,
        projectedDamage: candidates[0]?.expectedDamage ?? null,
        targetLife
      };
    }

    const maxGroup = candidates.slice(0, Math.min(LIMITS.maxSuggestedGroup, candidates.length));
    const requiredDamage = targetLife === null ? null : targetLife * 1.1;
    let projectedDamage = 0;
    let knownDamageCount = 0;
    let suggestedCount = Math.min(2, maxGroup.length);

    for (let index = 0; index < maxGroup.length; index += 1) {
      const expectedDamage = maxGroup[index].expectedDamage;
      if (expectedDamage !== null) {
        projectedDamage += expectedDamage;
        knownDamageCount += 1;
      }
      if (index >= 1 && requiredDamage !== null && knownDamageCount === index + 1 && projectedDamage >= requiredDamage) {
        suggestedCount = index + 1;
        break;
      }
      if (index === maxGroup.length - 1) suggestedCount = maxGroup.length;
    }

    const selected = maxGroup.slice(0, suggestedCount);
    const selectedKnownDamage = selected.filter(row => row.expectedDamage !== null).length;
    const damageConfidence = selected.length ? Math.round((selectedKnownDamage / selected.length) * 100) : 0;

    return {
      mode: 'group',
      confidence: clamp(Math.round(targetConfidence * 0.5 + damageConfidence * 0.5), 0, 100),
      reason: requiredDamage !== null && selectedKnownDamage === selected.length
        ? 'observed-damage-group-sizing'
        : 'no-proven-safe-solo-matchup',
      candidates: selected,
      suggestedCount,
      projectedDamage: selectedKnownDamage
        ? selected.reduce((sum, row) => sum + (row.expectedDamage ?? 0), 0)
        : null,
      targetLife
    };
  }

  function sanitizeState(state) {
    const copy = JSON.parse(JSON.stringify(state || {}));
    if (copy.settings) {
      delete copy.settings.tornApiKey;
      delete copy.settings.ffscouterKey;
    }
    return copy;
  }

  return Object.freeze({
    LIMITS,
    activityBand,
    attackAvailability,
    defensiveBoard,
    estimateConfidence,
    matchupSummary,
    mergeAttackHistory,
    normalizeAttackEvidence,
    sanitizeState,
    targetRecommendation,
    threatAgainstMember
  });
});


(() => {
'use strict';
const APP='MM War Intel', VERSION='0.1.0-alpha.2', MODULE_ID='war-intel';
const STATE_KEY='mm-war-intel:state:v1', LEASE_KEY='mm-war-intel:lease:v1';
const REFRESH_MS=30000, LEASE_MS=45000, STATS_MS=300000, LIFE_STALE_MS=120000;
const MAX_LOGS=8, MAX_PROFILES=8, MAX_ATTACK_PAGES=3;
const core=globalThis.MMTornCore, logic=globalThis.MMWarIntelLogic;
const ownerId=(globalThis.crypto&&typeof crypto.randomUUID==='function')?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
let state,ui,launcher,ticker=null,valueListener=null,syncing=false,destroyed=false;

function emptyState(){return{schema:1,version:VERSION,revision:0,settings:{tornApiKey:'',ffscouterKey:'',enemyFactionId:'',autoDetectEnemy:true},war:{id:null,ownFactionId:null,enemyFactionId:null,start:null,end:null,fetchedAt:0},ownMembers:[],enemyMembers:[],intel:{},life:{},attacks:[],claims:{},fetch:{rosterAt:0,statsAt:0,attacksAt:0,claimsAt:0,lastSyncAt:0},errors:[]};}
function normalize(raw){const b=emptyState(),i=raw&&typeof raw==='object'?raw:{};const n={...b,...i};n.settings={...b.settings,...(i.settings||{})};n.war={...b.war,...(i.war||{})};n.fetch={...b.fetch,...(i.fetch||{})};n.ownMembers=Array.isArray(i.ownMembers)?i.ownMembers.slice(0,120):[];n.enemyMembers=Array.isArray(i.enemyMembers)?i.enemyMembers.slice(0,120):[];n.intel=i.intel&&typeof i.intel==='object'?i.intel:{};n.life=i.life&&typeof i.life==='object'?i.life:{};n.attacks=logic.mergeAttackHistory([],Array.isArray(i.attacks)?i.attacks:[],logic.LIMITS.historyAttacks);n.claims=i.claims&&typeof i.claims==='object'?i.claims:{};n.errors=Array.isArray(i.errors)?i.errors.slice(0,20):[];n.revision=Number.isSafeInteger(i.revision)?i.revision:0;return n;}
async function loadState(){return normalize(await GM.getValue(STATE_KEY,emptyState()));}
async function saveState(){state.version=VERSION;state.revision++;await GM.setValue(STATE_KEY,state);}
function safeError(error,source){const message=String(error&&error.message||error||'Unknown error').replace(/[A-Za-z0-9]{16}/g,'[redacted]').replace(/ApiKey\s+\S+/gi,'ApiKey [redacted]').slice(0,220);state.errors.unshift({at:Date.now(),source,message});state.errors=state.errors.slice(0,20);}
function validId(v){return /^[1-9]\d{0,10}$/.test(String(v||''));}
function validKey(v){return /^[A-Za-z0-9]{16}$/.test(String(v||''));}
function nowSec(){return Math.floor(Date.now()/1000);}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(v){const n=Number(v);if(!Number.isFinite(n))return'—';if(n>=1e12)return(n/1e12).toFixed(2)+'t';if(n>=1e9)return(n/1e9).toFixed(2)+'b';if(n>=1e6)return(n/1e6).toFixed(2)+'m';if(n>=1e3)return(n/1e3).toFixed(1)+'k';return Math.round(n).toLocaleString();}
function age(ms){if(!Number.isFinite(ms)||ms<0)return'—';const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';return Math.floor(m/60)+'h';}
function status(m){return String(m?.status?.state||'Unknown');}
function lastAge(m){const t=Number(m?.last_action?.timestamp);return Number.isFinite(t)&&t>0?Date.now()-t*1000:Infinity;}

async function req(url,opt={}){return new Promise((resolve,reject)=>GM.xmlHttpRequest({method:opt.method||'GET',url,headers:{Accept:'application/json',...(opt.headers||{})},data:opt.data,timeout:15000,onload(r){let b;try{b=JSON.parse(r.responseText||'null');}catch{reject(new Error('Invalid JSON response.'));return;}if(r.status<200||r.status>=300){reject(new Error(String(b?.error?.error||b?.error||b?.message||('HTTP '+r.status))));return;}if(b?.error){reject(new Error(String(b.error.error||b.error)));return;}resolve(b);},ontimeout(){reject(new Error('Request timed out.'));},onerror(){reject(new Error('Network request failed.'));}}));}
async function torn(path,q={}){const key=state.settings.tornApiKey.trim();if(!validKey(key))throw new Error('Configure a 16-character Torn API key.');const u=new URL('https://api.torn.com/v2/'+String(path).replace(/^\/+/,''));for(const[k,v]of Object.entries(q))if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v));return req(u.href,{headers:{Authorization:'ApiKey '+key}});}
async function ff(path,q={}){const key=state.settings.ffscouterKey.trim();if(!validKey(key))throw new Error('Configure a 16-character FFScouter key.');const u=new URL('https://ffscouter.com/api/v1/'+String(path).replace(/^\/+/,''));u.searchParams.set('key',key);for(const[k,v]of Object.entries(q))if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v));return req(u.href);}
async function ffPost(path,payload){const key=state.settings.ffscouterKey.trim();if(!validKey(key))throw new Error('Configure a 16-character FFScouter key.');return req('https://ffscouter.com/api/v1/'+String(path).replace(/^\/+/,''),{method:'POST',headers:{'Content-Type':'application/json'},data:JSON.stringify({key,...payload})});}

function parseMembers(b){const rows=Array.isArray(b?.members)?b.members:Array.isArray(b)?b:[];return rows.filter(x=>validId(x?.id)).map(x=>({id:String(x.id),name:String(x.name||('Player '+x.id)),level:Number(x.level)||0,position:String(x.position||''),last_action:{status:String(x.last_action?.status||''),timestamp:Number(x.last_action?.timestamp)||0,relative:String(x.last_action?.relative||'')},status:{state:String(x.status?.state||'Unknown'),description:String(x.status?.description||''),until:x.status?.until==null?null:Number(x.status.until)}})).sort((a,b)=>a.name.localeCompare(b.name));}
function factionId(b){const id=b?.basic?.id??b?.id??b?.faction_id;return validId(id)?String(id):null;}
function rankedWar(b){const w=b?.wars?.ranked??b?.ranked_war??null;if(!w)return null;const fs=Array.isArray(w.factions)?w.factions:[];return{id:String(w.war_id??w.id??''),start:Number(w.start)||null,end:w.end==null?null:Number(w.end),factions:fs.map(x=>({id:String(x.id??x.faction_id??''),name:String(x.name||'')})).filter(x=>validId(x.id))};}
async function refreshRoster(){const[b,w,o]=await Promise.all([torn('faction/basic'),torn('faction/wars'),torn('faction/members',{striptags:true})]);const ownId=factionId(b),war=rankedWar(w),auto=state.settings.autoDetectEnemy===true;state.ownMembers=parseMembers(o);let enemyId=auto?'':state.settings.enemyFactionId.trim();if(auto){if(!ownId||!war){state.war={id:null,ownFactionId:ownId,enemyFactionId:null,start:null,end:null,fetchedAt:Date.now()};state.enemyMembers=[];throw new Error('No current ranked-war opponent detected.');}const opp=war.factions.find(x=>x.id!==ownId);if(!opp){state.war={id:war.id||null,ownFactionId:ownId,enemyFactionId:null,start:war.start||null,end:war.end??null,fetchedAt:Date.now()};state.enemyMembers=[];throw new Error('Current ranked war has no valid opponent faction.');}enemyId=opp.id;}if(!validId(enemyId))throw new Error('Set a valid Enemy Faction ID in Setup or enable auto-detect during a ranked war.');const e=await torn('faction/'+enemyId+'/members',{striptags:true});state.enemyMembers=parseMembers(e);state.war={id:war?.id||null,ownFactionId:ownId,enemyFactionId:enemyId,start:war?.start||null,end:war?.end??null,fetchedAt:Date.now()};state.fetch.rosterAt=Date.now();}
async function refreshStats(){if(!validKey(state.settings.ffscouterKey))return;if(Date.now()-state.fetch.statsAt<STATS_MS)return;const ids=[...new Set([...state.ownMembers,...state.enemyMembers].map(x=>String(x.id)).filter(validId))].slice(0,205);if(!ids.length)return;const b=await ff('get-stats',{targets:ids.join(',')});const rows=Array.isArray(b)?b:Array.isArray(b?.stats)?b.stats:[];for(const r of rows){const id=String(r?.player_id??r?.id??'');if(validId(id))state.intel[id]={...r,fetchedAt:Date.now()};}state.fetch.statsAt=Date.now();}
function attackRows(b){return Array.isArray(b?.attacks)?b.attacks:Array.isArray(b)?b:[];}
function pid(p){return p&&validId(p.id)?String(p.id):null;}
async function refreshAttacks(){
  const ours=new Set(state.ownMembers.map(x=>String(x.id)));
  const theirs=new Set(state.enemyMembers.map(x=>String(x.id)));
  const seenCodes=new Set(state.attacks.map(x=>x.code).filter(Boolean));
  const seenAttackIds=new Set();
  const pending=[];
  let to=null;

  for(let page=0;page<MAX_ATTACK_PAGES;page++){
    const q={limit:100,sort:'DESC'};
    if(state.war.start)q.from=state.war.start;
    if(Number.isSafeInteger(to)&&to>0)q.to=to;
    const b=await torn('faction/attacks',q);
    const rows=attackRows(b);
    let oldest=null;

    for(const r of rows){
      const ended=Math.max(0,Number(r?.ended)||0);
      if(ended>0)oldest=oldest===null?ended:Math.min(oldest,ended);
      const a=pid(r?.attacker),d=pid(r?.defender);
      if(!a||!d)continue;
      if(!((ours.has(a)&&theirs.has(d))||(theirs.has(a)&&ours.has(d))))continue;
      const modifiers=r?.modifiers&&typeof r.modifiers==='object'?r.modifiers:{};
      const rankedWar=r?.is_ranked_war===true||Number(modifiers.war)>1;
      if(!rankedWar)continue;
      const code=String(r?.code||'');
      const started=Math.max(0,Number(r?.started)||0);
      const attackId=String(r?.id||code||(started?started+':'+a+':'+d:ended+':'+a+':'+d));
      if(!attackId||seenAttackIds.has(attackId))continue;
      seenAttackIds.add(attackId);
      const groupModifier=Math.max(1,Number(modifiers.group)||1);
      pending.push({
        attackId,code,attackerId:a,defenderId:d,
        attackerName:String(r?.attacker?.name||''),
        defenderName:String(r?.defender?.name||''),
        result:String(r?.result||''),damage:0,hits:0,misses:0,
        groupModifier,group:groupModifier>1,rankedWar:true,started,ended
      });
    }

    if(rows.length<100||oldest===null||(state.war.start&&oldest<=state.war.start))break;
    to=oldest-1;
  }

  const detail=[];
  const requestedCodes=new Set();
  let reads=0;
  for(const row of pending){
    if(!row.code||seenCodes.has(row.code)||requestedCodes.has(row.code)||reads>=MAX_LOGS)continue;
    requestedCodes.add(row.code);
    reads++;
    try{
      const b=await torn('torn/attacklog',{log:row.code});
      const s=Array.isArray(b?.attacklog?.summary)?b.attacklog.summary:Array.isArray(b?.summary)?b.summary:[];
      const participants=[];
      for(const p of s){
        const id=String(p?.id??p?.player_id??'');
        if(!validId(id)||id===row.defenderId)continue;
        const damage=Math.max(0,Number(p?.damage)||0);
        const hits=Math.max(0,Number(p?.hits)||0);
        const misses=Math.max(0,Number(p?.misses)||0);
        if(damage<=0&&hits<=0&&misses<=0)continue;
        participants.push({id,name:String(p?.name||''),damage,hits,misses});
      }
      if(participants.length){
        const ids=new Set(participants.map(p=>p.id));
        for(const p of participants){
          detail.push({
            ...row,
            attackerId:p.id,
            attackerName:p.name||row.attackerName,
            result:p.id===row.attackerId?row.result:'Assist',
            damage:p.damage,
            hits:p.hits,
            misses:p.misses,
            group:participants.length>1||row.group
          });
        }
        if(!ids.has(row.attackerId))detail.push(row);
      }else{
        detail.push(row);
      }
      seenCodes.add(row.code);
    }catch(e){
      safeError(e,'attacklog');
    }
  }

  state.attacks=logic.mergeAttackHistory(state.attacks,[...pending,...detail],logic.LIMITS.historyAttacks);
  state.fetch.attacksAt=Date.now();
}
async function refreshLife(){const due=[...state.enemyMembers].sort((a,b)=>{const aa=status(a)==='Okay'?0:1,bb=status(b)==='Okay'?0:1;return aa!==bb?aa-bb:lastAge(a)-lastAge(b);}).filter(m=>{const r=state.life[String(m.id)];return!r||Date.now()-Number(r.fetchedAt||0)>LIFE_STALE_MS;}).slice(0,MAX_PROFILES);for(const m of due){try{const b=await torn('user/'+m.id+'/profile'),p=b?.profile??b,l=p?.life;if(l&&Number.isFinite(Number(l.current))&&Number.isFinite(Number(l.maximum)))state.life[String(m.id)]={current:Number(l.current),maximum:Number(l.maximum),fetchedAt:Date.now()};}catch(e){safeError(e,'life');}}}
async function refreshClaims(){if(!validKey(state.settings.ffscouterKey))return;const b=await ff('hit-calling/claims');state.claims=b?.claims?.faction&&typeof b.claims.faction==='object'?b.claims.faction:{};state.fetch.claimsAt=Date.now();}
async function claim(id){await ffPost('hit-calling/claim',{target_player_id:Number(id)});await refreshClaims();}
async function unclaim(id){await ffPost('hit-calling/unclaim',{target_player_id:Number(id)});await refreshClaims();}
async function lease(){const n=Date.now(),cur=await GM.getValue(LEASE_KEY,null);if(cur&&cur.owner!==ownerId&&Number(cur.expiresAt)>n)return false;await GM.setValue(LEASE_KEY,{owner:ownerId,expiresAt:n+LEASE_MS});return(await GM.getValue(LEASE_KEY,null))?.owner===ownerId;}
async function releaseLease(){const cur=await GM.getValue(LEASE_KEY,null);if(cur?.owner===ownerId)await GM.setValue(LEASE_KEY,null);}
async function sync(){if(syncing||destroyed)return;if(!(await lease()))return;syncing=true;renderStatus('Refreshing…');try{await refreshRoster();const[statsResult,claimsResult]=await Promise.allSettled([refreshStats(),refreshClaims()]);if(statsResult.status==='rejected')safeError(statsResult.reason,'ffscouter-stats');if(claimsResult.status==='rejected')safeError(claimsResult.reason,'ffscouter-claims');await refreshAttacks();await refreshLife();state.fetch.lastSyncAt=Date.now();await saveState();}catch(e){safeError(e,'sync');await saveState();}finally{syncing=false;render();}}

function claims(id){return Array.isArray(state.claims?.[String(id)])?state.claims[String(id)]:[];}
function defense(){return logic.defensiveBoard({ownMembers:state.ownMembers,enemyMembers:state.enemyMembers,ownIntel:state.intel,enemyIntel:state.intel,attacks:state.attacks,nowSeconds:nowSec()});}
function targets(){const now=nowSec();return state.enemyMembers.map(t=>{const life=state.life[String(t.id)];const observed={...t,lifeCurrent:life?Number(life.current):null,lifeMaximum:life?Number(life.maximum):null,lifeFetchedAt:life?Math.floor(Number(life.fetchedAt)/1000):null};return{t,recommendation:logic.targetRecommendation({target:observed,attackers:state.ownMembers,intelById:state.intel,attacks:state.attacks,nowSeconds:now}),availability:logic.attackAvailability(t,now),claims:claims(t.id)};}).sort((a,b)=>(a.availability.state==='candidate'?0:1)-(b.availability.state==='candidate'?0:1)||lastAge(a.t)-lastAge(b.t));}
function lifeText(id){const r=state.life[String(id)];return r?fmt(r.current)+' / '+fmt(r.maximum)+' · '+age(Date.now()-r.fetchedAt):'—';}
function intelText(id){const x=state.intel[String(id)];if(!x)return'—';return fmt(x.bs_estimate)+' · '+String(x.source||'estimate')+(x.distribution?.distribution_human?' · '+x.distribution.distribution_human:'');}
function reasonLabel(reason){return({'both-attack-capable':'Both currently attack-capable','enemy-active':'Rival currently Online','enemy-recently-active':'Rival recently active','enemy-estimate-much-stronger':'Rival estimate much stronger','enemy-estimate-stronger':'Rival estimate stronger','similar-estimated-strength':'Similar estimated strength','own-estimate-stronger':'Our estimate stronger','recent-observed-enemy-solo-win':'Recent observed enemy solo win','recent-observed-enemy-group-win':'Recent observed enemy group win','one-side-not-okay':'One side not currently attack-capable','insufficient-data':'Insufficient data'})[reason]||String(reason||'');}
function attackUrl(id){return'https://www.torn.com/loader.php?sid=attack&user2ID='+encodeURIComponent(id);}
function profileUrl(id){return'https://www.torn.com/profiles.php?XID='+encodeURIComponent(id);}

function makeUI(){const h=document.createElement('div');h.id='mm-war-intel-host';h.innerHTML='<section id="mm-war-intel-panel" class="mmi-panel" hidden><header class="mmi-head"><div><strong>MM War Intel</strong><span id="mmi-status">Idle</span></div><button id="mmi-close" type="button">×</button></header><nav class="mmi-tabs"><button data-tab="targets">Targets</button><button data-tab="defense">Defense</button><button data-tab="roster">Roster</button><button data-tab="setup">Setup</button></nav><div id="mmi-body" class="mmi-body"></div></section>';document.body.append(h);return{host:h,panel:h.querySelector('#mm-war-intel-panel'),body:h.querySelector('#mmi-body'),status:h.querySelector('#mmi-status'),tab:'targets'};}
function installStyle(){const s=document.createElement('style');s.id='mm-war-intel-style';s.textContent=['#mm-war-intel-host{font-family:Arial,sans-serif}.mmi-panel{position:fixed;z-index:999999;width:min(960px,calc(100vw - 24px));height:min(720px,calc(100vh - 100px));background:#111820;color:#e8edf3;border:1px solid #394959;border-radius:12px;box-shadow:0 16px 44px #0009;overflow:hidden}', '.mmi-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#18222d;cursor:move}.mmi-head>div{display:flex;gap:12px;align-items:baseline}.mmi-head span{font-size:11px;color:#9fb0c0}.mmi-head button{border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer}', '.mmi-tabs{display:flex;gap:4px;padding:8px;background:#0d1319;border-bottom:1px solid #2d3945}.mmi-tabs button,.mmi-btn{background:#223140;border:1px solid #40566c;color:#eef5fb;border-radius:7px;padding:7px 10px;cursor:pointer}.mmi-tabs button[data-active="1"]{background:#365b77}', '.mmi-body{height:calc(100% - 91px);overflow:auto;padding:10px}.mmi-summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:#bfd0df}.mmi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px}.mmi-card{background:#17212b;border:1px solid #2e3d4b;border-radius:9px;padding:9px}.mmi-card h3{margin:0 0 6px;font-size:14px}.mmi-line{display:flex;justify-content:space-between;gap:10px;margin:3px 0;font-size:12px}.mmi-high{border-color:#c85b5b;background:#2a171a}.mmi-watch{border-color:#c59b46}.mmi-good{border-color:#4d8b67}.mmi-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.mmi-actions a{text-decoration:none}.mmi-badge{display:inline-block;padding:2px 6px;border-radius:9px;background:#293b4c;font-size:10px}.mmi-table{width:100%;border-collapse:collapse;font-size:12px}.mmi-table th,.mmi-table td{padding:6px;border-bottom:1px solid #283642;text-align:left;vertical-align:top}.mmi-form{display:grid;gap:9px;max-width:680px}.mmi-form label{display:grid;gap:4px}.mmi-form input{background:#0c1218;color:#fff;border:1px solid #40505f;border-radius:6px;padding:8px}.mmi-note{padding:8px;border:1px solid #40505f;border-radius:7px;background:#121b24;font-size:12px}.mmi-error{color:#ffaaaa}@media(max-width:620px){.mmi-panel{width:calc(100vw - 12px);height:calc(100vh - 90px)}.mmi-grid{grid-template-columns:1fr}.mmi-tabs{overflow-x:auto}}'].join('');document.head.append(s);}
function renderStatus(t){if(ui?.status)ui.status.textContent=t;}
function summary(){return'<div class="mmi-summary"><span>War '+esc(state.war.id||'—')+'</span><span>Opponent '+esc(state.war.enemyFactionId||'—')+'</span><span>Our roster '+state.ownMembers.length+'</span><span>Rivals '+state.enemyMembers.length+'</span><span>Attacks '+state.attacks.length+'</span><span>Updated '+age(Date.now()-state.fetch.lastSyncAt)+' ago</span></div>';}
function renderTargets(){return summary()+'<div class="mmi-grid">'+targets().map(r=>{const t=r.t,rec=r.recommendation,activity=logic.activityBand(t,nowSec()),names=rec.candidates.map(x=>x.member.name).join(', ')||'—',cs=r.claims,count=Number(rec.suggestedCount)||0,damage=rec.projectedDamage==null?'—':fmt(rec.projectedDamage);return'<article class="mmi-card '+(r.availability.state==='candidate'?'mmi-good':'')+'"><h3>'+esc(t.name)+' ['+esc(t.id)+'] <span class="mmi-badge">'+esc(status(t))+'</span></h3><div class="mmi-line"><span>Level</span><strong>'+esc(t.level)+'</strong></div><div class="mmi-line"><span>Life</span><strong>'+esc(lifeText(t.id))+'</strong></div><div class="mmi-line"><span>Activity</span><strong>'+esc(activity)+' · '+esc(t.last_action.relative)+'</strong></div><div class="mmi-line"><span>FFScouter</span><strong>'+esc(intelText(t.id))+'</strong></div><div class="mmi-line"><span>Recommendation</span><strong>'+esc(rec.mode.toUpperCase())+' · '+esc(rec.reason)+'</strong></div><div class="mmi-line"><span>Suggested attackers</span><strong>'+count+' · '+esc(names)+'</strong></div><div class="mmi-line"><span>Projected observed damage</span><strong>'+esc(damage)+'</strong></div><div class="mmi-line"><span>FF claims</span><strong>'+cs.length+(cs.length?' · '+esc(cs.map(c=>c.claimer?.name||c.claimer?.player_id||'?').join(', ')):'')+'</strong></div><div class="mmi-actions"><a class="mmi-btn" target="_blank" rel="noopener" href="'+attackUrl(t.id)+'">Open Attack</a><a class="mmi-btn" target="_blank" rel="noopener" href="'+profileUrl(t.id)+'">Profile</a>'+(validKey(state.settings.ffscouterKey)?'<button class="mmi-btn" data-claim="'+esc(t.id)+'">Claim</button><button class="mmi-btn" data-unclaim="'+esc(t.id)+'">Unclaim</button>':'')+'</div></article>';}).join('')+'</div>';}
function renderDefense(){return summary()+'<div class="mmi-note"><strong>Defensive recommendation only.</strong> The app never hospitalizes a member. HIGH requires an active, currently Okay rival plus strength or observed-fight evidence.</div><div class="mmi-grid" style="margin-top:8px">'+defense().map(r=>'<article class="mmi-card '+(r.riskBand==='high'?'mmi-high':r.riskBand==='watch'?'mmi-watch':'')+'"><h3>'+esc(r.member.name)+' ['+esc(r.member.id)+']</h3><div class="mmi-line"><span>Status</span><strong>'+esc(status(r.member))+'</strong></div><div class="mmi-line"><span>Risk</span><strong>'+esc(r.riskBand.toUpperCase())+' · '+r.riskScore+'/100</strong></div><div class="mmi-line"><span>Top threat</span><strong>'+(r.topThreat?esc(r.topThreat.name)+' ['+esc(r.topThreat.id)+']':'—')+'</strong></div><div class="mmi-line"><span>Evidence</span><strong>'+esc(r.reasons.map(reasonLabel).join('; ')||'none')+'</strong></div>'+(r.recommendHospitalization?'<div class="mmi-note mmi-error"><strong>HOSPITALIZATION SUGGESTED</strong><br>Potential exposure to an active rival with supporting evidence.</div>':'')+'</article>').join('')+'</div>';}
function renderRoster(){const table=(title,rows)=>'<h3>'+title+' ('+rows.length+')</h3><table class="mmi-table"><thead><tr><th>Player</th><th>Lvl</th><th>Status</th><th>Last action</th><th>FFScouter</th></tr></thead><tbody>'+rows.map(m=>'<tr><td><a target="_blank" rel="noopener" href="'+profileUrl(m.id)+'">'+esc(m.name)+' ['+esc(m.id)+']</a></td><td>'+esc(m.level)+'</td><td>'+esc(status(m))+'</td><td>'+esc(m.last_action.relative||'—')+'</td><td>'+esc(intelText(m.id))+'</td></tr>').join('')+'</tbody></table>';return summary()+table('Our faction',state.ownMembers)+table('Rivals',state.enemyMembers);}
function renderSetup(){const es=state.errors.slice(0,6).map(e=>'<div class="mmi-error">'+new Date(e.at).toLocaleTimeString()+' · '+esc(e.source)+' · '+esc(e.message)+'</div>').join(''),hasTorn=validKey(state.settings.tornApiKey),hasFf=validKey(state.settings.ffscouterKey);return'<div class="mmi-form"><div class="mmi-note">Use a Torn custom/limited key that can read faction attacks. FFScouter Premium provides enhanced estimates/distributions and shared hit-calling. Stored keys remain in Tampermonkey storage, are never written back into the Torn page DOM, and are excluded from exports.</div><label>Torn API key<input id="mmi-torn-key" type="password" autocomplete="off" placeholder="'+(hasTorn?'Stored — enter a new key to replace':'Enter 16-character key')+'" value=""></label><label>FFScouter key<input id="mmi-ff-key" type="password" autocomplete="off" placeholder="'+(hasFf?'Stored — enter a new key to replace':'Optional 16-character key')+'" value=""></label><label>Enemy faction ID<input id="mmi-enemy-id" inputmode="numeric" value="'+esc(state.settings.enemyFactionId)+'"></label><label><span><input id="mmi-auto-enemy" type="checkbox" '+(state.settings.autoDetectEnemy?'checked':'')+'> Auto-detect opponent from current ranked war</span></label><div class="mmi-actions"><button id="mmi-save" class="mmi-btn">Save</button><button id="mmi-sync" class="mmi-btn">Sync now</button><button id="mmi-export" class="mmi-btn">Export sanitized intel</button>'+(hasTorn?'<button id="mmi-clear-torn" class="mmi-btn">Clear Torn key</button>':'')+(hasFf?'<button id="mmi-clear-ff" class="mmi-btn">Clear FFScouter key</button>':'')+'</div><div><strong>Recent diagnostics</strong>'+es+'</div></div>';}
function render(){if(!ui||ui.panel.hidden)return;renderStatus(syncing?'Refreshing…':state.fetch.lastSyncAt?'Updated '+age(Date.now()-state.fetch.lastSyncAt)+' ago':'Not synced');ui.panel.querySelectorAll('.mmi-tabs button').forEach(b=>b.dataset.active=b.dataset.tab===ui.tab?'1':'0');ui.body.innerHTML=ui.tab==='defense'?renderDefense():ui.tab==='roster'?renderRoster():ui.tab==='setup'?renderSetup():renderTargets();}
function resetTornDerived(){state.war=emptyState().war;state.ownMembers=[];state.enemyMembers=[];state.life={};state.attacks=[];state.fetch.rosterAt=0;state.fetch.attacksAt=0;state.fetch.lastSyncAt=0;}
function resetFfDerived(){state.intel={};state.claims={};state.fetch.statsAt=0;state.fetch.claimsAt=0;}
async function saveSettings(){const tornInput=ui.body.querySelector('#mmi-torn-key')?.value?.trim()||'',ffInput=ui.body.querySelector('#mmi-ff-key')?.value?.trim()||'',enemy=ui.body.querySelector('#mmi-enemy-id')?.value?.trim()||'';if(tornInput&&!validKey(tornInput))throw new Error('Torn key must be 16 alphanumeric characters.');if(ffInput&&!validKey(ffInput))throw new Error('FFScouter key must be 16 alphanumeric characters.');if(enemy&&!validId(enemy))throw new Error('Enemy faction ID is invalid.');const torn=tornInput||state.settings.tornApiKey,ffkey=ffInput||state.settings.ffscouterKey,tornChanged=torn!==state.settings.tornApiKey,ffChanged=ffkey!==state.settings.ffscouterKey;state.settings={tornApiKey:torn,ffscouterKey:ffkey,enemyFactionId:enemy,autoDetectEnemy:Boolean(ui.body.querySelector('#mmi-auto-enemy')?.checked)};if(tornChanged)resetTornDerived();if(ffChanged)resetFfDerived();await saveState();render();}
async function clearCredential(kind){if(kind==='torn'){state.settings.tornApiKey='';resetTornDerived();}else if(kind==='ff'){state.settings.ffscouterKey='';resetFfDerived();}await saveState();render();}
async function exportClean(){const b=new Blob([JSON.stringify(logic.sanitizeState(state),null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='war-intel.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function bind(){ui.host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='mmi-close'){ui.panel.hidden=true;return;}if(b.dataset.tab){ui.tab=b.dataset.tab;render();return;}if(b.id==='mmi-save'){void saveSettings().catch(x=>{safeError(x,'setup');render();});return;}if(b.id==='mmi-sync'){void sync();return;}if(b.id==='mmi-export'){void exportClean();return;}if(b.id==='mmi-clear-torn'){void clearCredential('torn');return;}if(b.id==='mmi-clear-ff'){void clearCredential('ff');return;}if(b.dataset.claim){void claim(b.dataset.claim).then(saveState).then(render).catch(x=>{safeError(x,'claim');render();});return;}if(b.dataset.unclaim){void unclaim(b.dataset.unclaim).then(saveState).then(render).catch(x=>{safeError(x,'unclaim');render();});}});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ui.panel.hidden){ui.panel.hidden=true;launcher?.focus();}});}
async function boot(){if(!logic)throw new Error('War intelligence logic dependency unavailable.');if(!core||typeof core.registerDockLauncher!=='function'||typeof core.makePanelDraggable!=='function')throw new Error('Shared MM Torn Core dependency unavailable.');state=await loadState();ui=makeUI();installStyle();launcher=core.registerDockLauncher({id:MODULE_ID,label:'MM War Intel',accent:'#9d4f57',icon:'<span aria-hidden="true" style="font-weight:900;font-size:16px">W</span>',onClick(e){if(!e?.isTrusted||destroyed)return;ui.panel.hidden=!ui.panel.hidden;if(!ui.panel.hidden){render();if(validKey(state.settings.tornApiKey))void sync();}}});if(!(launcher instanceof HTMLElement))throw new Error('Shared MM dock launcher could not be registered.');core.makePanelDraggable(ui.panel,ui.panel.querySelector('.mmi-head'),MODULE_ID,{right:'12px',top:'82px'});bind();valueListener=await GM.addValueChangeListener(STATE_KEY,(_k,_o,n,remote)=>{if(!remote||destroyed)return;const incoming=normalize(n);if(incoming.revision>=state.revision){state=incoming;render();}});ticker=setInterval(()=>{if(!document.hidden&&validKey(state.settings.tornApiKey))void sync();},REFRESH_MS);if(validKey(state.settings.tornApiKey))void sync();}
function cleanup(){destroyed=true;if(ticker)clearInterval(ticker);if(valueListener!=null)void GM.removeValueChangeListener(valueListener);void releaseLease();if(typeof ui?.panel?.__mmPanelDragCleanup==='function')ui.panel.__mmPanelDragCleanup();launcher?.remove();ui?.host?.remove();}
window.addEventListener('pagehide',cleanup,{once:true});
void boot().catch(e=>console.error(APP,String(e?.message||e).replace(/[A-Za-z0-9]{16}/g,'[redacted]')));
})();
