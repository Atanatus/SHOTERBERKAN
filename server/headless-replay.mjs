// FrutiDry V46 · trusted-source Node replay harness for local diagnostics.
// Not a payment, ranking, anti-cheat or XP service. Never execute uploaded JS.
import {readFileSync} from 'node:fs';
import {createContext, Script} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {webcrypto} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {inspectDiagnostic, RUN_LOGICAL_VIEWPORT} from './run-intake.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/config.js', 'js/simulation-core.js', 'js/data.js', 'js/game.js', 'js/continuity.js', 'js/replay.js'];
const SCRIPTS = FILES.map(name => new Script(readFileSync(resolve(ROOT, name), 'utf8'), {filename: name}));
const BOOT = new Script('resize(); resetGame(__seed);', {filename: 'headless-boot.js'});
const STEP = new Script('update(); ReplayLab.afterStep();', {filename: 'headless-step.js'});
const START_REPLAY = new Script('ReplayLab.begin(__diagnostic);', {filename: 'headless-begin.js'});
const ACTIVE = new Script('state.replayActive', {filename:'headless-active.js'});
const INSPECT = new Script('({ snapshot: ReplayLab.snapshot(), status: document.getElementById("replayStatus").textContent, active:state.replayActive, actions:state.actionLog.length, steps:state.simFrame })', {filename:'headless-inspect.js'});
const CAPTURE = new Script('ContinuityLab.captureRun();', {filename: 'headless-capture.js'});

export const HEADLESS_VERIFIER_VERSION = 1;
// A local QA limit; the intake format permits longer sessions. This is not a production SLA.
export const MAX_HEADLESS_STEPS = 36000;
export const MAX_HEADLESS_WALL_MS = 15000;

function element() {
  const cls = new Set();
  return {
    hidden:false, textContent:'', value:'', dataset:{}, style:{},
    classList:{add(v){cls.add(v);},remove(v){cls.delete(v);},contains(v){return cls.has(v);},toggle(v,on){if(on===undefined)on=!cls.has(v);on?cls.add(v):cls.delete(v);return on;}},
    addEventListener(){},removeEventListener(){},setAttribute(){},getAttribute(){return null;},
    blur(){},append(){},replaceChildren(){},click(){},hasPointerCapture(){return false;},releasePointerCapture(){},
    getBoundingClientRect(){return {left:0,top:0,width:390,height:844};}
  };
}
function makeContext(viewport) {
  const els = new Map();
  const document = {
    hidden:false, activeElement:null, addEventListener(){},
    getElementById(id) { if(!els.has(id))els.set(id,element());return els.get(id); }
  };
  const canvas=document.getElementById('gameCanvas');
  canvas.clientWidth=viewport.width;
  canvas.clientHeight=viewport.height;
  canvas.getContext=()=>({setTransform(){}});
  const noOp = ()=>{};
  const audio=new Proxy({}, {get(){return noOp;}});
  const sandbox={
    document, crypto:webcrypto, matchMedia:()=>({matches:false}),
    innerWidth:viewport.width,innerHeight:viewport.height,devicePixelRatio:1,
    addEventListener:noOp, setTimeout:()=>1,clearTimeout:noOp,
    HTMLInputElement:class HTMLInputElement{},HTMLButtonElement:class HTMLButtonElement{},
    localStorage:{getItem(){return null;},setItem:noOp,removeItem:noOp},
    AudioEngine:audio,updateHUD:noOp,renderVault:noOp, perf:{sample:null},
    showToast:null,
    startShotFX:noOp,finishShotFX:noOp,trackShotFX:noOp,startMergeFX:noOp,startCoreFX:noOp,
    addAstralFX:noOp,emitLanePulse:noOp,resetImpactFX:noOp,
    astralBursts:[],
    // Only gameplay functions from the local repository run in this context.
    // Node's vm is not a security boundary. This is trusted code plus inert JSON.
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  const context=createContext(sandbox, {name:'FrutiDry-headless'});
  for(const script of SCRIPTS) script.runInContext(context, {timeout:1000});
  new Script('function setTab(tab){paused = tab !== "play";}',{filename:'headless-tabs.js'}).runInContext(context,{timeout:1000});
  return context;
}

export function createHeadlessSession(seed, viewport = RUN_LOGICAL_VIEWPORT) {
  if(!Number.isSafeInteger(seed)||seed<1||seed>2147483647)throw new TypeError('INVALID_SEED');
  if(!viewport || viewport.width!==390 || viewport.height!==844)throw new TypeError('UNSUPPORTED_VIEWPORT');
  const ctx=makeContext(viewport);
  ctx.__seed=seed;
  BOOT.runInContext(ctx, {timeout:1000});
  return Object.freeze({
    get context() {return ctx;}, // QA only: not exposed over HTTP.
    step(){STEP.runInContext(ctx,{timeout:1000});},
    capture(){return structuredClone(CAPTURE.runInContext(ctx,{timeout:1000}));},
    inspect(){return structuredClone(INSPECT.runInContext(ctx,{timeout:1000}));}
  });
}

// Standalone diagnostic replay. The existing V24 action log and checkpoints
// are compared, but an exact replay still does not prove human play.
export function verifyHeadlessDiagnostic(diagnostic, session) {
  if(!session || !Number.isSafeInteger(session.seed))throw new TypeError('INVALID_SESSION');
  const {steps,scoreClaimed}=inspectDiagnostic(diagnostic,session);
  if(steps>MAX_HEADLESS_STEPS) return {status:'REJECTED',reason:'HEADLESS_STEP_LIMIT',xpGranted:0,ranked:false};
  const run=createHeadlessSession(session.seed);
  const ctx=run.context;
  // Input is a parsed JSON object, NEVER evaluated as code.
  ctx.__diagnostic=structuredClone(diagnostic);
  try {
    START_REPLAY.runInContext(ctx,{timeout:1000});
    const wallStart=performance.now();
    for(let i=0;i<steps;i++){
      if((i & 127)===0 && performance.now()-wallStart>MAX_HEADLESS_WALL_MS){
        return {status:'REJECTED',reason:'HEADLESS_TIME_BUDGET',xpGranted:0,ranked:false};
      }
      STEP.runInContext(ctx,{timeout:1000});
      if(!ACTIVE.runInContext(ctx,{timeout:1000})) {
        const state=INSPECT.runInContext(ctx,{timeout:1000});
        if(i!==steps-1 || !state.status.startsWith('✓ REPLAY VERIFICADO')) {
          return {status:'REJECTED',reason:'REPLAY_DIVERGENCE',at:i+1,xpGranted:0,ranked:false};
        }
        return {status:'REPLAY_CONSISTENT_NOT_ANTICHEAT',steps:i+1,scoreRecomputed:state.snapshot.score,
          scoreClaimed,xpGranted:0,ranked:false,eligibleForPrizes:false};
      }
    }
    return {status:'REJECTED',reason:'REPLAY_NOT_COMPLETED',xpGranted:0,ranked:false};
  }catch(error){
    // No raw script errors from untrusted sessions appear in public API.
    return {status:'REJECTED',reason:'REPLAY_ERROR',xpGranted:0,ranked:false};
  }
}
