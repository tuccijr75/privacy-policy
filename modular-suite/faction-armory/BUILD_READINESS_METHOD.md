# MM Faction Armory — Build Readiness Method

Status: non-production / alpha research model  
Date: 2026-10-06

## Purpose

This model answers three separate questions and keeps them separate:

1. **Is the member's known current equipment adequate for war?**
2. **If not, can the faction issue a suitable item already in stock?**
3. **If not, what generally available item should MM_Acquisitions source?**

Faction inventory does **not** define the readiness standard. It only changes the route from `ACQUIRE` to `ISSUE` when adequate stock already exists.

The module deliberately does not query Item Market or player Bazaars for live listings. Acquisition uses a curated reference catalog of normal Torn equipment that is broadly obtainable through city/abroad shops or commonly traded player-market supply.

## Combat-stat interpretation

Torn separates the main combat comparisons:

- Strength contributes to damage.
- Defense reduces incoming damage.
- Speed contributes to hit chance.
- Dexterity contributes to avoiding attacks.
- Weapon Damage multiplies damage output.
- Weapon Accuracy modifies hit chance.

This means a simple rule such as “high Strength means choose a higher-Damage weapon” is incomplete. A player can already have strong raw damage but weak hit chance.

The current equipment preference therefore compensates the weaker offensive axis:

- `Strength > Speed × 1.20` → accuracy preference.
- `Speed > Strength × 1.20` → damage preference.
- otherwise → balanced.

This preference is a tie-break / ranking aid. It is not a substitute for actual weapon bonuses, ammo, mods, weapon experience, opponent stats, or special combat roles.

## Build shape

STR / DEF / SPD / DEX distribution is summarized into a descriptive shape:

- Balanced
- Baldr-like / balanced specialization
- Hank-like / specialized
- Offense-heavy
- Defense-heavy
- Dexterity-heavy

These labels describe stat distribution. They do not directly set the routine equipment floor.

Relative faction battle-stat rank is retained only as **premium allocation priority** when scarce/high-value equipment must be assigned. It does not determine whether an ordinary weapon or armor item is war-ready.

Level is retained as survivability context because base life grows with level. Level does not directly raise or lower the routine weapon requirement.

## Routine generally-available baseline

The routine catalog currently contains examples such as:

### Primary
- Benelli M4 Super
- Mag 7
- AK-47
- Jackhammer
- ArmaLite M-15A4 as a premium generally-available option

### Secondary
- BT MP9
- Qsz-92

### Melee
- Macana
- Diamond Bladed Knife

### Armor
- Combat Helmet
- Combat Vest
- Combat Gloves
- Combat Pants
- Combat Boots

Weapon comparisons use a simple expected-output proxy based primarily on Damage × Accuracy.

**Readiness pass/fail is neutral.** The member's Strength/Speed-derived offensive preference does not move the readiness floor and does not downgrade otherwise adequate current gear. Offensive preference is used only to rank already-qualifying alternatives when several choices meet the same objective floor.

A recommended item's **minimum normal stat roll**, rather than its midpoint roll, is used as the readiness floor. A normal copy of a recommended item therefore does not fail readiness merely because it rolled below the item's midpoint.

Known stronger personal equipment is always retained.

## Special / Ranked War equipment

Ranked War bonuses, weapon mods, ammo, weapon experience, and advanced armor set bonuses can materially change the value of equipment.

If the script knows an item's name but cannot measure enough performance data to compare it safely, the result is:

`REVIEW CURRENT GEAR`

That slot is excluded from automatic acquisition quantity until it can be evaluated, preventing accidental replacement of a superior RW/special item.

For advanced armor, full-set coherence matters. Examples:

- Sentinel pieces increase Defense passives and the complete set adds an additional set bonus.
- Vanguard pieces increase Dexterity passives and the complete set adds an additional set bonus.

The routine baseline therefore does not automatically break a coherent advanced armor set just to improve one piece's raw armor value.

## Build routes

Each standard slot resolves to one of these routes:

- **KEEP** — known current equipment meets/exceeds the objective baseline.
- **LOANED** — an already-assigned faction loan appears sufficient; verify it is equipped.
- **ISSUE** — adequate unloaned faction stock exists.
- **ACQUIRE** — faction stock does not cover the requirement; add the generally available target to the acquisition plan.
- **REVIEW** — current gear exists but cannot be safely scored yet.

## Acquisition plan

The Acquire screen aggregates all member requirements into a single list:

- item
- quantity
- general source
- non-live reference value when known
- reason / members driving the quantity

War mode derives participant count directly from the current faction roster and adjusts automatically as members join or leave. It also preserves two ready-to-issue equipment spares per standard slot.

Provision shortfalls from the active War/Peace minimum policy are added to the same acquisition list.

Unresolved REVIEW slots are shown separately and are not included in automatic buy quantity.

## Secondary weapon handling

Torn's official weapon model includes Primary, Secondary, Melee and Temporary slots. Some types, including SMGs and shotguns, can occupy more than one slot.

Faction Inventory API v2 returns each armory item's specialized market `type`. The Armory parser now retains that type and also uses known item-name mappings for ambiguous cases such as BT MP9 and Qsz-92. Secondary inventory is displayed as a dedicated subgroup.

## Sources

- Torn Battle Stats: https://wiki.torn.com/wiki/Battle_Stats
- Torn Weapon Stats: https://wiki.torn.com/wiki/Weapon_Stats
- Torn Weapon / slot and stat ranges: https://wiki.torn.com/wiki/Weapon
- Torn Armor / advanced set bonuses: https://wiki.torn.com/wiki/Armor
- Torn Item Market categories: https://wiki.torn.com/wiki/Item_Market
- Torn API v2 Swagger: https://www.torn.com/swagger.php
- Torn API v2 OpenAPI: https://www.torn.com/swagger/openapi.json

## Known limitations

- Damage × Accuracy is a planning proxy, not a full combat simulator.
- Opponent-specific Defense and Dexterity are not known when preparing a generic faction build.
- RW weapon bonuses, mods, ammo, weapon experience and advanced armor bonuses require richer item-specific scoring.
- Static reference availability/value data may become stale; it does not replace live procurement verification.
- MM_Acquisitions verifies live price and availability outside this module before any manual purchase.

These limitations are intentional: the module determines **what** is needed; procurement tooling determines **where and at what price** to buy it.


## Member-owned inventory before acquisition

Acquisition is shortfall-based, not standardization-based. For each standard slot the route order is:

1. known equipped item;
2. adequate member-owned personal inventory item;
3. adequate faction item already loaned to that member;
4. adequate unloaned faction stock;
5. acquire the generally available reference item;
6. if current gear or member inventory is not sufficiently known, mark the slot unresolved and defer the purchase.

Member inventory is imported from the user's authorized Torn API inventory selection and stored only as the readiness profile's non-secret item summary. Faction-owned/loaned rows are excluded from the member-owned pool where the API identifies them as faction items, preventing double-counting.

A member-owned item that meets or beats the active readiness floor resolves to `OWNED — EQUIP / VERIFY`; it must not generate a duplicate purchase.

## Small-faction procurement modes and budget

The module has three planning modes:

- **Budget** — default. Uses lower-cost generally available examples that still satisfy the selected readiness floor.
- **Standard** — stronger routine equipment reference set.
- **Ideal** — premium planning reference; not routine purchase authorization.

The default known-cost acquisition cap is **$15,000,000**. The cap is editable locally. Acquisition output is split into:

- required quantity;
- buy-now quantity within the cap;
- deferred quantity;
- known buy-now reference cost;
- known deferred reference cost.

Unpriced provision lines remain requirements but do not consume the known-cost budget calculation until a reference price exists.

Members with verified battle stats continue to use those exact stats. Members without private stats may receive a clearly labeled balanced planning estimate from public Torn rank/profile data; those estimated builds can create provisional requirements but can never be approved WAR READY. Unknown-performance current gear remains unresolved rather than being replaced speculatively. Faction loans assigned to a member are treated as known equipment evidence before acquisition.

Budget-mode examples currently include lower-cost common equipment such as AK-47 / Mag 7 / Benelli M4 Super, BT MP9, Macana, WWII Helmet, Bulletproof Vest, Kevlar Gloves, Safety Boots, and Combat Pants where no sensible mid-tier general alternative exists. Standard and Ideal modes may recommend stronger/more expensive references.


## Canonical member readiness workflow

Members, Builds, leadership export, and acquisition planning now derive from the same per-member build assessment.

The canonical readiness states are:

- **MISSING DATA** — battle stats or equipped gear are not sufficiently known.
- **STALE DATA** — the saved readiness profile is older than the configured freshness window.
- **SUPPLY ACTION** — required medical/Ipecac readiness data reports an action is still needed.
- **ACTION NEEDED** — current data is usable, but one or more standard equipment slots do not yet meet the active build baseline or still require equip/issue/acquisition/review.
- **READY FOR REVIEW** — all eight standard equipped slots meet the active build baseline and the member is ready for an Inventory Manager/leadership review.
- **WAR READY** — the same passing build has been explicitly approved by the Inventory Manager/leadership.

\`WAR READY\` is therefore an approval state, not merely the automatic result of the equipment scorer.

The approval is bound to:

- the member profile's current \`verifiedAt\` timestamp; and
- the active procurement mode (\`budget\`, \`standard\`, or \`ideal\`).

Refreshing a member profile invalidates the previous approval and returns a still-passing build to \`READY FOR REVIEW\`. Changing procurement mode also requires review under the newly selected baseline.

The Members tab provides **Approve / War Ready** only when the automatic build baseline passes. An approved member can be returned to **READY FOR REVIEW** with **Reopen Review**.

## Build suggestion pipeline

For each member:

1. Battle stats are normalized into Strength, Defense, Speed, and Dexterity.
2. The script derives a build shape and an offensive need:
   - Strength materially above Speed → prefer Accuracy support.
   - Speed materially above Strength → prefer Damage support.
   - otherwise → balanced.
3. The active procurement mode selects a generally available target for each standard slot:
   - **Budget** keeps candidates at least 80% of the best routine performance in the slot, then chooses the least expensive viable reference.
   - **Standard** raises the retention threshold to 92% of best routine performance, still favoring value among viable references.
   - **Ideal** includes premium references and selects the highest-performance option only when its gain is material (currently at least 12%) or its cost is not more than 2.25× the value target.
4. The target's minimum normal stat roll becomes the readiness floor.
5. The member's currently equipped item is compared against that floor. Known adequate equipped gear is always kept, even when it is more expensive than the reference target.
6. If current gear does not resolve the slot, the route order is:
   - adequate member-owned item → **OWNED — EQUIP / VERIFY**;
   - adequate faction item already loaned to that member → **LOANED / VERIFY**;
   - adequate unloaned faction stock → **ISSUE**;
   - otherwise the generally available target → **ACQUIRE**;
   - unknown-performance current gear → **REVIEW**, never automatic replacement.
7. The member's Build tab and Members tab consume this same assessment object so automatic readiness cannot disagree between views.

Weapon performance uses the documented Damage × Accuracy expected-output proxy with a modest adjustment for the member's offensive need. Armor uses armor rating. Premium allocation priority uses relative battle-stat rank but does not change the ordinary readiness floor.

## Acquisition construction

The acquisition list is shortfall-based rather than standardization-based.

For the selected War/Peace mode and procurement mode:

1. Member rows are generated using the same canonical build assessment shown in Members and Builds.
2. Members with missing battle stats are deferred as unresolved instead of generating speculative purchases.
3. For each unresolved standard slot, the planner first consumes:
   - adequate equipped gear;
   - adequate member-owned inventory;
   - adequate assigned faction loans;
   - adequate unloaned faction stock.
4. When faction stock can cover a slot, the allocation prefers the **least-cost item that still meets the readiness floor**. This avoids wasting premium equipment where a cheaper adequate item exists.
5. Only remaining equipment shortfalls become named acquisition requirements.
6. War mode also preserves two ready-to-issue equipment spares per standard slot.
7. Medical, temporary, drug, booster, and consumable shortfalls from the active minimum-stock policy are added to the same acquisition list.
8. Requirements are prioritized by slot/category, then the configured acquisition budget is applied to known reference prices. Quantities outside the budget become deferred.
9. Items with no reliable reference price remain required but do not consume known-cost budget until live procurement resolves a price.
10. MM Faction Armory decides **what and how many** are needed. MM_Acquisitions performs live source verification and routing before any manual purchase.

The planner deliberately does not purchase around unresolved unknown-performance gear or unknown member inventory. Those slots remain visible as unresolved until data is sufficient.


## Alpha.19 dynamic roster, public estimates, reminders, and leadership acquisition output

### Dynamic roster sizing

War planning no longer accepts a fixed participant assumption. The active roster from Torn faction membership is the participant set for:

- member build coverage;
- per-member war supply packages;
- routine equipment pool requirements;
- two-spare equipment reserves;
- acquisition planning; and
- leadership reporting.

If the faction roster grows or shrinks, the next faction refresh changes the planning population automatically.

### Missing private battle stats

Verified member API/screenshot data always takes precedence.

When verified battle stats are unavailable, the module may create a **balanced planning estimate** from public information obtainable through the faction/public Torn API surface. Current inputs are:

- level;
- Torn rank;
- Torn age in days;
- public crime-total information when available;
- public networth information when available;
- faction tenure/position as retained context.

Torn Rank is driven by rank triggers from Level, Crimes, Networth, and Battle Stats. The estimator subtracts the known non-battle triggers from the visible Rank trigger count to infer a broad hidden-battle-stat band. It then creates an equal STR/DEF/SPD/DEX planning profile inside that band, using account age only as a modest position within the range.

This estimate is deliberately labeled **ESTIMATED — NEEDS DATA**. It is not treated as the member's actual battle stats, and it cannot be approved **WAR READY**. Rank estimation has known uncertainty from ghost ranks and heavily unbalanced stat distributions.

Current reference:
- Torn Rank trigger model: https://wiki.torn.com/wiki/Rank
- Torn API v2 endpoints/schemas: https://www.torn.com/swagger.php and https://www.torn.com/swagger/openapi.json

### Equipment evidence when private API data is missing

Faction-armory loans are associated with the borrowing member by Torn member ID. Those assigned loans are used as equipment evidence before creating a purchase.

For every member, including an estimated-stat member, the equipment route remains:

1. verified adequate equipped gear;
2. adequate member-owned gear;
3. adequate faction item already loaned to that member;
4. adequate unloaned faction stock;
5. acquire the active reference target.

An adequate assigned loan therefore suppresses a duplicate acquisition for that slot.

### Missing-data reminders

Members lacking verified private battle stats or complete private equipment data show **Send Data Reminder**.

The reminder asks for either:

- a Limited Access Torn API key; or
- screenshots covering STR/DEF/SPD/DEX, equipped weapons/armor, and medical/war supplies.

The button is per-member and is not shown for members whose required private data is already present. Sending remains manual. The reminder is marked sent only after the operator clicks Torn's real Send control and the workflow sees post-send confirmation; only then does that member's reminder button disappear.

### WAR READY and acquisition

The Acquire planner is regenerated from the current canonical member rows every time the view renders or state changes.

A member whose canonical status is **WAR READY** is excluded from individual build-equipment acquisition because their approved build requirement is fulfilled. They can still affect faction-wide minimum-stock policy through the current roster count.

Members who are not WAR READY remain eligible to contribute unresolved/issue/acquisition needs. Estimated members are clearly identified in acquisition reasons.

### Leadership acquisition report

The Acquire view can prepare a manual Torn message to the faction leader resolved from Torn faction basic data.

The report includes:

- current faction member count;
- approved WAR READY count;
- members not yet WAR READY;
- named individual build acquisition needs for non-WAR-READY members;
- minimum-stock shortfalls;
- combined acquisition quantities;
- lowest/highest cached unit-price estimates from available reference, Item Market, Bazaar, and overseas sources;
- low/high line totals;
- low/high total acquisition estimate; and
- any requirements that remain unpriced.

The report is planning output. MM_Acquisitions remains responsible for live price/availability verification before manual purchasing.


## Alpha.20 equipment stats and cost-ranked alternatives

The canonical readiness floor remains deliberately stable. Broadening the option catalog does **not** silently make members less ready and current market price does not redefine the required performance floor.

### Has versus needs

Every standard member equipment slot now exposes three separate concepts:

- **HAS** — the stats of the member's current item when item-specific stats are available from imported equipment data. These are labeled exact/item data.
- **CATALOG AVG** — the average normal stats for a named weapon/armor piece when only the item model is known. This is explicitly identified as an average, not the unique item's exact roll.
- **NEED / TARGET AVG** — the selected readiness target's minimum normal stats plus its average/range, so the operator can compare the member's current item against the actual requirement without relying on item names alone.

Weapon displays use Damage and Accuracy. Armor displays Armor Rating. The existing score remains a compact comparison aid, but the raw stat values are displayed beside it.

### Broader qualifying alternatives

The stable baseline catalog remains 18 items and continues to choose the readiness floor. A separate alternatives catalog adds 94 additional normal weapon/armor choices, for 112 total recognized options across:

- Primary;
- Secondary;
- Melee;
- Helmet;
- Body;
- Gloves;
- Pants; and
- Boots.

For each member and slot, the alternatives list is filtered against that member's active readiness floor. An option is shown only when its **minimum normal-roll** score meets or exceeds the floor; the average score is used for comparison/ranking after it qualifies. The option list therefore answers **what else can safely satisfy this member's need**, rather than treating one named target as the only acceptable item.

The Build view groups qualifying alternatives by acquisition cost:

- **LOW COST**
- **MID COST**
- **HIGH COST**
- **PRICE UNKNOWN**

Within those groups, the operator sees the option's average/minimum/range stats, performance score, and current planning-cost source. A **Find Best Source** action can hand any individual alternative to MM_Acquisitions for live source verification and manual purchasing.

### Price hierarchy

Faction Refresh makes one broad Torn `/torn/items` request and retains current `market_price` references for recognized equipment. This avoids issuing a separate market request for every possible weapon and armor item.

Displayed planning cost uses the best available source in this order:

1. already-cached Item Market / Bazaar / overseas source information;
2. current Torn `/torn/items` market-price reference;
3. the stable static reference where one already exists;
4. **PRICE UNKNOWN** when none are available.

A Torn market-price reference is a planning value, not proof that a live listing is currently purchasable. MM_Acquisitions remains responsible for live availability and source verification.

### Stat sources and limitations

The expanded normal-stat ranges are based on current Torn weapon and armor reference tables. Recommended values represent normal/base item ranges and averages.

They intentionally do **not** fold the following into the generic alternative comparison:

- Ranked War bonuses;
- weapon mods;
- ammunition effects;
- weapon experience;
- advanced armor-set bonuses;
- opponent-specific combat interactions.

When exact item-specific stats are available for a member's equipped item, those exact values take precedence over catalog averages. Unknown or special equipment is still not automatically downgraded solely because a generic alternative exists.

Current reference sources:
- Torn Weapon: https://wiki.torn.com/wiki/Weapon
- Torn Weapon Stats: https://wiki.torn.com/wiki/Weapon_Stats
- Torn Armor: https://wiki.torn.com/wiki/Armor
- Torn API v2 Swagger: https://www.torn.com/swagger.php
- Torn API documentation: https://www.torn.com/api.html


## Alpha.21 leader acquisition report scope

The **War / Peace** stock-mode selector now controls the faction-leader acquisition message directly.

### War mode

When **War** is selected, the leader message contains only acquisition that is required for the active war-readiness objective:

- equipment purchases for members who are not yet WAR READY; and
- the two ready-to-issue war equipment spares per standard slot when faction stock cannot already cover them.

The War leader message intentionally excludes minimum-stock replenishment. Provision/minimum rows that come from the War minimum policy are not included in the letter or its low/high total.

This keeps the request focused on equipment that must be acquired for war now.

### Peace mode

When **Peace** is selected, the leader message becomes the post-war / normal replenishment report. It includes:

- normal outstanding member acquisition; and
- minimum-stock shortfalls from the Peace minimum policy.

This is the intended time to refill routine faction minimums after the war requirement has been handled.

The mode is visible in the leader-message button label and message subject so the operator can see the report scope before opening Torn Compose.


## Alpha.22 War/Peace acquisition split

The acquisition mode now has a strict operational split:

### War mode

War mode exists to get the current faction roster ready to fight.

It includes only:

- individual equipment purchases for members who are not WAR READY after member-owned gear, faction loans, and available faction stock are consumed; and
- two ready-to-issue equipment spares per standard slot when existing faction stock cannot cover them.

War mode does **not** add routine medical, temporary, drug, booster, consumable, or other minimum-stock replenishment to the acquisition plan. Those minimums remain visible in the Minimums analysis but are intentionally deferred for purchasing until Peace mode.

### Peace mode

Peace mode exists to restore faction inventory minimums after war.

It includes only minimum-stock replenishment:

- routine equipment-pool shortfalls from the Peace minimum policy, mapped to the active Budget/Standard/Ideal generally available target for that slot; and
- stackable/provision minimum shortfalls from the Peace minimum policy.

Peace mode does **not** create individual member build assignments, unresolved member equipment slots, or purchases to equip members. Member equipment readiness is acted on only in War mode.

This mode split is shared by the Acquire screen and the faction-leader acquisition message, so the UI, report, quantities, and cost totals use the same plan.


## Alpha.23 evidence and procurement-control separation

Armory now treats three facts as separate layers:

1. **Evidence** — what Torn/member data says the member currently has.
2. **Readiness assessment** — whether known equipped gear meets the active floor.
3. **Leadership procurement disposition** — whether the member should continue contributing acquisition requirements.

### Equipment identity and slot authority

For API-backed profiles, Torn's numeric equipped-slot field is preserved as the primary slot signal. The curated catalog and name/type heuristics remain fallbacks and enrichment sources, not prerequisites for recognizing valid equipped gear.

Combat readiness uses the API equipment collection. Cosmetic clothing is not treated as combat armor.

A catalog alias may normalize harmless naming variations such as `Metal Nunchaku` / `Metal Nunchakus`, but exact API-provided damage/accuracy/armor remains stronger evidence than catalog averages.

### War Ready vs Procurement Pass

`WAR READY` means the known eight-slot build passes and leadership explicitly approves it.

`PROCUREMENT PASS` means leadership intentionally excludes that member from current individual acquisition planning without asserting that the member is verified ready. This is appropriate when evidence is unavailable, incomplete, or leadership has another reason not to provision the member through the current plan.

A Procurement Pass is attached to the member's current `verifiedAt` state. New private member evidence invalidates the previous pass so the new information can be reviewed.

### System quantity vs planned quantity

Acquisition output preserves both:

- **System Qty** — deterministic shortfall produced by readiness/faction-stock logic.
- **Planned Qty** — operator-approved planning quantity after an explicit per-item override.

Overrides are stored as a separate planning layer. They do not mutate member readiness, faction inventory, or the computed system quantity. Zero is a valid planned quantity and must remain zero through reporting and the Armory → MM_Acquisitions handoff.

### Consistency scan

Coverage includes an invariant scan over the full cached roster.

- If an equipped item's score is known and meets/exceeds its slot floor, any active route other than KEEP is surfaced as `EQUIPMENT_SCORE_MISMATCH`.
- If a non-temporary equipped API item cannot be mapped to a standard combat slot, it is surfaced as `UNMAPPED_EQUIPMENT`.

These are diagnostic defects/review flags, not acquisition requirements. They must be resolved before trusting a affected member's automated requirement.


## Alpha.24 operator workflow

The normal Builds workflow is intentionally compact:

`select member -> inspect level/stats -> inspect target/route -> optionally prepare member message`

The compact view is only a presentation layer over `compareMemberBuild()`; Advanced / Full Roster Builds remains the evidence view. This prevents the simple and advanced workflows from becoming competing recommendation engines.

Weapon inventory visibility is lossless at the UI layer. A Torn weapon row that lacks enough metadata for Primary / Secondary / Melee classification is shown under **UNCLASSIFIED** with raw classification fields. Classification uncertainty must not hide inventory.

Minimum quantities remain generated by `minimumProposal()`. The Inventory Manager proposes the numeric values and explicitly identifies unresolved inputs; Leadership approves/adjusts the proposal. Leadership is not expected to invent the starting quantities.


### Quick Build presentation invariant

Quick Build is not allowed to reinterpret the canonical route:

- `KEEP` means keep the actual currently equipped item.
- `OWNED` is presented as `OWNED / EQUIP`, because the qualifying item is in the member's inventory but is not yet proven equipped.
- `LOANED` is presented as `LOANED / VERIFY`.
- `ISSUE` names the qualifying faction-stock item.
- `ACQUIRE` names the suggested/baseline acquisition item.
- `REVIEW` names the current item when known and never implies replacement.

Member-facing build messages must use the same route-specific action item; the generic baseline target is evidence context, not always the member action.
