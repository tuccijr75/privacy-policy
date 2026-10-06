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
assert.strictEqual(readyRows[0].readinessStatus,'READY FOR REVIEW','new member data must invalidate the prior approval until reviewed again');

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
assert.strictEqual(warXanax.recommendedMin,60,'war Xanax target should provision 3 per member');


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
assert(!acquisition.list.some(row=>row.category==='provisions'),'War acquisition must defer routine minimum-stock provisions until Peace mode');

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
assert(userSource.includes("const VERSION='8.0.0-alpha.24.1';"));
assert(!userSource.includes('raw.githubusercontent.com'),'candidate must not retain the obsolete raw.githubusercontent.com delivery/runtime channel');
assert(userSource.includes('https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@9af1c84f189141be77ef0d2c86d86513db5978ed/modular-suite/core/MM_Torn_Core.js'),'Core @require must be immutable full-SHA jsDelivr');
assert(userSource.includes('https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@9109ad4eff4ff9fc2ac688018b8fdc4e014312bc/modular-suite/faction-armory/MM_Faction_Armory.logic.js'),'Faction logic @require must be immutable full-SHA jsDelivr');
assert(userSource.includes('async function autoRefreshArmory'));
assert(userSource.includes('AUTO_CHECK_MS=5*60*1000'));
assert(userSource.includes('AUTO_MEMBER_BATCH=2'));
assert(userSource.includes('if(!vaultSession?.key)return []'));
assert(userSource.includes('nextUsefulRefreshAt'));
console.log('MM Faction Armory automation regression: PASS');

const userSource2=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource2.includes("const VERSION='8.0.0-alpha.24.1';"));
assert(userSource2.includes('function staleSavedMemberCount'));
assert(userSource2.includes('save a faction API key to enable automatic refresh'));
assert(userSource2.includes('unlock the member-key vault during an Armory session'));
assert(userSource2.includes('Not saved — cached faction data cannot refresh automatically.'));
console.log('MM Faction Armory automation-blocker UX regression: PASS');

const userSource3=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource3.includes("const VERSION='8.0.0-alpha.24.1';"));
assert(userSource3.includes('mm-fa-unlock-vault'));
assert(userSource3.includes('Member-key vault: '));
assert(userSource3.includes('automatic stale-profile refresh enabled for this session'));
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
assert(userSourceValue.includes("const VERSION='8.0.0-alpha.24.1';"));
assert(userSourceValue.includes('MM_Faction_Armory.logic.js'));
assert(userSourceValue.includes('saved member API key'));
assert(userSourceValue.includes('This is the number of saved member API keys, not faction members.'));
assert(userSourceValue.includes('Find Best Source'));
assert(userSourceValue.includes('data-armory-acquire'));
assert(userSourceValue.includes("type:'armory-acquisition-request'"));
assert(userSourceValue.includes('function setMemberWarReady'));
assert(userSourceValue.includes('Approve / War Ready'));
assert(userSourceValue.includes('Reopen Review'));
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
assert(userSourceValue.includes("isWar?'FACTION ARMORY WAR ACQUISITION REPORT':'FACTION ARMORY PEACE MINIMUMS REPORT'"),'leader report title must follow War/Peace scope');
assert(userSourceValue.includes("const memberNeeds=isWar"),'member-build needs must be War-only in the leader report');
assert(userSourceValue.includes("const minNeeds=isWar?[]"),'minimum-stock section must be Peace-only');
assert(userSourceValue.includes('Routine minimum-stock replenishment is deferred until Peace mode.'),'War report must explicitly defer minimums');
assert(userSourceValue.includes('Member build/equipment gaps are deferred until War mode.'),'Peace report must explicitly defer member equipment');
assert(userSourceValue.includes("'WAR ACQUISITION LIST / PRICE RANGE':'PEACE MINIMUM REPLENISHMENT / PRICE RANGE'"),'combined list label must expose mode scope');
assert(userSourceValue.includes("'PLANNED WAR ACQUISITION ESTIMATE':'PLANNED PEACE MINIMUM REPLENISHMENT ESTIMATE'"),'planning estimate total must expose mode scope');
assert(userSourceValue.includes("subject:'Faction Armory '+stockMode.toUpperCase()+' acquisition report'"),'leader message subject must expose active mode');
assert(userSourceValue.includes("leaderBaseLabel+(stockMode==='war'?' · War Needs':' · Peace / Minimums')"),'leader button must expose the active report scope');
assert((userSourceValue.match(/data-stock-mode="war"/g)||[]).length>=2,'War/Peace selection must be available on Acquire as well as Minimums');
assert(userSourceValue.includes('function leaderAcquisitionReport'),'leader acquisition report must be generated from live Armory state');
assert(userSourceValue.includes('PLANNED WAR ACQUISITION ESTIMATE'),'leader report must expose a best-source planning estimate instead of using the maximum cross-source price as the estimate');
assert(userSourceValue.includes('PRICE RANGE'),'Acquire rows must expose low/high price estimates');
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
assert(userSourceValue.includes('planningUnit=num(live.bestPlanning?.price)||num(row?.marketValue)'),'leader planning estimate must use the best current planning source with Armory reference fallback');
assert(userSourceValue.includes('Cross-source diagnostic range:'),'wide source range must be diagnostic rather than the leader-facing estimate');
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
assert(userSourceValue.includes('Manager Minimums Proposal'),'Minimums must present the calculated values as the manager proposal');
assert(userSourceValue.includes('These are Inventory Manager numbers for Leadership approval'),'Leadership must approve/adjust proposed quantities rather than invent them');
assert(userSourceValue.includes("xmlSheet('Open Inputs'"),'Leadership workbook must include unresolved proposal inputs');
assert.strictEqual((userSourceValue.match(/function buildsHtml\(/g)||[]).length,1,'Quick Build must remain the single normal Builds renderer');
assert.strictEqual((userSourceValue.match(/function advancedBuildsHtml\(/g)||[]).length,1,'detailed build renderer must exist once');
console.log('MM Faction Armory alpha.24 build/minimums regressions: PASS');
