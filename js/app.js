// V32: fixed 60 Hz simulation, bounded catch-up and explicit clock resynchronization.
// No elapsed wall-clock time is replayed after a tab suspension or long stall.
const perf={visible:new URLSearchParams(location.search).get('debug')==='1',frames:0,steps:0,drawMs:0,drawPeak:0,start:0,fps:0,renderStages:Object.create(null),renderStageStart:0};
const FRAME_TIMING=Object.freeze({stepMs:1000/60,maxSteps:5,stallMs:250});
const timingStats={stalls:0,droppedMs:0,resyncs:0};
let lastFrame=null,accumulator=0,lastRender=0;

function resetFrameClock(){
 lastFrame=null;
 accumulator=0;
 lastRender=0;
 timingStats.resyncs++;
}

// Pure timing policy: decide the number of steps; physics runs independently
// in loop(). Exported as a global function for deterministic browser QA.
function sampleSimulationClock(now,active){
 if(!Number.isFinite(now)){
   resetFrameClock();
   return {elapsed:0,steps:0,stalled:true};
 }
 if(lastFrame===null){
   lastFrame=now;
   return {elapsed:0,steps:0,stalled:false};
 }
 const gap=now-lastFrame;
 lastFrame=now;
 if(!active){
   accumulator=0;
   return {elapsed:0,steps:0,stalled:false};
 }
 if(gap<0||gap>FRAME_TIMING.stallMs){
   timingStats.stalls++;
   timingStats.droppedMs+=Math.max(0,gap);
   accumulator=0;
   return {elapsed:0,steps:0,stalled:true};
 }
 // Up to five ticks may be recovered for a slow frame. All additional elapsed
 // time is intentionally discarded to avoid sudden fast-forward on weak CPUs.
 const elapsed=Math.min(gap,FRAME_TIMING.stepMs*FRAME_TIMING.maxSteps);
 timingStats.droppedMs+=gap-elapsed;
 accumulator+=elapsed;
 const steps=Math.min(FRAME_TIMING.maxSteps,Math.floor((accumulator+1e-7)/FRAME_TIMING.stepMs));
 accumulator=Math.max(0,accumulator-steps*FRAME_TIMING.stepMs);
 return {elapsed,steps,stalled:false};
}

function loop(now){
 let phase='reloj';
 try {
 if(FaultBoundary.active())return;
 const active=!paused&&!document.hidden&&!state.gameOver;
 const frame=sampleSimulationClock(now,active);
 let steps=0;
 for(let i=0;i<frame.steps;i++){
   phase='simulación';
   update();
   phase='replay';
   if(typeof ReplayLab!=='undefined')ReplayLab.afterStep();
   steps++;
   if(state.gameOver||paused||document.hidden){accumulator=0;break;}
 }
 const stillActive=active&&!state.gameOver&&!paused&&!document.hidden;
 if(stillActive){
   const delta=frame.elapsed/1000;
   updateAstralFX(delta);updateLanePulses(delta);updateImpactFX(delta);
   if(!natureMotion.matches)natureTime+=delta;
 }else if(state.gameOver){astralBursts.length=0;lanePulses.length=0;resetImpactFX();}
 phase='audio';
 AudioEngine.tick(state,!stillActive);
 // The Códice and game-over overlays fully cover the canvas.
 const shouldDraw=stillActive && (now-lastRender>=FRAME_TIMING.stepMs-1 || !lastRender);
 if(shouldDraw){
   const start=perf.visible?performance.now():0;
   phase='render';
   draw();lastRender=lastRender ? Math.max(now-FRAME_TIMING.stepMs,lastRender+FRAME_TIMING.stepMs) : now;
   if(perf.visible){const ms=performance.now()-start;perf.frames++;perf.steps+=steps;perf.drawMs+=ms;perf.drawPeak=Math.max(perf.drawPeak,ms);updatePerfPanel(now);}
 }
 } catch(error) {
   FaultBoundary.report(error,phase);
 } finally {
   // Even after a fatal exception the RAF itself must remain scheduled.
   // The boundary pauses all gameplay; a fresh ritual is always user-initiated.
   requestAnimationFrame(loop);
 }
}
function updatePerfPanel(now){
 if(!perf.visible)return;
 if(!perf.start)perf.start=now;
 if(now-perf.start<1000)return;
 const d=(now-perf.start)/1000;
 const dpr=canvas.width/Math.max(1,width);
 const frames=Math.max(1,perf.frames);
 const renderStagesMs=Object.fromEntries(['scene','conduits','core','pieces','hud'].map(stage=>
   [stage,Number(((perf.renderStages[stage]||0)/frames).toFixed(3))]));
 const assets=AssetHealth.summary();
 perf.sample = {fps:Number((perf.frames/d).toFixed(1)),drawMeanMs:Number((perf.drawMs/frames).toFixed(2)),drawPeakMs:Number(perf.drawPeak.toFixed(2)),ticksPerSecond:Number((perf.steps/d).toFixed(1)),renderStagesMs};
 document.getElementById('debugHud').textContent=[
  `${GAME_BRAND.name} V45 · ${renderQuality.toUpperCase()} · F3 cerrar`,
  `FPS render: ${(perf.frames/d).toFixed(1)} / 60`,
  `Render medio: ${(perf.drawMs/Math.max(1,perf.frames)).toFixed(2)} ms`,
  `Render máximo: ${perf.drawPeak.toFixed(2)} ms`,
  `Escena ${renderStagesMs.scene} · Rutas ${renderStagesMs.conduits} ms`,
  `Núcleo ${renderStagesMs.core} · Piezas/FX ${renderStagesMs.pieces} ms`,
  `HUD ${renderStagesMs.hud} ms (CPU por dibujo)`,
  `Simulación: ${(perf.steps/d).toFixed(1)} ticks/s`,
  `Pausas largas: ${timingStats.stalls} · tiempo omitido: ${(timingStats.droppedMs/1000).toFixed(1)} s`,
  `Canvas: ${canvas.width} × ${canvas.height} (${dpr.toFixed(2)}x)`,
  `Partículas: ${state.particles.length} · FX: ${astralBursts.length+lanePulses.length}`,
  `Gráficos: ${assets.ready}/${assets.total} · fallos: ${assets.failed}`,
  `Rutas cacheadas: ${routeCache.size}`
 ].join('\n');
 perf.start=now;perf.frames=0;perf.steps=0;perf.drawMs=0;perf.drawPeak=0;
 perf.renderStages=Object.create(null);
}


function updateHUD() {
  const env = ZEN_ENVIRONMENTS[state.envIndex % ZEN_ENVIRONMENTS.length];
  document.getElementById('envLabel').textContent = `${GAME_BRAND.name} · ${env.name}`;
  document.getElementById('scoreVal').textContent = state.score.toLocaleString();
  const bestEl = document.getElementById('bestVal');
  if (bestEl) bestEl.textContent = state.best.toLocaleString();
  document.getElementById('milestoneLabel').textContent = `Hito ${state.milestoneIndex + 1} · Berkan 10`;
  document.getElementById('coreCountVal').textContent = state.coresDetonated.toLocaleString();
  const start=MILESTONE_THRESHOLDS[state.milestoneIndex],end=MILESTONE_THRESHOLDS[state.milestoneIndex+1];const progress=end?Math.min(100,Math.max(0,(state.score-start)/(end-start)*100)):100;const bar=document.getElementById('hitoProgress');bar.firstElementChild.style.width=progress+'%';bar.setAttribute('aria-valuenow',Math.round(progress));
  document.getElementById('currentLevelText').textContent = `Hito ${state.milestoneIndex + 1} · Nv. ${getHighestBoardLevel()}`;
  syncRecordInputs();
  updateComboHud();

  const pills = document.querySelectorAll('#livesPips .life-pill');
  pills.forEach((pill, idx) => {
    if (idx < state.shieldIntegrity) pill.classList.remove('lost');
    else pill.classList.add('lost');
  });

  const countSpan = document.getElementById('vaultCount');
  if (countSpan) countSpan.textContent = state.unlockedRelics.length;
}

const RELIC_ART = ["assets/relics/reliquia-01.webp","assets/relics/reliquia-02.webp","assets/relics/reliquia-03.webp","assets/relics/reliquia-04.webp","assets/relics/reliquia-05.webp","assets/relics/reliquia-06.webp","assets/relics/reliquia-07.webp","assets/relics/reliquia-08.webp","assets/relics/reliquia-09.webp","assets/relics/reliquia-10.webp","assets/relics/reliquia-11.webp","assets/relics/reliquia-12.webp"];
function renderVault() {
  const grid = document.getElementById('relicGrid');
  const fragment = document.createDocumentFragment();
  for (const r of RELIC_DATA) {
    const unlocked = state.unlockedRelics.includes(r.id);
    const card = document.createElement('article');
    card.className = `card relic-card ${unlocked ? 'unlocked' : 'relic-locked'}`;
    const art = document.createElement('div');
    art.className = 'relic-art';
    const img = document.createElement('img');
    AssetHealth.track(img, RELIC_ART[r.id - 1], 'relic'); img.alt = ''; img.width = 256; img.height = 256; img.decoding = 'async';
    art.append(img);
    const title = document.createElement('div'); title.className = 'card-title'; title.textContent = r.name;
    const desc = document.createElement('div'); desc.className = 'card-desc';
    desc.textContent = r.reqLvl <= 10 ? `Alcanza nivel ${r.reqLvl}` : `Detona ${r.reqLvl - 9} núcleos acumulados`;
    const status = document.createElement('span'); status.className = 'relic-status'; status.textContent = unlocked ? 'OBTENIDA' : 'BLOQUEADA';
    card.append(art, title, desc, status); fragment.append(card);
  }
  grid.replaceChildren(fragment);
  const legacy=document.getElementById("legacyRecord");if(legacy)legacy.textContent="Récord V3–V19: "+Math.max(0,Number(STORE.get("kosen_v3_best",0))||0).toLocaleString();
}

function setTab(tab) {
  if (tab==='play' && FaultBoundary.active()) return;
  const vault=document.getElementById('vaultModal');
  const tourney=document.getElementById('tournamentModal');
  const btnPlay=document.getElementById('btnPlay');
  const btnVault=document.getElementById('btnVault');
  const btnTournament=document.getElementById('btnTournament');
  resetFrameClock();
  if(tab==='vault'||tab==='tournament') {
    paused=true;clearInput();
    if(tab==='vault')renderVault();
    else if(typeof TournamentPreview==='undefined') {
      document.getElementById('tournamentStatus').textContent='CALENDARIO NO DISPONIBLE · RECARGA LA PÁGINA';
    } else TournamentPreview.refresh();
  } else {
    paused=false;
    if(document.activeElement instanceof HTMLButtonElement)document.activeElement.blur();
  }
  vault.classList.toggle('open',tab==='vault');
  vault.setAttribute('aria-hidden',String(tab!=='vault'));
  tourney.classList.toggle('open',tab==='tournament');
  tourney.setAttribute('aria-hidden',String(tab!=='tournament'));
  btnPlay.classList.toggle('active',tab==='play');
  btnVault.classList.toggle('active',tab==='vault');
  btnTournament.classList.toggle('active',tab==='tournament');
}





function updateComboHud(){
 const n=state.combo,hud=document.getElementById('comboHud');
 document.getElementById('v2ComboNumber').textContent='×'+Math.max(1,n);
 document.getElementById('v2ComboTier').textContent=n>=6?'PRISMA':n>=4?'RESONANCIA':n>=2?'CADENA':'LISTO';
 document.getElementById('v2ComboFill').style.width=Math.min(100,n/6*100)+'%';hud.classList.toggle('active',n>1);
}
const muteBtn=document.getElementById('btnMute');
const musicBtn=document.getElementById('btnMusicMode');
const musicVolumeInput=document.getElementById('musicVolume');
const musicVolumeValue=document.getElementById('musicVolumeValue');
function syncMute(){
  muteBtn.setAttribute('aria-pressed',String(muted));
  muteBtn.textContent=muted?'♪×':'♪';
  muteBtn.setAttribute('aria-label',muted?'Activar sonido':'Silenciar sonido');
  AudioEngine.syncMute();
}
function syncMusicControls(){
  const settings=AudioEngine.debugStatus();
  musicBtn.setAttribute('aria-pressed',String(settings.musicEnabled));
  musicBtn.textContent=settings.musicEnabled?'MÚSICA: SÍ':'MÚSICA: NO';
  musicVolumeInput.value=String(Math.round(settings.musicVolume*100));
  musicVolumeValue.textContent=musicVolumeInput.value+'%';
}
function toggleMusic(){
  const enabled=!AudioEngine.debugStatus().musicEnabled;
  AudioEngine.setMusicEnabled(enabled);
  syncMusicControls();
  showToast(enabled?'♫ MÚSICA ACTIVADA':'♫ MÚSICA DESACTIVADA');
}
muteBtn.addEventListener('click',()=>{muted=!muted;STORE.set('kosen_muted',muted);AudioEngine.unlock();syncMute();});
musicBtn.addEventListener('click',toggleMusic);
musicVolumeInput.addEventListener('input',()=>{
  AudioEngine.setMusicVolume(Number(musicVolumeInput.value)/100);
  syncMusicControls();
});
document.addEventListener('visibilitychange',()=>{resetFrameClock();if(document.hidden)AudioEngine.pauseMusic();});
window.addEventListener('blur',resetFrameClock);
window.addEventListener('keydown',event=>{
  if(event.code!=='KeyM'||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
  if(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))return;
  event.preventDefault();toggleMusic();
});
// Mobile browsers require a user gesture before allowing Web Audio playback.
document.addEventListener('pointerdown',()=>AudioEngine.unlock(),{capture:true,passive:true});
document.addEventListener('keydown',event=>{
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||''))return;
  if(!event.repeat)AudioEngine.unlock();
},{capture:true});
syncMute();syncMusicControls();

// V22: optional renderer quality, does not modify positions, hitboxes, or gameplay speed.
const qualitySelect=document.getElementById('renderQuality');
qualitySelect.value=renderQuality;
qualitySelect.addEventListener('change',()=>{
  renderQuality=qualitySelect.value==='eco'?'eco':'auto';
  STORE.set('kosen_render_quality',renderQuality);
  resize();
  resetFrameClock();
});
const debugHud=document.getElementById('debugHud');
debugHud.hidden=!perf.visible;
document.addEventListener('keydown',event=>{
  if(event.code!=='F3'||event.repeat)return;
  if(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))return;
  event.preventDefault();perf.visible=!perf.visible;debugHud.hidden=!perf.visible;
  perf.start=0;perf.frames=0;perf.steps=0;perf.drawMs=0;perf.drawPeak=0;
  perf.renderStages=Object.create(null);
});

resize();
renderVault();
resetGame();
requestAnimationFrame(loop);
window.__FRUTIDRY_BOOT_READY__ = true;
