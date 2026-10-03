# MM Bazaar Manager — Live Acceptance

> **SUPERSEDED NON-PRODUCTION REFERENCE — 2026-10-02**  
> Owner-directed architecture now splits this module into **MM_Customers** and **MM_Inventory Manager/ROI Tracker**. Do not continue this live gate as the active product gate. Use `../COMMERCIAL_SPLIT_LIVE_ACCEPTANCE.md`. This source remains only for rollback/migration comparison until replacement acceptance.

Status: **NON-PRODUCTION / alpha.1**

## Scope

Bazaar Manager is the **SELL** product in the v8 split. It intentionally contains no acquisition, faction, travel, or BI workflows.

Implemented:
- Shared Core dock launcher using the Bazaar icon/accent.
- Movable main panel using the shared Core panel-position contract.
- Legacy schema-11 compatibility reads for customers, sales, coupons, refunds, subscribers and operations.
- Bazaar sale-log ingestion from Torn User → Log (1226).
- 72-hour explicit sales refresh; no background sales polling.
- Own Bazaar + personal inventory explicit refresh for listing workflow.
- Sell view with current listing quantity/price, personal quantity, own 7d/30d demand, recent sold price, 3-day listing target and LIST/TOP UP/HEALTHY/REVIEW SLOW status.
- Customer RFM-style operational segments from existing sales.
- Legacy SAVE-<player id> coupon compatibility.
- Cashback rules preserved:
  - $50,000+ → $5,000
  - $250,000+ → $10,000
  - $1,000,000+ → $20,000
  - maximum 10% cashback
  - two uses
  - only post-issue purchases
  - 24-hour eligibility window
  - each sale consumed once
- Welcome/coupon and restock messages are copied and routed to Torn Messages; sending remains manual.
- Cashback records are local/pending until the operator explicitly marks them paid.
- Restock subscribers and item-interest filtering.
- Bazaar Manager API key stored only in this userscript's GM storage.

## Static acceptance

- [x] Logic syntax PASS.
- [x] Userscript syntax PASS.
- [x] Bazaar log 1226 extraction fixture.
- [x] Sale → customer totals fixture.
- [x] Legacy coupon code fixture.
- [x] Post-issue / 24-hour cashback qualification fixture.
- [x] Pending → completed refund fixture.
- [x] Bazaar + inventory listing-row fixture.
- [x] Restock subscriber fixture.
- [x] No acquisition/faction/BI code path in Bazaar Manager.

## Live acceptance

- [ ] Install Bazaar Manager alpha.1.
- [ ] Reload authenticated Torn and confirm Bazaar launcher appears in the shared MM dock.
- [ ] Open Bazaar Manager; confirm existing legacy customers/sales/coupons/refunds render without migration/re-keying.
- [ ] Save Bazaar Manager API key.
- [ ] Run **Refresh Sales**; confirm User → Log sales update without duplicates.
- [ ] Run **Refresh Shop**; confirm own Bazaar rows populate.
- [ ] Confirm personal inventory selection populates listing quantity; if Torn rejects the legacy inventory selection, retain Bazaar success and implement the current v2 inventory fallback before acceptance.
- [ ] Confirm Sell listing guidance is based only on selling/history state and contains no acquisition workflow.
- [ ] Prepare one welcome message; verify text is copied and Torn Messages opens, with no automatic send.
- [ ] Mark welcome sent + issue coupon; verify only later Bazaar purchases count.
- [ ] Verify one qualifying cashback creates a pending refund.
- [ ] Open refund profile; verify no money is sent automatically.
- [ ] Mark paid and verify coupon use/redemption persists.
- [ ] Prepare a restock alert from current Bazaar inventory; verify manual send.
- [ ] Drag the Bazaar Manager panel and confirm position persists.
- [ ] Dock/undock the Bazaar icon and confirm its position/order persists.
- [ ] Explicit owner acceptance before retiring legacy Sell/Customers tabs.

## Promotion boundary

Production remains unchanged. Do not retire the legacy Bazaar/customer workflow or promote Bazaar Manager until the live gate passes and the owner explicitly approves it.
