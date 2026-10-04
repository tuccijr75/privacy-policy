// ==UserScript==
// @name         SS_Mugger Owner QA
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      1.1.0-rc.6-qa.1
// @description  API-first mug target acquisition from Bazaar, Item Market, Points Market and completed auctions. No automated attacks.
// @author       MM Torn Systems
// @updateURL    https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@mm-market-mug-signals-owner-qa/SS_Mugger_Owner_QA.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@mm-market-mug-signals-owner-qa/SS_Mugger_Owner_QA.user.js
// @match        https://www.torn.com/*
// @include      https://www.torn.com/*
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

  const RUNTIME_GUARD = '__SS_MUGGER_RUNTIME_ACTIVE__';
  if (window[RUNTIME_GUARD]) return;
  window[RUNTIME_GUARD] = {startedAt: Date.now(), version: '1.1.0-rc.6'};

  const BOOT_PROBE_ID = 'ss-mugger-boot-probe';
  function showBootProbe(label = 'SSQ', isError = false) {
    const mount = () => {
      const host = document.body || document.documentElement;
      if (!host) return;
      let probe = document.getElementById(BOOT_PROBE_ID);
      if (!probe) {
        probe = document.createElement('div');
        probe.id = BOOT_PROBE_ID;
        probe.setAttribute('aria-label', 'SS_Mugger QA boot marker');
        Object.assign(probe.style, {
          position:'fixed', right:'10px', bottom:'132px', zIndex:'2147483647',
          padding:'5px 7px', borderRadius:'7px', font:'700 11px Arial,sans-serif',
          color:'#fff', background:'#365f73', border:'1px solid #8aa9b8',
          boxShadow:'0 2px 8px rgba(0,0,0,.55)', pointerEvents:'none'
        });
        host.appendChild(probe);
      }
      probe.textContent = label;
      probe.style.background = isError ? '#8d2d2d' : '#365f73';
      probe.title = isError ? 'SS_Mugger encountered a startup error' : 'SS_Mugger QA script injected';
    };
    if (document.documentElement) mount();
    else document.addEventListener('DOMContentLoaded', mount, {once:true});
  }
  showBootProbe('SSQ');
  window.addEventListener('error', () => showBootProbe('SSQ ERR', true));
  window.addEventListener('unhandledrejection', () => showBootProbe('SSQ ERR', true));

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


  const APP = 'SS_Mugger Owner QA';
  const VERSION = '1.1.0-rc.6-qa.1';
  const PREFIX = 'mm_market_mug_signals_v1';
  const LICENSED_USER_ID = '4325346';
  const LICENSED_USER_NAME = 'Manic-Mike';
  const PDA_API_KEY = '###PDA-APIKEY###';
  const PDA_API_KEY_SENTINEL = ['###', 'PDA-APIKEY', '###'].join('');
  const PDA_INJECTED_API_KEY = PDA_API_KEY && PDA_API_KEY !== PDA_API_KEY_SENTINEL ? String(PDA_API_KEY).trim() : '';
  const PLATFORM = Object.freeze({
    pda: Boolean(PDA_INJECTED_API_KEY || window.flutter_inappwebview || typeof window.PDA_httpGet === 'function'),
    mobile: Boolean(window.matchMedia?.('(max-width: 700px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')),
    touch: Boolean(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  });
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
  const cloneValue = (value) => {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  };
  function storageGet(key, fallback = '') {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch {}
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      if (raw.startsWith('GMV2_')) {
        const decoded = raw.slice(5);
        return decoded === 'undefined' ? fallback : JSON.parse(decoded);
      }
      return raw;
    } catch { return fallback; }
  }
  function storageSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') { GM_setValue(key, value); return true; }
    } catch {}
    try {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, 'GMV2_' + encoded);
      return true;
    } catch { return false; }
  }
  function readJson(key, fallback) {
    try {
      const raw = storageGet(key, '');
      return raw ? JSON.parse(raw) : cloneValue(fallback);
    } catch {
      return cloneValue(fallback);
    }
  }
  function writeJson(key, value) {
    storageSet(key, JSON.stringify(value));
  }

  let settings = {...DEFAULTS, ...readJson(STORE.settings, {})};
  let watches = readJson(STORE.watches, []);
  let candidates = readJson(STORE.candidates, []);
  let rejections = readJson(STORE.rejections, []);
  let errors = readJson(STORE.errors, []);
  let discovery = readJson(STORE.discovery, {nextBazaarAt:0,nextAuctionAt:0,nextCandidateAt:0,categoryIndex:0,owner:null});
  let seenAuctions = readJson(STORE.seenAuctions, []);
  let apiKey = String(storageGet(STORE.key, '') || PDA_INJECTED_API_KEY || '').trim();
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
  const panelDraft = new Map();
  const FILTER_FIELD_IDS = Object.freeze(['mmms-filter-payout','mmms-filter-win','mmms-filter-ready']);
  const SETTINGS_FIELD_IDS = Object.freeze([
    'mmms-key','mmms-min','mmms-market-poll','mmms-points-poll','mmms-bazaar-poll',
    'mmms-auto-bazaar-poll','mmms-discover-bazaar','mmms-bazaar-cap','mmms-discover-auction',
    'mmms-auction-poll','mmms-own-faction','mmms-notify','mmms-combat','mmms-plunder',
    'mmms-other-mug','mmms-plan-mug','mmms-target-protect','mmms-auto'
  ]);
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
  function parseApiResponse(response) {
    const status = Number(response?.status ?? 200);
    const json = JSON.parse(response?.responseText || response?.response || '{}');
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    if (json?.error) throw new Error(`Torn API ${json.error.code ?? ''}: ${json.error.error || json.error.message || 'error'}`);
    return json;
  }
  async function pdaHttpGet(url, headers) {
    if (typeof window.PDA_httpGet === 'function') return window.PDA_httpGet(url, headers || {});
    const bridge = window.flutter_inappwebview;
    if (bridge?.callHandler) return bridge.callHandler('PDA_httpGet', url, headers || {});
    throw new Error('TornPDA HTTP bridge unavailable.');
  }
  function gmRequest(url) {
    if (!apiKey) return Promise.reject(new Error('API key is not configured.'));
    if (!budgetAvailable()) return Promise.reject(new Error('Local API request budget reached; scheduler will retry.'));
    recentCalls.push(Date.now());
    const headers = {'Accept': 'application/json'};
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET', url, timeout: 15_000, headers,
          onload: (response) => { try { resolve(parseApiResponse(response)); } catch (error) { reject(error); } },
          onerror: () => reject(new Error('Network error contacting Torn API.')),
          ontimeout: () => reject(new Error('Torn API request timed out.'))
        });
      });
    }
    if (PLATFORM.pda) {
      return Promise.race([
        pdaHttpGet(url, headers).then(parseApiResponse),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TornPDA API request timed out.')), 15_000))
      ]);
    }
    return Promise.reject(new Error('No supported cross-origin request adapter is available.'));
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
  }
  async function fetchTargetJob(userId) {
    return apiV2(`user/${encodeURIComponent(userId)}/job`);
  }

  async function refreshOwnerMugProfile(force = false) {
    const now = nowSec();
    if (!apiKey) return ownerMugProfile;
    if (!force && ownerMugProfile.status === 'ready' && ownerMugProfileNextAt > now) return ownerMugProfile;
    try {
      const meritsPayload = await fetchOwnMerits();
      const merit = normalizeMugMerits(meritsPayload);
      let detectedPlunderPercent = 0;
      if (budgetAvailable()) {
        try { detectedPlunderPercent = extractPlunderPercent(await fetchOwnEquipment()); }
        catch (error) { console.warn(`[${APP}] plunder detection:`, String(error?.message || error)); }
      }
      let awards = {medals: merit.medals || 0, honors: merit.honors || 0, total:(merit.medals||0)+(merit.honors||0)};
      if (budgetAvailable()) {
        try {
          const [honorsPayload, medalsPayload] = await Promise.all([fetchOwnHonors(), fetchOwnMedals()]);
          awards = normalizeAwards(medalsPayload, honorsPayload);
        } catch (error) { console.warn(`[${APP}] awards:`, String(error?.message || error)); }
      }
      const manual = Math.max(0, Math.min(100, Number(settings.manualPlunderPercent)||0));
      ownerMugProfile = {
        status:'ready', masterfulLevel:merit.masterfulLevel, masterfulBonusPercent:merit.masterfulBonusPercent,
        detectedPlunderPercent, effectivePlunderPercent:manual > 0 ? manual : detectedPlunderPercent,
        otherBonusPercent:Math.max(0, Number(settings.otherMugBonusPercent)||0), awards,
        merits:{available:merit.available||0, used:merit.used||0}, refreshedAt:now
      };
      ownerMugProfileNextAt = now + Math.max(5, Number(settings.mugProfileRefreshMinutes)||30) * 60;
      for (const candidate of candidates) applyMugEstimate(candidate);
      candidates = rankCandidates(candidates);
      saveCandidates();
      return ownerMugProfile;
    } catch (error) {
      ownerMugProfile = {...ownerMugProfile, status:'unavailable', refreshedAt:now};
      ownerMugProfileNextAt = now + 300;
      console.warn(`[${APP}] mug profile:`, String(error?.message || error));
      return ownerMugProfile;
    }
  }

  async function refreshOwnerBattleStats(force = false) {
    if (!settings.combatScoring || !apiKey) return null;
    if (ownerBattleStatsAttempted && !force) return ownerBattleStats;
    ownerBattleStatsAttempted = true;
    try {
      const payload = await fetchOwnBattleStats();
      const normalized = normalizeBattleStats(payload);
      if (!(normalized.total > 0)) throw new Error('Battle stats unavailable for this API key.');
      ownerBattleStats = payload;
      ownerBattleStatsStatus = 'ready';
      return ownerBattleStats;
    } catch (error) {
      ownerBattleStats = null;
      ownerBattleStatsStatus = 'unavailable';
      console.warn(`[${APP}] combat model:`, String(error?.message || error));
      return null;
    }
  }

  async function ensureOwnerIdentity() {
    if (!licensed()) {
      const ok = await verifyLicense();
      if (!ok) throw new Error(`This build is licensed exclusively to ${LICENSED_USER_NAME} [${LICENSED_USER_ID}].`);
    }
    if (String(discovery.owner?.id || '') === LICENSED_USER_ID) return discovery.owner;
    const profile = await fetchOwnProfile();
    const ownerId = String(profile?.id || '');
    if (ownerId !== LICENSED_USER_ID) throw new Error(`This build is licensed exclusively to ${LICENSED_USER_NAME} [${LICENSED_USER_ID}].`);
    discovery.owner = {id:ownerId, factionId:profile?.faction_id ?? null, name:String(profile?.name || '')};
    saveDiscovery();
    return discovery.owner;
  }

  function autoBazaarCount() {
    return watches.filter((w) => w.active && w.source === 'bazaar' && w.discoverySource === 'api-directory').length;
  }

  function seedBazaarSellers(rows, sourceLabel) {
    const existingAuto = watches.filter((w) => w.active && w.source === 'bazaar' && w.discoverySource === 'api-directory');
    const cap = Math.max(4, Math.min(60, Number(settings.autoBazaarWatchCap) || 24));
    const candidates = rows.filter((x) => x.isOpen !== false);
    const bySeller = new Map(existingAuto.map((w) => [String(w.sellerId), w]));
    for (const row of candidates) {
      const sellerId = String(row.sellerId || '');
      if (!sellerId) continue;
      const existing = bySeller.get(sellerId) || watches.find((w) => w.source === 'bazaar' && String(w.sellerId) === sellerId);
      if (existing) {
        existing.sellerName = row.sellerName || existing.sellerName;
        existing.discoveryScore = Math.max(Number(existing.discoveryScore)||0, Number(row.discoveryScore)||0);
        existing.discoveryBuckets = [...new Set([...(existing.discoveryBuckets||[]), ...(row.buckets||[]), sourceLabel].filter(Boolean))];
        existing.lastDiscoveredAt = nowSec();
        continue;
      }
      if (autoBazaarCount() >= cap) break;
      const entry = upsertWatch({source:'bazaar', sellerId, sellerName:row.sellerName || `Player ${sellerId}`, snapshot:null,
        discoverySource:'api-directory', discoveryScore:Number(row.discoveryScore)||0,
        discoveryBuckets:[...(row.buckets||[]), sourceLabel].filter(Boolean), lastDiscoveredAt:nowSec()});
      bySeller.set(sellerId, entry);
    }
    const autos = watches.filter((w) => w.active && w.source === 'bazaar' && w.discoverySource === 'api-directory')
      .sort((a,b)=>(Number(b.discoveryScore)||0)-(Number(a.discoveryScore)||0) || (Number(b.lastDiscoveredAt)||0)-(Number(a.lastDiscoveredAt)||0));
    for (const w of autos.slice(cap)) w.active = false;
    saveWatches();
  }

  async function discoverBazaarDirectory(force = false) {
    if (!settings.autoBazaarDiscovery || !apiKey) return;
    const now = nowSec();
    if (!force && Number(discovery.nextBazaarAt||0) > now) return;
    try {
      const weekly = normalizeBazaarDirectory(await fetchBazaarDirectory());
      seedBazaarSellers(weekly, 'weekly');
      const category = BAZAAR_DISCOVERY_CATEGORIES[Number(discovery.categoryIndex||0) % BAZAAR_DISCOVERY_CATEGORIES.length];
      discovery.categoryIndex = (Number(discovery.categoryIndex||0) + 1) % BAZAAR_DISCOVERY_CATEGORIES.length;
      if (budgetAvailable()) {
        const specialized = normalizeBazaarDirectory(await fetchBazaarDirectory(category));
        seedBazaarSellers(specialized.map((x)=>({...x, discoveryScore:(Number(x.discoveryScore)||0)+8})), `cat:${category}`);
      }
      discovery.nextBazaarAt = now + Math.max(120, Number(settings.bazaarDiscoveryMinutes)||10) * 60;
      saveDiscovery();
      render();
    } catch (error) {
      discovery.nextBazaarAt = now + 120;
      saveDiscovery();
      logError('bazaar-directory', error);
    }
  }

  async function scanAuctionHouse(force = false) {
    if (!settings.auctionDiscovery || !apiKey) return;
    const now = nowSec();
    if (!force && Number(discovery.nextAuctionAt||0) > now) return;
    try {
      const auctions = normalizeAuctionHouse(await fetchAuctionHouse(), now);
      const result = auctionSignalsSince(auctions, seenAuctions, now, settings.auctionLookbackSeconds);
      const minGross = Number(settings.minGrossValue || 0);
      const prioritized = result.signals.filter((s)=>s.grossValue >= minGross).sort((a,b)=>b.grossValue-a.grossValue);
      cleanRecentCalls();
      const reserve = discovery.owner?.id ? 2 : 3;
      const budgetHeadroom = Math.max(0, Math.max(10, Math.min(90, Number(settings.requestBudgetPerMinute)||45)) - recentCalls.length - reserve);
      const process = prioritized.slice(0, Math.min(12, budgetHeadroom));
      const deferredIds = new Set(prioritized.slice(process.length).map((s)=>String(s.listingId)));
      const processedOrDiscarded = result.newlySeen.filter((id)=>!deferredIds.has(String(id)));
      seenAuctions.push(...processedOrDiscarded);
      seenAuctions = [...new Set(seenAuctions)].slice(-1000);
      saveSeenAuctions();
      discovery.nextAuctionAt = now + Math.max(15, Math.min(300, Number(settings.auctionPollSeconds)||20));
      saveDiscovery();
      for (const signal of process) {
        await handleSignal({source:'auctionhouse', sellerId:signal.sellerId, sellerName:signal.sellerName || `Player ${signal.sellerId}`}, signal);
        if (!budgetAvailable()) break;
      }
    } catch (error) {
      discovery.nextAuctionAt = now + 30;
      saveDiscovery();
      logError('auctionhouse', error);
    }
  }

  function applyMugEstimate(candidate) {
    if (!candidate) return candidate;
    const protection = Math.max(0, Number(candidate.targetMugReductionPercent)||0);
    candidate.mugEstimate = mugReturnEstimate(candidate.grossValue, {
      meritBonusPercent: ownerMugProfile.masterfulBonusPercent || 0,
      plunderPercent: ownerMugProfile.effectivePlunderPercent || 0,
      otherBonusPercent: ownerMugProfile.otherBonusPercent || 0,
      targetReductionPercent: protection,
      planningBasePercent: settings.planningBaseMugPercent
    });
    return candidate;
  }

  async function applyTargetMugProtection(candidate, force = false) {
    if (!candidate || !settings.detectTargetMugProtection || !apiKey) return applyMugEstimate(candidate);
    const now = nowSec();
    if (!force && Number(candidate.targetMugProtectionCheckedAt||0) > now - 900) return applyMugEstimate(candidate);
    if (!budgetAvailable()) return applyMugEstimate(candidate);
    try {
      const protection = targetMugProtection(await fetchTargetJob(candidate.sellerId));
      candidate.targetMugProtectionKnown = protection.known;
      candidate.targetMugReductionPercent = protection.reductionPercent;
      candidate.targetMugProtectionReason = protection.reason;
      candidate.targetCompanyRating = protection.companyRating ?? null;
      candidate.targetMugProtectionCheckedAt = now;
    } catch (error) {
      candidate.targetMugProtectionKnown = false;
      candidate.targetMugProtectionReason = 'job_check_failed';
      candidate.targetMugProtectionCheckedAt = now;
    }
    return applyMugEstimate(candidate);
  }

  function applyTargetProfile(candidate, profile, suitability = profileSuitability(profile)) {
    candidate.level = suitability.level;
    candidate.daysOld = suitability.daysOld;
    candidate.ageBand = suitability.ageBand;
    candidate.lifeCurrent = suitability.lifeCurrent;
    candidate.lifeMaximum = suitability.lifeMaximum;
    candidate.lifePercent = suitability.lifePercent;
    candidate.lifeBand = suitability.lifeBand;
    candidate.levelBand = suitability.levelBand;
    const combat = combatEstimate(ownerBattleStats, profile);
    candidate.winProbability = combat.winProbability;
    candidate.defeatProbability = combat.defeatProbability;
    candidate.combatConfidence = combat.confidence;
    candidate.combatMethod = combat.method;
    applyMugEstimate(candidate);
    return candidate;
  }

  function rejectSignal(watch, signal, gate) {
    rejections.push({
      at: nowSec(), sellerId: watch.sellerId, sellerName: watch.sellerName, source: signal.source,
      grossValue: signal.grossValue, itemName: signal.itemName, signalAt: signal.reportedAt,
      reason: gate.reason, lastAction: gate.lastAction || 0
    });
    saveRejections();
  }

  async function handleSignal(watch, signal) {
    try {
      if (settings.combatScoring && !ownerBattleStatsAttempted && budgetAvailable()) await refreshOwnerBattleStats();
      if ((ownerMugProfile.status !== 'ready' || ownerMugProfileNextAt <= nowSec()) && budgetAvailable()) await refreshOwnerMugProfile();
      const profile = await fetchProfile(watch.sellerId);
      const gate = candidateGate(signal, profile, settings.minGrossValue);
      if (!gate.eligible) {
        rejectSignal(watch, signal, gate);
        return;
      }
      const owner = settings.excludeOwnFaction ? await ensureOwnerIdentity() : null;
      if (owner?.id && String(owner.id) === String(watch.sellerId)) { rejectSignal(watch, signal, {...gate, reason:'self'}); return; }
      if (settings.excludeOwnFaction && owner?.factionId && gate.factionId && Number(owner.factionId) === Number(gate.factionId)) {
        rejectSignal(watch, signal, {...gate, reason:'same_faction'}); return;
      }
      const duplicate = candidates.some((c) => c.sellerId === watch.sellerId && c.signalAt === signal.reportedAt && c.itemId === signal.itemId && c.source === signal.source);
      if (duplicate) return;
      const profileStatus = profile?.status?.description || profile?.status?.state || profile?.status || '';
      let candidate = candidates.find((c)=>!c.stale && String(c.sellerId) === String(watch.sellerId));
      const canAggregate = candidate && gate.lastAction < Number(candidate.signalAt || 0);
      if (candidate && !canAggregate) {
        candidate.stale = true;
        candidate.staleReason = 'activity_between_sale_signals';
        candidate = null;
      }
      if (candidate) {
        candidate.grossValue = Math.max(0, Number(candidate.grossValue)||0) + Math.max(0, Number(signal.grossValue)||0);
        candidate.signalCount = Math.max(1, Number(candidate.signalCount)||1) + 1;
        candidate.sources = [...new Set([...(candidate.sources||[candidate.source]), signal.source])];
        candidate.source = candidate.sources.length > 1 ? 'multi-source' : candidate.sources[0];
        candidate.itemName = candidate.signalCount > 1 ? `${candidate.signalCount} sale signals` : signal.itemName;
        candidate.soldQty = Math.max(0, Number(candidate.soldQty)||0) + Math.max(0, Number(signal.soldQty)||0);
        candidate.signalAt = Math.max(Number(candidate.signalAt)||0, Number(signal.reportedAt)||0);
        candidate.previousReportedAt = Math.min(Number(candidate.previousReportedAt)||signal.previousReportedAt, Number(signal.previousReportedAt)||candidate.previousReportedAt);
        candidate.lastAction = gate.lastAction;
        candidate.inactivitySeconds = Math.max(0, candidate.signalAt - gate.lastAction);
        candidate.confidence = candidate.confidence === 'high' && gate.confidence === 'high' ? 'high' : 'medium';
        candidate.evidence = `${candidate.signalCount}_sale_signals_no_intervening_action`;
        candidate.profileStatus = String(profileStatus || '').slice(0, 160);
        candidate.statusState = gate.state; candidate.activityStatus = gate.activity; candidate.attackableNow = gate.attackableNow;
        candidate.factionId = gate.factionId;
        applyTargetProfile(candidate, profile, gate);
        candidate.nextProfileCheckAt = nowSec() + Math.max(15, Number(settings.candidateRecheckSeconds)||30);
      } else {
        candidate = {
          id: uid(), sellerId: watch.sellerId, sellerName: watch.sellerName || profile?.name || `Player ${watch.sellerId}`,
          source: signal.source, sources:[signal.source], signalCount:1, itemId: signal.itemId, itemName: signal.itemName, soldQty: signal.soldQty,
          grossValue: signal.grossValue, unitPrice: signal.unitPrice, signalAt: signal.reportedAt,
          previousReportedAt: signal.previousReportedAt, lastAction: gate.lastAction, inactivitySeconds: gate.inactivitySeconds,
          confidence: gate.confidence, evidence: signal.evidence, profileStatus: String(profileStatus || '').slice(0, 160),
          statusState: gate.state, activityStatus: gate.activity, attackableNow: gate.attackableNow,
          factionId: gate.factionId, nextProfileCheckAt: nowSec() + Math.max(15, Number(settings.candidateRecheckSeconds)||30), stale:false
        };
        applyTargetProfile(candidate, profile, gate);
        candidates.push(candidate);
      }
      await applyTargetMugProtection(candidate);
      candidates = rankCandidates(candidates);
      saveCandidates();
      notifyCandidate(candidate);
      render();
    } catch (error) {
      logError(`profile:${watch.sellerId}`, error);
    }
  }

  async function pollMarketGroup(itemId, force = false) {
    const group = watches.filter((w) => w.active && w.source === 'itemmarket' && w.itemId === itemId);
    if (!group.length) return;
    try {
      const payload = await fetchMarket(itemId);
      const snapshot = normalizeMarketSnapshot(payload);
      const nextAt = nowSec() + Math.max(15, Number(settings.marketPollSeconds) || 30, Number(snapshot.cacheDelay) || 0);
      for (const watch of group) {
        watch.nextPollAt = nextAt;
        watch.lastPollAt = nowSec();
        const fp = {itemId: watch.itemId, itemName: watch.itemName, price: watch.price, amount: watch.amount, uid: watch.uid};
        if (!watch.baseline?.ok) {
          const baseline = establishMarketBaseline(snapshot, fp);
          watch.baseline = baseline;
          watch.status = baseline.ok ? `tracking:${baseline.reason}` : `waiting:${baseline.reason}`;
          continue;
        }
        const result = diffMarketBaseline(watch.baseline, snapshot, fp);
        watch.baseline = result.baseline;
        watch.status = result.state || 'tracking';
        if (result.signal) {
          await handleSignal(watch, result.signal);
          if (result.baseline.quantity === 0) watch.active = false;
        }
      }
      saveWatches();
      render();
    } catch (error) {
      const retryAt = nowSec() + (force ? 5 : 15);
      for (const watch of group) { watch.nextPollAt = retryAt; watch.status = 'api-error'; }
      saveWatches();
      logError(`itemmarket:${itemId}`, error);
    }
  }

  async function pollPointsMarket(force = false) {
    const group = watches.filter((w)=>w.active && w.source === 'pointsmarket');
    if (!group.length) return;
    try {
      const snapshot = normalizePointsMarket(await fetchPointsMarket(), nowSec());
      const nextAt = nowSec() + Math.max(15, Number(settings.pointsPollSeconds)||20);
      for (const watch of group) {
        watch.nextPollAt = nextAt; watch.lastPollAt = nowSec();
        if (!watch.baseline?.ok) {
          watch.baseline = establishPointsBaseline(snapshot, {cost:watch.price});
          watch.status = watch.baseline.ok ? `tracking:${watch.baseline.reason}` : `waiting:${watch.baseline.reason}`;
          continue;
        }
        const result = diffPointsBaseline(watch.baseline, snapshot);
        watch.baseline = result.baseline; watch.status = result.state || 'tracking';
        if (result.signal) {
          await handleSignal(watch, result.signal);
          if (result.baseline.quantity === 0) watch.active = false;
        }
      }
      saveWatches(); render();
    } catch (error) {
      const retryAt = nowSec() + (force ? 5 : 15);
      for (const watch of group) { watch.nextPollAt = retryAt; watch.status = 'api-error'; }
      saveWatches(); logError('pointsmarket', error);
    }
  }

  async function pollBazaar(watch, force = false) {
    try {
      const payload = await fetchBazaar(watch.sellerId);
      const snapshot = normalizeBazaarSnapshot(payload);
      const pollSeconds = watch.discoverySource === 'api-directory' ? Math.max(45, Number(settings.autoBazaarPollSeconds)||90) : Math.max(30, Number(settings.bazaarPollSeconds)||45);
      watch.nextPollAt = nowSec() + pollSeconds;
      watch.lastPollAt = nowSec();
      if (!watch.snapshot) {
        watch.snapshot = snapshot;
        watch.status = snapshot.isOpen ? 'tracking' : 'bazaar-closed';
      } else if (snapshot.reportedAt > watch.snapshot.reportedAt) {
        const signals = diffBazaarSnapshots(watch.snapshot, snapshot);
        watch.snapshot = snapshot;
        watch.status = snapshot.isOpen ? 'tracking' : 'bazaar-closed';
        for (const signal of signals) await handleSignal(watch, signal);
      }
      saveWatches();
      render();
    } catch (error) {
      watch.nextPollAt = nowSec() + (force ? 5 : 20);
      watch.status = 'api-error';
      saveWatches();
      logError(`bazaar:${watch.sellerId}`, error);
    }
  }

  function dueTasks() {
    const now = nowSec();
    const tasks = [];
    const market = new Map();
    let pointsDue = null;
    for (const watch of watches) {
      if (!watch.active) continue;
      if (watch.source === 'itemmarket') {
        const old = market.get(watch.itemId);
        const due = Number(watch.nextPollAt || 0);
        if (!old || due < old.due) market.set(watch.itemId, {type: 'itemmarket', itemId: watch.itemId, due});
      } else if (watch.source === 'pointsmarket') {
        const due = Number(watch.nextPollAt || 0);
        pointsDue = pointsDue === null ? due : Math.min(pointsDue, due);
      } else if (watch.source === 'bazaar') {
        tasks.push({type: 'bazaar', watch, due: Number(watch.nextPollAt || 0)});
      }
    }
    tasks.push(...market.values());
    if (pointsDue !== null) tasks.push({type:'pointsmarket', due:pointsDue});
    return tasks.filter((t) => t.due <= now).sort((a, b) => a.due - b.due);
  }

  async function refreshCandidate(candidate, openAttackAfter = false) {
    try {
      const profile = await fetchProfile(candidate.sellerId);
      const lastAction = Number(profile?.last_action?.timestamp || 0);
      const suitability = profileSuitability(profile);
      candidate.lastCheckedAt = nowSec();
      candidate.nextProfileCheckAt = nowSec() + Math.max(15, Number(settings.candidateRecheckSeconds)||30);
      candidate.lastAction = lastAction || candidate.lastAction;
      candidate.statusState = suitability.state;
      candidate.activityStatus = suitability.activity;
      candidate.attackableNow = suitability.attackableNow;
      candidate.profileStatus = String(profile?.status?.description || suitability.state || '').slice(0,160);
      applyTargetProfile(candidate, profile, suitability);
      await applyTargetMugProtection(candidate, openAttackAfter);
      if (!lastAction || lastAction >= candidate.signalAt) {
        candidate.stale = true;
        candidate.staleReason = 'acted_since_signal';
      }
      saveCandidates();
      render();
      if (openAttackAfter) {
        if (candidate.stale) return alert(`${APP}: target acted after the sale signal; candidate marked stale.`);
        if (!candidate.attackableNow) return alert(`${APP}: target status is ${candidate.statusState || 'not attackable'}. Candidate retained, attack page not opened.`);
        openTornUrl(attackUrl(candidate.sellerId));
      }
    } catch (error) {
      logError(`candidate-check:${candidate.sellerId}`, error);
      if (openAttackAfter) alert(`${APP}: could not revalidate target before opening attack.`);
    }
  }

  async function recheckCandidates() {
    const now = nowSec();
    const due = rankCandidates(candidates.filter((c)=>!c.stale && Number(c.nextProfileCheckAt||0) <= now)).slice(0,5);
    discovery.nextCandidateAt = now + Math.max(15, Number(settings.candidateRecheckSeconds)||30);
    saveDiscovery();
    for (const candidate of due) {
      if (!budgetAvailable()) break;
      await refreshCandidate(candidate, false);
    }
    candidates = rankCandidates(candidates);
    saveCandidates();
  }

  async function schedulerTick() {
    trimState();
    if (!apiKey) return;
    if (!licensed() || nowSec() - Number(licenseState.checkedAt || 0) >= 1800) {
      await verifyLicense(true);
      if (!licensed()) { render(); return; }
    }
    captureActivePage();
    if (paused || schedulerBusy || !budgetAvailable()) return;
    schedulerBusy = true;
    try {
      const now = nowSec();
      if (ownerMugProfileNextAt <= now && budgetAvailable()) { await refreshOwnerMugProfile(); return; }
      if (settings.auctionDiscovery && Number(discovery.nextAuctionAt||0) <= now) { await scanAuctionHouse(); return; }
      if (settings.autoBazaarDiscovery && Number(discovery.nextBazaarAt||0) <= now) { await discoverBazaarDirectory(); return; }
      if (Number(discovery.nextCandidateAt||0) <= now) { await recheckCandidates(); return; }
      const [task] = dueTasks();
      if (!task) return;
      if (task.type === 'itemmarket') await pollMarketGroup(task.itemId);
      else if (task.type === 'pointsmarket') await pollPointsMarket();
      else await pollBazaar(task.watch);
    } finally {
      schedulerBusy = false;
      render();
    }
  }

  function setAllDue() {
    for (const watch of watches) if (watch.active) watch.nextPollAt = 0;
    saveWatches();
  }

  function removeWatch(id) {
    watches = watches.filter((w) => w.id !== id);
    saveWatches();
    render(true);
  }

  function clearInactive() {
    watches = watches.filter((w) => w.active);
    saveWatches();
    render(true);
  }

  function attackUrl(id) { return `https://www.torn.com/loader.php?sid=attack&user2ID=${encodeURIComponent(id)}`; }
  function profileUrl(id) { return `https://www.torn.com/profiles.php?XID=${encodeURIComponent(id)}`; }
  function openTornUrl(url) {
    if (PLATFORM.pda || PLATFORM.mobile) { location.href = url; return; }
    try {
      const opened = window.open(url, '_blank', 'noopener');
      if (opened) return;
    } catch {}
    location.href = url;
  }
  function notifyCandidate(candidate) {
    if (!settings.notifications || !candidate?.attackableNow) return;
    const title = `${APP}: ${candidate.mugEstimate ? money(candidate.mugEstimate.planningAmount) + ' est. mug' : money(candidate.grossValue) + ' exposure'}`;
    const text = `${candidate.sellerName} · ${money(candidate.grossValue)} probable exposure · ${candidate.signalCount || 1} signal${candidate.signalCount === 1 ? '' : 's'}`;
    // TornPDA's GM_notification compatibility layer is a blocking confirm dialog, so rely on the in-page badge there.
    if (PLATFORM.pda) {
      try { if (document.visibilityState === 'visible' && navigator.vibrate) navigator.vibrate(80); } catch {}
      return;
    }
    try { if (typeof GM_notification === 'function') GM_notification({title, text, timeout:9000}); } catch {}
  }

  const STYLE = `
    #mm-mug-signal-launcher{width:38px;height:38px;border-radius:7px;border:1px solid #555;background:linear-gradient(#3b3f44,#24272a);color:#f1f1f1;font:700 13px Arial;cursor:pointer;box-shadow:0 2px 7px #0008;z-index:2147483000;position:relative;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    #mm-mug-signal-launcher[data-fallback="1"]{position:fixed;right:max(8px,env(safe-area-inset-right));top:84px;display:flex!important;align-items:center;justify-content:center;pointer-events:auto!important}
    #mm-mug-signal-launcher.hot{box-shadow:0 0 0 2px #b33,0 0 14px #c33a;animation:mmms-pulse 1.5s ease-in-out infinite}@keyframes mmms-pulse{50%{transform:scale(1.04)}}
    #mm-mug-signal-launcher .mm-badge{position:absolute;right:-5px;top:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;background:#b62828;color:#fff;font:700 10px/16px Arial;text-align:center}
    #mm-mug-signals-panel{position:fixed;right:12px;top:130px;width:min(510px,calc(100vw - 24px));max-height:72vh;overflow:auto;background:#17191c;color:#ddd;border:1px solid #4c5056;border-radius:8px;box-shadow:0 8px 30px #000a;z-index:2147482999;font:12px/1.35 Arial,sans-serif;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    #mm-mug-signals-panel input,#mm-mug-signals-panel select,#mm-mug-signals-panel textarea{pointer-events:auto!important;touch-action:auto!important;-webkit-user-select:text!important;user-select:text!important}
    #mm-mug-signals-panel[hidden]{display:none!important}.mmms-head{position:sticky;top:0;background:#22262a;border-bottom:1px solid #3c4045;padding:9px 10px;display:flex;gap:8px;align-items:center;z-index:2}.mmms-title{font-weight:700;font-size:14px;flex:1}.mmms-dot{width:8px;height:8px;border-radius:50%;background:#50a450}.mmms-dot.pause{background:#b28b3b}.mmms-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px 10px}.mmms-stat{background:#202327;border:1px solid #34383d;border-radius:5px;padding:6px}.mmms-stat b{display:block;font-size:14px;color:#fff}.mmms-actions{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 9px}.mmms-btn{border:1px solid #555;background:#2c3035;color:#eee;border-radius:4px;padding:5px 8px;cursor:pointer;font:12px Arial;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.mmms-btn:hover{background:#393e44}.mmms-btn.danger{border-color:#744}.mmms-section{border-top:1px solid #333;padding:9px 10px}.mmms-section h3{font-size:12px;margin:0 0 7px;color:#f3f3f3}.mmms-card{border:1px solid #3b4046;background:#202327;border-radius:5px;padding:7px;margin:0 0 6px}.mmms-card.high{border-left:3px solid #4da35a}.mmms-card.medium{border-left:3px solid #b68b39}.mmms-card.stale{opacity:.55;border-left-color:#666}.mmms-row{display:flex;gap:8px;align-items:center}.mmms-grow{flex:1;min-width:0}.mmms-name{font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mmms-muted{color:#9da3a9;font-size:11px}.mmms-value{font-size:14px;font-weight:700;color:#f5f5f5}.mmms-tag{display:inline-block;border:1px solid #4a4e54;border-radius:10px;padding:1px 6px;margin-right:4px;color:#bbb;font-size:10px}.mmms-empty{color:#8f969d;padding:6px 0}.mmms-settings{display:grid;grid-template-columns:145px 1fr;gap:7px;align-items:center}.mmms-input{width:100%;box-sizing:border-box;background:#101214;color:#eee;border:1px solid #4a4e54;border-radius:4px;padding:5px}.mmms-small{font-size:10px;color:#8f969d}.mmms-watch{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;border-bottom:1px solid #2d3034;padding:5px 0}.mmms-watch:last-child{border-bottom:0}
    @media (max-width:640px),(pointer:coarse){
      #mm-mug-signal-launcher{width:44px;height:44px;font-size:12px}
      #mm-mug-signal-launcher[data-fallback="1"]{top:auto;right:max(10px,env(safe-area-inset-right));bottom:calc(124px + env(safe-area-inset-bottom))}
      #mm-mug-signals-panel{left:max(6px,env(safe-area-inset-left));right:max(6px,env(safe-area-inset-right));top:auto;bottom:calc(6px + env(safe-area-inset-bottom));width:auto;max-height:82vh;max-height:82dvh;border-radius:10px;font-size:13px}
      .mmms-head{padding:10px}.mmms-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:8px}.mmms-actions{padding-left:8px;padding-right:8px}.mmms-btn{min-height:40px;padding:8px 10px;font-size:13px}.mmms-settings{grid-template-columns:1fr;gap:4px}.mmms-settings label{margin-top:4px;color:#b8bdc3}.mmms-input{min-height:40px;font-size:16px;padding:8px}.mmms-row{align-items:flex-start}.mmms-value{white-space:nowrap}.mmms-card{padding:9px}.mmms-tag{margin-bottom:4px;padding:3px 7px;font-size:11px}.mmms-watch{grid-template-columns:minmax(0,1fr) auto}.mmms-section{padding:9px 8px}
    }
  `;

  let launcher = null;
  let panel = null;

  function ensureStyle() {
    if (document.getElementById('mm-mug-signals-style')) return;
    const style = document.createElement('style');
    style.id = 'mm-mug-signals-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function attachLauncher() {
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = 'mm-mug-signal-launcher';
      launcher.type = 'button';
      launcher.dataset.mmDockId = 'mug-signals';
      launcher.title = APP;
      launcher.innerHTML = '<span aria-hidden="true">MUG</span><span class="mm-badge" hidden>0</span>';
      launcher.addEventListener('click', () => { panelOpen = !panelOpen; render(true); });
    }
    const dock = document.querySelector('#mm-torn-module-dock');
    const host = document.body || document.documentElement;
    if (dock) {
      if (launcher.parentElement !== dock) dock.insertBefore(launcher, dock.firstChild || null);
      delete launcher.dataset.fallback;
    } else if (host && launcher.parentElement !== host) {
      host.appendChild(launcher);
      launcher.dataset.fallback = '1';
    } else launcher.dataset.fallback = '1';
    if (launcher.isConnected) document.getElementById(BOOT_PROBE_ID)?.remove();
  }

  function isDraftableControl(control) {
    return control instanceof HTMLElement && control.matches('input[id],select[id],textarea[id]');
  }
  function rememberPanelDraft(control) {
    if (!isDraftableControl(control)) return;
    panelDraft.set(control.id, {
      value: 'value' in control ? String(control.value ?? '') : '',
      checked: 'checked' in control ? Boolean(control.checked) : undefined
    });
    updatePanelDraftIndicators();
  }
  function clearPanelDraft(ids) {
    for (const id of ids || []) panelDraft.delete(id);
    updatePanelDraftIndicators();
  }
  function restorePanelDraft() {
    if (!panel || !panelDraft.size) return;
    for (const [id, draft] of panelDraft.entries()) {
      const control = document.getElementById(id);
      if (!control || !panel.contains(control) || !isDraftableControl(control)) continue;
      if ('checked' in control && draft.checked !== undefined) control.checked = draft.checked;
      if ('value' in control) control.value = draft.value;
    }
  }
  function activePanelTextEditor() {
    const control = document.activeElement;
    if (!panel?.contains(control) || !isDraftableControl(control)) return false;
    const type = String(control.getAttribute('type') || '').toLowerCase();
    return !['checkbox','radio','button','submit'].includes(type);
  }
  function updatePanelDraftIndicators() {
    if (!panel) return;
    const filterDirty = FILTER_FIELD_IDS.some((id) => panelDraft.has(id));
    const settingsDirty = SETTINGS_FIELD_IDS.some((id) => panelDraft.has(id));
    const filterStatus = panel.querySelector('#mmms-filter-draft-status');
    const settingsStatus = panel.querySelector('#mmms-settings-draft-status');
    if (filterStatus) filterStatus.textContent = filterDirty ? 'Unsaved filter edits preserved' : '';
    if (settingsStatus) settingsStatus.textContent = settingsDirty ? 'Unsaved setting edits preserved' : '';
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'mm-mug-signals-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
    panel.addEventListener('input', (event) => rememberPanelDraft(event.target));
    panel.addEventListener('change', (event) => rememberPanelDraft(event.target));
    panel.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') { panelOpen = false; render(true); }
      if (action === 'pause') { paused = !paused; render(true); }
      if (action === 'capture' && licensed()) { captureItemMarketVisible(); capturePointsMarketVisible(); captureBazaarOwner(); setAllDue(); render(true); }
      if (action === 'poll') { setAllDue(); discovery.nextAuctionAt=0; discovery.nextBazaarAt=0; discovery.nextCandidateAt=0; saveDiscovery(); await schedulerTick(); render(true); }
      if (action === 'clear-candidates') { candidates = []; saveCandidates(); render(true); }
      if (action === 'clear-inactive') clearInactive();
      if (action === 'remove-watch') removeWatch(button.dataset.id);
      if (action === 'profile') openTornUrl(profileUrl(button.dataset.id));
      if (action === 'attack') { const c = candidates.find((x)=>x.id === button.dataset.candidate); if (c) await refreshCandidate(c, true); }
      if (action === 'save-settings') savePanelSettings();
      if (action === 'apply-filters') {
        settings.minDisplayPayout = Math.max(0, Number(document.getElementById('mmms-filter-payout')?.value) || 0);
        settings.minDisplayWinProbability = Math.max(0, Math.min(100, Number(document.getElementById('mmms-filter-win')?.value) || 0));
        settings.displayReadyOnly = Boolean(document.getElementById('mmms-filter-ready')?.checked);
        saveSettings();
        clearPanelDraft(FILTER_FIELD_IDS);
        render(true);
      }
      if (action === 'test-key') await testApiKey();
      if (action === 'add-bazaar') addBazaarFromInput();
      if (action === 'export') exportDiagnostics();
    });
  }

  function activeCount() { return watches.filter((w) => w.active).length; }
  function displayCandidates() {
    return rankCandidates(filterCandidates(candidates, {minPayout:settings.minDisplayPayout, minWinProbability:settings.minDisplayWinProbability, readyOnly:settings.displayReadyOnly}));
  }
  function readyCount() { return displayCandidates().filter((c) => !c.stale && c.attackableNow).length; }
  function apiUsage() { cleanRecentCalls(); return `${recentCalls.length}/${settings.requestBudgetPerMinute}`; }

  function candidateHtml(c) {
    const inactivity = Math.max(0, c.signalAt - c.lastAction);
    const readiness = c.stale ? 'STALE' : c.attackableNow ? 'READY' : (c.statusState || 'WAIT');
    return `<div class="mmms-card ${esc(c.confidence)} ${c.stale ? 'stale' : ''}">
      <div class="mmms-row"><div class="mmms-grow"><div class="mmms-name">${esc(c.sellerName)} [${esc(c.sellerId)}] · ${esc(readiness)}</div><div class="mmms-muted">${esc((c.sources||[c.source]).join('+'))} · ${esc(c.itemName)}${Number(c.signalCount||1) > 1 ? ` · ${esc(c.signalCount)} signals` : ` ×${esc(c.soldQty)}`} · signal ${new Date(c.signalAt * 1000).toLocaleTimeString()}</div></div><div class="mmms-value">${money(c.grossValue)}</div></div>
      ${c.mugEstimate ? `<div style="margin-top:5px"><span class="mmms-tag"><b>EST MUG ${money(c.mugEstimate.planningAmount)}</b></span><span class="mmms-tag">range ${money(c.mugEstimate.minAmount)}–${money(c.mugEstimate.maxAmount)}</span><span class="mmms-tag">${Number(c.mugEstimate.planningPercent).toFixed(2)}% planning</span>${c.targetMugReductionPercent ? `<span class="mmms-tag">target protection −${esc(c.targetMugReductionPercent)}%</span>` : ''}</div>` : ''}
      <div style="margin-top:5px"><span class="mmms-tag">${esc(c.confidence)} sale confidence</span><span class="mmms-tag">${esc(c.activityStatus || 'activity ?')}</span><span class="mmms-tag">inactive ${age(inactivity)} at signal</span>${c.profileStatus ? `<span class="mmms-tag">${esc(c.profileStatus)}</span>` : ''}</div>
      <div style="margin-top:5px"><span class="mmms-tag">Lvl ${esc(c.level ?? '?')} · ${esc(c.levelBand || '?')}</span><span class="mmms-tag">${c.daysOld === null || c.daysOld === undefined ? '?' : esc(c.daysOld)} days · ${esc(c.ageBand || '?')}</span><span class="mmms-tag">Life ${c.lifeCurrent ?? '?'} / ${c.lifeMaximum ?? '?'}${Number.isFinite(Number(c.lifePercent)) ? ` (${esc(c.lifePercent)}%)` : ''}</span></div>
      <div style="margin-top:5px">${Number.isFinite(Number(c.winProbability)) ? `<span class="mmms-tag"><b>WIN ${esc(c.winProbability)}%</b></span><span class="mmms-tag">DEFEAT ${esc(c.defeatProbability)}%</span><span class="mmms-tag">combat confidence ${esc(c.combatConfidence || 'low')}</span>` : '<span class="mmms-tag">combat estimate unavailable</span>'}</div>
      <div class="mmms-muted" style="margin-top:4px">Evidence: ${esc(c.evidence)}. Win/defeat is a customer-specific estimate; profile-only estimates are low-confidence unless verified target stats are available. Probable exposure is not guaranteed cash-on-hand or mug proceeds.</div>
      <div style="margin-top:6px"><button class="mmms-btn" data-action="profile" data-id="${esc(c.sellerId)}">Profile</button> <button class="mmms-btn" data-action="attack" data-candidate="${esc(c.id)}" ${c.stale ? 'disabled' : ''}>Verify + attack</button></div>
    </div>`;
  }

  function watchHtml(w) {
    const title = w.source === 'itemmarket'
      ? `${w.sellerName || w.sellerId} · Item ${w.itemId} @ ${money(w.price)}`
      : w.source === 'pointsmarket'
        ? `${w.sellerName || w.sellerId} · Points @ ${money(w.price)}/pt`
        : `${w.sellerName || w.sellerId} · Bazaar`;
    const detail = w.source === 'itemmarket' || w.source === 'pointsmarket'
      ? `${w.baseline?.ok ? 'API baseline locked' : (w.baseline?.reason || 'baseline pending')} · ${w.active ? 'active' : 'listing gone'}`
      : `${w.status || 'new'} · ${w.discoverySource === 'api-directory' ? 'auto-discovered · ' : ''}${w.snapshot ? `snapshot ${new Date(w.snapshot.reportedAt * 1000).toLocaleTimeString()}` : 'snapshot pending'}`;
    return `<div class="mmms-watch"><div><div>${esc(title)}</div><div class="mmms-muted">${esc(detail)}</div></div><button class="mmms-btn danger" data-action="remove-watch" data-id="${esc(w.id)}">×</button></div>`;
  }

  // UI invariant: background acquisition must never replace the open panel DOM.
  function render(forcePanel = false) {
    if (panelOpen && !forcePanel && panel?.dataset.mmRendered === '1') return;
    if (!document.body) return;
    ensureStyle(); attachLauncher(); ensurePanel(); trimState();
    const badge = launcher.querySelector('.mm-badge');
    const ready = readyCount();
    badge.textContent = String(ready);
    badge.hidden = ready === 0;
    launcher.classList.toggle('hot', ready > 0);
    panel.hidden = !panelOpen;
    if (!panelOpen) return;
    if (!licensed()) {
      const ownerLabel = licenseState.ownerId ? `${esc(licenseState.ownerName || 'Player')} [${esc(licenseState.ownerId)}]` : 'unverified';
      panel.innerHTML = `<div class="mmms-head"><span class="mmms-dot pause"></span><span class="mmms-title">${APP} <span class="mmms-muted">${VERSION}</span></span><button class="mmms-btn" data-action="close">Close</button></div>
        <div class="mmms-section"><h3>Exclusive license</h3><div class="mmms-muted">Licensed only to ${LICENSED_USER_NAME} [${LICENSED_USER_ID}]. Current API owner: ${ownerLabel}. ${licenseState.status === 'denied' ? 'This installation is disabled.' : 'Enter the licensed user API key and press Test key.'}</div></div>
        <div class="mmms-section"><h3>API</h3><div class="mmms-settings"><label>API key</label><input id="mmms-key" class="mmms-input" type="password" autocomplete="off" value="${PLATFORM.pda && PDA_INJECTED_API_KEY ? '' : esc(apiKey)}" placeholder="${PLATFORM.pda && PDA_INJECTED_API_KEY ? 'TornPDA API key auto-detected' : 'Torn API key'}"></div><div class="mmms-actions" style="padding-top:8px"><button class="mmms-btn" data-action="test-key">Test key</button></div></div>`;
      panel.dataset.mmRendered = '1';
      return;
    }
    const visibleCandidates = displayCandidates();
    panel.innerHTML = `<div class="mmms-head"><span class="mmms-dot ${paused ? 'pause' : ''}"></span><span class="mmms-title">${APP} <span class="mmms-muted">${VERSION}</span></span><button class="mmms-btn" data-action="close">Close</button></div>
      <div class="mmms-grid">
        <div class="mmms-stat"><b>${readyCount()}/${candidates.length}</b>ready/total</div>
        <div class="mmms-stat"><b>${activeCount()}</b>active watches</div>
        <div class="mmms-stat"><b>${apiUsage()}</b>API/min</div>
        <div class="mmms-stat"><b>${paused ? 'PAUSED' : (apiKey ? 'LIVE' : 'NO KEY')}</b>engine</div>
        <div class="mmms-stat"><b>${esc(ownerBattleStatsStatus)}</b>combat model</div>
        <div class="mmms-stat"><b>${ownerMugProfile.status === 'ready' ? `ML ${ownerMugProfile.masterfulLevel}/10 · P ${ownerMugProfile.effectivePlunderPercent}%` : esc(ownerMugProfile.status)}</b>mug modifiers</div>
        <div class="mmms-stat"><b>${ownerMugProfile.awards?.total || 0}</b>awards</div>
      </div>
      <div class="mmms-actions"><button class="mmms-btn" data-action="capture">Capture current page</button><button class="mmms-btn" data-action="poll">Poll now</button><button class="mmms-btn" data-action="pause">${paused ? 'Resume' : 'Pause'}</button><button class="mmms-btn" data-action="export">Export diagnostics</button></div>
      <div class="mmms-section"><h3>Potential targets</h3>
        <div class="mmms-settings" style="margin-bottom:8px">
          <label>Min est. payout</label><input id="mmms-filter-payout" class="mmms-input" type="number" min="0" step="100000" value="${Number(settings.minDisplayPayout)||0}">
          <label>Min win chance %</label><input id="mmms-filter-win" class="mmms-input" type="number" min="0" max="100" step="1" value="${Number(settings.minDisplayWinProbability)||0}">
          <label>Ready only</label><input id="mmms-filter-ready" type="checkbox" ${settings.displayReadyOnly ? 'checked' : ''}>
        </div><div class="mmms-actions" style="padding:0 0 8px"><button class="mmms-btn" data-action="apply-filters">Apply filters</button><span class="mmms-muted">Showing ${visibleCandidates.length} of ${candidates.length}</span><span class="mmms-muted" id="mmms-filter-draft-status"></span></div>
        ${visibleCandidates.length ? visibleCandidates.map(candidateHtml).join('') : '<div class="mmms-empty">No targets match the current payout / win filters.</div>'}<button class="mmms-btn" data-action="clear-candidates">Clear candidates</button></div>
      <div class="mmms-section"><h3>Watchlist</h3>${watches.length ? watches.slice().sort((a,b)=>(b.active-a.active)||(b.lastSeenAt-a.lastSeenAt)).slice(0,120).map(watchHtml).join('') : '<div class="mmms-empty">Browse Item Market or a Bazaar while this tab is focused, or add a Bazaar player ID below.</div>'}<button class="mmms-btn" data-action="clear-inactive">Remove inactive listings</button></div>
      <div class="mmms-section"><h3>Settings</h3><div class="mmms-settings">
        <label>API key</label><input id="mmms-key" class="mmms-input" type="password" autocomplete="off" value="${PLATFORM.pda && PDA_INJECTED_API_KEY ? '' : esc(apiKey)}" placeholder="${PLATFORM.pda && PDA_INJECTED_API_KEY ? 'TornPDA API key auto-detected' : 'Torn API key'}">
        <label>Min gross sale</label><input id="mmms-min" class="mmms-input" type="number" min="0" step="100000" value="${Number(settings.minGrossValue)||0}">
        <label>Item Market poll</label><input id="mmms-market-poll" class="mmms-input" type="number" min="15" max="600" value="${Number(settings.marketPollSeconds)||30}">
        <label>Points Market poll</label><input id="mmms-points-poll" class="mmms-input" type="number" min="15" max="600" value="${Number(settings.pointsPollSeconds)||20}">
        <label>Bazaar poll</label><input id="mmms-bazaar-poll" class="mmms-input" type="number" min="30" max="600" value="${Number(settings.bazaarPollSeconds)||45}">
        <label>Auto Bazaar poll</label><input id="mmms-auto-bazaar-poll" class="mmms-input" type="number" min="45" max="900" value="${Number(settings.autoBazaarPollSeconds)||90}">
        <label>Auto Bazaar discovery</label><input id="mmms-discover-bazaar" type="checkbox" ${settings.autoBazaarDiscovery ? 'checked' : ''}>
        <label>Auto Bazaar watch cap</label><input id="mmms-bazaar-cap" class="mmms-input" type="number" min="4" max="60" value="${Number(settings.autoBazaarWatchCap)||24}">
        <label>Auction discovery</label><input id="mmms-discover-auction" type="checkbox" ${settings.auctionDiscovery ? 'checked' : ''}>
        <label>Auction poll</label><input id="mmms-auction-poll" class="mmms-input" type="number" min="15" max="300" value="${Number(settings.auctionPollSeconds)||20}">
        <label>Exclude own faction</label><input id="mmms-own-faction" type="checkbox" ${settings.excludeOwnFaction ? 'checked' : ''}>
        <label>Notifications</label><input id="mmms-notify" type="checkbox" ${settings.notifications ? 'checked' : ''}>
        <label>Customer combat scoring</label><input id="mmms-combat" type="checkbox" ${settings.combatScoring ? 'checked' : ''}>
        <label>Manual Plunder %</label><input id="mmms-plunder" class="mmms-input" type="number" min="0" max="100" step="1" value="${Number(settings.manualPlunderPercent)||0}">
        <label>Other mug bonus %</label><input id="mmms-other-mug" class="mmms-input" type="number" min="0" max="100" step="1" value="${Number(settings.otherMugBonusPercent)||0}">
        <label>Planning base mug %</label><input id="mmms-plan-mug" class="mmms-input" type="number" min="5" max="10" step="0.1" value="${Number(settings.planningBaseMugPercent)||6}">
        <label>Detect target protection</label><input id="mmms-target-protect" type="checkbox" ${settings.detectTargetMugProtection ? 'checked' : ''}>
        <label>Auto-capture</label><input id="mmms-auto" type="checkbox" ${settings.autoCapture ? 'checked' : ''}>
        <label>Bazaar player ID</label><div style="display:flex;gap:5px"><input id="mmms-bazaar-id" class="mmms-input" inputmode="numeric" placeholder="Player ID"><button class="mmms-btn" data-action="add-bazaar">Add</button></div>
      </div><div class="mmms-actions" style="padding:8px 0 0"><button class="mmms-btn" data-action="save-settings">Save settings</button><button class="mmms-btn" data-action="test-key">Test key</button><span class="mmms-muted" id="mmms-settings-draft-status"></span></div>
      <div class="mmms-small">Mug model: Masterful Looting ${ownerMugProfile.masterfulLevel || 0}/10 (+${ownerMugProfile.masterfulBonusPercent || 0}%), detected Plunder ${ownerMugProfile.detectedPlunderPercent || 0}%, effective Plunder ${ownerMugProfile.effectivePlunderPercent || 0}%, other bonus ${ownerMugProfile.otherBonusPercent || 0}%. Merits: ${ownerMugProfile.merits?.used || 0} used / ${ownerMugProfile.merits?.available || 0} available. Awards: ${ownerMugProfile.awards?.medals || 0} medals + ${ownerMugProfile.awards?.honors || 0} honors. A manual Plunder value above 0 overrides detected equipment. Awards are displayed but are not treated as direct mug multipliers unless Torn documents a specific modifier.</div>
      <div class="mmms-small">Item/Points Market seller identity is captured only from the focused, manually viewed page. Bazaar directory discovery and completed-auction signals are API-only. Background websocket/page scraping is not used. API polling is rate-limited locally to ${settings.requestBudgetPerMinute}/min.</div></div>
      <div class="mmms-section"><h3>Recent rejects/errors</h3><div class="mmms-muted">Rejected signals: ${rejections.length}. Errors: ${errors.length}. The most common expected rejection is seller activity at/after the market-change timestamp.</div></div>`;
    restorePanelDraft();
    updatePanelDraftIndicators();
    panel.dataset.mmRendered = '1';
  }

  function savePanelSettings() {
    const typedKey = String(document.getElementById('mmms-key')?.value || '').trim();
    const key = typedKey || PDA_INJECTED_API_KEY || apiKey;
    if (key !== apiKey) {
      ownerBattleStats = null; ownerBattleStatsStatus = 'not-loaded'; ownerBattleStatsAttempted = false;
      ownerMugProfile = {...ownerMugProfile,status:'not-loaded',refreshedAt:0}; ownerMugProfileNextAt = 0;
      licenseState = {status:key ? 'pending' : 'needs-key',checkedAt:0,ownerId:'',ownerName:''};
      discovery.owner = null; saveDiscovery();
    }
    apiKey = key;
    if (typedKey || !PDA_INJECTED_API_KEY) storageSet(STORE.key, apiKey);
    settings.minGrossValue = Math.max(0, Number(document.getElementById('mmms-min')?.value) || 0);
    settings.marketPollSeconds = Math.max(15, Math.min(600, Number(document.getElementById('mmms-market-poll')?.value) || 30));
    settings.pointsPollSeconds = Math.max(15, Math.min(600, Number(document.getElementById('mmms-points-poll')?.value) || 20));
    settings.bazaarPollSeconds = Math.max(30, Math.min(600, Number(document.getElementById('mmms-bazaar-poll')?.value) || 45));
    settings.autoBazaarPollSeconds = Math.max(45, Math.min(900, Number(document.getElementById('mmms-auto-bazaar-poll')?.value) || 90));
    settings.autoBazaarDiscovery = Boolean(document.getElementById('mmms-discover-bazaar')?.checked);
    settings.autoBazaarWatchCap = Math.max(4, Math.min(60, Number(document.getElementById('mmms-bazaar-cap')?.value) || 24));
    settings.auctionDiscovery = Boolean(document.getElementById('mmms-discover-auction')?.checked);
    settings.auctionPollSeconds = Math.max(15, Math.min(300, Number(document.getElementById('mmms-auction-poll')?.value) || 20));
    settings.excludeOwnFaction = Boolean(document.getElementById('mmms-own-faction')?.checked);
    settings.notifications = Boolean(document.getElementById('mmms-notify')?.checked);
    settings.combatScoring = Boolean(document.getElementById('mmms-combat')?.checked);
    settings.manualPlunderPercent = Math.max(0, Math.min(100, Number(document.getElementById('mmms-plunder')?.value) || 0));
    settings.otherMugBonusPercent = Math.max(0, Math.min(100, Number(document.getElementById('mmms-other-mug')?.value) || 0));
    settings.planningBaseMugPercent = Math.max(5, Math.min(10, Number(document.getElementById('mmms-plan-mug')?.value) || 6));
    settings.detectTargetMugProtection = Boolean(document.getElementById('mmms-target-protect')?.checked);
    ownerMugProfileNextAt = 0;
    settings.autoCapture = Boolean(document.getElementById('mmms-auto')?.checked);
    saveSettings();
    clearPanelDraft(SETTINGS_FIELD_IDS);
    setAllDue();
    discovery.nextAuctionAt = 0; discovery.nextBazaarAt = 0; discovery.nextCandidateAt = 0; saveDiscovery();
    render(true);
  }

  async function testApiKey() {
    const keyField = document.getElementById('mmms-key');
    if (keyField) {
      const typedKey = String(keyField.value || '').trim();
      const key = typedKey || PDA_INJECTED_API_KEY || apiKey;
      if (key !== apiKey) {
        apiKey = key; if (typedKey || !PDA_INJECTED_API_KEY) storageSet(STORE.key, apiKey);
        ownerBattleStats = null; ownerBattleStatsStatus = 'not-loaded'; ownerBattleStatsAttempted = false;
        ownerMugProfile = {...ownerMugProfile,status:'not-loaded',refreshedAt:0}; ownerMugProfileNextAt = 0;
        licenseState = {status:apiKey ? 'pending':'needs-key',checkedAt:0,ownerId:'',ownerName:''};
        discovery.owner = null; saveDiscovery();
      }
    }
    try {
      const data = await apiV1('key/?selections=info');
      const owner = data?.info?.user?.name || data?.info?.user?.id || data?.info?.access_type || 'valid';
      const licenseOk = await verifyLicense(true);
      if (!licenseOk) throw new Error(`This build is licensed exclusively to ${LICENSED_USER_NAME} [${LICENSED_USER_ID}].`);
      await refreshOwnerBattleStats(true);
      await refreshOwnerMugProfile(true);
      render(true);
      alert(`${APP}: API key test passed (${owner}). Exclusive license verified for ${LICENSED_USER_NAME} [${LICENSED_USER_ID}]. Combat: ${ownerBattleStatsStatus}. Mug model: ML ${ownerMugProfile.masterfulLevel}/10, Plunder ${ownerMugProfile.effectivePlunderPercent}%, awards ${ownerMugProfile.awards?.total || 0}.`);
    } catch (error) {
      logError('key-test', error);
      alert(`${APP}: API key test failed. ${String(error?.message || error)}`);
    }
  }

  function addBazaarFromInput() {
    const input = document.getElementById('mmms-bazaar-id');
    const sellerId = String(input?.value || '').trim();
    if (!/^\d+$/.test(sellerId)) return alert('Enter a numeric Torn player ID.');
    upsertWatch({source:'bazaar', sellerId, sellerName:`Player ${sellerId}`, snapshot:null});
    if (input) input.value = '';
    clearPanelDraft(['mmms-bazaar-id']);
    render(true);
  }

  function exportDiagnostics() {
    const payload = {
      app: APP, version: VERSION, licensedUser:{id:LICENSED_USER_ID,name:LICENSED_USER_NAME}, licenseStatus:licenseState.status, exportedAt: new Date().toISOString(), url: location.href,
      focused: focused(), route: {itemMarket: isItemMarket(), pointsMarket: isPointsMarket(), bazaar: isBazaar(), itemId: currentItemId()},
      platform: PLATFORM, settings: {...settings}, apiKeyConfigured: Boolean(apiKey), apiKeySource: PDA_INJECTED_API_KEY && apiKey === PDA_INJECTED_API_KEY ? 'tornpda' : (apiKey ? 'stored/manual' : 'none'), apiUsageLastMinute: recentCalls.length, combatModelStatus: ownerBattleStatsStatus, mugModel: {status:ownerMugProfile.status, masterfulLevel:ownerMugProfile.masterfulLevel, masterfulBonusPercent:ownerMugProfile.masterfulBonusPercent, detectedPlunderPercent:ownerMugProfile.detectedPlunderPercent, effectivePlunderPercent:ownerMugProfile.effectivePlunderPercent, otherBonusPercent:ownerMugProfile.otherBonusPercent, awards:ownerMugProfile.awards, refreshedAt:ownerMugProfile.refreshedAt},
      watches, candidates, discovery: {...discovery, owner: discovery.owner ? {...discovery.owner} : null}, seenAuctionCount: seenAuctions.length, rejections: rejections.slice(-50), errors: errors.slice(-50)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SS_Mugger-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('SS_Mugger: Open', () => { panelOpen = true; render(true); });
      GM_registerMenuCommand('SS_Mugger: Capture current page', () => { captureActivePage(); render(true); });
      GM_registerMenuCommand('SS_Mugger: Export diagnostics', exportDiagnostics);
    }
  } catch {}

  setInterval(() => {
    attachLauncher();
    if (settings.autoCapture && focused()) {
      const marker = `${location.href}|${document.body?.childElementCount || 0}`;
      if (marker !== lastCaptureUrl || isItemMarket() || isPointsMarket()) {
        lastCaptureUrl = marker;
        captureActivePage();
      }
    }
  }, 3000);
  setInterval(schedulerTick, 1200);
  document.addEventListener('visibilitychange', () => { if (licensed() && document.visibilityState === 'visible') captureActivePage(); });
  window.addEventListener('focus', () => { if (licensed()) captureActivePage(); });
  window.addEventListener('orientationchange', () => setTimeout(render, 120));
  window.addEventListener('pagehide', () => { saveWatches(); saveCandidates(); });

  render();
})();