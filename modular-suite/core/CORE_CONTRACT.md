# Core Contract — v8 alpha

## Role

`MM_Torn_Core.js` is a shared `@require` library used by the separate domain userscripts. It is not a fifth heavy UI application.

Current alpha keeps automatic side effects narrow:
- opens the existing CRM IndexedDB without specifying a higher version;
- aborts rather than creating the legacy DB if it does not exist;
- reads `mm_bazaar_crm_idb/state/main` on explicit request;
- writes only when a domain tool explicitly calls the atomic domain update API;
- performs no network calls by itself;
- exposes no raw credential value;
- may create the shared **MM Torn module dock** in the currently loaded Torn page DOM when a module registers a launcher;
- uses only one-shot animation-frame / short delayed adoption checks for the legacy CRM launcher, not a polling loop or background Torn request.

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


## Shared module dock

Core owns the visual launcher contract for split modules so each product does not create a different floating button.

API:
- `registerDockLauncher({ id, label, accent, icon, onClick, element })`
- `setDockLauncherActive(id, active)`
- `positionDock()`
- `adoptLegacyCrmLauncher()`

Rules:
- launchers are approximately 42×42 px and use original MM Torn SVG line icons;
- Torn sprites, official icons, artwork and asset files are not copied;
- colors remain dark / muted and Torn-adjacent, but each MM module has a distinct accent;
- the dock attempts to sit beside the currently visible Torn bottom toolbar and falls back to the lower-right corner;
- module buttons can be drag-reordered inside the dock;
- order is stored only as non-sensitive local UI state in `localStorage` under `mm_torn_module_dock_order_v1`;
- credentials and operational data are never stored through the dock;
- dock operations are DOM-only and perform no network request;
- future Bazaar Manager / Business Intelligence launchers should register here rather than inventing new fixed-position controls.

The legacy CRM launcher may be temporarily adopted into this dock during migration. This is a bridge only and does not make the legacy CRM a modular product.


### Dock placement and free movement

- The MM dock anchors immediately **to the left of Torn's currently visible bottom control bar** when enough horizontal room exists.
- On narrow screens where left placement would overlap Torn, the dock moves above the Torn controls rather than covering them.
- Docked MM launchers can be dragged horizontally to reorder.
- Pulling a docked launcher away from the dock undocks it into a freely movable fixed-position launcher.
- A floating launcher can be dragged anywhere in the viewport. Dropping it back over/near the MM dock redocks it.
- Right-click is an alternate dock/undock toggle.
- Floating launcher positions persist locally under `mm_torn_module_float_positions_v1`.
- Launcher movement is local UI state only and performs no network request.

### Movable module panels

Core exposes `makePanelDraggable(panel, handle, key, defaults)`.

- Armory and Market Scout use their title/header bar as the drag handle.
- Interactive controls inside the header remain clickable and do not begin a drag.
- Panel positions persist locally per module under `mm_torn_panel_position_v1:<module>`.
- Double-clicking a non-interactive part of the header resets that panel to its module default position.
- Saved positions are clamped when the viewport changes so the header remains reachable.
