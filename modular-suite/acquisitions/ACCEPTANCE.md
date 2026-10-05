# MM_Acquisitions Acceptance

Candidate:
- Desktop: 8.0.0-alpha.24
- TornPDA: 8.0.0-alpha.24-pda.11
- Branch: crm-v8-acquisitions-alpha22-clarity
- Base: crm-v8-acquisitions-ranked-profit
- Stable/customer publication: not approved

## Simplified workflow

On first open, Acquisitions must land on **Home**.

The normal user path is:

1. **Find One Item** — search by item name or Torn item ID.
2. **Check Prices** — compare Bazaar, Item Market, Torn shop, and Travel when available.
3. **Choose a destination** — use the large **GO TO BAZAAR**, **GO TO ITEM MARKET**, or **GO TO TRAVEL AGENCY** button.
4. Complete any purchase, bid, or travel action manually in Torn.

The user should not need to understand Market Pulse, liquidity, velocity, confidence, BB floor, or other advanced terms to complete this path. Advanced data must remain behind expandable details or specialist pages.

## Purpose

Run this once after the source candidate is complete. Record each finding as PASS, DEFECT, UX FRICTION, EFFECTIVENESS GAP, or MISSING FEATURE.

Do not complete a purchase, bid, travel purchase, transfer, or other irreversible action as part of this acceptance pass.

## Desktop

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

### 2. Home and Find Item workflow

- Open Acquisitions and confirm **Home** is the first screen.
- Confirm Home explains the order: choose item → compare prices → open source → buy manually.
- Confirm the glossary is collapsed behind **What do these words mean?**
- Open **Find Item**.
- Search Can of Crocozade or another ordinary item and click **Check Prices**.
- Confirm the selected-item card shows:
  - Cheapest Price;
  - Likely Resale;
  - Estimated Profit;
  - Return on Cost (with ROI explained as the alternate name).
- Confirm the item card clearly asks **WHERE DO YOU WANT TO BUY?**.
- Confirm **GO TO BAZAAR** says it opens player-owned bazaars.
- Confirm **GO TO ITEM MARKET** says it opens Torn Item Market for that item.
- Confirm Bazaar / Item Market / Travel alternatives appear as direct actions when those sources exist.
- Confirm advanced source details and market-activity metrics are collapsed.
- Confirm Market Activity says observed listing movement is not a confirmed individual sale.

PASS:
- a new user can follow the workflow without knowing advanced market terminology;
- no source or exit value is mislabeled;
- no observational market movement is presented as a confirmed sale.

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

### 4. Ranked

- Refresh Ranked.
- Verify Primary / Secondary / Melee filters.
- Verify Bazaar / Item Market / Auction source filters.
- Confirm live Bazaar and Item Market rows show Ask / Fair / Profit / ROI.
- Confirm Auction rows show Current bid, fair value, max/break-even bid ceiling, headroom, bid count and time remaining.
- Confirm live auctions sort by watch score, not purchase investment score.
- Load official completed Auction House history for at least one weapon.
- Confirm 7/30/90 traffic, AH confidence/liquidity and Market Pulse metrics remain visible.

PASS:
- no $1 or low-bid auction is presented as a guaranteed purchase;
- completed-sale evidence and live-bid semantics remain separate.

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

### 7. Existing workflows

Check:
- Deals;
- Pricelist Universe scan;
- Items;
- Ranked;
- Travel / Overseas;
- Faction Armory procurement handoff;
- Settings;
- purchase ledger sync.

PASS:
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

Install 8.0.0-alpha.24-pda.11.

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
- Confirm the row still shows **Check All Prices**, **Open Bazaar**, **Open Item Market**, and **Travel Agency**.
- From an Item comparison where Travel is cheapest, confirm Acquisitions stays on the comparison and explains that Bazaar or Item Market can still be opened.
- Confirm Open Bazaar can resolve aggregate Bazaar evidence to a verified seller before opening that seller's Bazaar.
- Confirm Open Item Market opens the exact item search.
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
