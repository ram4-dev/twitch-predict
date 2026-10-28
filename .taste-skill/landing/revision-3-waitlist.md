# Inscripción directa a la waitlist

Solicitud: un campo de texto en la landing que inscriba directamente. Se interpreta como email, sin wallet ni cuenta.
Continuación autorizada de feat/short-landing en /Users/ramiro/.t3/projects/twitch-predict.feat-short-landing. Base: ceee878041560d58b9d0b39b0e7fa50a6dba1f15, origen branding/plot-mascot. Se mantiene el worktree; sin commit, merge ni cambios al checkout raíz.

UI: label Sumate a la waitlist, un input type=email y botón Anotarme. Envío por Enter o botón, estado guardando, confirmación sólo después de escribir en servidor, validación nativa, error reintentable conservando email. Links de header/footer van al formulario. Sin JavaScript se envía como formulario HTML real y el servidor redirige a la confirmación.

Servidor: Waitlist carga y persiste email normalizado y createdAt en DATA_DIR/waitlist.json. Archivo privado 0600, escritura temporal + rename; cola de un único escritor para impedir pérdida en altas concurrentes; deduplicación por email. Estado en memoria se actualiza después de persistir. POST /api/waitlist para JSON y POST /waitlist para formulario nativo. Validación del servidor, error genérico si falla almacenamiento, sin endpoint de lectura pública ni devolución de email. Usa el directorio de datos ya persistente del servidor local. No manda correos: almacena las inscripciones para avisar al abrir acceso.

Archivos de esta revisión: src/waitlist.ts, src/offchain-server.ts, src/ui/landing.tsx, public/landing.html, public/landing.css, public/landing.js, public/waitlist-success.html, public/waitlist-error.html, tests/waitlist.test.ts, tests/landing.e2e.ts.

Checks: npm run check pasó, con 51 unitarios, typecheck, lint y build. Dos unitarios nuevos verifican concurrencia, normalización, duplicados, permisos, carga tras reinicio y conservación/recuperación después de un fallo real de escritura. E2E cubre validación, inscripción real, duplicado, origen ajeno rechazado, ausencia de GET público, error/reintento del formulario, reduced motion, responsive 320/390/768/1440 y envío nativo sin JS.

Inspector en build de producción: 0 FAIL / 2 WARN a 1440/768/390 con las mismas excepciones documentadas few-pictures y off-centre. Los seis renders finales abiertos y revisados. El formulario queda dentro del hero en móvil. Warnings no-footage y still-page intencionales: la animación de la marca sigue en canvas; no se agregó video externo. Lint visual 0 FAIL/0 WARN.

ROUND 1 (waitlist)
Seen in one second: Plot!, predicción y campo de email para entrar a lista de espera.
Idea (one sentence): la demostración de predicciones acompaña una inscripción de un solo campo.
Live thing: registro real con respuesta del servidor, además del ejemplo interactivo y marca globo.
Layout words by section: hero=split with inline form / how=compact explanation / footer=inline.
Scores: design 6.5 · usability 9 · creativity 7 · content 8 → overall 7.55.
Caps applied: sin cuatro fotografías por brevedad y estilo del producto.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. desktop-fold: CTA pendiente reemplazado por formulario operativo con campo visible.
2. mobile-fold: controles de 48px, email de 16px para evitar zoom; a 320px se apilan si falta espacio.
3. error state: conserva email y vuelve a habilitar envío; no muestra confirmación si falla persistencia.

Branding sin cambios desde revisión 2: fuente de arte y componentes feat/publish-pitch 2a3bdbb. Sin imágenes nuevas, créditos externos o redraw. Pregunta/números de la predicción siguen marcados como simulación.
Preview activo: http://twitch-points-test.localhost:1356/landing, servidor de producción con DATA_DIR=/tmp/plot-landing-preview. Bloqueo de destino de waitlist resuelto.

Corrección durante E2E: el envío nativo desde la landing HTTP recibía Origin:null por Referrer-Policy:no-referrer. /landing y /landing.html ahora envían Referrer-Policy:same-origin; el resto conserva la política anterior y el middleware sigue rechazando orígenes ajenos. El GET público no registrado recibe 401 del middleware de autenticación existente, no 404; el test verifica ese rechazo real.
Validación enfocada contra servidor de build final: 3 E2E passed, incluidas inscripción y reintento reales y envío sin JavaScript. Archivo de datos de preview confirmado con 2 inscripciones sintéticas y permisos 0600; no se imprimieron direcciones.
Suite completa final: 37 passed / 5 skipped en 1.8 minutos, sin fallos. Los skips son los cinco escenarios optativos de Byte mirror y el prototipo Solana ya documentados. Check completo pasó con 51 unitarios. Sin bloqueos pendientes.
