// ==UserScript==
// @name         MM Torn Faction Armory
// @namespace    manic-mike.torn.faction-armory
// @version      8.0.0-alpha.1
// @description  Modular faction inventory, member readiness, builds, minimums and leadership reporting.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/faction-armory/MM_Faction_Armory.logic.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='8.0.0-alpha.1';
  const ROOT_ID='mm-faction-armory';
  const LAUNCHER_ID='mm-faction-armory-launcher';
  const STYLE_ID='mm-faction-armory-style';
  const FACTION_API_KEY='mm_faction_armory_api_v1';
  const MEMBER_VAULT_KEY='mm_faction_armory_member_vault_v1';
  const MEMBER_VAULT_ITERATIONS=250000;
  const API_BASE='https://api.torn.com/v2';
  const CHANNEL='mm_bazaar_crm_cross_tab_v1';

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornFactionLogic;

  let state=null;
  let activeView='members';
  let statusText='Ready.';
  let loadError='';
  let busy=false;
  let selectedCategory='all';
  let vaultSession=null;
  let channel=null;

  const asId=value=>String(value??'').trim();
  const esc=value=>String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const num=value=>Math.max(0,Number(value)||0);
  const fmt=value=>num(value).toLocaleString('en-US',{maximumFractionDigits:2});
  const when=value=>{
    const ms=Date.parse(value||'');
    if(!ms)return '—';
    const sec=Math.max(0,Math.floor((Date.now()-ms)/1000));
    if(sec<60)return sec+'s ago';
    if(sec<3600)return Math.floor(sec/60)+'m ago';
    if(sec<86400)return Math.floor(sec/3600)+'h ago';
    return Math.floor(sec/86400)+'d ago';
  };

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:72px;z-index:2147483646;width:min(860px,calc(100vw - 24px));max-height:calc(100vh - 92px);overflow:hidden;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:9px;box-shadow:0 12px 35px #000b;font:13px/1.35 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button{min-height:32px;height:auto;line-height:1.2}
      .mm-fa-head{height:48px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 10px;gap:8px}
      .mm-fa-body{padding:8px}
      .mm-fa-tabs,.mm-fa-actions{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
      .mm-fa-scroll{max-height:calc(100vh - 230px);overflow:auto;padding-right:3px}
      .mm-fa-card{border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;margin-bottom:7px}
      .mm-fa-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-top:1px solid #303030;padding:8px 0}
      .mm-fa-row:first-child{border-top:0}
      .mm-fa-main{min-width:0;flex:1 1 auto}
      .mm-fa-buttons{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
      .mm-fa-muted{font-size:10px;color:#888}
      .mm-fa-mini{font-size:11px;color:#aaa}
      .mm-fa-stats{display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-top:2px}
      .mm-fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px}
      .mm-fa-input{width:100%;background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:7px;font:12px Arial,sans-serif}
      .mm-fa-status{padding:6px 8px;background:#151515;border:1px solid #333;border-radius:5px;color:#d7ad4b;margin:6px 0;white-space:normal}
      .mm-fa-pill{display:inline-block;border:1px solid #444;border-radius:999px;padding:2px 6px;font-size:10px;margin:2px 3px 0 0;color:#bbb}
      .mm-fa-good{color:#a7d7ad}.mm-fa-warn{color:#e5c879}.mm-fa-bad{color:#efaaa3}
      @media(max-width:620px){
        #${ROOT_ID}{right:5px;top:56px;width:calc(100vw - 10px);max-height:calc(100vh - 62px)}
        .mm-fa-row{display:block}
        .mm-fa-buttons{justify-content:flex-start;margin-top:6px}
        .mm-fa-scroll{max-height:calc(100vh - 215px)}
      }
    `;
    document.head.appendChild(style);
  }

  function button(primary=false){
    return 'border:1px solid '+(primary?'#9a7b35':'#555')+';background:'+(primary?'#d9ad42':'#252525')+';color:'+(primary?'#111':'#eee')+';border-radius:6px;padding:6px 9px;cursor:pointer;font:12px Arial,sans-serif;font-weight:'+(primary?'700':'500')+';';
  }

  function card(html){return '<div class="mm-fa-card">'+html+'</div>';}

  function gmJson(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:20000,headers:{Accept:'application/json'},
        onload:r=>{
          if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status+' from Torn API.'));
          let data;
          try{data=JSON.parse(r.responseText);}catch{return reject(new Error('Torn API returned invalid JSON.'));}
          if(data?.error){
            const msg=data.error?.error||data.error?.message||data.error||'Unknown Torn API error';
            return reject(new Error(String(msg)));
          }
          resolve(data);
        },
        ontimeout:()=>reject(new Error('Torn API request timed out.')),
        onerror:()=>reject(new Error('Torn API network request failed.'))
      });
    });
  }

  function apiRequest(pathOrUrl,key){
    const k=String(key||'').trim();
    if(!k)return Promise.reject(new Error('Torn API key is required.'));
    const url=new URL(String(pathOrUrl).startsWith('http')?pathOrUrl:API_BASE+pathOrUrl);
    url.searchParams.set('key',k);
    url.searchParams.set('comment','MM Faction Armory');
    return gmJson(url.toString());
  }

  function factionKey(){return String(GM_getValue(FACTION_API_KEY,'')||'').trim();}

  async function reloadState(){
    loadError='';
    if(!core||!logic){
      loadError='Faction Armory dependencies did not load.';
      state=null; render(); return;
    }
    try{
      const next=await core.readLegacyState();
      const validation=core.validateLegacyState(next);
      if(!validation.ok)throw new Error(validation.errors.join('; '));
      state=next;
    }catch(error){
      state=null;
      loadError=error?.message||String(error);
    }
    render();
  }

  function factionEpochMs(value){
    const raw=Number(value||0);
    if(!raw)return 0;
    return raw<1e12?raw*1000:raw;
  }

  function inventoryRowsFromResponse(data){
    const rows=data?.inventory??data?.data?.inventory??[];
    return Array.isArray(rows)?rows:[];
  }

  function inventoryTotalFromResponse(data){
    return Math.max(0,Number(
      data?._metadata?.total ??
      data?._metadata?.pagination?.total ??
      data?.metadata?.total ??
      0
    )||0);
  }

  async function fetchFactionCategory(category){
    if(!logic.categories.includes(category))throw new Error('Invalid inventory category: '+category);
    const key=factionKey();
    if(!key)throw new Error('Save a faction-compatible Torn API key in Settings.');
    const rows=[];
    const signatures=new Set();
    const sourceTimes=new Set();
    let offset=0,pages=0,metadataTotal=0,inventoryTimestamp=0;
    while(pages<25){
      const url=new URL(API_BASE+'/faction/inventory');
      url.searchParams.set('cat',category);
      url.searchParams.set('limit','100');
      if(offset)url.searchParams.set('offset',String(offset));
      const data=await apiRequest(url.toString(),key);
      const page=inventoryRowsFromResponse(data);
      const sourceAt=factionEpochMs(data?.inventory_timestamp);
      if(sourceAt)sourceTimes.add(sourceAt);
      if(sourceTimes.size>1)throw new Error('Torn inventory cache changed during '+category+' pagination. Retry.');
      for(const row of page){
        const uids=(Array.isArray(row?.uids)?row.uids:[]).map(asId).filter(Boolean);
        const signature=[asId(row?.id),asId(row?.loaned?.id),Number(row?.amount||0),uids.join(',')].join('|');
        if(signatures.has(signature))continue;
        signatures.add(signature);
        rows.push(row);
      }
      inventoryTimestamp=Math.max(inventoryTimestamp,sourceAt);
      pages++;
      const total=inventoryTotalFromResponse(data);
      metadataTotal=Math.max(metadataTotal,total);
      if(!page.length||page.length<100||(total>0&&offset+page.length>=total))break;
      offset+=page.length;
    }
    if(pages>=25)throw new Error('Inventory pagination safety limit reached for '+category+'.');
    return {category,rows,inventoryTimestamp,metadataTotal,pages};
  }

  function normalizeInventory(groups,fetchedAt=Date.now()){
    const current={};
    for(const group of groups||[]){
      const category=String(group?.category||'');
      if(!logic.categories.includes(category))continue;
      for(const raw of group?.rows||[]){
        const itemId=asId(raw?.id);
        if(!itemId)continue;
        const key=category+'|'+itemId;
        if(!current[key]){
          current[key]={
            key,category,itemId,
            name:String(raw?.name||('Item '+itemId)),
            type:String(raw?.type||''),
            amountOwned:0,availableCount:0,loanedCount:0,
            availableUids:[],loans:[],
            armorRating:num(raw?.armor??raw?.stats?.armor??raw?.stats?.protection),
            damage:num(raw?.damage??raw?.stats?.damage),
            accuracy:num(raw?.accuracy??raw?.stats?.accuracy),
            quality:num(raw?.quality??raw?.stats?.quality),
            bonuses:raw?.bonuses&&typeof raw.bonuses==='object'?raw.bonuses:null,
            fetchedAt
          };
        }
        const item=current[key];
        const amount=Math.max(0,Math.round(Number(raw?.amount||0)));
        const uids=[...new Set((Array.isArray(raw?.uids)?raw.uids:[]).map(asId).filter(Boolean))];
        item.amountOwned+=amount;
        const loaned=raw?.loaned&&typeof raw.loaned==='object'?raw.loaned:null;
        if(loaned?.id!=null){
          item.loanedCount+=amount;
          const memberId=asId(loaned.id);
          let loan=item.loans.find(x=>x.memberId===memberId);
          if(!loan){
            loan={memberId,memberName:String(loaned.name||memberId),amount:0,uids:[]};
            item.loans.push(loan);
          }
          loan.amount+=amount;
          loan.uids=[...new Set([...loan.uids,...uids])];
        }else{
          item.availableCount+=amount;
          item.availableUids=[...new Set([...item.availableUids,...uids])];
        }
      }
    }
    for(const item of Object.values(current))item.loans.sort((a,b)=>String(a.memberName).localeCompare(String(b.memberName)));
    return current;
  }

  function factionMembersFromResponse(data){
    let rows=data?.members??data?.faction?.members??data?.data?.members??[];
    if(rows&&typeof rows==='object'&&!Array.isArray(rows)){
      rows=Object.entries(rows).map(([id,row])=>({id,...(row||{})}));
    }
    if(!Array.isArray(rows))return [];
    return rows.map(raw=>{
      const id=asId(raw?.id??raw?.user_id??raw?.player_id??raw?.user?.id);
      if(!id)return null;
      return {
        memberId:id,
        memberName:String(raw?.name??raw?.username??raw?.user?.name??id),
        level:num(raw?.level??raw?.user?.level),
        position:String(raw?.position??raw?.role??raw?.position_name??raw?.faction_position??''),
        status:String(raw?.status?.state??raw?.status??raw?.user?.status?.state??''),
        lastActionAt:Number(raw?.last_action?.timestamp||raw?.lastActionAt||0)||0,
        joinedAt:Number(raw?.joined_at||raw?.joined||0)||0,
        fetchedAt:Date.now()
      };
    }).filter(Boolean);
  }

  async function mapLimit(values,limit,worker){
    const out=new Array(values.length);
    let index=0;
    async function run(){
      while(true){
        const i=index++;
        if(i>=values.length)return;
        try{out[i]={status:'fulfilled',value:await worker(values[i])};}
        catch(error){out[i]={status:'rejected',reason:error};}
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,values.length)},run));
    return out;
  }

  async function refreshFaction(){
    if(busy)return;
    const key=factionKey();
    if(!key){activeView='settings';statusText='Save a faction-compatible API key first.';render();return;}
    busy=true;statusText='Refreshing all 9 armory categories + roster…';render();
    try{
      const [categoryResults,membersData]=await Promise.all([
        mapLimit(logic.categories,3,fetchFactionCategory),
        apiRequest('/faction/members',key)
      ]);
      const failures=categoryResults.map((x,i)=>({x,cat:logic.categories[i]})).filter(r=>r.x.status==='rejected');
      if(failures.length)throw new Error(failures.map(r=>r.cat+': '+(r.x.reason?.message||String(r.x.reason))).join(' | '));
      const groups=categoryResults.map(x=>x.value);
      const times=[...new Set(groups.map(g=>Number(g.inventoryTimestamp||0)).filter(Boolean))];
      if(times.length!==1)throw new Error(times.length?'Inventory categories returned mixed Torn cache timestamps.':'No inventory timestamp returned by Torn.');
      const sourceAt=times[0];
      const fetchedAt=Date.now();
      const current=normalizeInventory(groups,fetchedAt);
      const rosterRows=factionMembersFromResponse(membersData);
      if(!rosterRows.length)throw new Error('Faction roster response contained no members.');

      await core.updateDomainState('faction',draft=>{
        const fi=draft.factionInventory&&typeof draft.factionInventory==='object'?draft.factionInventory:{};
        const ledger=logic.recordSnapshot(fi,current,sourceAt,fetchedAt);
        const next=ledger.state;
        next.current=current;
        next.sourceCategorySummary=Object.fromEntries(groups.map(g=>[g.category,{
          rows:g.rows.length,metadataTotal:g.metadataTotal,pages:g.pages,inventoryTimestamp:g.inventoryTimestamp
        }]));
        next.inventoryTimestamp=new Date(sourceAt).toISOString();
        next.lastSyncAt=new Date(fetchedAt).toISOString();
        next.nextUsefulRefreshAt=new Date(Math.max(fetchedAt,sourceAt+3600000)).toISOString();
        next.memberReadiness=next.memberReadiness&&typeof next.memberReadiness==='object'?next.memberReadiness:{};
        next.memberReadiness.profiles=next.memberReadiness.profiles&&typeof next.memberReadiness.profiles==='object'?next.memberReadiness.profiles:{};
        next.memberReadiness.settings=next.memberReadiness.settings&&typeof next.memberReadiness.settings==='object'?next.memberReadiness.settings:{staleHours:72};
        next.memberReadiness.roster=Object.fromEntries(rosterRows.map(row=>[row.memberId,row]));
        next.memberReadiness.lastRosterSyncAt=new Date(fetchedAt).toISOString();
        draft.factionInventory=next;
        return draft;
      });
      state=await core.readLegacyState();
      statusText='Faction refreshed: '+Object.keys(current).length+' item rows · '+rosterRows.length+' members.';
    }catch(error){
      statusText='Faction refresh failed: '+(error?.message||String(error));
    }finally{busy=false;render();}
  }

  function extractUserId(data){
    const candidates=[
      data?.profile?.id,data?.profile?.player_id,data?.user?.id,data?.user?.player_id,
      data?.id,data?.player_id,data?.basic?.id,data?.basic?.player_id
    ];
    for(const candidate of candidates){const id=asId(candidate);if(id)return id;}
    return '';
  }

  function extractUsername(data,id){
    for(const candidate of [data?.profile?.name,data?.user?.name,data?.name,data?.player_name,data?.username]){
      const value=String(candidate||'').trim();
      if(value&&value!==id&&!/^\d+$/.test(value))return value;
    }
    return '';
  }

  function battleStats(data){
    const root=data?.battlestats&&typeof data.battlestats==='object'?data.battlestats:(data||{});
    const read=key=>{
      const raw=root?.[key];
      if(raw&&typeof raw==='object')return num(raw.value??raw.effective??raw.total??raw.amount??raw.base);
      return num(raw);
    };
    return {strength:read('strength'),defense:read('defense'),speed:read('speed'),dexterity:read('dexterity')};
  }

  function equipmentItems(data){
    const rows=[],seen=new Set();
    const push=(fallback,item)=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return;
      const itemObj=item.item&&typeof item.item==='object'?item.item:{};
      const id=asId(item.id??item.item_id??itemObj.id);
      const uid=asId(item.uid??item.item_uid??itemObj.uid);
      const name=String(item.name??item.item_name??itemObj.name??(id?'Item '+id:'')).trim();
      const subType=String(item.sub_type??item.subType??itemObj.sub_type??'').trim();
      const type=String(item.type??item.category??itemObj.type??'').trim();
      const slot=String(item.slot??'').trim();
      const semantic=(subType&&!/^\d+$/.test(subType)?subType:type&&!/^\d+$/.test(type)?type:slot&&!/^\d+$/.test(slot)?slot:fallback);
      if(!name&&!id)return;
      const key=uid||[id,semantic,name].join('|');
      if(seen.has(key))return;
      seen.add(key);
      const stats=item.stats&&typeof item.stats==='object'?item.stats:(itemObj.stats&&typeof itemObj.stats==='object'?itemObj.stats:{});
      rows.push({
        uid,itemId:id,name,slot:semantic,type,subType,
        damage:num(item.damage??stats.damage),
        accuracy:num(item.accuracy??stats.accuracy),
        armor:num(item.armor??stats.armor??stats.protection),
        armorRating:num(item.armor??stats.armor??stats.protection),
        quality:num(item.quality??stats.quality),
        bonuses:item.bonuses&&typeof item.bonuses==='object'?item.bonuses:(itemObj.bonuses&&typeof itemObj.bonuses==='object'?itemObj.bonuses:null),
        mods:Array.isArray(item.mods)?item.mods.map(m=>({id:asId(m?.id),name:String(m?.name||'')})):[]
      });
    };
    for(const item of Array.isArray(data?.equipment)?data.equipment:[])push('',item);
    for(const item of Array.isArray(data?.clothing)?data.clothing:[])push('armor',item);
    for(const [key,value] of Object.entries(data||{})){
      if(['equipment','clothing'].includes(key))continue;
      if(value&&typeof value==='object'&&!Array.isArray(value)&&('name' in value||'item' in value||'item_id' in value))push(key,value);
    }
    return rows;
  }

  function equipmentSummary(items){
    return (items||[]).map(item=>{
      const stats=[];
      if(num(item.damage))stats.push('DMG '+fmt(item.damage));
      if(num(item.accuracy))stats.push('ACC '+fmt(item.accuracy));
      if(num(item.armorRating))stats.push('ARM '+fmt(item.armorRating));
      return [String(item.slot||'').toUpperCase(),item.name,stats.join('/')].filter(Boolean).join(': ');
    }).join(' | ');
  }

  function inventoryArray(data){
    const rows=data?.inventory??data?.items??data?.data?.inventory??[];
    return Array.isArray(rows)?rows:[];
  }

  function memberSupply(inventory,ammoData,equipment){
    const rows=Array.isArray(inventory)?inventory:[];
    const countName=name=>rows.filter(r=>String(r?.name||r?.item?.name||'').toLowerCase()===name.toLowerCase())
      .reduce((sum,r)=>sum+num(r?.amount??r?.quantity??r?.qty),0);
    const filled=rows.filter(r=>/blood bag/i.test(String(r?.name||r?.item?.name||''))&&!/empty blood bag/i.test(String(r?.name||r?.item?.name||'')))
      .map(r=>String(r?.name||r?.item?.name||'')+' x'+num(r?.amount??r?.quantity??r?.qty)).join(' | ');
    const types=regex=>rows.filter(r=>regex.test(String(r?.type||r?.item?.type||r?.category||'')))
      .map(r=>String(r?.name||r?.item?.name||'')+' x'+num(r?.amount??r?.quantity??r?.qty)).join(' | ');
    const ammo=Array.isArray(ammoData?.ammo)?ammoData.ammo:[];
    const mods=(equipment||[]).flatMap(i=>i.mods||[]).map(m=>m.name).filter(Boolean);
    return {
      medical:{
        sfak:countName('Small First Aid Kit'),
        fak:countName('First Aid Kit'),
        morphine:countName('Morphine'),
        ipecac:countName('Ipecac Syrup')||countName('Ipecac'),
        emptyBloodBags:countName('Empty Blood Bag'),
        filledBloodBags:filled
      },
      temporaryStock:types(/temporary/i),
      consumables:types(/candy|alcohol|energy/i),
      drugs:types(/drug/i),
      boosters:types(/booster/i),
      utilities:types(/enhancer|tool|material|supply/i),
      ammo:ammo.map(a=>String(a?.name||a?.type||a?.ammo_type||'Ammo')+' x'+num(a?.quantity??a?.amount)).join(' | '),
      weaponMods:[...new Set(mods)].join(' | '),
      medicalKnown:rows.some(r=>/medical/i.test(String(r?.type||r?.item?.type||r?.category||''))),
      updatedAt:new Date().toISOString()
    };
  }

  function bytesToBase64(bytes){
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
  }
  function base64ToBytes(value){
    const binary=atob(String(value||''));const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
  }
  function getVault(){
    const raw=GM_getValue(MEMBER_VAULT_KEY,null);
    return raw&&typeof raw==='object'?raw:null;
  }
  function saveVault(vault){GM_setValue(MEMBER_VAULT_KEY,vault);}
  async function deriveVaultKey(passphrase,saltB64){
    if(!globalThis.crypto?.subtle)throw new Error('Browser Web Crypto is unavailable.');
    const encoder=new TextEncoder();
    const base=await crypto.subtle.importKey('raw',encoder.encode(String(passphrase||'')),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({
      name:'PBKDF2',salt:base64ToBytes(saltB64),iterations:MEMBER_VAULT_ITERATIONS,hash:'SHA-256'
    },base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(key,text){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=new TextEncoder().encode(String(text||''));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);
    return {iv:bytesToBase64(iv),cipher:bytesToBase64(new Uint8Array(cipher))};
  }
  async function unseal(key,sealed){
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(sealed?.iv||'')},key,base64ToBytes(sealed?.cipher||''));
    return new TextDecoder().decode(plain);
  }
  async function unlockVault(create=true){
    if(vaultSession?.key)return vaultSession.key;
    let vault=getVault();
    if(!vault){
      if(!create)throw new Error('No saved member-key vault exists.');
      const first=prompt('Create the MM Faction Armory vault passphrase (12+ characters). It is not stored:','');
      if(first==null)throw new Error('Vault setup cancelled.');
      if(String(first).length<12)throw new Error('Vault passphrase must be at least 12 characters.');
      const second=prompt('Re-enter the new vault passphrase:','');
      if(second==null||String(second)!==String(first))throw new Error('Vault passphrases did not match.');
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const saltB64=bytesToBase64(salt);
      const key=await deriveVaultKey(first,saltB64);
      const verifier=await seal(key,'MM-FACTION-ARMORY-VAULT-v1');
      vault={version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),salt:saltB64,verifier,entries:{}};
      saveVault(vault);vaultSession={key,at:Date.now()};return key;
    }
    const pass=prompt('Unlock the MM Faction Armory member-key vault:','');
    if(pass==null)throw new Error('Vault unlock cancelled.');
    const key=await deriveVaultKey(pass,vault.salt);
    let marker='';
    try{marker=await unseal(key,vault.verifier);}catch{throw new Error('Incorrect vault passphrase or damaged vault.');}
    if(marker!=='MM-FACTION-ARMORY-VAULT-v1')throw new Error('Vault verification failed.');
    vaultSession={key,at:Date.now()};return key;
  }
  function savedKeyIds(){return Object.keys(getVault()?.entries||{});}

  async function fetchUserInventory(key){
    const rows=[];let offset=0,pages=0;
    while(pages<20){
      const url=new URL(API_BASE+'/user/inventory');
      url.searchParams.set('limit','100');
      if(offset)url.searchParams.set('offset',String(offset));
      const data=await apiRequest(url.toString(),key);
      const page=inventoryArray(data);
      rows.push(...page);pages++;
      const total=Number(data?._metadata?.total??data?._metadata?.pagination?.total??0)||0;
      if(!page.length||page.length<100||(total&&offset+page.length>=total))break;
      offset+=page.length;
    }
    return rows;
  }

  async function importMemberKey(key,{save=false}={}){
    const clean=String(key||'').trim();
    if(!clean)throw new Error('Paste a member Limited Access API key.');
    const [basic,statsData,equipData,inventory,ammoData]=await Promise.all([
      apiRequest('/user/basic',clean),
      apiRequest('/user/battlestats',clean),
      apiRequest('/user/equipment',clean),
      fetchUserInventory(clean).catch(()=>[]),
      apiRequest('/user/ammo',clean).catch(()=>({ammo:[]}))
    ]);
    const memberId=extractUserId(basic);
    if(!memberId)throw new Error('Could not determine the player ID from this key.');
    const latest=await core.readLegacyState();
    const roster=latest?.factionInventory?.memberReadiness?.roster||{};
    if(Object.keys(roster).length&&!roster[memberId])throw new Error('Key resolves to player '+memberId+', who is not on the current faction roster.');
    const memberName=extractUsername(basic,memberId)||roster[memberId]?.memberName||memberId;
    const stats=battleStats(statsData);
    const total=Object.values(stats).reduce((a,b)=>a+b,0);
    if(!total)throw new Error('Battle stats parsed as zero; no profile was changed.');
    const items=equipmentItems(equipData);
    const summary=equipmentSummary(items);
    if(!summary)throw new Error('No equipped items could be parsed; no profile was changed.');
    const supply=memberSupply(inventory,ammoData,items);
    const verifiedAt=new Date().toISOString();

    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const previous=fi.memberReadiness.profiles[memberId]||{};
      fi.memberReadiness.profiles[memberId]={
        ...previous,memberId,stats,
        equipment:{...(previous.equipment||{}),summary,items,rawImported:false},
        supplyReadiness:supply,
        medicalStatus:supply.medicalKnown?'API INVENTORY':String(previous.medicalStatus||'UNKNOWN'),
        ipecacStatus:supply.medicalKnown?(num(supply.medical?.ipecac)>0?'READY':'NEEDS IPECAC'):String(previous.ipecacStatus||'UNKNOWN'),
        source:'MM Faction Armory member Limited Access API',
        verifiedAt
      };
      if(fi.memberReadiness.roster?.[memberId])fi.memberReadiness.roster[memberId].memberName=memberName;
      return draft;
    });

    if(save){
      const cryptoKey=await unlockVault(true);
      const vault=getVault();
      const sealed=await seal(cryptoKey,clean);
      vault.entries=vault.entries&&typeof vault.entries==='object'?vault.entries:{};
      vault.entries[memberId]={
        memberId,memberName,sealed,
        addedAt:vault.entries[memberId]?.addedAt||verifiedAt,
        updatedAt:verifiedAt,lastUsedAt:verifiedAt,lastError:'',lastErrorAt:null
      };
      vault.updatedAt=verifiedAt;saveVault(vault);
    }
    state=await core.readLegacyState();
    return {memberId,memberName,total,save};
  }

  async function refreshSavedMember(memberId){
    const id=asId(memberId),vault=getVault(),entry=vault?.entries?.[id];
    if(!entry)throw new Error('No saved Armory key for this member.');
    const cryptoKey=await unlockVault(false);
    const key=await unseal(cryptoKey,entry.sealed);
    try{
      const result=await importMemberKey(key,{save:false});
      if(asId(result.memberId)!==id)throw new Error('Key identity mismatch: expected '+id+' but Torn returned '+asId(result.memberId)+'.');
      entry.memberName=result.memberName;entry.lastUsedAt=new Date().toISOString();entry.updatedAt=entry.lastUsedAt;entry.lastError='';entry.lastErrorAt=null;
      vault.updatedAt=entry.updatedAt;saveVault(vault);
      return result;
    }catch(error){
      entry.lastError=error?.message||String(error);entry.lastErrorAt=new Date().toISOString();entry.updatedAt=entry.lastErrorAt;
      vault.updatedAt=entry.updatedAt;saveVault(vault);throw error;
    }
  }

  async function refreshAllSaved(){
    const vault=getVault();
    const ids=Object.keys(vault?.entries||{});
    if(!ids.length)throw new Error('No member keys are saved in MM Faction Armory yet.');
    let ok=0;const failures=[];
    for(const id of ids){
      try{await refreshSavedMember(id);ok++;}catch(error){failures.push((vault.entries[id]?.memberName||id)+': '+(error?.message||String(error)));}
    }
    state=await core.readLegacyState();
    return {ok,total:ids.length,failures};
  }

  function removeMemberKey(id){
    const vault=getVault(),key=asId(id);
    if(!vault?.entries?.[key])return false;
    if(!confirm('Remove the saved encrypted Armory API key for '+String(vault.entries[key].memberName||key)+'? Existing readiness data stays.'))return false;
    delete vault.entries[key];vault.updatedAt=new Date().toISOString();saveVault(vault);return true;
  }

  async function importMemberReply(memberId,raw){
    const id=asId(memberId);
    const latest=await core.readLegacyState();
    const member=latest?.factionInventory?.memberReadiness?.roster?.[id];
    if(!member)throw new Error('Faction member not found.');
    const parsed=logic.parseMemberReply(raw);
    const verifiedAt=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const previous=fi.memberReadiness.profiles[id]||{};
      const medicalKnown=[
        parsed.supply?.medical?.sfak,parsed.supply?.medical?.fak,
        parsed.supply?.medical?.morphine,parsed.supply?.medical?.emptyBloodBags
      ].some(value=>value!=null);
      const ipecac=parsed.supply?.medical?.ipecac;
      fi.memberReadiness.profiles[id]={
        ...previous,
        memberId:id,
        stats:parsed.stats,
        equipment:{
          ...(previous.equipment||{}),
          summary:parsed.equipmentSummary||String(previous.equipment?.summary||''),
          items:parsed.items.length?parsed.items:(previous.equipment?.items||[])
        },
        bloodType:parsed.bloodType||String(previous.bloodType||''),
        supplyReadiness:parsed.supply,
        warRole:parsed.warRole||String(previous.warRole||''),
        medicalStatus:medicalKnown?'DECLARED':String(previous.medicalStatus||'UNKNOWN'),
        ipecacStatus:ipecac==null?String(previous.ipecacStatus||'UNKNOWN'):(ipecac>0?'READY':'NEEDS IPECAC'),
        notes:parsed.notes||String(previous.notes||''),
        source:'member message reply',
        verifiedAt,
        dataReplyImportedAt:verifiedAt
      };
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:String(member.memberName||id),equipmentCount:parsed.items.length};
  }

  function copyText(text){
    if(navigator.clipboard?.writeText){
      return navigator.clipboard.writeText(text).catch(()=>{prompt('Copy this text:',text);});
    }
    prompt('Copy this text:',text);
    return Promise.resolve();
  }

  function missingDataRequest(){
    return 'Ranked War readiness: please send either a Limited Access Torn API key in a private Torn message, or screenshots showing (1) Strength, Defense, Speed and Dexterity, (2) equipped weapons and armor, and (3) war supplies/medical items. Screenshots must be resent as your stats or gear change; a Limited Access API key can be refreshed automatically. A Limited Access API key is read-only and cannot log in, spend money, move/sell items, attack, or change account settings.';
  }

  function memberRows(){
    return state?logic.memberRows(state.factionInventory||{},savedKeyIds()):[];
  }

  function membersHtml(){
    const rows=memberRows();
    const missing=rows.filter(r=>r.readinessStatus==='MISSING DATA'||r.readinessStatus==='STALE DATA').length;
    const vault=getVault();
    return card(
      '<div class="mm-fa-actions" style="justify-content:space-between;">'+
        '<div><b>Member readiness</b><div class="mm-fa-muted">'+rows.length+' members · '+missing+' missing/stale · '+savedKeyIds().length+' Armory keys saved</div></div>'+
        '<div class="mm-fa-actions"><button id="mm-fa-refresh-keys" style="'+button()+'">Refresh Saved Keys</button><button id="mm-fa-copy-request" style="'+button()+'">Copy Data Request</button></div>'+
      '</div>'+
      '<div class="mm-fa-grid" style="grid-template-columns:minmax(220px,1fr) auto auto;margin-top:8px;">'+
        '<input id="mm-fa-member-key" class="mm-fa-input" type="password" autocomplete="off" placeholder="Member Limited Access API key">'+
        '<button id="mm-fa-import-once" style="'+button()+'">Import Once</button>'+
        '<button id="mm-fa-import-save" style="'+button(true)+'">Import + Save</button>'+
      '</div>'
    )+
    (rows.length?rows.map(row=>{
      const s=row.stats||{};
      const source=String(row.profile?.source||'');
      const gear=String(row.equipmentSummary||'');
      const entry=vault?.entries?.[row.memberId];
      const statusClass=row.readinessStatus==='READY FOR REVIEW'?'mm-fa-good':row.readinessStatus==='MISSING DATA'?'mm-fa-bad':'mm-fa-warn';
      return '<div class="mm-fa-card">'+
        '<div class="mm-fa-row">'+
          '<div class="mm-fa-main">'+
            '<div><b>'+esc(row.memberName)+'</b> · Lv '+num(row.level)+' <span class="'+statusClass+'">· '+esc(row.readinessStatus)+'</span> '+(entry?'<span class="mm-fa-pill">API SAVED</span>':'')+'</div>'+
            '<div class="mm-fa-stats"><span>STR '+(row.hasStats?fmt(s.strength):'—')+'</span><span>DEF '+(row.hasStats?fmt(s.defense):'—')+'</span><span>SPD '+(row.hasStats?fmt(s.speed):'—')+'</span><span>DEX '+(row.hasStats?fmt(s.dexterity):'—')+'</span><b>Total '+(row.hasStats?fmt(row.statProfile.total):'—')+'</b></div>'+
            '<div class="mm-fa-muted">'+(source?esc(source)+' · '+when(row.profile?.verifiedAt):'No current readiness profile')+(row.loans?' · '+row.loans+' faction loan unit(s)':'')+'</div>'+
            (entry?.lastError?'<div class="mm-fa-bad mm-fa-mini">API error: '+esc(entry.lastError)+'</div>':'')+
            '<details style="margin-top:4px;"><summary class="mm-fa-mini" style="cursor:pointer;">Gear / supplies</summary>'+
              '<div class="mm-fa-mini" style="margin-top:4px;"><b>Equipped:</b> '+(gear?esc(gear):'—')+'</div>'+
              '<div class="mm-fa-mini"><b>Faction loans:</b> '+(row.loanItems.length?row.loanItems.map(i=>esc(i.name)+' x'+num(i.amount)).join(' | '):'—')+'</div>'+
              '<div class="mm-fa-mini"><b>Medical:</b> '+esc([
                'SFAK '+(row.profile?.supplyReadiness?.medical?.sfak??'—'),
                'FAK '+(row.profile?.supplyReadiness?.medical?.fak??'—'),
                'Morphine '+(row.profile?.supplyReadiness?.medical?.morphine??'—'),
                'Ipecac '+(row.profile?.supplyReadiness?.medical?.ipecac??'—')
              ].join(' · '))+'</div>'+
            '</details>'+
          '</div>'+
          '<div class="mm-fa-buttons">'+
            (entry?'<button data-refresh-member="'+esc(row.memberId)+'" style="'+button(true)+'">Refresh</button><button data-remove-member="'+esc(row.memberId)+'" style="'+button()+'">Remove Key</button>':'')+
            '<button data-paste-reply="'+esc(row.memberId)+'" style="'+button()+'">Paste Reply</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join(''):card('No faction roster is cached yet. Use Refresh Faction.'));
  }

  function buildsHtml(){
    const rows=memberRows();
    if(!rows.length)return card('No member roster is loaded.');
    return rows.map(row=>{
      const build=logic.compareMemberBuild(row,state?.factionInventory||{});
      return card(
        '<div><b>'+esc(row.memberName)+'</b> · Lv '+num(row.level)+' · '+(row.hasStats?fmt(row.statProfile.total)+' total stats':'stats missing')+'</div>'+
        '<div class="mm-fa-muted">'+esc(build.summary)+' · bias '+esc(build.bias)+'</div>'+
        '<details style="margin-top:5px;"><summary class="mm-fa-mini" style="cursor:pointer;">Current vs faction-stock target</summary>'+
          '<div style="margin-top:5px;">'+build.items.map(item=>{
            const cls=item.decision==='UPGRADE AVAILABLE'?'mm-fa-good':item.decision==='KEEP'?'':'mm-fa-warn';
            return '<div class="mm-fa-row" style="padding:5px 0;">'+
              '<div class="mm-fa-main"><b>'+esc(item.slot.toUpperCase())+'</b> · <span class="'+cls+'">'+esc(item.decision)+'</span>'+
                '<div class="mm-fa-muted">Current: '+esc(item.currentName||'—')+' · Target: '+esc(item.targetName||'—')+'</div></div>'+
            '</div>';
          }).join('')+'</div>'+
        '</details>'
      );
    }).join('');
  }

  function inventoryHtml(){
    const fi=state?.factionInventory||{};
    const current=Object.values(fi.current||{});
    const cats=['all',...logic.categories];
    const rows=current.filter(r=>selectedCategory==='all'||r.category===selectedCategory)
      .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    return card(
      '<div class="mm-fa-actions" style="justify-content:space-between;">'+
        '<div><b>Faction inventory</b><div class="mm-fa-muted">'+current.length+' item rows · source '+when(fi.lastSyncAt)+'</div></div>'+
        '<button id="mm-fa-refresh-faction" style="'+button(true)+'">Refresh Faction</button>'+
      '</div>'+
      '<div class="mm-fa-actions" style="margin-top:7px;">'+cats.map(cat=>'<button data-cat="'+esc(cat)+'" style="'+button(selectedCategory===cat)+'">'+esc(cat==='all'?'All':cat)+'</button>').join('')+'</div>'
    )+
    (rows.length?rows.map(row=>card(
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.name)+'</b><div class="mm-fa-muted">'+esc(row.category)+' · ID '+esc(row.itemId)+'</div></div>'+
      '<div class="mm-fa-mini" style="text-align:right;">Owned <b>'+fmt(row.amountOwned)+'</b><br>Available <b>'+fmt(row.availableCount)+'</b> · Loaned '+fmt(row.loanedCount)+'</div></div>'+
      (row.loans?.length?'<div class="mm-fa-muted">'+row.loans.map(l=>esc(l.memberName)+' x'+num(l.amount)).join(' | ')+'</div>':'')
    )).join(''):card('No items in this category.'));
  }

  function minimumsHtml(){
    const proposal=logic.minimumProposal(state?.factionInventory||{});
    const rows=proposal.proposals.slice().sort((a,b)=>(b.shortfall||0)-(a.shortfall||0)||String(a.category).localeCompare(String(b.category)));
    return card(
      '<div class="mm-fa-actions" style="justify-content:space-between;">'+
        '<div><b>Provisional minimums</b><div class="mm-fa-muted">'+proposal.rosterCount+' members · '+proposal.observedDays.toFixed(1)+' observed days · '+proposal.confidence+' confidence</div></div>'+
        '<button id="mm-fa-export" style="'+button(true)+'">Leadership Excel</button>'+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:6px;">Routine equipment pool: <b>'+proposal.poolMin+'</b> available per standard slot; proposed upper/war band <b>'+proposal.poolMax+'</b>. Stackables use 14-day observed depletion; critical medical/temp adds one-per-member reserve. Filled blood bags remain data-required.</div>'
    )+
    (rows.length?rows.map(row=>card(
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.item)+'</b><div class="mm-fa-muted">'+esc(row.category)+(row.slot?' · '+esc(row.slot):'')+' · '+esc(row.rationale)+'</div></div>'+
      '<div class="mm-fa-mini" style="text-align:right;">Current <b>'+fmt(row.current)+'</b><br>Min <b>'+(row.dataRequired?'DATA':fmt(row.recommendedMin))+'</b> · Max '+(row.dataRequired?'—':fmt(row.recommendedMax))+(row.dataRequired?'':' · Short '+fmt(row.shortfall))+'</div></div>'
    )).join(''):card('Not enough inventory/history data to calculate proposals.'));
  }

  function settingsHtml(){
    const keySaved=Boolean(factionKey());
    return card(
      '<b>Faction API</b><div class="mm-fa-muted">Stored only in this Faction Armory userscript. Required for Refresh Faction.</div>'+
      '<div class="mm-fa-grid" style="grid-template-columns:minmax(220px,1fr) auto auto;margin-top:7px;">'+
        '<input id="mm-fa-faction-key" class="mm-fa-input" type="password" autocomplete="off" placeholder="'+(keySaved?'Faction API key saved':'Faction-compatible Limited/custom API key')+'">'+
        '<button id="mm-fa-save-faction-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-fa-clear-faction-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:8px;">Member API keys use a separate encrypted Armory vault. Existing readiness profiles from the legacy CRM are read from shared Core state immediately; member keys are not copied between userscript namespaces as plaintext.</div>'
    );
  }

  function sourceStrip(){
    const fi=state?.factionInventory||{};
    return '<div class="mm-fa-muted" style="margin-bottom:6px;">Faction cache '+when(fi.lastSyncAt)+' · roster '+when(fi.memberReadiness?.lastRosterSyncAt)+' · '+Object.keys(fi.current||{}).length+' inventory rows</div>';
  }

  function createPanel(){
    if(document.getElementById(ROOT_ID))return;
    injectStyle();
    const root=document.createElement('div');
    root.id=ROOT_ID;
    document.body.appendChild(root);
  }

  function render(){
    const root=document.getElementById(ROOT_ID);
    if(!root||root.style.display==='none')return;
    const viewHtml=activeView==='members'?membersHtml()
      :activeView==='builds'?buildsHtml()
      :activeView==='inventory'?inventoryHtml()
      :activeView==='minimums'?minimumsHtml()
      :settingsHtml();
    root.innerHTML=
      '<div class="mm-fa-head"><div><b style="font-size:15px;">MM Faction Armory</b><div class="mm-fa-muted">v'+VERSION+' · task-first faction readiness</div></div><button id="mm-fa-close" style="'+button()+'">×</button></div>'+
      '<div class="mm-fa-body">'+
        '<div class="mm-fa-tabs">'+
          '<button data-view="members" style="'+button(activeView==='members')+'">Members</button>'+
          '<button data-view="builds" style="'+button(activeView==='builds')+'">Builds</button>'+
          '<button data-view="inventory" style="'+button(activeView==='inventory')+'">Stock</button>'+
          '<button data-view="minimums" style="'+button(activeView==='minimums')+'">Minimums</button>'+
          '<button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div class="mm-fa-status">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<span class="mm-fa-bad"><b>Shared state unavailable:</b> '+esc(loadError)+'</span>'):'')+
        '<div class="mm-fa-scroll">'+viewHtml+'</div>'+
      '</div>';

    root.querySelector('#mm-fa-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'members';render();}));
    root.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{selectedCategory=b.dataset.cat||'all';render();}));
    root.querySelector('#mm-fa-refresh-faction')?.addEventListener('click',refreshFaction);
    root.querySelector('#mm-fa-copy-request')?.addEventListener('click',()=>copyText(missingDataRequest()).then(()=>{statusText='Member data request copied.';render();}));
    root.querySelector('#mm-fa-import-once')?.addEventListener('click',()=>importFromField(false));
    root.querySelector('#mm-fa-import-save')?.addEventListener('click',()=>importFromField(true));
    root.querySelector('#mm-fa-refresh-keys')?.addEventListener('click',async()=>{
      if(busy)return;busy=true;statusText='Refreshing saved member keys…';render();
      try{
        const result=await refreshAllSaved();
        statusText='Saved key refresh: '+result.ok+'/'+result.total+' succeeded'+(result.failures.length?' · '+result.failures.length+' failed':'')+'.';
      }catch(error){statusText='Saved key refresh failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    });
    root.querySelectorAll('[data-refresh-member]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;busy=true;statusText='Refreshing '+b.dataset.refreshMember+'…';render();
      try{const r=await refreshSavedMember(b.dataset.refreshMember);statusText='Refreshed '+r.memberName+' ['+r.memberId+'].';}
      catch(error){statusText='Member refresh failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-remove-member]').forEach(b=>b.addEventListener('click',()=>{
      if(removeMemberKey(b.dataset.removeMember)){statusText='Saved member key removed; readiness data preserved.';render();}
    }));
    root.querySelectorAll('[data-paste-reply]').forEach(b=>b.addEventListener('click',async()=>{
      const id=asId(b.dataset.pasteReply);
      const row=memberRows().find(x=>x.memberId===id);
      const raw=prompt('Paste '+String(row?.memberName||id)+'\'s completed readiness reply:','');
      if(raw==null||!String(raw).trim())return;
      if(busy)return;busy=true;statusText='Importing member reply…';render();
      try{
        const result=await importMemberReply(id,raw);
        statusText='Imported reply for '+result.memberName+' · '+result.equipmentCount+' equipped item(s) parsed.';
      }catch(error){statusText='Reply import failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelector('#mm-fa-save-faction-key')?.addEventListener('click',()=>{
      const value=String(root.querySelector('#mm-fa-faction-key')?.value||'').trim();
      if(!value){statusText='Enter a faction-compatible API key first.';render();return;}
      GM_setValue(FACTION_API_KEY,value);statusText='Faction Armory API key saved.';render();
    });
    root.querySelector('#mm-fa-clear-faction-key')?.addEventListener('click',()=>{
      GM_deleteValue(FACTION_API_KEY);statusText='Faction Armory API key cleared.';render();
    });
    root.querySelector('#mm-fa-export')?.addEventListener('click',exportLeadershipExcel);
  }

  async function importFromField(save){
    if(busy)return;
    const root=document.getElementById(ROOT_ID);
    const input=root?.querySelector('#mm-fa-member-key');
    const key=String(input?.value||'').trim();
    if(!key){statusText='Paste a member Limited Access API key first.';render();return;}
    busy=true;statusText='Importing member readiness data…';render();
    try{
      const result=await importMemberKey(key,{save});
      if(input)input.value='';
      statusText='Imported '+result.memberName+' ['+result.memberId+']'+(save?' and saved key encrypted.':'. Key was not saved.');
    }catch(error){statusText='Member import failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function xmlCell(value,type='String'){
    const safe=esc(String(value??''));
    return '<Cell><Data ss:Type="'+type+'">'+safe+'</Data></Cell>';
  }
  function xmlSheet(name,headers,rows){
    return '<Worksheet ss:Name="'+esc(name).slice(0,31)+'"><Table>'+
      '<Row>'+headers.map(h=>xmlCell(h)).join('')+'</Row>'+
      rows.map(row=>'<Row>'+headers.map(h=>{
        const v=row[h];
        return xmlCell(v,typeof v==='number'&&Number.isFinite(v)?'Number':'String');
      }).join('')+'</Row>').join('')+
      '</Table></Worksheet>';
  }

  function exportLeadershipExcel(){
    if(!state){statusText='Load shared state first.';render();return;}
    const members=memberRows();
    const minimums=logic.minimumProposal(state.factionInventory||{});
    const inventory=Object.values(state.factionInventory?.current||{});
    const summaryHeaders=['Metric','Value'];
    const summary=[
      {Metric:'Generated',Value:new Date().toISOString()},
      {Metric:'Faction members',Value:members.length},
      {Metric:'Ready for review',Value:members.filter(r=>r.readinessStatus==='READY FOR REVIEW').length},
      {Metric:'Missing / stale',Value:members.filter(r=>r.readinessStatus==='MISSING DATA'||r.readinessStatus==='STALE DATA').length},
      {Metric:'Armory member API keys saved',Value:savedKeyIds().length},
      {Metric:'Inventory rows',Value:inventory.length},
      {Metric:'Observed inventory days',Value:Number(minimums.observedDays.toFixed(1))},
      {Metric:'Minimum proposal shortfalls',Value:minimums.actionable.length},
      {Metric:'Minimum proposal data-required',Value:minimums.dataRequired.length}
    ];
    const memberHeaders=['Member ID','Member','Level','API Saved','Readiness','Strength','Defense','Speed','Dexterity','Total','Equipment','Faction Loans','Source','Verified At'];
    const memberData=members.map(r=>({
      'Member ID':r.memberId,'Member':r.memberName,'Level':num(r.level),'API Saved':r.apiSaved?'YES':'NO','Readiness':r.readinessStatus,
      'Strength':r.hasStats?num(r.stats?.strength):'','Defense':r.hasStats?num(r.stats?.defense):'','Speed':r.hasStats?num(r.stats?.speed):'','Dexterity':r.hasStats?num(r.stats?.dexterity):'','Total':r.hasStats?num(r.statProfile.total):'',
      'Equipment':r.equipmentSummary,'Faction Loans':r.loanItems.map(i=>i.name+' x'+i.amount).join(' | '),'Source':String(r.profile?.source||''),'Verified At':String(r.profile?.verifiedAt||'')
    }));
    const invHeaders=['Category','Item ID','Item','Owned','Available','Loaned','Damage','Accuracy','Armor'];
    const invData=inventory.map(r=>({'Category':r.category,'Item ID':r.itemId,'Item':r.name,'Owned':num(r.amountOwned),'Available':num(r.availableCount),'Loaned':num(r.loanedCount),'Damage':num(r.damage),'Accuracy':num(r.accuracy),'Armor':num(r.armorRating)}));
    const minHeaders=['Category','Item / Pool','Current','Loaned','Proposed Min','Proposed Max','Shortfall','Data Required','Rationale'];
    const minData=minimums.proposals.map(r=>({'Category':r.category,'Item / Pool':r.item,'Current':num(r.current),'Loaned':num(r.loaned),'Proposed Min':r.dataRequired?'':num(r.recommendedMin),'Proposed Max':r.dataRequired?'':num(r.recommendedMax),'Shortfall':r.dataRequired?'':num(r.shortfall),'Data Required':r.dataRequired?'YES':'NO','Rationale':r.rationale}));
    const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'+
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
      xmlSheet('Summary',summaryHeaders,summary)+
      xmlSheet('Members',memberHeaders,memberData)+
      xmlSheet('Inventory',invHeaders,invData)+
      xmlSheet('Minimums',minHeaders,minData)+
      '</Workbook>';
    const blob=new Blob([xml],{type:'application/vnd.ms-excel'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='OBSIDIAN_FORCE_Faction_Readiness_'+new Date().toISOString().slice(0,10)+'.xml';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    statusText='Leadership Excel workbook exported.';render();
  }

  function open(){
    createPanel();
    const root=document.getElementById(ROOT_ID),launcher=document.getElementById(LAUNCHER_ID);
    root.style.display='block';if(launcher)launcher.style.display='none';
    render();reloadState();
  }
  function close(){
    const root=document.getElementById(ROOT_ID),launcher=document.getElementById(LAUNCHER_ID);
    if(root)root.style.display='none';if(launcher)launcher.style.display='block';
  }
  function createLauncher(){
    if(!document.body||document.getElementById(LAUNCHER_ID))return;
    injectStyle();
    const b=document.createElement('button');
    b.id=LAUNCHER_ID;b.textContent='Armory';
    b.style.cssText='position:fixed;right:0;top:250px;z-index:2147483647;'+button(true)+'border-radius:6px 0 0 6px;';
    b.addEventListener('click',open);document.body.appendChild(b);
  }

  function installChannel(){
    if(typeof BroadcastChannel==='undefined'||channel)return;
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.addEventListener('message',event=>{
        if(event?.data?.type==='state-updated'&&['faction','core'].includes(String(event.data.domain||''))){
          reloadState().catch(()=>{});
        }
      });
    }catch{}
  }

  if(document.body)createLauncher();
  else window.addEventListener('DOMContentLoaded',createLauncher,{once:true});
  installChannel();
})();