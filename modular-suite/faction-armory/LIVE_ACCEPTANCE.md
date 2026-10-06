# MM Faction Armory — Live Acceptance

Status: **NON-PRODUCTION / alpha.24.2**


## Alpha.24.2 confirmed-empty equipment correction

Live alpha.24.1 testing reproduced a saved-member refresh failure for NedFlanders69: Torn returned a valid equipment response with no combat equipment rows, but Armory rejected it as a parse failure and retained the older clothing-only cache. Alpha.24.2 treats a valid empty `equipment: []` response as fresh evidence, clears stale combat-equipment rows, and displays **No combat equipment equipped (API confirmed)**. A non-empty equipment array that normalizes to zero still fails closed.

## Historical acceptance notes

Earlier alpha sections below retain their original fixture assumptions for traceability. Fixed 20-member / 20-participant language in those historical sections is **superseded by alpha.19**; current War planning derives its population from the live faction roster.

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


## Alpha.7 dock + owned-inventory budget acquisition — 2026-10-02

### Shared Torn-style module dock
- MM Torn Core now exposes a shared bottom module dock.
- Modular launchers use 42x42 compact buttons with original line icons, dark Torn-adjacent gradients, and separate muted accent colors.
- No Torn sprites, artwork, or official icon assets are copied.
- The dock attempts to position immediately beside the currently visible Torn bottom toolbar; it falls back to the lower-right edge if no suitable toolbar is found.
- Module icons can be dragged to reorder within the dock; order is stored as non-sensitive local UI state only.
- Armory and Scout now register with the shared dock.
- Core can adopt the legacy CRM launcher into the same dock as a migration bridge.
- Docking is DOM-only on the currently loaded Torn page and generates no additional Torn network request.

### Torn rules / API compliance
- Launchers are interface enhancements only; they do not scrape unfocused pages or trigger hidden non-API Torn requests.
- Faction/member data continues to come from Torn API selections or the currently loaded page.
- Member Limited Access key input now visibly states: local-only storage, no sharing, readiness-only purpose, one-time vs encrypted-save behavior, and Limited Access requirement.
- The implementation continues to request no Torn password or login credentials.

### Member-owned inventory acquisition logic
Acquisition route order is now:
1. current equipped gear;
2. adequate member-owned combat inventory;
3. adequate faction loan already assigned to that member;
4. adequate unloaned faction inventory;
5. acquire the reference item;
6. unresolved / defer if current data is insufficient.

Member inventory processing covers at least Primary, Secondary, Melee, Helmet, Body, Gloves, Pants, and Boots.
Faction-owned/loaned rows are excluded from the member-owned pool when identifiable, preventing duplicate coverage.

Existing member-key profiles must be refreshed once after alpha.7 so their new `ownedEquipment` summary is populated.

### Small-faction acquisition controls
- Procurement modes: **Budget / Standard / Ideal**.
- Default mode: **Budget**.
- Default known-cost cap: **$15,000,000**.
- Buy list now separates Required Qty, Buy Now Qty, and Deferred Qty.
- Known-cost funded amount cannot exceed the configured cap.
- Missing member stats or member inventory are unresolved rather than converted into speculative full loadouts.
- Budget mode uses lower-cost common equipment references before higher-cost standard/premium options.
- Acquire worksheet in the leadership export includes buy-now/deferred quantities and buy-now costs.

### Static acceptance
- [x] Core syntax PASS.
- [x] Market Scout syntax PASS.
- [x] Faction Armory logic syntax PASS.
- [x] Faction Armory userscript syntax PASS.
- [x] Member-owned Qsz-92 satisfies a Secondary slot without generating a duplicate member purchase.
- [x] Known-cost funded acquisition stays at/below $15M fixture cap.
- [x] Missing member stats are unresolved rather than mass-purchased.
- [x] Missing member inventory defers unknown slot purchasing.
- [x] Budget-mode primary and body reference fixtures use low-cost generally available targets.

### Live acceptance remaining
- [ ] Update/install Armory alpha.7 and Scout alpha.6.
- [ ] Reload Torn and confirm Armory / Scout / legacy CRM launchers appear in one bottom dock beside Torn controls.
- [ ] Drag module icons to reorder; reload and confirm order persists.
- [ ] Confirm launchers do not obscure Torn bottom controls at desktop and mobile widths.
- [ ] Refresh saved member keys once; confirm Owned Combat Gear populates for API-backed members.
- [ ] Verify a member-owned equal/better Secondary resolves to OWNED and reduces Acquire quantity.
- [ ] Verify Stock → Weapons → Secondary still populates correctly.
- [ ] Verify Budget mode / $15M default cap produces a realistic small-faction Buy Now list and a Deferred list instead of an unrestricted total.
- [ ] Verify Standard and Ideal are clearly planning alternatives only.
- [ ] Export/open Leadership workbook and confirm budget/acquisition columns.

Production remains unchanged.


## Alpha.8 left dock + free launcher/panel movement — 2026-10-02

Live feedback: MM launchers were overlapping Torn's existing bottom controls and could not be freely repositioned; module panels were fixed.

Implemented:
- shared MM dock now anchors to the **left** of the detected Torn bottom toolbar instead of to its right;
- narrow-screen fallback places MM controls above Torn controls rather than overlapping them;
- docked launchers remain reorderable;
- dragging a docked launcher away from the dock undocks it into a free-floating launcher;
- floating launchers can be dragged anywhere and persist their positions locally;
- dropping a floating launcher back over/near the MM dock redocks it;
- right-click provides an alternate dock/undock toggle;
- floating active-state styling still works;
- Faction Armory main interface is draggable by its header and persists position;
- Market Scout main interface is draggable by its header and persists position;
- double-clicking a non-interactive part of either header resets its saved position;
- all movement is DOM/local UI only and adds no Torn network request.

Versions:
- MM Torn Core `8.0.0-alpha.3`
- MM Faction Armory `8.0.0-alpha.8`
- MM Market Scout `8.0.0-alpha.7`

Static syntax: Core PASS, Armory PASS, Scout PASS.

### Live checks
- [ ] MM dock appears directly left of Torn bottom controls, with no overlap.
- [ ] Drag inside dock reorders icons.
- [ ] Pull an icon away from dock; it becomes freely movable.
- [ ] Reload; floating icon position persists.
- [ ] Drag floating icon back onto/near dock; it redocks.
- [ ] Right-click toggles dock/undock as an alternate control.
- [ ] Drag Armory header; panel moves and position persists after reopen/reload.
- [ ] Double-click Armory header resets position.
- [ ] Drag Scout header; panel moves and position persists after reopen/reload.
- [ ] Double-click Scout header resets position.

Production unchanged.


## Alpha.9 exact Torn-row dock alignment — 2026-10-02

Approved placement target: MM buttons should appear immediately to the left of Torn's first native bottom button, on the same vertical row/baseline as the Torn controls shown in the reference screenshot.

Implemented in Core 8.0.0-alpha.4:
- native toolbar detection now measures the actual Torn `a/button` control rectangles instead of using the containing toolbar rectangle;
- the first native control's left edge is the horizontal anchor;
- the median native inter-button gap is reused (clamped to a small 2–7 px range);
- MM dock vertical position is aligned to the first Torn control's centerline;
- narrow-screen fallback still moves the MM row above Torn rather than overlapping it;
- Armory/Scout `@require` URLs are cache-busted to Core alpha.4 so the corrected shared dependency is refreshed by Tampermonkey.

Versions:
- Core 8.0.0-alpha.4
- Armory 8.0.0-alpha.9
- Scout 8.0.0-alpha.8

Static syntax: Core PASS, Armory PASS, Scout PASS.

Core remains an `@require` shared library, not a separate standalone Tampermonkey installation in the current architecture.

Live check:
- [ ] Update Armory alpha.9 and Scout alpha.8.
- [ ] Reload Torn.
- [ ] Confirm MM icons sit directly left of the globe/native first Torn icon, on the same centerline, with native-like gap and no overlap.
- [ ] Confirm dock/undock and movable-panel behavior still works after the alignment change.

Production unchanged.


## Alpha.18 — canonical member/build readiness workflow

Observed inconsistency:
- Members could show **READY FOR REVIEW** while Builds independently showed **WAR READY** for the same member.
- The Members status previously described data completeness/freshness only, while Builds separately calculated equipment readiness.

Source repair:
- \`memberRows(...)\` now computes and carries one \`buildAssessment\` per member for the active procurement mode.
- Members, Builds, acquisition planning, minimum planning, and leadership export reuse that same assessment.
- Canonical statuses are \`MISSING DATA\`, \`STALE DATA\`, \`SUPPLY ACTION\`, \`ACTION NEEDED\`, \`READY FOR REVIEW\`, and \`WAR READY\`.
- Automatic equipment success produces \`READY FOR REVIEW\`, not \`WAR READY\`.
- **Approve / War Ready** is available in the expanded Members row only when the build baseline passes.
- Approval is stored against the current member \`verifiedAt\` timestamp and procurement mode.
- A new member-data refresh or a different procurement mode requires review again.
- **Reopen Review** removes the approval.
- Builds displays the same canonical readiness status and separately shows whether the automatic baseline passes.
- Leadership export uses canonical \`WAR READY\` instead of treating an unapproved automatic build pass as approved readiness.

Live acceptance:
1. Find a member whose eight equipped standard slots pass the current baseline.
2. Confirm Members and Builds both show **READY FOR REVIEW** before approval.
3. Click **Approve / War Ready** from that member's expanded Members row.
4. Confirm Members and Builds both show **WAR READY**.
5. Confirm the leadership export reports \`Readiness = WAR READY\`, \`War Ready = YES\`, and \`Baseline Pass = YES\`.
6. Refresh that member's readiness data; confirm the approval is invalidated and a still-passing member returns to **READY FOR REVIEW**.
7. Confirm an \`ACTION NEEDED\`, \`SUPPLY ACTION\`, missing-data, or stale-data member cannot be approved War Ready.

## Alpha.19 — dynamic roster planning, public estimates, reminders, and leadership report

Current behavior supersedes every earlier fixed-participant War assumption.

### Source behavior

- War participant count is the current faction roster size; no fixed participant constant remains.
- minimumProposal(...) and acquisitionPlan(...) ignore any legacy caller participant override and derive member count from current roster state.
- Missing private battle stats can use a clearly labeled balanced estimate from public Rank/profile/personal-stats evidence.
- Estimated members remain ESTIMATED — NEEDS DATA and cannot become WAR READY.
- Faction loans assigned to a member are evaluated before acquisition, including when private member equipment data is missing.
- Approved WAR READY members are skipped for individual build-equipment acquisition.
- Members missing verified stats/equipment show **Send Data Reminder** unless a reminder has already been confirmed sent.
- The reminder is prepared in Torn's visible compose editor; sending remains manual.
- Reminder-sent state is recorded only after a trusted manual Send and post-send confirmation.
- Acquire provides a faction-leader message containing member needs, minimum-stock needs, cached low/high price estimates, and low/high total acquisition cost.
- Faction leader identity is resolved from current Torn faction basic data.
- No other module is modified by these Faction Armory runtime changes.

### Static/V8 acceptance

- [x] Userscript parses.
- [x] Logic parses/loads.
- [x] Regression test source parses.
- [x] Suite manifest = alpha.39; Faction Armory = alpha.19.
- [x] No fixed War-participant constant remains.
- [x] Seven-member fixture produces seven War participants even when caller supplies 99.
- [x] Public Rank/profile fixture produces a balanced estimated stat profile.
- [x] Estimated member is explicitly ESTIMATED — NEEDS DATA.
- [x] Assigned BT MP9 faction loan satisfies the member's Secondary slot before acquisition.
- [x] Approved WAR READY fixture produces no individual acquisition assignment.
- [x] Reminder workflow is manual-Send gated.
- [x] Acquire contains leader-report and price-range output.
- [x] No document-wide MutationObserver was introduced.
- [x] Only the existing panel/session auto-refresh interval remains.

### Live acceptance

- [ ] Refresh Faction and compare the Members count with Torn's current faction roster.
- [ ] Add/remove or otherwise observe a roster-count change, refresh, and confirm Minimums and Acquire immediately use the new current-member count.
- [ ] Confirm no UI or export says War assumes 20 participants.
- [ ] For a member with no imported private stats, confirm public data produces ESTIMATED — NEEDS DATA with ~ stats, estimate range/confidence, Torn age, and Rank.
- [ ] Confirm that estimated member cannot expose **Approve / War Ready**.
- [ ] If that member has faction-loaned equipment, confirm the matching slot is LOANED/covered before any duplicate acquisition is generated.
- [ ] Confirm a member with complete imported private stats/equipment does **not** show **Send Data Reminder**.
- [ ] Confirm a member missing verified private stats or equipment does show **Send Data Reminder**.
- [ ] Click **Send Data Reminder**; confirm Torn opens the correct recipient with the reminder Subject/body prepared.
- [ ] Do not send; return to Armory and confirm the reminder button still exists.
- [ ] Send the reminder manually; after Torn confirms the send, confirm that member's reminder button disappears.
- [ ] Approve a passing member WAR READY and confirm their individual equipment requirements disappear from Acquire on the next render/state refresh.
- [ ] Reopen Review and confirm that member becomes eligible to contribute build needs again if the build requires action.
- [ ] Open Acquire and confirm each priced requirement exposes a low/high cached price range.
- [ ] Click **Message Faction Leader** and confirm the recipient is the current faction leader.
- [ ] Confirm the prepared report includes only non-WAR-READY individual build purchases, minimum-stock shortfalls, combined quantities, low/high unit and line estimates, total low/high acquisition cost, and unpriced requirements.
- [ ] Manually send only after reviewing the report; no automatic message sending occurs.

Production remains unchanged until these live checks pass and owner explicitly approves promotion.


## Alpha.20 — equipment stats, needs-versus-has, and cost-ranked alternatives

Alpha.20 expands per-member equipment evaluation without changing the canonical readiness floor introduced in alpha.19.

### Static/source contract

- [x] Userscript parses from one clean source body.
- [x] Logic parses/loads.
- [x] Test source parses.
- [x] Faction Armory version = alpha.20; suite = alpha.40.
- [x] Baseline readiness catalog remains 18 items.
- [x] Separate alternatives catalog adds 94 items; 112 total recognized equipment options.
- [x] Budget balanced Primary baseline remains AK-47; alternative expansion does not silently change readiness.
- [x] A normal budget Primary fixture exposes at least eight qualifying alternatives.
- [x] Current exact item stats are distinguished from catalog-average stats.
- [x] Recommended weapon output carries min / average / max Damage and Accuracy.
- [x] Recommended armor output carries min / average / max Armor Rating.
- [x] Per-member build slots carry currentStats, targetStats, suggestedStats, and recommendationOptions.
- [x] Build UI contains HAS STATS, HAS SCORE, NEED SCORE, NEED / TARGET AVG, and SUGGEST STATS.
- [x] Qualifying alternatives are grouped LOW COST / MID COST / HIGH COST / PRICE UNKNOWN.
- [x] Every displayed alternative has an independent Find Best Source action.
- [x] Faction Refresh requests broad Torn item metadata once and caches recognized equipment market-price references.
- [x] Torn market_price is planning data only; the verified live-source handoff remains in MM_Acquisitions.
- [x] No document-wide MutationObserver added.
- [x] No additional background polling interval added.
- [x] Source still has one IIFE, one Members renderer, one Builds renderer, and one acquisition-source adapter.

### Live acceptance

- [ ] Install/update Faction Armory alpha.20 from the test branch and reload Torn.
- [ ] Refresh Faction; confirm the source strip reports an equipment-price refresh age.
- [ ] Open a member with API-provided exact equipment stats and confirm each equipped item displays its corresponding exact Damage/Accuracy or Armor value.
- [ ] Open a member whose stored equipment is name-only and confirm the display clearly identifies catalog-average stats rather than presenting them as exact.
- [ ] In Builds, confirm each slot visually compares CURRENT / HAS STATS / HAS SCORE against NEED SCORE and NEED / TARGET AVG.
- [ ] Confirm the target recommendation displays normal minimum, average, and range values.
- [ ] Expand Qualifying alternatives for Primary, Secondary, Melee, and multiple armor slots; confirm many valid alternatives appear when they meet the member's floor.
- [ ] Confirm no option below the member's current readiness floor is displayed.
- [ ] Confirm options are separated into LOW COST / MID COST / HIGH COST / PRICE UNKNOWN based on currently available planning prices.
- [ ] Confirm an option with fresh cached Item Market/Bazaar/overseas data uses that data ahead of the generic Torn market-price reference.
- [ ] Confirm an option without cached live-source data can still show Torn market_price as a planning reference.
- [ ] Confirm PRICE UNKNOWN is shown instead of fabricating a cost when no source exists.
- [ ] Click Find Best Source on a non-default alternative and verify MM_Acquisitions receives that exact equipment name and a quantity of one for live routing.
- [ ] Confirm a member already equipped with gear above the floor is still KEEP / WAR-ready eligible and is not downgraded because a cheaper alternative exists.
- [ ] Confirm special/RW gear without safely comparable stats remains review-required rather than automatically replaced.
- [ ] Confirm Alpha.19 dynamic roster, reminder, faction-loan, WAR READY suppression, and leader-report workflows continue to function.

Production remains unchanged until this checklist passes and the owner explicitly approves promotion.


## Alpha.21 — War/Peace scoped leader acquisition letter

The War/Peace stock-mode selector now determines what is included in the faction-leader acquisition message.

### War mode

- [x] Leader report title/subject identify WAR mode.
- [x] The report keeps individual equipment purchases for members who are not WAR READY.
- [x] The report keeps War equipment-spare requirements.
- [x] Minimum-stock/provision replenishment is excluded from the War leader report.
- [x] The War low/high acquisition total is calculated only from the filtered War equipment list.
- [x] The report explicitly states that minimum-stock replenishment is deferred until Peace mode.

### Peace mode

- [x] Leader report title/subject identify PEACE mode.
- [x] Normal member acquisition remains visible.
- [x] Peace minimum-stock shortfalls are included.
- [x] The combined low/high total includes the Peace-mode acquisition list.
- [x] Acquire exposes War/Peace buttons directly so report scope is visible before message generation.

### Live acceptance

- [ ] Open Acquire and select **War**.
- [ ] Confirm the leader-message button says **War Needs**.
- [ ] Prepare the leader message.
- [ ] Confirm the Subject identifies WAR.
- [ ] Confirm the body contains only non-WAR-READY member equipment needs and War equipment spares.
- [ ] Confirm there is no **MINIMUM STOCK SHORTFALLS** section in the War message.
- [ ] Confirm medical/temporary/drug/booster/other minimum-restock rows do not appear in the War combined list or total.
- [ ] Return to Acquire and select **Peace**.
- [ ] Confirm the leader-message button changes to **Peace / Minimums**.
- [ ] Prepare the leader message.
- [ ] Confirm the Subject identifies PEACE.
- [ ] Confirm **MINIMUM STOCK SHORTFALLS** is present and reflects the Peace minimum policy.
- [ ] Confirm low/high cost totals change appropriately between War and Peace scope.
- [ ] Sending remains manual in both modes.

Production remains unchanged until live acceptance passes and the owner explicitly approves promotion.


## Alpha.22 — War equipment / Peace minimums split and ordered dock

### Static/source contract

- [x] Faction Armory = alpha.22; suite = alpha.42; shared Core = alpha.9.
- [x] War acquisition executes member build coverage and two equipment spares only.
- [x] War acquisition contains no routine minimum-stock provision rows.
- [x] Peace acquisition creates no member assignments and no unresolved member build slots.
- [x] Peace acquisition uses Peace minimum-stock shortfalls only.
- [x] Peace equipment-pool shortfalls resolve to named Budget/Standard/Ideal baseline items rather than an unpurchasable generic pool label.
- [x] Peace stackable/provision minimum shortfalls remain included.
- [x] Leader message uses the same mode-scoped acquisition plan: War = war equipment only; Peace = minimum replenishment only.
- [x] Shared Core default dock order, read right-to-left, is Trade Rotation → Faction Armory → Customers → Acquisitions → Inventory Manager.
- [x] Shared dock remains immediately left of Torn's detected native bottom toolbar, with the existing narrow-screen/fallback behavior.
- [x] One-time alpha.9 dock migration re-docks/reorders launchers; later user reorder/undock/move remains persistent.
- [x] Dock geometry is exposed through non-sensitive DOM dataset fields for DevTools verification.

### Live acceptance

- [ ] Select **War** on Acquire. Confirm member build equipment and War spares appear, but routine minimum-stock/provision replenishment does not.
- [ ] Prepare the leader War message. Confirm its list and total contain only the War acquisition shown by Acquire.
- [ ] Select **Peace** on Acquire. Confirm individual member build/equipment needs disappear.
- [ ] Confirm Peace shows only faction minimum replenishment, including named equipment-pool targets and any stackable/provision shortfalls.
- [ ] Prepare the leader Peace message. Confirm there is no individual-member build section and the total matches the Peace minimum acquisition list.
- [ ] Confirm the custom dock sits immediately left of Torn's native bottom controls at the current viewport.
- [ ] Confirm icon order from right to left is **MM Trade Rotation, MM Faction Armory, MM_Customers, MM_Acquisitions, MM_Inventory Manager/ROI Tracker**.
- [ ] Reload Torn and confirm the same default position/order persists.
- [ ] Move/reorder or undock one launcher, reload, and confirm that intentional user change persists.
- [ ] In DevTools, inspect `document.querySelector('#mm-torn-module-dock').dataset` and confirm the live dock/native-row geometry fields match the visible placement.

Production remains unchanged until live acceptance passes and the owner explicitly approves promotion.


## Alpha.23 member-equipment / acquisition audit — 2026-10-06

### Source defects corrected

- Member equipment ingestion now preserves Torn's numeric equipment-slot signal before applying catalog/name heuristics. This prevents valid API-returned equipped items from disappearing merely because their item name is not in the curated Armory catalog.
- Cosmetic clothing is no longer fed into combat-armor readiness.
- `Metal Nunchaku` is normalized to the existing `Metal Nunchakus` catalog entry. Exact API item stats still take precedence where present.
- Build comparison keeps any known equipped item whose computed score meets/exceeds the active floor.
- Coverage now performs a roster-wide consistency scan and flags:
  - `EQUIPMENT_SCORE_MISMATCH` when an equipped item meets the floor but the route is not KEEP;
  - `UNMAPPED_EQUIPMENT` when an equipped API combat item cannot be mapped to a standard slot.

### Procurement control

- `WAR READY` remains evidence-backed: the eight-slot baseline must pass before leadership can approve it.
- New **Procurement Pass / Exclude Acquisition** is a separate leadership decision for members whose acquisition should not block the war plan even when readiness evidence is incomplete.
- Procurement Pass does not claim that the member is verified War Ready.
- A pass is bound to the current member `verifiedAt`; newly imported private member data invalidates the prior pass for review.
- Every acquisition row exposes:
  - **SYSTEM** quantity;
  - editable **PLANNED** quantity;
  - Save Qty;
  - Reset to system quantity.
- A manual quantity of zero is valid and cannot be converted into a forced quantity-one Acquisitions handoff.
- Manual quantities affect planning/report/handoff only; they do not rewrite readiness, equipment, or faction-inventory facts.

### Leader estimate correction

The Leader report no longer presents the maximum value seen across all cached sources as the acquisition estimate.

- Planned line/total cost uses the best current planning source available to Armory, with the Armory reference as fallback.
- A wider cross-source min/max remains visible only as a diagnostic range.
- MM_Acquisitions still performs live price/availability verification before any manual purchase.

### Coverage output

New **Coverage** view and export worksheets provide:

- member HAS item / score by standard slot;
- member NEED target / floor;
- readiness/acquisition route;
- owned alternative and assigned faction loan;
- qualifying faction-stock count/items;
- faction Owned / Available / Loaned totals by slot;
- Member Gaps / Issue assignments;
- System Buy Qty vs Planned Buy Qty;
- consistency flags.

### Static validation

- [x] Logic syntax PASS.
- [x] Userscript syntax PASS.
- [x] Existing Armory regression suite PASS.
- [x] Numeric Primary/Melee slot normalization fixture PASS.
- [x] Singular Metal Nunchaku maps to Melee PASS.
- [x] Morpheus-style Metal Nunchaku above floor resolves KEEP PASS.
- [x] Missing-data Procurement Pass suppresses War acquisition PASS.
- [x] Per-item quantity override including zero PASS.
- [x] Coverage emits all eight standard slots/member PASS.
- [x] Unmapped equipment consistency flag PASS.
- [x] Best-planning-source Leader estimate contract PASS.

### Live acceptance required before merge

- [ ] Install alpha.23 candidate and reload Torn.
- [ ] Unlock the saved member-key vault and refresh saved profiles.
- [ ] Confirm **NedFlanders69** shows all API-returned equipped combat items.
- [ ] Confirm **Morpheus2126** shows Metal Nunchaku as Melee and KEEP when its current stats clear the floor.
- [ ] Open Coverage and inspect every consistency flag; any score/floor routing mismatch is a DEFECT.
- [ ] Confirm no legitimate equipped combat item appears as UNMAPPED_EQUIPMENT.
- [ ] Apply Procurement Pass to one incomplete-information member; confirm the member remains non-WAR-READY but disappears from individual War acquisition.
- [ ] Refresh/import new private data for that member and confirm the prior pass requires review.
- [ ] Override one acquisition item downward, one to zero, and reset one; confirm System vs Planned remain distinct.
- [ ] Confirm the Leader report uses Planned quantities and the best planning-source total, with cross-source range labeled diagnostic.
- [ ] Confirm zero-planned lines are not sent to MM_Acquisitions.
- [ ] Open/export Coverage and verify member HAS/NEED vs faction stock matches visible live data.
- [ ] Verify shared dock placement/collision remains unchanged.
- [ ] Do not merge/publish until owner accepts live results.


## Alpha.24 weapons / Quick Build / minimums proposal — 2026-10-06

### Source behavior

- Stock still refreshes the official Torn `weapons` faction-inventory category.
- Weapon rows are grouped as Primary / Secondary / Melee when classification is available.
- Any weapon row that cannot be mapped to those slots is retained under **UNCLASSIFIED** instead of disappearing.
- Stock shows Torn weapon-source row counts plus raw API type/subtype/slot/weaponType fields for diagnosis.

### Quick Build

- Builds now opens with a compact **Quick Build** card.
- Select one faction member and immediately see:
  - Level;
  - STR / DEF / SPD / DEX / total;
  - build style;
  - offense need;
  - defense style;
  - one row per target equipment slot with Current / Target / Route.
- The Quick Build reuses the existing `compareMemberBuild()` result; it does not create a second recommendation engine.
- Estimated public battle stats are visibly marked and are planning-only.
- **Message Build** prepares a Torn message for the selected member; Send remains manual.
- The prior full detailed build analysis remains available under **Advanced / Full Roster Builds**.

### Manager Minimums Proposal

- Minimums is explicitly labeled **Manager Minimums Proposal**.
- Existing `minimumProposal()` remains the single quantity engine.
- The screen summarizes proposal count, rows below minimum, data-required rows, history/confidence, and methodology.
- A new **WHAT WE STILL NEED TO FIGURE OUT** section exposes:
  - filled blood-bag compatibility/mix;
  - usage-history maturity;
  - weapon classification completeness;
  - verified member battle-stat coverage;
  - named preferred external suppliers;
  - high-value gear boundary.
- Leadership Excel now includes an **Open Inputs** worksheet in addition to Minimums.

### Static validation

- [x] Userscript parse PASS.
- [x] Existing Faction Armory logic fixtures PASS.
- [x] Existing alpha.23 audit/consistency fixtures PASS.
- [x] Alpha.24 weapon visibility / Quick Build / Minimums regressions PASS.
- [x] No new MutationObserver or background polling loop introduced.
- [x] Message Send remains manual.

### Live acceptance required

- [ ] Install alpha.24 candidate and reload Torn.
- [ ] Open Stock → Refresh Faction.
- [ ] Expand WEAPONS and confirm Torn weapon source row count.
- [ ] Confirm every returned weapon appears in Primary / Secondary / Melee / UNCLASSIFIED; no row is silently absent.
- [ ] Open Builds → Quick Build; select at least two members and verify level/stats/target routes match Advanced build evidence.
- [ ] For an estimated-stat member, confirm the planning-only warning is visible.
- [ ] Prepare one Message Build and confirm Torn compose is correctly prefilled; do not auto-send.
- [ ] Open Minimums in Peace and War mode; inspect proposed MIN/MAX/SHORT values and open-input statuses.
- [ ] Export Leadership Excel and inspect Minimums + Open Inputs.
- [ ] Verify dock/collision behavior is unchanged.
- [ ] Do not merge/publish until owner accepts live results.


### Alpha.24.1 Quick Build evidence correction

- Quick Build no longer labels an adequate member-owned-but-not-equipped item as **KEEP**; it is **OWNED / EQUIP**.
- **KEEP** displays the actual equipped item.
- **LOANED / VERIFY**, **ISSUE**, and **ACQUIRE** display the specific route item instead of the generic baseline target.
- Member build messages use the same route-specific action item, preventing a message from telling a member to replace adequate current gear with the baseline example.
- Static regression covers these route semantics before live acceptance.
