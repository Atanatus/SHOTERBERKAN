# FrutiDry — PayPal Payouts · V38

**Estado: PROPUESTA IMPLEMENTADA COMO BORRADOR, SIN TRANSFERENCIAS.** El repo contiene solo una función de preparación y pruebas. No hay una cuenta PayPal Business, conexión Payouts, usuarios reales, identificaciones, backend desplegado ni dinero configurado. No exponer correos ni credenciales desde GitHub Pages.

## Elección y límites

- Medio propuesto: **PayPal Payouts** (no PayPal Checkout, que sirve principalmente para **cobrar**). El organizador envía los tres premios a correos de PayPal facilitados por los premiados. El ganador no necesita introducir una cuenta bancaria en la web.
- No es universal: disponibilidad por país y estado de cuenta; el organizador necesita cuenta Business con acceso a Payouts y saldo para premios **y comisiones**. Evitar prometer pago el lunes sin reserva para revisión, restricciones y devoluciones.
- **Revisión legal y autorización del proveedor previas**. PayPal clasifica como actividades sensibles ciertas competiciones y juegos con premio (en particular con cuotas de inscripción). FrutiDry será gratuito, pero no se presume que eso implique aprobación automática para operar. Verificar en España y obtener confirmación aplicable al modelo real. También habrá que cumplir obligaciones fiscales y normas de concursos.
- Recomendación de lanzamiento: residentes en España, 18+, EUR. La elegibilidad al torneo es desde **nivel de cuenta 11**, independiente del nivel local de las figuras. La edad y la residencia se comprueban por mecanismos autorizados; jamás por una casilla del navegador.

## Lógica V38 (puramente local/servidor)

El módulo `server/paypal-payouts.mjs` **no llama a PayPal ni guarda pagos**.

1. Exige edición cerrada y en revisión (`REVIEW`), clasificación congelada, fondo confirmado, revisión de legalidad, autorización expresa del organizador y habilitación del proveedor.
2. Valida exactamente tres premiados únicos, en posiciones 1, 2 y 3; perfiles verificados 11+, adultos, ES y no suspendidos; email destinatario confirmado.
3. Calcula importes enteros en céntimos con la regla provisional 50/30/20; solo al final traduce a texto decimal `EUR`, sin `float` para cálculos de dinero.
4. Prepara `sender_batch_id` **determinista por edición** y `sender_item_id` **determinista por premio**, junto con un `snapshotHash` privado para comprobar que nadie cambia email o importes en un segundo intento. Usar `purpose: PRIZES`.
5. La proyección pública solo devuelve posición e importes; nunca email, identificadores internos, hashes ni referencias de transacción.

Ejecutar `node --test tests/paypal-payouts.test.mjs` para los casos de rechazo, determinismo, importes y estados. **V38 no tiene botón de enviar**, incluso en Sandbox.

## Camino a pagos reales (no implementado)

Backend protegido en Render (Node.js sin frameworks) + MongoDB Atlas. PayPal REST **solo desde servidor**, con secretos en variables del entorno. No se puede ejecutar el pago desde `index.html` ni desde el navegador del jugador.

- `accounts`: titular de cuenta, nivel, bloqueos; verificación de edad/territorio mediante proveedor idóneo.
- `tournaments`: edición, reglas congeladas, semilla, financiación, presupuesto y estado.
- `leaderboardBest`: clasificación verificada por simulación autoritativa y revisión de los finalistas.
- `payouts`: registro con `unique(editionId, position)` y `unique(senderBatchId)`; snapshot inmutable, moneda, céntimos, email destinatario **cifrado o protegido**, estado, aprobación dual, auditoría y referencias PayPal. Nunca guardar el destinatario en logs públicos ni en un diagnóstico de juego.
- `payoutEvents`: eventos idempotentes; verificar criptográficamente los webhooks mediante la API/servicio de PayPal y reconciliar contra los IDs, importes y destinatarios originales.

Proceso futuro: **validar resultados → resolver reclamaciones → congelar ranking → verificar tres ganadores → reservar fondo → aprobar lote → guardar snapshot atómicamente → enviar lote → recuperar `payout_batch_id` → consultar cada item → reconciliar → informar del resultado**. El cierre del lunes no implica que PayPal haya acreditado los tres pagos al instante.

**Idempotencia:** la protección de `sender_batch_id` de PayPal cubre reutilizaciones en una ventana de **30 días**. No sustituye una restricción única y duradera en la base de datos. Ante timeout, no generar un nuevo ID; consultar el lote existente antes de reintentar. Si cambia un ganador/destinatario, nunca reemitir silenciosamente: abrir incidente auditado y un proceso separado de corrección con autorización expresa.

**Estados:** PayPal usa `SUCCESS`, `PENDING`, `UNCLAIMED`, `ONHOLD`, `FAILED`, `RETURNED`, `BLOCKED`, `REFUNDED`, `REVERSED`. Solo un `SUCCESS` confirmado del **item** significa premio abonado. El webhook de lote completado no acredita los tres items. Un reverso posterior obliga a actualizar la contabilidad.

**Seguridad de operaciones reales:** separar cuenta de administrador y ejecutor de pagos, MFA y control dual, límite de importe y presupuesto, protección CSRF/autenticación/autorización, límite de llamadas, idempotencia por transacción y un interruptor de apagado. En ningún caso confiar en `approvedByOperator` u otros valores si los envía un jugador: solo deben cargarse de documentos firmados o aprobaciones de base de datos del servidor. Sandbox para pruebas de integración; **Live deshabilitado hasta cumplir todos los requisitos**.

## Documentación oficial consultada (22-11-2026)

- API REST Payouts, payload e identificadores: https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/create_payout_request/
- Idempotencia de lote 30 días: https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/sender_batch_header/
- Estados individuales: https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/transaction_enum/
- Webhooks y estados de items: https://developer.paypal.com/payouts/webhooks/
- Condiciones España: https://www.paypal.com/es/legalhub/paypal/acceptableuse-full?locale.x=es_ES
- Envío de premios a varios receptores: https://developer.paypal.com/payouts/overview/
- Costes/países: https://developer.paypal.com/payouts/fees/
