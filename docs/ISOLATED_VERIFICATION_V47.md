# FrutiDry V47 · Verificación aislada y control de estados (sin premios)

**Base:** `main` V46, commit `1c4eec1a44b2ae53c807755b479360e6db4a64bf`, reglas V20, diagnóstico V24 y protocolo de sesiones V42. La V47 **no introduce rutas de torneos ni abre la API de recepción de partidas**. Las cuentas, los premios y el registro de XP continúan desactivados en producción. La experiencia otorgada por todas las rutas de verificación nuevas es siempre **0**.

## Responsabilidades de cada módulo

- `server/isolated-verifier.mjs`: controla la entrada JSON, verifica semilla y reglas antes de lanzar procesos, limita a **1 proceso activo y 2 solicitudes en cola** (valores por defecto), y corta la ejecución a **20 segundos**. Tiene método `close()` para cerrar sin dejar trabajos pendientes. Rechaza exceso de cola con `DEFERRED / VERIFIER_BUSY`, no con una acusación de fraude.
- `server/isolated-verifier-worker.mjs`: un único trabajo por proceso, sin DB, sin HTTP, sin secretos de Render, sin salida de diagnóstico a logs y con heap V8 limitado a **128 MiB**. Ejecuta el mismo `verifyHeadlessDiagnostic` probado en V46 y devuelve un resultado tipado. No se evalúa JavaScript suministrado por el jugador.
- `server/run-verification.mjs`: única interfaz de operación interna de revisión. Obtiene la **semilla original y el diagnóstico persistido** de una sesión ganada mediante un bloqueo en la base de datos; comprueba SHA-256 del JSON almacenado y versiones de reglas, llama al proceso hijo y guarda el estado sin recompensas.
- `server/run-mongo.mjs`: bloqueo atómico `findOneAndUpdate` sobre `_id`, `status`, caducidad y contador de intentos; finalización `updateOne` vinculada al ID del bloqueo. Los resultados de un verificador antiguo no pueden sobrescribir los de otro. `memoryRunStore()` es exclusivamente de pruebas, no de despliegue multiinstancia.

## Máquina de estados para una partida

```text
ISSUED
  └─ envío de diagnóstico autenticado y dentro de plazo
     └─ PENDING_INDEPENDENT_VERIFICATION
         └─ claim atómico → VERIFYING
             ├─ REPLAY_CONSISTENT_NOT_ANTICHEAT
             ├─ REJECTED
             ├─ PENDING_INDEPENDENT_VERIFICATION (incidencia transitoria, hasta 2 reintentos)
             └─ REVIEW_REQUIRED (tras 3 intentos fallidos)
```

`REPLAY_CONSISTENT_NOT_ANTICHEAT` significa únicamente que el replay sigue las reglas programadas: **no demuestra interacción humana ni descarta automatización, macros, multi-cuentas o manipulación del cliente**. Tampoco es un estado de premio, clasificación o verificación KYC.

Tras un fallo abrupto, un bloqueo `VERIFYING` puede reclamarse cuando expire su `verificationLeaseUntil`, siempre que queden intentos. Si el proceso falla después del tercer intento sin completar el estado, es necesaria una reparación administrativa supervisada; nunca se concede XP automáticamente. Al conectar un worker real a la base de datos debe existir un proceso de conciliación de bloqueos caducados y alertas de `REVIEW_REQUIRED`.

## Uso interno de desarrollo

Desde la raíz de FrutiDry:

```powershell
node --test tests/isolated-verifier.test.mjs tests/run-verification.test.mjs
node --test tests/*.test.mjs
python tests/validate_repo.py
```

Ejemplo de integración **solo dentro de un worker administrativo confiable**, no en la API pública:

```js
import {createIsolatedVerifier} from './server/isolated-verifier.mjs';
import {createRunVerificationService} from './server/run-verification.mjs';
import {mongoRunStore} from './server/run-mongo.mjs';

const verifier = createIsolatedVerifier({maxConcurrent:1,maxQueue:2,timeoutMs:20000});
const service = createRunVerificationService({
  store: mongoRunStore(db.collection('runs')),
  verifier,
  leaseMs:30000
});
const outcome = await service.verifyOne(trustedRunId);
// outcome.status nunca permite otorgar XP, clasificación ni premio en V47.
verifier.close();
```

**El ejemplo exige una conexión `db` confiable ya abierta y un ID proporcionado por el sistema interno.** No pega credenciales ni publica un endpoint. La colección debe conservar los campos de V42 (`seed`, `rulesVersion`, `gameVersion`, `viewport`, `diagnosticJson`, `reportHash`). El índice único `_id` es imprescindible y viene por defecto en MongoDB. La integración de producción no está habilitada ni desplegada.

## Límites y amenazas que siguen abiertas

1. `--max-old-space-size=128` **limita el heap JavaScript, no el RSS total, el número de archivos ni la red**. Los procesos comparten usuario y sistema de archivos; `node:vm` tampoco es sandbox. En producción se necesita aislamiento de contenedor/sistema operativo, red restringida, seccomp o equivalente, límites de CPU/RAM y un supervisor.
2. El timeout padre de 20 s mata el proceso hijo, pero no sustituye el control de tasa en el perímetro ni la cuota por UID/IP. **No conectar el servicio a peticiones públicas en esta versión.**
3. El viewport competitivo está fijado contractualmente a **390×844**; el juego todavía adapta su física al Canvas real. Se necesita modo competitivo con escala visual e inversión de coordenadas de entrada. Jugar en otras resoluciones no puede generar resultados oficiales hasta resolverlo.
4. Los pasos simulados no prueban tiempo real, humanidad o autenticidad del dispositivo. Antes de clasificaciones remuneradas son necesarios controles de detección de bots, límites de sesiones, fraude de identidad, revisión manual y reglas publicadas.
5. Persistencia y transacciones: el resultado de replay no cambia `accounts.xp`, ni existe todavía ledger de XP por `runId`, ni asigna premios PayPal. Esa implementación será posterior a una política de elegibilidad autorizada y controles antifraude comprobados.
6. Los tests prueban un proceso real y adaptadores simulados, **no MongoDB Atlas, Firebase ni Render desplegados**.

## Reglas de operación y fallos

| Resultado | Significado | Acción |
| --- | --- | --- |
| `REPLAY_CONSISTENT_NOT_ANTICHEAT` | Motor determinista coincide | Retener para revisión posterior. XP = 0 |
| `REJECTED` | Diagnóstico incompatible o registro íntegro incorrecto | No conceder recompensas; registrar código, nunca datos privados |
| `DEFERRED` | Falta capacidad, timeout, worker caído | Reintentar dentro del límite |
| `REVIEW_REQUIRED` | Tres intentos fallidos | Revisión manual, sin recompensas |
| `NOT_CLAIMED` | Estado ya procesado, bloqueo ajeno o ID inválido | No duplicar operación |

Un timeout no es prueba de trampa. Los resultados no revelan tokens de Firebase, usuarios, direcciones PayPal, diagnósticos completos ni trazas internas. Revisar registros operativos sin capturar PII.
