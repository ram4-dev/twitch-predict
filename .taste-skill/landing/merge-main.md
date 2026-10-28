# Integración con main

PR #39: https://github.com/ram4-dev/twitch-predict/pull/39
Solicitud explícita: mergear a main.
Rama: feat/short-landing, worktree /Users/ramiro/.t3/projects/twitch-predict.feat-short-landing. Head previo b2d20e8; base remota incorporada 69f4fb8.

Conflictos resueltos: .gitignore conserva todos los ignores de main y el directorio de screenshots de la landing; eslint conserva todos los bundles de main y landing.js; offchain-server conserva SSE, canal search y constructores actuales y agrega Waitlist. Las animaciones y fondos quedan con las versiones más recientes de main, sin downgrade.

Compatibilidad cloud necesaria: la web de main es estática en Vercel y la API vive en Railway. Se agregaron rewrites de /landing y /waitlist, la política de referrer de la landing para formularios nativos, y POST /api/waitlist en cloudApp. Waitlist usa Documents de PostgreSQL para altas atómicas con deduplicación entre instancias; modo local mantiene archivo. El endpoint cloud tiene la misma validación y respuestas genéricas y un límite de inscripciones por minuto. No expone emails por GET. Sin migración de esquema: usa los documentos privados existentes.

Dependencias instaladas en este worktree con npm ci, reemplazando únicamente su symlink de node_modules. No se modificó el node_modules del checkout de origen. PostgreSQL 16 local temporal en /tmp/plot-landing-merge-pg, puerto fijo 55439 requerido por PostgreSQL para pruebas; sin credenciales ni servicios externos.

Check integrado: typecheck, lint, 85 tests unitarios/integración y build pasaron. PLOT_STAGING_DATABASE_URL apuntó sólo a la instancia temporal local; cloud.test.ts corrió con PostgreSQL real, incluyendo alta pública, duplicados concurrentes, lectura desde otra instancia, validación, origen ajeno rechazado, POST nativo y rate limit.

La primera E2E se inició antes de completar el build y leyó bundles anteriores/app-config aún no generado. Se detuvo; no se editaron ni debilitaron esas pruebas. La ejecución final se inició después de completar el build, con todos los assets actuales.

La suite integrada encontró dos desajustes de pruebas ya presentes en main: content-security-policy asumía un Paper Shader ambiental que el header actual ya no monta; ahora enfoca un botón metálico real antes de comprobar el stylesheet y conserva las pruebas de CSP y de rechazo de estilos inline. expandable-search medía límites durante la transición de apertura; ahora expect.poll espera la misma condición geométrica final, sin aumentar timeouts ni cambiar lógica de producción. No se agregaron mocks ni se redujeron aserciones.
La ejecución que encontró esos casos terminó con 57 passed / 2 failed / 14 skipped; se conserva /tmp/plot-landing-merge-e2e-final.log. Se repite la suite completa con los dos ajustes de prueba.

Verificación final después de los ajustes: typecheck y lint pasaron; 85 tests con PostgreSQL real y build pasaron; suite E2E completa 59 passed / 14 skipped, sin fallos, en 2.8 minutos. Los skips requieren E2E_MARKET_MODE=byte, MARKET_MODE=solana o PLOT_CLOUD_URL (validación optativa contra despliegue HTTPS). No se probó un despliegue remoto desde esta ejecución.
