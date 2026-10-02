(() => {
  'use strict';

  const BAZAAR_SELL_LOG_ID=1226;
  const COUPON_WINDOW_MS=24*60*60*1000;
  const COUPON_MAX_USES=2;
  const MAX_CASHBACK_PERCENT=0.10;
  const CASHBACK_TIERS=Object.freeze([
    {minimum:1_000_000,cashback:20_000},
    {minimum:250_000,cashback:10_000},
    {minimum:50_000,cashback:5_000}
  ]);

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const asId=v=>String(v??'').trim();
  const clone=v=>v==null?v:(typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v)));
  const nowIso=()=>new Date().toISOString();
  const makeId=prefix=>String(prefix||'id')+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
  const makeCouponCode=playerId=>'SAVE-'+asId(playerId);

  function ensureBazaarSlice(slice={}){
    const out=slice&&typeof slice==='object'?slice:{};
    out.customers=out.customers&&typeof out.customers==='object'&&!Array.isArray(out.customers)?out.customers:{};
    out.sales=out.sales&&typeof out.sales==='object'&&!Array.isArray(out.sales)?out.sales:{};
    out.coupons=out.coupons&&typeof out.coupons==='object'&&!Array.isArray(out.coupons)?out.coupons:{};
    out.refunds=out.refunds&&typeof out.refunds==='object'&&!Array.isArray(out.refunds)?out.refunds:{};
    out.subscribers=out.subscribers&&typeof out.subscribers==='object'&&!Array.isArray(out.subscribers)?out.subscribers:{};
    out.removedCustomers=out.removedCustomers&&typeof out.removedCustomers==='object'&&!Array.isArray(out.removedCustomers)?out.removedCustomers:{};
    out.notificationHistory=Array.isArray(out.notificationHistory)?out.notificationHistory:[];
    out.operations=out.operations&&typeof out.operations==='object'&&!Array.isArray(out.operations)?out.operations:{};
    out.operations.bazaarManager=out.operations.bazaarManager&&typeof out.operations.bazaarManager==='object'
      ?out.operations.bazaarManager:{};
    const bm=out.operations.bazaarManager;
    bm.listings=bm.listings&&typeof bm.listings==='object'&&!Array.isArray(bm.listings)?bm.listings:{};
    bm.inventory=bm.inventory&&typeof bm.inventory==='object'&&!Array.isArray(bm.inventory)?bm.inventory:{};
    bm.listingPlans=bm.listingPlans&&typeof bm.listingPlans==='object'&&!Array.isArray(bm.listingPlans)?bm.listingPlans:{};
    return out;
  }

  function ensureCustomer(slice,playerId,playerName=''){
    ensureBazaarSlice(slice);
    const id=asId(playerId);
    if(!id)return null;
    if(!slice.customers[id]){
      slice.customers[id]={
        id,name:String(playerName||id),purchases:0,units:0,spent:0,
        firstPurchase:null,lastPurchase:null,contacted:false,firstMessageSent:false,
        messageCount:0,lastContacted:null,createdAt:nowIso(),manual:false
      };
    }else if(playerName&&!/^\d+$/.test(String(playerName))){
      slice.customers[id].name=String(playerName);
    }
    return slice.customers[id];
  }

  function ensureCoupon(slice,customer){
    ensureBazaarSlice(slice);
    const id=asId(customer?.id||customer?.playerId);
    if(!id)return null;
    if(!slice.coupons[id]){
      slice.coupons[id]={
        playerId:id,playerName:String(customer?.name||id),code:makeCouponCode(id),
        maxUses:COUPON_MAX_USES,uses:0,redemptions:[],pendingRefundId:null,
        createdAt:nowIso(),issuedAt:null
      };
    }
    return slice.coupons[id];
  }

  function couponRemaining(coupon){
    return Math.max(0,n(coupon?.maxUses||COUPON_MAX_USES)-n(coupon?.uses));
  }

  function usedSaleIds(coupon){
    const ids=new Set();
    for(const redemption of coupon?.redemptions||[]){
      for(const id of redemption?.saleIds||[])ids.add(String(id));
    }
    return ids;
  }

  function eligibleCouponSales(slice,coupon,at=Date.now()){
    if(!coupon?.issuedAt)return [];
    const issued=Date.parse(coupon.issuedAt)||0;
    const cutoff=Math.max(issued,Number(at)-COUPON_WINDOW_MS);
    const used=usedSaleIds(coupon);
    return Object.values(slice?.sales||{})
      .filter(sale=>asId(sale.playerId)===asId(coupon.playerId))
      .filter(sale=>n(sale.timestamp)>=cutoff)
      .filter(sale=>!used.has(String(sale.id)))
      .sort((a,b)=>n(a.timestamp)-n(b.timestamp));
  }

  function cashbackForAmount(total){
    const amount=Math.max(0,n(total));
    const tier=CASHBACK_TIERS.find(row=>amount>=row.minimum);
    if(!tier)return {qualified:false,cashback:0,tier:null};
    const cap=Math.floor(amount*MAX_CASHBACK_PERCENT);
    return {qualified:true,cashback:Math.min(tier.cashback,cap),tier:clone(tier)};
  }

  function couponQualification(slice,coupon,at=Date.now()){
    if(!coupon)return {qualified:false,reason:'Coupon not found.',total:0,cashback:0,sales:[]};
    if(!coupon.issuedAt)return {qualified:false,reason:'Coupon has not been issued yet.',total:0,cashback:0,sales:[]};
    if(couponRemaining(coupon)<=0)return {qualified:false,reason:'Coupon is fully redeemed.',total:0,cashback:0,sales:[]};
    if(coupon.pendingRefundId)return {qualified:false,reason:'A cashback refund is already pending.',total:0,cashback:0,sales:[]};
    const sales=eligibleCouponSales(slice,coupon,at);
    const total=sales.reduce((sum,sale)=>sum+n(sale.total),0);
    const calc=cashbackForAmount(total);
    if(!calc.qualified){
      const needed=Math.max(0,50_000-total);
      return {
        qualified:false,
        reason:total?'$'+Math.round(needed).toLocaleString()+' more needed for $5,000 cashback.':'No qualifying post-coupon purchase found in the last 24 hours.',
        total,cashback:0,sales
      };
    }
    return {qualified:true,reason:'Qualified.',total,cashback:calc.cashback,tier:calc.tier,sales};
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

  function customerRemoved(slice,playerId){
    const record=slice?.removedCustomers?.[asId(playerId)];
    if(!record)return false;
    const removed=Date.parse(record.removedAt||'')||0;
    const reactivated=Date.parse(record.reactivatedAt||'')||0;
    return removed>0&&removed>reactivated;
  }

  function applySaleToCustomer(slice,sale){
    const customer=ensureCustomer(slice,sale.playerId,sale.playerName);
    if(!customer)return null;
    ensureCoupon(slice,customer);
    customer.purchases=n(customer.purchases)+1;
    customer.units=n(customer.units)+n(sale.units);
    customer.spent=n(customer.spent)+n(sale.total);
    const iso=new Date(n(sale.timestamp)).toISOString();
    const first=Date.parse(customer.firstPurchase||'')||0;
    const last=Date.parse(customer.lastPurchase||'')||0;
    if(!first||n(sale.timestamp)<first)customer.firstPurchase=iso;
    if(!last||n(sale.timestamp)>last)customer.lastPurchase=iso;
    return customer;
  }

  function recalculateCustomers(slice){
    ensureBazaarSlice(slice);
    for(const customer of Object.values(slice.customers)){
      customer.purchases=0;customer.units=0;customer.spent=0;customer.firstPurchase=null;customer.lastPurchase=null;
    }
    const sales=Object.values(slice.sales).slice().sort((a,b)=>n(a.timestamp)-n(b.timestamp));
    for(const sale of sales){
      if(!sale?.playerId||customerRemoved(slice,sale.playerId))continue;
      applySaleToCustomer(slice,sale);
    }
    return slice;
  }

  function importSalesEntries(slice,entries=[]){
    ensureBazaarSlice(slice);
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
    recalculateCustomers(slice);
    slice.operations.bazaarManager.lastSalesAt=nowIso();
    slice.operations.bazaarManager.lastSalesResult={imported,rejected,checked};
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
    ensureBazaarSlice(slice);
    const bm=slice.operations.bazaarManager;
    const metrics=salesItemMetrics(slice);
    const ids=new Set([...Object.keys(bm.listings||{}),...Object.keys(bm.inventory||{})]);
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
        avgSoldPrice30:n(metric.avgSoldPrice30),targetListed,addToBazaar,
        plannedPrice:price,action
      });
    }
    return rows.sort((a,b)=>{
      const pr={LIST:0,'TOP UP':1,HEALTHY:2,'REVIEW SLOW':3,HOLD:4};
      return (pr[a.action]??9)-(pr[b.action]??9)||b.daily30-a.daily30||a.name.localeCompare(b.name);
    });
  }

  function updateShopSnapshot(slice,{bazaar,inventory,at=nowIso()}={}){
    ensureBazaarSlice(slice);
    const bm=slice.operations.bazaarManager;
    if(bazaar!==undefined){bm.listings=parseStackableRows(bazaar);bm.lastBazaarAt=at;}
    if(inventory!==undefined){bm.inventory=parseStackableRows(inventory);bm.lastInventoryAt=at;}
    const plans={};
    for(const row of listingRows(slice)){
      plans[row.id]={...row,createdAt:at};
    }
    bm.listingPlans=plans;
    return slice;
  }

  function customerRfmRows(slice,at=Date.now()){
    const affinity={};
    for(const sale of Object.values(slice?.sales||{})){
      const id=asId(sale.playerId);if(!id)continue;
      const map=affinity[id]||(affinity[id]={});
      for(const item of sale?.items||[]){
        const name=String(item.name||'Unknown item');
        map[name]=(map[name]||0)+n(item.quantity);
      }
    }
    return Object.values(slice?.customers||{}).map(customer=>{
      const recencyDays=customer.lastPurchase?Math.max(0,(Number(at)-(Date.parse(customer.lastPurchase)||0))/86400000):9999;
      const frequency=n(customer.purchases),monetary=n(customer.spent);
      let segment='DORMANT';
      if(recencyDays<=7&&frequency>=8)segment='VIP';
      else if(recencyDays<=14&&frequency>=4)segment='LOYAL';
      else if(recencyDays<=30&&frequency>=2)segment='REGULAR';
      else if(frequency<=1&&recencyDays<=30)segment='NEW';
      else if(frequency>=3&&recencyDays<=60)segment='AT RISK';
      return {...clone(customer),recencyDays,frequency,monetary,segment,
        topProducts:Object.entries(affinity[asId(customer.id)]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3)};
    }).sort((a,b)=>a.recencyDays-b.recencyDays||b.monetary-a.monetary);
  }

  function issueCoupon(slice,playerId,at=nowIso()){
    ensureBazaarSlice(slice);
    const customer=slice.customers[asId(playerId)];
    if(!customer)throw new Error('Customer not found.');
    const coupon=ensureCoupon(slice,customer);
    if(!coupon.issuedAt)coupon.issuedAt=at;
    return coupon;
  }

  function subscribeCustomer(slice,playerId){
    ensureBazaarSlice(slice);
    const id=asId(playerId);
    const customer=slice.customers[id];
    if(!customer)throw new Error('Customer not found.');
    const prior=slice.subscribers[id]||{};
    slice.subscribers[id]={
      id,name:String(customer.name||id),subscribedAt:prior.subscribedAt||nowIso(),
      lastPrepared:prior.lastPrepared||null,lastNotified:prior.lastNotified||null,
      pendingNotification:prior.pendingNotification||null,
      interests:Array.isArray(prior.interests)?prior.interests:[]
    };
    return slice.subscribers[id];
  }

  function unsubscribeCustomer(slice,playerId){
    ensureBazaarSlice(slice);
    delete slice.subscribers[asId(playerId)];
  }

  function createRefund(slice,playerId,at=nowIso()){
    ensureBazaarSlice(slice);
    const id=asId(playerId);
    const customer=slice.customers[id];
    const coupon=slice.coupons[id];
    if(!customer||!coupon)throw new Error('Customer/coupon not found.');
    const q=couponQualification(slice,coupon,Date.parse(at)||Date.now());
    if(!q.qualified)throw new Error(q.reason);
    const refundId=makeId('refund');
    slice.refunds[refundId]={
      id:refundId,playerId:id,playerName:String(customer.name||id),couponCode:coupon.code,
      amount:q.cashback,purchaseTotal:q.total,saleIds:q.sales.map(s=>String(s.id)),
      status:'pending',createdAt:at,completedAt:null,cancelledAt:null
    };
    coupon.pendingRefundId=refundId;
    return slice.refunds[refundId];
  }

  function completeRefund(slice,refundId,at=nowIso()){
    ensureBazaarSlice(slice);
    const id=asId(refundId);
    const refund=slice.refunds[id];
    if(!refund)throw new Error('Refund not found.');
    if(refund.status==='completed')return refund;
    if(refund.status!=='pending')throw new Error('Refund is not pending.');
    const coupon=slice.coupons[refund.playerId];
    if(!coupon)throw new Error('Coupon not found.');
    refund.status='completed';refund.completedAt=at;
    coupon.redemptions=Array.isArray(coupon.redemptions)?coupon.redemptions:[];
    if(!coupon.redemptions.some(r=>asId(r.refundId)===id)){
      coupon.redemptions.push({
        refundId:id,amount:refund.amount,purchaseTotal:refund.purchaseTotal,
        saleIds:[...(refund.saleIds||[])],completedAt:at
      });
    }
    coupon.uses=Math.max(n(coupon.uses),coupon.redemptions.length);
    coupon.pendingRefundId=null;
    return refund;
  }

  function cancelRefund(slice,refundId,at=nowIso()){
    ensureBazaarSlice(slice);
    const refund=slice.refunds[asId(refundId)];
    if(!refund||refund.status!=='pending')return null;
    refund.status='cancelled';refund.cancelledAt=at;
    const coupon=slice.coupons[refund.playerId];
    if(coupon?.pendingRefundId===refund.id)coupon.pendingRefundId=null;
    return refund;
  }

  function currentBazaarRows(slice,subscriber=null){
    ensureBazaarSlice(slice);
    const interests=Array.isArray(subscriber?.interests)?subscriber.interests.map(v=>String(v).trim().toLowerCase()).filter(Boolean):[];
    return Object.values(slice.operations.bazaarManager.listings||{})
      .filter(row=>n(row.quantity)>0)
      .filter(row=>!interests.length||interests.some(v=>v===asId(row.id).toLowerCase()||v===String(row.name||'').trim().toLowerCase()))
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }

  const api=Object.freeze({
    BAZAAR_SELL_LOG_ID,COUPON_WINDOW_MS,COUPON_MAX_USES,CASHBACK_TIERS,
    ensureBazaarSlice,ensureCustomer,ensureCoupon,couponRemaining,eligibleCouponSales,cashbackForAmount,couponQualification,
    normalizeItems,extractBazaarSale,applySaleToCustomer,recalculateCustomers,importSalesEntries,
    parseStackableRows,salesItemMetrics,listingRows,updateShopSnapshot,customerRfmRows,
    issueCoupon,subscribeCustomer,unsubscribeCustomer,createRefund,completeRefund,cancelRefund,currentBazaarRows,
    makeCouponCode
  });

  Object.defineProperty(globalThis,'MMTornBazaarLogic',{value:api,configurable:true,enumerable:false,writable:false});
})();