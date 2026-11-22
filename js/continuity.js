// V24: portable progress and versioned deterministic replay diagnostics.
// Replays are local QA checks only; they cannot certify competitive results.
const ContinuityLab = (() => {
  const BACKUP_FORMAT = 'kosen-berkan-progress';
  const TRACE_FORMAT = 'kosen-berkan-run-diagnostic';
  const SAFE_MAX = 1_000_000_000_000;
  const status = document.getElementById('dataStatus');
  const input = document.getElementById('progressFile');
  let lastCompletedRun = null;

  function feedback(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function nonNegativeInt(value, maximum = SAFE_MAX) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('Valor numérico fuera de rango');
    return value;
  }
  function cleanHolder(value) {
    if (typeof value !== 'string') throw new Error('Nombre de récord incorrecto');
    const name = value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0,14);
    if (!name) throw new Error('Nombre de récord vacío');
    return name;
  }
  function validateBackup(data) {
    if (!data || Array.isArray(data) || typeof data !== 'object' || data.format !== BACKUP_FORMAT || data.schema !== 1 || !data.progress || !data.settings) {
      throw new Error('El archivo no es una copia de progreso V23 compatible');
    }
    const p = data.progress, s = data.settings;
    if (!Array.isArray(p.relics) || p.relics.length > 12 || !p.relics.every(id => Number.isInteger(id) && id >= 1 && id <= 12)) throw new Error('Listado de reliquias inválido');
    if (typeof s.muted !== 'boolean' || typeof s.musicEnabled !== 'boolean' || s.quality !== 'auto' && s.quality !== 'eco') throw new Error('Preferencias inválidas');
    if (typeof s.musicVolume !== 'number' || !Number.isFinite(s.musicVolume) || s.musicVolume < 0 || s.musicVolume > 1) throw new Error('Volumen inválido');
    return {
      best: nonNegativeInt(p.best),
      cores: nonNegativeInt(p.cores, 1_000_000_000),
      legacyBest: nonNegativeInt(p.legacyBest),
      holder: cleanHolder(p.holder),
      relics: [...new Set(p.relics)].sort((a,b) => a-b),
      muted: s.muted, musicEnabled: s.musicEnabled, musicVolume: s.musicVolume, quality: s.quality
    };
  }
  function createBackup() {
    return {
      format: BACKUP_FORMAT, schema: 1, gameVersion: 23, rulesVersion: 20,
      exportedAt: new Date().toISOString(),
      progress: {
        best: nonNegativeInt(state.best), holder: cleanHolder(state.recordHolder),
        cores: nonNegativeInt(state.coresDetonated, 1_000_000_000),
        relics: [...new Set(state.unlockedRelics)].sort((a,b)=>a-b),
        legacyBest: nonNegativeInt(Math.max(0, Number(STORE.get('kosen_v3_best',0)) || 0))
      },
      settings: {
        muted: Boolean(muted), quality: renderQuality,
        musicEnabled: AudioEngine.debugStatus().musicEnabled,
        musicVolume: AudioEngine.debugStatus().musicVolume
      }
    };
  }
  function downloadJSON(filename, data) {
    const json = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(new Blob([json], {type:'application/json;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function mergeBackup(raw) {
    const b = validateBackup(raw);
    // Complete validation occurs before storage changes; write failures roll back prior values.
    const mergedBest = Math.max(state.best, b.best);
    // An equal record is not an improvement: preserve the local holder on ties.
    const mergedHolder = b.best > state.best ? b.holder : state.recordHolder;
    const mergedCores = Math.max(state.coresDetonated, b.cores);
    const mergedRelics = [...new Set([...state.unlockedRelics, ...b.relics])].sort((a, c) => a-c);
    const mergedLegacy = Math.max(0, Number(STORE.get('kosen_v3_best',0)) || 0, b.legacyBest);
    const entries = [
      ['kosen_v20_best', mergedBest], ['kosen_v20_holder', mergedHolder],
      ['kosen_cores', mergedCores], ['kosen_relics', mergedRelics],
      ['kosen_v3_best', mergedLegacy], ['kosen_muted', b.muted],
      ['kosen_music_enabled', b.musicEnabled], ['kosen_music_volume', b.musicVolume],
      ['kosen_render_quality', b.quality]
    ];
    const before = new Map();
    try {
      for (const [key] of entries) before.set(key, localStorage.getItem(key));
      for (const [key,value] of entries) localStorage.setItem(key,JSON.stringify(value));
    } catch (err) {
      for (const [key,prev] of before) {
        try { if (prev===null) localStorage.removeItem(key); else localStorage.setItem(key,prev); } catch {}
      }
      throw new Error('No se pudo guardar el progreso (almacenamiento bloqueado o lleno)');
    }
    state.best = mergedBest;
    state.recordHolder = mergedHolder;
    state.coresDetonated = mergedCores;
    state.unlockedRelics = mergedRelics;
    muted = b.muted; renderQuality = b.quality;
    AudioEngine.setMusicEnabled(b.musicEnabled);
    AudioEngine.setMusicVolume(b.musicVolume);
    syncMute(); syncMusicControls();
    qualitySelect.value = renderQuality;
    resize(); renderVault(); updateHUD();
    return {best:mergedBest,cores:mergedCores,relics:mergedRelics.length};
  }
  function compactPiece(piece) {
    if (!piece) return null;
    return { level:piece.level ?? 0, kind:piece.kind ?? 'normal',
      fruit: piece.fruit?.id ?? null,
      bomb:Boolean(piece.isBomb),skull:Boolean(piece.isSkull),superball:Boolean(piece.isSuperballNode)
    };
  }
  function captureRun(reason = null) {
    return {
      format: TRACE_FORMAT, schema:2, gameVersion:24, rulesVersion:20,
      exportedAt:new Date().toISOString(), startedAt:state.startedAt,
      status:state.gameOver?'finished':'in_progress', reason:reason,
      practice:state.practiceSeed!==null, seed:state.seed,
      viewport:{width,height,dpr:canvas.width/Math.max(1,width),renderQuality},
      stats:{tick:state.tick,score:state.score,shield:state.shieldIntegrity,
        shots:state.shotCount,bestCombo:state.bestCombo,hito:state.milestoneIndex+1,simFrame:state.simFrame,
        cores:state.coresDetonated,centerLevel:state.centerLevel,tempo:state.tempoMult},
      board:state.slots.map(compactPiece),
      ammo:{current:compactPiece(state.nextPiece),reserve:compactPiece(state.upcomingPiece)},
      actions:state.actionLog.map(entry=>({...entry})),
      inputs:state.inputLog.map(entry=>({...entry})),
      checkpoint:typeof ReplayLab!=='undefined'?ReplayLab.snapshot():null,
      measuredPerformance:perf.sample ?? null,
      limitations:'Replay verification requires exact V24 rules and matching logical viewport; not an anti-cheat, ranking proof or cross-browser guarantee.'
    };
  }
  function finishRun(reason) {
    lastCompletedRun = captureRun(reason);
    try {
      const json = JSON.stringify(lastCompletedRun);
      if (json.length < 250_000) localStorage.setItem('kosen_v23_last_run', json);
    } catch {}
  }
  async function exportRun() {
    try {
      let data;
      if (state.actionLog.length || state.gameOver) data = captureRun(state.gameOver ? lastCompletedRun?.reason ?? 'Partida finalizada' : null);
      else data = lastCompletedRun ?? STORE.get('kosen_v23_last_run',null) ?? captureRun();
      // Digest is a tamper-detection aid for transport, NOT an anti-cheat verification.
      try {data.payloadSha256 = await sha256(JSON.stringify(data));} catch {data.hashUnavailable = true;}
      downloadJSON('kosen-berkan-diagnostico-'+Date.now()+'.json',data);
      feedback('Diagnóstico preparado. Incluye semilla, entradas, estado y resolución; no certifica la puntuación.');
    } catch (error) { feedback('Error al exportar diagnóstico: '+error.message,true); }
  }
  document.getElementById('btnExportProgress').addEventListener('click',()=>{
    try {downloadJSON('kosen-berkan-progreso-'+new Date().toISOString().slice(0,10)+'.json',createBackup());feedback('Copia de progreso preparada: conserva el JSON en un lugar seguro.');}
    catch(error){feedback('No se pudo exportar: '+error.message,true);}
  });
  document.getElementById('btnImportProgress').addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    try {
      if (file.size > 64*1024) throw new Error('El archivo supera el límite de 64 KB');
      const parsed=JSON.parse(await file.text());
      const result=mergeBackup(parsed);
      feedback(`Copia fusionada: récord ${result.best.toLocaleString()}, ${result.cores} núcleos y ${result.relics}/12 reliquias.`);
    } catch (error) {feedback('Importación rechazada: '+error.message,true);}
    finally {input.value='';}
  });
  document.getElementById('btnExportDiagnostic').addEventListener('click',exportRun);
  document.getElementById('btnDownloadRun').addEventListener('click',exportRun);
  document.getElementById('btnSeedRun').addEventListener('click',()=>{
    const value=Number(document.getElementById('seedInput').value);
    if (!Number.isSafeInteger(value) || value<1 || value>2147483647) {feedback('Introduce una semilla entera entre 1 y 2147483647.',true);return;}
    resetGame(value);
    setTab('play');
    showToast('LABORATORIO · SEMILLA '+value+' · SIN RÉCORD');
    feedback('Partida de laboratorio iniciada. No modifica el progreso permanente.');
  });
  return { createBackup, validateBackup, mergeBackup, captureRun, finishRun, feedback };
})();
