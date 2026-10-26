# Dia aplicada a web y extensión

Referencia: http://twitch-predict.localhost:1360/components.html#dia. Se reutilizaron los componentes y assets del worktree de diseño, sin modificarlo.

## Identidad del trabajo

- Repositorio: /Users/ramiro/.t3/projects/twitch-predict.
- Rama de origen: fix/remove-streamer-account.
- Commit de origen: e38a253da241c21a7c20f7933b04c8fe857a7993.
- Rama de implementación: feat/apply-dia-ux.
- Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-apply-dia-ux.
- Estado: conservado, sin merge. El servidor activo usa este worktree.

## Cambios

La página, el onboarding y el popup comparten la paleta negra, Fraunces, botones metálicos, bordes por opción y spotlight de las tarjetas. La cabecera incorpora el wordmark en puntos y el fondo dither. El movimiento se puede pausar y respeta la preferencia de movimiento reducido; los shaders se liberan al salir del botón y el fondo se detiene fuera de vista.

El popup mantiene 700 px de ancho. La cabecera y los indicadores se compactaron para mostrar el primer par de botones completo en los 600 px de alto de Chrome. Se conservan los flujos de Phantom, el importe editado durante una actualización, el seguimiento por @usuario y la resolución desde Twitch.

Las fuentes están en src/ui/components, src/ui/app-materials.css, src/ui/surfaces.tsx y src/ui/points-ui.tsx. Los layouts usan public y extension; scripts/build.ts genera y copia los assets compartidos y las licencias. La extensión lista para cargar está en extension.

## Validación

- Typecheck, ESLint, 31 pruebas y build: pasan.
- Suite E2E completa: 17 pasan; 4 del modo Solana optativo se omiten.
- Después de ajustar la cabecera: los cuatro E2E de Dia y popup pasan. La corrección final de separación del logo y pausa se verifica también en el caso de extensión.
- Una iteración intermedia falló porque los botones quedaban parcialmente cortados; se corrigió el espaciado, conservando la aserción de visibilidad completa.
- Capturas revisadas en 320, 390, 768 y 1440 px y en el popup de Chrome. Los casos comprueban teclado, shaders, movimiento reducido, geometría y apuestas.

## Servidor

La web está en https://twitch-predict.localhost:1357. Portless conserva la ruta HTTP 1356 y el proxy HTTPS 1357. Se mantiene el directorio de datos existente. El healthcheck responde correctamente y la vista del streamer sigue consultando los siete canales guardados.

No se instaló ni recargó una extensión en un perfil personal. La extensión compilada se probó en perfiles aislados de Chrome, incluido el popup nativo. La referencia de componentes en 1360 continúa en su servidor original.
