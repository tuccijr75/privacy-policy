const fs=require('fs');const vm=require('vm');const assert=require('assert');
const sandbox={globalThis:{},URL};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.logic.js','utf8'),sandbox,{filename:'MM_Acquisitions.logic.js'});
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.live.js','utf8'),sandbox,{filename:'MM_Acquisitions.live.js'});
const logic=sandbox.globalThis.MMTornAcquisitionsLogic;assert(logic);
const live=sandbox.globalThis.MMTornAcquisitionsLive;assert(live);

const catalog=live.normalizeTornCatalog({items:[{
  id:26,name:'AK-47',type:'Weapon',sub_type:'Rifle',is_tradable:true,
  details:{category:'Primary',stats:{damage:67,accuracy:55}},
  value:{market_price:1000,shops:[]}
}]});
assert.strictEqual(catalog[0].weaponCategory,'Primary');
assert.strictEqual(catalog[0].subType,'Rifle');
assert.strictEqual(catalog[0].baseStats.damage,67);

const priceRows=live.normalizePricelistRows([
  {itemId:-3,name:'Bunker Bucks',buyPrice:6119978},
  {itemId:206,name:'Xanax',buyPrice:800000}
]);
assert.strictEqual(priceRows.length,2);
assert.strictEqual(priceRows[0].buyPrice,6119978);

const ranked=live.normalizeRankedListing({
  uid:'rw1',itemId:26,itemName:'AK-47',weaponType:'Primary',rarity:'Yellow',
  damage:'55',accuracy:'60',quality:'120',
  bonuses:{0:{bonus:'Conserve',value:25}},price:45000000,playerId:7,source:'bazaar'
});
assert.strictEqual(ranked.itemId,'26');
assert.strictEqual(ranked.rarity,'yellow');
assert.strictEqual(ranked.bonuses[0].title,'Conserve');
assert.strictEqual(ranked.source,'Bazaar');
assert.strictEqual(live.canonicalRankedSource('market'),'Item Market');
assert.strictEqual(live.canonicalRankedSource('auction'),'Auction');

const marketRow=live.normalizeMarketplaceItem({item_id:206,item_name:'Xanax',market_price:878734,bazaar_average:864771,lowest_price:863000,total_bazaars:428});
assert.strictEqual(marketRow.lowestSource,'Bazaar');
assert.strictEqual(marketRow.bazaarSource,'TornW3B Bazaar observations');

(async()=>{
  let db={procurement:{catalog:{'26':{name:'AK-47',subType:'Rifle',weaponCategory:'Primary'}}},marketIntel:{},travelIntel:{}};
  const core={
    async readLegacyState(){return db;},
    async updateDomainState(domain,mutator){const draft=JSON.parse(JSON.stringify(db));db=mutator(draft)||draft;return db;}
  };
  const service=live.createService({
    core,logic,hasTornKey:()=>true,bazaarRequest:async()=>({}),navigate:()=>{},
    weavRequest:async(path,params)=>{
      if(path.startsWith('/pricelist/'))return [
        {itemId:-3,name:'Bunker Bucks',buyPrice:6000000},
        {itemId:35,name:'Chocolate',buyPrice:1000}
      ];
      if(path==='/ranked-weapons')return {
        weapons:params.page===1?[{uid:'m1',itemId:26,itemName:'AK-47',weaponType:'Primary',rarity:'yellow',bonuses:{0:{bonus:'Conserve',value:25}},price:50000000,source:'bazaar'}]:[]
      };
      if(path==='/auction/listings')return {
        items:params.page===1?[{uid:'a1',itemId:26,itemName:'AK-47',weaponType:'Primary',rarity:'yellow',bonuses:{0:{bonus:'Conserve',value:25}},price:55000000,source:'auction'}]:[],
        hasMore:false
      };
      throw new Error('Unexpected Weav3r path '+path);
    },
    tornRequest:async path=>{
      assert(String(path).includes('/market/26/auctionhouse'));
      return {auctionhouse:[{
        id:1,timestamp:Math.floor(Date.now()/1000)-100,price:65000000,bids:5,
        item:{id:26,name:'AK-47',sub_type:'Rifle',details:{uid:'x',rarity:'yellow',stats:{damage:50,accuracy:55,quality:110},bonuses:[{title:'Conserve',value:25}]}}
      }],_metadata:{links:{next:null}}};
    }
  });
  const p=await service.refreshPricelist('https://weav3r.dev/pricelist/1234567');
  assert.strictEqual(p.priced,1);
  assert.strictEqual(p.bbRate,6000000);
  assert.strictEqual(db.procurement.pricelist.items['35'].buyPrice,1000);
  assert.strictEqual(db.procurement.pricelist.profile.configured,true);
  assert.strictEqual(db.procurement.pricelist.profile.userId,'1234567');
  assert.strictEqual(db.procurement.pricelist.profile.url,'https://weav3r.dev/pricelist/1234567');
  assert.strictEqual(db.procurement.pricelist.sourceUpdatedAt,null,'Pricelist source timestamp is unavailable in the current provider contract and must not be fabricated');
  assert(Date.parse(db.procurement.pricelist.lastSyncAt)>0,'local Pricelist fetch time must be recorded separately');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(db.procurement.pricelist,'userId'),false,'legacy top-level pricelist userId must not remain a second source of truth');
  const savedPricelist=JSON.stringify(db.procurement.pricelist);
  await assert.rejects(()=>service.refreshPricelist('https://example.com/pricelist/1234567'),/valid Weav3r pricelist link/);
  assert.strictEqual(JSON.stringify(db.procurement.pricelist),savedPricelist,'invalid customer profile input must not mutate shared pricelist state');

  const r=await service.refreshRankedLive({pagesPerType:1,auctionPages:1,limit:100});
  assert.strictEqual(r.market.length,1);
  assert.strictEqual(r.auction.length,1);
  assert.strictEqual(db.procurement.ranked.liveSource,'TornW3B Bazaar + Item Market + Auction APIs');

  const h=await service.refreshRankedHistory('26',{days:90,maxPages:2});
  assert.strictEqual(h.rows.length,1);
  assert.strictEqual(db.procurement.ranked.history['26'].rows[0].subType,'Rifle');
  assert.strictEqual(db.procurement.ranked.history['26'].source,'Torn API finished Auction House');
  console.log('MM_Acquisitions ranked feeds regression: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});