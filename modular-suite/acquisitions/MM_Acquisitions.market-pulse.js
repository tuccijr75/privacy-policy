(() => {
  'use strict';

  const SCHEMA = 1;
  const HISTORY_MAX = 96;
  const REJECTION_MAX = 80;
  const CACHE_MAX = 72;
  const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000;
  const DEFAULT_TTL_MS = 45 * 60 * 1000;
  const DEFAULT_REFRESH_MS = 90 * 1000;
  const MIN_REFRESH_MS = 45 * 1000;
  const MAX_REFRESH_MS = 15 * 60 * 1000;
  const DEFAULT_BUDGET_PER_MINUTE = 45;
  const DEFAULT_CANDIDATE_GROSS = 10_000_000;
  const DEFAULT_PROVEN_TURNOVER = 5_000_000;
  const RECENT_REUSE_MS = 2500;
  const ARMORY_DEMAND_SCHEMA = 1;
  const ARMORY_DEMAND_MAX_ITEMS = 24;
  const ARMORY_DEMAND_MAX_LIFETIME_MS = 60 * 60 * 1000;
  const ARMORY_DEMAND_FUTURE_SKEW_MS = 5 * 60 * 1000;

  const asId = value => String(value ?? '').trim();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, num(value)));
  const iso = ms => new Date(Math.max(0, num(ms)) || Date.now()).toISOString();

  function toEpochMs(value) {
    const n = num(value);
    if (!(n > 0)) return 0;
    return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
  }

  function durationMs(value) {
    const n = Math.max(0, num(value));
    if (!n) return 0;
    return n > 100000 ? Math.round(n) : Math.round(n * 1000);
  }

  function marketRoot(payload) {
    if (payload?.itemmarket && !Array.isArray(payload.itemmarket)) return payload.itemmarket;
    if (payload?.item_market && !Array.isArray(payload.item_market)) return payload.item_market;
    return payload || {};
  }

  function marketRows(payload) {
    if (Array.isArray(payload)) return payload;
    const root = marketRoot(payload);
    if (Array.isArray(root)) return root;
    for (const key of ['listings', 'itemmarket', 'item_market']) {
      if (Array.isArray(root?.[key])) return root[key];
    }
    return [];
  }

  function compactBands(rows, limit = 12) {
    const bands = new Map();
    for (const row of rows) {
      const price = Math.max(0, num(row?.price ?? row?.cost));
      const quantity = Math.max(0, Math.round(num(row?.amount ?? row?.quantity ?? row?.qty)));
      if (!(price > 0) || !(quantity > 0)) continue;
      bands.set(price, (bands.get(price) || 0) + quantity);
    }
    return [...bands.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, Math.max(1, Math.min(24, Math.round(num(limit) || 12))))
      .map(([price, quantity]) => ({price, quantity}));
  }

  function normalizeTornItemMarket(itemId, itemName, payload, options = {}) {
    const id = asId(itemId);
    const fetchedAt = Math.max(0, num(options.fetchedAt) || Date.now());
    const root = marketRoot(payload);
    const rows = marketRows(payload).map(row => ({
      price: Math.max(0, num(row?.price ?? row?.cost)),
      quantity: Math.max(0, Math.round(num(row?.amount ?? row?.quantity ?? row?.qty)))
    })).filter(row => row.price > 0 && row.quantity > 0).sort((a, b) => a.price - b.price);
    const floorPrice = rows[0]?.price || 0;
    const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
    const marketExposure = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const peakListingExposure = rows.reduce((max, row) => Math.max(max, row.price * row.quantity), 0);
    const sourceTimestamp = toEpochMs(root?.cache_timestamp ?? root?.timestamp ?? payload?.cache_timestamp ?? payload?.timestamp);
    const upstreamCacheDelayMs = durationMs(root?.cache_delay ?? payload?.cache_delay);
    return {
      itemId: id,
      itemName: String(itemName || ('Item ' + id)),
      source: 'Torn API v2 Item Market',
      sourceTimestamp,
      fetchedAt,
      upstreamCacheDelayMs,
      floorPrice,
      marketDepth: rows.length,
      totalQty,
      marketExposure,
      peakListingExposure,
      priceBands: compactBands(rows),
      sampleLimit: rows.length
    };
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || !/^\d+$/.test(asId(snapshot.itemId))) return {ok:false, reason:'invalid_item'};
    const numeric = ['sourceTimestamp','fetchedAt','upstreamCacheDelayMs','floorPrice','marketDepth','totalQty','marketExposure','peakListingExposure'];
    for (const key of numeric) {
      const value = Number(snapshot[key] ?? 0);
      if (!Number.isFinite(value) || value < 0) return {ok:false, reason:'invalid_' + key};
    }
    if (!(num(snapshot.floorPrice) > 0) || !(num(snapshot.marketDepth) > 0) || !(num(snapshot.totalQty) > 0)) {
      return {ok:false, reason:'empty_market_snapshot'};
    }
    return {ok:true, reason:'ok'};
  }

  function diffSnapshots(previous, current, options = {}) {
    const currentCheck = validateSnapshot(current);
    if (!currentCheck.ok) return {event:null, rejected:true, reason:currentCheck.reason};
    if (!previous) return {event:null, rejected:false, reason:'baseline'};
    const previousCheck = validateSnapshot(previous);
    if (!previousCheck.ok) return {event:null, rejected:true, reason:'previous_' + previousCheck.reason};

    const prevSource = num(previous.sourceTimestamp);
    const currSource = num(current.sourceTimestamp);
    if (!prevSource || !currSource) return {event:null, rejected:false, reason:'source_timestamp_unavailable'};
    if (currSource < prevSource) return {event:null, rejected:true, reason:'source_time_regression'};
    if (currSource === prevSource) return {event:null, rejected:false, reason:'upstream_not_advanced'};

    const maxGapMs = Math.max(5 * 60 * 1000, num(options.maxGapMs) || 30 * 60 * 1000);
    const gapMs = currSource - prevSource;
    if (gapMs > maxGapMs) return {event:null, rejected:true, reason:'observation_gap_too_large'};

    const previousQty = Math.round(num(previous.totalQty));
    const currentQty = Math.round(num(current.totalQty));
    if (currentQty > previousQty) return {event:null, rejected:false, reason:'inventory_increase_not_movement'};
    if (currentQty === previousQty) return {event:null, rejected:false, reason:'unchanged'};
    const units = previousQty - currentQty;
    if (!(units > 0) || units > previousQty) return {event:null, rejected:true, reason:'impossible_quantity_delta'};

    const previousFloor = num(previous.floorPrice);
    const currentFloor = num(current.floorPrice);
    const referenceFloor = Math.max(1, Math.min(previousFloor || currentFloor, currentFloor || previousFloor));
    const floorShift = previousFloor > 0 && currentFloor > 0 ? Math.abs(currentFloor - previousFloor) / previousFloor : 0;
    if (floorShift > clamp(options.maxFloorShiftRatio ?? 0.65, 0.10, 2.0)) {
      return {event:null, rejected:true, reason:'price_regime_shift'};
    }

    const hours = Math.max(1 / 60, gapMs / 3600000);
    const turnover = Math.round(units * referenceFloor);
    const depthChange = Math.abs(num(current.marketDepth) - num(previous.marketDepth));
    const depthBase = Math.max(1, num(previous.marketDepth));
    const depthConsistency = Math.max(0, 1 - Math.min(1, depthChange / depthBase));
    const confidencePct = Math.round(clamp(52 + depthConsistency * 18 + (floorShift <= 0.10 ? 12 : 4), 0, 82));
    return {
      event: {
        kind:'observed_outflow',
        at:currSource,
        previousAt:prevSource,
        durationHours:hours,
        units,
        unitValue:referenceFloor,
        turnover,
        confidencePct
      },
      rejected:false,
      reason:'observed_outflow'
    };
  }

  function settingsOf(pulse) {
    const raw = pulse?.settings || {};
    return {
      windowMs: clamp(raw.windowMs || DEFAULT_WINDOW_MS, 15 * 60 * 1000, 24 * 60 * 60 * 1000),
      ttlMs: clamp(raw.ttlMs || DEFAULT_TTL_MS, 10 * 60 * 1000, 6 * 60 * 60 * 1000),
      baseRefreshMs: clamp(raw.baseRefreshMs || DEFAULT_REFRESH_MS, MIN_REFRESH_MS, MAX_REFRESH_MS),
      requestBudgetPerMinute: Math.round(clamp(raw.requestBudgetPerMinute || DEFAULT_BUDGET_PER_MINUTE, 10, 90)),
      candidateMinGross: Math.max(1_000_000, num(raw.candidateMinGross) || DEFAULT_CANDIDATE_GROSS),
      provenMinTurnover: Math.max(1_000_000, num(raw.provenMinTurnover) || DEFAULT_PROVEN_TURNOVER),
      historyMax: Math.round(clamp(raw.historyMax || HISTORY_MAX, 12, HISTORY_MAX)),
      cacheMax: Math.round(clamp(raw.cacheMax || CACHE_MAX, 12, CACHE_MAX))
    };
  }

  function ensurePulse(draft) {
    const marketIntel = draft.marketIntel || (draft.marketIntel = {});
    const pulse = marketIntel.marketPulse && typeof marketIntel.marketPulse === 'object' ? marketIntel.marketPulse : {};
    pulse.schema = SCHEMA;
    pulse.updatedAt = Math.max(0, num(pulse.updatedAt));
    pulse.items = pulse.items && typeof pulse.items === 'object' && !Array.isArray(pulse.items) ? pulse.items : {};
    pulse.settings = {...settingsOf(pulse)};
    pulse.scheduler = pulse.scheduler && typeof pulse.scheduler === 'object' ? pulse.scheduler : {};
    pulse.scheduler.requestLog = Array.isArray(pulse.scheduler.requestLog) ? pulse.scheduler.requestLog.map(num).filter(v => v > 0).slice(-90) : [];
    pulse.scheduler.lastRefreshAt = Math.max(0, num(pulse.scheduler.lastRefreshAt));
    pulse.scheduler.lastErrorAt = Math.max(0, num(pulse.scheduler.lastErrorAt));
    pulse.scheduler.lastError = String(pulse.scheduler.lastError || '').slice(0, 240);
    pulse.rejections = Array.isArray(pulse.rejections) ? pulse.rejections.slice(-REJECTION_MAX) : [];
    marketIntel.marketPulse = pulse;
    return pulse;
  }

  function snapshotPoint(snapshot) {
    return {
      sourceTimestamp:num(snapshot.sourceTimestamp),
      fetchedAt:num(snapshot.fetchedAt),
      floorPrice:num(snapshot.floorPrice),
      marketDepth:Math.round(num(snapshot.marketDepth)),
      totalQty:Math.round(num(snapshot.totalQty)),
      marketExposure:num(snapshot.marketExposure)
    };
  }

  function freshness(snapshot, nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS) {
    const sourceAt = num(snapshot?.sourceTimestamp);
    const fetchedAt = num(snapshot?.fetchedAt);
    const sourceAgeMs = sourceAt ? Math.max(0, nowMs - sourceAt) : Infinity;
    const fetchAgeMs = fetchedAt ? Math.max(0, nowMs - fetchedAt) : Infinity;
    const stale = !fetchedAt || fetchAgeMs > ttlMs;
    const label = stale ? 'STALE' : fetchAgeMs <= 60_000 ? 'FRESH' : fetchAgeMs <= 5 * 60_000 ? 'GOOD' : 'AGING';
    return {sourceAgeMs, fetchAgeMs, stale, label};
  }

  function deriveItemMetrics(item, nowMs = Date.now(), settings = {}) {
    const cfg = {...settingsOf({settings}), ...settings};
    const events = (Array.isArray(item?.movementHistory) ? item.movementHistory : [])
      .filter(row => num(row?.at) > 0 && nowMs - num(row.at) <= cfg.windowMs);
    const snapshots = (Array.isArray(item?.snapshotHistory) ? item.snapshotHistory : [])
      .filter(row => num(row?.fetchedAt) > 0 && nowMs - num(row.fetchedAt) <= cfg.windowMs);
    const windowHours = Math.max(0.25, cfg.windowMs / 3600000);
    const units = events.reduce((sum, row) => sum + Math.max(0, num(row.units)), 0);
    const turnover = events.reduce((sum, row) => sum + Math.max(0, num(row.turnover)), 0);
    const observedEventsPerHour = events.length / windowHours;
    const observedUnitsPerHour = units / windowHours;
    const turnoverPerHour = turnover / windowHours;
    const latest = item?.lastSnapshot || snapshots[snapshots.length - 1] || {};
    const first = snapshots[0] || {};
    const trendPct = num(first.floorPrice) > 0 && num(latest.floorPrice) > 0
      ? (num(latest.floorPrice) - num(first.floorPrice)) / num(first.floorPrice) * 100
      : 0;
    const depthScore = clamp(Math.log10(1 + Math.max(0, num(latest.totalQty))) * 25 + Math.log10(1 + Math.max(0, num(latest.marketDepth))) * 18, 0, 100);
    const eventScore = clamp(observedEventsPerHour * 28, 0, 100);
    const unitScore = clamp(Math.log10(1 + observedUnitsPerHour) * 32, 0, 100);
    const turnoverScore = clamp((Math.log10(1 + turnoverPerHour) - 5) * 24, 0, 100);
    const repeatConfidence = events.length === 0 ? 30 : events.length === 1 ? 52 : events.length === 2 ? 68 : Math.min(94, 72 + events.length * 4);
    const eventConfidence = events.length ? events.reduce((sum, row) => sum + clamp(row.confidencePct, 0, 100), 0) / events.length : 30;
    const fresh = freshness(latest, nowMs, cfg.ttlMs);
    const freshnessScore = fresh.stale ? 0 : fresh.fetchAgeMs <= 60_000 ? 100 : clamp(100 - fresh.fetchAgeMs / cfg.ttlMs * 70, 20, 100);
    const confidencePct = Math.round(clamp(repeatConfidence * .45 + eventConfidence * .35 + freshnessScore * .20, 0, 96));
    const liquidityScore = Math.round(clamp(depthScore * .38 + eventScore * .22 + unitScore * .18 + turnoverScore * .14 + confidencePct * .08, 0, 100));
    const marketExposure = Math.max(0, num(latest.marketExposure));
    const largeSaleActivity = marketExposure >= cfg.candidateMinGross || events.some(row => num(row.turnover) >= cfg.candidateMinGross);
    const proven = events.length >= 3 && turnoverPerHour >= cfg.provenMinTurnover && confidencePct >= 60;
    const tier = proven ? 'proven' : (largeSaleActivity ? 'candidate' : 'observed');
    return {
      observedEventsPerHour,
      observedUnitsPerHour,
      turnoverPerHour,
      liquidityScore,
      confidencePct,
      trendPct,
      largeSaleActivity,
      tier,
      marketDepth:Math.round(num(latest.marketDepth)),
      totalQty:Math.round(num(latest.totalQty)),
      floorPrice:num(latest.floorPrice),
      marketExposure,
      freshness:fresh
    };
  }

  function pruneCache(pulse, nowMs = Date.now()) {
    const cfg = settingsOf(pulse);
    const entries = Object.entries(pulse.items || {}).sort((a, b) => {
      const aAt = Math.max(num(a[1]?.lastSnapshot?.fetchedAt), num(a[1]?.updatedAt));
      const bAt = Math.max(num(b[1]?.lastSnapshot?.fetchedAt), num(b[1]?.updatedAt));
      return bAt - aAt;
    });
    for (const [id] of entries.slice(cfg.cacheMax)) delete pulse.items[id];
    for (const [id, item] of Object.entries(pulse.items)) {
      const at = Math.max(num(item?.lastSnapshot?.fetchedAt), num(item?.updatedAt));
      if (at && nowMs - at > cfg.ttlMs * 4 && item?.tier !== 'proven') delete pulse.items[id];
    }
  }

  function effectiveRefreshMs(pulse, itemCount = 1, cacheDelayMs = 0) {
    const cfg = settingsOf(pulse);
    const budgetForPulse = Math.max(4, Math.floor(cfg.requestBudgetPerMinute * .55));
    const budgetCycleMs = Math.ceil(Math.max(1, itemCount) / budgetForPulse * 60_000);
    return clamp(Math.max(cfg.baseRefreshMs, budgetCycleMs, Math.max(0, num(cacheDelayMs))), MIN_REFRESH_MS, MAX_REFRESH_MS);
  }

  function applySnapshotToDraft(draft, snapshot, options = {}) {
    const pulse = ensurePulse(draft);
    const checked = validateSnapshot(snapshot);
    const nowMs = Math.max(0, num(snapshot?.fetchedAt) || Date.now());
    if (!checked.ok) {
      pulse.rejections.push({at:nowMs, itemId:asId(snapshot?.itemId), reason:checked.reason});
      pulse.rejections = pulse.rejections.slice(-REJECTION_MAX);
      pulse.updatedAt = nowMs;
      return {pulse, item:null, accepted:false, reason:checked.reason};
    }

    const id = asId(snapshot.itemId);
    const existing = pulse.items[id] && typeof pulse.items[id] === 'object' ? pulse.items[id] : {};
    const item = {
      ...existing,
      itemId:id,
      itemName:String(snapshot.itemName || existing.itemName || ('Item ' + id)),
      sources:{itemMarket:'Torn API v2 Item Market'},
      snapshotHistory:Array.isArray(existing.snapshotHistory) ? existing.snapshotHistory : [],
      movementHistory:Array.isArray(existing.movementHistory) ? existing.movementHistory : [],
      rejections:Array.isArray(existing.rejections) ? existing.rejections : []
    };

    const diff = diffSnapshots(existing.lastSnapshot || null, snapshot, options);
    if (diff.rejected) {
      const rejection = {at:nowMs, itemId:id, reason:diff.reason};
      item.rejections.push(rejection);
      pulse.rejections.push(rejection);
    } else if (diff.event) {
      item.movementHistory.push(diff.event);
    }

    item.snapshotHistory.push(snapshotPoint(snapshot));
    const cfg = settingsOf(pulse);
    item.snapshotHistory = item.snapshotHistory.slice(-cfg.historyMax);
    item.movementHistory = item.movementHistory.slice(-cfg.historyMax);
    item.rejections = item.rejections.slice(-Math.min(REJECTION_MAX, cfg.historyMax));
    item.lastSnapshot = {
      ...snapshotPoint(snapshot),
      upstreamCacheDelayMs:num(snapshot.upstreamCacheDelayMs),
      marketExposure:num(snapshot.marketExposure),
      peakListingExposure:num(snapshot.peakListingExposure),
      priceBands:Array.isArray(snapshot.priceBands) ? snapshot.priceBands.slice(0, 12) : [],
      source:String(snapshot.source || 'Torn API v2 Item Market')
    };
    const metrics = deriveItemMetrics(item, nowMs, cfg);
    Object.assign(item, metrics, {
      sourceTimestamp:num(snapshot.sourceTimestamp),
      fetchedAt:nowMs,
      upstreamCacheDelayMs:num(snapshot.upstreamCacheDelayMs),
      updatedAt:nowMs,
      nextRefreshAt:nowMs + effectiveRefreshMs(pulse, Math.max(1, Object.keys(pulse.items).length || 1), snapshot.upstreamCacheDelayMs)
    });
    pulse.items[id] = item;
    if (options.recordRequest !== false) {
      pulse.scheduler.requestLog.push(nowMs);
      pulse.scheduler.requestLog = pulse.scheduler.requestLog.filter(at => nowMs - at <= 60_000).slice(-90);
    }
    pulse.scheduler.lastRefreshAt = nowMs;
    pulse.scheduler.lastError = '';
    pulse.scheduler.lastErrorAt = 0;
    pulse.updatedAt = nowMs;
    pulse.rejections = pulse.rejections.slice(-REJECTION_MAX);
    pruneCache(pulse, nowMs);
    return {pulse, item, accepted:true, reason:diff.reason};
  }

  function pulseFor(state, itemId, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse;
    const item = pulse?.items?.[asId(itemId)];
    if (!item) return null;
    const metrics = deriveItemMetrics(item, nowMs, settingsOf(pulse));
    return {...item, ...metrics};
  }

  function rankPulseItems(state, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse;
    if (!pulse?.items) return [];
    const weight = {proven:3, candidate:2, observed:1};
    return Object.values(pulse.items).map(item => ({...item, ...deriveItemMetrics(item, nowMs, settingsOf(pulse))}))
      .sort((a, b) =>
        (weight[b.tier] || 0) - (weight[a.tier] || 0) ||
        num(b.turnoverPerHour) - num(a.turnoverPerHour) ||
        num(b.liquidityScore) - num(a.liquidityScore) ||
        num(b.confidencePct) - num(a.confidencePct)
      );
  }

  function contribution(metrics, unitProfit = 0) {
    if (!metrics || metrics.freshness?.stale || num(metrics.confidencePct) < 30) return null;
    const velocityProfit = Math.max(0, num(unitProfit)) * Math.max(0, num(metrics.observedUnitsPerHour));
    const velocityScore = clamp((Math.log10(1 + velocityProfit) - 4) * 22, 0, 100);
    const score = clamp(num(metrics.liquidityScore) * .45 + num(metrics.confidencePct) * .25 + velocityScore * .30, 0, 100);
    return {score, velocityProfitPerHour:velocityProfit, velocityScore};
  }

  function armoryDemandItemIds(state, nowMs = Date.now(), limit = ARMORY_DEMAND_MAX_ITEMS) {
    const demand = state?.factionInventory?.marketPulseDemand;
    if (!demand || Math.round(num(demand.schema)) !== ARMORY_DEMAND_SCHEMA) return [];
    if (String(demand.owner || '') !== 'MM_Faction_Armory') return [];
    const updatedAt = num(demand.updatedAt);
    const expiresAt = num(demand.expiresAt);
    if (!updatedAt || !expiresAt || expiresAt <= nowMs) return [];
    if (updatedAt > nowMs + ARMORY_DEMAND_FUTURE_SKEW_MS) return [];
    if (expiresAt <= updatedAt || expiresAt - updatedAt > ARMORY_DEMAND_MAX_LIFETIME_MS) return [];
    const cap = Math.max(1, Math.min(ARMORY_DEMAND_MAX_ITEMS, Math.round(num(limit) || ARMORY_DEMAND_MAX_ITEMS)));
    const ids = [];
    for (const row of Array.isArray(demand.items) ? demand.items : []) {
      const id = asId(row?.itemId);
      if (/^\d+$/.test(id) && !ids.includes(id)) ids.push(id);
      if (ids.length >= cap) break;
    }
    return ids;
  }

  function trackedItemIds(state, limit = 36, nowMs = Date.now()) {
    const cap = Math.max(1, Math.min(CACHE_MAX, Math.round(num(limit) || 36)));
    const ids = [];
    const add = value => {
      const id = asId(value);
      if (/^\d+$/.test(id) && !ids.includes(id) && ids.length < cap) ids.push(id);
    };
    for (const id of armoryDemandItemIds(state, nowMs)) add(id);
    for (const row of rankPulseItems(state, nowMs)) add(row.itemId);
    const pricelist = Object.values(state?.procurement?.pricelist?.items || {}).sort((a,b) => num(b?.buyPrice) - num(a?.buyPrice));
    for (const row of pricelist) add(row?.itemId ?? row?.id);
    const market = Object.values(state?.marketIntel?.marketplace || {}).sort((a,b) => {
      const ap = Math.max(num(a?.bazaarAverage), num(a?.marketPrice)) - num(a?.lowestPrice);
      const bp = Math.max(num(b?.bazaarAverage), num(b?.marketPrice)) - num(b?.lowestPrice);
      return bp - ap;
    });
    for (const row of market) add(row?.itemId);
    for (const row of state?.procurement?.ranked?.liveMarket || []) add(row?.itemId);
    for (const row of state?.travelIntel?.rows || []) add(row?.itemId);
    return ids;
  }

  function budgetStatus(stateOrPulse, nowMs = Date.now()) {
    const pulse = stateOrPulse?.marketIntel?.marketPulse || stateOrPulse || {};
    const cfg = settingsOf(pulse);
    const recent = (Array.isArray(pulse?.scheduler?.requestLog) ? pulse.scheduler.requestLog : []).map(num).filter(at => at > 0 && nowMs - at <= 60_000);
    return {used:recent.length, limit:cfg.requestBudgetPerMinute, available:recent.length < cfg.requestBudgetPerMinute, recent};
  }

  function canAcquireLease(lease, ownerId, nowMs = Date.now()) {
    const owner = String(ownerId || '');
    if (!owner) return false;
    if (!lease || !lease.owner) return true;
    if (String(lease.owner) === owner) return true;
    return num(lease.expiresAt) <= nowMs;
  }

  function nextDueItem(state, nowMs = Date.now()) {
    const ids = trackedItemIds(state, 36, nowMs);
    const pulse = state?.marketIntel?.marketPulse || {};
    const rows = ids.map((id, index) => ({
      id,
      order:index,
      dueAt:num(pulse?.items?.[id]?.nextRefreshAt)
    })).filter(row => !row.dueAt || row.dueAt <= nowMs);
    rows.sort((a,b) => a.dueAt - b.dueAt || a.order - b.order);
    return rows[0]?.id || '';
  }

  function recentReusableSnapshot(state, itemId, nowMs = Date.now(), reuseMs = RECENT_REUSE_MS) {
    const snap = state?.procurement?.marketSnapshots?.[asId(itemId)];
    const fetchedAt = snap?.fetchedAt ? Date.parse(snap.fetchedAt) : 0;
    if (!fetchedAt || nowMs - fetchedAt > Math.max(0, num(reuseMs))) return null;
    const pulseSnapshot = snap?.pulseSnapshot;
    return validateSnapshot(pulseSnapshot).ok ? pulseSnapshot : null;
  }

  function scheduleFailureToDraft(draft, itemId, error, nowMs = Date.now()) {
    const pulse = ensurePulse(draft);
    const id = asId(itemId);
    const item = pulse.items[id] || (pulse.items[id] = {itemId:id,itemName:'Item ' + id,snapshotHistory:[],movementHistory:[],rejections:[]});
    const prior = Math.max(MIN_REFRESH_MS, num(item.retryDelayMs) || MIN_REFRESH_MS);
    item.retryDelayMs = Math.min(MAX_REFRESH_MS, prior * 2);
    item.nextRefreshAt = nowMs + item.retryDelayMs;
    pulse.scheduler.lastErrorAt = nowMs;
    pulse.scheduler.lastError = String(error?.message || error || 'refresh_failed').slice(0, 240);
    pulse.updatedAt = nowMs;
    return pulse;
  }

  function sanitizedDiagnostics(state, lease = null, nowMs = Date.now()) {
    const pulse = state?.marketIntel?.marketPulse || {};
    const budget = budgetStatus(pulse, nowMs);
    const ranked = rankPulseItems(state, nowMs);
    return {
      product:'MM_Acquisitions',
      component:'Market Pulse',
      schema:SCHEMA,
      exportedAt:iso(nowMs),
      source:'Torn API v2 Item Market',
      updatedAt:num(pulse.updatedAt),
      scheduler:{
        owner:String(lease?.owner || ''),
        leaseExpiresAt:num(lease?.expiresAt),
        budgetUsed:budget.used,
        budgetLimit:budget.limit,
        lastRefreshAt:num(pulse?.scheduler?.lastRefreshAt),
        lastErrorAt:num(pulse?.scheduler?.lastErrorAt),
        lastError:String(pulse?.scheduler?.lastError || '')
      },
      cache:{itemCount:ranked.length, proven:ranked.filter(x=>x.tier==='proven').length, candidates:ranked.filter(x=>x.tier==='candidate').length},
      rejectionCount:Array.isArray(pulse.rejections) ? pulse.rejections.length : 0,
      rejectionReasons:(Array.isArray(pulse.rejections) ? pulse.rejections : []).reduce((out,row)=>{const key=String(row?.reason||'unknown');out[key]=(out[key]||0)+1;return out;},{}),
      items:ranked.map(item=>({
        itemId:item.itemId,itemName:item.itemName,tier:item.tier,
        floorPrice:item.floorPrice,marketDepth:item.marketDepth,totalQty:item.totalQty,
        observedEventsPerHour:item.observedEventsPerHour,observedUnitsPerHour:item.observedUnitsPerHour,
        turnoverPerHour:item.turnoverPerHour,liquidityScore:item.liquidityScore,
        confidencePct:item.confidencePct,trendPct:item.trendPct,
        sourceTimestamp:item.sourceTimestamp,fetchedAt:item.fetchedAt,
        upstreamCacheDelayMs:item.upstreamCacheDelayMs,
        freshness:item.freshness
      }))
    };
  }

  function createEngine(deps = {}) {
    const core = deps.core;
    const refreshItemMarket = deps.refreshItemMarket;
    const hasKey = typeof deps.hasKey === 'function' ? deps.hasKey : () => true;
    const readLease = typeof deps.readLease === 'function' ? deps.readLease : () => null;
    const writeLease = typeof deps.writeLease === 'function' ? deps.writeLease : () => {};
    const ownerId = String(deps.ownerId || '');
    const onState = typeof deps.onState === 'function' ? deps.onState : () => {};
    const leaseMs = clamp(deps.leaseMs || 75_000, 30_000, 180_000);
    if (!core || typeof core.readLegacyState !== 'function' || typeof core.updateDomainState !== 'function') throw new Error('Market Pulse core dependency is required.');
    if (typeof refreshItemMarket !== 'function') throw new Error('Market Pulse refresh dependency is required.');

    async function tick(options = {}) {
      const nowMs = Date.now();
      if (!hasKey()) return {skipped:'no-key'};
      const currentLease = readLease();
      if (!canAcquireLease(currentLease, ownerId, nowMs)) return {skipped:'lease-held', owner:currentLease?.owner || ''};
      writeLease({owner:ownerId,updatedAt:nowMs,expiresAt:nowMs+leaseMs});

      let state = await core.readLegacyState();
      const budget = budgetStatus(state, nowMs);
      if (!budget.available) return {skipped:'budget', budget};
      const itemId = options.itemId ? asId(options.itemId) : nextDueItem(state, nowMs);
      if (!/^\d+$/.test(itemId)) return {skipped:'nothing-due'};

      const reused = recentReusableSnapshot(state, itemId, nowMs);
      if (reused) {
        await core.updateDomainState('market', draft => {
          applySnapshotToDraft(draft, {...reused, fetchedAt:nowMs}, {recordRequest:false});
          return draft;
        });
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:true,itemId,reusedRecent:true,state};
      }

      try {
        await refreshItemMarket(itemId);
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:true,itemId,reusedRecent:false,state};
      } catch (error) {
        await core.updateDomainState('market', draft => {
          scheduleFailureToDraft(draft,itemId,error,nowMs);
          return draft;
        });
        state = await core.readLegacyState();
        onState(state);
        return {refreshed:false,itemId,error:String(error?.message || error),state};
      }
    }

    function release() {
      const lease = readLease();
      if (lease?.owner === ownerId) writeLease({...lease,expiresAt:0,releasedAt:Date.now()});
    }

    return Object.freeze({tick,release});
  }

  Object.defineProperty(globalThis,'MMTornMarketPulse',{
    value:Object.freeze({
      SCHEMA,HISTORY_MAX,REJECTION_MAX,CACHE_MAX,RECENT_REUSE_MS,
      normalizeTornItemMarket,validateSnapshot,diffSnapshots,ensurePulse,applySnapshotToDraft,
      deriveItemMetrics,pulseFor,rankPulseItems,contribution,armoryDemandItemIds,trackedItemIds,
      effectiveRefreshMs,budgetStatus,canAcquireLease,nextDueItem,recentReusableSnapshot,
      scheduleFailureToDraft,sanitizedDiagnostics,createEngine
    }),
    configurable:true,enumerable:false,writable:false
  });
})();
