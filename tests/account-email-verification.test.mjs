import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createAccountApi} from '../server/account-http.mjs';
const require = createRequire(import.meta.url);
const {createFlow,verified,MIN_SEND_INTERVAL_MS}=require('../js/account-verification.js');
const {friendlyAccountError,AccountApiError}=require('../js/account-client.js');

function mockUser(uid='user_01') {return {uid,email:`${uid}@example.test`,emailVerified:false,
  refreshes:[],async getIdToken(force){this.refreshes.push(force);return 'new-token';}};}

test('Email verification: requires genuine Firebase user and SDK functions',()=>{
  assert.throws(()=>createFlow(),TypeError);
  const flow=createFlow({sendEmailVerification:async()=>{},reload:async()=>{}});
  assert.equal(verified(null),false);assert.equal(verified({emailVerified:'true'}),false);
  assert.equal(verified({emailVerified:true}),true);
  assert.rejects(flow.send({uid:'x',email:'foo'}),TypeError);
});
test('Verification link is never sent automatically; one send and 60s UX cooldown',async()=>{
  let time=10000,sends=0;
  const flow=createFlow({now:()=>time,sendEmailVerification:async()=>{sends++;},reload:async()=>{}});
  const user=mockUser();
  assert.equal(sends,0);
  assert.equal(flow.retryAfterMs(user),0);
  assert.deepEqual(await flow.send(user),{status:'SENT',retryAfterMs:MIN_SEND_INTERVAL_MS});
  assert.equal(sends,1);
  time+=1000;
  assert.deepEqual(await flow.send(user),{status:'COOLDOWN',retryAfterMs:59000});
  assert.equal(sends,1);
  time+=59000;await flow.send(user);assert.equal(sends,2);
});
test('A failed delivery does not start cooldown; other UID gets independent allowance',async()=>{
  let fail=true,requests=0;
  const flow=createFlow({now:()=>3000,sendEmailVerification:async()=>{requests++;if(fail)throw Error('network');},reload:async()=>{}});
  const user=mockUser('x');
  await assert.rejects(flow.send(user),/network/);
  assert.equal(flow.retryAfterMs(user),0);
  fail=false;
  await flow.send(user);
  await flow.send(mockUser('another'));
  assert.equal(requests,3);
});
test('Verified accounts cannot trigger another verification email',async()=>{
  let sends=0;
  const flow=createFlow({sendEmailVerification:async()=>{sends++;},reload:async()=>{}});
  const user=mockUser(); user.emailVerified=true;
  assert.deepEqual(await flow.send(user),{status:'ALREADY_VERIFIED',retryAfterMs:0});
  assert.equal(sends,0);
});
test('Confirm action reloads Firebase user and FORCES a refreshed ID token',async()=>{
  const user=mockUser(); let reloads=0;
  const flow=createFlow({sendEmailVerification:async()=>{},reload:async(u)=>{reloads++;u.emailVerified=true;}});
  const r=await flow.refresh(user);
  assert.deepEqual(r,{verified:true});assert.equal(reloads,1);
  assert.deepEqual(user.refreshes,[true]);
});
test('Verification refresh retains unverified state when Firebase has not confirmed',async()=>{
  const user=mockUser();let reloads=0;
  const flow=createFlow({sendEmailVerification:async()=>{},reload:async()=>{reloads++;}});
  assert.deepEqual(await flow.refresh(user),{verified:false});assert.equal(reloads,1);
  assert.deepEqual(user.refreshes,[true]);
});
test('403 verification-specific errors are understood; no raw secrets are exposed',()=>{
  assert.match(friendlyAccountError(new AccountApiError(403,'EMAIL_VERIFICATION_REQUIRED')),/verifica el correo/i);
});

const URL_ROOT='/api/v1/runs';
async function apiTest(fn,{verifyToken}={}) {
  let runsStarted=0,runsSubmitted=0,created=0;
  const store={async getOrCreate(uid,defaults){created++;return defaults;}};
  const runIntake={async start(uid){runsStarted++;return {id:'11111111-1111-1111-1111-111111111111',status:'ISSUED',uid,awardsEnabled:false};},
    async submit(uid,id){runsSubmitted++;return {id,status:'PENDING_INDEPENDENT_VERIFICATION',xpGranted:0,ranked:false,eligibleForPrizes:false};}};
  const api=createAccountApi({verifyToken:verifyToken|| (async token=>{
    if(token==='revoked'||token==='disabled')throw Error('revoked or disabled');
    if(token==='verified')return {uid:'uid-verified',email:'verified@example.test',email_verified:true};
    if(token==='unverified')return {uid:'uid-unverified',email:'pending@example.test',email_verified:false};
    if(token==='spoofed')return {uid:'uid-unverified',email:'pending@example.test',email_verified:'true'};
    if(token==='missing-email')return {uid:'uid-unverified',email_verified:true};
    throw Error('bad token');
  }),accountStore:store,runIntake,allowedOrigins:['https://atanatus.github.io']});
  api.listen(0,'127.0.0.1');await once(api,'listening');
  try{await fn(`http://127.0.0.1:${api.address().port}`,()=>({runsStarted,runsSubmitted,created}));}
  finally{await new Promise(resolve=>api.close(resolve));}
}
async function call(base,path,token,body) {
  return fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://atanatus.github.io'},body:JSON.stringify(body)});
}
test('Unverified Firebase tokens can read profile but cannot write a competitive run',async()=>{
  await apiTest(async(base,stats)=>{
    const profile=await fetch(base+'/api/v1/me',{headers:{Authorization:'Bearer unverified'}});
    assert.equal(profile.status,200);assert.equal((await profile.json()).account.xp,0);
    for(const token of ['unverified','spoofed','missing-email']){
      const r=await call(base,URL_ROOT,token,{});
      assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'EMAIL_VERIFICATION_REQUIRED'});
    }
    assert.equal(stats().runsStarted,0);
    assert.equal(stats().created,1); // only the read-only account request creates a profile
  });
});
test('Unverified Firebase tokens cannot submit diagnostics for existing sessions',async()=>{
  await apiTest(async(base,stats)=>{
    for(const token of ['unverified','spoofed','missing-email']){
      const r=await call(base,URL_ROOT+'/11111111-1111-1111-1111-111111111111/diagnostic',token,{diagnostic:{}});
      assert.equal(r.status,403);
    }
    assert.equal(stats().runsSubmitted,0);assert.equal(stats().created,0);
  });
});
test('Verified email in server-validated token can reach intake, but grants zero XP',async()=>{
  await apiTest(async(base,stats)=>{
    const r=await call(base,URL_ROOT,'verified',{});
    assert.equal(r.status,201);assert.equal((await r.json()).run.awardsEnabled,false);
    const result=await call(base,URL_ROOT+'/11111111-1111-1111-1111-111111111111/diagnostic','verified',{diagnostic:{}});
    assert.equal(result.status,202);
    const data=await result.json();assert.equal(data.receipt.xpGranted,0);assert.equal(data.receipt.ranked,false);
    assert.equal(stats().runsStarted,1);assert.equal(stats().runsSubmitted,1);
  });
});
test('Revoked and disabled tokens remain rejected, regardless of claimed email verification',async()=>{
  await apiTest(async(base,stats)=>{
    for(const token of ['revoked','disabled']){
      const r=await call(base,URL_ROOT,token,{email_verified:true});
      assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'INVALID_OR_REVOKED_TOKEN'});
    }
    assert.equal(stats().created,0);assert.equal(stats().runsStarted,0);
  });
});
test('Disabled run intake still fails closed even with a verified ID token',async()=>{
  const api=createAccountApi({verifyToken:async()=>({uid:'u',email:'verified@example.test',email_verified:true}),
    accountStore:{getOrCreate:async()=>{throw Error('should not be called');}},allowedOrigins:['https://atanatus.github.io']});
  api.listen(0,'127.0.0.1');await once(api,'listening');
  try{
    const r=await call(`http://127.0.0.1:${api.address().port}`,URL_ROOT,'verified',{});
    assert.equal(r.status,423);assert.deepEqual(await r.json(),{error:'RUN_VERIFICATION_DISABLED'});
  }finally{await new Promise(resolve=>api.close(resolve));}
});
