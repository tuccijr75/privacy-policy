// ==UserScript==
// @name         MM Torn Faction Armory
// @namespace    manic-mike.torn.faction-armory
// @version      8.0.0-alpha.24.8
// @description  Modular faction inventory, member readiness, builds, minimums and leadership reporting.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@9af1c84f189141be77ef0d2c86d86513db5978ed/modular-suite/core/MM_Torn_Core.js
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@1e24b83e6507e4e029da3fbbc8aae518f1de42ee/modular-suite/faction-armory/MM_Faction_Armory.logic.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

(() => {
  'use strict';

  const VERSION='8.0.0-alpha.24.8';
  const ROOT_ID='mm-faction-armory';
  const LAUNCHER_ID='mm-faction-armory-launcher';
  const STYLE_ID='mm-faction-armory-style';
  const FACTION_API_KEY='mm_faction_armory_api_v1';
  const MEMBER_VAULT_KEY='mm_faction_armory_member_vault_v1';
  const MEMBER_VAULT_ITERATIONS=250000;
  const STOCK_MODE_KEY='mm_faction_armory_stock_mode_v1';
  const PROCUREMENT_MODE_KEY='mm_faction_armory_procurement_mode_v1';
  const ACQUISITION_BUDGET_KEY='mm_faction_armory_acquisition_budget_v1';
  const API_BASE='https://api.torn.com/v2';
  const CHANNEL='mm_bazaar_crm_cross_tab_v1';
  const AUTO_CHECK_MS=5*60*1000;
  const FACTION_STALE_FALLBACK_MS=60*60*1000;
  const AUTO_MEMBER_BATCH=2;
  const PUBLIC_INTEL_BATCH=20;
  const PUBLIC_INTEL_MAX_AGE_MS=24*60*60*1000;
  const WAR_OPPONENT_INTEL_MAX_AGE_MS=6*60*60*1000;
  const ARMORY_COMPOSE_KEY='mm_faction_armory_compose_v1';
  const REMINDER_SENT_KEY='mm_faction_armory_reminder_sent_v1';
  const MEMBER_MESSAGE_LOG_KEY='mm_faction_armory_member_message_log_v1';
  const ARMORY_COMPOSE_TTL_MS=2*60*1000;
  const ARMORY_SEND_CONFIRM_MS=15*1000;

  const core=globalThis.MMTornCore;
  const logic=globalThis.MMTornFactionLogic;

  let state=null;
  let activeView='members';
  let statusText='Ready.';
  let loadError='';
  let busy=false;
  let selectedCategory='all';
  let selectedBuildMemberId='';
  let editingEquipmentMemberId='';
  let stockMode=String(GM_getValue(STOCK_MODE_KEY,'war')||'war').toLowerCase()==='peace'?'peace':'war';
  let procurementMode=['budget','standard','ideal'].includes(String(GM_getValue(PROCUREMENT_MODE_KEY,'budget')||'').toLowerCase())?String(GM_getValue(PROCUREMENT_MODE_KEY,'budget')).toLowerCase():'budget';
  let acquisitionBudget=Math.max(0,Number(GM_getValue(ACQUISITION_BUDGET_KEY,15000000))||15000000);
  let vaultSession=null;
  let channel=null;
  let autoRefreshRunning=false;
  let autoRefreshTimer=null;
  let equipmentOptionPriceMemo=new Map();

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
      #${ROOT_ID}{display:none;position:fixed;right:12px;top:72px;z-index:2147483646;width:min(900px,calc(100vw - 24px));max-height:calc(100vh - 92px);overflow:hidden;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.25 Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} button{min-height:26px;height:auto;line-height:1.05;padding:5px 8px;font-size:11px}
      .mm-fa-head{height:40px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 7px;gap:6px}
      .mm-fa-body{padding:5px}
      .mm-fa-tabs,.mm-fa-actions,.mm-fa-tiles{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
      .mm-fa-scroll{max-height:calc(100vh - 190px);overflow:auto;padding-right:2px}
      .mm-fa-card{border:1px solid #353535;background:#171717;border-radius:6px;padding:6px;margin-bottom:4px}
      .mm-fa-card.mm-fa-compact{padding:5px 6px}
      .mm-fa-row{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;border-top:1px solid #303030;padding:5px 0}
      .mm-fa-row:first-child{border-top:0}
      .mm-fa-main{min-width:0;flex:1 1 auto}
      .mm-fa-buttons{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
      .mm-fa-muted{font-size:9px;color:#888}
      .mm-fa-mini{font-size:10px;color:#aaa}
      .mm-fa-stats{display:flex;gap:4px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-top:3px}
      .mm-fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,max-content));gap:4px;align-items:start}
      .mm-fa-input{width:100%;background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:5px 6px;font:11px Arial,sans-serif;min-height:27px}
      .mm-fa-status{padding:4px 6px;background:#151515;border:1px solid #333;border-radius:4px;color:#d7ad4b;margin:4px 0;white-space:normal;font-size:10px}
      .mm-fa-pill{display:inline-block;border:1px solid #444;border-radius:999px;padding:1px 5px;font-size:9px;margin:1px 2px 0 0;color:#bbb}
      .mm-fa-tile{display:inline-flex;flex-direction:column;justify-content:center;gap:1px;width:max-content;max-width:100%;min-width:58px;padding:4px 6px;border:1px solid #353535;background:#121212;border-radius:5px}
      .mm-fa-tile-wide{min-width:120px;max-width:100%;white-space:normal}
      .mm-fa-tile-label{font-size:8px;line-height:1;color:#777;text-transform:uppercase;letter-spacing:.25px}
      .mm-fa-tile-value{font-size:10px;line-height:1.15;color:#ddd;font-weight:600;white-space:nowrap}
      .mm-fa-module-head{display:flex;gap:5px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:4px}
      .mm-fa-member-head{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
      .mm-fa-modal-backdrop{position:fixed;inset:0;background:#000b;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px}
      .mm-fa-modal{width:min(860px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#141414;border:1px solid #6b5a2e;border-radius:8px;box-shadow:0 14px 40px #000;padding:8px}
      .mm-fa-override-slot{border:1px solid #383838;border-radius:6px;padding:6px;margin-top:5px;background:#111}
      .mm-fa-override-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:5px;margin-top:5px}
      .mm-fa-details{margin-top:3px;border-top:1px solid #2b2b2b;padding-top:3px}
      .mm-fa-details summary{cursor:pointer;font-size:9px;color:#999}
      .mm-fa-slot-grid{display:flex;gap:4px;flex-wrap:wrap;align-items:stretch;margin-top:4px}
      .mm-fa-slot{display:flex;flex-direction:column;gap:2px;min-width:138px;max-width:220px;padding:5px 6px;border:1px solid #303030;background:#121212;border-radius:5px}
      .mm-fa-build-member{border:1px solid #353535;background:#171717;border-radius:6px;margin-bottom:3px}
      .mm-fa-build-member>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;min-height:27px}
      .mm-fa-build-member>summary::-webkit-details-marker{display:none}
      .mm-fa-build-member>summary:before{content:'▸';color:#777;font-size:10px;flex:0 0 auto}
      .mm-fa-build-member[open]>summary:before{content:'▾'}
      .mm-fa-build-summary-main{display:flex;gap:5px;align-items:center;flex-wrap:wrap;min-width:0;flex:1 1 auto}
      .mm-fa-build-body{border-top:1px solid #303030;padding:5px 7px}
      .mm-fa-good{color:#a7d7ad}.mm-fa-warn{color:#e5c879}.mm-fa-bad{color:#efaaa3}
      @media(max-width:620px){
        #${ROOT_ID}{right:4px;top:54px;width:calc(100vw - 8px);max-height:calc(100vh - 60px)}
        .mm-fa-scroll{max-height:calc(100vh - 180px)}
        .mm-fa-tile{min-width:52px}
        .mm-fa-slot{min-width:125px;max-width:100%}
      }`;
    document.head.appendChild(style);
  }

  function button(primary=false){
    return 'border:1px solid '+(primary?'#9a7b35':'#555')+';background:'+(primary?'#d9ad42':'#252525')+';color:'+(primary?'#111':'#eee')+';border-radius:5px;padding:5px 8px;cursor:pointer;font:11px Arial,sans-serif;font-weight:'+(primary?'700':'500')+';';
  }

  function card(html){return '<div class="mm-fa-card">'+html+'</div>';}

  function tile(label,value,{wide=false,cls=''}={}){
    return '<span class="mm-fa-tile'+(wide?' mm-fa-tile-wide':'')+' '+cls+'">'+
      '<span class="mm-fa-tile-label">'+esc(label)+'</span>'+
      '<span class="mm-fa-tile-value">'+esc(value==null||value===''?'—':value)+'</span>'+
    '</span>';
  }

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
            type:String(raw?.type||raw?.category||''),
            subType:String(raw?.sub_type??raw?.subType??raw?.weapon_type??''),
            slot:String(raw?.slot??raw?.weapon_slot??''),
            weaponType:String(raw?.weapon_type??raw?.weaponType??''),
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
        daysInFaction:num(raw?.days_in_faction??raw?.daysInFaction),
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

  function factionLeadershipFromResponse(data,rosterRows=[]){
    const root=(data?.basic??data?.faction??data)||{};
    const leaderId=asId(root?.leader_id??root?.leaderId);
    const coLeaderId=asId(root?.co_leader_id??root?.coLeaderId);
    const byId=new Map((rosterRows||[]).map(row=>[asId(row.memberId),row]));
    return {
      factionId:asId(root?.id),
      factionName:String(root?.name||''),
      leaderId,
      leaderName:String(byId.get(leaderId)?.memberName||leaderId),
      coLeaderId,
      coLeaderName:String(byId.get(coLeaderId)?.memberName||coLeaderId),
      fetchedAt:new Date().toISOString()
    };
  }

  function currentRankedWarFromResponse(data,factionId){
    const ranked=data?.wars?.ranked??data?.ranked??data?.data?.wars?.ranked??null;
    if(!ranked||typeof ranked!=='object')return null;
    const factions=Array.isArray(ranked.factions)?ranked.factions:[];
    const ownId=asId(factionId);
    const own=factions.find(row=>asId(row?.id)===ownId)||null;
    const opponent=factions.find(row=>asId(row?.id)!==ownId)||null;
    if(!opponent)return null;
    return {
      warId:asId(ranked?.war_id??ranked?.id),
      start:Number(ranked?.start||0)||0,
      end:ranked?.end==null?null:Number(ranked.end)||null,
      target:num(ranked?.target),
      winner:ranked?.winner==null?'':asId(ranked.winner),
      ownFactionId:ownId,
      ownFactionName:String(own?.name||''),
      ownScore:num(own?.score),
      opponentFactionId:asId(opponent?.id),
      opponentFactionName:String(opponent?.name||opponent?.id||''),
      opponentScore:num(opponent?.score),
      fetchedAt:new Date().toISOString(),
      source:'Torn /faction/wars'
    };
  }

  async function fetchOpponentPublicIntel(member,key){
    const id=asId(member?.memberId);
    if(!id)throw new Error('Opponent member ID is required.');
    const data=await apiRequest('/user/'+encodeURIComponent(id)+'/profile',key);
    const profile=publicProfileRoot(data);
    const intel={
      memberId:id,
      memberName:String(profile?.name||member?.memberName||id),
      level:num(profile?.level??member?.level),
      rank:String(profile?.rank||''),
      ageDays:num(profile?.age),
      fetchedAt:new Date().toISOString(),
      source:'Torn public profile'
    };
    const estimate=logic.estimateBalancedBattleStats(member,intel);
    return {
      ...intel,
      statEstimate:estimate,
      estimatedTotal:num(estimate?.total),
      estimateConfidence:String(estimate?.confidence||'LOW')
    };
  }

  async function refreshWarPlanning(key,leadership,warsData,{force=false}={}){
    const war=currentRankedWarFromResponse(warsData,leadership?.factionId);
    if(!war){
      await core.updateDomainState('faction',draft=>{
        const fi=draft.factionInventory;
        fi.warPlanning=fi.warPlanning&&typeof fi.warPlanning==='object'?fi.warPlanning:{schema:1};
        fi.warPlanning.schema=1;
        fi.warPlanning.currentWar=null;
        fi.warPlanning.lastWarCheckAt=new Date().toISOString();
        return draft;
      });
      state=await core.readLegacyState();
      return {war:null,opponentMembers:0,estimated:0,refreshed:0};
    }

    const opponentData=await apiRequest('/faction/'+encodeURIComponent(war.opponentFactionId)+'/members',key);
    const roster=factionMembersFromResponse(opponentData);
    const latest=await core.readLegacyState();
    const previous=latest?.factionInventory?.warPlanning?.opponent;
    const sameOpponent=asId(previous?.factionId)===war.opponentFactionId;
    const priorMembers=sameOpponent&&previous?.members&&typeof previous.members==='object'?previous.members:{};
    const now=Date.now();
    const refreshCandidates=roster.filter(member=>{
      const prior=priorMembers[member.memberId];
      const fetched=Date.parse(prior?.fetchedAt||'')||0;
      return force||!prior||!n(prior?.estimatedTotal)||now-fetched>=WAR_OPPONENT_INTEL_MAX_AGE_MS||num(prior?.level)!==num(member.level);
    });
    const results=await mapLimit(refreshCandidates,3,member=>fetchOpponentPublicIntel(member,key));
    const refreshed=new Map(results.filter(row=>row.status==='fulfilled').map(row=>[asId(row.value.memberId),row.value]));
    const members={};
    for(const member of roster){
      const id=asId(member.memberId);
      const fresh=refreshed.get(id);
      const prior=priorMembers[id];
      members[id]=fresh||prior||{
        ...member,
        statEstimate:null,
        estimatedTotal:0,
        estimateConfidence:'NONE',
        fetchedAt:'',
        source:'Torn faction member only'
      };
      members[id].memberId=id;
      members[id].memberName=String(members[id].memberName||member.memberName||id);
      members[id].level=num(members[id].level??member.level);
      members[id].status=String(member.status||members[id].status||'');
    }

    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.warPlanning=fi.warPlanning&&typeof fi.warPlanning==='object'?fi.warPlanning:{schema:1};
      fi.warPlanning.schema=1;
      fi.warPlanning.currentWar=war;
      fi.warPlanning.lastWarCheckAt=new Date().toISOString();
      fi.warPlanning.opponent={
        factionId:war.opponentFactionId,
        factionName:war.opponentFactionName,
        warId:war.warId,
        members,
        fetchedAt:new Date().toISOString(),
        source:'Torn /faction/{id}/members + public user profile estimates',
        failedProfiles:results.filter(row=>row.status==='rejected').length
      };
      fi.warPlanning.xanaxPolicy=fi.warPlanning.xanaxPolicy&&typeof fi.warPlanning.xanaxPolicy==='object'
        ?fi.warPlanning.xanaxPolicy:{investmentPosture:'conserve'};
      return draft;
    });
    state=await core.readLegacyState();
    return {
      war,
      opponentMembers:roster.length,
      estimated:Object.values(members).filter(row=>num(row.estimatedTotal)>0).length,
      refreshed:refreshed.size,
      failed:results.filter(row=>row.status==='rejected').length
    };
  }

  function publicProfileRoot(data){
    return data?.profile&&typeof data.profile==='object'?data.profile:(data||{});
  }

  function publicPopularStatsRoot(data){
    return data?.personalstats&&typeof data.personalstats==='object'?data.personalstats:(data||{});
  }

  async function fetchPublicMemberIntel(member,key){
    const id=asId(member?.memberId);
    if(!id)throw new Error('Member ID is required for public profile lookup.');
    const [profileResult,statsResult]=await Promise.allSettled([
      apiRequest('/user/'+encodeURIComponent(id)+'/profile',key),
      apiRequest('/user/'+encodeURIComponent(id)+'/personalstats?cat=popular',key)
    ]);
    const profile=profileResult.status==='fulfilled'?publicProfileRoot(profileResult.value):{};
    const popular=statsResult.status==='fulfilled'?publicPopularStatsRoot(statsResult.value):{};
    if(!Object.keys(profile).length&&!Object.keys(popular).length){
      throw new Error('No public profile data returned for '+id+'.');
    }
    return {
      memberId:id,
      memberName:String(profile?.name||member?.memberName||id),
      level:num(profile?.level??member?.level),
      rank:String(profile?.rank||''),
      ageDays:num(profile?.age),
      signedUp:Number(profile?.signed_up||0)||0,
      awards:num(profile?.awards),
      activitySeconds:popular?.other?.activity?.time==null?null:num(popular.other.activity.time),
      crimesTotal:popular?.crimes?.total==null?null:num(popular.crimes.total),
      networth:popular?.networth?.total==null?null:num(popular.networth.total),
      daysInFaction:num(member?.daysInFaction),
      position:String(member?.position||''),
      fetchedAt:new Date().toISOString(),
      source:'Torn public profile + popular personalstats'
    };
  }

  async function refreshMissingPublicIntel(rosterRows,key){
    const latest=await core.readLegacyState();
    const profiles=latest?.factionInventory?.memberReadiness?.profiles||{};
    const now=Date.now();
    const candidates=(rosterRows||[]).filter(member=>{
      const profile=profiles[asId(member.memberId)]||{};
      const actual=logic.battleProfile(profile?.stats||{});
      if(actual.total>0)return false;
      const fetched=Date.parse(profile?.publicIntel?.fetchedAt||'')||0;
      return !fetched||now-fetched>=PUBLIC_INTEL_MAX_AGE_MS;
    }).slice(0,PUBLIC_INTEL_BATCH);
    if(!candidates.length)return {attempted:0,updated:0,failed:0};

    const results=await mapLimit(candidates,3,member=>fetchPublicMemberIntel(member,key));
    const successful=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
    if(successful.length){
      await core.updateDomainState('faction',draft=>{
        const fi=draft.factionInventory;
        fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
        fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
        for(const intel of successful){
          const id=asId(intel.memberId);
          const previous=fi.memberReadiness.profiles[id]||{};
          fi.memberReadiness.profiles[id]={...previous,memberId:id,publicIntel:intel};
        }
        return draft;
      });
    }
    return {
      attempted:candidates.length,
      updated:successful.length,
      failed:results.filter(result=>result.status==='rejected').length
    };
  }

  function tornItemsRows(data){
    let rows=data?.items??data?.data?.items??data?.data??[];
    if(rows&&typeof rows==='object'&&!Array.isArray(rows))rows=Object.entries(rows).map(([id,row])=>({id,...(row||{})}));
    return Array.isArray(rows)?rows:[];
  }

  function equipmentMarketCatalogFromResponse(data,fetchedAt=Date.now()){
    const wanted=new Set([
      ...(logic?.equipmentOptionCatalog||[]).map(item=>String(item?.name||'').trim().toLowerCase()),
      ...(logic?.warStockItemDefs||[]).map(item=>String(item?.name||'').trim().toLowerCase())
    ].filter(Boolean));
    const byName={},byId={};
    for(const raw of tornItemsRows(data)){
      const name=String(raw?.name??raw?.item_name??raw?.item?.name??'').trim();
      if(!name||!wanted.has(name.toLowerCase()))continue;
      const itemId=asId(raw?.id??raw?.item_id??raw?.item?.id);
      const marketPrice=num(raw?.market_price??raw?.marketPrice??raw?.market_value??raw?.marketValue??raw?.value?.market_price??raw?.value?.market_value);
      const row={itemId,name,type:String(raw?.type??raw?.category??raw?.item?.type??''),marketPrice,fetchedAt:new Date(fetchedAt).toISOString(),source:'Torn items market_price'};
      byName[name.toLowerCase()]=row;
      if(itemId)byId[itemId]=row;
    }
    return {byName,byId,fetchedAt:new Date(fetchedAt).toISOString()};
  }

  async function refreshFaction(){
    if(busy)return;
    const key=factionKey();
    if(!key){activeView='settings';statusText='Save a faction-compatible API key first.';render();return;}
    busy=true;statusText='Refreshing all 9 armory categories + roster…';render();
    try{
      const [categoryResults,membersData,basicData,tornItemsData,warsData]=await Promise.all([
        mapLimit(logic.categories,3,fetchFactionCategory),
        apiRequest('/faction/members',key),
        apiRequest('/faction/basic',key),
        apiRequest('/torn/items?cat=All&sort=ASC',key).catch(()=>null),
        apiRequest('/faction/wars',key).catch(()=>null)
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
      const leadership=factionLeadershipFromResponse(basicData,rosterRows);
      const equipmentMarketCatalog=tornItemsData?equipmentMarketCatalogFromResponse(tornItemsData,fetchedAt):null;

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
        next.leadership=leadership;
        if(equipmentMarketCatalog&&Object.keys(equipmentMarketCatalog.byName||{}).length)next.equipmentMarketCatalog=equipmentMarketCatalog;
        draft.factionInventory=next;
        return draft;
      });
      let publicIntel={attempted:0,updated:0,failed:0};
      try{publicIntel=await refreshMissingPublicIntel(rosterRows,key);}
      catch(error){console.warn('[MM Faction Armory] public member intel refresh failed',error);}
      let warIntel={war:null,opponentMembers:0,estimated:0,refreshed:0,failed:0};
      if(warsData){
        try{warIntel=await refreshWarPlanning(key,leadership,warsData);}
        catch(error){
          console.warn('[MM Faction Armory] rival war intel refresh failed',error);
          await core.updateDomainState('faction',draft=>{
            const fi=draft.factionInventory;
            fi.warPlanning=fi.warPlanning&&typeof fi.warPlanning==='object'?fi.warPlanning:{schema:1};
            fi.warPlanning.lastError=String(error?.message||error);
            fi.warPlanning.lastWarCheckAt=new Date().toISOString();
            return draft;
          });
        }
      }
      state=await core.readLegacyState();
      const pricedOptions=Object.keys(state?.factionInventory?.equipmentMarketCatalog?.byName||{}).length;
      statusText='Faction refreshed: '+Object.keys(current).length+' item rows · '+rosterRows.length+' current members'+
        (pricedOptions?' · '+pricedOptions+' market references':'')+
        (publicIntel.attempted?' · public estimates '+publicIntel.updated+'/'+publicIntel.attempted+(publicIntel.failed?' ('+publicIntel.failed+' failed)':''):'')+
        (warIntel.war?' · rival '+warIntel.war.opponentFactionName+' '+warIntel.estimated+'/'+warIntel.opponentMembers+' estimated':' · no current ranked rival')+'.';
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
      const rawSlot=item.slot??item.slot_id??itemObj.slot;
      const slotText=String(rawSlot??'').trim();
      const semantic=(subType&&!/^\d+$/.test(subType)?subType:type&&!/^\d+$/.test(type)?type:slotText&&!/^\d+$/.test(slotText)?slotText:fallback);
      if(!name&&!id)return;
      const key=uid||[id,slotText||semantic,name].join('|');
      if(seen.has(key))return;
      seen.add(key);
      const stats=item.stats&&typeof item.stats==='object'?item.stats:(itemObj.stats&&typeof itemObj.stats==='object'?itemObj.stats:{});
      const parsedSlot=Number(rawSlot);
      const normalized={
        uid,itemId:id,name,
        slotId:Number.isInteger(parsedSlot)?parsedSlot:null,
        slot:semantic,type,subType,
        damage:num(item.damage??stats.damage),
        accuracy:num(item.accuracy??stats.accuracy),
        armor:num(item.armor??stats.armor??stats.protection),
        armorRating:num(item.armor??stats.armor??stats.protection),
        quality:num(item.quality??stats.quality),
        bonuses:item.bonuses&&typeof item.bonuses==='object'?item.bonuses:(itemObj.bonuses&&typeof itemObj.bonuses==='object'?itemObj.bonuses:null),
        mods:Array.isArray(item.mods)?item.mods.map(m=>({id:asId(m?.id),name:String(m?.name||'')})):[]
      };
      normalized.slot=logic?.equipmentSlot?.(normalized)||semantic;
      rows.push(normalized);
    };
    for(const item of Array.isArray(data?.equipment)?data.equipment:[])push('',item);
    // Torn clothing is cosmetic/non-combat data. Do not let a clothing name satisfy
    // a combat armor slot; readiness is derived only from /user/equipment equipment.
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

  function ownedEquipmentFromInventory(inventory){
    const rows=Array.isArray(inventory)?inventory:[];
    const items=[];
    const seen=new Set();
    for(const raw of rows){
      const itemObj=raw?.item&&typeof raw.item==='object'?raw.item:{};
      const ownership=String(raw?.ownership??raw?.owner_type??raw?.source??raw?.owner??'').toLowerCase();
      const factionOwned=Boolean(raw?.faction_id??raw?.faction?.id??raw?.is_faction??raw?.loaned?.id)||/faction/.test(ownership);
      if(factionOwned)continue;
      const name=String(raw?.name??itemObj?.name??'').trim();
      if(!name)continue;
      const quantity=Math.max(0,Number(raw?.amount??raw?.quantity??raw?.qty??1)||0);
      if(quantity<=0)continue;
      const base={
        itemId:asId(raw?.id??raw?.item_id??itemObj?.id),
        uid:asId(raw?.uid??raw?.item_uid??itemObj?.uid),
        name,
        type:String(raw?.type??raw?.category??itemObj?.type??''),
        subType:String(raw?.sub_type??raw?.subType??itemObj?.sub_type??itemObj?.subType??''),
        slot:String(raw?.slot??raw?.weapon_slot??itemObj?.slot??''),
        weaponType:String(raw?.weapon_type??raw?.weaponType??itemObj?.weapon_type??''),
        damage:num(raw?.damage??itemObj?.damage??raw?.stats?.damage??itemObj?.stats?.damage),
        accuracy:num(raw?.accuracy??itemObj?.accuracy??raw?.stats?.accuracy??itemObj?.stats?.accuracy),
        armor:num(raw?.armor??itemObj?.armor??raw?.stats?.armor??itemObj?.stats?.armor??raw?.stats?.protection??itemObj?.stats?.protection),
        armorRating:num(raw?.armor??itemObj?.armor??raw?.stats?.armor??itemObj?.stats?.armor??raw?.stats?.protection??itemObj?.stats?.protection),
        quantity,
        source:'member inventory'
      };
      const enriched=logic?.enrichCatalogItem?logic.enrichCatalogItem(base):base;
      const slot=logic?.equipmentSlot?logic.equipmentSlot(enriched):'';
      if(!['primary','secondary','melee','helmet','body','gloves','pants','boots'].includes(slot))continue;
      const key=[slot,String(enriched.name||name).toLowerCase(),String(enriched.uid||'')].join('|');
      if(seen.has(key))continue;
      seen.add(key);
      items.push({...enriched,slot,quantity});
    }
    return {items,updatedAt:new Date().toISOString()};
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
    const rawEquipment=Array.isArray(equipData?.equipment)?equipData.equipment:null;
    if(!rawEquipment)throw new Error('Equipment response was malformed; no profile was changed.');
    const items=equipmentItems(equipData);
    if(rawEquipment.length&&!items.length)throw new Error('Equipped combat items were returned but could not be normalized; no profile was changed.');
    const equipmentEmptyConfirmed=rawEquipment.length===0;
    const summary=equipmentSummary(items);
    const supply=memberSupply(inventory,ammoData,items);
    const ownedEquipment=ownedEquipmentFromInventory(inventory);
    const verifiedAt=new Date().toISOString();

    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const previous=fi.memberReadiness.profiles[memberId]||{};
      fi.memberReadiness.profiles[memberId]={
        ...previous,memberId,stats,
        equipment:{...(previous.equipment||{}),summary,items,rawImported:false,emptyConfirmed:equipmentEmptyConfirmed},
        ownedEquipment,
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

  function factionRefreshDue(fi){
    const now=Date.now();
    const next=Date.parse(fi?.nextUsefulRefreshAt||'')||0;
    if(next)return now>=next;
    const last=Date.parse(fi?.lastSyncAt||'')||0;
    return !last||now-last>=FACTION_STALE_FALLBACK_MS;
  }

  function staleSavedMemberIds(limit=AUTO_MEMBER_BATCH){
    if(!vaultSession?.key)return [];
    const vault=getVault(),profiles=state?.factionInventory?.memberReadiness?.profiles||{};
    const staleHours=Math.max(1,Number(state?.factionInventory?.memberReadiness?.settings?.staleHours||72));
    const cutoff=Date.now()-staleHours*3600000;
    return Object.keys(vault?.entries||{})
      .filter(id=>(Date.parse(profiles[id]?.verifiedAt||'')||0)<cutoff)
      .slice(0,Math.max(1,limit));
  }

  function staleSavedMemberCount(){
    const vault=getVault(),profiles=state?.factionInventory?.memberReadiness?.profiles||{};
    const staleHours=Math.max(1,Number(state?.factionInventory?.memberReadiness?.settings?.staleHours||72));
    const cutoff=Date.now()-staleHours*3600000;
    return Object.keys(vault?.entries||{}).filter(id=>(Date.parse(profiles[id]?.verifiedAt||'')||0)<cutoff).length;
  }

  async function autoRefreshArmory({forceFaction=false}={}){
    if(autoRefreshRunning||busy||document.visibilityState!=='visible')return;
    const root=document.getElementById(ROOT_ID);
    if(!root||root.style.display==='none')return;
    autoRefreshRunning=true;
    try{
      state=await core.readLegacyState();
      const messages=[];
      const factionDue=forceFaction||factionRefreshDue(state?.factionInventory||{});
      if(factionKey()&&factionDue){
        await refreshFaction();
        messages.push('faction checked');
      }else if(!factionKey()&&factionDue){
        messages.push('faction data is stale; save a faction API key to enable automatic refresh');
      }
      const staleMemberCount=staleSavedMemberCount();
      if(staleMemberCount&&!vaultSession?.key)messages.push(staleMemberCount+' saved member profile'+(staleMemberCount===1?' is':'s are')+' stale; unlock the member-key vault during an Armory session to enable automatic refresh');
      const staleIds=staleSavedMemberIds();
      if(staleIds.length){
        let ok=0;
        for(const id of staleIds){
          if(busy)break;
          try{await refreshSavedMember(id);ok++;}catch(error){console.warn('[MM Faction Armory] automatic member refresh failed',id,error);}
        }
        state=await core.readLegacyState();
        if(ok)messages.push(ok+' stale member profile'+(ok===1?'':'s')+' refreshed');
      }
      if(messages.length){
        statusText='Auto-refresh: '+messages.join(' · ')+'.';
        render();
      }
    }catch(error){
      console.warn('[MM Faction Armory] automatic refresh failed',error);
      statusText='Auto-refresh warning: '+(error?.message||String(error));
      render();
    }finally{autoRefreshRunning=false;}
  }

  function startAutoRefresh(){
    if(autoRefreshTimer)return;
    setTimeout(()=>autoRefreshArmory({forceFaction:false}),1200);
    autoRefreshTimer=setInterval(()=>autoRefreshArmory({forceFaction:false}),AUTO_CHECK_MS);
  }

  function stopAutoRefresh(){
    if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
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

  function reminderSentMap(){
    const raw=GM_getValue(REMINDER_SENT_KEY,{});
    return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  }

  function memberMessageLogMap(){
    const raw=GM_getValue(MEMBER_MESSAGE_LOG_KEY,{});
    return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  }

  function memberMessageStatus(memberId,kind='member-build'){
    const id=asId(memberId);
    const entry=memberMessageLogMap()[id];
    const row=entry?.kinds?.[String(kind||'member-build')];
    if(row?.sentAt)return {
      sent:true,
      sentAt:String(row.sentAt),
      count:Math.max(1,Number(row.count)||1),
      subject:String(row.subject||'')
    };
    if(kind==='member-data-reminder'){
      const legacy=reminderSentMap()[id];
      if(legacy?.sentAt)return {sent:true,sentAt:String(legacy.sentAt),count:1,subject:'Faction readiness information needed'};
    }
    return {sent:false,sentAt:'',count:0,subject:''};
  }

  function memberAnyMessageStatus(memberId){
    const id=asId(memberId);
    const entry=memberMessageLogMap()[id];
    const rows=entry?.kinds&&typeof entry.kinds==='object'?Object.values(entry.kinds):[];
    const confirmed=rows.filter(row=>row?.sentAt).sort((a,b)=>(Date.parse(b.sentAt)||0)-(Date.parse(a.sentAt)||0));
    if(confirmed.length)return {
      sent:true,
      sentAt:String(confirmed[0].sentAt),
      count:confirmed.reduce((sum,row)=>sum+Math.max(1,Number(row.count)||1),0)
    };
    const legacy=reminderSentMap()[id];
    return legacy?.sentAt?{sent:true,sentAt:String(legacy.sentAt),count:1}:{sent:false,sentAt:'',count:0};
  }

  function recordConfirmedMemberMessage(payload){
    const id=asId(payload?.memberId||payload?.playerId);
    if(!id)return;
    const at=new Date().toISOString();
    const kind=String(payload?.kind||'generic');
    const map=memberMessageLogMap();
    const prior=map[id]&&typeof map[id]==='object'?map[id]:{memberId:id,kinds:{}};
    prior.memberId=id;
    prior.memberName=String(payload?.playerName||prior.memberName||id);
    prior.kinds=prior.kinds&&typeof prior.kinds==='object'?prior.kinds:{};
    const previous=prior.kinds[kind]&&typeof prior.kinds[kind]==='object'?prior.kinds[kind]:{};
    prior.kinds[kind]={
      kind,
      sentAt:at,
      count:Math.max(0,Number(previous.count)||0)+1,
      subject:String(payload?.subject||previous.subject||'')
    };
    prior.lastSentAt=at;
    prior.lastKind=kind;
    map[id]=prior;
    GM_setValue(MEMBER_MESSAGE_LOG_KEY,map);

    if(kind==='member-data-reminder'){
      const reminders=reminderSentMap();
      reminders[id]={memberId:id,memberName:prior.memberName,sentAt:at};
      GM_setValue(REMINDER_SENT_KEY,reminders);
    }

    const root=document.getElementById(ROOT_ID);
    if(root&&root.style.display!=='none')render();
  }

  function reminderSent(memberId){
    return memberMessageStatus(memberId,'member-data-reminder').sent;
  }

  function readinessReminderMessage(row){
    return [
      'Faction Armory readiness reminder',
      '',
      'I still need your current Ranked War readiness information so I can build and provision your faction loadout accurately.',
      '',
      'Please send either:',
      '1) a Limited Access Torn API key in a private message, OR',
      '2) screenshots showing STR / DEF / SPD / DEX, your currently equipped Primary / Secondary / Melee and armor, plus your medical / war supplies.',
      '',
      'If you use screenshots, please resend them whenever your stats or equipment materially change.',
      '',
      'A Limited Access API key is read-only. It cannot log in as you, spend money, sell/move items, attack, or change your account settings.',
      '',
      'Thanks — this is only for faction readiness and equipment planning.',
      '',
      '— Manic Mike',
      'Inventory Manager'
    ].join('\n');
  }

  function nativeSetValue(element,value){
    if(!element)return;
    const proto=Object.getPrototypeOf(element);
    const descriptor=Object.getOwnPropertyDescriptor(proto,'value')||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
    if(descriptor?.set)descriptor.set.call(element,String(value??''));
    else element.value=String(value??'');
    for(const type of ['input','change']){
      try{element.dispatchEvent(new Event(type,{bubbles:true}));}catch{}
    }
  }

  function armoryComposeRecipient(){
    for(const selector of ['input[name="sendto"]','#ac-search-0','input[placeholder="Name"]','input[placeholder*="recipient" i]']){
      const el=[...document.querySelectorAll(selector)].find(node=>node&&node.offsetParent!==null);
      if(el)return el;
    }
    return null;
  }

  function armoryComposeSubject(){
    for(const selector of ['input.message-title','input[name="subject" i]','input[placeholder="Subject" i]','input[name="title" i]']){
      const el=[...document.querySelectorAll(selector)].find(node=>node&&node.offsetParent!==null);
      if(el)return el;
    }
    return null;
  }

  function armoryComposeEditor(){
    for(const selector of ['#mce_0.mce-content-body[contenteditable="true"]','#mce_0[contenteditable="true"]','.editor-content.mce-content-body[contenteditable="true"]','.mce-content-body[contenteditable="true"]']){
      const el=[...document.querySelectorAll(selector)].find(node=>node&&node.offsetParent!==null);
      if(el)return el;
    }
    return null;
  }

  function armoryComposeSend(){
    return [...document.querySelectorAll('button,input[type="submit"],[role="button"]')]
      .filter(node=>node&&node.offsetParent!==null)
      .find(node=>String(node.textContent||node.value||'').replace(/\s+/g,' ').trim().toLowerCase()==='send')||null;
  }

  function armoryRecipientMatches(payload,recipient=armoryComposeRecipient()){
    const id=asId(payload?.playerId);
    if(!id)return true;
    const value=String(recipient?.value||recipient?.textContent||'').replace(/\s+/g,' ').trim();
    if(value.includes('['+id+']'))return true;
    const expected=String(payload?.playerName||'').trim().toLowerCase();
    return Boolean(expected&&value.replace(/\s*\[\d+\]\s*$/,'').trim().toLowerCase()===expected);
  }

  function writeArmoryComposeBody(editor,text){
    if(!editor)return false;
    const value=String(text||'');
    try{
      editor.focus();
      editor.textContent='';
      value.split('\n').forEach((line,index)=>{
        if(index)editor.appendChild(document.createElement('br'));
        editor.appendChild(document.createTextNode(line));
      });
      try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));}
      catch{editor.dispatchEvent(new Event('input',{bubbles:true}));}
      editor.dispatchEvent(new Event('change',{bubbles:true}));
    }catch{return false;}
    const actual=String(editor.innerText||editor.textContent||'').replace(/\s+/g,' ').trim();
    const expected=value.replace(/\s+/g,' ').trim();
    return actual===expected;
  }

  function openArmoryMessage({playerId,playerName='',subject='',body='',kind='generic',memberId=''}) {
    const id=asId(playerId);
    if(!id)throw new Error('Message recipient is not available.');
    const payload={
      composeId:'fa-'+Date.now()+'-'+id,
      playerId:id,
      playerName:String(playerName||''),
      subject:String(subject||''),
      body:String(body||''),
      kind:String(kind||'generic'),
      memberId:asId(memberId),
      createdAt:Date.now(),
      state:'awaiting-send'
    };
    GM_setValue(ARMORY_COMPOSE_KEY,payload);
    location.href='https://www.torn.com/messages.php#/p=compose&XID='+encodeURIComponent(id);
  }

  function normalizeArmoryDeliveryText(value){
    return String(value||'').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function armoryDeliveryFingerprint(payload){
    const lines=String(payload?.body||'').split(/\r?\n/)
      .map(line=>normalizeArmoryDeliveryText(line))
      .filter(line=>line.length>=12);
    return String(lines[0]||normalizeArmoryDeliveryText(payload?.subject||'')).slice(0,90);
  }

  function armoryDeliveryFingerprintCount(fingerprint){
    const needle=normalizeArmoryDeliveryText(fingerprint);
    if(!needle||!document.body)return 0;
    let count=0;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node=walker.nextNode();
    while(node){
      const parent=node.parentElement;
      if(parent&&!parent.closest('#'+ROOT_ID+',textarea,input,[contenteditable="true"],[role="textbox"],script,style,noscript')){
        const text=normalizeArmoryDeliveryText(node.nodeValue||'');
        if(text&&text.includes(needle))count++;
      }
      node=walker.nextNode();
    }
    return count;
  }

  function armorySentConfirmationTexts(){
    const selector='[role="alert"],[aria-live="assertive"],[aria-live="polite"],[class*="success" i],[class*="notification" i],[class*="toast" i]';
    return [...new Set([...document.querySelectorAll(selector)]
      .filter(node=>node&&node.offsetParent!==null)
      .map(el=>normalizeArmoryDeliveryText(el.innerText||el.textContent||''))
      .filter(text=>/\bmessage(?:\s+has\s+been)?\s+sent\b|\bsent\s+successfully\b|\bsuccessfully\s+sent\b/.test(text)))];
  }

  async function verifyArmorySend(payload){
    const started=Date.now();
    const baselineConfirmations=new Set(Array.isArray(payload?.confirmationBaseline)?payload.confirmationBaseline:[]);
    const fingerprint=String(payload?.deliveryFingerprint||armoryDeliveryFingerprint(payload));
    const baselineCount=Math.max(0,Number(payload?.fingerprintBaselineCount||0));

    while(Date.now()-started<ARMORY_SEND_CONFIRM_MS){
      const current=GM_getValue(ARMORY_COMPOSE_KEY,null);
      if(!current||String(current.composeId||'')!==String(payload.composeId||''))return;

      const successText=armorySentConfirmationTexts().find(text=>!baselineConfirmations.has(text))||'';
      const transcriptConfirmed=Boolean(fingerprint&&armoryDeliveryFingerprintCount(fingerprint)>baselineCount);

      if(successText||transcriptConfirmed){
        if(payload.memberId)recordConfirmedMemberMessage(payload);
        GM_deleteValue(ARMORY_COMPOSE_KEY);
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,500));
    }

    const current=GM_getValue(ARMORY_COMPOSE_KEY,null);
    if(current&&String(current.composeId||'')===String(payload.composeId||'')){
      GM_setValue(ARMORY_COMPOSE_KEY,{...current,state:'send-unconfirmed',sendVerificationFailedAt:Date.now()});
    }
  }

  async function fillArmoryCompose(){
    if(!location.pathname.includes('messages.php')||!location.hash.includes('compose'))return;
    const payload=GM_getValue(ARMORY_COMPOSE_KEY,null);
    if(!payload||Date.now()-Number(payload.createdAt||0)>ARMORY_COMPOSE_TTL_MS){
      if(payload)GM_deleteValue(ARMORY_COMPOSE_KEY);
      return;
    }
    const xid=new URLSearchParams(location.hash.replace(/^#\/?p=compose&?/,'')).get('XID')||
      new URLSearchParams(location.hash.replace(/^#/,'')).get('XID')||'';
    if(asId(xid)!==asId(payload.playerId)){
      GM_deleteValue(ARMORY_COMPOSE_KEY);
      return;
    }
    const deadline=Date.now()+30000;
    let stableEditor=null,stableSince=0;
    while(Date.now()<deadline){
      const recipient=armoryComposeRecipient(),subject=armoryComposeSubject(),editor=armoryComposeEditor(),send=armoryComposeSend();
      if(recipient&&subject&&editor&&send&&armoryRecipientMatches(payload,recipient)){
        if(editor!==stableEditor){stableEditor=editor;stableSince=Date.now();}
        else if(Date.now()-stableSince>=600){
          nativeSetValue(subject,payload.subject);
          if(!writeArmoryComposeBody(editor,payload.body))return;
          break;
        }
      }else{stableEditor=null;stableSince=0;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }

  function installArmorySendTracking(){
    document.addEventListener('click',event=>{
      if(!event.isTrusted||!location.pathname.includes('messages.php'))return;
      const payload=GM_getValue(ARMORY_COMPOSE_KEY,null);
      if(!payload||payload.state!=='awaiting-send')return;
      if(!armoryRecipientMatches(payload))return;
      const send=armoryComposeSend();
      const target=event.target?.closest?.('button,input[type="submit"],[role="button"]');
      if(!send||!target||!(target===send||send.contains?.(target)||target.contains?.(send)))return;
      const fingerprint=armoryDeliveryFingerprint(payload);
      const next={
        ...payload,
        state:'send-clicked',
        sendClickedAt:Date.now(),
        confirmationBaseline:armorySentConfirmationTexts(),
        deliveryFingerprint:fingerprint,
        fingerprintBaselineCount:armoryDeliveryFingerprintCount(fingerprint)
      };
      GM_setValue(ARMORY_COMPOSE_KEY,next);
      verifyArmorySend(next).catch(()=>{});
    },true);
  }

  function runArmoryPageHelpers(){
    fillArmoryCompose().catch(error=>console.warn('[MM Faction Armory] compose preparation failed',error));
  }

  function memberRows(){
    return state?logic.memberRows(state.factionInventory||{},savedKeyIds(),{procurementMode}):[];
  }

  function readinessStatusClass(status){
    const value=String(status||'');
    if(value==='WAR READY'||value==='READY FOR REVIEW')return 'mm-fa-good';
    if(value==='MISSING DATA'||value==='STALE DATA'||value==='NO COMBAT GEAR EQUIPPED')return 'mm-fa-bad';
    return 'mm-fa-warn';
  }

  async function setMemberWarReady(memberId,approved,reason=''){
    const id=asId(memberId);
    if(!id)throw new Error('Member ID is required.');
    state=await core.readLegacyState();
    const rows=logic.memberRows(state?.factionInventory||{},savedKeyIds(),{procurementMode});
    const row=rows.find(item=>item.memberId===id);
    if(!row)throw new Error('Faction member not found.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const profile=fi.memberReadiness.profiles[id]&&typeof fi.memberReadiness.profiles[id]==='object'
        ?fi.memberReadiness.profiles[id]
        :{memberId:id};
      fi.memberReadiness.profiles[id]=profile;
      if(approved){
        profile.readinessApproval={
          status:'WAR READY',
          approvedAt:at,
          manual:true,
          reason:String(reason||'Leadership manual decision').trim(),
          sourceVerifiedAt:String(profile.verifiedAt||''),
          procurementModeAtApproval:procurementMode,
          baselinePassedAtApproval:Boolean(row.buildWarReady),
          dataStatusAtApproval:String(row.dataReadinessStatus||'')
        };
      }else{
        delete profile.readinessApproval;
      }
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:row.memberName,approved};
  }

  async function setMemberManualOverrides(memberId,values,reason=''){
    const id=asId(memberId);
    if(!id)throw new Error('Member ID is required.');
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Manual override must be a JSON object.');
    state=await core.readLegacyState();
    const roster=state?.factionInventory?.memberReadiness?.roster||{};
    const member=roster[id];
    if(!member)throw new Error('Faction member not found.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const profile=fi.memberReadiness.profiles[id]&&typeof fi.memberReadiness.profiles[id]==='object'
        ?fi.memberReadiness.profiles[id]
        :{memberId:id};
      fi.memberReadiness.profiles[id]=profile;
      profile.manualOverrides={
        values:JSON.parse(JSON.stringify(values)),
        updatedAt:at,
        reason:String(reason||'Manual Armory data override').trim()
      };
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:String(member.memberName||id),updatedAt:at};
  }

  async function clearMemberManualOverrides(memberId){
    const id=asId(memberId);
    if(!id)throw new Error('Member ID is required.');
    state=await core.readLegacyState();
    const roster=state?.factionInventory?.memberReadiness?.roster||{};
    const member=roster[id];
    if(!member)throw new Error('Faction member not found.');
    await core.updateDomainState('faction',draft=>{
      const profile=draft.factionInventory?.memberReadiness?.profiles?.[id];
      if(profile&&typeof profile==='object')delete profile.manualOverrides;
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:String(member.memberName||id)};
  }

  async function setMemberEquipmentDecision(memberId,slot,decision){
    const id=asId(memberId);
    const normalizedSlot=String(slot||'').trim().toLowerCase();
    if(!id)throw new Error('Member ID is required.');
    if(!['primary','secondary','melee','helmet','body','gloves','pants','boots'].includes(normalizedSlot))throw new Error('Equipment slot is not valid.');
    state=await core.readLegacyState();
    const roster=state?.factionInventory?.memberReadiness?.roster||{};
    const member=roster[id];
    if(!member)throw new Error('Faction member not found.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const profile=fi.memberReadiness.profiles[id]&&typeof fi.memberReadiness.profiles[id]==='object'
        ?fi.memberReadiness.profiles[id]
        :{memberId:id};
      fi.memberReadiness.profiles[id]=profile;
      profile.equipmentDecisions=profile.equipmentDecisions&&typeof profile.equipmentDecisions==='object'?profile.equipmentDecisions:{};
      const action=String(decision?.action||'').trim();
      if(!action||action==='automatic'){
        delete profile.equipmentDecisions[normalizedSlot];
      }else if(action==='accept-current'){
        profile.equipmentDecisions[normalizedSlot]={
          action:'accept-current',
          itemName:String(decision?.itemName||'').trim(),
          reason:String(decision?.reason||'Leadership accepted equipped item').trim(),
          updatedAt:at
        };
      }else if(action==='replacement'){
        const itemName=String(decision?.itemName||'').trim();
        if(!itemName)throw new Error('Choose or enter a replacement item.');
        profile.equipmentDecisions[normalizedSlot]={
          action:'replacement',
          itemName,
          reason:String(decision?.reason||'Leadership selected replacement').trim(),
          updatedAt:at
        };
      }else{
        throw new Error('Equipment decision is not valid.');
      }
      if(!Object.keys(profile.equipmentDecisions).length)delete profile.equipmentDecisions;
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:String(member.memberName||id),slot:normalizedSlot,action:String(decision?.action||'automatic')};
  }

  function equipmentDecisionSummary(row){
    const decisions=row?.profile?.equipmentDecisions;
    if(!decisions||typeof decisions!=='object')return '';
    return Object.entries(decisions).map(([slot,decision])=>{
      const action=String(decision?.action||'');
      if(action==='accept-current')return String(slot).toUpperCase()+': ACCEPT '+String(decision?.itemName||'equipped item');
      if(action==='replacement')return String(slot).toUpperCase()+': REPLACE WITH '+String(decision?.itemName||'');
      return '';
    }).filter(Boolean).join(' | ');
  }

  function equipmentOverrideMenuHtml(){
    const id=asId(editingEquipmentMemberId);
    if(!id)return '';
    const row=memberRows().find(item=>item.memberId===id);
    if(!row)return '';
    const build=row.buildAssessment||null;
    if(!build)return '';
    const slots=(build.items||[]).map(item=>{
      const decision=item.equipmentDecision||{};
      const suggestionNames=[item.suggestedName,item.targetName,...(item.recommendationOptions||[]).map(option=>option?.name)]
        .map(value=>String(value||'').trim()).filter(Boolean);
      const unique=[...new Set(suggestionNames)];
      const selectedName=decision.action==='replacement'?String(decision.itemName||''):String(item.suggestedName||item.targetName||'');
      const options=unique.map(name=>'<option value="'+esc(name)+'" '+(name===selectedName?'selected':'')+'>'+esc(name)+'</option>').join('');
      const decisionText=decision.action==='accept-current'
        ? 'Accepted equipped item: '+String(item.currentName||decision.itemName||'')
        : decision.action==='replacement'
          ? 'Replacement selected: '+String(decision.itemName||'')
          : 'Automatic Armory recommendation';
      return '<div class="mm-fa-override-slot">'+
        '<div class="mm-fa-module-head"><div><b>'+esc(String(item.slot||'').toUpperCase())+'</b> '+(item.manualDecisionActive?'<span class="mm-fa-pill mm-fa-warn">MANUAL</span>':'<span class="mm-fa-pill">AUTO</span>')+'</div>'+
          '<span class="mm-fa-mini">'+esc(decisionText)+'</span></div>'+
        '<div class="mm-fa-override-grid">'+
          '<div class="mm-fa-tile mm-fa-tile-wide"><span class="mm-fa-tile-label">Equipped now</span><span class="mm-fa-tile-value">'+esc(item.currentName||'Nothing equipped')+'</span><span class="mm-fa-mini">'+esc(item.currentName?equipmentStatsText(item.currentStats):'No equipped item reported')+'</span></div>'+
          '<div class="mm-fa-tile mm-fa-tile-wide"><span class="mm-fa-tile-label">Armory suggestion</span><span class="mm-fa-tile-value">'+esc(factionMessageRoute(item))+' · '+esc(item.suggestedName||item.targetName||'Review')+'</span><span class="mm-fa-mini">'+esc(item.targetName?equipmentStatsText(item.targetStats,{mode:'need'}):'No automatic target')+'</span></div>'+
        '</div>'+
        '<div class="mm-fa-actions" style="margin-top:6px;">'+
          (item.currentName?'<button data-eq-accept-current="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" data-eq-current="'+esc(item.currentName)+'" style="'+button(decision.action==='accept-current')+'">Accept Equipped Item</button>':'')+
          (unique.length?'<select class="mm-fa-input" data-eq-suggestion="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" style="width:220px;max-width:100%;">'+options+'</select>'+
          '<button data-eq-use-suggestion="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" style="'+button(decision.action==='replacement'&&unique.includes(String(decision.itemName||'')))+'">Use Selected Replacement</button>':'')+
          '<input class="mm-fa-input" data-eq-manual-name="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" placeholder="Other replacement item name" value="'+esc(decision.action==='replacement'&&!unique.includes(String(decision.itemName||''))?String(decision.itemName||''):'')+'" style="width:210px;max-width:100%;">'+
          '<button data-eq-use-manual="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" style="'+button()+'">Use Other Replacement</button>'+
          (item.manualDecisionActive?'<button data-eq-auto="'+esc(row.memberId)+'" data-eq-slot="'+esc(item.slot)+'" style="'+button()+'">Use Automatic</button>':'')+
        '</div>'+
      '</div>';
    }).join('');
    return '<div class="mm-fa-modal-backdrop" id="mm-fa-equipment-override-modal">'+
      '<div class="mm-fa-modal">'+
        '<div class="mm-fa-module-head"><div><b>Edit Equipment Override — '+esc(row.memberName)+'</b><div class="mm-fa-muted">Choose each slot in normal wording. API/source equipment stays unchanged underneath.</div></div><button id="mm-fa-close-equipment-override" style="'+button()+'">Close</button></div>'+
        '<div class="mm-fa-mini">Accept Equipped Item means you approve that exact currently equipped piece for readiness. A replacement means Armory will plan that exact item—borrow it from the vault if available, otherwise acquire it.</div>'+
        slots+
      '</div>'+
    '</div>';
  }

  async function setMemberProcurementPass(memberId,approved,reason=''){
    const id=asId(memberId);
    if(!id)throw new Error('Member ID is required.');
    state=await core.readLegacyState();
    const roster=state?.factionInventory?.memberReadiness?.roster||{};
    const member=roster[id];
    if(!member)throw new Error('Faction member not found.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.memberReadiness=fi.memberReadiness&&typeof fi.memberReadiness==='object'?fi.memberReadiness:{};
      fi.memberReadiness.profiles=fi.memberReadiness.profiles&&typeof fi.memberReadiness.profiles==='object'?fi.memberReadiness.profiles:{};
      const profile=fi.memberReadiness.profiles[id]&&typeof fi.memberReadiness.profiles[id]==='object'
        ?fi.memberReadiness.profiles[id]
        :{memberId:id};
      fi.memberReadiness.profiles[id]=profile;
      if(approved){
        profile.procurementPass={
          status:'PASS',
          approvedAt:at,
          verifiedAt:String(profile.verifiedAt||''),
          reason:String(reason||'Leader procurement pass').trim()
        };
      }else{
        delete profile.procurementPass;
      }
      return draft;
    });
    state=await core.readLegacyState();
    return {memberId:id,memberName:String(member.memberName||id),approved};
  }

  async function setAcquisitionQuantityOverride(row,value){
    if(!row)throw new Error('Acquisition row is required.');
    const raw=String(value??'').trim();
    const key=logic.acquisitionOverrideKey(stockMode,procurementMode,row);
    const qty=raw===''?null:Number(raw);
    if(qty!=null&&(!Number.isFinite(qty)||qty<0||!Number.isInteger(qty)))throw new Error('Planned quantity must be a whole number of zero or more.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.acquisitionPlanning=fi.acquisitionPlanning&&typeof fi.acquisitionPlanning==='object'?fi.acquisitionPlanning:{schema:1};
      fi.acquisitionPlanning.schema=1;
      fi.acquisitionPlanning.quantityOverrides=fi.acquisitionPlanning.quantityOverrides&&typeof fi.acquisitionPlanning.quantityOverrides==='object'
        ?fi.acquisitionPlanning.quantityOverrides:{};
      if(qty==null)delete fi.acquisitionPlanning.quantityOverrides[key];
      else fi.acquisitionPlanning.quantityOverrides[key]={qty,updatedAt:at};
      return draft;
    });
    state=await core.readLegacyState();
    return {key,qty};
  }

  function equipmentStatsText(stats,{mode='current'}={}){
    if(!stats||!stats.kind)return 'Stats unavailable';
    if(stats.kind==='armor'){
      if(mode==='need')return 'MIN ARM '+fmt(stats.minArmor)+' · AVG '+fmt(stats.averageArmor)+(stats.maxArmor?' · RANGE '+fmt(stats.minArmor)+'–'+fmt(stats.maxArmor):'');
      const value=stats.currentArmor||stats.averageArmor;
      return 'ARM '+fmt(value)+(stats.source==='ITEM'?' · exact':' · '+String(stats.source||'avg').toLowerCase());
    }
    if(mode==='need')return 'MIN DMG '+fmt(stats.minDamage)+' / ACC '+fmt(stats.minAccuracy)+' · AVG '+fmt(stats.averageDamage)+' / '+fmt(stats.averageAccuracy)+(stats.maxDamage&&stats.maxAccuracy?' · RANGE DMG '+fmt(stats.minDamage)+'–'+fmt(stats.maxDamage)+' / ACC '+fmt(stats.minAccuracy)+'–'+fmt(stats.maxAccuracy):'');
    return 'DMG '+fmt(stats.currentDamage||stats.averageDamage)+' · ACC '+fmt(stats.currentAccuracy||stats.averageAccuracy)+(stats.source==='ITEM'?' · exact':' · '+String(stats.source||'avg').toLowerCase());
  }

  function memberEquipmentStatsHtml(row){
    const build=row?.buildAssessment;
    if(!build?.items?.length)return '';
    const lines=build.items.filter(item=>item.currentName).map(item=>
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(item.slot.toUpperCase())+' · '+esc(item.currentName)+'</b>'+
      '<div class="mm-fa-muted">'+esc(equipmentStatsText(item.currentStats))+'</div></div>'+
      '<div class="mm-fa-tiles">'+tile('SCORE',fmt(item.currentScore))+tile('NEED',fmt(item.readinessFloor))+'</div></div>'
    ).join('');
    return lines?'<details class="mm-fa-details"><summary>Current equipment + stats</summary><div style="margin-top:4px;">'+lines+'</div></details>':'';
  }

  function optionPricing(option){
    const key=String(option?.name||'').trim().toLowerCase();
    if(key&&equipmentOptionPriceMemo.has(key))return equipmentOptionPriceMemo.get(key);
    const live=acquisitionSourceSnapshot({item:option?.name,marketValue:num(option?.marketValue)});
    const planning=live.bestPlanning||null;
    const fallback=num(option?.marketValue);
    const cost=num(planning?.price)||fallback;
    const resolved={...live,cost,costSource:String(planning?.source||(fallback?'Static reference':'Price not cached')),hasCurrentPrice:Boolean(planning?.price)};
    if(key)equipmentOptionPriceMemo.set(key,resolved);
    return resolved;
  }

  function categorizedEquipmentOptions(item){
    const raw=(item?.recommendationOptions||[]).map(option=>({...option,pricing:optionPricing(option)}));
    const priced=raw.filter(option=>num(option.pricing?.cost)>0).slice().sort((a,b)=>num(a.pricing.cost)-num(b.pricing.cost)||b.score-a.score);
    const index=new Map(priced.map((option,i)=>[String(option.name),i]));
    const maxScore=Math.max(0,...raw.map(option=>num(option.score)));
    return raw.map(option=>{
      const cost=num(option.pricing?.cost);
      let costBand='PRICE UNKNOWN';
      if(cost&&priced.length){
        const rank=index.get(String(option.name))||0;
        const percentile=priced.length===1?0:rank/(priced.length-1);
        costBand=percentile<=0.33?'LOW COST':percentile<=0.66?'MID COST':'HIGH COST';
      }
      const statBand=maxScore>0&&num(option.score)>=maxScore*0.95?'HIGH STATS':'MEETS NEED';
      return {...option,costBand,statBand};
    }).sort((a,b)=>{
      const order={'LOW COST':0,'MID COST':1,'HIGH COST':2,'PRICE UNKNOWN':3};
      return (order[a.costBand]??4)-(order[b.costBand]??4)||num(a.pricing?.cost)-num(b.pricing?.cost)||b.score-a.score;
    });
  }

  function equipmentOptionsHtml(row,item){
    const options=categorizedEquipmentOptions(item);
    if(!options.length)return '';
    const groups=['LOW COST','MID COST','HIGH COST','PRICE UNKNOWN'];
    const html=groups.map(group=>{
      const rows=options.filter(option=>option.costBand===group);
      if(!rows.length)return '';
      return '<details class="mm-fa-details"><summary>'+esc(group)+' · '+rows.length+' option'+(rows.length===1?'':'s')+'</summary><div style="margin-top:4px;">'+
        rows.map(option=>{
          const cost=num(option.pricing?.cost);
          const delta=num(option.floorDeltaPct);
          const costText=cost?String.fromCharCode(36)+fmt(cost):'NOT CACHED';
          return '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(option.name)+'</b> <span class="mm-fa-pill">'+esc(option.statBand)+'</span>'+
            '<div class="mm-fa-muted">'+esc(equipmentStatsText(option.stats,{mode:'need'}))+'</div>'+
            '<div class="mm-fa-mini">'+esc(option.source||'')+(delta?' · +'+delta.toFixed(1)+'% vs readiness floor':'')+'</div>'+
            '<div class="mm-fa-actions" style="margin-top:3px;"><button data-build-option-member="'+esc(row.memberId)+'" data-build-option-slot="'+esc(item.slot)+'" data-build-option-name="'+esc(option.name)+'" style="'+button()+'">Find Best Source</button></div></div>'+
            '<div class="mm-fa-tiles">'+tile('COST',costText)+tile('COST SOURCE',option.pricing?.costSource||'—',{wide:true})+tile('SCORE',fmt(option.score))+'</div></div>';
        }).join('')+'</div></details>';
    }).join('');
    return '<details class="mm-fa-details"><summary><b>Qualifying alternatives</b> · '+options.length+' choices that meet this slot floor</summary>'+
      '<div class="mm-fa-muted" style="margin:3px 0;">Prices use current cached Item Market / Bazaar / overseas data when available, then Torn market_price, then static reference. Recommended stats are average/base ranges; unique RW bonuses, mods, ammo, weapon experience and armor-set bonuses are not included.</div>'+
      html+'</details>';
  }

  function membersHtml(){
    const rows=memberRows();
    const missing=rows.filter(r=>['MISSING DATA','STALE DATA','ESTIMATED — NEEDS DATA'].includes(r.readinessStatus)).length;
    const noGear=rows.filter(r=>r.readinessStatus==='NO COMBAT GEAR EQUIPPED').length;
    const vault=getVault();
    const savedCount=savedKeyIds().length;
    const staleSaved=staleSavedMemberCount();
    const vaultUnlocked=Boolean(vaultSession?.key);
    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head">'+
        '<div><b>Member readiness</b> <span class="mm-fa-muted">'+rows.length+' roster members · '+missing+' missing/stale/estimated · '+noGear+' confirmed no combat gear · '+savedCount+' saved member API key'+(savedCount===1?'':'s')+'</span></div>'+
        '<div class="mm-fa-actions">'+
          (vault&&savedCount&&!vaultUnlocked?'<button id="mm-fa-unlock-vault" style="'+button(true)+'">Unlock Vault</button>':'')+
          '<button id="mm-fa-refresh-keys" style="'+button()+'">Refresh Keys</button><button id="mm-fa-copy-request" style="'+button()+'">Copy Request</button>'+
        '</div>'+
      '</div>'+
      '<div class="mm-fa-muted" style="margin-bottom:4px;">Member-key vault: '+(vault?(vaultUnlocked?'UNLOCKED':'LOCKED'):'NOT CREATED')+' · stale saved profiles: '+staleSaved+(vaultUnlocked?' · automatic stale-profile refresh enabled for this session':'')+'</div>'+
      '<div class="mm-fa-actions">'+
        '<input id="mm-fa-member-key" class="mm-fa-input" style="flex:1 1 260px;min-width:180px;" type="password" autocomplete="off" placeholder="Member Limited Access API key">'+
        '<button id="mm-fa-import-once" style="'+button()+'">Import Once</button>'+
        '<button id="mm-fa-import-save" style="'+button(true)+'">Import + Save</button>'+
      '</div>'+
      '<div class="mm-fa-muted" style="margin-top:4px;">Key/Data: local browser only · shared with nobody · faction readiness only · Import Once is not retained · Import + Save uses the encrypted local vault · Limited Access member key.</div>'+
    '</div>'+
    (rows.length?rows.map(row=>{
      const s=row.stats||{};
      const source=String(row.profile?.source||'');
      const gear=String(row.equipmentSummary||'')||(row.equipmentEmptyConfirmed?'No combat gear equipped (confirmed)':'');
      const entry=vault?.entries?.[row.memberId];
      const statusClass=readinessStatusClass(row.readinessStatus);
      const med=row.profile?.supplyReadiness?.medical||{};
      const buildMessage=memberMessageStatus(row.memberId,'member-build');
      const dataReminder=memberMessageStatus(row.memberId,'member-data-reminder');
      const anyMessage=memberAnyMessageStatus(row.memberId);
      const equipmentDecisionText=equipmentDecisionSummary(row);
      return '<details class="mm-fa-build-member">'+
        '<summary>'+
          '<span class="mm-fa-build-summary-main"><b>'+esc(row.memberName)+'</b><span class="mm-fa-pill">Lv '+num(row.level)+'</span><span class="'+statusClass+'">'+esc(row.readinessStatus)+'</span>'+(anyMessage.sent?'<span class="mm-fa-pill mm-fa-good">MSG SENT</span>':'<span class="mm-fa-pill mm-fa-warn">NO MSG SENT</span>')+(equipmentDecisionText?'<span class="mm-fa-pill mm-fa-warn">EQUIPMENT OVERRIDE</span>':'')+(row.manualOverrideActive?'<span class="mm-fa-pill mm-fa-warn">LEGACY DATA OVERRIDE</span>':'')+(row.procurementPassCurrent?'<span class="mm-fa-pill mm-fa-good">PROCUREMENT PASS</span>':'')+(row.procurementPassStale?'<span class="mm-fa-pill mm-fa-warn">PASS NEEDS REVIEW</span>':'')+(entry?'<span class="mm-fa-pill">API SAVED</span>':'')+'</span>'+
          '<span class="mm-fa-muted">'+(row.statsEstimated?'~'+fmt(row.statProfile.total)+' estimated stats':row.hasStats?fmt(row.statProfile.total)+' stats':'stats missing')+'</span>'+
        '</summary>'+
        '<div class="mm-fa-build-body">'+
          '<div class="mm-fa-module-head"><div class="mm-fa-buttons">'+
            (entry?'<button data-refresh-member="'+esc(row.memberId)+'" style="'+button(true)+'">Refresh</button><button data-remove-member="'+esc(row.memberId)+'" style="'+button()+'">Remove Key</button>':'')+
            '<button data-paste-reply="'+esc(row.memberId)+'" style="'+button()+'">Paste Reply</button>'+
            ((!row.hasVerifiedStats||!row.equipmentEvidenceKnown)&&!reminderSent(row.memberId)?'<button data-remind-member="'+esc(row.memberId)+'" style="'+button(true)+'">Send Data Reminder</button>':'')+
            (row.readinessStatus!=='WAR READY'?'<button data-war-ready="'+esc(row.memberId)+'" style="'+button(true)+'">Mark War Ready</button>':'')+
            (row.readinessStatus==='WAR READY'?'<button data-reopen-review="'+esc(row.memberId)+'" style="'+button()+'">Reopen Readiness</button>':'')+
            '<button data-edit-override="'+esc(row.memberId)+'" style="'+button()+'">Edit Data Override</button>'+
            (row.manualOverrideActive?'<button data-clear-override="'+esc(row.memberId)+'" style="'+button()+'">Clear Legacy Data Override</button>':'')+
            (row.readinessStatus!=='WAR READY'&&!row.procurementPassCurrent?'<button data-procurement-pass="'+esc(row.memberId)+'" style="'+button()+'">Pass / Exclude Acquisition</button>':'')+
            (row.procurementPassCurrent?'<button data-reopen-procurement="'+esc(row.memberId)+'" style="'+button()+'">Reopen Procurement</button>':'')+
          '</div></div>'+
          '<div class="mm-fa-tiles">'+
            tile('STR',row.hasStats?(row.statsEstimated?'~':'')+fmt(s.strength):'—')+
            tile('DEF',row.hasStats?(row.statsEstimated?'~':'')+fmt(s.defense):'—')+
            tile('SPD',row.hasStats?(row.statsEstimated?'~':'')+fmt(s.speed):'—')+
            tile('DEX',row.hasStats?(row.statsEstimated?'~':'')+fmt(s.dexterity):'—')+
            tile('TOTAL',row.hasStats?(row.statsEstimated?'~':'')+fmt(row.statProfile.total):'—')+
            (row.statsEstimated&&row.statEstimate?tile('EST RANGE',fmt(row.statEstimate.rangeMin)+' – '+(row.statEstimate.rangeMax?fmt(row.statEstimate.rangeMax):'250M+'),{wide:true}):'')+
            (row.statsEstimated?tile('EST CONF',row.statEstimate?.confidence||'LOW'):'')+
            (row.publicIntel?.ageDays?tile('TORN AGE',fmt(row.publicIntel.ageDays)+'d'):'')+
            (row.publicIntel?.rank?tile('RANK',row.publicIntel.rank,{wide:true}):'')+
            tile('READINESS',row.readinessStatus||'—')+
            tile('PROCUREMENT',row.acquisitionDisposition||'ACTIVE')+
            tile('BUILD BASELINE',row.buildWarReady?'PASS':'ACTION NEEDED')+
            (row.readinessApprovedAt?tile('WAR READY OVERRIDE',when(row.readinessApprovedAt)+(row.readinessApprovalReason?' · '+row.readinessApprovalReason:''),{wide:true}):'')+
            (equipmentDecisionText?tile('EQUIPMENT OVERRIDE',equipmentDecisionText,{wide:true}):'')+
            (row.manualOverrideActive?tile('LEGACY DATA OVERRIDE',when(row.manualOverrideUpdatedAt)+(row.manualOverrideReason?' · '+row.manualOverrideReason:''),{wide:true}):'')+
            (row.procurementPassAt?tile('PASS',when(row.procurementPassAt)+(row.procurementPassReason?' · '+row.procurementPassReason:''),{wide:true}):'')+
            tile('LOANS',row.loans?row.loans+' units':'—')+
            tile('BUILD MSG',buildMessage.sent?'SENT '+when(buildMessage.sentAt)+' · x'+buildMessage.count:'NOT SENT',{cls:buildMessage.sent?'mm-fa-good':'mm-fa-warn',wide:true})+
            tile('DATA REQUEST',dataReminder.sent?'SENT '+when(dataReminder.sentAt):'NOT SENT',{cls:dataReminder.sent?'mm-fa-good':'',wide:true})+
            (source?tile('SOURCE',(row.manualOverrideActive?'MANUAL OVERRIDE over ':'')+source+' · '+when(row.profile?.verifiedAt),{wide:true}):tile('SOURCE',row.manualOverrideActive?'MANUAL OVERRIDE over no source profile':'No current profile',{wide:true}))+
          '</div>'+
          (entry?.lastError?'<div class="mm-fa-bad mm-fa-mini" style="margin-top:3px;">API error: '+esc(entry.lastError)+'</div>':'')+
          memberEquipmentStatsHtml(row)+
          '<div class="mm-fa-tiles" style="margin-top:4px;">'+
            tile('EQUIPPED',gear||'—',{wide:true})+
            tile('FACTION LOANS',row.loanItems.length?row.loanItems.map(i=>i.name+' x'+num(i.amount)).join(' | '):'—',{wide:true})+
            tile('OWNED COMBAT GEAR',Array.isArray(row.profile?.ownedEquipment?.items)&&row.profile.ownedEquipment.items.length?row.profile.ownedEquipment.items.map(i=>String(i.name||'')+' x'+num(i.quantity||1)).join(' | '):'—',{wide:true})+
            tile('SFAK',med.sfak??'—')+
            tile('FAK',med.fak??'—')+
            tile('MORPHINE',med.morphine??'—')+
            tile('IPECAC',med.ipecac??'—')+
          '</div>'+
        '</div>'+
      '</details>';
    }).join(''):card('No faction roster is cached yet. Use Refresh Faction.'));
  }

  function quickBuildSelectedMember(rows){
    const members=Array.isArray(rows)?rows:[];
    const current=members.find(row=>asId(row.memberId)===asId(selectedBuildMemberId));
    const selected=current||members.find(row=>row.hasStats)||members[0]||null;
    if(selected)selectedBuildMemberId=asId(selected.memberId);
    return selected;
  }

  function quickBuildRoute(item){
    if(!item)return '—';
    if(item.ready)return 'KEEP';
    if(item.route==='OWNED')return 'OWNED / EQUIP';
    if(item.route==='LOANED')return 'LOANED / VERIFY';
    if(item.route==='ISSUE')return 'ISSUE';
    if(item.route==='ACQUIRE')return 'ACQUIRE';
    if(item.route==='REVIEW')return 'REVIEW';
    return String(item.route||item.decision||'REVIEW');
  }

  function factionMessageRoute(item){
    const route=quickBuildRoute(item);
    return route==='ISSUE'?'BORROW FROM VAULT':route;
  }

  function quickBuildActionItem(item){
    if(!item)return '';
    const route=quickBuildRoute(item);
    if(route==='KEEP')return String(item.currentName||item.suggestedName||item.targetName||'Current gear');
    if(route==='OWNED / EQUIP')return String(item.ownedOptionName||item.suggestedName||item.targetName||'Owned gear');
    if(route==='LOANED / VERIFY')return String(item.assignedLoanName||item.suggestedName||item.targetName||'Assigned faction loan');
    if(route==='ISSUE')return String(item.factionOptionName||item.suggestedName||item.targetName||'Faction stock');
    if(route==='ACQUIRE')return String(item.suggestedName||item.targetName||'Acquire qualifying gear');
    if(route==='REVIEW')return String(item.currentName||item.suggestedName||item.targetName||'Review current gear');
    return String(item.suggestedName||item.currentName||item.targetName||'Review');
  }

  function quickBuildMessage(member){
    const row=member||null;
    const build=row?.buildAssessment||null;
    if(!row||!build)throw new Error('Build data is not available for this member.');
    const statPrefix=row.statsEstimated?'Estimated ':'';
    const lines=(build.items||[]).map(item=>{
      const route=factionMessageRoute(item);
      const actionItem=quickBuildActionItem(item);
      const current=String(item.currentName||'');
      let wording='One option to consider';
      if(route==='KEEP')wording='Your current setup looks good';
      else if(route==='BORROW FROM VAULT')wording='One option is to BORROW FROM VAULT';
      else if(route==='OWNED / EQUIP')wording='You may already own a suitable option';
      else if(route==='LOANED / VERIFY')wording='You could use the assigned faction loan';
      else if(route==='ACQUIRE')wording='A possible replacement to consider';
      else if(route==='REVIEW')wording='This slot may be worth reviewing';
      return String(item.slot||'slot').toUpperCase()+': '+wording+' — '+actionItem+
        (current&&current!==actionItem&&route!=='KEEP'?' · currently '+current:'');
    });
    const body=[
      'Hi '+String(row.memberName||'Faction member')+',',
      '',
      'I am putting together optional war-prep suggestions for faction members who want help getting ready. This is not an order, and you do not need to change anything if you are comfortable with your current setup.',
      '',
      'Based on the information I currently have:',
      'Level: '+num(row.level),
      statPrefix+'battle stats: STR '+fmt(row.stats?.strength)+' / DEF '+fmt(row.stats?.defense)+' / SPD '+fmt(row.stats?.speed)+' / DEX '+fmt(row.stats?.dexterity)+' · total '+fmt(row.statProfile?.total),
      'Build style: '+String(build.buildStyle||'UNKNOWN')+' · offense need '+String(build.offensiveNeed||'balanced')+' · defense style '+String(build.defensiveStyle||'balanced'),
      '',
      'OPTIONAL WAR-PREP SUGGESTIONS',
      ...(lines.length?lines:['I do not have enough information yet to make a useful equipment suggestion.']),
      ...(row.statsEstimated?[
        '',
        'Some of this is based on estimated public data, so treat it as a rough starting point. If you want a more accurate recommendation, you can send your current readiness data whenever convenient.'
      ]:[]),
      '',
      'Use whatever is helpful and ignore anything that is not. My goal is simply to make sure anyone who wants help has useful options available before the war.',
      '',
      '— Manic Mike',
      'Inventory Manager'
    ].join('\n');
    openArmoryMessage({
      playerId:row.memberId,
      playerName:row.memberName,
      subject:'OBSIDIAN FORCE optional war-prep suggestions',
      body,
      kind:'member-build',
      memberId:row.memberId
    });
  }

  function buildsHtml(){
    const rows=memberRows();
    if(!rows.length)return card('No member roster is loaded.');
    const selected=quickBuildSelectedMember(rows);
    const build=selected?.buildAssessment||null;
    const options=rows.map(row=>{
      const sent=memberMessageStatus(row.memberId,'member-build');
      return '<option value="'+esc(row.memberId)+'" '+(asId(row.memberId)===asId(selected?.memberId)?'selected':'')+'>'+
        esc(row.memberName)+' · Lv '+num(row.level)+' · '+
        (row.hasStats?(row.statsEstimated?'~':'')+fmt(row.statProfile?.total)+' stats':'stats missing')+
        ' · '+(sent.sent?'MSG SENT':'MSG NOT SENT')+
      '</option>';
    }).join('');
    const slots=build?.items||[];
    const quickRows=slots.length?slots.map(item=>{
      const route=quickBuildRoute(item);
      const routeClass=route==='KEEP'?'mm-fa-good':route==='ACQUIRE'?'mm-fa-bad':'mm-fa-warn';
      const actionItem=quickBuildActionItem(item);
      return '<div class="mm-fa-row">'+
        '<div class="mm-fa-main"><b>'+esc(String(item.slot||'').toUpperCase())+'</b>'+
          '<div class="mm-fa-muted">'+(item.currentName?'Current: '+esc(item.currentName)+' · ':'')+'Action: '+esc(route)+' '+esc(actionItem)+'</div>'+
        '</div>'+
        '<div class="mm-fa-tiles">'+tile('ROUTE',route,{cls:routeClass})+
          (item.factionOptionName?tile('FACTION',item.factionOptionName+' x'+num(item.factionAvailableCount),{wide:true}):'')+
        '</div>'+
      '</div>';
    }).join(''):'<div class="mm-fa-muted">No build can be calculated until member stats are available.</div>';
    const s=selected?.stats||{};
    const selectedBuildMessage=selected?memberMessageStatus(selected.memberId,'member-build'):{sent:false,sentAt:'',count:0};
    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head"><div><b>Quick Build</b> <span class="mm-fa-muted">select member → review target → message</span></div>'+
        '<div class="mm-fa-actions">'+
          '<select id="mm-fa-quick-build-member" class="mm-fa-input" style="width:250px;max-width:100%;">'+options+'</select>'+
          '<button id="mm-fa-quick-build-message" '+(build?'':'disabled')+' style="'+button(Boolean(build))+'">Message Build</button>'+
        '</div>'+
      '</div>'+
      (selected?'<div class="mm-fa-tiles">'+
        tile('LEVEL',num(selected.level))+
        tile('STR',(selected.statsEstimated?'~':'')+fmt(s.strength))+
        tile('DEF',(selected.statsEstimated?'~':'')+fmt(s.defense))+
        tile('SPD',(selected.statsEstimated?'~':'')+fmt(s.speed))+
        tile('DEX',(selected.statsEstimated?'~':'')+fmt(s.dexterity))+
        tile('TOTAL',(selected.statsEstimated?'~':'')+fmt(selected.statProfile?.total))+
        tile('BUILD',build?.buildStyle||'UNKNOWN',{wide:true})+
        tile('OFFENSE',build?.offensiveNeed||'balanced')+
        tile('DEFENSE',build?.defensiveStyle||'balanced')+
        tile('BUILD MESSAGE',selectedBuildMessage.sent?'SENT '+when(selectedBuildMessage.sentAt)+' · x'+selectedBuildMessage.count:'NOT SENT',{cls:selectedBuildMessage.sent?'mm-fa-good':'mm-fa-warn',wide:true})+
      '</div>':'')+
      (selected?.statsEstimated?'<div class="mm-fa-warn mm-fa-mini" style="margin-top:5px;">Planning estimate only. Collect actual member battle stats before final equipment allocation.</div>':'')+
      '<div style="margin-top:5px;">'+quickRows+'</div>'+
      '<div class="mm-fa-muted" style="margin-top:5px;">Faction inventory affects ISSUE vs ACQUIRE only. It never lowers the readiness target, and stronger known personal gear stays KEEP.</div>'+
    '</div>'+
    '<details class="mm-fa-build-member"><summary><span class="mm-fa-build-summary-main"><b>Advanced / Full Roster Builds</b></span><span class="mm-fa-muted">detailed stats, alternatives and readiness evidence</span></summary>'+
      '<div class="mm-fa-build-body">'+advancedBuildsHtml()+'</div>'+
    '</details>';
  }

  function advancedBuildsHtml(){
    const rows=memberRows();
    if(!rows.length)return card('No member roster is loaded.');
    return '<div class="mm-fa-card mm-fa-compact"><b>War-ready build baseline</b> <span class="mm-fa-muted">Each slot shows HAS stats versus the required floor/target average, plus multiple qualifying alternatives grouped by current acquisition cost. Adequate owned/equipped gear is still kept.</span></div>'+
    rows.map(row=>{
      const build=row.buildAssessment||logic.compareMemberBuild(row,state?.factionInventory||{},rows,{procurementMode});
      const statusClass=readinessStatusClass(row.readinessStatus);
      const unresolved=build.items.filter(item=>!item.ready&&item.route!=='OWNED'&&item.route!=='LOANED').length;
      return '<details class="mm-fa-build-member">'+
        '<summary>'+
          '<span class="mm-fa-build-summary-main">'+
            '<b>'+esc(row.memberName)+'</b>'+
            '<span class="mm-fa-pill">Lv '+num(row.level)+'</span>'+
            '<span class="'+statusClass+'">'+esc(row.readinessStatus)+'</span>'+
            (row.procurementPassCurrent?'<span class="mm-fa-pill mm-fa-good">PROCUREMENT PASS</span>':'')+
          '</span>'+
          '<span class="mm-fa-muted">'+
            (row.readinessStatus==='WAR READY'?'approved war ready':
              row.readinessStatus==='READY FOR REVIEW'?'baseline passes · approval pending':
              build.warReady?esc(row.readinessStatus.toLowerCase()):
              unresolved+' actionable slot'+(unresolved===1?'':'s'))+
          '</span>'+
        '</summary>'+
        '<div class="mm-fa-build-body">'+
          '<div class="mm-fa-tiles">'+
            tile('TOTAL STATS',build.totalStats?fmt(build.totalStats):'—')+
            tile('READINESS',row.readinessStatus||'—')+
            tile('BASELINE',build.warReady?'PASS':'ACTION NEEDED')+
            tile('BUILD',build.buildStyle||'UNKNOWN',{wide:true})+
            tile('OFFENSE NEED',build.offensiveNeed||'balanced')+
            tile('DEFENSE STYLE',build.defensiveStyle||'balanced')+
            tile('PREMIUM PRIORITY',build.priority?.label||'—')+
            tile('PROCUREMENT',String(build.procurementMode||procurementMode).toUpperCase())+
          '</div>'+
          '<div class="mm-fa-muted" style="margin-top:4px;">'+esc(build.summary)+'</div>'+
          '<div class="mm-fa-slot-grid">'+build.items.map(item=>{
            const cls=item.ready||item.route==='OWNED'||item.route==='LOANED'?'mm-fa-good':item.route==='ISSUE'?'mm-fa-warn':'mm-fa-bad';
            return '<div class="mm-fa-slot">'+
              '<div><b>'+esc(item.slot.toUpperCase())+'</b> <span class="'+cls+'">'+esc(item.decision)+'</span></div>'+
              '<div class="mm-fa-tiles">'+
                tile('CURRENT',item.currentName||'—',{wide:true})+
                tile('HAS STATS',item.currentName?equipmentStatsText(item.currentStats):'—',{wide:true})+
                tile('HAS SCORE',item.currentScore?fmt(item.currentScore):'—')+
                tile('NEED SCORE',item.readinessFloor?fmt(item.readinessFloor):'—')+
                (item.currentMarketValue?tile('CURRENT REF',String.fromCharCode(36)+fmt(item.currentMarketValue)):'')+
                tile('BASELINE',item.targetName||'—',{wide:true})+
                tile('NEED / TARGET AVG',item.targetName?equipmentStatsText(item.targetStats,{mode:'need'}):'—',{wide:true})+
                (item.targetMarketValue?tile('TARGET REF',String.fromCharCode(36)+fmt(item.targetMarketValue)):'')+
                tile('ROUTE',item.route||'—')+
                tile('SUGGEST',item.suggestedName||'—',{wide:true})+
                (item.suggestedName?tile('SUGGEST STATS',equipmentStatsText(item.suggestedStats,{mode:'need'}),{wide:true}):'')+
                (item.ownedOptionName?tile('OWNED',item.ownedOptionName+(item.ownedOptionQuantity?' x'+item.ownedOptionQuantity:''),{wide:true}):'')+
                (item.assignedLoanName?tile('LOAN',item.assignedLoanName,{wide:true}):'')+
                (item.factionOptionName?tile('FACTION',item.factionOptionName+' x'+item.factionAvailableCount,{wide:true}):'')+
                (item.suggestedSource?tile('SOURCE',item.suggestedSource,{wide:true}):'')+
                (item.premiumOptionName&&item.premiumOptionName!==item.targetName
                  ? tile('PREMIUM OPTION',item.premiumOptionName+(item.premiumMarketValue?' · $'+fmt(item.premiumMarketValue):''),{wide:true})
                  : '')+
              '</div>'+
              (item.valueNote?'<div class="mm-fa-muted" style="margin-top:3px;">'+esc(item.valueNote)+'</div>':'')+
              (!item.ready&&!['OWNED','LOANED'].includes(item.route)?equipmentOptionsHtml(row,item):'')+
            '</div>';
          }).join('')+'</div>'+
        '</div>'+
      '</details>';
    }).join('');
  }


  function coverageHtml(){
    const coverage=logic.coverageComparison(state?.factionInventory||{},{
      mode:'war',procurementMode,budgetCap:acquisitionBudget,savedKeyIds:savedKeyIds()
    });
    const issueHtml=coverage.consistencyIssues.length
      ? '<details class="mm-fa-build-member" open><summary><span class="mm-fa-build-summary-main"><b>CONSISTENCY FLAGS</b><span class="mm-fa-pill mm-fa-bad">'+coverage.consistencyIssues.length+'</span></span><span class="mm-fa-muted">review before acquisition</span></summary><div class="mm-fa-build-body">'+
        coverage.consistencyIssues.map(issue=>
          '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(issue.memberName)+(issue.slot?' · '+esc(issue.slot.toUpperCase()):'')+'</b>'+
          '<div class="mm-fa-bad">'+esc(issue.type)+'</div><div class="mm-fa-muted">'+esc(issue.item||'')+' · '+esc(issue.detail||'')+'</div></div></div>'
        ).join('')+'</div></details>'
      : '<div class="mm-fa-card mm-fa-compact"><span class="mm-fa-good"><b>Consistency scan:</b> no equipped-item/floor routing mismatches or unmapped combat equipment detected in the cached roster.</span></div>';
    const factionRows=coverage.factionCoverage.map(row=>
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.slot.toUpperCase())+'</b></div>'+
      '<div class="mm-fa-tiles">'+
        tile('FACTION OWNED',fmt(row.owned))+tile('AVAILABLE',fmt(row.available))+tile('LOANED',fmt(row.loaned))+
        tile('MEMBER GAPS',fmt(row.memberGaps),{cls:row.memberGaps?'mm-fa-warn':''})+
        tile('ISSUE',fmt(row.issueAssignments))+tile('SYSTEM BUY',fmt(row.systemBuyQty))+
        tile('PLANNED BUY',fmt(row.plannedBuyQty),{cls:row.plannedBuyQty!==row.systemBuyQty?'mm-fa-warn':''})+
      '</div></div>'
    ).join('');
    const byMember=new Map();
    for(const row of coverage.memberCoverage){
      if(!byMember.has(row.memberId))byMember.set(row.memberId,[]);
      byMember.get(row.memberId).push(row);
    }
    const memberHtml=coverage.members.map(member=>{
      const rows=byMember.get(member.memberId)||[];
      const gapCount=rows.filter(row=>!row.ready&&!['OWNED','LOANED','WAR READY','PROCUREMENT PASS'].includes(row.route)).length;
      return '<details class="mm-fa-build-member">'+
        '<summary><span class="mm-fa-build-summary-main"><b>'+esc(member.memberName)+'</b>'+
          '<span class="'+readinessStatusClass(member.readinessStatus)+'">'+esc(member.readinessStatus)+'</span>'+
          (member.procurementPassCurrent?'<span class="mm-fa-pill mm-fa-good">PROCUREMENT PASS</span>':'')+
        '</span><span class="mm-fa-muted">'+gapCount+' active gap'+(gapCount===1?'':'s')+'</span></summary>'+
        '<div class="mm-fa-build-body">'+rows.map(row=>
          '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.slot.toUpperCase())+'</b>'+
            '<div class="mm-fa-muted">HAS: '+esc(row.memberHas||'—')+' · '+(row.memberHasScore?fmt(row.memberHasScore)+' score':'score unavailable')+'</div>'+
            '<div class="mm-fa-muted">NEED: '+esc(row.needTarget||'—')+' · '+(row.needFloor?fmt(row.needFloor)+' floor':'floor unavailable')+'</div>'+
          '</div><div class="mm-fa-tiles">'+
            tile('ROUTE',row.route||'—')+tile('FACTION QUALIFYING',fmt(row.factionAvailableQualifying))+
            (row.assignedLoan?tile('ASSIGNED LOAN',row.assignedLoan,{wide:true}):'')+
            (row.ownedAlternative?tile('OWNED ALT',row.ownedAlternative,{wide:true}):'')+
            (row.factionQualifyingItems.length?tile('FACTION OPTIONS',row.factionQualifyingItems.join(' | '),{wide:true}):'')+
          '</div></div>'
        ).join('')+'</div></details>';
    }).join('');
    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head"><div><b>Member ↔ faction coverage</b> <span class="mm-fa-muted">WAR · '+procurementMode.toUpperCase()+' · '+coverage.members.length+' members</span></div>'+
      '<button id="mm-fa-export-coverage" style="'+button(true)+'">Export Comparison</button></div>'+
      '<div class="mm-fa-muted">Side-by-side operational view: what each member has, the readiness floor/target, qualifying faction stock, assignment route, and computed versus manually planned purchases. Procurement Pass suppresses acquisition without claiming verified War Ready.</div>'+
      '</div>'+
      issueHtml+
      '<details class="mm-fa-build-member" open><summary><span class="mm-fa-build-summary-main"><b>FACTION COVERAGE SUMMARY</b></span><span class="mm-fa-muted">8 combat slots</span></summary><div class="mm-fa-build-body">'+factionRows+'</div></details>'+
      memberHtml;
  }

  function inventoryHtml(){
    const fi=state?.factionInventory||{};
    const current=Object.values(fi.current||{});
    const categories=logic.categories;
    const itemRow=row=>'<div class="mm-fa-row">'+
      '<div class="mm-fa-main"><b>'+esc(row.name)+'</b> <span class="mm-fa-muted">ID '+esc(row.itemId)+'</span>'+
        (row.category==='weapons'
          ? '<div class="mm-fa-muted">API type '+esc(row.type||'—')+' · subtype '+esc(row.subType||'—')+' · slot '+esc(row.slot||'—')+' · weaponType '+esc(row.weaponType||'—')+'</div>'
          : '')+
        (row.loans?.length?'<div class="mm-fa-muted">'+row.loans.map(l=>esc(l.memberName)+' x'+num(l.amount)).join(' | ')+'</div>':'')+
      '</div>'+
      '<div class="mm-fa-tiles">'+tile('OWNED',fmt(row.amountOwned))+tile('AVAILABLE',fmt(row.availableCount))+tile('LOANED',fmt(row.loanedCount))+'</div>'+
    '</div>';

    const categoryHtml=categories.map(cat=>{
      const rows=current.filter(row=>row.category===cat).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      if(cat==='weapons'){
        const standard=['primary','secondary','melee'];
        const slotOf=row=>logic.equipmentSlot(row);
        const unclassified=rows.filter(row=>!standard.includes(slotOf(row)));
        const buckets=[...standard,...(unclassified.length?['unclassified']:[])];
        const nested=buckets.map(slot=>{
          const list=slot==='unclassified'?unclassified:rows.filter(row=>slotOf(row)===slot);
          return '<details class="mm-fa-details" '+(slot==='unclassified'?'open':'')+'><summary><b>'+esc(slot.toUpperCase())+'</b> · '+list.length+' item types · '+list.reduce((sum,r)=>sum+num(r.availableCount),0)+' available</summary>'+
            (list.length?list.map(itemRow).join(''):'<div class="mm-fa-muted" style="padding:4px;">No '+esc(slot)+' weapons currently recorded in faction inventory.</div>')+
          '</details>';
        }).join('');
        const source=fi.sourceCategorySummary?.weapons||{};
        const sourceText='Torn weapons source: '+num(source.rows)+' returned row'+(num(source.rows)===1?'':'s')+
          (num(source.metadataTotal)?' · metadata total '+num(source.metadataTotal):'')+
          (unclassified.length?' · '+unclassified.length+' unclassified':' · all classified');
        return '<details class="mm-fa-build-member" open><summary><span class="mm-fa-build-summary-main"><b>WEAPONS</b><span class="mm-fa-pill">'+rows.length+' types</span></span><span class="mm-fa-muted">'+rows.reduce((s,r)=>s+num(r.availableCount),0)+' available</span></summary>'+
          '<div class="mm-fa-build-body"><div class="mm-fa-muted" style="margin-bottom:4px;">'+esc(sourceText)+(rows.length===0?' · Torn returned no weapon inventory rows in the latest refresh.':'')+'</div>'+nested+'</div></details>';
      }
      return '<details class="mm-fa-build-member"><summary><span class="mm-fa-build-summary-main"><b>'+esc(cat.toUpperCase())+'</b><span class="mm-fa-pill">'+rows.length+' types</span></span><span class="mm-fa-muted">'+rows.reduce((s,r)=>s+num(r.availableCount),0)+' available</span></summary>'+
        '<div class="mm-fa-build-body">'+(rows.length?rows.map(itemRow).join(''):'<div class="mm-fa-muted">No stock.</div>')+'</div></details>';
    }).join('');

    return '<div class="mm-fa-card mm-fa-compact"><div class="mm-fa-module-head"><div><b>Faction inventory</b> <span class="mm-fa-muted">'+current.length+' item rows · '+when(fi.lastSyncAt)+'</span></div><button id="mm-fa-refresh-faction" style="'+button(true)+'">Refresh Faction</button></div></div>'+categoryHtml;
  }

  function minimumOpenInputs(proposal){
    const members=memberRows();
    const inventory=Object.values(state?.factionInventory?.current||{});
    const weaponRows=inventory.filter(row=>row.category==='weapons');
    const unclassifiedWeapons=weaponRows.filter(row=>!['primary','secondary','melee'].includes(logic.equipmentSlot(row)));
    const bloodKnown=members.filter(row=>String(row.profile?.bloodType||'').trim()).length;
    const verifiedStats=members.filter(row=>row.hasVerifiedStats).length;
    const inputs=[
      {
        priority:'HIGH',
        topic:'Filled blood-bag mix',
        status:bloodKnown===members.length&&members.length?'READY TO DESIGN':'DATA REQUIRED',
        detail:bloodKnown+'/'+members.length+' member blood types known. Set the filled-bag mix from actual compatibility/war participation; do not guess from current stock.'
      },
      {
        priority:'HIGH',
        topic:'Usage-history maturity',
        status:proposal.observedDays>=7?'MATURE':'COLLECTING',
        detail:proposal.observedDays.toFixed(1)+' observed inventory days. Keep proposed quantities provisional until at least 7 days of representative movement exist.'
      },
      {
        priority:'HIGH',
        topic:'Weapon inventory classification',
        status:weaponRows.length?(unclassifiedWeapons.length?'REVIEW':'READY'):'REFRESH / VERIFY',
        detail:weaponRows.length+' weapon item row(s) cached; '+unclassifiedWeapons.length+' unclassified. Unclassified rows remain visible in Stock and must be resolved before slot-pool approval.'
      },
      {
        priority:'MEDIUM',
        topic:'Member battle-stat coverage',
        status:verifiedStats===members.length&&members.length?'COMPLETE':'IN PROGRESS',
        detail:verifiedStats+'/'+members.length+' members have verified private battle stats. Public estimates may support planning but not final allocation.'
      },
      {
        priority:'MEDIUM',
        topic:'Preferred external suppliers',
        status:'WAITING — LEADERSHIP',
        detail:'Sourcing order is approved; named preferred external partners still need to be supplied when Leadership has them.'
      },
      {
        priority:'LOW',
        topic:'High-value gear boundary',
        status:'MANAGER PROPOSAL NEEDED',
        detail:'Special/RW gear stays Leadership-controlled. After weapon values/bonuses are visible, propose an explicit value/bonus threshold for routine-vs-Leadership allocation.'
      }
    ];
    return inputs;
  }

  function minimumRowByKey(key){
    const proposal=logic.minimumProposal(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode
    });
    return proposal.proposals.find(row=>String(row.minimumOverrideKey||'')===String(key||''))||null;
  }

  async function saveMinimumControl(row,{min,orderEnabled}={}){
    if(!row)throw new Error('Minimum row is required.');
    const key=String(row.minimumOverrideKey||logic.minimumOverrideKey(stockMode,row.category,row.item,row.slot));
    const rawMin=String(min??'').trim();
    const parsedMin=rawMin===''?null:Number(rawMin);
    if(parsedMin!=null&&(!Number.isFinite(parsedMin)||parsedMin<0||!Number.isInteger(parsedMin)))throw new Error('Minimum must be a whole number of zero or more.');
    const at=new Date().toISOString();
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.stockPlanning=fi.stockPlanning&&typeof fi.stockPlanning==='object'?fi.stockPlanning:{schema:1};
      fi.stockPlanning.schema=1;
      fi.stockPlanning.minimumOverrides=fi.stockPlanning.minimumOverrides&&typeof fi.stockPlanning.minimumOverrides==='object'
        ?fi.stockPlanning.minimumOverrides:{};
      const prior=fi.stockPlanning.minimumOverrides[key]&&typeof fi.stockPlanning.minimumOverrides[key]==='object'
        ?fi.stockPlanning.minimumOverrides[key]:{};
      const next={...prior,updatedAt:at};
      if(parsedMin==null)delete next.min;
      else next.min=Math.round(parsedMin);
      if(orderEnabled==null){
        if(!Object.prototype.hasOwnProperty.call(next,'orderEnabled'))next.orderEnabled=true;
      }else{
        next.orderEnabled=Boolean(orderEnabled);
      }
      if(!Object.prototype.hasOwnProperty.call(next,'min')&&next.orderEnabled!==false)delete fi.stockPlanning.minimumOverrides[key];
      else fi.stockPlanning.minimumOverrides[key]=next;
      return draft;
    });
    state=await core.readLegacyState();
  }

  async function saveXanaxPolicy(patch={}){
    await core.updateDomainState('faction',draft=>{
      const fi=draft.factionInventory;
      fi.warPlanning=fi.warPlanning&&typeof fi.warPlanning==='object'?fi.warPlanning:{schema:1};
      fi.warPlanning.schema=1;
      const policy=fi.warPlanning.xanaxPolicy&&typeof fi.warPlanning.xanaxPolicy==='object'
        ?fi.warPlanning.xanaxPolicy:{};
      fi.warPlanning.xanaxPolicy={...policy,...patch};
      return draft;
    });
    state=await core.readLegacyState();
  }

  async function refreshWarIntelOnly(){
    if(busy)return;
    const key=factionKey();
    if(!key){activeView='settings';statusText='Save a faction-compatible API key first.';render();return;}
    const leadership=state?.factionInventory?.leadership||{};
    if(!leadership.factionId){statusText='Refresh Faction once before refreshing rival data.';render();return;}
    busy=true;statusText='Refreshing current ranked-war rival…';render();
    try{
      const warsData=await apiRequest('/faction/wars',key);
      const result=await refreshWarPlanning(key,leadership,warsData,{force:true});
      if(result.war){
        statusText='Rival refreshed: '+result.war.opponentFactionName+' · '+result.estimated+'/'+result.opponentMembers+' opponent estimates'+(result.failed?' · '+result.failed+' profile failures':'')+'.';
      }else{
        statusText='No current/upcoming ranked-war rival returned by Torn.';
      }
    }catch(error){statusText='Rival refresh failed: '+(error?.message||String(error));}
    finally{busy=false;render();}
  }

  function xanaxWarHtml(proposal){
    const estimator=proposal?.xanax;
    const row=proposal?.proposals?.find(item=>String(item.item||'').toLowerCase()==='xanax')||null;
    if(!estimator||!row)return '';
    const policy=estimator.policy||{};
    const pricing=acquisitionSourceSnapshot({item:'Xanax',marketValue:num(row.marketValue)});
    const unit=num(pricing.bestPlanning?.price)||num(row.marketValue);
    const short=num(row.shortfall);
    const estimatedCost=unit*short;
    const war=estimator.currentWar||{};
    const sourceAge=estimator.opponentFetchedAt?when(estimator.opponentFetchedAt):'not refreshed';
    const memberRowsHtml=(estimator.members||[]).map(member=>
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(member.memberName)+'</b> <span class="mm-fa-pill">'+esc(member.tier)+'</span>'+
        '<div class="mm-fa-muted">'+fmt(member.statsTotal)+(member.statsEstimated?' estimated':' verified')+' stats · '+member.credibleTargets+' credible rival target'+(member.credibleTargets===1?'':'s')+
        (member.targetNames?.length?' · '+esc(member.targetNames.join(', ')):'')+'</div></div>'+
        '<div class="mm-fa-tiles">'+
          tile('CEILING',fmt(member.ceiling))+
          tile('WAR REC',fmt(member.recommended),{cls:member.recommended?'mm-fa-good':''})+
          (member.manualOverride!=null?tile('MANUAL',fmt(member.manualOverride),{cls:'mm-fa-warn'}):'')+
        '</div>'+
        '<div class="mm-fa-actions">'+
          '<input class="mm-fa-input" data-xanax-member-input="'+esc(member.memberId)+'" type="number" min="0" max="'+Math.round(num(member.ceiling))+'" step="1" placeholder="Auto" value="'+(member.manualOverride!=null?Math.round(num(member.manualOverride)):'')+'" style="width:70px;">'+
          '<button data-xanax-member-save="'+esc(member.memberId)+'" style="'+button(member.manualOverride!=null)+'">Save</button>'+
          (member.manualOverride!=null?'<button data-xanax-member-reset="'+esc(member.memberId)+'" style="'+button()+'">Auto</button>':'')+
        '</div></div>'
    ).join('');
    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head"><div><b>Xanax War Estimator</b> <span class="mm-fa-muted">'+
        (war.opponentFactionName?'vs '+esc(war.opponentFactionName)+' · war '+esc(war.warId||'—'):'no rival resolved')+
        ' · rival cache '+esc(sourceAge)+'</span></div>'+
        '<div class="mm-fa-actions"><button id="mm-fa-refresh-war" style="'+button(true)+'">Refresh Rival</button></div></div>'+
      '<div class="mm-fa-tiles">'+
        tile('VAULT HAVE',fmt(row.current))+
        tile('LEADERSHIP CEILING',fmt(estimator.leadershipCeiling))+
        tile('MATCHUP TARGET',estimator.ready?fmt(estimator.recommendedTarget):'DATA')+
        tile('EFFECTIVE MIN',row.dataRequired?'DATA':fmt(row.effectiveMin),{cls:row.minimumOverrideActive?'mm-fa-warn':''})+
        tile('SHORT',row.dataRequired?'—':fmt(row.shortfall),{cls:short?'mm-fa-bad':'mm-fa-good'})+
        tile('ORDER',row.orderEnabled?(short?'YES':'NO — ENOUGH'):'HOLD',{cls:row.orderEnabled&&short?'mm-fa-warn':''})+
        (unit?tile('PLAN EACH','$'+fmt(unit)+' · '+String(pricing.bestPlanning?.source||'reference'),{wide:true}):tile('PLAN EACH','PRICE NOT CACHED',{wide:true}))+
        (unit&&short?tile('SHORTFALL COST','$'+fmt(estimatedCost),{cls:'mm-fa-warn'}):'')+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:5px;">'+esc(estimator.rationale)+'</div>'+
      '<div class="mm-fa-actions" style="margin-top:6px;">'+
        '<label class="mm-fa-muted">Posture <select id="mm-fa-xanax-posture" class="mm-fa-input" style="width:115px;">'+
          ['off','conserve','compete','push'].map(value=>'<option value="'+value+'" '+(policy.investmentPosture===value?'selected':'')+'>'+value.toUpperCase()+'</option>').join('')+
        '</select></label>'+
        '<label class="mm-fa-muted">Reasonable matchup ratio <input id="mm-fa-xanax-ratio" class="mm-fa-input" type="number" min="0.1" max="2" step="0.05" value="'+Number(policy.reasonableRatio||0.8).toFixed(2)+'" style="width:75px;"></label>'+
        '<label class="mm-fa-muted">High ≥ <input id="mm-fa-xanax-high" class="mm-fa-input" type="number" min="1" step="1000" value="'+Math.round(num(policy.highThreshold))+'" style="width:90px;"></label>'+
        '<label class="mm-fa-muted">Medium ≥ <input id="mm-fa-xanax-medium" class="mm-fa-input" type="number" min="1" step="500" value="'+Math.round(num(policy.mediumThreshold))+'" style="width:90px;"></label>'+
        '<label class="mm-fa-muted">High cap <input id="mm-fa-xanax-high-cap" class="mm-fa-input" type="number" min="0" step="1" value="'+Math.round(num(policy.highCeiling))+'" style="width:55px;"></label>'+
        '<label class="mm-fa-muted">Med cap <input id="mm-fa-xanax-medium-cap" class="mm-fa-input" type="number" min="0" step="1" value="'+Math.round(num(policy.mediumCeiling))+'" style="width:55px;"></label>'+
        '<label class="mm-fa-muted">Low cap <input id="mm-fa-xanax-low-cap" class="mm-fa-input" type="number" min="0" step="1" value="'+Math.round(num(policy.lowCeiling))+'" style="width:55px;"></label>'+
        '<button id="mm-fa-save-xanax-policy" style="'+button(true)+'">Save Xanax Policy</button>'+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:5px;">CONSERVE is the current leadership-loss posture: only credible rival matchups create a recommendation, capped by the agreed tier allowance. Any field or member allocation can be changed manually.</div>'+
      '<details class="mm-fa-details" style="margin-top:5px;"><summary>Member Xanax recommendations · '+(estimator.members||[]).length+'</summary><div style="margin-top:4px;">'+memberRowsHtml+'</div></details>'+
    '</div>';
  }

  function minimumsHtml(){
    const proposal=logic.minimumProposal(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode
    });
    const inputs=minimumOpenInputs(proposal);
    const categories=[...new Set(proposal.proposals.map(row=>String(row.category||'other')))];
    const modeLabel=stockMode==='war'?'WAR · '+proposal.participants+' CURRENT MEMBERS':'PEACE';
    const numeric=proposal.proposals.filter(row=>!row.dataRequired);
    const shortRows=numeric.filter(row=>num(row.shortfall)>0);
    const orderRows=shortRows.filter(row=>row.orderEnabled);
    const heldRows=shortRows.filter(row=>!row.orderEnabled);
    const dataRows=proposal.proposals.filter(row=>row.dataRequired);
    const groups=categories.map(cat=>{
      const rows=proposal.proposals.filter(row=>String(row.category||'other')===cat)
        .filter(row=>!(stockMode==='war'&&String(row.item||'').toLowerCase()==='xanax'))
        .sort((a,b)=>(b.shortfall||0)-(a.shortfall||0)||String(a.item).localeCompare(String(b.item)));
      if(!rows.length)return '';
      const short=rows.reduce((sum,row)=>sum+num(row.shortfall),0);
      return '<details class="mm-fa-build-member" '+(['medical','temporary'].includes(cat)?'open':'')+'>'+
        '<summary><span class="mm-fa-build-summary-main"><b>'+esc(cat.toUpperCase())+'</b><span class="mm-fa-pill">'+rows.length+' lines</span></span><span class="mm-fa-muted">'+short+' short</span></summary>'+
        '<div class="mm-fa-build-body">'+rows.map(row=>{
          const key=String(row.minimumOverrideKey||'');
          const inputValue=row.manualMin!=null?row.manualMin:(row.suggestedMin!=null?row.suggestedMin:'');
          const statusClass=row.status==='ENOUGH'?'mm-fa-good':row.status==='ORDER'?'mm-fa-bad':'mm-fa-warn';
          return '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.item)+'</b>'+
            '<div class="mm-fa-muted">'+esc(row.rationale)+'</div>'+
            '<div class="mm-fa-actions" style="margin-top:4px;">'+
              '<label class="mm-fa-muted">Minimum <input class="mm-fa-input" data-min-input="'+esc(key)+'" type="number" min="0" step="1" value="'+esc(inputValue)+'" '+(row.dataRequired&&!row.minimumOverrideActive?'placeholder="Set manually"':'')+' style="width:82px;"></label>'+
              '<button data-save-min="'+esc(key)+'" style="'+button(row.minimumOverrideActive)+'">Save Minimum</button>'+
              (row.minimumOverrideActive?'<button data-reset-min="'+esc(key)+'" style="'+button()+'">Use Suggested</button>':'')+
              '<button data-toggle-min-order="'+esc(key)+'" style="'+button(row.orderEnabled)+'">'+(row.orderEnabled?'Order Shortfall':'Hold / Don\'t Order')+'</button>'+
            '</div></div>'+
            '<div class="mm-fa-tiles">'+
              tile('HAVE',fmt(row.current))+
              tile('SUGGESTED',row.suggestedMin==null?'DATA':fmt(row.suggestedMin))+
              tile('EFFECTIVE MIN',row.dataRequired?'DATA':fmt(row.effectiveMin),{cls:row.minimumOverrideActive?'mm-fa-warn':''})+
              tile('SHORT',row.dataRequired?'—':fmt(row.shortfall),{cls:num(row.shortfall)>0?'mm-fa-bad':''})+
              tile('STATUS',row.status,{cls:statusClass})+
            '</div></div>';
        }).join('')+'</div></details>';
    }).join('');
    const inputHtml=inputs.map(row=>
      '<div class="mm-fa-row"><div class="mm-fa-main"><b>'+esc(row.priority)+' · '+esc(row.topic)+'</b><div class="mm-fa-muted">'+esc(row.detail)+'</div></div>'+
      '<span class="'+(row.status==='READY'||row.status==='COMPLETE'||row.status==='MATURE'||row.status==='READY TO DESIGN'?'mm-fa-good':row.status.includes('WAITING')||row.status==='COLLECTING'||row.status==='IN PROGRESS'?'mm-fa-warn':'mm-fa-bad')+'">'+esc(row.status)+'</span></div>'
    ).join('');
    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head"><div><b>War Stock Control</b> <span class="mm-fa-muted">'+modeLabel+' · '+procurementMode.toUpperCase()+' · '+proposal.observedDays.toFixed(1)+'d history · '+proposal.confidence+'</span></div>'+
      '<div class="mm-fa-actions"><button data-stock-mode="peace" style="'+button(stockMode==='peace')+'">Peace</button><button data-stock-mode="war" style="'+button(stockMode==='war')+'">War</button><button id="mm-fa-export" style="'+button(true)+'">Leadership Excel</button></div></div>'+
      '<div class="mm-fa-tiles">'+
        tile('LINES',proposal.proposals.length)+
        tile('ORDER NOW',orderRows.length,{cls:orderRows.length?'mm-fa-bad':'mm-fa-good'})+
        tile('SHORT / HOLD',heldRows.length,{cls:heldRows.length?'mm-fa-warn':''})+
        tile('DATA REQUIRED',dataRows.length,{cls:dataRows.length?'mm-fa-warn':''})+
      '</div>'+
      '<div class="mm-fa-muted" style="margin-top:5px;"><b>Live rule:</b> Acquire uses the same effective minimum shown here. Change a minimum, order/hold decision, member readiness input, Xanax policy, rival estimate, or faction stock and the shortfall is recalculated automatically.</div>'+
    '</div>'+
    (stockMode==='war'?xanaxWarHtml(proposal):'')+
    '<details class="mm-fa-build-member"><summary><span class="mm-fa-build-summary-main"><b>Planning dependencies</b><span class="mm-fa-pill">'+inputs.filter(row=>!['READY','COMPLETE','MATURE','READY TO DESIGN'].includes(row.status)).length+' open</span></span><span class="mm-fa-muted">data that can improve the recommendation</span></summary><div class="mm-fa-build-body">'+inputHtml+'</div></details>'+
    groups;
  }

  function sharedItemRecordByName(name){
    const wanted=String(name||'').trim().toLowerCase();
    if(!wanted)return null;
    const torn=state?.factionInventory?.equipmentMarketCatalog?.byName?.[wanted]||null;
    for(const [id,row] of Object.entries(state?.procurement?.catalog||{})){
      if(String(row?.name||'').trim().toLowerCase()===wanted)return {itemId:String(id),...(torn||{}),...(row||{}),name:String(row?.name||torn?.name||name)};
    }
    for(const row of Object.values(state?.marketIntel?.marketplace||{})){
      if(String(row?.itemName||'').trim().toLowerCase()===wanted)return {...(torn||{}),itemId:String(row.itemId||torn?.itemId||''),name:String(row.itemName||torn?.name||name),type:String(row.type||torn?.type||'')};
    }
    for(const row of state?.travelIntel?.rows||[]){
      if(String(row?.itemName||'').trim().toLowerCase()===wanted&&row?.itemId)return {...(torn||{}),itemId:String(row.itemId),name:String(row.itemName||torn?.name||name),type:String(torn?.type||'')};
    }
    return torn?{...torn}:null;
  }

  function acquisitionSourceSnapshot(row){
    const itemName=String(row?.item||'');
    const record=sharedItemRecordByName(itemName)||{};
    const itemId=String(record.itemId||'');
    const snap=itemId?state?.procurement?.marketSnapshots?.[itemId]||{}:{};
    const detail=itemId?state?.marketIntel?.details?.[itemId]||{}:{};
    const bazaar=(detail.organicListings||[])
      .filter(x=>num(x?.price)>0&&num(x?.quantity)>0)
      .slice().sort((a,b)=>num(a.price)-num(b.price))[0]||null;
    const travel=(state?.travelIntel?.rows||[])
      .filter(x=>num(x?.stock)>0&&(
        (itemId&&String(x?.itemId||'')===itemId)||
        String(x?.itemName||'').trim().toLowerCase()===itemName.trim().toLowerCase()
      ))
      .slice().sort((a,b)=>(num(a.shopCost)||Number.MAX_SAFE_INTEGER)-(num(b.shopCost)||Number.MAX_SAFE_INTEGER))[0]||null;
    const itemMarketPrice=num(snap?.itemMarket?.lowest);
    const bazaarPrice=num(bazaar?.price)||num(snap?.bazaar?.lowest);
    const travelPrice=num(travel?.shopCost);
    const tornMarketPrice=num(record?.marketPrice??record?.market_price??record?.marketValue??record?.market_value);
    const itemMarketFetchedAt=String(snap?.itemMarket?.fetchedAt||snap?.itemMarket?.updatedAt||snap?.fetchedAt||'');
    const bazaarFetchedAt=String(bazaar?.fetchedAt||detail?.fetchedAt||snap?.bazaar?.fetchedAt||snap?.fetchedAt||'');
    const travelFetchedAt=String(travel?.fetchedAt||travel?.localFetchedAt||state?.travelIntel?.fetchedAt||'');
    const liveCandidates=[
      itemMarketPrice?{source:'Item Market',price:itemMarketPrice,fetchedAt:itemMarketFetchedAt}:null,
      bazaarPrice?{source:'Bazaar',price:bazaarPrice,fetchedAt:bazaarFetchedAt}:null,
      travelPrice?{source:'Overseas',price:travelPrice,country:String(travel?.country||''),fetchedAt:travelFetchedAt}:null
    ].filter(Boolean).sort((a,b)=>a.price-b.price);
    const best=liveCandidates[0]||null;
    const fallback=tornMarketPrice
      ?{source:'Torn Market Reference',price:tornMarketPrice,fetchedAt:String(record?.fetchedAt||''),referenceOnly:true}
      :num(row?.marketValue)
        ?{source:'Armory Static Reference',price:num(row.marketValue),fetchedAt:'',referenceOnly:true}
        :null;
    const bestPlanning=best||fallback;
    return {
      itemId,
      itemMarketPrice,
      itemMarketFetchedAt,
      bazaarPrice,
      bazaarFetchedAt,
      bazaarSellerId:String(bazaar?.sellerId||''),
      travelPrice,
      travelFetchedAt,
      travelCountry:String(travel?.country||''),
      travelStock:num(travel?.stock),
      tornMarketPrice,
      tornMarketFetchedAt:String(record?.fetchedAt||''),
      best,
      bestPlanning,
      liveCandidates,
      priceEvidence:best?'LIVE CACHED SOURCE':tornMarketPrice?'TORN MARKET REFERENCE':num(row?.marketValue)?'ARMORY STATIC REFERENCE':'UNPRICED'
    };
  }

  function handoffAcquisition(row,preferredSource='Best'){
    const source=acquisitionSourceSnapshot(row);
    const requestedQty=row?.fundedQty!=null?Math.round(num(row.fundedQty)):Math.round(num(row?.qty));
    if(requestedQty<=0){
      statusText=row?.fundingStatus==='PRICE UNKNOWN'
        ?'No budget-safe quantity was sent for '+String(row?.item||'this item')+' because its planning price is unresolved. Refresh/check pricing first.'
        :'Planned / budget-funded quantity is 0 for '+String(row?.item||'this item')+'. Nothing was sent to MM_Acquisitions.';
      render();
      return;
    }
    const referenceValue=num(row?.planningUnit)||num(source.bestPlanning?.price)||num(row?.marketValue);
    const payload={
      itemName:String(row?.item||''),
      itemId:source.itemId,
      qty:requestedQty,
      preferredSource:String(preferredSource||'Best'),
      referenceValue,
      sourceCountry:source.travelCountry,
      armoryReason:String(row?.reasons||'Faction Armory requirement')+
        (row?.priceEvidence?' · Armory price evidence: '+String(row.priceEvidence):'')
    };
    try{
      if(!channel)channel=new BroadcastChannel(CHANNEL);
      channel.postMessage({type:'armory-acquisition-request',payload});
      statusText='Sent '+payload.itemName+' x'+payload.qty+' to MM_Acquisitions · preferred '+payload.preferredSource+
        ' · reference $'+fmt(referenceValue)+'. Final purchase remains manual.';
    }catch(error){
      statusText='Could not hand off acquisition: '+(error?.message||String(error));
    }
    render();
  }

  function acquisitionPriceBand(row){
    const live=acquisitionSourceSnapshot(row);
    const livePrices=[num(live.itemMarketPrice),num(live.bazaarPrice),num(live.travelPrice)].filter(value=>value>0);
    const fallbackPrices=[num(live.tornMarketPrice),num(row?.marketValue)].filter(value=>value>0);
    const comparisonPrices=livePrices.length?livePrices:fallbackPrices;
    const qty=Math.max(0,Math.round(num(row?.qty)));
    const planningUnit=num(live.bestPlanning?.price);
    const planningSource=String(live.bestPlanning?.source||'');
    if(!comparisonPrices.length||!planningUnit){
      return {
        low:0,high:0,lowTotal:0,highTotal:0,
        planningUnit:0,planningTotal:0,planningSource:'',
        planningFetchedAt:'',priceEvidence:'UNPRICED',priced:false
      };
    }
    const low=Math.min(...comparisonPrices);
    const high=Math.max(...comparisonPrices);
    return {
      low,high,lowTotal:low*qty,highTotal:high*qty,
      planningUnit,planningTotal:planningUnit*qty,planningSource,
      planningFetchedAt:String(live.bestPlanning?.fetchedAt||''),
      priceEvidence:String(live.priceEvidence||''),
      priced:true,
      liveRange:Boolean(livePrices.length)
    };
  }

  function acquisitionAccuracyPlan(){
    const base=logic.acquisitionPlan(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode,
      budgetCap:acquisitionBudget
    });
    const quotes={};
    for(const row of base.list){
      const band=acquisitionPriceBand(row);
      quotes[logic.acquisitionQuoteKey(row.category,row.item)]={
        planningUnit:band.planningUnit,
        planningSource:band.planningSource,
        planningFetchedAt:band.planningFetchedAt,
        priceEvidence:band.priceEvidence,
        low:band.low,
        high:band.high,
        liveRange:band.liveRange
      };
    }
    return logic.reconcileAcquisitionPricing(base,quotes,acquisitionBudget);
  }

  function leaderAcquisitionReport(){
    const members=memberRows();
    const isWar=stockMode==='war';
    const plan=logic.acquisitionPlan(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode,
      budgetCap:acquisitionBudget
    });
    const minimums=logic.minimumProposal(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode
    });
    const procurementPasses=members.filter(row=>row.procurementPassCurrent);
    const nonReady=new Map(
      members.filter(row=>row.readinessStatus!=='WAR READY'&&!row.procurementPassCurrent).map(row=>[row.memberId,row])
    );
    const memberNeeds=isWar
      ? plan.assignments.filter(row=>row.route==='ACQUIRE'&&nonReady.has(row.memberId))
      : [];
    const minNeeds=(minimums?.actionable||[]).filter(row=>num(row.shortfall)>0&&(isWar?row.kind!=='equipment':true));
    const heldNeeds=(minimums?.held||[]).filter(row=>num(row.shortfall)>0&&(isWar?row.kind!=='equipment':true));
    const priceRows=plan.list.map(row=>({row,band:acquisitionPriceBand(row)}));
    const priced=priceRows.filter(item=>item.band.priced);
    const plannedTotal=priced.reduce((sum,item)=>sum+item.band.planningTotal,0);
    const lowTotal=priced.reduce((sum,item)=>sum+item.band.lowTotal,0);
    const highTotal=priced.reduce((sum,item)=>sum+item.band.highTotal,0);
    const unpriced=priceRows.filter(item=>!item.band.priced);

    const lines=[
      isWar?'FACTION ARMORY WAR ACQUISITION REPORT':'FACTION ARMORY PEACE MINIMUMS REPORT',
      'Mode: '+stockMode.toUpperCase()+' / '+procurementMode.toUpperCase(),
      'Current roster: '+members.length+' members'
    ];

    if(isWar){
      lines.push(
        'Approved War Ready: '+members.filter(row=>row.readinessStatus==='WAR READY').length,
        'Procurement Pass / Excluded: '+procurementPasses.length,
        'Active acquisition members: '+nonReady.size,
        'Scope: WAR — active member equipment, two equipment spares per slot, and approved war-stock shortfalls.',
        minimums?.xanax
          ? 'Xanax: '+minimums.xanax.policy.investmentPosture.toUpperCase()+' vs '+(minimums.xanax.opponentFactionName||'unresolved rival')+
            ' · matchup target '+fmt(minimums.xanax.recommendedTarget)+' · leadership ceiling '+fmt(minimums.xanax.leadershipCeiling)
          : 'Xanax: estimator unavailable.',
        '',
        'INDIVIDUAL MEMBER WAR BUILD NEEDS'
      );

      if(memberNeeds.length){
        for(const need of memberNeeds){
          const row=nonReady.get(need.memberId);
          lines.push(
            '- '+need.memberName+' ['+need.memberId+'] · '+String(need.slot||'').toUpperCase()+
            ' → '+need.item+(row?.statsEstimated?' (balanced public estimate)':'')
          );
        }
      }else{
        lines.push('- No member build equipment currently requires purchase.');
      }

      lines.push('','WAR STOCK SHORTFALLS');
      if(minNeeds.length){
        for(const need of minNeeds){
          lines.push('- '+need.item+' · have '+fmt(need.current)+' / min '+fmt(need.effectiveMin)+' · acquire '+fmt(need.shortfall));
        }
      }else{
        lines.push('- No approved war-stock shortfalls currently require acquisition.');
      }
      if(heldNeeds.length){
        lines.push('','SHORTFALLS ON HOLD');
        for(const need of heldNeeds)lines.push('- '+need.item+' · short '+fmt(need.shortfall)+' · HOLD / DO NOT ORDER');
      }
    }else{
      lines.push(
        'Scope: PEACE ONLY — replenish faction minimum stock. Member build/equipment gaps are deferred until War mode.',
        '',
        'MINIMUM STOCK SHORTFALLS'
      );
      if(minNeeds.length){
        for(const need of minNeeds){
          lines.push(
            '- '+need.category+' · '+need.item+' · short '+fmt(need.shortfall)+
            ' (target '+fmt(need.recommendedMin)+')'
          );
        }
      }else{
        lines.push('- No current Peace minimum-stock shortfalls.');
      }
    }

    lines.push('',isWar?'WAR ACQUISITION LIST / PRICE RANGE':'PEACE MINIMUM REPLENISHMENT / PRICE RANGE');
    if(priceRows.length){
      for(const item of priceRows){
        const row=item.row;
        const band=item.band;
        lines.push(
          '- '+row.item+' x'+fmt(row.qty)+(row.manualQtyOverride!=null?' (manual; system '+fmt(row.systemQty)+')':'')+' · '+
          (band.priced
            ? '$'+fmt(band.planningUnit)+' each via '+band.planningSource+' · $'+fmt(band.planningTotal)+' planned line total'+
              (band.low!==band.high?' · source range $'+fmt(band.low)+'–$'+fmt(band.high):'')
            : 'price unresolved')+
          (row.reasons?' · '+row.reasons:'')
        );
      }
    }else{
      lines.push(isWar?'- No War acquisition is currently required.':'- No Peace minimum replenishment is currently required.');
    }

    lines.push('',isWar?'PLANNED WAR ACQUISITION ESTIMATE':'PLANNED PEACE MINIMUM REPLENISHMENT ESTIMATE');
    lines.push(priced.length?'$'+fmt(plannedTotal):'$0 known');
    if(priced.length&&lowTotal!==highTotal){
      lines.push('Cross-source diagnostic range: $'+fmt(lowTotal)+' – $'+fmt(highTotal)+' (not the planned estimate).');
    }
    if(unpriced.length){
      lines.push(
        'Unpriced requirements: '+
        unpriced.map(item=>item.row.item+' x'+fmt(item.row.qty)).join(', ')
      );
    }
    lines.push(
      '',
      'Price range uses currently cached reference / Item Market / Bazaar / overseas values. '+
      'MM_Acquisitions should verify live availability and price before purchase.',
      '',
      '— Manic Mike',
      'Inventory Manager'
    );
    return lines.join('\n');
  }

  function messageFactionLeader(){
    const leadership=state?.factionInventory?.leadership||{};
    const leaderId=asId(leadership.leaderId);
    if(!leaderId)throw new Error('Faction leader is not resolved. Refresh Faction first.');
    openArmoryMessage({
      playerId:leaderId,
      playerName:String(leadership.leaderName||leaderId),
      subject:'Faction Armory '+stockMode.toUpperCase()+' acquisition report',
      body:leaderAcquisitionReport(),
      kind:'leader-acquisition-report'
    });
  }

  function acquireHtml(){
    const plan=logic.acquisitionPlan(state?.factionInventory||{},{
      mode:stockMode,
      procurementMode,
      budgetCap:acquisitionBudget
    });
    const categories=[...new Set(plan.list.map(row=>row.category))];
    const groups=categories.map(cat=>{
      const rows=plan.list.filter(row=>row.category===cat);
      return '<details class="mm-fa-build-member" open>'+
        '<summary><span class="mm-fa-build-summary-main"><b>'+esc(cat.toUpperCase())+
        '</b><span class="mm-fa-pill">'+rows.length+' items</span></span><span class="mm-fa-muted">'+
        rows.reduce((sum,row)=>sum+num(row.qty),0)+' planned</span></summary>'+
        '<div class="mm-fa-build-body">'+rows.map(row=>{
          const live=acquisitionSourceSnapshot(row);
          const best=live.best;
          const band=acquisitionPriceBand(row);
          return '<div class="mm-fa-row">'+
            '<div class="mm-fa-main"><b>'+esc(row.item)+'</b>'+
              '<div class="mm-fa-muted">'+esc(row.source||'General Torn availability')+
                (row.reasons?' · '+esc(row.reasons):'')+'</div>'+
              '<div class="mm-fa-mini" style="margin-top:3px;">'+
                (best
                  ? 'Lowest observed source: '+esc(best.source)+(best.country?' · '+esc(best.country):'')+
                    ' · $'+fmt(best.price)
                  : 'No live market/travel price cached yet — MM_Acquisitions will verify before routing.')+
              '</div>'+
              '<div class="mm-fa-actions" style="margin-top:4px;">'+
                '<label class="mm-fa-muted">Planned qty <input class="mm-fa-input" data-acq-qty-input="'+esc(row.item)+'" data-acq-qty-category="'+esc(row.category)+'" type="number" min="0" step="1" value="'+Math.round(num(row.qty))+'" style="width:72px;"></label>'+
                '<button data-save-acq-qty="'+esc(row.item)+'" data-acq-qty-category="'+esc(row.category)+'" style="'+button(row.manualQtyOverride!=null)+'">Save Qty</button>'+
                (row.manualQtyOverride!=null?'<button data-reset-acq-qty="'+esc(row.item)+'" data-acq-qty-category="'+esc(row.category)+'" style="'+button()+'">Reset '+fmt(row.systemQty)+'</button>':'')+
                '<button data-armory-acquire="'+esc(row.item)+'" data-source="Best" style="'+button(true)+'">Find Best Source</button>'+
                '<button data-armory-acquire="'+esc(row.item)+'" data-source="Item Market" style="'+button()+'">Item Market</button>'+
                '<button data-armory-acquire="'+esc(row.item)+'" data-source="Bazaar" style="'+button()+'">Bazaar</button>'+
                '<button data-armory-acquire="'+esc(row.item)+'" data-source="Overseas" style="'+button()+'">Overseas</button>'+
              '</div>'+
            '</div>'+
            '<div class="mm-fa-tiles">'+
              tile('SYSTEM',fmt(row.systemQty))+
              tile('PLANNED',fmt(row.qty),{cls:row.manualQtyOverride!=null?'mm-fa-warn':''})+
              tile('BUY NOW',fmt(row.fundedQty),{cls:row.fundedQty?'mm-fa-good':''})+
              (row.deferredQty?tile('DEFER',fmt(row.deferredQty),{cls:'mm-fa-warn'}):'')+
              (row.marketValue?tile('REF EACH','$'+fmt(row.marketValue)):'')+
              (live.itemMarketPrice?tile('ITEM MKT','$'+fmt(live.itemMarketPrice)):'')+
              (live.bazaarPrice?tile('BAZAAR','$'+fmt(live.bazaarPrice)):'')+
              (live.travelPrice?tile('OVERSEAS','$'+fmt(live.travelPrice)+(live.travelCountry?' · '+live.travelCountry:''),{wide:true}):'')+
              (band.priced?tile('PLAN EACH','$'+fmt(band.planningUnit)+' · '+band.planningSource,{wide:true}):'')+
              (band.priced?tile('PLAN LINE','$'+fmt(band.planningTotal)):'')+
              (band.priced&&band.low!==band.high?tile('SOURCE RANGE','$'+fmt(band.low)+' – $'+fmt(band.high),{wide:true}):'')+
              (row.fundedEstimatedValue?tile('STATIC-CAP COST','$'+fmt(row.fundedEstimatedValue)):'')+
            '</div>'+
          '</div>';
        }).join('')+
        '</div>'+
      '</details>';
    }).join('');

    const leadership=state?.factionInventory?.leadership||{};
    const leaderBaseLabel=leadership.leaderName&&leadership.leaderName!==leadership.leaderId
      ? 'Message '+leadership.leaderName
      : 'Message Faction Leader';
    const leaderLabel=leaderBaseLabel+(stockMode==='war'?' · War Needs':' · Peace / Minimums');

    return '<div class="mm-fa-card mm-fa-compact">'+
      '<div class="mm-fa-module-head">'+
        '<div><b>Acquisition requirement</b> <span class="mm-fa-muted">'+stockMode.toUpperCase()+
          ' · '+procurementMode.toUpperCase()+' · '+plan.participants+' current faction members</span></div>'+
        '<div class="mm-fa-actions">'+
          '<button data-stock-mode="peace" style="'+button(stockMode==='peace')+'">Peace</button>'+
          '<button data-stock-mode="war" style="'+button(stockMode==='war')+'">War</button>'+
          '<button data-procurement-mode="budget" style="'+button(procurementMode==='budget')+'">Budget</button>'+
          '<button data-procurement-mode="standard" style="'+button(procurementMode==='standard')+'">Standard</button>'+
          '<button data-procurement-mode="ideal" style="'+button(procurementMode==='ideal')+'">Ideal</button>'+
        '</div>'+
      '</div>'+
      '<div class="mm-fa-tiles">'+
        tile('CURRENT MEMBERS',fmt(plan.participants))+
        tile('PROCUREMENT PASSES',fmt(memberRows().filter(row=>row.procurementPassCurrent).length))+
        tile('BUDGET CAP','$'+fmt(plan.budgetCap))+
        tile('BUY NOW','$'+fmt(plan.fundedEstimatedValue),{cls:'mm-fa-good'})+
        tile('KNOWN DEFERRED','$'+fmt(plan.deferredEstimatedValue),{cls:plan.deferredEstimatedValue?'mm-fa-warn':''})+
        tile('FUNDED UNITS',fmt(plan.fundedUnits))+
        tile('UNRESOLVED SLOTS',fmt(plan.unresolvedCount),{cls:plan.unresolvedCount?'mm-fa-warn':''})+
      '</div>'+
      '<div class="mm-fa-actions" style="margin-top:5px;">'+
        '<label class="mm-fa-muted">Budget $ <input id="mm-fa-budget-cap" class="mm-fa-input" type="number" min="0" step="100000" value="'+
          Math.round(acquisitionBudget)+'" style="width:130px;"></label>'+
        '<button id="mm-fa-save-budget" style="'+button(true)+'">Save Budget</button>'+
        '<button id="mm-fa-message-leader" style="'+button(true)+'">'+esc(leaderLabel)+'</button>'+
      '</div>'+
      '<div class="mm-fa-muted" style="margin-top:4px;">'+
        (stockMode==='war'
          ? 'War mode: acquire only non-War-Ready member equipment plus war equipment spares. Routine minimum-stock replenishment waits for Peace mode. '
          : 'Peace mode: replenish faction minimum stock only. Individual member equipment needs are deferred until War mode. ')+
        'Approved War Ready and current Procurement Pass members generate no individual equipment acquisition. Manual item quantities override planning/output only; they do not rewrite readiness or inventory facts. Members without private stats use a clearly labeled balanced public estimate; faction loans are counted before purchases. '+
        'Cached Item Market, Bazaar, overseas, and reference prices provide low/high planning estimates; MM_Acquisitions performs live source verification before purchase.'+
      '</div>'+
      (plan.unresolvedCount
        ? '<details class="mm-fa-details"><summary>Unresolved build slots</summary><div class="mm-fa-muted" style="margin-top:3px;">'+
          plan.unresolved.map(row=>esc(row.memberName)+' · '+esc(row.slot.toUpperCase())+
            (row.current?' · '+esc(row.current):'')+' · '+esc(row.reason||'')).join('<br>')+
          '</div></details>'
        : '')+
    '</div>'+(groups||card('Nothing currently requires acquisition.'));
  }

  function settingsHtml(){
    const keySaved=Boolean(factionKey());
    return card(
      '<b>Faction API</b><div class="mm-fa-muted">Stored only in this Faction Armory userscript. '+(keySaved?'Saved — automatic faction refresh is enabled when Torn data is due.':'Not saved — cached faction data cannot refresh automatically.')+'</div>'+
      '<div class="mm-fa-grid" style="grid-template-columns:minmax(220px,1fr) auto auto;margin-top:7px;">'+
        '<input id="mm-fa-faction-key" class="mm-fa-input" type="password" autocomplete="off" placeholder="'+(keySaved?'Faction API key saved':'Faction-compatible Limited/custom API key')+'">'+
        '<button id="mm-fa-save-faction-key" style="'+button(true)+'">Save</button>'+
        '<button id="mm-fa-clear-faction-key" style="'+button()+'">Clear</button>'+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:6px;">API use: stored locally only, shared with nobody, used only for faction inventory/readiness, and never sent to another service. Member keys remain in the encrypted Armory vault.</div>'+
      '<div style="border-top:1px solid #333;margin-top:8px;padding-top:7px;"><b>Procurement policy</b></div>'+
      '<div class="mm-fa-actions" style="margin-top:5px;">'+
        '<button data-procurement-mode="budget" style="'+button(procurementMode==='budget')+'">Budget</button>'+
        '<button data-procurement-mode="standard" style="'+button(procurementMode==='standard')+'">Standard</button>'+
        '<button data-procurement-mode="ideal" style="'+button(procurementMode==='ideal')+'">Ideal</button>'+
        '<label class="mm-fa-muted">Acquisition cap $ <input id="mm-fa-settings-budget" class="mm-fa-input" type="number" min="0" step="100000" value="'+Math.round(acquisitionBudget)+'" style="width:140px;"></label>'+
        '<button id="mm-fa-settings-budget-save" style="'+button(true)+'">Save</button>'+
      '</div>'+
      '<div class="mm-fa-mini" style="margin-top:5px;">Budget is the default for a small/growing faction. It chooses lower-cost acceptable reference equipment, then counts member-owned gear, existing loans, and faction stock before creating purchases. Standard/Ideal are planning alternatives, not purchase authorization.</div>'
    );
  }

  function sourceStrip(){
    const fi=state?.factionInventory||{};
    const rival=fi.warPlanning?.currentWar?.opponentFactionName||'none';
    return '<div class="mm-fa-muted" style="margin-bottom:3px;">Faction cache '+when(fi.lastSyncAt)+' · roster '+when(fi.memberReadiness?.lastRosterSyncAt)+' · market refs '+when(fi.equipmentMarketCatalog?.fetchedAt)+' · rival '+esc(rival)+' '+when(fi.warPlanning?.opponent?.fetchedAt)+' · '+Object.keys(fi.current||{}).length+' inventory rows</div>';
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
    equipmentOptionPriceMemo=new Map();
    const viewHtml=activeView==='members'?membersHtml()
      :activeView==='builds'?buildsHtml()
      :activeView==='inventory'?inventoryHtml()
      :activeView==='coverage'?coverageHtml()
      :activeView==='minimums'?minimumsHtml()
      :activeView==='acquire'?acquireHtml()
      :settingsHtml();
    root.innerHTML=
      '<div class="mm-fa-head"><div><b style="font-size:14px;">MM Faction Armory</b><div class="mm-fa-muted">v'+VERSION+' · task-first faction readiness</div></div><button id="mm-fa-close" style="'+button()+'">×</button></div>'+
      '<div class="mm-fa-body">'+
        '<div class="mm-fa-tabs">'+
          '<button data-view="members" style="'+button(activeView==='members')+'">Members</button>'+
          '<button data-view="builds" style="'+button(activeView==='builds')+'">Builds</button>'+
          '<button data-view="inventory" style="'+button(activeView==='inventory')+'">Stock</button>'+
          '<button data-view="coverage" style="'+button(activeView==='coverage')+'">Coverage</button>'+
          '<button data-view="minimums" style="'+button(activeView==='minimums')+'">Minimums</button>'+
          '<button data-view="acquire" style="'+button(activeView==='acquire')+'">Acquire</button>'+
          '<button data-view="settings" style="'+button(activeView==='settings')+'">Settings</button>'+
        '</div>'+
        '<div class="mm-fa-status">'+esc(statusText)+'</div>'+
        sourceStrip()+
        (loadError?card('<span class="mm-fa-bad"><b>Shared state unavailable:</b> '+esc(loadError)+'</span>'):'')+
        '<div class="mm-fa-scroll">'+viewHtml+'</div>'+
      '</div>'+
      equipmentOverrideMenuHtml();

    core?.makePanelDraggable?.(
      root,
      root.querySelector('.mm-fa-head'),
      'faction-armory',
      window.innerWidth<=620?{right:'4px',top:'54px'}:{right:'12px',top:'72px'}
    );
    root.querySelector('#mm-fa-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view||'members';render();}));
    root.querySelector('#mm-fa-quick-build-member')?.addEventListener('change',event=>{
      selectedBuildMemberId=asId(event.currentTarget.value);
      render();
    });
    root.querySelector('#mm-fa-quick-build-message')?.addEventListener('click',()=>{
      const row=memberRows().find(item=>item.memberId===asId(selectedBuildMemberId));
      try{quickBuildMessage(row);}
      catch(error){statusText='Build message could not be prepared: '+(error?.message||String(error));render();}
    });
    root.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{selectedCategory=b.dataset.cat||'all';render();}));
    root.querySelectorAll('[data-stock-mode]').forEach(b=>b.addEventListener('click',()=>{
      stockMode=b.dataset.stockMode==='peace'?'peace':'war';
      GM_setValue(STOCK_MODE_KEY,stockMode);
      const count=Object.keys(state?.factionInventory?.memberReadiness?.roster||{}).length; statusText='Inventory minimum mode: '+(stockMode==='war'?'WAR ('+count+' current members)':'PEACE')+'.';
      render();
    }));
    root.querySelector('#mm-fa-refresh-war')?.addEventListener('click',refreshWarIntelOnly);
    root.querySelectorAll('[data-save-min]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const key=String(b.dataset.saveMin||'');
      const row=minimumRowByKey(key);
      const input=[...root.querySelectorAll('[data-min-input]')].find(node=>String(node.dataset.minInput||'')===key);
      if(!row||!input)return;
      busy=true;statusText='Saving '+row.item+' minimum…';render();
      try{
        await saveMinimumControl(row,{min:input.value});
        statusText=row.item+' minimum saved. Minimums, Xanax/stock comparison, Acquire, leader report, and export now use the updated value.';
      }catch(error){statusText='Minimum update failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-reset-min]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const row=minimumRowByKey(String(b.dataset.resetMin||''));
      if(!row)return;
      busy=true;statusText='Restoring suggested minimum…';render();
      try{
        await saveMinimumControl(row,{min:null});
        statusText=row.item+' returned to the live suggested minimum.';
      }catch(error){statusText='Minimum reset failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-toggle-min-order]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const row=minimumRowByKey(String(b.dataset.toggleMinOrder||''));
      if(!row)return;
      busy=true;statusText='Updating '+row.item+' order decision…';render();
      try{
        await saveMinimumControl(row,{min:row.manualMin,orderEnabled:!row.orderEnabled});
        statusText=row.item+': '+(!row.orderEnabled?'ORDER SHORTFALL':'HOLD / DO NOT ORDER')+'. Acquire updated automatically.';
      }catch(error){statusText='Order decision failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelector('#mm-fa-save-xanax-policy')?.addEventListener('click',async()=>{
      if(busy)return;
      const read=id=>root.querySelector(id)?.value;
      const patch={
        investmentPosture:String(read('#mm-fa-xanax-posture')||'conserve').toLowerCase(),
        reasonableRatio:Math.max(0.1,Math.min(2,Number(read('#mm-fa-xanax-ratio'))||0.8)),
        highThreshold:Math.max(1,Math.round(Number(read('#mm-fa-xanax-high'))||25000)),
        mediumThreshold:Math.max(1,Math.round(Number(read('#mm-fa-xanax-medium'))||5000)),
        highCeiling:Math.max(0,Math.round(Number(read('#mm-fa-xanax-high-cap'))||0)),
        mediumCeiling:Math.max(0,Math.round(Number(read('#mm-fa-xanax-medium-cap'))||0)),
        lowCeiling:Math.max(0,Math.round(Number(read('#mm-fa-xanax-low-cap'))||0))
      };
      if(patch.mediumThreshold>patch.highThreshold){
        statusText='Xanax policy not saved: Medium threshold cannot exceed High threshold.';render();return;
      }
      busy=true;statusText='Saving Xanax war policy…';render();
      try{
        await saveXanaxPolicy(patch);
        statusText='Xanax policy saved. Matchups, stock target, shortfall, Acquire, leader report, and export recalculated.';
      }catch(error){statusText='Xanax policy failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    });
    root.querySelectorAll('[data-xanax-member-save]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const id=asId(b.dataset.xanaxMemberSave);
      const estimator=logic.xanaxEstimator(state?.factionInventory||{},{procurementMode});
      const member=estimator.members.find(row=>row.memberId===id);
      const input=[...root.querySelectorAll('[data-xanax-member-input]')].find(node=>asId(node.dataset.xanaxMemberInput)===id);
      if(!member||!input)return;
      const value=Number(input.value);
      if(!Number.isFinite(value)||value<0||!Number.isInteger(value)||value>num(member.ceiling)){
        statusText='Xanax member allocation must be a whole number from 0 to '+fmt(member.ceiling)+'.';render();return;
      }
      const overrides={...(estimator.policy?.memberOverrides||{}),[id]:value};
      busy=true;statusText='Saving member Xanax allocation…';render();
      try{
        await saveXanaxPolicy({memberOverrides:overrides});
        statusText=member.memberName+' Xanax allocation saved at '+value+'. All dependent totals updated.';
      }catch(error){statusText='Member Xanax allocation failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-xanax-member-reset]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const id=asId(b.dataset.xanaxMemberReset);
      const estimator=logic.xanaxEstimator(state?.factionInventory||{},{procurementMode});
      const overrides={...(estimator.policy?.memberOverrides||{})};
      delete overrides[id];
      busy=true;statusText='Restoring matchup-based Xanax allocation…';render();
      try{
        await saveXanaxPolicy({memberOverrides:overrides});
        statusText='Member Xanax allocation returned to automatic matchup weighting.';
      }catch(error){statusText='Member Xanax reset failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-procurement-mode]').forEach(b=>b.addEventListener('click',()=>{
      procurementMode=['budget','standard','ideal'].includes(b.dataset.procurementMode)?b.dataset.procurementMode:'budget';
      GM_setValue(PROCUREMENT_MODE_KEY,procurementMode);
      statusText='Procurement mode: '+procurementMode.toUpperCase()+'.';
      render();
    }));
    const saveBudget=value=>{
      const next=Math.max(0,Number(value)||0);
      acquisitionBudget=next;
      GM_setValue(ACQUISITION_BUDGET_KEY,next);
      statusText='Acquisition budget saved: $'+Math.round(next).toLocaleString()+'.';
      render();
    };
    root.querySelector('#mm-fa-save-budget')?.addEventListener('click',()=>saveBudget(root.querySelector('#mm-fa-budget-cap')?.value));
    root.querySelector('#mm-fa-message-leader')?.addEventListener('click',()=>{
      try{messageFactionLeader();}
      catch(error){statusText='Leader report could not be prepared: '+(error?.message||String(error));render();}
    });
    root.querySelectorAll('[data-build-option-member]').forEach(b=>b.addEventListener('click',()=>{
      const member=memberRows().find(row=>row.memberId===asId(b.dataset.buildOptionMember));
      const slot=String(b.dataset.buildOptionSlot||'');
      const name=String(b.dataset.buildOptionName||'');
      const item=member?.buildAssessment?.items?.find(entry=>entry.slot===slot);
      const option=item?.recommendationOptions?.find(entry=>String(entry.name||'')===name);
      if(!member||!item||!option)return;
      const pricing=optionPricing(option);
      handoffAcquisition({item:option.name,qty:1,fundedQty:1,marketValue:num(pricing.cost)||num(option.marketValue),reasons:member.memberName+' '+slot+' qualifying alternative · '+equipmentStatsText(option.stats,{mode:'need'})},'Best');
    }));
    root.querySelectorAll('[data-armory-acquire]').forEach(b=>b.addEventListener('click',()=>{
      const plan=logic.acquisitionPlan(state?.factionInventory||{},{
        mode:stockMode,
        procurementMode,
        budgetCap:acquisitionBudget
      });
      const row=plan.list.find(x=>String(x.item||'')===String(b.dataset.armoryAcquire||''));
      if(row)handoffAcquisition(row,b.dataset.source||'Best');
    }));
    root.querySelectorAll('[data-save-acq-qty]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const item=String(b.dataset.saveAcqQty||''),category=String(b.dataset.acqQtyCategory||'');
      const plan=logic.acquisitionPlan(state?.factionInventory||{},{mode:stockMode,procurementMode,budgetCap:acquisitionBudget});
      const row=plan.list.find(x=>String(x.item||'')===item&&String(x.category||'')===category);
      const input=[...root.querySelectorAll('[data-acq-qty-input]')].find(x=>String(x.dataset.acqQtyInput||'')===item&&String(x.dataset.acqQtyCategory||'')===category);
      if(!row||!input)return;
      const value=input.value;
      busy=true;statusText='Saving planned quantity…';render();
      try{
        const result=await setAcquisitionQuantityOverride(row,value);
        statusText='Planned quantity saved for '+item+': '+fmt(result.qty)+'. Leader report and acquisition handoff now use this quantity.';
      }catch(error){statusText='Quantity override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-reset-acq-qty]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const item=String(b.dataset.resetAcqQty||''),category=String(b.dataset.acqQtyCategory||'');
      const plan=logic.acquisitionPlan(state?.factionInventory||{},{mode:stockMode,procurementMode,budgetCap:acquisitionBudget});
      const row=plan.list.find(x=>String(x.item||'')===item&&String(x.category||'')===category);
      if(!row)return;
      busy=true;statusText='Resetting planned quantity…';render();
      try{
        await setAcquisitionQuantityOverride(row,'');
        statusText='Manual quantity reset for '+item+'. System quantity is active again.';
      }catch(error){statusText='Quantity reset failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelector('#mm-fa-settings-budget-save')?.addEventListener('click',()=>saveBudget(root.querySelector('#mm-fa-settings-budget')?.value));

    root.querySelector('#mm-fa-refresh-faction')?.addEventListener('click',refreshFaction);
    root.querySelector('#mm-fa-copy-request')?.addEventListener('click',()=>copyText(missingDataRequest()).then(()=>{statusText='Member data request copied.';render();}));
    root.querySelector('#mm-fa-unlock-vault')?.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;statusText='Unlocking member-key vault…';render();
      try{
        await unlockVault(false);
        const stale=staleSavedMemberCount();
        statusText=stale
          ?'Member-key vault unlocked. Checking '+stale+' stale saved profile'+(stale===1?'':'s')+' automatically…'
          :'Member-key vault unlocked. No saved member profiles are stale.';
      }catch(error){statusText='Vault unlock failed: '+(error?.message||String(error));}
      finally{
        busy=false;render();
        if(vaultSession?.key&&staleSavedMemberCount())setTimeout(()=>autoRefreshArmory({forceFaction:false}),50);
      }
    });
    root.querySelector('#mm-fa-import-once')?.addEventListener('click',()=>importFromField(false));
    root.querySelector('#mm-fa-import-save')?.addEventListener('click',()=>importFromField(true));
    root.querySelector('#mm-fa-refresh-keys')?.addEventListener('click',async()=>{
      if(busy)return;busy=true;statusText='Refreshing saved member keys…';render();
      try{
        const result=await refreshAllSaved();
        statusText='Saved member-key refresh: '+result.total+' saved key'+(result.total===1?'':'s')+' found · '+result.ok+' refreshed successfully'+(result.failures.length?' · '+result.failures.length+' failed':'')+'. This is the number of saved member API keys, not faction members.';
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
    root.querySelectorAll('[data-remind-member]').forEach(b=>b.addEventListener('click',()=>{
      const row=memberRows().find(item=>item.memberId===asId(b.dataset.remindMember));
      if(!row)return;
      try{
        openArmoryMessage({
          playerId:row.memberId,
          playerName:row.memberName,
          subject:'Faction readiness information needed',
          body:readinessReminderMessage(row),
          kind:'member-data-reminder',
          memberId:row.memberId
        });
      }catch(error){statusText='Could not prepare reminder: '+(error?.message||String(error));render();}
    }));
    root.querySelectorAll('[data-war-ready]').forEach(b=>b.addEventListener('click',async()=>{
      const id=asId(b.dataset.warReady);
      const row=memberRows().find(item=>item.memberId===id);
      if(!row||busy)return;
      const reason=prompt(
        'Mark '+row.memberName+' WAR READY as an individual Leadership override. This will exclude the member from War acquisition until you reopen readiness. Optional reason:',
        row.buildWarReady?'Leadership approved':'Leadership manual override'
      );
      if(reason==null)return;
      busy=true;statusText='Marking '+row.memberName+' War Ready…';render();
      try{
        const result=await setMemberWarReady(id,true,reason);
        statusText=result.memberName+' is WAR READY by individual Leadership decision. Automatic build/data status remains visible underneath.';
      }catch(error){statusText='War Ready update failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-reopen-review]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;busy=true;statusText='Reopening readiness review…';render();
      try{
        const result=await setMemberWarReady(b.dataset.reopenReview,false);
        statusText=result.memberName+' manual War Ready decision was cleared; automatic readiness is active again.';
      }catch(error){statusText='Readiness review update failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-edit-override]').forEach(b=>b.addEventListener('click',()=>{
      editingEquipmentMemberId=asId(b.dataset.editOverride);
      render();
    }));
    root.querySelector('#mm-fa-close-equipment-override')?.addEventListener('click',()=>{
      editingEquipmentMemberId='';
      render();
    });
    root.querySelector('#mm-fa-equipment-override-modal')?.addEventListener('click',event=>{
      if(event.target?.id==='mm-fa-equipment-override-modal'){
        editingEquipmentMemberId='';
        render();
      }
    });
    root.querySelectorAll('[data-eq-accept-current]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;statusText='Accepting equipped item for '+String(b.dataset.eqSlot||'slot')+'…';render();
      try{
        const result=await setMemberEquipmentDecision(b.dataset.eqAcceptCurrent,b.dataset.eqSlot,{
          action:'accept-current',
          itemName:String(b.dataset.eqCurrent||''),
          reason:'Leadership accepted equipped item'
        });
        statusText=result.memberName+' '+String(result.slot).toUpperCase()+': equipped item accepted.';
      }catch(error){statusText='Equipment override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-eq-use-suggestion]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const id=asId(b.dataset.eqUseSuggestion),slot=String(b.dataset.eqSlot||'');
      const select=root.querySelector('[data-eq-suggestion="'+CSS.escape(id)+'"][data-eq-slot="'+CSS.escape(slot)+'"]');
      const itemName=String(select?.value||'').trim();
      if(!itemName){statusText='Choose a replacement item first.';render();return;}
      busy=true;statusText='Saving replacement for '+slot+'…';render();
      try{
        const result=await setMemberEquipmentDecision(id,slot,{action:'replacement',itemName,reason:'Leadership selected Armory replacement'});
        statusText=result.memberName+' '+String(result.slot).toUpperCase()+': replacement set to '+itemName+'.';
      }catch(error){statusText='Equipment override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-eq-use-manual]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      const id=asId(b.dataset.eqUseManual),slot=String(b.dataset.eqSlot||'');
      const input=root.querySelector('[data-eq-manual-name="'+CSS.escape(id)+'"][data-eq-slot="'+CSS.escape(slot)+'"]');
      const itemName=String(input?.value||'').trim();
      if(!itemName){statusText='Enter a replacement item name first.';render();return;}
      busy=true;statusText='Saving replacement for '+slot+'…';render();
      try{
        const result=await setMemberEquipmentDecision(id,slot,{action:'replacement',itemName,reason:'Leadership entered manual replacement'});
        statusText=result.memberName+' '+String(result.slot).toUpperCase()+': replacement set to '+itemName+'.';
      }catch(error){statusText='Equipment override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-eq-auto]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;statusText='Restoring automatic recommendation…';render();
      try{
        const result=await setMemberEquipmentDecision(b.dataset.eqAuto,b.dataset.eqSlot,{action:'automatic'});
        statusText=result.memberName+' '+String(result.slot).toUpperCase()+': automatic Armory recommendation restored.';
      }catch(error){statusText='Equipment override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-clear-override]').forEach(b=>b.addEventListener('click',async()=>{
      const id=asId(b.dataset.clearOverride);
      if(busy)return;
      busy=true;statusText='Clearing manual data override…';render();
      try{
        const result=await clearMemberManualOverrides(id);
        statusText=result.memberName+' manual data override cleared; source/API data is authoritative again.';
      }catch(error){statusText='Clear override failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-procurement-pass]').forEach(b=>b.addEventListener('click',async()=>{
      const id=asId(b.dataset.procurementPass);
      const row=memberRows().find(item=>item.memberId===id);
      if(!row||busy)return;
      const reason=prompt(
        'Procurement Pass excludes '+row.memberName+' from acquisition without claiming verified War Ready. Optional reason:',
        row.hasVerifiedStats?'Leader procurement decision':'No current member data'
      );
      if(reason==null)return;
      busy=true;statusText='Applying Procurement Pass…';render();
      try{
        const result=await setMemberProcurementPass(id,true,reason);
        statusText=result.memberName+' is excluded from acquisition as PROCUREMENT PASS. New private member data will require review.';
      }catch(error){statusText='Procurement Pass failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
    }));
    root.querySelectorAll('[data-reopen-procurement]').forEach(b=>b.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;statusText='Reopening member procurement…';render();
      try{
        const result=await setMemberProcurementPass(b.dataset.reopenProcurement,false);
        statusText=result.memberName+' is active in acquisition planning again.';
      }catch(error){statusText='Procurement update failed: '+(error?.message||String(error));}
      finally{busy=false;render();}
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
      GM_setValue(FACTION_API_KEY,value);statusText='Faction Armory API key saved. Refreshing automatically…';render();setTimeout(()=>autoRefreshArmory({forceFaction:true}),50);
    });
    root.querySelector('#mm-fa-clear-faction-key')?.addEventListener('click',()=>{
      GM_deleteValue(FACTION_API_KEY);statusText='Faction Armory API key cleared.';render();
    });
    root.querySelector('#mm-fa-export')?.addEventListener('click',exportLeadershipExcel);
    root.querySelector('#mm-fa-export-coverage')?.addEventListener('click',exportLeadershipExcel);
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
    const minimums=logic.minimumProposal(state.factionInventory||{},{
      mode:stockMode,
      procurementMode
    });
    const acquisition=logic.acquisitionPlan(state.factionInventory||{},{
      mode:stockMode,
      procurementMode,
      budgetCap:acquisitionBudget
    });
    const inventory=Object.values(state.factionInventory?.current||{});
    const xanax=stockMode==='war'?minimums.xanax:null;
    const currentWar=state.factionInventory?.warPlanning?.currentWar||null;
    const coverage=logic.coverageComparison(state.factionInventory||{},{
      mode:'war',procurementMode,budgetCap:acquisitionBudget,savedKeyIds:savedKeyIds()
    });
    const summaryHeaders=['Metric','Value'];
    const summary=[
      {Metric:'Generated',Value:new Date().toISOString()},
      {Metric:'Stock mode',Value:stockMode.toUpperCase()},
      {Metric:'Procurement mode',Value:procurementMode.toUpperCase()},
      {Metric:'Acquisition budget',Value:acquisitionBudget},
      {Metric:'Buy-now known cost',Value:acquisition.fundedEstimatedValue},
      {Metric:'Known deferred cost',Value:acquisition.deferredEstimatedValue},
      {Metric:'Unresolved build slots',Value:acquisition.unresolvedCount},
      {Metric:'War roster members',Value:stockMode==='war'?members.length:''},
      {Metric:'Faction members',Value:members.length},
      {Metric:'Estimated-stat members',Value:members.filter(r=>r.statsEstimated).length},
      {Metric:'War ready (approved)',Value:members.filter(r=>r.readinessStatus==='WAR READY').length},
      {Metric:'Procurement pass / excluded',Value:members.filter(r=>r.procurementPassCurrent).length},
      {Metric:'Ready for review',Value:members.filter(r=>r.readinessStatus==='READY FOR REVIEW').length},
      {Metric:'Action needed',Value:members.filter(r=>r.readinessStatus==='ACTION NEEDED'||r.readinessStatus==='SUPPLY ACTION').length},
      {Metric:'Missing / stale',Value:members.filter(r=>r.readinessStatus==='MISSING DATA'||r.readinessStatus==='STALE DATA').length},
      {Metric:'No combat gear equipped (confirmed)',Value:members.filter(r=>r.readinessStatus==='NO COMBAT GEAR EQUIPPED').length},
      {Metric:'Member manual data overrides',Value:members.filter(r=>r.manualOverrideActive).length},
      {Metric:'Armory member API keys saved',Value:savedKeyIds().length},
      {Metric:'Inventory rows',Value:inventory.length},
      {Metric:'Observed inventory days',Value:Number(minimums.observedDays.toFixed(1))},
      {Metric:'Minimums ordered shortfalls',Value:minimums.actionable.length},
      {Metric:'Minimums held shortfalls',Value:minimums.held?.length||0},
      {Metric:'Minimums data-required',Value:minimums.dataRequired.length},
      {Metric:'Current ranked-war rival',Value:currentWar?.opponentFactionName||''},
      {Metric:'Current ranked-war ID',Value:currentWar?.warId||''},
      {Metric:'Xanax posture',Value:xanax?.policy?.investmentPosture?.toUpperCase?.()||''},
      {Metric:'Xanax leadership ceiling',Value:xanax?num(xanax.leadershipCeiling):''},
      {Metric:'Xanax matchup target',Value:xanax?num(xanax.recommendedTarget):''},
      {Metric:'Xanax rival estimates',Value:xanax?String(xanax.opponentEstimatedCount)+' / '+String(xanax.opponentMemberCount):''},
      {Metric:'Minimum proposal approval status',Value:'LIVE MANAGER CONTROL — PURCHASE REMAINS MANUAL'},
      {Metric:'Open manager / leadership inputs',Value:minimumOpenInputs(minimums).filter(r=>!['READY','COMPLETE','MATURE','READY TO DESIGN'].includes(r.status)).length}
    ];
    const memberHeaders=['Member ID','Member','Level','Torn Age Days','API Saved','Stats Source','Estimate Confidence','Readiness','War Ready','War Ready Reason','Any Member Message','Last Member Message At','Build Message','Build Message At','Build Message Count','Data Request','Data Request At','Procurement Disposition','Procurement Pass At','Procurement Pass Reason','Baseline Pass','Approved At','Approval Mode','Equipment Decisions','Manual Override','Override Updated At','Override Reason','Override JSON','Build Style','Offense Need','Defense Style','Premium Priority','Strength','Defense','Speed','Dexterity','Total','Equipment','Faction Loans','Source','Verified At'];
    const memberData=members.map(r=>{
      const build=r.buildAssessment||logic.compareMemberBuild(r,state.factionInventory||{},members,{procurementMode});
      const anyMessage=memberAnyMessageStatus(r.memberId);
      const buildMessage=memberMessageStatus(r.memberId,'member-build');
      const dataRequest=memberMessageStatus(r.memberId,'member-data-reminder');
      return {
        'Member ID':r.memberId,'Member':r.memberName,'Level':num(r.level),'Torn Age Days':num(r.publicIntel?.ageDays),'API Saved':r.apiSaved?'YES':'NO',
        'Stats Source':r.statsEstimated?'PUBLIC ESTIMATE':'VERIFIED','Estimate Confidence':r.statsEstimated?String(r.statEstimate?.confidence||'LOW'):'',
        'Readiness':r.readinessStatus,
        'War Ready':r.readinessStatus==='WAR READY'?'YES':'NO',
        'War Ready Reason':r.readinessApprovalReason||'',
        'Any Member Message':anyMessage.sent?'SENT':'NOT SENT',
        'Last Member Message At':anyMessage.sentAt||'',
        'Build Message':buildMessage.sent?'SENT':'NOT SENT',
        'Build Message At':buildMessage.sentAt||'',
        'Build Message Count':buildMessage.count||0,
        'Data Request':dataRequest.sent?'SENT':'NOT SENT',
        'Data Request At':dataRequest.sentAt||'',
        'Procurement Disposition':r.acquisitionDisposition||'ACTIVE',
        'Procurement Pass At':r.procurementPassAt||'',
        'Procurement Pass Reason':r.procurementPassReason||'',
        'Baseline Pass':build.warReady?'YES':'NO','Approved At':r.readinessApprovedAt||'','Approval Mode':r.readinessApprovalMode||'',
        'Equipment Decisions':equipmentDecisionSummary(r),
        'Manual Override':r.manualOverrideActive?'YES':'NO','Override Updated At':r.manualOverrideUpdatedAt||'','Override Reason':r.manualOverrideReason||'','Override JSON':r.manualOverrideActive?JSON.stringify(r.manualOverrideValues||{}):'',
        'Build Style':build.buildStyle,'Offense Need':build.offensiveNeed,'Defense Style':build.defensiveStyle,'Premium Priority':build.priority?.label||'',
        'Strength':r.hasStats?num(r.stats?.strength):'','Defense':r.hasStats?num(r.stats?.defense):'','Speed':r.hasStats?num(r.stats?.speed):'','Dexterity':r.hasStats?num(r.stats?.dexterity):'','Total':r.hasStats?num(r.statProfile.total):'',
        'Equipment':r.equipmentSummary||(r.equipmentEmptyConfirmed?'No combat gear equipped (confirmed)':''),'Faction Loans':r.loanItems.map(i=>i.name+' x'+i.amount).join(' | '),'Source':String(r.profile?.source||''),'Verified At':String(r.profile?.verifiedAt||'')
      };
    });
    const invHeaders=['Category','Item ID','Item','Owned','Available','Loaned','Damage','Accuracy','Armor'];
    const invData=inventory.map(r=>({'Category':r.category,'Item ID':r.itemId,'Item':r.name,'Owned':num(r.amountOwned),'Available':num(r.availableCount),'Loaned':num(r.loanedCount),'Damage':num(r.damage),'Accuracy':num(r.accuracy),'Armor':num(r.armorRating)}));
    const minHeaders=['Category','Item / Pool','Have','Loaned','Suggested Min','Manual Min','Effective Min','Shortfall','Order Enabled','Status','Data Required','Updated At','Rationale'];
    const minData=minimums.proposals.map(r=>({
      'Category':r.category,'Item / Pool':r.item,'Have':num(r.current),'Loaned':num(r.loaned),
      'Suggested Min':r.suggestedMin==null?'':num(r.suggestedMin),
      'Manual Min':r.manualMin==null?'':num(r.manualMin),
      'Effective Min':r.dataRequired?'':num(r.effectiveMin),
      'Shortfall':r.dataRequired?'':num(r.shortfall),
      'Order Enabled':r.orderEnabled?'YES':'NO',
      'Status':r.status,
      'Data Required':r.dataRequired?'YES':'NO',
      'Updated At':r.minimumOverrideUpdatedAt||'',
      'Rationale':r.rationale
    }));
    const xanaxHeaders=['Member ID','Member','Stats Total','Stats Source','Tier','Credible Rival Targets','Leadership Ceiling','Recommended Xanax','Manual Xanax','Credible Targets'];
    const xanaxData=(xanax?.members||[]).map(r=>({
      'Member ID':r.memberId,'Member':r.memberName,'Stats Total':num(r.statsTotal),'Stats Source':r.statsEstimated?'ESTIMATED':'VERIFIED',
      'Tier':r.tier,'Credible Rival Targets':num(r.credibleTargets),'Leadership Ceiling':num(r.ceiling),
      'Recommended Xanax':num(r.recommended),'Manual Xanax':r.manualOverride==null?'':num(r.manualOverride),
      'Credible Targets':(r.targetNames||[]).join(' | ')
    }));
    const inputHeaders=['Priority','Topic','Status','What We Need / Why'];
    const inputData=minimumOpenInputs(minimums).map(r=>({'Priority':r.priority,'Topic':r.topic,'Status':r.status,'What We Need / Why':r.detail}));
    const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>'+
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
      xmlSheet('Summary',summaryHeaders,summary)+
      xmlSheet('Members',memberHeaders,memberData)+
      xmlSheet('Inventory',invHeaders,invData)+
      xmlSheet('Minimums',minHeaders,minData)+
      (stockMode==='war'?xmlSheet('Xanax',xanaxHeaders,xanaxData):'')+
      xmlSheet('Open Inputs',inputHeaders,inputData)+
      xmlSheet('Coverage',['Member ID','Member','Readiness','Procurement','Slot','Member Has','Has Score','Need Target','Need Floor','Ready','Route','Assigned Loan','Owned Alternative','Faction Qualifying Available','Faction Qualifying Items'],coverage.memberCoverage.map(r=>({
        'Member ID':r.memberId,'Member':r.memberName,'Readiness':r.readinessStatus,'Procurement':r.acquisitionDisposition,
        'Slot':r.slot,'Member Has':r.memberHas,'Has Score':num(r.memberHasScore),'Need Target':r.needTarget,'Need Floor':num(r.needFloor),
        'Ready':r.ready?'YES':'NO','Route':r.route,'Assigned Loan':r.assignedLoan,'Owned Alternative':r.ownedAlternative,
        'Faction Qualifying Available':num(r.factionAvailableQualifying),'Faction Qualifying Items':r.factionQualifyingItems.join(' | ')
      })))+
      xmlSheet('Faction Coverage',['Slot','Faction Owned','Available','Loaned','Member Gaps','Issue Assignments','Acquire Assignments','System Buy Qty','Planned Buy Qty'],coverage.factionCoverage.map(r=>({
        'Slot':r.slot,'Faction Owned':num(r.owned),'Available':num(r.available),'Loaned':num(r.loaned),'Member Gaps':num(r.memberGaps),
        'Issue Assignments':num(r.issueAssignments),'Acquire Assignments':num(r.acquireAssignments),'System Buy Qty':num(r.systemBuyQty),'Planned Buy Qty':num(r.plannedBuyQty)
      })))+
      xmlSheet('Consistency',['Type','Member ID','Member','Slot','Item','Detail'],coverage.consistencyIssues.map(r=>({
        'Type':r.type,'Member ID':r.memberId,'Member':r.memberName,'Slot':r.slot,'Item':r.item,'Detail':r.detail
      })))+
      xmlSheet('Acquire',['Category','Item','System Qty','Planned Qty','Manual Override','Buy Now Qty','Deferred Qty','Reference Source','Reference Unit Value','Buy Now Cost','Reasons'],acquisition.list.map(r=>({
        'Category':r.category,'Item':r.item,'System Qty':num(r.systemQty),'Planned Qty':num(r.qty),'Manual Override':r.manualQtyOverride!=null?'YES':'NO',
        'Buy Now Qty':num(r.fundedQty),'Deferred Qty':num(r.deferredQty),'Reference Source':r.source,'Reference Unit Value':num(r.marketValue),'Buy Now Cost':num(r.fundedEstimatedValue),'Reasons':r.reasons
      })))+
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
    const root=document.getElementById(ROOT_ID);
    root.style.display='block';
    core?.setDockLauncherActive?.('armory',true);
    render();
    reloadState().then(()=>autoRefreshArmory({forceFaction:false}));
    startAutoRefresh();
  }
  function close(){
    const root=document.getElementById(ROOT_ID);
    if(root)root.style.display='none';
    core?.setDockLauncherActive?.('armory',false);
    stopAutoRefresh();
  }
  function createLauncher(){
    if(!document.body)return;
    injectStyle();
    if(core?.registerDockLauncher){
      const b=core.registerDockLauncher({
        id:'armory',
        label:'MM Faction Armory',
        accent:'#8b6a2f',
        onClick:()=>{
          const root=document.getElementById(ROOT_ID);
          if(root&&root.style.display!=='none')close(); else open();
        }
      });
      if(b)b.id=LAUNCHER_ID;
      core.adoptLegacyCrmLauncher?.();
      return;
    }
    if(document.getElementById(LAUNCHER_ID))return;
    const b=document.createElement('button');
    b.id=LAUNCHER_ID;b.textContent='Armory';
    b.style.cssText='position:fixed;right:6px;bottom:6px;z-index:2147483647;'+button(true);
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
  installArmorySendTracking();
  runArmoryPageHelpers();
  window.addEventListener('hashchange',()=>runArmoryPageHelpers());
  window.addEventListener('popstate',()=>runArmoryPageHelpers());
})();
