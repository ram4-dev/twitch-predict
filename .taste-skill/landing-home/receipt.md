# Landing como página principal

Solicitud: pasar la landing de /landing a /.
Repositorio origen: /Users/ramiro/.t3/projects/twitch-predict.feat-short-landing, sin cambios pendientes. Base actualizada origin/main abb683b366d06ee7ff2bc35f4c5d2c503da4994e.
Worktrunk creó feat/landing-home en /Users/ramiro/.t3/projects/twitch-predict.feat-landing-home desde origin/main. Dependencias compartidas por symlink hacia el worktree previo; no se modificaron dependencias ni lockfile.

Rutas: / muestra landing y waitlist; /app muestra app; /byte continúa como alias. /landing sigue disponible. En Vercel dist/web/index.html ahora contiene la landing y app.html contiene la app Byte; rewrites /app y /byte apuntan a app.html. El servidor local sirve su app de puntos o Byte en /app según el modo. La raíz tiene Referrer-Policy:same-origin para el envío HTML nativo de waitlist.

Retornos actualizados: login Phantom, callback OAuth Twitch (local y cloud), accesos de extensión a panel e historial, catálogo, launcher Chrome y final de onboarding de streamer. Los bookmarks antiguos /#markets, /#history, /#streamer, /#channels y queries conocidas de app redirigen a /app conservando búsqueda y hash; /#waitlist permanece en landing. Los tests existentes que navegaban al panel usan /app; los del prototipo Solana conservan su raíz optativa.

Sin rediseño ni cambio de copy de la landing. Formulario, marca y animación se mantienen. Datos de prueba de predicción siguen identificados como simulación.

Checks: typecheck, lint y build pasaron con npm run check. 85 tests unitarios/integración pasaron con PostgreSQL 16 local temporal de la tarea anterior. Build estático verificado: index.html contiene landing-root y app.html contiene byte-ui.js; configuración Vercel apunta a los destinos correspondientes. Cuatro E2E de landing/rutas/waitlist contra el build de producción pasaron: alta, validación, error/reintento, envío sin JS desde /, responsive 320/390/768/1440, alias /landing, app en /app y compatibilidad de bookmarks. Verificación T3 en /: path /, título de landing, form presente y ausencia del panel #markets.
Preview activo: http://twitch-points-test.localhost:1356/ con DATA_DIR=/tmp/plot-landing-home-preview aislado. Worktree conservado.

La suite general inicial terminó 59 passed / 1 failed / 14 skipped: la prueba existente del halftone del catálogo perdió un pico de color entre polls y/o capturó un cuadro intermedio tras reduced motion. Componente de producción idéntico a main. Se conservan esos resultados en /tmp/plot-home-e2e.log y /tmp/plot-home-halftone-rerun.log. Se corrigió sólo la observación del test: captura pixels reales en cada requestAnimationFrame de la interacción y exige imagen de reposo real tras la actualización de media. Conserva assembling, pico de calor, settled y estabilidad en reduced motion; sin mocks ni aumento de timeouts. La repetición enfocada pasó. Se repite la suite completa.

Resultado final: typecheck y lint pasaron. Build pasó. 85 tests unitarios/integración con PostgreSQL real pasaron. Suite E2E general final: 60 passed / 14 skipped, sin fallos, en 2.7 minutos; cuatro E2E de producción enfocados también pasaron. Los skips son escenarios optativos de Byte, prototipo Solana y despliegue HTTPS que requieren E2E_MARKET_MODE, MARKET_MODE o PLOT_CLOUD_URL. PR de entrega: https://github.com/ram4-dev/twitch-predict/pull/41. El build Vercel de la rama pasó.
Durante el trabajo main avanzó a dda39ca (publicación de /pitch); GitHub declara el merge limpio y esas rutas se conservan al mergear.
