# MM_Customers cleanup audit — alpha.17

Date: 2026-10-03  
Branch: `crm-v8-customers-compose-one-shot`  
Target: `crm-v8-modular-suite`  
Status: pre-merge / live acceptance pending

## Scope

This pass audited the full MM_Customers implementation rather than adding another runtime workaround.

Reviewed:
- `MM_Customers.user.js`
- `MM_Customers.logic.js`
- `MM_Customers.test.js`
- MM Torn Core integration used by Customers
- the MM_Customers commit history from initial extraction through alpha.16
- suite architecture/runtime rules
- current draft PR changes

The cleanup preserves customer history, new-customer workflow, coupons, cashback, refunds, restock subscriptions, branded messages, manual sending, confirmed-delivery state updates, recovery controls, API-key isolation, cross-tab refresh while open, auto-sync while open, shared dock integration, and movable panels.

## Runtime patch inventory and disposition

| Previous layer | Purpose | Alpha.17 disposition |
| --- | --- | --- |
| Clipboard / manual paste transport | Early extraction used copy-and-open behavior | Already removed; one compose transport remains |
| Direct rich-editor `innerHTML` fallback | Tried to force branded HTML when Torn source-mode insertion failed | Removed; branded content is written only through Torn source mode |
| Generic Compose recovery | Rehydrated a pending body after Outbox → Compose | Removed; compose bridge is single-use and exact-XID only |
| `PENDING_SEND` editor hydration | Rebuilt editor content from delivery-tracking state | Removed; delivery state never supplies composer content |
| Route restoration to XID | Redirected generic Compose back to a tracked recipient | Removed; only the original MM_Customers launch is hydrated |
| Document-wide compose `MutationObserver` | Retried while Torn mounted/replaced the editor | Removed; bounded sequential compose preparation is used |
| Document-wide send `MutationObserver` and scan interval | Looked continuously for post-send evidence | Removed; verification begins only after a trusted manual Send |
| Repeated send verification timers | Multiple intervals/timeouts checked the same delivery | Replaced by one bounded async verification loop |
| History `pushState` / `replaceState` monkey patch | Forced route-helper execution on SPA history mutations | Removed; normal hash/popstate hooks remain |
| Rendered `CSHBACK` text repair | Mutated the visual editor after conversion | Removed; canonical HTML source is correct and rendered content is verified against source-derived markers |
| Rendered banner-row reinsertion | Cloned a banner row back into the visual editor | Removed; banner presence is part of source-derived verification, so a sanitized/incomplete render is rejected rather than patched |
| Hard-coded branded marker list | Special-cased message variants during verification | Removed; verification markers are derived from the actual canonical HTML payload |
| Legacy pending-compose tuple match | Cleared old bridge records without a compose ID | Removed; alpha.17 accepts only current compose-ID bridges |
| Generic URL subject/body hydration | Let MM_Customers act on unrelated compose URLs | Removed; only MM_Customers-created drafts are hydrated |
| Page-load customer auto-sync | Performed customer network work even with the tool closed | Removed; auto-sync exists only while the MM_Customers panel is open |
| Always-on Customers BroadcastChannel | Kept a cross-tab listener alive while the tool was closed | Replaced with an open-panel channel lifecycle |
| Duplicate legacy-launcher adoption call | Customers repeated a Core migration responsibility | Removed from Customers; Core remains the single owner |
| `plainThreeColumnFallback` naming | Treated canonical plain message text as a failure fallback | Replaced with `plainMessageText`; behavior preserved |

## Retained compatibility and recovery features

These are intentional features/contracts and were not removed:

- **Recent first-contact recovery**: repairs historical customer state created by older false-send behavior. This is an operator recovery feature, not part of normal send detection.
- **Anonymous Torn source textarea detection**: Torn source mode may not expose a stable source/code identifier. Detection is limited to the active compose workflow and filtered by compose-area geometry.
- **Torn API v1 username fallback**: used only if the v2 username lookup cannot return a usable name.
- **Legacy Bazaar listing read fallback** in customer logic: preserves restock behavior during the modular migration while Inventory/ROI is the preferred source.
- **Core legacy database compatibility and legacy launcher bridge**: retained by the approved suite architecture until production migration/retirement is explicitly approved.

## Current source structure

### Normal Torn page load

MM_Customers now performs only lightweight setup:
- register its launcher
- install lightweight route listeners
- check whether a pending message workflow is relevant to the current page

It does **not** run customer API sync, username resolution, document observers, cross-tab customer reloads, or a customer polling interval while the panel is closed.

### Panel open

Opening MM_Customers:
- reads the latest shared state
- opens the Customers cross-tab channel
- starts the panel-scoped auto-sync timer
- refreshes sales only when the cache is stale or the operator explicitly refreshes

Closing the panel stops the auto-sync timer and closes the Customers cross-tab channel.

### Compose workflow

A prepared message now has one source path:

`MM_Customers action → composeMessage() → short-lived exact-XID bridge → original Torn Compose → recipient verification → canonical source-mode HTML insertion → source-derived rendered verification → manual Send`

Navigating away clears the compose bridge. Outbox → generic Compose is not repopulated or redirected.

### Delivery workflow

Delivery state is separate from editor state:

`trusted manual Send → capture confirmation baseline → bounded verification loop → Torn success evidence / transcript evidence → update CRM`

If Torn cannot be verified, state becomes `send-unconfirmed` and customer state is unchanged. Reopening an unconfirmed draft explicitly resets that delivery to `awaiting-send`.

## Static audit results

- no MM_Customers `MutationObserver`
- no history-method monkey patch
- no clipboard/paste transport
- no direct rich-editor `innerHTML` injection
- no post-render branded-content mutation
- no generic compose recovery
- no delivery-to-editor hydration
- no pre-send scan interval
- one remaining `setInterval`, owned by open-panel auto-sync
- one UI `innerHTML` assignment, owned by the MM_Customers panel renderer
- no unreferenced named functions detected
- all four message actions continue to use the common `composeMessage(...)` transport
- Customers still writes only through Core's `bazaar` domain contract
- userscript and logic source parse successfully in V8
- customer sale/coupon/refund/restock logic checks pass
- cleanup/resource structural assertions pass

## Live acceptance boundary

Do not merge until the alpha.17 branch is accepted for merge. After merge/install, the first live test should be the original MM_Customers Compose action only:

1. Prepare a Welcome/Message from MM_Customers.
2. Confirm Torn loads the correct Name, Subject, and full branded body on the first Compose page.
3. Navigate to Outbox, then open a new generic Compose page and confirm MM_Customers does nothing to it.
4. Repeat the original-compose test for Coupon Reminder, Cashback Reminder, and Restock Alert.
5. Confirm customer/contact/coupon/restock state changes only after a real manual Send is confirmed by Torn.
