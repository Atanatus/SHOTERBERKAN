# FrutiDry V43 · Core determinista compartido (fase 1)

**Estado: extracción parcial, no verificador de puntuaciones.** Base: `main` V41+V42 commit `10d164dd1fcffa811e3c065be21b2b94b62699c3`.

## Alcance implementado

Se trasladan del código original de `js/data.js` y `js/game.js` a `js/simulation-core.js` las siguientes funciones **sin modificar las reglas ni los resultados**:

- `createPRNG(seed)`: mismo algoritmo `mulberry32`, secuencia de floats y contrato `inspect()` (`state`, `calls`).
- `generateProceduralRoute(seed, milestoneIdx)`: misma selección determinista de circuitos.
- `getLaneOffsetY(laneIndex, laneCount, spacingY)`: geometría básica.
- `evalLaneAt(u, laneIndex, geometry, routeParams)`: coordenadas de circuito con parámetros explícitos.
- `getSlotWorldPos(index, phase, geometry, routeParams, numSlots)`: posición de ranura sin leer DOM ni Canvas.

Este archivo se carga **antes de `js/data.js`**, como script clásico, manteniendo `file://`. Node.js lo consume desde el mismo archivo vía CommonJS, sin duplicar el algoritmo ni añadir paquetes de producción. `js/game.js` conserva sus firmas externas y delega estos cálculos al core compartido.

## Pruebas

```powershell
node --test tests/simulation-core.test.mjs
python tests/validate_repo.py
```

Las pruebas Node comparan por igualdad exacta resultados contra las funciones originales V42, incluyendo 13.200 invocaciones del generador PRNG, 242 variantes de circuito y 23.760 posiciones (`3 geometrías × 11 semillas × 8 hitos × 10 fases × 9 ranuras`), más los entornos Node/browser y el orden de carga. Se conservan las pruebas anteriores de replay en el workflow de GitHub.

## Lo que V43 NO certifica

`js/game.js` todavía calcula dentro del navegador los disparos, impactos, fusiones, puntuación, vidas, estado final y resolución de eventos. Ninguna comprobación de geometría o RNG certifica por sí sola un resultado competitivo. Los JSON diagnósticos enviados por clientes siguen siendo **declaraciones no confiables**. La API de V42 no debe conceder XP ni entrar en una tabla de clasificación; los endpoints de recepción siguen desactivados en producción.

## Orden de extracción posterior

1. Mover a un reductor puro `step(state, input)` el avance de estado, el movimiento de proyectiles, las colisiones, resolución de fusiones, efectos con consecuencias jugables y puntuación; el render y audio quedan como consumidores sin autoridad.
2. Fijar versiones semánticas del motor y resolver las dimensiones lógicas desde el servidor; comparar trazas completas browser/Node en miles de frames, incluidas pausas, reanudaciones, cambios de carril y game-over.
3. Reproducir en Node sesiones emitidas por el servidor; rechazar entradas fuera de ventana, acciones imposibles, versiones desconocidas, trazas incompletas y divergencias de estado; imponer límites CPU, tiempo, memoria y concurrencia.
4. Después de aprobar verificación independiente y seguridad, plantear concesión atómica e idempotente de XP en MongoDB, rankings públicos y revisión de premios en metálico. Determinismo no evita automatizaciones y bots; los torneos económicos exigirán medidas complementarias.

**Política de despliegue:** sin secretos en GitHub Pages, sin pagadores automáticos, sin cuentas/XP reales mientras el backend no tenga verificador autorizado y supervisión.
