# FrutiDry · Manual de desarrollo y operaciones semanales — V39

**Estado:** herramienta de planificación **interna**, no backend de competición. Referencia: `main` V38 (`ea015999c77f3d5f81f550e976bac8edf17f6ea7`). El producto actual NO permite abrir torneos reales, aceptar resultados verificados ni enviar premios.

## 1. Separar tres sistemas

1. **Juego público (GitHub Pages):** visualización y gameplay local. No autoriza puntuaciones ni pagos.
2. **API privada (pendiente, Node.js Vanilla / Render / MongoDB Atlas):** cuentas, niveles, sesiones de partida, clasificación, calendario oficial, controles de administración y auditoría.
3. **Herramienta local de operaciones (este repositorio, V39):** prepara **borradores** de ediciones, cinco textos promocionales y checklist. No opera una API ni modifica el servidor.

**No publicar jamás `/ops/drafts` ni `/ops/previews` como recursos web**, ni almacenar emails PayPal, secretos, documentos de identidad o identificadores internos en el frontend. Están excluidos de Git por `.gitignore`, pero un servidor HTTP mal configurado podría exponer archivos locales: no sirvas el entorno de operaciones.

## 2. Calendario y reglas

- `Europe/Madrid` como reloj oficial; aperturas viernes 00:00; cierre al comienzo del lunes 00:00 **exclusivo**, que incluye domingo hasta las 23:59:59. El lunes se revisa y paga **solo si** los tres premios están autorizados y no hay incidencias.
- Nivel permanente de cuenta **11+**. Dinero real: restricción inicial **propuesta** de 18+ y residencia España, pendiente de validación jurídica.
- Gratis, sin compras ni anuncios obligatorios; mejor resultado por jugador, calculado solo por backend. Tres premios, reparto previsto 50/30/20, céntimos enteros; fondo pendiente de decidir.
- Desempate por momento de verificación más antiguo; publicar reglas inmutables antes de abrir. Para justicia competitiva, proponer 10 intentos por edición (aún no fijado) y semillas/versiones controladas.
- Establecer por escrito: mínimo de participantes, tiempo para reclamaciones, descalificaciones, pagos fallidos, falta de tres elegibles, suspensión de edición y protocolo ante caídas.

## 3. CLI local listo para usar (no necesita npm install)

Requisitos: **Node.js 20+**. Ejecutar desde la raíz de un clon actualizado del repositorio oficial.

```powershell
# Mostrar 6 fines de semana teóricos desde una fecha:
node scripts/tournament-ops.mjs calendar --from 2026-11-22 --weeks 6

# Crear propuesta INACTIVA, sin premio anunciado:
node scripts/tournament-ops.mjs draft --friday 2026-11-27

# Si el presupuesto está estudiándose, preparar un importe SOLO INTERNO (100 € en céntimos):
node scripts/tournament-ops.mjs draft --friday 2026-12-04 --prize-cents 10000

# Validar un borrador guardado localmente:
node scripts/tournament-ops.mjs verify --file ops/drafts/FD-2026-11-27.json

# Generar cinco plantillas y checklist internos:
node scripts/tournament-ops.mjs preview --file ops/drafts/FD-2026-11-27.json
```

Salidas locales, **ignoradas por Git**:

- `ops/drafts/FD-AAAA-MM-DD.json`: propuesta de fechas, criterios e importe opcional; siempre `status: DRAFT`, `enabled: false`, `moneyEnabled: false` y todas las aprobaciones a `false`.
- `ops/previews/FD-AAAA-MM-DD/anuncio-borrador.txt`: cinco piezas **JUEVES / VIERNES / SÁBADO / DOMINGO / LUNES**, con avisos que impiden confundirlas con invitaciones reales.
- `ops/previews/FD-AAAA-MM-DD/public-preview.json`: vista de preparación, sin fondo, habilitación, emails ni resultados de jugadores.
- `ops/previews/FD-AAAA-MM-DD/checklist-operativa.md`: responsabilidades previas y fases hasta conciliación.

**Control de cambios:** `draft` no sobreescribe otro fichero existente; `preview` tampoco sobreescribe anuncios preparados previamente. No los subas a Pages. Si hay que cambiar un presupuesto, crea una nueva propuesta local en una edición futura, o rectifica el borrador tras revisión antes de anunciar; el backend futuro usará control de versiones/auditoría.

## 4. Contrato del futuro backend administrativo (NO implementado)

Todos los endpoints deberán exigir **sesión de personal** con MFA, RBAC, CSRF mitigado si usan cookies, idempotency key, rate limit, registro de auditoría en MongoDB y límites de tamaño. Las acciones sensibles nunca se invocarán desde un script alojado en GitHub Pages.

| Acción privada | Endpoint propuesto | Verificaciones obligatorias |
| --- | --- | --- |
| Crear edición | `POST /api/v1/admin/tournaments` | Operador autorizado, ID único, calendario, borrador y reglas versionadas. |
| Actualizar borrador | `PATCH /api/v1/admin/tournaments/:id` | Solo DRAFT; `If-Match`/versión optimista; historial de cambios. |
| Anunciar | `POST /api/v1/admin/tournaments/:id/announce` | Bases legales publicadas, fondo bloqueado, autorización y anticipo de presupuesto. |
| Abrir | `POST /api/v1/admin/tournaments/:id/open` | ANNOUNCED, reloj del servidor >= inicio y < cierre; antichet/identidad operativos. |
| Cerrar | `POST /api/v1/admin/tournaments/:id/close` | OPEN, reloj >= cierre, deshabilitar nuevas sesiones. |
| Congelar clasificación | `POST /api/v1/admin/tournaments/:id/freeze` | CLOSED, revisar todos los runs aceptados y disputas, snapshot inmutable. |
| Aprobar ganadores | `POST /api/v1/admin/tournaments/:id/approve-winners` | REVIEW, doble aprobación humana, tres ganadores elegibles únicos. |
| Conciliar pagos | `POST /api/v1/admin/tournaments/:id/reconcile` | PayPal por cada `payout_item_id`, comprobación repetible; nunca confundir batch con éxito individual. |
| Cancelar | `POST /api/v1/admin/tournaments/:id/cancel` | Política de causa/avisos; no borrar pruebas ni auditoría. |

Además, API pública solo lectura `GET /api/v1/tournaments/current`, `GET /api/v1/tournaments/:id/leaderboard` y `GET /api/v1/tournaments/:id/publications`. API autenticada de jugadores para elegibilidad/sesiones/envíos. El backend **reproduce determinísticamente partidas**: no acepta `score`, `level` o `verified=true` del cliente como fuente autoritativa.

### Máquina de estados recomendada

`DRAFT → ANNOUNCED → OPEN → CLOSED → REVIEW → PAID` (o `CANCELLED` conforme a bases).

El scheduler puede intentar las transiciones con Cron, pero la seguridad depende de comprobar `startsAt <= serverNow < closesAt` en **cada solicitud de puntuación**. Una ejecución tardía del cron no debe abrir puntuaciones fuera de ventana. Si hay controversias, mantener REVIEW y no marcar PAID.

### Modelo mínimo de datos e índices

- `accounts` (`userId`, nivel servidor, verificaciones, estado); `tournaments` (fechas UTC, zona, estado, reglas congeladas, fondo, versión, aprobación), `runs` (semilla autorizada, reglas, entradas y replay validado), `leaderboardBest` (único `(tournamentId,userId)`), `payouts` (único `(tournamentId,position)` y claves externas), `auditEvents` (append-only).
- Transacciones o bloqueo para clasificación final y distribución. `sender_batch_id`/`sender_item_id` más persistencia durable para evitar duplicaciones **también después de los 30 días** en que PayPal trata un batch ID como duplicado.
- Proteger `receiver` (email PayPal) y datos de identificación. Secretos solo como variables de entorno de Render; registros con datos personales redactados.

## 5. Protocolo operativo semanal, después de desplegar el backend

| Momento | Responsable | Acción y criterio de éxito |
| --- | --- | --- |
| Martes/miércoles | Producto + legal | Revisar reglas, territorio, importe y costes, antifraude y presupuesto. |
| Jueves | Operador + marketing | Publicar bases, premio realmente financiado y campaña solo si ANNOUNCED. |
| Viernes 00:00 | Backend | OPEN; validación de elegibilidad y partidas en servidor. |
| Sábado | Marketing | Publicar ranking **verificado** y aviso, nunca cuentas ni importes ficticios. |
| Domingo 20:00 | Marketing | Recordatorio de cierre sin forzar clics en anuncios. |
| Lunes 00:00 | Backend | CLOSED, freeze seguro sin aceptar resultados fuera de ventana. |
| Lunes | Revisión + finanzas | Investigar fraude, reclamaciones; enviar pagos solo si aprobados; informar estados individuales. |
| Tras cierre contable | Operador | Archivado y métricas: participantes, intentos, retención, gasto, ingresos publicitarios cobrados. |

No colocar un botón `ABRIR TORNEO` en la web pública: la habilitación la determina exclusivamente la API. La futura UI interna podrá mostrar vista previa, auditoría, checklist de aprobaciones, publicaciones y controles protegidos.

## 6. Anuncios de display

Lugares previstos: panel lateral de escritorio; Códice, ranking y cierre de partida en móvil. Siempre fuera del Canvas, fuera de controles de disparo, sin vídeos obligatorios ni refrescos programáticos. **No existe integración AdSense ni CMP en V39**. Necesario comprobar políticas, consentimiento y aprobación de dominio y cuenta antes de insertar scripts. Presupuesto de premios separado de ingresos de anuncios no cobrados.

## 7. Verificación local y publicación segura

```powershell
node --test tests/tournament-operations.test.mjs
node --test tests/tournament.test.mjs tests/paypal-payouts.test.mjs
python tests/validate_repo.py
```

`tests/tournament-operations.test.mjs` cubre cambios de horario de verano, fechas inválidas, céntimos, borradores inactivos y textos de promoción. La CI seguirá comprobando el juego en navegador. Ninguna prueba del CLI equivale a un test antifraude de servidor ni a una transferencia real.

**Para emitir un torneo de verdad aún falta la API.** Este documento es el contrato de trabajo para construirla sin confundir un borrador con una convocatoria legal.

## 8. Fuentes oficiales que el equipo debe revisar antes de producción

- PayPal, Payouts e idempotencia: https://developer.paypal.com/docs/payouts/standard/integrate-api/customize/
- PayPal, política de uso: https://www.paypal.com/uk/legalhub/paypal/acceptableuse-full (ver también condiciones aplicables a entidad española).
- Google AdSense, anuncios junto al juego: https://support.google.com/adsense/answer/2768340
- DGOJ, actividades reguladas: https://www.ordenacionjuego.es/preguntas-frecuentes/actividades-juego-reguladas-ley-132011-27-mayo-regulacion-juego
