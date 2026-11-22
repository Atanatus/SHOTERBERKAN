// V24 replay: deterministic at a fixed logical viewport with version-matched inputs.
// A diagnostic is NOT proof of legitimate play and cannot protect client-side rankings.
const ReplayLab = (() => {
  const output=document.getElementById('replayStatus');
  const fileInput=document.getElementById('replayFile');
  let trace=null, actionAt=0, inputAt=0, checkpointAt=0, applying=false, lastInput=null;
  const CHECKPOINT_INTERVAL=600; // one semantic snapshot every ten simulated seconds
  const MAX_STEPS=60*60*60; // one hour of simulation; guard against unbounded uploads
  function isApplying(){return applying;}
  // Each ritual owns its own input-delta baseline. Without this, a repeated
  // initial input can be omitted when starting a second ritual in the same tab.
  function resetRecording(){lastInput=null;}
  function status(message,bad=false){output.textContent=message;output.dataset.error=String(bad);}
  function piece(p){if(!p)return null;return [p.level??0,p.kind??'normal',p.fruit?.id??null,Number(!!p.isBomb),Number(!!p.isSkull),Number(!!p.isSuperballNode)];}
  function snapshot(){return {
    simFrame:state.simFrame,tick:state.tick,score:state.score,shield:state.shieldIntegrity,
    combo:state.combo,shots:state.shotCount, bestCombo:state.bestCombo,
    milestone:state.milestoneIndex,phase:Number(state.trackPhase.toFixed(10)),
    tempo:state.tempoMult,tempoTimer:state.tempoTimer,centerLevel:state.centerLevel,
    slots:state.slots.map(piece),current:piece(state.nextPiece),reserve:piece(state.upcomingPiece),
    projectile:state.projectile? [piece(state.projectile), ...['x','y','vx','vy'].map(k=>Number(state.projectile[k].toFixed(8)))]:null,
    pendingAmmo:!!state.pendingAmmo,chain:state.chain?{...state.chain}:null,
    superCooldown:state.superCooldown,shotsSinceSpecial:state.shotsSinceSpecial,
    healDrought:state.healDrought, rng:state.rng.inspect(), gameOver:!!state.gameOver
  };}
  function input(){return [Number(state.aimAngle.toFixed(9)),Number(!!state.isAiming),Number(!!keyState.left),Number(!!keyState.right)];}
  function validate(raw){
    if(!raw||raw.format!=='kosen-berkan-run-diagnostic'||raw.schema!==2||raw.gameVersion!==24||raw.rulesVersion!==20)throw Error('Se requiere diagnóstico V24 con reglas 20');
    if(!Number.isSafeInteger(raw.seed)||raw.seed<1||raw.seed>2147483647)throw Error('Semilla inválida');
    if(!raw.viewport||raw.viewport.width!==width||raw.viewport.height!==height)throw Error(`Pantalla incompatible: replay ${raw.viewport?.width}×${raw.viewport?.height}; actual ${width}×${height}`);
    if(!raw.stats||!Number.isSafeInteger(raw.stats.simFrame)||raw.stats.simFrame<1||raw.stats.simFrame>MAX_STEPS)throw Error('Número de pasos inválido');
    if(!raw.checkpoint||raw.checkpoint.simFrame!==raw.stats.simFrame)throw Error('Checkpoint ausente o incoherente');
    if(!Array.isArray(raw.actions)||!Array.isArray(raw.inputs)||raw.actions.length>100000||raw.inputs.length>MAX_STEPS)throw Error('Demasiados eventos');
    let last=-1;
    for(const a of raw.actions){
      if(!a||!Number.isSafeInteger(a.s)||a.s<0||a.s>raw.stats.simFrame||a.s<last)throw Error('Orden de acciones inválido');
      if(a.a!=='swap' && (typeof a.a!=='number'||!Number.isFinite(a.a)||Math.abs(a.a)>MAX_AIM_ANGLE+.001||!Number.isFinite(a.angleExact)||Math.abs(a.angleExact)>MAX_AIM_ANGLE+.001))throw Error('Acción inválida');
      last=a.s;
    }
    last=-1;
    for(const i of raw.inputs){
      if(!i||!Number.isSafeInteger(i.s)||i.s<0||i.s>=raw.stats.simFrame||i.s<=last||!Array.isArray(i.v)||i.v.length!==4)throw Error('Entrada inválida');
      if(!Number.isFinite(i.v[0])||Math.abs(i.v[0])>MAX_AIM_ANGLE+.001||!i.v.slice(1).every(x=>x===0||x===1))throw Error('Valor de entrada inválido');
      last=i.s;
    }
    if(raw.actions.some(a=>a.s===raw.stats.simFrame))throw Error('Acciones posteriores al checkpoint');
    // Periodic checkpoints are optional so exports from V24–V28 still replay.
    if(raw.checkpoints!==undefined){
      if(!Array.isArray(raw.checkpoints)||raw.checkpoints.length>Math.floor(raw.stats.simFrame/CHECKPOINT_INTERVAL))throw Error('Cantidad de checkpoints inválida');
      let prior=0;
      for(const cp of raw.checkpoints){
        if(!cp||!Number.isSafeInteger(cp.s)||cp.s<=prior||cp.s>raw.stats.simFrame||cp.s%CHECKPOINT_INTERVAL!==0||!cp.state||Array.isArray(cp.state)||typeof cp.state!=='object'||cp.state.simFrame!==cp.s)throw Error('Checkpoint periódico inválido');
        prior=cp.s;
      }
    }
    return raw;
  }
  function begin(raw){
    const data=validate(raw);
    // This call cannot grant permanent rewards, even if the imported file claims otherwise.
    resetGame(data.seed);
    state.replayActive=true;state.replayData={steps:data.stats.simFrame};
    trace=data;actionAt=0;inputAt=0;checkpointAt=0;lastInput=null;
    setTab('play');
    status(`▶ REPLAY · ${data.seed} · paso 0/${data.stats.simFrame}`);
    showToast('▶ REPRODUCCIÓN LOCAL · SIN RÉCORD');
  }
  function stop(message,bad){
    trace=null;applying=false;state.replayActive=false;state.replayData=null;
    clearInput();status(message,bad);
    // A replay may finish at game-over. In that case the game-over overlay sits
    // above the Codex, so surface the verification result on the visible overlay.
    if(state.gameOver){
      const result=document.getElementById('auditHash');
      if(result)result.textContent=message;
    }else{
      // Keep the laboratory seed in force: resumed play must not grant rewards.
      setTab('vault');
    }
  }
  function beforeStep(){
    if(!state.replayActive){
      const v=input();
      if(!lastInput||!v.every((n,i)=>n===lastInput[i])){
        state.inputLog.push({s:state.simFrame,v});lastInput=v;
      }
      return;
    }
    if(!trace)return;
    // Resizing changes lane geometry and projectile physics: stop rather than
    // continuing with an invalid viewport and reporting a misleading result.
    if(width!==trace.viewport.width||height!==trace.viewport.height){
      stop(`✕ REPLAY DETENIDO · tamaño del tablero modificado (${width}×${height})`,true);
      return false;
    }
    try {
      // The input events were accepted between simulation steps, in their original order.
      while(actionAt<trace.actions.length && trace.actions[actionAt].s===state.simFrame){
        const a=trace.actions[actionAt++];
        const before=state.actionLog.length;
        applying=true;
        try{
          if(a.a==='swap')swapActiveAndUpcoming();
          else{state.aimAngle=a.angleExact;shoot();}
        }finally{
          // Never leave the replay-only action gate open after an exception.
          applying=false;
        }
        if(state.actionLog.length!==before+1)throw Error(`Acción rechazada en paso ${state.simFrame}`);
        const made=state.actionLog[before];
        if(made.l!==a.l||made.k!==a.k||made.f!==a.f||made.m!==a.m||Math.abs(made.p-a.p)>.0002)throw Error(`Divergencia de munición/circuito en paso ${state.simFrame}`);
      }
      while(inputAt<trace.inputs.length && trace.inputs[inputAt].s===state.simFrame){
        const v=trace.inputs[inputAt++].v;
        state.aimAngle=v[0];state.isAiming=!!v[1];keyState.left=!!v[2];keyState.right=!!v[3];
      }
    }catch(e){stop('REPLAY DIVERGENTE: '+e.message,true);return false;}
  }
  function afterStep(){
    if(!state.replayActive){
      // Cheap, opt-in-by-default semantic tracing. No particles, audio or layout.
      // A reset initializes the array before a new run can produce snapshots.
      if(state.simFrame>0&&state.simFrame%CHECKPOINT_INTERVAL===0 &&
         state.traceCheckpoints && state.traceCheckpoints.length<MAX_STEPS/CHECKPOINT_INTERVAL &&
         state.traceCheckpoints.at(-1)?.s!==state.simFrame){
        state.traceCheckpoints.push({s:state.simFrame,state:snapshot()});
      }
      return;
    }
    if(!trace)return;
    if(width!==trace.viewport.width||height!==trace.viewport.height){
      stop(`✕ REPLAY DETENIDO · tamaño del tablero modificado (${width}×${height})`,true);
      return;
    }
    // The main loop stops advancing when game-over occurs. Without this check
    // a replay that terminates before its checkpoint remains stuck forever.
    if(state.gameOver && state.simFrame<trace.stats.simFrame){
      stop(`✕ REPLAY DIVERGENTE · partida terminada en paso ${state.simFrame}/${trace.stats.simFrame}`,true);
      return;
    }
    // Fail at the earliest known divergence instead of only at the final state.
    const periodic=trace.checkpoints||[];
    if(checkpointAt<periodic.length&&periodic[checkpointAt].s===state.simFrame){
      const expectedPeriodic=periodic[checkpointAt++].state;
      const actualPeriodic=snapshot();
      if(JSON.stringify(actualPeriodic)!==JSON.stringify(expectedPeriodic)){
        const fields=Object.keys(expectedPeriodic).filter(k=>JSON.stringify(actualPeriodic[k])!==JSON.stringify(expectedPeriodic[k])).slice(0,5).join(', ');
        stop(`✕ REPLAY DIVERGENTE · checkpoint en paso ${state.simFrame} · campos: ${fields}`,true);
        return;
      }
    }
    if(state.simFrame<trace.stats.simFrame)return;
    const actual=snapshot(),expected=trace.checkpoint;
    // Only semantic state is compared; particle positions and audio are intentionally omitted.
    const ok=JSON.stringify(actual)===JSON.stringify(expected);
    const msg=ok?`✓ REPLAY VERIFICADO · ${state.simFrame} pasos · ${state.score.toLocaleString()} puntos`:
      `✕ REPLAY DIVERGENTE · paso ${state.simFrame} · campos: ${Object.keys(expected).filter(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k])).slice(0,5).join(', ')}`;
    stop(msg,!ok);
  }
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    try{
      if(file.size>5*1024*1024)throw Error('Archivo superior a 5 MB');
      const raw=JSON.parse(await file.text());begin(raw);
    }catch(e){status('Reproducción rechazada: '+e.message,true);}
    finally{fileInput.value='';}
  });
  document.getElementById('btnImportReplay').addEventListener('click',()=>fileInput.click());
  return{snapshot,input,beforeStep,afterStep,begin,validate,isApplying,resetRecording};
})();
