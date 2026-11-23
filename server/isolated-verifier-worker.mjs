// V47: one diagnostic per disposable child process. No HTTP, DB, secrets or rewards.
// Parent input is parsed JSON; only trusted repository code is executed.
import {verifyHeadlessDiagnostic} from './headless-replay.mjs';

const SAFE_REASONS = /^[A-Z0-9_]{1,64}$/;
const outcome = (status, reason) => ({
  status, reason, xpGranted:0, ranked:false, eligibleForPrizes:false
});

let handled = false;
process.once('message', packet => {
  if (handled) return;
  handled = true;
  let result;
  try {
    if (!packet || packet.kind !== 'VERIFY_DIAGNOSTIC' ||
        !packet.session || !Number.isSafeInteger(packet.session.seed)) {
      result = outcome('REJECTED', 'INVALID_SESSION');
    } else {
      const raw = verifyHeadlessDiagnostic(packet.diagnostic, {seed:packet.session.seed});
      if (raw.status === 'REPLAY_CONSISTENT_NOT_ANTICHEAT') {
        result = {...outcome(raw.status, 'NONE'),
          steps:raw.steps, scoreRecomputed:raw.scoreRecomputed,
          coresRecomputed:raw.coresRecomputed,relicsRecomputed:raw.relicsRecomputed};
      } else {
        result = outcome('REJECTED', SAFE_REASONS.test(raw.reason || '') ? raw.reason : 'REPLAY_ERROR');
        if (Number.isSafeInteger(raw.at)) result.at = raw.at;
      }
    }
  } catch (error) {
    const code = SAFE_REASONS.test(error?.code || '') ? error.code : 'REPLAY_ERROR';
    result = outcome('REJECTED', code);
  }
  if (typeof process.send === 'function') {
    process.send({kind:'VERIFICATION_RESULT', result}, () => process.exit(0));
  } else {
    process.exitCode = 1;
  }
});
// Failure to receive exactly one parent request must not keep an orphan process alive.
process.on('disconnect', () => process.exit(1));
