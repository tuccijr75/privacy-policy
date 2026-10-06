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
  // Torn /user/equipment exposes an authoritative numeric equipment slot. Preserve
  // that signal so valid equipped gear does not depend on our curated name catalog.
  const EQUIPMENT_SLOT_BY_NUMBER=Object.freeze({
    1:'primary',2:'secondary',3:'melee',4:'body',5:'temporary',
    6:'helmet',7:'pants',8:'boots',9:'gloves'
  });
  const CRITICAL_MEDICAL=new Set([
    'First Aid Kit','Morphine','Small First Aid Kit','Ipecac Syrup','Empty Blood Bag'
  ]);
  const CRITICAL_TEMPORARY=new Set([
    'Flash Grenade','Smoke Grenade','Tear Gas','HEG','Grenade','Pepper Spray'
  ]);

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
    'temporary|Pepper Spray':5
  });
  const WAR_STOCK_ITEM_DEFS=Object.freeze([
    ...Object.entries(WAR_SUPPLY_PER_MEMBER).map(([key,perMember])=>{
      const split=key.indexOf('|');
      return Object.freeze({category:key.slice(0,split),name:key.slice(split+1),perMember});
    }),
    Object.freeze({category:'drugs',name:'Xanax',special:'xanax'})
  ]);
  const DEFAULT_XANAX_POLICY=Object.freeze({
    investmentPosture:'conserve',
    reasonableRatio:0.80,
    highThreshold:25000,
    mediumThreshold:5000,
    highCeiling:4,
    mediumCeiling:3,
    lowCeiling:2,
    memberOverrides:Object.freeze({})
  });
  const RANK_TRIGGER_COUNT=Object.freeze({
    'absolute beginner':0,'beginner':1,'inexperienced':2,'rookie':3,'novice':4,
    'below average':5,'average':6,'reasonable':7,'above average':8,'competent':9,
    'highly competent':10,'veteran':11,'distinguished':12,'highly distinguished':13,
    'professional':14,'star':15,'master':16,'outstanding':17,'celebrity':18,
    'supreme':19,'idolized':20,'idolised':20,'champion':21,'heroic':22,
    'legendary':23,'elite':24,'invincible':25
  });
  const LEVEL_RANK_TRIGGERS=Object.freeze([2,6,11,26,31,50,71,100]);
  const CRIME_RANK_TRIGGERS=Object.freeze([100,5000,10000,20000,30000,50000]);
  const NETWORTH_RANK_TRIGGERS=Object.freeze([5000000,50000000,500000000,5000000000,50000000000]);
  const BATTLE_STAT_RANGES=Object.freeze([
    {min:0,max:2500},
    {min:2500,max:25000},
    {min:25000,max:250000},
    {min:250000,max:2500000},
    {min:2500000,max:35000000},
    {min:35000000,max:250000000},
    {min:250000000,max:null}
  ]);

  // Stable baseline catalog used to decide whether a member meets the current
  // readiness floor. Prices here are references only; live/cached acquisition
  // pricing is layered in by the userscript and does not change the readiness floor.
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
  ].map(item=>Object.freeze({...item,statSource:'CATALOG AVG'})));

  // Additional valid equipment choices used only for per-member option browsing.
  // These do not redefine the readiness baseline. Weapon/armor ranges are from the
  // current Torn Wiki tables; acquisition cost is resolved separately from Torn/shared market data.
  const ALTERNATIVE_EQUIPMENT_CATALOG=Object.freeze([
    // Primary
    {name:'9mm Uzi',slot:'primary',damage:67.5,accuracy:45.5,baselineDamage:65,baselineAccuracy:43,maxDamage:70,maxAccuracy:48,source:'Mexico',class:'alternative'},
    {name:'Enfield SA-80',slot:'primary',damage:65.5,accuracy:57.5,baselineDamage:63,baselineAccuracy:55,maxDamage:68,maxAccuracy:60,source:'United Kingdom',class:'alternative'},
    {name:'Heckler & Koch SL8',slot:'primary',damage:62.5,accuracy:48.5,baselineDamage:60,baselineAccuracy:46,maxDamage:65,maxAccuracy:51,source:'Mexico',class:'alternative'},
    {name:'Ithaca 37',slot:'primary',damage:51.5,accuracy:64.5,baselineDamage:49,baselineAccuracy:62,maxDamage:54,maxAccuracy:67,source:'Canada',class:'alternative'},
    {name:'M16 A2 Rifle',slot:'primary',damage:63.5,accuracy:49.5,baselineDamage:61,baselineAccuracy:47,maxDamage:66,maxAccuracy:52,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'M249 SAW',slot:'primary',damage:69.5,accuracy:43.5,baselineDamage:67,baselineAccuracy:41,maxDamage:72,maxAccuracy:46,source:'Mexico',class:'alternative'},
    {name:'M4A1 Colt Carbine',slot:'primary',damage:57.5,accuracy:49.5,baselineDamage:55,baselineAccuracy:47,maxDamage:60,maxAccuracy:52,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'MP5 Navy',slot:'primary',damage:47.5,accuracy:53.5,baselineDamage:45,baselineAccuracy:51,maxDamage:50,maxAccuracy:56,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'P90',slot:'primary',damage:50.5,accuracy:53.5,baselineDamage:48,baselineAccuracy:51,maxDamage:53,maxAccuracy:56,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Sawed-Off Shotgun',slot:'primary',damage:43.5,accuracy:65.5,baselineDamage:41,baselineAccuracy:63,maxDamage:46,maxAccuracy:68,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'SIG 550',slot:'primary',damage:64.5,accuracy:52.5,baselineDamage:62,baselineAccuracy:50,maxDamage:67,maxAccuracy:55,source:'Mexico',class:'alternative'},
    {name:'SIG 552',slot:'primary',damage:71.5,accuracy:52.5,baselineDamage:69,baselineAccuracy:50,maxDamage:74,maxAccuracy:55,source:'Switzerland',class:'alternative'},
    {name:'Steyr AUG',slot:'primary',damage:66.5,accuracy:47.5,baselineDamage:64,baselineAccuracy:45,maxDamage:69,maxAccuracy:50,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Tavor TAR-21',slot:'primary',damage:67.5,accuracy:54.5,baselineDamage:65,baselineAccuracy:52,maxDamage:70,maxAccuracy:57,source:'Cayman Islands',class:'alternative'},

    // Secondary
    {name:'Beretta 92FS',slot:'secondary',damage:50.5,accuracy:53.5,baselineDamage:48,baselineAccuracy:51,maxDamage:53,maxAccuracy:56,source:'Small Arms Cache',class:'alternative'},
    {name:'Beretta M9',slot:'secondary',damage:38.5,accuracy:56.5,baselineDamage:36,baselineAccuracy:54,maxDamage:41,maxAccuracy:59,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Beretta Pico',slot:'secondary',damage:56.5,accuracy:55.5,baselineDamage:54,baselineAccuracy:53,maxDamage:59,maxAccuracy:58,source:'Loot',class:'alternative'},
    {name:'Cobra Derringer',slot:'secondary',damage:63.5,accuracy:55.5,baselineDamage:61,baselineAccuracy:53,maxDamage:66,maxAccuracy:58,source:'Mexico',class:'alternative'},
    {name:'Crossbow',slot:'secondary',damage:37.5,accuracy:65.5,baselineDamage:35,baselineAccuracy:63,maxDamage:40,maxAccuracy:68,source:'United Kingdom',class:'alternative'},
    {name:'MP5k',slot:'secondary',damage:44.5,accuracy:54.5,baselineDamage:42,baselineAccuracy:52,maxDamage:47,maxAccuracy:57,source:'City Find',class:'alternative'},
    {name:'Pink Mac-10',slot:'secondary',damage:76.5,accuracy:47.5,baselineDamage:74,baselineAccuracy:45,maxDamage:79,maxAccuracy:50,source:'United Arab Emirates',class:'alternative'},
    {name:'Ruger 57',slot:'secondary',damage:34.5,accuracy:58.5,baselineDamage:32,baselineAccuracy:56,maxDamage:37,maxAccuracy:61,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'S&W M29',slot:'secondary',damage:49.5,accuracy:54.5,baselineDamage:47,baselineAccuracy:52,maxDamage:52,maxAccuracy:57,source:'Mission Shop',class:'alternative'},
    {name:'S&W Revolver',slot:'secondary',damage:44.5,accuracy:56.5,baselineDamage:42,baselineAccuracy:54,maxDamage:47,maxAccuracy:59,source:'City Find',class:'alternative'},
    {name:'Skorpion',slot:'secondary',damage:42.5,accuracy:56.5,baselineDamage:40,baselineAccuracy:54,maxDamage:45,maxAccuracy:59,source:'City Find',class:'alternative'},
    {name:'Springfield 1911',slot:'secondary',damage:35.5,accuracy:59.5,baselineDamage:33,baselineAccuracy:57,maxDamage:38,maxAccuracy:62,source:'Mexico',class:'alternative'},
    {name:'Taurus',slot:'secondary',damage:32.5,accuracy:59.5,baselineDamage:30,baselineAccuracy:57,maxDamage:35,maxAccuracy:62,source:'Hawaii',class:'alternative'},
    {name:'TMP',slot:'secondary',damage:40.5,accuracy:47.5,baselineDamage:38,baselineAccuracy:45,maxDamage:43,maxAccuracy:50,source:'City Find',class:'alternative'},
    {name:'USP',slot:'secondary',damage:46.5,accuracy:60.5,baselineDamage:44,baselineAccuracy:58,maxDamage:49,maxAccuracy:63,source:'Big Al\'s Gun Shop',class:'alternative'},

    // Melee
    {name:'Axe',slot:'melee',damage:36.5,accuracy:54.5,baselineDamage:34,baselineAccuracy:52,maxDamage:39,maxAccuracy:57,source:'Mexico',class:'alternative'},
    {name:'Bone Saw',slot:'melee',damage:56,accuracy:54,baselineDamage:54,baselineAccuracy:52,maxDamage:58,maxAccuracy:56,source:'Crime result',class:'alternative'},
    {name:'Chainsaw',slot:'melee',damage:63.5,accuracy:25.5,baselineDamage:61,baselineAccuracy:23,maxDamage:66,maxAccuracy:28,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Claymore Sword',slot:'melee',damage:59.5,accuracy:51.5,baselineDamage:57,baselineAccuracy:49,maxDamage:62,maxAccuracy:54,source:'United Kingdom',class:'alternative'},
    {name:'Cleaver',slot:'melee',damage:53.5,accuracy:58.5,baselineDamage:51,baselineAccuracy:56,maxDamage:56,maxAccuracy:61,source:'City Find',class:'alternative'},
    {name:'Dagger',slot:'melee',damage:30.5,accuracy:62.5,baselineDamage:28,baselineAccuracy:60,maxDamage:33,maxAccuracy:65,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Metal Nunchakus',slot:'melee',damage:63.5,accuracy:62.5,baselineDamage:61,baselineAccuracy:60,maxDamage:66,maxAccuracy:65,source:'Japan',class:'alternative'},
    {name:'Naval Cutlass',slot:'melee',damage:66.5,accuracy:54.5,baselineDamage:64,baselineAccuracy:52,maxDamage:69,maxAccuracy:57,source:'Cayman Islands',class:'alternative'},
    {name:'Samurai Sword',slot:'melee',damage:60.5,accuracy:54.5,baselineDamage:58,baselineAccuracy:52,maxDamage:63,maxAccuracy:57,source:'Mexico',class:'alternative'},
    {name:'Scimitar',slot:'melee',damage:42.5,accuracy:60.5,baselineDamage:40,baselineAccuracy:58,maxDamage:45,maxAccuracy:63,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Sledgehammer',slot:'melee',damage:60.5,accuracy:52.5,baselineDamage:58,baselineAccuracy:50,maxDamage:63,maxAccuracy:55,source:'Loot',class:'alternative'},

    // Helmets
    {name:'Construction Helmet',slot:'helmet',armorRating:32.5,baselineArmor:30,maxArmor:35,source:'China',class:'alternative'},
    {name:'Motorcycle Helmet',slot:'helmet',armorRating:32.5,baselineArmor:30,maxArmor:35,source:'City Find',class:'alternative'},
    {name:'Welding Helmet',slot:'helmet',armorRating:36.5,baselineArmor:34,maxArmor:39,source:'City Find',class:'alternative'},
    {name:'Riot Helmet',slot:'helmet',armorRating:37.5,baselineArmor:35,maxArmor:40,source:'Cache',class:'alternative'},
    {name:'Marauder Face Mask',slot:'helmet',armorRating:42.5,baselineArmor:40,maxArmor:45,source:'Cache',class:'alternative'},
    {name:'Dune Helmet',slot:'helmet',armorRating:46.5,baselineArmor:44,maxArmor:49,source:'Cache',class:'alternative'},
    {name:'Assault Helmet',slot:'helmet',armorRating:48.5,baselineArmor:46,maxArmor:51,source:'Cache',class:'alternative'},
    {name:'Vanguard Respirator',slot:'helmet',armorRating:50.5,baselineArmor:48,maxArmor:53,source:'Cache',class:'alternative'},
    {name:'Delta Gas Mask',slot:'helmet',armorRating:51.5,baselineArmor:49,maxArmor:54,source:'Cache',class:'alternative'},
    {name:'Sentinel Helmet',slot:'helmet',armorRating:55.5,baselineArmor:53,maxArmor:58,source:'Cache',class:'alternative'},
    {name:'EOD Helmet',slot:'helmet',armorRating:57.5,baselineArmor:55,maxArmor:60,source:'Cache',class:'alternative'},

    // Body
    {name:'Chain Mail',slot:'body',armorRating:25.5,baselineArmor:23,maxArmor:28,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Flak Jacket',slot:'body',armorRating:32.5,baselineArmor:30,maxArmor:35,source:'Mexico',class:'alternative'},
    {name:'Full Body Armor',slot:'body',armorRating:33.5,baselineArmor:31,maxArmor:36,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Police Vest',slot:'body',armorRating:34.5,baselineArmor:32,maxArmor:37,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Outer Tactical Vest',slot:'body',armorRating:38.5,baselineArmor:36,maxArmor:41,source:'Mexico',class:'alternative'},
    {name:'Liquid Body Armor',slot:'body',armorRating:42.5,baselineArmor:40,maxArmor:45,source:'Argentina',class:'alternative'},
    {name:'Flexible Body Armor',slot:'body',armorRating:44.5,baselineArmor:42,maxArmor:47,source:'Japan',class:'alternative'},
    {name:'Dune Vest',slot:'body',armorRating:46.5,baselineArmor:44,maxArmor:49,source:'Cache',class:'alternative'},
    {name:'Riot Body',slot:'body',armorRating:47.5,baselineArmor:45,maxArmor:50,source:'Cache',class:'alternative'},
    {name:'Assault Body',slot:'body',armorRating:48.5,baselineArmor:46,maxArmor:51,source:'Cache',class:'alternative'},
    {name:'Vanguard Body',slot:'body',armorRating:50.5,baselineArmor:48,maxArmor:53,source:'Cache',class:'alternative'},
    {name:'Delta Body',slot:'body',armorRating:51.5,baselineArmor:49,maxArmor:54,source:'Cache',class:'alternative'},
    {name:'Marauder Body',slot:'body',armorRating:54.5,baselineArmor:52,maxArmor:57,source:'Cache',class:'alternative'},
    {name:'Sentinel Apron',slot:'body',armorRating:55.5,baselineArmor:53,maxArmor:58,source:'Cache',class:'alternative'},
    {name:'EOD Apron',slot:'body',armorRating:57.5,baselineArmor:55,maxArmor:60,source:'Cache',class:'alternative'},

    // Gloves
    {name:'Leather Gloves',slot:'gloves',armorRating:22.5,baselineArmor:20,maxArmor:25,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Dune Gloves',slot:'gloves',armorRating:46.5,baselineArmor:44,maxArmor:49,source:'Cache',class:'alternative'},
    {name:'Riot Gloves',slot:'gloves',armorRating:47.5,baselineArmor:45,maxArmor:50,source:'Cache',class:'alternative'},
    {name:'Assault Gloves',slot:'gloves',armorRating:48.5,baselineArmor:46,maxArmor:51,source:'Cache',class:'alternative'},
    {name:'Vanguard Gloves',slot:'gloves',armorRating:50.5,baselineArmor:48,maxArmor:53,source:'Cache',class:'alternative'},
    {name:'Delta Gloves',slot:'gloves',armorRating:51.5,baselineArmor:49,maxArmor:54,source:'Cache',class:'alternative'},
    {name:'Marauder Gloves',slot:'gloves',armorRating:54.5,baselineArmor:52,maxArmor:57,source:'Cache',class:'alternative'},
    {name:'Sentinel Gloves',slot:'gloves',armorRating:55.5,baselineArmor:53,maxArmor:58,source:'Cache',class:'alternative'},
    {name:'EOD Gloves',slot:'gloves',armorRating:57.5,baselineArmor:55,maxArmor:60,source:'Cache',class:'alternative'},

    // Pants
    {name:'Leather Pants',slot:'pants',armorRating:22.5,baselineArmor:20,maxArmor:25,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Dune Pants',slot:'pants',armorRating:46.5,baselineArmor:44,maxArmor:49,source:'Cache',class:'alternative'},
    {name:'Riot Pants',slot:'pants',armorRating:47.5,baselineArmor:45,maxArmor:50,source:'Cache',class:'alternative'},
    {name:'Assault Pants',slot:'pants',armorRating:48.5,baselineArmor:46,maxArmor:51,source:'Cache',class:'alternative'},
    {name:'Vanguard Pants',slot:'pants',armorRating:50.5,baselineArmor:48,maxArmor:53,source:'Cache',class:'alternative'},
    {name:'Delta Pants',slot:'pants',armorRating:51.5,baselineArmor:49,maxArmor:54,source:'Cache',class:'alternative'},
    {name:'Marauder Pants',slot:'pants',armorRating:54.5,baselineArmor:52,maxArmor:57,source:'Cache',class:'alternative'},
    {name:'Sentinel Pants',slot:'pants',armorRating:55.5,baselineArmor:53,maxArmor:58,source:'Cache',class:'alternative'},
    {name:'EOD Pants',slot:'pants',armorRating:57.5,baselineArmor:55,maxArmor:60,source:'Cache',class:'alternative'},

    // Boots
    {name:'Leather Boots',slot:'boots',armorRating:22.5,baselineArmor:20,maxArmor:25,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Hiking Boots',slot:'boots',armorRating:26.5,baselineArmor:24,maxArmor:29,source:'Big Al\'s Gun Shop',class:'alternative'},
    {name:'Dune Boots',slot:'boots',armorRating:46.5,baselineArmor:44,maxArmor:49,source:'Cache',class:'alternative'},
    {name:'Riot Boots',slot:'boots',armorRating:47.5,baselineArmor:45,maxArmor:50,source:'Cache',class:'alternative'},
    {name:'Assault Boots',slot:'boots',armorRating:48.5,baselineArmor:46,maxArmor:51,source:'Cache',class:'alternative'},
    {name:'Vanguard Boots',slot:'boots',armorRating:50.5,baselineArmor:48,maxArmor:53,source:'Cache',class:'alternative'},
    {name:'Delta Boots',slot:'boots',armorRating:51.5,baselineArmor:49,maxArmor:54,source:'Cache',class:'alternative'},
    {name:'Marauder Boots',slot:'boots',armorRating:54.5,baselineArmor:52,maxArmor:57,source:'Cache',class:'alternative'},
    {name:'Sentinel Boots',slot:'boots',armorRating:55.5,baselineArmor:53,maxArmor:58,source:'Cache',class:'alternative'},
    {name:'EOD Boots',slot:'boots',armorRating:57.5,baselineArmor:55,maxArmor:60,source:'Cache',class:'alternative'}
  ].map(item=>Object.freeze({...item,statSource:'CATALOG AVG'})));

  const EQUIPMENT_OPTION_CATALOG=Object.freeze([
    ...GENERAL_EQUIPMENT_CATALOG,
    ...ALTERNATIVE_EQUIPMENT_CATALOG
  ]);
  const CATALOG_BY_NAME=new Map(EQUIPMENT_OPTION_CATALOG.map(item=>[String(item.name).toLowerCase(),item]));
  const CATALOG_NAME_ALIASES=new Map([
    ['metal nunchaku','metal nunchakus']
  ]);


  const asId=value=>String(value??'').trim();
  const n=value=>Math.max(0,Number(value)||0);
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  function overlayObject(base,override){
    const out=base&&typeof base==='object'&&!Array.isArray(base)?clone(base):{};
    if(!override||typeof override!=='object'||Array.isArray(override))return out;
    for(const [key,value] of Object.entries(override)){
      if(value===undefined)continue;
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        out[key]=overlayObject(out[key],value);
      }else{
        out[key]=clone(value);
      }
    }
    return out;
  }

  function manualOverrideValues(profile={}){
    const block=profile?.manualOverrides;
    if(!block||typeof block!=='object'||Array.isArray(block))return {};
    const values=block.values&&typeof block.values==='object'&&!Array.isArray(block.values)?block.values:block;
    const clean=clone(values)||{};
    delete clean.updatedAt;
    delete clean.reason;
    return clean;
  }

  function effectiveMemberProfile(profile={}){
    const raw=profile&&typeof profile==='object'&&!Array.isArray(profile)?profile:{};
    const base=clone(raw)||{};
    const values=manualOverrideValues(raw);
    delete base.manualOverrides;
    const effective=overlayObject(base,values);
    effective.manualOverrides=clone(raw.manualOverrides||null);
    return effective;
  }

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
    const key=String(name||'').trim().toLowerCase();
    const canonical=CATALOG_NAME_ALIASES.get(key)||key;
    return CATALOG_BY_NAME.get(canonical)||null;
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
    const numericSlot=Number(item?.slotId??item?.slot_id??item?.slot);
    if(Number.isInteger(numericSlot)&&EQUIPMENT_SLOT_BY_NUMBER[numericSlot])return EQUIPMENT_SLOT_BY_NUMBER[numericSlot];
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

  function triggerCount(value,thresholds=[]){
    const amount=n(value);
    return thresholds.reduce((count,threshold)=>count+(amount>=threshold?1:0),0);
  }

  function estimateBalancedBattleStats(member={},publicIntel={}){
    const level=n(publicIntel?.level??member?.level);
    const ageDays=n(publicIntel?.ageDays??member?.ageDays);
    const rank=String(publicIntel?.rank||member?.rank||'').trim().toLowerCase();
    const rankTriggers=RANK_TRIGGER_COUNT[rank];
    if(rankTriggers==null)return null;

    const levelTriggers=triggerCount(level,LEVEL_RANK_TRIGGERS);
    const crimesKnown=publicIntel?.crimesTotal!=null&&Number.isFinite(Number(publicIntel.crimesTotal));
    const networthKnown=publicIntel?.networth!=null&&Number.isFinite(Number(publicIntel.networth));
    const crimeTriggers=crimesKnown?triggerCount(publicIntel.crimesTotal,CRIME_RANK_TRIGGERS):0;
    const networthTriggers=networthKnown?triggerCount(publicIntel.networth,NETWORTH_RANK_TRIGGERS):0;
    const inferred=Math.max(0,Math.min(6,rankTriggers-levelTriggers-crimeTriggers-networthTriggers));
    const range=BATTLE_STAT_RANGES[inferred]||BATTLE_STAT_RANGES[0];

    let total;
    if(range.max==null){
      total=range.min;
    }else if(range.min<=0){
      const ageWeight=Math.max(0,Math.min(1,ageDays/3650));
      total=Math.round(Math.min(range.max-1,750+(level*20)+(ageWeight*900)));
    }else{
      const ageWeight=Math.max(0,Math.min(1,ageDays/5000));
      const bandPosition=0.40+(ageWeight*0.20);
      total=Math.round(Math.exp(Math.log(range.min)+(Math.log(range.max)-Math.log(range.min))*bandPosition));
    }
    total=Math.max(1,total);
    const quarter=Math.max(1,Math.round(total/4));
    return {
      estimated:true,
      total:quarter*4,
      stats:{strength:quarter,defense:quarter,speed:quarter,dexterity:quarter},
      rangeMin:range.min,
      rangeMax:range.max,
      battleStatTriggers:inferred,
      rankTriggers,
      levelTriggers,
      crimeTriggers,
      networthTriggers,
      confidence:crimesKnown&&networthKnown?'MEDIUM':'LOW',
      ageDays,
      level,
      rank:String(publicIntel?.rank||member?.rank||''),
      method:'Public rank-trigger band with balanced, age-weighted planning midpoint. This is an estimate, not the member\'s actual battle stats.'
    };
  }

  function enrichCatalogItem(item){
    if(!item)return null;
    const ref=catalogItemByName(item?.name);
    const rawDamage=n(item?.damage??item?.stats?.damage);
    const rawAccuracy=n(item?.accuracy??item?.stats?.accuracy);
    const rawArmor=n(item?.armorRating??item?.armor??item?.stats?.armor??item?.stats?.protection);
    let statSource=String(item?.statSource||'').trim();
    if(!statSource){
      if(rawArmor>0)statSource='ITEM';
      else if(rawDamage>0&&rawAccuracy>0)statSource='ITEM';
      else if(ref&&(rawDamage>0||rawAccuracy>0))statSource='ITEM + CATALOG AVG';
      else if(ref)statSource='CATALOG AVG';
      else statSource='UNKNOWN';
    }
    return ref?{
      ...clone(ref),...clone(item),slot:ref.slot,statSource,
      damage:rawDamage||n(ref.damage),
      accuracy:rawAccuracy||n(ref.accuracy),
      armorRating:rawArmor||n(ref.armorRating)
    }:{...clone(item),statSource};
  }

  function equipmentStatProfile(item){
    const enriched=enrichCatalogItem(item)||{};
    const ref=catalogItemByName(enriched?.name)||null;
    const slot=equipmentSlot(enriched);
    const source=String(enriched?.statSource||'UNKNOWN');
    if(['helmet','body','gloves','pants','boots'].includes(slot)){
      const currentArmor=n(enriched?.armorRating??enriched?.armor??enriched?.stats?.armor??enriched?.stats?.protection);
      const averageArmor=n(ref?.armorRating)||currentArmor;
      const minArmor=n(ref?.baselineArmor)||(source==='ITEM'?currentArmor:0);
      const maxArmor=n(ref?.maxArmor)||(minArmor&&averageArmor?Math.max(minArmor,averageArmor*2-minArmor):currentArmor);
      return {
        kind:'armor',slot,source,
        currentArmor,
        averageArmor,
        minArmor,
        maxArmor
      };
    }
    const currentDamage=n(enriched?.damage??enriched?.stats?.damage);
    const currentAccuracy=n(enriched?.accuracy??enriched?.stats?.accuracy);
    const averageDamage=n(ref?.damage)||currentDamage;
    const averageAccuracy=n(ref?.accuracy)||currentAccuracy;
    const minDamage=n(ref?.baselineDamage)||(source==='ITEM'?currentDamage:0);
    const minAccuracy=n(ref?.baselineAccuracy)||(source==='ITEM'?currentAccuracy:0);
    const maxDamage=n(ref?.maxDamage)||(minDamage&&averageDamage?Math.max(minDamage,averageDamage*2-minDamage):currentDamage);
    const maxAccuracy=n(ref?.maxAccuracy)||(minAccuracy&&averageAccuracy?Math.max(minAccuracy,averageAccuracy*2-minAccuracy):currentAccuracy);
    return {
      kind:'weapon',slot,source,
      currentDamage,currentAccuracy,
      averageDamage,averageAccuracy,
      minDamage,minAccuracy,
      maxDamage,maxAccuracy
    };
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

  function readinessScore(item){
    // Readiness is objective: neutral expected output for weapons and raw armor for armor.
    // Member battle style may rank qualifying alternatives, but must never move the pass/fail line.
    return equipmentScore(item,'balanced');
  }

  function readinessFloorScore(item,_bias='balanced'){
    const enriched=enrichCatalogItem(item)||{};
    const slot=equipmentSlot(enriched);
    if(['helmet','body','gloves','pants','boots'].includes(slot)){
      return n(enriched.baselineArmor)||n(enriched.armorRating)||n(enriched.armor);
    }
    const damage=n(enriched.baselineDamage)||n(enriched.damage);
    const accuracy=n(enriched.baselineAccuracy)||n(enriched.accuracy);
    if(!damage||!accuracy)return 0;
    return damage*(accuracy/100);
  }

  function generalCandidates(slot,{includePremium=false}={}){
    return GENERAL_EQUIPMENT_CATALOG
      .filter(item=>item.slot===slot&&(includePremium||item.class!=='premium'))
      .map(clone);
  }

  function equipmentOptionsForSlot(slot,profile={},floor=0){
    const need=profile?.offensiveNeed||profile?.bias||'balanced';
    const threshold=n(floor);
    return EQUIPMENT_OPTION_CATALOG
      .filter(item=>item.slot===slot)
      .map(item=>{
        const score=equipmentScore(item,need);
        const minimumScore=readinessFloorScore(item);
        const floorDeltaPct=threshold>0?((minimumScore-threshold)/threshold)*100:0;
        return {
          ...clone(item),
          score,
          minimumScore,
          meetsFloor:threshold<=0||minimumScore>=threshold,
          floorDeltaPct,
          stats:equipmentStatProfile(item)
        };
      })
      .filter(item=>item.score>0&&item.minimumScore>0&&item.meetsFloor)
      .sort((a,b)=>b.score-a.score||b.minimumScore-a.minimumScore||String(a.name).localeCompare(String(b.name)));
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
      floors[slot]={score:target?readinessFloorScore(target):0};
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
      methodology:'Objective generally-available '+procurementMode+' baseline; neutral gear performance determines readiness, while member style ranks qualifying alternatives. Member-owned gear and faction inventory affect route only.'
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
      const floor=target?readinessFloorScore(target):0;
      const currentScore=currentItem?readinessScore(currentItem):0;
      const recommendationOptions=equipmentOptionsForSlot(slot,profile,floor);
      const ownedOptions=(owned[slot]||[]).map(item=>({
        ...item,
        score:equipmentScore(item,profile.offensiveNeed),
        readinessScore:readinessScore(item)
      })).filter(item=>item.readinessScore>=floor&&item.readinessScore>0).sort((a,b)=>b.score-a.score);
      const ownedOption=ownedOptions[0]||null;
      const assignedLoan=assignedLoans[slot]||null;
      const assignedLoanScore=assignedLoan?readinessScore(assignedLoan):0;
      const factionOptions=(faction[slot]||[]).map(item=>({
        ...item,
        score:equipmentScore(item,profile.offensiveNeed),
        readinessScore:readinessScore(item)
      })).filter(item=>item.readinessScore>=floor&&item.readinessScore>0).sort((a,b)=>
        (n(a.marketValue)||Number.MAX_SAFE_INTEGER)-(n(b.marketValue)||Number.MAX_SAFE_INTEGER) ||
        a.score-b.score
      );
      const factionOption=factionOptions[0]||null;

      let decision='CURRENT GEAR MISSING — PROVISION';
      let route='ACQUIRE';
      let ready=false;
      let suggested=target;
      const equipmentDecision=memberRow?.profile?.equipmentDecisions?.[slot]&&typeof memberRow.profile.equipmentDecisions[slot]==='object'
        ? memberRow.profile.equipmentDecisions[slot]:null;

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

      if(equipmentDecision?.action==='accept-current'&&currentItem){
        decision='LEADERSHIP ACCEPTED — KEEP';
        route='KEEP';
        ready=true;
        suggested=currentItem;
      }else if(equipmentDecision?.action==='replacement'&&String(equipmentDecision?.itemName||'').trim()){
        const replacementName=String(equipmentDecision.itemName).trim();
        const replacement=enrichCatalogItem({
          name:replacementName,
          slot,
          source:'Leadership manual replacement'
        })||{name:replacementName,slot,source:'Leadership manual replacement'};
        const ownedMatch=(owned[slot]||[]).find(item=>String(item?.name||'').trim().toLowerCase()===replacementName.toLowerCase())||null;
        const loanMatch=assignedLoan&&String(assignedLoan?.name||'').trim().toLowerCase()===replacementName.toLowerCase()?assignedLoan:null;
        const factionMatch=(faction[slot]||[]).find(item=>String(item?.name||'').trim().toLowerCase()===replacementName.toLowerCase()&&n(item.availableCount)>0)||null;
        suggested=ownedMatch||loanMatch||factionMatch||replacement;
        if(ownedMatch){
          decision='LEADERSHIP REPLACEMENT — OWNED / EQUIP';
          route='OWNED';
        }else if(loanMatch){
          decision='LEADERSHIP REPLACEMENT — LOANED / VERIFY';
          route='LOANED';
        }else if(factionMatch){
          decision='LEADERSHIP REPLACEMENT — BORROW FROM VAULT';
          route='ISSUE';
        }else{
          decision='LEADERSHIP REPLACEMENT — ACQUIRE';
          route='ACQUIRE';
        }
        ready=false;
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
        currentStats:equipmentStatProfile(currentItem),
        targetStats:equipmentStatProfile(target),
        suggestedStats:equipmentStatProfile(suggested),
        recommendationOptions,
        currentItem:clone(currentItem),
        targetItem:clone(target),
        suggestedItem:clone(suggested),
        equipmentDecision:clone(equipmentDecision),
        manualDecisionActive:Boolean(equipmentDecision?.action),
        manualDecisionAction:String(equipmentDecision?.action||''),
        manualDecisionItemName:String(equipmentDecision?.itemName||''),
        manualDecisionReason:String(equipmentDecision?.reason||''),
        manualDecisionUpdatedAt:String(equipmentDecision?.updatedAt||'')
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
    const procurementMode=['budget','standard','ideal'].includes(String(options?.procurementMode||'').toLowerCase())?String(options.procurementMode).toLowerCase():'budget';
    const budgetCap=Math.max(0,Number(options?.budgetCap??15000000)||0);
    const rows=memberRows(factionInventory,[],{procurementMode});
    const participants=rows.length;
    const selected=rows;
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
      const floor=target?readinessFloorScore(target):0;
      const candidates=(poolState[slot]||[])
        .filter(item=>item.remaining>0&&readinessScore(item)>=floor)
        .sort((a,b)=>
          (n(a.marketValue)||Number.MAX_SAFE_INTEGER)-(n(b.marketValue)||Number.MAX_SAFE_INTEGER) ||
          equipmentScore(a,bias)-equipmentScore(b,bias)
        );
      const pick=candidates[0]||null;
      if(pick)pick.remaining--;
      return pick;
    }

    if(mode==='war'){
      // War acquisition is member-readiness equipment only. Routine minimum-stock
      // replenishment is intentionally deferred until Peace mode.
      for(const member of selected){
        if(member?.readinessStatus==='WAR READY'||member?.procurementPassCurrent)continue;
        if(!member?.hasStats){
          for(const slot of STANDARD_SLOTS)unresolved.push({memberId:member.memberId,memberName:member.memberName,slot,current:'',reason:'Current battle stats are missing; acquisition deferred.'});
          continue;
        }
        const inventoryKnown=Array.isArray(member?.profile?.ownedEquipment?.items);
        const build=member.buildAssessment||compareMemberBuild(member,factionInventory,rows,{procurementMode});
        for(const item of build.items){
          if(item.ready||item.route==='LOANED'||item.route==='OWNED')continue;
          if(!item.currentName&&!inventoryKnown&&!member.statsEstimated){
            unresolved.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,current:'',reason:'Member inventory has not been refreshed; purchase deferred.'});
            continue;
          }
          if(item.route==='REVIEW'){
            unresolved.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,current:item.currentName||'',reason:'Current item exists but performance is not known.'});
            continue;
          }
          if(item.manualDecisionAction==='replacement'&&item.manualDecisionItemName){
            const replacement=item.suggestedItem||{
              name:item.manualDecisionItemName,
              slot:item.slot,
              source:'Leadership manual replacement'
            };
            const exactPool=(poolState[item.slot]||[]).find(candidate=>
              candidate.remaining>0&&String(candidate.name||'').trim().toLowerCase()===String(item.manualDecisionItemName).trim().toLowerCase()
            );
            if(exactPool){
              exactPool.remaining--;
              assignments.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,route:'ISSUE',item:exactPool.name,manual:true});
            }else{
              addRequirement(replacement,1,member.memberName+' '+item.slot+' (Leadership replacement)'+(member.statsEstimated?' (estimated balanced build)':''),'equipment');
              assignments.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,route:'ACQUIRE',item:String(replacement.name||item.manualDecisionItemName),estimated:Boolean(member.statsEstimated),manual:true});
            }
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
            addRequirement(target,1,member.memberName+' '+item.slot+(member.statsEstimated?' (estimated balanced build)':''),'equipment');
            assignments.push({memberId:member.memberId,memberName:member.memberName,slot:item.slot,route:'ACQUIRE',item:target.name,estimated:Boolean(member.statsEstimated)});
          }
        }
      }

      // Preserve two ready-to-issue equipment spares per standard slot during War.
      const neutral=battleProfile({strength:1,defense:1,speed:1,dexterity:1});
      for(const slot of STANDARD_SLOTS){
        const target=generalTargetForSlot(slot,neutral,procurementMode);
        for(let i=0;i<2;i++){
          const factionPick=allocateFaction(slot,target,'balanced');
          if(!factionPick)addRequirement(target,1,'War spare '+slot,'equipment');
        }
      }
    }else{
      // Peace acquisition is minimum-stock replenishment only. Individual member
      // build gaps are deliberately ignored until War mode is selected.
      const minimums=minimumProposal(factionInventory,{mode:'peace',participants,procurementMode});
      const neutral=battleProfile({strength:1,defense:1,speed:1,dexterity:1});
      for(const row of minimums.proposals){
        if(row.dataRequired||n(row.shortfall)<=0)continue;
        if(row.kind==='equipment'){
          const target=generalTargetForSlot(String(row.slot||''),neutral,procurementMode);
          if(target)addRequirement(target,n(row.shortfall),'Peace minimum '+String(row.slot||'equipment')+' pool','equipment');
          else unresolved.push({memberId:'',memberName:'',slot:String(row.slot||''),current:'',reason:'Peace equipment minimum has no resolvable baseline target.'});
          continue;
        }
        addRequirement({
          name:row.item,
          source:'General Torn supply / faction procurement',
          marketValue:0
        },n(row.shortfall),'Peace inventory minimum','provisions');
      }
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
    const list=[...requirements.values()].map(row=>{
      const systemQty=n(row.qty);
      const override=acquisitionQuantityOverride(factionInventory,mode,procurementMode,row);
      const qty=override.active?override.qty:systemQty;
      return {
        ...row,
        systemQty,
        qty,
        quantityOverrideKey:override.key,
        manualQtyOverride:override.active?qty:null,
        reasons:[...row.reasons].join(' | '),
        estimatedValue:row.marketValue?row.marketValue*qty:0,
        priority:priorityFor(row)
      };
    }).sort((a,b)=>a.priority-b.priority||String(a.category).localeCompare(String(b.category))||String(a.item).localeCompare(String(b.item)));

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
      skippedMembers:selected.filter(member=>member?.readinessStatus==='WAR READY'||member?.procurementPassCurrent).map(member=>({
        memberId:member.memberId,
        memberName:member.memberName,
        reason:member.readinessStatus==='WAR READY'?'WAR READY':'PROCUREMENT PASS'
      })),
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

  function coverageComparison(factionInventory={},options={}){
    const procurementMode=['budget','standard','ideal'].includes(String(options?.procurementMode||'').toLowerCase())
      ?String(options.procurementMode).toLowerCase():'budget';
    const mode=String(options?.mode||'war').toLowerCase()==='peace'?'peace':'war';
    const rows=memberRows(factionInventory,options?.savedKeyIds||[],{procurementMode});
    const plan=acquisitionPlan(factionInventory,{mode,procurementMode,budgetCap:options?.budgetCap??15000000});
    const pools=availableFactionCandidates(factionInventory);
    const memberCoverage=[];
    for(const member of rows){
      const suppressed=member.readinessStatus==='WAR READY'||member.procurementPassCurrent;
      const build=member.buildAssessment||compareMemberBuild(member,factionInventory,rows,{procurementMode});
      for(const item of build.items){
        const qualifying=(pools[item.slot]||[]).filter(candidate=>
          equipmentScore(candidate,build.offensiveNeed)>=n(item.readinessFloor)
        );
        memberCoverage.push({
          memberId:member.memberId,
          memberName:member.memberName,
          readinessStatus:member.readinessStatus,
          acquisitionDisposition:member.acquisitionDisposition,
          slot:item.slot,
          memberHas:item.currentName||'',
          memberHasScore:n(item.currentScore),
          memberHasStats:clone(item.currentStats),
          needTarget:item.targetName||'',
          needFloor:n(item.readinessFloor),
          needStats:clone(item.targetStats),
          ready:Boolean(item.ready),
          route:suppressed?(member.readinessStatus==='WAR READY'?'WAR READY':'PROCUREMENT PASS'):item.route,
          assignedLoan:item.assignedLoanName||'',
          ownedAlternative:item.ownedOptionName||'',
          factionAvailableQualifying:qualifying.reduce((sum,row)=>sum+n(row.availableCount),0),
          factionQualifyingItems:qualifying.map(row=>String(row.name||'')).filter(Boolean)
        });
      }
    }

    const consistencyIssues=[];
    for(const row of memberCoverage){
      if(row.memberHas&&row.memberHasScore>0&&row.needFloor>0&&row.memberHasScore>=row.needFloor&&
        !row.ready&&!['WAR READY','PROCUREMENT PASS'].includes(row.route)){
        consistencyIssues.push({
          type:'EQUIPMENT_SCORE_MISMATCH',
          memberId:row.memberId,
          memberName:row.memberName,
          slot:row.slot,
          item:row.memberHas,
          detail:'Current equipped score '+row.memberHasScore.toFixed(2)+' meets/exceeds floor '+row.needFloor.toFixed(2)+' but route is '+row.route+'.'
        });
      }
    }
    for(const member of rows){
      for(const item of Array.isArray(member?.profile?.equipment?.items)?member.profile.equipment.items:[]){
        const numericSlot=Number(item?.slotId??item?.slot_id??item?.slot);
        const explicit=[item?.slot,item?.type,item?.subType,item?.sub_type].map(value=>String(value||'').toLowerCase()).join(' ');
        if(numericSlot===5||/\btemporary\b/.test(explicit))continue;
        if(String(item?.name||'').trim()&&!equipmentSlot(item)){
          consistencyIssues.push({
            type:'UNMAPPED_EQUIPMENT',
            memberId:member.memberId,
            memberName:member.memberName,
            slot:'',
            item:String(item.name||''),
            detail:'Equipped combat item could not be mapped to a standard slot; review API slot/type normalization.'
          });
        }
      }
    }

    const factionCoverage=STANDARD_SLOTS.map(slot=>{
      const stock=Object.values(factionInventory?.current||{}).filter(item=>equipmentSlot(item)===slot);
      const activeMemberRows=memberCoverage.filter(row=>row.slot===slot&&!['WAR READY','PROCUREMENT PASS'].includes(row.route));
      const assignments=plan.assignments.filter(row=>row.slot===slot);
      const buyRows=plan.list.filter(row=>row.category==='equipment'&&equipmentSlot({name:row.item})===slot);
      return {
        slot,
        owned:stock.reduce((sum,row)=>sum+n(row.amountOwned),0),
        available:stock.reduce((sum,row)=>sum+n(row.availableCount),0),
        loaned:stock.reduce((sum,row)=>sum+n(row.loanedCount),0),
        memberGaps:activeMemberRows.filter(row=>!row.ready&&!['OWNED','LOANED'].includes(row.route)).length,
        issueAssignments:assignments.filter(row=>row.route==='ISSUE').length,
        acquireAssignments:assignments.filter(row=>row.route==='ACQUIRE').length,
        systemBuyQty:buyRows.reduce((sum,row)=>sum+n(row.systemQty),0),
        plannedBuyQty:buyRows.reduce((sum,row)=>sum+n(row.qty),0)
      };
    });

    return {mode,procurementMode,members:rows,memberCoverage,factionCoverage,consistencyIssues,plan};
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

  function readinessApprovalIsCurrent(profile={},_procurementMode='budget'){
    const approval=profile?.readinessApproval;
    // Leadership WAR READY is an explicit per-member decision. It persists until
    // Leadership reopens the member and is never silently revoked by API refresh,
    // procurement mode, missing data, or the automatic build model.
    return Boolean(approval&&String(approval.status||'')==='WAR READY');
  }

  function procurementPassIsCurrent(profile={}){
    const pass=profile?.procurementPass;
    if(!pass||String(pass.status||'')!=='PASS')return false;
    // Missing-data passes bind to the current lack of private verification. Any later
    // private refresh changes verifiedAt and forces a fresh leadership decision.
    return String(pass.verifiedAt||'')===String(profile?.verifiedAt||'');
  }

  function acquisitionOverrideKey(mode='war',procurementMode='budget',row={}){
    return [
      String(mode||'war').toLowerCase()==='peace'?'peace':'war',
      ['budget','standard','ideal'].includes(String(procurementMode||'').toLowerCase())?String(procurementMode).toLowerCase():'budget',
      String(row?.category||'equipment').trim().toLowerCase(),
      String(row?.item||'').trim().toLowerCase()
    ].join('|');
  }

  function acquisitionQuantityOverride(factionInventory={},mode='war',procurementMode='budget',row={}){
    const key=acquisitionOverrideKey(mode,procurementMode,row);
    const entry=factionInventory?.acquisitionPlanning?.quantityOverrides?.[key];
    const raw=entry&&typeof entry==='object'?entry.qty:entry;
    if(raw==null||raw==='')return {key,active:false,qty:null,entry:null};
    const value=Number(raw);
    if(!Number.isFinite(value)||value<0)return {key,active:false,qty:null,entry};
    return {key,active:true,qty:Math.floor(value),entry};
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
      const rawProfile=profiles[id]&&typeof profiles[id]==='object'?profiles[id]:{};
      const profile=effectiveMemberProfile(rawProfile);
      const overrideValues=manualOverrideValues(rawProfile);
      const manualOverrideActive=Object.keys(overrideValues).length>0;
      const actualStats=profile?.stats||{};
      const actualBp=battleProfile(actualStats);
      const memberForEstimate={
        ...clone(member),
        ...(profile.memberName!=null?{memberName:String(profile.memberName)}:{}),
        ...(profile.level!=null?{level:n(profile.level)}:{})
      };
      const estimate=actualBp.total?null:estimateBalancedBattleStats(memberForEstimate,profile?.publicIntel||{});
      const stats=actualBp.total?clone(actualStats):clone(estimate?.stats||{});
      const bp=battleProfile(stats);
      const loan=loans.get(id)||{amount:0,items:[]};
      const equipmentSummary=String(profile?.equipment?.summary||'').trim();
      const profileHasEquipment=Boolean(equipmentSummary)||Array.isArray(profile?.equipment?.items)&&profile.equipment.items.length>0;
      const equipmentEmptyConfirmed=Boolean(profile?.equipment?.emptyConfirmed)&&!profileHasEquipment;
      const equipmentEvidenceKnown=profileHasEquipment||equipmentEmptyConfirmed;
      const hasEquipmentEvidence=profileHasEquipment||loan.items.length>0;
      const verifiedMs=Date.parse(profile?.verifiedAt||'')||0;
      const ageHours=verifiedMs?Math.max(0,(Date.now()-verifiedMs)/3600000):null;
      const stale=actualBp.total>0&&ageHours!=null&&ageHours>staleHours;

      let dataStatus='READY FOR REVIEW';
      if(!actualBp.total){
        dataStatus=estimate?.total?'ESTIMATED — NEEDS DATA':'MISSING DATA';
      }else if(equipmentEmptyConfirmed){
        dataStatus='NO COMBAT GEAR EQUIPPED';
      }else if(!equipmentEvidenceKnown){
        dataStatus='MISSING DATA';
      }else if(stale){
        dataStatus='STALE DATA';
      }else if(String(profile?.medicalStatus||'').includes('NEEDS')||String(profile?.ipecacStatus||'').includes('NEEDS')){
        dataStatus='SUPPLY ACTION';
      }

      return {
        ...clone(member),
        ...(profile.memberName!=null?{memberName:String(profile.memberName)}:{}),
        ...(profile.level!=null?{level:n(profile.level)}:{}),
        memberId:id,
        profile:clone(profile),
        rawProfile:clone(rawProfile),
        manualOverrideActive,
        manualOverrideValues:clone(overrideValues),
        manualOverrideUpdatedAt:String(rawProfile?.manualOverrides?.updatedAt||''),
        manualOverrideReason:String(rawProfile?.manualOverrides?.reason||''),
        publicIntel:clone(profile?.publicIntel||{}),
        stats,
        actualStats:clone(actualStats),
        statEstimate:clone(estimate),
        statProfile:bp,
        equipmentSummary,
        equipmentEmptyConfirmed,
        equipmentEvidenceKnown,
        hasStats:bp.total>0,
        hasVerifiedStats:actualBp.total>0,
        statsEstimated:Boolean(!actualBp.total&&estimate?.total),
        hasEquipment:hasEquipmentEvidence,
        profileHasEquipment,
        ageHours,
        stale,
        apiSaved:keys.has(id),
        loans:loan.amount,
        loanItems:loan.items,
        dataReadinessStatus:dataStatus,
        readinessStatus:dataStatus,
        procurementPassCurrent:procurementPassIsCurrent(profile),
        procurementPassStale:Boolean(profile?.procurementPass&&!procurementPassIsCurrent(profile)),
        procurementPassAt:procurementPassIsCurrent(profile)?String(profile?.procurementPass?.approvedAt||''):'',
        procurementPassReason:procurementPassIsCurrent(profile)?String(profile?.procurementPass?.reason||''):''
      };
    });

    const rows=baseRows.map(row=>{
      const build=compareMemberBuild(row,factionInventory,baseRows,{procurementMode});
      const leadershipWarReady=readinessApprovalIsCurrent(row.profile,procurementMode);
      let status=row.dataReadinessStatus;
      if(leadershipWarReady){
        status='WAR READY';
      }else if(status==='READY FOR REVIEW'){
        status=build.warReady?'READY FOR REVIEW':'ACTION NEEDED';
      }
      return {
        ...row,
        readinessStatus:status,
        leadershipWarReady,
        acquisitionDisposition:status==='WAR READY'?'WAR READY':row.procurementPassCurrent?'PROCUREMENT PASS':'ACTIVE',
        buildWarReady:Boolean(build.warReady),
        buildAssessment:build,
        readinessApprovedAt:status==='WAR READY'?String(row.profile?.readinessApproval?.approvedAt||''):'',
        readinessApprovalMode:status==='WAR READY'?String(row.profile?.readinessApproval?.procurementMode||'MANUAL'):'',
        readinessApprovalReason:status==='WAR READY'?String(row.profile?.readinessApproval?.reason||'Leadership manual decision'):''
      };
    });

    return rows.sort((a,b)=>{
      const priority={'MISSING DATA':0,'NO COMBAT GEAR EQUIPPED':1,'STALE DATA':2,'ESTIMATED — NEEDS DATA':3,'SUPPLY ACTION':4,'ACTION NEEDED':5,'READY FOR REVIEW':6,'WAR READY':7};
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


  function minimumOverrideKey(mode,category,item,slot=''){
    const basis=String(slot||item||'').trim().toLowerCase();
    return [String(mode||'war').toLowerCase(),String(category||'other').toLowerCase(),basis].join('|');
  }

  function minimumOverrideFor(factionInventory={},mode,row={}){
    const key=minimumOverrideKey(mode,row?.category,row?.item,row?.slot);
    const raw=factionInventory?.stockPlanning?.minimumOverrides?.[key];
    const hasMin=raw&&Object.prototype.hasOwnProperty.call(raw,'min')&&Number.isFinite(Number(raw.min));
    return {
      key,
      active:Boolean(hasMin),
      min:hasMin?Math.max(0,Math.round(Number(raw.min))):null,
      orderEnabled:raw?.orderEnabled!==false,
      updatedAt:String(raw?.updatedAt||'')
    };
  }

  function xanaxPolicy(factionInventory={}){
    const raw=factionInventory?.warPlanning?.xanaxPolicy;
    const overrides=raw?.memberOverrides&&typeof raw.memberOverrides==='object'&&!Array.isArray(raw.memberOverrides)
      ? clone(raw.memberOverrides):{};
    return {
      investmentPosture:['off','conserve','compete','push'].includes(String(raw?.investmentPosture||'').toLowerCase())
        ?String(raw.investmentPosture).toLowerCase():DEFAULT_XANAX_POLICY.investmentPosture,
      reasonableRatio:Math.max(0.1,Math.min(2,Number(raw?.reasonableRatio)||DEFAULT_XANAX_POLICY.reasonableRatio)),
      highThreshold:Math.max(1,Math.round(Number(raw?.highThreshold)||DEFAULT_XANAX_POLICY.highThreshold)),
      mediumThreshold:Math.max(1,Math.round(Number(raw?.mediumThreshold)||DEFAULT_XANAX_POLICY.mediumThreshold)),
      highCeiling:Math.max(0,Math.round(Number(raw?.highCeiling)??DEFAULT_XANAX_POLICY.highCeiling)),
      mediumCeiling:Math.max(0,Math.round(Number(raw?.mediumCeiling)??DEFAULT_XANAX_POLICY.mediumCeiling)),
      lowCeiling:Math.max(0,Math.round(Number(raw?.lowCeiling)??DEFAULT_XANAX_POLICY.lowCeiling)),
      memberOverrides:overrides
    };
  }

  function xanaxTier(total,policy=DEFAULT_XANAX_POLICY){
    const value=n(total);
    if(value>=n(policy.highThreshold))return 'HIGH';
    if(value>=n(policy.mediumThreshold))return 'MEDIUM';
    return 'LOW';
  }

  function xanaxCeilingForTier(tier,policy=DEFAULT_XANAX_POLICY){
    if(tier==='HIGH')return n(policy.highCeiling);
    if(tier==='MEDIUM')return n(policy.mediumCeiling);
    return n(policy.lowCeiling);
  }

  function xanaxEstimator(factionInventory={},options={}){
    const rows=memberRows(factionInventory,[],{procurementMode:options?.procurementMode||'budget'});
    const policy=xanaxPolicy(factionInventory);
    const opponentBlock=factionInventory?.warPlanning?.opponent||{};
    const rawOpp=opponentBlock?.members;
    const opponents=Array.isArray(rawOpp)?rawOpp:Object.values(rawOpp&&typeof rawOpp==='object'?rawOpp:{});
    const usableOpponents=opponents.filter(row=>n(row?.estimatedTotal||row?.statEstimate?.total||row?.totalStats)>0);
    const currentWar=factionInventory?.warPlanning?.currentWar||null;
    const have=Object.values(factionInventory?.current||{})
      .filter(row=>String(row?.name||'').trim().toLowerCase()==='xanax')
      .reduce((sum,row)=>sum+n(row?.availableCount??row?.amountOwned),0);
    const members=rows.map(row=>{
      const total=n(row?.statProfile?.total);
      const tier=xanaxTier(total,policy);
      const ceiling=xanaxCeilingForTier(tier,policy);
      const credible=usableOpponents.filter(opp=>{
        const oppTotal=n(opp?.estimatedTotal||opp?.statEstimate?.total||opp?.totalStats);
        return oppTotal>0&&total/oppTotal>=policy.reasonableRatio;
      });
      const overrideRaw=policy.memberOverrides?.[asId(row.memberId)];
      const override=Number.isFinite(Number(overrideRaw))?Math.max(0,Math.min(ceiling,Math.round(Number(overrideRaw)))):null;
      let recommended=0;
      if(override!=null){
        recommended=override;
      }else if(policy.investmentPosture==='off'){
        recommended=0;
      }else if(usableOpponents.length){
        if(policy.investmentPosture==='push')recommended=credible.length?ceiling:0;
        else if(policy.investmentPosture==='compete')recommended=credible.length?Math.min(ceiling,Math.max(1,Math.ceil((credible.length+ceiling)/2))):0;
        else recommended=Math.min(ceiling,credible.length);
      }
      return {
        memberId:asId(row.memberId),
        memberName:String(row.memberName||''),
        statsTotal:total,
        statsEstimated:Boolean(row.statsEstimated),
        tier,
        ceiling,
        credibleTargets:credible.length,
        recommended,
        manualOverride:override,
        targetNames:credible.slice(0,ceiling).map(opp=>String(opp?.memberName||opp?.name||opp?.memberId||'')).filter(Boolean)
      };
    });
    const leadershipCeiling=members.reduce((sum,row)=>sum+n(row.ceiling),0);
    const recommendedTarget=members.reduce((sum,row)=>sum+n(row.recommended),0);
    const ready=Boolean(currentWar&&usableOpponents.length);
    return {
      ready,
      currentWar:clone(currentWar),
      opponentFactionId:asId(opponentBlock?.factionId),
      opponentFactionName:String(opponentBlock?.factionName||''),
      opponentFetchedAt:String(opponentBlock?.fetchedAt||''),
      opponentMemberCount:opponents.length,
      opponentEstimatedCount:usableOpponents.length,
      policy,
      members,
      leadershipCeiling,
      recommendedTarget:ready?recommendedTarget:0,
      available:have,
      shortfall:ready?Math.max(0,recommendedTarget-have):0,
      rationale:ready
        ? 'Opponent-weighted '+policy.investmentPosture.toUpperCase()+' posture: one or more Xanax only where the member has credible rival targets, capped by Leadership 4/3/2-style tier limits.'
        : 'Current rival estimates are not ready; no automatic Xanax purchase is recommended until opponent data is available or Leadership sets a manual minimum.'
    };
  }

  function minimumProposal(factionInventory={},options={}){
    const mode=String(options?.mode||'peace').toLowerCase()==='war'?'war':'peace';
    const procurementMode=options?.procurementMode||'budget';
    const rosterRows=memberRows(factionInventory,[],{procurementMode});
    const rosterCount=Object.keys(factionInventory?.memberReadiness?.roster||{}).length;
    const participants=rosterCount;
    const peacePoolMin=Math.max(2,Math.ceil(rosterCount*0.25)+2);
    const peacePoolMax=Math.ceil(peacePoolMin*1.5);
    const current=Object.values(factionInventory?.current||{});
    const cons=consumptionMap(factionInventory);
    const proposals=[];
    const marketValueFor=name=>n(factionInventory?.equipmentMarketCatalog?.byName?.[String(name||'').trim().toLowerCase()]?.marketPrice);

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
          const build=member.buildAssessment||compareMemberBuild(member,factionInventory,rosterRows,{procurementMode});
          const row=build.items.find(item=>item.slot===slot);
          return !row?.ready;
        }).length;
        const unresolvedParticipants=Math.max(0,participants-participating.length);
        coverageNeeded+=unresolvedParticipants;
        targetMin=Math.max(peacePoolMin,Math.min(participants+2,coverageNeeded+2));
        targetMax=Math.max(targetMin,Math.min(participants+2,targetMin+2));
      }
      proposals.push({
        kind:'equipment',mode,
        category:['primary','secondary','melee'].includes(slot)?'weapons':'armor',
        item:'Routine '+slot+' pool',slot,
        current:available,loaned,coverageNeeded,
        recommendedMin:targetMin,recommendedMax:targetMax,
        dataRequired:false,
        rationale:mode==='war'
          ? 'War mode: current faction roster ('+participants+' members); cover every member whose current '+slot+' is unverified/below standard, plus two spares.'
          : 'Peace mode: 25% of roster plus two spares; maximum band is 150% of minimum.'
      });
    }

    for(const item of current){
      const category=String(item?.category||'');
      if(!['medical','temporary','consumables','drugs','boosters'].includes(category))continue;
      const name=String(item?.name||'');
      const available=n(item?.availableCount||item?.amountOwned);
      if(/blood bag/i.test(name)&&!/empty blood bag/i.test(name)){
        proposals.push({
          kind:'stackable',mode,category,item:name,itemId:asId(item?.itemId),
          current:available,marketValue:marketValueFor(name),
          recommendedMin:null,recommendedMax:null,dataRequired:true,
          rationale:'Filled blood-bag mix requires the participating members\' blood-type distribution.'
        });
        continue;
      }
      if(mode==='war'&&name.trim().toLowerCase()==='xanax')continue;
      const rate=n(cons[category+'|'+asId(item?.itemId)]);
      const critical=category==='medical'?CRITICAL_MEDICAL.has(name):category==='temporary'?CRITICAL_TEMPORARY.has(name):false;
      const peaceTarget=Math.ceil(rate*14)+(critical?rosterCount:0);
      const perMember=mode==='war'?warSupplyUnitsPerMember(category,name):0;
      const warPackage=perMember*participants;
      const target=mode==='war'?Math.max(peaceTarget,warPackage):peaceTarget;
      if(target<=0)continue;
      proposals.push({
        kind:'stackable',mode,category,item:name,itemId:asId(item?.itemId),
        current:available,marketValue:marketValueFor(name),
        consumptionPerDay:rate,perMemberWarUnits:perMember,
        recommendedMin:target,
        recommendedMax:mode==='war'?Math.ceil(target*1.20):Math.ceil(target*1.5),
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
          current:0,marketValue:marketValueFor(name),
          consumptionPerDay:0,perMemberWarUnits:perMember,
          recommendedMin:target,recommendedMax:Math.ceil(target*1.20),
          dataRequired:false,synthetic:true,
          rationale:'War mode: '+perMember+' per participating member × '+participants+'; item is not currently present in faction stock.'
        });
      }

      const xanax=xanaxEstimator(factionInventory,{procurementMode});
      proposals.push({
        kind:'stackable',mode,category:'drugs',item:'Xanax',
        itemId:String(current.find(item=>String(item?.name||'').trim().toLowerCase()==='xanax')?.itemId||''),
        current:xanax.available,
        marketValue:marketValueFor('Xanax'),
        recommendedMin:xanax.recommendedTarget,
        recommendedMax:xanax.recommendedTarget,
        dataRequired:!xanax.ready,
        synthetic:!current.some(item=>String(item?.name||'').trim().toLowerCase()==='xanax'),
        xanaxEstimator:xanax,
        rationale:xanax.rationale
      });
    }

    const finalized=proposals.map(row=>{
      const override=minimumOverrideFor(factionInventory,mode,row);
      const suggestedMin=row.recommendedMin==null?null:Math.max(0,Math.round(n(row.recommendedMin)));
      const effectiveDataRequired=Boolean(row.dataRequired&&override.min==null);
      const effectiveMin=override.min!=null?override.min:suggestedMin;
      const suggestedMax=row.recommendedMax==null?null:Math.max(0,Math.round(n(row.recommendedMax)));
      const effectiveMax=effectiveMin==null?null:override.min!=null
        ?Math.max(effectiveMin,Math.ceil(effectiveMin*(mode==='war'?1.20:1.50)))
        :suggestedMax;
      const shortfall=effectiveDataRequired||effectiveMin==null?null:Math.max(0,effectiveMin-n(row.current));
      const orderEnabled=override.orderEnabled;
      return {
        ...row,
        suggestedMin,
        suggestedMax,
        manualMin:override.min,
        minimumOverrideKey:override.key,
        minimumOverrideActive:override.active,
        minimumOverrideUpdatedAt:override.updatedAt,
        orderEnabled,
        recommendedMin:effectiveMin,
        effectiveMin,
        recommendedMax:effectiveMax,
        dataRequired:effectiveDataRequired,
        shortfall,
        status:effectiveDataRequired?'DATA REQUIRED':shortfall>0?(orderEnabled?'ORDER':'SHORT / HOLD'):'ENOUGH'
      };
    });

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
      proposals:finalized,
      actionable:finalized.filter(p=>!p.dataRequired&&p.orderEnabled&&n(p.shortfall)>0),
      held:finalized.filter(p=>!p.dataRequired&&!p.orderEnabled&&n(p.shortfall)>0),
      dataRequired:finalized.filter(p=>p.dataRequired),
      xanax:mode==='war'?finalized.find(p=>p.item==='Xanax')?.xanaxEstimator||null:null,
      assumptions:mode==='war'
        ? 'WAR: equipment covers unresolved member slots plus two spares; medical/temp minimums scale from the current roster; Xanax is opponent-weighted and Leadership-adjustable.'
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
    alternativeEquipmentCatalog:ALTERNATIVE_EQUIPMENT_CATALOG,
    equipmentOptionCatalog:EQUIPMENT_OPTION_CATALOG,
    loanCategories:LOAN_CATEGORIES,
    standardSlots:STANDARD_SLOTS,
    equipmentSlotByNumber:EQUIPMENT_SLOT_BY_NUMBER,
    armorSlot,
    weaponSlot,
    equipmentSlot,
    battleProfile,
    catalogItemByName,
    enrichCatalogItem,
    equipmentStatProfile,
    equipmentScore,
    equipmentValueMetrics,
    readinessScore,
    readinessFloorScore,
    manualOverrideValues,
    effectiveMemberProfile,
    estimateBalancedBattleStats,
    generalCandidates,
    equipmentOptionsForSlot,
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
    acquisitionOverrideKey,
    acquisitionQuantityOverride,
    procurementPassIsCurrent,
    coverageComparison,
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