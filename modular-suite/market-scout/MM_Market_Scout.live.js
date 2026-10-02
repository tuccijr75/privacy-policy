(() => {
  'use strict';

  const API_BASE = 'https://api.torn.com/v2';
  const WEAV_BASE = 'https://weav3r.dev/api';
  const ITEM_MARKET_FEE_RATE = 0.05;
  const MARKET_HISTORY_MAX = 240;
  const INTEL_HISTORY_MAX = 120;
  const VERIFY_MAX_AGE_SEC = 120;
  const VERIFY_SELLERS = 4;

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
      totalBazaars:Number(row?.total_bazaars || 0)
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
    const logic=deps.logic || globalThis.MMTornMarketLogic;
    if (!core || !logic) throw new Error('MM Torn Core and Market logic are required.');
    if (typeof deps.weavRequest !== 'function') throw new Error('weavRequest dependency is required.');
    if (typeof deps.tornRequest !== 'function') throw new Error('tornRequest dependency is required.');
    if (typeof deps.bazaarRequest !== 'function') throw new Error('bazaarRequest dependency is required.');
    const hasTornKey=typeof deps.hasTornKey === 'function' ? deps.hasTornKey : ()=>true;
    const navigate=typeof deps.navigate === 'function' ? deps.navigate : url=>{ location.href=url; };

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
      if (!hasTornKey()) throw new Error('Save a Torn API key in Market Scout first.');
      const id=asId(itemId);
      if (!/^\d+$/.test(id)) throw new Error('Invalid item ID.');
      const data=await deps.tornRequest('/market/'+encodeURIComponent(id)+'/itemmarket?limit=25');
      const itemRows=genericMarketListings(data);
      const before=await core.readLegacyState();
      const bazaarRows=freshOrganicListings(before,id).slice(0,25).map(row=>({
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
        fetchedAt:nowIso()
      };
      await core.updateDomainState('market',draft=>{
        const proc=draft.procurement || (draft.procurement={});
        proc.marketSnapshots=proc.marketSnapshots&&typeof proc.marketSnapshots==='object'?proc.marketSnapshots:{};
        proc.marketSnapshots[id]=snapshot;
        pushMarketHistory(proc,id,snapshot);
        proc.lastItemMarketAt=snapshot.fetchedAt;
        return draft;
      });
      return snapshot;
    }

    async function verifyBazaar(itemId,sellerId,expectedPrice=0) {
      if (!hasTornKey()) throw new Error('Save a Torn API key in Market Scout first.');
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
        travel.diagnostics.unshift({at:nowIso(),text:'Market Scout Travel import: '+safeRows.length+' rows.'});
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

    async function acquire(itemId) {
      if (!hasTornKey()) return {routed:false,reason:'api-key-required'};
      const id=asId(itemId);
      await enrichItem(id);
      try { await refreshItemMarket(id); } catch {}
      let state=await core.readLegacyState();
      let opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id);
      if (!opportunity) return {routed:false,reason:'no-qualified-opportunity'};

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
          const result=await verifyBazaar(id,candidate.row.sellerId,candidate.row.price);
          await persistBazaarResult(id,candidate.row.sellerId,result);
          if (!result.verified) continue;
          if (maxBuy>0&&Number(result.actualPrice||0)>maxBuy) continue;
          const url='https://www.torn.com/bazaar.php?userId='+encodeURIComponent(asId(candidate.row.sellerId));
          navigate(url);
          return {routed:true,source:'Bazaar',url,verified:result};
        }

        const fresh=await refreshItemMarket(id);
        const livePrice=Number(fresh?.itemMarket?.lowest||0);
        if (!(livePrice>0)||(maxBuy>0&&livePrice>maxBuy)) continue;
        state=await core.readLegacyState();
        opportunity=logic.rankCachedOpportunities(state).find(row=>asId(row.id)===id) || opportunity;
        const catalog=state?.procurement?.catalog?.[id]||{};
        const url=itemMarketPurchaseUrl(id,opportunity.name,catalog.type||opportunity.itemType);
        navigate(url);
        return {routed:true,source:'Item Market',url,price:livePrice};
      }
      return {routed:false,reason:'no-live-source-inside-ceiling',maxBuyPrice:maxBuy};
    }

    return Object.freeze({
      refreshGlobal,enrichItem,refreshItemMarket,refreshOpportunities,
      verifyBazaar,acquire,itemMarketPurchaseUrl,importTravelRows
    });
  }

  Object.defineProperty(globalThis,'MMTornMarketLive',{
    value:Object.freeze({
      createService,normalizeMarketplaceItem,normalizeListing,normalizeTrader,
      genericMarketListings,marketMetrics,bazaarSnapshotFreshness,itemMarketPurchaseUrl,
      parseTravelNumber,parseTravelStockHtml,recordTravelSnapshots
    }),
    configurable:true,enumerable:false,writable:false
  });
})();
