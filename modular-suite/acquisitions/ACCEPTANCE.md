# MM_Acquisitions Acceptance

Candidate:
- Desktop: 8.0.0-alpha.27
- TornPDA: 8.0.0-alpha.27-pda.14
- Branch: crm-v8-acquisitions-alpha22-clarity
- Base: crm-v8-acquisitions-ranked-profit
- Stable/customer publication: not approved
- Fresh-install bootstrap: required after alpha.26 customer defect

## Focused customer workflow

On first open, Acquisitions must land on **Pricelist**.

The only primary navigation choices are:

1. **Pricelist** — every priced item from the configured customer pricelist, with buy rate, current known source prices, under/over-rate status, estimated resale/profit when available, and direct Bazaar / Item Market / Travel actions.
2. **Ranked Weapons** — Primary / Secondary / Melee ranked weapon evaluation using BB value, official completed Auction House history, ROI and 7/30/90 sales traffic.
3. **More** — supporting tools only: Find One Item, Best Deals, Travel Deals, Setup / Advanced.

The customer should not need to use More for the normal pricelist or ranked-weapon workflow. Market Pulse, liquidity, confidence, cache timing and diagnostics remain supporting/advanced evidence rather than primary navigation.

## Purpose

Run this once after the source candidate is complete. Record each finding as PASS, DEFECT, UX FRICTION, EFFECTIVENESS GAP, or MISSING FEATURE.

Do not complete a purchase, bid, travel purchase, transfer, or other irreversible action as part of this acceptance pass.

### Fresh install / no legacy CRM database

- Use a browser/profile where `mm_bazaar_crm_idb` does not already exist.
- Install/open Acquisitions.
- Confirm the app creates a valid empty shared schema-11 state through Core bootstrap.
- Save a Torn API key and confirm the prior `Legacy IndexedDB does not exist` / `Cannot read shared CRM state` defect does not appear.
- Refresh Pricelist and confirm normal state writes succeed.
- Existing installations with populated schema-11 state must retain their data unchanged.

PASS:
- fresh install initializes once without destructive migration;
- existing state is preserved;
- read-only Core reads still do not create storage unless bootstrap is explicitly requested.


## Desktop

### Panel and section persistence

- Open Acquisitions and expand Data status, a glossary/details section, or Advanced settings.
- Wait through at least one automatic refresh and perform an action that updates status.
- Confirm the expanded section remains expanded and the current scroll position is retained.
- Click the Acquisitions dock icon while the panel is already open.
- Confirm the panel stays open.
- Navigate from Acquisitions to Bazaar or Item Market and confirm Acquisitions reopens on the Torn destination page.
- Confirm only the explicit × button closes the panel and keeps it closed across subsequent Torn navigation.

PASS:
- normal refreshes do not collapse sections;
- the dock launcher does not toggle the app closed;
- Torn navigation does not unexpectedly lose the app.


### 1. Boot and dock

- Install the candidate desktop userscript.
- Open Torn.
- Confirm the existing MM Acquisitions launcher appears in the established MM dock position.
- Confirm no duplicate launcher appears.
- Move the dock/panel if previously customized and verify the existing position is preserved.
- Open and close Acquisitions several times.

PASS:
- one launcher;
- no collision with Torn native bottom controls;
- panel opens/closes normally;
- existing layout position is preserved.

### 2. Pricelist primary workflow

- Open Acquisitions and confirm **Pricelist** is the first screen.
- Confirm the top navigation contains only **Pricelist**, **Ranked Weapons**, and **More**.
- Confirm every priced item from the configured pricelist is reachable through paging/filtering.
- Confirm each visible row shows:
  - item name / ID;
  - pricelist buy rate;
  - known Bazaar price or dash;
  - known Item Market price or dash;
  - known Travel price or dash when applicable;
  - cheapest currently known source;
  - **AT / UNDER BUY RATE**, **ABOVE BUY RATE**, or **CHECK PRICE**;
  - estimated resale / profit / ROI when evidence is available.
- Confirm each row exposes **Check Prices**, **GO TO BAZAAR**, **GO TO ITEM MARKET**, and Travel when applicable.
- Use Check Prices on one item and confirm the detailed comparison still asks **WHERE DO YOU WANT TO BUY?**.
- Confirm direct Bazaar routing verifies a concrete seller before opening that Bazaar.
- Confirm direct Item Market routing opens the exact selected item.
- Confirm no action completes the purchase.

PASS:
- the normal non-ranked workflow can be completed entirely from Pricelist;
- every customer pricelist item remains reachable;
- buy-rate status is obvious without interpreting advanced metrics;
- Bazaar / Item Market destination choice is unambiguous.

### 2A. More tools are secondary

- Open **More**.
- Confirm Find One Item, Best Deals, Travel Deals and Setup / Advanced are available.
- Confirm none of those tools appear as equal top-level tabs.
- Open one More subtool and confirm a **← More tools** path is visible.
- Confirm advanced settings and Market Activity remain optional/supporting.

PASS:
- supporting features remain available without competing with the two core customer jobs.

### 3. Verified Sales evidence

Use a ranked weapon or armor item with completed Auction House history.

- Open Ranked or a selected eligible item.
- Click Load Sales / Load Verified Sales.
- Confirm official Torn completed-auction history loads.
- Click Verified Sales (N).
- Confirm the in-panel Verified Sales card is reached directly.
- Confirm the card shows:
  - item name;
  - official Torn API finished Auction House provenance;
  - completed-sale count;
  - last sync age;
  - newest completed-sale timestamp;
  - realized sale price;
  - bid count when present;
  - rarity / bonuses when present;
  - sale ID when present.
- Confirm Hide removes the evidence card.
- Confirm no third-party sales-history site is required.

PASS:
- evidence is readable and clearly distinguished from current asks/bids;
- completed auctions are not described as current market prices.

### 4. Ranked Weapons primary workflow

- Open Ranked Weapons.
- Confirm the page states that no bonus is excluded.
- Refresh Weapons.
- Verify Primary / Secondary / Melee filters.
- Verify Bazaar / Item Market / Auction source filters.
- Confirm each visible row leads with:
  - current price / current bid;
  - estimated value;
  - estimated profit and ROI;
  - completed-sale traffic for 7 / 30 / 90 days.
- Confirm an item below its BB floor is visibly labeled **UNDER BB VALUE**.
- Confirm other positive-value opportunities can be labeled **INVESTMENT CANDIDATE** or **WATCH / BID CANDIDATE** as appropriate.
- Confirm BB value, AH median, confidence, liquidity, investment/watch score and Market Activity are behind **Valuation details**.
- Load official completed Auction House history for at least one weapon.
- Confirm **Completed Sales (N)** reaches the official Torn completed-sale evidence.
- For auctions, confirm current bid, maximum/break-even bid ceiling, headroom, bid count and time remaining remain visible.
- Confirm the action button clearly identifies Bazaar, Item Market, direct Torn auction when available, or the auction finder fallback.

PASS:
- the ranked workflow can be understood from price, value, ROI and sales traffic without reading advanced metrics;
- no bonuses are silently excluded;
- no $1/low bid is presented as a guaranteed purchase;
- completed-sale history and current auction bids remain distinct.

### 5. Market Pulse

Allow enough time for at least two valid Item Market snapshots for a tracked item.

- Confirm source strip shows Pulse update age, proven/candidate counts and request budget.
- Confirm proven movers remain above candidates.
- Confirm quantity growth is not counted as a movement.
- Confirm displayed metrics include movement rate, units/hour, turnover/hour, liquidity, depth, confidence, trend and freshness.
- Confirm source/fetch ages are visible.
- Confirm Export Diagnostics produces sanitized output with no API key, seller target, mug, attack, combat or private faction/customer data.

PASS:
- no fabricated freshness;
- no seller-target reconstruction;
- stale/ambiguous evidence is visibly downgraded or rejected.

### 6. Cross-tab ownership

Open two visible Torn tabs with Acquisitions installed.

- Keep both tabs open for several refresh cycles.
- Observe Market Pulse request-budget/source-strip behavior and browser network requests if practical.
- Confirm only one tab owns active Pulse polling at a time.
- Close the owner tab and confirm the remaining tab can acquire ownership after lease expiry.

PASS:
- no duplicate polling engine;
- ownership transfers after expiry/close without permanent lockout.

### 7. Supporting workflows

From **More**, check:
- Find One Item;
- Best Deals;
- Travel / Overseas;
- Faction Armory procurement handoff;
- Setup / Advanced;
- purchase ledger sync.

PASS:
- supporting workflows remain available;
- none replaces or obscures the primary Pricelist / Ranked Weapons paths;
- no regression in Bazaar, Item Market, Auction, Travel, pricelist or ranked behavior.

### 8. Manual final-action boundary

Use a safe item and run Use Best Source.

PASS:
- Acquisitions may open the appropriate Torn source page;
- it does not press BUY;
- it does not enter quantity;
- it does not submit an auction bid;
- it does not complete travel or any purchase automatically.

## Narrow / mobile browser

At a narrow desktop viewport or supported mobile browser:

- verify the panel remains within the viewport;
- internal content scrolls;
- action buttons wrap instead of overflowing;
- launcher does not collide with native controls;
- drag/position behavior remains usable.

PASS:
- all primary workflows remain reachable and readable.

## TornPDA

Install 8.0.0-alpha.27-pda.14.

- Confirm TornPDA also opens on Pricelist and shows only Pricelist / Ranked Weapons / More as primary navigation.

### Boot

- Confirm one launcher appears above TornPDA bottom chrome.
- Open the panel.
- If the boot diagnostic appears, record its stopped-at stage.

PASS:
- script reaches ui-ready and opens normally.

### State and API key

- Confirm existing Acquisitions state is preserved.
- Confirm the injected TornPDA key works without exposing it on window/globalThis.
- Confirm no GM helper monkey-patch failure occurs.

### Item Market duplicate-request protection

- Find/verify one Item Market item.
- Confirm a single workflow does not fire the same Item Market GET twice inside the TornPDA suppression window.
- Confirm the just-verified snapshot is reused for the immediate route.

PASS:
- no false Item Market verification failure caused by duplicate GET suppression.

### Travel alternatives

- Open Travel Deals and choose an item where Travel is the cheapest known source.
- Confirm the row still shows **Check All Prices**, **GO TO BAZAAR**, **GO TO ITEM MARKET**, and **GO TO TRAVEL AGENCY**.
- From an Item comparison where Travel is cheapest, confirm Acquisitions stays on the comparison and explains that Bazaar or Item Market can still be opened.
- Confirm GO TO BAZAAR can resolve aggregate Bazaar evidence to a verified seller before opening that seller's Bazaar.
- Confirm GO TO ITEM MARKET opens the exact item search.
- No button may complete a purchase automatically.

### Travel handoff

- Exercise the Torn -> TornW3B Travel Stock -> Torn handoff without making a purchase.
- Confirm travel capture persists through PDA_storage across origins and returns to Torn correctly.

### Market Pulse

- Confirm Pulse is bundled and functions without @require.
- Confirm source strip / Pulse evidence appears.
- Confirm background cadence does not create duplicate identical requests.

## Completion

The candidate can be considered live-accepted only when:
- desktop PASS;
- verified-sales evidence PASS;
- cross-tab ownership PASS;
- narrow/mobile PASS;
- TornPDA PASS;
- manual-action boundary PASS;
- no unresolved DEFECT remains.

After Acquisitions Market Pulse is proven here, Inventory Manager and Faction Armory may be updated to consume it read-only. They must not add duplicate collectors.
