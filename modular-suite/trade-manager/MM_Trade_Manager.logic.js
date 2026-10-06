(() => {
  'use strict';

  const MAX_TRADE_HISTORY=250;
  const MAX_RECONCILIATIONS=250;
  const DEFAULT_MARKET_MAX_AGE_MS=15*60*1000;
  const inventoryLogic=globalThis.MMTornInventoryRoiLogic||null;

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const asId=v=>String(v??'').trim();
  const epochMs=value=>{
    if(typeof value==='string'){
      const parsed=Date.parse(value);
      if(Number.isFinite(parsed)&&parsed>0)return parsed;
    }
    const raw=n(value);
    if(!(raw>0))return 0;
    return raw<100_000_000_000?raw*1000:raw;
  };
  const iso=value=>{
    const ms=epochMs(value);
    return ms?new Date(ms).toISOString():null;
  };
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function ensureTradeSlice(slice={}){
    const out=slice&&typeof slice==='object'?slice:{};
    out.operations=out.operations&&typeof out.operations==='object'&&!Array.isArray(out.operations)?out.operations:{};
    out.operations.tradeManager=out.operations.tradeManager&&typeof out.operations.tradeManager==='object'&&!Array.isArray(out.operations.tradeManager)?out.operations.tradeManager:{};
    const tm=out.operations.tradeManager;
    tm.trades=tm.trades&&typeof tm.trades==='object'&&!Array.isArray(tm.trades)?tm.trades:{};
    tm.conflicts=Array.isArray(tm.conflicts)?tm.conflicts:[];
    out.operations.inventoryRoi=out.operations.inventoryRoi&&typeof out.operations.inventoryRoi==='object'&&!Array.isArray(out.operations.inventoryRoi)?out.operations.inventoryRoi:{};
    out.operations.inventoryRoi.tradeReconciliation=out.operations.inventoryRoi.tradeReconciliation&&typeof out.operations.inventoryRoi.tradeReconciliation==='object'&&!Array.isArray(out.operations.inventoryRoi.tradeReconciliation)?out.operations.inventoryRoi.tradeReconciliation:{};
    return out;
  }

  function itemName(state,itemId){
    const id=asId(itemId);
    return String(
      state?.procurement?.catalog?.[id]?.name||
      state?.marketIntel?.marketPulse?.items?.[id]?.itemName||
      state?.marketIntel?.marketplace?.[id]?.itemName||
      ('Item '+id)
    );
  }

  function marketEvidence(state,itemId,at=Date.now()){
    const id=asId(itemId);
    const pulseState=state?.marketIntel?.marketPulse||{};
    const pulse=pulseState?.items?.[id];
    const pulseTtl=Math.max(0,n(pulseState?.settings?.ttlMs));
    if(pulse&&typeof pulse==='object'){
      const fetchedAt=epochMs(pulse.fetchedAt??pulse.lastSnapshot?.fetchedAt);
      const sourceTimestamp=epochMs(pulse.sourceTimestamp??pulse.lastSnapshot?.sourceTimestamp);
      const price=Math.max(0,n(pulse.floorPrice??pulse.lastSnapshot?.floorPrice));
      const stale=!(fetchedAt>0&&pulseTtl>0)||Number(at)-fetchedAt>pulseTtl;
      if(price>0){
        return {
          itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,
          source:'Market Pulse',provider:String(pulse.lastSnapshot?.source||pulse.sources?.itemMarket||'Torn API v2 Item Market'),
          sourceTimestamp,fetchedAt,maxAgeMs:pulseTtl,
          confidencePct:Math.max(0,n(pulse.confidencePct)),liquidityScore:Math.max(0,n(pulse.liquidityScore))
        };
      }
    }

    const rulesMs=Math.max(30_000,n(state?.businessRules?.maxListingAgeSec)*1000||0);
    const snap=state?.procurement?.marketSnapshots?.[id];
    if(snap&&typeof snap==='object'){
      const fetchedAt=epochMs(snap.fetchedAt);
      const price=Math.max(0,n(snap?.itemMarket?.lowest));
      const stale=!(fetchedAt>0)||Number(at)-fetchedAt>rulesMs;
      if(price>0){
        return {itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,source:'Item Market snapshot',provider:'Torn API v2 Item Market',sourceTimestamp:fetchedAt,fetchedAt,maxAgeMs:rulesMs,confidencePct:0,liquidityScore:0};
      }
    }

    const market=state?.marketIntel?.marketplace?.[id];
    const generatedAt=epochMs(state?.marketIntel?.marketplaceGeneratedAt);
    const marketplaceMaxAge=Math.max(DEFAULT_MARKET_MAX_AGE_MS,rulesMs);
    if(market&&typeof market==='object'){
      const price=Math.max(0,n(market.lowestPrice)||n(market.bazaarAverage));
      const stale=!(generatedAt>0)||Number(at)-generatedAt>marketplaceMaxAge;
      if(price>0){
        return {itemId:id,price,status:stale?'STALE':'FRESH',usable:!stale,source:'Bazaar aggregate',provider:'Shared market cache',sourceTimestamp:generatedAt,fetchedAt:generatedAt,maxAgeMs:marketplaceMaxAge,confidencePct:0,liquidityScore:0};
      }
    }

    return {itemId:id,price:0,status:'MISSING',usable:false,source:'Shared market state',provider:'none',sourceTimestamp:0,fetchedAt:0,maxAgeMs:0,confidencePct:0,liquidityScore:0};
  }

  function participant(value){
    return {id:asId(value?.id),name:String(value?.name||'').trim()};
  }

  function tradeStatus(trade){
    if(epochMs(trade?.completed_at||trade?.completedAt)>0)return 'COMPLETED';
    if(epochMs(trade?.expires_at||trade?.expiresAt)>0)return 'ONGOING';
    return 'UNKNOWN';
  }

  function normalizeTrade(trade,selfId,state={},at=Date.now()){
    const raw=trade?.trade&&typeof trade.trade==='object'?trade.trade:trade;
    if(!raw||typeof raw!=='object')throw new Error('Trade payload is missing.');
    const id=asId(raw.id);
    if(!/^\d+$/.test(id))throw new Error('Trade payload is missing a valid API trade ID.');
    const me=asId(selfId);
    if(!/^\d+$/.test(me))throw new Error('Authenticated Torn user ID is required to classify trade sides.');
    const user=participant(raw.user),trader=participant(raw.trader);
    if(user.id!==me&&trader.id!==me)throw new Error('Authenticated user is not a participant in this trade.');
    const counterparty=user.id===me?trader:user;
    const supplied={items:[],money:0,other:[]};
    const received={items:[],money:0,other:[]};
    for(const entry of Array.isArray(raw.items)?raw.items:[]){
      const owner=asId(entry?.user_id);
      const side=owner===me?supplied:received;
      const type=String(entry?.type||'Unknown');
      const details=entry?.details&&typeof entry.details==='object'?entry.details:{};
      if(type==='Money'){
        side.money+=Math.max(0,n(details.amount));
      }else if(type==='Item'){
        const itemId=asId(details.id);
        const quantity=Math.max(0,n(details.amount));
        if(!/^\d+$/.test(itemId)||!(quantity>0))continue;
        const evidence=marketEvidence(state,itemId,at);
        side.items.push({itemId,uid:details.uid??null,itemName:itemName(state,itemId),quantity,evidence,referenceValue:evidence.usable?evidence.price*quantity:0});
      }else{
        side.other.push({type,userId:owner,details:clone(details)});
      }
    }
    return {
      id,description:String(raw.description||''),status:tradeStatus(raw),
      completedAt:epochMs(raw.completed_at||raw.completedAt),expiresAt:epochMs(raw.expires_at||raw.expiresAt),modifiedAt:epochMs(raw.modified_at||raw.modifiedAt),
      user,trader,counterparty,supplied,received,observedAt:Number(at)
    };
  }

  function currentFifoCost(state,itemId,quantity){
    const qty=Math.max(0,n(quantity));
    if(!(qty>0))return {requestedUnits:0,matchedUnits:0,unmatchedUnits:0,cost:0,coveragePct:100,source:'Inventory Manager FIFO'};
    if(!inventoryLogic||typeof inventoryLogic.fifoLedger!=='function')return {requestedUnits:qty,matchedUnits:0,unmatchedUnits:qty,cost:0,coveragePct:0,source:'Inventory Manager FIFO unavailable'};
    let ledger;
    try{ledger=inventoryLogic.fifoLedger(state,asId(itemId));}catch{return {requestedUnits:qty,matchedUnits:0,unmatchedUnits:qty,cost:0,coveragePct:0,source:'Inventory Manager FIFO error'};}
    const lots=(Array.isArray(ledger?.remainingLots)?ledger.remainingLots:[])
      .map(lot=>({remaining:Math.max(0,n(lot.remaining)),unitCost:Math.max(0,n(lot.unitCost))}))
      .filter(lot=>lot.remaining>0);
    let need=qty,cost=0,matched=0;
    for(const lot of lots){
      if(!(need>0))break;
      const take=Math.min(need,lot.remaining);
      cost+=take*lot.unitCost;matched+=take;need-=take;
    }
    return {requestedUnits:qty,matchedUnits:matched,unmatchedUnits:Math.max(0,qty-matched),cost,coveragePct:qty>0?matched/qty*100:100,source:'Inventory Manager current FIFO remaining lots'};
  }

  function evaluateTrade(state,trade,selfId,at=Date.now()){
    const normalized=normalizeTrade(trade,selfId,state,at);
    const suppliedMarketValue=normalized.supplied.items.reduce((sum,row)=>sum+(row.evidence.usable?row.referenceValue:0),0);
    const receivedMarketValue=normalized.received.items.reduce((sum,row)=>sum+(row.evidence.usable?row.referenceValue:0),0);
    const suppliedFresh=normalized.supplied.items.every(row=>row.evidence.usable);
    const receivedFresh=normalized.received.items.every(row=>row.evidence.usable);
    const costRows=normalized.supplied.items.map(row=>({itemId:row.itemId,itemName:row.itemName,quantity:row.quantity,...currentFifoCost(state,row.itemId,row.quantity)}));
    const costBasis=costRows.reduce((sum,row)=>sum+n(row.cost),0);
    const requestedUnits=costRows.reduce((sum,row)=>sum+n(row.requestedUnits),0);
    const matchedUnits=costRows.reduce((sum,row)=>sum+n(row.matchedUnits),0);
    const costCoveragePct=requestedUnits>0?matchedUnits/requestedUnits*100:100;
    const netCash=normalized.received.money-normalized.supplied.money;
    const unsupportedAssets=normalized.supplied.other.length+normalized.received.other.length;
    const referenceBalance=suppliedFresh&&receivedFresh&&unsupportedAssets===0
      ?(normalized.received.money+receivedMarketValue)-(normalized.supplied.money+suppliedMarketValue)
      :null;
    const marginReady=receivedFresh&&costCoveragePct>=99.999&&unsupportedAssets===0;
    const margin=marginReady?(normalized.received.money+receivedMarketValue)-(normalized.supplied.money+costBasis):null;
    const marginKind=margin==null?'UNAVAILABLE':normalized.received.items.length===0?'REALIZED_CASH_VS_CURRENT_FIFO':'ESTIMATED_MIXED_REFERENCE';
    const valuationStatus=unsupportedAssets>0?'UNSUPPORTED_ASSET_PRESENT':!suppliedFresh||!receivedFresh?'STALE_OR_MISSING_MARKET_EVIDENCE':costCoveragePct<99.999?'INCOMPLETE_COST_BASIS':'READY';
    return {
      ...normalized,
      valuation:{
        status:valuationStatus,suppliedMarketValue,receivedMarketValue,netCash,referenceBalance,
        costBasis,costCoveragePct,margin,marginKind,costRows,
        marketEvidenceFresh:Boolean(suppliedFresh&&receivedFresh),valuedAt:Number(at)
      },
      recordable:normalized.status==='COMPLETED'&&normalized.completedAt>0
    };
  }

  function tradeFingerprint(evaluation){
    const simple={
      id:evaluation.id,completedAt:evaluation.completedAt,counterparty:evaluation.counterparty,
      supplied:{money:evaluation.supplied.money,items:evaluation.supplied.items.map(x=>({itemId:x.itemId,uid:x.uid,quantity:x.quantity})),other:evaluation.supplied.other},
      received:{money:evaluation.received.money,items:evaluation.received.items.map(x=>({itemId:x.itemId,uid:x.uid,quantity:x.quantity})),other:evaluation.received.other}
    };
    return JSON.stringify(simple);
  }

  function buildCompletedRecord(evaluation,at=Date.now()){
    if(!evaluation?.recordable)throw new Error('Only an API-confirmed completed trade can be recorded.');
    const effects=[];
    for(const row of evaluation.supplied.items)effects.push({direction:'OUT',itemId:row.itemId,itemName:row.itemName,uid:row.uid,quantity:row.quantity});
    for(const row of evaluation.received.items)effects.push({direction:'IN',itemId:row.itemId,itemName:row.itemName,uid:row.uid,quantity:row.quantity});
    return {
      schema:1,id:String(evaluation.id),status:'COMPLETED',completedAt:evaluation.completedAt,completedAtIso:iso(evaluation.completedAt),
      description:evaluation.description,counterparty:clone(evaluation.counterparty),
      supplied:{money:evaluation.supplied.money,items:clone(evaluation.supplied.items),other:clone(evaluation.supplied.other)},
      received:{money:evaluation.received.money,items:clone(evaluation.received.items),other:clone(evaluation.received.other)},
      valuation:clone(evaluation.valuation),inventoryEffects:effects,
      evidence:{source:'Torn API v2 detailed trade',apiTradeId:String(evaluation.id),completedAt:evaluation.completedAt,fetchedAt:Number(at),confidence:'TRUSTED_COMPLETION'},
      fingerprint:tradeFingerprint(evaluation),recordedAt:Number(at)
    };
  }

  function pruneObjectByTimestamp(obj,limit,timestampField){
    const entries=Object.entries(obj||{}).sort((a,b)=>n(b[1]?.[timestampField])-n(a[1]?.[timestampField]));
    return Object.fromEntries(entries.slice(0,Math.max(1,Math.round(n(limit)||1))));
  }

  function recordCompletedTrades(slice,records=[],at=Date.now()){
    ensureTradeSlice(slice);
    const tm=slice.operations.tradeManager;
    const recon=slice.operations.inventoryRoi.tradeReconciliation;
    let inserted=0,duplicates=0,conflicts=0,reconciliations=0;
    for(const record of Array.isArray(records)?records:[]){
      if(!record||record.status!=='COMPLETED'||!(n(record.completedAt)>0))continue;
      const id=asId(record.id);
      if(!/^\d+$/.test(id))continue;
      const existing=tm.trades[id];
      if(existing){
        if(String(existing.fingerprint||'')===String(record.fingerprint||'')){duplicates++;continue;}
        conflicts++;
        tm.conflicts.unshift({tradeId:id,existingFingerprint:String(existing.fingerprint||''),incomingFingerprint:String(record.fingerprint||''),detectedAt:Number(at)});
        tm.conflicts=tm.conflicts.slice(0,50);
        continue;
      }
      tm.trades[id]=clone(record);inserted++;
      const effects=Array.isArray(record.inventoryEffects)?record.inventoryEffects:[];
      recon[id]={schema:1,tradeId:id,completedAt:n(record.completedAt),status:'PENDING',effects:clone(effects),source:'MM Trade Manager',evidence:clone(record.evidence),publishedAt:Number(at)};
      reconciliations++;
    }
    tm.trades=pruneObjectByTimestamp(tm.trades,MAX_TRADE_HISTORY,'completedAt');
    slice.operations.inventoryRoi.tradeReconciliation=pruneObjectByTimestamp(recon,MAX_RECONCILIATIONS,'completedAt');
    tm.lastSyncAt=new Date(Number(at)).toISOString();
    tm.lastSyncResult={inserted,duplicates,conflicts,reconciliations,checked:Array.isArray(records)?records.length:0};
    return {slice,inserted,duplicates,conflicts,reconciliations,checked:Array.isArray(records)?records.length:0};
  }

  function historyRows(state){
    const trades=state?.operations?.tradeManager?.trades||{};
    return Object.values(trades).sort((a,b)=>n(b?.completedAt)-n(a?.completedAt));
  }

  const api=Object.freeze({
    MAX_TRADE_HISTORY,MAX_RECONCILIATIONS,
    ensureTradeSlice,itemName,marketEvidence,tradeStatus,normalizeTrade,currentFifoCost,evaluateTrade,
    tradeFingerprint,buildCompletedRecord,recordCompletedTrades,historyRows
  });

  Object.defineProperty(globalThis,'MMTornTradeManagerLogic',{value:api,configurable:true,enumerable:false,writable:false});
})();