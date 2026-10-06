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

let bazaarFreshness=logic.bazaarSnapshotFreshness(db,now);
assert.strictEqual(bazaarFreshness.status,'MISSING','cached listings without producer timestamp must not qualify as current restock evidence');
assert.strictEqual(bazaarFreshness.fresh,false);
db.operations.inventoryRoi.lastBazaarAt=new Date(now-30_000).toISOString();
bazaarFreshness=logic.bazaarSnapshotFreshness(db,now);
assert.strictEqual(bazaarFreshness.status,'FRESH');
assert.strictEqual(bazaarFreshness.fresh,true);
assert.strictEqual(bazaarFreshness.listingCount,1);
db.operations.inventoryRoi.lastBazaarAt=new Date(now-180_000).toISOString();
bazaarFreshness=logic.bazaarSnapshotFreshness(db,now);
assert.strictEqual(bazaarFreshness.status,'STALE','restock messages must fail closed after the consumer freshness window');
assert.strictEqual(bazaarFreshness.fresh,false);
db.operations.inventoryRoi.lastBazaarAt=new Date(now-15_000).toISOString();

const userSrc=fs.readFileSync(__dirname+'/MM_Customers.user.js','utf8');
assert.doesNotThrow(()=>new Function(userSrc));
assert(userSrc.includes("const VERSION='8.0.0-alpha.21';"));
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

// Customer-facing coupon redemption must use Torn's native XID-only route.
// Subject/body URL prefill is helper-script behavior, not a native Torn contract.
const couponUrl=sourceSection('  function couponRedeemUrl(){','\n\n  function brandedMessageHtml(');
assert(couponUrl.includes("messages.php#/p=compose&XID="));
assert(!couponUrl.includes('&subject='));
assert(!couponUrl.includes('&body='));
assert(userSrc.includes('YOUR COUPON CODE: '));
assert(userSrc.includes('OPEN MESSAGE TO '));
assert(userSrc.includes('Copy the coupon code above, open the message, paste the code into the Subject or message body, then press Send.'));
assert(!userSrc.includes('with your coupon code in the subject.'));
assert(!userSrc.includes("&subject='+encodeURIComponent('Coupon Code "));
assert.strictEqual((userSrc.match(/couponRedeemUrl\(\)/g)||[]).length,3,'coupon link must come from one native-XID helper in HTML and plain text');

// Feature preservation.
assert(userSrc.includes('function brandedMessageHtml'));
assert(userSrc.includes('function plainMessageText'));
assert(userSrc.includes('function customerMessage'));
assert(userSrc.includes('function cashbackEligibilityReminderMessage'));
assert(userSrc.includes('function restockMessage'));
assert(userSrc.includes('logic.bazaarSnapshotFreshness(state)'),'restock UI and prepare action must consume Inventory-owned snapshot freshness');
assert(userSrc.includes('Refresh Inventory First'),'stale/missing Bazaar evidence must block restock preparation visibly');
assert(userSrc.includes('Bazaar restock snapshot'),'customer subject must describe the content as a snapshot, not guaranteed current stock');
assert(userSrc.includes('Here’s what was listed in my Bazaar when I refreshed it'),'customer message must use time-bounded snapshot wording');
assert(!userSrc.includes("Here’s what’s currently available at "),'unbounded current-availability wording must not remain');
assert(userSrc.includes('bazaarSnapshotAt:snapshot.localFetchedAtIso'),'prepared restock state must preserve the exact source snapshot timestamp');
assert(userSrc.includes('cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@63d47b40c0cebf546032218d7166ad4e5b5cef18/modular-suite/customers/MM_Customers.logic.js'),'changed Customers logic must be immutable-SHA pinned');
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

// Compose payload remains one-shot and isolated from delivery tracking.
const composePayload=sourceSection('  function composePayloadForCurrentPage(){','\n  function elementMeta(element){');
assert(composePayload.includes('COMPOSE_BRIDGE_TTL_MS'));
assert(composePayload.includes('Compose bridges are single-use and bound to the exact recipient route.'));
assert(!composePayload.includes('PENDING_SEND_KEY'),'delivery tracking must never hydrate the editor');
assert(!composePayload.includes('urlSubject')&&!composePayload.includes('urlBody'),'generic compose URLs must not be hydrated by MM_Customers');
assert(userSrc.includes("return 'https://www.torn.com/messages.php#/p=compose'+"));
assert(!userSrc.includes("&subject='+encodeURIComponent(subject)"),'subject must not be put in Torn compose URL');

// Current Torn mail adapter: TinyMCE contenteditable, not source/code mode.
const editorFinder=sourceSection('  function findComposeEditor(){','\n  function findComposeSendButton(){');
assert(editorFinder.includes('#mce_0'));
assert(editorFinder.includes('.mce-content-body[contenteditable="true"]'));
assert(editorFinder.includes('editor-content.mce-content-body'));
assert(!editorFinder.includes("querySelectorAll('[contenteditable"),'editor finder must not scan arbitrary contenteditable elements');
assert(!editorFinder.includes('textarea'),'editor finder must not use TinyMCE source textarea');

const subjectFinder=sourceSection('  function findComposeSubjectInput(){','\n  function findComposeRecipientInput(){');
assert(subjectFinder.includes('input.message-title'));
assert(subjectFinder.includes('input[name="subject" i]'));
assert(subjectFinder.includes('input[placeholder="Subject" i]'));

const recipientFinder=sourceSection('  function findComposeRecipientInput(){','\n  function recipientMatchesPayload(');
assert(recipientFinder.includes('input[name="sendto"]'));
assert(recipientFinder.includes('#ac-search-0'));
assert(userSrc.includes("value.includes('['+id+']')"));

const richSetter=sourceSection('  function setComposeRichHtml(','\n  const sleepMs=');
assert(richSetter.includes('editor.innerHTML=value'));
assert(richSetter.includes('dispatchComposeEditorInput(editor)'));
assert(userSrc.includes('function dispatchComposeEditorInput'));
assert(userSrc.includes('function richComposerHasBranding'));
assert(userSrc.includes('COMPOSE_READY_POLL_MS=250'));
assert(userSrc.includes('COMPOSE_READY_TIMEOUT_MS=30_000'));
assert(userSrc.includes('COMPOSE_EDITOR_SETTLE_MS=600'));
assert(userSrc.includes('COMPOSE_MAX_FILL_ATTEMPTS=3'));
assert(userSrc.includes('Message prepared in Torn TinyMCE with recipient + subject + branded body verified.'));

// Removed source-mode/code-editor architecture must stay gone.
for(const forbidden of [
  'findTornCodeEditorToggle','sourceEditorCandidates','composeAreaTextarea','looksLikeHtmlSource',
  'likelyTornSourceEditor','setSourceEditorHtml','waitForSourceEditor','waitForRichBranding',
  'injectHtmlThroughTornCodeEditor','Toggle Code Editor','sceditor-source','CodeMirror',
  'monaco-editor','sourceArea','COMPOSE_FORM_POLL_MS','COMPOSE_EDITOR_POLL_MS',
  'COMPOSE_EDITOR_READY_TIMEOUT_MS','COMPOSE_ROUTE_RECOVERY_MS','routeRecovery',
  'restoreComposeTargetRoute','function repairRenderedBrandedTable','brandedMarkersFromHtml',
  "replace(/\\bCSHBACK\\b/g,'CASHBACK')",'table.insertBefore(bannerRow.cloneNode(true),table.firstChild)',
  'setEditorContent(','navigator.clipboard','copyAndOpenMessage','MutationObserver','history[method]',
  'scanTimer','verifyTimer'
]) assert(!userSrc.includes(forbidden),'obsolete compose/runtime layer remains: '+forbidden);

// Direct HTML write is canonical only for TinyMCE plus the application panel renderer.
assert.strictEqual((userSrc.match(/\.innerHTML\s*=/g)||[]).length,2,'innerHTML assignments must be limited to TinyMCE compose + panel render');
assert(richSetter.includes('editor.innerHTML=value'));

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

// Resource doctrine: no page-load customer network work; only panel auto-sync interval.
assert.strictEqual((userSrc.match(/setInterval\(/g)||[]).length,1);
assert(userSrc.includes('function startCustomerAutoSync'));
assert(userSrc.includes('function stopCustomerAutoSync'));
assert(userSrc.includes('if(!apiKey()||!panelIsOpen())return;'));
const initialize=sourceSection('  function initializeCustomers(){','\n\n  if(document.body)');
assert(!initialize.includes('autoRefreshCustomers'),'initialization must not perform customer network work');
assert(!initialize.includes('setInterval'),'initialization must not start polling');
assert(userSrc.includes('function startCustomerStateChannel'));
assert(userSrc.includes('function stopCustomerStateChannel'));
assert(userSrc.includes("if(event?.data?.type!=='state-updated'||!panelIsOpen())return;"));
assert(!initialize.includes('BroadcastChannel'),'initialization must not open a cross-tab channel');
assert(!userSrc.includes('core.adoptLegacyCrmLauncher?.();'),'Core owns legacy-launcher compatibility');

console.log('MM_Customers alpha21 logic, restock freshness, coupon redemption, TinyMCE compose, delivery and resource regressions: PASS');
