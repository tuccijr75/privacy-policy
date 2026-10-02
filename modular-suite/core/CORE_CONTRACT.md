# Core Contract — v8 alpha

## Role

`MM_Torn_Core.js` is a shared `@require` library used by the separate domain userscripts. It is not a fifth heavy UI application.

Current alpha has no automatic side effects:
- opens the existing CRM IndexedDB without specifying a higher version;
- aborts rather than creating the legacy DB if it does not exist;
- reads `mm_bazaar_crm_idb/state/main` on explicit request;
- writes only when a domain tool explicitly calls the atomic domain update API;
- performs no network calls by itself;
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

Writes use a single IndexedDB `readwrite` transaction: read the freshest `state/main`, provide the caller only its owned domain slice, then merge only owned top-level paths back into that fresh state before `put`.

This prevents Market Scout, Bazaar Manager or Faction Armory from replacing unrelated newer domains with stale snapshots. The updater is synchronous so the IndexedDB transaction cannot close between read and write.

Business Intelligence remains read-only. Shared Core configuration uses the `core` domain.

## Phase 1 acceptance

- JavaScript syntax check passes.
- Pure compatibility fixture passes.
- Schema 11 state validates.
- Domain slices are deep-cloned.
- Missing legacy DB is not created by inspection.
- No page-load network work exists in Core.
- No shared plaintext credential path exists.

## Freshness observability

Core exposes a read-only freshness snapshot for unified refresh, acquisitions, Item Market, Weav3r generation/global market, travel, faction inventory and faction roster timestamps. This is observability only; Core does not automatically refresh any source.
