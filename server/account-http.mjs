import {createServer} from 'node:http';
import {newAccountRecord, publicAccount} from './account-domain.mjs';
import {RunIntakeError, RUN_REPORT_BYTES} from './run-intake.mjs';

const TOKEN_PATTERN = /^Bearer ([^\s]{1,8192})$/;

export function createAccountApi({verifyToken, accountStore, allowedOrigins, now = () => new Date(), runIntake = null}) {
  if (typeof verifyToken !== 'function' || !accountStore || typeof accountStore.getOrCreate !== 'function') {
    throw new TypeError('Verificador y almacenamiento son obligatorios');
  }
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length ||
      allowedOrigins.some(origin => typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin))) {
    throw new TypeError('Origen CORS explícito obligatorio');
  }
  if (runIntake && (typeof runIntake.start !== 'function' || typeof runIntake.submit !== 'function')) {
    throw new TypeError('Run intake contract invalid');
  }
  const origins = new Set(allowedOrigins);
  const readJSON = async (req, limit) => {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      throw new RunIntakeError('JSON_REQUIRED', 415);
    }
    const announced = Number(req.headers['content-length'] || 0);
    if (!Number.isSafeInteger(announced) || announced > limit) {
      throw new RunIntakeError('REQUEST_TOO_LARGE', 413);
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > limit) throw new RunIntakeError('REQUEST_TOO_LARGE', 413);
      chunks.push(chunk);
    }
    try {
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw Error('object required');
      return json;
    } catch { throw new RunIntakeError('INVALID_JSON'); }
  };
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Vary', 'Origin');
    const send = (code, data) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!origins.has(origin)) return send(403, {error: 'ORIGIN_NOT_ALLOWED'});
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    let path;
    try {
      if (typeof req.url !== 'string' || req.url.length > 2048) return send(414, {error: 'INVALID_REQUEST'});
      path = new URL(req.url, 'http://frutidry.invalid').pathname;
    } catch { return send(400, {error: 'INVALID_REQUEST'}); }
    if (req.method === 'GET' && path === '/healthz') return send(200, {service: 'frutidry-account-api', status: 'ok'});
    const runsRoot = path === '/api/v1/runs';
    const matchRun = /^\/api\/v1\/runs\/([0-9a-f-]{36})\/diagnostic$/.exec(path);
    const isRunRoute = runsRoot || Boolean(matchRun);
    if (path !== '/api/v1/me' && !isRunRoute) return send(404, {error: 'NOT_FOUND'});
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Methods', isRunRoute ? 'POST, OPTIONS' : 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', isRunRoute ? 'Authorization, Content-Type' : 'Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.end();
    }
    if (isRunRoute && req.method !== 'POST') return send(405, {error: 'METHOD_NOT_ALLOWED'});
    if (!isRunRoute && req.method !== 'GET') return send(405, {error: 'METHOD_NOT_ALLOWED'});
    // Even a valid token cannot activate the run endpoints unless the server
    // operator explicitly injects an intake service. Production injects none.
    if (isRunRoute && !runIntake) return send(423, {error: 'RUN_VERIFICATION_DISABLED'});
    const match = TOKEN_PATTERN.exec(req.headers.authorization || '');
    if (!match) return send(401, {error: 'AUTH_REQUIRED'});
    let identity;
    try {
      identity = await verifyToken(match[1]);
      if (!identity || typeof identity.uid !== 'string') throw Error('Invalid identity');
      newAccountRecord(identity.uid, now());
    } catch {
      return send(401, {error: 'INVALID_OR_REVOKED_TOKEN'});
    }
    if (isRunRoute) {
      try {
        const account = await accountStore.getOrCreate(identity.uid, newAccountRecord(identity.uid, now()));
        if (account.suspended) return send(403, {error: 'ACCOUNT_SUSPENDED'});
        const body = await readJSON(req, runsRoot ? 256 : RUN_REPORT_BYTES + 128);
        if (runsRoot) {
          // No seed, level, score, viewport or prize request comes from the client.
          if (Object.keys(body).length !== 0) return send(400, {error: 'CLIENT_RUN_SETTINGS_FORBIDDEN'});
          return send(201, {run: await runIntake.start(identity.uid)});
        }
        if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'diagnostic')) {
          return send(400, {error: 'DIAGNOSTIC_ONLY'});
        }
        return send(202, {receipt: await runIntake.submit(identity.uid, matchRun[1], body.diagnostic)});
      } catch (error) {
        if (error instanceof RunIntakeError) return send(error.httpStatus, {error: error.code});
        console.error('Run intake error', error instanceof Error ? error.name : 'Unknown');
        return send(503, {error: 'RUN_SERVICE_UNAVAILABLE'});
      }
    }
    try {
      const record = await accountStore.getOrCreate(identity.uid, newAccountRecord(identity.uid, now()));
      return send(200, {account: publicAccount(record)});
    } catch (error) {
      console.error('Account API storage error', error instanceof Error ? error.name : 'Unknown');
      return send(503, {error: 'ACCOUNT_SERVICE_UNAVAILABLE'});
    }
  });
}
