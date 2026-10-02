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
assert.strictEqual(profile.bias,'damage');

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

const build=logic.compareMemberBuild(rows[0],factionInventory);
const primary=build.items.find(x=>x.slot==='primary');
assert(primary);
assert.strictEqual(primary.decision,'KEEP','must never recommend weaker faction primary');

const missingMember={
  memberId:'101',
  memberName:'Missing Gear',
  stats:{strength:10,defense:10,speed:10,dexterity:10},
  profile:{stats:{strength:10,defense:10,speed:10,dexterity:10},equipment:{items:[]}}
};
const missingBuild=logic.compareMemberBuild(missingMember,factionInventory);
assert.strictEqual(
  missingBuild.items.find(x=>x.slot==='primary').decision,
  'REVIEW CURRENT GEAR',
  'unknown current gear must not be treated as an upgrade authorization'
);

const twentyRoster={};
for(let i=1;i<=20;i++)twentyRoster[String(i)]={memberId:String(i),memberName:'M'+i};
const minimums=logic.minimumProposal({
  current:factionInventory.current,
  memberReadiness:{roster:twentyRoster},
  snapshots:[],
  events:[]
});
assert.strictEqual(minimums.poolMin,7);
assert.strictEqual(minimums.poolMax,11);
const primaryMin=minimums.proposals.find(x=>x.slot==='primary');
assert(primaryMin);
assert.strictEqual(primaryMin.recommendedMin,7);
assert.strictEqual(primaryMin.recommendedMax,11);

const faks=minimums.proposals.find(x=>x.item==='First Aid Kit');
assert(faks);
assert.strictEqual(faks.recommendedMin,20,'critical medical reserve should include one per member with no observed depletion');


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