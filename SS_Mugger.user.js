// ==UserScript==
// @name         SS_Mugger
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      1.0.0
// @description  API-first mug target acquisition from Bazaar, Item Market, Points Market and completed auctions. No automated attacks.
// @author       MM Torn Systems
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-market-mug-signals/SS_Mugger.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-market-mug-signals/SS_Mugger.user.js
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const asInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const pick = (obj, keys, fallback = undefined) => {
  for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  return fallback;
};

function normalizeMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function normalizeBazaarSnapshot(payload, observedAt = Math.floor(Date.now() / 1000)) {
  const raw = Array.isArray(payload?.bazaar) ? payload.bazaar : [];
  const items = raw.map((item) => ({
    itemId: String(pick(item, ['ID', 'id', 'item_id'], '')),
    uid: String(pick(item, ['UID', 'uid'], '') || ''),
    name: String(pick(item, ['name', 'item_name'], 'Unknown item')),
    quantity: Math.max(0, asInt(pick(item, ['quantity', 'amount'], 0))),
    price: normalizeMoney(pick(item, ['price'], 0)),
    marketPrice: normalizeMoney(pick(item, ['market_price', 'marketPrice'], 0))
  })).filter((x) => x.itemId && x.quantity > 0 && x.price >= 0);
  return {
    reportedAt: Math.max(0, asInt(pick(payload, ['bazaar_timestamp', 'timestamp'], observedAt), observedAt)),
    isOpen: Boolean(pick(payload, ['bazaar_is_open', 'is_open'], true)),
    items
  };
}

function bazaarKey(item) {
  return item.uid ? `uid:${item.uid}` : `item:${item.itemId}`;
}

function aggregateBazaar(items) {
  const map = new Map();
  for (const item of items) {
    const key = bazaarKey(item);
    const prior = map.get(key);
    if (!prior) map.set(key, {...item});
    else {
      prior.quantity += item.quantity;
      if (prior.price !== item.price) prior.priceMixed = true;
      prior.price = Math.max(prior.price, item.price);
    }
  }
  return map;
}

function diffBazaarSnapshots(previous, current) {
  if (!previous || !current || current.reportedAt <= previous.reportedAt) return [];
  const prev = aggregateBazaar(previous.items || []);
  const curr = aggregateBazaar(current.items || []);
  const signals = [];
  for (const [key, oldItem] of prev.entries()) {
    const next = curr.get(key);
    if (next && next.quantity >= oldItem.quantity) continue;
    const soldQty = next ? oldItem.quantity - next.quantity : oldItem.quantity;
    if (soldQty <= 0) continue;
    const priceChanged = Boolean(next && next.price !== oldItem.price);
    const removed = !next;
    signals.push({
      source: 'bazaar',
      itemId: oldItem.itemId,
      uid: oldItem.uid,
      itemName: oldItem.name,
      soldQty,
      unitPrice: oldItem.price,
      grossValue: soldQty * oldItem.price,
      previousReportedAt: previous.reportedAt,
      reportedAt: current.reportedAt,
      confidence: removed || priceChanged ? 'medium' : 'high',
      evidence: removed ? 'listing_removed' : priceChanged ? 'quantity_drop_with_price_change' : 'quantity_drop_same_price'
    });
  }
  return signals;
}

const BAZAAR_DIRECTORY_PRIORITY = Object.freeze({
  top_grossing: 100,
  bulk: 88,
  advanced_item: 82,
  bargain: 74,
  trending: 68,
  busiest: 62,
  most_popular: 58,
  dollar_sale: 30,
  specialized: 52
});

const BAZAAR_METRIC_FIELDS = Object.freeze({
  top_grossing: 'weekly_income',
  bulk: 'bulk_sales',
  advanced_item: 'advanced_item_sales',
  bargain: 'bargain_sales',
  trending: 'recent_favorites',
  busiest: 'weekly_customers',
  most_popular: 'total_favorites',
  dollar_sale: 'dollar_sales',
  specialized: 'weekly_customers'
});

function normalizeBazaarDirectory(payload) {
  const root = payload?.bazaar && typeof payload.bazaar === 'object' ? payload.bazaar : {};
  const merged = new Map();
  for (const [bucket, rows] of Object.entries(root)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const sellerId = String(pick(row, ['id', 'ID', 'user_id'], '') || '');
      if (!/^\d+$/.test(sellerId)) continue;
      const metricField = BAZAAR_METRIC_FIELDS[bucket] || '';
      const metric = metricField ? Math.max(0, Number(row?.[metricField]) || 0) : 0;
      const base = BAZAAR_DIRECTORY_PRIORITY[bucket] || 40;
      const metricBoost = metric > 0 ? Math.min(60, Math.log10(metric + 1) * 6) : 0;
      const existing = merged.get(sellerId) || {
        sellerId,
        sellerName: String(pick(row, ['name'], `Player ${sellerId}`)),
        isOpen: row?.is_open !== false,
        discoveryScore: 0,
        buckets: [],
        metrics: {}
      };
      existing.isOpen = existing.isOpen && row?.is_open !== false;
      existing.discoveryScore = Math.max(existing.discoveryScore, base + metricBoost);
      if (!existing.buckets.includes(bucket)) existing.buckets.push(bucket);
      if (metricField) existing.metrics[metricField] = Math.max(existing.metrics[metricField] || 0, metric);
      merged.set(sellerId, existing);
    }
  }
  return [...merged.values()].sort((a, b) => b.discoveryScore - a.discoveryScore || a.sellerId.localeCompare(b.sellerId));
}

function marketRoot(payload) {
  if (payload?.itemmarket && !Array.isArray(payload.itemmarket)) return payload.itemmarket;
  if (payload?.item_market && !Array.isArray(payload.item_market)) return payload.item_market;
  return payload || {};
}

function marketListings(payload) {
  if (Array.isArray(payload)) return payload;
  const root = marketRoot(payload);
  if (Array.isArray(root)) return root;
  for (const key of ['listings', 'itemmarket', 'item_market']) if (Array.isArray(root?.[key])) return root[key];
  return [];
}

function listingUid(listing) {
  return String(pick(listing, ['uid', 'UID'], pick(listing?.item_details, ['uid', 'UID'], '')) || '');
}

function normalizeMarketSnapshot(payload, observedAt = Math.floor(Date.now() / 1000)) {
  const root = marketRoot(payload);
  const listings = marketListings(payload).map((listing) => ({
    price: normalizeMoney(pick(listing, ['price'], 0)),
    amount: Math.max(0, asInt(pick(listing, ['amount', 'quantity'], 1), 1)),
    uid: listingUid(listing),
    rawId: String(pick(listing, ['id', 'listing_id'], '') || '')
  })).filter((x) => x.price >= 0 && x.amount >= 0);
  return {
    reportedAt: Math.max(0, asInt(pick(root, ['cache_timestamp', 'timestamp'], observedAt), observedAt)),
    cacheDelay: Math.max(0, asInt(pick(root, ['cache_delay'], 0), 0)),
    listings
  };
}

function marketEvidence(snapshot, fingerprint) {
  if (!snapshot || !fingerprint) return {mode: 'none', count: 0, totalQty: 0, unique: false};
  const uid = String(fingerprint.uid || '');
  const price = normalizeMoney(fingerprint.price);
  const matches = uid
    ? snapshot.listings.filter((l) => l.uid && l.uid === uid)
    : snapshot.listings.filter((l) => l.price === price);
  return {
    mode: uid ? 'uid' : 'price',
    count: matches.length,
    totalQty: matches.reduce((sum, l) => sum + Math.max(1, asInt(l.amount, 1)), 0),
    unique: matches.length === 1,
    listing: matches.length === 1 ? matches[0] : null
  };
}

function establishMarketBaseline(snapshot, fingerprint) {
  const evidence = marketEvidence(snapshot, fingerprint);
  const observedAmount = Math.max(1, asInt(fingerprint?.amount, 1));
  if (evidence.mode === 'uid' && evidence.unique) {
    return {ok: true, ...evidence, quantity: evidence.totalQty, reportedAt: snapshot.reportedAt, reason: 'unique_uid'};
  }
  if (evidence.mode === 'price' && evidence.unique && evidence.totalQty === observedAmount) {
    return {ok: true, ...evidence, quantity: evidence.totalQty, reportedAt: snapshot.reportedAt, reason: 'unique_price_and_amount'};
  }
  return {ok: false, ...evidence, quantity: evidence.totalQty, reportedAt: snapshot.reportedAt, reason: evidence.count > 1 ? 'ambiguous_api_listing' : 'api_baseline_not_found'};
}

function diffMarketBaseline(baseline, currentSnapshot, fingerprint) {
  if (!baseline?.ok || !currentSnapshot || currentSnapshot.reportedAt <= baseline.reportedAt) return {signal: null, baseline};
  const evidence = marketEvidence(currentSnapshot, fingerprint);
  if (evidence.count > 1) {
    return {signal: null, baseline: {...baseline, reportedAt: currentSnapshot.reportedAt, ambiguous: true}, state: 'ambiguous'};
  }
  const currentQty = evidence.totalQty;
  const previousQty = Math.max(0, asInt(baseline.quantity, 0));
  if (currentQty >= previousQty) {
    return {signal: null, baseline: {...baseline, quantity: currentQty, reportedAt: currentSnapshot.reportedAt, ambiguous: false}, state: 'unchanged'};
  }
  const soldQty = previousQty - currentQty;
  const signal = {
    source: 'itemmarket',
    itemId: String(fingerprint.itemId || ''),
    uid: String(fingerprint.uid || ''),
    itemName: String(fingerprint.itemName || 'Unknown item'),
    soldQty,
    unitPrice: normalizeMoney(fingerprint.price),
    grossValue: soldQty * normalizeMoney(fingerprint.price),
    previousReportedAt: baseline.reportedAt,
    reportedAt: currentSnapshot.reportedAt,
    confidence: fingerprint.uid ? 'high' : currentQty === 0 ? 'medium' : 'high',
    evidence: fingerprint.uid ? 'unique_uid_quantity_drop' : currentQty === 0 ? 'unique_price_listing_removed' : 'unique_price_quantity_drop'
  };
  return {signal, baseline: {...baseline, quantity: currentQty, reportedAt: currentSnapshot.reportedAt, ambiguous: false}, state: 'decreased'};
}

function normalizePointsMarket(payload, observedAt = Math.floor(Date.now() / 1000)) {
  const rows = Array.isArray(payload?.pointsmarket) ? payload.pointsmarket : Array.isArray(payload) ? payload : [];
  return {
    observedAt: Math.max(0, asInt(observedAt, Math.floor(Date.now() / 1000))),
    listings: rows.map((row) => ({
      listingId: String(pick(row, ['id', 'ID', 'listing_id'], '') || ''),
      quantity: Math.max(0, asInt(pick(row, ['quantity', 'amount'], 0))),
      cost: normalizeMoney(pick(row, ['cost', 'price'], 0)),
      totalCost: normalizeMoney(pick(row, ['total_cost', 'totalCost'], 0))
    })).filter((x) => x.listingId && x.quantity > 0 && x.cost > 0)
  };
}

function establishPointsBaseline(snapshot, fingerprint) {
  if (!snapshot) return {ok:false, reason:'missing_snapshot', observedAt:0};
  const cost = normalizeMoney(fingerprint?.cost ?? fingerprint?.price);
  const explicitId = String(fingerprint?.listingId || '');
  let matches = explicitId ? snapshot.listings.filter((x)=>x.listingId === explicitId) : snapshot.listings.filter((x)=>x.cost === cost);
  if (matches.length !== 1) return {
    ok:false, reason:matches.length > 1 ? 'ambiguous_points_listing' : 'points_baseline_not_found',
    observedAt:snapshot.observedAt, count:matches.length, cost
  };
  const listing = matches[0];
  return {ok:true, reason:explicitId ? 'listing_id' : 'unique_cost', observedAt:snapshot.observedAt, listingId:listing.listingId, quantity:listing.quantity, cost:listing.cost};
}

function diffPointsBaseline(baseline, currentSnapshot) {
  if (!baseline?.ok || !currentSnapshot || currentSnapshot.observedAt <= baseline.observedAt) return {signal:null, baseline};
  const listing = currentSnapshot.listings.find((x)=>x.listingId === String(baseline.listingId));
  if (listing && listing.quantity >= baseline.quantity) {
    const repriced = listing.cost !== baseline.cost;
    return {signal:null, baseline:{...baseline, observedAt:currentSnapshot.observedAt, quantity:listing.quantity, cost:listing.cost}, state:repriced ? 'repriced' : 'unchanged'};
  }
  const soldQty = listing ? Math.max(0, baseline.quantity - listing.quantity) : baseline.quantity;
  if (soldQty <= 0) return {signal:null, baseline:{...baseline, observedAt:currentSnapshot.observedAt}, state:'unchanged'};
  const signal = {
    source:'pointsmarket', itemId:'points', uid:'', itemName:'Points', soldQty,
    unitPrice:baseline.cost, grossValue:soldQty * baseline.cost,
    previousReportedAt:baseline.observedAt, reportedAt:currentSnapshot.observedAt,
    confidence:listing ? 'high' : 'medium',
    evidence:listing ? 'points_listing_quantity_drop' : 'points_listing_removed',
    requiresInactiveSinceBaseline:true
  };
  return {signal, baseline:{...baseline, observedAt:currentSnapshot.observedAt, quantity:listing?.quantity || 0, cost:listing?.cost || baseline.cost}, state:'decreased'};
}

function normalizeAuctionHouse(payload, observedAt = Math.floor(Date.now() / 1000)) {
  const rows = Array.isArray(payload?.auctionhouse) ? payload.auctionhouse : Array.isArray(payload) ? payload : [];
  return rows.map((row) => {
    const seller = row?.seller || {};
    const buyer = row?.buyer || {};
    const item = row?.item || {};
    return {
      listingId: String(pick(row, ['id', 'listing_id'], '') || ''),
      sellerId: String(pick(seller, ['id', 'user_id'], '') || ''),
      sellerName: String(pick(seller, ['name'], '') || ''),
      buyerId: String(pick(buyer, ['id', 'user_id'], '') || ''),
      buyerName: String(pick(buyer, ['name'], '') || ''),
      endedAt: Math.max(0, asInt(pick(row, ['timestamp', 'ended_at'], 0))),
      price: normalizeMoney(pick(row, ['price'], 0)),
      bids: Math.max(0, asInt(pick(row, ['bids'], 0))),
      itemId: String(pick(item, ['id', 'ID', 'item_id'], '') || ''),
      itemName: String(pick(item, ['name'], 'Auction item')),
      observedAt
    };
  }).filter((x) => x.listingId && /^\d+$/.test(x.sellerId) && x.endedAt > 0 && x.price > 0);
}

function auctionSignalsSince(auctions, seenListingIds = [], observedAt = Math.floor(Date.now() / 1000), lookbackSeconds = 600) {
  const seen = new Set((seenListingIds || []).map(String));
  const floor = Math.max(0, observedAt - Math.max(30, asInt(lookbackSeconds, 600)));
  const signals = [];
  const newlySeen = [];
  for (const auction of auctions || []) {
    const id = String(auction.listingId || '');
    if (!id || seen.has(id)) continue;
    newlySeen.push(id);
    if (!auction.buyerId || auction.endedAt < floor || auction.endedAt > observedAt + 120) continue;
    signals.push({
      source: 'auctionhouse',
      itemId: auction.itemId,
      uid: '',
      itemName: auction.itemName || 'Auction item',
      soldQty: 1,
      unitPrice: auction.price,
      grossValue: auction.price,
      previousReportedAt: Math.max(0, auction.endedAt - 1),
      reportedAt: auction.endedAt,
      confidence: 'high',
      evidence: 'completed_auction',
      listingId: id,
      sellerId: auction.sellerId,
      sellerName: auction.sellerName,
      buyerId: auction.buyerId,
      buyerName: auction.buyerName
    });
  }
  return {signals, newlySeen};
}


function normalizeBattleStats(payload) {
  const root = payload?.battlestats && typeof payload.battlestats === 'object' ? payload.battlestats : (payload || {});
  const readStat = (name) => {
    const raw = root?.[name];
    if (typeof raw === 'number') return Math.max(0, raw);
    if (!raw || typeof raw !== 'object') return 0;
    for (const key of ['total', 'value', 'modified', 'amount']) {
      const n = Number(raw?.[key]);
      if (Number.isFinite(n)) return Math.max(0, n);
    }
    return 0;
  };
  const strength = readStat('strength');
  const speed = readStat('speed');
  const defense = readStat('defense');
  const dexterity = readStat('dexterity');
  return {strength, speed, defense, dexterity, total: strength + speed + defense + dexterity};
}


function normalizeMugMerits(userMeritsPayload, tornMeritsPayload = null) {
  const catalog = new Map();
  const catalogRows = Array.isArray(tornMeritsPayload?.merits) ? tornMeritsPayload.merits : Array.isArray(tornMeritsPayload) ? tornMeritsPayload : [];
  for (const row of catalogRows) {
    const id = asInt(row?.id, 0);
    const name = String(row?.name || row?.title || '').trim();
    if (id && name) catalog.set(id, name);
  }
  let level = 0;
  const root = userMeritsPayload?.merits ?? userMeritsPayload ?? {};
  const rows = Array.isArray(root) ? root : Array.isArray(root?.upgrades) ? root.upgrades : null;
  if (rows) {
    for (const row of rows) {
      const id = asInt(row?.id, 0);
      const name = String(row?.name || catalog.get(id) || '').trim().toLowerCase();
      if (name === 'masterful looting' || id === 5) level = Math.max(level, asInt(row?.level, 0));
    }
  } else if (root && typeof root === 'object') {
    for (const [key, value] of Object.entries(root)) {
      const normalized = String(key).replace(/[_-]+/g, ' ').trim().toLowerCase();
      if (normalized === 'masterful looting' || normalized === '5') {
        const raw = typeof value === 'object' ? (value?.level ?? value?.value ?? 0) : value;
        level = Math.max(level, asInt(raw, 0));
      }
    }
  }
  level = Math.max(0, Math.min(10, level));
  const available = Math.max(0, asInt(root?.available, 0));
  const used = Math.max(0, asInt(root?.used, 0));
  const medals = Math.max(0, asInt(root?.medals, 0));
  const honors = Math.max(0, asInt(root?.honors, 0));
  return {masterfulLevel: level, masterfulBonusPercent: level * 5, available, used, medals, honors};
}

function normalizeAwards(medalsPayload, honorsPayload) {
  const medalsRoot = medalsPayload?.medals ?? medalsPayload ?? [];
  const honorsRoot = honorsPayload?.honors ?? honorsPayload ?? [];
  const countRows = (root) => Array.isArray(root) ? root.length : root && typeof root === 'object' ? Object.keys(root).length : 0;
  return {medals: countRows(medalsRoot), honors: countRows(honorsRoot), total: countRows(medalsRoot) + countRows(honorsRoot)};
}

function extractPlunderPercent(equipmentPayload) {
  let best = 0;
  const seen = new Set();
  const walk = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 12) return;
    if (typeof value === 'string') {
      const m = /plunder[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%?/i.exec(value);
      if (m) best = Math.max(best, Number(m[1]) || 0);
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const label = [value.name, value.title, value.type, value.bonus, value.description].filter((x)=>typeof x === 'string').join(' ');
    if (/\bplunder\b/i.test(label)) {
      for (const key of ['value','percent','percentage','modifier','amount']) {
        const n = Number(value?.[key]);
        if (Number.isFinite(n)) best = Math.max(best, n);
      }
      const m = /(\d+(?:\.\d+)?)\s*%/.exec(label);
      if (m) best = Math.max(best, Number(m[1]) || 0);
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(equipmentPayload);
  return Math.max(0, Math.min(100, best));
}

function mugReturnEstimate(exposure, {meritBonusPercent = 0, plunderPercent = 0, otherBonusPercent = 0, targetReductionPercent = 0, planningBasePercent = 6} = {}) {
  const cash = Math.max(0, Number(exposure) || 0);
  const merits = Math.max(0, Number(meritBonusPercent) || 0);
  const plunder = Math.max(0, Number(plunderPercent) || 0);
  const other = Math.max(0, Number(otherBonusPercent) || 0);
  const reduction = Math.max(0, Math.min(100, Number(targetReductionPercent) || 0));
  const planningBase = Math.max(5, Math.min(10, Number(planningBasePercent) || 6));
  const multiplier = 1 + (merits + plunder + other) / 100;
  const reductionFactor = 1 - reduction / 100;
  const minPercent = 5 * multiplier * reductionFactor;
  const planningPercent = planningBase * multiplier * reductionFactor;
  const maxPercent = 10 * multiplier * reductionFactor;
  return {
    exposure: cash,
    modifierPercent: merits + plunder + other,
    meritBonusPercent: merits,
    plunderPercent: plunder,
    otherBonusPercent: other,
    targetReductionPercent: reduction,
    planningBasePercent: planningBase,
    minPercent,
    planningPercent,
    maxPercent,
    minAmount: Math.round(cash * minPercent / 100),
    planningAmount: Math.round(cash * planningPercent / 100),
    maxAmount: Math.round(cash * maxPercent / 100)
  };
}

function targetMugProtection(jobPayload) {
  const job = jobPayload?.job ?? jobPayload ?? null;
  if (!job || typeof job !== 'object') return {known:false, reductionPercent:0, reason:'job_unknown'};
  if (job.type === 'company' && asInt(job.type_id, 0) === 5 && asInt(job.rating, 0) >= 7) {
    return {known:true, reductionPercent:75, reason:'7star_clothing_store', companyRating:asInt(job.rating, 0)};
  }
  return {known:true, reductionPercent:0, reason:'none', companyRating:job.type === 'company' ? asInt(job.rating, 0) : null};
}

function targetProfileFeatures(profile, now = Math.floor(Date.now() / 1000)) {
  const level = Math.max(0, asInt(profile?.level, 0));
  const signUp = Math.max(0, asInt(pick(profile, ['sign_up', 'signup', 'signup_timestamp'], 0), 0));
  const daysOld = signUp > 0 && now >= signUp ? Math.floor((now - signUp) / 86400) : null;
  const lifeCurrent = Math.max(0, asInt(profile?.life?.current, 0));
  const lifeMaximum = Math.max(0, asInt(pick(profile?.life, ['maximum', 'max'], 0), 0));
  const lifePercent = lifeMaximum > 0 ? Math.max(0, Math.min(100, Math.round((lifeCurrent / lifeMaximum) * 100))) : null;
  const ageBand = daysOld === null ? 'unknown' : daysOld < 365 ? '<1y' : daysOld < 1000 ? '1-3y' : daysOld < 2500 ? '3-7y' : '7y+';
  const levelBand = level <= 15 ? '1-15' : level <= 30 ? '16-30' : level <= 50 ? '31-50' : level <= 75 ? '51-75' : '76+';
  const lifeBand = lifePercent === null ? 'unknown' : lifePercent <= 25 ? '0-25%' : lifePercent <= 50 ? '26-50%' : lifePercent <= 75 ? '51-75%' : '76-100%';
  return {level, signUp, daysOld, lifeCurrent, lifeMaximum, lifePercent, ageBand, levelBand, lifeBand};
}

function combatEstimate(ownerBattleStats, targetProfile, knownTargetBattleStats = null) {
  const own = normalizeBattleStats(ownerBattleStats);
  if (!(own.total > 0)) return {available:false, winProbability:null, defeatProbability:null, confidence:'unavailable', method:'missing_customer_battlestats'};
  const known = knownTargetBattleStats ? normalizeBattleStats(knownTargetBattleStats) : null;
  if (known?.total > 0) {
    const ratio = Math.log10((own.total + 1) / (known.total + 1));
    const win = Math.max(2, Math.min(98, Math.round(100 / (1 + Math.exp(-3.2 * ratio)))));
    return {available:true, winProbability:win, defeatProbability:100-win, confidence:'high', method:'known_target_battlestats', ownTotal:own.total};
  }
  const f = targetProfileFeatures(targetProfile);
  const ownPower = Math.log10(own.total + 1) * 18;
  const ageRisk = f.daysOld === null ? 42 : Math.min(64, Math.log10(f.daysOld + 10) * 18);
  const levelRisk = Math.min(70, f.level * 0.72);
  const lifeRisk = f.lifePercent === null ? 14 : (f.lifePercent / 100) * 22;
  const targetRisk = ageRisk + levelRisk + lifeRisk;
  const margin = ownPower - targetRisk;
  let win = Math.round(100 / (1 + Math.exp(-margin / 13)));
  win = Math.max(8, Math.min(92, win));
  return {available:true, winProbability:win, defeatProbability:100-win, confidence:'low', method:'profile_only_estimate', ownTotal:own.total, targetRisk:Math.round(targetRisk)};
}

function profileSuitability(profile) {
  const state = String(profile?.status?.state || profile?.status?.description || '').trim();
  const activity = String(profile?.last_action?.status || profile?.lastAction?.status || '').trim();
  const stateRank = state === 'Okay' ? 3 : state === 'Abroad' ? 1 : 0;
  const activityRank = activity === 'Offline' ? 3 : activity === 'Idle' ? 2 : activity === 'Online' ? 1 : 0;
  const features = targetProfileFeatures(profile);
  return {
    state,
    activity,
    attackableNow: state === 'Okay',
    stateRank,
    activityRank,
    ...features,
    factionId: profile?.faction_id === null || profile?.faction_id === undefined ? null : asInt(profile.faction_id, 0)
  };
}

function candidateGate(signal, profile, minGrossValue = 0) {
  if (!signal) return {eligible: false, reason: 'missing_signal'};
  if (signal.grossValue < normalizeMoney(minGrossValue)) return {eligible: false, reason: 'below_minimum_value'};
  const lastAction = asInt(profile?.last_action?.timestamp ?? profile?.lastAction?.timestamp, 0);
  if (!lastAction) return {eligible: false, reason: 'missing_last_action'};
  if (lastAction >= signal.reportedAt) return {eligible: false, reason: 'acted_since_signal', lastAction};
  if (signal.requiresInactiveSinceBaseline && lastAction > signal.previousReportedAt) return {eligible:false, reason:'acted_during_detection_window', lastAction};
  const suitability = profileSuitability(profile);
  return {
    eligible: true,
    reason: 'inactive_since_signal',
    lastAction,
    inactivitySeconds: Math.max(0, signal.reportedAt - lastAction),
    confidence: lastAction <= signal.previousReportedAt && signal.confidence === 'high' ? 'high' : signal.confidence,
    ...suitability
  };
}

function candidateScore(candidate, now = Math.floor(Date.now() / 1000)) {
  const confidence = {high: 300, medium: 210, low: 120};
  const source = {auctionhouse: 95, 'multi-source': 105, bazaar: 75, itemmarket: 70, pointsmarket: 60, propertymarket: 55};
  const mugValue = Number(candidate?.mugEstimate?.planningAmount);
  const gross = Math.max(1, Number.isFinite(mugValue) && mugValue > 0 ? mugValue : (Number(candidate?.grossValue) || 1));
  const ageSeconds = Math.max(0, now - Math.max(0, asInt(candidate?.signalAt, 0)));
  const freshness = Math.max(0, 120 - ageSeconds / 15);
  const attackability = candidate?.attackableNow ? 90 : candidate?.statusState === 'Abroad' ? 10 : -30;
  const activity = candidate?.activityStatus === 'Offline' ? 30 : candidate?.activityStatus === 'Idle' ? 18 : candidate?.activityStatus === 'Online' ? 2 : 0;
  const stalePenalty = candidate?.stale ? -1000 : 0;
  const signalCount = Math.max(1, asInt(candidate?.signalCount, 1));
  const repeatSignalBonus = Math.min(70, (signalCount - 1) * 18);
  const winProbability = Number(candidate?.winProbability);
  const combatWeight = Number.isFinite(winProbability) ? Math.max(-35, Math.min(110, (winProbability - 50) * 2.2)) : 0;
  const weakenedLifeBonus = Number.isFinite(Number(candidate?.lifePercent)) ? Math.max(0, (100 - Number(candidate.lifePercent)) * 0.35) : 0;
  return (confidence[candidate?.confidence] || 0)
    + (source[candidate?.source] || 40)
    + Math.min(180, Math.log10(gross) * 24)
    + freshness
    + attackability
    + activity
    + repeatSignalBonus
    + combatWeight
    + weakenedLifeBonus
    + stalePenalty;
}

function filterCandidates(candidates, {minPayout = 0, minWinProbability = 0, readyOnly = false} = {}) {
  const payoutFloor = Math.max(0, Number(minPayout) || 0);
  const winFloor = Math.max(0, Math.min(100, Number(minWinProbability) || 0));
  return [...(Array.isArray(candidates) ? candidates : [])].filter((candidate) => {
    if (readyOnly && (candidate?.stale || !candidate?.attackableNow)) return false;
    const payout = Number(candidate?.mugEstimate?.planningAmount);
    if (payoutFloor > 0 && (!Number.isFinite(payout) || payout < payoutFloor)) return false;
    const win = Number(candidate?.winProbability);
    if (winFloor > 0 && (!Number.isFinite(win) || win < winFloor)) return false;
    return true;
  });
}

function rankCandidates(candidates, now = Math.floor(Date.now() / 1000)) {
  return [...candidates].sort((a, b) =>
    candidateScore(b, now) - candidateScore(a, now) ||
    (b.grossValue || 0) - (a.grossValue || 0) ||
    (b.signalAt || 0) - (a.signalAt || 0)
  );
}


  const APP = 'SS_Mugger';
  const VERSION = '1.0.0';
  const PREFIX = 'mm_market_mug_signals_v1';
  const LICENSED_USER_ID = '2256339';
  const LICENSED_USER_NAME = 'SuperSport';
  const STORE = {
    key: `${PREFIX}:api_key`,
    watches: `${PREFIX}:watches`,
    candidates: `${PREFIX}:candidates`,
    settings: `${PREFIX}:settings`,
    rejections: `${PREFIX}:rejections`,
    errors: `${PREFIX}:errors`,
    discovery: `${PREFIX}:discovery`,
    seenAuctions: `${PREFIX}:seen_auctions`
  };
  const DEFAULTS = Object.freeze({
    marketPollSeconds: 30,
    pointsPollSeconds: 20,
    bazaarPollSeconds: 45,
    autoBazaarPollSeconds: 90,
    minGrossValue: 1_000_000,
    autoCapture: true,
    autoBazaarDiscovery: true,
    bazaarDiscoveryMinutes: 10,
    autoBazaarWatchCap: 24,
    auctionDiscovery: true,
    auctionPollSeconds: 20,
    auctionLookbackSeconds: 600,
    excludeOwnFaction: true,
    notifications: true,
    requestBudgetPerMinute: 45,
    candidateRetentionMinutes: 30,
    candidateRecheckSeconds: 30,
    combatScoring: true,
    manualPlunderPercent: 0,
    otherMugBonusPercent: 0,
    planningBaseMugPercent: 6,
    mugProfileRefreshMinutes: 30,
    detectTargetMugProtection: true,
    minDisplayPayout: 0,
    minDisplayWinProbability: 0,
    displayReadyOnly: false
  });

  const nowSec = () => Math.floor(Date.now() / 1000);
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const money = (n) => `$${Math.max(0, Number(n) || 0).toLocaleString('en-US')}`;
  const age = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d`;
  };
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readJson(key, fallback) {
    try {
      const raw = GM_getValue(key, '');
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }
  function writeJson(key, value) {
    GM_setValue(key, JSON.stringify(value));
  }

  let settings = {...DEFAULTS, ...readJson(STORE.settings, {})};
  let watches = readJson(STORE.watches, []);
  let candidates = readJson(STORE.candidates, []);
  let rejections = readJson(STORE.rejections, []);
  let errors = readJson(STORE.errors, []);
  let discovery = readJson(STORE.discovery, {nextBazaarAt:0,nextAuctionAt:0,nextCandidateAt:0,categoryIndex:0,owner:null});
  let seenAuctions = readJson(STORE.seenAuctions, []);
  let apiKey = String(GM_getValue(STORE.key, '') || '').trim();
  let ownerBattleStats = null;
  let ownerBattleStatsStatus = 'not-loaded';
  let ownerBattleStatsAttempted = false;
  let ownerMugProfile = {status:'not-loaded', masterfulLevel:0, masterfulBonusPercent:0, detectedPlunderPercent:0, effectivePlunderPercent:0, otherBonusPercent:0, awards:{medals:0,honors:0,total:0}, merits:{available:0,used:0}, refreshedAt:0};
  let ownerMugProfileNextAt = 0;
  let licenseState = {status: apiKey ? 'pending' : 'needs-key', checkedAt:0, ownerId:'', ownerName:''};
  let licenseCheckInFlight = null;
  let paused = false;
  let schedulerBusy = false;
  let panelOpen = false;
  let lastCaptureUrl = '';
  const recentCalls = [];
  const BAZAAR_DISCOVERY_CATEGORIES = ['Drug','Primary','Secondary','Melee','Defensive','Booster','Energy Drink','Enhancer','Supply Pack','Collectible'];

  const saveWatches = () => writeJson(STORE.watches, watches.slice(-600));
  const saveCandidates = () => writeJson(STORE.candidates, candidates.slice(-250));
  const saveRejections = () => writeJson(STORE.rejections, rejections.slice(-150));
  const saveErrors = () => writeJson(STORE.errors, errors.slice(-100));
  const saveDiscovery = () => writeJson(STORE.discovery, discovery);
  const saveSeenAuctions = () => writeJson(STORE.seenAuctions, seenAuctions.slice(-1000));
  const saveSettings = () => writeJson(STORE.settings, settings);

  function logError(scope, error) {
    const message = String(error?.message || error || 'Unknown error').replace(apiKey, '[redacted]');
    errors.push({at: nowSec(), scope, message: message.slice(0, 500)});
    saveErrors();
    console.warn(`[${APP}] ${scope}:`, message);
    render();
  }

  function trimState() {
    const cutoff = nowSec() - Math.max(5, Number(settings.candidateRetentionMinutes) || 30) * 60;
    candidates = candidates.filter((c) => c.signalAt >= cutoff);
    saveCandidates();
  }

  function focused() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }
  function isVisible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
  }
  function sellerIdFromHref(href) {
    try {
      const u = new URL(href, location.href);
      return u.searchParams.get('XID') || u.searchParams.get('userId') || '';
    } catch { return ''; }
  }
  function currentItemId() {
    const text = decodeURIComponent(location.href);
    return text.match(/(?:itemID|itemId|item_id)[=/](\d+)/i)?.[1]
      || text.match(/[?&#](?:itemID|itemId|item_id)=(\d+)/i)?.[1]
      || '';
  }
  function isItemMarket() {
    const href = location.href;
    return /sid=ItemMarket/i.test(href) || /ItemMarket/i.test(location.hash);
  }
  function isBazaar() {
    return /\/bazaar\.php/i.test(location.pathname) || /sid=Bazaar/i.test(location.href);
  }
  function isPointsMarket() {
    return /\/pmarket\.php/i.test(location.pathname);
  }

  function findListingContainer(anchor) {
    let node = anchor;
    for (let depth = 0; depth < 8 && node?.parentElement; depth++, node = node.parentElement) {
      const text = node.textContent || '';
      const r = node.getBoundingClientRect();
      if (r.width > 100 && r.height > 20 && r.height < 420 && text.length < 3500 && /\$\s*[\d,.]+/.test(text)) return node;
    }
    return null;
  }
  function parseCurrencyText(text) {
    const matches = [...String(text || '').matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => normalizeMoney(m[1]));
    return matches.find((x) => x > 0) || 0;
  }
  function extractPrice(container) {
    const nodes = [...container.querySelectorAll('[data-testid*="price" i],[class*="price" i],[class*="cost" i]')].filter(isVisible);
    for (const node of nodes) {
      const price = parseCurrencyText(node.textContent);
      if (price > 0) return price;
    }
    return parseCurrencyText(container.textContent);
  }
  function extractPointCost(container) {
    const values = [...String(container?.textContent || '').matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)]
      .map((m)=>normalizeMoney(m[1])).filter((x)=>x >= 5_000 && x <= 200_000);
    return values.length ? Math.min(...values) : 0;
  }
  function extractAmount(container) {
    const nodes = [...container.querySelectorAll('[data-testid*="amount" i],[data-testid*="quantity" i],[class*="amount" i],[class*="quantity" i]')].filter(isVisible);
    const texts = [...nodes.map((n) => n.textContent || ''), container.textContent || ''];
    for (const text of texts) {
      const match = text.match(/(?:x|×)\s*([\d,]+)/i) || text.match(/([\d,]+)\s*(?:available|in stock)/i);
      if (match) return Math.max(1, Number(match[1].replace(/,/g, '')) || 1);
    }
    return 1;
  }
  function extractUid(container) {
    const node = container.matches('[data-uid],[data-item-uid]') ? container : container.querySelector('[data-uid],[data-item-uid]');
    return String(node?.getAttribute('data-uid') || node?.getAttribute('data-item-uid') || '').slice(0, 100);
  }

  function watchKey(watch) {
    if (watch.source === 'bazaar') return `bz:${watch.sellerId}`;
    if (watch.source === 'pointsmarket') return `pm:${watch.sellerId}:${watch.price}`;
    return `im:${watch.sellerId}:${watch.itemId}:${watch.uid || ''}:${watch.price}`;
  }
  function upsertWatch(watch) {
    const key = watchKey(watch);
    const existing = watches.find((w) => watchKey(w) === key);
    if (existing) {
      existing.sellerName = watch.sellerName || existing.sellerName;
      existing.lastSeenAt = nowSec();
      if (watch.amount) existing.amount = watch.amount;
      if (watch.uid) existing.uid = watch.uid;
      if (watch.itemName) existing.itemName = watch.itemName;
      if (existing.active === false && ['itemmarket','pointsmarket'].includes(watch.source)) {
        existing.active = true;
        existing.baseline = null;
        existing.nextPollAt = 0;
      }
      saveWatches();
      return existing;
    }
    const entry = {
      id: uid(),
      active: true,
      createdAt: nowSec(),
      lastSeenAt: nowSec(),
      nextPollAt: 0,
      status: 'new',
      ...watch
    };
    watches.push(entry);
    saveWatches();
    render();
    return entry;
  }

  function captureItemMarketVisible() {
    if (!focused() || !isItemMarket()) return 0;
    const itemId = currentItemId();
    if (!itemId) return 0;
    const anchors = [...document.querySelectorAll('a[href*="profiles.php"][href*="XID="]')].filter(isVisible);
    let added = 0;
    for (const anchor of anchors) {
      const sellerId = sellerIdFromHref(anchor.href);
      if (!sellerId || !/^\d+$/.test(sellerId)) continue;
      const container = findListingContainer(anchor);
      if (!container) continue;
      const price = extractPrice(container);
      if (!price) continue;
      const amount = extractAmount(container);
      const uidValue = extractUid(container);
      const before = watches.length;
      upsertWatch({
        source: 'itemmarket', sellerId, sellerName: (anchor.textContent || `Player ${sellerId}`).trim().slice(0, 120),
        itemId, itemName: `Item ${itemId}`, price, amount, uid: uidValue,
        observedUrl: location.href.slice(0, 500), baseline: null
      });
      if (watches.length > before) added++;
    }
    if (added) {
      const group = watches.filter((w) => w.active && w.source === 'itemmarket' && w.itemId === itemId);
      for (const watch of group) watch.nextPollAt = 0;
      saveWatches();
    }
    return added;
  }

  function capturePointsMarketVisible() {
    if (!focused() || !isPointsMarket()) return 0;
    const rows = [...document.querySelectorAll('span.expander')].filter(isVisible);
    let added = 0;
    for (const row of rows) {
      const anchor = row.querySelector('a.user.name[href*="profiles.php?XID="],a[href*="profiles.php"][href*="XID="]');
      if (!anchor || !isVisible(anchor)) continue;
      const sellerId = sellerIdFromHref(anchor.href);
      if (!/^\d+$/.test(sellerId)) continue;
      const cost = extractPointCost(row);
      if (!cost) continue;
      const before = watches.length;
      upsertWatch({source:'pointsmarket', sellerId, sellerName:(anchor.textContent || `Player ${sellerId}`).trim().slice(0,120), price:cost, baseline:null, observedUrl:location.href.slice(0,500)});
      if (watches.length > before) added++;
    }
    if (added) {
      for (const watch of watches.filter((w)=>w.active && w.source === 'pointsmarket')) watch.nextPollAt = 0;
      saveWatches();
    }
    return added;
  }

  function bazaarSellerFromPage() {
    const decoded = decodeURIComponent(location.href);
    const direct = decoded.match(/[?&#](?:userId|XID)=(\d+)/i)?.[1]
      || decoded.match(/(?:userId|XID)[=/](\d+)/i)?.[1];
    if (direct) return {id: direct, name: ''};
    const candidates = [...document.querySelectorAll('h1 a[href*="profiles.php"],h2 a[href*="profiles.php"],h3 a[href*="profiles.php"],h4 a[href*="profiles.php"],[class*="title" i] a[href*="profiles.php"]')]
      .filter(isVisible)
      .map((a) => ({id: sellerIdFromHref(a.href), name: (a.textContent || '').trim()}))
      .filter((x) => /^\d+$/.test(x.id));
    const ids = [...new Set(candidates.map((x) => x.id))];
    return ids.length === 1 ? candidates.find((x) => x.id === ids[0]) : null;
  }
  function captureBazaarOwner() {
    if (!focused() || !isBazaar()) return 0;
    const seller = bazaarSellerFromPage();
    if (!seller?.id) return 0;
    const before = watches.length;
    upsertWatch({source: 'bazaar', sellerId: seller.id, sellerName: seller.name || `Player ${seller.id}`, snapshot: null});
    return watches.length > before ? 1 : 0;
  }
  function captureActivePage() {
    if (licenseState.status !== 'authorized' || !settings.autoCapture || !focused()) return;
    if (isItemMarket()) captureItemMarketVisible();
    else if (isPointsMarket()) capturePointsMarketVisible();
    else if (isBazaar()) captureBazaarOwner();
  }

  function cleanRecentCalls() {
    const cutoff = Date.now() - 60_000;
    while (recentCalls.length && recentCalls[0] < cutoff) recentCalls.shift();
  }
  function budgetAvailable() {
    cleanRecentCalls();
    return recentCalls.length < Math.max(10, Math.min(90, Number(settings.requestBudgetPerMinute) || 45));
  }
  function gmRequest(url) {
    if (!apiKey) return Promise.reject(new Error('API key is not configured.'));
    if (!budgetAvailable()) return Promise.reject(new Error('Local API request budget reached; scheduler will retry.'));
    recentCalls.push(Date.now());
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 15_000,
        headers: {'Accept': 'application/json'},
        onload: (response) => {
          try {
            const json = JSON.parse(response.responseText || '{}');
            if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
            if (json?.error) throw new Error(`Torn API ${json.error.code ?? ''}: ${json.error.error || json.error.message || 'error'}`);
            resolve(json);
          } catch (error) { reject(error); }
        },
        onerror: () => reject(new Error('Network error contacting Torn API.')),
        ontimeout: () => reject(new Error('Torn API request timed out.'))
      });
    });
  }
  const withKey = (url) => `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
  const apiV2 = (path) => gmRequest(withKey(`https://api.torn.com/v2/${path}`));
  const apiV1 = (path) => gmRequest(withKey(`https://api.torn.com/${path}`));

  async function fetchProfile(sellerId) {
    const payload = await apiV2(`user/${encodeURIComponent(sellerId)}/profile`);
    return payload?.profile || payload;
  }
  async function fetchMarket(itemId) {
    return apiV2(`market/${encodeURIComponent(itemId)}/itemmarket?limit=100`);
  }
  async function fetchPointsMarket() {
    return apiV2('market/pointsmarket');
  }
  async function fetchBazaar(sellerId) {
    return apiV1(`user/${encodeURIComponent(sellerId)}?selections=bazaar`);
  }
  async function fetchBazaarDirectory(category = '') {
    const suffix = category ? `?cat=${encodeURIComponent(category)}` : '';
    return apiV2(`market/bazaar${suffix}`);
  }
  async function fetchAuctionHouse() {
    const from = Math.max(0, nowSec() - Math.max(120, Number(settings.auctionLookbackSeconds) || 600));
    return apiV2(`market/auctionhouse?limit=100&sort=DESC&from=${from}`);
  }
  async function fetchOwnProfile() {
    const payload = await apiV2('user/profile');
    return payload?.profile || payload;
  }
  async function verifyLicense(force = false) {
    if (!apiKey) {
      licenseState = {status:'needs-key', checkedAt:nowSec(), ownerId:'', ownerName:''};
      discovery.owner = null;
      saveDiscovery();
      return false;
    }
    if (!force && licenseState.status === 'authorized' && nowSec() - Number(licenseState.checkedAt || 0) < 1800) return true;
    if (licenseCheckInFlight) return licenseCheckInFlight;
    licenseCheckInFlight = (async () => {
      try {
        const profile = await fetchOwnProfile();
        const ownerId = String(profile?.id || '');
        const ownerName = String(profile?.name || '');
        const authorized = ownerId === LICENSED_USER_ID;
        licenseState = {status:authorized ? 'authorized' : 'denied', checkedAt:nowSec(), ownerId, ownerName};
        discovery.owner = authorized ? {id:ownerId, factionId:profile?.faction_id ?? null, name:ownerName} : null;
        saveDiscovery();
        return authorized;
      } catch (error) {
        licenseState = {status:'error', checkedAt:nowSec(), ownerId:'', ownerName:''};
        discovery.owner = null;
        saveDiscovery();
        console.warn(`[${APP}] license check:`, String(error?.message || error));
        return false;
      } finally {
        licenseCheckInFlight = null;
      }
    })();
    return licenseCheckInFlight;
  }
  const licensed = () => licenseState.status === 'authorized';
  async function fetchOwnBattleStats() {
    return apiV2('user/battlestats');
  }
  async function fetchOwnMerits() {
    return apiV2('user/merits');
  }
  async function fetchOwnEquipment() {
    return apiV2('user/equipment');
  }
  async function fetchOwnHonors() {
    return apiV2('user/honors');
  }
  async function fetchOwnMedals() {
    return apiV2('user/medals');