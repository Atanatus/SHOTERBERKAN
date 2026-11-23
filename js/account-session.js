/* FrutiDry V50 — cancelable, identity-scoped account reads.
   One bounded forced refresh on 401; never grant permissions client-side.
   No Firebase SDK, DOM, storage, API URLs or auth tokens are persisted here. */
const FrutiDryAccountSession = (() => {
  'use strict';
  const TIMEOUT_MS = 9000;
  const stale = () => Object.freeze({status:'STALE'});
  function aborted() {
    const error = new Error('Account request aborted');
    error.name = 'AbortError';
    return error;
  }
  function createSession({readProfile, signOut, timeoutMs = TIMEOUT_MS,
      schedule = setTimeout, unschedule = clearTimeout} = {}) {
    if (typeof readProfile !== 'function' || typeof signOut !== 'function' ||
        typeof schedule !== 'function' || typeof unschedule !== 'function' ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
      throw new TypeError('Invalid account session dependencies');
    }
    let user = null;
    let version = 0;
    let pending = null;
    function cancel() {
      version++;
      if (pending) pending.abort();
      pending = null;
    }
    function setUser(nextUser) {
      cancel();
      user = nextUser || null;
    }
    function current(target, ticket) {
      return user === target && version === ticket;
    }
    async function load(apiBaseUrl) {
      if (!user) return Object.freeze({status:'SIGNED_OUT'});
      const target = user;
      if (typeof target.uid !== 'string' || !target.uid || typeof target.getIdToken !== 'function') {
        return Object.freeze({status:'ERROR',error:new TypeError('Invalid Firebase user')});
      }
      cancel();
      const ticket = version;
      const controller = new AbortController();
      pending = controller;
      const timer = schedule(() => controller.abort(), timeoutMs);
      const check = () => {
        if (!current(target,ticket)) return stale();
        if (controller.signal.aborted) return Object.freeze({status:'ERROR',error:aborted()});
        return null;
      };
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const token = await target.getIdToken(attempt === 1);
          const interruption = check();
          if (interruption) return interruption;
          try {
            const account = await readProfile({apiBaseUrl,token,signal:controller.signal});
            const interrupt = check();
            if (interrupt) return interrupt;
            if (!account || account.uid !== target.uid) {
              return Object.freeze({status:'ERROR',error:new TypeError('Account identity mismatch')});
            }
            return Object.freeze({status:'PROFILE',account});
          } catch (error) {
            const interrupt = check();
            if (interrupt) return interrupt;
            if (error?.status !== 401) return Object.freeze({status:'ERROR',error});
            if (attempt === 0) continue; // Retry only after getIdToken(true).
            // The server rejected two validly formatted ID tokens. Invalidate
            // locally before awaiting Firebase signOut; never act on a new UID.
            cancel();
            user = null;
            try { await signOut(target); } catch { /* locally invalidated regardless */ }
            return Object.freeze({status:'SESSION_INVALID'});
          }
        }
        return Object.freeze({status:'ERROR',error:new TypeError('Unreachable session state')});
      } catch (error) {
        const interrupt = check();
        if (interrupt) return interrupt;
        return Object.freeze({status:'ERROR',error});
      } finally {
        unschedule(timer);
        if (pending === controller) pending = null;
      }
    }
    return Object.freeze({setUser,load,cancel,get uid(){return user?.uid || null;}});
  }
  return Object.freeze({createSession,TIMEOUT_MS});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FrutiDryAccountSession;
