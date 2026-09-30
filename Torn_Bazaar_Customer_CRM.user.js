// ==UserScript==
// @name         Torn Bazaar Customer CRM
// @namespace    manic-mike.torn.crm
// @version      7.4.0
// @description  Bazaar operations CRM with unified smart refresh, trusted market pricing, procurement intelligence, financial exports, customer automation, travel intelligence, and IndexedDB storage.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/Torn_Bazaar_Customer_CRM.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/Torn_Bazaar_Customer_CRM.user.js
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// @connect      yata.yt
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(() => {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================

    const VERSION = '7.4.0';
    const SHOP_NAME = "MANIC'S MAD HOUSE";
    const FAVORITE_PLAYER_NAME = 'Manic-Mike';
    const OWNER_TORN_ID = '4325346';
    const FAVORITE_CTA = '★ ADD ' + FAVORITE_PLAYER_NAME + ' TO YOUR FAVORITES ★  Keep MANIC\'S MAD HOUSE easy to find for future purchases and restocks.';
    const SHOP_BANNER_URL = 'https://i.postimg.cc/qvV31ggb/Chat-GPT-Image-Sep-20-2026-09-46-21-PM.png';
    const BANNER_URL = 'https://i.postimg.cc/qvV31ggb/Chat-GPT-Image-Sep-20-2026-09-46-21-PM.png';
    const BAZAAR_SELL_LOG_ID = 1226;
    const PENDING_COMPOSE_KEY = 'mm_bazaar_crm_pending_compose_v1';
    const PENDING_FIRST_SEND_KEY = 'mm_bazaar_crm_pending_first_send_v1';
    const FIRST_SYNC_LOOKBACK_MS = 24 * 60 * 60 * 1000;
    const CUSTOMER_REFRESH_LOOKBACK_MS = 72 * 60 * 60 * 1000;
    const NORMAL_LOOKBACK_MS = 6 * 60 * 60 * 1000;
    const DEEP_SALES_RECONCILE_MS = 5 * 60 * 1000;
    const COUPON_WINDOW_MS = 24 * 60 * 60 * 1000;
    const COUPON_MAX_USES = 2;
    const MAX_CASHBACK_PERCENT = 0.10;
    const MAX_PROCESSED = 25_000;
    const MAX_LOG_PAGES = 250;
    const API_BASE = 'https://api.torn.com/v2';
    const PROCUREMENT_CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
    const ACQUISITION_LOG_IDS = Object.freeze({
        1112: 'Item Market',
        1225: 'Bazaar'
    });
    const ITEM_MARKET_FEE_RATE = 0.05;
    const MARKET_HISTORY_MAX_PER_ITEM = 240;
    const PROCUREMENT_FIRST_ACQUISITION_LOOKBACK_DAYS = 90;
    const ACQUISITION_COVERAGE_BACKFILL_DAYS = 180;
    const ACQUISITION_COVERAGE_MAX_PAGES = 50;
    const ACQUISITION_COVERAGE_VERSION = '7.4-fifo-window-2';
    const WEAV3R_BASE = 'https://weav3r.dev/api';
    const WEAV3R_GLOBAL_TTL_MS = 60_000;
    const WEAV3R_DETAIL_TTL_MS = 60_000;
    const WEAV3R_MAX_ENRICH = 30;
    const SMART_REFRESH_ITEM_LIMIT = 8;
    const MARKET_ENRICH_CONCURRENCY = 1;
    const PROCUREMENT_MARKET_CONCURRENCY = 1;
    const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    const BACKGROUND_COORDINATOR_LEASE_MS = 75 * 1000;
    const BACKGROUND_COORDINATOR_KEY = 'mm_bazaar_crm_background_coordinator_v1';
    const BAZAAR_VERIFY_MAX_AGE_SEC = 120;
    const MARKET_INTEL_HISTORY_MAX = 120;
    const OPS_SNAPSHOT_MAX = 2500;
    const PRICE_HISTORY_MAX_PER_ITEM = 500;
    const RESTOCK_SESSION_MAX = 100;
    const STOCKOUT_LOOKBACK_DAYS = 30;
    const ANALYTICS_LOOKBACK_DAYS = 30;
    const DEFAULT_LISTING_HOURS = 12;
    const DEAD_STOCK_DAYS = 30;
    const IDB_NAME = 'mm_bazaar_crm_idb';
    const IDB_VERSION = 1;
    const IDB_STATE_STORE = 'state';
    const IDB_MAIN_KEY = 'main';
    const GITHUB_SYNC_INTERVAL_MS = 60 * 60 * 1000;
    const GITHUB_SETTINGS_KEY = 'mm_bazaar_crm_github_settings_v1';
    const GITHUB_TOKEN_KEY = 'mm_bazaar_crm_github_token_v1';
    const GITHUB_BACKUP_PASSPHRASE_KEY = 'mm_bazaar_crm_github_backup_passphrase_v1';
    const CONTACT_LEDGER_KEY = 'mm_bazaar_crm_contact_ledger_v1';
    const DB_CHANNEL_NAME = 'mm_bazaar_crm_cross_tab_v1';
    const TRAVEL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
    const YATA_TRAVEL_URL = 'https://yata.yt/api/v1/travel/export/';
    const YATA_SAMPLE_INTERVAL_MS = 60 * 1000;
    const TRAVEL_HISTORY_WINDOW_HOURS = 24;
    const TRAVEL_FORECAST_LEDGER_MAX = 1000;
    const TRAVEL_FORECAST_MODEL_VERSION = '7.2.0-eval-2';
    const TRAVEL_FORECAST_MAX_OBSERVATION_GAP_MS = 10 * 60 * 1000;
    const YATA_COUNTRIES = Object.freeze({
        mex:'Mexico', cay:'Cayman Islands', can:'Canada', haw:'Hawaii', uni:'United Kingdom',
        arg:'Argentina', swi:'Switzerland', jap:'Japan', chi:'China', uae:'UAE', sou:'South Africa'
    });
    const TRAVEL_FEED_KEY = 'mm_bazaar_crm_travel_feed_v1';
    const TRAVEL_RETURN_KEY = 'mm_bazaar_crm_travel_return_v1';
    const TRAVEL_CAPTURE_STATUS_KEY = 'mm_bazaar_crm_travel_capture_status_v1';
    const CRM_UPDATE_URL = 'https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/Torn_Bazaar_Customer_CRM.user.js';
    const CRM_UPDATE_STATUS_KEY = 'mm_bazaar_crm_update_status_v1';

    const CASHBACK_TIERS = [
        { minimum: 1_000_000, cashback: 20_000 },
        { minimum: 250_000, cashback: 10_000 },
        { minimum: 50_000, cashback: 5_000 }
    ];

    const DB_KEY = 'mm_bazaar_crm_v1';
    const OLD_API_KEY = 'mm_bazaar_crm_api_v1';
    const API_KEY = 'mm_bazaar_crm_api_v3';
    const FACTION_API_KEY = 'mm_bazaar_crm_faction_api_v1';
    const FACTION_INVENTORY_SYNC_INTERVAL_MS = 60 * 60 * 1000;
    const FACTION_INVENTORY_SNAPSHOT_MAX = 192;
    const FACTION_INVENTORY_EVENT_MAX = 2500;
    const FACTION_INVENTORY_CATEGORIES = Object.freeze([
        'armor','temporary','medical','consumables'
    ]);
    const FACTION_INVENTORY_LOAN_CATEGORIES = Object.freeze(['armor','temporary']);
    const FACTION_INVENTORY_POLICY = Object.freeze({
        scope: 'Armor, temporary weapons, medical supplies, and consumables.',
        role: 'Regularly audit vault stock and keep the currently unlocked armories visible; source gear and weapon upgrades through travel only when leadership authorizes funds.',
        sourcing: 'Faction member bazaars first; then trusted traders/private bazaars; then the Item Market. For medical supplies and temporary weapons, compare against the Item Market because leadership reports it is usually the most cost-effective source.',
        pricing: 'No fixed maximum prices are established yet. Build sensible guidelines from observed market data; CRM prices are advisory references, not purchasing authorization.',
        stock: 'No formal minimum or maximum stock levels are established yet. Track usage over time and use provisional targets only as planning aids, with Ranked War and chain levels agreed with leadership.',
        loans: 'Members may borrow armor and temporary weapons for chains, Ranked Wars, and training. There is no fixed loan duration; prompt return is expected. Follow up on extended holdings, then flag lost or long-outstanding items to leadership. Leadership handles enforcement and borrowing privileges.',
        highValue: 'High-value Ranked War equipment remains in the vault and is distributed by leadership immediately before war.',
        purchasing: 'Purchases use pre-approved faction funds or reimbursement. Travel sourcing requires leadership authorization and available faction finances.'
    });
    const SYNC_KEY = 'mm_bazaar_crm_logstate_v1';
    const PROCESSED_KEY = 'mm_bazaar_crm_processed_v1';
    const UI_KEY = 'mm_bazaar_crm_ui_v1';
    const UI_MODE_KEY = 'mm_bazaar_crm_ui_mode_v1';
    const ROOT_ID = 'mm-bazaar-crm';
    const LAUNCHER_ID = 'mm-bazaar-crm-launcher';

    let simpleMode = GM_getValue(UI_MODE_KEY, 'simple') !== 'advanced';
    let activeTab = simpleMode ? 'home' : 'ops';
    const customerFilters = { message: 'all', contacted: 'all', restock: 'all', cashback: 'all' };
    let statusText = 'Ready.';
    let syncRunning = false;
    let procurementRunning = false;
    let unifiedSyncRunning = false;
    let factionInventoryRunning = false;
    let fatal = false;
    let lastHref = location.href;
    let routeTimer = null;
    let dbCache = null;
    let idbHandle = null;
    let dbWriteChain = Promise.resolve();
    let githubSyncRunning = false;
    let githubSyncTimer = null;
    const tabInstanceId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let dbChannel = null;
    let dbChannelRefreshTimer = null;

    // ============================================================
    // BASIC HELPERS
    // ============================================================

    const nowIso = () => new Date().toISOString();
    const asId = value => String(value ?? '').trim();
    const money = value => '$' + Math.max(0, Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const fmtDate = value => {
        if (!value) return '—';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
    };
    const escapeHtml = value => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    const makeId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const makeCouponCode = playerId => `SAVE-${asId(playerId)}`;

    function navigateFromCRM(url) {
        const target = String(url || '').trim();
        if (!target) return;
        try { minimizeCRM(); } catch {}
        statusText = 'Opening…';
        // Same-tab navigation keeps Torn workflows predictable and prevents popup/tab sprawl.
        setTimeout(() => { location.href = target; }, 20);
    }

    function beginTravelCapture() {
        try {
            GM_setValue(TRAVEL_RETURN_KEY, { url: location.href, at: Date.now() });
        } catch {}
        statusText = 'Opening TornW3B Travel Stock for live capture…';
        navigateFromCRM('https://weav3r.dev/travel-stock');
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function defaultDb() {
        return {
            schema: 11,
            customers: {},
            sales: {},
            coupons: {},
            refunds: {},
            subscribers: {},
            removedCustomers: {},
            notificationHistory: [],
            businessRules: {
                minRoiPct: 3,
                minDemandPerDay: 0.15,
                minPrice: 1000,
                maxPrice: 1000000000,
                minAbsoluteProfit: 5000,
                minSellerCount: 2,
                maxListingAgeSec: 180,
                marketRefreshLimit: 30,
                updatedAt: null
            },
            syncState: {
                lastUnifiedSyncAt: null,
                lastUnifiedSyncError: null,
                backgroundRefreshEnabled: false
            },
            procurement: {
                catalog: {},
                bazaar: {},
                itemMarket: {},
                inventory: {},
                marketSnapshots: {},
                marketHistory: {},
                acquisitions: [],
                acquisitionProcessed: {},
                watchlist: {},
                travelLedger: [],
                settings: {
                    targetDays: 5,
                    safetyDays: 2,
                    minMarginPct: 4,
                    marketRefreshLimit: 30,
                    procurementBudget: 0,
                    acquisitionLookbackDays: PROCUREMENT_FIRST_ACQUISITION_LOOKBACK_DAYS
                },
                lastSyncAt: null,
                lastCatalogAt: null,
                lastBazaarAt: null,
                lastItemMarketAt: null,
                lastInventoryAt: null,
                lastAcquisitionSyncAt: null,
                lastAcquisitionRebuildAt: null,
                diagnostics: []
            },
            operations: {
                inventorySnapshots: [],
                bazaarPriceHistory: {},
                restockSessions: [],
                activeRestockSessionId: null,
                listingPlans: {},
                events: [],
                notificationState: {},
                settings: {
                    listingHours: DEFAULT_LISTING_HOURS,
                    defaultLeadHours: 6,
                    deadStockDays: DEAD_STOCK_DAYS,
                    overstockMultiplier: 1.5,
                    stockoutPenaltyWeight: 1,
                    enableBrowserNotifications: false
                },
                lastSnapshotAt: null,
                diagnostics: []
            },
            marketIntel: {
                marketplace: {},
                marketplaceGeneratedAt: null,
                details: {},
                traders: {},
                dollarItems: [],
                dollarBazaars: [],
                ranked: [],
                auctions: [],
                suppliers: {},
                history: {},
                settings: {
                    minRoiPct: 3,
                    minAbsoluteProfit: 5000,
                    minMarketPrice: 1000,
                    maxCandidatePrice: 1000000000,
                    minBazaarSellers: 2,
                    maxEnrich: WEAV3R_MAX_ENRICH,
                    freshnessWarnSeconds: 180,
                    bazaarExitHaircutPct: 1
                },
                lastGlobalSyncAt: null,
                lastDollarSyncAt: null,
                lastRankedSyncAt: null,
                diagnostics: []
            },
            travelIntel: {
                rows: [],
                history: {},
                forecastLedger: [],
                lastSyncAt: null,
                lastYataSyncAt: null,
                lastYataObservationAt: null,
                yataCountryUpdates: {},
                source: 'TornW3B Travel Stock + YATA shared stock history',
                settings: { method: 'standard', carry: 21, cash: 0, historyDays: 7 },
                diagnostics: []
            },
            factionInventory: {
                current: {},
                snapshots: [],
                events: [],
                thresholds: {},
                inventoryTimestamp: null,
                lastSyncAt: null,
                nextUsefulRefreshAt: null,
                diagnostics: [],
                settings: {
                    autoSync: true,
                    selectedCategory: 'all',
                    criticalRatio: 0.5,
                    updatedAt: null
                }
            },
            meta: { createdAt: nowIso(), migratedAt: null }
        };
    }


    function getContactLedger() {
        const raw = GM_getValue(CONTACT_LEDGER_KEY, {});
        return raw && typeof raw === 'object' ? raw : {};
    }

    function saveContactLedger(ledger) {
        GM_setValue(CONTACT_LEDGER_KEY, ledger && typeof ledger === 'object' ? ledger : {});
    }

    function rememberContactState(customer) {
        if (!customer?.id || !customerHasBeenContacted(customer)) return;
        const id = asId(customer.id);
        const ledger = getContactLedger();
        const previous = ledger[id] || {};
        ledger[id] = {
            contacted: true,
            firstMessageSent: true,
            messageCount: Math.max(1, Number(previous.messageCount || 0), Number(customer.messageCount || 0)),
            lastContacted: customer.lastContacted || previous.lastContacted || null
        };
        saveContactLedger(ledger);
    }

    function mergeDurableContactState(db) {
        const ledger = getContactLedger();

        for (const [id, customer] of Object.entries(db.customers || {})) {
            const coupon = db.coupons?.[id];
            const durable = ledger[id];

            const wasHistoricallyContacted =
                Boolean(durable?.contacted) ||
                Boolean(customer.contacted) ||
                Boolean(customer.firstMessageSent) ||
                Number(customer.messageCount || 0) > 0 ||
                Boolean(coupon?.issuedAt);

            if (!wasHistoricallyContacted) continue;

            customer.contacted = true;
            customer.firstMessageSent = true;
            customer.messageCount = Math.max(1, Number(customer.messageCount || 0), Number(durable?.messageCount || 0));
            customer.lastContacted =
                customer.lastContacted ||
                durable?.lastContacted ||
                coupon?.issuedAt ||
                null;

            const lastA = Date.parse(customer.lastContacted || '') || 0;
            const lastB = Date.parse(durable?.lastContacted || '') || 0;
            if (lastB > lastA) customer.lastContacted = durable.lastContacted;

            rememberContactState(customer);
        }

        return db;
    }

    function normalizeDb(input) {
        const db = input && typeof input === 'object' ? input : defaultDb();
        db.schema = 11;
        db.customers = db.customers && typeof db.customers === 'object' ? db.customers : {};
        db.sales = db.sales && typeof db.sales === 'object' ? db.sales : {};
        db.coupons = db.coupons && typeof db.coupons === 'object' ? db.coupons : {};
        db.refunds = db.refunds && typeof db.refunds === 'object' ? db.refunds : {};
        db.subscribers = db.subscribers && typeof db.subscribers === 'object' ? db.subscribers : {};
        db.removedCustomers = db.removedCustomers && typeof db.removedCustomers === 'object' ? db.removedCustomers : {};
        for (const [id, record] of Object.entries(db.removedCustomers)) {
            if (!record || typeof record !== 'object') {
                delete db.removedCustomers[id];
                continue;
            }
            record.playerId = asId(record.playerId || id);
            record.playerName = String(record.playerName || db.customers?.[id]?.name || id);
            record.removedAt = record.removedAt || null;
            record.reactivatedAt = record.reactivatedAt || null;
            record.reactivatedReason = record.reactivatedReason || null;
        }
        db.notificationHistory = Array.isArray(db.notificationHistory) ? db.notificationHistory : [];

        const legacyProcurementSettings = db.procurement?.settings && typeof db.procurement.settings === 'object'
            ? db.procurement.settings
            : {};
        const legacyMarketSettings = db.marketIntel?.settings && typeof db.marketIntel.settings === 'object'
            ? db.marketIntel.settings
            : {};
        db.businessRules = db.businessRules && typeof db.businessRules === 'object' ? db.businessRules : {};
        db.businessRules.minRoiPct = Math.max(0, Number(db.businessRules.minRoiPct ?? legacyMarketSettings.minRoiPct ?? 3));
        db.businessRules.minDemandPerDay = Math.max(0, Number(db.businessRules.minDemandPerDay ?? 0.15));
        db.businessRules.minPrice = Math.max(0, Number(db.businessRules.minPrice ?? legacyMarketSettings.minMarketPrice ?? 1000));
        db.businessRules.maxPrice = Math.max(
            db.businessRules.minPrice,
            Number(db.businessRules.maxPrice ?? legacyMarketSettings.maxCandidatePrice ?? 1000000000)
        );
        db.businessRules.minAbsoluteProfit = Math.max(0, Number(db.businessRules.minAbsoluteProfit ?? legacyMarketSettings.minAbsoluteProfit ?? 5000));
        db.businessRules.minSellerCount = Math.max(0, Math.round(Number(db.businessRules.minSellerCount ?? legacyMarketSettings.minBazaarSellers ?? 2)));
        db.businessRules.maxListingAgeSec = Math.max(30, Math.round(Number(db.businessRules.maxListingAgeSec ?? legacyMarketSettings.freshnessWarnSeconds ?? 180)));
        db.businessRules.marketRefreshLimit = Math.max(5, Math.min(WEAV3R_MAX_ENRICH, Math.round(Number(
            db.businessRules.marketRefreshLimit ?? legacyProcurementSettings.marketRefreshLimit ?? 30
        ))));
        db.businessRules.updatedAt = db.businessRules.updatedAt || null;

        db.syncState = db.syncState && typeof db.syncState === 'object' ? db.syncState : {};
        db.syncState.lastUnifiedSyncAt = db.syncState.lastUnifiedSyncAt || null;
        db.syncState.lastUnifiedSyncError = db.syncState.lastUnifiedSyncError || null;
        db.syncState.backgroundRefreshEnabled = db.syncState.backgroundRefreshEnabled === true;

        db.procurement = db.procurement && typeof db.procurement === 'object' ? db.procurement : {};
        db.procurement.catalog = db.procurement.catalog && typeof db.procurement.catalog === 'object' ? db.procurement.catalog : {};
        db.procurement.bazaar = db.procurement.bazaar && typeof db.procurement.bazaar === 'object' ? db.procurement.bazaar : {};
        db.procurement.itemMarket = db.procurement.itemMarket && typeof db.procurement.itemMarket === 'object' ? db.procurement.itemMarket : {};
        db.procurement.inventory = db.procurement.inventory && typeof db.procurement.inventory === 'object' ? db.procurement.inventory : {};
        db.procurement.marketSnapshots = db.procurement.marketSnapshots && typeof db.procurement.marketSnapshots === 'object' ? db.procurement.marketSnapshots : {};
        db.procurement.marketHistory = db.procurement.marketHistory && typeof db.procurement.marketHistory === 'object' ? db.procurement.marketHistory : {};
        db.procurement.acquisitions = Array.isArray(db.procurement.acquisitions) ? db.procurement.acquisitions : [];
        db.procurement.acquisitionProcessed = db.procurement.acquisitionProcessed && typeof db.procurement.acquisitionProcessed === 'object' ? db.procurement.acquisitionProcessed : {};
        db.procurement.watchlist = db.procurement.watchlist && typeof db.procurement.watchlist === 'object' ? db.procurement.watchlist : {};
        db.procurement.travelLedger = Array.isArray(db.procurement.travelLedger) ? db.procurement.travelLedger : [];
        db.procurement.settings = db.procurement.settings && typeof db.procurement.settings === 'object' ? db.procurement.settings : {};
        db.procurement.settings.targetDays = Number(db.procurement.settings.targetDays || 5);
        db.procurement.settings.safetyDays = Number(db.procurement.settings.safetyDays || 2);
        db.procurement.settings.minMarginPct = Number(db.procurement.settings.minMarginPct || 4);
        db.procurement.settings.marketRefreshLimit = db.businessRules.marketRefreshLimit;
        db.procurement.settings.procurementBudget = Number(db.procurement.settings.procurementBudget || 0);
        db.procurement.settings.acquisitionLookbackDays = Number(db.procurement.settings.acquisitionLookbackDays || PROCUREMENT_FIRST_ACQUISITION_LOOKBACK_DAYS);
        db.procurement.diagnostics = Array.isArray(db.procurement.diagnostics) ? db.procurement.diagnostics : [];
        db.operations = db.operations && typeof db.operations === 'object' ? db.operations : {};
        db.operations.inventorySnapshots = Array.isArray(db.operations.inventorySnapshots) ? db.operations.inventorySnapshots : [];
        db.operations.bazaarPriceHistory = db.operations.bazaarPriceHistory && typeof db.operations.bazaarPriceHistory === 'object' ? db.operations.bazaarPriceHistory : {};
        db.operations.restockSessions = Array.isArray(db.operations.restockSessions) ? db.operations.restockSessions : [];
        db.operations.activeRestockSessionId = db.operations.activeRestockSessionId || null;
        db.operations.listingPlans = db.operations.listingPlans && typeof db.operations.listingPlans === 'object' ? db.operations.listingPlans : {};
        db.operations.events = Array.isArray(db.operations.events) ? db.operations.events : [];
        db.operations.notificationState = db.operations.notificationState && typeof db.operations.notificationState === 'object' ? db.operations.notificationState : {};
        db.operations.settings = db.operations.settings && typeof db.operations.settings === 'object' ? db.operations.settings : {};
        db.operations.settings.listingHours = Number(db.operations.settings.listingHours ?? DEFAULT_LISTING_HOURS);
        db.operations.settings.defaultLeadHours = Number(db.operations.settings.defaultLeadHours ?? 6);
        db.operations.settings.deadStockDays = Number(db.operations.settings.deadStockDays ?? DEAD_STOCK_DAYS);
        db.operations.settings.overstockMultiplier = Number(db.operations.settings.overstockMultiplier ?? 1.5);
        db.operations.settings.stockoutPenaltyWeight = Number(db.operations.settings.stockoutPenaltyWeight ?? 1);
        db.operations.settings.enableBrowserNotifications = Boolean(db.operations.settings.enableBrowserNotifications);
        db.operations.settings.strategyPreset = String(db.operations.settings.strategyPreset || 'BALANCED');
        db.operations.lastSnapshotAt = db.operations.lastSnapshotAt || null;
        db.operations.diagnostics = Array.isArray(db.operations.diagnostics) ? db.operations.diagnostics : [];
        db.marketIntel = db.marketIntel && typeof db.marketIntel === 'object' ? db.marketIntel : {};
        db.marketIntel.marketplace = db.marketIntel.marketplace && typeof db.marketIntel.marketplace === 'object' ? db.marketIntel.marketplace : {};
        db.marketIntel.marketplaceGeneratedAt = db.marketIntel.marketplaceGeneratedAt || null;
        db.marketIntel.details = db.marketIntel.details && typeof db.marketIntel.details === 'object' ? db.marketIntel.details : {};
        db.marketIntel.traders = db.marketIntel.traders && typeof db.marketIntel.traders === 'object' ? db.marketIntel.traders : {};
        db.marketIntel.dollarItems = Array.isArray(db.marketIntel.dollarItems) ? db.marketIntel.dollarItems : [];
        db.marketIntel.dollarBazaars = Array.isArray(db.marketIntel.dollarBazaars) ? db.marketIntel.dollarBazaars : [];
        db.marketIntel.ranked = Array.isArray(db.marketIntel.ranked) ? db.marketIntel.ranked : [];
        db.marketIntel.auctions = Array.isArray(db.marketIntel.auctions) ? db.marketIntel.auctions : [];
        db.marketIntel.suppliers = db.marketIntel.suppliers && typeof db.marketIntel.suppliers === 'object' ? db.marketIntel.suppliers : {};
        db.marketIntel.history = db.marketIntel.history && typeof db.marketIntel.history === 'object' ? db.marketIntel.history : {};
        db.marketIntel.settings = db.marketIntel.settings && typeof db.marketIntel.settings === 'object' ? db.marketIntel.settings : {};
        db.marketIntel.settings.minRoiPct = db.businessRules.minRoiPct;
        db.marketIntel.settings.minAbsoluteProfit = db.businessRules.minAbsoluteProfit;
        db.marketIntel.settings.minMarketPrice = db.businessRules.minPrice;
        db.marketIntel.settings.maxCandidatePrice = db.businessRules.maxPrice;
        db.marketIntel.settings.minBazaarSellers = db.businessRules.minSellerCount;
        db.marketIntel.settings.maxEnrich = Math.max(
            1,
            Math.min(WEAV3R_MAX_ENRICH, Number(db.businessRules.marketRefreshLimit || WEAV3R_MAX_ENRICH))
        );
        db.marketIntel.settings.freshnessWarnSeconds = db.businessRules.maxListingAgeSec;
        db.marketIntel.settings.bazaarExitHaircutPct = Number(db.marketIntel.settings.bazaarExitHaircutPct ?? 1);
        db.marketIntel.diagnostics = Array.isArray(db.marketIntel.diagnostics) ? db.marketIntel.diagnostics : [];
        db.travelIntel = db.travelIntel && typeof db.travelIntel === 'object' ? db.travelIntel : {};
        db.travelIntel.rows = Array.isArray(db.travelIntel.rows) ? db.travelIntel.rows : [];
        db.travelIntel.history = db.travelIntel.history && typeof db.travelIntel.history === 'object' ? db.travelIntel.history : {};
        db.travelIntel.forecastLedger = normalizeTravelForecastLedger(db.travelIntel.forecastLedger);
        db.travelIntel.lastSyncAt = db.travelIntel.lastSyncAt || null;
        db.travelIntel.lastYataSyncAt = db.travelIntel.lastYataSyncAt || null;
        db.travelIntel.lastYataObservationAt = db.travelIntel.lastYataObservationAt || null;
        db.travelIntel.yataCountryUpdates = db.travelIntel.yataCountryUpdates && typeof db.travelIntel.yataCountryUpdates === 'object' ? db.travelIntel.yataCountryUpdates : {};
        db.travelIntel.source = String(db.travelIntel.source || 'TornW3B Travel Stock + YATA shared stock history');
        db.travelIntel.settings = db.travelIntel.settings && typeof db.travelIntel.settings === 'object' ? db.travelIntel.settings : {};
        db.travelIntel.settings.method = ['standard','airstrip','wlt','business'].includes(String(db.travelIntel.settings.method || '').toLowerCase()) ? String(db.travelIntel.settings.method).toLowerCase() : 'standard';
        db.travelIntel.settings.carry = Math.max(1, Number(db.travelIntel.settings.carry || 21));
        db.travelIntel.settings.cash = Math.max(0, Number(db.travelIntel.settings.cash || 0));
        db.travelIntel.settings.targetTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(db.travelIntel.settings.targetTime || '')) ? String(db.travelIntel.settings.targetTime) : '';
        db.travelIntel.settings.selectedCountry = String(db.travelIntel.settings.selectedCountry || '');
        db.travelIntel.settings.selectedItemKey = String(db.travelIntel.settings.selectedItemKey || '');
        db.travelIntel.settings.showLocalTime = db.travelIntel.settings.showLocalTime !== false;
        db.travelIntel.settings.historyDays = Math.max(1, Math.min(30, Number(db.travelIntel.settings.historyDays || 7)));
        db.travelIntel.diagnostics = Array.isArray(db.travelIntel.diagnostics) ? db.travelIntel.diagnostics : [];
        db.factionInventory = db.factionInventory && typeof db.factionInventory === 'object' ? db.factionInventory : {};
        db.factionInventory.current = db.factionInventory.current && typeof db.factionInventory.current === 'object' ? db.factionInventory.current : {};
        db.factionInventory.snapshots = Array.isArray(db.factionInventory.snapshots) ? db.factionInventory.snapshots.slice(-FACTION_INVENTORY_SNAPSHOT_MAX) : [];
        db.factionInventory.events = Array.isArray(db.factionInventory.events) ? db.factionInventory.events.slice(-FACTION_INVENTORY_EVENT_MAX) : [];
        db.factionInventory.thresholds = db.factionInventory.thresholds && typeof db.factionInventory.thresholds === 'object' ? db.factionInventory.thresholds : {};
        for (const [itemId, threshold] of Object.entries(db.factionInventory.thresholds)) {
            if (!threshold || typeof threshold !== 'object') {
                db.factionInventory.thresholds[itemId] = { target: Math.max(0, Number(threshold || 0)), basis: 'auto', updatedAt: null };
                continue;
            }
            threshold.target = Math.max(0, Math.round(Number(threshold.target || 0)));
            threshold.basis = ['auto','owned','available'].includes(String(threshold.basis || 'auto')) ? String(threshold.basis || 'auto') : 'auto';
            threshold.updatedAt = threshold.updatedAt || null;
        }
        db.factionInventory.inventoryTimestamp = db.factionInventory.inventoryTimestamp || null;
        db.factionInventory.lastSyncAt = db.factionInventory.lastSyncAt || null;
        db.factionInventory.nextUsefulRefreshAt = db.factionInventory.nextUsefulRefreshAt || null;
        db.factionInventory.diagnostics = Array.isArray(db.factionInventory.diagnostics) ? db.factionInventory.diagnostics.slice(0,40) : [];
        db.factionInventory.settings = db.factionInventory.settings && typeof db.factionInventory.settings === 'object' ? db.factionInventory.settings : {};
        db.factionInventory.settings.autoSync = db.factionInventory.settings.autoSync !== false;
        db.factionInventory.settings.selectedCategory = ['all',...FACTION_INVENTORY_CATEGORIES].includes(String(db.factionInventory.settings.selectedCategory || 'all')) ? String(db.factionInventory.settings.selectedCategory || 'all') : 'all';
        db.factionInventory.settings.criticalRatio = Math.max(0.1, Math.min(0.95, Number(db.factionInventory.settings.criticalRatio || 0.5)));
        db.factionInventory.settings.updatedAt = db.factionInventory.settings.updatedAt || null;
        db.meta = db.meta && typeof db.meta === 'object' ? db.meta : {};
        db.meta.salesRebuiltAt = db.meta.salesRebuiltAt || null;
        db.meta.lastSalesAudit = db.meta.lastSalesAudit || null;
        db.meta.acquisitionCoverageVersion = db.meta.acquisitionCoverageVersion || null;
        db.meta.acquisitionCoverageBackfilledAt = db.meta.acquisitionCoverageBackfilledAt || null;
        db.meta.acquisitionCoverageBackfillAdded = Number(db.meta.acquisitionCoverageBackfillAdded || 0);

        for (const [id, sub] of Object.entries(db.subscribers)) {
            sub.id = asId(sub.id || id);
            sub.name = String(sub.name || db.customers[sub.id]?.name || sub.id);
            sub.interests = Array.isArray(sub.interests) ? sub.interests.map(String).filter(Boolean) : [];
        }

        for (const [id, customer] of Object.entries(db.customers)) {
            customer.id = asId(customer.id || id);
            customer.name = String(customer.name || customer.id);
            customer.purchases = Number(customer.purchases || 0);
            customer.units = Number(customer.units || 0);
            customer.spent = Number(customer.spent || customer.totalSpent || 0);
            customer.firstPurchase = customer.firstPurchase || customer.firstPurchaseAt || null;
            customer.lastPurchase = customer.lastPurchase || customer.lastPurchaseAt || null;
            customer.contacted = Boolean(customer.contacted || customer.firstMessageSent || Number(customer.messageCount || 0) > 0);
            customer.firstMessageSent = Boolean(customer.firstMessageSent || customer.contacted);
            customer.messageCount = Number(customer.messageCount || 0);
            customer.lastContacted = customer.lastContacted || null;
            customer.createdAt = customer.createdAt || nowIso();
            customer.manual = Boolean(customer.manual);
        }

        for (const [id, coupon] of Object.entries(db.coupons)) {
            coupon.playerId = asId(coupon.playerId || id);
            coupon.playerName = String(coupon.playerName || db.customers[id]?.name || id);
            coupon.code = String(coupon.code || makeCouponCode(id));
            coupon.maxUses = Number(coupon.maxUses || COUPON_MAX_USES);
            coupon.uses = Number(coupon.uses || coupon.used || 0);
            coupon.redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
            coupon.pendingRefundId = coupon.pendingRefundId || null;
            coupon.createdAt = coupon.createdAt || nowIso();
            // Legacy coupons become active only after a welcome/contact exists. This prevents old sales from silently becoming "next purchase" sales.
            coupon.issuedAt = coupon.issuedAt || (db.customers[id]?.firstMessageSent ? db.customers[id]?.lastContacted || coupon.createdAt : null);
        }

        mergeDurableContactState(db);

        db.meta = db.meta && typeof db.meta === 'object' ? db.meta : {};
        db.meta.storage = db.meta.storage && typeof db.meta.storage === 'object' ? db.meta.storage : {};
        db.meta.github = db.meta.github && typeof db.meta.github === 'object' ? db.meta.github : {};
        return db;
    }

    function deepClone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function openIndexedDb() {
        if (idbHandle) return Promise.resolve(idbHandle);
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(IDB_STATE_STORE)) db.createObjectStore(IDB_STATE_STORE);
            };
            request.onsuccess = () => {
                idbHandle = request.result;
                idbHandle.onversionchange = () => {
                    try { idbHandle.close(); } catch {}
                    idbHandle = null;
                };
                resolve(idbHandle);
            };
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
        });
    }

    async function idbGet(key) {
        const db = await openIndexedDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STATE_STORE, 'readonly');
            const req = tx.objectStore(IDB_STATE_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB read failed.'));
        });
    }

    async function idbPut(key, value) {
        const db = await openIndexedDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STATE_STORE, 'readwrite');
            tx.objectStore(IDB_STATE_STORE).put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed.'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
        });
    }

    function installDbCrossTabSync() {
        if (dbChannel || typeof BroadcastChannel === 'undefined') return;
        try {
            dbChannel = new BroadcastChannel(DB_CHANNEL_NAME);
            dbChannel.addEventListener('message', event => {
                if (!event?.data || event.data.source === tabInstanceId) return;
                if (dbChannelRefreshTimer) clearTimeout(dbChannelRefreshTimer);
                dbChannelRefreshTimer = setTimeout(async () => {
                    try {
                        const latest = await idbGet(IDB_MAIN_KEY);
                        if (latest && typeof latest === 'object') {
                            dbCache = normalizeDb(latest);
                            // Do not tear down/rebuild a minimized panel in background tabs.
                            // It will render from fresh dbCache when reopened.
                            if (document.visibilityState === 'visible' && !getUI().minimized) render();
                        }
                    } catch (error) {
                        console.warn('[MM CRM] Cross-tab refresh failed', error);
                    }
                }, 750);
            });
        } catch (error) {
            console.warn('[MM CRM] BroadcastChannel unavailable', error);
        }
    }

    async function initializeStorage() {
        let stored = null;
        try { stored = await idbGet(IDB_MAIN_KEY); }
        catch (error) { console.error('[MM CRM] IndexedDB read failed', error); }

        if (stored && typeof stored === 'object') {
            dbCache = normalizeDb(stored);
            return { source: 'indexeddb', migrated: false };
        }

        const legacy = readJson(DB_KEY, null);
        if (legacy && typeof legacy === 'object') {
            dbCache = normalizeDb(legacy);
            dbCache.meta.storage = {
                backend: 'IndexedDB',
                migratedAt: nowIso(),
                migratedFrom: 'localStorage',
                lastSavedAt: nowIso()
            };
            await idbPut(IDB_MAIN_KEY, dbCache);
            try { localStorage.removeItem(DB_KEY); } catch {}
            return { source: 'localStorage', migrated: true };
        }

        dbCache = normalizeDb(defaultDb());
        dbCache.meta.storage = {
            backend: 'IndexedDB',
            migratedAt: nowIso(),
            migratedFrom: null,
            lastSavedAt: nowIso()
        };
        await idbPut(IDB_MAIN_KEY, dbCache);
        return { source: 'new', migrated: false };
    }

    function dbLoad() {
        return normalizeDb(deepClone(dbCache || defaultDb()));
    }


    function mergeCriticalPersistenceState(latest, incoming) {
        if (!latest || typeof latest !== 'object') return normalizeDb(incoming);
        const merged = normalizeDb(deepClone(incoming));

        const incomingSaleIds = new Set(Object.keys(merged.sales || {}));
        const latestSales = latest.sales || {};
        let latestOnlySaleFound = false;
        for (const id of Object.keys(latestSales)) {
            if (!incomingSaleIds.has(id)) {
                latestOnlySaleFound = true;
                break;
            }
        }

        // Sales are append-only. Preserve records committed by another Torn tab,
        // but keep the incoming customer's sale-derived totals authoritative.
        merged.sales = {
            ...latestSales,
            ...(merged.sales || {})
        };

        const latestCustomers = latest.customers || {};
        merged.customers = merged.customers || {};
        for (const [id, oldCustomer] of Object.entries(latestCustomers)) {
            const current = merged.customers[id];
            if (!current) {
                merged.customers[id] = deepClone(oldCustomer);
                continue;
            }

            // Relationship/contact state is monotonic and safe to merge.
            const oldLast = Date.parse(oldCustomer.lastContacted || '') || 0;
            const newLast = Date.parse(current.lastContacted || '') || 0;
            current.contacted = Boolean(current.contacted || oldCustomer.contacted);
            current.firstMessageSent = Boolean(current.firstMessageSent || oldCustomer.firstMessageSent);
            current.messageCount = Math.max(Number(current.messageCount || 0), Number(oldCustomer.messageCount || 0));
            if (oldLast > newLast) current.lastContacted = oldCustomer.lastContacted;

            // Preserve a resolved username from either tab.
            if ((!current.name || /^\d+$/.test(String(current.name))) &&
                oldCustomer.name && !/^\d+$/.test(String(oldCustomer.name))) {
                current.name = oldCustomer.name;
            }

            // Do NOT max purchases/units/spend here. Those values must exactly
            // match the append-only sales ledger or the integrity audit will fail.
        }

        // Cashback/refund state is monotonic. A stale Torn tab must never undo a
        // completed refund or remove a recorded redemption.
        const latestRefunds = latest.refunds || {};
        const incomingRefunds = merged.refunds || {};
        const refundIds = new Set([...Object.keys(latestRefunds), ...Object.keys(incomingRefunds)]);
        merged.refunds = {};
        const refundRank = status => status === 'completed' ? 3 : status === 'cancelled' ? 2 : status === 'pending' ? 1 : 0;
        for (const id of refundIds) {
            const oldR = latestRefunds[id];
            const newR = incomingRefunds[id];
            if (!oldR) { merged.refunds[id] = deepClone(newR); continue; }
            if (!newR) { merged.refunds[id] = deepClone(oldR); continue; }
            const oldRank = refundRank(oldR.status);
            const newRank = refundRank(newR.status);
            let chosen = newRank >= oldRank ? deepClone(newR) : deepClone(oldR);
            if (oldRank === newRank) {
                const oldChanged = Date.parse(oldR.completedAt || oldR.cancelledAt || oldR.createdAt || '') || 0;
                const newChanged = Date.parse(newR.completedAt || newR.cancelledAt || newR.createdAt || '') || 0;
                chosen = newChanged >= oldChanged ? deepClone(newR) : deepClone(oldR);
            }
            merged.refunds[id] = chosen;
        }

        const latestCoupons = latest.coupons || {};
        const incomingCoupons = merged.coupons || {};
        const couponIds = new Set([...Object.keys(latestCoupons), ...Object.keys(incomingCoupons)]);
        merged.coupons = {};
        for (const id of couponIds) {
            const oldC = latestCoupons[id];
            const newC = incomingCoupons[id];
            if (!oldC) { merged.coupons[id] = deepClone(newC); continue; }
            if (!newC) { merged.coupons[id] = deepClone(oldC); continue; }

            const coupon = { ...deepClone(oldC), ...deepClone(newC) };
            const redemptionMap = new Map();
            for (const r of [...(oldC.redemptions || []), ...(newC.redemptions || [])]) {
                const key = String(r?.refundId || '') || JSON.stringify(r);
                const prior = redemptionMap.get(key);
                if (!prior || (Date.parse(r?.completedAt || '') || 0) >= (Date.parse(prior?.completedAt || '') || 0)) {
                    redemptionMap.set(key, deepClone(r));
                }
            }
            coupon.redemptions = [...redemptionMap.values()];
            coupon.uses = Math.max(
                Number(oldC.uses || 0),
                Number(newC.uses || 0),
                coupon.redemptions.length
            );

            const pendingCandidates = [newC.pendingRefundId, oldC.pendingRefundId].map(asId).filter(Boolean);
            coupon.pendingRefundId = pendingCandidates.find(refundId => merged.refunds[refundId]?.status === 'pending') || null;
            merged.coupons[id] = coupon;
        }
        merged.subscribers = { ...(latest.subscribers || {}), ...(merged.subscribers || {}) };
        merged.removedCustomers = mergeRemovedCustomerStates(
            latest.removedCustomers,
            merged.removedCustomers
        );

        // Preserve fresher Travel Command data/history/evaluation state committed by another Torn tab.
        const latestTravel = latest.travelIntel;
        if (latestTravel && typeof latestTravel === 'object') {
            const oldTravelAt = Date.parse(latestTravel.lastSyncAt || '') || 0;
            const newTravelAt = Date.parse(merged.travelIntel?.lastSyncAt || '') || 0;
            if (oldTravelAt > newTravelAt) {
                merged.travelIntel.rows = deepClone(latestTravel.rows || []);
                merged.travelIntel.lastSyncAt = latestTravel.lastSyncAt;
                merged.travelIntel.source = latestTravel.source || merged.travelIntel.source;
            }

            const oldYataSyncAt = Date.parse(latestTravel.lastYataSyncAt || '') || 0;
            const newYataSyncAt = Date.parse(merged.travelIntel?.lastYataSyncAt || '') || 0;
            if (oldYataSyncAt > newYataSyncAt) merged.travelIntel.lastYataSyncAt = latestTravel.lastYataSyncAt;

            const oldYataObservationAt = Date.parse(latestTravel.lastYataObservationAt || '') || 0;
            const newYataObservationAt = Date.parse(merged.travelIntel?.lastYataObservationAt || '') || 0;
            if (oldYataObservationAt > newYataObservationAt) merged.travelIntel.lastYataObservationAt = latestTravel.lastYataObservationAt;

            merged.travelIntel.yataCountryUpdates = merged.travelIntel.yataCountryUpdates || {};
            for (const [code, value] of Object.entries(latestTravel.yataCountryUpdates || {})) {
                merged.travelIntel.yataCountryUpdates[code] = Math.max(
                    Number(merged.travelIntel.yataCountryUpdates[code] || 0),
                    Number(value || 0)
                );
            }

            for (const [key, oldList] of Object.entries(latestTravel.history || {})) {
                if (!Array.isArray(oldList) || !oldList.length) continue;
                const currentList = Array.isArray(merged.travelIntel.history[key]) ? merged.travelIntel.history[key] : [];
                const bySignature = new Map();
                for (const point of [...currentList, ...oldList]) {
                    const signature = [
                        Number(point?.at || 0),
                        Number(point?.stock || 0),
                        String(point?.source || '')
                    ].join('|');
                    bySignature.set(signature, deepClone(point));
                }
                merged.travelIntel.history[key] = [...bySignature.values()]
                    .sort((a,b) => Number(a.at||0) - Number(b.at||0))
                    .slice(-800);
            }

            merged.travelIntel.forecastLedger = mergeTravelForecastLedgers(
                latestTravel.forecastLedger,
                merged.travelIntel.forecastLedger
            );
        }

        // CRM-wide business rules are user-authored configuration. Preserve the
        // most recently edited rules when stale Torn tabs save in parallel.
        const latestRulesAt = Date.parse(latest.businessRules?.updatedAt || '') || 0;
        const incomingRulesAt = Date.parse(merged.businessRules?.updatedAt || '') || 0;
        if (latestRulesAt > incomingRulesAt) {
            merged.businessRules = deepClone(latest.businessRules || merged.businessRules);
        }

        // Unified refresh metadata is operational state. Keep the newest completed
        // refresh rather than allowing a stale tab to move it backward.
        const latestUnifiedAt = Date.parse(latest.syncState?.lastUnifiedSyncAt || '') || 0;
        const incomingUnifiedAt = Date.parse(merged.syncState?.lastUnifiedSyncAt || '') || 0;
        if (latestUnifiedAt > incomingUnifiedAt) {
            merged.syncState = deepClone(latest.syncState || merged.syncState);
        }


        merged.factionInventory = mergeFactionInventoryStates(
            latest.factionInventory,
            merged.factionInventory
        );

        // Sale-derived totals are not authoritative state. Audit every persisted merge
        // and rebuild only if drift is detected (including stale cross-tab snapshots).
        reconcileSalesIntegrity(merged);

        mergeDurableContactState(merged);
        return normalizeDb(merged);
    }

    function dbSave(db) {
        const normalized = normalizeDb(db);
        mergeDurableContactState(normalized);
        normalized.meta.storage = normalized.meta.storage || {};
        normalized.meta.storage.backend = 'IndexedDB';
        normalized.meta.storage.lastSavedAt = nowIso();
        dbCache = deepClone(normalized);

        const snapshot = deepClone(dbCache);
        dbWriteChain = dbWriteChain
            .then(async () => {
                let latest = null;
                try { latest = await idbGet(IDB_MAIN_KEY); } catch {}
                const merged = mergeCriticalPersistenceState(latest, snapshot);
                dbCache = deepClone(merged);
                await idbPut(IDB_MAIN_KEY, merged);
                try { dbChannel?.postMessage({ source: tabInstanceId, at: Date.now() }); } catch {}
            })
            .catch(error => {
                console.error('[MM CRM] IndexedDB save failed', error);
                statusText = `Local database save failed: ${error?.message || String(error)}`;
                try { render(); } catch {}
            });
    }

    async function flushDbWrites() {
        await dbWriteChain;
    }

    function getUI() {
        const ui = readJson(UI_KEY, {});
        return {
            minimized: ui.minimized !== false,
            left: Number.isFinite(Number(ui.left)) ? Number(ui.left) : null,
            top: Number.isFinite(Number(ui.top)) ? Number(ui.top) : 82
        };
    }

    function saveUI(patch) {
        writeJson(UI_KEY, { ...getUI(), ...patch });
    }

    // ============================================================
    // API KEY STORAGE / MIGRATION
    // ============================================================

    function migrateApiKey() {
        let key = String(GM_getValue(API_KEY, '') || '').trim();
        if (key) return key;
        const legacy = String(localStorage.getItem(OLD_API_KEY) || '').trim();
        if (legacy) {
            GM_setValue(API_KEY, legacy);
            localStorage.removeItem(OLD_API_KEY);
            key = legacy;
        }
        return key;
    }

    function getApiKey() {
        return String(GM_getValue(API_KEY, '') || '').trim();
    }

    function getFactionApiKey() {
        return String(GM_getValue(FACTION_API_KEY, '') || '').trim();
    }

    function factionInventoryApiKey() {
        return getFactionApiKey() || getApiKey();
    }

    function setFactionApiKey(value) {
        const key = String(value || '').trim();
        if (key) GM_setValue(FACTION_API_KEY, key);
        else GM_deleteValue(FACTION_API_KEY);
    }

    function setApiKey(value) {
        const key = String(value || '').trim();
        if (key) GM_setValue(API_KEY, key);
        else GM_deleteValue(API_KEY);
        fatal = false;
    }

    // ============================================================
    // TORN API
    // ============================================================

    function apiRequest(pathOrUrl, keyOverride = '') {
        return new Promise((resolve, reject) => {
            const key = String(keyOverride || getApiKey()).trim();
            if (!key) {
                reject(new Error('No Torn API key saved.'));
                return;
            }

            const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : API_BASE + pathOrUrl);
            url.searchParams.set('key', key);
            url.searchParams.set('comment', 'MM Bazaar CRM');

            GM_xmlhttpRequest({
                method: 'GET',
                url: url.toString(),
                timeout: 20_000,
                headers: { Accept: 'application/json' },
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`HTTP ${response.status} from Torn API.`));
                        return;
                    }
                    let data;
                    try {
                        data = JSON.parse(response.responseText);
                    } catch {
                        reject(new Error('Torn API returned invalid JSON.'));
                        return;
                    }
                    if (data?.error) {
                        const code = Number(data.error.code || 0);
                        const message = data.error.error || data.error.message || 'Unknown Torn API error';
                        const error = new Error(`Torn API ${code}: ${message}`);
                        error.code = code;
                        reject(error);
                        return;
                    }
                    resolve(data);
                },
                ontimeout: () => reject(new Error('Torn API request timed out.')),
                onerror: () => reject(new Error('Torn API network request failed.'))
            });
        });
    }

    function extractUsernameFromApiPayload(data, playerId) {
        const id = asId(playerId);
        const candidates = [
            data?.profile?.name,
            data?.user?.name,
            data?.name,
            data?.player_name,
            data?.username
        ];
        for (const candidate of candidates) {
            const name = String(candidate || '').trim();
            if (name && name !== id && !/^\d+$/.test(name)) return name;
        }
        return '';
    }

    function apiRequestV1UserIdSelection(playerId, selection) {
        return new Promise((resolve, reject) => {
            const key = getApiKey();
            const id = asId(playerId);
            const selected = String(selection || '').trim();
            if (!key) return reject(new Error('No Torn API key saved.'));
            if (!id) return reject(new Error('Invalid Torn player ID.'));
            if (!selected) return reject(new Error('Torn API v1 selection is required.'));

            const url = new URL(`https://api.torn.com/user/${encodeURIComponent(id)}`);
            url.searchParams.set('selections', selected);
            url.searchParams.set('key', key);
            url.searchParams.set('comment', 'MM Bazaar CRM');

            GM_xmlhttpRequest({
                method: 'GET',
                url: url.toString(),
                timeout: 20_000,
                headers: { Accept: 'application/json' },
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        return reject(new Error(`HTTP ${response.status} from Torn API v1.`));
                    }
                    let data;
                    try { data = JSON.parse(response.responseText); }
                    catch { return reject(new Error('Torn API v1 returned invalid JSON.')); }

                    if (data?.error) {
                        const code = Number(data.error.code || 0);
                        const message = data.error.error || data.error.message || 'Unknown Torn API error';
                        const error = new Error(`Torn API ${code}: ${message}`);
                        error.code = code;
                        return reject(error);
                    }
                    resolve(data);
                },
                ontimeout: () => reject(new Error('Torn API v1 request timed out.')),
                onerror: () => reject(new Error('Torn API v1 network request failed.'))
            });
        });
    }

    function publicApiRequestV1(playerId) {
        return apiRequestV1UserIdSelection(playerId, 'basic');
    }

    function apiRequestV1UserSelection(selection) {
        return new Promise((resolve, reject) => {
            const key = getApiKey();
            if (!key) return reject(new Error('No Torn API key saved.'));
            const url = new URL('https://api.torn.com/user/');
            url.searchParams.set('selections', selection);
            url.searchParams.set('key', key);
            url.searchParams.set('comment', 'MM Bazaar CRM');
            GM_xmlhttpRequest({
                method: 'GET',
                url: url.toString(),
                timeout: 20_000,
                headers: { Accept: 'application/json' },
                onload: response => {
                    if (response.status < 200 || response.status >= 300) return reject(new Error(`HTTP ${response.status} from Torn API v1.`));
                    let data;
                    try { data = JSON.parse(response.responseText); }
                    catch { return reject(new Error('Torn API v1 returned invalid JSON.')); }
                    if (data?.error) {
                        const error = new Error(`Torn API ${Number(data.error.code || 0)}: ${data.error.error || data.error.message || 'Unknown error'}`);
                        error.code = Number(data.error.code || 0);
                        return reject(error);
                    }
                    resolve(data);
                },
                ontimeout: () => reject(new Error('Torn API v1 request timed out.')),
                onerror: () => reject(new Error('Torn API v1 network request failed.'))
            });
        });
    }

    async function fetchTornUsername(playerId) {
        const id = asId(playerId);
        if (!/^\d+$/.test(id)) throw new Error(`Invalid Torn player ID: ${id}`);

        let v2Error = null;
        try {
            const data = await apiRequest(`/user/${encodeURIComponent(id)}/basic`);
            const name = extractUsernameFromApiPayload(data, id);
            if (name) return name;
        } catch (error) {
            v2Error = error;
        }

        try {
            const data = await publicApiRequestV1(id);
            const name = extractUsernameFromApiPayload(data, id);
            if (name) return name;
        } catch (v1Error) {
            throw new Error(
                `Username lookup failed for [${id}]. ${v2Error?.message || 'v2 basic returned no usable username'}; ` +
                `v1 basic fallback: ${v1Error?.message || String(v1Error)}. ` +
                `The CRM key must include User → Basic. Automatic Bazaar sync also requires User → Log.`
            );
        }

        throw new Error(`Torn returned no usable username for [${id}]. The CRM key must include User → Basic.`);
    }

    function hasRealUsername(record) {
        if (!record) return false;
        const name = String(record.name || record.playerName || '').trim();
        const id = asId(record.id || record.playerId);
        return Boolean(name && name !== id && !/^\d+$/.test(name));
    }

    function displayUsername(record) {
        return hasRealUsername(record) ? String(record.name || record.playerName).trim() : '';
    }

    function applyUsername(db, playerId, name) {
        const id = asId(playerId);
        if (db.customers[id]) db.customers[id].name = name;
        if (db.coupons[id]) db.coupons[id].playerName = name;
        if (db.subscribers[id]) db.subscribers[id].name = name;
        for (const sale of Object.values(db.sales)) {
            if (asId(sale.playerId) === id) sale.playerName = name;
        }
        for (const refund of Object.values(db.refunds)) {
            if (asId(refund.playerId) === id) refund.playerName = name;
        }
    }

    async function refreshCustomerUsername(playerId, force = false) {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) throw new Error(`Customer [${id}] does not exist in the CRM.`);
        if (!force && hasRealUsername(customer)) return customer.name;
        const name = await fetchTornUsername(id);
        applyUsername(db, id, name);
        dbSave(db);
        return name;
    }

    async function repairUsernames(limit = 8) {
        const db = dbLoad();
        const ids = Object.values(db.customers).filter(c => !hasRealUsername(c)).map(c => c.id).slice(0, limit);
        let repaired = 0;
        for (const id of ids) {
            try {
                await refreshCustomerUsername(id, true);
                repaired++;
            } catch {
                // A failed lookup remains unresolved and can be retried later.
            }
        }
        return repaired;
    }

    // ============================================================
    // CUSTOMER / COUPON MODEL
    // ============================================================

    function ensureCustomer(db, playerId, playerName = '') {
        const id = asId(playerId);
        if (!db.customers[id]) {
            db.customers[id] = {
                id,
                name: playerName || id,
                purchases: 0,
                units: 0,
                spent: 0,
                firstPurchase: null,
                lastPurchase: null,
                contacted: false,
                firstMessageSent: false,
                messageCount: 0,
                lastContacted: null,
                createdAt: nowIso(),
                manual: false
            };
        } else if (playerName && !/^\d+$/.test(playerName)) {
            db.customers[id].name = playerName;
        }
        return db.customers[id];
    }

    function customerRemovalTimes(record) {
        const removedAt = Date.parse(record?.removedAt || '') || 0;
        const reactivatedAt = Date.parse(record?.reactivatedAt || '') || 0;
        return { removedAt, reactivatedAt };
    }

    function isRemovalRecordActive(record) {
        const { removedAt, reactivatedAt } = customerRemovalTimes(record);
        return removedAt > 0 && removedAt > reactivatedAt;
    }

    function isCustomerRemoved(db, playerId) {
        const id = asId(playerId);
        return isRemovalRecordActive(db?.removedCustomers?.[id]);
    }

    function markCustomerReactivated(db, playerId, at = Date.now(), reason = 'reactivated') {
        const id = asId(playerId);
        const prior = db.removedCustomers?.[id];
        if (!prior) return false;

        let ms = Number(at || 0);
        if (!(ms > 0)) ms = Date.now();
        if (ms < 100_000_000_000) ms *= 1000;

        const removedAt = Date.parse(prior.removedAt || '') || 0;
        if (ms <= removedAt) return false;

        prior.reactivatedAt = new Date(ms).toISOString();
        prior.reactivatedReason = String(reason || 'reactivated');
        db.removedCustomers[id] = prior;
        return true;
    }

    function mergeRemovedCustomerStates(latestState, incomingState) {
        const latest = latestState && typeof latestState === 'object' ? latestState : {};
        const incoming = incomingState && typeof incomingState === 'object' ? incomingState : {};
        const ids = new Set([...Object.keys(latest), ...Object.keys(incoming)]);
        const merged = {};

        for (const id of ids) {
            const oldRecord = latest[id];
            const newRecord = incoming[id];
            if (!oldRecord) {
                merged[id] = deepClone(newRecord);
                continue;
            }
            if (!newRecord) {
                merged[id] = deepClone(oldRecord);
                continue;
            }

            const oldTimes = customerRemovalTimes(oldRecord);
            const newTimes = customerRemovalTimes(newRecord);
            const removedAt = Math.max(oldTimes.removedAt, newTimes.removedAt);
            const reactivatedAt = Math.max(oldTimes.reactivatedAt, newTimes.reactivatedAt);
            const newestOld = Math.max(oldTimes.removedAt, oldTimes.reactivatedAt);
            const newestNew = Math.max(newTimes.removedAt, newTimes.reactivatedAt);
            const base = newestNew >= newestOld ? deepClone(newRecord) : deepClone(oldRecord);

            merged[id] = {
                ...base,
                playerId: asId(base.playerId || id),
                playerName: String(
                    newRecord.playerName ||
                    oldRecord.playerName ||
                    base.playerName ||
                    id
                ),
                removedAt: removedAt ? new Date(removedAt).toISOString() : null,
                reactivatedAt: reactivatedAt ? new Date(reactivatedAt).toISOString() : null,
                reactivatedReason:
                    reactivatedAt === newTimes.reactivatedAt && newTimes.reactivatedAt >= oldTimes.reactivatedAt
                        ? newRecord.reactivatedReason || oldRecord.reactivatedReason || null
                        : oldRecord.reactivatedReason || newRecord.reactivatedReason || null
            };
        }

        return merged;
    }

    function customerLifecycleSelfTest() {
        const db = defaultDb();
        db.removedCustomers['123'] = {
            playerId:'123',
            playerName:'Test Buyer',
            removedAt:'2026-09-29T12:00:00.000Z',
            reactivatedAt:null,
            reactivatedReason:null
        };
        ensureCustomer(db,'123','Test Buyer');
        const sale = {
            id:'test-sale',
            playerId:'123',
            playerName:'Test Buyer',
            timestamp:Date.parse('2026-09-29T13:00:00.000Z'),
            total:100,
            units:1,
            items:[]
        };
        const reactivated = maybeReactivateCustomerForSale(db,sale);
        const merged = mergeRemovedCustomerStates(
            {'123':{playerId:'123',playerName:'Test Buyer',removedAt:'2026-09-29T12:00:00.000Z',reactivatedAt:null}},
            db.removedCustomers
        );
        return {
            pass: reactivated === true && !isCustomerRemoved(db,'123') && !isRemovalRecordActive(merged['123']),
            reactivatedAt: merged['123']?.reactivatedAt || null
        };
    }

    function ensureCoupon(db, customer) {
        const id = asId(customer.id);
        if (!db.coupons[id]) {
            db.coupons[id] = {
                playerId: id,
                playerName: customer.name || id,
                code: makeCouponCode(id),
                maxUses: COUPON_MAX_USES,
                uses: 0,
                redemptions: [],
                pendingRefundId: null,
                createdAt: nowIso(),
                issuedAt: null
            };
        }
        return db.coupons[id];
    }

    function couponRemaining(coupon) {
        return Math.max(0, Number(coupon?.maxUses || COUPON_MAX_USES) - Number(coupon?.uses || 0));
    }

    function usedSaleIds(coupon) {
        const ids = new Set();
        for (const redemption of coupon?.redemptions || []) {
            for (const id of redemption.saleIds || []) ids.add(String(id));
        }
        return ids;
    }

    function eligibleCouponSales(db, coupon) {
        if (!coupon?.issuedAt) return [];
        const issued = new Date(coupon.issuedAt).getTime();
        const cutoff = Math.max(issued, Date.now() - COUPON_WINDOW_MS);
        const used = usedSaleIds(coupon);
        return Object.values(db.sales)
            .filter(sale => asId(sale.playerId) === asId(coupon.playerId))
            .filter(sale => Number(sale.timestamp || 0) >= cutoff)
            .filter(sale => !used.has(String(sale.id)))
            .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    }

    function cashbackForAmount(total) {
        const amount = Math.max(0, Number(total) || 0);
        const tier = CASHBACK_TIERS.find(t => amount >= t.minimum);
        if (!tier) return { qualified: false, cashback: 0, tier: null };
        const cap = Math.floor(amount * MAX_CASHBACK_PERCENT);
        return { qualified: true, cashback: Math.min(tier.cashback, cap), tier };
    }

    function couponQualification(db, coupon) {
        if (!coupon) return { qualified: false, reason: 'Coupon not found.', total: 0, cashback: 0, sales: [] };
        if (!coupon.issuedAt) return { qualified: false, reason: 'Coupon has not been issued yet.', total: 0, cashback: 0, sales: [] };
        if (couponRemaining(coupon) <= 0) return { qualified: false, reason: 'Coupon is fully redeemed.', total: 0, cashback: 0, sales: [] };
        if (coupon.pendingRefundId) return { qualified: false, reason: 'A cashback refund is already pending.', total: 0, cashback: 0, sales: [] };
        const sales = eligibleCouponSales(db, coupon);
        const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const calc = cashbackForAmount(total);
        if (!calc.qualified) {
            const needed = Math.max(0, 50_000 - total);
            return {
                qualified: false,
                reason: total ? `${money(needed)} more needed for $5,000 cashback.` : 'No qualifying post-coupon purchase found in the last 24 hours.',
                total,
                cashback: 0,
                sales
            };
        }
        return { qualified: true, reason: 'Qualified.', total, cashback: calc.cashback, tier: calc.tier, sales };
    }

    // ============================================================
    // BAZAAR SALE INGESTION
    // ============================================================

    function numeric(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizeItems(rawItems, saleData = {}) {
        if (!rawItems) return [];

        let list = [];
        if (Array.isArray(rawItems)) {
            list = rawItems;
        } else if (typeof rawItems === 'object') {
            const looksLikeSingle = ['id', 'item_id', 'item', 'name', 'quantity', 'qty', 'price', 'cost', 'total'].some(k => k in rawItems);
            list = looksLikeSingle
                ? [rawItems]
                : Object.entries(rawItems).map(([id, value]) =>
                    value && typeof value === 'object' ? { id, ...value } : { id, qty: value }
                );
        } else {
            list = [{ id: rawItems }];
        }

        const saleCostEach = Math.max(0, numeric(saleData.cost_each ?? saleData.price_each ?? saleData.unit_price, 0));
        const saleCostTotal = Math.max(0, numeric(saleData.cost_total ?? saleData.total ?? saleData.price_total, 0));

        const normalized = list.map(item => {
            const id = asId(item.id ?? item.item_id ?? item.item ?? '');
            const quantity = Math.max(1, numeric(item.quantity ?? item.qty, 1));
            const explicitPrice = Math.max(0, numeric(item.price ?? item.cost_each ?? item.cost ?? item.unit_price, 0));
            const explicitTotal = Math.max(0, numeric(item.total ?? item.cost_total ?? item.price_total, 0));
            const price = explicitPrice || saleCostEach || (explicitTotal && quantity ? explicitTotal / quantity : 0);
            const total = explicitTotal || (price * quantity);

            return {
                id,
                uid: item.uid ?? item.UID ?? null,
                name: String(item.name ?? item.item_name ?? (id ? `Item ${id}` : 'Item')),
                quantity,
                price: Math.round(price),
                total: Math.round(total)
            };
        });

        // A 1226 log can put cost_total only at sale level. If there is one item,
        // make the item total exactly match the authoritative sale total.
        if (normalized.length === 1 && saleCostTotal > 0) {
            normalized[0].total = Math.round(saleCostTotal);
            normalized[0].price = normalized[0].quantity
                ? Math.round(saleCostTotal / normalized[0].quantity)
                : normalized[0].price;
        }

        return normalized;
    }

    function extractLogTypeId(entry) {
        return numeric(
            entry?.details?.id ??
            entry?.details?.log_id ??
            entry?.log_id ??
            entry?.type_id ??
            entry?.type ??
            0,
            0
        );
    }

    function logActorIdentity(value, fallbackName = '') {
        if (value && typeof value === 'object') {
            const id = asId(
                value.id ??
                value.user_id ??
                value.player_id ??
                value.torn_id ??
                value.ID ??
                ''
            );
            const name = String(
                value.name ??
                value.username ??
                value.player_name ??
                value.user_name ??
                fallbackName ??
                id
            ).trim();
            return { id, name };
        }

        const id = asId(value);
        return { id, name: String(fallbackName || id).trim() };
    }

    function extractBazaarSale(entry) {
        if (!entry) return null;

        const typeId = extractLogTypeId(entry);
        if (typeId && typeId !== BAZAAR_SELL_LOG_ID) return null;

        const data = entry.data && typeof entry.data === 'object' ? entry.data : {};
        const buyerRaw =
            data.buyer ??
            data.buyer_id ??
            data.user ??
            data.user_id ??
            data.player ??
            data.player_id ??
            data.customer ??
            null;

        const buyer = logActorIdentity(
            buyerRaw,
            data.buyer_name ?? data.user_name ?? data.player_name ?? data.customer_name ?? ''
        );
        const saleId = String(entry.id ?? entry.log_id ?? entry.uuid ?? '').trim();

        if (!saleId || !buyer.id || buyer.id === '[object Object]') return null;

        let rawItems = data.items ?? null;
        if (!rawItems && data.item && typeof data.item === 'object') rawItems = data.item;
        if (!rawItems && (data.item_id != null || (data.item != null && typeof data.item !== 'object'))) {
            rawItems = [{
                id: data.item_id ?? data.item,
                name: data.item_name,
                quantity: data.quantity ?? data.qty ?? 1,
                price: data.price ?? data.cost_each ?? data.unit_price ?? 0,
                total: data.cost_total ?? data.total ?? data.cost ?? 0
            }];
        }

        const items = normalizeItems(rawItems, data);
        const unitsFromItems = items.reduce((sum, item) => sum + Math.max(0, numeric(item.quantity, 0)), 0);
        const units = unitsFromItems || Math.max(1, numeric(data.quantity ?? data.qty, 1));

        // cost_total is authoritative for Torn Bazaar sell logs. cost_each × units
        // is the next fallback. Item totals are used only when neither is present.
        const costTotal = Math.max(0, numeric(data.cost_total ?? data.total ?? data.price_total, 0));
        const costEach = Math.max(0, numeric(data.cost_each ?? data.price_each ?? data.unit_price ?? data.price, 0));
        const itemTotal = items.reduce((sum, item) => sum + Math.max(0, numeric(item.total, 0)), 0);
        const total = Math.round(costTotal || (costEach * units) || itemTotal);

        let timestamp = numeric(entry.timestamp ?? entry.time ?? entry.created_at, 0);
        if (timestamp > 0 && timestamp < 100_000_000_000) timestamp *= 1000;
        if (!timestamp) return null;

        return {
            id: saleId,
            playerId: buyer.id,
            playerName: buyer.name || buyer.id,
            timestamp,
            total,
            units,
            items,
            sourceLogType: BAZAAR_SELL_LOG_ID
        };
    }

    function applySaleToCustomer(db, sale, resolvedName = '') {
        const name = String(resolvedName || sale.playerName || sale.playerId).trim();
        const customer = ensureCustomer(db, sale.playerId, name);
        const coupon = ensureCoupon(db, customer);

        customer.purchases = numeric(customer.purchases, 0) + 1;
        customer.units = numeric(customer.units, 0) + numeric(sale.units, 0);
        customer.spent = numeric(customer.spent, 0) + numeric(sale.total, 0);

        const iso = new Date(sale.timestamp).toISOString();
        const firstMs = customer.firstPurchase ? new Date(customer.firstPurchase).getTime() : 0;
        const lastMs = customer.lastPurchase ? new Date(customer.lastPurchase).getTime() : 0;
        if (!firstMs || sale.timestamp < firstMs) customer.firstPurchase = iso;
        if (!lastMs || sale.timestamp > lastMs) customer.lastPurchase = iso;

        coupon.playerName = name || coupon.playerName;
        if (name && !/^\d+$/.test(name)) applyUsername(db, sale.playerId, name);
        return customer;
    }


    function maybeReactivateCustomerForSale(db, sale) {
        const id = asId(sale?.playerId);
        const removed = db.removedCustomers?.[id];
        if (!removed || !isRemovalRecordActive(removed)) return false;

        const removedAt = Date.parse(removed.removedAt || '') || 0;
        const saleAt = Number(sale?.timestamp || 0);

        if (saleAt > removedAt && markCustomerReactivated(db, id, saleAt, 'new-bazaar-sale')) {
            ensureCustomer(db, id, sale.playerName || removed.playerName || id);
            return true;
        }
        return false;
    }

    function recalculateCustomerSalesTotals(db) {
        for (const customer of Object.values(db.customers || {})) {
            customer.purchases = 0;
            customer.units = 0;
            customer.spent = 0;
            customer.firstPurchase = null;
            customer.lastPurchase = null;
        }

        const sales = Object.values(db.sales || {})
            .slice()
            .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

        for (const sale of sales) {
            if (!sale?.playerId) continue;
            maybeReactivateCustomerForSale(db, sale);
            if (isCustomerRemoved(db, sale.playerId)) continue;
            applySaleToCustomer(db, sale, sale.playerName || '');
        }
        return db;
    }

    function importBazaarSaleIntoDb(db, sale) {
        const saleId = String(sale?.id || '').trim();
        if (!saleId || db.sales[saleId]) return false;

        let name = String(sale.playerName || sale.playerId || '').trim();
        if (!name) name = String(sale.playerId || '');

        sale.playerName = name;
        db.sales[saleId] = sale;
        maybeReactivateCustomerForSale(db, sale);
        if (!isCustomerRemoved(db, sale.playerId)) {
            applySaleToCustomer(db, sale, name);
        }
        return true;
    }

    async function repairRecentSalesCoverage({ lookbackMs = CUSTOMER_REFRESH_LOOKBACK_MS, silent = false } = {}) {
        if (!getApiKey()) {
            if (!silent) {
                statusText = 'Torn API key missing. Open More → Settings, paste your Torn API key, and Save. Customer refresh cannot run without User → Log access.';
                render();
            }
            return { imported: 0, checked: 0, repaired: false, rejected: 0, missingApiKey: true };
        }

        if (!silent) {
            statusText = 'Refreshing customer sales from the last 72 hours…';
            render();
        }

        const fromMs = Math.max(
            0,
            Date.now() - Math.max(NORMAL_LOOKBACK_MS, Number(lookbackMs || CUSTOMER_REFRESH_LOOKBACK_MS))
        );
        const rows = await fetchBazaarLogs(fromMs / 1000, 25);
        const db = dbLoad();
        const processed = new Set(getProcessed());
        let imported = 0;
        let checked = 0;
        let rejected = 0;

        rows.sort((a, b) => numeric(a.timestamp, 0) - numeric(b.timestamp, 0));

        for (const entry of rows) {
            const id = String(entry?.id ?? entry?.log_id ?? '');
            if (!id) {
                rejected++;
                continue;
            }
            checked++;

            if (db.sales[id]) {
                processed.add(id);
                continue;
            }

            const sale = extractBazaarSale(entry);
            if (!sale) {
                rejected++;
                console.warn('[MM CRM] Customer refresh rejected Bazaar row', entry);
                continue;
            }

            if (importBazaarSaleIntoDb(db, sale)) {
                processed.add(id);
                imported++;
            }
        }

        // One deterministic rebuild and one persistence write for the entire refresh.
        // This is dramatically faster than resolving usernames and saving per sale.
        recalculateCustomerSalesTotals(db);

        const audit = reconcileSalesIntegrity(db);
        db.meta.lastSalesAudit = { at: nowIso(), ...audit };
        db.meta.lastRecentSalesRepairAt = nowIso();
        dbSave(db);
        saveProcessed([...processed]);

        if (!silent) {
            statusText = imported
                ? `Customers refreshed: ${imported} missing sale${imported === 1 ? '' : 's'} imported from ${checked} checked${rejected ? `; ${rejected} row${rejected === 1 ? '' : 's'} deferred for retry` : ''}.`
                : `Customers refreshed: ${checked} recent Bazaar sale log${checked === 1 ? '' : 's'} checked${rejected ? `; ${rejected} row${rejected === 1 ? '' : 's'} deferred for retry` : ''}.`;
        }

        await flushDbWrites();
        if (!silent) render();

        if (!audit.ok) {
            throw new Error(`Sales repair audit failed: ${audit.problems.slice(0, 3).join('; ')}`);
        }

        // Refresh unresolved usernames even when the sales were already present.
        // This repairs customers that were imported during a prior failed audit.
        setTimeout(() => repairUsernames(25).then(count => {
            if (count > 0) statusText = `Customer names repaired: ${count}.`;
            render();
        }).catch(() => {}), 50);

        return { imported, checked, repaired: imported > 0, rejected };
    }

    function getProcessed() {
        const list = readJson(PROCESSED_KEY, []);
        return Array.isArray(list) ? list.map(String) : [];
    }

    function saveProcessed(ids) {
        const unique = [...new Set((ids || []).map(String).filter(Boolean))];
        if (unique.length > MAX_PROCESSED) unique.splice(0, unique.length - MAX_PROCESSED);
        writeJson(PROCESSED_KEY, unique);
    }

    function getSyncState() {
        const state = readJson(SYNC_KEY, {});
        return { lastSuccess: numeric(state.lastSuccess, 0) };
    }

    function saveSyncState(state) {
        writeJson(SYNC_KEY, state);
    }

    function nextUrlFromMetadata(data) {
        const next =
            data?._metadata?.links?.next ??
            data?.metadata?.links?.next ??
            data?._metadata?.next ??
            data?.pagination?.next ??
            null;

        if (typeof next !== 'string' || !next.trim()) return null;
        try {
            return new URL(next, API_BASE + '/').toString();
        } catch {
            return null;
        }
    }

    function logRowsFromResponse(data) {
        const candidate =
            data?.log ??
            data?.logs ??
            data?.data?.log ??
            data?.data?.logs ??
            null;

        if (Array.isArray(candidate)) return candidate;
        if (candidate && typeof candidate === 'object') {
            return Object.entries(candidate).map(([id, row]) => ({
                id: row?.id ?? row?.log_id ?? id,
                ...(row && typeof row === 'object' ? row : {})
            }));
        }
        return [];
    }

    async function fetchBazaarLogs(fromSeconds = 0, maxPages = MAX_LOG_PAGES) {
        const collected = [];
        let url = new URL(API_BASE + '/user/log');
        url.searchParams.set('log', String(BAZAAR_SELL_LOG_ID));
        if (fromSeconds > 0) url.searchParams.set('from', String(Math.max(0, Math.floor(fromSeconds))));
        url.searchParams.set('limit', '100');

        let pages = 0;
        const seenUrls = new Set();

        while (url && pages < maxPages) {
            const clean = url.toString();
            if (seenUrls.has(clean)) throw new Error('Torn log pagination loop detected.');
            seenUrls.add(clean);

            const data = await apiRequest(clean);
            const rows = logRowsFromResponse(data);
            collected.push(...rows);
            pages++;

            const next = nextUrlFromMetadata(data);
            url = next ? new URL(next) : null;
        }

        if (url && pages >= maxPages) {
            throw new Error(`Bazaar history exceeded the ${maxPages}-page safety limit. No partial rebuild was committed.`);
        }

        return collected;
    }

    function auditSalesData(db) {
        const problems = [];
        const sales = Object.values(db.sales || {});
        const byCustomer = new Map();

        for (const sale of sales) {
            if (!sale.id) problems.push('Sale without ID');
            if (!sale.playerId) problems.push(`Sale ${sale.id || '?'} without buyer`);
            if (!Number.isFinite(Number(sale.timestamp)) || Number(sale.timestamp) <= 0) problems.push(`Sale ${sale.id || '?'} invalid timestamp`);
            if (!Number.isFinite(Number(sale.total)) || Number(sale.total) < 0) problems.push(`Sale ${sale.id || '?'} invalid total`);
            if (!Number.isFinite(Number(sale.units)) || Number(sale.units) <= 0) problems.push(`Sale ${sale.id || '?'} invalid units`);

            const id = asId(sale.playerId);
            if (!byCustomer.has(id)) byCustomer.set(id, { purchases: 0, units: 0, spent: 0, first: Infinity, last: 0 });
            const a = byCustomer.get(id);
            a.purchases++;
            a.units += numeric(sale.units, 0);
            a.spent += numeric(sale.total, 0);
            a.first = Math.min(a.first, numeric(sale.timestamp, Infinity));
            a.last = Math.max(a.last, numeric(sale.timestamp, 0));
        }

        for (const [id, a] of byCustomer) {
            // Removed customers remain in the immutable sales ledger by design.
            // They are intentionally excluded from active-customer totals/audits.
            if (isCustomerRemoved(db, id)) continue;
            const c = db.customers[id];
            if (!c) {
                if (isCustomerRemoved(db, id)) continue;
                problems.push(`Missing customer ${id} for imported sales`);
                continue;
            }
            if (numeric(c.purchases) !== a.purchases) problems.push(`Customer ${id} purchase count mismatch`);
            if (numeric(c.units) !== a.units) problems.push(`Customer ${id} unit count mismatch`);
            if (numeric(c.spent) !== a.spent) problems.push(`Customer ${id} spend mismatch`);
        }

        return {
            ok: problems.length === 0,
            sales: sales.length,
            customersWithSales: byCustomer.size,
            problems
        };
    }

    function reconcileSalesIntegrity(db) {
        let audit = auditSalesData(db);
        let repaired = false;
        if (!audit.ok) {
            recalculateCustomerSalesTotals(db);
            audit = auditSalesData(db);
            repaired = true;
            db.meta.lastSalesSelfRepairAt = nowIso();
            db.meta.lastSalesSelfRepairOk = audit.ok;
        }
        return { ...audit, repaired };
    }

    async function repairSalesIntegrityNow() {
        const db = dbLoad();
        const initial = reconcileSalesIntegrity(db);
        db.meta.lastSalesAudit = { at: nowIso(), ...initial };
        db.meta.lastSalesSelfRepairAt = nowIso();
        db.meta.lastSalesSelfRepairOk = initial.ok;
        dbSave(db);
        await flushDbWrites();

        // Verify what actually survived the IndexedDB/cross-tab merge, not just the
        // pre-save snapshot.
        const persisted = dbLoad();
        const audit = reconcileSalesIntegrity(persisted);
        persisted.meta.lastSalesAudit = { at: nowIso(), ...audit };
        persisted.meta.lastSalesSelfRepairAt = nowIso();
        persisted.meta.lastSalesSelfRepairOk = audit.ok;
        if (audit.repaired) {
            dbSave(persisted);
            await flushDbWrites();
        }

        statusText = audit.ok
            ? `Sales integrity repaired: ${audit.sales} sales across ${audit.customersWithSales} active customers. PASS.`
            : `Sales integrity repair still found ${audit.problems.length} problem(s): ${audit.problems.slice(0,3).join('; ')}`;
        render();
        return audit;
    }

    async function rebuildSalesHistory() {
        if (syncRunning || !getApiKey()) return;
        if (!confirm(
            'Rebuild Bazaar sales history from Torn log 1226?\n\n' +
            'This preserves customer contact/message state, coupons, redemptions, refunds, and restock subscribers. ' +
            'Only imported sales and sale-derived totals/dates are rebuilt. Customers you removed remain filtered and will NOT be re-added.'
        )) return;

        syncRunning = true;
        fatal = false;
        statusText = 'Downloading complete available Bazaar sale history…';
        render();

        try {
            // Fetch and validate everything before touching the live CRM database.
            const rows = await fetchBazaarLogs(0, MAX_LOG_PAGES);
            const parsed = [];
            const rejected = [];

            for (const entry of rows) {
                const sale = extractBazaarSale(entry);
                if (sale) parsed.push(sale);
                else rejected.push(String(entry?.id ?? entry?.log_id ?? '?'));
            }

            if (rows.length && rejected.length) {
                throw new Error(
                    `${rejected.length} of ${rows.length} Bazaar log 1226 records could not be parsed. ` +
                    `No rebuild was committed. First rejected log: ${rejected[0]}.`
                );
            }

            parsed.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

            const db = dbLoad();

            // Preserve CRM relationship state, but reset only fields derived from sales.
            for (const customer of Object.values(db.customers)) {
                customer.purchases = 0;
                customer.units = 0;
                customer.spent = 0;
                customer.firstPurchase = null;
                customer.lastPurchase = null;
            }
            db.sales = {};

            const nameCache = new Map();
            for (const sale of parsed) {
                let name = String(sale.playerName || sale.playerId).trim();
                if (!name || name === sale.playerId || /^\d+$/.test(name)) {
                    if (nameCache.has(sale.playerId)) {
                        name = nameCache.get(sale.playerId);
                    } else {
                        try { name = await fetchTornUsername(sale.playerId); }
                        catch { name = sale.playerId; }
                        nameCache.set(sale.playerId, name);
                    }
                }

                sale.playerName = name;
                db.sales[String(sale.id)] = sale;
                // Rebuild the ledger, but never resurrect an intentionally removed customer.
                if (!isCustomerRemoved(db, sale.playerId)) {
                    applySaleToCustomer(db, sale, name);
                }
            }

            const audit = reconcileSalesIntegrity(db);
            if (!audit.ok) {
                throw new Error(`Internal rebuild audit failed: ${audit.problems.slice(0, 3).join('; ')}`);
            }

            db.meta.salesRebuiltAt = nowIso();
            db.meta.lastSalesAudit = { at: nowIso(), ...audit };
            dbSave(db);

            saveProcessed(parsed.map(s => s.id));
            saveSyncState({ lastSuccess: Date.now() });

            statusText = `Sales rebuild complete: ${audit.sales} Bazaar sales across ${audit.customersWithSales} customers. Audit PASS.`;
        } catch (error) {
            statusText = `Sales rebuild failed safely: ${error?.message || String(error)}`;
        } finally {
            syncRunning = false;
            render();
        }
    }

    async function sync({ silent = false } = {}) {
        if (syncRunning) return;
        if (!getApiKey()) {
            if (!silent) {
                statusText = 'Torn API key missing. Sales sync is paused. Open More → Settings, paste your Torn API key, and Save.';
                render();
            }
            return;
        }
        syncRunning = true;
        if (!silent) {
            statusText = 'Syncing Bazaar sales…';
            render();
        }

        try {
            const state = getSyncState();
            const lookback = state.lastSuccess ? NORMAL_LOOKBACK_MS : FIRST_SYNC_LOOKBACK_MS;
            const fromMs = Math.max(0, (state.lastSuccess || Date.now()) - lookback);
            const rows = await fetchBazaarLogs(fromMs / 1000, 25);
            const processed = new Set(getProcessed());
            const db = dbLoad();
            const knownSales = new Set(Object.keys(db.sales || {}));
            let imported = 0;
            let alreadyKnown = 0;
            let repairedProcessedGap = 0;
            let rejected = 0;
            let processedChanged = false;
            let deepReconcileRan = false;

            rows.sort((a, b) => numeric(a.timestamp, 0) - numeric(b.timestamp, 0));

            for (const entry of rows) {
                const id = String(entry?.id ?? entry?.log_id ?? '');
                if (!id) {
                    rejected++;
                    continue;
                }
                if (knownSales.has(id)) {
                    if (!processed.has(id)) {
                        processed.add(id);
                        processedChanged = true;
                    }
                    alreadyKnown++;
                    continue;
                }

                const wasProcessedWithoutSale = processed.has(id);
                const sale = extractBazaarSale(entry);
                if (!sale) {
                    // Never mark an unparseable sale as processed.
                    rejected++;
                    console.warn('[MM CRM] Rejected Bazaar sale log row', entry);
                    continue;
                }

                if (importBazaarSaleIntoDb(db, sale)) {
                    processed.add(id);
                    processedChanged = true;
                    knownSales.add(id);
                    imported++;
                    if (wasProcessedWithoutSale) repairedProcessedGap++;
                }
            }

            // Rejected rows remain unprocessed and will be retried on the next overlapping sync.
            // Do not block valid new customers because one Torn log row is malformed.

            const lastDeep = Date.parse(db.meta?.lastDeepSalesReconcileAt || '') || 0;
            if (Date.now() - lastDeep >= DEEP_SALES_RECONCILE_MS) {
                deepReconcileRan = true;
                const deepRows = await fetchBazaarLogs((Date.now() - FIRST_SYNC_LOOKBACK_MS) / 1000, 25);
                let deepImported = 0;

                deepRows.sort((a, b) => numeric(a.timestamp, 0) - numeric(b.timestamp, 0));
                for (const entry of deepRows) {
                    const id = String(entry?.id ?? entry?.log_id ?? '');
                    if (!id || db.sales[id]) continue;

                    const sale = extractBazaarSale(entry);
                    if (!sale) {
                        console.warn('[MM CRM] Deep reconcile rejected Bazaar log row', entry);
                        continue;
                    }

                    if (importBazaarSaleIntoDb(db, sale)) {
                        processed.add(id);
                        processedChanged = true;
                        knownSales.add(id);
                        deepImported++;
                    }
                }

                if (deepImported > 0) imported += deepImported;
                db.meta.lastDeepSalesReconcileAt = nowIso();
            }

            if (imported > 0) recalculateCustomerSalesTotals(db);

            const audit = reconcileSalesIntegrity(db);
            const databaseChanged = imported > 0 || deepReconcileRan || audit.repaired;
            if (databaseChanged) {
                db.meta.lastSalesAudit = { at: nowIso(), ...audit };
                dbSave(db);
            }
            if (processedChanged) saveProcessed([...processed]);
            saveSyncState({ lastSuccess: Date.now() });

            fatal = false;
            if (!silent || imported > 0 || rejected > 0) {
                statusText = imported
                    ? `Sync complete: ${imported} Bazaar sale${imported === 1 ? '' : 's'} imported${repairedProcessedGap ? ` (${repairedProcessedGap} missing ledger record${repairedProcessedGap === 1 ? '' : 's'} repaired)` : ''}${rejected ? `; ${rejected} row${rejected === 1 ? '' : 's'} deferred for retry` : ''}.`
                    : `Sync complete: no new Bazaar sales${rejected ? `; ${rejected} row${rejected === 1 ? '' : 's'} deferred for retry` : ''}.`;
            }

            if (databaseChanged) await flushDbWrites();
            if (!silent || imported > 0 || rejected > 0) render();

            if (!audit.ok) {
                throw new Error(`Sales integrity audit failed: ${audit.problems.slice(0, 3).join('; ')}`);
            }

            if (imported > 0) {
                setTimeout(() => repairUsernames(25).then(count => {
                    if (count > 0) statusText = `Sync complete. Customer names repaired: ${count}.`;
                    render();
                }).catch(() => {}), 50);
            }
            return { ok:true, imported, rejected, auditOk:audit.ok };
        } catch (error) {
            const code = Number(error?.code || 0);
            // Authentication/permission errors are surfaced, but never permanently
            // disable future syncs. A corrected key can recover immediately.
            fatal = [2, 16].includes(code);
            statusText = `Sync failed: ${error?.message || String(error)}`;
            if (!silent) render();
            return { ok:false, error:error?.message || String(error), code };
        } finally {
            syncRunning = false;
            if (!silent) render();
        }
    }


    // ============================================================
    // INVENTORY / PROCUREMENT DIRECTOR — NATIVE v4
    // ============================================================

    const normalizeItemName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

    function procurementState(db = dbLoad()) {
        return db.procurement;
    }

    function addProcurementDiagnostic(proc, value) {
        proc.diagnostics.unshift({ at: nowIso(), text: String(value) });
        proc.diagnostics = proc.diagnostics.slice(0, 40);
    }

    function catalogRows(data) {
        const raw = data?.items ?? data?.torn?.items ?? [];
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === 'object') return Object.entries(raw).map(([id, item]) => ({ id, ...(item || {}) }));
        return [];
    }

    async function refreshProcurementCatalog(force = false) {
        const db = dbLoad();
        const proc = procurementState(db);
        if (
            !force &&
            proc.lastCatalogAt &&
            Date.now() - new Date(proc.lastCatalogAt).getTime() < PROCUREMENT_CATALOG_MAX_AGE_MS &&
            Object.keys(proc.catalog).length
        ) return proc.catalog;

        const data = await apiRequest('/torn/items');
        const next = {};
        for (const row of catalogRows(data)) {
            const id = asId(row.id ?? row.ID ?? row.item_id);
            if (!id) continue;
            const value = row.value || {};
            next[id] = {
                id,
                name: String(row.name || row.item_name || `Item ${id}`),
                type: String(row.type || row.category || ''),
                marketValue: Number(value.market_price ?? value.market_value ?? row.market_value ?? row.market_price ?? 0) || 0,
                vendorBuy: Number(value.buy_price ?? row.buy_price ?? 0) || 0,
                vendorSell: Number(value.sell_price ?? row.sell_price ?? 0) || 0,
                shops: Array.isArray(value.shops) ? value.shops : []
            };
        }
        if (Object.keys(next).length) proc.catalog = next;
        proc.lastCatalogAt = nowIso();
        dbSave(db);
        return proc.catalog;
    }

    function parseStackableRows(raw, catalog = {}) {
        if (!raw) return {};
        let rows = raw;
        if (!Array.isArray(rows) && typeof rows === 'object') {
            rows = Object.entries(rows).map(([id, row]) =>
                typeof row === 'object' ? ({ id, ...row }) : ({ id, quantity: row })
            );
        }
        if (!Array.isArray(rows)) return {};

        const out = {};
        for (const row of rows) {
            const itemObj = row.item && typeof row.item === 'object' ? row.item : {};
            const id = asId(row.id ?? row.ID ?? row.item_id ?? itemObj.id ?? itemObj.ID);
            if (!id) continue;
            const quantity = Number(row.quantity ?? row.qty ?? row.amount ?? row.available ?? row.count ?? 0) || 0;
            const price = Number(row.price ?? row.cost ?? row.listing_price ?? 0) || 0;
            const name = String(row.name ?? row.item_name ?? itemObj.name ?? catalog[id]?.name ?? `Item ${id}`);
            if (!out[id]) out[id] = { id, name, quantity: 0, price: 0, listings: 0 };
            out[id].quantity += Math.max(0, quantity);
            if (price && (!out[id].price || price < out[id].price)) out[id].price = price;
            out[id].listings++;
        }
        return out;
    }

    async function syncOwnBazaar(proc, catalog) {
        const data = await apiRequestV1UserSelection('bazaar');
        proc.bazaar = parseStackableRows(data?.bazaar, catalog);
        proc.lastBazaarAt = nowIso();

        const db = dbLoad();
        const at = nowIso();
        for (const [id, row] of Object.entries(proc.bazaar)) {
            if (!Array.isArray(db.operations.bazaarPriceHistory[id])) db.operations.bazaarPriceHistory[id] = [];
            const history = db.operations.bazaarPriceHistory[id];
            const last = history[history.length - 1];
            if (!last || Number(last.price) !== Number(row.price) || Number(last.quantity) !== Number(row.quantity)) {
                history.push({ at, price: Number(row.price || 0), quantity: Number(row.quantity || 0) });
                db.operations.bazaarPriceHistory[id] = history.slice(-PRICE_HISTORY_MAX_PER_ITEM);
            }
        }
        dbSave(db);
    }

    async function syncOwnItemMarket(proc, catalog) {
        const data = await apiRequest('/user/itemmarket');
        const raw = data?.itemmarket?.listings ?? data?.itemmarket ?? data?.listings ?? [];
        proc.itemMarket = parseStackableRows(raw, catalog);
        proc.lastItemMarketAt = nowIso();
    }

    function watchedInventoryCategories(proc) {
        const cats = new Set();
        for (const id of Object.keys(proc.watchlist)) {
            const cat = String(proc.catalog[id]?.type || '').trim();
            if (cat) cats.add(cat);
        }
        for (const id of Object.keys(proc.bazaar)) {
            const cat = String(proc.catalog[id]?.type || '').trim();
            if (cat) cats.add(cat);
        }
        return [...cats].slice(0, 10);
    }

    function parseInventoryPayload(data, catalog) {
        const raw = data?.inventory ?? data?.items ?? [];
        return parseStackableRows(raw, catalog);
    }

    async function syncWatchedInventory(proc, catalog) {
        const categories = watchedInventoryCategories(proc);
        if (!categories.length) return;
        const combined = {};
        let any = false;
        for (const category of categories) {
            try {
                const data = await apiRequest(`/user/inventory?cat=${encodeURIComponent(category)}`);
                const rows = parseInventoryPayload(data, catalog);
                for (const [id, row] of Object.entries(rows)) {
                    if (!combined[id]) combined[id] = { ...row };
                    else combined[id].quantity += row.quantity;
                }
                any = true;
            } catch (error) {
                addProcurementDiagnostic(proc, `Inventory ${category}: ${error?.message || String(error)}`);
            }
        }
        if (any) {
            proc.inventory = combined;
            proc.lastInventoryAt = nowIso();
        }
    }

    function genericMarketListings(data, marketName) {
        const market = marketName === 'bazaar'
            ? (data?.bazaar?.listings ?? data?.bazaar ?? data?.listings ?? data?.bazaars ?? [])
            : (data?.itemmarket?.listings ?? data?.itemmarket ?? data?.listings ?? []);

        let rows = market;
        if (!Array.isArray(rows) && rows && typeof rows === 'object') {
            rows = Object.values(rows);
        }
        if (!Array.isArray(rows)) return [];

        return rows.map(row => {
            const item = row?.item && typeof row.item === 'object' ? row.item : {};
            const price = Number(row.price ?? row.cost ?? row.listing_price ?? item.price ?? 0) || 0;
            const quantity = Number(row.quantity ?? row.amount ?? row.qty ?? item.quantity ?? 1) || 1;
            return { price, quantity: Math.max(1, quantity) };
        }).filter(row => row.price > 0).sort((a, b) => a.price - b.price);
    }

    function marketMetrics(rows) {
        if (!rows.length) return {
            lowest: 0, third: 0, median: 0, totalQty: 0, listings: 0,
            depth1Pct: 0, depth3Pct: 0, depth5Pct: 0
        };
        const prices = rows.map(r => r.price);
        const lowest = prices[0];
        const quantityWithin = pct => rows
            .filter(r => r.price <= lowest * (1 + pct / 100))
            .reduce((sum, r) => sum + r.quantity, 0);
        return {
            lowest,
            third: prices[Math.min(2, prices.length - 1)],
            median: prices[Math.floor(prices.length / 2)] || lowest,
            totalQty: rows.reduce((sum, r) => sum + r.quantity, 0),
            listings: rows.length,
            depth1Pct: quantityWithin(1),
            depth3Pct: quantityWithin(3),
            depth5Pct: quantityWithin(5)
        };
    }

    function pushMarketHistory(proc, itemId, snapshot) {
        const id = asId(itemId);
        if (!Array.isArray(proc.marketHistory[id])) proc.marketHistory[id] = [];
        proc.marketHistory[id].push({
            at: snapshot.fetchedAt,
            itemMarketLowest: snapshot.itemMarket.lowest,
            itemMarketThird: snapshot.itemMarket.third,
            bazaarLowest: snapshot.bazaar.lowest,
            bazaarThird: snapshot.bazaar.third,
            realisticExit: snapshot.realisticExit,
            depth3Pct: snapshot.totalDepth3Pct,
            itemMarketTotalQty: Number(snapshot.itemMarket?.totalQty || 0),
            bazaarTotalQty: Number(snapshot.bazaar?.totalQty || 0),
            itemMarketListings: Number(snapshot.itemMarket?.listings || 0),
            bazaarListings: Number(snapshot.bazaar?.listings || 0)
        });
        proc.marketHistory[id] = proc.marketHistory[id].slice(-MARKET_HISTORY_MAX_PER_ITEM);
    }

    async function refreshMarketSnapshot(itemId) {
        const id = asId(itemId);
        if (!/^\d+$/.test(id)) throw new Error(`Invalid item ID: ${id}`);

        let itemMarketRows = [];
        let bazaarRows = [];
        let imError = null;
        let bazaarError = null;

        try {
            const data = await apiRequest(`/market/${encodeURIComponent(id)}/itemmarket?limit=25`);
            itemMarketRows = genericMarketListings(data, 'itemmarket');
        } catch (error) {
            imError = error;
        }

        try {
            // Torn /market/{id}/bazaar is a seller directory, not a priced listing feed.
            // Bazaar price/quantity therefore comes only from fresh seller-level TornW3B
            // observations; Torn is used separately to verify seller presence.
            const localDb = dbLoad();
            bazaarRows = freshOrganicListings(
                localDb,
                localDb.marketIntel?.details?.[id]?.organicListings || []
            ).slice(0, 25).map(row => ({
                price: Number(row.price || 0),
                quantity: Math.max(1, Number(row.quantity || 1))
            }));
        } catch (error) {
            bazaarError = error;
        }

        if (!itemMarketRows.length && !bazaarRows.length) {
            throw new Error(
                `No trusted market listings returned. Torn Item Market: ${imError?.message || 'empty'}; ` +
                `Bazaar seller observations: ${bazaarError?.message || 'empty'}`
            );
        }

        const itemMarket = marketMetrics(itemMarketRows);
        const bazaar = marketMetrics(bazaarRows);

        // Bazaar exit uses fresh TornW3B seller observations. Official Torn Item
        // Market is an independent fallback and is netted for the 5% market fee.
        const realisticExit = bazaar.third || bazaar.lowest ||
            Math.floor((itemMarket.third || itemMarket.lowest || 0) * (1 - ITEM_MARKET_FEE_RATE));

        const snapshot = {
            itemId: id,
            itemMarket,
            bazaar,
            realisticExit,
            sources: {
                itemMarket: itemMarketRows.length ? 'Torn API Item Market' : null,
                bazaar: bazaarRows.length ? 'TornW3B fresh seller observations' : null
            },
            totalDepth3Pct: Number(itemMarket.depth3Pct || 0) + Number(bazaar.depth3Pct || 0),
            fetchedAt: nowIso()
        };

        const db = dbLoad();
        db.procurement.marketSnapshots[id] = snapshot;
        pushMarketHistory(db.procurement, id, snapshot);
        if (imError) addProcurementDiagnostic(db.procurement, `Item Market ${id}: ${imError.message}`);
        if (bazaarError) addProcurementDiagnostic(db.procurement, `Bazaar market ${id}: ${bazaarError.message}`);
        dbSave(db);
        return snapshot;
    }

    function salesItemMetrics(db) {
        const now = Date.now();
        const out = {};
        for (const sale of Object.values(db.sales)) {
            const ts = Number(sale.timestamp || 0);
            const dayKey = new Date(ts).toISOString().slice(0, 10);
            for (const item of sale.items || []) {
                const id = asId(item.id);
                const key = id || `name:${normalizeItemName(item.name)}`;
                if (!key) continue;
                if (!out[key]) out[key] = {
                    itemId: id,
                    name: item.name || db.procurement.catalog[id]?.name || key,
                    sold24h: 0, sold7d: 0, sold30d: 0, revenue30d: 0,
                    saleDays30d: new Set(), lastSaleAt: 0
                };
                const qty = Number(item.quantity || 0) || 0;
                const total = Number(item.total || 0) || 0;
                if (now - ts <= 24 * 60 * 60 * 1000) out[key].sold24h += qty;
                if (now - ts <= 7 * 24 * 60 * 60 * 1000) out[key].sold7d += qty;
                if (now - ts <= 30 * 24 * 60 * 60 * 1000) {
                    out[key].sold30d += qty;
                    out[key].revenue30d += total;
                    out[key].saleDays30d.add(dayKey);
                }
                out[key].lastSaleAt = Math.max(out[key].lastSaleAt, ts);
            }
        }
        for (const row of Object.values(out)) row.saleDays30d = row.saleDays30d.size;
        return out;
    }

    function parseAcquisitionLog(entry, source, catalog) {
        const data = entry?.data || {};
        const rawItems = Array.isArray(data.items) ? data.items : [];
        if (!rawItems.length) return [];
        const costEach = Number(data.cost_each ?? data.price_each ?? 0) || 0;
        const costTotal = Number(data.cost_total ?? data.total ?? 0) || 0;
        const totalQty = rawItems.reduce((sum, item) => sum + Math.max(1, Number(item.qty ?? item.quantity ?? 1) || 1), 0);
        let timestamp = Number(entry.timestamp || 0);
        if (timestamp && timestamp < 100_000_000_000) timestamp *= 1000;
        if (!timestamp) timestamp = Date.now();

        return rawItems.map((item, index) => {
            const id = asId(item.id ?? item.item_id);
            const quantity = Math.max(1, Number(item.qty ?? item.quantity ?? 1) || 1);
            const allocatedUnitCost = costEach || (costTotal && totalQty ? costTotal / totalQty : 0);
            return {
                id: `logbuy:${entry.id}:${id}:${index}`,
                externalId: `logbuy:${entry.id}:${id}:${index}`,
                itemId: id,
                itemName: catalog[id]?.name || `Item ${id}`,
                source,
                quantity,
                unitCost: allocatedUnitCost,
                notes: `Auto-imported from Torn log ${entry.id}`,
                sellerId: asId(data.seller ?? data.seller_id ?? data.user ?? data.user_id ?? data.player ?? data.player_id ?? ''),
                sellerName: String(data.seller_name ?? data.user_name ?? data.player_name ?? ''),
                acquiredAt: new Date(timestamp).toISOString(),
                logId: String(entry.id)
            };
        }).filter(row => row.itemId && row.quantity > 0);
    }

    async function fetchLogsByIdDetailed(logId, fromSeconds = 0, maxPages = 100) {
        const collected = [];
        let url = new URL(API_BASE + '/user/log');
        url.searchParams.set('log', String(logId));
        if (fromSeconds > 0) url.searchParams.set('from', String(Math.max(0, Math.floor(fromSeconds))));
        url.searchParams.set('limit', '100');

        let pages = 0;
        const seen = new Set();
        while (url && pages < maxPages) {
            const clean = url.toString();
            if (seen.has(clean)) throw new Error(`Log ${logId} pagination loop detected.`);
            seen.add(clean);
            const data = await apiRequest(clean);
            collected.push(...logRowsFromResponse(data));
            const next = nextUrlFromMetadata(data);
            url = next ? new URL(next) : null;
            pages++;
        }
        return { rows: collected, pages, truncated: Boolean(url) };
    }

    async function fetchLogsById(logId, fromSeconds = 0, maxPages = 100) {
        return (await fetchLogsByIdDetailed(logId, fromSeconds, maxPages)).rows;
    }

    function mergeAcquisitionLogRows(proc, rows, source) {
        let added = 0;
        for (const entry of rows) {
            for (const lot of parseAcquisitionLog(entry, source, proc.catalog)) {
                if (proc.acquisitionProcessed[lot.externalId]) continue;
                proc.acquisitions.push(lot);
                proc.acquisitionProcessed[lot.externalId] = true;
                added++;
            }
        }
        return added;
    }

    function acquisitionCoverageFromMs(nowMs = Date.now()) {
        return Math.max(0, Number(nowMs || Date.now()) - ACQUISITION_COVERAGE_BACKFILL_DAYS * 86400000);
    }

    function indexProcessedAcquisitionLots(proc) {
        proc.acquisitionProcessed = proc.acquisitionProcessed && typeof proc.acquisitionProcessed === 'object'
            ? proc.acquisitionProcessed
            : {};
        let indexed = 0;
        for (const acquisition of proc.acquisitions || []) {
            const externalId = String(acquisition?.externalId || '');
            if (!externalId.startsWith('logbuy:') || proc.acquisitionProcessed[externalId]) continue;
            proc.acquisitionProcessed[externalId] = true;
            indexed++;
        }
        return indexed;
    }

    function acquisitionCoverageBackfillNeeded(db = dbLoad(), hasApi = Boolean(getApiKey())) {
        return Boolean(
            hasApi &&
            db?.meta?.acquisitionCoverageVersion !== ACQUISITION_COVERAGE_VERSION
        );
    }

    async function ensureAcquisitionCoverageBackfill() {
        const db = dbLoad();
        if (!acquisitionCoverageBackfillNeeded(db, Boolean(getApiKey()))) {
            return { skipped:true, reason:'current', added:0, truncated:false };
        }

        const proc = db.procurement;
        const indexed = indexProcessedAcquisitionLots(proc);
        const fromMs = acquisitionCoverageFromMs();
        let added = 0;
        let truncated = false;
        let pages = 0;

        for (const [logIdText, source] of Object.entries(ACQUISITION_LOG_IDS)) {
            const detail = await fetchLogsByIdDetailed(
                Number(logIdText),
                fromMs / 1000,
                ACQUISITION_COVERAGE_MAX_PAGES
            );
            pages += Number(detail.pages || 0);
            truncated = truncated || Boolean(detail.truncated);
            added += mergeAcquisitionLogRows(proc, detail.rows, source);
        }

        proc.acquisitions = proc.acquisitions
            .sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime())
            .slice(-10_000);
        proc.lastAcquisitionSyncAt = nowIso();

        db.meta.acquisitionCoverageVersion = ACQUISITION_COVERAGE_VERSION;
        db.meta.acquisitionCoverageBackfilledAt = nowIso();
        db.meta.acquisitionCoverageBackfillAdded = Number(added || 0);
        db.meta.acquisitionCoverageFrom = new Date(fromMs).toISOString();
        db.meta.acquisitionCoverageBackfillTruncated = truncated;
        db.meta.acquisitionCoverageBackfillPages = pages;
        dbSave(db);

        return { ok:true, indexed, added:Number(added || 0), truncated, pages, fromMs };
    }

    async function syncAcquisitionLogs(forceFromZero = false) {
        const db = dbLoad();
        const proc = db.procurement;
        indexProcessedAcquisitionLots(proc);
        const lookbackDays = Math.max(1, Number(proc.settings.acquisitionLookbackDays || PROCUREMENT_FIRST_ACQUISITION_LOOKBACK_DAYS));
        const fromMs = forceFromZero
            ? 0
            : proc.lastAcquisitionSyncAt
                ? Math.max(0, new Date(proc.lastAcquisitionSyncAt).getTime() - NORMAL_LOOKBACK_MS)
                : Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
        let added = 0;

        for (const [logIdText, source] of Object.entries(ACQUISITION_LOG_IDS)) {
            const logId = Number(logIdText);
            const rows = await fetchLogsById(logId, fromMs ? fromMs / 1000 : 0, forceFromZero ? MAX_LOG_PAGES : 100);
            added += mergeAcquisitionLogRows(proc, rows, source);
        }

        proc.acquisitions = proc.acquisitions
            .sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime())
            .slice(-10_000);
        proc.lastAcquisitionSyncAt = nowIso();
        dbSave(db);
        return added;
    }

    async function rebuildAcquisitionHistory() {
        if (!getApiKey() || procurementRunning) return;
        if (!confirm(
            'Rebuild native acquisition history from Torn Item Market Buy and Bazaar Buy logs?\n\n' +
            'Manual, Travel, and Direct Trade acquisition entries are preserved. Auto-imported purchase-log lots are rebuilt.'
        )) return;

        procurementRunning = true;
        statusText = 'Rebuilding acquisition cost basis from Torn purchase logs…';
        render();

        try {
            await refreshProcurementCatalog(false);
            let db = dbLoad();
            const preserved = db.procurement.acquisitions.filter(a => !String(a.externalId || '').startsWith('logbuy:'));
            db.procurement.acquisitions = preserved;
            db.procurement.acquisitionProcessed = {};
            db.procurement.lastAcquisitionSyncAt = null;
            dbSave(db);

            const added = await syncAcquisitionLogs(true);
            db = dbLoad();
            db.procurement.lastAcquisitionRebuildAt = nowIso();
            dbSave(db);
            statusText = `Acquisition rebuild complete: ${added.toLocaleString()} purchase lot${added === 1 ? '' : 's'} imported.`;
        } catch (error) {
            statusText = `Acquisition rebuild failed: ${error?.message || String(error)}`;
        } finally {
            procurementRunning = false;
            render();
        }
    }

    function itemSalesChronological(db, itemId) {
        const id = asId(itemId);
        const rows = [];
        for (const sale of Object.values(db.sales)) {
            let qty = 0;
            for (const item of sale.items || []) {
                if (asId(item.id) === id) qty += Number(item.quantity || 0) || 0;
            }
            if (qty > 0) rows.push({ timestamp: Number(sale.timestamp || 0), quantity: qty });
        }
        return rows.sort((a, b) => a.timestamp - b.timestamp);
    }

    function fifoCostBasis(db, itemId, itemName = '') {
        const id = asId(itemId);
        const norm = normalizeItemName(itemName || db.procurement.catalog[id]?.name);
        const lots = db.procurement.acquisitions
            .filter(a => id ? asId(a.itemId) === id : normalizeItemName(a.itemName) === norm)
            .map(a => ({
                quantity: Number(a.quantity || 0),
                remaining: Number(a.quantity || 0),
                unitCost: Number(a.unitCost || 0),
                acquiredAt: new Date(a.acquiredAt || 0).getTime()
            }))
            .filter(a => a.quantity > 0 && a.unitCost >= 0)
            .sort((a, b) => a.acquiredAt - b.acquiredAt);

        let cursor = 0;
        for (const sale of itemSalesChronological(db, id)) {
            let need = sale.quantity;
            while (need > 0 && cursor < lots.length) {
                const lot = lots[cursor];
                const take = Math.min(need, lot.remaining);
                lot.remaining -= take;
                need -= take;
                if (lot.remaining <= 0) cursor++;
            }
        }

        const remainingLots = lots.filter(l => l.remaining > 0);
        const remainingQty = remainingLots.reduce((sum, l) => sum + l.remaining, 0);
        const remainingCost = remainingLots.reduce((sum, l) => sum + l.remaining * l.unitCost, 0);
        const allQty = lots.reduce((sum, l) => sum + l.quantity, 0);
        const allCost = lots.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
        return {
            remainingQty,
            remainingCost,
            avgCost: remainingQty ? remainingCost / remainingQty : (allQty ? allCost / allQty : 0),
            trackedPurchasedQty: allQty
        };
    }

    function historyStats(proc, itemId) {
        const history = Array.isArray(proc.marketHistory[itemId]) ? proc.marketHistory[itemId] : [];
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const values = history
            .filter(h => new Date(h.at).getTime() >= weekAgo)
            .map(h => Number(h.realisticExit || 0))
            .filter(v => v > 0)
            .sort((a, b) => a - b);
        if (!values.length) return { median7d: 0, volatilityPct: 0, samples: 0 };
        const median7d = values[Math.floor(values.length / 2)];
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        const volatilityPct = mean ? Math.sqrt(variance) / mean * 100 : 0;
        return { median7d, volatilityPct, samples: values.length };
    }

    function liquidityForRow(metrics, snapshot) {
        const daily = metrics.sold7d > 0 ? metrics.sold7d / 7 : metrics.sold30d / 30;
        const saleDays = Number(metrics.saleDays30d || 0);
        const depth = Number(snapshot?.totalDepth3Pct || 0);
        const score = Math.max(0, Math.min(100,
            Math.min(45, daily * 8) +
            Math.min(30, saleDays * 3) +
            Math.min(25, Math.log10(depth + 1) * 12)
        ));
        const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'E';
        return { score, grade };
    }

    function marketMovementMetrics(proc, itemId) {
        const id = asId(itemId);
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const history = (Array.isArray(proc?.marketHistory?.[id]) ? proc.marketHistory[id] : [])
            .map(row => ({
                at: Date.parse(row?.at || '') || 0,
                depth: Math.max(0, Number(row?.depth3Pct || 0)),
                exit: Math.max(0, Number(row?.realisticExit || 0))
            }))
            .filter(row => row.at >= cutoff && row.depth >= 0)
            .sort((a,b) => a.at - b.at);

        if (history.length < 3) {
            return {
                score:0,
                confidence:0,
                depletionPerHour:0,
                replenishmentPerHour:0,
                observations:history.length
            };
        }

        let depletion = 0;
        let replenishment = 0;
        let observedHours = 0;
        let usablePairs = 0;

        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const cur = history[i];
            const hours = Math.max(0, (cur.at - prev.at) / 3600000);
            if (!(hours > 0) || hours > 6) continue;

            // Ignore extreme repricing jumps; quantity movement across a major price
            // regime change is too ambiguous to treat as demand evidence.
            const priceBase = Math.max(1, prev.exit || cur.exit || 1);
            const priceMovePct = Math.abs(Number(cur.exit || 0) - Number(prev.exit || 0)) / priceBase * 100;
            if (prev.exit > 0 && cur.exit > 0 && priceMovePct > 12) continue;

            const delta = cur.depth - prev.depth;
            if (delta < 0) depletion += Math.abs(delta);
            else if (delta > 0) replenishment += delta;
            observedHours += hours;
            usablePairs++;
        }

        if (!(observedHours > 0) || usablePairs < 2) {
            return {
                score:0,
                confidence:0,
                depletionPerHour:0,
                replenishmentPerHour:0,
                observations:history.length
            };
        }

        const depletionPerHour = depletion / observedHours;
        const replenishmentPerHour = replenishment / observedHours;
        const activityPerHour = (depletion + replenishment) / observedHours;
        const confidence = Math.max(0, Math.min(100, usablePairs * 12));
        const score = Math.max(0, Math.min(100,
            Math.log10(1 + depletionPerHour * 24) * 40 +
            Math.log10(1 + activityPerHour * 24) * 25
        ));

        return {
            score,
            confidence,
            depletionPerHour,
            replenishmentPerHour,
            observations:history.length
        };
    }


    function procurementRows(db) {
        const proc = db.procurement;
        const rules = businessRules(db);
        const metrics = salesItemMetrics(db);
        const globalCandidateIds = globalOpportunityRows(db)
            .slice(0, Math.max(50, rules.marketRefreshLimit * 2))
            .map(row => asId(row.id))
            .filter(Boolean);
        const keys = new Set([
            ...Object.keys(proc.bazaar),
            ...Object.keys(proc.itemMarket),
            ...Object.keys(proc.inventory),
            ...Object.keys(proc.watchlist),
            ...Object.keys(metrics).filter(k => /^\d+$/.test(k)),
            ...globalCandidateIds
        ]);

        const rows = [];
        for (const id of keys) {
            const m = metrics[id] || { sold24h: 0, sold7d: 0, sold30d: 0, revenue30d: 0, saleDays30d: 0, lastSaleAt: 0 };
            const catalog = proc.catalog[id] || {};
            const bazaar = proc.bazaar[id] || {};
            const ownIM = proc.itemMarket[id] || {};
            const inv = proc.inventory[id] || {};
            const snap = proc.marketSnapshots[id] || {};
            const watch = proc.watchlist[id] || {};

            const daily = m.sold7d > 0 ? m.sold7d / 7 : m.sold30d / 30;
            const listed = Number(bazaar.quantity || 0) + Number(ownIM.quantity || 0);
            const onHand = Number(inv.quantity || 0);
            const stock = listed + onHand;

            const targetDays = Number(watch.targetDays ?? proc.settings.targetDays ?? 5);
            const safetyDays = Number(watch.safetyDays ?? proc.settings.safetyDays ?? 2);
            const targetStock = Number.isFinite(Number(watch.targetStock)) && Number(watch.targetStock) > 0
                ? Number(watch.targetStock)
                : Math.ceil(daily * targetDays);
            const reorderPoint = Number.isFinite(Number(watch.reorderPoint)) && Number(watch.reorderPoint) >= 0
                ? Number(watch.reorderPoint)
                : Math.ceil(daily * safetyDays);
            const shortage = Math.max(0, targetStock - stock);
            const daysStock = daily > 0 ? stock / daily : Infinity;

            const marketSnapshotFresh = Boolean(snap.fetchedAt) &&
                ageSeconds(snap.fetchedAt) <= Math.max(300, rules.maxListingAgeSec * 2);
            const realisticExit = marketSnapshotFresh ? Number(snap.realisticExit || 0) : 0;
            const bestBuyPrice = marketSnapshotFresh
                ? ([snap?.bazaar?.lowest, snap?.itemMarket?.lowest].map(Number).filter(v => v > 0).sort((a,b) => a-b)[0] || 0)
                : 0;
            const minMarginPct = Math.max(
                Number(watch.minMarginPct ?? proc.settings.minMarginPct ?? 4),
                rules.minRoiPct
            );
            const calculatedBuyTarget = realisticExit ? Math.floor(realisticExit / (1 + minMarginPct / 100)) : 0;
            const buyTarget = Number(watch.maxBuyPrice || calculatedBuyTarget || 0);

            const basis = fifoCostBasis(db, id, catalog.name || bazaar.name || ownIM.name || inv.name);
            const avgCost = basis.avgCost;
            const profitPerUnit = realisticExit && avgCost ? realisticExit - avgCost : 0;
            const marginPct = avgCost > 0 ? profitPerUnit / avgCost * 100 : 0;
            const bestDealProfit = realisticExit && bestBuyPrice ? realisticExit - bestBuyPrice : 0;
            const bestDealMarginPct = bestBuyPrice > 0 ? bestDealProfit / bestBuyPrice * 100 : 0;

            const liquidity = liquidityForRow(m, snap);
            const history = historyStats(proc, id);
            const movement = marketMovementMetrics(proc, id);
            const globalDemand = db.marketIntel?.marketplace?.[id] || {};
            const marketSellerCount = Math.max(
                Number(globalDemand.totalBazaars || 0),
                Number(snap?.bazaar?.listings || 0)
            );
            const marketListingCount =
                Number(snap?.bazaar?.listings || 0) +
                Number(snap?.itemMarket?.listings || 0);
            const marketDemandScore = Math.max(0, Math.min(100,
                Math.min(35, Math.log10(1 + marketSellerCount) * 24) +
                Math.min(25, Math.log10(1 + Number(snap.totalDepth3Pct || 0)) * 13) +
                Math.min(15, marketListingCount * 1.5) +
                Math.min(10, history.samples) +
                Math.min(15, movement.score * Math.min(1, movement.confidence / 60) * 0.15)
            ));

            const velocityScore = Math.min(100,
                Math.log10(1 + Math.max(0, daily) * 10) * 42 +
                Math.min(30, Number(m.sold24h || 0) * 6)
            );
            const roiScore = Math.min(100, Math.max(0, bestDealMarginPct) * 5);
            const absoluteProfitScore = bestDealProfit > 0
                ? Math.min(100, Math.log10(1 + bestDealProfit) * 14)
                : 0;
            const volatilityPenalty = Math.min(25, Math.max(0, history.volatilityPct) * 0.8);

            // Start with market evidence, then shift ranking authority toward the
            // owner's own demand + matched FIFO realized ROI as the personal sample matures.
            const personalDemandQualified =
                Number(m.sold30d || 0) >= 5 ||
                Number(m.saleDays30d || 0) >= 3;
            const personalRealized = personalDemandQualified
                ? realizedProfitMetrics(db, id, 30)
                : null;
            const personalRoiEvidence = Boolean(
                personalRealized &&
                Number(personalRealized.cogs || 0) > 0 &&
                Number(personalRealized.matchedUnits || 0) >= 3 &&
                Number(personalRealized.costCoveragePct || 0) >= 50
            );
            const ownRealizedRoiPct = personalRoiEvidence
                ? Number(personalRealized.grossProfit || 0) / Number(personalRealized.cogs || 1) * 100
                : 0;
            const personalDemandScore = Math.min(100,
                Math.log10(1 + Math.max(0, daily) * 12) * 55 +
                Math.min(35, Number(m.saleDays30d || 0) * 3.5)
            );
            const personalRoiScore = Math.min(100, Math.max(0, ownRealizedRoiPct) * 5);
            const personalMaturity = Math.max(0, Math.min(1,
                Math.max(
                    Number(m.sold30d || 0) / 30,
                    Number(m.saleDays30d || 0) / 10
                )
            ));
            const marketScore = Math.max(0, Math.min(100,
                roiScore * 0.45 +
                liquidity.score * 0.20 +
                marketDemandScore * 0.20 +
                velocityScore * 0.05 +
                absoluteProfitScore * 0.10 -
                volatilityPenalty
            ));
            // Missing FIFO cost basis should not lower a mature SKU's personal
            // score; in that case personal authority is demand-only.
            const personalScore = Math.max(0, Math.min(100,
                personalRoiEvidence
                    ? personalDemandScore * 0.55 + personalRoiScore * 0.45
                    : personalDemandScore
            ));
            const personalWeight = personalMaturity * 0.70;
            const acquisitionScore = Math.max(0, Math.min(100,
                marketScore * (1 - personalWeight) +
                personalScore * personalWeight
            ));

            let priority = 'LOW', rank = 4;
            if (acquisitionScore >= 80) { priority = 'ELITE'; rank = 0; }
            else if (acquisitionScore >= 65) { priority = 'HIGH ROI'; rank = 1; }
            else if (acquisitionScore >= 50) { priority = 'FAST'; rank = 2; }
            else if (acquisitionScore >= 35) { priority = 'WATCH'; rank = 3; }

            const marketBootstrapQualified =
                !personalDemandQualified &&
                marketSellerCount >= rules.minSellerCount &&
                marketDemandScore >= 40;
            const demandQualified =
                personalDemandQualified
                    ? daily >= rules.minDemandPerDay
                    : marketBootstrapQualified;
            const priceQualified =
                bestBuyPrice <= 0 ||
                (bestBuyPrice >= rules.minPrice && bestBuyPrice <= rules.maxPrice);
            const marginQualified =
                bestBuyPrice > 0 &&
                realisticExit > bestBuyPrice &&
                bestDealMarginPct >= minMarginPct &&
                bestDealProfit >= rules.minAbsoluteProfit;

            const quickSaleQualified = personalDemandQualified
                ? (
                    liquidity.score >= 45 ||
                    daily >= Math.max(0.25, rules.minDemandPerDay) ||
                    Number(m.sold24h || 0) > 0
                )
                : marketBootstrapQualified;

            const action = marginQualified && quickSaleQualified && demandQualified && priceQualified
                ? 'BUY'
                : bestBuyPrice > 0 && realisticExit > bestBuyPrice && priceQualified
                    ? 'WATCH'
                    : 'SKIP';

            const turnoverDays = daily > 0 ? Math.max(0.25, 1 / daily) : Infinity;
            const opportunityQtyCap = daily > 0
                ? Math.max(1, Math.ceil(daily * Math.min(5, targetDays)))
                : (marketBootstrapQualified && marginQualified ? 1 : 0);

            rows.push({
                id,
                name: catalog.name || bazaar.name || ownIM.name || inv.name || `Item ${id}`,
                type: catalog.type || '',
                bazaarQty: Number(bazaar.quantity || 0),
                bazaarPrice: Number(bazaar.price || 0),
                itemMarketQty: Number(ownIM.quantity || 0),
                onHand,
                stock,
                sold24h: Number(m.sold24h || 0),
                sold7d: Number(m.sold7d || 0),
                sold30d: Number(m.sold30d || 0),
                daily,
                daysStock,
                targetStock,
                reorderPoint,
                shortage,
                realisticExit,
                buyTarget,
                bestBuyPrice,
                avgCost,
                trackedPurchasedQty: basis.trackedPurchasedQty,
                profitPerUnit,
                marginPct,
                bestDealProfit,
                bestDealMarginPct,
                priority,
                rank,
                watched: Boolean(proc.watchlist[id]),
                globalCandidate: globalCandidateIds.includes(id),
                liquidityScore: liquidity.score,
                liquidityGrade: liquidity.grade,
                median7d: history.median7d,
                volatilityPct: history.volatilityPct,
                historySamples: history.samples,
                depth3Pct: Number(snap.totalDepth3Pct || 0),
                marketFetchedAt: snap.fetchedAt || null,
                marketSnapshotFresh,
                velocityScore,
                marketScore,
                marketDemandScore,
                marketSellerCount,
                marketMovementScore: movement.score,
                marketMovementConfidence: movement.confidence,
                marketDepletionPerHour: movement.depletionPerHour,
                marketReplenishmentPerHour: movement.replenishmentPerHour,
                marketBootstrapQualified,
                personalDemandScore,
                ownRealizedRoiPct,
                personalRoiEvidence,
                personalCostCoveragePct:Number(personalRealized?.costCoveragePct || 0),
                personalMatchedUnits:Number(personalRealized?.matchedUnits || 0),
                personalMaturity,
                personalWeight,
                acquisitionScore,
                turnoverDays,
                opportunityQtyCap,
                personalDemandQualified,
                demandQualified,
                priceQualified,
                action
            });
        }

        return rows.sort((a, b) =>
            (b.action === 'BUY') - (a.action === 'BUY') ||
            b.acquisitionScore - a.acquisitionScore ||
            b.bestDealMarginPct - a.bestDealMarginPct ||
            b.liquidityScore - a.liquidityScore ||
            b.daily - a.daily ||
            a.name.localeCompare(b.name)
        );
    }

    function capitalAllocationPlan(db) {
        const budget = Math.max(0, Number(db.procurement.settings.procurementBudget || 0));
        let remaining = budget;

        const rows = procurementRows(db)
            .filter(r => r.action === 'BUY' && r.bestBuyPrice > 0 && r.opportunityQtyCap > 0)
            .sort((a, b) =>
                b.acquisitionScore - a.acquisitionScore ||
                b.bestDealMarginPct - a.bestDealMarginPct ||
                b.liquidityScore - a.liquidityScore ||
                b.daily - a.daily
            );

        const plan = [];
        for (const row of rows) {
            const unitPrice = row.bestBuyPrice;
            if (!(unitPrice > 0) || remaining < unitPrice) continue;

            // Allocate for turnover, not target-inventory shortage.
            const quantity = Math.min(
                row.opportunityQtyCap,
                Math.max(1, Math.floor(remaining / unitPrice))
            );
            if (quantity <= 0) continue;

            const spend = quantity * unitPrice;
            plan.push({
                ...row,
                allocatedQty: quantity,
                allocatedSpend: spend,
                expectedProfit: quantity * Math.max(0, row.bestDealProfit),
                expectedTurnoverDays: row.turnoverDays
            });
            remaining -= spend;
        }

        return { budget, remaining, plan };
    }

    async function syncProcurement({ silent = false, marketLimit = null } = {}) {
        if (procurementRunning || !getApiKey()) return { skipped: true };
        procurementRunning = true;
        if (!silent) {
            statusText = 'Syncing native procurement data…';
            render();
        }

        try {
            await refreshProcurementCatalog(false);
            let db = dbLoad();
            let proc = db.procurement;
            proc.diagnostics = [];

            try { await syncOwnBazaar(proc, proc.catalog); }
            catch (error) { addProcurementDiagnostic(proc, `Own Bazaar: ${error?.message || String(error)}`); }

            try { await syncOwnItemMarket(proc, proc.catalog); }
            catch (error) { addProcurementDiagnostic(proc, `Own Item Market: ${error?.message || String(error)}`); }

            try { await syncWatchedInventory(proc, proc.catalog); }
            catch (error) { addProcurementDiagnostic(proc, `Inventory: ${error?.message || String(error)}`); }

            db = recordOperationalSnapshot(db);
            dbSave(db);

            try {
                const added = await syncAcquisitionLogs(false);
                if (added) {
                    db = dbLoad();
                    addProcurementDiagnostic(db.procurement, `Cost basis: ${added} new purchase lot${added === 1 ? '' : 's'} imported.`);
                    dbSave(db);
                }
            } catch (error) {
                db = dbLoad();
                addProcurementDiagnostic(db.procurement, `Cost basis logs: ${error?.message || String(error)}`);
                dbSave(db);
            }

            db = dbLoad();
            const rules = businessRules(db);
            const globalIds = new Set(globalOpportunityRows(db).slice(0, rules.marketRefreshLimit).map(r => r.id));
            const candidates = procurementRows(db)
                .filter(r =>
                    /^\d+$/.test(r.id) &&
                    (
                        r.watched ||
                        r.daily > 0 ||
                        r.shortage > 0 ||
                        r.stock > 0 ||
                        globalIds.has(r.id)
                    )
                )
                .sort((a,b) =>
                    Number(globalIds.has(b.id)) - Number(globalIds.has(a.id)) ||
                    Number(b.personalDemandQualified) - Number(a.personalDemandQualified) ||
                    b.acquisitionScore - a.acquisitionScore ||
                    b.daily - a.daily
                )
                .slice(0, marketLimit == null
                    ? rules.marketRefreshLimit
                    : Math.max(1, Math.min(rules.marketRefreshLimit, Number(marketLimit || SMART_REFRESH_ITEM_LIMIT))));

            const marketResults = await mapWithConcurrency(
                candidates,
                PROCUREMENT_MARKET_CONCURRENCY,
                row => refreshMarketSnapshot(row.id)
            );
            let marketCount = 0;
            for (let index = 0; index < marketResults.length; index++) {
                const result = marketResults[index];
                if (result.status === 'fulfilled') {
                    marketCount++;
                    continue;
                }
                const next = dbLoad();
                addProcurementDiagnostic(
                    next.procurement,
                    `Market ${candidates[index]?.name || candidates[index]?.id || index + 1}: ${result.reason?.message || String(result.reason)}`
                );
                dbSave(next);
            }

            db = dbLoad();
            db.procurement.lastSyncAt = nowIso();
            dbSave(db);
            if (!silent) {
                statusText =
                    `Procurement sync complete: ${Object.keys(db.procurement.bazaar).length} Bazaar SKUs, ` +
                    `${marketCount} market snapshots, ${db.procurement.acquisitions.length} acquisition lots.`;
            }
            try { evaluateOpportunityAlerts(db, true); dbSave(db); } catch {}
            try { notifyOperationalAlerts(db); } catch {}
            return { ok: true, marketCount, acquisitionLots: db.procurement.acquisitions.length };
        } catch (error) {
            if (!silent) statusText = `Procurement sync failed: ${error?.message || String(error)}`;
            return { ok: false, error: error?.message || String(error) };
        } finally {
            procurementRunning = false;
            if (!silent) render();
        }
    }

    function toggleWatchItem(itemId) {
        const id = asId(itemId);
        const db = dbLoad();
        if (db.procurement.watchlist[id]) delete db.procurement.watchlist[id];
        else db.procurement.watchlist[id] = { itemId: id, createdAt: nowIso() };
        dbSave(db);
        render();
    }

    function saveProcurementSettings(values) {
        const db = dbLoad();
        for (const [key, raw] of Object.entries(values)) {
            const value = Number(raw);
            if (Number.isFinite(value) && value >= 0) db.procurement.settings[key] = value;
        }
        dbSave(db);
        render();
    }

    function addAcquisition({ itemId, itemName, source, quantity, unitCost, notes, externalId, acquiredAt, sellerId, sellerName, sessionId }) {
        const db = dbLoad();
        const proc = db.procurement;
        const id = asId(itemId);
        const name = String(itemName || proc.catalog[id]?.name || '').trim();
        const qty = Number(quantity || 0);
        const cost = Number(unitCost || 0);
        if (!name || !(qty > 0) || cost < 0) throw new Error('Item, quantity, and unit cost are required.');
        if (externalId && proc.acquisitions.some(a => a.externalId === externalId)) return false;

        proc.acquisitions.push({
            id: makeId('buy'),
            itemId: id,
            itemName: name,
            source: String(source || 'Manual'),
            quantity: qty,
            unitCost: cost,
            notes: String(notes || ''),
            sellerId: asId(sellerId || ''),
            sellerName: String(sellerName || ''),
            sessionId: sessionId || null,
            externalId: externalId || null,
            acquiredAt: acquiredAt || nowIso()
        });
        proc.acquisitions = proc.acquisitions.slice(-10_000);
        dbSave(db);
        return true;
    }

    function addTravelEntry(values) {
        const db = dbLoad();
        const id = asId(values.itemId);
        const name = String(values.itemName || db.procurement.catalog[id]?.name || '').trim();
        const qty = Number(values.quantity || 0);
        const unitCost = Number(values.unitCost || 0);
        if (!values.destination || !name || !(qty > 0) || unitCost < 0) {
            throw new Error('Destination, item, quantity, and unit cost are required.');
        }
        const row = {
            id: makeId('travel'),
            destination: String(values.destination),
            itemId: id,
            itemName: name,
            quantity: qty,
            unitCost,
            observedStock: Number(values.observedStock || 0),
            notes: String(values.notes || ''),
            at: nowIso()
        };
        db.procurement.travelLedger.unshift(row);
        db.procurement.travelLedger = db.procurement.travelLedger.slice(0, 1000);
        dbSave(db);

        addAcquisition({
            itemId: id,
            itemName: name,
            source: `Travel: ${row.destination}`,
            quantity: qty,
            unitCost,
            notes: row.notes,
            externalId: `travel:${row.id}`,
            acquiredAt: row.at
        });
        return row;
    }

    function removeAcquisition(acquisitionId) {
        const db = dbLoad();
        db.procurement.acquisitions = db.procurement.acquisitions.filter(a => a.id !== acquisitionId);
        dbSave(db);
        render();
    }

    function removeTravelEntry(travelId) {
        const db = dbLoad();
        db.procurement.travelLedger = db.procurement.travelLedger.filter(t => t.id !== travelId);
        dbSave(db);
        render();
    }

    function travelAnalytics(db) {
        const groups = {};
        for (const row of db.procurement.travelLedger) {
            const key = `${row.destination}|${row.itemId || normalizeItemName(row.itemName)}`;
            if (!groups[key]) groups[key] = {
                destination: row.destination,
                itemId: row.itemId,
                itemName: row.itemName,
                trips: 0,
                quantity: 0,
                totalCost: 0,
                stockObserved: []
            };
            const g = groups[key];
            g.trips++;
            g.quantity += Number(row.quantity || 0);
            g.totalCost += Number(row.quantity || 0) * Number(row.unitCost || 0);
            if (Number(row.observedStock || 0) > 0) g.stockObserved.push(Number(row.observedStock));
        }
        return Object.values(groups).map(g => ({
            ...g,
            avgUnitCost: g.quantity ? g.totalCost / g.quantity : 0,
            avgObservedStock: g.stockObserved.length
                ? g.stockObserved.reduce((s, v) => s + v, 0) / g.stockObserved.length
                : 0
        })).sort((a, b) => b.quantity - a.quantity);
    }


    // ============================================================
    // MARKET INTELLIGENCE — TornW3B PUBLIC API + LOCAL ANALYSIS v5
    // ============================================================

    function addIntelDiagnostic(intel, value) {
        intel.diagnostics.unshift({ at: nowIso(), text: String(value) });
        intel.diagnostics = intel.diagnostics.slice(0, 50);
    }

    function unixToMs(value) {
        const n = Number(value || 0);
        if (!n) return 0;
        return n < 100_000_000_000 ? n * 1000 : n;
    }

    function freshnessInfo(timestamp, warnSeconds = 180) {
        const ms = typeof timestamp === 'string' ? new Date(timestamp).getTime() : unixToMs(timestamp);
        if (!ms || !Number.isFinite(ms)) return { ageSeconds: Infinity, score: 0, label: 'UNKNOWN', stale: true };
        const ageSeconds = Math.max(0, (Date.now() - ms) / 1000);
        const score = Math.max(0, Math.min(100, 100 - Math.max(0, ageSeconds - 30) * (100 / Math.max(30, warnSeconds * 2))));
        const label = ageSeconds <= 30 ? 'FRESH' : ageSeconds <= 120 ? 'GOOD' : ageSeconds <= warnSeconds ? 'AGING' : 'STALE';
        return { ageSeconds, score, label, stale: ageSeconds > warnSeconds };
    }

    function weav3rRequest(path, params = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(WEAV3R_BASE + path);
            for (const [key, value] of Object.entries(params || {})) {
                if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: url.toString(),
                timeout: 20_000,
                headers: { Accept: 'application/json' },
                onload: response => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`TornW3B HTTP ${response.status}.`));
                        return;
                    }
                    let data;
                    try { data = JSON.parse(response.responseText); }
                    catch { reject(new Error('TornW3B returned invalid JSON.')); return; }
                    if (data?.error) {
                        reject(new Error(data.error?.message || data.error || 'TornW3B API error.'));
                        return;
                    }
                    resolve(data);
                },
                ontimeout: () => reject(new Error('TornW3B request timed out.')),
                onerror: () => reject(new Error('TornW3B network request failed.'))
            });
        });
    }


    const TRAVEL_ONE_WAY_MINUTES = Object.freeze({
        'Mexico':{standard:24,airstrip:17,wlt:12,business:7},
        'Cayman Islands':{standard:33,airstrip:23,wlt:17,business:10},
        'Canada':{standard:39,airstrip:27,wlt:19,business:12},
        'Hawaii':{standard:127,airstrip:89,wlt:63,business:38},
        'United Kingdom':{standard:151,airstrip:106,wlt:75,business:45},
        'Argentina':{standard:158,airstrip:111,wlt:79,business:47},
        'Switzerland':{standard:166,airstrip:116,wlt:83,business:50},
        'Japan':{standard:213,airstrip:149,wlt:107,business:64},
        'China':{standard:229,airstrip:160,wlt:114,business:69},
        'UAE':{standard:257,airstrip:180,wlt:128,business:77},
        'South Africa':{standard:282,airstrip:197,wlt:141,business:85}
    });

    function parseTravelNumber(v){
        const raw=String(v??'').trim().replaceAll(',','').replaceAll('$','').replaceAll('+','');
        if(!raw||raw==='—'||raw==='-')return 0;
        const m=raw.match(/(-?\d+(?:\.\d+)?)\s*([kmb])?/i); if(!m)return 0;
        const n=Number(m[1]),mult=!m[2]?1:m[2].toLowerCase()==='k'?1e3:m[2].toLowerCase()==='m'?1e6:1e9;
        return Number.isFinite(n)?n*mult:0;
    }

    function parseWeav3rTravelStockHtml(html){
        const doc=new DOMParser().parseFromString(String(html||''),'text/html');
        const table=[...doc.querySelectorAll('table')].find(t=>{const x=String(t.textContent||'').toLowerCase();return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');});
        if(!table)throw new Error('TornW3B Travel Stock table was not found.');
        let headers=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());
        if(!headers.length)headers=[...table.querySelectorAll('tr:first-child th')].map(x=>String(x.textContent||'').trim().toLowerCase());
        const find=tests=>headers.findIndex(h=>tests.some(re=>re.test(h)));
        const ci=find([/country/]),ii=find([/^item/,/item/]),si=find([/stock/]),hi=find([/profit.*hr/,/\$\/hr/,/per hour/]);
        const pi=headers.findIndex((h,i)=>/profit/.test(h)&&i!==hi),co=find([/shop.*cost/,/^cost$/,/buy.*price/]),mi=find([/home.*market/,/market.*price/,/^market$/]);
        const out=[];
        for(const tr of [...table.querySelectorAll('tbody tr')]){
            const c=[...tr.querySelectorAll('td')]; if(c.length<4)continue;
            const txt=i=>String(c[i]?.textContent||'').replace(/\s+/g,' ').trim();
            const country=txt(ci>=0?ci:0),itemName=txt(ii>=0?ii:1); if(!country||!itemName)continue;
            const href=c[ii>=0?ii:1]?.querySelector('a[href]')?.getAttribute('href')||'';
            const idm=href.match(/(?:item(?:s)?[\/=]|item_id=)(\d+)/i);
            out.push({
                country,itemId:idm?idm[1]:'',itemName,
                stock:Math.max(0,Math.round(parseTravelNumber(txt(si>=0?si:2)))),
                profit:parseTravelNumber(txt(pi>=0?pi:3)),
                sourceProfitPerHour:parseTravelNumber(txt(hi>=0?hi:4)),
                shopCost:co>=0?Math.max(0,parseTravelNumber(txt(co))):0,
                homeMarket:mi>=0?Math.max(0,parseTravelNumber(txt(mi))):0
            });
        }
        if(!out.length)throw new Error('TornW3B Travel Stock returned no readable item rows.');
        return out;
    }

    function travelHistoryKey(r){return String(r.country||'')+'|'+(asId(r.itemId)||normalizeItemName(r.itemName));}

    function recordTravelSnapshots(db,rows,observedAt=Date.now(),source='TornW3B'){
        const fallbackAt=Number(observedAt)||Date.now();
        const retentionMs=Number(db.travelIntel.settings.historyDays||7)*86400000;
        let inserted=0;

        for(const r of rows){
            const at=Number(r.observedAt||fallbackAt)||fallbackAt;
            const cutoff=Date.now()-retentionMs;
            const k=travelHistoryKey(r);
            const list=Array.isArray(db.travelIntel.history[k])?db.travelIntel.history[k].slice():[];
            list.sort((a,b)=>Number(a.at||0)-Number(b.at||0));

            const last=list[list.length-1];
            const exact=list.find(x=>Number(x.at||0)===at&&String(x.source||'')===String(r.source||source));
            const stock=Number(r.stock||0);
            const shouldAdd=!exact&&(!last||Number(last.stock)!==stock||at-Number(last.at||0)>=300000||at<Number(last.at||0));

            if(shouldAdd){
                list.push({
                    at,
                    stock,
                    profit:Number(r.profit||0),
                    sourceProfitPerHour:Number(r.sourceProfitPerHour||0),
                    shopCost:Number(r.shopCost||0),
                    homeMarket:Number(r.homeMarket||0),
                    source:String(r.source||source)
                });
                inserted++;
            }

            const deduped=[];
            const seen=new Set();
            for(const point of list.sort((x,y)=>Number(x.at||0)-Number(y.at||0))){
                if(Number(point.at||0)<cutoff)continue;
                const sig=Number(point.at||0)+'|'+Number(point.stock||0)+'|'+String(point.source||'');
                if(seen.has(sig))continue;
                seen.add(sig);
                deduped.push(point);
            }
            db.travelIntel.history[k]=deduped.slice(-800);
        }
        return inserted;
    }

    function captureWeav3rTravelStockPage() {
        try {
            const rows = parseWeav3rTravelStockHtml(document.documentElement.outerHTML);
            const payload = writeTravelFeed({ capturedAt: Date.now(), rows });
            return payload.rows.length;
        } catch {
            return 0;
        }
    }

    function installWeav3rTravelCollector() {
        if ((location.hostname !== 'weav3r.dev' && location.hostname !== 'www.weav3r.dev') || !location.pathname.startsWith('/travel-stock')) return;

        let attempts = 0;
        let returned = false;
        let lastCount = 0;
        let stableCaptures = 0;
        let observer = null;

        const maybeReturn = count => {
            if (!count || returned) return false;
            const verify = readTravelFeed();
            if (!verify?.rows?.length || Number(verify.capturedAt || 0) <= 0) return false;

            if (count === lastCount) stableCaptures++;
            else stableCaptures = 1;
            lastCount = count;

            // Require two successful captures so a partially-rendered table is not persisted.
            if (stableCaptures < 2) return false;

            const ret = GM_getValue(TRAVEL_RETURN_KEY, null);
            const requestedAt = Number(ret?.at || 0);
            const returnUrl = String(ret?.url || '');
            if (returnUrl.startsWith('https://www.torn.com/') && Date.now() - requestedAt < 5 * 60 * 1000) {
                returned = true;
                GM_deleteValue(TRAVEL_RETURN_KEY);
                if (observer) observer.disconnect();
                setTimeout(() => { location.href = returnUrl; }, 850);
                return true;
            }
            return false;
        };

        const capture = () => {
            if (returned) return;
            attempts++;
            const count = captureWeav3rTravelStockPage();
            if (count > 0) maybeReturn(count);
            if (!returned && attempts < 90) setTimeout(capture, 1000);
        };

        observer = new MutationObserver(() => {
            if (returned) return;
            const table = [...document.querySelectorAll('table')].find(t => {
                const x=String(t.textContent||'').toLowerCase();
                return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');
            });
            if (table) {
                const count=captureWeav3rTravelStockPage();
                if (count>0) maybeReturn(count);
            }
        });
        observer.observe(document.documentElement,{childList:true,subtree:true});

        setTimeout(capture,700);
        setInterval(() => { if (!returned) captureWeav3rTravelStockPage(); },60_000);
    }


    function readTravelFeed() {
        const raw = GM_getValue(TRAVEL_FEED_KEY, null);
        if (!raw) return null;
        if (typeof raw === 'string') {
            try { return JSON.parse(raw); } catch { return null; }
        }
        return raw && typeof raw === 'object' ? raw : null;
    }

    function writeTravelFeed(payload) {
        const safe = {
            capturedAt: Number(payload?.capturedAt || Date.now()),
            rows: Array.isArray(payload?.rows) ? payload.rows : []
        };
        // JSON string is intentionally used for maximum cross-origin userscript-storage compatibility.
        GM_setValue(TRAVEL_FEED_KEY, JSON.stringify(safe));
        GM_setValue(TRAVEL_CAPTURE_STATUS_KEY, { capturedAt:safe.capturedAt, rows:safe.rows.length, at:Date.now() });
        return safe;
    }

    function fetchWeav3rTravelPage() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:'GET',
                url:'https://weav3r.dev/travel-stock',
                timeout:20000,
                headers:{ Accept:'text/html,application/xhtml+xml' },
                onload:r => {
                    if (r.status < 200 || r.status >= 300) return reject(new Error('TornW3B HTTP '+r.status));
                    const body=String(r.responseText||'');
                    if (/just a moment|challenge-platform|cf-chl/i.test(body)) return reject(new Error('TornW3B Cloudflare challenge blocked direct refresh'));
                    resolve(body);
                },
                ontimeout:()=>reject(new Error('TornW3B direct refresh timed out')),
                onerror:()=>reject(new Error('TornW3B direct refresh network error'))
            });
        });
    }

    function fetchYataTravelExport() {
        return new Promise((resolve,reject)=>{
            GM_xmlhttpRequest({
                method:'GET',
                url:YATA_TRAVEL_URL+'?t='+Date.now(),
                timeout:15000,
                headers:{Accept:'application/json'},
                onload:r=>{
                    if(r.status<200||r.status>=300)return reject(new Error('YATA travel HTTP '+r.status));
                    try{
                        const data=JSON.parse(String(r.responseText||''));
                        if(!data?.stocks||typeof data.stocks!=='object')throw new Error('YATA travel payload is invalid.');
                        resolve(data);
                    }catch(error){reject(error);}
                },
                ontimeout:()=>reject(new Error('YATA travel request timed out.')),
                onerror:()=>reject(new Error('YATA travel network error.'))
            });
        });
    }

    function parseYataTravelExport(payload) {
        const rows=[];
        for(const [code,group] of Object.entries(payload?.stocks||{})){
            const country=YATA_COUNTRIES[String(code).toLowerCase()];
            if(!country||!Array.isArray(group?.stocks))continue;
            const observedAt=Number(group.update||0)>0?Number(group.update)*1000:Date.now();
            for(const item of group.stocks){
                const itemId=asId(item?.id);
                const itemName=String(item?.name||'').trim();
                if(!itemId||!itemName)continue;
                rows.push({
                    country,
                    countryCode:String(code).toLowerCase(),
                    itemId,
                    itemName,
                    stock:Math.max(0,Math.round(Number(item.quantity||0))),
                    shopCost:Math.max(0,Number(item.cost||0)),
                    observedAt,
                    source:'YATA shared abroad stock'
                });
            }
        }
        return rows;
    }

    async function syncYataTravelHistory({silent=true}={}) {
        const payload=await fetchYataTravelExport();
        const rows=parseYataTravelExport(payload);
        if(!rows.length)throw new Error('YATA travel export contained no readable rows.');

        const db=dbLoad();
        const groups=new Map();
        for(const row of rows){
            const code=String(row.countryCode||'');
            const at=Number(row.observedAt||0);
            if(!groups.has(code))groups.set(code,{at,rows:[]});
            groups.get(code).rows.push(row);
        }

        let inserted=0;
        let newestObservation=Number(Date.parse(db.travelIntel.lastYataObservationAt||''))||0;
        const liveByKey=new Map((db.travelIntel.rows||[]).map(r=>[travelHistoryKey(r),r]));

        for(const [code,group] of groups.entries()){
            const previous=Number(db.travelIntel.yataCountryUpdates?.[code]||0);
            const observedAt=Number(group.at||0);
            newestObservation=Math.max(newestObservation,observedAt);

            if(observedAt>previous){
                inserted+=recordTravelSnapshots(db,group.rows,observedAt,'YATA shared abroad stock');
                db.travelIntel.yataCountryUpdates[code]=observedAt;
            }

            for(const yataRow of group.rows){
                const current=liveByKey.get(travelHistoryKey(yataRow));
                if(!current)continue;
                const currentAt=Number(current.stockObservedAt||Date.parse(db.travelIntel.lastSyncAt||'')||0);
                if(observedAt>=currentAt){
                    current.stock=Number(yataRow.stock||0);
                    current.stockObservedAt=observedAt;
                    current.stockSource='YATA';
                    if(!Number(current.shopCost||0)&&Number(yataRow.shopCost||0)>0)current.shopCost=Number(yataRow.shopCost);
                }
            }
        }

        db.travelIntel.lastYataSyncAt=nowIso();
        if(newestObservation>0)db.travelIntel.lastYataObservationAt=new Date(newestObservation).toISOString();
        db.travelIntel.source='TornW3B pricing + YATA shared overseas stock history';
        const resolvedForecasts=resolveTravelForecastOutcomes(db);
        const recordedForecasts=recordTravelForecastPredictions(db);
        if(inserted>0||resolvedForecasts>0||recordedForecasts>0){
            db.travelIntel.diagnostics.unshift({
                at:nowIso(),
                text:'YATA shared history: '+inserted+' new stock observation'+(inserted===1?'':'s')+' across '+groups.size+' countries; '+resolvedForecasts+' forecast outcome'+(resolvedForecasts===1?'':'s')+' resolved; '+recordedForecasts+' forecast snapshot'+(recordedForecasts===1?'':'s')+' recorded.'
            });
            db.travelIntel.diagnostics=db.travelIntel.diagnostics.slice(0,30);
        }
        dbSave(db);

        if(!silent){
            statusText='Shared overseas history refreshed: '+rows.length+' item rows, '+inserted+' new historical observation'+(inserted===1?'':'s')+'.';
            render();
        }
        return {rows:rows.length,inserted,countries:groups.size,newestObservation};
    }

    async function backgroundTravelSample() {
        try {
            const html=await fetchWeav3rTravelPage();
            const rows=parseWeav3rTravelStockHtml(html);
            writeTravelFeed({capturedAt:Date.now(),rows});
            await syncTravelStock({silent:true,force:true});
            return rows.length;
        } catch {
            // Never navigate away during background sampling. Browser-capture fallback
            // remains a manual Update Live Travel Data action.
            return 0;
        }
    }

    async function updateTravelData() {
        statusText='Refreshing TornW3B Travel Stock directly…';
        render();
        try {
            const html=await fetchWeav3rTravelPage();
            const rows=parseWeav3rTravelStockHtml(html);
            writeTravelFeed({capturedAt:Date.now(),rows});
            await syncTravelStock({silent:false,force:true});
            return rows;
        } catch (error) {
            console.warn('[MM CRM] Direct travel refresh unavailable; using same-tab browser capture.', error);
            statusText='Direct TornW3B refresh blocked. Opening live page for same-tab capture…';
            render();
            setTimeout(beginTravelCapture,250);
            return [];
        }
    }

    async function syncTravelStock({silent=false,force=false}={}){
        const db=dbLoad(),last=Date.parse(db.travelIntel.lastSyncAt||'')||0;
        const feed=readTravelFeed();
        const capturedAt=Number(feed?.capturedAt||0);
        const rows=Array.isArray(feed?.rows)?feed.rows:[];
        const feedAge=capturedAt?Date.now()-capturedAt:Infinity;

        if(!force&&last&&Date.now()-last<60000&&db.travelIntel.rows.length)return db.travelIntel.rows;

        if(!rows.length){
            if(!silent){
                statusText='No captured TornW3B Travel Stock data yet. Click Open TornW3B, let the page load, then return to Torn and Refresh Travel Stock.';
                render();
            }
            return db.travelIntel.rows;
        }

        if(capturedAt<=last && db.travelIntel.rows.length){
            if(!silent){
                statusText=feedAge<=10*60*1000
                    ? 'Travel Stock is already using the latest captured TornW3B snapshot.'
                    : 'Travel Stock snapshot is stale. Open TornW3B Travel Stock to capture a newer snapshot.';
                render();
            }
            return db.travelIntel.rows;
        }

        const fresh=dbLoad();
        fresh.travelIntel.rows=rows;
        fresh.travelIntel.lastSyncAt=new Date(capturedAt).toISOString();
        fresh.travelIntel.source='TornW3B Travel Stock browser capture';
        fresh.travelIntel.diagnostics.unshift({at:nowIso(),text:`Travel Stock import: ${rows.length} rows; capture age ${Math.round(feedAge/1000)}s.`});
        fresh.travelIntel.diagnostics=fresh.travelIntel.diagnostics.slice(0,30);
        recordTravelSnapshots(fresh,rows,capturedAt);
        dbSave(fresh);

        if(!silent){
            statusText=`Travel Stock imported: ${rows.length} item routes from TornW3B (${Math.round(feedAge/1000)}s old).`;
            render();
        }
        return rows;
    }


    function resolveTravelTargetTime(value) {
        const raw=String(value||'').trim();
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw))return null;

        // Travel forecasts use Torn City Time (TCT), which is treated as UTC.
        const parts=raw.split(':').map(Number);
        const now=Date.now();
        const d=new Date(now);
        let target=Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            parts[0],
            parts[1],
            0,
            0
        );
        if(target<=now)target+=24*60*60*1000;
        return target;
    }

    function formatTravelTctClock(ms) {
        if(!Number.isFinite(Number(ms))||Number(ms)<=0)return '—';
        const text=new Intl.DateTimeFormat('en-GB',{
            timeZone:'UTC',
            weekday:'short',
            hour:'2-digit',
            minute:'2-digit',
            hour12:false
        }).format(new Date(Number(ms)));
        return text+' TCT';
    }

    function formatTravelLocalClock(ms) {
        if(!Number.isFinite(Number(ms))||Number(ms)<=0)return '—';
        return new Date(Number(ms)).toLocaleString([],{
            weekday:'short',
            hour:'numeric',
            minute:'2-digit'
        })+' local';
    }

    function formatTravelClock(ms, showLocal=true) {
        const tct=formatTravelTctClock(ms);
        if(tct==='—')return tct;
        return showLocal ? tct+' / '+formatTravelLocalClock(ms) : tct;
    }

    function travelHistoryWindow(db,row,hours=TRAVEL_HISTORY_WINDOW_HOURS) {
        const cutoff=Date.now()-Math.max(1,Number(hours)||TRAVEL_HISTORY_WINDOW_HOURS)*60*60*1000;
        return (db.travelIntel.history?.[travelHistoryKey(row)]||[])
            .filter(x=>Number(x.at||0)>=cutoff)
            .slice()
            .sort((a,b)=>Number(a.at||0)-Number(b.at||0));
    }

    function travelRestockProfile24h(db,row) {
        const h=travelHistoryWindow(db,row,TRAVEL_HISTORY_WINDOW_HOURS);
        const depletion=[],restocks=[],restockTimes=[],outageDurations=[];
        const sourceCounts={};
        let availableSamples=0;
        let outageStartedAt=null;
        let lastEmptyAt=null;

        for(const point of h){
            if(Number(point.stock||0)>0)availableSamples++;
            const src=String(point.source||'CRM');
            sourceCounts[src]=(sourceCounts[src]||0)+1;
        }

        for(let i=1;i<h.length;i++){
            const prev=h[i-1],cur=h[i];
            const prevStock=Number(prev.stock||0),curStock=Number(cur.stock||0);
            const mins=(Number(cur.at||0)-Number(prev.at||0))/60000;
            if(!(mins>0))continue;
            const delta=curStock-prevStock;
            if(delta<0)depletion.push((-delta)/mins);

            if(prevStock>0 && curStock<=0){
                outageStartedAt=Number(cur.at||0);
                lastEmptyAt=Number(cur.at||0);
            }
            if(prevStock<=0 && curStock>0){
                if(outageStartedAt!=null){
                    const outage=(Number(cur.at||0)-outageStartedAt)/60000;
                    if(outage>0)outageDurations.push(outage);
                }
                outageStartedAt=null;
            }
            if((prevStock<=0&&curStock>0)||delta>Math.max(5,prevStock*.20)){
                restocks.push(Math.max(curStock,delta,0));
                restockTimes.push(Number(cur.at||0));
            }
        }

        if(h.length && Number(h[h.length-1].stock||0)<=0){
            if(outageStartedAt==null){
                for(let i=h.length-1;i>0;i--){
                    const cur=Number(h[i].stock||0),prev=Number(h[i-1].stock||0);
                    if(cur<=0&&prev>0){
                        outageStartedAt=Number(h[i].at||0);
                        lastEmptyAt=outageStartedAt;
                        break;
                    }
                }
            }
            if(lastEmptyAt==null)lastEmptyAt=Number(h[h.length-1].at||0);
        }

        const intervals=[];
        for(let i=1;i<restockTimes.length;i++){
            const gap=(restockTimes[i]-restockTimes[i-1])/60000;
            if(gap>0)intervals.push(gap);
        }

        const medianInterval=medianNumber(intervals);
        const medianOutage=medianNumber(outageDurations);
        const medianRestock=medianNumber(restocks);
        const depletionRate=medianNumber(depletion);

        let cadenceReliability=0;
        if(intervals.length>=2&&medianInterval>0){
            const band=medianInterval*.20;
            const inside=intervals.filter(v=>Math.abs(v-medianInterval)<=band).length;
            cadenceReliability=Math.round(inside/intervals.length*100);
        }

        let nextRestockAt=null;
        let nextRestockBasis='insufficient-history';

        if(outageStartedAt&&medianOutage>0){
            nextRestockAt=outageStartedAt+medianOutage*60000;
            const cadence=medianInterval>0?medianInterval:Math.max(30,medianOutage*2);
            while(nextRestockAt<=Date.now())nextRestockAt+=cadence*60000;
            nextRestockBasis='shared-stockout-history';
        }else if(restockTimes.length>=2&&medianInterval>0){
            nextRestockAt=restockTimes[restockTimes.length-1]+medianInterval*60000;
            while(nextRestockAt<=Date.now())nextRestockAt+=medianInterval*60000;
            nextRestockBasis='shared-restock-cadence';
        }else if(restockTimes.length===1&&medianOutage>0){
            const cycleGuess=Math.max(medianOutage*2,60);
            nextRestockAt=restockTimes[0]+cycleGuess*60000;
            while(nextRestockAt<=Date.now())nextRestockAt+=cycleGuess*60000;
            nextRestockBasis='single-cycle-fallback';
        }else if(h.length>=4){
            const changeTimes=[];
            for(let i=1;i<h.length;i++){
                if(Number(h[i].stock||0)!==Number(h[i-1].stock||0))changeTimes.push(Number(h[i].at||0));
            }
            const changeGaps=[];
            for(let i=1;i<changeTimes.length;i++){
                const gap=(changeTimes[i]-changeTimes[i-1])/60000;
                if(gap>=1)changeGaps.push(gap);
            }
            const medianChange=medianNumber(changeGaps);
            if(medianChange>0){
                nextRestockAt=Date.now()+Math.max(15,medianChange*2)*60000;
                nextRestockBasis='stock-change-cadence';
            }
        }

        return {
            history:h,
            samples:h.length,
            sourceCounts,
            availableRate:h.length?availableSamples/h.length:0,
            depletionRate,
            medianRestock,
            medianInterval,
            medianOutage,
            restockTimes,
            restockCount:restockTimes.length,
            outageDurations,
            activeOutageStartedAt:outageStartedAt,
            lastEmptyAt,
            cadenceReliability,
            nextRestockAt,
            nextRestockBasis
        };
    }

    function travelForecastStatusRank(status) {
        const value=String(status||'open');
        if(value==='resolved')return 3;
        if(value==='unscorable')return 2;
        if(value==='open')return 1;
        return 0;
    }

    function trimTravelForecastLedger(input) {
        const rows=(Array.isArray(input)?input:[])
            .filter(row=>row&&typeof row==='object')
            .map(row=>deepClone(row));
        const open=rows
            .filter(row=>String(row.status||'open')==='open')
            .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
        const closed=rows
            .filter(row=>String(row.status||'open')!=='open')
            .sort((a,b)=>Number(b.resolvedAt||b.observedRestockAt||b.createdAt||0)-Number(a.resolvedAt||a.observedRestockAt||a.createdAt||0));

        const keepOpen=open.slice(0,TRAVEL_FORECAST_LEDGER_MAX);
        const remaining=Math.max(0,TRAVEL_FORECAST_LEDGER_MAX-keepOpen.length);
        return [...keepOpen,...closed.slice(0,remaining)]
            .sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
    }

    function normalizeTravelForecastLedger(input) {
        const rows=(Array.isArray(input)?input:[]).map(raw=>{
            const row=raw&&typeof raw==='object'?deepClone(raw):{};
            if(row.actualRestockAt!=null&&row.observedRestockAt==null)row.observedRestockAt=Number(row.actualRestockAt)||null;
            if(row.actualRestockSize!=null&&row.observedRestockSize==null)row.observedRestockSize=Number(row.actualRestockSize)||0;
            if(row.actualRestockSource!=null&&row.observedRestockSource==null)row.observedRestockSource=String(row.actualRestockSource||'');
            delete row.actualRestockAt;
            delete row.actualRestockSize;
            delete row.actualRestockSource;
            row.modelVersion=String(row.modelVersion||'legacy-unversioned');
            row.crmVersion=String(row.crmVersion||'');
            row.status=String(row.status||'open');
            row.sourceObservationAt=Number(row.sourceObservationAt||0)||null;
            row.previousObservationAt=Number(row.previousObservationAt||0)||null;
            row.observedRestockAt=Number(row.observedRestockAt||0)||null;
            row.observationGapMinutes=row.observationGapMinutes==null?null:(Number.isFinite(Number(row.observationGapMinutes))?Number(row.observationGapMinutes):null);
            row.resolutionQuality=row.resolutionQuality||null;
            if(row.status==='resolved'&&!row.resolutionQuality)row.resolutionQuality='legacy-unqualified';
            return row;
        });
        return trimTravelForecastLedger(rows);
    }

    function mergeTravelForecastLedgers(latestLedger,incomingLedger) {
        const byKey=new Map();
        const consider=row=>{
            if(!row||typeof row!=='object')return;
            const key=String(row.signature||row.id||'').trim();
            if(!key)return;
            const candidate=deepClone(row);
            const current=byKey.get(key);
            if(!current){byKey.set(key,candidate);return;}

            const currentRank=travelForecastStatusRank(current.status);
            const candidateRank=travelForecastStatusRank(candidate.status);
            if(candidateRank>currentRank){byKey.set(key,candidate);return;}
            if(candidateRank<currentRank)return;

            const currentAt=Number(current.resolvedAt||current.observedRestockAt||current.yataFetchedAt||current.createdAt||0);
            const candidateAt=Number(candidate.resolvedAt||candidate.observedRestockAt||candidate.yataFetchedAt||candidate.createdAt||0);
            if(candidateAt>=currentAt)byKey.set(key,candidate);
        };
        for(const row of normalizeTravelForecastLedger(latestLedger))consider(row);
        for(const row of normalizeTravelForecastLedger(incomingLedger))consider(row);
        return trimTravelForecastLedger([...byKey.values()]);
    }

    function travelYataHistory(db,row) {
        return (db.travelIntel.history?.[travelHistoryKey(row)]||[])
            .filter(point=>/YATA/i.test(String(point.source||'')))
            .slice()
            .sort((a,b)=>Number(a.at||0)-Number(b.at||0));
    }

    function latestYataObservationAt(db,row) {
        const h=travelYataHistory(db,row);
        return h.length?Number(h[h.length-1].at||0):0;
    }

    function travelYataRestockEvents(db,row) {
        const h=travelYataHistory(db,row);
        const events=[];
        for(let i=1;i<h.length;i++){
            const prev=h[i-1],cur=h[i];
            const previousObservationAt=Number(prev.at||0);
            const observedRestockAt=Number(cur.at||0);
            const gapMs=observedRestockAt-previousObservationAt;
            if(!(previousObservationAt>0&&observedRestockAt>0&&gapMs>0))continue;

            const prevStock=Math.max(0,Number(prev.stock||0));
            const curStock=Math.max(0,Number(cur.stock||0));
            const delta=curStock-prevStock;
            const zeroToPositive=prevStock<=0&&curStock>0;
            const largeJump=delta>Math.max(5,prevStock*.20);
            if(!zeroToPositive&&!largeJump)continue;

            events.push({
                previousObservationAt,
                observedRestockAt,
                observationGapMinutes:gapMs/60000,
                resolutionQuality:gapMs<=TRAVEL_FORECAST_MAX_OBSERVATION_GAP_MS?'continuous':'indeterminate-gap',
                transitionType:zeroToPositive?'zero-to-positive':'large-jump',
                stock:curStock,
                previousStock:prevStock,
                size:Math.max(curStock,delta,0),
                source:String(cur.source||'YATA shared abroad stock')
            });
        }
        return events;
    }

    function resolveTravelForecastOutcomes(db) {
        const ledger=normalizeTravelForecastLedger(db.travelIntel.forecastLedger);
        const cache=new Map();
        let resolved=0;

        for(const forecast of ledger){
            if(String(forecast.status||'open')!=='open')continue;
            const sourceObservationAt=Number(forecast.sourceObservationAt||0);
            if(!(sourceObservationAt>0)){
                forecast.status='unscorable';
                forecast.resolutionQuality='missing-source-baseline';
                forecast.resolvedAt=Date.now();
                continue;
            }

            const key=String(forecast.historyKey||travelHistoryKey(forecast));
            if(!cache.has(key))cache.set(key,travelYataRestockEvents(db,forecast));
            const observed=(cache.get(key)||[]).find(event=>Number(event.observedRestockAt||0)>sourceObservationAt);
            if(!observed)continue;

            const predicted=Number(forecast.predictedRestockAt||0);
            const continuous=String(observed.resolutionQuality||'')==='continuous';
            const errorMinutes=continuous&&predicted>0?(Number(observed.observedRestockAt)-predicted)/60000:null;
            const absoluteErrorMinutes=Number.isFinite(errorMinutes)?Math.abs(errorMinutes):null;

            forecast.status='resolved';
            forecast.previousObservationAt=Number(observed.previousObservationAt||0)||null;
            forecast.observedRestockAt=Number(observed.observedRestockAt||0)||null;
            forecast.observationGapMinutes=Number(observed.observationGapMinutes||0);
            forecast.resolutionQuality=String(observed.resolutionQuality||'indeterminate-gap');
            forecast.transitionType=String(observed.transitionType||'');
            forecast.observedRestockSize=Number(observed.size||0);
            forecast.observedRestockSource=String(observed.source||'YATA shared abroad stock');
            forecast.errorMinutes=Number.isFinite(errorMinutes)?errorMinutes:null;
            forecast.absoluteErrorMinutes=Number.isFinite(absoluteErrorMinutes)?absoluteErrorMinutes:null;
            forecast.hitWithin15m=Number.isFinite(absoluteErrorMinutes)?absoluteErrorMinutes<=15:null;
            forecast.hitWithin30m=Number.isFinite(absoluteErrorMinutes)?absoluteErrorMinutes<=30:null;
            forecast.hitWithin60m=Number.isFinite(absoluteErrorMinutes)?absoluteErrorMinutes<=60:null;
            forecast.hitWithin120m=Number.isFinite(absoluteErrorMinutes)?absoluteErrorMinutes<=120:null;
            forecast.resolvedAt=Date.now();
            resolved++;
        }

        db.travelIntel.forecastLedger=trimTravelForecastLedger(ledger);
        return resolved;
    }

    function travelForecastAnchor(profile,basis,sourceObservationAt) {
        if(profile.activeOutageStartedAt)return Number(profile.activeOutageStartedAt);
        if(profile.restockTimes?.length)return Number(profile.restockTimes[profile.restockTimes.length-1]||0);
        const h=Array.isArray(profile.history)?profile.history:[];
        for(let i=h.length-1;i>0;i--){
            if(Number(h[i].stock||0)!==Number(h[i-1].stock||0))return Number(h[i].at||0);
        }
        if(basis==='stock-change-cadence')return Number(sourceObservationAt||0);
        return 0;
    }

    function recordTravelForecastPredictions(db) {
        const ledger=normalizeTravelForecastLedger(db.travelIntel.forecastLedger);
        let added=0;

        for(const row of db.travelIntel.rows||[]){
            const profile=travelRestockProfile24h(db,row);
            const predictedRestockAt=Number(profile.nextRestockAt||0);
            const basis=String(profile.nextRestockBasis||'insufficient-history');
            if(!(predictedRestockAt>Date.now())||basis==='insufficient-history')continue;

            const sourceObservationAt=latestYataObservationAt(db,row);
            if(!(sourceObservationAt>0))continue;

            const anchorAt=travelForecastAnchor(profile,basis,sourceObservationAt);
            if(!(anchorAt>0))continue;

            const historyKey=travelHistoryKey(row);
            const signature=[historyKey,basis,anchorAt,TRAVEL_FORECAST_MODEL_VERSION].join('|');
            if(ledger.some(item=>String(item.signature||'')===signature))continue;

            ledger.push({
                id:makeId('travel-forecast'),
                signature,
                modelVersion:TRAVEL_FORECAST_MODEL_VERSION,
                crmVersion:VERSION,
                historyKey,
                country:String(row.country||''),
                itemId:asId(row.itemId),
                itemName:String(row.itemName||''),
                createdAt:Date.now(),
                sourceObservationAt,
                predictedRestockAt,
                predictionBasis:basis,
                anchorAt,
                currentStock:Math.max(0,Number(row.stock||0)),
                sampleCount:Number(profile.samples||0),
                restockCycles:Number(profile.restockCount||0),
                cadenceReliability:Number(profile.cadenceReliability||0),
                medianRestockSize:Number(profile.medianRestock||0),
                medianRestockInterval:Number(profile.medianInterval||0),
                medianStockoutDuration:Number(profile.medianOutage||0),
                depletionRate:Number(profile.depletionRate||0),
                availabilityRate:Number(profile.availableRate||0),
                sourceCounts:{...(profile.sourceCounts||{})},
                yataFetchedAt:Date.parse(db.travelIntel.lastYataSyncAt||'')||Date.now(),
                status:'open',
                previousObservationAt:null,
                observedRestockAt:null,
                observationGapMinutes:null,
                resolutionQuality:null,
                transitionType:null,
                observedRestockSize:null,
                observedRestockSource:null,
                errorMinutes:null,
                absoluteErrorMinutes:null,
                hitWithin15m:null,
                hitWithin30m:null,
                hitWithin60m:null,
                hitWithin120m:null,
                resolvedAt:null
            });
            added++;
        }

        db.travelIntel.forecastLedger=trimTravelForecastLedger(ledger);
        return added;
    }

    function travelForecastPerformance(db,country='',itemId='',modelVersion=TRAVEL_FORECAST_MODEL_VERSION) {
        const c=String(country||'');
        const id=asId(itemId);
        const requestedVersion=String(modelVersion||TRAVEL_FORECAST_MODEL_VERSION);
        const scoped=(db.travelIntel.forecastLedger||[]).filter(row=>
            (!c||String(row.country||'')===c)&&
            (!id||asId(row.itemId)===id)
        );
        const records=scoped.filter(row=>requestedVersion==='*'||String(row.modelVersion||'legacy-unversioned')===requestedVersion);
        const resolved=records.filter(row=>String(row.status||'')==='resolved');
        const scored=resolved.filter(row=>
            String(row.resolutionQuality||'')==='continuous'&&
            row.absoluteErrorMinutes!=null&&
            Number.isFinite(Number(row.absoluteErrorMinutes))
        );
        const absoluteErrors=scored.map(row=>Number(row.absoluteErrorMinutes));
        const mean=absoluteErrors.length?absoluteErrors.reduce((sum,value)=>sum+value,0)/absoluteErrors.length:0;
        const hitRate=minutes=>scored.length?scored.filter(row=>Number(row.absoluteErrorMinutes)<=minutes).length/scored.length:0;

        const byBasis={};
        for(const row of scored){
            const basis=String(row.predictionBasis||'unknown');
            const group=byBasis[basis]||(byBasis[basis]={count:0,errors:[]});
            group.count++;
            group.errors.push(Number(row.absoluteErrorMinutes));
        }
        for(const group of Object.values(byBasis)){
            group.medianAbsoluteErrorMinutes=medianNumber(group.errors);
            group.meanAbsoluteErrorMinutes=group.errors.length?group.errors.reduce((sum,value)=>sum+value,0)/group.errors.length:0;
            delete group.errors;
        }

        const byModelVersion={};
        for(const row of scoped){
            const version=String(row.modelVersion||'legacy-unversioned');
            const group=byModelVersion[version]||(byModelVersion[version]={predictions:0,resolved:0,scored:0,errors:[]});
            group.predictions++;
            if(String(row.status||'')==='resolved')group.resolved++;
            if(String(row.status||'')==='resolved'&&String(row.resolutionQuality||'')==='continuous'&&row.absoluteErrorMinutes!=null&&Number.isFinite(Number(row.absoluteErrorMinutes))){
                group.scored++;
                group.errors.push(Number(row.absoluteErrorMinutes));
            }
        }
        for(const group of Object.values(byModelVersion)){
            group.medianAbsoluteErrorMinutes=medianNumber(group.errors);
            group.meanAbsoluteErrorMinutes=group.errors.length?group.errors.reduce((sum,value)=>sum+value,0)/group.errors.length:0;
            delete group.errors;
        }

        return {
            modelVersion:requestedVersion,
            predictions:records.length,
            resolved:resolved.length,
            scored:scored.length,
            indeterminate:resolved.filter(row=>String(row.resolutionQuality||'')!=='continuous').length,
            unscorable:records.filter(row=>String(row.status||'')==='unscorable').length,
            open:records.filter(row=>String(row.status||'open')==='open').length,
            medianAbsoluteErrorMinutes:medianNumber(absoluteErrors),
            meanAbsoluteErrorMinutes:mean,
            within15m:hitRate(15),
            within30m:hitRate(30),
            within60m:hitRate(60),
            within120m:hitRate(120),
            byBasis,
            byModelVersion,
            stage:scored.length>=20?'meaningful-comparison':scored.length>=10?'usable-calibration':scored.length>=5?'preliminary':'collecting'
        };
    }

    function travelForecastEvaluationSelfTest() {
        const results=[];
        const assert=(name,condition)=>{
            results.push({name,pass:Boolean(condition)});
            if(!condition)throw new Error('Forecast evaluation self-test failed: '+name);
        };
        const base=1_700_000_000_000;
        const makeDb=points=>({
            travelIntel:{
                history:{'Testland|1':points},
                forecastLedger:[],
                rows:[],
                lastYataSyncAt:new Date(base).toISOString()
            }
        });

        const continuousDb=makeDb([
            {at:base,stock:0,source:'YATA shared abroad stock'},
            {at:base+5*60000,stock:100,source:'YATA shared abroad stock'}
        ]);
        const continuousEvent=travelYataRestockEvents(continuousDb,{country:'Testland',itemId:'1'})[0];
        assert('continuous restock classification',continuousEvent?.resolutionQuality==='continuous');

        const gapDb=makeDb([
            {at:base,stock:0,source:'YATA shared abroad stock'},
            {at:base+30*60000,stock:100,source:'YATA shared abroad stock'}
        ]);
        const gapEvent=travelYataRestockEvents(gapDb,{country:'Testland',itemId:'1'})[0];
        assert('long-gap restock classification',gapEvent?.resolutionQuality==='indeterminate-gap');

        const resolveDb=makeDb([
            {at:base,stock:0,source:'YATA shared abroad stock'},
            {at:base+5*60000,stock:100,source:'YATA shared abroad stock'}
        ]);
        resolveDb.travelIntel.forecastLedger=[{
            id:'f1',signature:'f1',modelVersion:TRAVEL_FORECAST_MODEL_VERSION,status:'open',
            historyKey:'Testland|1',country:'Testland',itemId:'1',
            sourceObservationAt:base-60000,predictedRestockAt:base+4*60000,createdAt:base+10*60000
        }];
        resolveTravelForecastOutcomes(resolveDb);
        assert('source-time resolution ignores local createdAt skew',resolveDb.travelIntel.forecastLedger[0]?.status==='resolved');
        assert('continuous resolution produces score',Number.isFinite(Number(resolveDb.travelIntel.forecastLedger[0]?.absoluteErrorMinutes)));

        const merged=mergeTravelForecastLedgers(
            [{id:'m1',signature:'same',status:'resolved',resolvedAt:base+100,observedRestockAt:base+100,resolutionQuality:'continuous'}],
            [{id:'m2',signature:'same',status:'open',createdAt:base+200}]
        );
        assert('resolved forecast wins stale cross-tab open copy',merged.length===1&&merged[0].status==='resolved');

        const perfDb=makeDb([]);
        perfDb.travelIntel.forecastLedger=[
            {signature:'p1',modelVersion:TRAVEL_FORECAST_MODEL_VERSION,status:'resolved',resolutionQuality:'continuous',absoluteErrorMinutes:10,country:'Testland',itemId:'1'},
            {signature:'p2',modelVersion:'older-model',status:'resolved',resolutionQuality:'continuous',absoluteErrorMinutes:300,country:'Testland',itemId:'1'},
            {signature:'p3',modelVersion:TRAVEL_FORECAST_MODEL_VERSION,status:'resolved',resolutionQuality:'indeterminate-gap',absoluteErrorMinutes:null,country:'Testland',itemId:'1'}
        ];
        const perf=travelForecastPerformance(perfDb,'Testland','1');
        assert('current model isolation',perf.predictions===2&&perf.scored===1);
        assert('indeterminate outcome excluded from scoring',perf.indeterminate===1&&perf.medianAbsoluteErrorMinutes===10);

        const retentionInput=[];
        for(let i=0;i<TRAVEL_FORECAST_LEDGER_MAX+5;i++){
            retentionInput.push({id:'open-'+i,signature:'open-'+i,status:'open',createdAt:base+i});
        }
        retentionInput.push({id:'closed-old',signature:'closed-old',status:'resolved',createdAt:base-100,resolvedAt:base-50,resolutionQuality:'continuous',absoluteErrorMinutes:1});
        const retained=trimTravelForecastLedger(retentionInput);
        assert('ledger cap preserves newest open forecasts',retained.length===TRAVEL_FORECAST_LEDGER_MAX&&retained.every(row=>row.status==='open'));
        assert('null error is never scored',!travelForecastPerformance({travelIntel:{forecastLedger:[{modelVersion:TRAVEL_FORECAST_MODEL_VERSION,status:'resolved',resolutionQuality:'continuous',absoluteErrorMinutes:null}]}}).scored);

        return {pass:true,modelVersion:TRAVEL_FORECAST_MODEL_VERSION,results};
    }

    function travelPrediction(db,row,arrivalMinutes,carry,targetAt=null){
        const profile=travelRestockProfile24h(db,row);
        const current=Math.max(0,Number(row.stock||0));
        const fresh=freshnessInfo(db.travelIntel.lastSyncAt,600);
        const targetMs=Number(targetAt||0)>Date.now()?Number(targetAt):Date.now()+Math.max(0,Number(arrivalMinutes||0))*60000;
        const horizonMinutes=Math.max(0,(targetMs-Date.now())/60000);

        const result={
            samples:profile.samples,
            model:'TornW3B live snapshot',
            targetAt:targetMs,
            predictedStock:null,
            arrivalChance:null,
            confidence:Math.round(fresh.score*.65),
            depletionPerMinute:profile.depletionRate,
            medianRestockSize:profile.medianRestock,
            medianRestockMinutes:profile.medianInterval,
            medianOutageMinutes:profile.medianOutage,
            nextExpectedRestockAt:profile.nextRestockAt,
            nextExpectedRestockBasis:profile.nextRestockBasis,
            historyWindowHours:TRAVEL_HISTORY_WINDOW_HOURS,
            availabilityRate12h:profile.availableRate,
            historySources:profile.sourceCounts,
            restockCount:profile.restockCount,
            cadenceReliability:profile.cadenceReliability,
            expectedRestocksBeforeTarget:0
        };

        if(profile.samples<4){
            result.arrivalChance=current>0?Math.max(.45,Math.min(.85,fresh.score/100)):.10;
            return result;
        }

        let predicted=current-profile.depletionRate*horizonMinutes;
        let restocksBefore=0;
        if(profile.nextRestockAt&&profile.medianRestock>0){
            const cycleMinutes=profile.medianInterval>0
                ? profile.medianInterval
                : profile.medianOutage>0
                    ? Math.max(profile.medianOutage*2,60)
                    : 0;
            let at=profile.nextRestockAt;
            while(at<=targetMs&&restocksBefore<12){
                predicted+=profile.medianRestock;
                restocksBefore++;
                if(!(cycleMinutes>0))break;
                at+=cycleMinutes*60000;
            }
        }
        predicted=Math.max(0,predicted);

        const sampleConfidence=Math.min(1,profile.samples/48);
        const eventConfidence=Math.min(1,profile.restockTimes.length/4);
        const cadenceConfidence=Math.max(0,Math.min(1,profile.cadenceReliability/100));
        const sharedSamples=Object.entries(profile.sourceCounts||{}).filter(([k])=>/YATA/i.test(k)).reduce((n,[,v])=>n+Number(v||0),0);
        const sharedConfidence=Math.min(1,sharedSamples/24);
        const freshConfidence=Math.max(0,Math.min(1,fresh.score/100));
        const stockRatio=Math.min(1.5,predicted/Math.max(1,carry));
        const chance=Math.max(.02,Math.min(.99,stockRatio*.48+profile.availableRate*.27+sampleConfidence*.15+freshConfidence*.10));

        result.model='24h shared overseas stock history model';
        result.predictedStock=Math.round(predicted);
        result.arrivalChance=chance;
        result.confidence=Math.round((sampleConfidence*.25+eventConfidence*.25+cadenceConfidence*.20+sharedConfidence*.15+freshConfidence*.15)*100);
        result.expectedRestocksBeforeTarget=restocksBefore;
        return result;
    }

    function travelTimedForecastRows(db){
        const targetAt=resolveTravelTargetTime(db.travelIntel.settings.targetTime);
        if(!targetAt)return [];
        const carry=Math.max(1,Number(db.travelIntel.settings.carry||21));

        return (db.travelIntel.rows||[]).map(row=>{
            const pred=travelPrediction(db,row,0,carry,targetAt);
            const stock=pred.predictedStock==null?Number(row.stock||0):Number(pred.predictedStock||0);
            let state='OUT';
            if(stock>=carry)state='IN STOCK';
            else if(stock>0)state='LOW';
            else if(pred.nextExpectedRestockAt&&pred.nextExpectedRestockAt<=targetAt)state='RESTOCK LIKELY';

            return {
                ...row,
                targetAt,
                prediction:pred,
                predictedStock:stock,
                predictedState:state,
                arrivalChance:pred.arrivalChance??0,
                nextExpectedRestockAt:pred.nextExpectedRestockAt
            };
        }).sort((a,b)=>
            Number(b.predictedState==='IN STOCK')-Number(a.predictedState==='IN STOCK')||
            b.arrivalChance-a.arrivalChance||
            b.profit-a.profit
        );
    }

    function travelOpportunityRows(db){
        const st=db.travelIntel.settings,method=st.method,carry=Math.max(1,Number(st.carry||21));
        const targetAt=resolveTravelTargetTime(st.targetTime);
        return (db.travelIntel.rows||[]).map(row=>{
            const mins=Number(TRAVEL_ONE_WAY_MINUTES[row.country]?.[method]||0),pred=travelPrediction(db,row,mins,carry,targetAt);
            const basis=pred.predictedStock==null?Number(row.stock||0):pred.predictedStock,possible=Math.max(0,Math.min(carry,Math.floor(basis)));
            const liveFactor=Number(row.stock||0)>=carry?.85:Number(row.stock||0)>0?.55:.10,chance=pred.arrivalChance==null?liveFactor:pred.arrivalChance;
            const expectedUnits=Math.max(0,Math.min(carry,Math.floor(possible*chance))),expectedProfit=expectedUnits*Math.max(0,Number(row.profit||0)),tripHours=mins>0?(mins*2)/60:0,pph=tripHours>0?expectedProfit/tripHours:0;
            let recommendation='AVOID';
            if(Number(row.profit||0)>0){if(Number(row.stock||0)===0)recommendation='WAIT';else if(possible>=carry&&chance>=.65)recommendation='GO';else if(possible>0&&chance>=.40)recommendation='GO — PARTIAL';else recommendation='HIGH RISK';}
            return {...row,method,carry,arrivalMinutes:mins,prediction:pred,possibleUnits:possible,expectedUnits,expectedProfit,arrivalChance:chance,riskAdjustedProfitPerHour:pph,recommendation};
        }).sort((a,b)=>b.riskAdjustedProfitPerHour-a.riskAdjustedProfitPerHour||b.profit-a.profit);
    }

    function travelBasketRows(db){
        const carry=Math.max(1,Number(db.travelIntel.settings.carry||21)),cashLimit=Math.max(0,Number(db.travelIntel.settings.cash||0)),g={};
        for(const r of travelOpportunityRows(db)){if(r.profit<=0||r.possibleUnits<=0)continue;(g[r.country]||(g[r.country]=[])).push(r);}
        const out=[];
        for(const [country,items] of Object.entries(g)){
            items.sort((a,b)=>b.profit-a.profit);
            let slots=carry,cash=cashLimit,profit=0,cost=0,weighted=0,units=0;const basket=[];
            for(const r of items){
                if(slots<=0)break;let qty=Math.min(slots,r.possibleUnits);
                if(cashLimit>0&&r.shopCost>0)qty=Math.min(qty,Math.floor(cash/r.shopCost));if(qty<=0)continue;
                basket.push({itemName:r.itemName,qty,profitEach:r.profit,shopCost:r.shopCost});slots-=qty;units+=qty;profit+=qty*r.profit;weighted+=qty*r.arrivalChance;
                if(r.shopCost>0){const c=qty*r.shopCost;cost+=c;if(cashLimit>0)cash=Math.max(0,cash-c);}
            }
            const mins=Number(TRAVEL_ONE_WAY_MINUTES[country]?.[db.travelIntel.settings.method]||0),avg=units?weighted/units:0,adjusted=profit*avg,pph=mins>0?adjusted/((mins*2)/60):0;
            if(units)out.push({country,basket,units,slots,profit,cost,avgChance:avg,riskAdjustedProfit:adjusted,riskAdjustedProfitPerHour:pph,arrivalMinutes:mins});
        }
        return out.sort((a,b)=>b.riskAdjustedProfitPerHour-a.riskAdjustedProfitPerHour);
    }

    function saveTravelSettings(root){
        const db=dbLoad(),method=String(root.querySelector('#mm-travel-method')?.value||'standard').toLowerCase();
        db.travelIntel.settings.method=['standard','airstrip','wlt','business'].includes(method)?method:'standard';
        db.travelIntel.settings.carry=Math.max(1,Number(root.querySelector('#mm-travel-carry')?.value||21));
        db.travelIntel.settings.cash=Math.max(0,Number(root.querySelector('#mm-travel-cash')?.value||0));
        const target=String(root.querySelector('#mm-travel-target-time')?.value||'').trim();
        if(target && !/^([01]\d|2[0-3]):[0-5]\d$/.test(target)){
            statusText='Travel target time was not saved because the time value was invalid.';
            render();
            return;
        }
        db.travelIntel.settings.targetTime=target;
        db.travelIntel.settings.selectedCountry=String(root.querySelector('#mm-travel-country')?.value||'').trim();
        db.travelIntel.settings.selectedItemKey=String(root.querySelector('#mm-travel-item')?.value||'').trim();
        db.travelIntel.settings.showLocalTime=Boolean(root.querySelector('#mm-travel-show-local')?.checked);
        dbSave(db);
        statusText=target
            ? 'Travel target saved: '+target+' TCT (UTC). Forecast uses the last 24 hours of shared overseas stock history.'
            : 'Travel settings saved; target time cleared.';
        render();
    }

    function travelRecommendationBadge(v){
        const c={'GO':'background:#1f4a29;color:#c9f4d0;','GO — PARTIAL':'background:#31503a;color:#d9f4df;','WAIT':'background:#5a4319;color:#ffe4a8;','HIGH RISK':'background:#5b3517;color:#ffd0a0;','AVOID':'background:#512323;color:#ffb4b4;'};
        return `<span style="${c[v]||c.AVOID}padding:2px 6px;border-radius:9px;font-size:10px;font-weight:bold;">${escapeHtml(v)}</span>`;
    }


    function travelItemSelectorKey(row) {
        return asId(row?.itemId) || normalizeItemName(row?.itemName || '');
    }

    function travelSelectorState(db) {
        const rows=Array.isArray(db.travelIntel.rows)?db.travelIntel.rows:[];
        const countries=[...new Set(rows.map(r=>String(r.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

        let country=String(db.travelIntel.settings.selectedCountry||'').trim();
        if(!country || !countries.includes(country)) country=countries[0]||'';

        const countryRows=rows
            .filter(r=>String(r.country||'')===country)
            .slice()
            .sort((a,b)=>String(a.itemName||'').localeCompare(String(b.itemName||'')));

        let itemKey=String(db.travelIntel.settings.selectedItemKey||'').trim();
        if(itemKey && !countryRows.some(r=>travelItemSelectorKey(r)===itemKey)) itemKey='';

        return {countries,country,countryRows,itemKey};
    }

    function selectedTravelForecast(db) {
        const state=travelSelectorState(db);
        const targetAt=resolveTravelTargetTime(db.travelIntel.settings.targetTime);
        if(!state.country || !targetAt) return {state,targetAt,row:null};

        const timed=travelTimedForecastRows(db).filter(r=>String(r.country||'')===state.country);
        let row=null;
        if(state.itemKey) row=timed.find(r=>travelItemSelectorKey(r)===state.itemKey)||null;
        if(!row) row=timed[0]||null;
        return {state,targetAt,row};
    }

    function travelCommandHtml(db){
        const st=db.travelIntel.settings;
        const rows=travelOpportunityRows(db);
        const baskets=travelBasketRows(db).slice(0,5);
        const fresh=freshnessInfo(db.travelIntel.lastSyncAt,600);
        const targetAt=resolveTravelTargetTime(st.targetTime);
        const selector=travelSelectorState(db);
        const selected=selectedTravelForecast(db);
        const timed=travelTimedForecastRows(db);

        const countryOptions=selector.countries.length
            ? selector.countries.map(c=>'<option value="'+escapeHtml(c)+'" '+(c===selector.country?'selected':'')+'>'+escapeHtml(c)+'</option>').join('')
            : '<option value="">No countries loaded</option>';

        const itemOptions='<option value="">All items in '+escapeHtml(selector.country||'country')+'</option>'+
            selector.countryRows.map(r=>{
                const key=travelItemSelectorKey(r);
                return '<option value="'+escapeHtml(key)+'" '+(key===selector.itemKey?'selected':'')+'>'+escapeHtml(r.itemName)+'</option>';
            }).join('');

        const showLocal=st.showLocalTime !== false;
        const targetSummary=targetAt
            ? 'Forecast target: <b>'+escapeHtml(formatTravelClock(targetAt,showLocal))+'</b>. Predictor uses the previous <b>24 hours</b> of shared overseas stock observations, depletion and restock events.'
            : 'Enter a target arrival time in <b>Torn Time (TCT / UTC)</b> to predict which items should be in stock and the next expected restock time.';

        const controls=card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">'+
                '<div><b style="font-size:15px;">Travel Command Center</b><div style="font-size:10px;color:#888;">TornW3B pricing + YATA shared overseas stock history + CRM prediction</div></div>'+
                '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button id="mm-travel-capture" style="'+btn(true)+'">Update Live Travel Data</button><button id="mm-travel-history" style="'+btn()+'">Refresh Shared History</button><button id="mm-travel-sync" style="'+btn()+'">Import Last Capture</button></div>'+
            '</div>'+
            '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:7px;">'+
                '<label style="font-size:10px;color:#aaa;">Flight method<select id="mm-travel-method" style="'+inputCss()+'width:100%;"><option value="standard" '+(st.method==='standard'?'selected':'')+'>Standard</option><option value="airstrip" '+(st.method==='airstrip'?'selected':'')+'>Airstrip</option><option value="wlt" '+(st.method==='wlt'?'selected':'')+'>WLT</option><option value="business" '+(st.method==='business'?'selected':'')+'>Business</option></select></label>'+
                '<label style="font-size:10px;color:#aaa;">Carry capacity<input id="mm-travel-carry" type="number" min="1" value="'+Number(st.carry||21)+'" style="'+inputCss()+'width:100%;"></label>'+
                '<label style="font-size:10px;color:#aaa;">Travel cash (0 = unlimited)<input id="mm-travel-cash" type="number" min="0" value="'+Number(st.cash||0)+'" style="'+inputCss()+'width:100%;"></label>'+
                '<label style="font-size:10px;color:#aaa;">Target arrival time (TCT / UTC)<input id="mm-travel-target-time" type="time" value="'+escapeHtml(st.targetTime||'')+'" style="'+inputCss()+'width:100%;"></label>'+
            '</div>'+
            '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:7px;">'+
                '<label style="font-size:10px;color:#aaa;">Country<select id="mm-travel-country" style="'+inputCss()+'width:100%;">'+countryOptions+'</select></label>'+
                '<label style="font-size:10px;color:#aaa;">Item<select id="mm-travel-item" style="'+inputCss()+'width:100%;">'+itemOptions+'</select></label>'+
            '</div>'+
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;"><button id="mm-travel-save" style="'+btn(true)+'">Save / Run Forecast</button><label style="font-size:10px;color:#aaa;"><input id="mm-travel-show-local" type="checkbox" '+(showLocal?'checked':'')+'> Show local time beside TCT</label></div>'+
            '<div style="font-size:10px;color:#888;margin-top:6px;">'+targetSummary+' TornW3B source '+escapeHtml(fresh.label)+(Number.isFinite(fresh.ageSeconds)?' · '+Math.round(fresh.ageSeconds)+'s old':'')+'.<br>Shared history: <b>YATA</b> · last observation '+escapeHtml(formatTravelClock(Date.parse(db.travelIntel.lastYataObservationAt||''),showLocal))+' · last fetch '+escapeHtml(fmtDate(db.travelIntel.lastYataSyncAt))+'.</div>'
        );

        let selectedBody='';
        if(!targetAt){
            selectedBody='<div style="font-size:11px;color:#888;margin-top:5px;">Enter a Target arrival time above, then click Save / Run Forecast.</div>';
        }else if(!selected.row){
            selectedBody='<div style="font-size:11px;color:#888;margin-top:5px;">Choose a country/item after loading current travel data.</div>';
        }else{
            const r=selected.row;
            const color=r.predictedState==='IN STOCK'?'#9fe3a8':r.predictedState==='LOW'?'#ffd18a':r.predictedState==='RESTOCK LIKELY'?'#9fd3ff':'#ff9b9b';
            const nextAt=r.nextExpectedRestockAt;
            const nextDelta=nextAt?Math.max(0,(Number(nextAt)-Date.now())/60000):null;
            const interval=r.prediction.medianRestockMinutes?Number(r.prediction.medianRestockMinutes).toFixed(0)+'m':'—';
            const outage=r.prediction.medianOutageMinutes?Number(r.prediction.medianOutageMinutes).toFixed(0)+'m':'—';
            const basis=String(r.prediction.nextExpectedRestockBasis||'insufficient-history').replaceAll('-',' ');
            const dep=r.prediction.depletionPerMinute?Number(r.prediction.depletionPerMinute).toFixed(2)+'/min':'—';
            selectedBody=
                '<div style="font-size:12px;line-height:1.6;margin-top:5px;">'+
                    '<b style="font-size:14px;">'+escapeHtml(r.country)+' · '+escapeHtml(r.itemName)+'</b> · <span style="color:'+color+';font-weight:bold;">'+escapeHtml(r.predictedState)+'</span><br>'+
                    'Live stock: <b>'+Number(r.stock||0).toLocaleString()+'</b><br>'+
                    'Adjusted target time: <b>'+escapeHtml(formatTravelClock(r.targetAt,showLocal))+'</b><br>'+
                    'Predicted stock at target: <b>'+Number(r.predictedStock||0).toLocaleString()+'</b><br>'+
                    'Availability probability: <b>'+(Number(r.arrivalChance||0)*100).toFixed(0)+'%</b> · Confidence '+Number(r.prediction.confidence||0).toFixed(0)+'%<br>'+
                    'Next predicted restock: <b>'+escapeHtml(formatTravelClock(nextAt,showLocal))+'</b>'+(nextDelta!=null?' · about '+Math.round(nextDelta)+' min from now':'')+'<br>'+
                    'Prediction basis: '+escapeHtml(basis)+' · 24h samples '+Number(r.prediction.samples||0)+' · Restock cycles '+Number(r.prediction.restockCount||0)+' · Cadence reliability '+Number(r.prediction.cadenceReliability||0)+'%<br>'+
                    'History: '+escapeHtml(Object.entries(r.prediction.historySources||{}).map(([k,v])=>k+' '+v).join(' · ')||'local only')+' · Median restock interval '+interval+' · Median stockout '+outage+' · Depletion '+dep+
                '</div>';
        }

        const selectedCard=card('<b>Selected Country / Item Forecast</b>'+selectedBody);

        const performanceRow=selector.itemKey
            ? selector.countryRows.find(r=>travelItemSelectorKey(r)===selector.itemKey)||null
            : null;
        const performance=travelForecastPerformance(db,selector.country,performanceRow?.itemId||'');
        const perfStage=String(performance.stage||'collecting').replaceAll('-',' ');
        const perfScope=performanceRow
            ? selector.country+' · '+String(performanceRow.itemName||performanceRow.itemId||'item')
            : selector.country||'All countries';
        const basisPerf=Object.entries(performance.byBasis||{})
            .map(([name,value])=>escapeHtml(name.replaceAll('-',' '))+': '+Number(value.count||0)+' scored · median '+Math.round(Number(value.medianAbsoluteErrorMinutes||0))+'m')
            .join('<br>');
        const versionPerf=Object.entries(performance.byModelVersion||{})
            .map(([version,value])=>escapeHtml(version)+': '+Number(value.scored||0)+' scored / '+Number(value.predictions||0)+' captured'+(Number(value.scored||0)?' · median '+Math.round(Number(value.medianAbsoluteErrorMinutes||0))+'m':''))
            .join('<br>');
        const performanceCard=card(
            '<b>Forecast Performance — '+escapeHtml(perfScope)+'</b>'+
            '<div style="font-size:10px;color:#aaa;line-height:1.6;margin-top:5px;">'+
                'Current model: <b>'+escapeHtml(performance.modelVersion)+'</b> · Calibration stage: <b>'+escapeHtml(perfStage)+'</b><br>'+
                'Resolved '+performance.resolved+' · Scored '+performance.scored+' · Gap/indeterminate '+performance.indeterminate+' · Open '+performance.open+' · Unscorable '+performance.unscorable+'<br>'+
                'Median absolute error: <b>'+(performance.scored?Math.round(performance.medianAbsoluteErrorMinutes)+'m':'—')+'</b> · Mean '+(performance.scored?Math.round(performance.meanAbsoluteErrorMinutes)+'m':'—')+'<br>'+
                'Within ±15m '+(performance.within15m*100).toFixed(0)+'% · ±30m '+(performance.within30m*100).toFixed(0)+'% · ±60m '+(performance.within60m*100).toFixed(0)+'% · ±120m '+(performance.within120m*100).toFixed(0)+'%'+
                '<details style="margin-top:5px;"><summary style="cursor:pointer;">Breakdown</summary>'+
                    '<div style="margin-top:4px;">'+
                        (basisPerf?'<b>By prediction basis</b><br>'+basisPerf:'Waiting for continuously observed YATA restock outcomes.')+
                        (versionPerf?'<br><b>By model version</b><br>'+versionPerf:'')+
                    '</div>'+
                '</details>'+
            '</div>'
        );

        let forecastRows=timed;
        if(selector.country) forecastRows=forecastRows.filter(r=>String(r.country||'')===selector.country);
        if(selector.itemKey) forecastRows=forecastRows.filter(r=>travelItemSelectorKey(r)===selector.itemKey);

        const forecastBody=!targetAt
            ? '<div style="font-size:11px;color:#888;margin-top:5px;">Enter a Target arrival time above, then click Save / Run Forecast.</div>'
            : forecastRows.length
                ? forecastRows.slice(0,30).map(r=>{
                    const color=r.predictedState==='IN STOCK'?'#9fe3a8':r.predictedState==='LOW'?'#ffd18a':r.predictedState==='RESTOCK LIKELY'?'#9fd3ff':'#ff9b9b';
                    const interval=r.prediction.medianRestockMinutes?Number(r.prediction.medianRestockMinutes).toFixed(0)+'m':'—';
                    const outage=r.prediction.medianOutageMinutes?Number(r.prediction.medianOutageMinutes).toFixed(0)+'m':'—';
                    const basis=String(r.prediction.nextExpectedRestockBasis||'insufficient-history').replaceAll('-',' ');
                    return '<div style="border-top:1px solid #303030;padding:6px 0;font-size:11px;">'+
                        '<b>'+escapeHtml(r.country)+' · '+escapeHtml(r.itemName)+'</b> · <span style="color:'+color+';font-weight:bold;">'+escapeHtml(r.predictedState)+'</span><br>'+
                        'Predicted stock at '+escapeHtml(formatTravelClock(r.targetAt,showLocal))+': <b>'+Number(r.predictedStock||0).toLocaleString()+'</b> · Availability '+(Number(r.arrivalChance||0)*100).toFixed(0)+'% · Confidence '+Number(r.prediction.confidence||0).toFixed(0)+'%<br>'+
                        'Next predicted restock: <b>'+escapeHtml(formatTravelClock(r.nextExpectedRestockAt,showLocal))+'</b> · '+escapeHtml(basis)+' · Median interval '+interval+' · Median stockout '+outage+
                    '</div>';
                }).join('')
                : '<div style="font-size:11px;color:#888;margin-top:5px;">No matching travel forecast rows loaded.</div>';

        const forecast=card('<b>24-Hour Shared Stock Forecast'+(targetAt?' — '+escapeHtml(formatTravelClock(targetAt,showLocal)):'')+'</b>'+forecastBody);

        const countryBaskets=selector.country?baskets.filter(b=>b.country===selector.country):baskets;
        const basketsHtml=card('<b>Trip Basket Optimizer</b>'+
            (countryBaskets.length
                ? countryBaskets.map((b,i)=>'<div style="border-top:'+(i?'1px solid #303030':'0')+';padding:6px 0;font-size:11px;"><b>#'+(i+1)+' '+escapeHtml(b.country)+'</b> · '+b.units+'/'+Number(st.carry||21)+' slots · Risk-adjusted '+money(b.riskAdjustedProfit)+' · <b>'+money(b.riskAdjustedProfitPerHour)+'/hr</b> · Arrival signal '+(b.avgChance*100).toFixed(0)+'%<br>'+b.basket.map(x=>escapeHtml(x.itemName)+' × '+x.qty).join(' · ')+'</div>').join('')
                : '<div style="font-size:11px;color:#888;">No basket available for the selected country yet.</div>')
        );

        return controls+selectedCard+performanceCard+forecast+basketsHtml;
    }

    function normalizeWeavMarketplaceItem(row) {
        return {
            itemId: asId(row?.item_id),
            itemName: String(row?.item_name || `Item ${row?.item_id || ''}`),
            marketPrice: Number(row?.market_price || 0),
            bazaarAverage: Number(row?.bazaar_average || 0),
            lowestPrice: Number(row?.lowest_price || 0),
            totalBazaars: Number(row?.total_bazaars || 0)
        };
    }

    function normalizeWeavListing(row) {
        return {
            itemId: asId(row?.item_id),
            uid: row?.uid == null ? null : String(row.uid),
            sellerId: asId(row?.player_id),
            sellerName: String(row?.player_name || ''),
            quantity: Math.max(0, Number(row?.quantity || 0)),
            price: Math.max(0, Number(row?.price || 0)),
            contentUpdated: unixToMs(row?.content_updated),
            lastChecked: unixToMs(row?.last_checked),
            sponsored: Number(row?.sponsored || 0) === 1
        };
    }

    function ageSeconds(value) {
        const ms = typeof value === 'number' ? Number(value) : Date.parse(value || '');
        return ms > 0 ? Math.max(0, (Date.now() - ms) / 1000) : Infinity;
    }

    function listingAgeSeconds(listing) {
        const checked = Number(listing?.lastChecked || 0);
        const updated = Number(listing?.contentUpdated || 0);
        const best = checked > 0 ? checked : updated;
        return best > 0 ? Math.max(0, (Date.now() - best) / 1000) : Infinity;
    }

    function freshOrganicListings(db, listings) {
        const maxAge = businessRules(db).maxListingAgeSec;
        return (Array.isArray(listings) ? listings : [])
            .filter(x => !x.sponsored && x.price > 0 && x.quantity > 0 && listingAgeSeconds(x) <= maxAge)
            .sort((a,b) => a.price - b.price);
    }

    function medianNumber(values) {
        const rows = (values || []).map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a,b)=>a-b);
        if (!rows.length) return 0;
        const mid = Math.floor(rows.length / 2);
        return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
    }


    function normalizeWeavTrader(row) {
        const rating = row?.rating || {};
        return {
            traderId: asId(row?.player_id),
            traderName: String(row?.player_name || ''),
            price: Math.max(0, Number(row?.price || 0)),
            upvotes: Number(rating.upvotes || 0),
            downvotes: Number(rating.downvotes || 0),
            ratingTotal: Number(rating.total || 0),
            pricelistId: Number(row?.pricelist_id || 0),
            lastTrade: unixToMs(row?.last_trade),
            lastAction: unixToMs(row?.last_action),
            pricelistUpdated: unixToMs(row?.pricelist_updated),
            sponsored: Number(row?.sponsored || 0) === 1
        };
    }

    function updateSupplierObservations(intel, itemId, itemName, listings) {
        for (const listing of listings) {
            if (!listing.sellerId) continue;
            const id = listing.sellerId;
            if (!intel.suppliers[id]) {
                intel.suppliers[id] = {
                    sellerId: id,
                    sellerName: listing.sellerName || id,
                    seenCount: 0,
                    totalQuantityObserved: 0,
                    items: {},
                    firstSeenAt: nowIso(),
                    lastSeenAt: null
                };
            }
            const supplier = intel.suppliers[id];
            supplier.sellerName = listing.sellerName || supplier.sellerName;
            supplier.seenCount += 1;
            supplier.totalQuantityObserved += Number(listing.quantity || 0);
            supplier.lastSeenAt = nowIso();
            if (!supplier.items[itemId]) {
                supplier.items[itemId] = {
                    itemId,
                    itemName,
                    observations: 0,
                    minPrice: 0,
                    lastPrice: 0,
                    maxQtySeen: 0,
                    lastSeenAt: null
                };
            }
            const item = supplier.items[itemId];
            item.observations += 1;
            item.lastPrice = listing.price;
            item.minPrice = !item.minPrice ? listing.price : Math.min(item.minPrice, listing.price);
            item.maxQtySeen = Math.max(item.maxQtySeen, listing.quantity);
            item.lastSeenAt = nowIso();
        }
    }

    function pushIntelHistory(intel, itemId, row) {
        const id = asId(itemId);
        if (!Array.isArray(intel.history[id])) intel.history[id] = [];
        intel.history[id].push({
            at: nowIso(),
            lowestPrice: Number(row.lowestPrice || 0),
            bazaarAverage: Number(row.bazaarAverage || 0),
            marketPrice: Number(row.marketPrice || 0),
            totalBazaars: Number(row.totalBazaars || 0)
        });
        intel.history[id] = intel.history[id].slice(-MARKET_INTEL_HISTORY_MAX);
    }

    async function syncWeavMarketplace(force = false) {
        const db = dbLoad();
        const intel = db.marketIntel;
        if (
            !force &&
            intel.lastGlobalSyncAt &&
            Date.now() - new Date(intel.lastGlobalSyncAt).getTime() < WEAV3R_GLOBAL_TTL_MS &&
            Object.keys(intel.marketplace).length
        ) return Object.values(intel.marketplace);

        const data = await weav3rRequest('/marketplace');
        const generatedAtMs = unixToMs(data?.generated_at) || Date.now();
        const next = {};
        for (const raw of Array.isArray(data?.items) ? data.items : []) {
            const row = normalizeWeavMarketplaceItem(raw);
            if (!row.itemId) continue;
            next[row.itemId] = row;
            pushIntelHistory(intel, row.itemId, row);
        }
        intel.marketplace = next;
        intel.marketplaceGeneratedAt = new Date(generatedAtMs).toISOString();
        intel.lastGlobalSyncAt = nowIso();
        dbSave(db);
        return Object.values(next);
    }

    async function enrichWeavItem(itemId, options = {}) {
        const id = asId(itemId);
        if (!/^\d+$/.test(id)) throw new Error(`Invalid item ID: ${id}`);

        const currentDb = dbLoad();
        const cached = currentDb.marketIntel.details[id];
        if (
            !options.force &&
            cached?.fetchedAt &&
            Date.now() - new Date(cached.fetchedAt).getTime() < WEAV3R_DETAIL_TTL_MS
        ) return cached;

        const [detailResult, traderResult] = await Promise.allSettled([
            weav3rRequest(`/marketplace/${encodeURIComponent(id)}`, { limit: 100 }),
            weav3rRequest(`/marketplace/${encodeURIComponent(id)}/traders`, { limit: 100, sort: 'price' })
        ]);

        const db = dbLoad();
        const intel = db.marketIntel;
        const base = intel.marketplace[id] || {};

        if (detailResult.status === 'fulfilled') {
            const data = detailResult.value;
            const listings = (Array.isArray(data?.listings) ? data.listings : [])
                .map(normalizeWeavListing)
                .filter(x => x.price > 0 && x.quantity > 0)
                .sort((a, b) => a.price - b.price);

            const organic = listings.filter(x => !x.sponsored);
            const generatedAt = unixToMs(data?.generated_at) || Date.now();
            const detail = {
                itemId: id,
                itemName: String(data?.item_name || base.itemName || `Item ${id}`),
                marketPrice: Number(data?.market_price || base.marketPrice || 0),
                bazaarAverage: Number(data?.bazaar_average || base.bazaarAverage || 0),
                generatedAt: new Date(generatedAt).toISOString(),
                fetchedAt: nowIso(),
                listings,
                organicListings: organic
            };
            intel.details[id] = detail;
            updateSupplierObservations(intel, id, detail.itemName, organic);
        } else {
            addIntelDiagnostic(intel, `TornW3B item ${id}: ${detailResult.reason?.message || String(detailResult.reason)}`);
        }

        if (traderResult.status === 'fulfilled') {
            const data = traderResult.value;
            const traders = (Array.isArray(data?.traders) ? data.traders : [])
                .map(normalizeWeavTrader)
                .filter(x => x.price > 0)
                .sort((a, b) => b.price - a.price);
            intel.traders[id] = {
                itemId: id,
                itemName: String(data?.item_name || base.itemName || `Item ${id}`),
                totalCount: Number(data?.total_count || traders.length),
                generatedAt: new Date(unixToMs(data?.generated_at) || Date.now()).toISOString(),
                fetchedAt: nowIso(),
                traders,
                organicTraders: traders.filter(x => !x.sponsored)
            };
        } else {
            addIntelDiagnostic(intel, `TornW3B traders ${id}: ${traderResult.reason?.message || String(traderResult.reason)}`);
        }

        dbSave(db);
        return db.marketIntel.details[id] || null;
    }

    function intelHistoryStats(intel, itemId) {
        const rows = Array.isArray(intel.history[itemId]) ? intel.history[itemId] : [];
        const prices = rows.map(r => Number(r.bazaarAverage || 0)).filter(v => v > 0);
        if (!prices.length) return { samples: 0, median: 0, volatilityPct: 0 };
        const sorted = prices.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
        const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / prices.length;
        return {
            samples: prices.length,
            median,
            volatilityPct: mean ? Math.sqrt(variance) / mean * 100 : 0
        };
    }

    function detailedIntelForItem(db, itemId) {
        const id = asId(itemId);
        const intel = db.marketIntel;
        const base = intel.marketplace[id] || {};
        const detail = intel.details[id] || {};
        const traderData = intel.traders[id] || {};
        const listings = Array.isArray(detail.organicListings) ? detail.organicListings : [];
        const freshListings = freshOrganicListings(db, listings);
        const traderFresh = Boolean(traderData.fetchedAt) &&
            ageSeconds(traderData.fetchedAt) <= businessRules(db).maxListingAgeSec;
        const traders = traderFresh && Array.isArray(traderData.organicTraders) ? traderData.organicTraders : [];

        const cheapest = freshListings[0] || null;
        const topTrader = traders[0] || null;
        const bazaarAverage = Number(detail.bazaarAverage || base.bazaarAverage || 0);
        const marketPrice = Number(detail.marketPrice || base.marketPrice || 0);
        const haircutPct = Number(intel.settings.bazaarExitHaircutPct || 0);
        const bazaarExit = bazaarAverage ? Math.floor(bazaarAverage * (1 - haircutPct / 100)) : 0;
        const itemMarketNet = marketPrice ? Math.floor(marketPrice * (1 - ITEM_MARKET_FEE_RATE)) : 0;
        const traderExit = Number(topTrader?.price || 0);

        const exits = [
            { route: 'Bazaar', value: bazaarExit },
            { route: 'Trader', value: traderExit },
            { route: 'Item Market Net', value: itemMarketNet }
        ].filter(x => x.value > 0).sort((a, b) => b.value - a.value);

        const bestExit = exits[0] || { route: 'Unknown', value: 0 };
        const referenceBuyPrice = Number(base.lowestPrice || 0);
        const buyPrice = Number(cheapest?.price || 0);
        const qty = Number(cheapest?.quantity || 0);
        const profit = buyPrice > 0 && bestExit.value > 0 ? bestExit.value - buyPrice : 0;
        const roiPct = buyPrice > 0 ? profit / buyPrice * 100 : 0;
        const instantProfit = buyPrice > 0 && traderExit > buyPrice ? traderExit - buyPrice : 0;
        const instantRoiPct = buyPrice > 0 ? instantProfit / buyPrice * 100 : 0;
        const listingTimestamp = cheapest?.lastChecked || cheapest?.contentUpdated || 0;
        const fresh = freshnessInfo(
            listingTimestamp ? new Date(listingTimestamp).toISOString() : (detail.generatedAt || intel.marketplaceGeneratedAt),
            businessRules(db).maxListingAgeSec
        );
        const hist = intelHistoryStats(intel, id);

        return {
            id,
            name: String(detail.itemName || base.itemName || `Item ${id}`),
            buyPrice,
            referenceBuyPrice,
            quantity: qty,
            sellerId: cheapest?.sellerId || '',
            sellerName: cheapest?.sellerName || '',
            sponsoredCheapest: Boolean(cheapest?.sponsored),
            bazaarAverage,
            marketPrice,
            bazaarExit,
            traderExit,
            traderName: topTrader?.traderName || '',
            itemMarketNet,
            bestExit: bestExit.value,
            bestExitRoute: bestExit.route,
            profit,
            roiPct,
            instantProfit,
            instantRoiPct,
            freshness: fresh,
            history: hist,
            listings,
            freshListings,
            listingVerified: Boolean(cheapest),
            listingAgeSeconds: cheapest ? listingAgeSeconds(cheapest) : Infinity,
            traders
        };
    }

    function globalOpportunityRows(db) {
        const intel = db.marketIntel;
        const settings = intel.settings;
        const rules = businessRules(db);
        const generated = intel.marketplaceGeneratedAt;
        const fresh = freshnessInfo(generated, rules.maxListingAgeSec);
        const localMetrics = salesItemMetrics(db);
        const rows = [];

        for (const base of Object.values(intel.marketplace)) {
            const buy = Number(base.lowestPrice || 0);
            const bazaarAverage = Number(base.bazaarAverage || 0);
            const marketPrice = Number(base.marketPrice || 0);
            if (!(buy > 1)) continue;
            if (buy < rules.minPrice) continue;
            if (buy > rules.maxPrice) continue;
            if (Number(base.totalBazaars || 0) < rules.minSellerCount) continue;

            const bazaarExit = bazaarAverage
                ? Math.floor(bazaarAverage * (1 - Number(settings.bazaarExitHaircutPct || 0) / 100))
                : 0;
            const itemMarketNet = marketPrice ? Math.floor(marketPrice * (1 - ITEM_MARKET_FEE_RATE)) : 0;

            const detail = intel.details[base.itemId];
            const trader = intel.traders[base.itemId];
            const organicTrader = trader?.organicTraders?.[0];
            const freshListings = freshOrganicListings(db, detail?.organicListings || []);
            const organicListing = freshListings[0] || null;

            const liveBuy = Number(organicListing?.price || buy);
            const traderExit = Number(organicTrader?.price || 0);
            const exits = [
                { route: 'Bazaar', value: bazaarExit },
                { route: 'Trader', value: traderExit },
                { route: 'Item Market Net', value: itemMarketNet }
            ].filter(x => x.value > 0).sort((a,b) => b.value - a.value);

            const exit = exits[0] || { route: 'Unknown', value: 0 };
            const profit = liveBuy > 0 && exit.value > 0 ? exit.value - liveBuy : 0;
            const roiPct = liveBuy > 0 ? profit / liveBuy * 100 : 0;
            if (roiPct < rules.minRoiPct) continue;
            if (profit < rules.minAbsoluteProfit) continue;

            const personal = localMetrics[base.itemId] || {};
            const personalDaily = Number(personal.sold7d || 0) > 0
                ? Number(personal.sold7d || 0) / 7
                : Number(personal.sold30d || 0) / 30;
            const personalDemandQualified =
                Number(personal.sold30d || 0) >= 5 ||
                Number(personal.saleDays30d || 0) >= 3;
            if (personalDemandQualified && personalDaily < rules.minDemandPerDay) continue;

            const sellerCount = Number(base.totalBazaars || 0);
            const sellerConfidence = Math.min(100, 25 + Math.log10(sellerCount + 1) * 35);
            const history = intelHistoryStats(intel, base.itemId);
            const volatilityPenalty = Math.min(30, history.volatilityPct * 2);
            const roiScore = Math.min(100, roiPct * 8);
            const confidence = Math.max(0, Math.min(100,
                fresh.score * 0.35 +
                sellerConfidence * 0.35 +
                Math.min(100, history.samples * 5) * 0.30
            ));
            const demandScore = personalDemandQualified
                ? Math.min(100, Math.log10(1 + personalDaily * 12) * 55)
                : Math.min(100, sellerCount * 3);
            const score = Math.max(0, Math.min(100,
                roiScore * 0.45 +
                confidence * 0.25 +
                demandScore * 0.20 +
                Math.min(100, sellerCount * 3) * 0.10 -
                volatilityPenalty
            ));

            rows.push({
                id: base.itemId,
                name: base.itemName,
                buyPrice: liveBuy,
                bazaarAverage,
                marketPrice,
                sellerCount,
                traderExit,
                bestExit: exit.value,
                bestExitRoute: exit.route,
                profit,
                roiPct,
                score,
                confidence,
                freshness: fresh,
                history,
                enriched: Boolean(detail),
                listingQty: Number(organicListing?.quantity || 0),
                sellerId: organicListing?.sellerId || '',
                sellerName: organicListing?.sellerName || '',
                listingVerified: Boolean(organicListing),
                listingAgeSeconds: organicListing ? listingAgeSeconds(organicListing) : Infinity,
                personalDemandDaily: personalDaily,
                personalDemandQualified
            });
        }

        return rows.sort((a,b) =>
            Number(b.personalDemandQualified) - Number(a.personalDemandQualified) ||
            b.score - a.score ||
            b.roiPct - a.roiPct ||
            b.personalDemandDaily - a.personalDemandDaily ||
            b.profit - a.profit
        );
    }

    function restockCommandRows(db) {
        const localRows = procurementRows(db).filter(r => r.shortage > 0);
        return localRows.map(local => {
            const detail = detailedIntelForItem(db, local.id);
            const buyPrice = detail.buyPrice || (local.marketSnapshotFresh ? local.bestBuyPrice : 0) || 0;
            const exit = local.marketSnapshotFresh
                ? Number(local.realisticExit || 0)
                : detail.listingVerified
                    ? Number(detail.bestExit || 0)
                    : 0;
            const profit = buyPrice && exit ? exit - buyPrice : 0;
            const roiPct = buyPrice ? profit / buyPrice * 100 : 0;
            const qty = Math.max(0, Math.min(
                local.shortage,
                Number(detail.quantity || (local.marketSnapshotFresh ? local.shortage : 0) || 0)
            ));
            const actionableSource = Boolean(detail.listingVerified || local.marketSnapshotFresh);
            const status = actionableSource && buyPrice > 0 && exit > 0 && local.buyTarget > 0 && buyPrice <= local.buyTarget
                ? 'BUY NOW'
                : buyPrice > 0
                    ? 'WATCH PRICE'
                    : 'SOURCE';
            return {
                ...local,
                globalBuyPrice: buyPrice,
                globalExit: exit,
                globalRoiPct: roiPct,
                sourceQty: qty,
                status,
                sellerId: detail.sellerId || '',
                sellerName: detail.sellerName || '',
                freshness: detail.freshness,
                actionableSource
            };
        }).sort((a,b) =>
            (a.status === 'BUY NOW' ? 0 : a.status === 'WATCH PRICE' ? 1 : 2) -
            (b.status === 'BUY NOW' ? 0 : b.status === 'WATCH PRICE' ? 1 : 2) ||
            a.rank - b.rank ||
            b.daily - a.daily
        );
    }

    function instantArbitrageRows(db) {
        const rows = [];
        for (const itemId of Object.keys(db.marketIntel.details)) {
            const d = detailedIntelForItem(db, itemId);
            if (!(d.buyPrice > 0 && d.traderExit > d.buyPrice)) continue;
            rows.push({
                ...d,
                maxQty: Number(d.quantity || 0),
                totalInstantProfit: Number(d.quantity || 0) * d.instantProfit
            });
        }
        return rows.sort((a,b) =>
            b.instantRoiPct - a.instantRoiPct ||
            b.totalInstantProfit - a.totalInstantProfit
        );
    }

    function sellerBasketRows(db) {
        const opportunityMap = new Map(globalOpportunityRows(db).map(x => [x.id, x]));
        const restockMap = new Map(procurementRows(db).map(x => [x.id, x]));
        const grouped = {};

        for (const [itemId, detail] of Object.entries(db.marketIntel.details)) {
            for (const listing of freshOrganicListings(db, detail?.organicListings || [])) {
                if (!listing.sellerId) continue;
                if (!grouped[listing.sellerId]) {
                    grouped[listing.sellerId] = {
                        sellerId: listing.sellerId,
                        sellerName: listing.sellerName || listing.sellerId,
                        items: [],
                        skus: 0,
                        restockSkus: 0,
                        totalSpend: 0,
                        totalExpectedProfit: 0
                    };
                }
                const basket = grouped[listing.sellerId];
                const opportunity = opportunityMap.get(itemId);
                const local = restockMap.get(itemId);
                const exit = opportunity?.bestExit || detailedIntelForItem(db, itemId).bestExit || 0;
                const neededQty = local?.shortage > 0 ? Math.min(local.shortage, listing.quantity) : Math.min(listing.quantity, 10);
                if (neededQty <= 0) continue;
                const expectedProfit = Math.max(0, (exit - listing.price) * neededQty);
                basket.items.push({
                    itemId,
                    itemName: detail.itemName || opportunity?.name || `Item ${itemId}`,
                    quantity: neededQty,
                    available: listing.quantity,
                    price: listing.price,
                    exit,
                    expectedProfit,
                    restock: Boolean(local?.shortage > 0)
                });
                basket.totalSpend += listing.price * neededQty;
                basket.totalExpectedProfit += expectedProfit;
                basket.skus += 1;
                if (local?.shortage > 0) basket.restockSkus += 1;
            }
        }

        return Object.values(grouped)
            .filter(x => x.items.length)
            .sort((a,b) =>
                b.restockSkus - a.restockSkus ||
                b.totalExpectedProfit - a.totalExpectedProfit ||
                b.skus - a.skus
            );
    }

    function supplierIntelRows(db) {
        return Object.values(db.marketIntel.suppliers).map(s => {
            const itemCount = Object.keys(s.items || {}).length;
            const avgQty = s.seenCount ? s.totalQuantityObserved / s.seenCount : 0;
            const activity = freshnessInfo(s.lastSeenAt, 3600);
            const score = Math.max(0, Math.min(100,
                Math.min(40, itemCount * 8) +
                Math.min(35, Math.log10(Number(s.totalQuantityObserved || 0) + 1) * 18) +
                activity.score * 0.25
            ));
            return { ...s, itemCount, avgQty, score };
        }).sort((a,b) => b.score - a.score);
    }

    function globalCapitalPlan(db) {
        const budget = Math.max(0, Number(db.procurement.settings.procurementBudget || 0));
        let remaining = budget;
        const restocks = restockCommandRows(db)
            .filter(r => r.status === 'BUY NOW' && r.globalBuyPrice > 0 && r.sourceQty > 0);
        const flips = globalOpportunityRows(db)
            .filter(r => r.listingVerified && r.sellerId && r.buyPrice > 0 && r.profit > 0);

        const plan = [];
        for (const r of restocks) {
            if (remaining < r.globalBuyPrice) continue;
            const qty = Math.min(r.sourceQty || r.shortage, Math.floor(remaining / r.globalBuyPrice));
            if (qty <= 0) continue;
            const spend = qty * r.globalBuyPrice;
            plan.push({
                type: 'RESTOCK',
                itemId: r.id,
                itemName: r.name,
                quantity: qty,
                unitPrice: r.globalBuyPrice,
                spend,
                expectedProfit: qty * Math.max(0, r.globalExit - r.globalBuyPrice),
                roiPct: r.globalRoiPct
            });
            remaining -= spend;
        }

        for (const r of flips) {
            if (remaining < r.buyPrice) continue;
            const maxQty = Math.max(1, Math.min(r.listingQty || 1, 25));
            const qty = Math.min(maxQty, Math.floor(remaining / r.buyPrice));
            if (qty <= 0) continue;
            const spend = qty * r.buyPrice;
            plan.push({
                type: 'FLIP',
                itemId: r.id,
                itemName: r.name,
                quantity: qty,
                unitPrice: r.buyPrice,
                spend,
                expectedProfit: qty * r.profit,
                roiPct: r.roiPct
            });
            remaining -= spend;
            if (plan.length >= 20) break;
        }

        return { budget, remaining, plan };
    }

    async function fetchPublicBazaarV1(playerId) {
        return apiRequestV1UserIdSelection(playerId, 'bazaar');
    }

    function bazaarSnapshotFreshness(timestamp, nowMs = Date.now()) {
        const raw = Number(timestamp || 0);
        if (!(raw > 0)) {
            return { fresh:false, ageSeconds:Number.POSITIVE_INFINITY, timestamp:0 };
        }
        const atMs = raw > 1e12 ? raw : raw * 1000;
        const ageSeconds = Math.max(0, (Number(nowMs || Date.now()) - atMs) / 1000);
        return {
            fresh: ageSeconds <= BAZAAR_VERIFY_MAX_AGE_SEC,
            ageSeconds,
            timestamp:raw
        };
    }

    async function verifyBazaarSellerForItem(itemId, sellerId, expectedPrice = 0) {
        const id = asId(itemId);
        const seller = asId(sellerId);
        if (!/^\d+$/.test(id) || !/^\d+$/.test(seller)) {
            return { verified:false, reason:'invalid-id' };
        }

        const data = await fetchPublicBazaarV1(seller);
        const snapshot = bazaarSnapshotFreshness(data?.bazaar_timestamp);
        if (!snapshot.fresh) {
            return {
                verified:false,
                reason:'snapshot-stale',
                sellerId:seller,
                bazaarTimestamp:snapshot.timestamp,
                snapshotAgeSec:snapshot.ageSeconds
            };
        }

        const rows = Array.isArray(data?.bazaar) ? data.bazaar : [];
        const item = rows.find(row => asId(row?.ID ?? row?.id ?? row?.item_id) === id);
        if (!data?.bazaar_is_open) {
            return { verified:false, reason:'bazaar-closed', sellerId:seller, bazaarTimestamp:snapshot.timestamp, snapshotAgeSec:snapshot.ageSeconds };
        }
        if (!item) {
            return { verified:false, reason:'item-gone', sellerId:seller, bazaarTimestamp:snapshot.timestamp, snapshotAgeSec:snapshot.ageSeconds };
        }

        const actualPrice = Math.max(0, Number(item.price || 0));
        const quantity = Math.max(0, Number(item.quantity || item.qty || 0));
        const expected = Math.max(0, Number(expectedPrice || 0));
        const priceChanged = expected > 0 && actualPrice > 0 && actualPrice !== expected;

        return {
            verified:true,
            reason:priceChanged ? 'price-changed' : 'present',
            sellerId:seller,
            itemId:id,
            itemName:String(item.name || ''),
            actualPrice,
            expectedPrice:expected,
            quantity,
            priceChanged,
            bazaarTimestamp:snapshot.timestamp,
            snapshotAgeSec:snapshot.ageSeconds
        };
    }

    async function verifyAndOpenBazaarSeller(itemId, sellerId, expectedPrice = 0) {
        statusText = 'Checking seller Bazaar directly in Torn…';
        render();
        try {
            const result = await verifyBazaarSellerForItem(itemId, sellerId, expectedPrice);
            const db = dbLoad();
            const id = asId(itemId);
            const seller = asId(sellerId);
            const detail = db.marketIntel?.details?.[id];
            if (!result.verified) {
                const disproved = result.reason === 'bazaar-closed' || result.reason === 'item-gone';
                if (detail && disproved) {
                    const keep = row => asId(row?.sellerId) !== seller;
                    detail.organicListings = (detail.organicListings || []).filter(keep);
                    detail.listings = (detail.listings || []).filter(keep);
                    detail.fetchedAt = nowIso();
                    addIntelDiagnostic(db.marketIntel, 'Bazaar recency check removed disproved seller ' + seller + ' for item ' + id + ' (' + result.reason + ').');
                    dbSave(db);
                }
                const reason = result.reason === 'bazaar-closed'
                    ? 'Seller Bazaar is closed.'
                    : result.reason === 'item-gone'
                        ? 'Item is no longer in that Bazaar.'
                        : result.reason === 'snapshot-stale'
                            ? 'Torn Bazaar snapshot is too old to verify safely' + (Number.isFinite(result.snapshotAgeSec) ? ' (' + Math.round(result.snapshotAgeSec) + 's old).' : '.')
                            : 'Listing could not be verified.';
                statusText = disproved
                    ? reason + ' The disproved opportunity was removed locally and was not opened.'
                    : reason + ' Local opportunity data was preserved, but automatic navigation was blocked.';
                render();
                return false;
            }

            if (detail) {
                const previous = (detail.organicListings || []).find(row => asId(row?.sellerId) === seller) || {};
                const verifiedRow = {
                    ...previous,
                    itemId:id,
                    sellerId:seller,
                    sellerName:String(previous.sellerName || seller),
                    price:result.actualPrice,
                    quantity:result.quantity,
                    sponsored:false,
                    lastChecked:Date.now(),
                    contentUpdated:Number(previous.contentUpdated || Date.now())
                };
                const keep = row => asId(row?.sellerId) !== seller;
                detail.organicListings = [verifiedRow, ...(detail.organicListings || []).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
                detail.listings = [verifiedRow, ...(detail.listings || []).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
                detail.fetchedAt = nowIso();
                dbSave(db);
            }

            const dollarNote = result.actualPrice === 1
                ? ' Torn $1 access is buyer-specific; the Bazaar page is the final eligibility check.'
                : '';
            statusText = result.priceChanged
                ? 'Listing still exists, but price changed from ' + money(result.expectedPrice) + ' to ' + money(result.actualPrice) + '. Local cache updated; opening current Bazaar.' + dollarNote
                : 'Listing verified: ' + result.quantity.toLocaleString() + ' available @ ' + money(result.actualPrice) + '. Opening Bazaar.' + dollarNote;
            render();
            navigateFromCRM('https://www.torn.com/bazaar.php?userId=' + encodeURIComponent(sellerId));
            return true;
        } catch (error) {
            statusText = 'Seller Bazaar verification failed: ' + (error?.message || String(error));
            render();
            return false;
        }
    }

    async function fetchWeavPaged(path, key, maxPages = 5, limit = 100) {
        const rows = [];
        for (let page = 1; page <= maxPages; page++) {
            const data = await weav3rRequest(path, { page, limit });
            const batch = Array.isArray(data?.[key]) ? data[key] : [];
            rows.push(...batch);
            if (batch.length < limit) break;
        }
        return rows;
    }


    function normalizeDollarBazaarItem(row) {
        const itemId = asId(row?.itemId ?? row?.item_id ?? row?.id);
        const sellerId = asId(row?.playerId ?? row?.player_id ?? row?.sellerId ?? row?.seller_id);
        const quantity = Math.max(0, Number(row?.quantity ?? row?.qty ?? row?.amount ?? 0));
        const marketPrice = Math.max(0, Number(row?.marketPrice ?? row?.market_price ?? row?.value ?? 0));
        const explicitTotal = Math.max(0, Number(row?.totalValue ?? row?.total_value ?? 0));
        return {
            itemId,
            itemName: String(row?.itemName ?? row?.item_name ?? row?.name ?? ''),
            itemType: String(row?.itemType ?? row?.item_type ?? row?.type ?? ''),
            sellerId,
            sellerName: String(row?.sellerName ?? row?.seller_name ?? row?.playerName ?? row?.player_name ?? ''),
            quantity,
            marketPrice,
            totalValue: explicitTotal || marketPrice * quantity,
            lastUpdated: row?.lastUpdated ?? row?.last_updated ?? row?.last_checked ?? row?.updated_at ?? null,
            source: String(row?.source || 'TornW3B Dollar Bazaars API')
        };
    }

    function normalizeDollarBazaarSeller(row) {
        return {
            sellerId: asId(row?.playerId ?? row?.player_id ?? row?.sellerId ?? row?.seller_id ?? row?.id),
            sellerName: String(row?.name ?? row?.sellerName ?? row?.seller_name ?? row?.playerName ?? row?.player_name ?? ''),
            itemCount: Math.max(0, Number(row?.itemCount ?? row?.item_count ?? row?.items ?? 0)),
            totalMarketValue: Math.max(0, Number(row?.totalMarketValue ?? row?.total_market_value ?? row?.value ?? 0))
        };
    }


    function parseCompactMoney(value) {
        const raw = String(value || '').replaceAll(',', '').trim();
        const match = raw.match(/\$?\s*([\d.]+)\s*([KMBT])?/i);
        if (!match) return 0;
        const n = Number(match[1] || 0);
        const mult = { K:1e3, M:1e6, B:1e9, T:1e12 }[String(match[2] || '').toUpperCase()] || 1;
        return Number.isFinite(n) ? Math.round(n * mult) : 0;
    }

    function dollarPageValueBreakdown(stackValue, quantity) {
        const qty = Math.max(1, Math.round(Number(quantity || 1)));
        const totalValue = Math.max(0, Number(stackValue || 0));
        return {
            marketPrice: totalValue > 0 ? Math.round(totalValue / qty) : 0,
            totalValue
        };
    }

    function fetchWeav3rDollarPage() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:'GET',
                url:'https://weav3r.dev/dollar-bazaars?tab=items&t=' + Date.now(),
                timeout:20000,
                headers:{ Accept:'text/html,application/xhtml+xml' },
                onload:r => {
                    if (r.status < 200 || r.status >= 300) return reject(new Error('TornW3B Dollar Bazaars HTTP ' + r.status));
                    const body = String(r.responseText || '');
                    if (/just a moment|challenge-platform|cf-chl/i.test(body)) {
                        return reject(new Error('TornW3B Cloudflare challenge blocked Dollar Bazaars fallback'));
                    }
                    resolve(body);
                },
                ontimeout:()=>reject(new Error('TornW3B Dollar Bazaars fallback timed out')),
                onerror:()=>reject(new Error('TornW3B Dollar Bazaars fallback network error'))
            });
        });
    }

    function parseWeav3rDollarPageHtml(html) {
        if (typeof DOMParser === 'undefined') throw new Error('DOMParser is unavailable.');
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const items = [];
        const bazaars = [];
        const seenItems = new Set();
        const seenBazaars = new Set();

        for (const tr of doc.querySelectorAll('tr')) {
            const anchors = [...tr.querySelectorAll('a[href]')];
            if (!anchors.length) continue;

            const itemAnchor = anchors.find(a => /\/item\/\d+/i.test(String(a.getAttribute('href') || '')));
            const sellerAnchor = anchors.find(a => /(?:XID|userId)=\d+/i.test(String(a.getAttribute('href') || '')));
            if (!sellerAnchor) continue;

            const sellerHref = String(sellerAnchor.getAttribute('href') || '');
            const sellerMatch = sellerHref.match(/(?:XID|userId)=(\d+)/i);
            const sellerId = asId(sellerMatch?.[1]);
            if (!sellerId) continue;
            const sellerName = String(sellerAnchor.textContent || '')
                .replace(/\s*\[\d+\]\s*$/, '')
                .trim();

            const rowText = String(tr.textContent || '').replace(/\s+/g, ' ').trim();
            const moneyValues = (rowText.match(/\$\s*[\d,.]+(?:\.\d+)?\s*[KMBT]?/gi) || [])
                .map(parseCompactMoney)
                .filter(v => v > 0);
            const value = moneyValues[moneyValues.length - 1] || 0;

            if (itemAnchor) {
                const itemHref = String(itemAnchor.getAttribute('href') || '');
                const itemId = asId(itemHref.match(/\/item\/(\d+)/i)?.[1]);
                if (!itemId) continue;
                const quantity = Math.max(1, Number((rowText.match(/Qty\s*:\s*([\d,]+)/i)?.[1] || '1').replaceAll(',', '')));
                const key = itemId + ':' + sellerId;
                if (seenItems.has(key)) continue;
                seenItems.add(key);

                const itemName = String(itemAnchor.textContent || '').trim();
                const firstCell = tr.querySelector('td');
                const itemType = firstCell
                    ? String(firstCell.textContent || '').replace(itemName, '').replace(/\s+/g,' ').trim()
                    : '';

                const valueBreakdown = dollarPageValueBreakdown(value, quantity);
                items.push({
                    itemId,
                    itemName,
                    itemType,
                    sellerId,
                    sellerName,
                    quantity,
                    marketPrice:valueBreakdown.marketPrice,
                    totalValue:valueBreakdown.totalValue,
                    lastUpdated:nowIso(),
                    source:'TornW3B Dollar Bazaars public page'
                });
                continue;
            }

            const itemCount = Math.max(0, Number((rowText.match(/([\d,]+)\s+items?/i)?.[1] || '0').replaceAll(',', '')));
            if (!itemCount) continue;
            if (seenBazaars.has(sellerId)) continue;
            seenBazaars.add(sellerId);
            bazaars.push({
                sellerId,
                sellerName,
                itemCount,
                totalMarketValue:value
            });
        }

        return { items, bazaars };
    }


    async function syncWeavDollarBazaars() {
        const apiResults = await Promise.allSettled([
            fetchWeavPaged('/dollar-bazaars/items', 'items', 5, 100),
            fetchWeavPaged('/dollar-bazaars/bazaars', 'bazaars', 5, 100)
        ]);

        let itemRows = apiResults[0].status === 'fulfilled' ? apiResults[0].value : [];
        let bazaarRows = apiResults[1].status === 'fulfilled' ? apiResults[1].value : [];
        let fallbackUsed = false;
        let fallbackError = null;

        if (!itemRows.length || !bazaarRows.length) {
            try {
                const html = await fetchWeav3rDollarPage();
                const parsed = parseWeav3rDollarPageHtml(html);
                if (!itemRows.length) itemRows = parsed.items;
                if (!bazaarRows.length) bazaarRows = parsed.bazaars;
                fallbackUsed = Boolean(parsed.items.length || parsed.bazaars.length);
            } catch (error) {
                fallbackError = error;
            }
        }

        const db = dbLoad();
        db.marketIntel.dollarItems = itemRows
            .map(normalizeDollarBazaarItem)
            .filter(row => row.itemId && row.sellerId && row.quantity > 0)
            .sort((a,b) => b.totalValue - a.totalValue || b.marketPrice - a.marketPrice);

        db.marketIntel.dollarBazaars = bazaarRows
            .map(normalizeDollarBazaarSeller)
            .filter(row => row.sellerId);

        if (!db.marketIntel.dollarItems.length && !db.marketIntel.dollarBazaars.length) {
            const apiItemError = apiResults[0].status === 'rejected' ? apiResults[0].reason?.message || String(apiResults[0].reason) : 'empty';
            const apiBazaarError = apiResults[1].status === 'rejected' ? apiResults[1].reason?.message || String(apiResults[1].reason) : 'empty';
            throw new Error(
                '$1 Bazaar sources returned no readable rows. API items: ' + apiItemError +
                '; API bazaars: ' + apiBazaarError +
                (fallbackError ? '; page fallback: ' + (fallbackError?.message || String(fallbackError)) : '')
            );
        }

        if (fallbackUsed) {
            addIntelDiagnostic(db.marketIntel, '$1 Bazaar API fallback used public Dollar Bazaars page: ' +
                db.marketIntel.dollarItems.length + ' item rows, ' +
                db.marketIntel.dollarBazaars.length + ' bazaars.');
        }

        db.marketIntel.lastDollarSyncAt = nowIso();
        dbSave(db);
        return db.marketIntel.dollarItems;
    }

    async function syncWeavRanked() {
        const results = await Promise.allSettled([
            weav3rRequest('/ranked-weapons', { tab: 'weapons', limit: 100, sortField: 'price', sortDirection: 'asc' }),
            weav3rRequest('/ranked-weapons', { tab: 'armor', limit: 100, sortField: 'price', sortDirection: 'asc' }),
            weav3rRequest('/auction/listings', { tab: 'weapons', source: 'auction', limit: 100, sortField: 'endsAt', sortDirection: 'asc' }),
            weav3rRequest('/auction/listings', { tab: 'armor', source: 'auction', limit: 100, sortField: 'endsAt', sortDirection: 'asc' })
        ]);
        const db = dbLoad();
        const intel = db.marketIntel;
        const ranked = [];
        const auctions = [];

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status !== 'fulfilled') {
                addIntelDiagnostic(intel, `Ranked feed ${i + 1}: ${r.reason?.message || String(r.reason)}`);
                continue;
            }
            const rows = Array.isArray(r.value?.weapons) ? r.value.weapons : [];
            for (const row of rows) {
                const normalized = {
                    uid: row?.uid == null ? '' : String(row.uid),
                    itemId: asId(row?.itemId),
                    itemName: String(row?.itemName || ''),
                    weaponType: String(row?.weaponType || ''),
                    rarity: String(row?.rarity || ''),
                    damage: row?.damage ?? null,
                    accuracy: row?.accuracy ?? null,
                    quality: row?.quality ?? null,
                    bonuses: row?.bonuses || null,
                    price: Number(row?.price || 0),
                    sellerId: asId(row?.playerId),
                    sellerName: String(row?.playerName || ''),
                    quantity: Number(row?.quantity || 0),
                    marketPrice: Number(row?.marketPrice || 0),
                    lastUpdated: row?.lastUpdated || null,
                    source: String(row?.source || ''),
                    endsAtUnix: Number(row?.endsAtUnix || 0)
                };
                if (i < 2) ranked.push(normalized);
                else auctions.push(normalized);
            }
        }
        intel.ranked = ranked;
        intel.auctions = auctions;
        intel.lastRankedSyncAt = nowIso();
        dbSave(db);
        return { ranked, auctions };
    }

    async function mapWithConcurrency(items, concurrency, worker) {
        const list = Array.isArray(items) ? items : [];
        const limit = Math.max(1, Math.min(list.length || 1, Number(concurrency || 1)));
        const results = new Array(list.length);
        let nextIndex = 0;

        async function runWorker() {
            while (true) {
                const index = nextIndex++;
                if (index >= list.length) return;
                try {
                    results[index] = { status:'fulfilled', value:await worker(list[index], index) };
                } catch (reason) {
                    results[index] = { status:'rejected', reason };
                }
            }
        }

        await Promise.all(Array.from({ length: limit }, () => runWorker()));
        return results;
    }

    async function enrichTopGlobalOpportunities(maxItems = null) {
        const db = dbLoad();
        const configuredLimit = Math.max(1, Math.min(
            WEAV3R_MAX_ENRICH,
            businessRules(db).marketRefreshLimit
        ));
        const limit = maxItems == null
            ? configuredLimit
            : Math.max(1, Math.min(configuredLimit, Number(maxItems || SMART_REFRESH_ITEM_LIMIT)));
        const rows = globalOpportunityRows(db).slice(0, limit);
        const results = await mapWithConcurrency(
            rows,
            MARKET_ENRICH_CONCURRENCY,
            row => enrichWeavItem(row.id, { force: true })
        );
        let ok = 0;
        for (let index = 0; index < results.length; index++) {
            const result = results[index];
            if (result.status === 'fulfilled') {
                ok++;
                continue;
            }
            const next = dbLoad();
            addIntelDiagnostic(
                next.marketIntel,
                `Enrich ${rows[index]?.name || rows[index]?.id || index + 1}: ${result.reason?.message || String(result.reason)}`
            );
            dbSave(next);
        }
        return { requested: rows.length, ok };
    }

    async function syncMarketIntelligence(full = false, { silent = false, maxItems = null } = {}) {
        if (procurementRunning) return { skipped: true };
        procurementRunning = true;
        if (!silent) {
            statusText = full ? 'Running full global market-intelligence sync…' : 'Refreshing TornW3B global marketplace…';
            render();
        }
        try {
            await syncWeavMarketplace(true);
            const enrichment = await enrichTopGlobalOpportunities(maxItems);
            if (full) {
                await syncWeavDollarBazaars();
                await syncWeavRanked();
            }
            const completedDb = dbLoad();
            completedDb.marketIntel.lastGlobalSyncAt = nowIso();
            dbSave(completedDb);
            if (!silent) {
                statusText = full
                    ? `Market intelligence complete: ${Object.keys(completedDb.marketIntel.marketplace).length.toLocaleString()} items, ${enrichment.ok}/${enrichment.requested} enriched.`
                    : `Global market refreshed: ${Object.keys(completedDb.marketIntel.marketplace).length.toLocaleString()} items, ${enrichment.ok}/${enrichment.requested} enriched.`;
            }
            return { ok: true, enriched: enrichment.ok, requested: enrichment.requested };
        } catch (error) {
            if (!silent) statusText = `Market intelligence failed: ${error?.message || String(error)}`;
            return { ok: false, error: error?.message || String(error) };
        } finally {
            procurementRunning = false;
            if (!silent) render();
        }
    }

    function isDataStale(value, maxAgeMs) {
        const at = Date.parse(value || '') || 0;
        return !at || Date.now() - at > maxAgeMs;
    }

    function businessDataFreshness(db = dbLoad()) {
        return {
            salesAt: getSyncState().lastSuccess ? new Date(getSyncState().lastSuccess).toISOString() : null,
            procurementAt: db.procurement?.lastSyncAt || null,
            marketAt: db.marketIntel?.lastGlobalSyncAt || null,
            dollarAt: db.marketIntel?.lastDollarSyncAt || null,
            travelAt: db.travelIntel?.lastSyncAt || null,
            factionAt: db.factionInventory?.lastSyncAt || null,
            unifiedAt: db.syncState?.lastUnifiedSyncAt || null,
            unifiedError: db.syncState?.lastUnifiedSyncError || null
        };
    }

    function businessRefreshPlan(db = dbLoad(), {
        force = false,
        hasApi = Boolean(getApiKey()),
        hasFactionApi = Boolean(getFactionApiKey()),
        freshness = null
    } = {}) {
        const fresh = freshness || businessDataFreshness(db);
        const rules = businessRules(db);
        const procurementMaxAgeMs = Math.max(
            2 * 60 * 1000,
            Math.min(5 * 60 * 1000, rules.maxListingAgeSec * 1000)
        );
        return {
            sales: hasApi && (force || isDataStale(fresh.salesAt, 60 * 1000)),
            market: force || isDataStale(fresh.marketAt, 3 * 60 * 1000),
            dollar: force || isDataStale(fresh.dollarAt, 2 * 60 * 1000),
            procurement: hasApi && (force || isDataStale(fresh.procurementAt, procurementMaxAgeMs)),
            travel: force || isDataStale(fresh.travelAt, 10 * 60 * 1000),
            faction: hasFactionApi && (force || isDataStale(fresh.factionAt, FACTION_INVENTORY_SYNC_INTERVAL_MS)),
            procurementMaxAgeMs
        };
    }

    async function syncBusinessData({ silent = false, force = false, full = false } = {}) {
        if (unifiedSyncRunning) return { skipped: true, reason: 'running' };

        const effectiveForce = Boolean(force || full);
        const initialDb = dbLoad();
        const initialPlan = businessRefreshPlan(initialDb, { force: effectiveForce });
        const sourceAvailable = {
            sales: Boolean(getApiKey()),
            procurement: Boolean(getApiKey()),
            market: true,
            dollar: true,
            travel: true,
            faction: Boolean(getFactionApiKey())
        };
        const dueKeys = ['sales','market','dollar','procurement','travel','faction']
            .filter(key => sourceAvailable[key] && initialPlan[key]);
        const costBasisDue = acquisitionCoverageBackfillNeeded(initialDb, Boolean(getApiKey()));

        if (!dueKeys.length && !costBasisDue) {
            const cached = ['sales','market','dollar','procurement','travel','faction']
                .filter(key => sourceAvailable[key]);
            if (!silent) {
                statusText = 'Business data ready: cached data still fresh.';
                render();
            }
            return {
                skipped:true,
                reason:'fresh',
                sales:false,
                procurement:false,
                market:false,
                dollar:false,
                travel:false,
                faction:false,
                errors:[],
                cached
            };
        }

        unifiedSyncRunning = true;
        const setRefreshStage = stage => {
            if (silent) return;
            statusText = 'Refreshing business data — ' + stage + '…';
            const status = document.getElementById('mm-status');
            if (status) status.textContent = statusText;
        };
        if (!silent) setRefreshStage('starting');

        const result = { sales:false, procurement:false, market:false, dollar:false, travel:false, faction:false, costBasis:false, costBasisAdded:0, errors:[], warnings:[], stale:[], cached:[] };
        const operationalMarketLimit = full ? null : SMART_REFRESH_ITEM_LIMIT;
        try {
            let workingDb = initialDb;
            let plan = initialPlan;

            if (plan.sales) {
                setRefreshStage('sales');
                try {
                    const r = await sync({ silent:true });
                    result.sales = Boolean(r?.ok);
                    if (r?.error) result.errors.push('Sales: ' + r.error);
                } catch (error) {
                    result.errors.push('Sales: ' + (error?.message || String(error)));
                }
            } else if (getApiKey()) {
                result.cached.push('sales');
            }

            workingDb = dbLoad();
            plan = businessRefreshPlan(workingDb, { force: effectiveForce });
            // Public market intelligence remains usable without personal Torn API
            // access, but aggregate rows never become actionable without freshness
            // and seller-level/official corroboration.
            if (plan.market) {
                setRefreshStage('market');
                const r = await syncMarketIntelligence(full, { silent:true, maxItems:operationalMarketLimit });
                result.market = Boolean(r?.ok);
                // A successful full intelligence sync already refreshed Dollar Bazaars.
                if (full && r?.ok) result.dollar = true;
                if (r?.error) result.errors.push('Market: ' + r.error);
            }

            workingDb = dbLoad();
            plan = businessRefreshPlan(workingDb, { force: effectiveForce });
            if (plan.dollar && !result.dollar) {
                setRefreshStage('$1 Bazaar');
                try {
                    await syncWeavDollarBazaars();
                    result.dollar = true;
                } catch (error) {
                    result.errors.push('$1 Bazaar: ' + (error?.message || String(error)));
                }
            }

            if (getApiKey()) {
                workingDb = dbLoad();
                plan = businessRefreshPlan(workingDb, { force: effectiveForce });
                if (plan.procurement) {
                    setRefreshStage('procurement');
                    const r = await syncProcurement({ silent:true, marketLimit:operationalMarketLimit });
                    result.procurement = Boolean(r?.ok);
                    if (r?.error) result.errors.push('Procurement: ' + r.error);
                }

                if (costBasisDue) {
                    setRefreshStage('cost basis');
                    try {
                        const coverage = await ensureAcquisitionCoverageBackfill();
                        result.costBasis = Boolean(coverage?.ok);
                        result.costBasisAdded = Number(coverage?.added || 0);
                        if (coverage?.truncated) {
                            result.warnings.push('Cost basis: bounded history reached the page limit; older unmatched sales remain partial by design.');
                        }
                    } catch (error) {
                        result.errors.push('Cost basis: ' + (error?.message || String(error)));
                    }
                }
            }

            try {
                const db = dbLoad();
                plan = businessRefreshPlan(db, { force: effectiveForce });
                if (plan.travel) {
                    setRefreshStage('travel');
                    const beforeTravelAt = db.travelIntel?.lastSyncAt || null;
                    await syncTravelStock({ silent:true, force:effectiveForce });
                    const afterTravelAt = dbLoad().travelIntel?.lastSyncAt || null;
                    if (afterTravelAt && afterTravelAt !== beforeTravelAt) {
                        result.travel = true;
                    } else {
                        result.stale.push('travel');
                        result.warnings.push('Travel needs a newer TornW3B capture.');
                    }
                }
            } catch (error) {
                result.errors.push('Travel: ' + (error?.message || String(error)));
            }

            if (getFactionApiKey()) {
                try {
                    const db = dbLoad();
                    plan = businessRefreshPlan(db, { force: effectiveForce });
                    if (plan.faction) {
                        setRefreshStage('faction');
                        const r = await syncFactionInventory({ silent:true, force: effectiveForce });
                        result.faction = !r?.skipped;
                    }
                } catch (error) {
                    result.errors.push('Faction: ' + (error?.message || String(error)));
                }
            }

            const db = dbLoad();
            db.syncState.lastUnifiedSyncAt = nowIso();
            db.syncState.lastUnifiedSyncError = result.errors.length ? result.errors.join('; ') : null;
            dbSave(db);

            if (!silent) {
                const refreshed = ['sales','market','dollar','procurement','travel','faction'].filter(key => result[key]);
                if (result.costBasis) refreshed.push('cost basis');
                const refreshedText = refreshed.length ? refreshed.join(', ') : 'no source required a successful update';
                if (result.errors.length) {
                    statusText = 'Refresh complete with errors: ' + result.errors.join('; ') +
                        (result.warnings.length ? ' Warnings: ' + result.warnings.join('; ') : '');
                } else if (result.warnings.length) {
                    statusText = 'Refresh complete: ' + refreshedText + '. ' + result.warnings.join(' ');
                } else {
                    statusText = 'Business data ready: ' + refreshedText + '.';
                }
                render();
            }
            return result;
        } finally {
            unifiedSyncRunning = false;
        }
    }

    function ensureDataForTab(tab) {
        // Navigation is intentionally read-only. Data refresh occurs only when the
        // operator presses Smart Refresh or a targeted Advanced maintenance action.
        return ['home','stock','deals','customers','reports'].includes(String(tab || ''));
    }


    function businessRules(db = dbLoad()) {
        const rules = db?.businessRules || {};
        return {
            minRoiPct: Math.max(0, Number(rules.minRoiPct || 0)),
            minDemandPerDay: Math.max(0, Number(rules.minDemandPerDay || 0)),
            minPrice: Math.max(0, Number(rules.minPrice || 0)),
            maxPrice: Math.max(Math.max(0, Number(rules.minPrice || 0)), Number(rules.maxPrice || Number.MAX_SAFE_INTEGER)),
            minAbsoluteProfit: Math.max(0, Number(rules.minAbsoluteProfit || 0)),
            minSellerCount: Math.max(0, Math.round(Number(rules.minSellerCount || 0))),
            maxListingAgeSec: Math.max(30, Math.round(Number(rules.maxListingAgeSec || 180))),
            marketRefreshLimit: Math.max(5, Math.min(WEAV3R_MAX_ENRICH, Math.round(Number(rules.marketRefreshLimit || 30))))
        };
    }

    function applyBusinessRules(db, values) {
        const next = { ...db.businessRules };
        for (const [key, raw] of Object.entries(values || {})) {
            if (raw == null || String(raw).trim() === '') continue;
            const value = Number(raw);
            if (Number.isFinite(value) && value >= 0) next[key] = value;
        }
        next.minPrice = Math.max(0, Number(next.minPrice || 0));
        next.maxPrice = Math.max(next.minPrice, Number(next.maxPrice || Number.MAX_SAFE_INTEGER));
        next.minSellerCount = Math.max(0, Math.round(Number(next.minSellerCount || 0)));
        next.maxListingAgeSec = Math.max(30, Math.round(Number(next.maxListingAgeSec || 180)));
        next.marketRefreshLimit = Math.max(5, Math.min(WEAV3R_MAX_ENRICH, Math.round(Number(next.marketRefreshLimit || 30))));
        next.updatedAt = nowIso();
        db.businessRules = next;

        // Compatibility mirrors: old modules remain functional while v7.4 moves all
        // ranking/filtering logic to the CRM-wide business rules.
        db.procurement.settings.marketRefreshLimit = next.marketRefreshLimit;
        db.marketIntel.settings.minRoiPct = next.minRoiPct;
        db.marketIntel.settings.minAbsoluteProfit = next.minAbsoluteProfit;
        db.marketIntel.settings.minMarketPrice = next.minPrice;
        db.marketIntel.settings.maxCandidatePrice = next.maxPrice;
        db.marketIntel.settings.minBazaarSellers = next.minSellerCount;
        db.marketIntel.settings.freshnessWarnSeconds = next.maxListingAgeSec;
        db.marketIntel.settings.maxEnrich = Math.min(WEAV3R_MAX_ENRICH, next.marketRefreshLimit);
        db.operations.settings.strategyPreset = 'CUSTOM';
        return next;
    }

    function saveBusinessRules(values) {
        const db = dbLoad();
        applyBusinessRules(db, values);
        dbSave(db);
        render();
    }

    // ============================================================
    // OPERATIONS + ADVANCED ANALYTICS v6
    // ============================================================

    function salesByItemDetailed(db, itemId) {
        const id = asId(itemId);
        const out = [];
        for (const sale of Object.values(db.sales || {})) {
            for (const item of sale.items || []) {
                if (asId(item.id) !== id) continue;
                out.push({
                    saleId: String(sale.id),
                    timestamp: Number(sale.timestamp || 0),
                    quantity: Number(item.quantity || 0),
                    unitPrice: Number(item.price || 0),
                    total: Number(item.total || 0),
                    customerId: asId(sale.playerId),
                    customerName: String(sale.playerName || sale.playerId || '')
                });
            }
        }
        return out.sort((a,b) => a.timestamp - b.timestamp);
    }

    function dailySeriesForItem(db, itemId, days = 40) {
        const now = Date.now();
        const start = now - days * 86400000;
        const map = new Map();
        for (let i = 0; i < days; i++) {
            const d = new Date(start + i * 86400000);
            map.set(d.toISOString().slice(0,10), 0);
        }
        for (const sale of salesByItemDetailed(db, itemId)) {
            if (sale.timestamp < start) continue;
            const key = new Date(sale.timestamp).toISOString().slice(0,10);
            map.set(key, (map.get(key) || 0) + sale.quantity);
        }
        return [...map.entries()].map(([day, qty]) => ({ day, qty }));
    }

    function weightedDemandForecast(db, itemId) {
        const sales = salesByItemDetailed(db, itemId);
        const now = Date.now();
        const sumWindow = (fromDays, toDays) => sales
            .filter(s => {
                const age = (now - s.timestamp) / 86400000;
                return age >= fromDays && age < toDays;
            })
            .reduce((sum,s) => sum + s.quantity, 0);

        const recent3 = sumWindow(0,3) / 3;
        const prior7 = sumWindow(3,10) / 7;
        const prior30 = sumWindow(10,40) / 30;
        let base = recent3 * 0.50 + prior7 * 0.30 + prior30 * 0.20;

        const weekdayTotals = Array(7).fill(0);
        const weekdayCounts = Array(7).fill(0);
        const cutoff = now - 56 * 86400000;
        for (const s of sales) {
            if (s.timestamp < cutoff) continue;
            const d = new Date(s.timestamp);
            weekdayTotals[d.getDay()] += s.quantity;
        }
        for (let i = 0; i < 56; i++) weekdayCounts[new Date(now - i * 86400000).getDay()]++;
        const weekdayRates = weekdayTotals.map((v,i) => weekdayCounts[i] ? v / weekdayCounts[i] : 0);
        const avgWeekday = weekdayRates.reduce((a,b)=>a+b,0) / 7 || 0;
        const todayRate = weekdayRates[new Date().getDay()] || avgWeekday;
        const weekdayMultiplier = avgWeekday > 0 ? Math.max(0.65, Math.min(1.5, todayRate / avgWeekday)) : 1;

        const activeEvents = (db.operations.events || []).filter(e => {
            const start = new Date(e.startAt || 0).getTime();
            const end = new Date(e.endAt || 0).getTime();
            return start <= now && now <= end;
        });
        const eventMultiplier = activeEvents.reduce((m,e) => m * Math.max(0.1, Number(e.multiplier || 1)), 1);

        const lost = stockoutMetrics(db, itemId, Math.max(base, 0));
        const observedDays = Math.max(1, 30 - lost.stockoutHours / 24);
        const observed30 = sumWindow(0,30);
        const stockoutCorrected30 = observed30 / observedDays;
        if (stockoutCorrected30 > base) base = base * 0.75 + stockoutCorrected30 * 0.25;

        const forecastDaily = Math.max(0, base * weekdayMultiplier * eventMultiplier);
        return {
            forecastDaily,
            recent3,
            prior7,
            prior30,
            weekdayMultiplier,
            eventMultiplier,
            stockoutCorrected30,
            activeEvents
        };
    }

    function recordOperationalSnapshot(db) {
        const proc = db.procurement;
        const at = nowIso();
        const items = {};
        const ids = new Set([
            ...Object.keys(proc.bazaar || {}),
            ...Object.keys(proc.itemMarket || {}),
            ...Object.keys(proc.inventory || {})
        ]);
        for (const id of ids) {
            items[id] = {
                bazaarQty: Number(proc.bazaar[id]?.quantity || 0),
                itemMarketQty: Number(proc.itemMarket[id]?.quantity || 0),
                onHand: Number(proc.inventory[id]?.quantity || 0),
                bazaarPrice: Number(proc.bazaar[id]?.price || 0)
            };
            items[id].stock = items[id].bazaarQty + items[id].itemMarketQty + items[id].onHand;
        }
        db.operations.inventorySnapshots.push({ at, items });
        db.operations.inventorySnapshots = db.operations.inventorySnapshots.slice(-OPS_SNAPSHOT_MAX);
        db.operations.lastSnapshotAt = at;
        return db;
    }

    function stockoutMetrics(db, itemId, expectedDaily = 0) {
        const id = asId(itemId);
        const cutoff = Date.now() - STOCKOUT_LOOKBACK_DAYS * 86400000;
        const snaps = (db.operations.inventorySnapshots || [])
            .filter(s => new Date(s.at).getTime() >= cutoff)
            .sort((a,b) => new Date(a.at) - new Date(b.at));
        let stockoutMs = 0;
        for (let i = 0; i < snaps.length - 1; i++) {
            const a = snaps[i], b = snaps[i+1];
            const stock = Number(a.items?.[id]?.stock || 0);
            if (stock <= 0) stockoutMs += Math.max(0, new Date(b.at).getTime() - new Date(a.at).getTime());
        }
        const stockoutHours = stockoutMs / 3600000;
        const lostUnits = expectedDaily > 0 ? expectedDaily * stockoutHours / 24 : 0;
        return { stockoutHours, lostUnits };
    }

    function demandVolatility(db, itemId) {
        const series = dailySeriesForItem(db, itemId, 30).map(x => x.qty);
        if (!series.length) return { mean: 0, stddev: 0, cv: 0 };
        const mean = series.reduce((s,v)=>s+v,0) / series.length;
        const variance = series.reduce((s,v)=>s+(v-mean)**2,0) / series.length;
        const stddev = Math.sqrt(variance);
        return { mean, stddev, cv: mean > 0 ? stddev / mean : 0 };
    }

    function adaptiveSafetyStock(db, itemId, forecastDaily, avgCost, exitPrice) {
        const vol = demandVolatility(db, itemId);
        const leadHours = Math.max(1, Number(db.operations.settings.defaultLeadHours || 6));
        const leadDays = leadHours / 24;
        const margin = avgCost > 0 && exitPrice > avgCost ? (exitPrice - avgCost) / avgCost : 0;
        const stockoutPenalty = 1 + Math.min(1.5, margin * 4) * Number(db.operations.settings.stockoutPenaltyWeight || 1);
        const variability = 1 + Math.min(2, vol.cv);
        const safetyDays = Math.max(0.5, Math.min(7, leadDays * variability * stockoutPenalty + 0.5));
        return {
            safetyDays,
            units: Math.ceil(forecastDaily * safetyDays),
            leadHours,
            cv: vol.cv
        };
    }

    function fifoLedger(db, itemId) {
        const id = asId(itemId);
        const lots = db.procurement.acquisitions
            .filter(a => asId(a.itemId) === id)
            .map(a => ({
                id: a.id,
                acquiredAt: new Date(a.acquiredAt || 0).getTime(),
                quantity: Number(a.quantity || 0),
                remaining: Number(a.quantity || 0),
                unitCost: Number(a.unitCost || 0),
                source: String(a.source || ''),
                sellerId: asId(a.sellerId || ''),
                sellerName: String(a.sellerName || '')
            }))
            .filter(l => l.quantity > 0)
            .sort((a,b) => a.acquiredAt - b.acquiredAt);

        let realizedCogs = 0;
        let matchedUnits = 0;
        let cursor = 0;
        const saleRows = [];
        for (const sale of salesByItemDetailed(db, id)) {
            let need = sale.quantity;
            let cogs = 0;
            let matched = 0;
            while (need > 0 && cursor < lots.length) {
                const lot = lots[cursor];
                // A sale can only consume lots that existed at the time of sale.
                // Since lots are acquisition-time sorted, a future lot means all
                // later lots are also ineligible for this sale.
                if (lot.acquiredAt > Number(sale.timestamp || 0)) break;
                const take = Math.min(need, lot.remaining);
                cogs += take * lot.unitCost;
                matched += take;
                lot.remaining -= take;
                need -= take;
                if (lot.remaining <= 0) cursor++;
            }
            realizedCogs += cogs;
            matchedUnits += matched;
            const matchedRevenue = sale.quantity > 0
                ? Number(sale.total || 0) * matched / Number(sale.quantity || 1)
                : 0;
            saleRows.push({
                ...sale,
                cogs,
                matchedUnits: matched,
                unmatchedUnits: Math.max(0, Number(sale.quantity || 0) - matched),
                matchedRevenue,
                grossProfit: matchedRevenue - cogs
            });
        }

        const remainingLots = lots.filter(l => l.remaining > 0);
        const remainingCost = remainingLots.reduce((s,l) => s + l.remaining * l.unitCost, 0);
        const remainingQty = remainingLots.reduce((s,l) => s + l.remaining, 0);
        const now = Date.now();
        const aged = remainingLots.map(l => ({
            ...l,
            ageDays: l.acquiredAt ? (now - l.acquiredAt) / 86400000 : 0,
            value: l.remaining * l.unitCost
        }));

        return { lots, remainingLots: aged, remainingCost, remainingQty, realizedCogs, matchedUnits, saleRows };
    }

    function realizedProfitMetrics(db, itemId, days = ANALYTICS_LOOKBACK_DAYS) {
        const ledger = fifoLedger(db, itemId);
        const cutoff = Date.now() - days * 86400000;
        const sales = ledger.saleRows.filter(s => s.timestamp >= cutoff);
        const revenue = sales.reduce((sum,row)=>sum + Number(row.total || 0), 0);
        const matchedRevenue = sales.reduce((sum,row)=>sum + Number(row.matchedRevenue || 0), 0);
        const cogs = sales.reduce((sum,row)=>sum + Number(row.cogs || 0), 0);
        const grossProfit = matchedRevenue - cogs;
        const units = sales.reduce((sum,row)=>sum + Number(row.quantity || 0), 0);
        const matchedUnits = sales.reduce((sum,row)=>sum + Number(row.matchedUnits || 0), 0);
        const unmatchedUnits = Math.max(0, units - matchedUnits);
        const costCoveragePct = units > 0 ? matchedUnits / units * 100 : 100;
        const avgInventoryCost = ledger.remainingCost || cogs / Math.max(1, days / 30);
        const gmroi = avgInventoryCost > 0 ? grossProfit / avgInventoryCost : 0;
        const avgAge = ledger.remainingLots.length
            ? ledger.remainingLots.reduce((sum,lot)=>sum + lot.ageDays * lot.remaining,0) / Math.max(1,ledger.remainingQty)
            : 0;
        const cashVelocity = cogs > 0 ? (grossProfit / cogs) / Math.max(1, avgAge || 1) : 0;
        return {
            revenue,
            matchedRevenue,
            cogs,
            grossProfit,
            units,
            matchedUnits,
            unmatchedUnits,
            costCoveragePct,
            gmroi,
            cashVelocity,
            avgAge,
            ledger
        };
    }

    function priceElasticityMetrics(db, itemId) {
        const id = asId(itemId);
        const history = (db.operations.bazaarPriceHistory[id] || [])
            .map(h => ({ at: new Date(h.at).getTime(), price: Number(h.price || 0), quantity: Number(h.quantity || 0) }))
            .filter(h => h.at && h.price > 0)
            .sort((a,b)=>a.at-b.at);
        if (history.length < 2) return { buckets: [], best: null };

        const sales = salesByItemDetailed(db, id);
        const buckets = new Map();
        for (let i=0;i<history.length;i++) {
            const start = history[i].at;
            const end = history[i+1]?.at || Date.now();
            const days = Math.max(1/24, (end-start)/86400000);
            const qty = sales.filter(s => s.timestamp >= start && s.timestamp < end).reduce((sum,s)=>sum+s.quantity,0);
            const price = history[i].price;
            if (!buckets.has(price)) buckets.set(price,{price,units:0,days:0});
            const b = buckets.get(price); b.units += qty; b.days += days;
        }
        const basis = fifoCostBasis(db, id, '');
        const rows = [...buckets.values()].map(b => {
            const unitsPerDay = b.days ? b.units / b.days : 0;
            const profitPerUnit = basis.avgCost > 0 ? b.price - basis.avgCost : 0;
            return { ...b, unitsPerDay, profitPerUnit, profitPerDay: unitsPerDay * profitPerUnit };
        }).sort((a,b)=>a.price-b.price);
        const best = rows.slice().sort((a,b)=>b.profitPerDay-a.profitPerDay)[0] || null;
        return { buckets: rows, best };
    }

    function itemGrowthRate(db, itemId) {
        const sales = salesByItemDetailed(db, itemId);
        const now = Date.now();
        const sum = (a,b) => sales.filter(s => {
            const age=(now-s.timestamp)/86400000; return age>=a && age<b;
        }).reduce((x,s)=>x+s.quantity,0);
        const recent = sum(0,7);
        const previous = sum(7,14);
        return previous > 0 ? (recent-previous)/previous : (recent>0 ? 1 : 0);
    }

    function advancedInventoryRows(db) {
        const baseRows = procurementRows(db);
        const profitRows = baseRows.map(r => {
            const forecast = weightedDemandForecast(db, r.id);
            const realized = realizedProfitMetrics(db, r.id, 30);
            const safety = adaptiveSafetyStock(db, r.id, forecast.forecastDaily, r.avgCost, r.realisticExit);
            const stockout = stockoutMetrics(db, r.id, forecast.forecastDaily);
            const ledger = realized.ledger;
            const deadDays = Number(db.operations.settings.deadStockDays || DEAD_STOCK_DAYS);
            const deadCapital = ledger.remainingLots.filter(l=>l.ageDays>=deadDays).reduce((s,l)=>s+l.value,0);
            const maxAge = ledger.remainingLots.reduce((m,l)=>Math.max(m,l.ageDays),0);
            const targetStock = Math.ceil(forecast.forecastDaily * Number(db.procurement.settings.targetDays || 5) + safety.units);
            const reorderPoint = Math.ceil(forecast.forecastDaily * (safety.safetyDays + Number(db.operations.settings.defaultLeadHours || 6)/24));
            const shortage = Math.max(0,targetStock-r.stock);
            const listingHours = Number(db.operations.settings.listingHours || DEFAULT_LISTING_HOURS);
            const targetListed = Math.max(0, Math.ceil(forecast.forecastDaily * listingHours/24));
            const addToBazaar = Math.max(0, Math.min(r.onHand, targetListed-r.bazaarQty));
            const overstock = r.stock > targetStock * Number(db.operations.settings.overstockMultiplier || 1.5);
            const growth = itemGrowthRate(db,r.id);
            const elasticity = priceElasticityMetrics(db,r.id);
            const pricingDecision = trustedListingPriceDecision(db,r.id,r,elasticity);
            const plannedPrice = pricingDecision.price;
            const lostProfit = stockout.lostUnits * Math.max(0,(r.realisticExit||plannedPrice)-r.avgCost);

            let state = 'LISTED';
            if (r.stock <= 0 && forecast.forecastDaily > 0) state='OUT OF STOCK';
            else if (deadCapital > 0 && maxAge >= deadDays && forecast.forecastDaily < 0.2) state='DEAD STOCK';
            else if (overstock) state='OVERSTOCKED';
            else if (addToBazaar > 0 && (!(plannedPrice > 0) || pricingDecision.state !== 'TRUSTED')) state='PRICE REVIEW';
            else if (addToBazaar > 0) state='NEEDS LISTING';
            else if (shortage > 0 && r.bestBuyPrice > 0 && r.buyTarget > 0 && r.bestBuyPrice <= r.buyTarget) state='SOURCE NOW';
            else if (shortage > 0) state='WATCH PRICE';
            else if (r.bazaarQty <= 0 && r.onHand > 0) state='RECEIVED';

            return {
                ...r,
                forecastDaily: forecast.forecastDaily,
                forecast,
                safety,
                stockout,
                realized,
                deadCapital,
                maxAge,
                adaptiveTargetStock: targetStock,
                adaptiveReorderPoint: reorderPoint,
                adaptiveShortage: shortage,
                targetListed,
                addToBazaar,
                growth,
                elasticity,
                plannedPrice,
                pricingDecision,
                lostProfit,
                state
            };
        });

        const totalProfit = profitRows.reduce((s,r)=>s+Math.max(0,r.realized.grossProfit),0);
        const sortedByProfit = profitRows.slice().sort((a,b)=>b.realized.grossProfit-a.realized.grossProfit);
        let cumulative=0;
        for (const r of sortedByProfit) {
            cumulative += Math.max(0,r.realized.grossProfit);
            const share = totalProfit>0 ? cumulative/totalProfit : 1;
            r.abc = share <= .70 ? 'A' : share <= .90 ? 'B' : 'C';
        }

        for (const r of profitRows) {
            const found = sortedByProfit.find(x=>x.id===r.id);
            r.abc = found?.abc || 'C';
            if (r.state==='DEAD STOCK') r.inventoryClass='DEAD';
            else if (r.growth > .25 && r.realized.grossProfit > 0) r.inventoryClass='GROWTH';
            else if (r.abc==='A' && r.forecastDaily > .5) r.inventoryClass='CORE';
            else if (r.volatilityPct > 15) r.inventoryClass='SPECULATIVE';
            else r.inventoryClass='OPPORTUNISTIC';
        }
        return profitRows.sort((a,b) => {
            const order={'OUT OF STOCK':0,'SOURCE NOW':1,'PRICE REVIEW':2,'NEEDS LISTING':3,'WATCH PRICE':4,'DEAD STOCK':5,'OVERSTOCKED':6,'RECEIVED':7,'LISTED':8};
            return (order[a.state]??9)-(order[b.state]??9) || b.realized.grossProfit-a.realized.grossProfit;
        });
    }

    function trustedListingPriceDecision(db, itemId, row = null, elasticity = null) {
        const id = asId(itemId);
        row = row || procurementRows(db).find(r => r.id === id) || {};
        elasticity = elasticity || priceElasticityMetrics(db, id);
        const rules = businessRules(db);
        const proc = db.procurement || {};
        const snapshot = proc.marketSnapshots?.[id] || {};
        const detail = db.marketIntel?.details?.[id] || {};
        const freshListings = freshOrganicListings(db, detail.organicListings || []);
        const sales = salesByItemDetailed(db, id)
            .filter(x => Date.now() - Number(x.timestamp || 0) <= 30 * 86400000 && Number(x.unitPrice || 0) > 0);
        const ownSaleMedian = sales.length >= 3 ? medianNumber(sales.map(x => x.unitPrice)) : 0;
        const snapshotFresh = snapshot.fetchedAt && ageSeconds(snapshot.fetchedAt) <= Math.max(300, rules.maxListingAgeSec * 2);
        const itemMarketFresh = Boolean(snapshotFresh && Number(snapshot?.itemMarket?.listings || 0) > 0);

        const signals = [];
        if (itemMarketFresh) {
            const imThirdNet = Math.floor(Number(snapshot?.itemMarket?.third || snapshot?.itemMarket?.median || snapshot?.itemMarket?.lowest || 0) * (1 - ITEM_MARKET_FEE_RATE));
            if (imThirdNet > 0) signals.push({ source:'Torn Item Market net', value:imThirdNet, weight:3 });
        }

        if (freshListings.length) {
            const prices = freshListings.slice(0,5).map(x => Number(x.price || 0)).filter(v => v > 0);
            const bazaarMedian = medianNumber(prices);
            if (bazaarMedian > 0) signals.push({ source:'Fresh seller listings', value:bazaarMedian, weight:4 });
        }
        if (ownSaleMedian > 0) signals.push({ source:'Own 30d sales median', value:ownSaleMedian, weight:4 });
        if (elasticity?.best?.price > 0 && elasticity?.best?.units >= 2) {
            signals.push({ source:'Observed own price performance', value:Number(elasticity.best.price), weight:2 });
        }

        const expanded = [];
        for (const signal of signals) {
            for (let i=0;i<signal.weight;i++) expanded.push(signal.value);
        }
        const anchor = medianNumber(expanded);
        const current = Number(row.bazaarPrice || 0);
        const cost = Number(row.avgCost || fifoCostBasis(db,id,'').avgCost || 0);
        const minMargin = Math.max(Number(db.procurement?.settings?.minMarginPct || 4), rules.minRoiPct) / 100;
        const floor = cost > 0 ? Math.ceil(cost * (1 + minMargin)) : 0;

        if (!(anchor > 0)) {
            return {
                price: current > 0 ? Math.max(floor, current) : 0,
                floor,
                anchor: 0,
                confidence: current > 0 ? 20 : 0,
                state: 'NEEDS MARKET REFRESH',
                source: current > 0 ? 'Current listing only' : 'No trusted live price',
                signalCount: 0,
                marketLow: 0
            };
        }

        const low = freshListings[0]?.price || Number(snapshot?.bazaar?.lowest || snapshot?.itemMarket?.lowest || 0) || 0;
        let candidate = Math.floor(anchor);
        if (low > 0 && low <= anchor * 1.20) candidate = Math.min(candidate, Math.max(1, Math.floor(low - 1)));

        const price = Math.max(floor, candidate);
        const dispersion = signals.length > 1
            ? (Math.max(...signals.map(x=>x.value)) - Math.min(...signals.map(x=>x.value))) / anchor
            : 0.50;
        let confidence = Math.max(0, Math.min(100,
            Math.min(100, signals.length * 22) +
            (itemMarketFresh ? 20 : 0) +
            (freshListings.length ? 20 : 0) +
            (ownSaleMedian > 0 ? 20 : 0) -
            Math.min(40, dispersion * 100)
        ));
        // A single authoritative source can still be actionable. External Bazaar
        // evidence alone requires multiple fresh sellers before it gets the same trust.
        if (itemMarketFresh) confidence = Math.max(confidence, 65);
        if (ownSaleMedian > 0) confidence = Math.max(confidence, 65);
        if (freshListings.length >= 3) confidence = Math.max(confidence, 60);
        confidence = Math.min(100, confidence);

        return {
            price,
            floor,
            anchor,
            confidence,
            state: confidence >= 55 ? 'TRUSTED' : 'LOW CONFIDENCE',
            source: signals.map(x=>x.source).join(' + '),
            signalCount: signals.length,
            marketLow: Number(low || 0)
        };
    }


    function workflowDataTrustSelfTest() {
        const db = defaultDb();
        const id = '1';
        const row = {
            id,
            name: 'Synthetic Item',
            bazaarPrice: 0,
            avgCost: 100,
            realisticExit: 0
        };

        // Regression: a wildly wrong aggregate Bazaar/market value is context only.
        // It must never become the actionable listing price by itself.
        db.marketIntel.marketplace[id] = {
            itemId: id,
            itemName: 'Synthetic Item',
            lowestPrice: 900000,
            bazaarAverage: 1000000,
            marketPrice: 1000000
        };
        const aggregateOnly = trustedListingPriceDecision(db, id, row, { buckets: [], best: null });

        const staleAt = Date.now() - 60 * 60 * 1000;
        db.marketIntel.details[id] = {
            itemId: id,
            itemName: 'Synthetic Item',
            organicListings: [{
                price: 275,
                quantity: 5,
                sponsored: false,
                sellerId: '99',
                sellerName: 'Stale Seller',
                lastChecked: staleAt,
                contentUpdated: staleAt
            }]
        };
        const staleListing = trustedListingPriceDecision(db, id, row, { buckets: [], best: null });

        const now = Date.now();
        db.marketIntel.details[id].organicListings = [{
            price: 275,
            quantity: 5,
            sponsored: false,
            sellerId: '99',
            sellerName: 'Fresh Seller',
            lastChecked: now,
            contentUpdated: now
        }];
        db.procurement.marketSnapshots[id] = {
            fetchedAt: nowIso(),
            bazaar: {},
            itemMarket: { lowest: 280, median: 300, third: 310, listings: 3, totalQty: 30 },
            realisticExit: Math.floor(310 * (1 - ITEM_MARKET_FEE_RATE))
        };
        const trusted = trustedListingPriceDecision(db, id, row, { buckets: [], best: null });

        db.procurement.inventory[id] = { itemId:id, name:'Synthetic Item', quantity:1 };
        db.procurement.marketSnapshots[id] = {
            fetchedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            bazaar: {},
            itemMarket: { lowest: 10000, median: 15000, third: 20000 },
            realisticExit: 19000
        };
        const staleProcurement = procurementRows(db).find(r => r.id === id);

        const marketDb = defaultDb();
        const marketId = '2';
        marketDb.procurement.catalog[marketId] = { id:marketId, name:'Bootstrap Item', type:'Supply', marketValue:20000 };
        marketDb.procurement.inventory[marketId] = { id:marketId, name:'Bootstrap Item', quantity:0 };
        marketDb.marketIntel.marketplace[marketId] = {
            itemId:marketId,
            itemName:'Bootstrap Item',
            lowestPrice:10000,
            bazaarAverage:20000,
            marketPrice:21000,
            totalBazaars:10
        };
        marketDb.procurement.marketSnapshots[marketId] = {
            fetchedAt:nowIso(),
            bazaar:{ lowest:10200, third:20500, median:20000, listings:10, totalQty:80 },
            itemMarket:{ lowest:10000, third:21000, median:20500, listings:15, totalQty:120 },
            realisticExit:20000,
            totalDepth3Pct:100
        };
        const bootstrapProcurement = procurementRows(marketDb).find(r => r.id === marketId);

        const movementNow = Date.now();
        marketDb.procurement.marketHistory[marketId] = [
            { at:new Date(movementNow - 20 * 60 * 1000).toISOString(), realisticExit:20000, depth3Pct:160 },
            { at:new Date(movementNow - 10 * 60 * 1000).toISOString(), realisticExit:20100, depth3Pct:120 },
            { at:new Date(movementNow).toISOString(), realisticExit:20050, depth3Pct:80 }
        ];
        const movementProcurement = procurementRows(marketDb).find(r => r.id === marketId);
        const movementOk =
            Number(movementProcurement?.marketMovementScore || 0) > 0 &&
            Number(movementProcurement?.marketMovementConfidence || 0) > 0 &&
            Number(movementProcurement?.marketDepletionPerHour || 0) > 0;

        const personalDb = defaultDb();
        const personalId = '5';
        const personalNow = Date.now();
        personalDb.procurement.catalog[personalId] = { id:personalId, name:'Personal ROI Item', type:'Supply', marketValue:220 };
        personalDb.procurement.inventory[personalId] = { id:personalId, name:'Personal ROI Item', quantity:0 };
        personalDb.procurement.acquisitions = [{
            id:'personal-lot',
            itemId:personalId,
            itemName:'Personal ROI Item',
            source:'Manual',
            quantity:5,
            unitCost:100,
            acquiredAt:new Date(personalNow - 10 * 86400000).toISOString()
        }];
        personalDb.sales = {
            'personal-sale-1': {
                id:'personal-sale-1', playerId:'1', playerName:'Buyer 1',
                timestamp:personalNow - 3 * 86400000, total:400,
                items:[{ id:personalId, name:'Personal ROI Item', quantity:2, price:200, total:400 }]
            },
            'personal-sale-2': {
                id:'personal-sale-2', playerId:'2', playerName:'Buyer 2',
                timestamp:personalNow - 2 * 86400000, total:400,
                items:[{ id:personalId, name:'Personal ROI Item', quantity:2, price:200, total:400 }]
            },
            'personal-sale-3': {
                id:'personal-sale-3', playerId:'3', playerName:'Buyer 3',
                timestamp:personalNow - 1 * 86400000, total:200,
                items:[{ id:personalId, name:'Personal ROI Item', quantity:1, price:200, total:200 }]
            }
        };
        personalDb.marketIntel.marketplace[personalId] = {
            itemId:personalId,
            itemName:'Personal ROI Item',
            lowestPrice:100,
            bazaarAverage:200,
            marketPrice:220,
            totalBazaars:8
        };
        personalDb.procurement.marketSnapshots[personalId] = {
            fetchedAt:nowIso(),
            bazaar:{ lowest:100, third:205, median:200, listings:8, totalQty:50 },
            itemMarket:{ lowest:105, third:215, median:205, listings:12, totalQty:75 },
            realisticExit:200,
            totalDepth3Pct:80
        };
        const personalProcurement = procurementRows(personalDb).find(r => r.id === personalId);
        const personalRealizedRoiOk =
            personalProcurement?.personalDemandQualified === true &&
            personalProcurement?.personalRoiEvidence === true &&
            personalProcurement?.personalMatchedUnits === 5 &&
            personalProcurement?.personalCostCoveragePct === 100 &&
            Math.abs(Number(personalProcurement?.ownRealizedRoiPct || 0) - 100) < 0.0001 &&
            Number(personalProcurement?.personalWeight || 0) > 0;

        const dollarCamel = normalizeDollarBazaarItem({
            itemId:3,itemName:'Camel Item',itemType:'Other',playerId:99,sellerName:'Camel Seller',
            quantity:2,marketPrice:12345,totalValue:24690,lastUpdated:nowIso()
        });
        const dollarSnake = normalizeDollarBazaarItem({
            item_id:4,item_name:'Snake Item',item_type:'Other',player_id:100,seller_name:'Snake Seller',
            quantity:3,market_price:23456,total_value:70368,last_updated:nowIso()
        });

        const dollarFallbackValue = dollarPageValueBreakdown(148100, 3);
        const dollarFallbackValueOk =
            dollarFallbackValue.totalValue === 148100 &&
            dollarFallbackValue.marketPrice === 49367;

        let workbookOk = false;
        let workbookBytes = 0;
        let workbookStructureOk = false;
        let financialDocumentsOk = false;
        try {
            const exportDb = defaultDb();
            const docs = financialExportDocuments(exportDb);
            const expectedDocs = ['summary','sales','acquisitions','inventory','refunds','customers','procurement'];
            financialDocumentsOk =
                expectedDocs.every(key =>
                    docs?.[key] &&
                    Array.isArray(docs[key].headers) &&
                    docs[key].headers.length > 0 &&
                    Array.isArray(docs[key].rows)
                ) &&
                Object.keys(docs || {}).length === expectedDocs.length;

            const bytes = buildFinancialXlsx(exportDb);
            workbookBytes = Number(bytes?.length || 0);
            const zipText = bytes instanceof Uint8Array
                ? Array.from(bytes, b => String.fromCharCode(b)).join('')
                : '';
            const expectedSheets = ['Summary','Sales','Acquisitions','Inventory Profit','Refunds','Customer Value','Procurement'];
            workbookStructureOk =
                expectedSheets.every(name => zipText.includes('<sheet name="' + name + '"')) &&
                expectedSheets.every((_, index) => zipText.includes('xl/worksheets/sheet' + (index + 1) + '.xml')) &&
                zipText.includes('xl/workbook.xml') &&
                zipText.includes('xl/_rels/workbook.xml.rels') &&
                zipText.includes('xl/styles.xml');

            workbookOk =
                bytes instanceof Uint8Array &&
                bytes.length > 500 &&
                bytes[0] === 0x50 &&
                bytes[1] === 0x4B &&
                bytes[2] === 0x03 &&
                bytes[3] === 0x04 &&
                financialDocumentsOk &&
                workbookStructureOk;
        } catch {}

        const legacy = defaultDb();
        legacy.schema = 10;
        delete legacy.businessRules;
        delete legacy.syncState;
        legacy.customers = {
            '777': { id:'777', name:'Legacy Customer', purchases:2, units:3, spent:123456, firstPurchase:nowIso(), lastPurchase:nowIso() }
        };
        legacy.sales = {
            'legacy-sale': {
                id:'legacy-sale', playerId:'777', playerName:'Legacy Customer', timestamp:Date.now(),
                total:123456, items:[{ id:'3', name:'Camel Item', quantity:1, price:123456, total:123456 }]
            }
        };
        legacy.procurement.acquisitions = [{
            id:'legacy-acq', itemId:'3', itemName:'Camel Item', source:'Manual',
            quantity:2, unitCost:50000, acquiredAt:nowIso()
        }];
        legacy.procurement.settings.marketRefreshLimit = 17;
        legacy.marketIntel.settings.minRoiPct = 7;
        legacy.marketIntel.settings.minMarketPrice = 2500;
        legacy.marketIntel.settings.maxCandidatePrice = 9000000;
        legacy.marketIntel.settings.minBazaarSellers = 4;
        legacy.marketIntel.settings.freshnessWarnSeconds = 240;
        const migrated = normalizeDb(JSON.parse(JSON.stringify(legacy)));
        const migrationOk =
            migrated.schema === 11 &&
            migrated.customers?.['777']?.name === 'Legacy Customer' &&
            migrated.sales?.['legacy-sale']?.playerId === '777' &&
            migrated.procurement?.acquisitions?.[0]?.id === 'legacy-acq' &&
            migrated.businessRules?.minRoiPct === 7 &&
            migrated.businessRules?.minPrice === 2500 &&
            migrated.businessRules?.maxPrice === 9000000 &&
            migrated.businessRules?.minSellerCount === 4 &&
            migrated.businessRules?.maxListingAgeSec === 240 &&
            migrated.businessRules?.marketRefreshLimit === 17;

        const fifoDb = defaultDb();
        const fifoId = '9001';
        const fifoNow = Date.now();
        fifoDb.procurement.acquisitions = [{
            id:'future-lot',
            itemId:fifoId,
            itemName:'Temporal FIFO Item',
            source:'Manual',
            quantity:5,
            unitCost:100,
            acquiredAt:new Date(fifoNow).toISOString()
        }];
        fifoDb.sales = {
            'past-sale': {
                id:'past-sale',
                playerId:'1',
                playerName:'Buyer',
                timestamp:fifoNow - 86400000,
                total:1000,
                items:[{ id:fifoId, name:'Temporal FIFO Item', quantity:5, price:200, total:1000 }]
            }
        };
        const temporalFifoPast = realizedProfitMetrics(fifoDb, fifoId, 30);
        fifoDb.sales['future-sale'] = {
            id:'future-sale',
            playerId:'2',
            playerName:'Buyer 2',
            timestamp:fifoNow + 1000,
            total:1000,
            items:[{ id:fifoId, name:'Temporal FIFO Item', quantity:5, price:200, total:1000 }]
        };
        const temporalFifoWithFutureSale = realizedProfitMetrics(fifoDb, fifoId, 30);
        const fifoTemporalIntegrityOk =
            temporalFifoPast.matchedUnits === 0 &&
            temporalFifoPast.cogs === 0 &&
            temporalFifoWithFutureSale.matchedUnits === 5 &&
            temporalFifoWithFutureSale.cogs === 500;

        const profitCoverageStatusOk =
            profitCoverageStatus(0,0) === 'COMPLETE' &&
            profitCoverageStatus(10,0) === 'UNAVAILABLE' &&
            profitCoverageStatus(10,4) === 'PARTIAL' &&
            profitCoverageStatus(10,10) === 'COMPLETE';

        const refreshDb = defaultDb();
        const freshAt = nowIso();
        const fullyFreshPlan = businessRefreshPlan(refreshDb, {
            force:false,
            hasApi:true,
            hasFactionApi:true,
            freshness:{
                salesAt:freshAt,
                procurementAt:freshAt,
                marketAt:freshAt,
                dollarAt:freshAt,
                travelAt:freshAt,
                factionAt:freshAt
            }
        });
        const fullyStalePlan = businessRefreshPlan(refreshDb, {
            force:false,
            hasApi:true,
            hasFactionApi:false,
            freshness:{
                salesAt:null,
                procurementAt:null,
                marketAt:null,
                dollarAt:null,
                travelAt:null,
                factionAt:null
            }
        });
        const refreshPlanOk =
            fullyFreshPlan.sales === false &&
            fullyFreshPlan.market === false &&
            fullyFreshPlan.dollar === false &&
            fullyFreshPlan.procurement === false &&
            fullyFreshPlan.travel === false &&
            fullyFreshPlan.faction === false &&
            fullyStalePlan.sales === true &&
            fullyStalePlan.market === true &&
            fullyStalePlan.dollar === true &&
            fullyStalePlan.procurement === true &&
            fullyStalePlan.travel === true &&
            fullyStalePlan.faction === false;

        const rulesDb = defaultDb();
        const appliedRules = applyBusinessRules(rulesDb, {
            minRoiPct: 8.5,
            minDemandPerDay: 0.4,
            minPrice: 2500,
            maxPrice: 750000,
            minAbsoluteProfit: 12000,
            minSellerCount: 5,
            maxListingAgeSec: 90,
            marketRefreshLimit: 99
        });
        const businessRulePropagationOk =
            appliedRules.minRoiPct === 8.5 &&
            appliedRules.minDemandPerDay === 0.4 &&
            appliedRules.minPrice === 2500 &&
            appliedRules.maxPrice === 750000 &&
            appliedRules.minAbsoluteProfit === 12000 &&
            appliedRules.minSellerCount === 5 &&
            appliedRules.maxListingAgeSec === 90 &&
            appliedRules.marketRefreshLimit === WEAV3R_MAX_ENRICH &&
            rulesDb.procurement.settings.marketRefreshLimit === WEAV3R_MAX_ENRICH &&
            rulesDb.marketIntel.settings.minRoiPct === 8.5 &&
            rulesDb.marketIntel.settings.minAbsoluteProfit === 12000 &&
            rulesDb.marketIntel.settings.minMarketPrice === 2500 &&
            rulesDb.marketIntel.settings.maxCandidatePrice === 750000 &&
            rulesDb.marketIntel.settings.minBazaarSellers === 5 &&
            rulesDb.marketIntel.settings.freshnessWarnSeconds === 90 &&
            rulesDb.marketIntel.settings.maxEnrich === WEAV3R_MAX_ENRICH &&
            rulesDb.operations.settings.strategyPreset === 'CUSTOM';

        const refreshBreadthClampOk =
            businessRules({ businessRules:{ marketRefreshLimit:99 } }).marketRefreshLimit === WEAV3R_MAX_ENRICH &&
            businessRules({ businessRules:{ marketRefreshLimit:1 } }).marketRefreshLimit === 5;

        const resourceSafeRefreshOk =
            MARKET_ENRICH_CONCURRENCY === 1 &&
            PROCUREMENT_MARKET_CONCURRENCY === 1 &&
            SMART_REFRESH_ITEM_LIMIT > 0 &&
            SMART_REFRESH_ITEM_LIMIT < WEAV3R_MAX_ENRICH &&
            defaultDb().syncState.backgroundRefreshEnabled === false;

        const acquisitionIndexDb = defaultDb();
        acquisitionIndexDb.procurement.acquisitions = [{
            id:'existing-auto-lot',
            externalId:'logbuy:111:5:0',
            itemId:'5',
            itemName:'Indexed Item',
            source:'Bazaar',
            quantity:1,
            unitCost:100,
            acquiredAt:nowIso()
        }];
        acquisitionIndexDb.procurement.acquisitionProcessed = {};
        const acquisitionIndexedCount = indexProcessedAcquisitionLots(acquisitionIndexDb.procurement);
        const acquisitionCoverageGateOk =
            acquisitionIndexedCount === 1 &&
            acquisitionIndexDb.procurement.acquisitionProcessed['logbuy:111:5:0'] === true &&
            acquisitionCoverageBackfillNeeded(acquisitionIndexDb, true) === true;
        acquisitionIndexDb.meta.acquisitionCoverageVersion = ACQUISITION_COVERAGE_VERSION;
        const acquisitionCoverageCurrentOk =
            acquisitionCoverageBackfillNeeded(acquisitionIndexDb, true) === false &&
            acquisitionCoverageBackfillNeeded(acquisitionIndexDb, false) === false;

        const coverageNow = 1_800_000_000_000;
        const acquisitionCoverageWindowOk =
            acquisitionCoverageFromMs(coverageNow) ===
            coverageNow - ACQUISITION_COVERAGE_BACKFILL_DAYS * 86400000 &&
            ACQUISITION_COVERAGE_MAX_PAGES > 0 &&
            ACQUISITION_COVERAGE_MAX_PAGES < MAX_LOG_PAGES;

        const snapshotNow = 1_800_000_000_000;
        const bazaarSnapshotFreshnessOk =
            bazaarSnapshotFreshness(Math.floor((snapshotNow - 30_000) / 1000), snapshotNow).fresh === true &&
            bazaarSnapshotFreshness(Math.floor((snapshotNow - (BAZAAR_VERIFY_MAX_AGE_SEC + 1) * 1000) / 1000), snapshotNow).fresh === false &&
            bazaarSnapshotFreshness(0, snapshotNow).fresh === false;

        return {
            pass:
                aggregateOnly.price === 0 &&
                aggregateOnly.state === 'NEEDS MARKET REFRESH' &&
                staleListing.price === 0 &&
                trusted.state === 'TRUSTED' &&
                trusted.price > 0 &&
                trusted.price < 1000000 &&
                staleProcurement?.marketSnapshotFresh === false &&
                staleProcurement?.action === 'SKIP' &&
                bootstrapProcurement?.action === 'BUY' &&
                bootstrapProcurement?.personalDemandQualified === false &&
                bootstrapProcurement?.marketBootstrapQualified === true &&
                movementOk &&
                personalRealizedRoiOk &&
                dollarCamel.itemId === '3' &&
                dollarCamel.sellerId === '99' &&
                dollarSnake.itemId === '4' &&
                dollarSnake.sellerId === '100' &&
                dollarFallbackValueOk &&
                workbookOk &&
                migrationOk &&
                refreshPlanOk &&
                businessRulePropagationOk &&
                refreshBreadthClampOk &&
                resourceSafeRefreshOk &&
                acquisitionCoverageGateOk &&
                acquisitionCoverageCurrentOk &&
                acquisitionCoverageWindowOk &&
                bazaarSnapshotFreshnessOk &&
                fifoTemporalIntegrityOk &&
                profitCoverageStatusOk,
            aggregateOnly,
            staleListing,
            trusted,
            staleProcurement: staleProcurement ? {
                action: staleProcurement.action,
                marketSnapshotFresh: staleProcurement.marketSnapshotFresh,
                bestBuyPrice: staleProcurement.bestBuyPrice,
                realisticExit: staleProcurement.realisticExit
            } : null,
            bootstrapProcurement: bootstrapProcurement ? {
                action:bootstrapProcurement.action,
                personalDemandQualified:bootstrapProcurement.personalDemandQualified,
                marketBootstrapQualified:bootstrapProcurement.marketBootstrapQualified,
                marketDemandScore:bootstrapProcurement.marketDemandScore,
                acquisitionScore:bootstrapProcurement.acquisitionScore
            } : null,
            movementOk,
            personalRealizedRoiOk,
            personalProcurement: personalProcurement ? {
                personalDemandQualified:personalProcurement.personalDemandQualified,
                personalRoiEvidence:personalProcurement.personalRoiEvidence,
                personalMatchedUnits:personalProcurement.personalMatchedUnits,
                personalCostCoveragePct:personalProcurement.personalCostCoveragePct,
                ownRealizedRoiPct:personalProcurement.ownRealizedRoiPct,
                personalWeight:personalProcurement.personalWeight,
                acquisitionScore:personalProcurement.acquisitionScore
            } : null,
            movementProcurement: movementProcurement ? {
                marketMovementScore:movementProcurement.marketMovementScore,
                marketMovementConfidence:movementProcurement.marketMovementConfidence,
                marketDepletionPerHour:movementProcurement.marketDepletionPerHour,
                marketReplenishmentPerHour:movementProcurement.marketReplenishmentPerHour,
                acquisitionScore:movementProcurement.acquisitionScore
            } : null,
            dollarCamel,
            dollarSnake,
            dollarFallbackValue,
            dollarFallbackValueOk,
            workbookOk,
            workbookBytes,
            financialDocumentsOk,
            workbookStructureOk,
            migrationOk,
            refreshPlanOk,
            businessRulePropagationOk,
            refreshBreadthClampOk,
            resourceSafeRefreshOk,
            acquisitionCoverageGateOk,
            acquisitionCoverageCurrentOk,
            acquisitionCoverageWindowOk,
            bazaarSnapshotFreshnessOk,
            fifoTemporalIntegrityOk,
            profitCoverageStatusOk,
            fifoTemporalPast: {
                matchedUnits:temporalFifoPast.matchedUnits,
                cogs:temporalFifoPast.cogs
            },
            fifoTemporalWithFutureSale: {
                matchedUnits:temporalFifoWithFutureSale.matchedUnits,
                cogs:temporalFifoWithFutureSale.cogs
            },
            appliedBusinessRules: appliedRules,
            refreshPlans: {
                fullyFreshPlan,
                fullyStalePlan
            },
            migration: {
                schema:migrated.schema,
                customerCount:Object.keys(migrated.customers || {}).length,
                salesCount:Object.keys(migrated.sales || {}).length,
                acquisitionCount:migrated.procurement?.acquisitions?.length || 0,
                businessRules:migrated.businessRules
            }
        };
    }

    function pricingDirectorRows(db) {
        const rows = advancedInventoryRows(db).filter(r => r.bazaarQty > 0 && r.bazaarPrice > 0);

        return rows.map(r => {
            const id = asId(r.id);
            const detail = db.marketIntel.details[id] || {};
            const organic = freshOrganicListings(db, detail.organicListings || []);
            const competitorPrices = organic
                .map(x => Number(x.price || 0))
                .filter(v => v > 0 && v !== Number(r.bazaarPrice || 0))
                .sort((a, b) => a - b);
            const priceDecision = trustedListingPriceDecision(db, id, r, r.elasticity);

            const liveLow = competitorPrices[0] || Number(priceDecision.marketLow || 0);
            const median7d = Number(r.median7d || 0);
            const current = Number(r.bazaarPrice || 0);
            const cost = Number(r.avgCost || 0);
            const minMarginPct = Number(db.procurement.settings.minMarginPct || 4);
            const floor = cost > 0 ? Math.ceil(cost * (1 + minMarginPct / 100)) : 0;

            const demand = Math.max(0, Number(r.forecastDaily || r.daily || 0));
            const fast = demand >= 1 || r.liquidityScore >= 70;
            const slow = demand < 0.2 && r.liquidityScore < 45;
            const old = Number(r.maxAge || 0) >= Number(db.operations.settings.deadStockDays || DEAD_STOCK_DAYS);

            const marketAnchor = liveLow > 0 ? liveLow : (median7d || current);
            let recommended = current;
            let state = 'HOLD';

            const shockPct = median7d > 0 && liveLow > 0
                ? (liveLow - median7d) / median7d * 100
                : 0;
            const marketShock = Math.abs(shockPct) >= 12;

            if (marketShock) {
                state = 'MARKET SHOCK';
                recommended = Math.max(floor, current);
            } else if (old && slow) {
                recommended = Math.max(floor, marketAnchor > 0 ? Math.floor(marketAnchor * 0.985) : current);
                state = recommended < current ? 'CLEARANCE' : 'HOLD';
            } else if (fast && liveLow > current * 1.01) {
                recommended = Math.max(floor, Math.floor(liveLow - 1));
                state = recommended > current ? 'RAISE PRICE' : 'HOLD';
            } else if (liveLow > 0 && current > liveLow * 1.015) {
                recommended = Math.max(floor, Math.floor(liveLow - 1));
                state = recommended < current ? 'LOWER PRICE' : 'PROTECT MARGIN';
            } else {
                const planned = Number(r.plannedPrice || 0);
                if (planned > 0) recommended = Math.max(floor, planned);
                if (recommended > current * 1.005) state = 'RAISE PRICE';
                else if (recommended < current * 0.995) state = 'LOWER PRICE';
            }

            if (floor > 0 && marketAnchor > 0 && marketAnchor < floor) {
                recommended = Math.max(current, floor);
                state = 'PROTECT MARGIN';
            }

            const delta = recommended - current;
            const deltaPct = current > 0 ? delta / current * 100 : 0;
            const currentMarginPct = cost > 0 ? (current - cost) / cost * 100 : 0;
            const recommendedMarginPct = cost > 0 ? (recommended - cost) / cost * 100 : 0;

            const confidence = Math.max(0, Math.min(100,
                Math.min(100, Number(r.historySamples || 0) * 8) * 0.30 +
                Number(r.liquidityScore || 0) * 0.35 +
                Math.min(100, demand * 25) * 0.20 +
                (liveLow > 0 ? 100 : 30) * 0.15
            ));

            const sim = priceSimulationRows(db, id);
            const currentSim = sim.slice().sort((a,b) => Math.abs(a.price-current)-Math.abs(b.price-current))[0];
            const recSim = sim.slice().sort((a,b) => Math.abs(a.price-recommended)-Math.abs(b.price-recommended))[0];

            return {
                ...r,
                currentPrice: current,
                recommendedPrice: Math.max(0, Math.floor(recommended)),
                pricingState: state,
                pricingConfidence: Math.min(confidence, Number(priceDecision.confidence || 0)),
                pricingDelta: delta,
                pricingDeltaPct: deltaPct,
                liveMarketLow: liveLow,
                pricingDecision,
                floorPrice: floor,
                marketShock,
                marketShockPct: shockPct,
                currentMarginPct,
                recommendedMarginPct,
                estimatedProfitDayCurrent: Number(currentSim?.profitPerDay || 0),
                estimatedProfitDayRecommended: Number(recSim?.profitPerDay || 0)
            };
        }).sort((a, b) => {
            const order = {
                'MARKET SHOCK': 0,
                'PROTECT MARGIN': 1,
                'RAISE PRICE': 2,
                'LOWER PRICE': 3,
                'CLEARANCE': 4,
                'HOLD': 5
            };
            return (order[a.pricingState] ?? 9) - (order[b.pricingState] ?? 9) ||
                b.pricingConfidence - a.pricingConfidence ||
                Math.abs(b.pricingDeltaPct) - Math.abs(a.pricingDeltaPct);
        });
    }

    function buildRepricingPlan(db) {
        const plan = {};
        for (const r of pricingDirectorRows(db)) {
            if (!['RAISE PRICE', 'LOWER PRICE', 'CLEARANCE'].includes(r.pricingState)) continue;
            if (!(r.recommendedPrice > 0) || r.recommendedPrice === r.currentPrice) continue;

            plan[r.id] = {
                itemId: r.id,
                itemName: r.name,
                quantity: r.bazaarQty,
                price: r.recommendedPrice,
                currentPrice: r.currentPrice,
                floorPrice: r.floorPrice,
                state: r.pricingState,
                confidence: r.pricingConfidence,
                deltaPct: r.pricingDeltaPct,
                createdAt: nowIso()
            };
        }
        db.operations.repricingPlan = plan;
        return plan;
    }

    function pricingDirectorHtml(db) {
        const rows = pricingDirectorRows(db);
        const actionable = rows.filter(r => r.pricingState !== 'HOLD');

        return card(`
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
                <div>
                    <b>Dynamic Pricing Director</b>
                    <div style="font-size:11px;color:#999;margin-top:3px;">
                        Optimizes listed Bazaar prices for margin, velocity, liquidity, age and live market conditions.
                        Market shocks are held for review instead of chased automatically.
                    </div>
                </div>
                <button id="mm-build-repricing-plan" style="${btn(true)}">Build Repricing Plan</button>
            </div>

            ${rows.length ? rows.slice(0,40).map(r => `
                <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;">
                    <div style="font-size:11px;min-width:0;">
                        <b>${escapeHtml(r.name)}</b>
                        <span style="color:${r.pricingState==='RAISE PRICE'?'#9fe3a8':r.pricingState==='LOWER PRICE'?'#ffd18a':r.pricingState==='MARKET SHOCK'?'#ff8d8d':'#bbb'};">
                            ${escapeHtml(r.pricingState)}
                        </span><br>
                        Current ${money(r.currentPrice)} → Recommended <b>${money(r.recommendedPrice)}</b>
                        (${r.pricingDeltaPct>=0?'+':''}${r.pricingDeltaPct.toFixed(1)}%) ·
                        Market low ${r.liveMarketLow?money(r.liveMarketLow):'—'} · Floor ${r.floorPrice?money(r.floorPrice):'—'}<br>
                        Margin ${r.currentMarginPct.toFixed(1)}% → ${r.recommendedMarginPct.toFixed(1)}% ·
                        Forecast ${r.forecastDaily.toFixed(2)}/day · Liquidity ${r.liquidityGrade} ·
                        Confidence ${r.pricingConfidence.toFixed(0)}%
                        ${r.marketShock ? `<br><span style="color:#ff8d8d;">Market shock ${r.marketShockPct>=0?'+':''}${r.marketShockPct.toFixed(1)}% vs 7d median — HOLD for review.</span>` : ''}
                    </div>
                </div>
            `).join('') : '<div style="font-size:11px;color:#888;margin-top:6px;">No current Bazaar listings available for pricing analysis.</div>'}
        `);
    }

    function listingPlanPreview(db) {
        const plan={};
        for (const r of advancedInventoryRows(db)) {
            if (!(r.addToBazaar>0)) continue;
            if (!(r.plannedPrice > 0) || r.pricingDecision?.state !== 'TRUSTED') continue;
            plan[r.id]={
                itemId:r.id,itemName:r.name,quantity:r.addToBazaar,price:r.plannedPrice,
                targetListed:r.targetListed,currentListed:r.bazaarQty,cost:r.avgCost,
                expectedMarginPct:r.avgCost>0&&r.plannedPrice>0?(r.plannedPrice-r.avgCost)/r.avgCost*100:0
            };
        }
        return plan;
    }

    function buildListingPlan(db) {
        const plan=listingPlanPreview(db);
        const stamped={};
        for (const [id,row] of Object.entries(plan)) {
            stamped[id]={...row,createdAt:nowIso()};
        }
        db.operations.listingPlans=stamped;
        return stamped;
    }

    function startRestockSession() {
        const db=dbLoad();
        const rows=restockCommandRows(db).filter(r=>r.shortage>0);
        if(!rows.length) throw new Error('No current restock shortages.');
        const budget=Math.max(0,Number(db.procurement.settings.procurementBudget||0));
        const queue=rows.map(r=>({
            itemId:r.id,itemName:r.name,status:'pending',need:r.shortage,
            buyPrice:r.globalBuyPrice||r.bestBuyPrice||0,buyTarget:r.buyTarget||0,
            exit:r.globalExit||r.realisticExit||0,roiPct:r.globalRoiPct||0,
            sourceQty:r.sourceQty||0,sellerId:r.sellerId||'',sellerName:r.sellerName||''
        }));
        const session={
            id:makeId('restock'),createdAt:nowIso(),completedAt:null,budget,
            queue,activeIndex:0,spent:0,expectedProfit:0,notes:''
        };
        db.operations.restockSessions.unshift(session);
        db.operations.restockSessions=db.operations.restockSessions.slice(0,RESTOCK_SESSION_MAX);
        db.operations.activeRestockSessionId=session.id;
        dbSave(db);
        return session;
    }

    function getActiveRestockSession(db=dbLoad()){
        return db.operations.restockSessions.find(s=>s.id===db.operations.activeRestockSessionId)||null;
    }

    function advanceRestockSession(itemStatus='skipped'){
        const db=dbLoad();
        const s=getActiveRestockSession(db);
        if(!s)return;
        const current=s.queue[s.activeIndex];
        if(current&&current.status==='pending')current.status=itemStatus;
        let next=s.queue.findIndex((x,i)=>i>s.activeIndex&&x.status==='pending');
        if(next<0){
            s.completedAt=nowIso();
            db.operations.activeRestockSessionId=null;
        }else s.activeIndex=next;
        dbSave(db);render();
    }

    function logRestockPurchase(quantity,unitCost){
        const db=dbLoad();
        const s=getActiveRestockSession(db);
        if(!s)throw new Error('No active restock session.');
        const q=s.queue[s.activeIndex];
        if(!q)throw new Error('No active restock item.');
        const qty=Number(quantity||0),cost=Number(unitCost||0);
        if(!(qty>0)||!(cost>=0))throw new Error('Quantity and unit cost are required.');
        addAcquisition({
            itemId:q.itemId,itemName:q.itemName,source:'Restock Session',quantity:qty,unitCost:cost,
            sellerId:q.sellerId,sellerName:q.sellerName,sessionId:s.id,
            notes:`Restock session ${s.id}`
        });
        const fresh=dbLoad();
        const session=fresh.operations.restockSessions.find(x=>x.id===s.id);
        const current=session.queue[session.activeIndex];
        current.status='purchased';current.purchasedQty=qty;current.actualUnitCost=cost;current.purchasedAt=nowIso();
        session.spent+=qty*cost;
        session.expectedProfit+=qty*Math.max(0,(current.exit||0)-cost);
        let next=session.queue.findIndex((x,i)=>i>session.activeIndex&&x.status==='pending');
        if(next<0){session.completedAt=nowIso();fresh.operations.activeRestockSessionId=null;}
        else session.activeIndex=next;
        dbSave(fresh);render();
    }

    function subscriberInterestMatch(sub,itemId,itemName){
        const interests=Array.isArray(sub.interests)?sub.interests:[];
        if(!interests.length)return true;
        const id=asId(itemId),name=normalizeItemName(itemName);
        return interests.some(v=>asId(v)===id||normalizeItemName(v)===name);
    }

    function setSubscriberInterests(playerId,values){
        const db=dbLoad();const id=asId(playerId);const sub=db.subscribers[id];if(!sub)return;
        sub.interests=[...new Set(String(values||'').split(',').map(x=>x.trim()).filter(Boolean))];
        dbSave(db);render();
    }

    function customerRfmRows(db){
        const now=Date.now();
        const affinityByCustomer={};
        for(const sale of Object.values(db.sales||{})){
            const id=asId(sale.playerId);
            if(!id)continue;
            const affinity=affinityByCustomer[id]||(affinityByCustomer[id]={});
            for(const item of sale.items||[]){
                const name=String(item.name||item.itemName||item.item_name||'Unknown item');
                affinity[name]=(affinity[name]||0)+Number(item.quantity||0);
            }
        }
        const rows=Object.values(db.customers).map(c=>{
            const recencyDays=c.lastPurchase?Math.max(0,(now-new Date(c.lastPurchase).getTime())/86400000):9999;
            const frequency=Number(c.purchases||0),monetary=Number(c.spent||0);
            let segment='DORMANT';
            if(recencyDays<=7&&frequency>=8)segment='VIP';
            else if(recencyDays<=14&&frequency>=4)segment='LOYAL';
            else if(recencyDays<=30&&frequency>=2)segment='REGULAR';
            else if(frequency<=1&&recencyDays<=30)segment='NEW';
            else if(frequency>=3&&recencyDays<=60)segment='AT RISK';
            const topProducts=Object.entries(affinityByCustomer[asId(c.id)]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
            return {...c,recencyDays,frequency,monetary,segment,topProducts};
        });
        return rows.sort((a,b)=>a.recencyDays-b.recencyDays||b.monetary-a.monetary);
    }

    function overallGrossMarginRate(db){
        const rows=advancedInventoryRows(db);
        const rev=rows.reduce((s,r)=>s+r.realized.revenue,0);
        const gp=rows.reduce((s,r)=>s+r.realized.grossProfit,0);
        return rev>0?Math.max(0,gp/rev):0;
    }

    function customerClvRows(db){
        const margin=overallGrossMarginRate(db);
        const refundsByCustomer={};
        for(const r of Object.values(db.refunds||{})){
            if(r.status==='completed'||r.status==='paid')refundsByCustomer[asId(r.playerId)]=(refundsByCustomer[asId(r.playerId)]||0)+Number(r.amount||0);
        }
        return customerRfmRows(db).map(c=>({
            ...c,
            estimatedGrossProfit:c.spent*margin,
            cashbackCost:refundsByCustomer[asId(c.id)]||0,
            estimatedNetValue:c.spent*margin-(refundsByCustomer[asId(c.id)]||0)
        })).sort((a,b)=>b.estimatedNetValue-a.estimatedNetValue);
    }

    function couponRoiMetrics(db){
        const customers=customerRfmRows(db);
        const redeemed=new Set(Object.values(db.coupons||{}).filter(c=>(c.redemptions||[]).length>0).map(c=>asId(c.playerId)));
        const withCoupon=customers.filter(c=>redeemed.has(asId(c.id)));
        const without=customers.filter(c=>!redeemed.has(asId(c.id)));
        const repeatRate=arr=>arr.length?arr.filter(c=>c.frequency>=2).length/arr.length:0;
        const cashback=Object.values(db.refunds||{}).filter(r=>r.status==='completed'||r.status==='paid').reduce((s,r)=>s+Number(r.amount||0),0);
        const margin=overallGrossMarginRate(db);
        const redeemedRevenue=withCoupon.reduce((s,c)=>s+c.spent,0);
        const grossProfit=redeemedRevenue*margin;
        return {
            couponCustomers:withCoupon.length,nonCouponCustomers:without.length,
            couponRepeatRate:repeatRate(withCoupon),nonCouponRepeatRate:repeatRate(without),
            cashback,grossProfit,roi:cashback>0?(grossProfit-cashback)/cashback:0
        };
    }

    function profitCoverageStatus(units, matchedUnits) {
        const total = Math.max(0, Number(units || 0));
        const matched = Math.max(0, Math.min(total, Number(matchedUnits || 0)));
        if (total <= 0) return 'COMPLETE';
        if (matched <= 0) return 'UNAVAILABLE';
        return matched < total ? 'PARTIAL' : 'COMPLETE';
    }

    function ownerBriefing(db, precomputedRows=null){
        const rows=precomputedRows||advancedInventoryRows(db);
        const revenue=rows.reduce((s,r)=>s+r.realized.revenue,0);
        const grossProfit=rows.reduce((s,r)=>s+r.realized.grossProfit,0);
        const units=rows.reduce((s,r)=>s+r.realized.units,0);
        const matchedUnits=rows.reduce((s,r)=>s+Number(r.realized.matchedUnits||0),0);
        const unmatchedUnits=Math.max(0,units-matchedUnits);
        const costCoveragePct=units>0?matchedUnits/units*100:100;
        const profitCoverage=profitCoverageStatus(units,matchedUnits);
        const inventoryValue=rows.reduce((s,r)=>s+r.realized.ledger.remainingCost,0);
        const stockouts=rows.filter(r=>r.state==='OUT OF STOCK').length;
        const lostProfit=rows.reduce((s,r)=>s+r.lostProfit,0);
        const critical=rows.filter(r=>['OUT OF STOCK','SOURCE NOW'].includes(r.state)).length;
        const deadCapital=rows.reduce((s,r)=>s+r.deadCapital,0);
        const best=rows.slice().filter(r=>Number(r.realized.matchedUnits||0)>0).sort((a,b)=>b.realized.grossProfit-a.realized.grossProfit)[0]||null;
        const worst=rows.slice().filter(r=>Number(r.realized.matchedUnits||0)>0||r.deadCapital>0).sort((a,b)=>a.realized.grossProfit-b.realized.grossProfit)[0]||null;
        return {revenue,grossProfit,units,matchedUnits,unmatchedUnits,costCoveragePct,profitCoverage,inventoryValue,stockouts,lostProfit,critical,deadCapital,best,worst};
    }

    function inventoryWhatIf(db,targetDays){
        const days=Number(targetDays||5);
        const rows=advancedInventoryRows(db);
        const capital=rows.reduce((s,r)=>{
            const target=Math.ceil(r.forecastDaily*days+r.safety.units);
            const need=Math.max(0,target-r.stock);
            const cost=r.bestBuyPrice||r.avgCost||0;
            return s+need*cost;
        },0);
        const stockoutRisk=rows.length?rows.filter(r=>r.stock<r.forecastDaily*Math.max(.5,days/3)).length/rows.length:0;
        const expectedGross=rows.reduce((s,r)=>s+r.realized.grossProfit,0)*(days/30);
        return {days,capital,stockoutRisk,expectedGross};
    }

    function priceSimulationRows(db,itemId){
        const id=asId(itemId);
        const r=advancedInventoryRows(db).find(x=>x.id===id);
        if(!r)return[];
        const base=r.plannedPrice||r.realisticExit||r.bazaarPrice||0;
        const cost=r.avgCost||0;
        const elasticity=r.elasticity;
        const observed=elasticity.best?.unitsPerDay||r.forecastDaily||0;
        return [-0.03,-0.015,0,0.015,0.03].map(delta=>{
            const price=Math.max(1,Math.round(base*(1+delta)));
            const demandFactor=Math.max(.25,1-delta*6);
            const unitsPerDay=observed*demandFactor;
            return {price,unitsPerDay,profitPerDay:unitsPerDay*Math.max(0,price-cost)};
        });
    }

    function addDemandEvent(name,startAt,endAt,multiplier){
        const db=dbLoad();
        if(!name||!startAt||!endAt)throw new Error('Event name, start, and end are required.');
        db.operations.events.push({id:makeId('event'),name:String(name),startAt:new Date(startAt).toISOString(),endAt:new Date(endAt).toISOString(),multiplier:Number(multiplier||1)});
        dbSave(db);render();
    }

    function removeDemandEvent(id){
        const db=dbLoad();db.operations.events=db.operations.events.filter(e=>e.id!==id);dbSave(db);render();
    }

    function notifyOperationalAlerts(db){
        if(!db.operations.settings.enableBrowserNotifications||Notification.permission!=='granted')return;
        const rows=advancedInventoryRows(db).filter(r=>['OUT OF STOCK','SOURCE NOW'].includes(r.state));
        const key=rows.map(r=>`${r.id}:${r.state}`).sort().join('|');
        if(!key||db.operations.notificationState.lastKey===key)return;
        db.operations.notificationState.lastKey=key;dbSave(db);
        new Notification(`${SHOP_NAME} — Restock Alert`,{body:`${rows.length} SKU(s) need action: ${rows.slice(0,4).map(r=>r.name).join(', ')}`});
    }

    function requestOperationalNotifications(){
        if(!('Notification'in window)){alert('Browser notifications are not supported here.');return;}
        Notification.requestPermission().then(result=>{
            const db=dbLoad();db.operations.settings.enableBrowserNotifications=result==='granted';dbSave(db);render();
        });
    }

    function fillInputValue(input,value){
        if(!input)return false;
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        if(setter)setter.call(input,String(value));else input.value=String(value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
    }

    function findBazaarRowForItem(itemName){
        const name=normalizeItemName(itemName);
        const candidates=[...document.querySelectorAll('li, tr, [class*="item"], [class*="row"]')];
        return candidates.find(el=>normalizeItemName(el.textContent||'').includes(name))||null;
    }

    function applyListingPlanToRow(plan){
        const row=findBazaarRowForItem(plan.itemName);
        if(!row)return false;
        const inputs=[...row.querySelectorAll('input')].filter(x=>x.offsetParent!==null);
        if(!inputs.length)return false;
        let qtyInput=inputs.find(i=>/qty|quantity|amount/i.test(`${i.name} ${i.placeholder} ${i.getAttribute('aria-label')||''}`));
        let priceInput=inputs.find(i=>/price|cost/i.test(`${i.name} ${i.placeholder} ${i.getAttribute('aria-label')||''}`));
        if(!qtyInput&&inputs.length>=2)qtyInput=inputs[0];
        if(!priceInput&&inputs.length>=2)priceInput=inputs[inputs.length-1];
        let ok=false;
        if(qtyInput && plan.quantity != null) ok=fillInputValue(qtyInput,plan.quantity)||ok;
        if(priceInput&&plan.price>0)ok=fillInputValue(priceInput,plan.price)||ok;
        if(ok){
            row.dataset.mmCrmFilled='1';
            row.style.outline='1px solid #d7ad4b';
        }
        return ok;
    }

    function installBazaarListingAssistant(){
        if(!/bazaar\.php/i.test(location.pathname+location.hash+location.search))return;
        const db=dbLoad();
        buildListingPlan(db);
        buildRepricingPlan(db);
        dbSave(db);

        const newListingPlans=Object.values(db.operations.listingPlans||{});
        const repricingPlans=Object.values(db.operations.repricingPlan||{});
        const plans=[
            ...newListingPlans,
            ...repricingPlans.map(p=>({ ...p, quantity: null }))
        ];
        if(!plans.length)return;
        if(document.getElementById('mm-bazaar-listing-assistant'))return;
        const box=document.createElement('div');
        box.id='mm-bazaar-listing-assistant';
        box.style.cssText='position:fixed;right:12px;bottom:12px;z-index:999999;background:#151515;color:#eee;border:1px solid #d7ad4b;border-radius:8px;padding:10px;width:290px;box-shadow:0 4px 18px #0009;font:12px Arial,sans-serif;';
        box.innerHTML=`<b>${escapeHtml(SHOP_NAME)} Listing / Pricing Assistant</b><div style="color:#aaa;margin:4px 0 7px;">${newListingPlans.length} listing action(s) · ${repricingPlans.length} repricing action(s). Fill only — never submits.</div>
            <button id="mm-bazaar-fill-all" style="${btn(true)}">Fill Recommended Changes</button>
            <button id="mm-bazaar-close-helper" style="${btn()}">Close</button>
            <div id="mm-bazaar-fill-result" style="margin-top:6px;color:#aaa;"></div>`;
        document.body.appendChild(box);
        box.querySelector('#mm-bazaar-close-helper')?.addEventListener('click',()=>box.remove());
        box.querySelector('#mm-bazaar-fill-all')?.addEventListener('click',()=>{
            let filled=0;for(const plan of plans)if(applyListingPlanToRow(plan))filled++;
            box.querySelector('#mm-bazaar-fill-result').textContent=`Filled ${filled}/${plans.length} visible matching item row(s). Review before Torn submission.`;
        });
    }


    // ============================================================
    // GITHUB HOURLY BACKUP / SYNC
    // ============================================================

    function getGithubSettings() {
        const raw = GM_getValue(GITHUB_SETTINGS_KEY, {});
        return {
            owner: String(raw?.owner || '').trim(),
            repo: String(raw?.repo || '').trim(),
            branch: String(raw?.branch || 'main').trim() || 'main',
            folder: String(raw?.folder || 'crm-sync').trim().replace(/^\/+|\/+$/g, '') || 'crm-sync',
            autoSync: raw?.autoSync !== false,
            encryptedFullBackup: Boolean(raw?.encryptedFullBackup),
            lastStatus: String(raw?.lastStatus || ''),
            lastSyncAt: raw?.lastSyncAt || null
        };
    }

    function saveGithubSettings(patch) {
        GM_setValue(GITHUB_SETTINGS_KEY, { ...getGithubSettings(), ...patch });
    }

    function getGithubToken() {
        return String(GM_getValue(GITHUB_TOKEN_KEY, '') || '').trim();
    }

    function setGithubToken(value) {
        const token = String(value || '').trim();
        if (token) GM_setValue(GITHUB_TOKEN_KEY, token);
        else GM_deleteValue(GITHUB_TOKEN_KEY);
    }

    function getGithubBackupPassphrase() {
        return String(GM_getValue(GITHUB_BACKUP_PASSPHRASE_KEY, '') || '');
    }

    function setGithubBackupPassphrase(value) {
        const passphrase = String(value || '');
        if (passphrase) GM_setValue(GITHUB_BACKUP_PASSPHRASE_KEY, passphrase);
        else GM_deleteValue(GITHUB_BACKUP_PASSPHRASE_KEY);
    }

    function githubConfigured() {
        const s = getGithubSettings();
        return Boolean(s.owner && s.repo && getGithubToken());
    }

    function utf8ToBase64(text) {
        const bytes = new TextEncoder().encode(String(text));
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    function base64ToUtf8(value) {
        const binary = atob(String(value || '').replace(/\s+/g, ''));
        return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    }

    function bytesToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(String(value || ''));
        return Uint8Array.from(binary, c => c.charCodeAt(0));
    }

    async function deriveBackupKey(passphrase, salt) {
        const material = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptFullBackup(db, passphrase) {
        if (!passphrase) throw new Error('Encrypted full backup passphrase is not configured.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveBackupKey(passphrase, salt);
        const plaintext = new TextEncoder().encode(JSON.stringify(db));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
        return {
            format: 'MMCRM-AES-GCM-1',
            createdAt: nowIso(),
            iterations: 250000,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            ciphertext: bytesToBase64(ciphertext)
        };
    }

    async function decryptFullBackup(payload, passphrase) {
        if (!payload || payload.format !== 'MMCRM-AES-GCM-1') throw new Error('Unsupported encrypted backup format.');
        if (!passphrase) throw new Error('Backup passphrase is required.');
        const key = await deriveBackupKey(passphrase, base64ToBytes(payload.salt));
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
            key,
            base64ToBytes(payload.ciphertext)
        );
        return normalizeDb(JSON.parse(new TextDecoder().decode(plaintext)));
    }

    function buildSanitizedGithubSnapshot(db) {
        return {
            format: 'MMCRM-SANITIZED-1',
            version: VERSION,
            schema: db.schema,
            syncedAt: nowIso(),
            businessRules: db.businessRules,
            marketIntel: {
                marketplace: db.marketIntel.marketplace,
                marketplaceGeneratedAt: db.marketIntel.marketplaceGeneratedAt,
                details: db.marketIntel.details,
                traders: db.marketIntel.traders,
                dollarItems: db.marketIntel.dollarItems,
                dollarBazaars: db.marketIntel.dollarBazaars,
                ranked: db.marketIntel.ranked,
                auctions: db.marketIntel.auctions,
                suppliers: db.marketIntel.suppliers,
                history: db.marketIntel.history,
                settings: db.marketIntel.settings
            },
            procurement: {
                catalog: db.procurement.catalog,
                marketSnapshots: db.procurement.marketSnapshots,
                marketHistory: db.procurement.marketHistory,
                watchlist: db.procurement.watchlist,
                settings: db.procurement.settings
            },
            operations: {
                bazaarPriceHistory: db.operations.bazaarPriceHistory,
                events: db.operations.events,
                settings: db.operations.settings
            }
        };
    }

    function mergeSanitizedGithubSnapshot(db, snapshot) {
        if (!snapshot || snapshot.format !== 'MMCRM-SANITIZED-1') throw new Error('Unsupported sanitized GitHub snapshot.');
        db.businessRules = { ...db.businessRules, ...(snapshot.businessRules || {}) };
        db.marketIntel = { ...db.marketIntel, ...(snapshot.marketIntel || {}) };
        db.procurement.catalog = snapshot.procurement?.catalog || db.procurement.catalog;
        db.procurement.marketSnapshots = snapshot.procurement?.marketSnapshots || db.procurement.marketSnapshots;
        db.procurement.marketHistory = snapshot.procurement?.marketHistory || db.procurement.marketHistory;
        db.procurement.watchlist = snapshot.procurement?.watchlist || db.procurement.watchlist;
        db.procurement.settings = { ...db.procurement.settings, ...(snapshot.procurement?.settings || {}) };
        db.operations.bazaarPriceHistory = snapshot.operations?.bazaarPriceHistory || db.operations.bazaarPriceHistory;
        db.operations.events = snapshot.operations?.events || db.operations.events;
        db.operations.settings = { ...db.operations.settings, ...(snapshot.operations?.settings || {}) };
        db.meta.github.lastRestoreAt = nowIso();
        db.meta.github.lastRestoreSource = 'sanitized';
        return normalizeDb(db);
    }

    function githubApiRequest(method, url, body = null) {
        const token = getGithubToken();
        if (!token) return Promise.reject(new Error('GitHub token is not configured.'));
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                timeout: 30000,
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json'
                },
                data: body == null ? undefined : JSON.stringify(body),
                onload: response => {
                    let data = null;
                    try { data = response.responseText ? JSON.parse(response.responseText) : null; } catch {}
                    if (response.status >= 200 && response.status < 300) {
                        resolve(data);
                        return;
                    }
                    const error = new Error(`GitHub ${data?.message || response.statusText || `HTTP ${response.status}`}`);
                    error.status = response.status;
                    reject(error);
                },
                onerror: () => reject(new Error('GitHub network request failed.')),
                ontimeout: () => reject(new Error('GitHub request timed out.'))
            });
        });
    }

    function githubContentUrl(path) {
        const s = getGithubSettings();
        const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
        return `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${encodedPath}`;
    }

    async function githubReadFile(relativePath) {
        const s = getGithubSettings();
        const path = `${s.folder}/${relativePath}`.replace(/\/+/g, '/');
        const url = new URL(githubContentUrl(path));
        url.searchParams.set('ref', s.branch);
        const data = await githubApiRequest('GET', url.toString());
        if (!data?.content) throw new Error(`GitHub file ${path} has no content.`);
        return { path, sha: data.sha, text: base64ToUtf8(data.content) };
    }

    async function githubWriteFile(relativePath, textContent, commitMessage) {
        const s = getGithubSettings();
        const path = `${s.folder}/${relativePath}`.replace(/\/+/g, '/');
        let sha = null;
        try {
            sha = (await githubReadFile(relativePath)).sha;
        } catch (error) {
            if (error.status !== 404) throw error;
        }

        const body = {
            message: commitMessage,
            content: utf8ToBase64(textContent),
            branch: s.branch
        };
        if (sha) body.sha = sha;
        return githubApiRequest('PUT', githubContentUrl(path), body);
    }

    async function githubSyncNow({ silent = false } = {}) {
        if (githubSyncRunning) return false;
        if (!githubConfigured()) {
            if (!silent) {
                statusText = 'GitHub sync is not configured.';
                render();
            }
            return false;
        }

        githubSyncRunning = true;
        if (!silent) {
            statusText = 'Syncing CRM backup to GitHub…';
            render();
        }

        try {
            await flushDbWrites();
            const db = dbLoad();
            const settings = getGithubSettings();
            const syncedAt = nowIso();

            const manifest = {
                format: 'MMCRM-MANIFEST-1',
                version: VERSION,
                schema: db.schema,
                syncedAt,
                storageBackend: 'IndexedDB',
                encryptedFullBackup: Boolean(settings.encryptedFullBackup && getGithubBackupPassphrase()),
                counts: {
                    customers: Object.keys(db.customers || {}).length,
                    sales: Object.keys(db.sales || {}).length,
                    acquisitions: db.procurement?.acquisitions?.length || 0,
                    marketItems: Object.keys(db.marketIntel?.marketplace || {}).length
                }
            };

            await githubWriteFile('manifest.json', JSON.stringify(manifest, null, 2), `CRM sync ${syncedAt}`);
            await githubWriteFile('sanitized-backup.json', JSON.stringify(buildSanitizedGithubSnapshot(db)), `CRM sanitized backup ${syncedAt}`);

            if (settings.encryptedFullBackup) {
                const passphrase = getGithubBackupPassphrase();
                if (!passphrase) throw new Error('Encrypted full backup is enabled, but no backup passphrase is saved.');
                const encrypted = await encryptFullBackup(db, passphrase);
                await githubWriteFile('full-backup.enc.json', JSON.stringify(encrypted), `CRM encrypted full backup ${syncedAt}`);
            }

            saveGithubSettings({ lastStatus: 'PASS', lastSyncAt: syncedAt });
            const fresh = dbLoad();
            fresh.meta.github.lastSyncAt = syncedAt;
            fresh.meta.github.lastStatus = 'PASS';
            dbSave(fresh);

            if (!silent) {
                statusText = `GitHub backup synced at ${fmtDate(syncedAt)}.`;
                render();
            }
            return true;
        } catch (error) {
            saveGithubSettings({ lastStatus: `FAIL: ${error?.message || String(error)}` });
            console.error('[MM CRM] GitHub sync failed', error);
            if (!silent) {
                statusText = `GitHub sync failed: ${error?.message || String(error)}`;
                render();
            }
            return false;
        } finally {
            githubSyncRunning = false;
        }
    }

    async function githubRestore({ preferFull = true } = {}) {
        if (!githubConfigured()) throw new Error('GitHub sync is not configured.');

        if (preferFull) {
            try {
                const file = await githubReadFile('full-backup.enc.json');
                const passphrase = getGithubBackupPassphrase();
                if (!passphrase) throw new Error('Full backup exists, but the local backup passphrase is not configured.');
                const restored = await decryptFullBackup(JSON.parse(file.text), passphrase);
                restored.meta.github.lastRestoreAt = nowIso();
                restored.meta.github.lastRestoreSource = 'encrypted-full';
                dbSave(restored);
                await flushDbWrites();
                return { type: 'encrypted-full', restored };
            } catch (error) {
                if (error.status !== 404 && !String(error.message || '').includes('passphrase')) throw error;
            }
        }

        const sanitized = JSON.parse((await githubReadFile('sanitized-backup.json')).text);
        const merged = mergeSanitizedGithubSnapshot(dbLoad(), sanitized);
        dbSave(merged);
        await flushDbWrites();
        return { type: 'sanitized', restored: merged };
    }

    async function autoRestoreIfDatabaseEmpty() {
        if (!githubConfigured()) return false;
        const db = dbLoad();
        const hasData =
            Object.keys(db.customers || {}).length ||
            Object.keys(db.sales || {}).length ||
            Object.keys(db.marketIntel?.marketplace || {}).length ||
            (db.procurement?.acquisitions?.length || 0);
        if (hasData) return false;

        try {
            const result = await githubRestore({ preferFull: true });
            statusText = `Recovered ${result.type === 'encrypted-full' ? 'full' : 'non-sensitive'} data from GitHub.`;
            return true;
        } catch (error) {
            console.warn('[MM CRM] Automatic GitHub restore skipped', error);
            return false;
        }
    }

    function scheduleGithubSync() {
        if (githubSyncTimer) clearInterval(githubSyncTimer);
        if (!getGithubSettings().autoSync) return;
        githubSyncTimer = setInterval(() => {
            if (githubConfigured() && claimBackgroundCoordinator()) {
                githubSyncNow({ silent: true });
            }
        }, GITHUB_SYNC_INTERVAL_MS);
    }

    // ============================================================
    // CUSTOMER MESSAGING
    // ============================================================


    function escapeMessageHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function brandedMessageHtml({
        customerName,
        greeting = '',
        centerText = '',
        rightText = '',
        columns = [],
        footerTitle = '',
        footerLines = [],
        couponCode = ''
    }) {
        const safeName = escapeMessageHtml(customerName || 'Customer');
        const safeGreeting = escapeMessageHtml(greeting || '');
        const safeCenter = escapeMessageHtml(centerText);
        const safeRight = escapeMessageHtml(rightText);
        const headerColors = ['#f2c94c', '#53c7ff', '#ff9f43'];

        const cells = columns.slice(0, 3).map((col, index) => {
            const lines = (col.lines || []).map(item =>
                `<span style="color:#f3f3f3;">&#8226;&nbsp;${escapeMessageHtml(item)}</span><br>`
            ).join('');

            return `<td width="33%" valign="top" bgcolor="${index % 2 ? '#171717' : '#111111'}" ` +
                `style="width:33.333%;vertical-align:top;padding:12px 14px;` +
                `${index < 2 ? 'border-right:1px solid #333333;' : ''}">` +
                `<strong style="color:${headerColors[index]};font-size:15px;">${escapeMessageHtml(col.title || '')}</strong><br><br>` +
                lines +
                `</td>`;
        }).join('');

        const footer = (footerLines || []).map(line =>
            `<span style="color:#f3f3f3;">${escapeMessageHtml(line)}</span><br>`
        ).join('');
        const safeCoupon = String(couponCode || '').trim();
        const couponHref = safeCoupon
            ? `https://www.torn.com/messages.php#/p=compose&XID=${encodeURIComponent(OWNER_TORN_ID)}&subject=${encodeURIComponent(`Coupon Code ${safeCoupon}`)}`
            : '';
        const couponActionRow = safeCoupon
            ? `<tr><td colspan="3" bgcolor="#102614" align="center" style="padding:14px;text-align:center;border-top:2px solid #53d769;border-bottom:1px solid #2f6d39;">` +
              `<a href="${couponHref}" style="display:inline-block;background:#53d769;color:#071b0b;font-weight:bold;font-size:16px;text-decoration:none;padding:11px 18px;border:1px solid #8bf09a;border-radius:4px;">SEND MY COUPON CODE — ${escapeMessageHtml(safeCoupon)}</a><br>` +
              `<span style="display:inline-block;margin-top:7px;color:#d7f7dc;font-size:12px;">Opens a message to ${escapeMessageHtml(FAVORITE_PLAYER_NAME)} with your coupon code in the subject. Review it, then press Send.</span>` +
              `</td></tr>`
            : '';

        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" ` +
            `style="width:100%;max-width:900px;border-collapse:collapse;background-color:#0d0d0d;color:#f2f2f2;font-family:Arial,Helvetica,sans-serif;">` +
            `<tr><td colspan="3" bgcolor="#000000" align="center" style="padding:0;text-align:center;">` +
            `<img src="${SHOP_BANNER_URL}" alt="${escapeMessageHtml(SHOP_NAME)}" width="900" ` +
            `style="display:block;width:100%;max-width:900px;height:auto;border:0;">` +
            `</td></tr>` +
            (safeGreeting
                ? `<tr><td colspan="3" bgcolor="#121212" align="center" ` +
                  `style="padding:12px 14px;text-align:center;border-top:1px solid #333333;border-bottom:1px solid #333333;">` +
                  `<strong style="color:#f2c94c;font-size:18px;">${safeGreeting}</strong>` +
                  `</td></tr>`
                : '') +
            `<tr bgcolor="#1a1a1a">` +
            `<td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#ffffff;">${safeName}</strong></td>` +
            `<td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#53c7ff;">${safeCenter}</strong></td>` +
            `<td width="33%" align="center" style="width:33.333%;padding:10px;text-align:center;"><strong style="color:#f2c94c;">${safeRight}</strong></td>` +
            `</tr>` +
            couponActionRow +
            `<tr>${cells}</tr>` +
            `<tr><td colspan="3" bgcolor="#3a2a00" align="center" style="padding:12px 14px;text-align:center;border-top:2px solid #f2c94c;border-bottom:1px solid #6b5315;">` +
            `<strong style="color:#ffd95a;font-size:16px;">${escapeMessageHtml(FAVORITE_CTA)}</strong>` +
            `</td></tr>` +
            `<tr><td colspan="3" bgcolor="#181818" style="padding:11px 14px;border-top:1px solid #333333;">` +
            (footerTitle ? `<strong style="color:#9be564;font-size:14px;">${escapeMessageHtml(footerTitle)}</strong><br><br>` : '') +
            footer +
            `</td></tr>` +
            `</table>`;
    }

    function plainThreeColumnFallback({ customerName, greeting = '', centerText, rightText, columns, footerTitle, footerLines, couponCode = '' }) {
        const top = `${greeting ? `${greeting}\n\n` : ''}${customerName} | ${centerText} | ${rightText}`;
        const colText = columns.map(col =>
            `${col.title}\n${(col.lines || []).map(line => `• ${line}`).join('\n')}`
        ).join('\n\n');
        const footer = footerTitle
            ? `\n\n${footerTitle}\n${(footerLines || []).map(line => `• ${line}`).join('\n')}`
            : '';
        const safeCoupon = String(couponCode || '').trim();
        const couponLine = safeCoupon
            ? `\n\nSEND MY COUPON CODE — ${safeCoupon}\nhttps://www.torn.com/messages.php#/p=compose&XID=${OWNER_TORN_ID}&subject=${encodeURIComponent(`Coupon Code ${safeCoupon}`)}`
            : '';
        return `${top}\n\n${colText}${couponLine}\n\n★ ★ ★ ADD ME TO FAVORITES ★ ★ ★\n${FAVORITE_CTA}${footer}`;
    }

    function customerHasBeenContacted(customer) {
        return Boolean(customer?.contacted || customer?.firstMessageSent || Number(customer?.messageCount || 0) > 0);
    }

    function customerMessage(customer) {
        const db = dbLoad();
        const id = asId(customer.id);
        const coupon = ensureCoupon(db, customer);
        const username = displayUsername(customer);
        if (!username) throw new Error(`No resolved Torn username for [${id}].`);

        const firstContact = !customerHasBeenContacted(customer);
        const remaining = couponRemaining(coupon);
        const subject = firstContact ? `Welcome to ${SHOP_NAME}!` : `Welcome Back to ${SHOP_NAME}!`;
        const greeting = firstContact
            ? `WELCOME TO ${SHOP_NAME}, ${username}!`
            : `WELCOME BACK TO ${SHOP_NAME}, ${username}!`;

        const columns = [
            {
                title: 'HOW IT WORKS',
                lines: [
                    '1. Buy normally from my Bazaar',
                    '2. Message me your coupon code',
                    '3. I verify the purchase',
                    '4. Cashback is sent'
                ]
            },
            {
                title: 'CASHBACK TIERS',
                lines: [
                    '$50,000+ → $5,000 cashback',
                    '$250,000+ → $10,000 cashback',
                    '$1,000,000+ → $20,000 cashback'
                ]
            },
            {
                title: 'IMPORTANT',
                lines: [
                    'Purchases must be made after the coupon is issued',
                    'Qualifying purchases remain eligible for 24 hours',
                    'Each sale can only be used once'
                ]
            }
        ];

        const footerLines = [
            'Reply RESTOCK to receive restock notifications.',
            'Reply STOP at any time to leave the notification list.'
        ];

        const bodyHtml = brandedMessageHtml({
            customerName: username,
            greeting,
            centerText: `Coupon: ${coupon.code}`,
            rightText: `${remaining} redemption${remaining === 1 ? '' : 's'} remaining`,
            columns,
            footerTitle: 'RESTOCK ALERTS',
            footerLines,
            couponCode: coupon.code
        });

        const body = plainThreeColumnFallback({
            customerName: username,
            greeting,
            centerText: `Coupon: ${coupon.code}`,
            rightText: `${remaining} redemption${remaining === 1 ? '' : 's'} remaining`,
            columns,
            footerTitle: 'RESTOCK ALERTS',
            footerLines,
            couponCode: coupon.code
        });

        return { subject, body, bodyHtml, firstContact };
    }

    function couponReminderMessage(customer) {
        const db = dbLoad();
        const id = asId(customer.id);
        const coupon = ensureCoupon(db, customer);
        const username = displayUsername(customer);
        if (!username) throw new Error('No resolved Torn username for [' + id + '].');

        const remaining = couponRemaining(coupon);
        const q = couponQualification(db, coupon);
        const recentLine = q.qualified
            ? 'Your recent qualifying purchase currently qualifies for ' + money(q.cashback) + ' cashback.'
            : 'Your coupon is still available for your next qualifying purchase.';

        const columns = [
            { title: 'YOUR COUPON', lines: ['Code: ' + coupon.code, remaining + ' redemption' + (remaining === 1 ? '' : 's') + ' remaining', recentLine] },
            { title: 'HOW TO USE IT', lines: ['Buy normally from my Bazaar', 'Message me your coupon code after the purchase', 'I verify the purchase and send the refund manually'] },
            { title: 'CASHBACK TIERS', lines: ['$50,000+ → $5,000 cashback', '$250,000+ → $10,000 cashback', '$1,000,000+ → $20,000 cashback'] }
        ];

        const greeting = 'WELCOME BACK, ' + username + ' — DON\'T FORGET YOUR COUPON!';
        const footerLines = [
            'Qualifying purchases must be made after the coupon was issued.',
            'Eligible purchases remain available for 24 hours.',
            'Each sale can only be used once.'
        ];

        return {
            subject: SHOP_NAME + ' — Cashback coupon reminder',
            body: plainThreeColumnFallback({customerName: username, greeting: greeting, centerText: 'Coupon: ' + coupon.code, rightText: remaining + ' use' + (remaining === 1 ? '' : 's') + ' left', columns: columns, footerTitle: 'IMPORTANT', footerLines: footerLines, couponCode: coupon.code}),
            bodyHtml: brandedMessageHtml({customerName: username, greeting: greeting, centerText: 'Coupon: ' + coupon.code, rightText: remaining + ' use' + (remaining === 1 ? '' : 's') + ' left', columns: columns, footerTitle: 'IMPORTANT', footerLines: footerLines, couponCode: coupon.code}),
            qualified: q.qualified, cashback: q.cashback || 0
        };
    }

    function prepareCouponReminder(playerId) {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) return;
        const coupon = ensureCoupon(db, customer);
        if (!coupon?.issuedAt) { statusText = 'Coupon has not been issued yet.'; render(); return; }
        if (couponRemaining(coupon) <= 0) { statusText = 'No cashback redemptions remain for this customer.'; render(); return; }
        const msg = couponReminderMessage(customer);
        composeMessage(id, msg.subject, msg.body, msg.bodyHtml);
        statusText = 'Coupon reminder prepared for ' + (displayUsername(customer) || id) + '. Send remains manual.';
        render();
    }
    function composeMessage(playerId, subject, body, bodyHtml = '', options = {}) {
        const id = asId(playerId);
        const payload = {
            playerId: id,
            subject: String(subject || ''),
            body: String(body || ''),
            bodyHtml: String(bodyHtml || ''),
            createdAt: Date.now()
        };

        /*
            Keep a Tampermonkey-side copy of the compose payload.
            Torn's current message SPA may rewrite the hash while loading,
            so the destination tab must not depend only on URL parameters.
        */
        GM_setValue(PENDING_COMPOSE_KEY, payload);

        if (options?.autoDetectFirstSend) {
            GM_setValue(PENDING_FIRST_SEND_KEY, {
                playerId: id,
                subject: payload.subject,
                createdAt: Date.now(),
                composeOpenedAt: Date.now(),
                state: 'awaiting-send'
            });
        } else {
            GM_deleteValue(PENDING_FIRST_SEND_KEY);
        }

        const url = 'https://www.torn.com/messages.php#/p=compose' +
            '&XID=' + encodeURIComponent(id) +
            '&subject=' + encodeURIComponent(payload.subject);

        navigateFromCRM(url);
    }

    async function composeCustomer(customer) {
        const id = asId(customer.id);
        try {
            if (!hasRealUsername(customer)) {
                statusText = `Looking up customer [${id}]…`;
                render();
                await refreshCustomerUsername(id, true);
            }
            const db = dbLoad();
            const fresh = db.customers[id];
            if (!hasRealUsername(fresh)) throw new Error(`Could not resolve Torn username for [${id}].`);
            const message = customerMessage(fresh);
            composeMessage(id, message.subject, message.body, message.bodyHtml, { autoDetectFirstSend: Boolean(message.firstContact) });
            statusText = `Message prepared for ${displayUsername(fresh)}. Send remains manual.`;
        } catch (error) {
            statusText = `Message not opened: ${error?.message || String(error)}`;
            alert(statusText);
        }
        render();
    }

    function markCustomerContacted(playerId) {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) return;
        const first = !customerHasBeenContacted(customer);
        customer.contacted = true;
        customer.firstMessageSent = true;
        customer.messageCount = Number(customer.messageCount || 0) + 1;
        customer.lastContacted = nowIso();
        const coupon = ensureCoupon(db, customer);
        // Coupon begins when the first customer welcome is actually marked sent.
        if (first && !coupon.issuedAt) coupon.issuedAt = customer.lastContacted;
        rememberContactState(customer);
        dbSave(db);
        statusText = `${displayUsername(customer) || id} marked contacted.`;
        render();
    }


    function completeFirstMessageSend(playerId, source = 'auto-detect') {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) return false;

        // Idempotent: this automation is ONLY for the customer's first welcome message.
        if (customerHasBeenContacted(customer)) {
            GM_deleteValue(PENDING_FIRST_SEND_KEY);
            return false;
        }

        customer.contacted = true;
        customer.firstMessageSent = true;
        customer.messageCount = Math.max(1, Number(customer.messageCount || 0) + 1);
        customer.lastContacted = nowIso();

        const coupon = ensureCoupon(db, customer);
        if (!coupon.issuedAt) coupon.issuedAt = customer.lastContacted;

        rememberContactState(customer);
        dbSave(db);
        GM_deleteValue(PENDING_FIRST_SEND_KEY);

        statusText = `${displayUsername(customer) || id} first message detected as sent. Customer marked contacted; coupon activated.`;
        try { render(); } catch {}
        console.info('[MM CRM] First-message send completed', { playerId:id, source });
        return true;
    }

    // ============================================================
    // RESTOCK SUBSCRIBERS
    // ============================================================

    function subscribeCustomer(customer) {
        const db = dbLoad();
        const id = asId(customer.id);
        db.subscribers[id] = {
            id,
            name: customer.name || id,
            subscribedAt: db.subscribers[id]?.subscribedAt || nowIso(),
            lastPrepared: db.subscribers[id]?.lastPrepared || null,
            lastNotified: db.subscribers[id]?.lastNotified || null,
            pendingNotification: db.subscribers[id]?.pendingNotification || null,
            interests: Array.isArray(db.subscribers[id]?.interests) ? db.subscribers[id].interests : []
        };
        dbSave(db);
        statusText = `${displayUsername(customer) || id} added to restock alerts.`;
        render();
    }

    function unsubscribeCustomer(playerId) {
        const db = dbLoad();
        const id = asId(playerId);
        delete db.subscribers[id];
        dbSave(db);
        statusText = `Subscriber [${id}] removed.`;
        render();
    }

    function restockMessage(subscriber, item, quantity, price) {
        const name = displayUsername(subscriber) || 'there';
        const columns = [
            {
                title: 'RESTOCKED',
                lines: [
                    item,
                    `Quantity: ${quantity.toLocaleString()}`,
                    `Price: ${money(price)} each`
                ]
            },
            {
                title: 'HOW TO BUY',
                lines: [
                    'Open MANIC’S MAD HOUSE Bazaar',
                    'Buy normally from the Bazaar listing',
                    'Stock is first come, first served'
                ]
            },
            {
                title: 'IMPORTANT',
                lines: [
                    'Price and quantity can change quickly',
                    'This alert does not reserve inventory',
                    'Availability is based on current Bazaar stock'
                ]
            }
        ];
        const footerLines = ['Reply STOP if you no longer want restock alerts.'];

        return {
            subject: `${SHOP_NAME} Restock Alert`,
            body: plainThreeColumnFallback({
                customerName: name,
                greeting: `Good news, ${name} — an item is back in stock!`,
                centerText: item,
                rightText: `${quantity.toLocaleString()} available`,
                columns,
                footerTitle: 'RESTOCK ALERTS',
                footerLines
            }),
            bodyHtml: brandedMessageHtml({
                customerName: name,
                greeting: `Good news, ${name} — an item is back in stock!`,
                centerText: item,
                rightText: `${quantity.toLocaleString()} available`,
                columns,
                footerTitle: 'RESTOCK ALERTS',
                footerLines
            })
        };
    }


    function currentBazaarInventoryRows(db, subscriber = null) {
        const rows = Object.values(db.procurement?.bazaar || {})
            .map(row => ({
                id: asId(row.id),
                name: String(row.name || db.procurement?.catalog?.[asId(row.id)]?.name || `Item ${row.id || ''}`),
                quantity: Math.max(0, Number(row.quantity || 0)),
                price: Math.max(0, Number(row.price || 0))
            }))
            .filter(row => row.quantity > 0 && row.price >= 0);

        const filtered = subscriber
            ? rows.filter(row => subscriberInterestMatch(subscriber, row.id, row.name))
            : rows;

        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    function bazaarInventoryMessage(subscriber, rows, lastBazaarAt = null) {
        const name = displayUsername(subscriber) || 'there';
        const maxRows = 30;
        const visibleRows = rows.slice(0, maxRows);
        const omitted = Math.max(0, rows.length - visibleRows.length);
        const chunks = [[], [], []];

        visibleRows.forEach((row, index) => {
            chunks[index % 3].push(`${row.name} — Qty ${row.quantity.toLocaleString()} — ${money(row.price)} each`);
        });

        const columns = chunks.map((lines, index) => ({
            title: index === 0 ? 'CURRENT STOCK' : 'MORE STOCK',
            lines: lines.length ? lines : ['No additional items']
        }));

        const footerLines = [
            'Stock and prices can change quickly and are first come, first served.',
            ...(omitted ? [`${omitted.toLocaleString()} additional item${omitted === 1 ? '' : 's'} omitted to keep this message compact.`] : []),
            'Reply STOP if you no longer want restock alerts.'
        ];

        const totalUnits = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const centerText = `${rows.length.toLocaleString()} SKU${rows.length === 1 ? '' : 's'}`;
        const rightText = `${totalUnits.toLocaleString()} total units`;

        return {
            subject: `${SHOP_NAME} Current Bazaar Stock`,
            body: plainThreeColumnFallback({
                customerName: name,
                greeting: `Here’s what’s currently available at ${SHOP_NAME}, ${name}.`,
                centerText,
                rightText,
                columns,
                footerTitle: 'RESTOCK ALERTS',
                footerLines
            }),
            bodyHtml: brandedMessageHtml({
                customerName: name,
                greeting: `Here’s what’s currently available at ${SHOP_NAME}, ${name}.`,
                centerText,
                rightText,
                columns,
                footerTitle: 'RESTOCK ALERTS',
                footerLines
            }),
            listedCount: rows.length,
            includedCount: visibleRows.length,
            omittedCount: omitted,
            inventoryAsOf: lastBazaarAt || null
        };
    }

    async function refreshOwnBazaarInventoryForMessage() {
        if (!getApiKey()) return dbLoad();

        await refreshProcurementCatalog(false);
        const db = dbLoad();
        try {
            await syncOwnBazaar(db.procurement, db.procurement.catalog);
            dbSave(db);
            await flushDbWrites();
        } catch (error) {
            console.warn('[MM CRM] Bazaar inventory refresh before message failed', error);
            throw error;
        }
        return dbLoad();
    }

    async function prepareBazaarInventoryNotification(playerId) {
        const id = asId(playerId);
        let db = dbLoad();
        let sub = db.subscribers[id];
        if (!sub) return;

        statusText = `Refreshing Bazaar inventory for ${displayUsername(sub) || id}…`;
        render();

        try {
            db = await refreshOwnBazaarInventoryForMessage();
            sub = db.subscribers[id];
            if (!sub) return;

            const rows = currentBazaarInventoryRows(db, sub);
            if (!rows.length) {
                const interestText = sub.interests?.length
                    ? ` matching this subscriber's interests (${sub.interests.join(', ')})`
                    : '';
                alert(`No current Bazaar inventory${interestText} was found. Sync your Bazaar or update the subscriber's Interests.`);
                statusText = 'No matching Bazaar inventory to include.';
                render();
                return;
            }

            const msg = bazaarInventoryMessage(sub, rows, db.procurement?.lastBazaarAt);
            sub.lastPrepared = nowIso();
            sub.pendingNotification = {
                id: makeId('notice'),
                type: 'bazaar-inventory',
                item: 'Current Bazaar Inventory',
                quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
                price: 0,
                itemCount: rows.length,
                includedCount: msg.includedCount,
                omittedCount: msg.omittedCount,
                inventoryAsOf: db.procurement?.lastBazaarAt || null,
                preparedAt: sub.lastPrepared
            };
            dbSave(db);
            composeMessage(id, msg.subject, msg.body, msg.bodyHtml);

            statusText =
                `Bazaar inventory message prepared for ${displayUsername(sub) || id}: ` +
                `${msg.includedCount}/${msg.listedCount} item${msg.listedCount === 1 ? '' : 's'} included` +
                `${msg.omittedCount ? ` (${msg.omittedCount} omitted for message length)` : ''}.`;
            render();
        } catch (error) {
            statusText = `Could not prepare Bazaar inventory message: ${error?.message || String(error)}`;
            render();
        }
    }

    function prepareRestockNotification(playerId, item, quantity, price) {
        const db = dbLoad();
        const id = asId(playerId);
        const sub = db.subscribers[id];
        if (!sub) return;
        const catalogMatch = Object.values(db.procurement.catalog || {}).find(x => normalizeItemName(x.name) === normalizeItemName(item));
        if (!subscriberInterestMatch(sub, catalogMatch?.id || '', item)) {
            alert(`${sub.name || id} is not subscribed to ${item || 'this item'}. Update Interests first if you want to notify them.`);
            return;
        }
        if (!item || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
            alert('Enter a valid restock item, quantity, and price.');
            return;
        }
        const msg = restockMessage(sub, item, quantity, price);
        sub.lastPrepared = nowIso();
        sub.pendingNotification = { id: makeId('notice'), item, quantity, price, preparedAt: sub.lastPrepared };
        dbSave(db);
        composeMessage(id, msg.subject, msg.body, msg.bodyHtml);
        statusText = `Restock message prepared for ${displayUsername(sub) || id}. Mark notified only after sending.`;
        render();
    }

    function markSubscriberNotified(playerId) {
        const db = dbLoad();
        const id = asId(playerId);
        const sub = db.subscribers[id];
        if (!sub?.pendingNotification) return;
        const notice = { ...sub.pendingNotification, playerId: id, playerName: sub.name, sentAt: nowIso() };
        sub.lastNotified = notice.sentAt;
        sub.pendingNotification = null;
        db.notificationHistory.unshift(notice);
        db.notificationHistory = db.notificationHistory.slice(0, 500);
        dbSave(db);
        statusText = `Restock notification marked sent for ${displayUsername(sub) || id}.`;
        render();
    }

    function processCustomerCommand(playerId, command) {
        const id = asId(playerId);
        const text = String(command || '').trim().toUpperCase();
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) return false;
        if (text === 'RESTOCK') { subscribeCustomer(customer); return true; }
        if (text === 'STOP') { unsubscribeCustomer(id); return true; }
        return false;
    }

    // ============================================================
    // CASHBACK REFUNDS
    // ============================================================

    function startCouponRefund(playerId) {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        const coupon = db.coupons[id];
        if (!customer || !coupon) return;
        const q = couponQualification(db, coupon);
        if (!q.qualified) {
            alert(q.reason);
            return;
        }
        const refundId = makeId('refund');
        db.refunds[refundId] = {
            id: refundId,
            playerId: id,
            playerName: customer.name || id,
            couponCode: coupon.code,
            amount: q.cashback,
            purchaseTotal: q.total,
            saleIds: q.sales.map(s => String(s.id)),
            status: 'pending',
            createdAt: nowIso(),
            completedAt: null,
            cancelledAt: null
        };
        coupon.pendingRefundId = refundId;
        dbSave(db);
        statusText = `Cashback refund created for ${displayUsername(customer) || id}: ${money(q.cashback)}.`;
        render();
    }

    async function completeRefund(refundId) {
        const id = asId(refundId);
        const db = dbLoad();
        const refund = db.refunds[id];
        if (!refund) {
            statusText = 'Cashback record was not found.';
            render();
            return false;
        }
        if (refund.status === 'completed') {
            statusText = `Cashback ${money(refund.amount)} was already marked paid.`;
            render();
            return true;
        }
        if (refund.status !== 'pending') {
            statusText = `Cashback cannot be completed because its status is ${refund.status || 'unknown'}.`;
            render();
            return false;
        }

        const coupon = db.coupons[refund.playerId];
        if (!coupon) {
            statusText = 'Cashback coupon record is missing; no data changed.';
            render();
            return false;
        }

        // Repair stale pending linkage rather than refusing a valid pending refund.
        const conflictingPending = asId(coupon.pendingRefundId);
        if (conflictingPending && conflictingPending !== id && db.refunds[conflictingPending]?.status === 'pending') {
            statusText = 'Another cashback refund is still pending for this customer.';
            render();
            return false;
        }

        refund.status = 'completed';
        refund.completedAt = nowIso();

        coupon.redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
        const alreadyRecorded = coupon.redemptions.some(r => asId(r.refundId) === id);
        if (!alreadyRecorded) {
            coupon.redemptions.push({
                refundId: id,
                amount: refund.amount,
                purchaseTotal: refund.purchaseTotal,
                saleIds: [...(refund.saleIds || [])],
                completedAt: refund.completedAt
            });
        }
        coupon.uses = Math.max(Number(coupon.uses || 0), coupon.redemptions.length);
        coupon.pendingRefundId = null;

        dbSave(db);
        await flushDbWrites();

        const persisted = dbLoad();
        const savedRefund = persisted.refunds[id];
        const savedCoupon = persisted.coupons[refund.playerId];
        const savedRedemption = savedCoupon?.redemptions?.some(r => asId(r.refundId) === id);
        if (savedRefund?.status !== 'completed' || !savedRedemption) {
            statusText = 'Cashback update could not be verified in storage. Try Mark paid again.';
            render();
            return false;
        }

        statusText = `Cashback ${money(refund.amount)} marked paid and saved. Uses remaining: ${couponRemaining(savedCoupon)}.`;
        render();
        return true;
    }

    function cancelRefund(refundId) {
        const db = dbLoad();
        const refund = db.refunds[refundId];
        if (!refund || refund.status !== 'pending') return;
        refund.status = 'cancelled';
        refund.cancelledAt = nowIso();
        const coupon = db.coupons[refund.playerId];
        if (coupon?.pendingRefundId === refundId) coupon.pendingRefundId = null;
        dbSave(db);
        statusText = 'Pending refund cancelled.';
        render();
    }

    function refundProfileUrl(refund) {
        const message = `Cashback refund from ${SHOP_NAME} - coupon ${refund.couponCode}`;
        const url = new URL('https://www.torn.com/profiles.php');
        url.searchParams.set('XID', refund.playerId);
        url.searchParams.set('mmcrm_refund', refund.id);
        url.searchParams.set('mmcrm_amount', String(refund.amount));
        url.searchParams.set('mmcrm_message', message);
        return url.toString();
    }

    function openRefundProfile(refund) {
        navigateFromCRM(refundProfileUrl(refund));
    }

    function visible(el) {
        if (!el || !el.isConnected) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    }

    function setNativeValue(element, value) {
        if (!element) return;
        const win = element.ownerDocument?.defaultView || window;
        const tag = String(element.tagName || '').toLowerCase();
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement?.prototype : win.HTMLInputElement?.prototype;
        const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;

        if (setter) setter.call(element, String(value));
        else element.value = String(value);

        // React-style controlled inputs can keep an internal value tracker.
        try {
            if (element._valueTracker) element._valueTracker.setValue('');
        } catch {}

        try {
            element.dispatchEvent(new win.InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: String(value)
            }));
        } catch {
            element.dispatchEvent(new win.Event('input', { bubbles: true }));
        }

        element.dispatchEvent(new win.Event('change', { bubbles: true }));
        element.dispatchEvent(new win.Event('blur', { bubbles: true }));
    }

    function findGiveMoneyContainer() {
        const candidates = [...document.querySelectorAll('div,section,form')].filter(visible);
        return candidates.find(el => /give\s+(some\s+)?money/i.test(el.innerText || '')) || null;
    }

    function findGiveMoneyTrigger() {
        return [...document.querySelectorAll('button,a,[role="button"]')]
            .filter(visible)
            .find(el => /give\s+(some\s+)?money/i.test((el.innerText || el.textContent || '').trim())) || null;
    }

    function fillRefundForm() {
        if (!location.pathname.includes('profiles.php')) return;
        const params = new URLSearchParams(location.search);
        const refundId = params.get('mmcrm_refund');
        const amount = Number(params.get('mmcrm_amount'));
        const message = params.get('mmcrm_message') || '';
        const xid = asId(params.get('XID'));
        if (!refundId || !xid || !Number.isFinite(amount) || amount <= 0) return;

        let attempts = 0;
        let clicked = false;
        const timer = setInterval(() => {
            attempts++;
            let container = findGiveMoneyContainer();
            if (!container && !clicked && attempts >= 4) {
                const trigger = findGiveMoneyTrigger();
                if (trigger) { clicked = true; trigger.click(); }
            }
            container = findGiveMoneyContainer();
            if (container) {
                const inputs = [...container.querySelectorAll('input')].filter(visible);
                const amountInput = inputs.find(input => {
                    const meta = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
                    return /amount|money|cash/.test(meta);
                });
                const messageInput = [...container.querySelectorAll('textarea,input')].filter(visible).find(input => {
                    const meta = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
                    return /message|reason|note/.test(meta);
                });
                if (amountInput) {
                    setNativeValue(amountInput, amount);
                    if (messageInput) setNativeValue(messageInput, message);
                    clearInterval(timer);
                    statusText = `Refund form prepared for [${xid}] — final Send remains manual.`;
                    render();
                }
            }
            if (attempts >= 60) clearInterval(timer);
        }, 250);
    }

    // ============================================================
    // TORN MESSAGE COMPOSER PREFILL
    // ============================================================

    function getComposeParams() {
        const hash = location.hash || '';
        const amp = hash.indexOf('&');
        return amp >= 0 ? new URLSearchParams(hash.slice(amp + 1)) : new URLSearchParams();
    }

    function composePayloadForCurrentPage() {
        const params = getComposeParams();
        const xid = asId(params.get('XID') || params.get('xid') || '');

        const pending = GM_getValue(PENDING_COMPOSE_KEY, null);
        if (pending && typeof pending === 'object') {
            if (Date.now() - Number(pending.createdAt || 0) > 5 * 60 * 1000) {
                GM_deleteValue(PENDING_COMPOSE_KEY);
            } else {
                const pendingId = asId(pending.playerId);
                if (!xid || !pendingId || xid === pendingId) {
                    return {
                        playerId: pendingId || xid,
                        subject: String(pending.subject || ''),
                        body: String(pending.body || ''),
                        bodyHtml: String(pending.bodyHtml || ''),
                        source: 'storage'
                    };
                }
            }
        }

        // URL values are fallback only. Rich CRM payload must win.
        const urlSubject = params.get('subject');
        const urlBody = params.get('body');
        if (urlSubject !== null || urlBody !== null) {
            return {
                playerId: xid,
                subject: urlSubject || '',
                body: urlBody || '',
                bodyHtml: '',
                source: 'url'
            };
        }

        return null;
    }

    function elementMeta(element) {
        if (!element) return '';
        const labelText = element.labels
            ? [...element.labels].map(label => label.textContent || '').join(' ')
            : '';
        return [
            element.name,
            element.id,
            element.placeholder,
            element.getAttribute('aria-label'),
            element.getAttribute('data-placeholder'),
            element.getAttribute('title'),
            labelText
        ].filter(Boolean).join(' ').toLowerCase();
    }

    function findComposeSubjectInput() {
        const preferredSelectors = [
            'input[placeholder="Subject"]',
            'input[placeholder*="subject" i]',
            'input[name*="subject" i]',
            'input[id*="subject" i]',
            'input[aria-label*="subject" i]',
            'textarea[placeholder="Subject"]',
            'textarea[placeholder*="subject" i]'
        ];

        for (const selector of preferredSelectors) {
            const el = [...document.querySelectorAll(selector)].find(visible);
            if (el) return el;
        }

        const candidates = [...document.querySelectorAll(
            'input:not([type="hidden"]), textarea'
        )].filter(visible);

        return candidates.find(el => /subject|title/.test(elementMeta(el))) || null;
    }

    function findComposeBodyInput(subjectInput) {
        const textareas = [...document.querySelectorAll('textarea')].filter(visible);
        const labelledTextarea = textareas.find(el => /message|body|mail|content/.test(elementMeta(el)));
        if (labelledTextarea && labelledTextarea !== subjectInput) return labelledTextarea;

        const editables = [...document.querySelectorAll(
            '[contenteditable="true"], [role="textbox"][contenteditable], [role="textbox"]'
        )].filter(visible);

        const labelledEditable = editables.find(el =>
            el !== subjectInput &&
            /message|body|mail|content|write|compose/.test(elementMeta(el))
        );
        if (labelledEditable) return labelledEditable;

        const unlabelledEditable = editables.find(el => el !== subjectInput);
        if (unlabelledEditable) return unlabelledEditable;

        return textareas.find(el => el !== subjectInput) || null;
    }



    function findTornCodeEditorToggle() {
        const exactSelectors = [
            '[aria-label="Toggle Code Editor"]',
            '[title="Toggle Code Editor"]',
            'button[aria-label*="Code Editor" i]',
            'button[title*="Code Editor" i]',
            '[role="button"][aria-label*="Code Editor" i]',
            '[role="button"][title*="Code Editor" i]'
        ];

        for (const selector of exactSelectors) {
            const found = [...document.querySelectorAll(selector)].find(visible);
            if (found) return found;
        }

        return [...document.querySelectorAll('button,a,[role="button"]')]
            .filter(visible)
            .find(el => {
                const meta = [
                    el.title,
                    el.getAttribute('aria-label'),
                    el.getAttribute('data-tooltip'),
                    el.textContent
                ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

                return meta === '{}' ||
                    meta === '{ }' ||
                    /toggle code editor|code editor|source code|source editor|html source/.test(meta);
            }) || null;
    }

    function sourceEditorCandidates() {
        const selectors = [
            'textarea',
            '.cm-content[contenteditable="true"]',
            '.CodeMirror textarea',
            '.monaco-editor textarea',
            '.monaco-editor [contenteditable="true"]',
            '[data-language="html"][contenteditable="true"]',
            '[data-mode="html"][contenteditable="true"]',
            '[role="textbox"][contenteditable="true"]'
        ];

        const set = new Set();
        for (const selector of selectors) {
            for (const el of document.querySelectorAll(selector)) {
                if (visible(el)) set.add(el);
            }
        }
        return [...set];
    }

    function likelyTornSourceEditor(before = new Set()) {
        const candidates = sourceEditorCandidates()
            .filter(el => !before.has(el))
            .filter(el => {
                const meta = elementMeta(el) + ' ' + String(el.className || '').toLowerCase();
                const rect = el.getBoundingClientRect?.();
                const largeEnough = !rect || rect.height >= 80 || rect.width >= 300;
                const codeLike = /code|source|html|editor|cm-|codemirror|monaco/.test(meta);
                const isTextarea = String(el.tagName || '').toLowerCase() === 'textarea';
                return largeEnough && (codeLike || isTextarea || el.isContentEditable);
            });

        if (candidates.length) return candidates[0];

        return sourceEditorCandidates()
            .find(el => {
                const meta = elementMeta(el) + ' ' + String(el.className || '').toLowerCase();
                return /code|source|html|cm-|codemirror|monaco/.test(meta);
            }) || null;
    }

    function getEditorText(element) {
        if (!element) return '';
        const tag = String(element.tagName || '').toLowerCase();
        if (tag === 'textarea' || tag === 'input') return String(element.value || '');
        return String(element.innerText || element.textContent || '');
    }

    function setSourceEditorValue(element, value) {
        if (!element) return false;
        const html = String(value || '');
        const tag = String(element.tagName || '').toLowerCase();
        const win = element.ownerDocument?.defaultView || window;

        try { element.focus(); } catch {}

        if (tag === 'textarea' || tag === 'input') {
            setNativeValue(element, html);
            dispatchEditorEvents(element);
            return getEditorText(element).includes('<table') && getEditorText(element).includes('HOW IT WORKS');
        }

        try {
            element.textContent = html;
            element.dispatchEvent(new win.InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: html
            }));
        } catch {
            try { element.dispatchEvent(new win.Event('input', { bubbles: true })); } catch {}
        }

        dispatchEditorEvents(element);
        const current = getEditorText(element);
        return current.includes('<table') && current.includes('HOW IT WORKS');
    }

    function sleepMs(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForValue(getter, timeoutMs = 1800, intervalMs = 50) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const value = getter();
            if (value) return value;
            await sleepMs(intervalMs);
        }
        return null;
    }

    function expectedGreetingFromHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = String(html || '');
        const text = String(temp.textContent || '').replace(/\s+/g, ' ').trim();
        const match = text.match(/WELCOME(?: BACK)? TO MANIC'S MAD HOUSE,\s*[^!]+!/i);
        return match ? match[0] : '';
    }

    function verifyRenderedBrandedMessage(html) {
        const greeting = expectedGreetingFromHtml(html);
        const pageText = String(document.body?.innerText || '').replace(/\s+/g, ' ');

        if (greeting && !pageText.toLowerCase().includes(greeting.toLowerCase())) return false;
        if (!pageText.includes('HOW IT WORKS')) return false;
        if (!pageText.includes('CASHBACK TIERS') && String(html).includes('CASHBACK TIERS')) return false;
        if (!pageText.includes('IMPORTANT') && String(html).includes('IMPORTANT')) return false;

        const matchingTable = [...document.querySelectorAll('table')].find(table => {
            if (!visible(table)) return false;
            const t = String(table.innerText || table.textContent || '');
            return t.includes('HOW IT WORKS') &&
                (!String(html).includes('CASHBACK TIERS') || t.includes('CASHBACK TIERS')) &&
                (!String(html).includes('IMPORTANT') || t.includes('IMPORTANT'));
        });

        return Boolean(matchingTable);
    }

    async function injectHtmlThroughTornCodeEditor(htmlValue) {
        const html = String(htmlValue || '').replace(/>\s+</g, '><').trim();
        if (!html) return false;

        const toggle = findTornCodeEditorToggle();
        if (!toggle) return false;

        const before = new Set(sourceEditorCandidates());

        try { toggle.click(); } catch { return false; }

        const source = await waitForValue(() => likelyTornSourceEditor(before), 2000, 50);
        if (!source) {
            // Try to return to visual mode if the click partially switched state.
            try { toggle.click(); } catch {}
            return false;
        }

        const sourceOK = setSourceEditorValue(source, html);
        if (!sourceOK) {
            try { toggle.click(); } catch {}
            return false;
        }

        // Give Torn's editor state time to consume the source value before
        // switching back to the visual editor.
        await sleepMs(120);

        const toggleBack = findTornCodeEditorToggle() || toggle;
        try { toggleBack.click(); } catch { return false; }

        await sleepMs(180);
        return verifyRenderedBrandedMessage(html);
    }

    function dispatchEditorEvents(element) {
        const win = element?.ownerDocument?.defaultView || window;
        for (const type of ['input', 'change', 'keyup', 'blur']) {
            try { element.dispatchEvent(new win.Event(type, { bubbles: true })); } catch {}
        }
    }

    function setComposeField(element, value, htmlValue = '') {
        if (!element) return false;
        const text = String(value || '');
        const richHtml = String(htmlValue || '');
        const tag = String(element.tagName || '').toLowerCase();

        if (tag === 'input' || tag === 'textarea') {
            setNativeValue(element, text);
            dispatchEditorEvents(element);
            return String(element.value || '') === text;
        }

        const richTarget =
            element.isContentEditable ||
            element.getAttribute?.('contenteditable') === 'true' ||
            element.getAttribute?.('role') === 'textbox' ||
            tag === 'body';

        if (richTarget) {
            try { element.focus(); } catch {}
            try {
                if (richHtml) element.innerHTML = richHtml;
                else element.textContent = text;
            } catch {
                return false;
            }

            dispatchEditorEvents(element);

            if (richHtml) {
                const hasBanner = Boolean(element.querySelector?.(`img[src="${SHOP_BANNER_URL}"]`));
                const hasTable = Boolean(element.querySelector?.('table'));
                return hasBanner && hasTable;
            }

            return String(element.innerText || element.textContent || '').trim() === text.trim();
        }

        return false;
    }

    function fillMessageComposer() {
        if (!location.pathname.includes('messages.php')) return;

        const payload = composePayloadForCurrentPage();
        if (!payload || (!payload.subject && !payload.body && !payload.bodyHtml)) return;

        let attempts = 0;
        let observer = null;
        let timer = null;
        let inFlight = false;
        let finished = false;

        const stop = success => {
            finished = true;
            if (timer) clearInterval(timer);
            if (observer) observer.disconnect();

            if (success) {
                GM_deleteValue(PENDING_COMPOSE_KEY);
                statusText = `Message fields prepared for [${payload.playerId || 'recipient'}]. Send remains manual.`;
            } else {
                statusText = payload.bodyHtml
                    ? 'Torn rich message preparation failed verification. The pending message was preserved; nothing was sent.'
                    : 'Torn message composer fields could not be prepared.';
            }
            try { render(); } catch {}
        };

        const tryFill = async () => {
            if (finished || inFlight) return false;
            inFlight = true;
            attempts++;

            try {
                const subjectInput = findComposeSubjectInput();
                let subjectOK = false;

                if (subjectInput) {
                    setNativeValue(subjectInput, payload.subject);
                    await sleepMs(25);
                    subjectOK = String(subjectInput.value || '').trim() === String(payload.subject || '').trim();

                    if (!subjectOK) {
                        setNativeValue(subjectInput, payload.subject);
                        await sleepMs(25);
                        subjectOK = String(subjectInput.value || '').trim() === String(payload.subject || '').trim();
                    }
                }

                let bodyOK = false;

                if (payload.bodyHtml) {
                    bodyOK = await injectHtmlThroughTornCodeEditor(payload.bodyHtml);
                } else {
                    const bodyInput = findComposeBodyInput(subjectInput);
                    if (bodyInput) bodyOK = setComposeField(bodyInput, payload.body);
                }

                if (subjectOK && bodyOK) {
                    stop(true);
                    return true;
                }

                if (attempts >= 40) stop(false);
                return false;
            } finally {
                inFlight = false;
            }
        };

        tryFill();

        timer = setInterval(() => {
            if (!finished) tryFill();
        }, 750);

        observer = new MutationObserver(() => {
            if (!finished && attempts < 40) tryFill();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    // ============================================================
    // MANUAL CUSTOMER MANAGEMENT
    // ============================================================

    async function addManualCustomer(playerId) {
        const id = asId(playerId);
        if (!/^\d+$/.test(id)) { alert('Enter a valid Torn player ID.'); return; }
        const db = dbLoad();
        if (isCustomerRemoved(db, id)) {
            markCustomerReactivated(db, id, Date.now(), 'manual-add');
        }
        if (!db.customers[id]) {
            const customer = ensureCustomer(db, id, id);
            customer.manual = true;
            ensureCoupon(db, customer);
        } else {
            ensureCoupon(db, db.customers[id]);
        }
        dbSave(db);
        try {
            await refreshCustomerUsername(id, true);
            statusText = `Customer [${id}] added/refreshed.`;
        } catch (error) {
            statusText = `Customer [${id}] saved, but username lookup failed: ${error?.message || String(error)}`;
        }
        render();
    }

    function removeCustomer(playerId) {
        const id = asId(playerId);
        const db = dbLoad();
        const customer = db.customers[id];
        if (!customer) return;

        const label = displayUsername(customer) || `[${id}]`;
        if (!confirm(
            `Remove ${label} from the active CRM list?\n\n` +
            `Their sales ledger and CRM history are preserved. Future purchases remain tracked, ` +
            `but Rebuild Sales History will keep this customer filtered from the active list.`
        )) return;

        const priorRemoval = db.removedCustomers[id] || {};
        db.removedCustomers[id] = {
            ...priorRemoval,
            playerId: id,
            playerName: displayUsername(customer) || customer.name || priorRemoval.playerName || id,
            removedAt: nowIso(),
            reactivatedAt: priorRemoval.reactivatedAt || null,
            reactivatedReason: priorRemoval.reactivatedReason || null
        };
        delete db.customers[id];
        delete db.subscribers[id];
        dbSave(db);

        statusText = `${label} removed from active CRM. Sales remain tracked and rebuild will preserve the filter.`;
        render();
    }

    function restoreRemovedCustomer(playerId) {
        const id = asId(playerId);
        const db = dbLoad();
        const removed = db.removedCustomers[id];
        if (!removed || !isRemovalRecordActive(removed)) return false;

        markCustomerReactivated(db, id, Date.now(), 'manual-restore');
        const customer = ensureCustomer(db, id, removed.playerName || id);
        customer.purchases = 0;
        customer.units = 0;
        customer.spent = 0;
        customer.firstPurchase = null;
        customer.lastPurchase = null;

        const sales = Object.values(db.sales)
            .filter(s => asId(s.playerId) === id)
            .sort((a,b) => Number(a.timestamp) - Number(b.timestamp));

        for (const sale of sales) applySaleToCustomer(db, sale, removed.playerName || sale.playerName || id);
        dbSave(db);
        statusText = `${removed.playerName || `[${id}]`} restored with ${sales.length} tracked sale${sales.length === 1 ? '' : 's'}.`;
        render();
        return true;
    }


    // ============================================================
    // FACTION INVENTORY MANAGER — v7.4
    // ============================================================

    function factionEpochMs(value) {
        let n = Number(value || 0);
        if (!(n > 0)) return 0;
        if (n < 100_000_000_000) n *= 1000;
        return n;
    }

    function factionInventoryKey(category, itemId) {
        return String(category || '') + '|' + asId(itemId);
    }

    function addFactionInventoryDiagnostic(state, text) {
        state.diagnostics = Array.isArray(state.diagnostics) ? state.diagnostics : [];
        state.diagnostics.unshift({ at: nowIso(), text: String(text || '') });
        state.diagnostics = state.diagnostics.slice(0, 40);
    }

    function mergeFactionInventoryStates(latestState, incomingState) {
        const oldState = latestState && typeof latestState === 'object' ? deepClone(latestState) : {};
        const newState = incomingState && typeof incomingState === 'object' ? deepClone(incomingState) : {};
        const out = {
            current: newState.current && typeof newState.current === 'object' ? newState.current : {},
            snapshots: Array.isArray(newState.snapshots) ? newState.snapshots : [],
            events: Array.isArray(newState.events) ? newState.events : [],
            thresholds: newState.thresholds && typeof newState.thresholds === 'object' ? newState.thresholds : {},
            inventoryTimestamp: newState.inventoryTimestamp || null,
            lastSyncAt: newState.lastSyncAt || null,
            nextUsefulRefreshAt: newState.nextUsefulRefreshAt || null,
            diagnostics: Array.isArray(newState.diagnostics) ? newState.diagnostics : [],
            settings: newState.settings && typeof newState.settings === 'object' ? newState.settings : {}
        };

        const oldSourceAt = Date.parse(oldState.inventoryTimestamp || '') || 0;
        const newSourceAt = Date.parse(out.inventoryTimestamp || '') || 0;
        const oldFetchAt = Date.parse(oldState.lastSyncAt || '') || 0;
        const newFetchAt = Date.parse(out.lastSyncAt || '') || 0;
        if (oldSourceAt > newSourceAt || (oldSourceAt === newSourceAt && oldFetchAt > newFetchAt)) {
            out.current = deepClone(oldState.current || {});
            out.inventoryTimestamp = oldState.inventoryTimestamp || out.inventoryTimestamp;
            out.lastSyncAt = oldState.lastSyncAt || out.lastSyncAt;
            out.nextUsefulRefreshAt = oldState.nextUsefulRefreshAt || out.nextUsefulRefreshAt;
        }

        const thresholds = {};
        const ids = new Set([...Object.keys(oldState.thresholds || {}), ...Object.keys(out.thresholds || {})]);
        for (const id of ids) {
            const a = oldState.thresholds?.[id];
            const b = out.thresholds?.[id];
            if (!a) { thresholds[id] = deepClone(b); continue; }
            if (!b) { thresholds[id] = deepClone(a); continue; }
            const at = Date.parse(a.updatedAt || '') || 0;
            const bt = Date.parse(b.updatedAt || '') || 0;
            thresholds[id] = deepClone(bt >= at ? b : a);
        }
        out.thresholds = thresholds;

        const oldSettingsAt = Date.parse(oldState.settings?.updatedAt || '') || 0;
        const newSettingsAt = Date.parse(out.settings?.updatedAt || '') || 0;
        if (oldSettingsAt > newSettingsAt) out.settings = deepClone(oldState.settings || {});

        const snapshotMap = new Map();
        for (const snap of [...(oldState.snapshots || []), ...(out.snapshots || [])]) {
            if (!snap || typeof snap !== 'object') continue;
            const key = String(snap.inventoryTimestamp || snap.at || '');
            if (!key) continue;
            const prior = snapshotMap.get(key);
            if (!prior || Number(snap.at || 0) >= Number(prior.at || 0)) snapshotMap.set(key, deepClone(snap));
        }
        out.snapshots = [...snapshotMap.values()]
            .sort((a,b) => Number(a.at||0) - Number(b.at||0))
            .slice(-FACTION_INVENTORY_SNAPSHOT_MAX);

        const eventMap = new Map();
        for (const event of [...(oldState.events || []), ...(out.events || [])]) {
            if (!event || typeof event !== 'object') continue;
            const key = String(event.signature || [event.observedAt,event.key].join('|'));
            if (!key) continue;
            eventMap.set(key, deepClone(event));
        }
        out.events = [...eventMap.values()]
            .sort((a,b) => Number(a.observedAt||0) - Number(b.observedAt||0))
            .slice(-FACTION_INVENTORY_EVENT_MAX);

        const diagnosticMap = new Map();
        for (const d of [...(oldState.diagnostics || []), ...(out.diagnostics || [])]) {
            if (!d || typeof d !== 'object') continue;
            const key = String(d.at || '') + '|' + String(d.text || '');
            diagnosticMap.set(key, deepClone(d));
        }
        out.diagnostics = [...diagnosticMap.values()]
            .sort((a,b) => (Date.parse(b.at||'')||0) - (Date.parse(a.at||'')||0))
            .slice(0,40);

        return out;
    }

    function factionInventoryRowsFromResponse(data) {
        const rows = data?.inventory ?? data?.data?.inventory ?? [];
        return Array.isArray(rows) ? rows : [];
    }

    function factionInventoryTotalFromResponse(data) {
        return Math.max(
            0,
            Number(
                data?._metadata?.total ??
                data?._metadata?.pagination?.total ??
                data?.metadata?.total ??
                0
            ) || 0
        );
    }

    async function fetchFactionInventoryCategory(category) {
        const cat = String(category || '');
        if (!FACTION_INVENTORY_CATEGORIES.includes(cat)) throw new Error('Invalid faction inventory category: ' + cat);
        const key = factionInventoryApiKey();
        if (!key) throw new Error('No Torn API key is available for faction inventory.');

        const rows = [];
        const seenRows = new Set();
        const sourceTimes = new Set();
        let offset = 0;
        let pages = 0;
        let inventoryTimestamp = 0;

        while (pages < 25) {
            const url = new URL(API_BASE + '/faction/inventory');
            url.searchParams.set('cat', cat);
            url.searchParams.set('limit', '100');
            if (offset > 0) url.searchParams.set('offset', String(offset));

            const data = await apiRequest(url.toString(), key);
            const pageRows = factionInventoryRowsFromResponse(data);
            const pageSourceAt = factionEpochMs(data?.inventory_timestamp);
            if (pageSourceAt > 0) sourceTimes.add(pageSourceAt);
            if (sourceTimes.size > 1) {
                throw new Error('Faction inventory cache changed during pagination for ' + cat + '; retry after the source stabilizes.');
            }

            for (const row of pageRows) {
                const uids = (Array.isArray(row?.uids) ? row.uids : []).map(asId).filter(Boolean);
                const signature = [
                    asId(row?.id),
                    asId(row?.loaned?.id),
                    Number(row?.amount || 0),
                    uids.join(',')
                ].join('|');
                if (seenRows.has(signature)) continue;
                seenRows.add(signature);
                rows.push(row);
            }
            inventoryTimestamp = Math.max(inventoryTimestamp, pageSourceAt);
            pages++;

            const total = factionInventoryTotalFromResponse(data);
            if (!pageRows.length || pageRows.length < 100 || (total > 0 && offset + pageRows.length >= total)) break;
            offset += pageRows.length;
        }

        if (pages >= 25) throw new Error('Faction inventory pagination exceeded safety limit for ' + cat + '.');
        return { category: cat, rows, inventoryTimestamp };
    }

    function normalizeFactionInventoryResults(categoryResults, fetchedAt = Date.now()) {
        const current = {};

        for (const group of categoryResults || []) {
            const category = String(group?.category || '');
            if (!FACTION_INVENTORY_CATEGORIES.includes(category)) continue;

            for (const raw of group.rows || []) {
                const itemId = asId(raw?.id);
                if (!itemId) continue;
                const key = factionInventoryKey(category, itemId);
                if (!current[key]) {
                    current[key] = {
                        key,
                        category,
                        itemId,
                        name: String(raw?.name || ('Item ' + itemId)),
                        type: String(raw?.type || ''),
                        amountOwned: 0,
                        availableCount: 0,
                        loanedCount: 0,
                        availableUids: [],
                        loans: [],
                        uidCount: 0,
                        fetchedAt
                    };
                }

                const item = current[key];
                const amount = Math.max(0, Math.round(Number(raw?.amount || 0)));
                const uids = [...new Set((Array.isArray(raw?.uids) ? raw.uids : []).map(asId).filter(Boolean))];
                item.amountOwned += amount;
                item.uidCount += uids.length;

                const loaned = raw?.loaned && typeof raw.loaned === 'object' ? raw.loaned : null;
                if (loaned?.id != null) {
                    item.loanedCount += amount;
                    const memberId = asId(loaned.id);
                    let loan = item.loans.find(x => x.memberId === memberId);
                    if (!loan) {
                        loan = {
                            memberId,
                            memberName: String(loaned.name || memberId),
                            amount: 0,
                            uids: []
                        };
                        item.loans.push(loan);
                    }
                    loan.amount += amount;
                    loan.uids = [...new Set([...loan.uids, ...uids])];
                } else {
                    item.availableCount += amount;
                    item.availableUids = [...new Set([...item.availableUids, ...uids])];
                }
            }
        }

        for (const item of Object.values(current)) {
            item.loans.sort((a,b) => String(a.memberName).localeCompare(String(b.memberName)));
        }
        return current;
    }

    function compactFactionInventorySnapshot(current, inventoryTimestamp, fetchedAt = Date.now()) {
        const items = {};
        for (const [key, item] of Object.entries(current || {})) {
            items[key] = {
                key,
                category: item.category,
                itemId: item.itemId,
                name: item.name,
                amountOwned: Number(item.amountOwned || 0),
                availableCount: Number(item.availableCount || 0),
                loanedCount: Number(item.loanedCount || 0),
                loans: FACTION_INVENTORY_LOAN_CATEGORIES.includes(String(item.category || ''))
                    ? (item.loans || []).map(loan => ({
                        memberId: asId(loan.memberId),
                        memberName: String(loan.memberName || loan.memberId || ''),
                        amount: Number(loan.amount || 0),
                        uids: Array.isArray(loan.uids) ? loan.uids.slice() : []
                    }))
                    : []
            };
        }
        return {
            at: Number(fetchedAt || Date.now()),
            inventoryTimestamp: Number(inventoryTimestamp || 0),
            items
        };
    }

    function recordFactionInventorySnapshot(state, current, inventoryTimestamp, fetchedAt = Date.now()) {
        state.snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
        state.events = Array.isArray(state.events) ? state.events : [];

        const sourceAt = Number(inventoryTimestamp || 0);
        const previous = state.snapshots[state.snapshots.length - 1] || null;
        if (previous && Number(previous.inventoryTimestamp || 0) === sourceAt) {
            return { snapshotAdded: false, eventsAdded: 0 };
        }

        const snapshot = compactFactionInventorySnapshot(current, sourceAt, fetchedAt);
        let eventsAdded = 0;

        if (previous) {
            const keys = new Set([...Object.keys(previous.items || {}), ...Object.keys(snapshot.items || {})]);
            for (const key of keys) {
                const oldItem = previous.items?.[key] || {};
                const newItem = snapshot.items?.[key] || {};
                const deltaOwned = Number(newItem.amountOwned || 0) - Number(oldItem.amountOwned || 0);
                const deltaAvailable = Number(newItem.availableCount || 0) - Number(oldItem.availableCount || 0);
                const deltaLoaned = Number(newItem.loanedCount || 0) - Number(oldItem.loanedCount || 0);
                if (!deltaOwned && !deltaAvailable && !deltaLoaned) continue;

                state.events.push({
                    signature: String(sourceAt) + '|' + key,
                    observedAt: sourceAt || Number(fetchedAt || Date.now()),
                    fetchedAt: Number(fetchedAt || Date.now()),
                    key,
                    category: newItem.category || oldItem.category || '',
                    itemId: newItem.itemId || oldItem.itemId || '',
                    name: newItem.name || oldItem.name || key,
                    deltaOwned,
                    deltaAvailable,
                    deltaLoaned,
                    amountOwned: Number(newItem.amountOwned || 0),
                    availableCount: Number(newItem.availableCount || 0),
                    loanedCount: Number(newItem.loanedCount || 0)
                });
                eventsAdded++;
            }
        }

        state.snapshots.push(snapshot);
        state.snapshots = state.snapshots.slice(-FACTION_INVENTORY_SNAPSHOT_MAX);
        state.events = state.events.slice(-FACTION_INVENTORY_EVENT_MAX);
        return { snapshotAdded: true, eventsAdded };
    }

    async function syncFactionInventory({ silent = false, force = false } = {}) {
        if (factionInventoryRunning) return { skipped: true, reason: 'running' };
        if (!factionInventoryApiKey()) {
            if (!silent) {
                statusText = 'Faction Inventory needs Faction → Inventory API access. Leadership must enable Faction API Access for your faction position; then use your own Limited/custom key or a compatible primary key.';
                render();
            }
            return { skipped: true, reason: 'missing-key' };
        }

        const existing = dbLoad();
        const nextUsefulRefreshAt = Date.parse(existing.factionInventory?.nextUsefulRefreshAt || '') || 0;
        if (!force && nextUsefulRefreshAt > Date.now()) {
            return { skipped: true, reason: 'cache-window' };
        }

        factionInventoryRunning = true;
        if (!silent) {
            statusText = 'Syncing faction armory categories from Torn…';
            render();
        }

        try {
            const groups = [];
            for (const category of FACTION_INVENTORY_CATEGORIES) {
                groups.push(await fetchFactionInventoryCategory(category));
            }

            const sourceTimes = [...new Set(groups.map(group => Number(group.inventoryTimestamp || 0)).filter(value => value > 0))];
            if (sourceTimes.length !== 1) {
                throw new Error(
                    sourceTimes.length
                        ? 'Faction inventory categories returned mixed Torn cache timestamps; no mixed snapshot was committed.'
                        : 'Faction inventory response did not include a usable inventory_timestamp.'
                );
            }
            const sourceAt = sourceTimes[0];
            const fetchedAt = Date.now();
            const current = normalizeFactionInventoryResults(groups, fetchedAt);
            const db = dbLoad();
            const state = db.factionInventory;
            const ledger = recordFactionInventorySnapshot(state, current, sourceAt, fetchedAt);

            state.current = current;
            state.inventoryTimestamp = sourceAt ? new Date(sourceAt).toISOString() : null;
            state.lastSyncAt = new Date(fetchedAt).toISOString();
            state.nextUsefulRefreshAt = new Date(Math.max(fetchedAt, sourceAt + FACTION_INVENTORY_SYNC_INTERVAL_MS)).toISOString();
            addFactionInventoryDiagnostic(
                state,
                'Faction inventory sync: ' + Object.keys(current).length + ' item/category rows; ' +
                ledger.eventsAdded + ' change event' + (ledger.eventsAdded === 1 ? '' : 's') +
                (ledger.snapshotAdded ? '; new source snapshot.' : '; source cache unchanged.')
            );

            dbSave(db);
            await flushDbWrites();

            if (!silent) {
                statusText =
                    'Faction Inventory synced: ' + Object.keys(current).length + ' item/category rows · ' +
                    ledger.eventsAdded + ' change event' + (ledger.eventsAdded === 1 ? '' : 's') + '.';
                render();
            }
            return {
                items: Object.keys(current).length,
                eventsAdded: ledger.eventsAdded,
                snapshotAdded: ledger.snapshotAdded,
                inventoryTimestamp: sourceAt
            };
        } catch (error) {
            const db = dbLoad();
            addFactionInventoryDiagnostic(db.factionInventory, 'Sync failed: ' + (error?.message || String(error)));
            dbSave(db);
            if (!silent) {
                statusText = 'Faction Inventory sync failed: ' + (error?.message || String(error));
                render();
            }
            throw error;
        } finally {
            factionInventoryRunning = false;
        }
    }

    function factionInventoryReferencePrice(db, itemId) {
        const id = asId(itemId);
        const snapshot = db.procurement?.marketSnapshots?.[id] || {};
        const live = [
            ['Bazaar', Number(snapshot?.bazaar?.lowest || 0)],
            ['Item Market', Number(snapshot?.itemMarket?.lowest || 0)]
        ].filter(([,price]) => price > 0).sort((a,b) => a[1] - b[1]);
        if (live.length) return { price: live[0][1], source: live[0][0] };

        const global = db.marketIntel?.marketplace?.[id] || {};
        const candidates = [
            ['TornW3B lowest', Number(global.lowestPrice || 0)],
            ['TornW3B market', Number(global.marketPrice || 0)],
            ['TornW3B bazaar avg', Number(global.bazaarAverage || 0)],
            ['Torn catalog', Number(db.procurement?.catalog?.[id]?.marketValue || 0)]
        ];
        const found = candidates.find(([,price]) => price > 0);
        return found ? { price: found[1], source: found[0] } : { price: 0, source: 'Unavailable' };
    }

    function factionInventoryThresholdState(db, item) {
        const config = db.factionInventory?.thresholds?.[asId(item.itemId)] || {};
        const target = Math.max(0, Math.round(Number(config.target || 0)));
        const automaticBasis = FACTION_INVENTORY_LOAN_CATEGORIES.includes(String(item.category || '')) ? 'available' : 'owned';
        const basis = ['owned','available'].includes(String(config.basis || '')) ? String(config.basis) : automaticBasis;
        const current = basis === 'available'
            ? Number(item.availableCount || 0)
            : Number(item.amountOwned || 0);
        const criticalRatio = Math.max(0.1, Math.min(0.95, Number(db.factionInventory?.settings?.criticalRatio || 0.5)));
        const shortfall = target > 0 ? Math.max(0, target - current) : 0;
        let status = 'UNSET';
        if (target > 0) {
            if (current <= target * criticalRatio) status = 'CRITICAL';
            else if (current < target) status = 'LOW';
            else status = 'GREEN';
        }
        return { target, basis, current, shortfall, status };
    }

    function setFactionInventoryThreshold(itemId, target, basis = 'auto') {
        const id = asId(itemId);
        const db = dbLoad();
        db.factionInventory.thresholds[id] = {
            target: Math.max(0, Math.round(Number(target || 0))),
            basis: ['auto','owned','available'].includes(String(basis || 'auto')) ? String(basis || 'auto') : 'auto',
            updatedAt: nowIso()
        };
        dbSave(db);
        render();
    }

    function factionInventoryRows(db) {
        return Object.values(db.factionInventory?.current || {}).map(item => {
            const threshold = factionInventoryThresholdState(db, item);
            const price = factionInventoryReferencePrice(db, item.itemId);
            return {
                ...item,
                threshold,
                referencePrice: price.price,
                priceSource: price.source,
                estimatedRestockCost: threshold.shortfall * price.price
            };
        }).sort((a,b) => {
            const priority = { CRITICAL:0, LOW:1, GREEN:2, UNSET:3 };
            return (priority[a.threshold.status] ?? 4) - (priority[b.threshold.status] ?? 4) ||
                String(a.category).localeCompare(String(b.category)) ||
                String(a.name).localeCompare(String(b.name));
        });
    }

    function factionLoanMemberRows(db) {
        const members = {};
        for (const item of Object.values(db.factionInventory?.current || {})) {
            for (const loan of item.loans || []) {
                const id = asId(loan.memberId);
                if (!members[id]) members[id] = {
                    memberId: id,
                    memberName: String(loan.memberName || id),
                    amount: 0,
                    items: []
                };
                members[id].amount += Number(loan.amount || 0);
                members[id].items.push({
                    itemId: item.itemId,
                    name: item.name,
                    category: item.category,
                    amount: Number(loan.amount || 0),
                    uids: Array.isArray(loan.uids) ? loan.uids.slice() : []
                });
            }
        }
        return Object.values(members).sort((a,b) => b.amount - a.amount || a.memberName.localeCompare(b.memberName));
    }

    function factionLoanPersistenceRows(db) {
        const snapshots = Array.isArray(db.factionInventory?.snapshots) ? db.factionInventory.snapshots : [];
        const latestSourceAt = snapshots.length
            ? Number(snapshots[snapshots.length - 1].inventoryTimestamp || snapshots[snapshots.length - 1].at || 0)
            : Date.parse(db.factionInventory?.inventoryTimestamp || '') || Date.now();
        const rows = [];

        for (const item of Object.values(db.factionInventory?.current || {})) {
            if (!FACTION_INVENTORY_LOAN_CATEGORIES.includes(String(item.category || ''))) continue;
            for (const loan of item.loans || []) {
                const memberId = asId(loan.memberId);
                let observedSince = latestSourceAt;

                for (let i = snapshots.length - 1; i >= 0; i--) {
                    const snap = snapshots[i];
                    const snapItem = snap?.items?.[item.key];
                    const present = (snapItem?.loans || []).some(x => asId(x.memberId) === memberId);
                    if (!present) break;
                    observedSince = Number(snap.inventoryTimestamp || snap.at || observedSince);
                }

                rows.push({
                    key: item.key,
                    itemId: item.itemId,
                    name: item.name,
                    category: item.category,
                    memberId,
                    memberName: String(loan.memberName || memberId),
                    amount: Number(loan.amount || 0),
                    uids: Array.isArray(loan.uids) ? loan.uids.slice() : [],
                    observedSince,
                    observedHours: observedSince && latestSourceAt >= observedSince
                        ? (latestSourceAt - observedSince) / 3600000
                        : 0
                });
            }
        }

        return rows.sort((a,b) => b.observedHours - a.observedHours || b.amount - a.amount);
    }

    function factionInventoryReport(db, days = 7) {
        const cutoff = Date.now() - Math.max(1, Number(days || 7)) * 86400000;
        const events = (db.factionInventory?.events || []).filter(event =>
            Number(event.observedAt || 0) >= cutoff &&
            FACTION_INVENTORY_CATEGORIES.includes(String(event.category || ''))
        );
        const movement = {};
        for (const event of events) {
            const key = String(event.key || factionInventoryKey(event.category,event.itemId));
            if (!movement[key]) movement[key] = {
                key,
                itemId: event.itemId,
                name: event.name,
                category: event.category,
                depleted: 0,
                added: 0,
                availableOut: 0,
                loanedOut: 0,
                netOwned: 0
            };
            const row = movement[key];
            const dOwned = Number(event.deltaOwned || 0);
            const dAvailable = Number(event.deltaAvailable || 0);
            const dLoaned = Number(event.deltaLoaned || 0);
            if (dOwned < 0) row.depleted += -dOwned;
            if (dOwned > 0) row.added += dOwned;
            if (dAvailable < 0) row.availableOut += -dAvailable;
            if (dLoaned > 0) row.loanedOut += dLoaned;
            row.netOwned += dOwned;
        }

        const snapshots = (db.factionInventory?.snapshots || []).filter(s => Number(s.at || 0) >= cutoff);
        const firstAt = snapshots.length ? Number(snapshots[0].inventoryTimestamp || snapshots[0].at || 0) : 0;
        const lastAt = snapshots.length ? Number(snapshots[snapshots.length-1].inventoryTimestamp || snapshots[snapshots.length-1].at || 0) : 0;
        const observedDays = firstAt && lastAt && lastAt > firstAt ? Math.max(1/24, (lastAt-firstAt)/86400000) : 0;

        const rows = Object.values(movement).map(row => ({
            ...row,
            consumptionPerDay: observedDays > 0 ? row.depleted / observedDays : 0
        })).sort((a,b) => b.depleted - a.depleted || b.loanedOut - a.loanedOut);

        return { days, observedDays, events: events.length, rows };
    }

    function factionInventoryStatusBadge(status) {
        const styles = {
            CRITICAL: 'background:#6b1f1f;color:#ffd0d0;border:1px solid #a94a4a;',
            LOW: 'background:#5b431a;color:#ffe0a3;border:1px solid #9b742f;',
            GREEN: 'background:#203d29;color:#c9f0d3;border:1px solid #3f7550;',
            UNSET: 'background:#2c2c2c;color:#bbb;border:1px solid #555;'
        };
        return '<span style="' + (styles[status] || styles.UNSET) + 'padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold;">' + escapeHtml(status) + '</span>';
    }

    function factionInventoryHtml(db) {
        const state = db.factionInventory;
        const allRows = factionInventoryRows(db);
        const selectedCategory = String(state.settings?.selectedCategory || 'all');
        const rows = selectedCategory === 'all' ? allRows : allRows.filter(row => row.category === selectedCategory);
        const loans = factionLoanMemberRows(db);
        const loanReview = factionLoanPersistenceRows(db);
        const loanAgeMap = new Map(loanReview.map(row => [row.key+'|'+row.memberId,row]));
        const configured = allRows.filter(row => row.threshold.target > 0);
        const restock = configured.filter(row => row.threshold.shortfall > 0);
        const critical = configured.filter(row => row.threshold.status === 'CRITICAL');
        const report = factionInventoryReport(db, 7);
        const totalOwned = allRows.reduce((sum,row) => sum + Number(row.amountOwned || 0), 0);
        const equipmentAvailable = allRows.filter(row => FACTION_INVENTORY_LOAN_CATEGORIES.includes(row.category)).reduce((sum,row) => sum + Number(row.availableCount || 0), 0);
        const equipmentLoaned = allRows.filter(row => FACTION_INVENTORY_LOAN_CATEGORIES.includes(row.category)).reduce((sum,row) => sum + Number(row.loanedCount || 0), 0);
        const keyMode = getFactionApiKey() ? 'Dedicated faction key' : getApiKey() ? 'Primary CRM key fallback — may lack Faction → Inventory access' : 'No key';
        const nextRefresh = state.nextUsefulRefreshAt ? fmtDate(state.nextUsefulRefreshAt) : '—';
        const categories = ['all',...FACTION_INVENTORY_CATEGORIES];
        const policy = FACTION_INVENTORY_POLICY;

        const summary = card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">'+
                '<div><b style="font-size:15px;">Faction Inventory Manager</b><div style="font-size:10px;color:#888;">Read-only armory operations · confirmed scope: armor, temporary, medical, consumables</div></div>'+
                '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">'+
                    '<label style="font-size:10px;color:#aaa;display:flex;align-items:center;gap:4px;">Category <select id="mm-faction-category" style="'+inputCss()+'padding:5px 7px;min-width:150px;">'+
                        categories.map(cat => '<option value="'+escapeHtml(cat)+'" '+(selectedCategory===cat?'selected':'')+'>'+escapeHtml(cat==='all'?'All categories':cat)+'</option>').join('')+
                    '</select></label>'+
                    '<button id="mm-faction-sync" style="'+btn(true)+'">Sync Armory</button>'+
                    '<button id="mm-faction-market" style="'+btn()+'">Refresh Market Intel</button>'+
                '</div>'+
            '</div>'+
            '<div style="font-size:11px;color:#aaa;margin-top:7px;line-height:1.55;">'+
                'API: <b>'+escapeHtml(keyMode)+'</b> · Torn source snapshot: <b>'+escapeHtml(fmtDate(state.inventoryTimestamp))+'</b> · Last fetch: '+escapeHtml(fmtDate(state.lastSyncAt))+'<br>'+
                'Next useful refresh: ~'+escapeHtml(nextRefresh)+' because Torn caches the inventory selection for one hour. CRM snapshots remain local and historical.<br>'+
                'Planning basis: available for armor/temporary weapons, owned for medical/consumables. <b>Read-only:</b> this module never gives, retrieves, moves, buys, or consumes faction items.'+
            '</div>'+
            '<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:8px;">'+
                '<div style="background:#121212;border:1px solid #333;border-radius:5px;padding:6px;"><b>'+allRows.length+'</b><br><span style="font-size:9px;color:#888;">ITEM TYPES</span></div>'+
                '<div style="background:#121212;border:1px solid #333;border-radius:5px;padding:6px;"><b>'+totalOwned.toLocaleString()+'</b><br><span style="font-size:9px;color:#888;">OWNED UNITS</span></div>'+
                '<div style="background:#121212;border:1px solid #333;border-radius:5px;padding:6px;"><b>'+equipmentAvailable.toLocaleString()+'</b><br><span style="font-size:9px;color:#888;">LOANABLE AVAILABLE</span></div>'+
                '<div style="background:#121212;border:1px solid #333;border-radius:5px;padding:6px;"><b>'+equipmentLoaned.toLocaleString()+'</b><br><span style="font-size:9px;color:#888;">LOANABLE OUT</span></div>'+
                '<div style="background:#121212;border:1px solid #333;border-radius:5px;padding:6px;"><b>'+restock.length+'</b><br><span style="font-size:9px;color:#888;">PLANNING SHORTFALLS</span></div>'+
            '</div>'
        );

        const operatingPolicy = card(
            '<b>Confirmed Operating Policy</b>'+
            '<div style="font-size:11px;color:#bbb;margin-top:5px;line-height:1.55;">'+
                '<b>Role:</b> '+escapeHtml(policy.role)+'<br>'+
                '<b>Scope:</b> '+escapeHtml(policy.scope)+'<br>'+
                '<b>Sourcing:</b> '+escapeHtml(policy.sourcing)+'<br>'+
                '<b>Pricing:</b> '+escapeHtml(policy.pricing)+'<br>'+
                '<b>Stock:</b> '+escapeHtml(policy.stock)+'<br>'+
                '<b>Loans:</b> '+escapeHtml(policy.loans)+'<br>'+
                '<b>High-value RW gear:</b> '+escapeHtml(policy.highValue)+'<br>'+
                '<b>Purchasing:</b> '+escapeHtml(policy.purchasing)+
            '</div>'
        );

        const planning = card(
            '<b>Stock Planning / Restock Queue</b>'+
            (configured.length
                ? '<div style="font-size:11px;color:#bbb;margin-top:5px;">Provisional targets: '+configured.length+' · At/above '+configured.filter(r=>r.threshold.status==='GREEN').length+' · Below '+configured.filter(r=>r.threshold.status==='LOW').length+' · Severe shortfall '+critical.length+'</div>'
                : '<div style="font-size:11px;color:#888;margin-top:5px;">Leadership has not finalized minimum/maximum stock levels. Collect usage first; add provisional targets only when they are useful for planning.</div>')+
            (restock.length
                ? restock.slice(0,20).map(row => '<div style="border-top:1px solid #303030;padding:6px 0;font-size:11px;">'+
                    factionInventoryStatusBadge(row.threshold.status)+' <b>'+escapeHtml(row.name)+'</b> · '+escapeHtml(row.category)+' · '+
                    row.threshold.current.toLocaleString()+'/'+row.threshold.target.toLocaleString()+' '+escapeHtml(row.threshold.basis)+' · Planning shortfall <b>'+row.threshold.shortfall.toLocaleString()+'</b>'+
                    (row.referencePrice ? ' · Est. market cost '+money(row.estimatedRestockCost)+' @ '+money(row.referencePrice)+' ('+escapeHtml(row.priceSource)+')' : ' · Market price unavailable')+
                '</div>').join('')
                : configured.length ? '<div style="font-size:11px;color:#9fe3a8;margin-top:5px;">All provisional planning targets are currently met.</div>' : '')+
            (loanReview.length
                ? '<div style="border-top:1px solid #303030;margin-top:6px;padding-top:6px;font-size:11px;"><b>Loan age observations</b><div style="font-size:10px;color:#888;margin:2px 0 4px;">No automatic overdue threshold is applied. Observed age is informational; extended, lost, or long-outstanding items are reviewed manually and escalated to leadership as needed.</div>'+
                    loanReview.slice(0,12).map(row =>
                        escapeHtml(row.memberName)+' · '+escapeHtml(row.name)+' × '+row.amount+' · observed '+Math.floor(row.observedHours)+'h'
                    ).join('<br>')+
                  '</div>'
                : '')
        );

        const armory = card(
            '<b>Armory Dashboard</b>'+
            (rows.length ? rows.map(row => {
                const t = row.threshold;
                const loanSummary = row.loanedCount
                    ? ' · Loaned '+Number(row.loanedCount).toLocaleString()+' to '+row.loans.length+' member'+(row.loans.length===1?'':'s')
                    : '';
                const uidText = FACTION_INVENTORY_LOAN_CATEGORIES.includes(row.category)
                    ? ' · UID coverage '+Number(row.uidCount||0).toLocaleString()
                    : '';
                return '<div style="border-top:1px solid #303030;padding:7px 0;font-size:11px;">'+
                    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">'+
                        '<div><b>'+escapeHtml(row.name)+'</b> <span style="color:#777">['+escapeHtml(row.itemId)+']</span> '+factionInventoryStatusBadge(t.status)+
                        '<br><span style="color:#aaa;">'+escapeHtml(row.category)+' · '+escapeHtml(row.type||'')+'</span></div>'+
                        '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;"><button data-faction-action="threshold" data-item="'+escapeHtml(row.itemId)+'" data-name="'+escapeHtml(row.name)+'" style="'+btn(t.target>0)+'">'+(t.target>0?'Target '+t.target:'Set Target')+'</button></div>'+
                    '</div>'+
                    '<div style="color:#bbb;margin-top:4px;">Owned <b>'+Number(row.amountOwned||0).toLocaleString()+'</b> · Available <b>'+Number(row.availableCount||0).toLocaleString()+'</b>'+loanSummary+uidText+'<br>'+
                    'Planning metric '+escapeHtml(t.basis)+': '+t.current.toLocaleString()+(t.target>0?' / '+t.target.toLocaleString()+' · Shortfall '+t.shortfall.toLocaleString():' · target not set')+'<br>'+
                    'Market reference (advisory): '+(row.referencePrice?money(row.referencePrice)+' · '+escapeHtml(row.priceSource):'—')+
                    (t.shortfall&&row.referencePrice?' · Planning estimate <b>'+money(row.estimatedRestockCost)+'</b>':'')+
                    '</div>'+
                    (row.loans.length ? '<details style="margin-top:4px;"><summary style="cursor:pointer;color:#aaa;">Loan details</summary><div style="margin-top:3px;">'+
                        row.loans.map(loan => escapeHtml(loan.memberName)+' ['+escapeHtml(loan.memberId)+'] × '+Number(loan.amount||0).toLocaleString()+
                            (loan.uids?.length?' · UID '+loan.uids.slice(0,8).map(escapeHtml).join(', ')+(loan.uids.length>8?'…':''):'')
                        ).join('<br>')+
                    '</div></details>' : '')+
                '</div>';
            }).join('') : '<div style="font-size:11px;color:#888;margin-top:5px;">No in-scope faction inventory snapshot yet. Ask leadership to enable Faction API Access for your position, then sync with your own Limited/custom key that includes Faction → Inventory.</div>')
        );

        const memberView = card(
            '<b>Member Loan View</b>'+
            '<div style="font-size:10px;color:#888;margin-top:4px;">Armor and temporary weapons may be borrowed for chains, Ranked Wars, and training. No fixed loan duration is enforced here; follow-up and escalation remain a management judgment.</div>'+
            (loans.length ? loans.slice(0,40).map(member =>
                '<details style="border-top:1px solid #303030;padding:5px 0;"><summary style="cursor:pointer;font-size:11px;"><b>'+escapeHtml(member.memberName)+'</b> ['+escapeHtml(member.memberId)+'] · '+member.amount+' item'+(member.amount===1?'':'s')+'</summary>'+
                '<div style="font-size:10px;color:#aaa;margin-top:4px;">'+member.items.map(item => {
                    const age=loanAgeMap.get(factionInventoryKey(item.category,item.itemId)+'|'+member.memberId);
                    return escapeHtml(item.name)+' × '+item.amount+
                        (item.uids?.length?' · UID '+item.uids.slice(0,10).map(escapeHtml).join(', ')+(item.uids.length>10?'…':''):'')+
                        (age?.observedSince?' · first observed '+escapeHtml(fmtDate(age.observedSince)):'');
                }).join('<br>')+'</div></details>'
            ).join('') : '<div style="font-size:11px;color:#888;margin-top:5px;">No currently loaned armor/temporary rows in the latest snapshot.</div>')
        );

        const weekly = card(
            '<b>7-Day Inventory Report</b>'+
            '<div style="font-size:11px;color:#aaa;margin-top:5px;">Observed span '+(report.observedDays?report.observedDays.toFixed(1)+'d':'—')+' · '+report.events+' in-scope inventory change event'+(report.events===1?'':'s')+'. Use observed movement to build data-driven Ranked War/chain targets. Negative owned deltas are treated as observed depletion, not attributed to a specific cause.</div>'+
            (report.rows.length ? report.rows.slice(0,15).map(row =>
                '<div style="border-top:1px solid #303030;padding:5px 0;font-size:10px;"><b>'+escapeHtml(row.name)+'</b> · '+escapeHtml(row.category)+
                ' · Depleted '+row.depleted.toLocaleString()+' · Added '+row.added.toLocaleString()+' · Net '+(row.netOwned>=0?'+':'')+row.netOwned.toLocaleString()+
                (row.consumptionPerDay>0?' · Gross depletion rate '+row.consumptionPerDay.toFixed(1)+'/day':'')+
                (row.loanedOut>0?' · Loan increases '+row.loanedOut.toLocaleString():'')+
                '</div>'
            ).join('') : '<div style="font-size:11px;color:#888;margin-top:5px;">A second distinct Torn source snapshot is required before movement reporting begins.</div>')
        );

        const audit = card(
            '<b>Inventory Audit Log</b>'+
            ((state.events||[]).filter(event => FACTION_INVENTORY_CATEGORIES.includes(String(event.category || ''))).length
                ? (state.events||[]).filter(event => FACTION_INVENTORY_CATEGORIES.includes(String(event.category || ''))).slice().sort((a,b)=>Number(b.observedAt||0)-Number(a.observedAt||0)).slice(0,30).map(event =>
                    '<div style="border-top:1px solid #303030;padding:5px 0;font-size:10px;">'+
                    escapeHtml(fmtDate(event.observedAt))+' · <b>'+escapeHtml(event.name)+'</b> · Owned '+(event.deltaOwned>=0?'+':'')+Number(event.deltaOwned||0)+
                    ' · Available '+(event.deltaAvailable>=0?'+':'')+Number(event.deltaAvailable||0)+
                    ' · Loaned '+(event.deltaLoaned>=0?'+':'')+Number(event.deltaLoaned||0)+
                    '</div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;margin-top:5px;">No in-scope inventory changes recorded yet.</div>')
        );

        return summary + operatingPolicy + planning + armory + memberView + weekly + audit;
    }

    function factionInventorySelfTest() {
        const sourceAt = 1_700_000_000_000;
        const groups = [
            {category:'armor',inventoryTimestamp:sourceAt,rows:[
                {id:1,name:'Test Armor',type:'Armor',amount:2,uids:[11,12],loaned:null},
                {id:1,name:'Test Armor',type:'Armor',amount:1,uids:[13],loaned:{id:99,name:'Member'}}
            ]},
            {category:'medical',inventoryTimestamp:sourceAt,rows:[
                {id:2,name:'First Aid Kit',type:'Medical',amount:100,uids:[500],loaned:null}
            ]}
        ];
        const current = normalizeFactionInventoryResults(groups, sourceAt + 1000);
        const equipment = current['armor|1'];
        const state = {snapshots:[],events:[]};
        const first = recordFactionInventorySnapshot(state,current,sourceAt,sourceAt+1000);
        const changed = deepClone(current);
        changed['armor|1'].availableCount = 1;
        changed['armor|1'].loanedCount = 2;
        const second = recordFactionInventorySnapshot(state,changed,sourceAt+3600000,sourceAt+3601000);
        const merged = mergeFactionInventoryStates(
            {current,inventoryTimestamp:new Date(sourceAt+3600000).toISOString(),lastSyncAt:new Date(sourceAt+3601000).toISOString(),snapshots:state.snapshots,events:state.events,thresholds:{'1':{target:3,basis:'available',updatedAt:new Date(sourceAt+1).toISOString()}},settings:{updatedAt:new Date(sourceAt+1).toISOString()},diagnostics:[]},
            {current:{},inventoryTimestamp:new Date(sourceAt).toISOString(),lastSyncAt:new Date(sourceAt+1000).toISOString(),snapshots:[],events:[],thresholds:{},settings:{},diagnostics:[]}
        );
        return {
            pass:
                equipment?.amountOwned===3 &&
                equipment?.availableCount===2 &&
                equipment?.loanedCount===1 &&
                equipment?.loans?.[0]?.memberId==='99' &&
                first.snapshotAdded===true &&
                second.eventsAdded===1 &&
                merged.current?.['armor|1']?.amountOwned===3 &&
                merged.thresholds?.['1']?.target===3,
            equipment,
            first,
            second,
            mergedCurrentCount:Object.keys(merged.current||{}).length
        };
    }

    // ============================================================
    // UI
    // ============================================================

    function btn(gold = false) {
        return `border:1px solid ${gold ? '#e7c46d' : '#666'};background:${gold ? '#d7ad4b' : '#303030'};color:${gold ? '#111' : '#fff'};border-radius:5px;padding:6px 9px;cursor:pointer;font-weight:${gold ? '700' : '500'};`;
    }

    function inputCss() {
        return 'box-sizing:border-box;background:#171717;color:#eee;border:1px solid #555;border-radius:5px;padding:7px;min-width:0;';
    }

    function card(content) {
        return `<div style="background:#181818;border:1px solid #444;border-radius:7px;padding:10px;margin:8px 0;">${content}</div>`;
    }

    function tabsHtml() {
        const db = dbLoad();
        const factionReady = Boolean(getFactionApiKey()) || Object.keys(db.factionInventory?.current || {}).length > 0;
        const simpleTabs = [['home','Today'],['stock','Stock & List'],['deals','Buy'],['customers','Customers'],['reports','Reports']];
        if (factionReady) simpleTabs.push(['faction','Faction']);
        const advancedTabs = [['ops','Operations'],['customers','Customers'],['inventory','Inventory'],['faction','Faction Inv'],['procurement','Procure'],['intel','Market Intel'],['analytics','Analytics'],['coupons','Coupons'],['subscribers','Restock'],['refunds','Refunds'],['sales','Sales'],['settings','Settings']];
        const tabs = simpleMode ? simpleTabs : advancedTabs;
        const toolsButton = simpleMode
            ? `<button data-tab="more" style="${btn(activeTab === 'more')}${activeTab === 'more' ? 'border-color:#d7ad4b;' : ''}font-size:10px;">Tools</button>`
            : '';
        return `<div style="display:flex;gap:5px;flex-wrap:wrap;margin:8px 0;align-items:center;">
            ${tabs.map(([id,label]) => `<button data-tab="${id}" style="${btn(activeTab === id)}${activeTab === id ? 'border-color:#d7ad4b;' : ''}">${label}</button>`).join('')}
            <span style="flex:1;"></span>
            ${toolsButton}
            <button id="mm-ui-mode-toggle" style="${btn()}font-size:10px;">${simpleMode ? 'Advanced' : 'Simple'} mode</button>
        </div>`;
    }

    function customerMatchesFilters(db, c) {
        const id = asId(c.id || c.playerId);
        const contacted = customerHasBeenContacted(c);
        const subscribed = Boolean(db.subscribers[id]);
        const coupon = db.coupons[id];
        const cashback = coupon ? couponQualification(db, coupon).qualified : false;

        if (customerFilters.message === 'sent' && !contacted) return false;
        if (customerFilters.message === 'not-sent' && contacted) return false;
        if (customerFilters.contacted === 'yes' && !contacted) return false;
        if (customerFilters.contacted === 'no' && contacted) return false;
        if (customerFilters.restock === 'yes' && !subscribed) return false;
        if (customerFilters.restock === 'no' && subscribed) return false;
        if (customerFilters.cashback === 'eligible' && !cashback) return false;
        if (customerFilters.cashback === 'not-eligible' && cashback) return false;
        return true;
    }

    function customerFiltersHtml(total, shown) {
        const select = (id, value, choices) => `<select id="${id}" style="${inputCss()}padding:5px 7px;font-size:12px;">${choices.map(([v,l]) => `<option value="${v}"${value === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        return card(`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>Filter</b>${select('mm-filter-message', customerFilters.message, [['all','Messages: All'],['sent','Messages: Sent'],['not-sent','Messages: Not sent']])}${select('mm-filter-contacted', customerFilters.contacted, [['all','Contacted: All'],['yes','Contacted: Yes'],['no','Contacted: No']])}${select('mm-filter-restock', customerFilters.restock, [['all','Restock: All'],['yes','Restock: Yes'],['no','Restock: No']])}${select('mm-filter-cashback', customerFilters.cashback, [['all','Cashback: All'],['eligible','Cashback: Eligible'],['not-eligible','Cashback: Not eligible']])}<button id="mm-filter-reset" style="${btn()}padding:5px 9px;font-size:12px;">Reset</button><span style="font-size:12px;color:#aaa;margin-left:auto;">Showing ${shown} of ${total}</span></div>`);
    }

    function customersHtml(db) {
        const allCustomers = Object.values(db.customers).filter(c => !isCustomerRemoved(db, c.id || c.playerId)).sort((a,b) => Number(new Date(b.lastPurchase || 0)) - Number(new Date(a.lastPurchase || 0)));
        const customers = allCustomers.filter(c => customerMatchesFilters(db, c));
        const add = `<div style="display:flex;gap:6px;"><input id="mm-add-id" placeholder="Torn player ID" style="${inputCss()}flex:1"><button id="mm-add-customer" style="${btn(true)}">Add</button><button id="mm-refresh-customers" style="${btn()}">Refresh Customers</button></div>`;
        const filters = customerFiltersHtml(allCustomers.length, customers.length);
        if (!allCustomers.length) return add + filters + card('No customers yet. API Bazaar sales will populate this automatically.');
        if (!customers.length) return add + filters + card('No customers match the selected filters.');
        return customerReorderHtml(db) + add + filters + customers.map(c => {
            const coupon = db.coupons[c.id];
            const q = couponQualification(db, coupon);
            const pendingRefund = coupon?.pendingRefundId ? db.refunds[coupon.pendingRefundId] : null;
            const name = escapeHtml(displayUsername(c) || 'Customer');
            const cashbackText = pendingRefund?.status === 'pending'
                ? `Pending ${money(pendingRefund.amount)} — send in Torn, then mark paid`
                : q.qualified ? `${money(q.cashback)} on ${money(q.total)}` : q.reason;
            const cashbackButton = pendingRefund?.status === 'pending'
                ? `<button data-action="complete-refund" data-refund="${escapeHtml(pendingRefund.id)}" data-id="${c.id}" style="${btn(true)}">Mark Cashback Paid</button>`
                : `<button data-action="start-refund" data-id="${c.id}" style="${btn()}" ${q.qualified ? '' : 'disabled'}>Cashback</button>`;
            return card(`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div><b>${name}</b> <span style="color:#888">[${escapeHtml(c.id)}]</span><div style="font-size:12px;color:#bbb;margin-top:4px;">Purchases: ${c.purchases.toLocaleString()} · Units: ${c.units.toLocaleString()} · Spent: ${money(c.spent)}<br>Last purchase: ${escapeHtml(fmtDate(c.lastPurchase))}<br>Contacted: ${customerHasBeenContacted(c) ? `Yes (${c.messageCount})` : 'No'} · Coupon: ${escapeHtml(coupon?.code || '—')} · Uses left: ${couponRemaining(coupon)}<br>Cashback: ${escapeHtml(cashbackText)}</div></div><div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;"><button data-action="compose" data-id="${c.id}" style="${btn(true)}">Compose</button>${coupon?.issuedAt && couponRemaining(coupon) > 0 ? `<button data-action="coupon-reminder" data-id="${c.id}" style="${btn(q.qualified)}">Coupon Reminder</button>` : ''}<button data-action="contacted" data-id="${c.id}" style="${btn()}">Mark contacted</button><button data-action="subscribe" data-id="${c.id}" style="${btn()}">Restock+</button>${cashbackButton}<button data-action="profile" data-id="${c.id}" style="${btn()}">Profile</button><button data-action="remove" data-id="${c.id}" style="${btn()}">Remove</button></div></div>`);
        }).join('');
    }

    function couponsHtml(db) {
        const coupons = Object.values(db.coupons).sort((a,b) => String(a.playerName).localeCompare(String(b.playerName)));
        if (!coupons.length) return card('No coupons yet.');
        return coupons.map(c => {
            const q = couponQualification(db, c);
            return card(`<b>${escapeHtml(c.playerName)} [${escapeHtml(c.playerId)}]</b><div style="font-size:12px;color:#bbb;margin-top:4px;">Code: <b>${escapeHtml(c.code)}</b> · Remaining: ${couponRemaining(c)}/${c.maxUses}<br>Issued: ${escapeHtml(fmtDate(c.issuedAt))}<br>Current qualification: ${q.qualified ? `${money(q.cashback)} cashback on ${money(q.total)}` : escapeHtml(q.reason)}<br>Completed redemptions: ${(c.redemptions || []).length}</div>`);
        }).join('');
    }

    function subscribersHtml(db) {
        const subs = Object.values(db.subscribers);
        const bazaarCount = Object.keys(db.procurement?.bazaar || {}).length;
        const bazaarQty = Object.values(db.procurement?.bazaar || {}).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const lastBazaar = db.procurement?.lastBazaarAt;

        const inventoryControls = card(`
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
                <div>
                    <b>Automatic Bazaar Inventory Message</b>
                    <div style="font-size:11px;color:#999;margin-top:3px;">
                        Current cache: ${bazaarCount.toLocaleString()} SKU(s) · ${bazaarQty.toLocaleString()} units · Last refreshed ${escapeHtml(fmtDate(lastBazaar))}.
                        Inventory is refreshed again automatically when you compose an Inventory Alert.
                    </div>
                </div>
                <button id="mm-restock-refresh-inventory" style="${btn()}">Refresh Bazaar Inventory</button>
            </div>
        `);

        const manualControls = `<details style="margin:7px 0;">
            <summary style="cursor:pointer;font-size:11px;color:#aaa;">Single-item restock message</summary>
            <div style="display:grid;grid-template-columns:1.5fr .7fr .9fr;gap:6px;margin-top:6px;">
                <input id="mm-restock-item" placeholder="Item" style="${inputCss()}">
                <input id="mm-restock-qty" type="number" min="1" placeholder="Qty" style="${inputCss()}">
                <input id="mm-restock-price" type="number" min="0" placeholder="Price" style="${inputCss()}">
            </div>
        </details>`;

        if (!subs.length) {
            return inventoryControls + manualControls + card('No restock subscribers. Add customers manually after they reply RESTOCK.');
        }

        return inventoryControls + manualControls + subs.map(s => {
            const matching = currentBazaarInventoryRows(db, s);
            return card(`<div style="display:flex;justify-content:space-between;gap:8px;">
                <div>
                    <b>${escapeHtml(displayUsername(s) || `[${s.id}]`)}</b>
                    <div style="font-size:12px;color:#bbb;">
                        Subscribed: ${escapeHtml(fmtDate(s.subscribedAt))}<br>
                        Last sent: ${escapeHtml(fmtDate(s.lastNotified))}<br>
                        Interests: ${s.interests?.length ? escapeHtml(s.interests.join(', ')) : 'All items'}<br>
                        Current matching Bazaar inventory: <b>${matching.length}</b> SKU(s)
                        ${s.pendingNotification ? '<br><span style="color:#e7c46d">Prepared message awaiting manual sent confirmation.</span>' : ''}
                    </div>
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;align-content:flex-start;">
                    <button data-action="notify-inventory" data-id="${s.id}" style="${btn(true)}">Inventory Alert</button>
                    <button data-action="notify" data-id="${s.id}" style="${btn()}">Single Item</button>
                    <button data-action="edit-interests" data-id="${s.id}" style="${btn()}">Interests</button>
                    ${s.pendingNotification ? `<button data-action="notified" data-id="${s.id}" style="${btn()}">Mark notified</button>` : ''}
                    <button data-action="unsubscribe" data-id="${s.id}" style="${btn()}">Remove</button>
                </div>
            </div>`);
        }).join('');
    }

    function refundsHtml(db) {
        const refunds = Object.values(db.refunds).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        if (!refunds.length) return card('No cashback refunds yet.');
        return refunds.map(r => card(`<div style="display:flex;justify-content:space-between;gap:8px;"><div><b>${escapeHtml(r.playerName)} — ${money(r.amount)}</b><div style="font-size:12px;color:#bbb;">Status: ${escapeHtml(r.status)} · Purchase total: ${money(r.purchaseTotal)}<br>Created: ${escapeHtml(fmtDate(r.createdAt))}</div></div><div style="display:flex;gap:5px;flex-wrap:wrap;">${r.status === 'pending' ? `<button data-action="open-refund" data-refund="${r.id}" style="${btn(true)}">Open refund</button><button data-action="complete-refund" data-refund="${r.id}" style="${btn()}">Mark paid</button><button data-action="cancel-refund" data-refund="${r.id}" style="${btn()}">Cancel</button>` : ''}</div></div>`)).join('');
    }

    function salesHtml(db) {
        const sales = Object.values(db.sales).sort((a,b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 150);
        if (!sales.length) return card('No Bazaar sales imported yet.');
        return sales.map(s => card(`<b>${escapeHtml(s.playerName)} [${escapeHtml(s.playerId)}]</b> — ${money(s.total)}<div style="font-size:12px;color:#bbb;">${escapeHtml(fmtDate(s.timestamp))} · ${Number(s.units || 0).toLocaleString()} unit(s) · Log ${escapeHtml(s.id)}${s.items?.length ? `<br>${s.items.map(i => `${escapeHtml(i.name)} × ${Number(i.quantity || 0).toLocaleString()}`).join(', ')}` : ''}</div>`)).join('');
    }


    function priorityBadge(priority) {
        const styles = {
            CRITICAL: 'background:#6b1f1f;color:#ffd0d0;border:1px solid #a94a4a;',
            HIGH: 'background:#5b431a;color:#ffe0a3;border:1px solid #9b742f;',
            MEDIUM: 'background:#273d54;color:#cfe7ff;border:1px solid #476d92;',
            WATCH: 'background:#39304d;color:#ded0ff;border:1px solid #66568d;',
            HEALTHY: 'background:#203d29;color:#c9f0d3;border:1px solid #3f7550;'
        };
        return `<span style="${styles[priority] || styles.HEALTHY}padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold;">${escapeHtml(priority)}</span>`;
    }

    function inventoryHtml(db) {
        const rows = procurementRows(db);
        const proc = db.procurement;
        const syncLine =
            `Last sync: ${fmtDate(proc.lastSyncAt)} · Bazaar ${Object.keys(proc.bazaar).length} SKU(s) · ` +
            `Cost lots ${proc.acquisitions.length.toLocaleString()}`;

        if (!rows.length) {
            return card(
                `<b>Inventory Director</b><div style="font-size:12px;color:#bbb;margin-top:5px;">` +
                `No inventory or sales SKUs are available yet. Run Sync Procurement and Rebuild Sales History.</div>` +
                `<button data-proc-sync style="${btn(true)}margin-top:8px;">Sync Procurement</button>`
            );
        }

        return `
            ${pricingDirectorHtml(db)}
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0 7px;">
                <button data-proc-sync style="${btn(true)}">Sync Procurement</button>
                <button data-proc-refresh-markets style="${btn()}">Refresh Priority Markets</button>
                <span style="font-size:11px;color:#999;">${escapeHtml(syncLine)}</span>
            </div>
            ${rows.map(r => card(`
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <div style="min-width:0;">
                        <div>
                            <b>${escapeHtml(r.name)}</b>
                            <span style="color:#777">[${escapeHtml(r.id)}]</span>
                            ${priorityBadge(r.priority)}
                            <span style="margin-left:4px;font-size:10px;color:${r.action === 'BUY' ? '#9fe3a8' : r.action === 'WATCH' ? '#ffd18a' : '#888'};">
                                ${escapeHtml(r.action)}
                            </span>
                        </div>
                        <div style="font-size:11px;color:#bbb;margin-top:4px;line-height:1.5;">
                            Stock <b>${r.stock}</b> (Bazaar ${r.bazaarQty} · IM ${r.itemMarketQty} · On-hand ${r.onHand})<br>
                            Sold 24h ${r.sold24h} · 7d ${r.sold7d} · 30d ${r.sold30d} · Velocity ${r.daily.toFixed(2)}/day<br>
                            Days stock ${Number.isFinite(r.daysStock) ? r.daysStock.toFixed(1) : '∞'} · Target ${r.targetStock} · Reorder ${r.reorderPoint} · Need <b>${r.shortage}</b><br>
                            Acquisition score <b>${r.acquisitionScore.toFixed(0)}/100</b> · Live ROI ${r.bestDealMarginPct.toFixed(1)}% · Quick-sale score ${r.velocityScore.toFixed(0)}/100 · Turnover ${Number.isFinite(r.turnoverDays)?r.turnoverDays.toFixed(1)+'d':'—'}<br>
                            Liquidity <b>${r.liquidityGrade}</b> (${r.liquidityScore.toFixed(0)}/100) · Market depth ±3% ${r.depth3Pct.toLocaleString()}<br>
                            Realistic exit ${r.realisticExit ? money(r.realisticExit) : '—'} · Best live buy ${r.bestBuyPrice ? money(r.bestBuyPrice) : '—'} · Buy target ${r.buyTarget ? money(r.buyTarget) : '—'}<br>
                            FIFO cost ${r.avgCost ? money(r.avgCost) : '—'}${r.avgCost && r.realisticExit ? ` · Held-margin ${r.marginPct.toFixed(1)}%` : ''}${r.bestBuyPrice && r.realisticExit ? ` · Live-deal ${r.bestDealMarginPct.toFixed(1)}%` : ''}<br>
                            7d market median ${r.median7d ? money(r.median7d) : '—'} · Volatility ${r.historySamples ? `${r.volatilityPct.toFixed(1)}% (${r.historySamples})` : '—'}
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
                        <button data-proc-action="watch" data-item="${r.id}" style="${btn(r.watched)}">${r.watched ? 'Watching' : 'Watch'}</button>
                        <button data-proc-action="market" data-item="${r.id}" style="${btn()}">Refresh Market</button>
                        <button data-proc-action="log-buy" data-item="${r.id}" data-name="${escapeHtml(r.name)}" style="${btn()}">Log Buy</button>
                    </div>
                </div>
            `)).join('')}
        `;
    }


    // ============================================================
    // VALUE / ROI INTELLIGENCE v6.5
    // ============================================================

    function medianNumber(values){
        const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
        if(!a.length)return 0; const m=Math.floor(a.length/2);
        return a.length%2?a[m]:(a[m-1]+a[m])/2;
    }

    function capitalRotationRows(db){
        return procurementRows(db).filter(r=>r.bestBuyPrice>0&&r.realisticExit>r.bestBuyPrice&&r.bestDealProfit>0).map(r=>{
            const qty=Math.max(1,Number(r.opportunityQtyCap||1));
            const spend=qty*Number(r.bestBuyPrice||0), profit=qty*Number(r.bestDealProfit||0);
            let days=Number(r.turnoverDays);
            if(!Number.isFinite(days)||days<=0)days=r.liquidityScore>=80?1:r.liquidityScore>=60?2:r.liquidityScore>=40?4:7;
            days=Math.max(.25,days);
            const ppd=profit/days, eff=spend>0?ppd/spend*100:0;
            const score=Math.max(0,Math.min(100,Number(r.acquisitionScore||0)*.4+Math.min(100,eff*18)*.4+Number(r.liquidityScore||0)*.2));
            return Object.assign({},r,{rotationQty:qty,rotationSpend:spend,rotationExpectedProfit:profit,rotationSellDays:days,profitPerDay:ppd,capitalEfficiencyPctDay:eff,rotationScore:score});
        }).sort((a,b)=>b.rotationScore-a.rotationScore||b.profitPerDay-a.profitPerDay);
    }

    function capitalCommandHtml(db){
        const rows=capitalRotationRows(db).slice(0,12);
        const travel=travelOpportunityRows(db).filter(r=>r.profit>0).slice(0,5);
        return card('<b>Capital Command Center - Profit Velocity</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Ranks market capital by expected profit/day and compares Travel as a separate fast-rotation channel using TornW3B live stock plus the CRM arrival model.</div>'+
            (rows.length?rows.map((r,i)=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>#'+(i+1)+' '+escapeHtml(r.name)+'</b> · Score <b>'+r.rotationScore.toFixed(0)+'</b><br>Deploy '+money(r.rotationSpend)+' · Expected '+money(r.rotationExpectedProfit)+' · <b>'+money(r.profitPerDay)+'/day</b> · '+r.capitalEfficiencyPctDay.toFixed(2)+'%/day · '+r.rotationSellDays.toFixed(1)+'d · ROI '+r.bestDealMarginPct.toFixed(1)+'%</div>').join(''):'<div style="font-size:11px;color:#888;">Sync procurement and market data to rank capital opportunities.</div>')+
            '<div style="border-top:2px solid #444;margin-top:7px;padding-top:6px;font-size:11px;"><b>Travel alternatives</b></div>'+
            (travel.length?travel.map((r,i)=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>#'+(i+1)+' '+escapeHtml(r.country)+' · '+escapeHtml(r.itemName)+'</b> '+travelRecommendationBadge(r.recommendation)+'<br>Risk-adjusted '+money(r.riskAdjustedProfitPerHour)+'/hr · Profit/item '+money(r.profit)+' · Live stock '+Number(r.stock||0).toLocaleString()+'</div>').join(''):'<div style="font-size:11px;color:#888;">Refresh Travel Stock to compare travel against market sourcing.</div>'));
    }

    function salesForCustomer(db,id){
        id=asId(id); return Object.values(db.sales||{}).filter(x=>asId(x.playerId)===id).sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0));
    }

    function customerAffinityRows(db){
        return Object.values(db.customers||{}).map(c=>{
            const p={},cats={}; let total=0;
            salesForCustomer(db,c.id).forEach(s=>(s.items||[]).forEach(i=>{
                const id=asId(i.itemId??i.item_id??i.id??''), name=String(i.name??i.itemName??i.item_name??'Unknown item'), q=Math.max(0,Number(i.quantity||0));
                if(!q)return; total+=q; const k=id||name;
                if(!p[k])p[k]={id:id,name:name,units:0}; p[k].units+=q;
                const type=String(db.procurement.catalog?.[id]?.type||'Other'); cats[type]=(cats[type]||0)+q;
            }));
            const products=Object.values(p).sort((a,b)=>b.units-a.units).slice(0,5).map(x=>Object.assign({},x,{share:total?x.units/total:0}));
            const categories=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>({name:x[0],units:x[1],share:total?x[1]/total:0}));
            return Object.assign({},c,{totalAffinityUnits:total,affinityProducts:products,affinityCategories:categories});
        }).sort((a,b)=>b.totalAffinityUnits-a.totalAffinityUnits);
    }

    function customerReorderRows(db){
        const affin=new Map(customerAffinityRows(db).map(x=>[asId(x.id),x])), now=Date.now(), out=[];
        Object.values(db.customers||{}).forEach(c=>{
            const sales=salesForCustomer(db,c.id); if(sales.length<2)return;
            const t=sales.map(x=>Number(x.timestamp||0)).filter(x=>x>0).sort((a,b)=>a-b), ints=[];
            for(let i=1;i<t.length;i++)ints.push((t[i]-t[i-1])/86400000);
            const typical=Math.max(.25,medianNumber(ints)||7), last=t[t.length-1]||0, since=last?Math.max(0,(now-last)/86400000):999;
            const top=affin.get(asId(c.id))?.affinityProducts?.[0]||null;
            let stock=null;
            if(top){
                if(top.id&&Number(db.procurement.bazaar?.[top.id]?.quantity||0)>0)stock=db.procurement.bazaar[top.id];
                else stock=Object.values(db.procurement.bazaar||{}).find(x=>String(x.name||'').toLowerCase()===String(top.name||'').toLowerCase()&&Number(x.quantity||0)>0)||null;
            }
            const score=Math.max(0,Math.min(100,Math.min(100,since/typical*65)+Math.min(20,sales.length*2)+(stock?15:0)));
            out.push(Object.assign({},c,{typicalReorderDays:typical,daysSincePurchase:since,reorderScore:score,topAffinity:top,currentStockMatch:stock,predictedNextAt:last?new Date(last+typical*86400000).toISOString():null}));
        });
        return out.sort((a,b)=>b.reorderScore-a.reorderScore);
    }

    function prepareReorderOutreach(id){
        const db=dbLoad(), r=customerReorderRows(db).find(x=>asId(x.id)===asId(id));
        if(!r){statusText='Not enough purchase history to calculate a reorder signal.';render();return;}
        const name=displayUsername(r)||r.id, top=r.topAffinity, stock=r.currentStockMatch;
        const columns=[
            {title:'YOUR FAVORITES',lines:[top?top.name+' - '+(top.share*100).toFixed(0)+'% of tracked units':'No dominant item yet','Typical reorder: '+r.typicalReorderDays.toFixed(1)+' days']},
            {title:'CURRENT STOCK',lines:[stock?(stock.name||top?.name)+' - Qty '+Number(stock.quantity||0).toLocaleString():'Your top item is not currently listed',stock?money(stock.price)+' each':'I can notify you when it returns']},
            {title:'QUICK INFO',lines:[r.daysSincePurchase.toFixed(1)+' days since your last purchase','Stock is first come, first served','Reply STOP to leave restock alerts']}
        ];
        const subject=SHOP_NAME+' - something you usually buy is available', greeting='Welcome back to '+SHOP_NAME+', '+name+'!';
        const body=plainThreeColumnFallback({customerName:name,greeting:greeting,centerText:top?top.name:'Your usual items',rightText:'Reorder score '+r.reorderScore.toFixed(0)+'/100',columns:columns,footerTitle:'RESTOCK',footerLines:['Reply RESTOCK for inventory alerts.','Reply STOP at any time to leave the list.']});
        const html=brandedMessageHtml({customerName:name,greeting:greeting,centerText:top?top.name:'Your usual items',rightText:'Reorder score '+r.reorderScore.toFixed(0)+'/100',columns:columns,footerTitle:'RESTOCK',footerLines:['Reply RESTOCK for inventory alerts.','Reply STOP at any time to leave the list.']});
        composeMessage(r.id,subject,body,html); statusText='Reorder message prepared for '+name+'. Send remains manual.'; render();
    }

    function customerReorderHtml(db){
        const rows=customerReorderRows(db).filter(x=>x.reorderScore>=65).slice(0,12);
        return card('<b>Automated Customer Reorder Intelligence</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Predicts repeat-purchase timing from real order intervals and product affinity. Compose only - never sends automatically.</div>'+
            (rows.length?rows.map(r=>'<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:5px 0;"><div style="font-size:11px;"><b>'+escapeHtml(displayUsername(r)||r.id)+'</b> · Score <b>'+r.reorderScore.toFixed(0)+'</b> · Last '+r.daysSincePurchase.toFixed(1)+'d · Typical '+r.typicalReorderDays.toFixed(1)+'d<br>Favorite '+(r.topAffinity?escapeHtml(r.topAffinity.name)+' '+(r.topAffinity.share*100).toFixed(0)+'%':'—')+' · '+(r.currentStockMatch?'<span style="color:#9fe3a8;">In stock now</span>':'<span style="color:#aaa;">Not currently listed</span>')+'</div><button data-action="reorder-compose" data-id="'+r.id+'" style="'+btn(true)+'">Compose Reorder</button></div>').join(''):'<div style="font-size:11px;color:#888;">No customers are currently above the reorder threshold.</div>'));
    }

    function supplierPerformanceRows(db){
        const g={}, proc=new Map(procurementRows(db).map(r=>[asId(r.id),r]));
        (db.procurement.acquisitions||[]).forEach(a=>{
            const sid=asId(a.sellerId??a.seller_id??a.playerId??''), sn=String(a.sellerName??a.seller_name??a.vendor??'').trim(); if(!sid&&!sn)return;
            const k=sid||'name:'+sn.toLowerCase(); if(!g[k])g[k]={sellerId:sid,sellerName:sn||sid,purchases:0,spend:0,estimatedProfit:0,items:{},observed:0};
            const x=g[k],q=Math.max(0,Number(a.quantity||0)),c=Math.max(0,Number(a.unitCost||0)),iid=asId(a.itemId||a.item_id||''),exit=Number(proc.get(iid)?.realisticExit||0);
            x.purchases++;x.spend+=q*c;x.estimatedProfit+=Math.max(0,(exit-c)*q);x.items[iid||String(a.itemName||'Unknown')]=true;
        });
        Object.entries(db.marketIntel.suppliers||{}).forEach(([id,o])=>{if(!g[id])g[id]={sellerId:id,sellerName:o.sellerName||id,purchases:0,spend:0,estimatedProfit:0,items:{},observed:0};const x=g[id];x.observed=Number(o.seenCount||0);Object.keys(o.items||{}).forEach(i=>x.items[i]=true);});
        return Object.values(g).map(x=>{const roi=x.spend?x.estimatedProfit/x.spend*100:0,c=Object.keys(x.items).filter(Boolean).length,score=Math.max(0,Math.min(100,Math.min(100,roi*4)*.4+Math.min(100,x.purchases*8)*.25+Math.min(100,x.observed*2)*.2+Math.min(100,c*10)*.15));return Object.assign({},x,{roiPct:roi,itemCount:c,score:score});}).sort((a,b)=>b.score-a.score);
    }

    function supplierPerformanceHtml(db){
        const rows=supplierPerformanceRows(db).slice(0,15);
        return card('<b>Supplier Performance & Deal Memory</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Combines acquisitions with repeated seller observations.</div>'+
            (rows.length?rows.map(r=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>'+escapeHtml(r.sellerName||r.sellerId||'Unknown')+'</b> '+(r.sellerId?'['+escapeHtml(r.sellerId)+']':'')+' · Score <b>'+r.score.toFixed(0)+'</b> · Buys '+r.purchases+' · '+r.itemCount+' SKU(s) · Spend '+money(r.spend)+' · Est. profit '+money(r.estimatedProfit)+' · ROI '+r.roiPct.toFixed(1)+'% · Observed '+r.observed+'</div>').join(''):'<div style="font-size:11px;color:#888;">Supplier memory grows from acquisitions and enriched market scans.</div>'));
    }

    function opportunityAlertRows(db){
        const map=new Map(procurementRows(db).map(r=>[asId(r.id),r])),out=[];
        Object.entries(db.procurement.watchlist||{}).forEach(([id,w])=>{if(!w||typeof w!=='object')return;const r=map.get(asId(id));if(!r)return;
            const max=Number(w.alertMaxBuyPrice??w.maxBuyPrice??0),roi=Number(w.alertMinRoiPct??w.minRoiPct??db.procurement.settings.minMarginPct??4),liq=Number(w.alertMinLiquidityScore??45);
            const has=max>0||w.alertMinRoiPct!=null||w.alertMinLiquidityScore!=null,hit=has&&(!max||(r.bestBuyPrice>0&&r.bestBuyPrice<=max))&&r.bestDealMarginPct>=roi&&r.liquidityScore>=liq;
            out.push(Object.assign({},r,{alertMaxBuyPrice:max,alertMinRoiPct:roi,alertMinLiquidityScore:liq,hasRule:has,alertTriggered:hit}));
        });return out.sort((a,b)=>Number(b.alertTriggered)-Number(a.alertTriggered)||b.acquisitionScore-a.acquisitionScore);
    }

    function setOpportunityAlertRule(id){
        id=asId(id);const db=dbLoad(),r=procurementRows(db).find(x=>x.id===id);if(!db.procurement.watchlist[id])db.procurement.watchlist[id]={itemId:id,createdAt:nowIso()};const w=db.procurement.watchlist[id];
        const a=prompt('Maximum buy price for '+(r?.name||id)+' (0 = no ceiling):',String(w.alertMaxBuyPrice??w.maxBuyPrice??r?.buyTarget??0));if(a==null)return;
        const b=prompt('Minimum ROI %:',String(w.alertMinRoiPct??db.procurement.settings.minMarginPct??4));if(b==null)return;
        const c=prompt('Minimum liquidity score 0-100:',String(w.alertMinLiquidityScore??45));if(c==null)return;
        w.alertMaxBuyPrice=Math.max(0,Number(a)||0);w.alertMinRoiPct=Math.max(0,Number(b)||0);w.alertMinLiquidityScore=Math.max(0,Math.min(100,Number(c)||0));dbSave(db);statusText='Buy alert saved for '+(r?.name||id)+'.';render();
    }

    function evaluateOpportunityAlerts(db,notify){
        const rows=opportunityAlertRows(db);db.operations.notificationState=db.operations.notificationState||{};
        rows.filter(x=>x.alertTriggered).forEach(r=>{const k='opportunity:'+r.id,last=Date.parse(db.operations.notificationState[k]?.at||'')||0,fp=r.bestBuyPrice+'|'+r.bestDealMarginPct.toFixed(2)+'|'+r.liquidityScore.toFixed(0);if(db.operations.notificationState[k]?.fingerprint===fp&&Date.now()-last<3600000)return;db.operations.notificationState[k]={at:nowIso(),fingerprint:fp};if(notify&&db.operations.settings.enableBrowserNotifications&&typeof Notification!=='undefined'&&Notification.permission==='granted'){try{new Notification(SHOP_NAME+': Buy opportunity',{body:r.name+': '+money(r.bestBuyPrice)+' · ROI '+r.bestDealMarginPct.toFixed(1)+'% · Liquidity '+r.liquidityScore.toFixed(0)+'/100'});}catch{}}});return rows;
    }

    function opportunityAlertsHtml(db){
        const rows=evaluateOpportunityAlerts(db,false);
        const suggested=procurementRows(db)
            .filter(r=>!db.procurement.watchlist?.[r.id] && r.bestBuyPrice>0 && r.realisticExit>r.bestBuyPrice)
            .sort((a,b)=>b.acquisitionScore-a.acquisitionScore||b.bestDealMarginPct-a.bestDealMarginPct)
            .slice(0,8);

        const watchedHtml = rows.length
            ? rows.slice(0,15).map(r=>'<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:5px 0;"><div style="font-size:11px;"><b>'+escapeHtml(r.name)+'</b> · '+(r.alertTriggered?'<span style="color:#9fe3a8;font-weight:bold;">TRIGGERED</span>':'Watching')+'<br>Buy '+(r.bestBuyPrice?money(r.bestBuyPrice):'—')+' / max '+(r.alertMaxBuyPrice?money(r.alertMaxBuyPrice):'—')+' · ROI '+r.bestDealMarginPct.toFixed(1)+'% / min '+r.alertMinRoiPct.toFixed(1)+'% · Liquidity '+r.liquidityScore.toFixed(0)+' / min '+r.alertMinLiquidityScore.toFixed(0)+'</div><button data-proc-action="alert-rule" data-item="'+r.id+'" style="'+btn(r.alertTriggered)+'">Alert Rule</button></div>').join('')
            : '<div style="font-size:11px;color:#888;">No watched items yet.</div>';

        const suggestedHtml = suggested.length
            ? '<div style="margin-top:8px;border-top:2px solid #444;padding-top:6px;font-size:11px;"><b>Suggested live opportunities</b></div>'+
              suggested.map(r=>'<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:5px 0;"><div style="font-size:11px;"><b>'+escapeHtml(r.name)+'</b> · '+escapeHtml(r.action)+' · Score '+r.acquisitionScore.toFixed(0)+'<br>Buy '+money(r.bestBuyPrice)+' → Exit '+money(r.realisticExit)+' · ROI '+r.bestDealMarginPct.toFixed(1)+'% · Liquidity '+r.liquidityScore.toFixed(0)+'</div><div style="display:flex;gap:4px;"><button data-proc-action="watch" data-item="'+r.id+'" style="'+btn()+'">Watch</button><button data-proc-action="alert-rule" data-item="'+r.id+'" style="'+btn(true)+'">Set Alert</button></div></div>').join('')
            : '<div style="font-size:11px;color:#888;margin-top:8px;">No current priced opportunities. Sync procurement/market data below.</div>';

        return card('<b>Opportunity Watchlist + Alerts</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Set buy-price, ROI and liquidity thresholds. Alerts never purchase anything.</div>'+
            '<div style="display:flex;gap:5px;margin-bottom:6px;"><button id="mm-opportunity-sync" style="'+btn(true)+'">Sync Procurement</button><button id="mm-opportunity-market" style="'+btn()+'">Refresh Market Intel</button></div>'+
            watchedHtml+suggestedHtml);
    }

    function deadCapitalRows(db){
        const best=capitalRotationRows(db)[0]?.capitalEfficiencyPctDay||0,dd=Number(db.operations.settings.deadStockDays||DEAD_STOCK_DAYS);
        return advancedInventoryRows(db).filter(r=>r.deadCapital>0||(r.maxAge>=dd&&r.stock>0)).map(r=>{const trapped=Math.max(Number(r.deadCapital||0),Number(r.avgCost||0)*Number(r.stock||0)),cost=trapped*best/100;let action='HOLD';if(r.maxAge>=dd*2||r.forecastDaily<.05)action='LIQUIDATE';else if(r.forecastDaily<.2)action='DISCOUNT 7%';else if(r.maxAge>=dd)action='DISCOUNT 3%';return Object.assign({},r,{trappedCapital:trapped,opportunityCostDay:cost,liquidationAction:action});}).sort((a,b)=>b.opportunityCostDay-a.opportunityCostDay);
    }

    function deadCapitalDirectorHtml(db){
        const rows=deadCapitalRows(db).slice(0,15),total=rows.reduce((s,r)=>s+r.trappedCapital,0);
        return card('<b>Dead Capital Liquidation Director</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Flagged capital: <b>'+money(total)+'</b>. Opportunity cost compares this inventory with the best current capital rotation.</div>'+
            (rows.length?rows.map(r=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>'+escapeHtml(r.name)+'</b> · <span style="color:'+(r.liquidationAction==='LIQUIDATE'?'#ff8d8d':'#ffd18a')+'">'+escapeHtml(r.liquidationAction)+'</span> · Capital '+money(r.trappedCapital)+' · Age '+r.maxAge.toFixed(1)+'d · Forecast '+r.forecastDaily.toFixed(2)+'/d · Opportunity cost <b>'+money(r.opportunityCostDay)+'/day</b></div>').join(''):'<div style="font-size:11px;color:#888;">No meaningful dead-capital positions detected.</div>'));
    }

    function customerAffinityHtml(db){
        const rows=customerAffinityRows(db).filter(r=>r.totalAffinityUnits>0).slice(0,20);
        return card('<b>Customer Product Affinity</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Used by reorder targeting and subscriber relevance.</div>'+
            (rows.length?rows.map(r=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>'+escapeHtml(displayUsername(r)||r.id)+'</b> · Products: '+(r.affinityProducts.slice(0,3).map(x=>escapeHtml(x.name)+' '+(x.share*100).toFixed(0)+'%').join(' · ')||'—')+'<br>Categories: '+(r.affinityCategories.slice(0,3).map(x=>escapeHtml(x.name)+' '+(x.share*100).toFixed(0)+'%').join(' · ')||'—')+'</div>').join(''):'<div style="font-size:11px;color:#888;">Affinity appears after tracked customer purchases.</div>'));
    }

    function saleRevenue(s){return (s.items||[]).reduce((n,i)=>n+Number(i.quantity||0)*Number(i.price||i.unitPrice||0),0)||Number(s.total||s.amount||0);}

    function salesFunnelMetrics(db){
        const sales=Object.values(db.sales||{}),map={};sales.forEach(s=>{const id=asId(s.playerId);(map[id]||(map[id]=[])).push(s);});
        let ws=0,wc=0,wr=0;Object.values(db.customers||{}).forEach(c=>{const at=Date.parse(db.coupons?.[asId(c.id)]?.issuedAt||c.lastContacted||'')||0;if(!at)return;ws++;const a=(map[asId(c.id)]||[]).filter(s=>Number(s.timestamp||0)>at&&Number(s.timestamp||0)<=at+86400000);if(a.length){wc++;wr+=a.reduce((n,s)=>n+saleRevenue(s),0);}});
        const notices=(db.notificationHistory||[]).filter(n=>n.sentAt);let rc=0,rr=0;notices.forEach(n=>{const at=Date.parse(n.sentAt)||0,a=(map[asId(n.playerId)]||[]).filter(s=>Number(s.timestamp||0)>at&&Number(s.timestamp||0)<=at+86400000);if(a.length){rc++;rr+=a.reduce((n,s)=>n+saleRevenue(s),0);}});
        const coupons=Object.values(db.coupons||{}),ci=coupons.filter(c=>c.issuedAt).length,cr=coupons.filter(c=>(c.redemptions||[]).length>0).length,msg=Object.values(db.customers||{}).reduce((n,c)=>n+Number(c.messageCount||0),0)+notices.length,rev=wr+rr;
        return {welcomeSent:ws,welcomeConverted:wc,welcomeRevenue:wr,welcomeConversionRate:ws?wc/ws:0,restockSent:notices.length,restockConverted:rc,restockRevenue:rr,restockConversionRate:notices.length?rc/notices.length:0,couponsIssued:ci,couponsRedeemed:cr,couponRedemptionRate:ci?cr/ci:0,outreachCount:msg,attributedRevenue:rev,revenuePerOutreach:msg?rev/msg:0};
    }

    function salesFunnelHtml(db){
        const m=salesFunnelMetrics(db);
        return card('<b>Sales Funnel / Conversion Analytics</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">24-hour attribution after tracked welcome/contact and restock sends.</div><div style="font-size:11px;line-height:1.6;">Welcome/contact: '+m.welcomeSent+' tracked · '+m.welcomeConverted+' converted · <b>'+(m.welcomeConversionRate*100).toFixed(1)+'%</b> · '+money(m.welcomeRevenue)+' revenue<br>Restock: '+m.restockSent+' sent · '+m.restockConverted+' converted · <b>'+(m.restockConversionRate*100).toFixed(1)+'%</b> · '+money(m.restockRevenue)+' revenue<br>Coupons: '+m.couponsIssued+' issued · '+m.couponsRedeemed+' redeemed · <b>'+(m.couponRedemptionRate*100).toFixed(1)+'%</b><br>Revenue / tracked outreach: <b>'+money(m.revenuePerOutreach)+'</b></div>');
    }

    function competitorIntelligenceRows(db){
        const g={};Object.entries(db.marketIntel.details||{}).forEach(([iid,d])=>{const a=freshOrganicListings(db,d?.organicListings||[]).filter(x=>x.sellerId&&x.price>0);if(!a.length)return;const low=Math.min(...a.map(x=>Number(x.price||Infinity)));a.forEach(l=>{const id=asId(l.sellerId);if(!g[id])g[id]={sellerId:id,sellerName:l.sellerName||id,items:{},listings:0,totalQty:0,positionSum:0,lowMatches:0};const x=g[id];x.sellerName=l.sellerName||x.sellerName;x.items[iid]=true;x.listings++;x.totalQty+=Number(l.quantity||0);const p=low>0?(Number(l.price||0)-low)/low*100:0;x.positionSum+=p;if(p<=.1)x.lowMatches++;});});
        return Object.values(g).map(x=>{const sk=Object.keys(x.items).length,p=x.listings?x.positionSum/x.listings:0,lr=x.listings?x.lowMatches/x.listings:0;let b='SPECIALIST';if(sk>=6)b='BROAD SELLER';if(lr>=.6)b='AGGRESSIVE LOW';else if(p>=5)b='PREMIUM';return Object.assign({},x,{skuCount:sk,avgPremiumPct:p,lowRate:lr,behavior:b,competitorScore:Math.max(0,Math.min(100,lr*50+Math.min(30,sk*5)+Math.min(20,x.listings*2)))});}).sort((a,b)=>b.competitorScore-a.competitorScore);
    }

    function competitorIntelHtml(db){
        const rows=competitorIntelligenceRows(db).slice(0,20);
        return card('<b>Competitive Bazaar Intelligence</b><div style="font-size:11px;color:#999;margin:4px 0 6px;">Profiles recurring organic sellers from enriched Bazaar listings. Sponsored listings are excluded.</div>'+
            (rows.length?rows.map(r=>'<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>'+escapeHtml(r.sellerName)+'</b> ['+escapeHtml(r.sellerId)+'] · '+escapeHtml(r.behavior)+' · Score <b>'+r.competitorScore.toFixed(0)+'</b> · '+r.skuCount+' SKU(s) · '+r.totalQty.toLocaleString()+' units · Lowest-price match '+(r.lowRate*100).toFixed(0)+'% · Avg premium '+r.avgPremiumPct.toFixed(1)+'%</div>').join(''):'<div style="font-size:11px;color:#888;">Enrich market items to build competitor profiles.</div>'));
    }

    function procurementHtml(db) {
        const proc = db.procurement;
        const rows = procurementRows(db);
        const opportunities = rows
            .filter(r => r.action !== 'SKIP')
            .sort((a,b) => b.acquisitionScore-a.acquisitionScore || b.bestDealMarginPct-a.bestDealMarginPct || b.liquidityScore-a.liquidityScore)
            .slice(0, 30);
        const capital = capitalAllocationPlan(db);
        const acquisitions = proc.acquisitions.slice().sort((a,b) => new Date(b.acquiredAt) - new Date(a.acquiredAt)).slice(0, 40);
        const travelRows = proc.travelLedger.slice(0, 30);
        const travelStats = travelAnalytics(db).slice(0, 12);

        const settings = card(`
            <b>Procurement Control</b>
            <div style="font-size:12px;color:#bbb;margin:5px 0 8px;">
                Core procurement is calculated inside the CRM from Torn API data and your local ledger.
                Travel Command additionally uses the public TornW3B Travel Stock page for live abroad stock, profit and profit/hour signals, then layers local CRM history on top.
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;">
                <label style="font-size:10px;color:#aaa;">Budget
                    <input id="mm-proc-budget" type="number" min="0" value="${Number(proc.settings.procurementBudget || 0)}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Target days
                    <input id="mm-proc-target-days" type="number" min="0" value="${Number(proc.settings.targetDays || 5)}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Safety days
                    <input id="mm-proc-safety-days" type="number" min="0" value="${Number(proc.settings.safetyDays || 2)}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Min margin %
                    <input id="mm-proc-margin" type="number" min="0" step="0.1" value="${Number(proc.settings.minMarginPct || 4)}" style="${inputCss()}width:100%;">
                </label>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">
                <button id="mm-save-proc-settings" style="${btn(true)}">Save Targets</button>
                <button data-proc-sync style="${btn(true)}">Sync All Procurement</button>
                <button data-rebuild-acquisitions style="${btn()}">Rebuild Cost Basis</button>
                <button data-proc-refresh-markets style="${btn()}">Refresh Priority Markets</button>
            </div>
        `);

        const capitalHtml = card(`
            <b>Capital Allocation</b>
            <div style="font-size:12px;color:#bbb;margin-top:5px;">
                Budget ${money(capital.budget)} · Planned ${money(capital.budget - capital.remaining)} · Reserve ${money(capital.remaining)}
            </div>
            ${capital.plan.length ? capital.plan.map(p => `
                <div style="border-top:1px solid #333;padding-top:5px;margin-top:5px;font-size:11px;">
                    <b>${escapeHtml(p.name)}</b> ${priorityBadge(p.priority)} · Buy ${p.allocatedQty} @ ${money(p.bestBuyPrice || p.buyTarget)}
                    · Allocate <b>${money(p.allocatedSpend)}</b> · Liquidity ${p.liquidityGrade}
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;margin-top:6px;">Set a budget and sync markets to generate allocations.</div>`}
        `);

        const scanner = card(`
            <b>Native Market Scanner / Sourcing Queue</b>
            <div style="font-size:11px;color:#999;margin:4px 0 7px;">
                BUY means current official Bazaar/Item Market pricing is at or below your calculated buy target.
                WATCH means stock is needed but the live spread is not good enough yet.
            </div>
            ${opportunities.length ? opportunities.map(r => `
                <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #333;padding:6px 0;">
                    <div style="font-size:11px;">
                        <b>${escapeHtml(r.name)}</b> [${escapeHtml(r.id)}] ·
                        <b style="color:${r.action === 'BUY' ? '#9fe3a8' : '#ffd18a'}">${r.action}</b> · ${r.priority}<br>
                        Need ${r.shortage} · Live buy ${r.bestBuyPrice ? money(r.bestBuyPrice) : '—'} · Target ${r.buyTarget ? money(r.buyTarget) : '—'} ·
                        Exit ${r.realisticExit ? money(r.realisticExit) : '—'} · Deal margin ${r.bestDealMarginPct.toFixed(1)}% ·
                        Liquidity ${r.liquidityGrade} · Volatility ${r.historySamples ? r.volatilityPct.toFixed(1) + '%' : '—'}
                    </div>
                    <div style="display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap;">
                        <button data-proc-action="market" data-item="${r.id}" style="${btn()}">Refresh</button>
                        <button data-proc-action="log-buy" data-item="${r.id}" data-name="${escapeHtml(r.name)}" style="${btn()}">Log Buy</button>
                    </div>
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">No current restock opportunities. Sync procurement or add watched items.</div>`}
        `);

        const acquisitionForm = card(`
            <b>Acquisition Ledger / Native Cost Basis</b>
            <div style="font-size:11px;color:#999;margin:4px 0 7px;">
                Item Market Buy (1112) and Bazaar Buy (1225) logs are imported automatically. Use this form for Direct Trade, Travel, faction, or other acquisitions not represented by those logs.
            </div>
            <div style="display:grid;grid-template-columns:.8fr 1.4fr .8fr 1fr 1fr;gap:5px;">
                <input id="mm-buy-item-id" placeholder="Item ID" style="${inputCss()}">
                <input id="mm-buy-item-name" placeholder="Item name" style="${inputCss()}">
                <input id="mm-buy-qty" type="number" min="0" placeholder="Qty" style="${inputCss()}">
                <input id="mm-buy-cost" type="number" min="0" placeholder="Unit cost" style="${inputCss()}">
                <select id="mm-buy-source" style="${inputCss()}">
                    <option>Direct Trade</option><option>Travel</option><option>Faction</option><option>NPC</option><option>Manual</option>
                </select>
            </div>
            <input id="mm-buy-notes" placeholder="Notes / seller / destination" style="${inputCss()}width:100%;margin-top:5px;">
            <button id="mm-add-acquisition" style="${btn(true)}margin-top:6px;">Add Acquisition</button>
            <div style="margin-top:8px;font-size:11px;">
                ${acquisitions.length ? acquisitions.map(a => `
                    <div style="display:flex;justify-content:space-between;gap:6px;border-top:1px solid #303030;padding:5px 0;">
                        <span>${escapeHtml(fmtDate(a.acquiredAt))} · <b>${escapeHtml(a.itemName)}</b> × ${Number(a.quantity || 0)} · ${money(a.unitCost)}/ea · ${escapeHtml(a.source)}</span>
                        ${String(a.externalId || '').startsWith('logbuy:') ? '' : `<button data-proc-action="remove-acquisition" data-acquisition="${a.id}" style="${btn()}">Remove</button>`}
                    </div>
                `).join('') : 'No acquisition lots recorded.'}
            </div>
        `);

        const travel = card(`
            <b>Travel Ledger</b>
            <div style="font-size:11px;color:#999;margin:4px 0 7px;">
                Record foreign-shop observations and purchases. Entries also feed the cost-basis ledger.
            </div>
            <div style="display:grid;grid-template-columns:1.1fr .7fr 1.2fr .7fr .9fr .8fr;gap:5px;">
                <input id="mm-travel-destination" placeholder="Destination" style="${inputCss()}">
                <input id="mm-travel-item-id" placeholder="Item ID" style="${inputCss()}">
                <input id="mm-travel-item-name" placeholder="Item name" style="${inputCss()}">
                <input id="mm-travel-qty" type="number" min="0" placeholder="Qty" style="${inputCss()}">
                <input id="mm-travel-cost" type="number" min="0" placeholder="Unit cost" style="${inputCss()}">
                <input id="mm-travel-stock" type="number" min="0" placeholder="Stock seen" style="${inputCss()}">
            </div>
            <input id="mm-travel-notes" placeholder="Notes" style="${inputCss()}width:100%;margin-top:5px;">
            <button id="mm-add-travel" style="${btn(true)}margin-top:6px;">Add Travel Purchase</button>
            ${travelStats.length ? `<div style="margin-top:8px;font-size:11px;color:#bbb;">${travelStats.map(t =>
                `${escapeHtml(t.destination)} · <b>${escapeHtml(t.itemName)}</b>: ${t.quantity} bought across ${t.trips} record(s), avg cost ${money(t.avgUnitCost)}, avg observed stock ${t.avgObservedStock ? t.avgObservedStock.toFixed(1) : '—'}`
            ).join('<br>')}</div>` : ''}
            ${travelRows.length ? `<details style="margin-top:7px;"><summary>Recent travel entries</summary>${travelRows.map(t => `
                <div style="display:flex;justify-content:space-between;gap:6px;font-size:11px;border-top:1px solid #303030;padding:5px 0;">
                    <span>${escapeHtml(fmtDate(t.at))} · ${escapeHtml(t.destination)} · ${escapeHtml(t.itemName)} × ${t.quantity} @ ${money(t.unitCost)}</span>
                    <button data-proc-action="remove-travel" data-travel="${t.id}" style="${btn()}">Remove</button>
                </div>`).join('')}</details>` : ''}
        `);

        const diagnostics = proc.diagnostics.length
            ? card(`<b>Diagnostics</b><div style="font-size:11px;color:#aaa;margin-top:5px;">${proc.diagnostics.slice(0,12).map(d => `${escapeHtml(fmtDate(d.at))}: ${escapeHtml(d.text)}`).join('<br>')}</div>`)
            : '';

        return capitalCommandHtml(db) + travelCommandHtml(db) + opportunityAlertsHtml(db) + settings + capitalHtml + scanner + acquisitionForm + travel + diagnostics;
    }


    function intelStatusBadge(label) {
        const styles = {
            'BUY NOW': 'background:#1f4a29;color:#c9f4d0;border:1px solid #4e8b5d;',
            'WATCH PRICE': 'background:#5a4319;color:#ffe4a8;border:1px solid #9d7530;',
            'SOURCE': 'background:#333;color:#ddd;border:1px solid #666;'
        };
        return `<span style="${styles[label] || styles.SOURCE}padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold;">${escapeHtml(label)}</span>`;
    }

    function marketIntelHtml(db) {
        const intel = db.marketIntel;
        const settings = intel.settings;
        const rules = businessRules(db);
        const global = globalOpportunityRows(db);
        const restocks = restockCommandRows(db);
        const instant = instantArbitrageRows(db);
        const baskets = sellerBasketRows(db).slice(0, 15);
        const suppliers = supplierIntelRows(db).slice(0, 15);
        const dollars = intel.dollarItems.slice().sort((a,b) => b.totalValue - a.totalValue).slice(0, 100);
        const ranked = intel.ranked.slice().sort((a,b) => a.price - b.price).slice(0, 20);
        const auctions = intel.auctions.slice().sort((a,b) => (a.endsAtUnix || Infinity) - (b.endsAtUnix || Infinity)).slice(0, 20);
        const capital = globalCapitalPlan(db);
        const freshness = freshnessInfo(intel.marketplaceGeneratedAt, rules.maxListingAgeSec);

        const controls = card(`
            <b>Global Market Intelligence</b>
            <div style="font-size:11px;color:#aaa;margin:4px 0 7px;">
                Provider: TornW3B public API · cache age ${Number.isFinite(freshness.ageSeconds) ? `${Math.round(freshness.ageSeconds)}s` : '—'} ·
                freshness ${escapeHtml(freshness.label)} · API cap documented at 100 calls/min.
                Sponsored rows are retained for visibility but organic listings/traders are independently ranked.
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;">
                <label style="font-size:10px;color:#aaa;">Min ROI %
                    <input id="mm-intel-min-roi" type="number" step="0.1" min="0" value="${rules.minRoiPct}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Min Demand / day
                    <input id="mm-intel-min-demand" type="number" step="0.01" min="0" value="${rules.minDemandPerDay}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Min Buy $
                    <input id="mm-intel-min-market" type="number" min="0" value="${rules.minPrice}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Max Buy $
                    <input id="mm-intel-max-market" type="number" min="0" value="${rules.maxPrice}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Min Profit / unit
                    <input id="mm-intel-min-profit" type="number" min="0" value="${rules.minAbsoluteProfit}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Min Sellers
                    <input id="mm-intel-min-sellers" type="number" min="0" value="${rules.minSellerCount}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Enrich Top
                    <input id="mm-intel-max-enrich" type="number" min="1" max="30" value="${settings.maxEnrich}" style="${inputCss()}width:100%;">
                </label>
                <label style="font-size:10px;color:#aaa;">Exit haircut %
                    <input id="mm-intel-haircut" type="number" min="0" step="0.1" value="${settings.bazaarExitHaircutPct}" style="${inputCss()}width:100%;">
                </label>
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;">
                <button id="mm-save-intel-settings" style="${btn(true)}">Save Scanner Rules</button>
                <button id="mm-intel-global-sync" style="${btn(true)}">Refresh Global Market</button>
                <button id="mm-intel-full-sync" style="${btn(true)}">Full Intelligence Sync</button>
                <button id="mm-intel-enrich" style="${btn()}">Enrich Top Deals</button>
                <button id="mm-intel-dollar" style="${btn()}">$1 Scanner</button>
                <button data-intel-ranked style="${btn()}">Ranked/Auction</button>
            </div>
        `);

        const restockHtml = card(`
            <b>Restock Command Center</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">Local demand + Torn inventory + global Bazaar sourcing in one queue.</div>
            ${restocks.length ? restocks.slice(0, 25).map(r => `
                <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;">
                    <div style="font-size:11px;">
                        <b>${escapeHtml(r.name)}</b> ${priorityBadge(r.priority)} ${intelStatusBadge(r.status)}<br>
                        Need ${r.shortage} · Source qty ${r.sourceQty || '—'} · Buy ${r.globalBuyPrice ? money(r.globalBuyPrice) : '—'} ·
                        Target ${r.buyTarget ? money(r.buyTarget) : '—'} · Exit ${r.globalExit ? money(r.globalExit) : '—'} · ROI ${r.globalRoiPct.toFixed(1)}%
                        ${r.sellerName ? `<br>Seller: ${escapeHtml(r.sellerName)} [${escapeHtml(r.sellerId)}]` : ''}
                    </div>
                    <div style="display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap;">
                        <button data-intel-action="enrich" data-item="${r.id}" style="${btn()}">Verify</button>
                        ${r.sellerId ? `<button data-intel-action="verify-seller" data-item="${r.id}" data-seller="${r.sellerId}" data-price="${Number(r.buyPrice||r.globalBuyPrice||0)}" style="${btn()}">Verify Seller</button>` : ''}
                        <button data-proc-action="log-buy" data-item="${r.id}" data-name="${escapeHtml(r.name)}" style="${btn()}">Log Buy</button>
                    </div>
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">No current local shortages.</div>`}
        `);

        const globalHtml = card(`
            <b>Global Deal Scanner</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">
                Coarse scan uses TornW3B aggregate market data; enriched rows add seller-level listings and trader exits.
            </div>
            ${global.length ? global.slice(0, 40).map((r, index) => `
                <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;">
                    <div style="font-size:11px;">
                        <b>#${index + 1} ${escapeHtml(r.name)}</b> [${escapeHtml(r.id)}] · Score <b>${r.score.toFixed(0)}</b> · Confidence ${r.confidence.toFixed(0)}%<br>
                        Buy ${money(r.buyPrice)} · Best exit ${money(r.bestExit)} (${escapeHtml(r.bestExitRoute)}) · Profit ${money(r.profit)} · ROI <b>${r.roiPct.toFixed(1)}%</b><br>
                        Bazaar avg ${r.bazaarAverage ? money(r.bazaarAverage) : '—'} · Torn market ${r.marketPrice ? money(r.marketPrice) : '—'} · Sellers ${r.sellerCount}
                        ${r.enriched ? ` · Listing qty ${r.listingQty || '—'}${r.sellerName ? ` · ${escapeHtml(r.sellerName)}` : ''}` : ' · aggregate only'}
                    </div>
                    <div style="display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap;">
                        <button data-intel-action="enrich" data-item="${r.id}" style="${btn(r.enriched)}">${r.enriched ? 'Refresh' : 'Analyze'}</button>
                        ${r.sellerId ? `<button data-intel-action="verify-seller" data-item="${r.id}" data-seller="${r.sellerId}" data-price="${Number(r.buyPrice||r.globalBuyPrice||0)}" style="${btn()}">Verify Seller</button>` : ''}
                    </div>
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">Run Refresh Global Market to populate opportunities.</div>`}
        `);

        const instantHtml = card(`
            <b>Instant Trader Arbitrage</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">Cheapest organic Bazaar listing compared with highest organic active public trader buy price.</div>
            ${instant.length ? instant.slice(0, 25).map(r => `
                <div style="font-size:11px;border-top:1px solid #303030;padding:6px 0;">
                    <b>${escapeHtml(r.name)}</b> · Buy ${money(r.buyPrice)} → Trader ${money(r.traderExit)} ·
                    Spread ${money(r.instantProfit)} · ROI <b>${r.instantRoiPct.toFixed(1)}%</b> · Qty ${r.maxQty || '—'} ·
                    Total potential ${money(r.totalInstantProfit)}
                    ${r.sellerName ? `<br>Seller ${escapeHtml(r.sellerName)} [${escapeHtml(r.sellerId)}]` : ''}
                    ${r.traderName ? ` · Trader ${escapeHtml(r.traderName)}` : ''}
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">No verified positive Bazaar → trader spreads in enriched items.</div>`}
        `);

        const basketHtml = card(`
            <b>Supplier Basket Optimizer</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">Groups verified listings by seller so one seller can solve multiple shortages/deals.</div>
            ${baskets.length ? baskets.map(b => `
                <details style="border-top:1px solid #303030;padding:5px 0;">
                    <summary style="cursor:pointer;font-size:11px;">
                        <b>${escapeHtml(b.sellerName)}</b> [${escapeHtml(b.sellerId)}] · ${b.restockSkus} restock SKU(s) · ${b.skus} analyzed SKU(s) ·
                        Spend ${money(b.totalSpend)} · Expected profit ${money(b.totalExpectedProfit)}
                    </summary>
                    <div style="font-size:10px;color:#bbb;padding:4px 0 0 8px;">
                        ${b.items.slice(0,20).map(i =>
                            `${escapeHtml(i.itemName)} × ${i.quantity} @ ${money(i.price)} → ${i.exit ? money(i.exit) : '—'} · profit ${money(i.expectedProfit)}${i.restock ? ' · RESTOCK' : ''}`
                        ).join('<br>')}
                    </div>
                </details>
            `).join('') : `<div style="font-size:11px;color:#888;">Enrich several deal/restock items to build seller baskets.</div>`}
        `);

        const capitalHtml = card(`
            <b>Capital Allocation v2</b>
            <div style="font-size:11px;color:#bbb;margin:4px 0 6px;">
                Budget ${money(capital.budget)} · Planned ${money(capital.budget - capital.remaining)} · Reserve ${money(capital.remaining)}
            </div>
            ${capital.plan.length ? capital.plan.map(p => `
                <div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;">
                    <b>${escapeHtml(p.type)}</b> · ${escapeHtml(p.itemName)} × ${p.quantity} @ ${money(p.unitPrice)}
                    · Spend ${money(p.spend)} · Expected profit ${money(p.expectedProfit)} · ROI ${p.roiPct.toFixed(1)}%
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">Set procurement budget and sync market intelligence.</div>`}
        `);

        const dollarHtml = card(`
            <b>$1 Bazaar Scanner</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">Public $1 listings are high-race-condition opportunities; always verify before buying.</div>
            ${dollars.length ? dollars.map(d => {
                const f = freshnessInfo(d.lastUpdated, settings.freshnessWarnSeconds);
                return `<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:5px 0;font-size:11px;">
                    <div><b>${escapeHtml(d.itemName)}</b> × ${d.quantity} · Market ${money(d.marketPrice)} · Total ${money(d.totalValue)} · Age ${Number.isFinite(f.ageSeconds) ? Math.round(f.ageSeconds) + 's' : '—'}<br>
                    ${escapeHtml(d.sellerName)} [${escapeHtml(d.sellerId)}]</div>
                    <button data-intel-action="verify-seller" data-item="${d.itemId}" data-seller="${d.sellerId}" data-price="1" style="${btn()}">Verify & Open</button>
                </div>`;
            }).join('') : `<div style="font-size:11px;color:#888;">Run $1 Scanner or Full Intelligence Sync.</div>`}
        `);

        const supplierHtml = card(`
            <b>Supplier Intelligence</b>
            ${suppliers.length ? suppliers.map(s => `
                <div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;">
                    <b>${escapeHtml(s.sellerName)}</b> [${escapeHtml(s.sellerId)}] · Score ${s.score.toFixed(0)} ·
                    ${s.itemCount} SKU(s) observed · ${Number(s.totalQuantityObserved || 0).toLocaleString()} units observed · Last ${escapeHtml(fmtDate(s.lastSeenAt))}
                </div>
            `).join('') : `<div style="font-size:11px;color:#888;">Supplier intelligence grows automatically from detailed Bazaar listing scans.</div>`}
        `);

        const rankedHtml = card(`
            <b>Ranked / Auction Intelligence</b>
            <div style="font-size:11px;color:#999;margin:4px 0 6px;">Separate high-variance equipment feed. No automatic ROI claim is made without comparable item detail.</div>
            ${ranked.length ? `<details><summary>Ranked listings (${intel.ranked.length})</summary>${ranked.map(r => `
                <div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;">
                    ${escapeHtml(r.rarity)} ${escapeHtml(r.itemName)} · ${money(r.price)} · ${escapeHtml(r.source)} ·
                    Dmg ${escapeHtml(r.damage ?? '—')} · Acc ${escapeHtml(r.accuracy ?? '—')} · Q ${escapeHtml(r.quality ?? '—')}
                    ${r.sellerName ? ` · ${escapeHtml(r.sellerName)}` : ''}
                </div>
            `).join('')}</details>` : '<div style="font-size:11px;color:#888;">No ranked feed loaded.</div>'}
            ${auctions.length ? `<details style="margin-top:6px;"><summary>Live auctions (${intel.auctions.length})</summary>${auctions.map(r => `
                <div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;">
                    ${escapeHtml(r.rarity)} ${escapeHtml(r.itemName)} · Current ${money(r.price)} · Ends ${r.endsAtUnix ? escapeHtml(fmtDate(r.endsAtUnix * 1000)) : '—'}
                </div>
            `).join('')}</details>` : ''}
        `);

        const diagnostics = intel.diagnostics.length
            ? card(`<b>Market Intel Diagnostics</b><div style="font-size:10px;color:#aaa;margin-top:5px;">${intel.diagnostics.slice(0,15).map(d => `${escapeHtml(fmtDate(d.at))}: ${escapeHtml(d.text)}`).join('<br>')}</div>`)
            : '';

        return controls + competitorIntelHtml(db) + supplierPerformanceHtml(db) + restockHtml + globalHtml + instantHtml + basketHtml + capitalHtml + dollarHtml + supplierHtml + rankedHtml + diagnostics;
    }


    function opsStateBadge(state){
        const map={
            'OUT OF STOCK':'#7a1f1f','SOURCE NOW':'#5d2c15','PRICE REVIEW':'#6a4f19','NEEDS LISTING':'#4f4517','WATCH PRICE':'#374560',
            'PURCHASED':'#26425c','RECEIVED':'#24493a','OVERSTOCKED':'#49345b','DEAD STOCK':'#5a2c39','LISTED':'#24422d'
        };
        return `<span style="background:${map[state]||'#333'};border:1px solid #777;color:#fff;border-radius:10px;padding:2px 6px;font-size:10px;font-weight:bold;">${escapeHtml(state)}</span>`;
    }

    function operationsHtml(db){
        const rows=advancedInventoryRows(db);
        const brief=ownerBriefing(db);
        const session=getActiveRestockSession(db);
        const plans=listingPlanPreview(db);
        const sessionHistory=db.operations.restockSessions.slice(0,8);
        const events=db.operations.events||[];

        const briefProfit = brief.profitCoverage === 'UNAVAILABLE' ? '—' : money(brief.grossProfit);
        const briefProfitNote = brief.profitCoverage === 'COMPLETE'
            ? 'complete FIFO cost basis'
            : brief.profitCoverage === 'PARTIAL'
                ? brief.costCoveragePct.toFixed(0) + '% FIFO coverage — partial'
                : 'cost basis unavailable';
        const briefHtml=card(`<b>Daily Bazaar Briefing</b><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:7px;font-size:11px;">
            <div>30d Revenue<br><b>${money(brief.revenue)}</b></div><div>Tracked Gross Profit<br><b>${briefProfit}</b><br><span style="font-size:9px;color:#888;">${escapeHtml(briefProfitNote)}</span></div>
            <div>Inventory Cost<br><b>${money(brief.inventoryValue)}</b></div><div>Units Sold<br><b>${brief.units.toLocaleString()}</b></div>
            <div>Critical Actions<br><b>${brief.critical}</b></div><div>Stockouts Now<br><b>${brief.stockouts}</b></div>
            <div>Est. Lost Profit<br><b>${money(brief.lostProfit)}</b></div><div>Dead Capital<br><b>${money(brief.deadCapital)}</b></div>
        </div><div style="font-size:11px;color:#aaa;margin-top:6px;">Best SKU: ${escapeHtml(brief.best?.name||'—')} · Worst/slowest: ${escapeHtml(brief.worst?.name||'—')}</div>`);

        let sessionHtml='';
        if(session){
            const q=session.queue[session.activeIndex];
            sessionHtml=card(`<b>Active Restock Session</b><div style="font-size:11px;color:#aaa;margin:4px 0;">Session ${escapeHtml(session.id)} · ${session.activeIndex+1}/${session.queue.length} · Spent ${money(session.spent)} · Expected profit ${money(session.expectedProfit)}</div>
                ${q?`<div style="font-size:13px;"><b>${escapeHtml(q.itemName)}</b> ${intelStatusBadge(q.buyPrice&&q.buyTarget&&q.buyPrice<=q.buyTarget?'BUY NOW':'WATCH PRICE')}<br>
                Need ${q.need} · Available ${q.sourceQty||'—'} · Buy ${q.buyPrice?money(q.buyPrice):'—'} · Max ${q.buyTarget?money(q.buyTarget):'—'} · Exit ${q.exit?money(q.exit):'—'} · ROI ${Number(q.roiPct||0).toFixed(1)}%
                ${q.sellerName?`<br>Seller ${escapeHtml(q.sellerName)} [${escapeHtml(q.sellerId)}]`:''}</div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;">
                    ${q.sellerId?`<button data-ops-action="seller" data-item="${q.itemId}" data-seller="${q.sellerId}" data-price="${Number(q.buyPrice||0)}" style="${btn()}">Verify Seller</button>`:''}
                    <button data-restock-log-purchase style="${btn(true)}">Log Purchase</button>
                    <button data-restock-skip style="${btn()}">Skip / Next</button>
                </div>`:'Session complete.'}
            `);
        } else {
            const shortages=rows.filter(r=>['OUT OF STOCK','SOURCE NOW','WATCH PRICE'].includes(r.state)).length;
            sessionHtml=card(`<b>Guided Restock Session</b><div style="font-size:11px;color:#aaa;margin:5px 0;">${shortages} SKU(s) currently need sourcing. Budget ${money(db.procurement.settings.procurementBudget||0)}.</div>
                <button data-start-restock-session style="${btn(true)}">Start Restock Session</button>`);
        }

        const actionQueue=card(`<b>Action Queue</b>${rows.slice(0,35).map(r=>`<div style="display:flex;justify-content:space-between;gap:7px;border-top:1px solid #303030;padding:5px 0;font-size:11px;">
            <div><b>${escapeHtml(r.name)}</b> ${opsStateBadge(r.state)} · ABC ${r.abc} · ${escapeHtml(r.inventoryClass)}<br>
            Stock ${r.stock} · Forecast ${r.forecastDaily.toFixed(2)}/day · Target ${r.adaptiveTargetStock} · Need ${r.adaptiveShortage} · Safety ${r.safety.units}<br>
            Bazaar ${r.bazaarQty}/${r.targetListed} target listed · Add ${r.addToBazaar} · Price ${r.plannedPrice?money(r.plannedPrice):'—'} · GMROI ${(r.realized.gmroi*100).toFixed(1)}%</div>
            <div>${r.addToBazaar>0?`<button data-ops-action="listing-plan" data-item="${r.id}" style="${btn()}">Listing Plan</button>`:''}</div>
        </div>`).join('')}`);

        const listingHtml=card(`<b>Bazaar Listing Assistant</b><div style="font-size:11px;color:#aaa;margin:4px 0;">${Object.keys(plans).length} SKU(s) currently need replenishment on your Bazaar. On Torn's Bazaar page, the helper fills quantity/price only; you manually submit.</div>
            <button data-open-bazaar-add style="${btn(true)}">Open Bazaar Add Page</button>
            <details style="margin-top:7px;"><summary>Current listing plan</summary>${Object.values(plans).map(p=>`<div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;">${escapeHtml(p.itemName)} × ${p.quantity} @ ${money(p.price)} · Cost ${p.cost?money(p.cost):'—'} · Margin ${p.expectedMarginPct.toFixed(1)}%</div>`).join('')||'No listing replenishment needed.'}</details>`);

        const historyHtml=card(`<b>Restock Session History</b>${sessionHistory.length?sessionHistory.map(s=>`<div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;">${escapeHtml(fmtDate(s.createdAt))} · ${s.queue.length} SKU(s) · Spent ${money(s.spent)} · Expected profit ${money(s.expectedProfit)} · ${s.completedAt?'Completed':'Active'}</div>`).join(''):'<div style="font-size:11px;color:#888;">No sessions yet.</div>'}`);

        const eventHtml=card(`<b>Demand Events</b><div style="font-size:11px;color:#999;margin:4px 0;">Use known Torn/event periods to adjust demand forecasts without hardcoding assumptions.</div>
            <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr .6fr;gap:5px;"><input id="mm-event-name" placeholder="Event name" style="${inputCss()}"><input id="mm-event-start" type="datetime-local" style="${inputCss()}"><input id="mm-event-end" type="datetime-local" style="${inputCss()}"><input id="mm-event-mult" type="number" min=".1" step=".1" value="1.2" style="${inputCss()}"></div>
            <button id="mm-add-event" style="${btn()}margin-top:5px;">Add Event</button>
            ${events.map(e=>`<div style="display:flex;justify-content:space-between;gap:5px;font-size:10px;border-top:1px solid #303030;padding:4px 0;"><span>${escapeHtml(e.name)} · ${escapeHtml(fmtDate(e.startAt))} → ${escapeHtml(fmtDate(e.endAt))} · ×${Number(e.multiplier||1).toFixed(2)}</span><button data-ops-action="remove-event" data-event="${e.id}" style="${btn()}">Remove</button></div>`).join('')}`);

        return briefHtml+sessionHtml+actionQueue+listingHtml+historyHtml+eventHtml;
    }

    function analyticsHtml(db){
        const rows=advancedInventoryRows(db);
        const clv=customerClvRows(db);
        const coupon=couponRoiMetrics(db);
        const whatifs=[3,5,7,10].map(d=>inventoryWhatIf(db,d));
        const dead=rows.filter(r=>r.deadCapital>0).sort((a,b)=>b.deadCapital-a.deadCapital).slice(0,20);
        const profit=rows.slice().sort((a,b)=>b.realized.grossProfit-a.realized.grossProfit).slice(0,30);

        const profitHtml=card(`<b>Profit / Capital Efficiency</b>${profit.map(r=>`<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>${escapeHtml(r.name)}</b> · Revenue ${money(r.realized.revenue)} · COGS ${money(r.realized.cogs)} · Tracked Gross ${money(r.realized.grossProfit)} · Cost coverage ${r.realized.costCoveragePct.toFixed(0)}% · GMROI ${(r.realized.gmroi*100).toFixed(1)}% · Cash velocity ${(r.realized.cashVelocity*100).toFixed(2)}%/day · Avg age ${r.realized.avgAge.toFixed(1)}d · ABC ${r.abc} · ${escapeHtml(r.inventoryClass)}</div>`).join('')}`);

        const deadHtml=card(`<b>Inventory Aging / Dead Capital</b>${dead.length?dead.map(r=>`<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>${escapeHtml(r.name)}</b> · Dead capital ${money(r.deadCapital)} · Oldest ${r.maxAge.toFixed(1)}d · Forecast ${r.forecastDaily.toFixed(2)}/day · ${opsStateBadge(r.state)}</div>`).join(''):'<div style="font-size:11px;color:#888;">No dead-capital lots detected from tracked FIFO acquisitions.</div>'}`);

        const forecastHtml=card(`<b>Demand Forecast / Lost Sales</b>${rows.slice(0,30).map(r=>`<div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;"><b>${escapeHtml(r.name)}</b> · Forecast ${r.forecastDaily.toFixed(2)}/d · 3d ${r.forecast.recent3.toFixed(2)} · prior7 ${r.forecast.prior7.toFixed(2)} · prior30 ${r.forecast.prior30.toFixed(2)} · safety ${r.safety.units} (${r.safety.safetyDays.toFixed(1)}d) · stockout ${r.stockout.stockoutHours.toFixed(1)}h · est. lost ${r.stockout.lostUnits.toFixed(1)} units / ${money(r.lostProfit)}</div>`).join('')}`);

        const elasticityHtml=card(`<b>Price Elasticity / Pricing Simulation</b>${rows.filter(r=>r.elasticity.buckets.length).slice(0,15).map(r=>`<details style="border-top:1px solid #303030;padding:4px 0;"><summary style="font-size:11px;"><b>${escapeHtml(r.name)}</b> · recommended ${r.plannedPrice?money(r.plannedPrice):'—'} · best observed ${r.elasticity.best?money(r.elasticity.best.price):'—'}</summary><div style="font-size:10px;color:#bbb;">Observed: ${r.elasticity.buckets.slice(-8).map(b=>`${money(b.price)} → ${b.unitsPerDay.toFixed(2)}/d, ${money(b.profitPerDay)}/d`).join('<br>')}<br><br>Simulation: ${priceSimulationRows(db,r.id).map(x=>`${money(x.price)} → ${x.unitsPerDay.toFixed(2)}/d → ${money(x.profitPerDay)}/d`).join('<br>')}</div></details>`).join('')||'<div style="font-size:11px;color:#888;">Price elasticity will become available after multiple Bazaar price snapshots and sales intervals are collected.</div>'}`);

        const whatifHtml=card(`<b>Inventory What-if Simulation</b>${whatifs.map(w=>`<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>${w.days} target days</b> · Additional capital ${money(w.capital)} · Approx stockout exposure ${(w.stockoutRisk*100).toFixed(1)}% · Proportional gross-profit baseline ${money(w.expectedGross)}</div>`).join('')}`);

        const customerHtml=card(`<b>Customer Intelligence — RFM / CLV / Affinity</b><div style="font-size:11px;color:#aaa;margin:4px 0;">Estimated CLV uses your tracked 30-day realized gross-margin rate; it is an operational estimate, not accounting profit.</div>${clv.slice(0,30).map(c=>`<div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;"><b>${escapeHtml(c.name)} [${escapeHtml(c.id)}]</b> · ${escapeHtml(c.segment)} · Recency ${c.recencyDays.toFixed(1)}d · Freq ${c.frequency} · Spend ${money(c.monetary)} · Est net value ${money(c.estimatedNetValue)} · Affinity ${c.topProducts.map(x=>`${escapeHtml(x[0])}×${x[1]}`).join(', ')||'—'}</div>`).join('')}`);

        const couponHtml=card(`<b>Coupon ROI</b><div style="font-size:11px;">Coupon customers ${coupon.couponCustomers} · Repeat ${(coupon.couponRepeatRate*100).toFixed(1)}%<br>Non-coupon customers ${coupon.nonCouponCustomers} · Repeat ${(coupon.nonCouponRepeatRate*100).toFixed(1)}%<br>Cashback paid ${money(coupon.cashback)} · Estimated gross profit from coupon-customer revenue ${money(coupon.grossProfit)} · Estimated ROI ${(coupon.roi*100).toFixed(1)}%</div>`);

        return capitalCommandHtml(db)+deadCapitalDirectorHtml(db)+salesFunnelHtml(db)+customerAffinityHtml(db)+pricingDirectorHtml(db)+profitHtml+deadHtml+forecastHtml+elasticityHtml+whatifHtml+customerHtml+couponHtml;
    }


    function applyStrategyPreset(name) {
        const db = dbLoad();
        const preset = String(name || 'BALANCED').toUpperCase();
        const presets = {
            BALANCED: { targetDays:5, safetyDays:2, minMarginPct:4, listingHours:12, deadStockDays:30, overstockMultiplier:1.5, minRoiPct:3, minBazaarSellers:2 },
            FAST_TURNOVER: { targetDays:3, safetyDays:1, minMarginPct:2.5, listingHours:8, deadStockDays:14, overstockMultiplier:1.3, minRoiPct:2.5, minBazaarSellers:2 },
            HIGH_MARGIN: { targetDays:5, safetyDays:2, minMarginPct:7, listingHours:12, deadStockDays:30, overstockMultiplier:1.5, minRoiPct:7, minBazaarSellers:2 },
            LOW_RISK: { targetDays:4, safetyDays:2.5, minMarginPct:4, listingHours:10, deadStockDays:21, overstockMultiplier:1.3, minRoiPct:4, minBazaarSellers:4 }
        };
        if (preset !== 'CUSTOM' && presets[preset]) {
            const p = presets[preset];
            db.procurement.settings.targetDays = p.targetDays;
            db.procurement.settings.safetyDays = p.safetyDays;
            db.procurement.settings.minMarginPct = p.minMarginPct;
            db.operations.settings.listingHours = p.listingHours;
            db.operations.settings.deadStockDays = p.deadStockDays;
            db.operations.settings.overstockMultiplier = p.overstockMultiplier;
            db.businessRules.minRoiPct = p.minRoiPct;
            db.businessRules.minSellerCount = p.minBazaarSellers;
            db.businessRules.updatedAt = nowIso();
            db.marketIntel.settings.minRoiPct = p.minRoiPct;
            db.marketIntel.settings.minBazaarSellers = p.minBazaarSellers;
        }
        db.operations.settings.strategyPreset = preset;
        dbSave(db);
        statusText = `Strategy preset: ${preset.replaceAll('_',' ')}`;
        render();
    }

    function freshnessAgeText(value) {
        const at = Date.parse(value || '') || 0;
        if (!at) return 'not synced';
        const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
        if (sec < 60) return sec + 's ago';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        return Math.floor(sec / 86400) + 'd ago';
    }

    function sourceReadinessChip(label, at, due, available = true) {
        const state = !available
            ? 'NOT CONFIGURED'
            : due
                ? (at ? 'STALE' : 'NOT SYNCED')
                : 'CURRENT';
        const tone = !available
            ? '#888'
            : due
                ? '#ffd18a'
                : '#9fe3a8';
        const age = available ? freshnessAgeText(at) : 'requires API access';
        return '<span style="display:inline-flex;gap:4px;align-items:center;border:1px solid #444;border-radius:999px;padding:3px 6px;font-size:9px;white-space:nowrap;">' +
            '<b>' + escapeHtml(label) + '</b> <span style="color:' + tone + ';font-weight:700;">' + state + '</span> <span style="color:#777;">' + escapeHtml(age) + '</span>' +
        '</span>';
    }


    function businessRulesSummaryHtml(db) {
        const r = businessRules(db);
        return '<div style="font-size:10px;color:#888;line-height:1.45;">' +
            'CRM rules · ROI ≥ <b>' + r.minRoiPct.toFixed(1) + '%</b> · Demand ≥ <b>' + r.minDemandPerDay.toFixed(2) + '/day</b> when your sample is mature · ' +
            'Buy price <b>' + money(r.minPrice) + '–' + money(r.maxPrice) + '</b> · Profit ≥ <b>' + money(r.minAbsoluteProfit) + '</b> · ' +
            'Sellers ≥ <b>' + r.minSellerCount + '</b> · Listing freshness ≤ <b>' + r.maxListingAgeSec + 's</b>' +
        '</div>';
    }

    function businessRulesCard(db, compact = false) {
        const r = businessRules(db);
        if (compact) {
            return card(
                '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">' +
                    '<div><b>Business Rules</b>' + businessRulesSummaryHtml(db) + '</div>' +
                    '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button data-smart-refresh style="' + btn(true) + '">Smart Refresh</button><button data-simple-go="reports" style="' + btn() + '">Edit Rules</button></div>' +
                '</div>'
            );
        }

        return card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">' +
                '<div><b style="font-size:14px;">CRM-wide Business Rules</b><div style="font-size:10px;color:#888;margin-top:2px;">One ruleset for Deals, Procurement, Stock decisions and market screening. Personal sales demand takes priority after enough observations exist.</div></div>' +
                '<button data-smart-refresh style="' + btn(true) + '">Smart Refresh</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px;">' +
                '<label style="font-size:10px;color:#aaa;">Min ROI %<input id="mm-rule-min-roi" type="number" min="0" step="0.1" value="' + r.minRoiPct + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Min Demand / day<input id="mm-rule-min-demand" type="number" min="0" step="0.01" value="' + r.minDemandPerDay + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Min Buy Price<input id="mm-rule-min-price" type="number" min="0" step="1" value="' + r.minPrice + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Max Buy Price<input id="mm-rule-max-price" type="number" min="0" step="1" value="' + r.maxPrice + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Min Profit / unit<input id="mm-rule-min-profit" type="number" min="0" step="1" value="' + r.minAbsoluteProfit + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Min Sellers<input id="mm-rule-min-sellers" type="number" min="0" step="1" value="' + r.minSellerCount + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Max Listing Age (sec)<input id="mm-rule-max-age" type="number" min="30" step="10" value="' + r.maxListingAgeSec + '" style="' + inputCss() + 'width:100%;"></label>' +
                '<label style="font-size:10px;color:#aaa;">Market Items / Refresh<input id="mm-rule-refresh-limit" type="number" min="5" max="30" step="1" value="' + r.marketRefreshLimit + '" style="' + inputCss() + 'width:100%;"></label>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;"><button id="mm-save-business-rules" style="' + btn(true) + '">Save Business Rules</button></div>' +
            '<div style="font-size:10px;color:#777;margin-top:6px;">Before your personal sample matures, procurement uses market seller/depth evidence. After ≥5 sold units in 30 days or sales on ≥3 distinct days, your own demand increasingly controls ranking and the Demand/day threshold applies directly.</div>'
        );
    }

    function simpleMetric(label, value, note = '') {
        return `<div style="background:#151515;border:1px solid #333;border-radius:7px;padding:9px;min-width:0;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;">${escapeHtml(label)}</div>
            <div style="font-size:17px;font-weight:700;margin-top:2px;overflow:hidden;text-overflow:ellipsis;">${value}</div>
            ${note ? `<div style="font-size:10px;color:#777;margin-top:2px;">${escapeHtml(note)}</div>` : ''}
        </div>`;
    }

    function simpleActionButton(label, tab, primary = false) {
        return `<button data-simple-go="${tab}" style="${btn(primary)}padding:9px 12px;min-width:112px;">${escapeHtml(label)}</button>`;
    }

    function compactItemDetails(r) {
        return `<details style="margin-top:5px;">
            <summary style="cursor:pointer;color:#999;font-size:10px;">Details</summary>
            <div style="font-size:10px;color:#aaa;line-height:1.55;margin-top:4px;">
                Forecast ${Number(r.forecastDaily || 0).toFixed(2)}/day · Safety ${Number(r.safety?.units || 0)} ·
                GMROI ${(Number(r.realized?.gmroi || 0)*100).toFixed(1)}% · Cash velocity ${(Number(r.realized?.cashVelocity || 0)*100).toFixed(2)}%/day<br>
                ABC ${escapeHtml(r.abc || '—')} · ${escapeHtml(r.inventoryClass || '—')} ·
                Volatility ${Number(r.volatilityPct || 0).toFixed(1)}% · Cost ${r.avgCost ? money(r.avgCost) : '—'} ·
                Dead capital ${money(r.deadCapital || 0)}
            </div>
        </details>`;
    }

    function homeHtml(db) {
        const rows = advancedInventoryRows(db);
        const brief = ownerBriefing(db, rows);
        const deals = globalOpportunityRows(db);
        const urgent = rows.filter(r => ['OUT OF STOCK','SOURCE NOW','PRICE REVIEW','NEEDS LISTING','WATCH PRICE','DEAD STOCK'].includes(r.state));
        const needRestock = rows.filter(r => ['OUT OF STOCK','SOURCE NOW','WATCH PRICE'].includes(r.state)).length;
        const needListing = rows.filter(r => r.state === 'NEEDS LISTING').length;
        const goodDeals = deals.filter(d => d.listingVerified && d.score >= 60).length;
        const pendingAlerts = Object.values(db.subscribers || {}).filter(s => s.pendingNotification).length;

        const fresh = businessDataFreshness(db);
        const readiness = businessRefreshPlan(db, { force:false });
        const hasApi = Boolean(getApiKey());
        const refresh = card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">' +
                '<div><b>Data Readiness</b>' +
                    '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">' +
                        sourceReadinessChip('Sales', fresh.salesAt, readiness.sales, hasApi) +
                        sourceReadinessChip('Market', fresh.marketAt, readiness.market, true) +
                        sourceReadinessChip('$1', fresh.dollarAt, readiness.dollar, true) +
                        sourceReadinessChip('Procure', fresh.procurementAt, readiness.procurement, hasApi) +
                        sourceReadinessChip('Travel', fresh.travelAt, readiness.travel, true) +
                    '</div>' +
                    (fresh.unifiedError ? '<div style="font-size:10px;color:#ff9b9b;margin-top:5px;">Last refresh error: ' + escapeHtml(fresh.unifiedError) + '</div>' : '') +
                '</div>' +
                '<button data-smart-refresh style="' + btn(true) + '">Smart Refresh</button>' +
            '</div>'
        );

        const metrics = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">
            ${simpleMetric('30d Revenue', money(brief.revenue))}
            ${simpleMetric(
                'Tracked Profit',
                brief.profitCoverage === 'UNAVAILABLE' ? '—' : money(brief.grossProfit),
                brief.profitCoverage === 'COMPLETE'
                    ? 'complete FIFO cost basis'
                    : brief.profitCoverage === 'PARTIAL'
                        ? brief.costCoveragePct.toFixed(0)+'% cost coverage — partial'
                        : 'cost basis unavailable'
            )}
            ${simpleMetric('Restock', String(needRestock), 'items need stock')}
            ${simpleMetric('Need Listing', String(needListing), 'ready for Bazaar')}
        </div>`;

        const actions = card(`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
            <div><b style="font-size:15px;">What needs attention</b><div style="font-size:11px;color:#999;margin-top:3px;">${needRestock} restock · ${needListing} listing · ${goodDeals} seller-verifiable deal(s) · ${pendingAlerts} customer alert(s)</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${simpleActionButton('Restock','stock',true)}${simpleActionButton('List Bazaar','stock')}${simpleActionButton('Find Deals','deals')}${simpleActionButton('Customers','customers')}</div>
        </div>`);

        const queue = card(`<b>Priority Actions</b>
            ${urgent.length ? urgent.slice(0,10).map(r => {
                const label = ['OUT OF STOCK','SOURCE NOW','WATCH PRICE'].includes(r.state) ? 'Restock' : r.state === 'NEEDS LISTING' ? 'List' : 'Review';
                return `<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:7px 0;align-items:flex-start;">
                    <div style="min-width:0;font-size:11px;"><div><b>${escapeHtml(r.name)}</b> ${opsStateBadge(r.state)}</div>
                    <div style="color:#aaa;margin-top:3px;">Stock ${r.stock} · Need ${r.adaptiveShortage} · ${r.state === 'NEEDS LISTING' ? `Add ${r.addToBazaar} @ ${r.plannedPrice ? money(r.plannedPrice) : '—'}` : `Buy target ${r.buyTarget ? money(r.buyTarget) : '—'}`}</div>${compactItemDetails(r)}</div>
                    <button data-simple-go="stock" style="${btn(true)}white-space:nowrap;">${label}</button>
                </div>`;
            }).join('') : `<div style="font-size:11px;color:#888;margin-top:6px;">No urgent inventory actions right now.</div>`}
        `);

        const health = card(`<b>Business Health</b><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:6px;">
            ${simpleMetric('Lost Profit', money(brief.lostProfit))}${simpleMetric('Dead Capital', money(brief.deadCapital))}${simpleMetric('Stockouts', String(brief.stockouts))}${simpleMetric('Best SKU', brief.best?.name || '—')}
        </div><div style="margin-top:7px;"><button data-simple-go="reports" style="${btn()}">Open Reports</button></div>`);
        return refresh + metrics + actions + queue + health;
    }

    function stockSimpleHtml(db) {
        const rows = advancedInventoryRows(db);
        const session = getActiveRestockSession(db);
        // Rendering is read-only. Persist plans only when the operator explicitly
        // requests a plan or opens the Bazaar listing assistant.
        const plans = listingPlanPreview(db);
        const restockRows = rows.filter(r => ['OUT OF STOCK','SOURCE NOW','WATCH PRICE'].includes(r.state));
        const listingRows = rows.filter(r => r.addToBazaar > 0);
        const priceReviewRows = listingRows.filter(r => r.state === 'PRICE REVIEW');
        const trustedPlans = Object.values(plans);

        const presetBar = businessRulesCard(db, true);

        const quickRestock = card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div><b style="font-size:15px;">Quick Restock</b><div style="font-size:11px;color:#999;margin-top:2px;">${restockRows.length} item(s) need sourcing · Budget ${money(db.procurement.settings.procurementBudget || 0)}</div></div>
            ${session ? `<span style="font-size:11px;color:#e7c46d;">Session active</span>` : `<button data-start-restock-session style="${btn(true)}">Start Restock Session</button>`}
        </div>
        ${session ? (() => {
            const q = session.queue[session.activeIndex];
            return q ? `<div style="border-top:1px solid #333;margin-top:7px;padding-top:7px;font-size:12px;"><b>${escapeHtml(q.itemName)}</b><br>
                Need ${q.need} · Buy ${q.buyPrice ? money(q.buyPrice) : '—'} · Max ${q.buyTarget ? money(q.buyTarget) : '—'} · Exit ${q.exit ? money(q.exit) : '—'} · ROI ${Number(q.roiPct||0).toFixed(1)}%
                <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;">${q.sellerId?`<button data-ops-action="seller" data-item="${q.itemId}" data-seller="${q.sellerId}" data-price="${Number(q.buyPrice||0)}" style="${btn()}">Verify Seller</button>`:''}<button data-restock-log-purchase style="${btn(true)}">Log Purchase</button><button data-restock-skip style="${btn()}">Skip</button></div>
            </div>` : '';
        })() : ''}
        ${restockRows.length ? restockRows.slice(0,12).map(r => `<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:7px 0;">
            <div style="font-size:11px;"><b>${escapeHtml(r.name)}</b> ${opsStateBadge(r.state)}<br>Need <b>${r.adaptiveShortage}</b> · Best buy ${r.bestBuyPrice?money(r.bestBuyPrice):'—'} · Max ${r.buyTarget?money(r.buyTarget):'—'} · Forecast ${r.forecastDaily.toFixed(2)}/day${compactItemDetails(r)}</div>
            <details><summary style="${btn()}list-style:none;">•••</summary><div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;"><button data-proc-action="market" data-item="${r.id}" style="${btn()}">Refresh Market</button><button data-proc-action="log-buy" data-item="${r.id}" data-name="${escapeHtml(r.name)}" style="${btn()}">Log Buy</button><button data-open-advanced="inventory" style="${btn()}">Full Inventory</button></div></details>
        </div>`).join('') : `<div style="font-size:11px;color:#888;margin-top:7px;">No restock action required.</div>`}`);

        const listing = card(`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;"><div><b style="font-size:15px;">List Bazaar</b><div style="font-size:11px;color:#999;margin-top:2px;">${trustedPlans.length} trusted recommendation(s) · ${priceReviewRows.length} price review(s)</div></div><button data-open-bazaar-add style="${btn(true)}">Open Bazaar Add</button></div>
            ${trustedPlans.slice(0,20).map(p=>`<div style="font-size:11px;border-top:1px solid #303030;padding:6px 0;"><b>${escapeHtml(p.itemName)}</b> · Add ${p.quantity} @ <b>${money(p.price)}</b> · Margin ${p.expectedMarginPct.toFixed(1)}%</div>`).join('') || `<div style="font-size:11px;color:#888;margin-top:7px;">No trusted listing recommendation currently available.</div>`}
            ${priceReviewRows.slice(0,15).map(r=>`<div style="font-size:10px;border-top:1px solid #303030;padding:5px 0;color:#ffd18a;"><b>${escapeHtml(r.name)}</b> · PRICE REVIEW · ${escapeHtml(r.pricingDecision?.source || 'No trusted market evidence')} · confidence ${Number(r.pricingDecision?.confidence||0).toFixed(0)}%</div>`).join('')}
            <div style="font-size:10px;color:#777;margin-top:6px;">Only TRUSTED price decisions enter the listing plan. Anything else stays in Price Review until stronger evidence is available.</div>`);

        return presetBar + quickRestock + listing + `<div style="display:flex;gap:5px;flex-wrap:wrap;"><button data-open-advanced="ops" style="${btn()}">Full Operations</button><button data-open-advanced="inventory" style="${btn()}">Inventory Detail</button><button data-open-advanced="procurement" style="${btn()}">Procurement Detail</button></div>`;
    }

    function dealsSimpleHtml(db) {
        const deals = globalOpportunityRows(db);
        const instant = instantArbitrageRows(db);
        const travel = travelOpportunityRows(db).filter(r => r.profit > 0).slice(0, 5);
        const actionable = deals.filter(r => r.listingVerified).slice(0, 25);
        const discovery = deals.filter(r => !r.listingVerified).slice(0, 25);
        const dollars = (db.marketIntel.dollarItems || [])
            .slice()
            .sort((a,b) => Number(b.totalValue || 0) - Number(a.totalValue || 0))
            .slice(0, 30);
        const freshness = freshnessInfo(db.marketIntel.marketplaceGeneratedAt, businessRules(db).maxListingAgeSec);

        const controls = card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<div><b style="font-size:15px;">Best Deals Now</b><div style="font-size:11px;color:#999;margin-top:2px;">' +
                    actionable.length + ' seller-verifiable deal(s) · ' + discovery.length + ' research lead(s) · feed ' + escapeHtml(freshness.label) +
                    (Number.isFinite(freshness.ageSeconds) ? ' · ' + Math.round(freshness.ageSeconds) + 's old' : '') +
                '</div></div>' +
                '<button data-smart-refresh style="' + btn(true) + '">Smart Refresh</button>' +
            '</div>'
        );

        const actionableHtml = card(
            '<div><b>Seller-Verifiable Deals</b><div style="font-size:10px;color:#888;margin-top:2px;">Only fresh seller-level opportunities appear here. Verify immediately before opening the Bazaar.</div></div>' +
            (actionable.length
                ? actionable.map((r,i) => {
                    const sellerAction = r.sellerId
                        ? '<button data-intel-action="verify-seller" data-item="' + escapeHtml(r.id) + '" data-seller="' + escapeHtml(r.sellerId) + '" data-price="' + Number(r.buyPrice||0) + '" style="' + btn() + '">Verify Seller</button>'
                        : '';
                    const verifiedText = ' · Seller listing observed ' + Math.round(Number(r.listingAgeSeconds || 0)) + 's ago';
                    return '<div style="display:flex;justify-content:space-between;gap:8px;border-top:' + (i ? '1px solid #303030' : '0') + ';padding:7px 0;">' +
                        '<div style="font-size:11px;min-width:0;"><b>#' + (i+1) + ' ' + escapeHtml(r.name) + '</b> · ROI <b>' + r.roiPct.toFixed(1) + '%</b> · Profit ' + money(r.profit) + ' · Confidence ' + r.confidence.toFixed(0) + '%<br>' +
                        'Buy ' + money(r.buyPrice) + ' → ' + money(r.bestExit) + ' via ' + escapeHtml(r.bestExitRoute) + verifiedText +
                        '<details style="margin-top:4px;"><summary style="cursor:pointer;color:#999;font-size:10px;">Details</summary><div style="font-size:10px;color:#aaa;margin-top:3px;">Score ' + r.score.toFixed(0) +
                        ' · Sellers ' + r.sellerCount + ' · Personal demand ' + Number(r.personalDemandDaily || 0).toFixed(2) + '/day' +
                        ' · Bazaar aggregate ' + (r.bazaarAverage ? money(r.bazaarAverage) : '—') +
                        ' · Torn market ' + (r.marketPrice ? money(r.marketPrice) : '—') + ' · History ' + r.history.samples + '</div></details></div>' +
                        '<div style="display:flex;gap:4px;align-items:flex-start;"><button data-intel-action="enrich" data-item="' + escapeHtml(r.id) + '" style="' + btn(true) + '">' + (r.enriched ? 'Refresh' : 'Analyze') + '</button>' +
                        '<details><summary style="' + btn() + 'list-style:none;">•••</summary><div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">' +
                        sellerAction + '<button data-open-advanced="intel" style="' + btn() + '">Full Market Intel</button></div></details></div>' +
                    '</div>';
                }).join('')
                : '<div style="font-size:11px;color:#888;margin-top:6px;">No seller-verifiable deals currently meet your CRM-wide rules.</div>') 
        );

        const discoveryHtml = card(
            '<details><summary style="cursor:pointer;font-weight:700;">Market Leads — Research Before Buying (' + discovery.length + ')</summary>' +
            '<div style="font-size:10px;color:#888;margin:5px 0 3px;">These pass ROI/profit screening using aggregate market evidence but do not currently have a fresh seller-level listing. They are discovery leads, not buy recommendations.</div>' +
            (discovery.length
                ? discovery.map((r,i) =>
                    '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:6px 0;">' +
                        '<div style="font-size:10px;min-width:0;"><b>#' + (i+1) + ' ' + escapeHtml(r.name) + '</b> · Indicative ROI ' + r.roiPct.toFixed(1) + '% · Profit ' + money(r.profit) +
                        '<br>Aggregate buy ' + money(r.buyPrice) + ' → ' + money(r.bestExit) + ' via ' + escapeHtml(r.bestExitRoute) +
                        ' · Sellers ' + r.sellerCount + ' · Confidence ' + r.confidence.toFixed(0) + '%</div>' +
                        '<button data-intel-action="enrich" data-item="' + escapeHtml(r.id) + '" style="' + btn(true) + '">Find Live Seller</button>' +
                    '</div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;margin-top:6px;">No aggregate research leads currently qualify.</div>') +
            '</details>'
        );

        const dollarHtml = card(
            '<div><b>$1 Bazaar Watch</b><div style="font-size:10px;color:#888;">Showing up to 30 latest scanner rows from Smart Refresh. Verify the seller in Torn before opening; $1 eligibility/availability can change immediately.</div></div>' +
            (dollars.length
                ? dollars.map(d =>
                    '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:5px 0;font-size:10px;">' +
                        '<div><b>' + escapeHtml(d.itemName) + '</b> × ' + Number(d.quantity || 0).toLocaleString() +
                        ' · Market ' + money(d.marketPrice || 0) + ' · Value ' + money(d.totalValue || 0) +
                        ' · ' + escapeHtml(freshnessAgeText(d.lastUpdated)) +
                        ' · ' + escapeHtml(d.source || 'TornW3B') + '<br>' +
                        escapeHtml(d.sellerName) + ' [' + escapeHtml(d.sellerId) + ']</div>' +
                        '<button data-intel-action="verify-seller" data-item="' + escapeHtml(d.itemId) + '" data-seller="' + escapeHtml(d.sellerId) + '" data-price="1" style="' + btn() + '">Verify & Open</button>' +
                    '</div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;margin-top:6px;">No $1 scanner rows loaded.</div>')
        );

        const travelHtml = card(
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><b>Best Travel Opportunities</b><button data-open-advanced="procurement" style="' + btn() + '">Travel Command</button></div>' +
            (travel.length
                ? travel.map(r =>
                    '<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>' + escapeHtml(r.country) + ' · ' + escapeHtml(r.itemName) + '</b> ' + travelRecommendationBadge(r.recommendation) + '<br>' +
                    'Live stock ' + Number(r.stock || 0).toLocaleString() + ' · Profit/item ' + money(r.profit) + ' · Risk-adjusted <b>' + money(r.riskAdjustedProfitPerHour) + '/hr</b></div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;margin-top:5px;">Travel Stock has not loaded yet.</div>')
        );

        const scanners = card(
            '<details><summary style="cursor:pointer;font-weight:700;">More Scanners</summary><div style="margin-top:7px;">' +
            '<div style="font-size:11px;"><b>Instant Trader Arbitrage:</b> ' + instant.length + ' verified positive spread(s)</div>' +
            instant.slice(0,8).map(r =>
                '<div style="font-size:10px;border-top:1px solid #303030;padding:4px 0;">' + escapeHtml(r.name) +
                ' · Buy ' + money(r.buyPrice) + ' → Trader ' + money(r.traderExit) + ' · ROI ' + r.instantRoiPct.toFixed(1) + '%</div>'
            ).join('') +
            '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;"><button data-intel-ranked style="' + btn() + '">Ranked/Auction</button><button data-open-advanced="intel" style="' + btn() + '">Supplier Baskets + Full Scanners</button></div>' +
            '</div></details>'
        );

        return controls + businessRulesCard(db, true) + actionableHtml + discoveryHtml + dollarHtml + travelHtml + scanners;
    }

    function csvCell(value) {
        if (value == null) return '';
        let text = typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : String(value);
        if (typeof value !== 'number' && /^[=+\-@]/.test(text)) text = "'" + text;
        if (/[",\n\r]/.test(text)) text = '"' + text.replaceAll('"', '""') + '"';
        return text;
    }

    function toCsv(headers, rows) {
        const head = headers.map(csvCell).join(',');
        const body = (rows || []).map(row =>
            headers.map(header => csvCell(row?.[header])).join(',')
        ).join('\r\n');
        return '\uFEFF' + head + (body ? '\r\n' + body : '');
    }

    function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8') {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function exportDateStamp() {
        return new Date().toISOString().replaceAll(':','-').replace('T','_').slice(0,19);
    }

    function financialExportDocuments(db) {
        const inventoryRows = advancedInventoryRows(db);
        const brief = ownerBriefing(db, inventoryRows);
        const grossRevenue = inventoryRows.reduce((sum,r)=>sum+Number(r.realized?.revenue||0),0);
        const grossCogs = inventoryRows.reduce((sum,r)=>sum+Number(r.realized?.cogs||0),0);
        const inventoryCost = inventoryRows.reduce((sum,r)=>sum+Number(r.realized?.ledger?.remainingCost||0),0);
        const completedRefunds = Object.values(db.refunds || {}).filter(r => ['completed','paid'].includes(String(r.status || '').toLowerCase()));
        const cashbackPaid = completedRefunds.reduce((sum,r)=>sum+Number(r.amount||0),0);
        const rules = businessRules(db);

        const summaryRows = [
            { Metric:'Report generated', Value:nowIso() },
            { Metric:'30d revenue', Value:grossRevenue },
            { Metric:'30d COGS', Value:grossCogs },
            { Metric:'Tracked gross profit (matched FIFO only)', Value:brief.profitCoverage === 'UNAVAILABLE' ? '' : brief.grossProfit },
            { Metric:'Profit coverage status', Value:brief.profitCoverage },
            { Metric:'Cost-basis coverage %', Value:brief.costCoveragePct },
            { Metric:'Matched sold units', Value:brief.matchedUnits },
            { Metric:'Unmatched sold units', Value:brief.unmatchedUnits },
            { Metric:'Tracked gross margin %', Value:grossRevenue > 0 ? brief.grossProfit / grossRevenue * 100 : 0 },
            { Metric:'Inventory cost basis', Value:inventoryCost },
            { Metric:'Dead capital', Value:brief.deadCapital },
            { Metric:'Estimated lost profit', Value:brief.lostProfit },
            { Metric:'Stockouts', Value:brief.stockouts },
            { Metric:'Units sold 30d', Value:brief.units },
            { Metric:'Cashback/refunds paid', Value:cashbackPaid },
            { Metric:'CRM min ROI %', Value:rules.minRoiPct },
            { Metric:'CRM min demand/day', Value:rules.minDemandPerDay },
            { Metric:'CRM min buy price', Value:rules.minPrice },
            { Metric:'CRM max buy price', Value:rules.maxPrice }
        ];

        const salesRows = [];
        for (const sale of Object.values(db.sales || {})) {
            const items = Array.isArray(sale.items) ? sale.items : [];
            for (const item of items) {
                salesRows.push({
                    'Sale ID': String(sale.id || ''),
                    'Date': sale.timestamp ? new Date(Number(sale.timestamp)).toISOString() : '',
                    'Customer ID': asId(sale.playerId),
                    'Customer': String(sale.playerName || ''),
                    'Item ID': asId(item.id),
                    'Item': String(item.name || item.itemName || ''),
                    'Quantity': Number(item.quantity || 0),
                    'Unit Price': Number(item.price || 0),
                    'Line Total': Number(item.total || 0),
                    'Sale Total': Number(sale.total || sale.totalValue || 0)
                });
            }
        }
        salesRows.sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));

        const acquisitionRows = (db.procurement?.acquisitions || []).map(a => ({
            'Acquisition ID': String(a.id || ''),
            'Date': String(a.acquiredAt || ''),
            'Source': String(a.source || ''),
            'Seller ID': asId(a.sellerId || ''),
            'Seller': String(a.sellerName || ''),
            'Item ID': asId(a.itemId),
            'Item': String(a.itemName || ''),
            'Quantity': Number(a.quantity || 0),
            'Unit Cost': Number(a.unitCost || 0),
            'Total Cost': Number(a.quantity || 0) * Number(a.unitCost || 0),
            'Notes': String(a.notes || '')
        }));

        const inventoryProfitRows = inventoryRows.map(r => ({
            'Item ID': r.id,
            'Item': r.name,
            'Type': r.type,
            'State': r.state,
            'On Hand': Number(r.onHand || 0),
            'Bazaar Listed': Number(r.bazaarQty || 0),
            'Item Market Listed': Number(r.itemMarketQty || 0),
            'Total Stock': Number(r.stock || 0),
            'Sold 7d': Number(r.sold7d || 0),
            'Sold 30d': Number(r.sold30d || 0),
            'Demand / Day': Number(r.daily || 0),
            'Forecast / Day': Number(r.forecastDaily || 0),
            'Average Cost': Number(r.avgCost || 0),
            'Trusted Exit': Number(r.realisticExit || 0),
            'Planned Listing Price': Number(r.plannedPrice || 0),
            'Pricing Confidence %': Number(r.pricingDecision?.confidence || 0),
            'Pricing Basis': String(r.pricingDecision?.source || ''),
            '30d Revenue': Number(r.realized?.revenue || 0),
            '30d COGS': Number(r.realized?.cogs || 0),
            '30d Gross Profit': Number(r.realized?.grossProfit || 0),
            'Cost Coverage %': Number(r.realized?.costCoveragePct || 0),
            'Unmatched Sold Units': Number(r.realized?.unmatchedUnits || 0),
            'Realized ROI %': Number(r.realized?.cogs || 0) > 0 ? Number(r.realized.grossProfit || 0) / Number(r.realized.cogs) * 100 : 0,
            'GMROI %': Number(r.realized?.gmroi || 0) * 100,
            'Dead Capital': Number(r.deadCapital || 0),
            'Market Snapshot Fresh': Boolean(r.marketSnapshotFresh)
        }));

        const refundRows = Object.values(db.refunds || {}).map(r => ({
            'Refund ID': String(r.id || ''),
            'Created': String(r.createdAt || ''),
            'Completed': String(r.completedAt || ''),
            'Cancelled': String(r.cancelledAt || ''),
            'Status': String(r.status || ''),
            'Customer ID': asId(r.playerId),
            'Customer': String(r.playerName || ''),
            'Coupon': String(r.couponCode || ''),
            'Amount': Number(r.amount || 0),
            'Purchase Total': Number(r.purchaseTotal || 0),
            'Sale IDs': Array.isArray(r.saleIds) ? r.saleIds.join('|') : ''
        }));

        const customerRows = customerClvRows(db).map(c => ({
            'Customer ID': asId(c.id),
            'Customer': String(c.name || ''),
            'Segment': String(c.segment || ''),
            'Recency Days': Number(c.recencyDays || 0),
            'Purchases': Number(c.frequency || 0),
            'Units': Number(c.units || 0),
            'Spend': Number(c.monetary || 0),
            'Estimated Gross Profit': Number(c.estimatedGrossProfit || 0),
            'Cashback Cost': Number(c.cashbackCost || 0),
            'Estimated Net Value': Number(c.estimatedNetValue || 0),
            'Top Products': (c.topProducts || []).map(x => String(x[0]) + '×' + Number(x[1] || 0)).join(' | ')
        }));

        const procurementRowsExport = procurementRows(db).map(r => ({
            'Item ID': r.id,
            'Item': r.name,
            'Action': r.action,
            'Priority': r.priority,
            'Acquisition Score': Number(r.acquisitionScore || 0),
            'Demand Basis': r.personalDemandQualified ? 'Personal sales' : 'Market bootstrap',
            'Personal Demand Mature': Boolean(r.personalDemandQualified),
            'Personal Realized ROI %': Number(r.ownRealizedRoiPct || 0),
            'Personal Cost Coverage %': Number(r.personalCostCoveragePct || 0),
            'Personal Matched Units': Number(r.personalMatchedUnits || 0),
            'Personal Authority %': Number(r.personalWeight || 0) * 100,
            'Market Demand Score': Number(r.marketDemandScore || 0),
            'Market Sellers': Number(r.marketSellerCount || 0),
            'Market Movement Score': Number(r.marketMovementScore || 0),
            'Observed Near-Market Depletion / Hr': Number(r.marketDepletionPerHour || 0),
            'Demand / Day': Number(r.daily || 0),
            'Sold 7d': Number(r.sold7d || 0),
            'Sold 30d': Number(r.sold30d || 0),
            'Stock': Number(r.stock || 0),
            'Shortage': Number(r.shortage || 0),
            'Best Buy Price': Number(r.bestBuyPrice || 0),
            'Trusted Exit': Number(r.realisticExit || 0),
            'Profit / Unit': Number(r.bestDealProfit || 0),
            'ROI %': Number(r.bestDealMarginPct || 0),
            'Liquidity': Number(r.liquidityScore || 0),
            'Market Fresh': Boolean(r.marketSnapshotFresh)
        }));

        return {
            summary: {
                filename: 'financial-summary.csv',
                headers: ['Metric','Value'],
                rows: summaryRows
            },
            sales: {
                filename: 'sales-ledger.csv',
                headers: ['Sale ID','Date','Customer ID','Customer','Item ID','Item','Quantity','Unit Price','Line Total','Sale Total'],
                rows: salesRows
            },
            acquisitions: {
                filename: 'acquisitions-cost-basis.csv',
                headers: ['Acquisition ID','Date','Source','Seller ID','Seller','Item ID','Item','Quantity','Unit Cost','Total Cost','Notes'],
                rows: acquisitionRows
            },
            inventory: {
                filename: 'inventory-profitability.csv',
                headers: ['Item ID','Item','Type','State','On Hand','Bazaar Listed','Item Market Listed','Total Stock','Sold 7d','Sold 30d','Demand / Day','Forecast / Day','Average Cost','Trusted Exit','Planned Listing Price','Pricing Confidence %','Pricing Basis','30d Revenue','30d COGS','30d Gross Profit','Cost Coverage %','Unmatched Sold Units','Realized ROI %','GMROI %','Dead Capital','Market Snapshot Fresh'],
                rows: inventoryProfitRows
            },
            refunds: {
                filename: 'refunds-cashback.csv',
                headers: ['Refund ID','Created','Completed','Cancelled','Status','Customer ID','Customer','Coupon','Amount','Purchase Total','Sale IDs'],
                rows: refundRows
            },
            customers: {
                filename: 'customer-value.csv',
                headers: ['Customer ID','Customer','Segment','Recency Days','Purchases','Units','Spend','Estimated Gross Profit','Cashback Cost','Estimated Net Value','Top Products'],
                rows: customerRows
            },
            procurement: {
                filename: 'procurement-opportunities.csv',
                headers: ['Item ID','Item','Action','Priority','Acquisition Score','Demand Basis','Personal Demand Mature','Personal Realized ROI %','Personal Cost Coverage %','Personal Matched Units','Personal Authority %','Market Demand Score','Market Sellers','Market Movement Score','Observed Near-Market Depletion / Hr','Demand / Day','Sold 7d','Sold 30d','Stock','Shortage','Best Buy Price','Trusted Exit','Profit / Unit','ROI %','Liquidity','Market Fresh'],
                rows: procurementRowsExport
            }
        };
    }

    function xlsxXmlEscape(value) {
        return String(value == null ? '' : value)
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;')
            .replaceAll("'","&apos;");
    }

    function xlsxColumnName(index) {
        let n = Math.max(1, Number(index || 1));
        let out = '';
        while (n > 0) {
            n--;
            out = String.fromCharCode(65 + (n % 26)) + out;
            n = Math.floor(n / 26);
        }
        return out;
    }

    function xlsxStyleForHeader(header) {
        const key = String(header || '').toLowerCase();
        if (/(roi|margin|coverage|confidence|volatility|rate|%)/.test(key)) return 3;
        if (/(price|cost|revenue|profit|spend|amount|value|capital|cogs|cashback|refund|total)/.test(key)) return 2;
        return 0;
    }

    function xlsxCellXml(value, row, col, style = 0) {
        const ref = xlsxColumnName(col) + row;
        const styleAttr = style ? ' s="' + style + '"' : '';
        if (typeof value === 'number' && Number.isFinite(value)) {
            return '<c r="' + ref + '"' + styleAttr + ' t="n"><v>' + value + '</v></c>';
        }
        if (typeof value === 'boolean') {
            return '<c r="' + ref + '"' + styleAttr + ' t="b"><v>' + (value ? 1 : 0) + '</v></c>';
        }
        const text = xlsxXmlEscape(value);
        return '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + text + '</t></is></c>';
    }

    function xlsxWorksheetXml(headers, rows) {
        const allRows = [headers, ...(rows || []).map(row => headers.map(h => row?.[h]))];
        const widths = headers.map((header, col) => {
            let width = String(header || '').length + 2;
            for (let i = 1; i < Math.min(allRows.length, 201); i++) {
                width = Math.max(width, String(allRows[i]?.[col] ?? '').length + 1);
            }
            return Math.max(10, Math.min(38, width));
        });
        const cols = widths.map((width, i) =>
            '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + width + '" customWidth="1"/>'
        ).join('');
        const sheetRows = allRows.map((values, rowIndex) => {
            const rowNumber = rowIndex + 1;
            const cells = values.map((value, colIndex) => {
                const style = rowIndex === 0 ? 1 : xlsxStyleForHeader(headers[colIndex]);
                return xlsxCellXml(value, rowNumber, colIndex + 1, style);
            }).join('');
            return '<row r="' + rowNumber + '">' + cells + '</row>';
        }).join('');
        const endCell = xlsxColumnName(Math.max(1, headers.length)) + Math.max(1, allRows.length);
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                '<dimension ref="A1:' + endCell + '"/>' +
                '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
                '<cols>' + cols + '</cols>' +
                '<sheetData>' + sheetRows + '</sheetData>' +
                (headers.length && allRows.length > 1 ? '<autoFilter ref="A1:' + endCell + '"/>' : '') +
            '</worksheet>';
    }

    function utf8Bytes(value) {
        const text = String(value ?? '');
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
        const out = [];
        for (let i = 0; i < text.length; i++) {
            let cp = text.codePointAt(i);
            if (cp > 0xFFFF) i++;
            if (cp <= 0x7F) out.push(cp);
            else if (cp <= 0x7FF) {
                out.push(
                    0xC0 | (cp >> 6),
                    0x80 | (cp & 0x3F)
                );
            } else if (cp <= 0xFFFF) {
                out.push(
                    0xE0 | (cp >> 12),
                    0x80 | ((cp >> 6) & 0x3F),
                    0x80 | (cp & 0x3F)
                );
            } else {
                out.push(
                    0xF0 | (cp >> 18),
                    0x80 | ((cp >> 12) & 0x3F),
                    0x80 | ((cp >> 6) & 0x3F),
                    0x80 | (cp & 0x3F)
                );
            }
        }
        return Uint8Array.from(out);
    }


    function crc32Bytes(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc ^= bytes[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function concatUint8(parts) {
        const total = parts.reduce((sum, part) => sum + part.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }

    function zipStoreEntries(entries) {
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        const write16 = (view, at, value) => view.setUint16(at, value, true);
        const write32 = (view, at, value) => view.setUint32(at, value >>> 0, true);
        const now = new Date();
        const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
        const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

        for (const entry of entries) {
            const nameBytes = utf8Bytes(entry.name);
            const dataBytes = entry.bytes instanceof Uint8Array ? entry.bytes : utf8Bytes(String(entry.content || ''));
            const crc = crc32Bytes(dataBytes);

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            write32(lv, 0, 0x04034b50);
            write16(lv, 4, 20);
            write16(lv, 6, 0);
            write16(lv, 8, 0);
            write16(lv, 10, dosTime);
            write16(lv, 12, dosDate);
            write32(lv, 14, crc);
            write32(lv, 18, dataBytes.length);
            write32(lv, 22, dataBytes.length);
            write16(lv, 26, nameBytes.length);
            write16(lv, 28, 0);
            local.set(nameBytes, 30);
            localParts.push(local, dataBytes);

            const central = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(central.buffer);
            write32(cv, 0, 0x02014b50);
            write16(cv, 4, 20);
            write16(cv, 6, 20);
            write16(cv, 8, 0);
            write16(cv, 10, 0);
            write16(cv, 12, dosTime);
            write16(cv, 14, dosDate);
            write32(cv, 16, crc);
            write32(cv, 20, dataBytes.length);
            write32(cv, 24, dataBytes.length);
            write16(cv, 28, nameBytes.length);
            write16(cv, 30, 0);
            write16(cv, 32, 0);
            write16(cv, 34, 0);
            write16(cv, 36, 0);
            write32(cv, 38, 0);
            write32(cv, 42, offset);
            central.set(nameBytes, 46);
            centralParts.push(central);

            offset += local.length + dataBytes.length;
        }

        const central = concatUint8(centralParts);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        write32(ev, 0, 0x06054b50);
        write16(ev, 4, 0);
        write16(ev, 6, 0);
        write16(ev, 8, entries.length);
        write16(ev, 10, entries.length);
        write32(ev, 12, central.length);
        write32(ev, 16, offset);
        write16(ev, 20, 0);

        return concatUint8([...localParts, central, end]);
    }

    function buildFinancialXlsx(db) {
        const docs = financialExportDocuments(db);
        const sheetDefs = [
            ['Summary', docs.summary],
            ['Sales', docs.sales],
            ['Acquisitions', docs.acquisitions],
            ['Inventory Profit', docs.inventory],
            ['Refunds', docs.refunds],
            ['Customer Value', docs.customers],
            ['Procurement', docs.procurement]
        ].filter(([,doc]) => doc);

        const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
            sheetDefs.map((_,i) => '<Override PartName="/xl/worksheets/sheet' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
            '</Types>';

        const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
            '</Relationships>';

        const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<bookViews><workbookView/></bookViews><sheets>' +
            sheetDefs.map(([name],i) => '<sheet name="' + xlsxXmlEscape(name.slice(0,31)) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>').join('') +
            '</sheets></workbook>';

        const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            sheetDefs.map((_,i) => '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i+1) + '.xml"/>').join('') +
            '<Relationship Id="rId' + (sheetDefs.length+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
            '</Relationships>';

        const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<numFmts count="2"><numFmt numFmtId="164" formatCode="$#,##0.00"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>' +
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
            '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>' +
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="4">' +
                '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
                '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
                '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
                '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
            '</cellXfs>' +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
            '</styleSheet>';

        const entries = [
            { name:'[Content_Types].xml', content:contentTypes },
            { name:'_rels/.rels', content:rootRels },
            { name:'xl/workbook.xml', content:workbook },
            { name:'xl/_rels/workbook.xml.rels', content:workbookRels },
            { name:'xl/styles.xml', content:styles }
        ];
        sheetDefs.forEach(([name,doc],i) => {
            entries.push({
                name:'xl/worksheets/sheet' + (i+1) + '.xml',
                content:xlsxWorksheetXml(doc.headers, doc.rows)
            });
        });
        return zipStoreEntries(entries);
    }

    function exportFinancialWorkbook() {
        const bytes = buildFinancialXlsx(dbLoad());
        const blob = new Blob([bytes], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MM_Torn_CRM_' + exportDateStamp() + '_Financial_Workbook.xlsx';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }


    function exportFinancialDocument(kind) {
        const docs = financialExportDocuments(dbLoad());
        const doc = docs[kind];
        if (!doc) throw new Error('Unknown financial export: ' + kind);
        const stamp = exportDateStamp();
        downloadTextFile('MM_Torn_CRM_' + stamp + '_' + doc.filename, toCsv(doc.headers, doc.rows));
    }

    function exportFinancialPack() {
        const docs = financialExportDocuments(dbLoad());
        const stamp = exportDateStamp();
        for (const doc of Object.values(docs)) {
            downloadTextFile('MM_Torn_CRM_' + stamp + '_' + doc.filename, toCsv(doc.headers, doc.rows));
        }
    }

    function financialExportCard() {
        return card(
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<div><b>Financial Spreadsheet Export</b><div style="font-size:10px;color:#888;margin-top:3px;">One Excel workbook with separate financial sheets, plus optional CSV exports. Export is read-only and does not modify CRM data.</div></div>' +
                '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button data-financial-export="xlsx" style="' + btn(true) + '">Export Excel Workbook</button><button data-financial-export="all" style="' + btn() + '">Export CSV Pack</button></div>' +
            '</div>' +
            '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;">' +
                '<button data-financial-export="summary" style="' + btn() + '">Summary</button>' +
                '<button data-financial-export="sales" style="' + btn() + '">Sales</button>' +
                '<button data-financial-export="acquisitions" style="' + btn() + '">Acquisitions</button>' +
                '<button data-financial-export="inventory" style="' + btn() + '">Inventory / Profit</button>' +
                '<button data-financial-export="refunds" style="' + btn() + '">Refunds</button>' +
                '<button data-financial-export="customers" style="' + btn() + '">Customer Value</button>' +
                '<button data-financial-export="procurement" style="' + btn() + '">Procurement</button>' +
            '</div>'
        );
    }

    function reportsSimpleHtml(db) {
        const rows = advancedInventoryRows(db);
        const brief = ownerBriefing(db, rows);
        const grossCogs = rows.reduce((sum, r) => sum + Number(r.realized?.cogs || 0), 0);
        const grossRevenue = rows.reduce((sum, r) => sum + Number(r.realized?.revenue || 0), 0);
        const inventoryCost = rows.reduce((sum, r) => sum + Number(r.realized?.ledger?.remainingCost || 0), 0);
        const refunds = Object.values(db.refunds || {}).reduce((sum, r) => sum + Number(r.amount || 0), 0);

        const demand = rows.slice()
            .filter(r => Number(r.sold30d || 0) > 0)
            .sort((a,b) => Number(b.daily || 0) - Number(a.daily || 0))
            .slice(0, 12);

        const roi = rows.slice()
            .filter(r => Number(r.realized?.cogs || 0) > 0)
            .map(r => ({ ...r, realizedRoiPct: Number(r.realized.grossProfit || 0) / Math.max(1, Number(r.realized.cogs || 0)) * 100 }))
            .sort((a,b) => b.realizedRoiPct - a.realizedRoiPct)
            .slice(0, 12);

        const summary =
            '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;">' +
                simpleMetric('30d Revenue', money(grossRevenue)) +
                simpleMetric('Tracked COGS', money(grossCogs)) +
                simpleMetric('Tracked Gross Profit', money(brief.grossProfit)) +
                simpleMetric('COGS Coverage', brief.costCoveragePct.toFixed(0) + '%') +
            '</div>';

        const demandHtml = card(
            '<b>Highest Personal Demand</b>' +
            '<div style="font-size:10px;color:#888;margin:3px 0 5px;">Ranked from your own Bazaar sales. These observations increasingly drive procurement as your sample grows.</div>' +
            (demand.length
                ? demand.map((r,i) =>
                    '<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>#' + (i+1) + ' ' + escapeHtml(r.name) + '</b> · ' +
                    Number(r.daily || 0).toFixed(2) + '/day · 7d ' + Number(r.sold7d || 0) + ' · 30d ' + Number(r.sold30d || 0) +
                    ' · Gross ' + money(r.realized?.grossProfit || 0) + '</div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;">More sales history is needed.</div>')
        );

        const roiHtml = card(
            '<b>Highest Realized ROI</b>' +
            '<div style="font-size:10px;color:#888;margin:3px 0 5px;">Uses matched FIFO purchase cost against your realized 30-day Bazaar sales.</div>' +
            (roi.length
                ? roi.map((r,i) =>
                    '<div style="font-size:11px;border-top:1px solid #303030;padding:5px 0;"><b>#' + (i+1) + ' ' + escapeHtml(r.name) + '</b> · ROI <b>' +
                    r.realizedRoiPct.toFixed(1) + '%</b> · Revenue ' + money(r.realized?.revenue || 0) +
                    ' · Gross ' + money(r.realized?.grossProfit || 0) + '</div>'
                ).join('')
                : '<div style="font-size:11px;color:#888;">Matched purchase-cost history is needed.</div>')
        );

        const health = card(
            '<b>Financial Health</b>' +
            '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:6px;">' +
                simpleMetric('Dead Capital', money(brief.deadCapital)) +
                simpleMetric('Lost Profit Est.', money(brief.lostProfit)) +
                simpleMetric('Refunds/Cashback', money(refunds)) +
                simpleMetric('Stockouts', String(brief.stockouts)) +
            '</div>' +
            '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;"><button data-open-advanced="analytics" style="' + btn() + '">Deep Analytics</button><button data-open-advanced="settings" style="' + btn(true) + '">Settings & Diagnostics</button></div>'
        );

        return summary + businessRulesCard(db, false) + financialExportCard() + demandHtml + roiHtml + health;
    }

    function customersSimpleHtml(db) {
        const rfm = customerRfmRows(db);
        // Keep the simple Customers tab fast: rank by tracked spend here instead of
        // recomputing full inventory gross-margin/CLV analytics on every tab click.
        const topBySpend = rfm.slice().sort((a,b)=>b.monetary-a.monetary);
        const counts = {};
        for (const c of rfm) counts[c.segment] = (counts[c.segment] || 0) + 1;
        const pending = Object.values(db.subscribers || {}).filter(s => s.pendingNotification);
        const eligible = Object.values(db.coupons || {}).filter(c => couponQualification(db,c).qualified);
        const top = topBySpend.slice(0,10);
        const summary = `<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;">${['VIP','LOYAL','REGULAR','NEW','AT RISK','DORMANT'].map(s=>simpleMetric(s,String(counts[s]||0))).join('')}</div>`;
        const actions = card(`<b>Customer Actions</b><div style="font-size:10px;color:#888;margin:3px 0 7px;">Customer data refreshes through Smart Refresh when this tab opens.</div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button data-open-advanced="customers" style="${btn()}">View Customers</button><button data-open-advanced="subscribers" style="${btn()}">Restock Alerts ${pending.length?`(${pending.length})`:''}</button><button data-open-advanced="coupons" style="${btn()}">Coupons ${eligible.length?`(${eligible.length} eligible)`:''}</button><button data-open-advanced="refunds" style="${btn()}">Refunds</button></div>`);
        const values = card(`<b>Top Customer Value</b>${top.map(c=>`<div style="font-size:11px;border-top:1px solid #303030;padding:6px 0;"><b>${escapeHtml(c.name)} [${escapeHtml(c.id)}]</b> · ${escapeHtml(c.segment)} · Spend ${money(c.monetary)}<details style="margin-top:3px;"><summary style="cursor:pointer;color:#999;font-size:10px;">Details</summary><div style="font-size:10px;color:#aaa;margin-top:3px;">Recency ${c.recencyDays.toFixed(1)}d · Purchases ${c.frequency} · Affinity ${c.topProducts.map(x=>`${escapeHtml(x[0])}×${x[1]}`).join(', ')||'—'}</div></details></div>`).join('')||'<div style="font-size:11px;color:#888;">No customer history yet.</div>'}`);
        return summary + actions + values;
    }

    function moreSimpleHtml(db) {
        const brief = ownerBriefing(db);
        const preset = String(db.operations.settings.strategyPreset || 'BALANCED').replaceAll('_',' ');
        return card(`<b>Tools & Settings</b><div style="font-size:11px;color:#999;margin:4px 0 8px;">Advanced reports and configuration remain fully available. Current strategy: <b>${escapeHtml(preset)}</b>.</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;"><button data-simple-go="reports" style="${btn()}">Reports & Business Rules</button><button data-open-advanced="faction" style="${btn()}">Faction Inventory</button><button data-open-advanced="analytics" style="${btn()}">Analytics & Reports</button><button data-open-advanced="sales" style="${btn()}">Sales Ledger</button><button data-open-advanced="inventory" style="${btn()}">Full Inventory</button><button data-open-advanced="procurement" style="${btn()}">Full Procurement</button><button data-open-advanced="intel" style="${btn()}">Full Market Intel</button><button data-open-advanced="subscribers" style="${btn()}">Restock Subscribers</button><button data-open-advanced="coupons" style="${btn()}">Coupons</button><button data-open-advanced="refunds" style="${btn()}">Refunds</button><button data-open-advanced="ops" style="${btn()}">Operations Detail</button><button data-open-advanced="settings" style="${btn(true)}">Settings & Diagnostics</button></div><div style="border-top:1px solid #333;margin-top:9px;padding-top:7px;font-size:11px;color:#aaa;">Revenue ${money(brief.revenue)} · Gross profit ${money(brief.grossProfit)} · Dead capital ${money(brief.deadCapital)} · Lost profit ${money(brief.lostProfit)}</div>`);
    }


    function compareVersions(a,b) {
        const pa=String(a||'0').split('.').map(x=>Number(x)||0);
        const pb=String(b||'0').split('.').map(x=>Number(x)||0);
        const n=Math.max(pa.length,pb.length);
        for(let i=0;i<n;i++){
            const av=pa[i]||0,bv=pb[i]||0;
            if(av>bv)return 1;
            if(av<bv)return -1;
        }
        return 0;
    }

    function crmUpdateStatus() {
        const value=GM_getValue(CRM_UPDATE_STATUS_KEY,null);
        return value&&typeof value==='object'?value:{};
    }

    function setCrmUpdateStatus(patch) {
        const next={...crmUpdateStatus(),...patch,updatedAt:Date.now()};
        GM_setValue(CRM_UPDATE_STATUS_KEY,next);
        return next;
    }

    function fetchLatestCrmSource() {
        return new Promise((resolve,reject)=>{
            GM_xmlhttpRequest({
                method:'GET',
                url:CRM_UPDATE_URL+'?t='+Date.now(),
                timeout:15000,
                headers:{Accept:'text/plain'},
                onload:r=>{
                    if(r.status<200||r.status>=300)return reject(new Error('CRM update HTTP '+r.status));
                    resolve(String(r.responseText||''));
                },
                ontimeout:()=>reject(new Error('CRM update check timed out.')),
                onerror:()=>reject(new Error('CRM update network error.'))
            });
        });
    }

    function sourceVersion(source) {
        const match=String(source||'').match(/^\s*\/\/\s*@version\s+([^\s]+)/m);
        return match?String(match[1]).trim():'';
    }

    async function checkCrmUpdate({silent=false}={}) {
        try{
            const source=await fetchLatestCrmSource();
            const latest=sourceVersion(source);
            if(!latest)throw new Error('Could not read the published CRM version.');
            const available=compareVersions(latest,VERSION)>0;
            setCrmUpdateStatus({checkedAt:Date.now(),latestVersion:latest,available,error:''});
            if(!silent){
                statusText=available?'CRM update available: v'+latest+'.':'CRM is current at v'+VERSION+'.';
                render();
            }
            return {latestVersion:latest,available};
        }catch(error){
            setCrmUpdateStatus({checkedAt:Date.now(),error:error?.message||String(error)});
            if(!silent){statusText='CRM update check failed: '+(error?.message||String(error));render();}
            throw error;
        }
    }

    function openCrmUpdateInstaller() {
        setCrmUpdateStatus({lastActionAt:Date.now(),lastAction:'open-installer'});
        statusText='Opening the CRM update installer in this tab...';
        try{render();}catch{}
        navigateFromCRM(CRM_UPDATE_URL+'?t='+Date.now());
    }

    function updateCenterHtml() {
        const us=crmUpdateStatus();
        const available=Boolean(us.latestVersion&&compareVersions(us.latestVersion,VERSION)>0);
        return '<div style="margin-top:10px;border-top:1px solid #333;padding-top:8px;">'+
            '<b>CRM Update Center</b>'+
            '<div style="font-size:11px;color:#aaa;margin:4px 0 7px;">Installed: <b>v'+escapeHtml(VERSION)+'</b>'+
            (us.latestVersion?' · Published: <b>v'+escapeHtml(us.latestVersion)+'</b>':'')+
            (available?' · <span style="color:#9fe3a8;font-weight:bold;">UPDATE AVAILABLE</span>':'')+
            '</div>'+
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
                '<button id="mm-update-check" style="'+btn()+'">Check for Updates</button>'+
                '<button id="mm-update-open" style="'+btn(available)+'">Update CRM</button>'+
            '</div>'+
            '<div style="font-size:10px;color:#888;margin-top:6px;">Safe mode: CRM remains a normal Tampermonkey userscript. Update is initiated from CRM and opens the installer in the same tab. Existing IndexedDB and GM storage are preserved.'+
            (us.error?'<br><span style="color:#ff9b9b;">Last error: '+escapeHtml(us.error)+'</span>':'')+
            '</div>'+
        '</div>';
    }

    function settingsHtml() {
        const hasKey = Boolean(getApiKey());
        const hasFactionKey = Boolean(getFactionApiKey());
        const db = dbLoad();
        const audit = db.meta?.lastSalesAudit;
        const auditText = audit
            ? `${audit.ok ? 'PASS' : 'FAIL'} · ${Number(audit.sales || 0).toLocaleString()} sales · ${Number(audit.customersWithSales || 0).toLocaleString()} customers · ${escapeHtml(fmtDate(audit.at))}`
            : 'Not run yet';

        return card(`
            <b>Torn API</b>
            <div style="font-size:12px;color:${hasKey ? '#9fe3a8' : '#ff9b9b'};margin:4px 0 8px;font-weight:700;">${hasKey ? 'API STATUS: CONNECTED' : 'API STATUS: NOT CONFIGURED — sales and customer sync are stopped'}</div>
            <div style="font-size:12px;color:#bbb;margin:4px 0 8px;">
                The CRM uses Torn directly for <b>User → Basic</b>, <b>User → Log</b> (Bazaar Sell 1226, Bazaar Buy 1225, Item Market Buy 1112),
                your own <b>User → Bazaar</b> and <b>User → Item Market</b>, <b>Torn → Items</b>, and <b>Market → Item Market</b>.
                Seller verification uses Torn API v1 <b>User → Bazaar</b> immediately before navigation and blocks API snapshots older than 120 seconds. Torn globally caches Bazaar data, so this is a recency check rather than a guaranteed real-time read.
                <b>User → Inventory</b> remains optional but improves personal stock counts. Optional <b>Faction → Inventory</b> remains isolated from the normal business workflow.
            </div>
            <div style="display:flex;gap:6px;">
                <input id="mm-api-key" type="password" autocomplete="off"
                    placeholder="${hasKey ? 'API key saved — enter a new key to replace it' : 'Paste Torn API key'}"
                    style="${inputCss()}flex:1">
                <button id="mm-save-api" style="${btn(true)}">Save</button>
                <button id="mm-clear-api" style="${btn()}">Clear</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                <button data-smart-refresh style="${btn(true)}">Smart Refresh Business Data</button>
            </div>
            <div style="margin-top:8px;padding:7px;border:1px solid #333;border-radius:6px;background:#151515;">
                <label style="font-size:11px;"><input id="mm-background-refresh" type="checkbox" ${db.syncState.backgroundRefreshEnabled ? 'checked' : ''}> Enable low-frequency background refresh while one visible CRM tab is open</label>
                <div style="font-size:10px;color:#888;margin-top:4px;">Off by default. Normal operation is manual Smart Refresh. Background mode uses one coordinator tab and never runs from hidden/minimized CRM tabs.</div>
            </div>
            <details style="margin-top:7px;">
                <summary style="cursor:pointer;font-size:11px;color:#aaa;">Maintenance & targeted syncs</summary>
                <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                    <button id="mm-sync-now" style="${btn()}">Sync Sales Only</button>
                    <button data-proc-sync style="${btn()}">Sync Procurement Only</button>
                    <button id="mm-rebuild-sales" style="${btn()}">Rebuild Sales History</button>
                    <button data-rebuild-acquisitions style="${btn()}">Rebuild Cost Basis</button>
                    <button id="mm-repair-names" style="${btn()}">Repair Usernames</button>
                    <button id="mm-repair-sales-integrity" style="${btn()}">Repair Sales Integrity</button>
                </div>
            </details>
            <div style="font-size:12px;color:#aaa;margin-top:8px;">
                Sales integrity: ${auditText}<br>
                Last full sales rebuild: ${escapeHtml(fmtDate(db.meta?.salesRebuiltAt))}<br>
                Last acquisition rebuild: ${escapeHtml(fmtDate(db.procurement?.lastAcquisitionRebuildAt))}<br>
                Acquisition lots: ${Number(db.procurement?.acquisitions?.length || 0).toLocaleString()}<br>
                Filtered customers: ${Object.values(db.removedCustomers || {}).filter(isRemovalRecordActive).length}
            </div>
            <div style="margin-top:10px;border-top:1px solid #333;padding-top:8px;">
                <b>Faction Inventory API</b>
                <div style="font-size:11px;color:#aaa;margin:4px 0 7px;">
                    Recommended dedicated key for <b>Faction → Inventory</b>. Leadership must enable <b>Faction API Access</b> for your faction position; then use your own Limited key or a custom key containing that selection.
                    Do not ask leadership to share another player's API key. This key is stored only in Tampermonkey GM storage and excluded from sanitized GitHub backups.
                    If blank, manual armory sync can fall back to the primary CRM key when that key has the same faction permission.
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <input id="mm-faction-api-key" type="password" autocomplete="off"
                        placeholder="${hasFactionKey ? 'Faction API key saved — enter to replace' : 'Dedicated faction inventory API key'}"
                        style="${inputCss()}flex:1;min-width:260px;">
                    <button id="mm-save-faction-api" style="${btn(true)}">Save Faction Key</button>
                    <button id="mm-clear-faction-api" style="${btn()}">Clear</button>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:11px;">
                    <label><input id="mm-faction-auto-sync" type="checkbox" ${db.factionInventory.settings.autoSync ? 'checked' : ''}> Include faction inventory when opt-in background refresh is enabled</label>
                    <button id="mm-faction-sync-settings" style="${btn()}">Sync Armory Now</button>
                </div>
                <div style="font-size:10px;color:#888;margin-top:6px;">
                    Source snapshot: ${escapeHtml(fmtDate(db.factionInventory.inventoryTimestamp))} · Last fetch: ${escapeHtml(fmtDate(db.factionInventory.lastSyncAt))}
                </div>
            </div>
            <div style="margin-top:10px;border-top:1px solid #333;padding-top:8px;">
                <b>Operations</b>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:5px;">
                    <label style="font-size:10px;color:#aaa;">Listing hours<input id="mm-ops-listing-hours" type="number" min="1" value="${Number(db.operations.settings.listingHours||DEFAULT_LISTING_HOURS)}" style="${inputCss()}width:100%;"></label>
                    <label style="font-size:10px;color:#aaa;">Lead hours<input id="mm-ops-lead-hours" type="number" min="1" value="${Number(db.operations.settings.defaultLeadHours||6)}" style="${inputCss()}width:100%;"></label>
                    <label style="font-size:10px;color:#aaa;">Dead stock days<input id="mm-ops-dead-days" type="number" min="1" value="${Number(db.operations.settings.deadStockDays||DEAD_STOCK_DAYS)}" style="${inputCss()}width:100%;"></label>
                    <label style="font-size:10px;color:#aaa;">Overstock ×<input id="mm-ops-overstock" type="number" min="1" step=".1" value="${Number(db.operations.settings.overstockMultiplier||1.5)}" style="${inputCss()}width:100%;"></label>
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;"><button id="mm-save-ops-settings" style="${btn()}">Save Operations</button><button id="mm-enable-notifications" style="${btn()}">Enable Browser Alerts</button></div>
            </div>
            <div style="margin-top:10px;border-top:1px solid #333;padding-top:8px;">
                <b>Data Storage & GitHub Backup</b>
                <div style="margin:6px 0;">
                    <button id="mm-repair-contact-state" style="${btn()}">Repair Contacted Status</button>
                    <span style="font-size:10px;color:#888;margin-left:6px;">Restores previously contacted customers from durable contact/coupon evidence.</span>
                </div>
                <div style="font-size:11px;color:#aaa;margin:4px 0 7px;">
                    Primary database: <b>IndexedDB</b>. GitHub sync runs hourly when configured.
                    Sanitized backup excludes customer records, API keys, refunds, coupons, private notes, acquisitions, account-specific inventory, and faction armory data.
                    Optional encrypted full backup protects the complete CRM database.
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;">
                    <input id="mm-gh-owner" placeholder="GitHub owner" value="${escapeHtml(getGithubSettings().owner)}" style="${inputCss()}">
                    <input id="mm-gh-repo" placeholder="Repository" value="${escapeHtml(getGithubSettings().repo)}" style="${inputCss()}">
                    <input id="mm-gh-branch" placeholder="Branch" value="${escapeHtml(getGithubSettings().branch)}" style="${inputCss()}">
                    <input id="mm-gh-folder" placeholder="Folder" value="${escapeHtml(getGithubSettings().folder)}" style="${inputCss()}">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">
                    <input id="mm-gh-token" type="password" autocomplete="off" placeholder="${getGithubToken() ? 'GitHub fine-grained token saved — enter to replace' : 'GitHub fine-grained PAT (Contents read/write)'}" style="${inputCss()}">
                    <input id="mm-gh-passphrase" type="password" autocomplete="off" placeholder="${getGithubBackupPassphrase() ? 'Encrypted backup passphrase saved — enter to replace' : 'Optional encrypted full-backup passphrase'}" style="${inputCss()}">
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:11px;">
                    <label><input id="mm-gh-auto" type="checkbox" ${getGithubSettings().autoSync ? 'checked' : ''}> Hourly sync</label>
                    <label><input id="mm-gh-full" type="checkbox" ${getGithubSettings().encryptedFullBackup ? 'checked' : ''}> Encrypted full backup</label>
                    <button id="mm-gh-save" style="${btn(true)}">Save GitHub</button>
                    <button id="mm-gh-sync-now" style="${btn()}">Sync Now</button>
                    <button id="mm-gh-restore" style="${btn()}">Restore from GitHub</button>
                </div>
                <div style="font-size:10px;color:#888;margin-top:6px;">
                    Last GitHub sync: ${escapeHtml(fmtDate(getGithubSettings().lastSyncAt))} · Status: ${escapeHtml(getGithubSettings().lastStatus || 'Not run')}<br>
                    Local backend: IndexedDB · Last local save: ${escapeHtml(fmtDate(db.meta?.storage?.lastSavedAt))}
                </div>
            </div>
            ${updateCenterHtml()}
            <div style="font-size:12px;color:#888;margin-top:8px;">
                CRM v${VERSION}. Simple mode is task-first; Advanced mode exposes every detailed page. Torn data and TornW3B public market intelligence are normalized locally; scoring, ROI, liquidity, supplier, allocation, customer, demand, and realized-profit calculations run in this userscript.
                Messages, purchases, Bazaar submissions, trades, and money transfers are never auto-submitted.
            </div>
        `);
    }

    function panelBody(db) {
        if (simpleMode) {
            if (activeTab === 'home') return homeHtml(db);
            if (activeTab === 'stock') return stockSimpleHtml(db);
            if (activeTab === 'faction') return factionInventoryHtml(db);
            if (activeTab === 'deals') return dealsSimpleHtml(db);
            if (activeTab === 'customers') return customersSimpleHtml(db);
            if (activeTab === 'reports') return reportsSimpleHtml(db);
            if (activeTab === 'more') return moreSimpleHtml(db);
        }
        if (activeTab === 'ops') return operationsHtml(db);
        if (activeTab === 'customers') return customersHtml(db);
        if (activeTab === 'inventory') return inventoryHtml(db);
        if (activeTab === 'faction') return factionInventoryHtml(db);
        if (activeTab === 'procurement') return procurementHtml(db);
        if (activeTab === 'intel') return marketIntelHtml(db);
        if (activeTab === 'analytics') return analyticsHtml(db);
        if (activeTab === 'coupons') return couponsHtml(db);
        if (activeTab === 'subscribers') return subscribersHtml(db);
        if (activeTab === 'refunds') return refundsHtml(db);
        if (activeTab === 'sales') return salesHtml(db);
        return settingsHtml();
    }

    function createPanel() {
        if (document.getElementById(ROOT_ID)) return;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.style.cssText = 'position:fixed;z-index:2147483646;width:min(660px,calc(100vw - 24px));max-height:calc(100vh - 100px);overflow:auto;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:9px;box-shadow:0 12px 35px #000b;font:13px/1.35 Arial,sans-serif;';
        document.body.appendChild(root);
    }

    function createLauncher() {
        if (document.getElementById(LAUNCHER_ID)) return;
        const b = document.createElement('button');
        b.id = LAUNCHER_ID;
        b.textContent = 'CRM';
        b.style.cssText = `position:fixed;right:0;top:160px;z-index:2147483647;${btn(true)}border-radius:6px 0 0 6px;`;
        b.onclick = showCRM;
        document.body.appendChild(b);
    }

    function render() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const ui = getUI();
        if (ui.minimized) return;
        const db = dbLoad();
        root.innerHTML = `<div id="mm-drag" style="position:sticky;top:0;z-index:2;background:#111;border-bottom:1px solid #4b4024;cursor:move;"><div style="height:76px;background:linear-gradient(90deg,#0008,#0002),url('${BANNER_URL}') center/cover;border-radius:8px 8px 0 0;display:flex;align-items:flex-end;justify-content:space-between;padding:8px;box-sizing:border-box;"><div><b style="font-size:17px;text-shadow:0 2px 4px #000;">${SHOP_NAME}</b><div style="font-size:11px;text-shadow:0 1px 3px #000;">Bazaar Customer CRM v${VERSION}</div></div><div style="display:flex;gap:5px;"><button id="mm-minimize" style="${btn()}">−</button><button id="mm-close" style="${btn()}">×</button></div></div></div><div style="padding:9px;">${tabsHtml()}<div id="mm-status" style="padding:6px 8px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin-bottom:7px;">${escapeHtml(statusText)}</div>${panelBody(db)}</div>`;
        bindPanelEvents(root);
        enableDragging(root);
    }

    function showCRM() {
        const root = document.getElementById(ROOT_ID);
        const launcher = document.getElementById(LAUNCHER_ID);
        const ui = getUI();
        saveUI({ minimized: false });
        if (root) {
            root.style.display = 'block';
            const left = ui.left == null ? Math.max(10, innerWidth - 690) : Math.min(Math.max(0, ui.left), Math.max(0, innerWidth - root.offsetWidth));
            const top = Math.min(Math.max(0, ui.top), Math.max(0, innerHeight - 80));
            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
        }
        if (launcher) launcher.style.display = 'none';
        render();
    }

    function minimizeCRM() {
        saveUI({ minimized: true });
        const root = document.getElementById(ROOT_ID);
        const launcher = document.getElementById(LAUNCHER_ID);
        if (root) root.style.display = 'none';
        if (launcher) launcher.style.display = 'block';
    }

    function enableDragging(root) {
        const handle = root.querySelector('#mm-drag');
        if (!handle || handle.dataset.bound) return;
        handle.dataset.bound = '1';
        handle.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            const rect = root.getBoundingClientRect();
            const dx = event.clientX - rect.left;
            const dy = event.clientY - rect.top;
            handle.setPointerCapture(event.pointerId);
            const move = e => {
                const left = Math.min(Math.max(0, e.clientX - dx), Math.max(0, innerWidth - root.offsetWidth));
                const top = Math.min(Math.max(0, e.clientY - dy), Math.max(0, innerHeight - 50));
                root.style.left = `${left}px`;
                root.style.top = `${top}px`;
            };
            const up = e => {
                handle.releasePointerCapture(e.pointerId);
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                const r = root.getBoundingClientRect();
                saveUI({ left: r.left, top: r.top });
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
        });
    }

    function bindPanelEvents(root) {
        root.querySelector('#mm-ui-mode-toggle')?.addEventListener('click', () => {
            simpleMode = !simpleMode;
            GM_setValue(UI_MODE_KEY, simpleMode ? 'simple' : 'advanced');
            activeTab = simpleMode ? 'home' : 'ops';
            statusText = simpleMode ? 'Simple mode enabled.' : 'Advanced mode enabled.';
            render();
        });

        root.querySelectorAll('[data-simple-go]').forEach(button => button.addEventListener('click', () => {
            simpleMode = true;
            GM_setValue(UI_MODE_KEY, 'simple');
            activeTab = button.dataset.simpleGo || 'home';
            render();
            ensureDataForTab(activeTab);
        }));

        root.querySelectorAll('[data-open-advanced]').forEach(button => button.addEventListener('click', () => {
            simpleMode = false;
            GM_setValue(UI_MODE_KEY, 'advanced');
            activeTab = button.dataset.openAdvanced || 'ops';
            render();
        }));

        root.querySelectorAll('[data-strategy-preset]').forEach(button => button.addEventListener('click', () => {
            applyStrategyPreset(button.dataset.strategyPreset);
        }));

        root.querySelector('#mm-minimize')?.addEventListener('click', minimizeCRM);
        root.querySelector('#mm-close')?.addEventListener('click', minimizeCRM);
        root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
            activeTab = b.dataset.tab;
            render();
            if (simpleMode) ensureDataForTab(activeTab);
        }));
        root.querySelectorAll('[data-financial-export]').forEach(button => button.addEventListener('click', () => {
            try {
                const kind = String(button.dataset.financialExport || '');
                if (kind === 'xlsx') exportFinancialWorkbook();
                else if (kind === 'all') exportFinancialPack();
                else exportFinancialDocument(kind);
                statusText = kind === 'xlsx'
                    ? 'Financial Excel workbook exported.'
                    : kind === 'all'
                        ? 'Financial CSV pack created.'
                        : 'Financial spreadsheet exported: ' + kind + '.';
                render();
            } catch (error) {
                statusText = 'Financial export failed: ' + (error?.message || String(error));
                render();
            }
        }));

        root.querySelectorAll('[data-smart-refresh]').forEach(button => button.addEventListener('click', () => {
            syncBusinessData({ silent:false, force:false }).catch(error => {
                statusText = 'Smart refresh failed: ' + (error?.message || String(error));
                render();
            });
        }));
        root.querySelector('#mm-save-business-rules')?.addEventListener('click', () => {
            saveBusinessRules({
                minRoiPct: root.querySelector('#mm-rule-min-roi')?.value,
                minDemandPerDay: root.querySelector('#mm-rule-min-demand')?.value,
                minPrice: root.querySelector('#mm-rule-min-price')?.value,
                maxPrice: root.querySelector('#mm-rule-max-price')?.value,
                minAbsoluteProfit: root.querySelector('#mm-rule-min-profit')?.value,
                minSellerCount: root.querySelector('#mm-rule-min-sellers')?.value,
                maxListingAgeSec: root.querySelector('#mm-rule-max-age')?.value,
                marketRefreshLimit: root.querySelector('#mm-rule-refresh-limit')?.value
            });
            statusText = 'CRM-wide business rules saved.';
            render();
        });

        root.querySelectorAll('[data-start-restock-session]').forEach(button => button.addEventListener('click', () => {
            try { startRestockSession(); statusText='Restock session started.'; render(); }
            catch(error){statusText=`Could not start restock session: ${error?.message||String(error)}`;render();}
        }));
        root.querySelectorAll('[data-restock-skip]').forEach(button => button.addEventListener('click',()=>advanceRestockSession('skipped')));
        root.querySelectorAll('[data-restock-log-purchase]').forEach(button => button.addEventListener('click',()=>{
            const db=dbLoad(),s=getActiveRestockSession(db),q=s?.queue?.[s.activeIndex];if(!q)return;
            const qty=prompt(`Quantity purchased for ${q.itemName}:`,String(q.sourceQty||q.need||1));if(qty==null)return;
            const cost=prompt('Actual unit cost:',String(q.buyPrice||''));if(cost==null)return;
            try{logRestockPurchase(qty,cost);statusText='Purchase logged and restock session advanced.';}
            catch(error){statusText=`Purchase not logged: ${error?.message||String(error)}`;render();}
        }));
        root.querySelectorAll('[data-open-bazaar-add]').forEach(button => button.addEventListener('click',()=>navigateFromCRM('https://www.torn.com/bazaar.php#/p=add')));
        root.querySelector('#mm-add-event')?.addEventListener('click',()=>{
            try{
                addDemandEvent(root.querySelector('#mm-event-name')?.value,root.querySelector('#mm-event-start')?.value,root.querySelector('#mm-event-end')?.value,root.querySelector('#mm-event-mult')?.value);
                statusText='Demand event added.';
            }catch(error){statusText=`Event not added: ${error?.message||String(error)}`;render();}
        });
        root.querySelectorAll('[data-ops-action]').forEach(button=>button.addEventListener('click',()=>{
            const action=button.dataset.opsAction;
            if(action==='seller'&&button.dataset.seller){
                if(button.dataset.item)return verifyAndOpenBazaarSeller(button.dataset.item,button.dataset.seller,button.dataset.price);
                return navigateFromCRM(`https://www.torn.com/profiles.php?XID=${encodeURIComponent(button.dataset.seller)}`);
            }
            if(action==='remove-event')return removeDemandEvent(button.dataset.event);
            if(action==='listing-plan'){
                const db=dbLoad();
                const plan=listingPlanPreview(db)[button.dataset.item] || db.operations.listingPlans[button.dataset.item];
                if(plan)alert(`${plan.itemName}\nAdd ${plan.quantity} to Bazaar\nRecommended price: ${money(plan.price)}\nExpected margin: ${plan.expectedMarginPct.toFixed(1)}%`);
            }
        }));

        root.querySelector('#mm-travel-capture')?.addEventListener('click', () => updateTravelData().catch(error => { statusText=`Travel refresh failed: ${error?.message||String(error)}`; render(); }));
        root.querySelector('#mm-travel-history')?.addEventListener('click', () => syncYataTravelHistory({silent:false}).catch(error => { statusText='Shared history refresh failed: '+(error?.message||String(error)); render(); }));
        root.querySelector('#mm-travel-sync')?.addEventListener('click', () => syncTravelStock({ silent:false, force:true }).catch(()=>{}));
        root.querySelector('#mm-travel-country')?.addEventListener('change', e => {
            const db=dbLoad();
            db.travelIntel.settings.selectedCountry=String(e.currentTarget.value||'');
            db.travelIntel.settings.selectedItemKey='';
            dbSave(db);
            render();
        });
        root.querySelector('#mm-travel-item')?.addEventListener('change', e => {
            const db=dbLoad();
            db.travelIntel.settings.selectedItemKey=String(e.currentTarget.value||'');
            dbSave(db);
            render();
        });
        root.querySelector('#mm-travel-save')?.addEventListener('click', () => saveTravelSettings(root));
        root.querySelector('#mm-faction-sync')?.addEventListener('click', () => syncFactionInventory({silent:false,force:true}).catch(()=>{}));
        root.querySelector('#mm-faction-market')?.addEventListener('click', () => syncMarketIntelligence(false));
        root.querySelector('#mm-faction-category')?.addEventListener('change', e => {
            const db=dbLoad();
            db.factionInventory.settings.selectedCategory=String(e.currentTarget.value||'all');
            db.factionInventory.settings.updatedAt=nowIso();
            dbSave(db);
            render();
        });
        root.querySelectorAll('[data-faction-action="threshold"]').forEach(button => button.addEventListener('click', () => {
            const id=asId(button.dataset.item);
            const db=dbLoad();
            const existing=db.factionInventory.thresholds?.[id];
            const value=prompt('Provisional planning target for '+String(button.dataset.name||('item '+id))+':', String(existing?.target||0));
            if(value==null)return;
            const target=Math.max(0,Math.round(Number(value)||0));
            const row=Object.values(db.factionInventory.current||{}).find(item=>asId(item.itemId)===id);
            const defaultBasis=FACTION_INVENTORY_LOAN_CATEGORIES.includes(String(row?.category||''))?'available':'owned';
            setFactionInventoryThreshold(id,target,existing?.basis||defaultBasis);
            statusText=target>0?'Faction planning target saved.':'Faction planning target cleared.';
            render();
        }));
        root.querySelector('#mm-opportunity-sync')?.addEventListener('click', () => syncProcurement());
        root.querySelector('#mm-opportunity-market')?.addEventListener('click', () => syncMarketIntelligence(false));

        root.querySelector('#mm-save-faction-api')?.addEventListener('click', () => {
            const value=String(root.querySelector('#mm-faction-api-key')?.value||'').trim();
            if(value)setFactionApiKey(value);
            const db=dbLoad();
            db.factionInventory.settings.autoSync=Boolean(root.querySelector('#mm-faction-auto-sync')?.checked);
            db.factionInventory.settings.updatedAt=nowIso();
            dbSave(db);
            statusText=value?'Faction inventory API key saved.':'Faction inventory settings saved.';
            render();
        });
        root.querySelector('#mm-clear-faction-api')?.addEventListener('click', () => {
            setFactionApiKey('');
            statusText='Dedicated faction inventory API key cleared. Manual sync can still use a compatible primary CRM key.';
            render();
        });
        root.querySelector('#mm-faction-auto-sync')?.addEventListener('change', e => {
            const db=dbLoad();
            db.factionInventory.settings.autoSync=Boolean(e.currentTarget.checked);
            db.factionInventory.settings.updatedAt=nowIso();
            dbSave(db);
        });
        root.querySelector('#mm-faction-sync-settings')?.addEventListener('click', () => syncFactionInventory({silent:false,force:true}).catch(()=>{}));
        root.querySelector('#mm-background-refresh')?.addEventListener('change', e => {
            const db = dbLoad();
            db.syncState.backgroundRefreshEnabled = Boolean(e.currentTarget.checked);
            dbSave(db);
            statusText = db.syncState.backgroundRefreshEnabled
                ? 'Background refresh enabled for one visible CRM tab.'
                : 'Background refresh disabled. Smart Refresh is manual.';
            const status = document.getElementById('mm-status');
            if (status) status.textContent = statusText;
        });

        root.querySelector('#mm-add-customer')?.addEventListener('click', () => addManualCustomer(root.querySelector('#mm-add-id')?.value));
        root.querySelector('#mm-refresh-customers')?.addEventListener('click', async () => {
            try {
                await repairRecentSalesCoverage({ lookbackMs: CUSTOMER_REFRESH_LOOKBACK_MS, silent: false });
            } catch (error) {
                statusText = `Customer refresh failed: ${error?.message || String(error)}`;
                render();
            }
        });
        root.querySelector('#mm-add-id')?.addEventListener('keydown', e => { if (e.key === 'Enter') addManualCustomer(e.currentTarget.value); });

        const bindCustomerFilter = (selector, key) => root.querySelector(selector)?.addEventListener('change', e => {
            customerFilters[key] = e.currentTarget.value;
            render();
        });
        bindCustomerFilter('#mm-filter-message', 'message');
        bindCustomerFilter('#mm-filter-contacted', 'contacted');
        bindCustomerFilter('#mm-filter-restock', 'restock');
        bindCustomerFilter('#mm-filter-cashback', 'cashback');
        root.querySelector('#mm-filter-reset')?.addEventListener('click', () => {
            customerFilters.message = 'all';
            customerFilters.contacted = 'all';
            customerFilters.restock = 'all';
            customerFilters.cashback = 'all';
            render();
        });

        root.querySelector('#mm-save-api')?.addEventListener('click', () => {
            const value = root.querySelector('#mm-api-key')?.value || '';
            if (!value.trim()) { alert('Enter an API key first.'); return; }
            setApiKey(value);
            fatal = false;
            statusText = 'API key saved in Tampermonkey storage.';
            render();
            sync();
        });
        root.querySelector('#mm-clear-api')?.addEventListener('click', () => {
            setApiKey('');
            fatal = false;
            statusText = 'API key removed.';
            render();
        });
        root.querySelector('#mm-sync-now')?.addEventListener('click', sync);
        root.querySelector('#mm-rebuild-sales')?.addEventListener('click', rebuildSalesHistory);
        root.querySelector('#mm-repair-names')?.addEventListener('click', async () => {
            statusText = 'Repairing unresolved usernames…'; render();
            const count = await repairUsernames(25);
            statusText = `Username repair complete: ${count} repaired.`; render();
        });
        root.querySelector('#mm-repair-sales-integrity')?.addEventListener('click', repairSalesIntegrityNow);
        root.querySelector('#mm-update-check')?.addEventListener('click', () => checkCrmUpdate({silent:false}).catch(()=>{}));
        root.querySelector('#mm-update-open')?.addEventListener('click', openCrmUpdateInstaller);

        root.querySelector('#mm-intel-global-sync')?.addEventListener('click', () => syncMarketIntelligence(false));
        root.querySelector('#mm-intel-full-sync')?.addEventListener('click', () => syncMarketIntelligence(true));
        root.querySelector('#mm-intel-enrich')?.addEventListener('click', async () => {
            if (procurementRunning) return;
            procurementRunning = true;
            statusText = 'Enriching top global opportunities…';
            render();
            try {
                const r = await enrichTopGlobalOpportunities();
                statusText = `Deal enrichment complete: ${r.ok}/${r.requested}.`;
            } catch (error) {
                statusText = `Deal enrichment failed: ${error?.message || String(error)}`;
            } finally {
                procurementRunning = false;
                render();
            }
        });
        root.querySelector('#mm-intel-dollar')?.addEventListener('click', async () => {
            statusText = 'Refreshing $1 Bazaar intelligence…'; render();
            try {
                const rows = await syncWeavDollarBazaars();
                statusText = `$1 scanner refreshed: ${rows.length} item listing(s).`;
            } catch (error) {
                statusText = `$1 scanner failed: ${error?.message || String(error)}`;
            }
            render();
        });
        root.querySelectorAll('[data-intel-ranked]').forEach(button => button.addEventListener('click', async () => {
            statusText = 'Refreshing ranked and auction intelligence…'; render();
            try {
                const r = await syncWeavRanked();
                statusText = `Ranked intelligence refreshed: ${r.ranked.length} listing(s), ${r.auctions.length} auction(s).`;
            } catch (error) {
                statusText = `Ranked intelligence failed: ${error?.message || String(error)}`;
            }
            render();
        }));
        root.querySelector('#mm-save-intel-settings')?.addEventListener('click', () => {
            saveBusinessRules({
                minRoiPct: root.querySelector('#mm-intel-min-roi')?.value,
                minDemandPerDay: root.querySelector('#mm-intel-min-demand')?.value,
                minPrice: root.querySelector('#mm-intel-min-market')?.value,
                maxPrice: root.querySelector('#mm-intel-max-market')?.value,
                minAbsoluteProfit: root.querySelector('#mm-intel-min-profit')?.value,
                minSellerCount: root.querySelector('#mm-intel-min-sellers')?.value
            });
            const db = dbLoad();
            const maxEnrich = Number(root.querySelector('#mm-intel-max-enrich')?.value);
            const haircut = Number(root.querySelector('#mm-intel-haircut')?.value);
            if (Number.isFinite(maxEnrich) && maxEnrich > 0) db.marketIntel.settings.maxEnrich = Math.min(WEAV3R_MAX_ENRICH, Math.round(maxEnrich));
            if (Number.isFinite(haircut) && haircut >= 0) db.marketIntel.settings.bazaarExitHaircutPct = haircut;
            dbSave(db);
            statusText = 'CRM-wide deal rules saved.';
            render();
        });

        root.querySelectorAll('[data-intel-action]').forEach(button => button.addEventListener('click', async () => {
            const action = button.dataset.intelAction;
            if (action === 'profile') {
                const seller = button.dataset.seller;
                if (seller) navigateFromCRM(`https://www.torn.com/profiles.php?XID=${encodeURIComponent(seller)}`);
                return;
            }
            if (action === 'verify-seller') {
                const seller = button.dataset.seller;
                const item = button.dataset.item;
                if (seller && item) await verifyAndOpenBazaarSeller(item, seller, button.dataset.price);
                return;
            }
            if (action === 'enrich') {
                const id = button.dataset.item;
                if (!id) return;
                statusText = `Verifying global listings and trader exits for item ${id}…`;
                render();
                try {
                    await enrichWeavItem(id, { force: true });
                    statusText = `Item ${id} market intelligence refreshed.`;
                } catch (error) {
                    statusText = `Item analysis failed: ${error?.message || String(error)}`;
                }
                render();
                return;
            }
        }));

        root.querySelector('#mm-repair-contact-state')?.addEventListener('click', () => {
            const db = dbLoad();
            let repaired = 0;
            const before = {};

            for (const [id, c] of Object.entries(db.customers || {})) {
                before[id] = customerHasBeenContacted(c);
            }

            mergeDurableContactState(db);

            for (const [id, c] of Object.entries(db.customers || {})) {
                if (!before[id] && customerHasBeenContacted(c)) repaired++;
                if (customerHasBeenContacted(c)) rememberContactState(c);
            }

            dbSave(db);
            statusText = repaired
                ? `Contact status repaired for ${repaired} customer${repaired === 1 ? '' : 's'}.`
                : 'Contact status checked. No additional repairs were needed.';
            render();
        });

        root.querySelector('#mm-gh-save')?.addEventListener('click', () => {
            saveGithubSettings({
                owner: root.querySelector('#mm-gh-owner')?.value || '',
                repo: root.querySelector('#mm-gh-repo')?.value || '',
                branch: root.querySelector('#mm-gh-branch')?.value || 'main',
                folder: root.querySelector('#mm-gh-folder')?.value || 'crm-sync',
                autoSync: Boolean(root.querySelector('#mm-gh-auto')?.checked),
                encryptedFullBackup: Boolean(root.querySelector('#mm-gh-full')?.checked)
            });
            const token = root.querySelector('#mm-gh-token')?.value || '';
            const passphrase = root.querySelector('#mm-gh-passphrase')?.value || '';
            if (token) setGithubToken(token);
            if (passphrase) setGithubBackupPassphrase(passphrase);
            scheduleGithubSync();
            statusText = 'GitHub backup settings saved.';
            render();
        });

        root.querySelector('#mm-gh-sync-now')?.addEventListener('click', () => githubSyncNow({ silent: false }));

        root.querySelector('#mm-gh-restore')?.addEventListener('click', async () => {
            if (!confirm('Restore CRM data from the configured GitHub backup? Encrypted full backup is preferred when available.')) return;
            statusText = 'Restoring CRM backup from GitHub…';
            render();
            try {
                const result = await githubRestore({ preferFull: true });
                statusText = `GitHub restore complete (${result.type}).`;
            } catch (error) {
                statusText = `GitHub restore failed: ${error?.message || String(error)}`;
            }
            render();
        });

        root.querySelector('#mm-save-ops-settings')?.addEventListener('click',()=>{
            const db=dbLoad();
            const pairs={
                listingHours:root.querySelector('#mm-ops-listing-hours')?.value,
                defaultLeadHours:root.querySelector('#mm-ops-lead-hours')?.value,
                deadStockDays:root.querySelector('#mm-ops-dead-days')?.value,
                overstockMultiplier:root.querySelector('#mm-ops-overstock')?.value
            };
            for(const [k,v] of Object.entries(pairs)){const n=Number(v);if(Number.isFinite(n)&&n>0)db.operations.settings[k]=n;}
            dbSave(db);statusText='Operations settings saved.';render();
        });
        root.querySelector('#mm-enable-notifications')?.addEventListener('click',requestOperationalNotifications);
        root.querySelector('#mm-build-repricing-plan')?.addEventListener('click', () => {
            const db=dbLoad();
            const plan=buildRepricingPlan(db);
            dbSave(db);
            statusText=`Repricing plan ready: ${Object.keys(plan).length} item${Object.keys(plan).length===1?'':'s'}. Open your Bazaar to use the fill assistant.`;
            render();
        });

        root.querySelectorAll('[data-proc-sync]').forEach(button => button.addEventListener('click', syncProcurement));
        root.querySelectorAll('[data-rebuild-acquisitions]').forEach(button => button.addEventListener('click', rebuildAcquisitionHistory));
        root.querySelector('#mm-save-proc-settings')?.addEventListener('click', () => {
            saveProcurementSettings({
                procurementBudget: root.querySelector('#mm-proc-budget')?.value,
                targetDays: root.querySelector('#mm-proc-target-days')?.value,
                safetyDays: root.querySelector('#mm-proc-safety-days')?.value,
                minMarginPct: root.querySelector('#mm-proc-margin')?.value
            });
            statusText = 'Procurement targets saved.';
            render();
        });

        root.querySelectorAll('[data-proc-refresh-markets]').forEach(button => button.addEventListener('click', async () => {
            const db = dbLoad();
            const rows = procurementRows(db)
                .filter(r => /^\d+$/.test(r.id) && (r.watched || r.rank <= 2 || r.shortage > 0))
                .slice(0, businessRules(db).marketRefreshLimit);
            statusText = `Refreshing ${rows.length} market snapshot${rows.length === 1 ? '' : 's'}…`;
            render();
            let ok = 0;
            for (const row of rows) {
                try { await refreshMarketSnapshot(row.id); ok++; }
                catch (error) {
                    const next = dbLoad();
                    addProcurementDiagnostic(next.procurement, `Market ${row.name}: ${error?.message || String(error)}`);
                    dbSave(next);
                }
            }
            statusText = `Market refresh complete: ${ok}/${rows.length}.`;
            render();
        }));

        root.querySelector('#mm-add-acquisition')?.addEventListener('click', () => {
            try {
                addAcquisition({
                    itemId: root.querySelector('#mm-buy-item-id')?.value,
                    itemName: root.querySelector('#mm-buy-item-name')?.value,
                    quantity: root.querySelector('#mm-buy-qty')?.value,
                    unitCost: root.querySelector('#mm-buy-cost')?.value,
                    source: root.querySelector('#mm-buy-source')?.value,
                    notes: root.querySelector('#mm-buy-notes')?.value
                });
                statusText = 'Acquisition logged.';
            } catch (error) {
                statusText = `Acquisition not logged: ${error?.message || String(error)}`;
            }
            render();
        });

        root.querySelector('#mm-add-travel')?.addEventListener('click', () => {
            try {
                addTravelEntry({
                    destination: root.querySelector('#mm-travel-destination')?.value,
                    itemId: root.querySelector('#mm-travel-item-id')?.value,
                    itemName: root.querySelector('#mm-travel-item-name')?.value,
                    quantity: root.querySelector('#mm-travel-qty')?.value,
                    unitCost: root.querySelector('#mm-travel-cost')?.value,
                    observedStock: root.querySelector('#mm-travel-stock')?.value,
                    notes: root.querySelector('#mm-travel-notes')?.value
                });
                statusText = 'Travel purchase added to travel and acquisition ledgers.';
            } catch (error) {
                statusText = `Travel entry not added: ${error?.message || String(error)}`;
            }
            render();
        });

        root.querySelectorAll('[data-proc-action]').forEach(button => button.addEventListener('click', async () => {
            const action = button.dataset.procAction;
            const id = button.dataset.item;

            if (action === 'watch') return toggleWatchItem(id);
            if (action === 'alert-rule') return setOpportunityAlertRule(id);

            if (action === 'market') {
                statusText = `Refreshing official markets for item ${id}…`;
                render();
                try {
                    await refreshMarketSnapshot(id);
                    statusText = `Market snapshot refreshed for item ${id}.`;
                } catch (error) {
                    statusText = `Market refresh failed: ${error?.message || String(error)}`;
                }
                render();
                return;
            }

            if (action === 'log-buy') {
                const qty = prompt(`Quantity purchased for ${button.dataset.name || id}:`, '1');
                if (qty == null) return;
                const cost = prompt('Unit cost:', '');
                if (cost == null) return;
                const source = prompt('Source (Direct Trade / Travel / Faction / NPC / Manual):', 'Direct Trade') || 'Manual';
                try {
                    addAcquisition({
                        itemId: id,
                        itemName: button.dataset.name || '',
                        source,
                        quantity: qty,
                        unitCost: cost,
                        notes: ''
                    });
                    statusText = 'Acquisition logged.';
                } catch (error) {
                    statusText = `Acquisition not logged: ${error?.message || String(error)}`;
                }
                render();
                return;
            }

            if (action === 'remove-acquisition') return removeAcquisition(button.dataset.acquisition);
            if (action === 'remove-travel') return removeTravelEntry(button.dataset.travel);
        }));

        root.querySelector('#mm-restock-refresh-inventory')?.addEventListener('click', async () => {
            statusText = 'Refreshing current Bazaar inventory…';
            render();
            try {
                const db = await refreshOwnBazaarInventoryForMessage();
                const count = Object.keys(db.procurement?.bazaar || {}).length;
                statusText = `Bazaar inventory refreshed: ${count.toLocaleString()} SKU(s).`;
            } catch (error) {
                statusText = `Bazaar inventory refresh failed: ${error?.message || String(error)}`;
            }
            render();
        });

        root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
            const action = button.dataset.action;
            const id = button.dataset.id;
            const refundId = button.dataset.refund;
            const db = dbLoad();
            if (action === 'compose' && db.customers[id]) return composeCustomer(db.customers[id]);
            if (action === 'coupon-reminder') return prepareCouponReminder(id);
            if (action === 'reorder-compose') return prepareReorderOutreach(id);
            if (action === 'contacted') return markCustomerContacted(id);
            if (action === 'subscribe' && db.customers[id]) return subscribeCustomer(db.customers[id]);
            if (action === 'unsubscribe') return unsubscribeCustomer(id);
            if (action === 'profile') return navigateFromCRM(`https://www.torn.com/profiles.php?XID=${encodeURIComponent(id)}`);
            if (action === 'remove') return removeCustomer(id);
            if (action === 'start-refund') return startCouponRefund(id);
            if (action === 'open-refund' && db.refunds[refundId]) return openRefundProfile(db.refunds[refundId]);
            if (action === 'complete-refund' && db.refunds[refundId]) {
                const r = db.refunds[refundId];
                if (confirm(`Confirm Torn successfully sent ${money(r.amount)} to ${r.playerName || r.playerId}?\n\nOnly continue after Torn confirms the transfer.`)) {
                    completeRefund(refundId).catch(error => {
                        statusText = `Cashback update failed: ${error?.message || String(error)}`;
                        render();
                    });
                }
                return;
            }
            if (action === 'cancel-refund') return cancelRefund(refundId);
            if (action === 'edit-interests') {
                const db = dbLoad();
                const sub = db.subscribers[id];
                if (!sub) return;
                const current = Array.isArray(sub.interests) ? sub.interests.join(', ') : '';
                const value = prompt('Interested item IDs or names, comma-separated. Leave blank for all items:', current);
                if (value != null) setSubscriberInterests(id, value);
                return;
            }
            if (action === 'notify-inventory') return prepareBazaarInventoryNotification(id);
            if (action === 'notify') {
                const item = root.querySelector('#mm-restock-item')?.value.trim() || '';
                const qty = Number(root.querySelector('#mm-restock-qty')?.value);
                const price = Number(root.querySelector('#mm-restock-price')?.value);
                return prepareRestockNotification(id, item, qty, price);
            }
            if (action === 'notified') return markSubscriberNotified(id);
        }));
    }

    // ============================================================
    // ROUTING / INITIALIZATION
    // ============================================================


    function visibleSendButton() {
        const candidates = [...document.querySelectorAll('button, input[type="submit"], [role="button"]')].filter(visible);
        return candidates.find(el => {
            const text = String(el.innerText || el.value || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '').trim().toLowerCase();
            if (!/(^|\s)send(\s|$)|send message/.test(text)) return false;
            const meta = elementMeta(el);
            return !/search|friend|money|cash|trade|gift/.test(meta);
        }) || null;
    }

    function composeStillVisible(expectedSubject = '') {
        const subject = findComposeSubjectInput();
        if (!subject || !visible(subject)) return false;
        if (!expectedSubject) return true;
        const value = String(subject.value || '').trim();
        return !value || value === String(expectedSubject || '').trim();
    }

    function messageSentConfirmationVisible() {
        const nodes = [...document.querySelectorAll('[role="alert"], [class*="success" i], [class*="message" i], [class*="notification" i], [class*="toast" i]')]
            .filter(visible)
            .slice(-80);
        return nodes.some(el => {
            const t = String(el.innerText || el.textContent || '').trim().toLowerCase();
            return /message\s+(has\s+been\s+)?sent|sent\s+successfully|successfully\s+sent/.test(t);
        });
    }

    function installFirstMessageSendDetector() {
        if (!location.pathname.includes('messages.php')) return;

        const pending = GM_getValue(PENDING_FIRST_SEND_KEY, null);
        const id = asId(pending?.playerId);
        const createdAt = Number(pending?.createdAt || 0);
        if (!id || !createdAt || Date.now() - createdAt > 15 * 60 * 1000) {
            if (pending) GM_deleteValue(PENDING_FIRST_SEND_KEY);
            return;
        }

        let armed = true;
        let clickedAt = 0;
        let verifyTimer = null;
        let scanTimer = null;
        let observer = null;

        const cleanup = keepPending => {
            armed = false;
            if (verifyTimer) clearInterval(verifyTimer);
            if (scanTimer) clearInterval(scanTimer);
            if (observer) observer.disconnect();
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('submit', submitHandler, true);
            if (!keepPending) GM_deleteValue(PENDING_FIRST_SEND_KEY);
        };

        const verifyAfterSend = () => {
            if (!armed || !clickedAt) return;
            const elapsed = Date.now() - clickedAt;

            // Confirmation hierarchy:
            // 1) explicit Torn "message sent" UI
            // 2) compose form/subject disappears or route exits compose after the human Send click.
            const confirmed =
                messageSentConfirmationVisible() ||
                !location.hash.includes('compose') ||
                !composeStillVisible(pending.subject);

            if (confirmed) {
                cleanup(true);
                completeFirstMessageSend(id, 'messages-page-send-confirmed');
                return;
            }

            // Do not mark on a failed/blocked send. Re-arm for another click.
            if (elapsed >= 5000) {
                clickedAt = 0;
                if (verifyTimer) { clearInterval(verifyTimer); verifyTimer = null; }
                GM_setValue(PENDING_FIRST_SEND_KEY, { ...pending, state:'awaiting-send', lastFailedVerifyAt:Date.now() });
                console.warn('[MM CRM] Send click was not confirmed within 5s; first-message state left pending.');
            }
        };

        const armVerification = () => {
            if (!armed || clickedAt) return;
            clickedAt = Date.now();
            GM_setValue(PENDING_FIRST_SEND_KEY, { ...pending, state:'send-clicked', sendClickedAt:clickedAt });
            verifyTimer = setInterval(verifyAfterSend, 250);
            // Immediate and delayed scans cover fast Torn SPA transitions.
            setTimeout(verifyAfterSend, 350);
            setTimeout(verifyAfterSend, 1200);
            setTimeout(verifyAfterSend, 3000);
            setTimeout(verifyAfterSend, 4800);
        };

        const clickHandler = event => {
            if (!armed) return;
            const el = event.target?.closest?.('button, input[type="submit"], [role="button"]');
            if (!el || !visible(el)) return;
            const text = String(el.innerText || el.value || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '').trim().toLowerCase();
            if (/(^|\s)send(\s|$)|send message/.test(text) && !/search|money|cash|trade|gift/.test(elementMeta(el))) {
                armVerification();
            }
        };

        const submitHandler = event => {
            if (!armed) return;
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            const send = visibleSendButton();
            if (send && (form.contains(send) || composeStillVisible(pending.subject))) armVerification();
        };

        document.addEventListener('click', clickHandler, true);
        document.addEventListener('submit', submitHandler, true);

        // 3–5 second scanning window begins after Compose opens, as requested.
        const started = Date.now();
        scanTimer = setInterval(() => {
            if (!armed) return;
            if (Date.now() - started > 5 * 60 * 1000) {
                cleanup(true);
                return;
            }
            // Ensure the Send control is present and the compose page is still alive.
            visibleSendButton();
            if (clickedAt) verifyAfterSend();
        }, 400);

        observer = new MutationObserver(() => {
            if (armed && clickedAt) verifyAfterSend();
        });
        observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style','disabled'] });
    }

    function runPageHelpers() {
        fillMessageComposer();
        installFirstMessageSendDetector();
        fillRefundForm();
        setTimeout(installBazaarListingAssistant, 450);
    }

    function onRouteChanged() {
        if (routeTimer) clearTimeout(routeTimer);
        routeTimer = setTimeout(() => {
            if (location.href === lastHref) return;
            lastHref = location.href;
            runPageHelpers();
        }, 120);
    }

    function installRouteHooks() {
        window.addEventListener('hashchange', onRouteChanged);
        window.addEventListener('popstate', onRouteChanged);
        for (const method of ['pushState', 'replaceState']) {
            const original = history[method];
            history[method] = function (...args) {
                const result = original.apply(this, args);
                onRouteChanged();
                return result;
            };
        }
    }

    function clampPanel() {
        const root = document.getElementById(ROOT_ID);
        if (!root || getUI().minimized) return;
        const r = root.getBoundingClientRect();
        const left = Math.min(Math.max(0, r.left), Math.max(0, innerWidth - root.offsetWidth));
        const top = Math.min(Math.max(0, r.top), Math.max(0, innerHeight - 50));
        root.style.left = `${left}px`;
        root.style.top = `${top}px`;
        saveUI({ left, top });
    }

    function claimBackgroundCoordinator() {
        if (document.visibilityState !== 'visible' || getUI().minimized) return false;
        const now = Date.now();
        let current = null;
        try { current = JSON.parse(localStorage.getItem(BACKGROUND_COORDINATOR_KEY) || 'null'); } catch {}
        if (
            current &&
            current.owner &&
            current.owner !== tabInstanceId &&
            Number(current.expiresAt || 0) > now
        ) return false;
        try {
            localStorage.setItem(BACKGROUND_COORDINATOR_KEY, JSON.stringify({
                owner: tabInstanceId,
                expiresAt: now + BACKGROUND_COORDINATOR_LEASE_MS
            }));
        } catch {
            return false;
        }
        return true;
    }

    async function backgroundRefreshTick() {
        const db = dbLoad();
        if (!db.syncState.backgroundRefreshEnabled) return;
        if (!claimBackgroundCoordinator()) return;
        try {
            await syncBusinessData({ silent:true, force:false });
            const latest = dbLoad();
            if (isDataStale(latest.travelIntel?.lastYataSyncAt, BACKGROUND_REFRESH_INTERVAL_MS)) {
                await syncYataTravelHistory({ silent:true }).catch(() => {});
            }
        } catch (error) {
            console.warn('[MM CRM] Background refresh failed', error);
        }
    }

    async function initialize() {
        migrateApiKey();

        const storage = await initializeStorage();
        installDbCrossTabSync();
        if (storage.migrated) statusText = 'Database migrated to IndexedDB.';

        await autoRestoreIfDatabaseEmpty();
        {
            const repairedDb = dbLoad();
            mergeDurableContactState(repairedDb);
            reconcileSalesIntegrity(repairedDb);
            dbSave(repairedDb);
        }
        await flushDbWrites();

        createPanel();
        createLauncher();
        const ui = getUI();
        if (ui.minimized) minimizeCRM(); else showCRM();
        installRouteHooks();
        runPageHelpers();
        window.addEventListener('resize', clampPanel);
        scheduleGithubSync();

        if (getApiKey()) {
            statusText = 'Ready. Smart Refresh is manual.';
            render();
        } else {
            statusText = 'Torn API key missing. Sales/customer sync is paused. Open More → Settings, paste your Torn API key, and Save.';
            render();
        }

        setInterval(() => {
            backgroundRefreshTick().catch(error => console.warn('[MM CRM] Background coordinator failed', error));
        }, BACKGROUND_REFRESH_INTERVAL_MS);

        setTimeout(() => {
            const checkedAt = Number(crmUpdateStatus().checkedAt || 0);
            if (
                Date.now() - checkedAt > 6 * 60 * 60 * 1000 &&
                claimBackgroundCoordinator()
            ) {
                checkCrmUpdate({silent:true}).catch(()=>{});
            }
        }, 12_000);
    }

    // Manual utility surface. No automatic messaging or money transfer actions are exposed.
    window.MMBazaarCRM = Object.freeze({
        version: VERSION,
        open: showCRM,
        sync,
        rebuildSalesHistory,
        repairSalesIntegrityNow,
        restoreRemovedCustomer,
        auditSales: () => auditSalesData(dbLoad()),
        repairUsernames,
        processCustomerCommand,
        refreshCustomerUsername,
        syncProcurement,
        syncBusinessData,
        businessRules: () => businessRules(dbLoad()),
        saveBusinessRules,
        workflowDataTrustSelfTest,
        financialExportDocuments: () => financialExportDocuments(dbLoad()),
        exportFinancialDocument,
        exportFinancialPack,
        exportFinancialWorkbook,
        syncMarketIntelligence,
        syncWeavMarketplace,
        enrichWeavItem,
        globalOpportunityRows: () => globalOpportunityRows(dbLoad()),
        restockCommandRows: () => restockCommandRows(dbLoad()),
        instantArbitrageRows: () => instantArbitrageRows(dbLoad()),
        sellerBasketRows: () => sellerBasketRows(dbLoad()),
        globalCapitalPlan: () => globalCapitalPlan(dbLoad()),
        advancedInventoryRows: () => advancedInventoryRows(dbLoad()),
        ownerBriefing: () => ownerBriefing(dbLoad()),
        customerRfmRows: () => customerRfmRows(dbLoad()),
        customerClvRows: () => customerClvRows(dbLoad()),
        couponRoiMetrics: () => couponRoiMetrics(dbLoad()),
        buildListingPlan: () => { const db=dbLoad(); const p=buildListingPlan(db); dbSave(db); return p; },
        startRestockSession,
        applyStrategyPreset,
        setSimpleMode: value => { simpleMode = Boolean(value); GM_setValue(UI_MODE_KEY, simpleMode ? 'simple' : 'advanced'); activeTab = simpleMode ? 'home' : 'ops'; render(); },
        procurementRows: () => procurementRows(dbLoad()),
        pricingDirectorRows: () => pricingDirectorRows(dbLoad()),
        capitalRotationRows: () => capitalRotationRows(dbLoad()),
        customerReorderRows: () => customerReorderRows(dbLoad()),
        prepareCouponReminder,
        couponReminderMessage,
        customerAffinityRows: () => customerAffinityRows(dbLoad()),
        supplierPerformanceRows: () => supplierPerformanceRows(dbLoad()),
        opportunityAlertRows: () => opportunityAlertRows(dbLoad()),
        deadCapitalRows: () => deadCapitalRows(dbLoad()),
        salesFunnelMetrics: () => salesFunnelMetrics(dbLoad()),
        competitorIntelligenceRows: () => competitorIntelligenceRows(dbLoad()),
        customerLifecycleSelfTest,
        syncFactionInventory,
        factionInventoryRows: () => factionInventoryRows(dbLoad()),
        factionInventoryLoans: () => factionLoanMemberRows(dbLoad()),
        factionLoanPersistence: () => factionLoanPersistenceRows(dbLoad()),
        factionInventoryReport: (days=7) => factionInventoryReport(dbLoad(),days),
        factionInventorySelfTest,
        syncTravelStock,
        updateTravelData,
        backgroundTravelSample,
        syncYataTravelHistory,
        travelHistoryProfile: (country,itemId) => {
            const db=dbLoad();
            const row=(db.travelIntel.rows||[]).find(r=>String(r.country||'')===String(country||'')&&asId(r.itemId)===asId(itemId));
            return row?travelRestockProfile24h(db,row):null;
        },
        travelForecastPerformance: (country='',itemId='',modelVersion=TRAVEL_FORECAST_MODEL_VERSION) => travelForecastPerformance(dbLoad(),country,itemId,modelVersion),
        travelForecastLedger: () => (dbLoad().travelIntel.forecastLedger||[]).slice(),
        travelForecastEvaluationSelfTest,
        travelOpportunityRows: () => travelOpportunityRows(dbLoad()),
        travelTimedForecastRows: () => travelTimedForecastRows(dbLoad()),
        selectedTravelForecast: () => selectedTravelForecast(dbLoad()),
        travelBasketRows: () => travelBasketRows(dbLoad()),
        buildRepricingPlan: () => {
            const db=dbLoad(); const plan=buildRepricingPlan(db); dbSave(db); return plan;
        },
        capitalPlan: () => capitalAllocationPlan(dbLoad()),
        refreshMarketSnapshot,
        rebuildAcquisitionHistory,
        syncAcquisitionLogs,
        storageInfo: () => ({ backend: 'IndexedDB', dbName: IDB_NAME, lastSavedAt: dbLoad().meta?.storage?.lastSavedAt }),
        githubSyncNow,
        githubRestore,
        githubSettings: getGithubSettings,
        currentBazaarInventory: () => currentBazaarInventoryRows(dbLoad()),
        prepareBazaarInventoryNotification,
        repairRecentSalesCoverage,
        recalculateCustomerSalesTotals,
        checkCrmUpdate,
        openCrmUpdateInstaller
    });

    if (location.hostname === 'weav3r.dev' || location.hostname === 'www.weav3r.dev') {
        installWeav3rTravelCollector();
        return;
    }

    initialize().catch(error => {
        console.error('[MM CRM] Initialization failed', error);
        alert(`Torn Bazaar Customer CRM failed to initialize: ${error?.message || String(error)}`);
    });
})();