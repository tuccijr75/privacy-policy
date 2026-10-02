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
- [ ] Preserve customers/sales/coupons/refunds/acquisitions.
- [ ] Preserve market/travel/faction/member/build state.
- [ ] Prove migration idempotence.
- [x] Prove Core has no automatic page-load network/timer activity.
- [x] Define credential boundary: per-tool GM storage; no shared plaintext key in page storage.

- [x] Add freshness observability for market/travel/faction source timestamps.
- [x] Add atomic domain-scoped write contract that preserves unrelated fresh state.
- [ ] Validate Core against the real v7.5.3 IndexedDB in live browser acceptance.

## Phase 2 — Market Scout
- [ ] Extract Weav3r generation watcher.
- [ ] Extract Bazaar seller verification.
- [ ] Extract Item Market opportunities.
- [ ] Extract ROI/profit/sell-through ranking.
- [ ] Move Travel acquisition intelligence here.
- [ ] Verify one-action routing and seller fallback.

## Phase 3 — Faction Armory
- [ ] Extract nine inventory categories.
- [ ] Extract member readiness request/reply workflow.
- [ ] Extract build engine/current-vs-target comparison.
- [ ] Extract minimums/war reserve proposal.
- [ ] Extract leadership workbook/reporting.

## Phase 4 — Bazaar Manager
- [ ] Extract sales/Bazaar/listing workflow.
- [ ] Extract customers/restock alerts/coupons/refunds.
- [ ] Remove acquisition/faction/BI code paths.

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
