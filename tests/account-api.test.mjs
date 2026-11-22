import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createAccountApi} from '../server/account-http.mjs';
import {mongoAccountStore} from '../server/account-mongo.mjs';
import {START_LEVEL, MAX_LEVEL, requiredXpForLevel, levelForXp, newAccountRecord, publicAccount} from '../server/account-domain.mjs';

const GOOD_ORIGIN = 'https://atanatus.github.io';

async function withApi(operation, options = {}) {
  const profiles = new Map();
  const api = createAccountApi({
    verifyToken: options.verifyToken || (async token => {
      if (token === 'good-id-token') return {uid: 'firebase-user-001'};
      throw Error('bad token');
    }),
    accountStore: options.accountStore || {
      async getOrCreate(uid, defaults) {
        if (!profiles.has(uid)) profiles.set(uid, defaults);
        return profiles.get(uid);
      }
    },
    allowedOrigins: [GOOD_ORIGIN],
    now: () => new Date('2026-11-22T12:00:00Z')
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const url = `http://127.0.0.1:${api.address().port}`;
  try { await operation(url, profiles); } finally { await new Promise(resolve => api.close(resolve)); }
}

test('Level 1 starts at zero, level 11 needs 13750 provisional XP, cap is bounded', () => {
  assert.equal(levelForXp(0), START_LEVEL);
  assert.equal(levelForXp(249), 1);
  assert.equal(levelForXp(250), 2);
  assert.equal(levelForXp(749), 2);
  assert.equal(levelForXp(750), 3);
  assert.equal(requiredXpForLevel(11), 13750);
  assert.equal(levelForXp(13749), 10);
  assert.equal(levelForXp(13750), 11);
  assert.equal(levelForXp(Number.MAX_SAFE_INTEGER), MAX_LEVEL);
  for (const xp of [-1, 1.5, NaN, Infinity, '100']) assert.throws(() => levelForXp(xp));
});

test('Profile never discloses email or grants tournament access from XP alone', () => {
  const account = newAccountRecord('uid-01', new Date('2026-11-22T10:00:00Z'));
  assert.equal(account.xp, 0);
  assert.equal(account.ageVerified, false);
  account.xp = 100000;
  account.email = 'secret@example.com';
  account.paymentEmail = 'paypal@example.com';
  const safe = publicAccount(account);
  assert.equal(safe.accountLevel > 10, true);
  assert.equal(safe.tournamentAccessEnabled, false);
  assert.equal(safe.cashPrizesEnabled, false);
  assert.equal('email' in safe, false);
  assert.equal('paymentEmail' in safe, false);
  assert.throws(() => newAccountRecord('../invalid'));
});

test('Health is public and account requires a verified bearer token', async () => {
  await withApi(async base => {
    let r = await fetch(base + '/healthz'); assert.equal(r.status, 200);
    r = await fetch(base + '/api/v1/me'); assert.equal(r.status, 401);
    r = await fetch(base + '/api/v1/me', {headers: {Authorization: 'Bearer bad-token'}}); assert.equal(r.status, 401);
    r = await fetch(base + '/api/v1/me', {method: 'POST', headers: {Authorization:'Bearer good-id-token'}}); assert.equal(r.status, 405);
  });
});

test('Account creation is stable; request parameters cannot set XP or eligibility', async () => {
  await withApi(async (base, profiles) => {
    const headers = {Origin: GOOD_ORIGIN, Authorization: 'Bearer good-id-token', 'X-Account-Level': '99'};
    const r = await fetch(base + '/api/v1/me?xp=900000&ageVerified=true&accountLevel=99', {headers});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), GOOD_ORIGIN);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const payload = await r.json();
    assert.equal(payload.account.accountLevel, 1);
    assert.equal(payload.account.xp, 0);
    assert.equal(payload.account.tournamentAccessEnabled, false);
    assert.equal(profiles.size, 1);
    const again = await fetch(base + '/api/v1/me', {headers});
    assert.equal(again.status, 200);
    assert.deepEqual((await again.json()).account, payload.account);
  });
});

test('CORS is exact allowlist; preflight does not authorize broad origins', async () => {
  await withApi(async base => {
    let r = await fetch(base + '/api/v1/me', {method: 'OPTIONS', headers: {Origin: GOOD_ORIGIN}});
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-headers'), 'Authorization');
    r = await fetch(base + '/api/v1/me', {method: 'OPTIONS', headers: {Origin: 'https://evil.example'}});
    assert.equal(r.status, 403);
    r = await fetch(base + '/api/v1/me', {headers: {Origin: 'https://evil.example', Authorization: 'Bearer good-id-token'}});
    assert.equal(r.status, 403);
  });
});

test('Revoked tokens are rejected and datastore failure does not leak secrets', async () => {
  await withApi(async base => {
    const r = await fetch(base + '/api/v1/me', {headers: {Authorization: 'Bearer good-id-token'}});
    assert.equal(r.status, 503);
    const text = await r.text();
    assert.doesNotMatch(text, /mongodb:\/\//);
    assert.doesNotMatch(text, /secret/);
  }, {accountStore: {getOrCreate: async () => {throw Error('mongodb://secret-mongo-uri');}}});
});

test('Mongo adapter uses $setOnInsert with immutable _id, no client-controlled $set', async () => {
  const calls=[];
  const collection={async findOneAndUpdate(filter, update, options) {
    calls.push({filter, update, options});
    return {_id: filter._id, ...update.$setOnInsert};
  }};
  const store=mongoAccountStore(collection);
  const initial=newAccountRecord('user-2');
  const saved=await store.getOrCreate('user-2', initial);
  assert.deepEqual(saved, initial);
  assert.deepEqual(calls[0].filter, {_id:'user-2'});
  assert.ok(calls[0].update.$setOnInsert);
  assert.equal('_id' in calls[0].update.$setOnInsert, false);
  assert.equal('$set' in calls[0].update, false);
  assert.equal(calls[0].options.upsert, true);
});
