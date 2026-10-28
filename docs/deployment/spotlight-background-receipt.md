# Spotlight en el fondo completo

Origen limpio: feat/spotlight-bet-cards, a686fe6, /Users/ramiro/.t3/projects/twitch-predict.feat-spotlight-bet-cards. Worktrunk creó fix/spotlight-card-background desde esa rama en /Users/ramiro/.t3/projects/twitch-predict.fix-spotlight-card-background. Se conservan ambos checkouts.

La aclaración del usuario pide el efecto en todo el fondo de las tarjetas. El gradiente pasa del pseudoelemento circular al background-image del contenedor, con una elipse que alcanza sus esquinas. Intensidad base 12%, puntero 28% y foco 22%; en táctil conserva el fondo estático. Se mantiene el borde sin interceptar controles. Movimiento reducido elimina el seguimiento y forced-colors elimina el gradiente.

npm run check aprobado: typecheck, lint, 51 pruebas locales y build. E2E locales: Spotlight y réplica Byte/MV3 aprobados. El primer intento detectó que el foco del campo prevalecía sobre hover; se corrigió el orden CSS y ambos E2E pasaron. La prueba ahora comprueba el background-image real del artículo en reposo y con puntero, además de importe, foco y overflow a 320/768/1440. Capturas y primer fallo conservados en artifacts/spotlight-background.

Publicado en https://plot-devnet.vercel.app mediante Vercel archive=tgz. E2E Spotlight aprobado también sobre HTTPS, usando un mercado interceptado sin escrituras públicas. Se preservó el APK. Archivos de extensión instalados como 0.11.2 en /Users/ramiro/Applications/Plot/extension, con copia anterior en backups; se pulsó Volver a cargar en Chrome. Se abrió el panel público desde Abrir panel: el usuario tenía abierto antes el panel local antiguo. No se firmaron transacciones.

Logs en /tmp/plot-glow-bg-*.log. Checkout conservado para revisión.
