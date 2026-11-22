# FrutiDry V41 — Acceso web y perfil permanente

**Estado de esta entrega:** interfaz y contrato de lectura preparados. El botón «CUENTA» permanece disponible en modo informativo hasta que el equipo conecte Firebase Authentication y la API de V40 desplegada en Render. **No se activan** el registro público, XP ganada, clasificación online, inscripción a torneos, publicidad ni transferencias PayPal.

## Arquitectura deliberada

- `index.html` y `css/account.css`: pestaña «CUENTA» en Vanilla HTML/CSS, adaptativa, sin render externo y sin interrumpir el arcade. La apertura pausa el motor, limpia entradas y reinicia el reloj; cerrar regresa al juego.
- `js/account-config.js`: configuración **pública** de Firebase y API. Por defecto `enabled: false` y `allowRegistration: false`. Este archivo no puede contener claves privadas, `serviceAccount`, `MONGODB_URI`, credenciales PayPal ni refresh tokens.
- `js/account-client.js`: contrato estricto de configuración y de `GET /api/v1/me`; no expone operaciones de XP, nivel, torneo ni pagos. El token Firebase se usa únicamente como `Authorization: Bearer`, con `cache: no-store`, `redirect: error`, `credentials: omit`, origen HTTPS explícito.
- `js/account-ui.js`: integración visual, sesión y errores; script clásico para conservar la apertura `file://`. Carga mediante `import()` el **SDK oficial modular de Firebase** desde `www.gstatic.com/firebasejs/13.4.0` únicamente tras habilitar la configuración y abrir la pestaña. No hay frameworks, bundlers ni inicialización del SDK en partidas anónimas. FrutiDry sigue abriendo por `file://` con el panel informativo; el acceso real necesita HTTPS y servicios configurados.
- Firebase Authentication administra contraseñas, recuperación de acceso y emisión/renovación de tokens. El navegador no implementa criptografía ni persiste manualmente credenciales. El SDK usa `browserSessionPersistence`: la sesión no debe sobrevivir al cierre de la pestaña. El servidor Firebase Admin verifica identidad y revocación.
- MongoDB, nivel y XP son autoritativos exclusivamente en la API (`server/account-http.mjs` y `server/account-domain.mjs`). V41 es un consumidor de lectura y **no concede XP**.

## Activar la beta privada cuando estén listos los servicios

1. Completar los pasos del documento `docs/ACCOUNTS_AND_PROGRESSION.md`: Firebase Auth, dominios permitidos, Firebase Admin en Render, MongoDB Atlas, TLS y CORS exacto `https://atanatus.github.io`. Probar primero la API con identidades reales y tokens revocados.
2. En Firebase Console habilitar proveedor **Correo/contraseña** y crear **usuarios de prueba** desde la consola. Mantener el registro en interfaz desactivado. Nota: el SDK también permite registro desde otros clientes si el proveedor lo autoriza; una beta verdaderamente cerrada exige controles adicionales en Firebase/backend, no basta ocultar un botón.
3. Rellenar **solo valores públicos** en `js/account-config.js` y publicar una nueva revisión de GitHub Pages:

   ```js
   window.FRUTIDRY_ACCOUNT_CONFIG = Object.freeze({
     enabled: true,
     allowRegistration: false,
     apiBaseUrl: 'https://tu-api.onrender.com',
     firebase: Object.freeze({
       apiKey: 'API_KEY_PUBLICA',
       authDomain: 'tu-proyecto.firebaseapp.com',
       projectId: 'tu-proyecto',
       appId: '1:123:web:abc'
     })
   });
   ```

4. Abrir la web: `CUENTA` → correo/contraseña de prueba → `GET /api/v1/me`; comprobar nivel 1 y XP 0. Cerrar sesión y verificar que al cerrar la pestaña no sigue conectada.
5. Validar errores: API apagada → aviso y arcade operativo; contraseña inválida → mensaje genérico; token revocado → API 401; CORS inválido → no se muestra perfil. Verificar móvil 320 px y escritorio 1366 px.
6. No activar `allowRegistration: true` hasta disponer de políticas de privacidad, protección contra abuso, verificación de correo, límites de registros, derechos de usuario y consentimiento aplicable. Para un control estricto de altas se necesita un procedimiento de invitación en backend o Identity Platform con mecanismos apropiados.

## Política de seguridad y UX

- El panel nunca acepta valores de XP/level del formulario, query string, `localStorage` o JSON de diagnóstico. Todo el perfil se extrae de la respuesta validada `GET /api/v1/me`.
- El correo no se publica en clasificaciones ni se envía a FrutiDry salvo la información contenida en el token verificado. Las contraseñas van directamente al SDK de Firebase.
- Una respuesta tardía de un usuario anterior se descarta por identificador de solicitud/UID. Cambiar de cuenta cancela consultas anteriores.
- La sesión se mantiene solo durante la pestaña actual; no se guarda un ID token en las claves históricas `kosen_*`.
- La API de V40 solo devuelve perfil propio y `tournamentAccessEnabled=false`, `cashPrizesEnabled=false`. Cumplir nivel 11 no supone activación automática.
- `account-config.js` es público. La **Firebase Web API key NO es un secreto administrativo**, pero debe restringirse correctamente; las credenciales de Firebase Admin, MongoDB Atlas y PayPal solo en secretos de Render.
- El CORS del servidor mitiga accesos desde orígenes web no permitidos, pero **no sustituye** a autenticación, límites de tráfico, validación de identidad ni controles antiabuso.
- Los scripts externos de Firebase se ejecutan solo tras activación explícita. Antes del despliegue, revisar CSP, dependencias externas, privacidad, terceros y sus versiones. Un empaquetado local/autohospedado será preferible si la política de distribución exige reproducibilidad offline completa.

## QA

`node --test tests/account-client.test.mjs` ejecuta pruebas del contrato sin conexión ni credenciales. El navegador requiere probar la interfaz y, cuando exista entorno, una cuenta de Firebase y API reales. La falta de servicios no bloquea la partida anónima ni las pruebas de replay. **Esta V41 no demuestra autenticación extremo a extremo en producción.**

## Bloqueos para competir por dinero

Ningún endpoint entrega XP, no hay partidas verificadas ni cuentas con nivel concedido por el servidor, y tampoco hay clasificaciones oficiales ni una aprobación legal del producto. Las vías de premios en metálico siguen deshabilitadas hasta cerrar esas barreras.
