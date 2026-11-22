# KŌSEN · BERKAN — V24 · Deterministic Engine

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

## GitHub: primera subida

Repositorio de destino: **https://github.com/Atanatus/SHOTERBERKAN**. Comprobado el 22 de noviembre de 2026: existe, está vacío y es **público**. Recomiendo hacerlo privado antes del primer `push` si todavía no están cerrados los derechos de explotación. Desde PowerShell, situado en esta carpeta:

```powershell
git init -b main
git add .
git commit -m "feat: Kosen Berkan V24 deterministic replay and QA"
git remote add origin https://github.com/Atanatus/SHOTERBERKAN.git
git push -u origin main
```

No hace falta modificar la URL salvo que cambies el repositorio. No subas archivos de trabajo ni copias privadas de progreso. Comprueba la titularidad y derechos sobre las ilustraciones antes de publicar el repositorio.

## Limitaciones de reproducción

* QA local, no antitrampas, ni certificación de puntuaciones.
* Las dimensiones lógicas del canvas deben coincidir, incluidas las dimensiones CSS tras ajustar HUD. El DPR puede variar sin modificar las físicas.
* Los ficheros V23 de diagnóstico (schema 1) no son reproducibles; siguen siendo exportables como referencia histórica.
* La misma implementación de JS y física es imprescindible; no hay estabilidad garantizada entre futuras reglas o motores.
* En caso de divergencia, el motor detiene la reproducción y señala el fallo; no altera los datos persistidos.
