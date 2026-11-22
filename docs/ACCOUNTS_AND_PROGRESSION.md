# FrutiDry V40 · Cuentas y nivel permanente — diseño e implementación inicial

**Estado:** API de lectura y creación de cuenta implementada y probada con almacenamiento simulado; producción no desplegada. El arcade sigue disponible sin cuentas. No existe todavía formulario de login conectado, acumulación de XP real, verificador de partidas, ranking online ni pagos PayPal reales.

## Identidad y persistencia

- **Autenticación:** Firebase Authentication. El navegador obtendrá un **Firebase ID token** desde el SDK cliente en una fase posterior y llamará a la API con `Authorization: Bearer <ID_TOKEN>`. No confundir ID token con API key o refresh token.
- **Verificación:** Firebase Admin en Node.js `verifyIdToken(token, true)`. La segunda opción comprueba también revocación y usuarios deshabilitados; el servidor nunca confía en la identidad enviada por JSON o parámetros de consulta.
- **Datos:** MongoDB Atlas colección `accounts`, `_id` igual a Firebase UID, única por construcción. Alta idempotente con `$setOnInsert`; sin email ni dirección de PayPal guardados en V40.
- **Datos derivados:** nivel y progreso de cuenta se calculan en el servidor a partir de `xp`. No se aceptan escrituras de XP/nivel desde el cliente. Todos los perfiles se crean con XP 0 y nivel 1.
- **Separación:** los niveles de gemas y los récords de `localStorage` siguen siendo ajenos al nivel permanente de cuenta.

## Progresión provisional (sin concesión de XP)

`XP requerida para nivel L = 250 × L × (L−1) / 2`, con niveles 1–100. Nivel 11 requiere 13.750 XP. La curva es **BORRADOR DE EQUILIBRIO**, no una promesa comercial ni una regla definitiva. No hay endpoint de incremento de XP. Solo un futuro motor de partidas verificadas podrá conceder XP mediante operaciones idempotentes; antes de activar torneos se congelará la versión de la curva y sus reglas de migración.

Llegar a nivel 11 **no basta** para cobrar: seguirán siendo obligatorias la revisión de identidad, edad, territorio, aceptación de bases, prevención de fraude y autorización legal. `tournamentAccessEnabled` y `cashPrizesEnabled` son `false` incondicionalmente en V40.

## API REST (V40)

`GET /healthz` → 200 cuando el proceso está iniciado tras conectar MongoDB.

`OPTIONS /api/v1/me` → preflight de origen permitido.

`GET /api/v1/me` con ID token válido → 200, estructura `account`:

```json
{
  "account": {
    "uid": "<Firebase UID>",
    "accountLevel": 1,
    "xp": 0,
    "nextLevelXp": 250,
    "progressionVersion": "draft-1",
    "minimumTournamentLevel": 11,
    "meetsLevelRequirement": false,
    "tournamentAccessEnabled": false,
    "cashPrizesEnabled": false,
    "status": "PREPARATION"
  }
}
```

Errores: `401 AUTH_REQUIRED / INVALID_OR_REVOKED_TOKEN`; `403 ORIGIN_NOT_ALLOWED`; `503 ACCOUNT_SERVICE_UNAVAILABLE`; la respuesta no revela cadenas de conexión, trazas ni tokens. CORS exacto por `Origin`, sin comodines. `Cache-Control: no-store`.

No hay endpoints `POST /xp`, `/score`, `/tournaments/open`, `/payout` o rutas de administración expuestas.

## Entorno de despliegue en Render (todavía pendiente)

1. Crear/proporcionar un proyecto **Firebase Authentication** del equipo; activar proveedores elegidos y configurar dominios autorizados de la web. El SDK de administración usará credenciales de servicio mantenidas exclusivamente en secretos de Render (preferible archivo secreto indicado por `GOOGLE_APPLICATION_CREDENTIALS`), nunca en GitHub Pages.
2. Crear/proporcionar clúster MongoDB Atlas con usuario de base de datos de permisos mínimos, red permitida para Render, TLS y copias de seguridad. No pegar la URI en ningún archivo público.
3. Servicio web Render con **Root Directory `server`**, Node.js 22+, **Build Command `npm install`** y **Start Command `npm start`**. Conectarlo a `main`, aunque no desplegar hasta tener las credenciales y revisar los dominios autorizados.
4. Configurar en Render `MONGODB_URI`, `FRUTIDRY_DB_NAME=frutidry`, `FIREBASE_PROJECT_ID`, `FRUTIDRY_ALLOWED_ORIGINS=https://atanatus.github.io`, archivo de credenciales de Google y `PORT` provisto por Render.
5. Comprobar `GET /healthz` con HTTPS, `GET /api/v1/me` sin token → 401, token válido de un usuario de prueba → perfil nivel 1, token revocado → 401, origen extraño → 403.
6. Configurar rate limiting perimetral, revisión de registros sin PII, protección de secretos, política de retención y controles operativos antes de habilitar beta pública. La protección CORS **no sustituye** autenticación ni controla llamadas desde clientes fuera del navegador.

Se han fijado las dependencias `firebase-admin@14.5.1` y `mongodb@7.9.1` según versiones verificadas a fecha 22-11-2026. Al preparar el servicio real, generar y versionar `package-lock.json` tras `npm install`, usar `npm ci` en Render, y mantener monitorizadas las actualizaciones de seguridad.

## QA y barreras

Ejecutar `node --test tests/account-api.test.mjs` en la raíz. La CI no requiere credenciales, Firebase real ni MongoDB externo porque usa un verificador y una colección simulados; **esto no certifica el despliegue ni la integración real**.

El siguiente cambio funcional será configurar Firebase Authentication cliente e interfaz de cuenta en Vanilla JS tras contar con `firebaseConfig` público y la URL del API. No se activará ninguna competición remunerada hasta disponer de verificación de partidas y controles regulatorios independientes.
