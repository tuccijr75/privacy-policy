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
