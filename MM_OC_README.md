# MM Organized Crime Tracker — QA channel

Version: **0.1.0-alpha.4**. Repo-owned standalone Torn desktop userscript.

## QA install and updates

[Install QA script](https://raw.githack.com/tuccijr75/privacy-policy/mm-oc-tracker-qa/MM_OC.user.js)

The userscript currently sets identical `@updateURL` and `@downloadURL` to this *QA branch*. Tampermonkey can check that channel for later version bumps. A QA branch is **not** an approved production channel. After desktop/TornPDA acceptance and explicit owner release approval, move the approved script to the stable ref and use matching `raw.githack.com/tuccijr75/privacy-policy/main/MM_OC.user.js` URLs. Verify the actual distribution payload and first install/update before calling production auto-update operational.

## Features

Official Torn v2 `faction/members` and `faction/crimes` endpoints; faction member status; bounded paginated crime collection; strict normalization; role-specific observed checkpoint pass-rate history; separate whole-crime associations; exact distinct-member team matching; rankings/history/export; source freshness and explicit uncertainty. All crime assignment and joining remains manual. API key stored in local userscript storage, never shared with third parties. API permission, live endpoint schemas and pagination completeness require live confirmation.

## Safety / limitations

No member User API keys, third-party analytics feeds, automatic crime joining, purchases or extra site requests. No live browser or PDA acceptance has been completed. The scoring model is an uncalibrated recommendation heuristic, **not** a Torn success-probability estimate. Changing the key clears local history after user confirmation. The temporary fixed launcher has not passed shared MM Core dock acceptance. PDA bundle and crimeexp endpoint integration are not yet certified. Do not publish to stable until these acceptance gates close.

## Tests

`node --check MM_OC.user.js && node test.cjs`

Source-backed tests cannot validate the live Torn UI, actual API permissions, upstream cache timing or Tampermonkey Trigger Update. Preserve those as separate evidence gates.
