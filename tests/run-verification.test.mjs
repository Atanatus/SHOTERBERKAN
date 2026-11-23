import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRunIntake,memoryRunStore} from '../server/run-intake.mjs';
import {createRunVerificationService} from '../server/run-verification.mjs';
import {createIsolatedVerifier} from '../server/isolated-verifier.mjs';
import {mongoRunStore} from '../server/run-mongo.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/v46-browser-finished.json',import.meta.url)));
const id='11111111-1111-4111-8111-111111111111';
const now=()=>new Date('2026-11-22T22:00:00.000Z');
const makeLeaseId=()=> '22222222-2222-4222-8222-222222222222';
async function issuedRun() {
  const store=memoryRunStore();
  const intake=createRunIntake({store,now,makeId:()=>id,makeSeed:()=>1234});
  const session=await intake.start('firebase_uid_1');
  assert.equal(session.seed,1234);
  await intake.submit('firebase_uid_1',session.id,structuredClone(fixture));
  return store;
}

test('stored diagnostic is checked with stored seed, persisted with zero XP',async()=>{
  const store=await issuedRun();
  const verifier=createIsolatedVerifier();
  try{
    const service=createRunVerificationService({store,verifier,now,makeLeaseId});
    const result=await service.verifyOne(id);
    assert.equal(result.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
    assert.equal(result.scoreRecomputed,90);
    assert.equal(result.xpGranted,0);
    const persisted=store.records.get(id);
    assert.equal(persisted.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
    assert.equal(persisted.verificationAttempts,1);
    assert.equal(persisted.verificationScoreRecomputed,90);
    assert.equal(persisted.xpGranted,0);
    assert.equal(persisted.ranked,false);
    assert.equal(persisted.eligibleForPrizes,false);
    assert.equal((await service.verifyOne(id)).status,'NOT_CLAIMED');
  }finally{verifier.close();}
});

test('a forged or damaged persisted JSON digest cannot reach the verifier',async()=>{
  const store=await issuedRun();
  store.records.get(id).diagnosticJson=JSON.stringify({...fixture,stats:{...fixture.stats,score:999}});
  let called=false;
  const service=createRunVerificationService({store,verifier:{verify(){called=true;}},now,makeLeaseId});
  const r=await service.verifyOne(id);
  assert.equal(r.status,'REJECTED');
  assert.equal(r.reason,'STORED_RUN_INTEGRITY_FAILED');
  assert.equal(called,false);
  assert.equal(store.records.get(id).xpGranted,0);
});

test('only one concurrent checker can acquire the same run',async()=>{
  const store=await issuedRun();
  let resolveVerification;
  const wait=new Promise(resolve=>{resolveVerification=resolve;});
  const verifier={verify:()=>wait};
  const service=createRunVerificationService({store,verifier,now,makeLeaseId});
  const a=service.verifyOne(id);
  const b=await service.verifyOne(id);
  assert.equal(b.status,'NOT_CLAIMED');
  resolveVerification({status:'REPLAY_CONSISTENT_NOT_ANTICHEAT',reason:'NONE',scoreRecomputed:90});
  assert.equal((await a).status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
});

test('timeouts retry, then require manual review; never award XP',async()=>{
  const store=await issuedRun();
  let attempts=0;
  const verifier={verify:async()=>{attempts++;return {status:'DEFERRED',reason:'VERIFIER_TIMEOUT'};}};
  const service=createRunVerificationService({store,verifier,now,
    makeLeaseId:()=>`22222222-2222-4222-8222-22222222222${attempts}`});
  const a=await service.verifyOne(id); const b=await service.verifyOne(id); const c=await service.verifyOne(id);
  assert.equal(a.status,'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(b.status,'PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(c.status,'REVIEW_REQUIRED');
  assert.equal(store.records.get(id).verificationAttempts,3);
  assert.equal(store.records.get(id).xpGranted,0);
  assert.equal((await service.verifyOne(id)).status,'NOT_CLAIMED');
});

test('expired verification lease is recoverable, stale writer cannot finalize',async()=>{
  const store=await issuedRun();
  const first=await store.claimVerification(id,'a',now(),30_000,3);
  assert.equal(first.verificationAttempts,1);
  assert.equal(await store.claimVerification(id,'b',now(),30_000,3),null);
  const future=new Date(now().getTime()+30_001);
  const recovered=await store.claimVerification(id,'b',future,30_000,3);
  assert.equal(recovered.verificationAttempts,2);
  assert.equal(await store.completeVerification(id,'a',{status:'REJECTED'}),false);
  assert.equal(await store.completeVerification(id,'b',{status:'REVIEW_REQUIRED',xpGranted:0}),true);
  assert.equal(store.records.get(id).status,'REVIEW_REQUIRED');
});

test('Mongo adapter uses atomic status+lease CAS for claiming and completing',async()=>{
  const calls=[];
  const mongo={insertOne:async()=>{},findOne:async()=>null,
    updateOne:async(...args)=>{calls.push(['update',...args]);return {modifiedCount:1};},
    findOneAndUpdate:async(...args)=>{calls.push(['findAndUpdate',...args]);return {_id:id,status:'VERIFYING'};}};
  const store=mongoRunStore(mongo);
  await store.claimVerification(id,'lease-1',now(),30_000,3);
  await store.completeVerification(id,'lease-1',{status:'REJECTED',xpGranted:0});
  const [claim,finish]=calls;
  assert.equal(claim[0],'findAndUpdate');
  assert.deepEqual(claim[1]._id,id);
  assert.equal(claim[2].$inc.verificationAttempts,1);
  assert.equal(claim[3].returnDocument,'after');
  assert.equal(finish[1].verificationLeaseId,'lease-1');
  assert.equal(finish[1].status,'VERIFYING');
  assert.equal(finish[2].$set.xpGranted,0);
  assert.ok(Object.hasOwn(finish[2].$unset,'verificationLeaseId'));
});
