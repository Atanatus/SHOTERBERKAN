import {createServer} from 'node:http';
import {newAccountRecord, publicAccount} from './account-domain.mjs';

const TOKEN_PATTERN = /^Bearer ([^\s]{1,8192})$/;

export function createAccountApi({verifyToken, accountStore, allowedOrigins, now = () => new Date()}) {
  if (typeof verifyToken !== 'function' || !accountStore || typeof accountStore.getOrCreate !== 'function') {
    throw new TypeError('Verificador y almacenamiento son obligatorios');
  }
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length ||
      allowedOrigins.some(origin => typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin))) {
    throw new TypeError('Origen CORS explícito obligatorio');
  }
  const origins = new Set(allowedOrigins);
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
    if (path !== '/api/v1/me') return send(404, {error: 'NOT_FOUND'});
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.end();
    }
    if (req.method !== 'GET') return send(405, {error: 'METHOD_NOT_ALLOWED'});
    const match = TOKEN_PATTERN.exec(req.headers.authorization || '');
    if (!match) return send(401, {error: 'AUTH_REQUIRED'});
    let identity;
    try {
      identity = await verifyToken(match[1]);
      if (!identity || typeof identity.uid !== 'string') throw Error('Invalid identity');
      // Reject invalid identity before treating it as a database failure.
      newAccountRecord(identity.uid, now());
    } catch {
      return send(401, {error: 'INVALID_OR_REVOKED_TOKEN'});
    }
    try {
      const record = await accountStore.getOrCreate(identity.uid, newAccountRecord(identity.uid, now()));
      return send(200, {account: publicAccount(record)});
    } catch (error) {
      // Do not send driver errors, URLs, credentials, stack traces or identity data to clients.
      console.error('Account API storage error', error instanceof Error ? error.name : 'Unknown');
      return send(503, {error: 'ACCOUNT_SERVICE_UNAVAILABLE'});
    }
  });
}
