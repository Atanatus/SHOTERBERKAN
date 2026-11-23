# FrutiDry V45 · Transiciones de partida compartidas (fase 3; premios y XP desactivados)

- `js/simulation-core.js` comparte ahora las mutaciones de curación, aceleración/ralentización, encaje, supercharger, fusiones y combos, daño por fallo, puntuación de núcleo y búsqueda de fusiones encadenadas.
- `js/game.js` utiliza esas mismas transiciones en lugar de tener su propia copia de las reglas. Canvas, efectos, sonido y almacenamiento permanecen en el navegador.
- `tests/simulation-stage3.test.mjs` compara resultados y mutaciones contra fórmulas congeladas de V44, incluidos límites de niveles, combos y escudos. Las pruebas de replay siguen sin cambiar la semántica de `rulesVersion: 20`.
- **No es un verificador de partidas completo:** todavía faltan resolución íntegra de proyectiles, impactos especiales y bucle de simulación en Node.js, junto con restricciones temporales/antifraude y liquidación atómica. Los diagnósticos recibidos continúan como `PENDING_INDEPENDENT_VERIFICATION`, XP 0, ranking inactivo y PayPal desactivado.

# FrutiDry V44 · Extracción determinista (fase 2; sin XP ni puntuación certificada)

- El mismo `js/simulation-core.js` ahora implementa criterios de fusión, generación de munición, intersección y avance de proyectiles (rebotes e impactos), además de PRNG y circuitos de V43.
- `js/game.js` delega estos cálculos manteniendo las firmas del arcade. Los efectos visuales siguen siendo un observador sin autoridad.
- `node --test tests/simulation-stage2.test.mjs` compara resultados con implementaciones congeladas de V43, incluidas secuencias de RNG y trayectorias prolongadas, para detectar cambios de física o probabilidad.
- **No hay motor de partida completo en Node.js.** Faltan transición integral de impactos/fusiones/puntuación, game-over y replay autoritativo. El servidor no concede XP, ni posiciones ni premios.

---

# FrutiDry V43 · Deterministic core extraction, stage 1 (no scoring authority)

- Shared classic-script `js/simulation-core.js` runs identically under file://, HTTP and Node.js, without DOM, Canvas or external packages.
- Migrates the existing RNG and circuit route/slot geometry into ONE implementation consumed by the browser and testable by the backend.
- `node --test tests/simulation-core.test.mjs` checks exact V42 compatibility. GitHub Actions will run it alongside the existing 20+ replay scenarios.
- **Not a headless full-game verifier:** projectiles, merges, scoring and game-over still live in `js/game.js`.
- **No XP, leaderboard, cash tournaments, payments or live API are enabled.** Do not use this module to certify a player's score.
- Next task: move update/impact/score state transitions into a headless deterministic reducer and compare full traces before enabling atomic XP awards.

---

# FrutiDry V42 · Ingesta de partidas con verificación pendiente (NO XP)

- Nuevo contrato de sesiones creado por el servidor y recepción única de diagnósticos ligados a identidad, semilla, versión de reglas y resolución lógica. Se rechazan duplicados, informes fuera de plazo y campos de recompensa suministrados por el navegador.
- La recepción **no valida la simulación ni concede XP**: los informes quedan `PENDING_INDEPENDENT_VERIFICATION`. No hay conexión a la API de producción (`runIntake` se omite intencionalmente), ni rankings, torneos o pagos reales.
- Tests `node --test tests/run-intake.test.mjs`. Instrucciones y limitaciones en `docs/RUN_INTAKE_V42.md`.

---

# FrutiDry V41 · Acceso web opcional y perfil de cuenta

- Nueva pestaña **CUENTA** con acceso por correo/contraseña y perfil permanente leído desde la API V40. La cuenta se mantiene **deshabilitada por defecto** hasta configurar Firebase, MongoDB y Render.
- Solo cuando el equipo habilite `js/account-config.js`, la página carga bajo demanda el SDK oficial de Firebase Authentication. El registro público dispone de un segundo interruptor independiente, apagado por defecto.
- No se concede XP, no se acepta nivel local ni se habilitan inscripciones, clasificaciones con premio o PayPal.
- QA del contrato: `node --test tests/account-client.test.mjs`. Instrucciones completas: `docs/ACCOUNTS_WEB_V41.md`.

---

# FrutiDry V40 · Cuenta permanente y API inicial (sin torneos activos)

- Se incorpora un backend REST **separado** en `server/` preparado para Firebase Authentication + MongoDB Atlas, sin endpoints que acepten XP, puntuaciones o premios enviados desde el navegador.
- `GET /api/v1/me` devuelve un perfil propio derivado de identidad verificada por Firebase Admin; las cuentas nacen con XP 0/nivel 1. El acceso al torneo con dinero permanece cerrado.
- La progresión matemática está marcada como **provisional**; no existe aún concesión de XP ni login de interfaz conectado.
- Pruebas de API con identidad y persistencia simuladas: `node --test tests/account-api.test.mjs`. El servidor externo no está desplegado.
- Instrucciones de configuración, contrato de API y barreras en `docs/ACCOUNTS_AND_PROGRESSION.md`.

---

# FrutiDry — V37 · Torneos semanales (fase preparatoria)

**Base oficial:** `Atanatus/SHOTERBERKAN`, `main` V35 (`1795c83a4656408065d7670754f507e1dc5d68fc`).

- Se mantiene el mismo render y el mismo estado de simulación. No se almacenan texturas extra ni se introducen dependencias de producción.
- F3 añade el tiempo **CPU de JavaScript por dibujo** para cinco etapas: escenario, circuitos, núcleo/apuntado, piezas/FX e interfaz. Las medias se actualizan cada segundo y se adjuntan a `perf.sample.renderStagesMs` en los diagnósticos. El valor no es una medición del trabajo de GPU ni equivale a FPS reales.
- El instrumentado queda deshabilitado sin F3, salvo cinco comprobaciones booleanas por dibujo. Desactivar/activar F3 reinicia los acumuladores.
- Prueba de regresión: con estado fijo, el Canvas produce exactamente la misma imagen con el perfil activado y desactivado.
- Auditoría previa en Chromium de prueba a DPR 1: ~0,32 ms de CPU por dibujo en escenas iniciales a 390×844 y 1366×768. Ese valor **no extrapola a otras GPUs ni dispositivos** y no justifica una caché adicional de gran tamaño.

---

# FrutiDry — V35 · Auditoría de colisiones y rendimiento

**Base oficial:** `Atanatus/SHOTERBERKAN`, `main` V34 (`6ffbeef34ccf9740f594f471cd7bce1c94840ddb`).

- Optimización segura del cálculo de impactos: antes de comprobar las nueve figuras, se descartan segmentos completamente fuera de la banda vertical que contiene los hitboxes de los carriles.
- La banda incorpora los desplazamientos de todos los carriles, la amplitud máxima de las ondas y el radio de impacto, con margen numérico. Las intersecciones y el orden de selección de objetivos **no se modifican**.
- La misma función sirve al disparo real y al predictor; su comportamiento se compara contra una copia del algoritmo V34 en **18.000 segmentos deterministas**, con dos y tres carriles, rebotes y objetivos BERKAN.
- Se conservan las reglas V20, el esquema de replay, guardados, efectos y sprites. No se introducen dependencias de producción.

**Alcance:** esta optimización reduce trabajo geométrico fuera de la zona de objetivos; la ganancia real de FPS depende del dispositivo, DPR, escena y carga gráfica. La prueba de equivalencia cubre escenarios sintéticos, no una demostración formal de todos los estados posibles.

---

# FrutiDry — V34 · Resiliencia de recursos gráficos

**Fuente:** `Atanatus/SHOTERBERKAN` · `main` V33 (`d5f33b53`).

- Nuevo `js/assets.js`: registro de carga de sprites, imágenes del Códice, fondos y botones. Los fallos gráficos aparecen en un aviso no bloqueante y en el panel F3.
- Las gemas y objetos conservan sus dibujos Canvas de respaldo. Las reliquias ausentes muestran un símbolo alternativo y los fondos/botones utilizan degradados CSS. No se altera la simulación.
- Un detector de arranque avisa si faltan archivos JavaScript esenciales. En ese caso permite recargar, pero no ofrece continuar una partida cuyo motor no ha arrancado.
- Se añaden pruebas de navegador para recursos ausentes y fallos de scripts esenciales, además de las existentes de reproducción, persistencia y responsive.
- Sin dependencias nuevas de producción, sin migraciones de `localStorage` y sin modificaciones de las reglas (rulesVersion 20).

**Límite:** una imagen corrupta puede requerir limpiar la caché del navegador o volver a publicar el recurso; no se repara automáticamente. El navegador puede fallar por causas anteriores a la carga de HTML y entonces no es posible mostrar el aviso.

---

# FrutiDry — V33 · Runtime Fault Boundary

**Base exacta:** `Atanatus/SHOTERBERKAN` · `main` V32 (`cd0b3262`).

- `js/fault.js` implementa una barrera frente a errores inesperados de simulación, render y eventos globales (incluidas promesas rechazadas). Detiene el juego: nunca intenta continuar con un estado parcialmente modificado.
- Interfaz modal accesible que ofrece **informe JSON local**, **nuevo ritual** y **recarga manual**. El informe incluye fase, mensaje, traza limitada y métricas mínimas; **no se envía a terceros**. Los informes no son una prueba antitrampas.
- El bucle principal siempre vuelve a programar `requestAnimationFrame`, aun si se produce una excepción. La pausa técnica impide más ticks, evita nuevos disparos y detiene la música hasta una acción explícita del jugador.
- El reinicio no borra progreso, récords ni claves de almacenamiento. Si el fallo se produce durante una reproducción, el diagnóstico queda marcado como incompleto.
- Nuevas pruebas para fallos de render, simulación, promesas rechazadas y recuperación posterior. Sin dependencias de producción y sin cambios en la física ni en las reglas.

**Límite:** no se pueden recuperar automáticamente errores que impiden cargar por completo el HTML/JS, ni fallos graves del navegador. En esos casos está disponible la recarga manual.

---

# FrutiDry — V32 · Temporal Stability

**Base oficial:** `Atanatus/SHOTERBERKAN`, `main` V31 (`124ab04b`).

- Simulación fija a **60 Hz**, separada del render. Se conservan las reglas y el formato del diagnóstico V24–V31 (`schema 2`, `rulesVersion 20`).
- Máximo de **5 pasos** por frame para recuperarse de bajadas moderadas de FPS. El tiempo adicional se descarta de forma explícita, sin avanzar el juego de golpe.
- Una interrupción superior a **250 ms** se considera suspensión: el reloj se resincroniza sin simular el tiempo ausente. Al abrir/cerrar el Códice, ocultar/mostrar la pestaña, perder el foco o cambiar la calidad de render también se reinicia el reloj temporal.
- Los efectos visuales utilizan el tiempo acotado de la simulación, evitando saltos bruscos tras recuperar la pestaña. El panel F3 muestra el número de pausas largas y el tiempo descartado acumulado.
- Se añaden cuatro pruebas de reloj: frecuencia fija, límite de recuperación, suspensión/visibilidad y equivalencia del estado a 30/60 Hz de render, además de comprobaciones por resolución en Chromium.
- **Trade-off deliberado:** en dispositivos incapaces de mantener 60 ticks/s, el tiempo de partida puede progresar más despacio que el tiempo real; nunca se acelera súbitamente para compensar. Esto conserva el comportamiento determinista por pasos y evita castigar al jugador por la suspensión del navegador.
- GitHub Actions sigue ejecutando `tests/browser_qa.py` y `tests/validate_repo.py`. No se añaden dependencias al juego publicado.

---

# FrutiDry — V31 · Stress & Bounded Diagnostics

**Base:** `Atanatus/SHOTERBERKAN`, `main` V30 (`e5ac0dc7`).

- Efectos cosméticos acotados: 240 partículas, 24 ondas, 12 estrellas, 24 textos simultáneos. Se eliminan primero los más antiguos; no cambia la simulación física.
- Registro de diagnóstico acotado: 25.000 eventos de entrada, 15.000 acciones y 216.000 pasos (una hora simulada). La partida puede seguir sin límite; únicamente el registro de QA se detiene.
- El diagnóstico avisa de que está incompleto y `ReplayLab.validate` rechaza reproducirlo. Los diagnósticos V24–V30 completos siguen aceptándose.
- Pruebas de estrés de límites y recuperación de contadores en `tests/replay-smoke.html`, ejecutadas también por GitHub Actions.

**Importante:** No es un sistema antitrampas. Conserva las claves de progreso y los formatos de copia anteriores. La limitación afecta exclusivamente a los logs de QA y a los efectos visuales, no a las puntuaciones o reglas V20.

---

# FrutiDry — V30 · Almacenamiento recuperable

**Fuente oficial:** https://github.com/Atanatus/SHOTERBERKAN (rama `main`).

La V30 no altera el motor, la puntuación, los sprites ni el formato de los JSON.
La importación de progreso ahora escribe un **diario de recuperación previo**
(`frutidry_import_journal_v1`) con las nueve claves de almacenamiento heredadas.
Si el navegador se cierra durante una importación, el siguiente arranque
**revierte la importación incompleta** antes de leer el progreso.

Una importación completada y confirmada elimina el diario. Si el navegador
bloquea o agota `localStorage`, se muestra una advertencia persistente y la
importación se cancela sin modificar el estado del juego. Si la reversión
falla también, el diario permanece para intentar recuperarlo al recargar.
El aviso no significa que se guarden partidas en la nube: las copias JSON
externas siguen siendo necesarias. El almacenamiento local puede perderse
por limpieza de datos o cambio de origen del sitio.

La persistencia se verifica en GitHub Actions (`tests/browser_qa.py`);
la alternativa `--injected` usa almacenamiento simulado y **no** prueba
persistencia entre recargas.

---

# FrutiDry — Astral Sanctuary · V28

## Identidad oficial · V28

**FrutiDry** es el nombre oficial del videojuego desde V28. **Astral Sanctuary** permanece como universo artístico y **BERKAN** como el núcleo ceremonial, el Códice y sus reliquias. El nombre anterior **KŌSEN · BERKAN** se conserva únicamente como referencia histórica.

**Compatibilidad:** este cambio es de identidad, no de reglas. Se mantienen las claves `kosen_*` de `localStorage`, los formatos JSON `kosen-berkan-progress` y `kosen-berkan-run-diagnostic`, los números de esquema y la versión de reglas 20. No se migran ni se borran partidas guardadas; únicamente los nombres de los nuevos archivos exportados pasan a `frutidry-*.json`.

El repositorio sigue siendo `Atanatus/SHOTERBERKAN` para no romper su URL, historial o GitHub Pages. No cambiar la URL del repositorio sin planificar redirecciones y validaciones. El nombre comercial está decidido para el proyecto, **pero la disponibilidad registral no está certificada**.

**CI V28:** GitHub Actions utiliza `ubuntu-24.04` en lugar de la imagen `ubuntu-latest` que se actualizó a Ubuntu 26.04 e impidió instalar el Chromium de Playwright 1.56.0. El resultado de esta corrección debe confirmarse en GitHub tras publicarla.

## Inicio (Windows)

Extrae el ZIP completo y abre `index.html` con Chrome o Edge. La carpeta `assets/`, `css/` y `js/` debe permanecer junto al HTML. No necesita frameworks ni conexión.

Si quieres publicar o depurar el proyecto con una URL HTTP, desde PowerShell usa `python -m http.server 8080` y abre http://localhost:8080. **Un cambio de `file://` a HTTP crea otro origen**: utiliza las funciones de exportación/importación si necesitas trasladar el progreso.

## V24 — Persistencia y reproducción comprobable

En el Códice, el apartado **Continuidad del Santuario** permite:

1. **Exportar copia de progreso** a un JSON portable: récord V20+, nombre del récord, total de núcleos, reliquias, récord legado y ajustes visuales/musicales.
2. **Importar copia JSON**: validación estricta de tipo, versión, rango y tamaño máximo 64 KB. Fusiona récords y totales mediante máximo, une reliquias, y aplica ajustes incluidos. No borra progreso avanzado.
3. **Exportar diagnóstico de partida**: incluye semilla, versión de reglas, lista de entradas y ticks, tablero, estado final y resolución. Cuando F3 está activo, captura la última muestra de rendimiento.
4. **Laboratorio con semilla fija**: reconstruye la misma posición inicial y secuencia PRNG para pruebas en el mismo entorno. **No suma récord, núcleos ni reliquias**. Pulsa NUEVO RITUAL para volver al juego normal.

El diagnóstico V24 (schema 2) guarda las entradas por paso de simulación y un checkpoint semántico. Se puede reproducir desde el Códice con **▶ REPRODUCIR DIAGNÓSTICO**. Exige el mismo tamaño lógico de tablero y las mismas reglas (V24/rules 20); comprueba puntuación, tablero, munición y estado PRNG al llegar al paso final. No valida resultados frente a una fuente independiente. El hash SHA-256 (cuando existe `crypto.subtle`) solo detecta modificaciones accidentales; **no es antitrampas**. Los datos quedan locales salvo descarga voluntaria.

## Arquitectura

Sin dependencias: scripts clásicos `defer` ordenados `config`, `audio`, `data`, `game`, `render`, `app`, `continuity`, `replay`. Se preserva apertura por `file://`. Los sprites se cargan de carpetas independientes.

## Pruebas

- `node --check js/*.js` (se ejecuta archivo por archivo en Windows).
- Chromium: escritorio, móvil, Códice, disparos, modo laboratorio, exportación, importación con datos correctos e inválidos.
- El archivo `assets/manifest.json` enumera los activos gráficos y sus SHA-256 originales, sin cambios respecto a V22.

**Importante:** No se incluye restauración automática de la partida en curso; las copias JSON son únicamente del progreso permanente y las preferencias. La exportación de diagnóstico es para QA y no prueba que un récord sea legítimo.

## Repositorio oficial

El código oficial de FrutiDry vive en **https://github.com/Atanatus/SHOTERBERKAN**, rama `main`. No reinicialices un nuevo Git ni uses ZIP antiguos como fuente. Trabaja sobre un clon actualizado del repositorio. Los parches de QA deben aplicarse únicamente sobre la revisión para la que se generaron. No subas archivos locales de progreso ni diagnósticos.

El repositorio es público. Conviene revisar la titularidad y los derechos de explotación de las ilustraciones y del nombre antes de promocionarlo comercialmente.

## Limitaciones de reproducción

* QA local, no antitrampas, ni certificación de puntuaciones.
* Las dimensiones lógicas del canvas deben coincidir, incluidas las dimensiones CSS tras ajustar HUD. El DPR puede variar sin modificar las físicas.
* Los ficheros V23 de diagnóstico (schema 1) no son reproducibles; siguen siendo exportables como referencia histórica.
* La misma implementación de JS y física es imprescindible; no hay estabilidad garantizada entre futuras reglas o motores.
* En caso de divergencia, el motor detiene la reproducción y señala el fallo; no altera los datos persistidos.

## V25 · Endurecimiento del laboratorio de reproducción

- El laboratorio detecta un `gameOver` anterior al checkpoint y termina con un diagnóstico explícito en lugar de quedar esperando indefinidamente.
- El permiso temporal para aplicar acciones del replay se desactiva incluso si una acción lanza una excepción.
- Si un replay termina en la pantalla de fin de partida, muestra allí el resultado del verificador, evitando que el Códice quede oculto debajo.
- Prueba autocontenida del motor: abre `tests/replay-smoke.html` y comprueba que aparecen tres resultados correctos.

Se mantienen las reglas V20 y el formato de diagnóstico V24. Esta corrección **no convierte el registro local en una prueba antitrampas**.

## V26 · Estabilidad y control de calidad

- Corregido el inicio de una segunda partida con entradas de puntería iguales a las de la anterior: el registrador reinicia su línea base con cada ritual. No cambia la física ni las reglas V20.
- Si se modifica el tamaño lógico del tablero durante una reproducción, se detiene y se explica la incompatibilidad. Se conserva el formato de diagnóstico V24 (schema 2).
- Las cinco pruebas del laboratorio se pueden ejecutar abriendo `tests/replay-smoke.html` en un navegador local.
- `python tests/validate_repo.py` comprueba los 59 WebP contra su manifiesto SHA-256, referencias de HTML y sintaxis de los JS con Node disponible en PATH. No utiliza dependencias de Python de terceros.
- `.github/workflows/qa.yml` ejecuta las comprobaciones estáticas en pushes y pull requests; no demuestra por sí solo que el juego sea jugable en todas las plataformas.

## V27 · QA de navegador y copias de progreso

- **CI con navegador real:** el workflow ejecuta el laboratorio de cinco pruebas y comprobaciones jugables en 320×640, 390×844, 844×390 y 1366×768. Añade el control de persistencia real de `localStorage` después de recargar en Chromium.
- **Aislamiento:** el navegador se ejecuta contra un servidor HTTP local de prueba, sin enviar datos del jugador a servicios externos.
- **Importación:** si el récord importado empata con el local, el nombre del récord local se conserva. Un récord estrictamente superior sí trae su titular. Se mantiene el formato `kosen-berkan-progress` schema 1.
- **Mantenimiento:** eliminada una llamada duplicada e inocua a `routeCache.clear()` al cambiar de hito.
- **Compatibilidad:** sin cambios de física, puntuación, probabilidades, recompensas ni del formato de replay V24/rules 20. Los sprites y sus firmas SHA-256 son idénticos a la V26.

### Ejecución local de QA

```bash
python tests/validate_repo.py
python -m pip install 'playwright==1.56.0'  # solo para pruebas
python -m playwright install chromium
python tests/browser_qa.py
```

En un entorno con política que impide abrir `localhost` o `file://` desde Chromium, se puede ejecutar `python tests/browser_qa.py --injected`. Este modo sustituye `localStorage` por memoria temporal y, por tanto, **no certifica persistencia entre recargas**. La CI de GitHub utiliza navegación HTTP real y falla si no supera esas pruebas.

**Operativa Git:** valida el resultado de GitHub Actions después de publicar; un parche preparado no equivale a un commit remoto.

## V28 · Cambio de identidad y corrección de CI

- Identidad visible, título del navegador, metadatos y nombres de descarga: **FrutiDry**.
- Arte, mecánicas, núcleo BERKAN, 12 reliquias y claves de datos históricos: intactos.
- Pruebas de marca añadidas a validación estática y QA de navegador.
- Runner GitHub Actions fijado a Ubuntu 24.04 para compatibilidad con Chromium de Playwright 1.56.0.

## V29 · Checkpoints periódicos de reproducción

- Cada **600 pasos simulados** (10 segundos nominales de juego) se captura un estado semántico que incluye tablero, munición, RNG, puntuación y estado del proyectil. No incluye partículas ni audio.
- La exportación diagnóstica añade el campo opcional `checkpoints` al **schema 2 existente**. Los diagnósticos V24–V28 sin ese campo siguen reproduciéndose igual. No se modifican las reglas V20 ni las claves `localStorage`.
- El verificador compara cada checkpoint en orden y detiene la reproducción en el **primer paso divergente conocido**, sin esperar a terminar toda la partida. Este resultado **no es una prueba antitrampas**.
- Máximo de **360 checkpoints** por partida en el registro local (una hora de simulación); no altera los límites de importación existentes.
- El laboratorio incorpora pruebas de detección de una divergencia intermedia, compatibilidad histórica y rechazo de checkpoints desordenados.


## V37 · Torneos y monetización (fase preparatoria)

Se añade una sección **TORNEO** con calendario próximo (viernes-domingo-lunes, `Europe/Madrid`), podio vacío y requisitos previstos. **No existe todavía torneo activo ni premio anunciado**: no hay cuentas, niveles permanentes, ranking online o pagos. El reloj solo muestra fechas orientativas; no determina la apertura de competiciones.

El diseño técnico, la separación servidor/cliente, los riesgos legales y la estrategia de anuncios display están documentados en [`docs/TOURNAMENTS_AND_ADS.md`](docs/TOURNAMENTS_AND_ADS.md). No se ha añadido ninguna solicitud publicitaria ni cambiado el motor de juego. Pruebas puras de horario y reglas: `node --test tests/tournament.test.mjs`.


## V38 · PayPal Payouts (contrato seguro, sin dinero activo)

- Medio de entrega propuesto: **PayPal Payouts**, tres pagos individuales en EUR, con destinatario por email validado. **No se ha solicitado acceso al servicio ni se envían fondos.**
- `server/paypal-payouts.mjs` solo produce un borrador inerte para uso futuro en un backend autenticado; no contiene red, credenciales ni botón de pago. Valida aprobación, fondo, usuarios 11+, identidad, residencia, puesto y revisión de las tres posiciones.
- `sender_batch_id` estable por edición y `sender_item_id` estable por premiado. Huella privada de la instantánea del pago para impedir reenvíos con datos distintos; requerirá un registro duradero y único en MongoDB antes de activar la API.
- Cada premio se concilia por estado propio: `SUCCESS` significa abonado; `PENDING`, `UNCLAIMED` y `ONHOLD` no significan cobrado; errores o reversos requieren revisión. Un lote `SUCCESS` nunca autoriza por sí solo marcar los tres premios como pagados.
- La interfaz indica que PayPal es un método previsto, no operativo; no solicita correos ni cambia el juego. **La elegibilidad y los flags de autorización solo podrán provenir de fuentes verificadas en servidor**, nunca del navegador.
- Documentación: [`docs/PAYPAL_PAYOUTS.md`](docs/PAYPAL_PAYOUTS.md). Pruebas: `node --test tests/paypal-payouts.test.mjs`.

## V39 · Operativa semanal de torneos (borradores internos)

- `server/tournament-operations.mjs` crea calendarios verificados para viernes-domingo-lunes en `Europe/Madrid`, incluidos cambios DST, y valida borradores **siempre inactivos**. Los importes opcionales son solo internos, calculados en céntimos; nunca se anuncian en las previsualizaciones públicas.
- `scripts/tournament-ops.mjs` genera propuestas locales, cinco mensajes promocionales (jueves a lunes), previsualización sin datos sensibles y checklist de preparación. Ninguna función abre inscripciones, admite puntuaciones, publica anuncios ni envía dinero.
- `ops/drafts` y `ops/previews` quedan fuera de Git. No servir esas carpetas en HTTP; no almacenar aquí credenciales ni datos de premiados.
- Documentos: [`docs/REUNION_SOCIOS_TORNEOS_2026-11-22.md`](docs/REUNION_SOCIOS_TORNEOS_2026-11-22.md) y [`docs/OPERATIVA_TORNEOS_DESARROLLADORES.md`](docs/OPERATIVA_TORNEOS_DESARROLLADORES.md).
- Pruebas del dominio: `node --test tests/tournament-operations.test.mjs`, añadidas a GitHub Actions.
- Estado: **preparación interna solamente**. Para abrir torneos reales siguen faltando cuentas, backend, partidas servidor-autoritativas, registro legal, validación antifraude, autorizaciones y conciliación de PayPal.


## V46 · Diagnósticos completos reproducidos en Node (sin premios)

- `server/headless-replay.mjs`: ejecutor headless que reutiliza el juego V45 trusted, sin render, para reconstruir disparos, puntuación, fusiones y game over; no hay rutas online ni concesión de XP.
- `tests/headless-replay.test.mjs` y dos capturas congeladas de Chromium comprueban 151 y 820 pasos, incluida divergencia temprana de checkpoints y falsificaciones de puntuación/inputs.
- `scripts/verify-diagnostic.mjs` permite inspección local especificando la semilla esperada, nunca tomada como verdad de los metadatos del cliente.
- **Seguridad:** un replay consistente puede automatizarse y no es prueba antifraude; `node:vm` no es frontera de aislamiento. El viewport del modo competitivo, el verificador aislado, la integración operativa, el ledger idempotente de XP y el cumplimiento legal siguen pendientes.
- Procedimiento, comandos y barreras: `docs/HEADLESS_REPLAY_V46.md`.

## V47 · Verificador de replay en proceso aislado (aún sin XP)

- Nuevo `server/isolated-verifier.mjs` y proceso hijo desechable `server/isolated-verifier-worker.mjs`: cola y concurrencia acotadas, timeout, heap de 128 MiB y respuesta de error cerrada. No son un sandbox completo ni una API pública.
- Nuevo `server/run-verification.mjs`: revisa una sesión con semilla y JSON persistidos, comprueba SHA-256, emplea bloqueo atómico con vencimiento (`server/run-mongo.mjs`) y concilia el replay sin aceptar nivel, ranking o recompensas del navegador.
- Todos los resultados y reintentos conservan `xpGranted: 0`, `ranked: false` y `eligibleForPrizes: false`. Un replay consistente sigue sin demostrar que el jugador sea humano.
- 13 pruebas de aislamiento, colas, timeout, fraude de respuesta, CAS, recuperación de leases y almacenamiento; GitHub Actions ejecutará esas pruebas además de las regresiones existentes.
- Documentación de contrato, riesgos restantes y ejemplo de uso interno: [`docs/ISOLATED_VERIFICATION_V47.md`](docs/ISOLATED_VERIFICATION_V47.md).

## V48 · Tablero competitivo lógico, SOLO previsualización

- `?competitivePreview=1` activa un ensayo visible de tablero **390 × 844 lógico** con letterboxing en móvil y escritorio; esta opción de URL no autoriza una partida oficial. La partida normal sigue usando dimensiones físicas dinámicas.
- `js/competitive-viewport.js` contiene escalado y transformación de eventos de puntero, reutilizable por navegador y Node.js; `css/competitive-viewport.css` aplica únicamente la presentación del modo de prueba.
- El Canvas se escala visualmente, no se alteran las reglas físicas: el replay conserva `rulesVersion:20`, `gameVersion:24` y `RUN_LOGICAL_VIEWPORT` del servidor.
- **No se activa:** sesión competitiva, envío de diagnósticos, premios, XP, clasificación ni publicidad. La preview fuerza modo laboratorio (`practiceSeed`) y no altera récords ni reliquias locales. El backend debe emitir y verificar la sesión, nunca confiar en `?competitivePreview=1`.
- QA: `node --test tests/competitive-viewport.test.mjs`; en CI, `python tests/viewport-browser-qa.py`, cuatro resoluciones y modo normal.
- Manual: [`docs/COMPETITIVE_VIEWPORT_V48.md`](docs/COMPETITIVE_VIEWPORT_V48.md).

## V49 · Verificación de correo para la beta cerrada (sin Render activo)

- `js/account-verification.js`: flujo aislado y probado de envío, límite UX de 60 segundos entre solicitudes y recarga del usuario/token al confirmar. El SDK oficial se carga solo al habilitar cuentas. No se envía ningún correo mientras `enabled:false`.
- `index.html`, `js/account-ui.js`, `css/account.css`: aviso para cuentas autenticadas con correo no confirmado, envío manual y comprobación. El perfil puede consultarse antes de verificar el correo; no se confunde autenticación con email confirmado.
- `server/account-http.mjs`: exige el claim `email_verified === true` de un ID token validado por Firebase Admin para iniciar o entregar partidas (`POST /api/v1/runs` y `POST /api/v1/runs/:id/diagnostic`). Esto no abre rutas desactivadas ni concede XP. `GET /api/v1/me` solo requiere token válido, como antes.
- Pruebas sin credenciales: `tests/account-email-verification.test.mjs` y `tests/account-verification-browser-qa.py`. Se mantienen `js/account-config.js` y la conexión a Render desactivados.
- Riesgos/activación: `docs/EMAIL_VERIFICATION_V49.md`. La protección frente a automatización, las invitaciones fuertes y los requisitos legales siguen pendientes.
