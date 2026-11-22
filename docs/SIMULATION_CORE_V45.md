# FrutiDry V45 · Transiciones de estado compartidas

**Estado:** fase 3 de extracción a Node.js; no es un verificador de partidas completo y no concede XP ni dinero.

## Alcance ejecutado

El núcleo `js/simulation-core.js` (script clásico UMD para navegador `file://`, importable desde Node) incorpora ahora los siguientes cambios de estado del juego que antes se ejecutaban directamente en `js/game.js`:

| Función | Estado bajo control determinista |
|---|---|
| `applyHealImpact` | Restaura escudo o añade 150 puntos si está lleno |
| `applyTempoImpact` | Aceleración o ralentización, duración y +60 puntos |
| `applySuperchargerPlacement` | Crea pieza mejorada y añade nivel × 45 puntos |
| `applyPiecePlacement` | Inserta una pieza, resetea combo y añade nivel × 15 puntos |
| `applyFailedImpact` | Resetea combo y resta un punto de escudo |
| `applyCoreDetonation` | Añade puntos por nivel de proyectil y elimina núcleo |
| `applyChainMerge` | Actualiza pieza, combo, mejor combo y puntos con multiplicador de ráfaga |
| `findChainNeighbor` | Busca en orden la primera pieza fusionable de la misma vía |

Las llamadas en `js/game.js` utilizan directamente esas funciones. Son mutaciones **de un estado de simulación ya autorizado**. No aplican verificación de entrada ni autenticación, por lo que **no se pueden usar para fiarse de valores procedentes del navegador**.

Las animaciones, HUD, sonido, localStorage y efectos visuales permanecen fuera del núcleo. Los formatos de diagnóstico y `rulesVersion: 20` no cambian.

## Evidencias y pruebas

1. `node --test tests/simulation-stage3.test.mjs`: fórmulas V44 congeladas e independientes; estados originales y nuevos comparados campo a campo (curación, temporizadores, encajes, supercharger, vidas, fusiones, núcleo y selección de vecinos).
2. `node --test tests/*.test.mjs` y `python tests/validate_repo.py`: regresiones estáticas y verificación SHA de los 59 WebP.
3. `python tests/browser_qa.py --injected`: 20 escenarios de replay, cuatro viewports y errores de recursos/almacenamiento.
4. Comparación local en Chromium de 11 secuencias V44/V45 con `ReplayLab.snapshot()` y acciones: resultado idéntico.
5. La navegación HTTP desde Chromium está bloqueada en este entorno (`ERR_BLOCKED_BY_ADMINISTRATOR`); las pruebas HTTP, incluida persistencia real entre recargas y UI de cuentas, permanecen a cargo de GitHub Actions.

## Bloqueos antes de dinero o XP

- Implementar en Node.js el bucle completo de simulación con disparos, impactos especiales, balística, cadenas, RNG, final de partida y checkpoints, usando reglas fijadas por versión.
- Reproducir únicamente sesiones servidor con límites de tiempo, semilla, viewport y versión de reglas congelados. Comparar el resultado **calculado por el servidor**, no el resultado afirmado en el JSON.
- Introducir adjudicación idempotente y transaccional de XP y tablas de clasificación, auditoría de abuso y revisión legal de premios.
- Hasta entonces, producción mantiene la recepción desactivada; en pruebas cualquier diagnóstico recibido es `PENDING_INDEPENDENT_VERIFICATION`, sin XP, ranking ni pagos.

## Publicación segura

Parche: `frutidry_v45_shared_scoring_stage3.patch`, preparado contra el commit oficial V44 `2f7421993017e462677266abb1e5628897184b6e`. Ejecutar el publicador PowerShell de la misma entrega, que comprueba `origin/main`, árbol limpio, aplica el parche, ejecuta QA y publica por fast-forward sin `--force`.
