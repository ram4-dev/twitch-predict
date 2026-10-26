# plot: componentes e integración visual

## Worktree

- Repositorio fuente: `/Users/ramiro/.t3/projects/twitch-predict`, rama `main`, commit `421296bc17a6f6d0d3c27dc8a1e311b397f828aa`.
- Base de implementación: `feat/settlement-consoles`, commit `ebe56e1f8b73fc261a747885bb2b8e4da3d186a3`.
- Rama de este cambio: `feat/plot-design-system`.
- Worktree: `/Users/ramiro/.t3/worktrees/twitch-predict/feat-plot-design-system`.
- Estado: conservado para revisión, sin merge. Los cambios ajenos del worktree fuente no se copiaron.

## Identidad aplicada

Fraunces 800, nombre en minúscula y O con desenlace abierto. Camaleón naranja con expresiones de duda, observación y sorpresa. Papel `#fff4dd`, tinta `#232039`, naranja `#ff7049` y lima `#d4ed66`. Inter conserva el trabajo de lectura, controles y cifras. Los títulos usan Fraunces 700.

Se mantuvo la dirección elegida por el usuario, sin sortear otra dirección visual. La excepción `palette-cream` del inspector corresponde a esa elección. La biblioteca de componentes sigue el apartado de componentes de taste-skill y omite el sorteo de layouts.

Fuentes locales, sin consultas a servicios de fuentes durante el uso. Fraunces completa proviene de `https://github.com/google/fonts/tree/main/ofl/fraunces`, archivo `Fraunces[SOFT,WONK,opsz,wght].ttf`, con licencia OFL adjunta. Inter y su licencia ya pertenecían al proyecto. El camaleón procede del estudio de marca generado con IA en esta conversación; el original se conserva en el checkout fuente.

## Catálogo

Ruta `/components.html`, enlace Componentes en el panel. Cuatro vistas:

- Botones y campos: seis variantes, tamaños, icono, carga, deshabilitado, validación y select.
- Mercados: tarjeta real compartida, cantidad editable, cantidades rápidas, opciones, distribución, participación y fases abierto/cerrado/resuelto/anulado.
- Estados: mensajes informativos, éxito, error y espera; estados del mercado; vacío; esqueleto de carga.
- Identidad: logo, tipografía, paleta y tres expresiones del camaleón.

También incluye selector segmentado, saldo y confirmación con diálogo nativo (Escape, foco contenido y retorno al activador). Los importes y el mercado de Margit son ejemplos explícitos. El catálogo no llama al backend ni firma operaciones.

## Archivos principales

- `src/ui/components/{button,input,badge,plot}.tsx`: primitivas y componentes compartidos.
- `src/ui/plot.css`: tokens, marca y estilos compartidos, incluidos en `theme.css`.
- `src/ui/catalog.tsx`, `public/components.html`, `public/catalog.css`: catálogo.
- `src/ui/points-ui.tsx`: tarjeta compartida; reutiliza las raíces React por mercado en cada consulta para no desmontar un input mientras se edita. Solo se eliminan las tarjetas que desaparecen.
- `public/{index.html,app.js,style.css}`: panel e integración del vacío compartido.
- `src/ui/onboarding.tsx`, `public/onboarding.css`: acceso con Phantom.
- `extension/{popup.html,popup.css,manifest.json}`: extensión y nombre plot.
- `scripts/build.ts`: compila el catálogo y copia fuentes/mascota a la extensión. Los bundles y CSS generados se incluyen como en el repositorio original.
- `tests/design-system.e2e.ts`: catálogo, teclado, primera visita y tamaños 320/390/768/1440.
- `tests/points.e2e.ts`: refuerza el caso de editar 250 pts, actualizar Twitch y apostar conservando esos 250 pts.

## Validación final

2026-10-25:

- `npm run check`: typecheck y ESLint sin errores; 22 pruebas pasan; build completo.
- `APP_URL=http://twitch-predict.localhost:1362 npm run test:e2e`: 11 pasan, 4 omitidas por corresponder al prototipo Solana optativo. Se verificó el modo de puntos actual, con Phantom, dos cuentas, apuestas, liquidación, reembolso, persistencia y popup MV3 nativo de 700 px.
- `git diff --check`: sin errores.
- Lint visual: 0 FAIL, 0 WARN.
- Inspector en 1440/768/390, sobre bundles de producción: 0 FAIL en catálogo y panel. Catálogo: un WARN por alturas distintas de especímenes independientes; se conservan alturas naturales para evitar espacio artificial. Panel vacío: un WARN por espacio posterior al contenido; no se inventan mercados para llenar la pantalla.
- Catálogo probado en 320/390/768/1440, movimiento reducido, sin desbordamiento horizontal y sin solicitudes POST.
- Revisión de capturas: pregunta, opciones y cifras legibles; campos y botones conservan foco visible; marca y mascota presentes; ninguna cifra se presenta como dinero real.

## Revisión visual

Pregunta principal del catálogo: qué componente usar y cómo responde. Pregunta principal del panel: qué mercado está disponible en esta comunidad. Firma visual: el desenlace abierto del logo y el camaleón que observa o reacciona.

Comparación: antes, Inter en negro/blanco; después, Fraunces + Inter sobre papel, con las superficies y controles elegidos. El inspector pasó de 47% a 33% de vacío en la primera pantalla del panel sin mercados. Se mantienen datos reales en las pantallas y datos ilustrativos identificados en el catálogo.

Crítica final: identidad reconocible; lectura clara en móvil; cifras tabulares y sumas del ejemplo coherentes (750 + 450 = 1.200; 62,5% + 37,5% = 100%). Limitación: el catálogo muestra especímenes de distinta longitud, no filas homogéneas de datos; la pantalla sin mercados conserva espacio libre. No se hizo una evaluación externa ni se asignaron puntuaciones de terceros.

## Retomar

Servidor de revisión: `http://twitch-predict.localhost:1360/components.html`, Portless con estado aislado `/tmp/plot-ui-proxy`, datos `/tmp/plot-ui-data`. Para iniciarlo:

```sh
PORTLESS_STATE_DIR=/tmp/plot-ui-proxy PORTLESS_PORT=1360 PORTLESS_HTTPS=0 DATA_DIR=/tmp/plot-ui-data portless twitch-predict npm start
```

Los E2E se ejecutaron en otro proxy y datos temporales, con la fuente de Twitch del fixture del proyecto. El puerto habitual de tests 1358 estaba ocupado por otro trabajo; no se tocó ese proceso.

No hay cambios al backend de pagos, ni integración nueva de USDC en este cambio de UI.
