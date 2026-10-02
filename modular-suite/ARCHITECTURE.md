# MM Torn Modular Suite — v8 Architecture

Status: APPROVED / NON-PRODUCTION
Base: CRM v7.5.3
Source branch: crm-v8-modular-suite
Production remains unchanged.

## Product boundary

The monolithic CRM is frozen as the migration source. New work is split by operator intent:

1. MM Torn Core — shared data/API/storage contracts; no normal operational UI.
2. MM Bazaar Manager — sell, list, customers, coupons, refunds, restock notifications.
3. MM Market Scout — Bazaar + Item Market + travel acquisition, ROI, sell-through, one-click verified routing.
4. MM Faction Armory — faction inventory, member readiness, builds, minimums, loans, leadership reporting.
5. MM Business Intelligence — revenue, COGS, gross profit, ROI/GMROI, dead capital, demand, exports.

Communications remain inside Bazaar Manager and Faction Armory until duplication justifies extraction.

## Runtime rule

A tool may only execute heavy domain work when that tool is opened or explicitly refreshed. Ordinary Torn page load must remain lightweight.

Core owns:
- schema/migrations;
- shared IndexedDB state;
- source freshness metadata;
- Torn API access/key handling;
- market/item/player caches;
- cross-tab coordination;
- common navigation/helpers;
- version/update contracts.

Domain tools own:
- their UI;
- their calculations;
- their explicit actions;
- domain-specific refresh plans.

## Shared state

The existing CRM database is the migration source of truth. Migration is additive: existing customers, sales, coupons, refunds, acquisitions, market history, travel history, faction snapshots, member readiness, builds, settings and historical records are not rebuilt or re-keyed unless a later migration explicitly proves that necessary.

Canonical record classes:
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

## Secret boundary

Tampermonkey GM storage is script-scoped. API keys must not be copied into Torn page localStorage/IndexedDB merely to make modules share them.

v8 therefore treats Core as the credential/API boundary. Domain scripts must consume approved Core data/services and must never expose or persist the raw Torn API key in page-readable storage.

If the Core broker cannot be proven safe/reliable across Tampermonkey sandboxes, the fallback is per-tool credential storage, not insecure shared plaintext storage.

## Refresh doctrine

Normal workflow:
task -> action -> result

Data workflow:
need data -> current cache? -> use it
                      -> stale? -> refresh source -> cache -> use it

Manual Sync buttons are exceptions, not prerequisites. Each source has one owner and one freshness state.

Weav3r generation changes may trigger bounded market refresh in Market Scout only. Faction refresh is owned by Faction Armory. Sales/Bazaar state is owned by Bazaar Manager. BI reads shared state and does not trigger broad operational sync by default.

## Migration sequence

Phase 0 — freeze
- No new monolith features except migration-critical fixes.
- Preserve v7.5.3 as the reference behavior.

Phase 1 — Core
- Define contracts.
- Add compatibility reader for v7.5.3 state.
- Prove zero-loss read/write round trip.
- Add observability for source freshness and migration version.

Phase 2 — Market Scout
- Extract acquisition ranking, Weav3r, Item Market, travel buying and verified routing.
- Acceptance: top opportunities route correctly; no above-ceiling buy; stale seller falls through; travel is acquisition-only.

Phase 3 — Faction Armory
- Extract all faction categories, member readiness, API-free request/reply flow, build comparison, minimums and leadership exports.
- Acceptance: current gear cannot be downgraded automatically; missing/unknown gear becomes REVIEW; faction stock affects fulfillment, not target quality.

Phase 4 — Bazaar Manager
- Reduce CRM to sell/list/customer operations.
- Acceptance: current Bazaar inventory -> pricing/listing -> sale/customer workflow without procurement/faction/reporting clutter.

Phase 5 — Business Intelligence
- Extract reports and financial exports.
- BI is read-mostly and never becomes a prerequisite for operational workflows.

Phase 6 — retire monolith
- Run parity/data-preservation harness.
- Live browser acceptance for all four tools.
- Explicit production approval before changing published production URLs.

## Definition of done

SELL -> Bazaar Manager
BUY -> Market Scout
EQUIP -> Faction Armory
ANALYZE -> Business Intelligence

Each visible product opens to one primary task view, has no redundant sync path, and can fail independently without disabling unrelated workflows.
