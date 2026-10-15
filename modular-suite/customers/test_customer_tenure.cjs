'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'MM_Customers.logic.js'),'utf8');
const sandbox={Date,Math,Number,String,Object,Array,Set,Map,JSON,structuredClone};
sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox,{filename:'MM_Customers.logic.js'});
const logic=sandbox.MMTornCustomersLogic;
const sale=(id,buyer,timestamp=Date.now())=>({
  id,timestamp,details:{id:1226},
  data:{buyer:{id:buyer,name:'Buyer'+buyer},item_id:1,quantity:1,cost_total:5000}
});
const segment=(state,id)=>logic.customerRfmRows(state).find(row=>row.id===id)?.segment;
let checks=0;
function verify(name,fn){fn();checks++;console.log('PASS',name);}
verify('existing uncontacted customer is not NEW',()=>{
  const state={customers:{'101':{id:'101',name:'Old',purchases:25,contacted:false,firstMessageSent:false,messageCount:0}},sales:{}};
  logic.importSalesEntries(state,[sale('s1','101')]);
  assert.notEqual(segment(state,'101'),'NEW');
  assert.equal(state.customers['101'].firstObservedAt,undefined);
});
verify('first-observed buyer with one sale enters NEW',()=>{
  const state={};logic.importSalesEntries(state,[sale('s2','202')]);
  assert.equal(segment(state,'202'),'NEW');
  assert.ok(state.customers['202'].firstObservedAt);
});
verify('repeat import is idempotent',()=>{
  const state={};logic.importSalesEntries(state,[sale('s3','303')]);
  const observed=state.customers['303'].firstObservedAt;
  logic.importSalesEntries(state,[sale('s3','303')]);
  assert.equal(state.customers['303'].firstObservedAt,observed);
  assert.equal(segment(state,'303'),'NEW');
});
verify('second purchase advances RFM segment',()=>{
  const state={};logic.importSalesEntries(state,[sale('s4','404')]);
  logic.importSalesEntries(state,[sale('s5','404')]);
  assert.equal(segment(state,'404'),'REGULAR');
});
verify('legacy sales rehydration must not fabricate NEW tenure',()=>{
  const state={sales:{old:{id:'old',playerId:'505',playerName:'Legacy',timestamp:Date.now()-86400000,total:2000,units:1,items:[]}}};
  logic.importSalesEntries(state,[]);
  assert.notEqual(segment(state,'505'),'NEW');
});
verify('existing coupons, refunds and contact state remain untouched',()=>{
  const state={customers:{'606':{id:'606',name:'Existing',contacted:true,firstMessageSent:true,messageCount:2}},sales:{},coupons:{'606':{code:'SAVE-606',uses:1}},refunds:{r1:{id:'r1',status:'completed',playerId:'606'}}};
  logic.importSalesEntries(state,[sale('s6','606')]);
  assert.equal(state.coupons['606'].uses,1);
  assert.equal(state.refunds.r1.status,'completed');
  assert.equal(state.customers['606'].messageCount,2);
});
verify('removed customer does not become new',()=>{
  const state={removedCustomers:{'707':{removedAt:new Date().toISOString()}}};
  logic.importSalesEntries(state,[sale('s7','707')]);
  assert.equal(state.customers['707'],undefined);
});
console.log(checks+' tenure regression checks passed.');
