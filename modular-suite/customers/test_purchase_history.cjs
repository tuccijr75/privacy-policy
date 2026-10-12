'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'MM_Customers.logic.js'),'utf8');
const sandbox={Date,Math,Number,String,Object,Array,Set,Map,JSON,structuredClone};
sandbox.globalThis=sandbox;
vm.runInNewContext(src,sandbox,{filename:'MM_Customers.logic.js'});
const logic=sandbox.MMTornCustomersLogic;
const row=(id,buyer,time=Date.now(),amount=1000)=>({
 id,timestamp:time,details:{id:1226},
 data:{buyer:{id:buyer,name:'Buyer'},item_id:1,quantity:1,cost_total:amount}
});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
test('legacy totals survive recent-window refresh',()=>{
 const s={customers:{'100':{id:'100',purchases:12,units:18,spent:840000,firstPurchase:'2026-01-01T00:00:00Z',lastPurchase:'2026-09-30T00:00:00Z'}},sales:{}};
 logic.importSalesEntries(s,[row('a','100')]);
 assert.equal(s.customers['100'].purchases,12);
 assert.equal(s.customers['100'].spent,840000);
 assert.equal(s.customers['100'].historyBaseline.purchases,11);
 assert.equal(s.customers['100'].firstPurchase,'2026-01-01T00:00:00Z');
});
test('subsequent verified sale increases preserved counts',()=>{
 const s={customers:{'100':{id:'100',purchases:12,units:18,spent:840000}},sales:{}};
 logic.importSalesEntries(s,[row('a','100')]);
 logic.importSalesEntries(s,[row('b','100')]);
 assert.equal(s.customers['100'].purchases,13);
});
test('same sale ID cannot increment aggregates twice',()=>{
 const s={customers:{'100':{id:'100',purchases:12,spent:840000}},sales:{}};
 logic.importSalesEntries(s,[row('a','100')]);
 logic.importSalesEntries(s,[row('a','100')]);
 assert.equal(s.customers['100'].purchases,12);
});
test('existing ledger reconciles without duplicate baseline',()=>{
 const t=Date.now(),s={customers:{'100':{id:'100',purchases:2,units:2,spent:2000}},sales:{
 a:{id:'a',playerId:'100',timestamp:t-1,total:1000,units:1,items:[]},
 b:{id:'b',playerId:'100',timestamp:t,total:1000,units:1,items:[]}
 }};
 logic.importSalesEntries(s,[]);
 assert.equal(s.customers['100'].purchases,2);
 assert.equal(s.customers['100'].spent,2000);
});
test('pre-coupon sales remain in lifetime but not cashback',()=>{
 const t=Date.now(),s={};
 logic.importSalesEntries(s,[row('a','200',t-3600000,200000),row('b','200',t+1000,100000)]);
 const c=logic.issueCoupon(s,'200',new Date(t).toISOString());
 assert.equal(logic.couponQualification(s,c,t+3000).total,100000);
 assert.equal(s.customers['200'].spent,300000);
 assert.equal(s.customers['200'].purchases,2);
});
test('coupon, refund and contact records preserved',()=>{
 const s={customers:{'300':{id:'300',purchases:6,spent:10000,contacted:true,firstMessageSent:true,messageCount:3}},
 sales:{},coupons:{'300':{code:'SAVE-300',uses:1}},refunds:{r:{id:'r',status:'completed'}}};
 logic.importSalesEntries(s,[row('z','300')]);
 assert.equal(s.customers['300'].messageCount,3);
 assert.equal(s.coupons['300'].uses,1);
 assert.equal(s.refunds.r.status,'completed');
});
console.log(checks+' purchase-history regression checks passed.');
