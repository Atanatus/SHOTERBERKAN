import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const {createSession,TIMEOUT_MS}=require('../js/account-session.js');
const {AccountApiError}=require('../js/account-client.js');
const invalid=()=>new AccountApiError(401,'INVALID_OR_REVOKED_TOKEN');
const user=(uid='user_a')=>({uid,email:`${uid}@example.test`,calls:[],
  async getIdToken(force){this.calls.push(force);return force?'new':'old';}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const good=(uid='user_a')=>({uid,xp:0,accountLevel:1});

test('V50 creates no auth identity, storage or network by itself',async()=>{
  let calls=0;
  const session=createSession({readProfile:async()=>{calls++;},signOut:async()=>{calls++;}});
  assert.equal((await session.load('https://api.example.test')).status,'SIGNED_OUT');
  assert.equal(session.uid,null);
  assert.equal(calls,0);
});
test('the first successful token fetch returns the account, never rewards',async()=>{
  let observed;
  const u=user(); const session=createSession({readProfile:async data=>{observed=data;return good();},signOut:async()=>{throw Error('unexpected signout');}});
  session.setUser(u);
  const result=await session.load('https://api.example.test');
  assert.deepEqual(u.calls,[false]);
  assert.equal(result.status,'PROFILE');assert.deepEqual(result.account,good());
  assert.equal(observed.apiBaseUrl,'https://api.example.test');
  assert.equal(observed.token,'old');assert.equal(observed.signal.aborted,false);
  assert(Object.isFrozen(result));
});
test('one 401 triggers exactly one forced refresh and one retry',async()=>{
  let calls=0;
  const u=user();const session=createSession({readProfile:async()=>{calls++;if(calls===1)throw invalid();return good();},signOut:async()=>{throw Error('should not signout');}});
  session.setUser(u);
  assert.equal((await session.load('https://api.example.test')).status,'PROFILE');
  assert.deepEqual(u.calls,[false,true]);assert.equal(calls,2);
});
test('two 401s fail closed, invalidate locally, and sign out only same session',async()=>{
  const u=user();let signed=0,requests=0;
  const session=createSession({readProfile:async()=>{requests++;throw invalid();},signOut:async value=>{assert.equal(value,u);signed++;}});
  session.setUser(u);
  assert.equal((await session.load('https://api.example.test')).status,'SESSION_INVALID');
  assert.equal(signed,1);assert.equal(requests,2);assert.equal(session.uid,null);
  assert.equal((await session.load('https://api.example.test')).status,'SIGNED_OUT');
});
for(const status of [403,429,503]){
  test(`HTTP ${status} stays signed in: no forced token refresh or signout`,async()=>{
    let signed=0,calls=0;const u=user();
    const session=createSession({readProfile:async()=>{calls++;throw new AccountApiError(status,'ERROR');},signOut:async()=>{signed++;}});
    session.setUser(u);
    const result=await session.load('https://api.example.test');
    assert.equal(result.status,'ERROR');assert.equal(result.error.status,status);
    assert.equal(signed,0);assert.equal(calls,1);assert.equal(session.uid,u.uid);assert.deepEqual(u.calls,[false]);
  });
}
test('network exception leaves local session intact without leaking secrets',async()=>{
  const u=user();let signed=0;
  const session=createSession({readProfile:async()=>{throw Error('opaque network');},signOut:async()=>{signed++;}});
  session.setUser(u);const result=await session.load('https://api.example.test');
  assert.equal(result.status,'ERROR');assert.equal(signed,0);assert.equal(session.uid,u.uid);
});
test('UID mismatch is an error and the different profile is not exposed',async()=>{
  const u=user();let signed=0;
  const session=createSession({readProfile:async()=>good('somebody_else'),signOut:async()=>{signed++;}});
  session.setUser(u);const result=await session.load('https://api.example.test');
  assert.equal(result.status,'ERROR');assert.equal(result.account,undefined);
  assert.equal(signed,0);
});
test('switching UID while waiting cancels and discards old response',async()=>{
  const pending=deferred(), u1=user('first'),u2=user('second');let requests=0;
  const session=createSession({readProfile:async()=>++requests===1?pending.promise:good('second'),signOut:async()=>{throw Error('wrong signout');}});
  session.setUser(u1);
  const a=session.load('https://api.example.test');
  await new Promise(resolve=>setImmediate(resolve));
  session.setUser(u2);
  assert.equal((await session.load('https://api.example.test')).status,'PROFILE');
  pending.resolve(good('first'));
  assert.equal((await a).status,'STALE');
  assert.equal(session.uid,'second');
});
test('old 401 cannot sign out the newly signed-in UID',async()=>{
  const pending=deferred();const u1=user('first'),u2=user('second');let signed=0;
  const session=createSession({readProfile:async({token})=>token==='old'&&session.uid==='first'?pending.promise:good('second'),signOut:async()=>{signed++;}});
  session.setUser(u1);
  const a=session.load('https://api.example.test');
  await new Promise(resolve=>setImmediate(resolve));
  session.setUser(u2);
  const b=await session.load('https://api.example.test');
  pending.reject(invalid());
  assert.equal((await a).status,'STALE');
  assert.equal(b.status,'PROFILE');assert.equal(signed,0);
});
test('overlapping refreshes cancel the previous request even for the same UID',async()=>{
  const pending=deferred();let calls=0;const u=user();
  const session=createSession({readProfile:async()=>++calls===1?pending.promise:good(),signOut:async()=>{}});
  session.setUser(u);const a=session.load('https://api.example.test');
  await new Promise(resolve=>setImmediate(resolve));
  const b=await session.load('https://api.example.test');pending.resolve(good());
  assert.equal((await a).status,'STALE');assert.equal(b.status,'PROFILE');
});
test('timeout aborts the fetch, reports an error and never signs out',async()=>{
  let runScheduled;let signed=0,signal;
  const u=user();
  const session=createSession({readProfile:async({signal:s})=>{
    signal=s;return new Promise((resolve,reject)=>s.addEventListener('abort',()=>reject(new Error('Network aborted')),{once:true}));
  },signOut:async()=>{signed++;},schedule:fn=>{runScheduled=fn;return 123;},unschedule:()=>{}});
  session.setUser(u);const task=session.load('https://api.example.test');
  await new Promise(resolve=>setImmediate(resolve));
  runScheduled();const result=await task;
  assert.equal(result.status,'ERROR');assert.equal(result.error.name,'AbortError');
  assert.equal(signal.aborted,true);assert.equal(signed,0);assert.equal(session.uid,u.uid);
});
test('invalid configuration and malformed Firebase user fail without network',async()=>{
  assert.throws(()=>createSession(),TypeError);
  assert.throws(()=>createSession({readProfile:async()=>{},signOut:async()=>{},timeoutMs:999}),TypeError);
  const session=createSession({readProfile:async()=>{throw Error('must not request');},signOut:async()=>{}});
  session.setUser({uid:'u'});assert.equal((await session.load('https://api.example.test')).status,'ERROR');
});
test('the classic browser entrypoint loads without globals and precedes account UI',()=>{
  const {runInNewContext}=require('node:vm');
  const source=readFileSync(new URL('../js/account-session.js',import.meta.url),'utf8');
  const box={setTimeout,clearTimeout,AbortController};box.window=box;box.globalThis=box;
  runInNewContext(source,box,{timeout:1000});
  assert.equal(runInNewContext('typeof FrutiDryAccountSession.createSession',box),'function');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert(html.indexOf('src="js/account-verification.js"')<html.indexOf('src="js/account-session.js"'));
  assert(html.indexOf('src="js/account-session.js"')<html.indexOf('src="js/account-ui.js"'));
  assert.equal(TIMEOUT_MS,9000);
});
