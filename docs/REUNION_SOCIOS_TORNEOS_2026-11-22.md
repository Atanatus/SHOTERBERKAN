# FrutiDry · Informe para socios — 22 de noviembre de 2026

**Objetivo de producto:** convertir FrutiDry en un arcade web con torneos de fin de semana, clasificación verificable, tres premios monetarios y anuncios gráficos no intrusivos.

## Qué existe hoy (comprobado en GitHub)

- **V38**, rama `main`, commit `ea015999c77f3d5f81f550e976bac8edf17f6ea7`: GitHub Actions (pruebas estáticas y de navegador) y Pages terminados correctamente.
- Juego local, estética Astral Sanctuary, BERKAN y doce reliquias, motor con replay de diagnóstico, recuperación de progreso y pruebas automatizadas.
- Sección **TORNEO** informativa, calendario de Madrid y podio vacío; **ningún torneo abierto** ni ranking de jugadores reales.
- Módulo de cálculo de tres pagos **PayPal Payouts** como borrador puro, sin API, claves, cuentas ni transferencias.
- V39 propuesta: herramienta interna para generar borradores de edición, calendario, anuncios y checklist. **No es un panel administrativo ni permite abrir torneos reales**.

## Calendario de referencia

| Momento | Actuación prevista |
| --- | --- |
| Jueves | Promoción de la próxima edición, *solo si ya está aprobada y convocada*. |
| Viernes 00:00 | Inicio de puntuaciones elegibles. |
| Sábado | Ranking y recordatorio, con puntuaciones verificadas. |
| Domingo 23:59:59 | Último segundo de participación. |
| Lunes 00:00 | Cierre exclusivo de la edición; comienza revisión. |
| Lunes | Congelación del ranking, adjudicación y pago objetivo si no hay incidencias. |

Reloj oficial: **`Europe/Madrid`**, incluyendo horario de verano. La hora real de apertura y cierre la impone el **servidor**, nunca el ordenador del participante. El siguiente fin de semana del calendario es **27–29 de noviembre de 2026**, con lunes 30 para revisión; no implica que esa edición esté convocada.

## Reglas de producto

| Apartado | Diseño previsto |
| --- | --- |
| Acceso | Cuenta de **nivel permanente 11 o superior**, separada de los niveles de gemas. |
| Precio por competir | Gratis; sin compras ni publicidad obligatoria. |
| Ganadores | Tres primeros de la clasificación validada. |
| Métrica | Mejor puntuación **verificada por el servidor** durante esa edición. |
| Desempate | Primera fecha de verificación de la mejor puntuación; regla publicada antes de la apertura. |
| Modalidad | Reglas y semillas controladas por el servidor, sin potenciadores de pago. |
| Premios | Euros mediante PayPal Payouts tras revisión. |
| Porcentajes | **50 % / 30 % / 20 %**, **propuesta** configurable antes de anunciar. |
| Importe del fondo | **Sin decidir**; se publica solo después de confirmar financiación suficiente. |
| Edad/territorio | Lanzamiento con dinero **propuesto** para mayores de 18 años residentes en España, pendiente de revisión jurídica. |
| Intentos | Propuesta inicial: **10 intentos clasificados por edición**; práctica libre sin premio. Necesita decisión y pruebas de equilibrio. |

### Transparencia de pagos

La empresa financia por adelantado el fondo comprometido, reserva impuestos y comisiones, y registra cada puesto individualmente. El lunes es el **día objetivo** de entrega; incidencias, reclamaciones o revisiones pueden retrasar un pago. No se anunciará como *pagado* hasta que PayPal confirme la transferencia individual.

## Publicidad sin interrupciones

- Banners de display integrados fuera del Canvas: lateral de escritorio; Códice, clasificación o final de partida en móvil.
- No vídeos obligatorios, interstitial, superposiciones ni banners al lado del disparador.
- Sin incentivos por clicar, sin publicidad para obtener intentos o entrar al torneo.
- Requisitos antes de activar: aprobación publicitaria, política de privacidad, consentimiento/cookies cuando proceda y configuración de CMP para el EEE.
- **Los premios no dependen de los ingresos publicitarios de la semana**: fondo fijado y disponible antes del anuncio.

## Qué falta antes de abrir dinero real

1. Cuentas/autenticación, verificación de edad/residencia y nivel permanente protegido por servidor.
2. Backend REST en Render con MongoDB Atlas y roles administrativos; ningún control sensible en GitHub Pages.
3. Validación autoritativa de partidas, detección de trampas y ranking de mejores resultados.
4. Política y bases revisadas: fraude, apelaciones, empate, número mínimo de participantes, premios no reclamados, impuestos y restricciones territoriales.
5. Aprobación jurídica del modelo de concurso, permiso aplicable de PayPal, presupuesto y tesorería.
6. Sistema de publicación/convocatorias auditado; gestión individual de PayPal Payouts con idempotencia duradera.
7. Aprobación de AdSense y sistema de consentimiento aplicable.

**Decisión para la reunión:** aprobar el calendario y el modelo de plataforma; definir presupuesto por fin de semana, número de intentos, titular legal de la organización y responsable que aprueba cada edición. No anunciar fecha de lanzamiento ni importes hasta superar los controles anteriores.

**Fuente de verdad:** https://github.com/Atanatus/SHOTERBERKAN — rama `main`.
