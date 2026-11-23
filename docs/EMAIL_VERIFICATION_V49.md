# FrutiDry V49 · Verificación de correo en beta cerrada

## Estado real

- Firebase Auth `frutidry-21bb8` tiene dos cuentas de prueba y registro público bloqueado (configuración externa informada por el equipo, no comprobada por pruebas locales).
- Render **todavía no está creado ni desplegado**. MongoDB Atlas **no está conectado**. No se hacen llamadas de integración reales a Firebase.
- `js/account-config.js` se mantiene con `enabled:false`, `allowRegistration:false`, `apiBaseUrl:''`. La web pública sigue en modo informativo y el arcade funciona sin cuentas.
- No se activan sesiones competitivas en producción, XP, rankings, premios ni PayPal.

## Cambios

1. **SDK de la web:** `js/account-verification.js` es un archivo clásico, sin dependencias externas en tiempo de carga. Al abrir CUENTA, el SDK Firebase existente se importa dinámicamente. Al iniciar sesión sin correo verificado, se muestra un aviso con **ENVIAR VERIFICACIÓN** y **YA LO HE VERIFICADO**.
2. **Envío voluntario:** usa `sendEmailVerification(user)` con idioma de autenticación `es`. No envía mensajes automáticamente, ni al cargar la página ni al iniciar sesión. Un límite local de 60 segundos reduce pulsaciones accidentales; no es un control antiabuso del servidor y se reinicia al recargar. Firebase aplica sus límites de servicio.
3. **Comprobación:** `reload(user)` seguido de `user.getIdToken(true)`. Esto evita continuar usando un JWT con el claim antiguo después de confirmar el correo. No almacena tokens en `localStorage`, logs ni diagnósticos.
4. **API:** `GET /api/v1/me` sigue aceptando ID tokens válidos aunque el correo esté pendiente; muestra nivel y XP sin conceder privilegios. Solo las rutas POST de partidas (si se inyecta el servicio de recepción) exigen `identity.email_verified === true` **y un correo presente**, después de `verifyIdToken(token, true)` en Firebase Admin. Responden `403 {"error":"EMAIL_VERIFICATION_REQUIRED"}` antes de tocar MongoDB. El servidor no lee `emailVerified` de cabeceras, JSON, puntuaciones ni perfiles para autorizar.
5. **Producción:** las rutas de partida siguen devolviendo `423 RUN_VERIFICATION_DISABLED`, porque `account-production.mjs` no inyecta `runIntake`; un correo confirmado **no** abre la competición.

## Qué comprobar al desplegar Render en el futuro

1. Configurar Firebase Admin en el servicio Render como archivo secreto, MongoDB Atlas, CORS exacto y acceso de red restringido; ver documentación V40/V41.
2. Antes de modificar `account-config.js`, probar `/healthz` (200) y `/api/v1/me` sin token (401). La API no muestra correos ni secretos.
3. Activar temporalmente **solo beta privada**, con el registro público de Firebase bloqueado y `allowRegistration:false`. Iniciar sesión con una cuenta aún no verificada: debe verse el aviso de correo y poder consultarse el perfil (nivel 1 / XP 0).
4. Pulsar ENVIAR VERIFICACIÓN y abrir el enlace recibido desde el correo de prueba; pulsar YA LO HE VERIFICADO, que recarga el usuario y fuerza un token nuevo. Tras el cambio, el aviso desaparece.
5. Probar la revocación/deshabilitación de una cuenta en un entorno controlado: una petición con el token anterior debe recibir 401. Las rutas de partidas siguen 423 hasta que se despliegue expresamente un receptor.
6. Para futuras rutas competitivas con `runIntake` inyectado, probar en entorno no público: token con `email_verified:false` debe recibir 403, token actualizado con `true` alcanza el receptor (sin conceder XP).

## Pruebas automáticas

```bash
node --test tests/account-api.test.mjs tests/account-client.test.mjs tests/account-email-verification.test.mjs tests/run-intake.test.mjs
python tests/account-verification-browser-qa.py
```

La prueba Playwright usa la UI del juego con un SDK Firebase simulado; no envía correos reales. GitHub Actions instala Chromium. En entornos Linux con Chromium preinstalado se puede establecer `FRUTIDRY_CHROMIUM=/usr/bin/chromium` para esa prueba.

## Limitaciones de seguridad pendientes

- `email_verified` confirma el control del buzón en el momento de emitir el token; **no** demuestra mayoría de edad, titularidad exclusiva de cuenta, residencia, identidad civil ni ausencia de bots.
- El backend realiza verificación criptográfica y revocación con Firebase Admin. El check de claim no debe interpretarse como autorización para premiar: hacen falta controles del lado servidor por región/edad, políticas legales, reputación, rate limiting, antifraude y ledger de XP idempotente.
- Enviar mensajes usa los límites propios de Firebase; los 60 segundos del cliente no sustituyen cuota en servidor.
- En un despliegue real debe existir retención mínima de logs, backups Atlas y plan de recuperación; no se activa registro público antes de completar esas obligaciones.
