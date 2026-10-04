# MM Faction Armory — Build Readiness Method

Status: non-production / alpha research model  
Date: 2026-10-02

## Purpose

This model answers three separate questions and keeps them separate:

1. **Is the member's known current equipment adequate for war?**
2. **If not, can the faction issue a suitable item already in stock?**
3. **If not, what generally available item should the Inventory Manager acquire?**

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

Weapon comparisons use a simple expected-output proxy based primarily on Damage × Accuracy. The build's offensive need gives only a modest adjustment.

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

War mode assumes 20 participants and also preserves two ready-to-issue equipment spares per standard slot.

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
- The Inventory Manager still verifies price and availability outside this module before purchasing.

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

Missing member stats, missing member inventory, and unknown-performance current gear are intentionally excluded from automatic buy quantity and shown as unresolved. This prevents a partially populated roster from generating a large speculative purchase list.

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
