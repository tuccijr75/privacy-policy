const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const sandbox={globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(__dirname+'/MM_Faction_Armory.logic.js','utf8'),
  sandbox,
  {filename:'MM_Faction_Armory.logic.js'}
);
const logic=sandbox.globalThis.MMTornFactionLogic;

assert(logic,'logic export should exist');
assert.deepStrictEqual(
  Array.from(logic.categories),
  ['weapons','armor','temporary','medical','consumables','drugs','boosters','utilities','loot']
);

const profile=logic.battleProfile({strength:100,defense:50,speed:25,dexterity:25});
assert.strictEqual(profile.total,200);
assert.strictEqual(profile.dominant,'strength');
assert.strictEqual(profile.bias,'accuracy');
assert.strictEqual(profile.offensiveNeed,'accuracy');

const factionInventory={
  current:{
    'weapons|1':{
      category:'weapons',itemId:'1',name:'Weak Rifle',type:'Primary',
      availableCount:2,loanedCount:0,amountOwned:2,damage:50,accuracy:50,loans:[]
    },
    'weapons|2':{
      category:'weapons',itemId:'2',name:'Strong Rifle',type:'Primary',
      availableCount:1,loanedCount:0,amountOwned:1,damage:70,accuracy:60,loans:[]
    },
    'armor|10':{
      category:'armor',itemId:'10',name:'Combat Helmet',type:'Armor',subType:'Helmet',
      availableCount:4,loanedCount:0,amountOwned:4,armorRating:40,loans:[]
    },
    'medical|20':{
      category:'medical',itemId:'20',name:'First Aid Kit',type:'Medical',
      availableCount:10,loanedCount:0,amountOwned:10,loans:[]
    }
  },
  memberReadiness:{
    roster:{
      '100':{memberId:'100',memberName:'Test Member',level:20}
    },
    profiles:{
      '100':{
        stats:{strength:100,defense:50,speed:25,dexterity:25},
        equipment:{
          summary:'Primary: Current Rifle',
          items:[{name:'Current Rifle',type:'Primary',damage:80,accuracy:70}]
        },
        verifiedAt:new Date().toISOString()
      }
    },
    settings:{staleHours:72}
  },
  snapshots:[],
  events:[]
};

const rows=logic.memberRows(factionInventory,['100']);
assert.strictEqual(rows.length,1);
assert.strictEqual(rows[0].apiSaved,true);
assert.strictEqual(rows[0].readinessStatus,'ACTION NEEDED');
assert.strictEqual(rows[0].buildWarReady,false);

const summaryOnly={
  stats:{strength:100,defense:100,speed:100,dexterity:100},
  equipment:{summary:'PRIMARY: AK-47 | SECONDARY: Qsz-92 | MELEE: Diamond Bladed Knife'}
};
const summarySlots=logic.profileEquipmentSlots(summaryOnly);
assert.strictEqual(summarySlots.secondary?.name,'Qsz-92','secondary must be recovered from stored equipment summary');
assert.strictEqual(summarySlots.primary?.name,'AK-47');

const build=logic.compareMemberBuild(rows[0],factionInventory);
const primary=build.items.find(x=>x.slot==='primary');
assert(primary);
assert.strictEqual(primary.route,'KEEP','must never replace a stronger known current primary');
assert.notStrictEqual(primary.targetName,'Weak Rifle','faction stock must not define the objective baseline');

const readyVerifiedAt=new Date().toISOString();
const readyFaction={
  current:{},
  memberReadiness:{
    roster:{'150':{memberId:'150',memberName:'Ready Member',level:30}},
    profiles:{'150':{
      stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
      equipment:{
        summary:'PRIMARY: AK-47 | SECONDARY: BT MP9 | MELEE: Macana | HELMET: WWII Helmet | BODY: Bulletproof Vest | GLOVES: Kevlar Gloves | PANTS: Combat Pants | BOOTS: Safety Boots',
        items:[
          {name:'AK-47',type:'Primary'},
          {name:'BT MP9',type:'Secondary'},
          {name:'Macana',type:'Melee'},
          {name:'WWII Helmet',subType:'Helmet'},
          {name:'Bulletproof Vest',subType:'Body'},
          {name:'Kevlar Gloves',subType:'Gloves'},
          {name:'Combat Pants',subType:'Pants'},
          {name:'Safety Boots',subType:'Boots'}
        ]
      },
      verifiedAt:readyVerifiedAt
    }},
    settings:{staleHours:72}
  }
};
let readyRows=logic.memberRows(readyFaction,[],{procurementMode:'budget'});
assert.strictEqual(readyRows[0].buildWarReady,true,'all eight equipped slots at the budget floor should pass the build baseline');
assert.strictEqual(readyRows[0].readinessStatus,'READY FOR REVIEW','automatic build pass must wait for explicit leadership approval');

readyFaction.memberReadiness.profiles['150'].readinessApproval={
  status:'WAR READY',
  approvedAt:new Date().toISOString(),
  verifiedAt:readyVerifiedAt,
  procurementMode:'budget'
};
readyRows=logic.memberRows(readyFaction,[],{procurementMode:'budget'});
assert.strictEqual(readyRows[0].readinessStatus,'WAR READY','current approval must promote the canonical member status');
assert.strictEqual(readyRows[0].buildAssessment.warReady,true,'Members and Builds must share the same build assessment');

readyFaction.memberReadiness.profiles['150'].verifiedAt=new Date(Date.now()+1000).toISOString();
readyRows=logic.memberRows(readyFaction,[],{procurementMode:'budget'});
assert.strictEqual(readyRows[0].readinessStatus,'WAR READY','individual Leadership WAR READY must persist across later API refreshes until explicitly reopened');

const missingMember={
  memberId:'101',
  memberName:'Missing Gear',
  stats:{strength:10,defense:10,speed:10,dexterity:10},
  profile:{stats:{strength:10,defense:10,speed:10,dexterity:10},equipment:{items:[]}}
};
const missingBuild=logic.compareMemberBuild(missingMember,factionInventory);
assert(
  ['ISSUE','ACQUIRE'].includes(missingBuild.items.find(x=>x.slot==='primary').route),
  'missing current gear should create a provisioning route against the general baseline'
);

const twentyRoster={};
for(let i=1;i<=20;i++)twentyRoster[String(i)]={memberId:String(i),memberName:'M'+i};
const peaceMinimums=logic.minimumProposal({
  current:factionInventory.current,
  memberReadiness:{roster:twentyRoster},
  snapshots:[],
  events:[]
},{mode:'peace'});
assert.strictEqual(peaceMinimums.peacePoolMin,7);
assert.strictEqual(peaceMinimums.peacePoolMax,11);
const primaryMin=peaceMinimums.proposals.find(x=>x.slot==='primary');
assert(primaryMin);
assert.strictEqual(primaryMin.recommendedMin,7);
assert.strictEqual(primaryMin.recommendedMax,11);

const peaceFaks=peaceMinimums.proposals.find(x=>x.item==='First Aid Kit');
assert(peaceFaks);
assert.strictEqual(peaceFaks.recommendedMin,20,'peace critical medical reserve should include one per member with no observed depletion');

const warMinimums=logic.minimumProposal({
  current:factionInventory.current,
  memberReadiness:{roster:twentyRoster},
  snapshots:[],
  events:[]
},{mode:'war',participants:5});
assert.strictEqual(warMinimums.participants,20,'war planning must derive participants from the current roster, not a caller assumption');
const warPrimary=warMinimums.proposals.find(x=>x.slot==='primary');
assert(warPrimary);
assert.strictEqual(warPrimary.recommendedMin,22,'20 unknown participants require full primary coverage plus two spares');
const warFaks=warMinimums.proposals.find(x=>x.item==='First Aid Kit');
assert(warFaks);
assert.strictEqual(warFaks.recommendedMin,200,'war FAK target should provision 10 per member for 20 participants');
const warXanax=warMinimums.proposals.find(x=>x.category==='drugs'&&x.item==='Xanax');
assert(warXanax);
assert.strictEqual(warXanax.dataRequired,true,'Xanax must fail safe when no current rival estimates are available');
assert.strictEqual(warXanax.suggestedMin,0,'no-rival Xanax automation must not invent a purchase target');
assert(!warMinimums.actionable.some(x=>x.item==='Xanax'),'no-rival Xanax must not enter automatic acquisition');


const parsedReply=logic.parseMemberReply(
  'STR: 1000\nDEF: 2000\nSPD: 3000\nDEX: 4000\nPRIMARY: Test Rifle | Q42 | Powerful 10%\nHELMET: Combat Helmet | Q10\nBLOOD TYPE: O+\nSFAK: 5\nFAK: 7\nMORPHINE: 3\nIPECAC: 1'
);
assert.strictEqual(parsedReply.stats.strength,1000);
assert.strictEqual(parsedReply.stats.dexterity,4000);
assert.strictEqual(parsedReply.bloodType,'O+');
assert(parsedReply.items.some(item=>item.slot==='primary'&&item.name==='Test Rifle'));

const manualBuild=logic.compareMemberBuild({
  memberId:'102',
  memberName:'Manual Reply',
  stats:parsedReply.stats,
  profile:{stats:parsedReply.stats,equipment:{summary:parsedReply.equipmentSummary,items:parsedReply.items}}
},factionInventory);
assert.strictEqual(
  manualBuild.items.find(x=>x.slot==='primary').decision,
  'REVIEW CURRENT GEAR',
  'manual item without parsed performance stats must never be auto-replaced'
);

const priority=logic.readinessPriority(rows[0],rows);
assert(['DEVELOPING','NORMAL','HIGH'].includes(priority.label));
const standard=logic.warReadinessStandard(rows[0],factionInventory,rows);
assert(standard.floors.primary.score>0,'war readiness should derive an objective generally-available primary floor');
assert(standard.targets.secondary?.name,'secondary target must always be present in the objective catalog');
assert.strictEqual(logic.equipmentSlot({name:'Qsz-92',type:'Weapon',subType:'SMG'}),'secondary');

const acquisition=logic.acquisitionPlan({
  ...factionInventory,
  memberReadiness:{...factionInventory.memberReadiness,roster:twentyRoster}
},{mode:'war',participants:3});
assert.strictEqual(acquisition.participants,20,'acquisition participant count must equal the live roster size');
assert(acquisition.list.some(row=>row.category==='equipment'),'War acquisition must contain named equipment requirements');
assert(acquisition.list.some(row=>row.category==='provisions'&&row.item==='First Aid Kit'),'War acquisition must consume approved war-stock medical shortfalls from the same minimum state');
assert(!acquisition.list.some(row=>row.category==='provisions'&&row.item==='Xanax'),'War acquisition must not buy Xanax without current rival evidence or a manual minimum');

const peaceAcquisition=logic.acquisitionPlan({
  ...factionInventory,
  memberReadiness:{...factionInventory.memberReadiness,roster:twentyRoster}
},{mode:'peace',participants:3,procurementMode:'budget'});
assert.strictEqual(peaceAcquisition.participants,20,'Peace acquisition still derives its minimums from the current roster');
assert.strictEqual(peaceAcquisition.assignments.length,0,'Peace mode must not create member equipment assignments');
assert.strictEqual(peaceAcquisition.unresolvedCount,0,'Peace mode must not create unresolved member build slots');
assert(peaceAcquisition.list.length>0,'Peace mode must expose minimum-stock replenishment');
assert(peaceAcquisition.list.some(row=>row.category==='equipment'),'Peace minimums must include routine equipment-pool replenishment when short');
assert(peaceAcquisition.list.some(row=>row.category==='provisions'),'Peace minimums must include stackable/provision replenishment when short');
assert(peaceAcquisition.list.every(row=>String(row.reasons||'').includes('Peace')),'Peace acquisition reasons must be minimum-stock scoped rather than member-build scoped');

const ownedFactionInventory={
  current:{},
  memberReadiness:{
    roster:{'200':{memberId:'200',memberName:'Owned Secondary',level:20}},
    profiles:{'200':{
      stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
      equipment:{
        summary:'PRIMARY: AK-47 | MELEE: Macana | HELMET: WWII Helmet | BODY: Bulletproof Vest | GLOVES: Kevlar Gloves | PANTS: Combat Pants | BOOTS: Safety Boots',
        items:[
          {name:'AK-47',type:'Primary'},
          {name:'Macana',type:'Melee'},
          {name:'WWII Helmet',subType:'Helmet'},
          {name:'Bulletproof Vest',subType:'Body'},
          {name:'Kevlar Gloves',subType:'Gloves'},
          {name:'Combat Pants',subType:'Pants'},
          {name:'Safety Boots',subType:'Boots'}
        ]
      },
      ownedEquipment:{items:[{name:'Qsz-92',type:'Secondary',quantity:1}]},
      verifiedAt:new Date().toISOString()
    }},
    settings:{staleHours:72}
  },
  snapshots:[],
  events:[]
};
const ownedRows=logic.memberRows(ownedFactionInventory,[]);
const ownedBuild=logic.compareMemberBuild(ownedRows[0],ownedFactionInventory,ownedRows,{procurementMode:'budget'});
assert.strictEqual(ownedBuild.items.find(x=>x.slot==='secondary').route,'OWNED','member-owned adequate secondary must satisfy the slot');
const budgetPlan=logic.acquisitionPlan(ownedFactionInventory,{mode:'war',participants:1,procurementMode:'budget',budgetCap:15000000});
assert(budgetPlan.fundedEstimatedValue<=15000000,'known acquisition spend must respect budget cap');
assert(!budgetPlan.list.some(row=>/BT MP9|Qsz-92/.test(row.item)&&String(row.reasons||'').includes('Owned Secondary secondary')),'owned adequate secondary must not be purchased again');

const publicEstimate=logic.estimateBalancedBattleStats(
  {memberId:'400',level:31},
  {rank:'Professional',level:31,ageDays:2500,crimesTotal:25000,networth:600000000}
);
assert(publicEstimate&&publicEstimate.total>0,'public profile data should create a balanced planning estimate');
assert.strictEqual(publicEstimate.stats.strength,publicEstimate.stats.defense);
assert.strictEqual(publicEstimate.stats.speed,publicEstimate.stats.dexterity);
assert.strictEqual(publicEstimate.confidence,'MEDIUM');

const estimatedFaction={
  current:{
    'weapons|bt':{
      category:'weapons',itemId:'bt',name:'BT MP9',type:'Secondary',
      availableCount:0,loanedCount:1,amountOwned:1,
      loans:[{memberId:'400',memberName:'Estimated Member',amount:1,uids:[]}]
    }
  },
  memberReadiness:{
    roster:{'400':{memberId:'400',memberName:'Estimated Member',level:31,daysInFaction:90}},
    profiles:{'400':{
      publicIntel:{rank:'Professional',level:31,ageDays:2500,crimesTotal:25000,networth:600000000,fetchedAt:new Date().toISOString()},
      equipment:{summary:'',items:[]}
    }},
    settings:{staleHours:72}
  },
  snapshots:[],events:[]
};
const estimatedRows=logic.memberRows(estimatedFaction,[],{procurementMode:'budget'});
assert.strictEqual(estimatedRows[0].statsEstimated,true,'member without private battlestats should use a public balanced estimate');
assert.strictEqual(estimatedRows[0].readinessStatus,'ESTIMATED — NEEDS DATA','estimated members must never be promoted as verified-ready automatically');
assert(estimatedRows[0].loanItems.some(item=>item.name==='BT MP9'),'faction armory loans must be available as member equipment evidence');
const estimatedBuild=estimatedRows[0].buildAssessment;
assert.strictEqual(estimatedBuild.items.find(item=>item.slot==='secondary').route,'LOANED','adequate faction loan should satisfy estimated member secondary planning before acquisition');
const estimatedPlan=logic.acquisitionPlan(estimatedFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert.strictEqual(estimatedPlan.participants,1);
assert(!estimatedPlan.assignments.some(row=>row.memberId==='400'&&row.slot==='secondary'&&row.route==='ACQUIRE'),'loaned adequate secondary must not be re-acquired for an estimated member');

const approvedFaction=JSON.parse(JSON.stringify(readyFaction));
approvedFaction.memberReadiness.profiles['150'].verifiedAt=readyVerifiedAt;
approvedFaction.memberReadiness.profiles['150'].readinessApproval={
  status:'WAR READY',approvedAt:new Date().toISOString(),verifiedAt:readyVerifiedAt,procurementMode:'budget'
};
const approvedPlan=logic.acquisitionPlan(approvedFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(!approvedPlan.assignments.some(row=>row.memberId==='150'),'approved WAR READY member must not generate individual acquisition assignments');

const unknownInventoryFaction={
  current:{},
  memberReadiness:{
    roster:{'300':{memberId:'300',memberName:'No Inventory',level:20}},
    profiles:{'300':{
      stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
      equipment:{summary:'',items:[]},
      verifiedAt:new Date().toISOString()
    }},
    settings:{staleHours:72}
  },
  snapshots:[],
  events:[]
};
const unknownPlan=logic.acquisitionPlan(unknownInventoryFaction,{mode:'war',participants:1,procurementMode:'budget',budgetCap:15000000});
assert(unknownPlan.unresolvedCount>=8,'missing member inventory must defer slot purchasing');


const snapState=logic.recordSnapshot(
  {snapshots:[],events:[]},
  factionInventory.current,
  Date.parse('2026-10-02T12:00:00Z'),
  Date.parse('2026-10-02T12:01:00Z')
);
assert.strictEqual(snapState.snapshotAdded,true);
assert.strictEqual(snapState.eventsAdded,0);

const next=JSON.parse(JSON.stringify(factionInventory.current));
next['medical|20'].amountOwned=8;
next['medical|20'].availableCount=8;
const snapState2=logic.recordSnapshot(
  snapState.state,
  next,
  Date.parse('2026-10-02T13:00:00Z'),
  Date.parse('2026-10-02T13:01:00Z')
);
assert.strictEqual(snapState2.eventsAdded,1);
assert.strictEqual(snapState2.state.events[0].deltaOwned,-2);

console.log('MM Faction Armory logic tests: PASS');
const userSource=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
new Function(userSource);
assert(userSource.includes("const VERSION='8.0.0-alpha.26';"));
assert(!userSource.includes('raw.githubusercontent.com'),'candidate must not retain the obsolete raw.githubusercontent.com delivery/runtime channel');
assert(userSource.includes('https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@9af1c84f189141be77ef0d2c86d86513db5978ed/modular-suite/core/MM_Torn_Core.js'),'Core @require must be immutable full-SHA jsDelivr');
assert(userSource.includes('https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@98519cd5b5ffa5ea3747f7e50198569bd8cb22d9/modular-suite/faction-armory/MM_Faction_Armory.logic.js'),'Faction logic @require must be immutable full-SHA jsDelivr');
assert(userSource.includes('async function autoRefreshArmory'));
assert(userSource.includes('AUTO_CHECK_MS=5*60*1000'));
assert(userSource.includes('AUTO_MEMBER_BATCH=2'));
assert(userSource.includes('if(!vaultSession?.key)return []'));
assert(userSource.includes('nextUsefulRefreshAt'));
console.log('MM Faction Armory automation regression: PASS');

const userSource2=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource2.includes("const VERSION='8.0.0-alpha.26';"));
assert(userSource2.includes('function staleSavedMemberCount'));
assert(userSource2.includes('save a faction API key to enable automatic refresh'));
assert(userSource2.includes('unlock the member-key vault during an Armory session'));
assert(userSource2.includes('Not saved — cached faction data cannot refresh automatically.'));
console.log('MM Faction Armory automation-blocker UX regression: PASS');

const userSource3=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource3.includes("const VERSION='8.0.0-alpha.26';"));
assert(userSource3.includes('mm-fa-unlock-vault'));
assert(userSource3.includes('Member-key vault: '));
assert(userSource3.includes('automatic due-profile refresh enabled while Armory is open'));
assert(userSource3.includes('setTimeout(()=>autoRefreshArmory({forceFaction:false}),50)'));
console.log('MM Faction Armory explicit vault-unlock automation regression: PASS');


const balancedProfile=logic.battleProfile({strength:100,defense:100,speed:100,dexterity:100});

// Alpha.20 equipment-stat and alternatives contract.
assert(logic.equipmentOptionCatalog.length>100,'equipment option catalog should expose broad weapon/armor choice');
assert(logic.alternativeEquipmentCatalog.length>80,'alternative option catalog should contain many non-baseline choices');

const budgetPrimary=logic.generalTargetForSlot('primary',balancedProfile,'budget');
assert.strictEqual(budgetPrimary.name,'AK-47','alternative catalog must not silently change the canonical budget readiness baseline');
const budgetPrimaryFloor=logic.readinessFloorScore(budgetPrimary,balancedProfile.offensiveNeed);
const primaryAlternatives=logic.equipmentOptionsForSlot('primary',balancedProfile,budgetPrimaryFloor);
assert(primaryAlternatives.length>=8,'a normal primary requirement should expose many qualifying choices');
assert(primaryAlternatives.some(x=>x.name==='Enfield SA-80'),'qualifying primary alternatives should include Enfield SA-80');
assert(primaryAlternatives.some(x=>x.name==='Tavor TAR-21'),'qualifying primary alternatives should include Tavor TAR-21');
assert(primaryAlternatives.every(x=>x.meetsFloor&&x.minimumScore>=budgetPrimaryFloor),'every displayed alternative must meet the member slot floor at its minimum normal roll');

const akAverage=logic.equipmentStatProfile({name:'AK-47'});
assert.strictEqual(akAverage.source,'CATALOG AVG');
assert.strictEqual(akAverage.averageDamage,58.5);
assert.strictEqual(akAverage.averageAccuracy,54.5);
assert.strictEqual(akAverage.minDamage,56);
assert.strictEqual(akAverage.minAccuracy,52);
assert.strictEqual(akAverage.maxDamage,61);
assert.strictEqual(akAverage.maxAccuracy,57);

const akExact=logic.equipmentStatProfile({name:'AK-47',damage:60,accuracy:56});
assert.strictEqual(akExact.source,'ITEM','current item stats from member/equipment data must be identified as exact item data');
assert.strictEqual(akExact.currentDamage,60);
assert.strictEqual(akExact.currentAccuracy,56);

const eodHelmet=logic.equipmentStatProfile({name:'EOD Helmet'});
assert.strictEqual(eodHelmet.kind,'armor');
assert.strictEqual(eodHelmet.averageArmor,57.5);
assert.strictEqual(eodHelmet.minArmor,55);
assert.strictEqual(eodHelmet.maxArmor,60);

const statRichRows=logic.memberRows(readyFaction,[],{procurementMode:'budget'});
const statRichPrimary=statRichRows[0].buildAssessment.items.find(x=>x.slot==='primary');
assert(statRichPrimary.currentStats&&statRichPrimary.targetStats,'member build item must expose HAS and target stat profiles');
assert(Array.isArray(statRichPrimary.recommendationOptions)&&statRichPrimary.recommendationOptions.length>=8,'member build item must carry many qualifying alternatives');

const idealPrimary=logic.generalTargetForSlot('primary',balancedProfile,'ideal');
assert.strictEqual(idealPrimary.name,'Jackhammer','ideal procurement should reject a much more expensive premium primary when the performance gain is single-digit');
assert(idealPrimary.marketValue<logic.catalogItemByName('ArmaLite M-15A4').marketValue,'value target must cost less than ArmaLite reference');

const valueFaction={
  current:{
    'weapons|jack':{category:'weapons',itemId:'jack',name:'Jackhammer',availableCount:1,amountOwned:1,loanedCount:0},
    'weapons|arma':{category:'weapons',itemId:'arma',name:'ArmaLite M-15A4',availableCount:1,amountOwned:1,loanedCount:0}
  },
  memberReadiness:{
    roster:{'900':{memberId:'900',memberName:'Value Test',level:20}},
    profiles:{'900':{
      stats:{strength:100,defense:100,speed:100,dexterity:100},
      equipment:{summary:'',items:[]},
      ownedEquipment:{items:[]},
      verifiedAt:new Date().toISOString()
    }},
    settings:{staleHours:72}
  }
};
const valueRows=logic.memberRows(valueFaction,[]);
const valueBuild=logic.compareMemberBuild(valueRows[0],valueFaction,valueRows,{procurementMode:'ideal'});
const valuePrimary=valueBuild.items.find(x=>x.slot==='primary');
assert.strictEqual(valuePrimary.route,'ISSUE');
assert.strictEqual(valuePrimary.factionOptionName,'Jackhammer','faction stock allocation should issue the least-cost acceptable primary instead of consuming premium stock first');
assert(valuePrimary.premiumCostMultiple>5,'build output should expose the premium cost multiple');
assert(valuePrimary.premiumGainPct<10,'build output should expose the modest premium performance gain');
assert(valuePrimary.valueNote.includes('VALUE TARGET'));

const alreadyEquipped={
  current:{},
  memberReadiness:{
    roster:{'901':{memberId:'901',memberName:'Already Equipped',level:20}},
    profiles:{'901':{
      stats:{strength:100,defense:100,speed:100,dexterity:100},
      equipment:{summary:'PRIMARY: ArmaLite M-15A4',items:[{name:'ArmaLite M-15A4',type:'Primary'}]},
      ownedEquipment:{items:[]},
      verifiedAt:new Date().toISOString()
    }},
    settings:{staleHours:72}
  }
};
const equippedRows=logic.memberRows(alreadyEquipped,[]);
const equippedBuild=logic.compareMemberBuild(equippedRows[0],alreadyEquipped,equippedRows,{procurementMode:'ideal'});
const equippedPrimary=equippedBuild.items.find(x=>x.slot==='primary');
assert.strictEqual(equippedPrimary.route,'KEEP','price must affect new procurement, not force disposal of already-owned adequate premium gear');
assert(equippedPrimary.currentMarketValue>equippedPrimary.targetMarketValue);
console.log('MM Faction Armory price-aware build regression: PASS');

const userSourceValue=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
new Function(userSourceValue);
assert(userSourceValue.includes("const VERSION='8.0.0-alpha.26';"));
assert(userSourceValue.includes('MM_Faction_Armory.logic.js'));
assert(userSourceValue.includes('saved member API key'));
assert(userSourceValue.includes('Refresh All Saved Members: '),'refresh-all completion summary must remain explicit');
assert(userSourceValue.includes('Find Best Source'));
assert(userSourceValue.includes('data-armory-acquire'));
assert(userSourceValue.includes("type:'armory-acquisition-request'"));
assert(userSourceValue.includes('function setMemberWarReady'));
assert(userSourceValue.includes('Mark War Ready'));
assert(userSourceValue.includes('Reopen Readiness'));
assert(userSourceValue.includes("row.buildAssessment||logic.compareMemberBuild"));
assert(userSourceValue.includes("'War Ready':r.readinessStatus==='WAR READY'?'YES':'NO'"));
assert(userSourceValue.includes("'Baseline Pass':build.warReady?'YES':'NO'"));
assert(!userSourceValue.includes('WAR_PARTICIPANTS'),'fixed war-participant assumptions must be removed');
assert(userSourceValue.includes('days_in_faction'),'faction roster parser must retain Torn days_in_faction');
assert(userSourceValue.includes("apiRequest('/faction/basic',key)"),'faction leader must be resolved from Torn faction basic');
assert(userSourceValue.includes("'/user/'+encodeURIComponent(id)+'/profile'"),'missing private stats must use Torn public profile data');
assert(userSourceValue.includes("'/user/'+encodeURIComponent(id)+'/personalstats?cat=popular'"),'public crimes/networth/activity data must enrich estimates when available');
assert(userSourceValue.includes('Send Data Reminder'),'missing-data member must have a reminder action');
assert(userSourceValue.includes('REMINDER_SENT_KEY'),'reminder sent state must be stored per member');
assert(userSourceValue.includes("kind:'member-data-reminder'"),'reminder compose must be tracked separately');
assert(userSourceValue.includes('verifyArmorySend'),'reminder must wait for Torn send confirmation before hiding');
assert(userSourceValue.includes('armoryDeliveryFingerprint'),'send confirmation must support transcript evidence');
assert(userSourceValue.includes('armorySentConfirmationTexts'),'send confirmation must support fresh Torn success UI evidence');
assert(!userSourceValue.includes('const leftCompose='),'leaving Compose alone must not count as successful delivery');
assert(userSourceValue.includes('fingerprintBaselineCount'),'send detector must compare post-send transcript against a pre-send baseline');
assert(userSourceValue.includes('Message Faction Leader'),'Acquire must expose leader-message output');
assert(userSourceValue.includes("isWar?'FACTION ARMORY WAR ACQUISITION SNAPSHOT':'FACTION ARMORY PEACE MINIMUMS SNAPSHOT'"),'leader snapshot title must follow War/Peace scope');
assert(userSourceValue.includes("const memberNeeds=isWar"),'member-build needs must be War-only in the leader report');
assert(userSourceValue.includes("const minNeeds=(minimums?.actionable||[])"),'leader report must consume the same live minimum shortfalls in War and Peace');
assert(userSourceValue.includes('WAR STOCK SHORTFALLS'),'War report must expose approved war-stock shortfalls');
assert(!userSourceValue.includes('Routine minimum-stock replenishment is deferred until Peace mode.'),'War report must no longer hide active war-stock minimums');
assert(userSourceValue.includes('Member equipment gaps are not added in Peace mode.'),'Peace snapshot must explicitly exclude member equipment');
assert(userSourceValue.includes("isWar?'ACQUISITION PLAN':'PEACE REPLENISHMENT PLAN'"),'combined plan label must expose mode scope');
assert(userSourceValue.includes('BUDGET-FUNDED BUY-NOW ESTIMATE'),'leader snapshot must separate budget-funded spend from the full plan');
assert(userSourceValue.includes('FULL PLANNED PRICED ESTIMATE'),'leader snapshot must disclose the full priced plan separately');
assert(userSourceValue.includes("subject:'Faction Armory '+stockMode.toUpperCase()+' acquisition snapshot'"),'leader message subject must identify the output as a snapshot rather than a final quote');
assert(userSourceValue.includes("leaderBaseLabel+(stockMode==='war'?' · War Needs':' · Peace / Minimums')"),'leader button must expose the active report scope');
assert((userSourceValue.match(/data-stock-mode="war"/g)||[]).length>=2,'War/Peace selection must be available on Acquire as well as Minimums');
assert(userSourceValue.includes('function leaderAcquisitionReport'),'leader acquisition report must be generated from live Armory state');
assert(userSourceValue.includes('BUDGET-FUNDED BUY-NOW ESTIMATE'),'leader snapshot must expose a budget-funded estimate based on the same planning prices as Acquire');
assert(userSourceValue.includes('FRESH LIVE RANGE'),'Acquire rows must expose live-source range only when fresh cached sources exist');
assert(userSourceValue.includes('PRICE EVIDENCE'),'Acquire rows must disclose whether the planning price is live-source or reference-only evidence');
assert(userSourceValue.includes('#mce_0'),'Armory messaging must use the shared current Torn TinyMCE compose contract');
assert(userSourceValue.includes('MM_Faction_Armory.logic.js'),'Armory must load the expanded logic contract');
assert(userSourceValue.includes("/torn/items?cat=All&sort=ASC"),'explicit faction refresh must collect broad Torn market-price references');
assert(userSourceValue.includes('equipmentMarketCatalog'),'current Torn equipment-price references must be cached in faction state');
assert(userSourceValue.includes('function equipmentStatsText'),'equipment stat display helper must exist');
assert(userSourceValue.includes('Current equipment + stats'),'Members must display stats with current equipment');
assert(userSourceValue.includes('HAS STATS'),'Build slot must expose member current-equipment stats');
assert(userSourceValue.includes('NEED / TARGET AVG'),'Build slot must expose target minimum/average stats');
assert(userSourceValue.includes('Qualifying alternatives'),'Build slot must expose multiple qualifying alternatives');
assert(userSourceValue.includes("'LOW COST','MID COST','HIGH COST','PRICE UNKNOWN'"),'alternatives must be grouped by current acquisition-cost band');
assert(userSourceValue.includes('data-build-option-member'),'each alternative must route independently to acquisition');
assert(userSourceValue.includes('Torn Market Reference'),'current Torn market reference must participate in planning-price display');
assert(userSourceValue.includes('bestPlanning'),'option pricing must distinguish planning price from verified live source');
assert(userSourceValue.includes('equipmentOptionPriceMemo'),'alternative pricing must be memoized within a render');
assert(userSourceValue.includes("!item.ready&&!['OWNED','LOANED'].includes(item.route)?equipmentOptionsHtml"),'full alternative lists should be limited to actionable equipment slots');
assert.strictEqual((userSourceValue.match(/MutationObserver/g)||[]).length,0,'equipment alternatives must not add document-wide mutation observers');
assert.strictEqual((userSourceValue.match(/setInterval\(/g)||[]).length,1,'equipment alternatives must not add new background polling intervals');
console.log('MM Faction Armory acquisition handoff regression: PASS');

// Alpha.23 equipment-ingestion, procurement-pass, quantity-override and coverage regressions.
assert.strictEqual(logic.equipmentSlot({name:'Unknown Primary',slotId:1,damage:70,accuracy:60}),'primary','authoritative numeric equipment slot 1 must map to primary');
assert.strictEqual(logic.equipmentSlot({name:'Unknown Melee',slot:3,damage:70,accuracy:60}),'melee','authoritative numeric equipment slot 3 must map to melee');
assert.strictEqual(logic.equipmentSlot({name:'Metal Nunchaku'}),'melee','common singular Metal Nunchaku spelling must resolve to the canonical melee catalog entry');

const alpha23VerifiedAt=new Date().toISOString();
const alpha23Faction={
  current:{},
  memberReadiness:{
    roster:{
      '2301':{memberId:'2301',memberName:'Morpheus2126',level:50},
      '2302':{memberId:'2302',memberName:'No Data',level:20}
    },
    profiles:{
      '2301':{
        stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
        equipment:{summary:'',items:[
          {name:'AK-47',slotId:1,damage:70,accuracy:65},
          {name:'BT MP9',slotId:2,damage:70,accuracy:65},
          {name:'Metal Nunchaku',slotId:3,damage:66,accuracy:65},
          {name:'Combat Vest',slotId:4,armor:45},
          {name:'Combat Helmet',slotId:6,armor:45},
          {name:'Combat Pants',slotId:7,armor:45},
          {name:'Combat Boots',slotId:8,armor:45},
          {name:'Combat Gloves',slotId:9,armor:45}
        ]},
        ownedEquipment:{items:[]},
        verifiedAt:alpha23VerifiedAt
      },
      '2302':{
        equipment:{summary:'',items:[]},
        procurementPass:{status:'PASS',approvedAt:alpha23VerifiedAt,verifiedAt:'',reason:'No current member data'}
      }
    },
    settings:{staleHours:72}
  }
};
const alpha23Rows=logic.memberRows(alpha23Faction,[],{procurementMode:'budget'});
const alpha23Morpheus=alpha23Rows.find(row=>row.memberId==='2301');
const alpha23Melee=alpha23Morpheus.buildAssessment.items.find(item=>item.slot==='melee');
assert.strictEqual(alpha23Melee.currentName,'Metal Nunchaku');
assert.strictEqual(alpha23Melee.route,'KEEP','current Metal Nunchaku above the melee readiness floor must never be acquired/replaced');
assert.strictEqual(alpha23Melee.ready,true);

const alpha23Passed=alpha23Rows.find(row=>row.memberId==='2302');
assert.strictEqual(alpha23Passed.procurementPassCurrent,true);
assert.strictEqual(alpha23Passed.acquisitionDisposition,'PROCUREMENT PASS');
const alpha23Plan=logic.acquisitionPlan(alpha23Faction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(!alpha23Plan.assignments.some(row=>row.memberId==='2302'),'current Procurement Pass must remove a missing-data member from War acquisition blockers');

const alpha23OverrideRow=alpha23Plan.list[0];
if(alpha23OverrideRow){
  const overrideKey=logic.acquisitionOverrideKey('war','budget',alpha23OverrideRow);
  alpha23Faction.acquisitionPlanning={quantityOverrides:{[overrideKey]:{qty:0,updatedAt:alpha23VerifiedAt}}};
  const overridden=logic.acquisitionPlan(alpha23Faction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
  const row=overridden.list.find(item=>item.quantityOverrideKey===overrideKey);
  assert(row&&row.systemQty>=0);
  assert.strictEqual(row.qty,0,'manual per-item planned quantity must support zero');
  assert.strictEqual(row.manualQtyOverride,0);
}
const alpha23Coverage=logic.coverageComparison(alpha23Faction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert.strictEqual(alpha23Coverage.memberCoverage.length,16,'coverage export must emit eight standard combat slots per two-member fixture');
assert.strictEqual(alpha23Coverage.factionCoverage.length,8,'coverage export must emit one faction summary per standard combat slot');
assert.strictEqual(alpha23Coverage.consistencyIssues.length,0,'normalized Morpheus fixture must have no route/floor consistency defects');

const unmappedFaction=JSON.parse(JSON.stringify(alpha23Faction));
unmappedFaction.memberReadiness.roster['2303']={memberId:'2303',memberName:'Unmapped Gear',level:20};
unmappedFaction.memberReadiness.profiles['2303']={
  stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
  equipment:{summary:'',items:[{name:'Unknown Combat Object',slotId:99,damage:70,accuracy:60}]},
  verifiedAt:alpha23VerifiedAt
};
const unmappedCoverage=logic.coverageComparison(unmappedFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(unmappedCoverage.consistencyIssues.some(issue=>issue.type==='UNMAPPED_EQUIPMENT'&&issue.memberId==='2303'),'coverage scan must flag equipped API combat records that cannot be mapped to a standard slot');

assert(userSourceValue.includes('Pass / Exclude Acquisition'));
assert(userSourceValue.includes('PROCUREMENT PASS'));
assert(userSourceValue.includes('data-save-acq-qty'));
assert(userSourceValue.includes('requestedQty<=0'),'zero planned/funded quantity must not hand off a forced quantity of one');
assert(userSourceValue.includes('const livePrices=[num(live.itemMarketPrice),num(live.bazaarPrice),num(live.travelPrice)]'),'leader planning must distinguish cached live-source prices from references');
assert(userSourceValue.includes("const bestPlanning=best||fallback;"),'cached live buyable-source evidence must outrank Torn/static reference fallbacks');
assert(userSourceValue.includes('Reference-only values are labeled and used only when no fresh cached buyable source is available.'),'leader snapshot must disclose fallback-reference semantics');
assert(userSourceValue.includes('SYSTEM BUY'));
assert(userSourceValue.includes('PLANNED BUY'));
assert(userSourceValue.includes('data-view="coverage"'));
assert(userSourceValue.includes("xmlSheet('Coverage'"));
assert(userSourceValue.includes("xmlSheet('Faction Coverage'"));
assert(userSourceValue.includes("xmlSheet('Consistency'"));
assert(userSourceValue.includes('CONSISTENCY FLAGS'));
console.log('MM Faction Armory alpha.23 audit regressions: PASS');

assert(userSourceValue.includes("const buckets=[...standard,...(unclassified.length?['unclassified']:[])];"),'weapon inventory must retain an UNCLASSIFIED bucket instead of dropping unresolved weapon rows');
assert(userSourceValue.includes('Torn weapons source:'),'Stock must expose Torn weapon-source row diagnostics');
assert(userSourceValue.includes('API type '),'weapon rows must expose raw API classification fields for diagnosis');
assert(userSourceValue.includes('<b>Quick Build</b>'),'Builds must expose the compact Quick Build interface');
assert(userSourceValue.includes('id="mm-fa-quick-build-member"'),'Quick Build must have a member selector');
assert(userSourceValue.includes('id="mm-fa-quick-build-message"'),'Quick Build must offer a manual-send build message');
assert(userSourceValue.includes('function quickBuildMessage'),'Quick Build message must reuse current build assessment');
assert(userSourceValue.includes('function quickBuildActionItem'),'Quick Build must resolve a route-specific action item instead of displaying the generic baseline target');
assert(userSourceValue.includes("if(item.route==='OWNED')return 'OWNED / EQUIP'"),'member-owned adequate gear must remain equip/verify work, not be mislabeled KEEP');
assert(userSourceValue.includes("if(route==='KEEP')return String(item.currentName"),'KEEP rows must display the actual current equipped item');
assert(userSourceValue.includes("if(route==='ISSUE')return String(item.factionOptionName"),'ISSUE rows must display the faction item being issued');
assert(userSourceValue.includes('Advanced / Full Roster Builds'),'detailed build evidence must remain available behind the compact interface');
assert(userSourceValue.includes('function minimumOpenInputs'),'Minimums must compute explicit unresolved manager/leadership inputs');
assert(userSourceValue.includes('War Stock Control'),'Minimums must present live Have / Suggested / Effective Minimum / Shortfall controls');
assert(userSourceValue.includes('Acquire uses the same effective minimum shown here.'),'Minimums must state that dependent acquisition values derive from the same state');
assert(userSourceValue.includes("xmlSheet('Open Inputs'"),'Leadership workbook must include unresolved proposal inputs');
assert.strictEqual((userSourceValue.match(/function buildsHtml\(/g)||[]).length,1,'Quick Build must remain the single normal Builds renderer');
assert.strictEqual((userSourceValue.match(/function advancedBuildsHtml\(/g)||[]).length,1,'detailed build renderer must exist once');
console.log('MM Faction Armory alpha.24 build/minimums regressions: PASS');

assert(userSourceValue.includes("const rawEquipment=Array.isArray(equipData?.equipment)?equipData.equipment:null;"),'member import must distinguish a valid empty equipment array from a malformed response');
assert(userSourceValue.includes("if(rawEquipment.length&&!items.length)throw new Error('Equipped combat items were returned but could not be normalized; no profile was changed.');"),'non-empty Torn equipment that normalizes to zero must still fail closed');
assert(userSourceValue.includes('emptyConfirmed:equipmentEmptyConfirmed'),'valid empty equipment must be stored as explicit fresh evidence');
assert(userSourceValue.includes('No combat gear equipped (confirmed)'),'Members UI must distinguish confirmed-empty combat equipment from missing/stale data');
assert(!userSourceValue.includes('No equipped items could be parsed; no profile was changed.'),'valid empty equipment must no longer be rejected by the obsolete summary guard');
console.log('MM Faction Armory alpha.24.2 empty-equipment regression: PASS');

const morpheusLiveProfile={
  stats:{strength:2017,defense:1716,speed:1015,dexterity:1453},
  equipment:{summary:'MELEE: Metal Nunchaku: DMG 62.13/ACC 60.18',items:[
    {name:'Metal Nunchaku',slotId:3,slot:'melee',damage:62.13,accuracy:60.18}
  ]},
  verifiedAt:new Date().toISOString()
};
const morpheusLiveRow={memberId:'4482483',memberName:'Morpheus2126',stats:morpheusLiveProfile.stats,profile:morpheusLiveProfile,loanItems:[]};
const morpheusLiveBuild=logic.compareMemberBuild(morpheusLiveRow,{current:{}},[morpheusLiveRow],{procurementMode:'budget'});
const morpheusLiveMelee=morpheusLiveBuild.items.find(item=>item.slot==='melee');
assert(morpheusLiveMelee,'Morpheus live melee row must exist');
assert.strictEqual(morpheusLiveMelee.currentName,'Metal Nunchaku');
assert.strictEqual(morpheusLiveMelee.route,'KEEP','neutral readiness must not turn Morpheus\'s adequate Metal Nunchaku into an upgrade because of style bias');
assert(morpheusLiveMelee.currentScore>=morpheusLiveMelee.readinessFloor,'Morpheus live Metal Nunchaku must clear the objective melee floor');
assert(userSourceValue.includes('neutral gear performance determines readiness, while member style ranks qualifying alternatives')||logic.warReadinessStandard(morpheusLiveRow,{current:{}},[morpheusLiveRow],{procurementMode:'budget'}).methodology.includes('neutral gear performance determines readiness'),'readiness methodology must separate objective pass/fail from alternative ranking');
console.log('MM Faction Armory alpha.24.2 objective-readiness regression: PASS');

const noGearFaction={
  current:{},
  memberReadiness:{
    roster:{'777':{memberId:'777',memberName:'Confirmed Empty',level:15}},
    profiles:{'777':{
      stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
      equipment:{summary:'',items:[],emptyConfirmed:true},
      verifiedAt:new Date().toISOString(),
      source:'MM Faction Armory member Limited Access API'
    }},
    settings:{staleHours:72}
  }
};
const noGearRows=logic.memberRows(noGearFaction,[],{procurementMode:'budget'});
assert.strictEqual(noGearRows[0].readinessStatus,'NO COMBAT GEAR EQUIPPED','fresh confirmed-empty equipment must not be mislabeled MISSING DATA');
assert.strictEqual(noGearRows[0].equipmentEvidenceKnown,true,'confirmed-empty equipment is valid evidence even though no combat item is equipped');

noGearFaction.memberReadiness.profiles['777'].readinessApproval={
  status:'WAR READY',approvedAt:new Date().toISOString(),manual:true,reason:'Leader decision'
};
let manuallyReadyRows=logic.memberRows(noGearFaction,[],{procurementMode:'budget'});
assert.strictEqual(manuallyReadyRows[0].readinessStatus,'WAR READY','Leadership must be able to mark a confirmed-empty member WAR READY individually');
assert.strictEqual(manuallyReadyRows[0].buildWarReady,false,'manual WAR READY must not falsify the automatic build baseline');
const manuallyReadyPlan=logic.acquisitionPlan(noGearFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(!manuallyReadyPlan.assignments.some(row=>row.memberId==='777'),'individual Leadership WAR READY must remove that member from War acquisition');

const overrideFaction={
  current:{},
  memberReadiness:{
    roster:{'888':{memberId:'888',memberName:'Source Name',level:10}},
    profiles:{'888':{
      stats:{strength:100,defense:100,speed:100,dexterity:100},
      equipment:{summary:'',items:[],emptyConfirmed:true},
      verifiedAt:'2026-10-06T12:00:00.000Z',
      source:'API',
      manualOverrides:{
        updatedAt:'2026-10-06T13:00:00.000Z',
        reason:'Leadership correction',
        values:{
          memberName:'Manual Name',
          level:22,
          stats:{strength:2500},
          equipment:{summary:'MELEE: Macana',items:[{name:'Macana',slot:'melee'}],emptyConfirmed:false},
          medicalStatus:'MANUAL READY'
        }
      }
    }},
    settings:{staleHours:999999}
  }
};
const overrideRows=logic.memberRows(overrideFaction,[],{procurementMode:'budget'});
assert.strictEqual(overrideRows[0].memberName,'Manual Name','manual override must be able to replace displayed member data');
assert.strictEqual(overrideRows[0].level,22,'manual override must be able to replace roster-derived level');
assert.strictEqual(overrideRows[0].stats.strength,2500,'manual stats override must drive effective readiness data');
assert.strictEqual(overrideRows[0].rawProfile.stats.strength,100,'manual override must not destroy underlying source/API data');
assert.strictEqual(overrideRows[0].manualOverrideActive,true);
assert.strictEqual(overrideRows[0].equipmentSummary,'MELEE: Macana','manual equipment override must drive build input');
assert.strictEqual(overrideRows[0].equipmentEmptyConfirmed,false);
assert.deepStrictEqual(logic.manualOverrideValues(overrideFaction.memberReadiness.profiles['888']).stats,{strength:2500});
console.log('MM Faction Armory alpha.24.3 leadership/manual-override regressions: PASS');

assert(userSourceValue.includes("return route==='ISSUE'?'BORROW FROM VAULT':route;"),'member-facing build messages must translate ISSUE to BORROW FROM VAULT without changing internal route semantics');
assert(!userSourceValue.includes('Known stronger personal equipment is kept. Unknown or special gear is marked REVIEW rather than replaced automatically.'),'removed member-message explanation must not remain');
assert(!userSourceValue.includes('Faction stock changes the route (ISSUE vs ACQUIRE); it does not lower the build standard.'),'removed faction-stock explanation must not remain in faction messages');
assert((userSourceValue.match(/Inventory Manager/g)||[]).length>=3,'member reminders, build messages and leader reports must sign with Inventory Manager under Manic Mike');
assert(userSourceValue.includes("MEMBER_MESSAGE_LOG_KEY='mm_faction_armory_member_message_log_v1'"),'confirmed member messages must use a dedicated durable local message log');
assert(userSourceValue.includes('function memberMessageStatus'),'message tracking must expose per-member/per-kind status');
assert(userSourceValue.includes('function memberAnyMessageStatus'),'member list must expose whether any confirmed faction message was sent');
assert(userSourceValue.includes('function recordConfirmedMemberMessage'),'message state must be recorded through the trusted confirmation path');
assert(userSourceValue.includes("if(payload.memberId)recordConfirmedMemberMessage(payload);"),'member message must not be marked sent until trusted Torn confirmation');
assert(userSourceValue.includes("MSG NOT SENT"),'Quick Build/member UI must expose unsent members');
assert(userSourceValue.includes("tile('BUILD MSG'"),'Members UI must expose confirmed build-message status');
assert(userSourceValue.includes("tile('DATA REQUEST'"),'Members UI must expose confirmed data-request status');
assert(userSourceValue.includes("'Any Member Message'"),'Leadership export must include overall member-message status');
assert(userSourceValue.includes("'Build Message Count'"),'Leadership export must include confirmed build-message count');
assert(userSourceValue.includes("'Data Request At'"),'Leadership export must include data-request timestamp');
console.log('MM Faction Armory alpha.24.4 faction-message tracking regressions: PASS');

const equipmentDecisionFaction={
  current:{
    'weapons|9001':{category:'weapons',itemId:'9001',name:'AK-47',type:'Primary',amountOwned:1,availableCount:1,loanedCount:0,damage:58.5,accuracy:54.5}
  },
  memberReadiness:{
    roster:{'990':{memberId:'990',memberName:'Menu Test',level:20}},
    profiles:{'990':{
      stats:{strength:1000,defense:1000,speed:1000,dexterity:1000},
      equipment:{summary:'PRIMARY: Starter Rifle',items:[{name:'Starter Rifle',slot:'primary',damage:1,accuracy:1}]},
      verifiedAt:new Date().toISOString(),
      equipmentDecisions:{primary:{action:'accept-current',itemName:'Starter Rifle',updatedAt:new Date().toISOString()}}
    }},
    settings:{staleHours:72}
  }
};
let equipmentDecisionRows=logic.memberRows(equipmentDecisionFaction,[],{procurementMode:'budget'});
let equipmentDecisionPrimary=equipmentDecisionRows[0].buildAssessment.items.find(x=>x.slot==='primary');
assert.strictEqual(equipmentDecisionPrimary.route,'KEEP','Accept Equipped Item must waive the automatic floor for that exact slot');
assert.strictEqual(equipmentDecisionPrimary.ready,true,'accepted equipped item must count as ready for that slot');
assert.strictEqual(equipmentDecisionPrimary.manualDecisionAction,'accept-current');
assert.strictEqual(equipmentDecisionPrimary.currentName,'Starter Rifle','accepting a piece must not rewrite the API-reported equipped item');

equipmentDecisionFaction.memberReadiness.profiles['990'].equipmentDecisions.primary={
  action:'replacement',itemName:'AK-47',updatedAt:new Date().toISOString()
};
equipmentDecisionRows=logic.memberRows(equipmentDecisionFaction,[],{procurementMode:'budget'});
equipmentDecisionPrimary=equipmentDecisionRows[0].buildAssessment.items.find(x=>x.slot==='primary');
assert.strictEqual(equipmentDecisionPrimary.route,'ISSUE','selected replacement already in faction stock must route to the vault');
assert.strictEqual(equipmentDecisionPrimary.suggestedName,'AK-47','manual replacement must become the exact suggested item');
const equipmentDecisionPlan=logic.acquisitionPlan(equipmentDecisionFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(equipmentDecisionPlan.assignments.some(x=>x.memberId==='990'&&x.slot==='primary'&&x.route==='ISSUE'&&x.item==='AK-47'&&x.manual===true),'manual replacement must allocate the exact chosen vault item');
assert(!equipmentDecisionPlan.assignments.some(x=>x.memberId==='990'&&x.slot==='primary'&&x.item!=='AK-47'),'manual replacement must not substitute another primary');

assert(userSourceValue.includes('function equipmentOverrideMenuHtml'),'Edit Data Override must open a structured equipment menu');
assert(userSourceValue.includes('Accept Equipped Item'),'equipment menu must allow accepting the exact equipped item');
assert(userSourceValue.includes('Use Selected Replacement'),'equipment menu must expose suggested replacement choices');
assert(userSourceValue.includes('Use Other Replacement'),'equipment menu must allow a plain-language manual replacement name');
assert(userSourceValue.includes('Use Automatic'),'equipment menu must allow clearing a slot decision');
assert(userSourceValue.includes('API/source equipment stays unchanged underneath.'),'equipment menu must explain source preservation');
assert(!userSourceValue.includes('Enter a PARTIAL JSON object'),'normal Edit Data Override workflow must not require JSON');
assert(!userSourceValue.includes('Manual override JSON is invalid'),'normal Edit Data Override workflow must not expose JSON parsing UX');

assert(userSourceValue.includes('function equipmentDecisionSummary'),'equipment overrides must have a plain-language audit summary');
assert(userSourceValue.includes('EQUIPMENT OVERRIDE'),'Members UI must visibly identify members with slot decisions');
assert(userSourceValue.includes("'Equipment Decisions'"),'Leadership export must include plain-language equipment decisions');

console.log('MM Faction Armory alpha.24.5 equipment-menu regressions: PASS');

assert(userSourceValue.includes('OBSIDIAN FORCE optional war-prep suggestions'),'member build message subject must frame the message as optional guidance');
assert(userSourceValue.includes('This is not an order, and you do not need to change anything if you are comfortable with your current setup.'),'member message must explicitly remove command ambiguity');
assert(userSourceValue.includes('OPTIONAL WAR-PREP SUGGESTIONS'),'member message section heading must be advisory, not TARGET BUILD');
assert(userSourceValue.includes('One option is to BORROW FROM VAULT'),'vault wording must remain a suggestion rather than an instruction');
assert(userSourceValue.includes('A possible replacement to consider'),'acquisition wording must remain advisory');
assert(userSourceValue.includes('If you want a more accurate recommendation, you can send your current readiness data whenever convenient.'),'estimated-data request must be opt-in');
assert(userSourceValue.includes('Use whatever is helpful and ignore anything that is not.'),'member message must close with clear member choice');
assert(!userSourceValue.includes("'TARGET BUILD'"),'member message must not use command-like TARGET BUILD heading');
assert(!userSourceValue.includes('Send your actual readiness data before any final vault borrowing or purchase.'),'member message must not command members to send data');
console.log('MM Faction Armory alpha.24.6 advisory-message regressions: PASS');

const stockControlFaction={
  current:{
    'medical|20':{category:'medical',itemId:'20',name:'First Aid Kit',availableCount:10,amountOwned:10,loanedCount:0},
    'drugs|x':{category:'drugs',itemId:'x',name:'Xanax',availableCount:2,amountOwned:2,loanedCount:0}
  },
  memberReadiness:{
    roster:{
      high:{memberId:'high',memberName:'High Scorer',level:40},
      medium:{memberId:'medium',memberName:'Medium Scorer',level:25},
      low:{memberId:'low',memberName:'Low Scorer',level:10}
    },
    profiles:{
      high:{stats:{strength:7500,defense:7500,speed:7500,dexterity:7500},equipment:{summary:'',items:[],emptyConfirmed:true},verifiedAt:new Date().toISOString()},
      medium:{stats:{strength:2500,defense:2500,speed:2500,dexterity:2500},equipment:{summary:'',items:[],emptyConfirmed:true},verifiedAt:new Date().toISOString()},
      low:{stats:{strength:500,defense:500,speed:500,dexterity:500},equipment:{summary:'',items:[],emptyConfirmed:true},verifiedAt:new Date().toISOString()}
    },
    settings:{staleHours:72}
  },
  warPlanning:{
    currentWar:{warId:'rw-1',opponentFactionId:'999',opponentFactionName:'Rivals'},
    opponent:{
      factionId:'999',factionName:'Rivals',fetchedAt:new Date().toISOString(),
      members:{
        a:{memberId:'a',memberName:'Weak Rival',estimatedTotal:1000},
        b:{memberId:'b',memberName:'Mid Rival',estimatedTotal:8000},
        c:{memberId:'c',memberName:'Strong Rival',estimatedTotal:20000}
      }
    },
    xanaxPolicy:{
      investmentPosture:'conserve',reasonableRatio:0.80,
      highThreshold:25000,mediumThreshold:5000,
      highCeiling:4,mediumCeiling:3,lowCeiling:2,
      memberOverrides:{}
    }
  },
  stockPlanning:{schema:1,minimumOverrides:{}},
  snapshots:[],events:[]
};
let stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
let xanaxRow=stockProposal.proposals.find(row=>row.item==='Xanax');
assert(xanaxRow&&!xanaxRow.dataRequired,'current rival estimates must activate the Xanax estimator');
assert.strictEqual(stockProposal.xanax.leadershipCeiling,9,'4/3/2 is a ceiling, not an automatic buy quantity');
assert.strictEqual(stockProposal.xanax.members.find(row=>row.memberId==='high').recommended,3,'high scorer should receive one Xanax per credible target up to the ceiling under CONSERVE');
assert.strictEqual(stockProposal.xanax.members.find(row=>row.memberId==='medium').recommended,2);
assert.strictEqual(stockProposal.xanax.members.find(row=>row.memberId==='low').recommended,1);
assert.strictEqual(stockProposal.xanax.recommendedTarget,6,'opponent-weighted Xanax target should be derived from member matchups');
assert.strictEqual(xanaxRow.current,2);
assert.strictEqual(xanaxRow.effectiveMin,6);
assert.strictEqual(xanaxRow.shortfall,4);

const fakKey=logic.minimumOverrideKey('war','medical','First Aid Kit');
stockControlFaction.stockPlanning.minimumOverrides[fakKey]={min:25,orderEnabled:true,updatedAt:new Date().toISOString()};
stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
let controlledFak=stockProposal.proposals.find(row=>row.item==='First Aid Kit');
assert.strictEqual(controlledFak.suggestedMin,30,'three-member FAK suggestion remains 10 per member');
assert.strictEqual(controlledFak.manualMin,25);
assert.strictEqual(controlledFak.effectiveMin,25);
assert.strictEqual(controlledFak.shortfall,15);
assert.strictEqual(controlledFak.status,'ORDER');
let controlledPlan=logic.acquisitionPlan(stockControlFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert.strictEqual(controlledPlan.list.find(row=>row.category==='provisions'&&row.item==='First Aid Kit')?.systemQty,15,'Acquire must derive FAK quantity from the edited effective minimum');

stockControlFaction.stockPlanning.minimumOverrides[fakKey].orderEnabled=false;
stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
controlledFak=stockProposal.proposals.find(row=>row.item==='First Aid Kit');
assert.strictEqual(controlledFak.status,'SHORT / HOLD');
assert(stockProposal.held.some(row=>row.item==='First Aid Kit'));
assert(!stockProposal.actionable.some(row=>row.item==='First Aid Kit'));
controlledPlan=logic.acquisitionPlan(stockControlFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert(!controlledPlan.list.some(row=>row.category==='provisions'&&row.item==='First Aid Kit'),'holding an item must remove that shortfall from Acquire without changing the minimum');

stockControlFaction.stockPlanning.minimumOverrides[fakKey].orderEnabled=true;
stockControlFaction.warPlanning.xanaxPolicy.memberOverrides.high=4;
stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
xanaxRow=stockProposal.proposals.find(row=>row.item==='Xanax');
assert.strictEqual(stockProposal.xanax.recommendedTarget,7,'member Xanax edit must recompute the total target without a copied total field');
assert.strictEqual(xanaxRow.shortfall,5,'member Xanax edit must immediately flow into stock shortfall');
controlledPlan=logic.acquisitionPlan(stockControlFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert.strictEqual(controlledPlan.list.find(row=>row.category==='provisions'&&row.item==='Xanax')?.systemQty,5,'member Xanax edit must immediately flow into Acquire');

delete stockControlFaction.warPlanning.xanaxPolicy.memberOverrides.high;
stockControlFaction.memberReadiness.profiles.medium.stats={strength:10000,defense:10000,speed:10000,dexterity:10000};
stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
assert.strictEqual(stockProposal.xanax.recommendedTarget,7,'internal member-stat edits must recompute matchup-weighted Xanax demand automatically');

const xanaxKey=logic.minimumOverrideKey('war','drugs','Xanax');
stockControlFaction.stockPlanning.minimumOverrides[xanaxKey]={min:3,orderEnabled:true,updatedAt:new Date().toISOString()};
stockProposal=logic.minimumProposal(stockControlFaction,{mode:'war',procurementMode:'budget'});
xanaxRow=stockProposal.proposals.find(row=>row.item==='Xanax');
assert.strictEqual(xanaxRow.suggestedMin,7,'manual minimum must preserve the live calculated Xanax suggestion for comparison');
assert.strictEqual(xanaxRow.effectiveMin,3);
assert.strictEqual(xanaxRow.shortfall,1);
controlledPlan=logic.acquisitionPlan(stockControlFaction,{mode:'war',procurementMode:'budget',budgetCap:15000000});
assert.strictEqual(controlledPlan.list.find(row=>row.category==='provisions'&&row.item==='Xanax')?.systemQty,1,'manual Xanax minimum must be the same source consumed by Acquire');

assert(userSourceValue.includes("apiRequest('/faction/wars',key)"),'Faction refresh must retrieve the official current ranked-war context');
assert(userSourceValue.includes("'/faction/'+encodeURIComponent(war.opponentFactionId)+'/members'"),'Armory must retrieve the current rival roster from the official faction endpoint');
assert(userSourceValue.includes('WAR_OPPONENT_INTEL_MAX_AGE_MS=6*60*60*1000'),'opponent estimates must have explicit bounded freshness');
assert(userSourceValue.includes('War Stock Control'),'Minimums must expose the live stock control surface');
assert(userSourceValue.includes('Xanax War Estimator'),'War mode must expose the rival-weighted Xanax estimator');
assert(userSourceValue.includes('Save Minimum'),'stock minimums must be directly editable');
assert(userSourceValue.includes('data-toggle-min-order'),'each minimum must expose an explicit order/hold control');
assert(userSourceValue.includes('HOLD / DO NOT ORDER'),'order/hold state must propagate through the control handler');
assert(userSourceValue.includes('Refresh Rival'),'operator must be able to refresh rival-dependent estimates');
assert(userSourceValue.includes('Save Xanax Policy'),'Xanax posture/thresholds/caps must be adjustable');
assert(userSourceValue.includes("xmlSheet('Xanax'"),'Leadership export must contain the current Xanax estimator');
assert(userSourceValue.includes("'Effective Min'"),'Leadership export must expose the effective minimum used by Acquire');
assert(userSourceValue.includes('Acquire uses the same effective minimum shown here.'),'UI must state the single-source dependency contract');
assert(!userSourceValue.includes('Final purchase remains automatic'),'final purchase must remain manual');
console.log('MM Faction Armory alpha.24.7 war-stock/Xanax dependency regressions: PASS');

const pricingPlanFixture={
  budgetCap:1000,
  list:[
    {category:'equipment',item:'Live Item',qty:3,systemQty:3,marketValue:900},
    {category:'equipment',item:'Reference Item',qty:4,systemQty:4,marketValue:50},
    {category:'provisions',item:'Unknown Item',qty:2,systemQty:2,marketValue:0}
  ]
};
const pricingQuotes={};
pricingQuotes[logic.acquisitionQuoteKey('equipment','Live Item')]={
  planningUnit:100,planningSource:'Bazaar',priceEvidence:'LIVE CACHED SOURCE',low:100,high:120,liveRange:true
};
pricingQuotes[logic.acquisitionQuoteKey('equipment','Reference Item')]={
  planningUnit:50,planningSource:'Torn Market Reference',priceEvidence:'TORN MARKET REFERENCE',low:50,high:50,liveRange:false
};
const reconciled=logic.reconcileAcquisitionPricing(pricingPlanFixture,pricingQuotes,350);
const liveRecon=reconciled.list.find(row=>row.item==='Live Item');
const refRecon=reconciled.list.find(row=>row.item==='Reference Item');
const unknownRecon=reconciled.list.find(row=>row.item==='Unknown Item');
assert.strictEqual(liveRecon.fundedQty,3,'live-priced line should consume the displayed planning price');
assert.strictEqual(liveRecon.fundedEstimatedValue,300);
assert.strictEqual(refRecon.fundedQty,1,'later line funding must use remaining budget on the same displayed price basis');
assert.strictEqual(refRecon.deferredQty,3);
assert.strictEqual(unknownRecon.fundedQty,0,'unpriced requirements must never be treated as budget-funded');
assert.strictEqual(unknownRecon.fundingStatus,'PRICE UNKNOWN');
assert.strictEqual(reconciled.fundedEstimatedValue,350);
assert.strictEqual(reconciled.fullPlannedKnownCost,500);
assert.strictEqual(reconciled.deferredEstimatedValue,150);
assert.strictEqual(reconciled.unpricedUnits,2);
assert.strictEqual(reconciled.remainingBudget,0);
assert(userSourceValue.includes('function acquisitionAccuracyPlan'),'screen/report/export/handoff must share one reconciled acquisition plan');
assert(userSourceValue.includes('const plan=acquisitionAccuracyPlan();'),'Acquire and leader paths must consume the reconciled plan');
assert(userSourceValue.includes('const acquisition=acquisitionAccuracyPlan();'),'Leadership export must consume the reconciled plan');
assert(userSourceValue.includes('PRICE UNRESOLVED — excluded from budget-funded estimate'),'leader snapshot must explicitly exclude unpriced rows from funded dollar totals');
assert(userSourceValue.includes('only fresh cached Bazaar / Item Market / overseas evidence is eligible as live planning evidence'),'leader snapshot must state fresh-source eligibility semantics');
assert(userSourceValue.includes('Stale cached sources are disclosed but excluded.'),'leader snapshot must disclose stale-source rejection');
assert(userSourceValue.includes('No fresh planning price resolved — excluded from budget-funded quantity until pricing is refreshed.'),'Acquire must fail closed when only stale/unpriced evidence exists');
assert(userSourceValue.includes("'Funding Status'"),'Leadership export must disclose each row funding status');
assert(userSourceValue.includes("'Price Evidence'"),'Leadership export must disclose price evidence quality');
console.log('MM Faction Armory alpha.24.8 acquisition-accuracy regressions: PASS');

const priceSourceStart=userSourceValue.indexOf('  function priceTimestampMs(value){');
const priceSourceEnd=userSourceValue.indexOf("\n  function handoffAcquisition(row,preferredSource='Best'){",priceSourceStart);
assert(priceSourceStart>=0&&priceSourceEnd>priceSourceStart,'acquisition price-source function block must be present');
const priceSourceBlock=userSourceValue.slice(priceSourceStart,priceSourceEnd);
const priceSnapshotFactory=new Function('num','sharedItemRecordByName','state','logic',
  'return (()=>{'+priceSourceBlock+'; return acquisitionSourceSnapshot;})();'
);
const numLocal=value=>{const v=Number(value);return Number.isFinite(v)?v:0;};
const nowPrice=Date.now();
const staleAt=new Date(nowPrice-20*60*1000).toISOString();
const freshAt=new Date(nowPrice-30*1000).toISOString();
const priceRecord={itemId:'900',marketPrice:200,fetchedAt:freshAt};
let priceState={
  businessRules:{maxListingAgeSec:180},
  procurement:{marketSnapshots:{'900':{
    fetchedAt:staleAt,
    itemMarket:{lowest:50},
    bazaar:{lowest:45}
  }}},
  marketIntel:{details:{'900':{organicListings:[
    {price:40,quantity:2,lastChecked:nowPrice-10*60*1000}
  ]}}},
  travelIntel:{
    sourceUpdatedAt:staleAt,lastSyncAt:staleAt,
    rows:[{itemId:'900',itemName:'Test Item',stock:5,shopCost:30,country:'Japan'}]
  }
};
let priceSnapshot=priceSnapshotFactory(numLocal,()=>priceRecord,priceState,logic)({item:'Test Item',marketValue:300});
assert.strictEqual(priceSnapshot.liveCandidates.length,0,'stale cached sources must not remain eligible live candidates');
assert.strictEqual(priceSnapshot.bestPlanning.source,'Torn Market Reference','stale cheap cached sources must not undercut a reference fallback');
assert.strictEqual(priceSnapshot.bestPlanning.price,200);
assert.strictEqual(priceSnapshot.staleSources.length,3,'Item Market, Bazaar and Overseas stale evidence must remain visible diagnostically');

priceState={
  ...priceState,
  procurement:{marketSnapshots:{'900':{
    fetchedAt:freshAt,
    itemMarket:{lowest:120},
    bazaar:{lowest:0,fetchedAt:staleAt}
  }}}
};
priceSnapshot=priceSnapshotFactory(numLocal,()=>priceRecord,priceState,logic)({item:'Test Item',marketValue:300});
assert.strictEqual(priceSnapshot.bestPlanning.source,'Item Market','fresh Item Market must remain eligible');
assert.strictEqual(priceSnapshot.bestPlanning.price,120,'stale Bazaar/Travel prices must not undercut fresh Item Market evidence');
assert(priceSnapshot.staleSources.some(source=>source.source==='Bazaar'));
assert(priceSnapshot.staleSources.some(source=>source.source==='Overseas'));
assert(userSourceValue.includes("Math.max(30,num(state?.businessRules?.maxListingAgeSec)||180)*1000"),'Armory market cache freshness must consume Acquisitions/business-rules max listing age');
assert(userSourceValue.includes('const travelMaxAgeMs=15*60*1000'),'Armory travel planning must match the Acquisitions stale cutoff');
assert(userSourceValue.includes("tile('STALE IGNORED'"),'Acquire must visibly disclose stale price evidence rejected from planning');
console.log('MM Faction Armory alpha.24.9 stale-price evidence regressions: PASS');

assert(userSourceValue.includes("tile('ARMORY REC',fmt(row.systemQty))"),'Acquire UI must label the automatic quantity as Armory recommendation');
assert(userSourceValue.includes("tile(row.manualQtyOverride!=null?'YOUR OVERRIDE':'PLANNED'"),'manual quantity must be labeled Your Override rather than cryptic planned/system wording');
assert(userSourceValue.includes("Use Armory '+fmt(row.systemQty)"),'reset control must state the Armory quantity being restored');
assert(userSourceValue.includes("' · your override '+fmt(row.qty)+' · Armory recommendation '+fmt(row.systemQty)"),'Leader snapshot must explain manual override versus Armory recommendation in plain wording');
assert(!userSourceValue.includes('manual planned qty (system '),'cryptic manual/system wording must be removed');
console.log('MM Faction Armory alpha.24.10 acquisition-wording regressions: PASS');

assert(userSourceValue.includes("// @version      8.0.0-alpha.26"),'userscript header must advance to alpha.26');
assert(userSourceValue.includes("const VERSION='8.0.0-alpha.26';"),'runtime version must advance to alpha.26');
assert(userSourceValue.includes("const MEMBER_REFRESH_MAX_AGE_MS=60*60*1000;"),'saved member private data must have an independent one-hour refresh target');
assert(userSourceValue.includes("function apiRequest(pathOrUrl,key,{fresh=false}={})"),'API wrapper must expose explicit fresh-request semantics');
assert(userSourceValue.includes("if(fresh)url.searchParams.set('timestamp',String(Math.floor(Date.now()/1000)));"),'fresh member reads must bypass Torn service cache with a unique timestamp parameter');
assert(userSourceValue.includes("apiRequest('/user/equipment',clean,{fresh})"),'member equipment refresh must use the fresh request path');
assert(userSourceValue.includes("fetchUserInventory(clean,{fresh})"),'member inventory refresh must use the same explicit fresh request path');
assert(userSourceValue.includes("lastPrivateRefreshAt:verifiedAt"),'successful member refresh must record its local fetch time independently');
assert(userSourceValue.includes("sourceTimestamp:equipmentSourceTimestamp||null"),'equipment provenance must retain an API source timestamp when Torn supplies one');
assert(userSourceValue.includes("profile?.lastPrivateRefreshAt||profile?.fetchedAt||profile?.verifiedAt"),'automatic refresh cadence must prefer explicit local fetch provenance while preserving legacy profiles');
assert(userSourceValue.includes(">Refresh All Saved Members</button>"),'Members UI must expose one-click refresh of every saved member');
assert(userSourceValue.includes("Refreshing every saved member with fresh Torn API requests"),'refresh-all status must disclose fresh-request behavior');
assert(!userSourceValue.includes("const staleHours=Math.max(1,Number(state?.factionInventory?.memberReadiness?.settings?.staleHours||72));\n    const cutoff=Date.now()-staleHours*3600000;"),'automatic saved-member refresh must no longer inherit the 72-hour readiness threshold');
console.log('MM Faction Armory alpha.24.11 member-refresh freshness regressions: PASS');

const pulseNow=Date.parse('2026-10-07T01:00:00Z');
const pulseState={
  marketIntel:{
    marketPulse:{
      schema:1,
      updatedAt:pulseNow,
      settings:{ttlMs:45*60*1000},
      items:{
        '900':{
          itemId:'900',itemName:'Pulse Test',tier:'proven',
          floorPrice:123456,marketDepth:12,totalQty:48,
          observedEventsPerHour:1.5,observedUnitsPerHour:7.25,turnoverPerHour:895056,
          liquidityScore:82,confidencePct:76,trendPct:-3.5,
          sourceTimestamp:pulseNow-30000,fetchedAt:pulseNow-10000,upstreamCacheDelayMs:30000
        }
      }
    }
  }
};
let pulseEvidence=logic.marketPulseEvidence(pulseState,'900',pulseNow);
assert.strictEqual(pulseEvidence.available,true,'Armory must read current Acquisitions Market Pulse state by item ID');
assert.strictEqual(pulseEvidence.usable,true,'fresh sufficiently confident Pulse evidence must be usable as advisory context');
assert.strictEqual(pulseEvidence.status,'READY');
assert.strictEqual(pulseEvidence.tier,'PROVEN');
assert.strictEqual(pulseEvidence.floorPrice,123456);
assert.strictEqual(pulseEvidence.marketDepth,12);
assert.strictEqual(pulseEvidence.totalQty,48);
assert.strictEqual(pulseEvidence.liquidityScore,82);
assert.strictEqual(pulseEvidence.confidencePct,76);
assert.strictEqual(pulseEvidence.trendPct,-3.5);
pulseEvidence=logic.marketPulseEvidence(pulseState,'900',pulseNow+46*60*1000);
assert.strictEqual(pulseEvidence.status,'STALE','Armory must honor the producer TTL and fail Pulse context stale');
assert.strictEqual(pulseEvidence.usable,false,'stale Pulse evidence must never be usable current context');
pulseState.marketIntel.marketPulse.items['900'].fetchedAt=pulseNow;
pulseState.marketIntel.marketPulse.items['900'].confidencePct=20;
pulseEvidence=logic.marketPulseEvidence(pulseState,'900',pulseNow);
assert.strictEqual(pulseEvidence.status,'LOW CONFIDENCE');
assert.strictEqual(pulseEvidence.usable,false,'low-confidence Pulse evidence must remain diagnostic only');
const unsupportedPulse=JSON.parse(JSON.stringify(pulseState));
unsupportedPulse.marketIntel.marketPulse.schema=2;
pulseEvidence=logic.marketPulseEvidence(unsupportedPulse,'900',pulseNow);
assert.strictEqual(pulseEvidence.status,'UNSUPPORTED SCHEMA','unknown producer schema must fail closed');
assert.strictEqual(pulseEvidence.available,false);
assert(userSourceValue.includes("const marketPulse=logic.marketPulseEvidence(state,itemId,now);"),'Armory source adapter must consume shared Market Pulse state');
assert(userSourceValue.includes("['faction','market','core']"),'Armory must refresh shared state when Acquisitions updates the market domain');
assert(userSourceValue.includes("tile('MARKET PULSE'"),'Acquire must surface Market Pulse context');
assert(userSourceValue.includes("'Pulse Liquidity'"),'Leadership export must carry Market Pulse metrics');
assert(userSourceValue.includes('Market Pulse is Acquisitions-owned advisory context only.'),'leader report must disclose Market Pulse advisory scope');
assert(userSourceValue.includes('privacy-policy@98519cd5b5ffa5ea3747f7e50198569bd8cb22d9/modular-suite/faction-armory/MM_Faction_Armory.logic.js'),'installed alpha.25 must pin the immutable commit containing marketPulseEvidence');
assert(userSourceValue.includes('it never substitutes for the live-price rule or changes planned quantity.'),'Acquire must disclose that Pulse does not control pricing or quantity');
assert(!userSourceValue.includes('MMTornMarketPulse.createEngine'),'Faction Armory must not instantiate the Acquisitions Market Pulse producer');
assert(!userSourceValue.includes('marketPulseEngine'),'Faction Armory must not add a duplicate Market Pulse engine');
console.log('MM Faction Armory alpha.25 Market Pulse consumer regressions: PASS');

const absentPulse=logic.marketPulseEvidence({},'900',pulseNow);
assert.strictEqual(absentPulse.available,false,'Faction Armory must remain functional when no Market Pulse producer/state exists');
assert.strictEqual(absentPulse.usable,false,'missing optional Pulse must not become actionable evidence');
assert.strictEqual(absentPulse.status,'NO PULSE','missing optional Pulse must fail closed without creating a dependency');
assert(!userSourceValue.includes('MARKET_PULSE_DEMAND_'),'alpha.26 must not publish an Armory-specific Market Pulse demand contract');
assert(!userSourceValue.includes('marketPulseDemand'),'alpha.26 must not write/read an Armory demand hint for an external producer');
assert(!userSourceValue.includes('publishMarketPulseDemand'),'alpha.26 must not contain the retired outward demand publisher');
assert(!userSourceValue.includes('scheduleMarketPulseDemandPublish'),'alpha.26 must not schedule outward demand publication');
assert(!userSourceValue.includes("updateDomainState('market',draft=>"),'Faction Armory must not write shared market state');
assert(!userSourceValue.includes('MMTornMarketPulse.createEngine'),'Faction Armory must not instantiate a Market Pulse producer');
assert(userSourceValue.includes('const marketPulse=logic.marketPulseEvidence(state,itemId,now);'),'optional read-only Market Pulse consumption must remain available');
console.log('MM Faction Armory alpha.26 isolation regressions: PASS');








assert(userSourceValue.includes("async function setMemberManualOverrides"),'Members UI must provide a persistent manual data override write path');
assert(userSourceValue.includes("data-edit-override"),'every member must expose manual data override editing');
assert(userSourceValue.includes("data-clear-override"),'manual override must be individually clearable');
assert(userSourceValue.includes("row.readinessStatus!=='WAR READY'?'<button data-war-ready="),'every non-WAR-READY member must expose an individual War Ready decision');
assert(!userSourceValue.includes("Member is not currently eligible for War Ready approval."),'manual War Ready must not retain the automatic eligibility gate');
assert(userSourceValue.includes('API/source equipment stays unchanged underneath.'),'equipment override UX must state source preservation');
assert(userSourceValue.includes("'Override JSON'"),'leadership export must disclose manual overrides');



