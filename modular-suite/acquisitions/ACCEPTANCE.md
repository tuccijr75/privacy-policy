# MM_Acquisitions Acceptance — Standalone Customer Product

## Candidate

- Desktop: 8.0.0-alpha.36
- TornPDA: 8.0.0-alpha.36-pda.23
- Branch: crm-v8-acquisitions-standalone-pricelist-alpha35
- Base: crm-v8-acquisitions-standalone-alpha34
- Stable/customer publication: not approved
- Status: non-production candidate
- Final purchase, bid, travel and transfer actions remain manual.

## Alpha.36 standalone customer profile + PDA contract correction

Alpha.36 preserves the alpha.35 customer-profile behavior and corrects the TornPDA platform boundary. The PDA adapter no longer assigns or replaces GM_getValue, GM_setValue, GM_deleteValue, or GM_xmlhttpRequest. Acquisitions now owns a local GET bridge that uses native GM_xmlhttpRequest when available and falls back to PDA_httpGet without mutating global GM helpers. Cross-origin Travel handoff remains on lexical PDA_storage.


### Contract

- Acquisitions is the sole owner/writer/provider adapter for the optional Customer Pricelist Profile.
- Canonical state is `procurement.pricelist.profile`, schema 1.
- Accepted input is `https://weav3r.dev/pricelist/<numeric-id>`; a numeric ID may be normalized as a convenience.
- No customer-specific Pricelist ID or URL is embedded as a runtime default.
- Legacy cached Pricelist rows are preserved but inert until a valid profile is explicitly configured.
- Save & Refresh validates and fetches before replacing the active profile.
- Failed/invalid profile input does not replace the active profile.
- The provider exposes no reliable source timestamp here, so `sourceUpdatedAt` remains `null`; `lastSyncAt` is local fetch time only.
- Clearing the profile disables customer buy-rate and BB-floor use without deleting historical cached rows.
- Ranked Weapons consumes the same active profile; there is no second customer-ID setting.
- Market Pulse tracks Pricelist items only while the shared profile is active.
- No new collector, scheduler, credential, provider, or automated purchase/bid/travel action is introduced.

### Live acceptance

- [ ] With no configured profile, customer-specific Pricelist rows/BB floors are inactive and no customer ID is prefilled.
- [ ] Save & Refresh an authorized customer-owned Weav3r Pricelist link; rows and BB rate activate only after a successful fetch.
- [ ] Ranked Weapons uses the same BB rate and exposes no duplicate Pricelist ID field.
- [ ] Invalid/foreign input does not replace the active profile.
- [ ] Clear the profile; cached rows remain preserved but inactive while unrelated workflows continue.
- [ ] Recheck Pricelist, Find One Item, Best Deals, Ranked Weapons, Travel, Inventory Restock, Market Pulse freshness, route guards and manual-action boundaries.
- [ ] Repeat the profile flow on TornPDA alpha.36-pda.23.
- [ ] Do not merge or publish until owner accepts desktop and PDA live results.
## Product boundary

MM_Acquisitions is a customer-facing standalone procurement and market-intelligence product.

It owns:
- customer pricelist procurement;
- one-item source comparison;
- Best Deals;
- ranked-weapon valuation and source comparison;
- Bazaar / Item Market / Auction / Travel routing;
- Torn Intel travel stock and restock intelligence;
- Market Pulse collection, cache, movement, liquidity, confidence and sanitized diagnostics;
- purchase-ledger evidence;
- Inventory-owned restock-demand consumption.

It must not require any private/personal companion product to exist.

### Isolation requirements

The Acquisitions desktop runtime, Acquisitions UI, Market Pulse producer, tests and customer acceptance must contain no:
- private-product demand state dependency;
- external private-product request event;
- private-product wording or acquisition cards;
- private-product prioritization in Market Pulse;
- requirement that another product be installed before Acquisitions functions.

The shared Core may preserve unrelated suite state opaquely so customer-owned state is not destroyed. Acquisitions must not read, rank, interpret or require unrelated product state.

## Generic procurement request contract

Acquisitions may keep its own product-neutral procurement-request renderer for legitimate customer workflows.

Current producer:
- Inventory Restock Demand inside Acquisitions.

Required fields:
- itemId;
- itemName;
- qty;
- preferredSource;
- requestKind;
- reason.

Current request kind:
- `inventory-restock`.

The request remains local to Acquisitions UI state. Cross-product acquisition-request events are not part of the customer contract.

## Market Pulse ownership

Market Pulse remains Acquisitions-owned.

Its tracked-item universe must be derived only from Acquisitions/customer requirements:
- already tracked Pulse items;
- current pricelist items;
- current marketplace items;
- ranked-weapon items;
- travel items;
- other Acquisitions-owned customer workflows explicitly added later.

Market Pulse must not consume unrelated product-demand state.

Required safeguards:
- one-engine lease;
- API-budget and cache-delay scheduling;
- source timestamp and local fetch time;
- stale/error behavior;
- source-time regression rejection;
- inventory-increase rejection as movement;
- bounded caches/history/rejections;
- credential-safe diagnostics;
- no seller-target/mug/attack logic.

## Desktop acceptance

### Pricelist
- [ ] Starts on Pricelist.
- [ ] Customer Pricelist loads and filters.
- [ ] Bazaar, Item Market and Travel evidence show independently.
- [ ] Inventory Restock Demand appears when shared Inventory demand exists.
- [ ] Compare Sources renders a product-neutral procurement card.
- [ ] No private-product wording appears.
- [ ] Final source routing remains manual.

### Find One Item
- [ ] Item search resolves human-readable names.
- [ ] Torn Shop, Bazaar, Bazaar aggregate, Item Market and Overseas evidence are distinguished.
- [ ] Separate resale evidence is required before profit is shown.
- [ ] No unavailable source is fabricated.

### Best Deals
- [ ] Refresh is read-only.
- [ ] stale/weak evidence is disclosed.
- [ ] Market activity is not presented as a confirmed individual sale.
- [ ] final purchase remains manual.

### Ranked Weapons
- [ ] Verified Sales uses official Torn API finished Auction House evidence.
- [ ] Bazaar / Item Market / Auction source filters work.
- [ ] finished Auction House evidence is labeled official Torn API evidence.
- [ ] early low bids remain watch-only/provisional.
- [ ] break-even bid ceiling and valuation details remain visible.
- [ ] no automatic bid or purchase occurs.

### Travel
- [ ] Torn Intel is preferred when available; fallback provenance is visible.
- [ ] stale travel stock is hidden from recommendations.
- [ ] refresh restores current scoped destination ranking.
- [ ] ranking components are visible; no hidden country score.
- [ ] no restock time is fabricated without usable observed history.
- [ ] travel remains manual.

### Market Pulse
- [ ] tracked universe is Acquisitions/customer-owned only.
- [ ] movement and turnover reject integrity failures.
- [ ] stale/error state is visible.
- [ ] one-engine lease prevents duplicate collection.
- [ ] diagnostics contain no API key or private-product data.

### State preservation
- [ ] existing schema-11 shared state survives Acquisitions reads/writes.
- [ ] unrelated product domains are preserved without being interpreted by Acquisitions.
- [ ] fresh-install bootstrap remains explicit.
- [ ] invalid state is not silently replaced by fabricated data.

### UI
- [ ] shared dock launcher works.
- [ ] panel remains readable at desktop and narrow desktop widths.
- [ ] no MM/MM panel collision after the shared Core collision fix is integrated.
- [ ] item names are used instead of numeric-only placeholders where names exist.

## TornPDA acceptance

The PDA bundle must remain self-contained when `@require` is unreliable.

- [ ] lexical injected PDA key only;
- [ ] no immutable GM helper monkey-patching;
- [ ] lexical `PDA_storage` durable/cross-origin handoff;
- [ ] `PDA_httpGet` thin GET fallback only;
- [ ] identical-request deduplication preserved;
- [ ] Acquisitions UI and Market Pulse sections contain no private-product coupling;
- [ ] generic procurement request behavior matches desktop;
- [ ] final actions remain manual;
- [ ] real device acceptance completed after desktop candidate is proven.

## Cross-tab ownership

Acquisitions may listen for the generic shared-state `state-updated` notification so its open panel can re-read current shared state.

It must not accept product-specific acquisition-request events from unrelated products.

## Downstream consumers

After Acquisitions Market Pulse is proven, downstream products may consume its published market intelligence read-only. They must not add duplicate collectors or control the producer's tracked-item universe through private product state.

## Manual-action boundary

Safe automation may refresh, rank, compare, cache and reconcile evidence.

Purchases, bids, travel, transfers and other irreversible Torn actions remain human-controlled.

## Release gate

Before merge/publication:
- full desktop source/domain/failure/state-preservation tests pass;
- PDA build/parity tests pass;
- path diff proves unrelated private-product files were not modified;
- live customer acceptance passes without any private-product installation requirement;
- owner explicitly approves merge/publication.

## Live alpha.35 desktop verification — 2026-10-07

Verified against the installed desktop candidate `8.0.0-alpha.35`.

PASS:
- customer Pricelist starts unconfigured; no customer-specific profile is prefilled;
- legacy cached Pricelist rows remain preserved but inactive while no profile is configured;
- invalid foreign profile input does not activate or replace the customer profile;
- owner-authorized customer profile Save & Refresh succeeds and normalizes the numeric reference to the canonical Weav3r Pricelist URL;
- authorized profile produced 125 priced items and a shared BB rate of `$6,043,500`;
- Ranked Weapons consumed that same `$6,043,500` BB rate and exposed no duplicate customer-ID field;
- clearing the customer profile disabled customer buy-rate/BB-floor use while preserving all 125 cached rows as inactive;
- the authorized customer profile was restored after the Clear test and left active;
- Ranked live Bazaar / Item Market / Auction evidence and completed-sale history remained available independently of the optional customer profile;
- Find One Item live-tested with Xanax and returned Bazaar, Item Market and Travel choices without executing a purchase;
- Find One Item explicitly preserved the manual final-purchase boundary;
- Best Deals rendered live Recommended Deals / Refresh Deals / Check & Open controls without automatic purchase behavior;
- shared MM dock launcher and alpha.35 panel restoration were observed on live Torn pages;
- Inventory Restock Demand surfaced in the standalone Acquisitions Pricelist workflow without private-product wording.

Pending:
- Travel Deals subview live acceptance because the current Opera accessibility bridge does not reliably dispatch that custom tab control;
- actual abroad/travel-state route-guard acceptance;
- Setup / Advanced Market Pulse diagnostic disclosure live acceptance because the current Opera accessibility bridge does not reliably dispatch that custom tab control;
- TornPDA `8.0.0-alpha.35-pda.22` real-device acceptance.

No merge, stable publication or customer publication is authorized by this verification.

## Live alpha.35 desktop continuation — 2026-10-08

Additional live verification against `8.0.0-alpha.35`:

PASS:
- Travel Deals opens in the live Acquisitions panel;
- stale travel stock is hidden until refresh rather than being ranked as current;
- Refresh Travel Stock returned 229 current item/country rows from Torn Intel;
- destination ranking exposes its ranking components and explicitly states there is no hidden country score;
- Restock Watch identifies its estimates as MM calculations from observed Torn Intel history, with history calls on-demand and rate-limited;
- out-of-stock rows without usable observed history show `No restock history loaded` instead of fabricating an ETA;
- Travel Deals states that Torn Intel is preferred when available, TornW3B is fallback, and travel/purchases remain manual;
- Setup / Advanced Market Activity live UI reports source `Torn API v2 Item Market`, 36 cached items, 0 proven, 36 candidates, request budget `0/45` in the last minute, and recent update age;
- Market Activity live UI explicitly describes seller-free intelligence, one cross-tab engine lease, bounded cache/history, cache-delay-aware cadence, and a local request-budget governor, with no seller-target/mug/attack model retained;
- Export Diagnostics action completed in the UI with `Sanitized Market Pulse diagnostics exported.`;
- Market Pulse regression tests PASS and source/PDA contract tests PASS after the live check;
- serializer regression explicitly rejects API-key exposure and seller/attack/mug fields; private-product coupling remains absent from the Market Pulse source contract.

Verification limitation:
- Opera acknowledged the diagnostics export, but the DevTools-triggered download did not materialize a JSON file in the configured download directory or the searched user drives. Exported artifact bytes were therefore not independently inspected; sanitization is source/regression-verified rather than download-file-verified.

Remaining live gates:
- actual abroad/travel-state route-guard acceptance requires the Torn account to be in a real travel/abroad state;
- TornPDA `8.0.0-alpha.35-pda.22` real-device acceptance remains separate.

No merge, stable publication or customer publication is authorized by this verification.

## Alpha.36 PDA contract verification

Pending live gate:
- TornPDA 8.0.0-alpha.36-pda.23 real-device acceptance.

Deterministic requirements:
- generated PDA contains no GM helper assignment/monkey-patch;
- native GM helpers are used as provided;
- GET-only fallback uses PDA_httpGet locally;
- cross-origin Travel handoff continues through lexical PDA_storage;
- traveling and abroad states preserve the Torn market route guard;
- final Buy/Bid/Travel actions remain manual.

## Live alpha.36 desktop smoke — 2026-10-08

Verified after the TornPDA GM-helper contract correction:

PASS:
- Tampermonkey storage contains Acquisitions `8.0.0-alpha.36` and no remaining alpha.35 script value;
- live Torn panel reports `v8.0.0-alpha.36 · PRICELIST + RANKED`;
- authorized shared customer profile `https://weav3r.dev/pricelist/4054377` persisted through the update;
- `Data status: READY` after reload;
- live Refresh Pricelist succeeded through the desktop native GM request path: 125 priced items, source TornW3B Pricelist API, `$6,120,000/BB`, fresh update timestamp;
- live Market Pulse refresh succeeded through Torn API v2 and reported `Market Pulse refreshed item 985.`;
- no purchase, bid, transfer, travel, or other irreversible Torn action was executed during the smoke test;
- the temporary test tab was restored to its original Bazaar URL after verification.
- executable travel-state guard tests PASS for Torn/home, Traveling, Abroad, and unknown parsing; Traveling and Abroad both block Torn market routing.

Remaining live gates:
- actual traveling/abroad route-guard behavior requires the account to be genuinely traveling or abroad; do not initiate travel for testing;
- TornPDA `8.0.0-alpha.36-pda.23` real-device acceptance.

No merge, stable publication or customer publication is authorized by this verification.
