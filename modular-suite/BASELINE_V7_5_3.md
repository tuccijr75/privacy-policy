# v7.5.3 Migration Baseline

Source: authoritative MM-Torn control record for CRM v7.5.3.
Purpose: freeze the known pre-split acceptance state. These results are recorded from the accepted source-level audit; they were not re-run by browser control in this checkpoint.

## Recorded v7.5.3 source acceptance

- userscript version: 7.5.3
- schema: 11
- userscript blob: 34dca57e9199b464a4098a096fa9f9d5735bd514
- full userscript parse: PASS
- duplicate function declarations: 0
- required workflow functions missing: 0
- visible generated control IDs without handlers: 0
- visible generated action attributes without handlers: 0
- old ISSUE FROM ARMORY semantics: absent
- old optimizer: absent
- old Advanced toggle/handler: absent
- old More workflow: absent
- Torn home coverage: @match https://www.torn.com/*

## Recorded functional harness coverage

- faction member request routing and prepared/sent state
- faction reply parser
- API supply parser
- equipment build downgrade-safety rules
- acquisition ranking including Bazaar and Item Market-only candidates
- above-threshold acquisition rejection
- Bazaar seller fallback routing
- Item Market fallback routing

## Live boundary

The final v7.5.3 audit did not complete browser-control acceptance because the browser connector was unavailable. The modular suite inherits that same live-account acceptance requirement.

This file freezes the migration baseline; it is not production approval for v8.
