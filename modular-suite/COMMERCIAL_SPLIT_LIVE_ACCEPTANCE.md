# Three-Script Commercial Split — Live Acceptance

Status: **NON-PRODUCTION / alpha.1**  
Owner-directed split: **MM_Customers + MM_Acquisitions + MM_Inventory Manager/ROI Tracker**

## Boundary

This replaces the non-production MM Bazaar Manager / MM Market Scout product naming and responsibility model without changing production.

- **MM_Customers** owns customer history, coupons, cashback, restock subscriptions and manual customer communications.
- **MM_Acquisitions** owns Bazaar / Item Market / Travel opportunity discovery, verification/routing and the acquisition cost ledger.
- **MM_Inventory Manager/ROI Tracker** owns own Bazaar/personal inventory, listing guidance, sales velocity, FIFO cost basis and SKU ROI.
- **MM Faction Armory** remains separate.
- **MM Business Intelligence** remains the later broader analytics/export product.
- **MM Torn Core** remains the shared contract/storage/dock dependency.

No script auto-sends Torn messages, auto-transfers money, or auto-submits a purchase.

## Data contract

The existing schema-11 CRM state remains authoritative.

- Customer state is not re-keyed.
- Existing `procurement.acquisitions` is the shared purchase/cost ledger.
- MM_Acquisitions synchronizes Torn purchase logs 1112 (Item Market) and 1225 (Bazaar) into that ledger with duplicate suppression.
- MM_Inventory Manager/ROI Tracker reads the acquisition ledger and item-level sales for FIFO ROI.
- Inventory/ROI writes its current shop snapshot under `operations.inventoryRoi`.
- MM_Customers uses that current Bazaar snapshot for restock alerts while owning customer/coupon/refund/subscriber mutations.
- Each userscript keeps its own Torn API credential in script-scoped Tampermonkey GM storage.

## Static gate

PASS:
- all three userscripts compile;
- all supporting logic/live files compile;
- customer sale/coupon/cashback/restock fixture;
- purchase-log parsing + duplicate suppression fixture;
- FIFO remaining cost, current ROI, 30-day gross profit, realized ROI and cost-coverage fixture;
- distinct launcher IDs / panel position keys / API-key namespaces;
- no acquisition-purchase workflow in Inventory/ROI;
- no inventory/listing workflow in Customers.

## Live order

Before testing, disable the installed non-production **MM Bazaar Manager** and **MM Market Scout** userscripts in Tampermonkey. Keep their source files in the branch for rollback; disabling them prevents duplicate launchers, refresh controls and Weav3r watchers during replacement acceptance.

Run in this order so ROI has cost data before evaluation:

1. Install **MM_Acquisitions alpha.1**.
2. Save its Torn API key and run **Sync Purchases**.
3. Run **Refresh Opportunities** and verify Bazaar / Item Market / Travel routing behavior.
4. Install **MM_Inventory Manager/ROI Tracker alpha.1**.
5. Save its Torn API key, then **Refresh Sales** and **Refresh Shop**.
6. Verify quantities, listing guidance, FIFO cost basis, current ROI and 30-day realized ROI.
7. Install **MM_Customers alpha.1**.
8. Save its Torn API key and **Refresh Sales**.
9. Verify existing customers/coupons/refunds, one welcome/coupon flow, one cashback flow and one restock alert.
10. Verify all three dock launchers can independently move/dock and all three panels can independently move/reset.

## Live progress — 2026-10-03

Confirmed on an authenticated Torn page while traveling:
- [x] MM_Acquisitions launcher injected.
- [x] MM_Inventory Manager/ROI Tracker launcher injected.
- [x] MM_Customers launcher injected.
- [x] MM Faction Armory continued to coexist.
- [x] Disabled MM Bazaar Manager, MM Market Scout, and legacy CRM launchers were absent.
- [x] Replacement launchers load outside the Torn home page.
- [ ] MM_Acquisitions panel open/state inspection.
- [ ] MM_Acquisitions Sync Purchases.
- [ ] MM_Acquisitions opportunity/routing checks.
- [ ] MM_Inventory Manager/ROI Tracker panel/data checks.
- [ ] MM_Customers panel/data/workflow checks.
- [ ] Dock/undock + panel movement acceptance.

## Acceptance invariants

- A module failure does not disable the other two.
- No duplicate sale records are created by Customers and Inventory/ROI refreshing the same 1226 log data.
- Inventory/ROI refresh does not recalculate/create customer CRM records.
- Acquisition purchase-log sync does not delete manual/travel/direct-trade acquisition lots.
- FIFO ROI reports cost coverage when sales exceed known purchase history rather than pretending unknown cost is zero.
- Restock alerts use current Bazaar state and remain manual-send.
- Verify & Buy only routes after live verification; it does not submit a Torn purchase.
- Existing legacy data remains readable and unchanged outside the explicit domain update.

## Promotion boundary

Do not retire the legacy monolith, MM Bazaar Manager, or MM Market Scout until the three replacement scripts pass live acceptance and the owner explicitly approves retirement/promotion.
