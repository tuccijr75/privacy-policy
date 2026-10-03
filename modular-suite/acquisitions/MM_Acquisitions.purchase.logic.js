(() => {
  'use strict';
  const ACQUISITION_LOG_IDS=Object.freeze({1112:'Item Market',1225:'Bazaar'});
  const asId=v=>String(v??'').trim();
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  function ensureProcurement(proc={}){
    const out=proc&&typeof proc==='object'?proc:{};
    out.catalog=out.catalog&&typeof out.catalog==='object'&&!Array.isArray(out.catalog)?out.catalog:{};
    out.acquisitions=Array.isArray(out.acquisitions)?out.acquisitions:[];
    out.acquisitionProcessed=out.acquisitionProcessed&&typeof out.acquisitionProcessed==='object'&&!Array.isArray(out.acquisitionProcessed)?out.acquisitionProcessed:{};
    return out;
  }
  function normalizeItems(raw){
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([id,row])=>row&&typeof row==='object'?{id,...row}:{id,quantity:row});
    return [];
  }
  function parseAcquisitionLog(entry,source,catalog={}){
    const data=entry?.data&&typeof entry.data==='object'?entry.data:{};
    const rawItems=normalizeItems(data.items??(data.item?[data.item]:[]));if(!rawItems.length)return [];
    const costEach=n(data.cost_each??data.price_each??data.unit_price),costTotal=n(data.cost_total??data.total??data.price_total);
    const totalQty=rawItems.reduce((sum,item)=>sum+Math.max(1,n(item?.qty??item?.quantity)||1),0);
    let timestamp=n(entry?.timestamp??entry?.time);if(timestamp>0&&timestamp<100_000_000_000)timestamp*=1000;if(!timestamp)return [];
    return rawItems.map((item,index)=>{
      const id=asId(item?.id??item?.item_id??item?.item?.id),quantity=Math.max(1,n(item?.qty??item?.quantity)||1);
      const explicit=n(item?.price??item?.cost_each??item?.unit_price),allocatedUnitCost=explicit||costEach||(costTotal&&totalQty?costTotal/totalQty:0);
      const externalId='logbuy:'+String(entry?.id??entry?.log_id??timestamp)+':'+id+':'+index;
      return {id:externalId,externalId,itemId:id,itemName:String(catalog?.[id]?.name||item?.name||item?.item_name||('Item '+id)),source:String(source||'Unknown'),quantity,unitCost:allocatedUnitCost,
        notes:'Auto-imported from Torn purchase log',sellerId:asId(data.seller??data.seller_id??data.user??data.user_id??data.player??data.player_id??''),sellerName:String(data.seller_name??data.user_name??data.player_name??''),acquiredAt:new Date(timestamp).toISOString(),logId:String(entry?.id??entry?.log_id??'')};
    }).filter(row=>row.itemId&&row.quantity>0&&row.unitCost>=0);
  }
  function mergeAcquisitionLogRows(proc,rows,source){
    proc=ensureProcurement(proc);let added=0;
    for(const entry of rows||[])for(const lot of parseAcquisitionLog(entry,source,proc.catalog)){if(proc.acquisitionProcessed[lot.externalId])continue;proc.acquisitions.push(lot);proc.acquisitionProcessed[lot.externalId]=true;added++;}
    proc.acquisitions.sort((a,b)=>(Date.parse(a.acquiredAt||'')||0)-(Date.parse(b.acquiredAt||'')||0));return added;
  }
  function syncWindowStart(proc,at=Date.now(),maxLookbackDays=180,overlapHours=24){
    ensureProcurement(proc);const floor=Number(at)-Math.max(1,n(maxLookbackDays))*86400000;const last=Date.parse(proc.lastAcquisitionSyncAt||'')||0;
    return last?Math.max(floor,last-Math.max(1,n(overlapHours))*3600000):floor;
  }
  const api=Object.freeze({ACQUISITION_LOG_IDS,ensureProcurement,parseAcquisitionLog,mergeAcquisitionLogRows,syncWindowStart});
  Object.defineProperty(globalThis,'MMTornAcquisitionLedger',{value:api,configurable:true,enumerable:false,writable:false});
})();