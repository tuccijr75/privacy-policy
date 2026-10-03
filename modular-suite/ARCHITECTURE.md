# MM Torn Modular Suite — v8 Architecture

Status: APPROVED / NON-PRODUCTION  
Base: CRM v7.5.3  
Source branch: `crm-v8-modular-suite`  
Production remains unchanged.

## Product boundary

The monolithic CRM is frozen as the migration source. Operator workflows are split by responsibility:

1. **MM Torn Core** — shared data/API/storage contracts; no normal operational UI.
2. **MM_Customers** — customer history, coupons, cashback, restock subscriptions and manual customer messaging.
3. **MM_Acquisitions** — Bazaar + Item Market + Travel acquisition, live verification, ROI/sell-through ranking and acquisition-ledger synchronization.
4. **MM_Inventory Manager/ROI Tracker** — own Bazaar/personal inventory, listing targets, sales velocity, FIFO cost basis and realized/current ROI.
5. **MM Faction Armory** — faction inventory, member readiness, builds, minimums, loans and leadership reporting.
6. **MM Business Intelligence** — portfolio/business analytics, finance and exports beyond the operational SKU ROI tracker.

The non-production **MM Bazaar Manager alpha.1** and **MM Market Scout alpha.8** are retained only as rollback/migration references. Bazaar Manager is superseded by MM_Customers + MM_Inventory Manager/ROI Tracker. Market Scout is superseded by MM_Acquisitions.

## Operator intents

- CUSTOMER -> MM_Customers
- BUY -> MM_Acquisitions
- STOCK / LIST / SKU ROI -> MM_Inventory Manager/ROI Tracker
- EQUIP -> MM Faction Armory
- ANALYZE -> MM Business Intelligence

A sale has two owners by concern: Inventory/ROI owns stock/listing/SKU economics; Customers owns the post-sale customer relationship.

## Runtime rule

A tool may execute heavy domain work only when that tool is opened or explicitly refreshed. Ordinary Torn page load remains lightweight.

Core owns:
- schema/migrations;
- shared IndexedDB state;
- source freshness metadata;
- domain-scoped atomic updates;
- common navigation/helpers;
- shared dock and movable-panel contracts;
- version/update contracts.

Domain tools own:
- their UI;
- their calculations;
- their explicit actions;
- domain-specific refresh plans;
- their own script-scoped Torn API credential where required.

## Shared state

The existing CRM database remains the migration source of truth. Migration is additive: existing customers, sales, coupons, refunds, acquisitions, market history, travel history, faction snapshots, member readiness, builds, settings and historical records are not rebuilt or re-keyed unless a later migration explicitly proves that necessary.

Canonical record classes include:
- Item
- Acquisition
- Sale
- Customer
- MarketObservation
- TravelObservation
- FactionMember
- FactionInventoryItem
- MemberBuild
- BusinessRules
- FreshnessState

### Ownership within shared state

**MM_Customers**
- writes customer/sales/coupon/refund/subscriber state through the Core Bazaar domain;
- refreshes Bazaar sale log 1226 on explicit request;
- reads current Bazaar listings from the Inventory/ROI operational snapshot for restock messages;
- does not acquire items or calculate acquisition ROI.

**MM_Acquisitions**
- writes procurement/market/travel state through the Core Market domain;
- owns live acquisition discovery and routing;
- owns purchase-log synchronization into `procurement.acquisitions`;
- purchase logs 1112 (Item Market) and 1225 (Bazaar) feed the shared acquisition cost ledger.

**MM_Inventory Manager/ROI Tracker**
- writes its listing/inventory operational snapshot under `operations.inventoryRoi`;
- may refresh sale log 1226 to obtain item-level revenue but does not recalculate or manage customers;
- reads `procurement.acquisitions` for FIFO cost basis;
- calculates current SKU ROI and realized matched-cost ROI;
- never performs acquisition purchasing.

## Secret boundary

Tampermonkey GM storage is script-scoped. Raw Torn API keys are not copied into page-readable localStorage/IndexedDB merely to make modules share them.

Each domain userscript therefore keeps only the credential it needs in its own Tampermonkey GM storage. Core centralizes contracts/helpers but does not create a cross-script plaintext credential store.

## Refresh doctrine

Normal workflow:
`task -> action -> result`

Data workflow:
`need data -> current cache? -> use it`
`                      -> stale? -> refresh source -> cache -> use it`

Manual Sync buttons are exception controls, not prerequisites. Each source has a clear operational owner.

- MM_Acquisitions owns market/travel refresh and purchase-ledger sync.
- MM_Inventory Manager/ROI Tracker owns own-Bazaar/personal-inventory refresh and listing guidance.
- MM_Customers owns explicit customer sale-history refresh.
- Faction refresh is owned by Faction Armory.
- BI reads shared state and does not trigger broad operational sync by default.

## Migration sequence

Phase 0 — freeze
- No new monolith features except migration-critical fixes.
- Preserve v7.5.3 as the reference behavior.

Phase 1 — Core
- Define contracts and compatibility reader.
- Prove zero-loss read/write behavior and domain isolation.

Phase 2 — acquisition extraction
- Market Scout established the verified acquisition engine.
- MM_Acquisitions becomes the active non-production acquisition product and adds explicit purchase-ledger sync.

Phase 3 — Faction Armory
- Extract faction inventory/readiness/build/minimum/reporting workflows.

Phase 4 — commercial split
- MM_Customers extracts customer/coupon/cashback/restock workflows.
- MM_Inventory Manager/ROI Tracker extracts inventory/listing/SKU economics.
- MM Bazaar Manager is retained only until live acceptance of both replacements.

Phase 5 — Business Intelligence
- Extract broader reports and financial exports.
- BI remains read-mostly and never becomes a prerequisite for operational workflows.

Phase 6 — retire superseded modules/monolith
- Run data-preservation/static/live acceptance.
- Explicit owner approval before changing published production URLs or retiring legacy/superseded scripts.

## Definition of done

The suite is accepted when:
- customer work is isolated to MM_Customers;
- acquisition work is isolated to MM_Acquisitions;
- stock/listing/SKU ROI work is isolated to MM_Inventory Manager/ROI Tracker;
- faction readiness is isolated to MM Faction Armory;
- broader analysis/export is isolated to MM Business Intelligence;
- no normal page load starts heavy cross-domain work;
- one module can fail without disabling unrelated modules;
- shared data remains compatible and preserved;
- live browser acceptance passes;
- production promotion receives explicit owner approval.
