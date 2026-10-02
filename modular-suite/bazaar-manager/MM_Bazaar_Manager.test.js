const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const sandbox={globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(__dirname+'/MM_Bazaar_Manager.logic.js','utf8'),
  sandbox,
  {filename:'MM_Bazaar_Manager.logic.js'}
);
const logic=sandbox.globalThis.MMTornBazaarLogic;
assert(logic,'logic export should exist');

const sale=logic.extractBazaarSale({
  id:'sale-1',
  timestamp:1790970000,
  details:{id:1226},
  data:{
    buyer:{id:123,name:'Buyer'},
    item_id:26,
    item_name:'AK-47',
    quantity:2,
    cost_each:10000,
    cost_total:20000
  }
});
assert(sale);
assert.strictEqual(sale.playerId,'123');
assert.strictEqual(sale.total,20000);
assert.strictEqual(sale.units,2);

const db=logic.ensureBazaarSlice({});
const imported=logic.importSalesEntries(db,[{
  id:'sale-1',
  timestamp:1790970000,
  details:{id:1226},
  data:{
    buyer:{id:123,name:'Buyer'},
    item_id:26,
    item_name:'AK-47',
    quantity:2,
    cost_each:10000,
    cost_total:20000
  }
}]);
assert.strictEqual(imported.imported,1);
assert.strictEqual(db.customers['123'].spent,20000);
assert.strictEqual(db.coupons['123'].code,'SAVE-123');

db.coupons['123'].issuedAt=new Date(1790970000*1000-1000).toISOString();
let q=logic.couponQualification(db,db.coupons['123'],1790970000*1000+1000);
assert.strictEqual(q.qualified,false);
assert.strictEqual(q.total,20000);

db.sales['sale-2']={
  id:'sale-2',
  playerId:'123',
  playerName:'Buyer',
  timestamp:1790970000*1000+2000,
  total:60000,
  units:1,
  items:[{id:'1',name:'Item',quantity:1,price:60000,total:60000}]
};
logic.recalculateCustomers(db);
q=logic.couponQualification(db,db.coupons['123'],1790970000*1000+3000);
assert.strictEqual(q.qualified,true);
assert.strictEqual(q.cashback,5000);

const refund=logic.createRefund(db,'123',new Date(1790970000*1000+3000).toISOString());
assert.strictEqual(refund.status,'pending');
assert.strictEqual(refund.amount,5000);
logic.completeRefund(db,refund.id,new Date(1790970000*1000+4000).toISOString());
assert.strictEqual(db.refunds[refund.id].status,'completed');
assert.strictEqual(db.coupons['123'].uses,1);

logic.updateShopSnapshot(db,{
  bazaar:[{id:26,name:'AK-47',quantity:1,price:11000}],
  inventory:[{id:26,name:'AK-47',quantity:5}]
});
const listing=logic.listingRows(db).find(row=>row.id==='26');
assert(listing);
assert.strictEqual(listing.bazaarQty,1);
assert.strictEqual(listing.personalQty,5);
assert.strictEqual(listing.bazaarPrice,11000);

logic.subscribeCustomer(db,'123');
assert(db.subscribers['123']);
assert.strictEqual(logic.currentBazaarRows(db,db.subscribers['123']).length,1);
logic.unsubscribeCustomer(db,'123');
assert(!db.subscribers['123']);

console.log('MM Bazaar Manager logic tests: PASS');