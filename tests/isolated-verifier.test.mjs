import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIsolatedVerifier} from '../server/isolated-verifier.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/v46-browser-finished.json',import.meta.url)));
const copy=()=>structuredClone(fixture);

test('isolated child recomputes a real browser run, without any rewards',async()=>{
  const worker=createIsolatedVerifier();
  try{
    const result=await worker.verify(copy(),{seed:1234});
    assert.equal(result.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
    assert.equal(result.scoreRecomputed,90);
    assert.equal(result.steps,151);
    assert.deepEqual([result.xpGranted,result.ranked,result.eligibleForPrizes],[0,false,false]);
  }finally{worker.close();}
});

test('wrong server seed and manipulated checkpoint are not accepted',async()=>{
  const worker=createIsolatedVerifier();
  try{
    const badSeed=await worker.verify(copy(),{seed:1111});
    assert.equal(badSeed.status,'REJECTED');
    assert.equal(badSeed.reason,'SERVER_SEED_MISMATCH');
    const altered=copy(); altered.checkpoint.score+=1; altered.stats.score+=1;
    const result=await worker.verify(altered,{seed:1234});
    assert.equal(result.status,'REJECTED');
    assert.equal(result.xpGranted,0);
  }finally{worker.close();}
});

test('one active child and one queued; additional work is deferred',async()=>{
  const worker=createIsolatedVerifier({maxConcurrent:1,maxQueue:1});
  try{
    const a=worker.verify(copy(),{seed:1234});
    const b=worker.verify(copy(),{seed:1234});
    assert.equal(worker.stats().active,1);
    assert.equal(worker.stats().queued,1);
    const c=await worker.verify(copy(),{seed:1234});
    assert.equal(c.status,'DEFERRED');
    assert.equal(c.reason,'VERIFIER_BUSY');
    const [first,second]=await Promise.all([a,b]);
    assert.equal(first.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
    assert.equal(second.status,'REPLAY_CONSISTENT_NOT_ANTICHEAT');
  }finally{worker.close();}
});

test('unresponsive child is terminated and marked DEFERRED, not cheating',async()=>{
  const worker=createIsolatedVerifier({timeoutMs:180,
    workerFile:new URL('./fixtures/verifier-hang.mjs',import.meta.url)});
  try{
    const r=await worker.verify(copy(),{seed:1234});
    assert.deepEqual(r,{status:'DEFERRED',reason:'VERIFIER_TIMEOUT',xpGranted:0,ranked:false,eligibleForPrizes:false});
  }finally{worker.close();}
});

test('lying worker cannot award XP, rank or eligibility',async()=>{
  const worker=createIsolatedVerifier({workerFile:new URL('./fixtures/verifier-bad.mjs',import.meta.url)});
  try{
    const r=await worker.verify(copy(),{seed:1234});
    assert.equal(r.status,'DEFERRED');
    assert.equal(r.reason,'VERIFIER_BAD_RESPONSE');
    assert.equal(r.xpGranted,0);
    assert.equal(r.ranked,false);
    assert.equal(r.eligibleForPrizes,false);
  }finally{worker.close();}
});

test('closing the verifier fails closed for active and queued jobs',async()=>{
  const worker=createIsolatedVerifier({maxConcurrent:1,maxQueue:1,
    workerFile:new URL('./fixtures/verifier-hang.mjs',import.meta.url)});
  const a=worker.verify(copy(),{seed:1234});
  const b=worker.verify(copy(),{seed:1234});
  worker.close();
  const [x,y]=await Promise.all([a,b]);
  assert.equal(x.status,'DEFERRED');
  assert.equal(y.status,'DEFERRED');
  assert.equal((await worker.verify(copy(),{seed:1234})).reason,'VERIFIER_SHUTDOWN');
});

test('oversized, malformed and client-authorized requests fail before spawning',async()=>{
  const worker=createIsolatedVerifier();
  try{
    const bad=copy();bad.xp=2000;
    assert.equal((await worker.verify(bad,{seed:1234})).reason,'CLIENT_REWARDS_FORBIDDEN');
    assert.equal((await worker.verify(copy(),{seed:-2})).reason,'INVALID_SESSION');
    const enormous=copy(); enormous.reason='x'.repeat(2*1024*1024);
    assert.equal((await worker.verify(enormous,{seed:1234})).reason,'TRACE_LIMIT_EXCEEDED');
    assert.equal(worker.stats().active,0);
  }finally{worker.close();}
});
