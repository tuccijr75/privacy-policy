const fs=require('fs');const vm=require('vm');const assert=require('assert');

const sandbox={globalThis:{},URL,Date,console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/MM_Acquisitions.live.js','utf8'),sandbox,{filename:'MM_Acquisitions.live.js'});
const live=sandbox.globalThis.MMTornAcquisitionsLive;assert(live);

(async()=>{
  const now=Date.now();
  let db={
    businessRules:{maxListingAgeSec:180},
    marketIntel:{
      settings:{bazaarExitHaircutPct:0},
      marketplace:{
        '17':{
          itemId:'17',itemName:'Beretta 92FS',
          marketPrice:456997,bazaarAverage:478032,lowestPrice:444444,totalBazaars:62
        }
      },
      details:{},traders:{}
    },
    procurement:{
      catalog:{
        '17':{id:'17',name:'Beretta 92FS',type:'Weapon',subType:'Pistol',marketPrice:30000000,shops:[]}
      },
      marketSnapshots:{}
    },
    travelIntel:{rows:[]}
  };

  const core={
    async readLegacyState(){return db;},
    async updateDomainState(domain,mutator){
      const draft=JSON.parse(JSON.stringify(db));
      db=mutator(draft)||draft;
      return db;
    }
  };

  const navigations=[];
  const service=live.createService({
    core,
    logic:{},
    hasTornKey:()=>true,
    navigate:url=>navigations.push(url),
    bazaarRequest:async()=>({bazaar_is_open:true,bazaar_timestamp:Math.floor(Date.now()/1000),bazaar:[]}),
    weavRequest:async(path)=>{
      if(path==='/marketplace/17') return {
        item_name:'Beretta 92FS',market_price:456997,bazaar_average:478032,
        listings:[{
          item_id:17,player_id:999,player_name:'Stale Seller',quantity:1,price:30000000,
          last_checked:Date.now(),content_updated:Date.now()
        }]
      };
      if(path==='/marketplace/17/traders') return {item_name:'Beretta 92FS',traders:[]};
      throw new Error('unexpected weav path '+path);
    },
    tornRequest:async path=>{
      if(String(path).includes('/market/17/itemmarket')) return {
        itemmarket:{listings:[{price:513995,quantity:25}]}
      };
      throw new Error('unexpected torn path '+path);
    }
  });

  const result=await service.procurementSourceOptions('17','Beretta 92FS');
  assert.strictEqual(result.catalogReference,30000000,'catalog reference should remain visible only as reference');
  assert(result.exitValue>0&&result.exitValue<1000000,'live exit must not be contaminated by 30M catalog reference');
  assert(!result.sources.some(row=>row.source==='Bazaar'&&row.price===30000000),'inconsistent named Bazaar listing must be rejected');
  const aggregate=result.sources.find(row=>row.source==='Bazaar aggregate');
  const itemMarket=result.sources.find(row=>row.source==='Item Market');
  assert(aggregate,'global Bazaar aggregate must remain available');
  assert.strictEqual(aggregate.price,444444);
  assert.strictEqual(aggregate.bazaarCount,62);
  assert(itemMarket,'Item Market must remain available');
  assert.strictEqual(itemMarket.price,513995);
  assert.strictEqual(result.sources[0].source,'Bazaar aggregate','best observed acquisition source should be Bazaar aggregate');

  const routed=await service.routeProcurementRequest({itemId:'17',itemName:'Beretta 92FS',preferredSource:'Best'});
  assert.strictEqual(routed.routed,true,'routing should fall through to the next verifiable source when aggregate Bazaar cannot resolve seller');
  assert.strictEqual(routed.source,'Item Market');
  assert(navigations.some(url=>url.includes('sid=ItemMarket')&&url.includes('itemID=17')));

  console.log('MM_Acquisitions selected-source consistency regression: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});