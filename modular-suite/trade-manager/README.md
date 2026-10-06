# MM Trade Manager

**Status:** non-production foundation candidate  
**Version:** `0.1.0-alpha.3`  
**Responsibility:** `TRADE / VALUE / RECORD`

MM Trade Manager is a separate operational product from **MM Trade Chat Assistant**. Trade Chat Assistant remains responsible for trade-chat/forum messaging. Trade Manager is responsible for direct trade contents, valuation, completed-trade records, margin context, and inventory reconciliation handoff.

## Evidence boundary

Trade state comes from Torn API v2 only:

- `GET /user/trades?cat=ongoing` — read current trades;
- `GET /user/trades?cat=finished` — discover completed trades;
- `GET /user/{tradeId}/trade` — detailed trade contents.

A trade is recordable only when the detailed API payload contains a real `completed_at` timestamp. Navigation, DOM state, item movement, chat text, or a remembered/open trade ID never proves completion.

The API trade ID is treated as its own identifier. Trade Manager does not construct Torn trade-page URLs from it.

## Shared-state ownership

Trade Manager writes only through Core's Bazaar-domain `operations` path:

- `operations.tradeManager.trades` — bounded confirmed history (max 250);
- `operations.tradeManager.conflicts` — bounded duplicate-ID/content conflicts;
- `operations.inventoryRoi.tradeReconciliation` — bounded pending confirmed item-movement handoff (max 250).

The reconciliation handoff does **not** directly mutate Inventory Manager's live personal-inventory or Bazaar snapshots. Each item effect carries an explicit cost-basis handoff: outgoing items retain FIFO basis captured at trade sync; incoming items receive a residual-consideration basis only when full outgoing FIFO coverage and fresh received-item reference values make that allocation supportable. Otherwise inbound basis is marked unknown. This avoids both double-counting and fabricated costs.

## Valuation

Trade Manager consumes existing shared evidence; it does not collect market data.

Evidence order:

1. fresh MM_Acquisitions Market Pulse floor;
2. fresh shared Torn Item Market snapshot;
3. fresh shared Bazaar aggregate;
4. otherwise value is unavailable.

Each item retains source, provider/source timestamp, local fetch timestamp, freshness status, confidence/liquidity when available, and the valuation timestamp.

Outgoing item cost uses MM Inventory Manager's current FIFO remaining-lot calculation. This is explicitly current cost-basis evidence, not a fabricated historical snapshot.

Margin labels:

- `REALIZED_CASH_VS_CURRENT_FIFO` — received side is cash-only and FIFO coverage is complete;
- `ESTIMATED_MIXED_REFERENCE` — received items require fresh market reference values;
- `UNAVAILABLE` — stale/missing market evidence, incomplete FIFO coverage, or unsupported non-item trade assets.

Dedicated Ranked War item provenance is deferred from this foundation.

## Manual boundary

Trade Manager never:

- accepts or confirms a trade;
- finalizes or cancels a trade;
- transfers money/items;
- clicks Torn trade controls;
- infers completion from UI/navigation;
- scrapes trade pages as a substitute for official API evidence;
- creates a second inventory database or market collector.

## Runtime doctrine

No trade API requests run on ordinary Torn page load. Opening the panel reads shared state only. Network work happens only after **Refresh Live Trades**, **Inspect**, or **Sync Completed**.

`Sync Completed` fetches at most 12 previously unrecorded detailed trades per manual run, records only API-confirmed completions, and is idempotent for an unchanged trade ID/fingerprint. Conflicting content under an already-recorded ID is retained as a conflict instead of silently overwriting history.

## Open acceptance gates

- desktop live API acceptance with a real ongoing trade;
- completed-trade import and duplicate re-sync;
- stale market evidence behavior with live state;
- Inventory reconciliation consumer integration;
- narrow/mobile layout;
- TornPDA self-contained bundle/device acceptance;
- shared dock order decision during integrated workflow acceptance.

No stable/customer publication is authorized by this foundation.

## TornPDA

TornPDA uses a self-contained `0.1.0-alpha.3-pda.2` bundle. The bundle:

- uses lexical `PDA_storage` for durable shared state;
- uses `PDA_httpGet` only as a thin GET fallback when the runtime does not provide `GM_xmlhttpRequest`;
- keeps the injected PDA API key lexical and does not expose it on `globalThis`;
- uses a PDA-safe launcher above native bottom chrome;
- bundles exact read-only snapshots of Core from immutable commit `b6d2202ad507c6b138919e2d37e461cfc422b382` and trade-aware Inventory FIFO logic from immutable commit `bb32ea39494ef4465a58acd76c4c3993cc8568b4`, matching the desktop dependencies.

The vendored Core/FIFO files are PDA packaging artifacts, not second mutable sources of shared contracts or Inventory truth.
