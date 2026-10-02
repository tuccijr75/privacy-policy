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

## Phase 2 — Market Scout
- [x] Extract Weav3r generation watcher; scoped to one visible/open Scout tab and enrich only on generation change.
- [x] Extract Bazaar seller verification with 120s snapshot freshness gate; mocked acceptance PASS, live pending.
- [x] Extract Item Market opportunities and exact price-sorted routing; mocked acceptance PASS, live pending.
- [x] Extract ROI/profit/sell-through ranking; parity fixture PASS.
- [x] Move TornW3B Travel stock/profit capture + acquisition ranking here; heavy forecast/YATA analytics deferred to BI.
- [x] Verify one-action routing and seller fallback in mocked harness; live browser acceptance pending.

## Phase 3 — Faction Armory
- [x] Extract nine inventory categories.
- [x] Extract member readiness request/reply workflow.
- [x] Extract build engine/current-vs-target comparison.
- [x] Extract minimums/war reserve proposal.
- [x] Extract leadership workbook/reporting.

## Phase 4 — Bazaar Manager
- [x] Extract sales/Bazaar/listing workflow.
- [x] Extract customers/restock alerts/coupons/refunds.
- [x] Remove acquisition/faction/BI code paths.

## Phase 5 — Business Intelligence
- [ ] Extract summary analytics.
- [ ] Extract financial workbook/CSV exports.
- [ ] Keep BI read-mostly.

## Final acceptance
- [ ] SELL only needs Bazaar Manager + Core.
- [ ] BUY only needs Market Scout + Core.
- [ ] EQUIP only needs Faction Armory + Core.
- [ ] ANALYZE only needs BI + Core.
- [ ] No duplicate normal sync controls.
- [ ] No cross-product failure disables unrelated products.
- [ ] Live Chrome/Opera acceptance completed.
- [ ] Explicit production promotion approval.


## Market Scout live gate
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


## Bazaar Manager live gate
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
