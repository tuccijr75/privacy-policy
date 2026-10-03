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
assert.strictEqual(rows[0].readinessStatus,'READY FOR REVIEW');

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
},{mode:'war',participants:20});
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
},{mode:'war',participants:20});
assert(acquisition.list.some(row=>row.category==='equipment'),'acquisition plan must contain named equipment requirements');
assert(acquisition.list.some(row=>row.category==='provisions'),'acquisition plan must contain provision requirements');

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
assert(userSource.includes("const VERSION='8.0.0-alpha.17';"));
assert(userSource.includes('async function autoRefreshArmory'));
assert(userSource.includes('AUTO_CHECK_MS=5*60*1000'));
assert(userSource.includes('AUTO_MEMBER_BATCH=2'));
assert(userSource.includes('if(!vaultSession?.key)return []'));
assert(userSource.includes('nextUsefulRefreshAt'));
console.log('MM Faction Armory automation regression: PASS');

const userSource2=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource2.includes("const VERSION='8.0.0-alpha.17';"));
assert(userSource2.includes('function staleSavedMemberCount'));
assert(userSource2.includes('save a faction API key to enable automatic refresh'));
assert(userSource2.includes('unlock the member-key vault during an Armory session'));
assert(userSource2.includes('Not saved — cached faction data cannot refresh automatically.'));
console.log('MM Faction Armory automation-blocker UX regression: PASS');

const userSource3=fs.readFileSync(__dirname+'/MM_Faction_Armory.user.js','utf8');
assert(userSource3.includes("const VERSION='8.0.0-alpha.17';"));
assert(userSource3.includes('mm-fa-unlock-vault'));
assert(userSource3.includes('Member-key vault: '));
assert(userSource3.includes('automatic stale-profile refresh enabled for this session'));
assert(userSource3.includes('setTimeout(()=>autoRefreshArmory({forceFaction:false}),50)'));
console.log('MM Faction Armory explicit vault-unlock automation regression: PASS');


const balancedProfile=logic.battleProfile({strength:100,defense:100,speed:100,dexterity:100});
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
assert(userSourceValue.includes("const VERSION='8.0.0-alpha.17';"));
assert(userSourceValue.includes('MM_Faction_Armory.logic.js?v=8.0.0-alpha.2'));
assert(userSourceValue.includes('saved member API key'));
assert(userSourceValue.includes('This is the number of saved member API keys, not faction members.'));
assert(userSourceValue.includes('Find Best Source'));
assert(userSourceValue.includes('data-armory-acquire'));
assert(userSourceValue.includes("type:'armory-acquisition-request'"));
console.log('MM Faction Armory acquisition handoff regression: PASS');
