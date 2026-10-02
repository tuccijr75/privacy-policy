# MM Market Scout v8.0.0-alpha.5 — Live Acceptance

**Status:** INSTALLED / LIVE ACCEPTANCE IN PROGRESS  
**Branch:** `crm-v8-modular-suite`  
**Userscript:** `modular-suite/market-scout/MM_Market_Scout.user.js`  
**Install URL:**  
`https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/market-scout/MM_Market_Scout.user.js`

## Static / harness gate — PASS

- Core syntax
- Market logic syntax
- Market live service syntax
- Market userscript syntax
- cross-domain preservation
- shared business-rule isolation
- cached opportunity ranking
- Bazaar verified routing mock
- stale Bazaar snapshot rejection
- over-ceiling Bazaar -> Item Market fallback
- Travel import/history/ranking
- Weav3r generation change detection
- no Weav watcher before Scout opens
- visible/open-only watcher gate
- one-tab watcher lease

## Runtime doctrine

Normal Torn page load:
- launcher only;
- no Scout network call;
- no Scout watcher.

Scout open:
- read shared schema 11 IndexedDB;
- start one-minute Weav3r generation check only while open + visible;
- one tab holds a 75-second lease;
- full enrichment only if Weav3r generation changed.

Manual actions:
- Refresh Opportunities: Weav3r + bounded enrich + Torn Item Market when key exists.
- Verify & Buy: re-enrich, re-check Item Market, live-verify Bazaar, enforce max-buy ceiling, fallback to next source, route only.
- Update Travel: direct TornW3B HTML refresh, then same-tab browser capture fallback if challenged.
- No purchase is submitted automatically.

## Current browser checkpoint — 2026-10-02

Authenticated Torn travel page is open.

Opening the raw userscript URL successfully triggered Tampermonkey installation. The installer then closed and Tampermonkey exposed a dedicated **MM Torn Market Scout** script settings tab.

After reloading the authenticated Torn Travel Agency page:
- legacy **CRM** launcher is present;
- new **Scout** launcher is present as a real pressable button;
- therefore script installation and Torn-page injection are confirmed live.

Current control boundary:
- Opera Browser Connector can read the Scout button and reports it as pressable, but its available API exposes no click/press action;
- JavaScript URL execution is explicitly blocked by the connector;
- authorized Desktop Commander exposes terminal/filesystem tools but no GUI click primitive.

Exact next:
1. human clicks **Scout** on the right side of the authenticated Torn page;
2. continue live acceptance inside the open Scout panel;
3. do not begin Faction Armory until Scout acceptance completes.
