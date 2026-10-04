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

  // Research-backed, non-live procurement reference. These are normal shop/abroad
  // items with high circulation; this module deliberately does not search Item Market/Bazaars.
  const GENERAL_EQUIPMENT_CATALOG=Object.freeze([
    {name:'Benelli M4 Super',slot:'primary',damage:61.5,accuracy:57.5,baselineDamage:59,baselineAccuracy:55,marketValue:20739,source:'Big Al\'s Gun Shop',availability:'COMMON',class:'routine'},
    {name:'Mag 7',slot:'primary',damage:58.5,accuracy:64.5,baselineDamage:56,baselineAccuracy:62,marketValue:52460,source:'South Africa',availability:'COMMON',class:'routine'},
    {name:'AK-47',slot:'primary',damage:58.5,accuracy:54.5,baselineDamage:56,baselineAccuracy:52,marketValue:9791,source:'Mexico',availability:'VERY COMMON',class:'routine'},
    {name:'Jackhammer',slot:'primary',damage:71.5,accuracy:54.5,baselineDamage:69,baselineAccuracy:52,marketValue:4025949,source:'Switzerland',availability:'COMMON',class:'routine'},
    {name:'ArmaLite M-15A4',slot:'primary',damage:70.5,accuracy:59.5,baselineDamage:68,baselineAccuracy:57,marketValue:21571985,source:'Mexico',availability:'GENERAL / PREMIUM',class:'premium'},

    {name:'BT MP9',slot:'secondary',damage:63.5,accuracy:57.5,baselineDamage:61,baselineAccuracy:55,marketValue:47954,source:'Japan',availability:'VERY COMMON',class:'routine'},
    {name:'Qsz-92',slot:'secondary',damage:64.5,accuracy:55.5,baselineDamage:62,baselineAccuracy:53,marketValue:69906,source:'China',availability:'VERY COMMON',class:'routine'},

    {name:'Macana',slot:'melee',damage:59.5,accuracy:67.5,baselineDamage:57,baselineAccuracy:65,marketValue:118822,source:'Argentina',availability:'VERY COMMON',class:'routine'},
    {name:'Diamond Bladed Knife',slot:'melee',damage:62.5,accuracy:64.5,baselineDamage:60,baselineAccuracy:62,marketValue:913906,source:'Cayman Islands',availability:'VERY COMMON',class:'routine'},

    {name:'WWII Helmet',slot:'helmet',armorRating:36.5,baselineArmor:34,marketValue:73168,source:'United Kingdom',availability:'VERY COMMON',class:'budget'},
    {name:'Bulletproof Vest',slot:'body',armorRating:36.5,baselineArmor:34,marketValue:31271,source:'Big Al\'s Gun Shop',availability:'VERY COMMON',class:'budget'},
    {name:'Kevlar Gloves',slot:'gloves',armorRating:34.5,baselineArmor:32,marketValue:319800,source:'Mexico',availability:'COMMON',class:'budget'},
    {name:'Safety Boots',slot:'boots',armorRating:32.5,baselineArmor:30,marketValue:57086,source:'Canada',availability:'VERY COMMON',class:'budget'},
    {name:'Combat Helmet',slot:'helmet',armorRating:40.5,baselineArmor:38,marketValue:3389173,source:'South Africa',availability:'VERY COMMON',class:'routine'},
    {name:'Combat Vest',slot:'body',armorRating:40.5,baselineArmor:38,marketValue:3559659,source:'South Africa',availability:'VERY COMMON',class:'routine'},
    {name:'Combat Gloves',slot:'gloves',armorRating:40.5,baselineArmor:38,marketValue:2151411,source:'South Africa',availability:'VERY COMMON',class:'routine'},
    {name:'Combat Pants',slot:'pants',armorRating:40.5,baselineArmor:38,marketValue:3157386,source:'South Africa',availability:'VERY COMMON',class:'routine'},
    {name:'Combat Boots',slot:'boots',armorRating:40.5,baselineArmor:38,marketValue:2594040,source:'South Africa',availability:'VERY COMMON',class:'routine'}
  ]);
  const CATALOG_BY_NAME=new Map(GENERAL_EQUIPMENT_CATALOG.map(item=>[String(item.name).toLowerCase(),item]));

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

  function catalogItemByName(name){
    return CATALOG_BY_NAME.get(String(name||'').trim().toLowerCase())||null;
  }

  function weaponSlot(item){
    const catalog=catalogItemByName(item?.name);
    if(catalog&&['primary','secondary','melee'].includes(catalog.slot))return catalog.slot;
    const explicit=[item?.slot,item?.category,item?.type,item?.subType,item?.sub_type,item?.weaponType,item?.weapon_type]
      .map(v=>String(v||'').toLowerCase()).join(' ');
    if(/\bsecondary\b/.test(explicit))return 'secondary';
    if(/\bprimary\b/.test(explicit))return 'primary';
    if(/\bmelee\b/.test(explicit))return 'melee';
    if(/pistol|revolver/.test(explicit))return 'secondary';
    if(/piercing|slashing|clubbing|mechanical|fist|weapon of honor/.test(explicit))return 'melee';
    // SMG / shotgun can be either primary or secondary in Torn, so only infer these
    // from type text if the API explicitly also gives primary/secondary or the catalog knows the name.
    if(/rifle|machine gun/.test(explicit))return 'primary';
    const rawName=String(item?.name||'').toLowerCase();
    if(/qsz-92|bt mp9|beretta|magnum|usp|cobra derringer/.test(rawName))return 'secondary';
    return '';
  }

  function equipmentSlot(item){
    const catalog=catalogItemByName(item?.name);
    if(catalog)return catalog.slot;
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
    if(!total)return {
      total:0,dominant:'',bias:'balanced',shares:{},
      offensiveNeed:'balanced',defensiveStyle:'balanced',buildStyle:'UNKNOWN'
    };
    const shares=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v/total]));
    const dominant=Object.entries(values).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';

    // Research model: STR affects raw damage, SPD affects base hit chance.
    // Therefore the weaker offensive axis is what equipment should compensate.
    let offensiveNeed='balanced';
    if(values.speed>0&&values.strength>values.speed*1.20)offensiveNeed='accuracy';
    else if(values.strength>0&&values.speed>values.strength*1.20)offensiveNeed='damage';

    let defensiveStyle='balanced';
    if(values.defense>values.dexterity*1.25)defensiveStyle='defense';
    else if(values.dexterity>values.defense*1.25)defensiveStyle='dexterity';

    let buildStyle='BALANCED';
    const minShare=Math.min(...Object.values(shares));
    const maxShare=Math.max(...Object.values(shares));
    if(minShare<0.08&&maxShare>0.32)buildStyle='HANK-LIKE / SPECIALIZED';
    else if(maxShare>0.29&&minShare>0.17)buildStyle='BALDR-LIKE / BALANCED SPECIALIZATION';
    else if(shares.strength+shares.speed>0.58)buildStyle='OFFENSE-HEAVY';
    else if(shares.defense>0.34)buildStyle='DEFENSE-HEAVY';
    else if(shares.dexterity>0.34)buildStyle='DEXTERITY-HEAVY';

    return {
      total,dominant,bias:offensiveNeed,shares,
      offensiveNeed,defensiveStyle,buildStyle
    };
  }

  function enrichCatalogItem(item){
    if(!item)return null;
    const ref=catalogItemByName(item?.name);
    return ref?{...clone(ref),...clone(item),slot:ref.slot,
      damage:n(item?.damage)||n(ref.damage),
      accuracy:n(item?.accuracy)||n(ref.accuracy),
      armorRating:n(item?.armorRating??item?.armor)||n(ref.armorRating)
    }:clone(item);
  }

  function equipmentScore(item,bias='balanced'){
    const enriched=enrichCatalogItem(item)||{};
    const slot=equipmentSlot(enriched);
    if(['helmet','body','gloves','pants','boots'].includes(slot)){
      return n(enriched?.armorRating ?? enriched?.armor ?? enriched?.stats?.armor ?? enriched?.stats?.protection);
    }
    const damage=n(enriched?.damage ?? enriched?.stats?.damage);
    const accuracy=n(enriched?.accuracy ?? enriched?.stats?.accuracy);
    if(!damage||!accuracy)return 0;
    // Neutral fair-fight expected-output proxy: Damage × hit probability.
    // Style adjustment is deliberately modest and only breaks near-equal choices.
    const base=damage*(accuracy/100);
    if(bias==='accuracy')return base*(1+Math.max(-0.10,Math.min(0.10,(accuracy-57.5)/100)));
    if(bias==='damage')return base*(1+Math.max(-0.10,Math.min(0.10,(damage-62.5)/100)));
    return base;
  }

  function readinessFloorScore(item,bias='balanced'){
    const enriched=enrichCatalogItem(item)||{};
    const slot=equipmentSlot(enriched);
    if(['helmet','body','gloves','pants','boots'].includes(slot)){
      return n(enriched.baselineArmor)||n(enriched.armorRating)||n(enriched.armor);
    }
    const damage=n(enriched.baselineDamage)||n(enriched.damage);
    const accuracy=n(enriched.baselineAccuracy)||n(enriched.accuracy);
    if(!damage||!accuracy)return 0;
    const base=damage*(accuracy/100);
    if(bias==='accuracy')return base*(1+Math.max(-0.10,Math.min(0.10,(accuracy-57.5)/100)));
    if(bias==='damage')return base*(1+Math.max(-0.10,Math.min(0.10,(damage-62.5)/100)));
    return base;
  }

  function generalCandidates(slot,{includePremium=false}={}){
    return GENERAL_EQUIPMENT_CATALOG
      .filter(item=>item.slot===slot&&(includePremium||item.class!=='premium'))
      .map(clone);
  }

  function namedCatalog(name){
    return clone(catalogItemByName(name));
  }

  function equipmentValueMetrics(item,bias='balanced'){
    const enriched=enrichCatalogItem(item)||{};
    const performance=equipmentScore(enriched,bias);
    const price=n(enriched.marketValue);
    return {
      performance,
      price,
      performancePerMillion:price>0?performance/(price/1000000):0
    };
  }

  function generalTargetForSlot(slot,profile={},mode='budget'){
    const m=['budget','standard','ideal'].includes(String(mode||'').toLowerCase())
      ? String(mode).toLowerCase():'budget';
    const need=profile?.offensiveNeed||profile?.bias||'balanced';

    const candidates=generalCandidates(slot,{includePremium:m==='ideal'})
      .map(item=>{
        const value=equipmentValueMetrics(item,need);
        return {...item,_performance:value.performance,_price:value.price};
      })
      .filter(item=>item._performance>0);

    if(!candidates.length)return null;

    const bestPerformance=Math.max(...candidates.map(item=>item._performance));
    const retention=m==='budget'?0.80:0.92;
    const viable=candidates.filter(item=>item._performance>=bestPerformance*retention);
    const valuePick=(viable.length?viable:candidates).slice().sort((a,b)=>
      (a._price||Number.MAX_SAFE_INTEGER)-(b._price||Number.MAX_SAFE_INTEGER) ||
      b._performance-a._performance
    )[0];
    const performancePick=candidates.slice().sort((a,b)=>
      b._performance-a._performance || a._price-b._price
    )[0];

    let chosen=valuePick;
    if(m==='ideal'&&performancePick&&valuePick&&performancePick.name!==valuePick.name){
      const gainPct=valuePick._performance>0
        ? (performancePick._performance-valuePick._performance)/valuePick._performance*100
        : 100;
      const costMultiple=valuePick._price>0?performancePick._price/valuePick._price:Infinity;
      if(gainPct>=12||costMultiple<=2.25)chosen=performancePick;
    }

    const clean=clone(chosen);
    delete clean._performance;
    delete clean._price;
    return clean;
  }

  function premiumOptionForSlot(slot,profile={}){
    const candidates=generalCandidates(slot,{includePremium:true});
    if(!candidates.length)return null;
    return candidates.slice().sort((a,b)=>
      equipmentScore(b,profile?.offensiveNeed||profile?.bias||'balanced')-
      equipmentScore(a,profile?.offensiveNeed||profile?.bias||'balanced')
    )[0]||null;
  }

  function ownedEquipmentCandidates(profile={}){
    const items=Array.isArray(profile?.ownedEquipment?.items)?profile.ownedEquipment.items:[];
    const out={};
    for(const raw of items){
      const item=enrichCatalogItem(raw);
      const slot=equipmentSlot(item);
      if(!slot||n(raw?.quantity??raw?.amount??1)<=0)continue;
      if(!out[slot])out[slot]=[];
      out[slot].push({...item,quantity:n(raw?.quantity??raw?.amount??1)});
    }
    return out;
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

  function readinessPriority(memberRow={},rosterRows=[]){
    // Priority is for scarce premium allocation only; it does NOT define readiness.
    const total=n(memberRow?.statProfile?.total||battleProfile(memberRow?.stats||memberRow?.profile?.stats||{}).total);
    const level=n(memberRow?.level);
    const known=(rosterRows||[]).filter(row=>n(row?.statProfile?.total)>0);
    const sorted=known.map(row=>n(row.statProfile.total)).sort((a,b)=>a-b);
    const rank=sorted.length?sorted.filter(x=>x<=total).length/sorted.length:0;
    return {
      label:rank>=0.75?'HIGH':rank>=0.35?'NORMAL':'DEVELOPING',
      statPercentile:rank,
      level,
      // Level is retained as survivability context because Torn life rises with level,
      // but it does not raise/lower the weapon baseline.
      lifeContext:level>=25?'higher-life':'developing-life'
    };
  }

  function warReadinessStandard(memberRow={},factionInventory={},rosterRows=[],options={}){
    const bp=memberRow?.statProfile?.total?memberRow.statProfile:battleProfile(memberRow?.stats||memberRow?.profile?.stats||{});
    const procurementMode=['budget','standard','ideal'].includes(String(options?.procurementMode||'').toLowerCase())?String(options.procurementMode).toLowerCase():'budget';
    const floors={};
    const targets={};
    const premium={};
    for(const slot of STANDARD_SLOTS){
      const target=generalTargetForSlot(slot,bp,procurementMode);
      const premiumOption=premiumOptionForSlot(slot,bp);
      targets[slot]=target;
      premium[slot]=premiumOption;
      floors[slot]={score:target?readinessFloorScore(target,bp.offensiveNeed):0};
    }
    return {
      priority:readinessPriority({...memberRow,statProfile:bp},rosterRows),
      style:bp.offensiveNeed,
      buildStyle:bp.buildStyle,
      defensiveStyle:bp.defensiveStyle,
      dominant:bp.dominant,
      floors,
      targets,
      premium,
      procurementMode,
      methodology:'Objective generally-available '+procurementMode+' baseline; member-owned gear and faction inventory affect route only, not readiness.'
    };
  }

  function availableFactionCandidates(factionInventory={}){
    const current=factionInventory?.current&&typeof factionInventory.current==='object'
      ? factionInventory.current:{};
    const out={};
    for(const item of Object.values(current)){
      if(n(item?.availableCount)<=0)continue;
      const enriched=enrichCatalogItem(item);
      const slot=equipmentSlot(enriched);
      if(!slot)continue;
      const row={...enriched,slot,score:0};
      if(!out[slot])out[slot]=[];
      out[slot].push(row);
    }
    return out;
  }

  function compareMemberBuild(memberRow,factionInventory={},rosterRows=[],options={}){
    const stats=memberRow?.stats||memberRow?.profile?.stats||{};
    const profile=battleProfile(stats);
    const currentRaw=profileEquipmentSlots(memberRow?.profile||{});
    const current=Object.fromEntries(Object.entries(currentRaw).map(([slot,item])=>[slot,enrichCatalogItem(item)]));
    const owned=ownedEquipmentCandidates(memberRow?.profile||{});
    const assignedLoans={};
    for(const loan of memberRow?.loanItems||[]){
      const item=enrichCatalogItem({name:loan?.name,amount:loan?.amount,source:'Faction loan'});
      const slot=equipmentSlot(item);
      if(!slot)continue;
      const prior=assignedLoans[slot];
      if(!prior||equipmentScore(item,profile.offensiveNeed)>equipmentScore(prior,profile.offensiveNeed))assignedLoans[slot]=item;
    }
    const faction=availableFactionCandidates(factionInventory);
    const standard=warReadinessStandard({...memberRow,stats,statProfile:profile},factionInventory,rosterRows,options);
    const items=[];

    for(const slot of STANDARD_SLOTS){
      const currentItem=current[slot]||null;
      const target=standard.targets[slot]||null;
      const premium=standard.premium[slot]||null;
      const floor=target?readinessFloorScore(target,profile.offensiveNeed):0;
      const currentScore=currentItem?equipmentScore(currentItem,profile.offensiveNeed):0;
      const ownedOptions=(owned[slot]||[]).map(item=>({
        ...item,score:equipmentScore(item,profile.offensiveNeed)
      })).filter(item=>item.score>=floor&&item.score>0).sort((a,b)=>b.score-a.score);
      const ownedOption=ownedOptions[0]||null;
      const assignedLoan=assignedLoans[slot]||null;
      const assignedLoanScore=assignedLoan?equipmentScore(assignedLoan,profile.offensiveNeed):0;
      const factionOptions=(faction[slot]||[]).map(item=>({
        ...item,score:equipmentScore(item,profile.offensiveNeed)
      })).filter(item=>item.score>=floor&&item.score>0).sort((a,b)=>
        (n(a.marketValue)||Number.MAX_SAFE_INTEGER)-(n(b.marketValue)||Number.MAX_SAFE_INTEGER) ||
        a.score-b.score
      );
      const factionOption=factionOptions[0]||null;

      let decision='CURRENT GEAR MISSING — PROVISION';
      let route='ACQUIRE';
      let ready=false;
      let suggested=target;

      if(currentItem&&currentScore>0&&(!floor||currentScore>=floor)){
        decision='WAR READY — KEEP';
        route='KEEP';
        ready=true;
        suggested=currentItem;
      }else if(ownedOption){
        decision='OWNED — EQUIP / VERIFY';
        route='OWNED';
        suggested=ownedOption;
      }else if(assignedLoan&&assignedLoanScore>=floor){
        decision='PROVISIONED — VERIFY EQUIPPED';
        route='LOANED';
        suggested=assignedLoan;
      }else if(currentItem&&currentScore<=0){
        decision='REVIEW CURRENT GEAR';
        route='REVIEW';
        suggested=target||currentItem;
      }else if(factionOption){
        decision=currentItem?'UPGRADE — ISSUE FACTION':'PROVISION — ISSUE FACTION';
        route='ISSUE';
        suggested=factionOption;
      }else if(target){
        decision=currentItem?'UPGRADE — ACQUIRE':'PROVISION — ACQUIRE';
        route='ACQUIRE';
        suggested=target;
      }else{
        decision='REVIEW';
        route='REVIEW';
        suggested=currentItem;
      }

      const currentMarketValue=n(currentItem?.marketValue);
      const targetMarketValue=n(target?.marketValue);
      const premiumMarketValue=n(premium?.marketValue);
      const targetPerformance=target?equipmentScore(target,profile.offensiveNeed):0;
      const premiumScore=premium?equipmentScore(premium,profile.offensiveNeed):0;
      const premiumGainPct=targetPerformance>0&&premium
        ? Math.max(0,(premiumScore-targetPerformance)/targetPerformance*100)
        : 0;
      const premiumCostMultiple=targetMarketValue>0&&premiumMarketValue>0
        ? premiumMarketValue/targetMarketValue
        : 0;
      const valueNote=ready
        ? 'KEEP: current gear already meets the performance floor; price is not a reason to replace owned gear.'
        : target
          ? 'VALUE TARGET: '+String(target.name)+' at reference $'+Math.round(targetMarketValue).toLocaleString()+
            (premium&&premium.name!==target.name
              ? ' · premium '+String(premium.name)+' is +'+premiumGainPct.toFixed(1)+'% performance at '+premiumCostMultiple.toFixed(1)+'x reference cost'
              : '')
          : '';

      items.push({
        slot,decision,route,ready,
        readinessFloor:floor,
        currentName:String(currentItem?.name||''),
        currentScore,
        currentMarketValue,
        targetName:String(target?.name||''),
        targetScore:floor,
        targetMarketValue,
        suggestedName:String(suggested?.name||''),
        suggestedSource:String(suggested?.source||''),
        suggestedMarketValue:n(suggested?.marketValue),
        premiumMarketValue,
        premiumGainPct,
        premiumCostMultiple,
        valueNote,
        ownedOptionName:String(ownedOption?.name||''),
        ownedOptionQuantity:n(ownedOption?.quantity),
        factionOptionName:String(factionOption?.name||''),
        factionAvailableCount:n(factionOption?.availableCount),
        assignedLoanName:String(assignedLoan?.name||''),
        premiumOptionName:String(premium?.name||''),
        currentItem:clone(currentItem),
        targetItem:clone(target),
        suggestedItem:clone(suggested)
      });
    }

    const readyCount=items.filter(x=>x.ready).length;
    const acquire=items.filter(x=>x.route==='ACQUIRE').length;
    const issue=items.filter(x=>x.route==='ISSUE').length;
    return {
      memberId:asId(memberRow?.memberId),
      memberName:String(memberRow?.memberName||''),
      totalStats:profile.total,
      bias:profile.offensiveNeed,
      offensiveNeed:profile.offensiveNeed,
      defensiveStyle:profile.defensiveStyle,
      buildStyle:profile.buildStyle,
      priority:standard.priority,
      procurementMode:standard.procurementMode,
      dominant:standard.dominant,
      items,
      warReady:readyCount===STANDARD_SLOTS.length,
      summary:acquire
        ? acquire+' slot(s) require acquisition; '+issue+' can be filled from current faction stock.'
        : issue
          ? issue+' slot(s) can be filled from current faction stock.'
          : 'Known build meets the generally-available war baseline.'
    };
  }

  function acquisitionPlan(factionInventory={},options={}){
    const mode=String(options?.mode||'war').toLowerCase()==='peace'?'peace':'war';
    const participants=Math.max(1,Math.round(Number(options?.participants||DEFAULT_WAR_PARTICIPANTS)));
    const procurementMode=['budget','standard','ideal'].includes(String(options?.procurementMode||'').toLowerCase())?String(options.procurementMode).toLowerCase():'budget';
    const budgetCap=Math.max(0,Number(options?.budgetCap??15000000)||0);
    const rows=memberRows(factionInventory,[],{procurementMode});
    const selected=rows.slice(0,participants);
    const pools=availableFactionCandidates(factionInventory);
    const poolState={};
    for(const [slot,items] of Object.entries(pools)){
      poolState[slot]=items.map(item=>({
        ...item,
        remaining:n(item.availableCount),
        scoreByBias:{}
      }));
    }

    const requirements=new Map();
    const assignments=[];
    const unresolved=[];
    const addRequirement=(item,qty,reason,category='equipment')=>{
      if(!item||!String(item.name||'').trim()||qty<=0)return;
      const key=category+'|'+String(item.name);
      const prior=requirements.get(key)||{
        category,item:String(item.name),qty:0,source:String(item.source||''),
        marketValue:n(item.marketValue),reasons:new Set()
      };
      prior.qty+=qty;
      if(reason)prior.reasons.add(reason);
      requirements.set(key,prior);
    };

    function allocateFaction(slot,target,bias){
      const floor=target?readinessFloorScore(target,bias):0;
      const candidates=(poolState[slot]||[])
        .filter(item=>item.remaining>0&&equipmentScore(item,bias)>=floor)
        .sort((a,b)=>
          (n(a.marketValue)||Number.MAX_SAFE_INTEGER)-(n(b.marketValue)||Number.MAX_SAFE_INTEGER) ||
          equipmentScore(a,bias)-equipmentScore(b,bias)
        );
      const pick=candidates[0]||null;
      if(pick)pick.remaining--;
      return pick;
    }

    for(const member of selected){
      if(!member?.hasStats){
        for(const slot of STANDARD_SLOTS)unresolved.push({memberId:member.memberId,memberName:member.memberName,slot,current:'',reason:'Current battle stats are missing; acquisition deferred.'});
        continue;
      }
      const inventoryKnown=Array.isArray(member?.profile?.ownedEquipment?.items);
      const build=compareMemberBuild(member,factionInventory,rows,{procurementMode});
      for(const item of build.items){
        if(item.ready||item.route==='LOANED'||item.route==='OWNED')continue;
        if(!item.currentName&&!inventoryKnown){
          unresolved.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,current:'',reason:'Member inventory has not been refreshed; purchase deferred.'});
          continue;
        }
        if(item.route==='REVIEW'){
          unresolved.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,current:item.currentName||'',reason:'Current item exists but performance is not known.'});
          continue;
        }
        const target=item.targetItem;
        if(!target){
          unresolved.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,current:item.currentName||'',reason:'No baseline target could be resolved.'});
          continue;
        }
        const factionPick=allocateFaction(item.slot,target,build.offensiveNeed);
        if(factionPick){
          assignments.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,route:'ISSUE',item:factionPick.name});
        }else{
          addRequirement(target,1,member.memberName+' '+item.slot,'equipment');
          assignments.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,route:'ACQUIRE',item:target.name});
        }
      }
    }

    // War inventory includes two ready-to-issue spares per standard slot after member coverage.
    if(mode==='war'){
      const neutral=battleProfile({strength:1,defense:1,speed:1,dexterity:1});
      for(const slot of STANDARD_SLOTS){
        const target=generalTargetForSlot(slot,neutral,procurementMode);
        for(let i=0;i<2;i++){
          const factionPick=allocateFaction(slot,target,'balanced');
          if(!factionPick)addRequirement(target,1,'War spare '+slot,'equipment');
        }
      }
    }

    // Stackable acquisition comes from the selected Peace/War minimum policy.
    const minimums=minimumProposal(factionInventory,{mode,participants,procurementMode});
    for(const row of minimums.proposals){
      if(row.kind==='equipment'||row.dataRequired||n(row.shortfall)<=0)continue;
      addRequirement({
        name:row.item,
        source:'General Torn supply / faction procurement',
        marketValue:0
      },n(row.shortfall),'Inventory minimum','provisions');
    }

    const priorityFor=row=>{
      if(row.category==='equipment'){
        const slot=GENERAL_EQUIPMENT_CATALOG.find(x=>x.name===row.item)?.slot||'';
        return ({primary:10,secondary:20,melee:30,body:40,helmet:45,gloves:50,pants:55,boots:60}[slot]??65);
      }
      if(/First Aid Kit|Small First Aid Kit|Morphine|Ipecac|Blood Bag/.test(row.item))return 70;
      if(/Grenade|HEG|Pepper Spray|Tear Gas|Smoke/.test(row.item))return 80;
      if(/Xanax/.test(row.item))return 90;
      return 100;
    };
    const list=[...requirements.values()].map(row=>({
      ...row,
      reasons:[...row.reasons].join(' | '),
      estimatedValue:row.marketValue?row.marketValue*row.qty:0,
      priority:priorityFor(row)
    })).sort((a,b)=>a.priority-b.priority||String(a.category).localeCompare(String(b.category))||String(a.item).localeCompare(String(b.item)));

    let remainingBudget=budgetCap;
    for(const row of list){
      if(!row.marketValue){
        row.fundedQty=row.qty;
        row.deferredQty=0;
        row.fundedEstimatedValue=0;
        continue;
      }
      const affordable=Math.min(row.qty,Math.floor(remainingBudget/row.marketValue));
      row.fundedQty=Math.max(0,affordable);
      row.deferredQty=Math.max(0,row.qty-row.fundedQty);
      row.fundedEstimatedValue=row.fundedQty*row.marketValue;
      remainingBudget=Math.max(0,remainingBudget-row.fundedEstimatedValue);
    }

    return {
      mode,participants,procurementMode,budgetCap,remainingBudget,
      assignments,
      unresolved,
      unresolvedCount:unresolved.length,
      list,
      totalUnits:list.reduce((sum,row)=>sum+n(row.qty),0),
      fundedUnits:list.reduce((sum,row)=>sum+n(row.fundedQty),0),
      deferredUnits:list.reduce((sum,row)=>sum+n(row.deferredQty),0),
      estimatedEquipmentValue:list.reduce((sum,row)=>sum+n(row.estimatedValue),0),
      fundedEstimatedValue:list.reduce((sum,row)=>sum+n(row.fundedEstimatedValue),0),
      deferredEstimatedValue:list.reduce((sum,row)=>sum+n(row.estimatedValue)-n(row.fundedEstimatedValue),0)
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

  function readinessApprovalIsCurrent(profile={},procurementMode='budget'){
    const approval=profile?.readinessApproval;
    if(!approval||String(approval.status||'')!=='WAR READY')return false;
    const verifiedAt=String(profile?.verifiedAt||'');
    const approvedVerifiedAt=String(approval.verifiedAt||'');
    const approvedMode=String(approval.procurementMode||'budget').toLowerCase();
    return Boolean(verifiedAt&&approvedVerifiedAt===verifiedAt&&approvedMode===String(procurementMode||'budget').toLowerCase());
  }

  function memberRows(factionInventory={},savedKeyIds=[],options={}){
    const readiness=factionInventory?.memberReadiness||{};
    const roster=Object.values(readiness?.roster||{});
    const profiles=readiness?.profiles||{};
    const keys=new Set((savedKeyIds||[]).map(asId));
    const loans=loanMap(factionInventory);
    const staleHours=n(readiness?.settings?.staleHours)||72;
    const procurementMode=['budget','standard','ideal'].includes(String(options?.procurementMode||'').toLowerCase())
      ? String(options.procurementMode).toLowerCase():'budget';

    const baseRows=roster.map(member=>{
      const id=asId(member?.memberId);
      const profile=profiles[id]&&typeof profiles[id]==='object'?profiles[id]:{};
      const stats=profile?.stats||{};
      const bp=battleProfile(stats);
      const equipmentSummary=String(profile?.equipment?.summary||'').trim();
      const hasEquipment=Boolean(equipmentSummary)||Array.isArray(profile?.equipment?.items)&&profile.equipment.items.length>0;
      const verifiedMs=Date.parse(profile?.verifiedAt||'')||0;
      const ageHours=verifiedMs?Math.max(0,(Date.now()-verifiedMs)/3600000):null;
      const stale=ageHours!=null&&ageHours>staleHours;
      let dataStatus='READY FOR REVIEW';
      if(!bp.total||!hasEquipment)dataStatus='MISSING DATA';
      else if(stale)dataStatus='STALE DATA';
      else if(String(profile?.medicalStatus||'').includes('NEEDS')||String(profile?.ipecacStatus||'').includes('NEEDS'))dataStatus='SUPPLY ACTION';
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
        dataReadinessStatus:dataStatus,
        readinessStatus:dataStatus
      };
    });

    const rows=baseRows.map(row=>{
      const build=compareMemberBuild(row,factionInventory,baseRows,{procurementMode});
      let status=row.dataReadinessStatus;
      if(status==='READY FOR REVIEW'){
        if(!build.warReady)status='ACTION NEEDED';
        else if(readinessApprovalIsCurrent(row.profile,procurementMode))status='WAR READY';
        else status='READY FOR REVIEW';
      }
      return {
        ...row,
        readinessStatus:status,
        buildWarReady:Boolean(build.warReady),
        buildAssessment:build,
        readinessApprovedAt:status==='WAR READY'?String(row.profile?.readinessApproval?.approvedAt||''):'',
        readinessApprovalMode:status==='WAR READY'?String(row.profile?.readinessApproval?.procurementMode||procurementMode):''
      };
    });

    return rows.sort((a,b)=>{
      const priority={'MISSING DATA':0,'STALE DATA':1,'SUPPLY ACTION':2,'ACTION NEEDED':3,'READY FOR REVIEW':4,'WAR READY':5};
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
    const rosterRows=memberRows(factionInventory,[],{procurementMode:options?.procurementMode||'budget'});
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
          const build=compareMemberBuild(member,factionInventory,rosterRows,{procurementMode:options?.procurementMode||'budget'});
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
    generalEquipmentCatalog:GENERAL_EQUIPMENT_CATALOG,
    loanCategories:LOAN_CATEGORIES,
    standardSlots:STANDARD_SLOTS,
    armorSlot,
    weaponSlot,
    equipmentSlot,
    battleProfile,
    catalogItemByName,
    enrichCatalogItem,
    equipmentScore,
    equipmentValueMetrics,
    readinessFloorScore,
    generalCandidates,
    generalTargetForSlot,
    premiumOptionForSlot,
    summaryEquipmentSlots,
    profileEquipmentSlots,
    ownedEquipmentCandidates,
    readinessPriority,
    warReadinessStandard,
    availableFactionCandidates,
    compareMemberBuild,
    acquisitionPlan,
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