/* FrutiDry V44 — deterministic, render-free simulation primitives.
   The same classic script executes in browsers (including file://) and Node.js.
   This is NOT a full game-state verifier, anti-cheat, or scoring authority. */
(function (root, factory) {
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') root.FrutiDrySimulation = api;
})(globalThis, function () {
  'use strict';

  // Preserve the V24-V42 mulberry32 sequence and inspect() contract bit for bit.
  function createPRNG(seed) {
    let s = (seed >>> 0) || 1;
    let calls = 0;
    const random = function () {
      calls++;
      let t = s += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    random.inspect = () => ({state: s >>> 0, calls});
    return random;
  }

  // Routes are fixed by seed and milestone, not CSS, Canvas or the DOM.
  function generateProceduralRoute(seed, milestoneIdx) {
    const rSeed = (seed ^ ((milestoneIdx + 1) * 0x9e3779b9)) >>> 0;
    const rng = createPRNG(rSeed);
    const mode = Math.floor(rng() * 4);
    const freqA = 1 + Math.floor(rng() * 2);
    const freqB = 1 + Math.floor(rng() * 2);
    const ampY = milestoneIdx === 0 ? 0.36 : (0.44 + rng() * 0.3);
    const laneCount = milestoneIdx === 0 ? 2 : (milestoneIdx % 2 === 1 ? 3 : 2);
    const laneSpacingY = laneCount === 3 ? 42 : 52;
    const dir = rng() > 0.5 ? 1 : -1;
    const baseSpeed = [0.0035, 0.0044, 0.0054, 0.0065, 0.0077, 0.0090][Math.min(5, milestoneIdx)];
    const speed = baseSpeed * dir;
    return {mode, freqA, freqB, ampY, laneCount, laneSpacingY, speed};
  }

  function getLaneOffsetY(laneIndex, laneCount, spacingY) {
    const centerIdx = (laneCount - 1) / 2;
    return (laneIndex - centerIdx) * spacingY;
  }

  // Geometry values must be supplied explicitly; no viewport reads in the core.
  function evalLaneAt(u, laneIndex, geometry, routeParams) {
    const rp = routeParams || {mode: 0, laneCount: 2, freqA: 1};
    const x = geometry.cx + (u - .5) * 2 * geometry.trackHalfSpan;
    const gap = geometry.slotRadius * 2.55;
    const offset = (laneIndex - (rp.laneCount - 1) / 2) * gap;
    const wave = rp.mode === 0 ? Math.sin(u * Math.PI * 2)
      : rp.mode === 1 ? Math.sin(u * Math.PI * 2 + Math.PI / 3)
      : rp.mode === 2 ? Math.cos(u * Math.PI * 2)
      : Math.sin(u * Math.PI * 4) * .7;
    return {x, y: geometry.cy + offset + wave * geometry.trackHeight * .24};
  }

  function getSlotWorldPos(index, phase, geometry, routeParams, numSlots = 9) {
    const laneCount = routeParams ? routeParams.laneCount : 2;
    const laneIndex = index % laneCount;
    const perLaneCount = Math.ceil(numSlots / laneCount);
    const posInLane = Math.floor(index / laneCount);
    const spacing = 1 / perLaneCount;
    const laneDir = laneIndex % 2 === 1 ? -1 : 1;
    const rawU = (phase * laneDir + posInLane * spacing + laneIndex * 0.17) % 1;
    const u = rawU < 0 ? rawU + 1 : rawU;
    return evalLaneAt(u, laneIndex, geometry, routeParams);
  }


  // Exact gameplay predicates from V43, with no browser or visual dependencies.
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
  function getHighestBoardLevel(slots, centerLevel) {
    let maxLvl = 1;
    for (let s of slots) {
      if (isBoardFigure(s) && s.level > maxLvl) maxLvl = s.level;
    }
    if (centerLevel && centerLevel > maxLvl) maxLvl = centerLevel;
    return maxLvl;
  }

  // Consumes exactly the same RNG calls as V43, preserving persistent counters.
  // Never call this with untrusted server inputs: validation belongs at the boundary.
  function nextRandomPiece(state, targetCoreLevel = 10, maxShield = 5) {
    const normal = level=>({level,kind:'normal',fruit:null});
    const special = (kind,level=1)=>({level,kind,fruit:null});
    const fruit = f=>({level:1,kind:'fruit',fruit:{...f}});
    const pick = arr=>arr[Math.floor(state.rng()*arr.length)];
    const levels=state.slots.filter(s=>isBoardFigure(s)&&s.kind==='normal'&&s.level<targetCoreLevel).map(s=>s.level);
    const fruits=state.slots.filter(isTargetFruit).map(s=>s.fruit);
    const free=state.slots.filter(s=>s===null).length;
    const queued=state.nextPiece;
    state.shotsSinceSpecial++;
    state.healDrought=state.shieldIntegrity<=2?state.healDrought+1:0;
    const roll=state.rng();
    if(state.shieldIntegrity<maxShield && queued?.kind!=='heal' &&
      ((state.shieldIntegrity<=2&&state.healDrought>=5)||(state.shotsSinceSpecial>=3&&roll<(state.shieldIntegrity<=2?.22:.10)))){
      state.healDrought=0;state.shotsSinceSpecial=0;return special('heal');
    }
    if(state.shotsSinceSpecial>=4 && roll<.24 && state.milestoneIndex>=1){
      const pool=state.tempoTimer>0?['supercharger']:['supercharger','accel','slow'];
      state.shotsSinceSpecial=0;
      return special(pick(pool),Math.min(5,Math.max(1,getHighestBoardLevel(state.slots,state.centerLevel))));
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

  // Narrow-phase sweep and bounce are pure, deterministic gameplay geometry.
  function intersection(ax,ay,bx,by,x,y,r){
   const dx=bx-ax,dy=by-ay,fx=ax-x,fy=ay-y,c=fx*fx+fy*fy-r*r;
   if(c<=0)return 0;const a=dx*dx+dy*dy;if(a<1e-9)return Infinity;const b=fx*dx+fy*dy,d=b*b-a*c;if(d<0)return Infinity;const t=(-b-Math.sqrt(d))/a;return t>=0&&t<=1?t:Infinity;
  }
  // Mutable projectile kinematics, but no DOM/Canvas/Audio calls. The optional
  // callback observes progress for visual effects; it must not alter physics.
  function advanceProjectile(p,phase,world,onProgress){
   let left=1; const pad=world.slotRadius*.85;
   // Identical conservative band and collision order to V43.
   const lanes=world.routeParams?.laneCount??2;
   const bandRadius=(lanes-1)*world.slotRadius*2.55*.5+world.trackHeight*.24+world.slotRadius*1.04+1e-6;
   const bandMin=world.cy-bandRadius,bandMax=world.cy+bandRadius;
   for(let segment=0;segment<3&&left>1e-6;segment++){
    const ax=p.x,ay=p.y;const wall=p.vx<0?pad:world.width-pad;
    const wtime=p.vx? (wall-ax)/p.vx:Infinity;
    const bounce=wtime>=0&&wtime<left;const dt=bounce?wtime:left;
    const bx=ax+p.vx*dt,by=ay+p.vy*dt;let best=Infinity,hit=null;
    if(Math.max(ay,by)>=bandMin && Math.min(ay,by)<=bandMax){
      for(let i=0;i<world.numSlots;i++){const pos=getSlotWorldPos(i,phase,world,world.routeParams,world.numSlots);const t=intersection(ax,ay,bx,by,pos.x,pos.y,world.slotRadius*1.04);if(t<best){best=t;hit={type:'slot',index:i};}}
    }
    if(world.centerLevel!==null){const t=intersection(ax,ay,bx,by,world.cx,world.cy,world.coreTargetRadius);if(t<best){best=t;hit={type:'core'};}}
    if(by<12){const t=(12-ay)/(by-ay);if(t>=0&&t<best){best=t;hit={type:'miss'};}}
    if(hit){p.x=ax+(bx-ax)*best;p.y=ay+(by-ay)*best;if(onProgress)onProgress(p);return hit;}
    p.x=bx;p.y=by;if(onProgress)onProgress(p);left-=dt;if(bounce)p.vx=-p.vx;else break;
   }
   return null;
  }

  return {createPRNG, generateProceduralRoute, getLaneOffsetY, evalLaneAt, getSlotWorldPos,
    isBoardFigure, isTargetFruit, arePiecesEqualForMerge, getHighestBoardLevel, nextRandomPiece, intersection, advanceProjectile};
});
