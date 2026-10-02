(() => {
  'use strict';

  const CATEGORIES=Object.freeze([
    'weapons','armor','temporary','medical','consumables',
    'drugs','boosters','utilities','loot'
  ]);
  const LOAN_CATEGORIES=Object.freeze(['weapons','armor','temporary']);
  const STANDARD_SLOTS=Object.freeze([
    'primary','secondary','melee','helmet','body','gloves','pants','boots'
  ]);
  const CRITICAL_MEDICAL=new Set([
    'First Aid Kit','Morphine','Small First Aid Kit','Ipecac Syrup','Empty Blood Bag'
  ]);
  const CRITICAL_TEMPORARY=new Set([
    'Flash Grenade','Smoke Grenade','Tear Gas','HEG','Grenade','Pepper Spray'
  ]);

  const DEFAULT_WAR_PARTICIPANTS=20;
  const WAR_SUPPLY_PER_MEMBER=Object.freeze({
    'medical|First Aid Kit':10,
    'medical|Small First Aid Kit':10,
    'medical|Morphine':10,
    'medical|Ipecac Syrup':1,
    'medical|Empty Blood Bag':5,
    'temporary|Flash Grenade':5,
    'temporary|Smoke Grenade':5,
    'temporary|Tear Gas':5,
    'temporary|HEG':5,
    'temporary|Grenade':5,
    'temporary|Pepper Spray':5,
    'drugs|Xanax':3
  });

  const asId=value=>String(value??'').trim();
  const n=value=>Math.max(0,Number(value)||0);
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function armorSlot(item){
    const raw=[item?.subType,item?.slot,item?.type,item?.name]
      .map(v=>String(v||'').toLowerCase()).join(' ');
    if(/helmet|head/.test(raw))return 'helmet';
    if(/glove|hand/.test(raw))return 'gloves';
    if(/pant|leg/.test(raw))return 'pants';
    if(/boot|shoe|foot/.test(raw))return 'boots';
    if(/vest|body|armor|armour|jacket/.test(raw))return 'body';
    return '';
  }

  function weaponSlot(item){
    const raw=[item?.subType,item?.slot,item?.type,item?.name]
      .map(v=>String(v||'').toLowerCase()).join(' ');
    if(/pistol|revolver|secondary/.test(raw))return 'secondary';
    if(/melee|piercing|slashing|clubbing|mechanical|fist|weapon of honor/.test(raw))return 'melee';
    if(/rifle|shotgun|smg|machine gun|heavy artillery|primary/.test(raw))return 'primary';
    return '';
  }

  function equipmentSlot(item){
    return armorSlot(item)||weaponSlot(item)||'';
  }

  function battleProfile(stats={}){
    const values={
      strength:n(stats.strength),
      defense:n(stats.defense),
      speed:n(stats.speed),
      dexterity:n(stats.dexterity)
    };
    const total=Object.values(values).reduce((a,b)=>a+b,0);
    if(!total)return {total:0,dominant:'',bias:'balanced',shares:{}};
    const shares=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v/total]));
    const dominant=Object.entries(values).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    let bias='balanced';
    if(dominant==='strength')bias='damage';
    else if(dominant==='speed'||dominant==='dexterity')bias='accuracy';
    else if(dominant==='defense')bias='balanced';
    return {total,dominant,bias,shares};
  }

  function equipmentScore(item,bias='balanced'){
    const slot=equipmentSlot(item);
    if(['helmet','body','gloves','pants','boots'].includes(slot)){
      return n(item?.armorRating ?? item?.armor ?? item?.stats?.armor ?? item?.stats?.protection);
    }
    const damage=n(item?.damage ?? item?.stats?.damage);
    const accuracy=n(item?.accuracy ?? item?.stats?.accuracy);
    if(bias==='damage')return damage*0.65+accuracy*0.35;
    if(bias==='accuracy')return damage*0.35+accuracy*0.65;
    return damage*0.5+accuracy*0.5;
  }

  function summaryEquipmentSlots(summary=''){
    const out={};
    const slotMap={
      primary:'primary',secondary:'secondary',melee:'melee',
      helmet:'helmet',head:'helmet',body:'body',body_armor:'body',body_armour:'body',
      gloves:'gloves',hands:'gloves',pants:'pants',legs:'pants',boots:'boots',feet:'boots',
      temporary:'temporary',temp:'temporary',temp_equipped:'temporary',temporary_equipped:'temporary'
    };
    const segments=String(summary||'').split(/\s*\|\s*|\r?\n/).map(x=>x.trim()).filter(Boolean);
    for(const segment of segments){
      const match=segment.match(/^([A-Z _-]{3,24})\s*:\s*(.+)$/i);
      if(!match)continue;
      const key=String(match[1]||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
      const slot=slotMap[key];
      if(!slot||slot==='temporary')continue;
      let name=String(match[2]||'').trim();
      name=name.replace(/\s+\((?:DMG|ACC|ARM|Q|QUALITY)\b.*$/i,'').trim();
      if(!name||name==='—'||/^none$/i.test(name))continue;
      out[slot]={
        itemId:'',
        name,
        slot,
        type:slot,
        subType:slot,
        damage:0,
        accuracy:0,
        armor:0,
        armorRating:0,
        quality:0,
        source:'equipment summary fallback'
      };
    }
    return out;
  }

  function profileEquipmentSlots(profile={}){
    const out={};
    const items=Array.isArray(profile?.equipment?.items)?profile.equipment.items:[];
    for(const item of items){
      const slot=equipmentSlot(item);
      if(!slot||slot==='temporary')continue;
      const prior=out[slot];
      if(!prior||equipmentScore(item)>equipmentScore(prior)||(!equipmentScore(prior)&&String(item?.name||''))){
        out[slot]=clone(item);
      }
    }
    const fallback=summaryEquipmentSlots(profile?.equipment?.summary||'');
    for(const [slot,item] of Object.entries(fallback)){
      if(!out[slot]||!String(out[slot]?.name||'').trim())out[slot]=item;
    }
    return out;
  }

  function percentile(values,value){
    const clean=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!clean.length)return 0.5;
    const atOrBelow=clean.filter(x=>x<=Number(value||0)).length;
    return Math.max(0,Math.min(1,atOrBelow/clean.length));
  }

  function readinessTier(memberRow={},rosterRows=[]){
    const total=n(memberRow?.statProfile?.total||memberRow?.stats&&battleProfile(memberRow.stats).total);
    const level=n(memberRow?.level);
    const known=(rosterRows||[]).filter(row=>n(row?.statProfile?.total)>0);
    if(known.length>=4){
      const statPct=percentile(known.map(row=>n(row.statProfile.total)),total);
      const levelPct=percentile(known.map(row=>n(row.level)),level);
      const composite=statPct*0.75+levelPct*0.25;
      const label=composite>=0.72?'FRONTLINE':composite>=0.34?'STANDARD':'DEVELOPMENT';
      return {label,composite,statPercentile:statPct,levelPercentile:levelPct};
    }
    const label=(total>=100000||level>=30)?'FRONTLINE':(total>=10000||level>=15)?'STANDARD':'DEVELOPMENT';
    return {label,composite:null,statPercentile:null,levelPercentile:null};
  }

  function readinessPercentileFor(slot,tier,bias){
    let q=tier==='FRONTLINE'?0.75:tier==='STANDARD'?0.55:0.35;
    if(slot==='primary')q+=0.05;
    if(slot==='secondary'||slot==='melee')q-=0.05;
    if(['helmet','body','gloves','pants','boots'].includes(slot)&&bias==='balanced')q+=0.03;
    return Math.max(0.20,Math.min(0.90,q));
  }

  function quantile(values,q){
    const clean=(values||[]).map(Number).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
    if(!clean.length)return 0;
    const index=Math.min(clean.length-1,Math.max(0,Math.ceil((clean.length-1)*q)));
    return clean[index];
  }

  function warReadinessStandard(memberRow,factionInventory={},rosterRows=[]){
    const bp=memberRow?.statProfile?.total?memberRow.statProfile:battleProfile(memberRow?.stats||memberRow?.profile?.stats||{});
    const tier=readinessTier({...memberRow,statProfile:bp},rosterRows);
    const candidates=availableFactionCandidates(factionInventory);
    const floors={};
    for(const slot of STANDARD_SLOTS){
      const scores=(candidates[slot]||[]).map(item=>equipmentScore(item,bp.bias)).filter(x=>x>0);
      const q=readinessPercentileFor(slot,tier.label,bp.bias);
      floors[slot]={score:quantile(scores,q),percentile:q};
    }
    return {
      tier:tier.label,
      tierDetail:tier,
      style:bp.bias,
      dominant:bp.dominant,
      floors
    };
  }

  function availableFactionCandidates(factionInventory={}){
    const current=factionInventory?.current&&typeof factionInventory.current==='object'
      ? factionInventory.current:{};
    const out={};
    for(const item of Object.values(current)){
      if(n(item?.availableCount)<=0)continue;
      const slot=equipmentSlot(item);
      if(!slot)continue;
      const row={
        ...clone(item),
        slot,
        score:0
      };
      if(!out[slot])out[slot]=[];
      out[slot].push(row);
    }
    return out;
  }

  function compareMemberBuild(memberRow,factionInventory={},rosterRows=[]){
    const stats=memberRow?.stats||memberRow?.profile?.stats||{};
    const profile=battleProfile(stats);
    const current=profileEquipmentSlots(memberRow?.profile||{});
    const candidates=availableFactionCandidates(factionInventory);
    const standard=warReadinessStandard({...memberRow,stats,statProfile:profile},factionInventory,rosterRows);
    const items=[];

    for(const slot of STANDARD_SLOTS){
      const currentItem=current[slot]||null;
      const scored=(candidates[slot]||[]).map(item=>({
        ...item,
        score:equipmentScore(item,profile.bias)
      })).filter(item=>item.score>0).sort((a,b)=>a.score-b.score);
      const floor=n(standard.floors?.[slot]?.score);
      const adequate=scored.find(item=>item.score>=floor)||scored[scored.length-1]||null;
      const currentScore=currentItem?equipmentScore(currentItem,profile.bias):0;

      let decision='CURRENT DATA MISSING';
      let ready=false;
      let target=null;

      if(currentItem&&currentScore>0&&(!floor||currentScore>=floor)){
        decision='WAR READY — KEEP';
        ready=true;
        target=currentItem;
      }else if(currentItem&&currentScore>0&&adequate&&adequate.score>currentScore){
        decision='UPGRADE AVAILABLE';
        target=adequate;
      }else if(currentItem&&currentScore>0){
        decision='PROCUREMENT / REVIEW';
        target=adequate||currentItem;
      }else if(currentItem){
        decision='REVIEW CURRENT GEAR';
        target=adequate;
      }else if(adequate){
        decision='CURRENT GEAR MISSING — VERIFY';
        target=adequate;
      }

      items.push({
        slot,
        decision,
        ready,
        readinessFloor:floor,
        readinessPercentile:standard.floors?.[slot]?.percentile||0,
        currentName:String(currentItem?.name||''),
        currentScore,
        targetName:String(target?.name||''),
        targetScore:target===adequate?n(adequate?.score):currentScore,
        availableCount:target===adequate?n(adequate?.availableCount):0,
        currentItem:clone(currentItem),
        targetItem:clone(target)
      });
    }

    const readyCount=items.filter(x=>x.ready).length;
    const missing=items.filter(x=>x.decision==='CURRENT DATA MISSING'||x.decision==='CURRENT GEAR MISSING — VERIFY'||x.decision==='REVIEW CURRENT GEAR').length;
    const upgrades=items.filter(x=>x.decision==='UPGRADE AVAILABLE'||x.decision==='PROCUREMENT / REVIEW').length;
    return {
      memberId:asId(memberRow?.memberId),
      memberName:String(memberRow?.memberName||''),
      totalStats:profile.total,
      bias:profile.bias,
      tier:standard.tier,
      dominant:standard.dominant,
      items,
      warReady:readyCount===STANDARD_SLOTS.length,
      summary:missing
        ? missing+' slot(s) need current gear verification before war-ready status can be finalized.'
        : upgrades
          ? upgrades+' slot(s) are below the '+standard.tier.toLowerCase()+' war-ready standard.'
          : 'Known build meets the '+standard.tier.toLowerCase()+' war-ready standard.'
    };
  }

  function loanMap(factionInventory={}){
    const map=new Map();
    for(const item of Object.values(factionInventory?.current||{})){
      for(const loan of item?.loans||[]){
        const id=asId(loan?.memberId);
        if(!id)continue;
        const prior=map.get(id)||{amount:0,items:[]};
        prior.amount+=n(loan?.amount);
        prior.items.push({
          category:String(item?.category||''),
          itemId:asId(item?.itemId),
          name:String(item?.name||''),
          amount:n(loan?.amount),
          uids:Array.isArray(loan?.uids)?loan.uids.slice():[]
        });
        map.set(id,prior);
      }
    }
    return map;
  }

  function memberRows(factionInventory={},savedKeyIds=[]){
    const readiness=factionInventory?.memberReadiness||{};
    const roster=Object.values(readiness?.roster||{});
    const profiles=readiness?.profiles||{};
    const keys=new Set((savedKeyIds||[]).map(asId));
    const loans=loanMap(factionInventory);
    const staleHours=n(readiness?.settings?.staleHours)||72;

    return roster.map(member=>{
      const id=asId(member?.memberId);
      const profile=profiles[id]&&typeof profiles[id]==='object'?profiles[id]:{};
      const stats=profile?.stats||{};
      const bp=battleProfile(stats);
      const equipmentSummary=String(profile?.equipment?.summary||'').trim();
      const hasEquipment=Boolean(equipmentSummary)||Array.isArray(profile?.equipment?.items)&&profile.equipment.items.length>0;
      const verifiedMs=Date.parse(profile?.verifiedAt||'')||0;
      const ageHours=verifiedMs?Math.max(0,(Date.now()-verifiedMs)/3600000):null;
      const stale=ageHours!=null&&ageHours>staleHours;
      let status='READY FOR REVIEW';
      if(!bp.total||!hasEquipment)status='MISSING DATA';
      else if(stale)status='STALE DATA';
      else if(String(profile?.medicalStatus||'').includes('NEEDS')||String(profile?.ipecacStatus||'').includes('NEEDS'))status='SUPPLY ACTION';
      const loan=loans.get(id)||{amount:0,items:[]};
      return {
        ...clone(member),
        memberId:id,
        profile:clone(profile),
        stats:clone(stats),
        statProfile:bp,
        equipmentSummary,
        hasStats:bp.total>0,
        hasEquipment,
        ageHours,
        stale,
        apiSaved:keys.has(id),
        loans:loan.amount,
        loanItems:loan.items,
        readinessStatus:status
      };
    }).sort((a,b)=>{
      const priority={'MISSING DATA':0,'STALE DATA':1,'SUPPLY ACTION':2,'READY FOR REVIEW':3};
      return (priority[a.readinessStatus]??9)-(priority[b.readinessStatus]??9)
        || n(b.level)-n(a.level)
        || String(a.memberName||'').localeCompare(String(b.memberName||''));
    });
  }

  function observedDays(factionInventory={}){
    const snaps=Array.isArray(factionInventory?.snapshots)?factionInventory.snapshots:[];
    const times=snaps.map(s=>Date.parse(s?.at||s?.fetchedAt||s?.inventoryTimestamp||'')).filter(Number.isFinite);
    if(times.length<2)return 0;
    return Math.max(0,(Math.max(...times)-Math.min(...times))/86400000);
  }

  function consumptionMap(factionInventory={}){
    const days=Math.max(1,observedDays(factionInventory));
    const totals=new Map();
    for(const event of factionInventory?.events||[]){
      const delta=Number(event?.deltaOwned||0);
      if(delta>=0)continue;
      const key=String(event?.category||'')+'|'+asId(event?.itemId);
      totals.set(key,(totals.get(key)||0)+Math.abs(delta));
    }
    return Object.fromEntries([...totals.entries()].map(([k,v])=>[k,v/days]));
  }

  function warSupplyUnitsPerMember(category,name){
    const exact=WAR_SUPPLY_PER_MEMBER[String(category||'')+'|'+String(name||'')];
    if(exact!=null)return n(exact);
    if(String(category||'')==='consumables'&&/energy drink/i.test(String(name||'')))return 5;
    return 0;
  }

  function minimumProposal(factionInventory={},options={}){
    const mode=String(options?.mode||'peace').toLowerCase()==='war'?'war':'peace';
    const rosterRows=memberRows(factionInventory,[]);
    const rosterCount=Object.keys(factionInventory?.memberReadiness?.roster||{}).length;
    const participants=mode==='war'
      ? Math.max(1,Math.round(Number(options?.participants||DEFAULT_WAR_PARTICIPANTS)))
      : rosterCount;
    const peacePoolMin=Math.max(2,Math.ceil(rosterCount*0.25)+2);
    const peacePoolMax=Math.ceil(peacePoolMin*1.5);
    const current=Object.values(factionInventory?.current||{});
    const cons=consumptionMap(factionInventory);
    const proposals=[];

    for(const slot of STANDARD_SLOTS){
      const slotItems=current.filter(item=>equipmentSlot(item)===slot);
      const available=slotItems.reduce((sum,item)=>sum+n(item?.availableCount),0);
      const loaned=slotItems.reduce((sum,item)=>sum+n(item?.loanedCount),0);

      let targetMin=peacePoolMin;
      let targetMax=peacePoolMax;
      let coverageNeeded=null;
      if(mode==='war'){
        const participating=rosterRows.slice(0,participants);
        coverageNeeded=participating.filter(member=>{
          const build=compareMemberBuild(member,factionInventory,rosterRows);
          const row=build.items.find(item=>item.slot===slot);
          return !row?.ready;
        }).length;
        const unresolvedParticipants=Math.max(0,participants-participating.length);
        coverageNeeded+=unresolvedParticipants;
        targetMin=Math.max(peacePoolMin,Math.min(participants+2,coverageNeeded+2));
        targetMax=Math.max(targetMin,Math.min(participants+2,targetMin+2));
      }

      proposals.push({
        kind:'equipment',
        mode,
        category:['primary','secondary','melee'].includes(slot)?'weapons':'armor',
        item:'Routine '+slot+' pool',
        slot,
        current:available,
        loaned,
        coverageNeeded,
        recommendedMin:targetMin,
        recommendedMax:targetMax,
        shortfall:Math.max(0,targetMin-available),
        dataRequired:false,
        rationale:mode==='war'
          ? 'War mode: 20-member participation assumption; cover every member whose current '+slot+' is unverified/below standard, plus two spares.'
          : 'Peace mode: 25% of roster plus two spares; maximum band is 150% of minimum.'
      });
    }

    for(const item of current){
      const category=String(item?.category||'');
      if(!['medical','temporary','consumables','drugs','boosters'].includes(category))continue;
      const name=String(item?.name||'');
      if(/blood bag/i.test(name)&&!/empty blood bag/i.test(name)){
        proposals.push({
          kind:'stackable',mode,category,item:name,itemId:asId(item?.itemId),
          current:n(item?.availableCount||item?.amountOwned),
          recommendedMin:null,recommendedMax:null,shortfall:null,dataRequired:true,
          rationale:'Filled blood-bag mix requires the participating members\' blood-type distribution.'
        });
        continue;
      }
      const rate=n(cons[category+'|'+asId(item?.itemId)]);
      const critical=category==='medical'?CRITICAL_MEDICAL.has(name):category==='temporary'?CRITICAL_TEMPORARY.has(name):false;
      const peaceTarget=Math.ceil(rate*14)+(critical?rosterCount:0);
      const perMember=mode==='war'?warSupplyUnitsPerMember(category,name):0;
      const warPackage=perMember*participants;
      const target=mode==='war'?Math.max(peaceTarget,warPackage):peaceTarget;
      if(target<=0)continue;
      const available=n(item?.availableCount||item?.amountOwned);
      proposals.push({
        kind:'stackable',mode,category,item:name,itemId:asId(item?.itemId),
        current:available,consumptionPerDay:rate,perMemberWarUnits:perMember,
        recommendedMin:target,
        recommendedMax:mode==='war'?Math.ceil(target*1.20):Math.ceil(target*1.5),
        shortfall:Math.max(0,target-available),
        dataRequired:false,
        rationale:mode==='war'
          ? (perMember>0
              ? 'War mode: '+perMember+' per participating member × '+participants+'; never lower than the peace/observed-use floor.'
              : 'War mode: no fixed combat package for this item; retain the peace/observed-use floor.')
          : (critical?'Peace mode: 14-day observed depletion plus one-per-member reserve.':'Peace mode: 14-day observed depletion.')
      });
    }

    if(mode==='war'){
      const existingNames=new Set(current.map(item=>String(item?.category||'')+'|'+String(item?.name||'')));
      for(const [key,perMember] of Object.entries(WAR_SUPPLY_PER_MEMBER)){
        const split=key.indexOf('|');
        const category=key.slice(0,split),name=key.slice(split+1);
        if(existingNames.has(key))continue;
        const target=perMember*participants;
        proposals.push({
          kind:'stackable',mode,category,item:name,itemId:'',
          current:0,consumptionPerDay:0,perMemberWarUnits:perMember,
          recommendedMin:target,recommendedMax:Math.ceil(target*1.20),
          shortfall:target,dataRequired:false,synthetic:true,
          rationale:'War mode: '+perMember+' per participating member × '+participants+'; item is not currently present in faction stock.'
        });
      }
    }

    const days=observedDays(factionInventory);
    const confidence=days>=7?'HIGH':days>=3?'MEDIUM':'LOW';
    return {
      mode,
      participants,
      rosterCount,
      poolMin:mode==='war'?null:peacePoolMin,
      poolMax:mode==='war'?null:peacePoolMax,
      peacePoolMin,
      peacePoolMax,
      observedDays:days,
      confidence,
      proposals,
      actionable:proposals.filter(p=>!p.dataRequired&&n(p.shortfall)>0),
      dataRequired:proposals.filter(p=>p.dataRequired),
      assumptions:mode==='war'
        ? 'WAR: assumes '+participants+' participants; equipment covers all unverified/below-standard members plus two spares; core medical/temp supplies use per-member war packages.'
        : 'PEACE: routine equipment pool is 25% of roster plus two spares; stackables use 14-day observed depletion with one-per-member reserve for critical items.'
    };
  }

  function replyKey(value){
    return String(value||'').trim().toUpperCase()
      .replace(/[^A-Z0-9]+/g,'_')
      .replace(/^_+|_+$/g,'');
  }

  function replyMap(raw){
    const out={};
    for(const line of String(raw||'').split(/\r?\n/)){
      const match=line.match(/^\s*([^:=]{2,40})\s*[:=]\s*(.*?)\s*$/);
      if(!match)continue;
      const key=replyKey(match[1]);
      if(key)out[key]=String(match[2]||'').trim();
    }
    return out;
  }

  function replyNumber(map,keys){
    for(const key of keys){
      const normalized=replyKey(key);
      if(!Object.prototype.hasOwnProperty.call(map,normalized))continue;
      const raw=String(map[normalized]||'').replace(/,/g,'').trim();
      if(!raw)return null;
      const value=Number(raw.replace(/[^0-9.\-]/g,''));
      return Number.isFinite(value)?Math.max(0,value):null;
    }
    return null;
  }

  function parseManualItem(slot,value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    const parts=raw.split('|').map(x=>x.trim()).filter(Boolean);
    const name=parts.shift()||'';
    if(!name)return null;
    let quality=0;
    const bonus=[];
    for(const part of parts){
      const match=part.match(/^(?:Q|QUALITY)\s*[:#-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if(match){quality=Math.max(0,Number(match[1]||0));continue;}
      bonus.push(part);
    }
    return {
      itemId:'',
      name,
      slot:String(slot||''),
      type:String(slot||''),
      subType:String(slot||''),
      damage:0,
      accuracy:0,
      armor:0,
      armorRating:0,
      quality,
      bonuses:bonus.length?{manual:bonus.join(' | ')}:null,
      source:'member message'
    };
  }

  function parseMemberReply(raw){
    const map=replyMap(raw);
    if(!Object.keys(map).length)throw new Error('No KEY: value fields were found in the pasted reply.');
    const stat=(shortName,longName)=>replyNumber(map,[shortName,longName])??0;
    const stats={
      strength:stat('STR','STRENGTH'),
      defense:stat('DEF','DEFENSE'),
      speed:stat('SPD','SPEED'),
      dexterity:stat('DEX','DEXTERITY')
    };
    const slotKeys={
      primary:['PRIMARY'],secondary:['SECONDARY'],melee:['MELEE'],
      helmet:['HELMET','HEAD'],body:['BODY','BODY_ARMOR','BODY_ARMOUR'],
      gloves:['GLOVES','HANDS'],pants:['PANTS','LEGS'],boots:['BOOTS','FEET'],
      temporary:['TEMP_EQUIPPED','TEMPORARY_EQUIPPED']
    };
    const items=[];
    for(const [slot,keys] of Object.entries(slotKeys)){
      let value='';
      for(const key of keys){
        const k=replyKey(key);
        if(map[k]){value=map[k];break;}
      }
      const item=parseManualItem(slot,value);
      if(item)items.push(item);
    }
    const supply={
      bloodType:String(map.BLOOD_TYPE||map.BLOOD||'').trim().toUpperCase(),
      medical:{
        sfak:replyNumber(map,['SFAK','SMALL_FIRST_AID_KIT','SMALL_FIRST_AID_KITS']),
        fak:replyNumber(map,['FAK','FIRST_AID_KIT','FIRST_AID_KITS']),
        morphine:replyNumber(map,['MORPHINE']),
        ipecac:replyNumber(map,['IPECAC']),
        emptyBloodBags:replyNumber(map,['EMPTY_BLOOD_BAGS','EMPTY_BLOOD_BAG']),
        filledBloodBags:String(map.FILLED_BLOOD_BAGS||map.FILLED_BLOOD_BAG||'').trim()
      },
      temporaryStock:String(map.TEMP_STOCK||map.TEMPORARY_STOCK||'').trim(),
      consumables:String(map.CONSUMABLES||map.CONSUMABLE||'').trim(),
      drugs:String(map.DRUGS||map.DRUG||'').trim(),
      boosters:String(map.BOOSTERS||map.BOOSTER||'').trim(),
      utilities:String(map.UTILITIES_OTHER_WAR_SUPPLIES||map.UTILITIES||map.UTILITY||'').trim(),
      ammo:String(map.AMMO||'').trim(),
      weaponMods:String(map.WEAPON_MODS_ATTACHMENTS||map.WEAPON_MODS||map.ATTACHMENTS||'').trim(),
      updatedAt:new Date().toISOString()
    };
    return {
      map,
      stats,
      items,
      equipmentSummary:items.map(item=>String(item.slot||'').toUpperCase()+': '+String(item.name||'')).join(' | '),
      bloodType:supply.bloodType,
      supply,
      warRole:String(map.WAR_ROLE_PREFERENCE||map.WAR_ROLE||map.ROLE||'').trim(),
      notes:String(map.NOTES||'').trim()
    };
  }

  function compactSnapshot(current={},sourceAt=0,fetchedAt=Date.now()){
    const items={};
    for(const [key,item] of Object.entries(current||{})){
      items[key]={
        key,
        category:String(item?.category||''),
        itemId:asId(item?.itemId),
        name:String(item?.name||''),
        amountOwned:n(item?.amountOwned),
        availableCount:n(item?.availableCount),
        loanedCount:n(item?.loanedCount)
      };
    }
    return {
      at:new Date(fetchedAt).toISOString(),
      inventoryTimestamp:sourceAt?new Date(sourceAt).toISOString():null,
      items
    };
  }

  function recordSnapshot(factionInventory,current,sourceAt=0,fetchedAt=Date.now()){
    const next=clone(factionInventory||{});
    next.snapshots=Array.isArray(next.snapshots)?next.snapshots:[];
    next.events=Array.isArray(next.events)?next.events:[];
    const snapshot=compactSnapshot(current,sourceAt,fetchedAt);
    const previous=next.snapshots[next.snapshots.length-1]||null;
    const previousSource=Date.parse(previous?.inventoryTimestamp||'')||0;
    if(previousSource&&sourceAt&&previousSource===sourceAt){
      return {state:next,snapshotAdded:false,eventsAdded:0};
    }
    let eventsAdded=0;
    if(previous){
      const keys=new Set([...Object.keys(previous.items||{}),...Object.keys(snapshot.items||{})]);
      for(const key of keys){
        const oldItem=previous.items?.[key]||{};
        const newItem=snapshot.items?.[key]||{};
        const deltaOwned=n(newItem.amountOwned)-n(oldItem.amountOwned);
        const deltaAvailable=n(newItem.availableCount)-n(oldItem.availableCount);
        const deltaLoaned=n(newItem.loanedCount)-n(oldItem.loanedCount);
        if(deltaOwned||deltaAvailable||deltaLoaned){
          next.events.push({
            at:snapshot.at,
            category:String(newItem.category||oldItem.category||''),
            itemId:asId(newItem.itemId||oldItem.itemId),
            name:String(newItem.name||oldItem.name||key),
            deltaOwned,
            deltaAvailable,
            deltaLoaned,
            amountOwned:n(newItem.amountOwned),
            availableCount:n(newItem.availableCount),
            loanedCount:n(newItem.loanedCount)
          });
          eventsAdded++;
        }
      }
    }
    next.snapshots.push(snapshot);
    next.snapshots=next.snapshots.slice(-192);
    next.events=next.events.slice(-2500);
    return {state:next,snapshotAdded:true,eventsAdded};
  }

  const api=Object.freeze({
    categories:CATEGORIES,
    loanCategories:LOAN_CATEGORIES,
    standardSlots:STANDARD_SLOTS,
    armorSlot,
    weaponSlot,
    equipmentSlot,
    battleProfile,
    equipmentScore,
    summaryEquipmentSlots,
    profileEquipmentSlots,
    readinessTier,
    warReadinessStandard,
    availableFactionCandidates,
    compareMemberBuild,
    loanMap,
    memberRows,
    observedDays,
    consumptionMap,
    warSupplyUnitsPerMember,
    minimumProposal,
    replyKey,
    replyMap,
    replyNumber,
    parseManualItem,
    parseMemberReply,
    compactSnapshot,
    recordSnapshot,
    clone
  });

  Object.defineProperty(globalThis,'MMTornFactionLogic',{
    value:api,configurable:true,enumerable:false,writable:false
  });
})();