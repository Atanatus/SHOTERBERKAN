import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createHeadlessSession,verifyHeadlessDiagnostic,MAX_HEADLESS_STEPS} from '../server/headless-replay.mjs';

// Created in genuine Chromium from the V45 browser engine, canvas 390×844.
// This fixture is deliberately kept frozen to detect browser ↔ Node drift.
const browserTrace=JSON.parse(readFileSync(new URL('./fixtures/v46-browser-finished.json',import.meta.url),'utf8'));
const clean=()=>structuredClone(browserTrace);
const session={seed:1234};

test('browser-generated 151-step finished run replays in Node with exact score',()=>{
  const r=verifyHeadlessDiagnostic(clean(),session);
  assert.equal(r.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
  assert.equal(r.steps,151);
  assert.equal(r.scoreClaimed,90);
  assert.equal(r.scoreRecomputed,90);
  assert.equal(r.xpGranted,0);
  assert.equal(r.ranked,false);
  assert.equal(r.eligibleForPrizes,false);
});

test('headless runner executes real source, no Canvas DOM renderer',()=>{
  const run=createHeadlessSession(1234);
  assert.equal(run.inspect().snapshot.simFrame,0);
  assert.equal(run.inspect().snapshot.rng.calls,6);
  for(let i=0;i<50;i++)run.step();
  const snapshot=run.inspect().snapshot;
  assert.equal(snapshot.simFrame,50);
  assert.equal(snapshot.score,0);
  assert.equal(snapshot.gameOver,false);
});

test('same seed and inputs always reproduce the exact same state',()=>{
  const a=createHeadlessSession(2024),b=createHeadlessSession(2024);
  const shoot=new Script('if(state.simFrame===10){state.aimAngle=.4;shoot();}');
  for(let i=0;i<170;i++){
    shoot.runInContext(a.context,{timeout:1000});shoot.runInContext(b.context,{timeout:1000});
    a.step();b.step();
  }
  assert.deepEqual(a.inspect().snapshot,b.inspect().snapshot);
});

test('forged claimed score and final checkpoint fail deterministic replay',()=>{
  const t=clean();t.stats.score+=10000;t.checkpoint.score+=10000;
  assert.equal(verifyHeadlessDiagnostic(t,session).status,'REJECTED');
});

test('forged action ammunition metadata fails deterministic replay',()=>{
  const t=clean();t.actions[0].l+=1;
  assert.equal(verifyHeadlessDiagnostic(t,session).reason,'REPLAY_DIVERGENCE');
});

test('altered shot angle with unchanged resulting state fails',()=>{
  const t=clean();t.actions[0].angleExact=.6;
  assert.equal(verifyHeadlessDiagnostic(t,session).status,'REJECTED');
});

test('false completion flags are rejected before simulating',()=>{
  const t=clean();t.status='in_progress';
  assert.throws(()=>verifyHeadlessDiagnostic(t,session),/UNFINISHED_OR_PRACTICE/);
  const p=clean();p.practice=true;
  assert.throws(()=>verifyHeadlessDiagnostic(p,session),/UNFINISHED_OR_PRACTICE/);
});

test('wrong issued seed and mismatched viewport are rejected',()=>{
  assert.throws(()=>verifyHeadlessDiagnostic(clean(),{seed:9999}),/SERVER_SEED_MISMATCH/);
  const t=clean();t.viewport.width=391;
  assert.throws(()=>verifyHeadlessDiagnostic(t,session),/SERVER_VIEWPORT_MISMATCH/);
});

test('client cannot attach XP, rank or award fields',()=>{
  for(const key of ['xp','rank','winner','tournamentId']){
    const t=clean();t[key]=100;
    assert.throws(()=>verifyHeadlessDiagnostic(t,session),/CLIENT_REWARDS_FORBIDDEN/);
  }
});

test('safeguard rejects over-budget runs without stepping',()=>{
  const t=clean();t.stats.simFrame=MAX_HEADLESS_STEPS+1;t.checkpoint.simFrame=MAX_HEADLESS_STEPS+1;
  const result=verifyHeadlessDiagnostic(t,session);
  assert.equal(result.reason,'HEADLESS_STEP_LIMIT');
  assert.equal(result.xpGranted,0);
});

test('arbitrary code strings in JSON are inert data, never executed',()=>{
  const t=clean();t.reason='globalThis.process.exit(1)';
  const result=verifyHeadlessDiagnostic(t,session);
  assert.equal(result.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
});

const checkpointTrace=JSON.parse(readFileSync(new URL('./fixtures/v46-browser-checkpoints.json',import.meta.url),'utf8'));

test('second Chromium run: 820 frames, aim/key inputs, and periodic checkpoint agree in Node',()=>{
  const r=verifyHeadlessDiagnostic(structuredClone(checkpointTrace),{seed:24681357});
  assert.equal(checkpointTrace.checkpoints.length,1);
  assert.equal(checkpointTrace.inputs.length,31);
  assert.equal(r.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
  assert.equal(r.steps,820);
  assert.equal(r.scoreRecomputed,90);
  assert.equal(r.xpGranted,0);
});

test('periodic checkpoint manipulation fails before final state',()=>{
  const t=structuredClone(checkpointTrace);
  t.checkpoints[0].state.score+=50;
  const r=verifyHeadlessDiagnostic(t,{seed:24681357});
  assert.equal(r.reason,'REPLAY_DIVERGENCE');
  assert.equal(r.at,600);
});

test('keyboard input mutation invalidates the recorded trajectory',()=>{
  const t=structuredClone(checkpointTrace);
  t.inputs[1].v[1]=0;
  const r=verifyHeadlessDiagnostic(t,{seed:24681357});
  assert.equal(r.status,'REJECTED');
});
