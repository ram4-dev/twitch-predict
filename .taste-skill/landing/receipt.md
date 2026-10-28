# Landing de plot

Repositorio: /Users/ramiro/.t3/projects/twitch-predict
Rama de origen: branding/plot-mascot
Commit base: ceee878041560d58b9d0b39b0e7fa50a6dba1f15
Rama de trabajo: feat/short-landing
Worktree: /Users/ramiro/.t3/projects/twitch-predict.feat-short-landing
Estado: cambios conservados sin commit ni merge; servidor de preview activo con datos aislados en /tmp/plot-landing-preview. No se modificó el checkout de origen.
URL: http://twitch-points-test.localhost:1356/landing

Implementación: /landing, HTML con alternativa sin JavaScript, React con componentes compartidos PlotLogo/Scene/Button, estilos responsive, demo local sin API ni apuestas reales. CTA a la app actual. Build de landing agregado al pipeline existente; CSS generado del panel y extensión actualizado por Tailwind.
Archivos: public/landing.html, public/landing.css, public/landing.js, src/ui/landing.tsx, src/offchain-server.ts, scripts/build.ts, tests/landing.e2e.ts, public/points-ui.css, extension/points-ui.css, .gitignore y notas locales .taste-skill/landing.

Validación: npm run check completo (typecheck, lint, 49 unitarios, build). Suite E2E completa: 36 passed / 5 skipped. Los skips corresponden a un escenario exclusivo E2E_MARKET_MODE=byte y cuatro del prototipo MARKET_MODE=solana, desactivados por configuración en el modo offchain. Tras los ajustes finales de CSS: build y los 2 E2E de landing repetidos contra el servidor del build de producción, ambos passed. Sin overflow en 320, 390, 768 y 1440; teclado, reset, no POST, reduced motion y sin JS cubiertos. Lint de diseño: 0 FAIL / 0 WARN.

Dirección: The product performs, seed 2021821425. Sin redraw. Idea: las dos opciones de una predicción de plot son la introducción interactiva al producto. Se preservan fuentes locales, escena de partículas, fondo negro y bordes metálicos de la app.
Contenido de ejemplo: pregunta de próxima partida, pozo inicial de 1.000 puntos, saldo de 10.000 y entradas de 250. Son simulación visible, no datos en vivo ni prueba de actividad del producto. No usa fotografías, clips ni recursos externos nuevos; el gráfico es el propio wordmark animado y el ejemplo es HTML funcional. Sin créditos nuevos de imágenes.

ROUND 3
Seen in one second: predicciones de Twitch con dos opciones y acceso a la app.
Idea (one sentence): las opciones y el pozo de plot se convierten en una demostración que responde al visitante.
Live thing: elegir gana/pierde, actualizar reparto y saldo, reiniciar; partículas interactivas con pausa.
Layout words by section: hero=split app demonstration / how=compact explanation / footer=inline navigation.
Scores: design 6.5 · usability 9 · creativity 7 · content 8 → overall 7.55.
Caps applied: techo 6.5 de diseño por ausencia de cuatro fotografías; es deliberado por la brevedad pedida y el estilo de la app. El ejemplo de producto reemplaza las imágenes.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. desktop-fold: sombra del CTA eliminada; conserva borde metálico.
2. mobile-page-01: texto explicativo aumentado a 16px; notas de interfaz de 13px.
3. tablet-fold: demo más estrecha; título permite dos líneas y ambas opciones conservan áreas táctiles de 44px.
Limitaciones intencionales: animación sobria, sin video ajeno al producto; demo ilustrativa y no conectada al saldo real. Excepción few-pictures documentada; no se agregaron imágenes de relleno.

Inspector final contra build de producción: 0 FAIL / 2 WARN en 1440, 768 y 390; excepción few-pictures indicada explícitamente. Warnings no-footage y still-page defendidos por la escena propia en canvas y la animación sobria. Los seis renders finales (fold y página completa en cada viewport) fueron abiertos y revisados tras el último cambio.
