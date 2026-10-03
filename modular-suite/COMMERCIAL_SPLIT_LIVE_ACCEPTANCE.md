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

## Live quality rubric

Every replacement module must be evaluated on four dimensions, not just whether controls execute:

1. **Functional correctness** — actions complete, data is accurate/current enough, state is preserved, and failures are safe.
2. **Usability / friction** — the normal task should be obvious, require the fewest practical clicks, avoid redundant sync/reload controls, and explain stale/error states in plain language.
3. **Job effectiveness** — the module must materially accomplish its declared job (for example, Acquisitions must surface actionable profitable purchases, not merely display market data).
4. **Coverage / missing features** — record missing information, controls, automation, routing, filters, diagnostics, or workflow steps that materially improve the job. A feature being present does not count as a pass if it is confusing, low-value, or produces weak recommendations.

For each live module classify findings as **PASS**, **DEFECT**, **UX FRICTION**, **EFFECTIVENESS GAP**, or **MISSING FEATURE**. Customer-visible changes remain a separate implementation/approval step unless they are required to repair a blocking defect.

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

### MM_Acquisitions initial product/UX findings
- **PASS** — panel opens on an authenticated Torn page while traveling and exposes Deals / Travel / Settings.
- **PASS** — source freshness is visible: Weav3r, Item Market, Travel, purchase-ledger age/count, Torn-key state, and watcher state.
- **PASS** — existing purchase ledger is preserved and visible (200 lots at first inspection).
- **UX FRICTION** — three competing maintenance actions are presented together: Reload Cache, Sync Purchases, Refresh Opportunities. This conflicts with the intended task-first workflow and makes the user decide which prerequisite to run.
- **EFFECTIVENESS GAP** — zero buyable deals is shown only as “No current cached opportunity meets the active business rules.” The panel does not identify which rules or evidence rejected candidates, so the user cannot tell whether there are genuinely no profitable deals, data is stale, or thresholds are too restrictive.
- **UX FRICTION** — freshness indicators report ages but do not translate them into a recommended next action (current / stale / refresh needed).
- **PENDING** — inspect the 8 research leads for reject reasons, ranking quality, price freshness, ROI, sell-through evidence, and purchase routing.


### MM_Acquisitions purchase-sync live findings
- **PASS** — Sync Purchases completed without visible error and refreshed purchase freshness to current.
- **PASS** — shared purchase ledger remained intact and is now visibly at 204 lots.
- **PASS** — Item Market freshness updated to seconds-old data and the panel surfaced live Verify & Buy candidates afterward.
- **UX / OBSERVABILITY GAP** — result text reported “0 new lots” while the panel-visible ledger count changed from the stale 200-lot view to 204. This can be logically consistent if the opened panel was stale, but the result needs explicit before/after/current counts so the user is not left reconciling contradictory-looking numbers.
- **EFFECTIVENESS GAP** — current top deals are not capital-aware. Visible Torn cash was about $606k while recommendations required roughly $231M–$900M each. Max-buy exists in Settings, but the primary acquisition workflow does not model or explain available purchasing capital.
- **HIGH-RISK EFFECTIVENESS GAP** — rare collectible recommendations can show extreme market-proxy economics (for example, a $625M buy with a projected $36.48B exit / 5737% ROI and ~65% three-day sell-through). The ranking code derives this from market proxy/depth/history signals and does not require personal sale evidence; these should not be treated as equivalent-confidence “Best Buyable Deals” without stronger liquidity/confidence safeguards.
- **UX FRICTION** — Sync Purchases is primarily a shared cost-ledger maintenance task for downstream ROI accounting, yet it is presented beside the core acquisition action. Consider moving it to maintenance/settings or folding it into a single smart refresh when stale.


### MM_Acquisitions recommendation-model audit
- **DEFECT** — `minSellerCount` is only enforced when Item Market data is *not* fresh. A seconds-old Item Market snapshot can therefore become a “Best Buyable Deal” even with inadequate seller/liquidity depth. Freshness should not bypass the liquidity floor.
- **EFFECTIVENESS GAP** — the displayed “3d sell-through” MARKET PROXY is not a true demand model. Its `marketDepthSignal` increases when more quantity is listed near the lowest price, so greater supply depth can increase the displayed sell-through estimate. This can materially overstate conversion for rare/illiquid items.
- **EFFECTIVENESS GAP** — expected 3-day profit inherits the market-proxy sell-through estimate and the highest modeled exit route, so extreme collectible opportunities can show very large projected profit with insufficient demand evidence.
- **MISSING FEATURE** — buyable rows do not display the modeled exit route (`Bazaar`, `Trader`, or `Item Market Net`) or the computed confidence score even though both exist in the model. The user cannot see what the ROI assumption depends on.
- **MISSING FEATURE** — no minimum confidence/liquidity gate separates speculative research from “Best Buyable Deals.”
- **EFFECTIVENESS GAP** — explicit Refresh Opportunities currently enriches only 8 candidates and live-refreshes Item Market for only 6, leaving the procurement surface much shorter than the desired broad deal list.
- **UX DEFECT** — some runtime error strings still refer to “Market Scout” instead of MM_Acquisitions, a migration carryover that will confuse troubleshooting.
- **MISSING FEATURE** — no capital budget / total-spend constraint is part of ranking. The existing Max buy rule is only a per-unit ceiling and is not tied to currently usable funds or a user-defined procurement budget.


### MM_Acquisitions Settings live findings
Current visible settings at inspection:
- Min ROI: 10%
- Min demand/day: 0.15
- Min buy: $2
- Max buy: $5,000,000
- Min profit/unit: $5,000
- Min sellers: 0
- Max listing age: 180 seconds

Findings:
- **BLOCKING DEFECT / RULE CONSISTENCY** — the immediately preceding live Deals view showed “Best Buyable Deals” priced roughly $231M–$900M while the same module's visible Max buy rule is $5M. Ranking code explicitly checks `discoveryBuy > rules.maxPrice`, so this inconsistency must be reproduced and resolved before acceptance.
- **EFFECTIVENESS GAP / MISLEADING CONTROL** — Min demand/day is enforced only when the item already has enough personal sale history (`sold30d >= 5` or sale activity on >=3 days). Candidates using MARKET PROXY are not rejected by this threshold, so the UI label suggests broader protection than exists.
- **EFFECTIVENESS GAP** — Min sellers is currently 0, disabling the intended liquidity floor even before accounting for the fresh-Item-Market bypass found in code review.
- **UX FRICTION** — “Max listing age sec” exposes a low-level implementation unit rather than a user-facing freshness choice such as 1m / 3m / 5m.
- **MISSING FEATURE** — no conservative / balanced / aggressive acquisition presets or task-oriented defaults.
- **MISSING FEATURE** — no minimum confidence setting despite the ranking model computing confidence.
- **MISSING FEATURE** — no total procurement budget / per-run spend budget.
- **UX FRICTION / MOBILE** — Settings uses a fixed four-column grid; on narrow mobile widths this is likely unnecessarily compressed and should collapse responsively.

- **MISSING TEST COVERAGE** — no dedicated MM_Acquisitions ranking regression test currently proves that visible `maxPrice`, `minSellerCount`, demand, confidence, and freshness rules exclude inappropriate candidates. Purchase-ledger parsing has tests, but ranking/business-rule enforcement needs its own fixture suite before acceptance.


### MM_Acquisitions rule-consistency recheck
- **PASS (current view)** — after returning to Deals, every displayed Best Buyable Deal is now below the visible $5,000,000 Max buy rule. Current examples ranged from about $69.7k to $3.34M.
- **NOT REPRODUCED AS CURRENT LOGIC FAILURE** — the earlier $231M–$900M results are no longer present. Because Deals and Settings read the same in-memory state, the earlier contradiction is more consistent with stale/replaced state during live auto-refresh than with a persistent maxPrice comparison failure.
- **UX / STATE CONSISTENCY DEFECT** — the module can visibly transition between materially different recommendation sets while its watcher refreshes, without identifying that the prior list was stale or that rules/state were reloaded. Recommendation state needs an explicit “evaluated at / rules version / data generation” marker and should atomically re-rank when shared rules change.
- **UX / LABELING GAP** — “Best Buyable Deals” means rule-qualified, not necessarily affordable with current cash. Current Torn cash was about $606k while two displayed candidates still required about $1.44M and $3.34M. Rename or add affordability/budget status.
- **PASS** — current top list contains lower-priced actionable items again, including sub-$500k candidates, so the engine can surface capital-feasible opportunities when data/rules align.


### MM_Acquisitions Travel live findings
Observed while the player is traveling from Japan to Torn:
- **DEFECT / TRAVEL-STATE GUARD** — the browser is on the exact Christmas Express Item Market route generated by Verify & Buy, but Torn reports “This page is unavailable while you're traveling.” The acquisition router should detect traveling/in-transit state before navigation and defer the purchase route with a clear message instead of sending the user to an unusable Torn page.
- **PASS (routing target)** — the generated Item Market route itself is specific and correct for Christmas Express (`itemID=637`, ascending price search); the problem is missing travel-state gating, not target construction.
- **STALE-DATA DEFECT** — Travel shows “Shared travel state: 15h ago” and “Last browser capture: none,” yet still presents a ranked list without a prominent stale-data block/warning.
- **EFFECTIVENESS GAP** — travel ranking is global by source profit/hour, not trip-aware. The user is returning from Japan to Torn, while the top rows are UAE / Argentina / United Kingdom / South Africa, which are not actionable for the current trip.
- **MISSING FEATURE** — no current-travel context is shown in the module (origin, destination, in-transit/abroad/home state, ETA).
- **MISSING FEATURE** — no current-destination filter or “what should I buy here now?” mode.
- **MISSING FEATURE** — no carrying-capacity / current carried-inventory constraint or recommended quantity per travel item.
- **MISSING FEATURE** — no cash/budget constraint for travel purchasing.
- **MISSING FEATURE** — no total-trip profit estimate or route-level comparison using capacity; only per-item profit and source profit/hour are shown.
- **UX FRICTION** — Travel exposes both Import Capture and Update Travel as separate maintenance actions. The normal user intent is simply “show me fresh travel buys,” so refresh/import fallback should be hidden behind one smart update action.
- **UX / EFFECTIVENESS GAP** — opening Travel does not automatically block stale data or trigger/offer a smart refresh despite data being 15 hours old.
- **MIGRATION CARRYOVER** — imported travel diagnostics still write “Market Scout Travel import,” which should be renamed to MM_Acquisitions.

Current stale ranked examples:
- Ambergris Lump — UAE — stock 1,251 — profit $52,062 — source profit/hr $6,077
- Tribulus Omanense — UAE — stock 5,621 — profit $51,075 — source profit/hr $5,962
- Natural Pearls — UAE — stock 3,120 — profit $49,119 — source profit/hr $5,734
- Monkey Plushie — Argentina — stock 809 — profit $30,200 — source profit/hr $5,734



### MM_Acquisitions Travel refresh result
- **PASS** — Update Travel successfully replaced the 15-hour-old travel state with seconds-old data.
- **PASS** — browser capture and shared travel state timestamps agree, showing the fallback/import path completed coherently.
- **PASS** — rankings materially changed after refresh, demonstrating that stale cached rows were actually replaced rather than merely re-timestamped.
- **PASS** — fresh feed includes current Japan rows while the player is returning from Japan (for example Counterfeit Manga, Whale Meat, Cherry Blossom), confirming broad source coverage.
- **UX / FEEDBACK GAP** — after refresh the persistent status surface reads “Ready.” rather than retaining a concise success summary such as “Travel updated · 20 routes · 18s ago.” The user must infer success from timestamps.
- **EFFECTIVENESS GAP** — refreshed ranking is still global. Shark Fin (Hawaii) ranks #1 while the player is already in transit Japan → Torn; the panel does not distinguish “actionable now,” “relevant to current origin,” and “next-trip opportunity.”
- **EFFECTIVENESS GAP** — Japan items are present but buried (#5 Counterfeit Manga, #16 Whale Meat, #17 Cherry Blossom). A trip-aware mode should have surfaced Japan while the user was still abroad and should now clearly mark all foreign purchases unavailable while in transit.
- **UX FRICTION** — Import Capture remains visible even after Update Travel completed the capture/import pipeline automatically, reinforcing that two controls expose implementation mechanics rather than user intent.
- **MISSING FEATURE** — no visible freshness threshold/state treatment (FRESH / AGING / STALE) despite exact age being available.

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
