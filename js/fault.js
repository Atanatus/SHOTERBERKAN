// V33 · Fail-closed boundary for unrecoverable client errors.
// Preserve permanent progress, halt potentially inconsistent gameplay, and
// offer an explicit restart + local crash report. No telemetry or uploads.
const FaultBoundary = (() => {
  const overlay = document.getElementById('faultOverlay');
  const detail = document.getElementById('faultDetails');
  let fault = null;
  let reporting = false;
  const VERSION = 33;

  function safeState() {
    try {
      if (typeof state === 'undefined' || !state) return null;
      const keys = ['seed','simFrame','tick','score','shieldIntegrity','shotCount',
        'milestoneIndex','replayActive','traceIncomplete','gameOver'];
      const out = {};
      for (const key of keys) {
        const value = state[key];
        if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') out[key] = value;
      }
      return out;
    } catch {return null;}
  }
  function sanitizeError(error) {
    const value = error instanceof Error ? error : new Error(String(error ?? 'Error desconocido'));
    return {
      name: String(value.name).slice(0,80),
      message: String(value.message).slice(0,300),
      stack: typeof value.stack === 'string' ? value.stack.slice(0,2500) : ''
    };
  }
  function active() {return fault !== null;}
  function report(error, phase = 'ejecución') {
    if (fault || reporting) return;
    reporting = true;
    try {
      const err = sanitizeError(error);
      const context = safeState();
      fault = {format:'frutidry-local-crash',schema:1,gameVersion:VERSION,
        occurredAt:new Date().toISOString(),phase:String(phase).slice(0,80),
        error:err,context,viewport:{width:innerWidth,height:innerHeight}};
      // Never claim a partial run is a valid deterministic replay.
      try {
        paused = true;
        if (typeof state !== 'undefined' && state) {
          state.traceIncomplete = true;
          state.traceTruncationReason = 'Fallo de ejecución: '+fault.phase;
          state.replayActive = false;
        }
      } catch {}
      try {if(typeof clearInput === 'function')clearInput();} catch {}
      try {if(typeof resetFrameClock === 'function')resetFrameClock();} catch {}
      try {if(typeof AudioEngine !== 'undefined')AudioEngine.pauseMusic();} catch {}
      detail.textContent = `${fault.phase} · ${err.name}: ${err.message}`;
      overlay.hidden = false;
      // Focus after the overlay becomes visible; keyboard and mobile users can recover.
      document.getElementById('faultRestart').focus();
    } finally {reporting = false;}
  }
  function buildReport(){return fault ? JSON.parse(JSON.stringify(fault)) : null;}
  function exportReport() {
    if (!fault)return false;
    const json = JSON.stringify(fault,null,2);
    const url = URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
    const link = document.createElement('a');
    link.href=url;link.download='frutidry-crash-'+Date.now()+'.json';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30_000);
    return true;
  }
  function restart() {
    if (!fault)return false;
    // Clear only after the engine successfully starts a fresh ritual.
    try {
      if (typeof resetGame !== 'function' || typeof setTab !== 'function')
        throw Error('El motor no ha terminado de cargar. Recarga la página.');
      resetGame();
      fault=null;
      overlay.hidden=true;
      setTab('play');
      return true;
    } catch (err) {
      const failure=sanitizeError(err);
      detail.textContent=`El reinicio ha fallado: ${failure.message}. Usa RECARGAR.`;
      return false;
    }
  }
  document.getElementById('faultExport').addEventListener('click',exportReport);
  document.getElementById('faultRestart').addEventListener('click',restart);
  document.getElementById('faultReload').addEventListener('click',()=>location.reload());
  window.addEventListener('error',event=>{
    report(event.error ?? event.message,'error no controlado');
  });
  window.addEventListener('unhandledrejection',event=>{
    report(event.reason,'promesa rechazada');
    event.preventDefault();
  });
  return {active,report,buildReport,restart,exportReport};
})();
