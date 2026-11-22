import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Sim from '../js/simulation-core.js';
import {v43Board,v43Ammo,v43Sweep} from './fixtures/v43-gameplay-reference.mjs';

const oldBoard=v43Board();
const fruitCatalog=[{id:'cereza',color:'#f14'}, {id:'limon',color:'#fd4'}, {id:'fresa',color:'#a12'}, {id:'naranja',color:'#fa7'}];
const seeds=[1,2,31,2026,24681357,123456789,2147483647];
function fixtureState(seed,caseNo){
 const rng=Sim.createPRNG(seed);
 const slots=[];
 for(let i=0;i<9;i++){
  const kind=(i*7+caseNo*11+seed%5)%12;
  if(kind<2) slots.push(null);
  else if(kind===2) slots.push({level:0,kind:'normal',isBomb:true});
  else if(kind===3) slots.push({level:1,kind:'normal',isSkull:true});
  else if(kind===4) slots.push({level:1,kind:'normal',isSuperballNode:true});
  else if(kind<8) slots.push({level:1,kind:'fruit',fruit:{...fruitCatalog[(i+caseNo)%4]}});
  else slots.push({level:1+(i+caseNo)%12,kind:'normal'});
 }
 const nextPiece = caseNo%3===0?{level:1,kind:'heal',fruit:null}:
   caseNo%3===1?{level:3,kind:'normal',fruit:null}:
   {level:1,kind:'fruit',fruit:{...fruitCatalog[caseNo%4]}};
 return {rng,slots,nextPiece,shieldIntegrity:caseNo%6,shotsSinceSpecial:caseNo%7,
   healDrought:caseNo%8,milestoneIndex:caseNo%7,tempoTimer:caseNo%4,centerLevel:caseNo%5===0?10:null};
}
test('predicates and fusion rules match frozen V43 across special pieces',()=>{
 const pieces=[null, {level:1,kind:'normal'}, {level:2,kind:'normal'},
   {level:1,kind:'fruit',fruit:{id:'cereza'}},{level:1,kind:'fruit',fruit:{id:'limon'}},
   {level:0,isBomb:true},{level:1,isSkull:true},{level:1,isSuperballNode:true},
   {level:1,kind:'heal'}, {level:7,kind:'normal'}];
 for(const a of pieces){
  assert.equal(Sim.isBoardFigure(a),oldBoard.isBoardFigure(a));
  assert.equal(Sim.isTargetFruit(a),oldBoard.isTargetFruit(a));
  for(const b of pieces) assert.equal(Boolean(Sim.arePiecesEqualForMerge(a,b)),Boolean(oldBoard.arePiecesEqualForMerge(a,b)));
 }
 const levels=[null,undefined,0,1,4,10,12];
 for(const level of levels) for(const seed of seeds){
   const slots=fixtureState(seed,2).slots;
   // v43Board.getHighestBoardLevel closes over globals, so compare its logic here explicitly.
   let maxLvl=1;for(const slot of slots)if(oldBoard.isBoardFigure(slot)&&slot.level>maxLvl)maxLvl=slot.level;
   if(level&&level>maxLvl)maxLvl=level;
   assert.equal(Sim.getHighestBoardLevel(slots,level),maxLvl);
 }
});

test('8,400 ammunition decisions preserve V43 result, state counters and RNG calls',()=>{
 let trials=0;
 for(const seed of seeds)for(let caseNo=0;caseNo<24;caseNo++){
   const a=fixtureState(seed,caseNo), b=fixtureState(seed,caseNo);
   // Deliberately vary state as the engine would after scoring/impacts.
   for(let step=0;step<50;step++){
     const old=v43Ammo(a),actual=Sim.nextRandomPiece(b,10,5);
     assert.deepEqual(actual,old,`seed=${seed} case=${caseNo} step=${step}`);
     assert.deepEqual(a.rng.inspect(),b.rng.inspect(),'different RNG consumption');
     assert.equal(a.shotsSinceSpecial,b.shotsSinceSpecial);
     assert.equal(a.healDrought,b.healDrought);
     a.nextPiece=old;b.nextPiece=actual;
     if(step%11===10){
       a.shieldIntegrity=b.shieldIntegrity=(caseNo+step)%6;
       a.milestoneIndex=b.milestoneIndex=(caseNo+step)%7;
       a.tempoTimer=b.tempoTimer=step%3;
     }
     trials++;
   }
 }
 assert.equal(trials,8400);
});

const worlds=[
 {width:320,cx:160,cy:314,trackHalfSpan:129,trackHeight:81,slotRadius:14,coreTargetRadius:19,numSlots:9},
 {width:390,cx:195,cy:407,trackHalfSpan:161,trackHeight:105,slotRadius:17.55,coreTargetRadius:22,numSlots:9},
 {width:844,cx:422,cy:345,trackHalfSpan:395,trackHeight:66,slotRadius:27,numSlots:9},
 {width:1366,cx:683,cy:356,trackHalfSpan:649,trackHeight:92,slotRadius:30,coreTargetRadius:42,numSlots:9}
];
const angles=[-1.27,-.96,-.42,-.07,0,.07,.42,.96,1.27];
const initial=(w,angle)=>({x:w.cx,y:w.cy+Math.max(100,w.trackHeight*2.6),
  vx:Math.sin(angle)*Math.max(12,Math.min(27,w.width*.041)),vy:-Math.cos(angle)*Math.max(12,Math.min(27,w.width*.041))});

test('thousands of projectile frames and every FX callback exactly match V43',()=>{
 let frames=0,hits=0,bounces=0;
 for(const w of worlds)for(let laneMode=0;laneMode<4;laneMode++)for(const angle of angles){
   const route=Sim.generateProceduralRoute(24681357+laneMode,laneMode);
   const world={...w,routeParams:{...route,mode:laneMode},centerLevel:angle===0?10:null};
   const a=initial(w,angle),b={...a},pa=[],pb=[];
   for(let n=0;n<90;n++){
     const phase=(n*0.013+laneMode*.17)%1;
     const old=v43Sweep(a,phase,world,(p)=>pa.push([p.x,p.y,p.vx,p.vy]));
     const actual=Sim.advanceProjectile(b,phase,world,(p)=>pb.push([p.x,p.y,p.vx,p.vy]));
     assert.deepEqual(actual,old,`world=${w.width} route=${laneMode} angle=${angle} frame=${n}`);
     assert.deepEqual(b,a,'projectile diverged');
     frames++;
     if(old){hits++;break;}
     if(a.vx!==initial(w,angle).vx) bounces++;
   }
   assert.deepEqual(pb,pa,'different positions on FX observer events');
 }
 assert(frames>400 && hits>0 && bounces>0,{frames,hits,bounces});
 console.log(`V44 trajectory parity: ${frames} frames, ${hits} impacts, ${bounces} bounce frames`);
});

test('explicit narrow-phase edge cases match V43 including tangent and zero-length',()=>{
 // Intersection source is frozen in the independent V43 sweep fixture.
 const cases=[
  [-10,0,10,0,0,0,5],[-10,5,10,5,0,0,5],[-10,6,10,6,0,0,5],
  [0,0,0,0,0,0,5],[5,0,5,0,0,0,5],[-100,0,100,0,0,0,10],
  [0,0,0,0,1,1,0],[0,0,0,0,100,100,5]
 ];
 const reference=(a,b,c,d,x,y,r)=>{
   const dx=c-a,dy=d-b,fx=a-x,fy=b-y,k=fx*fx+fy*fy-r*r;
   if(k<=0)return 0;const aa=dx*dx+dy*dy;if(aa<1e-9)return Infinity;
   const bb=fx*dx+fy*dy,D=bb*bb-aa*k;if(D<0)return Infinity;
   const t=(-bb-Math.sqrt(D))/aa;return t>=0&&t<=1?t:Infinity;
 };
 for(const values of cases)assert.equal(Sim.intersection(...values),reference(...values));
});

test('core runs without DOM, Canvas, audio, or global game state',()=>{
 assert(Object.isFrozen(Sim));
 const w={...worlds[0],routeParams:Sim.generateProceduralRoute(99,0),centerLevel:null};
 const p={x:w.cx,y:w.cy+180,vx:0,vy:-20};
 assert.doesNotThrow(()=>Sim.advanceProjectile(p,0,w));
 assert.equal(typeof document,'undefined');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(html.indexOf('src="js/simulation-core.js"')<html.indexOf('src="js/game.js"'));
});

test('production gameplay calls only the shared implementation for ammo and sweeps',()=>{
 const source=readFileSync(new URL('../js/game.js',import.meta.url),'utf8');
 assert.match(source,/return FrutiDrySimulation\.nextRandomPiece\(state,TARGET_CORE_LEVEL,MAX_SHIELD\)/);
 assert.match(source,/return FrutiDrySimulation\.advanceProjectile\(p,phase,simulationWorld\(\),trackSimulationShot\)/);
 assert.match(source,/if\(p===state\.projectile\)trackShotFX\(p\)/);
});
