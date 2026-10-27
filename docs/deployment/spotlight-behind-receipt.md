# Spotlight detrás de las tarjetas

Worktrunk: origen fix/spotlight-card-background, 309cd90, limpio; nueva rama fix/spotlight-behind-cards y checkout /Users/ramiro/.t3/projects/twitch-predict.fix-spotlight-behind-cards. Los checkouts anteriores se conservan.

La aclaración del usuario pide restaurar las tarjetas y poner el efecto detrás. Se restauró spotlight-card.css de a686fe6 para las tarjetas. Se añadió GlowStage al contenedor de mercados y el mismo adaptador al contenedor predictions de la extensión. La capa difusa usa z-index -1 y pointer-events none, se extiende 12 px alrededor de la lista y no modifica el background-image de las tarjetas. El puntero actualiza ambas capas en sus respectivas coordenadas; el fondo queda estático con movimiento reducido o puntero táctil.

npm run check aprobado: typecheck, lint, 51 pruebas locales y build. E2E Spotlight y Byte/MV3 aprobados. La prueba ahora exige que el artículo no tenga gradiente de fondo y que la capa radial exista detrás en el contenedor. También comprueba importe, foco, movimiento reducido y ausencia de overflow a 320/768/1440. El primer intento no arrancó por un servidor E2E anterior aún en cierre; el reintento y la ejecución final tras difuminar el halo pasaron.

Publicado en https://plot-devnet.vercel.app. E2E aprobado sobre HTTPS público con mercado interceptado en el navegador. Se conservó el APK. Archivos de extensión 0.11.3 preparados en /Users/ramiro/Applications/Plot/extension, con respaldo previo. Se conservan los logs /tmp/plot-behind-*.log y capturas en artifacts/behind-cards, fuera de Git. No se enviaron apuestas reales.

Chrome confirmó versión 0.11.3 y aviso Recargada. Se cerró la pestaña de gestión abierta para esta actualización y se refrescó el panel público.
