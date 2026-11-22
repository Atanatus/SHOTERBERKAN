import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Sim from '../js/simulation-core.js';

// Independent, frozen V44 gameplay transitions. Do not invoke the new core
// from these reference functions: parity must detect formula and state drift.
const legacy = {
  heal(s) {
    if(s.shieldIntegrity<5) {s.shieldIntegrity++;return {healed:true,points:0};}
    const bonus=150;s.score+=bonus;return {healed:false,points:bonus};
  },
  tempo(s,kind) {
    if(kind==='accel'){s.tempoMult=1.45;s.tempoTimer=360;s.score+=60;}
    else if(kind==='slow'){s.tempoMult=0.55;s.tempoTimer=300;s.score+=60;}
    else throw Error('Invalid reference kind');
    return 60;
  },
  supercharger(s,i,level) {
    const startLvl=Math.max(2,level+1);
    s.slots[i]={level:startLvl,kind:'normal',fruit:null,isBomb:false,isSkull:false,isSuperballNode:false,scaleAnim:1.65};
    const pts=startLvl*45;s.score+=pts;return {level:startLvl,points:pts};
  },
  placement(s,i,level,isFruit,safeFruit) {
    s.slots[i]={level,kind:isFruit?'fruit':'normal',fruit:safeFruit,isBomb:false,isSkull:false,isSuperballNode:false,scaleAnim:1.45};
    s.combo=0;const pts=level*15;s.score+=pts;return pts;
  },
  failed(s) {s.combo=0;s.shieldIntegrity--;return s.shieldIntegrity;},
  core(s,level) {
    const bonusMult=1;const pts=Math.round((2500+level*250)*bonusMult);
    s.score+=pts;s.centerLevel=null;return pts;
  },
  merge(s,index,newLevel) {
    const level=Math.min(10,newLevel);s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);
    s.slots[index]={level,kind:'normal',fruit:null,scaleAnim:1.65};
    const basePts=Math.round(Math.pow(1.65,level)*22*Math.min(s.combo,8))+(s.combo>=3?25*Math.min(s.combo,8):0);
    const points=Math.round(basePts*(s.shotTempoBonus?1.4:1));s.score+=points;
    return {level,points};
  },
  chain(slots,center,lanes){
    const neighbors=Array.from({length:9},(_,i)=>i).filter(i=>i%lanes===center%lanes);
    const at=neighbors.indexOf(center),mergedNode=slots[center];
    return [neighbors[(at-1+neighbors.length)%neighbors.length],neighbors[(at+1)%neighbors.length]]
      .find(i=>i!==center&&piecesEqual(slots[i],mergedNode));
  }
};
function isFigure(s){return Boolean(s&&!s.isBomb&&!s.isSkull&&!s.isSuperballNode);}
function piecesEqual(a,b){
 if(!isFigure(a)||!isFigure(b))return false;
 if(a.kind==='fruit'||b.kind==='fruit')return a.kind==='fruit'&&b.kind==='fruit'&&a.fruit&&b.fruit&&a.fruit.id===b.fruit.id;
 return a.level===b.level;
}
function state(seed=0){
 return {slots:Array.from({length:9},(_,i)=>i%4===0?null:{level:i%10+1,kind:'normal'}),
   combo:seed%19,bestCombo:seed%11,shieldIntegrity:seed%7,score:seed*73,
   centerLevel:seed%2?10:null,tempoMult:1,tempoTimer:0,shotTempoBonus:Boolean(seed%2)};
}
function compare(transformOld,transformNew,source){
 const a=structuredClone(source),b=structuredClone(source);
 const before=JSON.stringify(source);
 const oldResult=transformOld(a),newResult=transformNew(b);
 assert.deepEqual(newResult,oldResult);
 assert.deepEqual(b,a);
 assert.equal(JSON.stringify(source),before,'source fixture mutated');
}

test('healing and max-shield score preserve V44 state for 3,500 cases',()=>{
 for(let i=0;i<3500;i++)compare(s=>legacy.heal(s),s=>Sim.applyHealImpact(s,5),state(i));
});
test('both tempo effects preserve duration, multiplier and points for 2,000 cases',()=>{
 for(let i=0;i<1000;i++)for(const kind of ['accel','slow'])
   compare(s=>legacy.tempo(s,kind),s=>Sim.applyTempoImpact(s,kind),state(i));
 assert.throws(()=>Sim.applyTempoImpact(state(), 'unknown'),RangeError);
});
test('piece placements, supercharger and failed impacts preserve V44 for 8,400 cases',()=>{
 let cases=0;
 for(let i=0;i<2800;i++){
   const index=i%9, level=i%14+1,isFruit=i%2===0;
   const fruit=isFruit?{id:i%4===0?'cereza':'limon',color:'#ef0'}:null;
   compare(s=>legacy.placement(s,index,level,isFruit,fruit),s=>Sim.applyPiecePlacement(s,index,level,isFruit,fruit),state(i));cases++;
   compare(s=>legacy.supercharger(s,index,level),s=>Sim.applySuperchargerPlacement(s,index,level),state(i));cases++;
   compare(s=>legacy.failed(s),s=>Sim.applyFailedImpact(s),state(i));cases++;
 }
 assert.equal(cases,8400);
});
test('core detonation score and null core preserve V44 for 1,500 cases',()=>{
 for(let i=0;i<1500;i++)compare(s=>legacy.core(s,i%30),s=>Sim.applyCoreDetonation(s,i%30),state(i));
});
test('all combo plateaus, tempo bonus and level caps preserve V44 for 20,000+ cases',()=>{
 let cases=0;
 for(let i=0;i<180;i++)for(let combo=0;combo<22;combo++)for(const tempo of [false,true])for(const slot of [0,4,8]) {
   const s=state(i);s.combo=combo;s.bestCombo=combo-2;s.shotTempoBonus=tempo;
   compare(x=>legacy.merge(x,slot,i),x=>Sim.applyChainMerge(x,slot,i,10),s);cases++;
 }
 assert.equal(cases,23760);
});
test('chain neighbor priority preserves V44 across 24,000+ boards and two/three lanes',()=>{
 const pieceTypes=[null,{level:1,kind:'normal'},{level:2,kind:'normal'},
   {level:3,kind:'normal'},{kind:'fruit',level:1,fruit:{id:'cereza'}},
   {kind:'fruit',level:1,fruit:{id:'limon'}},{level:0,isBomb:true},
   {level:1,isSkull:true},{level:1,isSuperballNode:true}];
 let cases=0;
 for(let seed=0;seed<1400;seed++) {
   const slots=Array.from({length:9},(_,i)=>pieceTypes[(seed*7+i*13+Math.floor(seed/9)*i)%pieceTypes.length]);
   for(let lanes of [2,3])for(let center=0;center<9;center++){
     assert.equal(Sim.findChainNeighbor(slots,center,lanes),legacy.chain(slots,center,lanes));cases++;
   }
 }
 assert.equal(cases,25200);
});
test('browser production delegates every protected scoring transition to shared code',()=>{
 const src=readFileSync(new URL('../js/game.js',import.meta.url),'utf8');
 for(const name of ['applyHealImpact','applyTempoImpact','applySuperchargerPlacement',
   'applyPiecePlacement','applyFailedImpact','applyCoreDetonation','applyChainMerge','findChainNeighbor'])
   assert.match(src,new RegExp('FrutiDrySimulation\\.'+name+'\\('),name);
 for(const formula of ['Math.pow(1.65,newLevel)','projLevel * 15','startLvl * 45'])
   assert(!src.includes(formula),'duplicate score formula in game.js: '+formula);
});
