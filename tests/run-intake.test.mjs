import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunIntake, memoryRunStore, inspectDiagnostic, RunIntakeError,
  RUN_LOGICAL_VIEWPORT, RUN_SESSION_MS} from '../server/run-intake.mjs';
import {mongoRunStore} from '../server/run-mongo.mjs';
import {createAccountApi} from '../server/account-http.mjs';

const ORIGIN='https://atanatus.github.io';
const UID='firebase_uid_42';
const other='firebase_uid_other';
let millis=Date.UTC(2026,10,22,18);
const clock=()=>new Date(millis);
function makeService(store=memoryRunStore()) {
  return createRunIntake({store,now:clock});
}
function diagnostic(run) {
  return {
    format:'kosen-berkan-run-diagnostic',schema:2,gameVersion:24,rulesVersion:20,
    seed:run.seed,viewport:{...RUN_LOGICAL_VIEWPORT,dpr:1,renderQuality:'auto'},
    practice:false,status:'finished',recording:{complete:true},
    stats:{simFrame:60,score:280},checkpoint:{simFrame:60,score:280,gameOver:true},
    actions:[{s:1,a:.2,angleExact:.2}],
    inputs:[{s:0,v:[0,0,0,0]}],checkpoints:[]
  };
}
async function throwsCode(fn, code) {
  await assert.rejects(fn, e=>e instanceof RunIntakeError&&e.code===code);
}
async function serverWith(runIntake) {
  const api=createAccountApi({verifyToken: async token=>{
      if(token==='invalid')throw Error('revoked');
      return {uid:token==='other'?other:UID};
    },accountStore:{getOrCreate:async uid=>({_id:uid,xp:0,suspended:false})},
    allowedOrigins:[ORIGIN],now:clock,runIntake});
  await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  return {api, url:`http://127.0.0.1:${api.address().port}`};
}
function post(url, value, options={}) {
  return fetch(url,{method:'POST',headers:{Origin:ORIGIN, Authorization:'Bearer test',
    'Content-Type':'application/json',...options.headers},body:JSON.stringify(value)});
}

test('session uses server RNG, fixed viewport and explicitly disables XP and cash', async()=>{
  const intake=makeService();const run=await intake.start(UID);
  assert.match(run.id,/^[0-9a-f-]{36}$/);
  assert.equal(run.seed>=1&&run.seed<=2147483647,true);
  assert.deepEqual(run.viewport,RUN_LOGICAL_VIEWPORT);
  assert.equal(run.rulesVersion,20);assert.equal(run.gameVersion,24);
  assert.equal(run.awardsEnabled,false);
  assert.equal(Date.parse(run.expiresAt)-millis,RUN_SESSION_MS);
});

test('separate sessions have different identifiers',async()=>{
  const s=makeService();const a=await s.start(UID);const b=await s.start(UID);
  assert.notEqual(a.id,b.id);
});

test('well-formed report is only QUEUED, with zero XP and no leaderboard',async()=>{
  const store=memoryRunStore(),s=makeService(store),run=await s.start(UID);
  const result=await s.submit(UID,run.id,diagnostic(run));
  assert.equal(result.status,'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(result.xpGranted,0);assert.equal(result.ranked,false);assert.equal(result.eligibleForPrizes,false);
  const stored=store.records.get(run.id);
  assert.equal(stored.status,result.status);assert.equal(JSON.parse(stored.diagnosticJson).stats.score,280);
  assert.equal(typeof stored.reportHash,'string');assert.equal(stored.reportHash.length,64);
});

test('duplicate submission rejected, remains exactly one receipt',async()=>{
  const s=makeService(),run=await s.start(UID),report=diagnostic(run);
  await s.submit(UID,run.id,report);
  await throwsCode(()=>s.submit(UID,run.id,report),'RUN_ALREADY_SUBMITTED');
});

test('cross-user sessions do not leak ownership',async()=>{
  const s=makeService(),run=await s.start(UID);
  await throwsCode(()=>s.submit(other,run.id,diagnostic(run)),'RUN_NOT_FOUND');
});

test('expired session rejected even with a perfect-looking report',async()=>{
  const s=makeService(),run=await s.start(UID);
  millis+=RUN_SESSION_MS;
  try{await throwsCode(()=>s.submit(UID,run.id,diagnostic(run)),'RUN_EXPIRED');}
  finally{millis-=RUN_SESSION_MS;}
});

test('server seed, rules and viewport mismatches rejected',async()=>{
  const s=makeService(),run=await s.start(UID),base=diagnostic(run);
  for(const [key, mutate, error] of [
    ['seed',r=>{r.seed++},'SERVER_SEED_MISMATCH'],
    ['view',r=>{r.viewport.width=1366},'SERVER_VIEWPORT_MISMATCH'],
    ['rules',r=>{r.rulesVersion=21},'RULES_MISMATCH'],
    ['schema',r=>{r.schema=99},'RULES_MISMATCH']]) {
      const r=structuredClone(base);mutate(r);
      await throwsCode(()=>s.submit(UID,run.id,r),error);
  }
});

test('unfinished practice incomplete and inconsistent results rejected',async()=>{
  const s=makeService(),run=await s.start(UID),base=diagnostic(run);
  for(const [mutate,code] of [
    [r=>{r.practice=true},'UNFINISHED_OR_PRACTICE'],
    [r=>{r.status='in_progress'},'UNFINISHED_OR_PRACTICE'],
    [r=>{r.recording.complete=false},'INCOMPLETE_RECORDING'],
    [r=>{r.stats.score=9999},'INCONSISTENT_RESULT'],
    [r=>{r.checkpoint.gameOver=false},'INCONSISTENT_RESULT'],
    [r=>{r.stats.simFrame=0},'INCONSISTENT_RESULT']]) {
    const r=structuredClone(base);mutate(r);await throwsCode(()=>s.submit(UID,run.id,r),code);
  }
});

test('client-supplied XP rank and identity fields rejected even though XP is never awarded',async()=>{
  const s=makeService(),run=await s.start(UID);
  for(const key of ['xp','xpAwarded','accountLevel','uid','winner','tournamentId','reward']){
    const r=diagnostic(run);r[key]=123;
    await throwsCode(()=>s.submit(UID,run.id,r),'CLIENT_REWARDS_FORBIDDEN');
  }
});

test('logs reject backwards or invalid events and malformed periodic checkpoint',async()=>{
  const s=makeService(),run=await s.start(UID),base=diagnostic(run);
  for(const [mutate,code] of [
    [r=>{r.actions=[{s:40,a:.2,angleExact:.2},{s:2,a:.3,angleExact:.3}]},'INVALID_ACTION_LOG'],
    [r=>{r.inputs=[{s:2,v:[0,0,0,0]},{s:1,v:[0,0,0,0]}]},'INVALID_INPUT_LOG'],
    [r=>{r.inputs=[{s:0,v:[999,0,0,0]}]},'INVALID_INPUT_LOG'],
    [r=>{r.checkpoints=[{s:31,state:{simFrame:31}}]},'INVALID_PERIODIC_CHECKPOINT']]){
      const r=structuredClone(base);mutate(r);await throwsCode(()=>s.submit(UID,run.id,r),code);
  }
});

test('JSON record size is capped before Mongo persistence',async()=>{
  const s=makeService(),run=await s.start(UID),report=diagnostic(run);
  report.extra='X'.repeat(2*1024*1024+1);
  await throwsCode(()=>s.submit(UID,run.id,report),'TRACE_LIMIT_EXCEEDED');
});

test('production default denies both authenticated and unauthenticated run creation',async()=>{
  const {api,url}=await serverWith(null);
  try{
    let r=await post(url+'/api/v1/runs',{});assert.equal(r.status,423);
    assert.deepEqual(await r.json(),{error:'RUN_VERIFICATION_DISABLED'});
    r=await post(url+'/api/v1/runs/00000000-0000-0000-0000-000000000000/diagnostic',{diagnostic:{}});
    assert.equal(r.status,423);
  }finally{await new Promise(resolve=>api.close(resolve));}
});

test('test-only injected HTTP route uses verified UID, never accepts client seed or score',async()=>{
  const store=memoryRunStore(),intake=makeService(store),{api,url}=await serverWith(intake);
  try{
    let r=await post(url+'/api/v1/runs',{seed:3333});assert.equal(r.status,400);
    assert.equal((await r.json()).error,'CLIENT_RUN_SETTINGS_FORBIDDEN');
    r=await post(url+'/api/v1/runs',{});assert.equal(r.status,201);
    const {run}=await r.json();assert.equal(run.awardsEnabled,false);
    r=await post(url+`/api/v1/runs/${run.id}/diagnostic`,{diagnostic:diagnostic(run)});
    assert.equal(r.status,202);
    const {receipt}=await r.json();assert.equal(receipt.xpGranted,0);
    r=await post(url+`/api/v1/runs/${run.id}/diagnostic`,{diagnostic:diagnostic(run)});
    assert.equal(r.status,409);
  }finally{await new Promise(resolve=>api.close(resolve));}
});

test('HTTP rejects foreign origin, missing and revoked token, wrong MIME, extra fields',async()=>{
  const s=makeService(),{api,url}=await serverWith(s);
  try{
    let r=await fetch(url+'/api/v1/runs',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer test','Content-Type':'application/json'},body:'{}'});
    assert.equal(r.status,403);
    r=await fetch(url+'/api/v1/runs',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}'});
    assert.equal(r.status,401);
    r=await post(url+'/api/v1/runs',{}, {headers:{Authorization:'Bearer invalid'}});
    assert.equal(r.status,401);
    r=await fetch(url+'/api/v1/runs',{method:'POST',headers:{Origin:ORIGIN,Authorization:'Bearer test','Content-Type':'text/plain'},body:'{}'});
    assert.equal(r.status,415);
    r=await post(url+'/api/v1/runs',[]);assert.equal(r.status,400);
  }finally{await new Promise(resolve=>api.close(resolve));}
});

test('Mongo claim is atomic and scoped to UID, expiry and one ISSUED state',async()=>{
  let got={};const c={insertOne:async v=>{got.insert=v},findOne:async q=>{got.find=q},
    updateOne:async(filter,update)=>{got.filter=filter;got.update=update;return {modifiedCount:1}}};
  const store=mongoRunStore(c);
  await store.insert({_id:'hello'});await store.find('hello');
  const at=clock();assert.equal(await store.claim('hello',UID,at,{scoreClaimed:12}),true);
  assert.deepEqual(got.filter,{_id:'hello',uid:UID,status:'ISSUED',expiresAt:{$gt:at}});
  assert.equal(got.update.$set.status,'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(got.update.$set.scoreClaimed,12);
});
