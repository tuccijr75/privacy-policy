# v8 Migration Gate

## Phase 0 — frozen baseline
- [x] v7.5.3 identified as migration source.
- [x] Production branch left untouched.
- [x] v8 non-production branch created.
- [x] Modular architecture approved.
- [x] Record current v7.5.3 static harness outputs on v8 branch.

## Phase 1 — Core
- [x] Define Core request/data contracts.
- [x] Compatibility-read v7.5.3 IndexedDB state without creating/upgrading it.
- [x] Preserve customers/sales/coupons/refunds/acquisitions through sequential domain-write fixture.
- [x] Preserve market/travel/faction/member/build state through sequential domain-write fixture.
- [x] Prove domain-slice merges preserve unrelated state; live IndexedDB write idempotence remains in browser gate.
- [x] Prove Core has no automatic page-load network/timer activity.
- [x] Define credential boundary: per-tool GM storage; no shared plaintext key in page storage.

- [x] Add freshness observability for market/travel/faction source timestamps.
- [x] Add atomic domain-scoped write contract that preserves unrelated fresh state.
- [ ] Validate Core against the real v7.5.3 IndexedDB in live browser acceptance.

## Phase 2 — Acquisition engine
- [x] Extract Weav3r generation watcher; scoped to one visible/open acquisition tab and enrich only on generation change.
- [x] Extract Bazaar seller verification with 120s snapshot freshness gate; mocked acceptance PASS, live pending.
- [x] Extract Item Market opportunities and exact price-sorted routing; mocked acceptance PASS, live pending.
- [x] Extract ROI/profit/sell-through ranking; parity fixture PASS.
- [x] Move TornW3B Travel stock/profit capture + acquisition ranking here; heavy forecast/YATA analytics deferred to BI.
- [x] Verify one-action routing and seller fallback in mocked harness; live browser acceptance pending.
- [x] Promote the non-production acquisition engine into dedicated **MM_Acquisitions** without duplicating the engine.
- [x] Add explicit Item Market/Bazaar purchase-log synchronization into the shared acquisition ledger.

## Phase 3 — Faction Armory
- [x] Extract nine inventory categories.
- [x] Extract member readiness request/reply workflow.
- [x] Extract build engine/current-vs-target comparison.
- [x] Extract minimums/war reserve proposal.
- [x] Extract leadership workbook/reporting.

## Phase 4 — Commercial split
- [x] Extract **MM_Customers** from customer/restock/coupon/refund behavior.
- [x] Extract **MM_Inventory Manager/ROI Tracker** from own Bazaar/inventory/listing behavior.
- [x] Keep customer state and inventory/ROI operational state isolated inside the shared Bazaar domain.
- [x] Reuse `procurement.acquisitions` as the FIFO cost-basis source instead of creating a second purchase ledger.
- [x] Remove acquisition/faction/BI workflows from both commercial scripts.
- [x] Retain MM Bazaar Manager only as a non-production rollback reference until live acceptance.

## Phase 5 — Business Intelligence
- [ ] Extract summary analytics.
- [ ] Extract financial workbook/CSV exports.
- [ ] Keep BI read-mostly.

## Final acceptance
- [ ] CUSTOMER only needs MM_Customers + Core.
- [ ] BUY only needs MM_Acquisitions + Core.
- [ ] STOCK / LIST / SKU ROI only needs MM_Inventory Manager/ROI Tracker + Core.
- [ ] EQUIP only needs Faction Armory + Core.
- [ ] ANALYZE only needs BI + Core.
- [ ] No duplicate normal sync controls.
- [ ] No cross-product failure disables unrelated products.
- [ ] Live Chrome/Opera acceptance completed.
- [ ] Explicit production promotion approval.


## Superseded Market Scout live gate (reference only)
- [x] Tampermonkey installer interception confirmed for MM Market Scout v8.0.0-alpha.5.
- [ ] Human clicks Install in Tampermonkey.
- [ ] Reload authenticated Torn page and confirm Scout launcher appears.
- [ ] Open Scout and verify cached data loads from schema 11 IndexedDB.
- [ ] Verify Settings API-key isolation and shared-rule editing.
- [ ] Run Refresh Opportunities and confirm Weav3r + bounded Torn Item Market refresh.
- [ ] Verify at least one live Bazaar seller route.
- [ ] Verify one stale/gone/over-ceiling seller falls through safely.
- [ ] Verify Item Market fallback route.
- [ ] Run Update Travel and confirm direct refresh or browser-capture fallback.
- [ ] Confirm closing Scout stops scoped Weav watcher.


## Faction Armory live gate
- [x] Static syntax + pure logic acceptance PASS.
- [x] Nine category extraction implemented.
- [x] Member API import + encrypted local vault implemented.
- [x] Structured message reply import implemented.
- [x] No-downgrade current-vs-faction-stock build comparison implemented.
- [x] Provisional minimums methodology implemented (20-member routine pool = 7; upper/war band = 11).
- [x] Excel-compatible leadership workbook export implemented.
- [ ] Human clicks Install in Tampermonkey.
- [ ] Reload authenticated Torn page and confirm Armory launcher appears.
- [ ] Open Armory and verify cached faction/member data renders correctly.
- [ ] Verify desktop/mobile layout.
- [ ] Save faction API key and run Refresh Faction.
- [ ] Verify one saved member key refresh and one structured reply import.
- [ ] Verify live build decisions preserve stronger current gear.
- [ ] Export and open Leadership Excel workbook.
- [ ] Explicit owner acceptance before legacy faction workflow retirement.


## Superseded Bazaar Manager live gate (reference only)
- [x] Static syntax + pure logic acceptance PASS.
- [x] Sales/Bazaar/listing workflow extracted.
- [x] Customers/restock/coupons/refunds extracted.
- [x] Acquisition/faction/BI paths excluded from the new script.
- [x] Shared Core dock + movable panel integration implemented.
- [x] API key isolated in Bazaar Manager GM storage.
- [ ] Human installs Bazaar Manager alpha.1 in Tampermonkey.
- [ ] Reload Torn and confirm Bazaar launcher appears in shared bottom dock.
- [ ] Open Bazaar Manager and confirm legacy customers/sales/coupons/refunds render from schema 11.
- [ ] Save Bazaar Manager API key and run Refresh Sales.
- [ ] Run Refresh Shop and confirm Bazaar + personal inventory rows populate.
- [ ] Verify Sell view shows listing guidance without Market Scout/procurement UI.
- [ ] Verify one customer welcome/coupon workflow routes to Torn Messages and does not auto-send.
- [ ] Verify coupon qualification only counts post-issue purchases inside the 24-hour window.
- [ ] Verify pending cashback opens the member profile and only changes to paid after explicit Mark Paid.
- [ ] Verify Restock alert uses current Bazaar inventory and remains manual-send.
- [ ] Verify draggable panel and shared dock behavior.
- [ ] Explicit owner acceptance before legacy Sell/Customers workflow retirement.


## Three-script commercial split static gate
- [x] MM_Customers logic syntax PASS.
- [x] MM_Customers userscript syntax PASS.
- [x] Customer sale import / coupon / cashback / restock fixture PASS.
- [x] MM_Acquisitions ranking logic syntax PASS.
- [x] MM_Acquisitions live-service syntax PASS.
- [x] MM_Acquisitions userscript syntax PASS.
- [x] Purchase-log parser + duplicate suppression fixture PASS.
- [x] MM_Inventory Manager/ROI Tracker logic syntax PASS.
- [x] MM_Inventory Manager/ROI Tracker userscript syntax PASS.
- [x] FIFO remaining cost / current ROI / 30-day realized ROI fixture PASS.
- [x] Customers contains no Sell/Inventory workflow.
- [x] Inventory/ROI contains no customer/coupon/refund/acquisition-purchase workflow.
- [x] Acquisitions uses a distinct launcher identity and script-scoped credential namespace.
- [x] Superseded Bazaar Manager / Market Scout source retained for rollback; production unchanged.

## Three-script commercial split live gate

### MM_Customers
- [ ] Install MM_Customers alpha.1 in Tampermonkey.
- [ ] Confirm Customers launcher is independent in the shared MM dock and panel is movable.
- [ ] Confirm existing customers/sales/coupons/refunds render from schema 11.
- [ ] Save Customers API key and run Refresh Sales.
- [ ] Verify one welcome/coupon workflow remains manual-send.
- [ ] Verify post-issue / 24-hour / two-use cashback behavior.
- [ ] Verify restock alert reads the latest Inventory/ROI Bazaar snapshot and remains manual-send.

### MM_Acquisitions
- [ ] Install MM_Acquisitions alpha.1 in Tampermonkey.
- [ ] Confirm Acquisitions launcher is independent in the shared MM dock and panel is movable.
- [ ] Save Acquisitions API key.
- [ ] Run Sync Purchases; confirm Item Market/Bazaar lots populate without duplicates.
- [ ] Refresh Opportunities and verify Bazaar live seller route.
- [ ] Verify stale/gone/over-ceiling Bazaar result falls through safely.
- [ ] Verify exact Item Market fallback route.
- [ ] Verify Travel acquisition refresh/capture.
- [ ] Confirm no purchase is automatically submitted and Weav3r watcher stops when closed.

### MM_Inventory Manager/ROI Tracker
- [ ] Install MM_Inventory Manager/ROI Tracker alpha.1 in Tampermonkey.
- [ ] Confirm Inventory/ROI launcher is independent in the shared MM dock and panel is movable.
- [ ] Save Inventory/ROI API key; run Refresh Sales and Refresh Shop.
- [ ] Confirm current Bazaar quantity/price and personal inventory populate.
- [ ] Confirm listing targets and sales velocity render.
- [ ] After MM_Acquisitions Sync Purchases, confirm FIFO average cost appears.
- [ ] Confirm current ROI, 30-day gross profit, realized ROI and cost-coverage values are plausible.
- [ ] Confirm Inventory/ROI refresh does not create/modify customer CRM records.
- [ ] Confirm Customers restock workflow sees this module's current Bazaar snapshot.

### Retirement boundary
- [ ] Explicit owner acceptance of all three replacement scripts.
- [ ] Only then retire non-production Bazaar Manager / Market Scout and later remove legacy monolith equivalents.
