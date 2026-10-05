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
    travelIntel:{rows:[{
      itemId:'17',itemName:'Beretta 92FS',country:'China',stock:37,
      profit:63892,sourceProfitPerHour:8370,shopCost:0,homeMarket:0
    }]}
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
  assert.strictEqual(result.exitValue,488295,'selected-item exit must come from current Bazaar / Item Market evidence, not a derived cached snapshot');
  assert.strictEqual(result.exitRoute,'Item Market Net');
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
  const overseas=result.sources.find(row=>row.source==='Overseas');
  assert(overseas,'Travel-originating overseas evidence must survive source comparison even when shop cost is absent');
  assert.strictEqual(overseas.price,0);
  assert.strictEqual(overseas.priceKnown,false);
  assert.strictEqual(overseas.country,'China');
  assert.strictEqual(overseas.quantity,37);
  assert.strictEqual(overseas.profit,63892);
  assert.strictEqual(overseas.sourceProfitPerHour,8370);
  assert.strictEqual(result.sources[result.sources.length-1].source,'Overseas','price-less travel evidence must sort after comparable priced sources');

  const routed=await service.routeProcurementRequest({itemId:'17',itemName:'Beretta 92FS',preferredSource:'Best'});
  assert.strictEqual(routed.routed,true,'routing should fall through to the next verifiable source when aggregate Bazaar cannot resolve seller');
  assert.strictEqual(routed.source,'Item Market');
  assert(navigations.some(url=>url.includes('sid=ItemMarket')&&url.includes('itemID=17')));


  // Reproduce the live Pangolin failure: current sources are ~204k but a depth-derived
  // snapshot can reach 275,420. Selected-item valuation must ignore that derived snapshot.
  db={
    businessRules:{maxListingAgeSec:180},
    marketIntel:{
      settings:{bazaarExitHaircutPct:0},
      marketplace:{
        '1494':{
          itemId:'1494',itemName:'Pangolin Scales',
          marketPrice:204000,bazaarAverage:204985,lowestPrice:204994,totalBazaars:59
        }
      },
      details:{},traders:{}
    },
    procurement:{
      catalog:{
        '1494':{id:'1494',name:'Pangolin Scales',type:'Other',marketPrice:204384,shops:[]}
      },
      marketSnapshots:{}
    },
    travelIntel:{rows:[{
      itemId:'1494',itemName:'Pangolin Scales',country:'China',stock:3462,
      profit:63892,sourceProfitPerHour:8370,shopCost:0,homeMarket:0
    }]}
  };
  const pangolinService=live.createService({
    core,
    logic:{},
    hasTornKey:()=>true,
    navigate:url=>navigations.push(url),
    bazaarRequest:async()=>({bazaar_is_open:true,bazaar_timestamp:Math.floor(Date.now()/1000),bazaar:[]}),
    weavRequest:async(path)=>{
      if(path==='/marketplace/1494') return {
        item_name:'Pangolin Scales',market_price:204000,bazaar_average:204985,
        listings:[
          {item_id:1494,player_id:1,player_name:'A',quantity:1,price:204994,last_checked:Date.now(),content_updated:Date.now()},
          {item_id:1494,player_id:2,player_name:'B',quantity:1,price:230000,last_checked:Date.now(),content_updated:Date.now()},
          {item_id:1494,player_id:3,player_name:'C',quantity:1,price:275420,last_checked:Date.now(),content_updated:Date.now()}
        ]
      };
      if(path==='/marketplace/1494/traders') return {item_name:'Pangolin Scales',traders:[]};
      throw new Error('unexpected Pangolin weav path '+path);
    },
    tornRequest:async path=>{
      if(String(path).includes('/market/1494/itemmarket')) return {
        itemmarket:{listings:[
          {price:204000,quantity:226},
          {price:250000,quantity:1},
          {price:290000,quantity:1}
        ]}
      };
      throw new Error('unexpected Pangolin torn path '+path);
    }
  });
  const pangolin=await pangolinService.procurementSourceOptions('1494','Pangolin Scales');
  assert.strictEqual(db.procurement.marketSnapshots['1494'].realisticExit,275420,'fixture must recreate the inflated derived snapshot');
  assert.strictEqual(pangolin.exitValue,204985,'selected-item exit must ignore the inflated snapshot and use current source-specific exit evidence');
  assert.strictEqual(pangolin.exitRoute,'Bazaar');
  assert(pangolin.exitValue<210000,'Pangolin exit must remain in the live ~204k market range');

  const overseasRoute=await service.routeProcurementRequest({itemId:'17',itemName:'Beretta 92FS',preferredSource:'Overseas'});
  assert.strictEqual(overseasRoute.routed,false);
  assert.strictEqual(overseasRoute.reason,'overseas-recommended');
  assert.strictEqual(overseasRoute.priceKnown,false);
  assert.strictEqual(overseasRoute.country,'China');
  assert.strictEqual(overseasRoute.profit,63892);

  // A single provider failure must not abort the full purchase route. This
  // reproduces the TornPDA live failure where seller-specific Bazaar
  // verification errored after Item Market had already refreshed successfully.
  db={
    businessRules:{maxListingAgeSec:180},
    marketIntel:{
      settings:{bazaarExitHaircutPct:0},
      marketplace:{
        '999':{itemId:'999',itemName:'Fallback Item',marketPrice:650,bazaarAverage:610,lowestPrice:500,totalBazaars:2}
      },
      details:{},traders:{}
    },
    procurement:{
      catalog:{'999':{id:'999',name:'Fallback Item',type:'Other',marketPrice:650,shops:[]}},
      marketSnapshots:{}
    },
    travelIntel:{rows:[]}
  };
  const fallbackNavigations=[];
  const fallbackService=live.createService({
    core,
    logic:{
      rankCachedOpportunities:()=>[{id:'999',name:'Fallback Item',itemType:'Other',maxBuyPrice:1000}]
    },
    hasTornKey:()=>true,
    navigate:url=>fallbackNavigations.push(url),
    bazaarRequest:async()=>{throw new Error('PDA bazaar request failed');},
    weavRequest:async path=>{
      if(path==='/marketplace/999') return {
        item_name:'Fallback Item',market_price:650,bazaar_average:610,
        listings:[{
          item_id:999,player_id:123,player_name:'Seller',quantity:3,price:500,
          last_checked:Date.now(),content_updated:Date.now()
        }]
      };
      if(path==='/marketplace/999/traders') return {item_name:'Fallback Item',traders:[]};
      throw new Error('unexpected fallback weav path '+path);
    },
    tornRequest:async path=>{
      if(String(path).includes('/market/999/itemmarket')) return {
        itemmarket:{listings:[{price:600,quantity:10}]}
      };
      throw new Error('unexpected fallback torn path '+path);
    }
  });
  const fallbackRoute=await fallbackService.acquire('999');
  assert.strictEqual(fallbackRoute.routed,true,'Bazaar verification network failure must fall through to a healthy Item Market source');
  assert.strictEqual(fallbackRoute.source,'Item Market');
  assert(fallbackRoute.verificationWarnings.some(row=>row.source==='Bazaar'&&row.message.includes('PDA bazaar request failed')));
  assert(fallbackNavigations.some(url=>url.includes('sid=ItemMarket')&&url.includes('itemID=999')));

  // TornPDA de-duplicates identical PDA_httpGet URLs fired within 2 seconds by
  // resolving the duplicate without a response. A single click must therefore
  // never refresh the same Item Market endpoint twice.
  db={
    businessRules:{maxListingAgeSec:180},
    marketIntel:{
      settings:{bazaarExitHaircutPct:0},
      marketplace:{
        '1001':{itemId:'1001',itemName:'Single GET Item',marketPrice:1100,bazaarAverage:0,lowestPrice:0,totalBazaars:0}
      },
      details:{},traders:{}
    },
    procurement:{
      catalog:{'1001':{id:'1001',name:'Single GET Item',type:'Other',marketPrice:1100,shops:[]}},
      marketSnapshots:{}
    },
    travelIntel:{rows:[]}
  };
  let itemMarketCalls=0;
  const singleGetNavigations=[];
  const singleGetTornRequest=async path=>{
    if(String(path).includes('/market/1001/itemmarket')){
      itemMarketCalls++;
      if(itemMarketCalls>1) throw new Error('duplicate TornPDA GET suppressed');
      return {itemmarket:{listings:[{price:1000,quantity:10}]}};
    }
    throw new Error('unexpected single-get Torn path '+path);
  };
  const singleGetService=live.createService({
    core,
    logic:{rankCachedOpportunities:()=>[{id:'1001',name:'Single GET Item',itemType:'Other',maxBuyPrice:1200}]},
    hasTornKey:()=>true,
    navigate:url=>singleGetNavigations.push(url),
    bazaarRequest:async()=>({bazaar_is_open:true,bazaar_timestamp:Math.floor(Date.now()/1000),bazaar:[]}),
    weavRequest:async path=>{
      if(path==='/marketplace/1001') return {item_name:'Single GET Item',market_price:1100,bazaar_average:0,listings:[]};
      if(path==='/marketplace/1001/traders') return {item_name:'Single GET Item',traders:[]};
      throw new Error('unexpected single-get Weav path '+path);
    },
    tornRequest:singleGetTornRequest
  });
  const routedSingle=await singleGetService.routeProcurementRequest({itemId:'1001',itemName:'Single GET Item',preferredSource:'Item Market'});
  assert.strictEqual(routedSingle.routed,true,'source routing should use the just-verified Item Market snapshot');
  assert.strictEqual(routedSingle.source,'Item Market');
  assert.strictEqual(itemMarketCalls,1,'routeProcurementRequest must make only one Item Market verification GET');

  // Reset only the market snapshot/call counter to verify the Deals acquire path
  // follows the same one-request rule.
  db.procurement.marketSnapshots={};
  itemMarketCalls=0;
  singleGetNavigations.length=0;
  const acquiredSingle=await singleGetService.acquire('1001');
  assert.strictEqual(acquiredSingle.routed,true,'Deals acquire should use its first verified Item Market snapshot');
  assert.strictEqual(acquiredSingle.source,'Item Market');
  assert.strictEqual(itemMarketCalls,1,'acquire must make only one Item Market verification GET');
  assert(singleGetNavigations.some(url=>url.includes('sid=ItemMarket')&&url.includes('itemID=1001')));

  console.log('MM_Acquisitions selected-source consistency regression: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});