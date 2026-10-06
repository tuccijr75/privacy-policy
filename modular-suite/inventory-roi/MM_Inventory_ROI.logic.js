(() => {
  'use strict';

  const BAZAAR_SELL_LOG_ID=1226;
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const asId=v=>String(v??'').trim();
  const nowIso=()=>new Date().toISOString();
  const DAY_MS=86400000;
  const RESTOCK_DEMAND_MAX=200;

  function epochMs(value){
    if(typeof value==='string'){
      const parsed=Date.parse(value);
      if(Number.isFinite(parsed)&&parsed>0)return parsed;
    }
    const raw=n(value);
    if(!(raw>0))return 0;
    return raw<100_000_000_000?raw*1000:raw;
  }

  function marketPulseEvidence(slice,itemId,at=Date.now()){
    const id=asId(itemId);
    const pulse=slice?.marketIntel?.marketPulse;
    const item=pulse?.items?.[id];
    if(!item||typeof item!=='object'){
      return {
        itemId:id,available:false,usable:false,stale:true,status:'MISSING',
        floorPrice:0,marketDepth:0,observedUnitsPerHour:0,turnoverPerHour:0,
        liquidityScore:0,confidencePct:0,trendPct:0,sourceTimestamp:0,
        fetchedAt:0,sourceAgeMs:Infinity,fetchAgeMs:Infinity,ttlMs:0,
        source:'Market Pulse'
      };
    }
    const ttlMs=Math.max(0,n(pulse?.settings?.ttlMs));
    const fetchedAt=epochMs(item.fetchedAt??item.lastSnapshot?.fetchedAt);
    const sourceTimestamp=epochMs(item.sourceTimestamp??item.lastSnapshot?.sourceTimestamp);
    const fetchAgeMs=fetchedAt?Math.max(0,Number(at)-fetchedAt):Infinity;
    const sourceAgeMs=sourceTimestamp?Math.max(0,Number(at)-sourceTimestamp):Infinity;
    const freshnessKnown=ttlMs>0&&fetchedAt>0;
    const stale=!freshnessKnown||fetchAgeMs>ttlMs;
    const floorPrice=Math.max(0,n(item.floorPrice??item.lastSnapshot?.floorPrice));
    const available=fetchedAt>0||sourceTimestamp>0||floorPrice>0;
    const usable=available&&!stale&&floorPrice>0;
    return {
      itemId:id,available,usable,stale,status:!available?'MISSING':stale?'STALE':'FRESH',
      floorPrice,marketDepth:Math.max(0,Math.round(n(item.marketDepth??item.lastSnapshot?.marketDepth))),
      observedUnitsPerHour:Math.max(0,n(item.observedUnitsPerHour)),
      turnoverPerHour:Math.max(0,n(item.turnoverPerHour)),
      liquidityScore:Math.max(0,n(item.liquidityScore)),
      confidencePct:Math.max(0,n(item.confidencePct)),
      trendPct:n(item.trendPct),
      tier:String(item.tier||''),
      sourceTimestamp,fetchedAt,sourceAgeMs,fetchAgeMs,ttlMs,
      source:String(item.lastSnapshot?.source||item.sources?.itemMarket||'Market Pulse')
    };
  }

  function pricingRecommendation({bazaarPrice=0,bazaarQty=0,personalQty=0,avgCost=0,avgSoldPrice30=0,pulse={}}={}){
    const listingPrice=Math.max(0,n(bazaarPrice));
    const availableQty=Math.max(0,n(personalQty));
    const cost=Math.max(0,n(avgCost));
    const historical=Math.max(0,n(avgSoldPrice30));
    const floor=Math.max(0,n(pulse?.floorPrice));
    const confidence=Math.max(0,n(pulse?.confidencePct));
    const liquidity=Math.max(0,n(pulse?.liquidityScore));
    const depth=Math.max(0,n(pulse?.marketDepth));
    const base={
      state:'INSUFFICIENT EVIDENCE',recommendedPrice:0,rangeLow:0,rangeHigh:0,
      expectedProfitPerUnit:0,expectedRoiPct:0,marketFloor:floor,listingVsMarketPct:null,
      source:String(pulse?.source||'Market Pulse'),sourceTimestamp:n(pulse?.sourceTimestamp),
      fetchedAt:n(pulse?.fetchedAt),confidencePct:confidence,liquidityScore:liquidity,
      explanation:''
    };
    if(!pulse?.available){
      return {...base,explanation:'No current Market Pulse evidence is available for this item.'};
    }
    if(pulse?.stale){
      return {...base,state:'MARKET DATA STALE',explanation:'Market evidence exists but is outside its defined freshness window.'};
    }
    if(!(floor>0)||!(depth>0)||confidence<30){
      return {...base,explanation:'Fresh evidence is too weak to support a listing recommendation.'};
    }

    const undercutStep=Math.max(1,Math.min(1000,Math.round(floor*0.001)));
    const rangeLow=Math.max(1,floor-undercutStep);
    const rangeHigh=floor;
    const listingVsMarketPct=listingPrice>0?(listingPrice-floor)/floor*100:null;
    let state='PRICE COMPETITIVELY';
    let recommendedPrice=floor;
    let explanation='Fresh market floor supports pricing at the current competitive range.';

    if(cost>0&&rangeHigh<=cost){
      state='HOLD';
      recommendedPrice=0;
      explanation='Current fresh market floor does not clear the tracked FIFO cost basis.';
    }else if(listingPrice>0){
      const delta=(listingPrice-floor)/floor;
      if(delta<=-0.03){
        state='PRICE TOO LOW';
        explanation='Current Bazaar listing is more than 3% below the fresh market floor.';
      }else if(delta>=0.03){
        state='PRICE TOO HIGH';
        explanation='Current Bazaar listing is more than 3% above the fresh market floor.';
      }else{
        state='PRICE COMPETITIVELY';
        recommendedPrice=Math.min(listingPrice,rangeHigh);
        explanation='Current Bazaar listing is within 3% of the fresh market floor.';
      }
    }else if(availableQty>0&&confidence>=55&&liquidity>=55){
      state='UNDERCUT OPPORTUNITY';
      recommendedPrice=rangeLow;
      explanation='Unlisted stock has fresh, sufficiently liquid evidence; a bounded undercut may improve queue position.';
    }else{
      explanation='Fresh market evidence exists, but liquidity/confidence does not justify an undercut recommendation.';
    }

    if(recommendedPrice>0&&cost>0&&recommendedPrice<=cost){
      state='HOLD';
      recommendedPrice=0;
      explanation='Competitive pricing would not clear the tracked FIFO cost basis.';
    }

    const expectedProfitPerUnit=recommendedPrice>0&&cost>0?recommendedPrice-cost:0;
    const expectedRoiPct=recommendedPrice>0&&cost>0?expectedProfitPerUnit/cost*100:0;
    const historyNote=historical>0?' Recent 30-day realized average: '+Math.round(historical).toLocaleString()+'.':'';
    return {
      ...base,state,recommendedPrice,rangeLow,rangeHigh,expectedProfitPerUnit,expectedRoiPct,
      listingVsMarketPct,explanation:explanation+historyNote
    };
  }

  function ensureInventorySlice(slice={}){
    const out=slice&&typeof slice==='object'?slice:{};
    out.sales=out.sales&&typeof out.sales==='object'&&!Array.isArray(out.sales)?out.sales:{};
    out.operations=out.operations&&typeof out.operations==='object'&&!Array.isArray(out.operations)?out.operations:{};
    out.operations.inventoryRoi=out.operations.inventoryRoi&&typeof out.operations.inventoryRoi==='object'&&!Array.isArray(out.operations.inventoryRoi)?out.operations.inventoryRoi:{};
    const inv=out.operations.inventoryRoi;
    inv.listings=inv.listings&&typeof inv.listings==='object'&&!Array.isArray(inv.listings)?inv.listings:{};
    inv.inventory=inv.inventory&&typeof inv.inventory==='object'&&!Array.isArray(inv.inventory)?inv.inventory:{};
    inv.listingPlans=inv.listingPlans&&typeof inv.listingPlans==='object'&&!Array.isArray(inv.listingPlans)?inv.listingPlans:{};
    inv.restockDemand=inv.restockDemand&&typeof inv.restockDemand==='object'&&!Array.isArray(inv.restockDemand)?inv.restockDemand:{};
    return out;
  }

  function normalizeItems(rawItems,saleData={}){
    if(!rawItems)return [];
    let list=[];
    if(Array.isArray(rawItems))list=rawItems;
    else if(typeof rawItems==='object'){
      const single=['id','item_id','item','name','quantity','qty','price','cost','total'].some(k=>k in rawItems);
      list=single?[rawItems]:Object.entries(rawItems).map(([id,value])=>value&&typeof value==='object'?{id,...value}:{id,qty:value});
    }else list=[{id:rawItems}];

    const saleEach=Math.max(0,n(saleData.cost_each??saleData.price_each??saleData.unit_price));
    const saleTotal=Math.max(0,n(saleData.cost_total??saleData.total??saleData.price_total));

    const normalized=list.map(item=>{
      const id=asId(item?.id??item?.item_id??item?.item??'');
      const quantity=Math.max(1,n(item?.quantity??item?.qty)||1);
      const explicitPrice=Math.max(0,n(item?.price??item?.cost_each??item?.cost??item?.unit_price));
      const explicitTotal=Math.max(0,n(item?.total??item?.cost_total??item?.price_total));
      const price=explicitPrice||saleEach||(explicitTotal&&quantity?explicitTotal/quantity:0);
      return {
        id,uid:item?.uid??item?.UID??null,
        name:String(item?.name??item?.item_name??(id?'Item '+id:'Item')),
        quantity,price:Math.round(price),total:Math.round(explicitTotal||(price*quantity))
      };
    });
    if(normalized.length===1&&saleTotal>0){
      normalized[0].total=Math.round(saleTotal);
      normalized[0].price=normalized[0].quantity?Math.round(saleTotal/normalized[0].quantity):normalized[0].price;
    }
    return normalized;
  }

  function extractLogTypeId(entry){
    return n(entry?.details?.id??entry?.details?.log_id??entry?.log_id??entry?.type_id??entry?.type);
  }

  function actorIdentity(value,fallbackName=''){
    if(value&&typeof value==='object'){
      const id=asId(value.id??value.user_id??value.player_id??value.torn_id??value.ID??'');
      const name=String(value.name??value.username??value.player_name??value.user_name??fallbackName??id).trim();
      return {id,name};
    }
    const id=asId(value);
    return {id,name:String(fallbackName||id).trim()};
  }

  function extractBazaarSale(entry){
    if(!entry)return null;
    const typeId=extractLogTypeId(entry);
    if(typeId&&typeId!==BAZAAR_SELL_LOG_ID)return null;
    const data=entry.data&&typeof entry.data==='object'?entry.data:{};
    const buyer=actorIdentity(
      data.buyer??data.buyer_id??data.user??data.user_id??data.player??data.player_id??data.customer??null,
      data.buyer_name??data.user_name??data.player_name??data.customer_name??''
    );
    const saleId=String(entry.id??entry.log_id??entry.uuid??'').trim();
    if(!saleId||!buyer.id||buyer.id==='[object Object]')return null;

    let rawItems=data.items??null;
    if(!rawItems&&data.item&&typeof data.item==='object')rawItems=data.item;
    if(!rawItems&&(data.item_id!=null||(data.item!=null&&typeof data.item!=='object'))){
      rawItems=[{
        id:data.item_id??data.item,name:data.item_name,
        quantity:data.quantity??data.qty??1,price:data.price??data.cost_each??data.unit_price??0,
        total:data.cost_total??data.total??data.cost??0
      }];
    }
    const items=normalizeItems(rawItems,data);
    const unitsFromItems=items.reduce((sum,item)=>sum+Math.max(0,n(item.quantity)),0);
    const units=unitsFromItems||Math.max(1,n(data.quantity??data.qty)||1);
    const costTotal=Math.max(0,n(data.cost_total??data.total??data.price_total));
    const costEach=Math.max(0,n(data.cost_each??data.price_each??data.unit_price??data.price));
    const itemTotal=items.reduce((sum,item)=>sum+Math.max(0,n(item.total)),0);
    const total=Math.round(costTotal||(costEach*units)||itemTotal);
    let timestamp=n(entry.timestamp??entry.time??entry.created_at);
    if(timestamp>0&&timestamp<100_000_000_000)timestamp*=1000;
    if(!timestamp)return null;
    return {id:saleId,playerId:buyer.id,playerName:buyer.name||buyer.id,timestamp,total,units,items,sourceLogType:BAZAAR_SELL_LOG_ID};
  }

  function importSalesEntries(slice,entries=[]){
    ensureInventorySlice(slice);
    let imported=0,rejected=0,checked=0;
    const sorted=[...(entries||[])].sort((a,b)=>n(a?.timestamp)-n(b?.timestamp));
    for(const entry of sorted){
      checked++;
      const sale=extractBazaarSale(entry);
      if(!sale){rejected++;continue;}
      if(slice.sales[sale.id])continue;
      slice.sales[sale.id]=sale;
      imported++;
    }
    slice.operations.inventoryRoi.lastSalesAt=nowIso();
    slice.operations.inventoryRoi.lastSalesResult={imported,rejected,checked};
    return {slice,imported,rejected,checked};
  }

  function parseStackableRows(raw){
    if(!raw)return {};
    let rows=raw;
    if(!Array.isArray(rows)&&typeof rows==='object'){
      rows=Object.entries(rows).map(([id,row])=>row&&typeof row==='object'?{id,...row}:{id,quantity:row});
    }
    if(!Array.isArray(rows))return {};
    const out={};
    for(const row of rows){
      const item=row?.item&&typeof row.item==='object'?row.item:{};
      const id=asId(row?.id??row?.ID??row?.item_id??item?.id??item?.ID);
      if(!id)continue;
      const quantity=Math.max(0,n(row?.quantity??row?.qty??row?.amount??row?.available??row?.count));
      const price=Math.max(0,n(row?.price??row?.cost??row?.listing_price));
      const name=String(row?.name??row?.item_name??item?.name??('Item '+id));
      if(!out[id])out[id]={id,name,quantity:0,price:0,listings:0};
      out[id].quantity+=quantity;
      if(price&&(!out[id].price||price<out[id].price))out[id].price=price;
      out[id].listings++;
    }
    return out;
  }

  function salesItemMetrics(slice,at=Date.now()){
    const cutoff30=Number(at)-30*86400000;
    const cutoff7=Number(at)-7*86400000;
    const metrics={};
    for(const sale of Object.values(slice?.sales||{})){
      const ts=n(sale.timestamp);
      for(const item of sale?.items||[]){
        const id=asId(item.id)||String(item.name||'').toLowerCase();
        if(!id)continue;
        const row=metrics[id]||(metrics[id]={
          id:item.id||'',name:String(item.name||'Item'),units7d:0,units30d:0,revenue30d:0,
          lastSaleAt:0,allUnits:0,allRevenue:0
        });
        const qty=Math.max(0,n(item.quantity));
        const total=Math.max(0,n(item.total)||n(item.price)*qty);
        row.allUnits+=qty;row.allRevenue+=total;row.lastSaleAt=Math.max(row.lastSaleAt,ts);
        if(ts>=cutoff30){row.units30d+=qty;row.revenue30d+=total;}
        if(ts>=cutoff7)row.units7d+=qty;
      }
    }
    for(const row of Object.values(metrics)){
      row.daily30=row.units30d/30;
      row.avgSoldPrice30=row.units30d?row.revenue30d/row.units30d:0;
      row.avgSoldPriceAll=row.allUnits?row.allRevenue/row.allUnits:0;
    }
    return metrics;
  }

  function listingRows(slice){
    ensureInventorySlice(slice);
    const bm=slice.operations.inventoryRoi;
    const metrics=salesItemMetrics(slice);
    const ids=new Set([...Object.keys(bm.listings||{}),...Object.keys(bm.inventory||{})]);
    for(const [id,metric] of Object.entries(metrics)){
      if(/^\d+$/.test(String(id))&&n(metric?.units30d)>0)ids.add(String(id));
    }
    const rows=[];
    for(const id of ids){
      const listing=bm.listings[id]||{};
      const inventory=bm.inventory[id]||{};
      const metric=metrics[id]||metrics[String(listing.name||inventory.name||'').toLowerCase()]||{};
      const bazaarQty=n(listing.quantity);
      const personalQty=n(inventory.quantity);
      const daily=n(metric.daily30);
      const targetListed=daily>0?Math.max(1,Math.ceil(daily*3)):0;
      const addToBazaar=Math.max(0,Math.min(personalQty,Math.max(0,targetListed-bazaarQty)));
      let action='HOLD';
      if(bazaarQty<=0&&personalQty>0&&daily>0)action='LIST';
      else if(addToBazaar>0)action='TOP UP';
      else if(bazaarQty>0&&daily<=0)action='REVIEW SLOW';
      else if(bazaarQty>0)action='HEALTHY';
      const price=n(listing.price)||Math.round(n(metric.avgSoldPrice30)||n(metric.avgSoldPriceAll));
      rows.push({
        id,name:String(listing.name||inventory.name||metric.name||('Item '+id)),
        bazaarQty,bazaarPrice:n(listing.price),personalQty,
        units7d:n(metric.units7d),units30d:n(metric.units30d),daily30:daily,
        avgSoldPrice30:n(metric.avgSoldPrice30),lastSaleAt:n(metric.lastSaleAt),targetListed,addToBazaar,
        plannedPrice:price,action
      });
    }
    return rows.sort((a,b)=>{
      const pr={LIST:0,'TOP UP':1,HEALTHY:2,'REVIEW SLOW':3,HOLD:4};
      return (pr[a.action]??9)-(pr[b.action]??9)||b.daily30-a.daily30||a.name.localeCompare(b.name);
    });
  }

  function updateShopSnapshot(slice,{bazaar,inventory,at=nowIso()}={}){
    ensureInventorySlice(slice);
    const bm=slice.operations.inventoryRoi;
    if(bazaar!==undefined){bm.listings=parseStackableRows(bazaar);bm.lastBazaarAt=at;}
    if(inventory!==undefined){bm.inventory=parseStackableRows(inventory);bm.lastInventoryAt=at;}
    const plans={};
    for(const row of listingRows(slice)){
      plans[row.id]={...row,createdAt:at};
    }
    bm.listingPlans=plans;
    return slice;
  }

  function salesByItemDetailed(db,itemId){
    const id=asId(itemId);const out=[];
    for(const sale of Object.values(db?.sales||{})){
      for(const item of sale?.items||[]){
        if(asId(item.id)!==id)continue;
        out.push({saleId:String(sale.id||''),timestamp:n(sale.timestamp),quantity:n(item.quantity),unitPrice:n(item.price),total:n(item.total),customerId:asId(sale.playerId),customerName:String(sale.playerName||sale.playerId||'')});
      }
    }
    return out.sort((a,b)=>a.timestamp-b.timestamp);
  }

  function fifoLedger(db,itemId){
    const id=asId(itemId);
    const lots=(db?.procurement?.acquisitions||[])
      .filter(a=>asId(a.itemId)===id)
      .map(a=>({id:a.id,acquiredAt:Date.parse(a.acquiredAt||'')||0,quantity:n(a.quantity),remaining:n(a.quantity),unitCost:n(a.unitCost),source:String(a.source||''),sellerId:asId(a.sellerId||''),sellerName:String(a.sellerName||'')}))
      .filter(l=>l.quantity>0&&l.unitCost>=0).sort((a,b)=>a.acquiredAt-b.acquiredAt);
    let cursor=0;const saleRows=[];
    for(const sale of salesByItemDetailed(db,id)){
      let need=sale.quantity,cogs=0,matched=0;
      while(need>0&&cursor<lots.length){
        const lot=lots[cursor];if(lot.acquiredAt>sale.timestamp)break;
        const take=Math.min(need,lot.remaining);cogs+=take*lot.unitCost;matched+=take;lot.remaining-=take;need-=take;if(lot.remaining<=0)cursor++;
      }
      const matchedRevenue=sale.quantity>0?sale.total*matched/sale.quantity:0;
      saleRows.push({...sale,cogs,matchedUnits:matched,unmatchedUnits:Math.max(0,sale.quantity-matched),matchedRevenue,grossProfit:matchedRevenue-cogs});
    }
    const remainingLots=lots.filter(l=>l.remaining>0);
    const remainingCost=remainingLots.reduce((s,l)=>s+l.remaining*l.unitCost,0);
    const remainingQty=remainingLots.reduce((s,l)=>s+l.remaining,0);
    const now=Date.now();
    return {lots,remainingLots:remainingLots.map(l=>({...l,ageDays:l.acquiredAt?(now-l.acquiredAt)/86400000:0,value:l.remaining*l.unitCost})),remainingCost,remainingQty,saleRows};
  }

  function realizedProfitMetrics(db,itemId,days=30,at=Date.now()){
    const ledger=fifoLedger(db,itemId);const cutoff=Number(at)-Math.max(1,n(days))*86400000;
    const rows=ledger.saleRows.filter(s=>s.timestamp>=cutoff);
    const revenue=rows.reduce((s,r)=>s+n(r.total),0),matchedRevenue=rows.reduce((s,r)=>s+n(r.matchedRevenue),0),cogs=rows.reduce((s,r)=>s+n(r.cogs),0);
    const grossProfit=matchedRevenue-cogs,units=rows.reduce((s,r)=>s+n(r.quantity),0),matchedUnits=rows.reduce((s,r)=>s+n(r.matchedUnits),0);
    return {revenue,matchedRevenue,cogs,grossProfit,units,matchedUnits,unmatchedUnits:Math.max(0,units-matchedUnits),costCoveragePct:units>0?matchedUnits/units*100:100,realizedRoiPct:cogs>0?grossProfit/cogs*100:0,ledger};
  }

  function inventoryRoiRows(db,at=Date.now()){
    return listingRows(db).map(row=>{
      const realized=realizedProfitMetrics(db,row.id,30,at),basis=realized.ledger;
      const avgCost=basis.remainingQty>0?basis.remainingCost/basis.remainingQty:0;
      const exit=n(row.plannedPrice)||n(row.bazaarPrice)||n(row.avgSoldPrice30);
      const currentProfitPerUnit=avgCost>0&&exit>0?exit-avgCost:0;
      const ownedQty=Math.max(0,n(row.bazaarQty)+n(row.personalQty));
      const targetStock=Math.max(0,n(row.targetListed));
      const deficit=targetStock>0?Math.max(0,targetStock-ownedQty):0;
      const restockStatus=targetStock<=0?'NO SALES SIGNAL':ownedQty<=0?'OUT OF STOCK':deficit>0?'LOW STOCK':'ON TARGET';
      const staleInventory=n(row.bazaarQty)>0&&n(row.units30d)<=0;
      const pulse=marketPulseEvidence(db,row.id,at);
      const pricing=pricingRecommendation({bazaarPrice:row.bazaarPrice,bazaarQty:row.bazaarQty,personalQty:row.personalQty,avgCost,avgSoldPrice30:row.avgSoldPrice30,pulse});
      const pricingStatus=pricing.state;
      const listingVsMarketPct=pricing.listingVsMarketPct;
      const expectedMarketProfitPerUnit=pulse.usable&&avgCost>0?pulse.floorPrice-avgCost:0;
      const expectedMarketRoiPct=pulse.usable&&avgCost>0?expectedMarketProfitPerUnit/avgCost*100:0;
      const coverDays=n(row.daily30)>0?ownedQty/n(row.daily30):null;
      const lastAcquisitionAt=(basis.lots||[]).reduce((max,lot)=>Math.max(max,n(lot.acquiredAt)),0);
      const attentionReasons=[];
      if(row.action==='LIST'||row.action==='TOP UP'||row.action==='REVIEW SLOW')attentionReasons.push(row.action);
      if(restockStatus==='OUT OF STOCK'||restockStatus==='LOW STOCK')attentionReasons.push(restockStatus);
      if(staleInventory&&!attentionReasons.includes('REVIEW SLOW'))attentionReasons.push('STALE INVENTORY');
      return {...row,avgCost,trackedRemainingQty:basis.remainingQty,trackedRemainingCost:basis.remainingCost,currentProfitPerUnit,currentRoiPct:avgCost>0?currentProfitPerUnit/avgCost*100:0,
        realizedRevenue30:realized.revenue,realizedCogs30:realized.cogs,realizedGrossProfit30:realized.grossProfit,realizedRoiPct30:realized.realizedRoiPct,costCoveragePct30:realized.costCoveragePct,matchedUnits30:realized.matchedUnits,
        ownedQty,targetStock,deficit,restockStatus,staleInventory,coverDays,lastAcquisitionAt,pulse,pricing,pricingStatus,listingVsMarketPct,expectedMarketProfitPerUnit,expectedMarketRoiPct,attentionReasons,needsAttention:attentionReasons.length>0};
    }).sort((a,b)=>
      Number(b.needsAttention)-Number(a.needsAttention)||
      n(b.deficit)-n(a.deficit)||
      n(b.daily30)-n(a.daily30)||
      a.name.localeCompare(b.name)
    );
  }

  function restockDemandRows(db,at=Date.now()){
    return inventoryRoiRows(db,at)
      .filter(row=>n(row.deficit)>0&&n(row.daily30)>0)
      .map(row=>{
        const currentQuantity=Math.max(0,n(row.ownedQty));
        const desiredQuantity=Math.max(0,n(row.targetStock));
        const coverDays=row.coverDays==null?null:n(row.coverDays);
        const urgency=currentQuantity<=0?'URGENT':coverDays!=null&&coverDays<2?'HIGH':'NORMAL';
        const recentRealizedMarginPerUnit=n(row.matchedUnits30)>0?n(row.realizedGrossProfit30)/n(row.matchedUnits30):0;
        return {
          schema:1,itemId:String(row.id),itemName:String(row.name||('Item '+row.id)),
          desiredQuantity,currentQuantity,deficit:Math.max(0,n(row.deficit)),
          restockThreshold:Math.max(1,Math.ceil(n(row.daily30))),
          targetAcquisitionPrice:0,
          recentRealizedMarginPerUnit,
          sellVelocityUnitsPerDay:n(row.daily30),
          liquidityScore:row.pulse?.status==='FRESH'?n(row.pulse?.liquidityScore):0,
          urgency,lastSoldTimestamp:n(row.lastSaleAt),lastAcquisitionTimestamp:n(row.lastAcquisitionAt),
          marketFreshness:String(row.pulse?.status||'MISSING'),
          acquisitionRecommendation:row.pulse?.status==='FRESH'?'SOURCE AND VERIFY':'SOURCE; REFRESH EXIT EVIDENCE',
          status:'OPEN'
        };
      })
      .sort((a,b)=>{
        const priority={URGENT:0,HIGH:1,NORMAL:2};
        return (priority[a.urgency]??9)-(priority[b.urgency]??9)||
          n(b.sellVelocityUnitsPerDay)-n(a.sellVelocityUnitsPerDay)||
          n(b.deficit)-n(a.deficit)||
          a.itemName.localeCompare(b.itemName);
      })
      .slice(0,RESTOCK_DEMAND_MAX);
  }

  function replaceRestockDemand(slice,rows=[],at=Date.now()){
    ensureInventorySlice(slice);
    const inv=slice.operations.inventoryRoi;
    const compact={};
    for(const row of (Array.isArray(rows)?rows:[]).slice(0,RESTOCK_DEMAND_MAX)){
      const id=asId(row?.itemId);
      if(!/^\d+$/.test(id)||!(n(row?.deficit)>0))continue;
      compact[id]={
        schema:1,itemId:id,itemName:String(row.itemName||('Item '+id)),
        desiredQuantity:Math.max(0,n(row.desiredQuantity)),
        currentQuantity:Math.max(0,n(row.currentQuantity)),
        deficit:Math.max(0,n(row.deficit)),
        restockThreshold:Math.max(0,n(row.restockThreshold)),
        targetAcquisitionPrice:Math.max(0,n(row.targetAcquisitionPrice)),
        recentRealizedMarginPerUnit:n(row.recentRealizedMarginPerUnit),
        sellVelocityUnitsPerDay:Math.max(0,n(row.sellVelocityUnitsPerDay)),
        liquidityScore:Math.max(0,n(row.liquidityScore)),
        urgency:String(row.urgency||'NORMAL'),
        lastSoldTimestamp:Math.max(0,n(row.lastSoldTimestamp)),
        lastAcquisitionTimestamp:Math.max(0,n(row.lastAcquisitionTimestamp)),
        marketFreshness:String(row.marketFreshness||'MISSING'),
        acquisitionRecommendation:String(row.acquisitionRecommendation||'SOURCE AND VERIFY'),
        status:String(row.status||'OPEN')
      };
    }
    const current=inv.restockDemand&&typeof inv.restockDemand==='object'?inv.restockDemand:{};
    const stableCurrent={};
    for(const [id,row] of Object.entries(current)){
      const copy={...(row||{})};delete copy.updatedAt;stableCurrent[id]=copy;
    }
    const changed=JSON.stringify(stableCurrent)!==JSON.stringify(compact);
    if(changed){
      const updatedAt=Math.max(0,n(at))||Date.now();
      inv.restockDemand=Object.fromEntries(Object.entries(compact).map(([id,row])=>[id,{...row,updatedAt}]));
      inv.lastRestockDemandAt=new Date(updatedAt).toISOString();
    }
    return {changed,count:Object.keys(compact).length,rows:compact};
  }

  function dashboardSummary(db,at=Date.now()){
    const rows=inventoryRoiRows(db,at);
    const sales=Object.values(db?.sales||{});
    const revenue30=sales.filter(s=>n(s.timestamp)>=Number(at)-30*DAY_MS).reduce((sum,s)=>sum+n(s.total),0);
    const gross30=rows.reduce((sum,row)=>sum+n(row.realizedGrossProfit30),0);
    const cogs30=rows.reduce((sum,row)=>sum+n(row.realizedCogs30),0);
    return {
      skuCount:rows.length,
      ownedUnits:rows.reduce((sum,row)=>sum+n(row.ownedQty),0),
      listedUnits:rows.reduce((sum,row)=>sum+n(row.bazaarQty),0),
      revenue30,gross30,cogs30,realizedRoiPct30:cogs30>0?gross30/cogs30*100:0,
      attentionCount:rows.filter(row=>row.needsAttention).length,
      restockSkuCount:rows.filter(row=>row.deficit>0).length,
      restockUnits:rows.reduce((sum,row)=>sum+n(row.deficit),0),
      pulseFreshCount:rows.filter(row=>row.pulse?.status==='FRESH').length,
      pulseStaleCount:rows.filter(row=>row.pulse?.status==='STALE').length,
      pulseMissingCount:rows.filter(row=>row.pulse?.status==='MISSING').length
    };
  }

  const api=Object.freeze({
    BAZAAR_SELL_LOG_ID,
    ensureInventorySlice,normalizeItems,extractBazaarSale,importSalesEntries,
    parseStackableRows,salesItemMetrics,listingRows,updateShopSnapshot,
    marketPulseEvidence,pricingRecommendation,salesByItemDetailed,fifoLedger,realizedProfitMetrics,inventoryRoiRows,restockDemandRows,replaceRestockDemand,dashboardSummary
  });

  Object.defineProperty(globalThis,'MMTornInventoryRoiLogic',{value:api,configurable:true,enumerable:false,writable:false});
})();