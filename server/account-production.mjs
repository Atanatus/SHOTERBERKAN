// FrutiDry V40 · Account-only API for Render. Not a tournament, score or payout API.
import {applicationDefault, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {MongoClient} from 'mongodb';
import {createAccountApi} from './account-http.mjs';
import {mongoAccountStore} from './account-mongo.mjs';

function requiredEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Falta configuración: ${key}`);
  return value;
}

const uri = requiredEnv('MONGODB_URI');
const projectId = requiredEnv('FIREBASE_PROJECT_ID');
const dbName = requiredEnv('FRUTIDRY_DB_NAME');
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(dbName)) throw new Error('FRUTIDRY_DB_NAME inválido');
const origins = requiredEnv('FRUTIDRY_ALLOWED_ORIGINS').split(',').map(v => v.trim());
if (origins.some(value => !/^https:\/\/[^/]+$/.test(value))) throw new Error('En producción CORS solo HTTPS');
const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');

initializeApp({credential: applicationDefault(), projectId});
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  maxPoolSize: 10
});
await client.connect();
try {
  await client.db(dbName).command({ping: 1});
} catch (e) { await client.close(); throw e; }
const api = createAccountApi({
  verifyToken: token => getAuth().verifyIdToken(token, true), // Includes revocation/disabled-account checks.
  accountStore: mongoAccountStore(client.db(dbName).collection('accounts')),
  allowedOrigins: origins
});
api.listen(port, '0.0.0.0', () => console.log(`FrutiDry accounts API listening :${port}`));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  api.close(() => client.close().then(() => process.exit(0), () => process.exit(1)));
  // Render can SIGKILL the process if open connections do not drain.
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
