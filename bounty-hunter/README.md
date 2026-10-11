# MM Bounty Hunter — Target Finder v0.1.1-rc.2

**Status:** desktop Tampermonkey development candidate; repo-review artifact, not yet published to stable `main` and not certified in a live Torn session. Standalone and fully self-contained (no `@require`).

## Automatic updates and source

- Canonical file: `tuccijr75/privacy-policy/main/MM_Bounty_Hunter.user.js`.
- Metadata: identical `@updateURL`/`@downloadURL` on `https://raw.githack.com/tuccijr75/privacy-policy/main/MM_Bounty_Hunter.user.js`.
- This is a *future stable* URL while work remains in a feature branch; it will not serve the candidate until reviewed and merged. Do not represent automatic updates as live before that release.
- Existing installations from the local ZIP may require one manual reinstall from the canonical stable URL to establish the permanent update channel. Subsequent `@version` increases can update normally; test with a real version bump.

## Installation

1. Open `MM_Bounty_Hunter.user.js` in Tampermonkey and install it.
2. In Torn, navigate to **Newspaper → Bounties** (`https://www.torn.com/bounties.php#!p=main`).
3. Find the **MM Bounty Hunter · Target Finder** panel near the top of the page.
4. Enter a Torn **Public** API key and select **Save key locally** if you want to retain it in userscript-manager storage on this device. The key is used exclusively as an Authorization header sent to `api.torn.com`; it is not printed in console logs or embedded in links. Save is optional for a one-off scan.
5. Enter minimum payout, maximum target level, and optionally your own **total battle stats**. Optional stat input is not saved.
6. Select **Scan bounties**. The Status column shows high-contrast **AVAILABLE / HOSPITAL / TRAVEL / ABROAD / JAILED / NOT CHECKED** badges, status description, and when supported a countdown with Torn's reported until-time. Each status shows local check time; never infer that a player became available just because the timer passed.
7. Use **Availability filter** to view only checked Available, Hospital, Travel/Abroad, Jail/Federal, Other or Unknown/Not checked targets. **Sort by** includes Available first and Soonest reported status end. Open a candidate's **profile** for any final review/action.

## What it actually does

- Uses only Torn API v2, including `/user/profile`, `/torn/bounties?limit=100&offset=N`, `/user/{id}/profile` and `/user/{id}/personalstats?cat=popular`.
- Loads up to **three pages / 300 bounty listing records** and consolidates them into unique targets. Largest **individual listed bounty** is not confused with aggregate listing face value.
- Enriches up to **18 unique shortlisted targets**, prioritizing reward and respecting level/reward filters **regardless of the selected availability filter** (avoids deadlocking an Available-only scan). The rest remain expressly Not checked, never presumed Available.
- Uses official v2 `profile.status.state`, `description`, `details`, and `until`. Hospital/jail countdowns require a valid `until` epoch; Travel/Abroad often provides null and displays “No end time supplied.” A past until timestamp displays “Reported end passed · refresh required,” **not** Available.
- Status badges have textual labels and distinct contrast; summary counts show checked versus unknown targets. The visible countdown text recomputes once per minute in-page without any API polling.
- Both sorting options and status filter are read-only; no extra API polling, separate collector, or automatic attack.
- Uses the supplied Rank Triggers Calculator workbook's core formula and the official Torn rank-trigger table to estimate **battle-stat trigger counts**, without claiming exact hidden stats. Clearly marks insufficient, inconsistent, and negative-net-worth cases as unknown/unreliable.
- Highlights level-holding warnings, training-drug use, availability, known faction affiliation, and optional coarse comparison to your own stat total.
- Sorts by **priority heuristic**, **largest single bounty**, or **smallest estimated stat band**. Points are a ranking aid, **not fight win odds** or a guarantee of profits.
- Stores one optional API key and two filter preferences via script-scoped `GM_*` storage. Player API detail data is **session-only**, capped at 50 cached profiles with a 2-minute TTL. No shared MM Core schema, Acquisitions, Inventory, Armory, or Market Mugger data is touched.
- Fetches only on manual Scan, spacing API calls by **at least 1 second** within the script. No automatic refreshing, cross-site traffic, HTML scraping, page cycling, surveillance, notifications, or attack/bounty claiming.

## Rank reasoning

`Estimated stat triggers = (rank index – 1) – level threshold count – criminal offenses threshold count – net worth threshold count`.

Rank thresholds used:

- Levels: 2, 6, 11, 26, 31, 50, 71, 100
- Total crimes: 100, 5,000, 10,000, 20,000, 30,000, 50,000
- Net worth: $5M, $50M, $500M, $5B, $50B
- Battle-stat score triggers: six thresholds, so the calculation returns 0–6.

The approximate stat bands come from the user-provided guide, supplemented by the wiki score-trigger ranges. Torn explains that *battle-stat balance* influences when triggers fire. Prior net worth can generate **ghost triggers**. **Negative net worth disables confident rank estimates**; 250M+ is open-ended. No inference should override a current spy or verified battle-stat measurement (none is imported in v0.1.1-rc.2).

## Freshness, integrity and manual boundary

- The result strip separately labels `bounties_timestamp` (source freshness), `bounties_delay` (upstream caching interval), and local fetch time.
- Profile fetch time is explicitly **local** and does not claim upstream freshness. Status cache TTL is **2 minutes**; the displayed countdown updates offline in-page and never refreshes a live target's state without a new manual Scan. Live user status can change between fetch and profile opening.
- Incomplete/wrong API shapes, missing public fields, expired bounties, negative/invalid amounts, and implausible trigger counts fail closed.
- Errors such as invalid or paused key, insufficient key access, and rate limits stop the scan without aggressive retry.
- A bounty's appearance in the feed does not guarantee the payout is still available; Torn remains the final authority.
- Clicking a result opens only the **native player profile**. It neither presses Attack nor Claim nor starts other gameplay actions.

## Validation performed

```
node --check MM_Bounty_Hunter.user.js
node MM_Bounty_Hunter.test.cjs
```

Deterministic Node suite: **26/26 PASS**. These are logic, API-shape fixture, metadata, and safety-boundary checks; they are not a substitute for a live Torn acceptance test.

**Before stable release:** install manually on desktop, confirm API v2 response shapes with an authorized Public key, verify three-page pagination and real rank calculations, check the Bounties UI layout with other MM scripts enabled, inspect API request counts and cache provenance, test error paths, then independently build/validate TornPDA if required. Owner approval is required for public/stable distribution. This candidate intentionally contains the canonical intended stable update/download URL but that URL is not active until the approved file exists on the stable main branch.

## Code/source authority

- `MM-Torn` current `main`: `ced023f9bb13e86fbe3cd0f11f01c0605c6546c3` (queried 2026-10-10)
- Acquisitions PR #25: open draft at `511264335437aba882c658c25cd1820ebb5dc5f4` (left unchanged)
- Market Mugger donor PR #42: open reference only, head `77a689fd8ed4408513ce545a212745d1af0c783a` (left unchanged)
- Project sources: `00_READ_ME_FIRST.md`, `01_SOURCE_AUTHORITY_AND_REPO_RULES.md`, `02_ACTIVE_SCRIPT_PORTFOLIO.md`, `03_ENGINEERING_AND_CHANGE_CONTROL.md`, `06_SHARED_DATA_API_AND_STATE_CONTRACTS.md`, `07_TEST_RELEASE_DISTRIBUTION.md`, `TORN_UI_INTEGRATION_CONTRACTS.md`; uploaded `Rank Triggers Calculator.xlsx`.
- API v2 OpenAPI: https://www.torn.com/swagger/openapi.json (version 6.13.8 inspected 2026-10-10)
- Official wiki: https://wiki.torn.com/wiki/Rank
- Torn scripting rules: https://www.torn.com/forums.php?p=threads&t=16037108

This feature-branch version is staged in `tuccijr75/privacy-policy` for review; it has not been released on `main`. New product ownership is separate from Acquisitions and from the retired Market Mugger.
