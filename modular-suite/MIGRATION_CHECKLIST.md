# v8 Migration Gate

## Phase 0 — frozen baseline
- [x] v7.5.3 identified as migration source.
- [x] Production branch left untouched.
- [x] v8 non-production branch created.
- [x] Modular architecture approved.
- [ ] Record current v7.5.3 static harness outputs on v8 branch.

## Phase 1 — Core
- [ ] Define Core request/data contracts.
- [ ] Compatibility-read v7.5.3 IndexedDB/local state.
- [ ] Preserve customers/sales/coupons/refunds/acquisitions.
- [ ] Preserve market/travel/faction/member/build state.
- [ ] Prove migration idempotence.
- [ ] Prove no page-load network activity.
- [ ] Prove secrets are not written to page-readable storage.

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
