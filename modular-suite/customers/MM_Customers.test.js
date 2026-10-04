const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const sandbox={globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Customers.logic.js','utf8'),sandbox,{filename:'MM_Customers.logic.js'});
const logic=sandbox.globalThis.MMTornCustomersLogic;
assert(logic);

const now=Date.now();
const db=logic.ensureCustomerSlice({
  operations:{inventoryRoi:{listings:{26:{id:'26',name:'AK-47',quantity:2,price:12000}}}}
});

const sale={id:'sale-1',timestamp:Math.floor((now-1000)/1000),details:{id:1226},data:{buyer:{id:123,name:'Buyer'},item_id:26,item_name:'AK-47',quantity:1,cost_total:60000}};
const imported=logic.importSalesEntries(db,[sale]);
assert.strictEqual(imported.imported,1);
assert.strictEqual(db.customers['123'].spent,60000);
assert.strictEqual(logic.importSalesEntries(db,[sale]).imported,0,'duplicate sales must remain idempotent');

const coupon=logic.issueCoupon(db,'123',new Date(now-2000).toISOString());
const q=logic.couponQualification(db,coupon,now);
assert.strictEqual(q.qualified,true);
assert.strictEqual(q.cashback,5000);

const refund=logic.createRefund(db,'123',new Date(now).toISOString());
assert.strictEqual(refund.status,'pending');
logic.completeRefund(db,refund.id,new Date(now+1000).toISOString());
assert.strictEqual(db.coupons['123'].uses,1);

logic.subscribeCustomer(db,'123');
assert.strictEqual(logic.currentBazaarRows(db,db.subscribers['123']).length,1);

const userSrc=fs.readFileSync(__dirname+'/MM_Customers.user.js','utf8');
assert.doesNotThrow(()=>new Function(userSrc));
assert(userSrc.includes("const VERSION='8.0.0-alpha.18';"));
assert(userSrc.includes("const PENDING_COMPOSE_KEY='mm_customers_pending_compose_v1';"));
assert(userSrc.includes("const PENDING_SEND_KEY='mm_customers_pending_send_v1';"));
assert(userSrc.includes("const DELIVERY_RECEIPTS_KEY='mm_customers_delivery_receipts_v1';"));

function sourceSection(startMarker,endMarker){
  const start=userSrc.indexOf(startMarker);
  assert(start>=0,'missing source marker: '+startMarker);
  const end=endMarker?userSrc.indexOf(endMarker,start+startMarker.length):userSrc.length;
  assert(end>start,'missing source end marker: '+endMarker);
  return userSrc.slice(start,end);
}

// Message feature preservation.
assert(userSrc.includes('function brandedMessageHtml'));
assert(userSrc.includes('function plainMessageText'));
assert(userSrc.includes('function customerMessage'));
assert(userSrc.includes('function cashbackEligibilityReminderMessage'));
assert(userSrc.includes('function restockMessage'));
assert.strictEqual((userSrc.match(/composeMessage\(/g)||[]).length,5,'four message actions must share one compose transport');
assert(userSrc.includes('Prepare Cashback Reminder'));
assert(userSrc.includes('QUALIFYING PURCHASE'));
assert(userSrc.includes('Refund amount: '));
assert(userSrc.includes('New Customers ('));
assert(userSrc.includes('function resolveMissingUsernames'));
assert(userSrc.includes('function recentFirstContactRecoveryRows'));
assert(userSrc.includes('Restore to New Customers'));
assert(!userSrc.includes('data-restock-sent'));
assert(userSrc.includes('data-restock-dismiss'));

// Composer source is one-shot and verified from the canonical source payload.
const composePayload=sourceSection('  function composePayloadForCurrentPage(){','\n  function elementMeta(element){');
assert(composePayload.includes('COMPOSE_BRIDGE_TTL_MS'));
assert(composePayload.includes('Compose bridges are single-use and bound to the exact recipient route.'));
assert(!composePayload.includes('PENDING_SEND_KEY'),'delivery tracking must never hydrate the editor');
assert(!userSrc.includes('COMPOSE_ROUTE_RECOVERY_MS'));
assert(!userSrc.includes('routeRecovery'));
assert(!userSrc.includes('restoreComposeTargetRoute'));
assert(userSrc.includes('function findComposeRecipientInput'));
assert(userSrc.includes('function recipientMatchesPayload'));
assert(userSrc.includes("value.includes('['+id+']')"));
assert(userSrc.includes('function brandedSourceIsComplete'));
assert(userSrc.includes('function brandedSourceSignature'));
assert(userSrc.includes('function composeElementNearSubject'));
assert(userSrc.includes('COMPOSE_FORM_POLL_MS=1000'));
assert(userSrc.includes('COMPOSE_EDITOR_READY_TIMEOUT_MS=12_000'));
assert(userSrc.includes("Subject is independent of the editor. Apply it as soon as Torn exposes"));
assert(userSrc.includes("return 'https://www.torn.com/messages.php#/p=compose'+"));
assert(!userSrc.includes("&subject='+encodeURIComponent(subject)"),'subject must not be placed in Torn compose hash');
assert(userSrc.includes("composeElementNearSubject(el,subjectInput"),'editor candidates must be scoped to the compose region');
assert(userSrc.includes('function matchingBrandedTable'));
assert(!composePayload.includes('urlSubject')&&!composePayload.includes('urlBody'),'generic compose URLs must not be hydrated by MM_Customers');
assert(userSrc.includes('const hasBody=requiresBranding||Boolean(payload.body);'),'plain-message support must remain available for MM_Customers drafts');
assert(userSrc.includes('injectHtmlThroughTornCodeEditor(payload.bodyHtml,stillCurrent)'));
assert(userSrc.includes('recipient + branded formatting verified'));

// Old runtime repair layers must stay gone.
assert(!userSrc.includes('function repairRenderedBrandedTable'));
assert(!userSrc.includes('brandedMarkersFromHtml'));
assert(!userSrc.includes("replace(/\\bCSHBACK\\b/g,'CASHBACK')"));
assert(!userSrc.includes('table.insertBefore(bannerRow.cloneNode(true),table.firstChild)'));
assert(!userSrc.includes('setEditorContent('));
assert(!userSrc.includes('navigator.clipboard'));
assert(!userSrc.includes('copyAndOpenMessage'));
assert(!userSrc.includes('MutationObserver'));
assert(!userSrc.includes('history[method]'));
assert(!userSrc.includes('scanTimer'));
assert(!userSrc.includes('verifyTimer'));
assert.strictEqual((userSrc.match(/\.innerHTML\s*=/g)||[]).length,1,'only the MM_Customers panel renderer may assign innerHTML');

// Delivery tracking remains manual-send gated and bounded.
assert(userSrc.includes('function installMessageSendDetector'));
assert(userSrc.includes('function completeTrackedSend'));
assert(userSrc.includes('verifyDeliveryAfterSend'));
assert(userSrc.includes('event.isTrusted'));
assert(userSrc.includes('event.submitter'));
assert(userSrc.includes("pending.state!=='awaiting-send'"));
assert(userSrc.includes("state:'send-unconfirmed'"));
assert(userSrc.includes("state:'awaiting-send',sendClickedAt:null"));
assert(userSrc.includes('PENDING_DELIVERY_TTL_MS=30*60*1000'));
assert(userSrc.includes("if(id&&(!xid||!recipientMatchesPayload(pending,findComposeRecipientInput())))return false;"));

// Resource doctrine: no page-load customer sync; the only interval is panel-scoped.
assert.strictEqual((userSrc.match(/setInterval\(/g)||[]).length,1);
assert(userSrc.includes('function startCustomerAutoSync'));
assert(userSrc.includes('function stopCustomerAutoSync'));
assert(userSrc.includes('if(!apiKey()||!panelIsOpen())return;'));
const initialize=sourceSection('  function initializeCustomers(){','\n\n  if(document.body)');
assert(!initialize.includes('autoRefreshCustomers'),'initialization must not perform customer network work');
assert(!initialize.includes('setInterval'),'initialization must not start polling');
assert(userSrc.includes('function startCustomerStateChannel'),'cross-tab channel must have an explicit open-panel lifecycle');
assert(userSrc.includes('function stopCustomerStateChannel'),'cross-tab channel must be closable');
assert(userSrc.includes("if(event?.data?.type!=='state-updated'||!panelIsOpen())return;"),'cross-tab reload must stay dormant while the panel is closed');
assert(!initialize.includes('BroadcastChannel'),'initialization must not open a cross-tab channel');
assert(!userSrc.includes('core.adoptLegacyCrmLauncher?.();'),'Core owns the legacy-launcher bridge');

console.log('MM_Customers logic, feature-preservation, compose, delivery, cleanup and resource regressions: PASS');
