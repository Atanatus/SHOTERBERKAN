// V22: 60 Hz fixed-step simulation retained. Rendering stops behind full-screen overlays.
// Press F3 or use ?debug=1 for a small, low-overhead diagnostic readout.
const perf={visible:new URLSearchParams(location.search).get('debug')==='1',frames:0,steps:0,drawMs:0,drawPeak:0,start:0,fps:0};
let lastFrame=0,accumulator=0,lastRender=0;
function loop(now){
 if(!lastFrame)lastFrame=now;
 const elapsed=Math.min(100,Math.max(0,now-lastFrame));lastFrame=now;
 const active=!paused&&!document.hidden&&!state.gameOver;
 let steps=0;
 if(active){accumulator+=elapsed;while(accumulator>=1000/60&&steps<5){update();if(typeof ReplayLab!=='undefined')ReplayLab.afterStep();accumulator-=1000/60;steps++;if(state.gameOver||paused)break;}if(steps===5)accumulator=0;}else accumulator=0;
 if(active){updateAstralFX(elapsed/1000);updateLanePulses(elapsed/1000);updateImpactFX(elapsed/1000);if(!natureMotion.matches)natureTime+=elapsed/1000;}else if(state.gameOver){astralBursts.length=0;lanePulses.length=0;resetImpactFX();}
 AudioEngine.tick(state,!active);
 // The Códice and game-over screens fully cover the canvas: skip needless redraws.
 // Cap rendering to roughly 60 Hz, while keeping the fixed simulation unchanged.
 const shouldDraw=active && (now-lastRender>=1000/60-1 || !lastRender);
 if(shouldDraw){
   const start=perf.visible?performance.now():0;
   draw();lastRender=lastRender ? Math.max(now-1000/60,lastRender+1000/60) : now;
   if(perf.visible){const ms=performance.now()-start;perf.frames++;perf.steps+=steps;perf.drawMs+=ms;perf.drawPeak=Math.max(perf.drawPeak,ms);updatePerfPanel(now);}
 }
 requestAnimationFrame(loop);
}
function updatePerfPanel(now){
 if(!perf.visible)return;
 if(!perf.start)perf.start=now;
 if(now-perf.start<1000)return;
 const d=(now-perf.start)/1000;
 const dpr=canvas.width/Math.max(1,width);
 perf.sample = {fps:Number((perf.frames/d).toFixed(1)),drawMeanMs:Number((perf.drawMs/Math.max(1,perf.frames)).toFixed(2)),drawPeakMs:Number(perf.drawPeak.toFixed(2)),ticksPerSecond:Number((perf.steps/d).toFixed(1))};
 document.getElementById('debugHud').textContent=[
  `${GAME_BRAND.name} V28 · ${renderQuality.toUpperCase()} · F3 cerrar`,
  `FPS render: ${(perf.frames/d).toFixed(1)} / 60`,
  `Render medio: ${(perf.drawMs/Math.max(1,perf.frames)).toFixed(2)} ms`,
  `Render máximo: ${perf.drawPeak.toFixed(2)} ms`,
  `Simulación: ${(perf.steps/d).toFixed(1)} ticks/s`,
  `Canvas: ${canvas.width} × ${canvas.height} (${dpr.toFixed(2)}x)`,
  `Partículas: ${state.particles.length} · FX: ${astralBursts.length+lanePulses.length}`,
  `Rutas cacheadas: ${routeCache.size}`
 ].join('\n');
 perf.start=now;perf.frames=0;perf.steps=0;perf.drawMs=0;perf.drawPeak=0;
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
    img.src = RELIC_ART[r.id - 1]; img.alt = ''; img.width = 256; img.height = 256; img.decoding = 'async';
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
  const modal = document.getElementById('vaultModal');
  const btnPlay = document.getElementById('btnPlay');
  const btnVault = document.getElementById('btnVault');
  if (tab === 'vault') {
    paused=true;clearInput();renderVault(); modal.classList.add('open');
    btnVault.classList.add('active'); btnPlay.classList.remove('active');
  } else {
    paused=false;modal.classList.remove('open');if(document.activeElement instanceof HTMLButtonElement)document.activeElement.blur();
    btnPlay.classList.add('active'); btnVault.classList.remove('active');
  }
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
document.addEventListener('visibilitychange',()=>{if(document.hidden)AudioEngine.pauseMusic();});
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
});
const debugHud=document.getElementById('debugHud');
debugHud.hidden=!perf.visible;
document.addEventListener('keydown',event=>{
  if(event.code!=='F3'||event.repeat)return;
  if(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))return;
  event.preventDefault();perf.visible=!perf.visible;debugHud.hidden=!perf.visible;
  perf.start=0;perf.frames=0;perf.steps=0;perf.drawMs=0;perf.drawPeak=0;
});

resize();
renderVault();
resetGame();
requestAnimationFrame(loop);
