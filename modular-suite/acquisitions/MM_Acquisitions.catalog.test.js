const fs=require('fs');const vm=require('vm');const assert=require('assert');

const sandbox={globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.live.js','utf8'),sandbox,{filename:'MM_Acquisitions.live.js'});
const live=sandbox.globalThis.MMTornAcquisitionsLive;assert(live);

const arrayRows=live.normalizeTornCatalog({
  items:[
    {id:1,name:'Market Item',type:'Drug',value:{market_price:1000,buy_price:0,sell_price:10,shops:[]},circulation:50},
    {id:2,name:'Shop Item',type:'Plushie',value:{market_price:0,buy_price:0,sell_price:0,shops:[{name:'Bits n Bobs',cost:250,stock:4}]}},
    {id:3,name:'No Source',type:'Special',value:{market_price:0,buy_price:0,sell_price:0,shops:[]}}
  ]
});
assert.strictEqual(arrayRows.length,3);
assert.strictEqual(arrayRows[0].id,'1');
assert.strictEqual(arrayRows[0].type,'Drug');
assert.strictEqual(arrayRows[0].buyable,true);
assert.strictEqual(arrayRows[1].buyable,true);
assert.strictEqual(arrayRows[1].shops[0].price,250);
assert.strictEqual(arrayRows[1].shops[0].quantity,4);
assert.strictEqual(arrayRows[2].buyable,false);

const objectRows=live.normalizeTornCatalog({
  items:{'26':{name:'AK-47',type:'Primary',value:{market_price:50000}}}
});
assert.strictEqual(objectRows.length,1);
assert.strictEqual(objectRows[0].id,'26');
assert.strictEqual(objectRows[0].name,'AK-47');

(async()=>{
  let db={procurement:{catalog:{'999':{name:'Stale legacy item'}}}};
  const core={
    async readLegacyState(){return db;},
    async updateDomainState(domain,mutator){
      const draft=JSON.parse(JSON.stringify(db));
      db=mutator(draft)||draft;
      return db;
    }
  };
  const service=live.createService({
    core,
    logic:{},
    hasTornKey:()=>true,
    weavRequest:async()=>({items:[]}),
    bazaarRequest:async()=>({}),
    tornRequest:async path=>{
      assert(path.includes('/torn/items'));
      return {items:[
        {id:10,name:'Fresh A',type:'Flower',value:{market_price:100,shops:[]}},
        {id:11,name:'Fresh B',type:'Armor',value:{market_price:0,shops:[{name:'Shop',price:75}]}}
      ]};
    },
    navigate:()=>{}
  });
  const result=await service.refreshItemCatalog();
  assert.strictEqual(result.rows.length,2);
  assert.strictEqual(Object.keys(db.procurement.catalog).length,2,'catalog refresh should atomically replace stale rows');
  assert.strictEqual(db.procurement.catalog['999'],undefined);
  assert.strictEqual(db.procurement.catalog['10'].catalogSource,'Torn API v2');
  assert.strictEqual(db.procurement.catalogItemCount,2);
  assert.strictEqual(db.procurement.catalogBuyableCount,2);
  assert(db.procurement.catalogLastSyncAt);
  console.log('MM_Acquisitions catalog normalization + refresh regression: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
