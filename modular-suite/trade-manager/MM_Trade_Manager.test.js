const fs=require('fs');const vm=require('vm');const assert=require('assert');
const now=Date.now();
const sandbox={globalThis:{}};
sandbox.globalThis.MMTornInventoryRoiLogic={
  fifoLedger(state,itemId){
    const rows=(state?.procurement?.acquisitions||[]).filter(x=>String(x.itemId)===String(itemId)).map(x=>({remaining:Number(x.quantity||0),unitCost:Number(x.unitCost||0)}));
    return {remainingLots:rows};
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Trade_Manager.logic.js','utf8'),sandbox,{filename:'MM_Trade_Manager.logic.js'});
const logic=sandbox.globalThis.MMTornTradeManagerLogic;assert(logic);

function baseState(){
  return logic.ensureTradeSlice({
    businessRules:{maxListingAgeSec:180},
    procurement:{
      catalog:{'1':{name:'Xanax'},'2':{name:'Feathery Hotel Coupon'}},
      acquisitions:[{id:'a1',itemId:'1',quantity:10,unitCost:700000,acquiredAt:new Date(now-86400000).toISOString()}],
      marketSnapshots:{}
    },
    marketIntel:{marketPulse:{settings:{ttlMs:45*60*1000},items:{
      '1':{itemId:'1',itemName:'Xanax',floorPrice:830000,confidencePct:82,liquidityScore:91,sourceTimestamp:now-60000,fetchedAt:now-30000,lastSnapshot:{source:'Torn API v2 Item Market',floorPrice:830000,sourceTimestamp:now-60000,fetchedAt:now-30000}},
      '2':{itemId:'2',itemName:'Feathery Hotel Coupon',floorPrice:13200000,confidencePct:80,liquidityScore:76,sourceTimestamp:now-60000,fetchedAt:now-30000,lastSnapshot:{source:'Torn API v2 Item Market',floorPrice:13200000,sourceTimestamp:now-60000,fetchedAt:now-30000}}
    }}},
    operations:{}
  });
}

const ongoing={id:100,user:{id:4325346,name:'Manic-Mike'},trader:{id:9,name:'Trader'},completed_at:null,expires_at:Math.floor((now+600000)/1000),modified_at:Math.floor(now/1000),description:'test',items:[
  {user_id:4325346,type:'Item',details:{id:1,uid:null,amount:2}},
  {user_id:9,type:'Money',details:{amount:1800000}}
]};
let state=baseState();
let eval1=logic.evaluateTrade(state,ongoing,'4325346',now);
assert.strictEqual(eval1.status,'ONGOING');
assert.strictEqual(eval1.recordable,false);
assert.strictEqual(eval1.supplied.items.length,1);
assert.strictEqual(eval1.received.money,1800000);
assert.strictEqual(eval1.valuation.costBasis,1400000);
assert.strictEqual(eval1.valuation.margin,400000);
assert.strictEqual(eval1.valuation.marginKind,'REALIZED_CASH_VS_CURRENT_FIFO');
assert.throws(()=>logic.buildCompletedRecord(eval1,now),/Only an API-confirmed completed trade/);

const completed={...ongoing,id:101,completed_at:Math.floor(now/1000),expires_at:null};
const eval2=logic.evaluateTrade(state,completed,'4325346',now);
assert.strictEqual(eval2.recordable,true);
const record=logic.buildCompletedRecord(eval2,now);
assert.strictEqual(record.status,'COMPLETED');
assert.strictEqual(record.inventoryEffects.length,1);
assert.strictEqual(record.inventoryEffects[0].direction,'OUT');
let merged=logic.recordCompletedTrades(state,[record],now);
assert.strictEqual(merged.inserted,1);assert.strictEqual(merged.reconciliations,1);
assert.strictEqual(state.operations.tradeManager.trades['101'].id,'101');
assert.strictEqual(state.operations.inventoryRoi.tradeReconciliation['101'].status,'PENDING');
merged=logic.recordCompletedTrades(state,[record],now+1000);
assert.strictEqual(merged.duplicates,1);assert.strictEqual(merged.inserted,0);

const changed=JSON.parse(JSON.stringify(record));changed.received.money+=1;changed.fingerprint='changed';
merged=logic.recordCompletedTrades(state,[changed],now+2000);
assert.strictEqual(merged.conflicts,1);assert.strictEqual(state.operations.tradeManager.trades['101'].received.money,1800000);

const mixed={id:102,user:{id:4325346,name:'Manic-Mike'},trader:{id:9,name:'Trader'},completed_at:Math.floor(now/1000),expires_at:null,modified_at:null,description:'mixed',items:[
  {user_id:4325346,type:'Item',details:{id:1,uid:null,amount:1}},
  {user_id:9,type:'Item',details:{id:2,uid:null,amount:1}},
  {user_id:9,type:'Money',details:{amount:100000}}
]};
const eval3=logic.evaluateTrade(baseState(),mixed,'4325346',now);
assert.strictEqual(eval3.valuation.marginKind,'ESTIMATED_MIXED_REFERENCE');
assert.strictEqual(eval3.valuation.margin,12600000);
assert.strictEqual(eval3.valuation.referenceBalance,12470000);

const staleState=baseState();staleState.marketIntel.marketPulse.items['2'].fetchedAt=now-2*60*60*1000;
const staleEval=logic.evaluateTrade(staleState,mixed,'4325346',now);
assert.strictEqual(staleEval.valuation.status,'STALE_OR_MISSING_MARKET_EVIDENCE');
assert.strictEqual(staleEval.valuation.margin,null);
assert.strictEqual(staleEval.received.items[0].evidence.status,'STALE');

const unsupported={id:103,user:{id:4325346,name:'Manic-Mike'},trader:{id:9,name:'Trader'},completed_at:Math.floor(now/1000),items:[{user_id:9,type:'Property',details:{id:7,happiness:4500}}]};
const unsupportedEval=logic.evaluateTrade(baseState(),unsupported,'4325346',now);
assert.strictEqual(unsupportedEval.received.other.length,1);
assert.strictEqual(unsupportedEval.valuation.status,'UNSUPPORTED_ASSET_PRESENT');
assert.strictEqual(unsupportedEval.valuation.margin,null);
assert.strictEqual(unsupportedEval.valuation.marginKind,'UNAVAILABLE');

assert.throws(()=>logic.normalizeTrade({id:104,user:{id:1},trader:{id:2},items:[]},'4325346',baseState(),now),/not a participant/);
const unknown=logic.evaluateTrade(baseState(),{id:105,user:{id:4325346},trader:{id:9},items:[]},'4325346',now);
assert.strictEqual(unknown.status,'UNKNOWN');assert.strictEqual(unknown.recordable,false);

const bounded=baseState();
const many=[];
for(let i=1;i<=260;i++){
  const e=logic.evaluateTrade(bounded,{id:1000+i,user:{id:4325346,name:'Me'},trader:{id:9,name:'T'},completed_at:Math.floor((now+i*1000)/1000),items:[]},'4325346',now+i*1000);
  many.push(logic.buildCompletedRecord(e,now+i*1000));
}
logic.recordCompletedTrades(bounded,many,now+999999);
assert.strictEqual(Object.keys(bounded.operations.tradeManager.trades).length,logic.MAX_TRADE_HISTORY);
assert.strictEqual(Object.keys(bounded.operations.inventoryRoi.tradeReconciliation).length,logic.MAX_RECONCILIATIONS);

console.log('MM Trade Manager logic tests: PASS');