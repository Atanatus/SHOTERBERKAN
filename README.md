# KŌSEN · BERKAN — V26 · Stability Lab

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

El código oficial vive en **https://github.com/Atanatus/SHOTERBERKAN**, rama `main`. No reinicialices un nuevo Git ni uses ZIP antiguos como fuente. Trabaja sobre un clon actualizado del repositorio. Los parches de QA deben aplicarse únicamente sobre la revisión para la que se generaron. No subas archivos locales de progreso ni diagnósticos.

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
