const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let width = 400, height = 700, cx = 200, cy = 300, trackHalfSpan = 220, trackHeight = 90, slotRadius = 24, coreTargetRadius = 42;
let swapBoxRect = { x: 0, y: 0, w: 84, h: 60 };

let bgPhoto = null;
let bgPhotoReady = false;
if (BACKGROUND_PHOTO_URL) {
  bgPhoto = new Image();
  bgPhoto.crossOrigin = 'anonymous';
  bgPhoto.onload = () => { bgPhotoReady = true; };
  bgPhoto.src = BACKGROUND_PHOTO_URL;
}

const keyState = { left: false, right: false };

let state = {
  seed: Date.now(),
  rng: null,
  tick: 0,
  arrowAngle: 0,
  aimAngle: 0,
  score: 0,
  best: Math.max(0, Number(STORE.get('kosen_v20_best',0)) || 0),
  recordHolder: String(STORE.get('kosen_v20_holder',STORE.get('kosen_v3_holder','BERKAN'))).slice(0,14),
  coresDetonated: Math.max(0, Number(STORE.get('kosen_cores',0)) || 0),
  unlockedRelics: (()=>{const v=STORE.get('kosen_relics',[]);return Array.isArray(v)?[...new Set(v.filter(x=>Number.isInteger(x)&&x>=1&&x<=12))]:[]})(),
  actionLog: [],
  inputLog: [], simFrame: 0, replayActive: false, replayData: null,
  practiceSeed: null,
  startedAt: null,
  milestoneIndex: 0,
  envIndex: 0,
  proceduralLayout: null,
  routeParams: null,
  trackPhase: 0,
  tempoTimer: 0,
  tempoMult: 1,
  slots: new Array(NUM_SLOTS).fill(null),
  centerLevel: null,
  coreScaleAnim: 1,
  corePulseBoost: 0,
  projectile: null,
  reboundProj: null,
  particles: [],
  shockwaves: [],
  starbursts: [],
  floatingTexts: [],
  ambientMotes: [],
  waterfallStreams: [],
  nextPiece: { level: 1, kind: 'normal', fruit: null },
  upcomingPiece: { level: 1, kind: 'normal', fruit: null },
  swapAnim: 0,
  shotsSinceSpecial: 0,
  isAiming: false,
  shieldIntegrity: MAX_SHIELD,
  hitStop: 0,
  shake: 0,
  combo: 0,
  gameOver: false, chain: null, superCooldown: 0, shotCount: 0, bestCombo: 0
};

function clampAimAngle(ang) {
  return Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, ang));
}

function getLaunchY(){return height - Math.min(116,Math.max(84,height*.19));}
function getFooterY(){return height-19;}
function updateAimFromPointer(px, py) {
  const launchY = getLaunchY();
  const dx = px - cx;
  const dy = launchY - py;
  if (Math.hypot(dx, dy) < 10) return;
  const rawAngle = Math.atan2(dx, Math.max(18, dy));
  state.aimAngle = clampAimAngle(rawAngle);
}

function syncRecordInputs() {
  const hInput = document.getElementById('headerRecordName');
  const gInput = document.getElementById('goRecordName');
  if (hInput && document.activeElement !== hInput) {
    hInput.value = state.recordHolder;
  }
  if (gInput && document.activeElement !== gInput) {
    gInput.value = state.recordHolder;
  }
  const summary = document.getElementById('goRecordSummary');
  if (summary) {
    summary.textContent = `RÉCORD: ${state.recordHolder || '---'} · ${state.best.toLocaleString()}`;
  }
}

function setRecordHolderName(val) {
  const clean = (val || '').trim().slice(0, 14) || 'BERKAN';
  state.recordHolder = clean;
  STORE.set('kosen_v20_holder', clean);
  syncRecordInputs();
}

document.getElementById('headerRecordName').addEventListener('input', (e) => {
  setRecordHolderName(e.target.value);
});
document.getElementById('goRecordName').addEventListener('input', (e) => {
  setRecordHolderName(e.target.value);
});
['headerRecordName', 'goRecordName'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('keydown', (e) => e.stopPropagation());
});

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

function getPieceColor(piece) {
  if (!piece) return THEME.cyan;
  if (piece.kind === 'fruit') return (piece.fruit && piece.fruit.color) || THEME.fruit;
  if (piece.kind === 'heal') return THEME.emerald;
  if (piece.kind === 'supercharger') return THEME.supercharger;
  if (piece.kind === 'superball') return THEME.superball;
  if (piece.kind === 'accel') return THEME.accel;
  if (piece.kind === 'slow') return THEME.slow;
  return SHAPES[(Math.max(1, piece.level) - 1) % SHAPES.length].color;
}

function getPieceLabel(piece) {
  if (!piece) return '';
  if (piece.kind === 'fruit') return (piece.fruit && piece.fruit.emoji) || FRUITS[0].emoji;
  if (piece.kind === 'supercharger') return 'SC';
  if (piece.kind === 'superball') return '★';
  if (piece.kind === 'accel') return '>>';
  if (piece.kind === 'slow') return '<<';
  return String(piece.level);
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

function initZenBackground() {
  state.waterfallStreams = [];
  for (let i = 0; i < 26; i++) {
    state.waterfallStreams.push({
      xNorm: (i + 0.5) / 26 + (Math.random() - 0.5) * 0.03,
      y: Math.random() * height,
      speed: 0.6 + Math.random() * 0.9,
      length: 65 + Math.random() * 105,
      alpha: 0.09 + Math.random() * 0.1,
      wobblePhase: Math.random() * Math.PI * 2
    });
  }
  state.ambientMotes = [];
  const tints = ['gold', 'cyan', 'sakura', 'emerald'];
  for (let i = 0; i < 34; i++) {
    state.ambientMotes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1.8 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.18 - Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      tint: tints[i % tints.length]
    });
  }
}

function generateProceduralScene(seedBase, envIdx) {
  const rng = createPRNG((seedBase ^ ((envIdx + 1) * 0x7f4a7c15)) >>> 0);
  const farPeaks = [];
  const nearPeaks = [];
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    farPeaks.push({
      u,
      h: 0.14 + rng() * 0.14 + Math.sin(u * Math.PI * (1 + Math.floor(rng() * 2))) * 0.05
    });
    nearPeaks.push({
      u,
      h: 0.07 + rng() * 0.11 + Math.cos(u * Math.PI * (1 + Math.floor(rng() * 2))) * 0.03
    });
  }

  const spires = [];
  for (let i = 0; i < 7; i++) {
    spires.push({
      xNorm: (i + 0.5) / 7 + (rng() - 0.5) * 0.04,
      hNorm: 0.28 + rng() * 0.24,
      w: 2.2 + rng() * 2.5,
      phase: rng() * Math.PI * 2
    });
  }

  return {
    farPeaks,
    nearPeaks,
    spires,
    sunXNorm: 0.25 + rng() * 0.5,
    sunYNorm: 0.22 + rng() * 0.14,
    sunR: 44 + rng() * 28
  };
}

function generateProceduralRoute(milestoneIdx) {
  const rSeed = (state.seed ^ ((milestoneIdx + 1) * 0x9e3779b9)) >>> 0;
  const rng = createPRNG(rSeed);
  const mode = Math.floor(rng() * 4);
  const freqA = 1 + Math.floor(rng() * 2);
  const freqB = 1 + Math.floor(rng() * 2);
  const ampY = milestoneIdx === 0 ? 0.36 : (0.44 + rng() * 0.3);
  const laneCount = milestoneIdx === 0 ? 2 : (milestoneIdx % 2 === 1 ? 3 : 2);
  const laneSpacingY = laneCount === 3 ? 42 : 52;
  const dir = rng() > 0.5 ? 1 : -1;
  const baseSpeed = [0.0035,0.0044,0.0054,0.0065,0.0077,0.0090][Math.min(5,milestoneIdx)];
  const speed = baseSpeed * dir;
  return { mode, freqA, freqB, ampY, laneCount, laneSpacingY, speed };
}

function getLaneOffsetY(laneIndex, laneCount, spacingY) {
  const centerIdx = (laneCount - 1) / 2;
  return (laneIndex - centerIdx) * spacingY;
}

function evalLaneAt(u, laneIndex = 0) {
  const rp = state.routeParams || {mode:0,laneCount:2,freqA:1};
  const x = cx + (u - .5)*2*trackHalfSpan;
  const gap = slotRadius * 2.55;
  const offset = (laneIndex-(rp.laneCount-1)/2)*gap;
  const wave = rp.mode===0 ? Math.sin(u*Math.PI*2) : rp.mode===1 ? Math.sin(u*Math.PI*2+Math.PI/3) : rp.mode===2 ? Math.cos(u*Math.PI*2) : Math.sin(u*Math.PI*4)*.7;
  return {x,y:cy+offset+wave*trackHeight*.24};
}

function getSlotLane(index) {
  const laneCount = state.routeParams ? state.routeParams.laneCount : 2;
  return index % laneCount;
}

function getSlotWorldPos(index, phase = state.trackPhase) {
  const laneCount = state.routeParams ? state.routeParams.laneCount : 2;
  const laneIndex = getSlotLane(index);
  const perLaneCount = Math.ceil(NUM_SLOTS / laneCount);
  const posInLane = Math.floor(index / laneCount);
  const spacing = 1 / perLaneCount;
  const laneDir = laneIndex % 2 === 1 ? -1 : 1;
  const rawU = (phase * laneDir + posInLane * spacing + laneIndex * 0.17) % 1;
  const u = rawU < 0 ? rawU + 1 : rawU;
  return evalLaneAt(u, laneIndex);
}

function createFruitSlot(fruitObj) {
  const base = fruitObj || FRUITS[Math.floor(state.rng() * FRUITS.length)];
  return {
    level: 1,
    kind: 'fruit',
    fruit: { ...base },
    isBomb: false,
    isSkull: false,
    isSuperballNode: false,
    scaleAnim: 1.25
  };
}

function ensureTargetFruitsOnBoard(minCount = 2) {
  let current = state.slots.filter(isTargetFruit).length;
  const free = state.slots.map((s,i)=>s===null?i:-1).filter(i=>i>=0);
  // Automatic replenishment may never consume the last free socket.
  while(current<minCount && free.length>1){
    const i=free.splice(Math.floor(state.rng()*free.length),1)[0];
    state.slots[i]=createFruitSlot(); current++;
  }
}

function seedHazardsAndSuperball() {
  const freeCount=()=>state.slots.filter(s=>s===null).length;
  const place=(flag,preferred)=>{
    if(state.slots.some(s=>s&&s[flag])||freeCount()<=1)return;
    const i=state.slots[preferred]===null?preferred:state.slots.findIndex(s=>s===null);
    if(i>=0)state.slots[i]={level:flag==='isSuperballNode'?1:0,kind:'normal',fruit:null,[flag]:true,scaleAnim:1};
  };
  place('isBomb',4);place('isSkull',6);
  if(state.superCooldown===0)place('isSuperballNode',7);
  ensureTargetFruitsOnBoard(2);
}

function resize() {
  resetImpactFX();
  const dpr = Math.min(window.devicePixelRatio || 1, renderQuality === 'eco' ? 1.25 : 2);
  width = Math.max(1, canvas.clientWidth || window.innerWidth);
  height = Math.max(1, canvas.clientHeight || (window.innerHeight - 60));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = width / 2;
  cy = height * (width < height ? .49 : .46);
  trackHalfSpan = Math.max(20, width/2 - slotRadius*1.5);
  trackHeight = Math.min(height * 0.16, 105);
  slotRadius = Math.max(10, Math.min(30,width * .045, height * .052));
  trackHalfSpan = Math.max(20, Math.min(width/2-slotRadius*1.35,height*.72));
  routeCache.clear();
  if(state.projectile){state.projectile.x = Math.min(width-slotRadius,Math.max(slotRadius,state.projectile.x));state.projectile.y = Math.min(getLaunchY(),state.projectile.y);}
  coreTargetRadius = Math.max(16,slotRadius*1.25);
  const launchY = getLaunchY();
  const sw=Math.min(112,Math.max(76,width*.25)), sh=Math.min(76,Math.max(55,height*.115));
  swapBoxRect = { x: Math.min(width-sw-8,cx+Math.min(width*.24,170)), y: launchY-sh*.46, w:sw,h:sh };
  initZenBackground();
}
window.addEventListener('resize', resize);

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

function settleAmmo(){
  if(!state.pendingAmmo||state.chain||state.projectile||state.gameOver)return;
  state.pendingAmmo=false;
  state.nextPiece=state.upcomingPiece;
  state.upcomingPiece=nextRandomPiece();
}

function swapActiveAndUpcoming() {
  if (state.replayActive && !ReplayLab.isApplying()) return;
  if (paused || state.gameOver || state.projectile || state.chain || state.pendingAmmo) return;
  const temp = state.nextPiece;
  state.nextPiece = state.upcomingPiece;
  state.upcomingPiece = temp;
  state.swapAnim = 1;
  state.actionLog.push({
    s: state.simFrame, t: state.tick,
    m: state.milestoneIndex,
    p: Number(state.trackPhase.toFixed(4)),
    a: 'swap'
  });
  AudioEngine.playSwap();
  const r = swapBoxRect;
  state.shockwaves.push({
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    r: 8,
    maxR: 44,
    color: getPieceColor(state.nextPiece),
    life: 0.75,
    lineWidth: 2.2
  });
}

function checkLevel10Spawn() {
  const idx = state.slots.findIndex(s => isBoardFigure(s) && s.level >= TARGET_CORE_LEVEL);
  if (idx !== -1 && state.centerLevel === null) {
    state.centerLevel = state.slots[idx].level;
    state.slots[idx] = null;
    state.coreScaleAnim = 1.7;
    state.corePulseBoost = 1;
    spawnDopamineBurst(cx, cy, THEME.gold, 2);
    addAstralFX("seal",cx,cy,coreTargetRadius*4,.52,.85,3);
    for(let l=0;l<state.routeParams.laneCount;l++)emitLanePulse(l,cx,THEME.gold,.85);
    showToast('✦ ¡BERKAN NV.10 MATERIALIZADO! CUELA UN TIRO POR UN HUECO');
  }
}

function checkMilestoneProgress() {
  let nextIdx = state.milestoneIndex;
  while (
    nextIdx + 1 < MILESTONE_THRESHOLDS.length &&
    state.score >= MILESTONE_THRESHOLDS[nextIdx + 1]
  ) {
    nextIdx++;
  }
  if (nextIdx > state.milestoneIndex) {
    state.milestoneIndex = nextIdx;
    state.envIndex = state.milestoneIndex % ZEN_ENVIRONMENTS.length;
    state.proceduralLayout = generateProceduralScene(state.seed, state.milestoneIndex);
    state.routeParams = generateProceduralRoute(state.milestoneIndex);
    routeCache.clear(); routeCache.clear(); for(let i=lanePulses.length-1;i>=0;i--)if(lanePulses[i].lane>=state.routeParams.laneCount)lanePulses.splice(i,1);
    seedHazardsAndSuperball();
    state.corePulseBoost = 0.85;
    spawnDopamineBurst(cx, cy, THEME.cyan, 1.4);
    AudioEngine.playMilestone();
    updateHUD();
    const lanesText = state.routeParams.laneCount === 3 ? 'TRIPLE CARRIL' : 'DOBLE CARRIL';
    showToast(`◈ HITO ${state.milestoneIndex + 1} · ${lanesText}`);
  }
}

function resetGame(testSeed = null) {
  state.practiceSeed = Number.isSafeInteger(testSeed) && testSeed >= 1 && testSeed <= 2147483647 ? testSeed : null;
  state.startedAt = new Date().toISOString();
  const practiceIndicator = document.getElementById('practiceIndicator');
  if (practiceIndicator) practiceIndicator.hidden = state.practiceSeed === null;
  astralBursts.length=0; lanePulses.length=0; resetImpactFX();
  runSerial++; state.chain=null; state.superCooldown=0; state.shotCount=0; state.lastSuperShot=-1; state.bestCombo=0; state.isAiming=false; pointerId=null; keyState.left=keyState.right=false;
  clearTimeout(showToast._timer); document.getElementById("toast").classList.remove("show");
  state.seed = state.practiceSeed ?? (Math.floor(Math.random() * 2147483647) || 1337);
  state.rng = createPRNG(state.seed);
  state.tick = 0;
  state.arrowAngle = 0;
  state.aimAngle = 0;
  state.score = 0;
  state.actionLog = []; state.inputLog = []; state.simFrame=0;state.replayActive=false;state.replayData=null;
  state.milestoneIndex = 0;
  state.envIndex = 0;
  state.proceduralLayout = generateProceduralScene(state.seed, 0);
  state.routeParams = generateProceduralRoute(0); routeCache.clear();
  state.trackPhase = 0;
  state.tempoTimer = 0;
  state.tempoMult = 1;
  state.slots = new Array(NUM_SLOTS).fill(null);

  state.slots[0] = { level: 1, kind: 'normal', fruit: null, isBomb: false, isSkull: false, isSuperballNode: false, scaleAnim: 1 };
  state.slots[2] = { level: 1, kind: 'normal', fruit: null, isBomb: false, isSkull: false, isSuperballNode: false, scaleAnim: 1 };
  seedHazardsAndSuperball();

  state.centerLevel = null;
  state.coreScaleAnim = 1;
  state.corePulseBoost = 0;
  state.projectile = null;
  state.reboundProj = null;
  state.particles = [];
  state.shockwaves = [];
  state.starbursts = [];
  state.floatingTexts = [];
  state.shotsSinceSpecial = 0;
  state.shieldIntegrity = MAX_SHIELD; state.healDrought=0; state.pendingAmmo=false; state.shotTempoBonus=false;
  state.nextPiece = {level:1,kind:"normal",fruit:null};
  state.upcomingPiece = nextRandomPiece();
  state.swapAnim = 0;
  state.shieldIntegrity = MAX_SHIELD;
  state.hitStop = 0;
  state.shake = 0;
  state.combo = 0;
  state.gameOver = false;

  document.getElementById('gameover').classList.remove('open');
  if(document.activeElement instanceof HTMLButtonElement)document.activeElement.blur();
  AudioEngine.onReset();
  updateHUD();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2700);
}

function checkRelicUnlock(level) {
  const relic = RELIC_DATA.find(r => r.reqLvl === level);
  if (state.practiceSeed !== null) return;
  if (relic && !state.unlockedRelics.includes(relic.id)) {
    state.unlockedRelics.push(relic.id);
    STORE.set('kosen_relics', state.unlockedRelics);
    AudioEngine.playUnlock();
    showToast(`★ CÓDICE: ${relic.name.toUpperCase()}`);
    renderVault();
  }
}

function spawnDopamineBurst(x, y, color, intensity = 1) {
  if(state.particles.length>240)state.particles.splice(0,state.particles.length-240);
  if(REDUCED_MOTION)intensity=.35;
  state.shockwaves.push({
    x, y,
    r: slotRadius * 0.5,
    maxR: slotRadius * (2.7 + intensity * 0.9),
    color,
    life: 1,
    lineWidth: 3.5 * Math.min(intensity, 1.8)
  });
  state.shockwaves.push({
    x, y,
    r: slotRadius * 0.2,
    maxR: slotRadius * (1.85 + intensity * 0.6),
    color: '#ffffff',
    life: 0.85,
    lineWidth: 2
  });

  state.starbursts.push({
    x, y,
    rays: 8 + Math.min(Math.round(intensity * 4), 10),
    outerR: slotRadius * (1.95 + intensity * 0.7),
    rot: Math.random() * Math.PI,
    color,
    life: 1
  });

  const count = REDUCED_MOTION?4:Math.min(18 + Math.round(intensity * 10), 36);
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const spd = (2.8 + Math.random() * 6.5) * (0.85 + intensity * 0.25);
    state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      color: i % 4 === 0 ? '#ffffff' : color,
      size: 2.5 + Math.random() * 3.2
    });
  }
}

function spawnParticles(x, y, color, count = 14) {
  if(REDUCED_MOTION)count=Math.min(count,4);
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const spd = 2.2 + Math.random() * 6;
    state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      color,
      size: 2.5 + Math.random() * 2.5
    });
  }
}

function addFloatingText(x, y, text, color, big = false) {
  state.floatingTexts.push({ x, y, text, color, life: 1, big });
}

function isPointInSwapBox(px, py) {
  const r = swapBoxRect;
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function clearInput(){state.isAiming=false;keyState.left=keyState.right=false; if(pointerId!==null){if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);pointerId=null;}}
canvas.addEventListener('pointerdown',e=>{
  if(state.replayActive||paused||state.gameOver||state.projectile||state.chain||pointerId!==null||e.button!==0)return;
  e.preventDefault();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(isPointInSwapBox(x,y)){swapActiveAndUpcoming();return;}
  pointerId=e.pointerId;canvas.setPointerCapture(pointerId);updateAimFromPointer(x,y);state.isAiming=true;
});
canvas.addEventListener('pointermove',e=>{if(state.replayActive||e.pointerId!==pointerId||!state.isAiming)return;const r=canvas.getBoundingClientRect();updateAimFromPointer(e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('pointerup',e=>{if(state.replayActive||e.pointerId!==pointerId)return;e.preventDefault();const r=canvas.getBoundingClientRect();updateAimFromPointer(e.clientX-r.left,e.clientY-r.top);clearInput();shoot();});
canvas.addEventListener('pointercancel',clearInput);canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointerId)clearInput();});
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
window.addEventListener('keydown',e=>{
 if(state.replayActive||e.target instanceof HTMLInputElement || paused)return;
 if(e.target instanceof HTMLButtonElement && ['Space','Enter'].includes(e.code))return;
 if(e.code==='KeyR'&&state.gameOver){resetGame();return;}
 if(state.gameOver)return;
 if(['ArrowLeft','KeyA','ArrowRight','KeyD','Space','KeyC','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();
 if(['ArrowLeft','KeyA'].includes(e.code))keyState.left=true;
 if(['ArrowRight','KeyD'].includes(e.code))keyState.right=true;
 if(['KeyC','ShiftLeft','ShiftRight'].includes(e.code)&&!e.repeat)swapActiveAndUpcoming();
 if(e.code==='Space'&&!e.repeat&&!state.projectile&&!state.chain)state.isAiming=true;
});
window.addEventListener('keyup',e=>{
 if(state.replayActive)return;
 if(['ArrowLeft','KeyA'].includes(e.code))keyState.left=false;
 if(['ArrowRight','KeyD'].includes(e.code))keyState.right=false;
 if(e.code==='Space'&&state.isAiming&&pointerId===null){e.preventDefault();state.isAiming=false;shoot();}
});

function shoot() {
  if (state.replayActive && !ReplayLab.isApplying()) return;
  if (paused || state.gameOver || state.projectile || state.chain || state.pendingAmmo || state.hitStop>0) return;
  state.shotCount++;
  state.shotTempoBonus=state.tempoTimer>0 && state.tempoMult>1;
  const active = state.nextPiece;
  const fruitObj = active.kind === 'fruit' ? (active.fruit ? { ...active.fruit } : { ...FRUITS[0] }) : null;
  const speed = projectileSpeed();
  const vx = Math.sin(state.aimAngle) * speed;
  const vy = -Math.cos(state.aimAngle) * speed;

  state.actionLog.push({
    s: state.simFrame, t: state.tick,
    m: state.milestoneIndex,
    p: Number(state.trackPhase.toFixed(4)),
    a: Number(state.aimAngle.toFixed(3)), angleExact:state.aimAngle,
    l: active.level,
    k: active.kind, f: active.fruit?.id || null
  });

  AudioEngine.playShoot();
  const launchY = getLaunchY();
  state.projectile = {
    x: cx,
    y: launchY,
    vx,
    vy,
    level: active.level,
    kind: active.kind,
    fruit: fruitObj
  };

  startShotFX(state.projectile);
  state.pendingAmmo=true;
}

function applyHealImpact(x, y) {
  spawnDopamineBurst(x, y, THEME.emerald, 1.2);
  if (state.shieldIntegrity < MAX_SHIELD) {
    state.shieldIntegrity++;
    AudioEngine.playHeal();
    addFloatingText(x, y - 18, '+1 VIDA', THEME.emerald, true);
    showToast('♥ ESCUDO RESTAURADO (+1 VIDA)');
  } else {
    const bonus = 150;
    state.score += bonus;
    AudioEngine.playLock();
    addFloatingText(x, y - 18, `VITALIDAD MAX +${bonus}`, THEME.emerald, false);
    checkMilestoneProgress();
  }
  updateHUD();
}

function detonateLaneBomb(bombSlotIndex, impactX, impactY) {
  const targetLane = getSlotLane(bombSlotIndex);
  state.combo = 0;
  state.hitStop = 5;
  state.shake = 18;
  AudioEngine.playBombBlast();

  for (let i = 0; i < NUM_SLOTS; i++) {
    if (getSlotLane(i) === targetLane && state.slots[i] !== null && !state.slots[i].isSkull) {
      const p = getSlotWorldPos(i);
      spawnDopamineBurst(p.x, p.y, THEME.bomb, 1.3);
      if(state.slots[i].isSuperballNode){state.superCooldown=5;state.lastSuperShot=state.shotCount;}
      state.slots[i] = null;
    }
  }

  const freeSlots = state.slots
    .map((s, idx) => (s === null ? idx : -1))
    .filter(idx => idx !== -1 && idx !== bombSlotIndex);
  if (freeSlots.length > 0) {
    const nextBombIdx = freeSlots[Math.floor(state.rng() * freeSlots.length)];
    state.slots[nextBombIdx] = { level: 0, kind: 'normal', fruit: null, isBomb: true, isSkull: false, isSuperballNode: false, scaleAnim: 1.2 };
  }

  ensureTargetFruitsOnBoard(2);
  addFloatingText(impactX, impactY - 20, '¡LÍNEA VOLADA · COMBO RESET!', THEME.bomb, true);
  showToast('💥 ¡BOMBA ACTIVADA! LÍNEA LIMPIADA Y COMBO REINICIADO');
  updateHUD();
}

function detonateCenterFigure(projLevel) {
  startCoreFX();
  if (state.practiceSeed === null) {
    state.coresDetonated++;
    STORE.set('kosen_cores', state.coresDetonated);
  }

  for (let i = 0; i < NUM_SLOTS; i++) {
    if (isBoardFigure(state.slots[i]) && state.slots[i].level <= 2) {
      const p = getSlotWorldPos(i);
      spawnDopamineBurst(p.x, p.y, THEME.gold, 1.1);
      state.slots[i] = null;
    }
  }

  ensureTargetFruitsOnBoard(2);

  const bonusMult = 1;
  const pts = Math.round((2500 + projLevel * 250) * bonusMult);
  state.score += pts;
  state.centerLevel = null;
  state.coreScaleAnim = 1.85;
  state.corePulseBoost = 1;
  state.hitStop = 6;
  state.shake = 22;

  AudioEngine.playCoreDetonation();
  for(let l=0;l<state.routeParams.laneCount;l++)emitLanePulse(l,cx,THEME.gold,1.2);
  const coreFXSize=Math.min(Math.min(width,height)*.72,coreTargetRadius*6);
  addAstralFX('seal',cx,cy,coreFXSize,.52,.86,3);
  addAstralFX('gold',cx,cy,coreFXSize*.85,.58,.58,3);
  addAstralFX('star',cx,cy,coreFXSize*.5,.32,.30,3);
  spawnDopamineBurst(cx, cy, THEME.gold, 2.5);
  spawnDopamineBurst(cx, cy, THEME.sakura, 2);
  addFloatingText(cx, cy - 28, `¡BERKAN NV.10 +${pts}!`, THEME.gold, true);
  checkLevel10Spawn();
  checkRelicUnlock(TARGET_CORE_LEVEL);
  for(let n=2;n<=5;n++)if(state.coresDetonated>=n)checkRelicUnlock(9+n);
  checkMilestoneProgress();
  updateHUD();
}

function handleSuperballHit(slotIndex, impactX, impactY) {
  state.slots[slotIndex]=null; state.superCooldown=5;state.lastSuperShot=state.shotCount;
  let target=-1;
  for(let i=0;i<NUM_SLOTS;i++){const s=state.slots[i];if(isBoardFigure(s)&&s.kind==='normal'&&s.level<TARGET_CORE_LEVEL&&(target<0||s.level>state.slots[target].level))target=i;}
  if(target<0){target=slotIndex;state.slots[target]={level:1,kind:'normal',scaleAnim:1};}
  spawnDopamineBurst(impactX,impactY,THEME.superball,1.5);
  triggerChainMerge(target,Math.min(TARGET_CORE_LEVEL,state.slots[target].level+1),'SUPERBOLA');
}
function advanceSpecialCooldown(){
  if(state.superCooldown>0 && --state.superCooldown===0 && !state.slots.some(s=>s&&s.isSuperballNode)){
    const skull=state.slots.findIndex(s=>s&&s.isSkull);
    const options=Array.from({length:NUM_SLOTS},(_,i)=>i).filter(i=>state.slots[i]===null);
    if(options.length>1){const adjacent=options.find(i=>Math.abs(i-skull)===1);state.slots[adjacent??options[0]]={level:1,kind:'normal',isSuperballNode:true,scaleAnim:1.3};}else state.superCooldown=1;
  }
}

function applySuperchargerImpact(slotIndex, proj, impactX, impactY) {
  const slot = state.slots[slotIndex];
  const color = THEME.supercharger;
  const tag = 'SUPERCHARGER ↑';

  if (slot === null) {
    const startLvl = Math.max(2, proj.level + 1);
    state.slots[slotIndex] = { level: startLvl, kind: 'normal', fruit: null, isBomb: false, isSkull: false, isSuperballNode: false, scaleAnim: 1.65 };
    const pts = startLvl * 45;
    state.score += pts;
    spawnDopamineBurst(impactX, impactY, color, 1.45);
    addFloatingText(impactX, impactY - 20, `${tag} NV.${startLvl} +${pts}`, color, true);
    AudioEngine.playMerge(startLvl, state.combo + 1);
    checkLevel10Spawn();
    checkMilestoneProgress();
    updateHUD();
    return;
  }

  if(slot.level>=TARGET_CORE_LEVEL){addFloatingText(impactX,impactY-18,'NÚCLEO CARGADO',THEME.gold);return;}
  triggerChainMerge(slotIndex, slot.level + 1, tag);
}

function resolveSlotImpact(slotIndex, proj, impactX, impactY) {
  const pos = getSlotWorldPos(slotIndex);

  if (proj.kind === 'heal') {
    applyHealImpact(impactX, impactY);
    return;
  }

  const slot = state.slots[slotIndex];

  if (slot && slot.isSkull) {
    state.shake = 26;
    AudioEngine.playSkullDeath();
    spawnDopamineBurst(impactX, impactY, '#ffffff', 2.4);
    addFloatingText(impactX, impactY - 20, '☠ ¡CALAVERA! REINICIO TOTAL', '#ffffff', true);
    triggerGameOver('CALAVERA · SELLO ROTO');

    return;
  }

  if (slot && slot.isSuperballNode) {
    handleSuperballHit(slotIndex, impactX, impactY);
    return;
  }

  if (slot && slot.isBomb) {
    detonateLaneBomb(slotIndex, impactX, impactY);
    return;
  }

  if (proj.kind === 'accel') {
    state.tempoMult = 1.45;
    state.tempoTimer = 360;
    state.score += 60;
    AudioEngine.playTempoShift(true);
    spawnDopamineBurst(impactX, impactY, THEME.accel, 1.25);
    addAstralFX("wave",impactX,impactY,slotRadius*4,.44,.45,1);
    addFloatingText(impactX, impactY - 18, '>> ACELERADO +60', THEME.accel, true);
    showToast('>> ACELERACIÓN · +40% EN FUSIONES');
    checkMilestoneProgress();
    updateHUD();
    return;
  }

  if (proj.kind === 'slow') {
    state.tempoMult = 0.55;
    state.tempoTimer = 300;
    state.score += 60;
    AudioEngine.playTempoShift(false);
    spawnDopamineBurst(impactX, impactY, THEME.slow, 1.25);
    addAstralFX("vortex",impactX,impactY,slotRadius*4,.45,.5,1);
    addFloatingText(impactX, impactY - 18, '<< RALENTIZADO +60', THEME.slow, true);
    showToast('<< TIEMPO RALENTIZADO · APUNTA CON CALMA');
    checkMilestoneProgress();
    updateHUD();
    return;
  }

  if (proj.kind === 'supercharger') {
    applySuperchargerImpact(slotIndex, proj, impactX, impactY);
    return;
  }

  const projLevel = proj.level || 1;
  const isFruitProj = proj.kind === 'fruit';
  const safeFruit = isFruitProj ? (proj.fruit ? { ...proj.fruit } : { ...FRUITS[0] }) : null;

  if (slot === null) {
    state.slots[slotIndex] = {
      level: projLevel,
      kind: isFruitProj ? 'fruit' : 'normal',
      fruit: safeFruit,
      isBomb: false,
      isSkull: false,
      isSuperballNode: false,
      scaleAnim: 1.45
    };
    state.combo = 0;
    const pts = projLevel * 15;
    state.score += pts;
    AudioEngine.playLock();
    const color = getPieceColor(proj);
    spawnParticles(pos.x, pos.y, color, 10);
    addFloatingText(pos.x, pos.y - 18, `ENCAJE +${pts}`, color, false);
    ensureTargetFruitsOnBoard(2);
    checkLevel10Spawn();
    checkMilestoneProgress();
    updateHUD();
    checkBoardDeadlock();
    return;
  }

  if (arePiecesEqualForMerge(slot, proj)) {
    const baseLvl = Math.max(slot.level || 1, projLevel);
    triggerChainMerge(slotIndex, baseLvl + 1);
    return;
  }

  state.combo = 0;
  state.shieldIntegrity--;
  state.shake = 14;
  AudioEngine.playReject();
  spawnParticles(impactX, impactY, THEME.danger, 18);
  addFloatingText(impactX, impactY - 15, '¡NO ENCAJA!', THEME.danger, false);

  state.reboundProj = {
    x: impactX,
    y: impactY,
    vx: (Math.random() - 0.5) * 10,
    vy: 9,
    rot: 0,
    level: projLevel,
    kind: isFruitProj ? 'fruit' : 'normal',
    fruit: safeFruit,
    life: 1
  };

  updateHUD();
  if (state.shieldIntegrity <= 0) {
    triggerGameOver('ESCUDO FRACTURADO (5 FALLOS)');
  }
}

function triggerChainMerge(centerIndex, newLevel, prefixLabel = '') {
  newLevel=Math.min(TARGET_CORE_LEVEL,newLevel);
  state.combo++; state.bestCombo=Math.max(state.bestCombo,state.combo);
  const mergedNode={level:newLevel,kind:'normal',fruit:null,scaleAnim:1.65};
  state.slots[centerIndex]=mergedNode;
  const pos=getSlotWorldPos(centerIndex), color=getPieceColor(mergedNode);
  startMergeFX(centerIndex,newLevel,color);
  const basePts=Math.round(Math.pow(1.65,newLevel)*22*Math.min(state.combo,8))+(state.combo>=3?25*Math.min(state.combo,8):0);
  const pts=Math.round(basePts*(state.shotTempoBonus?1.4:1));
  state.score+=pts; state.hitStop=REDUCED_MOTION?0:3; state.shake=REDUCED_MOTION?0:Math.min(3+newLevel+state.combo,13);
  state.corePulseBoost=.7;
  emitLanePulse(getSlotLane(centerIndex),pos.x,color,state.combo>=3?1.15:.8);
  spawnDopamineBurst(pos.x,pos.y,color,Math.min(1.8,1+state.combo*.12));
  addAstralFX(state.combo>=3?'shards':'wave',pos.x,pos.y,slotRadius*4.4,.42,.38,1);
  if(state.combo>=3)addAstralFX('star',pos.x,pos.y,slotRadius*2.8,.24,.24,1);
  addFloatingText(pos.x,pos.y-22,`${prefixLabel?prefixLabel+' · ':''}+${pts}${state.combo>1?' · ×'+state.combo:''}${state.shotTempoBonus?' · RÁFAGA':''}`,color,true);
  AudioEngine.playMerge(newLevel,state.combo);checkRelicUnlock(newLevel);
  if(newLevel<TARGET_CORE_LEVEL){
    const lanes=state.routeParams.laneCount;
    const neighbors=Array.from({length:NUM_SLOTS},(_,i)=>i).filter(i=>i%lanes===centerIndex%lanes);
    const at=neighbors.indexOf(centerIndex);
    const other=[neighbors[(at-1+neighbors.length)%neighbors.length],neighbors[(at+1)%neighbors.length]].find(i=>i!==centerIndex&&arePiecesEqualForMerge(state.slots[i],mergedNode));
    if(other!==undefined){state.slots[other]=null;state.chain={index:centerIndex,level:newLevel+1,delay:7};updateHUD();return;}
  }
  state.chain=null;checkLevel10Spawn();checkMilestoneProgress();ensureTargetFruitsOnBoard(2);updateHUD();
}
function checkBoardDeadlock(){
  // Bombs, superballs and the exposed core are valid escape routes; never auto-end a playable board.
}


async function triggerGameOver(reason) {
  if (state.gameOver) return;
  state.gameOver = true;
  AudioEngine.onGameOver(); clearInput(); state.chain=null;
  const serial=runSerial;
  if (state.practiceSeed === null && state.score > state.best) {
    state.best = state.score;
    STORE.set('kosen_v20_best', state.best);
  }
  updateHUD();
  document.getElementById('goReason').textContent = reason;
  document.getElementById('finalScore').textContent = state.score.toLocaleString();
  document.getElementById('gameover').classList.add('open');
  if (typeof ContinuityLab !== 'undefined' && !state.replayActive) ContinuityLab.finishRun(reason);

  const payload = JSON.stringify({ rules:20, seed: state.seed, score: state.score, actions: state.actionLog });
  const box=document.getElementById('auditHash');box.textContent='Diagnóstico local · '+state.shotCount+' tiros · combo ×'+state.bestCombo;
  try {const hash=await sha256(payload);if(serial===runSerial)box.textContent+=' · '+hash.slice(0,16);}catch{}
}

function updateZenBackground() {
  for (let w of state.waterfallStreams) {
    w.y += w.speed * state.tempoMult;
    w.wobblePhase += 0.025;
    if (w.y - w.length > height) {
      w.y = -w.length;
    }
  }
  for (let m of state.ambientMotes) {
    m.x += (m.vx + Math.sin(m.phase) * 0.2) * Math.max(0.5, state.tempoMult);
    m.y += m.vy * Math.max(0.5, state.tempoMult);
    m.phase += 0.02;
    if (m.y < -10) m.y = height + 10;
    if (m.x < -10) m.x = width + 10;
    if (m.x > width + 10) m.x = -10;
  }
}

function projectileSpeed(){return Math.max(12,Math.min(27,height*.041));}
function intersection(ax,ay,bx,by,x,y,r){
 const dx=bx-ax,dy=by-ay,fx=ax-x,fy=ay-y,c=fx*fx+fy*fy-r*r;
 if(c<=0)return 0;const a=dx*dx+dy*dy;if(a<1e-9)return Infinity;const b=fx*dx+fy*dy,d=b*b-a*c;if(d<0)return Infinity;const t=(-b-Math.sqrt(d))/a;return t>=0&&t<=1?t:Infinity;
}
function advanceProjectile(p,phase){
 let left=1; const pad=slotRadius*.85;
 for(let segment=0;segment<3&&left>1e-6;segment++){
  const ax=p.x,ay=p.y;const wall=p.vx<0?pad:width-pad;
  const wtime=p.vx? (wall-ax)/p.vx:Infinity;
  const bounce=wtime>=0&&wtime<left;const dt=bounce?wtime:left;
  const bx=ax+p.vx*dt,by=ay+p.vy*dt;let best=Infinity,hit=null;
  for(let i=0;i<NUM_SLOTS;i++){const pos=getSlotWorldPos(i,phase);const t=intersection(ax,ay,bx,by,pos.x,pos.y,slotRadius*1.04);if(t<best){best=t;hit={type:'slot',index:i};}}
  if(state.centerLevel!==null){const t=intersection(ax,ay,bx,by,cx,cy,coreTargetRadius);if(t<best){best=t;hit={type:'core'};}}
  if(by<12){const t=(12-ay)/(by-ay);if(t>=0&&t<best){best=t;hit={type:'miss'};}}
  if(hit){p.x=ax+(bx-ax)*best;p.y=ay+(by-ay)*best;if(p===state.projectile)trackShotFX(p);return hit;}
  p.x=bx;p.y=by;if(p===state.projectile)trackShotFX(p);left-=dt;if(bounce)p.vx=-p.vx;else break;
 }
 return null;
}
function drawPrediction(x,y,color,piece){
 const p={x,y,vx:Math.sin(state.aimAngle)*projectileSpeed(),vy:-Math.cos(state.aimAngle)*projectileSpeed()};
 let phase=state.trackPhase,tempo=state.tempoMult,timer=state.tempoTimer,hit=null;
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=.66;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(x,y);
 for(let i=0;i<150;i++){if(timer>0&&--timer===0)tempo=1;phase=(phase+state.routeParams.speed*tempo+1)%1;hit=advanceProjectile(p,phase);ctx.lineTo(p.x,p.y);if(hit)break;}
 ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
 if(hit){const target=hit.type==='slot'?state.slots[hit.index]:null;const safe=piece.kind==='heal'||hit.type==='core'||(hit.type==='slot'&&(!target||(!target.isSkull&&(target.isBomb||target.isSuperballNode||piece.kind!=='normal'&&piece.kind!=='fruit'||arePiecesEqualForMerge(target,piece)))));ctx.strokeStyle=safe?'#7bf0a4':'#ff546b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}

function update() {
  if(paused || document.hidden || state.gameOver) return;
  if(typeof ReplayLab!=='undefined' && ReplayLab.beforeStep()===false)return;
  state.simFrame++;
  if (state.hitStop > 0) {
    state.hitStop--;
    return;
  }

  state.tick++;
  if(state.chain){if(--state.chain.delay<=0){const c=state.chain;state.chain=null;triggerChainMerge(c.index,c.level);}}
  const turnSpeed = 0.036;
  if (keyState.left) state.aimAngle = clampAimAngle(state.aimAngle - turnSpeed);
  if (keyState.right) state.aimAngle = clampAimAngle(state.aimAngle + turnSpeed);

  state.arrowAngle += (state.isAiming || keyState.left || keyState.right ? 0.075 : 0.042) * Math.max(0.45, state.tempoMult);

  if (state.tempoTimer > 0) {
    state.tempoTimer--;
    if (state.tempoTimer === 0) {
      state.tempoMult = 1;
    }
  }

  const aimMult = state.isAiming && !state.projectile ? 0.45 : 1;
  const spd = (state.routeParams ? state.routeParams.speed : 0.0045) * state.tempoMult * aimMult;
  state.trackPhase = (state.trackPhase + spd) % 1;
  if (state.trackPhase < 0) state.trackPhase += 1;

  if (state.coreScaleAnim > 1) {
    state.coreScaleAnim += (1 - state.coreScaleAnim) * 0.14;
  }
  if (state.corePulseBoost > 0) {
    state.corePulseBoost = Math.max(0, state.corePulseBoost - 0.025);
  }
  if (state.swapAnim > 0) {
    state.swapAnim = Math.max(0, state.swapAnim - 0.08);
  }
  if (state.shake > 0) state.shake *= 0.82;

  if (state.projectile) {
    const p=state.projectile, hit=advanceProjectile(p,state.trackPhase);
    if(hit){state.projectile=null;const oldScore=state.score,oldLives=state.shieldIntegrity;
      if(hit.type==='slot')resolveSlotImpact(hit.index,p,p.x,p.y);
      else if(p.kind==='heal')applyHealImpact(p.x,p.y);
      else if(hit.type==='core')detonateCenterFigure(p.level);
      else{state.shieldIntegrity--;state.combo=0;state.shake=10;AudioEngine.playReject();addFloatingText(p.x,p.y+18,'DESVIADO',THEME.danger);updateHUD();if(state.shieldIntegrity<=0)triggerGameOver('ESCUDO FRACTURADO');}
      finishShotFX(p,hit,state.shieldIntegrity<oldLives||state.gameOver, state.score>oldScore);
      if(!state.gameOver && state.superCooldown>0 && state.lastSuperShot!==state.shotCount)advanceSpecialCooldown();
    }
  }

  settleAmmo();
  if (state.reboundProj) {
    const rp = state.reboundProj;
    rp.x += rp.vx; rp.y += rp.vy; rp.rot += 0.2; rp.life -= 0.04;
    if (rp.life <= 0) state.reboundProj = null;
  }

  for (let s of state.slots) {
    if (s && s.scaleAnim > 1) s.scaleAnim += (1 - s.scaleAnim) * 0.22;
  }

  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const sw = state.shockwaves[i];
    sw.r += (sw.maxR - sw.r) * 0.16;
    sw.life -= 0.045;
    if (sw.life <= 0) state.shockwaves.splice(i, 1);
  }

  for (let i = state.starbursts.length - 1; i >= 0; i--) {
    const sb = state.starbursts[i];
    sb.rot += 0.04;
    sb.life -= 0.05;
    if (sb.life <= 0) state.starbursts.splice(i, 1);
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.life -= 0.028;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y -= 1.45; ft.life -= 0.02;
    if (ft.life <= 0) state.floatingTexts.splice(i, 1);
  }
}



