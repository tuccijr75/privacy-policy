(() => {
  'use strict';

  const API_BASE = 'https://api.torn.com/v2';
  const WEAV_BASE = 'https://weav3r.dev/api';
  const ITEM_MARKET_FEE_RATE = 0.05;
  const ITEM_MARKET_RECENT_REUSE_MS = 2500;
  const MARKET_HISTORY_MAX = 240;
  const INTEL_HISTORY_MAX = 120;
  const VERIFY_MAX_AGE_SEC = 120;
  const VERIFY_SELLERS = 4;
  const marketPulse = globalThis.MMTornMarketPulse;

  const asId = value => String(value ?? '').trim();
  const nowIso = () => new Date().toISOString();

  function unixToMs(value) {
    const n = Number(value || 0);
    if (!(n > 0)) return 0;
    return n > 1e12 ? n : n * 1000;
  }

  function normalizeMarketplaceItem(row) {
    return {
      itemId:asId(row?.item_id),
      itemName:String(row?.item_name || ('Item ' + (row?.item_id || ''))),
      marketPrice:Number(row?.market_price || 0),
      bazaarAverage:Number(row?.bazaar_average || 0),
      lowestPrice:Number(row?.lowest_price || 0),
      totalBazaars:Number(row?.total_bazaars || 0),
      lowestSource:Number(row?.lowest_price || 0)>0?'Bazaar':'Unknown',
      bazaarSource:'TornW3B Bazaar observations'
    };
  }

  function normalizeListing(row) {
    return {
      itemId:asId(row?.item_id),
      uid:row?.uid == null ? null : String(row.uid),
      sellerId:asId(row?.player_id),
      sellerName:String(row?.player_name || ''),
      quantity:Math.max(0,Number(row?.quantity || 0)),
      price:Math.max(0,Number(row?.price || 0)),
      contentUpdated:unixToMs(row?.content_updated),
      lastChecked:unixToMs(row?.last_checked),
      sponsored:Number(row?.sponsored || 0) === 1
    };
  }

  function normalizeTrader(row) {
    const rating = row?.rating || {};
    return {
      traderId:asId(row?.player_id),
      traderName:String(row?.player_name || ''),
      price:Math.max(0,Number(row?.price || 0)),
      upvotes:Number(rating.upvotes || 0),
      downvotes:Number(rating.downvotes || 0),
      ratingTotal:Number(rating.total || 0),
      pricelistId:Number(row?.pricelist_id || 0),
      lastTrade:unixToMs(row?.last_trade),
      lastAction:unixToMs(row?.last_action),
      pricelistUpdated:unixToMs(row?.pricelist_updated),
      sponsored:Number(row?.sponsored || 0) === 1
    };
  }

  function genericMarketListings(data) {
    let rows = data?.itemmarket?.listings ?? data?.itemmarket ?? data?.listings ?? [];
    if (!Array.isArray(rows) && rows && typeof rows === 'object') rows = Object.values(rows);
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const item = row?.item && typeof row.item === 'object' ? row.item : {};
      const price = Number(row?.price ?? row?.cost ?? row?.listing_price ?? item.price ?? 0) || 0;
      const quantity = Number(row?.quantity ?? row?.amount ?? row?.qty ?? item.quantity ?? 1) || 1;
      return {price,quantity:Math.max(1,quantity)};
    }).filter(row=>row.price>0).sort((a,b)=>a.price-b.price);
  }

  function normalizeCatalogShop(row) {
    if (typeof row === 'string') return {name:row,price:0,country:'',quantity:0};
    const r=row&&typeof row==='object'?row:{};
    return {
      name:String(r.name ?? r.shop_name ?? r.shop ?? r.location ?? r.city ?? r.country ?? 'Shop'),
      price:Math.max(0,Number(r.price ?? r.cost ?? r.buy_price ?? r.unit_price ?? 0)||0),
      country:String(r.country ?? r.location_country ?? ''),
      quantity:Math.max(0,Number(r.quantity ?? r.stock ?? r.in_stock ?? 0)||0)
    };
  }

  function normalizeTornCatalog(data) {
    let rows=data?.items ?? data?.torn?.items ?? [];
    if(!Array.isArray(rows)&&rows&&typeof rows==='object'){
      rows=Object.entries(rows).map(([id,row])=>({id:row?.id??id,...(row&&typeof row==='object'?row:{})}));
    }
    if(!Array.isArray(rows))return [];
    return rows.map(row=>{
      const value=row?.value&&typeof row.value==='object'?row.value:{};
      const details=row?.details&&typeof row.details==='object'?row.details:{};
      const baseStats=details?.stats&&typeof details.stats==='object'?details.stats:{};
      let shopRows=value.shops ?? row?.shops ?? [];
      if(!Array.isArray(shopRows)&&shopRows&&typeof shopRows==='object')shopRows=Object.values(shopRows);
      const shops=(Array.isArray(shopRows)?shopRows:[]).map(normalizeCatalogShop);
      const marketPrice=Math.max(0,Number(value.market_price ?? row?.market_price ?? 0)||0);
      const buyPrice=Math.max(0,Number(value.buy_price ?? row?.buy_price ?? 0)||0);
      const sellPrice=Math.max(0,Number(value.sell_price ?? row?.sell_price ?? 0)||0);
      const id=asId(row?.id ?? row?.item_id);
      const name=String(row?.name ?? row?.item_name ?? '').trim();
      return {
        id,name,
        type:String(row?.type ?? row?.category ?? 'Other').trim()||'Other',
        subType:String(row?.sub_type ?? row?.subtype ?? '').trim(),
        weaponCategory:String(details?.category ?? row?.weapon_category ?? '').trim(),
        baseStats:{
          damage:Math.max(0,Number(baseStats?.damage||0)||0),
          accuracy:Math.max(0,Number(baseStats?.accuracy||0)||0),
          armor:Math.max(0,Number(baseStats?.armor||0)||0)
        },
        image:String(row?.image ?? ''),
        marketPrice,buyPrice,sellPrice,
        circulation:Math.max(0,Number(row?.circulation ?? 0)||0),
        isTradable:row?.is_tradable!==false&&row?.tradable!==false,
        shops,
        buyable:Boolean(marketPrice>0||buyPrice>0||shops.some(shop=>Number(shop.price||0)>0))
      };
    }).filter(row=>/^\d+$/.test(row.id)&&row.name);
  }

  function normalizePricelistRows(data) {
    const rows=Array.isArray(data)?data:(Array.isArray(data?.items)?data.items:[]);
    return rows.map(row=>({
      itemId:asId(row?.itemId??row?.itemID??row?.item_id),
      name:String(row?.name??row?.itemName??'').trim(),
      buyPrice:Math.max(0,Number(row?.buyPrice??row?.price??0)||0),
      bulkThreshold:Math.max(0,Number(row?.bulkThreshold??0)||0),
      bulkBuyPrice:Math.max(0,Number(row?.bulkBuyPrice??0)||0)
    })).filter(row=>row.itemId&&row.name);
  }

  function normalizeRankedBonuses(value) {
    let rows=value;
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>({
      title:String(row?.title??row?.bonus??row?.name??'').trim(),
      value:Number(row?.value??row?.percentage??row?.percent??0)||0,
      description:String(row?.description??'')
    })).filter(row=>row.title);
  }

  function canonicalRankedSource(value) {
    const raw=String(value||'').trim().toLowerCase();
    if(raw==='bazaar')return 'Bazaar';
    if(raw==='market'||raw==='item market'||raw==='item-market'||raw==='item_market')return 'Item Market';
    if(raw==='auction'||raw==='auction house'||raw==='auction-house')return 'Auction';
    return String(value||'Market').trim()||'Market';
  }

  function normalizeRankedListing(row,{source='',itemId='',itemName='',subType='',weaponCategory=''}={}) {
    const item=row?.item&&typeof row.item==='object'?row.item:{};
    const details=row?.item_details&&typeof row.item_details==='object'?row.item_details:
      (item?.details&&typeof item.details==='object'?item.details:{});
    const stats=details?.stats&&typeof details.stats==='object'?details.stats:
      (row?.stats&&typeof row.stats==='object'?row.stats:{});
    const seller=row?.seller&&typeof row.seller==='object'?row.seller:{};
    return {
      uid:asId(row?.uid??details?.uid),
      itemId:asId(row?.itemId??row?.item_id??item?.id??itemId),
      itemName:String(row?.itemName??row?.item_name??item?.name??itemName??'').trim(),
      weaponType:String(row?.weaponType??row?.weapon_type??details?.category??weaponCategory??'').trim(),
      subType:String(row?.subType??row?.sub_type??item?.sub_type??subType??'').trim(),
      rarity:String(row?.rarity??details?.rarity??'').trim().toLowerCase(),
      damage:Number(row?.damage??stats?.damage??0)||0,
      accuracy:Number(row?.accuracy??stats?.accuracy??0)||0,
      quality:Number(row?.quality??stats?.quality??0)||0,
      bonuses:normalizeRankedBonuses(row?.bonuses??details?.bonuses),
      price:Math.max(0,Number(row?.price??row?.cost??row?.listing_price??0)||0),
      quantity:Math.max(1,Number(row?.quantity??row?.amount??1)||1),
      sellerId:asId(row?.playerId??row?.player_id??seller?.id??seller?.user_id),
      sellerName:String(row?.playerName??row?.player_name??seller?.name??''),
      source:canonicalRankedSource(row?.source??source??''),
      lastUpdated:String(row?.lastUpdated??row?.lastUpdatedUnix??row?.last_updated??''),
      endsAt:Number(row?.endsAtUnix??row?.ends_at??0)||0,
      bids:Math.max(0,Number(row?.bids??0)||0),
      url:String(row?.url??row?.listingUrl??'')
    };
  }

  function normalizeAuctionHistoryRows(data,{itemId='',itemName='',subType='',weaponCategory=''}={}) {
    let rows=data?.auctionhouse??data?.auction_house??data?.listings??data?.auctions??[];
    if(!Array.isArray(rows)&&rows&&typeof rows==='object')rows=Object.values(rows);
    if(!Array.isArray(rows))rows=[];
    return rows.map(row=>{
      const item=row?.item&&typeof row.item==='object'?row.item:{};
      const details=item?.details&&typeof item.details==='object'?item.details:{};
      const stats=details?.stats&&typeof details.stats==='object'?details.stats:{};
      return {
        id:asId(row?.id??row?.auction_id),
        timestamp:Number(row?.timestamp??row?.ended_at??0)||0,
        price:Math.max(0,Number(row?.price??row?.final_price??0)||0),
        bids:Math.max(0,Number(row?.bids??0)||0),
        itemId:asId(item?.id??row?.item_id??itemId),
        itemName:String(item?.name??row?.item_name??itemName??'').trim(),
        weaponType:String(details?.category??row?.weapon_type??weaponCategory??'').trim(),
        subType:String(item?.sub_type??row?.sub_type??subType??'').trim(),
        rarity:String(details?.rarity??row?.rarity??'').trim().toLowerCase(),
        uid:asId(details?.uid??row?.uid),
        damage:Number(stats?.damage??row?.damage??0)||0,
        accuracy:Number(stats?.accuracy??row?.accuracy??0)||0,
        quality:Number(stats?.quality??row?.quality??0)||0,
        bonuses:normalizeRankedBonuses(details?.bonuses??row?.bonuses)
      };
    }).filter(row=>row.price>0&&row.itemId);
  }

  function apiNextUrl(data) {
    const next=data?._metadata?.links?.next??data?.metadata?.links?.next??data?._metadata?.next??data?.pagination?.next??null;
    if(typeof next!=='string'||!next.trim())return '';
    try{return new URL(next,API_BASE+'/').toString();}catch{return '';}
  }

  function marketMetrics(rows) {
    if (!rows.length) return {lowest:0,third:0,median:0,totalQty:0,listings:0,depth1Pct:0,depth3Pct:0,depth5Pct:0};
    const prices = rows.map(r=>r.price);
    const lowest = prices[0];
    const quantityWithin = pct => rows.filter(r=>r.price<=lowest*(1+pct/100)).reduce((sum,r)=>sum+r.quantity,0);
    return {
      lowest,
      third:prices[Math.min(2,prices.length-1)],
      median:prices[Math.floor(prices.length/2)] || lowest,
      totalQty:rows.reduce((sum,r)=>sum+r.quantity,0),
      listings:rows.length,
      depth1Pct:quantityWithin(1),
      depth3Pct:quantityWithin(3),
      depth5Pct:quantityWithin(5)
    };
  }

  function listingAgeSeconds(listing, nowMs=Date.now()) {
    const best = Number(listing?.lastChecked || 0) || Number(listing?.contentUpdated || 0);
    return best > 0 ? Math.max(0,(nowMs-best)/1000) : Infinity;
  }

  function freshOrganicListings(state,itemId,nowMs=Date.now()) {
    const maxAge = Math.max(30,Number(state?.businessRules?.maxListingAgeSec || 180));
    return (state?.marketIntel?.details?.[asId(itemId)]?.organicListings || [])
      .filter(x=>!x?.sponsored && Number(x?.price||0)>0 && Number(x?.quantity||0)>0 && listingAgeSeconds(x,nowMs)<=maxAge)
      .slice().sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  }

  function bazaarSnapshotFreshness(timestamp,nowMs=Date.now()) {
    const raw=Number(timestamp||0);
    if (!(raw>0)) return {fresh:false,ageSeconds:Infinity,timestamp:0};
    const atMs=raw>1e12?raw:raw*1000;
    const ageSeconds=Math.max(0,(nowMs-atMs)/1000);
    return {fresh:ageSeconds<=VERIFY_MAX_AGE_SEC,ageSeconds,timestamp:raw};
  }

  function itemMarketPurchaseUrl(itemId,itemName='',itemType='') {
    const id=encodeURIComponent(asId(itemId));
    let url='https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID='+id+'&sortField=price&sortOrder=ASC';
    if (itemName) url+='&itemName='+encodeURIComponent(String(itemName));
    if (itemType) url+='&itemType='+encodeURIComponent(String(itemType));
    return url;
  }

  function parseTravelNumber(value) {
    const raw=String(value??'').trim().replaceAll(',','').replaceAll('$','').replaceAll('+','');
    if(!raw||raw==='—'||raw==='-')return 0;
    const m=raw.match(/(-?\d+(?:\.\d+)?)\s*([kmb])?/i);
    if(!m)return 0;
    const n=Number(m[1]);
    const mult=!m[2]?1:m[2].toLowerCase()==='k'?1e3:m[2].toLowerCase()==='m'?1e6:1e9;
    return Number.isFinite(n)?n*mult:0;
  }

  function parseTravelStockHtml(html) {
    if(typeof DOMParser==='undefined') throw new Error('DOMParser is unavailable.');
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    const table=[...doc.querySelectorAll('table')].find(t=>{
      const x=String(t.textContent||'').toLowerCase();
      return x.includes('country')&&x.includes('item')&&x.includes('stock')&&x.includes('profit');
    });
    if(!table)throw new Error('TornW3B Travel Stock table was not found.');
    let headers=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());
    if(!headers.length)headers=[...table.querySelectorAll('tr:first-child th')].map(x=>String(x.textContent||'').trim().toLowerCase());
    const find=tests=>headers.findIndex(h=>tests.some(re=>re.test(h)));
    const ci=find([/country/]),ii=find([/^item/,/item/]),si=find([/stock/]),hi=find([/profit.*hr/,/\$\/hr/,/per hour/]);
    const pi=headers.findIndex((h,i)=>/profit/.test(h)&&i!==hi);
    const co=find([/shop.*cost/,/^cost$/,/buy.*price/]),mi=find([/home.*market/,/market.*price/,/^market$/]);
    const out=[];
    for(const tr of [...table.querySelectorAll('tbody tr')]){
      const cells=[...tr.querySelectorAll('td')];
      if(cells.length<4)continue;
      const txt=i=>String(cells[i]?.textContent||'').replace(/\s+/g,' ').trim();
      const country=txt(ci>=0?ci:0),itemName=txt(ii>=0?ii:1);
      if(!country||!itemName)continue;
      const href=cells[ii>=0?ii:1]?.querySelector('a[href]')?.getAttribute('href')||'';
      const idm=href.match(/(?:item(?:s)?[\/=]|item_id=)(\d+)/i);
      out.push({
        country,itemId:idm?idm[1]:'',itemName,
        stock:Math.max(0,Math.round(parseTravelNumber(txt(si>=0?si:2)))),
        profit:parseTravelNumber(txt(pi>=0?pi:3)),
        sourceProfitPerHour:parseTravelNumber(txt(hi>=0?hi:4)),
        shopCost:co>=0?Math.max(0,parseTravelNumber(txt(co))):0,
        homeMarket:mi>=0?Math.max(0,parseTravelNumber(txt(mi))):0
      });
    }
    if(!out.length)throw new Error('TornW3B Travel Stock returned no readable item rows.');
    return out;
  }

  function travelHistoryKey(row) {
    return String(row?.country||'')+'|'+(asId(row?.itemId)||String(row?.itemName||'').trim().toLowerCase());
  }

  function recordTravelSnapshots(travel,rows,observedAt=Date.now()) {
    travel.history=travel.history&&typeof travel.history==='object'?travel.history:{};
    travel.settings=travel.settings&&typeof travel.settings==='object'?travel.settings:{};
    const retentionMs=Math.max(1,Number(travel.settings.historyDays||7))*86400000;
    const cutoff=Date.now()-retentionMs;
    for(const row of rows||[]){
      const key=travelHistoryKey(row);
      if(!key)continue;
      const list=Array.isArray(travel.history[key])?travel.history[key].slice():[];
      const at=Number(row?.observedAt||observedAt)||Date.now();
      const point={
        at,stock:Number(row?.stock||0),profit:Number(row?.profit||0),
        sourceProfitPerHour:Number(row?.sourceProfitPerHour||0),
        shopCost:Number(row?.shopCost||0),homeMarket:Number(row?.homeMarket||0),
        source:String(row?.source||'TornW3B Travel Stock')
      };
      const sorted=list.slice().sort((a,b)=>Number(a.at||0)-Number(b.at||0));
      const last=sorted.length?sorted[sorted.length-1]:null;
      if(!last||Number(last.stock)!==point.stock||at-Number(last.at||0)>=300000) list.push(point);
      travel.history[key]=list
        .filter(x=>Number(x?.at||0)>=cutoff)
        .sort((a,b)=>Number(a.at||0)-Number(b.at||0))
        .slice(-800);
    }
  }

  function pushIntelHistory(intel,row) {
    const id=asId(row?.itemId);
    if (!id) return;
    if (!Array.isArray(intel.history?.[id])) {
      intel.history = intel.history && typeof intel.history === 'object' ? intel.history : {};
      intel.history[id]=[];
    }
    intel.history[id].push({
      at:nowIso(),
      lowestPrice:Number(row.lowestPrice||0),
      bazaarAverage:Number(row.bazaarAverage||0),
      marketPrice:Number(row.marketPrice||0),
      totalBazaars:Number(row.totalBazaars||0)
    });
    intel.history[id]=intel.history[id].slice(-INTEL_HISTORY_MAX);
  }

  function pushMarketHistory(proc,itemId,snapshot) {
    const id=asId(itemId);
    proc.marketHistory = proc.marketHistory && typeof proc.marketHistory === 'object' ? proc.marketHistory : {};
    if (!Array.isArray(proc.marketHistory[id])) proc.marketHistory[id]=[];
    proc.marketHistory[id].push({
      at:snapshot.fetchedAt,
      itemMarketLowest:snapshot.itemMarket.lowest,
      itemMarketThird:snapshot.itemMarket.third,
      bazaarLowest:snapshot.bazaar.lowest,
      bazaarThird:snapshot.bazaar.third,
      realisticExit:snapshot.realisticExit,
      depth3Pct:snapshot.totalDepth3Pct,
      itemMarketTotalQty:Number(snapshot.itemMarket?.totalQty||0),
      bazaarTotalQty:Number(snapshot.bazaar?.totalQty||0),
      itemMarketListings:Number(snapshot.itemMarket?.listings||0),
      bazaarListings:Number(snapshot.bazaar?.listings||0)
    });
    proc.marketHistory[id]=proc.marketHistory[id].slice(-MARKET_HISTORY_MAX);
  }

  async function mapLimit(items,limit,fn) {
    const queue=items.slice();
    const out=[];
    const workers=Array.from({length:Math.max(1,Math.min(limit,queue.length||1))},async()=>{
      while(queue.length){
        const item=queue.shift();
        try { out.push({item,status:'fulfilled',value:await fn(item)}); }
        catch(error){ out.push({item,status:'rejected',reason:error}); }
      }
    });
    await Promise.all(workers);
    return out;
  }

  function createService(deps={}) {
    const core=deps.core || globalThis.MMTornCore;
    const logic=deps.logic || globalThis.MMTornAcquisitionsLogic;
    if (!core || !logic) throw new Error('MM Torn Core and Market logic are required.');
    if (typeof deps.weavRequest !== 'function') throw new Error('weavRequest dependency is required.');
    if (typeof deps.tornRequest !== 'function') throw new Error('tornRequest dependency is required.');
    if (typeof deps.bazaarRequest !== 'function') throw new Error('bazaarRequest dependency is required.');
    const hasTornKey=typeof deps.hasTornKey === 'function' ? deps.hasTornKey : ()=>true;
    const navigate=typeof deps.navigate === 'function' ? deps.navigate : url=>{ location.href=url; };

    async function refreshPricelist(userId='4054377') {
      const id=asId(userId);
      if(!/^\d+$/.test(id))throw new Error('Invalid TornW3B pricelist user ID.');
      const data=await deps.weavRequest('/pricelist/'+encodeURIComponent(id));
      const rows=normalizePricelistRows(data);
      if(!rows.length)throw new Error('TornW3B pricelist returned no readable rows.');
      const at=nowIso();
      const items={};
      let bbRate=0,priced=0;
      for(const row of rows){
        if(row.itemId==='-3'){bbRate=row.buyPrice;continue;}
        if(!/^\d+$/.test(row.itemId)||!(row.buyPrice>0))continue;
        items[row.itemId]=row;
        priced++;
      }
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        proc.pricelist={userId:id,items,bunkerBuckRate:bbRate,pricedCount:priced,lastSyncAt:at,source:'TornW3B Pricelist API'};
        return draft;
      });
      return {state:await core.readLegacyState(),rows,priced,bbRate};
    }

    async function refreshRankedLive({pagesPerType=2,auctionPages=4,limit=100}={}) {
      const types=['primary','secondary','melee'];
      const market=[];
      for(const weaponType of types){
        for(let page=1;page<=Math.max(1,Number(pagesPerType)||1);page++){
          const data=await deps.weavRequest('/ranked-weapons',{
            tab:'weapons',weaponType,sortField:'price',sortOrder:'asc',page,limit:Math.min(100,Math.max(1,Number(limit)||100))
          });
          const rows=Array.isArray(data?.weapons)?data.weapons:[];
          market.push(...rows.map(row=>normalizeRankedListing(row,{source:row?.source||'market'})));
          if(rows.length<limit)break;
        }
      }
      const auction=[];
      for(let page=1;page<=Math.max(1,Number(auctionPages)||1);page++){
        const data=await deps.weavRequest('/auction/listings',{
          tab:'weapons',source:'auction',sortField:'endsAt',sortOrder:'asc',page,limit:Math.min(100,Math.max(1,Number(limit)||100))
        });
        const rows=Array.isArray(data?.items)?data.items:[];
        auction.push(...rows.map(row=>normalizeRankedListing(row,{source:'Auction'})));
        if(!data?.hasMore||rows.length<limit)break;
      }
      const dedupe=rows=>[...new Map(rows.filter(row=>row.uid&&row.price>0).map(row=>[row.source+'|'+row.uid,row])).values()];
      const liveMarket=dedupe(market),liveAuction=dedupe(auction),at=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
        ranked.liveMarket=liveMarket;
        ranked.liveAuction=liveAuction;
        ranked.lastLiveAt=at;
        ranked.liveSource='TornW3B Bazaar + Item Market + Auction APIs';
        return draft;
      });
      return {state:await core.readLegacyState(),market:liveMarket,auction:liveAuction,at};
    }

    async function refreshRankedHistory(itemId,{days=90,maxPages=8}={}) {
      if(!hasTornKey())throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId);
      if(!/^\d+$/.test(id))throw new Error('Invalid ranked weapon item ID.');
      const before=await core.readLegacyState();
      const catalog=before?.procurement?.catalog?.[id]||{};
      const from=Math.floor((Date.now()-Math.max(7,Number(days)||90)*86400000)/1000);
      let url='/market/'+encodeURIComponent(id)+'/auctionhouse?limit=100&sort=DESC&from='+from;
      const history=[];
      const seen=new Set();
      for(let page=0;page<Math.max(1,Number(maxPages)||1)&&url;page++){
        const data=await deps.tornRequest(url);
        for(const row of normalizeAuctionHistoryRows(data,{
          itemId:id,itemName:catalog.name||'',subType:catalog.subType||'',weaponCategory:catalog.weaponCategory||''
        })){
          const key=row.id||[row.timestamp,row.uid,row.price].join('|');
          if(seen.has(key))continue;
          seen.add(key);history.push(row);
        }
        url=apiNextUrl(data);
      }
      history.sort((a,b)=>Number(b.timestamp||0)-Number(a.timestamp||0));
      const at=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const ranked=proc.ranked&&typeof proc.ranked==='object'?proc.ranked:(proc.ranked={});
        ranked.history=ranked.history&&typeof ranked.history==='object'?ranked.history:{};
        ranked.history[id]={itemId:id,itemName:String(catalog.name||('Item '+id)),rows:history.slice(0,800),lastSyncAt:at,days:Math.max(7,Number(days)||90),source:'Torn API finished Auction House'};
        ranked.lastHistoryAt=at;
        return draft;
      });
      return {state:await core.readLegacyState(),rows:history,at};
    }

    async function refreshItemCatalog() {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const data=await deps.tornRequest('/torn/items?cat=All&sort=ASC');
      const rows=normalizeTornCatalog(data);
      if(!rows.length)throw new Error('Torn item catalog returned no readable items.');
      const syncedAt=nowIso();
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        const previous=proc.catalog&&typeof proc.catalog==='object'?proc.catalog:{};
        const next={};
        for(const row of rows){
          next[row.id]={...(previous[row.id]||{}),...row,catalogUpdatedAt:syncedAt,catalogSource:'Torn API v2'};
        }
        proc.catalog=next;
        proc.catalogLastSyncAt=syncedAt;
        proc.catalogItemCount=rows.length;
        proc.catalogBuyableCount=rows.filter(row=>row.buyable).length;
        return draft;
      });
      return {state:await core.readLegacyState(),rows,syncedAt};
    }

    async function refreshGlobal() {
      const data=await deps.weavRequest('/marketplace');
      const generatedMs=unixToMs(data?.generated_at)||Date.now();
      const generatedIso=new Date(generatedMs).toISOString();
      let changed=false;
      await core.updateDomainState('market',draft=>{
        const intel=draft.marketIntel || (draft.marketIntel={});
        intel.marketplace = intel.marketplace && typeof intel.marketplace==='object' ? intel.marketplace : {};
        intel.history = intel.history && typeof intel.history==='object' ? intel.history : {};
        changed=String(intel.marketplaceGeneratedAt||'')!==generatedIso || !Object.keys(intel.marketplace).length;
        intel.lastWeavPollAt=nowIso();
        if (!changed) {
          intel.lastGlobalSyncAt=nowIso();
          return draft;
        }
        const next={};
        for (const raw of Array.isArray(data?.items)?data.items:[]) {
          const row=normalizeMarketplaceItem(raw);
          if (!row.itemId) continue;
          next[row.itemId]=row;
          pushIntelHistory(intel,row);
        }
        intel.marketplace=next;
        intel.marketplaceGeneratedAt=generatedIso;
        intel.lastGlobalSyncAt=nowIso();
        intel.lastWeavChangeAt=nowIso();
        return draft;
      });
      return {state:await core.readLegacyState(),changed,generatedAt:generatedIso};
    }

    async function enrichItem(itemId) {
      const id=asId(itemId);
      if (!/^\d+$/.test(id)) throw new Error('Invalid item ID.');
      const [detailResult,traderResult]=await Promise.allSettled([
        deps.weavRequest('/marketplace/'+encodeURIComponent(id),{limit:100}),
        deps.weavRequest('/marketplace/'+encodeURIComponent(id)+'/traders',{limit:100,sort:'price'})
      ]);

      await core.updateDomainState('market',draft=>{
        const intel=draft.marketIntel || (draft.marketIntel={});
        intel.details=intel.details&&typeof intel.details==='object'?intel.details:{};
        intel.traders=intel.traders&&typeof intel.traders==='object'?intel.traders:{};
        const base=intel.marketplace?.[id]||{};

        if (detailResult.status==='fulfilled') {
          const data=detailResult.value;
          const listings=(Array.isArray(data?.listings)?data.listings:[])
            .map(normalizeListing).filter(x=>x.price>0&&x.quantity>0).sort((a,b)=>a.price-b.price);
          intel.details[id]={
            itemId:id,
            itemName:String(data?.item_name||base.itemName||('Item '+id)),
            marketPrice:Number(data?.market_price||base.marketPrice||0),
            bazaarAverage:Number(data?.bazaar_average||base.bazaarAverage||0),
            generatedAt:new Date(unixToMs(data?.generated_at)||Date.now()).toISOString(),
            fetchedAt:nowIso(),
            listings,
            organicListings:listings.filter(x=>!x.sponsored)
          };
        }

        if (traderResult.status==='fulfilled') {
          const data=traderResult.value;
          const traders=(Array.isArray(data?.traders)?data.traders:[])
            .map(normalizeTrader).filter(x=>x.price>0).sort((a,b)=>b.price-a.price);
          intel.traders[id]={
            itemId:id,
            itemName:String(data?.item_name||base.itemName||('Item '+id)),
            totalCount:Number(data?.total_count||traders.length),
            generatedAt:new Date(unixToMs(data?.generated_at)||Date.now()).toISOString(),
            fetchedAt:nowIso(),
            traders,
            organicTraders:traders.filter(x=>!x.sponsored)
          };
        }
        return draft;
      });

      if (detailResult.status==='rejected' && traderResult.status==='rejected') {
        throw new Error('TornW3B detail and trader refresh both failed.');
      }
      return core.readLegacyState();
    }

    async function refreshItemMarket(itemId) {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId);
      if (!/^\d+$/.test(id)) throw new Error('Invalid item ID.');
      const data=await deps.tornRequest('/market/'+encodeURIComponent(id)+'/itemmarket?limit=25');
      const itemRows=genericMarketListings(data);
      const before=await core.readLegacyState();
      const pulseSnapshot=marketPulse?.normalizeTornItemMarket?.(
        id,
        String(before?.procurement?.catalog?.[id]?.name||before?.marketIntel?.marketplace?.[id]?.itemName||('Item '+id)),
        data,
        {fetchedAt:Date.now()}
      )||null;
      const aggregateBazaarLow=Math.max(0,Number(before?.marketIntel?.marketplace?.[id]?.lowestPrice||0));
      const bazaarRows=freshOrganicListings(before,id)
        .filter(row=>!(aggregateBazaarLow>0)||Number(row.price||0)<=aggregateBazaarLow*1.35)
        .slice(0,25).map(row=>({
          price:Number(row.price||0),quantity:Math.max(1,Number(row.quantity||1))
        }));
      if (!itemRows.length && !bazaarRows.length) throw new Error('No trusted live market listings returned.');
      const itemMarket=marketMetrics(itemRows);
      const bazaar=marketMetrics(bazaarRows);
      const realisticExit=bazaar.third||bazaar.lowest||Math.floor((itemMarket.third||itemMarket.lowest||0)*(1-ITEM_MARKET_FEE_RATE));
      const snapshot={
        itemId:id,itemMarket,bazaar,realisticExit,
        sources:{itemMarket:itemRows.length?'Torn API Item Market':null,bazaar:bazaarRows.length?'TornW3B fresh seller observations':null},
        totalDepth3Pct:Number(itemMarket.depth3Pct||0)+Number(bazaar.depth3Pct||0),
        pulseSnapshot,
        fetchedAt:nowIso()
      };
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        proc.marketSnapshots=proc.marketSnapshots&&typeof proc.marketSnapshots==='object'?proc.marketSnapshots:{};
        proc.marketSnapshots[id]=snapshot;
        pushMarketHistory(proc,id,snapshot);
        proc.lastItemMarketAt=snapshot.fetchedAt;
        if(pulseSnapshot&&marketPulse?.applySnapshotToDraft){
          marketPulse.applySnapshotToDraft(draft,pulseSnapshot,{recordRequest:true});
        }
        return draft;
      });
      return snapshot;
    }

    function recentItemMarketSnapshot(state,itemId,maxAgeMs=ITEM_MARKET_RECENT_REUSE_MS) {
      const id=asId(itemId);
      const snap=state?.procurement?.marketSnapshots?.[id]||null;
      const fetchedAt=snap?.fetchedAt?Date.parse(snap.fetchedAt):0;
      const ageMs=fetchedAt?Math.max(0,Date.now()-fetchedAt):Infinity;
      const price=Math.max(0,Number(snap?.itemMarket?.lowest||0));
      return price>0&&ageMs<=Math.max(0,Number(maxAgeMs||0))?snap:null;
    }

    async function verifyItemMarket(itemId,{allowRecentMs=ITEM_MARKET_RECENT_REUSE_MS}={}) {
      const id=asId(itemId);
      const before=await core.readLegacyState();
      const recent=recentItemMarketSnapshot(before,id,allowRecentMs);
      if(recent) return {snapshot:recent,reusedRecent:true};
      const snapshot=await refreshItemMarket(id);
      return {snapshot,reusedRecent:false};
    }

    async function verifyBazaar(itemId,sellerId,expectedPrice=0) {
      if (!hasTornKey()) throw new Error('Save a Torn API key in MM Acquisitions first.');
      const id=asId(itemId),seller=asId(sellerId);
      if (!/^\d+$/.test(id)||!/^\d+$/.test(seller)) return {verified:false,reason:'invalid-id'};
      const data=await deps.bazaarRequest(seller);
      const snapshot=bazaarSnapshotFreshness(data?.bazaar_timestamp);
      if (!snapshot.fresh) return {verified:false,reason:'snapshot-stale',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      const rows=Array.isArray(data?.bazaar)?data.bazaar:[];
      const item=rows.find(row=>asId(row?.ID??row?.id??row?.item_id)===id);
      if (!data?.bazaar_is_open) return {verified:false,reason:'bazaar-closed',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      if (!item) return {verified:false,reason:'item-gone',sellerId:seller,bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds};
      const actualPrice=Math.max(0,Number(item.price||0));
      const quantity=Math.max(0,Number(item.quantity||item.qty||0));
      const expected=Math.max(0,Number(expectedPrice||0));
      return {
        verified:true,reason:expected&&actualPrice!==expected?'price-changed':'present',
        sellerId:seller,itemId:id,itemName:String(item.name||''),actualPrice,expectedPrice:expected,
        quantity,priceChanged:Boolean(expected&&actualPrice!==expected),
        bazaarTimestamp:snapshot.timestamp,snapshotAgeSec:snapshot.ageSeconds
      };
    }

    async function persistBazaarResult(itemId,sellerId,result) {
      const id=asId(itemId),seller=asId(sellerId);
      await core.updateDomainState('market',draft=>{
        const detail=draft.marketIntel?.details?.[id];
        if (!detail) return draft;
        const keep=row=>asId(row?.sellerId)!==seller;
        if (!result.verified && (result.reason==='bazaar-closed'||result.reason==='item-gone')) {
          detail.organicListings=(detail.organicListings||[]).filter(keep);
          detail.listings=(detail.listings||[]).filter(keep);
          detail.fetchedAt=nowIso();
          return draft;
        }
        if (result.verified) {
          const previous=(detail.organicListings||[]).find(row=>asId(row?.sellerId)===seller)||{};
          const row={
            ...previous,itemId:id,sellerId:seller,sellerName:String(previous.sellerName||seller),
            price:Number(result.actualPrice||0),quantity:Number(result.quantity||0),
            sponsored:false,lastChecked:Date.now(),contentUpdated:Number(previous.contentUpdated||Date.now())
          };
          detail.organicListings=[row,...(detail.organicListings||[]).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
          detail.listings=[row,...(detail.listings||[]).filter(keep)].sort((a,b)=>Number(a.price||0)-Number(b.price||0));
          detail.fetchedAt=nowIso();
        }
        return draft;
      });
    }

    async function importTravelRows(rows,capturedAt=Date.now()) {
      const safeRows=(Array.isArray(rows)?rows:[]).map(row=>({...row,source:String(row?.source||'TornW3B Travel Stock')}));
      if(!safeRows.length)throw new Error('No travel rows to import.');
      const at=Number(capturedAt||Date.now());
      await core.updateDomainState('market',draft=>{
        const travel=draft.travelIntel || (draft.travelIntel={});
        travel.rows=safeRows;
        travel.lastSyncAt=new Date(at).toISOString();
        travel.source='TornW3B Travel Stock';
        travel.diagnostics=Array.isArray(travel.diagnostics)?travel.diagnostics:[];
        travel.diagnostics.unshift({at:nowIso(),text:'MM Acquisitions Travel import: '+safeRows.length+' rows.'});
        travel.diagnostics=travel.diagnostics.slice(0,30);
        recordTravelSnapshots(travel,safeRows,at);
        return draft;
      });
      return core.readLegacyState();
    }

    async function refreshOpportunities({enrichLimit=8,itemMarketLimit=6,refreshGlobalFirst=true}={}) {
      if(refreshGlobalFirst) await refreshGlobal();
      let state=await core.readLegacyState();
      let ranked=logic.rankCachedOpportunities(state);
      let ids=ranked.map(r=>r.id);
      if (ids.length<enrichLimit) {
        const supplements=Object.values(state?.marketIntel?.marketplace||{})
          .filter(x=>x?.itemId)
          .sort((a,b)=>{
            const pa=Math.max(Number(a.bazaarAverage||0),Number(a.marketPrice||0))-Number(a.lowestPrice||0);
            const pb=Math.max(Number(b.bazaarAverage||0),Number(b.marketPrice||0))-Number(b.lowestPrice||0);
            return pb-pa;
          }).map(x=>asId(x.itemId));
        ids=[...new Set([...ids,...supplements])];
      }
      ids=ids.slice(0,Math.max(1,enrichLimit));
      await mapLimit(ids,2,id=>enrichItem(id));
      if (hasTornKey()) await mapLimit(ids.slice(0,Math.max(1,itemMarketLimit)),2,id=>refreshItemMarket(id));
      return core.readLegacyState();
    }

    function resolveProcurementItemId(state,itemId,itemName='') {
      const explicit=asId(itemId);
      if(/^\d+$/.test(explicit)) return explicit;
      const wanted=String(itemName||'').trim().toLowerCase();
      if(!wanted) return '';
      for(const [id,row] of Object.entries(state?.procurement?.catalog||{})) {
        if(String(row?.name||'').trim().toLowerCase()===wanted) return asId(id);
      }
      for(const row of Object.values(state?.marketIntel?.marketplace||{})) {
        if(String(row?.itemName||'').trim().toLowerCase()===wanted) return asId(row?.itemId);
      }
      for(const row of state?.travelIntel?.rows||[]) {
        if(String(row?.itemName||'').trim().toLowerCase()===wanted&&asId(row?.itemId)) return asId(row.itemId);
      }
      return '';
    }

    function selectedItemExitEvidence(state,id) {
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const intel=state?.marketIntel?.marketplace?.[id]||{};
      const settings=state?.marketIntel?.settings||{};
      const bazaarHaircut=Math.max(0,Math.min(25,Number(settings?.bazaarExitHaircutPct||0)))/100;
      const bazaarExit=Math.floor(Number(intel?.bazaarAverage||0)*(1-bazaarHaircut));
      const itemMarketAsk=Math.max(0,Number(snap?.itemMarket?.lowest||0));
      const itemMarketNet=Math.floor(itemMarketAsk*(1-ITEM_MARKET_FEE_RATE));
      const candidates=[
        {route:'Bazaar',value:bazaarExit},
        {route:'Item Market Net',value:itemMarketNet}
      ].filter(row=>Number(row.value||0)>0).sort((a,b)=>b.value-a.value);
      const best=candidates[0]||{route:'Unknown',value:0};
      return {best,candidates};
    }

    async function procurementSourceOptions(itemId,itemName='') {
      let state=await core.readLegacyState();
      const id=resolveProcurementItemId(state,itemId,itemName);
      if(!id) return {itemId:'',itemName:String(itemName||''),sources:[],state};
      let itemMarketVerified=false;
      try { await enrichItem(id); } catch {}
      try {
        const verification=await verifyItemMarket(id);
        itemMarketVerified=Boolean(verification?.snapshot);
      } catch {}
      state=await core.readLegacyState();

      const catalog=state?.procurement?.catalog?.[id]||{};
      const marketplace=state?.marketIntel?.marketplace?.[id]||{};
      const resolvedName=String(itemName||catalog.name||marketplace?.itemName||('Item '+id));
      const maxAge=Math.max(30,Number(state?.businessRules?.maxListingAgeSec||180));
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const snapAge=snap.fetchedAt?Math.max(0,(Date.now()-Date.parse(snap.fetchedAt))/1000):Infinity;
      const itemMarketPrice=snapAge<=maxAge?Number(snap?.itemMarket?.lowest||0):0;
      const aggregateBazaarLow=Math.max(0,Number(marketplace?.lowestPrice||0));
      const bazaarRows=freshOrganicListings(state,id).slice(0,VERIFY_SELLERS);
      const namedBest=bazaarRows[0]||null;
      const namedPrice=Math.max(0,Number(namedBest?.price||0));
      const namedConsistent=Boolean(namedBest&&(
        !(aggregateBazaarLow>0) ||
        namedPrice<=aggregateBazaarLow*1.35
      ));
      const bestBazaar=namedConsistent?namedBest:null;
      const travelRows=(state?.travelIntel?.rows||[])
        .filter(row=>Number(row?.stock||0)>0&&(
          asId(row?.itemId)===id||
          String(row?.itemName||'').trim().toLowerCase()===resolvedName.trim().toLowerCase()
        ))
        .slice().sort((a,b)=>(Number(a.shopCost||0)||Number.MAX_SAFE_INTEGER)-(Number(b.shopCost||0)||Number.MAX_SAFE_INTEGER));
      const bestTravel=travelRows[0]||null;

      const sources=[];
      for(const shop of Array.isArray(catalog?.shops)?catalog.shops:[]){
        if(Number(shop?.price||0)>0) sources.push({
          source:'Torn Shop',price:Number(shop.price||0),quantity:Number(shop.quantity||0),
          shopName:String(shop.name||'Shop'),country:String(shop.country||''),catalogSource:true
        });
      }
      if(bestBazaar) sources.push({
        source:'Bazaar',price:Number(bestBazaar.price||0),quantity:Number(bestBazaar.quantity||0),
        sellerId:asId(bestBazaar.sellerId),sellerName:String(bestBazaar.sellerName||''),
        verifiedCandidate:true
      });
      if(aggregateBazaarLow>0&&(!bestBazaar||Number(bestBazaar.price||0)>aggregateBazaarLow*1.05)) sources.push({
        source:'Bazaar aggregate',price:aggregateBazaarLow,quantity:0,
        sellerId:'',sellerName:'',aggregateOnly:true,
        bazaarAverage:Number(marketplace?.bazaarAverage||0),bazaarCount:Number(marketplace?.totalBazaars||0)
      });
      if(itemMarketPrice>0) sources.push({
        source:'Item Market',price:itemMarketPrice,quantity:Number(snap?.itemMarket?.depth1Pct||1),
        liveVerified:itemMarketVerified,verifiedAt:String(snap?.fetchedAt||'')
      });
      if(bestTravel) sources.push({
        source:'Overseas',
        price:Math.max(0,Number(bestTravel.shopCost||0)),
        quantity:Number(bestTravel.stock||0),
        country:String(bestTravel.country||''),
        profit:Number(bestTravel.profit||0),
        sourceProfitPerHour:Number(bestTravel.sourceProfitPerHour||0),
        priceKnown:Number(bestTravel.shopCost||0)>0,
        travelEvidence:true
      });
      sources.sort((a,b)=>{
        const ap=Number(a.price||0),bp=Number(b.price||0);
        const ak=ap>0,bk=bp>0;
        if(ak!==bk)return ak?-1:1;
        return ap-bp;
      });
      const exitEvidence=selectedItemExitEvidence(state,id);
      return {
        itemId:id,itemName:resolvedName,sources,state,
        exitValue:Number(exitEvidence.best.value||0),
        exitRoute:String(exitEvidence.best.route||'Unknown'),
        exitCandidates:exitEvidence.candidates,
        catalogReference:Number(catalog?.marketPrice||0)
      };
    }

    async function routeProcurementRequest({itemId='',itemName='',preferredSource='Best'}={}) {
      const result=await procurementSourceOptions(itemId,itemName);
      const id=result.itemId;
      if(!id) return {routed:false,reason:'item-id-unresolved',...result};
      const preferred=String(preferredSource||'Best').toLowerCase();
      const ordered=result.sources.filter(source=>preferred==='best'||String(source.source||'').toLowerCase()===preferred);
      if(!ordered.length) return {routed:false,reason:'preferred-source-unavailable',...result};
      const verificationWarnings=[];

      for(const candidate of ordered) {
        if(candidate.source==='Bazaar aggregate') {
          try { await enrichItem(id); } catch(error) {
            verificationWarnings.push({source:'Bazaar discovery',message:String(error?.message||error||'refresh failed')});
          }
          const refreshed=await core.readLegacyState();
          const aggregate=Math.max(0,Number(refreshed?.marketIntel?.marketplace?.[id]?.lowestPrice||candidate.price||0));
          const liveRows=freshOrganicListings(refreshed,id)
            .filter(row=>Number(row?.price||0)>0&&(!(aggregate>0)||Number(row.price)<=aggregate*1.35))
            .slice(0,VERIFY_SELLERS);
          for(const row of liveRows){
            let verify;
            try{
              verify=await verifyBazaar(id,row.sellerId,row.price);
            }catch(error){
              verificationWarnings.push({
                source:'Bazaar',sellerId:asId(row.sellerId),
                message:String(error?.message||error||'verification failed')
              });
              continue;
            }
            await persistBazaarResult(id,row.sellerId,verify);
            if(!verify.verified)continue;
            const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(row.sellerId));
            navigate(url);
            return {routed:true,source:'Bazaar',url,verified:verify,verificationWarnings,...result};
          }
          continue;
        }
        if(candidate.source==='Bazaar') {
          let verify;
          try{
            verify=await verifyBazaar(id,candidate.sellerId,candidate.price);
          }catch(error){
            verificationWarnings.push({
              source:'Bazaar',sellerId:asId(candidate.sellerId),
              message:String(error?.message||error||'verification failed')
            });
            continue;
          }
          await persistBazaarResult(id,candidate.sellerId,verify);
          if(!verify.verified) continue;
          const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(candidate.sellerId));
          navigate(url);
          return {routed:true,source:'Bazaar',url,verified:verify,verificationWarnings,...result};
        }
        if(candidate.source==='Item Market') {
          let fresh=null;
          try{
            const verifiedAt=candidate?.verifiedAt?Date.parse(candidate.verifiedAt):0;
            const verifiedAgeMs=verifiedAt?Math.max(0,Date.now()-verifiedAt):Infinity;
            if(candidate.liveVerified&&verifiedAgeMs<=ITEM_MARKET_RECENT_REUSE_MS){
              fresh=(await core.readLegacyState())?.procurement?.marketSnapshots?.[id]||null;
            }
            if(!fresh){
              const verification=await verifyItemMarket(id);
              fresh=verification?.snapshot||null;
            }
          }catch(error){
            verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'verification failed')});
            continue;
          }
          const livePrice=Number(fresh?.itemMarket?.lowest||0);
          if(!(livePrice>0)) continue;
          const catalog=(await core.readLegacyState())?.procurement?.catalog?.[id]||{};
          const url=itemMarketPurchaseUrl(id,result.itemName,catalog.type||'');
          navigate(url);
          return {routed:true,source:'Item Market',url,price:livePrice,verificationWarnings,...result};
        }
        if(candidate.source==='Overseas') {
          return {
            routed:false,reason:'overseas-recommended',recommendedSource:'Overseas',
            country:String(candidate.country||''),price:Number(candidate.price||0),stock:Number(candidate.quantity||0),
            profit:Number(candidate.profit||0),sourceProfitPerHour:Number(candidate.sourceProfitPerHour||0),
            priceKnown:Boolean(candidate.priceKnown),verificationWarnings,
            ...result
          };
        }
        if(candidate.source==='Torn Shop') {
          return {
            routed:false,reason:'shop-recommended',recommendedSource:'Torn Shop',
            shopName:String(candidate.shopName||'Torn shop'),country:String(candidate.country||''),
            price:Number(candidate.price||0),stock:Number(candidate.quantity||0),verificationWarnings,
            ...result
          };
        }
      }
      return {
        routed:false,
        reason:verificationWarnings.length?'live-verification-unavailable':'source-verification-failed',
        verificationWarnings,
        ...result
      };
    }

    async function acquire(itemId) {
      if (!hasTornKey()) return {routed:false,reason:'api-key-required'};
      const id=asId(itemId);
      const verificationWarnings=[];
      let verifiedItemMarketSnapshot=null;
      try {
        await enrichItem(id);
      } catch(error) {
        verificationWarnings.push({source:'Bazaar discovery',message:String(error?.message||error||'refresh failed')});
      }
      try {
        const verification=await verifyItemMarket(id);
        verifiedItemMarketSnapshot=verification?.snapshot||null;
      } catch(error) {
        verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'refresh failed')});
      }
      let state=await core.readLegacyState();
      let opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id);
      if (!opportunity) return {routed:false,reason:'no-qualified-opportunity',verificationWarnings};

      const maxBuy=Math.max(0,Number(opportunity.maxBuyPrice||0));
      const bazaarCandidates=freshOrganicListings(state,id)
        .filter(row=>Number(row.price||0)>0&&(!maxBuy||Number(row.price||0)<=maxBuy))
        .slice(0,VERIFY_SELLERS);
      const snap=state?.procurement?.marketSnapshots?.[id]||{};
      const maxAge=Math.max(30,Number(state?.businessRules?.maxListingAgeSec||180));
      const snapAge=snap.fetchedAt?Math.max(0,(Date.now()-Date.parse(snap.fetchedAt))/1000):Infinity;
      const itemPrice=snapAge<=maxAge?Number(snap?.itemMarket?.lowest||0):0;
      const candidates=[
        ...bazaarCandidates.map(row=>({source:'Bazaar',price:Number(row.price||0),row})),
        ...(itemPrice>0&&(!maxBuy||itemPrice<=maxBuy)?[{source:'Item Market',price:itemPrice}]:[])
      ].sort((a,b)=>a.price-b.price);

      for (const candidate of candidates) {
        if (candidate.source==='Bazaar') {
          let result;
          try{
            result=await verifyBazaar(id,candidate.row.sellerId,candidate.row.price);
          }catch(error){
            verificationWarnings.push({
              source:'Bazaar',sellerId:asId(candidate.row.sellerId),
              message:String(error?.message||error||'verification failed')
            });
            continue;
          }
          await persistBazaarResult(id,candidate.row.sellerId,result);
          if (!result.verified) continue;
          if (maxBuy>0&&Number(result.actualPrice||0)>maxBuy) continue;
          const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(candidate.row.sellerId));
          navigate(url);
          return {routed:true,source:'Bazaar',url,verified:result,verificationWarnings};
        }

        let fresh=verifiedItemMarketSnapshot;
        if(!fresh){
          try{
            const verification=await verifyItemMarket(id);
            fresh=verification?.snapshot||null;
          }catch(error){
            verificationWarnings.push({source:'Item Market',message:String(error?.message||error||'verification failed')});
            continue;
          }
        }
        const livePrice=Number(fresh?.itemMarket?.lowest||0);
        if (!(livePrice>0)||(maxBuy>0&&livePrice>maxBuy)) continue;
        state=await core.readLegacyState();
        opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id) || opportunity;
        const catalog=state?.procurement?.catalog?.[id]||{};
        const url=itemMarketPurchaseUrl(id,opportunity.name,catalog.type||opportunity.itemType);
        navigate(url);
        return {routed:true,source:'Item Market',url,price:livePrice,verificationWarnings};
      }
      return {
        routed:false,
        reason:verificationWarnings.length?'live-verification-unavailable':'no-live-source-inside-ceiling',
        maxBuyPrice:maxBuy,
        verificationWarnings
      };
    }

    return Object.freeze({
      refreshPricelist,refreshRankedLive,refreshRankedHistory,
      refreshItemCatalog,refreshGlobal,enrichItem,refreshItemMarket,refreshOpportunities,
      verifyBazaar,acquire,procurementSourceOptions,routeProcurementRequest,itemMarketPurchaseUrl,importTravelRows
    });
  }

  Object.defineProperty(globalThis,'MMTornAcquisitionsLive',{
    value:Object.freeze({
      createService,normalizeMarketplaceItem,normalizeListing,normalizeTrader,
      genericMarketListings,normalizeCatalogShop,normalizeTornCatalog,normalizePricelistRows,
      normalizeRankedBonuses,canonicalRankedSource,normalizeRankedListing,normalizeAuctionHistoryRows,apiNextUrl,
      marketMetrics,bazaarSnapshotFreshness,itemMarketPurchaseUrl,
      parseTravelNumber,parseTravelStockHtml,recordTravelSnapshots
    }),
    configurable:true,enumerable:false,writable:false
  });
})();
