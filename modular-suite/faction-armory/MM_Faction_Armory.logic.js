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

  function profileEquipmentSlots(profile={}){
    const out={};
    const items=Array.isArray(profile?.equipment?.items)?profile.equipment.items:[];
    for(const item of items){
      const slot=equipmentSlot(item);
      if(!slot)continue;
      const prior=out[slot];
      if(!prior||equipmentScore(item)>equipmentScore(prior))out[slot]=clone(item);
    }
    return out;
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

  function compareMemberBuild(memberRow,factionInventory={}){
    const stats=memberRow?.stats||memberRow?.profile?.stats||{};
    const profile=battleProfile(stats);
    const current=profileEquipmentSlots(memberRow?.profile||{});
    const candidates=availableFactionCandidates(factionInventory);
    const items=[];

    for(const slot of STANDARD_SLOTS){
      const currentItem=current[slot]||null;
      const list=(candidates[slot]||[]).map(item=>({
        ...item,
        score:equipmentScore(item,profile.bias)
      })).sort((a,b)=>b.score-a.score);
      const best=list[0]||null;
      const currentScore=currentItem?equipmentScore(currentItem,profile.bias):0;
      const bestScore=best?.score||0;

      let decision='NO CURRENT DATA';
      let target=null;
      if(currentItem&&best){
        if(currentScore<=0){
          decision='REVIEW CURRENT GEAR';
          target=best;
        }else if(bestScore>currentScore*1.01){
          decision='UPGRADE AVAILABLE';
          target=best;
        }else{
          decision='KEEP';
          target=currentItem;
        }
      }else if(currentItem){
        decision='KEEP';
        target=currentItem;
      }else if(best){
        decision='REVIEW CURRENT GEAR';
        target=best;
      }

      items.push({
        slot,
        decision,
        currentName:String(currentItem?.name||''),
        currentScore,
        targetName:String(target?.name||''),
        targetScore:target===best?bestScore:currentScore,
        availableCount:target===best?n(best?.availableCount):0,
        currentItem:clone(currentItem),
        targetItem:clone(target)
      });
    }

    const upgrades=items.filter(x=>x.decision==='UPGRADE AVAILABLE').length;
    const reviews=items.filter(x=>x.decision==='REVIEW CURRENT GEAR'||x.decision==='NO CURRENT DATA').length;
    return {
      memberId:asId(memberRow?.memberId),
      memberName:String(memberRow?.memberName||''),
      totalStats:profile.total,
      bias:profile.bias,
      items,
      summary:reviews
        ? reviews+' slot(s) need current gear data before an issue decision.'
        : upgrades
          ? upgrades+' verified faction-stock upgrade(s) available.'
          : 'Current known build is not beaten by available routine faction stock.'
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

  function minimumProposal(factionInventory={}){
    const rosterCount=Object.keys(factionInventory?.memberReadiness?.roster||{}).length;
    const poolMin=Math.max(2,Math.ceil(rosterCount*0.25)+2);
    const poolMax=Math.ceil(poolMin*1.5);
    const cons=consumptionMap(factionInventory);
    const current=Object.values(factionInventory?.current||{});
    const proposals=[];

    for(const slot of STANDARD_SLOTS){
      const slotItems=current.filter(item=>equipmentSlot(item)===slot);
      const available=slotItems.reduce((sum,item)=>sum+n(item?.availableCount),0);
      const loaned=slotItems.reduce((sum,item)=>sum+n(item?.loanedCount),0);
      proposals.push({
        kind:'equipment',
        category:['primary','secondary','melee'].includes(slot)?'weapons':'armor',
        item:'Routine '+slot+' pool',
        slot,
        current:available,
        loaned,
        recommendedMin:poolMin,
        recommendedMax:poolMax,
        shortfall:Math.max(0,poolMin-available),
        dataRequired:false,
        rationale:'25% of roster plus two spares; maximum band is 150% of minimum.'
      });
    }

    for(const item of current){
      const category=String(item?.category||'');
      if(!['medical','temporary','consumables'].includes(category))continue;
      const name=String(item?.name||'');
      if(/blood bag/i.test(name)&&!/empty blood bag/i.test(name)){
        proposals.push({
          kind:'stackable',
          category,
          item:name,
          itemId:asId(item?.itemId),
          current:n(item?.availableCount||item?.amountOwned),
          recommendedMin:null,
          recommendedMax:null,
          shortfall:null,
          dataRequired:true,
          rationale:'Filled blood-bag mix requires member blood-type distribution.'
        });
        continue;
      }
      const rate=n(cons[category+'|'+asId(item?.itemId)]);
      const critical=category==='medical'?CRITICAL_MEDICAL.has(name):category==='temporary'?CRITICAL_TEMPORARY.has(name):false;
      let target=Math.ceil(rate*14);
      if(critical)target+=rosterCount;
      if(target<=0)continue;
      const available=n(item?.availableCount||item?.amountOwned);
      proposals.push({
        kind:'stackable',
        category,
        item:name,
        itemId:asId(item?.itemId),
        current:available,
        consumptionPerDay:rate,
        recommendedMin:target,
        recommendedMax:Math.ceil(target*1.5),
        shortfall:Math.max(0,target-available),
        dataRequired:false,
        rationale:(critical?'14-day observed depletion plus one-per-member reserve.':'14-day observed depletion.')
      });
    }

    const days=observedDays(factionInventory);
    const confidence=days>=7?'HIGH':days>=3?'MEDIUM':'LOW';
    return {
      rosterCount,
      poolMin,
      poolMax,
      observedDays:days,
      confidence,
      proposals,
      actionable:proposals.filter(p=>!p.dataRequired&&n(p.shortfall)>0),
      dataRequired:proposals.filter(p=>p.dataRequired)
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
    profileEquipmentSlots,
    availableFactionCandidates,
    compareMemberBuild,
    loanMap,
    memberRows,
    observedDays,
    consumptionMap,
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