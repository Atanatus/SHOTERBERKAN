# FrutiDry V44 · Motor determinista compartido, fase 2

**Base exacta:** `Atanatus/SHOTERBERKAN@2d09a4b1657bf3fd9d35cdb47fec5113ddc13c08` (V43).
**Estado:** extracción parcial comprobada, **NO** verificador completo de resultados, **NO** XP, **NO** clasificación competitiva.

## Qué se comparte con Node.js

El archivo único `js/simulation-core.js` funciona como script clásico en `file://` y como módulo CommonJS importable desde Node ESM (`import Sim from '../js/simulation-core.js'`). No contiene DOM, Canvas, audio ni librerías de producción.

Funciones nuevas de V44:

| Función | Efecto |
|---|---|
| `isBoardFigure(slot)` | Descarta bomba, calavera y superbola de las fusiones normales |
| `isTargetFruit(slot)` | Identifica frutas fusionables |
| `arePiecesEqualForMerge(a,b)` | Compara nivel normal o identidad de fruta |
| `getHighestBoardLevel(slots,centerLevel)` | Calcula máximo teniendo en cuenta el núcleo |
| `nextRandomPiece(state,coreLevel,maxShield)` | Selecciona munición y modifica únicamente contadores deterministas y RNG en el estado recibido |
| `intersection(ax,ay,bx,by,x,y,r)` | Barrido de segmento y círculo, con distancia paramétrica |
| `advanceProjectile(projectile,phase,world,onProgress?)` | Modifica la cinemática, rebota hasta tres segmentos y devuelve primer impacto (`slot`, `core`, `miss`) o `null` |

Los parámetros geométricos del `world` son explícitos: `width`, `cx`, `cy`, `trackHalfSpan`, `trackHeight`, `slotRadius`, `coreTargetRadius`, `centerLevel`, `routeParams` y `numSlots`.

`onProgress` es un observador **opcional** llamado después de cada segmento o impacto. En el navegador solo actualiza los efectos gráficos; Node.js lo omite. El callback no debe modificar los valores físicos. El núcleo **no** verifica que la entrada del jugador sea auténtica.

## Compatibilidad

Las funciones heredadas siguen existiendo en `js/game.js`, pero delegan al núcleo compartido. La generación de munición consume los mismos números aleatorios, en el mismo orden, y conserva los contadores `shotsSinceSpecial` y `healDrought`. El cálculo de colisión mantiene los mismos límites, orden de ranuras, rebotes y criterios de desempate de V43.

El archivo `tests/fixtures/v43-gameplay-reference.mjs` congela las implementaciones originales antes de esta extracción. Las pruebas comparan resultados exactos, llamadas del generador y notificaciones de avance, no simples tolerancias numéricas.

## Ejecutar QA

```powershell
python tests/validate_repo.py
node --test tests/simulation-core.test.mjs tests/simulation-stage2.test.mjs
node --test tests/*.test.mjs
python tests/browser_qa.py
python tests/account-browser-qa.py
```

La CI ejecuta la batería de navegador por HTTP real. En entornos con la navegación local restringida se puede probar `python tests/browser_qa.py --injected`, pero **no verifica persistencia entre recargas** y no sustituye la CI.

## Qué queda pendiente y por qué importa

1. Extraer un `step(state,inputs)` autoritativo que ejecute impactos, fusiones, cadenas, puntuación, vidas, cambios de fase y game-over, sin DOM ni dependencias de audio.
2. Definir una versión inmutable del motor y un contrato formal de inputs del torneo. El servidor debe fijar semilla, duración, resolución lógica, reglas y opciones permitidas.
3. Ejecutar replays **de principio a fin en Node.js** comparando todo el estado resultante; rechazar acciones imposibles y aplicar límites de CPU, RAM y tiempo de verificación.
4. Añadir concesión de XP **atómica e idempotente** únicamente tras resultado verificado. Para premios en metálico siguen siendo necesarias protección contra bots, revisión humana, bases legales, elegibilidad y autorización del proveedor de pagos.

**Prohibiciones actuales:** no usar `snapshot`, `checkpoint`, `scoreClaimed`, SHA-256 de cliente ni resultados de estas funciones para conceder XP o premios. El receptor de V42 continúa deshabilitado en producción.
