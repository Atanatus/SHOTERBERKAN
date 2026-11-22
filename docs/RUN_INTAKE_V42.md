# FrutiDry V42 · Recepción de partidas vinculada a cuentas (laboratorio)

**Estado real:** existe el contrato de API y un receptor reproducible de diagnósticos, probado con identidad y almacenes simulados. **No existe aún un verificador de físicas autoritativo**. El servidor de Render en `account-production.mjs` NO inyecta `runIntake`, por lo que ambas rutas de escritura responden `423 RUN_VERIFICATION_DISABLED`. No se activan XP, clasificación, torneos ni premios.

## Componentes

- `server/run-intake.mjs`: define la sesión creada por el servidor (UID verificado, UUID aleatorio, semilla criptográfica, reglas 20, gameVersion 24, viewport lógico fijo 390×844 y expiración a los 75 minutos); comprueba estructura básica de diagnósticos y marca sus resultados como **pendientes de verificación independiente**.
- `server/run-mongo.mjs`: persistencia preparada en MongoDB con `insertOne`, `findOne` y un `updateOne` **atómico** que requiere propietario, estado `ISSUED` y expiración futura. El diagnóstico se almacena como texto JSON acotado, no como campos MongoDB controlados por el cliente. No está conectado a producción.
- `server/account-http.mjs`: soporta el protocolo cuando la construcción de la API recibe explícitamente un `runIntake`. Sin ese objeto no recibe ni almacena diagnósticos, aunque se autentique un usuario. CORS explícito, cuerpo JSON acotado y token de Firebase obligatorio para el modo de prueba.
- `tests/run-intake.test.mjs`: comprobación del contrato, caducidad, identidad, duplicados, campos falsificados y denegación de las rutas por defecto.

## Rutas de la API (cerradas en producción)

**`POST /api/v1/runs`** con `Authorization: Bearer <Firebase ID token>`, `Content-Type: application/json`, cuerpo `{}`. En un backend donde un operador haya inyectado el receptor, devuelve HTTP 201:

```json
{
  "run": {
    "id": "9e18897e-6e78-4d70-9918-b4d75e2ec4b2",
    "seed": 12345,
    "expiresAt": "2026-11-22T20:00:00.000Z",
    "viewport": {"width": 390, "height": 844},
    "gameVersion": 24,
    "rulesVersion": 20,
    "status": "ISSUED",
    "awardsEnabled": false
  }
}
```

Este es un **ejemplo de contrato**, no una sesión realmente emitida.

**`POST /api/v1/runs/{id}/diagnostic`** con el mismo encabezado de autorización y cuerpo `{"diagnostic": <diagnóstico V24 esquema 2>}`. Si pasa las comprobaciones estructurales y la actualización atómica, devuelve HTTP 202 con `status: "PENDING_INDEPENDENT_VERIFICATION"`, `xpGranted: 0`, `ranked: false`, `eligibleForPrizes: false` y SHA-256 del JSON normalizado tras analizarlo. El hash permite comprobar si el registro almacenado ha cambiado desde su recepción; **no es prueba de juego legítimo**.

Errores: `401` token ausente/revocado, `403` origen no autorizado, `404` partida inexistente/de otro usuario, `409` duplicada, `410` caducada, `413` informe demasiado grande, `415` contenido no JSON, `423` modo de producción cerrado. Otros errores estructurales responden 400. Se rechazan propiedades de XP, nivel, ranking o premios incluidas en el diagnóstico.

## Limitaciones que NO deben omitirse

1. Los *checkpoints* y las puntuaciones del diagnóstico son generados por el navegador; una persona puede falsificarlos. La V42 solo los **recibe y archiva**. No valida todavía el resultado ni concede un solo punto de XP.
2. El motor actual diferencia las partidas de laboratorio con semilla manual. Para una competición futura habrá que crear un **modo de partida de servidor** que consuma una semilla emitida y el viewport lógico estandarizado, sin depender del tamaño real de pantalla ni confundirlo con una partida de práctica.
3. El verificador independiente debe reproducir las entradas con **el mismo motor de reglas** en un entorno controlado; comparar hashes enviados por el cliente no basta. Debe rechazar versiones de reglas no autorizadas, controles imposibles y divergencias. Esto es necesario pero no suficiente frente a bots o automatización no permitida.
4. Antes de conectar `runIntake` en Render: límites de tasa por identidad/IP, índices de Mongo (`_id` único), expiración/retención y borrado de evidencias, monitorización sin datos personales, cuotas y estrategia de aislamiento para replays. El ejemplo de memoria no sirve en instancias múltiples.
5. Antes de conceder XP: versionar y aprobar la curva; usar un **ledger de créditos único por ID de partida**, actualización atómica de XP, reversión/auditoría y límites de abuso. No debe existir ningún endpoint de asignación directa desde el navegador.
6. Antes de dinero real: además del verificador, revisión legal, elegibilidad, bases, financiación, prevención de fraude y habilitación independiente de PayPal. Un nivel 11 no activa automáticamente pagos.

## Pruebas

```bash
node --test tests/run-intake.test.mjs tests/account-api.test.mjs
```

En GitHub Actions se ejecutan sin Firebase, MongoDB ni secretos reales. Los éxitos de la CI validan el código de este receptor y sus invariantes, **no** un torneo real, una autenticación de producción o un premio pagado.

## Próximo hito técnico

Extraer las **reglas simuladas** a un módulo determinista independiente del DOM/Canvas y ejecutar en servidor un replay completo con semillas y acciones verificables. Solo entonces se podrá implementar el ledger de XP.
