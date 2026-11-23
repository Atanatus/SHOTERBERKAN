// V47 · Bounded, fail-closed replay verification in disposable Node child processes.
// OS process boundary + V8 heap cap is NOT an operating-system security sandbox.
// No public HTTP route, XP, ranking, tournament entry or payment integration.
import {fork} from 'node:child_process';
import {inspectDiagnostic, RUN_REPORT_BYTES} from './run-intake.mjs';
import {MAX_HEADLESS_STEPS} from './headless-replay.mjs';

const DEFAULT_WORKER = new URL('./isolated-verifier-worker.mjs', import.meta.url);
const OUTCOME = (status, reason) => Object.freeze({
  status, reason, xpGranted:0, ranked:false, eligibleForPrizes:false
});
const REASONS = /^[A-Z0-9_]{1,64}$/;

export function createIsolatedVerifier({maxConcurrent=1,maxQueue=2,timeoutMs=20_000,
    workerFile=DEFAULT_WORKER, spawn=fork}={}) {
  if (!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4 ||
      !Number.isInteger(maxQueue)||maxQueue<0||maxQueue>16 ||
      !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000 ||
      typeof spawn!=='function') throw new TypeError('INVALID_VERIFIER_LIMITS');
  let active=0,closed=false;
  const queue=[];
  const children=new Set();
  const waiting=new Set();

  function runOne(packet) {
    return new Promise(resolve => {
      let child;
      try {
        child=spawn(workerFile, [], {
          execArgv:['--max-old-space-size=128'],
          stdio:['ignore','ignore','ignore','ipc'],
          env:{NODE_ENV:'production'},
          windowsHide:true,
          serialization:'json'
        });
      } catch { resolve(OUTCOME('DEFERRED','VERIFIER_SPAWN_FAILED'));return; }
      children.add(child);
      let settled=false;
      let timer;
      const finish = (result,terminate=true) => {
        if (settled) return;
        settled=true;
        clearTimeout(timer);
        children.delete(child);
        if (terminate && child.exitCode===null) { try {child.kill('SIGKILL');} catch {} }
        resolve(result);
      };
      waiting.add(finish);
      const finishTracked = (result,terminate=true) => {waiting.delete(finish);finish(result,terminate);};
      timer=setTimeout(()=>finishTracked(OUTCOME('DEFERRED','VERIFIER_TIMEOUT')),timeoutMs);
      child.once('error',()=>finishTracked(OUTCOME('DEFERRED','VERIFIER_PROCESS_ERROR')));
      child.once('exit',()=>finishTracked(OUTCOME('DEFERRED','VERIFIER_EXITED'),false));
      child.on('message',msg => {
        if (settled) return;
        if (msg?.kind!=='VERIFICATION_RESULT' || !msg.result || typeof msg.result!=='object') {
          finishTracked(OUTCOME('DEFERRED','VERIFIER_BAD_RESPONSE'));return;
        }
        const r=msg.result;
        const reason=REASONS.test(r.reason||'')?r.reason:'VERIFIER_BAD_RESPONSE';
        if (r.status==='REPLAY_CONSISTENT_NOT_ANTICHEAT' &&
            Number.isSafeInteger(r.steps) && r.steps>=1 && r.steps<=MAX_HEADLESS_STEPS &&
            Number.isSafeInteger(r.scoreRecomputed) && r.scoreRecomputed>=0 &&
            r.xpGranted===0 && r.ranked===false && r.eligibleForPrizes===false) {
          finishTracked(Object.freeze({...OUTCOME(r.status,'NONE'),
            steps:r.steps,scoreRecomputed:r.scoreRecomputed}));
        } else if (r.status==='REJECTED' && r.xpGranted===0 &&
            r.ranked===false && r.eligibleForPrizes===false) {
          finishTracked(OUTCOME('REJECTED',reason));
        } else {
          finishTracked(OUTCOME('DEFERRED','VERIFIER_BAD_RESPONSE'));
        }
      });
      try {
        child.send(packet, error=>{if(error)finishTracked(OUTCOME('DEFERRED','VERIFIER_IPC_ERROR'));});
      } catch {finishTracked(OUTCOME('DEFERRED','VERIFIER_IPC_ERROR'));}
    });
  }

  function pump() {
    while (!closed && active<maxConcurrent && queue.length) {
      const {packet,resolve}=queue.shift();
      active++;
      runOne(packet).then(resolve,()=>resolve(OUTCOME('DEFERRED','VERIFIER_PROCESS_ERROR')))
        .finally(()=>{active--;pump();});
    }
  }

  function verify(diagnostic,session) {
    if (closed) return Promise.resolve(OUTCOME('DEFERRED','VERIFIER_SHUTDOWN'));
    if (!session || !Number.isSafeInteger(session.seed) || session.seed<1 || session.seed>2147483647) {
      return Promise.resolve(OUTCOME('REJECTED','INVALID_SESSION'));
    }
    // JSON round trip makes IPC data-only, bounded and independent of caller mutation.
    let data,encoded;
    try {
      encoded=JSON.stringify(diagnostic);
      if (!encoded || Buffer.byteLength(encoded,'utf8')>RUN_REPORT_BYTES) {
        return Promise.resolve(OUTCOME('REJECTED','TRACE_LIMIT_EXCEEDED'));
      }
      data=JSON.parse(encoded);
      const {steps}=inspectDiagnostic(data,{seed:session.seed});
      if (steps>MAX_HEADLESS_STEPS) return Promise.resolve(OUTCOME('REJECTED','HEADLESS_STEP_LIMIT'));
    } catch (error) {
      return Promise.resolve(OUTCOME('REJECTED',REASONS.test(error?.code||'')?error.code:'INVALID_DIAGNOSTIC'));
    }
    if (active>=maxConcurrent && queue.length>=maxQueue) {
      return Promise.resolve(OUTCOME('DEFERRED','VERIFIER_BUSY'));
    }
    return new Promise(resolve=>{
      queue.push({packet:{kind:'VERIFY_DIAGNOSTIC',session:{seed:session.seed},diagnostic:data},resolve});
      pump();
    });
  }

  function close() {
    closed=true;
    for(const queued of queue.splice(0))queued.resolve(OUTCOME('DEFERRED','VERIFIER_SHUTDOWN'));
    for(const finish of [...waiting]) finish(OUTCOME('DEFERRED','VERIFIER_SHUTDOWN'));
    waiting.clear();
  }
  return Object.freeze({verify,close,stats:()=>Object.freeze({active,queued:queue.length,closed})});
}
