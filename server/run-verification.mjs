// FrutiDry V47 · offline / internal verification state machine.
// Reads the server-issued session and persisted diagnostic, never the player's
// asserted seed or rewards. No HTTP endpoint, XP, leaderboard or payout writes.
import {createHash, randomUUID} from 'node:crypto';
import {RUN_RULES_VERSION,RUN_GAME_VERSION,RUN_LOGICAL_VIEWPORT} from './run-intake.mjs';

const ID = /^[0-9a-f-]{36}$/;
const SAFE = /^[A-Z0-9_]{1,64}$/;
const PENDING = 'PENDING_INDEPENDENT_VERIFICATION';
const MAX_ATTEMPTS=3;
const publicResult=(id,status,reason,scoreRecomputed=null)=>Object.freeze({
  id,status,reason,scoreRecomputed,xpGranted:0,ranked:false,eligibleForPrizes:false
});

export function createRunVerificationService({store,verifier,now=()=>new Date(),makeLeaseId=randomUUID,
    leaseMs=30_000}={}) {
  if (!store || typeof store.claimVerification!=='function' ||
      typeof store.completeVerification!=='function' ||
      !verifier || typeof verifier.verify!=='function' ||
      typeof now!=='function' || typeof makeLeaseId!=='function' ||
      !Number.isSafeInteger(leaseMs) || leaseMs<20_000 || leaseMs>120_000) {
    throw new TypeError('INVALID_VERIFICATION_DEPENDENCIES');
  }
  return Object.freeze({
    async verifyOne(id) {
      if (typeof id!=='string' || !ID.test(id)) return publicResult(null,'NOT_CLAIMED','INVALID_RUN_ID');
      const at=now(),leaseId=makeLeaseId();
      if (!(at instanceof Date) || !Number.isFinite(at.getTime()) || !ID.test(leaseId)) {
        throw new TypeError('INVALID_VERIFIER_CLOCK_OR_LEASE');
      }
      const record=await store.claimVerification(id,leaseId,at,leaseMs,MAX_ATTEMPTS);
      if (!record) return publicResult(id,'NOT_CLAIMED','NOT_PENDING_OR_CLAIMED');
      let outcome;
      try {
        const view=record.viewport;
        if (record.status!=='VERIFYING' || record.verificationLeaseId!==leaseId ||
            !Number.isInteger(record.seed) || record.seed<1 || record.seed>2147483647 ||
            record.rulesVersion!==RUN_RULES_VERSION || record.gameVersion!==RUN_GAME_VERSION ||
            view?.width!==RUN_LOGICAL_VIEWPORT.width || view?.height!==RUN_LOGICAL_VIEWPORT.height ||
            typeof record.diagnosticJson!=='string' ||
            !/^[0-9a-f]{64}$/.test(record.reportHash || '') ||
            createHash('sha256').update(record.diagnosticJson,'utf8').digest('hex')!==record.reportHash) {
          outcome={status:'REJECTED',reason:'STORED_RUN_INTEGRITY_FAILED'};
        } else {
          const diagnostic=JSON.parse(record.diagnosticJson);
          outcome=await verifier.verify(diagnostic,{seed:record.seed});
        }
      } catch {
        outcome={status:'DEFERRED',reason:'VERIFICATION_INTERNAL_ERROR'};
      }
      let target;
      if (outcome.status==='REPLAY_CONSISTENT_NOT_ANTICHEAT') target=outcome.status;
      else if (outcome.status==='REJECTED') target='REJECTED';
      else target=(record.verificationAttempts>=MAX_ATTEMPTS?'REVIEW_REQUIRED':PENDING);
      const reason=SAFE.test(outcome.reason || '')?outcome.reason:'VERIFIER_BAD_RESPONSE';
      // Worker outcomes do not grant authority, even on exact replay consistency.
      const computed=target==='REPLAY_CONSISTENT_NOT_ANTICHEAT' &&
          Number.isSafeInteger(outcome.scoreRecomputed) && outcome.scoreRecomputed>=0 ? outcome.scoreRecomputed : null;
      if (target==='REPLAY_CONSISTENT_NOT_ANTICHEAT' && computed===null) {
        target='REVIEW_REQUIRED';
      }
      const fields={status:target,verificationReason:reason,
        verificationAt:now(),verificationScoreRecomputed:computed,
        xpGranted:0,ranked:false,eligibleForPrizes:false};
      if (target==='REPLAY_CONSISTENT_NOT_ANTICHEAT' && Number.isSafeInteger(outcome.coresRecomputed) &&
          outcome.coresRecomputed>=0 && Array.isArray(outcome.relicsRecomputed) &&
          outcome.relicsRecomputed.length<=12 && outcome.relicsRecomputed.every(id=>Number.isInteger(id) && id>=1 && id<=12)) {
        fields.arcadeProgress={bestScore:computed,coresDetonated:outcome.coresRecomputed,
          unlockedRelics:[...new Set(outcome.relicsRecomputed)]};
      }
      const saved=await store.completeVerification(id,leaseId,fields);
      if (!saved) return publicResult(id,'NOT_CLAIMED','VERIFICATION_LEASE_LOST');
      return publicResult(id,target,reason,computed);
    }
  });
}
