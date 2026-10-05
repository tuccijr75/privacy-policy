(() => {
  'use strict';

  const DAY=86400000;
  const BB_BASE=Object.freeze({
    'pistol':4,
    'smg':4,
    'clubbing':6,
    'club':6,
    'piercing':6,
    'slashing':6,
    'shotgun':10,
    'rifle':10,
    'machine gun':14,
    'machinegun':14,
    'heavy artillery':14,
    'heavyartillery':14
  });

  const num=value=>{
    const n=Number(value||0);
    return Number.isFinite(n)?n:0;
  };
  const text=value=>String(value??'').trim();
  const lower=value=>text(value).toLowerCase();

  function normalizeBonuses(value){
    let rows=value;
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>({
      title:text(row?.title??row?.bonus??row?.name),
      value:num(row?.value??row?.percentage??row?.percent),
      description:text(row?.description)
    })).filter(row=>row.title);
  }

  function bonusSignature(value,{band=5,includeValues=true}={}){
    const size=Math.max(1,num(band)||5);
    return normalizeBonuses(value)
      .map(row=>{
        const title=lower(row.title);
        const bucket=Math.floor(Math.max(0,row.value)/size)*size;
        return includeValues?title+'@'+bucket:title;
      })
      .sort()
      .join('|');
  }

  function normalizeRarity(value){
    const r=lower(value);
    return r==='yellow'||r==='orange'||r==='red'?r:'';
  }

  function bunkerBuckUnits({subType='',rarity='',bonuses=[]}={}){
    const key=lower(subType).replace(/\s+/g,' ');
    const compact=key.replace(/\s+/g,'');
    const base=BB_BASE[key]||BB_BASE[compact]||0;
    const r=normalizeRarity(rarity);
    if(!(base>0)||!r)return 0;
    const rarityFactor=r==='yellow'?1:r==='orange'?3:9;
    const effectFactor=normalizeBonuses(bonuses).length>=2?1.5:1;
    return Math.round(base*rarityFactor*effectFactor);
  }

  function quantile(values,q){
    const rows=(values||[]).map(num).filter(x=>x>0).sort((a,b)=>a-b);
    if(!rows.length)return 0;
    if(rows.length===1)return rows[0];
    const p=Math.max(0,Math.min(1,num(q)));
    const idx=(rows.length-1)*p;
    const lo=Math.floor(idx),hi=Math.ceil(idx);
    if(lo===hi)return rows[lo];
    return rows[lo]+(rows[hi]-rows[lo])*(idx-lo);
  }

  function robustPrices(values){
    const rows=(values||[]).map(num).filter(x=>x>0).sort((a,b)=>a-b);
    if(rows.length<4)return rows;
    const q1=quantile(rows,.25),q3=quantile(rows,.75),iqr=Math.max(0,q3-q1);
    if(!(iqr>0))return rows;
    const lo=Math.max(0,q1-1.5*iqr),hi=q3+1.5*iqr;
    const filtered=rows.filter(x=>x>=lo&&x<=hi);
    return filtered.length>=Math.max(3,Math.floor(rows.length*.5))?filtered:rows;
  }

  function normalizedHistoryRow(row){
    const item=row?.item&&typeof row.item==='object'?row.item:{};
    const details=item?.details&&typeof item.details==='object'?item.details:
      (row?.itemDetails&&typeof row.itemDetails==='object'?row.itemDetails:{});
    const stats=details?.stats&&typeof details.stats==='object'?details.stats:
      (row?.stats&&typeof row.stats==='object'?row.stats:{});
    return {
      id:text(row?.id??row?.auctionId??row?.auction_id),
      timestamp:num(row?.timestamp??row?.endedAt??row?.ended_at),
      price:num(row?.price??row?.finalPrice??row?.final_price),
      bids:num(row?.bids),
      itemId:text(item?.id??row?.itemId??row?.item_id),
      itemName:text(item?.name??row?.itemName??row?.item_name),
      weaponType:text(row?.weaponType??row?.weapon_type??item?.details?.category??item?.category),
      subType:text(item?.sub_type??item?.subType??row?.subType??row?.sub_type),
      rarity:normalizeRarity(details?.rarity??row?.rarity),
      uid:text(details?.uid??row?.uid),
      damage:num(stats?.damage??row?.damage),
      accuracy:num(stats?.accuracy??row?.accuracy),
      quality:num(stats?.quality??row?.quality),
      bonuses:normalizeBonuses(details?.bonuses??row?.bonuses),
      source:text(row?.source),
      lastUpdated:text(row?.lastUpdated??row?.last_updated??row?.lastUpdatedUnix),
      endsAt:num(row?.endsAt??row?.endsAtUnix??row?.ends_at),
      sellerId:text(row?.sellerId??row?.playerId??row?.player_id),
      sellerName:text(row?.sellerName??row?.playerName??row?.player_name),
      quantity:Math.max(1,num(row?.quantity)||1),
      url:text(row?.url??row?.listingUrl)
    };
  }

  function comparableHistory(history,candidate,settings={}){
    const c=normalizedHistoryRow(candidate);
    const days=Math.max(7,num(settings.historyDays)||90);
    const now=num(settings.now)||Date.now();
    const cutoff=now-days*DAY;
    const base=(history||[]).map(normalizedHistoryRow)
      .filter(row=>row.price>0&&row.itemId===c.itemId&&(!row.timestamp||row.timestamp*1000>=cutoff));
    const rarity=base.filter(row=>!c.rarity||row.rarity===c.rarity);
    const exactTitle=bonusSignature(c.bonuses,{includeValues:false});
    const exactBand=bonusSignature(c.bonuses,{band:settings.bonusBand||5,includeValues:true});
    const sameTitles=rarity.filter(row=>bonusSignature(row.bonuses,{includeValues:false})===exactTitle);
    const sameBands=sameTitles.filter(row=>bonusSignature(row.bonuses,{band:settings.bonusBand||5,includeValues:true})===exactBand);
    const min=Math.max(1,Math.round(num(settings.minComparableSales)||3));
    if(sameBands.length>=min)return {tier:'BONUS ROLL',specificity:1,rows:sameBands};
    if(sameTitles.length>=min)return {tier:'BONUS',specificity:.82,rows:sameTitles};
    if(rarity.length>=min)return {tier:'RARITY',specificity:.62,rows:rarity};
    return {tier:'BASE',specificity:.42,rows:base};
  }

  function salesVolume(history,candidate,now=Date.now()){
    const c=normalizedHistoryRow(candidate);
    const rows=(history||[]).map(normalizedHistoryRow).filter(row=>row.itemId===c.itemId&&row.timestamp>0);
    const count=days=>rows.filter(row=>now-row.timestamp*1000<=days*DAY).length;
    return {d7:count(7),d30:count(30),d90:count(90),total:rows.length};
  }

  function historyValuation(history,candidate,settings={}){
    const now=num(settings.now)||Date.now();
    const cohort=comparableHistory(history,candidate,{...settings,now});
    const filtered=robustPrices(cohort.rows.map(row=>row.price));
    const median=quantile(filtered,.5),p25=quantile(filtered,.25),p75=quantile(filtered,.75);
    const times=cohort.rows.map(row=>row.timestamp).filter(x=>x>0).sort((a,b)=>b-a);
    const newest=times[0]?times[0]*1000:0;
    const recency=newest?Math.max(0,Math.min(1,1-(now-newest)/(90*DAY))):0;
    const sample=Math.min(1,filtered.length/12);
    const confidence=filtered.length
      ?Math.round(100*Math.max(0,Math.min(1,cohort.specificity*.55+sample*.30+recency*.15)))
      :0;
    const recent=cohort.rows.filter(row=>row.timestamp>0&&now-row.timestamp*1000<=30*DAY).map(row=>row.price);
    const older=cohort.rows.filter(row=>row.timestamp>0&&now-row.timestamp*1000>30*DAY&&now-row.timestamp*1000<=90*DAY).map(row=>row.price);
    const recentMedian=quantile(robustPrices(recent),.5);
    const olderMedian=quantile(robustPrices(older),.5);
    const trendPct=olderMedian>0&&recentMedian>0?(recentMedian-olderMedian)/olderMedian*100:0;
    return {
      cohort:cohort.tier,samples:filtered.length,median,p25,p75,confidence,trendPct,
      newestAt:newest?new Date(newest).toISOString():''
    };
  }

  function evaluateListing(listing,history,settings={}){
    const row=normalizedHistoryRow(listing);
    const ask=num(listing?.price??row.price);
    const bbRate=Math.max(0,num(settings.bbRate));
    const units=bunkerBuckUnits(row);
    const bbFloor=units*bbRate;
    const historyValue=historyValuation(history,row,settings);
    const auctionValue=historyValue.median;
    const fairValue=Math.max(bbFloor,auctionValue);
    const profit=fairValue>0&&ask>0?fairValue-ask:0;
    const roiPct=ask>0?profit/ask*100:0;
    const volume=salesVolume(history,row,num(settings.now)||Date.now());
    const auctionHistoryLiquidityScore=Math.round(Math.max(0,Math.min(100,
      Math.log1p(volume.d30)*24+Math.log1p(volume.d90)*12
    )));
    const marginScore=fairValue>0?Math.max(0,Math.min(100,profit/fairValue*100)):0;
    const roiScore=Math.max(0,Math.min(100,roiPct));
    const confidence=historyValue.confidence;
    const now=num(settings.now)||Date.now();
    const pulse=settings?.pulseByItem?.[String(row.itemId)]||null;
    const pulseFetchedAt=Math.max(0,num(pulse?.fetchedAt));
    const pulseAgeMs=pulseFetchedAt?Math.max(0,now-pulseFetchedAt):Infinity;
    const pulseTtlMs=Math.max(10*60*1000,num(settings.pulseTtlMs)||45*60*1000);
    const pulseConfidencePct=Math.max(0,Math.min(100,num(pulse?.confidencePct)));
    const pulseUsable=Boolean(pulse&&pulseAgeMs<=pulseTtlMs&&pulseConfidencePct>=30);
    const pulseLiquidityScore=pulseUsable?Math.max(0,Math.min(100,num(pulse?.liquidityScore))):0;
    const observedEventsPerHour=pulseUsable?Math.max(0,num(pulse?.observedEventsPerHour)):0;
    const observedUnitsPerHour=pulseUsable?Math.max(0,num(pulse?.observedUnitsPerHour)):0;
    const turnoverPerHour=pulseUsable?Math.max(0,num(pulse?.turnoverPerHour)):0;
    const profitVelocityPerHour=pulseUsable?Math.max(0,profit)*observedUnitsPerHour:0;
    const pulseVelocityScore=pulseUsable?Math.max(0,Math.min(100,(Math.log10(1+profitVelocityPerHour)-4)*22)):0;
    const liquidity=Math.round(pulseUsable
      ?Math.max(0,Math.min(100,auctionHistoryLiquidityScore*.58+pulseLiquidityScore*.42))
      :auctionHistoryLiquidityScore);
    const isAuction=lower(row.source)==='auction';
    const investmentScore=Math.round(Math.max(0,Math.min(100,
      pulseUsable
        ?roiScore*.34+liquidity*.27+confidence*.17+marginScore*.08+pulseVelocityScore*.14
        :roiScore*.40+liquidity*.30+confidence*.20+marginScore*.10
    )));
    const endMs=Math.max(0,num(row.endsAt))*1000;
    const hoursRemaining=endMs>now?(endMs-now)/3600000:0;
    const auctionUrgencyScore=isAuction&&endMs>now
      ?Math.round(Math.max(0,Math.min(100,(1-Math.min(1,hoursRemaining/24))*100)))
      :0;
    const auctionDiscountScore=isAuction&&fairValue>0&&ask>0
      ?Math.round(Math.max(0,Math.min(100,(1-ask/fairValue)*100)))
      :0;
    const auctionWatchScore=isAuction
      ?Math.round(Math.max(0,Math.min(100,
        confidence*.35+liquidity*.25+auctionUrgencyScore*.25+auctionDiscountScore*.15
      )))
      :0;
    const sortScore=isAuction?auctionWatchScore:investmentScore;
    const bonuses=normalizeBonuses(row.bonuses);
    const lowTier=(settings.lowTierBonuses||['Achilles','Conserve'])
      .map(lower).some(title=>bonuses.some(b=>lower(b.title)===title));
    const valuationSource=bbFloor>0&&auctionValue>0
      ?(bbFloor>=auctionValue?'BB FLOOR + AH':'AH + BB FLOOR')
      :bbFloor>0?'BB FLOOR':auctionValue>0?'AH HISTORY':'NO VALUE';
    return {
      ...row,price:ask,bbUnits:units,bbRate,bbFloor,auctionValue,fairValue,profit,roiPct,
      volume7:volume.d7,volume30:volume.d30,volume90:volume.d90,
      liquidityScore:liquidity,auctionHistoryLiquidityScore,investmentScore,auctionWatchScore,auctionUrgencyScore,auctionDiscountScore,
      pulseTier:pulseUsable?String(pulse?.tier||'observed'):'unknown',
      pulseLiquidityScore,pulseConfidencePct:pulseUsable?pulseConfidencePct:0,
      observedEventsPerHour,observedUnitsPerHour,turnoverPerHour,profitVelocityPerHour,
      pulseMarketDepth:pulseUsable?Math.max(0,num(pulse?.marketDepth)):0,
      pulseTrendPct:pulseUsable?num(pulse?.trendPct):0,
      pulseFreshness:pulseUsable?(pulseAgeMs<=60_000?'FRESH':pulseAgeMs<=5*60_000?'GOOD':'AGING'):'UNKNOWN',
      hoursRemaining,sortScore,isAuction,lowTier,valuationSource,
      history:historyValue
    };
  }

  function rankListings(listings,history,settings={}){
    const minRoi=num(settings.minRoiPct);
    const minConfidence=Math.max(0,num(settings.minConfidencePct));
    return (listings||[])
      .map(row=>evaluateListing(row,history,settings))
      .filter(row=>row.price>0&&row.fairValue>0&&row.roiPct>=minRoi&&row.history.confidence>=minConfidence)
      .sort((a,b)=>b.sortScore-a.sortScore||b.history.confidence-a.history.confidence||b.liquidityScore-a.liquidityScore||b.roiPct-a.roiPct||b.profit-a.profit);
  }

  Object.defineProperty(globalThis,'MMTornRankedProfitLogic',{
    value:Object.freeze({
      normalizeBonuses,bonusSignature,normalizeRarity,bunkerBuckUnits,quantile,robustPrices,
      normalizedHistoryRow,comparableHistory,salesVolume,historyValuation,evaluateListing,rankListings
    }),
    configurable:true,enumerable:false,writable:false
  });
})();