# FrutiDry V46 · Reproducción completa en Node.js (preparación, sin premios)

## Qué funciona

`server/headless-replay.mjs` carga exclusivamente **seis scripts de juego confiables procedentes del repositorio** dentro de un contexto Node.js (`node:vm`) con sustitutos inertes para DOM, Canvas, audio y efectos. Ejecuta `resize`, `resetGame` y los mismos `update`, `ReplayLab.beforeStep/afterStep`, disparos, impactos, fusiones, hitos, vidas y estado final que usa el navegador. **No evalúa código incluido en diagnósticos**. La semilla de comprobación procede de la sesión de servidor y no del usuario.

La API `verifyHeadlessDiagnostic(diagnostic, {seed})` aplica primero `inspectDiagnostic` de V42 (formato, versión, semilla, vista 390×844, límites, acciones y checkpoints); luego reconstruye cada paso a partir de la semilla y comprueba el resultado final y los checkpoints periódicos con el algoritmo V24, reglas 20. No compara simplemente los hashes o la puntuación que proporciona el cliente.

**Devuelve `REPLAY_CONSISTENT_NOT_ANTICHEAT`, no un certificado de juego legítimo.** Un atacante puede crear entradas válidas mediante bots, asistencia externa o una versión modificada del cliente. La trazabilidad tampoco demuestra humanidad, identidad o que se respetaran tiempos reales. No se concede XP, no se actualizan clasificaciones, no se valida acceso al torneo ni se preparan pagos. No se ha conectado el módulo a ninguna ruta HTTP ni a MongoDB. `node:vm` **no es un sandbox de seguridad**; la integración online deberá correr en un proceso/worker aislado con límites verificables de CPU y memoria y solo cargar código trusted versionado.

## Uso por desarrolladores

Desde la raíz:

```powershell
node --test tests/headless-replay.test.mjs
node scripts/verify-diagnostic.mjs tests/fixtures/v46-browser-finished.json --seed=1234
node scripts/verify-diagnostic.mjs tests/fixtures/v46-browser-checkpoints.json --seed=24681357
```

El comando exige una **semilla esperada independiente** (`--seed`) y admite diagnósticos JSON de hasta 2 MiB. No acepte una semilla facilitada por el cliente como prueba de emisión. La primera captura reproduce 151 frames y 9 disparos; la segunda 820 frames, 31 cambios de controles y un checkpoint intermedio a 600. Los dos archivos se generaron con el motor real en Chromium bajo un lienzo lógico de 390×844 configurado expresamente en la prueba; son **fixtures de QA**, no partidas elegibles. El test fijó una semilla para reproducibilidad y el modo no-práctica para ejercitar el contrato de recepción. No representa una prueba de conexión Firebase/Render/MongoDB.

La ejecución de diagnóstico está limitada a 36.000 pasos y 15 s de tiempo acumulado por solicitud en este ejecutor local; esos límites son conservadores e independientes del límite de intake V42, que todavía admite diagnósticos de hasta una hora. Un rechazo por presupuesto no significa fraude; significa que el verificador actual no cubre esa duración. El modo de ejecución, la vista lógica y las reglas deberán fijarse en cada competición antes de permitir partidas remuneradas.

## Barreras pendientes de una versión competitiva

1. **Mismo espacio lógico en todos los clientes.** La física actual usa el tamaño CSS real del Canvas. El protocolo V42 fija 390×844, pero la interfaz móvil normal no garantiza ese tamaño; habrá que implementar un viewport lógico fijo con escalado de presentación para la modalidad competitiva.
2. **Sesiones reales** con token autenticado, semilla del servidor, expiración, límites de intentos y vinculación atómica de cada envío; el intake V42 permanece desactivado en producción.
3. **Aislamiento operativo** del verificador, límites de memoria, CPU, cola, rate limiting y diagnósticos de divergencia sin exponer detalles internos.
4. **Más medidas antifraude**: ritmo de acciones, anomalías, múltiples cuentas, patrones de bots y revisión humana de premios. La reconstrucción solo acredita consistencia con las reglas; no certifica interacción humana.
5. **XP idempotente** en transacción con cuenta y ledger de partida, únicamente después de los controles de legitimidad; nunca desde `stats.score` del cliente.
6. **Normativa y pagos**: confirmar autorización jurídica/operativa, reglas públicas y PayPal Payouts antes de abrir el primer torneo con efectivo.

## Pruebas de regresión

`tests/headless-replay.test.mjs` usa capturas de un navegador real y comprueba reproducción idéntica, falsificación de puntos, ángulo, identidad de munición, checkpoint, inputs de movimiento, semilla errónea, viewport erróneo, campos de XP/ganadores prohibidos y presupuesto de pasos.

También siguen vigentes las pruebas de simulación compartida V43–V45, de cuentas V40–V42 y de navegador existentes. CI debe ejecutar todas las pruebas Node, ambas pruebas de navegador y `tests/validate_repo.py` antes de considerar publicada V46. Las pruebas locales con navegador inyectado no demuestran persistencia HTTP real; esa prueba la realiza GitHub Actions.
