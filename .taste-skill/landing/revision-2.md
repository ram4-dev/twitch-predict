# Corrección de branding y CTA

Continuación autorizada de feat/short-landing en el worktree original de esta tarea; la referencia base continúa siendo ceee878041560d58b9d0b39b0e7fa50a6dba1f15. Checkout raíz sin modificaciones.

Causa: la rama branding/plot-mascot tiene los componentes anteriores. El branding actual está en feat/publish-pitch (2a3bdbb) y conserva la animación de feat-hover-balloon-background. Se copiaron sin modificación balloon-renderer.ts, balloon-wordmark.tsx, latex-atmosphere.tsx y plot-wordmark.jpg desde ese checkout. La landing los consume directamente, con recorte del arte original para header y footer. La app anterior sigue usando sus propios componentes, sin importar una rama entera ni sus cambios de lógica.

El arte es Plot! en volumen con signo naranja en forma de globo. El fondo usa el mismo signo y sigue el cursor. La opacidad de la capa de fondo se bajó a .4 en la landing para mantener la lectura. Reduced motion conserva la imagen original estática.

Los tres CTA dicen Entrar a la waitlist. Se solicitó por pregunta asíncrona confirmar texto y destino (enlace existente o formulario). No se encontró una waitlist existente en las fuentes consultadas. Hasta recibir ese destino los controles quedan deshabilitados, con Próximamente visible y title explicativo. No hay formulario falso ni se capturan datos.

ESLint ahora ignora public/landing.js como los demás bundles compilados; src/ui/landing.tsx y los tres componentes nuevos siguen bajo lint. La primera ejecución de check de esta revisión detectó esa omisión del trabajo anterior; corregida y check completo repetido correctamente.

Verificación final: npm run check (typecheck, lint, 49 unitarios y build) pasó. Dos E2E finales contra build de producción pasaron, incluidas ausencia de assets anteriores, render balloon, fondo cargado, tres logos nuevos, demo por teclado, sin POST, 320/390/768/1440 sin overflow, reduced motion, CTA pendiente deshabilitado y contenido sin JavaScript. El selector de texto de Playwright omite noscript, por lo que el caso sin JS verifica visibilidad y contenido del main de fallback directamente.

Inspector: 0 FAIL / 2 WARN en 1440, 768 y 390, con few-pictures y off-centre permitidos explícitamente. few-pictures es la excepción del brief corto de producto. off-centre es un falso positivo por las cajas de las imágenes recortadas: el wrapper mantiene padding simétrico y las seis capturas finales fueron revisadas. no-footage y still-page permanecen: no se añade video ajeno; el movimiento real ocurre en los canvas WebGL/2D y no entra en el contador CSS.

ROUND 2 (branding)
Seen in one second: Plot! con el globo naranja, predicción de dos lados y CTA a lista de espera.
Idea (one sentence): la marca inflable actual de Plot acompaña la demostración interactiva del pozo.
Live thing: letras con respuesta al puntero, fondo reactivo y simulación local con reset.
Layout words by section: hero=split demonstration / how=compact explanation / footer=inline.
Scores: design 6.5 · usability 7 · creativity 7 · content 8 → overall 6.95.
Caps applied: sin cuatro fotografías por decisión del brief; CTA no operativo hasta conocer destino.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. desktop-fold: marca anterior reemplazada por arte volumétrico y renderer globo originales.
2. mobile-fold: fondo puede competir con el texto; opacidad reducida a .4.
3. desktop/mobile: CTA actualizado, destino pendiente de respuesta; queda deshabilitado y marcado Próximamente.

Sin imágenes de terceros ni créditos externos nuevos. El wordmark es un asset propio ya existente. La predicción y números siguen identificados como simulación.
Estado: worktree y preview conservados, sin commit/merge. Preview: http://twitch-points-test.localhost:1356/landing

Auditoría de ejecución: una suite completa iniciada antes del cambio de los CTA conservó los títulos/tests anteriores y terminó 34 passed, 2 failed, 5 skipped. Los fallos correspondían a expectativas obsoletas de Abrir app y al cambio del título del test durante esa ejecución (Test not found in the worker process). Se conservan en /tmp/plot-landing-e2e-v2.log. Tras fijar código y tests, se ejecutó de nuevo la suite completa desde cero; registro final en /tmp/plot-landing-e2e-v2-final.log.
Resultado final de la suite completa repetida: 36 passed / 5 skipped, sin fallos. Los cinco escenarios omitidos son optativos de otros modos: uno Byte mirror y cuatro del prototipo Solana. No hay bloqueo de validación; sólo falta definir/conectar el destino de la waitlist.
