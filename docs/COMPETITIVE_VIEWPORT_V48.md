# FrutiDry V48 — Tablero lógico fijo · previsualización técnica

## Alcance real

La V48 introduce un **modo de QA voluntario** mediante `?competitivePreview=1` que dibuja exactamente el mismo tablero lógico de **390 × 844 píxeles** en pantallas de diferentes dimensiones. Las entradas de ratón/táctil se convierten a coordenadas lógicas según `getBoundingClientRect()` (incluido zoom y escalado fraccional). La imagen se ajusta en su totalidad al área libre del `<main>` y conserva la relación de aspecto 390:844. En modo normal no se aplica ningún tamaño fijo.

El parámetro es público y manipulable. La vista fuerza una semilla de laboratorio (o respeta una semilla de ensayo explícita), de modo que no guarda récord local ni desbloquea reliquias. **No es un permiso, una firma, un ticket de torneo ni un filtro antitrampas.** No se transmiten partidas ni se activan XP, premios o ranking. El mensaje permanente de PRUEBA VISUAL evita confundirlo con un torneo.

## Reglas de integración

- `js/competitive-viewport.js`: script clásico UMD (sin dependencias), carga antes de `js/game.js`, también exportable en Node CJS.
- `FrutiDryViewport.fit`: calcula tamaño CSS a partir del área disponible; devuelve tamaño lógico constante. Rechaza superficies no válidas.
- `FrutiDryViewport.pointerToLogical`: corrige el puntero del DOM al espacio lógico. Se usa tanto en modo normal (conversión identidad) como en previsualización.
- `game.js/resize`: en preview usa `width=390`, `height=844` aunque el `<canvas>` mida menos en CSS; el backing store se dimensiona con DPR acotado.
- Las animaciones de HUD y la cabecera son UI; el tablero competitivo se mide aparte. No se cambia el PRNG, los impactos, score, replay ni el contenido de las reglas.
- `server/run-intake.mjs` ya exige `RUN_LOGICAL_VIEWPORT={width:390,height:844}` en diagnósticos. V48 acerca el navegador a ese contrato, pero **no conecta la sesión servidor a la ejecución**.

## Instrucciones de QA

1. Abrir `https://atanatus.github.io/SHOTERBERKAN/?competitivePreview=1` **después de publicar V48** (según la URL de GitHub Pages realmente desplegada).
2. Comprobar en 320×640, 390×844, 844×390 y 1366×768: tablero entero visible y centrado, borde fino, indicador de prueba visible, toque/puntero proporcional.
3. Redimensionar: no deben cambiar `width=390` ni `height=844`, ni romperse inputs, replay o menú.
4. Abrir la URL sin parámetro: el modo normal conserva la experiencia responsiva.
5. `node --test tests/competitive-viewport.test.mjs` y `python tests/viewport-browser-qa.py`; CI cubre ambos. No usar este modo como prueba de jugadores humanos.

## Operaciones manuales indispensables para pasar a producción

**Primera prioridad: backend de cuentas real** (V40-V42 solo aportan código; no se ha confirmado que estén desplegados). En Firebase Authentication crear proyecto y usuarios de ensayo; en MongoDB Atlas crear clúster y usuario de mínimos permisos; en Render crear Node web service desde carpeta `server` (Node 22+, comandos `npm ci` una vez exista `package-lock.json`; temporalmente `npm install`), con `FIREBASE_PROJECT_ID`, `MONGODB_URI`, `FRUTIDRY_DB_NAME`, `FRUTIDRY_ALLOWED_ORIGINS` y archivo secreto de Firebase Admin. No pegar credenciales en GitHub.

Tras validar `GET /healthz` y el endpoint autenticado `GET /api/v1/me`, habilitar **solo el acceso de pruebas** con configuración pública de `js/account-config.js`; mantener registro abierto y premios deshabilitados. No habilitar ninguna ruta de sesiones hasta que una política de seguridad autorice la competición y exista evidencia completa. Solicitar autorización comercial de PayPal Payouts, definir presupuesto financiado y encaje jurídico de los concursos antes de anunciar premios reales.

## Siguientes trabajos

Sesión competitiva API→cliente, replay con viewport fijo sin reescalados semánticos, asociación de partida a UID y seed de servidor; controles antiabuso y ledger de XP idempotente **después** de una autorización explícita. El modo preview no concede nada.
