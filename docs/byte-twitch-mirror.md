# Predicciones de Twitch en Byte

El modo Byte ahora detecta las predicciones del canal de Twitch y crea sus réplicas en SOL devnet. La versión 0.7.0 de la extensión registra el canal abierto con el servidor; también se puede seguir un canal desde el panel. La consulta a Twitch y la creación se realizan en el backend, con la credencial partner del servidor. El popup filtra los mercados por canal y muestra la predicción original y un motivo cuando no pudo replicarse.

Cada par canal/ID de predicción conserva su solicitud de creación y su mercado en byte-twitch.json. Se evita repetir la creación por polling, reinicio o una respuesta incierta. La asignación del ganador usa los IDs de las opciones originales, no su posición en respuestas posteriores. El servidor continúa verificando los IDs después de que desaparecen de la lista de eventos activos, incluso sin pestañas de Twitch abiertas.

Byte exige una ventana de al menos 60 segundos. Se reservan además 20 segundos del timeout de creación: las predicciones sin esa ventana disponible no se replican ni se extienden. Si la creación excede el cierre de Twitch, el mercado se anula. Si Twitch bloquea o termina antes del cierre en cadena, se anula para evitar que sigan entrando apuestas por esa vía. Si Twitch resuelve después del cierre, se usa su ganador verificado. Los mercados manuales conservan resolución manual; las réplicas rechazan una resolución manual que contradiga su fuente.

La UI y la verificación previa a firmar deshabilitan apuestas cuando la fuente dejó de estar activa o lleva más de 30 segundos sin verificación. Las apuestas cierran según la ventana en cadena. La extensión no altera ni muestra apuestas propias dentro del widget nativo de puntos de Twitch: los mercados de Plot se ven en su popup y panel.

## Verificación y recibo

Origen: main 2f95358 en /Users/ramiro/.t3/projects/twitch-predict. Worktree creado con Worktrunk: /Users/ramiro/.t3/projects/twitch-predict.feat-byte-twitch-mirror, rama feat/byte-twitch-mirror. Se preserva el worktree y output del checkout principal.

La investigación en eggsterr encontró la predicción nativa EVEN OR ODD KILLS, con EVENNNNZ :D y ODDSTERR :O. El único mercado Byte existente era una prueba cerrada de plot_devnet_test, no una réplica de eggsterr. El background de modo Byte únicamente listaba mercados y omitía la detección de Twitch. Posteriormente, la consulta real de Twitch devolvió cero eventos activos para eggsterr; no se abrió artificialmente una apuesta sobre una predicción que ya había cerrado.

npm run check aprobó typecheck, lint, 44 pruebas unitarias y build. Las nuevas pruebas cubren idempotencia y reinicio, mapeo por IDs con opciones reordenadas, ventana insuficiente, cierre anticipado, rechazo de override manual y creación incierta sin duplicación.

La E2E dedicada se ejecuta con E2E_MARKET_MODE=byte npx playwright test tests/byte-mirror.e2e.ts. Aprobó con un servidor real en modo Byte, MV3 cargada y fixtures upstream: apertura de Twitch, creación de una sola réplica, opciones en el popup, ningún mercado offchain paralelo, resolución después de cerrar las pestañas y rechazo de una ventana corta. No se hizo una apuesta de la wallet personal ni se usó mainnet.

La regresión general dio 33 aprobados, 1 fallo del popup nativo y 5 omitidos (cuatro legacy y la prueba Byte dedicada, ejecutada aparte). El popup se cerraba porque la pestaña de instalación robaba el foco; se aisló su servidor y se esperó esa pestaña antes de abrirlo. La repetición de sus dos pruebas aprobó. En total se verificaron 35 E2E activos entre ambos modos, además de los 44 unitarios; no se presenta la corrida fallida como aprobada.
