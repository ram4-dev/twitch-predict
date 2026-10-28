# Canales abiertos y buscador de la extensión

Worktrunk creó feat/open-channel-search-release desde fix/spotlight-behind-cards (a676ca0), limpio, en /Users/ramiro/.t3/projects/twitch-predict.feat-open-channel-search-release. Se integró origin/main (918d8f3) conservando su reconciliación de predicciones, resolución liquid glass y PnL. Los conflictos de bundles se resolvieron regenerándolos; los de fuente conservaron la configuración cloud, búsquedas y cambios de main. Se mantienen los checkouts previos.

Se elimina la restricción de canales de la ruta cloud de seguimiento. Se sigue exigiendo una sesión de wallet y un nombre válido; el worker conserva la responsabilidad de crear y resolver réplicas. PLOT_CHANNELS queda como lista inicial, no como permiso. Esta decisión del usuario sustituye el límite del piloto descrito en vercel-plan.md y cloud-work-receipt.md.

La extensión 0.12.0 reemplaza el select por ExpandableSearchBar, el mismo componente del panel. Acepta usuario, @usuario y enlaces canónicos de Twitch, muestra el canal activo y consulta sus mercados. El buscador se monta antes de esperar al backend; las actualizaciones no borran el texto mientras se escribe. Escape y X cierran la búsqueda conservando el canal elegido. El ancho nativo sigue siendo 700 × 600 px.

La prueba SQL real verifica alta fuera de la lista inicial, normalización, deduplicación concurrente, rechazo sin sesión, rechazo de URLs en el backend y ausencia de permiso de operador. La prueba E2E de extensión busca un canal nuevo por URL, valida URL extranjera, replica una sola vez sin abrir Twitch, verifica separación texto/X, teclado y reduced motion.

El primer full E2E encontró dos problemas: un ajuste CSS compacto alteraba el ancho nativo a 270 px y un helper consultaba count antes del montaje de React. Se retiró ese ajuste y el helper espera el botón con el locator normal. No se aumentaron timeouts ni se modificaron las aserciones de ancho. Primeros fallos conservados en artifacts/release/first-e2e y /tmp/plot-release-*.log.

Se incluyen en el PR la app Expo y el despliegue cloud que estaban en las ramas anteriores. La verificación Android previa y sus límites siguen documentados: falta validación física de Seeker/Phantom y no se atribuye a esta entrega una apuesta nueva en cadena real. El APK existente se preserva. Sin wallet operadora configurada, las operaciones manuales siguen bloqueadas.

Validación final: npm run check con PostgreSQL local real, 59 pruebas aprobadas y ninguna omitida; typecheck, lint y build aprobados. Checks de Expo aprobados. Suite E2E completa: 42 aprobados y 7 omitidos (modo Byte separado, cloud opt-in y modos de cadena legacy). Los casos de resolución incorporados desde main se incluyen en esa suite. El servidor PostgreSQL temporal es exclusivo de esta tarea y no contiene datos cloud.
