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


### Ordered Torn-adjacent default

Core alpha.13 defines one default launcher cluster beside Torn's native bottom toolbar. When read from **right to left**, the requested order is:

1. **MM Trade Rotation** (`trade-reminder`)
2. **MM Faction Armory** (`armory`)
3. **MM_Customers** (`customers`)
4. **MM_Acquisitions** (`acquisitions`)
5. **MM_Inventory Manager/ROI Tracker** (`inventory-roi`)

The dock remains a responsive **relative anchor**, not a hard-coded screen coordinate:

- when Torn's native bottom button row is detectable, the MM dock is positioned immediately to its left and aligned to the same bottom edge;
- preserve at least 6 px of horizontal clearance between the MM dock and Torn's first native control; Torn glyphs/hover treatments may visually extend beyond their button box, so a 2 px geometric gap is not sufficient;
- when multiple bottom-edge button rows exist, rows within the same lowest 8 px band are peers; prefer the row nearest the viewport right edge, then the most square/Torn-sized controls, so Factions/Forums page actions cannot steal the dock anchor;
- the native-row path may touch the viewport bottom when Torn does; the generic 4 px viewport safety margin must not lift the MM dock above Torn;
- if the row cannot fit horizontally, the existing narrow-screen fallback places the MM dock above the native row;
- if Torn's bottom controls cannot be identified, the existing lower-right fallback remains.

The alpha.10 migration clears stale absolute floating coordinates and physically re-docks the five canonical visible launchers once. This corrects legacy state where every launcher had been persisted as floating, which left the shared dock empty and unable to follow Torn when the viewport changed.

After that one-time repair:

- docked launchers never persist screen coordinates; their shared dock is recomputed from Torn's **current** native bottom-toolbar geometry;
- switching between split-screen and full-screen layouts is handled by the normal viewport resize path, so the MM cluster moves with Torn rather than staying at old coordinates;
- dragging within the dock creates a persistent custom order;
- pulling an icon out creates a persistent floating position for that deliberately undocked icon;
- right-click continues to toggle dock/undock;
- later page loads honor intentional user changes instead of repeatedly forcing the default layout.

The default order is independent of userscript load order. A separate custom-order flag distinguishes the requested default from an intentional user reorder.

For browser-console diagnostics, the shared `#mm-torn-module-dock` element exposes non-sensitive geometry/contract fields in its `dataset`, including the Core version, relative-dock mode, layout revision, dock anchor, requested right-to-left order, live dock edges, and detected Torn native-row anchor coordinates. Candidate count, selected native-control count, and selected row right-edge distance are also exposed for diagnosing dense pages. This is diagnostic UI geometry only and avoids relying on page-context access to the Tampermonkey sandbox.
