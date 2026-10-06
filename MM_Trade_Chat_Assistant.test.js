const fs=require('fs');
const assert=require('assert');
const source=fs.readFileSync(__dirname+'/MM_Trade_Chat_Assistant.user.js','utf8');

assert.doesNotThrow(()=>new Function(source));
assert(source.includes('@version      0.2.0-alpha.9'));

assert(source.includes('function tradeTranscriptOccurrenceCount(message)'),'must have transcript evidence reader');
assert(source.includes('const transcriptBaseline = tradeTranscriptOccurrenceCount(message);'),'must capture transcript baseline before filling');
assert(source.indexOf('const transcriptBaseline = tradeTranscriptOccurrenceCount(message);') < source.indexOf('if (!insertTradeMessage(composer, message))'),'baseline must be captured before the draft enters the composer');
assert(source.includes('transcriptCount > baselineTranscriptCount'),'confirmation requires a new transcript occurrence');
assert(source.includes("(!composer || !composer.value.trim()) && transcriptCount > baselineTranscriptCount"),'confirmation requires cleared/missing composer plus new transcript evidence');
assert(source.includes('function recordConfirmedAssistedPost()'),'sent state must have a confirmation-only recorder');
assert(source.includes("setNote('Send interaction detected, but the exact message is not confirmed in the Torn Trade transcript. Sent state and timer were not advanced.'"),'failed confirmation must explicitly retain sent/timer state');

assert(source.includes('if (!event.isTrusted || !sessionFilled || !lastComposer || event.target !== lastComposer) return;'),'Enter send attempt must require trusted human input');
assert(source.includes('if (!event.isTrusted || !sessionFilled || !lastComposer) return;'),'button send attempt must require trusted human click');
assert(source.includes("if (!(label === 'send' || /^send\\b/.test(label))) return;"),'generic Trade buttons must not arm sent-state confirmation');

assert(source.includes('data-act="verify">Verify Delivery</button>'),'manual recovery control may verify but not blindly mark sent');
assert(!source.includes('data-act="sent">Mark Sent</button>'),'blind Mark Sent control must be removed');
assert(!source.includes("action === 'sent'"),'blind sent action must be removed');
assert(!source.includes('function completeAssistedPost()'),'pre-confirmation completion path must be removed');

const verifyStart=source.indexOf('  async function verifyAssistedPost(');
const verifyEnd=source.indexOf('\n  function handleComposerKeydown',verifyStart);
assert(verifyStart>=0&&verifyEnd>verifyStart);
const verify=source.slice(verifyStart,verifyEnd);
assert(verify.includes('return recordConfirmedAssistedPost();'),'only verified transcript evidence may record completion');

const recorderStart=source.indexOf('  function recordConfirmedAssistedPost()');
const recorderEnd=source.indexOf('\n  async function verifyAssistedPost',recorderStart);
assert(recorderStart>=0&&recorderEnd>recorderStart);
const recorder=source.slice(recorderStart,recorderEnd);
assert(recorder.includes('state.lastSentAt = now;'));
assert(recorder.includes('state.completedCount += 1;'));
assert.strictEqual((source.match(/recordConfirmedAssistedPost\(\)/g)||[]).length,2,'recorder declaration plus one verified call only');

assert(source.includes('Send remains manual; completion advances only after the exact message appears in Torn Trade transcript.'));
console.log('MM Trade Chat alpha.9 trusted transcript sent-state regressions: PASS');
