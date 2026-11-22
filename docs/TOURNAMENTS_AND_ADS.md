# FrutiDry — Torneos semanales y publicidad no intrusiva (V37)

**Estado:** diseño aprobado para implementación por fases; **NO hay torneo ni premio en efectivo activo**. Este documento no es asesoramiento jurídico.

## Contrato temporal

- Reloj del servidor, zona `Europe/Madrid` (IANA, con cambios de horario de verano).
- Abre viernes a las 00:00:00 locales; cierra al iniciar el lunes, 00:00:00 **exclusivo**; lunes destinado a revisión y pago.
- Para cada edición el organizador publica previamente `startsAt`, `closesAt`, `prizePoolCents`, plazas premiadas, bases, semilla/reglas y límites de intentos.
- Estados persistentes: `DRAFT -> ANNOUNCED -> OPEN -> CLOSED -> REVIEW -> PAID` o `CANCELLED`. No automatizar la apertura sin `canOpenCashEdition()`.
- Si se detecta una incidencia, bloquear el reparto afectado, registrar motivo y comunicar el plazo de resolución; no afirmar que un pago se ha realizado hasta confirmarlo por el proveedor.

## Acceso y progresión

- **Nivel de cuenta 11+**. El HUD actual informa del nivel de gemas/hito; **no existe aún nivel de cuenta persistente**. Diseñar una progresión propia, servidor-autoritativa. No derivar elegibilidad de un número enviado por JS.
- Propuesta de lanzamiento: España, mayores de 18 años, acceso gratuito. Edad, territorio y identidad verificados por procedimientos proporcionados por proveedores y asesoría jurídica; no almacenar documentos en la web estática ni en los logs.
- Nunca exigir cuota, compra, depósito, visualización o clic de anuncio para participar o mejorar oportunidades.
- Si FrutiDry sigue teniendo elementos aleatorios que afectan al resultado, revisar su clasificación legal antes de poner premios reales.

## Clasificación

- Tabla semanal: posición, alias público, mejor puntuación **verificada**, fecha de verificación, estado del torneo. Vista `top 100` y `mi posición`; historial de ediciones.
- Un resultado máximo por cuenta; empate: menor `verifiedAt` de la mejor partida y, si persiste, identificador de cuenta determinista. Congelar tabla al cerrar; permitir revisión y reclamaciones.
- Propuesta de reparto, **configurable antes de abrir**: 50 % primero, 30 % segundo, 20 % tercero; no se publican importes hasta confirmar presupuesto. `allocatePrizeCents` conserva cada céntimo.
- Premios solo para tres ganadores válidos. Casos con menos de tres jugadores, descalificación y apelaciones deben regularse en las bases antes del lanzamiento.

## Autoridad del servidor

**La V36 es un arcade local; sus récords, semillas, hashes y diagnósticos NO certifican resultados económicos.**

Tecnología objetivo: frontend estático GitHub Pages; API REST en Node.js Vanilla desplegada en Render; MongoDB Atlas para persistencia. El controlador MongoDB oficial sería la única dependencia externa justificada del backend. No usar `localStorage` como cuenta, firma ni ranking oficial.

Endpoints previstos (sin implementar en V37):

- `GET /api/v1/tournaments/current` (solo ediciones publicadas)
- `GET /api/v1/tournaments/{id}/leaderboard?cursor=...`
- `GET /api/v1/me/eligibility` (autenticación obligatoria)
- `POST /api/v1/tournaments/{id}/runs` (autorización, semilla CSPRNG, duración/intentos, `runId`)
- `POST /api/v1/tournaments/{id}/runs/{runId}/submit` (secuencia completa de acciones, límites de tamaño/rate limit)
- `GET /api/v1/tournaments/{id}/my-rank`
- operaciones administrativas separadas, auditadas, con MFA, idempotencia de desembolsos y confirmación de pago.

El backend debe verificar una partida **recalculando el estado y la puntuación en un motor determinista de servidor**, con reglas/semillas registradas. El cliente solo informa entradas; no decide sus puntos. Las versiones del motor deben congelarse para cada edición. Un replay JSON guardado en el navegador no basta, ni siquiera con SHA-256, porque el usuario puede regenerarlo. Implementar control de intentos, tiempo máximo, abuso de múltiples cuentas y revisión manual de los tres premiados. Recomendación: modalidad competitiva de reglas iguales, sin objetos de compra ni potenciadores pagados.

Persistencia recomendada: `accounts`, `accountProgress`, `tournaments`, `runs`, `leaderboardBest`, `payouts`, `auditEvents`. Índices únicos para `(tournamentId,userId)`, `runId`, `(tournamentId,position)` una vez finalizado, e idempotencia de pagos. Evitar manipulación por carreras de actualización (`$max` atómico o transacciones según modelo).

## AdSense / publicidad de display

- Solo banners integrados **fuera de Canvas**. Escritorio: rail lateral diferenciado con margen claro; móvil: en Códice, tabla y zonas posteriores a la partida, **no junto al botón de disparar ni a controles táctiles**.
- Sin interstitial, vídeo obligatorio, superposición, refresco forzado ni cambios de tamaño mientras se apunta. No dar puntos/dinero por anuncios, ni sugerir que un clic financiará al ganador.
- No cargar scripts publicitarios sin ID y dominio aprobados, revisión de política editorial, configuración de privacidad ni CMP certificada exigible para EEE; la V37 no hace solicitudes de anuncios ni tracking.
- Separar contabilidad: coste operativo + impuestos/comisiones + reserva + premio **financiado y publicado con antelación**. AdSense puede rechazar un sitio, limitar anuncios o pagar menos de lo estimado. No ofrecer un premio dependiente del ingreso no cobrado de esa misma semana.
- Antes de activar revisar compatibilidad de contenido con las políticas de Google y regulación española; además GDPR, cookies y bases legales con asesor profesional.

## Criterios de aceptación por fase

**V37 (este parche):** calendario viernes-domingo-lunes correcto con DST, sección de torneo claramente inactiva, clasificación vacía sin datos ficticios, apertura/cierre de modal sin perder simulación, pruebas puras y navegador, cambios sin alterar físicas ni guardado.

**Siguiente fase:** cuentas y niveles permanentes (sin dinero); API y validación de partidas de torneo; ranking real sin premios; pagos solo después de revisión jurídica, antifraude y pruebas extremo a extremo; anuncios cuando cuenta AdSense/CMP y aprobación del sitio estén disponibles.
