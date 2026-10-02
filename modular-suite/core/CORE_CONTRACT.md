# Core Contract — v8 alpha

## Role

`MM_Torn_Core.js` is a shared `@require` library used by the separate domain userscripts. It is not a fifth heavy UI application.

Current alpha is deliberately read-only:
- opens the existing CRM IndexedDB without specifying a higher version;
- aborts rather than creating the legacy DB if it does not exist;
- reads only `mm_bazaar_crm_idb/state/main`;
- performs no writes;
- performs no network calls;
- starts no timers;
- exposes no raw credential value.

## Credential decision

Tampermonkey GM storage is isolated per userscript. A cross-script credential broker would require exposing an RPC surface to the page origin, which is not justified for this project.

Therefore:
- each domain userscript stores only the credential(s) it needs in its own GM storage;
- raw API keys are never stored in localStorage or IndexedDB for sharing;
- Core centralizes API helper code, validation, endpoint policy and data contracts, but not a plaintext cross-script secret store.

Expected credential footprint:
- Bazaar Manager: primary Torn key.
- Market Scout: primary Torn key.
- Faction Armory: faction/primary key plus optional member keys where explicitly provided.
- Business Intelligence: no key for normal read-only analysis; optional key only if a future explicit refresh feature requires it.

## Domain ownership

### Core
Writes shared configuration/schema metadata only after Phase 1 write contract is approved:
- `businessRules`
- `syncState`
- `meta`

### Bazaar Manager
Primary writer:
- `customers`
- `sales`
- `coupons`
- `refunds`
- `subscribers`
- `removedCustomers`
- `notificationHistory`
- Bazaar/listing/customer portions of `operations`

### Market Scout
Primary writer:
- `procurement`
- `marketIntel`
- `travelIntel`

### Faction Armory
Primary writer:
- `factionInventory`

### Business Intelligence
Read-only consumer across all domains by default.

## Concurrency rule

A future write contract must be field/domain aware. No domain tool may replace the entire legacy state with a stale snapshot.

Until that merge contract exists, v8 Core remains read-only.

## Phase 1 acceptance

- JavaScript syntax check passes.
- Pure compatibility fixture passes.
- Schema 11 state validates.
- Domain slices are deep-cloned.
- Missing legacy DB is not created by inspection.
- No page-load network work exists in Core.
- No shared plaintext credential path exists.
