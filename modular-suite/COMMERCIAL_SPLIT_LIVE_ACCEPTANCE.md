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


### MM_Customers alpha.5 automatic send-state reconciliation — birkodi
After the real Welcome to birkodi [4488297] was sent and Torn confirmed it:
- **PASS** — New Customers automatically changed from 19 to 18 with no manual Refresh and no `Mark Sent + Issue` action.
- **PASS** — birkodi is no longer present in the active New Customers queue.
- **PASS / STATE** — this proves the tracked Torn send detector completed the welcome-state transaction because New Customers is defined from `contacted / firstMessageSent / messageCount`.
- **PASS (same atomic source transaction)** — the confirmed Welcome handler also issues the customer's coupon at the same timestamp it marks first contact, so SAVE-4488297 activation does not require separate bookkeeping.
- **PASS** — the panel continued auto-syncing after the send and remained usable on return to Torn Home.


### Suite automation implementation pass — Inventory / Acquisitions / Faction
Following the owner mandate to automate safe deterministic work:

**MM Inventory Manager/ROI Tracker v8.0.0-alpha.5**
- stale Shop and Sales data refresh automatically on open,
- guarded visible-tab checks run every 60s,
- Shop data is considered stale after 2m; Sales after 1m,
- first alpha.5 sales refresh performs a 31-day backfill so 30-day metrics can be reconstructed on a clean/current module state, then returns to the normal 72h incremental window,
- saving the API key immediately triggers automatic refresh,
- semantic Torn API failures no longer count as success: malformed/unavailable Bazaar or Inventory payloads are rejected,
- invalid Inventory responses no longer overwrite a previously valid cached inventory snapshot with an empty object,
- manual Refresh Shop / Refresh Sales remain recovery fallbacks.

**MM_Acquisitions v8.0.0-alpha.4**
- on open, current shared state and any newer captured travel feed are imported automatically,
- purchase logs auto-sync when older than 2m,
- opportunity data auto-refreshes when Item Market evidence is older than 5m,
- a 60s visible/open guard checks freshness without buying anything,
- saving the API key immediately triggers the guarded automatic refresh,
- Weav3r generation watch remains coordinated once per minute,
- Verify & Buy plus final purchase remain manual.

**MM Faction Armory v8.0.0-alpha.12**
- on open, faction inventory/roster auto-refreshes only when Torn's own `nextUsefulRefreshAt` says a refresh can be useful; fallback stale threshold is 1h,
- while open, a 5m guard checks whether faction data is due,
- saved member API profiles can auto-refresh only when the encrypted vault is already unlocked in the current session, preventing surprise passphrase prompts,
- at most 2 stale member profiles are refreshed per automatic pass,
- member staleness follows the existing readiness stale-hours setting (default 72h),
- saving the faction API key triggers an immediate guarded refresh,
- manual Refresh controls remain recovery fallbacks.

Static/regression evidence:
- all three updated userscripts parse successfully,
- Inventory tests cover automatic refresh/backfill and semantic snapshot preservation,
- Acquisitions tests cover stale purchase/opportunity automation while preserving manual purchase boundary,
- Faction tests cover nextUsefulRefreshAt, unlocked-vault guard, and bounded member refresh,
- suite manifest is now **v8.0.0-alpha.18**.

Implementation checkpoints:
- Inventory alpha.5: `9cd0af513e16f9e1e7899d31dbd463616fa1eea3`
- Inventory tests: `53e72c5a1b5117ee399c654f07116b60762a8e2a`
- Acquisitions alpha.4: `1c84111bd05d0a8820cc95b333b0fd25e78edbc1`
- Acquisitions tests: `e08b43aacd7eaec4904be4cc550a8c0d4511f431`
- Faction Armory alpha.12: `a7919adf1f053a49c186df09100d70535fc23943`
- Faction tests: `1e7626d91326fbe45e4d7b24d6c4f91cf7b88a28`
- suite manifest alpha.18: `f31a13f5cbc8e1405f02515dc1ff454afa85b44c`

**Implementation boundary**:
- suite manifest still declares MM Business Intelligence, but no BI implementation file is present on the current implementation branch. Automation cannot be applied to a non-existent implementation; BI remains a separate implementation/reconciliation task.


### MM Inventory/ROI alpha.5 automatic refresh live check
After installing alpha.5 and opening Inventory/ROI without pressing either refresh button:
- **PASS** — v8.0.0-alpha.5 is live.
- **PASS** — stale data refreshed automatically on open. Live status: `Auto-refresh: shop Bazaar OK / Inventory unavailable · sales sync 0 new.`
- **PASS** — semantic Inventory failure is no longer reported as `Inventory OK`; the headline now explicitly shows `INVENTORY — API unavailable`.
- **PASS** — Bazaar refreshed successfully and currently shows 10 SKUs.
- **PASS** — Sales refreshed automatically; freshness advanced independently of manual controls.
- **PASS / BACKFILL EVIDENCE** — 30D revenue is now $204,614,624, up from the pre-alpha.5 $199,923,150 baseline (+$4,691,474). This is consistent with the new one-time 31-day historical backfill filling previously unreachable older sale history before subsequent incremental sync.
- **KNOWN GAP REMAINS** — 30D gross remains $52,021 and realized ROI 13.7%, confirming the previously documented headline scope mismatch: revenue is business-wide while gross/ROI only cover rows represented in the current inventory/listing set.
- **KNOWN ENVIRONMENT LIMITATION** — personal inventory remains 0 because Torn currently returns that selection as unavailable; alpha.5 now preserves a prior valid snapshot when one exists rather than treating this response as a successful empty inventory. This live state had already been emptied by the older behavior, so preservation of a non-empty prior snapshot cannot be demonstrated from this account state without a future valid Inventory response.
- Manual Refresh Shop / Refresh Sales remain available as fallback controls but were not used for this check.


### MM_Acquisitions alpha.4 automatic refresh live check
Opened Acquisitions and did not press Sync Purchases, Refresh Opportunities, Import Capture, or Update Travel.

Observed:
- **PASS** — v8.0.0-alpha.4 is live.
- **PASS** — purchase ledger auto-synced immediately; freshness advanced from hours old to seconds/minutes old while lot count remained 204, confirming dedupe/no duplicate lots.
- **PASS** — stale opportunity refresh started automatically and completed without a manual refresh button.
- **PASS** — Item Market freshness advanced from ~59m old to seconds old.
- **PASS** — Best Buyable Deals repopulated after the automatic refresh.
- **PASS / NO-OP CORRECTNESS** — Travel remained ~3h old because no newer captured travel feed was available; automatic import did not fabricate freshness.
- **PASS / SAFETY** — no purchase was submitted; Verify & Buy/final purchase remain human actions.
- **UX FRICTION** — full opportunity enrichment took roughly tens of seconds in this live run and exposed only a generic `Refreshing Weav3r opportunities + Torn Item Market…` status until completion. The automation works, but progress granularity / partial-source status would improve perceived fluidity.


### MM Faction Armory alpha.12 live Settings check / alpha.13 blocker UX
Live Settings inspection:
- **PASS** — v8.0.0-alpha.12 is live.
- **FACT** — no faction API key is currently saved; the Settings field shows the unsaved placeholder `Faction-compatible Limited/custom API key`.
- **EXPECTED** — the 20h-old faction cache therefore could not auto-refresh. This is not an API-refresh defect; the prerequisite key is absent.
- **PASS / SAFETY** — the saved member-key vault remained locked and no background passphrase prompt appeared.

UX issue exposed:
- with stale faction data and no faction key, the panel remained at generic `Ready.`, which hides the reason automation cannot proceed.
- likewise, stale saved member profiles can be waiting on a locked vault without a visible explanation.

Repair built in **MM Faction Armory v8.0.0-alpha.13**:
- when faction data is due but no faction API key is saved, status explains that a key is required for automatic refresh,
- when saved member profiles are stale but the encrypted vault is locked, status explains that unlocking the vault during an Armory session enables automatic refresh,
- Settings now explicitly says either `Saved — automatic faction refresh is enabled when Torn data is due` or `Not saved — cached faction data cannot refresh automatically`,
- no background passphrase prompt is introduced.

Implementation checkpoints:
- Faction alpha.13: `37ef6c48495e4a259a6e6bf26f0846a47fe9d0f4`
- regression assertions: `f871009fc372d191bc9e5654bf453424f0e72d3d`
- suite manifest alpha.19: `5b1d754cca82312a6da74036aef71712a8a719c8`

**PENDING LIVE RETEST** — install alpha.13, reopen Armory with no faction key, and verify the stale-data blocker is explained rather than showing only `Ready.`.


### MM Faction Armory alpha.13 automatic faction refresh live check
After saving the faction API key and reopening/remaining in Armory without pressing Refresh Faction:
- **PASS** — v8.0.0-alpha.13 is live.
- **PASS** — Settings explicitly reports `Saved — automatic faction refresh is enabled when Torn data is due.`
- **PASS** — automatic faction refresh executed with no manual Refresh Faction action.
- **PASS** — status reports `Auto-refresh: faction checked.`
- **PASS** — faction cache and roster freshness advanced from ~20h old to ~2s old.
- **PASS** — refreshed state retained 103 faction inventory rows.
- **PASS / SAFETY** — no member-key vault passphrase prompt was triggered by the faction refresh.


### MM Faction Armory alpha.14 explicit member-vault automation control
Live testing exposed that the saved-member automation prerequisite was not directly actionable: the vault could only be unlocked indirectly by using Refresh Keys / per-member Refresh, which conflicted with validating automatic refresh.

Repair built in **v8.0.0-alpha.14**:
- Members now displays `Member-key vault: LOCKED / UNLOCKED / NOT CREATED`,
- Members shows the count of stale saved member profiles,
- when a saved-key vault exists and is locked, an explicit **Unlock Vault** control appears,
- unlocking the vault performs only the human-required passphrase step; it does not itself force every saved profile to refresh,
- once unlocked, if stale saved profiles exist, the normal guarded automatic refresh is invoked immediately,
- if no saved profile is stale, status states that explicitly,
- background automation still never opens a passphrase prompt by itself.

Implementation checkpoints:
- Faction alpha.14: `443057fe1b792c20e09211b7a2483ce1f27a70ec`
- regression assertions: `1d925776b4e78988bc8360ad12572dcb1a64665e`
- suite manifest alpha.20: `087b7a3dbce7fcf404910d2d98ec336384865ba1`

**PENDING LIVE RETEST** — install alpha.14, open Members, use Unlock Vault once, then verify stale saved profiles refresh automatically without pressing Refresh Keys or a member Refresh button.


### MM Faction Armory alpha.14 member-vault unlock live check
After installing alpha.14 and using the dedicated Unlock Vault control:
- **PASS** — v8.0.0-alpha.14 is live.
- **PASS** — vault state is explicitly visible as `UNLOCKED`.
- **PASS** — status reports `Member-key vault unlocked. No saved member profiles are stale.`
- **PASS** — Members reports `stale saved profiles: 0` and `automatic stale-profile refresh enabled for this session`.
- **PASS / NO-OP CORRECTNESS** — no member API refresh was launched because the one saved profile (Speed-e-vinyl) is currently within the existing stale-hours policy.
- **PASS / SAFETY** — Refresh Keys remained untouched; the human action was limited to the required passphrase boundary.
- **PENDING CONDITION** — automatic stale-member refresh itself can only be live-demonstrated once a saved profile actually crosses the configured stale threshold (default 72h), unless the policy is intentionally changed for testing.


### Core alpha.6 live footer alignment failure / alpha.7 repair
Live screenshot after the current automation checks shows the four MM module launchers in a separate row **above** Torn's native footer controls instead of immediately to their left on the same bottom edge.

Classification:
- **DEFECT** — Core alpha.6 still selected the wrong bottom-control band for dock anchoring on the current Torn layout.
- Custom/custom overlap remains prevented, but default-row alignment is not accepted.

Repair built in **Core v8.0.0-alpha.7**:
- deduplicates near-identical button geometry so nested/overlaid Torn accessibility controls cannot distort row detection,
- chooses the horizontally contiguous candidate row nearest the actual viewport bottom before considering row length,
- uses the measured native footer gap when placing the MM dock,
- retains native controls as collision obstacles for floating launchers.

Consumer cache-busters / versions:
- Customers alpha.6
- Acquisitions alpha.5
- Inventory/ROI alpha.6
- Faction Armory alpha.15
- suite manifest alpha.21

Implementation checkpoints:
- Core alpha.7: `103f15517f2075e10e1307d279e5366546f6857b`
- Core regression assertions: `af1ad10e66abc3fefb4d25ce54a825a81e72510a`
- Customers alpha.6: `2c11736850173c36f5932742cda8817025ab3113`
- Acquisitions alpha.5: `1a1be273fc164b29a37a723970d0d4cffe89a534`
- Inventory alpha.6: `864c4ff0a543cf4920a40385ad170af25b959d6d`
- Faction alpha.15: `1cd08dad3723772ed7618bfc72eb41a93c0b0066`
- manifest alpha.21: `edf606ccae93ebf63ba9f81be7f803faa70b45df`

**PENDING LIVE RETEST** — install the four consumer updates, reload Torn, then verify the MM dock is immediately left of Torn's native footer row with the same bottom edge and no overlap.


### Core alpha.8 default Torn-footer docking
Owner requirement: MM launchers should auto-snap to the bottom beside Torn's native icons **by default**, while still remaining movable/undockable afterward.

Implemented in **Core v8.0.0-alpha.8**:
- introduces a one-time default-layout revision migration,
- clears legacy saved floating launcher positions once for this new footer-adjacent layout revision,
- therefore all MM launchers start docked beside Torn's detected native footer row after the upgrade,
- after the one-time migration, any user undock/move is persisted normally and is not continuously overridden,
- retains alpha.7 lowest-row detection, native-gap alignment, and collision prevention.

Consumers bumped to load Core alpha.8:
- Customers alpha.7
- Acquisitions alpha.6
- Inventory/ROI alpha.7
- Faction Armory alpha.16
- suite manifest alpha.22

Implementation checkpoints:
- Core alpha.8: `2d26eb7dd075ff7c26105076377fca9261e46f5a`
- Core tests: `ca763104bf469a5f38a48f74e8398c509799770e`
- Customers alpha.7: `a32b22c7ef49ea7dddcf0794372095d415a1948f`
- Acquisitions alpha.6: `2b931a32670254dd27885158c16a299671613d6b`
- Inventory alpha.7: `4c4c2dc453b60b988cdc141b95f435632e4f65f9`
- Faction alpha.16: `6e560e1d6a91c29f3d4abeec517015c2b09fec92`
- manifest alpha.22: `45ace5ad8c8d3b2fddd31316171c9bb5a3274592`

**PENDING LIVE RETEST** — install the four consumer updates, reload Torn, and verify first-load/default placement is automatically beside the Torn footer icons rather than preserving the previous upper floating row.


### Core alpha.8 default footer docking — live acceptance
After installing the four Core alpha.8 consumers and loading a fresh Torn page:
- **PASS** — all four MM launchers defaulted to the bottom footer automatically.
- **PASS** — the MM launchers are immediately to the left of Torn's native footer controls.
- **PASS** — MM and Torn controls share the same bottom row / bottom edge.
- **PASS** — fixed spacing is preserved between the MM dock and Torn's first native footer icon.
- **PASS** — the previous separate upper MM launcher row is gone on fresh load.
- **PASS** — launchers remain docked/reorderable with the existing pull-away / right-click undock behavior.
- **PASS** — no manual repositioning was required after the alpha.8 one-time default-layout migration.

This closes the default launcher placement defect for the current Torn desktop layout.


### MM_Customers alpha.7 rich-composer intermittent fallback / alpha.8 repair
Live failure observed after several successful introductory messages:
- **DEFECT** — the active Torn compose page reported `Message prepared in Torn composer as plain text fallback. Send remains manual.`
- **DEFECT** — message body content was present but branded table formatting and banner imagery were gone.
- The failure is consistent with Torn's SPA editor retaining source/rich mode state or loading the source editor late during rapid consecutive compose transitions.
- alpha.7 downgraded to plain text after the first rich-editor miss, so a transient timing/state miss became a permanent formatting loss for that draft.

Repair built in **MM_Customers v8.0.0-alpha.8**:
- detects an already-open Torn source editor instead of blindly toggling it off,
- distinguishes source-editor controls from ordinary textareas,
- handles the case where the first toggle reveals rich mode because the composer began in source mode,
- waits for the source editor and then verifies branded structure after toggling back,
- retries branded composition up to 3 times before allowing plain-text fallback,
- exposes `Waiting for Torn rich editor… branded message will retry automatically.` during transient misses,
- plain fallback is now last-resort only after rich-editor retries fail,
- final Send remains manual.

Implementation checkpoints:
- Customers alpha.8: `0bec58a3556705b87a99eee588753f7a6421807e`
- regression assertions: `bb6c1c42f984aeae6d40723f6d9515243c6eebc5`
- suite manifest alpha.23: `3d3f00455c56a83034422164ab66ffa293724cb9`

**PENDING LIVE RETEST** — install alpha.8, discard/leave the current plain fallback draft unsent, re-run Prepare Message/Welcome for the same customer, and verify the banner plus branded three-column format return.


### MM_Customers alpha.8 rich-composer live retest
Retest on the previously affected Bendi [4257955] compose flow:
- **PASS** — branded banner image is restored.
- **PASS** — branded welcome header, coupon strip, green coupon CTA, three-column HOW IT WORKS / CASHBACK TIERS / IMPORTANT layout, favorites banner, and RESTOCK ALERTS styling are all present.
- **PASS** — recipient is Bendi [4257955].
- **PASS** — subject is `Welcome to MANIC'S MAD HOUSE!`.
- **PASS** — Torn rich editor is active with formatting toolbar; the draft is no longer plain-text fallback.
- **PASS / SAFETY** — final SEND remains manual.

This closes the intermittent rich-composer fallback defect for this reproduced case.


### MM_Customers alpha.9 Refunds eligibility + cashback reminder workflow
Owner requirement restored/refined:
- Refunds must show customers who are **currently cashback eligible**, not only already-created refund records.
- Each eligible row must show the qualifying purchase/purchases, qualifying total, coupon code, and calculated refund amount.
- Each eligible row must provide **Send Cashback Reminder**.
- The reminder must explicitly say it is a cashback reminder, that the customer already qualifies based on their recent qualifying sale/sales, show those qualifying purchases, show the refund amount, and ask them to send their coupon code.
- Final Torn Send remains manual.

Implemented in **MM_Customers v8.0.0-alpha.9**:
- Refunds now begins with a `Cashback eligible now` section calculated from the existing coupon qualification engine and current 24-hour eligibility window.
- eligible rows are ordered by cashback amount, then qualifying purchase total.
- each row shows customer/ID, coupon code, qualifying-sale count, qualifying total, calculated cashback, and one line per qualifying sale including timestamp, item/quantity detail, and sale total.
- `Send Cashback Reminder` resolves the customer's Torn username if needed, re-checks eligibility immediately before composing, then routes to Torn Messages.
- branded reminder includes:
  - `CASHBACK REMINDER — <name>, YOU ARE ELIGIBLE!`
  - explicit cashback/refund amount,
  - explicit qualifying purchase total,
  - each qualifying sale/purchase with item details,
  - coupon code,
  - explicit instruction to send the coupon code now because the recorded recent purchase(s) already qualify,
  - normal 24-hour / one-use qualification language.
- the existing green `SEND MY COUPON CODE` CTA is retained in the branded message.
- reminder uses tracked `kind:'reminder'` reconciliation after human Torn Send.
- existing refund history remains below the eligibility queue.

Implementation checkpoints:
- Customers alpha.9: `b2cccf4b60f8e6ed8d2054eac53e53f32a2acaa0`
- regression assertions: `2792e5a4507e3ea554254d8304201aaeaa76ef9d`
- suite manifest alpha.24: `2f1d93cb0207b9ebef7d32b72df57dbda0715169`

**PENDING LIVE RETEST** — install alpha.9, open Refunds, verify eligible customers and purchase/refund details, then open one Send Cashback Reminder draft and verify the branded reminder before sending.


### MM_Customers alpha.9 cashback-reminder formatting regression / alpha.10 repair
Live reproduction on Arpello [4325089] cashback reminder:
- **DEFECT** — subject/recipient were correct, but the compose body was plain text and the branded banner/table formatting was gone.
- Root cause identified in the alpha.8/alpha.9 rich-format verifier: it only recognized templates containing `RESTOCK ALERTS` or `CASHBACK TIERS`. The new cashback-reminder template intentionally uses `QUALIFYING PURCHASES`, `YOUR CASHBACK`, `SEND YOUR COUPON`, and `CASHBACK REMINDER`, so successful HTML injection was misclassified as failure and the script then replaced it with the plain-text fallback.

Repair built in **MM_Customers v8.0.0-alpha.10**:
- rich-format verification is now template-agnostic: banner + table structure is sufficient, with cashback/reminder headings accepted as secondary structure evidence,
- branded drafts are **never automatically downgraded to plain text** anymore,
- if Torn's rich editor is temporarily unavailable, the script continues retrying and shows a visible `Preparing branded message… do not send until this notice disappears.` warning,
- if all retries fail, the pending branded payload is retained and a visible `do not send` error is shown instead of silently creating an unformatted message,
- plain text remains available only for workflows that intentionally have no HTML body.

Implementation checkpoints:
- Customers alpha.10: `14a4ec741ecd685091d60b9d7143bfe8895ef75e`
- regression assertions: `d61b0976a7d6d6c760295281e945f540db694778`
- suite manifest alpha.25: `c2da4c8f512b1e83cf35e1ee80bd28d38f42c6b3`

**PENDING LIVE RETEST** — install alpha.10, leave the current Arpello plain draft unsent, reopen the cashback reminder, and confirm branded formatting persists.


### MM_Customers alpha.10 live fail-safe / alpha.11 source-editor repair
Live screenshot on Arpello [4325089] after alpha.10:
- **PASS / SAFETY** — alpha.10 no longer silently downgraded the branded reminder. It displayed the visible red warning: `Formatting is not ready yet. Do not send this draft. Reopen it from MM_Customers to retry branded formatting.`
- **DEFECT REMAINS** — the current draft body was still unformatted because Torn's source-mode editor was not being detected.

Root cause:
- Torn's current source-mode editor can appear as a large **anonymous textarea** with no `source`, `code`, or `html` class/metadata.
- alpha.9/alpha.10 deliberately narrowed source-editor candidates to code-labelled controls to avoid false matches, which excluded Torn's actual source textarea on this live layout.

Repair built in **MM_Customers v8.0.0-alpha.11**:
- visible textareas are again eligible source-editor candidates,
- the normal Subject field is explicitly excluded,
- a newly appeared large textarea after pressing Toggle Code Editor is treated as the source editor even when Torn gives it no identifying class,
- code/source-labelled editors still outrank anonymous textarea candidates,
- branded verification now checks the actual banner-containing table against markers extracted from the expected HTML template, avoiding false positives from unrelated page tables / prior conversation content,
- alpha.10's no-auto-downgrade / visible do-not-send safety behavior remains intact.

Implementation checkpoints:
- Customers alpha.11: `ab6b5989af40208f1367e3b54126314eefdcf0ba`
- regression assertions: `a23b68bde62580490d4ea08737b9759b55b7f05b`
- suite manifest alpha.26: `657867535b13db4f99082cf8146494ca788b7641`

**PENDING LIVE RETEST** — install alpha.11, reopen the Arpello cashback reminder, and verify branded HTML renders without the warning.


### MM_Customers alpha.11 live source inspection / alpha.12 fix
The user left Torn's **Toggle Code Editor** source mode open after the alpha.11 failure. Live accessibility inspection exposed the actual editor state:
- the compose source field is an **anonymous text field** with no identifying name/class exposed to accessibility,
- its value currently contains a single `<p>...</p>` wrapping the plain-text cashback reminder,
- it does **not** contain the branded `<table>` or banner image URL,
- therefore the formatting failure happens before Torn renders the visual editor; the branded HTML is not reaching the correct source field.

Root cause in alpha.11:
- allowing every visible textarea as a source candidate fixed one edge case but created another: the pre-toggle probe could select an unrelated visible textarea elsewhere on Torn before source mode was opened.
- once the wrong textarea was selected, the branded HTML was written to the wrong control, the real Torn source editor retained the plain `<p>` body, and verification correctly failed.

Repair built in **MM_Customers v8.0.0-alpha.12**:
- anonymous textareas are accepted only when they are geometrically inside the message-composer area,
- an already-open anonymous source field is accepted only when its current value looks like HTML,
- a blank anonymous textarea is accepted only when it appears **after** Toggle Code Editor is pressed,
- normal Subject/title fields remain excluded,
- explicit SCEditor/source/code-labelled controls still outrank anonymous candidates,
- source injection now verifies the source value itself contains both `<table` and the MANIC'S MAD HOUSE banner URL before switching back to visual mode,
- branded compose payload TTL is extended from 5m to 30m,
- tracked send state now also retains body/bodyHtml so a reload/update can recover the branded draft instead of falling back to URL-only subject data.

Implementation checkpoints:
- Customers alpha.12 source scoping: `ef848f80e458458c3398cbd9ae20b162e7d9187f`
- Customers alpha.12 payload recovery: `5516e6297d55f8ae2e8bfbb295d8b8184e6d59a1`
- regression assertions: `f7e1adc372263b01f6e36b72905818fd1b099da6`

**PENDING LIVE RETEST** — install alpha.12, reload/reopen the same Arpello cashback reminder, and verify source mode contains the branded table/banner HTML before visual verification.


### MM_Customers alpha.12 formatted reminder / false error + heading typo / alpha.13 repair
Live Arpello [4325089] retest after alpha.12:
- **PASS** — branded table formatting is now rendering correctly again.
- **DEFECT** — the red `Formatting is not ready yet` warning still remained even though the formatted table was present.
- **DEFECT** — the first visual heading rendered as `CSHBACK REMINDER`, missing the `A` in `CASHBACK`.
- **OBSERVED** — the banner image row was not visible in this rendered reminder even though the rest of the branded table rendered.

Root cause / repair in **MM_Customers v8.0.0-alpha.13**:
- a complete branded table whose text contains the expected markers is now treated as authoritative formatting success, so Torn sanitizing/dropping an external image no longer produces a false hard failure warning,
- the verifier now identifies the actual matching branded table first rather than requiring the banner image as a prerequisite,
- after source→visual conversion, the script repairs any exact `CSHBACK` typo to `CASHBACK` before Send,
- if Torn strips the MANIC'S MAD HOUSE banner row while preserving the rest of the table, the script best-effort restores the exact expected banner row into the visual editor and dispatches editor events,
- existing no-auto-downgrade safety remains in place.

Implementation checkpoints:
- Customers alpha.13: `da156d78cba1171366aabe7ca7683a64b3ebd65e`
- regression assertions: `3ba022c624a4117a7a6cd555601fc4b5b747d4c2`
- suite manifest alpha.28: `9996baf15d61372c33a0bd7c3192abf305625131`

**PENDING LIVE RETEST** — install alpha.13, reopen the same Arpello cashback reminder, and verify:
1. formatting remains correct,
2. the red error disappears,
3. the heading reads `CASHBACK REMINDER`,
4. the banner row is restored if Torn permits it.


### Faction Armory alpha.17 + Acquisitions alpha.8 — key-count clarity, price-aware builds, source-comparison handoff
Owner feedback:
- `Refresh Keys` reported only `2`, creating ambiguity about whether only two faction members were detected.
- Build / Stock / Acquire decisions needed tighter reconciliation.
- procurement decisions needed to consider price/value, not performance alone; example: an ArmaLite M-15A4 reference value is ~21.57m versus Jackhammer ~4.03m, so a modest performance gain should not automatically justify the premium.
- acquisition execution needed a simpler path across Overseas, Item Market and Bazaar.

**Key-count clarification**
- `Refresh Keys` operates only on encrypted member API keys currently saved in the Armory vault.
- a result such as `2/2 succeeded` means **2 saved member API keys were found and refreshed**. It does **not** mean only two faction members were detected.
- Members now labels this explicitly as `<roster count> roster members · ... · <key count> saved member API keys`.
- refresh status now says the saved-key count is not the faction-member count.

**Price-aware Build / Stock / Acquire model**
- readiness remains performance-based: adequate gear already equipped/owned is not replaced merely because a cheaper alternative exists; its cost is already sunk.
- price/value now affects **new procurement and faction-stock allocation**.
- target selection evaluates generally available candidates by performance and reference price rather than forcing the highest-priced premium option.
- Budget target: cheapest candidate retaining at least 80% of the best available performance for the slot/build bias.
- Standard/Ideal value floor: candidates must retain at least 92% of best available performance before price can win.
- Ideal premium gear only replaces the value target when the performance gain is at least 12% or premium cost is no more than 2.25× the value target.
- live static-reference example for a balanced primary:
  - Jackhammer reference: $4,025,949; performance proxy 38.97.
  - ArmaLite M-15A4 reference: $21,571,985; performance proxy 41.95.
  - ArmaLite is only ~7.6% higher on the current proxy at ~5.4× the reference cost, so **Jackhammer becomes the Ideal value target** rather than automatically buying ArmaLite.
- when both acceptable items are already in faction stock, the least-cost item meeting the readiness floor is issued first, preserving scarce premium stock.
- Build rows now expose Current Ref, Target Ref, premium reference cost, premium gain/cost multiple and a value note.
- an already-equipped adequate ArmaLite still returns **KEEP**; price is used to avoid wasteful new purchases, not to force a downgrade of owned gear.

**Acquisition completion workflow**
- Faction Acquire now shows cached Item Market, Bazaar and Overseas prices when they can be resolved.
- every acquisition line has:
  - **Find Best Source**
  - **Item Market**
  - **Bazaar**
  - **Overseas**
- clicking a source hands the exact item/quantity/reason to MM_Acquisitions over the existing local BroadcastChannel.
- MM_Acquisitions opens an Armory request card, refreshes source evidence and compares Bazaar / Item Market / Overseas.
- Bazaar is live-verified against the seller before routing.
- Item Market is refreshed before routing to the item page.
- Overseas shows country, unit price, stock and requested total; **Open Travel Agency** routes to Torn's Travel Agency page.
- purchase/travel confirmation remains manual; no item is auto-bought and no travel is auto-started.

Static/functional checks:
- Faction logic, Faction userscript, Faction tests, Acquisitions live service, Acquisitions userscript and Acquisitions tests all parse.
- functional value check confirms Ideal balanced-primary target = Jackhammer, while an already-equipped ArmaLite remains KEEP.
- functional faction-stock check confirms Jackhammer is issued before a much more expensive ArmaLite when both meet the floor.

Implementation checkpoints:
- Faction price-aware logic clean rebuild: `879a7754766a78dd817dfcda841dd8f7d337b59c`
- Faction Armory alpha.17 clean UI/handoff: `6f876a5d97a490e05e179ab16b1556a0228a449a`
- Faction tests: `96b20adb4367ad09c9d2473c5fcb9dbfbd718351`
- Acquisitions source-routing service: `877611b529832370af5c2626af2b7ae05b8bc6c0`
- Acquisitions alpha.8 UI + overseas handoff: `e086aab9a42c7d4bc196dea0b35d1b87622b3133`
- Acquisitions tests: `7866dc661bc868fb722eb3f345af495b61893143`
- suite manifest alpha.30: `a8ecbcb140d96a9ca822d28e0ea7aa1327e2c075`

**PENDING LIVE RETEST**:
1. install Faction alpha.17 and Acquisitions alpha.8,
2. verify `Refresh Keys` clearly reports saved member-key count,
3. inspect one known member Build for price/value output,
4. use one Faction Acquire line → Find Best Source and verify the Acquisitions source-comparison/routing flow without completing a purchase.


### MM_Customers alpha.14 — false-send delivery reconciliation repair

Live defect reported by owner:
- a newly prepared customer welcome was marked sent even though the Torn message had **not** been sent,
- the customer was therefore removed from **New Customers** prematurely.

Root cause:
- MM_Customers alpha.13 treated either leaving Torn's `#compose` route or the compose Subject control disappearing as proof that a message had been delivered.
- Torn Messages is SPA-driven, so route/editor transitions can happen without a successful send.
- the submit detector could also arm on a non-Send form submission whenever the compose view was visible.

Repair in **MM_Customers v8.0.0-alpha.14**:
- only a trusted human interaction with the exact Torn **Send / Send message** control can arm delivery verification,
- form-submit detection requires trusted `event.submitter` to be that exact Send control,
- route changes, compose disappearance and Subject disappearance are **never** delivery confirmation,
- successful delivery now requires fresh post-click evidence:
  - a new Torn sent/success notification that was not present before the click, or
  - the prepared message fingerprint appearing in non-editor conversation/transcript content after the click,
- each tracked delivery has a unique delivery ID plus a local completion receipt so duplicate route hooks cannot increment message counts twice,
- if no Torn confirmation appears within 12 seconds, the draft becomes **SEND CLICK UNCONFIRMED** and customer/contact/coupon state is left untouched,
- the pending-delivery card supports Reopen Draft, Cancel Tracking, and manual **Confirm Sent** only after an explicit Outbox-verification confirmation,
- the manual Restock **Mark Sent** bookkeeping button was removed; restock history is reconciled through the same confirmed-delivery path,
- Refunds action wording is now **Prepare Cashback Reminder** to avoid implying that preparation itself sends a message,
- a guarded **Recent first-contact recovery** section can restore a recent false-positive first contact to New Customers; it resets contacted/first-message/message-count state and unissues the unused coupon while preserving its code.

Script-wide delivery audit:
- the same unsafe route/editor-disappearance confirmation shortcut was found in legacy `Torn_Bazaar_Customer_CRM.user.js` message detectors and in `Torn_Bazaar_Customer_CRM.runtime.js`,
- both legacy surfaces were hardened so route/editor disappearance no longer counts as delivery and their detectors require trusted Send interaction,
- superseded MM Bazaar Manager still contains a clearly manual **Mark Sent + Issue** legacy control; it is not an automatic send detector and remains superseded/non-production pending explicit owner retirement approval.

Static checks:
- MM_Customers alpha.14 parses,
- legacy CRM userscript/runtime parse,
- old route-exit confirmation shortcut is absent from the repaired active/legacy delivery detectors,
- alpha.14 regression assertions cover trusted Send interaction, unconfirmed-send safety, idempotent delivery receipts, transcript evidence and false-send recovery.

Implementation checkpoints:
- Customers alpha.14 delivery repair: `6a183fd90d43468867f012f8f0d2a7b679ae3f47`
- Customers delivery regressions: `8967a9e43e9db9667b853cb5f428d5b89224d4bd`
- legacy CRM userscript detector hardening: `cddd85eac1ea99a9543cb17049c50d58e4495063`
- legacy CRM runtime detector hardening: `05005ecb357285b082964d260c6a162e886c8ae6`
- suite manifest alpha.31: `72757aae1272c4149756ecb722266eec43736a20`

**PENDING LIVE RETEST**:
1. install MM_Customers alpha.14,
2. open Customers/New Customers and use **Recent first-contact recovery → Restore to New Customers** for the customer that was falsely marked sent,
3. verify that customer returns to the New Customers queue,
4. prepare a welcome and leave the Torn composer open to verify recipient/subject/formatting without sending,
5. for a genuinely intended message, verify the customer remains New until Torn provides actual post-Send confirmation.


### MM_Customers alpha.15 — recipient-aware compose transport stabilization

Owner-reported defect:
- opening a prepared MM_Customers message directly from the interface could land on a partially initialized Torn composer where branded formatting did not persist,
- switching to Outbox and back to Compose then caused the pending branded payload to render, but the recipient was blank.

Live Torn inspection:
- the current compose form exposes a distinct **Name** recipient field and **Subject** field,
- a canonical compose route with `XID=<player id>` resolves the Name field to `Username [player id]`,
- alpha.14 never inspected or verified that Name field; it considered the draft complete when only Subject + Body were present,
- alpha.14 also allowed a pending payload to hydrate a generic `#/p=compose` route with no XID, which explains the correctly formatted body with a missing user after Outbox → Compose.

Root cause:
- recipient identity was not part of the compose-completion contract,
- the pending compose payload did not retain recipient name,
- branded HTML injection could begin while Torn's SPA was still mounting/replacing the editor,
- direct rich-editor HTML fallback could make content appear present without proving Torn's editor state had accepted it,
- multiple route-helper invocations could leave overlapping composer retry loops, and an older loop could clear pending compose state.

Repair in **MM_Customers v8.0.0-alpha.15**:
- every prepared compose payload now owns `composeId + playerId + recipientName + subject + body + bodyHtml`,
- the common message path remains the single transport for Welcome, Coupon Reminder, Cashback Reminder, and Restock Alert,
- generic Compose recovery now restores the canonical XID route instead of pasting a branded body into a recipient-less form,
- generic automatic recovery is limited to a five-minute prepared-draft window and only to `awaiting-send` tracked deliveries; unconfirmed sends are not silently reconstructed into another send attempt,
- recipient readiness is verified from Torn's actual Name field; `Username [XID]` / exact known username must match the intended target before formatting starts,
- the compose surface must remain stable before source-mode injection begins,
- source-mode injection is now idempotent: MM_Customers does not toggle the code editor until Torn exposes a real rich/source editor surface, and it no longer uses direct rich-editor `innerHTML` as a branded-message fallback,
- recipient + subject + branded table are re-verified after a post-fill settle period before pending compose state is cleared,
- composer retry sessions are generation-scoped and old observers/timers are cleaned up on route changes,
- pending compose state is cleared only if the successful fill still matches the same compose ID,
- Send tracking now also requires the live recipient field to match the pending delivery.

Verification:
- live Torn route probe confirmed `messages.php#/p=compose&XID=4257955&subject=...` resolves the Name field as `Bendi [4257955]`,
- all four MM_Customers message-producing UI paths still converge on the single `composeMessage(...)` transport,
- no clipboard-paste path exists in MM_Customers,
- updated MM_Customers test suite executes successfully in an isolated V8 harness, including syntax, delivery-safety, rich-composer, source-editor, cashback, recipient-routing, and stale-session regression assertions.

Implementation checkpoints on patch branch:
- recipient-aware composer foundation: `f181cd701f4fedc8ee12eecb0304fd9a1bbe2814`
- stale-route/session abort hardening: `87772b1e421624f5d396638d580ea904cfcea2fb`
- rich-editor direct-innerHTML fallback removal: `eecf9423773409e1306c263547ec2ad4102d2317`
- compose regression assertions: `5bac0928322fe9be92a62777592729ff91d5393f`
- suite manifest alpha.32 / Customers alpha.15: `6d6ee243eaf4c641318842ccce74061351ced8e5`

**PENDING LIVE RETEST**:
1. install MM_Customers alpha.15 from the patch branch,
2. from New Customers, prepare one welcome and verify **Name + Subject + full branded formatting** are present on the first Compose load,
3. without sending, switch Outbox → Compose and verify MM_Customers restores the intended XID/Name rather than showing a recipient-less branded draft,
4. repeat with Coupon Reminder, Cashback Reminder, and Restock Alert,
5. verify no customer/contact/coupon/restock state changes until a real manual Send receives Torn confirmation.


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


## MM_Customers alpha.16 — one-shot compose transport / resource reduction

Live symptom after alpha.15 merge:
- opening a prepared message could leave Torn Messages stuck on its loading surface while the userscript remained active
- the user does not require automatic draft restoration after navigating Outbox → Compose; only the original prepared Compose page must work

Repair in alpha.16:
- compose hydration is one-shot and only applies when the live Compose XID exactly matches the customer that initiated the action
- generic Compose and different-recipient routes immediately discard the pending compose bridge instead of restoring or hydrating it
- PENDING_SEND delivery tracking no longer acts as a source for editor hydration
- automatic route restoration was removed
- compose fill no longer attaches a document-wide MutationObserver; it uses one bounded 500 ms timer with a 20 s timeout and at most three rich-format attempts
- pre-send delivery tracking no longer attaches a document-wide attribute MutationObserver or 500 ms scan loop
- delivery verification only starts after a trusted manual Send click; expiry uses one timeout
- recipient, subject, branded-content verification, and confirmed-delivery state safety remain intact

Static/V8 verification:
- userscript parses
- customer logic loads and core sales/coupon checks pass
- route recovery symbols are absent
- resource-heavy compose/send observers and pre-send scan timer are absent
- manual-send trust gate and recipient safety remain present
- suite manifest: 8.0.0-alpha.33
- MM_Customers: 8.0.0-alpha.16

Live acceptance still required:
1. From MM_Customers, prepare a single customer message.
2. The original Torn Compose page must load Name, Subject, and branded body without remaining on the loading spinner.
3. Navigate away to Outbox, then open a fresh generic Compose page; MM_Customers must not repopulate or redirect it.
4. Return to MM_Customers and separately verify Welcome, Coupon Reminder, Cashback Reminder, and Restock Alert.
5. Confirm customer/contact/coupon/restock state still changes only after a real manual Send receives Torn confirmation.


## MM_Customers alpha.17 — patch consolidation and source cleanup

Owner direction:
- audit the entire MM_Customers structure before merging,
- identify accumulated runtime patches/workarounds,
- replace patch behavior with the correct source implementation,
- remove obsolete patch layers without removing features.

Audit result:
- the message-template source and customer-domain logic were structurally sound,
- accumulated risk was concentrated in the Torn composer adapter, send-confirmation transport, and always-on lifecycle work,
- `MM_Customers.logic.js` required no patch-removal rewrite,
- Core compatibility remains consistent with the approved modular architecture.

Source cleanup completed:
- removed rendered CASHBACK-heading mutation and banner-row reinsertion,
- removed hard-coded branded verification markers; verification is now derived from the canonical HTML payload,
- removed legacy pending-compose tuple matching,
- removed generic compose URL hydration; MM_Customers now touches only its own one-shot draft,
- removed history `pushState` / `replaceState` monkey patching,
- replaced repeated delivery verification timers with one bounded async verifier started only by a trusted manual Send,
- renamed the canonical plain message renderer from fallback terminology to `plainMessageText`,
- renamed username repair terminology to missing-username resolution,
- moved automatic sales sync from page-load scope to the open MM_Customers panel lifecycle,
- moved the Customers BroadcastChannel from page-load scope to the open panel lifecycle,
- removed the Customers-side duplicate legacy-launcher adoption call because Core already owns that migration bridge,
- fixed unconfirmed Reopen Draft so it explicitly returns delivery state to `awaiting-send` before a resend,
- retained the historical first-contact recovery UI, Torn anonymous source-textarea compatibility, API v1 username fallback, legacy Bazaar listing fallback, and Core legacy-data/launcher compatibility because those are explicit recovery/migration features rather than runtime patches.

Resource invariants after cleanup:
- no MM_Customers `MutationObserver`,
- no page-load customer network sync,
- no always-on Customers cross-tab channel,
- no pre-send polling loop,
- no history-method wrapping,
- the only `setInterval` is panel-scoped auto-sync,
- composer preparation and post-Send verification are bounded to the active user workflow.

Versions:
- MM_Customers: `8.0.0-alpha.17`
- suite: `8.0.0-alpha.34`

Detailed inventory: `modular-suite/customers/CLEANUP_AUDIT.md`.

Static/V8 verification passes for syntax, customer sale/coupon/refund/restock logic, shared compose-path preservation, source-level branding verification, removal of obsolete patch layers, trusted manual-send gating, panel-scoped resource lifecycle, and manifest versions.

**MERGED / LIVE ACCEPTANCE PENDING**:
1. prepare a Welcome/Message from MM_Customers and verify Name + Subject + complete branded body on the first Torn Compose load,
2. repeat the original-compose test for Coupon Reminder, Cashback Reminder, and Restock Alert,
3. verify customer/contact/coupon/restock state changes only after Torn confirms a real manual Send.

Outbox/recovery navigation is not part of alpha.17 acceptance.


## MM_Customers alpha.18 — Torn compose readiness / username-only failure

Live alpha.17 failure:
- the original MM_Customers action navigated to Torn Compose but Torn could remain on its loading shell for a long time,
- after the form finally appeared, only the XID-resolved username was present; Subject and Body were blank.

Direct live browser inspection:
- the failing alpha.17 URL included both `XID=<player>` and `subject=<message subject>`,
- while Torn was still on the loading shell, the compose form did not exist in the accessibility tree,
- after the shell eventually resolved, Torn exposed Name, Subject, SEND, and Toggle Code Editor, but Subject remained blank,
- a separate live probe using the same XID **without the subject hash parameter** exposed the complete Compose controls immediately during inspection,
- the page also contains Torn chat text inputs outside the message composer, so document-wide body/editor discovery can select unrelated chat surfaces.

Root causes addressed in alpha.18:
- alpha.17 started its 20-second fill timeout at navigation time, so a slow Torn SPA mount could exhaust the entire fill window before Subject/Editor existed,
- alpha.17 repeatedly scanned editor surfaces while Torn was still mounting, adding avoidable work during the slowest part of page load,
- alpha.17 put Subject in Torn's compose hash even though the current live route did not reliably hydrate it,
- body/editor discovery could fall back to page-wide textbox/contenteditable candidates when the compose controls were not inside a formal `<form>`.

Source repair:
- canonical MM_Customers navigation is now XID-only; Subject is applied after Torn exposes its real Subject control,
- the compose flow is split into a passive form-readiness phase and a bounded editor phase,
- passive readiness checks run once per second and inspect only Subject + recipient; the rich editor is not scanned or toggled while Torn is mounting,
- Subject is written and verified immediately after Name + Subject are live, before any body formatting work,
- the editor phase starts only after the real recipient and Subject are stable,
- editor/body/source/toggle candidates are constrained geometrically to the Torn compose region around Subject, excluding bottom chat inputs and unrelated page controls,
- rich formatting still uses Torn source mode, then verifies the rendered branded payload,
- no MutationObserver, history monkey patch, page-load customer sync, or pre-send polling was reintroduced.

Versions:
- MM_Customers: `8.0.0-alpha.18`
- suite: `8.0.0-alpha.35`

Static/V8 verification:
- userscript, logic, and test source parse,
- customer sales/coupon logic checks pass,
- XID-only canonical route asserted,
- navigation-coupled 20-second fill timeout is absent,
- passive form wait and bounded editor wait are present,
- editor discovery is compose-region scoped,
- no document MutationObserver was reintroduced,
- all four message actions still converge on the same compose transport.

**PENDING MERGE / LIVE ACCEPTANCE**:
1. from MM_Customers, prepare one Welcome/Message,
2. verify Torn reaches Compose without the long alpha.17 loading behavior,
3. verify Name resolves, then Subject appears before editor formatting,
4. verify the full branded body appears,
5. repeat with Coupon Reminder, Cashback Reminder, and Restock Alert,
6. verify CRM state changes only after Torn confirms a real manual Send.

Outbox/recovery behavior remains out of scope.


## MM_Customers alpha.19 — current Torn TinyMCE compose contract

Alpha.18 live acceptance still failed: Torn could take an abnormally long time to show the mail composer and MM_Customers ultimately left only the XID-resolved username.

### Complete interference audit

The modular suite was searched for Torn Messages / Compose manipulation and long-lived DOM activity.

- MM_Acquisitions, MM_Faction_Armory, MM_Inventory Manager/ROI Tracker, and MM_Market_Scout do not manipulate Torn mail Compose.
- MM_Bazaar_Manager only opens an XID compose route after its own explicit copy-message action; it does not fill or observe the mail editor.
- The visible MM Trade Reminder remained active during a same-browser manual XID-only Compose control that loaded the complete Torn mail form, so its presence alone does not reproduce the failure.
- The retired/legacy Bazaar Customer CRM source does contain old Compose observers, source-mode logic, route wrapping, and polling. Its current lazy-start contract only activates workflow initialization for its own pending workflow state, and Core would expose an active legacy CRM launcher in the shared dock. No Legacy CRM launcher was present during the live control.
- A same-browser manual XID-only Compose control, with the other running MM scripts still present, exposed Name, Subject, SEND, and the editor toolbar. The failure is therefore isolated to MM_Customers' compose handling rather than the other currently running scripts.

No other script was modified.

### Current Torn research

Recent Torn userscript source confirms the mail message body is TinyMCE. A current script whose live DOM was checked documents `#mce_0` / `.mce-content-body` as the editable surface and explicitly notes that TinyMCE's hidden `textarea.sourceArea` is not the submitted message body. It writes the visible contenteditable and dispatches `input` so TinyMCE synchronizes its internal state.

Other 2026 Torn scripts independently use the same model: locate Torn's subject input, locate the TinyMCE contenteditable, write its content, and dispatch input/change events. Newsletter tooling uses TinyMCE `setContent` when page-context access is available and direct editor `innerHTML` plus `input` as the userscript fallback.

### Root cause

Alpha.14–18 were built around the wrong editor abstraction. Even after the retry/load cleanup, alpha.18 still treated Torn's mail editor as a source/code-editor workflow:

- find Toggle Code Editor,
- switch to or detect a source textarea,
- write HTML into that source surface,
- switch back,
- verify the rendered result.

On current Torn, the hidden source textarea is a TinyMCE mirror and is not the authoritative submitted field. Toggling/scanning source mode added initialization work and could silently write to a surface Torn would not submit.

### Alpha.19 source replacement

The source-mode adapter was deleted and replaced, not layered over:

- XID-only navigation remains.
- Recipient is read from Torn's native `input[name="sendto"]` / `#ac-search-0` controls.
- Subject uses Torn's current message-title/subject input selectors.
- Body targets only TinyMCE mail-editor selectors, including `#mce_0` and `.mce-content-body[contenteditable="true"]`.
- There is no generic contenteditable fallback, preventing Torn chat editors from being selected.
- Branded HTML is written directly to the TinyMCE contenteditable, followed by input/change/keyup events.
- Plain text is built as text nodes plus `<br>` elements, then an input event is dispatched.
- The compose operation waits for recipient + subject + TinyMCE editor + Send to exist together and remain stable before it writes.
- If Torn replaces the editor during final initialization, the same source operation is retried up to three bounded attempts and then fails closed.
- The old Toggle Code Editor, source textarea, SCEditor, CodeMirror, Monaco, source-mode polling, and generic editor discovery code is absent.

Versions:
- MM_Customers: `8.0.0-alpha.19`
- suite: `8.0.0-alpha.36`

Live acceptance remains the original MM_Customers action only:
1. Prepare Welcome/Message.
2. Confirm the Torn mail page reaches its normal Compose UI without an MM_Customers-induced loading stall.
3. Confirm Name, Subject, and full branded body are present.
4. Repeat Coupon Reminder, Cashback Reminder, and Restock Alert.
5. Confirm customer state changes only after Torn confirms a real manual Send.

Outbox/recovery behavior remains out of scope.

## MM_Acquisitions alpha.9 — market-readiness hardening candidate — 2026-10-04

**Status:** STATIC / FIXTURE PASS; LIVE CUSTOMER ACCEPTANCE PENDING  
**Branch:** `crm-v8-acquisitions-market-readiness`  
**Canonical base:** `crm-v8-modular-suite@24e5476b862823d814ae3a36cea4d71de559cd1f`

Owner requested that the Market Scout + Travel Acquisition offer be verified as market-ready before a customer quote is sent.

Architecture reconciliation:
- legacy **MM Market Scout** remains superseded and must not be sold as a separate maintained product;
- the maintained product is **MM_Acquisitions**, with two customer-facing workflows: **Market Scout / Deals** and **Travel Acquisition**;
- splitting them back into independent scripts would reintroduce duplicate market/travel state and maintenance surfaces and is not part of this candidate.

Hardening in alpha.9:
- rule-qualified deal labeling replaces misleading "Best Buyable Deals" wording;
- current cash is explicitly not implied; final purchase remains manual;
- fresh Item Market candidates now obey the visible live-listing minimum instead of bypassing it;
- new minimum-confidence rule is enforced by the ranking engine;
- personal-demand threshold semantics are labeled accurately when MARKET PROXY evidence is used;
- deal rows show confidence and live-listing count;
- Settings rule grid uses responsive auto-fit layout;
- current Torn travel context is read from API v2 `/user/basic` when a key is present;
- Bazaar / Item Market navigation is blocked while the user is Traveling or Abroad;
- Travel Acquisition labels FRESH / AGING / STALE state;
- stale/unknown travel data is hard-blocked from recommendation display until refreshed;
- Travel Acquisition scopes rows to the current abroad country or foreign destination when that context is available;
- browser-capture import is moved under recovery tools rather than presented as a normal primary action;
- API-key storage and required data scope are explained in Settings.

Regression coverage:
- added dedicated `MM_Acquisitions.logic.test.js`;
- fixtures cover max price, minimum live listings, minimum ROI, minimum confidence, qualified personal-demand floor, documented MARKET PROXY behavior, stale evidence rejection, and travel ranking;
- all six Acquisitions JavaScript/test files compile in connector-side V8 validation;
- nine executable ranking/travel fixtures pass.

Promotion blockers:
1. install alpha.9 on desktop and repeat Deals + Travel live acceptance;
2. verify a Traveling/Abroad account is prevented from routing to Bazaar / Item Market;
3. verify stale Travel rows are suppressed until Update Travel succeeds;
4. verify abroad/destination travel filtering on a real trip;
5. verify narrow-width/mobile layout;
6. verify TornPDA userscript behavior and travel capture/return path;
7. after PASS, prepare a stable customer distribution path that does not point at the development branch;
8. explicit owner approval is required before stable/public promotion or customer delivery.

Do not send a customer-ready claim or stable install link before those live gates pass.

## MM_Acquisitions alpha.10 — complete item catalog + direct price finder — 2026-10-04

Owner directive:
- all Torn buyable items must be categorized, itemized, selectable and filterable;
- a specific item must be findable by selecting it or entering its name/ID;
- selected-item lookup must compare current available purchase sources rather than relying only on ranked opportunity candidates.

Implementation:
- authoritative catalog source is Torn API v2 `/torn/items?cat=All&sort=ASC`;
- catalog normalizer supports current v2 array responses plus object-map compatibility;
- stores item ID, name, type/category, subtype, market/buy/sell reference values, circulation, image and shop metadata;
- catalog refresh atomically replaces stale catalog rows while preserving matching per-item local fields;
- new **Items** tab provides text/ID search, category filter, buyability/source filter, sorting and 75-row pagination;
- item rows are directly selectable through **Find Price**;
- typed exact ID/name or unique partial match can launch price lookup; ambiguous matches reduce the catalog list for manual selection;
- price lookup compares Bazaar, Item Market, Torn shop metadata and overseas evidence, sorted lowest price first;
- **Use Best Source** re-verifies/routs player-market sources while keeping purchases manual;
- Torn-shop and overseas recommendations remain manual handoffs;
- catalog is refreshed on demand and automatically when missing/stale after 24 hours;
- item-catalog controls use responsive auto-fit layout.

Verification:
- Acquisitions user/live/logic/purchase files and all three regression test files compile;
- Torn catalog array/object normalization fixtures PASS;
- shop cost/stock normalization PASS;
- atomic catalog replacement/counting PASS;
- specific-item source comparison fixture PASS with Torn Shop $150 ranked ahead of Item Market $200;
- best-source routing fixture PASS with `shop-recommended`;
- prior ranking/travel regression coverage remains unchanged.

Status:
- merged alpha.9 remains the base;
- alpha.10 is ready for branch merge into `crm-v8-modular-suite`;
- production/customer-ready promotion still requires live desktop/mobile/TornPDA acceptance.

## MM_Acquisitions alpha.11 — customer pricelist profit + ranked weapon scout — 2026-10-04

**Status:** STATIC / EXECUTABLE FIXTURE PASS; LIVE CUSTOMER ACCEPTANCE PENDING  
**Branch:** `crm-v8-acquisitions-ranked-profit`  
**Base:** `crm-v8-modular-suite@9af1c84f189141be77ef0d2c86d86513db5978ed`

Owner directive:
- build the 500M multi-item profit + ranked-weapon system inside the maintained MM_Acquisitions module;
- preserve the established Acquisitions dock launcher/icon, size, placement, collision rules and movable panel behavior;
- do not add new third-party dependencies beyond sources already used by MM_Acquisitions.

Architecture:
- no new launcher or dock module was created;
- existing `id:'acquisitions'` and shared Core docking/collision behavior remain authoritative;
- top navigation now wraps for narrow/mobile layouts;
- dependencies remain Torn/Torn API plus the already-used TornW3B/Weav3r source;
- Clairvoyant and other new external pricing/tracking services are not used.

Customer pricelist universe:
- configurable TornW3B pricelist user ID, defaulting to the customer-supplied `4054377`;
- public pricelist feed supplies the priced-item universe and dynamic Bunker Bucks rate;
- special set/BB rows are separated from positively priced normal Torn items;
- every positively priced customer item is screened from the global market feed before deeper per-item verification calls;
- current synthetic regression proves 125 priced items are evaluated in one pass;
- dedicated Items filter exposes the full customer pricelist universe;
- customer pricelist buy rate is treated as a buying benchmark, never as a resale exit;
- live acquisition cost, market exit, gross profit, ROI, liquidity/confidence and seller evidence are kept distinct;
- selected candidates route into existing direct source comparison and manual purchase workflow.

Ranked weapon workflow:
- filters: Primary / Secondary / Melee, live market vs auction, Yellow / Orange / Red, weapon name, bonus name and minimum ROI;
- no ranked bonus is excluded;
- default low-tier labels Achilles and Conserve affect labeling only, not eligibility;
- BB floor uses official Torn Bunker Buck exchange values by weapon subtype, rarity and one/two bonuses;
- current $/BB comes from the configured TornW3B pricelist;
- live ranked Bazaar / Item Market opportunities use the existing TornW3B ranked-weapons API;
- live Auction House opportunities use the existing TornW3B auction listings API;
- completed Auction House sale history comes from official Torn API `/market/{id}/auctionhouse`;
- completed-sale cohorts step from comparable bonus-roll band -> same bonus set -> same rarity -> same base item;
- outlier-resistant auction median, p25/p75, trend, sample size and confidence are calculated locally;
- historyless items have auction confidence 0 rather than fabricated confidence;
- traffic uses completed AH sales over 7 / 30 / 90 days;
- ranked rows expose ask, BB floor, AH median, fair value, expected profit, ROI, liquidity, confidence and investment score;
- expired cached auctions are suppressed immediately by `endsAt`;
- non-auction live listings older than the configured maximum age are suppressed;
- broad ranked live refresh is bounded and stale after 5 minutes;
- pricelist refresh is stale after 1 hour;
- completed Torn AH history remains explicit/on-demand to protect API usage;
- auction Open routes to the existing TornW3B live-auction view filtered by weapon/rarity/bonus rather than guessing a Torn internal route;
- final purchases/bids remain manual.

Verification completed:
- 10 Acquisitions source/test JavaScript files compile in connector-side V8;
- 125-item full-universe screen fixture PASS;
- BB exchange fixtures PASS for Pistol, Rifle, Machine Gun and Heavy Artillery examples;
- empty completed-sale history confidence = 0 PASS;
- outlier-resistant AH median fixture PASS;
- 7/30/90 AH traffic fixture PASS;
- ranked catalog subtype/category/base-stat normalization PASS;
- pricelist normalization and dynamic $/BB extraction PASS;
- ranked live market + live auction persistence fixture PASS;
- completed Torn AH history persistence fixture PASS;
- same existing `acquisitions` dock launcher asserted; no ranked-specific launcher exists;
- no Clairvoyant reference or other new third-party dependency exists in candidate source.

Candidate install safety:
- alpha.11 candidate `@updateURL` / `@downloadURL` and changed `@require` files intentionally point at `crm-v8-acquisitions-ranked-profit` so live acceptance cannot silently load alpha.10 dependencies;
- **before merge**, these candidate URLs must be switched back to `crm-v8-modular-suite` and revalidated.
- 2026-10-04 install-host correction: owner browser returned `ERR_SSL_PROTOCOL_ERROR` for `raw.githubusercontent.com`; alpha.11 candidate install/update and every userscript dependency URL were moved to `cdn.jsdelivr.net/gh/` while preserving the same branch/path isolation.
- Browser verification reached Tampermonkey's Script Installation handoff from the jsDelivr `.user.js` URL; the prior SSL failure did not reproduce.

Live acceptance blockers:
1. install alpha.11 candidate on desktop and confirm existing Acquisitions dock placement/collision behavior is unchanged;
2. Update Pricelist and confirm the real customer feed resolves the expected current priced-item count and BB rate;
3. Refresh Opportunities and confirm the full customer universe scan is populated, ranked and selectable;
4. verify a selected normal item rechecks current sources and routes without auto-purchase;
5. Refresh Ranked and validate Primary / Secondary / Melee, source, rarity, weapon, bonus and ROI filters against live data;
6. Analyze AH on representative low-tier and premium ranked weapons and validate BB floor, completed-sale cohort, traffic windows and confidence;
7. confirm expired/stale ranked rows disappear as designed;
8. confirm live-auction Open lands on the filtered TornW3B auction view and market rows route correctly;
9. verify narrow-width/mobile layout and TornPDA runtime, including tab wrapping and input usability;
10. confirm no dock overlap with Torn chat/footer icons or other MM modules;
11. switch candidate metadata/require URLs back to the canonical modular branch and repeat static verification;
12. explicit owner approval is required before merge/stable/customer delivery.

Do not advertise alpha.11 as customer-ready or provide a stable customer install path until these live gates pass.
### alpha.11 live desktop acceptance — phase 1 — 2026-10-04

Observed directly in the authenticated Torn desktop tab with the candidate installed and panel open:

PASS:
- `MM_Acquisitions v8.0.0-alpha.11 · PROFIT / RANKED / TRAVEL` is live on Torn;
- the existing shared `MM_Acquisitions` dock launcher is present inside `MM Torn module dock`; no second ranked launcher exists;
- the existing Acquisitions panel is open and draggable through the shared Core panel handler;
- Torn API key state reports `SAVED`;
- automatic market watcher is active: status reported `Weav3r published a new market generation; Acquisitions updated automatically.`;
- live freshness strip showed Weav3r ~1m, Item Market seconds old, Purchases ~3m with 207 lots, Pricelist under 1m, and `Weav auto-check WHILE OPEN`;
- complete Torn catalog loaded: 1,500 catalog items;
- default Buyable filter returned 960 matches over 13 pages;
- item category selector is populated with Torn categories including Weapon, Armor, Drug, Flower, Plushie, Supply Pack and others;
- item name/ID search field, category/source/sort selectors, Apply Filters, Find Best Price and per-row Find Price controls are present and exposed as usable form/button controls;
- customer pricelist values are visibly joined to catalog rows (examples observed: Advent Calendar, African Violet, Afro Comb, Ambergris Lump, multiple candy/other items);
- live TornW3B pricelist API independently verified 1,313 total catalog rows, exactly 125 positively priced normal Torn items, and Bunker Bucks rate $6,119,978/BB.

Expected / pending:
- source strip correctly showed `Ranked not synced` before the first explicit ranked refresh;
- Ranked tab controls and live ranked/AH behavior still require interactive desktop acceptance;
- dock collision geometry, narrow-width/mobile and TornPDA remain pending.

Next live action:
1. open the `Ranked` tab;
2. press `Refresh Ranked`;
3. inspect resulting counts/filters and representative rows;
4. run `Analyze AH` on at least one low-tier BB-floor weapon and one premium weapon.
### alpha.12 ranked live-row fix — 2026-10-04

Live desktop phase 2 exposed a root-cause defect:
- ranked feed refresh succeeded and persisted 300 market + 224 auction rows;
- UI then showed 0 Primary matches despite current feed data containing fresh Primary market rows and future Primary auctions;
- cause: `evaluateListing()` normalized ranked rows through `normalizedHistoryRow()`, which discarded live-only metadata (`source`, `lastUpdated`, `endsAt`, seller/routing fields);
- freshness filtering therefore treated every evaluated row as source-less/non-auction with no observation time and removed it.

Fix:
- preserve source, lastUpdated, endsAt, sellerId, sellerName, quantity and URL through ranked normalization/valuation;
- bump ranked logic cache key to alpha.2;
- bump userscript/manifest candidate to `8.0.0-alpha.12` / suite alpha.51;
- no freshness rule was bypassed or weakened.

Verification:
- current TornW3B Primary feed: 100 sampled rows, 53 fresh inside the 24h live-age limit;
- current TornW3B auction sample: future rows include Primary weapons;
- alpha.12 evaluation fixture preserved a live Primary Bazaar row (`9mm Uzi`) with source + lastUpdated;
- alpha.12 evaluation fixture preserved a future Primary auction row (`Benelli M1 Tactical`) with source + endsAt;
- static candidate still compiles and uses the same existing Acquisitions launcher.

Next live action:
1. install alpha.12 candidate;
2. refresh Torn;
3. open Ranked and Refresh Ranked;
4. verify Primary now returns live rows before continuing AH valuation acceptance.
### alpha.12 immutable install correction — 2026-10-04

- owner reported the branch-based jsDelivr install URL still served alpha.11 due mutable-branch CDN caching;
- candidate userscript metadata was changed to remove @updateURL/@downloadURL during live acceptance;
- every @require dependency is pinned to immutable commit e4c035e5ee3fb06fdba7ee02c13c905cb0a771ed, which contains alpha.12 + ranked metadata fix;
- live install URL is now commit-pinned to current branch head dd90732a5e98c46b13ed9d2e4152057c0741e835;
- independent fetch verified that immutable URL contains alpha.12 and does not contain alpha.11 version metadata;
- restore canonical modular-branch update/download URLs only after live acceptance and before merge.

