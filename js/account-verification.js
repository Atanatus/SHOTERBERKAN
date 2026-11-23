/* FrutiDry V49 · Firebase email-verification flow. Browser classic script + Node tests.
   This module is an optional UX helper, NEVER an authorization decision. */
const FrutiDryEmailVerification = (() => {
  'use strict';
  const MIN_SEND_INTERVAL_MS = 60_000;
  function verified(user) { return user?.emailVerified === true; }
  function validUser(user) {
    if (!user || typeof user.uid !== 'string' || !user.uid || typeof user.email !== 'string' || !user.email ||
        typeof user.getIdToken !== 'function') throw new TypeError('Usuario Firebase inválido');
  }
  function createFlow({sendEmailVerification, reload, now = Date.now} = {}) {
    if (typeof sendEmailVerification !== 'function' || typeof reload !== 'function' || typeof now !== 'function')
      throw new TypeError('SDK Firebase incompleto');
    let lastUid = null, lastSentAt = -Infinity;
    function retryAfterMs(user) {
      if (!user || verified(user) || user.uid !== lastUid) return 0;
      return Math.max(0, MIN_SEND_INTERVAL_MS - (now() - lastSentAt));
    }
    async function send(user) {
      validUser(user);
      if (verified(user)) return Object.freeze({status: 'ALREADY_VERIFIED', retryAfterMs: 0});
      const remaining = retryAfterMs(user);
      if (remaining > 0) return Object.freeze({status: 'COOLDOWN', retryAfterMs: remaining});
      await sendEmailVerification(user);
      lastUid = user.uid;
      lastSentAt = now(); // Only successful sends trigger client-side cooldown.
      return Object.freeze({status: 'SENT', retryAfterMs: MIN_SEND_INTERVAL_MS});
    }
    async function refresh(user) {
      validUser(user);
      await reload(user);
      // Firebase can cache the pre-verification token: force refresh after reload.
      await user.getIdToken(true);
      return Object.freeze({verified: verified(user)});
    }
    return Object.freeze({send, refresh, retryAfterMs});
  }
  return Object.freeze({createFlow, verified, MIN_SEND_INTERVAL_MS});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FrutiDryEmailVerification;
