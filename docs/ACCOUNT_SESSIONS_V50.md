# FrutiDry V50 — Sesiones de la beta cerrada, sin servicios externos

**Base:** `main` de V49, commit `e74da9d9d161c3c60f869a2a86e176e7b5334288`. Esta entrega no activa Render, Firebase cliente, XP, torneos, PayPal ni registro público. `js/account-config.js` permanece con `enabled:false`.

## Objetivo y cambios

- `js/account-session.js`: Vanilla JS, sin framework ni SDK en tiempo de carga. Es el único controlador de las lecturas de perfil, con cancelación y generación asociada a la identidad. Cada cambio de usuario invalida las lecturas anteriores. El token se usa solo para la petición actual y **nunca** se almacena en el navegador de forma manual.
- Un `401` de `/api/v1/me` desencadena **exactamente una** renovación `user.getIdToken(true)` y una nueva consulta. Si la API responde 401 por segunda vez, se invalida la sesión de perfil y se solicita el cierre de sesión Firebase, condicionado al usuario actual. No hay bucles de reintentos.
- `403`, `429`, `503`, fallos de conexión o timeout mantienen la sesión; se comunica el problema sin revelar trazas de backend y sin permitir que una respuesta tardía rellene el perfil de un UID diferente.
- El módulo verifica siempre `account.uid === firebaseUser.uid` antes de mostrar los datos, incluso si el API responde `200`.
- `js/account-ui.js`: sustituye la gestión manual de `requestId` por el módulo; conserva la verificación de correo y el inicio de sesión con el SDK modular existente. Se carga el nuevo módulo como **script clásico** antes de `js/account-ui.js`, compatible con `file://` en modo sin cuentas.
- `scripts/check-beta-readiness.mjs`: auditoría **offline** de configuración pública y contratos de código. No inspecciona el estado real de Render, Firebase, Atlas, usuarios o tokens; no imprime URI ni archivos secretos. Distingue `safeToContinueLocalDevelopment` de `productionAuthConfirmed` (siempre `false` aquí).

## Política de errores

| Caso | Acción local | Acceso a perfil |
|---|---|---|
| Token inicial aceptado | Mostrar perfil propio | Lectura solamente |
| Primer 401 | `getIdToken(true)` y una nueva petición | No mostrar resultados hasta terminar |
| Segundo 401 | Invalidar sesión y solicitar `signOut` | Bloqueado |
| 403 / 429 / 503 / red | Mostrar error no sensible | No cerrar sesión |
| UID del perfil distinto | Rechazar resultado | Bloqueado |
| Cambio de usuario | AbortController + versión de petición | Respuesta anterior descartada |
| Timeout de 9 s | Abortar petición, mostrar error | Sesión no eliminada |

El backend conserva `verifyIdToken(token,true)` para revocación y `email_verified === true` para posibles operaciones de partida. Ninguna lógica de esta entrega concede XP ni autoriza competiciones.

## Pruebas sin Firebase ni Render

```powershell
node --test tests/account-session.test.mjs tests/beta-readiness.test.mjs
node scripts/check-beta-readiness.mjs
```

Batería completa de cuentas (incluye API, recepción y verificación de correo):

```powershell
node --test tests/account-api.test.mjs tests/account-client.test.mjs tests/account-email-verification.test.mjs tests/account-session.test.mjs tests/beta-readiness.test.mjs tests/run-intake.test.mjs
```

La prueba `tests/account-session-browser-qa.py` usa Chromium y Firebase simulado. La batería completa del repositorio y las pruebas HTTP reales de Render se comprobarán en GitHub Actions o después de que el servicio Render exista.

## Próximas acciones manuales, bloqueadas por decisión del equipo

1. Crear el servicio Render cuando lo aprueben los socios; añadir las IP Outbound a la allowlist de Atlas.
2. Guardar `MONGODB_URI`, `FIREBASE_PROJECT_ID=frutidry-21bb8`, orígenes HTTPS exactos y la clave Firebase Admin en Secret Files de Render (no Git).
3. Comprobar `/healthz` 200, `/api/v1/me` 401 sin token y 200 con token válido; probar revocación real.
4. Solo después configurar valores web públicos y `enabled:true`, preservando `allowRegistration:false`.

**Estado de competición:** rutas de partida 423 en producción; verificación técnica de replay no es certificación antifraude ni autorización económica.
