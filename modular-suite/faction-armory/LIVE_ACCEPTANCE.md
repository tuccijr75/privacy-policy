# MM Faction Armory — Live Acceptance

Status: **NON-PRODUCTION / alpha.6**

## Scope implemented

- Dedicated `Armory` launcher; no faction work runs until opened or explicitly refreshed.
- Reads the existing schema-11 faction inventory/readiness state through MM Torn Core.
- Nine inventory categories:
  - weapons
  - armor
  - temporary
  - medical
  - consumables
  - drugs
  - boosters
  - utilities
  - loot
- One-button **Refresh Faction** refreshes the nine Torn inventory categories and faction roster.
- Member view shows exact stored STR / DEF / SPD / DEX, current equipment summary, faction loans, source age and missing-data status.
- Member Limited Access API keys can be imported once or stored in an Armory-local AES-GCM encrypted vault.
- Saved keys are bound to the exact Torn member ID returned by the API; per-member refresh rejects identity mismatch.
- Build comparison never authorizes a downgrade:
  - known current gear is kept unless available faction stock scores strictly higher;
  - unknown current gear is **REVIEW CURRENT GEAR**, not an upgrade instruction.
- Minimum proposal uses:
  - 25% of roster + two spares for standard weapon/armor slots;
  - 150% maximum/war band;
  - 14-day observed depletion for stackables;
  - one-per-member reserve for critical medical/temporary stock;
  - filled blood bags remain data-required until blood-type distribution is known.
- Excel-compatible leadership export includes Summary, Members, Inventory and Minimums sheets.
- Existing readiness profiles from the legacy CRM are reused through shared Core state.
- Raw API keys are not written to shared IndexedDB/localStorage.

## Static acceptance

- [x] JavaScript syntax check.
- [x] Pure logic fixture.
- [x] Nine category constant exact.
- [x] No-downgrade fixture.
- [x] Unknown-current-gear review fixture.
- [x] 20-member equipment minimum = 7, maximum/war band = 11.
- [x] Snapshot delta fixture.

Static fixture also covers:
- Structured message-reply parser for STR/DEF/SPD/DEX, gear and blood type.
- Manual gear without parsed performance stats remains review-required rather than being auto-replaced.

## Live browser acceptance

- [ ] Install userscript from the non-production branch.
- [ ] Confirm **Armory** launcher appears under Scout.
- [ ] Open Armory; confirm cached 20-member roster and faction inventory load.
- [ ] Confirm no API/network work occurs before an explicit action.
- [ ] Save a faction-compatible key in Armory Settings.
- [ ] Run **Refresh Faction**; confirm nine categories and roster update.
- [ ] Verify Members layout remains usable on desktop and mobile widths.
- [ ] Verify stored legacy readiness profiles display exact stats without FF estimates.
- [ ] Import one member key and verify returned Torn ID/name matches the intended member.
- [ ] Save it encrypted, reload Torn, unlock, and refresh that member.
- [ ] Confirm a wrong/non-faction key is rejected.
- [ ] Confirm Builds does not recommend a weaker faction item over known current gear.
- [ ] Confirm missing current gear is shown as review-required.
- [ ] Confirm Minimums shows 7/11 standard-slot proposal for a 20-member roster.
- [ ] Export Leadership Excel and open it successfully.
- [ ] Confirm legacy CRM remains unchanged except for already-approved bridge hotfixes.

## Promotion boundary

Do not promote this script to production or retire the legacy Faction workflow until live acceptance is complete and the owner explicitly approves the replacement.


## Alpha.2 refinements — 2026-10-02

- Current gear slot recovery now uses both structured equipment items and the stored equipment summary; a known secondary is no longer shown as blank solely because an older profile lacks a semantic slot object.
- Build readiness is tiered from member level + relative battle stats and adjusted by stat style:
  - Strength -> damage-weighted weapons;
  - Speed / Dexterity -> accuracy-weighted weapons;
  - balanced / defensive profiles receive stronger armor thresholds.
- Build decisions are now **WAR READY — KEEP**, **UPGRADE AVAILABLE**, **PROCUREMENT / REVIEW**, or verification-required; no weaker faction item may replace stronger known gear.
- Minimums have a one-click **Peace / War** mode.
- War mode assumes **20 participants**.
- War equipment target covers every participant whose current slot is unverified/below standard plus two spares.
- War core-supply package targets: FAK 10/member, SFAK 10/member, Morphine 10/member, Ipecac 1/member, Empty Blood Bags 5/member, each core temporary 5/member, Xanax 3/member; filled blood bags remain blood-type-dependent.
- Leadership export records active stock mode, 20-participant assumption, member war tier and war-ready status.

Static checks added/passed:
- summary-only secondary slot recovers Qsz-92;
- Qsz-92 is retained over a weaker Beretta M9;
- Peace 20-member equipment pool remains 7 min / 11 upper band;
- War unknown-member equipment coverage becomes 22 (20 + two spares);
- War FAK/SFAK targets = 200 and Xanax = 60 for 20 participants.


## Alpha.3 compact interface — 2026-10-02

Live UI feedback: member cards used excessive vertical space and a two-column content/actions layout. Refined all main views to compact, content-sized modules:
- reduced panel/header/card/button padding and vertical gaps;
- removed the member card's permanent left/right two-column layout;
- member STR / DEF / SPD / DEX / Total / Loans / Source each render as their own compact tile;
- member actions remain inline in the header and gear/supplies stay collapsed until needed;
- Builds renders each equipment slot as its own compact box with Current / Floor / Target tiles;
- Stock renders Owned / Available / Loaned as separate tiles;
- Minimums renders Current / Min / Max / Short as separate tiles and collapses methodology under Basis;
- tiles use content-sized wrapping instead of expanding to fill arbitrary columns;
- responsive mobile widths retain wrapping without forcing tall two-column rows.

Static syntax acceptance: PASS.


## Alpha.4 collapsed build list — 2026-10-02

Repository-boundary audit completed before mutation:
- CRM control state is authoritative only under `Projects/torn-crm/**` in MM-Torn;
- implementation source remains in `tuccijr75/privacy-policy` on `crm-v8-modular-suite`;
- no Torn Dev Studio, Faction OS, root tools, workflows, or shared registry files were changed for this refinement.

Build-screen refinement:
- each faction member is now one compact collapsed clickable row;
- closed state shows member name, level, readiness tier/status, and unresolved-slot count;
- clicking the member opens the build summary and Current / Floor / Target slot boxes;
- all rows start collapsed to minimize scrolling.

Static JavaScript syntax: PASS.


## Alpha.6 research-based readiness + acquisition — 2026-10-02

Owner challenged the faction-relative build weighting and requested external research before continuing. The previous alpha.2 readiness weighting is superseded by the methodology in `BUILD_READINESS_METHOD.md`.

### Research conclusions applied
- Strength and Speed are separate offensive axes: Strength drives damage while Speed drives hit chance; weapon Damage and Accuracy modify those systems separately.
- Equipment preference now compensates the weaker offensive axis rather than blindly matching the dominant stat:
  - STR materially above SPD → prefer accuracy;
  - SPD materially above STR → prefer damage;
  - otherwise balanced.
- Hank/Baldr-like distributions are treated as descriptions of stat shape/training strategy, not as direct weapon prescriptions.
- Level is survivability context, not a weapon-quality threshold.
- Faction inventory no longer defines readiness. It only decides whether the route is KEEP, LOANED, ISSUE, ACQUIRE or REVIEW.
- Advanced armor set coherence/bonuses are acknowledged; routine logic must not blindly break a superior coherent set.

### Generally available reference catalog
The module now uses a non-live curated reference catalog for routine suggestions. It deliberately does not query Item Market or Bazaars. Current reference families include:
- Primary: Benelli M4 Super, Mag 7, AK-47, Jackhammer; ArmaLite as a premium generally-available option.
- Secondary: BT MP9, Qsz-92.
- Melee: Macana, Diamond Bladed Knife.
- Armor: Combat Helmet/Vest/Gloves/Pants/Boots.

Normal minimum item rolls are used as readiness floors; midpoint stats rank choices. This avoids falsely rejecting a normal copy of a recommended weapon/armor item.

### UI / workflow changes
- Members are collapsed clickable rows.
- Builds are collapsed clickable rows and show Current / Baseline / Route / Suggest / Source / Premium Option.
- Stock is collapsed by category; Weapons contains explicit Primary / Secondary / Melee subgroups.
- Faction API inventory `type` is retained; known ambiguous item names also map to the correct slot. Secondary is no longer omitted.
- Minimums are collapsed by category with category-level shortfall totals.
- New **Acquire** tab aggregates equipment + provision acquisition quantities into one named item list.
- Acquire uses current faction stock/loans to reduce requirements, but performs no live market/bazaar search.
- Unknown-performance current gear is REVIEW, shown under unresolved slots, and excluded from automatic acquisition quantity to preserve the no-downgrade rule.
- Leadership export now includes an Acquire worksheet.

### Static acceptance
- [x] Logic syntax PASS.
- [x] Userscript syntax PASS.
- [x] Qsz-92 classified as Secondary.
- [x] BT MP9 classified as Secondary.
- [x] STR > SPD test selects accuracy need.
- [x] SPD > STR test selects damage need.
- [x] Known Jackhammer remains KEEP against routine baseline.
- [x] Known Qsz-92 remains KEEP against routine baseline.
- [x] Unknown-performance current weapon remains REVIEW rather than being automatically replaced.
- [x] Acquisition plan returns named equipment quantities.
- [x] Acquisition plan includes Secondary requirements.
- [x] Acquisition plan includes provision shortfalls.
- [x] Assigned adequate faction loans can satisfy member provisioning without duplicate acquisition.

### Remaining live acceptance
- [ ] Update Tampermonkey to alpha.6 and reload Torn.
- [ ] Confirm Members remain compact/collapsed.
- [ ] Confirm Builds show objective baseline and KEEP / ISSUE / ACQUIRE routes.
- [ ] Confirm known Secondary equipment appears for members and faction stock.
- [ ] Confirm Stock → Weapons → Secondary populates after next faction refresh.
- [ ] Confirm categorized Minimums layout.
- [ ] Confirm Acquire list reflects the live 20-member faction state and current loans.
- [ ] Confirm unresolved REVIEW slots are excluded from buy quantity.
- [ ] Export/open Leadership workbook with Acquire sheet.

Production remains unchanged.
