// FrutiDry V40 · Authoritative account level (PROVISIONAL balancing, never cash-enabled).
// The browser is never allowed to assign XP, level, identity, age or prize eligibility.
export const ACCOUNT_PROGRESSION_VERSION = 'draft-1';
export const START_LEVEL = 1;
export const MAX_LEVEL = 100;
export const XP_STEP = 250;
export const TOURNAMENT_MIN_ACCOUNT_LEVEL = 11;

const INITIAL_ARCADE_PROGRESS = Object.freeze({
  bestScore: 0,
  coresDetonated: 0,
  unlockedRelics: Object.freeze([])
});

export function requiredXpForLevel(level) {
  if (!Number.isInteger(level) || level < START_LEVEL || level > MAX_LEVEL) {
    throw new RangeError('Nivel fuera de rango');
  }
  return XP_STEP * level * (level - 1) / 2;
}

export function levelForXp(xp) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('XP inválida');
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (xp >= requiredXpForLevel(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function newAccountRecord(uid, now = new Date()) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    throw new TypeError('Identificador autenticado no válido');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Fecha inválida');
  return {
    _id: uid,
    xp: 0,
    arcadeProgress: INITIAL_ARCADE_PROGRESS,
    progressionVersion: ACCOUNT_PROGRESSION_VERSION,
    ageVerified: false,
    countryCode: null,
    identityVerified: false,
    acceptedRulesVersion: 0,
    suspended: false,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  };
}

export function publicAccount(record) {
  if (!record || typeof record !== 'object') throw new TypeError('Cuenta inválida');
  const level = levelForXp(record.xp);
  const {bestScore, coresDetonated, unlockedRelics} = record.arcadeProgress ?? INITIAL_ARCADE_PROGRESS;
  return Object.freeze({
    uid: record._id,
    accountLevel: level,
    xp: record.xp,
    arcadeProgress: Object.freeze({bestScore, coresDetonated, unlockedRelics: Object.freeze([...unlockedRelics])}),
    nextLevelXp: level < MAX_LEVEL ? requiredXpForLevel(level + 1) : null,
    progressionVersion: ACCOUNT_PROGRESSION_VERSION,
    minimumTournamentLevel: TOURNAMENT_MIN_ACCOUNT_LEVEL,
    meetsLevelRequirement: level >= TOURNAMENT_MIN_ACCOUNT_LEVEL,
    tournamentAccessEnabled: false,
    cashPrizesEnabled: false,
    // These values remain closed until an independently verified compliance workflow exists.
    status: 'PREPARATION'
  });
}
