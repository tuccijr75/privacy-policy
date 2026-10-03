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


### MM_Inventory Manager/ROI Tracker initial live findings
- **BLOCKING DEFECT — FIXED IN SOURCE** — opening Inventory / ROI rendered `[object Promise]` instead of the inventory view.
- Root cause: `inventoryHtml()` was accidentally declared `async` while `render()` concatenates its return value directly into HTML.
- Source fix: `inventoryHtml()` is synchronous again in MM_Inventory Manager/ROI Tracker v8.0.0-alpha.2.
- Regression coverage added to fail if `inventoryHtml` becomes async again; the userscript source is also syntax-compiled by the fixture.
- Manifest updated to suite 8.0.0-alpha.13 / inventory-roi 8.0.0-alpha.2.
- Source-fix commits: `fc1130a6382f84481aab790c56de10263a6fc570`, `d186769ef1b0ae9adc90e9a41b93ccc3f25b4419`, `be5120d41cee3304106bc1c5b1d5da065420d92a`.
- **PENDING LIVE RECHECK** — installed alpha.1 still contains the defect; reinstall alpha.2 before testing shop refresh, sales refresh, listing guidance, FIFO cost basis, current ROI, realized ROI, and cost coverage.


### MM_Inventory Manager/ROI Tracker alpha.2 baseline recheck
- **PASS** — alpha.2 renders the Inventory / ROI view normally; the prior `[object Promise]` failure is gone.
- **PASS** — shared acquisition ledger is visible at 204 lots after reinstall/update, confirming data preservation across the userscript update.
- **PASS** — pre-existing shared sales remain available; the panel currently computes 30D revenue of $199,919,052 before this module has run its own sales refresh.
- **UX / STATE-LABEL DEFECT** — the header says `sales never` while 30-day sales data is visibly being used. This label means “Inventory/ROI has never refreshed sales,” not “there is no sales data,” and should be renamed to distinguish refresh age from data coverage.
- **EFFECTIVENESS / COVERAGE DEFECT** — `Refresh Sales` only requests the last 72 hours (`SALES_LOOKBACK_MS=72h`) while the product displays 7-day and 30-day velocity, 30-day revenue, 30-day realized profit, and 30-day ROI. On a fresh/clean shared state the module cannot reconstruct its own advertised 30-day metrics. Initial/backfill refresh should cover at least 30 days (preferably with an incremental watermark afterward).
- **EXPECTED PENDING STATE** — Bazaar and personal inventory both show 0 SKUs / shop never until Refresh Shop runs, so item-level listing guidance and FIFO/current ROI cannot yet be accepted.


### MM_Inventory Manager/ROI Tracker Refresh Shop live findings
- **PASS** — Bazaar request and parsing work live while traveling; 12 Bazaar SKUs were loaded.
- **PASS** — FIFO-derived current ROI appears for SKUs with acquisition basis (examples: Macana 11.1%, ATM Key 15.5%, Combat Helmet -9.1%, Invader H3 28.0%).
- **DEFECT / FALSE SUCCESS** — personal Inventory reports `OK` but produces 0 SKUs. Torn's current inventory API may return the string “The inventory selection is no longer available”; the script treats any fulfilled HTTP response as success and passes that non-array value through to an empty parsed inventory.
- **DATA-PRESERVATION DEFECT** — on a semantically unavailable inventory response, the current code writes an empty personal inventory snapshot, potentially erasing a previously useful cached snapshot instead of preserving it and marking it stale/unavailable.
- **EFFECTIVENESS GAP** — stock-health classification has no overstock state. ATM Key is shown HEALTHY at 24 listed and ~0.03 sold/day, despite very high days-of-supply. Current logic labels any positive-demand listing HEALTHY when no top-up is required.
- **EFFECTIVENESS GAP** — target logic uses only a 3-day minimum listing target and does not calculate days-of-supply / excess quantity / markdown priority.
- **CORRECTNESS / SCOPE GAP** — top-level 30D REVENUE is computed from all sales, while 30D GROSS and REALIZED ROI are summed only across IDs currently present in Bazaar/personal inventory rows. Sold-out SKUs are omitted from gross/ROI, so the tiles have inconsistent scope and are not business-wide 30-day profitability.
- **MISSING FEATURE** — no aggregate cost-coverage tile accompanies the realized-profit headline, making partial FIFO coverage easy to misread as complete profitability.
- **UX GAP** — status “Bazaar OK · Inventory OK” reports transport success rather than usable-data success; semantic validation is required.


### MM_Inventory Manager/ROI Tracker Refresh Sales live findings
- **PASS** — live sales refresh completed without visible error: 77 log rows checked, 2 new sales imported, no rejected count shown.
- **PASS** — sales freshness updated immediately from `never` to current.
- **PASS** — shared sales import changed 30D revenue coherently from $199,919,052 to $199,923,150 (+$4,098).
- **PASS** — Inventory/ROI sale import is relationship-neutral: code only inserts sale records plus Inventory/ROI refresh metadata and does not create/recalculate customer, coupon, refund, or subscriber records.
- **CORRECTNESS / SCOPE GAP CONFIRMED LIVE** — 30D gross stayed $52,021 and realized ROI stayed 13.7% while 30D revenue increased. This demonstrates that the three headline metrics can react to different SKU populations / cost-basis coverage and should not be presented as directly comparable business-wide totals without explicit scope/coverage labeling.
- **COVERAGE DEFECT CONFIRMED** — refresh checked only the configured 72-hour lookback even though the module presents 7-day/30-day sales velocity and 30-day profitability. Existing shared history masks this on the current profile, but a fresh state would be incomplete.
- **UX / DIAGNOSTIC GAP** — result messaging gives checked/imported/rejected counts but not the actual coverage window (for example “last 72h”) or oldest/newest fetched sale. The user cannot tell whether 30-day metrics are fully backed by this module's own refresh.
- **PENDING LIVE IDEMPOTENCE** — repeat Refresh Sales once with no intervening sale; expected result is 0 new with the same/near-same checked count.


### MM_Inventory Manager/ROI Tracker live idempotence recheck
- **PASS** — immediate repeat Refresh Sales returned `0 new · 77 checked`.
- **PASS** — 30D revenue remained $199,923,150, 30D gross remained $52,021, realized ROI remained 13.7%, and acquisition lots remained 204.
- **PASS** — no duplicate-sale inflation was observed in the live UI; sales freshness advanced normally.
- **PASS** — live behavior matches the idempotent import contract already covered by logic fixtures.


### MM_Inventory Manager/ROI Tracker Macana item-level reconciliation
Live expanded Macana row:
- Bazaar qty 1
- Bazaar price $99,999
- Personal qty 0 (subject to the known unavailable-inventory defect)
- Sold 7d 2
- Sold 30d 2
- 30d velocity ~0.07/day
- 3D target 1
- Add 0
- Recent avg / plan price $99,999
- FIFO avg cost $89,988
- Current ROI 11.1%
- 30D gross $20,022
- 30D ROI 11.1%
- Cost coverage 100%

Findings:
- **PASS** — current ROI reconciles: ($99,999 - $89,988) / $89,988 ≈ 11.1%.
- **PASS** — two fully cost-covered units at ~$10,011 gross profit/unit reconcile to displayed 30D gross $20,022.
- **PASS** — realized ROI and current ROI are coherent in this case because realized sale price and current/plan price are both $99,999 and FIFO basis is fully covered.
- **SEMANTIC / EFFECTIVENESS DEFECT** — “3D TARGET” is not truly three days of supply for low-volume items. The formula forces `max(1, ceil(daily30*3))` whenever demand is positive. At ~0.07/day, target 1 is roughly 15 days of supply.
- **EFFECTIVENESS GAP** — `HEALTHY` is based on meeting a minimum target, not a bounded days-of-supply range; it therefore cannot distinguish appropriately stocked from materially overstocked slow sellers.
- **EFFECTIVENESS GAP / PRICING** — planned price is the current Bazaar listing price when one exists, otherwise historical average sold price. The inventory/listing module does not compare that price with current market/Bazaar competitors, so “PLAN PRICE” is not yet market-aware listing guidance.


### MM_Inventory Manager/ROI Tracker ATM Key overstock reconciliation
Live expanded ATM Key row:
- Bazaar qty 24 @ $230,999
- Personal qty 0 (subject to known unavailable-inventory defect)
- Sold 7d 1 / sold 30d 1 (~0.033/day)
- 3D target 1
- Add 0
- Recent avg $231,999
- Plan price $230,999
- FIFO avg cost $200,000
- Current ROI 15.5%
- 30D gross $31,999
- 30D ROI 16.0%
- Cost coverage 100%

Findings:
- **PASS** — current ROI reconciles: ($230,999 - $200,000) / $200,000 ≈ 15.5%.
- **PASS** — realized gross/ROI reconcile for the one covered sale: $231,999 - $200,000 = $31,999 gross, or ~16.0% ROI.
- **CONFIRMED EFFECTIVENESS DEFECT** — `HEALTHY` is materially wrong as a stock-health label here. At 1 sale / 30 days, 24 listed units represent about **720 days of supply** using the module's own 30-day velocity.
- **CONFIRMED EFFECTIVENESS DEFECT** — the module's target is 1 while 24 are listed, yet it exposes no excess-stock quantity, days-of-supply, overstock warning, or reduce/reprice action. By its own target, approximately 23 units are above target.
- **UX / DECISION GAP** — ROI is positive, which can visually conflict with the far more important inventory-turn problem. Stock health and margin health need separate labels so “profitable” does not imply “healthy inventory.”
- **PRICING GAP** — current own listing is $1,000 below the recent own-sale average, but no current competitive market context is shown, so the user cannot tell whether repricing would improve turnover without unnecessarily sacrificing margin.


### MM_Inventory Manager/ROI Tracker Combat Helmet reconciliation
Live expanded Combat Helmet row:
- Bazaar qty 1 @ $3,159,999
- Personal qty 0 (subject to known unavailable-inventory defect)
- Sold 7d 0 / sold 30d 0
- 3D target 0
- Add 0
- Recent avg —
- Plan price $3,159,999
- FIFO avg cost $3,475,000
- Current ROI -9.1%
- 30D gross —
- 30D ROI —
- Cost coverage 100%

Findings:
- **PASS** — current ROI reconciles: ($3,159,999 - $3,475,000) / $3,475,000 ≈ -9.1%.
- **PASS** — `REVIEW SLOW` is directionally appropriate for zero 30-day sales.
- **SEMANTIC DEFECT** — COST COVERAGE displays 100% when there are zero sales in the 30-day window. The implementation returns 100% when units=0; this should be N/A/— because there are no realized sales whose cost basis could be covered.
- **MISSING FEATURE** — the row does not surface the unrealized dollar loss (~$315,001) or break-even price, even though both are directly derivable from current listing price and FIFO basis.
- **EFFECTIVENESS GAP** — `REVIEW SLOW` does not distinguish “slow but profitable,” “slow and underwater,” and “no sales history.” These are materially different actions.
- **MISSING FEATURE / EXIT DECISION** — no listing age, acquisition age, current competitor/market price, price trend, or recommended action (hold / reprice / exit) is shown. The user therefore cannot decide whether accepting a loss is rational.
- **MISSING FEATURE** — FIFO remaining-lot age is calculated internally by the logic but is not exposed in the UI; capital-aging/holding-time information is being discarded at presentation time.


### MM_Inventory Manager/ROI Tracker Settings live findings
Observed alpha.2 Settings view:
- Torn API key field
- Save / Clear
- explanatory purpose text
- no inventory/business controls

Findings:
- **PASS** — API key is isolated to the Inventory/ROI userscript's Tampermonkey storage and is visibly described as such.
- **MISSING FEATURE** — no configurable target days of supply / listing horizon. The hard-coded 3-day model cannot be tuned.
- **MISSING FEATURE** — no overstock threshold or maximum days-of-supply setting.
- **MISSING FEATURE** — no minimum acceptable ROI / loss-tolerance / break-even policy for listing recommendations.
- **MISSING FEATURE** — no pricing-strategy control (own historical price vs live market/Bazaar reference, undercut behavior, minimum margin protection).
- **MISSING FEATURE** — no stale-data thresholds for shop, sales, purchase ledger, or market references.
- **MISSING FEATURE** — no initial sales-history/backfill depth or incremental-sync control despite 7d/30d metrics.
- **MISSING FEATURE** — no minimum FIFO cost-coverage requirement before showing realized-profit/ROI headlines.
- **MISSING FEATURE** — no handling preference for unknown cost basis (exclude, estimate, flag only).
- **MISSING FEATURE** — no slow-stock / overstock action thresholds or hold/reprice/exit policy.
- **EFFECTIVENESS GAP** — the module makes inventory-health and pricing judgments using hard-coded rules while exposing no way for the owner to define those rules.
- **CRM-WIDE CONSISTENCY GAP** — this module does not consume/expose a shared rule surface for applicable ROI/price/business thresholds, despite the broader v8 design goal of CRM-wide reusable business rules where applicable.
- **UX GAP** — Settings is simple, but only because nearly all decision controls are absent; the simplicity does not yet support the module's actual job.


### MM_Customers initial live baseline
Observed Customers view on alpha.1:
- 98 customer rows are currently visible from preserved shared sales/customer state.
- Current visible segmentation: 55 NEW, 24 REGULAR, 18 LOYAL, 1 VIP.
- 8 visible customer rows use a numeric Torn ID as the display name because no resolved buyer name is present.
- Existing high-value/repeat examples are preserved, including a LOYAL customer with $117,500,000 across 5 purchases and a VIP customer with $67,790 across 10 purchases.

Findings:
- **PASS** — existing customer history survived the commercial split and renders without a baseline crash.
- **PASS** — customer totals and purchase counts are visible directly in the list.
- **DATA-QUALITY GAP** — unresolved buyers are displayed as raw numeric IDs; there is no name-enrichment/retry path in the Customers module.
- **UX / SCALE GAP** — Customers has no search, segment filter, minimum-spend filter, contacted/uncontacted filter, coupon-status filter, or explicit sort control.
- **UX / SCALE DEFECT** — `customersHtml()` silently truncates to the first 100 RFM-sorted customers with `.slice(0,100)`; there is no indication that additional customers would be hidden and no pagination/load-more workflow.
- **UX / OBSERVABILITY GAP** — the Customers view shows no customer count summary, no last sales-refresh age, and no data-coverage window; the only baseline status is `Ready.`.
- **COVERAGE DEFECT** — Customers Refresh Sales uses the same hard-coded 72-hour lookback as Inventory/ROI. On a clean state it cannot reconstruct customer lifetime totals or meaningful 30/60-day RFM segmentation by itself.
- **EFFECTIVENESS GAP / SEGMENTATION** — the function is labeled RFM, but monetary value does not affect the segment assignment. Live data illustrates the consequence: a $117.5M / 5-purchase customer is LOYAL while a $67.8K / 10-purchase customer is VIP. Frequency/recency may be useful, but high-value customer prioritization needs an explicit monetary/value dimension or separate tier.
- **UX / WORKFLOW GAP** — Prepare Welcome and Mark Sent + Issue are rendered for every customer without conditioning the action label/availability on `firstMessageSent` / `contacted`, making duplicate welcome/coupon workflows easier to trigger.


### MM_Customers Refresh Sales live findings
- **PASS** — live refresh completed without visible error: `0 new · 77 checked`.
- **PASS** — Customers correctly reuses the shared sales ledger instead of duplicating the two sales already imported by Inventory/ROI.
- **PASS** — customer recalculation runs even when no new sale rows are inserted; visible customer population changed from 98 to 99 after refresh, proving CRM state was rebuilt from the newer shared sales ledger.
- **PASS** — segmentation recalculated from shared state; visible mix changed from 55 NEW / 24 REGULAR / 18 LOYAL / 1 VIP to 56 NEW / 23 REGULAR / 19 LOYAL / 1 VIP.
- **UX / OBSERVABILITY DEFECT** — status `0 new` only describes sale-row insertion. It can coincide with meaningful customer creation, spend/frequency updates, or segment changes. Refresh feedback should report sale rows plus customer records created/updated and segment changes.
- **DATA-QUALITY GAP** — numeric-name rows increased from 8 to 9 after recalculation, confirming new customer records can still be created without a resolved display name.
- **COVERAGE DEFECT CONFIRMED** — the refresh still checks only the module's 72-hour window. Cross-module shared history makes the current account look complete, but Customers cannot independently rebuild historical CRM state from a clean database.
- **UX / STATE GAP** — no last-refresh timestamp or coverage range is visible in the Customers panel after refresh, so the user cannot tell how current or complete the CRM population is.


### MM_Customers Coupons live findings
Observed Coupons view:
- 136 coupon records visible in preserved state.
- 50 show `issued never`; 86 have an issuance timestamp.
- 2 currently show `$5,000 eligible`; no $10,000/$20,000 eligibility is currently visible.
- 1 coupon is fully redeemed; no pending-refund status is currently visible.

Findings:
- **PASS** — qualification logic enforces post-issue-only purchases: eligible sales must have timestamp >= coupon `issuedAt`.
- **PASS** — qualification is bounded to the last 24 hours, excludes already-redeemed sale IDs, respects remaining uses, and blocks qualification while a cashback refund is pending.
- **PASS** — cashback tiers remain $5,000 at $50k+, $10,000 at $250k+, $20,000 at $1M+, with a 10% purchase-value cap.
- **UX / WORKFLOW DEFECT** — Coupons is effectively read-only. It shows eligibility but provides no direct Create Cashback, Coupon Reminder, Profile, or customer-open action. To act on one of the two eligible coupons, the user must return to Customers and manually find that customer.
- **UX / SCALE DEFECT** — no search, eligible-only filter, issued/unissued filter, fully-redeemed filter, or sort-by-expiry/eligibility. With 136 records, actionable coupons are buried in status text.
- **UX / PRIORITY DEFECT** — eligible coupons are not promoted to the top or summarized as an actionable queue; the most time-sensitive 24-hour work is visually mixed with non-actionable records.
- **DATA-MODEL / CLUTTER GAP** — coupon records exist for many customers before actual issuance (`issued never`). The current model creates/retains coupon codes separately from issuance, causing the Coupons view to mix prospective coupons with active coupons.
- **UX / TERMINOLOGY GAP** — `issued never · 2 uses left` can imply an active two-use benefit even though qualification correctly says “Coupon has not been issued yet.” Unissued coupons should be visually separated and labeled DRAFT / NOT ISSUED.
- **DATA-QUALITY GAP** — coupon `playerName` is set when the coupon is first created and is not automatically refreshed if a customer's name is later enriched; Coupons can therefore retain stale numeric/display names.
- **MISSING FEATURE** — no countdown/expiry-at display for current qualifying post-coupon sales, even though the 24-hour eligibility window makes time-to-expiry operationally important.
- **MISSING FEATURE** — no qualifying purchase total or sale count is shown for eligible coupons; only the cashback amount is displayed, forcing the user to infer why the coupon qualifies.


### MM_Customers Refunds live findings
Observed Refunds view:
- 2 preserved refund records, both completed for xepherion.
- Refund 1: $20,000 cashback on $1,379,980 qualifying purchases, completed ~2d ago.
- Refund 2: $20,000 cashback on $2,759,960 qualifying purchases, completed ~4d ago.
- No pending refund is currently visible.

Findings:
- **PASS** — both displayed refund amounts reconcile to the configured $1M+ => $20,000 cashback tier and remain below the 10% purchase-value cap.
- **PASS** — completed refund records are preserved through the commercial split.
- **PASS** — completion logic is idempotent: completing an already-completed refund returns the existing record rather than consuming another coupon use.
- **PASS** — completed redemptions append their sale IDs to coupon redemption history and set coupon uses from redemption count; those sale IDs are then excluded from future qualification.
- **PASS** — only one pending refund per coupon is permitted because qualification is blocked while `pendingRefundId` exists.
- **PASS / SAFETY** — money is not sent automatically. The script creates a pending record, routes the user to the customer profile, and requires manual payment plus a separate `Mark Paid` action.
- **UX / SAFETY GAP** — `Mark Paid` has no confirmation dialog and no Torn money-transfer verification/reconciliation. A refund can be marked completed without proof that money was actually sent, or money can be sent without the record being marked completed.
- **UX / WORKFLOW GAP** — pending refund action opens the customer's generic profile rather than a direct, amount-aware send-money workflow; the amount must be carried manually.
- **AUDIT GAP** — Refunds list does not show coupon code, qualifying sale IDs, sale timestamps, completed timestamp, or payment reference/proof. Historical auditability is weak even though sale IDs are stored internally.
- **UX / SCALE GAP** — no status filter (pending/completed/cancelled), customer search, date filter, amount filter, or summary totals.
- **MISSING FEATURE** — no aggregate “pending cashback owed” amount or “cashback paid” total.
- **MISSING FEATURE** — no explicit warning if a pending refund has aged unusually long after creation.
- **DATA-INTEGRITY GAP** — refund `playerName` is snapshotted at creation and is not refreshed if the customer name is later enriched, so historical rows can retain stale numeric/display names.


### MM_Customers Restock live baseline
Observed Restock view:
- 2 preserved subscribers: RonyarBedwyr [4534960] and WhenPigsFry [2063619].
- Both currently show 12 matching SKUs, sourced from the current Inventory/ROI Bazaar snapshot.

Findings:
- **PASS** — restock subscribers survived the commercial split.
- **PASS** — Restock reads the Inventory/ROI-owned Bazaar snapshot rather than duplicating listing ownership.
- **PASS / SAFETY** — Prepare Alert copies/prepares a message and opens Torn composer; sending remains manual.
- **DEFECT / NOTIFICATION STATE** — Prepare Alert sets `lastPrepared` and `pendingNotification`, but there is no “Mark Sent” completion path and no code updates `lastNotified`. The UI can therefore permanently show `last notified never` even after alerts are actually sent.
- **DEFECT / DUPLICATE RISK** — because `pendingNotification` is not consumed/cleared and no sent state/cooldown is enforced, the same subscriber can have the same current-stock alert prepared repeatedly with no duplicate suppression.
- **UX / STALE-DATA GAP** — Restock shows match counts without showing the age of the underlying Bazaar snapshot. Current matches can look live even when Inventory/ROI data is stale.
- **EFFECTIVENESS GAP** — there is no “newly restocked since last notification” comparison. With blank interests (all items), every current Bazaar SKU can be included on every alert rather than only meaningful stock changes.
- **MISSING FEATURE** — no notification cooldown, minimum time between alerts, or per-item suppression policy.
- **MISSING FEATURE** — no subscriber-level history of prepared/sent alerts, item sets, or notification outcomes despite `notificationHistory` existing in state initialization.
- **UX / SCALE GAP** — no search/filter by subscriber, interests, last notified age, or matching count.
- **UX GAP** — Interests editing uses a raw prompt with comma-separated exact names/IDs instead of selectable current/recent items, making mistakes likely.


### MM_Customers Restock subscriber detail — RonyarBedwyr
Live expanded state:
- RonyarBedwyr [4534960]
- Interests: All items
- 12 matching current Bazaar SKUs
- last notified 2d ago
- actions: Prepare Alert / Interests / Remove

Findings:
- **PASS** — preserved subscriber notification metadata is visible; migrated/legacy `lastNotified` can survive and render.
- **REFINED DEFECT** — the current v8 Prepare Alert path does not advance `lastNotified`; the existing 2d value can therefore become stale after future alerts prepared/sent through this module.
- **UX / EFFECTIVENESS GAP** — “All items” produces 12 matches and Prepare Alert would include up to 12 current listings, regardless of whether any are newly restocked since the subscriber's last notification.
- **UX / SAFETY GAP** — Prepare Alert is enabled without any visible warning that the same inventory may already have been notified 2d ago, and without showing underlying Bazaar snapshot age.
- **WORKFLOW GAP** — no subscriber-level Mark Sent / Dismiss Pending / Snooze controls are exposed beside the prepared-alert action.


### MM_Customers branded-message regression and alpha.2 repair
Live restock Prepare Alert for RonyarBedwyr exposed a regression:
- recipient routing opened Torn Messages correctly for XID 4534960,
- but the new split Customers module only copied plain text to the clipboard and left the Torn Subject field empty,
- the message did not auto-populate the composer,
- the legacy branded dark-background/table/banner formatting was lost.

Root cause:
- alpha.1 `copyAndOpenMessage()` only used `navigator.clipboard` / textarea fallback, then navigated to Torn compose.
- The pre-split CRM had a richer flow: persist a compose payload in Tampermonkey storage, open Torn compose, find the Subject/body editor, inject branded HTML through Torn's code/source editor, and leave Send manual.

Repair built in **MM_Customers v8.0.0-alpha.2**:
- restores a script-isolated pending compose payload (`mm_customers_pending_compose_v1`),
- auto-fills Torn Subject + body while keeping final Send manual,
- restores the branded MANIC'S MAD HOUSE banner/dark-background/three-column message format,
- applies the same rich workflow to Welcome, Coupon Reminder, and Restock messages,
- removes the clipboard-only compose path,
- restores Restock `Mark Sent` and `Dismiss Pending` controls,
- Mark Sent advances `lastNotified`, clears pending state, and records notification history.

Static/regression evidence:
- Customers userscript syntax parses successfully.
- Existing customer/coupon/refund/restock logic fixture still passes when exercised.
- Regression assertions cover alpha.2 version, rich template, pending compose payload, auto-fill, clipboard-path removal, and Restock sent/dismiss controls.
- Implementation commits: `23f848b35a303ed087caf0cec588561a15996ad7`, `15040c11bc74988a391be10582aa30fb5eb7219c`, manifest `84832d65688fb44f745a2415acceefc9e93947b8`.
- **PENDING LIVE RETEST** — install alpha.2, prepare the same Restock alert, verify Subject/body auto-fill and branded formatting, do not press Send.


### MM_Customers alpha.2 branded composer live retest
Live retest of Restock -> RonyarBedwyr -> Prepare Alert after installing alpha.2:

- **PASS** — Torn Messages routed to the correct recipient, RonyarBedwyr [4534960].
- **PASS** — Subject auto-populated as `MANIC'S MAD HOUSE — Bazaar restock alert`; no clipboard paste was required.
- **PASS** — the compose body auto-populated inside Torn's rich editor.
- **PASS** — the live compose form contains the MANIC'S MAD HOUSE banner image, branded table structure, greeting, customer name, 12-SKU / 36-total-unit summary, three stock columns, favorites CTA, and RESTOCK ALERTS footer.
- **PASS** — current alert content is structured item-by-item with quantities and prices rather than an unformatted copied block.
- **PASS / SAFETY** — Torn's SEND button remains untouched; the script prepares only the draft.
- **PASS** — the alpha.1 clipboard-only regression is repaired live.
- **PASS** — rich-message formatting is present in the Torn editor; alpha.2's generated HTML includes explicit dark backgrounds, colored headings, banner, borders, and table layout.
- **PENDING** — Mark Sent / Dismiss Pending state controls still need a live UI/state check after returning to MM_Customers Restock; no message should be sent merely to test the composer.


### MM_Customers alpha.2 Restock pending-state live check
After preparing (but not sending) the RonyarBedwyr alert and returning to Restock:
- **PASS** — MM_Customers reports v8.0.0-alpha.2.
- **PASS** — RonyarBedwyr remains at `last notified 2d ago`; preparing a draft did not falsely mark the notification as sent.
- **PASS** — the pending draft exposes both `Mark Sent` and `Dismiss Pending`.
- **PASS / SAFETY** — notification completion is now an explicit owner action after manual Torn send rather than being inferred from draft preparation.
- **PENDING LIVE CHECK** — because this test message was intentionally not sent, use `Dismiss Pending` and verify the pending controls disappear while `last notified` remains unchanged.


### MM_Customers alpha.2 Restock dismiss-pending live check
After using `Dismiss Pending` on the intentionally unsent RonyarBedwyr test alert:
- **PASS** — status reports `Pending restock alert dismissed.`.
- **PASS** — `Mark Sent` and `Dismiss Pending` disappeared.
- **PASS** — `Prepare Alert` remains available.
- **PASS** — `last notified 2d ago` remained unchanged, so discarding an unsent draft does not falsely advance notification history.
- **PASS (source-level)** — the dismiss handler only clears `pendingNotification`; it does not append `notificationHistory`, so discarded drafts are not recorded as sent notices.


### MM_Customers Settings live findings
Observed MM_Customers v8.0.0-alpha.2 Settings:
- Torn API key field
- Save / Clear
- key-storage / purpose disclosure
- no customer, coupon, cashback, segmentation, messaging, or restock business controls

Findings:
- **PASS** — API key isolation is clearly disclosed: script-scoped Tampermonkey storage, not copied into shared IndexedDB/localStorage and not shared with other scripts.
- **MISSING FEATURE** — cashback tiers are hard-coded ($50k->$5k, $250k->$10k, $1M->$20k) with no owner-configurable thresholds/amounts.
- **MISSING FEATURE** — 10% maximum cashback cap is hard-coded with no setting.
- **MISSING FEATURE** — 24-hour coupon qualification window is hard-coded with no setting.
- **MISSING FEATURE** — coupon maximum uses is hard-coded at 2 with no setting.
- **MISSING FEATURE** — customer segment thresholds (VIP/LOYAL/REGULAR/NEW/AT RISK) are hard-coded and monetary value is not part of segmentation; there is no segmentation policy editor.
- **MISSING FEATURE** — no restock notification cooldown / dedupe interval / newly-restocked-only policy.
- **MISSING FEATURE** — no messaging-template settings for banner, shop name, owner signature, favorites CTA, welcome/reminder/restock copy, or whether branded vs plain formatting is preferred.
- **MISSING FEATURE** — no sales-history/backfill depth or refresh policy despite customer totals and 30/60-day segmentation depending on historical coverage.
- **MISSING FEATURE** — no customer-list defaults (sort/filter/page size) despite scale issues already observed.
- **MISSING FEATURE** — no refund workflow policy (confirmation requirement, aged-pending threshold, audit/reference requirement).
- **EFFECTIVENESS GAP** — core commercial policy is embedded in source constants rather than owner-editable rules, so routine business-policy changes require a script release.
- **UX GAP** — Settings is visually simple but does not actually control most of the behaviors the Customers product owns.


### Shared launcher spacing / overlap defect and Core alpha.5 repair
Live dock/launcher manipulation exposed an interaction defect:
- bottom-edge snapping works acceptably, though it intentionally retains a small viewport margin;
- floating launchers did not snap to a consistent distance from neighboring icons;
- floating launchers could overlap other MM launchers and Torn's native bottom-toolbar icons.

Repair built in **MM Torn Core v8.0.0-alpha.5**:
- establishes a fixed 4px launcher-to-launcher / launcher-to-native-icon gap;
- uses the same 4px gap between the MM dock group and Torn's first native bottom-toolbar icon;
- treats other MM launchers plus detected Torn native toolbar buttons as collision obstacles;
- snaps floating launchers to neighboring icon edges within an 18px snap range;
- prevents persisted floating positions from overlapping/crowding another icon closer than the configured gap;
- applies collision resolution while dragging, at drag completion, when undocking, and after viewport resize;
- preserves the existing small bottom-edge margin.

Deployment versions consuming Core alpha.5:
- MM_Acquisitions v8.0.0-alpha.2
- MM_Customers v8.0.0-alpha.3
- MM_Inventory Manager/ROI Tracker v8.0.0-alpha.3
- MM Torn Faction Armory v8.0.0-alpha.10
- suite manifest v8.0.0-alpha.15

Static checks:
- Core and all four active userscripts parse successfully.
- all four active userscripts reference Core alpha.5.
- preservation regression test now asserts the fixed snap gap, collision guard, native Torn icon targets, and floating-drag collision snapshot.

Implementation checkpoints:
- Core collision/snap fix: `6377f7ebcc68cd25f6faf397590648d8f9ca7de5`
- active-module Core cache-buster/version bumps: `96f1c7ae2e585c9038e1a44889f9492912d3389a`, `97b2dbd92298c1d9c4473331a868aa088db8058b`, `3ec03388add4ab0734f8be3e39bc7b0ac4672cb4`, `92ab3b53dc43b123ef252a87afacce42701668fc`
- suite manifest: `0ddc729bbef5f26b21e4811c02ab5575657eb016`
- regression assertions: `41198bbf3fd77d697bde8c46cc8e747e2ab3aa30`

**PENDING LIVE RETEST** — reinstall/update the four active userscripts, refresh Torn, undock one launcher, drag it toward another MM icon and toward a Torn native bottom icon, and confirm it settles at the fixed gap without overlap.


### Shared launcher native-Torn collision / bottom-alignment follow-up
Live alpha.5 retest result:
- **PASS** — snapping between custom MM icons works well.
- **PASS** — overlap onto other custom MM icons is blocked.
- **FAIL** — floating MM launchers can still overlap Torn's default bottom icons.
- **FAIL** — launcher row bottom alignment still does not match Torn's native row.

Root cause in Core alpha.5:
- native-toolbar detection required a fixed/sticky ancestor with a narrow size profile; Torn's current footer controls are not reliably exposed through that container shape.
- dock positioning used centerline alignment rather than the native controls' actual bottom edge.

Repair built in **MM Torn Core v8.0.0-alpha.6**:
- detects visible bottom controls directly via `a, button, [role="button"]` geometry instead of requiring a fixed/sticky toolbar parent;
- groups controls into horizontal bottom-edge bands and selects the strongest contiguous footer row;
- treats those direct Torn controls as collision obstacles;
- docks the MM group to the Torn row's measured bottom edge;
- floating horizontal snaps align icon bottoms to the neighboring icon bottom instead of centerline;
- fixed 4px separation remains in force.

Active consumers bumped for cache refresh:
- MM_Acquisitions v8.0.0-alpha.3
- MM_Customers v8.0.0-alpha.4
- MM_Inventory Manager/ROI Tracker v8.0.0-alpha.4
- MM Torn Faction Armory v8.0.0-alpha.11
- suite v8.0.0-alpha.16

Static:
- Core + all four active userscripts parse successfully.
- regression assertions now cover direct Torn footer-control detection and bottom-edge alignment.

Implementation checkpoints:
- Core alpha.6: `a9ebfcd195c26be6186b0c9ef852ee71ffd6899b`
- active consumers: `1f855fa5ebd2c438f2f2fccff370bccf5494760f`, `d86c42cf16eaeead50bc1aff4a88b51565b82ccd`, `39b261223cf91d564a110a6880a712fd78f7bddf`, `8eb54f62db9669d0aa8fdcdc8af0e6d4bd391616`
- manifest: `c305d686987cafbca7486c1d18b0639e624d2db4`
- test assertions: `763c95456da3ac3086c108a95d74b7eb6ded86e5`

**PENDING LIVE RETEST** — install the four bumped scripts, refresh Torn, then test overlap against a Torn native footer icon and compare bottom edges.


### Suite-wide automation / fluid-workflow acceptance rule
Owner direction added 2026-10-03:
- Every safe, deterministic step that can be automated should be automated across all active MM Torn scripts.
- Manual buttons remain fallbacks for recovery/debugging, not the primary path, when a reliable automatic trigger exists.
- A normal workflow should move from intent -> required Torn page/action -> state reconciliation with the fewest practical clicks.
- Background refreshes should run automatically when API/data access exists and data is stale, with rate-limit/staleness guards rather than requiring repetitive Sync buttons.
- Cross-module state changes should propagate automatically through the shared state/channel where safe.
- User-visible manual boundaries remain for irreversible/external actions: final message Send, money transfer/payment, purchases, destructive removals, and other actions that require human confirmation.
- Live acceptance now includes transition quality: no dead-end statuses, no manual bookkeeping after a confirmed action, and no duplicate “prepare then separately mark” workflow when the script can verify the action itself.


### MM_Customers alpha.5 automation repair
Owner-reported defects after alpha.4:
- customer names could remain numeric IDs,
- Prepare Welcome could remain stuck at “Opening Torn composer…” instead of routing,
- sent messages did not automatically update customer/contact/coupon state,
- new/uncontacted customers were difficult to find among the main customer list.

Implemented in **MM_Customers v8.0.0-alpha.5**:
- conditional **New Customers (N)** tab containing uncontacted customers; the tab is omitted when the queue is empty,
- automatic username enrichment for unresolved numeric customers using Torn User Basic (v2 with v1 fallback), propagating the resolved name to customers, coupons, subscribers, sales, and refunds,
- automatic name repair during customer sync and before composing to an unresolved customer,
- direct same-tab Torn Messages navigation with `window.location.assign()`,
- tracked outbound workflow state for Welcome / Reminder / Restock drafts,
- after the human presses Torn **Send**, the script waits for Torn send confirmation/compose exit before automatically reconciling CRM state,
- confirmed Welcome send automatically marks the customer contacted, records contact time/message count, and issues the coupon,
- confirmed Reminder send automatically updates contact history,
- confirmed Restock send automatically advances `lastNotified`, clears the pending notification, and records notification history,
- redundant primary `Mark Sent + Issue` welcome action removed,
- sales/customer sync runs automatically on startup/open when stale, every 60s while visible, and immediately after an API key is saved; manual Refresh remains a fallback,
- manual refresh automatically opens the New Customers queue when actionable customers exist.

Static regression checks:
- userscript parses,
- New Customers conditional tab present,
- automated username repair present,
- message send detector / tracked reconciliation present,
- direct composer routing present,
- legacy manual welcome-state button removed.

Implementation checkpoints:
- Customers alpha.5: `73aaf8b3f343da370de5513b2d2f8acdb2d65b8c`
- auto-sync-after-key fix: `a085d5d5d78e5d14e61510f7afd720adfb1091bf`
- regression assertions: `3f33ae97db663f845f0b1482b4232624bb2fe49f`
- manifest alpha.17: `48ce55c2b9f2cc78be6a265aab6fa884dd7e8949`

**PENDING LIVE RETEST**:
1. install Customers alpha.5,
2. open Customers and confirm unresolved numeric names begin resolving automatically,
3. confirm New Customers tab appears only while uncontacted customers exist,
4. Prepare Welcome for one unsent customer and verify immediate Torn Messages routing + auto-filled branded draft,
5. do not send unless using a real intended customer message; if sent intentionally, verify the customer leaves New Customers and coupon/contact state updates automatically.


### Suite-wide automation audit queue
Initial static pass under the new automation rule:
- **Acquisitions** already polls Weav3r generation once per minute while open, but purchase-ledger sync, full opportunity refresh, travel update, and capture import remain primarily manual. Target: stale-on-open auto refresh, automatic purchase-log reconciliation after relevant activity, automatic travel capture import, with Verify & Buy / final purchase remaining manual.
- **Inventory/ROI** currently depends on explicit Refresh Shop and Refresh Sales. Target: stale-on-open refresh, periodic visible-tab refresh with API-rate guards, and automatic refresh/recompute after acquisition/customer-sale state changes; manual buttons remain fallback.
- **Faction Armory** still uses explicit Refresh Faction / Refresh Keys / per-member Refresh. Target: stale-on-open faction refresh and guarded background refresh of saved member keys, respecting Torn API timing and avoiding wasteful repeated member calls.
- **Business Intelligence** remains on the implementation/acceptance queue and must follow the same automation rule once its active implementation surface is reconciled.


### MM_Customers alpha.5 live open / automatic queue check
After installing alpha.5 and opening MM_Customers:
- **PASS** — v8.0.0-alpha.5 is live.
- **PASS** — automatic sales sync ran on open without pressing Refresh: `Auto-synced sales: 0 new sales.`
- **PASS** — conditional `New Customers (19)` tab is present because 19 customers currently require first-contact follow-up.
- **PASS** — the visible queue is the new-customer work queue rather than the full historical customer list.
- **PASS** — previously numeric customer names are being resolved automatically. Examples now render as real Torn names, including birkodi [4488297], Thorndike [4441675], BeterBarks [4505317], Bearded [3681146], Apothe [3463955], Hell_Fire [27581], and Blysz [3025831].
- **PASS** — no `Resolving name…` placeholder is currently visible in the active queue.
- **PENDING LIVE** — test Prepare Welcome on one queued customer, verify immediate Torn Messages routing + branded prefill, then only if an actual intended message is sent verify automatic removal from New Customers and automatic contact/coupon state reconciliation.


### MM_Customers alpha.5 Prepare Welcome live routing / compose check
Live test using queued new customer birkodi [4488297]:
- **PASS** — Prepare Welcome immediately routed the same Torn tab to Messages compose for XID 4488297.
- **PASS** — Torn recipient field resolved correctly to `birkodi [4488297]`.
- **PASS** — Subject auto-filled as `Welcome to MANIC'S MAD HOUSE!`.
- **PASS** — branded rich body auto-filled: MANIC'S MAD HOUSE banner, named greeting for birkodi, coupon SAVE-4488297, two-redemption display, coupon-response CTA, cashback tiers, qualification rules, favorites CTA, and Restock section.
- **PASS / SAFETY** — Torn SEND remains a manual human action.
- **PASS** — prior “Opening Torn composer…” dead-end is repaired for this customer.
- **CLARIFICATION** — the additional MANIC'S MAD HOUSE content visible lower on the page is Previous Conversation history, not a duplicate draft injection.
- **PENDING LIVE** — send-state automation cannot be accepted until an actual intended Welcome is manually sent and the CRM is then checked for automatic contacted/message-count/coupon issuance and removal from New Customers.


### MM_Customers alpha.5 Welcome send confirmation — birkodi
After the human pressed Torn SEND for birkodi [4488297]:
- **PASS / TORN** — Torn exited compose to Inbox and displayed `Message sent to birkodi`, providing an explicit send confirmation signal for the Customers send detector.
- **PENDING CRM STATE CHECK** — open MM_Customers next and verify birkodi is no longer in New Customers, contact/message state advanced, and SAVE-4488297 was issued automatically without a manual Mark Sent step.

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
