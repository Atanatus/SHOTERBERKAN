// Frozen V43 algorithms, copied verbatim for parity testing of V44 extraction.
// Do not import FrutiDrySimulation here: this file is the independent baseline.
// Assertions compare both results and PRNG call order.
export function v43Board(){
function isBoardFigure(s) {
  return Boolean(s && !s.isBomb && !s.isSkull && !s.isSuperballNode);
}

function isTargetFruit(s) {
  return Boolean(isBoardFigure(s) && s.kind === 'fruit' && s.fruit);
}

function arePiecesEqualForMerge(a, b) {
  if (!isBoardFigure(a) || !isBoardFigure(b)) return false;
  if (a.kind === 'fruit' || b.kind === 'fruit') {
    return a.kind === 'fruit' && b.kind === 'fruit' && a.fruit && b.fruit && a.fruit.id === b.fruit.id;
  }
  return a.level === b.level;
}

function getHighestBoardLevel() {
  let maxLvl = 1;
  for (let s of state.slots) {
    if (isBoardFigure(s) && s.level > maxLvl) {
      maxLvl = s.level;
    }
  }
  if (state.centerLevel && state.centerLevel > maxLvl) maxLvl = state.centerLevel;
  return maxLvl;
}

return {isBoardFigure,isTargetFruit,arePiecesEqualForMerge,getHighestBoardLevel};
}
export function v43Ammo(state, maxShield=5, targetCoreLevel=10){
 const MAX_SHIELD=maxShield, TARGET_CORE_LEVEL=targetCoreLevel;
 const {isBoardFigure,isTargetFruit}=v43Board();
 function getHighestBoardLevel() {
  let maxLvl = 1;
  for (let s of state.slots) {
    if (isBoardFigure(s) && s.level > maxLvl) maxLvl = s.level;
  }
  if (state.centerLevel && state.centerLevel > maxLvl) maxLvl = state.centerLevel;
  return maxLvl;
 }
function nextRandomPiece() {
  const normal = level=>({level,kind:'normal',fruit:null});
  const special = (kind,level=1)=>({level,kind,fruit:null});
  const fruit = f=>({level:1,kind:'fruit',fruit:{...f}});
  const pick = arr=>arr[Math.floor(state.rng()*arr.length)];
  const levels=state.slots.filter(s=>isBoardFigure(s)&&s.kind==='normal'&&s.level<TARGET_CORE_LEVEL).map(s=>s.level);
  const fruits=state.slots.filter(isTargetFruit).map(s=>s.fruit);
  const free=state.slots.filter(s=>s===null).length;
  const queued=state.nextPiece;
  state.shotsSinceSpecial++;
  state.healDrought=state.shieldIntegrity<=2?state.healDrought+1:0;
  const roll=state.rng();
  if(state.shieldIntegrity<MAX_SHIELD && queued?.kind!=='heal' &&
    ((state.shieldIntegrity<=2&&state.healDrought>=5)||(state.shotsSinceSpecial>=3&&roll<(state.shieldIntegrity<=2?.22:.10)))){
    state.healDrought=0;state.shotsSinceSpecial=0;return special('heal');
  }
  if(state.shotsSinceSpecial>=4 && roll<.24 && state.milestoneIndex>=1){
    const pool=state.tempoTimer>0?['supercharger']:['supercharger','accel','slow'];
    state.shotsSinceSpecial=0;
    return special(pick(pool),Math.min(5,Math.max(1,getHighestBoardLevel())));
  }
  // A compact board receives only matching ordinary ammunition when possible.
  if(fruits.length && (!levels.length||roll<.28)){
    const different=fruits.filter(f=>queued?.kind!=='fruit'||queued.fruit?.id!==f.id);
    return fruit(pick(different.length?different:fruits));
  }
  if(levels.length && (free<=1||roll<.88)){
    const different=levels.filter(l=>queued?.kind!=='normal'||queued.level!==l);
    return normal(pick(different.length?different:levels));
  }
  if(free<=1 && fruits.length)return fruit(pick(fruits));
  return normal(free>1&&state.milestoneIndex>0&&roll>.95?2:1);
}

return nextRandomPiece();
}
export function v43Sweep(p,phase,world,onProgress){
 const {width,cy,cx,slotRadius,trackHeight,coreTargetRadius}=world;
 const NUM_SLOTS=world.numSlots;
 const state={routeParams:world.routeParams,centerLevel:world.centerLevel,projectile:p};
 const getSlotWorldPos=(index,phase)=>v43Position(index,phase,world,world.routeParams,NUM_SLOTS);
 const trackShotFX=onProgress||(()=>{});
function intersection(ax,ay,bx,by,x,y,r){
 const dx=bx-ax,dy=by-ay,fx=ax-x,fy=ay-y,c=fx*fx+fy*fy-r*r;
 if(c<=0)return 0;const a=dx*dx+dy*dy;if(a<1e-9)return Infinity;const b=fx*dx+fy*dy,d=b*b-a*c;if(d<0)return Infinity;const t=(-b-Math.sqrt(d))/a;return t>=0&&t<=1?t:Infinity;
}
function advanceProjectile(p,phase){
 let left=1; const pad=slotRadius*.85;
 // Broad-phase: all slot hitboxes are enclosed by this conservative band.
 // Only skip the per-slot checks when the whole shot segment lies outside it.
 // This does not change the narrow-phase intersection algorithm or target priority.
 const lanes=state.routeParams?.laneCount??2;
 const bandRadius=(lanes-1)*slotRadius*2.55*.5+trackHeight*.24+slotRadius*1.04+1e-6;
 const bandMin=cy-bandRadius,bandMax=cy+bandRadius;
 for(let segment=0;segment<3&&left>1e-6;segment++){
  const ax=p.x,ay=p.y;const wall=p.vx<0?pad:width-pad;
  const wtime=p.vx? (wall-ax)/p.vx:Infinity;
  const bounce=wtime>=0&&wtime<left;const dt=bounce?wtime:left;
  const bx=ax+p.vx*dt,by=ay+p.vy*dt;let best=Infinity,hit=null;
  if(Math.max(ay,by)>=bandMin && Math.min(ay,by)<=bandMax){
    for(let i=0;i<NUM_SLOTS;i++){const pos=getSlotWorldPos(i,phase);const t=intersection(ax,ay,bx,by,pos.x,pos.y,slotRadius*1.04);if(t<best){best=t;hit={type:'slot',index:i};}}
  }
  if(state.centerLevel!==null){const t=intersection(ax,ay,bx,by,cx,cy,coreTargetRadius);if(t<best){best=t;hit={type:'core'};}}
  if(by<12){const t=(12-ay)/(by-ay);if(t>=0&&t<best){best=t;hit={type:'miss'};}}
  if(hit){p.x=ax+(bx-ax)*best;p.y=ay+(by-ay)*best;if(p===state.projectile)trackShotFX(p);return hit;}
  p.x=bx;p.y=by;if(p===state.projectile)trackShotFX(p);left-=dt;if(bounce)p.vx=-p.vx;else break;
 }
 return null;
}
return advanceProjectile(p,phase);
}
function v43Lane(u,laneIndex,g,routeParams) {
 const rp=routeParams||{mode:0,laneCount:2,freqA:1};
 const x=g.cx+(u-.5)*2*g.trackHalfSpan;
 const gap=g.slotRadius*2.55;
 const offset=(laneIndex-(rp.laneCount-1)/2)*gap;
 const wave=rp.mode===0?Math.sin(u*Math.PI*2):rp.mode===1?Math.sin(u*Math.PI*2+Math.PI/3):rp.mode===2?Math.cos(u*Math.PI*2):Math.sin(u*Math.PI*4)*.7;
 return {x,y:g.cy+offset+wave*g.trackHeight*.24};
}
function v43Position(index,phase,g,routeParams,numSlots){
 const laneCount=routeParams?routeParams.laneCount:2;
 const laneIndex=index%laneCount;
 const perLaneCount=Math.ceil(numSlots/laneCount);
 const posInLane=Math.floor(index/laneCount);
 const spacing=1/perLaneCount;
 const laneDir=laneIndex%2===1?-1:1;
 const rawU=(phase*laneDir+posInLane*spacing+laneIndex*.17)%1;
 const u=rawU<0?rawU+1:rawU;
 return v43Lane(u,laneIndex,g,routeParams);
}
