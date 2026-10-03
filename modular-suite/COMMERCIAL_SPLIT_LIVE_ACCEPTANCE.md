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
