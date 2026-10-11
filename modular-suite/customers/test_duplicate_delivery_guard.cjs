'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'MM_Customers.user.js'),'utf8');
const checks=[
 ['unresolved delivery rejects new compose',/const unresolved=GM_getValue\(PENDING_SEND_KEY,null\);[\s\S]*?if\(unresolved&&unresolved\.playerId\)\{[\s\S]*?throw new Error\('Unresolved delivery for/.test(src)],
 ['unknown delivery never expires by age',!src.includes('Date.now()-createdAt>PENDING_DELIVERY_TTL_MS')&&!src.includes('>=PENDING_DELIVERY_TTL_MS)GM_deleteValue(PENDING_SEND_KEY)')],
 ['unknown delivery remains visible',!src.includes('if(Date.now()-Number(pending.createdAt||0)>PENDING_DELIVERY_TTL_MS)return')],
 ['sent or ambiguous draft cannot be reopened',src.includes("pending.state==='awaiting-send'?'<button data-pending-reopen")],
 ['unconfirmed or clicked send can be manually verified',src.includes("pending.state==='send-unconfirmed'||pending.state==='send-clicked'")],
 ['cancel requires explicit Outbox check',src.includes('Cancel tracking ONLY if this message was not sent')],
 ['recovery requires explicit Outbox check',src.includes('Only restore if you verified in Torn Outbox')],
 ['candidate version updated',src.includes('8.0.0-alpha.21.2')],
 ['pinned logic dependency',/MM_Customers\.logic\.js/.test(src)&&/@32b6c41afbca4265160d1f0a0fe14a320d7e789c/.test(src)]
];
for(const [name,passed] of checks){assert.ok(passed,name);console.log('PASS',name);}
console.log(checks.length+' duplicate-delivery safety gates passed.');
