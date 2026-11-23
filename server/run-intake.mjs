// FrutiDry V42 · server-owned run receipts. This is NOT an authoritative game verifier.
// No XP, levels, leaderboard ranking, tournament entry or prize path is created here.
import {randomInt, randomUUID, createHash} from 'node:crypto';
import {newAccountRecord} from './account-domain.mjs';

export const RUN_PROTOCOL_VERSION = 1;
export const RUN_LOGICAL_VIEWPORT = Object.freeze({width: 390, height: 844});
export const RUN_RULES_VERSION = 20;
export const RUN_GAME_VERSION = 24;
export const RUN_SESSION_MS = 75 * 60 * 1000;
export const RUN_REPORT_BYTES = 2 * 1024 * 1024;
export const RUN_MAX_STEPS = 60 * 60 * 60;

export class RunIntakeError extends Error {
  constructor(code, httpStatus = 400) {
    super(code);
    this.name = 'RunIntakeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function fail(code, status = 400) { throw new RunIntakeError(code, status); }
function integer(n, min, max) { return Number.isSafeInteger(n) && n >= min && n <= max; }
function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function noClientRewards(raw) {
  for (const k of ['uid', 'userId', 'accountLevel', 'xp', 'xpAwarded', 'reward', 'rank', 'tournamentId', 'winner']) {
    if (Object.hasOwn(raw, k)) fail('CLIENT_REWARDS_FORBIDDEN');
  }
}

// Structural checks are deliberately NOT called verification: checkpoints, score and
// action logs originate in the browser, therefore all can be forged by an attacker.
export function inspectDiagnostic(raw, session) {
  if (!plain(raw) || !plain(session)) fail('INVALID_DIAGNOSTIC');
  noClientRewards(raw);
  if (raw.format !== 'kosen-berkan-run-diagnostic' || raw.schema !== 2 ||
      raw.gameVersion !== RUN_GAME_VERSION || raw.rulesVersion !== RUN_RULES_VERSION) fail('RULES_MISMATCH');
  if (raw.practice !== false || raw.status !== 'finished') fail('UNFINISHED_OR_PRACTICE');
  if (raw.recording?.complete !== true) fail('INCOMPLETE_RECORDING');
  if (raw.seed !== session.seed) fail('SERVER_SEED_MISMATCH');
  if (raw.viewport?.width !== RUN_LOGICAL_VIEWPORT.width ||
      raw.viewport?.height !== RUN_LOGICAL_VIEWPORT.height) fail('SERVER_VIEWPORT_MISMATCH');
  const steps = raw.stats?.simFrame;
  if (!integer(steps, 1, RUN_MAX_STEPS) || !integer(raw.stats?.score, 0, 1_000_000_000_000) ||
      !plain(raw.checkpoint) || raw.checkpoint.simFrame !== steps ||
      raw.checkpoint.score !== raw.stats.score || raw.checkpoint.gameOver !== true) fail('INCONSISTENT_RESULT');
  if (!Array.isArray(raw.actions) || raw.actions.length > 15_000 ||
      !Array.isArray(raw.inputs) || raw.inputs.length > 25_000 ||
      (raw.checkpoints !== undefined && (!Array.isArray(raw.checkpoints) || raw.checkpoints.length > 360))) {
    fail('TRACE_LIMIT_EXCEEDED');
  }
  let previous = -1;
  for (const a of raw.actions) {
    if (!plain(a) || !integer(a.s, 0, steps - 1) || a.s < previous ||
        (a.a !== 'swap' && (!Number.isFinite(a.a) || !Number.isFinite(a.angleExact) ||
        Math.abs(a.a) > 1.7 || Math.abs(a.angleExact) > 1.7))) fail('INVALID_ACTION_LOG');
    previous = a.s;
  }
  previous = -1;
  for (const i of raw.inputs) {
    if (!plain(i) || !integer(i.s, 0, steps - 1) || i.s <= previous ||
        !Array.isArray(i.v) || i.v.length !== 4 || !Number.isFinite(i.v[0]) ||
        Math.abs(i.v[0]) > 1.7 || !i.v.slice(1).every(n => n === 0 || n === 1)) fail('INVALID_INPUT_LOG');
    previous = i.s;
  }
  previous = 0;
  for (const c of raw.checkpoints || []) {
    if (!plain(c) || !integer(c.s, 1, steps) || c.s <= previous || c.s % 600 !== 0 ||
        !plain(c.state) || c.state.simFrame !== c.s) fail('INVALID_PERIODIC_CHECKPOINT');
    previous = c.s;
  }
  return {steps, scoreClaimed: raw.stats.score}; // Never grant XP from this value.
}

export function createRunIntake({store, now = () => new Date(), makeId = randomUUID,
    makeSeed = () => randomInt(1, 2147483648)} = {}) {
  if (!store || typeof store.insert !== 'function' || typeof store.find !== 'function' ||
      typeof store.claim !== 'function') throw new TypeError('Run store must implement insert/find/claim');
  if (typeof now !== 'function' || typeof makeId !== 'function' || typeof makeSeed !== 'function') {
    throw new TypeError('Invalid run intake dependencies');
  }
  return Object.freeze({
    async start(uid) {
      newAccountRecord(uid, now()); // Firebase UID format validation.
      const createdAt = now();
      if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) fail('INVALID_CLOCK', 503);
      const id = makeId();
      const seed = makeSeed();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || !integer(seed, 1, 2147483647)) {
        fail('SERVER_ENTROPY_FAILED', 503);
      }
      const session = {
        _id: id, uid, status: 'ISSUED', seed, rulesVersion: RUN_RULES_VERSION,
        gameVersion: RUN_GAME_VERSION, viewport: {...RUN_LOGICAL_VIEWPORT},
        createdAt, expiresAt: new Date(createdAt.getTime() + RUN_SESSION_MS)
      };
      await store.insert(session);
      return Object.freeze({id, seed, expiresAt: session.expiresAt.toISOString(),
        viewport: {...RUN_LOGICAL_VIEWPORT}, gameVersion: RUN_GAME_VERSION,
        rulesVersion: RUN_RULES_VERSION, status: 'ISSUED', awardsEnabled: false});
    },
    async submit(uid, id, diagnostic) {
      newAccountRecord(uid, now());
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) fail('INVALID_RUN_ID');
      const session = await store.find(id);
      // Do not reveal whether another player's session exists.
      if (!session || session.uid !== uid) fail('RUN_NOT_FOUND', 404);
      if (session.status !== 'ISSUED') fail('RUN_ALREADY_SUBMITTED', 409);
      const at = now();
      if (!(at instanceof Date) || at >= new Date(session.expiresAt)) fail('RUN_EXPIRED', 410);
      let encoded;
      try { encoded = JSON.stringify(diagnostic); }
      catch { fail('INVALID_DIAGNOSTIC'); }
      if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > RUN_REPORT_BYTES) {
        fail('TRACE_LIMIT_EXCEEDED', 413);
      }
      const {steps, scoreClaimed} = inspectDiagnostic(diagnostic, session);
      const reportHash = createHash('sha256').update(encoded, 'utf8').digest('hex');
      const claimed = await store.claim(id, uid, at, {diagnosticJson: encoded, reportHash, steps, scoreClaimed});
      if (!claimed) fail('RUN_ALREADY_SUBMITTED_OR_EXPIRED', 409);
      return Object.freeze({id, status: 'PENDING_INDEPENDENT_VERIFICATION', reportHash,
        xpGranted: 0, ranked: false, eligibleForPrizes: false});
    }
  });
}

// Local in-memory adapter only for tests; never use in a multi-instance backend.
export function memoryRunStore() {
  const records = new Map();
  return {
    records,
    async insert(s) { if (records.has(s._id)) throw Error('duplicate session');records.set(s._id, structuredClone(s)); },
    async find(id) { return records.has(id) ? structuredClone(records.get(id)) : null; },
    async claim(id, uid, at, fields) {
      const s = records.get(id);
      if (!s || s.uid !== uid || s.status !== 'ISSUED' || at >= s.expiresAt) return false;
      Object.assign(s, {status:'PENDING_INDEPENDENT_VERIFICATION', submittedAt: at, ...structuredClone(fields)});
      return true;
    },
    async claimVerification(id, leaseId, at, leaseMs, maxAttempts = 3) {
      const s=records.get(id);
      if (!s || (s.verificationAttempts || 0) >= maxAttempts ||
          !(s.status === 'PENDING_INDEPENDENT_VERIFICATION' ||
            (s.status === 'VERIFYING' && s.verificationLeaseUntil <= at))) return null;
      s.status='VERIFYING';
      s.verificationLeaseId=leaseId;
      s.verificationLeaseUntil=new Date(at.getTime()+leaseMs);
      s.verificationAttempts=(s.verificationAttempts || 0)+1;
      return structuredClone(s);
    },
    async completeVerification(id, leaseId, fields) {
      const s=records.get(id);
      if (!s || s.status!=='VERIFYING' || s.verificationLeaseId!==leaseId) return false;
      Object.assign(s,structuredClone(fields));
      delete s.verificationLeaseId;
      delete s.verificationLeaseUntil;
      return true;
    }
  };
}
